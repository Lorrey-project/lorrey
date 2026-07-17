const mongoose = require('mongoose');

mongoose.connect('mongodb+srv://lorrey0004:lorrey0004@cluster0.pqbigfd.mongodb.net/invoiceAI?retryWrites=true&w=majority').then(async () => {
  const billsDb = mongoose.connection.useDb('pump_payment');
  const billsCol = billsDb.collection('generated_bills');

  const bill = await billsCol.findOne({ billNumber: 'SAS/26-27/001' });
  console.log(bill);

  process.exit(0);
}).catch(console.error);
