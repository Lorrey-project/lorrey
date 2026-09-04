const mongoose = require('mongoose');

const othersCreditorSchema = new mongoose.Schema({
  slNo: { type: Number, default: 1 },
  creditorName: { type: String, required: true, trim: true },
  category: { type: String, default: 'Others', trim: true },
  invoiceNo: { type: String, default: '', trim: true },
  invoiceDate: { type: String, default: '' },
  date: { type: String, default: '' },
  credit: { type: Number, default: 0 },
  debit: { type: Number, default: 0 },
  balance: { type: Number, default: 0 },
  billAmount: { type: Number, default: 0 },
  gstAmount: { type: Number, default: 0 },
  tdsDeduction: { type: Number, default: 0 },
  netAmount: { type: Number, default: 0 },
  paidAmount: { type: Number, default: 0 },
  balanceDue: { type: Number, default: 0 },
  paymentDate: { type: String, default: '' },
  paymentMode: { type: String, default: 'Bank Transfer' },
  status: { type: String, enum: ['Pending', 'Partial', 'Cleared'], default: 'Pending' },
  remarks: { type: String, default: '' },
  month: { type: Number },
  year: { type: String }
}, {
  timestamps: true,
  strict: false
});

module.exports = mongoose.model('OthersCreditor', othersCreditorSchema);

