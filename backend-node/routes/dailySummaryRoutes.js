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


