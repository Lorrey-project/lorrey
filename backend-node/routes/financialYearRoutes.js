const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const FinancialYearPayment = require('../models/FinancialYearPayment');
const FinancialYearRow = require('../models/FinancialYearRow');
const BillRegisterDocument = require('../models/BillRegisterDocument');
const paymentProofUpload = require('../middleware/paymentProofUpload');
const billPdfUpload = require('../middleware/billPdfUpload');

function getCementCol() {
  return mongoose.connection.useDb("cement_register").collection("entries");
}

function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val) ? null : val;

  const str = String(val).trim();

  // ── Detect DD-MM-YYYY (Indian format) — MUST check first ──
  const ddmmyyyy = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddmmyyyy) {
    const d = parseInt(ddmmyyyy[1]), m = parseInt(ddmmyyyy[2]), y = parseInt(ddmmyyyy[3]);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      return new Date(y, m - 1, d);
    }
  }

  // ── Try ISO / standard JS parsing ──
  const iso = new Date(str);
  if (!isNaN(iso.getTime())) return iso;

  return null;
}


const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
];

// Normalize legacy site names to canonical values
function normalizeSite(site) {
  if (!site) return '';
  const s = String(site).trim().toUpperCase();
  if (s === 'NVCL') return 'NVCL';
  if (s === 'NVL') return 'NVL';
  return site.trim();
}

router.get('/data', async (req, res) => {
  try {
    // ── Run all 3 DB reads in PARALLEL ─────────────────────────────
    const CEMENT_PROJECTION = {
      'GCN NO': 1, 'BILL NO': 1, 'INVOICE NO': 1, 'BILLING': 1,
      'LOADING DT': 1, 'LOADING DATE': 1,
      'SITE': 1,
      'BILLING ER 95%': 1, 'BILLING @ 95% (PARTY PAYABLE)': 1,
      'AMOUNT': 1, 'Billing Amount': 1,
      _id: 0
    };

    const [allCement, rowOverrides, payments] = await Promise.all([
      getCementCol().find({}, { projection: CEMENT_PROJECTION }).toArray(),
      FinancialYearRow.find({}).lean(),
      FinancialYearPayment.find({}).lean()
    ]);

    // ── Aggregate cement rows by invoice number AND site ──────────────
    const aggregated = {};
    for (const row of allCement) {
      let invNo = row['BILL NO'];
      if (!invNo) continue;
      invNo = String(invNo).trim();

      const rawSite = normalizeSite(row['SITE']);
      if (rawSite !== 'NVCL' && rawSite !== 'NVL') continue;

      const prefix = rawSite === 'NVCL' ? 'NVCL/' : 'DAC/';
      const cleanInvNo = invNo.replace(/^(DAC|NVCL)\//i, '');
      const finalInvNo = `${prefix}${cleanInvNo}`;

      if (!aggregated[finalInvNo]) {
        const invDate = row['BILL DATE'] || row['LOADING DT'] || row['LOADING DATE'] || '';
        let monthStr = '';
        const dObj = parseDate(invDate);
        if (dObj) {
          const m = dObj.getMonth();
          const yy = String(dObj.getFullYear()).slice(-2);
          monthStr = `${MONTH_NAMES[m]} '${yy}`;
        }
        aggregated[finalInvNo] = { invoiceDate: invDate, invoiceNumber: finalInvNo, month: monthStr, site: rawSite, amount: 0 };
      }

      const amt =
        parseFloat(row['BILLING AMOUNT']) ||
        parseFloat(row['Billing Amount']) ||
        parseFloat(row['BILLING ER 95%']) ||
        parseFloat(row['AMOUNT']) || 0;
      aggregated[finalInvNo].amount += amt;
    }

    // ── Merge overrides (O(1) map lookup) ──────────────────────────
    const rowMap = {};
    for (const r of rowOverrides) rowMap[r.billNo] = r;

    const finalRows = Object.values(aggregated).map(r => {
      const ov = rowMap[r.invoiceNumber] || {};
      if (ov.hidden) return null; // soft-deleted
      return {
        ...r,
        billType: ov.billType ?? 'FREIGHT',
        invoiceDate: ov.editedInvoiceDate ?? r.invoiceDate,
        displayInvoiceNumber: ov.editedInvoiceNumber ?? r.invoiceNumber,
        month: ov.editedMonth ?? r.month,
        site: normalizeSite(ov.editedSite ?? r.site),
        amount: ov.editedAmount ?? r.amount,
        debitReason: ov.debitReason ?? 'None',
        damageMonth: ov.damageMonth,
        damageVehicle: ov.damageVehicle,
        damageTrip: ov.damageTrip
      };
    }).filter(Boolean);

    res.json({ rows: finalRows, payments });
  } catch (err) {
    console.error('[FYDetails] /data error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/save-group', async (req, res) => {
  try {
    const { id, billNos, paymentAmount, paymentDate, referenceNo, debitAmount, remarks, tdsProvision } = req.body;
    await FinancialYearPayment.findOneAndUpdate(
      { id },
      { billNos, paymentAmount, paymentDate, referenceNo, debitAmount, remarks, tdsProvision },
      { upsert: true, returnDocument: 'after' }
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Soft-delete: marks selected invoice numbers as hidden
router.post('/delete-rows', async (req, res) => {
  try {
    const { billNos } = req.body; // array of invoiceNumbers to delete
    if (!Array.isArray(billNos) || billNos.length === 0)
      return res.status(400).json({ error: 'No bill numbers provided' });

    await Promise.all(billNos.map(billNo =>
      FinancialYearRow.findOneAndUpdate(
        { billNo },
        { $set: { hidden: true } },
        { upsert: true }
      )
    ));
    res.json({ success: true, deleted: billNos.length });
  } catch (err) {
    console.error('[FYDetails] /delete-rows error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


router.post('/upload-proof', paymentProofUpload.single('proof'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const { id } = req.body;
    if (id) {
      await FinancialYearPayment.findOneAndUpdate(
        { id },
        { paymentProofUrl: req.file.location },
        { upsert: true, returnDocument: 'after' }
      );
    }
    res.json({ message: "Proof saved successfully", url: req.file.location });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

router.post('/save-row', async (req, res) => {
  try {
    const { 
      billNo, billType, editedInvoiceDate, editedInvoiceNumber, editedMonth, 
      editedSite, editedAmount, debitReason, damageYear, damageMonth, 
      damageVehicles, damageTrips, damageVehicleAmounts 
    } = req.body;
    let updateObj = {};
    if (billType !== undefined) updateObj.billType = billType;
    if (editedInvoiceDate !== undefined) updateObj.editedInvoiceDate = editedInvoiceDate;
    if (editedInvoiceNumber !== undefined) updateObj.editedInvoiceNumber = editedInvoiceNumber;
    if (editedMonth !== undefined) updateObj.editedMonth = editedMonth;
    if (editedSite !== undefined) updateObj.editedSite = editedSite;
    if (editedAmount !== undefined) updateObj.editedAmount = parseFloat(editedAmount) || 0;
    if (debitReason !== undefined) updateObj.debitReason = debitReason;
    if (damageYear !== undefined) updateObj.damageYear = damageYear;
    if (damageMonth !== undefined) updateObj.damageMonth = damageMonth;
    if (damageVehicles !== undefined) updateObj.damageVehicles = damageVehicles;
    if (damageTrips !== undefined) updateObj.damageTrips = damageTrips;
    if (damageVehicleAmounts !== undefined) updateObj.damageVehicleAmounts = damageVehicleAmounts;

    await FinancialYearRow.findOneAndUpdate(
      { billNo },
      { $set: updateObj },
      { upsert: true, returnDocument: 'after' }
    );

    // --- Cement Register Deductions Override Logic ---
    if (debitReason && damageVehicles && damageTrips && damageVehicleAmounts) {
      const cementCol = mongoose.connection.useDb("cement_register").collection("entries");
      
      for (const vehicle of damageVehicles) {
        const amountStr = damageVehicleAmounts[vehicle];
        const manualAmt = parseFloat(String(amountStr).replace(/,/g, '')) || 0;
        
        const vTrips = damageTrips.filter(t => t.vehicle === vehicle);
        if (vTrips.length === 0) continue;
        
        const conditions = vTrips.map(t => ({
          $or: [ { 'VEHICLE NUMBER': t.vehicle }, { 'VEHICLE NO': t.vehicle } ],
          "TRIP NUMBER": parseInt(t.tripNumber)
        }));
        
        const dbTrips = await cementCol.find({ $or: conditions }).toArray();
        if (dbTrips.length === 0) continue;
        
        let projectedCol = '';
        if (debitReason === 'Damage / Shortage') projectedCol = 'SHORTAGE AMOUNT';
        else if (debitReason === 'GPS Trip Charges') projectedCol = 'GPS MONITORING CHARGE';
        else if (debitReason === 'GPS Deviation Charges') projectedCol = 'GPS MONITORING CHARGE';
        else if (debitReason === 'Device Installation Charges') projectedCol = 'GPS DEVICE';
        else if (debitReason === 'RFID Deduction / Charges' || debitReason === 'Substance') projectedCol = 'OTHERS DEDUCTION';
        
        if (!projectedCol) continue;
        
        let projectedSum = 0;
        for (const tr of dbTrips) {
          projectedSum += (parseFloat(String(tr[projectedCol] || '0').replace(/,/g, '')) || 0);
        }
        
        if (manualAmt > projectedSum) {
          const splitAmt = manualAmt / dbTrips.length;
          
          for (const tr of dbTrips) {
            const overridePath = `deductionsOverride.${debitReason}`;
            const projVal = parseFloat(String(tr[projectedCol] || '0').replace(/,/g, '')) || 0;
            const updateDoc = {
              $set: {
                [overridePath]: {
                  projected: projVal,
                  actual: splitAmt,
                  billRegisterRef: billNo,
                  timestamp: new Date()
                }
              }
            };
            await cementCol.updateOne({ _id: tr._id }, updateDoc);
          }
        }
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/documents', async (req, res) => {
  try {
    const docs = await BillRegisterDocument.find({}).sort({ createdAt: -1 });
    res.json(docs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

router.post('/upload-document', billPdfUpload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const newDoc = new BillRegisterDocument({
      fileUrl: req.file.location,
      fileName: req.file.originalname
    });
    await newDoc.save();
    
    res.json({ message: "Document uploaded successfully", doc: newDoc });
  } catch (err) {
    console.error('[FYDetails] /upload-document error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

router.delete('/delete-document/:id', async (req, res) => {
  try {
    await BillRegisterDocument.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Document deleted successfully' });
  } catch (err) {
    console.error('[FYDetails] /delete-document error:', err);
    res.status(500).json({ error: 'Delete failed' });
  }
});

router.get('/vehicles', async (req, res) => {
  try {
    const { month, fy } = req.query; // Expecting number 1-12
    if (!month) return res.status(400).json({ error: 'Month is required' });
    
    let yearRegexPart = '';
    if (fy) {
      const parts = fy.split('-');
      if (parts.length === 2) {
        let startY = parseInt(parts[0]);
        let endY = parseInt(parts[1]);
        if (startY < 100) startY += 2000;
        if (endY < 100) endY += 2000;
        const m = parseInt(month);
        const calendarYear = (m >= 4) ? startY : endY;
        const yrStr = String(calendarYear);
        const yr2 = yrStr.slice(-2);
        yearRegexPart = `(${yrStr}|${yr2})`;
      }
    }
    
    const monthStr = String(month).padStart(2, '0');
    const dateRegex = new RegExp(`^\\d{2}[-/\\.]${monthStr}[-/\\.]${yearRegexPart}`);
    const match = {
      $or: [
        { "LOADING DT": dateRegex },
        { "LOADING DATE": dateRegex },
        { "BILL DATE": dateRegex }
      ]
    };
    
    const vehicles = await getCementCol().distinct('VEHICLE NUMBER', match);
    const v2 = await getCementCol().distinct('VEHICLE NO', match);
    const allV = [...new Set([...vehicles, ...v2])].filter(Boolean);
    res.json(allV);
  } catch (err) {
    console.error('[FYDetails] /vehicles error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/trips', async (req, res) => {
  try {
    const { month, vehicle, fy } = req.query;
    if (!month || !vehicle) return res.status(400).json({ error: 'Month and vehicle are required' });
    
    const vehiclesArray = vehicle.split(',');
    
    let yearRegexPart = '';
    if (fy) {
      const parts = fy.split('-');
      if (parts.length === 2) {
        let startY = parseInt(parts[0]);
        let endY = parseInt(parts[1]);
        if (startY < 100) startY += 2000;
        if (endY < 100) endY += 2000;
        const m = parseInt(month);
        const calendarYear = (m >= 4) ? startY : endY;
        const yrStr = String(calendarYear);
        const yr2 = yrStr.slice(-2);
        yearRegexPart = `(${yrStr}|${yr2})`;
      }
    }
    
    const monthStr = String(month).padStart(2, '0');
    const dateRegex = new RegExp(`^\\d{2}[-/\\.]${monthStr}[-/\\.]${yearRegexPart}`);
    const match = { 
      $or: [ { 'VEHICLE NUMBER': { $in: vehiclesArray } }, { 'VEHICLE NO': { $in: vehiclesArray } } ],
      $and: [
        {
          $or: [
            { "LOADING DT": dateRegex },
            { "LOADING DATE": dateRegex },
            { "BILL DATE": dateRegex }
          ]
        }
      ]
    };
    
    const trips = await getCementCol().find(match).toArray();
    
    const parseCustomDate = (dStr) => {
      if (!dStr) return 0;
      const parts = dStr.split(/[-/\\.]/);
      if (parts.length >= 3) {
        const [day, month, year] = parts;
        let y = parseInt(year);
        if (y < 100) y += 2000;
        return new Date(y, parseInt(month)-1, parseInt(day)).getTime();
      }
      return 0;
    };
    
    const formatted = trips.map(t => ({
      invoiceNo: t['INVOICE NO'] || t['BILL NO'] || 'Unknown',
      tripDate: t['LOADING DT'] || t['LOADING DATE'] || t['BILL DATE'] || 'Unknown',
      plant: t['PLANT'] || t['FROM'] || 'Unknown',
      destination: t['DESTINATION'] || t['TO'] || 'Unknown',
      vehicle: vehicle
    }));
    
    formatted.sort((a, b) => parseCustomDate(a.tripDate) - parseCustomDate(b.tripDate));
    
    const finalFormatted = formatted.map((t, idx) => ({ ...t, tripNumber: idx + 1 }));
    res.json(finalFormatted);
  } catch (err) {
    console.error('[FYDetails] /trips error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
