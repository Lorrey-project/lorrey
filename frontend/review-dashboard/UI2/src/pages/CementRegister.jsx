import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Box, Button, CircularProgress, Typography, IconButton,
  Snackbar, Alert, Chip, Tooltip, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions, TablePagination
} from '@mui/material';
import SearchableSelect from '../components/SearchableSelect';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import RefreshIcon from '@mui/icons-material/Refresh';
import LockIcon from '@mui/icons-material/Lock';
import FunctionsIcon from '@mui/icons-material/Functions';
import DeleteIcon from '@mui/icons-material/Delete';
import SyncIcon from '@mui/icons-material/Sync';
import axios from 'axios';
import { io } from 'socket.io-client';
import * as XLSX from 'xlsx';
import {
  COLUMNS, HIDDEN_KEYS, num, fmt2, parseToDate, formatDateToDDMMYY,
  applyCalcs, GROUP_COLORS, VISIBLE_COLS, NUMERIC_KEYS, formatTotalValue
} from '../utils/cementCalculations';

import { exportToCsv } from '../utils/exportCsv';


const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const SOCKET_URL = import.meta.env.VITE_SOCKET_IO_URL || API_URL;
const socket = io('/', { autoConnect: true });


// ─── Excel header alias map ────────────────────────────────────────────────────

export const normalizeHeader = (str) => {
  if (!str) return '';
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/[\s\-_]+/g, ' ')
    .replace(/[^\w\s\.\/%]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

export function parseWorksheetToAOA(ws) {
  if (!ws) return [];
  if (ws['!merges']) {
    ws['!merges'].forEach(merge => {
      const startRef = XLSX.utils.encode_cell(merge.s);
      const startCell = ws[startRef];
      if (!startCell) return;
      for (let r = merge.s.r; r <= merge.e.r; r++) {
        for (let c = merge.s.c; c <= merge.e.c; c++) {
          const cellRef = XLSX.utils.encode_cell({ r, c });
          if (!ws[cellRef]) {
            ws[cellRef] = { ...startCell };
          } else if (ws[cellRef].v === undefined || ws[cellRef].v === '' || ws[cellRef].v === null) {
            ws[cellRef] = { ...startCell };
          }
        }
      }
    });
  }

  if (ws['!ref']) {
    try {
      const range = XLSX.utils.decode_range(ws['!ref']);
      const aoa = [];
      for (let r = range.s.r; r <= range.e.r; r++) {
        const row = [];
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cellRef = XLSX.utils.encode_cell({ r, c });
          const cell = ws[cellRef];
          if (!cell) {
            row.push('');
          } else {
            const val = cell.w !== undefined ? String(cell.w).trim() : (cell.v !== undefined && cell.v !== null ? String(cell.v).trim() : '');
            row.push(val);
          }
        }
        aoa.push(row);
      }
      return aoa;
    } catch (e) {
      console.error("Custom range parser failed, falling back to sheet_to_json", e);
    }
  }

  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }).map(row =>
    (row || []).map(cell => (cell !== undefined && cell !== null ? String(cell).trim() : ''))
  );
}

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
  'tds': 'TDS', 'tds1%': 'TDS', 'tds@1%': 'TDS',
  // Deductions
  'others deduction': 'Others deduction', 'other deduction': 'Others deduction', 'deduction': 'Others deduction',
  'other': 'Other',
  'gps monitoring charge': 'GPS Monitoring Charge', 'gps charge': 'GPS Monitoring Charge', 'gps': 'GPS Monitoring Charge', 'gps monitaring charge': 'GPS Monitoring Charge',
  'gps device': 'Give GPS DEVICE',
  'gps deviation charges': 'GPS Deviation Charges', 'gps deviation': 'GPS Deviation Charges',
  'gps trip charges': 'GPS Trip Charges', 'gps trip': 'GPS Trip Charges',
  'suspense': 'Suspense',
  'rfid tag': 'Give RFID TAG', 'rfid': 'Give RFID TAG',

  'fastag': 'FASTAG', 'fas tag': 'FASTAG',
  // HSD / Fuel
  'pump name': 'PUMP NAME', 'pump': 'PUMP NAME',
  'hsd slip no': 'HSD SLIP NO', 'hsd slip': 'HSD SLIP NO',
  'hsd bill no': 'HSD BILL NO',
  'km as per rate chart': 'KM AS PER RATE CHART', 'km': 'KM AS PER RATE CHART', 'distance': 'KM AS PER RATE CHART', 'km as per rate chart (up+down)': 'KM AS PER RATE CHART', 'k.m as per rate chart (up+down)': 'KM AS PER RATE CHART', 'k.m as per rate chart updown': 'KM AS PER RATE CHART',
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

export const EXCEL_HEADER_MAP = {};
Object.entries(RAW_EXCEL_HEADER_MAP).forEach(([k, v]) => {
  EXCEL_HEADER_MAP[normalizeHeader(k)] = v;
});


const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// Parse any common date string and return { month (1-12), year }
function parseDateMY(str) {
  if (!str) return null;
  const s = String(str).trim();

  // Excel Serial Date (e.g. 45352)
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const excelDays = parseFloat(s);
    const date = new Date(Math.round((excelDays - 25569) * 86400 * 1000));
    return { month: date.getUTCMonth() + 1, year: date.getUTCFullYear() };
  }

  // dd-mm-yyyy or dd/mm/yyyy or d/m/yy
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
  // yyyy-mm-dd
  m = s.match(/^(\d{4})[\/-](\d{2})[\/-](\d{2})$/);
  if (m) return { month: parseInt(m[2], 10), year: parseInt(m[1], 10) };
  // dd-Mon-yyyy (e.g. 24-Apr-2026 or 24-Apr-26)
  m = s.match(/^(\d{1,2})[\/-](\w+)[\/-](\d{2,4})$/);
  if (m) {
    const monthIdx = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[2].toLowerCase().slice(0, 3));
    let year = parseInt(m[3], 10);
    if (year < 100) year += 2000;
    if (monthIdx >= 0) return { month: monthIdx + 1, year };
  }
  return null;
}

// Normalize any date string to dd-mm-yyyy with optional expectedMonth/expectedYear hint
function normalizeDateStr(str, expectedMonth, expectedYear) {
  if (!str) return str;
  const s = String(str).trim();
  // Already dd-mm-yyyy
  const ddmm = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (ddmm) {
    let d = parseInt(ddmm[1], 10);
    let m = expectedMonth ? expectedMonth : parseInt(ddmm[2], 10);
    let y = expectedYear ? expectedYear : parseInt(ddmm[3], 10);
    return `${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}-${y}`;
  }

  // Excel Serial Date
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const excelDays = parseFloat(s);
    const date = new Date(Math.round((excelDays - 25569) * 86400 * 1000));
    let d = date.getUTCDate();
    let m = expectedMonth ? expectedMonth : date.getUTCMonth() + 1;
    let y = expectedYear ? expectedYear : date.getUTCFullYear();
    return `${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}-${y}`;
  }

  // dd/mm/yyyy or d/m/yy or mm/dd/yyyy
  const slashDMY = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (slashDMY) {
    let year = parseInt(slashDMY[3], 10);
    if (year < 100) year += 2000;
    let p1 = parseInt(slashDMY[1], 10);
    let p2 = parseInt(slashDMY[2], 10);

    let d = p1, month = p2;
    if (expectedMonth) {
      if (p1 === expectedMonth && p2 !== expectedMonth) {
        d = p2;
      } else if (p2 === expectedMonth && p1 !== expectedMonth) {
        d = p1;
      } else if (p2 > 12) {
        d = p2;
      }
      month = expectedMonth;
    } else {
      if (p2 > 12) {
        d = p2;
        month = p1;
      }
    }
    let y = expectedYear ? expectedYear : year;
    return `${String(d).padStart(2, '0')}-${String(month).padStart(2, '0')}-${y}`;
  }

  // yyyy-mm-dd
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    let d = iso[3];
    let m = expectedMonth ? expectedMonth : iso[2];
    let y = expectedYear ? expectedYear : iso[1];
    return `${d}-${String(m).padStart(2, '0')}-${y}`;
  }

  // dd-Mon-yyyy
  const monMatch = s.match(/^(\d{1,2})[\/-](\w+)[\/-](\d{2,4})$/);
  if (monMatch) {
    const monthIdx = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(monMatch[2].toLowerCase().slice(0, 3));
    if (monthIdx >= 0) {
      let d = monMatch[1];
      let m = expectedMonth ? expectedMonth : (monthIdx + 1);
      let year = parseInt(monMatch[3], 10);
      if (year < 100) year += 2000;
      let y = expectedYear ? expectedYear : year;
      return `${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}-${y}`;
    }
  }

  return s;
}

// ─── Import Validation Helper ──────────────────────────────────────────────────
const validateImportData = (rows, existingEntries) => {
  const errors = [];
  const warnings = [];

  const extractTruckNo = (val) => {
    if (!val) return '';
    const str = String(val).toUpperCase().trim();
    const match = str.match(/([A-Z]{2})\s*[-_]?\s*(\d{1,2})\s*[-_]?\s*([A-Z]{0,2})\s*[-_]?\s*(\d{3,4})/);
    if (match) return `${match[1]}${match[2]}${match[3]}${match[4]}`;
    return str.replace(/[^A-Z0-9]/g, '');
  };

  const seenKeysInternal = new Map();

  rows.forEach((row, idx) => {
    const rowNumInFile = idx + 1;
    const loadingDt = row['LOADING DT'];
    const vehicleNum = row['VEHICLE NUMBER'];
    const invoiceNo = row['INVOICE NO'] || '';

    // Removed missing data checks to allow smooth importing without warning interruptions

    // Duplicate checks
    if (loadingDt && vehicleNum) {
      const cleanTruck = extractTruckNo(vehicleNum);
      const key = `${cleanTruck}_${loadingDt}_${invoiceNo}`;

      // 1. Internal duplicate check (within the uploaded file)
      if (seenKeysInternal.has(key)) {
        const firstSeenIdx = seenKeysInternal.get(key);
        warnings.push(`Duplicate in file: Row ${rowNumInFile} has same vehicle (${vehicleNum}), date (${loadingDt}), and invoice (${invoiceNo}) as Row ${firstSeenIdx}`);
      } else {
        seenKeysInternal.set(key, rowNumInFile);
      }

      // 2. DB duplicate check (against currently loaded month entries)
      if (existingEntries && existingEntries.length > 0) {
        const isDbDuplicate = existingEntries.some(dbRow => {
          const dbCleanTruck = extractTruckNo(dbRow['VEHICLE NUMBER']);
          const dbInvoiceNo = dbRow['INVOICE NO'] || '';
          return dbCleanTruck === cleanTruck && dbRow['LOADING DT'] === loadingDt && dbInvoiceNo === invoiceNo;
        });
        if (isDbDuplicate) {
          warnings.push(`Database duplicate: Vehicle ${vehicleNum} on ${loadingDt} with invoice ${invoiceNo} already exists in the database`);
        }
      }
    }
  });

  return { errors, warnings };
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CementRegister({ onBack }) {
  const [entries, setEntries] = useState([]);
  const [localData, setLocalData] = useState({});   // { rowId: { field: val } }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState(null);


  const now = useMemo(() => new Date(), []);
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1); // 1-12
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [saveCompleted, setSaveCompleted] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const years = useMemo(() => Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i), [now]);

  // ── Excel import wizard and preview state ──────────────────────────────────
  const [unsavedImportRows, setUnsavedImportRows] = useState([]);
  const [showExcelWizard, setShowExcelWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);        // 1=month/year, 2=upload+preview
  const [wizardMonth, setWizardMonth] = useState(now.getMonth() + 1);
  const [wizardYear, setWizardYear] = useState(now.getFullYear());
  const [wizardPreview, setWizardPreview] = useState(null); // parsed result
  const [wizardImporting, setWizardImporting] = useState(false);
  const wizardFileRef = useRef(null);
  const [validationResult, setValidationResult] = useState({ errors: [], warnings: [] });
  const [acceptWarnings, setAcceptWarnings] = useState(false);

  // Keep wizard month/year in sync with the top selection
  useEffect(() => {
    setWizardMonth(selectedMonth);
    setWizardYear(selectedYear);
  }, [selectedMonth, selectedYear]);

  const dirtyCount = Object.keys(localData).length;
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  // Pagination state
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };
  const [syncing, setSyncing] = useState(false);
  const [isBillingModalOpen, setIsBillingModalOpen] = useState(false);
  const [bulkBillInput, setBulkBillInput] = useState({ billDate: '', billType: '' });
  const [activeRowId, setActiveRowId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBillingStatus, setFilterBillingStatus] = useState('All');
  const [filterChallanStatus, setFilterChallanStatus] = useState('All');



  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const calendarYear = selectedMonth <= 3 ? selectedYear + 1 : selectedYear;
      const res = await axios.get(`${API_URL}/cement-register`, {
        params: {
          month: selectedMonth,
          year: calendarYear
        }
      });
      if (res.data.success) {
        setEntries(res.data.entries);
        setLocalData({});
        setSaveCompleted(res.data.entries.length > 0);
      }
    } catch (e) {
      console.error('Fetch failed:', e);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedYear]);

  const [liveMsg, setLiveMsg] = useState(null);

  // ── Smart socket handler ───────────────────────────────────────────────────
  const handleSocketEvent = useCallback(async (msg) => {
    if (msg && msg.action === 'delete' && msg.invoiceId) {
      // Instantly remove the row from local state — no round trip needed
      setEntries(prev => {
        const deletedRow = prev.find(r => r._invoiceId === msg.invoiceId);
        if (deletedRow) {
          setLocalData(d => { const n = { ...d }; delete n[deletedRow._id]; return n; });
        }
        return prev.filter(r => r._invoiceId !== msg.invoiceId);
      });
      setLiveMsg('🗑️ Entry removed — invoice was deleted');
      fetchData(true);
    } else {
      // Generic bulk update or other actions
      fetchData(true);
    }
    // Auto-hide live message
    setTimeout(() => setLiveMsg(null), 3500);
  }, [fetchData]);

  useEffect(() => {
    fetchData();
    socket.on('cementUpdates', handleSocketEvent);
    return () => socket.off('cementUpdates', handleSocketEvent);
  }, [fetchData, handleSocketEvent]);

  // ── Merged rows with calcs ─────────────────────────────────────────────────
  const computedRows = useMemo(() => {
    let dbRows = entries.map(row => {
      const merged = { ...row, ...(localData[row._id] || {}) };
      return applyCalcs(merged);
    });

    let previewRows = unsavedImportRows.map(row => {
      const merged = { ...row, ...(localData[row._id] || {}) };
      return applyCalcs(merged);
    });

    let rows = [...dbRows, ...previewRows];


    // Sort chronologically by date
    rows.sort((a, b) => {
      const dateA = parseToDate(a['LOADING DT'] || a['LOADING DATE']);
      const dateB = parseToDate(b['LOADING DT'] || b['LOADING DATE']);
      if (dateA.getTime() !== dateB.getTime()) {
        return dateA.getTime() - dateB.getTime();
      }
      const slA = parseInt(String(a['SL NO'] || '').replace(/\D/g, ''), 10) || 0;
      const slB = parseInt(String(b['SL NO'] || '').replace(/\D/g, ''), 10) || 0;
      return slA - slB;
    });

    // Format dates to DD.MM.YY and assign sequential SL NO
    return rows.map((r, index) => ({
      ...r,
      'SL NO': String(index + 1),
      'LOADING DT': formatDateToDDMMYY(r['LOADING DT'] || r['LOADING DATE'] || '')
    }));
  }, [entries, unsavedImportRows, localData]);

  const filteredRows = useMemo(() => {
    let result = computedRows;
    if (filterBillingStatus !== 'All') {
      if (filterBillingStatus === 'Billed') result = result.filter(r => r['Billing Completed'] === 'Yes');
      if (filterBillingStatus === 'Pending') result = result.filter(r => r['Billing Completed'] !== 'Yes');
    }
    if (filterChallanStatus !== 'All') {
      if (filterChallanStatus === 'Stamped') result = result.filter(r => String(r['CHALLAN STATUS']).toUpperCase() === 'STAMP');
      if (filterChallanStatus === 'Non-Stamped') result = result.filter(r => String(r['CHALLAN STATUS']).toUpperCase() === 'NON STAMP');
      if (filterChallanStatus === 'Empty') result = result.filter(r => !r['CHALLAN STATUS']);
    }

    if (!searchQuery) return result;
    const q = searchQuery.toLowerCase();
    return result.filter(row => Object.values(row).some(val => String(val || '').toLowerCase().includes(q)));
  }, [computedRows, searchQuery, filterBillingStatus, filterChallanStatus]);

  const monthlyTotals = useMemo(() => {
    const totals = {};
    NUMERIC_KEYS.forEach(key => {
      let sum = 0;
      filteredRows.forEach(row => {
        sum += num(row[key]);
      });
      totals[key] = sum;
    });
    return totals;
  }, [filteredRows]);



  const unbilledRows = computedRows.filter(r => String(r['CHALLAN STATUS']).toUpperCase().trim() !== 'BILLED');
  const allSelected = unbilledRows.length > 0 && selectedIds.size === unbilledRows.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleSelect = (id) => setSelectedIds(prev => {
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  });
  const toggleSelectAll = () => {
    if (allSelected || someSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(unbilledRows.map(r => r._id)));
    }
  };
  // ── Cell edit (local draft) ────────────────────────────────────────────────
  const handleCellEdit = useCallback((rowId, field, value) => {
    setLocalData(prev => ({
      ...prev,
      [rowId]: { ...(prev[rowId] || {}), [field]: value }
    }));
  }, []);

  // ── Bulk Delete selected rows ──────────────────────────────────────────────────
  const handleBulkDelete = async () => {
    setDeleting(true);
    try {
      const token = localStorage.getItem('token');
      const ids = [...selectedIds];

      const dbIds = ids.filter(id => !id.startsWith('temp-'));
      const tempIds = ids.filter(id => id.startsWith('temp-'));

      if (dbIds.length > 0) {
        await axios.delete(`${API_URL}/cement-register/bulk-delete`, {
          headers: { Authorization: `Bearer ${token}` },
          data: { ids: dbIds },
        });
        // Remove instantly from local database entries state
        setEntries(prev => prev.filter(r => !dbIds.includes(r._id)));
      }

      if (tempIds.length > 0) {
        // Remove instantly from preview rows state
        setUnsavedImportRows(prev => prev.filter(r => !tempIds.includes(r._id)));
      }

      setLocalData(prev => {
        const n = { ...prev };
        ids.forEach(id => delete n[id]);
        return n;
      });

      setSelectedIds(new Set());
      setConfirmDel(false);
      setSnack({ severity: 'success', msg: `${ids.length} row(s) deleted.` });
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Delete failed: ' + (err.response?.data?.error || err.message) });
    } finally {
      setDeleting(false);
    }
  };

  // ── Bulk Save ──────────────────────────────────────────────────────────────
  const executeSave = async (isOverwrite = false, overrideData = null) => {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const dataToSave = overrideData || localData;
      const calendarYear = selectedMonth <= 3 ? selectedYear + 1 : selectedYear;

      if (isOverwrite) {
        // Delete existing entries for this period
        await axios.delete(`${API_URL}/cement-register/by-period`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { month: selectedMonth, year: calendarYear }
        });
      } else {
        // Perform normal DB updates if any (only when not overwriting the entire period)
        const dbUpdates = [];
        Object.entries(dataToSave).forEach(([id, changes]) => {
          if (!id.startsWith('temp-')) {
            const originalRow = entries.find(r => r._id === id);
            if (originalRow) {
              const compRow = computedRows.find(cr => cr._id === id);
              const finalSlNo = compRow ? compRow['SL NO'] : (originalRow['SL NO'] || '');

              const merged = { ...originalRow, ...changes };
              const calculated = applyCalcs(merged);
              const changesWithCalcs = { ...changes, 'SL NO': finalSlNo };
              COLUMNS.forEach(col => {
                if (col.type === 'calc') {
                  changesWithCalcs[col.key] = calculated[col.key];
                }
              });
              dbUpdates.push({ id, changes: changesWithCalcs });
            } else {
              dbUpdates.push({ id, changes });
            }
          }
        });
        if (dbUpdates.length > 0) {
          await axios.put(
            `${API_URL}/cement-register/bulk-update`,
            { updates: dbUpdates },
            { headers: { Authorization: `Bearer ${token}` } }
          );
        }
      }

      // Prepare and POST new import entries if any
      if (unsavedImportRows.length > 0) {
        const tempEdits = {};
        Object.entries(dataToSave).forEach(([id, changes]) => {
          if (id.startsWith('temp-')) {
            tempEdits[id] = changes;
          }
        });

        const entriesToInsert = unsavedImportRows.map(row => {
          // Merge any local edits made on this preview row
          const merged = { ...row, ...(tempEdits[row._id] || {}) };
          const calculated = applyCalcs(merged);
          // Find the corresponding computed row to get the final sorted SL NO and formatted date
          const compRow = computedRows.find(cr => cr._id === row._id);
          const finalSlNo = compRow ? compRow['SL NO'] : row['SL NO'];
          // Strip temporary React metadata
          const calendarYear = selectedMonth <= 3 ? selectedYear + 1 : selectedYear;
          const cleaned = { ...calculated, 'SL NO': finalSlNo, month: selectedMonth, year: calendarYear };
          delete cleaned._id;
          delete cleaned.isUnsavedImport;
          return cleaned;
        });

        await axios.post(
          `${API_URL}/cement-register/bulk`,
          { entries: entriesToInsert },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        setUnsavedImportRows([]);
      }

      setSnack({ severity: 'success', msg: isOverwrite ? 'Data overwritten and saved successfully!' : 'Changes saved successfully to database!' });
      setLocalData({});
      setConfirmOverwrite(false);
      fetchData();
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Save failed: ' + (err.response?.data?.error || err.message) });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (dirtyCount === 0 && unsavedImportRows.length === 0) return;

    // Check if we are importing new records and database already has records for this period
    if (unsavedImportRows.length > 0 && entries.length > 0) {
      setConfirmOverwrite(true);
      return;
    }

    // Otherwise, do a normal save
    await executeSave(false);
  };

  // ── CSV Export ─────────────────────────────────────────────────────────────
  const handleExport = () => exportToCsv('cement_register.xls', computedRows);

  // ── Apply Bulk Bill to selected rows ─────────────────────────
  const handleBulkBillApply = async () => {
    const { billDate, billType } = bulkBillInput;
    const ids = [...selectedIds];
    if (ids.length === 0) {
      setSnack({ severity: 'warning', msg: 'No rows selected for billing' });
      return;
    }
    if (!billDate || !billType) {
      setSnack({ severity: 'error', msg: 'Please select both Bill Date and Bill Type.' });
      return;
    }

    // Ensure none of the selected records are already billed for the same type
    const isAlreadyGenerated = ids.some(id => {
      const r = computedRows.find(row => row._id === id);
      if (!r) return false;
      const fGen = r['Freight Generated'] === 'Yes';
      const uGen = r['Unloading Generated'] === 'Yes';
      return (billType === 'Freight' && fGen) || (billType === 'Unloading' && uGen);
    });

    if (isAlreadyGenerated) {
      setSnack({ severity: 'error', msg: 'One or more selected records have already been billed for this type.' });
      return;
    }

    try {
      setSnack({ severity: 'info', msg: `Generating batch bills...` });
      const token = localStorage.getItem('token');
      const payload = {
        recordIds: ids,
        billDate,
        billType
      };

      const res = await axios.post(`${API_URL}/cement-register/generate-batch-bills`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data.success) {
        setIsBillingModalOpen(false);
        setBulkBillInput({ billDate: '', billType: '' });
        setSelectedIds(new Set());

        const generatedCount = res.data.summary?.length || 0;
        setSnack({ severity: 'success', msg: `Successfully generated ${generatedCount} party-wise bill(s).` });

        // Refresh data to show new bill numbers
        fetchData();
      } else {
        setSnack({ severity: 'error', msg: res.data.error || 'Failed to generate batch bills.' });
      }
    } catch (err) {
      console.error(err);
      setSnack({ severity: 'error', msg: 'Failed to generate batch bills: ' + (err.response?.data?.error || err.message) });
    }
  };

  // ── CSV Import ─────────────────────────────────────────────────────────────
  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const [headerLine, ...lines] = text.split('\n').filter(Boolean);
    const headers = headerLine.split(',').map(h => h.replace(/^"|"$/g, '').trim());
    const rows = lines.map(line => {
      const vals = line.split(',').map(v => v.replace(/^"|"$/g, '').trim());
      const obj = {};
      headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
      return obj;
    });
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/cement-register/bulk`, { entries: rows }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchData();
      setSnack({ severity: 'success', msg: `${rows.length} rows imported!` });
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Import failed: ' + err.message });
    }
  };

  // ── Excel Import Wizard: parse file ────────────────────────────────────────
  const handleWizardFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (wizardFileRef.current) wizardFileRef.current.value = '';

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array', cellDates: false });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        // Read as array of arrays to find the header row
        const aoa = parseWorksheetToAOA(sheet);

        if (aoa.length === 0) {
          setSnack({ severity: 'warning', msg: 'Excel sheet is empty.' });
          return;
        }

        let bestHeaderRowIdx = 0;
        let maxMatches = 0;

        // Scan first 15 rows to find the one that looks most like a header row
        const searchLimit = Math.min(15, aoa.length);
        for (let i = 0; i < searchLimit; i++) {
          const row = aoa[i] || [];
          let matches = 0;
          row.forEach(cell => {
            const val = normalizeHeader(cell);
            if (val && EXCEL_HEADER_MAP[val]) matches++;
          });
          if (matches > maxMatches) {
            maxMatches = matches;
            bestHeaderRowIdx = i;
          }
        }

        const excelHeaders = aoa[bestHeaderRowIdx].map(h => String(h).trim());
        const dataRows = aoa.slice(bestHeaderRowIdx + 1);

        const headerMapping = {};
        const unmappedHeaders = [];
        excelHeaders.forEach((h, colIdx) => {
          if (!h) return; // skip empty headers
          const key = EXCEL_HEADER_MAP[normalizeHeader(h)];
          if (key) {
            headerMapping[colIdx] = key;
          } else {
            // Map to original header so no column data is lost/skipped
            // Replace . and $ as MongoDB doesn't allow them in keys
            headerMapping[colIdx] = h.trim().replace(/[\.$]/g, '_');
            unmappedHeaders.push(h);
          }
        });

        // Find a date column to filter by month/year
        const dateColsPreference = [
          'LOADING DT', 'BILL DATE', 'RECEIVING DATE', 'UNLOADING STATUS'
        ];
        const mappedDateCol = Object.entries(headerMapping).find(([, v]) => dateColsPreference.includes(v))?.[0];

        // Convert rows, normalise dates
        let mappedRows = [];
        const dateCols = new Set([
          'LOADING DT', 'BILL DATE', 'RECEIVING DATE', 'UNLOADING STATUS', 'E-WAY BILL VALIDITY'
        ]);

        dataRows.forEach(rowArr => {
          // skip empty rows
          if (!rowArr || !rowArr.some(cell => String(cell).trim() !== '')) return;

          const rowObj = {};
          Object.entries(headerMapping).forEach(([colIdxStr, internalKey]) => {
            const colIdx = parseInt(colIdxStr, 10);
            const rawVal = rowArr[colIdx];
            let val = String(rawVal ?? '').trim();
            if (dateCols.has(internalKey)) {
              const wizardCalendarYear = wizardMonth <= 3 ? wizardYear + 1 : wizardYear;
              val = normalizeDateStr(val, wizardMonth, wizardCalendarYear);
            }
            rowObj[internalKey] = val;
          });
          if (Object.keys(rowObj).length > 0) {
            // A valid row must contain at least a date or a vehicle number.
            // If it only contains auto-generated SL NO or BILL NO, it's likely a trailing empty row.
            if (rowObj['LOADING DT'] || rowObj['VEHICLE NUMBER']) {
              mappedRows.push(rowObj);
            }
          }
        });

        // Bypass strict date-filtering so all rows in the Excel file are accepted 
        // and tagged with the selected month/year.
        let filteredRows = mappedRows;
        let filterApplied = false;

        const validation = validateImportData(filteredRows, entries);
        setValidationResult(validation);
        setAcceptWarnings(false);

        setWizardPreview({
          sheetName,
          totalInFile: mappedRows.length, // Match valid rows so the UI doesn't incorrectly report missing rows
          filteredRows,
          allRows: mappedRows,
          headerMapping,
          excelHeaders,
          unmappedHeaders,
          mappedCount: Object.keys(headerMapping).length,
          filterApplied,
          fileName: file.name,
        });
        setWizardStep(2);
      } catch (err) {
        console.error('Excel parse error:', err);
        setSnack({ severity: 'error', msg: 'Failed to parse Excel: ' + err.message });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // ── Excel Import Wizard: confirm and preview in table ──────────────────────
  const handleWizardImportConfirm = () => {
    const rows = wizardPreview?.filteredRows;
    if (!rows?.length) return;

    // Assign temporary IDs and mark as unsaved
    const tempRows = rows.map((row, idx) => ({
      ...row,
      _id: `temp-${idx}-${Date.now()}`,
      isUnsavedImport: true
    }));

    setUnsavedImportRows(prev => [...prev, ...tempRows]);
    setSnack({ severity: 'info', msg: `Loaded ${rows.length} rows as preview. Click "Save Changes" to save to MongoDB.` });
    setShowExcelWizard(false);
    setWizardStep(1);
    setWizardPreview(null);
    setValidationResult({ errors: [], warnings: [] });
    setAcceptWarnings(false);
  };


  const getStatusChip = () => {
    if (unsavedImportRows.length > 0) {
      return (
        <Chip
          label="⚠️ Preview (Unsaved)"
          size="small"
          sx={{
            fontWeight: 700,
            bgcolor: '#fff7ed',
            color: '#c2410c',
            border: '1px solid #ffedd5',
            fontFamily: 'Inter, system-ui, sans-serif',
            px: 1,
            height: 24,
            fontSize: '0.7rem',
          }}
        />
      );
    } else if (saveCompleted) {
      return (
        <Chip
          label="✅ Saved successfully"
          size="small"
          sx={{
            fontWeight: 700,
            bgcolor: '#ecfdf5',
            color: '#047857',
            border: '1px solid #d1fae5',
            fontFamily: 'Inter, system-ui, sans-serif',
            px: 1,
            height: 24,
            fontSize: '0.7rem',
          }}
        />
      );
    } else {
      return (
        <Chip
          label="ℹ️ No data loaded"
          size="small"
          sx={{
            fontWeight: 700,
            bgcolor: '#f1f5f9',
            color: '#475569',
            border: '1px solid #e2e8f0',
            fontFamily: 'Inter, system-ui, sans-serif',
            px: 1,
            height: 24,
            fontSize: '0.7rem',
          }}
        />
      );
    }
  };

  if (loading) {
    return (
      <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100vh" gap={2}>
        <CircularProgress size={48} thickness={4} sx={{ color: '#7c3aed' }} />
        <Typography color="text.secondary" fontWeight={600}>Loading Cement Register…</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#f8fafc', overflow: 'hidden' }}>

      {/* ── Premium Header ───────────────────────────────────────────── */}
      <Box sx={{
        px: { xs: 2, md: 4 }, py: 2,
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 2, borderBottom: '1px solid rgba(255,255,255,0.1)',
      }}>
        <Box display="flex" alignItems="center" gap={2}>
          <IconButton onClick={onBack} sx={{ bgcolor: 'rgba(255,255,255,0.05)', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }, p: 1, borderRadius: '12px' }}>
            <ArrowBackIcon fontSize="small" sx={{ color: '#f8fafc' }} />
          </IconButton>
          <Box>
            <Typography variant="h5" fontWeight={800} sx={{ color: '#fff', letterSpacing: '-0.5px' }}>
              Cement Register
            </Typography>
            <Box display="flex" alignItems="center" gap={1.5} mt={0.5}>
              <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600 }}>
                Total Records: <span style={{ color: '#e2e8f0' }}>{filteredRows.length}</span>
              </Typography>
              <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: '#475569' }} />
              <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600 }}>
                Period: <span style={{ color: '#e2e8f0' }}>{MONTHS[selectedMonth - 1]} {selectedYear}</span>
              </Typography>
            </Box>
          </Box>
        </Box>

        <Box display="flex" alignItems="center" gap={1.5}>
          <SearchableSelect
            value={selectedMonth}
            onChange={(e) => {
              setSelectedMonth(Number(e.target.value));
              setUnsavedImportRows([]);
            }}
            size="small"
            sx={{
              borderRadius: '10px', fontSize: '12px', fontWeight: 700,
              color: '#fff', bgcolor: 'rgba(255,255,255,0.05)',
              '& .MuiInputBase-input': { color: '#fff' },
              '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#a78bfa' },
              '.MuiSvgIcon-root': { color: '#94a3b8' },
              minWidth: 120,
            }}
          >
            {MONTHS.map((mo, idx) => (
              <MenuItem key={mo} value={idx + 1} sx={{ fontSize: '12px', fontWeight: 600 }}>{mo}</MenuItem>
            ))}
          </SearchableSelect>

          <SearchableSelect
            value={selectedYear}
            onChange={(e) => {
              setSelectedYear(Number(e.target.value));
              setUnsavedImportRows([]);
            }}
            size="small"
            sx={{
              borderRadius: '10px', fontSize: '12px', fontWeight: 700,
              color: '#fff', bgcolor: 'rgba(255,255,255,0.05)',
              '& .MuiInputBase-input': { color: '#fff' },
              '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#a78bfa' },
              '.MuiSvgIcon-root': { color: '#94a3b8' },
              minWidth: 140,
            }}
          >
            {years.map(yr => (
              <MenuItem key={yr} value={yr} sx={{ fontSize: '12px', fontWeight: 600 }}>{yr}-{yr + 1}</MenuItem>
            ))}
          </SearchableSelect>
        </Box>
      </Box>



      {/* ── Toolbar & Quick Filters ────────────────────────────────────── */}
      <Box sx={{
        px: { xs: 2, md: 4 }, py: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        bgcolor: '#ffffff', borderBottom: '1px solid #e2e8f0',
        gap: 2, flexWrap: 'wrap'
      }}>
        {/* Filters Left Side */}
        <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
          <Box display="flex" alignItems="center" sx={{
            bgcolor: '#f1f5f9', borderRadius: '12px', px: 2, py: 1, border: '1px solid #e2e8f0',
            '&:focus-within': { borderColor: '#7c3aed', boxShadow: '0 0 0 2px rgba(124,58,237,0.1)' }, width: 260
          }}>
            <span style={{ marginRight: 8, opacity: 0.5 }}>🔍</span>
            <input
              type="text"
              placeholder="Search Vehicle, Inv, GCN..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '13px', width: '100%', color: '#0f172a', fontWeight: 500 }}
            />
            {searchQuery && (
              <div onClick={() => setSearchQuery('')} style={{ cursor: 'pointer', color: '#94a3b8', fontSize: '14px', marginLeft: '4px', fontWeight: 'bold' }}>✕</div>
            )}
          </Box>

          <Box display="flex" alignItems="center" gap={1}>
            <SearchableSelect
              value={filterBillingStatus}
              onChange={(e) => setFilterBillingStatus(e.target.value)}
              size="small"
              sx={{ borderRadius: '10px', fontSize: '12px', fontWeight: 600, bgcolor: '#f8fafc', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' }, minWidth: 140 }}
            >
              <MenuItem value="All" sx={{ fontSize: '12px' }}>All Billing Status</MenuItem>
              <MenuItem value="Billed" sx={{ fontSize: '12px' }}>Billed Only</MenuItem>
              <MenuItem value="Pending" sx={{ fontSize: '12px' }}>Pending Only</MenuItem>
            </SearchableSelect>

            <SearchableSelect
              value={filterChallanStatus}
              onChange={(e) => setFilterChallanStatus(e.target.value)}
              size="small"
              sx={{ borderRadius: '10px', fontSize: '12px', fontWeight: 600, bgcolor: '#f8fafc', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' }, minWidth: 140 }}
            >
              <MenuItem value="All" sx={{ fontSize: '12px' }}>All Challan Status</MenuItem>
              <MenuItem value="Stamped" sx={{ fontSize: '12px' }}>Stamped Only</MenuItem>
              <MenuItem value="Non-Stamped" sx={{ fontSize: '12px' }}>Non-Stamped Only</MenuItem>
              <MenuItem value="Empty" sx={{ fontSize: '12px' }}>Empty Only</MenuItem>
            </SearchableSelect>
          </Box>
          {getStatusChip()}
          <Box display="flex" gap={1} alignItems="center">
            {dirtyCount > 0 && <Chip label={`${dirtyCount} unsaved`} size="small" sx={{ height: 22, fontSize: '0.7rem', fontWeight: 700, bgcolor: '#fef3c7', color: '#d97706', border: '1px solid #fde68a' }} />}
            {selectedIds.size > 0 && <Chip label={`${selectedIds.size} selected`} size="small" sx={{ height: 22, fontSize: '0.7rem', fontWeight: 700, bgcolor: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca' }} />}
          </Box>
        </Box>

        {/* Actions Right Side */}
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          {selectedIds.size > 0 && (
            <Button size="small" variant="outlined"
              onClick={() => setIsBillingModalOpen(true)}
              sx={{
                fontWeight: 700, borderRadius: '10px', px: 2, fontSize: '0.8rem',
                color: '#4f46e5', borderColor: '#c7d2fe', bgcolor: '#eef2ff',
                textTransform: 'none',
                '&:hover': { bgcolor: '#e0e7ff', borderColor: '#a5b4fc' },
              }}>
              Run Batch Billing
            </Button>
          )}

          {selectedIds.size > 0 && (
            <Button size="small" variant="contained" color="error" startIcon={<DeleteIcon sx={{ fontSize: '1rem' }} />}
              onClick={() => setConfirmDel(true)}
              sx={{ fontWeight: 700, borderRadius: '10px', fontSize: '0.8rem', textTransform: 'none', boxShadow: 'none' }}>
              Delete
            </Button>
          )}

          <Box sx={{ width: '1px', height: '24px', bgcolor: '#e2e8f0', mx: 0.5, display: { xs: 'none', md: 'block' } }} />

          <Button size="small" variant="outlined" startIcon={<DownloadIcon sx={{ fontSize: '1rem' }} />} onClick={handleExport}
            sx={{ fontWeight: 700, borderRadius: '10px', fontSize: '0.8rem', color: '#475569', borderColor: '#e2e8f0', textTransform: 'none', '&:hover': { bgcolor: '#f8fafc', borderColor: '#cbd5e1' } }}>
            Export
          </Button>

          {saveCompleted && (
            <Button
              size="small" variant="outlined" startIcon={<UploadIcon sx={{ fontSize: '1rem' }} />}
              onClick={() => { setShowExcelWizard(true); setWizardStep(1); setWizardPreview(null); setValidationResult({ errors: [], warnings: [] }); setAcceptWarnings(false); }}
              sx={{ fontWeight: 700, borderRadius: '10px', fontSize: '0.8rem', textTransform: 'none', color: '#6d28d9', borderColor: '#c4b5fd', '&:hover': { bgcolor: '#f5f3ff', borderColor: '#a78bfa' } }}
            >
              Upload New
            </Button>
          )}

          <Button
            size="small" variant="contained" startIcon={<UploadIcon sx={{ fontSize: '1rem' }} />}
            onClick={() => { setShowExcelWizard(true); setWizardStep(1); setWizardPreview(null); setValidationResult({ errors: [], warnings: [] }); setAcceptWarnings(false); }}
            disabled={saveCompleted}
            sx={{
              fontWeight: 700, borderRadius: '10px', fontSize: '0.8rem', textTransform: 'none', boxShadow: 'none',
              background: saveCompleted ? '#f1f5f9' : 'linear-gradient(135deg,#7c3aed,#6d28d9)',
              color: saveCompleted ? '#94a3b8' : '#fff',
              '&:hover': { background: saveCompleted ? '#f1f5f9' : 'linear-gradient(135deg,#6d28d9,#5b21b6)' },
              '&:disabled': { background: '#f1f5f9', color: '#94a3b8' },
            }}
          >
            Import Excel
          </Button>

          <Button
            size="small" variant="contained"
            startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon sx={{ fontSize: '1.1rem' }} />}
            onClick={handleSave} disabled={(dirtyCount === 0 && unsavedImportRows.length === 0) || saving}
            sx={{
              fontWeight: 700, borderRadius: '10px', px: 2.5, fontSize: '0.85rem', textTransform: 'none',
              background: (dirtyCount > 0 || unsavedImportRows.length > 0) ? 'linear-gradient(135deg,#10b981,#059669)' : '#f1f5f9',
              color: (dirtyCount > 0 || unsavedImportRows.length > 0) ? '#fff' : '#94a3b8',
              boxShadow: (dirtyCount > 0 || unsavedImportRows.length > 0) ? '0 4px 12px rgba(16, 185, 129, 0.25)' : 'none',
              '&:hover': { background: (dirtyCount > 0 || unsavedImportRows.length > 0) ? 'linear-gradient(135deg,#059669,#047857)' : '#f1f5f9' },
            }}>
            {saving ? 'Saving…' : `Save${(dirtyCount + unsavedImportRows.length) > 0 ? ` (${dirtyCount + unsavedImportRows.length})` : ''}`}
          </Button>

          <Tooltip title="Refresh Data">
            <IconButton size="small" onClick={() => fetchData()} sx={{ bgcolor: '#f8fafc', border: '1px solid #e2e8f0', '&:hover': { bgcolor: '#f1f5f9' }, p: 0.75, borderRadius: '10px' }}>
              <RefreshIcon sx={{ fontSize: '1.1rem', color: '#475569' }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* ── Group header row ─────────────────────────────────────────────── */}
      <Box sx={{ overflow: 'auto', flex: 1, m: { xs: 1, md: 2 }, borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 15px rgba(0,0,0,0.03)', bgcolor: '#fff' }}>
        <table style={{
          borderCollapse: 'collapse', minWidth: '100%',
          tableLayout: 'fixed', fontFamily: 'Inter, system-ui, sans-serif', fontSize: '11px'
        }}>
          {/* Col widths */}
          <colgroup>
            <col style={{ width: 40, minWidth: 40 }} />{/* checkbox */}
            {VISIBLE_COLS.map(c => <col key={c.key} style={{ width: c.width, minWidth: c.width }} />)}
          </colgroup>

          <thead>
            {/* Column headers */}
            <tr>
              {/* Select-all checkbox */}
              <th style={{
                position: 'sticky', top: 0, zIndex: 3, width: 40, minWidth: 40,
                background: '#0f172a',
                textAlign: 'center', padding: '10px 4px',
                borderRight: '1px solid rgba(255,255,255,0.1)',
                borderBottom: '1px solid rgba(255,255,255,0.2)',
              }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={el => { if (el) el.indeterminate = someSelected; }}
                  onChange={toggleSelectAll}
                  style={{ cursor: 'pointer', width: 14, height: 14, accentColor: '#7c3aed' }}
                />
              </th>
              {VISIBLE_COLS.map((col) => {
                // Refined premium header colors
                const typeStyle = col.type === 'auto'
                  ? { background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)', color: '#e2e8f0' } // Slate
                  : col.type === 'calc'
                    ? { background: 'linear-gradient(180deg, #064e3b 0%, #022c22 100%)', color: '#a7f3d0' } // Emerald
                    : col.type === 'dropdown'
                      ? { background: 'linear-gradient(180deg, #7c2d12 0%, #431407 100%)', color: '#fed7aa' } // Orange
                      : { background: 'linear-gradient(180deg, #1e3a8a 0%, #172554 100%)', color: '#bfdbfe' }; // Blue (Manual)
                return (
                  <th key={col.key}
                    title={col.hint || col.label}
                    style={{
                      position: 'sticky', top: 0, zIndex: 2,
                      ...typeStyle,
                      padding: '10px 6px',
                      textAlign: 'center',
                      fontSize: '10px', fontWeight: 700,
                      letterSpacing: '0.5px',
                      whiteSpace: 'pre-line', lineHeight: 1.2,
                      borderRight: '1px solid rgba(255,255,255,0.05)',
                      borderBottom: '1px solid rgba(255,255,255,0.1)',
                    }}>
                    {col.label}
                    {col.type === 'auto' && <div style={{ fontSize: '7px', opacity: 0.6, marginTop: 4, letterSpacing: '1px' }}>AUTO</div>}
                    {col.type === 'calc' && <div style={{ fontSize: '7px', opacity: 0.7, marginTop: 4, letterSpacing: '1px' }}>CALC</div>}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {computedRows.length === 0 && (
              <tr>
                <td colSpan={VISIBLE_COLS.length + 1} style={{
                  textAlign: 'center', padding: '60px', color: '#64748b', fontSize: '13px'
                }}>
                  No entries found. Upload and approve an invoice slip — data will auto-populate here.
                </td>
              </tr>
            )}
            {filteredRows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((row, index) => {
              const ri = page * rowsPerPage + index;
              const hasDraft = !!localData[row._id];
              const isSelected = selectedIds.has(row._id);

              const isMatch = !!searchQuery;

              const isLocked = row['Billing Completed'] === 'Yes';

              return (
                <tr key={row._id} style={{
                  background: isLocked ? '#f8fafc' : isMatch
                    ? '#f1f5f9'
                    : isSelected
                      ? '#f5f3ff'
                      : row.isUnsavedImport
                        ? '#fdf4ff'
                        : hasDraft ? '#fffbeb'
                          : ri % 2 === 0 ? '#ffffff' : '#fafafa',
                  outline: isMatch ? '2px solid #cbd5e1' : (isSelected ? '2px solid rgba(124,58,237,0.4)' : 'none'),
                  transition: 'background 0.2s, opacity 0.2s',
                  opacity: isLocked ? 0.85 : 1,
                  boxShadow: isLocked ? 'inset 0 0 0 9999px rgba(226,232,240,0.3)' : 'none'
                }} className="table-row-hover">
                  {/* Row checkbox */}
                  <td style={{
                    width: 40, minWidth: 40, textAlign: 'center',
                    border: '1px solid #e2e8f0', padding: '4px',
                    background: isSelected ? 'rgba(124,58,237,0.06)' : 'transparent',
                  }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isLocked}
                      onChange={() => toggleSelect(row._id)}
                      style={{
                        cursor: isLocked ? 'not-allowed' : 'pointer',
                        width: 13, height: 13, accentColor: '#7c3aed'
                      }}
                    />
                  </td>
                  {VISIBLE_COLS.map((col) => {
                    const rawVal = row[col.key];
                    const localVal = localData[row._id]?.[col.key];
                    const displayVal = localVal !== undefined
                      ? localVal
                      : (rawVal !== null && rawVal !== undefined ? String(rawVal) : '');
                    const isDirty = localVal !== undefined;
                    const gc = GROUP_COLORS[col.group] || GROUP_COLORS.id;

                    return (
                      <CellRenderer
                        key={col.key}
                        col={col}
                        value={displayVal}
                        isDirty={isDirty}
                        rowIndex={ri}
                        row={row}
                        onChange={(val) => handleCellEdit(row._id, col.key, val)}
                        onAttachSaved={(field, url) => {
                          const billNo = row['BILL NO'];
                          setEntries(prev => prev.map(r => {
                            if (field === 'BILL_PDF_URL' && billNo && r['BILL NO'] === billNo) {
                              return { ...r, [field]: url };
                            }
                            return r._id === row._id ? { ...r, [field]: url } : r;
                          }));
                        }}
                      />
                    );
                  })}
                </tr>
              );
            })}
            {filteredRows.length > 0 && (
              <tr style={{
                fontWeight: 900,
                borderTop: '2px double #cbd5e1',
                borderBottom: '2px solid #cbd5e1',
              }}>
                <td style={{
                  border: '1px solid #cbd5e1', padding: '10px 6px', textAlign: 'center',
                  color: '#475569', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px',
                  position: 'sticky', bottom: 0, zIndex: 10,
                  background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
                  boxShadow: '0 -2px 10px rgba(0,0,0,0.05)'
                }}>
                  Σ
                </td>
                {VISIBLE_COLS.map((col, idx) => {
                  const isFirst = idx === 0;
                  const isNumeric = NUMERIC_KEYS.has(col.key);
                  const val = isNumeric ? monthlyTotals[col.key] : '';
                  const display = isFirst
                    ? `TOTAL (${MONTHS[selectedMonth - 1] || ''})`
                    : isNumeric
                      ? formatTotalValue(col.key, val)
                      : '';

                  return (
                    <td key={`total-${col.key}`} style={{
                      border: '1px solid #cbd5e1',
                      padding: '10px 8px',
                      fontSize: '11px',
                      color: isFirst ? '#0f172a' : '#1e293b',
                      textAlign: isNumeric ? 'right' : 'left',
                      fontWeight: 900,
                      position: 'sticky', bottom: 0, zIndex: 10,
                      background: isNumeric
                        ? 'linear-gradient(180deg, #f5f3ff 0%, #ede9fe 100%)' // purple tint for numeric total cells
                        : 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
                      boxShadow: '0 -2px 10px rgba(0,0,0,0.05)'
                    }}>
                      {display}
                    </td>
                  );
                })}
              </tr>
            )}
          </tbody>
        </table>
      </Box>
      <TablePagination
        component="div"
        count={filteredRows.length}
        page={page}
        onPageChange={handleChangePage}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={handleChangeRowsPerPage}
        rowsPerPageOptions={[50, 100, 250, 500]}
        sx={{
          borderTop: '1px solid #e2e8f0',
          '.MuiTablePagination-toolbar': { minHeight: 40, py: 0 },
          '.MuiTablePagination-selectLabel, .MuiTablePagination-displayedRows': { fontSize: '12px', color: '#64748b' }
        }}
      />

      {/* ══════════════════════════════════════════════════════════════════════
           Excel Import Wizard Modal
      ══════════════════════════════════════════════════════════════════════ */}
      {showExcelWizard && (
        <Box sx={{
          position: 'fixed', inset: 0, zIndex: 10000,
          background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2,
        }} onClick={() => !wizardImporting && (setShowExcelWizard(false), setWizardStep(1), setWizardPreview(null), setValidationResult({ errors: [], warnings: [] }), setAcceptWarnings(false))}>

          <Box sx={{
            bgcolor: '#fff', borderRadius: '20px',
            maxWidth: 680, width: '100%',
            boxShadow: '0 32px 100px rgba(0,0,0,0.4)',
            overflow: 'hidden', display: 'flex', flexDirection: 'column',
          }} onClick={e => e.stopPropagation()}>

            {/* ── Header ── */}
            <Box sx={{ background: 'linear-gradient(135deg,#4c1d95,#7c3aed,#6d28d9)', px: 3.5, pt: 3, pb: 2.5 }}>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="h6" fontWeight={800} color="#fff" sx={{ letterSpacing: '-0.4px' }}>
                    📥 Import Excel to Cement Register
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>
                    Step {wizardStep} of 2 — {wizardStep === 1 ? 'Select Period' : 'Preview & Confirm'}
                  </Typography>
                </Box>
                {/* Step pills */}
                <Box display="flex" gap={1}>
                  {[1, 2].map(s => (
                    <Box key={s} sx={{
                      width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 800, fontSize: '12px',
                      bgcolor: wizardStep >= s ? '#fff' : 'rgba(255,255,255,0.2)',
                      color: wizardStep >= s ? '#7c3aed' : 'rgba(255,255,255,0.5)',
                    }}>{s}</Box>
                  ))}
                </Box>
              </Box>
            </Box>

            {/* ── Step 1: Month + Year selector ── */}
            {wizardStep === 1 && (
              <Box sx={{ px: 3.5, py: 3 }}>
                <Typography fontWeight={700} fontSize="14px" color="#0f172a" mb={0.5}>
                  Which month &amp; year does this Excel sheet cover?
                </Typography>
                <Typography fontSize="12px" color="#64748b" mb={3}>
                  Only rows matching this period will be imported into the register.
                </Typography>

                <Box display="flex" gap={2} mb={4}>
                  {/* Month */}
                  <Box flex={2}>
                    <Typography fontSize="11px" fontWeight={700} color="#475569" mb={0.75} sx={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>Month</Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 0.75 }}>
                      {MONTHS.map((mo, idx) => (
                        <Box key={mo}
                          onClick={() => setWizardMonth(idx + 1)}
                          sx={{
                            py: 0.9, textAlign: 'center', borderRadius: '10px', cursor: 'pointer',
                            fontSize: '12px', fontWeight: wizardMonth === idx + 1 ? 800 : 500,
                            border: `2px solid ${wizardMonth === idx + 1 ? '#7c3aed' : '#e2e8f0'}`,
                            bgcolor: wizardMonth === idx + 1 ? '#ede9fe' : '#f8fafc',
                            color: wizardMonth === idx + 1 ? '#5b21b6' : '#475569',
                            transition: 'all 0.15s',
                            '&:hover': { borderColor: '#c4b5fd', bgcolor: '#f5f3ff' },
                          }}>{mo.slice(0, 3)}</Box>
                      ))}
                    </Box>
                  </Box>

                  {/* Year */}
                  <Box flex={1}>
                    <Typography fontSize="11px" fontWeight={700} color="#475569" mb={0.75} sx={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>Year</Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                      {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map(yr => (
                        <Box key={yr}
                          onClick={() => setWizardYear(yr)}
                          sx={{
                            py: 1, textAlign: 'center', borderRadius: '10px', cursor: 'pointer',
                            fontSize: '13px', fontWeight: wizardYear === yr ? 800 : 500,
                            border: `2px solid ${wizardYear === yr ? '#7c3aed' : '#e2e8f0'}`,
                            bgcolor: wizardYear === yr ? '#ede9fe' : '#f8fafc',
                            color: wizardYear === yr ? '#5b21b6' : '#475569',
                            transition: 'all 0.15s',
                            '&:hover': { borderColor: '#c4b5fd', bgcolor: '#f5f3ff' },
                          }}>{yr}-{yr + 1}</Box>
                      ))}
                    </Box>
                  </Box>
                </Box>

                {/* Selected summary */}
                <Box sx={{ bgcolor: '#ede9fe', border: '1.5px solid #c4b5fd', borderRadius: '12px', px: 2.5, py: 1.5, mb: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <span style={{ fontSize: '20px' }}>📅</span>
                  <Box>
                    <Typography fontSize="11px" color="#6d28d9" fontWeight={700}>Selected Period</Typography>
                    <Typography fontSize="15px" fontWeight={800} color="#4c1d95">
                      {MONTHS[wizardMonth - 1]} {wizardYear}-{wizardYear + 1}
                    </Typography>
                  </Box>
                </Box>

                {/* Next: pick file */}
                <Box sx={{
                  bgcolor: '#f8fafc', border: '2px dashed #c4b5fd', borderRadius: '14px', p: 3, textAlign: 'center', cursor: 'pointer',
                  '&:hover': { bgcolor: '#f5f3ff', borderColor: '#7c3aed' }, transition: 'all 0.2s'
                }}
                  onClick={() => wizardFileRef.current?.click()}
                >
                  <Box sx={{ fontSize: '36px', mb: 1 }}>📊</Box>
                  <Typography fontWeight={700} color="#5b21b6" fontSize="14px">Click to select your Excel file</Typography>
                  <Typography fontSize="11px" color="#94a3b8" mt={0.5}>.xlsx or .xls files accepted</Typography>
                  <input ref={wizardFileRef} type="file" accept=".xlsx,.xls" hidden onChange={handleWizardFileSelect} />
                </Box>

                <Box display="flex" justifyContent="flex-end" mt={2}>
                  <Button variant="outlined" size="small" onClick={() => { setShowExcelWizard(false); setValidationResult({ errors: [], warnings: [] }); setAcceptWarnings(false); }}
                    sx={{ fontWeight: 700, borderRadius: '10px', textTransform: 'none' }}>Cancel</Button>
                </Box>
              </Box>
            )}

            {/* ── Step 2: Preview ── */}
            {wizardStep === 2 && wizardPreview && (
              <Box sx={{ px: 3.5, py: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>

                {/* Validation Report Banner */}
                <Box>
                  {validationResult.errors.length > 0 ? (
                    <Box sx={{
                      bgcolor: '#fee2e2', border: '1.5px solid #fca5a5', borderRadius: '10px', p: 2,
                      display: 'flex', flexDirection: 'column', gap: 1
                    }}>
                      <Typography fontSize="13px" fontWeight={800} color="#991b1b">
                        ❌ Validation Failed ({validationResult.errors.length} Critical Errors)
                      </Typography>
                      <Box sx={{ maxHeight: 120, overflowY: 'auto', pl: 2 }}>
                        {validationResult.errors.map((err, i) => (
                          <Typography key={i} fontSize="11.5px" color="#b91c1c" sx={{ listStyleType: 'disc', display: 'list-item', mb: 0.5 }}>
                            {err}
                          </Typography>
                        ))}
                      </Box>
                      <Typography fontSize="11px" color="#7f1d1d" sx={{ mt: 0.5 }}>
                        Please correct the Excel file to fix these missing fields before importing.
                      </Typography>
                    </Box>
                  ) : validationResult.warnings.length > 0 ? (
                    <Box sx={{
                      bgcolor: '#fef3c7', border: '1.5px solid #fcd34d', borderRadius: '10px', p: 2,
                      display: 'flex', flexDirection: 'column', gap: 1
                    }}>
                      <Typography fontSize="13px" fontWeight={800} color="#92400e">
                        ⚠️ Import Warnings Found ({validationResult.warnings.length} Warnings)
                      </Typography>
                      <Box sx={{ maxHeight: 120, overflowY: 'auto', pl: 2 }}>
                        {validationResult.warnings.map((warn, i) => (
                          <Typography key={i} fontSize="11.5px" color="#b45309" sx={{ listStyleType: 'disc', display: 'list-item', mb: 0.5 }}>
                            {warn}
                          </Typography>
                        ))}
                      </Box>
                      <Box display="flex" alignItems="center" gap={1} sx={{ mt: 1 }}>
                        <input
                          type="checkbox"
                          id="accept-warnings"
                          checked={acceptWarnings}
                          onChange={(e) => setAcceptWarnings(e.target.checked)}
                          style={{ cursor: 'pointer', width: 16, height: 16 }}
                        />
                        <label htmlFor="accept-warnings" style={{ fontSize: '12px', fontWeight: 700, color: '#78350f', cursor: 'pointer' }}>
                          I have reviewed these warnings and want to proceed with importing
                        </label>
                      </Box>
                    </Box>
                  ) : (
                    <Box sx={{
                      bgcolor: '#ecfdf5', border: '1.5px solid #a7f3d0', borderRadius: '10px', p: 1.5,
                      display: 'flex', alignItems: 'center', gap: 1
                    }}>
                      <Typography fontSize="13px" fontWeight={800} color="#065f46">
                        ✅ Validation Passed: No missing fields or duplicate entries found. Ready to import!
                      </Typography>
                    </Box>
                  )}
                </Box>

                {/* Stats bar */}
                <Box display="flex" gap={1.5} flexWrap="wrap">
                  <Box sx={{ bgcolor: '#f0fdf4', border: '1px solid #86efac', borderRadius: '10px', px: 2, py: 1.2, flex: 1, minWidth: 100, textAlign: 'center' }}>
                    <Typography variant="h5" fontWeight={800} color="#16a34a">{wizardPreview.totalInFile}</Typography>
                    <Typography fontSize="11px" color="#15803d" fontWeight={600}>Total in File</Typography>
                  </Box>
                  <Box sx={{ bgcolor: '#ede9fe', border: '1px solid #c4b5fd', borderRadius: '10px', px: 2, py: 1.2, flex: 1, minWidth: 100, textAlign: 'center' }}>
                    <Typography variant="h5" fontWeight={800} color="#7c3aed">{wizardPreview.filteredRows.length}</Typography>
                    <Typography fontSize="11px" color="#6d28d9" fontWeight={600}>{MONTHS[wizardMonth - 1]} {wizardYear}-{wizardYear + 1}</Typography>
                  </Box>
                  <Box sx={{ bgcolor: '#dbeafe', border: '1px solid #93c5fd', borderRadius: '10px', px: 2, py: 1.2, flex: 1, minWidth: 100, textAlign: 'center' }}>
                    <Typography variant="h5" fontWeight={800} color="#1d4ed8">{wizardPreview.mappedCount}</Typography>
                    <Typography fontSize="11px" color="#1e40af" fontWeight={600}>Cols Mapped</Typography>
                  </Box>
                  {wizardPreview.unmappedHeaders.length > 0 && (
                    <Box sx={{ bgcolor: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '10px', px: 2, py: 1.2, flex: 1, minWidth: 100, textAlign: 'center' }}>
                      <Typography variant="h5" fontWeight={800} color="#d97706">{wizardPreview.unmappedHeaders.length}</Typography>
                      <Typography fontSize="11px" color="#b45309" fontWeight={600}>Skipped Cols</Typography>
                    </Box>
                  )}
                </Box>

                {/* Mapped columns */}
                <Box>
                  <Typography fontSize="11px" fontWeight={700} color="#475569" sx={{ textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.75 }}>Column Mapping</Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, maxHeight: 80, overflowY: 'auto' }}>
                    {Object.entries(wizardPreview.headerMapping).map(([colIdxStr, internalKey]) => {
                      const colIdx = parseInt(colIdxStr, 10);
                      const excelH = wizardPreview.excelHeaders?.[colIdx] || colIdx;
                      return (
                        <Box key={colIdxStr} sx={{
                          bgcolor: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px',
                          px: 1, py: 0.25, fontSize: '10.5px', fontWeight: 600,
                          display: 'flex', alignItems: 'center', gap: 0.5,
                        }}>
                          <span style={{ color: '#94a3b8' }}>{excelH}</span>
                          <span style={{ color: '#cbd5e1' }}>→</span>
                          <span style={{ color: '#15803d' }}>{internalKey}</span>
                        </Box>
                      );
                    })}
                    {wizardPreview.unmappedHeaders.map(h => (
                      <Box key={h} sx={{
                        bgcolor: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '6px',
                        px: 1, py: 0.25, fontSize: '10.5px', fontWeight: 600, color: '#92400e',
                        textDecoration: 'line-through',
                      }}>{h}</Box>
                    ))}
                  </Box>
                </Box>

                {/* Data preview table */}
                <Box>
                  <Typography fontSize="11px" fontWeight={700} color="#475569" sx={{ textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.75 }}>
                    Data Preview — {wizardPreview.filteredRows.length} rows for {MONTHS[wizardMonth - 1]} {wizardYear}-{wizardYear + 1}
                  </Typography>
                  {wizardPreview.filteredRows.length === 0 ? (
                    <Box sx={{ bgcolor: '#fef3c7', border: '1.5px solid #fcd34d', borderRadius: '10px', p: 2.5, textAlign: 'center' }}>
                      <Typography fontSize="13px" fontWeight={700} color="#d97706">⚠️ No rows found for {MONTHS[wizardMonth - 1]} {wizardYear}-{wizardYear + 1}</Typography>
                      <Typography fontSize="12px" color="#92400e" mt={0.5}>
                        {wizardPreview.filterApplied
                          ? 'The date column in your Excel does not contain entries for this period. Try a different month/year.'
                          : 'No date column was recognised. All rows will be imported.'}
                      </Typography>
                      {wizardPreview.allRows.length > 0 && (
                        <Button
                          variant="contained" size="small"
                          onClick={() => setWizardPreview(prev => ({ ...prev, filteredRows: prev.allRows, filterApplied: false }))}
                          sx={{ mt: 2, fontWeight: 800, textTransform: 'none', bgcolor: '#d97706', '&:hover': { bgcolor: '#b45309' }, boxShadow: 'none' }}
                        >
                          Import All {wizardPreview.allRows.length} Rows Anyway
                        </Button>
                      )}
                    </Box>
                  ) : (
                    <Box sx={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', maxHeight: 200, overflowY: 'auto', overflowX: 'auto' }}>
                      <table style={{ borderCollapse: 'collapse', fontSize: '11px', width: '100%', fontFamily: 'Inter,system-ui,sans-serif' }}>
                        <thead>
                          <tr style={{ background: 'linear-gradient(135deg,#4c1d95,#6d28d9)', position: 'sticky', top: 0 }}>
                            <th style={{ padding: '7px 10px', color: 'rgba(255,255,255,0.6)', fontWeight: 700, textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.1)', minWidth: 36 }}>#</th>
                            {Object.keys(wizardPreview.headerMapping).slice(0, 10).map(excelH => (
                              <th key={excelH} style={{ padding: '7px 10px', color: '#e9d5ff', fontWeight: 700, textAlign: 'left', borderRight: '1px solid rgba(255,255,255,0.1)', whiteSpace: 'nowrap' }}>
                                {wizardPreview.headerMapping[excelH]}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {wizardPreview.filteredRows.slice(0, 8).map((row, ri) => (
                            <tr key={ri} style={{ background: ri % 2 === 0 ? '#fff' : '#f8fafc' }}>
                              <td style={{ padding: '5px 10px', color: '#94a3b8', fontWeight: 600, textAlign: 'center', borderBottom: '1px solid #f1f5f9', borderRight: '1px solid #f1f5f9' }}>{ri + 1}</td>
                              {Object.keys(wizardPreview.headerMapping).slice(0, 10).map(excelH => {
                                const k = wizardPreview.headerMapping[excelH];
                                return (
                                  <td key={excelH} style={{ padding: '5px 10px', borderBottom: '1px solid #f1f5f9', borderRight: '1px solid #f1f5f9', whiteSpace: 'nowrap', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', color: '#1e293b' }}>
                                    {row[k] || <span style={{ color: '#cbd5e1' }}>—</span>}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {wizardPreview.filteredRows.length > 8 && (
                        <Box sx={{ px: 2, py: 1, bgcolor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                          <Typography fontSize="11px" color="#64748b">+ {wizardPreview.filteredRows.length - 8} more rows…</Typography>
                        </Box>
                      )}
                    </Box>
                  )}
                </Box>

                {/* Actions */}
                <Box display="flex" gap={1.5} justifyContent="space-between" alignItems="center" pt={0.5}>
                  <Button variant="text" size="small" onClick={() => { setWizardStep(1); setWizardPreview(null); setValidationResult({ errors: [], warnings: [] }); setAcceptWarnings(false); }}
                    disabled={wizardImporting}
                    sx={{ fontWeight: 700, borderRadius: '10px', textTransform: 'none', color: '#64748b' }}>
                    ← Back
                  </Button>
                  <Box display="flex" gap={1.5}>
                    <Button variant="outlined" size="small" onClick={() => { setShowExcelWizard(false); setWizardStep(1); setWizardPreview(null); setValidationResult({ errors: [], warnings: [] }); setAcceptWarnings(false); }}
                      disabled={wizardImporting}
                      sx={{ fontWeight: 700, borderRadius: '10px', textTransform: 'none' }}>Cancel</Button>
                    <Button
                      variant="contained" size="small"
                      onClick={handleWizardImportConfirm}
                      disabled={
                        wizardImporting ||
                        !wizardPreview.filteredRows.length ||
                        validationResult.errors.length > 0 ||
                        (validationResult.warnings.length > 0 && !acceptWarnings)
                      }
                      startIcon={wizardImporting ? <CircularProgress size={14} color="inherit" /> : <UploadIcon sx={{ fontSize: '1rem' }} />}
                      sx={{
                        fontWeight: 800, borderRadius: '10px', textTransform: 'none', px: 2.5,
                        background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', boxShadow: 'none',
                        '&:hover': { background: 'linear-gradient(135deg,#6d28d9,#5b21b6)', boxShadow: '0 4px 14px rgba(124,58,237,0.35)' },
                        '&:disabled': { background: '#e2e8f0', color: '#94a3b8' },
                      }}
                    >
                      {wizardImporting ? 'Importing…' : `Import ${wizardPreview.filteredRows.length} Rows`}
                    </Button>
                  </Box>
                </Box>
              </Box>
            )}
          </Box>
        </Box>
      )}

      {/* ── Confirm delete dialog ──────────────────────────────────────────── */}
      {confirmDel && (
        <Box sx={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setConfirmDel(false)}>
          <Box sx={{
            bgcolor: '#fff', borderRadius: 3, p: 4, maxWidth: 420, width: '90%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }} onClick={e => e.stopPropagation()}>
            <Typography variant="h6" fontWeight={800} color="error.main" mb={1}>
              🗑️ Delete {selectedIds.size} Row{selectedIds.size > 1 ? 's' : ''}?
            </Typography>
            <Typography color="text.secondary" fontSize="13px" mb={3}>
              This will permanently remove the selected cement register entries from MongoDB.
              This action <strong>cannot be undone</strong>.
            </Typography>
            <Box display="flex" gap={1.5} justifyContent="flex-end">
              <Button variant="outlined" size="small" onClick={() => setConfirmDel(false)}
                sx={{ fontWeight: 700 }}>Cancel</Button>
              <Button variant="contained" size="small" color="error"
                startIcon={deleting ? <CircularProgress size={13} color="inherit" /> : <DeleteIcon />}
                onClick={handleBulkDelete} disabled={deleting}
                sx={{ fontWeight: 800 }}>
                {deleting ? 'Deleting…' : 'Yes, Delete'}
              </Button>
            </Box>
          </Box>
        </Box>
      )}

      {/* ── Confirm overwrite dialog ────────────────────────────────────────── */}
      {confirmOverwrite && (
        <Box sx={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setConfirmOverwrite(false)}>
          <Box sx={{
            bgcolor: '#fff', borderRadius: 3, p: 4, maxWidth: 460, width: '90%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }} onClick={e => e.stopPropagation()}>
            <Typography variant="h6" fontWeight={800} color="warning.main" mb={1} display="flex" alignItems="center" gap={1}>
              ⚠️ Overwrite Existing Data?
            </Typography>
            <Typography color="text.secondary" fontSize="13px" mb={3}>
              There is already saved data for <strong>{MONTHS[selectedMonth - 1]} {selectedYear}</strong> in the database.
              Saving these changes will <strong>permanently delete all existing records</strong> for this period and insert the newly uploaded Excel entries.
              This action cannot be undone. Do you want to proceed?
            </Typography>
            <Box display="flex" gap={1.5} justifyContent="flex-end">
              <Button variant="outlined" size="small" onClick={() => setConfirmOverwrite(false)}
                sx={{ fontWeight: 700 }}>Cancel</Button>
              <Button variant="contained" size="small" color="warning"
                startIcon={saving ? <CircularProgress size={13} color="inherit" /> : <SaveIcon />}
                onClick={() => executeSave(true)} disabled={saving}
                sx={{
                  fontWeight: 800,
                  bgcolor: '#d97706',
                  '&:hover': { bgcolor: '#b45309' }
                }}>
                {saving ? 'Saving…' : 'Yes, Overwrite & Save'}
              </Button>
            </Box>
          </Box>
        </Box>
      )}

      {/* ── Snackbar: manual save result ─────────────────────────────────── */}

      <Snackbar open={!!snack} autoHideDuration={4500} onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {snack && (
          <Alert severity={snack.severity} onClose={() => setSnack(null)} variant="filled" sx={{ fontWeight: 600 }}>
            {snack.msg}
          </Alert>
        )}
      </Snackbar>

      {/* ── Snackbar: real-time live update notification ──────────────────── */}
      <Snackbar open={!!liveMsg} autoHideDuration={3500} onClose={() => setLiveMsg(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <Alert severity="info" variant="filled" onClose={() => setLiveMsg(null)}
          sx={{ fontWeight: 700, fontSize: '12px', bgcolor: '#1d4ed8' }}>
          {liveMsg}
        </Alert>
      </Snackbar>

      {/* ── Billing Confirmation Modal ──────────────────────────────────── */}
      <Dialog open={isBillingModalOpen} onClose={() => setIsBillingModalOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#0f172a' }}>
          Billing Confirmation
        </DialogTitle>
        <DialogContent sx={{ mt: 2, p: 3 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            You have selected {selectedIds.size} row(s). Please review the details below, set the Bill Date and Bill Type, and click Generate Bill.
          </Typography>

          <Box sx={{ overflowX: 'auto', mb: 3, border: '1px solid #e2e8f0', borderRadius: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                  <th style={{ padding: '8px', borderRight: '1px solid #e2e8f0' }}>Shipment Number</th>
                  <th style={{ padding: '8px', borderRight: '1px solid #e2e8f0' }}>Vehicle Number</th>
                  <th style={{ padding: '8px', borderRight: '1px solid #e2e8f0' }}>Invoice Number</th>
                  <th style={{ padding: '8px', borderRight: '1px solid #e2e8f0' }}>Trip Date</th>
                  <th style={{ padding: '8px', borderRight: '1px solid #e2e8f0' }}>Party Name</th>
                  <th style={{ padding: '8px', borderRight: '1px solid #e2e8f0' }}>Destination</th>
                  <th style={{ padding: '8px' }}>Freight Amount</th>
                </tr>
              </thead>
              <tbody>
                {[...selectedIds].map(id => {
                  const row = computedRows.find(r => r._id === id);
                  if (!row) return null;
                  return (
                    <tr key={id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '8px', borderRight: '1px solid #e2e8f0' }}>{row['SHIPMENT NO'] || ''}</td>
                      <td style={{ padding: '8px', borderRight: '1px solid #e2e8f0' }}>{row['VEHICLE NUMBER'] || ''}</td>
                      <td style={{ padding: '8px', borderRight: '1px solid #e2e8f0' }}>{row['INVOICE NO'] || ''}</td>
                      <td style={{ padding: '8px', borderRight: '1px solid #e2e8f0' }}>{row['LOADING DT'] || row['LOADING DATE'] || ''}</td>
                      <td style={{ padding: '8px', borderRight: '1px solid #e2e8f0' }}>{row['NAMES'] || ''}</td>
                      <td style={{ padding: '8px', borderRight: '1px solid #e2e8f0' }}>{row['SITE'] || ''}</td>
                      <td style={{ padding: '8px' }}>{row['BILLING ER 95%'] || row['BILLING ER VAR'] || ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Box>

          <Box sx={{ display: 'flex', gap: 3, alignItems: 'center' }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: '#475569', mb: 0.5, display: 'block' }}>BILL DATE</Typography>
              <input
                type="date"
                value={bulkBillInput.billDate}
                onChange={e => setBulkBillInput(prev => ({ ...prev, billDate: e.target.value }))}
                style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none' }}
              />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: '#475569', mb: 0.5, display: 'block' }}>BILL TYPE</Typography>
              <SearchableSelect
                value={bulkBillInput.billType}
                onChange={e => setBulkBillInput(prev => ({ ...prev, billType: e.target.value }))}
                fullWidth
                size="small"
                displayEmpty
                sx={{ borderRadius: '8px', bgcolor: '#fff', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#cbd5e1' } }}
              >
                <MenuItem value="" disabled>Select Bill Type</MenuItem>
                <MenuItem
                  value="Freight"
                  disabled={
                    computedRows.some(r => selectedIds.has(r._id) && r['Freight Generated'] === 'Yes')
                  }
                >Freight</MenuItem>
                <MenuItem
                  value="Unloading"
                  disabled={
                    computedRows.some(r => selectedIds.has(r._id) && r['Unloading Generated'] === 'Yes')
                  }
                >Unloading</MenuItem>
              </SearchableSelect>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 1, borderTop: '1px solid #e2e8f0', bgcolor: '#f8fafc' }}>
          <Button onClick={() => setIsBillingModalOpen(false)} sx={{ color: '#64748b', fontWeight: 600 }}>Cancel</Button>
          <Button variant="contained" onClick={handleBulkBillApply} sx={{ bgcolor: '#0f172a', fontWeight: 700, px: 3, borderRadius: '8px', boxShadow: 'none' }}>
            Generate Bill
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}

// ─── Cell Renderer: decides how to render based on column type ────────────────
function CellRenderer({ col, value, isDirty, rowIndex, row, onChange, onAttachSaved }) {
  const cellStyle = {
    padding: '6px 8px',
    border: '1px solid #e2e8f0',
    fontSize: '11px',
    color: '#1e293b',
    whiteSpace: 'normal',
    wordBreak: 'break-word',
    lineHeight: 1.4,
    borderRight: isDirty ? '2px solid #f59e0b' : '1px solid #e2e8f0',
    background: isDirty ? 'rgba(254,243,199,0.6)' : 'inherit',
    width: col.width,
    maxWidth: col.width,
  };

  // Color-coded: challan status, bill type
  const cellColor = col.colorMap?.[value] || null;

  // ── Auto / Calc (may have hasAttach for Site Cash or Bill PDF) ────────────────
  if (col.type === 'auto' || col.type === 'calc') {
    const bg = cellColor ? cellColor : (col.type === 'auto'
      ? (isDirty ? 'rgba(254,243,199,0.5)' : 'rgba(241,245,249,0.7)') // Premium Light Sky Blue/Slate for Auto
      : (isDirty ? 'rgba(254,243,199,0.5)' : 'rgba(220,252,231,0.5)')); // Premium Light Emerald for Calc

    if (col.hasAttach === 'bill_pdf_auto') {
      const attachUrl = row?.['BILL_PDF_URL'];
      return (
        <td style={{ ...cellStyle, background: bg, padding: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', height: '100%', minHeight: '26px' }}>
            <span style={{ flex: 1, whiteSpace: 'normal', wordBreak: 'break-word', padding: '4px 5px', color: '#1e293b' }}>{value || ''}</span>
            <AttachButton rowId={row?._id} attachType="bill_pdf" existingUrl={attachUrl} onSaved={onAttachSaved} />
          </div>
        </td>
      );
    }

    if (col.hasAttach === 'site_cash_auto' || col.hasAttach === 'office_cash_auto') {
      // Auto-fetched from voucher slip PDF — show view-only icon, no manual upload
      const voucherPdfUrl = col.hasAttach === 'site_cash_auto' ? row?.['SITE_CASH_PROOF_URL'] : row?.['OFFICE_CASH_PROOF_URL'];
      return (
        <td style={{ ...cellStyle, background: bg, padding: '2px 4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, minHeight: '26px' }}>
            <span style={{ flex: 1, whiteSpace: 'normal', wordBreak: 'break-word' }}>{value || ''}</span>
            {voucherPdfUrl ? (
              <a
                href={voucherPdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="View Voucher Slip PDF"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 22, height: 22, borderRadius: 4,
                  background: '#fef2f2', border: '1px solid #fca5a5',
                  textDecoration: 'none', fontSize: '12px', flexShrink: 0,
                }}
              >📄</a>
            ) : (
              <span title="Voucher slip not yet available" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 22, height: 22, borderRadius: 4,
                background: '#f1f5f9', border: '1px dashed #cbd5e1',
                fontSize: '11px', color: '#94a3b8', flexShrink: 0,
              }}>—</span>
            )}
          </div>
        </td>
      );
    }
    return (
      <td style={{
        ...cellStyle, background: bg,
        color: col.type === 'calc' ? '#065f46' : '#1e293b',
        fontWeight: col.type === 'calc' ? 600 : 400, cursor: 'default',
      }}>
        {/* ── PAYMENT STATUS: render as a colored chip ── */}
        {col.key === 'PAYMENT STATUS' && value ? (
          <span style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: '999px',
            fontSize: '10px',
            fontWeight: 800,
            letterSpacing: '0.03em',
            background:
              value === 'Paid' ? '#dcfce7'
                : value === 'Partial' ? '#fef9c3'
                  : '#f1f5f9',
            color:
              value === 'Paid' ? '#15803d'
                : value === 'Partial' ? '#92400e'
                  : '#64748b',
            border: `1px solid ${value === 'Paid' ? '#86efac'
              : value === 'Partial' ? '#fde68a'
                : '#e2e8f0'
              }`,
          }}>
            {value === 'Paid' ? '✓ Paid'
              : value === 'Partial' ? '⚡ Partial'
                : value}
          </span>
        ) : col.key === 'DIFFERENCE' && value ? (
          <span style={{
            color: parseFloat(value) > 0 ? '#15803d' : parseFloat(value) < 0 ? '#dc2626' : '#64748b',
            fontWeight: parseFloat(value) !== 0 ? 800 : 400
          }}>
            {parseFloat(value) > 0 ? `+${value}` : value}
          </span>
        ) : value || ''}
      </td>
    );
  }

  // ── Dropdown (smart Challan Status color + hasAttach upload) ─────────────────
  if (col.type === 'dropdown') {
    let bgColor = cellColor || 'inherit';
    if (col.key === 'CHALLAN STATUS') {
      const origVal = row?.['CHALLAN STATUS'];
      const changedToStamp = isDirty && value === 'STAMP' && origVal !== 'STAMP';
      bgColor = changedToStamp ? '#bbf7d0'
        : value === 'STAMP' ? '#dcfce7'
          : value === 'NON STAMP' ? '#fee2e2'
            : 'inherit';
    }
    if (col.hasAttach) {
      const attachUrl = row?.['CHALLAN_PROOF_URL'];
      return (
        <td style={{ ...cellStyle, padding: 0, background: bgColor }}>
          <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
            <SearchableSelect
              value={value || ''}
              onChange={e => onChange(e.target.value)}
              variant="standard"
              sx={{
                flex: 1, minWidth: 0, height: '100%',
                '.MuiInputBase-input': {
                  fontSize: '11px', cursor: 'pointer', padding: '4px 5px !important',
                  color: value === 'STAMP' ? '#15803d' : value === 'NON STAMP' ? '#dc2626' : '#94a3b8',
                  fontWeight: 700,
                },
                '.MuiInput-underline:before': { borderBottom: 'none' },
                '.MuiInput-underline:hover:not(.Mui-disabled):before': { borderBottom: 'none' },
                '.MuiInput-underline:after': { borderBottom: 'none' },
                background: 'transparent'
              }}
            >
              {(col.options || []).map(opt => (
                <option key={opt} value={opt}>{opt || '(none)'}</option>
              ))}
            </SearchableSelect>
            <AttachButton rowId={row?._id} attachType={col.hasAttach} existingUrl={attachUrl} onSaved={onAttachSaved} />
          </div>
        </td>
      );
    }
    return (
      <td style={{ ...cellStyle, padding: 0, background: bgColor }}>
        <SearchableSelect
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          variant="standard"
          sx={{
            width: '100%', height: '100%',
            '.MuiInputBase-input': {
              fontSize: '11px', cursor: 'pointer', padding: '4px 5px !important',
              color: value ? '#0f172a' : '#94a3b8', fontWeight: 600
            },
            '.MuiInput-underline:before': { borderBottom: 'none' },
            '.MuiInput-underline:hover:not(.Mui-disabled):before': { borderBottom: 'none' },
            '.MuiInput-underline:after': { borderBottom: 'none' },
            background: 'transparent'
          }}
        >
          {(col.options || []).map(opt => (
            <option key={opt} value={opt}>{opt || '(none)'}</option>
          ))}
        </SearchableSelect>
      </td>
    );
  }

  // ── Date picker for isDate columns ──────────────────────────────────────────
  if (col.isDate) {
    return (
      <td style={{
        ...cellStyle,
        padding: 0,
        background: isDirty ? 'rgba(254,243,199,0.75)' : 'rgba(255,247,237,0.04)',
      }}>
        <DatePickerCell
          value={value}
          onChange={onChange}
          style={cellStyle}
        />
      </td>
    );
  }

  // ── Manual editable ────────────────────────────────────────────────────────
  if (col.hasAttach) {
    const attachUrl = row?.['BILL_PDF_URL'];
    return (
      <td style={{ ...cellStyle, padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <EditableCell
            value={value}
            isDirty={isDirty}
            onChange={onChange}
            style={{ ...cellStyle, flex: 1, borderRight: 'none' }}
          />
          <AttachButton rowId={row?._id} attachType={col.hasAttach} existingUrl={attachUrl} onSaved={onAttachSaved} />
        </div>
      </td>
    );
  }

  return (
    <td style={{ ...cellStyle, padding: 0 }}>
      <EditableCell
        value={value}
        isDirty={isDirty}
        onChange={onChange}
        style={{ ...cellStyle, width: '100%' }}
      />
    </td>
  );
}

// ─── AttachButton: upload PDF/image + view/download uploaded file ─────────────
function AttachButton({ rowId, attachType, existingUrl, onSaved }) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !rowId) return;
    setUploading(true);
    try {
      const token = localStorage.getItem('token');
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(
        `${API_URL}/cement-register/attach/${rowId}/${attachType}`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd }
      );
      const data = await res.json();
      if (data.success && onSaved) onSaved(data.field, data.url);
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const isPdf = existingUrl?.toLowerCase().includes('.pdf');

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
      {/* View/download existing file */}
      {existingUrl && (
        <a
          href={existingUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="View / Download uploaded file"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, borderRadius: 4,
            background: isPdf ? '#fef2f2' : '#f0fdf4',
            border: `1px solid ${isPdf ? '#fca5a5' : '#86efac'}`,
            textDecoration: 'none', cursor: 'pointer', fontSize: '11px',
          }}
        >
          {isPdf ? '📄' : '🖼️'}
        </a>
      )}
      {/* Upload button */}
      <label
        title={existingUrl ? 'Replace file' : 'Upload proof (PDF / image)'}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 22, height: 22, borderRadius: 4, cursor: uploading ? 'wait' : 'pointer',
          background: uploading ? '#e0e7ff' : '#f1f5f9',
          border: '1px solid #cbd5e1',
          fontSize: '11px',
        }}
      >
        {uploading ? '⏳' : '📎'}
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          hidden
          onChange={handleUpload}
          disabled={uploading}
        />
      </label>
    </div>
  );
}

// ─── Date helper: dd-mm-yyyy ↔ yyyy-mm-dd conversions ───────────────────────

function ddmmyyyyToIso(str) {
  if (!str) return '';
  // Handle dd-mm-yyyy
  const m = String(str).match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // If already ISO yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  return '';
}
function isoToDdmmyyyy(str) {
  if (!str) return '';
  const m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return str;
}

// ─── Calendar date picker cell ────────────────────────────────────────────────
function DatePickerCell({ value, onChange, style }) {
  const isoVal = ddmmyyyyToIso(value);
  return (
    <input
      type="date"
      value={isoVal}
      onChange={e => onChange(isoToDdmmyyyy(e.target.value))}
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        background: 'transparent',
        fontSize: '11px',
        padding: '4px 6px',
        cursor: 'pointer',
        color: isoVal ? '#0f172a' : '#94a3b8',
        outline: 'none',
        fontFamily: 'inherit',
        boxSizing: 'border-box',
      }}
      onFocus={e => {
        e.currentTarget.parentElement.style.boxShadow = 'inset 0 0 0 2px #3b82f6';
        e.currentTarget.style.background = '#eff6ff';
      }}
      onBlur={e => {
        e.currentTarget.parentElement.style.boxShadow = '';
        e.currentTarget.style.background = 'transparent';
      }}
    />
  );
}

// ─── Editable cell using contentEditable ──────────────────────────────────────
function EditableCell({ value, onChange, style }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current) {
      ref.current.innerText = value ?? '';
    }
  }, [value]);

  const handleBlur = () => {
    const nv = ref.current?.innerText?.trim() ?? '';
    if (nv !== (value ?? '').trim()) onChange(nv);
  };

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onBlur={handleBlur}
      style={{
        ...style,
        outline: 'none',
        cursor: 'text',
        minHeight: '24px',
        display: 'flex',
        alignItems: 'center',
        padding: '4px 6px',
        boxSizing: 'border-box'
      }}
      onFocus={e => {
        e.currentTarget.style.boxShadow = 'inset 0 0 0 2px #3b82f6';
        e.currentTarget.style.background = '#eff6ff';
      }}
      onBlurCapture={e => {
        e.currentTarget.style.boxShadow = '';
        e.currentTarget.style.background = '';
      }}
    />
  );
}
