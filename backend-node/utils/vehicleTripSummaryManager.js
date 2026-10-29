const mongoose = require('mongoose');

function getCementDb() {
  return mongoose.connection.useDb('cement_register');
}

function getInvoiceDb() {
  return mongoose.connection.useDb('invoice_system');
}

function getTripSummaryCol() {
  return getCementDb().collection('vehicle_trip_summaries');
}

function safeGetIO() {
  try {
    const { getIO } = require('../socket');
    return getIO();
  } catch (_) {
    return null;
  }
}

function emitUpdate(event, data) {
  const io = safeGetIO();
  if (io) io.emit(event, data);
}

const parseNum = (val) => {
  if (val === undefined || val === null || val === '') return 0;
  const n = parseFloat(String(val).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};

function normVeh(v) {
  if (!v) return '';
  return String(v).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

function getCanonicalTruckNo(val) {
  if (!val) return '';
  const s = String(val).trim().toUpperCase();
  const digits = s.match(/\d{4}$/);
  if (digits) return digits[0];
  const anyDigits = s.match(/\d{3,4}/);
  if (anyDigits) return anyDigits[0];
  return normVeh(s);
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function getDatePatterns(dateStr) {
  if (!dateStr) return [];
  const s = String(dateStr).trim();
  const parts = s.split(/[\/\-\.]/);
  if (parts.length !== 3) return [s];

  let y, m, d;
  if (parts[0].length === 4) {
    y = parts[0];
    m = parts[1];
    d = parts[2];
  } else {
    d = parts[0];
    m = parts[1];
    y = parts[2];
    if (y.length === 2) y = (parseInt(y, 10) >= 70 ? '19' : '20') + y;
  }

  const mm = String(parseInt(m, 10)).padStart(2, '0');
  const mSingle = String(parseInt(m, 10));
  const dd = String(parseInt(d, 10)).padStart(2, '0');
  const dSample = String(parseInt(d, 10));

  return [
    `${dd}-${mm}-${y}`,
    `${dSample}-${mSingle}-${y}`,
    `${dd}/${mm}/${y}`,
    `${dSample}/${mSingle}/${y}`,
    `${dd}.${mm}.${y}`,
    `${dSample}.${mSingle}.${y}`,
    `${y}-${mm}-${dd}`,
    `${y}/${mm}/${dd}`,
    `${y}.${mm}.${dd}`
  ];
}

/**
 * Fetch authoritative registered vehicles directory from Party Master:
 * - invoice_system."owner details"
 * - invoice_system."Truck Contact Number"
 * - lorrey."truck_contacts"
 * Indexed by exact normalized registration and 4-digit commercial suffix.
 */
async function getAllRegisteredVehiclesDirectory() {
  const list = [];
  const byNorm = new Map();
  const bySuffix = new Map();

  try {
    const ownerCol = getInvoiceDb().collection('owner details');
    const truckCol = getInvoiceDb().collection('Truck Contact Number');
    const lorreyTruckCol = mongoose.connection.useDb('lorrey').collection('truck_contacts');

    const ownerDocs = await ownerCol.find({}).toArray();
    const truckDocs = await truckCol.find({}).toArray();
    let lorreyDocs = [];
    try {
      lorreyDocs = await lorreyTruckCol.find({}).toArray();
    } catch (_) {}

    function register(doc) {
      const rawNo = (doc['Truck No'] || doc['Truck No '] || doc.truck_no || doc.vehicleNo || doc._id.toString()).toString().trim().toUpperCase();
      const normKey = rawNo.replace(/[^A-Z0-9]/g, '');
      if (!normKey || normKey.length < 3) return;
      if (byNorm.has(normKey)) return;

      const ownerName = (doc['Owner Name'] || doc['Owner Name '] || doc.owner_name || doc.owner || '').trim();
      const wheel = (doc['Type of vehicle'] || doc['Type of vehicle '] || doc.veh_type || doc.wheel || '').trim();
      const custType = (doc['TYPE OF CUSTOMER '] || doc['TYPE OF CUSTOMER'] || doc.custType || doc.type_of_customer || '').trim();
      const dedicatedType = (doc['Dedicated Type'] || doc['Dedicated Type '] || doc.dedicated_type || doc.dedicatedType || '').trim();

      const item = {
        vehicleNo: rawNo,
        normKey,
        ownerName,
        wheel,
        custType,
        dedicatedType
      };

      list.push(item);
      byNorm.set(normKey, item);

      if (normKey.length >= 4) {
        const s4 = normKey.slice(-4);
        if (!bySuffix.has(s4)) {
          bySuffix.set(s4, item);
        }
      }
    }

    ownerDocs.forEach(register);
    truckDocs.forEach(register);
    lorreyDocs.forEach(register);
  } catch (err) {
    console.warn('[vehicleTripSummaryManager] Error fetching registered vehicles:', err.message);
  }

  return { list, byNorm, bySuffix };
}

/**
 * Resolves contact matching a vehicle string (supports 4-digit commercial suffix & full registration).
 */
function findMatchingContact(normKey, arg2, arg3, arg4) {
  if (!normKey) return null;
  let directory = null;
  let rawVeh = '';
  let rowOwner = '';

  if (arg2 && (arg2.byNorm || arg2.list)) {
    directory = arg2;
    rowOwner = arg3 || '';
  } else if (arg3 && (arg3.byNorm || arg3.list)) {
    rawVeh = arg2 || '';
    directory = arg3;
    rowOwner = arg4 || '';
  } else if (arg4 && (arg4.byNorm || arg4.list)) {
    rawVeh = arg2 || '';
    rowOwner = arg3 || '';
    directory = arg4;
  }

  if (!directory) return null;

  // 1. Exact normalized match
  if (directory.byNorm.has(normKey)) {
    return directory.byNorm.get(normKey);
  }

  // 2. 4-digit suffix match
  if (normKey.length >= 4) {
    const s4 = normKey.slice(-4);
    if (directory.bySuffix.has(s4)) {
      return directory.bySuffix.get(s4);
    }
  }

  // 3. Bidirectional suffix search in list
  const matches = directory.list.filter(c => {
    if (c.normKey.length >= 4 && normKey.length >= 4) {
      return c.normKey.endsWith(normKey) || normKey.endsWith(c.normKey);
    }
    return false;
  });

  if (matches.length === 1) return matches[0];
  if (matches.length > 1 && rowOwner) {
    const cleanRowOwner = String(rowOwner).trim().toLowerCase();
    const ownerMatch = matches.find(c => {
      const cOwner = (c.ownerName || '').toLowerCase();
      return cOwner === cleanRowOwner || cOwner.includes(cleanRowOwner) || cleanRowOwner.includes(cOwner);
    });
    if (ownerMatch) return ownerMatch;
  }

  return matches[0] || null;
}

/**
 * Calculate and persist the complete Vehicle-Wise Trip Summary for the selected FY, Month, or Date.
 * Persists records into MongoDB collection `cement_register.vehicle_trip_summaries`.
 */
async function calculateAndPersistVehicleTripSummary({ fy, month, date } = {}) {
  // 1. Determine Financial Year bounds
  let startYear = 2026;
  if (fy && fy !== 'ALL') {
    const parts = String(fy).replace(/^FY\s*/i, '').split('-');
    let sy = parseInt(parts[0], 10);
    if (sy < 100) sy += 2000;
    if (!isNaN(sy)) startYear = sy;
  } else if (date && date !== 'ALL') {
    const dParts = String(date).split(/[\/\-\.]/);
    if (dParts.length === 3) {
      let yr = parseInt(dParts[0], 10);
      let mo = parseInt(dParts[1], 10);
      if (dParts[0].length <= 2 && dParts[2].length >= 4) {
        yr = parseInt(dParts[2], 10);
        mo = parseInt(dParts[1], 10);
      }
      startYear = mo >= 4 ? yr : yr - 1;
    }
  }

  let targetMonthName = month && month !== 'ALL' ? month : 'October';
  let mIdx = MONTH_NAMES.findIndex(m => m.toLowerCase() === String(targetMonthName).toLowerCase());
  if (mIdx === -1) mIdx = 9; // Default October (0-indexed 9)
  const monthInt = mIdx + 1; // 1-12
  const targetYear = mIdx < 3 ? startYear + 1 : startYear;
  const daysInMonth = new Date(targetYear, monthInt, 0).getDate();
  targetMonthName = MONTH_NAMES[mIdx];

  // 2. Build filter for Cement Register single source of truth
  let cementFilter = {};
  if (date && date !== 'ALL') {
    const patterns = getDatePatterns(date);
    if (monthInt && targetYear) {
      cementFilter = {
        $and: [
          {
            $or: [
              { 'LOADING DT': { $in: patterns } },
              { 'LOADING DATE': { $in: patterns } },
              { 'BILL DATE': { $in: patterns } }
            ]
          },
          {
            $or: [
              { month: { $in: [monthInt, String(monthInt)] }, year: { $in: [targetYear, String(targetYear)] } },
              { month: { $exists: false } },
              { month: null }
            ]
          }
        ]
      };
    } else {
      cementFilter = {
        $or: [
          { 'LOADING DT': { $in: patterns } },
          { 'LOADING DATE': { $in: patterns } },
          { 'BILL DATE': { $in: patterns } }
        ]
      };
    }
  } else {
    cementFilter = {
      $or: [
        { month: monthInt, year: targetYear },
        { month: String(monthInt), year: String(targetYear) }
      ]
    };
  }

  const cementCol = getCementDb().collection('entries');
  const rawDocs = await cementCol.find(cementFilter).toArray();

  // 3. Authoritative Party Master Registered Vehicles Directory
  const directory = await getAllRegisteredVehiclesDirectory();
  const totalRegisteredVehicles = directory.list.length;

  // 4. Group and deduplicate trips strictly by unique MongoDB _id
  const now = new Date();
  const isCurrentMonth = (targetYear === now.getFullYear() && monthInt === (now.getMonth() + 1));
  const maxDayAllowed = isCurrentMonth ? now.getDate() : daysInMonth;

  const seenTripIds = new Set();
  const vehMap = {};
  const daysArray = [];
  for (let i = 1; i <= daysInMonth; i++) {
    daysArray.push(String(i).padStart(2, '0'));
  }

  rawDocs.forEach(row => {
    const id = String(row._id);
    if (seenTripIds.has(id)) return;
    seenTripIds.add(id);

    const rawVeh = row['VEHICLE NUMBER'] || row['VEHICLE NO'] || row['VEHICLE NO.'] || '';
    const vehClean = String(rawVeh).trim().toUpperCase();
    const normKey = vehClean.replace(/[^A-Z0-9]/g, '');
    // Allow 3- and 4-digit commercial truck numbers (e.g. 0800, 6016, 1024)
    if (!normKey || normKey.length < 3) return;

    const loadDateRaw = row['LOADING DT'] || row['LOADING DATE'] || row['BILL DATE'] || '';
    let dayNum = null;
    if (loadDateRaw) {
      const parts = String(loadDateRaw).trim().split(/[\/\-\.]/);
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          dayNum = parseInt(parts[2], 10);
        } else {
          dayNum = parseInt(parts[0], 10);
        }
      }
    }

    // If current month, do not include future days
    if (isCurrentMonth && dayNum !== null && dayNum > maxDayAllowed) return;

    const mtVal = parseNum(row['MT']);
    const billAmt = parseNum(row['Billing Amount'] || row['BILLING AMOUNT'] || row['AMOUNT']);
    const invNo = String(row['INVOICE NO'] || row['INVOICE NO.'] || '').trim();
    const advVal = parseNum(row['ADVANCE'] || row['LOADING ADVANCE']);
    const hsdLtr = parseNum(row['HSD (LTR)'] || row['QTY (LTR)']);
    const hsdAmt = parseNum(row['HSD AMOUNT']);

    // Exclude pure adjustment / diesel deduction rows with no MT, no amount, and no invoice
    if (mtVal === 0 && billAmt === 0 && !invNo) return;

    // Match Party Master registered contact
    const contact = findMatchingContact(normKey, vehClean, row['OWNER NAME'] || row['PARTY NAME'], directory);

    // Group stably by canonical registered vehicle key to prevent split duplicate entries
    const canonicalKey = contact ? contact.normKey : normKey;
    const canonicalVehNo = contact ? contact.vehicleNo : vehClean;

    if (!vehMap[canonicalKey]) {
      let rawWheel = String(
        row['WHEEL'] ||
        row['Type of vehicle'] ||
        row['Type of vehicle '] ||
        row['VEHICLE TYPE'] ||
        row['veh_type'] ||
        row['wheel'] ||
        (contact ? contact.wheel : '') ||
        ''
      ).trim().toUpperCase();
      let wheelKey = 'OTHER';
      if (rawWheel.includes('10')) wheelKey = '10W';
      else if (rawWheel.includes('12')) wheelKey = '12W';
      else if (rawWheel.includes('14')) wheelKey = '14W';
      else if (rawWheel.includes('6')) wheelKey = '6W';

      // Standard MT capacity mapping: 6W -> 13 MT, 10W -> 19 MT, 12W -> 25 MT, 14W -> 30 MT
      let standardCapMT = 0;
      let formattedWheelType = rawWheel || 'OTHER';
      if (wheelKey === '6W' || rawWheel.includes('6')) {
        standardCapMT = 13;
        formattedWheelType = '6-Wheel';
      } else if (wheelKey === '10W' || rawWheel.includes('10')) {
        standardCapMT = 19;
        formattedWheelType = '10-Wheel';
      } else if (wheelKey === '12W' || rawWheel.includes('12')) {
        standardCapMT = 25;
        formattedWheelType = '12-Wheel';
      } else if (wheelKey === '14W' || rawWheel.includes('14')) {
        standardCapMT = 30;
        formattedWheelType = '14-Wheel';
      }

      const rawDedicated = String(row['DEDICATED'] || '').trim();
      const hasDedicatedAmt = rawDedicated && rawDedicated !== '-' && parseNum(rawDedicated) > 0;
      const isDedicatedParty = contact && String(contact.dedicatedType || '').trim().toLowerCase() === 'dedicated';

      vehMap[canonicalKey] = {
        vehicleNo: canonicalVehNo,
        normKey: canonicalKey,
        shortVehicleNo: canonicalKey.length >= 4 ? canonicalKey.slice(-4) : canonicalKey,
        wheel: formattedWheelType,
        wheelType: formattedWheelType,
        wheelPattern: wheelKey,
        capacityMT: standardCapMT,
        capacity: standardCapMT > 0 ? `${standardCapMT} MT` : '-',
        isDedicatedInitial: Boolean(hasDedicatedAmt || isDedicatedParty),
        contactOwner: ((contact ? contact.ownerName : '') || row['OWNER NAME'] || '').trim(),
        ownerName: ((contact ? contact.ownerName : '') || row['OWNER NAME'] || '').trim(),
        distinctMTs: new Set(),
        dailyMT: {},
        dailyTrips: {},
        dailyTripDocs: {},
        totalRawInvoices: 0,
        totalMT: 0,
        totalTrips: 0,
        totalAdvance: 0,
        totalBillingAmt: 0,
        totalDieselLtr: 0,
        totalDieselAmt: 0,
        trips: []
      };
    }

    const v = vehMap[canonicalKey];
    if (!v.ownerName && (row['OWNER NAME'] || row['PARTY NAME'])) {
      v.ownerName = (row['OWNER NAME'] || row['PARTY NAME']).trim();
      v.contactOwner = v.ownerName;
    }
    if (mtVal > 0) {
      v.distinctMTs.add(mtVal);
      v.totalMT += mtVal;
    }
    v.totalAdvance += advVal;
    v.totalBillingAmt += billAmt;
    v.totalDieselLtr += hsdLtr;
    v.totalDieselAmt += hsdAmt;
    v.trips.push(row);
    v.totalRawInvoices += 1;

    if (dayNum !== null && dayNum >= 1 && dayNum <= daysInMonth) {
      const dayStr = String(dayNum).padStart(2, '0');
      v.dailyMT[dayStr] = (v.dailyMT[dayStr] || 0) + mtVal;
      if (!v.dailyTripDocs[dayStr]) v.dailyTripDocs[dayStr] = [];
      v.dailyTripDocs[dayStr].push(row);
    }
  });

  // 5. Finalize vehicle patterns, date-wise trip counts (Date MT / Capacity), and totals
  const vehicleList = Object.values(vehMap).map(v => {
    const mtArray = Array.from(v.distinctMTs).sort((a, b) => a - b);
    let loadingPatternStr = '';
    if (mtArray.length > 0) {
      loadingPatternStr = mtArray.map(m => `${m}MT`).join(' / ');
    } else {
      if (v.wheelPattern === '10W') loadingPatternStr = '19MT';
      else if (v.wheelPattern === '12W') loadingPatternStr = '25MT';
      else if (v.wheelPattern === '14W') loadingPatternStr = '30MT';
      else if (v.wheelPattern === '6W') loadingPatternStr = '13MT';
      else loadingPatternStr = '-';
    }

    const standardCap = v.capacityMT > 0 ? v.capacityMT : 0;
    const totalLoadedMT = Math.round(v.totalMT * 100) / 100;

    // Date-Wise Trip Count Calculation: TRIP COUNT = TOTAL MT LOADED ON THAT DATE / VEHICLE MT CAPACITY
    const computedDailyTrips = {};
    const computedDailyMT = {};
    daysArray.forEach(dayStr => {
      const dayMT = Math.round((v.dailyMT[dayStr] || 0) * 100) / 100;
      computedDailyMT[dayStr] = dayMT;
      if (dayMT > 0) {
        if (standardCap > 0) {
          const rawTrips = dayMT / standardCap;
          computedDailyTrips[dayStr] = Math.round(rawTrips * 100) / 100;
        } else {
          computedDailyTrips[dayStr] = (v.dailyTripDocs[dayStr] || []).length;
        }
      } else {
        computedDailyTrips[dayStr] = 0;
      }
    });

    // Overall Trip Count: Total MT / Capacity
    let calculatedTotalTrips = 0;
    if (standardCap > 0) {
      const rawTotalTrips = totalLoadedMT / standardCap;
      calculatedTotalTrips = Math.round(rawTotalTrips * 100) / 100;
    } else {
      calculatedTotalTrips = v.totalRawInvoices;
    }

    const meetsRaftarThreshold = (v.wheelPattern === '10W' && calculatedTotalTrips >= 8) ||
      ((v.wheelPattern === '12W' || v.wheelPattern === '14W') && calculatedTotalTrips >= 6);
    const isDedicated = v.isDedicatedInitial || meetsRaftarThreshold;

    return {
      ...v,
      capacityMT: standardCap,
      capacity: standardCap > 0 ? `${standardCap} MT` : '-',
      distinctMTs: Array.from(v.distinctMTs),
      totalMT: totalLoadedMT,
      totalTrips: calculatedTotalTrips,
      dailyMT: computedDailyMT,
      dailyTrips: computedDailyTrips,
      totalAdvance: Math.round(v.totalAdvance * 100) / 100,
      totalBillingAmt: Math.round(v.totalBillingAmt * 100) / 100,
      totalDieselLtr: Math.round(v.totalDieselLtr * 100) / 100,
      totalDieselAmt: Math.round(v.totalDieselAmt * 100) / 100,
      loadingPattern: loadingPatternStr,
      isDedicated,
      meetsRaftarThreshold,
      classification: isDedicated ? 'DEDICATED (Both Side)' : 'SINGLE SIDE (Non-Dedicated)'
    };
  });

  // Sort stably: 10W -> 12W -> 14W -> 6W -> OTHER, then alphabetical
  const patternSortOrder = { '10W': 1, '12W': 2, '14W': 3, '6W': 4, 'OTHER': 5 };
  vehicleList.sort((a, b) => {
    const pA = patternSortOrder[a.wheelPattern] || 99;
    const pB = patternSortOrder[b.wheelPattern] || 99;
    if (pA !== pB) return pA - pB;
    return a.vehicleNo.localeCompare(b.vehicleNo);
  });

  const byPattern = { '10W': [], '12W': [], '14W': [], '6W': [], 'OTHER': [] };
  vehicleList.forEach(v => {
    if (byPattern[v.wheelPattern]) byPattern[v.wheelPattern].push(v);
    else byPattern['OTHER'].push(v);
  });

  const dayTotals = {};
  const dayMTTotals = {};
  daysArray.forEach(d => {
    dayTotals[d] = 0;
    dayMTTotals[d] = 0;
  });
  let grandTotalTrips = 0;
  let grandTotalMT = 0;
  let grandTotalAdvance = 0;

  vehicleList.forEach(v => {
    grandTotalTrips += v.totalTrips;
    grandTotalMT += v.totalMT;
    grandTotalAdvance += v.totalAdvance;
    daysArray.forEach(d => {
      dayTotals[d] = Math.round((dayTotals[d] + (v.dailyTrips[d] || 0)) * 100) / 100;
      dayMTTotals[d] = Math.round((dayMTTotals[d] + (v.dailyMT[d] || 0)) * 100) / 100;
    });
  });

  const resolvedFY = fy || `FY ${startYear}-${String(startYear + 1).slice(-2)}`;

  // 6. PERSISTENCE: Save/update vehicle trip summary records into MongoDB collection `cement_register.vehicle_trip_summaries`
  try {
    const summaryCol = getTripSummaryCol();
    if (vehicleList.length > 0) {
      const bulkOps = vehicleList.map(v => ({
        updateOne: {
          filter: {
            normKey: v.normKey,
            month: monthInt,
            year: targetYear
          },
          update: {
            $set: {
              financialYear: resolvedFY,
              month: monthInt,
              monthName: targetMonthName,
              year: targetYear,
              vehicleNo: v.vehicleNo,
              canonicalVehicleNo: v.vehicleNo,
              normKey: v.normKey,
              shortVehicleNo: v.shortVehicleNo,
              wheel: v.wheel,
              wheelType: v.wheelType,
              wheelPattern: v.wheelPattern,
              capacityMT: v.capacityMT,
              capacity: v.capacity,
              isDedicated: v.isDedicated,
              isDedicatedInitial: v.isDedicatedInitial,
              meetsRaftarThreshold: v.meetsRaftarThreshold,
              classification: v.classification,
              contactOwner: v.contactOwner,
              loadingPattern: v.loadingPattern,
              distinctMTs: v.distinctMTs,
              totalTrips: v.totalTrips,
              totalMT: v.totalMT,
              totalAdvance: v.totalAdvance,
              totalBillingAmt: v.totalBillingAmt,
              totalDieselLtr: v.totalDieselLtr,
              totalDieselAmt: v.totalDieselAmt,
              dailyMT: v.dailyMT,
              dailyTrips: v.dailyTrips,
              updatedAt: new Date()
            }
          },
          upsert: true
        }
      }));

      await summaryCol.bulkWrite(bulkOps);
    }
  } catch (persistErr) {
    console.warn('[vehicleTripSummaryManager] Failed to persist trip summaries to MongoDB:', persistErr.message);
  }

  return {
    success: true,
    fy: resolvedFY,
    month: targetMonthName,
    year: targetYear,
    totalDays: daysInMonth,
    daysArray,
    selectedDate: date || 'ALL',
    vehicles: vehicleList,
    byPattern,
    totals: {
      totalVehicles: totalRegisteredVehicles,
      totalRegisteredVehicles,
      activeVehiclesCount: vehicleList.length,
      totalTrips: Math.round(grandTotalTrips * 100) / 100,
      totalMT: Math.round(grandTotalMT * 100) / 100,
      totalAdvance: Math.round(grandTotalAdvance * 100) / 100,
      dayTotals,
      dayMTTotals
    }
  };
}

/**
 * Hook to automatically synchronize vehicle trip summary when Cement Register entries change.
 */
async function hookSyncVehicleTripSummary(entryOrEntries) {
  if (!entryOrEntries) return;
  const entries = Array.isArray(entryOrEntries) ? entryOrEntries : [entryOrEntries];

  const processedMonthYears = new Set();
  for (const entry of entries) {
    if (!entry) continue;
    let m = entry.month;
    let y = entry.year;

    if (!m || !y) {
      const dStr = entry['LOADING DT'] || entry['LOADING DATE'] || entry['BILL DATE'] || entry.date;
      if (dStr) {
        const parts = String(dStr).trim().split(/[\/\-\.]/);
        if (parts.length === 3) {
          if (parts[0].length === 4) {
            y = parseInt(parts[0], 10);
            m = parseInt(parts[1], 10);
          } else {
            m = parseInt(parts[1], 10);
            y = parseInt(parts[2], 10);
            if (y < 100) y += 2000;
          }
        }
      }
    }

    const mInt = typeof m === 'number' ? m : parseInt(m, 10);
    const yInt = typeof y === 'number' ? y : parseInt(y, 10);
    if (!mInt || !yInt || isNaN(mInt) || isNaN(yInt)) continue;

    const myKey = `${mInt}_${yInt}`;
    if (processedMonthYears.has(myKey)) continue;
    processedMonthYears.add(myKey);

    const mName = MONTH_NAMES[mInt - 1];
    const fy = mInt >= 4 ? `FY ${yInt}-${String(yInt + 1).slice(-2)}` : `FY ${yInt - 1}-${String(yInt).slice(-2)}`;

    try {
      await calculateAndPersistVehicleTripSummary({ fy, month: mName });
    } catch (err) {
      console.warn(`[vehicleTripSummaryManager] hookSync error for ${mName} ${yInt}:`, err.message);
    }
  }

  if (processedMonthYears.size > 0) {
    emitUpdate('tripSummaryUpdated', { count: processedMonthYears.size });
  }
}

module.exports = {
  normVeh,
  getCanonicalTruckNo,
  getAllRegisteredVehiclesDirectory,
  findMatchingContact,
  calculateAndPersistVehicleTripSummary,
  hookSyncVehicleTripSummary,
  getTripSummaryCol
};
