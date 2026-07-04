const mongoose = require("mongoose");

function parseDateStrToObj(dStr) {
  if (!dStr) return null;
  // dStr can be DD-MM-YYYY or DD/MM/YYYY
  const clean = dStr.replace(/\//g, '-');
  const parts = clean.split('-');
  if (parts.length !== 3) return null;
  
  let d = parseInt(parts[0], 10);
  let m = parseInt(parts[1], 10);
  let y = parseInt(parts[2], 10);
  if (y < 100) y += 2000;
  
  if (d > 31 && y <= 31) {
    // maybe YYYY-MM-DD
    const temp = d;
    d = y;
    y = temp;
  }
  return new Date(y, m - 1, d);
}

function formatDate(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`; // Canonical format for daily_advances
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
    `${d}/${m}/${yShort}`,
    dateStr
  ];
  return Array.from(new Set(patterns));
}

function parseNum(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const s = String(val).replace(/,/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

let isRecalculating = false;

async function recalculateAdvances() {
  if (isRecalculating) return;
  isRecalculating = true;
  try {
    const cementDb = mongoose.connection.useDb("cement_register").collection("entries");
    const cashbookDb = mongoose.connection.useDb("main_cashbook").collection("entries");
    const advancesDb = mongoose.connection.useDb("invoiceAI").collection("daily_advances");
    
    // 1. Get all unique dates from Cement Register
    const allCementDates = await cementDb.distinct("LOADING DT");
    // 2. Get all unique dates from Cashbook
    const allCashbookDates = await cashbookDb.distinct("DATE");
    
    // Merge and parse dates
    const dateSet = new Set();
    [...allCementDates, ...allCashbookDates].forEach(d => {
      const obj = parseDateStrToObj(d);
      if (obj && !isNaN(obj.getTime())) {
        dateSet.add(formatDate(obj));
      }
    });
    
    // Sort chronologically
    const sortedDates = Array.from(dateSet).sort((a, b) => new Date(a) - new Date(b));
    
    let currentOpening = 0;
    
    for (const isoDate of sortedDates) {
      const patterns = getDatePatterns(isoDate);
      
      // Fetch data for this date
      const cementEntries = await cementDb.find({
        $or: [
          { "LOADING DT": { $in: patterns } },
          { "LOADING DATE": { $in: patterns } }
        ]
      }).toArray();
      
      const cbEntry = await cashbookDb.findOne({ DATE: { $in: patterns } });
      
      // Calculate sums
      let advAmt = 0;
      cementEntries.forEach(e => {
        const adv = parseNum(e["ADVANCE"] || e["LOADING ADVANCE"]);
        if (adv > 0) advAmt += adv;
      });
      
      const cashRecv = cbEntry ? parseNum(cbEntry["P_GIVEN_DAC"]) : 0;
      const miscExp = cbEntry ? parseNum(cbEntry["O_EXPENSE"]) : 0;
      
      // Formula exactly as requested: Closing Advance = Cash Received - Opening Balance - Loading Advance - Misc
      const closing = cashRecv - currentOpening - advAmt - miscExp;
      
      const doc = {
        date: isoDate,
        cashReceived: cashRecv,
        openingBalance: currentOpening,
        loadingAdvance: advAmt,
        miscExpense: miscExp,
        closingBalance: closing,
        updatedAt: new Date()
      };
      
      await advancesDb.updateOne(
        { date: isoDate },
        { $set: doc },
        { upsert: true }
      );
      
      // Cascade to next day
      currentOpening = closing;
    }
    
    console.log(`Successfully recalculated ${sortedDates.length} daily advance records.`);
    
  } catch (err) {
    console.error("Error recalculating advances:", err);
  } finally {
    isRecalculating = false;
  }
}

// Background trigger wrapper so it doesn't block routes
function triggerRecalculateAdvances() {
  setTimeout(() => {
    recalculateAdvances().catch(console.error);
  }, 100);
}

module.exports = { recalculateAdvances, triggerRecalculateAdvances, getDatePatterns };
