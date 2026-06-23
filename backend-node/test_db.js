const mongoose = require('mongoose');
mongoose.connect('mongodb+srv://lorrey0004:lorrey0004@cluster0.pqbigfd.mongodb.net/invoiceAI?retryWrites=true&w=majority')
.then(async () => {
  const db = mongoose.connection;
  const col = db.useDb('cement_register').collection('entries');
  const month = 1;
  const monthStr = String(month).padStart(2, '0');
  const dateRegex = new RegExp(`^\\d{2}[-/\\.]${monthStr}[-/\\.]`);
  const match = {
    $or: [
      { "LOADING DT": dateRegex },
      { "LOADING DATE": dateRegex },
      { "BILL DATE": dateRegex }
    ]
  };
  const vehicles = await col.distinct('VEHICLE NUMBER', match);
  const v2 = await col.distinct('VEHICLE NO', match);
  const allV = [...new Set([...vehicles, ...v2])].filter(Boolean);
  console.log('VEHICLES:', allV.slice(0, 5));
  process.exit(0);
});
