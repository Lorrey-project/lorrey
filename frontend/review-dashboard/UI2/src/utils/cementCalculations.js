// ─── Column types ──────────────────────────────────────────────────────────────
// 'auto'   = fetched from server, not editable
// 'manual' = user inputs
// 'calc'   = computed from other fields (shown, not directly edited)
// 'dropdown' = select from fixed options

export const COLUMNS = [
  // ── Group 1: Identification ────────────────────────────────────────────────
  { key: 'SL NO', label: 'SL NO', width: 60, type: 'auto', group: 'id', sticky: true },
  { key: 'LOADING DT', label: 'INVOICE DATE', width: 120, type: 'auto', group: 'id' },
  { key: 'RECEIVING DATE', label: 'RECEIVING\nDATE', width: 120, type: 'manual', group: 'id', isDate: true },
  { key: 'BILL NO', label: 'FREIGHT BILL NO', width: 160, type: 'auto', group: 'id', hasAttach: 'bill_pdf_auto' },
  { key: 'BILL DATE', label: 'FREIGHT BILL DATE', width: 130, type: 'auto', group: 'id' },
  { key: 'UNLOADING BILL NO', label: 'UNLOADING BILL NO', width: 160, type: 'auto', group: 'id' },
  { key: 'UNLOADING BILL DATE', label: 'UNLOADING BILL DATE', width: 150, type: 'auto', group: 'id' },
  { key: 'By Portal', label: 'BY PORTAL', width: 120, type: 'dropdown', options: ['By Portal', ''], group: 'id' },
  { key: 'SITE', label: 'SITE', width: 190, type: 'auto', group: 'id' },
  { key: 'VEHICLE NUMBER', label: 'VEHICLE NUMBER', width: 145, type: 'auto', group: 'id' },
  { key: 'WHEEL', label: 'WHEEL', width: 80, type: 'auto', group: 'id' },
  { key: 'UNLOADING STATUS', label: 'UNLOADING STATUS', width: 150, type: 'manual', group: 'id', isDate: true },
  { key: 'E-WAY BILL NO', label: 'E-WAY BILL NO.', width: 170, type: 'auto', group: 'id' },
  { key: 'DN', label: 'DN (DRIVER)', width: 140, type: 'auto', group: 'id' },
  { key: 'E-WAY BILL VALIDITY', label: 'E-WAY BILL\nVALIDITY', width: 135, type: 'auto', group: 'id' },
  { key: 'GCN NO', label: 'GCN NO.', width: 130, type: 'auto', group: 'id' },
  { key: 'INVOICE NO', label: 'INVOICE NO.', width: 170, type: 'auto', group: 'id' },
  { key: 'SHIPMENT NO', label: 'SHIPMENT NO.', width: 160, type: 'auto', group: 'id' },
  {
    key: 'CHALLAN STATUS', label: 'CHALLAN\nSTATUS', width: 180, type: 'dropdown', group: 'id',
    hasAttach: 'challan_proof',
    options: ['STAMP', 'NON STAMP', ''],
    colorMap: {
      'STAMP': '#dcfce7', // green — stamped
      'NON STAMP': '#fee2e2', // red — not stamped
      'STAMP_CHANGED': '#bbf7d0' // bright green — changed TO stamp from non-stamp
    }
  },
  { key: 'WHEEL', label: 'WHEEL', width: 80, type: 'auto', group: 'id', hidden: true },
  {
    key: 'Bill Type', label: 'BILL\nTYPE', width: 100, type: 'auto', group: 'id',
    options: ['NT', 'STO', 'SO', ''],
    colorMap: { 'NT': '#d1fae5', 'STO': '#fee2e2', 'SO': '#e0e7ff' }
  },

  // ── Group 2: Party & Billing ───────────────────────────────────────────────
  { key: 'DESTINATION', label: 'DESTINATION', width: 160, type: 'auto', group: 'billing' },
  { key: 'PARTY NAME', label: 'PARTY NAME', width: 160, type: 'auto', group: 'billing' },
  { key: 'BILLING', label: 'BILLING', width: 80, type: 'auto', group: 'billing', hint: 'From freight dataset' },
  { key: 'MT', label: 'MT', width: 60, type: 'auto', group: 'billing' },
  {
    key: 'PARTY RATE', label: 'PARTY RATE\n(95%)', width: 95, type: 'calc', group: 'billing',
    hint: 'Billing × 95%. Shows 0 when owner has a variable commission rate.',
    formula: r => {
      const comm = r._freight_commission;
      const isStd = comm === undefined || comm === null || Number(comm) === 0.05;
      return isStd ? fmt2(num(r.BILLING) * 0.95) : 0;
    }
  },
  {
    key: 'PARTY RATE VAR', label: 'PARTY RATE\n(Variable %)', width: 120, type: 'calc', group: 'billing',
    hint: 'Billing × (1 - variable commission). Shows 0 for standard 95% owners.',
    formula: r => {
      const comm = r._freight_commission;
      if (comm === undefined || comm === null || Number(comm) === 0.05) return 0;
      return fmt2(num(r.BILLING) * (1 - Number(comm)));
    }
  },
  { key: 'Billing Amount', label: 'BILLING\nAMOUNT', width: 105, type: 'calc', group: 'billing', formula: r => fmt2(num(r.BILLING) * num(r.MT)) },
  {
    key: 'BILLING ER 95%', label: 'BILLING ER 95%\n(PARTY PAYABLE)', width: 130, type: 'calc', group: 'billing',
    hint: 'Billing Amount × 95%. Shows 0 for variable-commission owners.',
    formula: r => {
      const comm = r._freight_commission;
      const isStd = comm === undefined || comm === null || Number(comm) === 0.05;
      return isStd ? fmt2(num(r['Billing Amount']) * 0.95) : 0;
    }
  },
  {
    key: 'BILLING ER VAR', label: 'BILLING ER\n(Variable %)', width: 130, type: 'calc', group: 'billing',
    hint: 'Billing Amount × (1 - variable commission). Shows 0 for standard 95% owners.',
    formula: r => {
      const comm = r._freight_commission;
      if (comm === undefined || comm === null || Number(comm) === 0.05) return 0;
      return fmt2(num(r['Billing Amount']) * (1 - Number(comm)));
    }
  },
  { key: 'PROFIT', label: 'GROSS MARGIN', width: 100, type: 'calc', group: 'billing', formula: r => fmt2(num(r['Billing Amount']) * 0.05) },
  {
    key: 'TDS', label: 'TDS', width: 80, type: 'calc', group: 'billing',
    formula: r => {
      const comm = r._freight_commission;
      const isStd = comm === undefined || comm === null || Number(comm) === 0.05;
      const base = isStd ? num(r['BILLING ER 95%']) : num(r['BILLING ER VAR']);
      const tdsPct = (r._tds_percent !== undefined && r._tds_percent !== null && r._tds_percent !== '') ? num(r._tds_percent) : 1;
      return fmt2(base * tdsPct / 100);
    }
  },
  { key: 'ADVANCE', label: 'LOADING ADVANCE', width: 110, type: 'auto', group: 'billing' },
  { key: 'Site Cash', label: 'SITE CASH ADVANCE', width: 160, type: 'auto', group: 'billing', hasAttach: 'site_cash_auto' },
  { key: 'OFFICE CASH', label: 'OFFICE CASH ADVANCE', width: 160, type: 'auto', group: 'billing', hasAttach: 'office_cash_auto' },
  { key: 'Bank TF', label: 'ADVANCE (BANK TF)', width: 120, type: 'manual', group: 'billing' },

  // ── Group 3: Deductions ────────────────────────────────────────────────────
  { key: 'Others deduction', label: 'OTHERS\nDEDUCTION', width: 130, type: 'manual', group: 'deductions' },
  { key: 'Other', label: 'OTHER', width: 100, type: 'manual', group: 'deductions' },
  { key: 'GPS Monitoring Charge', label: 'GPS MONITORING\nCHARGE', width: 150, type: 'manual', group: 'deductions' },
  { key: 'Give GPS DEVICE', label: 'GIVE GPS DEVICE', width: 110, type: 'auto', group: 'deductions', hint: 'Auto from invoice add-on charges' },
  { key: 'GPS Deviation Charges', label: 'GPS DEVIATION\nCHARGES', width: 150, type: 'manual', group: 'deductions' },
  { key: 'Give RFID TAG', label: 'GIVE RFID TAG', width: 110, type: 'auto', group: 'deductions', hint: 'Auto from invoice add-on charges' },

  { key: 'FASTAG', label: 'FASTAG', width: 100, type: 'auto', group: 'deductions', hint: 'Auto from invoice add-on charges' },

  // ── Group 4: HSD / Fuel ────────────────────────────────────────────────────
  { key: 'PUMP NAME', label: 'PUMP NAME', width: 130, type: 'auto', group: 'hsd' },
  { key: 'HSD SLIP NO', label: 'HSD SLIP NO', width: 120, type: 'auto', group: 'hsd' },
  { key: 'HSD BILL NO', label: 'HSD BILL NO\n(Pump/FY/Serial)', width: 175, type: 'auto', group: 'hsd' },
  { key: 'KM AS PER RATE CHART', label: 'KM AS PER RATE\nCHART (UP+DOWN)', width: 155, type: 'auto', group: 'hsd', hint: 'Distance × 2 from freight data' },
  { key: 'FUEL REQUIRED', label: 'FUEL REQUIRED', width: 120, type: 'auto', group: 'hsd' },
  { key: 'HSD (LTR)', label: 'HSD (LTR)', width: 100, type: 'auto', group: 'hsd' },
  { key: 'EXTRA ALLOWED', label: 'EXTRA ALLOWED', width: 120, type: 'manual', group: 'hsd' },
  {
    key: 'ACTUAL EXTRA',
    label: 'ACTUAL EXTRA',
    width: 110,
    type: 'calc',
    group: 'hsd',
    formula: r => {
      const hsd = num(r['HSD (LTR)']);
      const fuel = num(r['FUEL REQUIRED']);
      const extra = num(r['EXTRA ALLOWED']);
      const val = hsd - fuel - extra;
      const rounded = Math.round(val * 100) / 100;
      if (rounded % 1 === 0) {
        return rounded.toFixed(2);
      }
      return String(rounded);
    }
  },
  { key: 'HSD RATE', label: 'HSD RATE', width: 100, type: 'auto', group: 'hsd' },
  { key: 'HSD AMOUNT', label: 'HSD AMOUNT', width: 110, type: 'auto', group: 'hsd' },
  { key: 'CASH DISCOUNT', label: 'CASH DISCOUNT', width: 130, type: 'auto', group: 'hsd' },
  {
    key: '% OF ADV', label: '% OF ADV', width: 100, type: 'calc', group: 'hsd',
    formula: r => {
      const comm = r._freight_commission;
      const isStd = comm === undefined || comm === null || Number(comm) === 0.05;
      const base = isStd ? num(r['BILLING ER 95%']) : num(r['BILLING ER VAR']);
      return base > 0 ? fmt2(((num(r.ADVANCE) + num(r['HSD AMOUNT'])) / base) * 100) : 0;
    }
  },
  { key: 'TRAVELLING EXP', label: 'TRAVELLING EXP', width: 130, type: 'manual', group: 'hsd' },
  { key: 'SHORTAGE (BAG)', label: 'SHORTAGE (BAG)', width: 120, type: 'manual', group: 'hsd' },
  { key: 'SHORTAGE (RATE)', label: 'SHORTAGE (RATE)', width: 120, type: 'manual', group: 'hsd' },
  {
    key: 'SHORTAGE (AMOUNT)', label: 'SHORTAGE (AMOUNT)', width: 130, type: 'calc', group: 'hsd',
    formula: r => {
      // Prioritize manual input/override over calculation
      const manualAmt = num(r['SHORTAGE (AMOUNT)']);
      if (manualAmt > 0) return fmt2(manualAmt);

      const calc = num(r['SHORTAGE (RATE)']) * num(r['SHORTAGE (BAG)']);
      return fmt2(calc);
    }
  },

  // ── Group 5: Net / Gross ───────────────────────────────────────────────────
  {
    key: 'NET AMOUNT', label: 'NET AMOUNT', width: 100, type: 'calc', group: 'net',
    formula: r => {
      const comm = r._freight_commission;
      const isStd = comm === undefined || comm === null || Number(comm) === 0.05;
      const base = isStd ? num(r['BILLING ER 95%']) : num(r['BILLING ER VAR']);
      return fmt2(
        base
        - num(r['TDS'])
        - num(r.ADVANCE)
        - num(r['Site Cash'])
        - num(r['OFFICE CASH'])
        - num(r['Bank TF'])
        - num(r['Others deduction'])
        - num(r['GPS Monitoring Charge'])
        - num(r['Give GPS DEVICE'])
        - num(r['GPS Deviation Charges'])
        - num(r['Give RFID TAG'])
        - num(r['RFID REASSURANCE'])
        - num(r['FASTAG'])
        - num(r['HSD AMOUNT'])
        - num(r['TRAVELLING EXP'])
        - num(r['SHORTAGE (AMOUNT)'])
        - num(r['Other'])
      );
    }
  },
  { key: 'UP TOLL', label: 'UP TOLL', width: 100, type: 'manual', group: 'net' },
  { key: 'DOWN TOLL', label: 'DOWN TOLL', width: 110, type: 'manual', group: 'net' },
  { key: 'EXTRA UNLOADING', label: 'EXTRA UNLOADING', width: 140, type: 'manual', group: 'net' },
  { key: 'DEDICATED', label: 'DEDICATED', width: 120, type: 'dropdown', options: ['Project', 'Actual', ''], group: 'net', hint: '9.5% billing (ATO) or 8.5% party rate (non-ATO)' },
  { key: '10W EXTRA 8.5%', label: '10W EXTRA 8.5%', width: 130, type: 'auto', group: 'net', hint: 'Non-STO only' },

  {
    key: 'GROSS AMOUNT', label: 'GROSS\nAMOUNT', width: 100, type: 'calc', group: 'net',
    formula: r => fmt2(
      num(r['NET AMOUNT'])
      + num(r['UP TOLL'])
      + num(r['DOWN TOLL'])
      + num(r['EXTRA UNLOADING'])
      + num(r.DEDICATED)
      + num(r['10W EXTRA 8.5%'])
    )
  },

  // ── Group 6: Owner / Duration ──────────────────────────────────────────────
  { key: 'OWNER NAME', label: 'OWNER NAME', width: 160, type: 'auto', group: 'owner' },
  {
    key: 'Duration', label: 'DURATION (Days)', width: 110, type: 'calc', group: 'owner',
    formula: r => {
      const loadStr = r['LOADING DT'];
      const unlStr = r['UNLOADING STATUS'];
      if (!loadStr || !unlStr) return '';
      const load = new Date(loadStr);
      const unl = new Date(unlStr);
      if (isNaN(load) || isNaN(unl)) return '';
      return Math.max(1, Math.round((unl - load) / (1000 * 60 * 60 * 24)) + 1);
    }
  },
  {
    key: 'Detention', label: 'DETENTION', width: 110, type: 'calc', group: 'owner',
    formula: r => {
      const d = num(r['Duration']);
      return d > 0 ? 'D ' + (d - 1) : '';
    }
  },
  { key: 'Transporting Coast', label: 'TRANSPORTING COAST', width: 160, type: 'manual', group: 'owner' },
  {
    key: 'PAYMENT STATUS',
    label: 'PAYMENT\nSTATUS',
    width: 110,
    type: 'auto',
    group: 'payment',
    hint: 'Auto-filled when Bank Book deposit is mapped to this bill'
  },
  {
    key: 'PAYMENT DATE',
    label: 'PAYMENT\nDATE',
    width: 120,
    type: 'auto',
    group: 'payment',
    hint: 'Transaction date of the mapped payment'
  },
  {
    key: 'PAYMENT REF',
    label: 'PAYMENT\nREF',
    width: 150,
    type: 'auto',
    group: 'payment',
    hint: 'Reference No / Cheque No from Bank Book'
  },
  {
    key: 'DIFFERENCE',
    label: 'DIFFERENCE',
    width: 110,
    type: 'calc',
    group: 'payment',
    hint: 'Payment Received (Bank TF) - Bill Amount',
    formula: r => {
      const bankTf = num(r['Bank TF']);
      const billAmt = num(r['GROSS AMOUNT']) || num(r['NET AMOUNT']);
      if (!bankTf && !billAmt) return '';
      return (bankTf - billAmt).toFixed(2);
    }
  },
];

// ─── Internal fields not shown ────────────────────────────────────────────────
export const HIDDEN_KEYS = new Set(['_id', '__v', '_invoiceId', '_tds_percent', '_is_ato', '_is_10w', '_source', '_auto_updated_at', '_created_at', '_freight_commission']);

// ─── Calc helpers ─────────────────────────────────────────────────────────────
export function num(val, fallback = 0) {
  if (val === undefined || val === null || val === '') return fallback;
  const cleaned = String(val).replace(/,/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? fallback : n;
}
export function fmt2(n) { return Math.round(num(n) * 100) / 100; }

export function parseToDate(dStr) {
  if (!dStr) return new Date(0);
  const clean = String(dStr).trim();
  const parts = clean.split(/[-\/\.]/);
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    let year = parseInt(parts[2], 10);
    if (parts[2].length === 2) {
      year += (year >= 70 ? 1900 : 2000);
    }
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) return date;
  }
  let d = new Date(dStr);
  if (!isNaN(d.getTime())) return d;
  return new Date(0);
}

export function formatDateToDDMMYY(dStr) {
  if (!dStr) return '';
  const clean = String(dStr).trim();
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(clean)) return clean;

  const date = parseToDate(clean);
  if (isNaN(date.getTime()) || date.getTime() === 0) return dStr;

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear());
  return `${day}.${month}.${year}`;
}

// Calculate all computed fields for a single row
export function applyCalcs(row) {
  const r = { ...row };
  // Run calc columns in order (some depend on earlier calcs)
  for (const col of COLUMNS) {
    if (col.type === 'calc' && typeof col.formula === 'function') {
      r[col.key] = col.formula(r);
    }
  }
  return r;
}

// Group color coding
export const GROUP_COLORS = {
  id: { bg: '#ede9fe', border: '#c4b5fd' },
  billing: { bg: '#dbeafe', border: '#93c5fd' },
  deductions: { bg: '#fef3c7', border: '#fcd34d' },
  hsd: { bg: '#d1fae5', border: '#6ee7b7' },
  net: { bg: '#fce7f3', border: '#f9a8d4' },
  owner: { bg: '#f0fdf4', border: '#86efac' },
  payment: { bg: '#f0f9ff', border: '#7dd3fc' },
};

// Deduplicate columns (WHEEL was listed twice)
export const VISIBLE_COLS = COLUMNS.filter((c, i, arr) =>
  !c.hidden && arr.findIndex(x => x.key === c.key) === i
);

export const NUMERIC_KEYS = new Set([
  'MT', 'Billing Amount', 'BILLING ER 95%', 'BILLING ER VAR', 'PROFIT', 'TDS',
  'ADVANCE', 'Site Cash', 'OFFICE CASH', 'Bank TF', 'Others deduction', 'Other',
  'GPS Monitoring Charge', 'Give GPS DEVICE', 'GPS Deviation Charges', 'Give RFID TAG', 'RFID REASSURANCE', 'FASTAG',
  'FUEL REQUIRED', 'HSD (LTR)', 'ACTUAL EXTRA', 'HSD AMOUNT', 'TRAVELLING EXP',
  'SHORTAGE (BAG)', 'SHORTAGE (AMOUNT)', 'NET AMOUNT', 'UP TOLL', 'DOWN TOLL',
  'EXTRA UNLOADING', 'DEDICATED', '10W EXTRA 8.5%', 'GROSS AMOUNT', 'AMOUNT'
]);

export function formatTotalValue(key, value) {
  if (value === 0) return '';
  if (key === 'MT' || key === 'FUEL REQUIRED' || key === 'HSD (LTR)' || key === 'SHORTAGE (BAG)' || key === 'ACTUAL EXTRA') {
    return String(Math.round(value * 100) / 100);
  }
  return value.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

