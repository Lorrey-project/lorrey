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

  // ── Detect DD-MM-YYYY or DD/MM/YYYY (Indian format) — MUST check first ──
  const ddmmyyyy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (ddmmyyyy) {
    const d = parseInt(ddmmyyyy[1]), m = parseInt(ddmmyyyy[2]), y = parseInt(ddmmyyyy[3]);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      return new Date(y, m - 1, d); // local time
    }
  }

  // ── Try ISO / standard JS parsing ──
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
    const pumps = await getCementCol().distinct("PUMP NAME");
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
    const startDay = p === 0 ? 1 : p === 1 ? 1 : p === 2 ? 11 : 21;
    const endDay = p === 0 ? lastDay : p === 1 ? 10 : p === 2 ? 20 : lastDay;

    let query = { "PUMP NAME": pumpName };
    if (pumpName.toUpperCase().match(/^SAS-?\d*$/)) {
      if (req.user && req.user.role === 'PETROL PUMP') {
        // Petrol Pump admin is locked to their own pumpName (e.g. "SAS-1")
        query = {
          $or: [
            { "PUMP NAME": pumpName },
            { "PUMP NAME": "SAS" },
            { "PUMP NAME": "" },
            { "PUMP NAME": null }
          ]
        };
      } else {
        // For Office/Site admin:
        if (pumpName.toUpperCase() === 'SAS') {
          // If they select the generic "SAS", show all SAS variations + unassigned
          query = {
            $or: [
              { "PUMP NAME": { $regex: /^SAS(-\d+)?$/i } },
              { "PUMP NAME": "" },
              { "PUMP NAME": null }
            ]
          };
        } else {
          // If they select a specific pump like "SAS-1", show only that pump's verified rows + unassigned
          query = {
            $or: [
              { "PUMP NAME": pumpName },
              { "PUMP NAME": "SAS" },
              { "PUMP NAME": "" },
              { "PUMP NAME": null }
            ]
          };
        }
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

    // Sort chronologically by Loading Date in ascending order
    entries.sort((a, b) => {
      const dateValA = a["LOADING DT"] || a["LOADING DATE"];
      const dateValB = b["LOADING DT"] || b["LOADING DATE"];
      const parseA = parseDate(dateValA);
      const parseB = parseDate(dateValB);
      const tA = parseA ? parseA.getTime() : 0;
      const tB = parseB ? parseB.getTime() : 0;
      if (tA !== tB) return tA - tB;
      const slA = parseInt(a["SL NO"]) || 0;
      const slB = parseInt(b["SL NO"]) || 0;
      return slA - slB;
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
    } catch (_) { }

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
    } catch (_) { }
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
    } catch (_) { }
    res.json({ success: true, proofUrls: urls, status: newStatus });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /pump-payment/fuel-rates ─────────────────────────────────────────────
// Returns full history of diesel rates for each pump.
router.get("/fuel-rates", auth, async (req, res) => {
  try {
    const col = mongoose.connection.useDb("pump_payment").collection("fuel_rates");
    const history = await col.find({}).sort({ effectiveDate: -1 }).toArray();

    // Group by pumpName for easier UI consumption
    const grouped = {};
    const latestRates = {};
    const pumps = ["SAS-1", "SAS-2"];
    pumps.forEach(p => {
      const pumpHistory = history.filter(r => r.pumpName === p);
      grouped[p] = pumpHistory;
      latestRates[p] = pumpHistory.length > 0 ? pumpHistory[0].rate : 90;
    });

    res.json({ success: true, history: grouped, rates: latestRates });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /pump-payment/fuel-rates ─────────────────────────────────────────────
// Add or update a diesel rate for a specific date (HEAD_OFFICE only).
// Body: { pumpName: "SAS-1", rate: 92.5, effectiveDate: "2026-04-24" }
router.put("/fuel-rates", auth, async (req, res) => {
  try {
    if (req.user.role !== "HEAD_OFFICE") {
      return res.status(403).json({ success: false, error: "Only Head Office can update fuel rates." });
    }
    const { pumpName, rate, effectiveDate } = req.body;
    if (!pumpName || rate === undefined || !effectiveDate) {
      return res.status(400).json({ success: false, error: "pumpName, rate, and effectiveDate are required." });
    }
    const numRate = parseFloat(rate);
    const date = new Date(effectiveDate);
    date.setHours(0, 0, 0, 0); // normalize to start of day

    if (isNaN(numRate) || numRate <= 0) {
      return res.status(400).json({ success: false, error: "Rate must be a positive number." });
    }
    if (isNaN(date.getTime())) {
      return res.status(400).json({ success: false, error: "Invalid date format." });
    }

    const col = mongoose.connection.useDb("pump_payment").collection("fuel_rates");

    // Upsert by pump + exact effective date
    await col.updateOne(
      { pumpName, effectiveDate: date },
      { $set: { pumpName, rate: numRate, effectiveDate: date, updatedAt: new Date(), updatedBy: req.user.userId } },
      { upsert: true }
    );

    // ── BULK UPDATE TRIGGER ──
    // Find all invoices from this date onwards and re-sync them to apply the new rate
    const Invoice = require("../models/Invoice");
    const { pushToRegister } = require("../utils/syncManager");

    // Match invoices whose station_name starts with the pump prefix (SAS, SAS-1, SAS-2 etc.)
    const pumpPrefix = pumpName.split('-')[0]; // "SAS-1" → "SAS"
    const affectedInvoices = await Invoice.find({
      "lorry_hire_slip_data.station_name": { $regex: new RegExp(`^${pumpPrefix}`, 'i') },
      // Match invoices whose lorry hire slip was created on or after the effective date
      $or: [
        { "lorry_hire_slip_data.created_at": { $gte: date } },
        { created_at: { $gte: date } }
      ]
    }).select("_id lorry_hire_slip_data").lean();

    console.log(`[FuelRate] Updated ${pumpName} → ₹${numRate}/L from ${effectiveDate}. Applying to ${affectedInvoices.length} invoices...`);

    // Update each invoice: recalculate diesel_advance = diesel_litres × new rate
    const bulkOps = affectedInvoices
      .filter(inv => inv.lorry_hire_slip_data?.diesel_litres != null)
      .map(inv => {
        const litres = Number(inv.lorry_hire_slip_data.diesel_litres) || 0;
        const loadAdv = Number(inv.lorry_hire_slip_data.loading_advance) || 0;
        const newDieselAdv = parseFloat((litres * numRate).toFixed(2));
        const newTotalAdv = parseFloat((loadAdv + newDieselAdv).toFixed(2));
        return {
          updateOne: {
            filter: { _id: inv._id },
            update: {
              $set: {
                "lorry_hire_slip_data.diesel_rate": numRate,
                "lorry_hire_slip_data.diesel_advance": newDieselAdv,
                "lorry_hire_slip_data.total_advance": newTotalAdv,
              }
            }
          }
        };
      });

    if (bulkOps.length > 0) {
      await Invoice.bulkWrite(bulkOps);
      console.log(`[FuelRate] DB update complete for ${bulkOps.length} invoices.`);
    }

    // Run cement-register re-sync in background (non-blocking)
    const affectedIds = affectedInvoices.map(inv => inv._id.toString());
    (async () => {
      for (const id of affectedIds) {
        await pushToRegister(id);
      }
      console.log(`[FuelRate] Cement register re-sync complete for ${pumpName}.`);
    })();

    // Broadcast live rate update AND affected invoice IDs so frontend can regenerate PDFs
    try {
      const { getIO } = require("../socket");
      const io = getIO();
      io.emit("fuelRateUpdated", { pumpName, rate: numRate, effectiveDate: date });
      // Emit in batches of 10 so the frontend doesn't get overwhelmed
      for (let i = 0; i < affectedIds.length; i += 10) {
        io.emit("fuelRateApplied", {
          pumpName, rate: numRate,
          invoiceIds: affectedIds.slice(i, i + 10)
        });
      }
    } catch (_) { }

    res.json({ success: true, pumpName, rate: numRate, effectiveDate: date, reSyncCount: affectedInvoices.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /pump-payment/next-batch-bill-number ──────────────────────────────────
router.get("/next-batch-bill-number", auth, async (req, res) => {
  try {
    if (req.user.role !== "OFFICE" && req.user.role !== "HEAD_OFFICE") {
      return res.status(403).json({ success: false, error: "Only Office Admin can preview batch bills" });
    }
    const { pumpName, billDate } = req.query;
    if (!pumpName || !billDate) {
      return res.status(400).json({ success: false, error: "Missing pumpName or billDate" });
    }

    const dObj = new Date(billDate);
    const year = dObj.getFullYear();
    const month = dObj.getMonth() + 1;
    const currentFy = (month >= 4) ? `${String(year).slice(-2)}-${String(year + 1).slice(-2)}` : `${String(year - 1).slice(-2)}-${String(year).slice(-2)}`;

    const db = mongoose.connection.useDb("pump_payment");
    const countersCol = db.collection("bill_counters");

    const pumpPrefix = String(pumpName).split('-')[0].toUpperCase();
    const counterId = `PUMP_BILL_${pumpPrefix}_${currentFy}`;

    const sequenceDoc = await countersCol.findOne({ _id: counterId });
    const nextSeq = sequenceDoc ? sequenceDoc.seq + 1 : 1;
    const nextSerial = String(nextSeq).padStart(3, '0');

    const nextBillNumber = `${pumpPrefix}/${currentFy}/${nextSerial}`;

    res.json({ success: true, nextBillNumber });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Helper for other routes/modules
async function getRateForDate(pumpName, dateVal) {
  try {
    const col = mongoose.connection.useDb("pump_payment").collection("fuel_rates");
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return 90;

    // Find the latest rate that is effective on or before this date
    const record = await col.find({
      pumpName: { $regex: new RegExp(`^${pumpName.split('-')[0]}`, 'i') },
      effectiveDate: { $lte: d }
    })
      .sort({ effectiveDate: -1 })
      .limit(1)
      .toArray();

    return record[0] ? record[0].rate : 90;
  } catch (e) {
    return 90;
  }
}

// ── POST /pump-payment/generate-batch-bills ──────────────────────────────────
router.post("/generate-batch-bills", auth, async (req, res) => {
  try {
    if (req.user.role !== "OFFICE" && req.user.role !== "HEAD_OFFICE") {
      return res.status(403).json({ success: false, error: "Only Office Admin can generate batch bills" });
    }
    const { recordIds, pumpName, billDate } = req.body;
    if (!recordIds || !Array.isArray(recordIds) || recordIds.length === 0) {
      return res.status(400).json({ success: false, error: "No records provided" });
    }
    if (!pumpName || !billDate) {
      return res.status(400).json({ success: false, error: "Missing pumpName or billDate" });
    }

    const { ObjectId } = mongoose.Types;
    const objectIds = recordIds.map(id => new ObjectId(id));

    // Parse FY from billDate (YYYY-MM-DD)
    const dObj = new Date(billDate);
    const year = dObj.getFullYear();
    const month = dObj.getMonth() + 1;
    const currentFy = (month >= 4) ? `${String(year).slice(-2)}-${String(year + 1).slice(-2)}` : `${String(year - 1).slice(-2)}-${String(year).slice(-2)}`;

    const parts = billDate.split('-');
    const formattedBillDate = `${parts[2]}/${parts[1]}/${parts[0]}`;

    const cementCol = getCementCol();
    const records = await cementCol.find({ _id: { $in: objectIds } }).toArray();

    // Validation removed so user can test generating bills for already billed records

    const db = mongoose.connection.useDb("pump_payment");
    const countersCol = db.collection("bill_counters");
    const billsCol = db.collection("generated_bills");

    const pumpPrefix = String(pumpName).split('-')[0].toUpperCase();
    const counterId = `PUMP_BILL_${pumpPrefix}_${currentFy}`;

    const sequenceDoc = await countersCol.findOneAndUpdate(
      { _id: counterId },
      { $inc: { seq: 1 } },
      { returnDocument: 'after', upsert: true }
    );
    const seqValue = sequenceDoc?.value?.seq || sequenceDoc?.seq || 1;
    const currentSerial = String(seqValue).padStart(3, '0');

    // Format e.g., SAS/25-26/001
    const billNumber = `${pumpPrefix}/${currentFy}/${currentSerial}`;

    let totalFuelQuantity = 0;
    let totalBillingAmount = 0;

    const detailedRecords = records.map(r => {
      const fuelLtr = parseFloat(String(r['HSD (LTR)'] || r['HSD (Ltr)'] || '0').replace(/,/g, '')) || 0;
      const fuelAmt = parseFloat(String(r['HSD AMOUNT'] || '0').replace(/,/g, '')) || 0;
      const paymentAmt = parseFloat(String(r['PAYMENT AMOUNT'] || '0').replace(/,/g, '')) || 0;

      totalFuelQuantity += fuelLtr;
      totalBillingAmount += fuelAmt;

      return {
        cementId: r._id,
        vehicleNo: r['VEHICLE NUMBER'],
        ownerName: r['OWNER NAME'],
        driverName: r['DRIVER NAME'],
        fuelDate: r['LOADING DATE'],
        invoiceNo: r['INVOICE NUMBER'],
        fuelLtr,
        fuelAmt,
        paymentAmt
      };
    });

    // Save summary to generated_bills
    await billsCol.insertOne({
      billNumber,
      billDate: formattedBillDate,
      financialYear: currentFy,
      month: String(month),
      pumpName,
      totalRecords: records.length,
      totalFuelQuantity,
      totalBillingAmount,
      records: detailedRecords,
      cementRegisterRecordIds: records.map(r => r._id),
      createdAt: new Date(),
      createdBy: req.user.userId || req.user.id
    });

    const bulkOps = [];
    for (const record of records) {
      bulkOps.push({
        updateOne: {
          filter: { _id: record._id },
          update: {
            $set: {
              'HSD BILL NO': billNumber,
              'HSD BILL DATE': formattedBillDate,
              'CHALLAN STATUS': 'BILLED'
            }
          }
        }
      });
    }

    if (bulkOps.length > 0) {
      await cementCol.bulkWrite(bulkOps);
    }

    // Auto-sync to Pump Payment Register
    try {
      const registerCol = mongoose.connection.useDb("pump_payment_register").collection("records");
      const existingRegister = await registerCol.findOne({ 'BILL NO': billNumber });

      if (!existingRegister) {
        let periodNumStr = '';
        let minDate = null;
        let maxDate = null;

        const parseToDate = (rawDate) => {
          if (!rawDate) return null;
          if (rawDate instanceof Date && !isNaN(rawDate)) return rawDate;
          const str = String(rawDate).trim();
          const match = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
          if (match) {
            const d = parseInt(match[1]), m = parseInt(match[2]);
            let y = parseInt(match[3]);
            if (y < 100) y += 2000;
            return new Date(y, m - 1, d);
          }
          const iso = new Date(str);
          if (!isNaN(iso.getTime())) return iso;
          return null;
        };

        for (const r of records) {
          const raw = r['LOADING DT'] || r['LOADING DATE'] || r['DATE'];
          const dObj = parseToDate(raw);
          if (dObj) {
            if (!minDate || dObj < minDate) minDate = dObj;
            if (!maxDate || dObj > maxDate) maxDate = dObj;
            
            if (!periodNumStr) {
              const d = dObj.getDate();
              if (d >= 1 && d <= 10) periodNumStr = `Period 1`;
              else if (d >= 11 && d <= 20) periodNumStr = `Period 2`;
              else periodNumStr = `Period 3`;
            }
          }
        }

        if (!periodNumStr) {
          const fyEnd = currentFy.split('-')[1];
          const mm = String(month).padStart(2, '0');
          periodNumStr = `${mm}/${fyEnd}`;
        }

        let period = periodNumStr;
        if (minDate && maxDate) {
          const formatDDMMYY = (dt) => {
            const d = String(dt.getDate()).padStart(2, '0');
            const m = String(dt.getMonth() + 1).padStart(2, '0');
            const y = String(dt.getFullYear()).slice(-2);
            return `${d}.${m}.${y}`;
          };
          period = `${periodNumStr}\n${formatDDMMYY(minDate)} - ${formatDDMMYY(maxDate)}`;
        }

        // Fetch cash discount rate to calculate CD
        const colDiscounts = mongoose.connection.useDb("pump_payment").collection("cash_discounts");
        let cdAmount = 0;
        if (pumpName && dObj && !isNaN(dObj.getTime())) {
          const discountRec = await colDiscounts.find({
            pumpName: { $regex: new RegExp(`^${String(pumpName).trim().split(/[-\s]/)[0]}`, "i") },
            effectiveDate: { $lte: dObj }
          }).sort({ effectiveDate: -1 }).limit(1).toArray();
          const rate = discountRec.length > 0 ? Number(discountRec[0].discount) || 0 : 0;
          cdAmount = totalFuelQuantity * rate;
        }

        await registerCol.insertOne({
          'SL NO': '',
          'PUMP NAME': pumpName,
          'PERIOD': period,
          'BILL NO': billNumber,
          'BILL AMOUNT': totalBillingAmount,
          'LITRE': totalFuelQuantity,
          'CD': cdAmount,
          'PAYABLE AMOUNT': totalBillingAmount,
          'PAYMENT AMOUNT': 0,
          'REF. NO': '',
          'DATE': formattedBillDate,
          'DUE AMOUNT': totalBillingAmount,
          paymentDateObj: dObj,
          // Extra mapped fields as requested
          financialYear: currentFy,
          month: String(month),
          billDate: formattedBillDate,
          vehicleNumbers: detailedRecords.map(r => r.vehicleNo).join(', '),
          ownerNames: detailedRecords.map(r => r.ownerName).join(', '),
          driverNames: detailedRecords.map(r => r.driverName).join(', '),
          invoiceNumbers: detailedRecords.map(r => r.invoiceNo).join(', '),
          fuelQuantityLiters: totalFuelQuantity,
          fuelAmount: totalBillingAmount,
          billingAmount: totalBillingAmount,
          paymentStatus: 'Pending',
          remarks: '',
          createdAt: new Date(),
          createdBy: req.user.username || req.user.id
        });
      }
    } catch (regErr) {
      console.error("Error syncing to pump payment register:", regErr);
      // Not failing the whole request if sync fails, but it's logged
    }

    try {
      const { getIO } = require("../socket");
      getIO().emit('cementUpdates', { action: 'batchPumpBillsGenerated' });
    } catch (_) { }

    res.json({ success: true, billNumber, recordCount: records.length });
  } catch (err) {
    console.error("Error generating batch pump bills:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
module.exports.getRateForDate = getRateForDate;




// ── GET /pump-payment/cash-discounts ─────────────────────────────────────────────
// Returns full history of cash discounts for each pump.
router.get("/cash-discounts", auth, async (req, res) => {
  try {
    const col = mongoose.connection.useDb("pump_payment").collection("cash_discounts");
    const history = await col.find({}).sort({ effectiveDate: -1 }).toArray();

    // Group by pumpName for easier UI consumption
    const grouped = {};
    const latestDiscounts = {};
    const pumps = ["SAS-1", "SAS-2"];
    pumps.forEach(p => {
      const pumpHistory = history.filter(r => r.pumpName === p);
      grouped[p] = pumpHistory;
      latestDiscounts[p] = pumpHistory.length > 0 ? pumpHistory[0].discount : 0;
    });

    res.json({ success: true, history: grouped, discounts: latestDiscounts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /pump-payment/cash-discounts ─────────────────────────────────────────────
// Add or update a cash discount for a specific date (HEAD_OFFICE only).
// Body: { pumpName: "SAS-1", discount: 1.5, effectiveDate: "2026-04-24" }
router.put("/cash-discounts", auth, async (req, res) => {
  try {
    if (req.user.role !== "HEAD_OFFICE") {
      return res.status(403).json({ success: false, error: "Only Head Office can update cash discounts." });
    }
    const { pumpName, discount, effectiveDate } = req.body;
    if (!pumpName || discount === undefined || !effectiveDate) {
      return res.status(400).json({ success: false, error: "pumpName, discount, and effectiveDate are required." });
    }
    const numDiscount = parseFloat(discount);
    const date = new Date(effectiveDate);
    date.setHours(0, 0, 0, 0); // normalize to start of day

    if (isNaN(numDiscount) || numDiscount < 0) {
      return res.status(400).json({ success: false, error: "Discount must be a positive number." });
    }
    if (isNaN(date.getTime())) {
      return res.status(400).json({ success: false, error: "Invalid date format." });
    }

    const col = mongoose.connection.useDb("pump_payment").collection("cash_discounts");

    // Upsert logic: find existing record for this exact date (normalized) and pump
    const startOfDay = new Date(date);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const existing = await col.findOne({
      pumpName,
      effectiveDate: { $gte: startOfDay, $lte: endOfDay }
    });

    if (existing) {
      await col.updateOne(
        { _id: existing._id },
        { $set: { discount: numDiscount, updatedBy: req.user.email, updatedAt: new Date() } }
      );
    } else {
      await col.insertOne({
        pumpName,
        discount: numDiscount,
        effectiveDate: date,
        createdBy: req.user.email,
        createdAt: new Date()
      });
    }

    res.json({ success: true, message: "Cash discount updated successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
