/**
 * paymentMapper.js
 *
 * Automatically maps deposits from Account Details to the Bill Register (cement_register).
 *
 * Trigger: Called after any Account Details bulk-update save.
 * Checks each saved row for:
 *   - Names field contains "NVCL" and/or "NVL"
 *   - Deposit > 0
 *
 * If both conditions match, finds the best-matching unpaid bill(s) in cement_register
 * and sets Bank TF + PAYMENT STATUS + PAYMENT DATE + PAYMENT REF.
 */

'use strict';

const mongoose = require('mongoose');

function safeGetIO() {
  try { const { getIO } = require('../socket'); return getIO(); }
  catch (_) { return null; }
}

function getCementCol() {
  return mongoose.connection.useDb('cement_register').collection('entries');
}

/** Parse a numeric value safely */
function num(val) {
  if (val === undefined || val === null || val === '') return 0;
  const cleaned = String(val).replace(/,/g, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

/**
 * Detect if an Account Details row is a payment row.
 * Returns: { isPayment, sites: ['NVCL'|'NVL'], totalDeposit }
 *   or null if not a payment row.
 */
function detectPaymentRow(row) {
  const deposit = num(row['Deposit'] || row.deposit);
  if (deposit <= 0) return null;

  const names = String(row['Names'] || row.names || '').trim().toUpperCase();
  const particulars = String(row['Particulars'] || row.particulars || '').trim().toUpperCase();
  const remarks = String(row['Remarks'] || row.remarks || '').trim().toUpperCase();

  // Check all text fields for site names
  const allText = `${names} ${particulars} ${remarks}`;
  const hasNVCL = /\bNVCL\b/.test(allText);
  const hasNVL = /\bNVL\b/.test(allText);

  if (!hasNVCL && !hasNVL) return null;

  const sites = [];
  if (hasNVCL) sites.push('NVCL');
  if (hasNVL) sites.push('NVL');

  return { isPayment: true, sites, totalDeposit: deposit };
}

/**
 * Parse explicit split amounts from the particulars/remarks text.
 * Supports patterns like:
 *   "NVCL 60000 NVL 40000"
 *   "NVCL-60000/NVL-40000"
 *   "NVCL:60,000 NVL:40,000"
 *   "NVCL INR 60000 AND NVL INR 40000"
 *   "60000 NVCL 40000 NVL"
 *
 * Returns: { NVCL: <number|null>, NVL: <number|null> }
 */
function parseSplitAmounts(particulars, remarks, totalDeposit, sites) {
  const text = `${particulars || ''} ${remarks || ''}`.replace(/,/g, '');
  const result = { NVCL: null, NVL: null };

  if (sites.length === 1) {
    // Single site — full amount goes to that site
    result[sites[0]] = totalDeposit;
    return result;
  }

  // Try to extract site-specific amounts via various patterns:
  // Pattern 1: NVCL followed by number (with optional separators)
  const nvclMatch =
    text.match(/NVCL\s*[-:=]?\s*(?:INR\s*)?(\d+(?:\.\d+)?)/i) ||
    text.match(/(\d+(?:\.\d+)?)\s*[-:=]?\s*NVCL/i);
  const nvlMatch =
    text.match(/NVL\s*[-:=]?\s*(?:INR\s*)?(\d+(?:\.\d+)?)/i) ||
    text.match(/(\d+(?:\.\d+)?)\s*[-:=]?\s*NVL/i);

  if (nvclMatch && nvlMatch) {
    const nvclAmt = parseFloat(nvclMatch[1]);
    const nvlAmt = parseFloat(nvlMatch[1]);
    if (!isNaN(nvclAmt) && !isNaN(nvlAmt)) {
      // Validate they sum to total (within 1% tolerance)
      const diff = Math.abs((nvclAmt + nvlAmt) - totalDeposit);
      if (diff <= totalDeposit * 0.01 + 1) {
        result.NVCL = nvclAmt;
        result.NVL = nvlAmt;
        return result;
      }
    }
  }

  // Pattern 2: Two numbers in the text — try to assign by order of appearance
  const allNums = [...text.matchAll(/\b(\d{4,}(?:\.\d+)?)\b/g)].map(m => parseFloat(m[1]));
  if (allNums.length >= 2 && sites.includes('NVCL') && sites.includes('NVL')) {
    // Find two numbers that sum to total
    for (let i = 0; i < allNums.length; i++) {
      for (let j = 0; j < allNums.length; j++) {
        if (i === j) continue;
        const diff = Math.abs((allNums[i] + allNums[j]) - totalDeposit);
        if (diff <= totalDeposit * 0.01 + 1) {
          // Assign: try to figure out which is NVCL and which is NVL from context
          const nvclIdx = text.search(/NVCL/i);
          const nvlIdx = text.search(/NVL\b/i);
          if (nvclIdx !== -1 && nvlIdx !== -1 && nvclIdx < nvlIdx) {
            result.NVCL = allNums[i < j ? i : j];
            result.NVL = allNums[i < j ? j : i];
          } else {
            result.NVCL = allNums[i];
            result.NVL = allNums[j];
          }
          return result;
        }
      }
    }
  }

  // Fallback: proportional split by NET AMOUNT of matched bills (caller handles this)
  return { NVCL: null, NVL: null };
}

/**
 * Find the best-matching unpaid bill in cement_register for a given site and amount.
 * Matching priority:
 *   1. BILL NO in referenceNo/particulars/remarks
 *   2. INVOICE NO in referenceNo/particulars/remarks
 *   3. Amount-based (NET AMOUNT ≈ payment amount, within 5% tolerance)
 *   4. Oldest unpaid bill first (by LOADING DT)
 *
 * "Unpaid" = Bank TF is not set (empty/zero) AND PAYMENT STATUS ≠ 'Paid'
 *
 * Returns the matching DB document or null.
 */
async function matchBillForSite(site, amount, referenceNo, particulars, remarks) {
  const col = getCementCol();

  // Build base filter: unpaid bills for this site
  const baseFilter = {
    SITE: { $regex: new RegExp(`^${site}$`, 'i') },
    $or: [
      { 'PAYMENT STATUS': { $exists: false } },
      { 'PAYMENT STATUS': '' },
      { 'PAYMENT STATUS': 'Pending' },
      { 'PAYMENT STATUS': 'Partial' }
    ]
  };

  // Combine search text
  const searchText = `${referenceNo || ''} ${particulars || ''} ${remarks || ''}`.toUpperCase();

  // Helper: parse date string to Date object
  const parseDate = (s) => {
    if (!s) return new Date(0);
    const clean = String(s).trim();
    const parts = clean.split(/[-/.]/);
    if (parts.length === 3) {
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      let y = parseInt(parts[2], 10);
      if (parts[2].length === 2) y += (y >= 70 ? 1900 : 2000);
      return new Date(y, m, d);
    }
    return new Date(s) || new Date(0);
  };

  // Fetch all unpaid bills for this site (sorted oldest first)
  let candidates = await col.find(baseFilter).toArray();

  // Sort oldest loading date first
  candidates.sort((a, b) => parseDate(a['LOADING DT']) - parseDate(b['LOADING DT']));

  if (candidates.length === 0) return null;

  // Priority 1: BILL NO match
  const billNoMatches = candidates.filter(r => {
    const billNo = String(r['BILL NO'] || '').toUpperCase().replace(/\s+/g, '');
    return billNo && searchText.replace(/\s+/g, '').includes(billNo);
  });
  if (billNoMatches.length > 0) return billNoMatches[0];

  // Priority 2: INVOICE NO match
  const invoiceMatches = candidates.filter(r => {
    const invNo = String(r['INVOICE NO'] || '').toUpperCase().replace(/\s+/g, '');
    return invNo && searchText.replace(/\s+/g, '').includes(invNo);
  });
  if (invoiceMatches.length > 0) return invoiceMatches[0];

  // Priority 3: Amount-based match (NET AMOUNT within 5% of payment amount)
  if (amount > 0) {
    const tolerance = Math.max(amount * 0.05, 100); // 5% or ₹100
    const amountMatches = candidates.filter(r => {
      const netAmt = num(r['NET AMOUNT']);
      return netAmt > 0 && Math.abs(netAmt - amount) <= tolerance;
    });
    if (amountMatches.length > 0) return amountMatches[0];

    // Also try GROSS AMOUNT match
    const grossMatches = candidates.filter(r => {
      const grossAmt = num(r['GROSS AMOUNT']);
      return grossAmt > 0 && Math.abs(grossAmt - amount) <= tolerance;
    });
    if (grossMatches.length > 0) return grossMatches[0];
  }

  // Priority 4: Oldest unpaid bill (fallback)
  return candidates[0];
}

/**
 * Allocate a payment row from Account Details to the Bill Register.
 *
 * @param {Object} paymentRow - The full Account Details row (frontend key format)
 * @returns {{ allocated: Array, unmapped: number, errors: string[] }}
 */
async function allocatePaymentToBills(paymentRow) {
  const allocated = [];
  const errors = [];

  const detection = detectPaymentRow(paymentRow);
  if (!detection) return { allocated, unmapped: 0, errors };

  const { sites, totalDeposit } = detection;
  const referenceNo = String(paymentRow['Reference No'] || paymentRow.referenceNo || '');
  const chequeNo = String(paymentRow['Cheque No'] || paymentRow.chequeNo || '');
  const particulars = String(paymentRow['Particulars'] || paymentRow.particulars || '');
  const remarks = String(paymentRow['Remarks'] || paymentRow.remarks || '');
  const transactionDate = String(paymentRow['Transaction Date'] || paymentRow.transactionDate || '');
  const paymentRef = referenceNo || chequeNo || '';

  // Determine split amounts
  const splitAmounts = parseSplitAmounts(particulars, remarks, totalDeposit, sites);

  // If proportional split needed (no explicit amounts found), do it by NET AMOUNT of matched bills
  if (sites.length > 1 && (splitAmounts.NVCL === null || splitAmounts.NVL === null)) {
    // Find best candidate bill for each site to determine proportion
    const nvclBill = await matchBillForSite('NVCL', 0, referenceNo, particulars, remarks);
    const nvlBill = await matchBillForSite('NVL', 0, referenceNo, particulars, remarks);

    const nvclNet = nvclBill ? num(nvclBill['NET AMOUNT'] || nvclBill['GROSS AMOUNT']) : 0;
    const nvlNet = nvlBill ? num(nvlBill['NET AMOUNT'] || nvlBill['GROSS AMOUNT']) : 0;
    const totalNet = nvclNet + nvlNet;

    if (totalNet > 0) {
      splitAmounts.NVCL = Math.round((nvclNet / totalNet) * totalDeposit * 100) / 100;
      splitAmounts.NVL = Math.round(totalDeposit * 100) / 100 - splitAmounts.NVCL;
    } else {
      // Even split if no NET AMOUNT data
      const half = Math.round((totalDeposit / 2) * 100) / 100;
      splitAmounts.NVCL = half;
      splitAmounts.NVL = totalDeposit - half;
    }
  }

  const col = getCementCol();
  const { ObjectId } = require('mongodb');

  // Allocate for each site
  for (const site of sites) {
    const amount = splitAmounts[site];
    if (!amount || amount <= 0) continue;

    try {
      const matchedBill = await matchBillForSite(site, amount, referenceNo, particulars, remarks);

      if (!matchedBill) {
        errors.push(`No unpaid ${site} bill found to allocate ₹${amount}`);
        continue;
      }

      // Determine payment status
      const netAmt = num(matchedBill['NET AMOUNT'] || matchedBill['GROSS AMOUNT']);
      const existingBankTf = num(matchedBill['Bank TF']);
      const newBankTf = existingBankTf + amount;
      let paymentStatus = 'Paid';
      if (netAmt > 0 && newBankTf < netAmt - 1) {
        paymentStatus = 'Partial';
      }

      // Calculate difference
      const difference = netAmt > 0 ? (amount - netAmt).toFixed(2) : '0.00';

      // Persist to DB
      await col.updateOne(
        { _id: matchedBill._id },
        {
          $set: {
            'Bank TF': newBankTf,
            'PAYMENT STATUS': paymentStatus,
            'PAYMENT DATE': transactionDate,
            'PAYMENT REF': paymentRef,
            'DIFFERENCE': difference,
          }
        }
      );

      allocated.push({
        site,
        amount,
        billNo: matchedBill['BILL NO'] || '',
        invoiceNo: matchedBill['INVOICE NO'] || '',
        vehicleNo: matchedBill['VEHICLE NUMBER'] || '',
        paymentStatus,
        rowId: matchedBill._id.toString()
      });

      console.log(
        `[paymentMapper] Allocated ₹${amount} to ${site} bill` +
        ` (BILL NO: ${matchedBill['BILL NO'] || 'N/A'}, STATUS: ${paymentStatus})`
      );
    } catch (err) {
      errors.push(`Error allocating to ${site}: ${err.message}`);
      console.error(`[paymentMapper] Allocation error for ${site}:`, err.message);
    }
  }

  // Emit real-time updates so Bill Register UI refreshes
  if (allocated.length > 0) {
    try {
      const io = safeGetIO();
      if (io) {
        io.emit('cementUpdates', { action: 'paymentMapped', allocated });
        io.emit('accountDetailsUpdate', { action: 'paymentMapped' });
      }
    } catch (_) {}
  }

  return { allocated, unmapped: errors.length, errors };
}

module.exports = {
  detectPaymentRow,
  parseSplitAmounts,
  matchBillForSite,
  allocatePaymentToBills,
};
