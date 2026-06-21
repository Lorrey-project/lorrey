const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/cement_register';

mongoose.connect(MONGO_URI)
  .then(async () => {
    const col = mongoose.connection.useDb('cement_register').collection('entries');
    
    const monthStr = '01';
    const yearStr = '2026';
    const yr2 = '26';
    const dateRegex = new RegExp(`^\\d{2}[-/\\.]${monthStr}[-/\\.](${yearStr}|${yr2})`);
    
    const filter = {
      $or: [
        { "LOADING DT": { $regex: dateRegex } },
        { "LOADING DATE": { $regex: dateRegex } }
      ]
    };
    
    const count = await col.countDocuments(filter);
    console.log('Filtered Count in MongoDB:', count);
    
    const all = await col.find(filter).toArray();
    console.log('Total documents retrieved:', all.length);
    
    const dates = {};
    all.forEach(s => {
      const d = s['LOADING DT'] || s['LOADING DATE'];
      dates[d] = (dates[d] || 0) + 1;
    });
    console.log('Date distribution in filtered documents:');
    console.log(dates);
    
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
