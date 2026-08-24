const axios = require('axios');
async function test() {
  try {
    const res = await axios.post('http://localhost:3000/auth/login', {
      email: 'office0004@gmail.com',
      password: 'password123',
      role: 'HEAD_OFFICE'
    });
    console.log("Login:", res.data);
  } catch (e) {
    console.error("Login error:", e.response ? e.response.data : e.message);
  }
}
test();
