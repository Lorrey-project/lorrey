const mongoose = require("mongoose");

const projectedDeductionSettingSchema = new mongoose.Schema(
  {
    damage: {
      type: Number,
      default: 476,
    },
    damageEffectiveDate: {
      type: String,
      default: '2026-01-01',
    },
    gpsDeviceInstallation: {
      type: Number,
      default: 1500,
    },
    gpsDeviceInstallationEffectiveDate: {
      type: String,
      default: '2026-01-01',
    },
    rfid: {
      type: Number,
      default: 100,
    },
    rfidEffectiveDate: {
      type: String,
      default: '2026-01-01',
    },
    gpsTripCharge: {
      type: Number,
      default: 145,
    },
    gpsTripChargeEffectiveDate: {
      type: String,
      default: '2026-01-01',
    },
    travellingExpense: {
      type: Number,
      default: 0,
    },
    travellingExpenseEffectiveDate: {
      type: String,
      default: '2026-01-01',
    },
    advanceBankTF: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ProjectedDeductionSetting", projectedDeductionSettingSchema);
