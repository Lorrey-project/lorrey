const express = require("express");
const mongoose = require("mongoose");
const auth = require("../middleware/authMiddleware");
const pumpPaymentProofUpload = require("../middleware/pumpPaymentProofUpload");

const router = express.Router();

function getCementCol() {
  return mongoose.connection.useDb("cement_register").collection("entries");
}
function getPumpPayCol() {
  return mongoose.connection.useDb("pump_payment").collection("records");
}

function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val) ? null : val;

  const str = String(val).trim();

  // ── Detect DD-MM-YYYY (Indian format stored by fmtDate) — MUST check first ──
  // new Date("05-04-2026") → Invalid Date in Node.js, so we handle it manually
  const ddmmyyyy = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddmmyyyy) {
    const d = parseInt(ddmmyyyy[1]), m = parseInt(ddmmyyyy[2]), y = parseInt(ddmmyyyy[3]);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      return new Date(y, m - 1, d); // local time
    }
  }

  // ── Try ISO / standard JS parsing (handles "2026-04-05T18:30:00.000Z" etc.) ──
  const iso = new Date(str);
  if (!isNaN(iso.getTime())) return iso;

  return null;
}


function getDateParts(val) {
  const d = parseDate(val);
  if (!d) return null;
  return { day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear() };
}

// ── GET /pump-payment/pumps ───────────────────────────────────────────────
router.get("/pumps", auth, async (req, res) => {
  try {
    const pumps = await getCementCol().distinct("PUMP NAME");
    res.json({ success: true, pumps: pumps.filter(Boolean).sort() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /pump-payment/debug ───────────────────────────────────────────────
// Returns sample raw entries for a pump (for troubleshooting)
router.get("/debug", auth, async (req, res) => {
  try {
    const { pumpName } = req.query;
    const filter = pumpName ? { "PUMP NAME": pumpName } : {};
    const sample = await getCementCol().find(filter).limit(5).toArray();
    const pumps  = await getCementCol().distinct("PUMP NAME");
    res.json({
      success: true,
      pumpNames: pumps,
      sampleEntries: sample.map(e => ({
        _id: e._id,
        "PUMP NAME": e["PUMP NAME"],
        "LOADING DATE": e["LOADING DATE"],
        "LOADING DATE TYPE": typeof e["LOADING DATE"],
        "LOADING DATE String": String(e["LOADING DATE"]),
        "HSD SLIP NO": e["HSD SLIP NO"],
        "HSD (LTR)": e["HSD (LTR)"],
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /pump-payment/cement-data ─────────────────────────────────────────
// ?pumpName=SAS&month=4&year=2026&period=1|2|3|0
// period=0 → full month (all entries)
router.get("/cement-data", auth, async (req, res) => {
  try {
    const { pumpName, month, year, period } = req.query;
    if (!pumpName || !month || !year || period === undefined || period === '') {
      return res.status(400).json({ success: false, error: "pumpName, month, year, period are required" });
    }
    const m = parseInt(month), y = parseInt(year), p = parseInt(period);
    const lastDay = new Date(y, m, 0).getDate();
    const startDay = p === 0 ? 1 : p === 1 ? 1  : p === 2 ? 11 : 21;
    const endDay   = p === 0 ? lastDay : p === 1 ? 10 : p === 2 ? 20 : lastDay;

    let query = { "PUMP NAME": pumpName };
    if (pumpName.toUpperCase().match(/^SAS-?\d*$/)) {
      // For pump admin: show only unverified rows with no pump name yet (their queue to claim)
      if (req.user && req.user.role === 'PETROL PUMP') {
        query = { 
          $or: [{ "PUMP NAME": "SAS" }, { "PUMP NAME": "" }, { "PUMP NAME": null }], 
          "VERIFICATION STATUS": { $ne: "Verified" } 
        };
      } else {
        // For Office/Site admin: show ALL SAS rows regardless of exact suffix (SAS, SAS-1, SAS-2)
        // and also unassigned rows. This prevents verified rows from disappearing when
        // PUMP NAME is stamped from "SAS" → "SAS-1" on verification.
        query = {
          $or: [
            { "PUMP NAME": { $regex: /^SAS(-\d+)?$/i } },  // matches SAS, SAS-1, SAS-2 etc.
            { "PUMP NAME": "" },
            { "PUMP NAME": null }
          ]
        };
      }
    }

    const all = await getCementCol()
      .find(query)
      .sort({ "SL NO": 1 })
      .toArray();

    // Filter by month/year/day range in JS for robustness
    const entries = all.filter(e => {
      // Check both keys because old data might use LOADING DATE
      const dateVal = e["LOADING DT"] || e["LOADING DATE"];
      const parts = getDateParts(dateVal);
      if (!parts) return false;
      return parts.year === y && parts.month === m
        && parts.day >= startDay && parts.day <= endDay;
    });

    res.json({ success: true, count: entries.length, entries });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /pump-payment/saved ───────────────────────────────────────────────
router.get("/saved", auth, async (req, res) => {
  try {
    const { pumpName, month, year, period } = req.query;
    if (!pumpName || !month || !year || period === undefined || period === '') {
      return res.status(400).json({ success: false, error: "pumpName, month, year, period are required" });
    }
    const records = await getPumpPayCol().find({
      pumpName,
      month: parseInt(month),
      year: parseInt(year),
      period: parseInt(period)
    }).sort({ _seq: 1 }).toArray();
    res.json({ success: true, records });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /pump-payment/save-period ─────────────────────────────────────────
router.put("/save-period", auth, async (req, res) => {
  try {
    const { pumpName, month, year, period, rows } = req.body;
    if (!pumpName || !month || !year || period === undefined) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }
    const col = getPumpPayCol();

    // Only save PAYMENT STATUS and PAYMENT PROOF URL per slip (office admin only)
    // VERIFICATION STATUS is never stored here — it comes live from cement register
    if (rows && rows.length > 0) {
      for (const row of rows) {
        const slipNo = row['HSD SLIP NO'];
        if (!slipNo) continue;
        await col.updateOne(
          { pumpName, month: parseInt(month), year: parseInt(year), period: parseInt(period), 'HSD SLIP NO': slipNo },
          {
            $set: {
              pumpName,
              month: parseInt(month),
              year: parseInt(year),
              period: parseInt(period),
              'HSD SLIP NO': slipNo,
              paymentStatus: row['PAYMENT STATUS'] || '',
              paymentProofUrl: row['PAYMENT PROOF URL'] || '',
              _saved_at: new Date()
            }
          },
          { upsert: true }
        );
      }
    }
    res.json({ success: true, savedCount: rows?.length || 0 });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
// ── POST /pump-payment/upload-payment-proof ──────────────────────────────
router.post("/upload-payment-proof", auth, pumpPaymentProofUpload.single("proof"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }
    // file.location contains the S3 URL
    res.json({ success: true, url: req.file.location });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /pump-payment/notification-status ──────────────────────────────────
// Returns whether a payment notification has been sent for a given pump/month/year/period
router.get("/notification-status", auth, async (req, res) => {
  try {
    const { pumpName, month, year, period } = req.query;
    if (!pumpName || !month || !year || period === undefined) {
      return res.status(400).json({ success: false, error: "Missing params" });
    }
    const col = mongoose.connection.useDb("pump_payment").collection("notifications");
    const notif = await col.findOne({
      pumpName,
      month: parseInt(month),
      year: parseInt(year),
      period: parseInt(period)
    });
    res.json({ success: true, notified: !!notif, notifiedAt: notif?.notifiedAt || null, sentBy: notif?.sentBy || null });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /pump-payment/notify ─────────────────────────────────────────────
// Saves a payment notification (pump admin only) and emits it to office admin via socket
router.post("/notify", auth, async (req, res) => {
  try {
    const { pumpName, month, year, period } = req.body;
    if (!pumpName || !month || !year || period === undefined) {
      return res.status(400).json({ success: false, error: "Missing params" });
    }
    // Only PETROL PUMP role is allowed to send notification
    if (req.user.role !== "PETROL PUMP") {
      return res.status(403).json({ success: false, error: "Only Pump Admin can send notifications" });
    }
    const col = mongoose.connection.useDb("pump_payment").collection("notifications");
    const notifiedAt = new Date();
    await col.updateOne(
      { pumpName, month: parseInt(month), year: parseInt(year), period: parseInt(period) },
      { $set: { pumpName, month: parseInt(month), year: parseInt(year), period: parseInt(period), notifiedAt, sentBy: req.user.userId } },
      { upsert: true }
    );

    // Emit real-time socket notification to all connected clients (office admin sees it live)
    try {
      const { getIO } = require("../socket");
      getIO().emit("paymentNotification", { pumpName, month: parseInt(month), year: parseInt(year), period: parseInt(period), notifiedAt });
    } catch (_) {}

    res.json({ success: true, notifiedAt });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /pump-payment/all-notifications ──────────────────────────────────────
// Returns ALL pump payment notifications (office admin sees all pending notifications)
router.get("/all-notifications", auth, async (req, res) => {
  try {
    const col = mongoose.connection.useDb("pump_payment").collection("notifications");
    const notifications = await col.find({}).sort({ notifiedAt: -1 }).toArray();
    res.json({ success: true, notifications });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /pump-payment/period-payment-status ────────────────────────────────────
router.get("/period-payment-status", auth, async (req, res) => {
  try {
    const { pumpName, month, year, period } = req.query;
    if (!pumpName || !month || !year || period === undefined) {
      return res.status(400).json({ success: false, error: "Missing params" });
    }
    const col = mongoose.connection.useDb("pump_payment").collection("period_payments");
    const record = await col.findOne({
      pumpName, month: parseInt(month), year: parseInt(year), period: parseInt(period)
    });
    // Backwards-compat: old records have proofUrl (string), new ones have proofUrls (array)
    let proofUrls = record?.proofUrls || [];
    if (!proofUrls.length && record?.proofUrl) proofUrls = [record.proofUrl];
    res.json({ success: true, status: record?.status || "Unpaid", proofUrls });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /pump-payment/save-period-payment ────────────────────────────────────
router.put("/save-period-payment", auth, async (req, res) => {
  try {
    const { pumpName, month, year, period, status, proofUrls } = req.body;
    if (!pumpName || !month || !year || period === undefined || !status) {
      return res.status(400).json({ success: false, error: "Missing params" });
    }
    if (req.user.role !== "OFFICE") {
      return res.status(403).json({ success: false, error: "Only Office Admin can set period payment status" });
    }
    const urls = Array.isArray(proofUrls) ? proofUrls : (proofUrls ? [proofUrls] : []);
    const col = mongoose.connection.useDb("pump_payment").collection("period_payments");
    await col.updateOne(
      { pumpName, month: parseInt(month), year: parseInt(year), period: parseInt(period) },
      { $set: { pumpName, month: parseInt(month), year: parseInt(year), period: parseInt(period), status, proofUrls: urls, updatedAt: new Date() } },
      { upsert: true }
    );
    // Clear notification once Paid + at least one proof uploaded
    if (status === "Paid" && urls.length > 0) {
      const notifCol = mongoose.connection.useDb("pump_payment").collection("notifications");
      await notifCol.deleteOne({ pumpName, month: parseInt(month), year: parseInt(year), period: parseInt(period) });
    }
    try {
      const { getIO } = require("../socket");
      getIO().emit("periodPaymentUpdated", {
        pumpName, month: parseInt(month), year: parseInt(year), period: parseInt(period),
        status, proofUrls: urls
      });
    } catch (_) {}
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /pump-payment/remove-period-proof ────────────────────────────────────
// Removes one proof URL from the array. If none left, reverts status to Unpaid.
router.put("/remove-period-proof", auth, async (req, res) => {
  try {
    const { pumpName, month, year, period, urlToRemove } = req.body;
    if (req.user.role !== "OFFICE") {
      return res.status(403).json({ success: false, error: "Only Office Admin can remove proof" });
    }
    const col = mongoose.connection.useDb("pump_payment").collection("period_payments");
    const record = await col.findOne({ pumpName, month: parseInt(month), year: parseInt(year), period: parseInt(period) });
    let urls = record?.proofUrls || (record?.proofUrl ? [record.proofUrl] : []);
    urls = urls.filter(u => u !== urlToRemove);
    const newStatus = urls.length > 0 ? (record?.status || "Unpaid") : "Unpaid";
    await col.updateOne(
      { pumpName, month: parseInt(month), year: parseInt(year), period: parseInt(period) },
      { $set: { proofUrls: urls, proofUrl: null, status: newStatus, updatedAt: new Date() } }
    );
    try {
      const { getIO } = require("../socket");
      getIO().emit("periodPaymentUpdated", {
        pumpName, month: parseInt(month), year: parseInt(year), period: parseInt(period),
        status: newStatus, proofUrls: urls
      });
    } catch (_) {}
    res.json({ success: true, proofUrls: urls, status: newStatus });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /pump-payment/fuel-rates ─────────────────────────────────────────────
// Returns current diesel rate for each pump. Any authenticated user can read.
router.get("/fuel-rates", auth, async (req, res) => {
  try {
    const col = mongoose.connection.useDb("pump_payment").collection("fuel_rates");
    const rates = await col.find({}).toArray();
    // Seed defaults if nothing stored yet
    const defaults = { "SAS-1": 90, "SAS-2": 90 };
    const result = {};
    for (const [pump, defaultRate] of Object.entries(defaults)) {
      const record = rates.find(r => r.pumpName === pump);
      result[pump] = record ? record.rate : defaultRate;
    }
    res.json({ success: true, rates: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /pump-payment/fuel-rates ─────────────────────────────────────────────
// Update diesel rate for a pump (HEAD_OFFICE only).
// Body: { pumpName: "SAS-1", rate: 92.5 }
router.put("/fuel-rates", auth, async (req, res) => {
  try {
    if (req.user.role !== "HEAD_OFFICE") {
      return res.status(403).json({ success: false, error: "Only Office Admin can update fuel rates." });
    }
    const { pumpName, rate } = req.body;
    if (!pumpName || rate === undefined || rate === null) {
      return res.status(400).json({ success: false, error: "pumpName and rate are required." });
    }
    const numRate = parseFloat(rate);
    if (isNaN(numRate) || numRate <= 0) {
      return res.status(400).json({ success: false, error: "Rate must be a positive number." });
    }
    const allowedPumps = ["SAS-1", "SAS-2"];
    if (!allowedPumps.includes(pumpName)) {
      return res.status(400).json({ success: false, error: `Pump must be one of: ${allowedPumps.join(", ")}` });
    }
    const col = mongoose.connection.useDb("pump_payment").collection("fuel_rates");
    await col.updateOne(
      { pumpName },
      { $set: { pumpName, rate: numRate, updatedAt: new Date(), updatedBy: req.user.userId } },
      { upsert: true }
    );
    // Broadcast live rate update to all connected clients
    try {
      const { getIO } = require("../socket");
      getIO().emit("fuelRateUpdated", { pumpName, rate: numRate });
    } catch (_) {}
    res.json({ success: true, pumpName, rate: numRate });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;


