const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/cement_register');

async function run() {
  const db = mongoose.connection;
  const col = db.collection('entries');
  const doc = await col.findOne({ "SHORTAGE (AMOUNT)": { $exists: true } });
  console.log(JSON.stringify(doc, null, 2));
  process.exit(0);
}
run();
