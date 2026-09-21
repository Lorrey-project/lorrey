const express = require("express");
const { getIO } = require("../socket");
const mongoose = require("mongoose");
const { ObjectId } = require("mongodb");
const auth = require("../middleware/authMiddleware");
const adminOnly = require("../middleware/adminOnly");

const router = express.Router();

const AccountDetail = require("../models/AccountDetail");

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
      const year = parseInt(parts[2], 10);
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
    if (req.query.year) filter.year = parseInt(req.query.year);

    // Auto-create daily rows for all days of the selected month
    if (filter.month && filter.year) {
      const daysInMonth = new Date(filter.year, filter.month, 0).getDate();

      if (daysInMonth > 0) {
        const existingEntries = await col.find(filter).project({ DATE: 1 }).toArray();
        const existingDates = new Set(existingEntries.map(e => {
          const parts = (e.DATE || '').split('-');
          if (parts.length === 3) return `${String(parseInt(parts[0])).padStart(2, '0')}-${String(parseInt(parts[1])).padStart(2, '0')}-${parseInt(parts[2])}`;
          return String(e.DATE).trim();
        }));

        const newDocs = [];
        for (let day = 1; day <= daysInMonth; day++) {
          const dateStr = `${String(day).padStart(2, '0')}-${String(filter.month).padStart(2, '0')}-${filter.year}`;
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
    const cementCol = mongoose.connection.useDb("cement_register").collection("entries");

    // ── Run all aggregations IN PARALLEL ──
    const [voucherAdvances, directVouchers, cementDocs, bankBookMainCash] = await Promise.all([

      // 1a. Indirect Vouchers (Site Cash) — strictly NOT "Direct Expense"
      voucherCol.aggregate([
        { $match: { expenseType: { $ne: "Direct Expense" } } },
        {
          $group: {
            _id: { $dateToString: { format: "%d-%m-%Y", date: "$date" } },
            total: { $sum: "$amount" }
          }
        }
      ]).toArray(),

      // 1b. Direct Vouchers (Office Exp) — strictly "Direct Expense"
      voucherCol.aggregate([
        { $match: { expenseType: "Direct Expense" } },
        {
          $group: {
            _id: { $dateToString: { format: "%d-%m-%Y", date: "$date" } },
            total: { $sum: "$amount" },
            details: { $push: { purpose: "$purpose", amount: "$amount" } }
          }
        }
      ]).toArray(),

      // 2. Cement Register all entries for advance aggregation
      cementCol.find({}).toArray(),

      // 3. Bank Book Main Cash withdrawals (Cash Receive Bank Book)
      AccountDetail.find({
        ledgerName: { $regex: /^main cash$/i }
      }).lean(),
    ]);

    const advanceMap = {};
    const officeExpMap = {};
    const officeDetailsMap = {};
    const bankBookCashRecvMap = {};

    voucherAdvances.forEach(a => {
      if (a._id) advanceMap[a._id] = (advanceMap[a._id] || 0) + a.total;
    });

    directVouchers.forEach(a => {
      if (a._id) {
        officeExpMap[a._id] = (officeExpMap[a._id] || 0) + a.total;
        officeDetailsMap[a._id] = a.details.map(d => `${d.purpose} (${d.amount})`).join(", ");
      }
    });

    // Cement Register daily advances: Loading Advance + Site Cash Advance + Office Cash Advance
    cementDocs.forEach(entry => {
      const dateVal = entry["LOADING DT"] || entry["LOADING DATE"] || entry["BILL DATE"];
      if (!dateVal) return;
      const parts = String(dateVal).trim().split(/[-\/\.]/);
      let normDate = '';
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          normDate = `${String(parseInt(parts[2], 10)).padStart(2, '0')}-${String(parseInt(parts[1], 10)).padStart(2, '0')}-${parseInt(parts[0], 10)}`;
        } else {
          let yr = parseInt(parts[2], 10);
          if (yr < 100) yr += 2000;
          normDate = `${String(parseInt(parts[0], 10)).padStart(2, '0')}-${String(parseInt(parts[1], 10)).padStart(2, '0')}-${yr}`;
        }
      }
      if (!normDate) return;

      const getNum = (...keys) => {
        for (const k of keys) {
          const v = entry[k];
          if (v !== undefined && v !== null && v !== '') {
            const n = parseFloat(String(v).replace(/,/g, ''));
            if (!isNaN(n)) return n;
          }
        }
        return 0;
      };

      const loadingAdv = getNum('ADVANCE', 'LOADING ADVANCE', 'Loading Advance');
      const siteCashAdv = getNum('SITE CASH', 'Site Cash', 'SITE_CASH', 'SITE CASH ADVANCE', 'Site Cash Advance');
      const officeCashAdv = getNum('OFFICE CASH', 'Office Cash', 'OFFICE_CASH', 'OFFICE CASH ADVANCE', 'Office Cash Advance');

      const dailyTotal = loadingAdv + siteCashAdv + officeCashAdv;
      if (dailyTotal > 0) {
        advanceMap[normDate] = (advanceMap[normDate] || 0) + dailyTotal;
      }
    });

    bankBookMainCash.forEach(doc => {
      const rawDate = doc.transactionDate || doc['Transaction Date'];
      const parts = String(rawDate || '').trim().split(/[-\/\.]/);
      let normDate = '';
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          normDate = `${String(parseInt(parts[2], 10)).padStart(2, '0')}-${String(parseInt(parts[1], 10)).padStart(2, '0')}-${parseInt(parts[0], 10)}`;
        } else {
          let yr = parseInt(parts[2], 10);
          if (yr < 100) yr += 2000;
          normDate = `${String(parseInt(parts[0], 10)).padStart(2, '0')}-${String(parseInt(parts[1], 10)).padStart(2, '0')}-${yr}`;
        }
      }
      const w = parseFloat(String(doc.withdraw || '').replace(/,/g, ''));
      if (normDate && !isNaN(w) && w > 0) {
        bankBookCashRecvMap[normDate] = (bankBookCashRecvMap[normDate] || 0) + w;
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
        entry.S_EXPENSE = advanceMap[normDate] || advanceMap[entry.DATE] || 0;
        // Office expenses remain user-editable/manual on entry unless empty
        if (entry.O_EXPENSE === undefined || entry.O_EXPENSE === null) {
          entry.O_EXPENSE = officeExpMap[normDate] || officeExpMap[entry.DATE] || 0;
        }
        if (!entry.REMARKS_EXP) {
          entry.REMARKS_EXP = officeDetailsMap[normDate] || officeDetailsMap[entry.DATE] || "";
        }
        entry.P_CASH_RECV_BB = bankBookCashRecvMap[normDate] !== undefined
          ? bankBookCashRecvMap[normDate]
          : (entry.P_CASH_RECV_BB || 0);
      } else {
        entry.S_EXPENSE = 0;
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
    const year = parseInt(req.query.year);
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
      const yr = req.body.year || new Date().getFullYear();
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

// ── POST /main-cashbook/bulk-import ──────────────────────────────────────
// Used for Excel Multi-Month Import
router.post("/bulk-import", auth, async (req, res) => {
  try {
    const col = getCollection();
    const { entries } = req.body;
    if (!entries || !Array.isArray(entries)) {
      return res.status(400).json({ success: false, error: "Invalid entries payload" });
    }

    let insertedCount = 0;
    let updatedCount = 0;

    for (const entry of entries) {
      const { DATE, month, year, _id, _created_at, ...changes } = entry;
      // Normalise date for lookup
      const normDate = (() => {
        const parts = String(DATE || '').trim().split(/[-\/]/);
        if (parts.length === 3) return `${parseInt(parts[0], 10)}-${parseInt(parts[1], 10)}-${parts[2]}`;
        return DATE;
      })();

      const filter = { DATE: normDate };
      const updateDoc = {
        $set: {
          month,
          year,
          ...changes
        },
        $setOnInsert: {
          _created_at: new Date()
        }
      };

      const result = await col.updateOne(filter, updateDoc, { upsert: true });
      if (result.upsertedCount > 0) insertedCount++;
      else if (result.modifiedCount > 0) updatedCount++;
    }

    // Assign SL NO for any newly inserted docs (naive re-sequence)
    const remaining = await col.find({}).sort({ "SL NO": 1, "_created_at": 1 }).toArray();
    const bulkOps = remaining.map((row, idx) => ({
      updateOne: { filter: { _id: row._id }, update: { $set: { "SL NO": idx + 1 } } }
    }));
    if (bulkOps.length > 0) await col.bulkWrite(bulkOps);

    const io = getIO();
    io.emit('mainCashbookUpdates', { action: 'bulkImport' });

    res.json({ success: true, insertedCount, updatedCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
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
