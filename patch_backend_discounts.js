const fs = require('fs');
let code = fs.readFileSync('backend-node/routes/pumpPaymentRoutes.js', 'utf8');

const newRoutes = `

// ── GET /pump-payment/cash-discounts ─────────────────────────────────────────────
// Returns full history of cash discounts for each pump.
router.get("/cash-discounts", auth, async (req, res) => {
  try {
    const col = mongoose.connection.useDb("pump_payment").collection("cash_discounts");
    const history = await col.find({}).sort({ effectiveDate: -1 }).toArray();
    
    // Group by pumpName for easier UI consumption
    const grouped = {};
    const latestDiscounts = {};
    const pumps = ["SAS-1", "SAS-2"];
    pumps.forEach(p => {
      const pumpHistory = history.filter(r => r.pumpName === p);
      grouped[p] = pumpHistory;
      latestDiscounts[p] = pumpHistory.length > 0 ? pumpHistory[0].discount : 0;
    });
    
    res.json({ success: true, history: grouped, discounts: latestDiscounts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /pump-payment/cash-discounts ─────────────────────────────────────────────
// Add or update a cash discount for a specific date (HEAD_OFFICE only).
// Body: { pumpName: "SAS-1", discount: 1.5, effectiveDate: "2026-04-24" }
router.put("/cash-discounts", auth, async (req, res) => {
  try {
    if (req.user.role !== "HEAD_OFFICE") {
      return res.status(403).json({ success: false, error: "Only Head Office can update cash discounts." });
    }
    const { pumpName, discount, effectiveDate } = req.body;
    if (!pumpName || discount === undefined || !effectiveDate) {
      return res.status(400).json({ success: false, error: "pumpName, discount, and effectiveDate are required." });
    }
    const numDiscount = parseFloat(discount);
    const date = new Date(effectiveDate);
    date.setHours(0,0,0,0); // normalize to start of day

    if (isNaN(numDiscount) || numDiscount < 0) {
      return res.status(400).json({ success: false, error: "Discount must be a positive number." });
    }
    if (isNaN(date.getTime())) {
      return res.status(400).json({ success: false, error: "Invalid date format." });
    }

    const col = mongoose.connection.useDb("pump_payment").collection("cash_discounts");

    // Upsert logic: find existing record for this exact date (normalized) and pump
    const startOfDay = new Date(date);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const existing = await col.findOne({
      pumpName,
      effectiveDate: { $gte: startOfDay, $lte: endOfDay }
    });

    if (existing) {
      await col.updateOne(
        { _id: existing._id },
        { $set: { discount: numDiscount, updatedBy: req.user.email, updatedAt: new Date() } }
      );
    } else {
      await col.insertOne({
        pumpName,
        discount: numDiscount,
        effectiveDate: date,
        createdBy: req.user.email,
        createdAt: new Date()
      });
    }

    res.json({ success: true, message: "Cash discount updated successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
`;

code += newRoutes;
fs.writeFileSync('backend-node/routes/pumpPaymentRoutes.js', code);
console.log('Backend patched with cash-discounts routes');
