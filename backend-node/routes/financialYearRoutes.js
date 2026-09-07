const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const FinancialYearPayment = require('../models/FinancialYearPayment');
const FinancialYearRow = require('../models/FinancialYearRow');
const BillRegisterDocument = require('../models/BillRegisterDocument');
const ProjectedDeductionSetting = require('../models/ProjectedDeductionSetting');
const paymentProofUpload = require('../middleware/paymentProofUpload');
const billPdfUpload = require('../middleware/billPdfUpload');
const multer = require('multer');
const memoryPdfUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const { parsePdfBillRegister } = require('../utils/pdfBillRegisterParser');

function getCementCol() {
  return mongoose.connection.useDb("cement_register").collection("entries");
}
function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val) ? null : val;

  const rawStr = String(val).trim();
  const str = rawStr.split('T')[0].split(' ')[0].trim();

  // ── Detect DD-MM-YYYY or DD/MM/YYYY (Indian format) — MUST check first ──
  const ddmmyyyy = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (ddmmyyyy) {
    let d = parseInt(ddmmyyyy[1], 10), m = parseInt(ddmmyyyy[2], 10), y = parseInt(ddmmyyyy[3], 10);
    if (y < 100) y += 2000;
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      return new Date(y, m - 1, d);
    }
  }

  // ── Detect YYYY-MM-DD or YYYY/MM/DD (ISO format) ──
  const yyyymmdd = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (yyyymmdd) {
    let y = parseInt(yyyymmdd[1], 10), m = parseInt(yyyymmdd[2], 10), d = parseInt(yyyymmdd[3], 10);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      return new Date(y, m - 1, d);
    }
  }

  // ── Try ISO / standard JS parsing ──
  const iso = new Date(rawStr);
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

router.post('/validate-deduction', async (req, res) => {
  try {
    const { reasons, year, month, trips, currentBillNo } = req.body;

    if (!reasons || reasons.length === 0) return res.json({ valid: true });

    const cementCol = getCementCol();

    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthIdx = MONTHS.findIndex(m => month.startsWith(m)) + 1;
    let yearRegexPart = '';
    if (year) {
      const parts = year.split('-');
      if (parts.length === 2) {
        let startY = parseInt(parts[0]);
        let endY = parseInt(parts[1]);
        if (startY < 100) startY += 2000;
        if (endY < 100) endY += 2000;
        const calendarYear = (monthIdx >= 4) ? startY : endY;
        const yrStr = String(calendarYear);
        const yr2 = yrStr.slice(-2);
        yearRegexPart = `(${yrStr}|${yr2})`;
      }
    }
    const monthStr = String(monthIdx).padStart(2, '0');
    const dateRegex = new RegExp(`^\\d{2}[-/\\.]${monthStr}[-/\\.]${yearRegexPart}`);

    for (const t of trips) {
      const tripsQuery = {
        $or: [{ 'VEHICLE NUMBER': t.vehicle }, { 'VEHICLE NO': t.vehicle }],
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

      const dbTrips = await cementCol.find(tripsQuery).toArray();

      const parseCustomDate = (dStr) => {
        if (!dStr) return 0;
        const parts = String(dStr).split(/[-/\\.]/);
        if (parts.length >= 3) {
          const [day, m, y] = parts;
          let yr = parseInt(y);
          if (yr < 100) yr += 2000;
          return new Date(yr, parseInt(m) - 1, parseInt(day)).getTime();
        }
        return 0;
      };

      dbTrips.sort((a, b) => {
        const dateA = parseCustomDate(a['LOADING DT'] || a['LOADING DATE'] || a['BILL DATE'] || 'Unknown');
        const dateB = parseCustomDate(b['LOADING DT'] || b['LOADING DATE'] || b['BILL DATE'] || 'Unknown');
        return dateA - dateB;
      });

      let dbTrip = null;
      if (t.tripNumber && dbTrips[t.tripNumber - 1]) {
        dbTrip = dbTrips[t.tripNumber - 1];
      } else {
        const query = {
          $and: [
            { $or: [{ 'VEHICLE NUMBER': t.vehicle }, { 'VEHICLE NO': t.vehicle }] },
            {
              $or: [
                { 'LOADING DT': t.tripDate }, { 'LOADING DATE': t.tripDate },
                { 'BILL DATE': t.tripDate }, { 'RECEIVING DATE': t.tripDate },
                { 'DATE': t.tripDate }, { 'INVOICE DATE': t.tripDate }
              ]
            }
          ]
        };
        dbTrip = await cementCol.findOne(query);
      }

      if (dbTrip) {
        for (const reason of reasons) {
          let projectedCol = '';
          if (reason === 'Damage / Shortage') projectedCol = 'SHORTAGE (AMOUNT)';
          else if (reason === 'GPS Trip Charges') projectedCol = 'GPS Trip Charges';
          else if (reason === 'GPS Deviation Charges') projectedCol = 'GPS Deviation Charges';
          else if (reason === 'Device Installation Charges') projectedCol = 'Give GPS DEVICE';
          else if (reason === 'RFID Deduction / Charges') projectedCol = 'Give RFID TAG';
          else if (reason === 'Suspense') projectedCol = 'Suspense';

          if (!projectedCol) continue;

          const override = dbTrip.deductionsOverride && dbTrip.deductionsOverride[reason];
          if (override) {
            if (override.billRegisterRef !== currentBillNo) {
              return res.json({ valid: false, message: `Trip ${t.tripNumber || ''} (${t.vehicle}) already has a deduction for "${reason}" in another invoice (${override.billRegisterRef}).` });
            }
          } else {
            const val = parseFloat(String(dbTrip[projectedCol] || '0').replace(/,/g, '')) || 0;
            if (val > 0) {
              return res.json({ valid: false, message: `Trip ${t.tripNumber || ''} (${t.vehicle}) already has a manual deduction for "${reason}" in the Cement Register.` });
            }
          }
        }
      }
    }

    return res.json({ valid: true });
  } catch (err) {
    console.error("Validation error:", err);
    res.status(500).json({ valid: false, message: "Server error validating deduction." });
  }
});

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
      'GCN NO': 1, 'BILL NO': 1, 'INVOICE NO': 1, 'BILLING': 1,
      'LOADING DT': 1, 'LOADING DATE': 1,
      'BILL DATE': 1,
      'SITE': 1,
      'BILLING ER 95%': 1, 'BILLING @ 95% (PARTY PAYABLE)': 1,
      'AMOUNT': 1, 'Billing Amount': 1,
      'VEHICLE NUMBER': 1, 'VEHICLE NO': 1,
      'PARTY NAME': 1,
      'CHALLAN STATUS': 1,
      'UNLOADING BILL NO': 1, 'UNLOADING BILL DATE': 1,
      'EXTRA UNLOADING': 1,
      'Freight Generated': 1, 'Unloading Generated': 1,
      'SHIPMENT NO': 1, 'month': 1, 'Month': 1,
      _id: 0
    };

    const [allCement, rowOverrides, payments] = await Promise.all([
      getCementCol().find({}, { projection: CEMENT_PROJECTION }).toArray(),
      FinancialYearRow.find({}).lean(),
      FinancialYearPayment.find({}).lean()
    ]);

    // Filter cement entries by financial year based strictly on Bill Date
    const filteredCement = allCement.filter(row => {
      if (String(row['CHALLAN STATUS']).toUpperCase().trim() !== 'BILLED') return false;

      const fInvDate = row['BILL DATE'] || row['LOADING DT'] || row['LOADING DATE'] || '';
      const uInvDate = row['UNLOADING BILL DATE'] || '';

      for (const d of [fInvDate, uInvDate]) {
        if (!d) continue;
        const dObj = parseDate(d);
        if (dObj) {
          const y = dObj.getFullYear();
          const m = dObj.getMonth() + 1;
          // Financial year: April 1 to March 31
          if (m >= 4 && y === startYear) return true;
          if (m <= 3 && y === startYear + 1) return true;
        }
      }
      return false;
    });

    // ── Aggregate cement rows by invoice number AND site ──────────────
    const aggregated = {};

    const addBillToAggregated = (invNo, invDate, amount, row, defaultBillType) => {
      if (!invNo) return;
      invNo = String(invNo).trim();

      const rawSite = normalizeSite(row['SITE']);
      if (rawSite !== 'NVCL' && rawSite !== 'NVL') return;

      const prefix = rawSite === 'NVCL' ? 'NVCL-' : 'DAC-';
      const cleanInvNo = invNo.replace(/^(DAC|NVCL)[\/\-]/i, '').replace(/\//g, '-');
      const finalInvNo = `${prefix}${cleanInvNo}`;

      // Strictly check if THIS specific bill's date falls in the financial year
      if (startYear) {
        let matchYear = false;
        const dObj = parseDate(invDate);
        if (dObj) {
          const y = dObj.getFullYear();
          const m = dObj.getMonth() + 1;
          if (m >= 4 && y === startYear) matchYear = true;
          if (m <= 3 && y === startYear + 1) matchYear = true;
        }
        if (!matchYear) return;
      }

      if (!aggregated[finalInvNo]) {
        let monthStr = '';
        const rawMonth = parseInt(row.month || row.Month, 10);
        if (rawMonth >= 1 && rawMonth <= 12) {
          monthStr = MONTH_NAMES[rawMonth - 1];
        } else {
          const dObj = parseDate(invDate);
          if (dObj) {
            const m = dObj.getMonth();
            const yy = String(dObj.getFullYear()).slice(-2);
            monthStr = `${MONTH_NAMES[m]} '${yy}`;
          }
        }
        aggregated[finalInvNo] = {
          invoiceDate: invDate,
          invoiceNumber: finalInvNo,
          month: monthStr,
          site: rawSite,
          amount: 0,
          billType: defaultBillType,
          invoiceNos: new Set(),
          vehicleNumbers: new Set(),
          partyNames: new Set(),
          shipmentNos: new Set()
        };
      }

      aggregated[finalInvNo].amount += amount;

      const singleInvNo = row['INVOICE NO'] || row['INVOICE NO.'] || '';
      if (singleInvNo) aggregated[finalInvNo].invoiceNos.add(String(singleInvNo).trim());

      const singleVeh = row['VEHICLE NUMBER'] || row['VEHICLE NO'] || '';
      if (singleVeh) aggregated[finalInvNo].vehicleNumbers.add(String(singleVeh).trim());

      const singleParty = row['PARTY NAME'] || '';
      if (singleParty) aggregated[finalInvNo].partyNames.add(String(singleParty).trim());

      const singleShipment = row['SHIPMENT NO'] || '';
      if (singleShipment) aggregated[finalInvNo].shipmentNos.add(String(singleShipment).trim());
    };

    for (const row of filteredCement) {
      if (row['BILL NO']) {
        const fAmt = parseFloat(row['BILLING AMOUNT']) || parseFloat(row['Billing Amount']) || parseFloat(row['BILLING ER 95%']) || parseFloat(row['AMOUNT']) || 0;
        const fDate = row['BILL DATE'] || row['LOADING DT'] || row['LOADING DATE'] || '';
        addBillToAggregated(row['BILL NO'], fDate, fAmt, row, 'FREIGHT');
      }

      if (row['UNLOADING BILL NO']) {
        const uAmt = parseFloat(row['EXTRA UNLOADING']) || 0;
        const uDate = row['UNLOADING BILL DATE'] || '';
        addBillToAggregated(row['UNLOADING BILL NO'], uDate, uAmt, row, 'UNLOADING');
      }
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
        isGeneratedFromCementRegister: true,
        isLocked: true,
        billType: ov.billType ?? r.billType ?? 'FREIGHT',
        invoiceDate: ov.editedInvoiceDate ?? r.invoiceDate,
        displayInvoiceNumber: ov.editedInvoiceNumber ?? r.invoiceNumber,
        month: ov.editedMonth ?? r.month,
        site: normalizeSite(ov.editedSite ?? r.site),
        amount: ov.editedAmount ?? r.amount,
        debitReason: ov.debitReason ?? 'None',
        debitReasons: ov.debitReasons || (ov.debitReason && ov.debitReason !== 'None' ? [ov.debitReason] : []),
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
        partyNames: Array.from(r.partyNames).filter(Boolean),
        shipmentNos: Array.from(r.shipmentNos).filter(Boolean)
      });
    }

    // 2. Process all manual rows that exist only in rowOverrides
    for (const ov of rowOverrides) {
      if (processedBillNos.has(ov.billNo)) continue;
      if (ov.hidden) continue; // soft-deleted

      // Filter manual rows by financial year strictly based on Bill Date
      if (startYear) {
        let matchYear = false;
        const invDate = ov.editedInvoiceDate || '';
        const dObj = parseDate(invDate);
        if (dObj) {
          const y = dObj.getFullYear();
          const m = dObj.getMonth() + 1;
          if (m >= 4 && y === startYear) matchYear = true;
          if (m <= 3 && y === startYear + 1) matchYear = true;
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
        debitReasons: ov.debitReasons || (ov.debitReason && ov.debitReason !== 'None' ? [ov.debitReason] : []),
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

    // 3. Sort finalRows by actual invoice date timestamp (chronologically ascending)
    finalRows.sort((a, b) => {
      const dA = parseDate(a.invoiceDate);
      const dB = parseDate(b.invoiceDate);
      const tA = dA ? dA.getTime() : 0;
      const tB = dB ? dB.getTime() : 0;
      if (tA !== tB) return tA - tB;
      return (a.invoiceNumber || '').localeCompare(b.invoiceNumber || '');
    });

    // 4. Assign slNo sequentially based on date order
    for (let i = 0; i < finalRows.length; i++) {
      finalRows[i].slNo = i + 1;
    }

    // 6. Filter payments based on whether they belong to the rows generated for this FY
    const finalInvNos = new Set(finalRows.map(r => String(r.invoiceNumber)));
    const filteredPayments = payments.filter(p => {
      if (!p.billNos || p.billNos.length === 0) return false;
      return p.billNos.some(b => finalInvNos.has(String(b)));
    });

    res.json({ rows: finalRows, payments: filteredPayments });
  } catch (err) {
    console.error('[FYDetails] /data error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/pending-bills', async (req, res) => {
  try {
    const { party } = req.query; // 'NVL' or 'NVCL'
    if (!party) return res.status(400).json({ error: 'Party is required' });

    const CEMENT_PROJECTION = {
      'GCN NO': 1, 'BILL NO': 1, 'INVOICE NO': 1, 'BILLING': 1,
      'LOADING DT': 1, 'LOADING DATE': 1,
      'BILL DATE': 1,
      'SITE': 1,
      'BILLING ER 95%': 1, 'BILLING @ 95% (PARTY PAYABLE)': 1,
      'AMOUNT': 1, 'Billing Amount': 1,
      'VEHICLE NUMBER': 1, 'VEHICLE NO': 1,
      'PARTY NAME': 1, 'CHALLAN STATUS': 1,
      'month': 1, 'Month': 1,
      _id: 0
    };

    const [allCement, rowOverrides, payments] = await Promise.all([
      getCementCol().find({ SITE: { $regex: new RegExp(`^${party}$`, 'i') } }, { projection: CEMENT_PROJECTION }).toArray(),
      FinancialYearRow.find({}).lean(),
      FinancialYearPayment.find({}).lean()
    ]);

    // Apply the same aggregation as /data
    const aggregated = {};
    for (const row of allCement) {
      let invNo = row['BILL NO'];
      if (!invNo || String(row['CHALLAN STATUS']).toUpperCase().trim() !== 'BILLED') continue;
      invNo = String(invNo).trim();

      const rawSite = normalizeSite(row['SITE']);
      if (rawSite !== party.toUpperCase()) continue;

      const prefix = rawSite === 'NVCL' ? 'NVCL-' : 'DAC-';
      const cleanInvNo = invNo.replace(/^(DAC|NVCL)[\/\-]/i, '').replace(/\//g, '-');
      const finalInvNo = `${prefix}${cleanInvNo}`;

      if (!aggregated[finalInvNo]) {
        const invDate = row['BILL DATE'] || row['LOADING DT'] || row['LOADING DATE'] || '';
        let monthStr = '';
        const rawMonth = parseInt(row.month || row.Month, 10);
        if (rawMonth >= 1 && rawMonth <= 12) {
          monthStr = MONTH_NAMES[rawMonth - 1];
        } else {
          const dObj = parseDate(invDate);
          if (dObj) {
            const m = dObj.getMonth();
            const yy = String(dObj.getFullYear()).slice(-2);
            monthStr = `${MONTH_NAMES[m]} '${yy}`;
          }
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

    const rowMap = {};
    for (const r of rowOverrides) rowMap[r.billNo] = r;

    const computedRows = [];
    for (const r of Object.values(aggregated)) {
      const invNo = r.invoiceNumber;
      const ov = rowMap[invNo] || {};
      if (ov.hidden) continue;

      const siteUpper = normalizeSite(ov.editedSite ?? r.site).toUpperCase();
      const billUpper = (ov.billType ?? 'FREIGHT').toUpperCase();

      const amt = parseFloat(ov.editedAmount ?? r.amount) || 0;
      const cgst = Math.round((amt * 0.09) * 100) / 100;
      const sgst = Math.round((amt * 0.09) * 100) / 100;
      const totalAmount = amt + cgst + sgst;

      const tdsRate = (siteUpper === 'NVL' && billUpper === 'TOLL') ? 0 : 0.02;
      const tds = Math.round((amt * tdsRate) * 100) / 100;

      const receivable = totalAmount - tds;
      let autoInv = ov.editedInvoiceNumber ?? r.invoiceNumber ?? '';

      const paymentObj = payments.find(p => p.billNos?.includes(r.invoiceNumber));

      computedRows.push({
        invoiceDate: ov.editedInvoiceDate ?? r.invoiceDate,
        invoiceNumber: r.invoiceNumber,
        displayInvoiceNumber: autoInv,
        amount: amt,
        receivable,
        invoiceNos: Array.from(r.invoiceNos).filter(Boolean),
        vehicleNumbers: Array.from(r.vehicleNumbers).filter(Boolean),
        partyNames: Array.from(r.partyNames).filter(Boolean),
        groupId: paymentObj?.id || `AUTO-${r.invoiceNumber}`,
        groupData: paymentObj || {}
      });
    }

    // Process manual rows
    for (const ov of rowOverrides) {
      if (aggregated[ov.billNo] || ov.hidden) continue;
      const siteUpper = normalizeSite(ov.editedSite || '').toUpperCase();
      if (siteUpper !== party.toUpperCase()) continue;

      const billUpper = (ov.billType ?? 'FREIGHT').toUpperCase();
      const amt = parseFloat(ov.editedAmount) || 0;
      const cgst = Math.round((amt * 0.09) * 100) / 100;
      const sgst = Math.round((amt * 0.09) * 100) / 100;
      const totalAmount = amt + cgst + sgst;
      const tdsRate = (siteUpper === 'NVL' && billUpper === 'TOLL') ? 0 : 0.02;
      const tds = Math.round((amt * tdsRate) * 100) / 100;
      const receivable = totalAmount - tds;

      const paymentObj = payments.find(p => p.billNos?.includes(ov.billNo));

      computedRows.push({
        invoiceDate: ov.editedInvoiceDate || '',
        invoiceNumber: ov.billNo,
        displayInvoiceNumber: ov.editedInvoiceNumber || ov.billNo,
        amount: amt,
        receivable,
        invoiceNos: [],
        vehicleNumbers: [],
        partyNames: [],
        groupId: paymentObj?.id || `AUTO-${ov.billNo}`,
        groupData: paymentObj || {}
      });
    }

    // Now calculate pending amounts
    const pendingBills = [];
    const groupRowsMap = {};
    for (const row of computedRows) {
      if (!groupRowsMap[row.groupId]) groupRowsMap[row.groupId] = [];
      groupRowsMap[row.groupId].push(row);
    }

    for (const r of computedRows) {
      const gid = r.groupId;
      const gd = r.groupData || {};

      const groupRows = groupRowsMap[gid];
      const groupTotalRecv = groupRows.reduce((s, x) => s + (x.receivable || 0), 0);

      const paymentAmt = parseFloat(gd.paymentAmount) || 0;
      const debitAmt = parseFloat(gd.debitAmount) || 0;
      const tdsProv = parseFloat(gd.tdsProvision) || 0;

      const isPaid = paymentAmt > 0 && (paymentAmt + debitAmt + tdsProv >= groupTotalRecv - 1);

      let individualAmountPaid = 0;
      let individualOutstanding = r.receivable || 0;
      let status = 'Pending';

      if (isPaid) {
        individualAmountPaid = r.receivable || 0;
        individualOutstanding = 0;
        status = 'Paid';
      } else if (paymentAmt > 0 || debitAmt > 0 || tdsProv > 0) {
        const ratio = groupTotalRecv > 0 ? ((paymentAmt + debitAmt + tdsProv) / groupTotalRecv) : 0;
        individualAmountPaid = (r.receivable || 0) * ratio;
        individualOutstanding = Math.max(0, (r.receivable || 0) - individualAmountPaid);
        if (individualOutstanding < 1) {
          individualOutstanding = 0;
          status = 'Paid';
        }
      }

      if (status === 'Pending') {
        pendingBills.push({
          invoiceNumber: r.invoiceNos.length > 0 ? r.invoiceNos.join(', ') : '—',
          billNumber: r.displayInvoiceNumber,
          rawBillNumber: r.invoiceNumber,
          invoiceDate: r.invoiceDate,
          vehicleNumber: r.vehicleNumbers.length > 0 ? r.vehicleNumbers.join(', ') : '—',
          billAmount: r.receivable || 0,
          amountPaid: individualAmountPaid,
          pendingAmount: individualOutstanding
        });
      }
    }

    pendingBills.sort((a, b) => {
      const dA = parseDate(a.invoiceDate) || new Date(0);
      const dB = parseDate(b.invoiceDate) || new Date(0);
      return dB - dA;
    });

    console.log('Returning pendingBills length:', pendingBills.length);
    res.json({ pendingBills });
  } catch (err) {
    console.error('[FYDetails] /pending-bills error:', err);
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

    // --- Cement Register Deductions Override Logic via Remarks ---
    if (remarks) {
      const cementCol = mongoose.connection.useDb("cement_register").collection("entries");
      const lines = remarks.split('\n');

      for (const line of lines) {
        const match = line.trim().match(/^([a-zA-Z]+)\s*-\s*([A-Z0-9]+)\s*-\s*Trip No\.\s*(\d+)\s*\(([\d\-\.\/]+)\)\s*-\s*(.*?)\s*-\s*₹([\d,\.]+)/i);
        if (match) {
          const monthStrName = match[1];
          const vehicle = match[2];
          const tripNumber = parseInt(match[3], 10);
          const tripDate = match[4];
          const reason = match[5].trim();
          const manualAmt = parseFloat(match[6].replace(/,/g, '')) || 0;

          const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
          const monthIdx = MONTHS.findIndex(m => m.toLowerCase() === monthStrName.toLowerCase()) + 1;

          if (monthIdx > 0) {
            const dateParts = tripDate.split(/[-/.]/);
            if (dateParts.length >= 3) {
              const mm = String(dateParts[1]).padStart(2, '0');
              const yyyy = dateParts[2].length === 2 ? `20${dateParts[2]}` : dateParts[2];
              const yy = yyyy.slice(-2);

              const dateRegex = new RegExp(`^\\d{2}[-/\\.]${mm}[-/\\.](${yyyy}|${yy})`);

              const tripsQuery = {
                $or: [{ 'VEHICLE NUMBER': vehicle }, { 'VEHICLE NO': vehicle }],
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

              const dbTrips = await cementCol.find(tripsQuery).toArray();

              const parseCustomDate = (dStr) => {
                if (!dStr) return 0;
                const parts = String(dStr).split(/[-/\\.]/);
                if (parts.length >= 3) {
                  const [day, m, year] = parts;
                  let y = parseInt(year);
                  if (y < 100) y += 2000;
                  return new Date(y, parseInt(m) - 1, parseInt(day)).getTime();
                }
                return 0;
              };

              dbTrips.sort((a, b) => {
                const dateA = parseCustomDate(a['LOADING DT'] || a['LOADING DATE'] || a['BILL DATE'] || 'Unknown');
                const dateB = parseCustomDate(b['LOADING DT'] || b['LOADING DATE'] || b['BILL DATE'] || 'Unknown');
                return dateA - dateB;
              });

              let dbTrip = null;
              if (tripNumber && dbTrips[tripNumber - 1]) {
                dbTrip = dbTrips[tripNumber - 1];
              } else {
                const exactDateQuery = {
                  $or: [{ 'VEHICLE NUMBER': vehicle }, { 'VEHICLE NO': vehicle }],
                  $or: [
                    { 'LOADING DT': tripDate },
                    { 'LOADING DATE': tripDate },
                    { 'BILL DATE': tripDate },
                    { 'RECEIVING DATE': tripDate },
                    { 'DATE': tripDate },
                    { 'INVOICE DATE': tripDate }
                  ]
                };
                dbTrip = await cementCol.findOne(exactDateQuery);
              }

              if (dbTrip) {
                let projectedCol = '';
                const lowerReason = reason.toLowerCase();
                if (lowerReason.includes('damage') || lowerReason.includes('shortage')) projectedCol = 'SHORTAGE (AMOUNT)';
                else if (lowerReason.includes('gps trip')) projectedCol = 'GPS Monitoring Charge';
                else if (lowerReason.includes('gps deviation')) projectedCol = 'GPS Deviation Charges';
                else if (lowerReason.includes('device installation')) projectedCol = 'Give GPS DEVICE';
                else if (lowerReason.includes('rfid')) projectedCol = 'Give RFID TAG';
                else if (lowerReason.includes('substance')) projectedCol = 'Others deduction';

                if (projectedCol) {
                  const projVal = parseFloat(String(dbTrip[projectedCol] || '0').replace(/,/g, '')) || 0;
                  const overridePath = `deductionsOverride.${reason}`;
                  const updateDoc = {
                    $set: {
                      [overridePath]: {
                        projected: projVal,
                        actual: manualAmt,
                        billRegisterRef: id,
                        timestamp: new Date()
                      },
                      [projectedCol]: manualAmt,
                      'DEDICATED': 'Actual'
                    }
                  };
                  await cementCol.updateOne({ _id: dbTrip._id }, updateDoc);
                }
              }
            }
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

// Soft-delete: marks selected invoice numbers as hidden
router.post('/delete-rows', async (req, res) => {
  try {
    const { billNos } = req.body; // array of invoiceNumbers to delete
    if (!Array.isArray(billNos) || billNos.length === 0)
      return res.status(400).json({ error: 'No bill numbers provided' });

    // Block deletion if any bill is auto-generated
    const cementCol = mongoose.connection.useDb("cement_register").collection("entries");
    for (const billNo of billNos) {
      const isAutoGenerated = await cementCol.findOne({
        $or: [
          { "BILL NO": billNo },
          { "UNLOADING BILL NO": billNo }
        ]
      });
      if (isAutoGenerated) {
        return res.status(403).json({ error: 'Cannot delete auto-generated bills from the Bill Register. Please modify them in the Cement Register.' });
      }
    }

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

router.post('/clear-bill-register', async (req, res) => {
  try {
    const rRes = await FinancialYearRow.deleteMany({});
    const pRes = await FinancialYearPayment.deleteMany({});
    const dRes = await BillRegisterDocument.deleteMany({});

    const io = req.app.get('io');
    if (io) {
      io.emit('cementUpdates', { action: 'billRegisterCleared' });
    }

    res.json({
      success: true,
      message: 'All Bill Register data has been cleared successfully.',
      rowsDeleted: rRes.deletedCount,
      paymentsDeleted: pRes.deletedCount,
      documentsDeleted: dRes.deletedCount
    });
  } catch (err) {
    console.error('Failed to clear Bill Register data:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/import-excel', async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid rows provided for import.' });
    }

    const cementCol = mongoose.connection.useDb("cement_register").collection("entries");
    const bulkOps = [];
    let importedCount = 0;
    let existingCount = 0;
    const errors = [];

    // Fetch existing bill numbers from FinancialYearRow & cement entries
    const existingFyRows = await FinancialYearRow.find({}).lean();
    const existingBillNos = new Set(existingFyRows.map(r => String(r.billNo).trim().toUpperCase()));

    const allCementBills = await cementCol.find({}, { projection: { "BILL NO": 1, "UNLOADING BILL NO": 1, "INVOICE NO": 1 } }).toArray();
    allCementBills.forEach(c => {
      if (c["BILL NO"]) existingBillNos.add(String(c["BILL NO"]).trim().toUpperCase());
      if (c["UNLOADING BILL NO"]) existingBillNos.add(String(c["UNLOADING BILL NO"]).trim().toUpperCase());
      if (c["INVOICE NO"]) existingBillNos.add(String(c["INVOICE NO"]).trim().toUpperCase());
    });

    for (let idx = 0; idx < rows.length; idx++) {
      const r = rows[idx];
      const invNo = String(r.invoiceNumber || r.billNo || r.displayInvoiceNumber || '').trim();

      if (!invNo) {
        errors.push({ row: idx + 1, error: 'Missing Invoice / Bill Number' });
        continue;
      }

      const upperKey = invNo.toUpperCase();

      const updateDoc = {
        billNo: invNo,
        billType: (r.billType || 'FREIGHT').toUpperCase(),
        editedInvoiceDate: r.invoiceDate || '',
        editedInvoiceNumber: r.displayInvoiceNumber || invNo,
        editedMonth: r.month || '',
        editedSite: r.site || 'NVCL',
        editedAmount: typeof r.amount === 'number' ? r.amount : (parseFloat(r.amount) || 0),
        shipmentNo: r.shipmentNo || r.shipmentNumber || '',
        cgst: typeof r.cgst === 'number' ? r.cgst : (parseFloat(r.cgst) || 0),
        sgst: typeof r.sgst === 'number' ? r.sgst : (parseFloat(r.sgst) || 0),
        totalAmount: typeof r.totalAmount === 'number' ? r.totalAmount : (parseFloat(r.totalAmount) || 0),
        tds: typeof r.tds === 'number' ? r.tds : (parseFloat(r.tds) || 0),
        receivable: typeof r.receivable === 'number' ? r.receivable : (parseFloat(r.receivable) || 0),
        paymentAmount: typeof r.paymentAmount === 'number' ? r.paymentAmount : (parseFloat(r.paymentAmount) || 0),
        tdsProvision: typeof r.tdsProvision === 'number' ? r.tdsProvision : (parseFloat(r.tdsProvision) || 0),
        paymentDate: r.paymentDate || '',
        referenceNo: r.referenceNo || '',
        debitAmount: typeof r.debitAmount === 'number' ? r.debitAmount : (parseFloat(r.debitAmount) || 0),
        debitReasons: Array.isArray(r.debitReasons) ? r.debitReasons : (r.debitReasons ? [r.debitReasons] : []),
        remarks: r.remarks || '',
        slNo: typeof r.slNo === 'number' ? r.slNo : (parseFloat(r.slNo) || (idx + 1)),
        hidden: false
      };

      if (existingBillNos.has(upperKey)) {
        existingCount++;
      } else {
        importedCount++;
        existingBillNos.add(upperKey);
      }

      bulkOps.push({
        updateOne: {
          filter: { billNo: invNo },
          update: { $set: updateDoc },
          upsert: true
        }
      });
    }

    if (bulkOps.length > 0) {
      await FinancialYearRow.bulkWrite(bulkOps);
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('cementUpdates', { action: 'billRegisterExcelImport', count: bulkOps.length });
    }

    res.json({
      success: true,
      totalRows: rows.length,
      importedCount,
      existingCount,
      errorCount: errors.length,
      errors
    });
  } catch (err) {
    console.error('Failed to import Bill Register Excel:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/parse-pdf', memoryPdfUpload.single('pdf'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, error: 'No PDF file uploaded.' });
    }

    const targetSite = (req.body.targetSite || req.body.site || 'NVL').toUpperCase() === 'NVCL' ? 'NVCL' : 'NVL';
    const parseResult = await parsePdfBillRegister(req.file.buffer, targetSite);

    // Fetch existing bill numbers from FinancialYearRow & cement entries for duplicate detection
    const cementCol = mongoose.connection.useDb("cement_register").collection("entries");
    const existingFyRows = await FinancialYearRow.find({}).lean();
    const existingBillNos = new Set(existingFyRows.map(r => String(r.billNo).trim().toUpperCase()));

    const allCementBills = await cementCol.find({}, { projection: { "BILL NO": 1, "UNLOADING BILL NO": 1, "INVOICE NO": 1 } }).toArray();
    allCementBills.forEach(c => {
      if (c["BILL NO"]) existingBillNos.add(String(c["BILL NO"]).trim().toUpperCase());
      if (c["UNLOADING BILL NO"]) existingBillNos.add(String(c["UNLOADING BILL NO"]).trim().toUpperCase());
      if (c["INVOICE NO"]) existingBillNos.add(String(c["INVOICE NO"]).trim().toUpperCase());
    });

    let validCount = 0;
    let existingCount = 0;
    let reviewCount = 0;

    const rowsWithStatus = parseResult.rows.map(row => {
      const isExisting = row.invoiceNumber ? existingBillNos.has(String(row.invoiceNumber).trim().toUpperCase()) : false;
      if (isExisting) existingCount++;
      else validCount++;

      if (row.needsReview) reviewCount++;

      return {
        ...row,
        site: targetSite,
        isExisting
      };
    });

    res.json({
      success: true,
      filename: req.file.originalname,
      targetSite,
      totalPages: parseResult.totalPages,
      totalRows: parseResult.totalRows,
      validCount,
      existingCount,
      reviewCount,
      rows: rowsWithStatus
    });
  } catch (err) {
    console.error('Failed to parse PDF Bill Register:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/save-row', async (req, res) => {
  try {
    const {
      billNo, billType, editedInvoiceDate, editedInvoiceNumber, editedMonth,
      editedSite, editedAmount, debitReason, debitReasons, damageYear, damageMonth,
      damageVehicles, damageTrips, damageVehicleAmounts, slNo
    } = req.body;
    let updateObj = {};
    if (billType !== undefined) updateObj.billType = billType;
    if (editedInvoiceDate !== undefined) updateObj.editedInvoiceDate = editedInvoiceDate;
    if (editedInvoiceNumber !== undefined) updateObj.editedInvoiceNumber = editedInvoiceNumber;
    if (editedMonth !== undefined) updateObj.editedMonth = editedMonth;
    if (editedSite !== undefined) updateObj.editedSite = editedSite;
    if (editedAmount !== undefined) updateObj.editedAmount = parseFloat(editedAmount) || 0;

    // Check if auto-generated from cement register to block core field edits
    const cementCol = mongoose.connection.useDb("cement_register").collection("entries");
    const isAutoGenerated = await cementCol.findOne({
      $or: [
        { "BILL NO": billNo },
        { "UNLOADING BILL NO": billNo }
      ]
    });
    if (isAutoGenerated) {
      updateObj = {}; // Clear core fields to prevent tampering
    }

    if (debitReason !== undefined) updateObj.debitReason = debitReason;
    if (debitReasons !== undefined) updateObj.debitReasons = debitReasons;
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
    if ((debitReason || (debitReasons && debitReasons.length > 0)) && damageTrips && damageVehicleAmounts) {
      const reasonsToProcess = debitReasons && debitReasons.length > 0 ? debitReasons : (debitReason && debitReason !== 'None' ? [debitReason] : []);
      const cementCol = mongoose.connection.useDb("cement_register").collection("entries");

      // 1. Clear any existing overrides in cement register for this bill across all possible reasons to avoid stale data
      const ALL_REASONS = ['Damage / Shortage', 'GPS Trip Charges', 'GPS Deviation Charges', 'Device Installation Charges', 'RFID Deduction / Charges', 'Suspense'];
      for (const reason of ALL_REASONS) {
        const overridePath = `deductionsOverride.${reason}`;
        await cementCol.updateMany(
          { [`${overridePath}.billRegisterRef`]: billNo },
          { $unset: { [overridePath]: "" } }
        );
      }

      if (reasonsToProcess.length > 0) {
        const projSettingsDoc = (await ProjectedDeductionSetting.findOne()) || {};

        // 2. Set new overrides for the selected trips
        for (const t of damageTrips) {

          // Find the exact trip in the cement register using Month, FY, Vehicle, and Trip Number
          const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          const monthIdx = MONTHS.findIndex(m => damageMonth.startsWith(m)) + 1;
          let yearRegexPart = '';
          if (damageYear) {
            const parts = damageYear.split('-');
            if (parts.length === 2) {
              let startY = parseInt(parts[0]);
              let endY = parseInt(parts[1]);
              if (startY < 100) startY += 2000;
              if (endY < 100) endY += 2000;
              const calendarYear = (monthIdx >= 4) ? startY : endY;
              const yrStr = String(calendarYear);
              const yr2 = yrStr.slice(-2);
              yearRegexPart = `(${yrStr}|${yr2})`;
            }
          }
          const monthStr = String(monthIdx).padStart(2, '0');
          const dateRegex = new RegExp(`^\\d{2}[-/\\.]${monthStr}[-/\\.]${yearRegexPart}`);

          const tripsQuery = {
            $or: [{ 'VEHICLE NUMBER': t.vehicle }, { 'VEHICLE NO': t.vehicle }],
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

          const dbTrips = await cementCol.find(tripsQuery).toArray();

          const parseCustomDate = (dStr) => {
            if (!dStr) return 0;
            const parts = String(dStr).split(/[-/\\.]/);
            if (parts.length >= 3) {
              const [day, m, year] = parts;
              let y = parseInt(year);
              if (y < 100) y += 2000;
              return new Date(y, parseInt(m) - 1, parseInt(day)).getTime();
            }
            return 0;
          };

          dbTrips.sort((a, b) => {
            const dateA = parseCustomDate(a['LOADING DT'] || a['LOADING DATE'] || a['BILL DATE'] || 'Unknown');
            const dateB = parseCustomDate(b['LOADING DT'] || b['LOADING DATE'] || b['BILL DATE'] || 'Unknown');
            return dateA - dateB;
          });

          let dbTrip = null;
          if (t.tripNumber && dbTrips[t.tripNumber - 1]) {
            dbTrip = dbTrips[t.tripNumber - 1];
          } else {
            // Fallback
            // Fallback
            const query = {
              $and: [
                {
                  $or: [
                    { 'VEHICLE NUMBER': t.vehicle },
                    { 'VEHICLE NO': t.vehicle }
                  ]
                },
                {
                  $or: [
                    { 'LOADING DT': t.tripDate },
                    { 'LOADING DATE': t.tripDate },
                    { 'BILL DATE': t.tripDate },
                    { 'RECEIVING DATE': t.tripDate },
                    { 'DATE': t.tripDate },
                    { 'INVOICE DATE': t.tripDate }
                  ]
                }
              ]
            };
            dbTrip = await cementCol.findOne(query);
          }
          if (dbTrip) {
            for (const reason of reasonsToProcess) {
              const amountVal = damageVehicleAmounts[t.invoiceNo] && typeof damageVehicleAmounts[t.invoiceNo] === 'object'
                ? damageVehicleAmounts[t.invoiceNo][reason]
                : damageVehicleAmounts[t.invoiceNo]; // Backwards compatibility if it's a flat object

              const manualAmt = parseFloat(String(amountVal || '0').replace(/,/g, '')) || 0;

              let projectedCol = '';
              if (reason === 'Damage / Shortage') projectedCol = 'SHORTAGE (AMOUNT)';
              else if (reason === 'GPS Trip Charges') projectedCol = 'GPS Trip Charges';
              else if (reason === 'GPS Deviation Charges') projectedCol = 'GPS Deviation Charges';
              else if (reason === 'Device Installation Charges') projectedCol = 'Give GPS DEVICE';
              else if (reason === 'RFID Deduction / Charges') projectedCol = 'Give RFID TAG';
              else if (reason === 'Suspense') projectedCol = 'Suspense';

              if (projectedCol) {
                let finalAmtToSync = manualAmt;
                let hasProjectedSetting = false;
                let projectedSettingVal = 0;

                if (reason === 'Damage / Shortage') {
                  hasProjectedSetting = true;
                  projectedSettingVal = projSettingsDoc.damage || 0;
                } else if (reason === 'Device Installation Charges' || reason === 'GPS Device Installation') {
                  hasProjectedSetting = true;
                  projectedSettingVal = projSettingsDoc.gpsDeviceInstallation || 0;
                } else if (reason === 'RFID Deduction / Charges' || reason === 'RFID') {
                  hasProjectedSetting = true;
                  projectedSettingVal = projSettingsDoc.rfid || 0;
                } else if (reason === 'GPS Trip Charges' || reason === 'GPS Trip Charge') {
                  hasProjectedSetting = true;
                  projectedSettingVal = projSettingsDoc.gpsTripCharge || 0;
                }

                if (hasProjectedSetting) {
                  if (manualAmt >= projectedSettingVal) {
                    finalAmtToSync = manualAmt;
                  } else {
                    finalAmtToSync = projectedSettingVal;
                  }
                }

                const projVal = parseFloat(String(dbTrip[projectedCol] || '0').replace(/,/g, '')) || 0;

                const overridePath = `deductionsOverride.${reason}`;
                const updateDoc = {
                  $set: {
                    [overridePath]: {
                      projected: projVal,
                      actual: manualAmt,
                      billRegisterRef: billNo,
                      timestamp: new Date()
                    },
                    [projectedCol]: finalAmtToSync,
                    'DEDICATED': 'Actual'
                  }
                };
                await cementCol.updateOne({ _id: dbTrip._id }, updateDoc);
              }
            }
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
      vehicle: t['VEHICLE NUMBER'] || t['VEHICLE NO'] || vehicle,
      shortageBag: t['SHORTAGE (BAG)'],
      shortageRate: t['SHORTAGE (RATE)']
    }));

    formatted.sort((a, b) => parseCustomDate(a.tripDate) - parseCustomDate(b.tripDate));

    const finalFormatted = formatted.map((t, idx) => ({ ...t, tripNumber: idx + 1 }));
    res.json(finalFormatted);
  } catch (err) {
    console.error('[FYDetails] /trips error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

function getBillSubmissionFromType(billType) {
  if (!billType) return '';
  const bt = String(billType).trim().toUpperCase();
  if (bt === 'FREIGHT') return 'PORTAL';
  if (bt === 'TOLL') return 'EXCEL';
  if (bt === 'UNLOADING') return 'EXCEL';
  if (bt === 'INCENTIVE') return 'EXCEL';
  return '';
}

// ── POST /fy-details/send-to-gst ──────────────────────────────────────────
router.post('/send-to-gst', auth, async (req, res) => {
  try {
    const { billIds } = req.body;
    if (!billIds || !Array.isArray(billIds) || billIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Please select at least one bill to send to GST.' });
    }

    // 1. Fetch current bill overrides & cement register details to build exact bill records
    const [rowOverrides, allCement] = await Promise.all([
      FinancialYearRow.find({}).lean(),
      getCementCol().find({}, { projection: { 
        'BILL NO': 1, 'UNLOADING BILL NO': 1, 'SITE': 1, 'BILL DATE': 1, 'LOADING DT': 1, 'LOADING DATE': 1, 
        'BILLING AMOUNT': 1, 'Billing Amount': 1, 'BILLING ER 95%': 1, 'AMOUNT': 1, 'EXTRA UNLOADING': 1,
        'month': 1, 'Month': 1
      }}).toArray()
    ]);

    const rowMap = {};
    for (const r of rowOverrides) rowMap[r.billNo] = r;

    // Aggregate cement register bills
    const aggregated = {};
    const addBill = (invNo, invDate, amount, row, defaultBillType) => {
      if (!invNo) return;
      invNo = String(invNo).trim();
      const rawSite = normalizeSite(row['SITE']);
      if (rawSite !== 'NVCL' && rawSite !== 'NVL') return;
      const prefix = rawSite === 'NVCL' ? 'NVCL-' : 'DAC-';
      const cleanInvNo = invNo.replace(/^(DAC|NVCL)[\/\-]/i, '').replace(/\//g, '-');
      const finalInvNo = `${prefix}${cleanInvNo}`;

      if (!aggregated[finalInvNo]) {
        let monthStr = '';
        const rawMonth = parseInt(row.month || row.Month, 10);
        if (rawMonth >= 1 && rawMonth <= 12) {
          monthStr = MONTH_NAMES[rawMonth - 1];
        } else {
          const dObj = parseDate(invDate);
          if (dObj) {
            const m = dObj.getMonth();
            const yy = String(dObj.getFullYear()).slice(-2);
            monthStr = `${MONTH_NAMES[m]} '${yy}`;
          }
        }
        aggregated[finalInvNo] = {
          invoiceDate: invDate,
          invoiceNumber: finalInvNo,
          month: monthStr,
          site: rawSite,
          amount: 0,
          billType: defaultBillType
        };
      }
      aggregated[finalInvNo].amount += amount;
    };

    for (const row of allCement) {
      if (row['BILL NO']) {
        const fAmt = parseFloat(row['BILLING AMOUNT']) || parseFloat(row['Billing Amount']) || parseFloat(row['BILLING ER 95%']) || parseFloat(row['AMOUNT']) || 0;
        const fDate = row['BILL DATE'] || row['LOADING DT'] || row['LOADING DATE'] || '';
        addBill(row['BILL NO'], fDate, fAmt, row, 'FREIGHT');
      }
      if (row['UNLOADING BILL NO']) {
        const uAmt = parseFloat(row['EXTRA UNLOADING']) || 0;
        const uDate = row['UNLOADING BILL DATE'] || '';
        addBill(row['UNLOADING BILL NO'], uDate, uAmt, row, 'UNLOADING');
      }
    }

    const gstCol = mongoose.connection.useDb("gst_portal").collection("entries");
    const sentBillIds = [];
    const failedBillIds = [];

    for (const billId of billIds) {
      try {
        // Backend DB-level duplicate protection: Check if already sent
        const ov = rowMap[billId] || {};
        if (ov.sentToGST) {
          console.log(`[SendToGST] Bill ${billId} has already been sent to GST.`);
          failedBillIds.push(billId);
          continue;
        }

        const existingGstRecord = await gstCol.findOne({ type: 'gstr1', sourceBillId: billId });
        if (existingGstRecord) {
          await FinancialYearRow.updateOne(
            { billNo: billId },
            { $set: { sentToGST: true, sentToGSTAt: existingGstRecord._sync_at || new Date() } },
            { upsert: true }
          );
          failedBillIds.push(billId);
          continue;
        }

        // Construct full bill details
        const aggBill = aggregated[billId] || {};
        const finalInvNo = ov.editedInvoiceNumber || aggBill.invoiceNumber || billId;
        const invDate = ov.editedInvoiceDate || aggBill.invoiceDate || '';
        const monthStr = ov.editedMonth || aggBill.month || '';
        const siteStr = normalizeSite(ov.editedSite || aggBill.site || 'NVCL');
        const billType = ov.billType || aggBill.billType || 'FREIGHT';
        const amt = parseFloat(ov.editedAmount !== undefined ? ov.editedAmount : (aggBill.amount || 0));

        // Core Algorithm: Calculate Bill Submission based on Bill Type
        const billSubmission = getBillSubmissionFromType(billType) || 'PORTAL';

        let cgst = Math.round(amt * 0.09);
        let sgst = Math.round(amt * 0.09);
        const totalAmt = Math.round(amt * 1.18);

        let filterMonth = 8;
        let filterYear = 2026;
        const dObj = parseDate(invDate);
        if (dObj) {
          filterMonth = dObj.getMonth() + 1;
          filterYear = dObj.getFullYear();
        }

        // 1. Create/link record in GSTR-1 (gst_portal.entries) FIRST
        const gstr1Payload = {
          type: 'gstr1',
          sourceBillId: billId,
          'Invoice Date': invDate,
          'Invoice Number': finalInvNo,
          'Month': monthStr,
          'SITE': siteStr,
          'Bill Submission': billSubmission,
          'BILL': billType,
          'Amount': amt,
          'CGST': cgst,
          'SGST': sgst,
          'Total Amount': totalAmt,
          filterMonth,
          filterYear,
          _sync_source: 'bill-register',
          _sync_at: new Date()
        };

        await gstCol.updateOne(
          { type: 'gstr1', sourceBillId: billId },
          { $set: gstr1Payload },
          { upsert: true }
        );

        // 2. ONLY AFTER GSTR-1 creation succeeds, update Bill Register DB
        await FinancialYearRow.updateOne(
          { billNo: billId },
          { $set: { sentToGST: true, sentToGSTAt: new Date() } },
          { upsert: true }
        );

        sentBillIds.push(billId);
      } catch (err) {
        console.error(`[SendToGST] Failed to process bill ${billId}:`, err);
        failedBillIds.push(billId);
      }
    }

    try {
      const { getIO } = require('../socket');
      getIO().emit('gstPortalUpdates', { action: 'sendToGST', count: sentBillIds.length });
      getIO().emit('fyDetailsUpdates', { action: 'sendToGST', count: sentBillIds.length });
    } catch (e) {
      console.log('Socket notification warning:', e.message);
    }

    res.json({
      success: true,
      sentCount: sentBillIds.length,
      failedCount: failedBillIds.length,
      sentBillIds,
      failedBillIds
    });
  } catch (error) {
    console.error('[SendToGST] Error:', error);
    res.status(500).json({ success: false, error: error.message || 'Server error' });
  }
});

module.exports = router;

