const { MongoClient } = require('mongodb');
async function run() {
  const client = new MongoClient('mongodb://127.0.0.1:27017');
  await client.connect();
  const db = client.db('cement_register');
  const collection = db.collection('entries');
  const count = await collection.countDocuments({
    'SITE': { $regex: /^NVCL$/i },
    'CHALLAN STATUS': { $regex: /^BILLED$/i }
  });
  console.log('Billed NVCL entries:', count);
  
  const sample = await collection.findOne({
    'SITE': { $regex: /^NVCL$/i },
    'CHALLAN STATUS': { $regex: /^BILLED$/i }
  });
  console.log('Sample billed entry:', sample);
  
  await client.close();
}
run().catch(console.dir);
