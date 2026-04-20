require("dotenv").config({ path: "backend-node/.env" });
const mongoose = require("mongoose");
mongoose.connect(process.env.MONGO_URI).then(async () => {
  const c = mongoose.connection.collection("cement_register");
  const doc = await c.findOne({"HSD SLIP NO": "14436"});
  console.log(doc ? doc["VERIFICATION STATUS"] : "Not found");
  process.exit(0);
});
