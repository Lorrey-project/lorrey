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
  // Legacy singular fields (kept for backward compat)
  damageVehicle: { type: String },
  damageTrip: { type: Object },
  // New plural fields used by the Damage/Shortage modal
  damageYear: { type: String },
  damageMonth: { type: String },
  damageVehicles: { type: [String], default: [] },
  damageTrips: { type: mongoose.Schema.Types.Mixed, default: [] },
  damageVehicleAmounts: { type: mongoose.Schema.Types.Mixed, default: {} },
  slNo: { type: Number },
  hidden: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('FinancialYearRow', fyRowSchema);
