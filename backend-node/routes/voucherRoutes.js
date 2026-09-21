const express = require("express");
const router = express.Router();
const Voucher = require("../models/Voucher");
const Invoice = require("../models/Invoice");
const TruckContact = require("../models/TruckContact");
const voucherSlipUpload = require("../middleware/voucherSlipUpload");
const { getIO } = require("../socket");
const { pushToRegister, syncVoucherDummy } = require("../utils/syncManager");
const auth = require("../middleware/authMiddleware");
const {
  applyVoucherToCement,
  reverseVoucherFromCement,
  syncVoucherOnUpdate,
  syncVoucherSlip
} = require("../utils/voucherCementAdvanceManager");

// Helper: compute expense totals for a specific date string and emit to all clients
async function emitExpenseUpdate(dateIso) {
  try {
    const io = getIO();
    const voucherCol = Voucher.collection;
    const cementCol = require('mongoose').connection.useDb('cement_register').collection('entries');

    // Convert ISO date string to DD-MM-YYYY for matching stored dates
    const d = new Date(dateIso);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const normDate = `${day}-${month}-${year}`; // e.g. "24-04-2026"

    // Run aggregations for this specific date in parallel
    const startOfDay = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
    const endOfDay = new Date(`${year}-${month}-${day}T23:59:59.999Z`);

    const [indirectRes, directRes, cementRes] = await Promise.all([
      voucherCol.aggregate([
        { $match: { expenseType: { $ne: 'Direct Expense' }, date: { $gte: startOfDay, $lte: endOfDay } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]).toArray(),
      voucherCol.aggregate([
        { $match: { expenseType: 'Direct Expense', date: { $gte: startOfDay, $lte: endOfDay } } },
        { $group: { _id: null, total: { $sum: '$amount' }, details: { $push: { purpose: '$purpose', amount: '$amount' } } } }
      ]).toArray(),
      cementCol.aggregate([
        { $match: { 'LOADING DT': { $in: [normDate, `${d.getDate()}-${d.getMonth() + 1}-${year}`] } } },
        { $group: { _id: null, total: { $sum: { $convert: { input: '$ADVANCE', to: 'double', onError: 0, onNull: 0 } } } } }
      ]).toArray(),
    ]);

    const sExpense = (indirectRes[0]?.total || 0) + (cementRes[0]?.total || 0);
    const oExpense = directRes[0]?.total || 0;
    const oDetails = (directRes[0]?.details || []).map(d => `${d.purpose} (${d.amount})`).join(', ');

    io.emit('expenseUpdate', { date: normDate, sExpense, oExpense, oDetails });
  } catch (err) {
    console.error('[voucherRoutes] emitExpenseUpdate failed:', err.message);
  }
}

// Helper: re-sync cement register for a given vehicle number / invoiceId.
// Now triggers the dummy logic from syncManager to natively handle standalone records
async function resyncCementForVehicle(vehicleNumber, explicitInvoiceId, voucherId) {
  try {
    if (voucherId) {
      await syncVoucherDummy(voucherId);
    } else if (explicitInvoiceId) {
      await pushToRegister(explicitInvoiceId);
    }
  } catch (err) {
    console.error('[voucherRoutes] resyncCementForVehicle failed:', err.message);
  }
}

// Helper: generate next voucher number (atomic — finds current max, increments)
async function generateVoucherNumber() {
  // Find the voucher with the highest numeric suffix
  const last = await Voucher.findOne(
    { voucherNumber: /^VCH-\d+$/ },
    { voucherNumber: 1 }
  ).sort({ voucherNumber: -1 }).lean();

  let nextNum = 1;
  if (last) {
    const match = last.voucherNumber.match(/^VCH-(\d+)$/);
    if (match) nextNum = parseInt(match[1], 10) + 1;
  }
  return `VCH-${String(nextNum).padStart(5, "0")}`;
}

// GET /voucher/contacts — return owner→vehicles grouped map from TruckContact
router.get("/contacts", async (req, res) => {
  try {
    // Fetch all fields in case the database has trailing spaces in keys like "Truck No "
    const contacts = await TruckContact.find({}).lean();

    // Build grouped map: { "OWNER NAME": ["WB12AB1234", ...] }
    const ownerMap = {};
    const ownerDetails = {};
    // vehicleWheelMap: { "WB12AB1234": "10W" | "6W" | "12W" | "14W" | "" }
    // Used by the frontend to determine which wheel-type incentive columns to show per owner.
    const vehicleWheelMap = {};

    for (const c of contacts) {
      const name = (c.owner_name || c["Owner Name"] || c["Owner Name "] || c.Owner_Name || "").trim();
      const truck = (c.truck_no || c["Truck No"] || c["Truck No "] || c.Truck_No || "").trim();

      if (!name || !truck) continue;

      if (!ownerMap[name]) ownerMap[name] = [];
      if (!ownerMap[name].includes(truck)) ownerMap[name].push(truck);

      if (!ownerDetails[name]) {
        ownerDetails[name] = {
          pan: (c.pan_no || c["PAN No"] || c["PAN NO"] || c["PAN_No"] || "").trim(),
          address: (c.address || c["Address"] || c["ADDRESS"] || "").trim(),
          contactNo: (c.contact_no || c["Contact No"] || c["CONTACT NO"] || c["Contact_No"] || "").trim()
        };
      }

      // Normalize wheel type for this vehicle.
      // The field may be stored as "wheel_type" (new schema) or legacy fields.
      const rawWheel = (
        c.wheel_type ||
        c["Type of vehicle "] ||
        c["Type of vehicle"] ||
        c.type_of_vehicle ||
        c.type ||
        c.veh_type ||
        ""
      ).toString().trim().toLowerCase();

      let normalizedWheel = "";
      if (rawWheel.includes("10")) normalizedWheel = "10W";
      else if (rawWheel.includes("12")) normalizedWheel = "12W";
      else if (rawWheel.includes("14")) normalizedWheel = "14W";
      else if (rawWheel.includes("6")) normalizedWheel = "6W";
      else if (rawWheel) normalizedWheel = rawWheel.toUpperCase();

      vehicleWheelMap[truck] = normalizedWheel;
    }

    // Sort owner names alphabetically
    const names = Object.keys(ownerMap).sort();
    // All vehicles flat list (sorted)
    const vehicles = [...new Set(contacts.map(c => (c.truck_no || "").trim()).filter(Boolean))].sort();

    res.json({ success: true, names, vehicles, ownerMap, ownerDetails, vehicleWheelMap });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /voucher — Create a new voucher (with retry on duplicate number)
// auth middleware ensures req.user is populated from the verified JWT
router.post("/", auth, async (req, res) => {
  const MAX_RETRIES = 5;
  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      const { expenseType, vehicleNumber, date, amount, purpose, name, reason, invoiceId, panelSource } = req.body;

      // Always generate server-side; ignore any client-supplied voucherNumber
      const vNum = await generateVoucherNumber();

      // ALWAYS derive the role from the verified JWT or explicit panelSource
      const roleFromToken = panelSource || req.user?.role || "OFFICE";

      const voucher = new Voucher({
        voucherNumber: vNum,
        expenseType: expenseType || "Indirect Expense",
        vehicleNumber: vehicleNumber ? String(vehicleNumber).trim().toUpperCase() : "",
        date: date || new Date(),
        amount: parseFloat(amount) || 0,
        purpose: purpose || "Others",
        name: name || "",
        reason: reason || "",
        invoiceId: invoiceId || null,
        createdByRole: roleFromToken,
      });

      await voucher.save();

      // Automatically sync Voucher to Cement Register latest invoice for this vehicle
      const cementSyncResult = await applyVoucherToCement(voucher, panelSource || roleFromToken);

      // 1. Emit instant expense patch to all cashbook clients (no round-trip needed)
      emitExpenseUpdate(voucher.date).catch(() => { });

      // 2. Notify Main Cashbook listeners that a new voucher was created
      try {
        const io = getIO();
        if (io) io.emit('voucherCreated', { voucher: voucher.toObject(), cementSyncResult });
      } catch (_) { /* socket not critical */ }

      // 3. Re-sync Cement Register so Site Cash column updates immediately
      resyncCementForVehicle(vehicleNumber, invoiceId || null, voucher._id.toString());

      return res.status(201).json({ success: true, voucher, cementSyncResult });
    } catch (error) {
      if (error.code === 11000) {
        attempt++;
        // Small jitter before retry
        await new Promise(r => setTimeout(r, 20 * attempt));
        continue;
      }
      return res.status(400).json({ success: false, error: error.message });
    }
  }
  return res.status(409).json({ success: false, error: "Could not generate a unique voucher number after retries. Please try again." });
});

// GET /voucher — Fetch all vouchers (newest first)
router.get("/", async (req, res) => {
  try {
    const vouchers = await Voucher.find().sort({ createdAt: -1 });
    res.json({ success: true, vouchers });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /voucher/:id — Update a voucher
router.put("/:id", auth, async (req, res) => {
  try {
    const oldVoucher = await Voucher.findById(req.params.id).lean();
    if (!oldVoucher) {
      return res
        .status(404)
        .json({ success: false, error: "Voucher not found." });
    }

    const { vehicleNumber, date, amount, purpose, voucherNumber, remarks, invoiceId, name, reason, expenseType, panelSource } = req.body;
    const updateFields = {};
    if (vehicleNumber !== undefined) updateFields.vehicleNumber = String(vehicleNumber).trim().toUpperCase();
    if (date !== undefined) updateFields.date = date;
    if (amount !== undefined) updateFields.amount = parseFloat(amount);
    if (purpose !== undefined) updateFields.purpose = purpose;
    if (voucherNumber !== undefined) updateFields.voucherNumber = voucherNumber;
    if (remarks !== undefined) updateFields.remarks = remarks;
    if (invoiceId !== undefined) updateFields.invoiceId = invoiceId;
    if (name !== undefined) updateFields.name = name;
    if (reason !== undefined) updateFields.reason = reason;
    if (expenseType !== undefined) updateFields.expenseType = expenseType;

    const updated = await Voucher.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { returnDocument: 'after', runValidators: true }
    );

    // Sync edited voucher with Cement Register (reverses old from previous record, applies to new)
    const cementSyncResult = await syncVoucherOnUpdate(oldVoucher, updated, panelSource || updated.createdByRole);

    // Trigger sync for potential dummy row updates
    resyncCementForVehicle(updated.vehicleNumber, updated.invoiceId || null, updated._id.toString());
    // Emit instant expense patch
    emitExpenseUpdate(updated.date).catch(() => { });

    try {
      const io = getIO();
      if (io) io.emit('voucherUpdate', { voucher: updated.toObject(), cementSyncResult });
    } catch (_) {}

    res.json({ success: true, voucher: updated, cementSyncResult });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// DELETE /voucher/:id — Delete a voucher
router.delete("/:id", auth, async (req, res) => {
  try {
    const voucher = await Voucher.findById(req.params.id);
    if (!voucher) {
      return res
        .status(404)
        .json({ success: false, error: "Voucher not found." });
    }

    // Reverse contribution from Cement Register
    await reverseVoucherFromCement(voucher);

    await Voucher.findByIdAndDelete(req.params.id);

    // Emit instant expense patch
    emitExpenseUpdate(voucher.date).catch(() => { });

    try {
      const io = getIO();
      if (io) io.emit('voucherDeleted', { voucherId: req.params.id });
    } catch (_) {}

    res.json({ success: true, message: "Voucher deleted successfully." });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /voucher/:id/slip — Upload PDF slip to S3 and save URL on the voucher
router.post("/:id/slip", voucherSlipUpload.single("slip"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file uploaded." });
    }
    const slipUrl = req.file.location;
    const updated = await Voucher.findByIdAndUpdate(
      req.params.id,
      { slip_url: slipUrl },
      { returnDocument: 'after' }
    );
    if (!updated) {
      return res.status(404).json({ success: false, error: "Voucher not found." });
    }

    // Sync slip proof URL to Cement Register if linked
    await syncVoucherSlip(updated._id, slipUrl);

    // Re-sync Cement Register so Site Cash proof URL updates immediately
    resyncCementForVehicle(updated.vehicleNumber, updated.invoiceId || null, updated._id.toString());

    res.json({ success: true, slip_url: slipUrl, voucher: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
