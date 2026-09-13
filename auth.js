const jwt = require("jsonwebtoken");

function auth(requiredRoles = []) {
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) return res.status(401).json({error:"UNAUTHORIZED",message:"Login required"});

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (requiredRoles.length && !requiredRoles.includes(payload.role)) {
        return res.status(403).json({error:"FORBIDDEN",message:"Insufficient permission"});
      }
      req.user = payload;
      next();
    } catch {
      return res.status(401).json({error:"INVALID_TOKEN",message:"Session expired or invalid"});
    }
  };
}

module.exports = auth;