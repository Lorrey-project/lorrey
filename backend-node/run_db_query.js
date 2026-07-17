const mongoose = require('mongoose');
mongoose.connect('mongodb+srv://lorrey0004:lorrey0004@cluster0.pqbigfd.mongodb.net/invoiceAI?retryWrites=true&w=majority').then(async () => {
  const db = mongoose.connection.useDb('lorrey_db'); // or invoiceAI
  const colls = await db.listCollections().toArray();
  console.log(colls.map(c => c.name));
  process.exit(0);
}).catch(console.error);
