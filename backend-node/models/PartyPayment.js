const mongoose = require('mongoose');

const partyPaymentSchema = new mongoose.Schema({
  month: {
    type: Number,
    required: true,
  },
  year: {
    type: Number,
    required: true,
  },
  vehicleNo: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
  },
  // Manual Entries
  gstFcm: { type: Number, default: 0 },
  withholdAmount: { type: Number, default: 0 },
  withholdReason: { type: String, default: '' },
  otherReason: { type: String, default: '' },
  prevMonthDue: { type: Number, default: 0 },
  recoveredToDac: { type: Number, default: 0 },
  creditRefund: { type: Number, default: 0 },
  paidToParty: { type: Number, default: 0 },
  paymentDate: { type: String, default: '' },
  remarks: { type: String, default: '' }
}, { timestamps: true });

// Ensure one record per vehicle per month
partyPaymentSchema.index({ vehicleNo: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('PartyPayment', partyPaymentSchema);
