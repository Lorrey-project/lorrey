const mongoose = require('mongoose');
mongoose.connect('mongodb+srv://lorrey0004:lorrey0004@cluster0.pqbigfd.mongodb.net/invoiceAI?retryWrites=true&w=majority').then(async () => {
  const registerCol = mongoose.connection.useDb('pump_payment_register').collection('records');
  const record = await registerCol.findOne({ 'BILL NO': 'SAS/26-27/004' });
  if (record) {
    await registerCol.updateOne(
      { 'BILL NO': 'SAS/26-27/004' },
      { $set: { 'PERIOD': 'Period 1\n01.07.26 - 10.07.26' } }
    );
    console.log('Updated');
  } else {
    console.log('Not found');
  }
  process.exit(0);
});
