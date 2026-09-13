const router=require("express").Router();
const db=require("../db");
const auth=require("../middleware/auth");

router.get("/dashboard",auth(["admin","staff"]),async(_req,res,next)=>{
  try{
    const [sales,orders,customers,lowStock]=await Promise.all([
      db.query(`SELECT COALESCE(SUM(total),0) revenue,COUNT(*) orders,COALESCE(AVG(total),0) aov FROM orders WHERE status NOT IN ('cancelled','refunded')`),
      db.query(`SELECT status,COUNT(*) count FROM orders GROUP BY status ORDER BY status`),
      db.query(`SELECT COUNT(*) count FROM users WHERE role='customer' AND is_active=true`),
      db.query(`SELECT p.id,p.sku,p.name,COALESCE(i.quantity,0) quantity,COALESCE(i.low_stock_threshold,5) threshold
                FROM products p LEFT JOIN inventory i ON i.product_id=p.id
                WHERE p.is_active=true AND COALESCE(i.quantity,0)<=COALESCE(i.low_stock_threshold,5)
                ORDER BY quantity ASC LIMIT 20`)
    ]);
    res.json({
      sales:sales.rows[0],
      order_status:orders.rows,
      active_customers:Number(customers.rows[0].count),
      low_stock:lowStock.rows
    });
  }catch(e){next(e)}
});

router.get("/customers",auth(["admin","staff"]),async(req,res,next)=>{
  try{
    const q=String(req.query.q||"").trim();
    const params=[];let where=`WHERE u.role='customer'`;
    if(q){params.push(`%${q}%`);where+=` AND (u.name ILIKE $1 OR u.phone ILIKE $1 OR COALESCE(u.email,'') ILIKE $1)`}
    const r=await db.query(
      `SELECT u.id,u.name,u.phone,u.email,u.is_active,u.created_at,
              COUNT(o.id)::int order_count,COALESCE(SUM(CASE WHEN o.status NOT IN ('cancelled','refunded') THEN o.total ELSE 0 END),0) total_spent
       FROM users u LEFT JOIN orders o ON o.user_id=u.id ${where}
       GROUP BY u.id ORDER BY u.created_at DESC LIMIT 100`,params);
    res.json({items:r.rows});
  }catch(e){next(e)}
});

router.get("/inventory",auth(["admin","staff"]),async(req,res,next)=>{
  try{
    const q=String(req.query.q||"").trim();const params=[];let where="";
    if(q){params.push(`%${q}%`);where=`WHERE p.name ILIKE $1 OR p.sku ILIKE $1`}
    const r=await db.query(
      `SELECT p.id,p.sku,p.name,p.selling_price,p.is_active,
              COALESCE(i.quantity,0) quantity,COALESCE(i.reserved_quantity,0) reserved_quantity,
              COALESCE(i.low_stock_threshold,5) low_stock_threshold,
              (COALESCE(i.quantity,0)-COALESCE(i.reserved_quantity,0)) available
       FROM products p LEFT JOIN inventory i ON i.product_id=p.id
       ${where} ORDER BY quantity ASC,p.name LIMIT 200`,params);
    res.json({items:r.rows});
  }catch(e){next(e)}
});

router.patch("/orders/:id/status",auth(["admin","staff"]),async(req,res,next)=>{
  const allowed=["pending","confirmed","packed","shipped","delivered","cancelled","refunded"];
  if(!allowed.includes(req.body.status))return res.status(400).json({error:"INVALID_STATUS"});
  const client=await db.pool.connect();
  try{
    await client.query("BEGIN");
    const before=await client.query(`SELECT status,user_id,total,order_number FROM orders WHERE id=$1 FOR UPDATE`,[req.params.id]);
    if(!before.rows[0]){await client.query("ROLLBACK");return res.status(404).json({error:"NOT_FOUND",message:"Order not found"});}
    const oldStatus=before.rows[0].status;
    const r=await client.query(`UPDATE orders SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING *`,[req.body.status,req.params.id]);
    await client.query(`INSERT INTO order_status_history(order_id,old_status,new_status,changed_by) VALUES($1,$2,$3,$4)`,
      [req.params.id,oldStatus,req.body.status,req.user.sub]);
    const templateKey=({confirmed:"order_confirmed",packed:"packed",shipped:"shipped",delivered:"delivered",cancelled:"cancelled"})[req.body.status];
    if(templateKey && before.rows[0].user_id){
      await client.query(`INSERT INTO notifications(user_id,order_id,channel,template_key,status,recipient)
        SELECT $1,$2,'whatsapp',$3,'queued',u.phone FROM users u WHERE u.id=$1`,
        [before.rows[0].user_id,req.params.id,templateKey]);
    }
    await client.query("COMMIT");
    res.json({...r.rows[0],notification_queued:Boolean(templateKey)});
  }catch(e){await client.query("ROLLBACK").catch(()=>{});next(e)}
  finally{client.release()}
});
module.exports=router;