const axios = require('axios');

async function run() {
  try {
    console.log("Signing up...");
    let res = await axios.post("http://localhost:3000/auth/signup", {
      email: "admin@test.com", password: "password", role: "OFFICE"
    });
    console.log(res.data);
  } catch (e) {
    if (e.response && e.response.status === 400) {
      console.log("User already exists. Logging in...");
    } else {
        console.error(e.response ? e.response.data : e.message);
    }
  }

  try {
    let loginRes = await axios.post("http://localhost:3000/auth/login", {
      email: "admin@test.com", password: "password", role: "OFFICE"
    });
    console.log("Login Success");
    const token = loginRes.data.token;
    
    console.log("Fetching invoices...");
    let invRes = await axios.get("http://localhost:3000/invoice/all", { headers: { Authorization: `Bearer ${token}` }});
    console.log("Invoices:", invRes.data.length);

    console.log("Fetching vouchers...");
    let vouRes = await axios.get("http://localhost:3000/voucher", { headers: { Authorization: `Bearer ${token}` }});
    console.log("Vouchers:", vouRes.data.vouchers ? vouRes.data.vouchers.length : vouRes.data);
    
  } catch (e) {
    console.error("Error:", e.response ? e.response.data : e.message);
  }
}
run();
