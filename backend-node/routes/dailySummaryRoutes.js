const express = require("express");
const mongoose = require("mongoose");
const auth = require("../middleware/authMiddleware");

const router = express.Router();
const Invoice = require("../models/Invoice");
const { getBillRegisterData, parseDate, normalizeSite, MONTH_NAMES } = require("../utils/billRegisterHelper");

function getCementCol() {
  return mongoose.connection.useDb("cement_register").collection("entries");
}

function getDatePatterns(dateStr) {
  if (!dateStr) return [];
  const s = String(dateStr).trim();
  const parts = s.split(/[\/\-\.]/);
  if (parts.length !== 3) return [s];

  let y, m, d;
  if (parts[0].length === 4) {
    // YYYY-MM-DD
    y = parts[0];
    m = parts[1];
    d = parts[2];
  } else {
    // DD-MM-YYYY
    d = parts[0];
    m = parts[1];
    y = parts[2];
    if (y.length === 2) y = (parseInt(y, 10) >= 70 ? '19' : '20') + y;
  }

  const mm = String(parseInt(m, 10)).padStart(2, '0');
  const mSingle = String(parseInt(m, 10));
  const dd = String(parseInt(d, 10)).padStart(2, '0');
  const dSample = String(parseInt(d, 10));
  const yShort = y.slice(-2);

  const patterns = [
    `${dd}-${mm}-${y}`,
    `${dSample}-${mSingle}-${y}`,
    `${dd}/${mm}/${y}`,
    `${dSample}/${mSingle}/${y}`,
    `${dd}.${mm}.${y}`,
    `${dSample}.${mSingle}.${y}`,
    `${dd}-${mm}-${yShort}`,
    `${dSample}-${mSingle}-${yShort}`,
    `${dd}/${mm}/${yShort}`,
    `${dSample}/${mSingle}/${yShort}`,
    `${dd}.${mm}.${yShort}`,
    `${dSample}.${mSingle}.${yShort}`,
    `${y}-${mm}-${dd}`
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

function parseDateToCalendar(dVal) {
  if (!dVal) return null;
  if (dVal instanceof Date) {
    if (isNaN(dVal.getTime())) return null;
    return {
      year: dVal.getFullYear(),
      month: dVal.getMonth() + 1,
      day: dVal.getDate(),
      timeMs: new Date(dVal.getFullYear(), dVal.getMonth(), dVal.getDate()).getTime()
    };
  }
  const s = String(dVal).trim();
  if (!s || s === '-' || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') return null;

  if (/^\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}/.test(s)) {
    const parts = s.split(/[\/\-\.T ]/);
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      return { year: y, month: m, day: d, timeMs: new Date(y, m - 1, d).getTime() };
    }
  }
  const parts = s.split(/[\/\-\.]/);
  if (parts.length === 3) {
    let d = parseInt(parts[0], 10);
    let m = parseInt(parts[1], 10);
    let y = parseInt(parts[2], 10);
    if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
      if (y < 100) y += 2000;
      return { year: y, month: m, day: d, timeMs: new Date(y, m - 1, d).getTime() };
    }
  }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return {
      year: parsed.getFullYear(),
      month: parsed.getMonth() + 1,
      day: parsed.getDate(),
      timeMs: new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime()
    };
  }
  return null;
}

// ── GET /daily-summary/pending-challans ───────────────────────────────────────
// Live, database-driven pending challan records from Shipment Register (cement_register)
// from start of current FY (01 April) through YESTERDAY (TODAY - 1 DAY). Excludes completed STAMP and NON-STAMP.
router.get("/pending-challans", auth, async (req, res) => {
  try {
    const col = getCementCol();
    const allEntries = await col.find({}).toArray();

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12
    const currentDay = now.getDate();

    let startYear;
    if (req.query.fy && /^FY\s*\d{4}-\d{2}$/i.test(req.query.fy)) {
      startYear = parseInt(req.query.fy.replace(/\D/g, '').substring(0, 4), 10);
    } else {
      startYear = currentMonth < 4 ? currentYear - 1 : currentYear;
    }
    const endYear = startYear + 1;

    const fyStart = new Date(startYear, 3, 1, 0, 0, 0, 0); // 1 April startYear
    const fyEnd = new Date(endYear, 2, 31, 23, 59, 59, 999); // 31 March endYear
    const yesterdayEnd = new Date(currentYear, currentMonth - 1, currentDay - 1, 23, 59, 59, 999);

    const reportEnd = yesterdayEnd.getTime() < fyEnd.getTime() ? yesterdayEnd : fyEnd;
    const fyStartMs = fyStart.getTime();
    const reportEndMs = reportEnd.getTime();

    const pendingRecords = [];
    let totalBillingAmount = 0;

    for (const record of allEntries) {
      // 1. Challan Status Rule: PENDING only when NOT STAMP and NOT NON-STAMP
      const status = String(record["CHALLAN STATUS"] || "").toUpperCase().trim();
      const isCompleted = status === "STAMP" || status === "NON-STAMP" || status === "NON STAMP";
      if (isCompleted) {
        continue;
      }

      // 2. Authoritative Loading Date from record
      const rawDate = record["LOADING DT"] || record["LOADING DATE"] || record["BILL DATE"] || record["DATE"];
      const dateObj = parseDateToCalendar(rawDate);
      if (!dateObj) {
        continue;
      }

      // 3. Date filter: Loading Date >= FY_START and Loading Date <= YESTERDAY (MIN(FY_END, TODAY - 1))
      if (dateObj.timeMs < fyStartMs || dateObj.timeMs > reportEndMs) {
        continue;
      }

      const bAmt = parseNum(record["Billing Amount"] ?? record["BILLING AMOUNT"] ?? record["AMOUNT"]);
      totalBillingAmount += bAmt;

      pendingRecords.push(record);
    }

    // Chronological order by Loading Date
    pendingRecords.sort((a, b) => {
      const dateA = parseDateToCalendar(a["LOADING DT"] || a["LOADING DATE"] || a["BILL DATE"] || a["DATE"])?.timeMs || 0;
      const dateB = parseDateToCalendar(b["LOADING DT"] || b["LOADING DATE"] || b["BILL DATE"] || b["DATE"])?.timeMs || 0;
      if (dateA !== dateB) return dateA - dateB;
      const invA = String(a["INVOICE NO"] || a["INVOICE NO."] || "");
      const invB = String(b["INVOICE NO"] || b["INVOICE NO."] || "");
      return invA.localeCompare(invB);
    });

    res.json({
      success: true,
      fy: `FY ${startYear}-${String(endYear).substring(2)}`,
      count: pendingRecords.length,
      totalBillingAmount,
      records: pendingRecords
    });
  } catch (err) {
    console.error("[DailySummary] pending-challans error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /daily-summary/alerts-ytd ───────────────────────────────────────────
// Live database-driven Year-To-Till-Date (YTD) alerts:
// 1. CHALLAN STATUS PENDING: FY START -> YESTERDAY (TODAY - 1 DAY)
// 2. STAMP BILLS: FY START -> TODAY
// 3. NON-STAMP BILLS: FY START -> TODAY
// 4. STAMP BUT NON-BILLED: FY START -> TODAY (Tabs: ALL, FREIGHT, UNLOADING)
router.get("/alerts-ytd", auth, async (req, res) => {
  try {
    const col = getCementCol();
    const allEntries = await col.find({}).toArray();

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12
    const currentDay = now.getDate();

    let startYear;
    if (req.query.fy && /^FY\s*\d{4}-\d{2}$/i.test(req.query.fy)) {
      startYear = parseInt(req.query.fy.replace(/\D/g, '').substring(0, 4), 10);
    } else {
      startYear = currentMonth < 4 ? currentYear - 1 : currentYear;
    }
    const endYear = startYear + 1;

    const fyStart = new Date(startYear, 3, 1, 0, 0, 0, 0); // 1 April startYear
    const fyEnd = new Date(endYear, 2, 31, 23, 59, 59, 999); // 31 March endYear
    const todayEnd = new Date(currentYear, currentMonth - 1, currentDay, 23, 59, 59, 999);
    const yesterdayEnd = new Date(currentYear, currentMonth - 1, currentDay - 1, 23, 59, 59, 999);

    const reportEndToday = todayEnd.getTime() < fyEnd.getTime() ? todayEnd : fyEnd;
    const reportEndPending = yesterdayEnd.getTime() < fyEnd.getTime() ? yesterdayEnd : fyEnd;

    const fyStartMs = fyStart.getTime();
    const reportEndTodayMs = reportEndToday.getTime();
    const reportEndPendingMs = reportEndPending.getTime();

    const pendingRecords = [];
    const stampRecords = [];
    const nonStampRecords = [];
    const stampNonBilledAll = [];
    const stampNonBilledFreight = [];
    const stampNonBilledUnloading = [];
    const stampNonBilledTotal = [];

    for (const record of allEntries) {
      // 1. Authoritative Loading Date from record
      const rawDate = record["LOADING DT"] || record["LOADING DATE"] || record["BILL DATE"] || record["DATE"];
      const dateObj = parseDateToCalendar(rawDate);
      if (!dateObj) continue;

      const t = dateObj.timeMs;
      // Exclude records outside current FY start
      if (t < fyStartMs) continue;

      const status = String(record["CHALLAN STATUS"] || "").toUpperCase().trim();
      const isStamp = status === "STAMP";
      const isNonStamp = status.includes("NON-STAMP") || status.includes("NON STAMP");

      // 1. Pending Challan: neither STAMP nor NON-STAMP, date range = FY START -> YESTERDAY
      if (!isStamp && !isNonStamp) {
        if (t <= reportEndPendingMs) {
          pendingRecords.push(record);
        }
      }

      // For STAMP, NON-STAMP, and STAMP BUT NON-BILLED: date range = FY START -> TODAY
      if (t <= reportEndTodayMs) {
        // 2. STAMP Bills
        if (isStamp) {
          stampRecords.push(record);
        }

        // 3. NON-STAMP Bills
        if (isNonStamp) {
          nonStampRecords.push(record);
        }

        // 4. STAMP BUT NON-BILLED (STAMP only)
        if (isStamp) {
          const freightBillNo = String(record["BILL NO"] || record["BILL NUMBER"] || record["FREIGHT BILL NO"] || record["Freight Bill No"] || record.freightBillNo || "").trim();
          const hasFreight = freightBillNo !== "" && freightBillNo !== "-" && freightBillNo.toLowerCase() !== "null" && freightBillNo.toLowerCase() !== "undefined";

          const unloadingBillNo = String(record["UNLOADING BILL NO"] || record["UNLOADING BILL NUMBER"] || record["Unloading Bill No"] || record.unloadingBillNo || "").trim();
          const hasUnloading = unloadingBillNo !== "" && unloadingBillNo !== "-" && unloadingBillNo.toLowerCase() !== "null" && unloadingBillNo.toLowerCase() !== "undefined";

          // Exclude fully billed (both exist)
          if (!hasFreight || !hasUnloading) {
            stampNonBilledTotal.push(record);

            // ALL: both missing
            if (!hasFreight && !hasUnloading) {
              stampNonBilledAll.push(record);
            }
            // FREIGHT: freight missing
            if (!hasFreight) {
              stampNonBilledFreight.push(record);
            }
            // UNLOADING: unloading missing
            if (!hasUnloading) {
              stampNonBilledUnloading.push(record);
            }
          }
        }
      }
    }

    const sortFn = (a, b) => {
      const dateA = parseDateToCalendar(a["LOADING DT"] || a["LOADING DATE"] || a["BILL DATE"] || a["DATE"])?.timeMs || 0;
      const dateB = parseDateToCalendar(b["LOADING DT"] || b["LOADING DATE"] || b["BILL DATE"] || b["DATE"])?.timeMs || 0;
      if (dateA !== dateB) return dateA - dateB;
      const invA = String(a["INVOICE NO"] || a["INVOICE NO."] || "");
      const invB = String(b["INVOICE NO"] || b["INVOICE NO."] || "");
      return invA.localeCompare(invB);
    };

    res.json({
      success: true,
      fy: `FY ${startYear}-${String(endYear).substring(2)}`,
      ytdRange: {
        start: `01-04-${startYear}`,
        end: `${String(currentDay).padStart(2, '0')}-${String(currentMonth).padStart(2, '0')}-${currentYear}`
      },
      pending: {
        count: pendingRecords.length,
        records: pendingRecords.sort(sortFn)
      },
      stamp: {
        count: stampRecords.length,
        records: stampRecords.sort(sortFn)
      },
      nonStamp: {
        count: nonStampRecords.length,
        records: nonStampRecords.sort(sortFn)
      },
      stampNonBilled: {
        count: stampNonBilledTotal.length,
        all: stampNonBilledAll.sort(sortFn),
        freight: stampNonBilledFreight.sort(sortFn),
        unloading: stampNonBilledUnloading.sort(sortFn)
      }
    });
  } catch (err) {
    console.error("[DailySummary] alerts-ytd error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

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

router.all("/extend-eway-validity", auth, async (req, res) => {
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
      if (id) {
        try {
          const objId = mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;
          filter = { $or: [{ _id: objId }, { _id: String(id) }] };
        } catch (e) {
          filter = { _id: id };
        }
      }
      if (!filter) {
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
          "E-WAY BILL VALIDITY": trimmedDate,
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
      count: updatedCount,
      modifiedCount: updatedCount
    });
  } catch (err) {
    console.error("[DailySummary] extend-eway-validity error:", err);
    return res.status(500).json({ success: false, error: err.message || "Failed to extend E-Way Bill validity" });
  }
});

// ── GET /daily-summary/vehicle-trip-summary ──────────────────────────────────────────
// Single Source of Truth: Cement Register (cement_register.entries)
router.get("/vehicle-trip-summary", auth, async (req, res) => {
  try {
    const { date, fy, month } = req.query;

    // 1. Determine Financial Year bounds
    let startYear = 2026;
    if (fy && fy !== "ALL") {
      const parts = String(fy).replace(/^FY\s*/i, "").split("-");
      let sy = parseInt(parts[0], 10);
      if (sy < 100) sy += 2000;
      if (!isNaN(sy)) startYear = sy;
    } else if (date && date !== "ALL") {
      const dParts = String(date).split(/[\/\-\.]/);
      if (dParts.length === 3) {
        let yr = parseInt(dParts[0], 10);
        let mo = parseInt(dParts[1], 10);
        if (dParts[0].length <= 2 && dParts[2].length >= 4) {
          yr = parseInt(dParts[2], 10);
          mo = parseInt(dParts[1], 10);
        }
        startYear = mo >= 4 ? yr : yr - 1;
      }
    }

    const monthNamesArray = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    let targetMonthName = month && month !== "ALL" ? month : "September";
    let mIdx = monthNamesArray.findIndex(m => m.toLowerCase() === String(targetMonthName).toLowerCase());
    if (mIdx === -1) mIdx = 8; // default September
    const monthInt = mIdx + 1; // 1-12
    const targetYear = mIdx < 3 ? startYear + 1 : startYear;
    const daysInMonth = new Date(targetYear, monthInt, 0).getDate();

    // 2. Build filter for Cement Register
    let cementFilter = {};
    if (date && date !== "ALL") {
      const patterns = getDatePatterns(date);
      if (monthInt && targetYear) {
        cementFilter = {
          $and: [
            {
              $or: [
                { "LOADING DT": { $in: patterns } },
                { "LOADING DATE": { $in: patterns } }
              ]
            },
            {
              $or: [
                { month: { $in: [monthInt, String(monthInt)] }, year: { $in: [targetYear, String(targetYear)] } },
                { month: { $exists: false } },
                { month: null }
              ]
            }
          ]
        };
      } else {
        cementFilter = {
          $or: [
            { "LOADING DT": { $in: patterns } },
            { "LOADING DATE": { $in: patterns } }
          ]
        };
      }
    } else {
      cementFilter = {
        $or: [
          { month: monthInt, year: targetYear },
          { month: String(monthInt), year: String(targetYear) }
        ]
      };
    }

    const col = getCementCol();
    const rawDocs = await col.find(cementFilter).toArray();

    // 3. Truck Contacts Master lookup for owner/type fallback
    let truckContactMap = {};
    try {
      const contactsCol = mongoose.connection.useDb("lorrey").collection("truck_contacts");
      const contacts = await contactsCol.find({}).toArray();
      contacts.forEach(c => {
        const rawNo = c["Truck No "] || c["Truck No"] || c.truck_no || "";
        const key = String(rawNo).replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
        if (key) {
          truckContactMap[key] = {
            vehType: (c["Type of vehicle "] || c["Type of vehicle"] || c.veh_type || "").trim(),
            custType: (c["TYPE OF CUSTOMER "] || c.cust_type || "").trim(),
            owner: (c["Owner Name "] || c["Owner Name"] || c.owner_name || "").trim()
          };
        }
      });
    } catch (e) {
      console.warn("[dailySummary] truck_contacts lookup error:", e.message);
    }

    // 4. Process and deduplicate records strictly by unique MongoDB _id
    const seenTripIds = new Set();
    const vehMap = {};
    const daysArray = [];
    for (let i = 1; i <= daysInMonth; i++) {
      daysArray.push(String(i).padStart(2, "0"));
    }

    rawDocs.forEach(row => {
      const id = String(row._id);
      if (seenTripIds.has(id)) return;
      seenTripIds.add(id);

      const rawVeh = row["VEHICLE NUMBER"] || row["VEHICLE NO"] || row["VEHICLE NO."] || "";
      const vehClean = String(rawVeh).trim().toUpperCase();
      const normKey = vehClean.replace(/[^A-Z0-9]/g, "");
      // Skip empty or dummy rows (e.g. non-vehicle strings < 5 characters)
      if (!normKey || normKey.length < 5) return;

      const mtVal = parseNum(row["MT"]);
      const billAmt = parseNum(row["Billing Amount"] || row["BILLING AMOUNT"] || row["AMOUNT"]);
      const invNo = String(row["INVOICE NO"] || row["INVOICE NO."] || "").trim();
      const advVal = parseNum(row["ADVANCE"] || row["LOADING ADVANCE"]);
      const hsdLtr = parseNum(row["HSD (LTR)"] || row["QTY (LTR)"]);
      const hsdAmt = parseNum(row["HSD AMOUNT"]);

      // Exclude pure adjustment / diesel deduction rows with no MT, no amount, and no invoice
      if (mtVal === 0 && billAmt === 0 && !invNo) return;

      const loadDateRaw = row["LOADING DT"] || row["LOADING DATE"] || "";
      let dayNum = null;
      if (loadDateRaw) {
        const parts = String(loadDateRaw).trim().split(/[\/\-\.]/);
        if (parts.length === 3) {
          if (parts[0].length === 4) {
            dayNum = parseInt(parts[2], 10);
          } else {
            dayNum = parseInt(parts[0], 10);
          }
        }
      }

      if (!vehMap[normKey]) {
        const contact = truckContactMap[normKey] || {};
        let rawWheel = String(row["WHEEL"] || contact.vehType || "").trim().toUpperCase();
        let wheelKey = "OTHER";
        if (rawWheel.includes("10")) wheelKey = "10W";
        else if (rawWheel.includes("12")) wheelKey = "12W";
        else if (rawWheel.includes("14")) wheelKey = "14W";
        else if (rawWheel.includes("6")) wheelKey = "6W";

        const rawDedicated = String(row["DEDICATED"] || "").trim();
        const billType = String(row["Bill Type"] || row["BILL TYPE"] || "").trim().toUpperCase();
        const custType = String(contact.custType || "").toUpperCase();
        const hasDedicatedAmt = rawDedicated && rawDedicated !== "-" && parseNum(rawDedicated) > 0;
        const isDedicatedType = billType === "NT" || custType === "ATOA" || custType === "ATO" || custType === "DEDICATED";

        // Standard MT capacity mapping: 6W -> 13 MT, 10W -> 19 MT, 12W -> 25 MT, 14W -> 30 MT
        let standardCapMT = 0;
        let formattedWheelType = rawWheel || "OTHER";
        if (wheelKey === "6W" || rawWheel.includes("6")) {
          standardCapMT = 13;
          formattedWheelType = "6-Wheel";
        } else if (wheelKey === "10W" || rawWheel.includes("10")) {
          standardCapMT = 19;
          formattedWheelType = "10-Wheel";
        } else if (wheelKey === "12W" || rawWheel.includes("12")) {
          standardCapMT = 25;
          formattedWheelType = "12-Wheel";
        } else if (wheelKey === "14W" || rawWheel.includes("14")) {
          standardCapMT = 30;
          formattedWheelType = "14-Wheel";
        }

        vehMap[normKey] = {
          vehicleNo: vehClean,
          normKey,
          wheel: formattedWheelType,
          wheelType: formattedWheelType,
          wheelPattern: wheelKey,
          capacityMT: standardCapMT,
          capacity: standardCapMT > 0 ? `${standardCapMT} MT` : "-",
          isDedicatedInitial: Boolean(hasDedicatedAmt || isDedicatedType),
          contactOwner: (row["OWNER NAME"] || contact.owner || "").trim(),
          distinctMTs: new Set(),
          dailyMT: {},
          dailyTrips: {},
          dailyTripDocs: {},
          totalRawInvoices: 0,
          totalMT: 0,
          totalTrips: 0,
          totalAdvance: 0,
          totalBillingAmt: 0,
          totalDieselLtr: 0,
          totalDieselAmt: 0,
          trips: []
        };
      }

      const v = vehMap[normKey];
      if (mtVal > 0) {
        v.distinctMTs.add(mtVal);
        v.totalMT += mtVal;
      }
      v.totalAdvance += advVal;
      v.totalBillingAmt += billAmt;
      v.totalDieselLtr += hsdLtr;
      v.totalDieselAmt += hsdAmt;
      v.trips.push(row);
      v.totalRawInvoices += 1;

      if (dayNum !== null && dayNum >= 1 && dayNum <= daysInMonth) {
        const dayStr = String(dayNum).padStart(2, "0");
        v.dailyMT[dayStr] = (v.dailyMT[dayStr] || 0) + mtVal;
        if (!v.dailyTripDocs[dayStr]) v.dailyTripDocs[dayStr] = [];
        v.dailyTripDocs[dayStr].push(row);
      }
    });

    // 5. Finalize vehicle patterns, date-wise trip counts (Date MT / Capacity), and totals
    const vehicleList = Object.values(vehMap).map(v => {
      const mtArray = Array.from(v.distinctMTs).sort((a, b) => a - b);
      let loadingPatternStr = "";
      if (mtArray.length > 0) {
        loadingPatternStr = mtArray.map(m => `${m}MT`).join(" / ");
      } else {
        if (v.wheelPattern === "10W") loadingPatternStr = "19MT";
        else if (v.wheelPattern === "12W") loadingPatternStr = "25MT";
        else if (v.wheelPattern === "14W") loadingPatternStr = "30MT";
        else if (v.wheelPattern === "6W") loadingPatternStr = "13MT";
        else loadingPatternStr = "-";
      }

      const standardCap = v.capacityMT > 0 ? v.capacityMT : 0;
      const totalLoadedMT = Math.round(v.totalMT * 100) / 100;

      // Date-Wise Trip Count Calculation: TRIP COUNT = TOTAL MT LOADED ON THAT DATE / VEHICLE MT CAPACITY
      const computedDailyTrips = {};
      const computedDailyMT = {};
      daysArray.forEach(dayStr => {
        const dayMT = Math.round((v.dailyMT[dayStr] || 0) * 100) / 100;
        computedDailyMT[dayStr] = dayMT;
        if (dayMT > 0) {
          if (standardCap > 0) {
            const rawTrips = dayMT / standardCap;
            computedDailyTrips[dayStr] = Math.round(rawTrips * 100) / 100;
          } else {
            computedDailyTrips[dayStr] = (v.dailyTripDocs[dayStr] || []).length;
          }
        } else {
          computedDailyTrips[dayStr] = 0;
        }
      });

      // Overall Trip Count: Total MT / Capacity
      let calculatedTotalTrips = 0;
      if (standardCap > 0) {
        const rawTotalTrips = totalLoadedMT / standardCap;
        calculatedTotalTrips = Math.round(rawTotalTrips * 100) / 100;
      } else {
        calculatedTotalTrips = v.totalRawInvoices;
      }

      const meetsRaftarThreshold = (v.wheelPattern === "10W" && calculatedTotalTrips >= 8) ||
        ((v.wheelPattern === "12W" || v.wheelPattern === "14W") && calculatedTotalTrips >= 6);
      const isDedicated = v.isDedicatedInitial || meetsRaftarThreshold;

      return {
        ...v,
        capacityMT: standardCap,
        capacity: standardCap > 0 ? `${standardCap} MT` : "-",
        distinctMTs: Array.from(v.distinctMTs),
        totalMT: totalLoadedMT,
        totalTrips: calculatedTotalTrips,
        dailyMT: computedDailyMT,
        dailyTrips: computedDailyTrips,
        totalAdvance: Math.round(v.totalAdvance * 100) / 100,
        totalBillingAmt: Math.round(v.totalBillingAmt * 100) / 100,
        totalDieselLtr: Math.round(v.totalDieselLtr * 100) / 100,
        totalDieselAmt: Math.round(v.totalDieselAmt * 100) / 100,
        loadingPattern: loadingPatternStr,
        isDedicated,
        meetsRaftarThreshold,
        classification: isDedicated ? "DEDICATED (Both Side)" : "SINGLE SIDE (Non-Dedicated)"
      };
    });

    // Sort stably: 10W -> 12W -> 14W -> 6W -> OTHER, then alphabetical
    const patternSortOrder = { "10W": 1, "12W": 2, "14W": 3, "6W": 4, "OTHER": 5 };
    vehicleList.sort((a, b) => {
      const pA = patternSortOrder[a.wheelPattern] || 99;
      const pB = patternSortOrder[b.wheelPattern] || 99;
      if (pA !== pB) return pA - pB;
      return a.vehicleNo.localeCompare(b.vehicleNo);
    });

    const byPattern = { "10W": [], "12W": [], "14W": [], "6W": [], "OTHER": [] };
    vehicleList.forEach(v => {
      if (byPattern[v.wheelPattern]) byPattern[v.wheelPattern].push(v);
      else byPattern["OTHER"].push(v);
    });

    const dayTotals = {};
    const dayMTTotals = {};
    daysArray.forEach(d => {
      dayTotals[d] = 0;
      dayMTTotals[d] = 0;
    });
    let grandTotalTrips = 0;
    let grandTotalMT = 0;
    let grandTotalAdvance = 0;

    vehicleList.forEach(v => {
      grandTotalTrips += v.totalTrips;
      grandTotalMT += v.totalMT;
      grandTotalAdvance += v.totalAdvance;
      daysArray.forEach(d => {
        dayTotals[d] = Math.round((dayTotals[d] + (v.dailyTrips[d] || 0)) * 100) / 100;
        dayMTTotals[d] = Math.round((dayMTTotals[d] + (v.dailyMT[d] || 0)) * 100) / 100;
      });
    });

    return res.json({
      success: true,
      fy: fy || `FY ${startYear}-${String(startYear + 1).slice(-2)}`,
      month: targetMonthName,
      year: targetYear,
      totalDays: daysInMonth,
      daysArray,
      selectedDate: date || "ALL",
      vehicles: vehicleList,
      byPattern,
      totals: {
        totalVehicles: vehicleList.length,
        totalTrips: Math.round(grandTotalTrips * 100) / 100,
        totalMT: Math.round(grandTotalMT * 100) / 100,
        totalAdvance: Math.round(grandTotalAdvance * 100) / 100,
        dayTotals,
        dayMTTotals
      }
    });

  } catch (err) {
    console.error("[DailySummary] /vehicle-trip-summary error:", err);
    return res.status(500).json({ success: false, error: err.message || "Failed to generate vehicle trip summary" });
  }
});

// Helper to fetch all registered vehicles from Owner Details MongoDB & Truck Contacts
async function getAllRegisteredVehicles() {
  const combinedMap = new Map();
  try {
    const ownerCol = mongoose.connection.useDb("invoice_system").collection("owner details");
    const truckCol = mongoose.connection.useDb("invoice_system").collection("Truck Contact Number");
    const lorreyTruckCol = mongoose.connection.useDb("lorrey").collection("truck_contacts");

    const ownerDocs = await ownerCol.find({}).toArray();
    const truckDocs = await truckCol.find({}).toArray();
    let lorreyDocs = [];
    try {
      lorreyDocs = await lorreyTruckCol.find({}).toArray();
    } catch (e) {}

    // 1. Primary: owner details
    for (const doc of ownerDocs) {
      const rawNo = (doc["Truck No"] || doc["Truck No "] || doc.truck_no || doc._id.toString()).toString().trim().toUpperCase();
      const normKey = rawNo.replace(/[^A-Z0-9]/g, "");
      if (normKey && normKey.length >= 5) {
        combinedMap.set(normKey, {
          vehicleNo: rawNo,
          normKey,
          ownerName: (doc["Owner Name"] || doc["Owner Name "] || doc.owner_name || doc.owner || "").trim(),
          wheel: (doc["Type of vehicle"] || doc["Type of vehicle "] || doc.veh_type || doc.wheel || "").trim()
        });
      }
    }

    // 2. Secondary: invoice_system "Truck Contact Number"
    for (const doc of truckDocs) {
      const rawNo = (doc.truck_no || doc["Truck No "] || doc["Truck No"] || doc._id.toString()).toString().trim().toUpperCase();
      const normKey = rawNo.replace(/[^A-Z0-9]/g, "");
      if (normKey && normKey.length >= 5 && !combinedMap.has(normKey)) {
        combinedMap.set(normKey, {
          vehicleNo: rawNo,
          normKey,
          ownerName: (doc["Owner Name "] || doc["Owner Name"] || doc.owner_name || doc.owner || "").trim(),
          wheel: (doc["Type of vehicle "] || doc["Type of vehicle"] || doc.veh_type || doc.wheel || "").trim()
        });
      }
    }

    // 3. Fallback: lorrey "truck_contacts"
    for (const doc of lorreyDocs) {
      const rawNo = (doc["Truck No "] || doc["Truck No"] || doc.truck_no || "").toString().trim().toUpperCase();
      const normKey = rawNo.replace(/[^A-Z0-9]/g, "");
      if (normKey && normKey.length >= 5 && !combinedMap.has(normKey)) {
        combinedMap.set(normKey, {
          vehicleNo: rawNo,
          normKey,
          ownerName: (doc["Owner Name "] || doc["Owner Name"] || doc.owner_name || doc.owner || "").trim(),
          wheel: (doc["Type of vehicle "] || doc["Type of vehicle"] || doc.veh_type || doc.wheel || "").trim()
        });
      }
    }
  } catch (err) {
    console.error("[getAllRegisteredVehicles] Error:", err);
  }
  return Array.from(combinedMap.values());
}

// ── GET /daily-summary/six-trip-alerts ───────────────────────────────────────
// Alert: SIX TRIP NOT COMPLETE
// Evaluates every registered vehicle from Owner Details MongoDB for Day 1 to Day 25.
// Triggers ONLY after the 25th of the month (IF TODAY >= 25).
router.get("/six-trip-alerts", auth, async (req, res) => {
  try {
    const { fy, month } = req.query;

    const now = new Date();
    const currentDay = now.getDate();
    const currentYear = now.getFullYear();
    const currentMonthIdx = now.getMonth(); // 0-11

    // Determine financial year start
    let startYear = 2026;
    if (fy && /^FY\s*\d{4}-\d{2}$/i.test(fy)) {
      startYear = parseInt(fy.replace(/\D/g, '').substring(0, 4), 10);
    } else {
      startYear = currentMonthIdx < 3 ? currentYear - 1 : currentYear;
    }

    const monthNamesArray = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const monthShortNames = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];

    let targetMonthName = month && month !== "ALL" ? month : monthNamesArray[currentMonthIdx];
    let mIdx = monthNamesArray.findIndex(m => m.toLowerCase() === String(targetMonthName).toLowerCase());
    if (mIdx === -1) mIdx = currentMonthIdx;

    const monthInt = mIdx + 1; // 1-12
    const targetYear = mIdx < 3 ? startYear + 1 : startYear;

    // Check if target month is in future, current, or past
    const isFuture = (targetYear > currentYear) || (targetYear === currentYear && mIdx > currentMonthIdx);
    const isCurrentMonth = (targetYear === currentYear && mIdx === currentMonthIdx);
    const isPastMonth = (targetYear < currentYear) || (targetYear === currentYear && mIdx < currentMonthIdx);

    // Rule: IF TODAY < 25 for current month, or future month, DO NOT SHOW ALERT
    if (isFuture || (isCurrentMonth && currentDay < 25)) {
      return res.json({
        success: true,
        isApplicable: false,
        month: monthNamesArray[mIdx],
        monthShort: `${monthShortNames[mIdx]}-${targetYear}`,
        monthFullName: `${monthNamesArray[mIdx]} ${targetYear}`,
        year: targetYear,
        evaluationPeriod: `01-${String(monthInt).padStart(2, '0')}-${targetYear} to 25-${String(monthInt).padStart(2, '0')}-${targetYear}`,
        count: 0,
        records: []
      });
    }

    // 1. Fetch registered vehicles
    const registeredVehicles = await getAllRegisteredVehicles();

    // 2. Fetch cement register records
    const cementCol = getCementCol();
    const rawDocs = await cementCol.find({
      $or: [
        { month: monthInt, year: targetYear },
        { month: String(monthInt), year: String(targetYear) },
        { month: { $exists: false } },
        { month: null }
      ]
    }).toArray();

    // Group trips for Day 1 to Day 25 strictly by vehicle
    const tripsByVeh = {};
    const seenTripIds = new Set();

    rawDocs.forEach(row => {
      const id = String(row._id);
      if (seenTripIds.has(id)) return;
      seenTripIds.add(id);

      const rawVeh = row["VEHICLE NUMBER"] || row["VEHICLE NO"] || row["VEHICLE NO."] || "";
      const normKey = String(rawVeh).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!normKey || normKey.length < 5) return;

      const mtVal = parseNum(row["MT"]);
      const billAmt = parseNum(row["Billing Amount"] || row["BILLING AMOUNT"] || row["AMOUNT"]);
      const invNo = String(row["INVOICE NO"] || row["INVOICE NO."] || "").trim();

      // Exclude adjustment rows with no MT, no amount, and no invoice
      if (mtVal === 0 && billAmt === 0 && !invNo) return;

      const loadDateRaw = row["LOADING DT"] || row["LOADING DATE"] || row["BILL DATE"] || row["DATE"] || "";
      const dObj = parseDateToCalendar(loadDateRaw);
      if (!dObj) return;

      // Verify exact target month and year
      if (dObj.year !== targetYear || dObj.month !== monthInt) return;

      // Strictly evaluate ONLY Day 1 through Day 25!
      if (dObj.day < 1 || dObj.day > 25) return;

      if (!tripsByVeh[normKey]) {
        tripsByVeh[normKey] = {
          totalMT: 0,
          rawInvoices: 0,
          trips: []
        };
      }

      if (mtVal > 0) {
        tripsByVeh[normKey].totalMT += mtVal;
      }
      tripsByVeh[normKey].rawInvoices += 1;
      tripsByVeh[normKey].trips.push(row);
    });

    // 3. Evaluate each registered vehicle
    const failedVehicles = [];

    registeredVehicles.forEach(v => {
      let standardCap = 0;
      const rawWheel = String(v.wheel || "").toUpperCase();
      if (rawWheel.includes("6")) standardCap = 13;
      else if (rawWheel.includes("10")) standardCap = 19;
      else if (rawWheel.includes("12")) standardCap = 25;
      else if (rawWheel.includes("14")) standardCap = 30;

      const vehTripData = tripsByVeh[v.normKey];
      let tripCount = 0;
      let totalMT = 0;

      if (vehTripData) {
        totalMT = Math.round(vehTripData.totalMT * 100) / 100;
        if (standardCap > 0) {
          tripCount = Math.round((totalMT / standardCap) * 100) / 100;
        } else {
          tripCount = vehTripData.rawInvoices;
        }
      }

      // Check condition: Trips < 6
      if (tripCount < 6) {
        const shortfall = Math.round((6 - tripCount) * 100) / 100;
        failedVehicles.push({
          vehicleNo: v.vehicleNo,
          normKey: v.normKey,
          ownerName: v.ownerName || "Unknown",
          wheel: v.wheel || (standardCap > 0 ? `${standardCap === 13 ? 6 : standardCap === 19 ? 10 : standardCap === 25 ? 12 : 14}-Wheel` : "-"),
          month: `${monthShortNames[mIdx]}-${targetYear}`,
          monthFullName: `${monthNamesArray[mIdx]} ${targetYear}`,
          tripCount,
          requiredTrips: 6,
          shortfall,
          totalMT,
          evaluationPeriod: `01-${String(monthInt).padStart(2, '0')}-${targetYear} to 25-${String(monthInt).padStart(2, '0')}-${targetYear}`
        });
      }
    });

    // Sort failed vehicles by shortfall descending, then vehicle number ascending
    failedVehicles.sort((a, b) => b.shortfall - a.shortfall || a.vehicleNo.localeCompare(b.vehicleNo));

    const recordsWithSl = failedVehicles.map((v, idx) => ({
      slNo: idx + 1,
      ...v
    }));

    return res.json({
      success: true,
      isApplicable: true,
      month: monthNamesArray[mIdx],
      monthShort: `${monthShortNames[mIdx]}-${targetYear}`,
      monthFullName: `${monthNamesArray[mIdx]} ${targetYear}`,
      year: targetYear,
      evaluationPeriod: `01-${String(monthInt).padStart(2, '0')}-${targetYear} to 25-${String(monthInt).padStart(2, '0')}-${targetYear}`,
      count: recordsWithSl.length,
      records: recordsWithSl
    });
  } catch (err) {
    console.error("[DailySummary] /six-trip-alerts error:", err);
    return res.status(500).json({ success: false, error: err.message || "Failed to generate six-trip alerts" });
  }
});

// ── GET /daily-summary/vehicle-not-loaded-alerts ──────────────────────────────
// Live database-driven alert: VEHICLE NOT LOADED
// Evaluates vehicles from CIM/CIMA Register (cement_register entries):
// 1. For each vehicle, find its latest completed unloading record (valid unloading date).
// 2. 3-day turnaround period: waitingPeriodEndDate = unloadingDate + 3 calendar days.
// 3. If a newer invoice/loading record exists for that vehicle with loadingDate >= unloadingDate (different _id):
//    - If it hasn't completed unloading, it's currently loaded -> NO ALERT.
// 4. If no newer invoice/loading record exists, check if TODAY > waitingPeriodEndDate:
//    - If today <= waitingPeriodEndDate -> NO ALERT (within allowed 3-day turnaround).
//    - If today > waitingPeriodEndDate -> ALERT (Vehicle not loaded).
//    - Days since eligible: difference in calendar days from waitingPeriodEndDate to TODAY.
router.get("/vehicle-not-loaded-alerts", auth, async (req, res) => {
  try {
    const registeredVehicles = await getAllRegisteredVehicles();
    const regVehMap = new Map();
    registeredVehicles.forEach(v => {
      regVehMap.set(v.normKey, v);
    });

    const cementCol = getCementCol();
    const allEntries = await cementCol.find({}, {
      projection: {
        _id: 1,
        "VEHICLE NUMBER": 1,
        "VEHICLE NO": 1,
        "VEHICLE NO.": 1,
        "UNLOADING STATUS": 1,
        "RECEIVING DATE": 1,
        "UNLOADING DATE": 1,
        "RECEIVING DT": 1,
        "UNLOADING DT": 1,
        "unloadingStatus": 1,
        "receivingDate": 1,
        "unloadingDate": 1,
        "UNLOADING_STATUS": 1,
        "RECEIVING_DATE": 1,
        "UNLOADING_DATE": 1,
        "LOADING DT": 1,
        "LOADING DATE": 1,
        "BILL DATE": 1,
        "INVOICE DATE": 1,
        "DATE": 1,
        "loadingDate": 1,
        "INVOICE NO": 1,
        "INVOICE NO.": 1,
        "BILL NO": 1,
        "BILL NUMBER": 1,
        "OWNER NAME": 1,
        "PARTY NAME": 1
      }
    }).toArray();

    // Group records by vehicle (normKey)
    const recordsByVeh = new Map();

    const getUnloadDate = (row) => {
      const unloadingRaw = String(
        row["UNLOADING STATUS"] ||
        row["RECEIVING DATE"] ||
        row["UNLOADING DATE"] ||
        row["RECEIVING DT"] ||
        row["UNLOADING DT"] ||
        row["unloadingStatus"] ||
        row["receivingDate"] ||
        row["unloadingDate"] ||
        row["UNLOADING_STATUS"] ||
        row["RECEIVING_DATE"] ||
        row["UNLOADING_DATE"] ||
        ""
      ).trim();

      if (!unloadingRaw || unloadingRaw === "-" || unloadingRaw.toLowerCase() === "null" || unloadingRaw.toLowerCase() === "undefined") {
        return null;
      }
      return parseDateToCalendar(unloadingRaw);
    };

    const getLoadDate = (row) => {
      const loadDateRaw = String(
        row["LOADING DT"] ||
        row["LOADING DATE"] ||
        row["BILL DATE"] ||
        row["INVOICE DATE"] ||
        row["RECEIVING DATE"] ||
        row["DATE"] ||
        row["loadingDate"] ||
        ""
      ).trim();

      if (!loadDateRaw || loadDateRaw === "-" || loadDateRaw.toLowerCase() === "null" || loadDateRaw.toLowerCase() === "undefined") {
        return null;
      }
      return parseDateToCalendar(loadDateRaw);
    };

    for (const row of allEntries) {
      const rawVeh = row["VEHICLE NUMBER"] || row["VEHICLE NO"] || row["VEHICLE NO."] || row.vehicleNo || "";
      const normKey = String(rawVeh).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!normKey || normKey.length < 5) continue;

      if (!recordsByVeh.has(normKey)) {
        const reg = regVehMap.get(normKey);
        recordsByVeh.set(normKey, {
          vehicleNo: reg?.vehicleNo || String(rawVeh).trim().toUpperCase(),
          normKey,
          ownerName: reg?.ownerName || (row["OWNER NAME"] || row["PARTY NAME"] || "").trim(),
          records: []
        });
      }

      const vehGroup = recordsByVeh.get(normKey);
      if (!vehGroup.ownerName && (row["OWNER NAME"] || row["PARTY NAME"])) {
        vehGroup.ownerName = (row["OWNER NAME"] || row["PARTY NAME"]).trim();
      }

      const uDate = getUnloadDate(row);
      const lDate = getLoadDate(row);

      vehGroup.records.push({
        _id: String(row._id),
        unloadingDate: uDate,
        loadingDate: lDate,
        raw: row
      });
    }

    const now = new Date();
    const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const formattedToday = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;

    const failedVehicles = [];

    for (const vehGroup of recordsByVeh.values()) {
      // 1. Find completed unloading records
      const completedUnloads = vehGroup.records.filter(r => r.unloadingDate !== null);
      if (completedUnloads.length === 0) continue;

      // 2. Latest completed unloading event (highest timeMs)
      completedUnloads.sort((a, b) => b.unloadingDate.timeMs - a.unloadingDate.timeMs);
      const latestUnloadRecord = completedUnloads[0];
      const latestUnloadDate = latestUnloadRecord.unloadingDate;

      // 3. Check if there is a NEW loading/invoice record for the SAME vehicle after that unloading event
      // Record must have unique MongoDB ID and loadingDate >= latestUnloadDate.timeMs
      const newerLoadingRecords = vehGroup.records.filter(r =>
        r._id !== latestUnloadRecord._id &&
        r.loadingDate !== null &&
        r.loadingDate.timeMs >= latestUnloadDate.timeMs
      );

      // If a newer loading record exists and has not completed unloading, or is loaded, vehicle is considered loaded
      if (newerLoadingRecords.length > 0) {
        continue;
      }

      // 4. Calculate 3-day turnaround period
      // Example: Unloading 01-09 -> Waiting period end = 04-09 (01 + 3 days)
      const uY = latestUnloadDate.year;
      const uM = latestUnloadDate.month;
      const uD = latestUnloadDate.day;

      const waitingPeriodEndDate = new Date(uY, uM - 1, uD + 3);
      const waitingEndYear = waitingPeriodEndDate.getFullYear();
      const waitingEndMonth = waitingPeriodEndDate.getMonth() + 1;
      const waitingEndDay = waitingPeriodEndDate.getDate();
      const waitingEndMs = new Date(waitingEndYear, waitingEndMonth - 1, waitingEndDay).getTime();

      // Rule: Vehicle must NOT be alerted during allowed 3-day period (todayMs <= waitingEndMs)
      if (todayMs <= waitingEndMs) {
        continue;
      }

      // From day AFTER 3-day period onward (todayMs > waitingEndMs) -> Show VEHICLE NOT LOADED alert
      const daysSinceEligible = Math.max(1, Math.round((todayMs - waitingEndMs) / (24 * 60 * 60 * 1000)));

      const formattedUnloadDate = `${String(uD).padStart(2, '0')}-${String(uM).padStart(2, '0')}-${uY}`;
      const formattedWaitingEndDate = `${String(waitingEndDay).padStart(2, '0')}-${String(waitingEndMonth).padStart(2, '0')}-${waitingEndYear}`;

      failedVehicles.push({
        vehicleNo: vehGroup.vehicleNo,
        normKey: vehGroup.normKey,
        ownerName: vehGroup.ownerName || '—',
        lastUnloadingDate: formattedUnloadDate,
        waitingPeriodEndDate: formattedWaitingEndDate,
        today: formattedToday,
        daysSinceEligible,
        lastInvoiceLoadingDate: '—',
        status: 'NOT LOADED',
        daysSinceEligibleNum: daysSinceEligible
      });
    }

    // Sort failed vehicles by daysSinceEligible descending, then vehicle number ascending
    failedVehicles.sort((a, b) => b.daysSinceEligibleNum - a.daysSinceEligibleNum || a.vehicleNo.localeCompare(b.vehicleNo));

    const recordsWithSl = failedVehicles.map((v, idx) => ({
      slNo: idx + 1,
      ...v
    }));

    return res.json({
      success: true,
      today: formattedToday,
      count: recordsWithSl.length,
      records: recordsWithSl
    });

  } catch (err) {
    console.error("[DailySummary] /vehicle-not-loaded-alerts error:", err);
    return res.status(500).json({ success: false, error: err.message || "Failed to generate vehicle not loaded alerts" });
  }
});

// ── GET /daily-summary/revenue-nvl-nvcl ──────────────────────────────────────────────
// Live database-driven Financial Year Consolidated Summary for NVL, NVCL, and TOTAL
router.get("/revenue-nvl-nvcl", auth, async (req, res) => {
  try {
    const { fy } = req.query;

    // 1. Determine Financial Year bounds
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    let startYear;
    if (fy && /^FY\s*\d{4}-\d{2}$/i.test(fy)) {
      startYear = parseInt(fy.replace(/\D/g, '').substring(0, 4), 10);
    } else {
      startYear = currentMonth < 4 ? currentYear - 1 : currentYear;
    }
    const endYear = startYear + 1;
    const fyStr = `${startYear}-${endYear}`;

    // 2. Financial Year date range (01 April -> 31 March)
    const fyStart = new Date(startYear, 3, 1, 0, 0, 0, 0); // 01-04-startYear
    const fyEnd = new Date(endYear, 2, 31, 23, 59, 59, 999); // 31-03-endYear
    const todayEnd = new Date(currentYear, currentMonth - 1, now.getDate(), 23, 59, 59, 999);

    // For current/future FY: FY start through TODAY (no future records).
    // For past/completed FY: full FY (through 31 March).
    const cutoffDate = todayEnd.getTime() < fyEnd.getTime() ? todayEnd : fyEnd;
    const fyStartMs = fyStart.getTime();
    const cutoffMs = cutoffDate.getTime();

    const formattedStartDate = `01-04-${startYear}`;
    const formattedEndDate = `${String(cutoffDate.getDate()).padStart(2, '0')}-${String(cutoffDate.getMonth() + 1).padStart(2, '0')}-${cutoffDate.getFullYear()}`;
    const selectedPeriodDisplay = `${formattedStartDate} to ${formattedEndDate}`;

    // 3. Fetch Billed Revenue from Bill Register single source of truth
    const { rows: billRows = [], payments = [] } = await getBillRegisterData({ fy: fyStr });

    const gstCol = mongoose.connection.useDb("gst_portal").collection("entries");
    const submittedGstBills = await gstCol.find({ type: "gstr1" }, { projection: { sourceBillId: 1 } }).toArray();
    const submittedBillSet = new Set(submittedGstBills.map(g => String(g.sourceBillId)));

    // 4. Initialize Summary Dimensions
    const summary = {
      NVL: {
        site: "NVL",
        billedRevenue: 0,
        billedSubmitted: 0,
        paymentReceived: 0,
        revisedBilledRevenue: 0
      },
      NVCL: {
        site: "NVCL",
        billedRevenue: 0,
        billedSubmitted: 0,
        paymentReceived: 0,
        revisedBilledRevenue: 0
      },
      TOTAL: {
        site: "TOTAL",
        billedRevenue: 0,
        billedSubmitted: 0,
        paymentReceived: 0,
        revisedBilledRevenue: 0
      }
    };

    // 5. Aggregate billRows by Site
    billRows.forEach(r => {
      const bDate = parseDate(r.invoiceDate);
      if (!bDate) return;
      const t = bDate.getTime();
      if (t < fyStartMs || t > cutoffMs) return;

      const site = normalizeSite(r.site);
      if (site !== "NVL" && site !== "NVCL") return;

      const amt = Number(r.amount) || 0;
      const debitAmt = Number(r.debitAmount) || 0;
      const payAmt = Number(r.paymentAmount) || 0;

      summary[site].billedRevenue += amt;

      const isSubmitted = r.sentToGST || submittedBillSet.has(String(r.invoiceNumber)) || submittedBillSet.has(String(r.billNo));
      if (isSubmitted) {
        summary[site].billedSubmitted += amt;
      }

      if (payAmt > 0) {
        summary[site].paymentReceived += payAmt;
      }
      summary[site].revisedBilledRevenue += (amt - debitAmt);
    });

    // 6. Aggregate payments by Site
    payments.forEach(p => {
      if (!p.paymentDate) return;
      const pDate = parseDate(p.paymentDate);
      if (!pDate) return;
      const t = pDate.getTime();
      if (t < fyStartMs || t > cutoffMs) return;

      const pAmt = Number(p.paymentAmount) || 0;
      if (pAmt <= 0) return;

      let site = null;
      if (p.billNos && p.billNos.length > 0) {
        const matchingBill = billRows.find(b => p.billNos.includes(String(b.invoiceNumber)) || p.billNos.includes(String(b.billNo)));
        if (matchingBill) {
          site = normalizeSite(matchingBill.site);
        }
      }
      if (site === "NVL" || site === "NVCL") {
        summary[site].paymentReceived += pAmt;
      }
    });

    // 7. Round numeric values
    ["NVL", "NVCL"].forEach(site => {
      summary[site].billedRevenue = Math.round(summary[site].billedRevenue);
      summary[site].billedSubmitted = Math.round(summary[site].billedSubmitted);
      summary[site].paymentReceived = Math.round(summary[site].paymentReceived);
      summary[site].revisedBilledRevenue = Math.round(summary[site].revisedBilledRevenue);
    });

    // 8. Compute TOTAL = NVL + NVCL
    summary.TOTAL = {
      site: "TOTAL",
      billedRevenue: summary.NVL.billedRevenue + summary.NVCL.billedRevenue,
      billedSubmitted: summary.NVL.billedSubmitted + summary.NVCL.billedSubmitted,
      paymentReceived: summary.NVL.paymentReceived + summary.NVCL.paymentReceived,
      revisedBilledRevenue: summary.NVL.revisedBilledRevenue + summary.NVCL.revisedBilledRevenue
    };

    const rows = [
      summary.NVL,
      summary.NVCL,
      summary.TOTAL
    ];

    return res.json({
      success: true,
      fy: `FY ${startYear}-${String(endYear).slice(-2)}`,
      period: {
        start: formattedStartDate,
        end: formattedEndDate,
        display: selectedPeriodDisplay
      },
      selectedDate: selectedPeriodDisplay,
      summary,
      rows,
      data: summary
    });

  } catch (err) {
    console.error("[DailySummary] /revenue-nvl-nvcl error:", err);
    return res.status(500).json({ success: false, error: err.message || "Failed to calculate revenue summary" });
  }
});

module.exports = router;


