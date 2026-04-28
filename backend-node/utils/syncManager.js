const mongoose = require("mongoose");
const Invoice = require("../models/Invoice");
const Voucher = require("../models/Voucher");

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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function safe(val, fallback = "") {
  return (val !== null && val !== undefined) ? val : fallback;
}
function num(val, fallback = 0) {
  const n = parseFloat(val);
  return isNaN(n) ? fallback : n;
}
function fmt2(n) {
  return Math.round(num(n) * 100) / 100;
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

  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/** Get current financial year string: e.g. "25-26" */
function getFinancialYear(date) {
  const d = new Date(date || Date.now());
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

  const date = new Date(loadingDate || Date.now());
  const fy = getFinancialYear(date);
  const prefix = `DAC/${fy}/`;

  // Find max GCN number in this FY assigned natively. Format: DAC/25-26/N
  const docs = await col.find(
    { "GCN NO": { $regex: new RegExp(`^DAC/${fy}/\\d+$`) } },
    { projection: { "GCN NO": 1 } }
  ).toArray();

  let maxSeq = 0;
  for (const doc of docs) {
    if (!doc["GCN NO"]) continue;
    const parts = doc["GCN NO"].split('/');
    if (parts.length === 3) {
      const seq = parseInt(parts[2], 10);
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
  const date = new Date(loadingDate || Date.now());
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

  return `${prefix}/${fy}/${intervalIndex}`;
}

async function getFuelRate(pumpName, dateVal) {
  try {
    const col = mongoose.connection.useDb("pump_payment").collection("fuel_rates");
    const d = new Date(dateVal);
    if (!pumpName || isNaN(d.getTime())) return 91.99;

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

    const hvd = invoice.human_verified_data || invoice.ai_data || {};
    const slip = invoice.lorry_hire_slip_data || {};
    const gcn = invoice.gcn_data || {};

    // ── Extract core invoice fields ──────────────────────────────────────
    const invoiceDetails = hvd.invoice_details || {};
    const supplyDetails = hvd.supply_details || {};
    const consigneeDetails = hvd.consignee_details || {};
    const ewbDetails = hvd.ewb_details || {};
    const items = hvd.items || [];
    const sellerDetails = hvd.seller_details || {};

    const vehicleNumber = safe(supplyDetails.vehicle_number);
    const destination = safe(supplyDetails.destination);
    const invoiceNo = safe(invoiceDetails.invoice_number);
    const billType = safe(invoiceDetails.invoice_type);
    const shipmentNo = safe(supplyDetails.shipment_number);
    const partyName = safe(consigneeDetails.consignee_name || invoice.consignee_name);

    // Site determination logic
    const buyerDetails = hvd.buyer_details || {};
    const rawSite = safe(sellerDetails.seller_name) || safe(buyerDetails.buyer_name) || "";
    const rawSiteUpper = rawSite.toUpperCase();
    let site = "";
    if (rawSiteUpper.includes("NUVOCO") || rawSiteUpper === "NVCL") site = "NVCL";
    else if (rawSiteUpper.includes("VISTA") || rawSiteUpper === "NVL") site = "NVL";
    else site = rawSiteUpper.includes("DIPALI") ? "" : rawSite;

    // Prioritize extracted invoice_date over system created_at
    const loadingDate = invoiceDetails.invoice_date || invoice.created_at;

    // MT = total quantity from items
    const mt = fmt2(items.reduce((sum, item) => sum + num(item.quantity), 0));

    // ── Add-on Charges (from invoice form) ──────────────────────────────
    const addonCharges = hvd.addon_charges || [];
    const getAddon = (typeName) => {
      const found = addonCharges.find(c => c.type === typeName);
      return found ? num(found.amount) : 0;
    };
    const addonGpsDevice = getAddon("GPS Device");
    const addonRfidTag = getAddon("RFID Tag");
    const addonRfidReassure = getAddon("RFID Tag Reassurance");
    const addonFastag = getAddon("Fastag");

    // ── Truck Contact lookup ─────────────────────────────────────────────
    let wheel = "", ownerName = "", tdsPercent = 1, isATO = false, driverNo = "", hasStO = false;
    if (vehicleNumber) {
      const truckCol = getInvoiceSystemDb().db.collection("Truck Contact Number");
      const truckRegex = makeSpaceAgnosticRegex(vehicleNumber);
      const truck = await truckCol.findOne({
        $or: [
<<<<<<< HEAD
          { "Truck No": { $regex: new RegExp(`^${vehicleNumber.trim()}$`, "i") } },
          { truck_no: { $regex: new RegExp(`^${vehicleNumber.trim()}$`, "i") } }
        ]
      });
      if (truck) {
        const vType = safe(truck["Type of vehicle"] || truck.type || "");
        const wheelMatch = vType.match(/(\d+)/);
        wheel = wheelMatch ? `${wheelMatch[1]}W` : vType;
        ownerName = safe(truck["Owner Name"] || truck.owner_name);
        driverNo = safe(truck["DRIVER CONTACT"] || truck.contact_no);

=======
          { "Truck No": { $regex: truckRegex } },
          { truck_no: { $regex: truckRegex } },
          { "Contact No.(Truck No.)": { $regex: truckRegex } },
          { "Contact No\.(Truck No\.)": { $regex: truckRegex } }
        ]
      });
      if (truck) {
        // Robust vehicle type / wheel count detection
        let vType = truck["Type of vehicle"] || truck.type || truck["Vehicle Type"] || truck.type_of_vehicle || truck.vehicle_type || "";

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
        ownerName = safe(truck["Owner Name"] || truck.owner_name);
        driverNo = safe(truck["DRIVER CONTACT"] || truck.contact_no || truck["Contact No."]);

>>>>>>> 8e3eac3 (Fix incentive totals, freight rate lookup for Suri, and add basic freight commission field in contacts)
        const pan = safe(truck["PAN No."] || truck.pan_no);
        const aadhar = safe(truck["Aadhar No."] || truck.aadhar_no);
        tdsPercent = (pan && aadhar) ? 0 : 1;

        const custType = safe(truck["TYPE OF CUSTOMER"] || "").toUpperCase();
        isATO = custType.includes("ATO");
        hasStO = custType.includes("STO");
      }
    }
    // ── Freight lookup — match by destination against DEST ZONE DESC ────
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

    // ── Site Cash — bind explicitly to exact calendar date to prevent history overlap ──
    let siteCash = 0;
    let officeCash = 0;
    let siteCashProofUrl = "";
    let officeCashProofUrl = "";
    if (vehicleNumber) {
      const vStart = new Date(loadingDate);
      vStart.setHours(0, 0, 0, 0);
      const vEnd = new Date(loadingDate);
      vEnd.setHours(23, 59, 59, 999);

      const baseQuery = {
        vehicleNumber: { $regex: new RegExp(`^${vehicleNumber.trim().replace(/\\s+/g, '\\s*')}$`, "i") },
        date: { $gte: vStart, $lte: vEnd }
      };

      // STRICT: always match by vehicle number + exact date only.
      // Never use invoiceId as an $or alternative — that bypasses the date window
      // and causes vouchers from different days to contaminate this row.
      const voucherQuery = baseQuery;

      // Pick the most recently created voucher from site admin (OFFICE)
      const siteVoucher = await Voucher.findOne({ ...voucherQuery, createdByRole: { $ne: "HEAD_OFFICE" } })
        .sort({ createdAt: -1 })
        .lean();

      if (siteVoucher) {
        siteCash = num(siteVoucher.amount);
        siteCashProofUrl = siteVoucher.slip_url || "";  // S3 PDF URL of the voucher slip
      }

      // Pick the most recently created voucher from office admin (HEAD_OFFICE)
      const officeVoucher = await Voucher.findOne({ ...voucherQuery, createdByRole: "HEAD_OFFICE" })
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
    // HSD AMOUNT is always LTR * RATE as per user request for automatic updates
    const hsdAmount = fmt2(hsdLtr * hsdRate);

    const advance = num(slip.total_advance || slip.loading_advance);
    const hsdBillNo = await generateHsdBillNo(pumpName, loadingDate, invoiceId);

    // ── SL NO & GCN NO ───────────────────────────────────────────────────
    const col = getCementCol();
    const slNo = await getOrAssignSlNo(col, invoiceId);

    // ── Delete any existing dummy voucher rows for this truck on this exact date ────
    const vDateStr = fmtDate(loadingDate);
    const dummyRegex = new RegExp("^dummy_vch_");
    await col.deleteMany({
      _invoiceId: { $regex: dummyRegex },
      "VEHICLE NUMBER": { $regex: new RegExp(`^${vehicleNumber.trim().replace(/\\s+/g, '\\s*')}$`, "i") },
      "LOADING DT": vDateStr
    });

    let finalGcnNo = safe(gcn.gcn_no);
    if (!finalGcnNo || finalGcnNo.includes('-')) {
      finalGcnNo = await getOrAssignGcnNo(col, invoiceId, loadingDate);

      // Crucial Step: Save the auto-generated GCN natively back to the central Invoice doc
      // so the frontend can fetch it and generate the PDF with the correct sequence number!
      await Invoice.findByIdAndUpdate(invoiceId, {
        $set: { "gcn_data.gcn_no": finalGcnNo }
      });
    }

    // ── Calculated fields ────────────────────────────────────────────────
    const partyRate = fmt2(billing * 0.95);
    const billingAmt = fmt2(billing * mt);
    const billingEr95 = fmt2(billingAmt * 0.95);
    const amount = billingEr95;
    const profit = fmt2(billingAmt * 0.05);
    const tdsAmount = fmt2(amount * tdsPercent / 100);
    const balance = fmt2(hsdLtr - fuelRequired);
    const pctAdv = amount > 0 ? fmt2(((advance + hsdAmount) / amount) * 100) : 0;
    const dedicated = isATO ? fmt2(billingAmt * 0.095) : fmt2(partyRate * 0.085);
    const tenWExtra = (!hasStO && wheel.startsWith("10")) ? fmt2(partyRate * 0.085) : 0;

    // ── Compose final document ───────────────────────────────────────────
    const payload = {
      "_invoiceId": invoiceId.toString(),
      "SL NO": slNo,
      "LOADING DT": fmtDate(loadingDate),
      "SITE": site,
      "VEHICLE NUMBER": vehicleNumber,
      "WHEEL": wheel,
      "E-WAY BILL NO": safe(ewbDetails.ewb_number),
      "E-WAY BILL VALIDITY": safe(ewbDetails.ewb_valid_date ? fmtDate(ewbDetails.ewb_valid_date) : ""),
      "GCN NO": finalGcnNo,
      "INVOICE NO": invoiceNo,
      "Bill Type": billType,
      "SHIPMENT NO": shipmentNo,
      "DN": driverNo,
      "DESTINATION": destination,
      "PARTY NAME": partyName,
      "MT": mt || "",
      "BILLING": billing || "",
      "PARTY RATE": partyRate || "",
      "Billing Amount": billingAmt || "",
      "BILLING ER 95%": billingEr95 || "",
      "AMOUNT": amount || "",
      "PROFIT": profit || "",
      "TDS@1%": tdsAmount || "",
      "ADVANCE": advance || "",
      "Site Cash": siteCash || "",
      "OFFICE CASH": officeCash || "",
      "SITE_CASH_PROOF_URL": siteCashProofUrl,  // auto-fetched from voucher slip PDF
      "OFFICE_CASH_PROOF_URL": officeCashProofUrl,
      "PUMP NAME": pumpName,
      "HSD SLIP NO": hsdSlipNo,
      "HSD BILL NO": hsdBillNo,
      "KM AS PER RATE CHART": distanceKm > 0 ? distanceKm : "",
      "FUEL REQUIRED": fuelRequired || "",
      "HSD (LTR)": hsdLtr || "",
      "BALANCE": balance,
      "HSD RATE": hsdRate || "",
      "HSD AMOUNT": hsdAmount || "",
      "% OF ADV": pctAdv || "",
      "DEDICATED": dedicated || "",
      "10W EXTRA 8.5%": tenWExtra || "",
      "OWNER NAME": ownerName,
      "GPS DEVICE": addonGpsDevice || "",
      "RFID TAG": addonRfidTag || "",
      "RFID REASSURANCE": addonRfidReassure || "",
      "FASTAG": addonFastag || "",
      "VERIFICATION STATUS": invoice.is_hsd_verified ? "Verified" : "Not Verified",
      "_tds_percent": tdsPercent,
      "_is_ato": isATO,
      "_source": "auto",
      "_auto_updated_at": new Date(),
    };

    // Keep existing manually-entered fields — only overwrite non-empty auto values
    const clean = {};
    for (const key in payload) {
      const v = payload[key];
      if (v !== "" && v !== undefined && v !== null) clean[key] = v;
    }

    // Fetch existing record to guard immutable fields
    const existing = await col.findOne({ _invoiceId: invoiceId.toString() });

    // VERIFICATION STATUS: once "Verified", never revert back to "Not Verified"
    if (existing && existing["VERIFICATION STATUS"] === "Verified") {
      clean["VERIFICATION STATUS"] = "Verified";
    }

    // PAYMENT STATUS and PAYMENT PROOF URL: never overwrite from auto-sync
    if (existing) {
      if (existing["PAYMENT STATUS"]) clean["PAYMENT STATUS"] = existing["PAYMENT STATUS"];
      if (existing["PAYMENT PROOF URL"]) clean["PAYMENT PROOF URL"] = existing["PAYMENT PROOF URL"];

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
    console.log(`[syncManager] pushToRegister OK for invoice ${invoiceId} (SL:${slNo})`);
    emitCementUpdate({ action: "upsert", invoiceId: invoiceId.toString() });
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
    const isOffice = (voucher.createdByRole === "HEAD_OFFICE");
    const siteCash = isOffice ? "" : num(voucher.amount);
    const officeCash = isOffice ? num(voucher.amount) : "";
    const siteCashProofUrl = isOffice ? "" : (voucher.slip_url || "");
    const officeCashProofUrl = isOffice ? (voucher.slip_url || "") : "";

    const slNo = await getOrAssignSlNo(col, dummyId);

    const dummyPayload = {
      _invoiceId: dummyId,
      "SL NO": slNo,
      "LOADING DT": vDateStr,
      "SITE": "",
      "VEHICLE NUMBER": voucher.vehicleNumber,

      // Clearly label it in the central registry
      "INVOICE NO": "CASH VOUCHER",
      "DESTINATION": "NO SLIP",
      "VERIFICATION STATUS": "Not Verified",

      // Cash amounts
      "Site Cash": siteCash,
      "OFFICE CASH": officeCash,
      "SITE_CASH_PROOF_URL": siteCashProofUrl,
      "OFFICE_CASH_PROOF_URL": officeCashProofUrl,

      _source: "auto_dummy",
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

module.exports = { pushToRegister, pushToInvoice, removeFromRegister, syncVoucherDummy };
