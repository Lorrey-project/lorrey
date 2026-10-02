const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const moment = require("moment");
const AccountDetail = require("../models/AccountDetail");
const { getBillRegisterData } = require("../utils/billRegisterHelper");
const { getEffectivePartyMaster } = require("../utils/partyMasterHelper");

const MONTHS = [
  "January", "February", "March", "April", "May", "June", 
  "July", "August", "September", "October", "November", "December"
];

// Helper database getters
const getCementCol = () => mongoose.connection.useDb("cement_register").collection("entries");
const getBillRegisterCol = () => mongoose.connection.useDb("cement_register").collection("generated_bills");
const getMainCashCol = () => mongoose.connection.useDb("main_cashbook").collection("entries");
const getPumpPaymentCol = () => mongoose.connection.useDb("pump_payment_register").collection("records");
const getFreightCol = () => mongoose.connection.useDb("invoice_system").collection("freight_data");

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

// ── GET /pie-chart/tonnage-revenue-summary ──────────────────────────────────
// Live database-driven Tonnage (Cement Register TOTAL MT) & Billed Revenue (Bill Register)
router.get("/tonnage-revenue-summary", async (req, res) => {
  try {
    const { financialYear, fy, periodType = 'FULL_FY', month } = req.query;
    const selectedFY = financialYear || fy || 'FY 2026-27';

    const now = moment();
    const currentCalMonth = now.month() + 1; // 1-12
    const currentCalYear = now.year();
    const currentCalDay = now.date();
    const todayStr = now.format("YYYY-MM-DD");

    const { startYear, endYear } = parseFY(selectedFY);
    const isCurrentFY = (currentCalMonth >= 4 && currentCalYear === startYear) || (currentCalMonth < 4 && currentCalYear === endYear);

    // 12 FY months in order: April (04) to March (03)
    const fyMonths = [
      { name: "April", short: "Apr", monthNum: 4, year: startYear },
      { name: "May", short: "May", monthNum: 5, year: startYear },
      { name: "June", short: "Jun", monthNum: 6, year: startYear },
      { name: "July", short: "Jul", monthNum: 7, year: startYear },
      { name: "August", short: "Aug", monthNum: 8, year: startYear },
      { name: "September", short: "Sep", monthNum: 9, year: startYear },
      { name: "October", short: "Oct", monthNum: 10, year: startYear },
      { name: "November", short: "Nov", monthNum: 11, year: startYear },
      { name: "December", short: "Dec", monthNum: 12, year: startYear },
      { name: "January", short: "Jan", monthNum: 1, year: endYear },
      { name: "February", short: "Feb", monthNum: 2, year: endYear },
      { name: "March", short: "Mar", monthNum: 3, year: endYear },
    ];

    // Determine target months to compute
    let activeMonths = fyMonths;
    const isMonthlyMode = periodType === 'MONTH' || periodType === 'MONTHLY';
    if (isMonthlyMode && month && month !== 'ALL') {
      const matchMonth = fyMonths.find(m => m.name.toLowerCase() === month.toLowerCase() || m.short.toLowerCase() === month.toLowerCase());
      if (matchMonth) {
        activeMonths = [matchMonth];
      }
    }

    // Fetch live Cement Register entries and Bill Register data
    const cementCol = getCementCol();
    const [allCement, { rows: allBillRows = [] }] = await Promise.all([
      cementCol.find({}).toArray(),
      getBillRegisterData({ fy: `${startYear}-${endYear}` })
    ]);

    const parseNumVal = (v) => {
      if (v === null || v === undefined || v === '') return 0;
      const n = parseFloat(String(v).replace(/,/g, ''));
      return isNaN(n) ? 0 : n;
    };

    // Calculate monthly aggregates
    let grandTotalTonnage = 0;
    let grandTotalRevenue = 0;
    let grandTotalTrips = 0;
    let grandTotalBills = 0;

    const monthlyBreakdown = activeMonths.map(mInfo => {
      const { name, monthNum, year } = mInfo;
      const daysInMonth = new Date(year, monthNum, 0).getDate();
      const mStartStr = `${year}-${String(monthNum).padStart(2, '0')}-01`;

      let lastDay = daysInMonth;
      const isThisMonthCurrent = (year === currentCalYear && monthNum === currentCalMonth);
      const isFutureMonth = (year > currentCalYear) || (year === currentCalYear && monthNum > currentCalMonth);

      if (isThisMonthCurrent) {
        lastDay = Math.min(currentCalDay, daysInMonth);
      } else if (isFutureMonth) {
        lastDay = 0; // Future month has 0 data
      }

      const mEndStr = lastDay > 0
        ? `${year}-${String(monthNum).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
        : mStartStr;

      let monthTonnage = 0;
      let monthTrips = 0;
      let monthRevenue = 0;
      let monthBills = 0;

      if (lastDay > 0) {
        // 1. Tonnage from Cement Register
        const seenCementIds = new Set();
        allCement.forEach(row => {
          const rowId = String(row._id);
          if (seenCementIds.has(rowId)) return;
          seenCementIds.add(rowId);

          const rawDate = row["LOADING DT"] || row["LOADING DATE"] || row["BILL DATE"] || row["DATE"];
          const isoDate = parseToYYYYMMDD(rawDate);
          if (!isoDate || isoDate < mStartStr || isoDate > mEndStr) return;

          const mtVal = parseNumVal(row["TOTAL MT"] ?? row["MT"] ?? row["TONNAGE"] ?? row.mt ?? row.totalMt ?? row["TOTAL WEIGHT"] ?? row["LIFTING"] ?? row["QTY"] ?? row["QUANTITY"]);
          const billAmt = parseNumVal(row["Billing Amount"] ?? row["BILLING AMOUNT"] ?? row["AMOUNT"] ?? row.billingAmount);
          const invNo = String(row["INVOICE NO"] || row["INVOICE NO."] || row["BILL NO"] || "").trim();

          if (mtVal <= 0 && billAmt <= 0 && !invNo) return;
          if (mtVal > 0) {
            monthTonnage += mtVal;
            monthTrips += 1;
          }
        });

        // 2. Revenue from Bill Register
        const seenBillNos = new Set();
        allBillRows.forEach(b => {
          const bDate = b.invoiceDate || b.billDate || b.date;
          const bIso = parseToYYYYMMDD(bDate);
          if (!bIso || bIso < mStartStr || bIso > mEndStr) return;

          const bNo = String(b.invoiceNumber || b.billNo || '').trim();
          const bAmt = parseFloat(b.amount) || 0;

          if (bNo && seenBillNos.has(bNo)) return;
          if (bNo) seenBillNos.add(bNo);

          if (bAmt > 0) {
            monthRevenue += bAmt;
            monthBills += 1;
          }
        });
      }

      monthTonnage = Math.round(monthTonnage * 100) / 100;
      monthRevenue = Math.round(monthRevenue * 100) / 100;

      grandTotalTonnage += monthTonnage;
      grandTotalRevenue += monthRevenue;
      grandTotalTrips += monthTrips;
      grandTotalBills += monthBills;

      return {
        month: name,
        monthShort: mInfo.short,
        year,
        startDate: mStartStr,
        endDate: mEndStr,
        isFuture: isFutureMonth,
        tonnage: monthTonnage,
        revenue: monthRevenue,
        trips: monthTrips,
        bills: monthBills,
        tonnageDisplay: `${monthTonnage.toLocaleString('en-IN')} MT`,
        revenueDisplay: `₹${monthRevenue.toLocaleString('en-IN')}`
      };
    });

    grandTotalTonnage = Math.round(grandTotalTonnage * 100) / 100;
    grandTotalRevenue = Math.round(grandTotalRevenue * 100) / 100;

    let periodDisplay = '';
    if (isMonthlyMode && activeMonths.length === 1) {
      periodDisplay = `${activeMonths[0].name} ${activeMonths[0].year}`;
    } else {
      periodDisplay = `${selectedFY} (01-Apr-${startYear} to ${isCurrentFY ? todayStr : `31-Mar-${endYear}`})`;
    }

    return res.json({
      success: true,
      period: {
        financialYear: selectedFY,
        periodType: isMonthlyMode ? 'MONTH' : 'FULL_FY',
        month: isMonthlyMode && activeMonths.length === 1 ? activeMonths[0].name : 'ALL',
        display: periodDisplay,
        startYear,
        endYear
      },
      totals: {
        totalTonnage: grandTotalTonnage,
        totalRevenue: grandTotalRevenue,
        totalTrips: grandTotalTrips,
        totalBills: grandTotalBills,
        tonnageDisplay: `${grandTotalTonnage.toLocaleString('en-IN')} MT`,
        revenueDisplay: `₹${grandTotalRevenue.toLocaleString('en-IN')}`
      },
      monthlyData: monthlyBreakdown,
      chartData: monthlyBreakdown.map(m => ({
        month: m.month,
        monthShort: m.monthShort,
        tonnage: m.tonnage,
        revenue: m.revenue,
        isFuture: m.isFuture
      }))
    });
  } catch (err) {
    console.error("[TonnageRevenueSummary] Error:", err);
    return res.status(500).json({ success: false, error: err.message || "Failed to calculate tonnage and revenue summary" });
  }
});

// ── GET /pie-chart/ptpk-summary ──────────────────────────────────────────────
// Live database-driven PTPK Analysis (Revenue per Ton ÷ Ton per KM = PTPK / Per Ton Per KM)
// Sources:
// - TOTAL REVENUE: Bill Register authoritative billed revenue
// - TOTAL MT: Cement Register actual TOTAL MT
// - TOTAL KM: Cement Register distance using authoritative NVL/NVCL freight rate-chart (UP+DOWN)
router.get("/ptpk-summary", async (req, res) => {
  try {
    const { financialYear, fy, periodType = 'FULL_FY', month } = req.query;
    const selectedFY = financialYear || fy || 'FY 2026-27';

    const now = moment();
    const currentCalMonth = now.month() + 1; // 1-12
    const currentCalYear = now.year();
    const currentCalDay = now.date();
    const todayStr = now.format("YYYY-MM-DD");

    const { startYear, endYear } = parseFY(selectedFY);
    const isCurrentFY = (currentCalMonth >= 4 && currentCalYear === startYear) || (currentCalMonth < 4 && currentCalYear === endYear);

    // 12 FY months in order: April (04) to March (03)
    const fyMonths = [
      { name: "April", short: "Apr", monthNum: 4, year: startYear },
      { name: "May", short: "May", monthNum: 5, year: startYear },
      { name: "June", short: "Jun", monthNum: 6, year: startYear },
      { name: "July", short: "Jul", monthNum: 7, year: startYear },
      { name: "August", short: "Aug", monthNum: 8, year: startYear },
      { name: "September", short: "Sep", monthNum: 9, year: startYear },
      { name: "October", short: "Oct", monthNum: 10, year: startYear },
      { name: "November", short: "Nov", monthNum: 11, year: startYear },
      { name: "December", short: "Dec", monthNum: 12, year: startYear },
      { name: "January", short: "Jan", monthNum: 1, year: endYear },
      { name: "February", short: "Feb", monthNum: 2, year: endYear },
      { name: "March", short: "Mar", monthNum: 3, year: endYear },
    ];

    const isMonthlyMode = periodType === 'MONTH' || periodType === 'MONTHLY';
    let targetMonthObj = null;
    if (isMonthlyMode && month && month !== 'ALL') {
      targetMonthObj = fyMonths.find(m => m.name.toLowerCase() === month.toLowerCase() || m.short.toLowerCase() === month.toLowerCase()) || null;
    }

    // Fetch live Cement Register entries, Bill Register data, and Freight data
    const cementCol = getCementCol();
    const freightCol = getFreightCol();
    const [allCement, { rows: allBillRows = [] }, allFreight = []] = await Promise.all([
      cementCol.find({}).toArray(),
      getBillRegisterData({ fy: `${startYear}-${endYear}` }),
      freightCol.find({}).toArray()
    ]);

    const parseNumVal = (v) => {
      if (v === null || v === undefined || v === '') return 0;
      const n = parseFloat(String(v).replace(/,/g, ''));
      return isNaN(n) ? 0 : n;
    };

    // Authoritative distance resolver using project NVL/NVCL freight rate-chart data
    const getDistanceForDestination = (destination, site) => {
      if (!destination) return 0;
      const destStr = String(destination).trim();
      if (!destStr) return 0;

      const targetFreights = site ? allFreight.filter(f => f.SOURCE === (site === "NVCL" ? "NVCL" : "NVL")) : allFreight;
      const searchPool = targetFreights.length > 0 ? targetFreights : allFreight;

      // 1. Pincode match (6 digits)
      const pinMatch = destStr.match(/\b\d{6}\b/);
      if (pinMatch) {
        const pin = pinMatch[0];
        const match = searchPool.find(f => {
          const d = String(f["DEST ZONE DESC"] || "");
          const p = String(f["PINCODE"] || f["Pincode"] || "");
          return d.includes(pin) || p.includes(pin);
        });
        if (match && parseNumVal(match.Distance) > 0) return parseNumVal(match.Distance) * 2;
      }

      // 2. Exact/regex destination string match
      const destLower = destStr.toLowerCase();
      const exactMatch = searchPool.find(f => {
        const d = String(f["DEST ZONE DESC"] || "").toLowerCase();
        return d === destLower || d.includes(destLower);
      });
      if (exactMatch && parseNumVal(exactMatch.Distance) > 0) return parseNumVal(exactMatch.Distance) * 2;

      // 3. Fallback: first significant word (>= 3 chars)
      const destText = destStr.replace(/^\d+[-\s]*/, "").replace(/[-\s]*\d+$/, "").trim();
      const firstWord = destText.split(/[\s,(]/)[0].toLowerCase();
      if (firstWord && firstWord.length > 2) {
        const wordMatch = searchPool.find(f => {
          const d = String(f["DEST ZONE DESC"] || "").toLowerCase();
          return d.includes(firstWord);
        });
        if (wordMatch && parseNumVal(wordMatch.Distance) > 0) return parseNumVal(wordMatch.Distance) * 2;
      }

      return 0;
    };

    const unmappedDestinations = new Map();

    const monthlyBreakdown = fyMonths.map(mInfo => {
      const { name, monthNum, year } = mInfo;
      const daysInMonth = new Date(year, monthNum, 0).getDate();
      const mStartStr = `${year}-${String(monthNum).padStart(2, '0')}-01`;

      let lastDay = daysInMonth;
      const isThisMonthCurrent = (year === currentCalYear && monthNum === currentCalMonth);
      const isFutureMonth = (year > currentCalYear) || (year === currentCalYear && monthNum > currentCalMonth);

      if (isThisMonthCurrent) {
        lastDay = Math.min(currentCalDay, daysInMonth);
      } else if (isFutureMonth) {
        lastDay = 0; // Future month has 0 data
      }

      const mEndStr = lastDay > 0
        ? `${year}-${String(monthNum).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
        : mStartStr;

      let monthTonnage = 0;
      let monthKM = 0;
      let monthTrips = 0;
      let monthRevenue = 0;
      let monthBills = 0;
      let monthUnmappedTrips = 0;

      if (lastDay > 0) {
        // 1. Tonnage & KM from Cement Register (Single count per record _id)
        const seenCementIds = new Set();
        allCement.forEach(row => {
          const rowId = String(row._id);
          if (seenCementIds.has(rowId)) return;
          seenCementIds.add(rowId);

          const rawDate = row["LOADING DT"] || row["LOADING DATE"] || row["BILL DATE"] || row["DATE"];
          const isoDate = parseToYYYYMMDD(rawDate);
          if (!isoDate || isoDate < mStartStr || isoDate > mEndStr) return;

          const mtVal = parseNumVal(row["TOTAL MT"] ?? row["MT"] ?? row["TONNAGE"] ?? row.mt ?? row.totalMt ?? row["TOTAL WEIGHT"] ?? row["LIFTING"] ?? row["QTY"] ?? row["QUANTITY"]);
          const billAmt = parseNumVal(row["Billing Amount"] ?? row["BILLING AMOUNT"] ?? row["AMOUNT"] ?? row.billingAmount);
          const invNo = String(row["INVOICE NO"] || row["INVOICE NO."] || row["BILL NO"] || "").trim();

          if (mtVal <= 0 && billAmt <= 0 && !invNo) return;

          if (mtVal > 0) {
            monthTonnage += mtVal;
            monthTrips += 1;

            let kmVal = parseNumVal(row["KM AS PER RATE CHART"] ?? row["KM"] ?? row["DISTANCE"]);
            if (kmVal <= 0) {
              kmVal = getDistanceForDestination(row["DESTINATION"], row["SITE"]);
            }

            if (kmVal > 0) {
              monthKM += kmVal;
            } else {
              monthUnmappedTrips += 1;
              const dest = String(row["DESTINATION"] || "Unknown").trim();
              unmappedDestinations.set(dest, (unmappedDestinations.get(dest) || 0) + 1);
            }
          }
        });

        // 2. Revenue from Bill Register (Single count per invoiceNumber)
        const seenBillNos = new Set();
        allBillRows.forEach(b => {
          const bDate = b.invoiceDate || b.billDate || b.date;
          const bIso = parseToYYYYMMDD(bDate);
          if (!bIso || bIso < mStartStr || bIso > mEndStr) return;

          const bNo = String(b.invoiceNumber || b.billNo || '').trim();
          const bAmt = parseFloat(b.amount) || 0;

          if (bNo && seenBillNos.has(bNo)) return;
          if (bNo) seenBillNos.add(bNo);

          if (bAmt > 0) {
            monthRevenue += bAmt;
            monthBills += 1;
          }
        });
      }

      monthTonnage = Math.round(monthTonnage * 100) / 100;
      monthKM = Math.round(monthKM * 100) / 100;
      monthRevenue = Math.round(monthRevenue * 100) / 100;

      const revPerMT = monthTonnage > 0 ? Math.round((monthRevenue / monthTonnage) * 100) / 100 : null;
      const tonPerKM = monthKM > 0 ? Math.round((monthTonnage / monthKM) * 10000) / 10000 : null;
      const ptpk = monthKM > 0 ? Math.round((monthRevenue / monthKM) * 100) / 100 : null;

      return {
        month: name,
        monthShort: mInfo.short,
        year,
        startDate: mStartStr,
        endDate: mEndStr,
        isFuture: isFutureMonth,
        tonnage: monthTonnage,
        km: monthKM,
        revenue: monthRevenue,
        trips: monthTrips,
        bills: monthBills,
        unmappedTrips: monthUnmappedTrips,
        revenuePerMT: revPerMT,
        tonPerKM: tonPerKM,
        ptpk: ptpk
      };
    });

    // Calculate selection totals based on periodType
    let targetMonthsForTotal = monthlyBreakdown;
    let periodDisplay = '';

    if (isMonthlyMode && targetMonthObj) {
      const match = monthlyBreakdown.find(m => m.month === targetMonthObj.name);
      targetMonthsForTotal = match ? [match] : [];
      periodDisplay = `${targetMonthObj.name} ${targetMonthObj.year}`;
    } else {
      periodDisplay = `${selectedFY} (01-Apr-${startYear} to ${isCurrentFY ? todayStr : `31-Mar-${endYear}`})`;
    }

    let grandTotalTonnage = 0;
    let grandTotalKM = 0;
    let grandTotalRevenue = 0;
    let grandTotalTrips = 0;
    let grandTotalBills = 0;
    let grandTotalUnmappedTrips = 0;

    targetMonthsForTotal.forEach(m => {
      grandTotalTonnage += m.tonnage;
      grandTotalKM += m.km;
      grandTotalRevenue += m.revenue;
      grandTotalTrips += m.trips;
      grandTotalBills += m.bills;
      grandTotalUnmappedTrips += m.unmappedTrips;
    });

    grandTotalTonnage = Math.round(grandTotalTonnage * 100) / 100;
    grandTotalKM = Math.round(grandTotalKM * 100) / 100;
    grandTotalRevenue = Math.round(grandTotalRevenue * 100) / 100;

    const grandRevenuePerMT = grandTotalTonnage > 0 ? Math.round((grandTotalRevenue / grandTotalTonnage) * 100) / 100 : null;
    const grandTonPerKM = grandTotalKM > 0 ? Math.round((grandTotalTonnage / grandTotalKM) * 10000) / 10000 : null;
    const grandPtpk = grandTotalKM > 0 ? Math.round((grandTotalRevenue / grandTotalKM) * 100) / 100 : null;

    return res.json({
      success: true,
      period: {
        financialYear: selectedFY,
        periodType: isMonthlyMode ? 'MONTH' : 'FULL_FY',
        month: isMonthlyMode && targetMonthObj ? targetMonthObj.name : 'ALL',
        display: periodDisplay,
        startYear,
        endYear
      },
      totals: {
        totalRevenue: grandTotalRevenue,
        totalTonnage: grandTotalTonnage,
        totalKM: grandTotalKM,
        revenuePerMT: grandRevenuePerMT,
        tonPerKM: grandTonPerKM,
        ptpk: grandPtpk,
        totalTrips: grandTotalTrips,
        totalBills: grandTotalBills,
        unmappedTrips: grandTotalUnmappedTrips,
        revenueDisplay: `₹${grandTotalRevenue.toLocaleString('en-IN')}`,
        tonnageDisplay: `${grandTotalTonnage.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT`,
        kmDisplay: `${grandTotalKM.toLocaleString('en-IN')} KM`,
        revenuePerMTDisplay: grandRevenuePerMT !== null ? `₹${grandRevenuePerMT.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / MT` : 'N/A',
        tonPerKMDisplay: grandTonPerKM !== null ? `${grandTonPerKM.toFixed(4)}` : 'N/A',
        ptpkDisplay: grandPtpk !== null ? `₹${grandPtpk.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / TON / KM` : 'N/A'
      },
      formula: {
        step1: "TOTAL REVENUE ÷ TOTAL MT = REVENUE / MT",
        step2: "TOTAL MT ÷ TOTAL KM = TON / KM",
        step3: "PTPK = TOTAL REVENUE ÷ TOTAL KM",
        label: "PTPK (PER TON PER KILOMETRE)"
      },
      monthlyData: monthlyBreakdown,
      chartData: monthlyBreakdown.map(m => ({
        month: m.month,
        monthShort: m.monthShort,
        tonnage: m.tonnage,
        km: m.km,
        revenue: m.revenue,
        revenuePerMT: m.revenuePerMT,
        tonPerKM: m.tonPerKM,
        ptpk: m.ptpk,
        isFuture: m.isFuture
      })),
      unmappedDestinations: Array.from(unmappedDestinations.entries()).map(([dest, count]) => ({ destination: dest, count }))
    });
  } catch (err) {
    console.error("[PtpkSummary] Error:", err);
    return res.status(500).json({ success: false, error: err.message || "Failed to calculate PTPK summary" });
  }
});

// ── GET /pie-chart/vehicle-mkt-association ───────────────────────────────────────
// Live database-driven report: Market vs Association Total MT by Vehicle Type (6W, 10WH, 12WH, 14WH)
router.get("/vehicle-mkt-association", async (req, res) => {
  try {
    const { financialYear, fy, month, date, period } = req.query;
    const selectedFY = financialYear || fy;

    // 1. Determine date range using existing parseFY and date logic with current month/FY ceiling
    const now = moment();
    const currentCalMonth = now.month() + 1; // 1-12
    const currentCalYear = now.year();
    const currentCalDay = now.date();
    const todayStr = now.format("YYYY-MM-DD");

    const { startYear, endYear } = parseFY(selectedFY);
    const isCurrentFY = (currentCalMonth >= 4 && currentCalYear === startYear) || (currentCalMonth < 4 && currentCalYear === endYear);

    let startDateStr = '';
    let endDateStr = '';
    let displayStr = '';

    const monthMap = {
      'JANUARY': 1, 'FEBRUARY': 2, 'MARCH': 3, 'APRIL': 4, 'MAY': 5, 'JUNE': 6,
      'JULY': 7, 'AUGUST': 8, 'SEPTEMBER': 9, 'OCTOBER': 10, 'NOVEMBER': 11, 'DECEMBER': 12
    };

    let selectedMonthNum = null;
    if (month && String(month).toUpperCase() !== 'ALL') {
      const mUpper = String(month).trim().toUpperCase();
      if (monthMap[mUpper]) {
        selectedMonthNum = monthMap[mUpper];
      } else if (!isNaN(parseInt(mUpper, 10)) && parseInt(mUpper, 10) >= 1 && parseInt(mUpper, 10) <= 12) {
        selectedMonthNum = parseInt(mUpper, 10);
      }
    }

    if (period === 'TODAY') {
      startDateStr = todayStr;
      endDateStr = todayStr;
      displayStr = todayStr;
    } else if (date && String(date).toUpperCase() !== 'ALL') {
      // Specific day or date
      const dNum = parseInt(date, 10);
      if (!isNaN(dNum) && selectedMonthNum !== null) {
        const mYear = selectedMonthNum >= 4 ? startYear : endYear;
        const dStr = `${mYear}-${String(selectedMonthNum).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
        startDateStr = dStr;
        endDateStr = dStr;
        displayStr = `${String(dNum).padStart(2, '0')}-${String(selectedMonthNum).padStart(2, '0')}-${mYear}`;
      } else {
        const parsed = parseToYYYYMMDD(date);
        if (parsed) {
          startDateStr = parsed;
          endDateStr = parsed;
          displayStr = parsed;
        }
      }
    } else if (selectedMonthNum !== null) {
      // Full selected month
      const mYear = selectedMonthNum >= 4 ? startYear : endYear;
      const totalDays = new Date(mYear, selectedMonthNum, 0).getDate();
      let lastDay = totalDays;

      if (mYear === currentCalYear && selectedMonthNum === currentCalMonth) {
        lastDay = Math.min(currentCalDay, totalDays);
      } else if (mYear > currentCalYear || (mYear === currentCalYear && selectedMonthNum > currentCalMonth)) {
        lastDay = 0; // Future month
      }

      startDateStr = `${mYear}-${String(selectedMonthNum).padStart(2, '0')}-01`;
      endDateStr = lastDay > 0
        ? `${mYear}-${String(selectedMonthNum).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
        : `${mYear}-${String(selectedMonthNum).padStart(2, '0')}-01`;

      const mmStr = String(selectedMonthNum).padStart(2, '0');
      displayStr = lastDay > 0
        ? `01-${mmStr}-${mYear} to ${String(lastDay).padStart(2, '0')}-${mmStr}-${mYear}`
        : `01-${mmStr}-${mYear} (No records - future)`;
    } else {
      // Entire Financial Year (or YEARLY)
      const fyStart = `${startYear}-04-01`;
      let fyEnd = `${endYear}-03-31`;
      if (isCurrentFY && todayStr < fyEnd) {
        fyEnd = todayStr;
      }
      startDateStr = fyStart;
      endDateStr = fyEnd;
      displayStr = `${fyStart} to ${fyEnd}`;
    }

    // 2. Fetch authoritative registered vehicles from Party Master (owner details & Truck Contact Number)
    const ownerCol = mongoose.connection.useDb("invoice_system").collection("owner details");
    const truckCol = mongoose.connection.useDb("invoice_system").collection("Truck Contact Number");
    const cementCol = getCementCol();

    const [ownerDocs, truckDocs, cementDocs] = await Promise.all([
      ownerCol.find({}).toArray(),
      truckCol.find({}).toArray(),
      cementCol.find({}).toArray()
    ]);

    const partyMasterMap = new Map();
    // Primary: owner details
    for (const doc of ownerDocs) {
      const rawNo = (doc["Truck No"] || doc["Truck No "] || doc.truck_no || doc._id.toString()).toString().trim().toUpperCase();
      const normKey = rawNo.replace(/[^A-Z0-9]/g, "");
      if (normKey && normKey.length >= 5) {
        partyMasterMap.set(normKey, doc);
      }
    }
    // Secondary: Truck Contact Number
    for (const doc of truckDocs) {
      const rawNo = (doc.truck_no || doc["Truck No "] || doc["Truck No"] || doc._id.toString()).toString().trim().toUpperCase();
      const normKey = rawNo.replace(/[^A-Z0-9]/g, "");
      if (normKey && normKey.length >= 5 && !partyMasterMap.has(normKey)) {
        partyMasterMap.set(normKey, doc);
      }
    }

    // 3. Initialize metrics for the 4 vehicle types
    const vehicleTypeData = {
      '6W': { vehicleType: '6W', label: '6-Wheeler (6W)', totalLifting: 0, market: 0, association: 0, other: 0, recordCount: 0, vehicles: new Set() },
      '10WH': { vehicleType: '10WH', label: '10-Wheeler (10WH)', totalLifting: 0, market: 0, association: 0, other: 0, recordCount: 0, vehicles: new Set() },
      '12WH': { vehicleType: '12WH', label: '12-Wheeler (12WH)', totalLifting: 0, market: 0, association: 0, other: 0, recordCount: 0, vehicles: new Set() },
      '14WH': { vehicleType: '14WH', label: '14-Wheeler (14WH)', totalLifting: 0, market: 0, association: 0, other: 0, recordCount: 0, vehicles: new Set() }
    };

    let unclassifiedRecordsCount = 0;
    let unclassifiedMT = 0;
    let totalRecordsMatched = 0;

    const parseNumVal = (v) => {
      if (v === null || v === undefined || v === '') return 0;
      const n = parseFloat(String(v).replace(/,/g, ''));
      return isNaN(n) ? 0 : n;
    };

    // 4. Process each Cement Register record
    const seenIds = new Set();
    cementDocs.forEach(row => {
      const rowId = String(row._id);
      if (seenIds.has(rowId)) return;
      seenIds.add(rowId);

      const rawDate = row["LOADING DT"] || row["LOADING DATE"] || row["BILL DATE"] || row["DATE"];
      const isoDate = parseToYYYYMMDD(rawDate);
      if (!isoDate) return;

      // Filter by period bounds
      if (isoDate < startDateStr || isoDate > endDateStr) return;

      const rawVeh = row["VEHICLE NUMBER"] || row["VEHICLE NO"] || row["VEHICLE NO."] || "";
      const normKey = String(rawVeh).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!normKey || normKey.length < 5) return;

      const mtVal = parseNumVal(row["MT"] ?? row["TONNAGE"] ?? row["TOTAL MT"]);
      const billAmt = parseNumVal(row["Billing Amount"] ?? row["BILLING AMOUNT"] ?? row["AMOUNT"]);
      const invNo = String(row["INVOICE NO"] || row["INVOICE NO."] || "").trim();

      // Exclude zero MT adjustment rows
      if (mtVal <= 0 && billAmt <= 0 && !invNo) return;
      if (mtVal <= 0) return;

      // Match Party Master with effective date resolution
      const rawContact = partyMasterMap.get(normKey);
      let effectiveContact = rawContact;
      if (rawContact && typeof getEffectivePartyMaster === 'function') {
        effectiveContact = getEffectivePartyMaster(rawContact, isoDate) || rawContact;
      }

      // Determine Relationship Classification:
      // Priority: Party Master Relationship Type -> Fallback: Cement Register TYPE
      const rawRel = effectiveContact
        ? (effectiveContact["TYPE OF CUSTOMER "] || effectiveContact["TYPE OF CUSTOMER"] || effectiveContact.custType || effectiveContact.relationshipType || effectiveContact.relationship_type || effectiveContact.type || "")
        : (row["TYPE"] || "");

      const cleanRel = String(rawRel).trim().toUpperCase();
      const isMarket = cleanRel === "MKT" || cleanRel === "MARKET";
      const isAssoc = cleanRel === "ATOA" || cleanRel === "ATO" || cleanRel === "ASSOCIATION";

      // Determine Wheel Type:
      // Priority: Cement Register WHEEL -> Fallback: Party Master contact wheel
      const rawWheel = (row["WHEEL"] || (effectiveContact ? (effectiveContact["Type of vehicle"] || effectiveContact["Type of vehicle "] || effectiveContact.wheel_type || effectiveContact.veh_type) : "") || "").toString().toUpperCase();

      let wheelKey = null;
      if (rawWheel.includes("14")) wheelKey = "14WH";
      else if (rawWheel.includes("12")) wheelKey = "12WH";
      else if (rawWheel.includes("10")) wheelKey = "10WH";
      else if (rawWheel.includes("6") && !rawWheel.includes("16") && !rawWheel.includes("26")) wheelKey = "6W";

      if (!wheelKey || !vehicleTypeData[wheelKey]) {
        unclassifiedRecordsCount++;
        unclassifiedMT += mtVal;
        return;
      }

      totalRecordsMatched++;
      const targetGroup = vehicleTypeData[wheelKey];
      targetGroup.totalLifting += mtVal;
      targetGroup.recordCount += 1;
      targetGroup.vehicles.add(normKey);

      if (isMarket) {
        targetGroup.market += mtVal;
      } else if (isAssoc) {
        targetGroup.association += mtVal;
      } else {
        targetGroup.other += mtVal;
      }
    });

    // 5. Build final output table and chart dataset
    const vehicleOrder = ['6W', '10WH', '12WH', '14WH'];
    let grandTotalLifting = 0;
    let grandMarket = 0;
    let grandAssociation = 0;
    let grandOther = 0;

    const tableRows = vehicleOrder.map(key => {
      const g = vehicleTypeData[key];
      const lifting = Math.round(g.totalLifting * 100) / 100;
      const mkt = Math.round(g.market * 100) / 100;
      const assoc = Math.round(g.association * 100) / 100;
      const oth = Math.round(g.other * 100) / 100;

      grandTotalLifting += lifting;
      grandMarket += mkt;
      grandAssociation += assoc;
      grandOther += oth;

      return {
        vehicleType: key,
        label: g.label,
        totalLifting: lifting,
        market: mkt,
        association: assoc,
        other: oth,
        vehicleCount: g.vehicles.size,
        recordCount: g.recordCount
      };
    });

    const totalRow = {
      vehicleType: 'TOTAL',
      label: 'TOTAL',
      totalLifting: Math.round(grandTotalLifting * 100) / 100,
      market: Math.round(grandMarket * 100) / 100,
      association: Math.round(grandAssociation * 100) / 100,
      other: Math.round(grandOther * 100) / 100,
      vehicleCount: new Set([
        ...vehicleTypeData['6W'].vehicles,
        ...vehicleTypeData['10WH'].vehicles,
        ...vehicleTypeData['12WH'].vehicles,
        ...vehicleTypeData['14WH'].vehicles
      ]).size,
      recordCount: totalRecordsMatched
    };

    // Chart dataset (exactly matches table rows 6W, 10WH, 12WH, 14WH)
    const chartData = tableRows.map(r => ({
      vehicleType: r.vehicleType,
      market: r.market,
      association: r.association,
      totalLifting: r.totalLifting
    }));

    const completeTable = [...tableRows, totalRow];

    const marketPct = grandTotalLifting > 0 ? Math.round((grandMarket / grandTotalLifting) * 10000) / 100 : 0;
    const assocPct = grandTotalLifting > 0 ? Math.round((grandAssociation / grandTotalLifting) * 10000) / 100 : 0;

    return res.json({
      success: true,
      period: {
        financialYear: selectedFY || `FY ${startYear}-${String(endYear).slice(-2)}`,
        month: month || 'ALL',
        date: date || 'ALL',
        startDate: startDateStr,
        endDate: endDateStr,
        display: displayStr
      },
      table: completeTable,
      chartData,
      summary: {
        totalLifting: totalRow.totalLifting,
        marketTotal: totalRow.market,
        associationTotal: totalRow.association,
        marketPercentage: marketPct,
        associationPercentage: assocPct
      },
      unclassified: {
        count: unclassifiedRecordsCount,
        totalMT: Math.round(unclassifiedMT * 100) / 100
      }
    });
  } catch (err) {
    console.error("[VehicleMktAssoc] Error:", err);
    return res.status(500).json({ success: false, error: err.message || "Failed to generate vehicle market & association analytics" });
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
