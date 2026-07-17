const mongoose = require('mongoose');

async function test() {
  await mongoose.connect('mongodb+srv://admin:admin@cluster0.p712y.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0');
  
  const invoiceSystemDb = mongoose.connection.useDb("invoice_system");
  const col = invoiceSystemDb.collection("Truck Contact Number");
  
  // Find one just to see the schema
  const doc = await col.findOne({});
  console.log('Sample Document:', doc);
  
  // Find specifically WB39B8916
  const doc2 = await col.findOne({ $or: [{ "Truck No ": "WB39B8916" }, { "truck_no": "WB39B8916" }] });
  console.log('WB39B8916 Document:', doc2);
  
  process.exit(0);
}
test();
