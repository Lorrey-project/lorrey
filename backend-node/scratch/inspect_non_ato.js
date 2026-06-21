const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    const db = mongoose.connection.useDb('cement_register');
    const col = db.collection('entries');
    
    const nonAtoEntries = await col.find({
      "_is_ato": false,
      "LOADING DT": { $regex: /-03-2026/ }
    }).toArray();
    
    console.log(`=== NON-ATO DATABASE ENTRIES: ${nonAtoEntries.length} ===`);
    nonAtoEntries.slice(0, 5).forEach((e, idx) => {
      console.log(`Entry ${idx} (${e["VEHICLE NUMBER"]}):`, {
        "LOADING DT": e["LOADING DT"],
        "WHEEL": e["WHEEL"],
        "MT": e["MT"],
        "BILLING": e["BILLING"],
        "PARTY RATE": e["PARTY RATE"],
        "Billing Amount": e["Billing Amount"],
        "DEDICATED": e["DEDICATED"],
        "10W EXTRA 8.5%": e["10W EXTRA 8.5%"]
      });
    });
    
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
