const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

function num(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

function normVeh(v) {
  if (!v) return '';
  return String(v).replace(/\s+/g, '').toUpperCase();
}

function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val) ? null : val;
  const str = String(val).trim();

  // Indian DD-MM-YYYY or DD/MM/YYYY
  const ddmmyyyy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (ddmmyyyy) {
    const d = parseInt(ddmmyyyy[1], 10), m = parseInt(ddmmyyyy[2], 10), y = parseInt(ddmmyyyy[3], 10);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) return new Date(y, m - 1, d);
  }

  // ISO YYYY-MM-DD
  const yyyymmdd = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (yyyymmdd) {
    const y = parseInt(yyyymmdd[1], 10), m = parseInt(yyyymmdd[2], 10), d = parseInt(yyyymmdd[3], 10);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) return new Date(y, m - 1, d);
  }

  const iso = new Date(str);
  if (!isNaN(iso.getTime())) return iso;
  return null;
}

// Helper to classify cement-register row as NVL or NVCL
function classifyCementRow(row) {
  const site = (row['SITE'] || '').toUpperCase().trim();
  if (site === 'NVL') return 'NVL';
  if (site === 'NVCL') return 'NVCL';
  if (row._is_ato === true || row._is_ato === 'true') return 'NVL';
  if (row._is_ato === false || row._is_ato === 'false') return 'NVCL';
  const billType = (row['Bill Type'] || '').toUpperCase();
  if (billType === 'NT') return 'NVL';
  if (billType === 'STO' || billType === 'SO') return 'NVCL';
  const type = (row['TYPE'] || '').toUpperCase();
  if (type === 'ATOA' || type === 'ATO') return 'NVL';
  if (type === 'MKT') return 'NVCL';
  return 'NVL';
}

const MONTH_NAMES_LIST = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// ── GET /api/tds-reports/party-tds ──────────────────────────────────────────
router.get('/party-tds', async (req, res) => {
  try {
    const { month, year, fy, search } = req.query;
    const now = new Date();

    let targetMonth = month ? parseInt(month, 10) : (now.getMonth() + 1);
    if (isNaN(targetMonth) || targetMonth < 1 || targetMonth > 12) {
      targetMonth = now.getMonth() + 1;
    }

    let targetYear = year ? parseInt(year, 10) : null;
    if (!targetYear || isNaN(targetYear)) {
      if (fy) {
        const fyStart = parseInt(String(fy).split('-')[0], 10);
        if (!isNaN(fyStart)) {
          targetYear = targetMonth >= 4 ? fyStart : fyStart + 1;
        }
      }
      if (!targetYear || isNaN(targetYear)) {
        targetYear = now.getFullYear();
      }
    }

    const monthTitle = MONTH_NAMES_LIST[targetMonth - 1] || 'September';

    const db = mongoose.connection.useDb('invoice_system');
    const ownerCol = db.collection('owner details');
    const truckCol = db.collection('Truck Contact Number');
    const cementCol = mongoose.connection.useDb('cement_register').collection('entries');

    const [ownerDocs, truckDocs] = await Promise.all([
      ownerCol.find({}).toArray(),
      truckCol.find({}).toArray()
    ]);

    // 1. Truck Contacts mapping (vehicleNo -> owner, wheel, contact)
    const vehToOwner = {};
    const vehContactMap = {};
    truckDocs.forEach(c => {
      const v = normVeh(c.truck_no || c['Truck No '] || c['Truck No'] || c.vehicleNo);
      const o = (c.owner_name || c['Owner Name '] || c['Owner Name'] || c.ownerName || '').trim();
      if (v) {
        vehToOwner[v] = o;
        vehContactMap[v] = c;
      }
    });

    // 2. Unique owners map from owner details collection
    const uniqueOwnersMap = new Map();
    ownerDocs.forEach(d => {
      const rawName = (d['Owner Name'] || d['Owner Name '] || d.owner_name || '').trim();
      if (!rawName) return;
      const key = rawName.toUpperCase();
      if (!uniqueOwnersMap.has(key)) {
        let rawTds = d['TDS Applicability'] !== undefined && d['TDS Applicability'] !== null && d['TDS Applicability'] !== ''
          ? num(d['TDS Applicability'])
          : null;
        if (rawTds !== null && rawTds > 0 && rawTds < 1) {
          rawTds = rawTds * 100;
        }

        uniqueOwnersMap.set(key, {
          name: rawName,
          pan: (d['PAN No.'] || d['PAN No. '] || d.pan_no || '-').trim(),
          aadhar: (d['Aadhar No.'] || d['Aadhar No. '] || d.aadhar_no || '-').trim(),
          panAadharLink: (d['PAN Addahar Link'] || d['PAN Addahar Link '] || d.pan_aadhar_link || '-').trim(),
          tdsApplicability: rawTds
        });
      }
    });

    // 3. Fetch cement register entries belonging ONLY to the selected month & year
    const monthDocs = [];
    const cementCursor = cementCol.find({});
    while (await cementCursor.hasNext()) {
      const doc = await cementCursor.next();
      const dateVal = doc['LOADING DT'] || doc['LOADING DATE'];
      const p = parseDate(dateVal);
      if (p) {
        const m = p.getMonth() + 1;
        const y = p.getFullYear();
        if (m === targetMonth && y === targetYear) {
          monthDocs.push(doc);
        }
      }
    }

    // 4. Calculate ROW 1: TOTAL FREIGHT AMOUNT (Party Payment Details "Gross Freight (95% Payable)")
    const ownerFreight = {};
    const ownerTdsDeducted = {};

    monthDocs.forEach(row => {
      const v = normVeh(row['VEHICLE NUMBER'] || row['VEHICLE NO']);
      const o = vehToOwner[v] || (row['OWNER NAME'] || '').trim() || 'Unknown';
      const oKey = o.toUpperCase();

      let gf = 0;
      for (const k of ['BILLING ER 95%', 'BILLING ER VAR', 'BILLING @ 95% (PARTY PAYABLE)', 'BILLING@95%', 'AMOUNT']) {
        if (row[k] !== undefined && row[k] !== null && row[k] !== '') {
          if (typeof row[k] === 'object' && !Array.isArray(row[k])) {
            gf = Object.values(row[k]).reduce((s, x) => s + num(x), 0);
          } else {
            gf = num(row[k]);
          }
          break;
        }
      }
      ownerFreight[oKey] = (ownerFreight[oKey] || 0) + gf;

      // Track actual TDS recorded in cement register if available
      const tdsVal = num(row['TDS@1%']) || num(row['TDS']);
      ownerTdsDeducted[oKey] = (ownerTdsDeducted[oKey] || 0) + tdsVal;
    });

    // 5. Calculate ROW 2: TOTAL INCENTIVE AMOUNT (Incentive Entry "Total (Projected)")
    const byTruck = {};
    for (const row of monthDocs) {
      const truck = normVeh(row['VEHICLE NUMBER'] || row['VEHICLE NO']);
      if (!truck) continue;

      if (!byTruck[truck]) {
        const contact = vehContactMap[truck];
        const dbWheel = contact ? (contact['Type of vehicle '] || contact['Type of vehicle'] || contact.type_of_vehicle || '') : '';
        const owner = contact ? (contact['Owner Name '] || contact['Owner Name'] || contact.owner_name || '') : '';
        byTruck[truck] = {
          ownerName: (row['OWNER NAME'] || owner || vehToOwner[truck] || '').trim(),
          truckNo: truck,
          wheel: row['WHEEL'] || dbWheel || '',
          tripsCount: 0,
          nvl: { amt: 0 },
          nvcl: { amt: 0 },
          extra10W: 0,
          extra6W: 0
        };
      }

      const entry = byTruck[truck];
      const cat = classifyCementRow(row);
      const mt = num(row['MT']);
      const billing = num(row['BILLING']);
      const orgFreight = billing * mt;
      entry.tripsCount += 1;
      const baseIncentive = orgFreight * 0.095;

      if (cat === 'NVL') {
        entry.nvl.amt += baseIncentive;
      } else {
        entry.nvcl.amt += baseIncentive;
      }

      const bType = (row['Bill Type'] || '').toUpperCase();
      const isSoOrNt = bType === 'SO' || bType === 'NT';
      const manualW10 = num(row['10W EXTRA 8.5%']);
      if (manualW10 > 0) {
        entry.extra10W += manualW10;
      } else if (isSoOrNt) {
        const wheelStr = String(entry.wheel).toLowerCase();
        if (wheelStr.includes('10')) {
          entry.extra10W += orgFreight * 0.085;
        }
      }
      if (isSoOrNt) {
        const wheelStr = String(entry.wheel).toLowerCase();
        if (wheelStr.includes('6')) {
          entry.extra6W += orgFreight * 0.15;
        }
      }
    }

    // Aggregate Total (Projected) by Owner
    const ownerIncentives = {};
    Object.values(byTruck).forEach(t => {
      const metCriteria = t.tripsCount > 6;
      if (!metCriteria) {
        t.extra10W = 0;
        t.extra6W = 0;
      }
      const nvlNvclTotal = Math.round(t.nvl.amt) + Math.round(t.nvcl.amt);
      const totalFinal = nvlNvclTotal + Math.round(t.extra10W) + Math.round(t.extra6W);
      const oKey = (t.ownerName || 'Unknown').toUpperCase();
      ownerIncentives[oKey] = (ownerIncentives[oKey] || 0) + totalFinal;
    });

    let uniqueOwners = Array.from(uniqueOwnersMap.values());

    // Optional Search Filter by Owner Name, PAN, or Aadhaar
    if (search && search.trim()) {
      const term = search.toLowerCase().trim();
      uniqueOwners = uniqueOwners.filter(o =>
        o.name.toLowerCase().includes(term) ||
        o.pan.toLowerCase().includes(term) ||
        o.aadhar.toLowerCase().includes(term)
      );
    }

    // 6. Generate EXACTLY 4 rows per unique owner for the selected month
    // ROW 1 → TOTAL FREIGHT AMOUNT (Party Payment Details: Gross Freight (95% Payable))
    // ROW 2 → TOTAL INCENTIVE AMOUNT (Incentive Entry: Total (Projected))
    // ROW 3 → DIFFERENTIAL (TOTAL FREIGHT AMOUNT - TOTAL INCENTIVE AMOUNT)
    // ROW 4 → Existing TDS/SUMMARY logic
    const entries = [];
    let slNo = 1;

    uniqueOwners.forEach(ownerObj => {
      const oKey = ownerObj.name.toUpperCase();
      const totalFreight = Math.round((ownerFreight[oKey] || 0) * 100) / 100;
      const totalIncentive = Math.round((ownerIncentives[oKey] || 0) * 100) / 100;
      const differential = Math.round((totalFreight - totalIncentive) * 100) / 100;

      // TDS % calculation (1% default or owner-specific)
      let tdsRate = 1;
      if (ownerObj.tdsApplicability !== null && !isNaN(ownerObj.tdsApplicability)) {
        tdsRate = ownerObj.tdsApplicability;
      }

      const isLinked = (ownerObj.panAadharLink.toUpperCase() === 'YES' || (ownerObj.pan !== '-' && ownerObj.aadhar !== '-')) ? 'YES' : 'NO';
      const tdsAmount = Math.round((Math.max(0, differential) * (tdsRate / 100)) * 100) / 100;
      const actualDeducted = ownerTdsDeducted[oKey] !== undefined && ownerTdsDeducted[oKey] > 0
        ? Math.round(ownerTdsDeducted[oKey] * 100) / 100
        : tdsAmount;

      // ROW 1 → TOTAL FREIGHT AMOUNT
      entries.push({
        slNo: slNo++,
        ownerIndexRow: 1,
        name: ownerObj.name,
        billNo: '-',
        billDate: '-',
        billType: `Total Freight — ${monthTitle} ${targetYear}`,
        basicAmount: totalFreight,
        note: '-',
        tdsPercent: 0,
        tdsAmount: 0,
        tdsDeducted: 0,
        panCardNumber: ownerObj.pan,
        aadharNo: ownerObj.aadhar,
        aadhaarPanLinked: isLinked
      });

      // ROW 2 → TOTAL INCENTIVE AMOUNT
      entries.push({
        slNo: slNo++,
        ownerIndexRow: 2,
        name: ownerObj.name,
        billNo: '-',
        billDate: '-',
        billType: `Total Incentive — ${monthTitle} ${targetYear}`,
        basicAmount: totalIncentive,
        note: '-',
        tdsPercent: 0,
        tdsAmount: 0,
        tdsDeducted: 0,
        panCardNumber: ownerObj.pan,
        aadharNo: ownerObj.aadhar,
        aadhaarPanLinked: isLinked
      });

      // ROW 3 → DIFFERENTIAL
      entries.push({
        slNo: slNo++,
        ownerIndexRow: 3,
        name: ownerObj.name,
        billNo: '-',
        billDate: '-',
        billType: `Differential — ${monthTitle} ${targetYear}`,
        basicAmount: differential,
        note: '-',
        tdsPercent: 0,
        tdsAmount: 0,
        tdsDeducted: 0,
        panCardNumber: ownerObj.pan,
        aadharNo: ownerObj.aadhar,
        aadhaarPanLinked: isLinked
      });

      // ROW 4 → Existing TDS/SUMMARY logic
      entries.push({
        slNo: slNo++,
        ownerIndexRow: 4,
        name: ownerObj.name,
        billNo: '-',
        billDate: '-',
        billType: `TDS / Summary — ${monthTitle} ${targetYear}`,
        basicAmount: differential,
        note: '-',
        tdsPercent: tdsRate,
        tdsAmount: tdsAmount,
        tdsDeducted: actualDeducted,
        panCardNumber: ownerObj.pan,
        aadharNo: ownerObj.aadhar,
        aadhaarPanLinked: isLinked
      });
    });

    res.json({
      success: true,
      month: targetMonth,
      year: targetYear,
      monthTitle,
      uniqueOwnerCount: uniqueOwners.length,
      count: entries.length,
      entries
    });
  } catch (err) {
    console.error('[TdsReports] Party TDS fetch error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/tds-reports ────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { month, year, search } = req.query;

    const targetMonth = (month && month !== 'ALL') ? parseInt(month, 10) : null;
    let targetFyStartYear = null;

    if (year && year !== 'ALL') {
      const parts = String(year).split('-');
      targetFyStartYear = parseInt(parts[0], 10);
      if (isNaN(targetFyStartYear)) {
        targetFyStartYear = parseInt(year, 10);
      }
    }

    // 1. Truck Contacts Map (vehicleNo & owner -> { pan_no, aadhar_no, owner_name, tdsRate })
    const truckCol = mongoose.connection.useDb('invoice_system').collection('Truck Contact Number');
    const contacts = await truckCol.find({}).toArray();
    const vehMap = {};
    const ownerMap = {};

    contacts.forEach(c => {
      const veh = normVeh(c.truck_no || c['Truck No '] || c['Truck No'] || c.vehicleNo);
      const owner = (c.owner_name || c['Owner Name '] || c['Owner Name'] || c.ownerName || '').trim();
      const pan = (c.pan_no || c['PAN No '] || c['PAN No'] || c['PAN NO'] || '').trim();
      const aadhar = (c.aadhar_no || c['Aadhar No '] || c['Aadhar No'] || c['AADHAR NO'] || '').trim();
      const panAadharLink = (c.pan_aadhar_link || c['PAN AADHAR LINK'] || c['Pan Aadhar Link'] || '').trim();
      const tdsRate = c.tds_applicability !== undefined && c.tds_applicability !== null ? parseFloat(c.tds_applicability) : null;

      const info = { owner, pan, aadhar, panAadharLink, tdsRate };
      if (veh) vehMap[veh] = info;
      if (owner) ownerMap[owner.toUpperCase()] = info;
    });

    // 2. Fetch Cement Register Entries
    const cementCol = mongoose.connection.useDb('cement_register').collection('entries');
    const allCement = await cementCol.find({}).toArray();

    const filteredEntries = allCement.filter(e => {
      const dateVal = e["BILL DATE"] || e["LOADING DT"] || e["LOADING DATE"];
      const d = parseDate(dateVal);
      if (!d) return false;

      const m = d.getMonth() + 1; // 1 - 12
      const calYear = d.getFullYear();

      // Month filter
      if (targetMonth && m !== targetMonth) return false;

      // Financial Year filter (FY starts Apr 1)
      if (targetFyStartYear) {
        const entryFyStart = m >= 4 ? calYear : calYear - 1;
        if (entryFyStart !== targetFyStartYear) return false;
      }

      return true;
    });

    // Map into required format
    let rawRecords = filteredEntries.map(e => {
      const veh = normVeh(e["VEHICLE NUMBER"] || e["VEHICLE NO"]);
      const contactInfo = vehMap[veh] || ownerMap[(e["PARTY NAME"] || e["OWNER NAME"] || "").toUpperCase()] || {};

      const name = (e["PARTY NAME"] || e["OWNER NAME"] || contactInfo.owner || "N/A").trim();
      const billNo = (e["BILL NO"] || e["INVOICE NO"] || e["SHIPMENT NO"] || "-").trim();
      const billDate = (e["BILL DATE"] || e["LOADING DT"] || e["LOADING DATE"] || "-").trim();
      const billType = (e["Bill Type"] || e["SITE"] || "Freight").trim();

      const basicAmount = num(e["Billing Amount"]) || num(e["BILLING ER 95%"]) || num(e["AMOUNT"]);

      // TDS % calculation
      let tdsPercent = 1;
      if (contactInfo.tdsRate !== null && !isNaN(contactInfo.tdsRate) && contactInfo.tdsRate > 0) {
        tdsPercent = contactInfo.tdsRate;
      } else if (num(e["TDS@1%"]) > 0 || num(e["TDS"]) > 0) {
        tdsPercent = 1;
      }

      const tdsAmount = Math.round((basicAmount * (tdsPercent / 100)) * 100) / 100;
      const tdsDeducted = num(e["TDS@1%"]) || num(e["TDS"]) || tdsAmount;

      const panCardNumber = contactInfo.pan || e["PAN NO"] || "-";
      const aadharNo = contactInfo.aadhar || e["AADHAR NO"] || "-";
      const aadhaarPanLinked = (contactInfo.panAadharLink || (panCardNumber !== '-' && aadharNo !== '-' ? 'YES' : 'NO')).toUpperCase();

      return {
        name,
        billNo,
        billDate,
        billType,
        basicAmount,
        tdsPercent,
        tdsAmount,
        tdsDeducted,
        panCardNumber,
        aadharNo,
        aadhaarPanLinked
      };
    });

    // Search Filter
    if (search && search.trim()) {
      const term = search.toLowerCase().trim();
      rawRecords = rawRecords.filter(r =>
        r.name.toLowerCase().includes(term) ||
        r.billNo.toLowerCase().includes(term) ||
        r.billType.toLowerCase().includes(term) ||
        r.panCardNumber.toLowerCase().includes(term)
      );
    }

    // Attach sequential SL NO (1..N)
    const entries = rawRecords.map((r, idx) => ({
      slNo: idx + 1,
      ...r
    }));

    // Calculate Summary Totals
    let totalBasicAmount = 0;
    let totalTdsAmount = 0;
    let totalTdsDeducted = 0;

    entries.forEach(r => {
      totalBasicAmount += r.basicAmount;
      totalTdsAmount += r.tdsAmount;
      totalTdsDeducted += r.tdsDeducted;
    });

    res.json({
      success: true,
      count: entries.length,
      entries,
      summary: {
        totalBasicAmount: Math.round(totalBasicAmount * 100) / 100,
        totalTdsAmount: Math.round(totalTdsAmount * 100) / 100,
        totalTdsDeducted: Math.round(totalTdsDeducted * 100) / 100
      }
    });
  } catch (err) {
    console.error('[TdsReports] Fetch error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/tds-reports/billing-tds ─────────────────────────────────────────
const { getBillRegisterData, MONTH_NAMES } = require('../utils/billRegisterHelper');

router.get('/billing-tds', async (req, res) => {
  try {
    const { site = 'NVL', month, year, search } = req.query;
    const targetSite = site.trim().toUpperCase();

    // 1. Fetch live Bill Register rows from the single source of truth
    const { rows } = await getBillRegisterData({ fy: year });

    // 2. Strict Site Separation (NVL bills only in NVL, NVCL bills only in NVCL)
    let filtered = rows.filter(r => {
      const entrySite = (r.site || '').trim().toUpperCase();
      if (entrySite !== targetSite) return false;

      // Month filtering (1 - 12 or 'ALL')
      if (month && month !== 'ALL') {
        const targetMonth = parseInt(month, 10);
        let m = null;
        const d = parseDate(r.invoiceDate);
        if (d) {
          m = d.getMonth() + 1;
        } else if (r.month) {
          const mIdx = MONTH_NAMES.findIndex(name => String(r.month).toUpperCase().startsWith(name));
          if (mIdx !== -1) {
            m = mIdx + 1;
          } else {
            const rawM = parseInt(r.month, 10);
            if (rawM >= 1 && rawM <= 12) m = rawM;
          }
        }
        if (m !== targetMonth) return false;
      }

      return true;
    });

    // 3. Map fields and calculate TDS according to exact rules
    let rawRecords = filtered.map(r => {
      const billNo = (r.displayInvoiceNumber || r.invoiceNumber || r.billNo || '-').trim();
      const billDate = (r.invoiceDate || '-').trim();
      const billType = (r.billType || 'FREIGHT').trim();
      const partyName = (
        r.partyName ||
        (Array.isArray(r.partyNames) && r.partyNames.length > 0 ? r.partyNames.join(', ') : '') ||
        (targetSite === 'NVL' ? 'NUVOCO VISTAS LIMITED' : (targetSite === 'NVCL' ? 'NUVOCO VISTAS CORPORATION LIMITED' : '-'))
      ).trim();
      const vehicleNo = (
        r.vehicleNo ||
        (Array.isArray(r.vehicleNumbers) && r.vehicleNumbers.length > 0 ? r.vehicleNumbers.join(', ') : '') ||
        '-'
      ).trim();

      const basicFreight = num(r.amount);

      let tdsPercent = 2;
      let tdsAmount = 0;

      // SPECIAL NVL RULE: NVL + TOLL => TDS % = 0%, TDS Amount = ₹0.00
      const isNvlToll = targetSite === 'NVL' && billType.toUpperCase().includes('TOLL');
      if (isNvlToll) {
        tdsPercent = 0;
        tdsAmount = 0;
      } else {
        tdsPercent = 2;
        tdsAmount = Math.round((basicFreight * 0.02) * 100) / 100;
      }

      const recordId = String(r._id || r.id || r.invoiceNumber);

      return {
        _id: recordId,
        id: recordId,
        site: targetSite,
        billNo,
        billDate,
        billType,
        partyName,
        vehicleNo,
        basicFreight,
        tdsPercent,
        tdsAmount
      };
    });

    // 4. Search Filter
    if (search && search.trim()) {
      const term = search.toLowerCase().trim();
      rawRecords = rawRecords.filter(r =>
        r.billNo.toLowerCase().includes(term) ||
        r.partyName.toLowerCase().includes(term) ||
        r.vehicleNo.toLowerCase().includes(term) ||
        r.billType.toLowerCase().includes(term)
      );
    }

    // 5. Attach sequential SL NO (1..N)
    const entries = rawRecords.map((r, idx) => ({
      slNo: idx + 1,
      ...r
    }));

    // 6. Summary Totals
    let totalBasicFreight = 0;
    let totalTdsAmount = 0;

    entries.forEach(r => {
      totalBasicFreight += r.basicFreight;
      totalTdsAmount += r.tdsAmount;
    });

    res.json({
      success: true,
      site: targetSite,
      count: entries.length,
      entries,
      summary: {
        totalBasicFreight: Math.round(totalBasicFreight * 100) / 100,
        totalTdsAmount: Math.round(totalTdsAmount * 100) / 100
      }
    });
  } catch (err) {
    console.error('[TdsReports] Billing TDS fetch error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
