const router=require("express").Router();
const auth=require("../middleware/auth");
router.get("/",auth(),(req,res)=>res.json({user:req.user}));
module.exports=router;