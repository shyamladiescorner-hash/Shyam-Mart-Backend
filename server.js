require("dotenv").config();
const express=require("express");
const cors=require("cors");
const helmet=require("helmet");
const morgan=require("morgan");
const authRoutes=require("./routes/auth");
const meRoutes=require("./routes/me");
const catalogRoutes=require("./routes/catalog");
const commerceRoutes=require("./routes/commerce");
const adminRoutes=require("./routes/admin");
const storefrontRoutes=require("./routes/storefront");
const paymentRoutes=require("./routes/payments");
const notificationRoutes=require("./routes/notifications");
const intelligenceRoutes=require("./routes/intelligence");

const app=express();
const PORT=Number(process.env.PORT||4000);

app.use(helmet());
app.use(cors({origin:process.env.CORS_ORIGIN||"*"}));
app.use(express.json({limit:"1mb"}));
app.use(morgan("dev"));

app.get("/",(_req,res)=>res.json({name:"Shyam OS API",version:"0.2.0",status:"online"}));
app.get("/api/v1/health",(_req,res)=>res.json({ok:true,service:"shyam-os-backend",timestamp:new Date().toISOString()}));

app.use("/api/v1/auth",authRoutes);
app.use("/api/v1/me",meRoutes);
app.use("/api/v1/catalog",catalogRoutes);
app.use("/api/v1/commerce",commerceRoutes);
app.use("/api/v1/admin",adminRoutes);
app.use("/api/v1/storefront",storefrontRoutes);
app.use("/api/v1/payments",paymentRoutes);
app.use("/api/v1/notifications",notificationRoutes);
app.use("/api/v1/intelligence",intelligenceRoutes);

app.use((_req,res)=>res.status(404).json({error:"NOT_FOUND",message:"API route not found"}));
app.use((err,_req,res,_next)=>{console.error(err);res.status(500).json({error:"INTERNAL_SERVER_ERROR",message:"Something went wrong"});});

app.listen(PORT,()=>console.log(`Shyam OS API running on http://localhost:${PORT}`));