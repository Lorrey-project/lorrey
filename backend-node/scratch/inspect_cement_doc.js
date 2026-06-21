const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/cement_register';

mongoose.connect(MONGO_URI)
  .then(async () => {
    const col = mongoose.connection.useDb('cement_register').collection('entries');
    const doc = await col.findOne({});
    console.log('Sample Document in MongoDB:');
    console.log(JSON.stringify(doc, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
