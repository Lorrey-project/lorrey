const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  fileName: { type: String, required: true },
  fileUrl: { type: String, required: true },
}, { timestamps: true });

module.exports = mongoose.model('BillRegisterDocument', schema);
