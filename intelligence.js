const router=require("express").Router();
const db=require("../db");
const auth=require("../middleware/auth");

router.get("/analytics/summary",auth(["admin","staff"]),async(req,res,next)=>{
  try{
    const days=Math.min(Math.max(Number(req.query.days)||30,1),365);
    const [kpi,top,cats,daily]=await Promise.all([
      db.query(`SELECT COALESCE(SUM(total),0) revenue,COUNT(*) orders,
        COALESCE(AVG(total),0) aov,
        COUNT(DISTINCT user_id) unique_customers
        FROM orders WHERE created_at>=NOW()-($1::int * INTERVAL '1 day')
        AND status NOT IN ('cancelled','refunded')`,[days]),
      db.query(`SELECT oi.product_name,oi.sku,SUM(oi.quantity)::int units,
        COALESCE(SUM(oi.line_total),0) revenue
        FROM order_items oi JOIN orders o ON o.id=oi.order_id
        WHERE o.created_at>=NOW()-($1::int * INTERVAL '1 day')
        AND o.status NOT IN ('cancelled','refunded')
        GROUP BY oi.product_name,oi.sku ORDER BY units DESC LIMIT 10`,[days]),
      db.query(`SELECT COALESCE(c.name,'Uncategorised') category,SUM(oi.quantity)::int units,
        COALESCE(SUM(oi.line_total),0) revenue
        FROM order_items oi JOIN orders o ON o.id=oi.order_id
        LEFT JOIN products p ON p.id=oi.product_id LEFT JOIN categories c ON c.id=p.category_id
        WHERE o.created_at>=NOW()-($1::int * INTERVAL '1 day')
        AND o.status NOT IN ('cancelled','refunded')
        GROUP BY c.name ORDER BY revenue DESC`,[days]),
      db.query(`SELECT DATE(o.created_at) day,COUNT(*)::int orders,COALESCE(SUM(o.total),0) revenue
        FROM orders o WHERE o.created_at>=NOW()-($1::int * INTERVAL '1 day')
        AND o.status NOT IN ('cancelled','refunded')
        GROUP BY DATE(o.created_at) ORDER BY day`,[days])
    ]);
    res.json({days,kpi:kpi.rows[0],top_products:top.rows,categories:cats.rows,daily:daily.rows});
  }catch(e){next(e)}
});

router.get("/recommendations",auth(),async(req,res,next)=>{
  try{
    const r=await db.query(`SELECT p.id,p.sku,p.name,p.selling_price,
      COALESCE(i.quantity,0) quantity,COALESCE(c.name,'') category
      FROM products p LEFT JOIN inventory i ON i.product_id=p.id
      LEFT JOIN categories c ON c.id=p.category_id
      WHERE p.is_active=true AND COALESCE(i.quantity,0)>0
      ORDER BY p.created_at DESC LIMIT 50`);
    const q=String(req.query.q||"").trim().toLowerCase();
    let items=r.rows;
    if(q){
      const terms=q.split(/\s+/).filter(Boolean);
      items=items.map(p=>{
        const text=(p.name+" "+p.category).toLowerCase();
        const score=terms.reduce((n,t)=>n+(text.includes(t)?1:0),0);
        return {...p,match_score:score};
      }).filter(p=>p.match_score>0).sort((a,b)=>b.match_score-a.match_score);
    }
    res.json({mode:"catalogue-rules-demo",query:q,items:items.slice(0,12),
      note:"Recommendation logic is a deterministic prototype. A production AI layer can be connected later."});
  }catch(e){next(e)}
});

router.post("/events",auth(),async(req,res,next)=>{
  try{
    const {event_type,product_id,metadata={}}=req.body;
    if(!event_type)return res.status(400).json({error:"EVENT_TYPE_REQUIRED"});
    const r=await db.query(`INSERT INTO analytics_events(user_id,event_type,product_id,metadata)
      VALUES($1,$2,$3,$4) RETURNING id,event_type,created_at`,
      [req.user.sub,event_type,product_id||null,JSON.stringify(metadata)]);
    res.status(201).json(r.rows[0]);
  }catch(e){next(e)}
});

module.exports=router;