const express = require("express");
const mongoose = require("mongoose");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

const Voucher = require("../models/Voucher");

function getCementCol() {
  return mongoose.connection.useDb("cement_register").collection("entries");
}

function getCashbookCol() {
  return mongoose.connection.useDb("main_cashbook").collection("entries");
}

function getDatePatterns(dateStr) {
  // Input: YYYY-MM-DD
  const parts = dateStr.split('-');
  if (parts.length !== 3) return [dateStr];
  const y = parts[0];
  const m = String(parseInt(parts[1], 10)); // e.g. "6"
  const mm = parts[1]; // e.g. "06"
  const d = String(parseInt(parts[2], 10)); // e.g. "9"
  const dd = parts[2]; // e.g. "09"
  
  const yShort = y.slice(-2);
  
  const patterns = [
    `${dd}-${mm}-${y}`,
    `${d}-${m}-${y}`,
    `${dd}/${mm}/${y}`,
    `${d}/${m}/${y}`,
    `${dd}-${mm}-${yShort}`,
    `${d}-${m}-${yShort}`,
    `${dd}/${mm}/${yShort}`,
    `${d}/${m}/${yShort}`
  ];
  // Remove duplicates
  return Array.from(new Set(patterns));
}

router.get("/data", auth, async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ success: false, error: "Date parameter is required (YYYY-MM-DD)" });
    }

    const patterns = getDatePatterns(date);
    
    // Construct Date bounds for Voucher query
    const parts = date.split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);

    // Cover UTC day bounds
    const startOfDay = new Date(Date.UTC(y, m, d, 0, 0, 0));
    const endOfDay = new Date(Date.UTC(y, m, d, 23, 59, 59, 999));

    // Cover local day bounds just in case dates are stored in local time offset
    const localStart = new Date(y, m, d, 0, 0, 0);
    const localEnd = new Date(y, m, d, 23, 59, 59, 999);

    // Parallel DB Reads
    const [cementEntries, cashbookEntries, vouchers] = await Promise.all([
      getCementCol().find({
        $or: [
          { "LOADING DT": { $in: patterns } },
          { "LOADING DATE": { $in: patterns } },
          { "BILL DATE": { $in: patterns } }
        ]
      }).toArray(),
      getCashbookCol().find({
        DATE: { $in: patterns }
      }).toArray(),
      Voucher.find({
        $or: [
          { date: { $gte: startOfDay, $lte: endOfDay } },
          { date: { $gte: localStart, $lte: localEnd } }
        ]
      }).lean()
    ]);

    // Extract pump slips (entries from cement register with pump details)
    const pumpSlips = cementEntries.filter(e => {
      const hasPump = !!e["PUMP NAME"];
      const hasFuel = parseFloat(e["HSD (LTR)"]) > 0 || !!e["HSD SLIP NO"];
      return hasPump && hasFuel;
    });

    res.json({
      success: true,
      cement: cementEntries,
      cashbook: cashbookEntries,
      vouchers,
      pumpSlips
    });

  } catch (err) {
    console.error("[DailySummary] fetch error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

module.exports = router;
