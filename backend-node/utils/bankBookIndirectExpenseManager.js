const mongoose = require('mongoose');
const { getIO } = require('../socket');

const ALL_12_MONTHS = [
  'april', 'may', 'june', 'july', 'august', 'september',
  'october', 'november', 'december', 'january', 'february', 'march'
];

const MONTH_KEYS_BY_INDEX = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'
];

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'
];

// The exact 21 qualifying options
const QUALIFYING_PARTICULARS = [
  'SALARY',
  'BANK CHARGES',
  'BANK GUARANTEE CHARGES',
  'BONUS',
  'COURIER CHARGERS',
  'DEPRECIATION',
  'ENTERTENTMENT EXP',
  'Interest on Partners Capital',
  'INTEREST ON PUNJAB & SIND BANK (CC)',
  'Late Fees on TDS',
  'MISC EXPENSES',
  'OFFICE EXPENSES',
  'Partner Salary',
  'PRINTING & STATIONERY',
  'PROFESSIONAL CHARGES',
  'P TAX',
  'RENT EXP',
  'SERVICES CHARGES',
  'Software development Expenses',
  'SUBSCRIPTION',
  'TRAVELLING & CONVANCE'
];

const num = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};

/**
 * Checks if the Names field matches INDIRECT EXPENSE (or INDIRECT EXPENSES)
 */
function isIndirectExpenseNames(namesStr) {
  if (!namesStr) return false;
  const clean = String(namesStr).trim().toUpperCase().replace(/[^A-Z]/g, '');
  return clean === 'INDIRECTEXPENSE' || clean === 'INDIRECTEXPENSES';
}

/**
 * Normalizes and matches a Bank Book ledger name against the 21 qualifying options.
 * Returns the exact canonical string from QUALIFYING_PARTICULARS, or null if not qualifying.
 */
function matchQualifyingLedger(ledgerName) {
  if (!ledgerName) return null;
  const raw = String(ledgerName).trim();
  const rawUpper = raw.toUpperCase();
  const norm = rawUpper.replace(/[^A-Z0-9]/g, '');

  for (const opt of QUALIFYING_PARTICULARS) {
    const optUpper = opt.toUpperCase();
    const optNorm = optUpper.replace(/[^A-Z0-9]/g, '');
    if (norm === optNorm) return opt;
  }

  // Handle common variations in Bank Book
  if (norm === 'PRINTINGSTATIONARY' || norm === 'PRINTINGANDSTATIONARY' || norm === 'PRINTINGANDSTATIONERY' || norm === 'PRINTINGSTATIONERY') {
    return 'PRINTING & STATIONERY';
  }
  if (norm === 'ENTERTAINMENTEXP' || norm === 'ENTERTENMENTEXP') {
    return 'ENTERTENTMENT EXP';
  }
  if (norm === 'COURIERCHARGES' || norm === 'COURIERCHARGERS') {
    return 'COURIER CHARGERS';
  }
  if (norm === 'SERVICECHARGES' || norm === 'SERVICESCHARGES') {
    return 'SERVICES CHARGES';
  }
  if (norm === 'SOFTWAREDEVELOPMENTEXPENSE' || norm === 'SOFTWAREDEVELOPMENTEXPENSES') {
    return 'Software development Expenses';
  }
  if (norm === 'INTERESTONPARTNERSCAPITAL' || norm === 'INTERESTONPARTNERCAPITAL' || norm === 'PARTNERINTEREST') {
    return 'Interest on Partners Capital';
  }
  if (norm === 'LATEFEESONTDS' || norm === 'LATEFEETDS') {
    return 'Late Fees on TDS';
  }
  if (norm === 'PARTNERSALARY') {
    return 'Partner Salary';
  }
  if (norm === 'PTAX' || norm === 'EMPLOYEEPTAX') {
    return 'P TAX';
  }
  if (norm === 'SALARY' || norm === 'STAFFSALARY') {
    return 'SALARY';
  }
  if (norm.includes('TRAV') && norm.includes('CONV')) {
    return 'TRAVELLING & CONVANCE';
  }

  return null;
}

/**
 * Checks if a Bank Book row qualifies for Indirect Expenses synchronization:
 * 1. Names === 'INDIRECT EXPENSE' or 'INDIRECT EXPENSES'
 * 2. Ledger Name matches one of the 21 qualifying options
 * 3. Amount (Withdraw or Deposit) > 0
 */
function isQualifyingBankBookIndirectExpense(doc) {
  if (!doc) return false;
  const names = doc.names || doc['Names'] || '';
  if (!isIndirectExpenseNames(names)) return false;

  const ledgerName = doc.ledgerName || doc['Ledger Name'] || '';
  const matchedParticulars = matchQualifyingLedger(ledgerName);
  if (!matchedParticulars) return false;

  const amount = num(doc.withdraw !== undefined && doc.withdraw !== null && doc.withdraw !== '' ? doc.withdraw :
                 (doc['Withdraw'] !== undefined && doc['Withdraw'] !== null && doc['Withdraw'] !== '' ? doc['Withdraw'] :
                 (doc.deposit !== undefined && doc.deposit !== null && doc.deposit !== '' ? doc.deposit :
                 (doc['Deposit'] !== undefined && doc['Deposit'] !== null && doc['Deposit'] !== '' ? doc['Deposit'] : doc.amount))));

  if (amount <= 0) return false;

  return true;
}

/**
 * Robust date, month, and Financial Year resolution for Bank Book documents.
 * Ensures consistent month indexing without timezone shift.
 */
function resolveBankBookDateAndFy(doc) {
  let mIndex = null; // 0-indexed: 0 = Jan, 9 = Oct, 11 = Dec
  let year = null;
  let rawDate = doc.transactionDate || doc['Transaction Date'] || '';

  // 1. Check selectedMonth or month field
  const monthVal = doc.month !== undefined && doc.month !== null && doc.month !== '' ? doc.month :
                  (doc['Month'] !== undefined && doc['Month'] !== null && doc['Month'] !== '' ? doc['Month'] : doc.selectedMonth);

  if (monthVal !== undefined && monthVal !== null && monthVal !== '') {
    if (typeof monthVal === 'number' && monthVal >= 1 && monthVal <= 12) {
      mIndex = monthVal - 1;
    } else {
      const mStr = String(monthVal).trim().toLowerCase();
      const idx = MONTH_NAMES.findIndex(name => name === mStr || name.startsWith(mStr.slice(0, 3)));
      if (idx !== -1) {
        mIndex = idx;
      } else {
        const parsedM = parseInt(mStr, 10);
        if (!isNaN(parsedM) && parsedM >= 1 && parsedM <= 12) {
          mIndex = parsedM - 1;
        }
      }
    }
  }

  // 2. Parse transaction date
  let day = null, dateParsedM = null, dateParsedY = null;
  const cleanDate = String(rawDate || '').trim();

  if (cleanDate.includes('-')) {
    const parts = cleanDate.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        // YYYY-MM-DD
        dateParsedY = parseInt(parts[0], 10);
        dateParsedM = parseInt(parts[1], 10) - 1;
        day = parseInt(parts[2], 10);
      } else {
        // DD-MM-YYYY
        day = parseInt(parts[0], 10);
        dateParsedM = parseInt(parts[1], 10) - 1;
        dateParsedY = parseInt(parts[2], 10);
      }
    }
  } else if (cleanDate.includes('/')) {
    const parts = cleanDate.split('/');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        // YYYY/MM/DD
        dateParsedY = parseInt(parts[0], 10);
        dateParsedM = parseInt(parts[1], 10) - 1;
        day = parseInt(parts[2], 10);
      } else {
        // DD/MM/YYYY
        day = parseInt(parts[0], 10);
        dateParsedM = parseInt(parts[1], 10) - 1;
        dateParsedY = parseInt(parts[2], 10);
      }
    }
  }

  if (mIndex === null && dateParsedM !== null && !isNaN(dateParsedM) && dateParsedM >= 0 && dateParsedM <= 11) {
    mIndex = dateParsedM;
  }

  // 3. Resolve year
  const yearVal = doc.year !== undefined && doc.year !== null && doc.year !== '' ? doc.year :
                 (doc['Year'] !== undefined && doc['Year'] !== null && doc['Year'] !== '' ? doc['Year'] : doc.selectedYear);

  if (yearVal !== undefined && yearVal !== null && yearVal !== '') {
    const match = String(yearVal).match(/(\d{4})/);
    if (match) {
      const parsedY = parseInt(match[1], 10);
      if (String(yearVal).toUpperCase().includes('FY') && mIndex !== null) {
        year = mIndex >= 3 ? parsedY : parsedY + 1;
      } else {
        year = parsedY;
      }
    }
  }

  if (!year && dateParsedY && !isNaN(dateParsedY)) {
    year = dateParsedY;
  }

  if (mIndex === null) mIndex = 9; // Fallback to current / October
  if (!year) year = new Date().getFullYear();

  const monthKey = MONTH_KEYS_BY_INDEX[mIndex] || 'october';

  let startYear;
  if (mIndex >= 3) {
    // April (3) to December (11)
    startYear = year;
  } else {
    // January (0) to March (2)
    startYear = year - 1;
  }
  const endYearShort = String((startYear + 1) % 100).padStart(2, '0');
  const fy = `FY ${startYear}-${endYearShort}`;

  const formattedDate = cleanDate || `${String(day || 1).padStart(2, '0')}/${String(mIndex + 1).padStart(2, '0')}/${year}`;

  return {
    fy,
    monthKey,
    formattedDate
  };
}

function getIndirectExpenseCol() {
  return mongoose.connection.db.collection('indirect_expenses');
}

/**
 * Sync a single Bank Book document to indirect_expenses.
 * Idempotent, 1-to-1 mapping based on sourceBankBookId.
 */
async function syncBankBookDocToIndirectExpense(doc) {
  try {
    if (!doc) return { success: false, reason: 'No document provided' };
    const col = getIndirectExpenseCol();
    const sourceIdStr = doc._id ? doc._id.toString() : '';

    if (!isQualifyingBankBookIndirectExpense(doc)) {
      if (sourceIdStr) {
        const delRes = await col.deleteMany({
          sourceType: 'BANK_BOOK',
          sourceBankBookId: sourceIdStr
        });
        if (delRes.deletedCount > 0) {
          try {
            const io = getIO();
            if (io) io.emit('indirectExpenseUpdates', { action: 'bankBookRowRemoved', sourceId: sourceIdStr });
          } catch (_) {}
        }
      }
      return { success: true, qualified: false, removed: true };
    }

    if (!sourceIdStr) {
      return { success: false, reason: 'Source document missing MongoDB _id' };
    }

    const ledgerName = doc.ledgerName || doc['Ledger Name'] || '';
    const particulars = matchQualifyingLedger(ledgerName) || 'MISC EXPENSES';
    const { fy, monthKey, formattedDate } = resolveBankBookDateAndFy(doc);

    const amount = num(doc.withdraw !== undefined && doc.withdraw !== null && doc.withdraw !== '' ? doc.withdraw :
                   (doc['Withdraw'] !== undefined && doc['Withdraw'] !== null && doc['Withdraw'] !== '' ? doc['Withdraw'] :
                   (doc.deposit !== undefined && doc.deposit !== null && doc.deposit !== '' ? doc.deposit :
                   (doc['Deposit'] !== undefined && doc['Deposit'] !== null && doc['Deposit'] !== '' ? doc['Deposit'] : doc.amount))));

    const emptyMonths = {};
    ALL_12_MONTHS.forEach(m => {
      emptyMonths[m] = {
        bank: m === monthKey ? amount : '',
        cash: '',
        siteCash: ''
      };
    });

    const existing = await col.findOne({
      sourceType: 'BANK_BOOK',
      sourceBankBookId: sourceIdStr
    });

    const remarks = doc.remarks || doc['Remarks'] || '';
    const billType = doc.billType || doc['Bill Type'] || doc['BILL TYPE'] || '';

    if (existing) {
      await col.updateOne(
        { _id: existing._id },
        {
          $set: {
            date: formattedDate,
            billType: billType || existing.billType || '',
            particulars,
            financialYear: fy,
            months: emptyMonths,
            remarks,
            updated_at: new Date()
          }
        }
      );
    } else {
      const maxDoc = await col.findOne({ financialYear: fy }, { sort: { slNo: -1 } });
      const nextSl = (maxDoc && maxDoc.slNo ? Number(maxDoc.slNo) : 0) + 1;

      const newDoc = {
        slNo: nextSl,
        date: formattedDate,
        billType: billType || '',
        particulars,
        financialYear: fy,
        months: emptyMonths,
        remarks,
        sourceType: 'BANK_BOOK',
        sourceBankBookId: sourceIdStr,
        created_at: new Date(),
        updated_at: new Date()
      };

      await col.insertOne(newDoc);
    }

    try {
      const io = getIO();
      if (io) {
        io.emit('indirectExpenseUpdates', { action: 'bankBookRowSynced', sourceId: sourceIdStr });
      }
    } catch (_) {}

    return { success: true, qualified: true };
  } catch (err) {
    console.error('[bankBookIndirectExpenseManager] sync error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Batch sync Bank Book documents to indirect_expenses.
 */
async function syncBankBookDocsToIndirectExpense(docs) {
  if (!docs || !Array.isArray(docs)) return;
  for (const doc of docs) {
    await syncBankBookDocToIndirectExpense(doc);
  }
}

/**
 * Reverse / Delete a Bank Book row's linked record in indirect_expenses.
 */
async function reverseBankBookDocFromIndirectExpense(docOrId) {
  try {
    if (!docOrId) return;
    const col = getIndirectExpenseCol();
    const sourceIdStr = String(docOrId._id || docOrId);
    if (!sourceIdStr) return;

    const delRes = await col.deleteMany({
      sourceType: 'BANK_BOOK',
      sourceBankBookId: sourceIdStr
    });

    if (delRes.deletedCount > 0) {
      try {
        const io = getIO();
        if (io) {
          io.emit('indirectExpenseUpdates', { action: 'bankBookRowDeleted', sourceId: sourceIdStr });
        }
      } catch (_) {}
    }
  } catch (err) {
    console.error('[bankBookIndirectExpenseManager] reverse error:', err);
  }
}

/**
 * Batch reverse Bank Book documents from indirect_expenses.
 */
async function reverseBankBookDocsFromIndirectExpense(docsOrIds) {
  if (!docsOrIds || !Array.isArray(docsOrIds)) return;
  const ids = docsOrIds.map(d => String(d._id || d)).filter(Boolean);
  if (ids.length === 0) return;

  try {
    const col = getIndirectExpenseCol();
    const delRes = await col.deleteMany({
      sourceType: 'BANK_BOOK',
      sourceBankBookId: { $in: ids }
    });

    if (delRes.deletedCount > 0) {
      try {
        const io = getIO();
        if (io) {
          io.emit('indirectExpenseUpdates', { action: 'bankBookRowsDeleted', count: delRes.deletedCount });
        }
      } catch (_) {}
    }
  } catch (err) {
    console.error('[bankBookIndirectExpenseManager] batch reverse error:', err);
  }
}

module.exports = {
  QUALIFYING_PARTICULARS,
  isIndirectExpenseNames,
  matchQualifyingLedger,
  isQualifyingBankBookIndirectExpense,
  resolveBankBookDateAndFy,
  syncBankBookDocToIndirectExpense,
  syncBankBookDocsToIndirectExpense,
  reverseBankBookDocFromIndirectExpense,
  reverseBankBookDocsFromIndirectExpense
};
