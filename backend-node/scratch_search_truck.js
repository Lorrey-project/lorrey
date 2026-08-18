const mongoose = require("mongoose");
require("dotenv").config();

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const invoiceSystemDb = mongoose.connection.useDb("invoice_system");
        const TruckContact = invoiceSystemDb.model("TruckContactTemp", new mongoose.Schema({}, { collection: "Truck Contact Number", strict: false }));
        
        const contacts = await TruckContact.find({
            $or: [
                { truck_no: /WB39B9816/i },
                { "Truck No": /WB39B9816/i },
                { truck_no: /9816/i },
                { "Truck No": /9816/i }
            ]
        }).lean();
        console.log("Found matches:");
        console.log(JSON.stringify(contacts, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
};

run();
