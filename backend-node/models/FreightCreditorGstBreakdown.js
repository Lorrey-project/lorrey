const mongoose = require('mongoose');

const freightCreditorGstBreakdownSchema = new mongoose.Schema({
  creditorKey: {
    type: String,
    required: true,
    trim: true,
    uppercase: true, // 'DIPALI_ASSOCIATES' | 'GKR_ENTERPRISE' | 'SUBHENDU_SEKHAR_GHOSWAMI'
  },
  ownerName: {
    type: String,
    default: '',
    trim: true,
  },
  vehicleNo: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
  },
  fy: {
    type: String,
    required: true,
    trim: true, // e.g. '26-27' or 'FY 2026-27'
  },
  month: {
    type: Number,
    required: true, // 1 - 12
  },
  year: {
    type: Number,
    required: true, // e.g. 2026
  },
  incentiveM2: {
    type: Number,
    default: null,
  },
  incentiveM1: {
    type: Number,
    default: null,
  }
}, { timestamps: true });

// Ensure unique record per creditor + vehicle + FY + month (never rely on array index)
freightCreditorGstBreakdownSchema.index(
  { creditorKey: 1, vehicleNo: 1, fy: 1, month: 1 },
  { unique: true }
);

module.exports = mongoose.model('FreightCreditorGstBreakdown', freightCreditorGstBreakdownSchema);
