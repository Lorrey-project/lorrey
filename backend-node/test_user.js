require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    const user = await User.findOne({ email: 'office0004@gmail.com' }).lean();
    console.log("User:", user);
    process.exit(0);
  });
