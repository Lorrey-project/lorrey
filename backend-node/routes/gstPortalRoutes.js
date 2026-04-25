const express = require("express");
const { getIO } = require("../socket");
const router = express.Router();
const mongoose = require("mongoose");
const { ObjectId } = require("mongodb");
const auth = require("../middleware/authMiddleware");
const adminOnly = require("../middleware/adminOnly");
const gstAttachUpload = require("../middleware/gstAttachUpload");

const FinancialYearRow = require('../models/FinancialYearRow');

// ─────────────────────────────────────────────────────────────────────────────
// Database  : gst_portal
// Collection: entries
// By passing Mongoose schema to handle arbitrary spreadsheet fields.
// ─────────────────────────────────────────────────────────────────────────────

function getCollection() {
  return mongoose.connection.useDb("gst_portal").collection("entries");
}

function getCementCol() {
  return mongoose.connection.useDb("cement_register").collection("entries");
}

function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val) ? null : val;
  const str = String(val).trim();
  // Handle DD-MM-YYYY or DD/MM/YYYY
  const ddmmyyyy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (ddmmyyyy) {
    const d = parseInt(ddmmyyyy[1]), m = parseInt(ddmmyyyy[2]), y = parseInt(ddmmyyyy[3]);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) return new Date(y, m - 1, d);
  }
  const iso = new Date(str);
  return isNaN(iso.getTime()) ? null : iso;
}

const MONTH_NAMES_SHORT = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const MONTH_MAP = {
  1: 'JANUARY', 2: 'FEBRUARY', 3: 'MARCH', 4: 'APRIL', 5: 'MAY', 6: 'JUNE',
  7: 'JULY', 8: 'AUGUST', 9: 'SEPTEMBER', 10: 'OCTOBER', 11: 'NOVEMBER', 12: 'DECEMBER'
};

function normalizeSite(site) {
  if (!site) return '';
  const s = String(site).trim().toUpperCase();
  if (s === 'NVCL') return 'NVCL';
  if (s === 'NVL') return 'NVL';
  return site.trim();
}

function monthsMatch(m1, m2) {
  if (!m1 || !m2) return false;
  const norm = (s) => String(s).toUpperCase().replace(/['\s-]/g, "");
  let n1 = norm(m1);
  let n2 = norm(m2);
  if (n1 === n2) return true;
  // Handle APRIL26 vs APRIL2026
  const to4Digit = (s) => s.replace(/(\d{2})$/, "20$1");
  if (n1.length === n2.length - 2) return to4Digit(n1) === n2;
  if (n2.length === n1.length - 2) return to4Digit(n2) === n1;
  return false;
}

// ── POST /gst-portal/sync-liabilities ──────────────────────────────────────
router.post("/sync-liabilities", auth, async (req, res) => {
  try {
    const { month, year } = req.body;
    const mNum = parseInt(month);
    const yNum = parseInt(year);
    const monthName = MONTH_MAP[mNum];
    const yearShort = String(yNum).slice(-2);
    const targetMonthStr = `${monthName} '${yearShort}`;

    const [allCement, rowOverrides] = await Promise.all([
      getCementCol().find({}, { projection: { 
        'BILL NO': 1, 'SITE': 1, 'BILL DATE': 1, 'LOADING DT': 1, 'LOADING DATE': 1, 
        'BILLING AMOUNT': 1, 'Billing Amount': 1, 'BILLING @ 95% (PARTY PAYABLE)': 1, 'AMOUNT': 1 
      }}).toArray(),
      FinancialYearRow.find({}).lean()
    ]);

    const aggregated = {};
    for (const row of allCement) {
      let invNo = row['BILL NO'];
      if (!invNo) continue;
      invNo = String(invNo).trim();
      const rawSite = normalizeSite(row['SITE']);
      if (rawSite !== 'NVCL' && rawSite !== 'NVL') continue;

      const prefix = rawSite === 'NVCL' ? 'NVCL/' : 'DAC/';
      const cleanInvNo = invNo.replace(/^(DAC|NVCL)\//i, '');
      const finalInvNo = `${prefix}${cleanInvNo}`;

      if (!aggregated[finalInvNo]) {
        const invDate = row['BILL DATE'] || row['LOADING DT'] || row['LOADING DATE'] || '';
        let monthStr = '';
        const dObj = parseDate(invDate);
        if (dObj) {
          const m = dObj.getMonth();
          const yy = String(dObj.getFullYear()).slice(-2);
          monthStr = `${MONTH_NAMES_SHORT[m]} '${yy}`;
        }
        aggregated[finalInvNo] = { invoiceDate: invDate, invoiceNumber: finalInvNo, month: monthStr, site: rawSite, amount: 0, billType: 'FREIGHT' };
      }
      const amt = parseFloat(row['BILLING AMOUNT']) || parseFloat(row['Billing Amount']) || parseFloat(row['BILLING @ 95% (PARTY PAYABLE)']) || parseFloat(row['AMOUNT']) || 0;
      aggregated[finalInvNo].amount += amt;
    }

    const rowMap = {};
    for (const r of rowOverrides) rowMap[r.billNo] = r;

    const syncRows = [];
    for (const invNo in aggregated) {
      const r = aggregated[invNo];
      const ov = rowMap[invNo] || {};
      if (ov.hidden) continue;

      const finalRow = {
        invoiceDate: ov.editedInvoiceDate || r.invoiceDate,
        invoiceNumber: ov.editedInvoiceNumber || r.invoiceNumber,
        month: ov.editedMonth || r.month,
        site: normalizeSite(ov.editedSite || r.site),
        amount: ov.editedAmount !== undefined ? ov.editedAmount : r.amount,
        billType: ov.billType || r.billType
      };

      if (mNum && yNum) {
        if (!monthsMatch(finalRow.month, targetMonthStr)) continue;
      }

      const amt = parseFloat(finalRow.amount || 0);
      const gst = Math.round(amt * 0.18);
      const totalAmount = amt + gst;

      syncRows.push({
        type: 'liability',
        filterMonth: mNum,
        filterYear: yNum,
        'Invoice Date': finalRow.invoiceDate,
        'Invoice Number': finalRow.invoiceNumber,
        'Month': finalRow.month,
        'SITE': finalRow.site,
        'BILL': finalRow.billType,
        'Amount': amt,
        'GST(18%)': gst,
        'Total Amount': totalAmount,
        _sync_source: 'bill-register',
        _sync_at: new Date()
      });
    }

    const col = getCollection();
    for (const sRow of syncRows) {
      await col.updateOne(
        { type: 'liability', 'Invoice Number': sRow['Invoice Number'], filterMonth: mNum, filterYear: yNum },
        { $set: sRow },
        { upsert: true }
      );
    }

    res.json({ success: true, count: syncRows.length });
    getIO().emit('gstPortalUpdates', { action: 'syncLiabilities' });
  } catch (error) {
    console.error('[GST Sync] error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── GET /gst-portal ─────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const col = getCollection();
    const filter = {};
    const entries = await col.find(filter).sort({ "SL NO": 1 }).toArray();
    res.json({ success: true, count: entries.length, entries });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── POST /gst-portal ────────────────────────────────────────────────────────
router.post("/", auth, async (req, res) => {
  try {
    const col = getCollection();
    const result = await col.insertOne(req.body);
    res.status(201).json({ success: true, entry: { _id: result.insertedId, ...req.body } });
    const io = getIO();
    io.emit('gstPortalUpdates', { action: 'create', entry: { _id: result.insertedId, ...req.body } });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ── POST /gst-portal/bulk ───────────────────────────────────────────────────
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
    io.emit('gstPortalUpdates', { action: 'bulkCreate', count: result.insertedCount });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ── PUT /gst-portal/bulk-update ─────────────────────────────────────────────
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

    res.json({ success: true, updatedCount: updates.length });
    io.emit('gstPortalUpdates', { action: 'bulkUpdate' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /gst-portal/bulk-delete ──────────────────────────────────────────
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
    io.emit("gstPortalUpdates", { action: "bulkDelete", ids });

    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put("/:id", auth, async (req, res) => {
  try {
    const col = getCollection();
    const result = await col.findOneAndUpdate(
      { _id: new ObjectId(req.params.id) },
      { $set: req.body },
      { returnDocument: "after" }
    );
    if (!result) return res.status(404).json({ success: false, error: "Entry not found." });
    res.json({ success: true, entry: result });
    const io = getIO();
    io.emit('gstPortalUpdates', { action: 'update', entry: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ── POST /gst-portal/attach/:rowId/:attachType ──────────────────────────────
router.post("/attach/:rowId/:attachType", auth, (req, res, next) => {
  gstAttachUpload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: "No file uploaded." });
    const col      = getCollection();
    const { rowId } = req.params;
    const url      = req.file.location; // S3 public URL
    const field    = "GST_FILE_URL";

    // Save URL into the row
    await col.updateOne(
      { _id: new ObjectId(rowId) },
      { $set: { [field]: url } }
    );

    const io = getIO();
    io.emit("gstPortalUpdates", { action: "attach", rowId, field, url });

    res.json({ success: true, url, field });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
