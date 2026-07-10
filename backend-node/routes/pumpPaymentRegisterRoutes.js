const express = require("express");
const mongoose = require("mongoose");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

function getCollection() {
  return mongoose.connection.useDb("pump_payment_register").collection("records");
}

function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val) ? null : val;
  const str = String(val).trim();
  const ddmmyyyy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (ddmmyyyy) {
    const d = parseInt(ddmmyyyy[1]), m = parseInt(ddmmyyyy[2]), y = parseInt(ddmmyyyy[3]);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      return new Date(y, m - 1, d);
    }
  }
  const iso = new Date(str);
  if (!isNaN(iso.getTime())) return iso;
  return null;
}

// GET records for a specific month and year
router.get("/", auth, async (req, res) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) {
      return res.status(400).json({ success: false, error: "Month and year are required" });
    }
    const m = parseInt(month), y = parseInt(year);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0, 23, 59, 59, 999);

    const records = await getCollection().find({
      paymentDateObj: { $gte: start, $lte: end }
    }).toArray();

    res.json({ success: true, records });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// BULK UPDATE / UPSERT
router.put("/bulk-update", auth, async (req, res) => {
  try {
    const { updates } = req.body;
    if (!Array.isArray(updates)) {
      return res.status(400).json({ success: false, error: "Updates must be an array" });
    }

    const col = getCollection();
    for (const doc of updates) {
      const { _id, ...fields } = doc;
      
      // Attempt to parse payment date string to object for querying
      if (fields["Payment Date"]) {
        const dObj = parseDate(fields["Payment Date"]);
        if (dObj) fields.paymentDateObj = dObj;
      }

      fields.updatedAt = new Date();
      fields.updatedBy = req.user.username || req.user.id;

      if (_id && _id.startsWith("new_")) {
        fields.createdAt = new Date();
        await col.insertOne(fields);
      } else if (_id) {
        if (!mongoose.Types.ObjectId.isValid(_id)) continue;
        await col.updateOne({ _id: new mongoose.Types.ObjectId(_id) }, { $set: fields });
      }
    }
    res.json({ success: true, message: "Bulk update successful" });
  } catch (err) {
    console.error("[pumpPaymentRegisterRoutes] bulk-update error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// BULK DELETE
router.post("/bulk-delete", auth, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: "IDs array is required" });
    }

    const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id));
    
    if (validIds.length > 0) {
      await getCollection().deleteMany({ _id: { $in: validIds } });
    }
    
    res.json({ success: true, message: "Bulk delete successful" });
  } catch (err) {
    console.error("[pumpPaymentRegisterRoutes] bulk-delete error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
