const mongoose = require('mongoose');

const accountDetailSchema = new mongoose.Schema({
  transactionDate: { type: String, default: '' },
  ledgerName: { type: String, default: '' },
  names: { type: String, default: '' },
  particulars: { type: String, default: '' },
  remarks: { type: String, default: '' },
  referenceNo: { type: String, default: '' },
  chequeNo: { type: String, default: '' },
  withdraw: { type: String, default: '' },
  deposit: { type: String, default: '' },
  closingBalance: { type: String, default: '' },
  remittanceFileUrl: { type: String, default: '' },
  remittanceFileName: { type: String, default: '' },
  _source: { type: String, default: 'manual' }
}, {
  timestamps: true,
  collection: 'account_details'
});

module.exports = mongoose.model('AccountDetail', accountDetailSchema);
