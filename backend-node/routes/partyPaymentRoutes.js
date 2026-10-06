const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const PartyPayment = require('../models/PartyPayment');
const AccountDetail = require('../models/AccountDetail');
const { syncPartyPayments } = require('./accountDetailRoutes');
const { getApplicableProjectedDeduction } = require('../utils/projectedDeductionResolver');
const { parseCalendarDate, parseDate: parseDateHelper } = require('../utils/billRegisterHelper');

// ── Robust date parser using billRegisterHelper ──────────────────
function parseDate(val) {
  return parseDateHelper(val);
}

function getDateParts(val) {
  const cal = parseCalendarDate(val);
  if (!cal) return null;
  return { day: cal.day, month: cal.month, year: cal.year };
}

function parseTdsField(doc) {
  if (!doc || typeof doc !== 'object') return null;
  const candidates = [
    'TDS Applicability', 'TDS Applicability ', 'tds_applicability', 'tdsApplicability',
    'TDS', 'TDS %', 'TDS Rate', 'TDSApplicability',
    'tds', 'tds_rate', 'Tds', 'TDS_APPLICABILITY',
    'TDSApplicable', 'TDS (%)'
  ];
  for (const k of candidates) {
    if (doc[k] !== undefined && doc[k] !== null && doc[k] !== '') {
      let v = doc[k];
      if (typeof v === 'string') {
        v = v.replace('%', '').trim();
      }
      const parsed = parseFloat(v);
      if (!isNaN(parsed)) {
        if (parsed === 0) return 0;
        if (parsed > 0 && parsed <= 0.2) return parsed;
        if (parsed > 0 && parsed <= 20) return parsed / 100;
        return parsed;
      }
    }
  }
  return null;
}

function getCementDeductionsSum(row) {
  if (!row || typeof row !== 'object') return 0;
  const numVal = (v) => {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'object' && !Array.isArray(v)) {
      return Object.values(v).reduce((s, x) => s + numVal(x), 0);
    }
    const n = parseFloat(String(v).replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
  };

  const getF = (r, ...keys) => {
    for (const k of keys) {
      if (r[k] !== undefined && r[k] !== null && r[k] !== '') {
        return numVal(r[k]);
      }
    }
    return 0;
  };

  const directSum = getF(row,
    'SUM OF RFID & FASTAG & DEVIATION & SUSPENSE & OTHERS DEDUCTION',
    'SUM OF RFID & FASTAG & DEVIATION & SUSPENSE & OTHER DEDUCTION',
    'sum of rfid & fastag & deviation & suspense & others deduction',
    'sum of rfid & fastag & deviation & suspense & other deduction'
  );

  const rfid = getF(row, 'Give RFID TAG', 'GIVE RFID TAG', 'Give RFID Tag', 'GIVE RFID', 'Give R', 'GIVE R', 'RFID TAG', 'RFID');
  const fastag = getF(row, 'FASTAG', 'Fastag', 'FASTAG ', 'Fastag ');
  const gpsDev = getF(row, 'GPS Deviation Charges', 'GPS DEVIATION CHARGES', 'GPS DEVIATION', 'GPS Deviation');
  const suspense = getF(row, 'Suspense', 'SUSPENSE');
  const others = getF(row, 'Others deduction', 'OTHERS DEDUCTION', 'OTHER DEDUCTION', 'OTHERS', 'Others Deduction', 'Other deduction');

  const componentsSum = rfid + fastag + gpsDev + suspense + others;
  return directSum > 0 ? directSum : componentsSum;
}

// ── GET /party-payment/full-year ───────────────────────────────────────────

function getCementCol() {
  return mongoose.connection.useDb("cement_register").collection("entries");
}

// GET all cement records for a specific month using fast indexed query + precise JS filtering
router.get('/cement-data', async (req, res) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) {
      return res.status(400).json({ error: 'Month and year are required' });
    }
    const m = parseInt(month, 10);
    const y = parseInt(year, 10);
    const shortY = String(y).slice(-2);

    const mRegex = new RegExp(`(^|[\\.\\-\\s\\/])0?${m}[\\.\\-\\s\\/](${y}|${shortY})($|[\\.\\-\\s\\/])`, 'i');
    const isoRegex = new RegExp(`^${y}[\\-\\s\\/]0?${m}`, 'i');

    const query = {
      $or: [
        { month: m, year: y },
        { month: String(m), year: String(y) },
        { "LOADING DT": mRegex },
        { "LOADING DATE": mRegex },
        { "BILL DATE": mRegex },
        { "RECEIVING DATE": mRegex },
        { "INVOICE DATE": mRegex },
        { "DATE": mRegex },
        { "LOADING DT": isoRegex },
        { "LOADING DATE": isoRegex }
      ]
    };

    const docs = await getCementCol().find(query).toArray();

    const entries = docs.filter(e => {
      const dateVal = e["LOADING DT"] || e["LOADING DATE"] || e["BILL DATE"] || e["RECEIVING DATE"] || e["INVOICE DATE"] || e["DATE"];
      const cal = parseCalendarDate(dateVal);
      if (cal) {
        return cal.month === m && cal.year === y;
      }
      const em = typeof e.month === 'number' ? e.month : parseInt(e.month, 10);
      const ey = typeof e.year === 'number' ? e.year : parseInt(e.year, 10);
      return em === m && ey === y;
    });

    res.json({ success: true, count: entries.length, entries });
  } catch (error) {
    console.error('Error fetching cement data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DEBUG: view raw field names and values from cement register
router.get('/debug-cement', async (req, res) => {
  try {
    const col = getCementCol();

    // Get 3 sample docs to inspect field names
    const samples = await col.find({}).limit(5).toArray();

    // Get all distinct date field values
    const allDates = [];
    const allRaw = await col.find({}, { projection: { 'LOADING DATE': 1, 'LOADING DT': 1, 'VEHICLE NUMBER': 1, 'BILLING @ 95% (PARTY PAYABLE)': 1, 'TDS': 1, 'HSD AMOUNT': 1, 'ADVANCE': 1 } }).limit(20).toArray();

    res.json({
      totalDocs: await col.countDocuments(),
      sampleFieldNames: samples.length > 0 ? Object.keys(samples[0]) : [],
      sampleRow: samples[0] || null,
      dateAndKeyFields: allRaw.map(r => ({
        'VEHICLE NUMBER': r['VEHICLE NUMBER'],
        'LOADING DATE': r['LOADING DATE'],
        'LOADING DT': r['LOADING DT'],
        'BILLING @ 95% (PARTY PAYABLE)': r['BILLING @ 95% (PARTY PAYABLE)'],
        'TDS': r['TDS'],
        'HSD AMOUNT': r['HSD AMOUNT'],
        'ADVANCE': r['ADVANCE'],
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function getDocMonthYear(doc) {
  let m = null;
  let y = null;

  if (doc.month !== undefined && doc.month !== null && doc.month !== '') {
    if (typeof doc.month === 'number') {
      m = doc.month;
    } else {
      const idx = monthNames.findIndex(name => name.toLowerCase() === String(doc.month).trim().toLowerCase());
      if (idx !== -1) m = idx + 1;
      else {
        const parsed = parseInt(doc.month, 10);
        if (!isNaN(parsed) && parsed >= 1 && parsed <= 12) m = parsed;
      }
    }
  }

  if (!m && doc.selectedMonth) {
    const idx = monthNames.findIndex(name => name.toLowerCase() === String(doc.selectedMonth).trim().toLowerCase());
    if (idx !== -1) m = idx + 1;
    else {
      const parsed = parseInt(doc.selectedMonth, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 12) m = parsed;
    }
  }

  const tDate = doc.transactionDate || doc['Transaction Date'];
  const parsedDate = parseDate(tDate);
  if (parsedDate) {
    if (!m) m = parsedDate.getMonth() + 1;
    if (!y) y = parsedDate.getFullYear();
  }

  if (!y) {
    if (doc.year) y = parseInt(doc.year, 10);
    else if (doc.selectedYear) {
      const match = String(doc.selectedYear).match(/(\d{4})/);
      if (match) {
        const fyStart = parseInt(match[1], 10);
        y = (m && m >= 4) ? fyStart : (m ? fyStart + 1 : fyStart);
      }
    }
  }

  if (!y && parsedDate) y = parsedDate.getFullYear();
  if (!y) y = new Date().getFullYear();

  return { month: m, year: y };
}

// GET all manual entries for a specific month and year
router.get('/', async (req, res) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) {
      return res.status(400).json({ error: 'Month and year are required' });
    }

    const m = parseInt(month, 10);
    const y = parseInt(year, 10);

    const records = await PartyPayment.find({
      month: m,
      year: y
    }).lean();

    return res.json(records);
  } catch (error) {
    console.error('Error fetching party payments:', error);
    res.status(500).json({ error: 'Failed to fetch party payment details' });
  }
});

// ── GET /party-payment/previous-month-dues ─────────────────────────────────
// Returns previous calendar month's Balance Due per vehicle
router.get('/previous-month-dues', async (req, res) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) {
      return res.status(400).json({ success: false, error: 'Month and year are required' });
    }

    const m = parseInt(month, 10);
    const y = parseInt(year, 10);

    const prevMonth = (m === 1) ? 12 : (m - 1);
    const prevYear = (m === 1) ? (y - 1) : y;

    // 1. Fetch saved PartyPayment records for previous month
    const savedPartyPayments = await PartyPayment.find({
      month: prevMonth,
      year: prevYear
    }).lean();

    // 2. Fetch Bank Book freight payments for previous month
    const allFreightDocs = await AccountDetail.find({
      ledgerName: { $regex: /^freight payment$/i }
    }).lean().catch(() => []);

    // 3. Fetch Credit Vouchers for previous month
    const Voucher = require('../models/Voucher');
    const creditVoucherDocs = await Voucher.find({
      voucherType: 'CREDIT'
    }).lean().catch(() => []);

    const previousMonthDues = {};

    // Group Bank Book Freight Payments by vehicle for previous month
    const freightByVeh = {};
    allFreightDocs.forEach(fd => {
      const { month: fdm, year: fdy } = getDocMonthYear(fd);
      if (fdm === prevMonth && fdy === prevYear) {
        const fdVeh = String(fd.vehicle || '').trim().toUpperCase().replace(/\s+/g, '');
        if (fdVeh) {
          const w = parseFloat(String(fd.withdraw || '').replace(/,/g, '')) || 0;
          freightByVeh[fdVeh] = (freightByVeh[fdVeh] || 0) + w;
        }
      }
    });

    // Group Credit Vouchers by vehicle for previous month
    const creditRefundByVeh = {};
    creditVoucherDocs.forEach(cv => {
      const cvDate = parseDate(cv.date);
      if (cvDate && cvDate.getMonth() + 1 === prevMonth && cvDate.getFullYear() === prevYear) {
        const vKey = String(cv.vehicleNumber || '').trim().toUpperCase().replace(/\s+/g, '');
        if (vKey) {
          const a = parseFloat(String(cv.amount || '').replace(/,/g, '')) || 0;
          creditRefundByVeh[vKey] = (creditRefundByVeh[vKey] || 0) + a;
        }
      }
    });

    // Process all vehicles from saved PartyPayment records, credit vouchers, and freight payments
    const savedPartyMap = {};
    savedPartyPayments.forEach(sp => {
      const vKey = String(sp.vehicleNo || '').trim().toUpperCase().replace(/\s+/g, '');
      if (vKey) savedPartyMap[vKey] = sp;
    });

    const allVehKeys = new Set([
      ...Object.keys(savedPartyMap),
      ...Object.keys(creditRefundByVeh),
      ...Object.keys(freightByVeh)
    ]);

    allVehKeys.forEach(vKey => {
      const sp = savedPartyMap[vKey];

      const netPayable = (sp && sp.netPayable !== undefined && sp.netPayable !== null && !isNaN(Number(sp.netPayable)))
        ? Number(sp.netPayable)
        : (sp && sp.totalFreight !== undefined ? Number(sp.totalFreight) : 0);

      const paidToParty = freightByVeh[vKey] !== undefined ? freightByVeh[vKey] : Number(sp?.paidToParty || 0);
      const recoveredToDac = Number(sp?.recoveredToDac || 0);
      const creditRefund = creditRefundByVeh[vKey] !== undefined ? creditRefundByVeh[vKey] : Number(sp?.creditRefund || 0);

      let balanceDue = 0;
      if (sp && sp.balanceDue !== undefined && sp.balanceDue !== null && !isNaN(Number(sp.balanceDue)) && sp.balanceDue !== 0 && netPayable === 0 && paidToParty === 0 && recoveredToDac === 0 && creditRefund === 0) {
        balanceDue = Number(sp.balanceDue);
      } else {
        balanceDue = Math.round(netPayable - paidToParty - recoveredToDac + creditRefund);
      }

      previousMonthDues[vKey] = balanceDue;
    });

    res.json({
      success: true,
      currentMonth: m,
      currentYear: y,
      prevMonth,
      prevYear,
      previousMonthDues
    });
  } catch (err) {
    console.error('Error fetching previous month dues:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST to bulk upsert manual entries
router.post('/bulk', async (req, res) => {
  try {
    const { month, year, data } = req.body;
    if (!month || !year || !Array.isArray(data)) {
      return res.status(400).json({ error: 'Invalid input data' });
    }

    const monthInt = parseInt(month, 10);
    const yearInt = parseInt(year, 10);

    const operations = data.map(record => {
      const np = record.netPayable !== undefined ? Number(record.netPayable) : (record.NET_PAYABLE !== undefined ? Number(record.NET_PAYABLE) : 0);
      const paid = record.paidToParty !== undefined ? Number(record.paidToParty) : 0;
      const rec = record.recoveredToDac !== undefined ? Number(record.recoveredToDac) : 0;
      const ref = record.creditRefund !== undefined ? Number(record.creditRefund) : 0;
      const bal = record.balanceDue !== undefined ? Number(record.balanceDue) : Math.round(np - paid - rec + ref);

      const setFields = {
        withholdAmount: record.withholdAmount !== undefined ? Number(record.withholdAmount) : 0,
        withholdReason: record.withholdReason || '',
        otherReason: record.otherReason || '',
        otherDeduction: record.otherDeduction !== undefined ? Number(record.otherDeduction) : 0,
        manualOtherDeduction: record.manualOtherDeduction !== undefined ? Number(record.manualOtherDeduction) : 0,
        otherDeduction_manual: record.otherDeduction_manual !== undefined ? record.otherDeduction_manual : false,
        prevMonthDue: record.prevMonthDue !== undefined ? Number(record.prevMonthDue) : 0,
        netPayable: np,
        recoveredToDac: rec,
        creditRefund: ref,
        paidToParty: paid,
        balanceDue: bal,
        paymentDate: record.paymentDate || '',
        remarks: record.remarks || ''
      };
      if (record.dedicatedIncentive !== undefined) {
        if (record.dedicatedIncentive === '' || record.dedicatedIncentive === null) {
          setFields.dedicatedIncentive = null;
        } else {
          setFields.dedicatedIncentive = Number(record.dedicatedIncentive);
        }
        setFields.dedicatedIncentive_manual = record.dedicatedIncentive_manual !== undefined ? record.dedicatedIncentive_manual : true;
      }
      if (record.tds !== undefined) {
        if (record.tds === '' || record.tds === null) {
          setFields.tds = null;
        } else {
          setFields.tds = Number(record.tds);
        }
        setFields.tds_manual = record.tds_manual !== undefined ? record.tds_manual : true;
      }
      return {
        updateOne: {
          filter: { month: monthInt, year: yearInt, vehicleNo: record.vehicleNo },
          update: { $set: setFields },
          upsert: true
        }
      };
    });

    if (operations.length > 0) {
      await PartyPayment.bulkWrite(operations);
    }

    try {
      const { getIO } = require('../socket');
      const io = getIO();
      if (io) io.emit('partyPaymentUpdate', { action: 'bulk-save', month: monthInt, year: yearInt });
    } catch (e) {
      console.warn('Socket emit failed:', e.message);
    }

    res.json({ message: 'Saved successfully', updatedCount: operations.length });
  } catch (error) {
    console.error('Error in bulk party payments update:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /party-payment/parties-and-vehicles ────────────────────────────────
// Authoritative endpoint returning all unique parties and their vehicle numbers
router.get('/parties-and-vehicles', async (req, res) => {
  try {
    const db = mongoose.connection.useDb('invoice_system');
    const ownerCol = db.collection('owner details');
    const truckCol = db.collection('Truck Contact Number');

    const [allOwnerDocs, allTruckDocs] = await Promise.all([
      ownerCol.find({}).toArray(),
      truckCol.find({}).toArray()
    ]);

    const partyVehicleMap = {}; // Party Name -> Set of vehicle numbers
    const vehicleOwnerMap = {}; // normVeh -> primary owner name

    const addEntry = (rawOwner, rawVeh) => {
      const owner = String(rawOwner || '').trim().toUpperCase();
      const veh = String(rawVeh || '').trim().toUpperCase().replace(/\s+/g, '');
      if (!owner || !veh) return;

      if (!partyVehicleMap[owner]) {
        partyVehicleMap[owner] = new Set();
      }
      partyVehicleMap[owner].add(veh);
      if (!vehicleOwnerMap[veh]) {
        vehicleOwnerMap[veh] = owner;
      }
    };

    allOwnerDocs.forEach(d => {
      const o = d['Owner Name'] || d['Owner Name '] || d.owner_name;
      const v = d['Truck No'] || d['Truck No '] || d.truck_no;
      addEntry(o, v);
    });

    allTruckDocs.forEach(d => {
      const o = d['Owner Name'] || d['Owner Name '] || d.owner_name;
      const v = d['Truck No'] || d['Truck No '] || d.truck_no;
      addEntry(o, v);
    });

    const result = {};
    const sortedParties = Object.keys(partyVehicleMap).sort((a, b) => a.localeCompare(b));
    sortedParties.forEach(p => {
      result[p] = Array.from(partyVehicleMap[p]).filter(Boolean).sort((a, b) => a.localeCompare(b));
    });

    res.json({
      success: true,
      parties: sortedParties,
      partyVehicles: result
    });

  } catch (error) {
    console.error('Error fetching parties and vehicles:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch parties and vehicles' });
  }
});

// ── GET /party-payment/full-year ────────────────────────────────────────────
// Comprehensive 12-Month Financial Year statement for a Party + Vehicle
router.get('/full-year', async (req, res) => {
  try {
    const { partyName, vehicleNo, fy } = req.query;
    if (!vehicleNo) {
      return res.status(400).json({ success: false, error: 'Vehicle number is required' });
    }

    const normTargetVeh = String(vehicleNo).trim().toUpperCase().replace(/\s+/g, '');

    // Parse financial year: e.g. 'FY 2026-27' or '2026-2027' or '26-27'
    let startYear = new Date().getFullYear();
    if (new Date().getMonth() < 3) startYear -= 1; // Jan-Mar belong to previous FY start

    if (fy) {
      const match = String(fy).match(/(\d{4})/);
      if (match) {
        startYear = parseInt(match[1], 10);
      } else {
        const shortMatch = String(fy).match(/^(\d{2})/);
        if (shortMatch) {
          startYear = parseInt(`20${shortMatch[1]}`, 10);
        }
      }
    }
    const endYear = startYear + 1;
    const fyStr = `${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`;
    const fullFy = `FY ${startYear}-${String(endYear).slice(-2)}`;

    // Define the 12 Financial Year months in chronological order (April -> March)
    const FY_MONTH_DEFS = [
      { month: 4, year: startYear, monthName: 'April', displayMonth: `APRIL ${startYear}` },
      { month: 5, year: startYear, monthName: 'May', displayMonth: `MAY ${startYear}` },
      { month: 6, year: startYear, monthName: 'June', displayMonth: `JUNE ${startYear}` },
      { month: 7, year: startYear, monthName: 'July', displayMonth: `JULY ${startYear}` },
      { month: 8, year: startYear, monthName: 'August', displayMonth: `AUGUST ${startYear}` },
      { month: 9, year: startYear, monthName: 'September', displayMonth: `SEPTEMBER ${startYear}` },
      { month: 10, year: startYear, monthName: 'October', displayMonth: `OCTOBER ${startYear}` },
      { month: 11, year: startYear, monthName: 'November', displayMonth: `NOVEMBER ${startYear}` },
      { month: 12, year: startYear, monthName: 'December', displayMonth: `DECEMBER ${startYear}` },
      { month: 1, year: endYear, monthName: 'January', displayMonth: `JANUARY ${endYear}` },
      { month: 2, year: endYear, monthName: 'February', displayMonth: `FEBRUARY ${endYear}` },
      { month: 3, year: endYear, monthName: 'March', displayMonth: `MARCH ${endYear}` }
    ];

    // Calculate Real-World TODAY and REPORT END DATE
    const now = new Date();
    const todayEndOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const fyStartDate = new Date(startYear, 3, 1, 0, 0, 0, 0); // 01-Apr-startYear
    const fyEndDate = new Date(endYear, 2, 31, 23, 59, 59, 999); // 31-Mar-endYear
    const reportEndDate = todayEndOfDay < fyEndDate ? todayEndOfDay : fyEndDate;
    const isCurrentFy = todayEndOfDay < fyEndDate;

    const db = mongoose.connection.useDb('invoice_system');
    const ownerCol = db.collection('owner details');
    const truckCol = db.collection('Truck Contact Number');
    const settingsCol = db.collection('settings');
    const FreightCreditorGstBreakdown = require('../models/FreightCreditorGstBreakdown');
    const Voucher = require('../models/Voucher');
    const { getCreditorKeyForVehicleOrParty } = require('./freightCreditorGstRoutes');

    // 1. Fetch contacts, settings, saved manual entries, breakdown, credit vouchers, and bank book freight payments in parallel
    const [allOwnerDocs, allTruckDocs, savedPartyPayments, settingsDoc, savedGstBreakdowns, creditVoucherDocs, allFreightDocs] = await Promise.all([
      ownerCol.find({}).toArray(),
      truckCol.find({}).toArray(),
      PartyPayment.find({
        vehicleNo: normTargetVeh,
        year: { $in: [startYear, endYear] }
      }).lean(),
      settingsCol.findOne({ key: 'projected_deductions' }),
      FreightCreditorGstBreakdown.find({
        vehicleNo: { $regex: new RegExp(`^\\s*${normTargetVeh}\\s*$`, 'i') },
        $or: [
          { fy: fyStr },
          { fy: fullFy },
          { year: { $in: [startYear, endYear] } }
        ]
      }).lean(),
      Voucher.find({
        voucherType: 'CREDIT',
        vehicleNumber: { $regex: new RegExp(`^\\s*${normTargetVeh}\\s*$`, 'i') }
      }).lean().catch(() => []),
      AccountDetail.find({
        ledgerName: { $regex: /^freight payment$/i }
      }).lean().catch(() => [])
    ]);

    // Determine resolved owner name and TDS rate
    let resolvedOwnerName = String(partyName || '').trim();
    let matchedTdsRate = null;

    const findContact = (docs) => {
      for (const d of docs) {
        const v = String(d['Truck No'] || d['Truck No '] || d.truck_no || '').trim().toUpperCase().replace(/\s+/g, '');
        if (v === normTargetVeh) {
          if (!resolvedOwnerName) {
            resolvedOwnerName = (d['Owner Name'] || d['Owner Name '] || d.owner_name || '').trim();
          }
          const parsed = parseTdsField(d);
          if (parsed !== null && matchedTdsRate === null) {
            matchedTdsRate = parsed;
          }
        }
      }
    };

    findContact(allOwnerDocs);
    findContact(allTruckDocs);
    if (!resolvedOwnerName) resolvedOwnerName = 'Unknown';
    const effectiveTdsRate = (matchedTdsRate !== null) ? matchedTdsRate : 0;

    // Determine whether this vehicle / party is dynamically applicable for Freight Creditor GST (source of truth from Party Payment Details)
    const matchedCreditorKey = await getCreditorKeyForVehicleOrParty(normTargetVeh, resolvedOwnerName || partyName);

    const gpsTripChargeSetting = settingsDoc?.data?.gpsTripCharge ? Number(settingsDoc.data.gpsTripCharge) : 0;

    // Index saved manual PartyPayment records by month_year
    const savedPartyMap = {};
    savedPartyPayments.forEach(p => {
      savedPartyMap[`${p.month}_${p.year}`] = p;
    });

    // Index saved Freight Creditor GST Breakdown by month_year
    const savedGstBreakdownMap = {};
    savedGstBreakdowns.forEach(b => {
      savedGstBreakdownMap[`${b.month}_${b.year}`] = b;
      savedGstBreakdownMap[`${b.month}`] = b;
    });

    // 2. Fetch all cement register trips for this vehicle across the entire FY
    const cementCol = getCementCol();
    const strippedVeh = normTargetVeh.replace(/[^a-zA-Z0-9]/g, '');
    const vRegexStr = strippedVeh.split('').join('[^a-zA-Z0-9]*');
    const vehRegex = new RegExp(`^[^a-zA-Z0-9]*${vRegexStr}[^a-zA-Z0-9]*$`, 'i');

    const cementDocs = await cementCol.find({
      $or: [
        { 'VEHICLE NUMBER': vehRegex },
        { 'VEHICLE NO': vehRegex },
        { 'VEHICLE NO.': vehRegex },
        { 'vehicleNumber': vehRegex },
        { 'Truck No': vehRegex },
        { 'TRUCK NO': vehRegex },
        { 'truck_no': vehRegex }
      ]
    }).toArray();

    // Group cement register entries by month & year matching FY_MONTH_DEFS
    const tripsByMonthYear = {};
    FY_MONTH_DEFS.forEach(def => {
      tripsByMonthYear[`${def.month}_${def.year}`] = [];
    });

    cementDocs.forEach(row => {
      const dateVal = row['LOADING DT'] || row['LOADING DATE'] || row['BILL DATE'] || row['RECEIVING DATE'] || row['INVOICE DATE'] || row.date;
      const cal = parseCalendarDate(dateVal);
      if (cal) {
        const key = `${cal.month}_${cal.year}`;
        if (tripsByMonthYear[key]) {
          tripsByMonthYear[key].push(row);
        }
      } else if (row.month && row.year) {
        const m = typeof row.month === 'number' ? row.month : parseInt(row.month, 10);
        const y = typeof row.year === 'number' ? row.year : parseInt(row.year, 10);
        const key = `${m}_${y}`;
        if (tripsByMonthYear[key]) {
          tripsByMonthYear[key].push(row);
        }
      }
    });

    // Helper for multi-field numerical summing
    const num = (v) => {
      if (v === null || v === undefined || v === '') return 0;
      const n = parseFloat(String(v).replace(/,/g, ''));
      return isNaN(n) ? 0 : n;
    };
    const round2 = (n) => Math.round(n);

    // Fetch march doc of startYear for April's previous month due if available
    const marchPartyDoc = savedPartyMap[`3_${startYear}`];
    let marchPrevBalanceDue = 0;
    if (marchPartyDoc) {
      const mNetP = num(marchPartyDoc.netPayable);
      const mPaid = num(marchPartyDoc.paidToParty);
      const mRec = num(marchPartyDoc.recoveredToDac);
      const mRef = num(marchPartyDoc.creditRefund);
      marchPrevBalanceDue = (marchPartyDoc.balanceDue !== undefined && marchPartyDoc.balanceDue !== null)
        ? num(marchPartyDoc.balanceDue)
        : round2(mNetP - mPaid - mRec + mRef);
    }

    const getF = (row, ...keys) => {
      for (const k of keys) {
        const v = row[k];
        if (v !== undefined && v !== null && v !== '') {
          if (typeof v === 'object' && !Array.isArray(v)) {
            return Object.values(v).reduce((s, x) => s + num(x), 0);
          }
          return num(v);
        }
      }
      return 0;
    };

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

    function isDummyRow(row) {
      if (!row) return false;
      const rawInvoice = row['INVOICE NO'] || row['INVOICE NUMBER'] || row['Invoice No'] || row['invoiceNo'] || row['invoice_number'] || '';
      const rawShipment = row['SHIPMENT NO'] || row['SHIPMENT NUMBER'] || row['Shipment No'] || row['shipmentNo'] || row['shipment_number'] || '';
      const hasRealInvoice = isRealInvoiceOrShipment(rawInvoice);
      const hasRealShipment = isRealInvoiceOrShipment(rawShipment);
      if (row.isDummy === true || row._isDummy === true || row._source === 'auto_dummy') {
        return !hasRealInvoice && !hasRealShipment;
      }
      return !hasRealInvoice && !hasRealShipment;
    }

    // 3. Construct the 12 monthly rows sequentially
    const rows = [];
    let runningBalanceDue = marchPrevBalanceDue;

    for (let idx = 0; idx < FY_MONTH_DEFS.length; idx++) {
      const def = FY_MONTH_DEFS[idx];
      const m = def.month;
      const y = def.year;
      const monthKey = `${m}_${y}`;

      const monthStartDate = new Date(y, m - 1, 1, 0, 0, 0, 0);
      const lastDay = new Date(y, m, 0).getDate();
      const monthEndDate = new Date(y, m - 1, lastDay, 23, 59, 59, 999);

      const monthTrips = tripsByMonthYear[monthKey] || [];
      const saved = savedPartyMap[monthKey] || {};
      const savedGst = savedGstBreakdownMap[monthKey] || savedGstBreakdownMap[String(m)] || {};

      // Authoritative Paid to Party from Bank Book Freight Payments
      let authoritativePaidToParty = 0;
      allFreightDocs.forEach(fd => {
        const { month: fdm, year: fdy } = getDocMonthYear(fd);
        if (fdm === m && fdy === y) {
          const fdVeh = String(fd.vehicle || '').trim().toUpperCase().replace(/\s+/g, '');
          const fdOwner = String(fd.names || '').trim().toUpperCase();
          const targetOwner = String(resolvedOwnerName || '').trim().toUpperCase();

          if (fdVeh && fdVeh === normTargetVeh) {
            authoritativePaidToParty += num(fd.withdraw);
          } else if (!fdVeh && targetOwner && fdOwner && (fdOwner === targetOwner || fdOwner.includes(targetOwner) || targetOwner.includes(fdOwner))) {
            authoritativePaidToParty += num(fd.withdraw);
          }
        }
      });

      // Authoritative Credit Refund from Credit Vouchers
      let authoritativeCreditRefund = 0;
      creditVoucherDocs.forEach(cv => {
        const cvDate = parseDate(cv.date);
        if (cvDate) {
          if (cvDate.getMonth() + 1 === m && cvDate.getFullYear() === y) {
            const cvVeh = String(cv.vehicleNumber || '').trim().toUpperCase().replace(/\s+/g, '');
            if (cvVeh === normTargetVeh) {
              authoritativeCreditRefund += num(cv.amount);
            }
          }
        }
      });

      // Determine activity status for this specific vehicle in this month:
      const hasTrips = monthTrips.length > 0;
      const hasSavedRecord = Object.keys(saved).length > 0;
      const hasPayments = authoritativePaidToParty > 0 || num(saved.paidToParty) > 0;
      const hasVouchers = authoritativeCreditRefund > 0 || num(saved.creditRefund) > 0;
      const hasWithhold = num(saved.withholdAmount) > 0;
      const hasManualDeduction = num(saved.manualOtherDeduction) > 0 || num(saved.otherDeduction) > 0;
      const hasDedicatedIncentive = (saved.dedicatedIncentive !== undefined && saved.dedicatedIncentive !== null && num(saved.dedicatedIncentive) !== 0);
      const hasRecovered = num(saved.recoveredToDac) > 0;
      const hasExplicitNetPayable = (saved.netPayable !== undefined && saved.netPayable !== null && num(saved.netPayable) !== 0);

      const hasActivity = hasTrips || hasSavedRecord || hasPayments || hasVouchers || hasWithhold || hasManualDeduction || hasDedicatedIncentive || hasRecovered || hasExplicitNetPayable;
      const isFuture = monthStartDate > reportEndDate && !hasActivity;
      const isCurrent = !isFuture && (reportEndDate < monthEndDate);

      // Case 1: Empty Future Month
      if (isFuture) {
        rows.push({
          monthIndex: idx + 1,
          month: m,
          year: y,
          monthName: def.monthName,
          displayMonth: def.displayMonth,
          'MONTH': def.displayMonth,
          'OWNER NAME': resolvedOwnerName,
          'VEHICLE NO': normTargetVeh,
          'GROSS FREIGHT': 0,
          'LOADING ADVANCE': 0,
          'FUEL': 0,
          'TDS': 0,
          'TRAVELLING EXP': 0,
          'DAMAGE RECOVERY': 0,
          'CASH_BANK_OTHERS': 0,
          'OTHER DEDUCTION': 0,
          'OTHER REASON': '',
          'GPS TRIP CHARGE': 0,
          'GPS DEVICE': 0,
          'NET AMOUNT': 0,
          '8.5% NVCL': 0,
          'DEDICATED INCENTIVE': 0,
          'RAFTER': 0,
          'EXTRA U/L': 0,
          'TOLL UP': 0,
          'TOLL DOWN': 0,
          'TDS ON INCENTIVE': 0,
          'TOTAL FREIGHT': 0,
          'GST FCM': null,
          'WITHHOLD AMOUNT': 0,
          'WITHHOLD REASON': '',
          'PREV MONTH DUE': 0,
          'NET PAYABLE': 0,
          'RECOVERED TO DAC': 0,
          'CREDIT REFUND': 0,
          'PAID TO PARTY': 0,
          'BALANCE DUE': 0,
          'PAYMENT DATE': '',
          'REMARKS': '',
          tripCount: 0,
          isFuture: true,
          status: 'future'
        });
        continue;
      }

      // Case 2: Available/Completed Month with ZERO Activity
      if (!hasActivity) {
        rows.push({
          monthIndex: idx + 1,
          month: m,
          year: y,
          monthName: def.monthName,
          displayMonth: def.displayMonth,
          'MONTH': def.displayMonth,
          'OWNER NAME': resolvedOwnerName,
          'VEHICLE NO': normTargetVeh,
          'GROSS FREIGHT': 0,
          'LOADING ADVANCE': 0,
          'FUEL': 0,
          'TDS': 0,
          'TRAVELLING EXP': 0,
          'DAMAGE RECOVERY': 0,
          'CASH_BANK_OTHERS': 0,
          'OTHER DEDUCTION': 0,
          'OTHER REASON': '',
          'GPS TRIP CHARGE': 0,
          'GPS DEVICE': 0,
          'NET AMOUNT': 0,
          '8.5% NVCL': 0,
          'DEDICATED INCENTIVE': 0,
          'RAFTER': 0,
          'EXTRA U/L': 0,
          'TOLL UP': 0,
          'TOLL DOWN': 0,
          'TDS ON INCENTIVE': 0,
          'TOTAL FREIGHT': 0,
          'GST FCM': null,
          'WITHHOLD AMOUNT': 0,
          'WITHHOLD REASON': '',
          'PREV MONTH DUE': 0,
          'NET PAYABLE': 0,
          'RECOVERED TO DAC': 0,
          'CREDIT REFUND': 0,
          'PAID TO PARTY': 0,
          'BALANCE DUE': 0,
          'PAYMENT DATE': '',
          'REMARKS': '',
          tripCount: 0,
          isFuture: false,
          status: isCurrent ? 'current' : 'completed'
        });
        continue;
      }

      // Case 3: Available Month with Real Activity
      let grossFreight = 0;
      let loadingAdvance = 0;
      let fuel = 0;
      let travellingExp = 0;
      let damageRecovery = 0;
      let cashBankOthers = 0;
      let cementOtherDeduction = 0;
      let gpsDevice = 0;
      let nvcl85 = 0;
      let rafter = 0;
      let extraUl = 0;
      let tollUp = 0;
      let tollDown = 0;

      monthTrips.forEach(row => {
        const isDummy = isDummyRow(row);
        if (!isDummy) {
          grossFreight += getF(row, 'BILLING ER 95%', 'BILLING ER VAR', 'BILLING @ 95% (PARTY PAYABLE)', 'BILLING@95%', 'AMOUNT', 'Billing Amount');

          const extra85 = row['10W EXTRA 8.5%'] !== undefined
            ? num(row['10W EXTRA 8.5%'])
            : row['10W EXTRA 8'] !== undefined
              ? (typeof row['10W EXTRA 8'] === 'object'
                ? Object.values(row['10W EXTRA 8']).reduce((s, x) => s + num(x), 0)
                : num(row['10W EXTRA 8']))
              : 0;
          nvcl85 += extra85;

          rafter += getF(row, 'RAFTER', 'RAFTER CHARGES');
          extraUl += getF(row, 'EXTRA UNLOADING', 'EXTRA  UNLOADING', 'EXTRA UL', 'EXTRA U/L');
          tollUp += getF(row, 'UP TOLL', 'TOLL UP', 'TOLL_UP', 'TOLL UP ');
          tollDown += getF(row, 'DOWN TOLL', 'TOLL DOWN', 'TOLL_DOWN', 'TOLL DOWN ');
        }

        // Financial advances and deductions from all rows (including dummy placeholder rows)
        loadingAdvance += getF(row, 'ADVANCE', 'LOADING ADVANCE', 'ADV', 'Advance');
        fuel += getF(row, 'HSD AMOUNT', 'HSD_AMOUNT', 'DIESEL AMOUNT');
        travellingExp += getF(row, 'TRAVELLING EXP', 'TRAVELLING  EXP', 'TRAVEL EXP', 'TRAVELLING');

        const sAmt = getF(row, 'SHORTAGE (AMOUNT)', 'SHORTAGE AMOUNT', 'DAMAGE RECOVERY');
        const sBags = getF(row, 'SHORTAGE (BAG)', 'SHORTAGE BAG');
        const sRate = getF(row, 'SHORTAGE (RATE)', 'SHORTAGE RATE');
        damageRecovery += sAmt || (sBags * sRate);

        cashBankOthers += getF(row, 'BANK TF', 'BANK TF ', 'Bank TF', 'BANK_TF') + getF(row, 'Site Cash', 'SITE CASH', 'SITE_CASH') + getF(row, 'OFFICE CASH', 'Office Cash', 'OFFICE_CASH');
        cementOtherDeduction += getCementDeductionsSum(row);
        gpsDevice += getF(row, 'GPS DEVICE', 'GPS  DEVICE', 'GPS_DEVICE');
      });

      // Other Deduction = Cement Register SUM + Manual Other Deduction
      const manualOtherDeduction = num(saved.manualOtherDeduction || (saved.otherDeduction_manual ? saved.otherDeduction : 0));
      const otherDeduction = round2(cementOtherDeduction + manualOtherDeduction);

      // TDS Calculation
      const autoTds = Math.round(grossFreight * effectiveTdsRate * 100) / 100;
      const isTdsManual = saved.tds_manual === true || (saved.tds !== undefined && saved.tds !== null);
      const tds = isTdsManual ? num(saved.tds) : autoTds;

      // Dedicated Incentive (from saved override or 0)
      const dedicatedIncentive = (saved.dedicatedIncentive !== undefined && saved.dedicatedIncentive !== null)
        ? num(saved.dedicatedIncentive)
        : 0;

      // Date-aware GPS Trip Charge resolution based on authoritative date
      let authoritativeDate = `${y}-${String(m).padStart(2, '0')}-01`;
      for (const row of monthTrips) {
        const rawDate = row['LOADING DT'] || row['LOADING DATE'] || row['BILL DATE'] || row['DATE'] || row['INVOICE DATE'];
        if (rawDate) {
          const pDate = parseDate(rawDate);
          if (pDate && !isNaN(pDate.getTime())) {
            authoritativeDate = pDate.toISOString().slice(0, 10);
            break;
          }
        }
      }
      const applicableGpsSetting = await getApplicableProjectedDeduction('GPS_MONITORING_TRIP_CHARGE', authoritativeDate);
      const gpsTripCharge = (monthTrips.length > 0 && applicableGpsSetting > 0) ? applicableGpsSetting : 0;

      // Net Amount = Gross Freight - Deductions
      const totalDeductions = loadingAdvance + fuel + tds + travellingExp + damageRecovery + cashBankOthers + otherDeduction + gpsTripCharge + gpsDevice;
      const netAmount = round2(grossFreight - totalDeductions);

      // TDS on Incentive
      const tdsOnIncentive = round2((dedicatedIncentive + extraUl) * (effectiveTdsRate || 0.01));

      // Total Freight
      const incentiveSum = nvcl85 + dedicatedIncentive + extraUl + tollUp + tollDown;
      const totalFreight = round2(netAmount + incentiveSum - tdsOnIncentive);

      // ── Authoritative GST FCM resolution from Party Payment Details / Freight Creditor GST ──
      let gstFcm = null;
      if (saved.gstFcm !== undefined && saved.gstFcm !== null && num(saved.gstFcm) !== 0) {
        gstFcm = Number(saved.gstFcm);
      } else if (matchedCreditorKey) {
        // Only compute/apply GST FCM if this vehicle/party is dynamically mapped to a Freight Creditor
        const basicCurrM = hasTrips ? Math.round(grossFreight * 100) / 100 : null;
        const incentiveM2 = (savedGst.incentiveM2 !== undefined && savedGst.incentiveM2 !== null) ? Number(savedGst.incentiveM2) : null;
        const incentiveM1 = (savedGst.incentiveM1 !== undefined && savedGst.incentiveM1 !== null) ? Number(savedGst.incentiveM1) : null;

        if (incentiveM2 !== null || incentiveM1 !== null || basicCurrM !== null) {
          const taxableValue = Math.round(((incentiveM2 || 0) + (incentiveM1 || 0) + (basicCurrM || 0)) * 100) / 100;
          const cgst = Math.round((taxableValue * 0.09) * 100) / 100;
          const sgst = Math.round((taxableValue * 0.09) * 100) / 100;
          // Authoritative GST FCM Amount = TOTAL TAXABLE VALUE + CGST 9% + SGST 9%
          gstFcm = Math.round((taxableValue + cgst + sgst) * 100) / 100;
        }
      }

      // Previous Month Due:
      // For April (idx === 0): marchPrevBalanceDue > 0 ? marchPrevBalanceDue : num(saved.prevMonthDue)
      // For idx > 0: use saved.prevMonthDue if explicitly saved, otherwise runningBalanceDue from last active month
      let prevMonthDue = 0;
      if (idx === 0) {
        prevMonthDue = (saved.prevMonthDue !== undefined && saved.prevMonthDue !== null && saved.prevMonthDue !== '')
          ? num(saved.prevMonthDue)
          : marchPrevBalanceDue;
      } else {
        if (saved.prevMonthDue !== undefined && saved.prevMonthDue !== null && saved.prevMonthDue !== '') {
          prevMonthDue = num(saved.prevMonthDue);
        } else {
          prevMonthDue = runningBalanceDue;
        }
      }

      // Net Payable
      const withholdAmount = num(saved.withholdAmount);
      const computedNetPayable = round2(totalFreight + (gstFcm || 0) + prevMonthDue - withholdAmount);
      const netPayable = (saved.netPayable !== undefined && saved.netPayable !== null && saved.netPayable !== '')
        ? num(saved.netPayable)
        : computedNetPayable;

      // Paid to Party, Recovered to DAC, Credit Refund
      const paidToParty = authoritativePaidToParty > 0 ? authoritativePaidToParty : num(saved.paidToParty);
      const recoveredToDac = num(saved.recoveredToDac);
      const creditRefund = authoritativeCreditRefund > 0 ? authoritativeCreditRefund : num(saved.creditRefund);

      // Balance Due
      const computedBalanceDue = round2(netPayable - paidToParty - recoveredToDac + creditRefund);
      const balanceDue = (saved.balanceDue !== undefined && saved.balanceDue !== null && saved.balanceDue !== '')
        ? num(saved.balanceDue)
        : computedBalanceDue;

      // Update running balance for next active month
      runningBalanceDue = balanceDue;

      rows.push({
        monthIndex: idx + 1,
        month: m,
        year: y,
        monthName: def.monthName,
        displayMonth: def.displayMonth,
        'MONTH': def.displayMonth,
        'OWNER NAME': resolvedOwnerName,
        'VEHICLE NO': normTargetVeh,
        'GROSS FREIGHT': grossFreight,
        'LOADING ADVANCE': loadingAdvance,
        'FUEL': fuel,
        'TDS': tds,
        'TRAVELLING EXP': travellingExp,
        'DAMAGE RECOVERY': damageRecovery,
        'CASH_BANK_OTHERS': cashBankOthers,
        'OTHER DEDUCTION': otherDeduction,
        'OTHER REASON': saved.otherReason || '',
        'GPS TRIP CHARGE': gpsTripCharge,
        'GPS DEVICE': gpsDevice,
        'NET AMOUNT': netAmount,
        '8.5% NVCL': nvcl85,
        'DEDICATED INCENTIVE': dedicatedIncentive,
        'RAFTER': rafter,
        'EXTRA U/L': extraUl,
        'TOLL UP': tollUp,
        'TOLL DOWN': tollDown,
        'TDS ON INCENTIVE': tdsOnIncentive,
        'TOTAL FREIGHT': totalFreight,
        'GST FCM': gstFcm,
        'WITHHOLD AMOUNT': withholdAmount,
        'WITHHOLD REASON': saved.withholdReason || '',
        'PREV MONTH DUE': prevMonthDue,
        'NET PAYABLE': netPayable,
        'RECOVERED TO DAC': recoveredToDac,
        'CREDIT REFUND': creditRefund,
        'PAID TO PARTY': paidToParty,
        'BALANCE DUE': balanceDue,
        'PAYMENT DATE': saved.paymentDate || '',
        'REMARKS': saved.remarks || '',
        tripCount: monthTrips.length,
        isFuture: false,
        status: isCurrent ? 'current' : 'completed'
      });
    }

    // 4. Compute Full Financial Year Summary Totals (EXCLUDING FUTURE MONTHS)
    const flowKeys = [
      'GROSS FREIGHT', 'LOADING ADVANCE', 'FUEL', 'TDS', 'TRAVELLING EXP',
      'DAMAGE RECOVERY', 'CASH_BANK_OTHERS', 'OTHER DEDUCTION', 'GPS TRIP CHARGE',
      'GPS DEVICE', 'NET AMOUNT', '8.5% NVCL', 'DEDICATED INCENTIVE', 'RAFTER',
      'EXTRA U/L', 'TOLL UP', 'TOLL DOWN', 'TDS ON INCENTIVE', 'TOTAL FREIGHT',
      'WITHHOLD AMOUNT', 'RECOVERED TO DAC', 'CREDIT REFUND', 'PAID TO PARTY'
    ];

    const totals = {};
    flowKeys.forEach(k => { totals[k] = 0; });
    let totalGstFcm = 0;
    let hasAnyGstFcm = false;

    rows.forEach(r => {
      if (r.isFuture) return; // Strictly ignore future months in totals
      flowKeys.forEach(k => {
        if (r[k] !== null && r[k] !== undefined) {
          totals[k] += num(r[k]);
        }
      });
      if (r['GST FCM'] !== null && r['GST FCM'] !== undefined) {
        totalGstFcm += Number(r['GST FCM']);
        hasAnyGstFcm = true;
      }
    });

    totals['GST FCM'] = hasAnyGstFcm ? round2(totalGstFcm) : null;

    // Starting Opening Balance for the Financial Year (April's previous due)
    const startingAprilPrevDue = (rows.length > 0 && !rows[0].isFuture) ? num(rows[0]['PREV MONTH DUE']) : 0;
    totals['PREV MONTH DUE'] = startingAprilPrevDue;

    // Full FY Net Payable = FY Total Freight + FY GST FCM + Starting Opening Balance - FY Total Withhold Amount
    const totalFreightSum = totals['TOTAL FREIGHT'] || 0;
    const totalWithholdSum = totals['WITHHOLD AMOUNT'] || 0;
    const totalNetPayable = round2(totalFreightSum + (hasAnyGstFcm ? totalGstFcm : 0) + startingAprilPrevDue - totalWithholdSum);
    totals['NET PAYABLE'] = totalNetPayable;

    // Full FY Balance Due = Total Net Payable - Total Paid - Total Recovered + Total Credit Refund
    const totalPaidSum = totals['PAID TO PARTY'] || 0;
    const totalRecoveredSum = totals['RECOVERED TO DAC'] || 0;
    const totalCreditRefundSum = totals['CREDIT REFUND'] || 0;
    const totalBalanceDue = round2(totalNetPayable - totalPaidSum - totalRecoveredSum + totalCreditRefundSum);
    totals['BALANCE DUE'] = totalBalanceDue;

    res.json({
      success: true,
      partyName: resolvedOwnerName,
      vehicleNo: normTargetVeh,
      fy: fullFy,
      fyStr,
      startYear,
      endYear,
      effectiveTdsRate,
      reportEndDate: reportEndDate.toISOString(),
      isCurrentFy,
      months: rows,
      totals
    });

  } catch (error) {
    console.error('Error fetching party full year data:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch full year data' });
  }
});

module.exports = router;
