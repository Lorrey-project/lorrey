import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import SearchableSelect from '../components/SearchableSelect';
import {
  Box, Button, CircularProgress, Typography, IconButton,
  Snackbar, Alert, Chip, Tooltip, MenuItem, Select,
  Dialog, DialogTitle, DialogContent, DialogActions, Checkbox, ListItemText, OutlinedInput
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import axios from 'axios';
import { io } from 'socket.io-client';
import * as XLSX from 'xlsx';
import { exportToCsv } from '../utils/exportCsv';
import { useShortcut } from '../context/ShortcutContext';
import { useTableNavigation } from '../hooks/useTableNavigation';

const API_URL = import.meta.env.VITE_API_URL;
const SOCKET_URL = import.meta.env.VITE_SOCKET_IO_URL || import.meta.env.VITE_API_URL;
const socket = io(SOCKET_URL, {
  autoConnect: true,
  transports: ["websocket", "polling"]
});

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

// Helper calculation functions
function num(val, fallback = 0) {
  if (val === undefined || val === null || val === '') return fallback;
  const n = parseFloat(String(val).replace(/,/g, ''));
  return isNaN(n) ? fallback : n;
}

function fmt2(n) {
  return Math.round(num(n) * 100) / 100;
}

function formatDisplayNum(val) {
  if (val === undefined || val === null || val === '') return '';
  const n = num(val);
  return n === 0 ? '0' : String(n);
}

const normalizeDate = (dStr) => {
  if (!dStr) return '';
  const parts = String(dStr).trim().split(/[-\/\.]/);
  if (parts.length >= 3) {
    const d = String(parseInt(parts[0], 10)).padStart(2, '0');
    const m = String(parseInt(parts[1], 10)).padStart(2, '0');
    let y = parseInt(parts[2], 10);
    if (y < 100) y += 2000;
    return `${d}-${m}-${y}`;
  }
  return String(dStr).trim();
};

const formatDateShort = (dStr) => {
  if (!dStr) return '';
  const parts = String(dStr).trim().split(/[-\/\.]/);
  if (parts.length >= 3) {
    const d = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    let y = parseInt(parts[2], 10);
    if (y > 2000) y = y % 100;
    return `${d}/${m}/${y}`;
  }
  return dStr;
};

// ─────────────────────────────────────────────────────────────────────────────
// COLUMN DEFINITIONS — EXACT MATCH TO REFERENCE SPREADSHEET
// ─────────────────────────────────────────────────────────────────────────────
const COLUMNS = [
  // ── Global Date ──
  { key: 'DATE', label: 'Date', width: 85, type: 'manual', group: 'global' },

  // ── Pump Cash Details (Group: pump, gold/yellow) ──
  { key: 'P_OPENING', label: 'Opening\nBalance', width: 105, type: 'manual', group: 'pump' },
  { key: 'P_CASH_RECV_BB', label: 'bank', width: 95, type: 'calc', group: 'pump', subGroup: 'cash source' },
  { key: 'P_LOAN', label: 'loan', width: 95, type: 'manual', group: 'pump', subGroup: 'cash source' },
  { key: 'CREDIT_VOUCHER', label: 'CREDIT\nVOUCHER', width: 110, type: 'manual', group: 'pump' },
  { key: 'P_TOTAL', label: 'Total\nAmount', width: 105, type: 'calc', group: 'pump' },
  { key: 'P_GIVEN_DAC', label: 'Site cash\ngiven from\nDAC', width: 115, type: 'manual', group: 'pump' },
  { key: 'P_GIVEN_OFFICE', label: 'Cash\nGiven to\nOffice', width: 100, type: 'manual', group: 'pump' },
  { key: 'P_LOAN_REPAY', label: 'LOAN\nREPAY', width: 100, type: 'manual', group: 'pump' },
  { key: 'P_CLOSING', label: 'Closing\nBalance', width: 105, type: 'calc', group: 'pump' },
  { key: 'P_LOAN_BALANCE', label: 'LOAN\nBALANCE', width: 105, type: 'calc', group: 'pump' },

  // ── Site Cash (Group: site, light grey) ──
  { key: 'S_OPENING', label: 'Site opening', width: 100, type: 'manual', group: 'site' },
  { key: 'S_RECV_SANGRAM', label: 'Site cash\nreceive\nfrom', width: 115, type: 'calc', group: 'site' },
  { key: 'S_TRANS_OFFICE', label: 'Transfered\nfrom office\ncash', width: 115, type: 'manual', group: 'site' },
  { key: 'S_TOTAL', label: 'Total Cash\nSite', width: 105, type: 'calc', group: 'site' },
  { key: 'S_TRANS_TO_OFFICE', label: 'Transfered to\noffice cash', width: 115, type: 'manual', group: 'site' },
  { key: 'S_EXPENSE', label: 'Site Cash\nExp', width: 105, type: 'calc', group: 'site' },
  { key: 'S_CLOSING', label: 'Site cash\nClosing', width: 105, type: 'calc', group: 'site' },

  // ── Office Cash (Group: office, sky blue) ──
  { key: 'O_OPENING', label: 'Office\nCash\nopening', width: 105, type: 'manual', group: 'office' },
  { key: 'O_RECV_HFS', label: 'Office\nCash\nreceive\nfrom hfs', width: 115, type: 'manual', group: 'office' },
  { key: 'O_RECV_SITE', label: 'Office Cash\nreceive\nfrom site', width: 115, type: 'calc', group: 'office' },
  { key: 'O_TOTAL', label: 'Total\nOffice\nCash', width: 105, type: 'calc', group: 'office' },
  { key: 'O_EXPENSE', label: 'Office\nExp', width: 95, type: 'manual', group: 'office' },
  { key: 'O_TRANS_SITE', label: 't/f to\nsite\ncash', width: 95, type: 'manual', group: 'office' },
  { key: 'O_CLOSING', label: 'Closing\nBalance', width: 105, type: 'calc', group: 'office' },
  { key: 'DIFFERENCE', label: 'Difference', width: 95, type: 'manual', group: 'office', isDiff: true },
  { key: 'REMARKS_EXP', label: 'Office exp\ndetails', width: 180, type: 'manual', group: 'office' },

  // ── Remarks (Group: remarks, warm yellow) ──
  { key: 'REMARKS', label: 'Remarks', width: 180, type: 'manual', group: 'remarks' },
];

const NUMERIC_COLS = COLUMNS.filter(c => !['DATE', 'REMARKS_EXP', 'REMARKS'].includes(c.key));

// Group styling matching the visual reference spreadsheet
const GROUP_STYLES = {
  global: { title: 'Date', headerBg: '#f8fafc', cellBg: '#ffffff', border: '#cbd5e1' },
  pump: { title: 'Pump cash details', headerBg: '#fde68a', subHeaderBg: '#fef08a', cellBg: '#fffdf0', calcBg: '#fef9c3', border: '#cbd5e1' },
  site: { title: 'Site cash', headerBg: '#e2e8f0', subHeaderBg: '#f1f5f9', cellBg: '#f8fafc', calcBg: '#f1f5f9', border: '#cbd5e1' },
  office: { title: 'Office Cash', headerBg: '#bfdbfe', subHeaderBg: '#dbeafe', cellBg: '#f0f9ff', calcBg: '#e0f2fe', diffBg: '#fed7aa', border: '#cbd5e1' },
  remarks: { title: 'Remarks', headerBg: '#fde047', subHeaderBg: '#fef08a', cellBg: '#fefce8', border: '#cbd5e1' }
};

const OPENING_KEYS = ['P_OPENING', 'S_OPENING', 'O_OPENING'];

const CASHBOOK_HEADER_MAP = {
  'date': 'DATE',
  'opening balance': 'P_OPENING', 'opening': 'P_OPENING', 'pump opening': 'P_OPENING',
  'bank': 'P_CASH_RECV_BB', 'cash receive bank book': 'P_CASH_RECV_BB', 'cash recv bank book': 'P_CASH_RECV_BB',
  'loan': 'P_LOAN', 'loan recv': 'P_LOAN', 'loan receive': 'P_LOAN',
  'credit voucher': 'CREDIT_VOUCHER', 'credit vouchers': 'CREDIT_VOUCHER', 'credit vch': 'CREDIT_VOUCHER',
  'total amount': 'P_TOTAL',
  'site cash given from dac': 'P_GIVEN_DAC', 'given dac': 'P_GIVEN_DAC', 'site cash given dac': 'P_GIVEN_DAC',
  'cash given to office': 'P_GIVEN_OFFICE', 'given office': 'P_GIVEN_OFFICE', 'cash given office': 'P_GIVEN_OFFICE',
  'loan repay': 'P_LOAN_REPAY',
  'closing balance': 'P_CLOSING',
  'loan balance': 'P_LOAN_BALANCE',
  'site opening': 'S_OPENING',
  'site cash receive from': 'S_RECV_SANGRAM', 'site cash receive': 'S_RECV_SANGRAM', 'receive from': 'S_RECV_SANGRAM',
  'transferred from office cash': 'S_TRANS_OFFICE', 'transfered from office cash': 'S_TRANS_OFFICE', 'from office cash': 'S_TRANS_OFFICE',
  'total cash site': 'S_TOTAL',
  'transferred to office cash': 'S_TRANS_TO_OFFICE', 'transfered to office cash': 'S_TRANS_TO_OFFICE', 'to office cash': 'S_TRANS_TO_OFFICE',
  'site cash exp': 'S_EXPENSE', 'site cash expense': 'S_EXPENSE', 'site exp': 'S_EXPENSE',
  'site cash closing': 'S_CLOSING',
  'office cash opening': 'O_OPENING', 'office opening': 'O_OPENING',
  'office cash receive from hfs': 'O_RECV_HFS', 'office cash recv from hfs': 'O_RECV_HFS', 'receive from hfs': 'O_RECV_HFS',
  'office cash receive from site': 'O_RECV_SITE', 'office cash recv from site': 'O_RECV_SITE', 'receive from site': 'O_RECV_SITE',
  'total office cash': 'O_TOTAL',
  'office exp': 'O_EXPENSE', 'office expense': 'O_EXPENSE',
  't/f to site cash': 'O_TRANS_SITE', 'tf to site cash': 'O_TRANS_SITE', 'transfer to site cash': 'O_TRANS_SITE', 't/f to site': 'O_TRANS_SITE',
  'difference': 'DIFFERENCE',
  'office exp details': 'REMARKS_EXP', 'office expense details': 'REMARKS_EXP',
  'remarks': 'REMARKS'
};

export default function MainCashbook({ onBack }) {
  const now = useMemo(() => new Date(), []);
  const currentFyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1);
  const [selYear, setSelYear] = useState(`${currentFyStart}-${currentFyStart + 1}`);

  const tableContainerRef = useRef(null);
  useTableNavigation(tableContainerRef);
  const [entries, setEntries] = useState([]);
  const [localData, setLocalData] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [prevClosing, setPrevClosing] = useState({ P_CLOSING: 0, S_CLOSING: 0, O_CLOSING: 0, P_LOAN_BALANCE: 0 });

  const dirtyCount = Object.keys(localData).length;
  const allSelected = entries.length > 0 && selectedIds.size === entries.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importYear, setImportYear] = useState(selYear);
  const [importMonths, setImportMonths] = useState([]);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importedEntries, setImportedEntries] = useState([]);

  // Year options
  const yearOptions = [];
  for (let y = currentFyStart - 3; y <= currentFyStart + 1; y++) yearOptions.push(`${y}-${y + 1}`);

  const toggleSelect = (id) => setSelectedIds(prev => {
    const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s;
  });
  const toggleSelectAll = () => {
    if (allSelected || someSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(entries.map(r => r._id)));
  };

  const token = () => localStorage.getItem('token');

  // Fetch previous month's last closing balances
  const fetchPrevClosing = useCallback(async (month, yearStr) => {
    try {
      if (month === 4) {
        // April is the opening month of the financial year - starts clean with 0
        setPrevClosing({ P_CLOSING: 0, S_CLOSING: 0, O_CLOSING: 0, P_LOAN_BALANCE: 0 });
        return;
      }
      const fyStartYear = parseInt(String(yearStr).split('-')[0], 10);
      const calendarYear = month >= 4 ? fyStartYear : fyStartYear + 1;
      let prevMonth = month - 1, prevYear = calendarYear;
      if (prevMonth < 1) { prevMonth = 12; prevYear--; }
      const res = await axios.get(`${API_URL}/main-cashbook/month-end`, {
        params: { month: prevMonth, year: prevYear },
        headers: { Authorization: `Bearer ${token()}` }
      });
      if (res.data.success && res.data.data) {
        setPrevClosing(res.data.data);
      } else {
        setPrevClosing({ P_CLOSING: 0, S_CLOSING: 0, O_CLOSING: 0, P_LOAN_BALANCE: 0 });
      }
    } catch { /* ignore */ }
  }, []);

  const fetchData = useCallback(async (month, yearStr, silent = false) => {
    try {
      if (!silent) setLoading(true);
      const fyStartYear = parseInt(String(yearStr).split('-')[0], 10);
      const calendarYear = month >= 4 ? fyStartYear : fyStartYear + 1;
      const res = await axios.get(`${API_URL}/main-cashbook`, {
        params: { month, year: calendarYear },
        headers: { Authorization: `Bearer ${token()}` }
      });
      if (res.data.success) {
        setEntries(res.data.entries);
        setLocalData({});
      }
    } catch (e) {
      console.error('Fetch failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // On mount and whenever month/year changes
  useEffect(() => {
    fetchData(selMonth, selYear);
    fetchPrevClosing(selMonth, selYear);
  }, [selMonth, selYear, fetchData, fetchPrevClosing]);

  // Socket: re-fetch silently on cashbook updates & vouchers (debounced)
  useEffect(() => {
    let timer = null;
    const handler = () => {
      clearTimeout(timer);
      timer = setTimeout(() => fetchData(selMonth, selYear, true), 150);
    };
    socket.on('mainCashbookUpdates', handler);
    socket.on('voucherCreated', handler);
    socket.on('voucherUpdate', handler);
    socket.on('voucherDeleted', handler);
    return () => {
      socket.off('mainCashbookUpdates', handler);
      socket.off('voucherCreated', handler);
      socket.off('voucherUpdate', handler);
      socket.off('voucherDeleted', handler);
      clearTimeout(timer);
    };
  }, [selMonth, selYear, fetchData]);

  // Socket: instant expense patch
  useEffect(() => {
    const handler = ({ date, sExpense, oExpense, oDetails }) => {
      if (!date) return;
      const normDate = normalizeDate(date);
      setEntries(prev => prev.map(row => {
        const rDate = normalizeDate(row.DATE);
        if (rDate !== normDate) return row;
        return { ...row, S_EXPENSE: sExpense, O_EXPENSE: oExpense, REMARKS_EXP: oDetails || '' };
      }));
    };
    socket.on('expenseUpdate', handler);
    return () => socket.off('expenseUpdate', handler);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // COMPUTED ROWS WITH EXACT BUSINESS FORMULAS
  // ─────────────────────────────────────────────────────────────────────────────
  const computedRows = useMemo(() => {
    const fyStart = parseInt(String(selYear).split('-')[0], 10);
    const actualYear = selMonth >= 4 ? fyStart : fyStart + 1;
    const daysInMonth = new Date(actualYear, selMonth, 0).getDate();

    const importMap = {};
    importedEntries.forEach(row => {
      if (row.DATE) {
        const norm = normalizeDate(row.DATE);
        if (!importMap[norm]) importMap[norm] = [];
        importMap[norm].push(row);
      }
    });

    const dbMap = {};
    entries.forEach(row => {
      const norm = normalizeDate(row.DATE);
      if (!dbMap[norm]) dbMap[norm] = [];
      dbMap[norm].push(row);
    });

    let rawList = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dStr = `${String(d).padStart(2, '0')}-${String(selMonth).padStart(2, '0')}-${actualYear}`;
      const dbRows = dbMap[dStr] || [];
      const impRows = importMap[dStr] || [];
      const maxRows = Math.max(1, dbRows.length, impRows.length);

      for (let i = 0; i < maxRows; i++) {
        const dbRow = dbRows[i] || (i === 0 ? { DATE: dStr, _id: `auto-${dStr}`, month: selMonth, year: actualYear } : null);
        const impRow = impRows[i] || null;
        const locRow = (dbRow && dbRow._id) ? (localData[dbRow._id] || {}) : {};

        let merged;
        if (!dbRow && impRow) {
          merged = { DATE: dStr, ...impRow };
        } else if (dbRow && impRow) {
          merged = { ...dbRow, ...impRow, ...locRow };
        } else if (dbRow && !impRow) {
          merged = { ...dbRow, ...locRow };
        }
        if (merged) rawList.push(merged);
      }
    }

    rawList.sort((a, b) => {
      const parseMs = (dStr) => {
        if (!dStr) return 0;
        const parts = String(dStr).split(/[-\/\.]/);
        if (parts.length >= 3) {
          let yr = parseInt(parts[2], 10);
          if (yr < 100) yr += 2000;
          return new Date(yr, parseInt(parts[1], 10) - 1, parseInt(parts[0], 10)).getTime();
        }
        return 0;
      };
      const timeA = parseMs(a.DATE);
      const timeB = parseMs(b.DATE);
      if (timeA === timeB) {
        const slA = num(a['SL NO'], Infinity);
        const slB = num(b['SL NO'], Infinity);
        return slA - slB;
      }
      return timeA - timeB;
    });

    const result = [];
    for (let i = 0; i < rawList.length; i++) {
      const r = { ...rawList[i] };

      // ── 1. PUMP CASH DETAILS ──
      // Opening balance: Day 1 from stored / prev month closing, Day 2+ from prev day closing
      if (i === 0) {
        r.P_OPENING = (r.P_OPENING !== undefined && r.P_OPENING !== '' && r.P_OPENING !== null && localData[r._id]?.P_OPENING !== undefined)
          ? num(r.P_OPENING)
          : (r.P_OPENING !== undefined && r.P_OPENING !== '' && r.P_OPENING !== null ? num(r.P_OPENING) : num(prevClosing.P_CLOSING, 0));
      } else {
        r.P_OPENING = fmt2(result[i - 1].P_CLOSING);
      }

      r.P_CASH_RECV_BB = num(r.P_CASH_RECV_BB);
      r.P_LOAN = num(r.P_LOAN !== undefined ? r.P_LOAN : (r.P_LOAN_RECV !== undefined ? r.P_LOAN_RECV : ''));
      r.CREDIT_VOUCHER = num(r.CREDIT_VOUCHER !== undefined ? r.CREDIT_VOUCHER : (r.CREDIT_VCH !== undefined ? r.CREDIT_VCH : ''));
      r.P_TOTAL = fmt2(num(r.P_OPENING) + num(r.P_CASH_RECV_BB) + num(r.P_LOAN) + num(r.CREDIT_VOUCHER));

      r.P_GIVEN_DAC = num(r.P_GIVEN_DAC);
      r.P_GIVEN_OFFICE = num(r.P_GIVEN_OFFICE);
      r.P_LOAN_REPAY = num(r.P_LOAN_REPAY);

      // Closing = Total Amount - Site Given DAC - Given to Office - Loan Repay
      r.P_CLOSING = fmt2(num(r.P_TOTAL) - num(r.P_GIVEN_DAC) - num(r.P_GIVEN_OFFICE) - num(r.P_LOAN_REPAY));

      // Loan Balance = Yesterday's Loan Balance + Today's Loan - Today's Loan Repay
      if (i === 0) {
        const initialLoanBal = prevClosing.P_LOAN_BALANCE !== undefined ? num(prevClosing.P_LOAN_BALANCE) : 0;
        r.P_LOAN_BALANCE = fmt2(initialLoanBal + num(r.P_LOAN) - num(r.P_LOAN_REPAY));
      } else {
        const prevLoanBal = num(result[i - 1].P_LOAN_BALANCE);
        r.P_LOAN_BALANCE = fmt2(prevLoanBal + num(r.P_LOAN) - num(r.P_LOAN_REPAY));
      }

      // ── 2. SITE CASH ──
      // Site opening: Day 1 from stored / prev month closing, Day 2+ from prev day site closing
      if (i === 0) {
        r.S_OPENING = (r.S_OPENING !== undefined && r.S_OPENING !== '' && r.S_OPENING !== null && localData[r._id]?.S_OPENING !== undefined)
          ? num(r.S_OPENING)
          : (r.S_OPENING !== undefined && r.S_OPENING !== '' && r.S_OPENING !== null ? num(r.S_OPENING) : num(prevClosing.S_CLOSING, 0));
      } else {
        r.S_OPENING = fmt2(result[i - 1].S_CLOSING);
      }

      // Live sync from Pump Cash Given DAC
      r.S_RECV_SANGRAM = num(r.P_GIVEN_DAC);
      r.S_TRANS_OFFICE = num(r.S_TRANS_OFFICE);
      r.S_TOTAL = fmt2(num(r.S_OPENING) + num(r.S_RECV_SANGRAM) + num(r.S_TRANS_OFFICE));

      r.S_TRANS_TO_OFFICE = num(r.S_TRANS_TO_OFFICE);
      r.S_EXPENSE = num(r.S_EXPENSE);

      // Site Closing = Total Cash Site - Site Cash Exp - Transferred to Office Cash
      r.S_CLOSING = fmt2(num(r.S_TOTAL) - num(r.S_EXPENSE) - num(r.S_TRANS_TO_OFFICE));

      // ── 3. OFFICE CASH ──
      // Office opening: Day 1 from stored / prev month closing, Day 2+ from prev day office closing
      if (i === 0) {
        r.O_OPENING = (r.O_OPENING !== undefined && r.O_OPENING !== '' && r.O_OPENING !== null && localData[r._id]?.O_OPENING !== undefined)
          ? num(r.O_OPENING)
          : (r.O_OPENING !== undefined && r.O_OPENING !== '' && r.O_OPENING !== null ? num(r.O_OPENING) : num(prevClosing.O_CLOSING, 0));
      } else {
        r.O_OPENING = fmt2(result[i - 1].O_CLOSING);
      }

      r.O_RECV_HFS = num(r.O_RECV_HFS);

      // Live sync from Site Cash: Transferred to Office Cash (with manual override support)
      if (localData[r._id]?.O_RECV_SITE !== undefined) {
        r.O_RECV_SITE = num(localData[r._id].O_RECV_SITE);
      } else if (r.O_RECV_SITE !== undefined && r.O_RECV_SITE !== '' && r.O_RECV_SITE !== null && !r._id.startsWith('auto-')) {
        r.O_RECV_SITE = num(r.O_RECV_SITE);
      } else {
        r.O_RECV_SITE = num(r.S_TRANS_TO_OFFICE);
      }

      r.O_TOTAL = fmt2(num(r.O_OPENING) + num(r.O_RECV_HFS) + num(r.O_RECV_SITE));
      r.O_EXPENSE = num(r.O_EXPENSE);
      r.O_TRANS_SITE = num(r.O_TRANS_SITE);

      // Office Closing = Total Office Cash - Office Expense - T/F to Site Cash
      r.O_CLOSING = fmt2(num(r.O_TOTAL) - num(r.O_EXPENSE) - num(r.O_TRANS_SITE));

      // Difference: Manual
      r.DIFFERENCE = r.DIFFERENCE !== undefined ? r.DIFFERENCE : '';
      r.REMARKS_EXP = r.REMARKS_EXP || '';
      r.REMARKS = r.REMARKS || '';

      result.push(r);
    }
    return result;
  }, [entries, localData, importedEntries, prevClosing, selMonth, selYear]);

  // ─────────────────────────────────────────────────────────────────────────────
  // MONTHLY SUMMARY ROW TOTALS
  // ─────────────────────────────────────────────────────────────────────────────
  const monthSums = useMemo(() => {
    const s = {};
    if (computedRows.length === 0) return s;
    const firstRow = computedRows[0];
    const lastRow = computedRows[computedRows.length - 1];

    // Opening balances -> First day's opening balance
    s.P_OPENING = fmt2(firstRow.P_OPENING);
    s.S_OPENING = fmt2(firstRow.S_OPENING);
    s.O_OPENING = fmt2(firstRow.O_OPENING);

    // Closing balances -> Last day's closing balance
    s.P_CLOSING = fmt2(lastRow.P_CLOSING);
    s.S_CLOSING = fmt2(lastRow.S_CLOSING);
    s.O_CLOSING = fmt2(lastRow.O_CLOSING);
    s.P_LOAN_BALANCE = fmt2(lastRow.P_LOAN_BALANCE);

    // Transaction sums
    s.P_CASH_RECV_BB = fmt2(computedRows.reduce((acc, r) => acc + num(r.P_CASH_RECV_BB), 0));
    s.P_LOAN = fmt2(computedRows.reduce((acc, r) => acc + num(r.P_LOAN), 0));
    s.CREDIT_VOUCHER = fmt2(computedRows.reduce((acc, r) => acc + num(r.CREDIT_VOUCHER), 0));
    s.P_TOTAL = fmt2(num(s.P_OPENING) + num(s.P_CASH_RECV_BB) + num(s.P_LOAN) + num(s.CREDIT_VOUCHER));

    s.P_GIVEN_DAC = fmt2(computedRows.reduce((acc, r) => acc + num(r.P_GIVEN_DAC), 0));
    s.P_GIVEN_OFFICE = fmt2(computedRows.reduce((acc, r) => acc + num(r.P_GIVEN_OFFICE), 0));
    s.P_LOAN_REPAY = fmt2(computedRows.reduce((acc, r) => acc + num(r.P_LOAN_REPAY), 0));

    s.S_RECV_SANGRAM = fmt2(computedRows.reduce((acc, r) => acc + num(r.S_RECV_SANGRAM), 0));
    s.S_TRANS_OFFICE = fmt2(computedRows.reduce((acc, r) => acc + num(r.S_TRANS_OFFICE), 0));
    s.S_TOTAL = fmt2(num(s.S_OPENING) + num(s.S_RECV_SANGRAM) + num(s.S_TRANS_OFFICE));
    s.S_TRANS_TO_OFFICE = fmt2(computedRows.reduce((acc, r) => acc + num(r.S_TRANS_TO_OFFICE), 0));
    s.S_EXPENSE = fmt2(computedRows.reduce((acc, r) => acc + num(r.S_EXPENSE), 0));

    s.O_RECV_HFS = fmt2(computedRows.reduce((acc, r) => acc + num(r.O_RECV_HFS), 0));
    s.O_RECV_SITE = fmt2(computedRows.reduce((acc, r) => acc + num(r.O_RECV_SITE), 0));
    s.O_TOTAL = fmt2(num(s.O_OPENING) + num(s.O_RECV_HFS) + num(s.O_RECV_SITE));
    s.O_EXPENSE = fmt2(computedRows.reduce((acc, r) => acc + num(r.O_EXPENSE), 0));
    s.O_TRANS_SITE = fmt2(computedRows.reduce((acc, r) => acc + num(r.O_TRANS_SITE), 0));

    const totalDiff = computedRows.reduce((acc, r) => acc + num(r.DIFFERENCE), 0);
    s.DIFFERENCE = totalDiff !== 0 ? fmt2(totalDiff) : 0;

    return s;
  }, [computedRows]);

  const handleCellEdit = useCallback((rowId, field, value) => {
    setLocalData(prev => ({ ...prev, [rowId]: { ...(prev[rowId] || {}), [field]: value } }));
  }, []);

  const handleImportFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImportFile(file);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const dataBytes = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(dataBytes, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
        let headerRowIdx = 0;
        let maxMatches = 0;
        for (let i = 0; i < Math.min(15, aoa.length); i++) {
          let matches = 0;
          (aoa[i] || []).forEach(cell => {
            const clean = String(cell || '').trim().toLowerCase();
            if (CASHBOOK_HEADER_MAP[clean] || Object.values(CASHBOOK_HEADER_MAP).includes(clean.toUpperCase())) matches++;
          });
          if (matches > maxMatches) { maxMatches = matches; headerRowIdx = i; }
        }

        const headers = aoa[headerRowIdx].map(h => String(h || '').trim());
        const headerMapping = {};
        headers.forEach((h, colIdx) => {
          let finalHeader = h;
          if (!finalHeader) {
            for (let rIdx = headerRowIdx - 1; rIdx >= 0; rIdx--) {
              const val = String(aoa[rIdx]?.[colIdx] || '').trim();
              if (val) { finalHeader = val; break; }
            }
          }
          if (!finalHeader) return;
          const norm = finalHeader.toLowerCase().replace(/[\s\-_]+/g, ' ').trim();
          const key = CASHBOOK_HEADER_MAP[norm] || Object.values(CASHBOOK_HEADER_MAP).find(k => k === finalHeader.toUpperCase());
          if (key) headerMapping[colIdx] = key;
        });

        let dateColIdx = -1;
        Object.entries(headerMapping).forEach(([colIdxStr, key]) => {
          if (key === 'DATE') dateColIdx = parseInt(colIdxStr, 10);
        });

        let formatDetected = 'DMY';
        if (dateColIdx !== -1) {
          for (let i = headerRowIdx + 1; i < aoa.length; i++) {
            const rowArr = aoa[i];
            if (!rowArr) continue;
            const rawVal = String(rowArr[dateColIdx] ?? '').trim();
            if (rawVal && !/^\d{4,5}$/.test(rawVal)) {
              const parts = rawVal.split(/[-\/ \.]/);
              if (parts.length >= 2) {
                const p0 = parseInt(parts[0], 10);
                const p1 = parseInt(parts[1], 10);
                if (!isNaN(p0) && !isNaN(p1)) {
                  if (p0 > 12 && p1 <= 12) { formatDetected = 'DMY'; break; }
                  if (p1 > 12 && p0 <= 12) { formatDetected = 'MDY'; break; }
                }
              }
            }
          }
        }

        const newEntries = [];
        let ignoredCount = 0;
        const fyStartYear = parseInt(String(importYear).split('-')[0], 10);
        const targetMonths = (importMonths || []).map(Number);

        aoa.slice(headerRowIdx + 1).forEach((rowArr) => {
          if (!rowArr || !rowArr.some(cell => String(cell).trim() !== '')) return;

          const rowObj = {};
          Object.entries(headerMapping).forEach(([colIdxStr, internalKey]) => {
            const val = String(rowArr[parseInt(colIdxStr, 10)] ?? '').trim();
            if (val !== '') rowObj[internalKey] = val;
          });

          if (rowObj['DATE']) {
            let dateStr = String(rowObj['DATE']).trim();
            let day = null, month = null, year = null;

            if (/^\d{4,5}$/.test(dateStr)) {
              let serial = parseInt(dateStr, 10);
              let dateObj = new Date(Math.round((serial - 25569) * 86400 * 1000));
              day = dateObj.getUTCDate();
              month = dateObj.getUTCMonth() + 1;
              year = dateObj.getUTCFullYear();
            } else {
              const parts = dateStr.split(/[-\/ \.]/);
              if (parts.length >= 3) {
                let p0 = parts[0].trim(), p1 = parts[1].trim(), p2 = parts[2].trim();
                if (p0.length === 4) {
                  year = parseInt(p0, 10);
                  month = parseInt(p1, 10);
                  day = parseInt(p2, 10);
                } else {
                  const monthMap = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
                  let mVal = null;
                  if (isNaN(parseInt(p1)) && monthMap[p1.toLowerCase().substring(0, 3)]) {
                    mVal = monthMap[p1.toLowerCase().substring(0, 3)];
                  }
                  let v0 = parseInt(p0, 10);
                  let v1 = mVal !== null ? mVal : parseInt(p1, 10);
                  let y = parseInt(p2, 10);
                  if (y < 100) y += 2000;
                  year = y;
                  if (formatDetected === 'MDY') { month = v0; day = v1; }
                  else { month = v1; day = v0; }
                }
              }
            }

            if (day !== null && month !== null && year !== null && !isNaN(day) && !isNaN(month) && !isNaN(year)) {
              rowObj['DATE'] = `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year}`;
              const expectedCalendarYear = month >= 4 ? fyStartYear : fyStartYear + 1;
              if (targetMonths.includes(Number(month)) && Number(year) === expectedCalendarYear) {
                rowObj.month = Number(month);
                rowObj.year = Number(year);
                newEntries.push(rowObj);
              } else { ignoredCount++; }
            } else { ignoredCount++; }
          } else { ignoredCount++; }
        });
        setImportPreview({ entries: newEntries, validCount: newEntries.length, ignoredCount });
      } catch (err) {
        setSnack({ severity: 'error', msg: 'Failed to parse Excel: ' + err.message });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImportSubmit = () => {
    if (!importPreview || importPreview.validCount === 0) return;
    setImportedEntries(importPreview.entries);
    setSnack({ severity: 'success', msg: `Successfully imported ${importPreview.validCount} rows to preview! Click Save to save permanently.` });
    setImportModalOpen(false);
    setImportFile(null);
    setImportPreview(null);
  };

  const handleBulkDelete = async () => {
    setDeleting(true);
    try {
      const ids = [...selectedIds];
      await axios.delete(`${API_URL}/main-cashbook/bulk-delete`, {
        headers: { Authorization: `Bearer ${token()}` },
        data: { ids },
      });
      setEntries(prev => prev.filter(r => !ids.includes(r._id)));
      setLocalData(prev => { const n = { ...prev }; ids.forEach(id => delete n[id]); return n; });
      setSelectedIds(new Set());
      setConfirmDel(false);
      setSnack({ severity: 'success', msg: `${ids.length} row(s) deleted.` });
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Delete failed: ' + (err.response?.data?.error || err.message) });
    } finally { setDeleting(false); }
  };

  const handleSave = async () => {
    if (dirtyCount === 0 && importedEntries.length === 0) return;
    setSaving(true);
    try {
      let savedCount = 0;
      let importedCount = 0;

      if (importedEntries.length > 0) {
        const res = await axios.post(`${API_URL}/main-cashbook/bulk-import`, { entries: importedEntries }, {
          headers: { Authorization: `Bearer ${token()}` }
        });
        if (res.data.success) {
          importedCount = (res.data.insertedCount || 0) + (res.data.updatedCount || 0);
        }
      }

      if (dirtyCount > 0) {
        const updates = Object.entries(localData).map(([id, changes]) => ({ id, changes }));
        await axios.put(`${API_URL}/main-cashbook/bulk-update`, { updates }, {
          headers: { Authorization: `Bearer ${token()}` }
        });
        savedCount = updates.length;
      }

      const fyStartYear = parseInt(String(selYear).split('-')[0], 10);
      const calendarYear = selMonth >= 4 ? fyStartYear : fyStartYear + 1;
      const summaryPayload = {
        month: selMonth, year: calendarYear,
        label: `${MONTH_NAMES[selMonth - 1]} ${calendarYear}`,
        ...monthSums
      };
      await axios.put(`${API_URL}/main-cashbook/monthly-summary`, summaryPayload, {
        headers: { Authorization: `Bearer ${token()}` }
      });

      let msg = '';
      if (importedCount > 0 && savedCount > 0) {
        msg = `Successfully saved ${importedCount} imported rows and ${savedCount} edited rows!`;
      } else if (importedCount > 0) {
        msg = `Successfully saved ${importedCount} imported rows to database!`;
      } else {
        msg = `${savedCount} row(s) + monthly summary saved!`;
      }
      setSnack({ severity: 'success', msg });
      setImportedEntries([]);
      setLocalData({});
      fetchData(selMonth, selYear);
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Save failed: ' + (err.response?.data?.error || err.message) });
    } finally { setSaving(false); }
  };

  const handleExport = () => {
    const fyStart = parseInt(String(selYear).split('-')[0], 10);
    const actualYear = selMonth >= 4 ? fyStart : fyStart + 1;
    const summaryLabel = `${MONTH_SHORT[selMonth - 1]}'${String(actualYear).slice(-2)} Summary`;

    const exportRows = computedRows.map(r => {
      const rowObj = {};
      rowObj['Date'] = formatDateShort(r.DATE);
      COLUMNS.filter(c => c.key !== 'DATE').forEach(c => {
        rowObj[c.label.replace(/\n/g, ' ')] = r[c.key] !== undefined ? r[c.key] : '';
      });
      return rowObj;
    });

    const summaryRow = { 'Date': summaryLabel };
    COLUMNS.filter(c => c.key !== 'DATE').forEach(c => {
      summaryRow[c.label.replace(/\n/g, ' ')] = monthSums[c.key] !== undefined ? monthSums[c.key] : '';
    });
    exportRows.push(summaryRow);

    exportToCsv(`Cashbook_${selYear}_${MONTH_SHORT[selMonth - 1]}.xls`, exportRows);
  };

  useShortcut('ctrl+s', handleSave);
  useShortcut('ctrl+r', () => fetchData(selMonth, selYear));
  useShortcut('ctrl+e', handleExport);
  useShortcut('delete', () => { if (selectedIds.size > 0) setConfirmDel(true); });

  if (loading) return (
    <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100vh" gap={2}>
      <CircularProgress size={48} thickness={4} sx={{ color: '#0284c7' }} />
      <Typography color="text.secondary" fontWeight={600}>Loading Cash Book...</Typography>
    </Box>
  );

  const actualCalendarYear = selMonth >= 4 ? parseInt(selYear.split('-')[0], 10) : parseInt(selYear.split('-')[0], 10) + 1;
  const monthShortYear = `${MONTH_SHORT[selMonth - 1]}'${String(actualCalendarYear).slice(-2)}`;

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#f8fafc', overflow: 'hidden' }}>

      {/* ── Top Header Bar ── */}
      <Box sx={{ p: 2, bgcolor: '#ffffff', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2, zIndex: 10 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <IconButton onClick={onBack} size="small" sx={{ bgcolor: '#f1f5f9', '&:hover': { bgcolor: '#e2e8f0' } }}>
            <ArrowBackIcon fontSize="small" sx={{ color: '#475569' }} />
          </IconButton>
          <Typography variant="h6" fontWeight={900} sx={{ color: '#0f172a', letterSpacing: '-0.5px' }}>
            Cash Book
          </Typography>
          <Chip label={`${MONTH_NAMES[selMonth - 1]} ${actualCalendarYear}`}
            size="small" sx={{ fontWeight: 800, bgcolor: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }} />
        </Box>
      </Box>

      {/* ── Filter & Action Toolbar ── */}
      <Box sx={{
        px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap',
        bgcolor: '#ffffff', borderBottom: '1px solid #e2e8f0', flexShrink: 0, zIndex: 9
      }}>
        <Box sx={{ minWidth: 140 }}>
          <SearchableSelect sx={{ minWidth: 140 }} value={selMonth} label="Month" onChange={e => setSelMonth(e.target.value)}>
            {MONTH_NAMES.map((m, i) => <MenuItem key={i + 1} value={i + 1}>{m}</MenuItem>)}
          </SearchableSelect>
        </Box>
        <Box sx={{ minWidth: 140 }}>
          <SearchableSelect sx={{ minWidth: 120 }} value={selYear} label="Financial Year" onChange={e => setSelYear(e.target.value)}>
            {yearOptions.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
          </SearchableSelect>
        </Box>

        <Chip label={`${computedRows.length} Days`} size="small" sx={{ bgcolor: '#f1f5f9', fontWeight: 800, color: '#475569' }} />
        {dirtyCount > 0 && <Chip label={`${dirtyCount} unsaved`} size="small" sx={{ fontWeight: 800, bgcolor: '#fef08a', color: '#854d0e' }} />}
        {selectedIds.size > 0 && <Chip label={`${selectedIds.size} selected`} size="small" sx={{ fontWeight: 800, bgcolor: '#fee2e2', color: '#b91c1c' }} />}

        <Box sx={{ ml: 'auto', display: 'flex', gap: 1, alignItems: 'center' }}>
          {selectedIds.size > 0 && (
            <Button size="small" variant="contained"
              startIcon={deleting ? <CircularProgress size={13} color="inherit" /> : <DeleteIcon />}
              onClick={() => setConfirmDel(true)} disabled={deleting}
              sx={{ fontWeight: 800, borderRadius: 2, bgcolor: '#dc2626', '&:hover': { bgcolor: '#b91c1c' } }}>
              Delete ({selectedIds.size})
            </Button>
          )}
          <Button size="small" variant="outlined"
            onClick={() => { setImportYear(selYear); setImportMonths([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]); setImportFile(null); setImportPreview(null); setImportModalOpen(true); }}
            startIcon={<UploadIcon sx={{ fontSize: '1.1rem' }} />}
            sx={{ fontWeight: 700, borderRadius: 2, color: '#475569', borderColor: '#cbd5e1' }}>
            Import Excel
          </Button>
          <Tooltip title="Discard & reload">
            <IconButton size="small" onClick={() => fetchData(selMonth, selYear)} sx={{ bgcolor: '#f1f5f9', '&:hover': { bgcolor: '#e2e8f0' } }}>
              <RefreshIcon fontSize="small" sx={{ color: '#475569' }} />
            </IconButton>
          </Tooltip>
          <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={handleExport}
            sx={{ fontWeight: 700, borderRadius: 2, color: '#475569', borderColor: '#cbd5e1' }}>XLS</Button>
          <Button size="small" variant="contained"
            startIcon={saving ? <CircularProgress size={13} color="inherit" /> : <SaveIcon />}
            onClick={handleSave}
            disabled={(dirtyCount === 0 && importedEntries.length === 0) || saving}
            sx={{
              fontWeight: 800, borderRadius: 2,
              bgcolor: (dirtyCount + importedEntries.length) > 0 ? '#0284c7' : '#cbd5e1',
              '&:hover': { bgcolor: '#0369a1' }, px: 3, transition: 'all 0.2s ease-in-out'
            }}>
            {saving ? 'Saving...' : `Save${(dirtyCount + importedEntries.length) > 0 ? ` (${dirtyCount + importedEntries.length})` : ''}`}
          </Button>
        </Box>
      </Box>

      {/* ── SPREADSHEET TABLE ── */}
      <Box ref={tableContainerRef} sx={{ overflow: 'auto', flex: 1, bgcolor: '#ffffff' }}>
        <table style={{
          borderCollapse: 'collapse', tableLayout: 'fixed', width: 'max-content',
          fontFamily: '"Outfit", "Inter", -apple-system, BlinkMacSystemFont, sans-serif', fontSize: '12px'
        }}>
          <colgroup>
            <col style={{ width: 36, minWidth: 36 }} />
            {COLUMNS.map(c => <col key={c.key} style={{ width: c.width, minWidth: c.width }} />)}
          </colgroup>

          <thead>
            {/* ── ROW 1: PRIMARY GROUP HEADERS ── */}
            <tr>
              <th rowSpan={3} style={{ position: 'sticky', top: 0, zIndex: 6, width: 36, background: '#f8fafc', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} style={{ accentColor: '#0284c7' }} />
              </th>
              {/* DATE spans all 3 header rows */}
              <th rowSpan={3} style={{
                position: 'sticky', top: 0, left: 36, zIndex: 6, width: 85,
                background: GROUP_STYLES.global.headerBg, color: '#0f172a',
                fontSize: 12, fontWeight: 900, border: '1px solid #cbd5e1', textAlign: 'center', padding: '4px'
              }}>
                Date
              </th>

              {/* PUMP CASH DETAILS (colSpan 10) */}
              <th colSpan={10} style={{
                position: 'sticky', top: 0, zIndex: 5,
                background: GROUP_STYLES.pump.headerBg, color: '#000000', padding: '6px',
                textAlign: 'center', fontSize: '14px', fontWeight: 900, letterSpacing: '0.3px',
                border: '1px solid #cbd5e1'
              }}>
                Pump cash details
              </th>

              {/* SITE CASH (colSpan 7) */}
              <th colSpan={7} style={{
                position: 'sticky', top: 0, zIndex: 5,
                background: GROUP_STYLES.site.headerBg, color: '#000000', padding: '6px',
                textAlign: 'center', fontSize: '14px', fontWeight: 900, letterSpacing: '0.3px',
                border: '1px solid #cbd5e1'
              }}>
                Site cash
              </th>

              {/* OFFICE CASH (colSpan 9) */}
              <th colSpan={9} style={{
                position: 'sticky', top: 0, zIndex: 5,
                background: GROUP_STYLES.office.headerBg, color: '#000000', padding: '6px',
                textAlign: 'center', fontSize: '14px', fontWeight: 900, letterSpacing: '0.3px',
                border: '1px solid #cbd5e1'
              }}>
                Office Cash
              </th>

              {/* REMARKS (colSpan 1) */}
              <th colSpan={1} style={{
                position: 'sticky', top: 0, zIndex: 5,
                background: GROUP_STYLES.remarks.headerBg, color: '#000000', padding: '6px',
                textAlign: 'center', fontSize: '14px', fontWeight: 900,
                border: '1px solid #cbd5e1'
              }}>
                Remarks
              </th>
            </tr>

            {/* ── ROW 2: SUB-GROUP (CASH SOURCE) & COLUMNS ── */}
            <tr>
              {/* Pump Cash columns */}
              <th rowSpan={2} style={{ position: 'sticky', top: 31, zIndex: 4, background: GROUP_STYLES.pump.subHeaderBg, color: '#000', fontSize: 11, fontWeight: 800, border: '1px solid #cbd5e1', padding: '4px', textAlign: 'center', whiteSpace: 'pre-line' }}>
                Opening<br />Balance
              </th>
              <th colSpan={2} style={{ position: 'sticky', top: 31, zIndex: 4, background: GROUP_STYLES.pump.subHeaderBg, color: '#000', fontSize: 12, fontWeight: 900, border: '1px solid #cbd5e1', padding: '3px', textAlign: 'center' }}>
                cash source
              </th>
              <th rowSpan={2} style={{ position: 'sticky', top: 31, zIndex: 4, background: GROUP_STYLES.pump.subHeaderBg, color: '#000', fontSize: 11, fontWeight: 900, border: '1px solid #cbd5e1', padding: '4px', textAlign: 'center', whiteSpace: 'pre-line' }}>
                CREDIT<br />VOUCHER
              </th>
              <th rowSpan={2} style={{ position: 'sticky', top: 31, zIndex: 4, background: GROUP_STYLES.pump.subHeaderBg, color: '#000', fontSize: 11, fontWeight: 800, border: '1px solid #cbd5e1', padding: '4px', textAlign: 'center', whiteSpace: 'pre-line' }}>
                Total<br />Amount
              </th>
              <th rowSpan={2} style={{ position: 'sticky', top: 31, zIndex: 4, background: GROUP_STYLES.pump.subHeaderBg, color: '#000', fontSize: 11, fontWeight: 800, border: '1px solid #cbd5e1', padding: '4px', textAlign: 'center', whiteSpace: 'pre-line' }}>
                Site cash<br />given from<br />DAC
              </th>
              <th rowSpan={2} style={{ position: 'sticky', top: 31, zIndex: 4, background: GROUP_STYLES.pump.subHeaderBg, color: '#000', fontSize: 11, fontWeight: 800, border: '1px solid #cbd5e1', padding: '4px', textAlign: 'center', whiteSpace: 'pre-line' }}>
                Cash<br />Given to<br />Office
              </th>
              <th rowSpan={2} style={{ position: 'sticky', top: 31, zIndex: 4, background: GROUP_STYLES.pump.subHeaderBg, color: '#000', fontSize: 11, fontWeight: 900, border: '1px solid #cbd5e1', padding: '4px', textAlign: 'center', whiteSpace: 'pre-line' }}>
                LOAN<br />REPAY
              </th>
              <th rowSpan={2} style={{ position: 'sticky', top: 31, zIndex: 4, background: GROUP_STYLES.pump.subHeaderBg, color: '#000', fontSize: 11, fontWeight: 900, border: '1px solid #cbd5e1', padding: '4px', textAlign: 'center', whiteSpace: 'pre-line' }}>
                Closing<br />Balance
              </th>
              <th rowSpan={2} style={{ position: 'sticky', top: 31, zIndex: 4, background: GROUP_STYLES.pump.subHeaderBg, color: '#000', fontSize: 11, fontWeight: 900, border: '1px solid #cbd5e1', padding: '4px', textAlign: 'center', whiteSpace: 'pre-line' }}>
                LOAN<br />BALANCE
              </th>

              {/* Site Cash columns */}
              <th rowSpan={2} style={{ position: 'sticky', top: 31, zIndex: 4, background: GROUP_STYLES.site.subHeaderBg, color: '#000', fontSize: 11, fontWeight: 800, border: '1px solid #cbd5e1', padding: '4px', textAlign: 'center', whiteSpace: 'pre-line' }}>
                Site opening
              </th>
              <th rowSpan={2} style={{ position: 'sticky', top: 31, zIndex: 4, background: GROUP_STYLES.site.subHeaderBg, color: '#000', fontSize: 11, fontWeight: 800, border: '1px solid #cbd5e1', padding: '4px', textAlign: 'center', whiteSpace: 'pre-line' }}>
                Site cash<br />receive<br />from
              </th>
              <th rowSpan={2} style={{ position: 'sticky', top: 31, zIndex: 4, background: GROUP_STYLES.site.subHeaderBg, color: '#000', fontSize: 11, fontWeight: 800, border: '1px solid #cbd5e1', padding: '4px', textAlign: 'center', whiteSpace: 'pre-line' }}>
                Transfered<br />from office<br />cash
              </th>
              <th rowSpan={2} style={{ position: 'sticky', top: 31, zIndex: 4, background: GROUP_STYLES.site.subHeaderBg, color: '#000', fontSize: 11, fontWeight: 800, border: '1px solid #cbd5e1', padding: '4px', textAlign: 'center', whiteSpace: 'pre-line' }}>
                Total Cash<br />Site
              </th>
              <th rowSpan={2} style={{ position: 'sticky', top: 31, zIndex: 4, background: GROUP_STYLES.site.subHeaderBg, color: '#000', fontSize: 11, fontWeight: 800, border: '1px solid #cbd5e1', padding: '4px', textAlign: 'center', whiteSpace: 'pre-line' }}>
                Transfered to<br />office cash
              </th>
              <th rowSpan={2} style={{ position: 'sticky', top: 31, zIndex: 4, background: '#dcfce7', color: '#14532d', fontSize: 11, fontWeight: 900, border: '1px solid #cbd5e1', padding: '4px', textAlign: 'center', whiteSpace: 'pre-line' }}>
                Site Cash<br />Exp
              </th>
              <th rowSpan={2} style={{ position: 'sticky', top: 31, zIndex: 4, background: GROUP_STYLES.site.subHeaderBg, color: '#000', fontSize: 11, fontWeight: 800, border: '1px solid #cbd5e1', padding: '4px', textAlign: 'center', whiteSpace: 'pre-line' }}>
                Site cash<br />Closing
              </th>

              {/* Office Cash columns */}
              <th rowSpan={2} style={{ position: 'sticky', top: 31, zIndex: 4, background: GROUP_STYLES.office.subHeaderBg, color: '#000', fontSize: 11, fontWeight: 800, border: '1px solid #cbd5e1', padding: '4px', textAlign: 'center', whiteSpace: 'pre-line' }}>
                Office<br />Cash<br />opening
              </th>
              <th rowSpan={2} style={{ position: 'sticky', top: 31, zIndex: 4, background: GROUP_STYLES.office.subHeaderBg, color: '#000', fontSize: 11, fontWeight: 800, border: '1px solid #cbd5e1', padding: '4px', textAlign: 'center', whiteSpace: 'pre-line' }}>
                Office<br />Cash<br />receive<br />from hfs
              </th>
              <th rowSpan={2} style={{ position: 'sticky', top: 31, zIndex: 4, background: GROUP_STYLES.office.subHeaderBg, color: '#000', fontSize: 11, fontWeight: 800, border: '1px solid #cbd5e1', padding: '4px', textAlign: 'center', whiteSpace: 'pre-line' }}>
                Office Cash<br />receive<br />from site
              </th>
              <th rowSpan={2} style={{ position: 'sticky', top: 31, zIndex: 4, background: GROUP_STYLES.office.subHeaderBg, color: '#000', fontSize: 11, fontWeight: 800, border: '1px solid #cbd5e1', padding: '4px', textAlign: 'center', whiteSpace: 'pre-line' }}>
                Total<br />Office<br />Cash
              </th>
              <th rowSpan={2} style={{ position: 'sticky', top: 31, zIndex: 4, background: GROUP_STYLES.office.subHeaderBg, color: '#000', fontSize: 11, fontWeight: 800, border: '1px solid #cbd5e1', padding: '4px', textAlign: 'center', whiteSpace: 'pre-line' }}>
                Office<br />Exp
              </th>
              <th rowSpan={2} style={{ position: 'sticky', top: 31, zIndex: 4, background: GROUP_STYLES.office.subHeaderBg, color: '#000', fontSize: 11, fontWeight: 800, border: '1px solid #cbd5e1', padding: '4px', textAlign: 'center', whiteSpace: 'pre-line' }}>
                t/f to<br />site<br />cash
              </th>
              <th rowSpan={2} style={{ position: 'sticky', top: 31, zIndex: 4, background: GROUP_STYLES.office.subHeaderBg, color: '#000', fontSize: 11, fontWeight: 900, border: '1px solid #cbd5e1', padding: '4px', textAlign: 'center', whiteSpace: 'pre-line' }}>
                Closing<br />Balance
              </th>
              <th rowSpan={2} style={{ position: 'sticky', top: 31, zIndex: 4, background: '#fed7aa', color: '#7c2d12', fontSize: 11, fontWeight: 900, border: '1px solid #cbd5e1', padding: '4px', textAlign: 'center', whiteSpace: 'pre-line' }}>
                Difference
              </th>
              <th rowSpan={2} style={{ position: 'sticky', top: 31, zIndex: 4, background: GROUP_STYLES.office.subHeaderBg, color: '#000', fontSize: 11, fontWeight: 800, border: '1px solid #cbd5e1', padding: '4px', textAlign: 'center', whiteSpace: 'pre-line' }}>
                Office exp<br />details
              </th>

              {/* Remarks */}
              <th rowSpan={2} style={{ position: 'sticky', top: 31, zIndex: 4, background: GROUP_STYLES.remarks.subHeaderBg, color: '#000', fontSize: 11, fontWeight: 800, border: '1px solid #cbd5e1', padding: '4px', textAlign: 'center' }}>
                Remarks
              </th>
            </tr>

            {/* ── ROW 3: LEAF SUB-HEADERS (bank, loan) ── */}
            <tr>
              <th style={{ position: 'sticky', top: 58, zIndex: 4, background: GROUP_STYLES.pump.subHeaderBg, color: '#000', fontSize: 11, fontWeight: 800, border: '1px solid #cbd5e1', padding: '3px', textAlign: 'center' }}>
                bank
              </th>
              <th style={{ position: 'sticky', top: 58, zIndex: 4, background: GROUP_STYLES.pump.subHeaderBg, color: '#000', fontSize: 11, fontWeight: 800, border: '1px solid #cbd5e1', padding: '3px', textAlign: 'center' }}>
                loan
              </th>
            </tr>
          </thead>

          <tbody>
            {computedRows.map((row, ri) => {
              const isSelected = selectedIds.has(row._id);

              return (
                <tr key={row._id} style={{
                  background: isSelected ? 'rgba(2, 132, 199, 0.08)' : (ri % 2 === 0 ? '#ffffff' : '#fcfcfc'),
                  transition: 'background 0.1s ease'
                }}>
                  {/* Select Checkbox */}
                  <td style={{ textAlign: 'center', border: '1px solid #e2e8f0', background: isSelected ? 'rgba(2, 132, 199, 0.12)' : '#ffffff' }}>
                    <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(row._id)} style={{ accentColor: '#0284c7' }} />
                  </td>

                  {/* Date Column */}
                  <td style={{
                    position: 'sticky', left: 36, zIndex: 2,
                    textAlign: 'center', border: '1px solid #cbd5e1',
                    fontWeight: 800, color: '#0f172a', background: '#f8fafc',
                    padding: '4px 2px', fontSize: '11px', whiteSpace: 'nowrap'
                  }}>
                    {formatDateShort(row.DATE)}
                  </td>

                  {/* Render Data Columns */}
                  {COLUMNS.filter(c => c.key !== 'DATE').map((col) => {
                    const rawVal = row[col.key];
                    const localVal = localData[row._id]?.[col.key];
                    const isDirty = localVal !== undefined;
                    const displayVal = localVal !== undefined ? localVal : (rawVal !== null && rawVal !== undefined ? String(rawVal) : '');
                    const gStyle = GROUP_STYLES[col.group];

                    const isOpeningBalance = OPENING_KEYS.includes(col.key);
                    const isAutoCalc = col.type === 'calc' || (isOpeningBalance && ri > 0);

                    // Cell Background styling
                    let cellBg = gStyle.cellBg;
                    if (isDirty) {
                      cellBg = '#fff3cd'; // Amber for edited unsaved cells
                    } else if (col.isDiff) {
                      cellBg = num(displayVal) !== 0 ? '#ffedd5' : '#fed7aa'; // Difference column
                    } else if (col.key === 'S_EXPENSE') {
                      cellBg = num(displayVal) > 0 ? '#f0fdf4' : gStyle.cellBg; // Soft green highlight for expenses
                    } else if (isAutoCalc) {
                      cellBg = gStyle.calcBg || '#ffffff';
                    }

                    return (
                      <td key={col.key} style={{
                        padding: 0, border: '1px solid #cbd5e1', background: cellBg,
                        textAlign: (col.key === 'REMARKS_EXP' || col.key === 'REMARKS') ? 'left' : 'center',
                        fontWeight: isAutoCalc ? 800 : (isDirty ? 700 : 500),
                        color: isDirty ? '#92400e' : '#0f172a',
                        fontSize: '11px'
                      }}>
                        {isAutoCalc ? (
                          <div style={{
                            padding: '4px 6px',
                            textAlign: 'center',
                            fontVariantNumeric: 'tabular-nums',
                            letterSpacing: '-0.2px'
                          }}>
                            {formatDisplayNum(displayVal)}
                          </div>
                        ) : col.key === 'REMARKS' || col.key === 'REMARKS_EXP' ? (
                          <input
                            type="text"
                            value={displayVal}
                            onChange={e => handleCellEdit(row._id, col.key, e.target.value)}
                            style={{
                              width: '100%', height: '100%', padding: '4px 6px',
                              border: 'none', background: 'transparent', textAlign: 'left',
                              fontSize: '11px', fontWeight: isDirty ? 700 : 400, outline: 'none',
                              color: isDirty ? '#92400e' : '#0f172a',
                              fontFamily: 'inherit', boxSizing: 'border-box'
                            }}
                          />
                        ) : (
                          <input
                            type="text"
                            value={displayVal}
                            onChange={e => handleCellEdit(row._id, col.key, e.target.value)}
                            style={{
                              width: '100%', height: '100%', padding: '4px',
                              border: 'none', background: 'transparent', textAlign: 'center',
                              fontSize: '11px', fontWeight: isDirty ? 800 : 500, outline: 'none',
                              color: isDirty ? '#92400e' : '#0f172a',
                              fontVariantNumeric: 'tabular-nums',
                              fontFamily: 'inherit', boxSizing: 'border-box'
                            }}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {/* ── MONTHLY SUMMARY ROW (GREEN BACKGROUND AS IN REFERENCE) ── */}
            {computedRows.length > 0 && (
              <tr style={{ background: '#86efac', borderTop: '2px solid #22c55e' }}>
                <td style={{ textAlign: 'center', padding: '6px', border: '1px solid #4ade80', background: '#86efac' }}>
                  ★
                </td>
                {/* Summary Label (e.g. Apr'26 Summary) */}
                <td style={{
                  position: 'sticky', left: 36, zIndex: 2,
                  padding: '6px 4px', border: '1px solid #4ade80',
                  fontWeight: 900, textAlign: 'center', color: '#000000', fontSize: '11px',
                  background: '#86efac', whiteSpace: 'nowrap'
                }}>
                  {monthShortYear}<br />Summary
                </td>

                {COLUMNS.filter(c => c.key !== 'DATE').map(col => {
                  const val = NUMERIC_COLS.find(c => c.key === col.key) ? monthSums[col.key] : '';
                  return (
                    <td key={col.key} style={{
                      padding: '6px 2px', border: '1px solid #4ade80',
                      fontWeight: 900, textAlign: 'center', color: '#000000', fontSize: '11px',
                      fontVariantNumeric: 'tabular-nums'
                    }}>
                      {formatDisplayNum(val)}
                    </td>
                  );
                })}
              </tr>
            )}
          </tbody>
        </table>
      </Box>

      {/* ── Import Modal ── */}
      <Dialog open={importModalOpen} onClose={() => !importing && setImportModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          Import Excel (Multi-Month)
        </DialogTitle>
        <DialogContent sx={{ py: 3, display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <Box sx={{ width: '100%' }}>
            <SearchableSelect value={importYear} label="Financial Year" onChange={e => {
              setImportYear(e.target.value);
              setImportPreview(null);
              setImportFile(null);
            }}>
              {yearOptions.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
            </SearchableSelect>
          </Box>
          <Box sx={{ width: '100%' }}>
            <Select
              multiple
              value={importMonths || []}
              onChange={e => {
                setImportMonths(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value);
                setImportPreview(null);
                setImportFile(null);
              }}
              input={<OutlinedInput label="Select Months" />}
              renderValue={(selected) => (selected || []).map(s => MONTH_NAMES[s - 1]).join(', ')}
            >
              {MONTH_NAMES.map((name, i) => (
                <MenuItem key={i + 1} value={i + 1}>
                  <Checkbox checked={(importMonths || []).indexOf(i + 1) > -1} />
                  <ListItemText primary={name} />
                </MenuItem>
              ))}
            </Select>
          </Box>

          <Button variant="outlined" component="label" sx={{ py: 3, borderStyle: 'dashed' }}>
            {importFile ? importFile.name : 'Click to Select Excel File'}
            <input type="file" accept=".xls,.xlsx" hidden onChange={handleImportFileChange} />
          </Button>

          {importPreview && (
            <Alert severity={importPreview.validCount > 0 ? "success" : "warning"}>
              {importPreview.validCount} rows successfully matched the selected Financial Year and Months.
              {importPreview.ignoredCount > 0 && ` (${importPreview.ignoredCount} rows ignored; e.g. monthly summary rows or invalid dates).`}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: '1px solid #e2e8f0' }}>
          <Button onClick={() => setImportModalOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleImportSubmit} disabled={!importPreview || importPreview.validCount === 0}>
            Import
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Confirm Delete Dialog ── */}
      {confirmDel && (
        <Box sx={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }} onClick={() => setConfirmDel(false)}>
          <Box sx={{ bgcolor: '#ffffff', borderRadius: 3, p: 4, maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <Typography variant="h6" fontWeight={800} color="error" mb={1}>Delete {selectedIds.size} Row(s)?</Typography>
            <Typography color="text.secondary" mb={3}>This action cannot be undone.</Typography>
            <Box display="flex" gap={1.5} justifyContent="flex-end">
              <Button variant="outlined" onClick={() => setConfirmDel(false)}>Cancel</Button>
              <Button variant="contained" color="error" onClick={handleBulkDelete}>Delete</Button>
            </Box>
          </Box>
        </Box>
      )}

      <Snackbar open={!!snack} autoHideDuration={4000} onClose={() => setSnack(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {snack && <Alert severity={snack.severity} variant="filled">{snack.msg}</Alert>}
      </Snackbar>
    </Box>
  );
}
