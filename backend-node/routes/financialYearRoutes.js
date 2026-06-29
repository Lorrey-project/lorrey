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

  // ── Detect DD-MM-YYYY or DD/MM/YYYY (Indian format) — MUST check first ──
  const ddmmyyyy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (ddmmyyyy) {
    const d = parseInt(ddmmyyyy[1]), m = parseInt(ddmmyyyy[2]), y = parseInt(ddmmyyyy[3]);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      return new Date(y, m - 1, d); // local time
    }
  }

  // ── Try ISO / standard JS parsing ──
  const iso = new Date(str);
  if (!isNaN(iso.getTime())) return iso;

  return null;
}


function getMonthIndexFromDate(dateStr) {
  const d = parseDate(dateStr);
  if (d) return d.getMonth() + 1;
  return 99;
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
    const { fy } = req.query;
    let startYear = null;
    if (fy) {
      const parts = fy.split('-');
      if (parts.length === 2) {
        let sy = parseInt(parts[0], 10);
        if (sy < 100) sy += 2000;
        startYear = sy;
      }
    }
    if (!startYear) {
      const now = new Date();
      startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    }

    const shortCode = `${String(startYear).slice(-2)}-${String(startYear + 1).slice(-2)}`;

    // ── Run all 3 DB reads in PARALLEL ─────────────────────────────
    const CEMENT_PROJECTION = {
      'GCN NO': 1, 'BILL NO': 1, 'INVOICE NO': 1, 'INVOICE NO.': 1, 'BILLING': 1,
      'LOADING DT': 1, 'LOADING DATE': 1,
      'BILL DATE': 1,
      'SITE': 1,
      'BILLING ER 95%': 1, 'BILLING @ 95% (PARTY PAYABLE)': 1,
      'AMOUNT': 1, 'Billing Amount': 1,
      'VEHICLE NUMBER': 1, 'VEHICLE NO': 1,
      'PARTY NAME': 1,
      _id: 0
    };

    const [allCement, rowOverrides, payments] = await Promise.all([
      getCementCol().find({}, { projection: CEMENT_PROJECTION }).toArray(),
      FinancialYearRow.find({}).lean(),
      FinancialYearPayment.find({}).lean()
    ]);

    // Filter cement entries by financial year
    const filteredCement = allCement.filter(row => {
      // 1. Try to parse date
      const invDate = row['BILL DATE'] || row['LOADING DT'] || row['LOADING DATE'] || '';
      const dObj = parseDate(invDate);
      if (dObj) {
        const y = dObj.getFullYear();
        const m = dObj.getMonth() + 1;
        if (m >= 4 && y === startYear) return true;
        if (m <= 3 && y === startYear + 1) return true;
        return false;
      }
      // 2. Fallback: check if BILL NO contains the short year
      const invNo = row['BILL NO'] || row['INVOICE NO'];
      if (invNo) {
        if (String(invNo).includes(shortCode)) return true;
      }
      return false;
    });

    // Filter payments by financial year (checking if any associated bill matches shortCode)
    const filteredPayments = payments.filter(p => {
      if (!p.billNos || p.billNos.length === 0) return false;
      return p.billNos.some(b => String(b).includes(shortCode));
    });

    // ── Aggregate cement rows by invoice number AND site ──────────────
    const aggregated = {};
    for (const row of filteredCement) {
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
        aggregated[finalInvNo] = {
          invoiceDate: invDate,
          invoiceNumber: finalInvNo,
          month: monthStr,
          site: rawSite,
          amount: 0,
          invoiceNos: new Set(),
          vehicleNumbers: new Set(),
          partyNames: new Set()
        };
      }

      const amt =
        parseFloat(row['BILLING AMOUNT']) ||
        parseFloat(row['Billing Amount']) ||
        parseFloat(row['BILLING ER 95%']) ||
        parseFloat(row['AMOUNT']) || 0;
      aggregated[finalInvNo].amount += amt;

      const singleInvNo = row['INVOICE NO'] || row['INVOICE NO.'] || '';
      if (singleInvNo) aggregated[finalInvNo].invoiceNos.add(String(singleInvNo).trim());

      const singleVeh = row['VEHICLE NUMBER'] || row['VEHICLE NO'] || '';
      if (singleVeh) aggregated[finalInvNo].vehicleNumbers.add(String(singleVeh).trim());

      const singleParty = row['PARTY NAME'] || '';
      if (singleParty) aggregated[finalInvNo].partyNames.add(String(singleParty).trim());
    }

    // ── Merge overrides and manual rows ──────────────────────────
    const rowMap = {};
    for (const r of rowOverrides) rowMap[r.billNo] = r;

    const finalRows = [];
    const processedBillNos = new Set();

    // 1. Process all aggregated rows from cement register
    for (const r of Object.values(aggregated)) {
      const invNo = r.invoiceNumber;
      processedBillNos.add(invNo);
      const ov = rowMap[invNo] || {};
      if (ov.hidden) continue; // soft-deleted

      finalRows.push({
        ...r,
        billType: ov.billType ?? 'FREIGHT',
        invoiceDate: ov.editedInvoiceDate ?? r.invoiceDate,
        displayInvoiceNumber: ov.editedInvoiceNumber ?? r.invoiceNumber,
        month: ov.editedMonth ?? r.month,
        site: normalizeSite(ov.editedSite ?? r.site),
        amount: ov.editedAmount ?? r.amount,
        debitReason: ov.debitReason ?? 'None',
        // Damage / Shortage modal fields
        damageYear: ov.damageYear,
        damageMonth: ov.damageMonth,
        damageVehicles: ov.damageVehicles || [],
        damageTrips: ov.damageTrips || [],
        damageVehicleAmounts: ov.damageVehicleAmounts || {},
        // Legacy singular fields for backward compat
        damageVehicle: ov.damageVehicle,
        damageTrip: ov.damageTrip,
        isManual: false,
        slNo: ov.slNo,
        // Convert sets to arrays
        invoiceNos: Array.from(r.invoiceNos).filter(Boolean),
        vehicleNumbers: Array.from(r.vehicleNumbers).filter(Boolean),
        partyNames: Array.from(r.partyNames).filter(Boolean)
      });
    }

    // 2. Process all manual rows that exist only in rowOverrides
    for (const ov of rowOverrides) {
      if (processedBillNos.has(ov.billNo)) continue;
      if (ov.hidden) continue; // soft-deleted

      // Filter manual rows by financial year if a filter is active
      if (shortCode) {
        let matchYear = false;
        const invDate = ov.editedInvoiceDate || '';
        const dObj = parseDate(invDate);
        if (dObj) {
          const y = dObj.getFullYear();
          const m = dObj.getMonth() + 1;
          if (m >= 4 && y === startYear) matchYear = true;
          if (m <= 3 && y === startYear + 1) matchYear = true;
        } else if (ov.billNo.includes(shortCode)) {
          matchYear = true;
        }
        if (!matchYear) continue; // Skip if it doesn't match the selected financial year
      }

      finalRows.push({
        invoiceDate: ov.editedInvoiceDate || '',
        invoiceNumber: ov.billNo,
        displayInvoiceNumber: ov.editedInvoiceNumber || ov.billNo,
        month: ov.editedMonth || '',
        site: normalizeSite(ov.editedSite || ''),
        amount: ov.editedAmount || 0,
        billType: ov.billType ?? 'FREIGHT',
        debitReason: ov.debitReason ?? 'None',
        damageYear: ov.damageYear,
        damageMonth: ov.damageMonth,
        damageVehicles: ov.damageVehicles || [],
        damageTrips: ov.damageTrips || [],
        damageVehicleAmounts: ov.damageVehicleAmounts || {},
        damageVehicle: ov.damageVehicle,
        damageTrip: ov.damageTrip,
        isManual: true,
        slNo: ov.slNo,
        invoiceNos: [],
        vehicleNumbers: [],
        partyNames: []
      });
    }

    // 3. Sort finalRows by default order first (month name, then date)
    finalRows.sort((a, b) => {
      const mA = getMonthIndexFromDate(a.invoiceDate);
      const mB = getMonthIndexFromDate(b.invoiceDate);
      if (mA !== mB) return mA - mB;
      return (a.invoiceDate || '').localeCompare(b.invoiceDate || '') || (a.invoiceNumber || '').localeCompare(b.invoiceNumber || '');
    });

    // 4. Assign default slNo to rows without one, and respect stored slNo
    for (let i = 0; i < finalRows.length; i++) {
      if (finalRows[i].slNo === undefined || finalRows[i].slNo === null) {
        finalRows[i].slNo = i + 1;
      }
    }

    // 5. Final sort by slNo
    finalRows.sort((a, b) => a.slNo - b.slNo);

    res.json({ rows: finalRows, payments: filteredPayments });
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
      damageVehicles, damageTrips, damageVehicleAmounts, slNo
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
    if (slNo !== undefined) updateObj.slNo = parseFloat(slNo) || 0;

    await FinancialYearRow.findOneAndUpdate(
      { billNo },
      { $set: updateObj },
      { upsert: true, returnDocument: 'after' }
    );

    // --- Cement Register Deductions Override Logic ---
    if (debitReason && damageTrips && damageVehicleAmounts) {
      const cementCol = mongoose.connection.useDb("cement_register").collection("entries");

      // 1. Clear any existing overrides in cement register for this bill across all possible reasons to avoid stale data
      const ALL_REASONS = ['Damage / Shortage', 'GPS Trip Charges', 'GPS Deviation Charges', 'Device Installation Charges', 'RFID Deduction / Charges', 'Substance'];
      for (const reason of ALL_REASONS) {
        const overridePath = `deductionsOverride.${reason}`;
        await cementCol.updateMany(
          { [`${overridePath}.billRegisterRef`]: billNo },
          { $unset: { [overridePath]: "" } }
        );
      }

      // Determine projected column based on debit reason
      let projectedCol = '';
      if (debitReason === 'Damage / Shortage') projectedCol = 'SHORTAGE AMOUNT';
      else if (debitReason === 'GPS Trip Charges') projectedCol = 'GPS MONITORING CHARGE';
      else if (debitReason === 'GPS Deviation Charges') projectedCol = 'GPS MONITORING CHARGE';
      else if (debitReason === 'Device Installation Charges') projectedCol = 'GPS DEVICE';
      else if (debitReason === 'RFID Deduction / Charges' || debitReason === 'Substance') projectedCol = 'OTHERS DEDUCTION';

      if (projectedCol) {
        // 2. Set new overrides for the selected trips
        for (const t of damageTrips) {
          const amountVal = damageVehicleAmounts[t.invoiceNo];
          const manualAmt = parseFloat(String(amountVal).replace(/,/g, '')) || 0;

          // Find the exact trip in the cement register
          const query = {
            $or: [
              { 'VEHICLE NUMBER': t.vehicle },
              { 'VEHICLE NO': t.vehicle }
            ],
            $or: [
              { 'INVOICE NO': t.invoiceNo },
              { 'BILL NO': t.invoiceNo }
            ]
          };

          const dbTrip = await cementCol.findOne(query);
          if (dbTrip) {
            const projVal = parseFloat(String(dbTrip[projectedCol] || '0').replace(/,/g, '')) || 0;
            const overridePath = `deductionsOverride.${debitReason}`;
            const updateDoc = {
              $set: {
                [overridePath]: {
                  projected: projVal,
                  actual: manualAmt,
                  billRegisterRef: billNo,
                  timestamp: new Date()
                }
              }
            };
            await cementCol.updateOne({ _id: dbTrip._id }, updateDoc);
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
      $or: [{ 'VEHICLE NUMBER': { $in: vehiclesArray } }, { 'VEHICLE NO': { $in: vehiclesArray } }],
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
        return new Date(y, parseInt(month) - 1, parseInt(day)).getTime();
      }
      return 0;
    };

    const formatted = trips.map(t => ({
      invoiceNo: t['INVOICE NO'] || t['BILL NO'] || 'Unknown',
      tripDate: t['LOADING DT'] || t['LOADING DATE'] || t['BILL DATE'] || 'Unknown',
      plant: t['PLANT'] || t['FROM'] || 'Unknown',
      destination: t['DESTINATION'] || t['TO'] || 'Unknown',
      vehicle: t['VEHICLE NUMBER'] || t['VEHICLE NO'] || vehicle
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
