const mongoose = require('mongoose');

async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/lorrey_db');
  console.log('Connected to mongoose');
  const collection = mongoose.connection.useDb('cement_register').collection('entries');
  const count = await collection.countDocuments({
    'SITE': { $regex: /^NVCL$/i },
    'CHALLAN STATUS': { $regex: /^BILLED$/i }
  });
  console.log('Billed NVCL entries count:', count);
  
  const sample = await collection.findOne({
    'SITE': { $regex: /^NVCL$/i },
    'CHALLAN STATUS': { $regex: /^BILLED$/i }
  });
  console.log('Sample billed entry:', sample);
  
  await mongoose.disconnect();
}
run().catch(console.error);
