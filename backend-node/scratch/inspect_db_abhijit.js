const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    const db = mongoose.connection.useDb('cement_register');
    const col = db.collection('entries');
    
    const entries = await col.find({
      "VEHICLE NUMBER": "WB67A9375",
      "LOADING DT": { $regex: /-03-2026/ }
    }).toArray();
    
    console.log(`=== WB67A9375 DATABASE ENTRIES: ${entries.length} ===`);
    entries.forEach((e, idx) => {
      console.log(`Entry ${idx}:`, {
        _id: e._id,
        "LOADING DT": e["LOADING DT"],
        "SITE": e["SITE"],
        "VEHICLE NUMBER": e["VEHICLE NUMBER"],
        "WHEEL": e["WHEEL"],
        "Bill Type": e["Bill Type"],
        "MT": e["MT"],
        "BILLING": e["BILLING"],
        "PARTY RATE": e["PARTY RATE"],
        "Billing Amount": e["Billing Amount"],
        "DEDICATED": e["DEDICATED"]
      });
    });
    
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
