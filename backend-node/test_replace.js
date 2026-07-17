const mongoose = require('mongoose');
mongoose.connect('mongodb+srv://lorrey0004:lorrey0004@cluster0.pqbigfd.mongodb.net/invoiceAI?retryWrites=true&w=majority').then(async () => {
  const pumpCol = mongoose.connection.useDb('pump_payment_register').collection('records');
  
  const b = await pumpCol.findOne({ "BILL NO": "SAS/26-27/004" });
  if (b.REF) delete b.REF; // cleanup the nested object from previous test
  b["REF. NO"] = "TEST-REPLACE";
  
  await pumpCol.replaceOne({ _id: b._id }, b);
  
  const updatedBill = await pumpCol.findOne({ "BILL NO": "SAS/26-27/004" });
  console.log("After replaceOne:", updatedBill["REF. NO"]);
  process.exit(0);
});
