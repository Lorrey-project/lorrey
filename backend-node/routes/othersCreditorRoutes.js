const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const OthersCreditor = require('../models/OthersCreditor');
const truckContactUpload = require('../middleware/truckContactUpload');
const {
  applyFreightAdvanceToCement,
  reverseFreightAdvanceContribution,
  syncFreightAdvancesBatch,
  isQualifyingFreightAdvance
} = require('../utils/monojCementAdvanceManager');

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

// Parse date helper for chronological sorting
const parseToDate = (dStr) => {
  if (!dStr) return new Date(0);
  const clean = String(dStr).trim();
  if (clean.includes('-')) {
    const parts = clean.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      }
      return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
    }
  } else if (clean.includes('/')) {
    const parts = clean.split('/');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      }
      return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
    }
  }
  const dt = new Date(clean);
  if (!isNaN(dt.getTime())) return dt;
  return new Date(0);
};

// Helper: Check if a creditor name matches MANOJ / MONOJ BANDHAN
const isManojBandhan = (name) => /^m[ao]noj\s*bandhan$/i.test(String(name || '').trim());

// Continuous chronological balance recalculation for MANOJ BANDHAN
async function recalculateMonojBandhanBalances() {
  try {
    const allRows = await OthersCreditor.find({
      creditorName: { $in: ['MANOJ BANDHAN', 'MONOJ BANDHAN'] }
    });
    if (allRows.length === 0) return [];

    // Sort chronologically by date first, then slNo, then createdAt
    allRows.sort((a, b) => {
      const tA = parseToDate(a.date).getTime() || 0;
      const tB = parseToDate(b.date).getTime() || 0;
      if (tA && tB && tA !== tB) return tA - tB;
      if (tA && !tB) return -1;
      if (!tA && tB) return 1;
      const sA = num(a.slNo);
      const sB = num(b.slNo);
      if (sA && sB && sA !== sB) return sA - sB;
      const cA = new Date(a.createdAt || 0).getTime();
      const cB = new Date(b.createdAt || 0).getTime();
      if (cA && cB && cA !== cB) return cA - cB;
      return String(a._id || '').localeCompare(String(b._id || ''));
    });

    let runningBal = 0;
    const bulkOps = [];
    for (let i = 0; i < allRows.length; i++) {
      const row = allRows[i];
      const cr = num(row.credit);
      const dr = num(row.debit);
      runningBal = runningBal + cr - dr;
      const calculatedBal = Math.round(runningBal * 100) / 100;

      bulkOps.push({
        updateOne: {
          filter: { _id: row._id },
          update: { $set: { balance: calculatedBal } }
        }
      });
      row.balance = calculatedBal;
    }

    if (bulkOps.length > 0) {
      await OthersCreditor.bulkWrite(bulkOps);
    }

    try {
      const { getIO } = require('../socket');
      const io = getIO();
      if (io) {
        io.emit('othersCreditorUpdate', { creditorName: 'MANOJ BANDHAN' });
        io.emit('othersCreditorUpdate', { creditorName: 'MONOJ BANDHAN' });
      }
    } catch (e) {
      // socket might not be initialized in standalone scripts
    }

    return allRows;
  } catch (err) {
    console.error('[recalculateMonojBandhanBalances] Error:', err);
    return [];
  }
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
      if (isManojBandhan(creditorName)) {
        query.creditorName = { $in: ['MANOJ BANDHAN', 'MONOJ BANDHAN'] };
      } else {
        query.creditorName = creditorName;
      }
    }

    let entries = await OthersCreditor.find(query).sort({ slNo: 1, createdAt: 1 }).lean();
    if (creditorName && isManojBandhan(creditorName)) {
      entries.sort((a, b) => {
        const tA = parseToDate(a.date).getTime() || 0;
        const tB = parseToDate(b.date).getTime() || 0;
        if (tA && tB && tA !== tB) return tA - tB;
        if (tA && !tB) return -1;
        if (!tA && tB) return 1;
        const sA = num(a.slNo);
        const sB = num(b.slNo);
        if (sA && sB && sA !== sB) return sA - sB;
        const cA = new Date(a.createdAt || 0).getTime();
        const cB = new Date(b.createdAt || 0).getTime();
        if (cA && cB && cA !== cB) return cA - cB;
        return String(a._id || '').localeCompare(String(b._id || ''));
      });
    }
    res.json({ success: true, count: entries.length, entries });
  } catch (err) {
    console.error('[OthersCreditor] Fetch error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/others-creditors/next-sl-no ────────────────────────────────────
router.get('/next-sl-no', async (req, res) => {
  try {
    const { creditorName } = req.query;
    let query = {};
    if (creditorName) {
      if (isManojBandhan(creditorName)) {
        query.creditorName = { $in: ['MANOJ BANDHAN', 'MONOJ BANDHAN'] };
      } else {
        query.creditorName = creditorName;
      }
    }
    const maxDoc = await OthersCreditor.findOne(query).sort({ slNo: -1 }).lean();
    const nextSlNo = (maxDoc && maxDoc.slNo ? Number(maxDoc.slNo) : 0) + 1;
    res.json({ success: true, nextSlNo });
  } catch (err) {
    console.error('[OthersCreditor] next-sl-no error:', err);
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

    const isManoj = isManojBandhan(data.creditorName);
    if (isManoj) {
      data.creditorName = 'MANOJ BANDHAN';
      data.credit = 0; // Manual creation cannot set credit; credit is system-generated only
    }

    if (!data.slNo) {
      const slQuery = isManoj ? { creditorName: { $in: ['MANOJ BANDHAN', 'MONOJ BANDHAN'] } } : { creditorName: data.creditorName };
      const maxDoc = await OthersCreditor.findOne(slQuery).sort({ slNo: -1 }).lean();
      data.slNo = (maxDoc && maxDoc.slNo ? Number(maxDoc.slNo) : 0) + 1;
    }

    const entry = new OthersCreditor(data);
    await entry.save();

    let cementSyncResult = null;
    if (isManoj) {
      await recalculateMonojBandhanBalances();
    }
    if (isQualifyingFreightAdvance(entry)) {
      cementSyncResult = await applyFreightAdvanceToCement(entry);
    }

    res.status(201).json({ success: true, entry, cementSyncResult });
  } catch (err) {
    console.error('[OthersCreditor] Create error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /api/others-creditors/:id ───────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const existing = await OthersCreditor.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }

    if (isManojBandhan(existing.creditorName)) {
      return res.status(403).json({
        success: false,
        error: 'Saved MANOJ BANDHAN transactions are permanently locked and cannot be manually modified.'
      });
    }

    const data = computeRowMetrics(req.body);
    const updated = await OthersCreditor.findByIdAndUpdate(
      req.params.id,
      { $set: data },
      { new: true, runValidators: true }
    );

    let cementSyncResult = null;
    if (isQualifyingFreightAdvance(updated) || (existing._cementSync && existing._cementSync.applied)) {
      cementSyncResult = await applyFreightAdvanceToCement(updated);
    }

    res.json({ success: true, entry: updated, cementSyncResult });
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

    // Determine current highest slNo in database for new rows that don't have slNo
    let maxSl = 0;
    const maxDoc = await OthersCreditor.findOne({
      creditorName: { $in: ['MANOJ BANDHAN', 'MONOJ BANDHAN'] }
    }).sort({ slNo: -1 }).lean();
    if (maxDoc && maxDoc.slNo) maxSl = Number(maxDoc.slNo);

    const saved = [];
    let hasMonoj = false;
    for (let i = 0; i < rows.length; i++) {
      const rawRow = rows[i];
      const isManoj = isManojBandhan(rawRow.creditorName);

      if (isManoj) {
        hasMonoj = true;
        // If this is an existing saved MANOJ BANDHAN row with MongoDB _id
        if (rawRow._id && mongoose.Types.ObjectId.isValid(rawRow._id)) {
          const existingDoc = await OthersCreditor.findById(rawRow._id);
          if (existingDoc && isManojBandhan(existingDoc.creditorName)) {
            // Permanently locked historical row: do NOT overwrite from manual user bulk-save
            saved.push(existingDoc);
            continue;
          }
        }
      }

      const r = computeRowMetrics(rawRow);
      if (isManoj) {
        r.creditorName = 'MANOJ BANDHAN';
        // Manual creation must never set credit directly; credit is system-generated only
        r.credit = 0;
      }
      if (!r.slNo) {
        maxSl += 1;
        r.slNo = maxSl;
      } else {
        r.slNo = Number(r.slNo);
        if (r.slNo > maxSl) maxSl = r.slNo;
      }

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

    if (hasMonoj) {
      await recalculateMonojBandhanBalances();
    }
    const cementSyncResults = await syncFreightAdvancesBatch(saved);

    res.json({ success: true, count: saved.length, entries: saved, cementSyncResults });
  } catch (err) {
    console.error('[OthersCreditor] Bulk save error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /api/others-creditors/:id ────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const docToDelete = await OthersCreditor.findById(req.params.id);
    if (!docToDelete) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }

    if (isQualifyingFreightAdvance(docToDelete) || (docToDelete._cementSync && docToDelete._cementSync.applied)) {
      await reverseFreightAdvanceContribution(docToDelete);
    }

    const deleted = await OthersCreditor.findByIdAndDelete(req.params.id);
    if (deleted && isManojBandhan(deleted.creditorName)) {
      await recalculateMonojBandhanBalances();
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

    const docsToDelete = await OthersCreditor.find({ _id: { $in: ids } });
    for (const doc of docsToDelete) {
      if (isQualifyingFreightAdvance(doc) || (doc._cementSync && doc._cementSync.applied)) {
        await reverseFreightAdvanceContribution(doc);
      }
    }

    const result = await OthersCreditor.deleteMany({ _id: { $in: ids } });
    await recalculateMonojBandhanBalances();
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    console.error('[OthersCreditor] Bulk delete error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/others-creditors/upload-pdf ───────────────────────────────────
router.post('/upload-pdf', truckContactUpload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No PDF file uploaded.' });
    }
    const { rowId } = req.body;
    let updatedEntry = null;
    if (rowId && mongoose.Types.ObjectId.isValid(rowId)) {
      updatedEntry = await OthersCreditor.findByIdAndUpdate(
        rowId,
        { $set: { pdfUrl: req.file.location, pdfName: req.file.originalname } },
        { new: true }
      );
    }
    res.json({
      success: true,
      url: req.file.location,
      fileName: req.file.originalname,
      entry: updatedEntry
    });
  } catch (err) {
    console.error('[OthersCreditor] PDF Upload error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/others-creditors/remove-pdf ───────────────────────────────────
router.post('/remove-pdf', async (req, res) => {
  try {
    const { rowId } = req.body;
    if (rowId && mongoose.Types.ObjectId.isValid(rowId)) {
      await OthersCreditor.findByIdAndUpdate(
        rowId,
        { $set: { pdfUrl: '', pdfName: '' } },
        { new: true }
      );
    }
    res.json({ success: true, message: 'PDF removed.' });
  } catch (err) {
    console.error('[OthersCreditor] PDF Remove error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/others-creditors/monoj-bandhan/debit-rows ─────────────────────
// System 2: Fetch all Manoj Bandhan debit rows eligible for payment allocation
router.get('/monoj-bandhan/debit-rows', async (req, res) => {
  try {
    const rawRows = await OthersCreditor.find({
      creditorName: { $in: ['MANOJ BANDHAN', 'MONOJ BANDHAN'] },
      debit: { $gt: 0 }
    }).lean();

    // Sort chronologically by date, then slNo
    rawRows.sort((a, b) => {
      const tA = parseToDate(a.date).getTime() || 0;
      const tB = parseToDate(b.date).getTime() || 0;
      if (tA && tB && tA !== tB) return tA - tB;
      if (tA && !tB) return -1;
      if (!tA && tB) return 1;
      const sA = num(a.slNo);
      const sB = num(b.slNo);
      if (sA && sB && sA !== sB) return sA - sB;
      const cA = new Date(a.createdAt || 0).getTime();
      const cB = new Date(b.createdAt || 0).getTime();
      if (cA && cB && cA !== cB) return cA - cB;
      return String(a._id || '').localeCompare(String(b._id || ''));
    });

    const eligibleDebitRows = [];
    for (const r of rawRows) {
      const originalDebit = num(r.debit);
      const paid = num(r.paidAmount);
      const outstanding = Math.max(0, Math.round((originalDebit - paid) * 100) / 100);
      const isPaid = outstanding <= 0 || r.status === 'Paid' || r.status === 'Cleared';

      // TASK 2: Only rows with remaining outstanding amount (> 0 and not fully Paid) appear
      if (!isPaid && outstanding > 0.001) {
        eligibleDebitRows.push({
          _id: r._id,
          slNo: r.slNo,
          date: r.date,
          ledgerName: r.ledgerName || '',
          names: r.names || '',
          vehicleNo: r.vehicleNo || '',
          debit: originalDebit,
          paidAmount: paid,
          outstanding: outstanding,
          status: paid > 0 ? 'Partial' : 'Unpaid',
          remarks: r.remarks || '',
          allocations: r.allocations || []
        });
      }
    }

    res.json({ success: true, debitRows: eligibleDebitRows });
  } catch (err) {
    console.error('[OthersCreditor] Fetch debit rows error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/others-creditors/monoj-bandhan/allocate-debits ───────────────
// System 2: Debit Row Payment Allocation
router.post('/monoj-bandhan/allocate-debits', async (req, res) => {
  try {
    const {
      bankBookTxId,
      bankBookDate,
      bankBookMonth,
      withdrawAmount,
      selectedDebitIds,
      customAllocations
    } = req.body;

    const totalWithdraw = num(withdrawAmount);
    if (totalWithdraw <= 0) {
      return res.status(400).json({ success: false, error: 'Withdraw amount must be greater than 0.' });
    }

    if (!selectedDebitIds || !Array.isArray(selectedDebitIds) || selectedDebitIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Please select at least one debit row for payment allocation.' });
    }

    // If this Bank Book transaction was already allocated (e.g. edit flow), revert previous allocation first
    if (bankBookTxId) {
      await revertMonojSystem2Allocation(bankBookTxId);
    }

    let remainingPayment = totalWithdraw;
    const allocationAudit = [];
    let totalDirectAllocated = 0;

    // 1. Allocate to selected debit rows in order (exact MongoDB IDs)
    for (const debitId of selectedDebitIds) {
      if (remainingPayment <= 0) break;
      if (!mongoose.Types.ObjectId.isValid(debitId)) continue;

      const record = await OthersCreditor.findById(debitId);
      if (!record || !isManojBandhan(record.creditorName)) continue;

      const originalDebit = num(record.debit);
      const curPaid = num(record.paidAmount);
      const curOutstanding = Math.max(0, Math.round((originalDebit - curPaid) * 100) / 100);
      if (curOutstanding <= 0) continue;

      let allocAmt = 0;
      if (customAllocations && customAllocations[debitId] !== undefined) {
        allocAmt = Math.min(num(customAllocations[debitId]), remainingPayment, curOutstanding);
      } else {
        allocAmt = Math.min(remainingPayment, curOutstanding);
      }

      if (allocAmt <= 0) continue;

      allocAmt = Math.round(allocAmt * 100) / 100;
      const newPaid = Math.round((curPaid + allocAmt) * 100) / 100;
      const newOutstanding = Math.max(0, Math.round((originalDebit - newPaid) * 100) / 100);
      remainingPayment = Math.max(0, Math.round((remainingPayment - allocAmt) * 100) / 100);
      totalDirectAllocated += allocAmt;

      const allocItem = {
        bankBookTxId: String(bankBookTxId || ''),
        bankBookDate: bankBookDate || '',
        bankBookMonth: bankBookMonth || '',
        allocatedAmount: allocAmt,
        originalDebit,
        remainingOutstanding: newOutstanding,
        allocationType: 'SECOND PAYMENT ALLOCATION SYSTEM',
        allocatedAt: new Date()
      };

      record.paidAmount = newPaid;
      record.balanceDue = newOutstanding;
      record.status = newOutstanding === 0 ? 'Paid' : 'Partial';
      // Put the corresponding CREDIT directly on the selected debit row
      record.credit = Math.round((num(record.credit) + allocAmt) * 100) / 100;
      record.allocations = record.allocations || [];
      record.allocations.push(allocItem);
      if (bankBookTxId) {
        record.appliedBankBookTxIds = record.appliedBankBookTxIds || [];
        if (!record.appliedBankBookTxIds.includes(String(bankBookTxId))) {
          record.appliedBankBookTxIds.push(String(bankBookTxId));
        }
      }
      await record.save();

      allocationAudit.push({
        debitId: record._id.toString(),
        slNo: record.slNo,
        date: record.date,
        originalDebit,
        allocatedAmount: allocAmt,
        remainingOutstanding: newOutstanding
      });
    }

    // 2. Excess payment handling:
    // If remainingPayment > 0, apply against any remaining outstanding Manoj Bandhan debits
    let autoCoveredDebits = 0;
    if (remainingPayment > 0) {
      const otherDebits = await OthersCreditor.find({
        creditorName: { $in: ['MANOJ BANDHAN', 'MONOJ BANDHAN'] },
        _id: { $nin: selectedDebitIds },
        debit: { $gt: 0 }
      });

      const eligibleOthers = otherDebits.filter(r => {
        return (num(r.debit) - num(r.paidAmount)) > 0;
      }).sort((a, b) => {
        const tA = parseToDate(a.date).getTime() || 0;
        const tB = parseToDate(b.date).getTime() || 0;
        if (tA && tB && tA !== tB) return tA - tB;
        return num(a.slNo) - num(b.slNo);
      });

      for (const otherRec of eligibleOthers) {
        if (remainingPayment <= 0) break;
        const originalDebit = num(otherRec.debit);
        const curPaid = num(otherRec.paidAmount);
        const curOutstanding = Math.max(0, Math.round((originalDebit - curPaid) * 100) / 100);
        if (curOutstanding <= 0) continue;

        const allocAmt = Math.min(remainingPayment, curOutstanding);
        const newPaid = Math.round((curPaid + allocAmt) * 100) / 100;
        const newOutstanding = Math.max(0, Math.round((originalDebit - newPaid) * 100) / 100);
        remainingPayment = Math.max(0, Math.round((remainingPayment - allocAmt) * 100) / 100);
        autoCoveredDebits += allocAmt;

        const allocItem = {
          bankBookTxId: String(bankBookTxId || ''),
          bankBookDate: bankBookDate || '',
          bankBookMonth: bankBookMonth || '',
          allocatedAmount: allocAmt,
          originalDebit,
          remainingOutstanding: newOutstanding,
          allocationType: 'SECOND PAYMENT ALLOCATION SYSTEM',
          allocatedAt: new Date(),
          isAutoAllocated: true
        };

        otherRec.paidAmount = newPaid;
        otherRec.balanceDue = newOutstanding;
        otherRec.status = newOutstanding === 0 ? 'Paid' : 'Partial';
        otherRec.credit = Math.round((num(otherRec.credit) + allocAmt) * 100) / 100;
        otherRec.allocations = otherRec.allocations || [];
        otherRec.allocations.push(allocItem);
        if (bankBookTxId) {
          otherRec.appliedBankBookTxIds = otherRec.appliedBankBookTxIds || [];
          if (!otherRec.appliedBankBookTxIds.includes(String(bankBookTxId))) {
            otherRec.appliedBankBookTxIds.push(String(bankBookTxId));
          }
        }
        await otherRec.save();

        allocationAudit.push({
          debitId: otherRec._id.toString(),
          slNo: otherRec.slNo,
          date: otherRec.date,
          originalDebit,
          allocatedAmount: allocAmt,
          remainingOutstanding: newOutstanding,
          isAutoAllocated: true
        });
      }
    }

    // 3. If unallocated excess remaining, record as standalone credit row
    if (remainingPayment > 0) {
      const dateStr = bankBookDate || new Date().toISOString().split('T')[0];
      const maxDoc = await OthersCreditor.findOne({
        creditorName: { $in: ['MANOJ BANDHAN', 'MONOJ BANDHAN'] }
      }).sort({ slNo: -1 }).lean();
      const nextSlNo = (maxDoc && maxDoc.slNo) ? maxDoc.slNo + 1 : 1;
      await OthersCreditor.create({
        slNo: nextSlNo,
        creditorName: 'MANOJ BANDHAN',
        date: dateStr,
        ledgerName: 'MANOJ BANDHAN',
        names: 'MANOJ BANDHAN',
        credit: remainingPayment,
        debit: 0,
        remarks: `Bank Book Withdraw payment unallocated excess (${bankBookTxId || ''})`,
        bankBookTxId: String(bankBookTxId || ''),
        appliedBankBookTxIds: bankBookTxId ? [String(bankBookTxId)] : []
      });
    }

    // 4. Update Bank Book record (AccountDetail)
    if (bankBookTxId && mongoose.Types.ObjectId.isValid(bankBookTxId)) {
      const AccountDetail = require('../models/AccountDetail');
      await AccountDetail.updateOne(
        { _id: bankBookTxId },
        {
          $set: {
            _monojSystem2Allocation: {
              allocatedTotal: totalDirectAllocated + autoCoveredDebits,
              extraCreditRemaining: remainingPayment,
              allocations: allocationAudit,
              settledAt: new Date()
            }
          }
        }
      );
    }

    // 5. Recalculate Manoj Bandhan running balances
    await recalculateMonojBandhanBalances();

    res.json({
      success: true,
      allocatedTotal: totalDirectAllocated + autoCoveredDebits,
      directAllocated: totalDirectAllocated,
      autoCoveredDebits,
      extraCreditRemaining: remainingPayment,
      allocations: allocationAudit
    });
  } catch (err) {
    console.error('[OthersCreditor] Debit allocation error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

async function revertMonojSystem2Allocation(bankBookTxId) {
  if (!bankBookTxId) return;
  const txIdStr = String(bankBookTxId);

  // 1. Find all debit records allocated with this bankBookTxId
  const allocatedRecords = await OthersCreditor.find({
    creditorName: { $in: ['MANOJ BANDHAN', 'MONOJ BANDHAN'] },
    'allocations.bankBookTxId': txIdStr
  });

  for (const rec of allocatedRecords) {
    const matchingAllocs = (rec.allocations || []).filter(a => a.bankBookTxId === txIdStr);
    const totalToRevert = matchingAllocs.reduce((sum, a) => sum + num(a.allocatedAmount), 0);
    const newPaid = Math.max(0, Math.round((num(rec.paidAmount) - totalToRevert) * 100) / 100);
    const newDue = Math.max(0, Math.round((num(rec.debit) - newPaid) * 100) / 100);
    const newCredit = Math.max(0, Math.round((num(rec.credit) - totalToRevert) * 100) / 100);

    rec.paidAmount = newPaid;
    rec.balanceDue = newDue;
    rec.status = newDue === 0 && num(rec.debit) > 0 ? 'Paid' : (newPaid > 0 ? 'Partial' : 'Unpaid');
    rec.credit = newCredit;
    rec.allocations = (rec.allocations || []).filter(a => a.bankBookTxId !== txIdStr);
    rec.appliedBankBookTxIds = (rec.appliedBankBookTxIds || []).filter(id => id !== txIdStr);
    await rec.save();
  }

  // 2. Find any standalone excess credit rows created exclusively for this transaction
  const creditRows = await OthersCreditor.find({
    creditorName: { $in: ['MANOJ BANDHAN', 'MONOJ BANDHAN'] },
    appliedBankBookTxIds: txIdStr,
    debit: 0
  });

  for (const cr of creditRows) {
    const otherTxs = (cr.appliedBankBookTxIds || []).filter(id => id !== txIdStr);
    if (otherTxs.length === 0 || cr.bankBookTxId === txIdStr) {
      await OthersCreditor.deleteOne({ _id: cr._id });
    } else {
      cr.appliedBankBookTxIds = otherTxs;
      await cr.save();
    }
  }

  if (mongoose.Types.ObjectId.isValid(bankBookTxId)) {
    const AccountDetail = require('../models/AccountDetail');
    await AccountDetail.updateOne({ _id: bankBookTxId }, { $unset: { _monojSystem2Allocation: '' } });
  }

  await recalculateMonojBandhanBalances();
}

// ── POST /api/others-creditors/monoj-bandhan/revert-allocation ─────────────
router.post('/monoj-bandhan/revert-allocation', async (req, res) => {
  try {
    const { bankBookTxId } = req.body;
    if (!bankBookTxId) {
      return res.status(400).json({ success: false, error: 'bankBookTxId is required.' });
    }

    await revertMonojSystem2Allocation(bankBookTxId);
    res.json({ success: true, message: `Reverted allocation for transaction ${bankBookTxId}.` });
  } catch (err) {
    console.error('[OthersCreditor] Revert allocation error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.recalculateMonojBandhanBalances = recalculateMonojBandhanBalances;
router.revertMonojSystem2Allocation = revertMonojSystem2Allocation;
module.exports = router;
module.exports.recalculateMonojBandhanBalances = recalculateMonojBandhanBalances;
module.exports.revertMonojSystem2Allocation = revertMonojSystem2Allocation;

