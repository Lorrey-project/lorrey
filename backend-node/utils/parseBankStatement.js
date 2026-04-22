/**
 * parseBankStatement.js
 * 
 * Smart universal parser for Indian bank statements.
 * Supports Excel (.xlsx/.xls) and CSV (.csv) formats.
 * Auto-detects column mapping for: SBI, HDFC, ICICI, Axis, Kotak, PNB, BOB, etc.
 */

const xlsx = require('xlsx');

// ── Column name aliases for common Indian banks ────────────────────────────
const COLUMN_ALIASES = {
  transactionDate: [
    'date', 'txn date', 'transaction date', 'value date', 'posting date',
    'tran date', 'trans date', 'booking date', 'narration date', 'tx date'
  ],
  remarks: [
    'narration', 'description', 'particulars', 'transaction details',
    'remarks', 'details', 'tran particular', 'transaction narration',
    'transaction description', 'chq/ref particulars', 'transaction remarks'
  ],
  referenceNo: [
    'ref no', 'reference no', 'reference number', 'transaction id',
    'tran id', 'trans id', 'utr no', 'utr number', 'transaction reference',
    'ref number', 'ref.no', 'chq/ref.no', 'ref no.', 'ref. no.'
  ],
  chequeNo: [
    'cheque no', 'chq no', 'cheque number', 'chq number', 'chq.no',
    'cheque', 'instrument no', 'instrument number', 'check no', 'check number',
    'cheque no.', 'chq no.', 'chq. no.'
  ],
  withdraw: [
    'debit', 'withdrawal', 'withdrawal amt', 'debit amount', 'dr amount',
    'dr', 'debit amt', 'withdrawal amount', 'amount debited', 'debit (dr)',
    'withdraw'
  ],
  deposit: [
    'credit', 'deposit', 'deposit amt', 'credit amount', 'cr amount',
    'cr', 'credit amt', 'deposit amount', 'amount credited', 'credit (cr)'
  ],
  closingBalance: [
    'balance', 'closing balance', 'running balance', 'available balance',
    'balance amount', 'bal', 'ledger balance', 'balance (inr)', 'balance amt'
  ]
};

/**
 * Find the best matching column name from aliases.
 */
function findColumn(headers, aliases) {
  const normalize = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '').trim();
  const normalizedHeaders = headers.map(h => normalize(h));
  const normalizedAliases = aliases.map(a => normalize(a));

  // 1. Try exact normalized match
  for (let i = 0; i < normalizedHeaders.length; i++) {
    const h = normalizedHeaders[i];
    if (normalizedAliases.includes(h)) {
      return headers[i];
    }
  }

  // 2. Try partial match
  for (let i = 0; i < normalizedHeaders.length; i++) {
    const h = normalizedHeaders[i];
    if (normalizedAliases.some(alias => h.includes(alias) || alias.includes(h))) {
      return headers[i];
    }
  }

  return null;
}

/**
 * Clean a numeric value — strip currency symbols, commas, etc.
 */
function cleanNumber(val) {
  if (val === null || val === undefined || val === '') return '';
  const str = String(val).replace(/[₹,\s]/g, '').trim();
  const num = parseFloat(str);
  return isNaN(num) ? '' : String(num);
}

/**
 * Format a date value to YYYY-MM-DD string.
 */
function formatDate(val) {
  if (!val) return '';
  
  // If it's an Excel serial number
  if (typeof val === 'number') {
    const date = xlsx.SSF.parse_date_code(val);
    if (date) {
      const y = date.y;
      const m = String(date.m).padStart(2, '0');
      const d = String(date.d).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  const str = String(val).trim();
  
  // Try common date formats: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD
  const patterns = [
    /^(\d{2})\/(\d{2})\/(\d{4})$/, // DD/MM/YYYY
    /^(\d{2})-(\d{2})-(\d{4})$/, // DD-MM-YYYY
    /^(\d{4})-(\d{2})-(\d{2})$/, // YYYY-MM-DD
    /^(\d{2})\/(\d{2})\/(\d{2})$/, // DD/MM/YY
  ];

  for (const pattern of patterns) {
    const match = str.match(pattern);
    if (match) {
      if (pattern === patterns[2]) return str;
      const [, a, b, c] = match;
      if (pattern === patterns[3]) return `20${c}-${b}-${a}`;
      return `${c}-${b}-${a}`;
    }
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];

  return str;
}

/**
 * Main parse function.
 */
function parseBankStatement(fileBuffer, originalName) {
  const ext = originalName.split('.').pop().toLowerCase();
  
  let workbook;
  if (ext === 'csv') {
    workbook = xlsx.read(fileBuffer, { type: 'buffer', raw: false });
  } else {
    workbook = xlsx.read(fileBuffer, { type: 'buffer', cellDates: false });
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  
  const allKeywords = Object.values(COLUMN_ALIASES).flat();

  let headerRowIdx = -1;
  let headers = [];

  // Smart Detection (Priority 1)
  const normalize = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '').trim();
  const normalizedKeywords = allKeywords.map(k => normalize(k));

  let bestMatch = { score: -1, idx: -1, headers: [] };

  for (let i = 0; i < Math.min(rawData.length, 40); i++) {
    const row = rawData[i];
    if (!row || !Array.isArray(row)) continue;
    
    let matchScore = 0;
    const rowNorm = row.map(normalize);
    
    // Core columns (high weight)
    if (rowNorm.some(c => normalizedKeywords.slice(0, 10).includes(c))) matchScore += 1; // transactionDate aliases
    
    // Any aliases
    for (const cell of rowNorm) {
      if (cell && normalizedKeywords.includes(cell)) {
        matchScore++;
      }
    }
    
    if (matchScore > bestMatch.score) {
      bestMatch = { score: matchScore, idx: i, headers: row.map(h => String(h).trim()) };
    }
  }

  if (bestMatch.score < 2) {
    throw new Error('Could not find a valid header row in the statement file. Please ensure it is a valid bank statement.');
  }

  headerRowIdx = bestMatch.idx;
  headers = bestMatch.headers;

  const colMap = {
    transactionDate: findColumn(headers, COLUMN_ALIASES.transactionDate),
    remarks: findColumn(headers, COLUMN_ALIASES.remarks),
    referenceNo: findColumn(headers, COLUMN_ALIASES.referenceNo),
    chequeNo: findColumn(headers, COLUMN_ALIASES.chequeNo),
    withdraw: findColumn(headers, COLUMN_ALIASES.withdraw),
    deposit: findColumn(headers, COLUMN_ALIASES.deposit),
    closingBalance: findColumn(headers, COLUMN_ALIASES.closingBalance),
  };

  const dataRows = rawData.slice(headerRowIdx + 1);
  const transactions = [];

  for (const row of dataRows) {
    if (!row || row.every(c => String(c).trim() === '')) continue;

    const get = (colName) => {
      if (!colName) return '';
      const idx = headers.indexOf(colName);
      if (idx === -1) return '';
      return row[idx] !== undefined ? row[idx] : '';
    };

    const txDate = formatDate(get(colMap.transactionDate));
    if (!txDate) continue;

    const withdraw = cleanNumber(get(colMap.withdraw));
    const deposit = cleanNumber(get(colMap.deposit));
    
    if (!withdraw && !deposit) {
      const balance = cleanNumber(get(colMap.closingBalance));
      if (!balance) continue;
    }

    transactions.push({
      transactionDate: txDate,
      remarks: String(get(colMap.remarks)).trim(),
      referenceNo: String(get(colMap.referenceNo)).trim(),
      chequeNo: String(get(colMap.chequeNo)).trim(),
      withdraw,
      deposit,
      closingBalance: cleanNumber(get(colMap.closingBalance)),
      ledgerName: '',
      names: '',
      particulars: '',
      _source: 'bank_statement'
    });
  }

  return { transactions, colMap };
}

module.exports = { parseBankStatement, findColumn };
