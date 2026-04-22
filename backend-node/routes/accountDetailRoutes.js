const express = require('express');
const multer = require('multer');
const router = express.Router();
const AccountDetail = require('../models/AccountDetail');
const { getIO } = require('../socket');
const { parseBankStatement } = require('../utils/parseBankStatement');

// In-memory multer for bank statement uploads (max 10MB)
const statementUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.xlsx', '.xls', '.csv'];
    const ext = '.' + file.originalname.split('.').pop().toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel (.xlsx/.xls) and CSV files are supported'));
    }
  }
});

// Map frontend labels strictly to DB fields
const keyMap = {
  'Transaction Date': 'transactionDate',
  'Ledger Name': 'ledgerName',
  'Names': 'names',
  'Particulars': 'particulars',
  'Remarks': 'remarks',
  'Reference No': 'referenceNo',
  'Cheque No': 'chequeNo',
  'Withdraw': 'withdraw',
  'Deposit': 'deposit',
  'Closing Balance': 'closingBalance'
};
const reverseMap = Object.fromEntries(Object.entries(keyMap).map(([k, v]) => [v, k]));

function docToFrontend(doc) {
  const obj = { _id: doc._id.toString(), _source: doc._source || 'manual' };
  for (const [k, v] of Object.entries(reverseMap)) {
    obj[v] = doc[k] || '';
  }
  return obj;
}

// GET all
router.get('/', async (req, res) => {
  try {
    const docs = await AccountDetail.find().sort({ transactionDate: -1, createdAt: -1 });
    res.json({ success: true, entries: docs.map(docToFrontend) });
  } catch (error) {
    console.error('Fetch Account Details Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// BULK UPDATE (Create & Update)
router.put('/bulk-update', async (req, res) => {
  try {
    const { updates } = req.body;
    for (const item of updates) {
      if (item.isNewRow) {
        const newDoc = {};
        for (const [lbl, val] of Object.entries(item.changes)) {
          if (keyMap[lbl]) newDoc[keyMap[lbl]] = val;
        }
        await AccountDetail.create(newDoc);
      } else if (item.id) {
        const updateDoc = {};
        for (const [lbl, val] of Object.entries(item.changes)) {
          if (keyMap[lbl]) updateDoc[keyMap[lbl]] = val;
        }
        await AccountDetail.findByIdAndUpdate(item.id, updateDoc);
      }
    }
    
    try {
      const io = getIO();
      if (io) io.emit('accountDetailsUpdate', { action: 'bulk-update' });
    } catch (socketErr) {
      console.warn('Socket notify failed:', socketErr.message);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Bulk Update Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// BULK DELETE
router.delete('/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
    await AccountDetail.deleteMany({ _id: { $in: ids } });
    
    try {
      const io = getIO();
      if (io) io.emit('accountDetailsUpdate', { action: 'bulk-delete' });
    } catch (socketErr) {
      console.warn('Socket notify failed:', socketErr.message);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Bulk Delete Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// UPLOAD & PARSE BANK STATEMENT
router.post('/upload-statement', statementUpload.single('statement'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
    
    const { transactions, colMap } = parseBankStatement(req.file.buffer, req.file.originalname);
    req.file.debugColMap = colMap;
    
    if (transactions.length === 0) {
      const debugInfo = req.file.debugColMap ? ` (MAPPED: ${JSON.stringify(req.file.debugColMap)})` : '';
      console.warn(`[StatementUpload] No transactions found in file: ${req.file.originalname}`);
      return res.status(400).json({ success: false, error: `No transactions found. Please check headers. ${debugInfo}` });
    }

    console.log(`[StatementUpload] Found ${transactions.length} transactions for file: ${req.file.originalname}`);
    await AccountDetail.insertMany(transactions);
    
    try {
      const io = getIO();
      if (io) io.emit('accountDetailsUpdate', { action: 'bank-statement-upload' });
    } catch (socketErr) {
      console.warn('Socket notify failed:', socketErr.message);
    }

    res.json({ success: true, count: transactions.length });
  } catch (error) {
    console.error('Upload Statement Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
