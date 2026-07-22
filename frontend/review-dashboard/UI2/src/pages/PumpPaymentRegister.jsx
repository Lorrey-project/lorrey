import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, IconButton, CircularProgress,
  Snackbar, Alert, Select, MenuItem, FormControl, InputLabel,
  Card, CardContent, Grid, InputAdornment, TextField,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination, TableSortLabel,
  Checkbox, Tooltip
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import SearchIcon from '@mui/icons-material/Search';
import PaymentIcon from '@mui/icons-material/Payment';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import AssessmentIcon from '@mui/icons-material/Assessment';
import DateRangeIcon from '@mui/icons-material/DateRange';
import axios from 'axios';
import { exportToCsv } from '../utils/exportCsv';

const API_URL = import.meta.env.VITE_API_URL;
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';
import { io } from "socket.io-client";

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const COLUMNS = [
  { key: 'SL NO', label: 'SL NO', width: 80, type: 'text', align: 'center', readOnly: true },
  { key: 'PUMP NAME', label: 'PUMP NAME', width: 180, type: 'text', align: 'center', bg: '#e0f2fe' },
  { key: 'PERIOD', label: 'PERIOD/DATE', width: 250, type: 'text', align: 'center', bg: '#e0f2fe' },
  { key: 'BILL NO', label: 'BILL NO', width: 230, type: 'text', align: 'center', bg: '#e0f2fe' },
  { key: 'BILL AMOUNT', label: 'BILL AMOUNT', width: 150, type: 'number', align: 'right', bg: '#e0f2fe' },
  { key: 'LITRE', label: 'LITRE', width: 130, type: 'number', align: 'right', readOnly: true, bg: '#e0f2fe' },
  { key: 'CD', label: 'CD', width: 110, type: 'number', align: 'right', readOnly: true, calc: true, bg: '#ffe4e6' },
  { key: 'PAYABLE AMOUNT', label: 'PAYABLE AMOUNT (BA − CD)', width: 230, type: 'number', readOnly: true, align: 'right', bg: '#e0f2fe' },
  { key: 'PAYMENT AMOUNT', label: 'PAYMENT AMOUNT', width: 150, type: 'number', align: 'right' },
  { key: 'REF. NO', label: 'REF. NO', width: 220, type: 'text', align: 'center' },
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

const MetricCard = ({ title, value, icon, color }) => (
  <Card sx={{ 
    height: '100%', 
    borderRadius: '16px', 
    boxShadow: '0 4px 20px -2px rgba(0,0,0,0.04), 0 2px 6px -1px rgba(0,0,0,0.02)',
    border: '1px solid #e2e8f0',
    transition: 'transform 0.2s',
    '&:hover': { transform: 'translateY(-4px)', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }
  }}>
    <CardContent sx={{ display: 'flex', alignItems: 'center', p: 3, '&:last-child': { pb: 3 } }}>
      <Box sx={{ 
        bgcolor: `${color}15`, 
        p: 2, 
        borderRadius: '12px', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        color: color,
        mr: 2.5
      }}>
        {icon}
      </Box>
      <Box>
        <Typography variant="body2" color="#64748b" fontWeight={600} gutterBottom sx={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.7rem' }}>
          {title}
        </Typography>
        <Typography variant="h5" color="#0f172a" fontWeight={800} sx={{ letterSpacing: '-0.02em' }}>
          {value}
        </Typography>
      </Box>
    </CardContent>
  </Card>
);

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
  
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [orderBy, setOrderBy] = useState('');
  const [order, setOrder] = useState('asc');

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


        setRows(records);
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
    
    let socket;
    try {
      socket = io(SOCKET_URL, {
        autoConnect: true,
        transports: ["websocket", "polling"]
      });
      socket.on('pumpPaymentRegisterUpdate', () => fetchData(true));
    } catch (err) {
      console.warn('Socket error in PumpPaymentRegister:', err.message);
    }
    
    return () => {
      if (socket) socket.disconnect();
    };
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
    COLUMNS.forEach(c => {
      if (c.key !== 'PAYABLE AMOUNT' && c.key !== 'DUE AMOUNT') {
        newRow[c.key] = '';
      }
    });
    setRows(prev => [newRow, ...prev]);
    setPage(0);
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const isSelectableRows = rows;
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
      
      if (!updatedRow['LOADING DATE']) {
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

  const computedRows = React.useMemo(() => {
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

  const metrics = React.useMemo(() => {
    const actualRecords = computedRows;
    const totalPayments = actualRecords.reduce((acc, r) => acc + (parseFloat(localEdits[r._id]?.['PAYMENT AMOUNT'] ?? r['PAYMENT AMOUNT']) || 0), 0);
    const totalBills = actualRecords.reduce((acc, r) => acc + (parseFloat(localEdits[r._id]?.['BILL AMOUNT'] ?? r['BILL AMOUNT']) || 0), 0);
    const pendingDue = computedRows.length > 0 ? computedRows[computedRows.length - 1]['DUE AMOUNT'] : 0;
    
    return {
      totalEntries: actualRecords.length,
      totalAmountPaid: formatCurrency(totalPayments),
      currentMonthBills: formatCurrency(totalBills),
      pendingDue: formatCurrency(pendingDue)
    };
  }, [computedRows, localEdits]);

  const filteredAndSortedRows = React.useMemo(() => {
    let result = computedRows;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(r => 
        (r['PUMP NAME'] && String(r['PUMP NAME']).toLowerCase().includes(q)) ||
        (r['BILL NO'] && String(r['BILL NO']).toLowerCase().includes(q)) ||
        (r['REF. NO'] && String(r['REF. NO']).toLowerCase().includes(q))
      );
    }

    const parseToDate = (str) => {
      if (!str) return new Date(0).getTime();
      const pts = str.split('/');
      if (pts.length === 3) return new Date(parseInt(pts[2]), parseInt(pts[1]) - 1, parseInt(pts[0])).getTime();
      return new Date(str).getTime();
    };

    result.sort((a, b) => {
      if (!orderBy) return 0;

      let valA = localEdits[a._id]?.[orderBy] ?? a[orderBy];
      let valB = localEdits[b._id]?.[orderBy] ?? b[orderBy];

      const type = COLUMNS.find(c => c.key === orderBy)?.type;
      
      if (type === 'number') {
        valA = parseFloat(valA) || 0;
        valB = parseFloat(valB) || 0;
      } else if (type === 'date') {
        valA = parseToDate(valA);
        valB = parseToDate(valB);
      } else {
        valA = String(valA || '').toLowerCase();
        valB = String(valB || '').toLowerCase();
      }

      if (valA < valB) return order === 'asc' ? -1 : 1;
      if (valA > valB) return order === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [computedRows, localEdits, searchQuery, orderBy, order]);

  const paginatedRows = filteredAndSortedRows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const handleSortRequest = (property) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const handleExport = () => {
    const exportData = filteredAndSortedRows.map(r => {
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
      <style dangerouslySetInnerHTML={{ __html: `
        .premium-input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid transparent;
          border-radius: 8px;
          background-color: transparent;
          font-family: inherit;
          font-size: 0.85rem;
          color: #0f172a;
          transition: all 0.2s;
        }
        .premium-input:hover:not(:disabled) {
          background-color: #f1f5f9;
          border-color: #cbd5e1;
        }
        .premium-input:focus {
          border-color: #0ea5e9 !important;
          background-color: #ffffff;
          box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.12) !important;
          outline: none;
        }
        .premium-input:disabled {
          color: #334155;
          font-weight: 600;
          cursor: not-allowed;
        }
        .opening-balance-row {
          background-color: #eff6ff !important;
        }
        .opening-balance-row:hover {
          background-color: #dbeafe !important;
        }
      ` }} />

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
            Sonthalia Auto Service &bull; Manage ledgers, track billing, payments, and running balances.
          </Typography>
        </Box>
      </Box>


      <Card sx={{
        borderRadius: '16px',
        boxShadow: '0 4px 20px -2px rgba(0,0,0,0.04), 0 2px 6px -1px rgba(0,0,0,0.02)',
        border: '1px solid #e2e8f0',
        bgcolor: '#ffffff',
        overflow: 'hidden'
      }}>
        <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
          <Box sx={{ p: 3 }}>
            
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} flexWrap="wrap" gap={2}>
              <Box display="flex" gap={2} flexWrap="wrap" alignItems="center">
                <FormControl size="small" sx={{ minWidth: 140, bgcolor: 'white' }}>
                  <InputLabel id="fy-select-label">Fin. Year</InputLabel>
                  <Select
                    labelId="fy-select-label"
                    value={selYear}
                    label="Fin. Year"
                    onChange={e => setSelYear(e.target.value)}
                    sx={{ borderRadius: '10px' }}
                  >
                    {yearOptions.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
                  </Select>
                </FormControl>

                <FormControl size="small" sx={{ minWidth: 140, bgcolor: 'white' }}>
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

                <TextField
                  placeholder="Search bills, pumps..."
                  variant="outlined"
                  size="small"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(0);
                  }}
                  sx={{
                    minWidth: 220,
                    '& .MuiOutlinedInput-root': { borderRadius: '10px', bgcolor: 'white' }
                  }}
                  InputProps={{
                    startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: '#94a3b8' }} /></InputAdornment>,
                  }}
                />
              </Box>

              <Box display="flex" alignItems="center" gap={1.5} flexWrap="wrap">
                <Button
                  variant="outlined"
                  startIcon={<RefreshIcon />}
                  onClick={fetchData}
                  disabled={loading}
                  sx={{
                    borderRadius: '10px', textTransform: 'none', fontWeight: 700, borderColor: '#cbd5e1',
                    color: '#475569', bgcolor: 'white', height: '40px', px: 2,
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
                    borderRadius: '10px', textTransform: 'none', fontWeight: 700, borderColor: '#cbd5e1',
                    color: '#475569', bgcolor: 'white', height: '40px', px: 2,
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
                      borderRadius: '10px', textTransform: 'none', fontWeight: 700, height: '40px', px: 2, boxShadow: 'none',
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
                    borderRadius: '10px', textTransform: 'none', fontWeight: 700, bgcolor: '#0ea5e9', height: '40px', px: 2, boxShadow: 'none',
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
                    borderRadius: '10px', textTransform: 'none', fontWeight: 700, bgcolor: '#10b981', height: '40px', px: 2, boxShadow: 'none',
                    '&:hover': { bgcolor: '#059669', boxShadow: 'none' }
                  }}
                >
                  {saving ? 'Saving...' : 'Save All'}
                </Button>
              </Box>
            </Box>

            {loading ? (
              <Box py={10} display="flex" flexDirection="column" justifyContent="center" alignItems="center" gap={2}>
                <CircularProgress size={40} sx={{ color: '#0ea5e9' }} />
                <Typography variant="body2" color="#64748b">Loading ledger details...</Typography>
              </Box>
            ) : filteredAndSortedRows.length === 0 ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 8, textAlign: 'center' }}>
                <Box sx={{ width: 80, height: 80, mb: 2.5, opacity: 0.6 }}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '100%', height: '100%', color: '#94a3b8' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                  </svg>
                </Box>
                <Typography variant="h6" fontWeight={800} color="#1e293b" mb={1}>
                  No records found.
                </Typography>
                <Typography variant="body2" color="#64748b" mb={3}>
                  Adjust your search or click "Add Row" to enter data.
                </Typography>
              </Box>
            ) : (
              <Box sx={{
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                overflow: 'hidden',
                boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
              }}>
                <TableContainer sx={{ maxHeight: '60vh' }}>
                  <Table stickyHeader sx={{ minWidth: 2000, '& .MuiTableCell-root': { py: 1.5, px: 1, borderBottom: '1px solid #f1f5f9' } }}>
                    <TableHead>
                      <TableRow>
                        <TableCell padding="checkbox" sx={{ bgcolor: '#f8fafc', width: 50, borderBottom: '2px solid #e2e8f0' }}>
                          <Checkbox
                            indeterminate={selectedIds.size > 0 && selectedIds.size < isSelectableRows.length}
                            checked={isSelectableRows.length > 0 && selectedIds.size === isSelectableRows.length}
                            onChange={toggleSelectAll}
                            sx={{ '&.Mui-checked': { color: '#0ea5e9' } }}
                          />
                        </TableCell>
                        {COLUMNS.map((c) => (
                          <TableCell
                            key={c.key}
                            align={c.align || 'left'}
                            sx={{ 
                              width: c.width,
                              minWidth: c.width,
                              bgcolor: c.bg || '#f8fafc',
                              fontWeight: 700,
                              color: '#475569',
                              fontSize: '0.75rem',
                              letterSpacing: '0.05em',
                              borderBottom: '2px solid #e2e8f0'
                            }}
                            sortDirection={orderBy === c.key ? order : false}
                          >
                            <TableSortLabel
                              active={orderBy === c.key}
                              direction={orderBy === c.key ? order : 'asc'}
                              onClick={() => handleSortRequest(c.key)}
                              sx={{
                                '&.Mui-active': { color: '#0f172a' },
                                '& .MuiTableSortLabel-icon': { color: '#0ea5e9 !important' }
                              }}
                            >
                              {c.label}
                            </TableSortLabel>
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {paginatedRows.map((row) => {
                        const isSelected = selectedIds.has(row._id);
                        return (
                          <TableRow
                            hover
                            key={row._id}
                            selected={isSelected}
                            sx={{
                              transition: 'background-color 0.2s',
                              '&:hover': { bgcolor: '#f8fafc' },
                              '&.Mui-selected': { bgcolor: '#f0f9ff', '&:hover': { bgcolor: '#e0f2fe' } }
                            }}
                          >
                            <TableCell padding="checkbox">
                              <Checkbox
                                checked={isSelected}
                                onChange={() => toggleSelect(row._id)}
                                sx={{ '&.Mui-checked': { color: '#0ea5e9' } }}
                              />
                            </TableCell>

                            {COLUMNS.map(c => {
                              const val = localEdits[row._id]?.[c.key] !== undefined ? localEdits[row._id][c.key] : row[c.key];
                              
                              let isDisabled = false;
                              let displayValue = val;

                              if (c.readOnly || (c.key === 'REF. NO' && row.isBankBookPumpPayment)) {
                                isDisabled = true;
                              }
                              // Dynamically render SL NO based on sorted/filtered rows index
                              if (c.key === 'SL NO') {
                                displayValue = filteredAndSortedRows.indexOf(row) + 1;
                              }

                              return (
                                <TableCell key={c.key} align={c.align || 'left'} sx={{ width: c.width, minWidth: c.width, backgroundColor: c.bg || 'inherit', padding: '8px' }}>
                                  {isDisabled && c.readOnly ? (
                                    <Typography variant="body2" sx={{
                                      fontWeight: 700,
                                      color: '#334155',
                                      fontSize: '0.85rem',
                                      whiteSpace: 'pre-line',
                                      padding: '8px 12px'
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
                                      style={{ textAlignLast: c.align || 'left', backgroundColor: c.bg || '#ffffff' }}
                                    >
                                      <option value=""></option>
                                      {c.options && c.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                  ) : c.key === 'PERIOD' ? (
                                    <textarea
                                      value={displayValue || ''}
                                      disabled={isDisabled}
                                      onChange={e => handleEdit(row._id, c.key, e.target.value)}
                                      className="premium-input"
                                      style={{ textAlign: c.align || 'left', resize: 'vertical', minHeight: '40px', paddingTop: '8px', paddingBottom: '8px', whiteSpace: 'pre-line', overflow: 'hidden', backgroundColor: c.bg || '#ffffff' }}
                                    />
                                  ) : c.key === 'REF. NO' ? (
                                    <Tooltip title={displayValue || ''} arrow enterDelay={300}>
                                      <div style={{ width: '100%' }}>
                                        <textarea
                                          value={displayValue || ''}
                                          disabled={isDisabled}
                                          onChange={e => handleEdit(row._id, c.key, e.target.value)}
                                          className="premium-input"
                                          style={{
                                            textAlign: c.align || 'left',
                                            resize: 'vertical',
                                            minHeight: '40px',
                                            paddingTop: '8px',
                                            paddingBottom: '8px',
                                            wordBreak: 'break-all',
                                            whiteSpace: 'pre-wrap',
                                            overflow: 'hidden',
                                            backgroundColor: c.bg || '#ffffff',
                                            fontFamily: 'inherit',
                                            fontSize: 'inherit',
                                            width: '100%',
                                            display: 'block'
                                          }}
                                        />
                                      </div>
                                    </Tooltip>
                                  ) : (
                                    <input
                                      type={c.type === 'date' ? 'text' : (c.type === 'number' ? 'number' : 'text')}
                                      placeholder={c.type === 'date' ? 'DD/MM/YYYY' : ''}
                                      value={displayValue || ''}
                                      disabled={isDisabled}
                                      onChange={e => handleEdit(row._id, c.key, e.target.value)}
                                      className="premium-input"
                                      style={{ textAlign: c.align || 'left', backgroundColor: c.bg || '#ffffff' }}
                                    />
                                  )}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
                
                <TablePagination
                  component="div"
                  count={filteredAndSortedRows.length}
                  page={page}
                  onPageChange={(e, newPage) => setPage(newPage)}
                  rowsPerPage={rowsPerPage}
                  onRowsPerPageChange={(e) => {
                    setRowsPerPage(parseInt(e.target.value, 10));
                    setPage(0);
                  }}
                  rowsPerPageOptions={[10, 25, 50, 100]}
                  sx={{
                    borderTop: '1px solid #e2e8f0',
                    bgcolor: '#ffffff',
                    '.MuiTablePagination-selectLabel, .MuiTablePagination-displayedRows': {
                      fontFamily: 'inherit',
                      color: '#475569'
                    }
                  }}
                />
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>

      <Snackbar open={!!snack} autoHideDuration={4000} onClose={() => setSnack(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {snack && <Alert severity={snack.sev} onClose={() => setSnack(null)} variant="filled">{snack.msg}</Alert>}
      </Snackbar>
    </Box>
  );
}
