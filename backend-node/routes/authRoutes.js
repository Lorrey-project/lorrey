const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");
const User = require("../models/User");

router.post("/signup", authController.signup);
router.post("/login", authController.login);

// WebAuthn Passkeys Routes
router.get("/generate-registration-options", authMiddleware, authController.generateRegOptions);
router.post("/verify-registration", authMiddleware, authController.verifyRegResponse);

router.post("/generate-authentication-options", authController.generateAuthOptions);
router.post("/verify-authentication", authController.verifyAuthResponse);

// GET /auth/me — return current user's pumpName + fuelRate
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("email role pumpName fuelRate").lean();
    if (!user) return res.status(404).json({ success: false, error: "User not found" });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /auth/pump-config — update this pump's fuelRate (pump admin only)
router.put("/pump-config", authMiddleware, async (req, res) => {
  try {
    const { fuelRate } = req.body;
    if (fuelRate === undefined || isNaN(parseFloat(fuelRate))) {
      return res.status(400).json({ success: false, error: "Valid fuelRate required" });
    }
    const updated = await User.findByIdAndUpdate(
      req.user.id,
      { fuelRate: parseFloat(fuelRate) },
      { returnDocument: 'after' }
    ).select("email role pumpName fuelRate");
    res.json({ success: true, user: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Admin: Account Approval Routes (HEAD_OFFICE only) ───────────────────────

// GET /auth/admin/pending-registrations
router.get('/admin/pending-registrations', authMiddleware, async (req, res) => {
  if (req.user.role !== 'HEAD_OFFICE') return res.status(403).json({ message: 'Forbidden' });
  try {
    const pending = await User.find({ status: 'pending' })
      .select('email role pumpName name createdAt')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, users: pending });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /auth/admin/active-users
router.get('/admin/active-users', authMiddleware, async (req, res) => {
  if (req.user.role !== 'HEAD_OFFICE') return res.status(403).json({ message: 'Forbidden' });
  try {
    // Return all active users, excluding the current head office admin themselves
    const active = await User.find({ status: 'active', _id: { $ne: req.user.id } })
      .select('email role pumpName name createdAt')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, users: active });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /auth/admin/approve/:id
router.put('/admin/approve/:id', authMiddleware, async (req, res) => {
  if (req.user.role !== 'HEAD_OFFICE') return res.status(403).json({ message: 'Forbidden' });
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { status: 'active' },
      { returnDocument: 'after' }
    ).select('email role pumpName name status');
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /auth/admin/reject/:id (Backward compatibility for UI)
// Or use for revoking active users:
router.delete('/admin/reject/:id', authMiddleware, async (req, res) => {
  if (req.user.role !== 'HEAD_OFFICE') return res.status(403).json({ message: 'Forbidden' });
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, message: 'User account removed.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
