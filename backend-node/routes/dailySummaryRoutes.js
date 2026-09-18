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

// ── GET /daily-summary/revenue-nvl-nvcl ──────────────────────────────────────────────
// ── GET /daily-summary/revenue-nvl-nvcl ──────────────────────────────────────────────
router.get("/revenue-nvl-nvcl", auth, async (req, res) => {
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

    const fyShortYear = String(startYear).slice(-2);
    const fyStr = `${startYear}-${startYear + 1}`;

    // 2. Determine target month and year
    let targetMonthName = month && month !== "ALL" ? month : "September";
    let mIdx = MONTH_NAMES.findIndex(name => name.toLowerCase() === String(targetMonthName).toLowerCase());
    if (mIdx === -1) mIdx = 8; // September by default (0-indexed: 8 is September)
    const mNum = mIdx + 1; // 1-12
    const targetYear = mNum >= 4 ? startYear : startYear + 1;

    // Days in this month dynamically (handles leap years e.g. Feb 28/29, 30, 31)
    const daysInMonth = new Date(targetYear, mNum, 0).getDate();

    // 3. Fetch Billed Revenue from Bill Register single source of truth
    const { rows: billRows = [], payments = [] } = await getBillRegisterData({ fy: fyStr });

    const gstCol = mongoose.connection.useDb("gst_portal").collection("entries");
    const submittedGstBills = await gstCol.find({ type: "gstr1" }, { projection: { sourceBillId: 1 } }).toArray();
    const submittedBillSet = new Set(submittedGstBills.map(g => String(g.sourceBillId)));

    // 4. Fetch Unbilled Revenue from Cement Register
    const cementCol = getCementCol();
    const unbilledEntries = await cementCol.find({
      "CHALLAN STATUS": { $not: /^BILLED$/i }
    }).toArray();

    // Pre-organize bills by exact calendar day string "YYYY-MM-DD"
    const billsByDay = {};
    billRows.forEach(r => {
      const bDate = parseDate(r.invoiceDate);
      if (!bDate) return;
      if (bDate.getFullYear() === targetYear && bDate.getMonth() === mIdx) {
        const day = bDate.getDate();
        if (!billsByDay[day]) billsByDay[day] = [];
        billsByDay[day].push(r);
      }
    });

    // Pre-organize payments by paymentDate
    const paymentsByDay = {};
    payments.forEach(p => {
      if (!p.paymentDate) return;
      const pDate = parseDate(p.paymentDate);
      if (!pDate) return;
      if (pDate.getFullYear() === targetYear && pDate.getMonth() === mIdx) {
        const day = pDate.getDate();
        if (!paymentsByDay[day]) paymentsByDay[day] = [];
        paymentsByDay[day].push(p);
      }
    });

    // Pre-organize unbilled cement entries by exact loading date
    const unbilledByDay = {};
    unbilledEntries.forEach(entry => {
      const dateVal = entry["LOADING DT"] || entry["LOADING DATE"] || entry["BILL DATE"] || "";
      const dObj = parseDate(dateVal);
      if (!dObj) return;
      if (dObj.getFullYear() === targetYear && dObj.getMonth() === mIdx) {
        const day = dObj.getDate();
        if (!unbilledByDay[day]) unbilledByDay[day] = [];
        unbilledByDay[day].push(entry);
      }
    });

    // 5. Build Day-by-Day report
    const days = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dStr = String(d).padStart(2, "0");
      const mStr = String(mNum).padStart(2, "0");
      const dateKey = `${dStr}-${mStr}-${targetYear}`;

      const dayResult = {
        date: dateKey,
        day: d,
        NVL: {
          billedRevenue: 0,
          billedSubmitted: 0,
          paymentReceived: 0,
          revisedBilledRevenue: 0,
          stampNotBilled: 0,
          nonStampNotBilled: 0,
          challanNotReceived: 0,
          total: 0
        },
        NVCL: {
          billedRevenue: 0,
          billedSubmitted: 0,
          paymentReceived: 0,
          revisedBilledRevenue: 0,
          stampNotBilled: 0,
          nonStampNotBilled: 0,
          challanNotReceived: 0,
          total: 0
        },
        TOTAL: {
          billedRevenue: 0,
          billedSubmitted: 0,
          paymentReceived: 0,
          revisedBilledRevenue: 0,
          stampNotBilled: 0,
          nonStampNotBilled: 0,
          challanNotReceived: 0,
          total: 0
        }
      };

      // Process bills for this day
      const dayBills = billsByDay[d] || [];
      dayBills.forEach(r => {
        const site = normalizeSite(r.site);
        if (site !== "NVL" && site !== "NVCL") return;

        const amt = Number(r.amount) || 0;
        const debitAmt = Number(r.debitAmount) || 0;
        const payAmt = Number(r.paymentAmount) || 0;

        dayResult[site].billedRevenue += amt;

        const isSubmitted = r.sentToGST || submittedBillSet.has(String(r.invoiceNumber)) || submittedBillSet.has(String(r.billNo));
        if (isSubmitted) {
          dayResult[site].billedSubmitted += amt;
        }

        if (payAmt > 0) {
          dayResult[site].paymentReceived += payAmt;
        }
        dayResult[site].revisedBilledRevenue += (amt - debitAmt);
      });

      // Process payments for this day
      const dayPayments = paymentsByDay[d] || [];
      dayPayments.forEach(p => {
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
          dayResult[site].paymentReceived += pAmt;
        }
      });

      // Process unbilled entries for this day
      const dayUnbilled = unbilledByDay[d] || [];
      dayUnbilled.forEach(entry => {
        let site = normalizeSite(entry.SITE);
        if (site !== "NVL" && site !== "NVCL") return;

        const amt = parseNum(entry["BILLING AMOUNT"] || entry["Billing Amount"] || entry["BILLING ER 95%"] || entry["AMOUNT"] || 0);
        const status = String(entry["CHALLAN STATUS"] || "").toUpperCase().trim();

        if (status === "STAMP") {
          dayResult[site].stampNotBilled += amt;
        } else if (status.includes("NON STAMP") || status.includes("NON-STAMP")) {
          dayResult[site].nonStampNotBilled += amt;
        } else {
          dayResult[site].challanNotReceived += amt;
        }
      });

      // Compute site totals and round
      ["NVL", "NVCL"].forEach(site => {
        dayResult[site].total = Math.round(
          (dayResult[site].revisedBilledRevenue || 0) +
          (dayResult[site].stampNotBilled || 0) +
          (dayResult[site].nonStampNotBilled || 0) +
          (dayResult[site].challanNotReceived || 0)
        );
        dayResult[site].billedRevenue = Math.round(dayResult[site].billedRevenue);
        dayResult[site].billedSubmitted = Math.round(dayResult[site].billedSubmitted);
        dayResult[site].paymentReceived = Math.round(dayResult[site].paymentReceived);
        dayResult[site].revisedBilledRevenue = Math.round(dayResult[site].revisedBilledRevenue);
        dayResult[site].stampNotBilled = Math.round(dayResult[site].stampNotBilled);
        dayResult[site].nonStampNotBilled = Math.round(dayResult[site].nonStampNotBilled);
        dayResult[site].challanNotReceived = Math.round(dayResult[site].challanNotReceived);
      });

      // Compute Day TOTAL row (NVL + NVCL)
      dayResult.TOTAL = {
        billedRevenue: dayResult.NVL.billedRevenue + dayResult.NVCL.billedRevenue,
        billedSubmitted: dayResult.NVL.billedSubmitted + dayResult.NVCL.billedSubmitted,
        paymentReceived: dayResult.NVL.paymentReceived + dayResult.NVCL.paymentReceived,
        revisedBilledRevenue: dayResult.NVL.revisedBilledRevenue + dayResult.NVCL.revisedBilledRevenue,
        stampNotBilled: dayResult.NVL.stampNotBilled + dayResult.NVCL.stampNotBilled,
        nonStampNotBilled: dayResult.NVL.nonStampNotBilled + dayResult.NVCL.nonStampNotBilled,
        challanNotReceived: dayResult.NVL.challanNotReceived + dayResult.NVCL.challanNotReceived,
        total: dayResult.NVL.total + dayResult.NVCL.total
      };

      days.push(dayResult);
    }

    // 6. Compute Month Grand Total
    const monthTotal = {
      NVL: {
        billedRevenue: 0,
        billedSubmitted: 0,
        paymentReceived: 0,
        revisedBilledRevenue: 0,
        stampNotBilled: 0,
        nonStampNotBilled: 0,
        challanNotReceived: 0,
        total: 0
      },
      NVCL: {
        billedRevenue: 0,
        billedSubmitted: 0,
        paymentReceived: 0,
        revisedBilledRevenue: 0,
        stampNotBilled: 0,
        nonStampNotBilled: 0,
        challanNotReceived: 0,
        total: 0
      },
      TOTAL: {
        billedRevenue: 0,
        billedSubmitted: 0,
        paymentReceived: 0,
        revisedBilledRevenue: 0,
        stampNotBilled: 0,
        nonStampNotBilled: 0,
        challanNotReceived: 0,
        total: 0
      }
    };

    days.forEach(day => {
      ["NVL", "NVCL", "TOTAL"].forEach(cat => {
        monthTotal[cat].billedRevenue += day[cat].billedRevenue;
        monthTotal[cat].billedSubmitted += day[cat].billedSubmitted;
        monthTotal[cat].paymentReceived += day[cat].paymentReceived;
        monthTotal[cat].revisedBilledRevenue += day[cat].revisedBilledRevenue;
        monthTotal[cat].stampNotBilled += day[cat].stampNotBilled;
        monthTotal[cat].nonStampNotBilled += day[cat].nonStampNotBilled;
        monthTotal[cat].challanNotReceived += day[cat].challanNotReceived;
        monthTotal[cat].total += day[cat].total;
      });
    });

    // Format selected date display and handle single date vs full month mode
    let returnedDays = days;
    let selectedDateDisplay = `${targetMonthName} ${targetYear}`;

    if (date && date !== "ALL") {
      let targetDay = null;
      const parsed = parseDate(date);
      if (parsed) {
        targetDay = parsed.getDate();
      } else {
        const dNum = parseInt(date, 10);
        if (!isNaN(dNum)) targetDay = dNum;
      }

      if (targetDay !== null) {
        returnedDays = days.filter(d => d.day === targetDay);
        if (returnedDays.length > 0) {
          selectedDateDisplay = returnedDays[0].date;
        } else {
          selectedDateDisplay = date;
        }
      } else {
        selectedDateDisplay = date;
      }
    } else {
      const lastDayStr = String(daysInMonth).padStart(2, "0");
      const mStr = String(mNum).padStart(2, "0");
      selectedDateDisplay = `${lastDayStr}-${mStr}-${targetYear}`;
    }

    return res.json({
      success: true,
      fy: fyStr,
      month: targetMonthName,
      year: targetYear,
      daysCount: daysInMonth,
      selectedDate: selectedDateDisplay,
      days: returnedDays,
      allDays: days,
      monthTotal,
      data: returnedDays.length === 1 ? returnedDays[0] : monthTotal
    });

  } catch (err) {
    console.error("[DailySummary] /revenue-nvl-nvcl error:", err);
    return res.status(500).json({ success: false, error: err.message || "Failed to calculate revenue" });
  }
});

module.exports = router;


