const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const router = express.Router();
const AccountDetail = require('../models/AccountDetail');
const PartyPayment = require('../models/PartyPayment');
const { getIO } = require('../socket');
const { parseBankStatement } = require('../utils/parseBankStatement');
const remittanceUpload = require('../middleware/remittanceUpload');
const { allocatePaymentToBills, detectPaymentRow } = require('../utils/paymentMapper');

// ── Auto-sync Bank Book Freight Payments -> Party Payment Details ──────
const syncPartyPayments = async (affectedDocs) => {
  const monthNameToNumber = (name) => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return months.indexOf(name) + 1;
  };

  const makeSpaceAgnosticRegex = (str) => {
    if (!str) return /^$/;
    const stripped = str.replace(/[^a-zA-Z0-9]/g, '');
    const regexStr = stripped.split('').join('[^a-zA-Z0-9]*');
    return new RegExp(`^[^a-zA-Z0-9]*${regexStr}[^a-zA-Z0-9]*$`, 'i');
  };

  const getCombo = (doc) => {
    const ledger = (doc.ledgerName || '').trim().toLowerCase();
    if (ledger !== 'freight payment') return null; // STRICT REQUIREMENT 7: ONLY Freight Payment!
    const v = (doc.vehicle || '').trim();
    const owner = (doc.names || '').trim();
    if (!v || !owner) return null; // STRICT REQUIREMENT 2 & 3: MUST match Vehicle AND Owner Name!

    const docMonthStr = (doc.month || doc.selectedMonth || '').trim();
    const m = monthNameToNumber(docMonthStr);
    if (m < 1 || m > 12) return null;

    let fyStart = parseInt(doc.selectedYear, 10);
    if (isNaN(fyStart)) {
      const tDate = doc.transactionDate || doc['Transaction Date'];
      if (tDate) {
        const parts = String(tDate).split(/[-\/\.]/);
        if (parts.length === 3) {
          let yr = parseInt(parts[0], 10);
          if (isNaN(yr) || yr < 1000) yr = parseInt(parts[2], 10);
          if (!isNaN(yr)) {
            if (yr < 100) yr += 2000;
            fyStart = (m >= 4) ? yr : yr - 1;
          }
        }
      }
      if (isNaN(fyStart)) {
        const nowY = new Date().getFullYear();
        fyStart = (m >= 4) ? nowY : nowY - 1;
      }
    }

    const y = (m >= 4) ? fyStart : fyStart + 1;
    return { vehicleNo: v, ownerName: owner, month: m, year: y };
  };

  const combinationsToUpdate = new Set();

  affectedDocs.forEach(doc => {
    const combo = getCombo(doc);
    if (combo) combinationsToUpdate.add(JSON.stringify(combo));
  });

  if (combinationsToUpdate.size === 0) return;

  for (const comboStr of combinationsToUpdate) {
    const combo = JSON.parse(comboStr);

    // Find all 'freight payment' documents for this EXACT vehicle & name in Bank Book
    const relatedDocs = await AccountDetail.find({
      vehicle: { $regex: makeSpaceAgnosticRegex(combo.vehicleNo) },
      names: { $regex: new RegExp(`^\\s*${combo.ownerName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\s*$`, 'i') },
      ledgerName: { $regex: /^freight payment$/i }
    });

    let totalWithdraw = 0;
    relatedDocs.forEach(d => {
      const dCombo = getCombo(d);
      if (
        dCombo &&
        dCombo.month === combo.month &&
        dCombo.year === combo.year &&
        dCombo.ownerName.toLowerCase() === combo.ownerName.toLowerCase()
      ) {
        const amt = parseFloat(String(d.withdraw || '').replace(/,/g, ''));
        if (!isNaN(amt)) totalWithdraw += amt;
      }
    });

    await PartyPayment.updateOne(
      {
        vehicleNo: combo.vehicleNo.trim().toUpperCase(),
        month: combo.month,
        year: combo.year
      },
      {
        $set: {
          paidToParty: totalWithdraw,
          ownerName: combo.ownerName
        }
      },
      { upsert: true }
    );
  }

  try {
    const { getIO } = require('../socket');
    const io = getIO();
    if (io) io.emit('partyPaymentUpdate', { action: 'sync' });
  } catch (e) {
    console.warn('Socket emit failed:', e.message);
  }
};

const monthNameToNumber = (name) => {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return months.indexOf(name) + 1;
};

const num = (val) => {
  if (val === null || val === undefined || val === '') return 0;
  const n = parseFloat(String(val).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};

const parseToDate = (dStr) => {
  if (!dStr) return new Date(0);
  if (dStr instanceof Date) return isNaN(dStr.getTime()) ? new Date(0) : dStr;
  const clean = String(dStr).trim();
  let m = clean.match(/^(\d{4})[-\/\.](\d{1,2})[-\/\.](\d{1,2})/);
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    const d = parseInt(m[3], 10);
    const dt = new Date(y, mo, d);
    if (!isNaN(dt.getTime())) return dt;
  }
  m = clean.match(/^(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{2,4})/);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    let y = parseInt(m[3], 10);
    if (y < 100) y += (y >= 70 ? 1900 : 2000);
    const dt = new Date(y, mo, d);
    if (!isNaN(dt.getTime())) return dt;
  }
  const dt = new Date(clean);
  if (!isNaN(dt.getTime())) return dt;
  return new Date(0);
};

const parseDateParts = (dStr) => {
  if (!dStr) {
    const now = new Date();
    const d = now.getDate(), m = now.getMonth() + 1, y = now.getFullYear();
    return {
      day: d,
      month: m,
      year: y,
      dateStr: `${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}-${y}`
    };
  }
  const clean = String(dStr).trim();
  let m = clean.match(/^(\d{4})[-\/\.](\d{1,2})[-\/\.](\d{1,2})/);
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const d = parseInt(m[3], 10);
    return {
      day: d,
      month: mo,
      year: y,
      dateStr: `${String(d).padStart(2, '0')}-${String(mo).padStart(2, '0')}-${y}`
    };
  }
  m = clean.match(/^(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{2,4})/);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    let y = parseInt(m[3], 10);
    if (y < 100) y += (y >= 70 ? 1900 : 2000);
    return {
      day: d,
      month: mo,
      year: y,
      dateStr: `${String(d).padStart(2, '0')}-${String(mo).padStart(2, '0')}-${y}`
    };
  }
  const dt = new Date(clean);
  if (!isNaN(dt.getTime())) {
    const d = dt.getDate(), mo = dt.getMonth() + 1, y = dt.getFullYear();
    return {
      day: d,
      month: mo,
      year: y,
      dateStr: `${String(d).padStart(2, '0')}-${String(mo).padStart(2, '0')}-${y}`
    };
  }
  const now = new Date();
  const d = now.getDate(), mo = now.getMonth() + 1, y = now.getFullYear();
  return {
    day: d,
    month: mo,
    year: y,
    dateStr: `${String(d).padStart(2, '0')}-${String(mo).padStart(2, '0')}-${y}`
  };
};

// ── Auto-sync Bank Book Main Cash -> Main Cashbook (Cash Receive Bank Book) ────
const syncMainCashToCashBook = async (affectedDocs) => {
  if (!Array.isArray(affectedDocs) || affectedDocs.length === 0) return;

  const datesToSync = new Set();

  affectedDocs.forEach(doc => {
    const ledger = (doc.ledgerName || doc['Ledger Name'] || '').trim().toLowerCase();
    if (ledger === 'main cash' || doc._id) {
      const rawDate = doc.transactionDate || doc['Transaction Date'];
      const dateParts = parseDateParts(rawDate);
      if (dateParts && dateParts.dateStr) {
        datesToSync.add(JSON.stringify(dateParts));
      }
    }
  });

  if (datesToSync.size === 0) return;

  const col = mongoose.connection.useDb('main_cashbook').collection('entries');

  for (const dateItemStr of datesToSync) {
    const { day, month, year, dateStr } = JSON.parse(dateItemStr);

    const dateVariants = [
      dateStr,
      `${day}-${month}-${year}`,
      `${String(day).padStart(2, '0')}-${month}-${year}`,
      `${day}-${String(month).padStart(2, '0')}-${year}`,
      `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      `${year}-${month}-${day}`
    ];

    // Find all 'Main Cash' transactions for this date across account_details
    const matchingBankDocs = await AccountDetail.find({
      ledgerName: { $regex: /^main cash$/i },
      $or: [
        { transactionDate: { $in: dateVariants } },
        { transactionDate: { $regex: new RegExp(`^${year}[-\\/]0?${month}[-\\/]0?${day}`) } },
        { transactionDate: { $regex: new RegExp(`^0?${day}[-\\/]0?${month}[-\\/]${year}`) } }
      ]
    });

    let totalWithdraw = 0;
    const refs = [];

    matchingBankDocs.forEach(d => {
      const w = parseFloat(String(d.withdraw || '').replace(/,/g, ''));
      if (!isNaN(w) && w > 0) {
        totalWithdraw += w;
        refs.push({
          id: d._id.toString(),
          withdraw: w,
          names: d.names || '',
          transactionDate: d.transactionDate || ''
        });
      }
    });

    // Match existing cashbook row for this date
    let cashbookRow = await col.findOne({
      $or: [
        { DATE: { $in: dateVariants }, month, year },
        { DATE: { $in: dateVariants } }
      ]
    });

    if (!cashbookRow) {
      if (totalWithdraw > 0) {
        // Create new row if missing
        const highest = await col.find({ month, year }).sort({ "SL NO": -1 }).limit(1).toArray();
        const nextSl = highest.length > 0 && typeof highest[0]["SL NO"] === 'number'
          ? highest[0]["SL NO"] + 1 : 1;

        const newEntry = {
          DATE: dateStr,
          month,
          year,
          "SL NO": nextSl,
          P_OPENING: 0,
          P_CASH_RECV_BB: totalWithdraw,
          _bb_main_cash_refs: refs,
          P_LOAN_RECV: '',
          P_LOAN_PAY: '',
          P_WITHDRAW: 0,
          P_GIVEN_DAC: 0,
          P_GIVEN_OFFICE: 0,
          P_LOAN_REPAY: 0,
          P_LOAN_BALANCE: 0,
          P_OTHERS: 0,
          S_OPENING: 0,
          S_TRANS_OFFICE: 0,
          S_TRANS_TO_OFFICE: 0,
          O_OPENING: 0,
          _created_at: new Date()
        };

        const result = await col.insertOne(newEntry);
        cashbookRow = { _id: result.insertedId, ...newEntry };
      }
    } else {
      await col.updateOne(
        { _id: cashbookRow._id },
        {
          $set: {
            P_CASH_RECV_BB: totalWithdraw,
            _bb_main_cash_refs: refs
          }
        }
      );
    }

    try {
      const { getIO } = require('../socket');
      const io = getIO();
      if (io) io.emit('mainCashbookUpdates', { action: 'sync-main-cash-bank-book', date: dateStr, amount: totalWithdraw });
    } catch (socketErr) {
      console.warn('Socket notify failed:', socketErr.message);
    }
  }
};

const makeSpaceAgnosticRegex = (str) => {
  if (!str) return /^$/;
  const stripped = str.replace(/[^a-zA-Z0-9]/g, '');
  const regexStr = stripped.split('').join('[^a-zA-Z0-9]*');
  return new RegExp(`^[^a-zA-Z0-9]*${regexStr}[^a-zA-Z0-9]*$`, 'i');
};

// ── Auto-sync Bank Book Freight Advance -> Cement Register ──────────────────
const syncFreightAdvanceToCementRegister = async (affectedDocs) => {
  const getCombo = (doc) => {
    const ledger = (doc.ledgerName || '').trim().toLowerCase();
    if (ledger !== 'freight advance') return null;
    const v = (doc.vehicle || '').trim();
    if (!v) return null;

    const docMonthStr = (doc.month || doc.selectedMonth || '').trim();
    const m = monthNameToNumber(docMonthStr);
    if (m < 1 || m > 12) return null;

    let fyStart = parseInt(doc.selectedYear, 10);
    if (isNaN(fyStart)) {
      const tDate = doc.transactionDate || doc['Transaction Date'];
      if (tDate) {
        const parts = String(tDate).split(/[-\/\.]/);
        if (parts.length === 3) {
          let yr = parseInt(parts[0], 10);
          if (isNaN(yr) || yr < 1000) yr = parseInt(parts[2], 10);
          if (!isNaN(yr)) {
            if (yr < 100) yr += 2000;
            fyStart = (m >= 4) ? yr : yr - 1;
          }
        }
      }
      if (isNaN(fyStart)) {
        const nowY = new Date().getFullYear();
        fyStart = (m >= 4) ? nowY : nowY - 1;
      }
    }

    const y = (m >= 4) ? fyStart : fyStart + 1;
    return { vehicleNo: v, month: m, year: y };
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

    // Find all 'freight advance' documents for this vehicle in the Bank Book
    const relatedDocs = await AccountDetail.find({
      vehicle: { $regex: makeSpaceAgnosticRegex(combo.vehicleNo) },
      ledgerName: { $regex: /^freight advance$/i }
    });

    let totalWithdraw = 0;
    relatedDocs.forEach(d => {
      const dCombo = getCombo(d);
      if (dCombo && dCombo.month === combo.month && dCombo.year === combo.year) {
        const amt = parseFloat(String(d.withdraw || '').replace(/,/g, ''));
        if (!isNaN(amt)) totalWithdraw += amt;
      }
    });

    // Find all matching Cement Register rows for this Vehicle
    const cementRows = await col.find({
      "VEHICLE NUMBER": { $regex: makeSpaceAgnosticRegex(combo.vehicleNo) }
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

const VALIDITY_FIELD_CONFIGS = [
  { label: 'RC VALIDITY', dbKey: 'RC', primaryKey: 'RC Validity', altKeys: ['rc_validity', 'RC VALIDITY', 'RC'] },
  { label: 'INSURANCE VALIDITY', dbKey: 'INSURANCE', primaryKey: 'Insurance Validity', altKeys: ['insurance_validity', 'INSURANCE VALIDITY', 'INSURANCE'] },
  { label: 'FITNESS VALIDITY', dbKey: 'FITNESS', primaryKey: 'Fitness Validity', altKeys: ['fitness_validity', 'FITNESS VALIDITY', 'FITNESS'] },
  { label: 'ROAD TAX VALIDITY', dbKey: 'ROAD TAX', primaryKey: 'Road Tax Validity', altKeys: ['road_tax_validity', 'ROAD TAX VALIDITY', 'ROAD TAX'] },
  { label: 'PERMIT', dbKey: 'PERMIT', primaryKey: 'Permit', altKeys: ['permit', 'PERMIT', 'permit_validity', 'Permit Validity'] },
  { label: 'PUC', dbKey: 'PUC', primaryKey: 'PUC', altKeys: ['puc', 'PUC', 'puc_validity', 'PUC Validity'] },
  { label: 'NP VALIDITY', dbKey: 'NP', primaryKey: 'NP Validity', altKeys: ['np_validity', 'NP VALIDITY', 'NP'] },
  { label: 'LICENSE VALIDITY', dbKey: 'LICENSE', primaryKey: 'License Validity', altKeys: ['license_validity', 'LICENSE VALIDITY', 'LICENSE'] },
  { label: 'DRIVER AUTHORISE VALIDITY', dbKey: 'DRIVER AUTHORISE', primaryKey: 'Driver Authoraization validity', altKeys: ['driver_authorization_validity', 'DRIVER AUTHORIZATION VALIDITY', 'Driver Authorise Validity', 'driver_authorise_validity', 'DRIVER AUTHORISE VALIDITY'] }
];

function resolveValidityConfig(val) {
  if (!val) return null;
  const clean = String(val).trim().toUpperCase();
  for (const cfg of VALIDITY_FIELD_CONFIGS) {
    if (cfg.label === clean || cfg.dbKey === clean) return cfg;
    if (clean.replace(/\s+VALIDITY$/i, '').trim() === cfg.dbKey) return cfg;
    for (const alt of cfg.altKeys) {
      if (alt.toUpperCase() === clean || clean === alt.toUpperCase().replace(/\s+VALIDITY$/i, '').trim()) return cfg;
    }
  }
  return null;
}

// ── Auto-sync Bank Book BRINDA SHYAM / JEET PANJA -> Cement Register & Road Tax Validity ──
const syncCreditorWithdrawToCementAndValidity = async (affectedDocs, isDelete = false) => {
  if (!affectedDocs || !Array.isArray(affectedDocs) || affectedDocs.length === 0) {
    return { warnings: [] };
  }

  const warnings = [];
  const mongoose = require('mongoose');
  const cementCol = mongoose.connection.useDb('cement_register').collection('entries');
  const roadTaxCol = mongoose.connection.useDb('invoice_system').collection('road_tax_register');
  const ownerCol = mongoose.connection.useDb('invoice_system').collection('owner details');
  const truckCol = mongoose.connection.useDb('invoice_system').collection('Truck Contact Number');
  const { getIO } = require('../socket');

  const monthsList = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const now = new Date();
  const curMonthIdx = now.getMonth();
  const prevMonthIdx = (curMonthIdx - 1 + 12) % 12;
  const curMonthName = monthsList[curMonthIdx];
  const prevMonthName = monthsList[prevMonthIdx];

  // Deduplicate docs by _id to avoid double-processing
  const docMap = new Map();
  for (const doc of affectedDocs) {
    if (!doc || !doc._id) continue;
    docMap.set(doc._id.toString(), doc);
  }

  for (const doc of docMap.values()) {
    const ledger = (doc.ledgerName || '').trim();
    const isBrinda = /^brinda\s*shyam$/i.test(ledger);
    const isJeet = /^jeet\s*panja$/i.test(ledger);
    if (!isBrinda && !isJeet) continue;

    const creditorName = isJeet ? 'JEET PANJA' : 'BRINDA SHYAM';
    const vehicleNo = (doc.vehicle || '').trim();
    const ownerName = (doc.names || '').trim();
    const withdrawAmount = num(doc.withdraw);

    // Month validation: must be CURRENT MONTH or PREVIOUS MONTH
    const docMonth = (doc.month || doc.selectedMonth || '').trim();
    const docMonthLower = docMonth.toLowerCase();
    const isCurrentMonth = docMonthLower === curMonthName.toLowerCase();
    const isPreviousMonth = docMonthLower === prevMonthName.toLowerCase();

    if (!isCurrentMonth && !isPreviousMonth) {
      warnings.push(`Ledger ${creditorName} for vehicle ${vehicleNo || 'N/A'} requires Current Month (${curMonthName}) or Previous Month (${prevMonthName}).`);
      continue;
    }

    if (!vehicleNo || !ownerName) {
      continue;
    }

    const targetMonthNum = isCurrentMonth ? (curMonthIdx + 1) : (prevMonthIdx + 1);
    let targetYear = now.getFullYear();
    if (isPreviousMonth && curMonthIdx === 0) {
      targetYear = now.getFullYear() - 1;
    }
    if (doc.selectedYear && !isNaN(parseInt(doc.selectedYear, 10))) {
      const sy = parseInt(doc.selectedYear, 10);
      if (sy > 2000) targetYear = sy;
    }

    const txIdStr = doc._id.toString();
    const prevSync = doc._creditorSync || {};
    const wasApplied = Boolean(prevSync.applied);
    const prevAmount = num(prevSync.amount);

    let delta = 0;
    if (isDelete) {
      delta = wasApplied ? -prevAmount : 0;
    } else {
      delta = wasApplied ? (withdrawAmount - prevAmount) : withdrawAmount;
    }

    if (delta === 0 && wasApplied && !isDelete) {
      // Duplicate save protection: already applied with the exact same amount
      continue;
    }

    if (withdrawAmount <= 0 && !wasApplied) {
      continue;
    }

    // ── 1. CEMENT REGISTER INTEGRATION ─────────────────────────────
    const vehicleRegex = makeSpaceAgnosticRegex(vehicleNo);
    const candidateTrips = await cementCol.find({
      "VEHICLE NUMBER": { $regex: vehicleRegex }
    }).toArray();

    const matchingTrips = [];
    for (const trip of candidateTrips) {
      let tripMonth = trip.month ? parseInt(trip.month, 10) : null;
      let tripYear = trip.year ? parseInt(trip.year, 10) : null;
      const rawDate = trip["LOADING DT"] || trip["LOADING DATE"] || trip["BILL DATE"] || trip["RECEIVING DATE"] || trip["INVOICE DATE"];
      const dObj = parseToDate(rawDate);
      if (dObj.getTime() > 0) {
        if (!tripMonth) tripMonth = dObj.getMonth() + 1;
        if (!tripYear) tripYear = dObj.getFullYear();
      }

      if (tripMonth !== targetMonthNum || tripYear !== targetYear) {
        continue;
      }

      // Check Owner Name compatibility if both exist
      const tripOwner = (trip["OWNER NAME"] || '').trim().toLowerCase();
      if (tripOwner && ownerName) {
        const cleanTripOwner = tripOwner.replace(/[^a-z0-9]/g, '');
        const cleanDocOwner = ownerName.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!cleanTripOwner.includes(cleanDocOwner) && !cleanDocOwner.includes(cleanTripOwner)) {
          continue;
        }
      }

      matchingTrips.push({
        trip,
        dateObj: dObj,
        rawDate
      });
    }

    let latestTrip = null;
    let latestWrapper = null;

    if (matchingTrips.length === 0) {
      warnings.push("No Cement Register trip found for this vehicle in the selected month.");
    } else {
      // Sort trips by actual trip/invoice date descending to determine the LATEST trip
      matchingTrips.sort((a, b) => {
        const diff = b.dateObj.getTime() - a.dateObj.getTime();
        if (diff !== 0) return diff;
        return String(b.trip._id).localeCompare(String(a.trip._id));
      });

      latestWrapper = matchingTrips[0];
      latestTrip = latestWrapper.trip;

      const appliedTripTxIds = Array.isArray(latestTrip.appliedBankBookTxIds) ? latestTrip.appliedBankBookTxIds : [];
      const alreadyOnTrip = appliedTripTxIds.includes(txIdStr);

      if (isDelete) {
        if (alreadyOnTrip) {
          const existingBankTf = num(latestTrip["Bank TF"]);
          const newBankTf = Math.max(0, existingBankTf - prevAmount);
          await cementCol.updateOne(
            { _id: latestTrip._id },
            {
              $set: { "Bank TF": newBankTf },
              $pull: { appliedBankBookTxIds: txIdStr }
            }
          );
        }
      } else {
        if (!alreadyOnTrip) {
          const existingBankTf = num(latestTrip["Bank TF"]);
          const newBankTf = existingBankTf + delta;
          await cementCol.updateOne(
            { _id: latestTrip._id },
            {
              $set: { "Bank TF": newBankTf },
              $addToSet: { appliedBankBookTxIds: txIdStr }
            }
          );
        } else if (delta !== 0) {
          const existingBankTf = num(latestTrip["Bank TF"]);
          const newBankTf = Math.max(0, existingBankTf + delta);
          await cementCol.updateOne(
            { _id: latestTrip._id },
            {
              $set: { "Bank TF": newBankTf }
            }
          );
        }
      }
    }

    // ── 2. BRINDA SHYAM / JEET PANJA PANEL INTEGRATION ─────────────
    const creditorFilter = isJeet
      ? { creditor: 'JEET PANJA' }
      : { $or: [{ creditor: 'BRINDA SHYAM' }, { creditor: { $exists: false } }, { creditor: null }] };

    const rawParticulars = String(doc.particulars || '').trim();
    const vConfig = resolveValidityConfig(rawParticulars);

    if (!vConfig) {
      warnings.push(`Particulars must specify a valid Validity Type for ${creditorName} (e.g. RC VALIDITY, FITNESS VALIDITY).`);
      continue;
    }

    // Verify vehicle contact and owner match
    const contact = (await ownerCol.findOne({
      $or: [
        { "Truck No": { $regex: vehicleRegex } },
        { "Truck No ": { $regex: vehicleRegex } },
        { truck_no: { $regex: vehicleRegex } }
      ]
    })) || (await truckCol.findOne({
      $or: [
        { truck_no: { $regex: vehicleRegex } },
        { "Truck No": { $regex: vehicleRegex } },
        { "Truck No ": { $regex: vehicleRegex } }
      ]
    }));

    if (!contact) {
      warnings.push(`No vehicle contact found for ${vehicleNo}.`);
      continue;
    }

    if (ownerName) {
      const contactOwner = String(contact["Owner Name"] || contact["Owner Name "] || contact.owner_name || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      const selectedOwner = ownerName.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      if (contactOwner && selectedOwner && !contactOwner.includes(selectedOwner) && !selectedOwner.includes(contactOwner)) {
        warnings.push(`Vehicle ${vehicleNo} does not belong to selected Owner ${ownerName}.`);
        continue;
      }
    }

    // Check if contact actually has this validity configured or if an existing road tax doc exists
    let rawValidityDate = contact[vConfig.primaryKey];
    if (!rawValidityDate) {
      for (const alt of vConfig.altKeys) {
        if (contact[alt]) {
          rawValidityDate = contact[alt];
          break;
        }
      }
    }

    const truckClean = vehicleNo.toUpperCase().replace(/\s+/g, '');
    const typeKey = vConfig.dbKey.replace(/\s+/g, '_');
    const prefix = isJeet ? `${truckClean}_${typeKey}_JEET_PANJA` : `${truckClean}_${typeKey}`;
    const keyMonthYear = isJeet ? `${truckClean}_${typeKey}_${targetMonthNum}_${targetYear}_JEET_PANJA` : `${truckClean}_${typeKey}_${targetMonthNum}_${targetYear}`;

    const typeRegex = new RegExp(`^(${vConfig.dbKey}|${vConfig.label})$`, 'i');
    const baseQuery = {
      truckNo: truckClean,
      ...(isJeet
        ? { creditor: 'JEET PANJA' }
        : { $or: [{ creditor: 'BRINDA SHYAM' }, { creditor: { $exists: false } }, { creditor: null }] })
    };

    let roadTaxDoc = await roadTaxCol.findOne({
      ...baseQuery,
      validityType: typeRegex,
      month: targetMonthNum,
      year: targetYear
    }) || await roadTaxCol.findOne({
      ...baseQuery,
      validityType: typeRegex
    }) || await roadTaxCol.findOne({
      truckNo: truckClean,
      ...(isJeet ? { creditor: 'JEET PANJA' } : {}),
      key: { $in: [keyMonthYear, prefix] }
    });

    if (!roadTaxDoc && (!rawValidityDate || String(rawValidityDate).trim() === '-' || String(rawValidityDate).trim().toUpperCase() === 'N/A')) {
      warnings.push("No matching validity record found for this Owner, Vehicle and Validity Type.");
      continue;
    }

    // If previously applied to a DIFFERENT validity type or vehicle, revert previous amount from old record
    if (wasApplied && prevSync.validityDbKey && prevSync.validityDbKey !== vConfig.dbKey) {
      const oldTypeKey = prevSync.validityDbKey.replace(/\s+/g, '_');
      const oldTruckClean = (prevSync.vehicleNo || vehicleNo).toUpperCase().replace(/\s+/g, '');
      const oldPrefix = isJeet ? `${oldTruckClean}_${oldTypeKey}_JEET_PANJA` : `${oldTruckClean}_${oldTypeKey}`;
      const oldKeyMonthYear = isJeet ? `${oldTruckClean}_${oldTypeKey}_${targetMonthNum}_${targetYear}_JEET_PANJA` : `${oldTruckClean}_${oldTypeKey}_${targetMonthNum}_${targetYear}`;
      const oldDoc = await roadTaxCol.findOne({
        $or: [{ key: oldPrefix }, { keyMonthYear: oldKeyMonthYear }, { key: oldKeyMonthYear }]
      });
      if (oldDoc) {
        const oldPaid = Math.max(0, num(oldDoc.paidAmount) - prevAmount);
        const oldRec = num(oldDoc.receivableAmount);
        const oldBal = Math.round(Math.abs(oldRec - oldPaid) * 100) / 100;
        await roadTaxCol.updateMany(
          { $or: [{ _id: oldDoc._id }, { key: oldPrefix }, { keyMonthYear: oldKeyMonthYear }] },
          {
            $set: { paidAmount: oldPaid, balance: oldBal, updatedAt: new Date() },
            $pull: { appliedBankBookTxIds: txIdStr }
          }
        );
      }
    }

    if (roadTaxDoc) {
      const appliedRoadTxIds = Array.isArray(roadTaxDoc.appliedBankBookTxIds) ? roadTaxDoc.appliedBankBookTxIds : [];
      const alreadyOnRoadTax = appliedRoadTxIds.includes(txIdStr);

      const targetKeys = [roadTaxDoc.key, roadTaxDoc.keyMonthYear, prefix, keyMonthYear].filter(Boolean);
      const roadDocMatcher = {
        truckNo: truckClean,
        $or: [
          { _id: roadTaxDoc._id },
          { key: { $in: targetKeys } },
          { keyMonthYear: { $in: targetKeys } }
        ]
      };

      if (isDelete) {
        if (alreadyOnRoadTax) {
          const existingPaid = num(roadTaxDoc.paidAmount);
          const newPaid = Math.max(0, existingPaid - prevAmount);
          const recAmt = num(roadTaxDoc.receivableAmount);
          const newBalance = Math.round(Math.abs(recAmt - newPaid) * 100) / 100;
          await roadTaxCol.updateMany(
            roadDocMatcher,
            {
              $set: {
                paidAmount: newPaid,
                balance: newBalance,
                updatedAt: new Date()
              },
              $pull: { appliedBankBookTxIds: txIdStr }
            }
          );
        }
      } else {
        if (!alreadyOnRoadTax) {
          const existingPaid = num(roadTaxDoc.paidAmount);
          const newPaid = existingPaid + delta;
          const recAmt = num(roadTaxDoc.receivableAmount);
          const newBalance = Math.round(Math.abs(recAmt - newPaid) * 100) / 100;
          await roadTaxCol.updateMany(
            roadDocMatcher,
            {
              $set: {
                paidAmount: newPaid,
                balance: newBalance,
                validityType: vConfig.dbKey,
                creditor: creditorName,
                updatedAt: new Date()
              },
              $addToSet: { appliedBankBookTxIds: txIdStr }
            }
          );
        } else if (delta !== 0) {
          const existingPaid = num(roadTaxDoc.paidAmount);
          const newPaid = Math.max(0, existingPaid + delta);
          const recAmt = num(roadTaxDoc.receivableAmount);
          const newBalance = Math.round(Math.abs(recAmt - newPaid) * 100) / 100;
          await roadTaxCol.updateMany(
            roadDocMatcher,
            {
              $set: {
                paidAmount: newPaid,
                balance: newBalance,
                validityType: vConfig.dbKey,
                creditor: creditorName,
                updatedAt: new Date()
              }
            }
          );
        }
      }
    } else if (!isDelete && delta > 0) {
      const recordId = contact ? contact._id.toString() : '';
      const recAmt = 0;
      const newPaid = delta;
      const newBalance = Math.round(Math.abs(recAmt - newPaid) * 100) / 100;

      const initData = {
        key: prefix,
        keyMonthYear,
        truckNo: truckClean,
        recordId,
        validityType: vConfig.dbKey,
        creditor: creditorName,
        month: targetMonthNum,
        year: targetYear,
        renewStatus: 'PENDING',
        renewDate: '',
        newValidityDate: '',
        receivableAmount: recAmt,
        paidAmount: newPaid,
        balance: newBalance,
        appliedBankBookTxIds: [txIdStr],
        updatedAt: new Date()
      };

      await roadTaxCol.updateOne(
        { key: prefix },
        { $set: initData },
        { upsert: true }
      );
      await roadTaxCol.updateOne(
        { key: keyMonthYear },
        { $set: initData },
        { upsert: true }
      );
      roadTaxDoc = await roadTaxCol.findOne({ key: keyMonthYear });
    }

    // ── 3. PERSIST INTEGRATION RELATIONSHIP ON AccountDetail ──────
    if (isDelete) {
      await AccountDetail.updateOne(
        { _id: doc._id },
        { $unset: { _creditorSync: "" } }
      );
    } else {
      await AccountDetail.updateOne(
        { _id: doc._id },
        {
          $set: {
            _creditorSync: {
              applied: true,
              appliedAt: new Date(),
              txId: txIdStr,
              cementTripId: latestTrip ? latestTrip._id.toString() : '',
              cementTripDate: latestWrapper ? latestWrapper.rawDate : '',
              roadTaxId: roadTaxDoc ? roadTaxDoc._id.toString() : '',
              creditor: creditorName,
              amount: withdrawAmount,
              month: docMonth,
              vehicle: vehicleNo,
              names: ownerName,
              validityType: vConfig.label,
              validityDbKey: vConfig.dbKey
            }
          }
        }
      );
    }
  }

  try {
    const io = getIO();
    if (io) {
      io.emit('cementUpdates', { action: 'bulkUpdate' });
      io.emit('roadTaxUpdate', { action: 'bankBookSync' });
      io.emit('accountDetailsUpdate', { action: 'bankBookSync' });
    }
  } catch (e) {
    console.warn('Socket emit failed in syncCreditorWithdrawToCementAndValidity:', e.message);
  }

  return { warnings };
};

// ── Auto-sync Bank Book MONOJ BANDHAN -> Others Creditor (Monoj Bandhan) ──
// Every separate Bank Book withdrawal transaction for MONOJ BANDHAN creates a SEPARATE CREDIT ROW in OthersCreditor.
// Uses source Bank Book transaction ID (_id) for exact 1-to-1 linkage, edit/delete sync, and duplicate prevention.
const syncMonojBandhanWithdraw = async (affectedDocs, isDelete = false) => {
  if (!affectedDocs || !Array.isArray(affectedDocs) || affectedDocs.length === 0) {
    return { warnings: [] };
  }

  const warnings = [];
  const OthersCreditor = require('../models/OthersCreditor');
  const AccountDetail = require('../models/AccountDetail');
  const { getIO } = require('../socket');

  const monthsList = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  // Helper: Normalize date string to canonical YYYY-MM-DD
  const normalizeToYMD = (dStr) => {
    if (!dStr) return '';
    const d = parseToDate(dStr);
    if (d.getTime() > 0) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
    return String(dStr).trim();
  };

  // Deduplicate docs by _id
  const docMap = new Map();
  for (const doc of affectedDocs) {
    if (!doc || !doc._id) continue;
    docMap.set(doc._id.toString(), doc);
  }

  let monojNeedsBalanceRecalc = false;

  for (const doc of docMap.values()) {
    const txIdStr = doc._id.toString();
    const ledger = String(doc.ledgerName || '').trim();
    const name = String(doc.names || '').trim();
    const isMonojLedger = /^monoj\s*bandhan$/i.test(ledger);
    const isMonojName = /^monoj\s*bandhan$/i.test(name);
    const withdrawAmount = num(doc.withdraw);

    let prevSync = doc._monojSync;
    if (!prevSync && doc._id) {
      const dbDoc = await AccountDetail.findById(doc._id).lean();
      if (dbDoc && dbDoc._monojSync) {
        prevSync = dbDoc._monojSync;
      }
    }
    prevSync = prevSync || {};
    const wasApplied = Boolean(prevSync.applied);
    const prevAmount = num(prevSync.amount);

    // ── Find existing linked OthersCreditor record by unique transaction ID ──
    let linkedRecord = null;
    if (prevSync.monojRecordId && mongoose.Types.ObjectId.isValid(prevSync.monojRecordId)) {
      linkedRecord = await OthersCreditor.findById(prevSync.monojRecordId);
    }
    if (!linkedRecord) {
      linkedRecord = await OthersCreditor.findOne({
        creditorName: 'MONOJ BANDHAN',
        $or: [
          { sourceBankBookTxId: txIdStr },
          { appliedBankBookTxIds: txIdStr }
        ]
      });
    }

    // ── DELETE OR UNLINK SCENARIO ──
    // User deleted the Bank Book row, or changed ledger/name away from MONOJ BANDHAN, or reduced withdraw to 0
    if (isDelete || (wasApplied && (!isMonojLedger || !isMonojName || withdrawAmount <= 0))) {
      if (linkedRecord) {
        const hasOtherData = num(linkedRecord.debit) > 0 || (Array.isArray(linkedRecord.appliedBankBookTxIds) && linkedRecord.appliedBankBookTxIds.filter(id => id !== txIdStr).length > 0);
        if (!hasOtherData) {
          // Exclusively created for this Bank Book row: delete it
          await OthersCreditor.deleteOne({ _id: linkedRecord._id });
        } else {
          // Has other debits/transactions: subtract credit and remove tx ID
          const curCredit = num(linkedRecord.credit);
          const newCredit = Math.max(0, curCredit - (wasApplied ? prevAmount : withdrawAmount));
          await OthersCreditor.updateOne(
            { _id: linkedRecord._id },
            {
              $set: { credit: newCredit },
              $pull: { appliedBankBookTxIds: txIdStr }
            }
          );
        }
        monojNeedsBalanceRecalc = true;
      }
      await AccountDetail.updateOne({ _id: doc._id }, { $unset: { _monojSync: "" } });
      if (doc) delete doc._monojSync;
      continue;
    }

    // Must satisfy: Ledger Name = MONOJ BANDHAN and Names = MONOJ BANDHAN and withdraw > 0
    if (!isMonojLedger || !isMonojName || withdrawAmount <= 0) {
      continue;
    }

    // Normalize transaction date to canonical YYYY-MM-DD
    const rawDate = doc.transactionDate || doc.date || '';
    let docDate = normalizeToYMD(rawDate);
    if (!docDate) {
      docDate = new Date().toISOString().split('T')[0];
    }

    let docMonthNum = null;
    let docYearStr = doc.selectedYear || String(new Date().getFullYear());
    const rawMonth = doc.month || doc.selectedMonth || '';
    if (rawMonth) {
      const mIdx = monthsList.findIndex(m => m.toLowerCase() === String(rawMonth).trim().toLowerCase());
      if (mIdx !== -1) {
        docMonthNum = mIdx + 1;
      }
    }
    if (!docMonthNum) {
      const d = parseToDate(docDate);
      if (d.getTime() > 0) {
        docMonthNum = d.getMonth() + 1;
        docYearStr = String(d.getFullYear());
      } else {
        docMonthNum = new Date().getMonth() + 1;
      }
    }

    if (linkedRecord) {
      // ── EDIT SCENARIO: Update the exact corresponding linked record ──
      const curCredit = num(linkedRecord.credit);
      const curDate = normalizeToYMD(linkedRecord.date);

      // Check if anything changed
      if (curCredit === withdrawAmount && curDate === docDate && wasApplied) {
        // No changes needed
        continue;
      }

      await OthersCreditor.updateOne(
        { _id: linkedRecord._id },
        {
          $set: {
            credit: withdrawAmount,
            date: docDate,
            creditorName: 'MONOJ BANDHAN',
            ledgerName: 'MONOJ BANDHAN',
            names: 'MONOJ BANDHAN',
            vehicleNo: doc.vehicle || '',
            month: docMonthNum,
            year: docYearStr,
            sourceBankBookTxId: txIdStr,
            remarks: doc.remarks || `Bank Book Transfer (${rawMonth || ''})`
          },
          $addToSet: { appliedBankBookTxIds: txIdStr }
        }
      );
      monojNeedsBalanceRecalc = true;
    } else {
      // ── NEW ROW SCENARIO: Create a brand new SEPARATE credit row for this transaction ──
      const maxDoc = await OthersCreditor.findOne({ creditorName: 'MONOJ BANDHAN' }).sort({ slNo: -1 }).lean();
      const nextSlNo = (maxDoc && maxDoc.slNo ? Number(maxDoc.slNo) : 0) + 1;

      linkedRecord = new OthersCreditor({
        creditorName: 'MONOJ BANDHAN',
        slNo: nextSlNo,
        date: docDate,
        ledgerName: 'MONOJ BANDHAN',
        names: 'MONOJ BANDHAN',
        vehicleNo: doc.vehicle || '',
        credit: withdrawAmount,
        debit: 0,
        balance: withdrawAmount,
        remarks: doc.remarks || `Bank Book Transfer (${rawMonth || ''})`,
        month: docMonthNum,
        year: docYearStr,
        sourceBankBookTxId: txIdStr,
        appliedBankBookTxIds: [txIdStr]
      });
      await linkedRecord.save();
      monojNeedsBalanceRecalc = true;
    }

    // Save sync metadata on Bank Book document
    const syncMeta = {
      applied: true,
      appliedAt: new Date(),
      txId: txIdStr,
      monojRecordId: linkedRecord._id.toString(),
      amount: withdrawAmount,
      date: docDate,
      month: doc.month || doc.selectedMonth,
      ledgerName: doc.ledgerName,
      names: doc.names
    };
    await AccountDetail.updateOne(
      { _id: doc._id },
      { $set: { _monojSync: syncMeta } }
    );
    if (doc) doc._monojSync = syncMeta;
  }

  // ── Recalculate Monoj Bandhan Running Balances if records modified ──
  if (monojNeedsBalanceRecalc) {
    try {
      const allRows = await OthersCreditor.find({ creditorName: 'MONOJ BANDHAN' });

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
      for (let i = 0; i < allRows.length; i++) {
        const row = allRows[i];
        const cr = num(row.credit);
        const dr = num(row.debit);
        runningBal = runningBal + cr - dr;
        const calculatedBal = Math.round(runningBal * 100) / 100;
        const canonicalDate = normalizeToYMD(row.date) || row.date;
        const updateFields = { balance: calculatedBal, date: canonicalDate };
        if (!row.slNo) {
          updateFields.slNo = i + 1;
        }
        await OthersCreditor.updateOne(
          { _id: row._id },
          { $set: updateFields }
        );
      }
    } catch (balErr) {
      console.error('[syncMonojBandhanWithdraw] Balance recalculation error:', balErr);
    }

    try {
      const io = getIO();
      if (io) {
        io.emit('othersCreditorUpdate', { creditorName: 'MONOJ BANDHAN' });
        io.emit('accountDetailsUpdate', { action: 'monojSync' });
      }
    } catch (e) {
      console.warn('Socket emit failed in syncMonojBandhanWithdraw:', e.message);
    }
  }

  return { warnings };
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
  'Vehicle': 'vehicle',
  '_allocations': '_allocations'
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
      const mRegex = new RegExp(`^\\s*${month}\\s*$`, 'i');
      const yRegex = new RegExp(`^\\s*${year}\\s*$`, 'i');
      query.$and = [
        {
          $or: [
            { selectedMonth: mRegex },
            { month: mRegex }
          ]
        },
        {
          $or: [
            { selectedYear: yRegex },
            // Also fallback to checking if transactionDate contains the year (e.g. '2026-')
            { transactionDate: { $regex: new RegExp(`^\\s*${year}`, 'i') } }
          ]
        }
      ];
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

    let creditorWarnings = [];
    try {
      const credRes = await syncCreditorWithdrawToCementAndValidity(affectedDocsForSync);
      if (credRes && Array.isArray(credRes.warnings)) {
        creditorWarnings = credRes.warnings;
      }
    } catch (syncErr) {
      console.error('[accountDetailRoutes] syncCreditorWithdrawToCementAndValidity error:', syncErr.message);
    }

    try {
      await syncMonojBandhanWithdraw(affectedDocsForSync);
    } catch (syncErr) {
      console.error('[accountDetailRoutes] syncMonojBandhanWithdraw error:', syncErr.message);
    }

    try {
      await syncMainCashToCashBook(affectedDocsForSync);
    } catch (syncErr) {
      console.error('[accountDetailRoutes] syncMainCashToCashBook error:', syncErr.message);
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

    // Sync updates to already linked pump payment register records
    try {
      const pumpCol = mongoose.connection.useDb('pump_payment_register').collection('records');
      for (const item of updates) {
        const dbDoc = item.isNewRow ? createdDocs[item.id || 'new'] : updatedDocs[item.id];
        if (dbDoc && dbDoc.ledgerName && dbDoc.ledgerName.trim().toLowerCase() === "pump payment") {
          const withdrawAmt = Number(dbDoc.withdraw) || 0;
          await pumpCol.updateMany(
            { bankBookId: dbDoc._id.toString() },
            [
              {
                $set: {
                  "REF. NO": dbDoc.referenceNo || dbDoc.remarks || "",
                  "Remarks": dbDoc.remarks || "",
                  "PAYMENT AMOUNT": withdrawAmt,
                  "DUE AMOUNT": {
                    $subtract: [
                      { $convert: { input: "$PAYABLE AMOUNT", to: "double", onError: 0, onNull: 0 } },
                      withdrawAmt
                    ]
                  }
                }
              },
              {
                $set: {
                  "paymentStatus": {
                    $cond: {
                      if: { $lte: ["$DUE AMOUNT", 0] },
                      then: "Paid",
                      else: {
                        $cond: {
                          if: { $gt: ["$PAYMENT AMOUNT", 0] },
                          then: "Partially Paid",
                          else: "Pending"
                        }
                      }
                    }
                  },
                  "updatedAt": new Date()
                }
              }
            ]
          );
        }
      }

      try {
        const io = getIO();
        if (io) io.emit('pumpPaymentRegisterUpdate');
      } catch (socketErr) {
        console.warn('Socket notify failed for pumpPaymentRegisterUpdate:', socketErr.message);
      }
    } catch (syncRemarksErr) {
      console.error('[accountDetailRoutes] sync to pump payment register error:', syncRemarksErr.message);
    }

    res.json({ success: true, paymentResults, warnings: creditorWarnings });
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
      await syncCreditorWithdrawToCementAndValidity(docsToDelete, true);
    } catch (syncErr) {
      console.error('[accountDetailRoutes] syncCreditorWithdrawToCementAndValidity error on delete:', syncErr.message);
    }

    try {
      await syncMonojBandhanWithdraw(docsToDelete, true);
    } catch (syncErr) {
      console.error('[accountDetailRoutes] syncMonojBandhanWithdraw error on delete:', syncErr.message);
    }

    try {
      await syncMainCashToCashBook(docsToDelete);
    } catch (syncErr) {
      console.error('[accountDetailRoutes] syncMainCashToCashBook error on delete:', syncErr.message);
    }

    try {
      const { revertMonojSystem2Allocation } = require('./othersCreditorRoutes');
      if (typeof revertMonojSystem2Allocation === 'function') {
        for (const d of docsToDelete) {
          if (d._monojSystem2Allocation || (String(d.ledgerName || '').trim().toUpperCase() === 'MONOJ BANDHAN' && String(d.names || '').trim().toUpperCase() === 'OTHERS CREDITOR')) {
            await revertMonojSystem2Allocation(d._id);
          }
        }
      }
    } catch (s2DeleteErr) {
      console.error('[accountDetailRoutes] System 2 revert on delete error:', s2DeleteErr.message);
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
router.post('/clear-main-cash', async (req, res) => {
  try {
    const { transactionDate } = req.body;
    if (!transactionDate) {
      return res.status(400).json({ success: false, error: 'transactionDate required' });
    }

    const dateParts = parseDateParts(transactionDate);
    const fakeDoc = { ledgerName: 'Main cash', transactionDate };
    await syncMainCashToCashBook([fakeDoc]);

    res.json({ success: true, cleared: true, date: dateParts.dateStr });
  } catch (error) {
    console.error('Clear Main Cash Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// SYNC MAIN CASH: called when Ledger Name = "Main Cash" is saved in Account Details
// Syncs to Main Cashbook -> Cash Receive Bank Book (P_CASH_RECV_BB)
router.post('/sync-main-cash', async (req, res) => {
  try {
    const { transactionDate, withdrawAmount } = req.body;
    if (!transactionDate) {
      return res.status(400).json({ success: false, error: 'transactionDate required' });
    }

    const dateParts = parseDateParts(transactionDate);
    const fakeDoc = { ledgerName: 'Main cash', transactionDate, withdraw: withdrawAmount };
    await syncMainCashToCashBook([fakeDoc]);

    res.json({ success: true, updatedDate: dateParts.dateStr });
  } catch (error) {
    console.error('Sync Main Cash Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── GET /api/account-details/payment-receive-history ─────────────────────────
// Complete, live database-driven history of all Payment Received transactions from Bank Book
router.get('/payment-receive-history', async (req, res) => {
  try {
    const { fy, month, invoice, search } = req.query;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12
    const currentDay = now.getDate();

    // 1. Determine Financial Year bounds
    let startYear;
    if (fy && /^FY\s*\d{4}-\d{2}$/i.test(fy)) {
      startYear = parseInt(fy.replace(/\D/g, '').substring(0, 4), 10);
    } else {
      startYear = currentMonth < 4 ? currentYear - 1 : currentYear;
    }
    const endYear = startYear + 1;

    const fyStart = new Date(startYear, 3, 1, 0, 0, 0, 0); // 01-April-startYear
    const fyEnd = new Date(endYear, 2, 31, 23, 59, 59, 999); // 31-March-endYear
    const todayEnd = new Date(currentYear, currentMonth - 1, currentDay, 23, 59, 59, 999);

    // Current/future FY cutoff at today; past FY cutoff at fyEnd
    const cutoffDate = todayEnd.getTime() < fyEnd.getTime() ? todayEnd : fyEnd;
    const fyStartMs = fyStart.getTime();
    const cutoffMs = cutoffDate.getTime();

    // 2. Determine Month bounds if specified
    const MONTHS_LIST = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    let rangeStartMs = fyStartMs;
    let rangeEndMs = cutoffMs;

    if (month && month.toUpperCase() !== 'ALL') {
      const mIdx = MONTHS_LIST.findIndex(m => m.toLowerCase() === month.toLowerCase());
      if (mIdx !== -1) {
        const yearForMonth = mIdx >= 3 ? startYear : endYear;
        const mStart = new Date(yearForMonth, mIdx, 1, 0, 0, 0, 0);
        const mEnd = new Date(yearForMonth, mIdx + 1, 0, 23, 59, 59, 999);
        const effEnd = mEnd.getTime() < cutoffMs ? mEnd : new Date(cutoffMs);

        rangeStartMs = Math.max(fyStartMs, mStart.getTime());
        rangeEndMs = effEnd.getTime();
      }
    }

    // 3. Fetch authoritative Bill Register data and mappings
    const { getBillRegisterData } = require('../utils/billRegisterHelper');
    const FinancialYearRow = require('../models/FinancialYearRow');
    const FinancialYearPayment = require('../models/FinancialYearPayment');

    const [billData, fyRowDocs, fyPayments] = await Promise.all([
      getBillRegisterData({ fy: 'ALL' }),
      FinancialYearRow.find({}).lean(),
      FinancialYearPayment.find({}).lean()
    ]);

    const billRows = billData?.rows || [];

    // Build authoritative Bill Register lookup map
    const billMap = new Map();

    const registerBill = (key, billObj) => {
      if (!key) return;
      const k = String(key).trim();
      if (!k) return;
      if (!billMap.has(k)) {
        billMap.set(k, billObj);
      }
      const cleanKey = k.toLowerCase().replace(/[\s\-\/\_]/g, '');
      if (cleanKey && !billMap.has(cleanKey)) {
        billMap.set(cleanKey, billObj);
      }
    };

    const extractBillInfo = (item) => {
      const invNum = String(item.displayInvoiceNumber || item.editedInvoiceNumber || item.invoiceNumber || item.billNo || '').trim();
      const invDt = String(item.editedInvoiceDate || item.invoiceDate || '').trim();
      return {
        id: String(item._id || item.id || ''),
        invoiceNumber: invNum,
        invoiceDate: invDt || '—',
        site: item.site || item.editedSite || '',
        billNo: item.billNo || item.rawBillNumber || ''
      };
    };

    billRows.forEach(r => {
      const info = extractBillInfo(r);
      if (!info.invoiceNumber) return;
      if (r._id) registerBill(r._id.toString(), info);
      if (r.id) registerBill(r.id, info);
      if (r.billNo) registerBill(r.billNo, info);
      if (r.invoiceNumber) registerBill(r.invoiceNumber, info);
      if (r.displayInvoiceNumber) registerBill(r.displayInvoiceNumber, info);
      if (r.editedInvoiceNumber) registerBill(r.editedInvoiceNumber, info);
      if (Array.isArray(r.invoiceNos)) {
        r.invoiceNos.forEach(inNo => registerBill(inNo, info));
      }
    });

    fyRowDocs.forEach(r => {
      const info = extractBillInfo(r);
      if (!info.invoiceNumber) return;
      if (r._id) registerBill(r._id.toString(), info);
      if (r.billNo) registerBill(r.billNo, info);
      if (r.editedInvoiceNumber) registerBill(r.editedInvoiceNumber, info);
    });

    // Map deductionAllocations linking bankBookRecordId -> bill
    const bankDocToBillMap = new Map();
    fyRowDocs.forEach(r => {
      const info = extractBillInfo(r);
      if (Array.isArray(r.deductionAllocations)) {
        r.deductionAllocations.forEach(alloc => {
          if (alloc.bankBookRecordId) {
            const bId = String(alloc.bankBookRecordId).trim();
            if (!bankDocToBillMap.has(bId)) bankDocToBillMap.set(bId, []);
            bankDocToBillMap.get(bId).push(info);
          }
        });
      }
    });

    // 4. Query all Bank Book documents that represent Payment Received
    const docs = await AccountDetail.find({
      $or: [
        { deposit: { $exists: true, $nin: ['', null, '0', 0] } },
        { ledgerName: { $regex: /payment\s*received/i } },
        { particulars: { $regex: /payment\s*received/i } }
      ]
    }).lean();

    const allInvoicesSet = new Set();
    const transactions = [];

    docs.forEach(doc => {
      // Must have positive received amount
      const depAmt = num(doc.deposit);
      const withAmt = num(doc.withdraw);
      const isExplicitPayment = (doc.ledgerName && /payment\s*received/i.test(doc.ledgerName)) || (doc.particulars && /payment\s*received/i.test(doc.particulars));

      if (depAmt <= 0 && !isExplicitPayment) {
        return;
      }

      const rawDate = doc.transactionDate || doc['Transaction Date'] || doc.createdAt;
      const dateParts = parseDateParts(rawDate);
      if (!dateParts) return;

      const dateObj = new Date(dateParts.year, dateParts.month - 1, dateParts.day);
      const tMs = dateObj.getTime();

      // Check date bounds: >= rangeStartMs && <= rangeEndMs (strictly no future dates!)
      if (tMs < rangeStartMs || tMs > rangeEndMs) {
        return;
      }

      // Match genuine Bill Register record(s)
      const matchedBills = [];

      // 1. Explicit allocations on the Bank Book document
      if (Array.isArray(doc._allocations) && doc._allocations.length > 0) {
        doc._allocations.forEach(alloc => {
          const rawBill = String(alloc.rawBillNumber || alloc.billNo || alloc.invoiceNumber || alloc.billId || alloc._id || '').trim();
          if (rawBill) {
            const b = billMap.get(rawBill) || billMap.get(rawBill.toLowerCase().replace(/[\s\-\/\_]/g, ''));
            if (b && !matchedBills.some(m => m.invoiceNumber === b.invoiceNumber)) {
              matchedBills.push(b);
            }
          }
        });
      }

      // 2. Check deductionAllocations on FinancialYearRow
      const linkedFromDeductions = bankDocToBillMap.get(doc._id.toString());
      if (linkedFromDeductions && linkedFromDeductions.length > 0) {
        linkedFromDeductions.forEach(b => {
          if (!matchedBills.some(m => m.invoiceNumber === b.invoiceNumber)) {
            matchedBills.push(b);
          }
        });
      }

      // 3. Check FinancialYearPayment exact reference match
      const docRef = String(doc.referenceNo || '').trim();
      if (docRef && docRef !== '-' && docRef !== '—') {
        const matchingPay = fyPayments.find(p => p.referenceNo && String(p.referenceNo).trim() === docRef);
        if (matchingPay && Array.isArray(matchingPay.billNos)) {
          matchingPay.billNos.forEach(bNo => {
            const b = billMap.get(bNo) || billMap.get(String(bNo).toLowerCase().replace(/[\s\-\/\_]/g, ''));
            if (b && !matchedBills.some(m => m.invoiceNumber === b.invoiceNumber)) {
              matchedBills.push(b);
            }
          });
        }
      }

      // Authoritative genuine values (never guessed or regex extracted)
      let invoiceNoDisplay = '—';
      let invoiceDateDisplay = '—';
      const invList = [];

      if (matchedBills.length > 0) {
        invoiceNoDisplay = matchedBills.map(b => b.invoiceNumber).filter(Boolean).join(', ');
        invoiceDateDisplay = matchedBills.map(b => b.invoiceDate).filter(Boolean).join(', ');
        matchedBills.forEach(b => {
          if (b.invoiceNumber && !invList.includes(b.invoiceNumber)) {
            invList.push(b.invoiceNumber);
            allInvoicesSet.add(b.invoiceNumber);
          }
        });
      }

      const amtReceived = depAmt > 0 ? depAmt : withAmt;

      const refNo = String(doc.referenceNo || '').trim();
      const chqNo = String(doc.chequeNo || '').trim();
      let refType = '—';
      if (chqNo && chqNo !== '-') refType = 'CHEQUE';
      else if (refNo && refNo !== '-') refType = 'REFERENCE';
      else if (/neft|rtgs|imps|upi/i.test(doc.particulars || '')) refType = 'ONLINE';

      const finalRefNum = (refNo && refNo !== '-') ? refNo : ((chqNo && chqNo !== '-') ? chqNo : '—');

      transactions.push({
        id: doc._id.toString(),
        _id: doc._id.toString(),
        date: dateParts.dateStr,
        dateMs: tMs,
        transactionType: doc.ledgerName || 'Payment Received',
        ledger: doc.ledgerName || 'Payment Received',
        month: doc.month || doc.selectedMonth || MONTHS_LIST[dateParts.month - 1] || '—',
        particulars: doc.particulars || '—',
        name: doc.names || '—',
        invoiceNo: invoiceNoDisplay,
        invoiceDate: invoiceDateDisplay,
        invoiceList: invList,
        reference: refType,
        referenceNumber: finalRefNum,
        amountReceived: amtReceived,
        status: 'RECEIVED',
        remarks: doc.remarks || '—',
        vehicle: doc.vehicle || '—',
        closingBalance: doc.closingBalance || '—',
        createdAt: doc.createdAt
      });
    });

    // 4. Sort deterministically by date ascending, then ID ascending
    transactions.sort((a, b) => {
      if (a.dateMs !== b.dateMs) return a.dateMs - b.dateMs;
      return String(a.id).localeCompare(String(b.id));
    });

    // Available invoices for the current FY / Month
    const availableInvoices = Array.from(allInvoicesSet).sort();

    // 5. Apply Invoice filter
    let filteredTransactions = transactions;
    if (invoice && invoice.toUpperCase() !== 'ALL') {
      const invClean = String(invoice).trim();
      filteredTransactions = filteredTransactions.filter(t =>
        t.invoiceList.includes(invClean) || t.invoiceNo.includes(invClean)
      );
    }

    // 6. Apply Search filter
    if (search && String(search).trim() !== '') {
      const s = String(search).trim().toLowerCase();
      filteredTransactions = filteredTransactions.filter(t =>
        (t.invoiceNo || '').toLowerCase().includes(s) ||
        (t.referenceNumber || '').toLowerCase().includes(s) ||
        (t.reference || '').toLowerCase().includes(s) ||
        (t.ledger || '').toLowerCase().includes(s) ||
        (t.name || '').toLowerCase().includes(s) ||
        (t.particulars || '').toLowerCase().includes(s) ||
        (t.vehicle || '').toLowerCase().includes(s) ||
        (t.remarks || '').toLowerCase().includes(s) ||
        (t.date || '').toLowerCase().includes(s) ||
        String(t.amountReceived).includes(s)
      );
    }

    // 7. Calculate SL NO & Summary Metrics
    const recordsWithSl = filteredTransactions.map((t, idx) => ({
      slNo: idx + 1,
      ...t
    }));

    const totalPaymentReceived = recordsWithSl.reduce((sum, r) => sum + (r.amountReceived || 0), 0);

    const formattedStartDate = `01-04-${startYear}`;
    const formattedEndDate = `${String(new Date(rangeEndMs).getDate()).padStart(2, '0')}-${String(new Date(rangeEndMs).getMonth() + 1).padStart(2, '0')}-${new Date(rangeEndMs).getFullYear()}`;

    res.json({
      success: true,
      fy: `FY ${startYear}-${String(endYear).slice(-2)}`,
      month: month || 'ALL',
      period: {
        start: formattedStartDate,
        end: formattedEndDate,
        display: `${formattedStartDate} to ${formattedEndDate}`
      },
      summary: {
        totalTransactions: recordsWithSl.length,
        totalPaymentReceived: Math.round(totalPaymentReceived * 100) / 100
      },
      availableInvoices,
      count: recordsWithSl.length,
      records: recordsWithSl
    });

  } catch (error) {
    console.error('[PaymentReceiveHistory] API Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
module.exports.syncPartyPayments = syncPartyPayments;
module.exports.syncFreightAdvanceToCementRegister = syncFreightAdvanceToCementRegister;
module.exports.syncCreditorWithdrawToCementAndValidity = syncCreditorWithdrawToCementAndValidity;
module.exports.syncMonojBandhanWithdraw = syncMonojBandhanWithdraw;
module.exports.syncMainCashToCashBook = syncMainCashToCashBook;
module.exports.VALIDITY_FIELD_CONFIGS = VALIDITY_FIELD_CONFIGS;
module.exports.resolveValidityConfig = resolveValidityConfig;

