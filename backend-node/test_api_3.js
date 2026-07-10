const mongoose = require('mongoose');
mongoose.connect('mongodb+srv://lorrey0004:lorrey0004@cluster0.pqbigfd.mongodb.net/cement_register?retryWrites=true&w=majority');

async function run() {
  const db = mongoose.connection;
  const col = db.collection('entries');
  const docs = await col.find({ "VEHICLE NUMBER": "WB67A4475", "ACTUAL EXTRA": "-34.00" }).toArray();
  console.log(JSON.stringify(docs, null, 2));
  process.exit(0);
}
run();
