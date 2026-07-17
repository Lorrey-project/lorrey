const mongoose = require('mongoose');

mongoose.connect('mongodb+srv://lorrey0004:lorrey0004@cluster0.pqbigfd.mongodb.net/invoiceAI?retryWrites=true&w=majority').then(async () => {
  const db = mongoose.connection.useDb('pump_payment_register');
  const regCol = db.collection('records');
  
  // Update register records
  await regCol.updateMany(
    { 'BILL AMOUNT': 30 },
    { $set: { 'BILL AMOUNT': 30875, 'PAYABLE AMOUNT': 30875, 'DUE AMOUNT': 30875 } }
  );
  
  const billsDb = mongoose.connection.useDb('pump_payment');
  const billsCol = billsDb.collection('generated_bills');
  
  // Update generated bills
  const bills = await billsCol.find({ totalBillingAmount: 30 }).toArray();
  for (const bill of bills) {
    let newTotalAmt = 0;
    bill.records.forEach(r => {
      if (r.fuelAmt === 16) r.fuelAmt = 15675;
      if (r.fuelAmt === 9) r.fuelAmt = 9500;
      if (r.fuelAmt === 5) r.fuelAmt = 5700;
      newTotalAmt += r.fuelAmt;
    });
    if (newTotalAmt > 0) {
      await billsCol.updateOne(
        { _id: bill._id },
        { $set: { totalBillingAmount: newTotalAmt, records: bill.records } }
      );
    }
  }

  console.log('Fixed DB records.');
  process.exit(0);
}).catch(console.error);
