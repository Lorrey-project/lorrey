const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const PartyPayment = require('../models/PartyPayment');

// ── Helper: robust date parser (copied from pumpPayment) ──────────────────
function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val) ? null : val;
  const str = String(val).trim();

  // ── Detect DD-MM-YYYY / DD/MM/YYYY (Indian format) — MUST check first ──
  const ddmmyyyy = str.match(/^(\d{1,2})[\-\/](\d{1,2})[\-\/](\d{4})$/);
  if (ddmmyyyy) {
    const d = parseInt(ddmmyyyy[1]), m = parseInt(ddmmyyyy[2]), y = parseInt(ddmmyyyy[3]);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      return new Date(y, m - 1, d);
    }
  }

  // ── Handle YYYY-MM-DD ISO format ──
  const yyyymmdd = str.match(/^(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})/);
  if (yyyymmdd) {
    const y = parseInt(yyyymmdd[1]), m = parseInt(yyyymmdd[2]), d = parseInt(yyyymmdd[3]);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      return new Date(y, m - 1, d);
    }
  }

  // ── Try standard JS parsing as final fallback ──
  const iso = new Date(str);
  if (!isNaN(iso.getTime())) return iso;

  return null;
}


function getDateParts(val) {
  const d = parseDate(val);
  if (!d) return null;
  return { day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear() };
}

function getCementCol() {
  return mongoose.connection.useDb("cement_register").collection("entries");
}

// GET all cement records for a specific month using JS filtering
router.get('/cement-data', async (req, res) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) {
      return res.status(400).json({ error: 'Month and year are required' });
    }
    const m = parseInt(month, 10);
    const y = parseInt(year, 10);

    // Fetch all records (since date might be string) and filter
    // To avoid fetching completely everything, we can projection
    // but the db is likely not huge enough to crash node.
    const all = await getCementCol().find({}).toArray();

    const entries = all.filter(e => {
      const dateVal = e["LOADING DT"] || e["LOADING DATE"];
      const parts = getDateParts(dateVal);
      if (!parts) return false;
      return parts.year === y && parts.month === m;
    });

    res.json({ success: true, count: entries.length, entries });
  } catch (error) {
    console.error('Error fetching cement data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DEBUG: view raw field names and values from cement register
router.get('/debug-cement', async (req, res) => {
  try {
    const col = getCementCol();

    // Get 3 sample docs to inspect field names
    const samples = await col.find({}).limit(5).toArray();

    // Get all distinct date field values
    const allDates = [];
    const allRaw = await col.find({}, { projection: { 'LOADING DATE': 1, 'LOADING DT': 1, 'VEHICLE NUMBER': 1, 'BILLING @ 95% (PARTY PAYABLE)': 1, 'TDS@1%': 1, 'HSD AMOUNT': 1, 'ADVANCE': 1 } }).limit(20).toArray();

    res.json({
      totalDocs: await col.countDocuments(),
      sampleFieldNames: samples.length > 0 ? Object.keys(samples[0]) : [],
      sampleRow: samples[0] || null,
      dateAndKeyFields: allRaw.map(r => ({
        'VEHICLE NUMBER': r['VEHICLE NUMBER'],
        'LOADING DATE': r['LOADING DATE'],
        'LOADING DT': r['LOADING DT'],
        'BILLING @ 95% (PARTY PAYABLE)': r['BILLING @ 95% (PARTY PAYABLE)'],
        'TDS@1%': r['TDS@1%'],
        'HSD AMOUNT': r['HSD AMOUNT'],
        'ADVANCE': r['ADVANCE'],
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET all manual entries for a specific month and year
router.get('/', async (req, res) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) {
      return res.status(400).json({ error: 'Month and year are required' });
    }

    const records = await PartyPayment.find({
      month: parseInt(month, 10),
      year: parseInt(year, 10)
    });

    return res.json(records);
  } catch (error) {
    console.error('Error fetching party payments:', error);
    res.status(500).json({ error: 'Failed to fetch party payment details' });
  }
});

// POST to bulk upsert manual entries
router.post('/bulk', async (req, res) => {
  try {
    const { month, year, data } = req.body;
    if (!month || !year || !Array.isArray(data)) {
      return res.status(400).json({ error: 'Invalid input data' });
    }

    const monthInt = parseInt(month, 10);
    const yearInt = parseInt(year, 10);

    const operations = data.map(record => ({
      updateOne: {
        filter: { month: monthInt, year: yearInt, vehicleNo: record.vehicleNo },
        update: {
          $set: {
            gstFcm: record.gstFcm !== undefined ? Number(record.gstFcm) : 0,
            withholdAmount: record.withholdAmount !== undefined ? Number(record.withholdAmount) : 0,
            withholdReason: record.withholdReason || '',
            otherReason: record.otherReason || '',
            prevMonthDue: record.prevMonthDue !== undefined ? Number(record.prevMonthDue) : 0,
            recoveredToDac: record.recoveredToDac !== undefined ? Number(record.recoveredToDac) : 0,
            creditRefund: record.creditRefund !== undefined ? Number(record.creditRefund) : 0,
            paidToParty: record.paidToParty !== undefined ? Number(record.paidToParty) : 0,
            paymentDate: record.paymentDate || '',
            remarks: record.remarks || ''
          }
        },
        upsert: true
      }
    }));

    if (operations.length > 0) {
      await PartyPayment.bulkWrite(operations);
    }

    res.json({ message: 'Saved successfully', updatedCount: operations.length });
  } catch (error) {
    console.error('Error in bulk party payments update:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
