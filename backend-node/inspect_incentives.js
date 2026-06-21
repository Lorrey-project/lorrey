const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    const db = mongoose.connection.useDb('cement_register');
    const cols = await db.db.listCollections().toArray();
    console.log("Collections in cement_register DB:", cols.map(c => c.name));
    
    const col = db.collection('incentive_states');
    const all = await col.find({}).toArray();
    console.log("Total incentive_states in DB:", all.length);
    if (all.length > 0) {
      all.forEach((s, idx) => {
        console.log(`State ${idx}: year=${s.year}, month=${s.month}, excelName=${s.excelName}, actualsKeys=${Object.keys(s.actuals || {}).length}, hasExcelData=${!!s.excelData}`);
      });
    }
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
