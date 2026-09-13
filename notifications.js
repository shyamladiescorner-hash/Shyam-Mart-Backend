const router=require("express").Router();
const db=require("../db");
const auth=require("../middleware/auth");

const TEMPLATES={
  order_confirmed:{label:"Order Confirmation",body:"Hi {name}, your Shyam order {order} has been confirmed. Total: ₹{total}."},
  packed:{label:"Order Packed",body:"Hi {name}, your Shyam order {order} has been packed and is getting ready for dispatch."},
  shipped:{label:"Order Shipped",body:"Hi {name}, your Shyam order {order} has been shipped. We’ll share tracking details when available."},
  delivered:{label:"Order Delivered",body:"Hi {name}, your Shyam order {order} has been delivered. Thank you for shopping with Shyam!"},
  cancelled:{label:"Order Cancelled",body:"Hi {name}, your Shyam order {order} has been cancelled. Please contact Shyam support if you need help."}
};

router.get("/templates",auth(["admin","staff"]),(_req,res)=>res.json({items:Object.entries(TEMPLATES).map(([key,v])=>({key,...v}))}));

router.post("/orders/:id/whatsapp-preview",auth(["admin","staff"]),async(req,res,next)=>{
  try{
    const r=await db.query(`SELECT o.order_number,o.total,o.status,u.name,u.phone FROM orders o
      LEFT JOIN users u ON u.id=o.user_id WHERE o.id=$1`,[req.params.id]);
    if(!r.rows[0])return res.status(404).json({error:"ORDER_NOT_FOUND"});
    const type=req.body.type||"order_confirmed",template=TEMPLATES[type];
    if(!template)return res.status(400).json({error:"INVALID_TEMPLATE"});
    const x=r.rows[0];
    const body=template.body.replaceAll("{name}",x.name||"Customer").replaceAll("{order}",x.order_number).replaceAll("{total}",Number(x.total).toFixed(2));
    res.json({mode:"preview",provider:"official_whatsapp_business_api",to:x.phone,template:type,message:body,note:"Preview only. No message was sent."});
  }catch(e){next(e)}
});

router.get("/admin/notifications",auth(["admin","staff"]),async(req,res,next)=>{
  try{
    const r=await db.query(`SELECT n.*,u.name customer_name,u.phone customer_phone
      FROM notifications n LEFT JOIN users u ON u.id=n.user_id ORDER BY n.created_at DESC LIMIT 100`);
    res.json({items:r.rows});
  }catch(e){next(e)}
});

router.post("/admin/notifications/test",auth(["admin"]),async(_req,res)=>{
  res.status(501).json({error:"WHATSAPP_PROVIDER_NOT_CONFIGURED",message:"Connect the official WhatsApp Business provider before sending real messages."});
});

module.exports=router;
