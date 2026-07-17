const mongoose = require('mongoose');
async function test() {
  await mongoose.connect('mongodb+srv://lorrey0004:lorrey0004@cluster0.pqbigfd.mongodb.net/invoiceAI?retryWrites=true&w=majority');
  
  const cementCol = mongoose.connection.useDb("cement_register").collection("entries");
  const cement = await cementCol.find({
      $or: [
          { 'BILL NO': { $regex: '25-26/0001' } },
          { 'INVOICE NO': { $regex: '25-26/0001' } },
          { 'UNLOADING BILL NO': { $regex: '25-26/0001' } }
      ]
  }).toArray();
  
  console.log('Cement entries:', cement.map(r => ({
      billNo: r['BILL NO'],
      unloadingBillNo: r['UNLOADING BILL NO'],
      billDate: r['BILL DATE'],
      loadingDt: r['LOADING DT'],
      uInvDate: r['UNLOADING BILL DATE']
  })));

  mongoose.disconnect();
}
test();
