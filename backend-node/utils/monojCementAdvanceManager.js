const mongoose = require("mongoose");
const { ObjectId } = require("mongodb");
const OthersCreditor = require("../models/OthersCreditor");
const { getIO } = require("../socket");

function getCementCollection() {
  return mongoose.connection.useDb("cement_register").collection("entries");
}

const parseToDate = (dStr) => {
  if (!dStr) return new Date(0);
  if (dStr instanceof Date && !isNaN(dStr.getTime())) return dStr;
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
  const d = new Date(dStr);
  if (!isNaN(d.getTime())) return d;
  return new Date(0);
};

const num = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};

/**
 * Find the selected vehicle's LAST / most recent existing authoritative Cement Register invoice/trip record.
 * Sorts chronologically descending by authoritative trip/invoice date, with MongoDB ObjectId as deterministic tie-breaker.
 */
async function findLatestCementRecordForVehicle(vehicleNumber, ownerName = "") {
  if (!vehicleNumber) return null;
  const col = getCementCollection();

  const stripped = String(vehicleNumber).replace(/[^a-zA-Z0-9]/g, '');
  if (!stripped) return null;
  const regexStr = stripped.split('').join('[^a-zA-Z0-9]*');
  const vehFilter = {
    $regex: new RegExp(`^[^a-zA-Z0-9]*${regexStr}[^a-zA-Z0-9]*$`, 'i')
  };

  const query = { "VEHICLE NUMBER": vehFilter };

  const entries = await col.find(query).toArray();
  if (!entries || entries.length === 0) return null;

  // Sort chronologically descending (latest date first)
  entries.sort((a, b) => {
    const dateA = parseToDate(
      a["LOADING DT"] || a["LOADING DATE"] || a["BILL DATE"] || a["INVOICE DATE"] || a["RECEIVING DATE"] || a["UNLOADING STATUS"]
    );
    const dateB = parseToDate(
      b["LOADING DT"] || b["LOADING DATE"] || b["BILL DATE"] || b["INVOICE DATE"] || b["RECEIVING DATE"] || b["UNLOADING STATUS"]
    );
    const timeDiff = dateB.getTime() - dateA.getTime();
    if (timeDiff !== 0) return timeDiff;

    // Tie-breaker: MongoDB ObjectId timestamp (most recently created)
    const idTimeA = a._id ? a._id.getTimestamp().getTime() : 0;
    const idTimeB = b._id ? b._id.getTimestamp().getTime() : 0;
    return idTimeB - idTimeA;
  });

  return entries[0];
}

/**
 * Reverses a Monoj Bandhan debit transaction's contribution from the Cement Register.
 */
async function reverseMonojDebitContribution(monojDocOrId) {
  try {
    const col = getCementCollection();
    let doc = null;
    if (typeof monojDocOrId === 'string' || monojDocOrId instanceof ObjectId) {
      doc = await OthersCreditor.findById(monojDocOrId).lean();
    } else {
      doc = monojDocOrId;
    }

    if (!doc || !doc._id) return { success: false, notFound: true };
    const txIdStr = String(doc._id);

    // 1. Locate the cement record either by _cementSync.cementRecordId or by _monojDebitContributions.txId
    let cementRecord = null;
    if (doc._cementSync && doc._cementSync.cementRecordId) {
      try {
        cementRecord = await col.findOne({ _id: new ObjectId(doc._cementSync.cementRecordId) });
      } catch (_) {}
    }
    if (!cementRecord) {
      cementRecord = await col.findOne({ "_monojDebitContributions.txId": txIdStr });
    }

    if (!cementRecord) {
      return { success: true, notLinked: true };
    }

    const contributions = Array.isArray(cementRecord._monojDebitContributions) ? cementRecord._monojDebitContributions : [];
    const matchContrib = contributions.find(c => String(c.txId) === txIdStr);
    const revAmount = matchContrib ? num(matchContrib.amount) : (doc._cementSync ? num(doc._cementSync.amount) : 0);

    const remainingContributions = contributions.filter(c => String(c.txId) !== txIdStr);
    const appliedTxIds = Array.isArray(cementRecord.appliedMonojDebitTxIds)
      ? cementRecord.appliedMonojDebitTxIds.filter(id => String(id) !== txIdStr)
      : [];

    const currentBankTf = num(cementRecord["Bank TF"]);
    const newBankTf = Math.max(0, Math.round((currentBankTf - revAmount) * 100) / 100);

    await col.updateOne(
      { _id: cementRecord._id },
      {
        $set: {
          "Bank TF": newBankTf,
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
        io.emit('cementUpdates', { action: 'monojDebitReversed', recordId: cementRecord._id.toString() });
      }
    } catch (_) {}

    return {
      success: true,
      reversedAmount: revAmount,
      cementRecordId: cementRecord._id.toString(),
      newBankTf
    };
  } catch (err) {
    console.error('[monojCementAdvanceManager] reverseMonojDebitContribution error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Applies a Monoj Bandhan debit transaction to the latest authoritative Cement Register invoice.
 */
async function applyMonojDebitToCement(monojDoc) {
  try {
    if (!monojDoc || !monojDoc._id) return { success: false, error: "No document provided" };
    if (monojDoc.creditorName !== 'MONOJ BANDHAN') {
      return { success: true, skipped: true, reason: "Not MONOJ BANDHAN" };
    }

    const debitAmount = num(monojDoc.debit);
    const vehicleNo = String(monojDoc.vehicleNo || '').trim();
    const ownerName = String(monojDoc.names || '').trim();
    const txIdStr = String(monojDoc._id);

    // If debit <= 0 or vehicle is empty, reverse any existing contribution and return
    if (debitAmount <= 0 || !vehicleNo) {
      if (monojDoc._cementSync && monojDoc._cementSync.applied) {
        await reverseMonojDebitContribution(monojDoc);
      }
      return { success: true, skipped: true, reason: "No positive debit or vehicle number" };
    }

    const col = getCementCollection();

    // Check if previously applied to a different vehicle or amount or record
    const prevSync = monojDoc._cementSync;
    if (prevSync && prevSync.applied) {
      const isSameVeh = String(prevSync.vehicleNo || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === vehicleNo.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const isSameAmt = num(prevSync.amount) === debitAmount;
      if (isSameVeh && isSameAmt && prevSync.cementRecordId) {
        // Verify it already exists intact in that cement record
        const curCement = await col.findOne({ _id: new ObjectId(prevSync.cementRecordId) });
        if (curCement) {
          const hasContrib = (curCement._monojDebitContributions || []).some(c => String(c.txId) === txIdStr && num(c.amount) === debitAmount);
          if (hasContrib) {
            return {
              success: true,
              alreadyApplied: true,
              cementRecordId: prevSync.cementRecordId,
              message: `₹${debitAmount.toLocaleString('en-IN')} already applied to Advance Bank TF for vehicle ${vehicleNo}.`
            };
          }
        }
      }
      // If anything changed, reverse previous contribution first
      await reverseMonojDebitContribution(monojDoc);
    }

    // Find the latest authoritative Cement Register invoice for the selected vehicle
    const targetRecord = await findLatestCementRecordForVehicle(vehicleNo, ownerName);
    if (!targetRecord) {
      return {
        success: false,
        notFound: true,
        vehicleNo,
        message: `Debit saved, but no Cement Register invoice was found for ${vehicleNo}. Advance Bank TF was not updated.`
      };
    }

    const existingContributions = Array.isArray(targetRecord._monojDebitContributions) ? targetRecord._monojDebitContributions : [];
    const existingIdx = existingContributions.findIndex(c => String(c.txId) === txIdStr);

    let currentBankTf = num(targetRecord["Bank TF"]);
    let newContributions = [...existingContributions];

    if (existingIdx >= 0) {
      const prevAmt = num(existingContributions[existingIdx].amount);
      currentBankTf = currentBankTf - prevAmt + debitAmount;
      newContributions[existingIdx] = {
        txId: txIdStr,
        amount: debitAmount,
        vehicleNo,
        ownerName,
        date: monojDoc.date || '',
        appliedAt: new Date()
      };
    } else {
      currentBankTf = currentBankTf + debitAmount;
      newContributions.push({
        txId: txIdStr,
        amount: debitAmount,
        vehicleNo,
        ownerName,
        date: monojDoc.date || '',
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
          _monojDebitContributions: newContributions,
          appliedMonojDebitTxIds: appliedTxIds
        }
      }
    );

    // Update OthersCreditor document linkage
    await OthersCreditor.updateOne(
      { _id: monojDoc._id },
      {
        $set: {
          _cementSync: {
            applied: true,
            cementRecordId: targetRecord._id.toString(),
            vehicleNo,
            ownerName,
            amount: debitAmount,
            appliedAt: new Date()
          }
        }
      }
    );

    try {
      const io = getIO();
      if (io) {
        io.emit('cementUpdates', { action: 'monojDebitApplied', recordId: targetRecord._id.toString() });
      }
    } catch (_) {}

    return {
      success: true,
      applied: true,
      vehicleNo,
      amount: debitAmount,
      cementRecordId: targetRecord._id.toString(),
      totalBankTf: currentBankTf,
      message: `₹${debitAmount.toLocaleString('en-IN')} added to Advance Bank TF for vehicle ${vehicleNo}.`
    };
  } catch (err) {
    console.error('[monojCementAdvanceManager] applyMonojDebitToCement error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Syncs a batch of Monoj Bandhan rows against Cement Register.
 */
async function syncMonojDebitsBatch(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const results = [];
  for (const row of rows) {
    if (row && row.creditorName === 'MONOJ BANDHAN') {
      const res = await applyMonojDebitToCement(row);
      results.push(res);
    }
  }
  return results;
}

module.exports = {
  findLatestCementRecordForVehicle,
  applyMonojDebitToCement,
  reverseMonojDebitContribution,
  syncMonojDebitsBatch
};
