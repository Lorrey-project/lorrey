const mongoose = require("mongoose");
const { ObjectId } = require("mongodb");
const OthersCreditor = require("../models/OthersCreditor");
const { getIO } = require("../socket");
const { isDummyRow } = require("./dummyCementRowManager");

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

function escapeRegex(text) {
  if (!text) return '';
  return String(text).replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

/**
 * Check if an Others Creditor row qualifies for Freight Advance -> Cement Register sync.
 * Strictly limited to: OTHER CREDITOR -> MONOJ BANDHAN with LEDGER NAME = FREIGHT ADVANCE.
 */
function isQualifyingFreightAdvance(doc) {
  if (!doc) return false;
  const creditor = String(doc.creditorName || '').trim().toUpperCase();
  if (creditor !== 'MONOJ BANDHAN' && creditor !== 'MANOJ BANDHAN') return false;

  const ledger = String(doc.ledgerName || '').trim().toLowerCase();
  const isFreightLedger = !ledger || ledger === 'freight advance' || ledger === 'freight_advance' || ledger.replace(/\s+/g, '') === 'freightadvance';

  return isFreightLedger;
}

const { syncDummyCementRow, deleteDummyRowBySource } = require("./dummyCementRowManager");

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
 * Find the SAME-DATE real Cement Register trip/invoice record for the selected OWNER + VEHICLE + EXACT DATE.
 * Strictly excludes dummy rows.
 * Only returns a record if its business/loading date matches the exact transaction date.
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
 * Reverses a Freight Advance debit transaction's contribution from the Cement Register.
 */
async function reverseFreightAdvanceContribution(docOrId) {
  try {
    const col = getCementCollection();
    let doc = null;
    if (typeof docOrId === 'string' || docOrId instanceof ObjectId) {
      doc = await OthersCreditor.findById(docOrId).lean();
    } else {
      doc = docOrId;
    }

    if (!doc || !doc._id) return { success: false, notFound: true };
    const txIdStr = String(doc._id);

    // 1. Locate the cement record either by _cementSync.cementRecordId or by contribution txId
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

    // Also clean up any dummy row explicitly tied to this source transaction id
    await deleteDummyRowBySource('MONOJ_BANDHAN_FREIGHT_ADVANCE', txIdStr);

    if (!cementRecord) {
      return { success: true, notLinked: true };
    }

    const contributions = Array.isArray(cementRecord._freightAdvanceContributions)
      ? cementRecord._freightAdvanceContributions
      : (Array.isArray(cementRecord._monojDebitContributions) ? cementRecord._monojDebitContributions : []);

    const matchContrib = contributions.find(c => String(c.txId) === txIdStr);
    const revAmount = matchContrib ? num(matchContrib.amount) : (doc._cementSync ? num(doc._cementSync.amount) : 0);
    const remainingContributions = contributions.filter(c => String(c.txId) !== txIdStr);

    const currentBankTf = num(cementRecord["Bank TF"]);
    const newBankTf = Math.max(0, Math.round((currentBankTf - revAmount) * 100) / 100);

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

      await OthersCreditor.updateOne(
        { _id: doc._id },
        { $unset: { _cementSync: "" } }
      );

      return { success: true, reversedAmount: revAmount, isDummy: true };
    }

    const appliedTxIds = Array.isArray(cementRecord.appliedMonojDebitTxIds)
      ? cementRecord.appliedMonojDebitTxIds.filter(id => String(id) !== txIdStr)
      : [];

    await col.updateOne(
      { _id: cementRecord._id },
      {
        $set: {
          "Bank TF": newBankTf,
          "BANK TF": newBankTf,
          "ADVANCE (BANK TF)": newBankTf,
          _freightAdvanceContributions: remainingContributions,
          _monojDebitContributions: remainingContributions,
          appliedMonojDebitTxIds: appliedTxIds
        }
      }
    );

    // Update OthersCreditor doc to clear _cementSync
    await OthersCreditor.updateOne(
      { _id: doc._id },
      { $unset: { _cementSync: "" } }
    );

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
 * Applies a Freight Advance debit transaction from Others Creditor to the SAME-DATE Cement Register invoice or creates a SAME-DATE dummy row.
 */
async function applyFreightAdvanceToCement(doc) {
  try {
    if (!doc || !doc._id) return { success: false, error: "No document provided" };
    if (!isQualifyingFreightAdvance(doc)) {
      if (doc._cementSync && doc._cementSync.applied) {
        await reverseFreightAdvanceContribution(doc);
      }
      return { success: true, skipped: true, reason: "Not a qualifying Freight Advance transaction" };
    }

    const debitAmount = num(doc.debit !== undefined ? doc.debit : doc.amount);
    const vehicleNo = String(doc.vehicleNo || '').trim();
    const ownerName = String(doc.names || '').trim();
    const txIdStr = String(doc._id);

    // If debit <= 0 or vehicle is empty or owner is empty, reverse any existing contribution and return
    if (debitAmount <= 0 || !vehicleNo || !ownerName) {
      if (doc._cementSync && doc._cementSync.applied) {
        await reverseFreightAdvanceContribution(doc);
      }
      return { success: true, skipped: true, reason: "No positive debit or missing vehicle/owner" };
    }

    const col = getCementCollection();

    // Check if previously applied
    const prevSync = doc._cementSync;
    if (prevSync && prevSync.applied) {
      const isSameVeh = String(prevSync.vehicleNo || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === vehicleNo.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const isSameOwner = String(prevSync.ownerName || '').trim().toLowerCase() === ownerName.trim().toLowerCase();
      const isSameAmt = num(prevSync.amount) === debitAmount;
      const isSameDateVal = isSameCalendarDate(prevSync.date, doc.date);

      if (isSameVeh && isSameOwner && isSameAmt && isSameDateVal && prevSync.cementRecordId) {
        // Verify it already exists intact in that target cement record
        const curCement = await col.findOne({ _id: new ObjectId(prevSync.cementRecordId) });
        if (curCement) {
          const contribs = curCement._freightAdvanceContributions || curCement._monojDebitContributions || [];
          const hasContrib = contribs.some(c => String(c.txId) === txIdStr && num(c.amount) === debitAmount);
          if (hasContrib) {
            return {
              success: true,
              alreadyApplied: true,
              cementRecordId: prevSync.cementRecordId,
              message: `₹${debitAmount.toLocaleString('en-IN')} already applied to Advance Bank TF for ${ownerName} (${vehicleNo}) on ${doc.date}.`
            };
          }
        }
      }
      // If anything changed (amount, vehicle, owner, or date), reverse previous contribution first
      await reverseFreightAdvanceContribution(doc);
    }

    // 1. Search Cement Register for OWNER + VEHICLE + SAME DATE
    const targetRecord = await findSameDateCementRecord(vehicleNo, ownerName, doc.date);
    if (!targetRecord) {
      // CASE 2 / CASE 3: NO same-date real trip exists -> check if an existing dummy row exists for this vehicle on this SAME DATE
      const strippedVeh = vehicleNo.replace(/[^a-zA-Z0-9]/g, '');
      const vehRegex = new RegExp(strippedVeh.split('').join('[^a-zA-Z0-9]*'), 'i');

      const allDummyRows = await col.find({
        isDummy: true,
        sourceType: 'MONOJ_BANDHAN_FREIGHT_ADVANCE',
        "VEHICLE NUMBER": { $regex: vehRegex }
      }).toArray();

      const existingSameDateDummy = allDummyRows.find(d => {
        const rawDate = d["LOADING DT"] || d["LOADING DATE"] || d["DATE"] || d.date;
        return isSameCalendarDate(rawDate, doc.date);
      });

      let dummyRecordId = null;
      let totalDummyBankTf = debitAmount;

      if (existingSameDateDummy) {
        const dummyContribs = Array.isArray(existingSameDateDummy._freightAdvanceContributions) ? existingSameDateDummy._freightAdvanceContributions : [];
        const existingIdx = dummyContribs.findIndex(c => String(c.txId) === txIdStr);
        let newContribs = [...dummyContribs];
        let curBank = num(existingSameDateDummy["Bank TF"]);

        if (existingIdx >= 0) {
          const prevAmt = num(dummyContribs[existingIdx].amount);
          curBank = Math.max(0, curBank - prevAmt + debitAmount);
          newContribs[existingIdx] = {
            txId: txIdStr,
            amount: debitAmount,
            vehicleNo,
            ownerName,
            date: doc.date || '',
            creditorName: doc.creditorName || '',
            ledgerName: doc.ledgerName || '',
            appliedAt: new Date()
          };
        } else {
          curBank = curBank + debitAmount;
          newContribs.push({
            txId: txIdStr,
            amount: debitAmount,
            vehicleNo,
            ownerName,
            date: doc.date || '',
            creditorName: doc.creditorName || '',
            ledgerName: doc.ledgerName || '',
            appliedAt: new Date()
          });
        }

        totalDummyBankTf = Math.round(curBank * 100) / 100;
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
          sourceType: 'MONOJ_BANDHAN_FREIGHT_ADVANCE',
          sourceTransactionId: txIdStr,
          vehicleNumber: vehicleNo,
          ownerName,
          date: doc.date,
          field: 'Bank TF',
          amount: debitAmount
        });
        dummyRecordId = syncRes.recordId;

        if (dummyRecordId) {
          await col.updateOne(
            { _id: new ObjectId(dummyRecordId) },
            {
              $set: {
                _freightAdvanceContributions: [{
                  txId: txIdStr,
                  amount: debitAmount,
                  vehicleNo,
                  ownerName,
                  date: doc.date || '',
                  creditorName: doc.creditorName || '',
                  ledgerName: doc.ledgerName || '',
                  appliedAt: new Date()
                }]
              }
            }
          );
        }
      }

      await OthersCreditor.updateOne(
        { _id: doc._id },
        {
          $set: {
            _cementSync: {
              applied: true,
              isDummy: true,
              cementRecordId: dummyRecordId || null,
              vehicleNo,
              ownerName,
              date: doc.date,
              amount: debitAmount,
              appliedAt: new Date()
            }
          }
        }
      );

      return {
        success: true,
        applied: true,
        isDummy: true,
        vehicleNo,
        ownerName,
        date: doc.date,
        amount: debitAmount,
        cementRecordId: dummyRecordId,
        totalBankTf: totalDummyBankTf,
        message: `₹${debitAmount.toLocaleString('en-IN')} added to Same-Date Dummy Advance Bank TF for ${ownerName} (${vehicleNo}) on ${doc.date}.`
      };
    }

    // CASE 1: Real SAME-DATE trip exists -> Apply to that same-date row
    await deleteDummyRowBySource('MONOJ_BANDHAN_FREIGHT_ADVANCE', txIdStr);

    const existingContributions = Array.isArray(targetRecord._freightAdvanceContributions)
      ? targetRecord._freightAdvanceContributions
      : (Array.isArray(targetRecord._monojDebitContributions) ? targetRecord._monojDebitContributions : []);

    const existingIdx = existingContributions.findIndex(c => String(c.txId) === txIdStr);

    let currentBankTf = num(targetRecord["Bank TF"]);
    let newContributions = [...existingContributions];

    if (existingIdx >= 0) {
      const prevAmt = num(existingContributions[existingIdx].amount);
      currentBankTf = Math.max(0, currentBankTf - prevAmt + debitAmount);
      newContributions[existingIdx] = {
        txId: txIdStr,
        amount: debitAmount,
        vehicleNo,
        ownerName,
        date: doc.date || '',
        creditorName: doc.creditorName || '',
        ledgerName: doc.ledgerName || '',
        appliedAt: new Date()
      };
    } else {
      currentBankTf = currentBankTf + debitAmount;
      newContributions.push({
        txId: txIdStr,
        amount: debitAmount,
        vehicleNo,
        ownerName,
        date: doc.date || '',
        creditorName: doc.creditorName || '',
        ledgerName: doc.ledgerName || '',
        appliedAt: new Date()
      });
    }

    currentBankTf = Math.round(currentBankTf * 100) / 100;

    const appliedTxIds = Array.isArray(targetRecord.appliedMonojDebitTxIds) ? [...targetRecord.appliedMonojDebitTxIds] : [];
    if (!appliedTxIds.includes(txIdStr)) {
      appliedTxIds.push(txIdStr);
    }

    await col.updateOne(
      { _id: targetRecord._id },
      {
        $set: {
          "Bank TF": currentBankTf,
          "BANK TF": currentBankTf,
          "ADVANCE (BANK TF)": currentBankTf,
          _freightAdvanceContributions: newContributions,
          _monojDebitContributions: newContributions,
          appliedMonojDebitTxIds: appliedTxIds
        }
      }
    );

    // Update OthersCreditor document linkage
    await OthersCreditor.updateOne(
      { _id: doc._id },
      {
        $set: {
          _cementSync: {
            applied: true,
            isDummy: false,
            cementRecordId: targetRecord._id.toString(),
            vehicleNo,
            ownerName,
            date: doc.date,
            amount: debitAmount,
            appliedAt: new Date()
          }
        }
      }
    );

    try {
      const io = getIO();
      if (io) {
        io.emit('cementUpdates', { action: 'freightAdvanceApplied', recordId: targetRecord._id.toString(), bankTf: currentBankTf });
      }
    } catch (_) {}

    return {
      success: true,
      applied: true,
      isDummy: false,
      vehicleNo,
      ownerName,
      date: doc.date,
      amount: debitAmount,
      cementRecordId: targetRecord._id.toString(),
      totalBankTf: currentBankTf,
      message: `₹${debitAmount.toLocaleString('en-IN')} added to Same-Date Advance Bank TF for ${ownerName} (${vehicleNo}) on ${doc.date}.`
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
    if (row && isQualifyingFreightAdvance(row)) {
      const res = await applyFreightAdvanceToCement(row);
      results.push(res);
    }
  }
  return results;
}

module.exports = {
  findSameDateCementRecord,
  findLatestCementRecordForPartyVehicle: findSameDateCementRecord,
  findLatestCementRecordForVehicle: findSameDateCementRecord,
  applyFreightAdvanceToCement,
  applyMonojDebitToCement: applyFreightAdvanceToCement,
  reverseFreightAdvanceContribution,
  reverseMonojDebitContribution: reverseFreightAdvanceContribution,
  syncFreightAdvancesBatch,
  syncMonojDebitsBatch: syncFreightAdvancesBatch,
  isQualifyingFreightAdvance,
  isSameCalendarDate
};

