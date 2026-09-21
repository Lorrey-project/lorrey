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
    const { damage, gpsDeviceInstallation, rfid, gpsTripCharge, advanceBankTF } = req.body;
    let settings = await ProjectedDeductionSetting.findOne();
    if (!settings) {
      settings = new ProjectedDeductionSetting();
    }
    
    if (damage !== undefined) settings.damage = Number(damage);
    if (gpsDeviceInstallation !== undefined) settings.gpsDeviceInstallation = Number(gpsDeviceInstallation);
    if (rfid !== undefined) settings.rfid = Number(rfid);
    if (gpsTripCharge !== undefined) settings.gpsTripCharge = Number(gpsTripCharge);
    if (advanceBankTF !== undefined) settings.advanceBankTF = Number(advanceBankTF);

    await settings.save();
    res.json({ success: true, data: settings });
  } catch (err) {
    console.error("Error saving projected deductions:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

const OilAllowanceSetting = require("../models/OilAllowanceSetting");

// GET /settings/oil-allowances
router.get("/oil-allowances", auth, async (req, res) => {
  try {
    let setting = await OilAllowanceSetting.findOne();
    if (!setting) {
      setting = await OilAllowanceSetting.create({ extraCashExpenseAmount: 0 });
    }
    res.json({ success: true, data: setting });
  } catch (err) {
    console.error("Error fetching extra cash expense:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /settings/oil-allowances
router.put("/oil-allowances", auth, async (req, res) => {
  try {
    const { extraCashExpenseAmount } = req.body;
    if (extraCashExpenseAmount === undefined) {
      return res.status(400).json({ success: false, error: "extraCashExpenseAmount is required." });
    }

    const amount = parseFloat(extraCashExpenseAmount);
    if (isNaN(amount) || amount < 0) {
      return res.status(400).json({ success: false, error: "Extra cash expense amount must be a non-negative number." });
    }

    let setting = await OilAllowanceSetting.findOne();
    if (!setting) {
      setting = new OilAllowanceSetting({ extraCashExpenseAmount: amount });
    } else {
      setting.extraCashExpenseAmount = amount;
    }

    await setting.save();
    res.json({ success: true, data: setting });
  } catch (err) {
    console.error("Error saving extra cash expense:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
