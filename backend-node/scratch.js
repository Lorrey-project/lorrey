require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/lorreyproject").then(async () => {
    const db = mongoose.connection.useDb("invoice_system");
    const truckCol = db.collection("Truck Contact Number");
    const record = await truckCol.findOne({ "Truck No": /WB39B8879/i });
    console.log("With space or exact pattern regex:", await truckCol.findOne({ "Truck No": /WB39B8879/i }));
    
    // Also try without regex just in case
    const record2 = await truckCol.findOne({ $or: [{truck_no: /WB39B8879/i}, {"Truck No": /wb39/i}]});
    console.log("General search:", record2);
    
    process.exit();
}).catch(console.error);
