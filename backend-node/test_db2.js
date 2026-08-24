const { MongoClient } = require('mongodb');
async function run() {
  const client = new MongoClient('mongodb+srv://lorrey0004:lorrey0004@cluster0.pqbigfd.mongodb.net/invoiceAI?retryWrites=true&w=majority');
  try {
    await client.connect();
    const cementDb = client.db('cement_register');
    const col = cementDb.collection('entries');
    const doc = await col.findOne({});
    console.log("RAW DOC:", doc);
  } finally {
    await client.close();
  }
}
run();
