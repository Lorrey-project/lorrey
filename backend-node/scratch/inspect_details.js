const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    const col = mongoose.connection.useDb('cement_register').collection('entries');
    const doc = await col.findOne({ "LOADING DT": { $exists: false } });
    console.log('Document with missing LOADING DT:', JSON.stringify(doc, null, 2));

    const docWithDt = await col.findOne({ "LOADING DT": { $exists: true } });
    console.log('Document with LOADING DT:', JSON.stringify(docWithDt, null, 2));

    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
