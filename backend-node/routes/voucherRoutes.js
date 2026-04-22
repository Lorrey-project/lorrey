const express = require("express");
const router = express.Router();
const Voucher = require("../models/Voucher");
const Invoice = require("../models/Invoice");
const TruckContact = require("../models/TruckContact");
const voucherSlipUpload = require("../middleware/voucherSlipUpload");
const { getIO } = require("../socket");
const { pushToRegister, syncVoucherDummy } = require("../utils/syncManager");
const auth = require("../middleware/authMiddleware");

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
    for (const c of contacts) {
      const name = (c.owner_name || c["Owner Name"] || c["Owner Name "] || c.Owner_Name || "").trim();
      const truck = (c.truck_no || c["Truck No"] || c["Truck No "] || c.Truck_No || "").trim();
      
      if (!name || !truck) continue;
      
      if (!ownerMap[name]) ownerMap[name] = [];
      if (!ownerMap[name].includes(truck)) ownerMap[name].push(truck);
    }

    // Sort owner names alphabetically
    const names = Object.keys(ownerMap).sort();
    // All vehicles flat list (sorted)
    const vehicles = [...new Set(contacts.map(c => (c.truck_no || "").trim()).filter(Boolean))].sort();

    res.json({ success: true, names, vehicles, ownerMap });
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
      const { vehicleNumber, date, amount, purpose, name, reason, invoiceId } = req.body;

      // Always generate server-side; ignore any client-supplied voucherNumber
      const vNum = await generateVoucherNumber();

      // ALWAYS derive the role from the verified JWT — never trust the client body.
      // This prevents stale tokens or malicious clients from spoofing the role.
      const roleFromToken = req.user?.role || "OFFICE";

      const voucher = new Voucher({
        voucherNumber: vNum,
        vehicleNumber,
        date,
        amount,
        purpose: purpose || "Others",
        name: name || "",
        reason: reason || "",
        invoiceId: invoiceId || null,
        createdByRole: roleFromToken,
      });

      await voucher.save();

      // Notify Main Cashbook listeners that a new voucher was created
      try {
        const io = getIO();
        io.emit('voucherCreated', { voucher: voucher.toObject() });
      } catch (_) { /* socket not critical */ }

      // Re-sync Cement Register so Site Cash column updates immediately
      resyncCementForVehicle(vehicleNumber, invoiceId || null, voucher._id.toString());

      return res.status(201).json({ success: true, voucher });
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
router.put("/:id", async (req, res) => {
  try {
    const { vehicleNumber, date, amount, purpose, voucherNumber, remarks, invoiceId } = req.body;
    const updated = await Voucher.findByIdAndUpdate(
      req.params.id,
      { vehicleNumber, date, amount, purpose, voucherNumber, remarks, invoiceId },
      { returnDocument: 'after', runValidators: true }
    );
    if (!updated) {
      return res
        .status(404)
        .json({ success: false, error: "Voucher not found." });
    }
    
    // Trigger sync for potential dummy row updates
    resyncCementForVehicle(updated.vehicleNumber, updated.invoiceId || null, updated._id.toString());

    res.json({ success: true, voucher: updated });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// DELETE /voucher/:id — Delete a voucher
router.delete("/:id", async (req, res) => {
  try {
    const deleted = await Voucher.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res
        .status(404)
        .json({ success: false, error: "Voucher not found." });
    }
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

    // Re-sync Cement Register so Site Cash proof URL updates immediately
    resyncCementForVehicle(updated.vehicleNumber, updated.invoiceId || null, updated._id.toString());

    res.json({ success: true, slip_url: slipUrl, voucher: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
