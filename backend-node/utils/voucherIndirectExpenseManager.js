const mongoose = require('mongoose');
const { getIO } = require('../socket');

const MONTH_KEYS_BY_INDEX = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'
];

const ALL_12_MONTHS = [
  'april', 'may', 'june', 'july', 'august', 'september',
  'october', 'november', 'december', 'january', 'february', 'march'
];

const PARTICULARS_OPTIONS = [
  'SALARY',
  'BANK CHARGES',
  'BANK GUARANTEE CHARGES',
  'BONUS',
  'COURIER CHARGERS',
  'DEPRECIATION',
  'ENTERTENMENT EXP',
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

/**
 * Check if voucher originates from SITE panel
 */
function isSiteVoucher(voucher) {
  if (!voucher) return false;
  const panelSource = String(voucher.panelSource || '').toUpperCase();
  const createdByRole = String(voucher.createdByRole || '').toUpperCase();
  const appliedPanel = String(voucher.appliedPanel || '').toUpperCase();
  return panelSource === 'SITE' || createdByRole.includes('SITE') || appliedPanel === 'SITE';
}

/**
 * Timezone-safe determination of Financial Year (e.g. 'FY 2026-27'),
 * Month Key (e.g. 'october'), and formatted date (DD/MM/YYYY)
 */
function getFinancialYearAndMonth(dateInput) {
  let day, monthIndex, year, clean;

  if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
    day = dateInput.getDate();
    monthIndex = dateInput.getMonth();
    year = dateInput.getFullYear();
    clean = `${String(day).padStart(2, '0')}/${String(monthIndex + 1).padStart(2, '0')}/${year}`;
  } else if (typeof dateInput === 'string' && dateInput.trim()) {
    clean = dateInput.trim();
    if (clean.includes('T')) {
      const dt = new Date(clean);
      if (!isNaN(dt.getTime())) {
        day = dt.getDate();
        monthIndex = dt.getMonth();
        year = dt.getFullYear();
      }
    } else {
      const sep = clean.includes('/') ? '/' : (clean.includes('-') ? '-' : null);
      if (sep) {
        const parts = clean.split(sep);
        if (parts.length === 3) {
          if (parts[0].length === 4) {
            // YYYY-MM-DD
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
    }
  }

  if (day === undefined || isNaN(day) || monthIndex === undefined || isNaN(monthIndex) || year === undefined || isNaN(year)) {
    const dt = new Date(dateInput || new Date());
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

  const formattedDate = `${String(day).padStart(2, '0')}/${String(monthIndex + 1).padStart(2, '0')}/${year}`;

  return { fy, monthKey, formattedDate, dateStr: formattedDate };
}

/**
 * Check if the expense type is Indirect Expense
 */
function isIndirectExpense(expenseType) {
  const norm = String(expenseType || '').trim().toUpperCase();
  return norm.includes('INDIRECT');
}

/**
 * Normalize and match particulars from voucher fields
 */
function normalizeParticulars(purpose, reason, reasonCategory) {
  const candidates = [reasonCategory, purpose, reason].filter(Boolean).map(s => String(s).trim());
  for (const c of candidates) {
    const directMatch = PARTICULARS_OPTIONS.find(p => p.toLowerCase() === c.toLowerCase());
    if (directMatch) return directMatch;
    // Special handle spelling variation: TRAVLLING vs TRAVELLING
    if (c.toLowerCase().includes('trav') && c.toLowerCase().includes('conv')) {
      return 'TRAVELLING & CONVANCE';
    }
  }
  return candidates[0] || 'MISC EXPENSES';
}

/**
 * Sync a newly created Indirect Expense Voucher to the indirect_expenses collection.
 * Distinguishes SITE CASH (Site Panel vouchers) vs OFFICE CASH (Office Panel vouchers).
 */
async function syncVoucherToIndirectExpense(voucher) {
  try {
    if (!voucher) return { success: false, reason: 'No voucher provided' };
    if (String(voucher.voucherType).toUpperCase() === 'CREDIT') {
      return { success: false, reason: 'Credit vouchers do not apply to Indirect Expenses' };
    }
    if (!isIndirectExpense(voucher.expenseType)) {
      return { success: false, reason: 'Not an Indirect Expense voucher' };
    }

    const { fy, monthKey, formattedDate } = getFinancialYearAndMonth(voucher.date);
    const particulars = normalizeParticulars(voucher.purpose, voucher.reason, voucher.reasonCategory);
    const amount = Number(voucher.amount) || 0;
    if (amount <= 0) return { success: false, reason: 'Amount must be positive' };

    const col = mongoose.connection.db.collection('indirect_expenses');
    const voucherIdStr = voucher._id ? voucher._id.toString() : '';
    const isSite = isSiteVoucher(voucher);

    // Look for an existing row linked to this specific voucher
    let existingEntry = null;
    if (voucherIdStr) {
      existingEntry = await col.findOne({
        $or: [
          { sourceVoucherId: voucherIdStr },
          { voucherIds: voucherIdStr }
        ]
      });
    }

    if (existingEntry) {
      // Already synced to this row! Update it if anything changed
      const updateSet = {
        date: formattedDate,
        particulars: particulars,
        financialYear: fy,
        sourceType: 'VOUCHER',
        sourceVoucherId: voucherIdStr,
        panelSource: isSite ? 'SITE' : 'OFFICE',
        remarks: voucher.remarks || voucher.reason || `Voucher ${voucher.voucherNumber || ''}`,
        updated_at: new Date()
      };

      // Reset months for this voucher row and set target month
      ALL_12_MONTHS.forEach(m => {
        updateSet[`months.${m}.bank`] = existingEntry.months?.[m]?.bank || '';
        if (m === monthKey) {
          if (isSite) {
            updateSet[`months.${m}.siteCash`] = amount;
            updateSet[`months.${m}.cash`] = '';
          } else {
            updateSet[`months.${m}.cash`] = amount;
            updateSet[`months.${m}.siteCash`] = '';
          }
        } else {
          // If month changed, clear old voucher contribution if this was a dedicated voucher row
          if (existingEntry.sourceType === 'VOUCHER') {
            updateSet[`months.${m}.cash`] = '';
            updateSet[`months.${m}.siteCash`] = '';
          }
        }
      });

      await col.updateOne({ _id: existingEntry._id }, { $set: updateSet });
    } else {
      // Find highest slNo for this FY
      const maxDoc = await col.findOne({ financialYear: fy }, { sort: { slNo: -1 } });
      const nextSl = (maxDoc && maxDoc.slNo ? Number(maxDoc.slNo) : 0) + 1;

      const emptyMonths = {};
      ALL_12_MONTHS.forEach(m => {
        emptyMonths[m] = {
          bank: '',
          cash: (!isSite && m === monthKey) ? amount : '',
          siteCash: (isSite && m === monthKey) ? amount : ''
        };
      });

      const newDoc = {
        slNo: nextSl,
        date: formattedDate,
        billType: voucher.billType || 'NON GST',
        particulars: particulars,
        financialYear: fy,
        months: emptyMonths,
        remarks: voucher.remarks || voucher.reason || `Voucher ${voucher.voucherNumber || ''}`,
        sourceType: 'VOUCHER',
        sourceVoucherId: voucherIdStr,
        voucherIds: voucherIdStr ? [voucherIdStr] : [],
        panelSource: isSite ? 'SITE' : 'OFFICE',
        created_at: new Date(),
        updated_at: new Date()
      };

      await col.insertOne(newDoc);
    }

    // Live socket emission to Indirect Expenses clients
    try {
      const io = getIO();
      if (io) {
        io.emit('indirectExpenseUpdates', { action: 'voucherCreated', voucherId: voucher._id });
      }
    } catch (_) {}

    return { success: true };
  } catch (err) {
    console.error('[VoucherIndirectExpenseManager] Error syncing voucher:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Reverse an existing voucher from the indirect_expenses collection.
 * Cleans up linked SITE CASH or OFFICE CASH.
 */
async function reverseVoucherFromIndirectExpense(voucher) {
  try {
    if (!voucher || !isIndirectExpense(voucher.expenseType)) return;
    const col = mongoose.connection.db.collection('indirect_expenses');
    const voucherIdStr = voucher._id ? voucher._id.toString() : '';
    if (!voucherIdStr) return;

    const entry = await col.findOne({
      $or: [
        { sourceVoucherId: voucherIdStr },
        { voucherIds: voucherIdStr }
      ]
    });
    if (!entry) return;

    const isSite = isSiteVoucher(voucher);
    const { monthKey } = getFinancialYearAndMonth(voucher.date);

    // If entry was created specifically for this voucher, delete the row cleanly
    if (entry.sourceType === 'VOUCHER' || (entry.voucherIds && entry.voucherIds.length <= 1 && !entry.sourceManojBandhanId && !entry.sourceBankBookId)) {
      await col.deleteOne({ _id: entry._id });
    } else {
      // Legacy or multi-voucher row: subtract amount and pull voucherId
      const field = isSite ? 'siteCash' : 'cash';
      const currentVal = Number(entry.months?.[monthKey]?.[field]) || 0;
      const newVal = Math.max(0, currentVal - (Number(voucher.amount) || 0));

      await col.updateOne(
        { _id: entry._id },
        {
          $set: {
            [`months.${monthKey}.${field}`]: newVal === 0 ? '' : newVal,
            updated_at: new Date()
          },
          $pull: { voucherIds: voucherIdStr }
        }
      );
    }

    try {
      const io = getIO();
      if (io) {
        io.emit('indirectExpenseUpdates', { action: 'voucherReversed', voucherId: voucher._id });
      }
    } catch (_) {}
  } catch (err) {
    console.error('[VoucherIndirectExpenseManager] Error reversing voucher:', err);
  }
}

/**
 * Resync an updated voucher
 */
async function syncVoucherOnUpdateIndirectExpense(oldVoucher, newVoucher) {
  try {
    if (!newVoucher || !isIndirectExpense(newVoucher.expenseType) || String(newVoucher.voucherType).toUpperCase() === 'CREDIT') {
      if (oldVoucher) {
        await reverseVoucherFromIndirectExpense(oldVoucher);
      }
      return;
    }

    // If month, particulars, or site status changed, cleanly reverse old and sync new
    if (oldVoucher) {
      const oldInfo = getFinancialYearAndMonth(oldVoucher.date);
      const newInfo = getFinancialYearAndMonth(newVoucher.date);
      const oldPart = normalizeParticulars(oldVoucher.purpose, oldVoucher.reason, oldVoucher.reasonCategory);
      const newPart = normalizeParticulars(newVoucher.purpose, newVoucher.reason, newVoucher.reasonCategory);
      const oldIsSite = isSiteVoucher(oldVoucher);
      const newIsSite = isSiteVoucher(newVoucher);

      if (oldInfo.monthKey !== newInfo.monthKey || oldInfo.fy !== newInfo.fy || oldPart !== newPart || oldIsSite !== newIsSite) {
        await reverseVoucherFromIndirectExpense(oldVoucher);
      }
    }

    await syncVoucherToIndirectExpense(newVoucher);
  } catch (err) {
    console.error('[VoucherIndirectExpenseManager] Error on voucher update:', err);
  }
}

module.exports = {
  getFinancialYearAndMonth,
  isIndirectExpense,
  isSiteVoucher,
  normalizeParticulars,
  syncVoucherToIndirectExpense,
  reverseVoucherFromIndirectExpense,
  syncVoucherOnUpdateIndirectExpense
};
