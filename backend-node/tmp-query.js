const mongoose = require("mongoose");
require("dotenv").config({path: "/Users/gourabdutta/Desktop/lorrey-project-code 2/backend-node/.env"});

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    const db = mongoose.connection.useDb("invoice_system");
    const TruckContact = require("/Users/gourabdutta/Desktop/lorrey-project-code 2/backend-node/models/TruckContact");
    const docs = await TruckContact.find({}).limit(3).lean();
    console.log("Documents:", JSON.stringify(docs, null, 2));
    process.exit(0);
  });
