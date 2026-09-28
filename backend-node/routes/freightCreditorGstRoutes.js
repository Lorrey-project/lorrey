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
    creditorTitle: 'DIPALI ASSOCIATES',
    sourcePartyOwners: ['DIPALI ASSOCIATES', 'DIPALI ASSOCIATE', 'DIPALI ASSOCIAT', 'DIPALI NAYEK'],
    defaultVehicles: ['WB39B8916']
  },
  'GKR_ENTERPRISE': {
    creditorTitle: 'G.K.R. ENTERPRISE',
    sourcePartyOwners: ['GOUTAM ROY'],
    defaultVehicles: ['WB41H0177', 'WB41K2967', 'WB39G8384']
  },
  'SUBHENDU_SEKHAR_GHOSWAMI': {
    creditorTitle: 'SUBHENDU SEKHAR GHOSWAMI',
    sourcePartyOwners: ['SUBENDU SEKHAR GOSWAMI', 'SUBHENDU SEKHAR GHOSWAMI', 'SUBENDU GOSWAMI'],
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

    const [allOwnerDocs, allTruckDocs] = await Promise.all([
      ownerCol.find({}).toArray(),
      truckCol.find({}).toArray()
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

  } catch (err) {
    console.warn('[FreightCreditorGst] Error finding vehicles from contacts:', err.message);
  }

  return Array.from(matchedVehicles).filter(Boolean).sort((a, b) => a.localeCompare(b));
}

// ── GET /freight-creditor-gst/data ──────────────────────────────────────────
// Returns live database-driven Working Breakdown & Incentive Reference
router.get('/data', async (req, res) => {
  try {
    const { creditorKey: rawCreditorKey, month: rawMonth, year: rawYear, fy: rawFy } = req.query;

    const creditorKey = normalizeCreditorKey(rawCreditorKey);
    const m = parseInt(rawMonth, 10) || (new Date().getMonth() + 1);
    const y = parseInt(rawYear, 10) || new Date().getFullYear();
    const fy = rawFy ? String(rawFy).trim() : `${String(m >= 4 ? y : y - 1).slice(-2)}-${String(m >= 4 ? y + 1 : y).slice(-2)}`;

    const mappingConfig = CREDITOR_MAPPINGS[creditorKey] || CREDITOR_MAPPINGS['DIPALI_ASSOCIATES'];
    const vehicles = await getVehiclesForCreditor(creditorKey);

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
      const v = (row['VEHICLE NUMBER'] || '').trim().toUpperCase();
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
      fy,
      month: m
    }).lean();

    const savedMap = {};
    savedRecords.forEach(rec => {
      savedMap[rec.vehicleNo.toUpperCase()] = rec;
    });

    // 3. Build response rows for each vehicle
    const rows = vehicles.map(veh => {
      const saved = savedMap[veh] || {};
      const hasEntries = (vehicleEntryCountMap[veh] || 0) > 0;
      const basicCurrM = hasEntries ? Math.round(vehicleGrossFreightMap[veh] * 100) / 100 : null;

      const incentiveM2 = (saved.incentiveM2 !== undefined && saved.incentiveM2 !== null) ? Number(saved.incentiveM2) : null;
      const incentiveM1 = (saved.incentiveM1 !== undefined && saved.incentiveM1 !== null) ? Number(saved.incentiveM1) : null;

      let total = null;
      if (incentiveM2 !== null || incentiveM1 !== null || basicCurrM !== null) {
        total = (incentiveM2 || 0) + (incentiveM1 || 0) + (basicCurrM || 0);
        total = Math.round(total * 100) / 100;
      }

      return {
        creditorKey,
        ownerName: mappingConfig.sourcePartyOwners[0],
        vehicleNo: veh,
        fy,
        month: m,
        year: y,
        incentiveM2,
        incentiveM1,
        basicCurrM,
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
      if (r.total !== null) {
        grandTotal += r.total;
        hasGrandTotal = true;
      }
    });

    res.json({
      success: true,
      creditorKey,
      creditorTitle: mappingConfig.creditorTitle,
      sourcePartyOwner: mappingConfig.sourcePartyOwners[0],
      fy,
      month: m,
      year: y,
      rows,
      totals: {
        incentiveM2: hasM2 ? Math.round(totalIncentiveM2 * 100) / 100 : null,
        incentiveM1: hasM1 ? Math.round(totalIncentiveM1 * 100) / 100 : null,
        basicCurrM: hasBasic ? Math.round(totalBasicCurrM * 100) / 100 : null,
        grandTotal: hasGrandTotal ? Math.round(grandTotal * 100) / 100 : null
      }
    });

  } catch (err) {
    console.error('[FreightCreditorGst] /data error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /freight-creditor-gst/save ─────────────────────────────────────────
// Bulk upserts manual Incentive (M-2) and Incentive (M-1) entries into MongoDB
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
      const veh = String(r.vehicleNo || '').trim().toUpperCase();
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

module.exports = router;
