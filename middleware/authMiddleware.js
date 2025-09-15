const jwt = require("jsonwebtoken");

const authenticateToken = (req, res, next) => {
  const token = req.header("Authorization")?.split(" ")[1];
  if (!token) {
    return res
      .status(401)
      .json({ message: "Access denied. No token provided." });
  }

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    res.status(403).json({ message: "Invalid token." });
  }
};

const authorizeRole = (role) => (req, res, next) => {
  if (req.user.role !== role) {
    return res
      .status(403)
      .json({ message: `Access denied. Requires ${role} role.` });
  }
  next();
};

// Middleware to add socket.io to request object
const addSocketIO = (io) => (req, res, next) => {
  req.io = io;
  next();
};

module.exports = {
  authenticateToken,
  authorizeRole,
  addSocketIO
};
