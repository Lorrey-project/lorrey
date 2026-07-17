const mongoose = require('mongoose');

mongoose.connect('mongodb+srv://lorrey0004:lorrey0004@cluster0.pqbigfd.mongodb.net/invoiceAI?retryWrites=true&w=majority').then(async () => {
  const regDb = mongoose.connection.useDb('pump_payment_register');
  const regCol = regDb.collection('records');
  
  const records = await regCol.find({}).toArray();
  for (const r of records) {
    console.log(`BILL NO: ${r['BILL NO']}, PERIOD: ${r.PERIOD}`);
  }
  process.exit(0);
}).catch(console.error);
