const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    const db = mongoose.connection.useDb('cement_register');
    const col = db.collection('incentive_states');
    const state = await col.findOne({ year: 2026, month: 2 });
    if (!state) {
      console.log("No state found for March 2026");
      process.exit(0);
    }
    console.log("Excel Name:", state.excelName);
    console.log("Excel Data length (rows):", state.excelData ? state.excelData.length : "null");
    if (state.excelData && state.excelData.length > 0) {
      console.log("First 15 rows of Excel Data:");
      state.excelData.slice(0, 15).forEach((row, i) => {
        console.log(`Row ${i}:`, row);
      });
    }
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
