const router=require("express").Router();
const db=require("../db");
const auth=require("../middleware/auth");

router.get("/home",async(_req,res,next)=>{
  try{
    const [cats,products,offers]=await Promise.all([
      db.query(`SELECT id,name,slug FROM categories WHERE is_active=true ORDER BY sort_order,name`),
      db.query(`SELECT p.id,p.sku,p.name,p.slug,p.description,p.mrp,p.selling_price,c.name category,c.slug category_slug,
                COALESCE(i.quantity,0) quantity
                FROM products p LEFT JOIN categories c ON c.id=p.category_id
                LEFT JOIN inventory i ON i.product_id=p.id
                WHERE p.is_active=true ORDER BY p.created_at DESC LIMIT 24`),
      db.query(`SELECT id,code,discount_type,discount_value,min_order_value,max_discount,expires_at
                FROM coupons WHERE is_active=true AND (expires_at IS NULL OR expires_at>NOW())
                ORDER BY created_at DESC LIMIT 10`).catch(()=>({rows:[]}))
    ]);
    res.json({categories:cats.rows,products:products.rows,offers:offers.rows});
  }catch(e){next(e)}
});

router.get("/search",async(req,res,next)=>{
  try{
    const q=String(req.query.q||"").trim();
    if(!q)return res.json({items:[],query:""});
    const limit=Math.min(Math.max(Number(req.query.limit)||20,1),50);
    const r=await db.query(
      `SELECT p.id,p.sku,p.name,p.slug,p.description,p.mrp,p.selling_price,
              c.name category,c.slug category_slug,COALESCE(i.quantity,0) quantity
       FROM products p LEFT JOIN categories c ON c.id=p.category_id
       LEFT JOIN inventory i ON i.product_id=p.id
       WHERE p.is_active=true
       AND (p.name ILIKE $1 OR p.sku ILIKE $1 OR COALESCE(p.description,'') ILIKE $1 OR COALESCE(c.name,'') ILIKE $1)
       ORDER BY CASE WHEN p.name ILIKE $2 THEN 0 ELSE 1 END,p.created_at DESC
       LIMIT $3`,[`%${q}%`,`${q}%`,limit]);
    res.json({items:r.rows,query:q});
  }catch(e){next(e)}
});

router.get("/products/:id",async(req,res,next)=>{
  try{
    const r=await db.query(
      `SELECT p.id,p.sku,p.name,p.slug,p.description,p.mrp,p.selling_price,p.is_active,
              c.id category_id,c.name category,c.slug category_slug,
              COALESCE(i.quantity,0) quantity,COALESCE(i.reserved_quantity,0) reserved_quantity
       FROM products p LEFT JOIN categories c ON c.id=p.category_id
       LEFT JOIN inventory i ON i.product_id=p.id
       WHERE p.id=$1 AND p.is_active=true`,[req.params.id]);
    if(!r.rows[0])return res.status(404).json({error:"NOT_FOUND",message:"Product not found"});
    res.json(r.rows[0]);
  }catch(e){next(e)}
});

router.post("/wishlist/:productId",auth(),async(req,res,next)=>{
  try{
    const r=await db.query(
      `INSERT INTO wishlist(user_id,product_id) VALUES($1,$2)
       ON CONFLICT(user_id,product_id) DO NOTHING
       RETURNING user_id,product_id`,[req.user.sub,req.params.productId]);
    res.status(201).json({saved:true,item:r.rows[0]||{user_id:req.user.sub,product_id:req.params.productId}});
  }catch(e){next(e)}
});

router.delete("/wishlist/:productId",auth(),async(req,res,next)=>{
  try{
    await db.query(`DELETE FROM wishlist WHERE user_id=$1 AND product_id=$2`,[req.user.sub,req.params.productId]);
    res.json({saved:false});
  }catch(e){next(e)}
});

router.get("/wishlist",auth(),async(req,res,next)=>{
  try{
    const r=await db.query(
      `SELECT p.id,p.sku,p.name,p.slug,p.mrp,p.selling_price,
              COALESCE(i.quantity,0) quantity,c.name category
       FROM wishlist w JOIN products p ON p.id=w.product_id
       LEFT JOIN categories c ON c.id=p.category_id
       LEFT JOIN inventory i ON i.product_id=p.id
       WHERE w.user_id=$1 AND p.is_active=true ORDER BY w.created_at DESC`,[req.user.sub]);
    res.json({items:r.rows});
  }catch(e){next(e)}
});

module.exports=router;