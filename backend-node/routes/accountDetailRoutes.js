const express = require('express');
const multer = require('multer');
const router = express.Router();
const AccountDetail = require('../models/AccountDetail');
const PartyPayment = require('../models/PartyPayment');
const { getIO } = require('../socket');
const { parseBankStatement } = require('../utils/parseBankStatement');
const remittanceUpload = require('../middleware/remittanceUpload');
const { allocatePaymentToBills, detectPaymentRow } = require('../utils/paymentMapper');

// ── Auto-sync Bank Book Freight/Toll Payments -> Party Payment Details ──────
const syncPartyPayments = async (affectedDocs) => {
  const monthNameToNumber = (name) => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return months.indexOf(name) + 1;
  };

  const getCombo = (doc) => {
    const ledger = (doc.ledgerName || '').trim().toLowerCase();
    if (ledger !== 'freight payment' && ledger !== 'toll payment') return null;
    const v = (doc.vehicle || '').trim();
    if (!v) return null;

    const docMonthStr = (doc.month || doc.selectedMonth || '').trim();
    const m = monthNameToNumber(docMonthStr);
    if (m < 1 || m > 12) return null;

    let fyStart = parseInt(doc.selectedYear, 10);
    if (isNaN(fyStart)) return null;

    const y = (m >= 4) ? fyStart : fyStart + 1;
    return { vehicleNo: v, month: m, year: y };
  };

  const combinationsToUpdate = new Set();

  affectedDocs.forEach(doc => {
    const combo = getCombo(doc);
    if (combo) combinationsToUpdate.add(JSON.stringify(combo));
  });

  for (const comboStr of combinationsToUpdate) {
    const combo = JSON.parse(comboStr);

    const relatedDocs = await AccountDetail.find({
      vehicle: combo.vehicleNo,
      ledgerName: { $regex: /^(freight payment|toll payment)$/i }
    });

    let totalWithdraw = 0;
    relatedDocs.forEach(d => {
      const dCombo = getCombo(d);
      if (dCombo && dCombo.month === combo.month && dCombo.year === combo.year) {
        const amt = parseFloat(String(d.withdraw || '').replace(/,/g, ''));
        if (!isNaN(amt)) totalWithdraw += amt;
      }
    });

    await PartyPayment.updateOne(
      { vehicleNo: combo.vehicleNo, month: combo.month, year: combo.year },
      { $set: { paidToParty: totalWithdraw } },
      { upsert: true }
    );
  }
};

// ── Auto-sync Bank Book Freight Advance -> Cement Register ──────────────────
const syncFreightAdvanceToCementRegister = async (affectedDocs) => {
  const monthNameToNumber = (name) => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return months.indexOf(name) + 1;
  };

  const parseToDate = (dStr) => {
    if (!dStr) return new Date(0);
    const clean = String(dStr).trim();
    const parts = clean.split(/[-\/\.]/);
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      let year = parseInt(parts[2], 10);
      if (parts[2].length === 2) {
        year += (year >= 70 ? 1900 : 2000);
      }
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) return date;
    }
    let d = new Date(dStr);
    if (!isNaN(d.getTime())) return d;
    return new Date(0);
  };

  const makeSpaceAgnosticRegex = (str) => {
    if (!str) return /^$/;
    const stripped = str.replace(/[^a-zA-Z0-9]/g, '');
    const regexStr = stripped.split('').join('[^a-zA-Z0-9]*');
    return new RegExp(`^[^a-zA-Z0-9]*${regexStr}[^a-zA-Z0-9]*$`, 'i');
  };

  const getCombo = (doc) => {
    const ledger = (doc.ledgerName || '').trim().toLowerCase();
    if (ledger !== 'freight advance') return null;
    const v = (doc.vehicle || '').trim();
    const owner = (doc.names || '').trim();
    if (!v || !owner) return null;

    const docMonthStr = (doc.month || doc.selectedMonth || '').trim();
    const m = monthNameToNumber(docMonthStr);
    if (m < 1 || m > 12) return null;

    let fyStart = parseInt(doc.selectedYear, 10);
    if (isNaN(fyStart)) return null;

    const y = (m >= 4) ? fyStart : fyStart + 1;
    return { vehicleNo: v, month: m, year: y, ownerName: owner };
  };

  const combinationsToUpdate = new Set();

  affectedDocs.forEach(doc => {
    const combo = getCombo(doc);
    if (combo) combinationsToUpdate.add(JSON.stringify(combo));
  });

  if (combinationsToUpdate.size === 0) return;

  const mongoose = require('mongoose');
  const col = mongoose.connection.useDb('cement_register').collection('entries');
  const { getIO } = require('../socket');

  for (const comboStr of combinationsToUpdate) {
    const combo = JSON.parse(comboStr);

    // Find all 'freight advance' documents for this vehicle/owner in the Bank Book
    const relatedDocs = await AccountDetail.find({
      vehicle: combo.vehicleNo,
      names: combo.ownerName,
      ledgerName: { $regex: /^freight advance$/i }
    });

    let totalWithdraw = 0;
    relatedDocs.forEach(d => {
      const dCombo = getCombo(d);
      if (dCombo && dCombo.month === combo.month && dCombo.year === combo.year && dCombo.ownerName === combo.ownerName) {
        const amt = parseFloat(String(d.withdraw || '').replace(/,/g, ''));
        if (!isNaN(amt)) totalWithdraw += amt;
      }
    });

    // Find all matching Cement Register rows for this Vehicle and Owner
    const cementRows = await col.find({
      "VEHICLE NUMBER": { $regex: makeSpaceAgnosticRegex(combo.vehicleNo) },
      "OWNER NAME": { $regex: new RegExp(`^\\s*${combo.ownerName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\s*$`, "i") }
    }).toArray();

    const idsToUpdate = [];
    for (const row of cementRows) {
      let rowMonth, rowYear;
      if (row.month && row.year) {
        rowMonth = parseInt(row.month, 10);
        rowYear = parseInt(row.year, 10);
      } else {
        const dStr = row["LOADING DT"] || row["LOADING DATE"] || row["BILL DATE"] || row["RECEIVING DATE"] || row["INVOICE DATE"];
        const d = parseToDate(dStr);
        if (d.getTime() > 0) {
          rowMonth = d.getMonth() + 1;
          rowYear = d.getFullYear();
        }
      }

      if (rowMonth === combo.month && rowYear === combo.year) {
        idsToUpdate.push(row._id);
      }
    }

    if (idsToUpdate.length > 0) {
      await col.updateMany(
        { _id: { $in: idsToUpdate } },
        { $set: { "Bank TF": totalWithdraw } }
      );
    }
  }

  try {
    const io = getIO();
    if (io) io.emit('cementUpdates', { action: 'bulkUpdate' });
  } catch (e) {
    console.warn('Socket emit failed:', e.message);
  }
};

const syncPumpPayments = async (allocations, manualWithdrawAmount, bankBookId, remarks, ledgerName) => {
  if (!allocations || !Array.isArray(allocations) || allocations.length === 0) return;
  const mongoose = require('mongoose');
  const pumpCol = mongoose.connection.useDb('pump_payment_register').collection('records');

  for (const alloc of allocations) {
    const { rawBillNumber } = alloc;
    if (!rawBillNumber) continue;

    const bill = await pumpCol.findOne({ "BILL NO": rawBillNumber });
    if (!bill) continue;

    const allocatedAmount = Number(manualWithdrawAmount) || 0;

    const currentPaid = Number(bill["PAYMENT AMOUNT"]) || 0;
    const payable = Number(bill["PAYABLE AMOUNT"]) || 0;
    const newPaid = currentPaid + allocatedAmount;
    const newDue = payable - newPaid;

    let newStatus = "Pending";
    if (newDue <= 0) newStatus = "Paid";
    else if (newPaid > 0) newStatus = "Partially Paid";

    await pumpCol.updateOne(
      { _id: bill._id },
      {
        $set: {
          "PAYMENT AMOUNT": newPaid,
          "DUE AMOUNT": newDue,
          "paymentStatus": newStatus,
          "updatedAt": new Date(),
          "bankBookId": bankBookId || null
        }
      }
    );

    if (ledgerName && ledgerName.trim().toLowerCase() === "pump payment") {
      await pumpCol.updateOne(
        { _id: bill._id },
        [
          {
            $replaceWith: {
              $setField: {
                field: "REF. NO",
                input: "$$ROOT",
                value: remarks || ""
              }
            }
          }
        ]
      );
    }
  }
};
// ────────────────────────────────────────────────────────────────────────────

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
  'Month': 'month',
  'Names': 'names',
  'Particulars': 'particulars',
  'Remarks': 'remarks',
  'Reference No': 'referenceNo',
  'Cheque No': 'chequeNo',
  'Withdraw': 'withdraw',
  'Deposit': 'deposit',
  'Closing Balance': 'closingBalance',
  'remittanceFileUrl': 'remittanceFileUrl',
  'remittanceFileName': 'remittanceFileName',
  'selectedMonth': 'selectedMonth',
  'selectedYear': 'selectedYear',
  'Vehicle': 'vehicle'
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
    const { month, year } = req.query;
    const query = {};
    if (month && year) {
      query.selectedMonth = month;
      query.selectedYear = year;
    }
    const docs = await AccountDetail.find(query).sort({ transactionDate: 1, createdAt: 1 });
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
    const affectedDocsForSync = [];
    const createdDocs = {};
    const updatedDocs = {};

    for (const item of updates) {
      if (item.isNewRow) {
        const newDoc = {};
        for (const [lbl, val] of Object.entries(item.changes)) {
          if (keyMap[lbl]) newDoc[keyMap[lbl]] = val;
        }
        const createdDoc = await AccountDetail.create(newDoc);
        affectedDocsForSync.push(createdDoc);
        createdDocs[item.id || 'new'] = createdDoc;
      } else if (item.id) {
        const updateDoc = {};
        for (const [lbl, val] of Object.entries(item.changes)) {
          if (keyMap[lbl]) updateDoc[keyMap[lbl]] = val;
        }
        const oldDoc = await AccountDetail.findById(item.id);
        if (oldDoc) affectedDocsForSync.push(oldDoc);
        const updatedDoc = await AccountDetail.findByIdAndUpdate(item.id, updateDoc, { new: true });
        if (updatedDoc) {
          affectedDocsForSync.push(updatedDoc);
          updatedDocs[item.id] = updatedDoc;
        }
      }
    }

    try {
      await syncPartyPayments(affectedDocsForSync);
    } catch (syncErr) {
      console.error('[accountDetailRoutes] syncPartyPayments error:', syncErr.message);
    }

    try {
      await syncFreightAdvanceToCementRegister(affectedDocsForSync);
    } catch (syncErr) {
      console.error('[accountDetailRoutes] syncFreightAdvanceToCementRegister error:', syncErr.message);
    }

    try {
      const io = getIO();
      if (io) io.emit('accountDetailsUpdate', { action: 'bulk-update' });
    } catch (socketErr) {
      console.warn('Socket notify failed:', socketErr.message);
    }

    // ── Auto-map payments to Bill Register ──────────────────────────────────
    // After saving, check each updated/created row for NVCL/NVL deposits
    // and allocate payments to matching bills automatically.
    const paymentResults = [];
    try {
      // Re-fetch the freshly saved docs so we have the correct field values
      const allDocs = await AccountDetail.find().lean();
      const docMap = {};
      allDocs.forEach(d => { docMap[d._id.toString()] = d; });

      for (const item of updates) {
        // Build the merged row to check for payment
        let merged = {};
        let dbDoc = null;
        if (item.isNewRow) {
          // New row — changes IS the full row
          merged = { ...item.changes };
          dbDoc = createdDocs[item.id || 'new'];
        } else if (item.id) {
          dbDoc = updatedDocs[item.id] || docMap[item.id];
          if (dbDoc) {
            // Map DB fields back to frontend keys for the detector
            merged = {
              'Transaction Date': dbDoc.transactionDate || '',
              'Ledger Name': dbDoc.ledgerName || '',
              'Names': dbDoc.names || '',
              'Particulars': dbDoc.particulars || '',
              'Remarks': dbDoc.remarks || '',
              'Reference No': dbDoc.referenceNo || '',
              'Cheque No': dbDoc.chequeNo || '',
              'Withdraw': dbDoc.withdraw || '',
              'Deposit': dbDoc.deposit || '',
              'Closing Balance': dbDoc.closingBalance || '',
              '_allocations': item.changes._allocations,
              '_pumpAllocations': item.changes._pumpAllocations
            };
          }
        }

        if (detectPaymentRow(merged)) {
          const result = await allocatePaymentToBills(merged);
          if (result.allocated.length > 0 || result.errors.length > 0) {
            paymentResults.push(result);
          }
        }

        if (merged._pumpAllocations && Array.isArray(merged._pumpAllocations)) {
          const bankBookId = dbDoc ? dbDoc._id.toString() : item.id;
          const remarks = dbDoc ? dbDoc.remarks : '';
          const ledgerName = dbDoc ? dbDoc.ledgerName : '';
          await syncPumpPayments(merged._pumpAllocations, merged['Withdraw'], bankBookId, remarks, ledgerName);
        }
      }
    } catch (mapErr) {
      console.error('[accountDetailRoutes] Payment mapping error:', mapErr.message);
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Sync Remarks updates to already linked pump payment register records
    try {
      const pumpCol = mongoose.connection.useDb('pump_payment_register').collection('records');
      for (const item of updates) {
        const dbDoc = item.isNewRow ? createdDocs[item.id || 'new'] : updatedDocs[item.id];
        if (dbDoc && dbDoc.ledgerName && dbDoc.ledgerName.trim().toLowerCase() === "pump payment") {
          await pumpCol.updateMany(
            { bankBookId: dbDoc._id.toString() },
            [
              {
                $replaceWith: {
                  $setField: {
                    field: "REF. NO",
                    input: "$$ROOT",
                    value: dbDoc.remarks || ""
                  }
                }
              }
            ]
          );
        }
      }
    } catch (syncRemarksErr) {
      console.error('[accountDetailRoutes] sync Remarks to pump payment register error:', syncRemarksErr.message);
    }

    res.json({ success: true, paymentResults });
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
    const docsToDelete = await AccountDetail.find({ _id: { $in: ids } });
    await AccountDetail.deleteMany({ _id: { $in: ids } });

    try {
      const pumpCol = mongoose.connection.useDb('pump_payment_register').collection('records');
      await pumpCol.updateMany(
        { bankBookId: { $in: ids } },
        [
          {
            $replaceWith: {
              $setField: {
                field: "REF. NO",
                input: {
                  $setField: {
                    field: "bankBookId",
                    input: "$$ROOT",
                    value: null
                  }
                },
                value: ""
              }
            }
          }
        ]
      );
    } catch (syncDeleteErr) {
      console.error('[accountDetailRoutes] sync delete to pump payment register error:', syncDeleteErr.message);
    }

    try {
      await syncPartyPayments(docsToDelete);
    } catch (syncErr) {
      console.error('[accountDetailRoutes] syncPartyPayments error on delete:', syncErr.message);
    }

    try {
      await syncFreightAdvanceToCementRegister(docsToDelete);
    } catch (syncErr) {
      console.error('[accountDetailRoutes] syncFreightAdvanceToCementRegister error on delete:', syncErr.message);
    }

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
    const docs = await AccountDetail.find({}, { transactionDate: 1 });
    const dateSet = new Set();
    docs.forEach(d => {
      if (d.transactionDate) {
        const parts = d.transactionDate.split(/[-\/]/);
        if (parts.length === 3) {
          if (parts[0].length === 4) {
            dateSet.add(`${parts[0]}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')}`);
          } else {
            dateSet.add(`${parts[2]}-${String(parts[1]).padStart(2, '0')}-${String(parts[0]).padStart(2, '0')}`);
          }
        }
      }
    });
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

    // Check for existing records in this date range
    const existing = await AccountDetail.findOne({
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
    } catch (_) { }

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
      { $set: { P_WITHDRAW: 0, P_LOAN_PAY: '' } }
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
        P_LOAN_RECV: '',
        P_LOAN_PAY: sourceText,
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
      await col.updateOne(
        { _id: cashbookRow._id },
        { $set: { P_WITHDRAW: amount, P_LOAN_PAY: sourceText } }
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
