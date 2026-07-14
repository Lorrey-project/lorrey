import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, IconButton, TextField, CircularProgress,
  Snackbar, Alert, Tooltip, Select, MenuItem, FormControl, InputLabel,
  Tabs, Tab, Paper, Card, CardContent
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
  { key: 'SL NO', label: 'SL NO', width: 80, type: 'text', align: 'center' },
  { key: 'PUMP NAME', label: 'PUMP NAME', width: 180, type: 'text', align: 'center' },
  { key: 'PERIOD', label: 'PERIOD', width: 120, type: 'text', align: 'center' },
  { key: 'BILL NO', label: 'BILL NO', width: 120, type: 'text', align: 'center' },
  { key: 'BILL AMOUNT', label: 'BILL AMOUNT', width: 140, type: 'number', align: 'right' },
  { key: 'CD', label: 'CD', width: 110, type: 'number', align: 'right' },
  { key: 'PAYABLE AMOUNT', label: 'PAYABLE AMOUNT', width: 160, type: 'number', readOnly: true, align: 'right' },
  { key: 'PAYMENT AMOUNT', label: 'PAYMENT AMOUNT', width: 150, type: 'number', align: 'right' },
  { key: 'REF. NO', label: 'REF. NO', width: 130, type: 'text', align: 'center' },
  { key: 'DATE', label: 'DATE', width: 150, type: 'date', align: 'center' },
  { key: 'DUE AMOUNT', label: 'DUE AMOUNT', width: 160, type: 'number', readOnly: true, align: 'right' }
];

const getFirstDayOfMonthString = (month, yearRange) => {
  const year = parseInt(yearRange.split('-')[0], 10);
  const calendarYear = month >= 4 ? year : year + 1;
  return `01/${String(month).padStart(2, '0')}/${calendarYear}`;
};

const formatCurrency = (val) => {
  const numVal = parseFloat(val);
  if (isNaN(numVal)) return '₹0.00';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(numVal);
};

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
  const [activeTab, setActiveTab] = useState(false);

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
        const records = res.data.records || [];
        
        let openingRecord = records.find(r => r.isOpeningBalance);
        const otherRecords = records.filter(r => !r.isOpeningBalance);
        
        if (!openingRecord) {
          openingRecord = {
            _id: `new_opening_balance_${selMonth}_${selYear}`,
            isOpeningBalance: true,
            'SL NO': '',
            'PUMP NAME': 'OPENING BALANCE',
            'PERIOD': '',
            'BILL NO': '',
            'BILL AMOUNT': 0,
            'CD': 0,
            'PAYABLE AMOUNT': 0,
            'PAYMENT AMOUNT': 0,
            'REF. NO': '',
            'DATE': getFirstDayOfMonthString(selMonth, selYear),
            'DUE AMOUNT': 0
          };
        }
        
        otherRecords.sort((a, b) => {
          const parseToDate = (str) => {
            if (!str) return new Date(0);
            const pts = str.split('/');
            if (pts.length === 3) return new Date(parseInt(pts[2]), parseInt(pts[1]) - 1, parseInt(pts[0]));
            return new Date(str);
          };
          return parseToDate(a['DATE']) - parseToDate(b['DATE']);
        });

        setRows([openingRecord, ...otherRecords]);
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
    const newRow = { _id: newId, isOpeningBalance: false };
    COLUMNS.forEach(c => {
      if (c.key !== 'PAYABLE AMOUNT' && c.key !== 'DUE AMOUNT') {
        newRow[c.key] = '';
      }
    });
    setRows(prev => [prev[0], newRow, ...prev.slice(1)]);
  };

  const toggleSelect = (id) => {
    if (id === 'opening_balance' || id.toString().includes('opening_balance')) return;
    setSelectedIds(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const isSelectableRows = rows.filter(r => !r.isOpeningBalance);
  const toggleSelectAll = () => {
    if (selectedIds.size === isSelectableRows.length && isSelectableRows.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(isSelectableRows.map(r => r._id)));
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
      const updatedRow = { ...originalRow, ...localEdits[id] };
      
      if (updatedRow.isOpeningBalance) {
        const firstDay = getFirstDayOfMonthString(selMonth, selYear);
        updatedRow['DATE'] = firstDay;
        updatedRow['LOADING DATE'] = firstDay;
        updatedRow['PUMP NAME'] = 'OPENING BALANCE';
      } else {
        updatedRow['LOADING DATE'] = updatedRow['DATE'] || '';
      }
      
      return updatedRow;
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

  const displayRows = React.useMemo(() => {
    let runningDue = 0;
    return rows.map((row, index) => {
      const getVal = (key, type) => {
        const edited = localEdits[row._id]?.[key];
        if (edited !== undefined) return type === 'number' ? parseFloat(edited) || 0 : edited;
        return type === 'number' ? parseFloat(row[key]) || 0 : row[key];
      };

      const billAmount = getVal('BILL AMOUNT', 'number');
      const cd = getVal('CD', 'number');
      const payableAmount = billAmount - cd;
      const paymentAmount = getVal('PAYMENT AMOUNT', 'number');

      let dueAmount = 0;
      if (index === 0) {
        dueAmount = getVal('DUE AMOUNT', 'number');
        runningDue = dueAmount;
      } else {
        dueAmount = runningDue + payableAmount - paymentAmount;
        runningDue = dueAmount;
      }

      return {
        ...row,
        'PAYABLE AMOUNT': payableAmount,
        'DUE AMOUNT': dueAmount
      };
    });
  }, [rows, localEdits]);

  const handleExport = () => {
    const exportData = displayRows.map(r => {
      const rowData = {};
      COLUMNS.forEach(c => {
        rowData[c.label] = r[c.key] || '';
      });
      return rowData;
    });
    exportToCsv(exportData, `Pump_Payment_Register_${MONTH_NAMES[selMonth - 1]}_${selYear}.csv`);
  };

  return (
    <Box sx={{
      p: { xs: 2, md: 4 },
      maxWidth: '1600px',
      margin: '0 auto',
      animation: 'fadeIn 0.4s ease-out forwards',
      '@keyframes fadeIn': {
        from: { opacity: 0, transform: 'translateY(8px)' },
        to: { opacity: 1, transform: 'translateY(0)' }
      }
    }}>
      {/* CSS Overrides for Premium Aesthetics */}
      <style dangerouslySetInnerHTML={{ __html: `
        .premium-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.85rem;
        }
        .premium-table th {
          position: sticky;
          top: 0;
          z-index: 10;
          background-color: #f8fafc;
          border-bottom: 2px solid #e2e8f0;
          color: #475569;
          font-weight: 700;
          text-transform: uppercase;
          font-size: 0.75rem;
          letter-spacing: 0.05em;
          padding: 14px 10px;
        }
        .premium-table td {
          padding: 8px 10px;
          border-bottom: 1px solid #f1f5f9;
          color: #1e293b;
          transition: background-color 0.15s ease;
        }
        .premium-table tr {
          transition: background-color 0.15s ease;
        }
        .premium-table tr:hover td {
          background-color: #f8fafc !important;
        }
        .premium-input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          background-color: #ffffff;
          font-family: inherit;
          font-size: 0.825rem;
          color: #0f172a;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .premium-input:focus {
          border-color: #0ea5e9 !important;
          box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.12) !important;
          outline: none;
        }
        .premium-input:disabled {
          background-color: #f8fafc;
          color: #64748b;
          border-color: #e2e8f0;
          cursor: not-allowed;
          font-weight: 600;
        }
        .opening-balance-row td {
          background-color: #eff6ff !important;
          font-weight: 600;
        }
        .opening-balance-row:hover td {
          background-color: #dbeafe !important;
        }
      ` }} />

      {/* ─── Header Section ─── */}
      <Box display="flex" alignItems="center" gap={2} mb={3.5}>
        <IconButton
          onClick={onBack}
          sx={{
            bgcolor: 'white',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            border: '1px solid #e2e8f0',
            '&:hover': { bgcolor: '#f8fafc', transform: 'scale(1.05)' },
            transition: 'all 0.2s'
          }}
        >
          <ArrowBackIcon sx={{ color: '#475569' }} />
        </IconButton>
        <Box>
          <Typography variant="h4" fontWeight={900} color="#0f172a" sx={{ letterSpacing: '-0.02em', fontSize: { xs: '1.75rem', md: '2.25rem' } }}>
            Pump Payment Register
          </Typography>
          <Typography variant="body2" color="#64748b" sx={{ mt: 0.5 }}>
            Manage Petrol Pump ledgers, track billing, payments, and running balances.
          </Typography>
        </Box>
      </Box>

      {/* ─── Main Card Wrapper ─── */}
      <Card sx={{
        borderRadius: '16px',
        boxShadow: '0 4px 20px -2px rgba(0,0,0,0.04), 0 2px 6px -1px rgba(0,0,0,0.02)',
        border: '1px solid #e2e8f0',
        bgcolor: '#ffffff',
        overflow: 'visible'
      }}>
        <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
          {/* ─── Tabs Navigation Bar ─── */}
          <Box sx={{ borderBottom: '1px solid #e2e8f0', bgcolor: '#f8fafc', px: 3, pt: 1.5, borderTopLeftRadius: '16px', borderTopRightRadius: '16px' }}>
            <Tabs
              value={activeTab}
              onChange={(e, v) => setActiveTab(v)}
              aria-label="pump payment register tabs"
              sx={{
                '& .MuiTab-root': {
                  fontWeight: 800,
                  fontSize: '0.85rem',
                  textTransform: 'none',
                  minWidth: 160,
                  py: 1.8,
                  color: '#64748b',
                  transition: 'all 0.2s ease',
                  '&:hover': { color: '#0ea5e9' }
                },
                '& .Mui-selected': { color: '#0ea5e9 !important' },
                '& .MuiTabs-indicator': { backgroundColor: '#0ea5e9', height: 3, borderRadius: '3px 3px 0 0' }
              }}
            >
              <Tab label="Sonthalia Auto Service" value={0} />
            </Tabs>
          </Box>

          {/* ─── Tab Content Panel ─── */}
          {activeTab === 0 ? (
            <Box sx={{ p: 3, animation: 'fadeIn 0.3s ease-out' }}>
              {/* ─── Control Bar: Filters & Action Buttons ─── */}
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={3.5} flexWrap="wrap" gap={2}>
                {/* Left Side: Period selection */}
                <Box display="flex" gap={2} flexWrap="wrap">
                  <FormControl size="small" sx={{ minWidth: 160, bgcolor: 'white' }}>
                    <InputLabel id="fy-select-label">Financial Year</InputLabel>
                    <Select
                      labelId="fy-select-label"
                      value={selYear}
                      label="Financial Year"
                      onChange={e => setSelYear(e.target.value)}
                      sx={{ borderRadius: '10px' }}
                    >
                      {yearOptions.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
                    </Select>
                  </FormControl>

                  <FormControl size="small" sx={{ minWidth: 160, bgcolor: 'white' }}>
                    <InputLabel id="month-select-label">Month</InputLabel>
                    <Select
                      labelId="month-select-label"
                      value={selMonth}
                      label="Month"
                      onChange={e => setSelMonth(e.target.value)}
                      sx={{ borderRadius: '10px' }}
                    >
                      {MONTH_NAMES.map((m, i) => <MenuItem key={m} value={i + 1}>{m}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Box>

                {/* Right Side: Action Button Actions */}
                <Box display="flex" alignItems="center" gap={1.5} flexWrap="wrap">
                  <Button
                    variant="outlined"
                    startIcon={<RefreshIcon />}
                    onClick={fetchData}
                    disabled={loading}
                    sx={{
                      borderRadius: '10px',
                      textTransform: 'none',
                      fontWeight: 700,
                      borderColor: '#cbd5e1',
                      color: '#475569',
                      bgcolor: 'white',
                      height: '40px',
                      px: 2,
                      '&:hover': { bgcolor: '#f8fafc', borderColor: '#94a3b8' }
                    }}
                  >
                    Refresh
                  </Button>

                  <Button
                    variant="outlined"
                    startIcon={<DownloadIcon />}
                    onClick={handleExport}
                    sx={{
                      borderRadius: '10px',
                      textTransform: 'none',
                      fontWeight: 700,
                      borderColor: '#cbd5e1',
                      color: '#475569',
                      bgcolor: 'white',
                      height: '40px',
                      px: 2,
                      '&:hover': { bgcolor: '#f8fafc', borderColor: '#94a3b8' }
                    }}
                  >
                    Export CSV
                  </Button>

                  {selectedIds.size > 0 && (
                    <Button
                      variant="contained"
                      color="error"
                      startIcon={<DeleteIcon />}
                      onClick={handleBulkDelete}
                      disabled={deleting}
                      sx={{
                        borderRadius: '10px',
                        textTransform: 'none',
                        fontWeight: 700,
                        height: '40px',
                        px: 2,
                        boxShadow: 'none',
                        '&:hover': { boxShadow: 'none', bgcolor: '#b91c1c' }
                      }}
                    >
                      Delete ({selectedIds.size})
                    </Button>
                  )}

                  <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={handleAddRow}
                    sx={{
                      borderRadius: '10px',
                      textTransform: 'none',
                      fontWeight: 700,
                      bgcolor: '#0ea5e9',
                      height: '40px',
                      px: 2,
                      boxShadow: 'none',
                      '&:hover': { bgcolor: '#0284c7', boxShadow: 'none' }
                    }}
                  >
                    Add Row
                  </Button>

                  <Button
                    variant="contained"
                    color="success"
                    startIcon={<SaveIcon />}
                    onClick={handleSaveAll}
                    disabled={saving}
                    sx={{
                      borderRadius: '10px',
                      textTransform: 'none',
                      fontWeight: 700,
                      bgcolor: '#10b981',
                      height: '40px',
                      px: 2,
                      boxShadow: 'none',
                      '&:hover': { bgcolor: '#059669', boxShadow: 'none' }
                    }}
                  >
                    {saving ? 'Saving...' : 'Save All'}
                  </Button>
                </Box>
              </Box>

              {/* ─── Ledger Content Area ─── */}
              {loading ? (
                <Box py={10} display="flex" flexDirection="column" justifyContent="center" alignItems="center" gap={2}>
                  <CircularProgress size={40} sx={{ color: '#0ea5e9' }} />
                  <Typography variant="body2" color="#64748b">Loading ledger details...</Typography>
                </Box>
              ) : displayRows.length === 0 ? (
                /* Empty state */
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 8, textAlign: 'center' }}>
                  <Box sx={{ width: 80, height: 80, mb: 2.5, opacity: 0.6 }}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '100%', height: '100%', color: '#94a3b8' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                    </svg>
                  </Box>
                  <Typography variant="h6" fontWeight={800} color="#1e293b" mb={1}>
                    No Pump Payment records available.
                  </Typography>
                  <Typography variant="body2" color="#64748b" mb={3}>
                    Click "Add Row" to start entry for this period.
                  </Typography>
                </Box>
              ) : (
                /* Interactive Ledger Table container */
                <Box sx={{
                  width: '100%',
                  overflowX: 'auto',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
                }}>
                  <Box sx={{ minWidth: 1300, maxHeight: '65vh', overflowY: 'auto' }}>
                    <table className="premium-table">
                      <thead>
                        <tr>
                          <th style={{ width: 50, textAlign: 'center' }}>
                            <input 
                              type="checkbox" 
                              checked={isSelectableRows.length > 0 && selectedIds.size === isSelectableRows.length} 
                              onChange={toggleSelectAll} 
                              style={{
                                transform: 'scale(1.15)',
                                cursor: 'pointer',
                                accentColor: '#0ea5e9'
                              }}
                            />
                          </th>
                          {COLUMNS.map(c => (
                            <th
                              key={c.key}
                              style={{
                                width: c.width,
                                textAlign: c.align || 'left'
                              }}
                            >
                              {c.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {displayRows.map((row, idx) => {
                          const isOb = row.isOpeningBalance;
                          return (
                            <tr
                              key={row._id}
                              className={isOb ? 'opening-balance-row' : ''}
                              style={{
                                backgroundColor: idx % 2 === 0 ? '#ffffff' : '#fcfdfe'
                              }}
                            >
                              {/* Action selection checkbox cell */}
                              <td style={{ textAlign: 'center', padding: '10px' }}>
                                <input 
                                  type="checkbox" 
                                  disabled={isOb}
                                  checked={selectedIds.has(row._id)} 
                                  onChange={() => toggleSelect(row._id)}
                                  style={{
                                    transform: 'scale(1.15)',
                                    cursor: isOb ? 'not-allowed' : 'pointer',
                                    accentColor: '#0ea5e9'
                                  }}
                                />
                              </td>

                              {/* Key data cells mapping */}
                              {COLUMNS.map(c => {
                                const val = localEdits[row._id]?.[c.key] !== undefined ? localEdits[row._id][c.key] : row[c.key];
                                
                                let isDisabled = false;
                                let displayValue = val;

                                if (isOb) {
                                  if (c.key === 'PUMP NAME') {
                                    displayValue = 'OPENING BALANCE';
                                    isDisabled = true;
                                  } else if (c.key === 'DUE AMOUNT') {
                                    isDisabled = false;
                                  } else {
                                    displayValue = '';
                                    isDisabled = true;
                                  }
                                } else {
                                  if (c.readOnly) {
                                    isDisabled = true;
                                  }
                                }

                                return (
                                  <td
                                    key={c.key}
                                    style={{
                                      textAlign: c.align || 'left',
                                      padding: '6px 8px'
                                    }}
                                  >
                                    {isDisabled && c.readOnly ? (
                                      // Render read-only calculated columns with currency styling where applicable
                                      <Typography variant="body2" sx={{
                                        fontWeight: 700,
                                        color: '#334155',
                                        fontSize: '0.825rem',
                                        pr: c.align === 'right' ? 1.5 : 0
                                      }}>
                                        {c.key === 'PAYABLE AMOUNT' || c.key === 'DUE AMOUNT' 
                                          ? formatCurrency(displayValue) 
                                          : displayValue}
                                      </Typography>
                                    ) : c.type === 'select' ? (
                                      <select
                                        value={displayValue || ''}
                                        disabled={isDisabled}
                                        onChange={e => handleEdit(row._id, c.key, e.target.value)}
                                        className="premium-input"
                                        style={{ textAlignLast: c.align || 'left' }}
                                      >
                                        <option value=""></option>
                                        {c.options && c.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                      </select>
                                    ) : (
                                      <input
                                        type={c.type === 'date' ? 'text' : (c.type === 'number' ? 'number' : 'text')}
                                        placeholder={c.type === 'date' ? 'DD/MM/YYYY' : ''}
                                        value={displayValue || ''}
                                        disabled={isDisabled}
                                        onChange={e => handleEdit(row._id, c.key, e.target.value)}
                                        className="premium-input"
                                        style={{ textAlign: c.align || 'left' }}
                                      />
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </Box>
                </Box>
              )}
            </Box>
          ) : (
            /* Tab Unclicked Placeholder State */
            <Box sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              py: 12,
              px: 3,
              textAlign: 'center',
              animation: 'fadeIn 0.3s ease-out'
            }}>
              <Box sx={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                bgcolor: '#f0f9ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mb: 3
              }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3ZM19 19H5V5H19V19ZM7 10H17V12H7V10ZM7 14H17V16H7V14ZM7 6H17V8H7V6Z" fill="#0ea5e9"/>
                </svg>
              </Box>
              <Typography variant="h5" fontWeight={800} color="#0f172a" mb={1.5}>
                Sonthalia Auto Service Ledger
              </Typography>
              <Typography variant="body2" color="#64748b" sx={{ maxWidth: 420, mb: 4, lineHeight: 1.6 }}>
                Click the permanent tab above to load the Ledger table, verify payments, and log period invoices.
              </Typography>
              <Button
                variant="contained"
                onClick={() => setActiveTab(0)}
                sx={{
                  borderRadius: '10px',
                  bgcolor: '#0ea5e9',
                  fontWeight: 700,
                  textTransform: 'none',
                  px: 3,
                  py: 1.2,
                  boxShadow: '0 4px 12px rgba(14, 165, 233, 0.15)',
                  '&:hover': { bgcolor: '#0284c7', boxShadow: 'none' }
                }}
              >
                Open Ledger
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Snackbar Alert for feedback */}
      <Snackbar open={!!snack} autoHideDuration={4000} onClose={() => setSnack(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {snack && <Alert severity={snack.sev} onClose={() => setSnack(null)} variant="filled">{snack.msg}</Alert>}
      </Snackbar>
    </Box>
  );
}
