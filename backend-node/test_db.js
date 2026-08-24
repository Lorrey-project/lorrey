const { MongoClient } = require('mongodb');
async function run() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('lorrey');
  const doc = await db.collection('cement_register').findOne({ "BILL NO": { $exists: true, $ne: "" } });
  console.log(JSON.stringify(doc, null, 2));
  client.close();
}
run();
