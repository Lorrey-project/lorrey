const mongoose = require('mongoose');

const fyPaymentSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  billNos: [{ type: String }], // Array of exactly matched invoice/bill fields
  paymentAmount: { type: Number, default: 0 },
  paymentDate: { type: String, default: '' },
  referenceNo: { type: String, default: '' },
  debitAmount: { type: Number, default: 0 },
  remarks: { type: String, default: '' },
  paymentProofUrl: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('FinancialYearPayment', fyPaymentSchema);
