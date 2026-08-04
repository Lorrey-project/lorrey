const { MongoClient } = require('mongodb');
require('dotenv').config();

async function main() {
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const db = client.db();
  
  const records = await db.collection('cement_register').aggregate([
    {
      $group: {
        _id: { month: "$month", year: "$year" },
        count: { $sum: 1 }
      }
    }
  ]).toArray();
  
  console.log('cement_register counts:', records);

  await client.close();
}

main().catch(console.error);
