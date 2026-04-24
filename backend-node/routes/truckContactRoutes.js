const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { ObjectId } = require("mongodb");

// ─────────────────────────────────────────────────────────────────────────────
// We bypass Mongoose entirely and use the raw MongoDB native driver.
// This guarantees that field names like "Truck No ", "Owner Name " etc.
// are saved EXACTLY as sent — Mongoose schema processing was mangling them.
// ─────────────────────────────────────────────────────────────────────────────

function getCollection() {
  return mongoose.connection.useDb("invoice_system").collection("Truck Contact Number");
}

// GET /truck-contacts — Fetch all contacts (newest first)
router.get("/", async (req, res) => {
  try {
    const col = getCollection();
    const contacts = await col.find({}).sort({ _id: -1 }).toArray();
    res.json({ success: true, contacts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /truck-contacts — Create a new contact
router.post("/", async (req, res) => {
  try {
    const col = getCollection();
    const result = await col.insertOne(req.body);
    res.status(201).json({ success: true, contact: { _id: result.insertedId, ...req.body } });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// PUT /truck-contacts/:id — Update an existing contact
router.put("/:id", async (req, res) => {
  try {
    const col = getCollection();
    const result = await col.findOneAndUpdate(
      { _id: new ObjectId(req.params.id) },
      { $set: req.body },
      { returnDocument: "after" }
    );
    if (!result) {
      return res.status(404).json({ success: false, error: "Contact not found." });
    }
    res.json({ success: true, contact: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /truck-contacts/upload-temp — Upload temporary driver license PDF
const cementAttachUpload = require("../middleware/cementAttachUpload");
router.post("/upload-temp", cementAttachUpload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: "No file uploaded" });
    res.json({ success: true, url: req.file.location });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /truck-contacts/approve/:id — Approve a temporary driver
router.put("/approve/:id", async (req, res) => {
  try {
    const col = getCollection();
    await col.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { is_approved: true, approved_at: new Date() } }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /truck-contacts/:id — Delete a contact
router.delete("/:id", async (req, res) => {
  try {
    const col = getCollection();
    const result = await col.deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, error: "Contact not found." });
    }
    res.json({ success: true, message: "Contact deleted successfully." });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
