require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    // Delete if exists
    await User.deleteOne({ email: 'test_ho@example.com' });

    // Create Head Office user
    const user = new User({
      email: 'test_ho@example.com',
      password: 'password123', // will be hashed by pre-save
      role: 'HEAD_OFFICE',
      status: 'active'
    });
    await user.save();
    console.log("Created test_ho@example.com");

    const axios = require('axios');
    try {
      const res = await axios.post('http://localhost:3000/auth/login', {
        email: 'test_ho@example.com',
        password: 'password123',
        role: 'HEAD_OFFICE'
      });
      console.log("Login success:", res.data);
    } catch (e) {
      console.error("Login error:", e.response ? e.response.data : e.message);
    }
    process.exit(0);
  });
