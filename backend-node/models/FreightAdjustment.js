const mongoose = require("mongoose");

/**
 * FreightAdjustment
 * Supports TWO distinct adjustment systems:
 * 1. Top Section: category = "deduction" (subtracted to get NET BALANCE)
 * 2. Bottom Section: category = "addition" (added to get NET PAYABLE)
 */
const freightAdjustmentSchema = new mongoose.Schema(
  {
    // Owner identifier (MongoDB ID if available and name)
    ownerId: { type: String, default: "", trim: true },
    ownerName: { type: String, required: true, trim: true },

    // Vehicle identifier (MongoDB ID if available and vehicle number)
    vehicleId: { type: String, default: "", trim: true },
    vehicleNo: { type: String, required: true, trim: true },

    // Report / summary context
    month: { type: String, default: "", trim: true },
    financialYear: { type: String, default: "", trim: true },
    summaryRecordId: { type: String, default: "", trim: true },

    // "deduction" for Top Section (reduces NET BALANCE)
    // "addition" for Bottom Section (increases NET PAYABLE)
    category: { type: String, enum: ["deduction", "addition"], default: "addition" },

    // Reason / Description
    reason: { type: String, default: "", trim: true },
    label: { type: String, default: "", trim: true },

    // Amount in INR
    amount: { type: Number, default: 0 },

    // Top section type: 'advance_bank_tf' | 'rfid' | 'damage_shortage' | 'gps_installation' | 'others' | 'manual'
    adjustmentType: { type: String, default: "manual", trim: true },
    othersDescription: { type: String, default: "", trim: true },

    // Display sequence
    sequence: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Compound index for fast lookup
freightAdjustmentSchema.index({ ownerName: 1, vehicleNo: 1, month: 1, financialYear: 1, category: 1, sequence: 1 });

module.exports = mongoose.model("FreightAdjustment", freightAdjustmentSchema);


