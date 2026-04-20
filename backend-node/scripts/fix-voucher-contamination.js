/**
 * One-time fix: clear Site Cash / Office Cash that was pulled from wrong-date vouchers.
 * 
 * Logic:
 *  For every cement register row that has a non-zero Site Cash or Office Cash,
 *  verify whether a voucher actually exists for that truck on that exact loading date.
 *  If NO matching voucher exists for that date → zero out the cash fields.
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const Voucher  = require("../models/Voucher");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");

  const col = mongoose.connection.useDb("cement_register").collection("entries");
  const rows = await col.find({
    $or: [
      { "Site Cash":    { $exists: true, $ne: 0, $ne: "" } },
      { "OFFICE CASH":  { $exists: true, $ne: 0, $ne: "" } },
    ]
  }).toArray();

  console.log(`Checking ${rows.length} rows with cash values...`);
  let fixed = 0;

  for (const row of rows) {
    const vehicleNumber = row["VEHICLE NUMBER"];
    const loadingDtStr  = row["LOADING DT"];  // format: DD-MM-YYYY

    if (!vehicleNumber || !loadingDtStr) continue;

    // Parse loading date
    const parts = loadingDtStr.split("-");
    if (parts.length !== 3) continue;
    const [dd, mm, yyyy] = parts;
    const dayStart = new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
    const dayEnd   = new Date(`${yyyy}-${mm}-${dd}T23:59:59.999Z`);

    const vehicleRegex = new RegExp(`^${vehicleNumber.trim().replace(/\s+/g, "\\s*")}$`, "i");

    // Check if any voucher exists for this truck on this exact day
    const matchingVoucher = await Voucher.findOne({
      vehicleNumber: { $regex: vehicleRegex },
      date: { $gte: dayStart, $lte: dayEnd }
    }).lean();

    if (!matchingVoucher) {
      // No voucher for this date → the cash value is contamination from another day
      const currentSite   = row["Site Cash"];
      const currentOffice = row["OFFICE CASH"];

      if ((currentSite && currentSite !== 0) || (currentOffice && currentOffice !== 0)) {
        console.log(
          `  ✗ Row SL:${row["SL NO"]} Vehicle:${vehicleNumber} Date:${loadingDtStr}` +
          ` — Clearing Site Cash:${currentSite}, Office Cash:${currentOffice}`
        );
        await col.updateOne(
          { _id: row._id },
          { $set: { "Site Cash": 0, "OFFICE CASH": 0, "SITE_CASH_PROOF_URL": "", "OFFICE_CASH_PROOF_URL": "" } }
        );
        fixed++;
      }
    } else {
      console.log(
        `  ✓ Row SL:${row["SL NO"]} Vehicle:${vehicleNumber} Date:${loadingDtStr}` +
        ` — Voucher VCH:${matchingVoucher.voucherNumber} matches correctly`
      );
    }
  }

  console.log(`\nDone. Fixed ${fixed} contaminated row(s).`);
  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
