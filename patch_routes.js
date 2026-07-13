const fs = require('fs');
let code = fs.readFileSync('backend-node/routes/financialYearRoutes.js', 'utf8');
code = code.replace(
  "const [allCement, rowOverrides, payments] = await Promise.all([",
  "console.log('pending-bills party:', party);\n    const [allCement, rowOverrides, payments] = await Promise.all(["
);
code = code.replace(
  "pendingBills.push({",
  "console.log('Pushing to pending bills:', r.invoiceNumber);\n        pendingBills.push({"
);
code = code.replace(
  "res.json({ pendingBills });",
  "console.log('Returning pendingBills length:', pendingBills.length);\n    res.json({ pendingBills });"
);
fs.writeFileSync('backend-node/routes/financialYearRoutes.js', code);
