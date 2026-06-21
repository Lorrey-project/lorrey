const mongoose = require('mongoose');

async function run() {
  try {
    await mongoose.connect('mongodb://localhost:27017/cement_register');
    console.log('Connected to DB');
    const db = mongoose.connection.useDb('cement_register');
    
    // Check collections
    const collections = await db.db.listCollections().toArray();
    console.log('Collections:', collections.map(c => c.name));
    
    const col = db.collection('cement_registers');
    const entries = await col.find({ 'VEHICLE NUMBER': /WB23D7766/i }).toArray();
    console.log(`Found ${entries.length} entries for WB23D7766`);
    entries.forEach(e => {
      console.log(`ID: ${e._id}, LOADING DT: ${e['LOADING DT']}, VEHICLE NUMBER: ${e['VEHICLE NUMBER']}`);
    });
    
    mongoose.connection.close();
  } catch (err) {
    console.error(err);
  }
}

run();
