const express = require("express");
const mongoose = require("mongoose");
const auth = require("../middleware/authMiddleware");

const router = express.Router();
const Invoice = require("../models/Invoice");

function getCementCol() {
  return mongoose.connection.useDb("cement_register").collection("entries");
}

function getDatePatterns(dateStr) {
  // Input: YYYY-MM-DD
  const parts = dateStr.split('-');
  if (parts.length !== 3) return [dateStr];
  const y = parts[0];
  const m = String(parseInt(parts[1], 10)); // e.g. "6"
  const mm = parts[1]; // e.g. "06"
  const d = String(parseInt(parts[2], 10)); // e.g. "9"
  const dd = parts[2]; // e.g. "09"
  
  const yShort = y.slice(-2);
  
  const patterns = [
    `${dd}-${mm}-${y}`,
    `${d}-${m}-${y}`,
    `${dd}/${mm}/${y}`,
    `${d}/${m}/${y}`,
    `${dd}-${mm}-${yShort}`,
    `${d}-${m}-${yShort}`,
    `${dd}/${mm}/${yShort}`,
    `${d}/${m}/${yShort}`
  ];
  return Array.from(new Set(patterns));
}

router.get("/data", auth, async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ success: false, error: "Date parameter is required (YYYY-MM-DD)" });
    }

    const patterns = getDatePatterns(date);

    // Fetch Cement Register entries based on date patterns
    const cementEntries = await getCementCol().find({
      $or: [
        { "LOADING DT": { $in: patterns } },
        { "LOADING DATE": { $in: patterns } },
        { "BILL DATE": { $in: patterns } }
      ]
    }).toArray();

    // Fetch Main Cashbook entry for the selected date
    const cashbookEntry = await mongoose.connection.useDb("main_cashbook").collection("entries").findOne({
      DATE: { $in: patterns }
    });

    // Fetch Advance Summary for the selected date
    let isoDateObj = new Date(date);
    let advanceSummary = null;
    let invoiceStats = {
      totalUploaded: 0,
      successfullyProcessed: 0,
      pendingInvoices: 0,
      failedInvoices: 0,
      lastUploadTime: null,
      recentInvoices: []
    };

    if (!isNaN(isoDateObj.getTime())) {
      const y = isoDateObj.getFullYear();
      const m = String(isoDateObj.getMonth() + 1).padStart(2, '0');
      const d = String(isoDateObj.getDate()).padStart(2, '0');
      const isoFmt = `${y}-${m}-${d}`;
      advanceSummary = await mongoose.connection.useDb("invoiceAI").collection("daily_advances").findOne({ date: isoFmt });
      
      // Calculate start and end of the day for Invoice query
      const startOfDay = new Date(isoDateObj.setHours(0, 0, 0, 0));
      const endOfDay = new Date(isoDateObj.setHours(23, 59, 59, 999));
      
      const invoicesToday = await Invoice.find({
        created_at: { $gte: startOfDay, $lte: endOfDay }
      }).sort({ created_at: -1 }).lean();

      invoiceStats.totalUploaded = invoicesToday.length;
      if (invoicesToday.length > 0) {
        invoiceStats.lastUploadTime = invoicesToday[0].created_at;
      }

      invoicesToday.forEach(inv => {
        const status = (inv.status || '').toLowerCase();
        if (status === 'approved' || status === 'completed') {
          invoiceStats.successfullyProcessed++;
        } else if (status === 'failed' || status === 'error') {
          invoiceStats.failedInvoices++;
        } else {
          invoiceStats.pendingInvoices++;
        }
      });

      invoiceStats.recentInvoices = invoicesToday.slice(0, 5).map(inv => ({
        _id: inv._id,
        consignee_name: inv.consignee_name || (inv.human_verified_data?.consignee_details?.consignee_name) || (inv.ai_data?.consignee_details?.consignee_name) || "Unknown",
        status: inv.status,
        created_at: inv.created_at
      }));
    }

    // Extract pump slips (entries from cement register with pump details)
    const pumpSlips = cementEntries.filter(e => {
      const hasPump = !!e["PUMP NAME"];
      const hasFuel = parseFloat(e["HSD (LTR)"]) > 0 || !!e["HSD SLIP NO"];
      return hasPump && hasFuel;
    });

    res.json({
      success: true,
      invoicesUploaded: cementEntries.length, // Keeping for backward compatibility with total cement entries
      invoiceStats,
      cement: cementEntries,
      pumpSlips,
      cashbookEntry,
      advanceSummary
    });

  } catch (err) {
    console.error("[DailySummary] fetch error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

module.exports = router;
