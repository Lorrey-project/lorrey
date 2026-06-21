const XLSX = require('xlsx');
const workbook = XLSX.readFile('/Users/soumodeeproy/Desktop/2026 all invoices/CEMENT REGISTER & INCENTIVE MAR\'26.xlsx');
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });

aoa.forEach((row, idx) => {
  const rowStr = JSON.stringify(row);
  if (rowStr.includes('WB39A6898')) {
    console.log(`Row index ${idx} contains WB39A6898:`, row);
  }
});
