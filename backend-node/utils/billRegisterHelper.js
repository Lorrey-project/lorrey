const mongoose = require('mongoose');
const FinancialYearRow = require('../models/FinancialYearRow');
const FinancialYearPayment = require('../models/FinancialYearPayment');

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

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
];

function normalizeSite(site) {
  if (!site) return '';
  const s = String(site).trim().toUpperCase();
  if (s === 'NVCL') return 'NVCL';
  if (s === 'NVL') return 'NVL';
  return site.trim();
}

/**
 * Retrieves the complete, consolidated Bill Register data.
 * Merges billed trips from cement_register.entries with FinancialYearRow overrides and manual entries.
 *
 * @param {Object} options
 * @param {string} [options.fy] - e.g. "2026-2027" or "ALL"
 * @returns {Promise<{ rows: Array, payments: Array }>}
 */
async function getBillRegisterData({ fy } = {}) {
  let startYear = null;
  if (fy && fy !== 'ALL') {
    const parts = String(fy).split('-');
    if (parts.length === 2) {
      let sy = parseInt(parts[0], 10);
      if (sy < 100) sy += 2000;
      startYear = sy;
    } else {
      let sy = parseInt(fy, 10);
      if (!isNaN(sy)) {
        if (sy < 100) sy += 2000;
        startYear = sy;
      }
    }
  }

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
    _id: 1
  };

  const cementCol = mongoose.connection.useDb("cement_register").collection("entries");

  const [allCement, rowOverrides, payments] = await Promise.all([
    cementCol.find({}, { projection: CEMENT_PROJECTION }).toArray(),
    FinancialYearRow.find({}).lean(),
    FinancialYearPayment.find({}).lean()
  ]);

  // Filter cement entries by financial year based strictly on Bill Date
  const filteredCement = allCement.filter(row => {
    if (String(row['CHALLAN STATUS']).toUpperCase().trim() !== 'BILLED') return false;
    if (!startYear) return true;

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

  // Aggregate cement rows by invoice number AND site
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
        _id: row._id,
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

  // Merge overrides and manual rows
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
      _id: ov._id || r._id,
      id: String(ov._id || r._id || invNo),
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
      damageYear: ov.damageYear,
      damageMonth: ov.damageMonth,
      damageVehicles: ov.damageVehicles || [],
      damageTrips: ov.damageTrips || [],
      damageVehicleAmounts: ov.damageVehicleAmounts || {},
      damageVehicle: ov.damageVehicle,
      damageTrip: ov.damageTrip,
      isManual: false,
      slNo: ov.slNo,
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
      if (!matchYear) continue;
    }

    finalRows.push({
      _id: ov._id,
      id: String(ov._id || ov.billNo),
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

  // Assign slNo sequentially based on date order
  for (let i = 0; i < finalRows.length; i++) {
    finalRows[i].slNo = i + 1;
  }

  // Filter payments based on whether they belong to the rows generated for this FY
  const finalInvNos = new Set(finalRows.map(r => String(r.invoiceNumber)));
  const filteredPayments = payments.filter(p => {
    if (!p.billNos || p.billNos.length === 0) return false;
    return p.billNos.some(b => finalInvNos.has(String(b)));
  });

  return { rows: finalRows, payments: filteredPayments };
}

module.exports = {
  getBillRegisterData,
  parseDate,
  normalizeSite,
  MONTH_NAMES
};
