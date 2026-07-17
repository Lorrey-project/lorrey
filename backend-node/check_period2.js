const mongoose = require('mongoose');

mongoose.connect('mongodb+srv://lorrey0004:lorrey0004@cluster0.pqbigfd.mongodb.net/invoiceAI?retryWrites=true&w=majority').then(async () => {
  const cementCol = mongoose.connection.useDb('lorrey_db').collection('cement_registers');
  const billsDb = mongoose.connection.useDb('pump_payment');
  const billsCol = billsDb.collection('generated_bills');

  // Let's get the generated bill directly to find the cement register IDs
  const bill = await billsCol.findOne({ billNumber: 'SAS/26-27/001' });
  if (bill && bill.cementRegisterRecordIds) {
    const cementRecords = await cementCol.find({ _id: { $in: bill.cementRegisterRecordIds } }).toArray();
    for (const c of cementRecords) {
      console.log('LOADING DT:', c['LOADING DT'], 'LOADING DATE:', c['LOADING DATE']);
    }
  } else {
    console.log('Bill 001 not found or no cement ids');
  }

  process.exit(0);
}).catch(console.error);
