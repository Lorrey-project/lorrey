const XLSX = require('xlsx');

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
  // Identification
  'sl no': 'SL NO', 'sl': 'SL NO', 'serial no': 'SL NO', 's.no': 'SL NO', 'sno': 'SL NO',
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
  // Billing
  'destination': 'DESTINATION', 'dest': 'DESTINATION',
  'party name': 'PARTY NAME', 'party': 'PARTY NAME', 'consignee': 'PARTY NAME',
  'billing': 'BILLING', 'freight': 'BILLING', 'rate': 'BILLING', 'billing rate': 'BILLING',
  'mt': 'MT', 'metric ton': 'MT', 'tonnes': 'MT', 'qty': 'MT', 'quantity': 'MT', 'wt': 'MT', 'party rate': 'PARTY RATE',
  'advance': 'ADVANCE', 'loading advance': 'ADVANCE', 'adv': 'ADVANCE', 'advance ': 'ADVANCE',
  'site cash': 'Site Cash', 'site cash advance': 'Site Cash',
  'office cash': 'OFFICE CASH', 'office cash advance': 'OFFICE CASH',
  'bank tf': 'Bank TF', 'bank transfer': 'Bank TF', 'advance (bank tf)': 'Bank TF', 'neft': 'Bank TF',
  'billing amount': 'Billing Amount', 'billing  amount': 'Billing Amount',
  'billing er 95%': 'BILLING ER 95%', 'billing er 95 %': 'BILLING ER 95%', 'billing er 95% (party payable)': 'BILLING ER 95%', 'billing er 95 % (party payable)': 'BILLING ER 95%', 'billing er 95 % party payable': 'BILLING ER 95%',
  'amount': 'AMOUNT',
  'profit': 'PROFIT',
  'tds@1%': 'TDS@1%', 'tds': 'TDS@1%', 'tds1%': 'TDS@1%',
  // Deductions
  'others deduction': 'Others deduction', 'other deduction': 'Others deduction', 'deduction': 'Others deduction',
  'other': 'Other',
  'gps monitoring charge': 'GPS Monitoring Charge', 'gps charge': 'GPS Monitoring Charge', 'gps': 'GPS Monitoring Charge', 'gps monitaring charge': 'GPS Monitoring Charge',
  'gps device': 'GPS DEVICE',
  'rfid tag': 'RFID TAG', 'rfid': 'RFID TAG',
  'rfid reassurance': 'RFID REASSURANCE',
  'fastag': 'FASTAG', 'fas tag': 'FASTAG',
  // HSD / Fuel
  'pump name': 'PUMP NAME', 'pump': 'PUMP NAME',
  'hsd slip no': 'HSD SLIP NO', 'hsd slip': 'HSD SLIP NO',
  'hsd bill no': 'HSD BILL NO',
  'km as per rate chart': 'KM AS PER RATE CHART', 'km': 'KM AS PER RATE CHART', 'distance': 'KM AS PER RATE CHART', 'km as per rate chart (up+down)': 'KM AS PER RATE CHART', 'km as per rate chart (up+down)': 'KM AS PER RATE CHART', 'k.m as per rate chart (up+down)': 'KM AS PER RATE CHART',
  'fuel required': 'FUEL REQUIRED',
  'hsd (ltr)': 'HSD (LTR)', 'hsd ltr': 'HSD (LTR)', 'hsd litre': 'HSD (LTR)', 'hsd': 'HSD (LTR)', 'diesel': 'HSD (LTR)',
  'balance': 'BALANCE',
  'extra allowed': 'EXTRA ALLOWED',
  'actual extra': 'ACTUAL EXTRA',
  'hsd rate': 'HSD RATE', 'diesel rate': 'HSD RATE',
  'hsd amount': 'HSD AMOUNT', 'diesel amount': 'HSD AMOUNT', 'hsd-amount': 'HSD AMOUNT',
  'travelling exp': 'TRAVELLING EXP', 'travel exp': 'TRAVELLING EXP', 'travelling': 'TRAVELLING EXP',
  'shortage (bag)': 'SHORTAGE (BAG)', 'shortage bag': 'SHORTAGE (BAG)', 'short bag': 'SHORTAGE (BAG)',
  'shortage (rate)': 'SHORTAGE (RATE)', 'shortage rate': 'SHORTAGE (RATE)',
  'shortage amount': 'SHORTAGE (AMOUNT)', 'shortage (amount)': 'SHORTAGE (AMOUNT)', 'shortage(amount': 'SHORTAGE (AMOUNT)', 'shortageamount': 'SHORTAGE (AMOUNT)',
  // Net
  'up toll': 'UP TOLL', 'toll up': 'UP TOLL', 'extra unloading ': 'EXTRA UNLOADING',
  'down toll': 'DOWN TOLL', 'toll down': 'DOWN TOLL',
  'extra unloading': 'EXTRA UNLOADING', 'unloading': 'EXTRA UNLOADING',
  'dedicated': 'DEDICATED', 'dedicated ': 'DEDICATED',
  '10w extra 8.5%': '10W EXTRA 8.5%', '10w extra 8.5': '10W EXTRA 8.5%', '10w extra': '10W EXTRA 8.5%',
  '% of adv': '% OF ADV', 'percent of adv': '% OF ADV',
  'net amount': 'NET AMOUNT',
  'gross amount': 'GROSS AMOUNT',
  'rafter': 'RAFTER',
  'incentive tds': 'INCENTIVE TDS', 'incentive tds ': 'INCENTIVE TDS',
  // Owner
  'owner name': 'OWNER NAME', 'owner': 'OWNER NAME',
  'duration': 'Duration',
  'detention': 'Detention', 'detaintion': 'Detention',
  'transporting coast': 'Transporting Coast', 'transporting cost': 'Transporting Coast', 'transport cost': 'Transporting Coast',
};

const EXCEL_HEADER_MAP = {};
Object.entries(RAW_EXCEL_HEADER_MAP).forEach(([k, v]) => {
  EXCEL_HEADER_MAP[normalizeHeader(k)] = v;
});

// Normalize date
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

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;

  const monMatch = s.match(/^(\d{1,2})[\/-](\w+)[\/-](\d{2,4})$/);
  if (monMatch) {
    const monthIdx = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(monMatch[2].toLowerCase().slice(0, 3));
    if (monthIdx >= 0) {
      let year = parseInt(monMatch[3], 10);
      if (year < 100) year += 2000;
      return `${monMatch[1].padStart(2, '0')}-${String(monthIdx + 1).padStart(2, '0')}-${year}`;
    }
  }

  return s;
}

function parseDateMY(str) {
  if (!str) return null;
  const s = String(str).trim();

  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const excelDays = parseFloat(s);
    const date = new Date(Math.round((excelDays - 25569) * 86400 * 1000));
    return { month: date.getUTCMonth() + 1, year: date.getUTCFullYear() };
  }

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
  m = s.match(/^(\d{4})[\/-](\d{2})[\/-](\d{2})$/);
  if (m) return { month: parseInt(m[2], 10), year: parseInt(m[1], 10) };
  m = s.match(/^(\d{1,2})[\/-](\w+)[\/-](\d{2,4})$/);
  if (m) {
    const monthIdx = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[2].toLowerCase().slice(0, 3));
    let year = parseInt(m[3], 10);
    if (year < 100) year += 2000;
    if (monthIdx >= 0) return { month: monthIdx + 1, year };
  }
  return null;
}

const workbook = XLSX.readFile('/Users/soumodeeproy/Desktop/2026 all invoices/CEMENT REGISTER & INCENTIVE MAR\'26.xlsx');
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });

let bestHeaderRowIdx = 2; // from previous output
const excelHeaders = aoa[bestHeaderRowIdx].map(h => String(h).trim());
const dataRows = aoa.slice(bestHeaderRowIdx + 1);

const headerMapping = {};
excelHeaders.forEach((h, colIdx) => {
  if (!h) return;
  const key = EXCEL_HEADER_MAP[normalizeHeader(h)];
  if (key) headerMapping[colIdx] = key;
});

const dateColsPreference = [
  'LOADING DT', 'BILL DATE', 'RECEIVING DATE', 'UNLOADING STATUS'
];
const mappedDateCol = Object.entries(headerMapping).find(([, v]) => dateColsPreference.includes(v))?.[0];

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
    mappedRows.push(rowObj);
  }
});

const wizardMonth = 6; // June
const wizardYear = 2026;

let filteredRows = mappedRows;
if (mappedDateCol) {
  const internalDateKey = headerMapping[mappedDateCol];
  filteredRows = mappedRows.filter(row => {
    const parsed = parseDateMY(row[internalDateKey]);
    return parsed && parsed.month === wizardMonth && parsed.year === wizardYear;
  });
}

console.log("Total filtered rows for June 2026:", filteredRows.length);
filteredRows.forEach((r, idx) => {
  console.log(`Row #${idx}:`, JSON.stringify(r));
});
