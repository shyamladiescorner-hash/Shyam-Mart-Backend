const router = require("express").Router();
const db = require("../db");
const auth = require("../middleware/auth");

const slugify = s => String(s||"").toLowerCase().trim()
  .replace(/[^a-z0-9\s-]/g,"").replace(/\s+/g,"-").replace(/-+/g,"-");

router.get("/categories", async (_req,res,next)=>{
  try {
    const r=await db.query(`SELECT id,name,slug,is_active,sort_order FROM categories WHERE is_active=true ORDER BY sort_order,name`);
    res.json({items:r.rows});
  } catch(e){next(e)}
});

router.post("/categories", auth(["admin","staff"]), async (req,res,next)=>{
  try {
    const {name,slug,sort_order=0}=req.body;
    if(!name) return res.status(400).json({error:"VALIDATION_ERROR",message:"Category name is required"});
    const finalSlug=slugify(slug||name);
    const r=await db.query(
      `INSERT INTO categories(name,slug,sort_order) VALUES($1,$2,$3)
       RETURNING id,name,slug,is_active,sort_order`,[name,finalSlug,Number(sort_order)||0]);
    res.status(201).json(r.rows[0]);
  }catch(e){
    if(e.code==="23505") return res.status(409).json({error:"SLUG_EXISTS",message:"Category slug already exists"});
    next(e);
  }
});

router.get("/products", async (req,res,next)=>{
  try{
    const q=String(req.query.q||"").trim();
    const category=String(req.query.category||"").trim();
    const active=req.query.active===undefined ? true : req.query.active!=="false";
    const limit=Math.min(Math.max(Number(req.query.limit)||20,1),100);
    const offset=Math.max(Number(req.query.offset)||0,0);
    const params=[]; const where=[];
    if(active){where.push(`p.is_active=true`)}
    if(q){params.push(`%${q}%`); where.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length})`)}
    if(category){params.push(category); where.push(`c.slug=$${params.length}`)}
    params.push(limit); const lim=`$${params.length}`;
    params.push(offset); const off=`$${params.length}`;
    const sql=`SELECT p.id,p.sku,p.name,p.slug,p.description,p.mrp,p.selling_price,
      p.is_active,c.id category_id,c.name category,c.slug category_slug,
      COALESCE(i.quantity,0) quantity,COALESCE(i.reserved_quantity,0) reserved_quantity,
      COALESCE(i.low_stock_threshold,5) low_stock_threshold
      FROM products p LEFT JOIN categories c ON c.id=p.category_id
      LEFT JOIN inventory i ON i.product_id=p.id
      ${where.length?"WHERE "+where.join(" AND "):""}
      ORDER BY p.created_at DESC LIMIT ${lim} OFFSET ${off}`;
    const r=await db.query(sql,params);
    res.json({items:r.rows,limit,offset});
  }catch(e){next(e)}
});

router.get("/products/:id", async (req,res,next)=>{
  try{
    const r=await db.query(`SELECT p.*,c.name category,c.slug category_slug,
      COALESCE(i.quantity,0) quantity,COALESCE(i.reserved_quantity,0) reserved_quantity,
      COALESCE(i.low_stock_threshold,5) low_stock_threshold
      FROM products p LEFT JOIN categories c ON c.id=p.category_id
      LEFT JOIN inventory i ON i.product_id=p.id WHERE p.id=$1`,[req.params.id]);
    if(!r.rows[0]) return res.status(404).json({error:"NOT_FOUND",message:"Product not found"});
    res.json(r.rows[0]);
  }catch(e){next(e)}
});

router.post("/products", auth(["admin","staff"]), async (req,res,next)=>{
  const client=await db.pool.connect();
  try{
    const {sku,name,slug,description,category_id,mrp,selling_price,quantity=0,low_stock_threshold=5}=req.body;
    if(!sku||!name||mrp===undefined||selling_price===undefined)
      return res.status(400).json({error:"VALIDATION_ERROR",message:"SKU, name, MRP and selling price are required"});
    const finalSlug=slugify(slug||name);
    await client.query("BEGIN");
    const p=await client.query(
      `INSERT INTO products(sku,name,slug,description,category_id,mrp,selling_price)
       VALUES($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [String(sku).trim(),name,finalSlug,description||null,category_id||null,Number(mrp),Number(selling_price)]);
    await client.query(
      `INSERT INTO inventory(product_id,quantity,low_stock_threshold) VALUES($1,$2,$3)`,
      [p.rows[0].id,Math.max(Number(quantity)||0,0),Math.max(Number(low_stock_threshold)||0,0)]);
    await client.query("COMMIT");
    res.status(201).json(p.rows[0]);
  }catch(e){
    await client.query("ROLLBACK").catch(()=>{});
    if(e.code==="23505") return res.status(409).json({error:"DUPLICATE_PRODUCT",message:"SKU or slug already exists"});
    next(e);
  }finally{client.release()}
});

router.patch("/products/:id", auth(["admin","staff"]), async (req,res,next)=>{
  try{
    const allowed=["name","description","category_id","mrp","selling_price","is_active"];
    const sets=[]; const vals=[];
    for(const key of allowed){
      if(Object.prototype.hasOwnProperty.call(req.body,key)){
        vals.push(req.body[key]); sets.push(`${key}=$${vals.length}`);
      }
    }
    if(!sets.length) return res.status(400).json({error:"NO_CHANGES",message:"No editable fields supplied"});
    vals.push(req.params.id);
    const r=await db.query(`UPDATE products SET ${sets.join(", ")},updated_at=NOW() WHERE id=$${vals.length} RETURNING *`,vals);
    if(!r.rows[0]) return res.status(404).json({error:"NOT_FOUND",message:"Product not found"});
    res.json(r.rows[0]);
  }catch(e){next(e)}
});

router.patch("/products/:id/inventory", auth(["admin","staff"]), async (req,res,next)=>{
  try{
    const {quantity,low_stock_threshold}=req.body;
    const r=await db.query(
      `INSERT INTO inventory(product_id,quantity,low_stock_threshold)
       VALUES($1,$2,$3)
       ON CONFLICT(product_id) DO UPDATE SET
       quantity=COALESCE($2,inventory.quantity),
       low_stock_threshold=COALESCE($3,inventory.low_stock_threshold),
       updated_at=NOW()
       RETURNING *`,
      [req.params.id, quantity===undefined?0:Math.max(Number(quantity)||0,0),
       low_stock_threshold===undefined?5:Math.max(Number(low_stock_threshold)||0,0)]);
    res.json(r.rows[0]);
  }catch(e){
    if(e.code==="23503") return res.status(404).json({error:"PRODUCT_NOT_FOUND",message:"Product not found"});
    next(e);
  }
});

module.exports=router;