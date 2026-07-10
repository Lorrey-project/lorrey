const express = require("express");
const { getIO } = require("../socket");
const router = express.Router();
const { pushToInvoice, getTruckDetails } = require("../utils/syncManager");
const mongoose = require("mongoose");
const { ObjectId } = require("mongodb");
const auth = require("../middleware/authMiddleware");
const adminOnly = require("../middleware/adminOnly");
const { cementValidationRules, validateCement } = require("../middleware/validateCement");
const cementAttachUpload = require("../middleware/cementAttachUpload");

const parseToDate = (dStr) => {
  if (!dStr) return new Date(0);
  const clean = String(dStr).trim();
  const parts = clean.split(/[-\/\.]/);
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    let year = parseInt(parts[2], 10);
    if (parts[2].length === 2) {
      year += (year >= 70 ? 1900 : 2000);
    }
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) return date;
  }
  let d = new Date(dStr);
  if (!isNaN(d.getTime())) return d;
  return new Date(0);
};


const formatDateToDDMMYY = (dStr) => {
  if (!dStr) return '';
  const clean = String(dStr).trim();
  if (/^\d{2}\.\d{2}\.\d{2}$/.test(clean)) return clean;
  
  const date = parseToDate(clean);
  if (isNaN(date.getTime()) || date.getTime() === 0) return dStr;
  
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${day}.${month}.${year}`;
};

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
//   BILLING @ 95% (PARTY PAYABLE), AMOUNT, PROFIT, TDS, ADVANCE,
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

    if (req.query.month && req.query.year) {
      filter.month = parseInt(req.query.month, 10);
      filter.year = parseInt(req.query.year, 10);
    }

    const entries = await col.find(filter).toArray();

    // Sort chronologically by date
    entries.sort((a, b) => {
      const dateA = parseToDate(a["LOADING DT"] || a["LOADING DATE"] || a["BILL DATE"] || a["RECEIVING DATE"] || a["INVOICE DATE"] || a["UNLOADING STATUS"]);
      const dateB = parseToDate(b["LOADING DT"] || b["LOADING DATE"] || b["BILL DATE"] || b["RECEIVING DATE"] || b["INVOICE DATE"] || b["UNLOADING STATUS"]);
      if (dateA.getTime() !== dateB.getTime()) {
        return dateA.getTime() - dateB.getTime();
      }
      const slA = parseInt(String(a["SL NO"] || '').replace(/\D/g, ''), 10) || 0;
      const slB = parseInt(String(b["SL NO"] || '').replace(/\D/g, ''), 10) || 0;
      return slA - slB;
    });

    // Format dates to DD.MM.YY and assign sequential SL NO
    const formattedEntries = entries.map((entry, index) => {
      entry["SL NO"] = String(index + 1);
      if (entry["LOADING DT"]) entry["LOADING DT"] = formatDateToDDMMYY(entry["LOADING DT"]);
      if (entry["LOADING DATE"]) entry["LOADING DATE"] = formatDateToDDMMYY(entry["LOADING DATE"]);
      
      // Deductions override overlay removed - now handled directly in DB fields
      return entry;
    });

    res.json({ success: true, count: formattedEntries.length, entries: formattedEntries });
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

// ── GET /cement-register/next-batch-serial ───────────────────────────────────
router.get("/next-batch-serial", auth, async (req, res) => {
  try {
    const col = getCollection();
    const dateQuery = req.query.date; // Optional bill date
    
    // Calculate FY
    const dObj = dateQuery ? new Date(dateQuery) : new Date();
    const year = dObj.getFullYear();
    const month = dObj.getMonth() + 1;
    let currentFy = (month >= 4) ? `${String(year).slice(-2)}-${String(year+1).slice(-2)}` : `${String(year-1).slice(-2)}-${String(year).slice(-2)}`;

    // Format the dateQuery to check both DD/MM/YYYY and YYYY-MM-DD
    let targetFormattedDate = null;
    let targetRawDate = null;
    if (dateQuery) {
      const parts = dateQuery.split('-');
      if (parts.length === 3) {
        targetRawDate = dateQuery; // YYYY-MM-DD
        targetFormattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`; // DD/MM/YYYY
      }
    }

    const existing = await col.find({"BILL NO": { $regex: /\d{2}-\d{2}\/\d+$/ }}).toArray();
    let maxSerial = 0;
    
    for (const row of existing) {
       const match = String(row['BILL NO']).match(/(\d{2}-\d{2})\/(\d+)$/);
       if (match) {
         const serial = parseInt(match[2], 10);
         if (match[1] === currentFy && serial > maxSerial) {
           maxSerial = serial;
         }
       }
    }
    
    const finalSerial = maxSerial + 1;
    const autoBatchSerial = `${currentFy}/${String(finalSerial).padStart(4, '0')}`;
    res.json({ success: true, nextSerial: autoBatchSerial });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /cement-register/incentive-state ────────────────────────────────────
router.get("/incentive-state", auth, async (req, res) => {
  try {
    const year = parseInt(req.query.year);
    const month = parseInt(req.query.month);
    if (isNaN(year) || isNaN(month)) {
      return res.status(400).json({ success: false, error: "Provide valid year and month query parameters." });
    }
    const db = mongoose.connection.useDb("cement_register");
    const col = db.collection("incentive_states");
    const state = await col.findOne({ year, month });
    res.json({ success: true, state });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── POST /cement-register/incentive-state ───────────────────────────────────
router.post("/incentive-state", auth, async (req, res) => {
  try {
    const { year, month, actuals, pdfUrl, excelName, excelData } = req.body;
    if (year === undefined || month === undefined) {
      return res.status(400).json({ success: false, error: "year and month are required." });
    }
    const db = mongoose.connection.useDb("cement_register");
    const col = db.collection("incentive_states");
    
    const query = { year: parseInt(year), month: parseInt(month) };
    const update = {
      $set: {
        actuals: actuals || {},
        pdfUrl: pdfUrl || null,
        excelName: excelName || null,
        excelData: excelData || null,
        updatedAt: new Date()
      }
    };
    await col.updateOne(query, update, { upsert: true });
    res.json({ success: true, message: "Incentive state saved successfully." });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── POST /cement-register/incentive-state/upload ─────────────────────────────
router.post("/incentive-state/upload", auth, (req, res, next) => {
  cementAttachUpload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: "No file uploaded." });
    res.json({ success: true, url: req.file.location });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /cement-register/incentive-state ─────────────────────────────────
router.delete("/incentive-state", auth, async (req, res) => {
  try {
    const year = parseInt(req.query.year);
    const month = parseInt(req.query.month);
    if (isNaN(year) || isNaN(month)) {
      return res.status(400).json({ success: false, error: "Provide valid year and month query parameters." });
    }
    const db = mongoose.connection.useDb("cement_register");
    const col = db.collection("incentive_states");
    await col.deleteOne({ year, month });
    res.json({ success: true, message: "Incentive state deleted successfully." });
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
router.post("/bulk", auth, async (req, res) => {
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
    
    // Inject dynamic truck details if VEHICLE NUMBER changed
    for (const u of updates) {
      if (u.changes && u.changes["VEHICLE NUMBER"]) {
        const truckDetails = await getTruckDetails(u.changes["VEHICLE NUMBER"]);
        if (truckDetails.ownerName) u.changes["OWNER NAME"] = truckDetails.ownerName;
        u.changes["_tds_percent"] = truckDetails.tdsPercent;
        u.changes["_freight_commission"] = truckDetails.basicFreightCommission;
      }
    }

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

// ── POST /cement-register/generate-batch-bills ──────────────────────────────
router.post("/generate-batch-bills", auth, async (req, res) => {
  try {
    const { recordIds, billDate, billType } = req.body;
    if (!recordIds || !Array.isArray(recordIds) || recordIds.length === 0) {
      return res.status(400).json({ success: false, error: "No records provided" });
    }
    if (!billDate || !billType) {
      return res.status(400).json({ success: false, error: "Missing billDate or billType" });
    }

    const col = getCollection();
    
    // Parse FY from billDate (YYYY-MM-DD)
    const dObj = new Date(billDate);
    const year = dObj.getFullYear();
    const month = dObj.getMonth() + 1;
    const currentFy = (month >= 4) ? `${String(year).slice(-2)}-${String(year+1).slice(-2)}` : `${String(year-1).slice(-2)}-${String(year).slice(-2)}`;
    
    // Format Date to DD/MM/YYYY
    const parts = billDate.split('-');
    const formattedBillDate = `${parts[2]}/${parts[1]}/${parts[0]}`;

    // Fetch records
    const objectIds = recordIds.map(id => new ObjectId(id));
    const records = await col.find({ _id: { $in: objectIds } }).toArray();

    // Group by Party
    const groups = { NVCL: [], DAC: [] };
    for (const record of records) {
      const rawSite = String(record['SITE'] || '').trim().toUpperCase();
      const party = rawSite === 'NVL' ? 'DAC' : 'NVCL';
      groups[party].push(record);
    }

    const db = mongoose.connection.useDb("cement_register");
    const countersCol = db.collection("bill_counters");
    const billsCol = db.collection("generated_bills");

    const bulkOps = [];
    const pushUpdates = [];
    const generatedBillsSummary = [];

    for (const [party, partyRecords] of Object.entries(groups)) {
      if (partyRecords.length === 0) continue;

      // MongoDB Node Driver findOneAndUpdate returns a FindAndModifyWriteOpResultObject
      // For mongoose/native driver it usually has `.value` or directly returns the doc depending on version/config
      const sequenceDoc = await countersCol.findOneAndUpdate(
        { _id: `${party}_${currentFy}` },
        { $inc: { seq: 1 } },
        { returnDocument: 'after', upsert: true }
      );
      
      const seqValue = sequenceDoc?.value?.seq || sequenceDoc?.seq || 1;

      const currentSerial = String(seqValue).padStart(4, '0');
      const billNumber = `${party}/${currentFy}/${currentSerial}`;
      
      generatedBillsSummary.push({ party, billNumber, recordCount: partyRecords.length });

      // Save to generated_bills
      await billsCol.insertOne({
        billNumber,
        billDate: formattedBillDate,
        billType,
        party,
        financialYear: currentFy,
        cementRegisterRecordIds: partyRecords.map(r => r._id),
        createdAt: new Date()
      });

      // Prepare updates for each record
      for (const record of partyRecords) {
        const changes = {};
        if (billType === 'Freight') {
          changes['BILL NO'] = billNumber;
          changes['BILL DATE'] = formattedBillDate;
          changes['Bill Type'] = billType;
          changes['Freight Generated'] = 'Yes';
        } else {
          changes['UNLOADING BILL NO'] = billNumber;
          changes['UNLOADING BILL DATE'] = formattedBillDate;
          changes['Unloading Generated'] = 'Yes';
        }
        
        const fGen = changes['Freight Generated'] || record['Freight Generated'];
        const uGen = changes['Unloading Generated'] || record['Unloading Generated'];
        if (fGen === 'Yes' && uGen === 'Yes') {
          changes['Billing Completed'] = 'Yes';
        }
        changes['CHALLAN STATUS'] = 'BILLED';

        bulkOps.push({
          updateOne: {
            filter: { _id: record._id },
            update: { $set: changes }
          }
        });
        
        pushUpdates.push({ id: record._id, changes });
      }
    }

    if (bulkOps.length > 0) {
      await col.bulkWrite(bulkOps);
    }

    for (const u of pushUpdates) {
      await pushToInvoice(u.id, u.changes);
    }

    res.json({ success: true, summary: generatedBillsSummary });
    const io = getIO();
    io.emit('cementUpdates', { action: 'batchBillsGenerated' });

  } catch (error) {
    console.error("Error generating batch bills:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── DELETE /cement-register/by-period ───────────────────────────────────────
router.delete("/by-period", auth, async (req, res) => {
  try {
    const col = getCollection();
    const { month, year } = req.query;
    if (!month || !year) {
      return res.status(400).json({ success: false, error: "Provide month and year." });
    }
    const filter = {
      month: parseInt(month, 10),
      year: parseInt(year, 10)
    };

    const result = await col.deleteMany(filter);

    // Re-sequence remaining SL NOs to stay gapless after deletion
    const remaining = await col.find({}).toArray();
    remaining.sort((a, b) => {
      const dateA = parseToDate(a["LOADING DT"] || a["LOADING DATE"]);
      const dateB = parseToDate(b["LOADING DT"] || b["LOADING DATE"]);
      if (dateA.getTime() !== dateB.getTime()) return dateA.getTime() - dateB.getTime();
      const slA = parseInt(String(a["SL NO"] || '').replace(/\D/g, ''), 10) || 0;
      const slB = parseInt(String(b["SL NO"] || '').replace(/\D/g, ''), 10) || 0;
      return slA - slB;
    });
    const bulkOps = remaining.map((row, idx) => ({
      updateOne: { filter: { _id: row._id }, update: { $set: { "SL NO": idx + 1 } } }
    }));
    if (bulkOps.length > 0) await col.bulkWrite(bulkOps);

    const io = getIO();
    io.emit("cementUpdates", { action: "bulkDeleteByPeriod", month, year });

    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
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
    const remaining = await col.find({}).toArray();
    remaining.sort((a, b) => {
      const dateA = parseToDate(a["LOADING DT"] || a["LOADING DATE"]);
      const dateB = parseToDate(b["LOADING DT"] || b["LOADING DATE"]);
      if (dateA.getTime() !== dateB.getTime()) return dateA.getTime() - dateB.getTime();
      const slA = parseInt(String(a["SL NO"] || '').replace(/\D/g, ''), 10) || 0;
      const slB = parseInt(String(b["SL NO"] || '').replace(/\D/g, ''), 10) || 0;
      return slA - slB;
    });
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
    
    // Inject dynamic truck details if VEHICLE NUMBER changed
    if (req.body["VEHICLE NUMBER"]) {
      const truckDetails = await getTruckDetails(req.body["VEHICLE NUMBER"]);
      if (truckDetails.ownerName) req.body["OWNER NAME"] = truckDetails.ownerName;
      req.body["_tds_percent"] = truckDetails.tdsPercent;
      req.body["_freight_commission"] = truckDetails.basicFreightCommission;
    }

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
// Upload a PDF/image for challan_proof, site_cash, or bill_pdf for a specific row
// attachType: "challan_proof" | "site_cash" | "bill_pdf"
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

    const fieldMap = {
      "challan_proof": "CHALLAN_PROOF_URL",
      "site_cash": "SITE_CASH_PROOF_URL",
      "bill_pdf": "BILL_PDF_URL"
    };
    const field = fieldMap[attachType];
    if (!field) return res.status(400).json({ success: false, error: "Invalid attachment type." });

    if (attachType === "bill_pdf") {
      // Logic for Bill PDF: find current row's BILL NO, then update all rows with that same BILL NO
      const currentRow = await col.findOne({ _id: new ObjectId(rowId) });
      const billNo = currentRow?.["BILL NO"];
      
      if (billNo && String(billNo).trim()) {
        await col.updateMany(
          { "BILL NO": billNo },
          { $set: { [field]: url } }
        );
      } else {
        // If no Bill No, just save to this row
        await col.updateOne(
          { _id: new ObjectId(rowId) },
          { $set: { [field]: url } }
        );
      }
    } else {
      // Standard logic: Save URL into the specific row only
      await col.updateOne(
        { _id: new ObjectId(rowId) },
        { $set: { [field]: url } }
      );
    }

    const io = getIO();
    io.emit("cementUpdates", { action: "attach", rowId, field, url, attachType });

    res.json({ success: true, url, field });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
