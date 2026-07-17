const axios = require('axios');

async function test() {
  try {
    const loginRes = await axios.post('http://localhost:5000/auth/login', { username: 'dipali', password: 'password' }); // Or whatever the credentials are... wait, I don't know the password!
  } catch (err) {
    console.error(err);
  }
}
test();
