const XLSX = require('xlsx');

const filePath = '/Users/soumodeeproy/Desktop/2026 all invoices/CEMENT REGISTER & INCENTIVE MAR\'26.xlsx';
const workbook = XLSX.readFile(filePath);
const ws = workbook.Sheets['INCENTIVE DETAILS MAR\'26'];
const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });

aoa.forEach((row, idx) => {
  const rowStr = JSON.stringify(row);
  if (rowStr.includes('WB67A9375')) {
    console.log(`Row ${idx}:`, row);
  }
});
process.exit(0);
