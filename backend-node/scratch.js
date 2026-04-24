const mongoose = require('mongoose');
mongoose.connect('mongodb+srv://lorrey0004:lorrey0004@cluster0.pqbigfd.mongodb.net/invoiceAI?retryWrites=true&w=majority')
  .then(async () => {
    const col = mongoose.connection.collection('vouchers');
    // Update the 500 voucher for Water created today to be Direct Expense
    const result = await col.updateOne(
      { 
        amount: 500, 
        purpose: 'Water',
        date: { $gte: new Date('2026-04-24T00:00:00Z') }
      },
      { $set: { expenseType: 'Direct Expense' } }
    );
    console.log(`Updated ${result.modifiedCount} voucher.`);
    process.exit(0);
  });
