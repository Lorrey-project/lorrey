const mongoose = require('mongoose');
require('dotenv').config();

async function fixBankTF() {
  await mongoose.connect(process.env.MONGO_URI);
  const col = mongoose.connection.useDb('cement_register').collection('entries');
  
  const result = await col.updateMany(
    { "BANK TF": { $exists: true } },
    { $rename: { "BANK TF": "Bank TF" } }
  );
  
  console.log(`Updated ${result.modifiedCount} documents.`);
  process.exit(0);
}

fixBankTF().catch(console.error);
