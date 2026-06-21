const XLSX = require('xlsx');
const workbook = XLSX.readFile('/Users/soumodeeproy/Desktop/2026 all invoices/CEMENT REGISTER & INCENTIVE MAR\'26.xlsx');
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });

const normalizeHeader = (str) => {
  if (!str) return '';
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/[\s\-_]+/g, ' ')
    .replace(/[^\w\s\.\/%]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const RAW_EXCEL_HEADER_MAP = {
  'sl no': 'SL NO',
  'invoice date': 'LOADING DT', 'loading dt': 'LOADING DT', 'loading date': 'LOADING DT', 'date': 'LOADING DT',
  'receiving date': 'RECEIVING DATE', 'recv date': 'RECEIVING DATE', 'received date': 'RECEIVING DATE',
  'bill no': 'BILL NO', 'bill number': 'BILL NO', 'bill no.': 'BILL NO',
  'bill date': 'BILL DATE',
  'by portal': 'By Portal', 'portal': 'By Portal',
  'site': 'SITE', 'site name': 'SITE',
  'vehicle number': 'VEHICLE NUMBER', 'vehicle no': 'VEHICLE NUMBER', 'truck no': 'VEHICLE NUMBER',
  'vehicle no.': 'VEHICLE NUMBER', 'veh no': 'VEHICLE NUMBER',
  'wheel': 'WHEEL', 'wheels': 'WHEEL',
  'unloading status': 'UNLOADING STATUS', 'unloading date': 'UNLOADING STATUS', 'unload date': 'UNLOADING STATUS',
  'e-way bill no': 'E-WAY BILL NO', 'eway bill no': 'E-WAY BILL NO', 'eway bill': 'E-WAY BILL NO',
  'e way bill no': 'E-WAY BILL NO', 'e-way bill no.': 'E-WAY BILL NO', 'ewb no': 'E-WAY BILL NO',
  'dn': 'DN', 'dn (driver)': 'DN', 'driver': 'DN', 'driver name': 'DN',
  'e-way bill validity': 'E-WAY BILL VALIDITY', 'eway validity': 'E-WAY BILL VALIDITY', 'ewb validity': 'E-WAY BILL VALIDITY',
  'gcn no': 'GCN NO', 'gcn': 'GCN NO', 'gcn no.': 'GCN NO',
  'invoice no': 'INVOICE NO', 'invoice number': 'INVOICE NO', 'invoice no.': 'INVOICE NO',
  'shipment no': 'SHIPMENT NO', 'shipment number': 'SHIPMENT NO', 'shipment no.': 'SHIPMENT NO',
  'challan status': 'CHALLAN STATUS', 'challan': 'CHALLAN STATUS',
  'bill type': 'Bill Type',
  'destination': 'DESTINATION', 'party name': 'PARTY NAME',
};

const EXCEL_HEADER_MAP = {};
Object.entries(RAW_EXCEL_HEADER_MAP).forEach(([k, v]) => {
  EXCEL_HEADER_MAP[normalizeHeader(k)] = v;
});

function normalizeDateStr(str) {
  if (!str) return str;
  const s = String(str).trim();
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) return s;

  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const excelDays = parseFloat(s);
    const date = new Date(Math.round((excelDays - 25569) * 86400 * 1000));
    return `${String(date.getUTCDate()).padStart(2, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${date.getUTCFullYear()}`;
  }

  const slashDMY = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (slashDMY) {
    let year = parseInt(slashDMY[3], 10);
    if (year < 100) year += 2000;
    let m1 = parseInt(slashDMY[1], 10);
    let m2 = parseInt(slashDMY[2], 10);
    let d = m1, m = m2;
    if (m2 > 12) { d = m2; m = m1; }
    return `${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}-${year}`;
  }
  return s;
}

function parseDateMY(str) {
  if (!str) return null;
  const s = String(str).trim();
  let m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (m) {
    let year = parseInt(m[3], 10);
    if (year < 100) year += 2000;
    let m1 = parseInt(m[1], 10);
    let m2 = parseInt(m[2], 10);
    let month = m2;
    if (m2 > 12) month = m1;
    return { month, year };
  }
  return null;
}

let bestHeaderRowIdx = 2;
const excelHeaders = aoa[bestHeaderRowIdx].map(h => String(h).trim());
const dataRows = aoa.slice(bestHeaderRowIdx + 1);

const headerMapping = {};
excelHeaders.forEach((h, colIdx) => {
  if (!h) return;
  const key = EXCEL_HEADER_MAP[normalizeHeader(h)];
  if (key) headerMapping[colIdx] = key;
});

let mappedRows = [];
dataRows.forEach((rowArr, rowIdx) => {
  if (!rowArr || !rowArr.some(cell => String(cell).trim() !== '')) return;

  const rowObj = {};
  Object.entries(headerMapping).forEach(([colIdxStr, internalKey]) => {
    const colIdx = parseInt(colIdxStr, 10);
    const rawVal = rowArr[colIdx];
    const val = normalizeDateStr(String(rawVal ?? '').trim());
    if (val !== '') rowObj[internalKey] = val;
  });
  if (Object.keys(rowObj).length > 0) {
    rowObj._originalIdx = rowIdx + 3;
    mappedRows.push(rowObj);
  }
});

const filtered = mappedRows.filter(row => {
  const parsed = parseDateMY(row['LOADING DT']);
  return parsed && parsed.month === 6 && parsed.year === 2026;
});

console.log("Filtered row count for June 2026:", filtered.length);
filtered.forEach((r, i) => {
  console.log(`Row #${i}: SL NO: '${r['SL NO']}', LOADING DT: '${r['LOADING DT']}', VEHICLE: '${r['VEHICLE NUMBER']}', Excel Row: ${r._originalIdx}`);
});
