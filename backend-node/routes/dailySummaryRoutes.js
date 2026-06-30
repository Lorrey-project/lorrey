const express = require("express");
const mongoose = require("mongoose");
const auth = require("../middleware/authMiddleware");

const router = express.Router();
const Invoice = require("../models/Invoice");

function getCementCol() {
  return mongoose.connection.useDb("cement_register").collection("entries");
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
  return Array.from(new Set(patterns));
}

router.get("/data", auth, async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ success: false, error: "Date parameter is required (YYYY-MM-DD)" });
    }

    const patterns = getDatePatterns(date);

    // Fetch Cement Register entries based on date patterns
    const cementEntries = await getCementCol().find({
      $or: [
        { "LOADING DT": { $in: patterns } },
        { "LOADING DATE": { $in: patterns } },
        { "BILL DATE": { $in: patterns } }
      ]
    }).toArray();

    // Fetch Main Cashbook entry for the selected date
    const cashbookEntry = await mongoose.connection.useDb("main_cashbook").collection("entries").findOne({
      DATE: { $in: patterns }
    });

    // Extract pump slips (entries from cement register with pump details)
    const pumpSlips = cementEntries.filter(e => {
      const hasPump = !!e["PUMP NAME"];
      const hasFuel = parseFloat(e["HSD (LTR)"]) > 0 || !!e["HSD SLIP NO"];
      return hasPump && hasFuel;
    });

    res.json({
      success: true,
      invoicesUploaded: cementEntries.length,
      cement: cementEntries,
      pumpSlips,
      cashbookEntry
    });

  } catch (err) {
    console.error("[DailySummary] fetch error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

module.exports = router;
