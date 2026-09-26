const mongoose = require('mongoose');

const incentiveProjectActualSchema = new mongoose.Schema({
  financialYear: { type: String, required: true, trim: true },
  year: { type: Number, required: true },
  month: { type: Number, required: true }, // 0-indexed or 1-indexed (stored consistently with year)
  sourceHeadline: { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true },
  targetField: { type: String, enum: ['nvl', 'nvcl', 'w10', 'w6'], required: true },
  subField: { type: String, trim: true },
  truckNo: { type: String, required: true, uppercase: true, trim: true },
  rawTruckNo: { type: String, trim: true },
  amount: { type: Number, required: true, default: 0 },
  uploadSourceId: { type: String, trim: true },
  uploadedAt: { type: Date, default: Date.now }
}, {
  timestamps: true,
  collection: 'incentive_project_actuals'
});

incentiveProjectActualSchema.index({ year: 1, month: 1, category: 1, truckNo: 1 }, { unique: true });
incentiveProjectActualSchema.index({ truckNo: 1, year: 1, month: 1 });
incentiveProjectActualSchema.index({ financialYear: 1, month: 1 });

const db = mongoose.connection.useDb('cement_register');
module.exports = db.model('IncentiveProjectActual', incentiveProjectActualSchema);
