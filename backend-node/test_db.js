const mongoose = require('mongoose');

mongoose.connect('mongodb+srv://lorrey0004:lorrey0004@cluster0.pqbigfd.mongodb.net/invoiceAI?retryWrites=true&w=majority').then(async () => {
  const db = mongoose.connection.useDb('lorrey_db');
  const cementCol = db.collection('cement_registers');
  const record = await cementCol.findOne({ 'LOADING DATE': { $exists: true } });
  console.log(record['LOADING DATE']);
  process.exit(0);
}).catch(console.error);
