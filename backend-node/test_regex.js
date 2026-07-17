const mongoose = require('mongoose');
mongoose.connect('mongodb+srv://lorrey0004:lorrey0004@cluster0.pqbigfd.mongodb.net/invoiceAI?retryWrites=true&w=majority').then(async () => {
  const col = mongoose.connection.useDb('pump_payment_register').collection('records');
  const records = await col.find({}).toArray();
  for (let r of records) {
    if (r.PERIOD) {
       console.log('PERIOD:', JSON.stringify(r.PERIOD));
       const rgx = new RegExp("\\." + "06" + "\\.");
       console.log('Matches .06.:', rgx.test(r.PERIOD));
    }
  }
  process.exit(0);
}).catch(console.error);
