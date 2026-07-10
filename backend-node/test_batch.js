const axios = require('axios');
async function test() {
  try {
    const res = await axios.get('http://localhost:5000/api/cement-register/next-batch-serial?date=2026-04-20');
    console.log(res.data);
  } catch (e) {
    console.error(e.response?.data || e.message);
  }
}
test();
