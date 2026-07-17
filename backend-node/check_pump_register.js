const mongoose = require('mongoose');
mongoose.connect('mongodb+srv://lorrey0004:lorrey0004@cluster0.pqbigfd.mongodb.net/invoiceAI?retryWrites=true&w=majority').then(async () => {
  const col = mongoose.connection.useDb('pump_payment_register').collection('records');
  const records = await col.find().limit(2).toArray();
  console.log(JSON.stringify(records, null, 2));
  process.exit(0);
});
