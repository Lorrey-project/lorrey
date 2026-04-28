import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  Box, Button, CircularProgress, Typography, IconButton,
  Snackbar, Alert, Chip, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions,
  Autocomplete, TextField, Divider, LinearProgress
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import axios from 'axios';
import { io } from 'socket.io-client';
import { exportToCsv } from '../utils/exportCsv';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const SOCKET_URL = import.meta.env.VITE_SOCKET_IO_URL || '/';

// Columns configuration
export const COLUMNS = [
  { key: 'Transaction Date', label: 'TRANSACTION\nDATE', width: 140, isDate: true },
  { key: 'Ledger Name', label: 'LEDGER\nNAME', width: 180 },
  { key: 'Names', label: 'NAMES', width: 160 },
  { key: 'Particulars', label: 'PARTICULARS', width: 220 },
  { key: 'Remarks', label: 'REMARKS', width: 800 },
  { key: 'Reference No', label: 'REFERENCE\nNO', width: 140 },
  { key: 'Cheque No', label: 'CHEQUE\nNO', width: 140 },
  { key: 'Withdraw', label: 'WITHDRAW', width: 130 },
  { key: 'Deposit', label: 'DEPOSIT', width: 130 },
  { key: 'Closing Balance', label: 'CLOSING\nBALANCE', width: 140 },
  { key: 'Remittance Copy', label: 'REMITTANCE\nCOPY', width: 150 },
];

const LEDGER_OPTIONS = [
  "CA charges", "Capital investment", "Capital investment refund", "Challan Sign",
  "Employee P Tax", "Endhan Cash Back", "Fasttag payment", "Freight Advance",
  "Freight payment", "Freight Payment Refund", "GST Paid", "interest Paid",
  "ITR return", "Main cash", "Office Exp", "Partner Interest", "Partner Salary",
  "Payment recived", "Printing&stationary", "Pump payment", "Room rent",
  "Salary Advance", "Staff Salary", "subscription", "TDS on Cash Withdrawl",
  "Tds Payment", "Toll Payment"
];

const NAMES_OPTIONS = [
  "Abhijit Ghosh", "Animesh Banerjee", "Animesh mukherjee", "Arobindo Roy",
  "Arup Mondol", "Avijit Gorai", "Bablu Bar", "Bhola Yadav", "Biplab Goswami",
  "Bithi Nayak", "Challan Sign", "DAC GST paid", "Dilip Panja", "Dipali Nayak",
  "Dipali Association", "Endhaan Cash Book", "Fasttag Payment", "Gorachand Dutta",
  "Goutam Kumar roy", "Haradhan Mondal", "Indranil Ray", "Interest paid",
  "ITR retund", "Jayanta maji", "Kanika nayak", "Kush Singh", "Main Cash",
  "Manas Sarkar", "Manoj Modak", "Md Faiyaz Alam", "Mir Ahasan Ali", "NVCL",
  "NVL", "Office Exp.", "Pbd Associations", "Prasanta Maji",
  "Printing & Stationary", "Ragunath guin", "Room Rent", "Ruhul Sk",
  "Sajal Banerjee", "satyanarayan Ghosh", "Sekh mustafa", "Suvadip Konar",
  "Sonthalia Pump", "Sourav Ghosh", "Subscription", "Suman Ghosh",
  "Supriyo Das CA charges", "Suraj Singh", "Swarup Bhowal", "Tapas Maji",
  "TDS on CashWithdrawl", "TDS Payment", "Tushar Kanti Mondal", "Uday Malik",
  "Uttam Roy"
];

const AUTO_COLS = new Set(['Transaction Date', 'Remarks', 'Reference No', 'Cheque No', 'Withdraw', 'Deposit', 'Closing Balance']);
const MANUAL_COLS = new Set(['Ledger Name', 'Names', 'Particulars']);

export default function AccountDetails({ onBack }) {
  const [entries, setEntries] = useState([]);
  const [localData, setLocalData] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [snack, setSnack] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [confirmDel, setConfirmDel] = useState(false);
  const [bankUploadPreview, setBankUploadPreview] = useState(null);
  const [bankDateDialog, setBankDateDialog] = useState(false);
  const [bankFromDate, setBankFromDate] = useState('');
  const [bankToDate, setBankToDate] = useState('');
  const [uploadedDates, setUploadedDates] = useState([]);
  const fileInputRef = useRef(null);
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [rowUploading, setRowUploading] = useState(null); // Track per-row upload state

  const dirtyCount = Object.keys(localData).length;
  const allSelected = entries.length > 0 && selectedIds.size === entries.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleSelect = (id) => setSelectedIds(prev => {
    const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s;
  });
  const toggleSelectAll = () => {
    if (allSelected || someSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(entries.map(r => r._id)));
  };

  useEffect(() => {
    let socket;
    try {
      socket = io(SOCKET_URL, { autoConnect: true });
      socket.on('accountDetailsUpdate', () => fetchData(true));
    } catch (err) {
      console.warn('Socket error in AccountDetails:', err.message);
    }
    return () => { if (socket) socket.disconnect(); };
  }, []);

  const fetchData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/account-details`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) {
        setEntries(res.data.entries);
        setLocalData({});
      }
    } catch (e) {
      console.error('Fetch AccountDetails failed:', e);
      setSnack({ severity: 'error', msg: 'Failed to fetch data' });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchUploadedDates = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/account-details/uploaded-date-ranges`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) setUploadedDates(res.data.uploadedDates || []);
    } catch (e) {
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchUploadedDates();
  }, [fetchData, fetchUploadedDates]);

  const computedRows = useMemo(() =>
    entries.map(row => ({ ...row, ...(localData[row._id] || {}) })),
    [entries, localData]);

  const filteredRows = useMemo(() => {
    const parseDateStr = (dStr) => {
      if (!dStr) return null;
      const parts = String(dStr).split(/[-\/]/);
      if (parts.length !== 3) return null;
      if (parts[0].length === 4) {
        return new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2])).getTime();
      } else {
        return new Date(parseInt(parts[2]), parseInt(parts[1])-1, parseInt(parts[0])).getTime();
      }
    };

    let result = [...computedRows];
    if (filterFrom || filterTo) {
      const fromTime = filterFrom ? new Date(filterFrom).getTime() : 0;
      const toTime = filterTo ? new Date(filterTo).getTime() : Infinity;
      result = result.filter(row => {
        const d = row['Transaction Date'] || row.transactionDate || '';
        const t = parseDateStr(d);
        if (!t) return true; // keep empty dates if filtering? Or drop them? Let's keep or drop? Let's drop if there is a filter.
        if (fromTime && t < fromTime) return false;
        if (toTime && toTime !== Infinity && t > toTime) return false;
        return true;
      });
    }

    result.sort((a, b) => {
      const tA = parseDateStr(a['Transaction Date'] || a.transactionDate) || 0;
      const tB = parseDateStr(b['Transaction Date'] || b.transactionDate) || 0;
      // Also consider created_at for stable sort if dates are equal
      if (tB !== tA) return tB - tA; 
      // If dates are equal, sort new rows to top, or use internal ID
      if (a.isNewRow && !b.isNewRow) return -1;
      if (!a.isNewRow && b.isNewRow) return 1;
      return 0;
    });

    return result;
  }, [computedRows, filterFrom, filterTo]);

  const isFiltered = !!(filterFrom || filterTo);

  const handleCellEdit = useCallback((rowId, field, value) => {
    setLocalData(prev => ({ ...prev, [rowId]: { ...(prev[rowId] || {}), [field]: value } }));
  }, []);

  const handleAddRow = () => {
    const newId = 'new_' + Date.now();
    const today = new Date().toISOString().split('T')[0]; // Auto-fill today's date (YYYY-MM-DD)
    setEntries(prev => [{ _id: newId, isNewRow: true }, ...prev]);
    setLocalData(prev => ({ 
      ...prev, 
      [newId]: { 
        isNewRow: true,
        'Transaction Date': today 
      } 
    }));
  };

  const handleBulkDelete = async () => {
    try {
      const token = localStorage.getItem('token');
      const ids = [...selectedIds].filter(id => !id.startsWith('new_'));
      if (ids.length > 0) {
        // Clear main cashbook for each deleted 'Main cash' row
        for (const id of ids) {
          const row = entries.find(e => e._id === id);
          if (row && row['Ledger Name'] && row['Ledger Name'].toLowerCase() === 'main cash') {
            const transactionDate = row['Transaction Date'] || row.transactionDate;
            if (transactionDate) {
              try {
                await axios.post(`${API_URL}/account-details/clear-main-cash`, { transactionDate }, {
                  headers: { Authorization: `Bearer ${token}` }
                });
              } catch (e) {
                console.warn('Failed to clear main cash for date:', transactionDate);
              }
            }
          }
        }

        await axios.delete(`${API_URL}/account-details/bulk-delete`, {
          headers: { Authorization: `Bearer ${token}` },
          data: { ids },
        });
      }
      setEntries(prev => prev.filter(r => !selectedIds.has(r._id)));
      setSelectedIds(new Set());
      setConfirmDel(false);
      setSnack({ severity: 'success', msg: `${selectedIds.size} row(s) deleted.` });
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Delete failed: ' + (err.response?.data?.error || err.message) });
    }
  };

  const handleSave = async () => {
    if (dirtyCount === 0) return;
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const updates = [];
      
      // Validation: Ensure all modified rows have a Transaction Date
      for (const [id, changes] of Object.entries(localData)) {
        const originalEntry = entries.find(e => e._id === id);
        const transactionDate = changes['Transaction Date'] ?? originalEntry?.['Transaction Date'] ?? originalEntry?.transactionDate ?? '';
        
        if (!transactionDate) {
          setSnack({ severity: 'error', msg: 'Error: Transaction Date is required for all rows.' });
          setSaving(false);
          return;
        }
        
        updates.push({
          id: id.startsWith('new_') ? null : id,
          isNewRow: id.startsWith('new_'),
          changes
        });
      }

      await axios.put(`${API_URL}/account-details/bulk-update`, { updates }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const syncErrors = [];
      for (const [rowId, changes] of Object.entries(localData)) {
        const newLedger = changes['Ledger Name'];
        const originalEntry = entries.find(e => e._id === rowId);
        const oldLedger = originalEntry?.['Ledger Name'] || '';
        const transactionDate = changes['Transaction Date'] ?? originalEntry?.['Transaction Date'] ?? originalEntry?.transactionDate ?? '';

        if (!transactionDate) continue;
        const newIsMainCash = typeof newLedger === 'string' && newLedger.toLowerCase() === 'main cash';
        const oldWasMainCash = typeof oldLedger === 'string' && oldLedger.toLowerCase() === 'main cash';

        if (newIsMainCash) {
          const withdraw = changes['Withdraw'] !== undefined ? changes['Withdraw'] : (originalEntry?.['Withdraw'] || originalEntry?.withdraw || '');
          if (!withdraw || parseFloat(withdraw) <= 0) continue;
          try {
            await axios.post(`${API_URL}/account-details/sync-main-cash`, {
              transactionDate,
              withdrawAmount: parseFloat(withdraw)
            }, { headers: { Authorization: `Bearer ${token}` } });
          } catch (syncErr) {
            syncErrors.push(syncErr.response?.data?.error || `Sync failed for ${transactionDate}: ${syncErr.message}`);
          }
        } else if (oldWasMainCash && newLedger !== undefined && !newIsMainCash) {
          try {
            await axios.post(`${API_URL}/account-details/clear-main-cash`, {
              transactionDate
            }, { headers: { Authorization: `Bearer ${token}` } });
          } catch (clearErr) {
            syncErrors.push(clearErr.response?.data?.error || `Clear failed for ${transactionDate}: ${clearErr.message}`);
          }
        }
      }

      if (syncErrors.length > 0) {
        setSnack({ severity: 'warning', msg: `Saved ✓ — Cashbook sync issue: ${syncErrors[0]}` });
      } else {
        setSnack({ severity: 'success', msg: 'Saved! Main Cashbook updated.' });
      }
      fetchData();
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Save failed: ' + (err.response?.data?.error || err.message) });
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => exportToCsv('account_details.xls', computedRows);

  const handleUploadBankStatementClick = () => {
    setBankFromDate('');
    setBankToDate('');
    setBankDateDialog(true);
  };

  const handleDateConfirmed = () => {
    if (!bankFromDate || !bankToDate) {
      setSnack({ severity: 'warning', msg: 'Please select both From and To dates.' });
      return;
    }
    if (bankFromDate > bankToDate) {
      setSnack({ severity: 'warning', msg: '"From" date must be before or equal to "To" date.' });
      return;
    }
    setBankDateDialog(false);
    setTimeout(() => fileInputRef.current?.click(), 100);
  };

  const handleBankStatementUpload = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('statement', file);
      formData.append('fromDate', bankFromDate);
      formData.append('toDate', bankToDate);
      const res = await axios.post(`${API_URL}/account-details/upload-statement`, formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
      });
      if (res.data.success) {
        setBankUploadPreview({ count: res.data.count, filename: file.name, fromDate: bankFromDate, toDate: bankToDate });
        fetchData();
        fetchUploadedDates();
      }
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Upload failed: ' + (err.response?.data?.error || err.message) });
    } finally {
      setUploading(false);
    }
  };

  const handleRowRemittanceUpload = async (rowId, e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;

    if (rowId.startsWith('new_')) {
      setSnack({ severity: 'warning', msg: 'Please save the row first before uploading a remittance copy.' });
      return;
    }

    try {
      setRowUploading(rowId);
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', file);

      const res = await axios.post(`${API_URL}/account-details/upload-remittance/${rowId}`, formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
      });
      if (res.data.success) {
        setSnack({ severity: 'success', msg: 'Remittance copy uploaded for row!' });
        fetchData(true);
      }
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Upload failed: ' + (err.response?.data?.error || err.message) });
    } finally {
      setRowUploading(null);
    }
  };

  if (loading) {
    return (
      <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100vh" gap={2}>
        <CircularProgress size={48} thickness={4} sx={{ color: '#0f766e' }} />
        <Typography color="text.secondary" fontWeight={600}>Loading Account Details…</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#f8fafc', overflow: 'hidden' }}>
      <Box sx={{
        px: 2.5, py: 1.2,
        display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap',
        bgcolor: '#fff', borderBottom: '1px solid #e2e8f0',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)', flexShrink: 0
      }}>
        <IconButton onClick={onBack} size="small" sx={{ bgcolor: '#f1f5f9', '&:hover': { bgcolor: '#e2e8f0' } }}>
          <ArrowBackIcon fontSize="small" />
        </IconButton>
        <Typography variant="h6" fontWeight={800} sx={{ color: '#0f172a', letterSpacing: '-0.5px' }}>
          Account Details
        </Typography>

        {dirtyCount > 0 && <Chip label={`${dirtyCount} unsaved`} size="small" color="warning" sx={{ fontWeight: 700 }} />}
        {selectedIds.size > 0 && (
          <Tooltip title="Delete selected">
            <IconButton size="small" color="error" onClick={() => setConfirmDel(true)} sx={{ bgcolor: '#fee2e2' }}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        <Box sx={{ ml: 'auto', display: 'flex', gap: 1, alignItems: 'center' }}>
          <Button
            size="small" variant="contained"
            startIcon={uploading ? <CircularProgress size={13} color="inherit" /> : <AccountBalanceIcon />}
            disabled={uploading}
            onClick={handleUploadBankStatementClick}
            sx={{
              fontWeight: 800, borderRadius: 2, px: 2, fontSize: '12px',
              background: 'linear-gradient(135deg, #0891b2, #0e7490)',
              '&:hover': { background: 'linear-gradient(135deg, #0e7490, #155e75)' }
            }}>
            {uploading ? 'Parsing...' : 'Upload Bank Statement'}
          </Button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={handleBankStatementUpload} />


          <Tooltip title="Discard & reload">
            <IconButton size="small" onClick={() => fetchData()} sx={{ bgcolor: '#f1f5f9' }}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={handleExport}
            sx={{ fontWeight: 700, borderRadius: 2, fontSize: '12px' }}>XLS</Button>
          <Button
            size="small" variant="contained"
            startIcon={saving ? <CircularProgress size={13} color="inherit" /> : <SaveIcon />}
            onClick={handleSave} disabled={dirtyCount === 0 || saving}
            sx={{
              fontWeight: 800, borderRadius: 2, px: 2.5, fontSize: '12px',
              bgcolor: dirtyCount > 0 ? '#1d4ed8' : '#cbd5e1',
              boxShadow: dirtyCount > 0 ? '0 4px 12px rgba(29,78,216,0.35)' : 'none',
              '&:disabled': { bgcolor: '#cbd5e1', color: '#94a3b8' },
            }}>
            {saving ? 'Saving…' : `Save${dirtyCount > 0 ? ` (${dirtyCount})` : ''}`}
          </Button>
        </Box>
      </Box>

      {/* ── Column Key Bar ── */}
      <Box sx={{ px: 2.5, py: 0.7, bgcolor: '#f0f9ff', borderBottom: '1px solid #bae6fd', display: 'flex', gap: 2, alignItems: 'center', flexShrink: 0 }}>
        <Typography variant="caption" fontWeight={700} color="#0369a1">Column Key:</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: '#dcfce7', border: '1px solid #16a34a' }} />
          <Typography variant="caption" color="#15803d" fontWeight={600}>Auto (from bank statement)</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: '#fff7ed', border: '1px solid #f97316' }} />
          <Typography variant="caption" color="#c2410c" fontWeight={600}>Manual (Ledger Name, Names, Particulars)</Typography>
        </Box>
      </Box>

      {/* ── Date Range Filter Bar ── */}
      <Box sx={{
        px: 3, py: 1.2, flexShrink: 0,
        background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
        borderBottom: '2px solid #0ea5e9',
        display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{
            width: 30, height: 30, borderRadius: '8px',
            background: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(14,165,233,0.4)'
          }}>
            <span style={{ fontSize: 15 }}>📅</span>
          </Box>
          <Box>
            <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: '12px', lineHeight: 1.1 }}>
              Date Range Filter
            </Typography>
            <Typography sx={{ color: '#94a3b8', fontWeight: 500, fontSize: '10px', lineHeight: 1.1 }}>
              Filter bank statements by date
            </Typography>
          </Box>
        </Box>

        <Box sx={{ width: '1px', height: 32, bgcolor: 'rgba(255,255,255,0.15)' }} />

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4 }}>
          <Typography sx={{ color: '#94a3b8', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            From Date
          </Typography>
          <input
            type="date"
            value={filterFrom}
            onChange={e => setFilterFrom(e.target.value)}
            style={{
              padding: '7px 12px', borderRadius: 8, fontSize: '13px', fontWeight: 700,
              border: filterFrom ? '2px solid #0ea5e9' : '2px solid rgba(255,255,255,0.15)',
              background: filterFrom ? 'rgba(14,165,233,0.18)' : 'rgba(255,255,255,0.07)',
              color: filterFrom ? '#e0f2fe' : '#94a3b8', outline: 'none', cursor: 'pointer', transition: 'all 0.2s', minWidth: 145,
            }}
          />
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'flex-end', pb: 0.3 }}>
          <Typography sx={{ color: '#475569', fontSize: '18px', fontWeight: 900, mt: '18px' }}>→</Typography>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4 }}>
          <Typography sx={{ color: '#94a3b8', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            To Date
          </Typography>
          <input
            type="date"
            value={filterTo}
            min={filterFrom || undefined}
            onChange={e => setFilterTo(e.target.value)}
            style={{
              padding: '7px 12px', borderRadius: 8, fontSize: '13px', fontWeight: 700,
              border: filterTo ? '2px solid #0ea5e9' : '2px solid rgba(255,255,255,0.15)',
              background: filterTo ? 'rgba(14,165,233,0.18)' : 'rgba(255,255,255,0.07)',
              color: filterTo ? '#e0f2fe' : '#94a3b8', outline: 'none', cursor: 'pointer', transition: 'all 0.2s', minWidth: 145,
            }}
          />
        </Box>

        {isFiltered && (
          <>
            <Box sx={{ width: '1px', height: 32, bgcolor: 'rgba(255,255,255,0.15)', ml: 1 }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, ml: 0.5 }}>
              <Box sx={{
                display: 'flex', alignItems: 'center', gap: 0.8, px: 2, py: 0.8, borderRadius: 10,
                background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', boxShadow: '0 2px 10px rgba(14,165,233,0.4)'
              }}>
                <Typography sx={{ color: '#fff', fontWeight: 900, fontSize: '13px' }}>{filteredRows.length}</Typography>
                <Typography sx={{ color: 'rgba(255,255,255,0.8)', fontWeight: 600, fontSize: '11px' }}>
                  {filteredRows.length === 1 ? 'row found' : 'rows found'}
                </Typography>
              </Box>
              <Button size="small" onClick={() => { setFilterFrom(''); setFilterTo(''); }}
                sx={{ fontWeight: 800, fontSize: '12px', color: '#fca5a5', border: '1.5px solid rgba(252,165,165,0.4)', borderRadius: '8px', px: 1.5, py: 0.5, textTransform: 'none' }}>
                ✕ Clear Filter
              </Button>
            </Box>
          </>
        )}
      </Box>

      <Box sx={{ overflow: 'auto', flex: 1 }}>
        <table style={{ borderCollapse: 'collapse', width: 'max-content', tableLayout: 'fixed', fontFamily: 'Inter, sans-serif', fontSize: '12px' }}>
          <colgroup>
            <col style={{ width: 40 }} />
            {COLUMNS.map(c => <col key={c.key} style={{ width: c.width }} />)}
          </colgroup>
          <thead>
            <tr>
              <th style={{ position: 'sticky', top: 0, zIndex: 3, background: '#1e293b', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} style={{ cursor: 'pointer' }} />
              </th>
              {COLUMNS.map((col) => {
                const isAuto = AUTO_COLS.has(col.key);
                const isManual = MANUAL_COLS.has(col.key);
                return (
                  <th key={col.key} style={{
                    position: 'sticky', top: 0, zIndex: 2,
                    background: isAuto ? '#059669' : isManual ? '#ea580c' : '#0f766e',
                    color: '#fff', padding: '10px 5px', textAlign: 'center', fontSize: '10px', fontWeight: 700,
                    whiteSpace: 'pre-line', borderRight: '1px solid rgba(255,255,255,0.1)',
                  }}>
                    {col.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, ri) => (
              <tr key={row._id} style={{ background: selectedIds.has(row._id) ? '#f0f9ff' : ri % 2 === 0 ? '#fff' : '#f8fafc' }}>
                <td style={{ textAlign: 'center', border: '1px solid #e2e8f0' }}>
                  <input type="checkbox" checked={selectedIds.has(row._id)} onChange={() => toggleSelect(row._id)} />
                </td>
                {COLUMNS.map((col) => {
                  const val = localData[row._id]?.[col.key] ?? (row[col.key] || '');
                  const isAuto = AUTO_COLS.has(col.key);
                  const isFromBank = row._source === 'bank_statement';
                  return (
                    <td key={col.key} style={{ border: '1px solid #e2e8f0', padding: 0 }}>
                      {col.key === 'Remittance Copy' ? (
                        <Box sx={{ p: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                          {rowUploading === row._id ? (
                            <CircularProgress size={20} sx={{ color: '#0284c7' }} />
                          ) : (row.remittanceFileUrl || localData[row._id]?.remittanceFileUrl) ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={() => window.open(row.remittanceFileUrl || localData[row._id]?.remittanceFileUrl, '_blank')}
                                sx={{ fontSize: '10px', p: '2px 8px', fontWeight: 700, borderRadius: 1 }}
                              >
                                View
                              </Button>
                              <Tooltip title="Replace file">
                                <IconButton
                                  size="small"
                                  component="label"
                                  sx={{ bgcolor: '#f1f5f9', width: 24, height: 24, '&:hover': { bgcolor: '#e2e8f0' } }}
                                >
                                  <RefreshIcon sx={{ fontSize: '14px', color: '#64748b' }} />
                                  <input type="file" hidden onChange={(e) => handleRowRemittanceUpload(row._id, e)} />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          ) : (
                            <Button
                              size="small"
                              variant="contained"
                              component="label"
                              sx={{
                                fontSize: '10px', p: '2px 10px', fontWeight: 800, borderRadius: 1,
                                bgcolor: '#0284c7', '&:hover': { bgcolor: '#0369a1' },
                                boxShadow: 'none'
                              }}
                            >
                              Upload
                              <input type="file" hidden onChange={(e) => handleRowRemittanceUpload(row._id, e)} />
                            </Button>
                          )}
                        </Box>
                      ) : col.key === 'Ledger Name' || col.key === 'Names' ? (
                        <Autocomplete
                          options={col.key === 'Ledger Name' ? LEDGER_OPTIONS : NAMES_OPTIONS}
                          value={val || ''}
                          freeSolo
                          onChange={(e, newValue) => handleCellEdit(row._id, col.key, newValue)}
                          onInputChange={(e, newInputValue) => handleCellEdit(row._id, col.key, newInputValue)}
                          ListboxProps={{
                            style: {
                              background: 'rgba(255, 255, 255, 0.98)',
                              backdropFilter: 'blur(8px)',
                              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                              border: '1px solid #e2e8f0',
                              borderRadius: '10px',
                              padding: '4px',
                              maxHeight: '300px'
                            }
                          }}
                          renderOption={(props, option) => (
                            <li {...props} style={{
                              fontSize: '13px',
                              padding: '8px 12px',
                              borderRadius: '6px',
                              color: '#334155',
                              backgroundColor: props['aria-selected'] === true ? '#eff6ff' : 'transparent'
                            }}>
                              {option}
                            </li>
                          )}
                          renderInput={(params) => (
                            <TextField
                              {...params}
                              variant="standard"
                              placeholder={col.key === 'Ledger Name' ? "Search Ledger..." : "Search Name..."}
                              InputProps={{
                                ...params.InputProps,
                                disableUnderline: true,
                                style: {
                                  fontSize: '12px',
                                  padding: '4px 8px',
                                  fontWeight: val ? 700 : 400,
                                  color: '#1e293b'
                                }
                              }}
                            />
                          )}
                          sx={{
                            width: '100%',
                            '& .MuiAutocomplete-inputRoot': { padding: 0 },
                            '& .MuiAutocomplete-input': {
                              padding: '8px 8px !important',
                              transition: 'background 0.2s',
                              '&:hover': { bgcolor: '#f8fafc' },
                              '&:focus': { bgcolor: '#fff' }
                            },
                            '& .MuiAutocomplete-endAdornment': { display: 'none' }
                          }}
                        />
                      ) : (
                        <input
                          type={col.isDate ? 'date' : 'text'}
                          value={val}
                          readOnly={isAuto && isFromBank && !localData[row._id]?.[col.key]}
                          onChange={(e) => handleCellEdit(row._id, col.key, e.target.value)}
                          style={{
                            width: '100%', height: '100%', border: 'none', padding: '6px 8px',
                            background: 'transparent', outline: 'none', fontSize: '12px'
                          }}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Box>

      {/* ── Bank Statement Date Range Picker Dialog ── */}
      <Dialog
        open={bankDateDialog}
        onClose={() => setBankDateDialog(false)}
        maxWidth="sm" fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            background: 'linear-gradient(145deg, #0f172a, #1e293b)',
            color: '#f8fafc',
            boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
            border: '1px solid rgba(255,255,255,0.08)'
          }
        }}
      >
        <DialogTitle sx={{ fontWeight: 800, fontSize: '1.15rem', color: '#38bdf8', pb: 0, display: 'flex', alignItems: 'center', gap: 1 }}>
          <AccountBalanceIcon sx={{ fontSize: 22 }} /> Select Statement Date Range
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography variant="body2" sx={{ color: '#94a3b8', mb: 2.5, lineHeight: 1.6 }}>
            Choose the date range covered by your bank statement. If a statement has already been uploaded for any date in this range, the upload will be blocked to prevent duplicates.
          </Typography>

          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" fontWeight={700} sx={{ color: '#7dd3fc', mb: 0.5, display: 'block' }}>From Date</Typography>
              <input
                type="date"
                value={bankFromDate}
                onChange={e => setBankFromDate(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(56,189,248,0.35)',
                  color: '#f8fafc', fontSize: '14px', fontWeight: 600, outline: 'none',
                  cursor: 'pointer', boxSizing: 'border-box'
                }}
              />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" fontWeight={700} sx={{ color: '#7dd3fc', mb: 0.5, display: 'block' }}>To Date</Typography>
              <input
                type="date"
                value={bankToDate}
                min={bankFromDate || undefined}
                onChange={e => setBankToDate(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(56,189,248,0.35)',
                  color: '#f8fafc', fontSize: '14px', fontWeight: 600, outline: 'none',
                  cursor: 'pointer', boxSizing: 'border-box'
                }}
              />
            </Box>
          </Box>

          {uploadedDates.length > 0 && (
            <Box sx={{ mt: 1 }}>
              <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)', mb: 1.5 }} />
              <Typography variant="caption" fontWeight={700} sx={{ color: '#fbbf24', mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                ⚠️ Already Uploaded Dates ({uploadedDates.length} dates in DB)
              </Typography>
              <Box sx={{
                maxHeight: 120, overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5,
                '&::-webkit-scrollbar': { width: 4 },
                '&::-webkit-scrollbar-thumb': { background: 'rgba(255,255,255,0.2)', borderRadius: 2 }
              }}>
                {uploadedDates.map(d => (
                  <Chip
                    key={d} label={d} size="small"
                    sx={{
                      bgcolor: 'rgba(239,68,68,0.18)', color: '#fca5a5', fontSize: '10px', fontWeight: 700,
                      border: '1px solid rgba(239,68,68,0.35)', height: 20
                    }}
                  />
                ))}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={() => setBankDateDialog(false)} sx={{ color: '#94a3b8', fontWeight: 600 }}>Cancel</Button>
          <Button
            onClick={handleDateConfirmed}
            variant="contained"
            disabled={!bankFromDate || !bankToDate}
            sx={{
              fontWeight: 800, borderRadius: 2, px: 3,
              background: 'linear-gradient(135deg, #0891b2, #0e7490)',
              '&:hover': { background: 'linear-gradient(135deg, #0e7490, #155e75)' },
              '&:disabled': { bgcolor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)' }
            }}
          >
            Continue → Select File
          </Button>
        </DialogActions>
      </Dialog>

      {confirmDel && (
        <Dialog open={confirmDel} onClose={() => setConfirmDel(false)}>
          <DialogTitle sx={{ fontWeight: 800, color: 'error.main' }}>Delete {selectedIds.size} row(s)?</DialogTitle>
          <DialogActions>
            <Button onClick={() => setConfirmDel(false)}>Cancel</Button>
            <Button variant="contained" color="error" onClick={handleBulkDelete}>Delete</Button>
          </DialogActions>
        </Dialog>
      )}

      <Dialog open={!!bankUploadPreview} onClose={() => setBankUploadPreview(null)} maxWidth="sm" fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            background: 'linear-gradient(145deg, #0f172a, #1e293b)',
            color: '#f8fafc',
            border: '1px solid rgba(255,255,255,0.08)'
          }
        }}
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 1 }}>
          🏦 Bank Statement Imported!
        </DialogTitle>
        <DialogContent>
          <Typography variant="h3" fontWeight={900} color="#4ade80" textAlign="center">{bankUploadPreview?.count}</Typography>
          <Typography variant="body1" textAlign="center" sx={{ color: '#94a3b8' }}>
            transactions from <strong style={{ color: '#f8fafc' }}>{bankUploadPreview?.filename}</strong>
          </Typography>
          {bankUploadPreview?.fromDate && (
            <Typography variant="body2" textAlign="center" sx={{ mt: 1, color: '#7dd3fc', fontWeight: 600 }}>
              📅 {bankUploadPreview.fromDate} → {bankUploadPreview.toDate}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBankUploadPreview(null)} variant="contained"
            sx={{ bgcolor: '#15803d', '&:hover': { bgcolor: '#166534' }, fontWeight: 800 }}
          >Got it</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snack} autoHideDuration={4000} onClose={() => setSnack(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {snack && <Alert severity={snack.severity} variant="filled">{snack.msg}</Alert>}
      </Snackbar>
    </Box>
  );
}
