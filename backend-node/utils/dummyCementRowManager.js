const mongoose = require("mongoose");
const { ObjectId } = require("mongodb");
const { getIO } = require("../socket");

function getCementCollection(customDb = null) {
  if (customDb) {
    if (typeof customDb.collection === 'function') {
      return customDb.collection("entries");
    }
    return customDb;
  }
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
 * Helper to check if an invoice or shipment string represents a real shipment/invoice
 * vs empty/whitespace/placeholder text (like "CASH VOUCHER", "VOUCHER", "DUMMY", etc.)
 */
function isRealInvoiceOrShipment(val) {
  if (val === null || val === undefined) return false;
  const str = String(val).trim();
  if (!str) return false;
  const upper = str.toUpperCase();
  if (
    upper === 'CASH VOUCHER' ||
    upper === 'VOUCHER' ||
    upper === 'DUMMY' ||
    upper === 'NO SLIP' ||
    upper === '—' ||
    upper === '-' ||
    upper === 'N/A' ||
    upper === 'NA' ||
    upper.includes('VOUCHER') ||
    upper.includes('DUMMY')
  ) {
    return false;
  }
  return true;
}

/**
 * Authoritative rule for DUMMY ROW in Cement Register:
 * A row is considered a DUMMY ROW when:
 * - BOTH INVOICE NUMBER and SHIPMENT NUMBER are missing/empty/placeholder (like CASH VOUCHER, VOUCHER, DUMMY)
 * - OR the row is explicitly marked as dummy (isDummy: true, _source: 'auto_dummy', etc.)
 *
 * isDummy = !hasRealInvoice && !hasRealShipment
 */
function isDummyRow(row) {
  if (!row) return false;

  const rawInvoice = row['INVOICE NO'] !== undefined ? row['INVOICE NO'] :
    (row['INVOICE NUMBER'] !== undefined ? row['INVOICE NUMBER'] :
    (row['Invoice No'] !== undefined ? row['Invoice No'] :
    (row['invoiceNo'] !== undefined ? row['invoiceNo'] :
    (row['invoice_number'] !== undefined ? row['invoice_number'] : ''))));

  const rawShipment = row['SHIPMENT NO'] !== undefined ? row['SHIPMENT NO'] :
    (row['SHIPMENT NUMBER'] !== undefined ? row['SHIPMENT NUMBER'] :
    (row['Shipment No'] !== undefined ? row['Shipment No'] :
    (row['shipmentNo'] !== undefined ? row['shipmentNo'] :
    (row['shipment_number'] !== undefined ? row['shipment_number'] : ''))));

  const hasRealInvoice = isRealInvoiceOrShipment(rawInvoice);
  const hasRealShipment = isRealInvoiceOrShipment(rawShipment);

  if (row.isDummy === true || row._isDummy === true || row._source === 'auto_dummy') {
    if (hasRealInvoice || hasRealShipment) return false;
    return true;
  }

  return !hasRealInvoice && !hasRealShipment;
}

/**
 * Check if the vehicle currently has an existing REAL (non-dummy) Cement Register invoice/trip record.
 */
async function hasRealCementRecord(vehicleNumber, month = null, year = null, customDb = null) {
  if (!vehicleNumber) return false;
  const col = getCementCollection(customDb);
  const vehRegex = makeSpaceAgnosticRegex(vehicleNumber);
  if (!vehRegex) return false;

  const query = {
    $or: [
      { "VEHICLE NUMBER": vehRegex },
      { "VEHICLE NO": vehRegex },
      { "VEHICLE NO.": vehRegex }
    ]
  };

  const records = await col.find(query).toArray();
  if (!records || records.length === 0) return false;

  const realRecords = records.filter(r => !isDummyRow(r));
  if (!realRecords || realRecords.length === 0) return false;

  if (month && year) {
    const hasInMonth = realRecords.some(r => {
      let rm = r.month ? parseInt(r.month, 10) : null;
      let ry = r.year ? parseInt(r.year, 10) : null;
      if (!rm || !ry) {
        const d = parseToDate(r["LOADING DT"] || r["LOADING DATE"] || r["BILL DATE"] || r["INVOICE DATE"]);
        if (d.getTime() > 0) {
          rm = d.getMonth() + 1;
          ry = d.getFullYear();
        }
      }
      return rm === parseInt(month, 10) && ry === parseInt(year, 10);
    });
    return hasInMonth;
  }

  return true;
}

/**
 * Creates, updates, or deletes a Dummy Cement Register row.
 * Guaranteed idempotent and duplicate-safe using sourceType + sourceTransactionId.
 */
async function syncDummyCementRow({
  sourceType,
  sourceTransactionId,
  vehicleNumber,
  vehicleNo,
  ownerName,
  owner,
  date,
  month,
  year,
  field, // 'OFFICE CASH', 'Site Cash', 'Bank TF'
  financialField,
  amount,
  proofUrl = '',
  isDelete = false,
  customDb = null,
  db = null,
  io = null
}) {
  const col = getCementCollection(customDb || db);
  const txIdStr = String(sourceTransactionId || '').trim();
  const cleanVeh = String(vehicleNumber || vehicleNo || '').trim().toUpperCase();
  const cleanOwner = String(ownerName || owner || '').trim();
  const targetField = field || financialField;
  const numAmount = num(amount);

  if (!txIdStr || !sourceType) {
    return { success: false, error: "Missing sourceType or sourceTransactionId" };
  }

  // 1. Locate any existing dummy row for this exact source transaction
  const existingDummy = await col.findOne({
    sourceType,
    sourceTransactionId: txIdStr
  });

  // 2. Handle deletion or zero amount
  if (isDelete || numAmount <= 0) {
    if (existingDummy) {
      await col.deleteOne({ _id: existingDummy._id });
      try {
        const socketIo = io || getIO();
        if (socketIo) socketIo.emit('cementUpdates', { action: 'dummyRowDeleted', id: existingDummy._id.toString() });
      } catch (_) {}
    }
    return { success: true, action: 'deleted' };
  }

  // 3. Resolve Date, Month, Year
  let parsedD = parseToDate(date);
  if (!parsedD || isNaN(parsedD.getTime()) || parsedD.getTime() === 0) {
    parsedD = new Date();
  }
  const dMonth = month ? parseInt(month, 10) : (parsedD.getMonth() + 1);
  let dYear = year ? parseInt(year, 10) : parsedD.getFullYear();
  if (dYear < 100) dYear += 2000;

  const dayStr = String(parsedD.getDate()).padStart(2, '0');
  const monthStr = String(dMonth).padStart(2, '0');
  const yearStr = String(dYear);
  const formattedDateStr = `${dayStr}.${monthStr}.${yearStr}`;

  // 4. Construct dummy document data
  const updateData = {
    isDummy: true,
    _isDummy: true,
    sourceType,
    sourceTransactionId: txIdStr,
    "INVOICE NO": "",
    "INVOICE NUMBER": "",
    "SHIPMENT NO": "",
    "SHIPMENT NUMBER": "",
    "VEHICLE NUMBER": cleanVeh,
    "OWNER NAME": cleanOwner,
    "LOADING DT": formattedDateStr,
    "LOADING DATE": formattedDateStr,
    date: formattedDateStr,
    month: dMonth,
    year: dYear,
    updatedAt: new Date()
  };

  // Reset other advance fields to 0 to avoid cross-contamination
  if (targetField === 'OFFICE CASH' || targetField === 'OFFICE CASH ADVANCE' || targetField === 'Office Cash') {
    updateData["OFFICE CASH"] = numAmount;
    updateData["OFFICE CASH ADVANCE"] = numAmount;
    updateData["Office Cash"] = numAmount;
    if (proofUrl) updateData["OFFICE_CASH_PROOF_URL"] = proofUrl;
  } else if (targetField === 'Site Cash' || targetField === 'SITE CASH' || targetField === 'SITE CASH ADVANCE') {
    updateData["Site Cash"] = numAmount;
    updateData["SITE CASH"] = numAmount;
    updateData["SITE CASH ADVANCE"] = numAmount;
    if (proofUrl) updateData["SITE_CASH_PROOF_URL"] = proofUrl;
  } else if (targetField === 'Bank TF' || targetField === 'BANK TF' || targetField === 'ADVANCE (BANK TF)' || targetField === 'Advance (Bank TF)') {
    updateData["Bank TF"] = numAmount;
    updateData["BANK TF"] = numAmount;
    updateData["ADVANCE (BANK TF)"] = numAmount;
  }

  if (existingDummy) {
    await col.updateOne(
      { _id: existingDummy._id },
      { $set: updateData }
    );
    try {
      const socketIo = io || getIO();
      if (socketIo) socketIo.emit('cementUpdates', { action: 'dummyRowUpdated', id: existingDummy._id.toString() });
    } catch (_) {}
    return { success: true, action: 'updated', recordId: existingDummy._id.toString() };
  } else {
    updateData.createdAt = new Date();
    const result = await col.insertOne(updateData);
    try {
      const socketIo = io || getIO();
      if (socketIo) socketIo.emit('cementUpdates', { action: 'dummyRowCreated', id: result.insertedId.toString() });
    } catch (_) {}
    return { success: true, action: 'created', recordId: result.insertedId.toString() };
  }
}

/**
 * Remove any dummy row created for this source transaction.
 */
async function deleteDummyRowBySource(sourceType, sourceTransactionId, customDb = null) {
  let sType = sourceType;
  let sTxId = sourceTransactionId;
  let cDb = customDb;
  let sIo = null;
  if (typeof sourceType === 'object' && sourceType !== null) {
    sType = sourceType.sourceType;
    sTxId = sourceType.sourceTransactionId;
    cDb = sourceType.customDb || sourceType.db;
    sIo = sourceType.io;
  }
  if (!sType || !sTxId) return { success: true };
  const col = getCementCollection(cDb);
  const txIdStr = String(sTxId).trim();
  const res = await col.deleteMany({
    sourceType: sType,
    sourceTransactionId: txIdStr
  });
  if (res.deletedCount > 0) {
    try {
      const socketIo = sIo || getIO();
      if (socketIo) socketIo.emit('cementUpdates', { action: 'dummyRowDeleted', sourceTransactionId: txIdStr });
    } catch (_) {}
  }
  return { success: true, deletedCount: res.deletedCount };
}

module.exports = {
  getCementCollection,
  hasRealCementRecord,
  isDummyRow,
  syncDummyCementRow,
  deleteDummyRowBySource,
  parseToDate,
  makeSpaceAgnosticRegex
};
