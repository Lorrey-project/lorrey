const mongoose = require('mongoose');
const { ObjectId } = require('mongodb');
const { getIO } = require('../socket');

const ALL_12_MONTHS = [
  'april', 'may', 'june', 'july', 'august', 'september',
  'october', 'november', 'december', 'january', 'february', 'march'
];

const MONTH_KEYS_BY_INDEX = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'
];

const num = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};

// Check if creditor matches MANOJ / MONOJ BANDHAN
const isManojBandhan = (name) => /^m[ao]noj\s*bandhan$/i.test(String(name || '').trim());

/**
 * Check if a MANOJ BANDHAN row qualifies for Indirect Expenses sync:
 * 1. creditorName is MANOJ BANDHAN / MONOJ BANDHAN
 * 2. expenseType === 'INDIRECT EXPENSES' (case-insensitive)
 * 3. billType === 'NON GST' (case-insensitive)
 * 4. particulars is non-empty
 * 5. debit > 0
 */
function isQualifyingManojIndirectExpense(row) {
  if (!row) return false;
  const isManoj = isManojBandhan(row.creditorName);
  if (!isManoj) return false;

  const expType = String(row.expenseType || '').trim().toUpperCase();
  if (expType !== 'INDIRECT EXPENSES' && expType !== 'INDIRECT EXPENSE') return false;

  const billType = String(row.billType || '').trim().toUpperCase();
  if (billType !== 'NON GST' && billType !== 'GST') return false;

  const particulars = String(row.particulars || '').trim();
  if (!particulars) return false;

  const debit = num(row.debit);
  if (debit <= 0) return false;

  return true;
}

/**
 * Parse transaction date string into Financial Year, Month Key, and exact formatted date string without timezone shift.
 */
function parseDateForIndirectExpense(dStr) {
  const clean = String(dStr || '').trim();
  let day, monthIndex, year;

  if (clean.includes('-')) {
    const parts = clean.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        // YYYY-MM-DD
        year = parseInt(parts[0], 10);
        monthIndex = parseInt(parts[1], 10) - 1;
        day = parseInt(parts[2], 10);
      } else {
        // DD-MM-YYYY
        day = parseInt(parts[0], 10);
        monthIndex = parseInt(parts[1], 10) - 1;
        year = parseInt(parts[2], 10);
      }
    }
  } else if (clean.includes('/')) {
    const parts = clean.split('/');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        // YYYY/MM/DD
        year = parseInt(parts[0], 10);
        monthIndex = parseInt(parts[1], 10) - 1;
        day = parseInt(parts[2], 10);
      } else {
        // DD/MM/YYYY
        day = parseInt(parts[0], 10);
        monthIndex = parseInt(parts[1], 10) - 1;
        year = parseInt(parts[2], 10);
      }
    }
  }

  if (day === undefined || isNaN(day) || monthIndex === undefined || isNaN(monthIndex) || year === undefined || isNaN(year)) {
    const dt = new Date(clean);
    if (!isNaN(dt.getTime())) {
      day = dt.getDate();
      monthIndex = dt.getMonth();
      year = dt.getFullYear();
    } else {
      const now = new Date();
      day = now.getDate();
      monthIndex = now.getMonth();
      year = now.getFullYear();
    }
  }

  const monthKey = MONTH_KEYS_BY_INDEX[monthIndex] || 'october';

  let startYear;
  if (monthIndex >= 3) {
    // April (3) to December (11)
    startYear = year;
  } else {
    // January (0) to March (2)
    startYear = year - 1;
  }
  const endYearShort = String((startYear + 1) % 100).padStart(2, '0');
  const fy = `FY ${startYear}-${endYearShort}`;

  return {
    fy,
    monthKey,
    formattedDate: clean || `${String(day).padStart(2, '0')}/${String(monthIndex + 1).padStart(2, '0')}/${year}`
  };
}

function getIndirectExpenseCol() {
  return mongoose.connection.db.collection('indirect_expenses');
}

/**
 * Sync a single MANOJ BANDHAN row to indirect_expenses.
 * If qualifying: creates or updates the 1-to-1 destination record in indirect_expenses.
 * If not qualifying: reverses/deletes any linked destination record if it was previously created.
 */
async function syncManojRowToIndirectExpense(manojRow) {
  try {
    if (!manojRow) return { success: false, reason: 'No row provided' };
    const col = getIndirectExpenseCol();
    const sourceIdStr = manojRow._id ? manojRow._id.toString() : '';

    if (!isQualifyingManojIndirectExpense(manojRow)) {
      if (sourceIdStr) {
        const delRes = await col.deleteMany({
          sourceType: 'MANOJ_BANDHAN',
          sourceManojBandhanId: sourceIdStr
        });
        if (delRes.deletedCount > 0) {
          try {
            const io = getIO();
            if (io) io.emit('indirectExpenseUpdates', { action: 'manojRowRemoved', sourceId: sourceIdStr });
          } catch (_) {}
        }
      }
      return { success: true, qualified: false, removed: true };
    }

    if (!sourceIdStr) {
      return { success: false, reason: 'Source row missing MongoDB _id' };
    }

    const { fy, monthKey, formattedDate } = parseDateForIndirectExpense(manojRow.date);
    const amount = num(manojRow.debit);

    const emptyMonths = {};
    ALL_12_MONTHS.forEach(m => {
      emptyMonths[m] = {
        bank: m === monthKey ? amount : '',
        cash: '',
        siteCash: ''
      };
    });

    const existing = await col.findOne({
      sourceType: 'MANOJ_BANDHAN',
      sourceManojBandhanId: sourceIdStr
    });

    const billType = manojRow.billType || 'NON GST';

    if (existing) {
      await col.updateOne(
        { _id: existing._id },
        {
          $set: {
            date: formattedDate,
            billType,
            particulars: manojRow.particulars,
            financialYear: fy,
            months: emptyMonths,
            remarks: manojRow.remarks || '',
            updated_at: new Date()
          }
        }
      );
    } else {
      // Find highest slNo for this FY
      const maxDoc = await col.findOne({ financialYear: fy }, { sort: { slNo: -1 } });
      const nextSl = (maxDoc && maxDoc.slNo ? Number(maxDoc.slNo) : 0) + 1;

      const newDoc = {
        slNo: nextSl,
        date: formattedDate,
        billType,
        particulars: manojRow.particulars,
        financialYear: fy,
        months: emptyMonths,
        remarks: manojRow.remarks || '',
        sourceType: 'MANOJ_BANDHAN',
        sourceManojBandhanId: sourceIdStr,
        created_at: new Date(),
        updated_at: new Date()
      };

      await col.insertOne(newDoc);
    }

    try {
      const io = getIO();
      if (io) {
        io.emit('indirectExpenseUpdates', { action: 'manojRowSynced', sourceId: sourceIdStr });
      }
    } catch (_) {}

    return { success: true, qualified: true };
  } catch (err) {
    console.error('[monojIndirectExpenseManager] sync error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Reverse / Delete a MANOJ BANDHAN row's linked record in indirect_expenses.
 */
async function reverseManojRowFromIndirectExpense(manojRowOrId) {
  try {
    if (!manojRowOrId) return;
    const col = getIndirectExpenseCol();
    const sourceIdStr = String(manojRowOrId._id || manojRowOrId);
    if (!sourceIdStr) return;

    const delRes = await col.deleteMany({
      sourceType: 'MANOJ_BANDHAN',
      sourceManojBandhanId: sourceIdStr
    });

    if (delRes.deletedCount > 0) {
      try {
        const io = getIO();
        if (io) {
          io.emit('indirectExpenseUpdates', { action: 'manojRowDeleted', sourceId: sourceIdStr });
        }
      } catch (_) {}
    }
  } catch (err) {
    console.error('[monojIndirectExpenseManager] reverse error:', err);
  }
}

/**
 * Batch sync multiple rows (e.g. from bulk-save).
 */
async function syncManojRowsBatch(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const results = [];
  for (const r of rows) {
    if (isManojBandhan(r.creditorName)) {
      const res = await syncManojRowToIndirectExpense(r);
      results.push(res);
    }
  }
  return results;
}

module.exports = {
  isQualifyingManojIndirectExpense,
  parseDateForIndirectExpense,
  syncManojRowToIndirectExpense,
  reverseManojRowFromIndirectExpense,
  syncManojRowsBatch,
  ALL_12_MONTHS
};
