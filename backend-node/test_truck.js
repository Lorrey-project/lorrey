const mongoose = require('mongoose');

async function test() {
  await mongoose.connect('mongodb+srv://admin:admin@cluster0.p712y.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0');
  
  const invoiceSystemDb = mongoose.connection.useDb("invoice_system");
  const col = invoiceSystemDb.collection("Truck Contact Number");
  
  const doc2 = await col.findOne({ $or: [{ "Truck No ": "WB39B8916" }, { "truck_no": "WB39B8916" }, { "truck_no": "WB39A9588" }, { "Truck No ": "WB39A9588" }] });
  console.log('Document:', doc2);
  
  process.exit(0);
}
test();
