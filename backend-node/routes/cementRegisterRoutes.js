const express = require("express");
const { getIO } = require("../socket");
const router = express.Router();
const { pushToInvoice } = require("../utils/syncManager");
const mongoose = require("mongoose");
const { ObjectId } = require("mongodb");
const auth = require("../middleware/authMiddleware");
const adminOnly = require("../middleware/adminOnly");
const { cementValidationRules, validateCement } = require("../middleware/validateCement");
const cementAttachUpload = require("../middleware/cementAttachUpload");

// ─────────────────────────────────────────────────────────────────────────────
// Database  : cement_register  (separate DB on the same Atlas cluster)
// Collection: entries
//
// We bypass Mongoose entirely and use the raw MongoDB native driver so that
// field names like "BILLING @ 95% (PARTY PAYABLE)", "% OF ADV", "HSD (LTR)"
// etc. are stored and retrieved exactly as-is — no transformation.
//
// Schema reference (all fields from the cement register Excel/import):
//   SL NO, LOADING DATE, RECEIVING DATE, BILL NO, BILL DATE, BY PORTAL,
//   SITE, VEHICLE NUMBER, UNLOADING DATE, E-WAY BILL NO, DN,
//   E-WAY BILL VALIDITY, GCN NO, INVOICE NO, SHIPMENT NO, CHALLAN STATUS,
//   WHEEL, BILL TYPE, DESTINATION, PARTY NAME, UNLOADING STATUS NOTE,
//   BILLING RATE, MT, PARTY RATE, BILLING AMOUNT,
//   BILLING @ 95% (PARTY PAYABLE), AMOUNT, PROFIT, TDS@1%, ADVANCE,
//   SITE CASH, BANK TF, OTHERS DEDUCTION, GPS MONITORING CHARGE, GPS DEVICE,
//   PUMP NAME, HSD SLIP NO, HSD BILL NO, KM AS PER RATE CHART (UP+DOWN),
//   FUEL REQUIRED, HSD (LTR), BALANCE, EXTRA ALLOWED, ACTUAL EXTRA,
//   HSD RATE, HSD AMOUNT, % OF ADV, TRAVELLING EXP, SHORTAGE (BAG),
//   SHORTAGE (RATE), SHORTAGE AMOUNT, NET AMOUNT, UP TOLL, DOWN TOLL,
//   EXTRA UNLOADING, DEDICATED, 10W EXTRA 8.5%, RAFTER, INCENTIVE TDS,
//   GROSS AMOUNT, OWNER NAME, DURATION, DETENTION, TRANSPORTING COST
// ─────────────────────────────────────────────────────────────────────────────

function getCollection() {
  return mongoose.connection.useDb("cement_register").collection("entries");
}

// ── GET /cement-register ─────────────────────────────────────────────────────
// Fetch all entries, newest first. Supports optional query params:
//   ?site=NVCL   → filter by SITE
//   ?owner=NAME  → filter by OWNER NAME
//   ?from=YYYY-MM-DD&to=YYYY-MM-DD → filter by LOADING DATE range
router.get("/", async (req, res) => {
  try {
    const col = getCollection();

    const filter = {};
    if (req.query.site) filter["SITE"] = req.query.site;
    if (req.query.owner) filter["OWNER NAME"] = req.query.owner;
    if (req.query.from || req.query.to) {
      filter["LOADING DATE"] = {};
      if (req.query.from) filter["LOADING DATE"]["$gte"] = new Date(req.query.from);
      if (req.query.to) filter["LOADING DATE"]["$lte"] = new Date(req.query.to);
    }

    const entries = await col.find(filter).sort({ "SL NO": 1 }).toArray();
    res.json({ success: true, count: entries.length, entries });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── GET /cement-register/lookup/:invoiceId ─────────────────────────────────────
router.get('/lookup/:invoiceId', async (req, res) => {
  try {
    const col = getCollection();
    const invoiceId = req.params.invoiceId;
    // Fetch invoice data from invoice_system DB
    const invoice = await mongoose.connection.useDb('invoice_system').collection('invoices').findOne({ _id: new ObjectId(invoiceId) });
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found' });
    // Fetch related data from other collections as needed
    const lorrySlip = await mongoose.connection.useDb('lorry_hire').collection('lorry_hire_slips').findOne({ invoice_id: invoice._id });
    const fuelSlip = await mongoose.connection.useDb('fuel_slip').collection('fuel_slips').findOne({ invoice_id: invoice._id });
    const driver = await mongoose.connection.useDb('truck_owner').collection('drivers').findOne({ driver_number: invoice.driver_number });
    const truck = await mongoose.connection.useDb('truck_owner').collection('trucks').findOne({ vehicle_number: invoice.vehicle_number });
    // Combine data
    const combined = { invoice, lorrySlip, fuelSlip, driver, truck };
    res.json({ success: true, data: combined });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Duplicate unfiltered GET route removed – filtered GET at line 40 handles fetching entries.

// ── POST /cement-register/resync-site-cash ────────────────────────────────────
// Re-runs pushToRegister for every cement register row that has an _invoiceId.
// Use this to backfill Site Cash / voucher data for rows where a voucher was
// created AFTER the invoice was approved.
router.post("/resync-site-cash", auth, async (req, res) => {
  try {
    const { pushToRegister } = require("../utils/syncManager");
    const col = getCollection();
    const rows = await col.find({ _invoiceId: { $exists: true, $ne: "" } }, { projection: { _invoiceId: 1 } }).toArray();

    let synced = 0;
    const errors = [];
    for (const row of rows) {
      try {
        await pushToRegister(row._invoiceId);
        synced++;
      } catch (e) {
        errors.push({ invoiceId: row._invoiceId, error: e.message });
      }
    }

    res.json({ success: true, total: rows.length, synced, errors });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const col = getCollection();
    const entry = await col.findOne({ _id: new ObjectId(req.params.id) });
    if (!entry) return res.status(404).json({ success: false, error: "Entry not found." });
    res.json({ success: true, entry });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── POST /cement-register ────────────────────────────────────────────────────
// Insert one entry. Body = a single entry object matching the schema above.
router.post("/", auth, cementValidationRules, validateCement, async (req, res) => {
  try {
    const col = getCollection();
    const result = await col.insertOne(req.body);
    res.status(201).json({ success: true, entry: { _id: result.insertedId, ...req.body } });
    const io = getIO();
    io.emit('cementUpdates', { action: 'create', entry: { _id: result.insertedId, ...req.body } });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ── POST /cement-register/bulk ───────────────────────────────────────────────
// Insert many entries at once. Body = { entries: [ ...array of objects... ] }
router.post("/bulk", auth, adminOnly, async (req, res) => {
  try {
    const col = getCollection();
    const docs = req.body.entries || req.body;
    if (!Array.isArray(docs) || docs.length === 0) {
      return res.status(400).json({ success: false, error: "Provide an array of entries." });
    }
    const result = await col.insertMany(docs, { ordered: false });
    res.status(201).json({ success: true, insertedCount: result.insertedCount });
    const io = getIO();
    io.emit('cementUpdates', { action: 'bulkCreate', count: result.insertedCount });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ── PUT /cement-register/bulk-update ─────────────────────────────────────────
// IMPORTANT: must be declared BEFORE /:id to avoid param conflicts
router.put("/bulk-update", auth, async (req, res) => {
  try {
    const col = getCollection();
    const { updates } = req.body;
    if (!updates || !Array.isArray(updates)) {
      return res.status(400).json({ success: false, error: "Invalid updates payload" });
    }
    const io = getIO();
    const bulkOps = updates.map(u => ({
      updateOne: {
        filter: { _id: new ObjectId(u.id) },
        update: { $set: u.changes }
      }
    }));
    if (bulkOps.length > 0) await col.bulkWrite(bulkOps);

    for (const u of updates) await pushToInvoice(u.id, u.changes);

    res.json({ success: true, updatedCount: updates.length });
    io.emit('cementUpdates', { action: 'bulkUpdate' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /cement-register/bulk-delete ──────────────────────────────────────
// IMPORTANT: declared BEFORE /:id to avoid param conflict
// Body: { ids: ["id1", "id2", ...] }
router.delete("/bulk-delete", auth, async (req, res) => {
  try {
    const col = getCollection();
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: "Provide an array of ids." });
    }
    const objectIds = ids.map(id => new ObjectId(id));
    const result = await col.deleteMany({ _id: { $in: objectIds } });

    // Re-sequence SL NOs to stay gapless after deletion
    const remaining = await col.find({}).sort({ "SL NO": 1, "_auto_updated_at": 1 }).toArray();
    const bulkOps = remaining.map((row, idx) => ({
      updateOne: { filter: { _id: row._id }, update: { $set: { "SL NO": idx + 1 } } }
    }));
    if (bulkOps.length > 0) await col.bulkWrite(bulkOps);

    const io = getIO();
    io.emit("cementUpdates", { action: "bulkDelete", ids });

    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


router.put("/:id", auth, cementValidationRules, validateCement, async (req, res) => {
  try {
    const col = getCollection();
    const result = await col.findOneAndUpdate(
      { _id: new ObjectId(req.params.id) },
      { $set: req.body },
      { returnDocument: "after" }
    );
    if (!result) return res.status(404).json({ success: false, error: "Entry not found." });
    await pushToInvoice(req.params.id, req.body);
    res.json({ success: true, entry: result });
    const io = getIO();
    io.emit('cementUpdates', { action: 'update', entry: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ── DELETE /cement-register/:id ──────────────────────────────────────────────
router.delete("/:id", auth, adminOnly, async (req, res) => {
  try {
    const col = getCollection();
    const result = await col.deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, error: "Entry not found." });
    }
    res.json({ success: true, message: "Entry deleted." });
    const io = getIO();
    io.emit('cementUpdates', { action: 'delete', id: req.params.id });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── POST /cement-register/attach/:rowId/:attachType ──────────────────────────
// Upload a PDF/image for challan_proof or site_cash for a specific row
// attachType: "challan_proof" | "site_cash"
// Returns: { success, url, field }
router.post("/attach/:rowId/:attachType", auth, (req, res, next) => {
  cementAttachUpload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: "No file uploaded." });
    const col = getCollection();
    const { rowId, attachType } = req.params;
    const url = req.file.location; // S3 public URL
    const field = attachType === "challan_proof" ? "CHALLAN_PROOF_URL" : "SITE_CASH_PROOF_URL";

    // Save URL into the row
    await col.updateOne(
      { _id: new ObjectId(rowId) },
      { $set: { [field]: url } }
    );

    const io = getIO();
    io.emit("cementUpdates", { action: "attach", rowId, field, url });

    res.json({ success: true, url, field });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
