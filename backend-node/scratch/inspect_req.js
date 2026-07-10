const mongoose = require('mongoose');
require('dotenv').config();
mongoose.connect(process.env.MONGO_URI).then(async () => {
  const AccountDetail = require('./models/AccountDetail');
  const docs = await AccountDetail.find({ vehicle: { \$ne: '' } }).sort({ createdAt: -1 }).limit(1);
  console.log(docs);
  process.exit(0);
});
