const mongoose = require('mongoose');

mongoose.connect('mongodb+srv://lorrey0004:lorrey0004@cluster0.pqbigfd.mongodb.net/invoiceAI?retryWrites=true&w=majority').then(async () => {
  const db = mongoose.connection.useDb('cement_register');
  const docs = await db.collection('entries').find({ month: 7, year: 2026 }).limit(10).toArray();
  console.log("July 2026 docs (number):", docs.length);

  const docs2 = await db.collection('entries').find({ month: "7", year: "2026" }).limit(10).toArray();
  console.log("July 2026 docs (string):", docs2.length);

  const count_all = await db.collection('entries').countDocuments();
  console.log("Total docs:", count_all);

  const years = await db.collection('entries').distinct('year');
  console.log("Distinct years:", years);

  const months = await db.collection('entries').distinct('month');
  console.log("Distinct months:", months);

  process.exit();
});
