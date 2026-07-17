const { MongoClient } = require('mongodb');
const uri = "mongodb://localhost:27017";
async function run() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db("pump_payment_register");
  const records = await db.collection("records").find({}).toArray();
  console.log("PUMP PAYMENT REGISTER RECORDS:");
  console.dir(records, { depth: null });
  
  const billsDb = client.db("pump_payment");
  const bills = await billsDb.collection("generated_bills").find({}).toArray();
  console.log("GENERATED BILLS:");
  console.dir(bills, { depth: null });
  
  await client.close();
}
run();
