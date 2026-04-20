const express = require("express");
const { getIO } = require("../socket");
const router = express.Router();
const mongoose = require("mongoose");
const { ObjectId } = require("mongodb");
const auth = require("../middleware/authMiddleware");
const adminOnly = require("../middleware/adminOnly");
const gstAttachUpload = require("../middleware/gstAttachUpload");

// ─────────────────────────────────────────────────────────────────────────────
// Database  : gst_portal
// Collection: entries
// By passing Mongoose schema to handle arbitrary spreadsheet fields.
// ─────────────────────────────────────────────────────────────────────────────

function getCollection() {
  return mongoose.connection.useDb("gst_portal").collection("entries");
}

// ── GET /gst-portal ─────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const col = getCollection();
    const filter = {};
    const entries = await col.find(filter).sort({ "SL NO": 1 }).toArray();
    res.json({ success: true, count: entries.length, entries });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── POST /gst-portal ────────────────────────────────────────────────────────
router.post("/", auth, async (req, res) => {
  try {
    const col = getCollection();
    const result = await col.insertOne(req.body);
    res.status(201).json({ success: true, entry: { _id: result.insertedId, ...req.body } });
    const io = getIO();
    io.emit('gstPortalUpdates', { action: 'create', entry: { _id: result.insertedId, ...req.body } });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ── POST /gst-portal/bulk ───────────────────────────────────────────────────
router.post("/bulk", auth, adminOnly, async (req, res) => {
  try {
    const col = getCollection();
    const docs = req.body.entries || req.body;
    if (!Array.isArray(docs) || docs.length === 0) {
      return res.status(400).json({ success: false, error: "Provide an array of entries." });
    }
    const result = await col.insertMany(docs, { ordered: false });
    res.status(201).json({ success: true, insertedCount: result.insertedCount });
    const io = getIO();
    io.emit('gstPortalUpdates', { action: 'bulkCreate', count: result.insertedCount });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ── PUT /gst-portal/bulk-update ─────────────────────────────────────────────
router.put("/bulk-update", auth, async (req, res) => {
  try {
    const col = getCollection();
    const { updates } = req.body;
    if (!updates || !Array.isArray(updates)) {
      return res.status(400).json({ success: false, error: "Invalid updates payload" });
    }
    const io = getIO();
    const bulkOps = updates.map(u => ({
      updateOne: {
        filter: { _id: new ObjectId(u.id) },
        update: { $set: u.changes }
      }
    }));
    if (bulkOps.length > 0) await col.bulkWrite(bulkOps);

    res.json({ success: true, updatedCount: updates.length });
    io.emit('gstPortalUpdates', { action: 'bulkUpdate' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /gst-portal/bulk-delete ──────────────────────────────────────────
router.delete("/bulk-delete", auth, async (req, res) => {
  try {
    const col = getCollection();
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: "Provide an array of ids." });
    }
    const objectIds = ids.map(id => new ObjectId(id));
    const result = await col.deleteMany({ _id: { $in: objectIds } });

    // Re-sequence SL NOs to stay gapless after deletion
    const remaining = await col.find({}).sort({ "SL NO": 1, "_auto_updated_at": 1 }).toArray();
    const bulkOps = remaining.map((row, idx) => ({
      updateOne: { filter: { _id: row._id }, update: { $set: { "SL NO": idx + 1 } } }
    }));
    if (bulkOps.length > 0) await col.bulkWrite(bulkOps);

    const io = getIO();
    io.emit("gstPortalUpdates", { action: "bulkDelete", ids });

    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put("/:id", auth, async (req, res) => {
  try {
    const col = getCollection();
    const result = await col.findOneAndUpdate(
      { _id: new ObjectId(req.params.id) },
      { $set: req.body },
      { returnDocument: "after" }
    );
    if (!result) return res.status(404).json({ success: false, error: "Entry not found." });
    res.json({ success: true, entry: result });
    const io = getIO();
    io.emit('gstPortalUpdates', { action: 'update', entry: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ── POST /gst-portal/attach/:rowId/:attachType ──────────────────────────────
router.post("/attach/:rowId/:attachType", auth, (req, res, next) => {
  gstAttachUpload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: "No file uploaded." });
    const col      = getCollection();
    const { rowId } = req.params;
    const url      = req.file.location; // S3 public URL
    const field    = "GST_FILE_URL";

    // Save URL into the row
    await col.updateOne(
      { _id: new ObjectId(rowId) },
      { $set: { [field]: url } }
    );

    const io = getIO();
    io.emit("gstPortalUpdates", { action: "attach", rowId, field, url });

    res.json({ success: true, url, field });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
