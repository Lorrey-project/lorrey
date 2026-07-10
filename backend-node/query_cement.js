const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/lorrey_dashboard').then(async () => {
  const col = mongoose.connection.useDb("cement_register").collection("entries");
  const sample = await col.findOne({});
  console.log(JSON.stringify(sample, null, 2));
  process.exit(0);
});
