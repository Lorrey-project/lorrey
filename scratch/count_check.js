require("dotenv").config({ path: "backend-node/.env" });
const mongoose = require("mongoose");

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const cementCol = mongoose.connection.collection("cement_register");
  const stateCol = mongoose.connection.collection("incentive_states");

  console.log("Connected to MongoDB");

  // Let's count cement_register entries for March 2026
  // March is month 3 (in 1-indexed) or 2 (in 0-indexed)? 
  // Let's find out how the loading dates are formatted in the DB.
  const sample = await cementCol.findOne();
  console.log("Sample cement_register document:", sample);

  // Find all documents for March 2026
  // Usually, they are queried by loading date or month/year
  const countAll = await cementCol.countDocuments({});
  console.log("Total cement_register documents:", countAll);

  // Let's print unique months/years in cement_register
  // Since there could be a lot of documents, let's aggregate or do a query
  const sampleMarch = await cementCol.find({
    $or: [
      { month: 3, year: 2026 },
      { month: "3", year: "2026" },
      { "LOADING DT": { $regex: ".*03[-/]2026" } }
    ]
  }).toArray();
  console.log("Found cement_register docs matching March 2026:", sampleMarch.length);

  // Check stateCol (incentive_states) for March 2026
  const stateMarch = await stateCol.findOne({ month: 2, year: 2026 }); // 0-indexed month 2 = March
  console.log("State March 2026 details:", stateMarch ? {
    excelName: stateMarch.excelName,
    hasExcelData: !!stateMarch.excelData,
    excelRowsLength: stateMarch.excelData ? stateMarch.excelData.length : 0,
    actualsKeys: stateMarch.actuals ? Object.keys(stateMarch.actuals).length : 0
  } : "None");

  process.exit(0);
});
