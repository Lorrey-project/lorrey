const mongoose = require("mongoose");

const oilAllowanceSettingSchema = new mongoose.Schema(
  {
    extraCashExpenseAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("OilAllowanceSetting", oilAllowanceSettingSchema);
