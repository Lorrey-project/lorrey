const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { ObjectId } = require("mongodb");
const truckContactUpload = require("../middleware/truckContactUpload");

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

// Helper to fetch contacts with owner details collection as primary source of truth
async function fetchAllContacts() {
  const ownerCol = getOwnerDetailsCollection();
  const truckCol = getCollection();

  const ownerDocs = await ownerCol.find({}).sort({ _id: -1 }).toArray();
  const truckDocs = await truckCol.find({}).sort({ _id: -1 }).toArray();

  const combinedMap = new Map();

  // 1. Add owner details FIRST so owner details is the primary source of truth
  for (const doc of ownerDocs) {
    const key = (doc["Truck No"] || doc["Truck No "] || doc.truck_no || doc._id.toString()).toString().trim().toUpperCase();
    combinedMap.set(key, doc);
  }

  // 2. Add Truck Contact Number ONLY if truck is not in owner details
  for (const doc of truckDocs) {
    const key = (doc.truck_no || doc["Truck No "] || doc["Truck No"] || doc._id.toString()).toString().trim().toUpperCase();
    if (!combinedMap.has(key)) {
      combinedMap.set(key, doc);
    }
  }

  return Array.from(combinedMap.values());
}

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

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

// GET /truck-contacts/approvals — Fetch pending requests (Head Office only)
router.get("/approvals", async (req, res) => {
  try {
    const col = getApprovalCollection();
    const requests = await col.find({ status: "pending" }).sort({ createdAt: -1 }).toArray();
    res.json({ success: true, requests });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /truck-contacts/request — Submit a new profile for approval (Site/SAS)
router.post("/request", async (req, res) => {
  try {
    const col = getApprovalCollection();
    const request = {
      ...req.body,
      status: "pending",
      requestedAt: new Date(),
      requestType: req.body["Truck No "] || req.body["Truck No"] ? "New Registration" : "Temp Driver Update"
    };
    const result = await col.insertOne(request);
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
      const truckNo = mainData["Truck No "] || mainData["Truck No"] || mainData.truck_no;
      if (truckNo) {
        // New Registration: UPSERT in both collections
        await mainCol.updateOne(
          { $or: [{ "Truck No ": truckNo }, { "Truck No": truckNo }, { truck_no: truckNo }] },
          { $set: mainData },
          { upsert: true }
        );
        await ownerCol.updateOne(
          { $or: [{ "Truck No": truckNo }, { "Truck No ": truckNo }, { truck_no: truckNo }] },
          { $set: mainData },
          { upsert: true }
        );
      } else {
        return res.status(400).json({ success: false, error: "Invalid truck data for approval" });
      }

      await approvalCol.updateOne({ _id: new ObjectId(id) }, { $set: { status: "approved", processedAt: new Date(), processedBy: actionBy } });
    } else {
      await approvalCol.updateOne({ _id: new ObjectId(id) }, { $set: { status: "rejected", processedAt: new Date(), processedBy: actionBy } });
    }

    res.json({ success: true, message: `Request ${status} successfully.` });
  } catch (error) {
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
    const contact = contacts.find(c => {
      const tNo = (c["Truck No"] || c["Truck No "] || c.truck_no || "").trim().toUpperCase();
      return tNo === truckNo;
    });
    
    if (contact) {
      res.json({ success: true, contact });
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

    const result = await col.insertOne(req.body);
    await ownerCol.insertOne({ ...req.body }).catch(() => {});
    res.status(201).json({ success: true, contact: { _id: result.insertedId, ...req.body } });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// PUT /truck-contacts/:id — Update an existing contact
router.put("/:id", async (req, res) => {
  try {
    const col = getCollection();
    const ownerCol = getOwnerDetailsCollection();

    let targetId = req.params.id;
    let query = { _id: new ObjectId(targetId) };

    let doc = await col.findOne(query);
    if (!doc) {
      doc = await ownerCol.findOne(query);
    }

    if (doc) {
      const truckNo = doc["Truck No"] || doc["Truck No "] || doc.truck_no;
      if (truckNo) {
        await col.updateOne({ $or: [{ "Truck No": truckNo }, { "Truck No ": truckNo }, { truck_no: truckNo }] }, { $set: req.body });
        await ownerCol.updateOne({ $or: [{ "Truck No": truckNo }, { "Truck No ": truckNo }, { truck_no: truckNo }] }, { $set: req.body });
      } else {
        await col.updateOne(query, { $set: req.body });
        await ownerCol.updateOne(query, { $set: req.body });
      }
      return res.json({ success: true, contact: { ...doc, ...req.body } });
    }

    return res.status(404).json({ success: false, error: "Contact not found." });
  } catch (error) {
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
