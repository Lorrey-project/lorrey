const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const { getIO } = require('../socket');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

const optionalAuth = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
    } catch (err) {
      // invalid token, proceed anyway
    }
  }
  next();
};

const getCollection = () => mongoose.connection.db.collection('indirect_expenses');

const MONTH_KEYS = [
  'april', 'may', 'june', 'july', 'august', 'september',
  'october', 'november', 'december', 'january', 'february', 'march'
];

// Helper to sanitize months object
function sanitizeMonths(inputMonths = {}) {
  const res = {};
  for (const m of MONTH_KEYS) {
    const item = inputMonths[m] || {};
    const bankVal = item.bank !== undefined && item.bank !== null && item.bank !== '' ? Number(item.bank) || 0 : '';
    const cashRaw = item.officeCash !== undefined && item.officeCash !== null && item.officeCash !== '' ? item.officeCash : item.cash;
    const cashVal = cashRaw !== undefined && cashRaw !== null && cashRaw !== '' ? Number(cashRaw) || 0 : '';
    const siteCashVal = item.siteCash !== undefined && item.siteCash !== null && item.siteCash !== '' ? Number(item.siteCash) || 0 : '';

    res[m] = {
      bank: bankVal,
      cash: cashVal,
      siteCash: siteCashVal
    };
  }
  return res;
}

// ── GET /indirect-expense ───────────────────────────────────────────────────
router.get('/', optionalAuth, async (req, res) => {
  try {
    const col = getCollection();
    const { fy } = req.query;
    const query = {};
    if (fy) {
      query.financialYear = fy;
    }
    const entries = await col.find(query).sort({ slNo: 1, created_at: 1 }).toArray();
    res.json({ success: true, count: entries.length, entries });
  } catch (error) {
    console.error('[IndirectExpense] GET error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── POST /indirect-expense ──────────────────────────────────────────────────
router.post('/', optionalAuth, async (req, res) => {
  try {
    const col = getCollection();
    const fy = req.body.financialYear || 'FY 2026-27';
    const count = await col.countDocuments({ financialYear: fy });
    const slNo = req.body.slNo !== undefined ? Number(req.body.slNo) : (count + 1);

    const doc = {
      slNo,
      date: req.body.date || new Date().toISOString().split('T')[0],
      billType: req.body.billType || '',
      particulars: req.body.particulars || '',
      financialYear: fy,
      months: sanitizeMonths(req.body.months),
      remarks: req.body.remarks || '',
      sourceType: req.body.sourceType || 'MANUAL',
      sourceManojBandhanId: req.body.sourceManojBandhanId || '',
      sourceBankBookId: req.body.sourceBankBookId || '',
      sourceVoucherId: req.body.sourceVoucherId || '',
      panelSource: req.body.panelSource || '',
      voucherIds: Array.isArray(req.body.voucherIds) ? req.body.voucherIds : (req.body.sourceVoucherId ? [req.body.sourceVoucherId] : []),
      created_at: new Date(),
      updated_at: new Date()
    };

    const result = await col.insertOne(doc);
    const newEntry = { _id: result.insertedId, ...doc };

    try {
      const io = getIO();
      if (io) io.emit('indirectExpenseUpdates', { action: 'create', entry: newEntry });
    } catch (_) {}

    res.status(201).json({ success: true, entry: newEntry });
  } catch (error) {
    console.error('[IndirectExpense] POST error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ── PUT /indirect-expense/bulk-update ───────────────────────────────────────
router.put('/bulk-update', optionalAuth, async (req, res) => {
  try {
    const col = getCollection();
    const { updates } = req.body;
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No updates provided' });
    }

    const bulkOps = updates.map(u => {
      const { id, changes } = u;
      const setObj = {};
      if (changes.slNo !== undefined) setObj.slNo = Number(changes.slNo);
      if (changes.date !== undefined) setObj.date = String(changes.date);
      if (changes.billType !== undefined) setObj.billType = String(changes.billType);
      if (changes.particulars !== undefined) setObj.particulars = String(changes.particulars);
      if (changes.financialYear !== undefined) setObj.financialYear = String(changes.financialYear);
      if (changes.remarks !== undefined) setObj.remarks = String(changes.remarks);
      if (changes.sourceType !== undefined) setObj.sourceType = String(changes.sourceType);
      if (changes.sourceManojBandhanId !== undefined) setObj.sourceManojBandhanId = String(changes.sourceManojBandhanId);
      if (changes.sourceBankBookId !== undefined) setObj.sourceBankBookId = String(changes.sourceBankBookId);
      if (changes.sourceVoucherId !== undefined) setObj.sourceVoucherId = String(changes.sourceVoucherId);
      if (changes.panelSource !== undefined) setObj.panelSource = String(changes.panelSource);
      if (changes.months !== undefined) {
        setObj.months = sanitizeMonths(changes.months);
      }

      setObj.updated_at = new Date();

      return {
        updateOne: {
          filter: { _id: new ObjectId(id) },
          update: { $set: setObj }
        }
      };
    });

    const result = await col.bulkWrite(bulkOps, { ordered: false });

    try {
      const io = getIO();
      if (io) io.emit('indirectExpenseUpdates', { action: 'bulkUpdate' });
    } catch (_) {}

    res.json({ success: true, modifiedCount: result.modifiedCount });
  } catch (error) {
    console.error('[IndirectExpense] Bulk update error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── DELETE /indirect-expense/bulk-delete ────────────────────────────────────
router.delete('/bulk-delete', optionalAuth, async (req, res) => {
  try {
    const col = getCollection();
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'No IDs provided' });
    }

    const objectIds = ids.map(id => new ObjectId(id));
    const result = await col.deleteMany({ _id: { $in: objectIds } });

    try {
      const io = getIO();
      if (io) io.emit('indirectExpenseUpdates', { action: 'bulkDelete', ids });
    } catch (_) {}

    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (error) {
    console.error('[IndirectExpense] Bulk delete error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── DELETE /indirect-expense/:id ───────────────────────────────────────────
router.delete('/:id', optionalAuth, async (req, res) => {
  try {
    const col = getCollection();
    const { id } = req.params;
    const result = await col.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, error: 'Row not found' });
    }

    try {
      const io = getIO();
      if (io) io.emit('indirectExpenseUpdates', { action: 'delete', id });
    } catch (_) {}

    res.json({ success: true, message: 'Row deleted' });
  } catch (error) {
    console.error('[IndirectExpense] Delete error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
