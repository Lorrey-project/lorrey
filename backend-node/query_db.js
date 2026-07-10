const { MongoClient } = require('mongodb');
async function run() {
  const uri = 'mongodb+srv://lorrey0004:lorrey0004@cluster0.pqbigfd.mongodb.net/invoiceAI?retryWrites=true&w=majority';
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('cement_register');
  const docs = await db.collection('entries').distinct("CHALLAN STATUS");
  console.log(JSON.stringify(docs, null, 2));
  await client.close();
}
run().catch(console.error);
