const router=require("express").Router();
const crypto=require("crypto");
const db=require("../db");
const auth=require("../middleware/auth");

async function calculateCart(items,client=db){
  if(!Array.isArray(items)||!items.length) throw Object.assign(new Error("Cart is empty"),{status:400});
  const ids=items.map(x=>x.product_id).filter(Boolean);
  const r=await client.query(`SELECT p.id,p.sku,p.name,p.selling_price,p.is_active,
    COALESCE(i.quantity,0) quantity,COALESCE(i.reserved_quantity,0) reserved_quantity
    FROM products p LEFT JOIN inventory i ON i.product_id=p.id
    WHERE p.id=ANY($1::uuid[])`,[ids]);
  const map=new Map(r.rows.map(x=>[x.id,x]));
  const lines=[];let subtotal=0;
  for(const item of items){
    const p=map.get(item.product_id),qty=parseInt(item.quantity);
    if(!p||!p.is_active) throw Object.assign(new Error("Product unavailable"),{status:400});
    if(!Number.isInteger(qty)||qty<1) throw Object.assign(new Error("Invalid quantity"),{status:400});
    const available=Number(p.quantity)-Number(p.reserved_quantity);
    if(qty>available) throw Object.assign(new Error(`Only ${available} available for ${p.name}`),{status:409});
    const price=Number(p.selling_price),line=price*qty; subtotal+=line;
    lines.push({product_id:p.id,name:p.name,sku:p.sku,quantity:qty,unit_price:price,line_total:line});
  }
  return {lines,subtotal};
}

router.post("/quote",auth(),async(req,res,next)=>{
  try{
    const {items,coupon_code}=req.body;
    const cart=await calculateCart(items);
    let discount=0,coupon=null;
    if(coupon_code){
      const r=await db.query(`SELECT * FROM coupons WHERE code=$1 AND is_active=true
        AND (expires_at IS NULL OR expires_at>NOW())`,[String(coupon_code).trim().toUpperCase()]);
      coupon=r.rows[0];
      if(!coupon)return res.status(400).json({error:"INVALID_COUPON",message:"Coupon is invalid or expired"});
      if(cart.subtotal<Number(coupon.min_order_value))
        return res.status(400).json({error:"MIN_ORDER_NOT_MET",message:`Minimum order value is ₹${coupon.min_order_value}`});
      discount=coupon.discount_type==="percent"
        ? cart.subtotal*Number(coupon.discount_value)/100
        : Number(coupon.discount_value);
      if(coupon.max_discount!==null)discount=Math.min(discount,Number(coupon.max_discount));
      discount=Math.min(discount,cart.subtotal);
    }
    const afterDiscount=cart.subtotal-discount;
    const delivery=afterDiscount>=499?0:40;
    const total=afterDiscount+delivery;
    res.json({items:cart.lines,subtotal:cart.subtotal,discount,delivery_fee:delivery,total,
      coupon:coupon?{code:coupon.code,discount_type:coupon.discount_type,discount_value:coupon.discount_value}:null});
  }catch(e){next(e)}
});

router.post("/create-order",auth(),async(req,res,next)=>{
  const client=await db.pool.connect();
  try{
    await client.query("BEGIN");
    const {items,coupon_code,payment_method="online"}=req.body;
    const cart=await calculateCart(items,client);
    let discount=0,coupon=null;
    if(coupon_code){
      const r=await client.query(`SELECT * FROM coupons WHERE code=$1 AND is_active=true
        AND (expires_at IS NULL OR expires_at>NOW()) FOR UPDATE`,[String(coupon_code).trim().toUpperCase()]);
      coupon=r.rows[0];
      if(!coupon)throw Object.assign(new Error("Coupon is invalid or expired"),{status:400});
      if(cart.subtotal<Number(coupon.min_order_value))throw Object.assign(new Error("Minimum order value not met"),{status:400});
      discount=coupon.discount_type==="percent"?cart.subtotal*Number(coupon.discount_value)/100:Number(coupon.discount_value);
      if(coupon.max_discount!==null)discount=Math.min(discount,Number(coupon.max_discount));
      discount=Math.min(discount,cart.subtotal);
    }
    const delivery=(cart.subtotal-discount)>=499?0:40,total=cart.subtotal-discount+delivery;
    const orderNo="SHYAM-"+Date.now().toString(36).toUpperCase()+"-"+crypto.randomInt(100,999);
    const o=await client.query(`INSERT INTO orders(order_number,user_id,status,subtotal,discount,delivery_fee,total)
      VALUES($1,$2,'pending',$3,$4,$5,$6) RETURNING *`,
      [orderNo,req.user.sub,cart.subtotal,discount,delivery,total]);
    for(const line of cart.lines){
      const lock=await client.query(`SELECT quantity,reserved_quantity FROM inventory WHERE product_id=$1 FOR UPDATE`,[line.product_id]);
      if(!lock.rows[0]||Number(lock.rows[0].quantity)-Number(lock.rows[0].reserved_quantity)<line.quantity)
        throw Object.assign(new Error(`Stock changed for ${line.name}. Please retry.`),{status:409});
      await client.query(`UPDATE inventory SET quantity=quantity-$1,updated_at=NOW() WHERE product_id=$2`,
        [line.quantity,line.product_id]);
      await client.query(`INSERT INTO order_items(order_id,product_id,product_name,sku,quantity,unit_price,line_total)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [o.rows[0].id,line.product_id,line.name,line.sku,line.quantity,line.unit_price,line.line_total]);
    }
    const p=await client.query(`INSERT INTO payments(order_id,method,status,amount,provider)
      VALUES($1,$2,'pending',$3,'pending_gateway') RETURNING *`,
      [o.rows[0].id,payment_method,total]);
    await client.query("COMMIT");
    res.status(201).json({order:o.rows[0],payment:p.rows[0],
      message:payment_method==="cod"?"Order placed for COD.":"Payment session created; gateway integration required for real payment."});
  }catch(e){
    await client.query("ROLLBACK").catch(()=>{});
    res.status(e.status||500).json({error:e.status===409?"CHECKOUT_CONFLICT":"CHECKOUT_FAILED",message:e.message});
  }finally{client.release()}
});

router.post("/verify-demo",auth(),async(req,res,next)=>{
  try{
    if(process.env.NODE_ENV==="production")return res.status(403).json({error:"DISABLED_IN_PRODUCTION"});
    const {payment_id}=req.body;
    const r=await db.query(`UPDATE payments SET status='paid',provider='demo_gateway'
      WHERE id=$1 RETURNING *`,[payment_id]);
    if(!r.rows[0])return res.status(404).json({error:"PAYMENT_NOT_FOUND"});
    await db.query(`UPDATE orders SET status='confirmed',updated_at=NOW() WHERE id=$1`,[r.rows[0].order_id]);
    res.json({verified:true,payment:r.rows[0]});
  }catch(e){next(e)}
});

router.post("/webhook",async(req,res,next)=>{
  try{
    // Production gateway must provide its own signature scheme.
    // This endpoint intentionally rejects unsigned requests until a gateway is configured.
    const signature=req.headers["x-shyam-signature"];
    if(!process.env.PAYMENT_WEBHOOK_SECRET || !signature)
      return res.status(401).json({error:"WEBHOOK_NOT_CONFIGURED"});
    const raw=JSON.stringify(req.body);
    const expected=crypto.createHmac("sha256",process.env.PAYMENT_WEBHOOK_SECRET).update(raw).digest("hex");
    if(!crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))
      return res.status(401).json({error:"INVALID_SIGNATURE"});
    const {payment_id,status}=req.body;
    const allowed=["pending","authorized","paid","failed","refunded"];
    if(!allowed.includes(status))return res.status(400).json({error:"INVALID_PAYMENT_STATUS"});
    const r=await db.query(`UPDATE payments SET status=$1,provider_payment_id=COALESCE($2,provider_payment_id)
      WHERE id=$3 RETURNING *`,[status,req.body.provider_payment_id||null,payment_id]);
    if(!r.rows[0])return res.status(404).json({error:"PAYMENT_NOT_FOUND"});
    if(status==="paid")await db.query(`UPDATE orders SET status='confirmed',updated_at=NOW() WHERE id=$1`,[r.rows[0].order_id]);
    if(status==="failed")await db.query(`UPDATE orders SET status='cancelled',updated_at=NOW() WHERE id=$1`,[r.rows[0].order_id]);
    res.json({received:true});
  }catch(e){next(e)}
});

module.exports=router;