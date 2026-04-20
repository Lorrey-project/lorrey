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
      { new: true }
    ).select("email role pumpName fuelRate");
    res.json({ success: true, user: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

