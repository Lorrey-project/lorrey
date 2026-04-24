const mongoose = require("mongoose");

const voucherSchema = new mongoose.Schema(
  {
    voucherNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    expenseType: {
      type: String,
      enum: ["Direct Expense", "Indirect Expense"],
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
      min: [1, "Amount must be positive"],
    },
    purpose: {
      type: String,
      required: true,
      enum: ["Fuel", "Advance", "Repair", "Toll", "Others", "Water", "Cleaning", "WiFi Recharge", "Salary"],
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
  },
  { timestamps: true }
);

module.exports = mongoose.model("Voucher", voucherSchema);
