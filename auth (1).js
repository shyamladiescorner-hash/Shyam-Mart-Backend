const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");

function sign(user) {
  return jwt.sign(
    {sub:user.id, phone:user.phone, name:user.name, role:user.role},
    process.env.JWT_SECRET,
    {expiresIn:process.env.JWT_EXPIRES_IN || "7d"}
  );
}

router.post("/register", async (req,res,next)=>{
  try {
    const {phone,name,email,password} = req.body;
    if (!phone || !password) return res.status(400).json({error:"VALIDATION_ERROR",message:"Phone and password are required"});
    if (String(password).length < 8) return res.status(400).json({error:"VALIDATION_ERROR",message:"Password must be at least 8 characters"});

    const hash = await bcrypt.hash(password,12);
    const result = await db.query(
      `INSERT INTO users(phone,name,email,password_hash,role)
       VALUES($1,$2,$3,$4,'customer')
       RETURNING id,phone,name,email,role`,
      [String(phone).trim(),name || null,email || null,hash]
    );
    const user=result.rows[0];
    res.status(201).json({user,token:sign(user)});
  } catch(err) {
    if (err.code === "23505") return res.status(409).json({error:"PHONE_EXISTS",message:"Account already exists"});
    next(err);
  }
});

router.post("/login", async (req,res,next)=>{
  try {
    const {phone,password}=req.body;
    const result=await db.query(
      `SELECT id,phone,name,email,role,is_active,password_hash FROM users WHERE phone=$1`,
      [String(phone || "").trim()]
    );
    const user=result.rows[0];
    if (!user || !user.is_active || !(await bcrypt.compare(password || "",user.password_hash))) {
      return res.status(401).json({error:"INVALID_CREDENTIALS",message:"Phone or password is incorrect"});
    }
    const safe={id:user.id,phone:user.phone,name:user.name,email:user.email,role:user.role};
    res.json({user:safe,token:sign(safe)});
  } catch(err){ next(err); }
});

module.exports=router;