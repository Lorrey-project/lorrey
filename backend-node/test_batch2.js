const mongoose = require('mongoose');
mongoose.connect('mongodb+srv://lorrey0004:lorrey0004@cluster0.pqbigfd.mongodb.net/cement_register?retryWrites=true&w=majority');

async function run() {
  const db = mongoose.connection;
  const col = db.collection('entries');
  
  const currentFy = '26-27'; // Assuming 2026

  const existing = await col.find({"BILL NO": { $regex: /\d{2}-\d{2}\/\d+$/ }}).toArray();
  let maxSerial = 0;
  
  for (const row of existing) {
     const match = String(row['BILL NO']).match(/(\d{2}-\d{2})\/(\d+)$/);
     if (match) {
       const serial = parseInt(match[2], 10);
       if (match[1] === currentFy) {
         if (serial > maxSerial) {
           maxSerial = serial;
         }
       }
     }
  }
  
  console.log('Max Serial for FY 26-27:', maxSerial);
  process.exit(0);
}
run();
