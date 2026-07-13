const mongoose = require('mongoose');

async function run() {
  await mongoose.connect('mongodb+srv://lorrey0004:lorrey0004@cluster0.pqbigfd.mongodb.net/invoiceAI?retryWrites=true&w=majority');
  const overrides = mongoose.connection.useDb('invoiceAI').collection('financialyearrows');
  const bills = await overrides.find({ billNo: { $in: ['NVCL/26-27-0175', 'NVCL/25-26/0010', 'NVCL/25-26/0011'] } }).toArray();
  console.log(bills);
  await mongoose.disconnect();
}
run().catch(console.error);
