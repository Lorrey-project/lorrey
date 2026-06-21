const XLSX = require('xlsx');
const workbook = XLSX.readFile('/Users/soumodeeproy/Desktop/2026 all invoices/CEMENT REGISTER & INCENTIVE MAR\'26.xlsx');
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });

console.log("Total rows in AOA:", aoa.length);
for (let i = 490; i < aoa.length; i++) {
  const row = aoa[i];
  if (!row) continue;
  // Print non-empty cells
  const nonEmpties = {};
  row.forEach((cell, idx) => {
    if (cell !== '') nonEmpties[idx] = cell;
  });
  console.log(`Row index ${i}:`, nonEmpties);
}
