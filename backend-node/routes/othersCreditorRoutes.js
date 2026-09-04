const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const OthersCreditor = require('../models/OthersCreditor');

const num = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};

// Compute row metrics for both old format and new creditor tab schemas
function computeRowMetrics(row) {
  if (row.amount !== undefined && (row.billAmount === undefined || row.billAmount === 0)) {
    const amt = num(row.amount);
    const paid = num(row.paidAmount);
    const bal = Math.round((amt - paid) * 100) / 100;
    return {
      ...row,
      amount: amt,
      paidAmount: paid,
      balance: bal
    };
  }

  const billAmt = num(row.billAmount);
  const gstAmt = num(row.gstAmount);
  const tdsAmt = num(row.tdsDeduction);
  const paidAmt = num(row.paidAmount);

  const netAmount = Math.round((billAmt + gstAmt - tdsAmt) * 100) / 100;
  const balanceDue = Math.max(0, Math.round((netAmount - paidAmt) * 100) / 100);

  let status = 'Pending';
  if (paidAmt >= netAmount && netAmount > 0) {
    status = 'Cleared';
  } else if (paidAmt > 0 && paidAmt < netAmount) {
    status = 'Partial';
  }

  return {
    ...row,
    billAmount: billAmt,
    gstAmount: gstAmt,
    tdsDeduction: tdsAmt,
    netAmount,
    paidAmount: paidAmt,
    balanceDue,
    status
  };
}

// ── GET /api/others-creditors ───────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { month, year, creditorName } = req.query;
    const query = {};

    if (month && month !== 'ALL') {
      query.month = parseInt(month, 10);
    }
    if (year && year !== 'ALL') {
      query.year = String(year);
    }
    if (creditorName) {
      query.creditorName = creditorName;
    }

    const entries = await OthersCreditor.find(query).sort({ slNo: 1, createdAt: 1 }).lean();
    res.json({ success: true, count: entries.length, entries });
  } catch (err) {
    console.error('[OthersCreditor] Fetch error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/others-creditors ──────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const data = computeRowMetrics(req.body);
    if (!data.creditorName) {
      return res.status(400).json({ success: false, error: 'Creditor / Vendor Name is required' });
    }

    const count = await OthersCreditor.countDocuments({ month: data.month, year: data.year });
    data.slNo = data.slNo || count + 1;

    const entry = new OthersCreditor(data);
    await entry.save();

    res.status(201).json({ success: true, entry });
  } catch (err) {
    console.error('[OthersCreditor] Create error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /api/others-creditors/:id ───────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const data = computeRowMetrics(req.body);
    const updated = await OthersCreditor.findByIdAndUpdate(
      req.params.id,
      { $set: data },
      { new: true, runValidators: true }
    );
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }
    res.json({ success: true, entry: updated });
  } catch (err) {
    console.error('[OthersCreditor] Update error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/others-creditors/bulk-save ────────────────────────────────────
router.post('/bulk-save', async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows)) {
      return res.status(400).json({ success: false, error: 'Provide an array of rows' });
    }

    const saved = [];
    for (let i = 0; i < rows.length; i++) {
      const r = computeRowMetrics(rows[i]);
      r.slNo = i + 1;

      if (r._id && mongoose.Types.ObjectId.isValid(r._id)) {
        const updated = await OthersCreditor.findByIdAndUpdate(r._id, { $set: r }, { new: true, upsert: true });
        saved.push(updated);
      } else {
        delete r._id;
        const created = new OthersCreditor(r);
        await created.save();
        saved.push(created);
      }
    }

    res.json({ success: true, count: saved.length, entries: saved });
  } catch (err) {
    console.error('[OthersCreditor] Bulk save error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /api/others-creditors/:id ────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await OthersCreditor.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }
    res.json({ success: true, message: 'Record deleted' });
  } catch (err) {
    console.error('[OthersCreditor] Delete error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/others-creditors/bulk-delete ──────────────────────────────────
router.post('/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'Provide an array of ids' });
    }

    const result = await OthersCreditor.deleteMany({ _id: { $in: ids } });
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    console.error('[OthersCreditor] Bulk delete error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
