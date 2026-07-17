const mongoose = require('mongoose');

mongoose.connect('mongodb+srv://lorrey0004:lorrey0004@cluster0.pqbigfd.mongodb.net/invoiceAI?retryWrites=true&w=majority').then(async () => {
  const regDb = mongoose.connection.useDb('pump_payment_register');
  const regCol = regDb.collection('records');
  
  const pDb = mongoose.connection.useDb('pump_payment');
  const bCol = pDb.collection('generated_bills');
  
  const records = await regCol.find({}).toArray();
  for (const r of records) {
    const bill = await bCol.findOne({ billNumber: r['BILL NO'] });
    if (bill && bill.cementRegisterRecordIds && bill.cementRegisterRecordIds.length > 0) {
      const cementCol = mongoose.connection.useDb('cement_register').collection('entries');
      const cementRecords = await cementCol.find({ _id: { $in: bill.cementRegisterRecordIds } }).toArray();
      
      let totalLtr = 0;
      for (const c of cementRecords) {
        totalLtr += parseFloat(String(c['HSD (LTR)'] || c['HSD (Ltr)'] || '0').replace(/,/g, '')) || 0;
      }
      
      console.log(`Setting LITRE to ${totalLtr} for ${r['BILL NO']}`);
      
      // Update register
      await regCol.updateOne({ _id: r._id }, { $set: { LITRE: totalLtr } });
      
      // Update bill
      await bCol.updateOne({ _id: bill._id }, { $set: { totalFuelQuantity: totalLtr } });
    }
  }

  console.log('Fixed DB records for LITRE.');
  process.exit(0);
}).catch(console.error);
