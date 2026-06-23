const mongoose = require('mongoose');

const fyRowSchema = new mongoose.Schema({
  billNo: { type: String, required: true, unique: true },
  billType: { type: String, default: 'FREIGHT' },
  editedInvoiceDate: { type: String },
  editedInvoiceNumber: { type: String },
  editedMonth: { type: String },
  editedSite: { type: String },
  editedAmount: { type: Number },
  debitReason: { type: String, default: 'None' },
  damageMonth: { type: String },
  damageVehicle: { type: String },
  damageTrip: { type: Object },
  hidden: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('FinancialYearRow', fyRowSchema);
