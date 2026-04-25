import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Box, Button, CircularProgress, Typography, IconButton,
  Snackbar, Alert, Chip, Tooltip, Select, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
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
import { exportToCsv } from '../utils/exportCsv';
import IncentiveAnalysis from '../components/IncentiveAnalysis';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const SOCKET_URL = import.meta.env.VITE_SOCKET_IO_URL || API_URL;
const socket = io('/', { autoConnect: true });

// ─── Column types ──────────────────────────────────────────────────────────────
// 'auto'   = fetched from server, not editable
// 'manual' = user inputs
// 'calc'   = computed from other fields (shown, not directly edited)
// 'dropdown' = select from fixed options

export const COLUMNS = [
  // ── Group 1: Identification ────────────────────────────────────────────────
  { key: 'SL NO', label: 'SL NO', width: 60, type: 'auto', group: 'id', sticky: true },
  { key: 'LOADING DT', label: 'LOADING DT', width: 120, type: 'auto', group: 'id' },
  { key: 'RECEIVING DATE', label: 'RECEIVING\nDATE', width: 120, type: 'manual', group: 'id', isDate: true },
  { key: 'BILL NO', label: 'BILL NO', width: 160, type: 'manual', group: 'id', hasAttach: 'bill_pdf' },
  { key: 'BILL DATE', label: 'BILL DATE', width: 120, type: 'manual', group: 'id', isDate: true },
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
  { key: 'PARTY RATE', label: 'PARTY RATE\n(95%)', width: 95, type: 'calc', group: 'billing', formula: r => fmt2(num(r.BILLING) * 0.95) },
  { key: 'Billing Amount', label: 'BILLING\nAMOUNT', width: 105, type: 'calc', group: 'billing', formula: r => fmt2(num(r.BILLING) * num(r.MT)) },
  { key: 'BILLING ER 95%', label: 'BILLING ER 95%\n(PARTY PAYABLE)', width: 130, type: 'calc', group: 'billing', formula: r => fmt2(num(r['Billing Amount']) * 0.95) },
  { key: 'PROFIT', label: 'GROSS MARGIN', width: 100, type: 'calc', group: 'billing', formula: r => fmt2(num(r['Billing Amount']) * 0.05) },
  { key: 'TDS@1%', label: 'TDS@1%', width: 80, type: 'calc', group: 'billing', formula: r => fmt2(num(r['BILLING ER 95%']) * num(r._tds_percent) / 100) },
  { key: 'ADVANCE', label: 'LOADING ADVANCE', width: 110, type: 'auto', group: 'billing' },
  { key: 'Site Cash', label: 'SITE CASH ADVANCE', width: 160, type: 'auto', group: 'billing', hasAttach: 'site_cash_auto' },
  { key: 'OFFICE CASH', label: 'OFFICE CASH ADVANCE', width: 160, type: 'auto', group: 'billing', hasAttach: 'office_cash_auto' },
  { key: 'Bank TF', label: 'ADVANCE (BANK TF)', width: 120, type: 'manual', group: 'billing' },

  // ── Group 3: Deductions ────────────────────────────────────────────────────
  { key: 'Others deduction', label: 'OTHERS\nDEDUCTION', width: 130, type: 'manual', group: 'deductions' },
  { key: 'Other', label: 'OTHER', width: 100, type: 'manual', group: 'deductions' },
  { key: 'GPS Monitoring Charge', label: 'GPS MONITORING\nCHARGE', width: 150, type: 'manual', group: 'deductions' },
  { key: 'GPS DEVICE', label: 'GPS DEVICE', width: 110, type: 'auto', group: 'deductions', hint: 'Auto from invoice add-on charges' },
  { key: 'RFID TAG', label: 'RFID TAG', width: 110, type: 'auto', group: 'deductions', hint: 'Auto from invoice add-on charges' },
  { key: 'RFID REASSURANCE', label: 'RFID\nREASSURANCE', width: 130, type: 'auto', group: 'deductions', hint: 'Auto from invoice add-on charges' },
  { key: 'FASTAG', label: 'FASTAG', width: 100, type: 'auto', group: 'deductions', hint: 'Auto from invoice add-on charges' },

  // ── Group 4: HSD / Fuel ────────────────────────────────────────────────────
  { key: 'PUMP NAME', label: 'PUMP NAME', width: 130, type: 'auto', group: 'hsd' },
  { key: 'HSD SLIP NO', label: 'HSD SLIP NO', width: 120, type: 'auto', group: 'hsd' },
  { key: 'HSD BILL NO', label: 'HSD BILL NO\n(Pump/FY/Serial)', width: 175, type: 'auto', group: 'hsd' },
  { key: 'KM AS PER RATE CHART', label: 'KM AS PER RATE\nCHART (UP+DOWN)', width: 155, type: 'auto', group: 'hsd', hint: 'Distance × 2 from freight data' },
  { key: 'FUEL REQUIRED', label: 'FUEL REQUIRED', width: 120, type: 'auto', group: 'hsd' },
  { key: 'HSD (LTR)', label: 'HSD (LTR)', width: 100, type: 'auto', group: 'hsd' },
  { key: 'EXTRA ALLOWED', label: 'EXTRA ALLOWED', width: 120, type: 'manual', group: 'hsd' },
  { key: 'ACTUAL EXTRA', label: 'ACTUAL EXTRA', width: 110, type: 'calc', group: 'hsd', formula: r => fmt2(num(r['HSD (LTR)']) - num(r['FUEL REQUIRED']) - num(r['EXTRA ALLOWED'])) },
  { key: 'HSD RATE', label: 'HSD RATE', width: 100, type: 'auto', group: 'hsd' },
  { key: 'HSD AMOUNT', label: 'HSD AMOUNT', width: 110, type: 'auto', group: 'hsd' },
  {
    key: '% OF ADV', label: '% OF ADV', width: 100, type: 'calc', group: 'hsd',
    formula: r => {
      const amt = num(r['BILLING ER 95%']);
      return amt > 0 ? fmt2(((num(r.ADVANCE) + num(r['HSD AMOUNT'])) / amt) * 100) : 0;
    }
  },
  { key: 'TRAVELLING EXP', label: 'TRAVELLING EXP', width: 130, type: 'manual', group: 'hsd' },
  { key: 'SHORTAGE (BAG)', label: 'SHORTAGE (BAG)', width: 120, type: 'manual', group: 'hsd' },
  { key: 'SHORTAGE (RATE)', label: 'SHORTAGE (RATE)', width: 120, type: 'manual', group: 'hsd' },
  {
    key: 'SHORTAGE (AMOUNT)', label: 'SHORTAGE (AMOUNT)', width: 130, type: 'calc', group: 'hsd',
    formula: r => fmt2(num(r['SHORTAGE (RATE)']) * num(r['SHORTAGE (BAG)']))
  },

  // ── Group 5: Net / Gross ───────────────────────────────────────────────────
  {
    key: 'NET AMOUNT', label: 'NET AMOUNT', width: 100, type: 'calc', group: 'net',
    formula: r => fmt2(
      num(r['BILLING ER 95%'])
      - num(r['TDS@1%'])
      - num(r.ADVANCE)
      - num(r['Site Cash'])
      - num(r['OFFICE CASH'])
      - num(r['Bank TF'])
      - num(r['Others deduction'])
      - num(r['GPS Monitoring Charge'])
      - num(r['GPS DEVICE'])
      - num(r['RFID TAG'])
      - num(r['RFID REASSURANCE'])
      - num(r['FASTAG'])
      - num(r['HSD AMOUNT'])
      - num(r['TRAVELLING EXP'])
      - num(r['SHORTAGE (AMOUNT)'])
      - num(r['Other'])
    )
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
];

// ─── Internal fields not shown ────────────────────────────────────────────────
const HIDDEN_KEYS = new Set(['_id', '__v', '_invoiceId', '_tds_percent', '_is_ato', '_is_10w', '_source', '_auto_updated_at', '_created_at']);

// ─── Calc helpers ─────────────────────────────────────────────────────────────
function num(val, fallback = 0) { const n = parseFloat(val); return isNaN(n) ? fallback : n; }
function fmt2(n) { return Math.round(num(n) * 100) / 100; }

// Calculate all computed fields for a single row
function applyCalcs(row) {
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
const GROUP_COLORS = {
  id: { bg: '#ede9fe', border: '#c4b5fd' },
  billing: { bg: '#dbeafe', border: '#93c5fd' },
  deductions: { bg: '#fef3c7', border: '#fcd34d' },
  hsd: { bg: '#d1fae5', border: '#6ee7b7' },
  net: { bg: '#fce7f3', border: '#f9a8d4' },
  owner: { bg: '#f0fdf4', border: '#86efac' },
};

// Deduplicate columns (WHEEL was listed twice)
const VISIBLE_COLS = COLUMNS.filter((c, i, arr) =>
  !c.hidden && arr.findIndex(x => x.key === c.key) === i
);

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CementRegister({ onBack }) {
  const [entries, setEntries] = useState([]);
  const [localData, setLocalData] = useState({});   // { rowId: { field: val } }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState(null);
  const [showIncentive, setShowIncentive] = useState(false);

  const dirtyCount = Object.keys(localData).length;
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [isBillingMode, setIsBillingMode] = useState(false);
  const [bulkBillInput, setBulkBillInput] = useState({ billNo: '', billDate: '' });
  const [activeRowId, setActiveRowId] = useState(null);



  const allSelected = entries.length > 0 && selectedIds.size === entries.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleSelect = (id) => setSelectedIds(prev => {
    if (isBillingMode && !prev.has(id) && prev.size >= 8) {
      setSnack({ severity: 'warning', msg: 'Maximum 8 bills can be selected for batch billing.' });
      return prev;
    }
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  });
  const toggleSelectAll = () => {
    if (allSelected || someSelected) {
      setSelectedIds(new Set());
    } else {
      if (isBillingMode && computedRows.length > 8) {
        setSnack({ severity: 'warning', msg: 'Selecting first 8 bills. Maximum 8 bills can be processed at once.' });
        setSelectedIds(new Set(computedRows.slice(0, 8).map(r => r._id)));
      } else {
        setSelectedIds(new Set(computedRows.map(r => r._id)));
      }
    }
  };

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await axios.get(`${API_URL}/cement-register`);
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

  const [liveMsg, setLiveMsg] = useState(null);

  // ── Smart socket handler ───────────────────────────────────────────────────
  const handleSocketEvent = useCallback(async (msg) => {
    if (msg && msg.action === 'delete' && msg.invoiceId) {
      // Instantly remove the row from local state — no round trip needed
      setEntries(prev => prev.filter(r => r._invoiceId !== msg.invoiceId));
      // Clear any pending drafts that belonged to the deleted invoice row
      setEntries(prev => {
        const deletedRow = prev.find(r => r._invoiceId === msg.invoiceId);
        if (deletedRow) {
          setLocalData(d => { const n = { ...d }; delete n[deletedRow._id]; return n; });
        }
        return prev.filter(r => r._invoiceId !== msg.invoiceId);
      });
      setLiveMsg('🗑️ Entry removed — invoice was deleted');
    } else if (msg && msg.action === 'upsert') {
      // Pull in just the new/updated entry
      try {
        const res = await axios.get(`${API_URL}/cement-register`);
        if (res.data.success) {
          setEntries(res.data.entries);
          setLiveMsg('⚡ Register updated from new slip data');
        }
      } catch (e) {
        console.error('Real-time refresh failed:', e);
      }
    } else {
      // Generic bulk update
      try {
        const res = await axios.get(`${API_URL}/cement-register`);
        if (res.data.success) setEntries(res.data.entries);
      } catch (e) { /* silent */ }
    }
    // Auto-hide live message
    setTimeout(() => setLiveMsg(null), 3500);
  }, []);

  useEffect(() => {
    fetchData();
    socket.on('cementUpdates', handleSocketEvent);
    return () => socket.off('cementUpdates', handleSocketEvent);
  }, [fetchData, handleSocketEvent]);

  // ── Merged rows with calcs ─────────────────────────────────────────────────
  const computedRows = useMemo(() => {
    let rows = entries.map(row => {
      const merged = { ...row, ...(localData[row._id] || {}) };
      return applyCalcs(merged);
    });

    if (isBillingMode) {
      // Show ONLY entries that are STAMPED but NOT yet BILLED
      rows = rows.filter(r => r['CHALLAN STATUS'] === 'STAMP' && !r['BILL NO']);
    }

    return rows;
  }, [entries, localData, isBillingMode]);

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
      await axios.delete(`${API_URL}/cement-register/bulk-delete`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { ids },
      });
      // Remove instantly from local state
      setEntries(prev => prev.filter(r => !ids.includes(r._id)));
      setLocalData(prev => {
        const n = { ...prev };
        ids.forEach(id => delete n[id]);
        return n;
      });
      setSelectedIds(new Set());
      setConfirmDel(false);
      setSnack({ severity: 'success', msg: `${ids.length} row(s) deleted from Cement Register.` });
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Delete failed: ' + (err.response?.data?.error || err.message) });
    } finally {
      setDeleting(false);
    }
  };

  // ── Bulk Save ──────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (dirtyCount === 0) return;
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const updates = Object.entries(localData).map(([id, changes]) => ({ id, changes }));
      await axios.put(
        `${API_URL}/cement-register/bulk-update`,
        { updates },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSnack({ severity: 'success', msg: `${updates.length} row(s) saved to database!` });
      setEntries(prev => prev.map(row => {
        const patch = localData[row._id];
        return patch ? { ...row, ...patch } : row;
      }));
      setLocalData({});
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Save failed: ' + (err.response?.data?.error || err.message) });
    } finally {
      setSaving(false);
    }
  };

  // ── CSV Export ─────────────────────────────────────────────────────────────
  const handleExport = () => exportToCsv('cement_register.xls', computedRows);

  // ── Apply Bulk Bill to selected rows (draft only) ─────────────────────────
  const handleBulkBillApply = () => {
    const { billNo, billDate } = bulkBillInput;
    if (!billNo) {
      setSnack({ severity: 'error', msg: 'Please enter a Bill Number' });
      return;
    }
    const ids = [...selectedIds];
    if (ids.length === 0) {
      setSnack({ severity: 'warning', msg: 'No rows selected for billing' });
      return;
    }
    if (ids.length > 8) {
      setSnack({ severity: 'error', msg: 'Batch billing is limited to a maximum of 8 bills at a time.' });
      return;
    }

    setLocalData(prev => {
      const next = { ...prev };
      ids.forEach(id => {
        next[id] = {
          ...(next[id] || {}),
          'BILL NO': billNo,
          'BILL DATE': billDate
        };
      });
      return next;
    });
    setIsBillingMode(false);
    setSelectedIds(new Set());
    setSnack({ severity: 'success', msg: `Drafted Bill No: ${billNo} for ${ids.length} rows. Remember to click SAVE!` });
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

  // ─────────────────────────────────────────────────────────────────────────
  // Show Incentive Analysis sheet (passes all computed rows as source data)
  if (showIncentive) {
    return (
      <IncentiveAnalysis
        rows={computedRows}
        onBack={() => setShowIncentive(false)}
      />
    );
  }

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

      {/* ── Top Bar ─────────────────────────────────────────────────────── */}
      <Box sx={{
        px: { xs: 1.5, md: 3 }, py: 1.5,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        bgcolor: '#ffffff', borderBottom: '1px solid #e2e8f0',
        boxShadow: '0 4px 20px rgba(0,0,0,0.03)', flexShrink: 0,
        gap: 2, flexWrap: 'wrap'
      }}>
        <Box display="flex" alignItems="center" gap={2}>
          <IconButton onClick={onBack} sx={{ bgcolor: '#f8fafc', '&:hover': { bgcolor: '#f1f5f9' }, p: 1 }}>
            <ArrowBackIcon fontSize="small" sx={{ color: '#475569' }} />
          </IconButton>
          <Box>
            <Typography variant="h6" fontWeight={800} sx={{ color: '#0f172a', letterSpacing: '-0.5px', lineHeight: 1.2 }}>
              Cement Register
            </Typography>
            <Box display="flex" gap={1} mt={0.5} alignItems="center">
              {dirtyCount > 0 && (
                <Chip label={`${dirtyCount} unsaved`} size="small" sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700, bgcolor: '#fef3c7', color: '#d97706', border: '1px solid #fde68a' }} />
              )}
              {selectedIds.size > 0 && (
                <Chip label={`${selectedIds.size} selected`} size="small" sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700, bgcolor: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca' }} />
              )}
              {dirtyCount === 0 && selectedIds.size === 0 && (
                <Typography variant="caption" color="text.secondary" fontWeight={500}>Central Database</Typography>
              )}
            </Box>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', ml: 'auto' }}>
          <Button
            size="small"
            variant="outlined"
            onClick={() => setShowIncentive(true)}
            sx={{
              fontWeight: 700,
              borderRadius: '24px',
              px: 2.5,
              py: 0.5,
              fontSize: '13px',
              textTransform: 'none',
              border: '2px solid #0891b2',
              color: '#0891b2',
              whiteSpace: 'nowrap',
              fontFamily: 'Inter, system-ui, sans-serif',
              '&:hover': {
                bgcolor: '#0891b2',
                color: '#fff',
                border: '2px solid #0891b2',
                boxShadow: '0 4px 8px rgba(8, 145, 178, 0.2)'
              }
            }}
          >
            📊 Incentive Calculation Sheet
          </Button>

          {isBillingMode ? (
            <Box sx={{ 
              display: 'flex', alignItems: 'center', gap: 1.5, 
              bgcolor: '#f8fafc', px: 2, py: 0.75, borderRadius: '12px', border: '1px solid #e2e8f0' 
            }}>
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, color: '#475569', letterSpacing: '0.5px' }}>BILLING STAGE</Typography>
              <input 
                type="text" placeholder="Bill No" 
                value={bulkBillInput.billNo}
                onChange={e => setBulkBillInput(prev => ({ ...prev, billNo: e.target.value }))}
                style={{ width: 140, padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none' }}
              />
              <input
                type="date"
                value={bulkBillInput.billDate}
                onChange={e => setBulkBillInput(prev => ({ ...prev, billDate: e.target.value }))}
                style={{ width: 130, padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none' }}
              />
              <Button size="small" variant="contained" onClick={handleBulkBillApply}
                disabled={selectedIds.size === 0 || selectedIds.size > 8}
                sx={{ fontWeight: 700, fontSize: '0.75rem', px: 2, borderRadius: '8px', bgcolor: '#0f172a', '&:hover': { bgcolor: '#1e293b' }, boxShadow: 'none' }}>
                Apply ({selectedIds.size})
              </Button>
              <Button size="small" sx={{ fontWeight: 700, fontSize: '0.75rem', color: '#64748b', minWidth: 0, px: 1, textTransform: 'none' }} 
                onClick={() => setIsBillingMode(false)}>Exit</Button>
            </Box>
          ) : (
            <Button size="small" variant="outlined"
              onClick={() => {
                setIsBillingMode(true);
                setSelectedIds(new Set());
              }}
              sx={{
                fontWeight: 700, borderRadius: '10px', px: 2, fontSize: '0.8rem',
                color: '#334155', borderColor: '#cbd5e1',
                textTransform: 'none',
                '&:hover': { bgcolor: '#f8fafc', borderColor: '#94a3b8' },
              }}>
              Run Batch Billing
            </Button>
          )}

          <Box sx={{ width: '1px', height: '24px', bgcolor: '#e2e8f0', mx: 0.5, display: { xs: 'none', md: 'block' } }} />

          <Button size="small" variant="outlined" startIcon={<DownloadIcon sx={{ fontSize: '1rem' }}/>} onClick={handleExport}
            sx={{ fontWeight: 700, borderRadius: '10px', fontSize: '0.8rem', color: '#475569', borderColor: '#e2e8f0', textTransform: 'none', '&:hover': { bgcolor: '#f8fafc', borderColor: '#cbd5e1' } }}>Export XLS</Button>
          
          <Button size="small" component="label" variant="outlined" startIcon={<UploadIcon sx={{ fontSize: '1rem' }}/>}
            sx={{ fontWeight: 700, borderRadius: '10px', fontSize: '0.8rem', color: '#475569', borderColor: '#e2e8f0', textTransform: 'none', '&:hover': { bgcolor: '#f8fafc', borderColor: '#cbd5e1' } }}>
            Import
            <input type="file" accept=".csv" hidden onChange={handleImport} />
          </Button>

          <Button
            size="small" variant="contained"
            startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon sx={{ fontSize: '1.1rem' }} />}
            onClick={handleSave} disabled={dirtyCount === 0 || saving}
            sx={{
              fontWeight: 700, borderRadius: '10px', px: 2.5, fontSize: '0.85rem', textTransform: 'none',
              background: dirtyCount > 0 ? '#10b981' : '#f1f5f9',
              color: dirtyCount > 0 ? '#fff' : '#94a3b8',
              boxShadow: dirtyCount > 0 ? '0 4px 12px rgba(16, 185, 129, 0.25)' : 'none',
              '&:hover': { background: dirtyCount > 0 ? '#059669' : '#f1f5f9' },
              '&:disabled': { background: '#f1f5f9', color: '#94a3b8', border: '1px solid #e2e8f0' },
            }}>
            {saving ? 'Saving…' : `Save Changes${dirtyCount > 0 ? ` (${dirtyCount})` : ''}`}
          </Button>

          <Tooltip title="Refresh Data">
            <IconButton size="small" onClick={() => fetchData()} sx={{ bgcolor: '#f8fafc', border: '1px solid #e2e8f0', '&:hover': { bgcolor: '#f1f5f9' }, p: 0.75, borderRadius: '10px' }}>
              <RefreshIcon sx={{ fontSize: '1.1rem', color: '#475569' }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* ── Group header row ─────────────────────────────────────────────── */}
      <Box sx={{ overflow: 'auto', flex: 1 }}>
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
                background: 'linear-gradient(135deg,#1e293b,#0f172a)',
                textAlign: 'center', padding: '7px 4px',
                borderRight: '1px solid rgba(255,255,255,0.12)',
                borderBottom: '2px solid rgba(255,255,255,0.2)',
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
                const gc = GROUP_COLORS[col.group] || GROUP_COLORS.id;
                const typeStyle = col.type === 'auto'
                  ? { background: 'linear-gradient(135deg,#312e81,#1e1b4b)', color: '#c7d2fe' }
                  : col.type === 'calc'
                    ? { background: 'linear-gradient(135deg,#065f46,#047857)', color: '#a7f3d0' }
                    : col.type === 'dropdown'
                      ? { background: 'linear-gradient(135deg,#7c2d12,#9a3412)', color: '#fed7aa' }
                      : { background: 'linear-gradient(135deg,#1e40af,#1d4ed8)', color: '#bfdbfe' };
                return (
                  <th key={col.key}
                    title={col.hint || col.label}
                    style={{
                      position: 'sticky', top: 0, zIndex: 2,
                      ...typeStyle,
                      padding: '7px 5px',
                      textAlign: 'center',
                      fontSize: '9.5px', fontWeight: 700,
                      letterSpacing: '0.3px',
                      whiteSpace: 'pre-line', lineHeight: 1.3,
                      borderRight: '1px solid rgba(255,255,255,0.12)',
                      borderBottom: '2px solid rgba(255,255,255,0.2)',
                    }}>
                    {col.label}
                    {col.type === 'auto' && <div style={{ fontSize: '7px', opacity: 0.7, marginTop: 2 }}>🔒 AUTO</div>}
                    {col.type === 'calc' && <div style={{ fontSize: '7px', opacity: 0.8, marginTop: 2 }}>= CALC</div>}
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
            {computedRows.map((row, ri) => {
              const hasDraft = !!localData[row._id];
              const isSelected = selectedIds.has(row._id);
              return (
                <tr key={row._id} style={{
                  background: isSelected
                    ? 'rgba(124,58,237,0.08)'
                    : hasDraft ? '#fffbeb'
                      : ri % 2 === 0 ? '#fff' : '#f8fafc',
                  outline: isSelected ? '2px solid rgba(124,58,237,0.4)' : 'none',
                }}>
                  {/* Row checkbox */}
                  <td style={{
                    width: 40, minWidth: 40, textAlign: 'center',
                    border: '1px solid #e2e8f0', padding: '4px',
                    background: isSelected ? 'rgba(124,58,237,0.06)' : 'transparent',
                  }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isBillingMode && !isSelected && selectedIds.size >= 8}
                      onChange={() => toggleSelect(row._id)}
                      style={{ cursor: isBillingMode && !isSelected && selectedIds.size >= 8 ? 'not-allowed' : 'pointer', width: 13, height: 13, accentColor: '#7c3aed' }}
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
          </tbody>
        </table>
      </Box>

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




    </Box>
  );
}

// ─── Cell Renderer: decides how to render based on column type ────────────────
function CellRenderer({ col, value, isDirty, rowIndex, row, onChange, onAttachSaved }) {
  const cellStyle = {
    padding: '4px 5px',
    border: '1px solid #e2e8f0',
    fontSize: '11px',
    color: '#1e293b',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    borderRight: isDirty ? '2px solid #f59e0b' : '1px solid #e2e8f0',
    background: isDirty ? 'rgba(254,243,199,0.6)' : 'inherit',
    width: col.width,
    maxWidth: col.width,
  };

  // Color-coded: challan status, bill type
  const cellColor = col.colorMap?.[value] || null;

  // ── Auto / Calc (may have hasAttach for Site Cash) ──────────────────────────
  if (col.type === 'auto' || col.type === 'calc') {
    const bg = cellColor ? cellColor : (col.type === 'auto'
      ? (isDirty ? 'rgba(254,243,199,0.5)' : 'rgba(237,233,254,0.18)')
      : (isDirty ? 'rgba(254,243,199,0.5)' : 'rgba(209,250,229,0.25)'));
    if (col.hasAttach === 'site_cash_auto' || col.hasAttach === 'office_cash_auto') {
      // Auto-fetched from voucher slip PDF — show view-only icon, no manual upload
      const voucherPdfUrl = col.hasAttach === 'site_cash_auto' ? row?.['SITE_CASH_PROOF_URL'] : row?.['OFFICE_CASH_PROOF_URL'];
      return (
        <td style={{ ...cellStyle, background: bg, padding: '2px 4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{value || ''}</span>
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
      }}>{value || ''}</td>
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
            <select
              value={value || ''}
              onChange={e => onChange(e.target.value)}
              style={{
                flex: 1, minWidth: 0, height: '100%', border: 'none', background: 'transparent',
                fontSize: '11px', cursor: 'pointer', padding: '4px 5px',
                color: value === 'STAMP' ? '#15803d' : value === 'NON STAMP' ? '#dc2626' : '#94a3b8',
                fontWeight: 700,
              }}
            >
              {(col.options || []).map(opt => (
                <option key={opt} value={opt}>{opt || '(none)'}</option>
              ))}
            </select>
            <AttachButton rowId={row?._id} attachType={col.hasAttach} existingUrl={attachUrl} onSaved={onAttachSaved} />
          </div>
        </td>
      );
    }
    return (
      <td style={{ ...cellStyle, padding: 0, background: bgColor }}>
        <select
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          style={{
            width: '100%', height: '100%', border: 'none', background: 'transparent',
            fontSize: '11px', cursor: 'pointer', padding: '4px 5px',
            color: value ? '#0f172a' : '#94a3b8', fontWeight: 600
          }}
        >
          {(col.options || []).map(opt => (
            <option key={opt} value={opt}>{opt || '(none)'}</option>
          ))}
        </select>
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
