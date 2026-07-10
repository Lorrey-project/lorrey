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
      'SHIPMENT NO': 1,
      _id: 0
    };

    const [allCement, rowOverrides, payments] = await Promise.all([
      getCementCol().find({}, { projection: CEMENT_PROJECTION }).toArray(),
      FinancialYearRow.find({}).lean(),
      FinancialYearPayment.find({}).lean()
    ]);

    // Filter cement entries by financial year
    const filteredCement = allCement.filter(row => {
      if (String(row['CHALLAN STATUS']).toUpperCase().trim() !== 'BILLED') return false;

      const invNo = row['BILL NO'] || row['INVOICE NO'];
      const uInvNo = row['UNLOADING BILL NO'];

      const hasShortCode = (invNo && String(invNo).includes(shortCode)) || (uInvNo && String(uInvNo).includes(shortCode));

      if (hasShortCode) return true;

      const fInvDate = row['BILL DATE'] || row['LOADING DT'] || row['LOADING DATE'] || '';
      const uInvDate = row['UNLOADING BILL DATE'] || '';

      for (const d of [fInvDate, uInvDate]) {
        if (!d) continue;
        const dObj = parseDate(d);
        if (dObj) {
          const y = dObj.getFullYear();
          const m = dObj.getMonth() + 1;
          if (m >= 4 && y === startYear) return true;
          if (m <= 3 && y === startYear + 1) return true;
        }
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

    const addBillToAggregated = (invNo, invDate, amount, row, defaultBillType) => {
      if (!invNo) return;
      invNo = String(invNo).trim();

      const rawSite = normalizeSite(row['SITE']);
      if (rawSite !== 'NVCL' && rawSite !== 'NVL') return;

      const prefix = rawSite === 'NVCL' ? 'NVCL/' : 'DAC/';
      const cleanInvNo = invNo.replace(/^(DAC|NVCL)\//i, '');
      const finalInvNo = `${prefix}${cleanInvNo}`;

      if (!aggregated[finalInvNo]) {
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
        billType: ov.billType ?? r.billType ?? 'FREIGHT',
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
        partyNames: Array.from(r.partyNames).filter(Boolean),
        shipmentNos: Array.from(r.shipmentNos).filter(Boolean)
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
      'PARTY NAME': 1,
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
      if (debitReason === 'Damage / Shortage') projectedCol = 'SHORTAGE (AMOUNT)';
      else if (debitReason === 'GPS Trip Charges') projectedCol = 'GPS Monitoring Charge';
      else if (debitReason === 'GPS Deviation Charges') projectedCol = 'GPS Deviation Charges';
      else if (debitReason === 'Device Installation Charges') projectedCol = 'Give GPS DEVICE';
      else if (debitReason === 'RFID Deduction / Charges') projectedCol = 'Give RFID TAG';
      else if (debitReason === 'Substance') projectedCol = 'Others deduction';

      if (projectedCol) {
        // 2. Set new overrides for the selected trips
        for (const t of damageTrips) {
          const amountVal = damageVehicleAmounts[t.invoiceNo];
          const manualAmt = parseFloat(String(amountVal).replace(/,/g, '')) || 0;

          // Find the exact trip in the cement register using Month, FY, Vehicle, and Trip Number
          const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
          const monthIdx = MONTHS.indexOf(damageMonth) + 1;
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
            const query = {
              $or: [
                { 'VEHICLE NUMBER': t.vehicle },
                { 'VEHICLE NO': t.vehicle }
              ],
              $or: [
                { 'LOADING DT': t.tripDate },
                { 'LOADING DATE': t.tripDate },
                { 'BILL DATE': t.tripDate },
                { 'RECEIVING DATE': t.tripDate },
                { 'DATE': t.tripDate },
                { 'INVOICE DATE': t.tripDate }
              ]
            };
            dbTrip = await cementCol.findOne(query);
          }
          if (dbTrip) {
            const projVal = parseFloat(String(dbTrip[projectedCol] || '0').replace(/,/g, '')) || 0;

            if (true) {
              const overridePath = `deductionsOverride.${debitReason}`;
              const updateDoc = {
                $set: {
                  [overridePath]: {
                    projected: projVal,
                    actual: manualAmt,
                    billRegisterRef: billNo,
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
