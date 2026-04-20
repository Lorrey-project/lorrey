const mongoose = require("mongoose");
require("dotenv").config();

mongoose.connect(process.env.MONGO_URI)
.then(async () => {
  const invoiceSystemDb = mongoose.connection.useDb("invoice_system");
  const TruckContact = invoiceSystemDb.collection("Truck Contact Number");
  const doc = await TruckContact.findOne({});
  console.log(doc);
  process.exit(0);
})
.catch(console.error);
