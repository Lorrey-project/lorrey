const mongoose = require("mongoose");

const projectedDeductionSettingSchema = new mongoose.Schema(
  {
    damage: {
      type: Number,
      default: 476,
    },
    gpsDeviceInstallation: {
      type: Number,
      default: 1500,
    },
    rfid: {
      type: Number,
      default: 100,
    },
    gpsTripCharge: {
      type: Number,
      default: 145,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ProjectedDeductionSetting", projectedDeductionSettingSchema);
