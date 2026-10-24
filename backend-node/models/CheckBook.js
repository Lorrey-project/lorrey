const mongoose = require('mongoose');

const checkBookSchema = new mongoose.Schema(
  {
    checkNumber: {
      type: String,
      required: true,
      trim: true,
    },
    checkAmount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    documentUrl: {
      type: String,
      required: true,
    },
    documentType: {
      type: String,
      default: '',
    },
    documentName: {
      type: String,
      default: '',
    },
    remarks: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: true,
    collection: 'check_books',
  }
);

// Named unique index to ensure uniqueness of checkNumber across all check records
checkBookSchema.index({ checkNumber: 1 }, { unique: true, name: 'check_number_unique_idx' });

module.exports = mongoose.model('CheckBook', checkBookSchema);
