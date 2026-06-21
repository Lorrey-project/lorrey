const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to DB');
    const db = mongoose.connection.useDb('cement_register');
    const col = db.collection('entries');
    
    // Search ignoring spaces, dashes, and other non-alphanumeric chars
    const entries = await col.find({}).toArray();
    console.log(`Total entries in DB: ${entries.length}`);
    
    const matches = entries.filter(e => {
      const num = String(e['VEHICLE NUMBER'] || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      return num.includes('WB23D7766') || 'WB23D7766'.includes(num);
    });
    
    console.log(`Found ${matches.length} matches for WB23D7766 ignoring format`);
    matches.forEach(e => {
      console.log(`ID: ${e._id}, LOADING DT: ${e['LOADING DT']}, VEHICLE NUMBER: '${e['VEHICLE NUMBER']}'`);
    });
    
    mongoose.connection.close();
  } catch (err) {
    console.error(err);
  }
}

run();
