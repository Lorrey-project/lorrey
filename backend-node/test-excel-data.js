const XLSX = require('xlsx');

function cleanHeader(h) {
  return String(h)
    .replace(/[\r\n]+/g, ' ')      // replace newlines with space
    .replace(/\s+/g, ' ')          // collapse double spaces
    .trim()
    .toLowerCase();
}

const EXCEL_HEADER_MAP = {
  // Identification
  'sl no': 'SL NO', 'sl': 'SL NO', 'serial no': 'SL NO', 's.no': 'SL NO',
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
  'unloading status note': 'UNLOADING STATUS NOTE', 'unloading note': 'UNLOADING STATUS NOTE', 'status note': 'UNLOADING STATUS NOTE',
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
  'mt': 'MT', 'metric ton': 'MT', 'tonnes': 'MT', 'qty': 'MT', 'quantity': 'MT', 'wt': 'MT',
  'party rate': 'PARTY RATE', 'party rate var': 'PARTY RATE VAR',
  'billing amount': 'Billing Amount',
  'billing er 95 % (party payable)': 'BILLING ER 95%', 'billing er 95% (party payable)': 'BILLING ER 95%', 'billing er 95%': 'BILLING ER 95%',
  'billing er var': 'BILLING ER VAR',
  'amount': 'AMOUNT',
  'profit': 'PROFIT',
  'tds@1%': 'TDS@1%', 'tds @ 1%': 'TDS@1%',
  'advance': 'ADVANCE', 'loading advance': 'ADVANCE', 'adv': 'ADVANCE',
  'site cash': 'Site Cash', 'site cash advance': 'Site Cash',
  'office cash': 'OFFICE CASH', 'office cash advance': 'OFFICE CASH',
  'bank tf': 'Bank TF', 'bank transfer': 'Bank TF', 'advance (bank tf)': 'Bank TF', 'neft': 'Bank TF',
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
  'km as per rate chart': 'KM AS PER RATE CHART', 'km': 'KM AS PER RATE CHART', 'distance': 'KM AS PER RATE CHART', 'k.m as per rate chart (up+down)': 'KM AS PER RATE CHART',
  'fuel required': 'FUEL REQUIRED',
  'hsd (ltr)': 'HSD (LTR)', 'hsd ltr': 'HSD (LTR)', 'hsd litre': 'HSD (LTR)', 'hsd': 'HSD (LTR)', 'diesel': 'HSD (LTR)',
  'balance': 'BALANCE',
  'extra allowed': 'EXTRA ALLOWED',
  'actual extra': 'ACTUAL EXTRA',
  'hsd rate': 'HSD RATE', 'diesel rate': 'HSD RATE',
  'hsd amount': 'HSD AMOUNT', 'diesel amount': 'HSD AMOUNT',
  '% of adv': '% OF ADV',
  'travelling exp': 'TRAVELLING EXP', 'travel exp': 'TRAVELLING EXP', 'travelling': 'TRAVELLING EXP',
  'shortage (bag)': 'SHORTAGE (BAG)', 'shortage bag': 'SHORTAGE (BAG)', 'short bag': 'SHORTAGE (BAG)',
  'shortage (rate)': 'SHORTAGE (RATE)', 'shortage rate': 'SHORTAGE (RATE)',
  'shortage(amount': 'SHORTAGE (AMOUNT)', 'shortage (amount)': 'SHORTAGE (AMOUNT)',
  // Net
  'up toll': 'UP TOLL', 'toll up': 'UP TOLL',
  'down toll': 'DOWN TOLL', 'toll down': 'DOWN TOLL',
  'extra unloading': 'EXTRA UNLOADING', 'unloading': 'EXTRA UNLOADING',
  'dedicated': 'DEDICATED',
  '10w extra 8.5%': '10W EXTRA 8.5%',
  'rafter': 'RAFTER',
  'incentive tds': 'INCENTIVE TDS', 'incentive_tds': 'INCENTIVE TDS',
  'gross amount': 'GROSS AMOUNT',
  // Owner
  'owner name': 'OWNER NAME', 'owner': 'OWNER NAME',
  'duration': 'Duration',
  'detaintion': 'Detention', 'detention': 'Detention',
  'transporting coast': 'Transporting Coast', 'transporting cost': 'Transporting Coast', 'transport cost': 'Transporting Coast',
};

const workbook = XLSX.readFile('/Users/soumodeeproy/Desktop/2026 all invoices/CEMENT REGISTER & INCENTIVE MAR\'26.xlsx');
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

let headerRowIdx = 2; // from previous output
const bestHeaders = data[headerRowIdx];

console.log("Unmapped columns:");
let unmappedCount = 0;
bestHeaders.forEach((header, idx) => {
  if (!header) return;
  const key = cleanHeader(header);
  if (!EXCEL_HEADER_MAP[key]) {
    console.log(`- Index ${idx}: "${header}" (normalized key: "${key}")`);
    unmappedCount++;
  }
});
console.log("Total unmapped count:", unmappedCount);
