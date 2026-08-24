require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    try {
      const email = 'office0004@gmail.com';
      const user = await User.findOne({ email });
      console.log("User role:", user.role);
      
      const isMatch = await bcrypt.compare('password123', user.password);
      console.log("Password match:", isMatch);
      
      const token = jwt.sign(
        { userId: user._id, role: user.role, pumpName: user.pumpName || null },
        process.env.JWT_SECRET || "your_jwt_secret_key",
        { expiresIn: "1h" }
      );
      console.log("JWT generated:", !!token);
    } catch (e) {
      console.error("Exception thrown:", e);
    }
    process.exit(0);
  });
