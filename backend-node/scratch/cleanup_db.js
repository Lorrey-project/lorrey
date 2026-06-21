const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const col = mongoose.connection.useDb('cement_register').collection('entries');
  const countBefore = await col.countDocuments({});
  console.log('Total documents before delete:', countBefore);
  
  const res = await col.deleteMany({ 'LOADING DT': { $exists: false } });
  console.log('Deleted documents:', res.deletedCount);
  
  const countAfter = await col.countDocuments({});
  console.log('Total documents after delete:', countAfter);
  
  process.exit(0);
});
