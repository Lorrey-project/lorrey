const mongoose = require("mongoose");
const { ObjectId } = require("mongodb");
const Voucher = require("../models/Voucher");
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

/**
 * Find the selected vehicle's LAST / most recent existing Cement Register invoice/trip record.
 * Sorts by trip/invoice date descending, with MongoDB ObjectId / createdAt as tie-breaker.
 */
async function findLatestCementRecord(vehicleNumber, ownerName = "") {
  if (!vehicleNumber) return null;
  const col = getCementCollection();

  const stripped = String(vehicleNumber).replace(/[^a-zA-Z0-9]/g, '');
  if (!stripped) return null;
  const regexStr = stripped.split('').join('[^a-zA-Z0-9]*');
  const vehFilter = {
    $regex: new RegExp(`^[^a-zA-Z0-9]*${regexStr}[^a-zA-Z0-9]*$`, 'i')
  };

  const query = {
    "VEHICLE NUMBER": vehFilter
  };

  const allEntries = await col.find(query).toArray();
  if (!allEntries || allEntries.length === 0) return null;

  const entries = allEntries.filter(e => !isDummyRow(e));
  if (!entries || entries.length === 0) return null;

  let matchedEntries = entries;
  if (ownerName) {
    const cleanOwner = String(ownerName).trim().toLowerCase();
    const ownerMatches = entries.filter(e => {
      const rowOwner = String(e["OWNER NAME"] || e["PARTY NAME"] || e["OWNER"] || "").trim().toLowerCase();
      return rowOwner && (rowOwner.includes(cleanOwner) || cleanOwner.includes(rowOwner));
    });
    if (ownerMatches.length > 0) {
      matchedEntries = ownerMatches;
    }
  }

  // Sort chronologically descending (latest date first)
  matchedEntries.sort((a, b) => {
    const dateA = parseToDate(
      a["LOADING DT"] || a["LOADING DATE"] || a["BILL DATE"] || a["INVOICE DATE"] || a["RECEIVING DATE"] || a["UNLOADING STATUS"]
    );
    const dateB = parseToDate(
      b["LOADING DT"] || b["LOADING DATE"] || b["BILL DATE"] || b["INVOICE DATE"] || b["RECEIVING DATE"] || b["UNLOADING STATUS"]
    );
    const timeDiff = dateB.getTime() - dateA.getTime();
    if (timeDiff !== 0) return timeDiff;

    // Tie-breaker: MongoDB ObjectId timestamp (most recently inserted/updated)
    const idTimeA = a._id ? a._id.getTimestamp().getTime() : 0;
    const idTimeB = b._id ? b._id.getTimestamp().getTime() : 0;
    return idTimeB - idTimeA;
  });

  return matchedEntries[0];
}

/**
 * Check if the voucher expense type qualifies for Cement Register advance update.
 * Only DIRECT or INDIRECT expenses qualify.
 */
function isQualifyingExpenseType(expenseType) {
  const norm = String(expenseType || '').trim().toUpperCase();
  return norm.includes('DIRECT') || norm.includes('INDIRECT');
}

/**
 * Determine whether the panel is SITE or OFFICE.
 */
function determinePanel(panelSource, createdByRole) {
  const source = String(panelSource || createdByRole || 'OFFICE').toUpperCase();
  if (source.includes('SITE')) return 'SITE';
  return 'OFFICE';
}

const { syncDummyCementRow, deleteDummyRowBySource } = require("./dummyCementRowManager");

/**
 * Apply a voucher to the selected vehicle's latest Cement Register invoice or create a dummy row.
 */
async function applyVoucherToCement(voucherDoc, panelSource = null) {
  try {
    if (!voucherDoc) return { success: false, error: "No voucher provided" };

    if (!isQualifyingExpenseType(voucherDoc.expenseType)) {
      return { success: true, skipped: true, reason: "Expense type not Direct/Indirect" };
    }

    if (!voucherDoc.vehicleNumber) {
      return { success: true, skipped: true, reason: "No vehicle number on voucher" };
    }

    const amount = parseFloat(voucherDoc.amount);
    if (!amount || isNaN(amount) || amount <= 0) {
      return { success: true, skipped: true, reason: "Invalid or zero voucher amount" };
    }

    const panel = determinePanel(panelSource, voucherDoc.createdByRole);
    const isSite = panel === 'SITE';
    const targetField = isSite ? "Site Cash" : "OFFICE CASH";
    const proofField = isSite ? "SITE_CASH_PROOF_URL" : "OFFICE_CASH_PROOF_URL";
    const sourceType = isSite ? 'SITE_VOUCHER' : 'OFFICE_VOUCHER';

    const voucherIdStr = voucherDoc._id.toString();

    // Prevent duplicate application
    if (voucherDoc.appliedToCementId && voucherDoc.appliedAmount === amount && voucherDoc.appliedField === targetField) {
      return { success: true, alreadyApplied: true, recordId: voucherDoc.appliedToCementId };
    }

    const targetRecord = await findLatestCementRecord(voucherDoc.vehicleNumber, voucherDoc.name);
    if (!targetRecord) {
      // Vehicle has NO existing real Cement Register invoice/trip record: CREATE ONE DUMMY CEMENT REGISTER ROW
      const syncRes = await syncDummyCementRow({
        sourceType,
        sourceTransactionId: voucherIdStr,
        vehicleNumber: voucherDoc.vehicleNumber,
        ownerName: voucherDoc.name || '',
        date: voucherDoc.date,
        field: targetField,
        amount,
        proofUrl: voucherDoc.slip_url || ''
      });

      await Voucher.updateOne({ _id: voucherDoc._id }, {
        $set: {
          appliedToCementId: syncRes.recordId || null,
          appliedField: targetField,
          appliedAmount: amount,
          appliedPanel: panel,
          appliedAt: new Date()
        }
      });

      return {
        success: true,
        isDummy: true,
        linkedRecordId: syncRes.recordId,
        panel,
        field: targetField,
        amount,
        totalFieldAmount: amount
      };
    }

    // If a real trip exists, clean up any previous dummy row for this voucher
    await deleteDummyRowBySource(sourceType, voucherIdStr);

    const col = getCementCollection();

    // Check if this voucher contribution is already in the target record's contributions
    const existingContributions = Array.isArray(targetRecord._voucherContributions) ? targetRecord._voucherContributions : [];
    const existingIdx = existingContributions.findIndex(c => c.voucherId === voucherIdStr);

    let currentFieldValue = parseFloat(String(targetRecord[targetField] || 0).replace(/,/g, '')) || 0;

    let newContributions = [...existingContributions];
    if (existingIdx >= 0) {
      // Already present in contributions, update amount difference if any
      const prevAmt = parseFloat(existingContributions[existingIdx].amount) || 0;
      currentFieldValue = currentFieldValue - prevAmt + amount;
      newContributions[existingIdx] = {
        voucherId: voucherIdStr,
        voucherNumber: voucherDoc.voucherNumber,
        amount,
        panel,
        field: targetField,
        appliedAt: new Date(),
        slip_url: voucherDoc.slip_url || ''
      };
    } else {
      currentFieldValue = currentFieldValue + amount;
      newContributions.push({
        voucherId: voucherIdStr,
        voucherNumber: voucherDoc.voucherNumber,
        amount,
        panel,
        field: targetField,
        appliedAt: new Date(),
        slip_url: voucherDoc.slip_url || ''
      });
    }

    const updateDoc = {
      [targetField]: currentFieldValue,
      _voucherContributions: newContributions,
    };

    // Keep aliases synchronized
    if (isSite) {
      updateDoc["Site Cash"] = currentFieldValue;
      updateDoc["SITE CASH"] = currentFieldValue;
      updateDoc["SITE CASH ADVANCE"] = currentFieldValue;
    } else {
      updateDoc["OFFICE CASH"] = currentFieldValue;
      updateDoc["OFFICE CASH ADVANCE"] = currentFieldValue;
      updateDoc["Office Cash"] = currentFieldValue;
    }

    if (voucherDoc.slip_url) {
      updateDoc[proofField] = voucherDoc.slip_url;
    }

    await col.updateOne({ _id: targetRecord._id }, { $set: updateDoc });

    // Update Voucher tracking metadata
    await Voucher.updateOne({ _id: voucherDoc._id }, {
      $set: {
        appliedToCementId: targetRecord._id.toString(),
        appliedField: targetField,
        appliedAmount: amount,
        appliedPanel: panel,
        appliedAt: new Date()
      }
    });

    try {
      const io = getIO();
      if (io) {
        io.emit('cementUpdates', { action: 'voucherAdvanceApplied', recordId: targetRecord._id.toString() });
      }
    } catch (_) {}

    return {
      success: true,
      linkedRecordId: targetRecord._id.toString(),
      panel,
      field: targetField,
      amount,
      totalFieldAmount: currentFieldValue
    };
  } catch (err) {
    console.error("[voucherCementAdvanceManager] applyVoucherToCement error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Reverse a voucher's contribution from the Cement Register.
 */
async function reverseVoucherFromCement(voucherDoc) {
  try {
    if (!voucherDoc || !voucherDoc._id) return { success: false };
    const voucherIdStr = voucherDoc._id.toString();
    const col = getCementCollection();

    let targetRecord = null;
    if (voucherDoc.appliedToCementId) {
      try {
        targetRecord = await col.findOne({ _id: new ObjectId(voucherDoc.appliedToCementId) });
      } catch (_) {}
    }

    if (!targetRecord) {
      targetRecord = await col.findOne({
        $or: [
          { "_voucherContributions.voucherId": voucherIdStr },
          { sourceTransactionId: voucherIdStr }
        ]
      });
    }

    // Also delete any dummy row linked to this voucher
    await deleteDummyRowBySource('OFFICE_VOUCHER', voucherIdStr);
    await deleteDummyRowBySource('SITE_VOUCHER', voucherIdStr);

    if (!targetRecord) return { success: true, notLinked: true };

    // If targetRecord is a dummy row, delete it directly
    if (targetRecord.isDummy === true || targetRecord._isDummy === true) {
      await col.deleteOne({ _id: targetRecord._id });
      await Voucher.updateOne({ _id: voucherDoc._id }, {
        $set: {
          appliedToCementId: null,
          appliedField: null,
          appliedAmount: 0,
          appliedPanel: null,
          appliedAt: null
        }
      });
      try {
        const io = getIO();
        if (io) io.emit('cementUpdates', { action: 'dummyRowDeleted', id: targetRecord._id.toString() });
      } catch (_) {}
      return { success: true, reversedAmount: voucherDoc.appliedAmount || voucherDoc.amount, isDummy: true };
    }

    const contributions = Array.isArray(targetRecord._voucherContributions) ? targetRecord._voucherContributions : [];
    const matchContrib = contributions.find(c => c.voucherId === voucherIdStr);
    const revAmount = matchContrib ? (parseFloat(matchContrib.amount) || 0) : (parseFloat(voucherDoc.appliedAmount || voucherDoc.amount) || 0);
    const targetField = (matchContrib && matchContrib.field) || voucherDoc.appliedField || (voucherDoc.appliedPanel === 'SITE' ? 'Site Cash' : 'OFFICE CASH');

    const remainingContributions = contributions.filter(c => c.voucherId !== voucherIdStr);

    const currentVal = parseFloat(String(targetRecord[targetField] || 0).replace(/,/g, '')) || 0;
    const newVal = Math.max(0, currentVal - revAmount);

    const updateDoc = {
      [targetField]: newVal,
      _voucherContributions: remainingContributions
    };
    if (targetField === 'Site Cash' || targetField === 'SITE CASH' || targetField === 'SITE CASH ADVANCE') {
      updateDoc["Site Cash"] = newVal;
      updateDoc["SITE CASH"] = newVal;
      updateDoc["SITE CASH ADVANCE"] = newVal;
    } else {
      updateDoc["OFFICE CASH"] = newVal;
      updateDoc["OFFICE CASH ADVANCE"] = newVal;
      updateDoc["Office Cash"] = newVal;
    }

    await col.updateOne({ _id: targetRecord._id }, { $set: updateDoc });

    await Voucher.updateOne({ _id: voucherDoc._id }, {
      $set: {
        appliedToCementId: null,
        appliedField: null,
        appliedAmount: 0,
        appliedPanel: null,
        appliedAt: null
      }
    });

    try {
      const io = getIO();
      if (io) {
        io.emit('cementUpdates', { action: 'voucherAdvanceReversed', recordId: targetRecord._id.toString() });
      }
    } catch (_) {}

    return { success: true, reversedAmount: revAmount };
  } catch (err) {
    console.error("[voucherCementAdvanceManager] reverseVoucherFromCement error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Update voucher synchronization on edit.
 */
async function syncVoucherOnUpdate(oldVoucher, updatedVoucher, panelSource = null) {
  try {
    if (oldVoucher) {
      await reverseVoucherFromCement(oldVoucher);
    }
    return await applyVoucherToCement(updatedVoucher, panelSource);
  } catch (err) {
    console.error("[voucherCementAdvanceManager] syncVoucherOnUpdate error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Update the proof URL in the linked Cement Register record when a voucher slip is uploaded.
 */
async function syncVoucherSlip(voucherId, slipUrl) {
  try {
    if (!voucherId || !slipUrl) return;
    const voucher = await Voucher.findById(voucherId).lean();
    if (!voucher || !voucher.appliedToCementId) return;

    const col = getCementCollection();
    const isSite = (voucher.appliedPanel || voucher.createdByRole || '').toUpperCase().includes('SITE');
    const proofField = isSite ? "SITE_CASH_PROOF_URL" : "OFFICE_CASH_PROOF_URL";

    await col.updateOne(
      { _id: new ObjectId(voucher.appliedToCementId) },
      { $set: { [proofField]: slipUrl } }
    );
  } catch (err) {
    console.error("[voucherCementAdvanceManager] syncVoucherSlip error:", err);
  }
}

module.exports = {
  findLatestCementRecord,
  applyVoucherToCement,
  reverseVoucherFromCement,
  syncVoucherOnUpdate,
  syncVoucherSlip,
  isQualifyingExpenseType,
  determinePanel
};
