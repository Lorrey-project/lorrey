import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Box, Button, CircularProgress, Typography, IconButton,
  Snackbar, Alert, Chip, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions,
  Autocomplete, TextField
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

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const SOCKET_URL = import.meta.env.VITE_SOCKET_IO_URL || API_URL;

// Columns configuration
export const COLUMNS = [
  { key: 'Transaction Date', label: 'TRANSACTION\nDATE', width: 140, isDate: true },
  { key: 'Ledger Name',      label: 'LEDGER\nNAME',        width: 180 },
  { key: 'Names',            label: 'NAMES',               width: 160 },
  { key: 'Particulars',      label: 'PARTICULARS',         width: 220 },
  { key: 'Remarks',          label: 'REMARKS',            width: 200 },
  { key: 'Reference No',     label: 'REFERENCE\nNO',       width: 140 },
  { key: 'Cheque No',        label: 'CHEQUE\nNO',          width: 140 },
  { key: 'Withdraw',         label: 'WITHDRAW',            width: 130 },
  { key: 'Deposit',          label: 'DEPOSIT',             width: 130 },
  { key: 'Closing Balance',  label: 'CLOSING\nBALANCE',    width: 140 },
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
  const [deleting, setDeleting] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [bankUploadPreview, setBankUploadPreview] = useState(null);

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

  // Initialize socket inside component or use a stable reference
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

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const computedRows = useMemo(() =>
    entries.map(row => ({ ...row, ...(localData[row._id] || {}) })),
    [entries, localData]);

  const handleCellEdit = useCallback((rowId, field, value) => {
    setLocalData(prev => ({ ...prev, [rowId]: { ...(prev[rowId] || {}), [field]: value } }));
  }, []);

  const handleAddRow = () => {
    const newId = 'new_' + Date.now();
    setEntries(prev => [{ _id: newId, isNewRow: true }, ...prev]);
    setLocalData(prev => ({ ...prev, [newId]: { isNewRow: true } }));
  };

  const handleBulkDelete = async () => {
    setDeleting(true);
    try {
      const token = localStorage.getItem('token');
      const ids = [...selectedIds].filter(id => !id.startsWith('new_'));
      if (ids.length > 0) {
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
    } finally {
      setDeleting(false);
    }
  };

  const handleSave = async () => {
    if (dirtyCount === 0) return;
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const updates = Object.entries(localData).map(([id, changes]) => ({
        id: id.startsWith('new_') ? null : id,
        isNewRow: id.startsWith('new_'),
        changes
      }));
      await axios.put(`${API_URL}/account-details/bulk-update`, { updates }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSnack({ severity: 'success', msg: 'Saved successfully!' });
      fetchData();
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Save failed: ' + (err.response?.data?.error || err.message) });
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => exportToCsv('account_details.xls', computedRows);

  const handleBankStatementUpload = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('statement', file);
      const res = await axios.post(`${API_URL}/account-details/upload-statement`, formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
      });
      if (res.data.success) {
        setBankUploadPreview({ count: res.data.count, filename: file.name });
        fetchData();
      }
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Upload failed: ' + (err.response?.data?.error || err.message) });
    } finally {
      setUploading(false);
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

        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Chip size="small" label="🏦 Auto from Bank" sx={{ bgcolor: '#f0fdf4', color: '#15803d', fontSize: '10px', fontWeight: 700, height: 20 }} />
          <Chip size="small" label="✏️ 3 Manual Fields" sx={{ bgcolor: '#fff7ed', color: '#c2410c', fontSize: '10px', fontWeight: 600, height: 20 }} />
        </Box>

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
            size="small" component="label" variant="contained"
            startIcon={uploading ? <CircularProgress size={13} color="inherit" /> : <AccountBalanceIcon />}
            disabled={uploading}
            sx={{
              fontWeight: 800, borderRadius: 2, px: 2, fontSize: '12px',
              background: 'linear-gradient(135deg, #0891b2, #0e7490)',
              '&:hover': { background: 'linear-gradient(135deg, #0e7490, #155e75)' }
            }}>
            {uploading ? 'Parsing...' : 'Upload Bank Statement'}
            <input type="file" accept=".xlsx,.xls,.csv" hidden onChange={handleBankStatementUpload} />
          </Button>

          <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={handleAddRow}
            sx={{ fontWeight: 800, borderRadius: 2, px: 2, fontSize: '12px', bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' } }}>
            Add Row
          </Button>
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

      <Box sx={{ px: 2.5, py: 0.8, bgcolor: '#f0f9ff', borderBottom: '1px solid #bae6fd', display: 'flex', gap: 2, alignItems: 'center', flexShrink: 0 }}>
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

      <Box sx={{ overflow: 'auto', flex: 1 }}>
        <table style={{ borderCollapse: 'collapse', minWidth: '100%', tableLayout: 'fixed', fontFamily: 'Inter, sans-serif', fontSize: '12px' }}>
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
            {computedRows.map((row, ri) => (
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
                      {col.key === 'Ledger Name' || col.key === 'Names' ? (
                        <Autocomplete
                          freeSolo
                          disableClearable
                          options={col.key === 'Ledger Name' ? LEDGER_OPTIONS : NAMES_OPTIONS}
                          value={val}
                          onChange={(e, newVal) => handleCellEdit(row._id, col.key, newVal)}
                          onInputChange={(e, newVal) => handleCellEdit(row._id, col.key, newVal)}
                          PaperComponent={({ children }) => (
                            <Box sx={{ 
                              bgcolor: 'rgba(255, 255, 255, 0.98)', 
                              backdropFilter: 'blur(8px)',
                              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                              border: '1px solid #e2e8f0',
                              borderRadius: '10px',
                              mt: 0.5,
                              overflow: 'hidden',
                              '& .MuiAutocomplete-listbox': {
                                padding: '4px',
                                maxHeight: '300px', // Limit height for Names list
                                '& .MuiAutocomplete-option': {
                                  fontSize: '13px',
                                  padding: '8px 12px',
                                  borderRadius: '6px',
                                  color: '#334155',
                                  '&[aria-selected="true"]': {
                                    bgcolor: '#eff6ff',
                                    color: '#2563eb',
                                    fontWeight: 600
                                  },
                                  '&.Mui-focused': {
                                    bgcolor: '#f1f5f9'
                                  }
                                }
                              }
                            }}>
                              {children}
                            </Box>
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

      {confirmDel && (
        <Dialog open={confirmDel} onClose={() => setConfirmDel(false)}>
          <DialogTitle sx={{ fontWeight: 800, color: 'error.main' }}>Delete {selectedIds.size} row(s)?</DialogTitle>
          <DialogActions>
            <Button onClick={() => setConfirmDel(false)}>Cancel</Button>
            <Button variant="contained" color="error" onClick={handleBulkDelete}>Delete</Button>
          </DialogActions>
        </Dialog>
      )}

      <Dialog open={!!bankUploadPreview} onClose={() => setBankUploadPreview(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: '#15803d' }}>🏦 Bank Statement Imported!</DialogTitle>
        <DialogContent>
          <Typography variant="h3" fontWeight={900} color="#15803d" textAlign="center">{bankUploadPreview?.count}</Typography>
          <Typography variant="body1" textAlign="center">transactions from <strong>{bankUploadPreview?.filename}</strong></Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBankUploadPreview(null)} variant="contained" sx={{ bgcolor: '#15803d' }}>Got it</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snack} autoHideDuration={4000} onClose={() => setSnack(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {snack && <Alert severity={snack.severity} variant="filled">{snack.msg}</Alert>}
      </Snackbar>
    </Box>
  );
}
