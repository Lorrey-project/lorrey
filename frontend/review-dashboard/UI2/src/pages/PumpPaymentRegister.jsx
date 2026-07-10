import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, IconButton, TextField, CircularProgress,
  Snackbar, Alert, Tooltip, Select, MenuItem, FormControl, InputLabel
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import axios from 'axios';
import { exportToCsv } from '../utils/exportCsv';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const COLUMNS = [
  { key: 'Payment Date', label: 'Payment Date', width: 150, type: 'date' },
  { key: 'Pump Name', label: 'Pump Name', width: 180, type: 'text' },
  { key: 'Invoice / Bill No', label: 'Invoice / Bill No', width: 150, type: 'text' },
  { key: 'Amount Paid', label: 'Amount Paid', width: 150, type: 'number' },
  { key: 'Payment Mode', label: 'Payment Mode', width: 150, type: 'select', options: ['Cash', 'Bank Transfer', 'Cheque', 'UPI', 'NEFT/RTGS'] },
  { key: 'Reference No', label: 'Reference No', width: 180, type: 'text' },
  { key: 'Remarks', label: 'Remarks', width: 300, type: 'text' }
];

export default function PumpPaymentRegister({ onBack }) {
  const now = new Date();
  const currentFyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1);
  const [selYear, setSelYear] = useState(`${currentFyStart}-${currentFyStart + 1}`);

  const [rows, setRows] = useState([]);
  const [localEdits, setLocalEdits] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState(null);
  
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, setDeleting] = useState(false);

  const yearOptions = [];
  for (let y = currentFyStart - 2; y <= currentFyStart + 1; y++) yearOptions.push(`${y}-${y + 1}`);

  const fetchData = async () => {
    setLoading(true);
    setLocalEdits({});
    setSelectedIds(new Set());
    try {
      const token = localStorage.getItem('token');
      const fyStartYear = parseInt(selYear.split('-')[0], 10);
      const calendarYear = selMonth >= 4 ? fyStartYear : fyStartYear + 1;

      const res = await axios.get(`${API_URL}/pump-payment-register`, {
        params: { month: selMonth, year: calendarYear },
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) {
        setRows(res.data.records);
      }
    } catch (e) {
      console.error(e);
      setSnack({ msg: 'Failed to fetch data', sev: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selMonth, selYear]);

  const handleEdit = (id, key, val) => {
    setLocalEdits(prev => ({
      ...prev,
      [id]: { ...(prev[id] || {}), [key]: val }
    }));
  };

  const handleAddRow = () => {
    const newId = `new_${Date.now()}`;
    const newRow = { _id: newId };
    COLUMNS.forEach(c => newRow[c.key] = '');
    setRows([newRow, ...rows]);
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === rows.length && rows.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map(r => r._id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} records?`)) return;

    setDeleting(true);
    try {
      const token = localStorage.getItem('token');
      const realIds = Array.from(selectedIds).filter(id => !id.toString().startsWith('new_'));
      
      if (realIds.length > 0) {
        await axios.post(`${API_URL}/pump-payment-register/bulk-delete`, 
          { ids: realIds },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
      
      setRows(prev => prev.filter(r => !selectedIds.has(r._id)));
      setLocalEdits(prev => {
        const next = { ...prev };
        selectedIds.forEach(id => delete next[id]);
        return next;
      });
      setSelectedIds(new Set());
      setSnack({ msg: 'Records deleted successfully', sev: 'success' });
    } catch (e) {
      console.error(e);
      setSnack({ msg: 'Failed to delete', sev: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveAll = async () => {
    const updates = Object.keys(localEdits).map(id => {
      const originalRow = rows.find(r => r._id === id) || { _id: id };
      return { ...originalRow, ...localEdits[id] };
    });

    if (updates.length === 0) {
      setSnack({ msg: 'No changes to save', sev: 'info' });
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.put(`${API_URL}/pump-payment-register/bulk-update`, 
        { updates }, 
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.success) {
        setSnack({ msg: 'Saved successfully', sev: 'success' });
        fetchData();
      }
    } catch (e) {
      console.error(e);
      setSnack({ msg: 'Failed to save', sev: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    const exportData = rows.map(r => {
      const rowData = {};
      COLUMNS.forEach(c => {
        const val = localEdits[r._id]?.[c.key] !== undefined ? localEdits[r._id][c.key] : r[c.key];
        rowData[c.label] = val || '';
      });
      return rowData;
    });
    exportToCsv(exportData, `Pump_Payment_Register_${MONTH_NAMES[selMonth - 1]}_${selYear}.csv`);
  };

  return (
    <Box sx={{ p: 3, maxWidth: '100%', margin: '0 auto' }}>
      {/* ─── Header & Filters ─── */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} flexWrap="wrap" gap={2}>
        <Box display="flex" alignItems="center" gap={2}>
          <IconButton onClick={onBack} sx={{ bgcolor: 'white', boxShadow: 1, '&:hover': { bgcolor: '#f1f5f9' } }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h4" fontWeight={900} color="#1e293b">
            Pump Payment Register
          </Typography>
        </Box>

        <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
          <FormControl size="small" sx={{ minWidth: 140, bgcolor: 'white' }}>
            <InputLabel>Financial Year</InputLabel>
            <Select value={selYear} label="Financial Year" onChange={e => setSelYear(e.target.value)}>
              {yearOptions.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 140, bgcolor: 'white' }}>
            <InputLabel>Month</InputLabel>
            <Select value={selMonth} label="Month" onChange={e => setSelMonth(e.target.value)}>
              {MONTH_NAMES.map((m, i) => <MenuItem key={m} value={i + 1}>{m}</MenuItem>)}
            </Select>
          </FormControl>

          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={fetchData} disabled={loading} sx={{ bgcolor: 'white' }}>
            Refresh
          </Button>
          <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleExport} sx={{ bgcolor: 'white' }}>
            Export CSV
          </Button>
          <Button
            variant="contained" color="error" startIcon={<DeleteIcon />}
            onClick={handleBulkDelete}
            disabled={selectedIds.size === 0 || deleting}
          >
            Delete ({selectedIds.size})
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleAddRow}>
            Add Row
          </Button>
          <Button variant="contained" color="success" startIcon={<SaveIcon />} onClick={handleSaveAll} disabled={saving}>
            {saving ? 'Saving...' : 'Save All'}
          </Button>
        </Box>
      </Box>

      {/* ─── Data Table ─── */}
      <Box sx={{ width: '100%', overflowX: 'auto', bgcolor: 'white', borderRadius: 2, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
        {loading ? (
          <Box p={5} display="flex" justifyContent="center"><CircularProgress /></Box>
        ) : rows.length === 0 ? (
          <Box p={5} textAlign="center" color="text.secondary">No records found for this period. Click "Add Row" to start.</Box>
        ) : (
          <Box sx={{ minWidth: 1000 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontFamily: 'inherit' }}>
              <thead>
                <tr>
                  <th style={{ padding: '12px 8px', borderBottom: '2px solid #e2e8f0', backgroundColor: '#f8fafc', width: 50, textAlign: 'center' }}>
                    <input 
                      type="checkbox" 
                      checked={rows.length > 0 && selectedIds.size === rows.length} 
                      onChange={toggleSelectAll} 
                      style={{ transform: 'scale(1.2)' }}
                    />
                  </th>
                  {COLUMNS.map(c => (
                    <th key={c.key} style={{ padding: '12px 8px', borderBottom: '2px solid #e2e8f0', backgroundColor: '#eff6ff', fontSize: '0.85rem', fontWeight: 700, color: '#1e3a8a', width: c.width }}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row._id} style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <input 
                        type="checkbox" 
                        checked={selectedIds.has(row._id)} 
                        onChange={() => toggleSelect(row._id)}
                        style={{ transform: 'scale(1.2)' }}
                      />
                    </td>
                    {COLUMNS.map(c => {
                      const val = localEdits[row._id]?.[c.key] !== undefined ? localEdits[row._id][c.key] : row[c.key];
                      return (
                        <td key={c.key} style={{ padding: '4px 8px' }}>
                          {c.type === 'select' ? (
                            <select
                              value={val || ''}
                              onChange={e => handleEdit(row._id, c.key, e.target.value)}
                              style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                            >
                              <option value=""></option>
                              {c.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                          ) : (
                            <input
                              type={c.type === 'date' ? 'text' : (c.type === 'number' ? 'number' : 'text')}
                              placeholder={c.type === 'date' ? 'DD/MM/YYYY' : ''}
                              value={val || ''}
                              onChange={e => handleEdit(row._id, c.key, e.target.value)}
                              style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', backgroundColor: 'white' }}
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
        )}
      </Box>

      <Snackbar open={!!snack} autoHideDuration={4000} onClose={() => setSnack(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {snack && <Alert severity={snack.sev} onClose={() => setSnack(null)} variant="filled">{snack.msg}</Alert>}
      </Snackbar>
    </Box>
  );
}
