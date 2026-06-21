const XLSX = require('xlsx');
const workbook = XLSX.readFile('/Users/soumodeeproy/Desktop/2026 all invoices/CEMENT REGISTER & INCENTIVE MAR\'26.xlsx');
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

let headerRowIdx = -1;
let maxMatches = 0;
let bestHeaders = [];

for (let i = 0; i < Math.min(15, data.length); i++) {
  const row = data[i];
  if (!row || row.length === 0) continue;
  let matches = 0;
  row.forEach(cell => {
    if (cell && typeof cell === 'string' && cell.length > 1) matches++;
  });
  if (matches > maxMatches) {
    maxMatches = matches;
    headerRowIdx = i;
    bestHeaders = row;
  }
}

console.log("Found Header Row at index:", headerRowIdx);
bestHeaders.forEach((header, idx) => {
  if (header) console.log(`${idx}: ${header.replace(/\n/g, ' ')}`);
});
