const mongoose = require('mongoose');
require('dotenv').config();
mongoose.connect(process.env.MONGO_URI).then(async () => {
  const AccountDetail = require('./models/AccountDetail');
  const docs = await AccountDetail.find({ ledgerName: 'Freight Payment' }).limit(5);
  console.log(docs.map(d => ({ vehicle: d.vehicle, month: d.month, selectedYear: d.selectedYear, withdraw: d.withdraw })));
  process.exit(0);
});
