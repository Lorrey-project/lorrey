const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const col = mongoose.connection.useDb('cement_register').collection('entries');
  const countNoDt = await col.countDocuments({ 'LOADING DT': { $exists: false } });
  const countEmptyDt = await col.countDocuments({ 'LOADING DT': '' });
  const countNoSl = await col.countDocuments({ 'SL NO': { $exists: false } });
  const countEmptySl = await col.countDocuments({ 'SL NO': '' });
  
  console.log('LOADING DT:');
  console.log('  missing:', countNoDt);
  console.log('  empty string:', countEmptyDt);
  console.log('SL NO:');
  console.log('  missing:', countNoSl);
  console.log('  empty string:', countEmptySl);
  
  process.exit(0);
});
