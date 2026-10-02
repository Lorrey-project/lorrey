const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const PartyPayment = require('../models/PartyPayment');
const { getApplicableProjectedDeduction } = require('../utils/projectedDeductionResolver');

// ── Helper: robust date parser (copied from pumpPayment) ──────────────────
function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val) ? null : val;
  const str = String(val).trim();

  // ── Detect DD-MM-YYYY / DD/MM/YYYY (Indian format) — MUST check first ──
  const ddmmyyyy = str.match(/^(\d{1,2})[\-\/](\d{1,2})[\-\/](\d{4})$/);
  if (ddmmyyyy) {
    const d = parseInt(ddmmyyyy[1]), m = parseInt(ddmmyyyy[2]), y = parseInt(ddmmyyyy[3]);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      return new Date(y, m - 1, d);
    }
  }

  // ── Handle YYYY-MM-DD ISO format ──
  const yyyymmdd = str.match(/^(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})/);
  if (yyyymmdd) {
    const y = parseInt(yyyymmdd[1]), m = parseInt(yyyymmdd[2]), d = parseInt(yyyymmdd[3]);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      return new Date(y, m - 1, d);
    }
  }

  // ── Try standard JS parsing as final fallback ──
  const iso = new Date(str);
  if (!isNaN(iso.getTime())) return iso;

  return null;
}


function getDateParts(val) {
  const d = parseDate(val);
  if (!d) return null;
  return { day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear() };
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

    // Fast indexed MongoDB query
    const query = {
      $or: [
        { month: m, year: y },
        { month: String(m), year: String(y) },
        { "LOADING DT": { $regex: new RegExp(`[\\.\\-\\/\s]0?${m}[\\.\\-\\/\s](${y}|${shortY})`) } },
        { "LOADING DATE": { $regex: new RegExp(`[\\.\\-\\/\s]0?${m}[\\.\\-\\/\s](${y}|${shortY})`) } }
      ]
    };

    const docs = await getCementCol().find(query).toArray();

    const entries = docs.filter(e => {
      const dateVal = e["LOADING DT"] || e["LOADING DATE"];
      const parts = getDateParts(dateVal);
      if (!parts) {
        return (e.month === m || parseInt(e.month, 10) === m) && (e.year === y || parseInt(e.year, 10) === y);
      }
      return parts.year === y && parts.month === m;
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

const AccountDetail = require('../models/AccountDetail');
const { syncPartyPayments } = require('./accountDetailRoutes');

// GET all manual entries for a specific month and year
router.get('/', async (req, res) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) {
      return res.status(400).json({ error: 'Month and year are required' });
    }

    const m = parseInt(month, 10);
    const y = parseInt(year, 10);

    // Auto-sync targeted Freight Payment entries from Bank Book for this month/year
    try {
      const freightDocs = await AccountDetail.find({
        ledgerName: { $regex: /^freight payment$/i },
        month: m,
        year: y
      }).lean();
      if (freightDocs.length > 0) {
        await syncPartyPayments(freightDocs);
      }
    } catch (syncErr) {
      console.warn('[PartyPaymentRoute] Auto-sync on fetch failed:', syncErr.message);
    }

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
      const setFields = {
        withholdAmount: record.withholdAmount !== undefined ? Number(record.withholdAmount) : 0,
        withholdReason: record.withholdReason || '',
        otherReason: record.otherReason || '',
        prevMonthDue: record.prevMonthDue !== undefined ? Number(record.prevMonthDue) : 0,
        recoveredToDac: record.recoveredToDac !== undefined ? Number(record.recoveredToDac) : 0,
        creditRefund: record.creditRefund !== undefined ? Number(record.creditRefund) : 0,
        paidToParty: record.paidToParty !== undefined ? Number(record.paidToParty) : 0,
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

    // 1. Fetch contacts, settings, saved manual entries, and breakdown in parallel
    const [allOwnerDocs, allTruckDocs, savedPartyPayments, settingsDoc, savedGstBreakdowns] = await Promise.all([
      ownerCol.find({}).toArray(),
      truckCol.find({}).toArray(),
      PartyPayment.find({
        vehicleNo: normTargetVeh,
        year: { $in: [startYear, endYear] }
      }).lean(),
      settingsCol.findOne({ key: 'projected_deductions' }),
      FreightCreditorGstBreakdown.find({
        vehicleNo: normTargetVeh,
        $or: [
          { fy: fyStr },
          { fy: fullFy },
          { year: { $in: [startYear, endYear] } }
        ]
      }).lean()
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
    const cementDocs = await cementCol.find({
      'VEHICLE NUMBER': { $regex: new RegExp(`^\\s*${normTargetVeh}\\s*$`, 'i') }
    }).toArray();

    // Group cement register entries by month & year (STRICTLY within fyStartDate -> reportEndDate)
    const tripsByMonthYear = {};
    FY_MONTH_DEFS.forEach(def => {
      tripsByMonthYear[`${def.month}_${def.year}`] = [];
    });

    cementDocs.forEach(row => {
      const dateVal = row['LOADING DT'] || row['LOADING DATE'] || row.date;
      const parsedD = parseDate(dateVal);
      if (parsedD) {
        // Enforce: must be within [fyStartDate, reportEndDate]
        if (parsedD >= fyStartDate && parsedD <= reportEndDate) {
          const m = parsedD.getMonth() + 1;
          const y = parsedD.getFullYear();
          const key = `${m}_${y}`;
          if (tripsByMonthYear[key]) {
            tripsByMonthYear[key].push(row);
          }
        }
      } else if (row.month && row.year) {
        const m = parseInt(row.month, 10);
        const y = parseInt(row.year, 10);
        const rowMonthStart = new Date(y, m - 1, 1, 0, 0, 0, 0);
        if (rowMonthStart >= fyStartDate && rowMonthStart <= reportEndDate) {
          const key = `${m}_${y}`;
          if (tripsByMonthYear[key]) {
            tripsByMonthYear[key].push(row);
          }
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

    // 3. Construct the 12 monthly rows
    const rows = await Promise.all(FY_MONTH_DEFS.map(async (def, idx) => {
      const m = def.month;
      const y = def.year;
      const monthKey = `${m}_${y}`;

      const monthStartDate = new Date(y, m - 1, 1, 0, 0, 0, 0);
      const lastDay = new Date(y, m, 0).getDate();
      const monthEndDate = new Date(y, m - 1, lastDay, 23, 59, 59, 999);

      // Determine date status:
      const isFuture = monthStartDate > reportEndDate;
      const isCurrent = !isFuture && (reportEndDate < monthEndDate);
      const isCompleted = !isFuture && !isCurrent;

      // For FUTURE months: Return empty/blank row structure with isFuture: true
      if (isFuture) {
        return {
          monthIndex: idx + 1,
          month: m,
          year: y,
          monthName: def.monthName,
          displayMonth: def.displayMonth,
          'MONTH': def.displayMonth,
          'OWNER NAME': resolvedOwnerName,
          'VEHICLE NO': normTargetVeh,
          'GROSS FREIGHT': null,
          'LOADING ADVANCE': null,
          'FUEL': null,
          'TDS': null,
          'TRAVELLING EXP': null,
          'DAMAGE RECOVERY': null,
          'CASH_BANK_OTHERS': null,
          'OTHER DEDUCTION': null,
          'OTHER REASON': '',
          'GPS TRIP CHARGE': null,
          'GPS DEVICE': null,
          'NET AMOUNT': null,
          '8.5% NVCL': null,
          'DEDICATED INCENTIVE': null,
          'RAFTER': null,
          'EXTRA U/L': null,
          'TOLL UP': null,
          'TOLL DOWN': null,
          'TDS ON INCENTIVE': null,
          'TOTAL FREIGHT': null,
          'GST FCM': null,
          'WITHHOLD AMOUNT': null,
          'WITHHOLD REASON': '',
          'PREV MONTH DUE': null,
          'NET PAYABLE': null,
          'RECOVERED TO DAC': null,
          'CREDIT REFUND': null,
          'PAID TO PARTY': null,
          'BALANCE DUE': null,
          'PAYMENT DATE': '',
          'REMARKS': '',
          tripCount: null,
          isFuture: true,
          status: 'future'
        };
      }

      // For Available Months (Completed or Current up to reportEndDate)
      const monthTrips = tripsByMonthYear[monthKey] || [];
      const saved = savedPartyMap[monthKey] || {};
      const savedGst = savedGstBreakdownMap[monthKey] || savedGstBreakdownMap[String(m)] || {};

      let grossFreight = 0;
      let loadingAdvance = 0;
      let fuel = 0;
      let travellingExp = 0;
      let damageRecovery = 0;
      let cashBankOthers = 0;
      let otherDeduction = 0;
      let gpsDevice = 0;
      let nvcl85 = 0;
      let rafter = 0;
      let extraUl = 0;
      let tollUp = 0;
      let tollDown = 0;

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

      monthTrips.forEach(row => {
        grossFreight += getF(row, 'BILLING ER 95%', 'BILLING ER VAR', 'BILLING @ 95% (PARTY PAYABLE)', 'BILLING@95%', 'AMOUNT');
        loadingAdvance += getF(row, 'ADVANCE');
        fuel += getF(row, 'HSD AMOUNT');
        travellingExp += getF(row, 'TRAVELLING EXP', 'TRAVELLING  EXP', 'TRAVEL EXP');

        const sAmt = getF(row, 'SHORTAGE (AMOUNT)', 'SHORTAGE AMOUNT');
        const sBags = getF(row, 'SHORTAGE (BAG)', 'SHORTAGE BAG');
        const sRate = getF(row, 'SHORTAGE (RATE)', 'SHORTAGE RATE');
        damageRecovery += sAmt || (sBags * sRate);

        cashBankOthers += getF(row, 'BANK TF', 'BANK TF ', 'Bank TF') + getF(row, 'Site Cash', 'SITE CASH', 'SITE_CASH') + getF(row, 'OFFICE CASH', 'Office Cash', 'OFFICE_CASH');
        otherDeduction += getF(row, 'OTHERS DEDUCTION', 'OTHERS  DEDUCTION', 'OTHER DEDUCTION', 'OTHERS', 'Others deduction', 'Other');
        gpsDevice += getF(row, 'GPS DEVICE', 'GPS  DEVICE');

        const extra85 = row['10W EXTRA 8.5%'] !== undefined
          ? num(row['10W EXTRA 8.5%'])
          : row['10W EXTRA 8'] !== undefined
            ? (typeof row['10W EXTRA 8'] === 'object'
              ? Object.values(row['10W EXTRA 8']).reduce((s, x) => s + num(x), 0)
              : num(row['10W EXTRA 8']))
            : 0;
        nvcl85 += extra85;

        rafter += getF(row, 'RAFTER');
        extraUl += getF(row, 'EXTRA UNLOADING', 'EXTRA  UNLOADING', 'EXTRA UL');
        tollUp += getF(row, 'UP TOLL', 'TOLL UP', 'TOLL_UP', 'TOLL UP ');
        tollDown += getF(row, 'DOWN TOLL', 'TOLL DOWN', 'TOLL_DOWN', 'TOLL DOWN ');
      });

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

      // ── Authoritative GST FCM resolution from Freight Creditor GST ──
      let gstFcm = null;
      const hasTrips = monthTrips.length > 0;
      const basicCurrM = hasTrips ? Math.round(grossFreight * 100) / 100 : null;
      const incentiveM2 = (savedGst.incentiveM2 !== undefined && savedGst.incentiveM2 !== null) ? Number(savedGst.incentiveM2) : null;
      const incentiveM1 = (savedGst.incentiveM1 !== undefined && savedGst.incentiveM1 !== null) ? Number(savedGst.incentiveM1) : null;

      if (incentiveM2 !== null || incentiveM1 !== null || basicCurrM !== null) {
        gstFcm = Math.round(((incentiveM2 || 0) + (incentiveM1 || 0) + (basicCurrM || 0)) * 100) / 100;
      }

      // Net Payable
      const withholdAmount = num(saved.withholdAmount);
      const prevMonthDue = num(saved.prevMonthDue);
      const netPayable = round2(totalFreight + (gstFcm || 0) + prevMonthDue - withholdAmount);

      // Balance Due
      const paidToParty = num(saved.paidToParty);
      const balanceDue = round2(netPayable - paidToParty);

      return {
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
        'RECOVERED TO DAC': num(saved.recoveredToDac),
        'CREDIT REFUND': num(saved.creditRefund),
        'PAID TO PARTY': paidToParty,
        'BALANCE DUE': balanceDue,
        'PAYMENT DATE': saved.paymentDate || '',
        'REMARKS': saved.remarks || '',
        tripCount: monthTrips.length,
        isFuture: false,
        status: isCurrent ? 'current' : 'completed'
      };
    }));

    // 4. Compute Full Financial Year Summary Totals (EXCLUDING FUTURE MONTHS)
    const numericKeys = [
      'GROSS FREIGHT', 'LOADING ADVANCE', 'FUEL', 'TDS', 'TRAVELLING EXP',
      'DAMAGE RECOVERY', 'CASH_BANK_OTHERS', 'OTHER DEDUCTION', 'GPS TRIP CHARGE',
      'GPS DEVICE', 'NET AMOUNT', '8.5% NVCL', 'DEDICATED INCENTIVE', 'RAFTER',
      'EXTRA U/L', 'TOLL UP', 'TOLL DOWN', 'TDS ON INCENTIVE', 'TOTAL FREIGHT',
      'GST FCM', 'WITHHOLD AMOUNT', 'PREV MONTH DUE', 'NET PAYABLE',
      'RECOVERED TO DAC', 'CREDIT REFUND', 'PAID TO PARTY', 'BALANCE DUE'
    ];

    const totals = {};
    numericKeys.forEach(k => { totals[k] = 0; });
    let hasAnyGstFcm = false;

    rows.forEach(r => {
      if (r.isFuture) return; // Strictly ignore future months in totals
      numericKeys.forEach(k => {
        if (k === 'GST FCM') {
          if (r[k] !== null && r[k] !== undefined) {
            totals[k] += Number(r[k]);
            hasAnyGstFcm = true;
          }
        } else {
          if (r[k] !== null && r[k] !== undefined) {
            totals[k] += num(r[k]);
          }
        }
      });
    });

    if (!hasAnyGstFcm) {
      totals['GST FCM'] = null;
    }

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
