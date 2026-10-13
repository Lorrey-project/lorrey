const mongoose = require('mongoose');
const PartyPayment = require('../models/PartyPayment');
const { getIO } = require('../socket');

/**
 * Normalizes vehicle number (uppercase, strips whitespace and special characters).
 */
function normalizeVehicle(veh) {
  if (!veh) return '';
  return String(veh).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Extracts month (1-12) and year (e.g. 2026) deterministically from document fields or calendar date string.
 * Completely immune to UTC / timezone shifting.
 */
function getCalendarMonthYear(doc) {
  if (!doc) return { month: null, year: null };

  let m = null;
  let y = null;

  if (doc.month !== undefined && doc.month !== null && doc.month !== '') {
    const parsedM = parseInt(doc.month, 10);
    if (!isNaN(parsedM) && parsedM >= 1 && parsedM <= 12) {
      m = parsedM;
    }
  }

  if (doc.year !== undefined && doc.year !== null && doc.year !== '') {
    const parsedY = parseInt(doc.year, 10);
    if (!isNaN(parsedY) && parsedY >= 2000 && parsedY <= 2100) {
      y = parsedY;
    }
  }

  // Fallback to calendar date string regex if month or year missing
  if ((!m || !y) && (doc['Invoice Date'] || doc.invoiceDate || doc.date)) {
    const dStr = String(doc['Invoice Date'] || doc.invoiceDate || doc.date).trim();
    // YYYY-MM-DD
    const isoMatch = dStr.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (isoMatch) {
      if (!y) y = parseInt(isoMatch[1], 10);
      if (!m) m = parseInt(isoMatch[2], 10);
    } else {
      // DD-MM-YYYY or DD/MM/YYYY
      const ddmmyyyy = dStr.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
      if (ddmmyyyy) {
        if (!m) m = parseInt(ddmmyyyy[2], 10);
        if (!y) y = parseInt(ddmmyyyy[3], 10);
      }
    }
  }

  // Financial year fallback: e.g. '26-27' or 'FY 2026-27'
  if (!y && doc.fy && m) {
    const match = String(doc.fy).match(/(\d{4})/);
    if (match) {
      const startYear = parseInt(match[1], 10);
      y = (m >= 4 && m <= 12) ? startYear : startYear + 1;
    } else {
      const shortMatch = String(doc.fy).match(/^(\d{2})/);
      if (shortMatch) {
        const startYear = parseInt(`20${shortMatch[1]}`, 10);
        y = (m >= 4 && m <= 12) ? startYear : startYear + 1;
      }
    }
  }

  return { month: m, year: y };
}

/**
 * Calculates complete GST-inclusive TOTAL AMOUNT for an invoice:
 * Taxable Value + CGST 9% + SGST 9% (or Invoice Value).
 */
function calculateInvoiceTotalAmount(doc) {
  if (!doc) return 0;

  // If explicit Invoice Value is present and > 0, use it
  if (doc['Invoice Value'] !== undefined && doc['Invoice Value'] !== null && doc['Invoice Value'] !== '') {
    const v = parseFloat(String(doc['Invoice Value']).replace(/,/g, ''));
    if (!isNaN(v) && v > 0) {
      return Math.round(v * 100) / 100;
    }
  }

  const tv = parseFloat(String(doc['Taxable Value'] || 0).replace(/,/g, '')) || 0;
  const cgst = parseFloat(String(doc['CGST'] || 0).replace(/,/g, '')) || 0;
  const sgst = parseFloat(String(doc['SGST'] || 0).replace(/,/g, '')) || 0;
  const igst = parseFloat(String(doc['Integrated Tax'] || 0).replace(/,/g, '')) || 0;
  const cess = parseFloat(String(doc['Cess'] || 0).replace(/,/g, '')) || 0;

  const total = tv + cgst + sgst + igst + cess;
  return Math.round(total * 100) / 100;
}

/**
 * Calculates GST TAX AMOUNT (CGST + SGST + Integrated Tax) for an invoice.
 * Under FCM (Forward Charge Mechanism), this 18% tax amount is populated in Party Payment Details.
 */
function calculateInvoiceGstAmount(doc) {
  if (!doc) return 0;

  const cgst = parseFloat(String(doc['CGST'] || 0).replace(/,/g, '')) || 0;
  const sgst = parseFloat(String(doc['SGST'] || 0).replace(/,/g, '')) || 0;
  const igst = parseFloat(String(doc['Integrated Tax'] || 0).replace(/,/g, '')) || 0;

  if (cgst > 0 || sgst > 0 || igst > 0) {
    return Math.round((cgst + sgst + igst) * 100) / 100;
  }

  // Fallback: 18% of Taxable Value if separate tax fields are not populated
  const tv = parseFloat(String(doc['Taxable Value'] || 0).replace(/,/g, '')) || 0;
  const rate = parseFloat(String(doc['Applicable % Tax Rate'] || 18).replace(/,/g, '')) || 18;
  return Math.round(tv * (rate / 100) * 100) / 100;
}

/**
 * Safely emits Socket.IO event
 */
function safeEmit(event, payload) {
  try {
    const io = getIO();
    if (io) io.emit(event, payload);
  } catch (e) {
    // Socket.IO may not be active in unit tests or background scripts
  }
}

/**
 * Synchronizes confirmed Freight Creditor GST invoices from gst_portal.entries
 * into the matching PartyPayment document for a specific vehicle, month, and year.
 *
 * @param {Object} params
 * @param {string} params.vehicleNo - The vehicle number (e.g. 'WB39G8384')
 * @param {number|string} params.month - The calendar month (1-12)
 * @param {number|string} params.year - The calendar year (e.g. 2026)
 * @param {Object} [params.options] - Optional settings (e.g. force)
 */
async function syncFreightGstToPartyPayment({ vehicleNo, month, year, options = {} }) {
  const normVeh = normalizeVehicle(vehicleNo);
  const m = parseInt(month, 10);
  const y = parseInt(year, 10);

  if (!normVeh || isNaN(m) || isNaN(y) || m < 1 || m > 12) {
    return {
      success: false,
      error: `Invalid parameters: vehicleNo='${vehicleNo}', month='${month}', year='${year}'`
    };
  }

  try {
    const gstCol = mongoose.connection.useDb('gst_portal').collection('entries');

    // Query all valid Freight Creditor GST B2B records for this vehicle
    const candidates = await gstCol.find({
      $or: [
        { sourceModule: 'FREIGHT_CREDITOR_GST' },
        { Source: 'Freight Creditor GST' },
        { Reason: /Freight Creditor GST/i }
      ]
    }).toArray();

    // Filter to entries matching exact vehicle, calendar month, and calendar year
    const matchingEntries = candidates.filter(doc => {
      // Must be B2B entry type
      if (doc.type && doc.type !== 'b2b') return false;

      const docVeh = normalizeVehicle(doc.vehicleNo);
      if (docVeh !== normVeh) return false;

      const cal = getCalendarMonthYear(doc);
      return cal.month === m && cal.year === y;
    });

    // Deduplicate by _id
    const uniqueMap = new Map();
    matchingEntries.forEach(e => {
      uniqueMap.set(String(e._id), e);
    });
    const uniqueEntries = Array.from(uniqueMap.values());

    // Calculate aggregated total GST FCM amount (18% tax amount: CGST + SGST + Integrated Tax)
    let totalGstFcm = 0;
    const invoiceSummaries = [];

    uniqueEntries.forEach(entry => {
      const invAmt = calculateInvoiceTotalAmount(entry);
      const gstAmt = calculateInvoiceGstAmount(entry);
      totalGstFcm += gstAmt;
      invoiceSummaries.push({
        b2bEntryId: String(entry._id),
        invoiceNumber: entry['Invoice Number'] || '',
        invoiceValue: invAmt,
        gstAmount: gstAmt,
        taxableValue: parseFloat(entry['Taxable Value']) || 0,
        cgst: parseFloat(entry['CGST']) || 0,
        sgst: parseFloat(entry['SGST']) || 0,
        date: entry['Invoice Date'] || '',
        creditorKey: entry.creditorKey || ''
      });
    });

    totalGstFcm = Math.round(totalGstFcm * 100) / 100;

    // Check existing PartyPayment doc
    const existingDoc = await PartyPayment.findOne({
      vehicleNo: normVeh,
      month: m,
      year: y
    });

    // If manual override was explicitly set by user, respect it unless force option is given
    if (existingDoc && existingDoc.gstFcm_manual === true && !options.force) {
      await PartyPayment.updateOne(
        { vehicleNo: normVeh, month: m, year: y },
        {
          $set: {
            gstFcmInvoices: invoiceSummaries
          }
        }
      );
      return {
        success: true,
        vehicleNo: normVeh,
        month: m,
        year: y,
        gstFcm: existingDoc.gstFcm,
        gstFcm_manual: true,
        invoiceCount: uniqueEntries.length,
        invoices: invoiceSummaries
      };
    }

    let updatedDoc = null;

    if (uniqueEntries.length > 0) {
      // Upsert PartyPayment with the aggregated GST FCM total
      updatedDoc = await PartyPayment.findOneAndUpdate(
        { vehicleNo: normVeh, month: m, year: y },
        {
          $set: {
            gstFcm: totalGstFcm,
            gstFcmInvoices: invoiceSummaries,
            gstFcm_source: 'FREIGHT_CREDITOR_GST',
            gstFcm_manual: false
          }
        },
        { upsert: true, returnDocument: 'after' }
      );
    } else {
      // No active invoices exist (e.g. after deletion or never created)
      if (existingDoc && existingDoc.gstFcm_source === 'FREIGHT_CREDITOR_GST') {
        updatedDoc = await PartyPayment.findOneAndUpdate(
          { vehicleNo: normVeh, month: m, year: y },
          {
            $set: {
              gstFcm: 0,
              gstFcmInvoices: [],
              gstFcm_source: '',
              gstFcm_manual: false
            }
          },
          { returnDocument: 'after' }
        );
      }
    }

    // Broadcast live Socket.io updates for instant UI refresh
    safeEmit('partyPaymentUpdate', {
      action: 'freightGstSync',
      vehicleNo: normVeh,
      month: m,
      year: y,
      gstFcm: totalGstFcm
    });
    safeEmit('freightCreditorGstUpdate', {
      vehicleNo: normVeh,
      month: m,
      year: y
    });

    return {
      success: true,
      vehicleNo: normVeh,
      month: m,
      year: y,
      gstFcm: totalGstFcm,
      invoiceCount: uniqueEntries.length,
      invoices: invoiceSummaries,
      partyPaymentId: updatedDoc?._id
    };

  } catch (err) {
    console.error(`[freightGstPartyPaymentSync] Error syncing ${normVeh} ${m}/${y}:`, err);
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Reconciles ALL confirmed Freight Creditor GST invoices across the entire database.
 * Run during application startup and available as an idempotent sync command.
 */
async function reconcileAllFreightGstInvoices() {
  try {
    const gstCol = mongoose.connection.useDb('gst_portal').collection('entries');

    const allFreightGstDocs = await gstCol.find({
      $or: [
        { sourceModule: 'FREIGHT_CREDITOR_GST' },
        { Source: 'Freight Creditor GST' },
        { Reason: /Freight Creditor GST/i }
      ]
    }).toArray();

    const grouped = new Map();

    allFreightGstDocs.forEach(doc => {
      if (doc.type && doc.type !== 'b2b') return;
      const v = normalizeVehicle(doc.vehicleNo);
      const { month: m, year: y } = getCalendarMonthYear(doc);
      if (v && m && y) {
        const key = `${v}_${m}_${y}`;
        if (!grouped.has(key)) {
          grouped.set(key, { vehicleNo: v, month: m, year: y });
        }
      }
    });

    const results = [];
    for (const [key, item] of grouped.entries()) {
      const res = await syncFreightGstToPartyPayment(item);
      results.push(res);
    }

    console.log(`[Freight GST Reconcile] Successfully reconciled ${results.length} vehicle month buckets into PartyPayment.`);
    return { success: true, count: results.length, details: results };
  } catch (err) {
    console.error('[Freight GST Reconcile] Error in reconcileAllFreightGstInvoices:', err);
    return { success: false, error: err.message };
  }
}

module.exports = {
  normalizeVehicle,
  getCalendarMonthYear,
  calculateInvoiceTotalAmount,
  calculateInvoiceGstAmount,
  syncFreightGstToPartyPayment,
  reconcileAllFreightGstInvoices
};
