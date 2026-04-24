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

function getApprovalCollection() {
  return mongoose.connection.useDb("invoice_system").collection("Truck Contact Approvals");
}

// ─────────────────────────────────────────────────────────────────────────────
// APPROVAL WORKFLOW ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

// GET /truck-contacts/approvals — Fetch pending requests (Head Office only)
router.get("/approvals", async (req, res) => {
  try {
    const col = getApprovalCollection();
    const requests = await col.find({ status: "pending" }).sort({ createdAt: -1 }).toArray();
    res.json({ success: true, requests });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /truck-contacts/request — Submit a new profile for approval (Site/SAS)
router.post("/request", async (req, res) => {
  try {
    const col = getApprovalCollection();
    const request = {
      ...req.body,
      status: "pending",
      requestedAt: new Date(),
      requestType: req.body["Truck No "] ? "New Registration" : "Temp Driver Update"
    };
    const result = await col.insertOne(request);
    res.status(201).json({ success: true, requestId: result.insertedId });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// PUT /truck-contacts/approvals/:id — Approve or Reject a request
router.put("/approvals/:id", async (req, res) => {
  const { id } = req.params;
  const { status, actionBy } = req.body; // 'approved' or 'rejected'

  try {
    const approvalCol = getApprovalCollection();
    const mainCol = getCollection();

    const request = await approvalCol.findOne({ _id: new ObjectId(id) });
    if (!request) return res.status(404).json({ success: false, error: "Request not found" });

    if (status === "approved") {
      // 1. Prepare data for main collection (remove approval-specific fields)
      const { _id, status: s, requestedAt, actionBy: ab, ...mainData } = request;

      // 2. Check if it's an update or new registration
      const truckNo = mainData["Truck No "];
      if (truckNo) {
        // New Registration: UPSERT (Update existing if Truck No exists, or insert new)
        await mainCol.updateOne(
          { "Truck No ": truckNo },
          { $set: mainData },
          { upsert: true }
        );
      } else {
        // Fallback for case where it's a specific ID update
        return res.status(400).json({ success: false, error: "Invalid truck data for approval" });
      }

      // 3. Mark as approved in history instead of deleting (optional, but cleaner for audit)
      await approvalCol.updateOne({ _id: new ObjectId(id) }, { $set: { status: "approved", processedAt: new Date(), processedBy: actionBy } });
    } else {
      // Rejected
      await approvalCol.updateOne({ _id: new ObjectId(id) }, { $set: { status: "rejected", processedAt: new Date(), processedBy: actionBy } });
    }

    res.json({ success: true, message: `Request ${status} successfully.` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// LEGACY / MASTER ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

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
