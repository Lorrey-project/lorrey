const mongoose = require('mongoose');
mongoose.connect('mongodb+srv://lorrey0004:lorrey0004@cluster0.pqbigfd.mongodb.net/cement_register?retryWrites=true&w=majority');

function num(val) {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const parsed = parseFloat(String(val).replace(/,/g, ''));
  return isNaN(parsed) ? 0 : parsed;
}

async function run() {
  const db = mongoose.connection;
  const col = db.collection('entries');
  const r = await col.findOne({ "VEHICLE NUMBER": "WB67A4475", "ACTUAL EXTRA": "-34.00" });
  
  const comm = r._freight_commission;
  const isStd = comm === undefined || comm === null || Number(comm) === 0.05;
  const base = isStd ? num(r['BILLING ER 95%']) : num(r['BILLING ER VAR']);
  
  const netAmount = base
    - num(r['TDS@1%'])
    - num(r.ADVANCE)
    - num(r['Site Cash'])
    - num(r['OFFICE CASH'])
    - num(r['Bank TF'])
    - num(r['Others deduction'])
    - num(r['GPS Monitoring Charge'])
    - num(r['GPS DEVICE'])
    - num(r['RFID TAG'])
    - num(r['RFID REASSURANCE'])
    - num(r['FASTAG'])
    - num(r['HSD AMOUNT'])
    - num(r['TRAVELLING EXP'])
    - num(r['SHORTAGE (AMOUNT)'])
    - num(r['Other']);
    
  console.log('Net Amount calculated:', netAmount);
  console.log('DB SHORTAGE (AMOUNT):', r['SHORTAGE (AMOUNT)']);
  
  // Calculate if SHORTAGE (AMOUNT) was 0
  const netAmountWithoutShortage = base
    - num(r['TDS@1%'])
    - num(r.ADVANCE)
    - num(r['Site Cash'])
    - num(r['OFFICE CASH'])
    - num(r['Bank TF'])
    - num(r['Others deduction'])
    - num(r['GPS Monitoring Charge'])
    - num(r['GPS DEVICE'])
    - num(r['RFID TAG'])
    - num(r['RFID REASSURANCE'])
    - num(r['FASTAG'])
    - num(r['HSD AMOUNT'])
    - num(r['TRAVELLING EXP'])
    - 0 // SHORTAGE (AMOUNT) = 0
    - num(r['Other']);
    
  console.log('Net Amount if Shortage=0:', netAmountWithoutShortage);
  
  process.exit(0);
}
run();
