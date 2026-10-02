const mongoose = require("mongoose");

const projectedDeductionVersionSchema = new mongoose.Schema(
  {
    settingType: {
      type: String,
      required: true,
      enum: [
        'DAMAGE_DEDUCTION',
        'GPS_DEVICE_INSTALLATION',
        'RFID',
        'GPS_MONITORING_TRIP_CHARGE',
        'TRAVELLING_EXPENSE'
      ],
      index: true
    },
    amount: {
      type: Number,
      required: true
    },
    effectiveDate: {
      type: String, // Stored as 'YYYY-MM-DD' date-only string to prevent any timezone shifts
      required: true,
      index: true
    },
    createdBy: {
      type: String,
      default: 'admin'
    }
  },
  { timestamps: true }
);

// Compound index for fast queries: latest version on or before record date
projectedDeductionVersionSchema.index({ settingType: 1, effectiveDate: -1 });

module.exports = mongoose.model("ProjectedDeductionVersion", projectedDeductionVersionSchema);
