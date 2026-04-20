import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Box, Button, CircularProgress, Typography, IconButton,
  Snackbar, Alert, Chip, Tooltip
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import axios from 'axios';
import { io } from 'socket.io-client';
import { exportToCsv } from '../utils/exportCsv';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const SOCKET_URL = import.meta.env.VITE_SOCKET_IO_URL || API_URL;
const socket = io(SOCKET_URL, { autoConnect: true });

export const COLUMNS = [
  { key: 'Transaction Date', label: 'TRANSACTION\nDATE', width: 140, type: 'manual', isDate: true },
  { key: 'Ledger Name', label: 'LEDGER\nNAME', width: 180, type: 'manual' },
  { key: 'Names', label: 'NAMES', width: 160, type: 'manual' },
  { key: 'Particulars', label: 'PARTICULARS', width: 220, type: 'manual' },
  { key: 'Remarks', label: 'REMARKS', width: 200, type: 'manual' },
  { key: 'Reference No', label: 'REFERENCE\nNO', width: 140, type: 'manual' },
  { key: 'Cheque No', label: 'CHEQUE\nNO', width: 140, type: 'manual' },
  { key: 'Withdraw', label: 'WITHDRAW', width: 130, type: 'manual' },
  { key: 'Deposit', label: 'DEPOSIT', width: 130, type: 'manual' },
  { key: 'Closing Balance', label: 'CLOSING\nBALANCE', width: 140, type: 'manual' },
];

export default function AccountDetails({ onBack }) {
  const [entries, setEntries] = useState([]);
  const [localData, setLocalData] = useState({}); // { rowId: { field: val } }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState(null);

  const dirtyCount = Object.keys(localData).length;
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const allSelected = entries.length > 0 && selectedIds.size === entries.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleSelect = (id) => setSelectedIds(prev => {
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  });
  const toggleSelectAll = () => {
    if (allSelected || someSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(entries.map(r => r._id)));
  };

  const fetchData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await axios.get(`${API_URL}/account-details`);
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

  useEffect(() => {
    fetchData();
    socket.on('accountDetailsUpdate', (msg) => {
      fetchData(true);
    });
    return () => socket.off('accountDetailsUpdate');
  }, [fetchData]);

  const computedRows = useMemo(() => {
    return entries.map(row => {
      return { ...row, ...(localData[row._id] || {}) };
    });
  }, [entries, localData]);

  const handleCellEdit = useCallback((rowId, field, value) => {
    setLocalData(prev => ({
      ...prev,
      [rowId]: { ...(prev[rowId] || {}), [field]: value }
    }));
  }, []);

  const handleAddRow = () => {
    const newId = 'new_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    setEntries(prev => [{ _id: newId, isNewRow: true }, ...prev]);
    setLocalData(prev => ({ ...prev, [newId]: { isNewRow: true } }));
  };

  const handleBulkDelete = async () => {
    setDeleting(true);
    try {
      const token = localStorage.getItem('token');
      const ids = [...selectedIds].filter(id => !id.startsWith('new_'));
      const newIds = [...selectedIds].filter(id => id.startsWith('new_'));
      
      if (ids.length > 0) {
        await axios.delete(`${API_URL}/account-details/bulk-delete`, {
          headers: { Authorization: `Bearer ${token}` },
          data: { ids },
        });
      }
      
      setEntries(prev => prev.filter(r => !selectedIds.has(r._id)));
      setLocalData(prev => {
        const n = { ...prev };
        selectedIds.forEach(id => delete n[id]);
        return n;
      });
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
      await axios.put(
        `${API_URL}/account-details/bulk-update`,
        { updates },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSnack({ severity: 'success', msg: `Saved successfully!` });
      fetchData(); // reload to get real IDs for new rows
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Save failed: ' + (err.response?.data?.error || err.message) });
      setSaving(false);
    }
  };

  const handleExport = () => exportToCsv('account_details.xls', computedRows);

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
      await axios.post(`${API_URL}/account-details/bulk`, { entries: rows }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchData();
      setSnack({ severity: 'success', msg: `${rows.length} rows imported!` });
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Import failed: ' + err.message });
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
      {/* ── Top Bar ─────────────────────────────────────────────────────── */}
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

        <Box sx={{ display: 'flex', gap: 1, ml: 1 }}>
          <Chip size="small" label="✏️ Manual Entry Grid" sx={{ bgcolor: '#fff7ed', fontSize: '10px', fontWeight: 600, height: 20 }} />
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
          <Button size="small" component="label" variant="outlined" startIcon={<UploadIcon />}
            sx={{ fontWeight: 700, borderRadius: 2, fontSize: '12px' }}>
            Import
            <input type="file" accept=".csv" hidden onChange={handleImport} />
          </Button>
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

      {/* ── Group header row ─────────────────────────────────────────────── */}
      <Box sx={{ overflow: 'auto', flex: 1 }}>
        <table style={{
          borderCollapse: 'collapse', minWidth: '100%',
          tableLayout: 'fixed', fontFamily: 'Inter, system-ui, sans-serif', fontSize: '12px'
        }}>
          <colgroup>
            <col style={{ width: 40, minWidth: 40 }} />
            {COLUMNS.map(c => <col key={c.key} style={{ width: c.width, minWidth: c.width }} />)}
          </colgroup>

          <thead>
            <tr>
              <th style={{
                position: 'sticky', top: 0, zIndex: 3, width: 40, minWidth: 40,
                background: 'linear-gradient(135deg,#1e293b,#0f172a)',
                textAlign: 'center', padding: '7px 4px',
                borderRight: '1px solid rgba(255,255,255,0.12)',
              }}>
                <input
                  type="checkbox" checked={allSelected}
                  ref={el => { if (el) el.indeterminate = someSelected; }}
                  onChange={toggleSelectAll} style={{ cursor: 'pointer', width: 14, height: 14, accentColor: '#0f766e' }}
                />
              </th>
              {COLUMNS.map((col) => (
                <th key={col.key} style={{
                  position: 'sticky', top: 0, zIndex: 2,
                  background: 'linear-gradient(135deg,#0f766e,#115e59)', color: '#ccfbf1',
                  padding: '10px 5px', textAlign: 'center', fontSize: '10px', fontWeight: 700,
                  letterSpacing: '0.3px', whiteSpace: 'pre-line', lineHeight: 1.3,
                  borderRight: '1px solid rgba(255,255,255,0.12)',
                }}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {computedRows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 1} style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>
                  No entries found. Click "Add Row" or "Import".
                </td>
              </tr>
            )}
            {computedRows.map((row, ri) => {
              const hasDraft = !!localData[row._id];
              const isSelected = selectedIds.has(row._id);
              return (
                <tr key={row._id} style={{
                  background: isSelected ? 'rgba(15,118,110,0.08)' : hasDraft ? '#fffbeb' : ri % 2 === 0 ? '#fff' : '#f8fafc',
                }}>
                  <td style={{ width: 40, textAlign: 'center', border: '1px solid #e2e8f0', padding: '4px' }}>
                    <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(row._id)} style={{ cursor: 'pointer', accentColor: '#0f766e' }} />
                  </td>
                  {COLUMNS.map((col) => {
                    const rawVal = row[col.key];
                    const localVal = localData[row._id]?.[col.key];
                    const displayVal = localVal !== undefined ? localVal : (rawVal !== null && rawVal !== undefined ? String(rawVal) : '');
                    const isDirty = localVal !== undefined;

                    return (
                      <td key={col.key} style={{
                        padding: 0, border: '1px solid #e2e8f0',
                        borderRight: isDirty ? '2px solid #f59e0b' : '1px solid #e2e8f0',
                      }}>
                        <input
                          type={col.isDate ? 'date' : 'text'}
                          value={displayVal}
                          onChange={(e) => handleCellEdit(row._id, col.key, e.target.value)}
                          style={{
                            width: '100%', height: '100%', border: 'none', padding: '6px 8px',
                            background: 'transparent', outline: 'none', fontSize: '12px', color: '#1e293b',
                            fontFamily: 'inherit'
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Box>

      {/* Confirm delete dialog */}
      {confirmDel && (
        <Box sx={{
          position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,23,42,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setConfirmDel(false)}>
          <Box sx={{ bgcolor: '#fff', borderRadius: 3, p: 4, maxWidth: 420, width: '90%' }} onClick={e => e.stopPropagation()}>
            <Typography variant="h6" fontWeight={800} color="error.main" mb={2}>Delete {selectedIds.size} Row(s)?</Typography>
            <Box display="flex" gap={1.5} justifyContent="flex-end">
              <Button onClick={() => setConfirmDel(false)}>Cancel</Button>
              <Button variant="contained" color="error" onClick={handleBulkDelete} disabled={deleting}>
                {deleting ? 'Deleting...' : 'Yes, Delete'}
              </Button>
            </Box>
          </Box>
        </Box>
      )}

      {/* Snackbar */}
      <Snackbar open={!!snack} autoHideDuration={4000} onClose={() => setSnack(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {snack && <Alert severity={snack.severity} variant="filled">{snack.msg}</Alert>}
      </Snackbar>
    </Box>
  );
}
