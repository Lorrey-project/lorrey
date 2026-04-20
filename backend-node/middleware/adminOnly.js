module.exports = (req, res, next) => {
  // Assuming JWT payload is attached to req.user by auth middleware
  if (req.user && req.user.role && req.user.role === 'admin') {
    return next();
  }
  return res.status(403).json({ success: false, error: 'Admin access required' });
};
