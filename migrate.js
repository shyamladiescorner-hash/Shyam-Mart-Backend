require("dotenv").config();
const fs=require("fs");
const path=require("path");
const db=require("../src/db");

(async()=>{
  try{
    const sql=fs.readFileSync(path.join(__dirname,"../db/schema.sql"),"utf8");
    await db.query(sql);
    console.log("Shyam OS database schema applied successfully.");
  }catch(err){console.error(err);process.exitCode=1}
  finally{await db.pool.end();}
})();