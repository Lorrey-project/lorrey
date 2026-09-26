const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const OthersCreditor = require('../models/OthersCreditor');
const truckContactUpload = require('../middleware/truckContactUpload');
const {
  applyMonojDebitToCement,
  reverseMonojDebitContribution,
  syncMonojDebitsBatch
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

// Continuous chronological balance recalculation for MONOJ BANDHAN
async function recalculateMonojBandhanBalances() {
  try {
    const allRows = await OthersCreditor.find({ creditorName: 'MONOJ BANDHAN' });
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
      return cA - cB;
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
      query.creditorName = creditorName;
    }

    let entries = await OthersCreditor.find(query).sort({ slNo: 1, createdAt: 1 }).lean();
    if (creditorName === 'MONOJ BANDHAN') {
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
        return cA - cB;
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
    const query = creditorName ? { creditorName } : {};
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

    if (!data.slNo) {
      const maxDoc = await OthersCreditor.findOne({ creditorName: data.creditorName }).sort({ slNo: -1 }).lean();
      data.slNo = (maxDoc && maxDoc.slNo ? Number(maxDoc.slNo) : 0) + 1;
    }

    const entry = new OthersCreditor(data);
    await entry.save();

    let cementSyncResult = null;
    if (data.creditorName === 'MONOJ BANDHAN') {
      await recalculateMonojBandhanBalances();
      if (num(entry.debit) > 0 && entry.vehicleNo) {
        cementSyncResult = await applyMonojDebitToCement(entry);
      }
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
    const data = computeRowMetrics(req.body);
    const existing = await OthersCreditor.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }

    const updated = await OthersCreditor.findByIdAndUpdate(
      req.params.id,
      { $set: data },
      { new: true, runValidators: true }
    );

    let cementSyncResult = null;
    if (updated.creditorName === 'MONOJ BANDHAN') {
      await recalculateMonojBandhanBalances();
      cementSyncResult = await applyMonojDebitToCement(updated);
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
    const maxDoc = await OthersCreditor.findOne({ creditorName: 'MONOJ BANDHAN' }).sort({ slNo: -1 }).lean();
    if (maxDoc && maxDoc.slNo) maxSl = Number(maxDoc.slNo);

    const saved = [];
    let hasMonoj = false;
    for (let i = 0; i < rows.length; i++) {
      const r = computeRowMetrics(rows[i]);
      if (r.creditorName === 'MONOJ BANDHAN') hasMonoj = true;
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

    let cementSyncResults = [];
    if (hasMonoj) {
      await recalculateMonojBandhanBalances();
      cementSyncResults = await syncMonojDebitsBatch(saved);
    }

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

    if (docToDelete.creditorName === 'MONOJ BANDHAN') {
      await reverseMonojDebitContribution(docToDelete);
    }

    const deleted = await OthersCreditor.findByIdAndDelete(req.params.id);
    if (deleted && deleted.creditorName === 'MONOJ BANDHAN') {
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
      if (doc.creditorName === 'MONOJ BANDHAN') {
        await reverseMonojDebitContribution(doc);
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
// System 2: Fetch all Monoj Bandhan debit rows eligible for payment allocation
router.get('/monoj-bandhan/debit-rows', async (req, res) => {
  try {
    const rawRows = await OthersCreditor.find({
      creditorName: 'MONOJ BANDHAN',
      debit: { $gt: 0 }
    }).lean();

    // Sort chronologically by date, then slNo
    rawRows.sort((a, b) => {
      const tA = parseToDate(a.date).getTime() || 0;
      const tB = parseToDate(b.date).getTime() || 0;
      if (tA && tB && tA !== tB) return tA - tB;
      if (tA && !tB) return -1;
      if (!tA && tB) return 1;
      return num(a.slNo) - num(b.slNo);
    });

    const debitRows = rawRows.map(r => {
      const originalDebit = num(r.debit);
      const paid = num(r.paidAmount);
      const outstanding = Math.max(0, Math.round((originalDebit - paid) * 100) / 100);
      return {
        _id: r._id,
        slNo: r.slNo,
        date: r.date,
        ledgerName: r.ledgerName || '',
        names: r.names || '',
        vehicleNo: r.vehicleNo || '',
        debit: originalDebit,
        paidAmount: paid,
        outstanding: outstanding,
        status: outstanding === 0 ? 'Paid' : (paid > 0 ? 'Partial' : 'Unpaid'),
        remarks: r.remarks || '',
        allocations: r.allocations || []
      };
    });

    res.json({ success: true, debitRows });
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

    // Duplicate protection: Check if this Bank Book transaction was already allocated under System 2
    if (bankBookTxId) {
      const alreadyAllocated = await OthersCreditor.findOne({
        creditorName: 'MONOJ BANDHAN',
        'allocations.bankBookTxId': String(bankBookTxId)
      });
      if (alreadyAllocated) {
        return res.status(400).json({
          success: false,
          alreadyAllocated: true,
          error: `Bank Book transaction (${bankBookTxId}) has already been allocated under System 2. Duplicate allocation is prevented.`
        });
      }
    }

    let remainingPayment = totalWithdraw;
    const allocationAudit = [];
    let totalDirectAllocated = 0;

    // 1. Allocate to selected debit rows in order
    for (const debitId of selectedDebitIds) {
      if (remainingPayment <= 0) break;
      if (!mongoose.Types.ObjectId.isValid(debitId)) continue;

      const record = await OthersCreditor.findById(debitId);
      if (!record || record.creditorName !== 'MONOJ BANDHAN') continue;

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
      record.allocations = record.allocations || [];
      record.allocations.push(allocItem);
      if (bankBookTxId && !record.appliedBankBookTxIds?.includes(String(bankBookTxId))) {
        record.appliedBankBookTxIds = record.appliedBankBookTxIds || [];
        record.appliedBankBookTxIds.push(String(bankBookTxId));
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

    // 2. Excess payment handling (Section 5 & 14 from user prompt):
    // If remainingPayment > 0, apply against remaining outstanding Monoj Bandhan debits
    let autoCoveredDebits = 0;
    if (remainingPayment > 0) {
      const otherDebits = await OthersCreditor.find({
        creditorName: 'MONOJ BANDHAN',
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
        otherRec.allocations = otherRec.allocations || [];
        otherRec.allocations.push(allocItem);
        if (bankBookTxId && !otherRec.appliedBankBookTxIds?.includes(String(bankBookTxId))) {
          otherRec.appliedBankBookTxIds = otherRec.appliedBankBookTxIds || [];
          otherRec.appliedBankBookTxIds.push(String(bankBookTxId));
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

    // 3. Record the total payment as Credit into Monoj Bandhan on the payment date
    const dateStr = bankBookDate || new Date().toLocaleDateString('en-GB');
    let targetRow = await OthersCreditor.findOne({ creditorName: 'MONOJ BANDHAN', date: dateStr });
    if (targetRow) {
      targetRow.credit = Math.round((num(targetRow.credit) + totalWithdraw) * 100) / 100;
      if (bankBookTxId && !targetRow.appliedBankBookTxIds?.includes(String(bankBookTxId))) {
        targetRow.appliedBankBookTxIds = targetRow.appliedBankBookTxIds || [];
        targetRow.appliedBankBookTxIds.push(String(bankBookTxId));
      }
      if (bankBookTxId) targetRow.bankBookTxId = String(bankBookTxId);
      await targetRow.save();
    } else {
      const maxDoc = await OthersCreditor.findOne({ creditorName: 'MONOJ BANDHAN' }).sort({ slNo: -1 }).lean();
      const nextSlNo = (maxDoc && maxDoc.slNo) ? maxDoc.slNo + 1 : 1;
      await OthersCreditor.create({
        slNo: nextSlNo,
        creditorName: 'MONOJ BANDHAN',
        date: dateStr,
        credit: totalWithdraw,
        debit: 0,
        remarks: `Bank Book Withdraw payment (${bankBookTxId || ''})`,
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

    // 5. Recalculate Monoj Bandhan running balances
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

  const allocatedRecords = await OthersCreditor.find({
    creditorName: 'MONOJ BANDHAN',
    'allocations.bankBookTxId': txIdStr
  });

  for (const rec of allocatedRecords) {
    const matchingAllocs = (rec.allocations || []).filter(a => a.bankBookTxId === txIdStr);
    const totalToRevert = matchingAllocs.reduce((sum, a) => sum + num(a.allocatedAmount), 0);
    const newPaid = Math.max(0, Math.round((num(rec.paidAmount) - totalToRevert) * 100) / 100);
    const newDue = Math.max(0, Math.round((num(rec.debit) - newPaid) * 100) / 100);

    rec.paidAmount = newPaid;
    rec.balanceDue = newDue;
    rec.status = newDue === 0 && num(rec.debit) > 0 ? 'Paid' : (newPaid > 0 ? 'Partial' : 'Unpaid');
    rec.allocations = (rec.allocations || []).filter(a => a.bankBookTxId !== txIdStr);
    rec.appliedBankBookTxIds = (rec.appliedBankBookTxIds || []).filter(id => id !== txIdStr);
    await rec.save();
  }

  const creditRows = await OthersCreditor.find({
    creditorName: 'MONOJ BANDHAN',
    appliedBankBookTxIds: txIdStr
  });

  if (mongoose.Types.ObjectId.isValid(bankBookTxId)) {
    const AccountDetail = require('../models/AccountDetail');
    const bankTx = await AccountDetail.findById(bankBookTxId);
    const withdrawAmt = num(bankTx?.Withdraw !== undefined ? bankTx.Withdraw : bankTx?.withdraw);
    for (const cr of creditRows) {
      const deduction = withdrawAmt > 0 ? withdrawAmt : num(cr.credit);
      cr.credit = Math.max(0, Math.round((num(cr.credit) - deduction) * 100) / 100);
      cr.appliedBankBookTxIds = (cr.appliedBankBookTxIds || []).filter(id => id !== txIdStr);
      if (cr.bankBookTxId === txIdStr) cr.bankBookTxId = '';
      if (num(cr.credit) === 0 && num(cr.debit) === 0) {
        await OthersCreditor.deleteOne({ _id: cr._id });
      } else {
        await cr.save();
      }
    }
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

