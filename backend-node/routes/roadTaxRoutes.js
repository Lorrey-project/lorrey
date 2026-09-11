const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
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

// Helper to fetch combined vehicle contacts
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

// Parse date into standard D, M, Y
function parseDateString(val) {
  if (!val || val === '-' || val === 'null' || val === 'undefined') return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  const str = String(val).trim();

  // DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY
  let m = str.match(/^(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{2,4})$/);
  if (m) {
    let d = parseInt(m[1], 10);
    let mo = parseInt(m[2], 10) - 1;
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    return new Date(y, mo, d);
  }

  // YYYY-MM-DD or YYYY/MM/DD
  m = str.match(/^(\d{4})[\.\/\-](\d{1,2})[\.\/\-](\d{1,2})$/);
  if (m) {
    let y = parseInt(m[1], 10);
    let mo = parseInt(m[2], 10) - 1;
    let d = parseInt(m[3], 10);
    return new Date(y, mo, d);
  }

  const dObj = new Date(str);
  if (!isNaN(dObj.getTime())) return dObj;
  return null;
}

function num(val) {
  if (val === null || val === undefined || val === '') return 0;
  const n = parseFloat(String(val).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

// ── GET /api/road-tax ────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { month, year, search } = req.query;
    const now = new Date();

    const targetMonth = month ? parseInt(month, 10) : (now.getMonth() + 1);
    const targetYear = year ? parseInt(year, 10) : now.getFullYear();

    const contacts = await fetchAllContacts();
    const roadTaxCol = getRoadTaxCollection();
    const savedRecords = await roadTaxCol.find({}).toArray();

    // Map saved records by truckNo + month + year
    const savedMap = new Map();
    savedRecords.forEach(rec => {
      const key = `${String(rec.truckNo).trim().toUpperCase()}_${rec.month}_${rec.year}`;
      savedMap.set(key, rec);
    });

    let entries = [];

    contacts.forEach(c => {
      const truckNo = String(c["Truck No"] || c["Truck No "] || c.truck_no || "-").trim();
      const ownerName = String(c["Owner Name"] || c["Owner Name "] || c.owner_name || "-").trim();
      const vehicleType = String(c["Type of vehicle"] || c["Type of vehicle "] || c.type_of_vehicle || "-").trim();
      const taxValRaw = c["Road Tax Validity"] || c["road_tax_validity"] || c["ROAD TAX VALIDITY"] || "-";

      const dObj = parseDateString(taxValRaw);
      const valMonth = dObj ? (dObj.getMonth() + 1) : null;
      const valYear = dObj ? dObj.getFullYear() : null;

      const savedKey = `${truckNo.toUpperCase()}_${targetMonth}_${targetYear}`;
      const saved = savedMap.get(savedKey) || {};

      // Filter: Include vehicle if validity expires in selected month OR if a saved renewal exists for month/year
      const matchesMonthYear = (valMonth === targetMonth) || saved.truckNo;
      
      // If month/year is 'ALL', return all vehicles with tax validity
      const isAllFilter = (month === 'ALL' || year === 'ALL');

      if (matchesMonthYear || isAllFilter) {
        const renewStatus = saved.renewStatus || 'PENDING';
        const renewDate = saved.renewDate || (dObj ? `${String(dObj.getDate()).padStart(2, '0')}-${String(dObj.getMonth() + 1).padStart(2, '0')}-${dObj.getFullYear()}` : '-');
        const receivableAmount = num(saved.receivableAmount);
        const paidAmount = num(saved.paidAmount);
        const balance = Math.round((receivableAmount - paidAmount) * 100) / 100;

        entries.push({
          id: saved._id ? String(saved._id) : `${truckNo}_${targetMonth}_${targetYear}`,
          truckNo,
          ownerName,
          vehicleType,
          roadTaxValidity: taxValRaw,
          renewStatus,
          renewDate,
          receivableAmount,
          paidAmount,
          balance,
          pdfUrl: saved.pdfUrl || '',
          pdfName: saved.pdfName || ''
        });
      }
    });

    // Search filter
    if (search && search.trim()) {
      const term = search.toLowerCase().trim();
      entries = entries.filter(e =>
        e.truckNo.toLowerCase().includes(term) ||
        e.ownerName.toLowerCase().includes(term) ||
        e.vehicleType.toLowerCase().includes(term)
      );
    }

    // Attach SL NO (1..N)
    const formattedEntries = entries.map((e, idx) => ({
      slNo: idx + 1,
      ...e
    }));

    res.json({
      success: true,
      month: targetMonth,
      year: targetYear,
      count: formattedEntries.length,
      entries: formattedEntries
    });
  } catch (err) {
    console.error('[RoadTax] Fetch error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/road-tax/save ──────────────────────────────────────────────────
router.post('/save', async (req, res) => {
  try {
    const { truckNo, month, year, renewStatus, renewDate, receivableAmount, paidAmount, pdfUrl, pdfName } = req.body;

    if (!truckNo || !month || !year) {
      return res.status(400).json({ success: false, error: 'Truck No, month, and year are required.' });
    }

    const roadTaxCol = getRoadTaxCollection();
    const key = `${String(truckNo).trim().toUpperCase()}_${parseInt(month, 10)}_${parseInt(year, 10)}`;

    const recAmt = num(receivableAmount);
    const pAmt = num(paidAmount);
    const bal = Math.round((recAmt - pAmt) * 100) / 100;

    const updateData = {
      truckNo: String(truckNo).trim().toUpperCase(),
      month: parseInt(month, 10),
      year: parseInt(year, 10),
      renewStatus: renewStatus || 'PENDING',
      renewDate: renewDate || '',
      receivableAmount: recAmt,
      paidAmount: pAmt,
      balance: bal,
      updatedAt: new Date()
    };

    if (pdfUrl !== undefined) updateData.pdfUrl = pdfUrl;
    if (pdfName !== undefined) updateData.pdfName = pdfName;

    await roadTaxCol.updateOne(
      { key },
      { $set: { key, ...updateData } },
      { upsert: true }
    );

    res.json({ success: true, message: 'Road Tax record updated successfully.' });
  } catch (err) {
    console.error('[RoadTax] Save error:', err);
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
    console.error('[RoadTax] PDF Upload error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
