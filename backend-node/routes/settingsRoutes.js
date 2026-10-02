const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const ProjectedDeductionSetting = require("../models/ProjectedDeductionSetting");
const ProjectedDeductionVersion = require("../models/ProjectedDeductionVersion");
const {
  getApplicableProjectedDeduction,
  getAllApplicableProjectedDeductions,
  toDateStr,
  KEY_TO_SETTING_TYPE,
  SETTING_TYPE_KEYS,
  DEFAULT_AMOUNTS
} = require("../utils/projectedDeductionResolver");

// Helper to seed initial baseline versions if collection is empty
async function ensureDefaultVersions() {
  const count = await ProjectedDeductionVersion.countDocuments();
  if (count === 0) {
    const defaultEffectiveDate = '2026-01-01';
    const initialEntries = [
      { settingType: 'DAMAGE_DEDUCTION', amount: 476, effectiveDate: defaultEffectiveDate },
      { settingType: 'GPS_DEVICE_INSTALLATION', amount: 1500, effectiveDate: defaultEffectiveDate },
      { settingType: 'RFID', amount: 100, effectiveDate: defaultEffectiveDate },
      { settingType: 'GPS_MONITORING_TRIP_CHARGE', amount: 145, effectiveDate: defaultEffectiveDate },
      { settingType: 'TRAVELLING_EXPENSE', amount: 0, effectiveDate: defaultEffectiveDate },
    ];
    await ProjectedDeductionVersion.insertMany(initialEntries);
  }
}

// ── GET /settings/projected-deductions ──────────────────────────────────────
router.get("/projected-deductions", auth, async (req, res) => {
  try {
    await ensureDefaultVersions();

    let settings = await ProjectedDeductionSetting.findOne();
    if (!settings) {
      settings = await ProjectedDeductionSetting.create({});
    }

    // Fetch the latest version for each setting type to ensure active amounts and effective dates are synced
    const types = Object.keys(SETTING_TYPE_KEYS);
    const latestVersions = {};
    for (const t of types) {
      const v = await ProjectedDeductionVersion.findOne({ settingType: t })
        .sort({ effectiveDate: -1, createdAt: -1 })
        .lean();
      if (v) {
        latestVersions[SETTING_TYPE_KEYS[t]] = v;
      }
    }

    res.json({
      success: true,
      data: {
        damage: latestVersions.damage?.amount ?? settings.damage ?? 476,
        damageEffectiveDate: latestVersions.damage?.effectiveDate || settings.damageEffectiveDate || '2026-01-01',

        gpsDeviceInstallation: latestVersions.gpsDeviceInstallation?.amount ?? settings.gpsDeviceInstallation ?? 1500,
        gpsDeviceInstallationEffectiveDate: latestVersions.gpsDeviceInstallation?.effectiveDate || settings.gpsDeviceInstallationEffectiveDate || '2026-01-01',

        rfid: latestVersions.rfid?.amount ?? settings.rfid ?? 100,
        rfidEffectiveDate: latestVersions.rfid?.effectiveDate || settings.rfidEffectiveDate || '2026-01-01',

        gpsTripCharge: latestVersions.gpsTripCharge?.amount ?? settings.gpsTripCharge ?? 145,
        gpsTripChargeEffectiveDate: latestVersions.gpsTripCharge?.effectiveDate || settings.gpsTripChargeEffectiveDate || '2026-01-01',

        travellingExpense: latestVersions.travellingExpense?.amount ?? settings.travellingExpense ?? 0,
        travellingExpenseEffectiveDate: latestVersions.travellingExpense?.effectiveDate || settings.travellingExpenseEffectiveDate || '2026-01-01',

        advanceBankTF: settings.advanceBankTF || 0,
      },
      latestVersions
    });
  } catch (err) {
    console.error("Error fetching projected deductions:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /settings/projected-deductions/history ──────────────────────────────
router.get("/projected-deductions/history", auth, async (req, res) => {
  try {
    await ensureDefaultVersions();
    const { settingType } = req.query;

    const query = {};
    if (settingType) {
      const norm = KEY_TO_SETTING_TYPE[settingType] || settingType;
      query.settingType = norm;
    }

    const versions = await ProjectedDeductionVersion.find(query)
      .sort({ effectiveDate: -1, createdAt: -1 })
      .lean();

    res.json({ success: true, data: versions });
  } catch (err) {
    console.error("Error fetching projected deduction history:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /settings/projected-deductions/applicable ───────────────────────────
router.get("/projected-deductions/applicable", auth, async (req, res) => {
  try {
    const { date, settingType } = req.query;
    if (settingType) {
      const amt = await getApplicableProjectedDeduction(settingType, date);
      return res.json({ success: true, settingType, date: toDateStr(date), amount: amt });
    }
    const all = await getAllApplicableProjectedDeductions(date);
    res.json({ success: true, date: toDateStr(date), data: all });
  } catch (err) {
    console.error("Error resolving applicable projected deduction:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /settings/projected-deductions ──────────────────────────────────────
router.put("/projected-deductions", auth, async (req, res) => {
  try {
    await ensureDefaultVersions();

    const body = req.body;
    let settings = await ProjectedDeductionSetting.findOne();
    if (!settings) {
      settings = new ProjectedDeductionSetting();
    }

    const itemsToProcess = [
      { key: 'damage', type: 'DAMAGE_DEDUCTION', label: 'Damage Deduction' },
      { key: 'gpsDeviceInstallation', type: 'GPS_DEVICE_INSTALLATION', label: 'GPS Device Installation' },
      { key: 'rfid', type: 'RFID', label: 'RFID' },
      { key: 'gpsTripCharge', type: 'GPS_MONITORING_TRIP_CHARGE', label: 'GPS Monitoring / Trip Charge' },
      { key: 'travellingExpense', type: 'TRAVELLING_EXPENSE', label: 'Travelling Expense' },
    ];

    const todayStr = new Date().toISOString().slice(0, 10);

    for (const item of itemsToProcess) {
      // Support either nested object (e.g. body.damage = { amount: 500, effectiveDate: '2026-10-04' })
      // or flat keys (body.damage = 500, body.damageEffectiveDate = '2026-10-04')
      let amtVal = undefined;
      let effDateVal = undefined;

      if (body[item.key] !== undefined) {
        if (typeof body[item.key] === 'object' && body[item.key] !== null) {
          amtVal = body[item.key].amount;
          effDateVal = body[item.key].effectiveDate;
        } else {
          amtVal = body[item.key];
          effDateVal = body[`${item.key}EffectiveDate`] || body[`${item.key}_effective_date`];
        }
      }

      if (amtVal !== undefined && amtVal !== null && amtVal !== '') {
        const parsedAmount = parseFloat(amtVal);
        if (isNaN(parsedAmount) || parsedAmount < 0) {
          return res.status(400).json({
            success: false,
            error: `${item.label} amount must be a valid positive number.`
          });
        }

        const normDateStr = toDateStr(effDateVal) || todayStr;

        // Check if an existing version with the exact same settingType and effectiveDate exists
        let existingVersion = await ProjectedDeductionVersion.findOne({
          settingType: item.type,
          effectiveDate: normDateStr
        });

        if (existingVersion) {
          existingVersion.amount = parsedAmount;
          await existingVersion.save();
        } else {
          await ProjectedDeductionVersion.create({
            settingType: item.type,
            amount: parsedAmount,
            effectiveDate: normDateStr,
            createdBy: req.user?.username || req.user?.name || 'admin'
          });
        }

        // Update singleton
        settings[item.key] = parsedAmount;
        settings[`${item.key}EffectiveDate`] = normDateStr;
      }
    }

    if (body.advanceBankTF !== undefined) {
      settings.advanceBankTF = Number(body.advanceBankTF);
    }

    await settings.save();

    // Broadcast live socket update if available
    try {
      const io = req.app.get('io');
      if (io) {
        io.emit('projectedDeductionsUpdated', { timestamp: new Date() });
      }
    } catch (sockErr) {
      // Non-blocking
    }

    res.json({
      success: true,
      message: 'Projected Deduction Settings and history updated successfully',
      data: settings
    });
  } catch (err) {
    console.error("Error saving projected deductions:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /settings/projected-deductions/version/:id ───────────────────────
router.delete("/projected-deductions/version/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const version = await ProjectedDeductionVersion.findById(id);
    if (!version) {
      return res.status(404).json({ success: false, error: 'Version not found' });
    }

    // Don't delete if it is the ONLY version for this settingType
    const count = await ProjectedDeductionVersion.countDocuments({ settingType: version.settingType });
    if (count <= 1) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete the only remaining baseline version for this setting.'
      });
    }

    await ProjectedDeductionVersion.findByIdAndDelete(id);

    // Sync singleton with the latest remaining version
    const latest = await ProjectedDeductionVersion.findOne({ settingType: version.settingType })
      .sort({ effectiveDate: -1, createdAt: -1 })
      .lean();

    if (latest) {
      const fieldKey = SETTING_TYPE_KEYS[version.settingType];
      if (fieldKey) {
        let settings = await ProjectedDeductionSetting.findOne();
        if (settings) {
          settings[fieldKey] = latest.amount;
          settings[`${fieldKey}EffectiveDate`] = latest.effectiveDate;
          await settings.save();
        }
      }
    }

    res.json({ success: true, message: 'Version deleted successfully' });
  } catch (err) {
    console.error("Error deleting version:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Oil Allowance Settings (Preserved) ──────────────────────────────────────
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
