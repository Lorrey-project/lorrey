const express = require("express");
const { getIO } = require("../socket");
const mongoose = require("mongoose");
const { ObjectId } = require("mongodb");
const auth = require("../middleware/authMiddleware");
const adminOnly = require("../middleware/adminOnly");

const router = express.Router();

// One-time migration flag — reset on server restart only
let _migrationDone = false;

function getCollection() {
  return mongoose.connection.useDb("main_cashbook").collection("entries");
}

// ── Auto-migration helper ────────────────────────────────────────────────
// Parses DATE strings like "5-4-2026" / "05-04-2026" (DD-M-YYYY, Indian format)
// and back-fills month + year for any entries that are missing those fields.
// Cached: after the first clean pass, subsequent calls are instant no-ops.
async function migrateMonthYear(col) {
  if (_migrationDone) return; // ← instant exit on all subsequent calls
  const stale = await col.find({
    $or: [{ month: { $exists: false } }, { year: { $exists: false } }]
  }).toArray();
  if (!stale.length) { _migrationDone = true; return; }

  const ops = [];
  for (const entry of stale) {
    const parts = (entry.DATE || '').split('-');
    if (parts.length === 3) {
      const month = parseInt(parts[1], 10); // DD-MM-YYYY
      const year  = parseInt(parts[2], 10);
      if (month >= 1 && month <= 12 && year > 2000) {
        ops.push({ updateOne: { filter: { _id: entry._id }, update: { $set: { month, year } } } });
      }
    }
  }
  if (ops.length) await col.bulkWrite(ops);
  _migrationDone = true; // ← never run again this session
}


  // ── GET /main-cashbook ───────────────────────────────────────────────────
// Optional query params: ?month=4&year=2025
router.get("/", auth, async (req, res) => {
  try {
    const col = getCollection();
    await migrateMonthYear(col); // instant no-op once _migrationDone = true
    const filter = {};
    if (req.query.month) filter.month = parseInt(req.query.month);
    if (req.query.year)  filter.year  = parseInt(req.query.year);

    // Auto-create daily rows up to today
    if (filter.month && filter.year) {
      const today = new Date();
      // month is 1-based
      const isCurrentMonth = filter.month === (today.getMonth() + 1) && filter.year === today.getFullYear();
      const isPastMonth = filter.year < today.getFullYear() || (filter.year === today.getFullYear() && filter.month < (today.getMonth() + 1));
      
      let targetDays = 0;
      if (isCurrentMonth) {
        targetDays = today.getDate();
      } else if (isPastMonth) {
        targetDays = new Date(filter.year, filter.month, 0).getDate();
      }
      
      if (targetDays > 0) {
        const existingEntries = await col.find(filter).project({ DATE: 1 }).toArray();
        const existingDates = new Set(existingEntries.map(e => {
          const parts = (e.DATE || '').split('-');
          if (parts.length === 3) return `${parseInt(parts[0])}-${parseInt(parts[1])}-${parseInt(parts[2])}`;
          return String(e.DATE).trim();
        }));
        
        const newDocs = [];
        for (let day = 1; day <= targetDays; day++) {
          const dateStr = `${day}-${filter.month}-${filter.year}`;
          if (!existingDates.has(dateStr)) {
            newDocs.push({
              DATE: dateStr,
              month: filter.month,
              year: filter.year,
              _created_at: new Date()
            });
          }
        }
        
        if (newDocs.length > 0) {
          let highest = await col.find(filter).sort({ "SL NO": -1 }).limit(1).toArray();
          let nextSlNo = highest.length > 0 && typeof highest[0]["SL NO"] === 'number' ? highest[0]["SL NO"] + 1 : 1;
          
          newDocs.forEach(d => {
            d["SL NO"] = nextSlNo++;
          });
          
          await col.insertMany(newDocs, { ordered: false });
        }
      }
    }
    const entries = await col.find(filter).sort({ "SL NO": 1, "_created_at": 1 }).toArray();

    const voucherCol = mongoose.connection.collection("vouchers");
    const cementCol  = mongoose.connection.useDb("cement_register").collection("entries");

    // ── Run all 3 aggregations IN PARALLEL (3 serial → 1 parallel round-trip) ──
    const [voucherAdvances, directVouchers, cementAdvances] = await Promise.all([

      // 1a. Indirect Vouchers (Site Cash) — strictly NOT "Direct Expense"
      voucherCol.aggregate([
        { $match: { expenseType: { $ne: "Direct Expense" } } },
        { $group: {
            _id: { $dateToString: { format: "%d-%m-%Y", date: "$date" } },
            total: { $sum: "$amount" }
        }}
      ]).toArray(),

      // 1b. Direct Vouchers (Office Exp) — strictly "Direct Expense"
      voucherCol.aggregate([
        { $match: { expenseType: "Direct Expense" } },
        { $group: {
            _id: { $dateToString: { format: "%d-%m-%Y", date: "$date" } },
            total: { $sum: "$amount" },
            details: { $push: { purpose: "$purpose", amount: "$amount" } }
        }}
      ]).toArray(),

      // 2. Cement Register loading advances (Site Cash)
      cementCol.aggregate([
        { $group: {
            _id: "$LOADING DT",
            totalAdvance: {
              $sum: { $convert: { input: "$ADVANCE", to: "double", onError: 0, onNull: 0 } }
            }
        }}
      ]).toArray(),
    ]);

    const advanceMap = {};
    const officeExpMap = {};
    const officeDetailsMap = {};

    voucherAdvances.forEach(a => {
      if (a._id) advanceMap[a._id] = (advanceMap[a._id] || 0) + a.total;
    });

    directVouchers.forEach(a => {
      if (a._id) {
        officeExpMap[a._id] = (officeExpMap[a._id] || 0) + a.total;
        officeDetailsMap[a._id] = a.details.map(d => `${d.purpose} (${d.amount})`).join(", ");
      }
    });

    cementAdvances.forEach(a => {
      if (a._id) {
        let dStr = String(a._id).trim();
        let parts = dStr.split(/[-\/]/);
        if (parts.length === 3) {
          let [d, m, y] = parts;
          const normDate = `${d.padStart(2, '0')}-${m.padStart(2, '0')}-${y}`;
          advanceMap[normDate] = (advanceMap[normDate] || 0) + a.totalAdvance;
        } else {
          advanceMap[a._id] = (advanceMap[a._id] || 0) + a.totalAdvance;
        }
      }
    });

    entries.forEach(entry => {
      if (entry.DATE) {
        let dStr = String(entry.DATE).trim();
        let parts = dStr.split(/[-\/]/);
        let normDate = dStr;
        if (parts.length === 3) {
          let [d, m, y] = parts;
          normDate = `${d.padStart(2, '0')}-${m.padStart(2, '0')}-${y}`;
        }
        entry.S_EXPENSE  = advanceMap[normDate]      || advanceMap[entry.DATE]      || 0;
        entry.O_EXPENSE  = officeExpMap[normDate]    || officeExpMap[entry.DATE]    || 0;
        entry.REMARKS_EXP= officeDetailsMap[normDate]|| officeDetailsMap[entry.DATE]|| "";
      } else {
        entry.S_EXPENSE = 0;
        entry.O_EXPENSE = 0;
        entry.REMARKS_EXP = "";
      }
    });

    res.json({ success: true, count: entries.length, entries });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


// ── GET /main-cashbook/month-end?month=3&year=2025 ────────────────────────
// Returns the last computed closing balances of a given month for carry-forward
router.get("/month-end", auth, async (req, res) => {
  try {
    const col = getCollection();
    const month = parseInt(req.query.month);
    const year  = parseInt(req.query.year);
    if (!month || !year) return res.status(400).json({ success: false, error: "month and year required" });
    const lastRow = await col.find({ month, year }).sort({ "SL NO": -1, "_created_at": -1 }).limit(1).toArray();
    if (!lastRow.length) return res.json({ success: true, data: null });
    const row = lastRow[0];
    res.json({
      success: true,
      data: {
        P_CLOSING: row.P_CLOSING || 0,
        S_CLOSING: row.S_CLOSING || 0,
        O_CLOSING: row.O_CLOSING || 0,
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── POST /main-cashbook ──────────────────────────────────────────────────
router.post("/", auth, async (req, res) => {
  try {
    const col = getCollection();
    
    // Add SL NO per-month (each month starts from 1)
    if (!req.body["SL NO"]) {
      const mth = req.body.month || (new Date().getMonth() + 1);
      const yr  = req.body.year  || new Date().getFullYear();
      const highest = await col.find({ month: mth, year: yr }).sort({ "SL NO": -1 }).limit(1).toArray();
      req.body["SL NO"] = highest.length > 0 && typeof highest[0]["SL NO"] === 'number'
        ? highest[0]["SL NO"] + 1 : 1;
    }
    
    req.body._created_at = new Date();
    const result = await col.insertOne(req.body);

    res.status(201).json({ success: true, entry: { _id: result.insertedId, ...req.body } });
    
    const io = getIO();
    io.emit('mainCashbookUpdates', { action: 'create', entry: { _id: result.insertedId, ...req.body } });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ── PUT /main-cashbook/monthly-summary ──────────────────────────────────
// Upsert the computed monthly summary (called from frontend on Save)
// Body: { month, year, label, ...numericTotals }
router.put("/monthly-summary", auth, async (req, res) => {
  try {
    const sumCol = mongoose.connection.useDb("main_cashbook").collection("monthly_summaries");
    const { month, year } = req.body;
    if (!month || !year) return res.status(400).json({ success: false, error: "month and year required" });
    await sumCol.updateOne(
      { month, year },
      { $set: { ...req.body, updatedAt: new Date() } },
      { upsert: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /main-cashbook/bulk ─────────────────────────────────────────────
router.post("/bulk", auth, adminOnly, async (req, res) => {
  try {
    const col = getCollection();
    const docs = req.body.entries || req.body;
    if (!Array.isArray(docs) || docs.length === 0) {
      return res.status(400).json({ success: false, error: "Provide an array of entries." });
    }
    
    // Set created at date
    docs.forEach(d => { d._created_at = new Date(); });

    const result = await col.insertMany(docs, { ordered: false });
    res.status(201).json({ success: true, insertedCount: result.insertedCount });
    
    const io = getIO();
    io.emit('mainCashbookUpdates', { action: 'bulkCreate', count: result.insertedCount });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ── PUT /main-cashbook/bulk-update ───────────────────────────────────────
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
    if (bulkOps.length > 0) {
        await col.bulkWrite(bulkOps);
    }

    res.json({ success: true, updatedCount: updates.length });
    io.emit('mainCashbookUpdates', { action: 'bulkUpdate' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /main-cashbook/bulk-delete ────────────────────────────────────
router.delete("/bulk-delete", auth, async (req, res) => {
  try {
    const col = getCollection();
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: "Provide an array of ids." });
    }
    const objectIds = ids.map(id => new ObjectId(id));
    const result = await col.deleteMany({ _id: { $in: objectIds } });

    // Re-sequence SL NOs to stay gapless
    const remaining = await col.find({}).sort({ "SL NO": 1, "_created_at": 1 }).toArray();
    const bulkOps = remaining.map((row, idx) => ({
      updateOne: { filter: { _id: row._id }, update: { $set: { "SL NO": idx + 1 } } }
    }));
    if (bulkOps.length > 0) await col.bulkWrite(bulkOps);

    const io = getIO();
    io.emit("mainCashbookUpdates", { action: "bulkDelete", ids });

    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── PUT /main-cashbook/:id ───────────────────────────────────────────────
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
    io.emit('mainCashbookUpdates', { action: 'update', entry: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ── DELETE /main-cashbook/:id ────────────────────────────────────────────
router.delete("/:id", auth, adminOnly, async (req, res) => {
  try {
    const col = getCollection();
    const result = await col.deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, error: "Entry not found." });
    }
    res.json({ success: true, message: "Entry deleted." });
    const io = getIO();
    io.emit('mainCashbookUpdates', { action: 'delete', id: req.params.id });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
