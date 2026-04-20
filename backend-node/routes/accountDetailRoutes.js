const express = require('express');
const router = express.Router();
const AccountDetail = require('../models/AccountDetail');
const { getIo } = require('../socket');

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
  const obj = { _id: doc._id.toString() };
  for (const [k, v] of Object.entries(reverseMap)) {
    obj[v] = doc[k] || '';
  }
  return obj;
}

// GET all
router.get('/', async (req, res) => {
  try {
    const docs = await AccountDetail.find().sort({ createdAt: -1 });
    res.json({ success: true, entries: docs.map(docToFrontend) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// BULK UPDATE (Create & Update)
router.put('/bulk-update', async (req, res) => {
  try {
    const { updates } = req.body;
    for (const item of updates) {
      if (item.isNewRow) {
        // Create new
        const newDoc = {};
        for (const [lbl, val] of Object.entries(item.changes)) {
          if (keyMap[lbl]) newDoc[keyMap[lbl]] = val;
        }
        await AccountDetail.create(newDoc);
      } else if (item.id) {
        // Update existing
        const updateDoc = {};
        for (const [lbl, val] of Object.entries(item.changes)) {
          if (keyMap[lbl]) updateDoc[keyMap[lbl]] = val;
        }
        await AccountDetail.findByIdAndUpdate(item.id, updateDoc);
      }
    }
    
    // Notify clients
    const io = getIo();
    if (io) io.emit('accountDetailsUpdate', { action: 'bulk-update' });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// BULK DELETE
router.delete('/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
    await AccountDetail.deleteMany({ _id: { $in: ids } });

    // Notify clients
    const io = getIo();
    if (io) io.emit('accountDetailsUpdate', { action: 'bulk-delete' });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// BULK IMPORT
router.post('/bulk', async (req, res) => {
  try {
    const { entries } = req.body;
    if (!Array.isArray(entries)) return res.status(400).json({ error: 'entries array required' });

    const insertDocs = entries.map(row => {
      const d = {};
      for (const [lbl, val] of Object.entries(row)) {
        if (keyMap[lbl]) d[keyMap[lbl]] = val;
      }
      return d;
    });

    await AccountDetail.insertMany(insertDocs);

    // Notify clients
    const io = getIo();
    if (io) io.emit('accountDetailsUpdate', { action: 'bulk-import' });

    res.json({ success: true, count: insertDocs.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
