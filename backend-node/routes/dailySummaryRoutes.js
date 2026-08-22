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
    const { date, fy, month } = req.query;
    if (!date) {
      return res.status(400).json({ success: false, error: "Date parameter is required (YYYY-MM-DD or ALL)" });
    }

    // Helper to calculate year and month index from 'fy' and 'month' query parameters
    let monthInt = null;
    let yearInt = null;
    
    if (fy && month) {
      const monthNamesArray = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const mIdx = monthNamesArray.indexOf(month);
      if (mIdx !== -1) {
        monthInt = mIdx + 1; // 1-12
        const startYearStr = String(fy).substring(3, 7); // "FY 2026-27" -> "2026"
        yearInt = parseInt(startYearStr, 10);
        // If the month is Jan, Feb, or Mar, it belongs to the second half of the financial year
        if (mIdx < 3) {
          yearInt += 1;
        }
      }
    }

    let cementFilter = {};
    let cashbookFilter = {};
    let isoDateStrings = [];

    if (date === 'ALL') {
      if (!monthInt || !yearInt) {
        return res.status(400).json({ success: false, error: "Missing valid fy and month for ALL dates" });
      }
      
      cementFilter = { month: monthInt, year: yearInt };
      cashbookFilter = { month: monthInt, year: yearInt };
      
      // Generate all valid YYYY-MM-DD for the selected month to query daily_advances
      const daysInMonth = new Date(yearInt, monthInt, 0).getDate();
      for (let i = 1; i <= daysInMonth; i++) {
        const mo = String(monthInt).padStart(2, '0');
        const da = String(i).padStart(2, '0');
        isoDateStrings.push(`${yearInt}-${mo}-${da}`);
      }
    } else {
      // Date is specific (YYYY-MM-DD)
      const patterns = getDatePatterns(date);
      
      cementFilter = {
        $or: [
          { "LOADING DT": { $in: patterns } },
          { "LOADING DATE": { $in: patterns } }
        ]
      };
      // To be extremely precise, also scope it down to the exact month/year if they were passed
      if (monthInt && yearInt) {
        cementFilter.month = monthInt;
        cementFilter.year = yearInt;
      }
      
      cashbookFilter = { DATE: { $in: patterns } };
      if (monthInt && yearInt) {
        cashbookFilter.month = monthInt;
        cashbookFilter.year = yearInt;
      }
      
      isoDateStrings = [date];
    }

    // Fetch Cement Register entries
    const cementEntries = await getCementCol().find(cementFilter).toArray();

    // Fetch Main Cashbook entries
    const cashbookEntries = await mongoose.connection.useDb("main_cashbook").collection("entries").find(cashbookFilter).toArray();
    
    let cashbookEntry = null;
    if (cashbookEntries.length > 0) {
      cashbookEntry = {
        OPENING_BALANCE: cashbookEntries[0].OPENING_BALANCE || cashbookEntries[0].O_OPENING,
        RECEIVED_AMOUNT: cashbookEntries.reduce((s, e) => s + (parseFloat(String(e.RECEIVED_AMOUNT || e.P_GIVEN_DAC || 0).replace(/,/g, '')) || 0), 0),
        PAYMENT_AMOUNT: cashbookEntries.reduce((s, e) => s + (parseFloat(String(e.PAYMENT_AMOUNT || e.P_WITHDRAW || e.S_EXPENSE || 0).replace(/,/g, '')) || 0), 0)
      };
    }

    // Fetch Advance Summary for the relevant dates
    let advanceSummary = null;
    if (isoDateStrings.length > 0) {
      const advSummaries = await mongoose.connection.useDb("invoiceAI").collection("daily_advances")
        .find({ date: { $in: isoDateStrings } })
        .sort({ date: 1 })
        .toArray();

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
      const hasFuel = parseFloat(String(e["HSD (LTR)"] || "0")) > 0 || !!e["HSD SLIP NO"] || parseFloat(String(e["HSD AMOUNT"] || "0").replace(/,/g, '')) > 0;
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
