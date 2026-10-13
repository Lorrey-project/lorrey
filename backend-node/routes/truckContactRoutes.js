const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { ObjectId } = require("mongodb");
const truckContactUpload = require("../middleware/truckContactUpload");
const { hookCheckIncentiveEligibility } = require("../utils/incentiveEligibilityManager");

// ─────────────────────────────────────────────────────────────────────────────
// We bypass Mongoose entirely and use the raw MongoDB native driver.
// This guarantees that field names like "Truck No ", "Owner Name " etc.
// are saved EXACTLY as sent — Mongoose schema processing was mangling them.
// ─────────────────────────────────────────────────────────────────────────────

function getCollection() {
  return mongoose.connection.useDb("invoice_system").collection("Truck Contact Number");
}

function getOwnerDetailsCollection() {
  return mongoose.connection.useDb("invoice_system").collection("owner details");
}

function getApprovalCollection() {
  return mongoose.connection.useDb("invoice_system").collection("Truck Contact Approvals");
}

function safeEmit(event, data) {
  try {
    const { getIO } = require("../socket");
    const io = getIO();
    if (io) io.emit(event, data);
  } catch (_) {}
}

function normVeh(v) {
  if (!v) return "";
  return String(v).replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

// Helper to fetch contacts with owner details collection as primary source of truth
async function fetchAllContacts() {
  const ownerCol = getOwnerDetailsCollection();
  const truckCol = getCollection();

  const ownerDocs = await ownerCol.find({}).sort({ _id: -1 }).toArray();
  const truckDocs = await truckCol.find({}).sort({ _id: -1 }).toArray();

  const combinedMap = new Map();

  // 1. Add owner details FIRST so owner details is the primary source of truth
  for (const doc of ownerDocs) {
    const rawTruck = doc["Truck No"] || doc["Truck No "] || doc.truck_no || doc.vehicleNo || doc["Vehicle No"];
    const key = rawTruck ? normVeh(rawTruck) : doc._id.toString();
    combinedMap.set(key, doc);
  }

  // 2. Add Truck Contact Number ONLY if truck is not in owner details
  for (const doc of truckDocs) {
    const rawTruck = doc.truck_no || doc["Truck No "] || doc["Truck No"] || doc.vehicleNo || doc["Vehicle No"];
    const key = rawTruck ? normVeh(rawTruck) : doc._id.toString();
    if (!combinedMap.has(key)) {
      combinedMap.set(key, doc);
    }
  }

  return Array.from(combinedMap.values());
}

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

const { normalizeDate, parseBasicFreightCommission, parseIncentiveCommission, isAtoaRelationship, isMktRelationship, normalizeWheelType, is6Wheel, is10or12or14Wheel, getEffectivePartyMaster, applyEffectiveEdit } = require("../utils/partyMasterHelper");
const { countQualifyingCompletedTrips, evaluateMktCommission, checkAndUpdateMkt6WheelCommissions } = require("../utils/mktCommissionManager");

// POST /truck-contacts/upload-document — Upload a document to S3
router.post("/upload-document", truckContactUpload.single("document"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }
    res.json({ success: true, url: req.file.location });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /truck-contacts/approvals — Fetch approval requests (Head Office only)
router.get("/approvals", async (req, res) => {
  try {
    const col = getApprovalCollection();
    const statusFilter = req.query.status || "pending";
    const filter = statusFilter === 'all' ? {} : { status: statusFilter };
    const requests = await col.find(filter).sort({ processedAt: -1, requestedAt: -1, createdAt: -1 }).toArray();
    res.json({ success: true, requests });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /truck-contacts/mkt-trips/:truckNo — Get completed trip count and recommended MKT commissions
router.get("/mkt-trips/:truckNo", async (req, res) => {
  try {
    const { truckNo } = req.params;
    const { month, year, date } = req.query;
    const tripCount = await countQualifyingCompletedTrips(truckNo, month, year, date);
    const meetsThreshold = tripCount >= 6;
    res.json({
      success: true,
      truckNo,
      tripCount,
      meetsThreshold,
      recommendedBasicComm: meetsThreshold ? 0.07 : 0.05,
      recommendedIncentiveComm: 0.07
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /truck-contacts/request — Submit a new profile or edit for approval (Site/SAS)
router.post("/request", async (req, res) => {
  try {
    const col = getApprovalCollection();
    const normRegDate = normalizeDate(req.body.registration_date || req.body.registrationDate || req.body.effective_date || req.body.effectiveDate) || normalizeDate(new Date());
    const reqType = req.body.requestType || (req.body.existingContactId ? "Edit Profile" : (req.body["Truck No "] || req.body["Truck No"] || req.body.truck_no ? "New Registration" : "Temp Driver Update"));

    const isAtoa = isAtoaRelationship(req.body);
    const isMkt = isMktRelationship(req.body);
    const wheel = normalizeWheelType(req.body.wheelType || req.body["Wheel Type "] || req.body.wheel_type || req.body["Type of vehicle"]);
    let parsedComm = parseBasicFreightCommission(req.body);
    let parsedIncentive = parseIncentiveCommission(req.body);
    if (isAtoa) {
      if (parsedComm === null || parsedComm === undefined) parsedComm = 0.05;
      if (parsedIncentive === null || parsedIncentive === undefined) parsedIncentive = 0.00;
    } else if (isMkt) {
      if (is10or12or14Wheel(wheel)) {
        if (parsedComm === null || parsedComm === undefined) parsedComm = 0.05;
        if (parsedIncentive === null || parsedIncentive === undefined) parsedIncentive = 0.05;
      } else if (is6Wheel(wheel)) {
        if (parsedIncentive === null || parsedIncentive === undefined) parsedIncentive = 0.07;
        if (parsedComm === null || parsedComm === undefined) {
          const tNo = req.body["Truck No "] || req.body["Truck No"] || req.body.truck_no || req.body.truckNo;
          const tripCount = await countQualifyingCompletedTrips(tNo, null, null, normRegDate);
          parsedComm = tripCount >= 6 ? 0.07 : 0.05;
        }
      }
    }

    const commPayload = {};
    if (parsedComm !== null && parsedComm !== undefined) {
      commPayload.basic_freight_commission = parsedComm;
      commPayload.basicFreightCommission = parsedComm;
      commPayload["BASIC FREIGHT COMMISSION"] = parsedComm;
      commPayload["Basic Freight Commission"] = parsedComm;
      commPayload["Basic Freight Commission "] = parsedComm;
      commPayload["Basic Freight Comission Applicability "] = parsedComm;
      commPayload["Basic Freight Comission Applicability"] = parsedComm;
      commPayload["Basic Freight Commission Applicability "] = parsedComm;
      commPayload["Basic Freight Commission Applicability"] = parsedComm;
      commPayload["Basic Freight Comission Appliciability"] = parsedComm;
      commPayload["Basic Freight Comission Appliciability "] = parsedComm;
      commPayload["basic_freight_commission_applicability"] = parsedComm;
    }
    if (parsedIncentive !== null && parsedIncentive !== undefined) {
      commPayload.incentive_commission = parsedIncentive;
      commPayload.incentiveCommission = parsedIncentive;
      commPayload["INCENTIVE COMMISSION"] = parsedIncentive;
      commPayload["Incentive Commission"] = parsedIncentive;
      commPayload["Incentive Commission "] = parsedIncentive;
      commPayload["Incentive Comission Applicability "] = parsedIncentive;
      commPayload["Incentive Comission Applicability"] = parsedIncentive;
      commPayload["Incentive Commission Applicability "] = parsedIncentive;
      commPayload["Incentive Commission Applicability"] = parsedIncentive;
      commPayload["Incentive Comission Appliciability"] = parsedIncentive;
      commPayload["Incentive Comission Appliciability "] = parsedIncentive;
      commPayload["incentive_commission_applicability"] = parsedIncentive;
    }

    const request = {
      ...req.body,
      ...commPayload,
      registration_date: normRegDate,
      effective_date: normRegDate,
      effectiveDate: normRegDate,
      status: "pending",
      requestedAt: new Date(),
      requestType: reqType
    };
    const result = await col.insertOne(request);
    safeEmit("truckContactApprovalsUpdates", { action: "create", id: result.insertedId });
    res.status(201).json({ success: true, requestId: result.insertedId });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// PUT /truck-contacts/approvals/:id — Approve or Reject a request
router.put("/approvals/:id", async (req, res) => {
  const { id } = req.params;
  const { status, actionBy } = req.body; // 'approved' or 'rejected'

  try {
    const approvalCol = getApprovalCollection();
    const mainCol = getCollection();
    const ownerCol = getOwnerDetailsCollection();

    const request = await approvalCol.findOne({ _id: new ObjectId(id) });
    if (!request) return res.status(404).json({ success: false, error: "Request not found" });

    if (status === "approved") {
      // 1. Prepare data for main collection (remove approval-specific fields)
      const { _id, status: s, requestedAt, actionBy: ab, ...mainData } = request;

      // 2. Check if it's an update or new registration
      const truckNo = mainData["Truck No "] || mainData["Truck No"] || mainData.truck_no || mainData.vehicleNo;
      const targetContactId = request.existingContactId || mainData.existingContactId;

      if (truckNo || targetContactId) {
        const normRegDate = normalizeDate(mainData.registration_date || mainData.effective_date || mainData.effectiveDate) || normalizeDate(new Date());
        mainData.registration_date = normRegDate;
        mainData.effective_date = normRegDate;
        mainData.effectiveDate = normRegDate;

        let existingDoc = null;
        if (targetContactId && ObjectId.isValid(targetContactId)) {
          existingDoc = await ownerCol.findOne({ _id: new ObjectId(targetContactId) });
          if (!existingDoc) existingDoc = await mainCol.findOne({ _id: new ObjectId(targetContactId) });
        }

        if (!existingDoc && truckNo) {
          const vKey = normVeh(truckNo);
          const allOwner = await ownerCol.find({}).toArray();
          existingDoc = allOwner.find(d => normVeh(d["Truck No"] || d["Truck No "] || d.truck_no || d.vehicleNo) === vKey);
          if (!existingDoc) {
            const allTruck = await mainCol.find({}).toArray();
            existingDoc = allTruck.find(d => normVeh(d["Truck No"] || d["Truck No "] || d.truck_no || d.vehicleNo) === vKey);
          }
        }

        let finalDocToSave;
        if (existingDoc) {
          finalDocToSave = applyEffectiveEdit(existingDoc, mainData, normRegDate, actionBy || "Approver");
        } else {
          const isAtoa = isAtoaRelationship(mainData);
          const isMkt = isMktRelationship(mainData);
          const wheel = normalizeWheelType(mainData.wheelType || mainData["Wheel Type "] || mainData.wheel_type || mainData["Type of vehicle"]);
          let parsedComm = parseBasicFreightCommission(mainData);
          let parsedIncentive = parseIncentiveCommission(mainData);
          if (isAtoa) {
            if (parsedComm === null || parsedComm === undefined) parsedComm = 0.05;
            if (parsedIncentive === null || parsedIncentive === undefined) parsedIncentive = 0.00;
          } else if (isMkt) {
            if (is10or12or14Wheel(wheel)) {
              if (parsedComm === null || parsedComm === undefined) parsedComm = 0.05;
              if (parsedIncentive === null || parsedIncentive === undefined) parsedIncentive = 0.05;
            } else if (is6Wheel(wheel)) {
              if (parsedIncentive === null || parsedIncentive === undefined) parsedIncentive = 0.07;
              if (parsedComm === null || parsedComm === undefined) {
                const tripCount = await countQualifyingCompletedTrips(truckNo, null, null, normRegDate);
                parsedComm = tripCount >= 6 ? 0.07 : 0.05;
              }
            }
          }
          if (parsedComm !== null && parsedComm !== undefined) {
            mainData.basic_freight_commission = parsedComm;
            mainData.basicFreightCommission = parsedComm;
            mainData["BASIC FREIGHT COMMISSION"] = parsedComm;
            mainData["Basic Freight Commission"] = parsedComm;
            mainData["Basic Freight Commission "] = parsedComm;
            mainData["Basic Freight Comission Applicability "] = parsedComm;
            mainData["Basic Freight Comission Applicability"] = parsedComm;
            mainData["Basic Freight Commission Applicability "] = parsedComm;
            mainData["Basic Freight Commission Applicability"] = parsedComm;
            mainData["Basic Freight Comission Appliciability"] = parsedComm;
            mainData["Basic Freight Comission Appliciability "] = parsedComm;
            mainData["basic_freight_commission_applicability"] = parsedComm;
          }
          if (parsedIncentive !== null && parsedIncentive !== undefined) {
            mainData.incentive_commission = parsedIncentive;
            mainData.incentiveCommission = parsedIncentive;
            mainData["INCENTIVE COMMISSION"] = parsedIncentive;
            mainData["Incentive Commission"] = parsedIncentive;
            mainData["Incentive Commission "] = parsedIncentive;
            mainData["Incentive Comission Applicability "] = parsedIncentive;
            mainData["Incentive Comission Applicability"] = parsedIncentive;
            mainData["Incentive Commission Applicability "] = parsedIncentive;
            mainData["Incentive Commission Applicability"] = parsedIncentive;
            mainData["Incentive Comission Appliciability"] = parsedIncentive;
            mainData["Incentive Comission Appliciability "] = parsedIncentive;
            mainData["incentive_commission_applicability"] = parsedIncentive;
          }
          finalDocToSave = {
            ...mainData,
            history: [
              {
                effectiveDate: normRegDate,
                changedFields: { note: "Initial Registration via Approval" },
                previousValues: {},
                snapshot: { ...mainData },
                changeSummary: "Initial Registration (Approved)",
                changedBy: actionBy || "Approver",
                changedAt: new Date().toISOString()
              }
            ]
          };
        }

        const { _id: dropId, ...savePayload } = finalDocToSave;

        // Upsert in main Truck Contact Number collection
        let mainMatch = null;
        if (existingDoc && existingDoc._id) {
          mainMatch = await mainCol.findOne({ _id: existingDoc._id });
        }
        if (!mainMatch && truckNo) {
          const vKey = normVeh(truckNo);
          const allTruck = await mainCol.find({}).toArray();
          mainMatch = allTruck.find(d => normVeh(d["Truck No"] || d["Truck No "] || d.truck_no || d.vehicleNo) === vKey);
        }

        if (mainMatch && mainMatch._id) {
          await mainCol.replaceOne({ _id: mainMatch._id }, savePayload);
        } else {
          await mainCol.insertOne({ ...savePayload });
        }

        // Upsert in owner details collection
        let ownerMatch = null;
        if (existingDoc && existingDoc._id) {
          ownerMatch = await ownerCol.findOne({ _id: existingDoc._id });
        }
        if (!ownerMatch && truckNo) {
          const vKey = normVeh(truckNo);
          const allOwner = await ownerCol.find({}).toArray();
          ownerMatch = allOwner.find(d => normVeh(d["Truck No"] || d["Truck No "] || d.truck_no || d.vehicleNo) === vKey);
        }

        if (ownerMatch && ownerMatch._id) {
          await ownerCol.replaceOne({ _id: ownerMatch._id }, savePayload);
        } else {
          await ownerCol.insertOne({ ...savePayload });
        }
      } else {
        return res.status(400).json({ success: false, error: "Invalid truck data for approval" });
      }

      await approvalCol.updateOne({ _id: new ObjectId(id) }, { $set: { status: "approved", processedAt: new Date(), processedBy: actionBy } });
      safeEmit("truckContactUpdates", { action: "approve", id });
      safeEmit("cementUpdates");
      if (truckNo) {
        hookCheckIncentiveEligibility({ vehicleNumber: truckNo }).catch(e => console.warn('[incentiveEligibility] Error:', e.message));
      }
    } else {
      await approvalCol.updateOne({ _id: new ObjectId(id) }, { $set: { status: "rejected", processedAt: new Date(), processedBy: actionBy } });
      safeEmit("truckContactUpdates", { action: "reject", id });
    }

    res.json({ success: true, message: `Request ${status} successfully.` });
  } catch (error) {
    console.error("Error in /truck-contacts/approvals/:id:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// LEGACY / MASTER ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

// Helper to parse dates in Indian (DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY) or ISO formats
function parseDateString(val) {
  if (!val || val === "-" || val === "null" || val === "undefined") return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  const str = String(val).trim();
  
  let m = str.match(/^(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{4})$/);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    const y = parseInt(m[3], 10);
    return new Date(y, mo, d);
  }
  
  m = str.match(/^(\d{4})[\.\/\-](\d{1,2})[\.\/\-](\d{1,2})$/);
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    const d = parseInt(m[3], 10);
    return new Date(y, mo, d);
  }

  const dObj = new Date(str);
  if (!isNaN(dObj.getTime())) return dObj;
  return null;
}

// GET /truck-contacts/validity-alerts — Live validity alerts for Daily Report Summary
router.get("/validity-alerts", async (req, res) => {
  try {
    const contacts = await fetchAllContacts();

    const validityFields = [
      { key: "RC Validity", altKeys: ["rc_validity", "RC VALIDITY"], label: "RC" },
      { key: "Insurance Validity", altKeys: ["insurance_validity", "INSURANCE VALIDITY"], label: "Insurance" },
      { key: "Fitness Validity", altKeys: ["fitness_validity", "FITNESS VALIDITY"], label: "Fitness" },
      { key: "Road Tax Validity", altKeys: ["road_tax_validity", "ROAD TAX VALIDITY"], label: "Road Tax" },
      { key: "Permit", altKeys: ["permit", "PERMIT", "permit_validity"], label: "Permit" },
      { key: "PUC", altKeys: ["puc", "PUC", "puc_validity"], label: "PUC" },
      { key: "NP Validity", altKeys: ["np_validity", "NP VALIDITY"], label: "NP" },
      { key: "License Validity", altKeys: ["license_validity", "LICENSE VALIDITY"], label: "License" },
      { key: "Driver Authoraization validity", altKeys: ["driver_authorization_validity", "DRIVER AUTHORIZATION VALIDITY", "Driver Authorise Validity", "driver_authorise_validity"], label: "Driver Authorise" }
    ];

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const windowEndMs = todayStart + sevenDaysMs;

    // Current Financial Year (Starts Apr 1)
    const currentFyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const fyStartMs = new Date(currentFyStartYear, 3, 1).getTime(); // April 1 of current FY

    const alerts = [];

    contacts.forEach(c => {
      const truckNo = String(c["Truck No"] || c["Truck No "] || c.truck_no || "-").trim();
      const ownerName = String(c["Owner Name"] || c["Owner Name "] || c.owner_name || "-").trim();
      const driverName = String(c["Driver Name"] || c["Driver Name "] || c.driver_name || "-").trim();
      const contactNo = String(c["Contact No."] || c["Contact No. "] || c.contact_no || c["DRIVER CONTACT"] || "-").trim();
      const recordId = String(c._id || '');

      validityFields.forEach(f => {
        let valRaw = c[f.key];
        if (!valRaw) {
          for (const alt of f.altKeys) {
            if (c[alt]) { valRaw = c[alt]; break; }
          }
        }

        const expiryDate = parseDateString(valRaw);
        if (!expiryDate) return;

        const expTime = new Date(expiryDate.getFullYear(), expiryDate.getMonth(), expiryDate.getDate()).getTime();
        const diffMs = expTime - todayStart;
        const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));

        // Filter: ONLY INCLUDE VALIDITIES EXPIRING BETWEEN TODAY AND TODAY + 7 DAYS
        // EXPIRY DATE >= TODAY AND EXPIRY DATE <= TODAY + 7 DAYS
        if (expTime >= todayStart && expTime <= windowEndMs) {
          const status = "EXPIRING_SOON";
          const statusLabel = diffDays === 0 ? "0 days remaining (Expires Today)" : `${diffDays} day${diffDays === 1 ? "" : "s"} remaining`;

          const dd = String(expiryDate.getDate()).padStart(2, "0");
          const mm = String(expiryDate.getMonth() + 1).padStart(2, "0");
          const yyyy = expiryDate.getFullYear();
          const expiryDateFormatted = `${dd}-${mm}-${yyyy}`;

          alerts.push({
            id: `${recordId}_${f.label}`,
            recordId,
            truckNo,
            ownerName,
            driverName,
            contactNo,
            validityType: f.label,
            fieldKey: f.key,
            expiryDateRaw: valRaw,
            expiryDateFormatted,
            diffDays,
            status,
            statusLabel,
            actionRequired: "EXTEND"
          });
        }
      });
    });

    // Sort: EXPIRED first (most overdue first), then EXPIRING SOON (closest to expiry first)
    alerts.sort((a, b) => a.diffDays - b.diffDays);

    const expiredCount = alerts.filter(a => a.status === "EXPIRED").length;
    const expiringSoonCount = alerts.filter(a => a.status === "EXPIRING_SOON").length;

    res.json({
      success: true,
      currentFinancialYear: `${currentFyStartYear}-${currentFyStartYear + 1}`,
      count: alerts.length,
      expiredCount,
      expiringSoonCount,
      alerts
    });
  } catch (error) {
    console.error("[ValidityAlerts] Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /truck-contacts/search/:truckNo - Fetch by truck number
router.get("/search/:truckNo", async (req, res) => {
  try {
    const contacts = await fetchAllContacts();
    const truckNo = req.params.truckNo.trim().toUpperCase();
    const recordDate = req.query.date || req.query.recordDate || null;
    const contact = contacts.find(c => {
      const tNo = (c["Truck No"] || c["Truck No "] || c.truck_no || "").trim().toUpperCase();
      return tNo === truckNo;
    });
    
    if (contact) {
      const effectiveData = recordDate ? getEffectivePartyMaster(contact, recordDate) : contact;
      res.json({ success: true, contact: effectiveData });
    } else {
      res.json({ success: false, message: 'Truck not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const contacts = await fetchAllContacts();
    res.json({ success: true, contacts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /truck-contacts/:id/history — Fetch change history for a contact
router.get("/:id/history", async (req, res) => {
  try {
    const col = getCollection();
    const ownerCol = getOwnerDetailsCollection();
    let targetId = req.params.id;

    let doc = null;
    if (ObjectId.isValid(targetId)) {
      doc = await ownerCol.findOne({ _id: new ObjectId(targetId) });
      if (!doc) doc = await col.findOne({ _id: new ObjectId(targetId) });
    }

    if (!doc) {
      doc = await ownerCol.findOne({ $or: [{ "Truck No": targetId }, { "Truck No ": targetId }, { truck_no: targetId }] });
      if (!doc) doc = await col.findOne({ $or: [{ "Truck No": targetId }, { "Truck No ": targetId }, { truck_no: targetId }] });
    }

    if (!doc) return res.status(404).json({ success: false, error: "Contact not found." });

    const history = doc.history || [];
    res.json({ success: true, truckNo: doc["Truck No"] || doc["Truck No "] || doc.truck_no, history });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /truck-contacts — Create a new contact
router.post("/", async (req, res) => {
  try {
    const col = getCollection();
    const ownerCol = getOwnerDetailsCollection();
    const truckNo = req.body["Truck No "] || req.body["Truck No"] || req.body.truck_no;
    
    // Prevent duplicates
    if (truckNo) {
      const existing = await col.findOne({ $or: [{ "Truck No ": truckNo }, { "Truck No": truckNo }, { truck_no: truckNo }] });
      if (existing) {
        return res.status(400).json({ success: false, error: "A truck with this number already exists. Please update the existing record instead." });
      }
    }

    const normRegDate = normalizeDate(req.body.registration_date || req.body.registrationDate || req.body.effective_date || req.body.effectiveDate) || normalizeDate(new Date());
    const isAtoa = isAtoaRelationship(req.body);
    const isMkt = isMktRelationship(req.body);
    const wheel = normalizeWheelType(req.body.wheelType || req.body["Wheel Type "] || req.body.wheel_type || req.body["Type of vehicle"]);
    let parsedComm = parseBasicFreightCommission(req.body);
    let parsedIncentive = parseIncentiveCommission(req.body);
    if (isAtoa) {
      if (parsedComm === null || parsedComm === undefined) parsedComm = 0.05;
      if (parsedIncentive === null || parsedIncentive === undefined) parsedIncentive = 0.00;
    } else if (isMkt) {
      if (is10or12or14Wheel(wheel)) {
        if (parsedComm === null || parsedComm === undefined) parsedComm = 0.05;
        if (parsedIncentive === null || parsedIncentive === undefined) parsedIncentive = 0.05;
      } else if (is6Wheel(wheel)) {
        if (parsedIncentive === null || parsedIncentive === undefined) parsedIncentive = 0.07;
        if (parsedComm === null || parsedComm === undefined) {
          const tNo = req.body["Truck No "] || req.body["Truck No"] || req.body.truck_no || req.body.truckNo;
          const tripCount = await countQualifyingCompletedTrips(tNo, null, null, normRegDate);
          parsedComm = tripCount >= 6 ? 0.07 : 0.05;
        }
      }
    }
    const commPayload = {};
    if (parsedComm !== null && parsedComm !== undefined) {
      commPayload.basic_freight_commission = parsedComm;
      commPayload.basicFreightCommission = parsedComm;
      commPayload["BASIC FREIGHT COMMISSION"] = parsedComm;
      commPayload["Basic Freight Commission"] = parsedComm;
      commPayload["Basic Freight Commission "] = parsedComm;
      commPayload["Basic Freight Comission Applicability "] = parsedComm;
      commPayload["Basic Freight Comission Applicability"] = parsedComm;
      commPayload["Basic Freight Commission Applicability "] = parsedComm;
      commPayload["Basic Freight Commission Applicability"] = parsedComm;
      commPayload["Basic Freight Comission Appliciability"] = parsedComm;
      commPayload["Basic Freight Comission Appliciability "] = parsedComm;
      commPayload["basic_freight_commission_applicability"] = parsedComm;
    }
    if (parsedIncentive !== null && parsedIncentive !== undefined) {
      commPayload.incentive_commission = parsedIncentive;
      commPayload.incentiveCommission = parsedIncentive;
      commPayload["INCENTIVE COMMISSION"] = parsedIncentive;
      commPayload["Incentive Commission"] = parsedIncentive;
      commPayload["Incentive Commission "] = parsedIncentive;
      commPayload["Incentive Comission Applicability "] = parsedIncentive;
      commPayload["Incentive Comission Applicability"] = parsedIncentive;
      commPayload["Incentive Commission Applicability "] = parsedIncentive;
      commPayload["Incentive Commission Applicability"] = parsedIncentive;
      commPayload["Incentive Comission Appliciability"] = parsedIncentive;
      commPayload["Incentive Comission Appliciability "] = parsedIncentive;
      commPayload["incentive_commission_applicability"] = parsedIncentive;
    }

    const mergedBody = { ...req.body, ...commPayload };
    const bodyData = {
      ...mergedBody,
      registration_date: normRegDate,
      effective_date: normRegDate,
      effectiveDate: normRegDate,
      history: req.body.history && req.body.history.length > 0 ? req.body.history : [
        {
          effectiveDate: normRegDate,
          changedFields: { note: "Initial Registration" },
          previousValues: {},
          snapshot: { ...mergedBody, registration_date: normRegDate, effective_date: normRegDate, effectiveDate: normRegDate },
          changeSummary: "Initial Registration Profile",
          changedBy: req.body.changedBy || req.body.actionBy || "User",
          changedAt: new Date().toISOString()
        }
      ]
    };

    const result = await col.insertOne(bodyData);
    await ownerCol.insertOne({ ...bodyData }).catch(() => {});
    safeEmit("truckContactUpdates", { action: "create", id: result.insertedId });
    safeEmit("cementUpdates");
    const createdVeh = bodyData["Truck No"] || bodyData["Truck No "] || bodyData.truck_no || bodyData.vehicleNo;
    if (createdVeh) {
      hookCheckIncentiveEligibility({ vehicleNumber: createdVeh }).catch(e => console.warn('[incentiveEligibility] Error:', e.message));
    }
    res.status(201).json({ success: true, contact: { _id: result.insertedId, ...bodyData } });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// PUT /truck-contacts/:id — Update an existing contact with effective date
router.put("/:id", async (req, res) => {
  try {
    const col = getCollection();
    const ownerCol = getOwnerDetailsCollection();

    let targetId = req.params.id;
    let query = ObjectId.isValid(targetId) ? { _id: new ObjectId(targetId) } : { $or: [{ "Truck No": targetId }, { "Truck No ": targetId }, { truck_no: targetId }] };

    let doc = await ownerCol.findOne(query);
    if (!doc) {
      doc = await col.findOne(query);
    }
    if (!doc && targetId) {
      const vKey = normVeh(targetId);
      const allOwner = await ownerCol.find({}).toArray();
      doc = allOwner.find(d => normVeh(d["Truck No"] || d["Truck No "] || d.truck_no || d.vehicleNo) === vKey);
      if (!doc) {
        const allTruck = await mainCol.find({}).toArray();
        doc = allTruck.find(d => normVeh(d["Truck No"] || d["Truck No "] || d.truck_no || d.vehicleNo) === vKey);
      }
    }

    if (doc) {
      const truckNo = doc["Truck No"] || doc["Truck No "] || doc.truck_no || req.body["Truck No "] || req.body["Truck No"] || req.body.truck_no;
      const effectiveDateStr = req.body.effectiveDate || req.body.effective_date || req.body.registration_date || new Date();
      const changedBy = req.body.changedBy || req.body.actionBy || "User";

      if (isMktRelationship(req.body) && is6Wheel(req.body.wheelType || doc.wheelType || doc["Wheel Type "])) {
        if (req.body.tripCount === undefined && req.body.completedTrips === undefined) {
          req.body.tripCount = await countQualifyingCompletedTrips(truckNo, null, null, effectiveDateStr);
        }
      }

      // Apply date-versioned edit into history
      const updatedDoc = applyEffectiveEdit(doc, req.body, effectiveDateStr, changedBy);
      const { _id: dropId, ...savePayload } = updatedDoc;

      // Upsert in main Truck Contact Number collection
      let mainMatch = doc._id ? await col.findOne({ _id: doc._id }) : null;
      if (!mainMatch && truckNo) {
        const vKey = normVeh(truckNo);
        const allTruck = await col.find({}).toArray();
        mainMatch = allTruck.find(d => normVeh(d["Truck No"] || d["Truck No "] || d.truck_no || d.vehicleNo) === vKey);
      }
      if (mainMatch && mainMatch._id) {
        await col.replaceOne({ _id: mainMatch._id }, savePayload);
      } else {
        await col.insertOne({ ...savePayload });
      }

      // Upsert in owner details collection
      let ownerMatch = doc._id ? await ownerCol.findOne({ _id: doc._id }) : null;
      if (!ownerMatch && truckNo) {
        const vKey = normVeh(truckNo);
        const allOwner = await ownerCol.find({}).toArray();
        ownerMatch = allOwner.find(d => normVeh(d["Truck No"] || d["Truck No "] || d.truck_no || d.vehicleNo) === vKey);
      }
      if (ownerMatch && ownerMatch._id) {
        await ownerCol.replaceOne({ _id: ownerMatch._id }, savePayload);
      } else {
        await ownerCol.insertOne({ ...savePayload });
      }

      safeEmit("truckContactUpdates", { action: "update", id: doc._id });
      safeEmit("cementUpdates");
      if (truckNo) {
        hookCheckIncentiveEligibility({ vehicleNumber: truckNo }).catch(e => console.warn('[incentiveEligibility] Error:', e.message));
      }

      return res.json({ success: true, contact: { _id: doc._id, ...savePayload } });
    }

    return res.status(404).json({ success: false, error: "Contact not found." });
  } catch (error) {
    console.error("Error in PUT /truck-contacts/:id:", error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /truck-contacts/upload-temp — Upload temporary driver license PDF
const cementAttachUpload = require("../middleware/cementAttachUpload");
router.post("/upload-temp", cementAttachUpload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: "No file uploaded" });
    res.json({ success: true, url: req.file.location });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /truck-contacts/approve/:id — Approve a temporary driver
router.put("/approve/:id", async (req, res) => {
  try {
    const col = getCollection();
    const ownerCol = getOwnerDetailsCollection();
    await col.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { is_approved: true, approved_at: new Date() } }
    );
    await ownerCol.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { is_approved: true, approved_at: new Date() } }
    ).catch(() => {});
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /truck-contacts/:id — Delete a contact
router.delete("/:id", async (req, res) => {
  try {
    const col = getCollection();
    const ownerCol = getOwnerDetailsCollection();
    const id = req.params.id;

    let doc = await col.findOne({ _id: new ObjectId(id) });
    if (!doc) doc = await ownerCol.findOne({ _id: new ObjectId(id) });

    if (doc) {
      const truckNo = doc["Truck No"] || doc["Truck No "] || doc.truck_no;
      if (truckNo) {
        await col.deleteMany({ $or: [{ "Truck No": truckNo }, { "Truck No ": truckNo }, { truck_no: truckNo }] });
        await ownerCol.deleteMany({ $or: [{ "Truck No": truckNo }, { "Truck No ": truckNo }, { truck_no: truckNo }] });
      } else {
        await col.deleteOne({ _id: new ObjectId(id) });
        await ownerCol.deleteOne({ _id: new ObjectId(id) });
      }
      return res.json({ success: true, message: "Contact deleted successfully." });
    }

    return res.status(404).json({ success: false, error: "Contact not found." });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
