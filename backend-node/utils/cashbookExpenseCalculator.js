const mongoose = require('mongoose');

const CALENDAR_MONTH_NAMES = [
  '',
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december'
];

/**
 * Robust numeric parser handling numbers, strings with commas, spaces, currency symbols.
 */
function parseNumber(val) {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const cleaned = String(val).replace(/,/g, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

/**
 * Normalizes any date into a strict DD-MM-YYYY key format.
 * Strictly date-only, timezone-immune.
 */
function normalizeDateToKey(val) {
  if (!val) return '';
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    const d = String(val.getDate()).padStart(2, '0');
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const y = val.getFullYear();
    return `${d}-${m}-${y}`;
  }

  // Handle Excel serial date numbers (e.g. 45000-55000)
  if (typeof val === 'number' || /^\d{5}$/.test(String(val).trim())) {
    const num = Number(val);
    if (num > 25569 && num < 60000) {
      const dateObj = new Date(Math.round((num - 25569) * 86400 * 1000));
      const d = String(dateObj.getUTCDate()).padStart(2, '0');
      const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
      const y = dateObj.getUTCFullYear();
      return `${d}-${m}-${y}`;
    }
  }

  const str = String(val).trim().split('T')[0].trim();
  const parts = str.split(/[-\/\.]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY-MM-DD or YYYY/MM/DD
      const y = parseInt(parts[0], 10);
      const m = String(parseInt(parts[1], 10)).padStart(2, '0');
      const d = String(parseInt(parts[2], 10)).padStart(2, '0');
      if (y > 1900 && parseInt(m, 10) >= 1 && parseInt(m, 10) <= 12 && parseInt(d, 10) >= 1 && parseInt(d, 10) <= 31) {
        return `${d}-${m}-${y}`;
      }
    } else {
      // DD-MM-YYYY or DD/MM/YYYY or D/M/YY
      const d = String(parseInt(parts[0], 10)).padStart(2, '0');
      const m = String(parseInt(parts[1], 10)).padStart(2, '0');
      let y = parseInt(parts[2], 10);
      if (y < 100) y += 2000;
      if (y > 1900 && parseInt(m, 10) >= 1 && parseInt(m, 10) <= 12 && parseInt(d, 10) >= 1 && parseInt(d, 10) <= 31) {
        return `${d}-${m}-${y}`;
      }
    }
  }
  return '';
}

/**
 * Extracts Loading Advance, Site Cash Advance, and Office Cash Advance from a Cement Register row.
 */
function extractCementAdvances(entry) {
  if (!entry || typeof entry !== 'object') {
    return { loadingAdv: 0, siteCashAdv: 0, officeCashAdv: 0, normDate: '' };
  }

  const dateVal = entry['LOADING DT'] || entry['LOADING DATE'] || entry['BILL DATE'] || entry['DATE'] || entry['Date'];
  const normDate = normalizeDateToKey(dateVal);

  const getNum = (...keys) => {
    for (const k of keys) {
      const v = entry[k];
      if (v !== undefined && v !== null && v !== '') {
        const n = parseNumber(v);
        if (n !== 0) return n;
      }
    }
    return 0;
  };

  const loadingAdv = getNum('ADVANCE', 'LOADING ADVANCE', 'Loading Advance', 'ADV', 'Advance');
  const siteCashAdv = getNum('SITE CASH ADVANCE', 'Site Cash Advance', 'SITE CASH', 'Site Cash', 'SITE_CASH', 'Site Cash Adv', 'SITE CASH ADV');
  const officeCashAdv = getNum('OFFICE CASH ADVANCE', 'Office Cash Advance', 'OFFICE CASH', 'Office Cash', 'OFFICE_CASH', 'Office Cash Adv', 'OFFICE CASH ADV');

  return { loadingAdv, siteCashAdv, officeCashAdv, normDate };
}

/**
 * Extracts Site Cash and Office Cash from an Indirect Expenses document.
 * Strictly ignores Bank amount and ensures no cross-column contamination.
 */
function extractIndirectExpenses(doc) {
  if (!doc || typeof doc !== 'object') {
    return { siteCash: 0, officeCash: 0, normDate: '' };
  }

  const rawDate = doc.date || doc.transactionDate || doc.DATE || doc.Date;
  const normDate = normalizeDateToKey(rawDate);
  if (!normDate) {
    return { siteCash: 0, officeCash: 0, normDate: '' };
  }

  const parts = normDate.split('-');
  if (parts.length !== 3) {
    return { siteCash: 0, officeCash: 0, normDate: '' };
  }
  const mNum = parseInt(parts[1], 10);
  const monthKey = CALENDAR_MONTH_NAMES[mNum];
  if (!monthKey) {
    return { siteCash: 0, officeCash: 0, normDate: '' };
  }

  let mObj = null;
  if (doc.months && typeof doc.months === 'object') {
    if (!Array.isArray(doc.months)) {
      mObj = doc.months[monthKey];
    } else {
      for (const item of doc.months) {
        if (item && item[monthKey]) {
          mObj = item[monthKey];
          break;
        }
        if (item && item.month === monthKey) {
          mObj = item;
          break;
        }
      }
    }
  }

  // 1. Site Cash
  let siteCash = 0;
  if (mObj && mObj.siteCash !== undefined && mObj.siteCash !== null && mObj.siteCash !== '') {
    siteCash = parseNumber(mObj.siteCash);
  } else if (doc.siteCash !== undefined && doc.siteCash !== null && doc.siteCash !== '') {
    siteCash = parseNumber(doc.siteCash);
  } else if (doc['SITE CASH'] !== undefined || doc['Site Cash'] !== undefined) {
    siteCash = parseNumber(doc['SITE CASH'] || doc['Site Cash']);
  }

  // 2. Office Cash (or cash) - strictly excluding bank and siteCash
  let officeCash = 0;
  if (mObj) {
    const rawCash = (mObj.officeCash !== undefined && mObj.officeCash !== null && mObj.officeCash !== '')
      ? mObj.officeCash
      : mObj.cash;
    if (rawCash !== undefined && rawCash !== null && rawCash !== '') {
      officeCash = parseNumber(rawCash);
    }
  } else if (doc.officeCash !== undefined && doc.officeCash !== null && doc.officeCash !== '') {
    officeCash = parseNumber(doc.officeCash);
  } else if (doc.cash !== undefined && doc.cash !== null && doc.cash !== '') {
    officeCash = parseNumber(doc.cash);
  } else if (doc['OFFICE CASH'] !== undefined || doc['Office Cash'] !== undefined) {
    officeCash = parseNumber(doc['OFFICE CASH'] || doc['Office Cash']);
  }

  return { siteCash, officeCash, normDate };
}

/**
 * Aggregates all cement docs and indirect docs into date-wise expense totals.
 *
 * SITE CASH EXP (date) =
 *   SUM(Cement Register Loading Advance for date)
 * + SUM(Cement Register Site Cash Advance for date)
 * + SUM(Indirect Expenses Site Cash for date)
 *
 * OFFICE EXP (date) =
 *   SUM(Cement Register Office Cash Advance for date)
 * + SUM(Indirect Expenses Office Cash for date)
 */
function aggregateCashbookExpenses(cementDocs = [], indirectDocs = []) {
  const cementLoadingAdvMap = {};
  const cementSiteCashAdvMap = {};
  const cementOfficeAdvMap = {};
  const indirectSiteCashMap = {};
  const indirectOfficeCashMap = {};

  cementDocs.forEach(entry => {
    const { loadingAdv, siteCashAdv, officeCashAdv, normDate } = extractCementAdvances(entry);
    if (!normDate) return;

    if (loadingAdv > 0) {
      cementLoadingAdvMap[normDate] = (cementLoadingAdvMap[normDate] || 0) + loadingAdv;
    }
    if (siteCashAdv > 0) {
      cementSiteCashAdvMap[normDate] = (cementSiteCashAdvMap[normDate] || 0) + siteCashAdv;
    }
    if (officeCashAdv > 0) {
      cementOfficeAdvMap[normDate] = (cementOfficeAdvMap[normDate] || 0) + officeCashAdv;
    }
  });

  indirectDocs.forEach(doc => {
    const { siteCash, officeCash, normDate } = extractIndirectExpenses(doc);
    if (!normDate) return;

    if (siteCash > 0) {
      indirectSiteCashMap[normDate] = (indirectSiteCashMap[normDate] || 0) + siteCash;
    }
    if (officeCash > 0) {
      indirectOfficeCashMap[normDate] = (indirectOfficeCashMap[normDate] || 0) + officeCash;
    }
  });

  // Calculate final totals for any requested date
  const getSiteCashExp = (normDate) => {
    if (!normDate) return 0;
    const loadingAdv = cementLoadingAdvMap[normDate] || 0;
    const siteCashAdv = cementSiteCashAdvMap[normDate] || 0;
    const indirectSite = indirectSiteCashMap[normDate] || 0;
    return loadingAdv + siteCashAdv + indirectSite;
  };

  const getOfficeExp = (normDate) => {
    if (!normDate) return 0;
    const cementOffice = cementOfficeAdvMap[normDate] || 0;
    const indirectOffice = indirectOfficeCashMap[normDate] || 0;
    return cementOffice + indirectOffice;
  };

  return {
    cementLoadingAdvMap,
    cementSiteCashAdvMap,
    cementOfficeAdvMap,
    indirectSiteCashMap,
    indirectOfficeCashMap,
    getSiteCashExp,
    getOfficeExp
  };
}

/**
 * Calculates expenses for a single date directly from MongoDB collections.
 */
async function calculateSingleDateExpenses(targetDate) {
  const normDate = normalizeDateToKey(targetDate);
  if (!normDate) return { sExpense: 0, oExpense: 0, normDate: '' };

  const parts = normDate.split('-');
  const day = parts[0];
  const month = parts[1];
  const year = parts[2];
  const isoDate = `${year}-${month}-${day}`;
  const slashDate = `${day}/${month}/${year}`;
  const unpaddedDate = `${parseInt(day, 10)}-${parseInt(month, 10)}-${year}`;
  const unpaddedSlash = `${parseInt(day, 10)}/${parseInt(month, 10)}/${year}`;

  const datePatterns = [normDate, isoDate, slashDate, unpaddedDate, unpaddedSlash];

  const cementCol = mongoose.connection.useDb('cement_register').collection('entries');
  const indirectCol = mongoose.connection.useDb('invoiceAI').collection('indirect_expenses');

  const [cementDocs, indirectDocs] = await Promise.all([
    cementCol.find({
      $or: [
        { 'LOADING DT': { $in: datePatterns } },
        { 'LOADING DATE': { $in: datePatterns } },
        { 'BILL DATE': { $in: datePatterns } },
        { 'DATE': { $in: datePatterns } }
      ]
    }).toArray().catch(() => []),
    indirectCol.find({
      $or: [
        { date: { $in: datePatterns } },
        { transactionDate: { $in: datePatterns } },
        { DATE: { $in: datePatterns } }
      ]
    }).toArray().catch(() => [])
  ]);

  const aggregated = aggregateCashbookExpenses(cementDocs, indirectDocs);
  return {
    normDate,
    sExpense: aggregated.getSiteCashExp(normDate),
    oExpense: aggregated.getOfficeExp(normDate)
  };
}

module.exports = {
  CALENDAR_MONTH_NAMES,
  parseNumber,
  normalizeDateToKey,
  extractCementAdvances,
  extractIndirectExpenses,
  aggregateCashbookExpenses,
  calculateSingleDateExpenses
};
