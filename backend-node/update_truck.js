const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

async function update() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://admin:admin@cluster0.p712y.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0');
  
  const db = mongoose.connection.useDb("invoice_system");
  const col = db.collection("Truck Contact Number");
  
  await col.updateOne({ truck_no: "WB41P4782" }, { $set: { driver_name: "ABDUL MONDAL (TEST)" } });
  
  console.log("Updated WB41P4782");
  process.exit(0);
}
update();
