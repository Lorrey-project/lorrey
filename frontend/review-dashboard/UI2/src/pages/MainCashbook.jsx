import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Box, Button, CircularProgress, Typography, IconButton,
  Snackbar, Alert, Chip, Tooltip, Select, MenuItem, FormControl, InputLabel
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import axios from 'axios';
import { io } from 'socket.io-client';
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

export const COLUMNS = [
  // Global
  { key: 'DATE', label: 'Date', width: 120, type: 'manual', group: 'global' },

  // Pump Cash Details
  { key: 'P_OPENING', label: 'Opening Balance', width: 120, type: 'manual', group: 'pump' },
  { key: 'P_SOURCE', label: 'Cash Source', width: 220, type: 'manual', group: 'pump' },
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
  { key: 'S_EXPENSE', label: 'Site Cash\nExp', width: 120, type: 'manual', group: 'site' },
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
  { key: 'O_EXPENSE', label: 'Office Exp', width: 120, type: 'manual', group: 'office' },
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
  { key: 'REMARKS_EXP', label: 'Office exp details', width: 250, type: 'manual', group: 'remarks' },
  { key: 'REMARKS', label: 'Remarks', width: 250, type: 'manual', group: 'remarks' },
];

// Numeric columns for monthly summary totals
const NUMERIC_COLS = COLUMNS.filter(c => !['DATE', 'P_SOURCE', 'REMARKS_EXP', 'REMARKS'].includes(c.key));

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
  global: { bg: '#f1f5f9', title: 'Global', titleBg: '#e2e8f0' },
  pump: { bg: '#f3e8ff', title: 'Pump cash details', titleBg: '#d8b4fe' },
  site: { bg: '#dcfce7', title: 'Site cash', titleBg: '#86efac' },
  office: { bg: '#dbeafe', title: 'Office Cash', titleBg: '#93c5fd' },
  diff: { bg: '#fee2e2', title: 'Reconciliation', titleBg: '#fca5a5' },
  remarks: { bg: '#fef08a', title: 'Remarks', titleBg: '#fde047' },
};

const OPENING_KEYS = ['P_OPENING', 'S_OPENING', 'O_OPENING'];

export default function MainCashbook({ onBack }) {
  const now = new Date();
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1); // 1-based
  const [selYear, setSelYear] = useState(now.getFullYear());

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

  // Year options: current year ± 3
  const yearOptions = [];
  for (let y = now.getFullYear() - 2; y <= now.getFullYear() + 1; y++) yearOptions.push(y);

  const toggleSelect = (id) => setSelectedIds(prev => {
    const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s;
  });
  const toggleSelectAll = () => {
    if (allSelected || someSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(entries.map(r => r._id)));
  };

  const token = () => localStorage.getItem('token');

  // Fetch previous month's last closing balances
  const fetchPrevClosing = useCallback(async (month, year) => {
    try {
      let prevMonth = month - 1, prevYear = year;
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

  const fetchData = useCallback(async (month, year, silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await axios.get(`${API_URL}/main-cashbook`, {
        params: { month, year },
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

  // Socket: re-fetch silently on cashbook updates
  useEffect(() => {
    const handler = () => fetchData(selMonth, selYear, true);
    socket.on('mainCashbookUpdates', handler);
    return () => socket.off('mainCashbookUpdates', handler);
  }, [selMonth, selYear, fetchData]);

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
    const rawList = entries.map(row => ({ ...row, ...(localData[row._id] || {}) }));
    const result = [];
    for (let i = 0; i < rawList.length; i++) {
      const r = { ...rawList[i] };
      if (i === 0) {
        // First row: auto-carry P and O openings only; S_OPENING is always manual
        if (!rawList[i].P_OPENING && !localData[rawList[i]._id]?.P_OPENING)
          r.P_OPENING = prevClosing.P_CLOSING;
        // S_OPENING: do NOT auto-fill — it must be entered manually
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
  }, [entries, localData, prevClosing]);

  // Monthly column totals for summary row
  const monthSums = useMemo(() => {
    const s = {};
    for (const col of NUMERIC_COLS) {
      s[col.key] = fmt2(computedRows.reduce((acc, r) => acc + num(r[col.key]), 0));
    }
    return s;
  }, [computedRows]);

  const handleCellEdit = useCallback((rowId, field, value) => {
    setLocalData(prev => ({ ...prev, [rowId]: { ...(prev[rowId] || {}), [field]: value } }));
  }, []);

  const handleAddRow = async () => {
    try {
      const today = new Date().toLocaleDateString('en-IN').replace(/\//g, '-');
      const newEntry = { DATE: today, month: selMonth, year: selYear };
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
    if (dirtyCount === 0) return;
    setSaving(true);
    try {
      // 1. Save row-level changes
      const updates = Object.entries(localData).map(([id, changes]) => ({ id, changes }));
      await axios.put(`${API_URL}/main-cashbook/bulk-update`, { updates }, {
        headers: { Authorization: `Bearer ${token()}` }
      });
      setEntries(prev => prev.map(row => {
        const patch = localData[row._id];
        return patch ? { ...row, ...patch } : row;
      }));
      setLocalData({});

      // 2. Upsert monthly summary (computed from latest computedRows)
      const summaryPayload = {
        month: selMonth, year: selYear,
        label: `${MONTH_NAMES[selMonth - 1]} ${selYear}`,
        ...monthSums
      };
      await axios.put(`${API_URL}/main-cashbook/monthly-summary`, summaryPayload, {
        headers: { Authorization: `Bearer ${token()}` }
      });

      setSnack({ severity: 'success', msg: `${updates.length} row(s) + monthly summary saved!` });
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Save failed: ' + (err.response?.data?.error || err.message) });
    } finally { setSaving(false); }
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

      {/* ── Toolbar ── */}
      <Box sx={{
        px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap',
        bgcolor: '#fff', borderBottom: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', flexShrink: 0
      }}>
        <IconButton onClick={onBack} size="small" sx={{ bgcolor: '#f1f5f9', '&:hover': { bgcolor: '#e2e8f0' } }}>
          <ArrowBackIcon fontSize="small" />
        </IconButton>
        <Typography variant="h6" fontWeight={800} sx={{ color: '#0f172a', letterSpacing: '-0.5px' }}>
          Main Cashbook
        </Typography>

        {/* Month selector */}
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel sx={{ fontSize: 12 }}>Month</InputLabel>
          <Select value={selMonth} label="Month" onChange={e => setSelMonth(e.target.value)}
            sx={{ fontSize: 12, fontWeight: 700 }}>
            {MONTH_NAMES.map((m, i) => (
              <MenuItem key={i + 1} value={i + 1} sx={{ fontSize: 12 }}>{m}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Year selector */}
        <FormControl size="small" sx={{ minWidth: 90 }}>
          <InputLabel sx={{ fontSize: 12 }}>Year</InputLabel>
          <Select value={selYear} label="Year" onChange={e => setSelYear(e.target.value)}
            sx={{ fontSize: 12, fontWeight: 700 }}>
            {yearOptions.map(y => <MenuItem key={y} value={y} sx={{ fontSize: 12 }}>{y}</MenuItem>)}
          </Select>
        </FormControl>

        <Chip label={`${MONTH_NAMES[selMonth - 1]} ${selYear}`}
          size="small" sx={{ fontWeight: 800, bgcolor: '#f0e6ff', color: '#6d28d9' }} />

        {dirtyCount > 0 && <Chip label={`${dirtyCount} unsaved`} size="small" color="warning" sx={{ fontWeight: 700 }} />}
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
          <Button size="small" variant="outlined" onClick={handleAddRow} sx={{ fontWeight: 700, borderRadius: 2 }}>
            + Add Row
          </Button>
          <Tooltip title="Discard & reload">
            <IconButton size="small" onClick={() => fetchData(selMonth, selYear)} sx={{ bgcolor: '#f1f5f9' }}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={handleExport}
            sx={{ fontWeight: 700, borderRadius: 2, fontSize: '12px' }}>XLS</Button>
          <Button size="small" variant="contained"
            startIcon={saving ? <CircularProgress size={13} color="inherit" /> : <SaveIcon />}
            onClick={handleSave} disabled={dirtyCount === 0 || saving}
            sx={{
              fontWeight: 800, borderRadius: 2, px: 2.5,
              background: dirtyCount > 0 ? 'linear-gradient(135deg,#7c3aed,#4f46e5)' : '#cbd5e1'
            }}>
            {saving ? 'Saving...' : `Save${dirtyCount > 0 ? ` (${dirtyCount})` : ''}`}
          </Button>
        </Box>
      </Box>

      {/* ── Table ── */}
      <Box sx={{ overflow: 'auto', flex: 1 }}>
        <table style={{
          borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: '100%',
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
              <th rowSpan={2} style={{ position: 'sticky', top: 0, zIndex: 4, width: 40, background: '#1e293b', borderRight: '1px solid #334155' }}>
                <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} style={{ accentColor: '#7c3aed' }} />
              </th>
              <th rowSpan={2} style={{
                position: 'sticky', top: 0, zIndex: 4, background: '#334155', color: '#fff',
                fontSize: 11, fontWeight: 900, border: '1px solid #475569'
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
                    background: gc.titleBg, color: '#000', padding: '6px',
                    textAlign: 'center', fontSize: '14px', fontWeight: 900,
                    border: '1px solid #cbd5e1'
                  }}>
                    {gc.title}
                  </th>
                );
              })}
            </tr>
            {/* Column headers */}
            <tr>
              {COLUMNS.map(col => {
                const gc = GROUP_COLORS[col.group];
                return (
                  <th key={col.key} style={{
                    position: 'sticky', top: '33px', zIndex: 3,
                    background: gc.bg, color: '#1e293b', padding: '8px 4px',
                    textAlign: 'center', fontSize: '11px', fontWeight: 800,
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
                <tr key={row._id} style={{ background: isSelected ? 'rgba(124,58,237,0.08)' : '#fff' }}>
                  <td style={{ textAlign: 'center', border: '1px solid #e2e8f0', background: isSelected ? 'rgba(124,58,237,0.06)' : 'transparent' }}>
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
                    } else if (col.key === 'P_SOURCE' && sourceYellow) {
                      cellBg = '#fef08a'; // yellow when Others > 0
                    } else if (isDirty) {
                      cellBg = '#fff3cd'; // dirty edits
                    } else if (isCalcLike) {
                      cellBg = '#f8fafc'; // calc / auto-filled
                    } else {
                      cellBg = gc.bg;
                    }

                    return (
                      <td key={col.key} style={{
                        padding: 0, border: '1px solid #e2e8f0', background: cellBg,
                        fontWeight: isCalcLike ? 700 : 400
                      }}>
                        {isCalcLike ? (
                          <div style={{ padding: '6px', textAlign: 'center' }}>{displayVal}</div>
                        ) : (
                          <input
                            type="text"
                            value={displayVal}
                            title={dateError ? `⚠️ ${MONTH_NAMES[selMonth - 1]} only has ${new Date(selYear, selMonth, 0).getDate()} days` : undefined}
                            onChange={e => handleCellEdit(row._id, col.key, e.target.value)}
                            style={{
                              width: '100%', height: '100%', padding: '6px',
                              border: dateError ? '2px solid #dc2626' : 'none',
                              background: 'transparent', textAlign: 'center',
                              fontSize: '12px', fontWeight: isDirty ? 700 : 400, outline: 'none'
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
              <tr style={{ background: '#16a34a' }}>
                <td colSpan={2} style={{
                  padding: '8px', border: '1px solid #15803d',
                  fontWeight: 900, textAlign: 'center', color: '#fff', fontSize: 13
                }}>
                  {MONTH_NAMES[selMonth - 1].toUpperCase()} {selYear} TOTAL
                </td>
                {COLUMNS.map(col => {
                  const val = NUMERIC_COLS.find(c => c.key === col.key) ? monthSums[col.key] : '—';
                  return (
                    <td key={col.key} style={{
                      padding: '8px 4px', border: '1px solid #15803d',
                      fontWeight: 900, textAlign: 'center', color: '#fff', fontSize: 12
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
