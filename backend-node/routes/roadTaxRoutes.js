const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { ObjectId } = require('mongodb');
const truckContactUpload = require('../middleware/truckContactUpload');

function getOwnerCollection() {
  return mongoose.connection.useDb('invoice_system').collection('owner details');
}

function getTruckCollection() {
  return mongoose.connection.useDb('invoice_system').collection('Truck Contact Number');
}

function getRoadTaxCollection() {
  return mongoose.connection.useDb('invoice_system').collection('road_tax_register');
}

// Helper to fetch combined vehicle contacts with owner details as primary source of truth
async function fetchAllContacts() {
  const ownerCol = getOwnerCollection();
  const truckCol = getTruckCollection();

  const ownerDocs = await ownerCol.find({}).sort({ _id: -1 }).toArray();
  const truckDocs = await truckCol.find({}).sort({ _id: -1 }).toArray();

  const combinedMap = new Map();

  for (const doc of ownerDocs) {
    const key = (doc["Truck No"] || doc["Truck No "] || doc.truck_no || doc._id.toString()).toString().trim().toUpperCase();
    combinedMap.set(key, doc);
  }

  for (const doc of truckDocs) {
    const key = (doc.truck_no || doc["Truck No "] || doc["Truck No"] || doc._id.toString()).toString().trim().toUpperCase();
    if (!combinedMap.has(key)) {
      combinedMap.set(key, doc);
    }
  }

  return Array.from(combinedMap.values());
}

// Timezone-safe date parser
function parseDateString(val) {
  if (!val || val === '-' || val === 'null' || val === 'undefined') return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  const str = String(val).trim();
  if (str.toUpperCase() === 'NA' || str.toUpperCase() === 'N/A') return null;

  // 1. DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY or DD.MM.YY
  let m = str.match(/^(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{2,4})$/);
  if (m) {
    let d = parseInt(m[1], 10);
    let mo = parseInt(m[2], 10) - 1;
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    const dObj = new Date(y, mo, d, 12, 0, 0); // Noon prevents UTC/local timezone shifts
    return isNaN(dObj.getTime()) ? null : dObj;
  }

  // 2. YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
  m = str.match(/^(\d{4})[\.\/\-](\d{1,2})[\.\/\-](\d{1,2})$/);
  if (m) {
    let y = parseInt(m[1], 10);
    let mo = parseInt(m[2], 10) - 1;
    let d = parseInt(m[3], 10);
    const dObj = new Date(y, mo, d, 12, 0, 0); // Noon prevents UTC/local timezone shifts
    return isNaN(dObj.getTime()) ? null : dObj;
  }

  return null;
}

function formatDateToDDMMYYYY(dObj) {
  if (!dObj) return '-';
  const dd = String(dObj.getDate()).padStart(2, '0');
  const mm = String(dObj.getMonth() + 1).padStart(2, '0');
  const yyyy = dObj.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function num(val) {
  if (val === null || val === undefined || val === '') return 0;
  const n = parseFloat(String(val).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

const VALIDITY_FIELD_CONFIGS = [
  { label: 'RC', primaryKey: 'RC Validity', altKeys: ['rc_validity', 'RC VALIDITY', 'RC'] },
  { label: 'INSURANCE', primaryKey: 'Insurance Validity', altKeys: ['insurance_validity', 'INSURANCE VALIDITY', 'INSURANCE'] },
  { label: 'FITNESS', primaryKey: 'Fitness Validity', altKeys: ['fitness_validity', 'FITNESS VALIDITY', 'FITNESS'] },
  { label: 'ROAD TAX', primaryKey: 'Road Tax Validity', altKeys: ['road_tax_validity', 'ROAD TAX VALIDITY', 'ROAD TAX'] },
  { label: 'PERMIT', primaryKey: 'Permit', altKeys: ['permit', 'PERMIT', 'permit_validity', 'Permit Validity'] },
  { label: 'PUC', primaryKey: 'PUC', altKeys: ['puc', 'PUC', 'puc_validity', 'PUC Validity'] },
  { label: 'NP', primaryKey: 'NP Validity', altKeys: ['np_validity', 'NP VALIDITY', 'NP'] },
  { label: 'LICENSE', primaryKey: 'License Validity', altKeys: ['license_validity', 'LICENSE VALIDITY', 'LICENSE'] },
  { label: 'DRIVER AUTHORISE', primaryKey: 'Driver Authoraization validity', altKeys: ['driver_authorization_validity', 'DRIVER AUTHORIZATION VALIDITY', 'Driver Authorise Validity', 'driver_authorise_validity', 'DRIVER AUTHORISE VALIDITY'] }
];

// ── GET /api/road-tax ────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { month, year, search, upcoming, creditor } = req.query;
    const creditorName = (creditor || 'BRINDA SHYAM').trim().toUpperCase();
    const isJeet = creditorName === 'JEET PANJA';
    const now = new Date();

    const targetMonth = month && month !== 'ALL' && month !== '7_DAYS' ? parseInt(month, 10) : (now.getMonth() + 1);
    const targetYear = year && year !== 'ALL' ? parseInt(year, 10) : now.getFullYear();
    const isAllFilter = (month === 'ALL' || year === 'ALL');
    const is7DaysFilter = (month === '7_DAYS' || upcoming === 'true');

    const contacts = await fetchAllContacts();
    const roadTaxCol = getRoadTaxCollection();

    const savedFilter = isJeet
      ? { creditor: 'JEET PANJA' }
      : { $or: [{ creditor: 'BRINDA SHYAM' }, { creditor: { $exists: false } }, { creditor: null }] };

    const savedRecords = await roadTaxCol.find(savedFilter).toArray();

    // Map saved records by key
    const savedMap = new Map();
    savedRecords.forEach(rec => {
      if (rec.key) savedMap.set(rec.key, rec);
    });

    // 7-day upcoming validity calculation logic:
    // expiryDate >= today AND expiryDate <= today + 7 days
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const windowEndMs = todayStart + sevenDaysMs + (24 * 60 * 60 * 1000 - 1); // inclusive end of 7th day

    let entries = [];

    contacts.forEach(c => {
      const recordId = String(c._id || '');
      const truckNo = String(c["Truck No"] || c["Truck No "] || c.truck_no || "-").trim();
      const ownerName = String(c["Owner Name"] || c["Owner Name "] || c.owner_name || "-").trim();
      const vehicleType = String(c["Type of vehicle"] || c["Type of vehicle "] || c.type_of_vehicle || "-").trim();

      // Check EVERY validity field for this vehicle
      VALIDITY_FIELD_CONFIGS.forEach(vConfig => {
        let valRaw = c[vConfig.primaryKey];
        if (!valRaw) {
          for (const alt of vConfig.altKeys) {
            if (c[alt]) { valRaw = c[alt]; break; }
          }
        }

        if (!valRaw || valRaw === '-' || valRaw === 'null' || valRaw === 'undefined') return;

        const dObj = parseDateString(valRaw);
        if (!dObj) return; // Skip invalid or blank dates

        const dStart = new Date(dObj.getFullYear(), dObj.getMonth(), dObj.getDate(), 0, 0, 0).getTime();
        const valMonth = dObj.getMonth() + 1;
        const valYear = dObj.getFullYear();

        let qualifies = false;

        if (is7DaysFilter) {
          // Qualification: expiryDate >= today AND expiryDate <= today + 7 days
          qualifies = (dStart >= todayStart && dStart <= windowEndMs);
        } else if (isAllFilter) {
          qualifies = true;
        } else {
          // Qualification: Expiry date falls within selected month and year
          qualifies = (valMonth === targetMonth && valYear === targetYear);
        }

        if (qualifies) {
          const typeKey = vConfig.label.replace(/\s+/g, '_');
          const prefix = isJeet ? `${truckNo.toUpperCase()}_${typeKey}_JEET_PANJA` : `${truckNo.toUpperCase()}_${typeKey}`;
          const savedKey1 = isJeet ? `${truckNo.toUpperCase()}_${typeKey}_${valMonth}_${valYear}_JEET_PANJA` : `${truckNo.toUpperCase()}_${typeKey}_${valMonth}_${valYear}`;
          const savedKey2 = isJeet ? `${truckNo.toUpperCase()}_${typeKey}_${targetMonth}_${targetYear}_JEET_PANJA` : `${truckNo.toUpperCase()}_${typeKey}_${targetMonth}_${targetYear}`;
          const savedKeyAlt = prefix;
          const saved = savedMap.get(savedKey1) || savedMap.get(savedKey2) || savedMap.get(savedKeyAlt) || {};

          const expireDateFormatted = formatDateToDDMMYYYY(dObj);
          const renewStatus = saved.renewStatus || 'PENDING';
          const renewDate = saved.renewDate || expireDateFormatted;
          const newValidityDate = saved.newValidityDate || '';
          const receivableAmount = num(saved.receivableAmount);
          const paidAmount = num(saved.paidAmount);
          const balance = Math.round(Math.abs(receivableAmount - paidAmount) * 100) / 100;

          entries.push({
            id: isJeet ? `${recordId}_${typeKey}_JEET_PANJA` : `${recordId}_${typeKey}`,
            recordId,
            truckNo,
            ownerName,
            vehicleType,
            validityType: vConfig.label,
            expireDate: expireDateFormatted,
            expireDateRaw: valRaw,
            renewStatus,
            renewDate,
            newValidityDate,
            receivableAmount,
            paidAmount,
            balance,
            pdfUrl: saved.pdfUrl || '',
            pdfName: saved.pdfName || ''
          });
        }
      });
    });

    // Sort entries by expiry date ascending
    entries.sort((a, b) => {
      const dA = parseDateString(a.expireDateRaw) || new Date(0);
      const dB = parseDateString(b.expireDateRaw) || new Date(0);
      return dA - dB;
    });

    // Search filter
    if (search && search.trim()) {
      const term = search.toLowerCase().trim();
      entries = entries.filter(e =>
        e.truckNo.toLowerCase().includes(term) ||
        e.ownerName.toLowerCase().includes(term) ||
        e.vehicleType.toLowerCase().includes(term) ||
        e.validityType.toLowerCase().includes(term)
      );
    }

    // Attach SL NO (1..N) sequentially for currently displayed validity rows
    const formattedEntries = entries.map((e, idx) => ({
      slNo: idx + 1,
      ...e
    }));

    res.json({
      success: true,
      creditor: creditorName,
      month: targetMonth,
      year: targetYear,
      count: formattedEntries.length,
      entries: formattedEntries
    });
  } catch (err) {
    console.error('[VehicleValidity] Fetch error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/road-tax/save ──────────────────────────────────────────────────
router.post('/save', async (req, res) => {
  try {
    const { recordId, truckNo, validityType, month, year, renewStatus, renewDate, newValidityDate, receivableAmount, paidAmount, pdfUrl, pdfName, creditor } = req.body;

    if (!truckNo || !validityType) {
      return res.status(400).json({ success: false, error: 'Truck No and Validity Type are required.' });
    }

    const creditorName = (creditor || 'BRINDA SHYAM').trim().toUpperCase();
    const isJeet = creditorName === 'JEET PANJA';

    const roadTaxCol = getRoadTaxCollection();
    const typeKey = String(validityType).trim().toUpperCase().replace(/\s+/g, '_');
    const m = month ? parseInt(month, 10) : (new Date().getMonth() + 1);
    const y = year ? parseInt(year, 10) : new Date().getFullYear();

    const key = isJeet
      ? `${String(truckNo).trim().toUpperCase()}_${typeKey}_JEET_PANJA`
      : `${String(truckNo).trim().toUpperCase()}_${typeKey}`;
    const keyMonthYear = isJeet
      ? `${String(truckNo).trim().toUpperCase()}_${typeKey}_${m}_${y}_JEET_PANJA`
      : `${String(truckNo).trim().toUpperCase()}_${typeKey}_${m}_${y}`;

    const recAmt = num(receivableAmount);
    const pAmt = num(paidAmount);
    const bal = Math.round(Math.abs(recAmt - pAmt) * 100) / 100;

    const updateData = {
      truckNo: String(truckNo).trim().toUpperCase(),
      recordId: recordId || '',
      validityType,
      creditor: isJeet ? 'JEET PANJA' : 'BRINDA SHYAM',
      month: m,
      year: y,
      renewStatus: renewStatus || 'PENDING',
      renewDate: renewDate || '',
      newValidityDate: newValidityDate || '',
      receivableAmount: recAmt,
      paidAmount: pAmt,
      balance: bal,
      updatedAt: new Date()
    };

    if (pdfUrl !== undefined) updateData.pdfUrl = pdfUrl;
    if (pdfName !== undefined) updateData.pdfName = pdfName;

    // Save with primary key and month-year key for persistence
    await roadTaxCol.updateOne(
      { key },
      { $set: { key, keyMonthYear, ...updateData } },
      { upsert: true }
    );
    await roadTaxCol.updateOne(
      { key: keyMonthYear },
      { $set: { key: keyMonthYear, ...updateData } },
      { upsert: true }
    );

    // ALSO update the actual Owner Details record in MongoDB if renewed / renewDate provided
    if (renewDate || renewStatus === 'RENEWED') {
      const vConfig = VALIDITY_FIELD_CONFIGS.find(v => v.label.toUpperCase() === String(validityType).trim().toUpperCase());
      if (vConfig) {
        const ownerCol = getOwnerCollection();
        const truckCol = getTruckCollection();

        let query = { $or: [{ "Truck No": truckNo }, { "Truck No ": truckNo }, { truck_no: truckNo }] };
        if (recordId && ObjectId.isValid(recordId)) {
          query = { _id: new ObjectId(recordId) };
        }

        const updateFields = {};
        updateFields[vConfig.primaryKey] = renewDate;
        vConfig.altKeys.forEach(alt => {
          updateFields[alt] = renewDate;
        });

        await ownerCol.updateOne(query, { $set: updateFields }).catch(err => console.error('OwnerCol update error:', err));
        await truckCol.updateOne(query, { $set: updateFields }).catch(err => console.error('TruckCol update error:', err));
      }
    }

    res.json({ success: true, message: 'Vehicle validity record updated successfully.' });
  } catch (err) {
    console.error('[VehicleValidity] Save error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/road-tax/upload-pdf ─────────────────────────────────────────────
router.post('/upload-pdf', truckContactUpload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No PDF file uploaded.' });
    }
    res.json({
      success: true,
      url: req.file.location,
      fileName: req.file.originalname
    });
  } catch (err) {
    console.error('[VehicleValidity] PDF Upload error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;


