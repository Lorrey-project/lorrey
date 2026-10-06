const mongoose = require("mongoose");

const voucherSchema = new mongoose.Schema(
  {
    voucherNumber: {
      type: String,
      required: true,
      unique: true,
    },
    voucherType: {
      type: String,
      enum: ["DEBIT", "CREDIT"],
      default: "DEBIT",
    },
    ownerId: {
      type: String,
      default: null,
    },
    ownerName: {
      type: String,
      default: "",
    },
    vehicleId: {
      type: String,
      default: null,
    },
    expenseType: {
      type: String,
      default: "Indirect Expense",
    },
    vehicleNumber: {
      type: String,
      trim: true,
      uppercase: true,
    },
    date: {
      type: Date,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: [0.01, "Amount must be positive"],
    },
    purpose: {
      type: String,
      default: "Others",
    },
    slip_url: {
      type: String,
      default: null,
    },
    invoiceId: {
      type: String,
      default: null,
    },
    remarks: {
      type: String,
      default: "",
    },
    name: {
      type: String,
      default: "",
    },
    reason: {
      type: String,
      default: "",
    },
    createdByRole: {
      type: String,
      default: "OFFICE",
    },
    appliedToCementId: {
      type: String,
      default: null,
    },
    appliedField: {
      type: String,
      default: null,
    },
    appliedAmount: {
      type: Number,
      default: 0,
    },
    appliedPanel: {
      type: String,
      default: null,
    },
    appliedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Voucher", voucherSchema);
