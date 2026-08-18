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

    const dateList = date.split(',');
    let patterns = [];
    dateList.forEach(d => {
      patterns.push(...getDatePatterns(d));
    });
    patterns = Array.from(new Set(patterns));

    // Fetch Cement Register entries based on date patterns
    const cementEntries = await getCementCol().find({
      $or: [
        { "LOADING DT": { $in: patterns } },
        { "LOADING DATE": { $in: patterns } },
        { "BILL DATE": { $in: patterns } }
      ]
    }).toArray();

    // Fetch Main Cashbook entry for the selected date
    const cashbookEntries = await mongoose.connection.useDb("main_cashbook").collection("entries").find({
      DATE: { $in: patterns }
    }).toArray();
    
    let cashbookEntry = null;
    if (cashbookEntries.length > 0) {
      cashbookEntry = {
        OPENING_BALANCE: cashbookEntries[0].OPENING_BALANCE,
        RECEIVED_AMOUNT: cashbookEntries.reduce((s, e) => s + (parseFloat(String(e.RECEIVED_AMOUNT || 0).replace(/,/g, '')) || 0), 0),
        PAYMENT_AMOUNT: cashbookEntries.reduce((s, e) => s + (parseFloat(String(e.PAYMENT_AMOUNT || 0).replace(/,/g, '')) || 0), 0)
      };
    }

    // Fetch Advance Summary for the selected date
    let isoDateObj = new Date(date);
    let advanceSummary = null;

    let validDates = dateList.map(d => new Date(d)).filter(d => !isNaN(d.getTime()));
    if (validDates.length > 0) {
      const isoDateStrings = validDates.map(dateObj => {
        const yr = dateObj.getFullYear();
        const mo = String(dateObj.getMonth() + 1).padStart(2, '0');
        const da = String(dateObj.getDate()).padStart(2, '0');
        return `${yr}-${mo}-${da}`;
      });

      const advSummaries = await mongoose.connection.useDb("invoiceAI").collection("daily_advances").find({ date: { $in: isoDateStrings } }).sort({ date: 1 }).toArray();
      if (advSummaries.length > 0) {
        advanceSummary = {
          openingBalance: advSummaries[0].openingBalance,
          closingBalance: advSummaries[advSummaries.length - 1].closingBalance,
          cashReceived: advSummaries.reduce((s, a) => s + (a.cashReceived || 0), 0),
          miscExpense: advSummaries.reduce((s, a) => s + (a.miscExpense || 0), 0),
          totalAdvancesAmt: advSummaries.reduce((s, a) => s + (a.totalAdvancesAmt || 0), 0),
          unadjustedAdvances: advSummaries.reduce((s, a) => s + (a.unadjustedAdvances || 0), 0),
          advancesCount: advSummaries.reduce((s, a) => s + (a.advancesCount || 0), 0)
        };
      }
    }

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
      cashbookEntry,
      advanceSummary
    });

  } catch (err) {
    console.error("[DailySummary] fetch error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

module.exports = router;
