const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const moment = require("moment");
const AccountDetail = require("../models/AccountDetail");
const { getBillRegisterData } = require("../utils/billRegisterHelper");

const MONTHS = [
  "January", "February", "March", "April", "May", "June", 
  "July", "August", "September", "October", "November", "December"
];

// Helper database getters
const getCementCol = () => mongoose.connection.useDb("cement_register").collection("entries");
const getBillRegisterCol = () => mongoose.connection.useDb("cement_register").collection("generated_bills");
const getMainCashCol = () => mongoose.connection.useDb("main_cashbook").collection("entries");
const getPumpPaymentCol = () => mongoose.connection.useDb("pump_payment_register").collection("records");

// Parse any date string or Date object into YYYY-MM-DD safely without timezone shifts
function parseToYYYYMMDD(dStr) {
  if (!dStr && dStr !== 0) return null;
  if (dStr instanceof Date) {
    if (isNaN(dStr.getTime())) return null;
    const y = dStr.getFullYear();
    const m = String(dStr.getMonth() + 1).padStart(2, '0');
    const d = String(dStr.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const rawStr = String(dStr).trim();
  if (!rawStr) return null;
  const clean = rawStr.replace(/\s+\d{1,2}:\d{2}(:\d{2})?.*$/, '').replace(/T\d{2}:\d{2}.*$/, '').trim();

  // Excel serial number
  if (/^\d{5}(\.\d+)?$/.test(clean) || (typeof dStr === 'number' && dStr >= 1000 && dStr <= 100000)) {
    const excelDays = typeof dStr === 'number' ? dStr : parseFloat(clean);
    const msPerDay = 86400 * 1000;
    const epochMs = Date.UTC(1899, 11, 30);
    const date = new Date(epochMs + Math.round(excelDays * msPerDay));
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
  const ddmmyyyy = clean.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (ddmmyyyy) {
    let d = parseInt(ddmmyyyy[1], 10), m = parseInt(ddmmyyyy[2], 10), y = parseInt(ddmmyyyy[3], 10);
    if (y < 100) y += 2000;
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // YYYY-MM-DD
  const yyyymmdd = clean.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (yyyymmdd) {
    let y = parseInt(yyyymmdd[1], 10), m = parseInt(yyyymmdd[2], 10), d = parseInt(yyyymmdd[3], 10);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // DD-MMM-YYYY (e.g., 25-Sep-2026, 1-Aug-2025)
  const ddmmmyyyy = clean.match(/^(\d{1,2})[\/\-\.\s]([A-Za-z]+)[\/\-\.\s](\d{2,4})$/);
  if (ddmmmyyyy) {
    const d = parseInt(ddmmmyyyy[1], 10);
    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const mIdx = monthNames.indexOf(ddmmmyyyy[2].toLowerCase().slice(0, 3));
    let y = parseInt(ddmmmyyyy[3], 10);
    if (y < 100) y += 2000;
    if (mIdx >= 0 && d >= 1 && d <= 31) {
      return `${y}-${String(mIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  const mObj = moment(clean);
  if (mObj.isValid()) {
    return mObj.format('YYYY-MM-DD');
  }

  return null;
}

function parseFY(fyStr) {
  if (!fyStr) {
    const now = new Date();
    const m = now.getMonth();
    const y = now.getFullYear();
    const startYear = m >= 3 ? y : y - 1;
    return { startYear, endYear: startYear + 1 };
  }
  const m = String(fyStr).match(/(\d{4})/);
  if (m) {
    const startYear = parseInt(m[1], 10);
    return { startYear, endYear: startYear + 1 };
  }
  const now = new Date();
  const month = now.getMonth();
  const y = now.getFullYear();
  const startYear = month >= 3 ? y : y - 1;
  return { startYear, endYear: startYear + 1 };
}

function getDateRange(period, financialYearStr, monthStr, dateStr) {
  const now = moment();
  const today = now.format('YYYY-MM-DD');

  if (period === 'TODAY') {
    return { start: today, end: today };
  }

  const { startYear, endYear } = parseFY(financialYearStr);

  if (period === 'YEARLY') {
    const start = `${startYear}-04-01`;
    const end = `${endYear}-03-31`;
    return { start, end };
  }

  if (period === 'MONTHLY' || period === 'WEEKLY') {
    const monthIndex = MONTHS.indexOf(monthStr);
    const targetMonthIndex = monthIndex >= 0 ? monthIndex : now.month();
    const targetYear = targetMonthIndex >= 3 ? startYear : endYear;

    let startObj, endObj;
    if (dateStr && dateStr.toUpperCase() !== "ALL") {
      const specificDate = parseInt(dateStr, 10);
      if (!isNaN(specificDate) && specificDate >= 1 && specificDate <= 31) {
        startObj = moment(`${targetYear}-${String(targetMonthIndex + 1).padStart(2, '0')}-${String(specificDate).padStart(2, '0')}`, 'YYYY-MM-DD');
        endObj = startObj.clone();
      }
    }

    if (!startObj) {
      startObj = moment(`${targetYear}-${String(targetMonthIndex + 1).padStart(2, '0')}-01`, 'YYYY-MM-DD');
      endObj = startObj.clone().endOf('month');
    }

    return {
      start: startObj.format('YYYY-MM-DD'),
      end: endObj.format('YYYY-MM-DD')
    };
  }

  return { start: today, end: today };
}

// Master Analytics Query Engine
async function fetchChartData(ledgerName, dateRange, period) {
  const cleanLedger = String(ledgerName || '').trim().toLowerCase();
  const records = [];

  if (cleanLedger === 'loading advance' || cleanLedger === 'tonage' || cleanLedger === 'freight billing' || cleanLedger === 'bill & unbilled') {
    const cementCol = getCementCol();
    const allCement = await cementCol.find({}).toArray();

    allCement.forEach(doc => {
      const rawDate = doc["LOADING DT"] || doc["LOADING DATE"] || doc["BILL DATE"] || doc["RECEIVING DATE"];
      const isoDate = parseToYYYYMMDD(rawDate);
      if (!isoDate || isoDate < dateRange.start || isoDate > dateRange.end) return;

      let amount = 0;
      let category = isoDate;

      if (cleanLedger === 'loading advance') {
        amount = parseFloat(String(doc["ADVANCE"] || 0).replace(/,/g, '')) || 0;
      } else if (cleanLedger === 'tonage') {
        amount = parseFloat(String(doc["MT"] || doc["TONNAGE"] || 0).replace(/,/g, '')) || 0;
      } else if (cleanLedger === 'freight billing') {
        amount = parseFloat(String(doc["Billing Amount"] || doc["BILLING ER 95%"] || doc["AMOUNT"] || 0).replace(/,/g, '')) || 0;
      } else if (cleanLedger === 'bill & unbilled') {
        const freightBill = String(doc["BILL NO"] || doc["FREIGHT BILL NO"] || doc["Freight Bill No"] || '').trim();
        const unloadingBill = String(doc["UNLOADING BILL NO"] || doc["Unloading Bill No"] || '').trim();

        const hasFreight = freightBill && freightBill !== '-';
        const hasUnloading = unloadingBill && unloadingBill !== '-';

        if (hasFreight && hasUnloading) category = "Completed / Billed";
        else if (!hasFreight && hasUnloading) category = "Freight Unbilled";
        else if (hasFreight && !hasUnloading) category = "Unloading Unbilled";
        else category = "Fully Unbilled";

        amount = parseFloat(String(doc["Billing Amount"] || doc["BILLING ER 95%"] || doc["AMOUNT"] || 0).replace(/,/g, '')) || 0;
      }

      if (amount <= 0 && cleanLedger !== 'bill & unbilled') return;

      records.push({
        id: String(doc._id),
        slNo: doc["SL NO"] || "-",
        date: rawDate || isoDate,
        isoDate: isoDate,
        name: doc["PARTY NAME"] || doc["OWNER NAME"] || "-",
        vehicle: doc["VEHICLE NUMBER"] || "-",
        amount: amount,
        reference: doc["INVOICE NO"] || doc["BILL NO"] || doc["E-WAY BILL NO"] || "-",
        site: doc["SITE"] || "-",
        party: doc["PARTY NAME"] || "-",
        source: "Cement Register",
        category: category,
        details: doc
      });
    });
  } else if (cleanLedger === 'main cash' || cleanLedger === 'office exp') {
    const cashCol = getMainCashCol();
    const allCash = await cashCol.find({}).toArray();

    allCash.forEach(doc => {
      const rawDate = doc["P_DATE"] || doc["O_DATE"] || doc.transactionDate;
      const isoDate = parseToYYYYMMDD(rawDate);
      if (!isoDate || isoDate < dateRange.start || isoDate > dateRange.end) return;

      let amount = 0;
      if (cleanLedger === 'office exp') {
        amount = parseFloat(String(doc["P_EXPENSE"] || doc["P_WITHDRAW"] || 0).replace(/,/g, '')) || 0;
      } else {
        const dep = parseFloat(String(doc["P_DEPOSIT"] || doc["O_TOTAL"] || 0).replace(/,/g, '')) || 0;
        const wd = parseFloat(String(doc["P_WITHDRAW"] || doc["P_EXPENSE"] || 0).replace(/,/g, '')) || 0;
        amount = dep + wd;
      }

      if (amount <= 0) return;

      records.push({
        id: String(doc._id),
        slNo: doc["SL NO"] || "-",
        date: rawDate || isoDate,
        isoDate: isoDate,
        name: doc["P_PARTICULARS"] || doc["O_PARTICULARS"] || "Main Cash Txn",
        vehicle: "-",
        amount: amount,
        reference: doc["P_VOUCHER_NO"] || doc["P_REF"] || "-",
        site: "-",
        party: doc["P_PARTICULARS"] || "-",
        source: "Main Cashbook",
        category: isoDate,
        details: doc
      });
    });

    if (cleanLedger === 'office exp') {
      const acctDocs = await AccountDetail.find({
        ledgerName: { $regex: /^office exp$/i },
        transactionDate: { $gte: dateRange.start, $lte: dateRange.end }
      });
      acctDocs.forEach(doc => {
        const wStr = doc.withdraw ? String(doc.withdraw).replace(/,/g, '').trim() : '';
        const amt = parseFloat(wStr) || 0;
        if (amt <= 0) return;
        records.push({
          id: String(doc._id),
          slNo: "-",
          date: doc.transactionDate,
          isoDate: doc.transactionDate,
          name: doc.names || doc.particulars || "Office Exp",
          vehicle: doc.vehicle || "-",
          amount: amt,
          reference: doc.referenceNo || doc.chequeNo || "-",
          site: "-",
          party: doc.names || "-",
          source: "Bank Book",
          category: doc.transactionDate,
          details: doc
        });
      });
    }
  } else if (cleanLedger === 'pump payment') {
    const pumpCol = getPumpPaymentCol();
    const allPump = await pumpCol.find({}).toArray();

    allPump.forEach(doc => {
      const rawDate = doc["DATE"] || doc["BILL DATE"] || doc.createdAt;
      const isoDate = parseToYYYYMMDD(rawDate);
      if (!isoDate || isoDate < dateRange.start || isoDate > dateRange.end) return;

      const amt = parseFloat(String(doc["PAYMENT AMOUNT"] || doc["PAYABLE AMOUNT"] || doc["BILL AMOUNT"] || 0).replace(/,/g, '')) || 0;
      if (amt <= 0) return;

      records.push({
        id: String(doc._id),
        slNo: doc["SL NO"] || "-",
        date: rawDate || isoDate,
        isoDate: isoDate,
        name: doc["PUMP NAME"] || "Pump Payment",
        vehicle: Array.isArray(doc.vehicleNumbers) ? doc.vehicleNumbers.join(", ") : (doc.vehicleNumbers || "-"),
        amount: amt,
        reference: doc["BILL NO"] || doc["REF. NO"] || "-",
        site: "-",
        party: doc["PUMP NAME"] || "-",
        source: "Pump Payment Register",
        category: isoDate,
        details: doc
      });
    });
  } else {
    // AccountDetail Ledgers
    const ledgerRegex = new RegExp(`^\\s*${ledgerName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\s*$`, 'i');
    const acctDocs = await AccountDetail.find({
      ledgerName: ledgerRegex,
      transactionDate: { $gte: dateRange.start, $lte: dateRange.end }
    });

    acctDocs.forEach(doc => {
      const wStr = doc.withdraw ? String(doc.withdraw).replace(/,/g, '').trim() : '';
      const dStr = doc.deposit ? String(doc.deposit).replace(/,/g, '').trim() : '';
      const w = parseFloat(wStr) || 0;
      const d = parseFloat(dStr) || 0;
      const amt = w + d;

      if (amt <= 0) return;

      records.push({
        id: String(doc._id),
        slNo: "-",
        date: doc.transactionDate,
        isoDate: doc.transactionDate,
        name: doc.names || doc.particulars || ledgerName,
        vehicle: doc.vehicle || "-",
        amount: amt,
        reference: doc.referenceNo || doc.chequeNo || "-",
        site: "-",
        party: doc.names || "-",
        source: "Bank Book",
        category: doc.transactionDate,
        details: doc
      });
    });
  }

  // Calculate Groupings and Aggregations
  let totalAmount = 0;
  const dateMap = {};
  const amounts = [];
  const activeDaysSet = new Set();

  records.forEach(r => {
    totalAmount += r.amount;
    amounts.push(r.amount);
    if (r.isoDate) activeDaysSet.add(r.isoDate);

    let groupKey = r.category;
    if (cleanLedger !== 'bill & unbilled') {
      if (period === 'YEARLY') {
        const mIdx = moment(r.isoDate).month();
        groupKey = MONTHS[mIdx] || r.isoDate;
      } else {
        groupKey = moment(r.isoDate).format('D MMM YYYY');
      }
    }

    if (!dateMap[groupKey]) {
      dateMap[groupKey] = { name: groupKey, value: 0, count: 0, rawDate: r.isoDate };
    }
    dateMap[groupKey].value += r.amount;
    dateMap[groupKey].count += 1;
  });

  let pieData = Object.values(dateMap);
  if (cleanLedger !== 'bill & unbilled') {
    if (period === 'YEARLY') {
      pieData.sort((a, b) => MONTHS.indexOf(a.name) - MONTHS.indexOf(b.name));
    } else {
      pieData.sort((a, b) => moment(a.rawDate).valueOf() - moment(b.rawDate).valueOf());
    }
  }

  // Summary Metrics
  const transactionCount = records.length;
  const avgTransaction = transactionCount > 0 ? totalAmount / transactionCount : 0;
  const highestTransaction = amounts.length > 0 ? Math.max(...amounts) : 0;
  const lowestTransaction = amounts.length > 0 ? Math.min(...amounts) : 0;

  let busiestDate = "N/A";
  let highestSpendingDate = "N/A";
  let maxCount = 0;
  let maxSpend = 0;

  Object.values(dateMap).forEach(item => {
    if (item.count > maxCount) {
      maxCount = item.count;
      busiestDate = item.name;
    }
    if (item.value > maxSpend) {
      maxSpend = item.value;
      highestSpendingDate = item.name;
    }
  });

  return {
    totalAmount,
    transactionCount,
    summary: {
      totalAmount,
      transactionCount,
      avgTransaction,
      highestTransaction,
      lowestTransaction,
      busiestDate,
      highestSpendingDate,
      activeDaysCount: activeDaysSet.size
    },
    pieData: pieData.map(({ name, value, count }) => ({ name, value, count })),
    records
  };
}

// Helper function to resolve exact comparison period date bounds
function resolvePeriodRange(fyStr, periodType, monthStr, weekNum, customDate, isTargetYear = false) {
  const { startYear, endYear } = parseFY(fyStr);
  const now = moment();
  const todayStr = now.format('YYYY-MM-DD');
  const currentCalYear = now.year();
  const currentMonthIdx = now.month(); // 0-11

  const pType = String(periodType || 'MONTHLY').toUpperCase();

  if (pType === 'DAILY' || pType === 'DATE') {
    const raw = customDate ? parseToYYYYMMDD(customDate) : todayStr;
    const resolved = (isTargetYear && raw > todayStr) ? todayStr : (raw || todayStr);
    return {
      start: resolved,
      end: resolved,
      display: moment(resolved, 'YYYY-MM-DD').format('DD-MM-YYYY'),
      headerLabel: moment(resolved, 'YYYY-MM-DD').format('DD-MM-YYYY')
    };
  }

  if (pType === 'WEEKLY') {
    const mIdx = MONTHS.indexOf(monthStr);
    const targetMonthIdx = mIdx >= 0 ? mIdx : currentMonthIdx;
    const targetCalYear = targetMonthIdx >= 3 ? startYear : endYear;
    const mPadded = String(targetMonthIdx + 1).padStart(2, '0');
    const monthStart = moment(`${targetCalYear}-${mPadded}-01`, 'YYYY-MM-DD');
    const daysInMonth = monthStart.daysInMonth();
    
    const w = Math.min(5, Math.max(1, parseInt(weekNum || 1, 10)));
    const startDay = 1 + (w - 1) * 7;
    let endDay = Math.min(daysInMonth, w * 7);
    if (w === 5) {
      endDay = daysInMonth;
    }

    const start = `${targetCalYear}-${mPadded}-${String(startDay).padStart(2, '0')}`;
    let end = `${targetCalYear}-${mPadded}-${String(endDay).padStart(2, '0')}`;

    if (isTargetYear && targetCalYear === currentCalYear && targetMonthIdx === currentMonthIdx) {
      if (todayStr < end) {
        end = todayStr < start ? start : todayStr;
      }
    }

    const monthName = MONTHS[targetMonthIdx] || monthStr;
    return {
      start,
      end,
      weekNum: w,
      display: `${moment(start, 'YYYY-MM-DD').format('DD-MM-YYYY')} to ${moment(end, 'YYYY-MM-DD').format('DD-MM-YYYY')}`,
      headerLabel: `${monthName.toUpperCase()} ${targetCalYear} (WEEK ${w})`
    };
  }

  if (pType === 'MONTHLY' || pType === 'MONTH') {
    const mIdx = MONTHS.indexOf(monthStr);
    const targetMonthIdx = mIdx >= 0 ? mIdx : currentMonthIdx;
    const targetCalYear = targetMonthIdx >= 3 ? startYear : endYear;
    const mPadded = String(targetMonthIdx + 1).padStart(2, '0');
    const start = `${targetCalYear}-${mPadded}-01`;
    const lastDay = moment(start, 'YYYY-MM-DD').endOf('month').format('YYYY-MM-DD');
    let end = lastDay;

    // If TY and current calendar month & year, cap at today so future dates are not included
    if (isTargetYear && targetCalYear === currentCalYear && targetMonthIdx === currentMonthIdx) {
      if (todayStr < lastDay) end = todayStr;
    }

    const monthName = MONTHS[targetMonthIdx] || monthStr;
    return {
      start,
      end,
      display: `${moment(start, 'YYYY-MM-DD').format('DD-MM-YYYY')} to ${moment(end, 'YYYY-MM-DD').format('DD-MM-YYYY')}`,
      headerLabel: `${monthName.toUpperCase()} ${targetCalYear}`
    };
  }

  // FULL_FY
  const start = `${startYear}-04-01`;
  const fyEnd = `${endYear}-03-31`;
  let end = fyEnd;
  // If target year is current or future FY, cap at today
  if (isTargetYear) {
    if (todayStr < fyEnd) {
      end = todayStr;
    }
  }

  return {
    start,
    end,
    display: `${moment(start, 'YYYY-MM-DD').format('DD-MM-YYYY')} to ${moment(end, 'YYYY-MM-DD').format('DD-MM-YYYY')}`,
    headerLabel: `FY ${startYear}-${String(endYear).slice(-2)}`
  };
}

function calculateTrendSeries(periodType, tyRange, pyRange, tyFY, pyFY, tyMonth, pyMonth, allCement, billRows) {
  const pType = String(periodType || 'MONTHLY').toUpperCase();
  const trend = [];
  
  if (pType === 'DAILY' || pType === 'DATE') {
    const centerDate = moment(tyRange.start, 'YYYY-MM-DD');
    const startWindow = centerDate.clone().subtract(5, 'days');
    const endWindow = centerDate.clone().add(5, 'days');
    
    let curr = startWindow.clone();
    while (curr.isSameOrBefore(endWindow)) {
      const dtStr = curr.format('YYYY-MM-DD');
      let dtTonnage = 0;
      let dtRevenue = 0;
      
      for (const doc of allCement) {
        const raw = doc["LOADING DT"] || doc["LOADING DATE"] || doc["BILL DATE"] || doc["RECEIVING DATE"] || doc["DATE"];
        if (parseToYYYYMMDD(raw) === dtStr) {
          const mt = parseFloat(String(doc["MT"] || doc.mt || doc["TONNAGE"] || doc["TOTAL MT"] || 0).replace(/,/g, '')) || 0;
          if (mt > 0) dtTonnage += mt;
        }
      }
      for (const b of billRows) {
        const raw = b.invoiceDate || b["INVOICE DATE"] || b["BILL DATE"] || b.date;
        if (parseToYYYYMMDD(raw) === dtStr) {
          const amt = parseFloat(String(b.billAmount || b.amount || b["BILL AMOUNT"] || b["Billing Amount"] || 0).replace(/,/g, '')) || 0;
          if (amt > 0) dtRevenue += amt;
        }
      }
      
      trend.push({
        label: curr.format('DD-MMM'),
        date: dtStr,
        isCurrent: dtStr === tyRange.start,
        tonnage: Math.round(dtTonnage * 100) / 100,
        revenue: Math.round(dtRevenue * 100) / 100,
        revenueLakhs: Math.round((dtRevenue / 100000) * 100) / 100
      });
      curr.add(1, 'day');
    }
  } else if (pType === 'WEEKLY') {
    for (let w = 1; w <= 5; w++) {
      const tyWeekRange = resolvePeriodRange(tyFY, 'WEEKLY', tyMonth, w, null, true);
      const pyWeekRange = resolvePeriodRange(pyFY, 'WEEKLY', pyMonth, w, null, false);
      
      let tyTonnage = 0, tyRevenue = 0;
      let pyTonnage = 0, pyRevenue = 0;

      for (const doc of allCement) {
        const iso = parseToYYYYMMDD(doc["LOADING DT"] || doc["LOADING DATE"] || doc["BILL DATE"] || doc["RECEIVING DATE"] || doc["DATE"]);
        if (iso && iso >= tyWeekRange.start && iso <= tyWeekRange.end) {
          const mt = parseFloat(String(doc["MT"] || doc.mt || doc["TONNAGE"] || doc["TOTAL MT"] || 0).replace(/,/g, '')) || 0;
          if (mt > 0) tyTonnage += mt;
        }
        if (iso && iso >= pyWeekRange.start && iso <= pyWeekRange.end) {
          const mt = parseFloat(String(doc["MT"] || doc.mt || doc["TONNAGE"] || doc["TOTAL MT"] || 0).replace(/,/g, '')) || 0;
          if (mt > 0) pyTonnage += mt;
        }
      }
      for (const b of billRows) {
        const iso = parseToYYYYMMDD(b.invoiceDate || b["INVOICE DATE"] || b["BILL DATE"] || b.date);
        if (iso && iso >= tyWeekRange.start && iso <= tyWeekRange.end) {
          const amt = parseFloat(String(b.billAmount || b.amount || b["BILL AMOUNT"] || b["Billing Amount"] || 0).replace(/,/g, '')) || 0;
          if (amt > 0) tyRevenue += amt;
        }
        if (iso && iso >= pyWeekRange.start && iso <= pyWeekRange.end) {
          const amt = parseFloat(String(b.billAmount || b.amount || b["BILL AMOUNT"] || b["Billing Amount"] || 0).replace(/,/g, '')) || 0;
          if (amt > 0) pyRevenue += amt;
        }
      }

      trend.push({
        label: `W${w}`,
        weekLabel: `Week ${w}`,
        weekNum: w,
        tyTonnage: Math.round(tyTonnage * 100) / 100,
        tyRevenue: Math.round(tyRevenue * 100) / 100,
        tyRevenueLakhs: Math.round((tyRevenue / 100000) * 100) / 100,
        pyTonnage: Math.round(pyTonnage * 100) / 100,
        pyRevenue: Math.round(pyRevenue * 100) / 100,
        pyRevenueLakhs: Math.round((pyRevenue / 100000) * 100) / 100
      });
    }
  } else {
    const FY_MONTHS = ["April", "May", "June", "July", "August", "September", "October", "November", "December", "January", "February", "March"];
    for (const m of FY_MONTHS) {
      const tyMRange = resolvePeriodRange(tyFY, 'MONTHLY', m, 1, null, true);
      const pyMRange = resolvePeriodRange(pyFY, 'MONTHLY', m, 1, null, false);
      
      let tyTonnage = 0, tyRevenue = 0;
      let pyTonnage = 0, pyRevenue = 0;

      for (const doc of allCement) {
        const iso = parseToYYYYMMDD(doc["LOADING DT"] || doc["LOADING DATE"] || doc["BILL DATE"] || doc["RECEIVING DATE"] || doc["DATE"]);
        if (iso && iso >= tyMRange.start && iso <= tyMRange.end) {
          const mt = parseFloat(String(doc["MT"] || doc.mt || doc["TONNAGE"] || doc["TOTAL MT"] || 0).replace(/,/g, '')) || 0;
          if (mt > 0) tyTonnage += mt;
        }
        if (iso && iso >= pyMRange.start && iso <= pyMRange.end) {
          const mt = parseFloat(String(doc["MT"] || doc.mt || doc["TONNAGE"] || doc["TOTAL MT"] || 0).replace(/,/g, '')) || 0;
          if (mt > 0) pyTonnage += mt;
        }
      }
      for (const b of billRows) {
        const iso = parseToYYYYMMDD(b.invoiceDate || b["INVOICE DATE"] || b["BILL DATE"] || b.date);
        if (iso && iso >= tyMRange.start && iso <= tyMRange.end) {
          const amt = parseFloat(String(b.billAmount || b.amount || b["BILL AMOUNT"] || b["Billing Amount"] || 0).replace(/,/g, '')) || 0;
          if (amt > 0) tyRevenue += amt;
        }
        if (iso && iso >= pyMRange.start && iso <= pyMRange.end) {
          const amt = parseFloat(String(b.billAmount || b.amount || b["BILL AMOUNT"] || b["Billing Amount"] || 0).replace(/,/g, '')) || 0;
          if (amt > 0) pyRevenue += amt;
        }
      }

      trend.push({
        label: m.slice(0, 3),
        month: m,
        tyTonnage: Math.round(tyTonnage * 100) / 100,
        tyRevenue: Math.round(tyRevenue * 100) / 100,
        tyRevenueLakhs: Math.round((tyRevenue / 100000) * 100) / 100,
        pyTonnage: Math.round(pyTonnage * 100) / 100,
        pyRevenue: Math.round(pyRevenue * 100) / 100,
        pyRevenueLakhs: Math.round((pyRevenue / 100000) * 100) / 100
      });
    }
  }

  return trend;
}

const FinancialYearPayment = require("../models/FinancialYearPayment");

// Calculate FULL PROJECT Tonnage from Cement Register, Revenue from Bill Register & Realization from Bank Book / Payments (NO SITE FILTER)
async function calculatePeriodMetrics(dateRange, allCement, billRows, allPayments = [], bankDocs = []) {
  // 1. Full Project Tonnage from Cement Register (No site filtering)
  let totalTonnage = 0;
  let tripCount = 0;
  const cementRecords = [];

  for (const doc of allCement) {
    const rawDate = doc["LOADING DT"] || doc["LOADING DATE"] || doc["BILL DATE"] || doc["RECEIVING DATE"] || doc["DATE"];
    const isoDate = parseToYYYYMMDD(rawDate);
    if (!isoDate || isoDate < dateRange.start || isoDate > dateRange.end) continue;

    const mt = parseFloat(String(doc["MT"] || doc.mt || doc["TONNAGE"] || doc["TOTAL MT"] || 0).replace(/,/g, '')) || 0;
    if (mt > 0) {
      totalTonnage += mt;
    }
    tripCount++;

    if (cementRecords.length < 500) {
      cementRecords.push({
        id: String(doc._id),
        date: rawDate || isoDate,
        isoDate: isoDate,
        truckNo: doc["VEHICLE NUMBER"] || doc["VEHICLE NO"] || "-",
        mt: mt,
        site: doc["SITE"] || "-",
        party: doc["PARTY NAME"] || "-",
        billNo: doc["BILL NO"] || doc["GCN NO"] || "-"
      });
    }
  }

  // 2. Full Project Revenue from Bill Register (No site filtering)
  let totalRevenue = 0;
  let billCount = 0;
  const billRecords = [];
  const periodInvoiceSet = new Set();

  for (const b of billRows) {
    const rawDate = b.invoiceDate || b["INVOICE DATE"] || b["BILL DATE"] || b.date;
    const isoDate = parseToYYYYMMDD(rawDate);
    if (!isoDate || isoDate < dateRange.start || isoDate > dateRange.end) continue;

    const amt = parseFloat(String(b.billAmount || b.amount || b["BILL AMOUNT"] || b["Billing Amount"] || 0).replace(/,/g, '')) || 0;
    if (amt > 0) {
      totalRevenue += amt;
    }
    billCount++;

    const invNo = String(b.invoiceNumber || b.displayInvoiceNumber || b.billNo || '').trim();
    if (invNo) periodInvoiceSet.add(invNo);

    billRecords.push({
      id: String(b.id || b._id || invNo),
      invoiceNumber: invNo,
      displayInvoiceNumber: b.displayInvoiceNumber || invNo,
      invoiceDate: rawDate || isoDate,
      isoDate: isoDate,
      amount: amt,
      site: b.site || "-",
      billType: b.billType || "FREIGHT",
      debitReasons: b.debitReasons || (b.debitReason ? [b.debitReason] : []),
      allocatedDebit: parseFloat(b.totalAllocatedAmount || b.originalDebitAmount || 0) || 0
    });
  }

  // Rounding core metrics
  totalTonnage = Math.round(totalTonnage * 100) / 100;
  totalRevenue = Math.round(totalRevenue * 100) / 100;
  const revPerMt = totalTonnage > 0 ? Math.round((totalRevenue / totalTonnage) * 100) / 100 : 0;

  // 3. Attributable Deductions & Payment Realization
  let paymentReceived = 0;
  let totalDocumentedDeductions = 0;
  const attributableDeductions = [];
  const seenDeductionKeys = new Set();

  // A. From FinancialYearPayment linked to period invoices or payment dates
  for (const p of allPayments) {
    const pDate = p.paymentDate || '';
    const pIso = parseToYYYYMMDD(pDate);
    const billNos = Array.isArray(p.billNos) ? p.billNos : [];
    const hasMatchingBill = billNos.some(bNo => periodInvoiceSet.has(String(bNo).trim()));
    const isInDateRange = pIso && pIso >= dateRange.start && pIso <= dateRange.end;

    if (hasMatchingBill || isInDateRange) {
      const pAmt = parseFloat(p.paymentAmount) || 0;
      const dAmt = parseFloat(p.debitAmount) || 0;
      const tdsAmt = parseFloat(p.tdsProvision) || 0;

      paymentReceived += pAmt;

      if (dAmt > 0) {
        const dKey = `PAY_DEBIT_${p.id || p._id}_${dAmt}`;
        if (!seenDeductionKeys.has(dKey)) {
          seenDeductionKeys.add(dKey);
          totalDocumentedDeductions += dAmt;
          attributableDeductions.push({
            reason: p.remarks || 'Documented Debit Deduction',
            source: 'Payment Settlement',
            date: p.paymentDate || '-',
            reference: p.referenceNo || '-',
            invoiceNumber: billNos.join(', ') || 'Attributable Payment',
            grossAmount: pAmt + dAmt + tdsAmt,
            deductionAmount: dAmt,
            impact: -dAmt,
            percentageImpact: totalRevenue > 0 ? Math.round((dAmt / totalRevenue) * 10000) / 100 : 0
          });
        }
      }

      if (tdsAmt > 0) {
        const tdsKey = `PAY_TDS_${p.id || p._id}_${tdsAmt}`;
        if (!seenDeductionKeys.has(tdsKey)) {
          seenDeductionKeys.add(tdsKey);
          totalDocumentedDeductions += tdsAmt;
          attributableDeductions.push({
            reason: 'TDS Provision',
            source: 'Statutory Tax',
            date: p.paymentDate || '-',
            reference: p.referenceNo || '-',
            invoiceNumber: billNos.join(', ') || 'Attributable Payment',
            grossAmount: pAmt + dAmt + tdsAmt,
            deductionAmount: tdsAmt,
            impact: -tdsAmt,
            percentageImpact: totalRevenue > 0 ? Math.round((tdsAmt / totalRevenue) * 10000) / 100 : 0
          });
        }
      }
    }
  }

  // B. From Bill Register Allocated Debits (Damage, Shortage, etc.)
  for (const b of billRecords) {
    if (b.allocatedDebit > 0) {
      const bKey = `BILL_DEBIT_${b.invoiceNumber}_${b.allocatedDebit}`;
      if (!seenDeductionKeys.has(bKey)) {
        seenDeductionKeys.add(bKey);
        totalDocumentedDeductions += b.allocatedDebit;
        attributableDeductions.push({
          reason: b.debitReasons.join(', ') || 'Damage / Shortage Allocation',
          source: 'Bill Register Allocation',
          date: b.invoiceDate || '-',
          reference: b.invoiceNumber,
          invoiceNumber: b.invoiceNumber,
          grossAmount: b.amount,
          deductionAmount: b.allocatedDebit,
          impact: -b.allocatedDebit,
          percentageImpact: totalRevenue > 0 ? Math.round((b.allocatedDebit / totalRevenue) * 10000) / 100 : 0
        });
      }
    }
  }

  // Financial Realization Bridge / Waterfall Flow
  totalDocumentedDeductions = Math.round(totalDocumentedDeductions * 100) / 100;
  paymentReceived = Math.round(paymentReceived * 100) / 100;
  const netRealized = paymentReceived;
  const unrealizedBalance = Math.max(0, Math.round((totalRevenue - paymentReceived - totalDocumentedDeductions) * 100) / 100);

  const realizationBridge = [
    { name: 'Billed Revenue', value: totalRevenue, type: 'START' },
    { name: 'Documented Deductions', value: -totalDocumentedDeductions, type: 'DEDUCTION' },
    { name: 'Payments Realized', value: paymentReceived, type: 'PAYMENT' },
    { name: 'Unrealized Balance', value: unrealizedBalance, type: 'BALANCE' }
  ];

  return {
    tonnage: totalTonnage,
    tripCount,
    revenue: totalRevenue,
    billCount,
    revPerMt,
    paymentReceived,
    totalDocumentedDeductions,
    netRealized,
    unrealizedBalance,
    attributableDeductions,
    realizationBridge,
    cementRecords: cementRecords.slice(0, 100),
    billRecords: billRecords.slice(0, 100),
    dateRange
  };
}

// ── GET /pie-chart/growth-analysis ──────────────────────────────────────────
// Tonnage Growth VS Revenue Growth production-grade analytical engine
// Full project scope (No site filter) + Support DAILY, WEEKLY, MONTHLY, FULL_FY
router.get("/growth-analysis", async (req, res) => {
  try {
    const {
      tyFY = 'FY 2026-27',
      pyFY = 'FY 2025-26',
      periodType = 'MONTHLY', // 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'FULL_FY'
      tyMonth = 'September',
      pyMonth = 'August',
      tyWeek = '1',
      pyWeek = '1',
      month, // backwards compat fallback
      tyDate,
      pyDate
    } = req.query;

    const targetMonth = tyMonth || month || 'September';
    const comparisonMonth = pyMonth || month || 'August';

    const tyRange = resolvePeriodRange(tyFY, periodType, targetMonth, tyWeek, tyDate, true);
    const pyRange = resolvePeriodRange(pyFY, periodType, comparisonMonth, pyWeek, pyDate, false);

    const cementCol = getCementCol();
    const [allCement, { rows: allBillRows = [] }, allPayments = [], bankDocs = []] = await Promise.all([
      cementCol.find({}).toArray(),
      getBillRegisterData({ fy: 'ALL' }),
      FinancialYearPayment.find({}).lean(),
      AccountDetail.find({ ledgerName: { $regex: /Payment Received/i } }).lean()
    ]);

    const tyMetrics = await calculatePeriodMetrics(tyRange, allCement, allBillRows, allPayments, bankDocs);
    const pyMetrics = await calculatePeriodMetrics(pyRange, allCement, allBillRows, allPayments, bankDocs);

    // Calculate growth percentages (null if baseline is 0)
    // 1. Primary Tonnage Growth: ((Current MT - Previous MT) / Previous MT) * 100
    const volumeGrowthPct = pyMetrics.tonnage > 0
      ? Math.round(((tyMetrics.tonnage - pyMetrics.tonnage) / pyMetrics.tonnage) * 10000) / 100
      : null;

    // 2. Primary Revenue Growth: ((Current Revenue - Previous Revenue) / Previous Revenue) * 100
    const revenueGrowthPct = pyMetrics.revenue > 0
      ? Math.round(((tyMetrics.revenue - pyMetrics.revenue) / pyMetrics.revenue) * 10000) / 100
      : null;

    // 3. Optional secondary diagnostic: Revenue / MT Growth
    const revPerMtGrowthPct = pyMetrics.revPerMt > 0
      ? Math.round(((tyMetrics.revPerMt - pyMetrics.revPerMt) / pyMetrics.revPerMt) * 10000) / 100
      : null;

    // Growth Gap: Revenue Growth % - Tonnage Growth %
    const growthGap = (revenueGrowthPct !== null && volumeGrowthPct !== null)
      ? Math.round((revenueGrowthPct - volumeGrowthPct) * 100) / 100
      : null;

    // Comparative Heading Construction: e.g. "SEPTEMBER 2026 VS AUGUST 2025" or "FY 2026-27 VS FY 2025-26"
    const comparisonHeading = `${tyRange.headerLabel} VS ${pyRange.headerLabel}`;

    // Quantitative Revenue Variance Mathematical Decomposition
    const diffTonnage = Math.round((tyMetrics.tonnage - pyMetrics.tonnage) * 100) / 100;
    const diffRevenue = Math.round((tyMetrics.revenue - pyMetrics.revenue) * 100) / 100;
    const diffRevPerMt = Math.round((tyMetrics.revPerMt - pyMetrics.revPerMt) * 100) / 100;

    const volumeEffect = pyMetrics.revPerMt > 0 ? Math.round(diffTonnage * pyMetrics.revPerMt * 100) / 100 : 0;
    const priceEffect = tyMetrics.tonnage > 0 ? Math.round(tyMetrics.tonnage * diffRevPerMt * 100) / 100 : 0;

    // Reason for Disproportion & Shortfall Contributors Ranking (100% Data-Driven based on actual calculations)
    const disproportionReasons = [];
    const shortfallContributors = [];

    if (volumeGrowthPct !== null && revenueGrowthPct !== null) {
      if (Math.abs(growthGap || 0) >= 0.01) {
        if (diffRevPerMt !== 0) {
          disproportionReasons.push({
            factor: "Revenue Realization per MT (Billing Rate Changes)",
            type: diffRevPerMt > 0 ? "POSITIVE_IMPACT" : "NEGATIVE_IMPACT",
            impactAmount: priceEffect,
            detail: `Average realization changed by ${diffRevPerMt > 0 ? '+' : ''}₹${diffRevPerMt.toLocaleString('en-IN')}/MT (from ₹${pyMetrics.revPerMt.toLocaleString('en-IN')}/MT in ${pyRange.headerLabel} to ₹${tyMetrics.revPerMt.toLocaleString('en-IN')}/MT in ${tyRange.headerLabel}, ${revPerMtGrowthPct > 0 ? '+' : ''}${revPerMtGrowthPct}%). On current lifting of ${tyMetrics.tonnage.toLocaleString('en-IN')} MT, this accounts for a mathematical revenue ${priceEffect >= 0 ? 'gain' : 'reduction'} of ₹${Math.abs(priceEffect).toLocaleString('en-IN')}.`
          });

          if (priceEffect < 0) {
            shortfallContributors.push({
              rank: 1,
              name: "Revenue / MT Realization Reduction",
              source: "Bill Register Billing Rates",
              impactAmount: Math.abs(priceEffect),
              impactDisplay: `-₹${Math.abs(priceEffect).toLocaleString('en-IN')}`,
              percentageOfShortfall: diffRevenue !== 0 ? Math.min(100, Math.round((Math.abs(priceEffect) / Math.abs(diffRevenue)) * 10000) / 100) : 0,
              description: `Lower average realization per MT reduced revenue by ₹${Math.abs(priceEffect).toLocaleString('en-IN')} across current tonnage.`
            });
          }
        }

        // Check attributable deductions
        if (tyMetrics.totalDocumentedDeductions > 0) {
          shortfallContributors.push({
            rank: shortfallContributors.length + 1,
            name: "Documented Bill & Settlement Deductions",
            source: "Bill Register & Payment Allocations",
            impactAmount: tyMetrics.totalDocumentedDeductions,
            impactDisplay: `-₹${tyMetrics.totalDocumentedDeductions.toLocaleString('en-IN')}`,
            percentageOfShortfall: tyMetrics.revenue > 0 ? Math.round((tyMetrics.totalDocumentedDeductions / tyMetrics.revenue) * 10000) / 100 : 0,
            description: `${tyMetrics.attributableDeductions.length} authoritative deductions/reductions (damages, TDS, debit adjustments) reduce financial realization.`
          });
        }
      } else {
        disproportionReasons.push({
          factor: "Proportionate Growth",
          type: "PROPORTIONATE",
          detail: `Volume growth (${volumeGrowthPct}%) and Revenue growth (${revenueGrowthPct}%) are proportionate with stable average realization per MT.`
        });
      }
    } else {
      disproportionReasons.push({
        factor: "Insufficient Historical Baseline",
        type: "INSUFFICIENT_DATA",
        detail: "Insufficient source data in the comparison baseline period to determine a specific mathematical contributing factor."
      });
    }

    // Sort shortfall contributors by impact amount descending
    shortfallContributors.sort((a, b) => b.impactAmount - a.impactAmount);
    shortfallContributors.forEach((c, idx) => { c.rank = idx + 1; });

    // Calculate Trend Series for Visualizations
    const trend = calculateTrendSeries(periodType, tyRange, pyRange, tyFY, pyFY, targetMonth, comparisonMonth, allCement, allBillRows);

    res.json({
      success: true,
      filters: {
        tyFY,
        pyFY,
        periodType,
        tyMonth: targetMonth,
        pyMonth: comparisonMonth,
        tyWeek,
        pyWeek,
        tyDate: tyRange.start,
        pyDate: pyRange.start
      },
      comparisonHeading,
      ty: {
        financialYear: tyFY,
        periodDisplay: tyRange.display,
        headerLabel: tyRange.headerLabel,
        ...tyMetrics
      },
      py: {
        financialYear: pyFY,
        periodDisplay: pyRange.display,
        headerLabel: pyRange.headerLabel,
        ...pyMetrics
      },
      comparison: {
        volumeGrowthPct,
        revenueGrowthPct,
        revPerMtGrowthPct,
        growthGap,
        diffTonnage,
        diffRevenue,
        diffRevPerMt,
        volumeEffect,
        priceEffect,
        disproportionReasons,
        shortfallContributors
      },
      trend
    });
  } catch (err) {
    console.error("[GrowthAnalysis] Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const { ledger, period, month, financialYear, date } = req.query;

    if (!ledger) {
      return res.status(400).json({ error: "Ledger is required" });
    }

    const currentRange = getDateRange(period || 'TODAY', financialYear, month, date);
    const currentData = await fetchChartData(ledger, currentRange, period || 'TODAY');

    res.json({
      success: true,
      currentRange,
      currentData
    });
  } catch (err) {
    console.error("Pie Chart Data Error:", err);
    res.status(500).json({ error: "Failed to fetch pie chart data: " + err.message });
  }
});

module.exports = router;
