const mongoose = require('mongoose');
mongoose.connect('mongodb+srv://lorrey0004:lorrey0004@cluster0.pqbigfd.mongodb.net/cement_register?retryWrites=true&w=majority');

async function run() {
  const db = mongoose.connection;
  const col = db.collection('entries');
  const doc = await col.findOne({ "VEHICLE NUMBER": "WB67A4475", "ACTUAL EXTRA": "-34.00" });
  console.log(JSON.stringify(doc, null, 2));
  process.exit(0);
}
run();
