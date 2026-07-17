const mongoose = require('mongoose');

function calculatePeriod(rawDate) {
  let period = '';
  let dateObj = null;
  if (rawDate instanceof Date && !isNaN(rawDate)) {
    dateObj = rawDate;
  } else {
    const str = String(rawDate).trim();
    const match = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
    if (match) {
      const d = parseInt(match[1]), m = parseInt(match[2]);
      let y = parseInt(match[3]);
      if (y < 100) y += 2000;
      dateObj = new Date(y, m - 1, d);
    } else {
      const iso = new Date(str);
      if (!isNaN(iso.getTime())) dateObj = iso;
    }
  }
  if (dateObj) {
    const d = dateObj.getDate();
    if (d >= 1 && d <= 10) {
      period = `Period 1`;
    } else if (d >= 11 && d <= 20) {
      period = `Period 2`;
    } else {
      period = `Period 3`;
    }
  }
  return period;
}

mongoose.connect('mongodb+srv://lorrey0004:lorrey0004@cluster0.pqbigfd.mongodb.net/invoiceAI?retryWrites=true&w=majority').then(async () => {
  const regDb = mongoose.connection.useDb('pump_payment_register');
  const regCol = regDb.collection('records');
  
  const records = await regCol.find({ PERIOD: { $regex: /^Period/ } }).toArray();
  for (const r of records) {
    let newPeriod = '';
    // Just extract Period 1, Period 2, or Period 3 from the existing string
    const match = r.PERIOD.match(/^(Period \d)/);
    if (match) {
      newPeriod = match[1];
      console.log(`Setting ${r['BILL NO']} to ${newPeriod}`);
      await regCol.updateOne({ _id: r._id }, { $set: { PERIOD: newPeriod } });
    }
  }

  console.log('Fixed DB records for PERIOD.');
  process.exit(0);
}).catch(console.error);
