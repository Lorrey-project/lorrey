const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

console.log("Connecting to MONGO_URI:", process.env.MONGO_URI ? "Found" : "NOT FOUND");

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("Connected to MongoDB successfully!");
    const db = mongoose.connection.useDb('cement_register');
    const col = db.collection('entries');
    
    const ruhulEntries = await col.find({
      "VEHICLE NUMBER": "WB39A5858",
      "LOADING DT": { $regex: /-03-2026/ }
    }).toArray();
    
    console.log(`=== RUHUL SK (WB39A5858) DATABASE ENTRIES: ${ruhulEntries.length} ===`);
    ruhulEntries.forEach((e, idx) => {
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
        "DEDICATED": e["DEDICATED"],
        "10W EXTRA 8.5%": e["10W EXTRA 8.5%"],
        "OWNER NAME": e["OWNER NAME"],
        "_is_ato": e["_is_ato"]
      });
    });
    
    const udayEntries = await col.find({
      "VEHICLE NUMBER": "WB29A8166",
      "LOADING DT": { $regex: /-03-2026/ }
    }).toArray();
    console.log(`\n=== UDAY MALIK (WB29A8166) DATABASE ENTRIES: ${udayEntries.length} ===`);
    udayEntries.forEach((e, idx) => {
      console.log(`Entry ${idx}:`, {
        "LOADING DT": e["LOADING DT"],
        "MT": e["MT"],
        "BILLING": e["BILLING"],
        "DEDICATED": e["DEDICATED"],
        "10W EXTRA 8.5%": e["10W EXTRA 8.5%"]
      });
    });

    process.exit(0);
  })
  .catch(err => {
    console.error("Connection error:", err);
    process.exit(1);
  });
