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

// ── GET /api/tds-reports/party-tds ──────────────────────────────────────────
router.get('/party-tds', async (req, res) => {
  try {
    const { search } = req.query;

    const db = mongoose.connection.useDb('invoice_system');
    const ownerCol = db.collection('owner details');
    const ownerDocs = await ownerCol.find({}).toArray();

    // Group by unique owner name (case-insensitive deduplication)
    const uniqueOwnersMap = new Map();
    ownerDocs.forEach(d => {
      const rawName = (d["Owner Name"] || d["Owner Name "] || d.owner_name || "").trim();
      if (!rawName) return;
      const key = rawName.toUpperCase();
      if (!uniqueOwnersMap.has(key)) {
        uniqueOwnersMap.set(key, {
          name: rawName,
          pan: (d["PAN No."] || d["PAN No. "] || d.pan_no || "-").trim(),
          aadhar: (d["Aadhar No."] || d["Aadhar No. "] || d.aadhar_no || "-").trim(),
          panAadharLink: (d["PAN Addahar Link"] || d["PAN Addahar Link "] || d.pan_aadhar_link || "-").trim()
        });
      }
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

    // Generate EXACTLY 4 rows per unique owner with continuous SL NO (1..N*4)
    const entries = [];
    let slNo = 1;

    uniqueOwners.forEach(ownerObj => {
      for (let r = 1; r <= 4; r++) {
        entries.push({
          slNo: slNo++,
          ownerIndexRow: r,
          name: ownerObj.name,
          billNo: "-",
          billDate: "-",
          billType: "-",
          basicAmount: 0,
          tdsPercent: 0,
          tdsAmount: 0,
          tdsDeducted: 0,
          panCardNumber: ownerObj.pan,
          aadharNo: ownerObj.aadhar,
          aadhaarPanLinked: (ownerObj.panAadharLink.toUpperCase() === "YES" || (ownerObj.pan !== "-" && ownerObj.aadhar !== "-")) ? "YES" : "NO"
        });
      }
    });

    res.json({
      success: true,
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
router.get('/billing-tds', async (req, res) => {
  try {
    const { site = 'NVL', month, year, search } = req.query;
    const targetSite = site.trim().toUpperCase();

    const targetMonth = (month && month !== 'ALL') ? parseInt(month, 10) : null;
    let targetFyStartYear = null;

    if (year && year !== 'ALL') {
      const parts = String(year).split('-');
      targetFyStartYear = parseInt(parts[0], 10);
      if (isNaN(targetFyStartYear)) {
        targetFyStartYear = parseInt(year, 10);
      }
    }

    const cementCol = mongoose.connection.useDb('cement_register').collection('entries');
    const allCement = await cementCol.find({}).toArray();

    // 1. Filter by SITE (NVL or NVCL)
    let filtered = allCement.filter(e => {
      const entrySite = (e["SITE"] || "").trim().toUpperCase();
      if (entrySite !== targetSite) return false;

      // Date filtering (Month & FY)
      const dateVal = e["BILL DATE"] || e["LOADING DT"] || e["LOADING DATE"];
      if (targetMonth || targetFyStartYear) {
        const d = parseDate(dateVal);
        if (!d) return false;

        const m = d.getMonth() + 1;
        const calYear = d.getFullYear();

        if (targetMonth && m !== targetMonth) return false;

        if (targetFyStartYear) {
          const entryFyStart = m >= 4 ? calYear : calYear - 1;
          if (entryFyStart !== targetFyStartYear) return false;
        }
      }

      return true;
    });

    // 2. Map fields and calculate TDS
    let rawRecords = filtered.map(e => {
      const billNo = (e["BILL NO"] || e["INVOICE NO"] || e["SHIPMENT NO"] || "-").trim();
      const billDate = (e["BILL DATE"] || e["LOADING DT"] || e["LOADING DATE"] || "-").trim();
      const billType = (e["Bill Type"] || e["BILL TYPE"] || "Freight").trim();
      const partyName = (e["PARTY NAME"] || e["OWNER NAME"] || e["TRANSPORTER NAME"] || "-").trim();
      const vehicleNo = normVeh(e["VEHICLE NUMBER"] || e["VEHICLE NO"]) || (e["VEHICLE NUMBER"] || e["VEHICLE NO"] || "-").trim();
      
      const basicFreight = num(e["Billing Amount"]) || num(e["BASIC FREIGHT"]) || num(e["BILLING ER 95%"]) || num(e["AMOUNT"]);

      let tdsPercent = 2;
      let tdsAmount = 0;

      // NVL Rule: NVL + TOLL => TDS = 0
      if (targetSite === 'NVL' && billType.toUpperCase().includes('TOLL')) {
        tdsPercent = 0;
        tdsAmount = 0;
      } else {
        tdsPercent = 2;
        tdsAmount = Math.round((basicFreight * 0.02) * 100) / 100;
      }

      return {
        id: String(e._id || ''),
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

    // 3. Search Filter
    if (search && search.trim()) {
      const term = search.toLowerCase().trim();
      rawRecords = rawRecords.filter(r =>
        r.billNo.toLowerCase().includes(term) ||
        r.partyName.toLowerCase().includes(term) ||
        r.vehicleNo.toLowerCase().includes(term) ||
        r.billType.toLowerCase().includes(term)
      );
    }

    // 4. Attach sequential SL NO
    const entries = rawRecords.map((r, idx) => ({
      slNo: idx + 1,
      ...r
    }));

    // 5. Totals
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
