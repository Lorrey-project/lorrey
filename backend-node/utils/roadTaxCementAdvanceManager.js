const mongoose = require("mongoose");
const { ObjectId } = require("mongodb");
const { getIO } = require("../socket");
const { syncDummyCementRow, deleteDummyRowBySource, isDummyRow } = require("./dummyCementRowManager");

function getCementCollection() {
  return mongoose.connection.useDb("cement_register").collection("entries");
}

function getRoadTaxCollection() {
  return mongoose.connection.useDb("invoice_system").collection("road_tax_register");
}

function getOwnerCollection() {
  return mongoose.connection.useDb("invoice_system").collection("owner details");
}

function getTruckCollection() {
  return mongoose.connection.useDb("invoice_system").collection("Truck Contact Number");
}

/**
 * Timezone-safe calendar date extractor.
 * Returns { day, month, year } without any UTC/time boundary shifts.
 */
function extractDateComponents(dInput) {
  if (!dInput) return null;
  if (dInput instanceof Date && !isNaN(dInput.getTime())) {
    return {
      day: dInput.getDate(),
      month: dInput.getMonth() + 1,
      year: dInput.getFullYear()
    };
  }
  const str = String(dInput).trim();
  if (!str || str === '-' || str.toUpperCase() === 'N/A' || str.toUpperCase() === 'NA') return null;

  // 1. YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
  let m = str.match(/^(\d{4})[-\/\.](\d{1,2})[-\/\.](\d{1,2})/);
  if (m) {
    return {
      year: parseInt(m[1], 10),
      month: parseInt(m[2], 10),
      day: parseInt(m[3], 10)
    };
  }

  // 2. DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
  m = str.match(/^(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{2,4})/);
  if (m) {
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    return {
      day: parseInt(m[1], 10),
      month: parseInt(m[2], 10),
      year: y
    };
  }

  // Fallback: Date parser
  const dObj = new Date(str);
  if (!isNaN(dObj.getTime())) {
    return {
      day: dObj.getDate(),
      month: dObj.getMonth() + 1,
      year: dObj.getFullYear()
    };
  }
  return null;
}

function formatDateDDMMYYYY(dInput) {
  const c = extractDateComponents(dInput);
  if (!c) return '';
  return `${String(c.day).padStart(2, '0')}-${String(c.month).padStart(2, '0')}-${c.year}`;
}

function formatDateDDMMYYDot(dInput) {
  const c = extractDateComponents(dInput);
  if (!c) return '';
  return `${String(c.day).padStart(2, '0')}.${String(c.month).padStart(2, '0')}.${c.year}`;
}

function isSameCalendarDate(d1, d2) {
  const c1 = extractDateComponents(d1);
  const c2 = extractDateComponents(d2);
  if (!c1 || !c2) return false;
  return c1.day === c2.day && c1.month === c2.month && c1.year === c2.year;
}

function num(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

function makeSpaceAgnosticRegex(str) {
  if (!str) return null;
  const stripped = String(str).replace(/[^a-zA-Z0-9]/g, '');
  if (!stripped) return null;
  const regexStr = stripped.split('').join('[^a-zA-Z0-9]*');
  return new RegExp(`^[^a-zA-Z0-9]*${regexStr}[^a-zA-Z0-9]*$`, 'i');
}

function matchOwnerNames(o1, o2) {
  if (!o1 || !o2) return false;
  const s1 = String(o1).toLowerCase().replace(/[^a-z0-9]/g, '');
  const s2 = String(o2).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!s1 || !s2) return false;
  return s1 === s2 || s1.includes(s2) || s2.includes(s1);
}

/**
 * Resolves owner name from invoice_system collections if missing from the source record.
 */
async function resolveOwnerName(truckNo, recordId = null, passedOwner = '') {
  if (passedOwner && String(passedOwner).trim()) {
    return String(passedOwner).trim().toUpperCase();
  }
  try {
    const ownerCol = getOwnerCollection();
    let doc = null;
    if (recordId && ObjectId.isValid(recordId)) {
      doc = await ownerCol.findOne({ _id: new ObjectId(recordId) });
    }
    if (!doc && truckNo) {
      const vehRegex = makeSpaceAgnosticRegex(truckNo);
      if (vehRegex) {
        doc = await ownerCol.findOne({
          $or: [{ "Truck No": vehRegex }, { "Truck No ": vehRegex }, { truck_no: vehRegex }]
        });
      }
    }
    if (doc) {
      const o = doc["Owner Name"] || doc["Owner Name "] || doc.owner_name || doc.party || doc.name;
      if (o) return String(o).trim().toUpperCase();
    }

    // Fallback: check Truck Contact Number
    const truckCol = getTruckCollection();
    let tDoc = null;
    if (recordId && ObjectId.isValid(recordId)) {
      tDoc = await truckCol.findOne({ _id: new ObjectId(recordId) });
    }
    if (!tDoc && truckNo) {
      const vehRegex = makeSpaceAgnosticRegex(truckNo);
      if (vehRegex) {
        tDoc = await truckCol.findOne({
          $or: [{ truck_no: vehRegex }, { "Truck No": vehRegex }]
        });
      }
    }
    if (tDoc) {
      const o = tDoc["Owner Name"] || tDoc["Owner Name "] || tDoc.owner_name || tDoc.party || tDoc.name;
      if (o) return String(o).trim().toUpperCase();
    }
  } catch (err) {
    console.warn('[roadTaxCementAdvanceManager] resolveOwnerName error:', err.message);
  }
  return '';
}

/**
 * Finds the SAME-DATE real (non-dummy) Cement Register trip/invoice record for the selected
 * OWNER + VEHICLE + EXACT DATE.
 *
 * If multiple matching trips exist on the same date:
 * Returns the most recently created/updated trip to ensure the amount is recorded exactly once.
 */
async function findSameDateCementRecord(vehicleNumber, ownerName = "", txDate = null) {
  if (!vehicleNumber || !txDate) return null;
  const col = getCementCollection();

  const vehRegex = makeSpaceAgnosticRegex(vehicleNumber);
  if (!vehRegex) return null;

  const query = {
    $or: [
      { "VEHICLE NUMBER": vehRegex },
      { "VEHICLE NO": vehRegex },
      { "VEHICLE NO.": vehRegex },
      { "vehicleNumber": vehRegex }
    ]
  };

  const rawEntries = await col.find(query).toArray();
  if (!rawEntries || rawEntries.length === 0) return null;

  // Filter out dummy rows
  const realEntries = rawEntries.filter(e => !isDummyRow(e));
  if (!realEntries || realEntries.length === 0) return null;

  let matchedEntries = realEntries;
  if (ownerName) {
    const ownerMatches = realEntries.filter(e => {
      const rowOwner = e["OWNER NAME"] || e["PARTY NAME"] || e["OWNER"] || e["owner_name"] || e["Owner Name"] || "";
      return matchOwnerNames(rowOwner, ownerName);
    });
    if (ownerMatches.length > 0) {
      matchedEntries = ownerMatches;
    }
  }

  // Filter for EXACT same calendar date
  const sameDateEntries = matchedEntries.filter(entry => {
    const rawDate = entry["LOADING DT"] || entry["LOADING DATE"] || entry["BILL DATE"] ||
                    entry["INVOICE DATE"] || entry["RECEIVING DATE"] || entry["UNLOADING STATUS"] ||
                    entry["DATE"] || entry.date;
    return isSameCalendarDate(rawDate, txDate);
  });

  if (!sameDateEntries || sameDateEntries.length === 0) {
    return null;
  }

  // Tie-breaker for multiple trips on same date: most recently created/updated
  sameDateEntries.sort((a, b) => {
    const idTimeA = a._id && typeof a._id.getTimestamp === 'function' ? a._id.getTimestamp().getTime() : new Date(a.createdAt || 0).getTime();
    const idTimeB = b._id && typeof b._id.getTimestamp === 'function' ? b._id.getTimestamp().getTime() : new Date(b.createdAt || 0).getTime();
    return idTimeB - idTimeA;
  });

  return sameDateEntries[0];
}

/**
 * Reverses a Brinda Shyam or Jeet Panja receivable amount contribution from Cement Register.
 */
async function reverseRoadTaxReceivableFromCement(sourceInfo) {
  try {
    const col = getCementCollection();
    const roadTaxCol = getRoadTaxCollection();

    let txIdStr = '';
    let cementRecordId = null;
    let creditor = null;
    let docId = null;

    if (typeof sourceInfo === 'string' || sourceInfo instanceof ObjectId) {
      txIdStr = String(sourceInfo);
    } else if (sourceInfo && typeof sourceInfo === 'object') {
      txIdStr = String(sourceInfo.txId || sourceInfo.sourceTransactionId || sourceInfo._id || sourceInfo.keyMonthYear || sourceInfo.key || '').trim();
      cementRecordId = sourceInfo._cementSync?.cementRecordId || sourceInfo.cementRecordId;
      creditor = sourceInfo.creditor || sourceInfo._cementSync?.creditor;
      docId = sourceInfo._id;
    }

    if (!txIdStr && !cementRecordId) {
      return { success: false, error: "Missing txId or cementRecordId" };
    }

    const sType = creditor === 'JEET PANJA' ? 'JEET_PANJA_RECEIVABLE' : 'BRINDA_SHYAM_RECEIVABLE';

    // Locate the Cement Register record
    let cementRecord = null;
    if (cementRecordId) {
      try {
        cementRecord = await col.findOne({ _id: new ObjectId(cementRecordId) });
      } catch (_) {}
    }

    if (!cementRecord && txIdStr) {
      cementRecord = await col.findOne({
        $or: [
          { "_roadTaxContributions.txId": txIdStr },
          { sourceTransactionId: txIdStr }
        ]
      });
    }

    // Always delete any dedicated dummy row created specifically for this sourceTransactionId
    await deleteDummyRowBySource(sType, txIdStr);
    await deleteDummyRowBySource('BRINDA_SHYAM_RECEIVABLE', txIdStr);
    await deleteDummyRowBySource('JEET_PANJA_RECEIVABLE', txIdStr);

    if (!cementRecord) {
      if (docId) {
        await roadTaxCol.updateOne({ _id: new ObjectId(docId) }, { $unset: { _cementSync: "" } }).catch(() => {});
      }
      return { success: true, notLinked: true };
    }

    const contributions = Array.isArray(cementRecord._roadTaxContributions) ? cementRecord._roadTaxContributions : [];
    const matchContrib = contributions.find(c => String(c.txId) === txIdStr);
    const revAmount = matchContrib ? num(matchContrib.amount) : num(sourceInfo.receivableAmount || sourceInfo.amount);
    const remainingContributions = contributions.filter(c => String(c.txId) !== txIdStr);

    // Delta math: deduct only this transaction's amount
    const curBankTf = num(cementRecord["Bank TF"] || cementRecord["BANK TF"] || cementRecord["ADVANCE (BANK TF)"]);
    const newBankTf = Math.max(0, Math.round((curBankTf - revAmount) * 100) / 100);

    // If cementRecord is a dummy row
    if (isDummyRow(cementRecord)) {
      // Check if any other contributions exist on this dummy row
      const otherFreight = Array.isArray(cementRecord._freightAdvanceContributions) && cementRecord._freightAdvanceContributions.length > 0;
      if (remainingContributions.length === 0 && !otherFreight && newBankTf <= 0) {
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
              _roadTaxContributions: remainingContributions,
              updatedAt: new Date()
            }
          }
        );
        try {
          const io = getIO();
          if (io) io.emit('cementUpdates', { action: 'dummyRowUpdated', id: cementRecord._id.toString() });
        } catch (_) {}
      }

      if (docId) {
        await roadTaxCol.updateOne({ _id: new ObjectId(docId) }, { $unset: { _cementSync: "" } }).catch(() => {});
      }

      return { success: true, reversedAmount: revAmount, isDummy: true };
    }

    // Real trip row: deduct contribution and update
    await col.updateOne(
      { _id: cementRecord._id },
      {
        $set: {
          "Bank TF": newBankTf,
          "BANK TF": newBankTf,
          "ADVANCE (BANK TF)": newBankTf,
          _roadTaxContributions: remainingContributions,
          updatedAt: new Date()
        }
      }
    );

    if (docId) {
      await roadTaxCol.updateOne({ _id: new ObjectId(docId) }, { $unset: { _cementSync: "" } }).catch(() => {});
    }

    try {
      const io = getIO();
      if (io) {
        io.emit('cementUpdates', { action: 'roadTaxAdvanceReversed', recordId: cementRecord._id.toString(), bankTf: newBankTf });
      }
    } catch (_) {}

    return {
      success: true,
      reversedAmount: revAmount,
      cementRecordId: cementRecord._id.toString(),
      newBankTf
    };
  } catch (err) {
    console.error('[roadTaxCementAdvanceManager] reverseRoadTaxReceivableFromCement error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Universal applicator: Applies a RECEIVABLE AMOUNT from Brinda Shyam or Jeet Panja
 * into CEMENT REGISTER -> ADVANCE BANK TF for the exact Owner + Vehicle + Same Date.
 *
 * DATE-WISE MATCHING LOGIC:
 * 1. Identify the exact owner and vehicle.
 * 2. Use the actual transaction/receivable date without timezone shifts.
 * 3. Check CEMENT REGISTER for an existing invoice/trip row matching owner, vehicle, and date.
 * 4. If matching row exists, add receivable amount to its ADVANCE BANK TF field.
 * 5. If no matching row exists, create a dummy Cement Register row with the exact owner, vehicle,
 *    date, and ADVANCE BANK TF = receivable amount (no fabricated invoice/shipment number).
 * 6. If multiple valid matching trips exist on same date, update the latest one exactly once.
 */
async function applyRoadTaxReceivableToCement(sourceRecord) {
  try {
    if (!sourceRecord) return { success: false, error: "No source record provided" };

    const rawCreditor = String(sourceRecord.creditor || 'BRINDA SHYAM').trim().toUpperCase();
    const isJeet = rawCreditor === 'JEET PANJA';
    const creditor = isJeet ? 'JEET PANJA' : 'BRINDA SHYAM';
    const sourceType = isJeet ? 'JEET_PANJA_RECEIVABLE' : 'BRINDA_SHYAM_RECEIVABLE';

    const vehicleNo = String(sourceRecord.truckNo || sourceRecord.vehicle || sourceRecord.vehicleNo || '').trim().toUpperCase();
    if (!vehicleNo) {
      return { success: false, error: "Missing truck/vehicle number" };
    }

    const receivableAmount = num(sourceRecord.receivableAmount);

    // Resolve date components
    const rawDate = sourceRecord.receivableDate || sourceRecord.transactionDate || sourceRecord.date || sourceRecord.renewDate || sourceRecord.expireDate || sourceRecord.expireDateRaw;
    let dateComp = extractDateComponents(rawDate);
    if (!dateComp) {
      const m = sourceRecord.month ? parseInt(sourceRecord.month, 10) : (new Date().getMonth() + 1);
      const y = sourceRecord.year ? parseInt(sourceRecord.year, 10) : new Date().getFullYear();
      dateComp = { day: 1, month: m, year: y };
    }

    const dateFormatted = `${String(dateComp.day).padStart(2, '0')}-${String(dateComp.month).padStart(2, '0')}-${dateComp.year}`;
    const dateDotFormatted = `${String(dateComp.day).padStart(2, '0')}.${String(dateComp.month).padStart(2, '0')}.${dateComp.year}`;

    // Stable transaction reference
    const cleanVeh = vehicleNo.replace(/[^A-Z0-9]/g, '');
    let txId = String(
      sourceRecord.txId ||
      sourceRecord.transactionId ||
      sourceRecord.sourceTransactionId ||
      (sourceRecord._id ? sourceRecord._id.toString() : '') ||
      sourceRecord.keyMonthYear ||
      `${creditor}_${cleanVeh}_${dateFormatted}`
    ).trim();

    // If receivableAmount <= 0: Reverse any previously applied contribution
    if (receivableAmount <= 0) {
      await reverseRoadTaxReceivableFromCement({ ...sourceRecord, txId, creditor });
      return { success: true, reversed: true, message: "Receivable amount is zero; reversed contribution." };
    }

    // Resolve owner name
    const ownerName = await resolveOwnerName(cleanVeh, sourceRecord.recordId, sourceRecord.ownerName);

    const col = getCementCollection();
    const roadTaxCol = getRoadTaxCollection();

    // Check if previously applied
    const prevSync = sourceRecord._cementSync;
    if (prevSync && prevSync.applied) {
      const isSameVeh = String(prevSync.vehicleNo || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === cleanVeh;
      const isSameOwner = matchOwnerNames(prevSync.ownerName, ownerName);
      const isSameAmt = num(prevSync.amount) === receivableAmount;
      const isSameDate = isSameCalendarDate(prevSync.date, dateFormatted);

      if (isSameVeh && isSameOwner && isSameAmt && isSameDate && prevSync.cementRecordId) {
        // Verify contribution still exists in Cement Record
        try {
          const curCement = await col.findOne({ _id: new ObjectId(prevSync.cementRecordId) });
          if (curCement) {
            const contribs = Array.isArray(curCement._roadTaxContributions) ? curCement._roadTaxContributions : [];
            const hasContrib = contribs.some(c => String(c.txId) === txId && num(c.amount) === receivableAmount);
            if (hasContrib) {
              return {
                success: true,
                alreadyApplied: true,
                cementRecordId: prevSync.cementRecordId,
                totalBankTf: num(curCement["Bank TF"]),
                message: `₹${receivableAmount.toLocaleString('en-IN')} already applied in Advance Bank TF.`
              };
            }
          }
        } catch (_) {}
      }

      // If parameters changed (e.g. amount or date), reverse previous contribution first
      await reverseRoadTaxReceivableFromCement({ ...sourceRecord, txId, creditor, _cementSync: prevSync });
    }

    // 1. Search for SAME-DATE real Cement Register trip row
    const targetRecord = await findSameDateCementRecord(cleanVeh, ownerName, dateFormatted);

    if (!targetRecord) {
      // 2. CASE 2: No real trip exists on that date -> find or create a same-date dummy row
      const vehRegex = makeSpaceAgnosticRegex(cleanVeh);
      const allDummyRows = await col.find({
        isDummy: true,
        "VEHICLE NUMBER": { $regex: vehRegex }
      }).toArray();

      const existingSameDateDummy = allDummyRows.find(d => {
        const dDate = d["LOADING DT"] || d["LOADING DATE"] || d["DATE"] || d.date;
        return isSameCalendarDate(dDate, dateFormatted);
      });

      let dummyRecordId = null;
      let totalDummyBankTf = receivableAmount;

      if (existingSameDateDummy) {
        // Accumulate onto existing same-date dummy row
        const dummyContribs = Array.isArray(existingSameDateDummy._roadTaxContributions) ? existingSameDateDummy._roadTaxContributions : [];
        const existingIdx = dummyContribs.findIndex(c => String(c.txId) === txId);
        let newContribs = [...dummyContribs];

        const newEntry = {
          txId,
          source: sourceType,
          creditor,
          amount: receivableAmount,
          vehicleNo: cleanVeh,
          ownerName,
          date: dateFormatted,
          appliedAt: new Date()
        };

        if (existingIdx >= 0) {
          newContribs[existingIdx] = newEntry;
        } else {
          newContribs.push(newEntry);
        }

        // Sum of all road tax contributions + any other contributions on this dummy row
        const roadTaxSum = Math.round(newContribs.reduce((sum, c) => sum + num(c.amount), 0) * 100) / 100;
        const otherFreightSum = Array.isArray(existingSameDateDummy._freightAdvanceContributions)
          ? existingSameDateDummy._freightAdvanceContributions.reduce((sum, c) => sum + num(c.amount), 0)
          : 0;
        totalDummyBankTf = Math.round((roadTaxSum + otherFreightSum) * 100) / 100;
        dummyRecordId = existingSameDateDummy._id.toString();

        await col.updateOne(
          { _id: existingSameDateDummy._id },
          {
            $set: {
              "Bank TF": totalDummyBankTf,
              "BANK TF": totalDummyBankTf,
              "ADVANCE (BANK TF)": totalDummyBankTf,
              _roadTaxContributions: newContribs,
              updatedAt: new Date()
            }
          }
        );

        try {
          const io = getIO();
          if (io) io.emit('cementUpdates', { action: 'dummyRowUpdated', id: dummyRecordId, bankTf: totalDummyBankTf });
        } catch (_) {}
      } else {
        // Create new dummy row via syncDummyCementRow
        const syncRes = await syncDummyCementRow({
          sourceType,
          sourceTransactionId: txId,
          vehicleNumber: cleanVeh,
          ownerName,
          date: dateFormatted,
          month: dateComp.month,
          year: dateComp.year,
          field: 'Bank TF',
          amount: receivableAmount
        });

        dummyRecordId = syncRes.recordId;
        if (dummyRecordId) {
          await col.updateOne(
            { _id: new ObjectId(dummyRecordId) },
            {
              $set: {
                _roadTaxContributions: [{
                  txId,
                  source: sourceType,
                  creditor,
                  amount: receivableAmount,
                  vehicleNo: cleanVeh,
                  ownerName,
                  date: dateFormatted,
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
        source: sourceType,
        creditor,
        cementRecordId: dummyRecordId || null,
        vehicleNo: cleanVeh,
        ownerName,
        date: dateFormatted,
        amount: receivableAmount,
        appliedAt: new Date()
      };

      if (sourceRecord._id) {
        await roadTaxCol.updateOne({ _id: new ObjectId(sourceRecord._id) }, { $set: { _cementSync: syncMeta } }).catch(() => {});
      } else if (sourceRecord.keyMonthYear) {
        await roadTaxCol.updateOne({ key: sourceRecord.keyMonthYear }, { $set: { _cementSync: syncMeta } }).catch(() => {});
      }

      return {
        success: true,
        applied: true,
        isDummy: true,
        creditor,
        vehicleNo: cleanVeh,
        ownerName,
        date: dateFormatted,
        amount: receivableAmount,
        cementRecordId: dummyRecordId,
        totalBankTf: totalDummyBankTf,
        message: `₹${receivableAmount.toLocaleString('en-IN')} accumulated in Dummy Advance Bank TF for ${ownerName} (${cleanVeh}) on ${dateFormatted}.`
      };
    }

    // 3. CASE 1: Real SAME-DATE trip exists -> Accumulate onto that real row
    // Remove any previous dummy row tied to this transaction
    await deleteDummyRowBySource(sourceType, txId);
    await deleteDummyRowBySource('BRINDA_SHYAM_RECEIVABLE', txId);
    await deleteDummyRowBySource('JEET_PANJA_RECEIVABLE', txId);

    const existingContributions = Array.isArray(targetRecord._roadTaxContributions) ? targetRecord._roadTaxContributions : [];
    const existingIdx = existingContributions.findIndex(c => String(c.txId) === txId);
    let newContributions = [...existingContributions];

    const prevTxAmount = existingIdx >= 0 ? num(existingContributions[existingIdx].amount) : 0;

    const newContrib = {
      txId,
      source: sourceType,
      creditor,
      amount: receivableAmount,
      vehicleNo: cleanVeh,
      ownerName,
      date: dateFormatted,
      appliedAt: new Date()
    };

    if (existingIdx >= 0) {
      newContributions[existingIdx] = newContrib;
    } else {
      newContributions.push(newContrib);
    }

    // Delta math: exactly add delta to current Bank TF (preserving unrelated contributions)
    const currentBankTf = num(targetRecord["Bank TF"] || targetRecord["BANK TF"] || targetRecord["ADVANCE (BANK TF)"]);
    const delta = receivableAmount - prevTxAmount;
    const totalAccumulatedBankTf = Math.max(0, Math.round((currentBankTf + delta) * 100) / 100);

    await col.updateOne(
      { _id: targetRecord._id },
      {
        $set: {
          "Bank TF": totalAccumulatedBankTf,
          "BANK TF": totalAccumulatedBankTf,
          "ADVANCE (BANK TF)": totalAccumulatedBankTf,
          _roadTaxContributions: newContributions,
          updatedAt: new Date()
        }
      }
    );

    const syncMeta = {
      applied: true,
      isDummy: false,
      source: sourceType,
      creditor,
      cementRecordId: targetRecord._id.toString(),
      vehicleNo: cleanVeh,
      ownerName,
      date: dateFormatted,
      amount: receivableAmount,
      appliedAt: new Date()
    };

    if (sourceRecord._id) {
      await roadTaxCol.updateOne({ _id: new ObjectId(sourceRecord._id) }, { $set: { _cementSync: syncMeta } }).catch(() => {});
    } else if (sourceRecord.keyMonthYear) {
      await roadTaxCol.updateOne({ key: sourceRecord.keyMonthYear }, { $set: { _cementSync: syncMeta } }).catch(() => {});
    }

    try {
      const io = getIO();
      if (io) {
        io.emit('cementUpdates', {
          action: 'roadTaxAdvanceApplied',
          recordId: targetRecord._id.toString(),
          bankTf: totalAccumulatedBankTf
        });
      }
    } catch (_) {}

    return {
      success: true,
      applied: true,
      isDummy: false,
      creditor,
      vehicleNo: cleanVeh,
      ownerName,
      date: dateFormatted,
      amount: receivableAmount,
      cementRecordId: targetRecord._id.toString(),
      totalBankTf: totalAccumulatedBankTf,
      message: `₹${receivableAmount.toLocaleString('en-IN')} accumulated in Advance Bank TF for ${ownerName} (${cleanVeh}) on ${dateFormatted}. Total Bank TF: ₹${totalAccumulatedBankTf}`
    };
  } catch (err) {
    console.error('[roadTaxCementAdvanceManager] applyRoadTaxReceivableToCement error:', err);
    return { success: false, error: err.message };
  }
}

module.exports = {
  findSameDateCementRecord,
  applyRoadTaxReceivableToCement,
  reverseRoadTaxReceivableFromCement,
  extractDateComponents,
  formatDateDDMMYYYY,
  formatDateDDMMYYDot,
  isSameCalendarDate,
  resolveOwnerName
};
