const express = require("express");
const router = express.Router();
const FreightAdjustment = require("../models/FreightAdjustment");
const auth = require("../middleware/authMiddleware");

// ─── GET /freight-adjustments ───────────────────────────────────────────────
// Returns all adjustment rows for a given owner+vehicle and optional month/financialYear.
router.get("/", async (req, res) => {
  try {
    const { ownerName, vehicleNo, ownerId, vehicleId, month, financialYear, summaryRecordId, category } = req.query;
    if (!ownerName && !vehicleNo && !ownerId && !vehicleId) {
      return res.status(400).json({ success: false, error: "ownerName and vehicleNo are required." });
    }
    const query = {};
    if (ownerName) query.ownerName = ownerName;
    if (vehicleNo) query.vehicleNo = vehicleNo;
    if (ownerId) query.ownerId = ownerId;
    if (vehicleId) query.vehicleId = vehicleId;
    if (month) query.month = month;
    if (financialYear) query.financialYear = financialYear;
    if (summaryRecordId) query.summaryRecordId = summaryRecordId;
    if (category) query.category = category;

    const adjustments = await FreightAdjustment.find(query)
      .sort({ sequence: 1, createdAt: 1 })
      .lean();
    res.json({ success: true, adjustments });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /freight-adjustments ────────────────────────────────────────────────
// Creates a new adjustment row (deduction for top section, addition for bottom section).
router.post("/", auth, async (req, res) => {
  try {
    const {
      ownerName,
      vehicleNo,
      ownerId,
      vehicleId,
      month,
      financialYear,
      summaryRecordId,
      category,
      reason,
      amount,
      label,
      othersDescription,
      adjustmentType,
    } = req.body;

    if (!ownerName || !vehicleNo) {
      return res.status(400).json({ success: false, error: "ownerName and vehicleNo are required." });
    }

    const effectiveCategory = category || (adjustmentType && adjustmentType !== "manual" ? "deduction" : "addition");
    const effectiveReason = (reason || othersDescription || label || (effectiveCategory === "deduction" ? "Adjustment" : "Manual Addition")).trim();
    const effectiveLabel = (label || effectiveReason).trim();

    // Prevent duplicates of non-'others' types for deduction rows in the same owner+vehicle+month
    if (effectiveCategory === "deduction" && adjustmentType && adjustmentType !== "others" && adjustmentType !== "manual") {
      const existingQuery = { ownerName, vehicleNo, adjustmentType, category: "deduction" };
      if (month) existingQuery.month = month;
      if (financialYear) existingQuery.financialYear = financialYear;
      const existing = await FreightAdjustment.findOne(existingQuery);
      if (existing) {
        return res.status(409).json({
          success: false,
          error: `"${effectiveLabel}" has already been added. Remove it first before adding again.`
        });
      }
    }

    // Determine sequence = max existing sequence + 1
    const seqQuery = { ownerName, vehicleNo };
    if (month) seqQuery.month = month;
    if (financialYear) seqQuery.financialYear = financialYear;
    if (effectiveCategory) seqQuery.category = effectiveCategory;

    const lastRow = await FreightAdjustment.findOne(seqQuery).sort({ sequence: -1 }).lean();
    const nextSeq = lastRow ? (lastRow.sequence || 0) + 1 : 0;

    const adjustment = new FreightAdjustment({
      ownerName,
      vehicleNo,
      ownerId: ownerId || "",
      vehicleId: vehicleId || "",
      month: month || "",
      financialYear: financialYear || "",
      summaryRecordId: summaryRecordId || "",
      category: effectiveCategory,
      reason: effectiveReason,
      amount: parseFloat(amount) || 0,
      label: effectiveLabel,
      othersDescription: othersDescription || (effectiveCategory === "deduction" ? effectiveReason : ""),
      adjustmentType: adjustmentType || (effectiveCategory === "deduction" ? "others" : "manual"),
      sequence: nextSeq,
    });

    await adjustment.save();
    res.status(201).json({ success: true, adjustment });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ─── PUT /freight-adjustments/:id ────────────────────────────────────────────
// Updates reason and/or amount of an existing adjustment row.
router.put("/:id", auth, async (req, res) => {
  try {
    const { amount, reason, othersDescription, label } = req.body;
    const update = {};
    if (amount !== undefined) update.amount = parseFloat(amount) || 0;
    if (reason !== undefined) {
      update.reason = reason;
      update.label = reason;
      update.othersDescription = reason;
    } else if (othersDescription !== undefined) {
      update.reason = othersDescription;
      update.label = othersDescription;
      update.othersDescription = othersDescription;
    } else if (label !== undefined) {
      update.reason = label;
      update.label = label;
      update.othersDescription = label;
    }

    const updated = await FreightAdjustment.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ success: false, error: "Adjustment not found." });
    res.json({ success: true, adjustment: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ─── DELETE /freight-adjustments/:id ─────────────────────────────────────────
// Removes a single adjustment row.
router.delete("/:id", auth, async (req, res) => {
  try {
    const deleted = await FreightAdjustment.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, error: "Adjustment not found." });
    res.json({ success: true, message: "Adjustment removed." });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

