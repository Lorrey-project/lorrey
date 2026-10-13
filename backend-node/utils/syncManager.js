const mongoose = require("mongoose");
const Invoice = require("../models/Invoice");
const Voucher = require("../models/Voucher");
const { getAccumulatedFreightAdvance, isSameCalendarDate } = require("./monojCementAdvanceManager");

function safeGetIO() {
  try { const { getIO } = require("../socket"); return getIO(); }
  catch (_) { return null; }
}
function emitCementUpdate(payload) {
  const io = safeGetIO();
  if (io) io.emit("cementUpdates", payload);
}

function getCementCol() {
  return mongoose.connection.useDb("cement_register").collection("entries");
}
function getInvoiceSystemDb() {
  return mongoose.connection.useDb("invoice_system");
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
        if (parsed > 0 && parsed <= 0.2) {
          return parsed; // e.g. 0.01 = 1%, 0.02 = 2%, 0.015 = 1.5%
        } else if (parsed > 0 && parsed <= 20) {
          return parsed / 100; // e.g. entered as 1 or 2 meaning 1% or 2% -> 0.01 or 0.02
        }
        return parsed;
      }
    }
  }
  return null;
}

const { normalizeDate, getEffectivePartyMaster, parseBasicFreightCommission } = require("./partyMasterHelper");
const { hookCheckMktTripsFromEntry } = require("./mktCommissionManager");

// ─── Shared Truck Contact Lookup ──────────────────────────────────────────────
async function getTruckDetails(vehicleNumber, ownerName = "", recordDate = null) {
  let wheel = "", resolvedOwnerName = "", tdsPercent = 0, isATO = false, driverNo = "", hasStO = false;
  let basicFreightCommission = null;

  if (!vehicleNumber && !ownerName) return { wheel, ownerName: resolvedOwnerName, tdsPercent, isATO, driverNo, hasStO, basicFreightCommission };

  const ownerCol = getInvoiceSystemDb().db.collection("owner details");
  const truckCol = getInvoiceSystemDb().db.collection("Truck Contact Number");
  const truckRegex = vehicleNumber ? makeSpaceAgnosticRegex(vehicleNumber) : null;
  const ownerRegex = ownerName ? new RegExp(`^\\s*${ownerName.trim()}\\s*$`, 'i') : null;

  let rawTruck = null;

  // 1. Exact Owner + Vehicle in Owner Details
  if (truckRegex && ownerRegex) {
    rawTruck = await ownerCol.findOne({
      $and: [
        {
          $or: [
            { "Truck No": { $regex: truckRegex } },
            { "Truck No ": { $regex: truckRegex } },
            { truck_no: { $regex: truckRegex } },
            { "Contact No.(Truck No.)": { $regex: truckRegex } },
            { "Contact No\\.(Truck No\\.)": { $regex: truckRegex } }
          ]
        },
        {
          $or: [
            { "Owner Name": { $regex: ownerRegex } },
            { "Owner Name ": { $regex: ownerRegex } },
            { owner_name: { $regex: ownerRegex } }
          ]
        }
      ]
    });
  }

  // 2. Vehicle alone in Owner Details
  if (!rawTruck && truckRegex) {
    rawTruck = await ownerCol.findOne({
      $or: [
        { "Truck No": { $regex: truckRegex } },
        { "Truck No ": { $regex: truckRegex } },
        { truck_no: { $regex: truckRegex } },
        { "Contact No.(Truck No.)": { $regex: truckRegex } },
        { "Contact No\\.(Truck No\\.)": { $regex: truckRegex } }
      ]
    });
  }

  // 3. Exact Owner + Vehicle in Truck Contact Number
  if (!rawTruck && truckRegex && ownerRegex) {
    rawTruck = await truckCol.findOne({
      $and: [
        {
          $or: [
            { "Truck No": { $regex: truckRegex } },
            { "Truck No ": { $regex: truckRegex } },
            { truck_no: { $regex: truckRegex } },
            { "Contact No.(Truck No.)": { $regex: truckRegex } },
            { "Contact No\\.(Truck No\\.)": { $regex: truckRegex } }
          ]
        },
        {
          $or: [
            { "Owner Name": { $regex: ownerRegex } },
            { "Owner Name ": { $regex: ownerRegex } },
            { owner_name: { $regex: ownerRegex } }
          ]
        }
      ]
    });
  }

  // 4. Vehicle alone in Truck Contact Number
  if (!rawTruck && truckRegex) {
    rawTruck = await truckCol.findOne({
      $or: [
        { "Truck No": { $regex: truckRegex } },
        { "Truck No ": { $regex: truckRegex } },
        { truck_no: { $regex: truckRegex } },
        { "Contact No.(Truck No.)": { $regex: truckRegex } },
        { "Contact No\\.(Truck No\\.)": { $regex: truckRegex } }
      ]
    });
  }

  // 5. Owner alone only if vehicle wasn't specified
  if (!rawTruck && !vehicleNumber && ownerRegex) {
    rawTruck = await ownerCol.findOne({
      $or: [
        { "Owner Name": { $regex: ownerRegex } },
        { "Owner Name ": { $regex: ownerRegex } },
        { owner_name: { $regex: ownerRegex } }
      ]
    }) || await truckCol.findOne({
      $or: [
        { "Owner Name": { $regex: ownerRegex } },
        { "Owner Name ": { $regex: ownerRegex } },
        { owner_name: { $regex: ownerRegex } }
      ]
    });
  }

  // Resolve effective version for recordDate
  const truck = rawTruck ? getEffectivePartyMaster(rawTruck, recordDate) : null;

  if (truck) {
    let vType = truck["Type of vehicle"] || truck["Type of vehicle "] || truck.type || truck["Vehicle Type"] || truck.type_of_vehicle || truck.vehicle_type || truck.wheel_type || truck.wheelType || "";
    if (!vType) {
      for (let key in truck) {
        const lk = key.toLowerCase();
        if (lk.includes("type") || lk.includes("wheel") || lk.includes("vehicle")) {
          const val = truck[key];
          if (val && typeof val === "string") { vType = val; break; }
          if (val && typeof val === "number") { vType = val.toString(); break; }
        }
      }
    }
    const wheelMatch = vType ? vType.toString().match(/(\d+)/) : null;
    wheel = wheelMatch ? `${wheelMatch[1]}W` : vType;
    resolvedOwnerName = safe(truck["Owner Name"] || truck["Owner Name "] || truck.owner_name || truck.ownerName);
    driverNo = safe(truck["DRIVER CONTACT"] || truck["DRIVER CONTACT "] || truck.contact_no || truck["Contact No."] || truck["Contact No. "]);

    const custType = safe(truck["TYPE OF CUSTOMER"] || truck["TYPE OF CUSTOMER "] || truck["type_of_customer"] || truck.relationshipType || truck.custType || "").toUpperCase();
    isATO = custType.includes("ATO");
    hasStO = custType.includes("STO");

    // TDS dynamic logic from Owner Details
    const parsedTds = parseTdsField(truck);
    if (parsedTds !== null) {
      tdsPercent = parsedTds;
    } else {
      const pan = safe(truck["PAN No."] || truck["PAN No. "] || truck.pan_no);
      const aadhar = safe(truck["Aadhar No."] || truck["Aadhar No. "] || truck.aadhar_no);
      tdsPercent = (pan && aadhar) ? 0 : 0.01;
    }

    basicFreightCommission = parseBasicFreightCommission(truck);
  }

  return { wheel, ownerName: resolvedOwnerName, tdsPercent, isATO, driverNo, hasStO, basicFreightCommission };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function safe(val, fallback = "") {
  return (val !== null && val !== undefined) ? val : fallback;
}
function num(val, fallback = 0) {
  if (val === undefined || val === null || val === '') return fallback;
  const cleaned = String(val).replace(/,/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? fallback : n;
}
function fmt2(n) {
  return Math.round(num(n) * 100) / 100;
}

/** Parse any date string (including DD/MM/YYYY, DD-MM-YYYY, ISO) to Date object */
function parseToDate(val) {
  if (!val) return new Date();
  if (val instanceof Date && !isNaN(val.getTime())) return val;
  if (typeof val === 'number') return new Date(val);

  if (typeof val === 'string') {
    const s = val.trim();
    const match = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
    if (match) {
      const dd = parseInt(match[1], 10);
      const mm = parseInt(match[2], 10) - 1;
      let yyyy = parseInt(match[3], 10);
      if (yyyy < 100) yyyy += 2000;
      const d = new Date(yyyy, mm, dd);
      if (!isNaN(d.getTime())) return d;
    }
  }

  const d = new Date(val);
  return isNaN(d.getTime()) ? new Date() : d;
}

/** Format any date value to dd-mm-yyyy */
function fmtDate(val) {
  if (!val) return "";

  // If it's already in DD/MM/YYYY or DD-MM-YYYY, normalize to DD-MM-YYYY
  if (typeof val === 'string') {
    const clean = val.trim();
    // Match DD/MM/YYYY or DD-MM-YYYY
    const match = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (match) {
      const dd = match[1].padStart(2, "0");
      const mm = match[2].padStart(2, "0");
      const yyyy = match[3];
      return `${dd}-${mm}-${yyyy}`;
    }
  }

  const d = parseToDate(val);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/** Get current financial year string: e.g. "25-26" */
function getFinancialYear(date) {
  const d = parseToDate(date);
  const year = d.getFullYear();
  const month = d.getMonth(); // 0-indexed
  if (month >= 3) { // April → March
    return `${String(year).slice(-2)}-${String(year + 1).slice(-2)}`;
  } else {
    return `${String(year - 1).slice(-2)}-${String(year).slice(-2)}`;
  }
}

// ─── Global sequential SL NO ──────────────────────────────────────────────────
async function getOrAssignSlNo(col, invoiceId) {
  // If entry already exists and has SL NO, keep it
  const existing = await col.findOne({ _invoiceId: invoiceId.toString() });
  if (existing && existing["SL NO"]) return existing["SL NO"];

  // Get max SL NO currently in use
  const maxDoc = await col.find({}, { projection: { "SL NO": 1 } })
    .sort({ "SL NO": -1 }).limit(1).toArray();
  const maxSl = (maxDoc[0] && maxDoc[0]["SL NO"]) ? num(maxDoc[0]["SL NO"]) : 0;
  return maxSl + 1;
}

// ─── GCN Number: Sequential per FY ───────────────────────────────────────
async function getOrAssignGcnNo(col, invoiceId, loadingDate) {
  const existing = await col.findOne({ _invoiceId: invoiceId.toString() });
  if (existing && existing["GCN NO"]) return existing["GCN NO"];

  const date = parseToDate(loadingDate);
  const fy = getFinancialYear(date);
  const prefix = `DAC-${fy}-`;

  // Find max GCN number in this FY assigned natively. Format: DAC-25-26-N
  const docs = await col.find(
    { "GCN NO": { $regex: new RegExp(`^DAC[\\/\\-]${fy}[\\/\\-]\\d+$`) } },
    { projection: { "GCN NO": 1 } }
  ).toArray();

  let maxSeq = 0;
  for (const doc of docs) {
    if (!doc["GCN NO"]) continue;
    // Split by both / and - to handle existing numbers in the db seamlessly
    const parts = doc["GCN NO"].split(/[\/\-]/);
    if (parts.length === 3 || parts.length === 4) { // e.g. DAC/25-26/1 (3 parts) or DAC-25-26-1 (4 parts if FY has -)
      const seqStr = parts[parts.length - 1]; // Sequence is always the last part
      const seq = parseInt(seqStr, 10);
      if (!isNaN(seq) && seq > maxSeq) {
        maxSeq = seq;
      }
    }
  }
  return `${prefix}${maxSeq + 1}`;
}

// ─── HSD Bill Number: PumpName/FY/Interval ───────────────────────────────
async function generateHsdBillNo(pumpName, loadingDate, invoiceId) {
  if (!pumpName) return "";
  const col = getCementCol();
  const date = parseToDate(loadingDate);
  const fy = getFinancialYear(date);
  const prefix = pumpName.trim().toUpperCase().split(" ")[0]; // e.g. "SAS"

  // Check if this invoice already has an HSD BILL NO → keep it
  const existing = await col.findOne({ _invoiceId: invoiceId.toString() });
  if (existing && existing["HSD BILL NO"]) return existing["HSD BILL NO"];

  // Calculate 10-day interval index (1 to 36) for the financial year
  const month = date.getMonth(); // 0 (Jan) - 11 (Dec)
  const day = date.getDate();

  // Financial year starts in April (month index 3)
  let fyMonthOffset = (month >= 3) ? (month - 3) : (month + 9);

  let periodInMonth;
  if (day <= 10) periodInMonth = 1;
  else if (day <= 20) periodInMonth = 2;
  else periodInMonth = 3;

  const intervalIndex = (fyMonthOffset * 3) + periodInMonth;

  return `${prefix}-${fy}-${intervalIndex}`;
}

async function getFuelRate(pumpName, dateVal) {
  try {
    const col = mongoose.connection.useDb("pump_payment").collection("fuel_rates");
    const d = parseToDate(dateVal);
    if (!pumpName) return 91.99;

    // Find latest rate effective on or before this date
    const record = await col.find({
      pumpName: { $regex: new RegExp(`^${pumpName.trim().split(/[-\s]/)[0]}`, "i") },
      effectiveDate: { $lte: d }
    })
      .sort({ effectiveDate: -1 })
      .limit(1)
      .toArray();

    return record[0] ? num(record[0].rate) : 91.99;
  } catch (e) {
    return 91.99;
  }
}

async function getCashDiscountRate(pumpName, dateVal) {
  try {
    const col = mongoose.connection.useDb("pump_payment").collection("cash_discounts");
    const d = parseToDate(dateVal);
    if (!pumpName) return 0.80; // default cash discount

    // Find latest discount effective on or before this date
    const record = await col.find({
      pumpName: { $regex: new RegExp(`^${pumpName.trim().split(/[-\s]/)[0]}`, "i") },
      effectiveDate: { $lte: d }
    })
      .sort({ effectiveDate: -1 })
      .limit(1)
      .toArray();

    return record[0] ? num(record[0].discount) : 0.80;
  } catch (e) {
    return 0.80;
  }
}

function makeSpaceAgnosticRegex(str) {
  if (!str) return /^$/;
  const stripped = str.replace(/[^a-zA-Z0-9]/g, '');
  const regexStr = stripped.split('').join('[^a-zA-Z0-9]*');
  return new RegExp(`^[^a-zA-Z0-9]*${regexStr}[^a-zA-Z0-9]*$`, 'i');
}

// ─── Central sync function ────────────────────────────────────────────────────
// overrides: optional extra fields to force onto the invoice (e.g. is_hsd_verified:true)
// This fixes a race condition where the DB write and re-read happen on the same tick
async function pushToRegister(invoiceId, overrides) {
  overrides = overrides || {};
  // Guard: dummy rows use "dummy_vch_..." strings — not real MongoDB ObjectIds
  if (!invoiceId || String(invoiceId).startsWith("dummy_")) return;
  try {
    const invoiceRaw = await Invoice.findById(invoiceId).lean();
    if (!invoiceRaw) return;
    // Apply overrides on top so caller-forced values are always present
    const invoice = Object.assign({}, invoiceRaw, overrides);

    let hvd = invoice.human_verified_data || {};
    if (Object.keys(hvd).length === 0 && invoice.ai_data) {
      hvd = invoice.ai_data.invoice_data || invoice.ai_data || {};
    }
    const slip = invoice.lorry_hire_slip_data || {};
    const gcn = invoice.gcn_data || {};

    // ── Extract core invoice fields ──────────────────────────────────────
    const invoiceDetails = hvd.invoice_details || {};
    const supplyDetails = hvd.supply_details || {};
    const consigneeDetails = hvd.consignee_details || {};
    const ewbDetails = hvd.ewb_details || {};
    const items = hvd.items || [];
    const sellerDetails = hvd.seller_details || {};
    const buyerDetails = hvd.buyer_details || {};
    const amountSummary = hvd.amount_summary || {};

    const vehicleNumber = safe(supplyDetails.vehicle_number || hvd.vehicle_number).toUpperCase().replace(/\s+/g, ' ').trim();
    const destination = safe(supplyDetails.destination || hvd.destination).trim();
    const invoiceNo = safe(invoiceDetails.invoice_number || hvd.invoice_number).replace(/^\.+/, '').trim();
    const billType = safe(invoiceDetails.invoice_type || invoiceDetails.bill_type || hvd.invoice_type || invoice.invoice_type).trim();
    const shipmentNo = safe(supplyDetails.shipment_number || hvd.shipment_number).replace(/^\.+/, '').trim();
    const partyName = safe(consigneeDetails.consignee_name || buyerDetails.buyer_name || invoice.consignee_name || hvd.party_name).trim();

    // Site determination logic
    const rawSite = safe(sellerDetails.seller_name) || safe(buyerDetails.buyer_name) || safe(invoice.site) || "";
    const rawSiteUpper = rawSite.toUpperCase();
    let site = "";
    if (rawSiteUpper.includes("NUVOCO") || rawSiteUpper === "NVCL") site = "NVCL";
    else if (rawSiteUpper.includes("VISTA") || rawSiteUpper === "NVL") site = "NVL";
    else site = rawSiteUpper.includes("DIPALI") ? "" : rawSite;

    // Prioritize extracted invoice_date over system created_at
    const loadingDate = invoiceDetails.invoice_date || hvd.invoice_date || invoice.created_at;

    // MT = total quantity from items (fallback to total_quantity if present)
    let totalMt = items.reduce((sum, item) => sum + num(item.quantity || item.wt || item.weight), 0);
    if (totalMt === 0) {
      totalMt = num(hvd.total_quantity || amountSummary.total_quantity || supplyDetails.quantity || 0);
    }
    const mt = totalMt > 0 ? fmt2(totalMt) : "";

    // ── Add-on Charges (from invoice form) ──────────────────────────────
    const addonCharges = Array.isArray(hvd.addon_charges) ? hvd.addon_charges : (Array.isArray(invoice.addon_charges) ? invoice.addon_charges : []);
    const getAddon = (typeName) => {
      const found = addonCharges.find(c => String(c.type || '').trim().toLowerCase() === typeName.toLowerCase());
      return found ? num(found.amount) : 0;
    };
    const addonGpsDevice = getAddon("GPS Device");
    const addonRfidTag = getAddon("RFID Tag");
    const addonRfidReassurance = getAddon("RFID Tag Reassurance");
    const addonFastag = getAddon("Fastag");
    const totalRfid = (addonRfidTag || 0) + (addonRfidReassurance || 0);

    // ── NT Details & Unloading Charges ─────────────────────────────────
    const invoiceType = safe(billType || invoiceDetails.invoice_type || hvd.invoice_type || invoice.invoice_type);
    const isNTInvoice = invoiceType.toUpperCase().trim() === "NT" || (items && items.some(i => (i.description_of_product || '').toUpperCase().includes('UNLOADING')));
    const ntDetails = hvd.nt_details || invoice.nt_details || {};
    let ntExtraUnloading = "";
    if (isNTInvoice && ntDetails.unloading_charges !== undefined && ntDetails.unloading_charges !== null && String(ntDetails.unloading_charges).trim() !== "") {
      const parsedUnloading = num(ntDetails.unloading_charges);
      ntExtraUnloading = parsedUnloading > 0 ? parsedUnloading : (parsedUnloading === 0 ? 0 : "");
    }

    // ── STEP 1: Freight / Billing lookup & Billing Amount derivation ──────
    let billing = 0, distanceKm = 0;
    if (destination) {
      const freightCol = getInvoiceSystemDb().db.collection("freight_data");
      
      // 1. Try matching by Pincode if present in destination string (6 digits)
      const pinMatch = destination.match(/\b\d{6}\b/);
      let freight = null;
      if (pinMatch) {
        const pincode = pinMatch[0];
        freight = await freightCol.findOne({
          $or: [
            { "DEST ZONE DESC": { $regex: new RegExp(pincode) } },
            { "PINCODE": { $regex: new RegExp(pincode) } },
            { "Pincode": { $regex: new RegExp(pincode) } }
          ]
        });
      }

      // 2. Try exact/regex match of the whole destination string
      if (!freight) {
        freight = await freightCol.findOne({
          "DEST ZONE DESC": { $regex: new RegExp(`\\b${destination.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, "i") }
        });
      }

      // 3. Fallback: strip leading/trailing digits and use first word with word boundaries
      if (!freight) {
        const destText = destination.replace(/^\d+[-\s]*/, '').replace(/[-\s]*\d+$/, '').trim();
        const firstWord = destText.split(/[\s,(]/)[0];
        if (firstWord && firstWord.length > 2) {
          freight = await freightCol.findOne({
            "DEST ZONE DESC": { $regex: new RegExp(`\\b${firstWord}\\b`, "i") }
          });
        }
      }

      if (freight) {
        billing = num(freight.Rate);
        distanceKm = num(freight.Distance) * 2; // round trip (UP+DOWN)
      }
    }

    // Fallback: If billing rate is not in freight_data, check invoice item rate or amount summary
    if (billing === 0 && items.length > 0 && num(items[0].rate) > 0) {
      billing = num(items[0].rate);
    }

    // Derive Billing Amount FIRST
    let billingAmt = (billing > 0 && num(mt) > 0) ? fmt2(billing * num(mt)) : 0;
    if (billingAmt === 0) {
      const itemTaxable = items.reduce((sum, item) => sum + num(item.taxable_value), 0);
      const summaryNet = num(amountSummary.net_value || amountSummary.net_payable);
      if (itemTaxable > 0) {
        billingAmt = fmt2(itemTaxable);
        if (num(mt) > 0 && billing === 0) billing = fmt2(billingAmt / num(mt));
      } else if (summaryNet > 0) {
        billingAmt = fmt2(summaryNet);
        if (num(mt) > 0 && billing === 0) billing = fmt2(billingAmt / num(mt));
      }
    }

    // ── STEP 2: Truck Contact & Party Master lookup (After Billing Amount) ──
    let wheel = "", ownerName = "", tdsPercent = 0, isATO = false, driverNo = "", hasStO = false;
    let basicFreightCommission = null;
    let commissionError = null;
    
    if (vehicleNumber) {
      const invoiceOwnerName = safe(supplyDetails.transporter_name || supplyDetails.owner_name || hvd.owner_name || "").trim();
      const truckDetails = await getTruckDetails(vehicleNumber, invoiceOwnerName, loadingDate);
      wheel = truckDetails.wheel;
      ownerName = truckDetails.ownerName || invoiceOwnerName;
      tdsPercent = truckDetails.tdsPercent;
      isATO = truckDetails.isATO;
      driverNo = truckDetails.driverNo;
      hasStO = truckDetails.hasStO;
      if (truckDetails.basicFreightCommission !== null && truckDetails.basicFreightCommission !== undefined && !isNaN(Number(truckDetails.basicFreightCommission))) {
        basicFreightCommission = Number(truckDetails.basicFreightCommission);
      } else {
        commissionError = `Missing or invalid Basic Freight Commission in Party Master for vehicle: ${vehicleNumber}`;
        console.warn(`[syncManager] ${commissionError}`);
      }
    } else {
      commissionError = "Missing vehicle number on invoice for Party Master commission lookup";
    }

    // ── STEP 3: Dynamic Party Rate & Payable calculation ────────────────
    const hasValidCommission = (basicFreightCommission !== null && basicFreightCommission !== undefined && !isNaN(basicFreightCommission));
    const effectiveComm = hasValidCommission ? basicFreightCommission : null;
    const isStandard95 = effectiveComm === 0.05;

    let partyRateVal = "";
    let partyRateAmount = 0;
    let partyRatePct = null;
    let partyRatePctStr = "";
    let billingEr95 = 0;
    let billingErVar = 0;
    let amount = 0;
    let profit = 0;

    if (hasValidCommission) {
      // Party Rate Percentage = 100% - (Basic Freight Commission × 100)
      partyRatePct = Math.round((1 - effectiveComm) * 100);
      partyRatePctStr = `${partyRatePct}%`;

      // Party Rate Amount = Billing Amount × (1 - Basic Freight Commission)
      if (billingAmt > 0) {
        partyRateAmount = fmt2(billingAmt * (1 - effectiveComm));
      }
      
      // Party Rate (per MT) = Billing Freight Rate × (1 - Basic Freight Commission)
      if (billing > 0) {
        partyRateVal = fmt2(billing * (1 - effectiveComm));
      } else if (partyRateAmount > 0) {
        partyRateVal = partyRateAmount;
      }

      billingEr95 = partyRateAmount;
      billingErVar = partyRateAmount;
      amount = partyRateAmount;
      profit = billingAmt > 0 ? fmt2(billingAmt * effectiveComm) : 0;
    }

    // ── Site Cash & Office Cash Vouchers (strict date matching) ─────────
    let siteCash = 0;
    let officeCash = 0;
    let siteCashProofUrl = "";
    let officeCashProofUrl = "";
    if (vehicleNumber) {
      const vStart = parseToDate(loadingDate);
      vStart.setHours(0, 0, 0, 0);
      const vEnd = parseToDate(loadingDate);
      vEnd.setHours(23, 59, 59, 999);

      const baseQuery = {
        vehicleNumber: { $regex: new RegExp(`^${vehicleNumber.trim().replace(/\\s+/g, '\\s*')}$`, "i") },
        date: { $gte: vStart, $lte: vEnd }
      };

      const voucherQuery = baseQuery;

      // Pick the most recently created voucher from site admin (SITE)
      const siteVoucher = await Voucher.findOne({
        ...voucherQuery,
        $or: [
          { appliedPanel: "SITE" },
          { createdByRole: "SITE" }
        ]
      })
        .sort({ createdAt: -1 })
        .lean();

      if (siteVoucher) {
        siteCash = num(siteVoucher.amount);
        siteCashProofUrl = siteVoucher.slip_url || "";
      }

      // Pick the most recently created voucher from office admin (OFFICE / HEAD_OFFICE)
      const officeVoucher = await Voucher.findOne({
        ...voucherQuery,
        $or: [
          { appliedPanel: "OFFICE" },
          { createdByRole: { $in: ["HEAD_OFFICE", "OFFICE"] } },
          { $and: [{ createdByRole: { $ne: "SITE" } }, { appliedPanel: { $ne: "SITE" } }] }
        ]
      })
        .sort({ createdAt: -1 })
        .lean();

      if (officeVoucher) {
        officeCash = num(officeVoucher.amount);
        officeCashProofUrl = officeVoucher.slip_url || "";
      }
    }

    // ── Fuel / slip fields ───────────────────────────────────────────────
    const pumpName = safe(slip.station_name);
    const hsdSlipNo = safe(slip.fuel_slip_no);
    const fuelRequired = num(slip.estimated_required_fuel);
    const hsdLtr = num(slip.diesel_litres);

    // Fetch historical rate based on pump and loading date
    const hsdRate = await getFuelRate(pumpName, loadingDate);
    const hsdAmount = fmt2(hsdLtr * hsdRate);

    // Fetch cash discount rate based on pump and loading date
    const cashDiscountRate = await getCashDiscountRate(pumpName, loadingDate);
    const cashDiscountAmount = fmt2(hsdLtr * cashDiscountRate);

    const advance = num(slip.loading_advance !== undefined && slip.loading_advance !== null && slip.loading_advance !== '' ? slip.loading_advance : (slip.advance !== undefined && slip.advance !== null && slip.advance !== '' ? slip.advance : slip.total_advance));
    const hsdBillNo = await generateHsdBillNo(pumpName, loadingDate, invoiceId);

    // ── SL NO & GCN NO ───────────────────────────────────────────────────
    const col = getCementCol();
    const slNo = await getOrAssignSlNo(col, invoiceId);

    // Fetch existing record to guard immutable manual fields
    const existing = await col.findOne({ _invoiceId: invoiceId.toString() });

    // ── Delete any existing dummy voucher rows for this truck on this exact date ────
    const vDateStr = fmtDate(loadingDate);
    const dummyRegex = new RegExp("^dummy_vch_");
    await col.deleteMany({
      _invoiceId: { $regex: dummyRegex },
      "VEHICLE NUMBER": { $regex: new RegExp(`^${vehicleNumber.trim().replace(/\\s+/g, '\\s*')}$`, "i") },
      "LOADING DT": vDateStr
    });

    const isValidGcn = (val) => {
      if (!val) return false;
      const v = String(val).trim().toLowerCase();
      return v !== "" && v !== "null" && v !== "undefined" && !v.includes("?");
    };

    let finalGcnNo = "";
    if (isValidGcn(gcn.gcn_no)) {
      finalGcnNo = String(gcn.gcn_no).trim();
    } else if (isValidGcn(supplyDetails.lorrey_receipt_number)) {
      finalGcnNo = String(supplyDetails.lorrey_receipt_number).trim();
    }

    if (!finalGcnNo) {
      finalGcnNo = await getOrAssignGcnNo(col, invoiceId, loadingDate);
    }

    if (finalGcnNo && (!gcn.gcn_no || gcn.gcn_no !== finalGcnNo)) {
      await Invoice.findByIdAndUpdate(invoiceId, {
        $set: { "gcn_data.gcn_no": finalGcnNo }
      });
    }

    const tdsAmount = amount > 0 ? fmt2(amount * tdsPercent) : 0;
    const balance = fmt2(hsdLtr - fuelRequired);
    const pctAdv = amount > 0 ? fmt2(((advance + hsdAmount) / amount) * 100) : 0;
    const dedicated = isATO ? fmt2(billingAmt * 0.095) : (effectiveComm !== null ? fmt2(billing * (1 - effectiveComm) * num(mt) * 0.085) : 0);
    const tenWExtra = (!hasStO && wheel.startsWith("10")) ? fmt2(billingAmt * 0.085) : 0;

    // ── Deductions & Net Amount Calculation ──────────────────────────────
    const existingGpsDev = num(existing?.["GPS Deviation Charges"] || existing?.["GPS DEVIATION CHARGES"] || 0);
    const existingSusp = num(existing?.["Suspense"] || existing?.["SUSPENSE"] || 0);
    const existingOthDed = num(existing?.["Others deduction"] || existing?.["OTHERS DEDUCTION"] || 0);
    const existingOthReason = existing?.["Other"] || existing?.["OTHERS DEDUCTION REASON"] || "";
    const existingGpsMonitoring = num(existing?.["GPS Monitoring Charge"] || existing?.["GPS MONITORING / TRIP CHARGE"] || 0);
    const existingBankTf = num(existing?.["Bank TF"] || existing?.["BANK TF"] || 0);
    const existingShortageAmt = num(existing?.["SHORTAGE (AMOUNT)"] || 0);
    const existingDamageDed = num(existing?.["Damage Deduction"] || existing?.["DAMAGE DEDUCTION"] || 0);
    const existingTravelExp = num(existing?.["TRAVELLING EXP"] || 0);
    const existingUpToll = num(existing?.["UP TOLL"] || 0);
    const existingDownToll = num(existing?.["DOWN TOLL"] || 0);

    let totalAccumulatedBankTf = 0;
    let freightContributions = [];
    try {
      const advRes = await getAccumulatedFreightAdvance(vehicleNumber, ownerName, loadingDate);
      if (advRes) {
        totalAccumulatedBankTf = advRes.totalBankTf || 0;
        freightContributions = advRes.contributions || [];
      }
    } catch (advErr) {
      console.warn('[syncManager] getAccumulatedFreightAdvance error:', advErr.message);
    }

    const existingRoadTaxTotal = existing && Array.isArray(existing._roadTaxContributions)
      ? existing._roadTaxContributions.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0)
      : 0;

    let effectiveBankTf = existingBankTf;
    if (totalAccumulatedBankTf > 0 || existingRoadTaxTotal > 0) {
      effectiveBankTf = totalAccumulatedBankTf + existingRoadTaxTotal;
    }

    const sumOfDeductions = fmt2(
      (totalRfid > 0 ? totalRfid : 0) +
      (addonFastag > 0 ? addonFastag : 0) +
      existingGpsDev +
      existingSusp +
      existingOthDed
    );

    const netAmount = (amount > 0) ? fmt2(
      amount
      - tdsAmount
      - advance
      - siteCash
      - officeCash
      - effectiveBankTf
      - existingOthDed
      - existingGpsMonitoring
      - (addonGpsDevice > 0 ? addonGpsDevice : 0)
      - existingGpsDev
      - existingSusp
      - (totalRfid > 0 ? totalRfid : 0)
      - (addonFastag > 0 ? addonFastag : 0)
      - hsdAmount
      - existingTravelExp
      - existingShortageAmt
      - (existingDamageDed > 0 && existingDamageDed !== existingShortageAmt ? existingDamageDed : 0)
      - num(existingOthReason)
    ) : 0;

    const grossAmount = (netAmount !== 0) ? fmt2(
      netAmount
      + existingUpToll
      + existingDownToll
      + (num(ntExtraUnloading) > 0 ? num(ntExtraUnloading) : num(existing?.["EXTRA UNLOADING"] || 0))
    ) : 0;

    // ── Derive month/year from loadingDate for Cement Register filter ─────
    const loadingDateObj = parseToDate(loadingDate);
    const entryMonth = loadingDateObj.getMonth() + 1; // 1-12
    const entryYear = loadingDateObj.getFullYear();

    // ── Compose final authoritative document ─────────────────────────────
    const payload = {
      "_invoiceId": invoiceId.toString(),
      "SL NO": slNo,
      "LOADING DT": fmtDate(loadingDate),
      "SITE": site,
      "VEHICLE NUMBER": vehicleNumber,
      "WHEEL": wheel,
      "E-WAY BILL NO": safe(ewbDetails.ewb_number).replace(/^\.+/, ''),
      "E-WAY BILL VALIDITY": safe(ewbDetails.ewb_valid_date ? fmtDate(ewbDetails.ewb_valid_date) : ""),
      "GCN NO": finalGcnNo,
      "INVOICE NO": invoiceNo,
      "Bill Type": billType,
      "SHIPMENT NO": shipmentNo,
      "DN": driverNo,
      "DESTINATION": destination,
      "PARTY NAME": partyName,
      "MT": mt !== "" ? mt : "",
      "BILLING": billing > 0 ? billing : "",
      "PARTY RATE": partyRateVal,
      "PARTY RATE (95-97%)": partyRateVal,
      "PARTY RATE %": partyRatePctStr,
      "PARTY RATE PERCENT": partyRatePct,
      "PARTY RATE AMOUNT": partyRateAmount > 0 ? partyRateAmount : "",
      "PARTY RATE VAR": isStandard95 ? "" : partyRateVal,
      "Billing Amount": billingAmt > 0 ? billingAmt : "",
      "BILLING AMOUNT": billingAmt > 0 ? billingAmt : "",
      "BILLING ER 95%": billingEr95 > 0 ? billingEr95 : "",
      "BILLING ER VAR": billingErVar > 0 ? billingErVar : "",
      "AMOUNT": amount > 0 ? amount : "",
      "PROFIT": profit > 0 ? profit : "",
      "TDS": (tdsPercent !== undefined && tdsPercent !== null && amount > 0) ? tdsAmount : 0,
      "_freight_commission": basicFreightCommission,
      "_commission_status": hasValidCommission ? "VALID" : "INVALID_OR_MISSING",
      "_commission_error": commissionError,
      "ADVANCE": advance > 0 ? advance : "",
      "Bank TF": effectiveBankTf > 0 ? effectiveBankTf : "",
      "BANK TF": effectiveBankTf > 0 ? effectiveBankTf : "",
      "ADVANCE (BANK TF)": effectiveBankTf > 0 ? effectiveBankTf : "",
      "Site Cash": siteCash > 0 ? siteCash : "",
      "OFFICE CASH": officeCash > 0 ? officeCash : "",
      "SITE_CASH_PROOF_URL": siteCashProofUrl,
      "OFFICE_CASH_PROOF_URL": officeCashProofUrl,
      "PUMP NAME": pumpName,
      "HSD SLIP NO": hsdSlipNo,
      "HSD BILL NO": hsdBillNo,
      "KM AS PER RATE CHART": distanceKm > 0 ? distanceKm : "",
      "FUEL REQUIRED": fuelRequired > 0 ? fuelRequired : "",
      "HSD (LTR)": hsdLtr > 0 ? hsdLtr : "",
      "BALANCE": balance,
      "HSD RATE": hsdRate > 0 ? hsdRate : "",
      "HSD AMOUNT": hsdAmount > 0 ? hsdAmount : "",
      "CASH DISCOUNT RATE": cashDiscountRate > 0 ? cashDiscountRate : "",
      "CASH DISCOUNT": cashDiscountAmount > 0 ? cashDiscountAmount : "",
      "% OF ADV": pctAdv > 0 ? pctAdv : "",
      "DEDICATED": dedicated > 0 ? dedicated : "",
      "10W EXTRA 8.5%": tenWExtra > 0 ? tenWExtra : "",
      "OWNER NAME": ownerName,
      "GIVE GPS DEVICE": addonGpsDevice > 0 ? addonGpsDevice : "",
      "Give GPS DEVICE": addonGpsDevice > 0 ? addonGpsDevice : "",
      "GIVE RFID TAG": totalRfid > 0 ? totalRfid : "",
      "Give RFID TAG": totalRfid > 0 ? totalRfid : "",
      "FASTAG": addonFastag > 0 ? addonFastag : "",
      "EXTRA UNLOADING": isNTInvoice ? (ntExtraUnloading !== "" ? ntExtraUnloading : "") : (existing?.["EXTRA UNLOADING"] || ""),
      "SUM OF RFID & FASTAG & DEVIATION & SUSPENSE & OTHERS DEDUCTION": sumOfDeductions > 0 ? sumOfDeductions : "",
      "NET AMOUNT": netAmount !== 0 ? netAmount : "",
      "GROSS AMOUNT": grossAmount !== 0 ? grossAmount : "",
      "_is_nt_invoice": isNTInvoice,
      "_source_nt_unloading": isNTInvoice && ntExtraUnloading !== "",
      "VERIFICATION STATUS": invoice.is_hsd_verified ? "Verified" : "Not Verified",
      "_tds_percent": tdsPercent,
      "_tds_rate": tdsPercent,
      "_is_ato": isATO,
      "_source": "auto",
      "_auto_updated_at": new Date(),
      "month": entryMonth,
      "year": entryYear,
    };

    if (freightContributions.length > 0) {
      payload._freightAdvanceContributions = freightContributions;
      payload._monojDebitContributions = freightContributions;
    }

    if (existing && Array.isArray(existing._roadTaxContributions) && existing._roadTaxContributions.length > 0) {
      payload._roadTaxContributions = existing._roadTaxContributions;
    }

    // Keep existing manually-entered fields — only overwrite non-empty auto values
    const clean = {};
    for (const key in payload) {
      const v = payload[key];
      if (v !== "" && v !== undefined && v !== null) clean[key] = v;
    }

    // Always explicitly set Addon and NT fields so removing/clearing them in invoice edit clears them in Cement Register
    clean["Give GPS DEVICE"] = addonGpsDevice > 0 ? addonGpsDevice : "";
    clean["GIVE GPS DEVICE"] = addonGpsDevice > 0 ? addonGpsDevice : "";
    clean["Give RFID TAG"] = totalRfid > 0 ? totalRfid : "";
    clean["GIVE RFID TAG"] = totalRfid > 0 ? totalRfid : "";
    clean["FASTAG"] = addonFastag > 0 ? addonFastag : "";

    if (isNTInvoice) {
      clean["EXTRA UNLOADING"] = ntExtraUnloading !== "" ? ntExtraUnloading : "";
      clean["_source_nt_unloading"] = ntExtraUnloading !== "";
      clean["_is_nt_invoice"] = true;
    } else if (existing && (existing._source_nt_unloading || existing._is_nt_invoice)) {
      clean["EXTRA UNLOADING"] = "";
      clean["_source_nt_unloading"] = false;
      clean["_is_nt_invoice"] = false;
    }

    // VERIFICATION STATUS: once "Verified", never revert back to "Not Verified"
    if (existing && existing["VERIFICATION STATUS"] === "Verified") {
      clean["VERIFICATION STATUS"] = "Verified";
    }

    // Preserve manually edited TDS value
    if (existing && (existing.tds_manual || existing._tds_manual)) {
      clean["TDS"] = existing["TDS"];
      clean["_tds_percent"] = existing["_tds_percent"];
      clean["_tds_rate"] = existing["_tds_rate"] || existing["_tds_percent"];
      clean["tds_manual"] = true;
    }

    // Preserve manual fields from existing document
    if (existing) {
      if (existing["RECEIVING DATE"]) clean["RECEIVING DATE"] = existing["RECEIVING DATE"];
      if (existing["UNLOADING STATUS"]) clean["UNLOADING STATUS"] = existing["UNLOADING STATUS"];
      if (existing["BILL NO"]) clean["BILL NO"] = existing["BILL NO"];
      if (existing["BILL DATE"]) clean["BILL DATE"] = existing["BILL DATE"];
      if (existing["UNLOADING BILL NO"]) clean["UNLOADING BILL NO"] = existing["UNLOADING BILL NO"];
      if (existing["UNLOADING BILL DATE"]) clean["UNLOADING BILL DATE"] = existing["UNLOADING BILL DATE"];
      if (existing["By Portal"]) clean["By Portal"] = existing["By Portal"];
      if (existing["CHALLAN STATUS"]) clean["CHALLAN STATUS"] = existing["CHALLAN STATUS"];
      if (existing["challan_proof"]) clean["challan_proof"] = existing["challan_proof"];
      if (effectiveBankTf > 0) {
        clean["Bank TF"] = effectiveBankTf;
        clean["BANK TF"] = effectiveBankTf;
        clean["ADVANCE (BANK TF)"] = effectiveBankTf;
      } else if (existing["Bank TF"]) {
        clean["Bank TF"] = existing["Bank TF"];
      }
      if (existing["GPS Monitoring Charge"]) clean["GPS Monitoring Charge"] = existing["GPS Monitoring Charge"];
      if (existing["GPS Deviation Charges"]) clean["GPS Deviation Charges"] = existing["GPS Deviation Charges"];
      if (existing["Give GPS DEVICE"]) clean["Give GPS DEVICE"] = existing["Give GPS DEVICE"];
      if (existing["Give RFID TAG"]) clean["Give RFID TAG"] = existing["Give RFID TAG"];
      if (existing["Damage Deduction"]) clean["Damage Deduction"] = existing["Damage Deduction"];
      if (existing["Suspense"]) clean["Suspense"] = existing["Suspense"];
      if (existing["Others deduction"]) clean["Others deduction"] = existing["Others deduction"];
      if (existing["Other"]) clean["Other"] = existing["Other"];
      if (existing["EXTRA ALLOWED"]) clean["EXTRA ALLOWED"] = existing["EXTRA ALLOWED"];
      if (existing["ACTUAL EXTRA"]) clean["ACTUAL EXTRA"] = existing["ACTUAL EXTRA"];
      if (existing["TRAVELLING EXP"]) clean["TRAVELLING EXP"] = existing["TRAVELLING EXP"];
      if (existing["SHORTAGE (BAG)"]) clean["SHORTAGE (BAG)"] = existing["SHORTAGE (BAG)"];
      if (existing["SHORTAGE (RATE)"]) clean["SHORTAGE (RATE)"] = existing["SHORTAGE (RATE)"];
      if (existing["SHORTAGE (AMOUNT)"]) clean["SHORTAGE (AMOUNT)"] = existing["SHORTAGE (AMOUNT)"];
      if (existing["deductionsOverride"]) clean["deductionsOverride"] = existing["deductionsOverride"];
      if (existing["debitAllocations"]) clean["debitAllocations"] = existing["debitAllocations"];
      if (existing["baseDeductions"]) clean["baseDeductions"] = existing["baseDeductions"];
      if (existing["UP TOLL"]) clean["UP TOLL"] = existing["UP TOLL"];
      if (existing["DOWN TOLL"]) clean["DOWN TOLL"] = existing["DOWN TOLL"];
      if (existing["Duration"]) clean["Duration"] = existing["Duration"];
      if (existing["Detention"]) clean["Detention"] = existing["Detention"];
      if (existing["Transporting Coast"]) clean["Transporting Coast"] = existing["Transporting Coast"];

      if (existing["PAYMENT STATUS"]) clean["PAYMENT STATUS"] = existing["PAYMENT STATUS"];
      if (existing["PAYMENT PROOF URL"]) clean["PAYMENT PROOF URL"] = existing["PAYMENT PROOF URL"];
      if (existing["PAYMENT DATE"]) clean["PAYMENT DATE"] = existing["PAYMENT DATE"];
      if (existing["PAYMENT REF"]) clean["PAYMENT REF"] = existing["PAYMENT REF"];
      if (existing["DIFFERENCE"] !== undefined) clean["DIFFERENCE"] = existing["DIFFERENCE"];

      // Preserve manually edited OFFICE CASH only if there's no auto-fetched value
      if (existing["OFFICE CASH"] !== undefined && officeCash === 0) {
        clean["OFFICE CASH"] = existing["OFFICE CASH"];
      }
    }

    await col.updateOne(
      { _invoiceId: invoiceId.toString() },
      { $set: clean },
      { upsert: true }
    );

    // Clean up any dummy rows created for this vehicle + loadingDate
    if (vehicleNumber && loadingDate) {
      try {
        const strippedVeh = String(vehicleNumber).replace(/[^a-zA-Z0-9]/g, '');
        if (strippedVeh) {
          const vehRegex = new RegExp(`^[^a-zA-Z0-9]*${strippedVeh.split('').join('[^a-zA-Z0-9]*')}[^a-zA-Z0-9]*$`, 'i');
          const dummyRows = await col.find({
            $and: [
              {
                $or: [
                  { "VEHICLE NUMBER": vehRegex },
                  { "VEHICLE NO": vehRegex },
                  { "VEHICLE NO.": vehRegex }
                ]
              },
              {
                $or: [
                  { isDummy: true },
                  { _isDummy: true },
                  { sourceType: { $in: ['FREIGHT_ADVANCE', 'BANK_BOOK_FREIGHT_ADVANCE', 'MONOJ_DEBIT', 'MONOJ_BANDHAN_DEBIT'] } }
                ]
              }
            ]
          }).toArray();

          for (const dRow of dummyRows) {
            const dRowDate = dRow["LOADING DT"] || dRow["LOADING DATE"] || dRow["BILL DATE"] || dRow.date;
            if (isSameCalendarDate(dRowDate, loadingDate)) {
              await col.deleteOne({ _id: dRow._id });
            }
          }
        }
      } catch (cleanDummyErr) {
        console.warn('[syncManager] dummy cleanup error:', cleanDummyErr.message);
      }
    }
    console.log(`[syncManager] pushToRegister OK for invoice ${invoiceId} (SL:${slNo})`);
    emitCementUpdate({ action: "upsert", invoiceId: invoiceId.toString() });
    hookCheckMktTripsFromEntry(clean).catch(e => console.warn('[mktCommission] Hook error:', e.message));
  } catch (e) {
    console.error("[syncManager] pushToRegister failed:", e.message);
  }
}

// ─── Sync register edit back to Invoice ──────────────────────────────────────
async function pushToInvoice(cementRowId, modifications) {
  try {
    const col = getCementCol();
    const ObjectId = require("mongodb").ObjectId;
    const row = await col.findOne({ _id: new ObjectId(cementRowId) });
    if (!row || !row._invoiceId) return;

    const invUpdate = {};
    if ("PARTY NAME" in modifications) invUpdate["consignee_name"] = modifications["PARTY NAME"];
    if ("HSD AMOUNT" in modifications) invUpdate["lorry_hire_slip_data.diesel_advance"] = num(modifications["HSD AMOUNT"]);
    if ("HSD (LTR)" in modifications) invUpdate["lorry_hire_slip_data.diesel_litres"] = num(modifications["HSD (LTR)"]);
    if ("HSD RATE" in modifications) invUpdate["lorry_hire_slip_data.diesel_rate"] = num(modifications["HSD RATE"]);
    if ("HSD SLIP NO" in modifications) invUpdate["lorry_hire_slip_data.fuel_slip_no"] = modifications["HSD SLIP NO"];
    if ("ADVANCE" in modifications) invUpdate["lorry_hire_slip_data.total_advance"] = num(modifications["ADVANCE"]);
    if ("PUMP NAME" in modifications) invUpdate["lorry_hire_slip_data.station_name"] = modifications["PUMP NAME"];
    if ("GCN NO" in modifications) invUpdate["gcn_data.gcn_no"] = modifications["GCN NO"];
    if ("VEHICLE NUMBER" in modifications) {
      invUpdate["human_verified_data.supply_details.vehicle_number"] = modifications["VEHICLE NUMBER"];
      invUpdate["ai_data.supply_details.vehicle_number"] = modifications["VEHICLE NUMBER"];
      invUpdate["ai_data.invoice_data.supply_details.vehicle_number"] = modifications["VEHICLE NUMBER"];
    }
    if (Object.keys(invUpdate).length > 0) {
      await Invoice.findByIdAndUpdate(row._invoiceId, { $set: invUpdate });
      console.log(`[syncManager] pushToInvoice OK for row ${cementRowId}`);
    }
  } catch (e) {
    console.error("[syncManager] pushToInvoice failed:", e.message);
  }
}

// ─── Remove cement register row when invoice is deleted ───────────────────────
async function removeFromRegister(invoiceId) {
  try {
    const col = getCementCol();
    const result = await col.deleteOne({ _invoiceId: invoiceId.toString() });
    if (result.deletedCount > 0) {
      console.log(`[syncManager] removeFromRegister OK for invoice ${invoiceId}`);
      emitCementUpdate({ action: "delete", invoiceId: invoiceId.toString() });
    }

    // Re-sequence SL NOs after deletion so they stay 1, 2, 3...
    await resequenceSlNos();
  } catch (e) {
    console.error("[syncManager] removeFromRegister failed:", e.message);
  }
}

// ─── Re-sequence SL NOs to be gapless: 1, 2, 3... ───────────────────────────
async function resequenceSlNos() {
  try {
    const col = getCementCol();
    const rows = await col.find({}).sort({ "SL NO": 1, "_auto_updated_at": 1 }).toArray();
    const bulkOps = rows.map((row, idx) => ({
      updateOne: {
        filter: { _id: row._id },
        update: { $set: { "SL NO": idx + 1 } }
      }
    }));
    if (bulkOps.length > 0) await col.bulkWrite(bulkOps);
  } catch (e) {
    console.error("[syncManager] resequenceSlNos failed:", e.message);
  }
}

// ─── Dummy Voucher Entry logic ───────────────────────────────────────────────
async function syncVoucherDummy(voucherId) {
  try {
    const voucher = await Voucher.findById(voucherId).lean();
    if (!voucher || !voucher.vehicleNumber) return;

    const col = getCementCol();

    // Check if a dummy row already exists for this exact voucher
    const dummyId = `dummy_vch_${voucher._id.toString()}`;

    // Look for any existing real invoice row on the EXACT same day for this truck
    const vDateStr = fmtDate(voucher.date);

    const existingReal = await col.findOne({
      "VEHICLE NUMBER": { $regex: new RegExp(`^${voucher.vehicleNumber.trim().replace(/\\s+/g, '\\s*')}$`, "i") },
      "LOADING DT": vDateStr,
      _invoiceId: { $not: /^dummy_/ }
    });

    if (existingReal) {
      // If a real slip exists today, DO NOT create a dummy! The real pushToRegister pulls the voucher cash natively.
      await col.deleteOne({ _invoiceId: dummyId });
      // Re-trigger the real row to ensure it grabs the cash just in case
      await pushToRegister(existingReal._invoiceId);
      return;
    }

    // Otherwise, create/update the dummy row safely mapped to the UI schemas
    const isSite = voucher.appliedPanel === "SITE" || String(voucher.createdByRole || "").toUpperCase().includes("SITE");
    const isOffice = !isSite;
    const siteCash = isSite ? num(voucher.amount) : "";
    const officeCash = isOffice ? num(voucher.amount) : "";
    const siteCashProofUrl = isSite ? (voucher.slip_url || "") : "";
    const officeCashProofUrl = isOffice ? (voucher.slip_url || "") : "";

    const slNo = await getOrAssignSlNo(col, dummyId);

    // Derive month/year from voucher date so dummy rows appear in Cement Register filter
    const voucherDateObj = new Date(voucher.date || Date.now());
    const dummyMonth = voucherDateObj.getMonth() + 1; // 1-12 calendar month
    const dummyYear = voucherDateObj.getFullYear();

    const dummyPayload = {
      _invoiceId: dummyId,
      "SL NO": slNo,
      "LOADING DT": vDateStr,
      "SITE": "",
      "VEHICLE NUMBER": voucher.vehicleNumber,
      "OWNER NAME": voucher.name || voucher.ownerName || "",

      // Clearly label it in the central registry
      "INVOICE NO": "",
      "INVOICE NUMBER": "",
      "SHIPMENT NO": "",
      "SHIPMENT NUMBER": "",
      "DESTINATION": "NO SLIP",
      "VERIFICATION STATUS": "Not Verified",

      // Cash amounts
      "Site Cash": siteCash,
      "SITE CASH": siteCash,
      "SITE CASH ADVANCE": siteCash,
      "OFFICE CASH": officeCash,
      "OFFICE CASH ADVANCE": officeCash,
      "Office Cash": officeCash,
      "SITE_CASH_PROOF_URL": siteCashProofUrl,
      "OFFICE_CASH_PROOF_URL": officeCashProofUrl,

      // CRITICAL: month/year required for Cement Register GET filter
      month: dummyMonth,
      year: dummyYear,

      isDummy: true,
      _isDummy: true,
      _source: "auto_dummy",
      sourceType: isSite ? "SITE_VOUCHER" : "OFFICE_VOUCHER",
      sourceTransactionId: voucher._id.toString(),
      _auto_updated_at: new Date()
    };

    await col.updateOne(
      { _invoiceId: dummyId },
      { $set: dummyPayload },
      { upsert: true }
    );
    console.log(`[syncManager] Dummy row created for voucher ${voucher._id}`);
    emitCementUpdate({ action: "upsert", invoiceId: dummyId });

  } catch (e) {
    console.error("[syncManager] syncVoucherDummy failed:", e.message);
  }
}

module.exports = { pushToRegister, pushToInvoice, removeFromRegister, syncVoucherDummy, getTruckDetails };
