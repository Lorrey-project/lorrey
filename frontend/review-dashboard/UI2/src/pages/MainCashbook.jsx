import React, { useEffect, useState, useCallback, useMemo } from 'react';
import SearchableSelect from '../components/SearchableSelect';
import {
  Box, Button, CircularProgress, Typography, IconButton,
  Snackbar, Alert, Chip, Tooltip, Select, MenuItem, FormControl, InputLabel,
  Dialog, DialogTitle, DialogContent, DialogActions, Checkbox, ListItemText, OutlinedInput
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TodayIcon from '@mui/icons-material/Today';
import SavingsIcon from '@mui/icons-material/Savings';
import axios from 'axios';
import { io } from 'socket.io-client';
import * as XLSX from 'xlsx';
import { exportToCsv } from '../utils/exportCsv';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const SOCKET_URL = import.meta.env.VITE_SOCKET_IO_URL || API_URL;
const socket = io('/', { autoConnect: true });

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// Helpers
function num(val, fallback = 0) { const n = parseFloat(val); return isNaN(n) ? fallback : n; }
function fmt2(n) { return Math.round(num(n) * 100) / 100; }

const normalizeDate = (dStr) => {
  if (!dStr) return '';
  const parts = String(dStr).trim().split(/[-\/]/);
  if (parts.length === 3) {
    return `${parseInt(parts[0], 10)}-${parseInt(parts[1], 10)}-${parts[2]}`;
  }
  return dStr;
};

const COLUMNS = [
  // Global
  { key: 'DATE', label: 'Date', width: 120, type: 'manual', group: 'global' },

  // Pump Cash Details
  { key: 'P_OPENING', label: 'Opening Balance', width: 120, type: 'manual', group: 'pump' },
  { key: 'P_LOAN_RECV', label: 'Loan Recv', width: 420, type: 'manual', group: 'pump', subGroup: 'Cash Source' },
  { key: 'P_LOAN_PAY', label: 'Loan Pay', width: 420, type: 'manual', group: 'pump', subGroup: 'Cash Source' },
  { key: 'P_WITHDRAW', label: 'Cash withdraw', width: 120, type: 'manual', group: 'pump' },
  {
    key: 'P_TOTAL', label: 'Total Amount', width: 120, type: 'calc', group: 'pump',
    formula: r => fmt2(num(r.P_OPENING) + num(r.P_WITHDRAW))
  },
  { key: 'P_GIVEN_DAC', label: 'Site cash given from DAC', width: 150, type: 'manual', group: 'pump' },
  { key: 'P_GIVEN_OFFICE', label: 'Cash Given To Office', width: 140, type: 'manual', group: 'pump' },
  { key: 'P_OTHERS', label: 'Others', width: 120, type: 'manual', group: 'pump' },
  {
    key: 'P_CLOSING', label: 'Closing Balance', width: 120, type: 'calc', group: 'pump',
    formula: r => fmt2(num(r.P_TOTAL) - num(r.P_GIVEN_DAC) - num(r.P_GIVEN_OFFICE) - num(r.P_OTHERS))
  },

  // Site Cash
  { key: 'S_OPENING', label: 'Site opening', width: 120, type: 'manual', group: 'site' },
  {
    key: 'S_RECV_SANGRAM', label: 'Site cash recv\nfrom sangram', width: 140, type: 'calc', group: 'site',
    formula: r => num(r.P_GIVEN_DAC)
  },
  { key: 'S_TRANS_OFFICE', label: 'Transferred\nfrom office', width: 120, type: 'manual', group: 'site' },
  {
    key: 'S_TOTAL', label: 'Total Cash\nSite', width: 120, type: 'calc', group: 'site',
    formula: r => fmt2(num(r.S_OPENING) + num(r.S_RECV_SANGRAM) + num(r.S_TRANS_OFFICE))
  },
  { key: 'S_TRANS_TO_OFFICE', label: 'Transferred\nto office cash', width: 130, type: 'manual', group: 'site' },
  {
    key: 'S_EXPENSE', label: 'Site Cash\nExp', width: 120, type: 'calc', group: 'site',
    formula: r => fmt2(r.S_EXPENSE || 0)
  },
  {
    key: 'S_CLOSING', label: 'Site Cash\nClosing', width: 120, type: 'calc', group: 'site',
    formula: r => fmt2(num(r.S_TOTAL) - num(r.S_EXPENSE))
  },

  // Office Cash
  { key: 'O_OPENING', label: 'Office Cash\nopening', width: 120, type: 'manual', group: 'office' },
  {
    key: 'O_RECV_HFS', label: 'Office Cash\nrecv from HFS', width: 140, type: 'calc', group: 'office',
    formula: r => num(r.P_GIVEN_OFFICE)
  },
  {
    key: 'O_RECV_SITE', label: 'Office Cash\nrecv from site', width: 140, type: 'calc', group: 'office',
    formula: r => num(r.S_TRANS_TO_OFFICE)
  },
  {
    key: 'O_TOTAL', label: 'Total Office\nCash', width: 120, type: 'calc', group: 'office',
    formula: r => fmt2(num(r.O_OPENING) + num(r.O_RECV_HFS) + num(r.O_RECV_SITE))
  },
  {
    key: 'O_EXPENSE', label: 'Office Exp', width: 120, type: 'calc', group: 'office',
    formula: r => fmt2(r.O_EXPENSE || 0)
  },
  {
    key: 'O_CLOSING', label: 'Closing\nBalance', width: 120, type: 'calc', group: 'office',
    formula: r => fmt2(num(r.O_TOTAL) - num(r.O_EXPENSE))
  },

  // Difference
  {
    key: 'DIFFERENCE', label: 'Difference', width: 120, type: 'calc', group: 'diff',
    formula: r => {
      const eq1 = num(r.P_TOTAL) + num(r.S_OPENING) + num(r.S_TRANS_OFFICE) + num(r.O_OPENING);
      const eq2 = num(r.S_EXPENSE) + num(r.O_EXPENSE) + num(r.P_CLOSING) + num(r.S_CLOSING) + num(r.O_CLOSING) + num(r.P_OTHERS);
      return fmt2(eq1 - eq2);
    }
  },

  // Remarks
  {
    key: 'REMARKS_EXP', label: 'Office exp details', width: 500, type: 'calc', group: 'remarks',
    formula: r => r.REMARKS_EXP || ''
  },
  { key: 'REMARKS', label: 'Remarks', width: 500, type: 'manual', group: 'remarks' },
];

// Numeric columns for monthly summary totals
const NUMERIC_COLS = COLUMNS.filter(c => !['DATE', 'P_LOAN_RECV', 'P_LOAN_PAY', 'REMARKS_EXP', 'REMARKS'].includes(c.key));

function applyCalcs(row) {
  const r = { ...row };
  for (const col of COLUMNS) {
    if (col.type === 'calc' && typeof col.formula === 'function') {
      r[col.key] = col.formula(r);
    }
  }
  return r;
}

const GROUP_COLORS = {
  global: { bg: '#f8fafc', title: 'Global', titleBg: '#f1f5f9' },
  pump: { bg: '#faf5ff', title: 'Pump cash details', titleBg: '#f3e8ff' },
  site: { bg: '#f0fdf4', title: 'Site cash', titleBg: '#dcfce7' },
  office: { bg: '#eff6ff', title: 'Office Cash', titleBg: '#dbeafe' },
  diff: { bg: '#fef2f2', title: 'Reconciliation', titleBg: '#fee2e2' },
  remarks: { bg: '#fef9c3', title: 'Remarks', titleBg: '#fef08a' },
};

const OPENING_KEYS = ['P_OPENING', 'S_OPENING', 'O_OPENING'];

const CASHBOOK_HEADER_MAP = {
  'date': 'DATE',
  'opening balance': 'P_OPENING', 'opening': 'P_OPENING', 'opening balance ': 'P_OPENING',
  'cash source': 'P_SOURCE', 'cash source ': 'P_SOURCE',
  'loan recv': 'P_LOAN_RECV', 'loan recv ': 'P_LOAN_RECV',
  'loan pay': 'P_LOAN_PAY', 'loan pay ': 'P_LOAN_PAY',
  'cash withdraw': 'P_WITHDRAW', 'withdraw': 'P_WITHDRAW', 'cash withdraw ': 'P_WITHDRAW', 'cash with draw': 'P_WITHDRAW', 'cash with draw ': 'P_WITHDRAW',
  'site cash given from dac': 'P_GIVEN_DAC', 'given dac': 'P_GIVEN_DAC', 'site cash given from dac ': 'P_GIVEN_DAC',
  'cash given to office': 'P_GIVEN_OFFICE', 'given office': 'P_GIVEN_OFFICE', 'cash given to office ': 'P_GIVEN_OFFICE',
  'others': 'P_OTHERS', 'others ': 'P_OTHERS',
  'site opening': 'S_OPENING', 'site opening ': 'S_OPENING',
  'transferred from office': 'S_TRANS_OFFICE', 'transferred from office ': 'S_TRANS_OFFICE', 'transfered from office': 'S_TRANS_OFFICE', 'transfered from office cash': 'S_TRANS_OFFICE', 'transferred from office cash': 'S_TRANS_OFFICE',
  'transferred to office cash': 'S_TRANS_TO_OFFICE', 'transferred to office cash ': 'S_TRANS_TO_OFFICE', 'transfered to office cash': 'S_TRANS_TO_OFFICE',
  'office cash opening': 'O_OPENING', 'office cash opening ': 'O_OPENING',
  'remarks': 'REMARKS', 'remarks ': 'REMARKS'
};

export default function MainCashbook({ onBack }) {
  const now = new Date();
  const currentFyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1); // 1-based
  const [selYear, setSelYear] = useState(`${currentFyStart}-${currentFyStart + 1}`);

  const [entries, setEntries] = useState([]);
  const [localData, setLocalData] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  // carry-forward balances from previous month
  const [prevClosing, setPrevClosing] = useState({ P_CLOSING: 0, S_CLOSING: 0, O_CLOSING: 0 });

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
  for (let y = currentFyStart - 2; y <= currentFyStart + 1; y++) yearOptions.push(`${y}-${y + 1}`);

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
        setPrevClosing({ P_CLOSING: 0, S_CLOSING: 0, O_CLOSING: 0 });
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

  // Socket: re-fetch silently on cashbook updates (debounced to avoid hammering)
  useEffect(() => {
    let timer = null;
    const handler = () => {
      clearTimeout(timer);
      timer = setTimeout(() => fetchData(selMonth, selYear, true), 150); // 150 ms debounce
    };
    socket.on('mainCashbookUpdates', handler);
    return () => { socket.off('mainCashbookUpdates', handler); clearTimeout(timer); };
  }, [selMonth, selYear, fetchData]);

  // Socket: instant expense patch — no round-trip needed
  // Server emits { date, sExpense, oExpense, oDetails } after a voucher changes.
  useEffect(() => {
    const handler = ({ date, sExpense, oExpense, oDetails }) => {
      if (!date) return;
      // Normalise date to DD-MM-YYYY for comparison
      const normDate = (() => {
        const p = String(date).trim().split(/[-\/]/);
        if (p.length === 3) return `${p[0].padStart(2, '0')}-${p[1].padStart(2, '0')}-${p[2]}`;
        return date;
      })();
      setEntries(prev => prev.map(row => {
        const rDate = (() => {
          const p = String(row.DATE || '').trim().split(/[-\/]/);
          if (p.length === 3) return `${p[0].padStart(2, '0')}-${p[1].padStart(2, '0')}-${p[2]}`;
          return row.DATE;
        })();
        if (rDate !== normDate) return row;
        return { ...row, S_EXPENSE: sExpense, O_EXPENSE: oExpense, REMARKS_EXP: oDetails || '' };
      }));
    };
    socket.on('expenseUpdate', handler);
    return () => socket.off('expenseUpdate', handler);
  }, []);

  // Socket: listen for new voucher creation and show a prompt
  useEffect(() => {
    const handler = ({ voucher }) => {
      setSnack({
        severity: 'info',
        msg: `New voucher ${voucher?.voucherNumber || ''} created — remember to update Site Cash Expense (S_EXPENSE) if applicable.`
      });
    };
    socket.on('voucherCreated', handler);
    return () => socket.off('voucherCreated', handler);
  }, []);

  // Build computed rows: chain opening ← prev closing
  // NOTE: S_OPENING on the first row is intentionally kept manual (not auto-filled)
  // P_OPENING and O_OPENING on first row still auto-carry from previous month if not typed.
  const computedRows = useMemo(() => {
    const importMap = {};
    importedEntries.forEach(row => {
      if (row.DATE) {
        importMap[normalizeDate(row.DATE)] = row;
      }
    });

    const rawList = entries.map(row => {
      const normDate = normalizeDate(row.DATE);
      const importedRow = importMap[normDate] || {};
      const localRow = localData[row._id] || {};
      return { ...row, ...importedRow, ...localRow };
    });
    const result = [];
    for (let i = 0; i < rawList.length; i++) {
      const r = { ...rawList[i] };
      if (i === 0) {
        // First row: auto-carry openings from previous month
        if (!rawList[i].P_OPENING && !localData[rawList[i]._id]?.P_OPENING)
          r.P_OPENING = prevClosing.P_CLOSING;
        if (!rawList[i].S_OPENING && !localData[rawList[i]._id]?.S_OPENING)
          r.S_OPENING = prevClosing.S_CLOSING;
        if (!rawList[i].O_OPENING && !localData[rawList[i]._id]?.O_OPENING)
          r.O_OPENING = prevClosing.O_CLOSING;
      } else {
        const prev = result[i - 1];
        r.P_OPENING = prev.P_CLOSING;
        r.S_OPENING = prev.S_CLOSING;
        r.O_OPENING = prev.O_CLOSING;
      }
      result.push(applyCalcs(r));
    }
    return result;
  }, [entries, localData, importedEntries, prevClosing]);

  // Monthly column totals for summary row
  const monthSums = useMemo(() => {
    const s = {};
    if (computedRows.length === 0) return s;
    const firstRow = computedRows[0];
    const lastRow = computedRows[computedRows.length - 1];

    for (const col of NUMERIC_COLS) {
      if (['P_OPENING', 'S_OPENING', 'O_OPENING'].includes(col.key)) {
        s[col.key] = fmt2(lastRow[col.key]);
      } else if (['P_CLOSING', 'S_CLOSING', 'O_CLOSING'].includes(col.key)) {
        s[col.key] = fmt2(lastRow[col.key]);
      } else {
        s[col.key] = fmt2(computedRows.reduce((acc, r) => acc + num(r[col.key]), 0));
      }
    }
    return s;
  }, [computedRows]);

  // ── KPI Metrics ─────────────────────────────────────────────────────────────
  const kpiMetrics = useMemo(() => {
    let openingBalance = 0;
    let totalReceipts = 0;
    let totalPayments = 0;
    let closingBalance = 0;
    let todaysTransactions = 0;

    const todayStr = new Date().toLocaleDateString('en-IN').replace(/\//g, '-');
    const todayParts = todayStr.split('-');
    const todayYYYYMMDD = `${todayParts[2]}-${todayParts[1]?.padStart(2, '0')}-${todayParts[0]?.padStart(2, '0')}`;
    const todayDDMMYYYY = `${todayParts[0]?.padStart(2, '0')}-${todayParts[1]?.padStart(2, '0')}-${todayParts[2]}`;

    if (computedRows.length > 0) {
      openingBalance = num(computedRows[0].P_OPENING) + num(computedRows[0].S_OPENING) + num(computedRows[0].O_OPENING);
      closingBalance = num(computedRows[computedRows.length - 1].P_CLOSING) + num(computedRows[computedRows.length - 1].S_CLOSING) + num(computedRows[computedRows.length - 1].O_CLOSING);
    }

    computedRows.forEach(r => {
      totalPayments += num(r.S_EXPENSE) + num(r.O_EXPENSE) + num(r.P_OTHERS);
      const rDate = r.DATE || '';
      if (rDate === todayStr || rDate === todayYYYYMMDD || rDate === todayDDMMYYYY) {
        todaysTransactions += 1;
      }
    });
    
    totalReceipts = closingBalance - openingBalance + totalPayments;

    return {
      openingBalance,
      totalReceipts,
      totalPayments,
      closingBalance,
      todaysTransactions,
      currentBalance: closingBalance
    };
  }, [computedRows]);

  const handleCellEdit = useCallback((rowId, field, value) => {
    setLocalData(prev => ({ ...prev, [rowId]: { ...(prev[rowId] || {}), [field]: value } }));
  }, []);

  const handleBlur = useCallback((rowId, field, value, rawRow) => {
    if (field === 'P_WITHDRAW') {
      const loanPay = String(rawRow.P_LOAN_PAY || '');
      if (loanPay.startsWith('DAC-RS-')) {
        const match = loanPay.match(/DAC-RS-(\d+(?:\.\d+)?)/);
        if (match) {
          const minVal = parseFloat(match[1]);
          const currentVal = parseFloat(value);
          if (isNaN(currentVal) || currentVal < minVal) {
            setLocalData(prev => ({
              ...prev,
              [rowId]: {
                ...(prev[rowId] || {}),
                [field]: String(minVal)
              }
            }));
            setSnack({ severity: 'warning', msg: `Withdraw amount cannot be less than Bank Book synced amount (${minVal})` });
          }
        }
      }
    }
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
            // Fallback: look up in rows above the selected header row to see if a label exists for this column
            for (let rIdx = headerRowIdx - 1; rIdx >= 0; rIdx--) {
              const val = String(aoa[rIdx]?.[colIdx] || '').trim();
              if (val) {
                finalHeader = val;
                break;
              }
            }
          }
          if (!finalHeader) return;
          const norm = finalHeader.toLowerCase().replace(/[\s\-_]+/g, ' ').trim();
          const key = CASHBOOK_HEADER_MAP[norm] || Object.values(CASHBOOK_HEADER_MAP).find(k => k === finalHeader.toUpperCase());
          if (key) headerMapping[colIdx] = key;
        });

        // Auto-detect date format: find Date column index
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
                  if (p0 > 12 && p1 <= 12) {
                    formatDetected = 'DMY';
                    break;
                  }
                  if (p1 > 12 && p0 <= 12) {
                    formatDetected = 'MDY';
                    break;
                  }
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

          if (rowObj['P_SOURCE'] !== undefined) {
            const pSource = String(rowObj['P_SOURCE'] || '').trim();
            if (pSource.startsWith('DAC-RS-')) {
              rowObj['P_LOAN_PAY'] = pSource;
              rowObj['P_LOAN_RECV'] = '';
            } else {
              rowObj['P_LOAN_RECV'] = pSource;
              rowObj['P_LOAN_PAY'] = '';
            }
            delete rowObj['P_SOURCE'];
          }

          if (rowObj['DATE']) {
            let dateStr = String(rowObj['DATE']).trim();
            let day = null, month = null, year = null;

            if (/^\d{4,5}$/.test(dateStr)) {
              // Serial date
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

                  if (formatDetected === 'MDY') {
                    month = v0;
                    day = v1;
                  } else { // DMY
                    month = v1;
                    day = v0;
                  }
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
              } else {
                ignoredCount++;
              }
            } else {
              ignoredCount++; // Invalid date format
            }
          } else {
            ignoredCount++; // Missing date
          }
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
    setSnack({ severity: 'success', msg: `Successfully imported ${importPreview.validCount} rows to preview! Click the Save button next to XLS on the toolbar to save permanently.` });
    setImportModalOpen(false);
    setImportFile(null);
    setImportPreview(null);
  };

  const handleAddRow = async () => {
    try {
      const today = new Date().toLocaleDateString('en-IN').replace(/\//g, '-');
      const fyStartYear = parseInt(String(selYear).split('-')[0], 10);
      const calendarYear = selMonth >= 4 ? fyStartYear : fyStartYear + 1;
      const newEntry = { DATE: today, month: selMonth, year: calendarYear };
      const res = await axios.post(`${API_URL}/main-cashbook`, newEntry, {
        headers: { Authorization: `Bearer ${token()}` }
      });
      if (res.data.success) {
        setEntries(prev => [...prev, res.data.entry]);
        setSnack({ severity: 'success', msg: 'New row added' });
      }
    } catch (err) {
      console.error(err);
      setSnack({ severity: 'error', msg: `Failed to add row: ${err.response?.data?.error || err.message}` });
    }
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

      // 1. Save imported Excel entries if any
      if (importedEntries.length > 0) {
        const res = await axios.post(`${API_URL}/main-cashbook/bulk-import`, { entries: importedEntries }, {
          headers: { Authorization: `Bearer ${token()}` }
        });
        if (res.data.success) {
          importedCount = (res.data.insertedCount || 0) + (res.data.updatedCount || 0);
        }
      }

      // 2. Save row-level changes if any
      if (dirtyCount > 0) {
        const updates = Object.entries(localData).map(([id, changes]) => ({ id, changes }));
        await axios.put(`${API_URL}/main-cashbook/bulk-update`, { updates }, {
          headers: { Authorization: `Bearer ${token()}` }
        });
        savedCount = updates.length;
      }

      // 3. Upsert monthly summary (computed from latest computedRows)
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

      // Show success message
      let msg = '';
      if (importedCount > 0 && savedCount > 0) {
        msg = `Successfully saved ${importedCount} imported rows and ${savedCount} edited rows!`;
      } else if (importedCount > 0) {
        msg = `Successfully saved ${importedCount} imported rows to database!`;
      } else {
        msg = `${savedCount} row(s) + monthly summary saved!`;
      }
      setSnack({ severity: 'success', msg });

      // Clear states
      setImportedEntries([]);
      setLocalData({});
      fetchData(selMonth, selYear);
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Save failed: ' + (err.response?.data?.error || err.message) });
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    // Build rows + summary row for CSV
    const summaryRow = {
      DATE: `${MONTH_NAMES[selMonth - 1].toUpperCase()} ${selYear} TOTAL`,
    };
    for (const col of NUMERIC_COLS) summaryRow[col.key] = monthSums[col.key];
    exportToCsv(`cashbook_${selYear}_${selMonth}.xls`, [...computedRows, summaryRow]);
  };

  if (loading) return (
    <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100vh" gap={2}>
      <CircularProgress size={48} thickness={4} sx={{ color: '#7c3aed' }} />
      <Typography color="text.secondary" fontWeight={600}>Loading Main Cashbook...</Typography>
    </Box>
  );

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#f8fafc', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <Box sx={{ p: 2, bgcolor: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 2, zIndex: 10 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <IconButton onClick={onBack} size="small" sx={{ bgcolor: '#f1f5f9', '&:hover': { bgcolor: '#e2e8f0' } }}>
              <ArrowBackIcon fontSize="small" sx={{ color: '#475569' }} />
            </IconButton>
            <Typography variant="h6" fontWeight={800} sx={{ color: '#0f172a', letterSpacing: '-0.5px' }}>
              Main Cashbook
            </Typography>
            <Chip label={`${MONTH_NAMES[selMonth - 1]} ${selMonth >= 4 ? selYear.split('-')[0] : parseInt(selYear.split('-')[0], 10) + 1}`}
              size="small" sx={{ fontWeight: 800, bgcolor: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }} />
          </Box>
        </Box>


      </Box>

      {/* ── Toolbar ── */}
      <Box sx={{
        px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap',
        bgcolor: '#fff', borderBottom: '1px solid #e2e8f0', flexShrink: 0, zIndex: 9
      }}>
        {/* Month selector */}
        <Box sx={{ minWidth: 140 }}>
          <SearchableSelect sx={{ minWidth: 140 }} value={selMonth} label="Month" onChange={e => setSelMonth(e.target.value)}>
            {MONTH_NAMES.map((m, i) => <MenuItem key={i + 1} value={i + 1}>{m}</MenuItem>)}
          </SearchableSelect>
        </Box>

        {/* Year selector */}
        <Box sx={{ minWidth: 140 }}>
          <SearchableSelect sx={{ minWidth: 120 }} value={selYear} label="Financial Year" onChange={e => setSelYear(e.target.value)}>
            {yearOptions.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
          </SearchableSelect>
        </Box>

        <Chip
          label={`${computedRows.length} entries`}
          size="small"
          sx={{ bgcolor: '#f1f5f9', fontWeight: 700, color: '#475569' }}
        />

        {dirtyCount > 0 && <Chip label={`${dirtyCount} unsaved`} size="small" sx={{ fontWeight: 700, bgcolor: '#fef08a', color: '#854d0e' }} />}
        {selectedIds.size > 0 && <Chip label={`${selectedIds.size} selected`} size="small" sx={{ fontWeight: 700, bgcolor: '#fee2e2', color: '#b91c1c' }} />}

        <Box sx={{ ml: 'auto', display: 'flex', gap: 1, alignItems: 'center' }}>
          {selectedIds.size > 0 && (
            <Button size="small" variant="contained"
              startIcon={deleting ? <CircularProgress size={13} color="inherit" /> : <DeleteIcon />}
              onClick={() => setConfirmDel(true)} disabled={deleting}
              sx={{ fontWeight: 800, borderRadius: 2, background: 'linear-gradient(135deg,#dc2626,#b91c1c)' }}>
              Delete ({selectedIds.size})
            </Button>
          )}
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              setImportYear(selYear);
              setImportMonths([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
              setImportFile(null);
              setImportPreview(null);
              setImportModalOpen(true);
            }}
            startIcon={<UploadIcon sx={{ fontSize: '1.1rem' }} />}
            sx={{ fontWeight: 700, borderRadius: 2 }}
          >
            Import Excel
          </Button>
          <Button size="small" variant="outlined" onClick={handleAddRow} sx={{ fontWeight: 700, borderRadius: 2 }}>
            + Add Row
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
              fontWeight: 700, borderRadius: 2, bgcolor: (dirtyCount + importedEntries.length) > 0 ? '#3b82f6' : '#cbd5e1', '&:hover': { bgcolor: '#2563eb' }, px: 3,
              transition: 'all 0.2s ease-in-out'
            }}>
            {saving ? 'Saving...' : `Save${(dirtyCount + importedEntries.length) > 0 ? ` (${dirtyCount + importedEntries.length})` : ''}`}
          </Button>
        </Box>
      </Box>

      {/* ── Table ── */}
      <Box sx={{ overflow: 'auto', flex: 1 }}>
        <table style={{
          borderCollapse: 'collapse', tableLayout: 'fixed', width: 'max-content',
          fontFamily: 'Inter, system-ui, sans-serif', fontSize: '12px'
        }}>
          <colgroup>
            {/* checkbox */}
            <col style={{ width: 40, minWidth: 40 }} />
            {/* SL No */}
            <col style={{ width: 50, minWidth: 50 }} />
            {COLUMNS.map(c => <col key={c.key} style={{ width: c.width, minWidth: c.width }} />)}
          </colgroup>

          <thead>
            {/* Super-group headers */}
            <tr>
              <th rowSpan={3} style={{ position: 'sticky', top: 0, zIndex: 4, width: 40, background: '#f8fafc', borderRight: '1px solid #cbd5e1', borderBottom: '1px solid #94a3b8' }}>
                <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} style={{ accentColor: '#3b82f6' }} />
              </th>
              <th rowSpan={3} style={{
                position: 'sticky', top: 0, zIndex: 4, background: '#f8fafc', color: '#334155',
                fontSize: 11, fontWeight: 800, border: '1px solid #cbd5e1', borderBottom: '1px solid #94a3b8'
              }}>
                SL No
              </th>
              {Object.keys(GROUP_COLORS).map(grp => {
                const colCount = COLUMNS.filter(c => c.group === grp).length;
                if (!colCount) return null;
                const gc = GROUP_COLORS[grp];
                return (
                  <th key={grp} colSpan={colCount} style={{
                    position: 'sticky', top: 0, zIndex: 3,
                    background: gc.titleBg, color: '#0f172a', padding: '6px',
                    textAlign: 'center', fontSize: '12px', fontWeight: 800,
                    border: '1px solid #cbd5e1'
                  }}>
                    {gc.title}
                  </th>
                );
              })}
            </tr>
            {/* Column headers (Row 2) */}
            <tr>
              {(() => {
                const cols = [];
                const seenSubGroups = new Set();
                for (let i = 0; i < COLUMNS.length; i++) {
                  const col = COLUMNS[i];
                  const gc = GROUP_COLORS[col.group];

                  if (col.subGroup) {
                    if (!seenSubGroups.has(col.subGroup)) {
                      seenSubGroups.add(col.subGroup);
                      const subGroupCols = COLUMNS.filter(c => c.subGroup === col.subGroup);
                      cols.push(
                        <th key={`subGroup-${col.subGroup}`} colSpan={subGroupCols.length} style={{
                          position: 'sticky', top: '30px', zIndex: 3,
                          background: gc.bg, color: '#334155', padding: '4px',
                          textAlign: 'center', fontSize: '11px', fontWeight: 800,
                          border: '1px solid #cbd5e1', borderBottom: '1px solid #94a3b8'
                        }}>
                          {col.subGroup}
                        </th>
                      );
                    }
                  } else {
                    cols.push(
                      <th key={col.key} rowSpan={2} style={{
                        position: 'sticky', top: '30px', zIndex: 3,
                        background: gc.bg, color: '#334155', padding: '8px 4px',
                        textAlign: 'center', fontSize: '11px', fontWeight: 700,
                        border: '1px solid #cbd5e1', whiteSpace: 'pre-line'
                      }}>
                        {col.label}
                      </th>
                    );
                  }
                }
                return cols;
              })()}
            </tr>
            {/* Sub-Column headers (Row 3) */}
            <tr>
              {COLUMNS.filter(c => c.subGroup).map(col => {
                const gc = GROUP_COLORS[col.group];
                return (
                  <th key={col.key} style={{
                    position: 'sticky', top: '53px', zIndex: 3,
                    background: gc.bg, color: '#334155', padding: '4px',
                    textAlign: 'center', fontSize: '11px', fontWeight: 700,
                    border: '1px solid #cbd5e1', whiteSpace: 'pre-line'
                  }}>
                    {col.label}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {computedRows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 2} style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                  No entries for {MONTH_NAMES[selMonth - 1]} {selYear}. Click "+ Add Row" to begin.
                </td>
              </tr>
            )}

            {computedRows.map((row, ri) => {
              const isSelected = selectedIds.has(row._id);
              const othersVal = num(row.P_OTHERS);
              const sourceYellow = othersVal > 0; // yellow Cash Source when Others > 0

              return (
                <tr key={row._id} style={{ background: isSelected ? 'rgba(59,130,246,0.08)' : (ri % 2 === 0 ? '#fff' : '#fafafa'), transition: 'background 0.15s ease' }}>
                  <td style={{ textAlign: 'center', border: '1px solid #e2e8f0', background: isSelected ? 'rgba(59,130,246,0.06)' : 'transparent' }}>
                    <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(row._id)} />
                  </td>
                  {/* SL No */}
                  <td style={{ textAlign: 'center', border: '1px solid #e2e8f0', fontWeight: 700, color: '#475569', background: '#f8fafc' }}>
                    {ri + 1}
                  </td>

                  {COLUMNS.map((col) => {
                    const rawVal = row[col.key];
                    const localVal = localData[row._id]?.[col.key];
                    const displayVal = localVal !== undefined ? localVal : (rawVal !== null && rawVal !== undefined ? String(rawVal) : '');
                    const isDirty = localVal !== undefined;
                    const gc = GROUP_COLORS[col.group];

                    const isOpeningBalance = OPENING_KEYS.includes(col.key);
                    const isCalcLike = col.type === 'calc' || (isOpeningBalance && ri > 0);

                    // Fix #1: DATE cell validation — warn if day exceeds month length
                    let dateError = false;
                    if (col.key === 'DATE' && displayVal) {
                      const parts = displayVal.split(/[-\/]/);
                      if (parts.length >= 2) {
                        const day = parseInt(parts[0]);
                        // selMonth is 1-based, new Date(y, m, 0) gives last day of prev month = days in month
                        const daysInMonth = new Date(selYear, selMonth, 0).getDate();
                        if (!isNaN(day) && day > daysInMonth) dateError = true;
                      }
                    }

                    // Cell background priority
                    let cellBg;
                    if (dateError) {
                      cellBg = '#fca5a5'; // red — invalid date
                    } else if (col.key === 'DIFFERENCE' && num(displayVal) !== 0) {
                      cellBg = '#fca5a5'; // red mismatch
                    } else if (col.key === 'P_LOAN_PAY' && (sourceYellow || String(displayVal).startsWith('DAC-RS-'))) {
                      cellBg = '#fef08a'; // yellow when Others > 0 or Bank Book sync
                    } else if (isDirty) {
                      cellBg = '#fff3cd'; // dirty edits
                    } else if (isCalcLike) {
                      cellBg = 'transparent'; // Let row background show through
                    } else {
                      cellBg = gc.bg;
                    }

                    return (
                      <td key={col.key} style={{
                        padding: 0, border: '1px solid #e2e8f0', background: cellBg,
                        fontWeight: isCalcLike ? 700 : 400
                      }}>
                        {isCalcLike ? (
                          <div style={{ padding: '6px', textAlign: col.key === 'REMARKS_EXP' ? 'left' : 'center', whiteSpace: col.key === 'REMARKS_EXP' ? 'pre-wrap' : 'normal' }}>{displayVal}</div>
                        ) : col.key === 'REMARKS' ? (
                          <textarea
                            value={displayVal}
                            onChange={e => handleCellEdit(row._id, col.key, e.target.value)}
                            onBlur={e => handleBlur(row._id, col.key, e.target.value, row)}
                            style={{
                              width: '100%', height: '100%', padding: '6px',
                              border: 'none', background: 'transparent', textAlign: 'left',
                              fontSize: '12px', fontWeight: isDirty ? 700 : 400, outline: 'none',
                              resize: 'vertical', minHeight: '80px', fontFamily: 'inherit',
                              whiteSpace: 'pre-wrap'
                            }}
                          />
                        ) : (
                          <input
                            type="text"
                            value={displayVal}
                            title={dateError ? `⚠️ ${MONTH_NAMES[selMonth - 1]} only has ${new Date(selYear, selMonth, 0).getDate()} days` : undefined}
                            onChange={e => handleCellEdit(row._id, col.key, e.target.value)}
                            onBlur={e => handleBlur(row._id, col.key, e.target.value, row)}
                            style={{
                              width: '100%', height: '100%', padding: '6px',
                              border: dateError ? '2px solid #dc2626' : 'none',
                              background: 'transparent', textAlign: 'center',
                              fontSize: '12px', fontWeight: isDirty ? 700 : 400, outline: 'none',
                              color: isDirty ? '#92400e' : '#334155'
                            }}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {/* ── Monthly Summary Row (green) ── */}
            {computedRows.length > 0 && (
              <tr style={{ background: '#f0fdf4' }}>
                <td colSpan={2} style={{
                  padding: '8px', border: '1px solid #bbf7d0', borderTop: '2px solid #86efac',
                  fontWeight: 800, textAlign: 'center', color: '#166534', fontSize: 13
                }}>
                  {MONTH_NAMES[selMonth - 1].toUpperCase()} {selYear} TOTAL
                </td>
                {COLUMNS.map(col => {
                  const val = NUMERIC_COLS.find(c => c.key === col.key) ? monthSums[col.key] : '—';
                  return (
                    <td key={col.key} style={{
                      padding: '8px 4px', border: '1px solid #bbf7d0', borderTop: '2px solid #86efac',
                      fontWeight: 800, textAlign: 'center', color: '#166534', fontSize: 12
                    }}>
                      {val}
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
        <DialogTitle sx={{ fontWeight: 800, bgcolor: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
          Import Excel (Multi-Month)
        </DialogTitle>
        <DialogContent sx={{ py: 3, display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <Box sx={{ width: '100%' }}>
            <SearchableSelect value={importYear} label="Financial Year" onChange={e => {
              setImportYear(e.target.value);
              setImportPreview(null); // Reset preview on criteria change
              setImportFile(null);
            }}>
              {yearOptions.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
            </SearchableSelect>
          </Box>
          <Box sx={{ width: '100%' }}>
            <SearchableSelect
              multiple
              value={importMonths}
              onChange={e => {
                setImportMonths(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value);
                setImportPreview(null); // Reset preview
                setImportFile(null);
              }}
              input={<OutlinedInput label="Select Months" />}
              renderValue={(selected) => selected.map(s => MONTH_NAMES[s - 1]).join(', ')}
            >
              {MONTH_NAMES.map((name, i) => (
                <MenuItem key={i + 1} value={i + 1}>
                  <Checkbox checked={importMonths.indexOf(i + 1) > -1} />
                  <ListItemText primary={name} />
                </MenuItem>
              ))}
            </SearchableSelect>
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
          <Button
            variant="contained"
            onClick={handleImportSubmit}
            disabled={!importPreview || importPreview.validCount === 0}
          >
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
          <Box sx={{ bgcolor: '#fff', borderRadius: 3, p: 4, maxWidth: 420 }} onClick={e => e.stopPropagation()}>
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
