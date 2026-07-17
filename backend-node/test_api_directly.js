const axios = require('axios');

async function test() {
  try {
    const res = await axios.get('http://localhost:3000/fy-details/data?fy=2026-27', {
      headers: {
        // Need to simulate a token or bypass auth...
      }
    });
    console.log(res.data.rows.length);
  } catch (err) {
    console.error(err.message);
  }
}
test();
