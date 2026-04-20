const mongoose = require('mongoose');
require('dotenv').config();
console.log("Starting script");
mongoose.connect(process.env.MONGO_URI).then(async () => {
  console.log("Connected to MongoDB!");
  const db = mongoose.connection.db;
  const users = await db.collection('users').find({}).toArray();
  console.log(users.length, "users found.");
  users.forEach(u => console.log(u.email, "=>", u.role));
  process.exit();
}).catch(console.error);
