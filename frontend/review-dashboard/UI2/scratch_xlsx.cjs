const XLSX = require('xlsx');
const workbook = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet([["DATE"], [new Date(2025, 5, 15)]]);
XLSX.utils.book_append_sheet(workbook, ws, "Sheet1");
const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

const wb2 = XLSX.read(buf, { type: 'buffer', cellDates: true });
const aoa = XLSX.utils.sheet_to_json(wb2.Sheets["Sheet1"], { header: 1, raw: false, dateNF: 'DD-MM-YYYY' });
console.log(aoa);
