const mongoose = require('mongoose');

mongoose.connect('mongodb+srv://lorrey0004:lorrey0004@cluster0.pqbigfd.mongodb.net/invoiceAI?retryWrites=true&w=majority').then(async () => {
  const db1 = mongoose.connection.useDb('invoiceAI').collection('cement_registers');
  const db2 = mongoose.connection.useDb('lorrey_db').collection('cement_registers');
  
  const rec1 = await db1.findOne({ 'VEHICLE NUMBER': 'WB39A9434' });
  if (rec1) console.log('invoiceAI:', typeof rec1._id, rec1._id, rec1['LOADING DT'], rec1['LOADING DATE']);
  
  const rec2 = await db2.findOne({ 'VEHICLE NUMBER': 'WB39A9434' });
  if (rec2) console.log('lorrey_db:', typeof rec2._id, rec2._id, rec2['LOADING DT'], rec2['LOADING DATE']);

  process.exit(0);
}).catch(console.error);
