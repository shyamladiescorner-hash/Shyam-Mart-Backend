const router=require("express").Router();
const db=require("../db");
const auth=require("../middleware/auth");

function orderNumber(){return "SHYAM-"+Date.now().toString(36).toUpperCase()+"-"+Math.floor(100+Math.random()*900)}

router.post("/cart/validate",auth(),async(req,res,next)=>{
  try{
    const items=Array.isArray(req.body.items)?req.body.items:[];
    if(!items.length)return res.status(400).json({error:"EMPTY_CART",message:"Cart is empty"});
    const ids=items.map(x=>x.product_id).filter(Boolean);
    const r=await db.query(
      `SELECT p.id,p.sku,p.name,p.selling_price,p.is_active,
              COALESCE(i.quantity,0) quantity,COALESCE(i.reserved_quantity,0) reserved_quantity
       FROM products p LEFT JOIN inventory i ON i.product_id=p.id
       WHERE p.id=ANY($1::uuid[])`,[ids]);
    const map=new Map(r.rows.map(x=>[x.id,x]));
    const validated=[];
    for(const item of items){
      const p=map.get(item.product_id);
      const qty=Math.max(parseInt(item.quantity)||0,0);
      if(!p||!p.is_active)return res.status(400).json({error:"PRODUCT_UNAVAILABLE",product_id:item.product_id});
      if(qty<1)return res.status(400).json({error:"INVALID_QUANTITY",product_id:item.product_id});
      const available=Number(p.quantity)-Number(p.reserved_quantity);
      if(qty>available)return res.status(409).json({error:"INSUFFICIENT_STOCK",product_id:p.id,available});
      validated.push({product_id:p.id,sku:p.sku,name:p.name,quantity:qty,unit_price:Number(p.selling_price),line_total:qty*Number(p.selling_price)});
    }
    const subtotal=validated.reduce((a,x)=>a+x.line_total,0);
    res.json({items:validated,subtotal,delivery_fee:subtotal>=499?0:40,total:subtotal+(subtotal>=499?0:40)});
  }catch(e){next(e)}
});

router.post("/orders",auth(),async(req,res,next)=>{
  const client=await db.pool.connect();
  try{
    const items=Array.isArray(req.body.items)?req.body.items:[];
    if(!items.length)return res.status(400).json({error:"EMPTY_CART",message:"Cart is empty"});
    const address=req.body.address||{};
    if(!address.full_name||!address.phone||!address.address_line||!address.city||!address.state||!address.pincode)
      return res.status(400).json({error:"ADDRESS_REQUIRED",message:"Complete delivery address is required"});

    await client.query("BEGIN");
    let subtotal=0, lines=[];
    for(const item of items){
      const qty=Math.max(parseInt(item.quantity)||0,0);
      if(!item.product_id||qty<1)throw Object.assign(new Error("Invalid cart item"),{status:400});
      const p=await client.query(
        `SELECT p.id,p.sku,p.name,p.selling_price,p.is_active,
                COALESCE(i.quantity,0) quantity,COALESCE(i.reserved_quantity,0) reserved_quantity
         FROM products p LEFT JOIN inventory i ON i.product_id=p.id
         WHERE p.id=$1 FOR UPDATE`,[item.product_id]);
      const row=p.rows[0];
      if(!row||!row.is_active)throw Object.assign(new Error("Product unavailable"),{status:400});
      const available=Number(row.quantity)-Number(row.reserved_quantity);
      if(qty>available)throw Object.assign(new Error(`Only ${available} available for ${row.name}`),{status:409});
      const price=Number(row.selling_price), lineTotal=price*qty;
      subtotal+=lineTotal;
      lines.push({row,qty,price,lineTotal});
      await client.query(`UPDATE inventory SET quantity=quantity-$1,updated_at=NOW() WHERE product_id=$2`,[qty,row.id]);
    }
    const delivery=subtotal>=499?0:40;
    const total=subtotal+delivery;
    const orderNo=orderNumber();
    const o=await client.query(
      `INSERT INTO orders(order_number,user_id,status,subtotal,discount,delivery_fee,total)
       VALUES($1,$2,'pending',$3,0,$4,$5) RETURNING *`,
      [orderNo,req.user.sub,subtotal,delivery,total]);
    for(const l of lines){
      await client.query(
        `INSERT INTO order_items(order_id,product_id,product_name,sku,quantity,unit_price,line_total)
         VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [o.rows[0].id,l.row.id,l.row.name,l.row.sku,l.qty,l.price,l.lineTotal]);
    }
    await client.query(
      `INSERT INTO payments(order_id,method,status,amount) VALUES($1,$2,'pending',$3)`,
      [o.rows[0].id,req.body.payment_method||"cod",total]);
    await client.query("COMMIT");
    res.status(201).json({order:o.rows[0],message:"Order created successfully"});
  }catch(e){
    await client.query("ROLLBACK").catch(()=>{});
    res.status(e.status||500).json({error:e.status===409?"INSUFFICIENT_STOCK":"ORDER_FAILED",message:e.message});
  }finally{client.release()}
});

router.get("/orders",auth(),async(req,res,next)=>{
  try{
    const r=await db.query(
      `SELECT o.id,o.order_number,o.status,o.subtotal,o.discount,o.delivery_fee,o.total,o.created_at,
              COALESCE(json_agg(json_build_object('product_id',oi.product_id,'name',oi.product_name,'sku',oi.sku,'quantity',oi.quantity,'unit_price',oi.unit_price,'line_total',oi.line_total)
              ORDER BY oi.id) FILTER(WHERE oi.id IS NOT NULL),'[]') items
       FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id
       WHERE o.user_id=$1 GROUP BY o.id ORDER BY o.created_at DESC`,[req.user.sub]);
    res.json({items:r.rows});
  }catch(e){next(e)}
});

router.get("/orders/:id",auth(),async(req,res,next)=>{
  try{
    const r=await db.query(
      `SELECT o.*,COALESCE(json_agg(json_build_object('product_id',oi.product_id,'name',oi.product_name,'sku',oi.sku,'quantity',oi.quantity,'unit_price',oi.unit_price,'line_total',oi.line_total)
      ORDER BY oi.id) FILTER(WHERE oi.id IS NOT NULL),'[]') items
       FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id
       WHERE o.id=$1 AND o.user_id=$2 GROUP BY o.id`,[req.params.id,req.user.sub]);
    if(!r.rows[0])return res.status(404).json({error:"NOT_FOUND",message:"Order not found"});
    res.json(r.rows[0]);
  }catch(e){next(e)}
});

router.get("/admin/orders",auth(["admin","staff"]),async(req,res,next)=>{
  try{
    const status=req.query.status;
    const params=[];let where="";
    if(status){params.push(status);where=`WHERE o.status=$1`}
    const r=await db.query(
      `SELECT o.id,o.order_number,o.status,o.subtotal,o.discount,o.delivery_fee,o.total,o.created_at,
              u.name customer_name,u.phone customer_phone,
              COALESCE(json_agg(json_build_object('name',oi.product_name,'sku',oi.sku,'quantity',oi.quantity,'line_total',oi.line_total)
              ORDER BY oi.id) FILTER(WHERE oi.id IS NOT NULL),'[]') items
       FROM orders o LEFT JOIN users u ON u.id=o.user_id
       LEFT JOIN order_items oi ON oi.order_id=o.id ${where}
       GROUP BY o.id,u.name,u.phone ORDER BY o.created_at DESC`,params);
    res.json({items:r.rows});
  }catch(e){next(e)}
});

router.patch("/admin/orders/:id/status",auth(["admin","staff"]),async(req,res,next)=>{
  try{
    const allowed=["pending","confirmed","packed","shipped","delivered","cancelled","refunded"];
    if(!allowed.includes(req.body.status))return res.status(400).json({error:"INVALID_STATUS"});
    const r=await db.query(`UPDATE orders SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING *`,[req.body.status,req.params.id]);
    if(!r.rows[0])return res.status(404).json({error:"NOT_FOUND",message:"Order not found"});
    res.json(r.rows[0]);
  }catch(e){next(e)}
});
module.exports=router;