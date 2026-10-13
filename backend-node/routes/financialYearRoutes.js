const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const FinancialYearPayment = require('../models/FinancialYearPayment');
const FinancialYearRow = require('../models/FinancialYearRow');
const BillRegisterDocument = require('../models/BillRegisterDocument');
const ProjectedDeductionSetting = require('../models/ProjectedDeductionSetting');
const { getApplicableProjectedDeduction } = require('../utils/projectedDeductionResolver');
const paymentProofUpload = require('../middleware/paymentProofUpload');
const billPdfUpload = require('../middleware/billPdfUpload');
const multer = require('multer');
const memoryPdfUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const { parsePdfBillRegister } = require('../utils/pdfBillRegisterParser');
const { getBillRegisterData, parseDate, parseCalendarDate, formatCalendarDate } = require('../utils/billRegisterHelper');

function getCementCol() {
  return mongoose.connection.useDb("cement_register").collection("entries");
}

const PERMITTED_DEBIT_REASONS = [
  'Damage / Shortage',
  'GPS Deviation Charge',
  'GPS Monitoring / Trip Charges',
  'GPS Installation Charges',
  'RFID Deduction / Charges',
  'Suspense',
  'TDS PROVISION',
  'Site office Rent',
  'Safty Violation Charges'
];

function getCanonicalDebitReason(reason) {
  if (!reason || typeof reason !== 'string') return null;
  const trimmed = reason.trim().replace(/\s+/g, ' ');
  const exact = PERMITTED_DEBIT_REASONS.find(r => r.toLowerCase() === trimmed.toLowerCase());
  if (exact) return exact;

  const clean = trimmed.toUpperCase();
  if (clean === 'DAMAGE' || clean === 'SHORTAGE' || clean.includes('DAMAGE') || clean.includes('SHORTAGE')) {
    return 'Damage / Shortage';
  }
  if (clean.includes('GPS DEVIATION')) {
    return 'GPS Deviation Charge';
  }
  if (clean.includes('GPS MONITORING') || clean.includes('GPS TRIP')) {
    return 'GPS Monitoring / Trip Charges';
  }
  if (clean.includes('GPS INSTALLATION') || clean.includes('DEVICE INSTALLATION') || clean.includes('GPS DEVICE')) {
    return 'GPS Installation Charges';
  }
  if (clean.includes('RFID')) {
    return 'RFID Deduction / Charges';
  }
  if (clean.includes('SUSPENSE')) {
    return 'Suspense';
  }
  if (clean.includes('TDS PROVISION') || clean === 'TDS') {
    return 'TDS PROVISION';
  }
  if (clean.includes('SITE OFFICE RENT') || clean.includes('RENT')) {
    return 'Site office Rent';
  }
  if (clean.includes('SAFTY') || clean.includes('SAFETY')) {
    return 'Safty Violation Charges';
  }
  return null;
}

function isPermittedDebitReason(reason) {
  return getCanonicalDebitReason(reason) !== null;
}

function mapDebitReasonToCementField(reason) {
  const canonical = getCanonicalDebitReason(reason);
  if (!canonical) return null;
  switch (canonical) {
    case 'Damage / Shortage':
      return 'SHORTAGE (AMOUNT)';
    case 'GPS Deviation Charge':
      return 'GPS Deviation Charges';
    case 'GPS Monitoring / Trip Charges':
      return 'GPS Monitoring Charge';
    case 'GPS Installation Charges':
      return 'Give GPS DEVICE';
    case 'RFID Deduction / Charges':
      return 'Give RFID TAG';
    case 'Suspense':
      return 'Suspense';
    case 'TDS PROVISION':
      return 'TDS';
    case 'Site office Rent':
      return 'Others deduction';
    case 'Safty Violation Charges':
      return 'Others deduction';
    default:
      return 'Others deduction';
  }
}

function applyFieldAliases(updateSet, reason, fieldVal, allocSum, doc = {}) {
  const canonical = getCanonicalDebitReason(reason) || reason;
  if (canonical === 'Damage / Shortage') {
    updateSet['SHORTAGE (AMOUNT)'] = fieldVal;
    updateSet['Damage Deduction'] = fieldVal;
  } else if (canonical === 'GPS Deviation Charge') {
    updateSet['GPS Deviation Charges'] = fieldVal;
    if (doc && doc['GPS DEVIATION'] !== undefined) {
      updateSet['GPS DEVIATION'] = fieldVal;
    }
    if (doc && doc['GPS DEVIATION CHARGES'] !== undefined) {
      updateSet['GPS DEVIATION CHARGES'] = fieldVal;
    }
  } else if (canonical === 'GPS Monitoring / Trip Charges') {
    updateSet['GPS Monitoring Charge'] = fieldVal;
    if (doc && doc['GPS MONITORING / TRIP CHARGE'] !== undefined) {
      updateSet['GPS MONITORING / TRIP CHARGE'] = fieldVal;
    }
  } else if (canonical === 'GPS Installation Charges') {
    updateSet['Give GPS DEVICE'] = fieldVal;
    if (doc && doc['GIVE GPS DEVICE'] !== undefined) {
      updateSet['GIVE GPS DEVICE'] = fieldVal;
    }
  } else if (canonical === 'RFID Deduction / Charges') {
    updateSet['Give RFID TAG'] = fieldVal;
    if (doc && doc['GIVE RFID TAG'] !== undefined) {
      updateSet['GIVE RFID TAG'] = fieldVal;
    }
  } else if (canonical === 'Suspense') {
    updateSet['Suspense'] = fieldVal;
    if (doc && doc['SUSPENSE'] !== undefined) {
      updateSet['SUSPENSE'] = fieldVal;
    }
  } else if (canonical === 'TDS PROVISION') {
    updateSet['TDS'] = fieldVal;
    if (doc && doc['TDS Provision'] !== undefined) updateSet['TDS Provision'] = fieldVal;
    if (doc && doc['TDS PROVISION'] !== undefined) updateSet['TDS PROVISION'] = fieldVal;
  } else if (canonical === 'Site office Rent') {
    updateSet['Others deduction'] = fieldVal;
    updateSet['Site office Rent'] = allocSum;
    if (allocSum > 0) updateSet['Other'] = 'Site office Rent';
  } else if (canonical === 'Safty Violation Charges') {
    updateSet['Others deduction'] = fieldVal;
    updateSet['Safty Violation Charges'] = allocSum;
    if (allocSum > 0) updateSet['Other'] = 'Safty Violation Charges';
  }
}

// Mutex locks per trip to prevent race conditions during concurrent deduction allocation
const tripSyncLocks = new Map();

async function withTripLock(tripId, fn) {
  const key = String(tripId);
  const prevLock = tripSyncLocks.get(key) || Promise.resolve();
  let release;
  const currentLock = new Promise(resolve => { release = resolve; });
  tripSyncLocks.set(key, currentLock);
  try {
    await prevLock;
    return await fn();
  } finally {
    release();
    if (tripSyncLocks.get(key) === currentLock) {
      tripSyncLocks.delete(key);
    }
  }
}

async function getExistingBaseAmountForTrip(doc, canonicalReason, targetField, existingAllocations = [], tripRecordDate = null) {
  // 1. Explicitly recorded baseDeductions
  if (doc.baseDeductions && doc.baseDeductions[canonicalReason] !== undefined && doc.baseDeductions[canonicalReason] !== null) {
    return parseFloat(doc.baseDeductions[canonicalReason]) || 0;
  }

  // 2. Previously recorded projected value in deductionsOverride
  if (doc.deductionsOverride && doc.deductionsOverride[canonicalReason] && doc.deductionsOverride[canonicalReason].projected !== undefined && doc.deductionsOverride[canonicalReason].projected !== null) {
    return parseFloat(doc.deductionsOverride[canonicalReason].projected) || 0;
  }

  const numVal = (v) => {
    if (v === undefined || v === null || v === '') return 0;
    const n = parseFloat(String(v).replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
  };

  // 3. Amount currently recorded for that deduction in Cement Register
  let currentFieldVal = 0;
  if (canonicalReason === 'Damage / Shortage') {
    const sBags = numVal(doc['SHORTAGE (BAG)']);
    const sRate = numVal(doc['SHORTAGE (RATE)']) || numVal(doc._damage_deduction_rate) || numVal(doc._damage_rate);
    const bagAmt = (sBags > 0 && sRate > 0) ? Math.round(sBags * sRate * 100) / 100 : 0;
    currentFieldVal = numVal(doc['SHORTAGE (AMOUNT)']) || bagAmt || numVal(doc['Damage Deduction']);
  } else if (canonicalReason === 'GPS Deviation Charge') {
    currentFieldVal = numVal(doc['GPS Deviation Charges']) || numVal(doc['GPS DEVIATION']) || numVal(doc['GPS DEVIATION CHARGES']);
  } else if (canonicalReason === 'GPS Monitoring / Trip Charges') {
    currentFieldVal = numVal(doc['GPS Monitoring Charge']) || numVal(doc['GPS MONITORING / TRIP CHARGE']) || numVal(doc['GPS Trip Charges']);
  } else if (canonicalReason === 'GPS Installation Charges') {
    currentFieldVal = numVal(doc['Give GPS DEVICE']) || numVal(doc['GIVE GPS DEVICE']);
  } else if (canonicalReason === 'RFID Deduction / Charges') {
    currentFieldVal = numVal(doc['Give RFID TAG']) || numVal(doc['GIVE RFID TAG']);
  } else if (canonicalReason === 'Suspense') {
    currentFieldVal = numVal(doc['Suspense']) || numVal(doc['SUSPENSE']);
  } else {
    currentFieldVal = numVal(doc[targetField]);
  }

  // If allocations already existed on the document from previous runs, subtract them to get the baseline
  const prevAllocSum = (existingAllocations || [])
    .filter(a => {
      const c = getCanonicalDebitReason(a.reason) || a.reason;
      return c === canonicalReason || a.field === targetField;
    })
    .reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);

  if (prevAllocSum > 0 && currentFieldVal >= prevAllocSum) {
    return Math.max(0, currentFieldVal - prevAllocSum);
  }

  if (currentFieldVal > 0) {
    return currentFieldVal;
  }

  // 4. Relevant Deduction Settings field
  let projectedSettingVal = 0;
  try {
    const recordDate = tripRecordDate || doc['LOADING DT'] || doc['LOADING DATE'] || doc['BILL DATE'] || doc['DATE'];
    if (canonicalReason === 'Damage / Shortage') {
      projectedSettingVal = await getApplicableProjectedDeduction('DAMAGE_DEDUCTION', recordDate);
    } else if (canonicalReason === 'GPS Installation Charges') {
      projectedSettingVal = await getApplicableProjectedDeduction('GPS_DEVICE_INSTALLATION', recordDate);
    } else if (canonicalReason === 'RFID Deduction / Charges') {
      projectedSettingVal = await getApplicableProjectedDeduction('RFID', recordDate);
    } else if (canonicalReason === 'GPS Monitoring / Trip Charges') {
      projectedSettingVal = await getApplicableProjectedDeduction('GPS_MONITORING_TRIP_CHARGE', recordDate);
    }
  } catch (_) {}

  return projectedSettingVal || 0;
}

function recalcCementTripFields(doc, updateSet) {
  const m = { ...doc, ...updateSet };

  const numVal = (v) => {
    if (v === undefined || v === null || v === '') return 0;
    const n = parseFloat(String(v).replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
  };
  const fmt2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

  const comm = m._freight_commission !== undefined && m._freight_commission !== null && m._freight_commission !== ''
    ? Number(m._freight_commission)
    : 0.05;
  const isStd = comm === 0.05;
  const base = isStd ? numVal(m['BILLING ER 95%']) : numVal(m['BILLING ER VAR']);

  const rfid = numVal(m['Give RFID TAG']) || numVal(m['GIVE RFID TAG']);
  const fastag = numVal(m['FASTAG']);
  const gpsDev = numVal(m['GPS Deviation Charges']) || numVal(m['GPS DEVIATION CHARGES']) || numVal(m['GPS DEVIATION']);
  const suspense = numVal(m['Suspense']) || numVal(m['SUSPENSE']);
  const others = numVal(m['Others deduction']) || numVal(m['OTHERS DEDUCTION']);

  updateSet['SUM OF RFID & FASTAG & DEVIATION & SUSPENSE & OTHERS DEDUCTION'] = fmt2(
    rfid + fastag + gpsDev + suspense + others
  );

  const shortageAmt = numVal(m['SHORTAGE (AMOUNT)']);
  const damageAmt = numVal(m['Damage Deduction']);
  const extraDamage = (damageAmt > 0 && damageAmt > shortageAmt) ? (damageAmt - shortageAmt) : 0;

  const net = fmt2(
    base
    - numVal(m['TDS'])
    - numVal(m['ADVANCE'])
    - numVal(m['Site Cash'])
    - numVal(m['OFFICE CASH'])
    - numVal(m['Bank TF'])
    - others
    - (numVal(m['GPS Monitoring Charge']) || numVal(m['GPS MONITORING / TRIP CHARGE']) || numVal(m['GPS Trip Charges']))
    - (numVal(m['Give GPS DEVICE']) || numVal(m['GIVE GPS DEVICE']))
    - gpsDev
    - suspense
    - rfid
    - numVal(m['RFID REASSURANCE'])
    - fastag
    - numVal(m['HSD AMOUNT'])
    - numVal(m['TRAVELLING EXP'])
    - shortageAmt
    - extraDamage
    - numVal(m['Other'])
  );
  updateSet['NET AMOUNT'] = net;

  updateSet['GROSS AMOUNT'] = fmt2(
    net + numVal(m['UP TOLL']) + numVal(m['DOWN TOLL']) + numVal(m['EXTRA UNLOADING'])
  );
}

async function syncDebitAllocationToCementRegister({
  billNo,
  debitReason,
  financialYear,
  allocationId,
  tripAllocations = [],
  isDelete = false,
  previousTripAllocations = []
}) {
  const cementCol = getCementCol();
  const canonicalReason = getCanonicalDebitReason(debitReason);
  if (!canonicalReason) return;
  const targetField = mapDebitReasonToCementField(debitReason);
  if (!targetField) return;

  const newTripIds = new Set(
    tripAllocations.map(t => String(t.tripRecordId || t.tripId || t._id))
  );

  // Reversals: for deleted allocation or trips removed during edit
  const tripsToReverse = isDelete
    ? previousTripAllocations
    : previousTripAllocations.filter(t => !newTripIds.has(String(t.tripRecordId || t.tripId || t._id)));

  for (const prevTrip of tripsToReverse) {
    const tripId = prevTrip.tripRecordId || prevTrip.tripId || prevTrip._id;
    if (!tripId) continue;

    await withTripLock(tripId, async () => {
      let query = null;
      if (mongoose.Types.ObjectId.isValid(tripId) && String(new mongoose.Types.ObjectId(tripId)) === String(tripId)) {
        query = { _id: new mongoose.Types.ObjectId(tripId) };
      } else {
        query = { _id: tripId };
      }

      let doc = await cementCol.findOne(query);
      if (!doc && prevTrip.invoiceNo && prevTrip.invoiceNo !== '—') {
        const fallbackQuery = {
          $and: [
            { $or: [{ 'INVOICE NO': prevTrip.invoiceNo }, { 'BILL NO': prevTrip.invoiceNo }] }
          ]
        };
        if (prevTrip.loadingDate && prevTrip.loadingDate !== '—') {
          fallbackQuery.$and.push({
            $or: [{ 'LOADING DT': prevTrip.loadingDate }, { 'LOADING DATE': prevTrip.loadingDate }, { 'BILL DATE': prevTrip.loadingDate }]
          });
        }
        if (prevTrip.vehicleNumber || prevTrip.vehicle) {
          const v = prevTrip.vehicleNumber || prevTrip.vehicle;
          fallbackQuery.$and.push({
            $or: [{ 'VEHICLE NUMBER': v }, { 'VEHICLE NO': v }]
          });
        }
        doc = await cementCol.findOne(fallbackQuery);
        if (doc) query = { _id: doc._id };
      }
      if (!doc) return;

      const existingDebitAllocations = Array.isArray(doc.debitAllocations) ? doc.debitAllocations : [];
      const updatedDebitAllocations = existingDebitAllocations.filter(
        a => a.allocationId !== allocationId && (!prevTrip.tripAllocationId || a.tripAllocationId !== prevTrip.tripAllocationId)
      );

      const remainingAllocSum = updatedDebitAllocations
        .filter(a => {
          const c = getCanonicalDebitReason(a.reason) || a.reason;
          return c === canonicalReason || a.field === targetField;
        })
        .reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);

      const baseAmount = await getExistingBaseAmountForTrip(
        doc,
        canonicalReason,
        targetField,
        existingDebitAllocations,
        prevTrip.loadingDate
      );

      // Comparison rule: Update the existing value only when final allocated amount is strictly greater than base amount
      const newFieldVal = remainingAllocSum > baseAmount ? remainingAllocSum : baseAmount;

      const updateDoc = {
        $set: {
          debitAllocations: updatedDebitAllocations,
          [targetField]: newFieldVal,
          [`baseDeductions.${canonicalReason}`]: baseAmount
        }
      };

      if (remainingAllocSum > 0) {
        const remainingRefs = updatedDebitAllocations
          .filter(a => (getCanonicalDebitReason(a.reason) || a.reason) === canonicalReason)
          .map(a => a.billRegisterRef)
          .filter(Boolean);
        const remainingAllocIds = updatedDebitAllocations
          .filter(a => (getCanonicalDebitReason(a.reason) || a.reason) === canonicalReason)
          .map(a => a.allocationId)
          .filter(Boolean);

        updateDoc.$set[`deductionsOverride.${canonicalReason}`] = {
          projected: baseAmount,
          actual: remainingAllocSum,
          billRegisterRef: [...new Set(remainingRefs)].join(', '),
          allocationId: [...new Set(remainingAllocIds)].join(', '),
          timestamp: new Date()
        };
      } else {
        if (!updateDoc.$unset) updateDoc.$unset = {};
        updateDoc.$unset[`deductionsOverride.${canonicalReason}`] = "";
      }

      applyFieldAliases(updateDoc.$set, canonicalReason, newFieldVal, remainingAllocSum, doc);

      recalcCementTripFields(doc, updateDoc.$set);
      await cementCol.updateOne(query, updateDoc);
    });
  }

  if (isDelete) return;

  // Apply or update allocations
  for (const t of tripAllocations) {
    const tripId = t.tripRecordId || t.tripId || t._id;
    if (!tripId) continue;

    await withTripLock(tripId, async () => {
      let query = null;
      if (mongoose.Types.ObjectId.isValid(tripId) && String(new mongoose.Types.ObjectId(tripId)) === String(tripId)) {
        query = { _id: new mongoose.Types.ObjectId(tripId) };
      } else {
        query = { _id: tripId };
      }

      let doc = await cementCol.findOne(query);
      if (!doc && t.invoiceNo && t.invoiceNo !== '—') {
        const fallbackQuery = {
          $and: [
            { $or: [{ 'INVOICE NO': t.invoiceNo }, { 'BILL NO': t.invoiceNo }] }
          ]
        };
        if (t.loadingDate && t.loadingDate !== '—') {
          fallbackQuery.$and.push({
            $or: [{ 'LOADING DT': t.loadingDate }, { 'LOADING DATE': t.loadingDate }, { 'BILL DATE': t.loadingDate }]
          });
        }
        if (t.vehicleNumber || t.vehicle) {
          const v = t.vehicleNumber || t.vehicle;
          fallbackQuery.$and.push({
            $or: [{ 'VEHICLE NUMBER': v }, { 'VEHICLE NO': v }]
          });
        }
        doc = await cementCol.findOne(fallbackQuery);
        if (doc) query = { _id: doc._id };
      }
      if (!doc) return;

      const tripAmt = parseFloat(t.allocatedAmount || t.tripAllocateAmount) || 0;
      const existingDebitAllocations = Array.isArray(doc.debitAllocations) ? doc.debitAllocations : [];

      const prevAllocIdx = existingDebitAllocations.findIndex(
        a => a.allocationId === allocationId || (t.tripAllocationId && a.tripAllocationId === t.tripAllocationId)
      );

      const allocationEntry = {
        allocationId,
        tripAllocationId: t.tripAllocationId || new mongoose.Types.ObjectId().toString(),
        billRegisterRef: billNo,
        reason: canonicalReason,
        field: targetField,
        amount: tripAmt,
        financialYear: financialYear || '',
        month: t.month || '',
        vehicleNumber: t.vehicleNumber || t.vehicle || '',
        loadingDate: t.loadingDate || '',
        updatedAt: new Date()
      };

      let updatedDebitAllocations;
      if (prevAllocIdx >= 0) {
        updatedDebitAllocations = [...existingDebitAllocations];
        updatedDebitAllocations[prevAllocIdx] = allocationEntry;
      } else {
        updatedDebitAllocations = [...existingDebitAllocations, allocationEntry];
      }

      const finalAllocatedAmount = updatedDebitAllocations
        .filter(a => {
          const c = getCanonicalDebitReason(a.reason) || a.reason;
          return c === canonicalReason || a.field === targetField;
        })
        .reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);

      const baseAmount = await getExistingBaseAmountForTrip(
        doc,
        canonicalReason,
        targetField,
        existingDebitAllocations,
        t.loadingDate
      );

      // Required amount comparison logic:
      // Case A: New allocated amount > existing amount -> Replace with new final allocated amount
      // Case B: New allocated amount == existing amount -> Keep existing amount unchanged
      // Case C: New allocated amount < existing amount -> Keep existing amount unchanged
      // Comparison rule: Update the existing value only when the final allocated amount is strictly greater than the existing value. Otherwise, preserve the existing value.
      const newFieldVal = finalAllocatedAmount > baseAmount ? finalAllocatedAmount : baseAmount;

      const allRefsForReason = updatedDebitAllocations
        .filter(a => (getCanonicalDebitReason(a.reason) || a.reason) === canonicalReason)
        .map(a => a.billRegisterRef)
        .filter(Boolean);
      const allAllocIdsForReason = updatedDebitAllocations
        .filter(a => (getCanonicalDebitReason(a.reason) || a.reason) === canonicalReason)
        .map(a => a.allocationId)
        .filter(Boolean);

      const updateDoc = {
        $set: {
          debitAllocations: updatedDebitAllocations,
          [targetField]: newFieldVal,
          [`baseDeductions.${canonicalReason}`]: baseAmount,
          [`deductionsOverride.${canonicalReason}`]: {
            projected: baseAmount,
            actual: finalAllocatedAmount,
            billRegisterRef: [...new Set(allRefsForReason)].join(', '),
            allocationId: [...new Set(allAllocIdsForReason)].join(', '),
            timestamp: new Date()
          },
          'DEDICATED': 'Actual'
        }
      };

      applyFieldAliases(updateDoc.$set, canonicalReason, newFieldVal, finalAllocatedAmount, doc);

      recalcCementTripFields(doc, updateDoc.$set);
      await cementCol.updateOne(query, updateDoc);
    });
  }
}

function getMonthIndexFromDate(dateStr) {
  const d = parseDate(dateStr);
  if (d) return d.getMonth() + 1;
  return 99;
}


const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
];

// Normalize legacy site names to canonical values
function normalizeSite(site) {
  if (!site) return '';
  const s = String(site).trim().toUpperCase();
  if (s === 'NVCL') return 'NVCL';
  if (s === 'NVL') return 'NVL';
  return site.trim();
}

router.get('/permitted-debit-reasons', (req, res) => {
  res.json({ permittedReasons: PERMITTED_DEBIT_REASONS });
});

router.post('/validate-deduction', async (req, res) => {
  try {
    const { reasons, year, month, trips, currentBillNo } = req.body;

    if (!reasons || reasons.length === 0) return res.json({ valid: true });

    if (Array.isArray(reasons)) {
      const invalid = reasons.filter(r => !isPermittedDebitReason(r));
      if (invalid.length > 0) {
        return res.status(400).json({
          valid: false,
          error: `Unsupported deduction reason(s): ${invalid.join(', ')}. Permitted reasons: ${PERMITTED_DEBIT_REASONS.join(', ')}`
        });
      }
    }

    const cementCol = getCementCol();

    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthIdx = MONTHS.findIndex(m => month.startsWith(m)) + 1;
    let yearRegexPart = '';
    if (year) {
      const parts = year.split('-');
      if (parts.length === 2) {
        let startY = parseInt(parts[0]);
        let endY = parseInt(parts[1]);
        if (startY < 100) startY += 2000;
        if (endY < 100) endY += 2000;
        const calendarYear = (monthIdx >= 4) ? startY : endY;
        const yrStr = String(calendarYear);
        const yr2 = yrStr.slice(-2);
        yearRegexPart = `(${yrStr}|${yr2})`;
      }
    }
    const monthStr = String(monthIdx).padStart(2, '0');
    const dateRegex = new RegExp(`^\\d{2}[-/\\.]${monthStr}[-/\\.]${yearRegexPart}`);

    for (const t of trips) {
      const tripsQuery = {
        $or: [{ 'VEHICLE NUMBER': t.vehicle }, { 'VEHICLE NO': t.vehicle }],
        $and: [
          {
            $or: [
              { "LOADING DT": dateRegex },
              { "LOADING DATE": dateRegex },
              { "BILL DATE": dateRegex }
            ]
          }
        ]
      };

      const dbTrips = await cementCol.find(tripsQuery).toArray();

      dbTrips.sort((a, b) => {
        const dA = parseDate(a['LOADING DT'] || a['LOADING DATE'] || a['BILL DATE'] || '');
        const dB = parseDate(b['LOADING DT'] || b['LOADING DATE'] || b['BILL DATE'] || '');
        const tA = dA ? dA.getTime() : 0;
        const tB = dB ? dB.getTime() : 0;
        return tA - tB;
      });

      let dbTrip = null;
      if (t.tripNumber && dbTrips[t.tripNumber - 1]) {
        dbTrip = dbTrips[t.tripNumber - 1];
      } else {
        const query = {
          $and: [
            { $or: [{ 'VEHICLE NUMBER': t.vehicle }, { 'VEHICLE NO': t.vehicle }] },
            {
              $or: [
                { 'LOADING DT': t.tripDate }, { 'LOADING DATE': t.tripDate },
                { 'BILL DATE': t.tripDate }, { 'RECEIVING DATE': t.tripDate },
                { 'DATE': t.tripDate }, { 'INVOICE DATE': t.tripDate }
              ]
            }
          ]
        };
        dbTrip = await cementCol.findOne(query);
      }

      if (dbTrip) {
        for (const reason of reasons) {
          const projectedCol = mapDebitReasonToCementField(reason);
          if (!projectedCol) continue;

          const override = dbTrip.deductionsOverride && dbTrip.deductionsOverride[reason];
          if (override) {
            if (override.billRegisterRef !== currentBillNo) {
              return res.json({ valid: false, message: `Trip ${t.tripNumber || ''} (${t.vehicle}) already has a deduction for "${reason}" in another invoice (${override.billRegisterRef}).` });
            }
          } else {
            const val = parseFloat(String(dbTrip[projectedCol] || '0').replace(/,/g, '')) || 0;
            if (val > 0) {
              return res.json({ valid: false, message: `Trip ${t.tripNumber || ''} (${t.vehicle}) already has a manual deduction for "${reason}" in the Cement Register.` });
            }
          }
        }
      }
    }

    return res.json({ valid: true });
  } catch (err) {
    console.error("Validation error:", err);
    res.status(500).json({ valid: false, message: "Server error validating deduction." });
  }
});

router.get('/data', async (req, res) => {
  try {
    const { fy } = req.query;
    const data = await getBillRegisterData({ fy });
    res.json(data);
  } catch (err) {
    console.error('[FYDetails] /data error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/pending-bills', async (req, res) => {
  try {
    const { party } = req.query; // 'NVL' or 'NVCL'
    if (!party) return res.status(400).json({ error: 'Party is required' });

    const CEMENT_PROJECTION = {
      'GCN NO': 1, 'BILL NO': 1, 'INVOICE NO': 1, 'BILLING': 1,
      'LOADING DT': 1, 'LOADING DATE': 1,
      'BILL DATE': 1,
      'SITE': 1,
      'BILLING ER 95%': 1, 'BILLING @ 95% (PARTY PAYABLE)': 1,
      'AMOUNT': 1, 'Billing Amount': 1,
      'VEHICLE NUMBER': 1, 'VEHICLE NO': 1,
      'PARTY NAME': 1, 'CHALLAN STATUS': 1,
      'month': 1, 'Month': 1,
      _id: 0
    };

    const [allCement, rowOverrides, payments] = await Promise.all([
      getCementCol().find({ SITE: { $regex: new RegExp(`^${party}$`, 'i') } }, { projection: CEMENT_PROJECTION }).toArray(),
      FinancialYearRow.find({}).lean(),
      FinancialYearPayment.find({}).lean()
    ]);

    // Apply the same aggregation as /data
    const aggregated = {};
    for (const row of allCement) {
      let invNo = row['BILL NO'];
      if (!invNo || String(row['CHALLAN STATUS']).toUpperCase().trim() !== 'BILLED') continue;
      invNo = String(invNo).trim();

      const rawSite = normalizeSite(row['SITE']);
      if (rawSite !== party.toUpperCase()) continue;

      const prefix = rawSite === 'NVCL' ? 'NVCL-' : 'DAC-';
      const cleanInvNo = invNo.replace(/^(DAC|NVCL)[\/\-]/i, '').replace(/\//g, '-');
      const finalInvNo = `${prefix}${cleanInvNo}`;

      if (!aggregated[finalInvNo]) {
        const invDate = row['BILL DATE'] || row['LOADING DT'] || row['LOADING DATE'] || '';
        let monthStr = '';
        const rawMonth = parseInt(row.month || row.Month, 10);
        if (rawMonth >= 1 && rawMonth <= 12) {
          monthStr = MONTH_NAMES[rawMonth - 1];
        } else {
          const dObj = parseDate(invDate);
          if (dObj) {
            const m = dObj.getMonth();
            const yy = String(dObj.getFullYear()).slice(-2);
            monthStr = `${MONTH_NAMES[m]} '${yy}`;
          }
        }
        aggregated[finalInvNo] = {
          invoiceDate: invDate,
          invoiceNumber: finalInvNo,
          month: monthStr,
          site: rawSite,
          amount: 0,
          invoiceNos: new Set(),
          vehicleNumbers: new Set(),
          partyNames: new Set()
        };
      }

      const amt =
        parseFloat(row['BILLING AMOUNT']) ||
        parseFloat(row['Billing Amount']) ||
        parseFloat(row['BILLING ER 95%']) ||
        parseFloat(row['AMOUNT']) || 0;
      aggregated[finalInvNo].amount += amt;

      const singleInvNo = row['INVOICE NO'] || row['INVOICE NO.'] || '';
      if (singleInvNo) aggregated[finalInvNo].invoiceNos.add(String(singleInvNo).trim());

      const singleVeh = row['VEHICLE NUMBER'] || row['VEHICLE NO'] || '';
      if (singleVeh) aggregated[finalInvNo].vehicleNumbers.add(String(singleVeh).trim());

      const singleParty = row['PARTY NAME'] || '';
      if (singleParty) aggregated[finalInvNo].partyNames.add(String(singleParty).trim());
    }

    const rowMap = {};
    for (const r of rowOverrides) rowMap[r.billNo] = r;

    const computedRows = [];
    for (const r of Object.values(aggregated)) {
      const invNo = r.invoiceNumber;
      const ov = rowMap[invNo] || {};
      if (ov.hidden) continue;

      const siteUpper = normalizeSite(ov.editedSite ?? r.site).toUpperCase();
      const billUpper = (ov.billType ?? 'FREIGHT').toUpperCase();

      const amt = parseFloat(ov.editedAmount ?? r.amount) || 0;
      const cgst = Math.round((amt * 0.09) * 100) / 100;
      const sgst = Math.round((amt * 0.09) * 100) / 100;
      const totalAmount = amt + cgst + sgst;

      const tdsRate = (siteUpper === 'NVL' && billUpper === 'TOLL') ? 0 : 0.02;
      const tds = Math.round((amt * tdsRate) * 100) / 100;

      const receivable = totalAmount - tds;
      let autoInv = ov.editedInvoiceNumber ?? r.invoiceNumber ?? '';

      const paymentObj = payments.find(p => p.billNos?.includes(r.invoiceNumber));

      computedRows.push({
        invoiceDate: ov.editedInvoiceDate ?? r.invoiceDate,
        invoiceNumber: r.invoiceNumber,
        displayInvoiceNumber: autoInv,
        amount: amt,
        receivable,
        invoiceNos: Array.from(r.invoiceNos).filter(Boolean),
        vehicleNumbers: Array.from(r.vehicleNumbers).filter(Boolean),
        partyNames: Array.from(r.partyNames).filter(Boolean),
        groupId: paymentObj?.id || `AUTO-${r.invoiceNumber}`,
        groupData: paymentObj || {}
      });
    }

    // Process manual rows
    for (const ov of rowOverrides) {
      if (aggregated[ov.billNo] || ov.hidden) continue;
      const siteUpper = normalizeSite(ov.editedSite || '').toUpperCase();
      if (siteUpper !== party.toUpperCase()) continue;

      const billUpper = (ov.billType ?? 'FREIGHT').toUpperCase();
      const amt = parseFloat(ov.editedAmount) || 0;
      const cgst = Math.round((amt * 0.09) * 100) / 100;
      const sgst = Math.round((amt * 0.09) * 100) / 100;
      const totalAmount = amt + cgst + sgst;
      const tdsRate = (siteUpper === 'NVL' && billUpper === 'TOLL') ? 0 : 0.02;
      const tds = Math.round((amt * tdsRate) * 100) / 100;
      const receivable = totalAmount - tds;

      const paymentObj = payments.find(p => p.billNos?.includes(ov.billNo));

      computedRows.push({
        invoiceDate: ov.editedInvoiceDate || '',
        invoiceNumber: ov.billNo,
        displayInvoiceNumber: ov.editedInvoiceNumber || ov.billNo,
        amount: amt,
        receivable,
        invoiceNos: [],
        vehicleNumbers: [],
        partyNames: [],
        groupId: paymentObj?.id || `AUTO-${ov.billNo}`,
        groupData: paymentObj || {}
      });
    }

    // Now calculate pending amounts
    const pendingBills = [];
    const groupRowsMap = {};
    for (const row of computedRows) {
      if (!groupRowsMap[row.groupId]) groupRowsMap[row.groupId] = [];
      groupRowsMap[row.groupId].push(row);
    }

    for (const r of computedRows) {
      const gid = r.groupId;
      const gd = r.groupData || {};

      const groupRows = groupRowsMap[gid];
      const groupTotalRecv = groupRows.reduce((s, x) => s + (x.receivable || 0), 0);

      const paymentAmt = parseFloat(gd.paymentAmount) || 0;
      const debitAmt = parseFloat(gd.debitAmount) || 0;
      const tdsProv = parseFloat(gd.tdsProvision) || 0;

      const isPaid = paymentAmt > 0 && (paymentAmt + debitAmt + tdsProv >= groupTotalRecv - 1);

      let individualAmountPaid = 0;
      let individualOutstanding = r.receivable || 0;
      let status = 'Pending';

      if (isPaid) {
        individualAmountPaid = r.receivable || 0;
        individualOutstanding = 0;
        status = 'Paid';
      } else if (paymentAmt > 0 || debitAmt > 0 || tdsProv > 0) {
        const ratio = groupTotalRecv > 0 ? ((paymentAmt + debitAmt + tdsProv) / groupTotalRecv) : 0;
        individualAmountPaid = (r.receivable || 0) * ratio;
        individualOutstanding = Math.max(0, (r.receivable || 0) - individualAmountPaid);
        if (individualOutstanding < 1) {
          individualOutstanding = 0;
          status = 'Paid';
        }
      }

      if (status === 'Pending') {
        pendingBills.push({
          invoiceNumber: r.invoiceNos.length > 0 ? r.invoiceNos.join(', ') : '—',
          billNumber: r.displayInvoiceNumber,
          rawBillNumber: r.invoiceNumber,
          invoiceDate: r.invoiceDate,
          vehicleNumber: r.vehicleNumbers.length > 0 ? r.vehicleNumbers.join(', ') : '—',
          billAmount: r.receivable || 0,
          amountPaid: individualAmountPaid,
          pendingAmount: individualOutstanding
        });
      }
    }

    pendingBills.sort((a, b) => {
      const dA = parseDate(a.invoiceDate) || new Date(0);
      const dB = parseDate(b.invoiceDate) || new Date(0);
      return dB - dA;
    });

    console.log('Returning pendingBills length:', pendingBills.length);
    res.json({ pendingBills });
  } catch (err) {
    console.error('[FYDetails] /pending-bills error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/save-group', async (req, res) => {
  try {
    const { id, billNos, paymentAmount, paymentDate, referenceNo, debitAmount, remarks, tdsProvision } = req.body;
    await FinancialYearPayment.findOneAndUpdate(
      { id },
      { billNos, paymentAmount, paymentDate, referenceNo, debitAmount, remarks, tdsProvision },
      { upsert: true, returnDocument: 'after' }
    );

    // --- Cement Register Deductions Override Logic via Remarks ---
    if (remarks) {
      const cementCol = mongoose.connection.useDb("cement_register").collection("entries");
      const lines = remarks.split('\n');

      for (const line of lines) {
        const match = line.trim().match(/^([a-zA-Z]+)\s*-\s*([A-Z0-9]+)\s*-\s*Trip No\.\s*(\d+)\s*\(([\d\-\.\/]+)\)\s*-\s*(.*?)\s*-\s*₹([\d,\.]+)/i);
        if (match) {
          const monthStrName = match[1];
          const vehicle = match[2];
          const tripNumber = parseInt(match[3], 10);
          const tripDate = match[4];
          const reason = match[5].trim();
          const manualAmt = parseFloat(match[6].replace(/,/g, '')) || 0;

          const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
          const monthIdx = MONTHS.findIndex(m => m.toLowerCase() === monthStrName.toLowerCase()) + 1;

          if (monthIdx > 0) {
            const dateParts = tripDate.split(/[-/.]/);
            if (dateParts.length >= 3) {
              const mm = String(dateParts[1]).padStart(2, '0');
              const yyyy = dateParts[2].length === 2 ? `20${dateParts[2]}` : dateParts[2];
              const yy = yyyy.slice(-2);

              const dateRegex = new RegExp(`^\\d{2}[-/\\.]${mm}[-/\\.](${yyyy}|${yy})`);

              const tripsQuery = {
                $or: [{ 'VEHICLE NUMBER': vehicle }, { 'VEHICLE NO': vehicle }],
                $and: [
                  {
                    $or: [
                      { "LOADING DT": dateRegex },
                      { "LOADING DATE": dateRegex },
                      { "BILL DATE": dateRegex }
                    ]
                  }
                ]
              };

              const dbTrips = await cementCol.find(tripsQuery).toArray();

              dbTrips.sort((a, b) => {
                const dA = parseDate(a['LOADING DT'] || a['LOADING DATE'] || a['BILL DATE'] || '');
                const dB = parseDate(b['LOADING DT'] || b['LOADING DATE'] || b['BILL DATE'] || '');
                const tA = dA ? dA.getTime() : 0;
                const tB = dB ? dB.getTime() : 0;
                return tA - tB;
              });

              let dbTrip = null;
              if (tripNumber && dbTrips[tripNumber - 1]) {
                dbTrip = dbTrips[tripNumber - 1];
              } else {
                const exactDateQuery = {
                  $or: [{ 'VEHICLE NUMBER': vehicle }, { 'VEHICLE NO': vehicle }],
                  $or: [
                    { 'LOADING DT': tripDate },
                    { 'LOADING DATE': tripDate },
                    { 'BILL DATE': tripDate },
                    { 'RECEIVING DATE': tripDate },
                    { 'DATE': tripDate },
                    { 'INVOICE DATE': tripDate }
                  ]
                };
                dbTrip = await cementCol.findOne(exactDateQuery);
              }

              if (dbTrip) {
                let projectedCol = '';
                const lowerReason = reason.toLowerCase();
                if (lowerReason.includes('damage') || lowerReason.includes('shortage')) projectedCol = 'SHORTAGE (AMOUNT)';
                else if (lowerReason.includes('gps trip')) projectedCol = 'GPS Monitoring Charge';
                else if (lowerReason.includes('gps deviation')) projectedCol = 'GPS Deviation Charges';
                else if (lowerReason.includes('device installation')) projectedCol = 'Give GPS DEVICE';
                else if (lowerReason.includes('rfid')) projectedCol = 'Give RFID TAG';
                else if (lowerReason.includes('substance')) projectedCol = 'Others deduction';

                if (projectedCol) {
                  const projVal = parseFloat(String(dbTrip[projectedCol] || '0').replace(/,/g, '')) || 0;
                  const overridePath = `deductionsOverride.${reason}`;
                  const updateDoc = {
                    $set: {
                      [overridePath]: {
                        projected: projVal,
                        actual: manualAmt,
                        billRegisterRef: id,
                        timestamp: new Date()
                      },
                      [projectedCol]: manualAmt,
                      'DEDICATED': 'Actual'
                    }
                  };
                  await cementCol.updateOne({ _id: dbTrip._id }, updateDoc);
                }
              }
            }
          }
        }
      }
    }

    try {
      const { getIO } = require('../socket');
      getIO().emit('fyDetailsUpdates', { action: 'save-group' });
    } catch (_) {}

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Soft-delete: marks selected invoice numbers as hidden
router.post('/delete-rows', async (req, res) => {
  try {
    const { billNos } = req.body; // array of invoiceNumbers to delete
    if (!Array.isArray(billNos) || billNos.length === 0)
      return res.status(400).json({ error: 'No bill numbers provided' });

    // Block deletion if any bill is auto-generated
    const cementCol = mongoose.connection.useDb("cement_register").collection("entries");
    for (const billNo of billNos) {
      const isAutoGenerated = await cementCol.findOne({
        $or: [
          { "BILL NO": billNo },
          { "UNLOADING BILL NO": billNo }
        ]
      });
      if (isAutoGenerated) {
        return res.status(403).json({ error: 'Cannot delete auto-generated bills from the Bill Register. Please modify them in the Cement Register.' });
      }
    }

    await Promise.all(billNos.map(billNo =>
      FinancialYearRow.findOneAndUpdate(
        { billNo },
        { $set: { hidden: true } },
        { upsert: true }
      )
    ));
    try {
      const { getIO } = require('../socket');
      getIO().emit('fyDetailsUpdates', { action: 'delete-rows', billNos });
    } catch (_) {}

    res.json({ success: true, deleted: billNos.length });
  } catch (err) {
    console.error('[FYDetails] /delete-rows error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


router.post('/upload-proof', paymentProofUpload.single('proof'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const { id } = req.body;
    if (id) {
      await FinancialYearPayment.findOneAndUpdate(
        { id },
        { paymentProofUrl: req.file.location },
        { upsert: true, returnDocument: 'after' }
      );
    }
    res.json({ message: "Proof saved successfully", url: req.file.location });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

router.post('/clear-bill-register', async (req, res) => {
  try {
    const rRes = await FinancialYearRow.deleteMany({});
    const pRes = await FinancialYearPayment.deleteMany({});
    const dRes = await BillRegisterDocument.deleteMany({});

    const io = req.app.get('io');
    if (io) {
      io.emit('cementUpdates', { action: 'billRegisterCleared' });
      io.emit('fyDetailsUpdates', { action: 'billRegisterCleared' });
    }

    res.json({
      success: true,
      message: 'All Bill Register data has been cleared successfully.',
      rowsDeleted: rRes.deletedCount,
      paymentsDeleted: pRes.deletedCount,
      documentsDeleted: dRes.deletedCount
    });
  } catch (err) {
    console.error('Failed to clear Bill Register data:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/import-excel', async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid rows provided for import.' });
    }

    const cementCol = mongoose.connection.useDb("cement_register").collection("entries");
    const bulkOps = [];
    let importedCount = 0;
    let existingCount = 0;
    const errors = [];

    // Fetch existing bill numbers from FinancialYearRow & cement entries
    const existingFyRows = await FinancialYearRow.find({}).lean();
    const existingBillNos = new Set(existingFyRows.map(r => String(r.billNo).trim().toUpperCase()));

    const allCementBills = await cementCol.find({}, { projection: { "BILL NO": 1, "UNLOADING BILL NO": 1, "INVOICE NO": 1 } }).toArray();
    allCementBills.forEach(c => {
      if (c["BILL NO"]) existingBillNos.add(String(c["BILL NO"]).trim().toUpperCase());
      if (c["UNLOADING BILL NO"]) existingBillNos.add(String(c["UNLOADING BILL NO"]).trim().toUpperCase());
      if (c["INVOICE NO"]) existingBillNos.add(String(c["INVOICE NO"]).trim().toUpperCase());
    });

    for (let idx = 0; idx < rows.length; idx++) {
      const r = rows[idx];
      const invNo = String(r.invoiceNumber || r.billNo || r.displayInvoiceNumber || '').trim();

      if (!invNo) {
        errors.push({ row: idx + 1, error: 'Missing Invoice / Bill Number' });
        continue;
      }

      const upperKey = invNo.toUpperCase();
      const normalizedInvDate = r.invoiceDate ? formatCalendarDate(r.invoiceDate, 'DD/MM/YYYY') : '';

      const updateDoc = {
        billNo: invNo,
        billType: (r.billType || 'FREIGHT').toUpperCase(),
        editedInvoiceDate: normalizedInvDate,
        editedInvoiceNumber: r.displayInvoiceNumber || invNo,
        editedMonth: r.month || '',
        editedSite: r.site || 'NVCL',
        editedAmount: typeof r.amount === 'number' ? r.amount : (parseFloat(r.amount) || 0),
        shipmentNo: r.shipmentNo || r.shipmentNumber || '',
        cgst: typeof r.cgst === 'number' ? r.cgst : (parseFloat(r.cgst) || 0),
        sgst: typeof r.sgst === 'number' ? r.sgst : (parseFloat(r.sgst) || 0),
        totalAmount: typeof r.totalAmount === 'number' ? r.totalAmount : (parseFloat(r.totalAmount) || 0),
        tds: typeof r.tds === 'number' ? r.tds : (parseFloat(r.tds) || 0),
        receivable: typeof r.receivable === 'number' ? r.receivable : (parseFloat(r.receivable) || 0),
        paymentAmount: typeof r.paymentAmount === 'number' ? r.paymentAmount : (parseFloat(r.paymentAmount) || 0),
        tdsProvision: typeof r.tdsProvision === 'number' ? r.tdsProvision : (parseFloat(r.tdsProvision) || 0),
        paymentDate: r.paymentDate || '',
        referenceNo: r.referenceNo || '',
        debitAmount: typeof r.debitAmount === 'number' ? r.debitAmount : (parseFloat(r.debitAmount) || 0),
        debitReasons: Array.isArray(r.debitReasons) ? r.debitReasons : (r.debitReasons ? [r.debitReasons] : []),
        remarks: r.remarks || '',
        slNo: typeof r.slNo === 'number' ? r.slNo : (parseFloat(r.slNo) || (idx + 1)),
        hidden: false
      };

      if (existingBillNos.has(upperKey)) {
        existingCount++;
      } else {
        importedCount++;
        existingBillNos.add(upperKey);
      }

      bulkOps.push({
        updateOne: {
          filter: { billNo: invNo },
          update: { $set: updateDoc },
          upsert: true
        }
      });
    }

    if (bulkOps.length > 0) {
      await FinancialYearRow.bulkWrite(bulkOps);
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('cementUpdates', { action: 'billRegisterExcelImport', count: bulkOps.length });
    }

    res.json({
      success: true,
      totalRows: rows.length,
      importedCount,
      existingCount,
      errorCount: errors.length,
      errors
    });
  } catch (err) {
    console.error('Failed to import Bill Register Excel:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/parse-pdf', memoryPdfUpload.single('pdf'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, error: 'No PDF file uploaded.' });
    }

    const targetSite = (req.body.targetSite || req.body.site || 'NVL').toUpperCase() === 'NVCL' ? 'NVCL' : 'NVL';
    const parseResult = await parsePdfBillRegister(req.file.buffer, targetSite);

    // Fetch existing bill numbers from FinancialYearRow & cement entries for duplicate detection
    const cementCol = mongoose.connection.useDb("cement_register").collection("entries");
    const existingFyRows = await FinancialYearRow.find({}).lean();
    const existingBillNos = new Set(existingFyRows.map(r => String(r.billNo).trim().toUpperCase()));

    const allCementBills = await cementCol.find({}, { projection: { "BILL NO": 1, "UNLOADING BILL NO": 1, "INVOICE NO": 1 } }).toArray();
    allCementBills.forEach(c => {
      if (c["BILL NO"]) existingBillNos.add(String(c["BILL NO"]).trim().toUpperCase());
      if (c["UNLOADING BILL NO"]) existingBillNos.add(String(c["UNLOADING BILL NO"]).trim().toUpperCase());
      if (c["INVOICE NO"]) existingBillNos.add(String(c["INVOICE NO"]).trim().toUpperCase());
    });

    let validCount = 0;
    let existingCount = 0;
    let reviewCount = 0;

    const rowsWithStatus = parseResult.rows.map(row => {
      const isExisting = row.invoiceNumber ? existingBillNos.has(String(row.invoiceNumber).trim().toUpperCase()) : false;
      if (isExisting) existingCount++;
      else validCount++;

      if (row.needsReview) reviewCount++;

      return {
        ...row,
        site: targetSite,
        isExisting
      };
    });

    res.json({
      success: true,
      filename: req.file.originalname,
      targetSite,
      totalPages: parseResult.totalPages,
      totalRows: parseResult.totalRows,
      validCount,
      existingCount,
      reviewCount,
      rows: rowsWithStatus
    });
  } catch (err) {
    console.error('Failed to parse PDF Bill Register:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/save-row', async (req, res) => {
  try {
    const {
      billNo, billType, editedInvoiceDate, editedInvoiceNumber, editedMonth,
      editedSite, editedAmount, debitReason, debitReasons, damageYear, damageMonth,
      damageVehicles, damageTrips, damageVehicleAmounts, slNo,
      originalDebitAmount, totalAllocatedAmount, remainingDebitAmount, deductionAllocations,
      b2bEntryId, b2bEntryIds
    } = req.body;
    let updateObj = {};
    if (billType !== undefined) updateObj.billType = billType;
    if (editedInvoiceDate !== undefined) updateObj.editedInvoiceDate = editedInvoiceDate;
    if (editedInvoiceNumber !== undefined) updateObj.editedInvoiceNumber = editedInvoiceNumber;
    if (editedMonth !== undefined) updateObj.editedMonth = editedMonth;
    if (editedSite !== undefined) updateObj.editedSite = editedSite;
    if (editedAmount !== undefined) updateObj.editedAmount = parseFloat(editedAmount) || 0;

    // Check if auto-generated from cement register to block core field edits
    const cementCol = mongoose.connection.useDb("cement_register").collection("entries");
    const isAutoGenerated = await cementCol.findOne({
      $or: [
        { "BILL NO": billNo },
        { "UNLOADING BILL NO": billNo }
      ]
    });
    if (isAutoGenerated) {
      updateObj = {}; // Clear core fields to prevent tampering
    }

    if (debitReason !== undefined) updateObj.debitReason = debitReason;
    if (debitReasons !== undefined) updateObj.debitReasons = debitReasons;
    if (damageYear !== undefined) updateObj.damageYear = damageYear;
    if (damageMonth !== undefined) updateObj.damageMonth = damageMonth;
    if (damageVehicles !== undefined) updateObj.damageVehicles = damageVehicles;
    if (damageTrips !== undefined) updateObj.damageTrips = damageTrips;
    if (damageVehicleAmounts !== undefined) updateObj.damageVehicleAmounts = damageVehicleAmounts;
    if (slNo !== undefined) updateObj.slNo = parseFloat(slNo) || 0;
    if (b2bEntryId !== undefined) updateObj.b2bEntryId = b2bEntryId;
    if (b2bEntryIds !== undefined) updateObj.b2bEntryIds = b2bEntryIds;

    // Deduction allocations persistence
    if (originalDebitAmount !== undefined) updateObj.originalDebitAmount = parseFloat(originalDebitAmount);
    if (totalAllocatedAmount !== undefined) updateObj.totalAllocatedAmount = parseFloat(totalAllocatedAmount);
    if (remainingDebitAmount !== undefined) updateObj.remainingDebitAmount = parseFloat(remainingDebitAmount);
    if (deductionAllocations !== undefined) updateObj.deductionAllocations = deductionAllocations;

    await FinancialYearRow.findOneAndUpdate(
      { billNo },
      { $set: updateObj },
      { upsert: true, returnDocument: 'after' }
    );

    // --- Cement Register Deductions Override Logic ---
    if ((debitReason || (debitReasons && debitReasons.length > 0)) && damageTrips && damageVehicleAmounts) {
      const reasonsToProcess = debitReasons && debitReasons.length > 0 ? debitReasons : (debitReason && debitReason !== 'None' ? [debitReason] : []);
      const cementCol = mongoose.connection.useDb("cement_register").collection("entries");

      // 1. Clear any existing overrides in cement register for this bill across all possible reasons to avoid stale data
      const ALL_REASONS = [...new Set([...PERMITTED_DEBIT_REASONS, 'GPS Trip Charges', 'Device Installation Charges', 'RFID Charges', 'Safty violation charges'])];
      for (const reason of ALL_REASONS) {
        const overridePath = `deductionsOverride.${reason}`;
        await cementCol.updateMany(
          { [`${overridePath}.billRegisterRef`]: billNo },
          { $unset: { [overridePath]: "" } }
        );
      }

      if (reasonsToProcess.length > 0) {
        const projSettingsDoc = (await ProjectedDeductionSetting.findOne()) || {};

        // 2. Set new overrides for the selected trips
        for (const t of damageTrips) {

          // Find the exact trip in the cement register using Month, FY, Vehicle, and Trip Number
          const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          const monthIdx = MONTHS.findIndex(m => damageMonth.startsWith(m)) + 1;
          let yearRegexPart = '';
          if (damageYear) {
            const parts = damageYear.split('-');
            if (parts.length === 2) {
              let startY = parseInt(parts[0]);
              let endY = parseInt(parts[1]);
              if (startY < 100) startY += 2000;
              if (endY < 100) endY += 2000;
              const calendarYear = (monthIdx >= 4) ? startY : endY;
              const yrStr = String(calendarYear);
              const yr2 = yrStr.slice(-2);
              yearRegexPart = `(${yrStr}|${yr2})`;
            }
          }
          const monthStr = String(monthIdx).padStart(2, '0');
          const dateRegex = new RegExp(`^\\d{2}[-/\\.]${monthStr}[-/\\.]${yearRegexPart}`);

          const tripsQuery = {
            $or: [{ 'VEHICLE NUMBER': t.vehicle }, { 'VEHICLE NO': t.vehicle }],
            $and: [
              {
                $or: [
                  { "LOADING DT": dateRegex },
                  { "LOADING DATE": dateRegex },
                  { "BILL DATE": dateRegex }
                ]
              }
            ]
          };

          const dbTrips = await cementCol.find(tripsQuery).toArray();

          dbTrips.sort((a, b) => {
            const dA = parseDate(a['LOADING DT'] || a['LOADING DATE'] || a['BILL DATE'] || '');
            const dB = parseDate(b['LOADING DT'] || b['LOADING DATE'] || b['BILL DATE'] || '');
            const tA = dA ? dA.getTime() : 0;
            const tB = dB ? dB.getTime() : 0;
            return tA - tB;
          });

          let dbTrip = null;
          if (t.tripNumber && dbTrips[t.tripNumber - 1]) {
            dbTrip = dbTrips[t.tripNumber - 1];
          } else {
            // Fallback
            // Fallback
            const query = {
              $and: [
                {
                  $or: [
                    { 'VEHICLE NUMBER': t.vehicle },
                    { 'VEHICLE NO': t.vehicle }
                  ]
                },
                {
                  $or: [
                    { 'LOADING DT': t.tripDate },
                    { 'LOADING DATE': t.tripDate },
                    { 'BILL DATE': t.tripDate },
                    { 'RECEIVING DATE': t.tripDate },
                    { 'DATE': t.tripDate },
                    { 'INVOICE DATE': t.tripDate }
                  ]
                }
              ]
            };
            dbTrip = await cementCol.findOne(query);
          }
          if (dbTrip) {
            for (const reason of reasonsToProcess) {
              const amountVal = damageVehicleAmounts[t.invoiceNo] && typeof damageVehicleAmounts[t.invoiceNo] === 'object'
                ? damageVehicleAmounts[t.invoiceNo][reason]
                : damageVehicleAmounts[t.invoiceNo]; // Backwards compatibility if it's a flat object

              const manualAmt = parseFloat(String(amountVal || '0').replace(/,/g, '')) || 0;

              let projectedCol = '';
              if (reason === 'Damage / Shortage') projectedCol = 'SHORTAGE (AMOUNT)';
              else if (reason === 'GPS Trip Charges' || reason === 'GPS Monitoring / Trip Charge' || reason === 'GPS Monitoring Charge') projectedCol = 'GPS Monitoring Charge';
              else if (reason === 'GPS Deviation Charges') projectedCol = 'GPS Deviation Charges';
              else if (reason === 'Device Installation Charges') projectedCol = 'Give GPS DEVICE';
              else if (reason === 'RFID Deduction / Charges') projectedCol = 'Give RFID TAG';
              else if (reason === 'Suspense') projectedCol = 'Suspense';

              if (projectedCol) {
                let finalAmtToSync = manualAmt;
                let hasProjectedSetting = false;
                let projectedSettingVal = 0;
                const tripRecordDate = t.tripDate || dbTrip['LOADING DT'] || dbTrip['BILL DATE'] || dbTrip['DATE'] || dbTrip['INVOICE DATE'];

                if (reason === 'Damage / Shortage') {
                  hasProjectedSetting = true;
                  projectedSettingVal = await getApplicableProjectedDeduction('DAMAGE_DEDUCTION', tripRecordDate);
                } else if (reason === 'Device Installation Charges' || reason === 'GPS Device Installation') {
                  hasProjectedSetting = true;
                  projectedSettingVal = await getApplicableProjectedDeduction('GPS_DEVICE_INSTALLATION', tripRecordDate);
                } else if (reason === 'RFID Deduction / Charges' || reason === 'RFID') {
                  hasProjectedSetting = true;
                  projectedSettingVal = await getApplicableProjectedDeduction('RFID', tripRecordDate);
                } else if (reason === 'GPS Monitoring / Trip Charges' || reason === 'GPS Trip Charges' || reason === 'GPS Trip Charge' || reason === 'GPS Monitoring / Trip Charge') {
                  hasProjectedSetting = true;
                  projectedSettingVal = await getApplicableProjectedDeduction('GPS_MONITORING_TRIP_CHARGE', tripRecordDate);
                } else if (reason === 'Travelling Expense' || reason === 'Travelling Expense (₹)' || reason === 'Travel Expense') {
                  hasProjectedSetting = true;
                  projectedSettingVal = await getApplicableProjectedDeduction('TRAVELLING_EXPENSE', tripRecordDate);
                }

                if (hasProjectedSetting) {
                  if (manualAmt >= projectedSettingVal) {
                    finalAmtToSync = manualAmt;
                  } else {
                    finalAmtToSync = projectedSettingVal;
                  }
                }

                const projVal = parseFloat(String(dbTrip[projectedCol] || '0').replace(/,/g, '')) || 0;

                const overridePath = `deductionsOverride.${reason}`;
                const updateDoc = {
                  $set: {
                    [overridePath]: {
                      projected: projVal,
                      actual: manualAmt,
                      billRegisterRef: billNo,
                      timestamp: new Date()
                    },
                    [projectedCol]: finalAmtToSync,
                    'DEDICATED': 'Actual'
                  }
                };
                await cementCol.updateOne({ _id: dbTrip._id }, updateDoc);
              }
            }
          }
        }
      }
    }

    try {
      const { getIO } = require('../socket');
      getIO().emit('fyDetailsUpdates', { action: 'save-row', billNo });
    } catch (_) {}

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/update-bill-type', async (req, res) => {
  try {
    const { billNo, billType } = req.body;
    if (!billNo) return res.status(400).json({ error: 'billNo is required' });

    const normalizedBillType = billType ? String(billType).trim().toUpperCase() : '';
    await FinancialYearRow.findOneAndUpdate(
      { billNo },
      { $set: { billType: normalizedBillType } },
      { upsert: true, returnDocument: 'after' }
    );

    try {
      const { getIO } = require('../socket');
      getIO().emit('billRegisterUpdated', { action: 'billTypeUpdated', billNo, billType: normalizedBillType });
      getIO().emit('fyDetailsUpdates', { action: 'billTypeUpdated', billNo, billType: normalizedBillType });
    } catch (_) {}

    res.json({ success: true, billNo, billType: normalizedBillType });
  } catch (err) {
    console.error('Update bill type error:', err);
    res.status(500).json({ error: 'Server error updating bill type' });
  }
});

router.get('/documents', async (req, res) => {
  try {
    const docs = await BillRegisterDocument.find({}).sort({ createdAt: -1 });
    res.json(docs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

router.post('/upload-document', billPdfUpload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const newDoc = new BillRegisterDocument({
      fileUrl: req.file.location,
      fileName: req.file.originalname
    });
    await newDoc.save();

    res.json({ message: "Document uploaded successfully", doc: newDoc });
  } catch (err) {
    console.error('[FYDetails] /upload-document error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

router.delete('/delete-document/:id', async (req, res) => {
  try {
    await BillRegisterDocument.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Document deleted successfully' });
  } catch (err) {
    console.error('[FYDetails] /delete-document error:', err);
    res.status(500).json({ error: 'Delete failed' });
  }
});

router.get('/vehicles', async (req, res) => {
  try {
    const rawMonths = req.query.months || req.query.month;
    if (!rawMonths) return res.status(400).json({ error: 'Month is required' });

    const monthParts = Array.isArray(rawMonths)
      ? rawMonths
      : String(rawMonths).split(',').map(s => s.trim()).filter(Boolean);

    const MONTHS_MAP = {
      jan: 1, january: 1,
      feb: 2, february: 2,
      mar: 3, march: 3,
      apr: 4, april: 4,
      may: 5,
      jun: 6, june: 6,
      jul: 7, july: 7,
      aug: 8, august: 8,
      sep: 9, september: 9,
      oct: 10, october: 10,
      nov: 11, november: 11,
      dec: 12, december: 12
    };

    const monthIndices = monthParts.map(m => {
      const parsedNum = parseInt(m, 10);
      if (!isNaN(parsedNum) && parsedNum >= 1 && parsedNum <= 12) return parsedNum;
      const lower = String(m).toLowerCase();
      return MONTHS_MAP[lower] || null;
    }).filter(Boolean);

    if (monthIndices.length === 0) return res.json([]);

    const { fy } = req.query;
    let startY = null;
    let endY = null;
    if (fy) {
      const parts = String(fy).replace(/^FY\s*/i, '').split('-');
      if (parts.length === 2) {
        startY = parseInt(parts[0], 10);
        endY = parseInt(parts[1], 10);
        if (startY < 100) startY += 2000;
        if (endY < 100) endY += 2000;
      }
    }

    const dateOrConditions = [];
    for (const m of monthIndices) {
      let yearRegexPart = '';
      if (startY && endY) {
        const calendarYear = (m >= 4) ? startY : endY;
        const yrStr = String(calendarYear);
        const yr2 = yrStr.slice(-2);
        yearRegexPart = `(${yrStr}|${yr2})`;
      }
      const monthStr = String(m).padStart(2, '0');
      const dateRegex = new RegExp(`^\\d{2}[-/\\.]${monthStr}[-/\\.]${yearRegexPart}`);
      dateOrConditions.push(
        { "LOADING DT": dateRegex },
        { "LOADING DATE": dateRegex },
        { "BILL DATE": dateRegex }
      );
    }

    const match = dateOrConditions.length > 0 ? { $or: dateOrConditions } : {};
    const vehicles = await getCementCol().distinct('VEHICLE NUMBER', match);
    const v2 = await getCementCol().distinct('VEHICLE NO', match);
    let allV = [...new Set([...vehicles, ...v2])].filter(Boolean);
    if (allV.length === 0) {
      const fb1 = await getCementCol().distinct('VEHICLE NUMBER');
      const fb2 = await getCementCol().distinct('VEHICLE NO');
      allV = [...new Set([...fb1, ...fb2])].filter(Boolean);
    }
    allV.sort((a, b) => String(a).localeCompare(String(b)));
    res.json(allV);
  } catch (err) {
    console.error('[FYDetails] /vehicles error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /allocate-deduction
router.post('/allocate-deduction', async (req, res) => {
  try {
    const {
      billNo,
      debitReason,
      financialYear,
      months,
      vehicles,
      condition,
      originalDebitAmount,
      allocatedAmount,
      allocationDate,
      tripAllocations,
      allocationId: requestedAllocationId
    } = req.body;

    if (!billNo) return res.status(400).json({ error: 'Bill Number is required' });
    if (!debitReason) return res.status(400).json({ error: 'Debit Reason is required' });

    const canonicalDebitReason = getCanonicalDebitReason(debitReason);
    if (!canonicalDebitReason) {
      return res.status(400).json({
        error: `Unsupported deduction reason: "${debitReason}". Permitted reasons: ${PERMITTED_DEBIT_REASONS.join(', ')}`
      });
    }

    // Retrieve existing row in FinancialYearRow
    const existingRow = await FinancialYearRow.findOne({ billNo });

    // Determine the baseline original debit amount
    let baseOriginalDebit = 0;
    if (existingRow && existingRow.originalDebitAmount != null && Number(existingRow.originalDebitAmount) > 0) {
      baseOriginalDebit = parseFloat(existingRow.originalDebitAmount) || 0;
    } else if (originalDebitAmount != null && parseFloat(originalDebitAmount) > 0) {
      baseOriginalDebit = parseFloat(originalDebitAmount) || 0;
    } else {
      const payment = await FinancialYearPayment.findOne({ billNos: billNo });
      if (payment && payment.debitAmount != null) {
        baseOriginalDebit = parseFloat(payment.debitAmount) || 0;
      }
    }

    // Existing allocations
    const currentAllocations = (existingRow && existingRow.deductionAllocations) || [];

    // Check if we are updating an existing allocation
    const existingAllocIdx = requestedAllocationId
      ? currentAllocations.findIndex(a => a.allocationId === requestedAllocationId || String(a._id) === requestedAllocationId)
      : -1;
    const isEdit = existingAllocIdx >= 0;
    const targetAllocationId = isEdit
      ? (currentAllocations[existingAllocIdx].allocationId || requestedAllocationId)
      : (requestedAllocationId || new mongoose.Types.ObjectId().toString());

    const previousTripAllocations = isEdit
      ? (currentAllocations[existingAllocIdx].tripAllocations || [])
      : [];

    // Sum of other allocations (excluding the one being edited)
    const alreadyAllocated = currentAllocations
      .filter((_, idx) => !isEdit || idx !== existingAllocIdx)
      .reduce((sum, a) => sum + (parseFloat(a.allocatedAmount) || 0), 0);

    const availableToAllocate = Math.max(0, baseOriginalDebit - alreadyAllocated);

    let allocAmt = parseFloat(allocatedAmount);
    // If tripAllocations are provided, compute or verify total allocated amount from trip allocations
    let parsedTripAllocations = [];
    if (Array.isArray(tripAllocations) && tripAllocations.length > 0) {
      const tripAllocSum = tripAllocations.reduce((sum, t) => sum + (parseFloat(t.allocatedAmount || t.tripAllocateAmount) || 0), 0);
      if (tripAllocSum > 0) {
        allocAmt = tripAllocSum;
      }
    }

    if (isNaN(allocAmt) || allocAmt <= 0) {
      return res.status(400).json({ error: 'Allocated amount must be a positive number.' });
    }

    if (availableToAllocate <= 0) {
      return res.status(400).json({
        error: 'Remaining Debit is ₹0. This debit is fully allocated and settled.',
        availableToAllocate: 0
      });
    }

    if (allocAmt > availableToAllocate) {
      return res.status(400).json({
        error: `Only ₹${availableToAllocate.toLocaleString('en-IN')} is available for allocation.`,
        availableToAllocate
      });
    }

    const newRemainingDebit = Math.max(0, availableToAllocate - allocAmt);
    const newTotalAllocated = alreadyAllocated + allocAmt;

    if (Array.isArray(tripAllocations) && tripAllocations.length > 0) {
      parsedTripAllocations = tripAllocations.map(t => {
        const tripAmt = parseFloat(t.allocatedAmount || t.tripAllocateAmount) || 0;
        return {
          tripAllocationId: t.tripAllocationId || new mongoose.Types.ObjectId().toString(),
          allocationId: targetAllocationId,
          bankBookRecordId: String(existingRow?._id || new mongoose.Types.ObjectId()),
          invoiceNumber: billNo,
          shipmentNo: t.shipmentNo || '',
          invoiceNo: t.invoiceNo || '',
          tripRecordId: t.tripRecordId || t.tripId || (t._id ? String(t._id) : ''),
          tripId: t.tripId || t.tripRecordId || (t._id ? String(t._id) : ''),
          debitReason: canonicalDebitReason,
          financialYear: financialYear || '',
          month: t.month || '',
          vehicleNumber: t.vehicleNumber || t.vehicle || '',
          vehicle: t.vehicle || t.vehicleNumber || '',
          loadingDate: t.loadingDate || '',
          originalDebitAmount: baseOriginalDebit,
          tripAllocateAmount: tripAmt,
          allocatedAmount: tripAmt,
          totalAllocatedAmount: newTotalAllocated,
          remainingDebitAmount: newRemainingDebit,
          createdAt: isEdit ? (currentAllocations[existingAllocIdx].createdAt || new Date()) : new Date(),
          updatedAt: new Date()
        };
      });
    }

    const allocationRecord = {
      allocationId: targetAllocationId,
      bankBookRecordId: String(existingRow?._id || new mongoose.Types.ObjectId()),
      invoiceNumber: billNo,
      debitReason: canonicalDebitReason,
      financialYear: financialYear || '',
      months: Array.isArray(months) ? months : [months].filter(Boolean),
      vehicles: Array.isArray(vehicles) ? vehicles : [vehicles].filter(Boolean),
      condition: condition || '',
      originalDebitAmount: baseOriginalDebit,
      allocatedAmount: allocAmt,
      remainingDebitAmount: newRemainingDebit,
      allocationDate: allocationDate || new Date().toISOString().split('T')[0],
      tripAllocations: parsedTripAllocations,
      createdAt: isEdit ? (currentAllocations[existingAllocIdx].createdAt || new Date()) : new Date(),
      updatedAt: new Date()
    };

    let updatedAllocations;
    if (isEdit) {
      updatedAllocations = [...currentAllocations];
      updatedAllocations[existingAllocIdx] = allocationRecord;
    } else {
      updatedAllocations = [...currentAllocations, allocationRecord];
    }

    const updatedReasons = [...new Set(updatedAllocations.map(a => a.debitReason).filter(Boolean))];

    const updatedRow = await FinancialYearRow.findOneAndUpdate(
      { billNo },
      {
        $set: {
          originalDebitAmount: baseOriginalDebit,
          totalAllocatedAmount: newTotalAllocated,
          remainingDebitAmount: newRemainingDebit,
          debitReason: canonicalDebitReason,
          debitReasons: updatedReasons,
          deductionAllocations: updatedAllocations
        }
      },
      { upsert: true, returnDocument: 'after' }
    );

    // Keep FinancialYearPayment in sync with remainingDebitAmount
    await FinancialYearPayment.updateMany(
      { billNos: billNo },
      { $set: { debitAmount: newRemainingDebit } }
    );

    // Check if debit reason changed on edit
    const previousReason = isEdit ? currentAllocations[existingAllocIdx]?.debitReason : null;
    const reasonChanged = isEdit && previousReason && getCanonicalDebitReason(previousReason) !== canonicalDebitReason;

    if (reasonChanged) {
      await syncDebitAllocationToCementRegister({
        billNo,
        debitReason: previousReason,
        financialYear,
        allocationId: targetAllocationId,
        tripAllocations: [],
        isDelete: true,
        previousTripAllocations
      });
      await syncDebitAllocationToCementRegister({
        billNo,
        debitReason: canonicalDebitReason,
        financialYear,
        allocationId: targetAllocationId,
        tripAllocations: parsedTripAllocations,
        isDelete: false,
        previousTripAllocations: []
      });
    } else {
      await syncDebitAllocationToCementRegister({
        billNo,
        debitReason: canonicalDebitReason,
        financialYear,
        allocationId: targetAllocationId,
        tripAllocations: parsedTripAllocations,
        isDelete: false,
        previousTripAllocations
      });
    }

    // Emit websocket events
    try {
      const { getIO } = require('../socket');
      const io = getIO();
      io.emit('fyDetailsUpdates', { action: 'allocate-deduction', billNo, remainingDebit: newRemainingDebit });
      io.emit('cementUpdates', { action: 'allocate-deduction', billNo });
    } catch (_) {}

    res.json({
      success: true,
      allocation: allocationRecord,
      originalDebitAmount: baseOriginalDebit,
      totalAllocatedAmount: newTotalAllocated,
      remainingDebitAmount: newRemainingDebit,
      row: updatedRow
    });
  } catch (err) {
    console.error('[FYDetails] /allocate-deduction error:', err);
    res.status(500).json({ error: 'Failed to allocate deduction: ' + err.message });
  }
});

// DELETE /allocate-deduction/:billNo/:allocationId
router.delete('/allocate-deduction/:billNo/:allocationId', async (req, res) => {
  try {
    const { billNo, allocationId } = req.params;
    const existingRow = await FinancialYearRow.findOne({ billNo });
    if (!existingRow) return res.status(404).json({ error: 'Record not found' });

    const currentAllocations = existingRow.deductionAllocations || [];
    const allocToDelete = currentAllocations.find(a => a.allocationId === allocationId || String(a._id) === allocationId);
    if (!allocToDelete) return res.status(404).json({ error: 'Allocation not found' });

    const filteredAllocations = currentAllocations.filter(a => a.allocationId !== allocationId && String(a._id) !== allocationId);

    const baseOriginalDebit = existingRow.originalDebitAmount != null ? existingRow.originalDebitAmount : 0;
    const newTotalAllocated = filteredAllocations.reduce((sum, a) => sum + (parseFloat(a.allocatedAmount) || 0), 0);
    const newRemainingDebit = Math.max(0, baseOriginalDebit - newTotalAllocated);

    const remainingReasons = [...new Set(filteredAllocations.map(a => a.debitReason).filter(Boolean))];

    const updatedRow = await FinancialYearRow.findOneAndUpdate(
      { billNo },
      {
        $set: {
          deductionAllocations: filteredAllocations,
          totalAllocatedAmount: newTotalAllocated,
          remainingDebitAmount: newRemainingDebit,
          debitReasons: remainingReasons.length > 0 ? remainingReasons : (existingRow.debitReasons || [])
        }
      },
      { returnDocument: 'after' }
    );

    await FinancialYearPayment.updateMany(
      { billNos: billNo },
      { $set: { debitAmount: newRemainingDebit } }
    );

    // Reverse allocation on Cement Register
    await syncDebitAllocationToCementRegister({
      billNo,
      debitReason: allocToDelete.debitReason,
      financialYear: allocToDelete.financialYear,
      allocationId: allocToDelete.allocationId || allocationId,
      tripAllocations: [],
      isDelete: true,
      previousTripAllocations: allocToDelete.tripAllocations || []
    });

    try {
      const { getIO } = require('../socket');
      const io = getIO();
      io.emit('fyDetailsUpdates', { action: 'allocate-deduction', billNo, remainingDebit: newRemainingDebit });
      io.emit('cementUpdates', { action: 'allocate-deduction', billNo });
    } catch (_) {}

    res.json({
      success: true,
      remainingDebitAmount: newRemainingDebit,
      totalAllocatedAmount: newTotalAllocated,
      deductionAllocations: filteredAllocations,
      row: updatedRow
    });
  } catch (err) {
    console.error('[FYDetails] DELETE /allocate-deduction error:', err);
    res.status(500).json({ error: 'Failed to remove allocation' });
  }
});

router.get('/trips', async (req, res) => {
  try {
    const { month, months, vehicle, vehicles, fy } = req.query;
    const monthParam = months || month;
    const vehicleParam = vehicles || vehicle;
    if (!monthParam || !vehicleParam) return res.status(400).json({ error: 'Month and vehicle are required' });

    const rawMonths = Array.isArray(monthParam) ? monthParam : String(monthParam).split(',').map(m => m.trim()).filter(Boolean);
    const vehiclesArray = Array.isArray(vehicleParam) ? vehicleParam : String(vehicleParam).split(',').map(v => v.trim()).filter(Boolean);

    const MONTH_NAMES_FULL = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    let startY = 2026, endY = 2027;
    if (fy) {
      const parts = fy.replace(/[^0-9\-]/g, '').split('-');
      if (parts.length === 2) {
        startY = parseInt(parts[0], 10);
        endY = parseInt(parts[1], 10);
        if (startY < 100) startY += 2000;
        if (endY < 100) endY += 2000;
      }
    }

    const monthConditions = [];
    for (const mItem of rawMonths) {
      let mIdx = -1;
      const asInt = parseInt(mItem, 10);
      if (!isNaN(asInt) && asInt >= 1 && asInt <= 12) {
        mIdx = asInt;
      } else {
        mIdx = MONTH_NAMES_FULL.findIndex(name => name.toLowerCase().startsWith(mItem.toLowerCase().slice(0, 3))) + 1;
      }
      if (mIdx >= 1 && mIdx <= 12) {
        const calYear = mIdx >= 4 ? startY : endY;
        const mStr = String(mIdx).padStart(2, '0');
        const yrStr = String(calYear);
        const yr2 = yrStr.slice(-2);
        const dateRegex = new RegExp(`^\\d{2}[-/\\.]${mStr}[-/\\.](?:${yrStr}|${yr2})`);

        monthConditions.push({
          $or: [
            { month: mIdx, year: calYear },
            { Month: mIdx, Year: calYear },
            { month: String(mIdx), year: String(calYear) },
            { 'LOADING DT': dateRegex },
            { 'LOADING DATE': dateRegex },
            { 'BILL DATE': dateRegex }
          ]
        });
      }
    }

    const match = {
      $and: [
        {
          $or: [
            { 'VEHICLE NUMBER': { $in: vehiclesArray } },
            { 'VEHICLE NO': { $in: vehiclesArray } }
          ]
        }
      ]
    };

    if (monthConditions.length > 0) {
      match.$and.push({ $or: monthConditions });
    }

    const trips = await getCementCol().find(match).toArray();

    function getExistingDeductionsForTrip(t) {
      const numVal = (v) => {
        if (v === undefined || v === null || v === '') return 0;
        const n = parseFloat(String(v).replace(/,/g, ''));
        return isNaN(n) ? 0 : n;
      };

      const getFromAllocations = (canonicalReason) => {
        if (!Array.isArray(t.debitAllocations)) return 0;
        return t.debitAllocations
          .filter(a => {
            const c = getCanonicalDebitReason(a.reason) || a.reason;
            return c === canonicalReason;
          })
          .reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);
      };

      const damageShortage = numVal(t['SHORTAGE (AMOUNT)'])
        || numVal(t['Damage Deduction'])
        || numVal(t.baseDeductions?.['Damage / Shortage'])
        || numVal(t.deductionsOverride?.['Damage / Shortage']?.projected)
        || getFromAllocations('Damage / Shortage');

      const gpsDeviation = numVal(t['GPS Deviation Charges'])
        || numVal(t['GPS DEVIATION'])
        || numVal(t['GPS DEVIATION CHARGES'])
        || numVal(t.baseDeductions?.['GPS Deviation Charge'])
        || getFromAllocations('GPS Deviation Charge');

      const gpsMonitoring = numVal(t['GPS Monitoring Charge'])
        || numVal(t['GPS MONITORING / TRIP CHARGE'])
        || numVal(t['GPS Trip Charges'])
        || numVal(t.baseDeductions?.['GPS Monitoring / Trip Charges'])
        || getFromAllocations('GPS Monitoring / Trip Charges');

      const gpsInstallation = numVal(t['Give GPS DEVICE'])
        || numVal(t['GIVE GPS DEVICE'])
        || numVal(t['GPS Installation Charges'])
        || numVal(t['Device Installation Charges'])
        || numVal(t['GPS DEVICE'])
        || numVal(t.baseDeductions?.['GPS Installation Charges'])
        || getFromAllocations('GPS Installation Charges');

      const rfidDeduction = numVal(t['Give RFID TAG'])
        || numVal(t['GIVE RFID TAG'])
        || numVal(t['RFID Deduction / Charges'])
        || numVal(t['RFID Charges'])
        || numVal(t.baseDeductions?.['RFID Deduction / Charges'])
        || getFromAllocations('RFID Deduction / Charges');

      const suspense = numVal(t['Suspense'])
        || numVal(t['SUSPENSE'])
        || numVal(t.baseDeductions?.['Suspense'])
        || getFromAllocations('Suspense');

      const tdsProvision = numVal(t['TDS PROVISION'])
        || numVal(t['TDS Provision'])
        || numVal(t['TDS'])
        || getFromAllocations('TDS PROVISION');

      let siteOfficeRent = numVal(t['Site office Rent']) || getFromAllocations('Site office Rent');
      if (siteOfficeRent === 0 && (t['Other'] === 'Site office Rent' || t['OTHER'] === 'Site office Rent')) {
        siteOfficeRent = numVal(t['Others deduction']) || numVal(t['OTHERS DEDUCTION']);
      }

      let saftyViolation = numVal(t['Safty Violation Charges'])
        || numVal(t['Safty violation charges'])
        || getFromAllocations('Safty Violation Charges');
      if (saftyViolation === 0 && (String(t['Other']).toLowerCase().includes('safty') || String(t['Other']).toLowerCase().includes('safety'))) {
        saftyViolation = numVal(t['Others deduction']) || numVal(t['OTHERS DEDUCTION']);
      }

      return {
        'Damage / Shortage': damageShortage,
        'GPS Deviation Charge': gpsDeviation,
        'GPS Monitoring / Trip Charges': gpsMonitoring,
        'GPS Installation Charges': gpsInstallation,
        'RFID Deduction / Charges': rfidDeduction,
        'Suspense': suspense,
        'TDS PROVISION': tdsProvision,
        'Site office Rent': siteOfficeRent,
        'Safty Violation Charges': saftyViolation
      };
    }

    const formatted = trips.map(t => {
      const rawDate = t['LOADING DT'] || t['LOADING DATE'] || t['BILL DATE'] || '';
      let tripMonthName = '';
      if (t.month || t.Month) {
        const mNum = parseInt(t.month || t.Month, 10);
        if (mNum >= 1 && mNum <= 12) tripMonthName = MONTH_NAMES_FULL[mNum - 1];
      }
      if (!tripMonthName && rawDate) {
        const d = parseDate(rawDate);
        if (d) {
          const mNum = d.getMonth() + 1;
          if (mNum >= 1 && mNum <= 12) tripMonthName = MONTH_NAMES_FULL[mNum - 1];
        }
      }

      return {
        _id: String(t._id),
        tripId: String(t._id),
        tripRecordId: String(t._id),
        shipmentNo: t['SHIPMENT NO'] || t['Shipment No'] || '—',
        invoiceNo: t['INVOICE NO'] || t['BILL NO'] || t['Invoice No'] || '—',
        loadingDate: rawDate || '—',
        tripDate: rawDate || '—',
        month: tripMonthName,
        vehicle: t['VEHICLE NUMBER'] || t['VEHICLE NO'] || vehiclesArray[0] || '—',
        vehicleNumber: t['VEHICLE NUMBER'] || t['VEHICLE NO'] || vehiclesArray[0] || '—',
        plant: t['PLANT'] || t['FROM'] || '',
        destination: t['DESTINATION'] || t['TO'] || '',
        origin: t['PLANT'] || t['FROM'] || '',
        shortageBag: t['SHORTAGE (BAG)'],
        shortageRate: t['SHORTAGE (RATE)'],
        existingDeductions: getExistingDeductionsForTrip(t),
        rawDeductions: {
          'SHORTAGE (AMOUNT)': t['SHORTAGE (AMOUNT)'],
          'Damage Deduction': t['Damage Deduction'],
          'GPS Deviation Charges': t['GPS Deviation Charges'],
          'GPS DEVIATION': t['GPS DEVIATION'],
          'GPS Monitoring Charge': t['GPS Monitoring Charge'],
          'GPS MONITORING / TRIP CHARGE': t['GPS MONITORING / TRIP CHARGE'],
          'Give GPS DEVICE': t['Give GPS DEVICE'],
          'GPS Installation Charges': t['GPS Installation Charges'],
          'Give RFID TAG': t['Give RFID TAG'],
          'RFID Deduction / Charges': t['RFID Deduction / Charges'],
          'Suspense': t['Suspense'],
          'TDS': t['TDS'],
          'TDS Provision': t['TDS Provision'],
          'Others deduction': t['Others deduction'],
          'Site office Rent': t['Site office Rent'],
          'Safty Violation Charges': t['Safty Violation Charges']
        },
        debitAllocations: t.debitAllocations || []
      };
    });

    formatted.sort((a, b) => {
      const dA = parseDate(a.loadingDate);
      const dB = parseDate(b.loadingDate);
      const tA = dA ? dA.getTime() : 0;
      const tB = dB ? dB.getTime() : 0;
      return tA - tB;
    });

    const finalFormatted = formatted.map((t, idx) => ({ ...t, tripNumber: idx + 1 }));
    res.json(finalFormatted);
  } catch (err) {
    console.error('[FYDetails] /trips error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

function getBillSubmissionFromType(billType) {
  if (!billType) return '';
  const bt = String(billType).trim().toUpperCase();
  if (bt === 'FREIGHT') return 'PORTAL';
  if (bt === 'TOLL') return 'EXCEL';
  if (bt === 'UNLOADING') return 'EXCEL';
  if (bt === 'INCENTIVE') return 'EXCEL';
  return '';
}

// ── POST /fy-details/send-to-gst ──────────────────────────────────────────
router.post('/send-to-gst', auth, async (req, res) => {
  try {
    const { billIds } = req.body;
    if (!billIds || !Array.isArray(billIds) || billIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Please select at least one bill to send to GST.' });
    }

    // 1. Fetch current bill overrides & cement register details to build exact bill records
    const [rowOverrides, allCement] = await Promise.all([
      FinancialYearRow.find({}).lean(),
      getCementCol().find({}, { projection: { 
        'BILL NO': 1, 'UNLOADING BILL NO': 1, 'SITE': 1, 'BILL DATE': 1, 'LOADING DT': 1, 'LOADING DATE': 1, 
        'BILLING AMOUNT': 1, 'Billing Amount': 1, 'BILLING ER 95%': 1, 'AMOUNT': 1, 'EXTRA UNLOADING': 1,
        'month': 1, 'Month': 1
      }}).toArray()
    ]);

    const rowMap = {};
    for (const r of rowOverrides) rowMap[r.billNo] = r;

    // Aggregate cement register bills
    const aggregated = {};
    const addBill = (invNo, invDate, amount, row, defaultBillType) => {
      if (!invNo) return;
      invNo = String(invNo).trim();
      const rawSite = normalizeSite(row['SITE']);
      if (rawSite !== 'NVCL' && rawSite !== 'NVL') return;
      const prefix = rawSite === 'NVCL' ? 'NVCL-' : 'DAC-';
      const cleanInvNo = invNo.replace(/^(DAC|NVCL)[\/\-]/i, '').replace(/\//g, '-');
      const finalInvNo = `${prefix}${cleanInvNo}`;

      if (!aggregated[finalInvNo]) {
        let monthStr = '';
        const rawMonth = parseInt(row.month || row.Month, 10);
        if (rawMonth >= 1 && rawMonth <= 12) {
          monthStr = MONTH_NAMES[rawMonth - 1];
        } else {
          const dObj = parseDate(invDate);
          if (dObj) {
            const m = dObj.getMonth();
            const yy = String(dObj.getFullYear()).slice(-2);
            monthStr = `${MONTH_NAMES[m]} '${yy}`;
          }
        }
        aggregated[finalInvNo] = {
          invoiceDate: invDate,
          invoiceNumber: finalInvNo,
          month: monthStr,
          site: rawSite,
          amount: 0,
          billType: defaultBillType
        };
      }
      aggregated[finalInvNo].amount += amount;
    };

    for (const row of allCement) {
      if (row['BILL NO']) {
        const fAmt = parseFloat(row['BILLING AMOUNT']) || parseFloat(row['Billing Amount']) || parseFloat(row['BILLING ER 95%']) || parseFloat(row['AMOUNT']) || 0;
        const fDate = row['BILL DATE'] || row['LOADING DT'] || row['LOADING DATE'] || '';
        addBill(row['BILL NO'], fDate, fAmt, row, 'FREIGHT');
      }
      if (row['UNLOADING BILL NO']) {
        const uAmt = parseFloat(row['EXTRA UNLOADING']) || 0;
        const uDate = row['UNLOADING BILL DATE'] || '';
        addBill(row['UNLOADING BILL NO'], uDate, uAmt, row, 'UNLOADING');
      }
    }

    const gstCol = mongoose.connection.useDb("gst_portal").collection("entries");
    const sentBillIds = [];
    const failedBillIds = [];

    for (const billId of billIds) {
      try {
        // Backend DB-level duplicate protection: Check if already sent
        const ov = rowMap[billId] || {};
        if (ov.sentToGST) {
          console.log(`[SendToGST] Bill ${billId} has already been sent to GST.`);
          failedBillIds.push(billId);
          continue;
        }

        const existingGstRecord = await gstCol.findOne({ type: 'gstr1', sourceBillId: billId });
        if (existingGstRecord) {
          await FinancialYearRow.updateOne(
            { billNo: billId },
            { $set: { sentToGST: true, sentToGSTAt: existingGstRecord._sync_at || new Date() } },
            { upsert: true }
          );
          failedBillIds.push(billId);
          continue;
        }

        // Construct full bill details
        const aggBill = aggregated[billId] || {};
        const finalInvNo = ov.editedInvoiceNumber || aggBill.invoiceNumber || billId;
        const invDate = ov.editedInvoiceDate || aggBill.invoiceDate || '';
        const monthStr = ov.editedMonth || aggBill.month || '';
        const siteStr = normalizeSite(ov.editedSite || aggBill.site || 'NVCL');
        const billType = ov.billType || aggBill.billType || 'FREIGHT';
        const amt = parseFloat(ov.editedAmount !== undefined ? ov.editedAmount : (aggBill.amount || 0));

        // Core Algorithm: Calculate Bill Submission based on Bill Type
        const billSubmission = getBillSubmissionFromType(billType) || 'PORTAL';

        let cgst = Math.round(amt * 0.09);
        let sgst = Math.round(amt * 0.09);
        const totalAmt = Math.round(amt * 1.18);

        let filterMonth = 8;
        let filterYear = 2026;
        const dObj = parseDate(invDate);
        if (dObj) {
          filterMonth = dObj.getMonth() + 1;
          filterYear = dObj.getFullYear();
        }

        // 1. Create/link record in GSTR-1 (gst_portal.entries) FIRST
        const gstr1Payload = {
          type: 'gstr1',
          sourceBillId: billId,
          'Invoice Date': invDate,
          'Invoice Number': finalInvNo,
          'Month': monthStr,
          'SITE': siteStr,
          'Bill Submission': billSubmission,
          'BILL': billType,
          'Amount': amt,
          'CGST': cgst,
          'SGST': sgst,
          'Total Amount': totalAmt,
          filterMonth,
          filterYear,
          _sync_source: 'bill-register',
          _sync_at: new Date()
        };

        await gstCol.updateOne(
          { type: 'gstr1', sourceBillId: billId },
          { $set: gstr1Payload },
          { upsert: true }
        );

        // 2. ONLY AFTER GSTR-1 creation succeeds, update Bill Register DB
        await FinancialYearRow.updateOne(
          { billNo: billId },
          { $set: { sentToGST: true, sentToGSTAt: new Date() } },
          { upsert: true }
        );

        sentBillIds.push(billId);
      } catch (err) {
        console.error(`[SendToGST] Failed to process bill ${billId}:`, err);
        failedBillIds.push(billId);
      }
    }

    try {
      const { getIO } = require('../socket');
      getIO().emit('gstPortalUpdates', { action: 'sendToGST', count: sentBillIds.length });
      getIO().emit('fyDetailsUpdates', { action: 'sendToGST', count: sentBillIds.length });
    } catch (e) {
      console.log('Socket notification warning:', e.message);
    }

    res.json({
      success: true,
      sentCount: sentBillIds.length,
      failedCount: failedBillIds.length,
      sentBillIds,
      failedBillIds
    });
  } catch (error) {
    console.error('[SendToGST] Error:', error);
    res.status(500).json({ success: false, error: error.message || 'Server error' });
  }
});

router.syncDebitAllocationToCementRegister = syncDebitAllocationToCementRegister;
module.exports = router;

