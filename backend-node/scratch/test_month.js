require('dotenv').config();
const mongoose = require('mongoose');

async function test() {
  await mongoose.connect(process.env.MONGO_URI);
  const col = mongoose.connection.useDb('cement_register').collection('entries');
  const bills = await col.find({ 'CHALLAN STATUS': { $regex: /BILLED/i } }).limit(5).toArray();
  for (let row of bills) {
      console.log(`Month: ${row.month}, Month (capital): ${row.Month}, invoice: ${row['BILL NO']}`);
  }
  process.exit(0);
}
test();
