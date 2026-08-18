const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const ProjectedDeductionSetting = require("../models/ProjectedDeductionSetting");

// GET /settings/projected-deductions
router.get("/projected-deductions", auth, async (req, res) => {
  try {
    let settings = await ProjectedDeductionSetting.findOne();
    if (!settings) {
      settings = await ProjectedDeductionSetting.create({});
    }
    res.json({ success: true, data: settings });
  } catch (err) {
    console.error("Error fetching projected deductions:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /settings/projected-deductions
router.put("/projected-deductions", auth, async (req, res) => {
  try {
    const { damage, gpsDeviceInstallation, rfid, gpsTripCharge } = req.body;
    let settings = await ProjectedDeductionSetting.findOne();
    if (!settings) {
      settings = new ProjectedDeductionSetting();
    }
    
    if (damage !== undefined) settings.damage = Number(damage);
    if (gpsDeviceInstallation !== undefined) settings.gpsDeviceInstallation = Number(gpsDeviceInstallation);
    if (rfid !== undefined) settings.rfid = Number(rfid);
    if (gpsTripCharge !== undefined) settings.gpsTripCharge = Number(gpsTripCharge);

    await settings.save();
    res.json({ success: true, data: settings });
  } catch (err) {
    console.error("Error saving projected deductions:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
