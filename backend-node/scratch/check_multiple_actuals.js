const XLSX = require('xlsx');

const filePath = '/Users/soumodeeproy/Desktop/2026 all invoices/CEMENT REGISTER & INCENTIVE MAR\'26.xlsx';
const workbook = XLSX.readFile(filePath);
const ws = workbook.Sheets['INCENTIVE DETAILS MAR\'26'];
const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });

const countMap = {};
aoa.forEach((row, idx) => {
  if (idx < 3) return;
  const truckNo = row[1]; // Left side truck number is at index 1
  if (!truckNo) return;
  const clean = String(truckNo).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!clean) return;
  
  if (!countMap[clean]) countMap[clean] = [];
  countMap[clean].push({ rowIndex: idx, val: row[5] });
});

console.log("=== TRUCKS WITH MULTIPLE LEFT-SIDE ENTRIES ===");
Object.entries(countMap).forEach(([truck, entries]) => {
  if (entries.length > 1) {
    console.log(`${truck}:`, entries);
  }
});
process.exit(0);
