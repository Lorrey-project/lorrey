const fs = require('fs');

let content = fs.readFileSync('src/pages/CementRegister.jsx', 'utf8');

const targetStr = `                  let amtStr = r['Billing Amount'] || r['BILLING AMOUNT'] || r['BILLING ER 95%'] || r['BILLING @ 95% (PARTY PAYABLE)'] || r['AMOUNT'];`;
const replacement = `                  let amtStr = r['BILLING AMOUNT'] ?? r['Billing Amount'] ?? r['BILLING ER 95%'] ?? r['BILLING @ 95% (PARTY PAYABLE)'] ?? r['AMOUNT'];
                  console.log("RECORD:", r._id, "RAW:", r, "amtStr:", amtStr);`;

content = content.replace(targetStr, replacement);
fs.writeFileSync('src/pages/CementRegister.jsx', content);
