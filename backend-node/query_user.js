const mongoose = require("mongoose");
const User = require("./backend-node/models/User");

mongoose.connect("mongodb+srv://developer0001:K7x4r4u@gourab-project-lorrey.1j4z3.mongodb.net/lorrey-db?retryWrites=true&w=majority")
  .then(async () => {
    const user = await User.findOne({ email: "office0004@gmail.com" });
    console.log("User found:", user);
    process.exit(0);
  });
