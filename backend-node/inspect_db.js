const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    const col = mongoose.connection.useDb('cement_register').collection('entries');
    const all = await col.find({}).toArray();
    
    const dates = {};
    all.forEach(s => {
      const d = s['LOADING DT'];
      dates[d] = (dates[d] || 0) + 1;
    });
    
    console.log('Date distribution in MongoDB:');
    console.log(dates);
    
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
