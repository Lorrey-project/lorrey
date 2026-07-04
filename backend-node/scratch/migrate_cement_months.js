const { MongoClient } = require('mongodb');

const parseToDate = (dStr) => {
  if (!dStr) return null;
  const clean = String(dStr).trim();
  const parts = clean.split(/[-\/\.]/);
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    let year = parseInt(parts[2], 10);
    if (parts[2].length === 2) {
      year += (year >= 70 ? 1900 : 2000);
    }
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) return date;
  }
  return null;
};

async function run() {
  const uri = 'mongodb+srv://lorrey0004:lorrey0004@cluster0.pqbigfd.mongodb.net/?retryWrites=true&w=majority';
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('cement_register');
    const col = db.collection('entries');
    
    const docs = await col.find().toArray();
    let updatedCount = 0;

    const bulkOps = [];
    
    for (const d of docs) {
      if (d.month && d.year) continue; // Already migrated
      
      const dateStr = d['LOADING DT'] || d['LOADING DATE'] || d['BILL DATE'] || d['RECEIVING DATE'] || d['INVOICE DATE'];
      if (!dateStr) continue;

      const dateObj = parseToDate(dateStr);
      if (dateObj) {
        // month is 1-12
        const month = dateObj.getMonth() + 1;
        const year = dateObj.getFullYear();
        
        bulkOps.push({
          updateOne: {
            filter: { _id: d._id },
            update: { $set: { month, year } }
          }
        });
        updatedCount++;
      }
    }
    
    if (bulkOps.length > 0) {
      const res = await col.bulkWrite(bulkOps);
      console.log(`Successfully migrated ${res.modifiedCount} records (out of ${bulkOps.length} ops). Total matched docs: ${updatedCount}`);
    } else {
      console.log('No records needed migration.');
    }
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await client.close();
  }
}

run();
