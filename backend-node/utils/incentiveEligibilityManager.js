const mongoose = require('mongoose');
const { parseCalendarDate } = require('./billRegisterHelper');
const {
  normalizeDate,
  normalizeWheelType,
  is6Wheel,
  is10or12or14Wheel,
  getEffectivePartyMaster
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
 * Authoritative check for Dedicated vehicle status from Party Master.
 * RULE 1: The authoritative Dedicated/Non-Dedicated value must come from Party Master.
 * Do not infer dedication from relationship type, wheel type, commission settings, or invoice data.
 */
function isDedicatedVehicle(contact) {
  if (!contact) return false;
  const val = (
    contact.dedicated_type ??
    contact.dedicatedType ??
    contact["Dedicated Type"] ??
    contact["Dedicated Type "] ??
    contact.dedicated
  );
  if (val === undefined || val === null) return false;
  return String(val).trim().toLowerCase() === 'dedicated';
}

/**
 * Checks whether contact or customer type represents ATOA or MKT/MKTA.
 */
function isAtoaOrMkt(doc) {
  if (!doc) return false;
  const raw = (typeof doc === 'object') ? (
    doc["TYPE OF CUSTOMER "] ??
    doc["TYPE OF CUSTOMER"] ??
    doc.custType ??
    doc.cust_type ??
    doc.type_of_customer ??
    doc.relationshipType ??
    doc.type ??
    doc.RelationshipType ??
    doc["Relationship Type"] ??
    doc["Relationship Type "]
  ) : doc;

  if (raw === undefined || raw === null) return false;
  const s = String(raw).trim().toUpperCase();
  return (
    s === 'ATOA' ||
    s === 'ATO' ||
    s === 'MKT' ||
    s === 'MKTA' ||
    s.startsWith('ATO') ||
    s.startsWith('MKT')
  );
}

/**
 * Checks whether an invoice entry satisfies BOTH:
 * 1. Invoice Type = SO (not STO, not Freight, etc.)
 * 2. Invoice Type classification = NT
 */
function isInvoiceSoAndNt(entry) {
  if (!entry) return false;

  // 1. Check Invoice Type = SO
  const rawBillType = String(
    entry["Bill Type"] ??
    entry["BILL TYPE"] ??
    entry.billType ??
    entry.invoice_type ??
    entry.invoiceType ??
    ""
  ).trim().toUpperCase();

  // STO is explicitly disallowed
  if (rawBillType === "STO" || rawBillType !== "SO") {
    return false;
  }

  // 2. Check NT classification
  const isNtFlag = entry._is_nt_invoice === true || entry._is_nt_invoice === "true";
  const sourceNtFlag = entry._source_nt_unloading === true || entry._source_nt_unloading === "true";

  const extraUlRaw = (
    entry["EXTRA UNLOADING"] ??
    entry["EXTRA  UNLOADING"] ??
    entry["EXTRA U/L"] ??
    entry["EXTRA UL"] ??
    entry.extra_unloading
  );
  let hasExtraUl = false;
  if (extraUlRaw !== undefined && extraUlRaw !== null && String(extraUlRaw).trim() !== "") {
    const parsed = parseFloat(String(extraUlRaw).replace(/,/g, ""));
    if (!isNaN(parsed) && parsed > 0) hasExtraUl = true;
  }

  // Word boundary regex for NT / Non-Trade to avoid false positives on words like "CEMENT", "ENTERPRISE", "PAYMENT", etc.
  const ntWordRegex = /\bNT\b|\bNON[-\s]?TRADE\b/i;
  const classStr = String(entry.classification || entry.category || entry.invoice_type_classification || "").trim();
  const isClassNt = ntWordRegex.test(classStr);

  const unloadingNote = String(entry["UNLOADING STATUS NOTE"] || entry["UNLOADING STATUS"] || entry.notes || "").trim();
  const isNoteNt = ntWordRegex.test(unloadingNote);

  return isNtFlag || sourceNtFlag || isClassNt || hasExtraUl || isNoteNt;
}

/**
 * Required qualifying completed trips for standard incentive by wheel type:
 * 6-wheel: 10 trips
 * 10-wheel: 6 trips
 * 12-wheel: 6 trips
 * 14-wheel: 6 trips
 */
function getStandardTripThreshold(wheelType) {
  const norm = normalizeWheelType(wheelType);
  if (norm === '6WH') return 10;
  if (norm === '10WH' || norm === '12WH' || norm === '14WH') return 6;
  return null;
}

/**
 * Looks up contact from Party Master collections ('owner details' or 'Truck Contact Number').
 */
async function findPartyMasterContact(vehicleNumber, recordDate = null) {
  const targetVeh = normVeh(vehicleNumber);
  if (!targetVeh || targetVeh.length < 4) return null;

  const ownerCol = getInvoiceDb().collection('owner details');
  const truckCol = getInvoiceDb().collection('Truck Contact Number');

  const regexStr = targetVeh.split('').join('[^a-zA-Z0-9]*');
  const vRegex = new RegExp(`^[^a-zA-Z0-9]*${regexStr}[^a-zA-Z0-9]*$`, 'i');

  const vQuery = {
    $or: [
      { "Truck No": vRegex },
      { "Truck No ": vRegex },
      { truck_no: vRegex },
      { vehicleNo: vRegex },
      { "Vehicle No": vRegex },
      { "VEHICLE NUMBER": vRegex },
      { "VEHICLE NO": vRegex }
    ]
  };

  let contact = await ownerCol.findOne(vQuery);
  if (!contact) {
    contact = await truckCol.findOne(vQuery);
  }

  if (contact && recordDate) {
    return getEffectivePartyMaster(contact, recordDate) || contact;
  }

  return contact;
}

/**
 * Counts qualifying completed trips and SO+NT trips for a vehicle in an applicable calendar month & year.
 * Excludes dummy/adjustment entries and deduplicates duplicate invoice references.
 */
async function getVehicleMonthlyTripsData(vehicleNumber, targetMonth, targetYear) {
  const targetVeh = normVeh(vehicleNumber);
  if (!targetVeh || targetVeh.length < 4) {
    return { qualifyingCount: 0, soNtTripsCount: 0, qualifyingTrips: [], soNtTrips: [] };
  }

  const entriesCol = getCementDb().collection('entries');

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
  const qualifyingTrips = [];
  const soNtTrips = [];

  for (const row of docs) {
    const docId = String(row._id);
    if (seenDocIds.has(docId)) continue;
    seenDocIds.add(docId);

    // 1. Strict vehicle match
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
        continue;
      }
      seenInvoices.add(cleanInv);
    }

    qualifyingTrips.push(row);

    if (isInvoiceSoAndNt(row)) {
      soNtTrips.push(row);
    }
  }

  return {
    qualifyingCount: qualifyingTrips.length,
    soNtTripsCount: soNtTrips.length,
    qualifyingTrips,
    soNtTrips
  };
}

/**
 * Resolves Bill Freight / Billing Amount from Cement Register row.
 * For ATOA vehicles, projected incentive is calculated on Bill Freight.
 */
function getBillFreight(row) {
  if (!row) return 0;
  const mt = parseFloat(String(row["MT"] || row.mt || 0).replace(/,/g, '')) || 0;
  const billingRate = parseFloat(String(row["BILLING"] || row["BILLING RATE"] || row.billing || row.billingRate || 0).replace(/,/g, '')) || 0;
  if (billingRate > 0 && mt > 0) {
    return billingRate * mt;
  }
  const bAmt = parseFloat(String(row["Billing Amount"] || row["BILLING AMOUNT"] || row.billingAmount || 0).replace(/,/g, '')) || 0;
  if (bAmt > 0) return bAmt;
  if (billingRate > 0) return billingRate;
  return 0;
}

/**
 * Resolves Party Freight / Party Rate amount from Cement Register row.
 * For MKT/MKTA vehicles, projected incentive is calculated on Party Freight / Party Rate.
 */
function getPartyFreight(row, contact = null) {
  if (!row) return 0;
  const billingEr = parseFloat(String(row["BILLING ER 95%"] || row["BILLING @ 95% (PARTY PAYABLE)"] || 0).replace(/,/g, '')) || 0;
  if (billingEr > 0) return billingEr;

  const partyFreightAmt = parseFloat(String(row["PARTY RATE AMOUNT"] || row["PARTY FREIGHT"] || 0).replace(/,/g, '')) || 0;
  if (partyFreightAmt > 0) return partyFreightAmt;

  const mt = parseFloat(String(row["MT"] || row.mt || 0).replace(/,/g, '')) || 0;
  const partyRate = parseFloat(String(row["PARTY RATE (95-97%)"] || row["PARTY RATE (95%)"] || row["PARTY RATE"] || row["Party Rate"] || row["party_rate"] || row.partyRate || 0).replace(/,/g, '')) || 0;
  if (partyRate > 0 && mt > 0) {
    return partyRate * mt;
  }

  const amt = parseFloat(String(row["AMOUNT"] || row.amount || 0).replace(/,/g, '')) || 0;
  if (amt > 0) return amt;

  const billFreight = getBillFreight(row);
  if (billFreight > 0) {
    let comm = 0.05;
    if (contact) {
      const rawComm = contact.freight_commission ?? contact._freight_commission ?? contact["Basic Freight Commission"];
      if (rawComm !== undefined && rawComm !== null && rawComm !== '') {
        const cNum = parseFloat(String(rawComm).replace(/,/g, ''));
        if (!isNaN(cNum)) {
          comm = cNum > 1 ? cNum / 100 : cNum;
        }
      }
    }
    return billFreight * (1 - comm);
  }

  return 0;
}

/**
 * Authoritative evaluation of incentive eligibility for a vehicle in a given month and year.
 * Returns distinct eligibility results for:
 * 1. Standard incentive (NVL/NVCL)
 * 2. 10-wheel extra incentive (8.5%)
 * 3. 6-wheel extra incentive (15%)
 *
 * Persists the result in MongoDB collection `cement_register.incentive_eligibilities`.
 */
async function evaluateVehicleIncentiveEligibility(vehicleNumber, monthInput, yearInput, dateInput = null) {
  const cleanVeh = normVeh(vehicleNumber);
  if (!cleanVeh || cleanVeh.length < 4) {
    return {
      vehicleNumber: vehicleNumber || '',
      normVehicleNumber: '',
      month: 0,
      year: 0,
      standardIncentive: { eligible: false, reason: 'Invalid vehicle number' },
      extra10WheelIncentive: { eligible: false, reason: 'Invalid vehicle number' },
      extra6WheelIncentive: { eligible: false, reason: 'Invalid vehicle number' }
    };
  }

  const { month: targetMonth, year: targetYear } = resolveMonthYear(monthInput, yearInput, dateInput);
  const effDateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;

  const contact = await findPartyMasterContact(cleanVeh, effDateStr);

  const rawWheel = contact
    ? (contact["Type of vehicle "] || contact["Type of vehicle"] || contact["type_of_vehicle"] || contact.wheelType || contact["Wheel Type "] || contact["Wheel Type"] || contact.wheel_type || contact.veh_type || contact.wheel || "")
    : "";
  const normWheel = normalizeWheelType(rawWheel);

  const isDedicated = isDedicatedVehicle(contact);
  const isAtoaOrMktRel = isAtoaOrMkt(contact);

  const rawRel = contact ? (
    contact["TYPE OF CUSTOMER "] ||
    contact["TYPE OF CUSTOMER"] ||
    contact.custType ||
    contact.type_of_customer ||
    "OTHER"
  ) : "UNREGISTERED";

  const ownerName = contact ? (
    contact["Owner Name "] ||
    contact["Owner Name"] ||
    contact.owner_name ||
    contact.owner ||
    ""
  ) : "";

  // Query completed qualifying trips
  const { qualifyingCount, soNtTripsCount, qualifyingTrips = [], soNtTrips = [] } = await getVehicleMonthlyTripsData(
    cleanVeh,
    targetMonth,
    targetYear
  );

  // ── RULE 1: STANDARD INCENTIVE ──────────────────────────────────────────────
  // Requires:
  // 1. Dedicated status = Dedicated (Authoritative Party Master)
  // 2. Relationship = ATOA or MKT/MKTA
  // 3. Completed required qualifying trips:
  //    6WH: 10 trips | 10WH: 6 trips | 12WH: 6 trips | 14WH: 6 trips
  const reqTrips = getStandardTripThreshold(normWheel);
  let standardEligible = false;
  let standardReason = '';

  if (!isAtoaOrMktRel) {
    standardEligible = false;
    standardReason = `Ineligible: Relationship type (${rawRel}) is not ATOA or MKT`;
  } else if (!isDedicated) {
    standardEligible = false;
    standardReason = `Ineligible: Vehicle is Non-Dedicated in Party Master`;
  } else if (reqTrips === null) {
    standardEligible = false;
    standardReason = `Ineligible: Unknown wheel type (${rawWheel || 'None'})`;
  } else if (qualifyingCount < reqTrips) {
    standardEligible = false;
    standardReason = `Ineligible: Completed ${qualifyingCount}/${reqTrips} qualifying trips`;
  } else {
    standardEligible = true;
    standardReason = `Eligible: Dedicated ${normWheel} completed ${qualifyingCount}/${reqTrips} qualifying trips`;
  }

  // ── RULE 2: 10-WHEEL EXTRA INCENTIVE ───────────────────────────────────────
  // Requires:
  // 1. Wheel Type = 10-wheel
  // 2. Relationship = ATOA or MKT/MKTA
  // 3. At least 1 qualifying SO + NT invoice trip
  // Eligible from the first qualifying trip! Dedicated not required!
  let extra10WEligible = false;
  let extra10WReason = '';

  if (normWheel !== '10WH') {
    extra10WEligible = false;
    extra10WReason = `Ineligible: Vehicle is not a 10-wheeler (${normWheel || rawWheel || 'None'})`;
  } else if (!isAtoaOrMktRel) {
    extra10WEligible = false;
    extra10WReason = `Ineligible: Relationship type (${rawRel}) is not ATOA or MKT`;
  } else if (soNtTripsCount >= 1) {
    extra10WEligible = true;
    extra10WReason = `Eligible: 10-wheel vehicle with ${soNtTripsCount} qualifying SO+NT trip(s)`;
  } else {
    extra10WEligible = false;
    extra10WReason = `Ineligible: No qualifying SO+NT invoice trip found`;
  }

  // ── RULE 3: 6-WHEEL EXTRA INCENTIVE ─────────────────────────────────────────
  // Requires:
  // 1. Wheel Type = 6-wheel
  // 2. Relationship = ATOA or MKT/MKTA
  // 3. Completed >= 6 qualifying trips
  // Dedicated not required!
  let extra6WEligible = false;
  let extra6WReason = '';

  if (normWheel !== '6WH') {
    extra6WEligible = false;
    extra6WReason = `Ineligible: Vehicle is not a 6-wheeler (${normWheel || rawWheel || 'None'})`;
  } else if (!isAtoaOrMktRel) {
    extra6WEligible = false;
    extra6WReason = `Ineligible: Relationship type (${rawRel}) is not ATOA or MKT`;
  } else if (qualifyingCount >= 6) {
    extra6WEligible = true;
    extra6WReason = `Eligible: 6-wheel vehicle completed ${qualifyingCount}/6 qualifying trips`;
  } else {
    extra6WEligible = false;
    extra6WReason = `Ineligible: Completed ${qualifyingCount}/6 qualifying trips`;
  }

  // ── RULE 4: PROJECTED INCENTIVE PAYOUT AMOUNTS ─────────────────────────────
  const isAtoa = (String(rawRel).trim().toUpperCase() === 'ATOA' || String(rawRel).trim().toUpperCase() === 'ATO' || String(rawRel).trim().toUpperCase().startsWith('ATO'));

  let standardIncentiveAmount = 0;
  let standardNvlAmount = 0;
  let standardNvclAmount = 0;
  let extra10WAmount = 0;
  let extra6WAmount = 0;

  // Standard rate:
  // ATOA: 9.5% on Bill Freight
  // MKT: 12W/14W: 9.5% on Party Rate | 6W/10W: 8.5% on Party Rate
  let standardRate = 0.095;
  if (!isAtoa && (normWheel === '6WH' || normWheel === '10WH')) {
    standardRate = 0.085;
  }

  for (const trip of qualifyingTrips) {
    const tripBillFreight = getBillFreight(trip);
    const tripPartyFreight = getPartyFreight(trip, contact);
    const sourceFreight = isAtoa ? tripBillFreight : tripPartyFreight;

    // Standard incentive calculation (only if eligible)
    if (standardEligible) {
      const tripAmt = sourceFreight * standardRate;
      const site = String(trip["SITE"] || trip.site || "").toUpperCase();
      const billType = String(trip["Bill Type"] || trip.billType || "").toUpperCase();
      const isAtoTrip = trip._is_ato === true || trip._is_ato === 'true' || site === 'NVL' || billType === 'NT';
      if (isAtoTrip) {
        standardNvlAmount += tripAmt;
      } else {
        standardNvclAmount += tripAmt;
      }
      standardIncentiveAmount += tripAmt;
    }

    // 10W Extra incentive: 8.5% of Bill Freight (ATOA) or Party Rate (MKT)
    // Only qualifying SO+NT trips contribute
    if (extra10WEligible && isInvoiceSoAndNt(trip)) {
      const extra10Base = isAtoa ? tripBillFreight : tripPartyFreight;
      extra10WAmount += extra10Base * 0.085;
    }

    // 6W Extra incentive: 15% of Bill Freight (ATOA) or Party Rate (MKT)
    // Requires >= 6 qualifying trips
    if (extra6WEligible) {
      const extra6Base = isAtoa ? tripBillFreight : tripPartyFreight;
      extra6WAmount += extra6Base * 0.15;
    }
  }

  standardIncentiveAmount = Math.round(standardIncentiveAmount);
  standardNvlAmount = Math.round(standardNvlAmount);
  standardNvclAmount = Math.round(standardNvclAmount);
  extra10WAmount = Math.round(extra10WAmount);
  extra6WAmount = Math.round(extra6WAmount);

  const totalProjected = standardIncentiveAmount + extra10WAmount + extra6WAmount;

  const resultDoc = {
    vehicleNumber: (contact && (contact["Truck No"] || contact.truck_no)) || cleanVeh,
    normVehicleNumber: cleanVeh,
    month: targetMonth,
    year: targetYear,
    ownerName,
    wheelType: normWheel || rawWheel,
    relationshipType: String(rawRel).trim(),
    isDedicated,
    isAtoaOrMkt: isAtoaOrMktRel,
    qualifyingTripsCount: qualifyingCount,
    soNtTripsCount,
    standardIncentive: {
      eligible: standardEligible,
      requiredTrips: reqTrips || 0,
      completedTrips: qualifyingCount,
      isDedicated,
      rate: standardRate,
      amount: standardIncentiveAmount,
      nvlAmount: standardNvlAmount,
      nvclAmount: standardNvclAmount,
      reason: standardReason
    },
    extra10WheelIncentive: {
      eligible: extra10WEligible,
      qualifyingSoNtTrips: soNtTripsCount,
      rate: 0.085,
      amount: extra10WAmount,
      reason: extra10WReason
    },
    extra6WheelIncentive: {
      eligible: extra6WEligible,
      requiredTrips: 6,
      completedTrips: qualifyingCount,
      rate: 0.15,
      amount: extra6WAmount,
      reason: extra6WReason
    },
    totalProjectedIncentive: totalProjected,
    evaluatedAt: new Date()
  };

  // Persist into MongoDB collection `cement_register.incentive_eligibilities`
  try {
    const eligCol = getCementDb().collection('incentive_eligibilities');
    await eligCol.updateOne(
      { normVehicleNumber: cleanVeh, month: targetMonth, year: targetYear },
      { $set: resultDoc },
      { upsert: true }
    );
  } catch (err) {
    console.warn('[incentiveEligibilityManager] Failed to persist eligibility:', err.message);
  }

  return resultDoc;
}

/**
 * Returns a map of all incentive eligibilities for a given month & year.
 * Keyed by normalized vehicle number.
 */
async function getMonthlyIncentiveEligibilities(monthInput, yearInput) {
  const { month: targetMonth, year: targetYear } = resolveMonthYear(monthInput, yearInput);

  const ownerCol = getInvoiceDb().collection('owner details');
  const truckCol = getInvoiceDb().collection('Truck Contact Number');
  const entriesCol = getCementDb().collection('entries');

  // Find all vehicles active in cement register or registered in party master
  const ownerDocs = await ownerCol.find({}, { projection: { "Truck No": 1, "Truck No ": 1, truck_no: 1 } }).toArray();
  const truckDocs = await truckCol.find({}, { projection: { "Truck No": 1, "Truck No ": 1, truck_no: 1 } }).toArray();

  const allVehs = new Set();
  ownerDocs.forEach(d => {
    const v = normVeh(d["Truck No"] || d["Truck No "] || d.truck_no);
    if (v && v.length >= 4) allVehs.add(v);
  });
  truckDocs.forEach(d => {
    const v = normVeh(d["Truck No"] || d["Truck No "] || d.truck_no);
    if (v && v.length >= 4) allVehs.add(v);
  });

  const activeEntries = await entriesCol.find({
    $or: [
      { month: targetMonth, year: targetYear },
      { month: String(targetMonth), year: String(targetYear) }
    ]
  }, {
    projection: { "VEHICLE NUMBER": 1, "VEHICLE NO": 1, vehicleNumber: 1, "Truck No": 1 }
  }).toArray();

  activeEntries.forEach(e => {
    const v = normVeh(e["VEHICLE NUMBER"] || e["VEHICLE NO"] || e["VEHICLE NO."] || e.vehicleNumber || e["Truck No"]);
    if (v && v.length >= 4) allVehs.add(v);
  });

  const resultMap = {};
  for (const vKey of allVehs) {
    const evalResult = await evaluateVehicleIncentiveEligibility(vKey, targetMonth, targetYear);
    resultMap[vKey] = evalResult;
  }

  return resultMap;
}

/**
 * Background hook to evaluate affected vehicles whenever Cement Register entries are modified,
 * created, edited, or deleted, or when Party Master records are modified.
 */
async function hookCheckIncentiveEligibility(entryOrEntries) {
  if (!entryOrEntries) return;
  const entries = Array.isArray(entryOrEntries) ? entryOrEntries : [entryOrEntries];

  const processedVehMonths = new Set();
  const evaluatedResults = [];

  for (const entry of entries) {
    if (!entry) continue;
    const veh = (
      entry["VEHICLE NUMBER"] ||
      entry["VEHICLE NO"] ||
      entry["VEHICLE NO."] ||
      entry.vehicleNumber ||
      entry["Truck No"] ||
      entry["Truck No "] ||
      entry.truck_no
    );
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

    try {
      const res = await evaluateVehicleIncentiveEligibility(cleanV, month, year);
      evaluatedResults.push(res);
    } catch (err) {
      console.warn(`[incentiveEligibilityManager] Error evaluating ${cleanV}:`, err.message);
    }
  }

  if (evaluatedResults.length > 0) {
    safeEmit('incentiveEligibilityUpdated', {
      evaluatedCount: evaluatedResults.length,
      records: evaluatedResults
    });
  }
}

module.exports = {
  normVeh,
  normalizeWheelType,
  is6Wheel,
  is10or12or14Wheel,
  isDedicatedVehicle,
  isAtoaOrMkt,
  isInvoiceSoAndNt,
  getStandardTripThreshold,
  resolveMonthYear,
  findPartyMasterContact,
  getVehicleMonthlyTripsData,
  evaluateVehicleIncentiveEligibility,
  getMonthlyIncentiveEligibilities,
  hookCheckIncentiveEligibility,
  getBillFreight,
  getPartyFreight
};
