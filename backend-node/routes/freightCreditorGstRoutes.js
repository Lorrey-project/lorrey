const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const FreightCreditorGstBreakdown = require('../models/FreightCreditorGstBreakdown');
const auth = require('../middleware/authMiddleware');

// Date parser helper
function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val) ? null : val;
  const str = String(val).trim();
  const ddmmyyyy = str.match(/^(\d{1,2})[\-\/](\d{1,2})[\-\/](\d{4})$/);
  if (ddmmyyyy) {
    const d = parseInt(ddmmyyyy[1], 10);
    const m = parseInt(ddmmyyyy[2], 10);
    const y = parseInt(ddmmyyyy[3], 10);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) return new Date(y, m - 1, d);
  }
  const yyyymmdd = str.match(/^(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})/);
  if (yyyymmdd) {
    const y = parseInt(yyyymmdd[1], 10);
    const m = parseInt(yyyymmdd[2], 10);
    const d = parseInt(yyyymmdd[3], 10);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) return new Date(y, m - 1, d);
  }
  const iso = new Date(str);
  if (!isNaN(iso.getTime())) return iso;
  return null;
}

function getDateParts(val) {
  const d = parseDate(val);
  if (!d) return null;
  return { day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear() };
}

// Authoritative Creditor to Party Payment Owner mapping
const CREDITOR_MAPPINGS = {
  'DIPALI_ASSOCIATES': {
    creditorKey: 'DIPALI_ASSOCIATES',
    creditorTitle: 'DIPALI ASSOCIATES',
    sourcePartyOwners: ['DIPALI ASSOCIATES', 'DIPALI ASSOCIATE', 'DIPALI ASSOCIAT', 'DIPALI NAYEK', 'DIPALI ASSOCIATES & CO', 'DIPALI ASSOCIATES & CO.', 'DIPALI ASSOCIATES(DIPALI NAYEK)'],
    defaultVehicles: ['WB39B8916']
  },
  'GKR_ENTERPRISE': {
    creditorKey: 'GKR_ENTERPRISE',
    creditorTitle: 'G.K.R. ENTERPRISE',
    sourcePartyOwners: ['GOUTAM ROY', 'GOUTAM  ROY', 'G.K.R. ENTERPRISE', 'GKR ENTERPRISE'],
    defaultVehicles: ['WB41H0177', 'WB41K2967', 'WB39G8384']
  },
  'SUBHENDU_SEKHAR_GHOSWAMI': {
    creditorKey: 'SUBHENDU_SEKHAR_GHOSWAMI',
    creditorTitle: 'SUBHENDU SEKHAR GHOSWAMI',
    sourcePartyOwners: ['SUBENDU SEKHAR GOSWAMI', 'SUBHENDU SEKHAR GHOSWAMI', 'SUBENDU SEKHAR GHOSWAMI', 'SUBHENDU SEKHAR GOSWAMI', 'SUBENDU GOSWAMI', 'SUBHENDU GHOSWAMI'],
    defaultVehicles: ['WB39G7433']
  }
};

function normalizeCreditorKey(key) {
  if (!key) return 'DIPALI_ASSOCIATES';
  const s = String(key).trim().toUpperCase();
  if (s.includes('DIPALI')) return 'DIPALI_ASSOCIATES';
  if (s.includes('G.K.R') || s.includes('GKR') || s.includes('GOUTAM')) return 'GKR_ENTERPRISE';
  if (s.includes('SUBHENDU') || s.includes('SUBENDU')) return 'SUBHENDU_SEKHAR_GHOSWAMI';
  return s;
}

function getFyVariants(fyInput, m, y) {
  const list = new Set();
  if (fyInput) {
    const s = String(fyInput).trim();
    list.add(s);
    const m1 = s.match(/(\d{4})[-–\/](\d{2,4})/);
    if (m1) {
      const start = m1[1];
      const end = m1[2].length === 2 ? m1[2] : m1[2].slice(-2);
      list.add(`${start.slice(-2)}-${end}`);
      list.add(`${start}-${start.slice(0, 2) + end}`);
      list.add(`FY ${start}-${end}`);
      list.add(`FY ${start}-${start.slice(0, 2) + end}`);
    }
    const m2 = s.match(/^(\d{2})[-–\/](\d{2})$/);
    if (m2) {
      list.add(`${m2[1]}-${m2[2]}`);
      list.add(`20${m2[1]}-20${m2[2]}`);
      list.add(`FY 20${m2[1]}-${m2[2]}`);
    }
  }
  if (m !== undefined && y !== undefined) {
    const month = parseInt(m, 10);
    const year = parseInt(y, 10);
    const startYear = (month >= 4 && month <= 12) ? year : year - 1;
    const endYear = startYear + 1;
    const shortFy = `${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`;
    list.add(shortFy);
    list.add(`${startYear}-${endYear}`);
    list.add(`FY ${startYear}-${String(endYear).slice(-2)}`);
  }
  return Array.from(list);
}

// Helper to get vehicles dynamically for a creditor
async function getVehiclesForCreditor(creditorKey) {
  const config = CREDITOR_MAPPINGS[creditorKey];
  if (!config) return [];

  const matchedVehicles = new Set(config.defaultVehicles || []);
  try {
    const db = mongoose.connection.useDb('invoice_system');
    const ownerCol = db.collection('owner details');
    const truckCol = db.collection('Truck Contact Number');
    const cementCol = mongoose.connection.useDb('cement_register').collection('entries');

    const [allOwnerDocs, allTruckDocs, savedBreakdownDocs] = await Promise.all([
      ownerCol.find({}).toArray(),
      truckCol.find({}).toArray(),
      FreightCreditorGstBreakdown.find({ creditorKey }).lean()
    ]);

    const upperTargets = config.sourcePartyOwners.map(o => o.toUpperCase().trim());

    allOwnerDocs.forEach(d => {
      const oName = (d['Owner Name'] || d['Owner Name '] || d.owner_name || '').trim().toUpperCase();
      const v = (d['Truck No'] || d['Truck No '] || d.truck_no || '').trim().toUpperCase().replace(/\s+/g, '');
      if (v && upperTargets.some(target => oName === target || oName.startsWith(target) || target.startsWith(oName))) {
        matchedVehicles.add(v);
      }
    });

    allTruckDocs.forEach(d => {
      const oName = (d['Owner Name'] || d['Owner Name '] || d.owner_name || '').trim().toUpperCase();
      const v = (d['Truck No'] || d['Truck No '] || d.truck_no || '').trim().toUpperCase().replace(/\s+/g, '');
      if (v && upperTargets.some(target => oName === target || oName.startsWith(target) || target.startsWith(oName))) {
        matchedVehicles.add(v);
      }
    });

    // Also check cement_register records where OWNER NAME matches
    const cementDocsForOwner = await cementCol.find({
      'OWNER NAME': { $in: config.sourcePartyOwners.map(n => new RegExp('^' + n + '$', 'i')) }
    }).toArray();
    cementDocsForOwner.forEach(d => {
      const v = (d['VEHICLE NUMBER'] || '').trim().toUpperCase().replace(/\s+/g, '');
      if (v) matchedVehicles.add(v);
    });

    // Also include any vehicle with saved breakdown records
    savedBreakdownDocs.forEach(d => {
      const v = (d.vehicleNo || '').trim().toUpperCase().replace(/\s+/g, '');
      if (v) matchedVehicles.add(v);
    });

  } catch (err) {
    console.warn('[FreightCreditorGst] Error finding vehicles from contacts:', err.message);
  }

  return Array.from(matchedVehicles).filter(Boolean).sort((a, b) => a.localeCompare(b));
}

// Core calculation engine for a specific creditor
async function computeCreditorBreakdown(creditorKey, m, y, rawFy) {
  const mappingConfig = CREDITOR_MAPPINGS[creditorKey] || CREDITOR_MAPPINGS['DIPALI_ASSOCIATES'];
  const vehicles = await getVehiclesForCreditor(creditorKey);
  const fyVariants = getFyVariants(rawFy, m, y);
  const primaryFy = `${String(m >= 4 ? y : y - 1).slice(-2)}-${String(m >= 4 ? y + 1 : y).slice(-2)}`;

  // 1. Fetch live cement_register entries to calculate Basic (Curr M) = Gross Freight (95% Payable)
  const cementCol = mongoose.connection.useDb('cement_register').collection('entries');
  const cementDocs = await cementCol.find({
    'VEHICLE NUMBER': { $in: vehicles }
  }).toArray();

  const filteredEntries = cementDocs.filter(e => {
    const dateVal = e['LOADING DT'] || e['LOADING DATE'];
    const parts = getDateParts(dateVal);
    if (!parts) {
      return (e.month === m || parseInt(e.month, 10) === m) && (e.year === y || parseInt(e.year, 10) === y);
    }
    return parts.year === y && parts.month === m;
  });

  const vehicleGrossFreightMap = {};
  const vehicleEntryCountMap = {};

  vehicles.forEach(v => {
    vehicleGrossFreightMap[v] = 0;
    vehicleEntryCountMap[v] = 0;
  });

  filteredEntries.forEach(row => {
    const v = (row['VEHICLE NUMBER'] || '').trim().toUpperCase().replace(/\s+/g, '');
    if (vehicleGrossFreightMap[v] === undefined) return;

    const amt = parseFloat(row['BILLING @ 95% (PARTY PAYABLE)']) ||
                parseFloat(row['BILLING ER 95%']) ||
                parseFloat(row['BILLING ER VAR']) ||
                parseFloat(row['AMOUNT']) || 0;

    vehicleGrossFreightMap[v] += amt;
    vehicleEntryCountMap[v] += 1;
  });

  // 2. Fetch saved manual Incentive (M-2) and Incentive (M-1) records from MongoDB
  const savedRecords = await FreightCreditorGstBreakdown.find({
    creditorKey,
    fy: { $in: fyVariants },
    month: m
  }).lean();

  const savedMap = {};
  savedRecords.forEach(rec => {
    const v = (rec.vehicleNo || '').trim().toUpperCase().replace(/\s+/g, '');
    savedMap[v] = rec;
  });

  // 3. Build response rows for each vehicle
  const rows = vehicles.map(veh => {
    const saved = savedMap[veh] || {};
    const hasEntries = (vehicleEntryCountMap[veh] || 0) > 0;
    const basicCurrM = hasEntries ? Math.round(vehicleGrossFreightMap[veh] * 100) / 100 : null;

    const incentiveM2 = (saved.incentiveM2 !== undefined && saved.incentiveM2 !== null) ? Number(saved.incentiveM2) : null;
    const incentiveM1 = (saved.incentiveM1 !== undefined && saved.incentiveM1 !== null) ? Number(saved.incentiveM1) : null;

    let taxableValue = null;
    let cgst = null;
    let sgst = null;
    let total = null;

    if (incentiveM2 !== null || incentiveM1 !== null || basicCurrM !== null) {
      taxableValue = Math.round(((incentiveM2 || 0) + (incentiveM1 || 0) + (basicCurrM || 0)) * 100) / 100;
      cgst = Math.round((taxableValue * 0.09) * 100) / 100;
      sgst = Math.round((taxableValue * 0.09) * 100) / 100;
      // Authoritative GST FCM Amount: TOTAL AMOUNT = TOTAL TAXABLE VALUE + CGST 9% + SGST 9%
      total = Math.round((taxableValue + cgst + sgst) * 100) / 100;
    }

    return {
      creditorKey,
      creditorTitle: mappingConfig.creditorTitle,
      ownerName: mappingConfig.sourcePartyOwners[0],
      sourcePartyOwners: mappingConfig.sourcePartyOwners,
      vehicleNo: veh,
      fy: primaryFy,
      month: m,
      year: y,
      incentiveM2,
      incentiveM1,
      basicCurrM,
      taxableValue,
      cgst,
      sgst,
      total,
      hasCementEntries: hasEntries,
      updatedAt: saved.updatedAt || null
    };
  });

  // Compute totals across all rows
  let totalIncentiveM2 = 0;
  let hasM2 = false;
  let totalIncentiveM1 = 0;
  let hasM1 = false;
  let totalBasicCurrM = 0;
  let hasBasic = false;
  let totalTaxableValue = 0;
  let hasTaxableValue = false;
  let totalCgst = 0;
  let hasCgst = false;
  let totalSgst = 0;
  let hasSgst = false;
  let grandTotal = 0;
  let hasGrandTotal = false;

  rows.forEach(r => {
    if (r.incentiveM2 !== null) {
      totalIncentiveM2 += r.incentiveM2;
      hasM2 = true;
    }
    if (r.incentiveM1 !== null) {
      totalIncentiveM1 += r.incentiveM1;
      hasM1 = true;
    }
    if (r.basicCurrM !== null) {
      totalBasicCurrM += r.basicCurrM;
      hasBasic = true;
    }
    if (r.taxableValue !== null) {
      totalTaxableValue += r.taxableValue;
      hasTaxableValue = true;
    }
    if (r.cgst !== null) {
      totalCgst += r.cgst;
      hasCgst = true;
    }
    if (r.sgst !== null) {
      totalSgst += r.sgst;
      hasSgst = true;
    }
    if (r.total !== null) {
      grandTotal += r.total;
      hasGrandTotal = true;
    }
  });

  return {
    creditorKey,
    creditorTitle: mappingConfig.creditorTitle,
    sourcePartyOwner: mappingConfig.sourcePartyOwners[0],
    sourcePartyOwners: mappingConfig.sourcePartyOwners,
    fy: primaryFy,
    month: m,
    year: y,
    rows,
    totals: {
      incentiveM2: hasM2 ? Math.round(totalIncentiveM2 * 100) / 100 : null,
      incentiveM1: hasM1 ? Math.round(totalIncentiveM1 * 100) / 100 : null,
      basicCurrM: hasBasic ? Math.round(totalBasicCurrM * 100) / 100 : null,
      taxableValue: hasTaxableValue ? Math.round(totalTaxableValue * 100) / 100 : null,
      cgst: hasCgst ? Math.round(totalCgst * 100) / 100 : null,
      sgst: hasSgst ? Math.round(totalSgst * 100) / 100 : null,
      grandTotal: hasGrandTotal ? Math.round(grandTotal * 100) / 100 : null
    }
  };
}

// ── GET /freight-creditor-gst/data ──────────────────────────────────────────
// Returns live database-driven Working Breakdown & Incentive Reference for one creditor
router.get('/data', async (req, res) => {
  try {
    const { creditorKey: rawCreditorKey, month: rawMonth, year: rawYear, fy: rawFy } = req.query;

    const creditorKey = normalizeCreditorKey(rawCreditorKey);
    const m = parseInt(rawMonth, 10) || (new Date().getMonth() + 1);
    const y = parseInt(rawYear, 10) || new Date().getFullYear();

    const data = await computeCreditorBreakdown(creditorKey, m, y, rawFy);
    res.json({ success: true, ...data });

  } catch (err) {
    console.error('[FreightCreditorGst] /data error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /freight-creditor-gst/all-totals ────────────────────────────────────
// Authoritative endpoint returning vehicle-wise Freight Creditor GST TOTALS across ALL 3 Creditors
router.get('/all-totals', async (req, res) => {
  try {
    const { month: rawMonth, year: rawYear, fy: rawFy } = req.query;
    const m = parseInt(rawMonth, 10) || (new Date().getMonth() + 1);
    const y = parseInt(rawYear, 10) || new Date().getFullYear();

    const creditorKeys = ['DIPALI_ASSOCIATES', 'GKR_ENTERPRISE', 'SUBHENDU_SEKHAR_GHOSWAMI'];
    const results = await Promise.all(
      creditorKeys.map(key => computeCreditorBreakdown(key, m, y, rawFy))
    );

    const vehicleTotals = {};
    const creditorsMap = {};

    results.forEach(resItem => {
      creditorsMap[resItem.creditorKey] = {
        creditorKey: resItem.creditorKey,
        creditorTitle: resItem.creditorTitle,
        sourcePartyOwners: resItem.sourcePartyOwners,
        totals: resItem.totals,
        rows: resItem.rows
      };

      resItem.rows.forEach(r => {
        const vKey = String(r.vehicleNo || '').trim().toUpperCase().replace(/\s+/g, '');
        if (vKey) {
          vehicleTotals[vKey] = {
            vehicleNo: r.vehicleNo,
            creditorKey: r.creditorKey,
            creditorTitle: r.creditorTitle,
            mappedPartyOwner: r.ownerName,
            sourcePartyOwners: r.sourcePartyOwners,
            total: r.total,
            basicCurrM: r.basicCurrM,
            incentiveM2: r.incentiveM2,
            incentiveM1: r.incentiveM1,
            month: m,
            year: y,
            fy: r.fy
          };
        }
      });
    });

    res.json({
      success: true,
      month: m,
      year: y,
      fy: results[0]?.fy || rawFy,
      creditors: creditorsMap,
      vehicleTotals
    });

  } catch (err) {
    console.error('[FreightCreditorGst] /all-totals error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /freight-creditor-gst/save ─────────────────────────────────────────
// Bulk upserts manual Incentive (M-2) and Incentive (M-1) entries into MongoDB
// and automatically broadcasts live sync events to Party Payment Details
router.post('/save', async (req, res) => {
  try {
    const { creditorKey: rawCreditorKey, fy, month, year, rows } = req.body;

    if (!rawCreditorKey || !fy || !month || !Array.isArray(rows)) {
      return res.status(400).json({ success: false, error: 'Missing required parameters (creditorKey, fy, month, rows)' });
    }

    const creditorKey = normalizeCreditorKey(rawCreditorKey);
    const m = parseInt(month, 10);
    const y = parseInt(year, 10) || new Date().getFullYear();
    const fyStr = String(fy).trim();

    const operations = rows.map(r => {
      const veh = String(r.vehicleNo || '').trim().toUpperCase().replace(/\s+/g, '');
      const m2Val = (r.incentiveM2 !== undefined && r.incentiveM2 !== null && r.incentiveM2 !== '') ? Number(r.incentiveM2) : null;
      const m1Val = (r.incentiveM1 !== undefined && r.incentiveM1 !== null && r.incentiveM1 !== '') ? Number(r.incentiveM1) : null;

      return {
        updateOne: {
          filter: {
            creditorKey,
            vehicleNo: veh,
            fy: fyStr,
            month: m
          },
          update: {
            $set: {
              creditorKey,
              ownerName: r.ownerName || '',
              vehicleNo: veh,
              fy: fyStr,
              month: m,
              year: y,
              incentiveM2: m2Val,
              incentiveM1: m1Val
            }
          },
          upsert: true
        }
      };
    }).filter(op => op.updateOne.filter.vehicleNo);

    if (operations.length > 0) {
      await FreightCreditorGstBreakdown.bulkWrite(operations);
    }

    // Auto-sync PartyPayment documents in database if desired
    try {
      const PartyPayment = require('../models/PartyPayment');
      const updatedCreditor = await computeCreditorBreakdown(creditorKey, m, y, fyStr);
      const partyUpdates = updatedCreditor.rows
        .filter(r => r.total !== null && r.total !== undefined)
        .map(r => ({
          updateOne: {
            filter: { vehicleNo: r.vehicleNo, month: m, year: y },
            update: { $set: { gstFcm: r.total } },
            upsert: false
          }
        }));
      if (partyUpdates.length > 0) {
        await PartyPayment.bulkWrite(partyUpdates);
      }
    } catch (dbSyncErr) {
      console.warn('[FreightCreditorGst] Auto-sync to PartyPayment collection warning:', dbSyncErr.message);
    }

    // Broadcast live Socket.io updates to keep Party Payment Details continuously synced in real-time
    try {
      const { getIO } = require('../socket');
      const io = getIO();
      if (io) {
        io.emit('freightCreditorGstUpdate', { creditorKey, fy: fyStr, month: m, year: y });
        io.emit('partyPaymentUpdate', { action: 'freightCreditorGstSync', creditorKey, fy: fyStr, month: m, year: y });
      }
    } catch (socketErr) {
      console.warn('[FreightCreditorGst] Socket emit warning:', socketErr.message);
    }

    return res.json({
      success: true,
      message: `Successfully saved ${operations.length} breakdown records for ${creditorKey}`,
      savedCount: operations.length
    });

  } catch (err) {
    console.error('[FreightCreditorGst] /save error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Authoritative helper to determine if a vehicle or owner belongs to a Freight Creditor
async function getCreditorKeyForVehicleOrParty(vehicleNo, partyOwnerName) {
  const normVeh = String(vehicleNo || '').trim().toUpperCase().replace(/\s+/g, '');
  const normParty = String(partyOwnerName || '').trim().toUpperCase();

  const creditorKeys = Object.keys(CREDITOR_MAPPINGS);
  for (const cKey of creditorKeys) {
    const config = CREDITOR_MAPPINGS[cKey];
    if (normParty) {
      if (config.sourcePartyOwners.some(target => {
        const t = target.toUpperCase();
        return t === normParty || normParty.startsWith(t) || t.startsWith(normParty) || normParty.includes(t) || t.includes(normParty);
      })) {
        return cKey;
      }
    }
    const vehicles = await getVehiclesForCreditor(cKey);
    if (vehicles.map(v => String(v).trim().toUpperCase().replace(/\s+/g, '')).includes(normVeh)) {
      return cKey;
    }
  }
  return null;
}

module.exports = router;
module.exports.CREDITOR_MAPPINGS = CREDITOR_MAPPINGS;
module.exports.normalizeCreditorKey = normalizeCreditorKey;
module.exports.getVehiclesForCreditor = getVehiclesForCreditor;
module.exports.computeCreditorBreakdown = computeCreditorBreakdown;
module.exports.getCreditorKeyForVehicleOrParty = getCreditorKeyForVehicleOrParty;

