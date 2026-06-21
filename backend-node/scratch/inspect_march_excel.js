const XLSX = require('xlsx');

const filePath = '/Users/soumodeeproy/Desktop/2026 all invoices/CEMENT REGISTER & INCENTIVE MAR\'26.xlsx';
const workbook = XLSX.readFile(filePath);
const ws = workbook.Sheets['INCENTIVE DETAILS MAR\'26'];

// Let's use the custom sheet parser or a simpler row printer to print the first 10 rows
const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });

console.log("=== FIRST 10 ROWS IN INCENTIVE SHEET ===");
for (let i = 0; i < Math.min(10, aoa.length); i++) {
  console.log(`Row ${i}:`, aoa[i]);
}

console.log("\n=== FINDING RUHUL SK (WB39A5858) ===");
aoa.forEach((row, idx) => {
  const rowStr = JSON.stringify(row);
  if (rowStr.includes('WB39A5858') || rowStr.toUpperCase().includes('RUHUL')) {
    console.log(`Row ${idx}:`, row);
  }
});
