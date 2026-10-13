import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  Box, Button, CircularProgress, Typography, IconButton,
  Snackbar, Alert, Checkbox, Dialog, DialogTitle, DialogContent,
  DialogContentText, DialogActions, Tooltip, Chip, Paper, Grid,
  Card, CardContent, TextField, MenuItem, Select, FormControl
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import TableChartIcon from '@mui/icons-material/TableChart';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import PaymentsIcon from '@mui/icons-material/Payments';
import SearchIcon from '@mui/icons-material/Search';
import axios from 'axios';
import { io } from 'socket.io-client';
import * as XLSX from 'xlsx';
import { useTableNavigation } from '../hooks/useTableNavigation';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const SOCKET_URL = import.meta.env.VITE_SOCKET_IO_URL || API_URL;

const FY_OPTIONS = ['FY 2026-27', 'FY 2025-26', 'FY 2024-25', 'FY 2027-28', 'FY 2023-24'];

const BILL_TYPE_OPTIONS = ['GST', 'NON GST'];

// Exact 21 options from reference specification
const PARTICULARS_OPTIONS = [
  'SALARY',
  'BANK CHARGES',
  'BANK GUARANTEE CHARGES',
  'BONUS',
  'COURIER CHARGERS',
  'DEPRECIATION',
  'ENTERTENMENT EXP',
  'Interest on Partners Capital',
  'INTEREST ON PUNJAB & SIND BANK (CC)',
  'Late Fees on TDS',
  'MISC EXPENSES',
  'OFFICE EXPENSES',
  'Partner Salary',
  'PRINTING & STATIONERY',
  'PROFESSIONAL CHARGES',
  'P TAX',
  'RENT EXP',
  'SERVICES CHARGES',
  'Software development Expenses',
  'SUBSCRIPTION',
  'TRAVELLING & CONVANCE'
];

const MONTHS = [
  { key: 'april', label: 'APRIL' },
  { key: 'may', label: 'MAY' },
  { key: 'june', label: 'JUNE' },
  { key: 'july', label: 'JULY' },
  { key: 'august', label: 'AUGUST' },
  { key: 'september', label: 'SEPTEMBER' },
  { key: 'october', label: 'OCTOBER' },
  { key: 'november', label: 'NOVEMBER' },
  { key: 'december', label: 'DECEMBER' },
  { key: 'january', label: 'JANUARY' },
  { key: 'february', label: 'FEBRUARY' },
  { key: 'march', label: 'MARCH' }
];

const num = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};

const fmtCurrency = (n) => {
  const v = num(n);
  if (v === 0) return '—';
  return '₹' + Math.round(v).toLocaleString('en-IN');
};

export default function IndirectExpense({ onBack }) {
  const [selectedFy, setSelectedFy] = useState('FY 2026-27');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [snack, setSnack] = useState(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState(null);

  const tableContainerRef = useRef(null);
  useTableNavigation(tableContainerRef);

  // Setup Socket.io
  useEffect(() => {
    const socket = io(SOCKET_URL, {
      autoConnect: true,
      transports: ['websocket', 'polling']
    });

    socket.on('indirectExpenseUpdates', () => {
      fetchData(false);
    });

    return () => {
      socket.disconnect();
    };
  }, [selectedFy]);

  const fetchData = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/indirect-expense?fy=${encodeURIComponent(selectedFy)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data && res.data.success) {
        const fetched = res.data.entries.map((item, idx) => {
          const monthsData = {};
          MONTHS.forEach(m => {
            const mObj = item.months?.[m.key] || {};
            const officeCash = mObj.officeCash !== undefined && mObj.officeCash !== null && mObj.officeCash !== ''
              ? mObj.officeCash
              : (mObj.cash !== undefined && mObj.cash !== null && mObj.cash !== '' ? mObj.cash : '');
            const siteCash = mObj.siteCash !== undefined && mObj.siteCash !== null && mObj.siteCash !== '' ? mObj.siteCash : '';

            monthsData[m.key] = {
              bank: mObj.bank !== undefined && mObj.bank !== null && mObj.bank !== '' ? mObj.bank : '',
              cash: officeCash,
              siteCash: siteCash
            };
          });

          return {
            _id: item._id,
            slNo: item.slNo !== undefined ? item.slNo : idx + 1,
            date: item.date || '',
            billType: item.billType || '',
            particulars: item.particulars || '',
            financialYear: item.financialYear || selectedFy,
            months: monthsData,
            remarks: item.remarks || '',
            isDirty: false,
            isNew: false
          };
        });
        setRows(fetched);
      }
    } catch (err) {
      console.error('[IndirectExpense] Fetch error:', err);
      setSnack({ severity: 'error', message: `Failed to load Indirect Expenses data: ${err.message}` });
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [selectedFy]);

  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  // Handle cell edit
  const handleCellChange = (rowIdx, field, value, monthKey = null, subField = null) => {
    setRows(prev => {
      const updated = [...prev];
      const target = { ...updated[rowIdx], isDirty: true };

      if (monthKey && subField) {
        target.months = {
          ...target.months,
          [monthKey]: {
            ...target.months[monthKey],
            [subField]: value
          }
        };
      } else {
        target[field] = value;
      }

      updated[rowIdx] = target;
      return updated;
    });
  };

  // Add new row
  const handleAddRow = () => {
    const nextSl = rows.length > 0 ? Math.max(...rows.map(r => Number(r.slNo) || 0)) + 1 : 1;
    const emptyMonths = {};
    MONTHS.forEach(m => {
      emptyMonths[m.key] = { bank: '', cash: '', siteCash: '' };
    });

    const newRow = {
      _id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      slNo: nextSl,
      date: new Date().toISOString().split('T')[0],
      billType: 'NON GST',
      particulars: PARTICULARS_OPTIONS[0] || 'SALARY',
      financialYear: selectedFy,
      months: emptyMonths,
      remarks: '',
      isDirty: true,
      isNew: true
    };

    setRows(prev => [newRow, ...prev]);
  };

  // Save changes
  const handleSaveChanges = async () => {
    const dirtyRows = rows.filter(r => r.isDirty);
    if (dirtyRows.length === 0) {
      setSnack({ severity: 'info', message: 'No changes to save' });
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const newItems = dirtyRows.filter(r => r.isNew);
      const existingItems = dirtyRows.filter(r => !r.isNew);

      // Create new items
      for (const item of newItems) {
        await axios.post(`${API_URL}/indirect-expense`, {
          slNo: item.slNo,
          date: item.date,
          billType: item.billType,
          particulars: item.particulars,
          financialYear: selectedFy,
          months: item.months,
          remarks: item.remarks
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }

      // Update existing items in bulk
      if (existingItems.length > 0) {
        const updates = existingItems.map(item => ({
          id: item._id,
          changes: {
            slNo: item.slNo,
            date: item.date,
            billType: item.billType,
            particulars: item.particulars,
            financialYear: selectedFy,
            months: item.months,
            remarks: item.remarks
          }
        }));

        await axios.put(`${API_URL}/indirect-expense/bulk-update`, { updates }, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }

      setSnack({ severity: 'success', message: 'All changes saved successfully' });
      fetchData(false);
    } catch (err) {
      console.error('[IndirectExpense] Save error:', err);
      setSnack({ severity: 'error', message: `Failed to save changes: ${err.message}` });
    } finally {
      setSaving(false);
    }
  };

  // Delete handlers
  const handleDeleteRow = (id) => {
    setDeleteTargetId(id);
    setConfirmDel(true);
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    setDeleteTargetId(null);
    setConfirmDel(true);
  };

  const confirmDeleteAction = async () => {
    setConfirmDel(false);
    try {
      const token = localStorage.getItem('token');
      if (deleteTargetId) {
        if (String(deleteTargetId).startsWith('temp_')) {
          setRows(prev => prev.filter(r => r._id !== deleteTargetId));
          setSnack({ severity: 'success', message: 'Row removed' });
          return;
        }
        await axios.delete(`${API_URL}/indirect-expense/${deleteTargetId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSnack({ severity: 'success', message: 'Row deleted successfully' });
      } else {
        const idsToDelete = Array.from(selectedIds);
        const realIds = idsToDelete.filter(id => !String(id).startsWith('temp_'));
        const tempIds = idsToDelete.filter(id => String(id).startsWith('temp_'));

        if (tempIds.length > 0) {
          setRows(prev => prev.filter(r => !tempIds.includes(r._id)));
        }

        if (realIds.length > 0) {
          await axios.delete(`${API_URL}/indirect-expense/bulk-delete`, {
            data: { ids: realIds },
            headers: { Authorization: `Bearer ${token}` }
          });
        }
        setSelectedIds(new Set());
        setSnack({ severity: 'success', message: `${idsToDelete.length} rows deleted` });
      }
      fetchData(false);
    } catch (err) {
      console.error('[IndirectExpense] Delete error:', err);
      setSnack({ severity: 'error', message: `Failed to delete: ${err.message}` });
    }
  };

  // Selection
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(new Set(rows.map(r => r._id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleToggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Filtered rows
  const filteredRows = useMemo(() => {
    if (!searchTerm.trim()) return rows;
    const term = searchTerm.toLowerCase();
    return rows.filter(r =>
      String(r.slNo).includes(term) ||
      String(r.date).toLowerCase().includes(term) ||
      String(r.billType || '').toLowerCase().includes(term) ||
      String(r.particulars).toLowerCase().includes(term) ||
      String(r.remarks).toLowerCase().includes(term)
    );
  }, [rows, searchTerm]);

  // Totals calculations
  const totals = useMemo(() => {
    const monthTotals = {};
    MONTHS.forEach(m => {
      monthTotals[m.key] = { bank: 0, officeCash: 0, siteCash: 0, total: 0 };
    });

    let overallBank = 0;
    let overallOfficeCash = 0;
    let overallSiteCash = 0;
    let grandTotal = 0;

    rows.forEach(r => {
      MONTHS.forEach(m => {
        const b = num(r.months?.[m.key]?.bank);
        const oc = num(r.months?.[m.key]?.cash);
        const sc = num(r.months?.[m.key]?.siteCash);

        monthTotals[m.key].bank += b;
        monthTotals[m.key].officeCash += oc;
        monthTotals[m.key].siteCash += sc;
        monthTotals[m.key].total += (b + oc + sc);

        overallBank += b;
        overallOfficeCash += oc;
        overallSiteCash += sc;
        grandTotal += (b + oc + sc);
      });
    });

    return {
      monthTotals,
      overallBank,
      overallOfficeCash,
      overallSiteCash,
      overallCash: overallOfficeCash + overallSiteCash,
      grandTotal
    };
  }, [rows]);

  // Export to Excel
  const handleExportExcel = () => {
    if (rows.length === 0) {
      setSnack({ severity: 'warning', message: 'No data to export' });
      return;
    }

    const excelRows = rows.map((r, idx) => {
      let rowBankTotal = 0;
      let rowOfficeCashTotal = 0;
      let rowSiteCashTotal = 0;

      const obj = {
        'SL NO': r.slNo || idx + 1,
        'DATE': r.date || '',
        'BILL TYPE': r.billType || '',
        'PARTICULARS': r.particulars || ''
      };

      MONTHS.forEach(m => {
        const b = num(r.months?.[m.key]?.bank);
        const oc = num(r.months?.[m.key]?.cash);
        const sc = num(r.months?.[m.key]?.siteCash);
        rowBankTotal += b;
        rowOfficeCashTotal += oc;
        rowSiteCashTotal += sc;

        obj[`${m.label} BANK`] = b || 0;
        obj[`${m.label} OFFICE CASH`] = oc || 0;
        obj[`${m.label} SITE CASH`] = sc || 0;
      });

      obj['TOTAL BANK'] = rowBankTotal;
      obj['TOTAL OFFICE CASH'] = rowOfficeCashTotal;
      obj['TOTAL SITE CASH'] = rowSiteCashTotal;
      obj['TOTAL AMOUNT'] = rowBankTotal + rowOfficeCashTotal + rowSiteCashTotal;
      obj['REMARKS'] = r.remarks || '';

      return obj;
    });

    // Append summary row
    const summaryRow = {
      'SL NO': 'TOTAL',
      'DATE': '',
      'BILL TYPE': '',
      'PARTICULARS': 'MONTHLY TOTAL'
    };
    MONTHS.forEach(m => {
      summaryRow[`${m.label} BANK`] = totals.monthTotals[m.key].bank;
      summaryRow[`${m.label} OFFICE CASH`] = totals.monthTotals[m.key].officeCash;
      summaryRow[`${m.label} SITE CASH`] = totals.monthTotals[m.key].siteCash;
    });
    summaryRow['TOTAL BANK'] = totals.overallBank;
    summaryRow['TOTAL OFFICE CASH'] = totals.overallOfficeCash;
    summaryRow['TOTAL SITE CASH'] = totals.overallSiteCash;
    summaryRow['TOTAL AMOUNT'] = totals.grandTotal;
    summaryRow['REMARKS'] = '';
    excelRows.push(summaryRow);

    const worksheet = XLSX.utils.json_to_sheet(excelRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'INDIRECT EXPENSES');
    XLSX.writeFile(workbook, `INDIRECT_EXPENSES_${selectedFy.replace(/\s+/g, '_')}.xlsx`);
  };

  const hasDirty = rows.some(r => r.isDirty);

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, minHeight: '100vh', background: 'transparent' }}>
      {/* ── Top Header & Navigation ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton
            onClick={onBack}
            sx={{
              bgcolor: 'rgba(255,255,255,0.9)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              '&:hover': { bgcolor: '#fff', transform: 'scale(1.05)' }
            }}
          >
            <ArrowBackIcon sx={{ color: '#1e293b' }} />
          </IconButton>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="h4" sx={{ fontWeight: 900, color: '#ffffff', letterSpacing: '-0.5px' }}>
                INDIRECT EXPENSES
              </Typography>
              <Chip
                label={selectedFy}
                color="primary"
                size="small"
                sx={{ fontWeight: 700, borderRadius: '8px', bgcolor: '#2563eb', color: '#ffffff' }}
              />
              {hasDirty && (
                <Chip
                  label="Unsaved Changes"
                  color="warning"
                  size="small"
                  sx={{ fontWeight: 700, borderRadius: '8px' }}
                />
              )}
            </Box>
            <Typography variant="body2" sx={{ color: '#94a3b8', mt: 0.2 }}>
              Monthly Bank & Cash Ledger Breakdown for Indirect Logistics & Operational Expenses
            </Typography>
          </Box>
        </Box>

        {/* Action Controls */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <Select
              value={selectedFy}
              onChange={(e) => setSelectedFy(e.target.value)}
              sx={{
                bgcolor: '#fff',
                borderRadius: '10px',
                fontWeight: 700,
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
              }}
            >
              {FY_OPTIONS.map(fy => (
                <MenuItem key={fy} value={fy} sx={{ fontWeight: 600 }}>{fy}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAddRow}
            sx={{
              bgcolor: '#2563eb',
              color: '#fff',
              fontWeight: 700,
              borderRadius: '10px',
              px: 2,
              '&:hover': { bgcolor: '#1d4ed8' }
            }}
          >
            Add Row
          </Button>

          <Button
            variant="contained"
            startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
            onClick={handleSaveChanges}
            disabled={saving || !hasDirty}
            sx={{
              bgcolor: '#10b981',
              color: '#fff',
              fontWeight: 700,
              borderRadius: '10px',
              px: 2,
              '&:hover': { bgcolor: '#059669' },
              '&.Mui-disabled': { bgcolor: '#cbd5e1', color: '#94a3b8' }
            }}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>

          {selectedIds.size > 0 && (
            <Button
              variant="contained"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={handleBulkDelete}
              sx={{ fontWeight: 700, borderRadius: '10px', px: 2 }}
            >
              Delete ({selectedIds.size})
            </Button>
          )}

          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleExportExcel}
            sx={{
              borderColor: '#cbd5e1',
              color: '#334155',
              bgcolor: '#fff',
              fontWeight: 700,
              borderRadius: '10px',
              '&:hover': { bgcolor: '#f8fafc', borderColor: '#94a3b8' }
            }}
          >
            Export Excel
          </Button>

          <IconButton
            onClick={() => fetchData(true)}
            sx={{
              bgcolor: '#fff',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              '&:hover': { bgcolor: '#f1f5f9' }
            }}
          >
            <RefreshIcon sx={{ color: '#475569' }} />
          </IconButton>
        </Box>
      </Box>

      {/* ── KPI Summary Cards ── */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: '16px', border: '1px solid rgba(226,232,240,0.8)', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                    Total FY Expense
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 900, color: '#0f172a', mt: 0.5 }}>
                    {fmtCurrency(totals.grandTotal)}
                  </Typography>
                </Box>
                <Box sx={{ p: 1.5, bgcolor: '#eff6ff', borderRadius: '12px', color: '#2563eb' }}>
                  <AccountBalanceWalletIcon fontSize="medium" />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: '16px', border: '1px solid rgba(226,232,240,0.8)', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                    Bank Expenses
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 900, color: '#059669', mt: 0.5 }}>
                    {fmtCurrency(totals.overallBank)}
                  </Typography>
                </Box>
                <Box sx={{ p: 1.5, bgcolor: '#ecfdf5', borderRadius: '12px', color: '#10b981' }}>
                  <PaymentsIcon fontSize="medium" />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: '16px', border: '1px solid rgba(226,232,240,0.8)', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                    Office Cash
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 900, color: '#d97706', mt: 0.5 }}>
                    {fmtCurrency(totals.overallOfficeCash)}
                  </Typography>
                </Box>
                <Box sx={{ p: 1.5, bgcolor: '#fffbeb', borderRadius: '12px', color: '#f59e0b' }}>
                  <PaymentsIcon fontSize="medium" />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: '16px', border: '1px solid rgba(226,232,240,0.8)', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                    Site Cash
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 900, color: '#0284c7', mt: 0.5 }}>
                    {fmtCurrency(totals.overallSiteCash)}
                  </Typography>
                </Box>
                <Box sx={{ p: 1.5, bgcolor: '#f0f9ff', borderRadius: '12px', color: '#0ea5e9' }}>
                  <PaymentsIcon fontSize="medium" />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ── Search & Filter Bar ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 2 }}>
        <TextField
          size="small"
          placeholder="Search by particulars, date, SL No, remarks..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: <SearchIcon sx={{ color: '#94a3b8', mr: 1 }} />
          }}
          sx={{
            width: { xs: '100%', sm: 380 },
            bgcolor: '#fff',
            borderRadius: '10px',
            '& .MuiOutlinedInput-root': { borderRadius: '10px' }
          }}
        />
        {searchTerm && (
          <Typography variant="caption" sx={{ color: '#e2e8f0', fontWeight: 600 }}>
            Showing {filteredRows.length} of {rows.length} rows
          </Typography>
        )}
      </Box>

      {/* ── Table Container ── */}
      <Paper
        ref={tableContainerRef}
        sx={{
          width: '100%',
          overflow: 'auto',
          borderRadius: '16px',
          border: '1px solid #cbd5e1',
          boxShadow: '0 10px 30px rgba(0,0,0,0.04)',
          bgcolor: '#fff',
          maxHeight: 'calc(100vh - 310px)'
        }}
      >
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', p: 8 }}>
            <CircularProgress sx={{ color: '#2563eb' }} />
          </Box>
        ) : (
          <Box
            component="table"
            sx={{
              width: 'max-content',
              minWidth: '100%',
              borderCollapse: 'collapse',
              fontFamily: '"Outfit", "Inter", sans-serif',
              fontSize: '13px',
              textAlign: 'left'
            }}
          >
            {/* Table Header */}
            <thead>
              {/* Row 1: Main Group Titles */}
              <tr style={{ background: '#0f172a', color: '#f8fafc' }}>
                <th
                  rowSpan={2}
                  style={{
                    padding: '10px 8px',
                    width: 44,
                    minWidth: 44,
                    maxWidth: 44,
                    textAlign: 'center',
                    borderRight: '1px solid #334155',
                    borderBottom: '1px solid #334155',
                    position: 'sticky',
                    left: 0,
                    zIndex: 4,
                    background: '#0f172a'
                  }}
                >
                  <Checkbox
                    size="small"
                    checked={rows.length > 0 && selectedIds.size === rows.length}
                    indeterminate={selectedIds.size > 0 && selectedIds.size < rows.length}
                    onChange={handleSelectAll}
                    sx={{ color: '#94a3b8', '&.Mui-checked': { color: '#38bdf8' } }}
                  />
                </th>

                <th
                  rowSpan={2}
                  style={{
                    padding: '12px 10px',
                    width: 65,
                    minWidth: 65,
                    maxWidth: 65,
                    textAlign: 'center',
                    fontWeight: 800,
                    letterSpacing: '0.5px',
                    borderRight: '1px solid #334155',
                    borderBottom: '1px solid #334155',
                    position: 'sticky',
                    left: 44,
                    zIndex: 4,
                    background: '#0f172a'
                  }}
                >
                  SL NO
                </th>

                <th
                  rowSpan={2}
                  style={{
                    padding: '12px 10px',
                    width: 110,
                    minWidth: 110,
                    maxWidth: 110,
                    textAlign: 'center',
                    fontWeight: 800,
                    letterSpacing: '0.5px',
                    borderRight: '1px solid #334155',
                    borderBottom: '1px solid #334155',
                    position: 'sticky',
                    left: 109,
                    zIndex: 4,
                    background: '#0f172a'
                  }}
                >
                  DATE
                </th>

                <th
                  rowSpan={2}
                  style={{
                    padding: '12px 10px',
                    width: 120,
                    minWidth: 120,
                    maxWidth: 120,
                    textAlign: 'center',
                    fontWeight: 800,
                    letterSpacing: '0.5px',
                    borderRight: '1px solid #334155',
                    borderBottom: '1px solid #334155',
                    position: 'sticky',
                    left: 219,
                    zIndex: 4,
                    background: '#0f172a'
                  }}
                >
                  BILL TYPE
                </th>

                <th
                  rowSpan={2}
                  style={{
                    padding: '12px 14px',
                    width: 340,
                    minWidth: 340,
                    maxWidth: 340,
                    fontWeight: 800,
                    letterSpacing: '0.5px',
                    borderRight: '2px solid #475569',
                    borderBottom: '1px solid #334155',
                    position: 'sticky',
                    left: 339,
                    zIndex: 4,
                    background: '#0f172a'
                  }}
                >
                  PARTICULARS
                </th>

                {/* 12 Months Columns */}
                {MONTHS.map(m => (
                  <th
                    key={m.key}
                    colSpan={3}
                    style={{
                      padding: '10px 6px',
                      textAlign: 'center',
                      fontWeight: 800,
                      letterSpacing: '0.8px',
                      borderRight: '1px solid #334155',
                      borderBottom: '1px solid #334155',
                      background: '#1e293b'
                    }}
                  >
                    {m.label}
                  </th>
                ))}

                {/* Total Group Header */}
                <th
                  colSpan={4}
                  style={{
                    padding: '10px 8px',
                    textAlign: 'center',
                    fontWeight: 900,
                    letterSpacing: '0.8px',
                    borderRight: '1px solid #334155',
                    borderBottom: '1px solid #334155',
                    background: '#1e1b4b',
                    color: '#c7d2fe'
                  }}
                >
                  TOTAL EXPENSES
                </th>

                <th
                  rowSpan={2}
                  style={{
                    padding: '12px 10px',
                    width: 180,
                    fontWeight: 800,
                    borderRight: '1px solid #334155',
                    borderBottom: '1px solid #334155',
                    background: '#0f172a'
                  }}
                >
                  REMARKS
                </th>

                <th
                  rowSpan={2}
                  style={{
                    padding: '12px 8px',
                    width: 60,
                    textAlign: 'center',
                    fontWeight: 800,
                    borderBottom: '1px solid #334155',
                    background: '#0f172a'
                  }}
                >
                  ACT
                </th>
              </tr>

              {/* Row 2: Sub Headers (BANK | OFFICE CASH | SITE CASH) */}
              <tr style={{ background: '#1e293b', color: '#94a3b8', fontSize: '11px' }}>
                {MONTHS.map(m => (
                  <React.Fragment key={`${m.key}_sub`}>
                    <th
                      style={{
                        padding: '6px 4px',
                        width: 85,
                        textAlign: 'center',
                        fontWeight: 700,
                        borderRight: '1px solid #334155',
                        borderBottom: '2px solid #475569',
                        color: '#6ee7b7'
                      }}
                    >
                      BANK
                    </th>
                    <th
                      style={{
                        padding: '6px 4px',
                        width: 95,
                        textAlign: 'center',
                        fontWeight: 700,
                        borderRight: '1px solid #334155',
                        borderBottom: '2px solid #475569',
                        color: '#fde047'
                      }}
                    >
                      OFFICE CASH
                    </th>
                    <th
                      style={{
                        padding: '6px 4px',
                        width: 90,
                        textAlign: 'center',
                        fontWeight: 700,
                        borderRight: '1px solid #475569',
                        borderBottom: '2px solid #475569',
                        color: '#38bdf8'
                      }}
                    >
                      SITE CASH
                    </th>
                  </React.Fragment>
                ))}

                {/* Sub Headers for TOTAL */}
                <th
                  style={{
                    padding: '6px 4px',
                    width: 95,
                    textAlign: 'center',
                    fontWeight: 800,
                    borderRight: '1px solid #334155',
                    borderBottom: '2px solid #475569',
                    background: '#2e1065',
                    color: '#6ee7b7'
                  }}
                >
                  BANK
                </th>
                <th
                  style={{
                    padding: '6px 4px',
                    width: 100,
                    textAlign: 'center',
                    fontWeight: 800,
                    borderRight: '1px solid #334155',
                    borderBottom: '2px solid #475569',
                    background: '#2e1065',
                    color: '#fde047'
                  }}
                >
                  OFFICE CASH
                </th>
                <th
                  style={{
                    padding: '6px 4px',
                    width: 95,
                    textAlign: 'center',
                    fontWeight: 800,
                    borderRight: '1px solid #334155',
                    borderBottom: '2px solid #475569',
                    background: '#2e1065',
                    color: '#38bdf8'
                  }}
                >
                  SITE CASH
                </th>
                <th
                  style={{
                    padding: '6px 4px',
                    width: 105,
                    textAlign: 'center',
                    fontWeight: 900,
                    borderRight: '1px solid #475569',
                    borderBottom: '2px solid #475569',
                    background: '#312e81',
                    color: '#ffffff'
                  }}
                >
                  TOTAL
                </th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={47} style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                      No Indirect Expense entries found for {selectedFy}.
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#cbd5e1' }}>
                      Click "+ Add Row" to create the first entry.
                    </Typography>
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, rIdx) => {
                  let rowBankSum = 0;
                  let rowOfficeCashSum = 0;
                  let rowSiteCashSum = 0;

                  MONTHS.forEach(m => {
                    rowBankSum += num(row.months?.[m.key]?.bank);
                    rowOfficeCashSum += num(row.months?.[m.key]?.cash);
                    rowSiteCashSum += num(row.months?.[m.key]?.siteCash);
                  });
                  const rowTotalSum = rowBankSum + rowOfficeCashSum + rowSiteCashSum;

                  const isSelected = selectedIds.has(row._id);

                  // Ensure row particulars is in options or preserved
                  const currentParticulars = row.particulars || '';
                  const optionsList = [...PARTICULARS_OPTIONS];
                  if (currentParticulars && !optionsList.includes(currentParticulars)) {
                    optionsList.unshift(currentParticulars);
                  }

                  return (
                    <tr
                      key={row._id}
                      style={{
                        background: row.isDirty ? '#fefce8' : isSelected ? '#eff6ff' : rIdx % 2 === 0 ? '#ffffff' : '#f8fafc',
                        borderBottom: '1px solid #e2e8f0',
                        transition: 'background 0.15s ease'
                      }}
                    >
                      {/* Checkbox */}
                      <td
                        style={{
                          padding: '6px 8px',
                          width: 44,
                          minWidth: 44,
                          maxWidth: 44,
                          textAlign: 'center',
                          borderRight: '1px solid #e2e8f0',
                          position: 'sticky',
                          left: 0,
                          zIndex: 2,
                          background: row.isDirty ? '#fefce8' : isSelected ? '#eff6ff' : rIdx % 2 === 0 ? '#ffffff' : '#f8fafc'
                        }}
                      >
                        <Checkbox
                          size="small"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(row._id)}
                          sx={{ p: 0.5 }}
                        />
                      </td>

                      {/* SL NO */}
                      <td
                        style={{
                          padding: '4px',
                          width: 65,
                          minWidth: 65,
                          maxWidth: 65,
                          textAlign: 'center',
                          borderRight: '1px solid #e2e8f0',
                          position: 'sticky',
                          left: 44,
                          zIndex: 2,
                          background: row.isDirty ? '#fefce8' : isSelected ? '#eff6ff' : rIdx % 2 === 0 ? '#ffffff' : '#f8fafc'
                        }}
                      >
                        <input
                          type="text"
                          value={row.slNo}
                          onChange={(e) => handleCellChange(rIdx, 'slNo', e.target.value)}
                          style={{
                            width: '100%',
                            border: 'none',
                            outline: 'none',
                            background: 'transparent',
                            textAlign: 'center',
                            fontWeight: 700,
                            color: '#1e293b',
                            fontSize: '13px'
                          }}
                        />
                      </td>

                      {/* DATE */}
                      <td
                        style={{
                          padding: '4px',
                          width: 110,
                          minWidth: 110,
                          maxWidth: 110,
                          borderRight: '1px solid #e2e8f0',
                          position: 'sticky',
                          left: 109,
                          zIndex: 2,
                          background: row.isDirty ? '#fefce8' : isSelected ? '#eff6ff' : rIdx % 2 === 0 ? '#ffffff' : '#f8fafc'
                        }}
                      >
                        <input
                          type="text"
                          value={row.date}
                          placeholder="DD-MM-YYYY"
                          onChange={(e) => handleCellChange(rIdx, 'date', e.target.value)}
                          style={{
                            width: '100%',
                            border: 'none',
                            outline: 'none',
                            background: 'transparent',
                            textAlign: 'center',
                            color: '#334155',
                            fontSize: '12px'
                          }}
                        />
                      </td>

                      {/* BILL TYPE (READ-ONLY SYSTEM DISPLAY) */}
                      <td
                        style={{
                          padding: '4px 6px',
                          width: 120,
                          minWidth: 120,
                          maxWidth: 120,
                          borderRight: '1px solid #e2e8f0',
                          position: 'sticky',
                          left: 219,
                          zIndex: 2,
                          textAlign: 'center',
                          background: row.isDirty ? '#fefce8' : isSelected ? '#eff6ff' : rIdx % 2 === 0 ? '#ffffff' : '#f8fafc'
                        }}
                      >
                        {row.billType ? (
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '11.5px',
                              fontWeight: 800,
                              letterSpacing: '0.3px',
                              background: String(row.billType).toUpperCase() === 'GST' ? '#eff6ff' : '#f1f5f9',
                              color: String(row.billType).toUpperCase() === 'GST' ? '#1d4ed8' : '#475569',
                              border: String(row.billType).toUpperCase() === 'GST' ? '1px solid #bfdbfe' : '1px solid #cbd5e1'
                            }}
                          >
                            {String(row.billType).toUpperCase()}
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '12px' }}>—</span>
                        )}
                      </td>

                      {/* PARTICULARS DROPDOWN */}
                      <td
                        style={{
                          padding: '3px 6px',
                          width: 340,
                          minWidth: 340,
                          maxWidth: 340,
                          borderRight: '2px solid #cbd5e1',
                          position: 'sticky',
                          left: 339,
                          zIndex: 2,
                          background: row.isDirty ? '#fefce8' : isSelected ? '#eff6ff' : rIdx % 2 === 0 ? '#ffffff' : '#f8fafc'
                        }}
                      >
                        <select
                          value={currentParticulars}
                          onChange={(e) => handleCellChange(rIdx, 'particulars', e.target.value)}
                          title={currentParticulars}
                          style={{
                            width: '100%',
                            height: '32px',
                            border: '1px solid rgba(203, 213, 225, 0.6)',
                            borderRadius: '6px',
                            outline: 'none',
                            background: '#ffffff',
                            fontWeight: 700,
                            color: currentParticulars ? '#0f172a' : '#94a3b8',
                            fontSize: '12.5px',
                            fontFamily: '"Outfit", "Inter", sans-serif',
                            padding: '2px 8px',
                            cursor: 'pointer',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                          }}
                        >
                          <option value="" disabled style={{ color: '#94a3b8' }}>
                            Select Particular...
                          </option>
                          {optionsList.map(opt => (
                            <option key={opt} value={opt} style={{ color: '#0f172a', fontWeight: 600, padding: '4px 8px' }}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* 12 Months: Bank, Office Cash & Site Cash */}
                      {MONTHS.map(m => (
                        <React.Fragment key={`${row._id}_${m.key}`}>
                          {/* BANK */}
                          <td
                            style={{
                              padding: '4px',
                              borderRight: '1px solid #e2e8f0',
                              background: num(row.months?.[m.key]?.bank) > 0 ? '#f0fdf4' : 'transparent'
                            }}
                          >
                            <input
                              type="text"
                              value={row.months?.[m.key]?.bank ?? ''}
                              placeholder="—"
                              onChange={(e) => handleCellChange(rIdx, null, e.target.value, m.key, 'bank')}
                              style={{
                                width: '100%',
                                border: 'none',
                                outline: 'none',
                                background: 'transparent',
                                textAlign: 'right',
                                fontWeight: num(row.months?.[m.key]?.bank) > 0 ? 700 : 400,
                                color: num(row.months?.[m.key]?.bank) > 0 ? '#047857' : '#94a3b8',
                                fontSize: '13px'
                              }}
                            />
                          </td>

                          {/* OFFICE CASH */}
                          <td
                            style={{
                              padding: '4px',
                              borderRight: '1px solid #e2e8f0',
                              background: num(row.months?.[m.key]?.cash) > 0 ? '#fffbeb' : 'transparent'
                            }}
                          >
                            <input
                              type="text"
                              value={row.months?.[m.key]?.cash ?? ''}
                              placeholder="—"
                              onChange={(e) => handleCellChange(rIdx, null, e.target.value, m.key, 'cash')}
                              style={{
                                width: '100%',
                                border: 'none',
                                outline: 'none',
                                background: 'transparent',
                                textAlign: 'right',
                                fontWeight: num(row.months?.[m.key]?.cash) > 0 ? 700 : 400,
                                color: num(row.months?.[m.key]?.cash) > 0 ? '#b45309' : '#94a3b8',
                                fontSize: '13px'
                              }}
                            />
                          </td>

                          {/* SITE CASH */}
                          <td
                            style={{
                              padding: '4px',
                              borderRight: '1px solid #cbd5e1',
                              background: num(row.months?.[m.key]?.siteCash) > 0 ? '#f0f9ff' : 'transparent'
                            }}
                          >
                            <input
                              type="text"
                              value={row.months?.[m.key]?.siteCash ?? ''}
                              placeholder="—"
                              onChange={(e) => handleCellChange(rIdx, null, e.target.value, m.key, 'siteCash')}
                              style={{
                                width: '100%',
                                border: 'none',
                                outline: 'none',
                                background: 'transparent',
                                textAlign: 'right',
                                fontWeight: num(row.months?.[m.key]?.siteCash) > 0 ? 700 : 400,
                                color: num(row.months?.[m.key]?.siteCash) > 0 ? '#0284c7' : '#94a3b8',
                                fontSize: '13px'
                              }}
                            />
                          </td>
                        </React.Fragment>
                      ))}

                      {/* TOTAL BANK */}
                      <td
                        style={{
                          padding: '6px 8px',
                          textAlign: 'right',
                          fontWeight: 800,
                          color: '#047857',
                          borderRight: '1px solid #e2e8f0',
                          background: '#ecfdf5'
                        }}
                      >
                        {fmtCurrency(rowBankSum)}
                      </td>

                      {/* TOTAL OFFICE CASH */}
                      <td
                        style={{
                          padding: '6px 8px',
                          textAlign: 'right',
                          fontWeight: 800,
                          color: '#b45309',
                          borderRight: '1px solid #e2e8f0',
                          background: '#fffbeb'
                        }}
                      >
                        {fmtCurrency(rowOfficeCashSum)}
                      </td>

                      {/* TOTAL SITE CASH */}
                      <td
                        style={{
                          padding: '6px 8px',
                          textAlign: 'right',
                          fontWeight: 800,
                          color: '#0284c7',
                          borderRight: '1px solid #e2e8f0',
                          background: '#f0f9ff'
                        }}
                      >
                        {fmtCurrency(rowSiteCashSum)}
                      </td>

                      {/* ROW TOTAL */}
                      <td
                        style={{
                          padding: '6px 8px',
                          textAlign: 'right',
                          fontWeight: 900,
                          color: '#1e1b4b',
                          borderRight: '1px solid #cbd5e1',
                          background: '#eef2ff'
                        }}
                      >
                        {fmtCurrency(rowTotalSum)}
                      </td>

                      {/* REMARKS */}
                      <td style={{ padding: '4px 6px', borderRight: '1px solid #e2e8f0' }}>
                        <input
                          type="text"
                          value={row.remarks}
                          placeholder="Optional remarks..."
                          onChange={(e) => handleCellChange(rIdx, 'remarks', e.target.value)}
                          style={{
                            width: '100%',
                            border: 'none',
                            outline: 'none',
                            background: 'transparent',
                            color: '#475569',
                            fontSize: '12px'
                          }}
                        />
                      </td>

                      {/* ACTIONS */}
                      <td style={{ padding: '4px', textAlign: 'center' }}>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDeleteRow(row._id)}
                          sx={{ p: 0.5, '&:hover': { bgcolor: '#fee2e2' } }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Summary Footer */}
            <tfoot>
              <tr
                style={{
                  background: '#0f172a',
                  color: '#ffffff',
                  fontWeight: 900,
                  fontSize: '13px',
                  borderTop: '2px solid #334155'
                }}
              >
                <td
                  colSpan={5}
                  style={{
                    padding: '12px 16px',
                    textAlign: 'right',
                    letterSpacing: '1px',
                    borderRight: '2px solid #475569',
                    position: 'sticky',
                    left: 0,
                    zIndex: 3,
                    background: '#0f172a'
                  }}
                >
                  MONTHLY GRAND TOTALS:
                </td>

                {MONTHS.map(m => (
                  <React.Fragment key={`tot_${m.key}`}>
                    <td
                      style={{
                        padding: '10px 6px',
                        textAlign: 'right',
                        borderRight: '1px solid #334155',
                        color: '#6ee7b7'
                      }}
                    >
                      {fmtCurrency(totals.monthTotals[m.key].bank)}
                    </td>
                    <td
                      style={{
                        padding: '10px 6px',
                        textAlign: 'right',
                        borderRight: '1px solid #334155',
                        color: '#fde047'
                      }}
                    >
                      {fmtCurrency(totals.monthTotals[m.key].officeCash)}
                    </td>
                    <td
                      style={{
                        padding: '10px 6px',
                        textAlign: 'right',
                        borderRight: '1px solid #475569',
                        color: '#38bdf8'
                      }}
                    >
                      {fmtCurrency(totals.monthTotals[m.key].siteCash)}
                    </td>
                  </React.Fragment>
                ))}

                {/* Overall Totals */}
                <td
                  style={{
                    padding: '10px 8px',
                    textAlign: 'right',
                    borderRight: '1px solid #334155',
                    background: '#064e3b',
                    color: '#6ee7b7',
                    fontWeight: 900
                  }}
                >
                  {fmtCurrency(totals.overallBank)}
                </td>
                <td
                  style={{
                    padding: '10px 8px',
                    textAlign: 'right',
                    borderRight: '1px solid #334155',
                    background: '#78350f',
                    color: '#fde047',
                    fontWeight: 900
                  }}
                >
                  {fmtCurrency(totals.overallOfficeCash)}
                </td>
                <td
                  style={{
                    padding: '10px 8px',
                    textAlign: 'right',
                    borderRight: '1px solid #334155',
                    background: '#075985',
                    color: '#38bdf8',
                    fontWeight: 900
                  }}
                >
                  {fmtCurrency(totals.overallSiteCash)}
                </td>
                <td
                  style={{
                    padding: '10px 8px',
                    textAlign: 'right',
                    borderRight: '1px solid #475569',
                    background: '#312e81',
                    color: '#ffffff',
                    fontWeight: 900
                  }}
                >
                  {fmtCurrency(totals.grandTotal)}
                </td>

                <td colSpan={2} style={{ background: '#0f172a' }} />
              </tr>
            </tfoot>
          </Box>
        )}
      </Paper>

      {/* Delete Confirmation Modal */}
      <Dialog
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        PaperProps={{ sx: { borderRadius: '16px', p: 1 } }}
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#0f172a' }}>
          Confirm Deletion
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: '#475569' }}>
            {deleteTargetId
              ? 'Are you sure you want to delete this Indirect Expense entry? This action cannot be undone.'
              : `Are you sure you want to delete ${selectedIds.size} selected Indirect Expense entries?`}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ pb: 2, px: 3 }}>
          <Button onClick={() => setConfirmDel(false)} sx={{ fontWeight: 600, color: '#64748b' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={confirmDeleteAction}
            sx={{ fontWeight: 700, borderRadius: '8px' }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar Feedback */}
      <Snackbar
        open={!!snack}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {snack && (
          <Alert
            severity={snack.severity || 'info'}
            onClose={() => setSnack(null)}
            sx={{ borderRadius: '10px', fontWeight: 600, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
          >
            {snack.message}
          </Alert>
        )}
      </Snackbar>
    </Box>
  );
}
