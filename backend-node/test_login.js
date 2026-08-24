const axios = require('axios');
async function test() {
  try {
    const res = await axios.post('http://localhost:3000/auth/signup', {
      email: 'testlogin@example.com',
      password: 'password123',
      role: 'OFFICE'
    });
    console.log("Signup:", res.data);
  } catch (e) {
    console.error("Signup error:", e.response ? e.response.data : e.message);
  }
  
  try {
    const res2 = await axios.post('http://localhost:3000/auth/login', {
      email: 'testlogin@example.com',
      password: 'password123',
      role: 'OFFICE'
    });
    console.log("Login:", res2.data);
  } catch (e) {
    console.error("Login error:", e.response ? e.response.data : e.message);
  }
}
test();
