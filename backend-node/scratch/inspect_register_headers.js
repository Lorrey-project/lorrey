const XLSX = require('xlsx');

const filePath = '/Users/soumodeeproy/Desktop/2026 all invoices/CEMENT REGISTER & INCENTIVE MAR\'26.xlsx';
const workbook = XLSX.readFile(filePath);
const ws = workbook.Sheets['CEMENT REGISTER MAR\'26'];
const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });

console.log("=== CEMENT REGISTER HEADERS ===");
console.log(aoa[0]);
console.log(aoa[1]);
console.log(aoa[2]);
process.exit(0);
