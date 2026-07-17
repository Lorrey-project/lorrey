const fs = require('fs');
const content = fs.readFileSync('frontend/review-dashboard/UI2/src/pages/FinancialYearDetails.jsx', 'utf8');
const blocks = [];
const regex = /<<<<<<< HEAD\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>> [^\n]+\n/g;
let match;
let i = 1;
while ((match = regex.exec(content)) !== null) {
  console.log(`\n\n--- CONFLICT ${i} ---`);
  console.log("=== HEAD ===");
  console.log(match[1].trim());
  console.log("=== THEIRS ===");
  console.log(match[2].trim());
  i++;
}
