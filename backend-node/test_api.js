const axios = require('axios');
async function run() {
  const res = await axios.get('http://127.0.0.1:5000/cement-register?month=1&year=2026');
  const entry = res.data.entries.find(e => e['VEHICLE NUMBER'] === 'WB67A4475' && e['ACTUAL EXTRA'] == '-34.00');
  console.log(JSON.stringify(entry, null, 2));
}
run();
