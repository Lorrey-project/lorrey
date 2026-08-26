const express = require("express");
const router = express.Router();
const AccountDetail = require("../models/AccountDetail");
const moment = require("moment");

const MONTHS = [
  "January", "February", "March", "April", "May", "June", 
  "July", "August", "September", "October", "November", "December"
];

// Helper to parse FY string to start/end years
function parseFY(fyStr) {
  if (!fyStr || !fyStr.includes('-')) {
    const m = moment().month(); // 0-11
    const y = moment().year();
    const startYear = m >= 3 ? y : y - 1;
    return { startYear, endYear: startYear + 1 };
  }
  const parts = fyStr.split('-');
  const startYear = parseInt(parts[0], 10);
  return { startYear, endYear: startYear + 1 };
}

// Helper to calculate strict date range
function getDateRange(period, financialYearStr, monthStr, dateStr) {
  const now = moment();
  const today = now.format('YYYY-MM-DD');

  if (period === 'TODAY') {
    return { start: today, end: today };
  }
  
  if (period === 'YEARLY') {
    const { startYear, endYear } = parseFY(financialYearStr);
    const start = `${startYear}-04-01`;
    const end = `${endYear}-03-31`;
    
    // Clamp to today if we are in the middle of this FY or if it's in the future
    if (today >= start && today <= end) {
      return { start, end: today };
    } else if (today < start) {
      // Future FY - return a range that yields no data
      return { start, end: moment(start).subtract(1, 'days').format('YYYY-MM-DD') };
    }
    return { start, end };
  }
  
  if (period === 'MONTHLY') {
    const { startYear, endYear } = parseFY(financialYearStr);
    const monthIndex = MONTHS.indexOf(monthStr);
    
    // Default to current month if invalid
    const targetMonthIndex = monthIndex >= 0 ? monthIndex : now.month();
    
    // In India FY: Apr (3) to Dec (11) is startYear. Jan (0) to Mar (2) is endYear.
    const targetYear = targetMonthIndex >= 3 ? startYear : endYear;
    
    // Determine start and end based on dateStr ("ALL" or specific day like "15")
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
    
    let start = startObj.format('YYYY-MM-DD');
    let end = endObj.format('YYYY-MM-DD');
    
    // Clamp to today if end date is in the future
    if (endObj.isAfter(now, 'day')) {
      if (startObj.isAfter(now, 'day')) {
         // entirely in the future
         end = startObj.clone().subtract(1, 'days').format('YYYY-MM-DD');
      } else {
         end = today;
      }
    }
    
    return { start, end };
  }
  
  // Fallback
  return { start: today, end: today };
}

async function fetchChartData(ledgerName, dateRange) {
  // Query by ledger and strict date range
  const matchQuery = {
    ledgerName: ledgerName,
    transactionDate: { $gte: dateRange.start, $lte: dateRange.end }
  };
  
  const records = await AccountDetail.find(matchQuery);
  
  let totalAmount = 0;
  let dateMap = {};
  
  records.forEach(record => {
    // Parse amounts
    const wStr = record.withdraw ? record.withdraw.toString().replace(/,/g, '').trim() : '';
    const dStr = record.deposit ? record.deposit.toString().replace(/,/g, '').trim() : '';
    
    const w = (!wStr || wStr === '-') ? 0 : parseFloat(wStr) || 0;
    const d = (!dStr || dStr === '-') ? 0 : parseFloat(dStr) || 0;
    
    const amount = d + w; 
    if (amount <= 0) return;
    
    totalAmount += amount;
    
    // Format the date strictly as the slice category (e.g. "12 Aug 2026", "1 Jun 2026")
    const dateStr = record.transactionDate;
    const formattedDate = moment(dateStr).format('D MMM YYYY');
    
    if (!dateMap[formattedDate]) {
      dateMap[formattedDate] = 0;
    }
    dateMap[formattedDate] += amount;
  });
  
  // Format for pie chart (sort by date chronologically)
  let pieData = Object.keys(dateMap).map(key => ({
    name: key, // 'D MMM YYYY'
    dateObj: moment(key, 'D MMM YYYY').valueOf(),
    value: dateMap[key]
  }));
  
  pieData.sort((a, b) => a.dateObj - b.dateObj);
  
  // Remove dateObj before sending to client
  pieData = pieData.map(item => ({ name: item.name, value: item.value }));
  
  return {
    totalAmount,
    transactionCount: records.length,
    pieData
  };
}

router.get("/", async (req, res) => {
  try {
    const { ledger, period, month, financialYear, date } = req.query;
    
    if (!ledger) {
      return res.status(400).json({ error: "Ledger is required" });
    }
    
    const currentRange = getDateRange(period || 'TODAY', financialYear, month, date);
    const currentData = await fetchChartData(ledger, currentRange);
    
    res.json({
      success: true,
      currentRange,
      currentData
    });
    
  } catch (err) {
    console.error("Pie Chart Data Error:", err);
    res.status(500).json({ error: "Failed to fetch pie chart data" });
  }
});

module.exports = router;
