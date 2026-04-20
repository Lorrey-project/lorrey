const mongoose = require('mongoose');

const fyRowSchema = new mongoose.Schema({
  billNo: { type: String, required: true, unique: true },
  billType: { type: String, default: 'FREIGHT' },
  editedInvoiceDate: { type: String },
  editedInvoiceNumber: { type: String },
  editedMonth: { type: String },
  editedSite: { type: String },
  editedAmount: { type: Number }
}, { timestamps: true });

module.exports = mongoose.model('FinancialYearRow', fyRowSchema);
