const mongoose = require('mongoose');

async function run() {
  await mongoose.connect('mongodb+srv://lorrey0004:lorrey0004@cluster0.pqbigfd.mongodb.net/invoiceAI?retryWrites=true&w=majority');
  console.log('Connected to mongoose');
  const collection = mongoose.connection.useDb('cement_register').collection('entries');
  
  const sample = await collection.findOne({
    'SITE': { $regex: /^NVCL$/i },
    'CHALLAN STATUS': { $regex: /^BILLED$/i }
  });
  if (sample) console.log('Keys:', Object.keys(sample));
  if (sample) console.log('Sample:', sample);
  
  await mongoose.disconnect();
}
run().catch(console.error);
