const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    const db = mongoose.connection.useDb('cement_register');
    const col = db.collection('entries');
    
    const entries = await col.find({
      "LOADING DT": { $regex: /-03-2026/ },
      "DEDICATED": { $exists: true, $ne: "", $ne: 0 }
    }).toArray();
    
    console.log(`Total entries with DEDICATED in March 2026: ${entries.length}`);
    
    let smallDedicatedCount = 0;
    entries.forEach((e) => {
      const val = parseFloat(String(e.DEDICATED).replace(/,/g, ''));
      if (val > 0 && val < 200) {
        smallDedicatedCount++;
        console.log(`Small DEDICATED found: ${e["VEHICLE NUMBER"]} | LOADING DT: ${e["LOADING DT"]} | DEDICATED: ${e.DEDICATED} | SITE: ${e.SITE}`);
      }
    });
    console.log(`Total small DEDICATED entries: ${smallDedicatedCount}`);
    
    let small10WCount = 0;
    entries.forEach((e) => {
      const val = parseFloat(String(e["10W EXTRA 8.5%"]).replace(/,/g, ''));
      if (val > 0 && val < 200) {
        small10WCount++;
        console.log(`Small 10W EXTRA found: ${e["VEHICLE NUMBER"]} | 10W EXTRA: ${e["10W EXTRA 8.5%"]}`);
      }
    });
    console.log(`Total small 10W EXTRA entries: ${small10WCount}`);

    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
