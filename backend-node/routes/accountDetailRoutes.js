const express = require('express');
const multer = require('multer');
const router = express.Router();
const AccountDetail = require('../models/AccountDetail');
const { getIO } = require('../socket');
const { parseBankStatement } = require('../utils/parseBankStatement');
const remittanceUpload = require('../middleware/remittanceUpload');

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
  'Closing Balance': 'closingBalance',
  'remittanceFileUrl': 'remittanceFileUrl',
  'remittanceFileName': 'remittanceFileName'
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

// GET already-uploaded bank statement date ranges
router.get('/uploaded-date-ranges', async (req, res) => {
  try {
    const docs = await AccountDetail.find({ _source: 'bank_statement' }, { transactionDate: 1 });
    const dateSet = new Set();
    docs.forEach(d => { if (d.transactionDate) dateSet.add(d.transactionDate); });
    res.json({ success: true, uploadedDates: Array.from(dateSet).sort() });
  } catch (error) {
    console.error('Fetch uploaded date ranges error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// UPLOAD & PARSE BANK STATEMENT
router.post('/upload-statement', statementUpload.single('statement'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

    const { fromDate, toDate } = req.body;
    if (!fromDate || !toDate) {
      return res.status(400).json({ success: false, error: 'fromDate and toDate are required.' });
    }

    // Check for existing bank statement records in this date range
    const existing = await AccountDetail.findOne({
      _source: 'bank_statement',
      transactionDate: { $gte: fromDate, $lte: toDate }
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: `A bank statement has already been uploaded for date(s) within ${fromDate} to ${toDate}. Please delete existing entries first.`,
        conflictDate: existing.transactionDate
      });
    }

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

    res.json({ success: true, count: transactions.length, fromDate, toDate });
  } catch (error) {
    console.error('Upload Statement Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// UPLOAD REMITTANCE FOR SPECIFIC ROW
router.post('/upload-remittance/:id', remittanceUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded.' });

    const doc = await AccountDetail.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: 'Record not found.' });

    doc.remittanceFileUrl = req.file.location;
    doc.remittanceFileName = req.file.originalname;
    await doc.save();

    try {
      const io = getIO();
      if (io) io.emit('accountDetailsUpdate', { action: 'remittance-upload' });
    } catch (_) {}

    res.json({ success: true, url: doc.remittanceFileUrl, filename: doc.remittanceFileName });
  } catch (error) {
    console.error('Row Remittance Upload Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// CLEAR MAIN CASH: called when Ledger Name is changed away from "Main Cash"
// Resets P_WITHDRAW + P_SOURCE in the matching cashbook row
router.post('/clear-main-cash', async (req, res) => {
  try {
    const { transactionDate } = req.body;
    if (!transactionDate) {
      return res.status(400).json({ success: false, error: 'transactionDate required' });
    }

    // Normalized date parsing: handles YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY
    const parts = transactionDate.split(/[-\/]/);
    let d, m, y;
    if (parts[0].length === 4) { // YYYY-MM-DD
      y = parseInt(parts[0], 10); m = parseInt(parts[1], 10); d = parseInt(parts[2], 10);
    } else { // DD-MM-YYYY or DD/MM/YYYY
      d = parseInt(parts[0], 10); m = parseInt(parts[1], 10); y = parseInt(parts[2], 10);
    }

    if (isNaN(d) || isNaN(m) || isNaN(y)) {
      return res.status(400).json({ success: false, error: `Invalid date format: ${transactionDate}` });
    }

    const dateVariants = [
      `${d}-${m}-${y}`,
      `${String(d).padStart(2, '0')}-${m}-${y}`,
      `${d}-${String(m).padStart(2, '0')}-${y}`,
      `${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}-${y}`,
    ];

    const mongoose = require('mongoose');
    const col = mongoose.connection.useDb('main_cashbook').collection('entries');

    const cashbookRow = await col.findOne({ DATE: { $in: dateVariants }, month: m, year: y });
    if (!cashbookRow) {
      // Row doesn't exist — nothing to clear, treat as success
      return res.json({ success: true, cleared: false, msg: 'No cashbook row found for this date — nothing to clear.' });
    }

    await col.updateOne(
      { _id: cashbookRow._id },
      { $set: { P_WITHDRAW: 0, P_SOURCE: '' } }
    );

    try {
      const io = getIO();
      if (io) io.emit('mainCashbookUpdates', { action: 'clear-main-cash', date: transactionDate });
    } catch (socketErr) {
      console.warn('Socket notify failed:', socketErr.message);
    }

    console.log(`[ClearMainCash] Cleared cashbook P_WITHDRAW/P_SOURCE for ${transactionDate}`);
    res.json({ success: true, cleared: true, date: transactionDate });
  } catch (error) {
    console.error('Clear Main Cash Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


// SYNC MAIN CASH: called when Ledger Name = "Main Cash" is saved in Account Details
// Finds the matching Main Cashbook row by date and patches P_WITHDRAW + P_SOURCE
router.post('/sync-main-cash', async (req, res) => {
  try {
    const { transactionDate, withdrawAmount } = req.body;
    if (!transactionDate || withdrawAmount === undefined) {
      return res.status(400).json({ success: false, error: 'transactionDate and withdrawAmount required' });
    }

    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ success: false, error: 'withdrawAmount must be a positive number' });
    }

    // Normalized date parsing: handles YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY
    const parts = transactionDate.split(/[-\/]/);
    let d, m, y;
    if (parts[0].length === 4) { // YYYY-MM-DD
      y = parseInt(parts[0], 10); m = parseInt(parts[1], 10); d = parseInt(parts[2], 10);
    } else { // DD-MM-YYYY or DD/MM/YYYY
      d = parseInt(parts[0], 10); m = parseInt(parts[1], 10); y = parseInt(parts[2], 10);
    }

    if (isNaN(d) || isNaN(m) || isNaN(y)) {
      return res.status(400).json({ success: false, error: `Invalid date format: ${transactionDate}` });
    }

    const dateVariants = [
      `${d}-${m}-${y}`,
      `${String(d).padStart(2, '0')}-${m}-${y}`,
      `${d}-${String(m).padStart(2, '0')}-${y}`,
      `${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}-${y}`,
    ];

    const mongoose = require('mongoose');
    const col = mongoose.connection.useDb('main_cashbook').collection('entries');

    const sourceText = `DAC-RS-${amount}\\-`;

    // Find matching cashbook row
    let cashbookRow = await col.findOne({ DATE: { $in: dateVariants }, month: m, year: y });
    
    if (!cashbookRow) {
      // Create new row if missing
      const highest = await col.find({ month: m, year: y }).sort({ "SL NO": -1 }).limit(1).toArray();
      const nextSl = highest.length > 0 && typeof highest[0]["SL NO"] === 'number'
        ? highest[0]["SL NO"] + 1 : 1;

      const newEntry = {
        DATE: `${d}-${m}-${y}`,
        month: m,
        year: y,
        "SL NO": nextSl,
        P_OPENING: 0,
        P_SOURCE: sourceText,
        P_WITHDRAW: amount,
        P_GIVEN_DAC: 0,
        P_GIVEN_OFFICE: 0,
        P_OTHERS: 0,
        S_OPENING: 0,
        S_TRANS_OFFICE: 0,
        S_TRANS_TO_OFFICE: 0,
        O_OPENING: 0,
        _created_at: new Date()
      };
      
      const result = await col.insertOne(newEntry);
      cashbookRow = { _id: result.insertedId, ...newEntry };
      console.log(`[SyncMainCash] Created new cashbook row for ${transactionDate}`);
    } else {
      // Update existing row
      await col.updateOne(
        { _id: cashbookRow._id },
        { $set: { P_WITHDRAW: amount, P_SOURCE: sourceText } }
      );
      console.log(`[SyncMainCash] Updated existing cashbook row for ${transactionDate}`);
    }

    try {
      const io = getIO();
      if (io) io.emit('mainCashbookUpdates', { action: 'sync-from-account-detail', date: transactionDate });
    } catch (socketErr) {
      console.warn('Socket notify failed:', socketErr.message);
    }

    console.log(`[SyncMainCash] Updated cashbook row for ${transactionDate}: P_WITHDRAW=${amount}, P_SOURCE="${sourceText}"`);
    res.json({ success: true, updatedDate: transactionDate, amount, sourceText });
  } catch (error) {
    console.error('Sync Main Cash Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
