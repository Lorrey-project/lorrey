const mongoose = require("mongoose");
const { ObjectId } = require("mongodb");
const OthersCreditor = require("../models/OthersCreditor");
const AccountDetail = require("../models/AccountDetail");
const { getIO } = require("../socket");
const { syncDummyCementRow, deleteDummyRowBySource, isDummyRow } = require("./dummyCementRowManager");

function getCementCollection() {
  return mongoose.connection.useDb("cement_register").collection("entries");
}

const parseToDate = (dStr) => {
  if (!dStr) return new Date(0);
  if (dStr instanceof Date && !isNaN(dStr.getTime())) return dStr;
  const clean = String(dStr).trim();
  const parts = clean.split(/[-\/\.]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) return date;
    } else {
      // DD-MM-YYYY
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      let year = parseInt(parts[2], 10);
      if (parts[2].length === 2) {
        year += (year >= 70 ? 1900 : 2000);
      }
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) return date;
    }
  }
  const d = new Date(clean);
  if (!isNaN(d.getTime())) return d;
  return new Date(0);
};

const num = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};

function makeSpaceAgnosticRegex(str) {
  if (!str) return null;
  const stripped = String(str).replace(/[^a-zA-Z0-9]/g, '');
  if (!stripped) return null;
  const regexStr = stripped.split('').join('[^a-zA-Z0-9]*');
  return new RegExp(`^[^a-zA-Z0-9]*${regexStr}[^a-zA-Z0-9]*$`, 'i');
}

/**
 * Checks if two date inputs correspond to the exact same calendar date (Day, Month, Year).
 */
function isSameCalendarDate(d1, d2) {
  const date1 = parseToDate(d1);
  const date2 = parseToDate(d2);
  if (!date1 || !date2 || isNaN(date1.getTime()) || isNaN(date2.getTime()) || date1.getTime() === 0 || date2.getTime() === 0) {
    return false;
  }
  return date1.getFullYear() === date2.getFullYear() &&
         date1.getMonth() === date2.getMonth() &&
         date1.getDate() === date2.getDate();
}

/**
 * Check if an Others Creditor row qualifies for Freight Advance -> Cement Register sync.
 * Strictly limited to: OTHER CREDITOR -> MONOJ BANDHAN with LEDGER NAME = FREIGHT ADVANCE.
 */
function isQualifyingManojFreightAdvance(doc) {
  if (!doc) return false;
  const creditor = String(doc.creditorName || '').trim().toUpperCase();
  if (creditor !== 'MONOJ BANDHAN' && creditor !== 'MANOJ BANDHAN') return false;

  const ledger = String(doc.ledgerName || '').trim().toLowerCase();
  const isFreightLedger = !ledger || ledger === 'freight advance' || ledger === 'freight_advance' || ledger.replace(/\s+/g, '') === 'freightadvance';

  return isFreightLedger;
}

/**
 * Check if a Bank Book row qualifies for Freight Advance -> Cement Register sync.
 * Strictly limited to: BANK BOOK with LEDGER NAME = FREIGHT ADVANCE.
 */
function isQualifyingBankBookFreightAdvance(doc) {
  if (!doc) return false;
  const ledger = String(doc.ledgerName || '').trim().toLowerCase();
  return ledger === 'freight advance' || ledger === 'freight_advance' || ledger.replace(/\s+/g, '') === 'freightadvance';
}

function isQualifyingFreightAdvance(doc) {
  return isQualifyingManojFreightAdvance(doc) || isQualifyingBankBookFreightAdvance(doc);
}

/**
 * Find the SAME-DATE real Cement Register trip/invoice record for the selected OWNER + VEHICLE + EXACT DATE.
 * Strictly excludes dummy rows.
 */
async function findSameDateCementRecord(vehicleNumber, ownerName = "", txDate = null) {
  if (!vehicleNumber || !txDate) return null;
  const col = getCementCollection();

  const strippedVeh = String(vehicleNumber).replace(/[^a-zA-Z0-9]/g, '');
  if (!strippedVeh) return null;
  const regexStr = strippedVeh.split('').join('[^a-zA-Z0-9]*');
  const vehFilter = {
    $regex: new RegExp(`^[^a-zA-Z0-9]*${regexStr}[^a-zA-Z0-9]*$`, 'i')
  };

  const query = {
    $or: [
      { "VEHICLE NUMBER": vehFilter },
      { "VEHICLE NO": vehFilter },
      { "VEHICLE NO.": vehFilter },
      { "vehicleNumber": vehFilter }
    ]
  };

  const rawEntries = await col.find(query).toArray();
  if (!rawEntries || rawEntries.length === 0) return null;

  const realEntries = rawEntries.filter(e => !isDummyRow(e));
  if (!realEntries || realEntries.length === 0) return null;

  let matchedEntries = realEntries;
  if (ownerName) {
    const cleanOwner = String(ownerName).trim().toLowerCase();
    if (cleanOwner) {
      const ownerMatches = realEntries.filter(e => {
        const rowOwner = String(e["OWNER NAME"] || e["PARTY NAME"] || e["OWNER"] || e["owner_name"] || e["Owner Name"] || "").trim().toLowerCase();
        return rowOwner && (rowOwner.includes(cleanOwner) || cleanOwner.includes(rowOwner));
      });
      if (ownerMatches.length > 0) {
        matchedEntries = ownerMatches;
      }
    }
  }

  // Filter for EXACT SAME calendar date as txDate
  const sameDateEntries = matchedEntries.filter(entry => {
    const rawDate = entry["LOADING DT"] || entry["LOADING DATE"] || entry["BILL DATE"] || entry["INVOICE DATE"] || entry["RECEIVING DATE"] || entry["UNLOADING STATUS"] || entry["DATE"] || entry.date;
    return isSameCalendarDate(rawDate, txDate);
  });

  if (!sameDateEntries || sameDateEntries.length === 0) {
    return null;
  }

  // Tie-breaker for multiple same-date real trips: most recently created/updated
  sameDateEntries.sort((a, b) => {
    const idTimeA = a._id && typeof a._id.getTimestamp === 'function' ? a._id.getTimestamp().getTime() : new Date(a.createdAt || 0).getTime();
    const idTimeB = b._id && typeof b._id.getTimestamp === 'function' ? b._id.getTimestamp().getTime() : new Date(b.createdAt || 0).getTime();
    return idTimeB - idTimeA;
  });

  return sameDateEntries[0];
}

/**
 * Reverses a Freight Advance contribution (from Manoj Bandhan OR Bank Book) from Cement Register.
 */
async function reverseFreightAdvanceContribution(docOrId, sourceHint = null) {
  try {
    const col = getCementCollection();
    let doc = null;
    let source = sourceHint;

    if (typeof docOrId === 'string' || docOrId instanceof ObjectId) {
      doc = await OthersCreditor.findById(docOrId).lean();
      if (doc) source = 'MONOJ_BANDHAN';
      else {
        doc = await AccountDetail.findById(docOrId).lean();
        if (doc) source = 'BANK_BOOK';
      }
    } else {
      doc = docOrId;
      if (!source) {
        source = doc.creditorName ? 'MONOJ_BANDHAN' : 'BANK_BOOK';
      }
    }

    if (!doc || !doc._id) return { success: false, notFound: true };
    const txIdStr = String(doc._id);

    // Locate the cement record
    let cementRecord = null;
    if (doc._cementSync && doc._cementSync.cementRecordId) {
      try {
        cementRecord = await col.findOne({ _id: new ObjectId(doc._cementSync.cementRecordId) });
      } catch (_) {}
    }
    if (!cementRecord) {
      cementRecord = await col.findOne({
        $or: [
          { "_freightAdvanceContributions.txId": txIdStr },
          { "_monojDebitContributions.txId": txIdStr },
          { sourceTransactionId: txIdStr }
        ]
      });
    }

    // Clean up any dummy row explicitly tied to this source transaction id
    await deleteDummyRowBySource('MONOJ_BANDHAN_FREIGHT_ADVANCE', txIdStr);
    await deleteDummyRowBySource('BANK_BOOK_FREIGHT_ADVANCE', txIdStr);
    await deleteDummyRowBySource('FREIGHT_ADVANCE', txIdStr);

    if (!cementRecord) {
      return { success: true, notLinked: true };
    }

    const contributions = Array.isArray(cementRecord._freightAdvanceContributions)
      ? cementRecord._freightAdvanceContributions
      : (Array.isArray(cementRecord._monojDebitContributions) ? cementRecord._monojDebitContributions : []);

    const matchContrib = contributions.find(c => String(c.txId) === txIdStr);
    const revAmount = matchContrib ? num(matchContrib.amount) : (doc._cementSync ? num(doc._cementSync.amount) : 0);
    const remainingContributions = contributions.filter(c => String(c.txId) !== txIdStr);

    // Sum of remaining contributions
    const newBankTf = Math.round(remainingContributions.reduce((sum, c) => sum + num(c.amount), 0) * 100) / 100;

    // If cementRecord is a dummy row
    if (cementRecord.isDummy === true || cementRecord._isDummy === true) {
      if (remainingContributions.length === 0 || newBankTf <= 0) {
        await col.deleteOne({ _id: cementRecord._id });
        try {
          const io = getIO();
          if (io) io.emit('cementUpdates', { action: 'dummyRowDeleted', id: cementRecord._id.toString() });
        } catch (_) {}
      } else {
        await col.updateOne(
          { _id: cementRecord._id },
          {
            $set: {
              "Bank TF": newBankTf,
              "BANK TF": newBankTf,
              "ADVANCE (BANK TF)": newBankTf,
              _freightAdvanceContributions: remainingContributions,
              _monojDebitContributions: remainingContributions
            }
          }
        );
        try {
          const io = getIO();
          if (io) io.emit('cementUpdates', { action: 'dummyRowUpdated', id: cementRecord._id.toString() });
        } catch (_) {}
      }

      if (source === 'MONOJ_BANDHAN') {
        await OthersCreditor.updateOne({ _id: doc._id }, { $unset: { _cementSync: "" } });
      } else {
        await AccountDetail.updateOne({ _id: doc._id }, { $unset: { _cementSync: "" } });
      }

      return { success: true, reversedAmount: revAmount, isDummy: true };
    }

    // Real trip: update accumulated Bank TF and remaining contributions
    await col.updateOne(
      { _id: cementRecord._id },
      {
        $set: {
          "Bank TF": newBankTf,
          "BANK TF": newBankTf,
          "ADVANCE (BANK TF)": newBankTf,
          _freightAdvanceContributions: remainingContributions,
          _monojDebitContributions: remainingContributions
        }
      }
    );

    if (source === 'MONOJ_BANDHAN') {
      await OthersCreditor.updateOne({ _id: doc._id }, { $unset: { _cementSync: "" } });
    } else {
      await AccountDetail.updateOne({ _id: doc._id }, { $unset: { _cementSync: "" } });
    }

    try {
      const io = getIO();
      if (io) {
        io.emit('cementUpdates', { action: 'freightAdvanceReversed', recordId: cementRecord._id.toString(), bankTf: newBankTf });
      }
    } catch (_) {}

    return {
      success: true,
      reversedAmount: revAmount,
      cementRecordId: cementRecord._id.toString(),
      newBankTf
    };
  } catch (err) {
    console.error('[monojCementAdvanceManager] reverseFreightAdvanceContribution error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Universal applicator: Applies a Freight Advance transaction (from Manoj Bandhan OR Bank Book)
 * into CEMENT REGISTER -> ADVANCE BANK TF for the exact Owner + Vehicle + Same Date.
 */
async function applyFreightAdvanceToCement(doc, sourceOverride = null) {
  try {
    if (!doc || !doc._id) return { success: false, error: "No document provided" };

    const isManoj = isQualifyingManojFreightAdvance(doc);
    const isBankBook = isQualifyingBankBookFreightAdvance(doc);

    if (!isManoj && !isBankBook && !sourceOverride) {
      if (doc._cementSync && doc._cementSync.applied) {
        await reverseFreightAdvanceContribution(doc);
      }
      return { success: true, skipped: true, reason: "Not a qualifying Freight Advance transaction" };
    }

    const source = sourceOverride || (isManoj ? 'MONOJ_BANDHAN' : 'BANK_BOOK');
    const advanceAmount = num(doc.debit !== undefined ? doc.debit : (doc.withdraw !== undefined ? doc.withdraw : doc.amount));
    const vehicleNo = String(doc.vehicleNo || doc.vehicle || '').trim();
    const ownerName = String(doc.names || doc.party || '').trim();
    const rawDate = doc.date || doc.transactionDate || doc['Transaction Date'];
    const txIdStr = String(doc._id);

    // If amount <= 0 or missing vehicle/owner/date: reverse and skip
    if (advanceAmount <= 0 || !vehicleNo || !ownerName || !rawDate) {
      if (doc._cementSync && doc._cementSync.applied) {
        await reverseFreightAdvanceContribution(doc, source);
      }
      return { success: true, skipped: true, reason: "Zero amount or missing vehicle/owner/date" };
    }

    const col = getCementCollection();

    // Check if previously applied with exact same parameters
    const prevSync = doc._cementSync;
    if (prevSync && prevSync.applied) {
      const isSameVeh = String(prevSync.vehicleNo || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === vehicleNo.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const isSameOwner = String(prevSync.ownerName || '').trim().toLowerCase() === ownerName.trim().toLowerCase();
      const isSameAmt = num(prevSync.amount) === advanceAmount;
      const isSameDateVal = isSameCalendarDate(prevSync.date, rawDate);

      if (isSameVeh && isSameOwner && isSameAmt && isSameDateVal && prevSync.cementRecordId) {
        const curCement = await col.findOne({ _id: new ObjectId(prevSync.cementRecordId) });
        if (curCement) {
          const contribs = curCement._freightAdvanceContributions || curCement._monojDebitContributions || [];
          const hasContrib = contribs.some(c => String(c.txId) === txIdStr && num(c.amount) === advanceAmount);
          if (hasContrib) {
            return {
              success: true,
              alreadyApplied: true,
              cementRecordId: prevSync.cementRecordId,
              message: `₹${advanceAmount.toLocaleString('en-IN')} already accumulated in Advance Bank TF for ${ownerName} (${vehicleNo}) on ${rawDate}.`
            };
          }
        }
      }
      await reverseFreightAdvanceContribution(doc, source);
    }

    // 1. Search for SAME-DATE real Cement Register trip for OWNER + VEHICLE + EXACT DATE
    const targetRecord = await findSameDateCementRecord(vehicleNo, ownerName, rawDate);

    if (!targetRecord) {
      // CASE 2: No real trip exists -> find or create a same-date dummy row for this vehicle + owner
      const strippedVeh = vehicleNo.replace(/[^a-zA-Z0-9]/g, '');
      const vehRegex = new RegExp(strippedVeh.split('').join('[^a-zA-Z0-9]*'), 'i');

      const allDummyRows = await col.find({
        isDummy: true,
        "VEHICLE NUMBER": { $regex: vehRegex }
      }).toArray();

      const existingSameDateDummy = allDummyRows.find(d => {
        const dDate = d["LOADING DT"] || d["LOADING DATE"] || d["DATE"] || d.date;
        return isSameCalendarDate(dDate, rawDate);
      });

      let dummyRecordId = null;
      let totalDummyBankTf = advanceAmount;

      if (existingSameDateDummy) {
        const dummyContribs = Array.isArray(existingSameDateDummy._freightAdvanceContributions)
          ? existingSameDateDummy._freightAdvanceContributions
          : [];
        const existingIdx = dummyContribs.findIndex(c => String(c.txId) === txIdStr);
        let newContribs = [...dummyContribs];

        const newEntry = {
          txId: txIdStr,
          source,
          amount: advanceAmount,
          vehicleNo,
          ownerName,
          date: rawDate,
          ledgerName: 'FREIGHT ADVANCE',
          appliedAt: new Date()
        };

        if (existingIdx >= 0) {
          newContribs[existingIdx] = newEntry;
        } else {
          newContribs.push(newEntry);
        }

        totalDummyBankTf = Math.round(newContribs.reduce((sum, c) => sum + num(c.amount), 0) * 100) / 100;
        dummyRecordId = existingSameDateDummy._id.toString();

        await col.updateOne(
          { _id: existingSameDateDummy._id },
          {
            $set: {
              "Bank TF": totalDummyBankTf,
              "BANK TF": totalDummyBankTf,
              "ADVANCE (BANK TF)": totalDummyBankTf,
              _freightAdvanceContributions: newContribs,
              _monojDebitContributions: newContribs
            }
          }
        );
      } else {
        const syncRes = await syncDummyCementRow({
          sourceType: 'FREIGHT_ADVANCE',
          sourceTransactionId: txIdStr,
          vehicleNumber: vehicleNo,
          ownerName,
          date: rawDate,
          field: 'Bank TF',
          amount: advanceAmount
        });
        dummyRecordId = syncRes.recordId;

        if (dummyRecordId) {
          await col.updateOne(
            { _id: new ObjectId(dummyRecordId) },
            {
              $set: {
                _freightAdvanceContributions: [{
                  txId: txIdStr,
                  source,
                  amount: advanceAmount,
                  vehicleNo,
                  ownerName,
                  date: rawDate,
                  ledgerName: 'FREIGHT ADVANCE',
                  appliedAt: new Date()
                }]
              }
            }
          );
        }
      }

      const syncMeta = {
        applied: true,
        isDummy: true,
        source,
        cementRecordId: dummyRecordId || null,
        vehicleNo,
        ownerName,
        date: rawDate,
        amount: advanceAmount,
        appliedAt: new Date()
      };

      if (source === 'MONOJ_BANDHAN') {
        await OthersCreditor.updateOne({ _id: doc._id }, { $set: { _cementSync: syncMeta } });
      } else {
        await AccountDetail.updateOne({ _id: doc._id }, { $set: { _cementSync: syncMeta } });
      }

      try {
        const io = getIO();
        if (io) io.emit('cementUpdates', { action: 'freightAdvanceApplied', recordId: dummyRecordId, isDummy: true, bankTf: totalDummyBankTf });
      } catch (_) {}

      return {
        success: true,
        applied: true,
        isDummy: true,
        vehicleNo,
        ownerName,
        date: rawDate,
        amount: advanceAmount,
        cementRecordId: dummyRecordId,
        totalBankTf: totalDummyBankTf,
        message: `₹${advanceAmount.toLocaleString('en-IN')} accumulated in Same-Date Dummy Advance Bank TF for ${ownerName} (${vehicleNo}) on ${rawDate}.`
      };
    }

    // CASE 1: Real SAME-DATE trip exists -> Accumulate onto that real row
    await deleteDummyRowBySource('MONOJ_BANDHAN_FREIGHT_ADVANCE', txIdStr);
    await deleteDummyRowBySource('BANK_BOOK_FREIGHT_ADVANCE', txIdStr);
    await deleteDummyRowBySource('FREIGHT_ADVANCE', txIdStr);

    const existingContributions = Array.isArray(targetRecord._freightAdvanceContributions)
      ? targetRecord._freightAdvanceContributions
      : (Array.isArray(targetRecord._monojDebitContributions) ? targetRecord._monojDebitContributions : []);

    const existingIdx = existingContributions.findIndex(c => String(c.txId) === txIdStr);
    let newContributions = [...existingContributions];

    const newContrib = {
      txId: txIdStr,
      source,
      amount: advanceAmount,
      vehicleNo,
      ownerName,
      date: rawDate,
      ledgerName: 'FREIGHT ADVANCE',
      appliedAt: new Date()
    };

    if (existingIdx >= 0) {
      newContributions[existingIdx] = newContrib;
    } else {
      newContributions.push(newContrib);
    }

    // Exact accumulation: Sum of all contributions for this row
    const totalAccumulatedBankTf = Math.round(newContributions.reduce((sum, c) => sum + num(c.amount), 0) * 100) / 100;

    await col.updateOne(
      { _id: targetRecord._id },
      {
        $set: {
          "Bank TF": totalAccumulatedBankTf,
          "BANK TF": totalAccumulatedBankTf,
          "ADVANCE (BANK TF)": totalAccumulatedBankTf,
          _freightAdvanceContributions: newContributions,
          _monojDebitContributions: newContributions
        }
      }
    );

    const syncMeta = {
      applied: true,
      isDummy: false,
      source,
      cementRecordId: targetRecord._id.toString(),
      vehicleNo,
      ownerName,
      date: rawDate,
      amount: advanceAmount,
      appliedAt: new Date()
    };

    if (source === 'MONOJ_BANDHAN') {
      await OthersCreditor.updateOne({ _id: doc._id }, { $set: { _cementSync: syncMeta } });
    } else {
      await AccountDetail.updateOne({ _id: doc._id }, { $set: { _cementSync: syncMeta } });
    }

    try {
      const io = getIO();
      if (io) {
        io.emit('cementUpdates', { action: 'freightAdvanceApplied', recordId: targetRecord._id.toString(), bankTf: totalAccumulatedBankTf });
      }
    } catch (_) {}

    return {
      success: true,
      applied: true,
      isDummy: false,
      vehicleNo,
      ownerName,
      date: rawDate,
      amount: advanceAmount,
      cementRecordId: targetRecord._id.toString(),
      totalBankTf: totalAccumulatedBankTf,
      message: `₹${advanceAmount.toLocaleString('en-IN')} accumulated in Advance Bank TF for ${ownerName} (${vehicleNo}) on ${rawDate}. Total Bank TF: ₹${totalAccumulatedBankTf}`
    };
  } catch (err) {
    console.error('[monojCementAdvanceManager] applyFreightAdvanceToCement error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Syncs a batch of Others Creditor rows against Cement Register.
 */
async function syncFreightAdvancesBatch(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const results = [];
  for (const row of rows) {
    if (row && isQualifyingManojFreightAdvance(row)) {
      const res = await applyFreightAdvanceToCement(row, 'MONOJ_BANDHAN');
      results.push(res);
    }
  }
  return results;
}

/**
 * Syncs a batch of Bank Book rows against Cement Register.
 */
async function syncBankBookFreightAdvancesBatch(docs) {
  if (!Array.isArray(docs) || docs.length === 0) return [];
  const results = [];
  for (const doc of docs) {
    if (doc && isQualifyingBankBookFreightAdvance(doc)) {
      const res = await applyFreightAdvanceToCement(doc, 'BANK_BOOK');
      results.push(res);
    }
  }
  return results;
}

/**
 * Helper to fetch all accumulated Freight Advances (Manoj Bandhan + Bank Book) for a Vehicle and Date.
 */
async function getAccumulatedFreightAdvance(vehicleNo, ownerName, recordDate) {
  if (!vehicleNo || !recordDate) return { totalBankTf: 0, contributions: [] };

  const vehRegex = makeSpaceAgnosticRegex(vehicleNo);
  if (!vehRegex) return { totalBankTf: 0, contributions: [] };

  const [manojDocs, bankDocs] = await Promise.all([
    OthersCreditor.find({
      creditorName: { $in: ['MANOJ BANDHAN', 'MONOJ BANDHAN'] },
      vehicleNo: { $regex: vehRegex }
    }).lean().catch(() => []),
    AccountDetail.find({
      vehicle: { $regex: vehRegex }
    }).lean().catch(() => [])
  ]);

  const contributions = [];

  manojDocs.forEach(d => {
    if (isQualifyingManojFreightAdvance(d) && isSameCalendarDate(d.date, recordDate)) {
      const amt = num(d.debit !== undefined ? d.debit : d.amount);
      if (amt > 0) {
        contributions.push({
          txId: String(d._id),
          source: 'MONOJ_BANDHAN',
          amount: amt,
          vehicleNo,
          ownerName: d.names || ownerName,
          date: d.date,
          ledgerName: 'FREIGHT ADVANCE'
        });
      }
    }
  });

  bankDocs.forEach(d => {
    const rawD = d.transactionDate || d['Transaction Date'] || d.date;
    if (isQualifyingBankBookFreightAdvance(d) && isSameCalendarDate(rawD, recordDate)) {
      const amt = num(d.withdraw);
      if (amt > 0) {
        contributions.push({
          txId: String(d._id),
          source: 'BANK_BOOK',
          amount: amt,
          vehicleNo,
          ownerName: d.names || d.party || ownerName,
          date: rawD,
          ledgerName: 'FREIGHT ADVANCE'
        });
      }
    }
  });

  const totalBankTf = Math.round(contributions.reduce((sum, c) => sum + num(c.amount), 0) * 100) / 100;
  return { totalBankTf, contributions };
}

module.exports = {
  findSameDateCementRecord,
  findLatestCementRecordForPartyVehicle: findSameDateCementRecord,
  findLatestCementRecordForVehicle: findSameDateCementRecord,
  applyFreightAdvanceToCement,
  applyMonojDebitToCement: applyFreightAdvanceToCement,
  applyBankBookFreightAdvanceToCement: (doc) => applyFreightAdvanceToCement(doc, 'BANK_BOOK'),
  reverseFreightAdvanceContribution,
  reverseMonojDebitContribution: reverseFreightAdvanceContribution,
  reverseBankBookFreightAdvanceContribution: (doc) => reverseFreightAdvanceContribution(doc, 'BANK_BOOK'),
  syncFreightAdvancesBatch,
  syncMonojDebitsBatch: syncFreightAdvancesBatch,
  syncBankBookFreightAdvancesBatch,
  getAccumulatedFreightAdvance,
  isQualifyingFreightAdvance,
  isQualifyingManojFreightAdvance,
  isQualifyingBankBookFreightAdvance,
  isSameCalendarDate
};

