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

// Helper to parse numbers
const parseNum = (v) => {
  if (v === undefined || v === null || v === '') return 0;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};

// Helper to parse date string into timestamp for chronological sorting & matching
const parseDateToMs = (dStr) => {
  if (!dStr) return 0;
  const s = String(dStr).trim();

  // YYYY-MM-DD format
  if (/^\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}$/.test(s)) {
    const parts = s.split(/[\/\-\.]/);
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    return new Date(year, month, day).getTime();
  }

  // DD-MM-YYYY or D-M-YYYY format
  const parts = s.split(/[\/\-\.]/);
  if (parts.length === 3) {
    let day = parseInt(parts[0], 10);
    let month = parseInt(parts[1], 10) - 1;
    let year = parseInt(parts[2], 10);
    if (year < 100) year += 2000;
    return new Date(year, month, day).getTime();
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? 0 : d.getTime();
};

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
      // Scope down to exact month/year if passed
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

    // ── MAIN CASHBOOK DYNAMIC COMPUTATION (Source of Truth) ──────────────────
    const allCashbookEntries = await mongoose.connection.useDb("main_cashbook").collection("entries").find({}).toArray();

    allCashbookEntries.sort((a, b) => {
      const tA = parseDateToMs(a.DATE);
      const tB = parseDateToMs(b.DATE);
      if (tA === tB) return (parseNum(a['SL NO']) || 0) - (parseNum(b['SL NO']) || 0);
      return tA - tB;
    });

    let prevSClosing = 0;
    let prevPClosing = 0;
    let prevOClosing = 0;

    const computedCashbookRows = [];
    for (let i = 0; i < allCashbookEntries.length; i++) {
      const e = allCashbookEntries[i];
      const dateMs = parseDateToMs(e.DATE);

      const pOpen = (e.P_OPENING !== undefined && e.P_OPENING !== '') ? parseNum(e.P_OPENING) : prevPClosing;
      const sOpen = (e.S_OPENING !== undefined && e.S_OPENING !== '') ? parseNum(e.S_OPENING) : prevSClosing;
      const oOpen = (e.O_OPENING !== undefined && e.O_OPENING !== '') ? parseNum(e.O_OPENING) : prevOClosing;

      const pWith = parseNum(e.P_WITHDRAW);
      const pDac = parseNum(e.P_GIVEN_DAC);
      const pOff = parseNum(e.P_GIVEN_OFFICE);
      const pOth = parseNum(e.P_OTHERS);
      const pClose = (pOpen + pWith) - pDac - pOff - pOth;

      const sTransOff = parseNum(e.S_TRANS_OFFICE);
      const sExp = parseNum(e.S_EXPENSE);
      const sClose = (sOpen + pDac + sTransOff) - sExp;

      const sTransToOff = parseNum(e.S_TRANS_TO_OFFICE);
      const oExp = parseNum(e.O_EXPENSE);
      const oClose = (oOpen + pOff + sTransToOff) - oExp;

      computedCashbookRows.push({
        DATE: e.DATE,
        dateMs,
        month: e.month,
        year: e.year,
        pDac,
        sExp,
        oExp,
        miscExp: sExp + oExp,
        sOpen,
        sClose,
        pOpen,
        pClose,
        oOpen,
        oClose
      });

      prevPClosing = pClose;
      prevSClosing = sClose;
      prevOClosing = oClose;
    }

    let cashReceivedDAC = 0;
    let openingBalance = 0;
    let miscExpenses = 0;

    if (date === 'ALL') {
      const monthRows = computedCashbookRows.filter(r => r.month === monthInt && r.year === yearInt);
      if (monthRows.length > 0) {
        cashReceivedDAC = monthRows.reduce((s, r) => s + r.pDac, 0);
        miscExpenses = monthRows.reduce((s, r) => s + r.miscExp, 0);
        openingBalance = monthRows[0].sOpen;
      }
    } else {
      const targetMs = parseDateToMs(date);
      const todayRows = computedCashbookRows.filter(r => r.dateMs === targetMs);

      if (todayRows.length > 0) {
        cashReceivedDAC = todayRows.reduce((s, r) => s + r.pDac, 0);
        miscExpenses = todayRows.reduce((s, r) => s + r.miscExp, 0);
        openingBalance = todayRows[0].sOpen;
      } else {
        const priorRows = computedCashbookRows.filter(r => r.dateMs < targetMs);
        if (priorRows.length > 0) {
          const lastPriorRow = priorRows[priorRows.length - 1];
          openingBalance = lastPriorRow.sClose;
        }
      }
    }

    const mainCashbookData = {
      cashReceivedDAC,
      openingBalance,
      miscExpenses,
      date
    };

    let cashbookEntry = null;
    const cashbookEntries = computedCashbookRows.filter(r => date === 'ALL' ? (r.month === monthInt && r.year === yearInt) : (r.dateMs === parseDateToMs(date)));
    if (cashbookEntries.length > 0) {
      cashbookEntry = {
        OPENING_BALANCE: openingBalance,
        RECEIVED_AMOUNT: cashReceivedDAC,
        PAYMENT_AMOUNT: miscExpenses
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
      advanceSummary,
      mainCashbookData
    });

  } catch (err) {
    console.error("[DailySummary] fetch error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

router.post("/extend-eway-validity", auth, async (req, res) => {
  try {
    const { extensions } = req.body;
    if (!Array.isArray(extensions) || extensions.length === 0) {
      return res.status(400).json({ success: false, error: "No extensions provided" });
    }

    const col = getCementCol();
    let updatedCount = 0;

    for (const item of extensions) {
      const { id, invoiceNo, ewayBillNo, vehicleNo, extendedValidityDate } = item;
      if (!extendedValidityDate) continue;

      const trimmedDate = String(extendedValidityDate).trim();
      if (!trimmedDate) continue;

      let filter = null;
      if (id && mongoose.Types.ObjectId.isValid(id)) {
        filter = { $or: [{ _id: id }, { _id: new mongoose.Types.ObjectId(id) }] };
      } else if (id && typeof id === 'string' && id.length > 5 && !id.includes('_')) {
        filter = { _id: id };
      } else {
        const conds = {};
        if (invoiceNo) conds["$or"] = [{ "INVOICE NO": invoiceNo }, { "INVOICE NO.": invoiceNo }];
        if (ewayBillNo) conds["E-WAY BILL NO"] = ewayBillNo;
        if (vehicleNo) conds["$or"] = [{ "VEHICLE NUMBER": vehicleNo }, { "VEHICLE NO": vehicleNo }, { "VEHICLE NO.": vehicleNo }];
        filter = conds;
      }

      if (!filter || Object.keys(filter).length === 0) continue;

      const resUpdate = await col.updateOne(filter, {
        $set: {
          "EXTENDED E-WAY BILL VALIDITY": trimmedDate,
          "extendedValidityDate": trimmedDate,
          "updatedAt": new Date()
        }
      });

      if (resUpdate.modifiedCount > 0 || resUpdate.matchedCount > 0) {
        updatedCount++;
      }
    }

    const io = req.app.get("io");
    if (io) {
      io.emit("cementUpdates", { action: "ewayValidityExtended", count: updatedCount });
    }

    return res.json({
      success: true,
      message: `E-Way Bill validity extended successfully for ${updatedCount} record(s).`,
      count: updatedCount
    });
  } catch (err) {
    console.error("[DailySummary] extend-eway-validity error:", err);
    return res.status(500).json({ success: false, error: err.message || "Failed to extend E-Way Bill validity" });
  }
});

module.exports = router;


