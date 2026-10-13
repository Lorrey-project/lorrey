const mongoose = require('mongoose');
const { parseCalendarDate } = require('./billRegisterHelper');
const {
  normalizeDate,
  parseBasicFreightCommission,
  parseIncentiveCommission,
  applyEffectiveEdit
} = require('./partyMasterHelper');

function getInvoiceDb() {
  return mongoose.connection.useDb('invoice_system');
}

function getCementDb() {
  return mongoose.connection.useDb('cement_register');
}

function safeEmit(event, data) {
  try {
    const { getIO } = require('../socket');
    const io = getIO();
    if (io) io.emit(event, data);
  } catch (_) {}
}

function normVeh(v) {
  if (!v) return '';
  return String(v).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/**
 * Normalizes wheel type labels into standard format: '6WH', '10WH', '12WH', '14WH'
 */
function normalizeWheelType(val) {
  if (!val) return '';
  const str = String(val).trim().toUpperCase();
  if (str.includes('6')) return '6WH';
  if (str.includes('10')) return '10WH';
  if (str.includes('12')) return '12WH';
  if (str.includes('14')) return '14WH';
  return str;
}

function is6Wheel(val) {
  return normalizeWheelType(val) === '6WH';
}

function is10or12or14Wheel(val) {
  const norm = normalizeWheelType(val);
  return norm === '10WH' || norm === '12WH' || norm === '14WH';
}

/**
 * Checks whether a given contact document, payload, or relationship type string represents MKT.
 */
function isMktRelationship(doc) {
  if (!doc) return false;
  const raw = (typeof doc === 'object') ? (
    doc["TYPE OF CUSTOMER "] ??
    doc["TYPE OF CUSTOMER"] ??
    doc.custType ??
    doc.type_of_customer ??
    doc.relationshipType ??
    doc.type ??
    doc.RelationshipType ??
    doc["Relationship Type"] ??
    doc["Relationship Type "]
  ) : doc;
  if (raw === undefined || raw === null) return false;
  const s = String(raw).trim().toUpperCase();
  return s === 'MKT' || s.startsWith('MKT');
}

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'
];

/**
 * Resolves month (1-12) and 4-digit year from given inputs or current date.
 */
function resolveMonthYear(monthInput, yearInput, dateInput = null) {
  let mInt = null;
  let yInt = null;

  if (dateInput) {
    const cal = parseCalendarDate(dateInput);
    if (cal) {
      mInt = cal.month;
      yInt = cal.year;
    }
  }

  if (!mInt && monthInput !== undefined && monthInput !== null && monthInput !== '') {
    if (typeof monthInput === 'number') {
      mInt = monthInput;
    } else {
      const parsed = parseInt(monthInput, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 12) {
        mInt = parsed;
      } else {
        const idx = MONTH_NAMES.indexOf(String(monthInput).trim().toLowerCase());
        if (idx >= 0) mInt = idx + 1;
      }
    }
  }

  if (!yInt && yearInput !== undefined && yearInput !== null && yearInput !== '') {
    const yParsed = parseInt(yearInput, 10);
    if (!isNaN(yParsed)) {
      yInt = yParsed < 100 ? 2000 + yParsed : yParsed;
    }
  }

  const now = new Date();
  if (!mInt) mInt = now.getMonth() + 1;
  if (!yInt) yInt = now.getFullYear();

  return { month: mInt, year: yInt };
}

/**
 * Authoritative completed-trip counting for a vehicle within an applicable calendar month & year.
 * Excludes dummy/adjustment entries and deduplicates duplicate invoice references.
 */
async function countQualifyingCompletedTrips(vehicleNumber, monthInput, yearInput, dateInput = null) {
  const targetVeh = normVeh(vehicleNumber);
  if (!targetVeh || targetVeh.length < 4) return 0;

  const { month: targetMonth, year: targetYear } = resolveMonthYear(monthInput, yearInput, dateInput);

  const entriesCol = getCementDb().collection('entries');

  // Space-agnostic regex for vehicle matching
  const regexStr = targetVeh.split('').join('[^a-zA-Z0-9]*');
  const vRegex = new RegExp(`^[^a-zA-Z0-9]*${regexStr}[^a-zA-Z0-9]*$`, 'i');

  const query = {
    $or: [
      { "VEHICLE NUMBER": vRegex },
      { "VEHICLE NO": vRegex },
      { "VEHICLE NO.": vRegex },
      { vehicleNumber: vRegex },
      { "Truck No": vRegex },
      { "Truck No ": vRegex },
      { truck_no: vRegex }
    ]
  };

  const docs = await entriesCol.find(query).toArray();

  const seenDocIds = new Set();
  const seenInvoices = new Set();
  let qualifyingCount = 0;

  for (const row of docs) {
    const docId = String(row._id);
    if (seenDocIds.has(docId)) continue;
    seenDocIds.add(docId);

    // 1. Strict vehicle identity match
    const rowVehRaw = row["VEHICLE NUMBER"] || row["VEHICLE NO"] || row["VEHICLE NO."] || row.vehicleNumber || row["Truck No"] || row["Truck No "] || row.truck_no;
    const rowVeh = normVeh(rowVehRaw);
    if (rowVeh !== targetVeh) continue;

    // 2. Resolve calendar month and year
    const dateRaw = row["LOADING DT"] || row["LOADING DATE"] || row["BILL DATE"] || row["RECEIVING DATE"] || row["INVOICE DATE"] || row.date;
    let rowMonth = null;
    let rowYear = null;
    const cal = parseCalendarDate(dateRaw);
    if (cal) {
      rowMonth = cal.month;
      rowYear = cal.year;
    } else {
      if (row.month !== undefined && row.month !== null) {
        if (typeof row.month === 'number') {
          rowMonth = row.month;
        } else {
          const p = parseInt(row.month, 10);
          if (!isNaN(p)) rowMonth = p;
          else {
            const idx = MONTH_NAMES.indexOf(String(row.month).trim().toLowerCase());
            if (idx >= 0) rowMonth = idx + 1;
          }
        }
      }
      if (row.year !== undefined && row.year !== null) {
        const yP = parseInt(row.year, 10);
        if (!isNaN(yP)) rowYear = yP < 100 ? 2000 + yP : yP;
      }
    }

    if (rowMonth !== targetMonth || rowYear !== targetYear) continue;

    // 3. Exclude incomplete, dummy, or invalid records
    if (row.isDummy === true || row._isDummy === true || row._source === 'auto_dummy') continue;

    const mtVal = parseFloat(String(row["MT"] || row.mt || 0).replace(/,/g, '')) || 0;
    const billAmt = parseFloat(String(row["Billing Amount"] || row["BILLING AMOUNT"] || row["AMOUNT"] || row.amount || 0).replace(/,/g, '')) || 0;
    const invNo = String(row["INVOICE NO"] || row["INVOICE NO."] || row.invoiceNo || row["Invoice No"] || "").trim();
    const shipmentNo = String(row["SHIPMENT NO"] || row["SHIPMENT NUMBER"] || row.shipmentNo || "").trim();

    // Pure adjustment row with no MT, no amount, and no invoice
    if (mtVal === 0 && billAmt === 0 && !invNo && !shipmentNo) continue;

    const upperInv = invNo.toUpperCase();
    if (
      upperInv.includes("DUMMY") ||
      upperInv.includes("CASH VOUCHER") ||
      upperInv === "NO SLIP" ||
      upperInv === "-" ||
      upperInv === "—" ||
      upperInv === "N/A" ||
      upperInv === "NA"
    ) {
      continue;
    }

    // 4. Deduplicate multiple records sharing the same invoice reference
    if (invNo) {
      const cleanInv = upperInv.replace(/\s+/g, '');
      if (seenInvoices.has(cleanInv)) {
        continue; // Already counted this invoice trip
      }
      seenInvoices.add(cleanInv);
    }

    qualifyingCount++;
  }

  return qualifyingCount;
}

/**
 * Evaluates default commission rates for MKT vehicles based on wheel type and qualifying trips.
 */
async function evaluateMktCommission(vehicleNumber, wheelType, relationshipType, monthInput, yearInput, dateInput = null) {
  if (!isMktRelationship({ custType: relationshipType })) {
    return null;
  }

  const normWheel = normalizeWheelType(wheelType);

  if (is10or12or14Wheel(normWheel)) {
    return {
      isMkt: true,
      wheelType: normWheel,
      basicFreightCommission: 0.05,
      incentiveCommission: 0.05,
      tripCount: 0,
      meetsThreshold: false
    };
  }

  if (is6Wheel(normWheel)) {
    const tripCount = await countQualifyingCompletedTrips(vehicleNumber, monthInput, yearInput, dateInput);
    const meetsThreshold = tripCount >= 6;
    return {
      isMkt: true,
      wheelType: '6WH',
      basicFreightCommission: meetsThreshold ? 0.07 : 0.05,
      incentiveCommission: 0.07,
      tripCount,
      meetsThreshold
    };
  }

  // Fallback for other MKT wheel configurations
  return {
    isMkt: true,
    wheelType: normWheel || 'OTHER',
    basicFreightCommission: 0.05,
    incentiveCommission: 0.05,
    tripCount: 0,
    meetsThreshold: false
  };
}

/**
 * Checks an eligible 6-wheel MKT vehicle against the 6 completed trips threshold.
 * If 6 trips are reached and basic commission is 0.05, automatically updates to 0.07.
 */
async function checkAndUpdateMkt6WheelCommissions(vehicleNumber, monthInput, yearInput, dateInput = null) {
  const targetVeh = normVeh(vehicleNumber);
  if (!targetVeh || targetVeh.length < 4) return { updated: false, reason: 'Invalid vehicle number' };

  const ownerCol = getInvoiceDb().collection('owner details');
  const truckCol = getInvoiceDb().collection('Truck Contact Number');
  const approvalsCol = getInvoiceDb().collection('Truck Contact Approvals');

  const regexStr = targetVeh.split('').join('[^a-zA-Z0-9]*');
  const vRegex = new RegExp(`^[^a-zA-Z0-9]*${regexStr}[^a-zA-Z0-9]*$`, 'i');

  const vQuery = {
    $or: [
      { "Truck No": vRegex },
      { "Truck No ": vRegex },
      { truck_no: vRegex },
      { vehicleNo: vRegex },
      { "Vehicle No": vRegex }
    ]
  };

  let contact = await ownerCol.findOne(vQuery);
  if (!contact) {
    contact = await truckCol.findOne(vQuery);
  }

  if (!contact) {
    return { updated: false, reason: 'Vehicle not registered in Party Master' };
  }

  if (!isMktRelationship(contact)) {
    return { updated: false, reason: 'Vehicle relationship is not MKT' };
  }

  const rawWheel = contact.wheelType || contact["Wheel Type "] || contact["Wheel Type"] || contact.wheel_type || contact.wheel || "";
  if (!is6Wheel(rawWheel)) {
    return { updated: false, reason: 'Vehicle is not a 6-wheeler' };
  }

  const { month: mInt, year: yInt } = resolveMonthYear(monthInput, yearInput, dateInput);
  const tripCount = await countQualifyingCompletedTrips(vehicleNumber, mInt, yInt, dateInput);

  if (tripCount >= 6) {
    const currentComm = parseBasicFreightCommission(contact);
    if (currentComm !== 0.07) {
      const monthStr = String(mInt).padStart(2, '0');
      const effDateStr = `${yInt}-${monthStr}-01`;

      const commPayload = {
        basic_freight_commission: 0.07,
        basicFreightCommission: 0.07,
        "BASIC FREIGHT COMMISSION": 0.07,
        "Basic Freight Commission": 0.07,
        "Basic Freight Commission ": 0.07,
        "Basic Freight Comission Applicability ": 0.07,
        "Basic Freight Comission Applicability": 0.07,
        "Basic Freight Commission Applicability ": 0.07,
        "Basic Freight Commission Applicability": 0.07,
        "Basic Freight Comission Appliciability": 0.07,
        "Basic Freight Comission Appliciability ": 0.07,
        "basic_freight_commission_applicability": 0.07,
        incentive_commission: 0.07,
        incentiveCommission: 0.07,
        "INCENTIVE COMMISSION": 0.07,
        "Incentive Commission": 0.07,
        "Incentive Commission ": 0.07,
        "Incentive Comission Applicability ": 0.07,
        "Incentive Comission Applicability": 0.07,
        "Incentive Commission Applicability ": 0.07,
        "Incentive Commission Applicability": 0.07,
        "Incentive Comission Appliciability": 0.07,
        "Incentive Comission Appliciability ": 0.07,
        "incentive_commission_applicability": 0.07
      };

      const updatedDoc = applyEffectiveEdit(
        contact,
        commPayload,
        effDateStr,
        "System (Automatic 6-Trip Threshold)"
      );

      const { _id, ...saveBody } = updatedDoc;

      // Update both collections
      await truckCol.updateOne(vQuery, { $set: saveBody }, { upsert: false });
      await ownerCol.updateOne(vQuery, { $set: saveBody }, { upsert: false });

      // Update any open pending approval requests for this vehicle
      await approvalsCol.updateMany(
        { ...vQuery, status: "pending" },
        { $set: commPayload }
      );

      safeEmit("truckContactUpdates", {
        action: "update",
        vehicleNumber: targetVeh,
        tripCount,
        basicFreightCommission: 0.07,
        incentiveCommission: 0.07,
        reason: "Automatic 6-Wheel Trip Threshold Reached (>= 6 Trips)"
      });
      safeEmit("cementUpdates");

      return {
        updated: true,
        vehicleNumber: targetVeh,
        tripCount,
        basicFreightCommission: 0.07,
        incentiveCommission: 0.07
      };
    } else {
      return {
        updated: false,
        reason: 'Basic Freight Commission is already 0.07',
        tripCount
      };
    }
  }

  return {
    updated: false,
    reason: `Qualifying trips (${tripCount}) below 6`,
    tripCount
  };
}

/**
 * Hook to trigger commission evaluation from any Cement Register entry modifications.
 */
async function hookCheckMktTripsFromEntry(entryOrEntries) {
  if (!entryOrEntries) return;
  const entries = Array.isArray(entryOrEntries) ? entryOrEntries : [entryOrEntries];

  const processedVehMonths = new Set();

  for (const entry of entries) {
    if (!entry) continue;
    const veh = entry["VEHICLE NUMBER"] || entry["VEHICLE NO"] || entry["VEHICLE NO."] || entry.vehicleNumber || entry["Truck No"] || entry.truck_no;
    const cleanV = normVeh(veh);
    if (!cleanV) continue;

    const { month, year } = resolveMonthYear(
      entry.month,
      entry.year,
      entry["LOADING DT"] || entry["LOADING DATE"] || entry["BILL DATE"] || entry.date
    );

    const comboKey = `${cleanV}_${month}_${year}`;
    if (processedVehMonths.has(comboKey)) continue;
    processedVehMonths.add(comboKey);

    await checkAndUpdateMkt6WheelCommissions(cleanV, month, year).catch(err => {
      console.warn(`[mktCommissionManager] Error checking ${cleanV}:`, err.message);
    });
  }
}

module.exports = {
  normalizeWheelType,
  is6Wheel,
  is10or12or14Wheel,
  isMktRelationship,
  resolveMonthYear,
  countQualifyingCompletedTrips,
  evaluateMktCommission,
  checkAndUpdateMkt6WheelCommissions,
  hookCheckMktTripsFromEntry
};
