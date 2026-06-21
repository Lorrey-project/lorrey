const XLSX = require('xlsx');

const filePath = '/Users/soumodeeproy/Desktop/2026 all invoices/CEMENT REGISTER & INCENTIVE MAR\'26.xlsx';
const workbook = XLSX.readFile(filePath);
const ws = workbook.Sheets['INCENTIVE DETAILS MAR\'26'];
const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });

let discrepancyCount = 0;
aoa.forEach((row, idx) => {
  if (idx < 3) return; // skip header rows
  const truckNo = row[10];
  if (!truckNo) return;
  
  const totalCol = parseFloat(String(row[17]).replace(/,/g, '')) || 0;
  const extra10w = parseFloat(String(row[18]).replace(/,/g, '')) || 0;
  const excelTotal = parseFloat(String(row[19]).replace(/,/g, '')) || 0;
  
  const calculatedTotal = totalCol + extra10w;
  const diff = excelTotal - calculatedTotal;
  
  if (Math.abs(diff) > 1) {
    discrepancyCount++;
    console.log(`Row ${idx} (${truckNo}): Excel Total = ${excelTotal}, Calculated (Total + 10W) = ${calculatedTotal}, Diff = ${diff}`);
  }
});

console.log(`Total rows with discrepancy between Excel Total and calculated (Total + 10W): ${discrepancyCount}`);
process.exit(0);
