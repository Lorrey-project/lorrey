import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Box, Button, CircularProgress, Typography, IconButton,
  Snackbar, Alert, Chip, Tooltip, Paper,
  TextField, MenuItem, Select, FormControl, InputLabel,
  TableContainer, Table, TableHead, TableRow, TableCell, TableBody,
  TablePagination, InputAdornment, Grid, Card, CardContent
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import axios from 'axios';
import { io } from 'socket.io-client';
import * as XLSX from 'xlsx';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const SOCKET_URL = import.meta.env.VITE_SOCKET_IO_URL || API_URL;

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
});

const fmtAmt = (n) => {
  if (n === undefined || n === null || n === '') return '₹0.00';
  const num = Number(n);
  if (isNaN(num)) return n;
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Generate list of FYs dynamically
const getCurrentFinancialYear = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12
  const startYear = month < 4 ? year - 1 : year;
  return `FY ${startYear}-${String(startYear + 1).slice(-2)}`;
};

const FY_OPTIONS = [
  'FY 2026-27',
  'FY 2025-26',
  'FY 2024-25',
  'FY 2023-24'
];

const MONTH_OPTIONS = [
  'ALL',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
  'JANUARY',
  'FEBRUARY',
  'MARCH'
];

export default function PaymentReceiveHistory({ onBack }) {
  const [selectedFY, setSelectedFY] = useState(() => getCurrentFinancialYear());
  const [selectedMonth, setSelectedMonth] = useState('ALL');
  const [selectedInvoice, setSelectedInvoice] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [records, setRecords] = useState([]);
  const [availableInvoices, setAvailableInvoices] = useState([]);
  const [summary, setSummary] = useState({ totalTransactions: 0, totalPaymentReceived: 0 });
  const [period, setPeriod] = useState({ start: '', end: '', display: '' });
  
  const [loading, setLoading] = useState(true);
  const [snack, setSnack] = useState(null);
  
  // Pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  // Fetch Payment Receive History
  const fetchData = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const params = {
        fy: selectedFY,
        month: selectedMonth,
        invoice: selectedInvoice,
        search: searchQuery
      };

      const res = await axios.get(`${API_URL}/api/account-details/payment-receive-history`, {
        ...getAuthHeaders(),
        params
      });

      if (res.data && res.data.success) {
        setRecords(res.data.records || []);
        setSummary(res.data.summary || { totalTransactions: 0, totalPaymentReceived: 0 });
        setAvailableInvoices(res.data.availableInvoices || []);
        setPeriod(res.data.period || { start: '', end: '', display: '' });
      } else {
        setSnack({ severity: 'error', message: res.data?.error || 'Failed to fetch Payment Receive History' });
      }
    } catch (err) {
      console.error('[PaymentReceiveHistory] Fetch error:', err);
      setSnack({ severity: 'error', message: 'Failed to connect to Bank Book database' });
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [selectedFY, selectedMonth, selectedInvoice, searchQuery]);

  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  // Real-time synchronization via Socket.IO
  useEffect(() => {
    const socket = io(SOCKET_URL, {
      autoConnect: true,
      transports: ['websocket', 'polling']
    });

    const handleUpdate = () => {
      fetchData(false);
    };

    socket.on('accountDetailsUpdate', handleUpdate);
    socket.on('fyDetailsUpdates', handleUpdate);
    socket.on('mainCashbookUpdates', handleUpdate);
    socket.on('cementUpdates', handleUpdate);

    return () => {
      socket.off('accountDetailsUpdate', handleUpdate);
      socket.off('fyDetailsUpdates', handleUpdate);
      socket.off('mainCashbookUpdates', handleUpdate);
      socket.off('cementUpdates', handleUpdate);
      socket.disconnect();
    };
  }, [fetchData]);

  // Reset page on filter change
  useEffect(() => {
    setPage(0);
  }, [selectedFY, selectedMonth, selectedInvoice, searchQuery]);

  // Export to Excel
  const handleExportExcel = () => {
    if (!records || records.length === 0) {
      setSnack({ severity: 'warning', message: 'No records available to export' });
      return;
    }

    const exportRows = records.map((r) => ({
      'SL NO': r.slNo,
      'DATE': r.date,
      'INVOICE NO': r.invoiceNo,
      'INVOICE DATE': r.invoiceDate,
      'PAYMENT RECEIVE / TRANSACTION TYPE': r.transactionType,
      'LEDGER': r.ledger,
      'MONTH': r.month,
      'PARTICULARS': r.particulars,
      'NAME': r.name,
      'REFERENCE': r.reference,
      'REFERENCE NUMBER': r.referenceNumber,
      'AMOUNT RECEIVED (₹)': r.amountReceived,
      'STATUS': r.status,
      'REMARKS': r.remarks,
      'VEHICLE': r.vehicle
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Payment Receive History');
    
    const fileName = `Payment_Receive_History_${selectedFY.replace(/\s+/g, '_')}_${selectedMonth}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
    setSnack({ severity: 'success', message: 'Excel file exported successfully' });
  };

  return (
    <Box sx={{ p: { xs: 1.5, md: 3 }, bgcolor: '#f8fafc', minHeight: '100vh' }}>
      {/* ── Top Header ────────────────────────────────────────────── */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <IconButton
            onClick={onBack}
            sx={{
              bgcolor: '#ffffff',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              border: '1px solid #e2e8f0',
              '&:hover': { bgcolor: '#f1f5f9' }
            }}
          >
            <ArrowBackIcon sx={{ color: '#0f172a' }} />
          </IconButton>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="h5" sx={{ fontWeight: 900, color: '#0f172a', letterSpacing: '-0.5px' }}>
                PAYMENT RECEIVE HISTORY
              </Typography>
              <Chip
                label="LIVE BANK BOOK VIEW"
                size="small"
                sx={{
                  bgcolor: '#ecfdf5',
                  color: '#059669',
                  fontWeight: 800,
                  fontSize: '0.72rem',
                  border: '1px solid #a7f3d0'
                }}
              />
            </Box>
            <Typography variant="body2" sx={{ color: '#64748b', fontWeight: 500 }}>
              Financial Management • Live payment receive transactions synchronized with Bank Book & Bill Register
            </Typography>
          </Box>
        </Box>

        {/* Header Action Buttons */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Button
            variant="outlined"
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
            onClick={() => fetchData(true)}
            disabled={loading}
            sx={{
              borderRadius: '10px',
              textTransform: 'none',
              fontWeight: 700,
              color: '#334155',
              borderColor: '#cbd5e1',
              bgcolor: '#ffffff',
              '&:hover': { bgcolor: '#f1f5f9', borderColor: '#94a3b8' }
            }}
          >
            Refresh
          </Button>

          <Button
            variant="contained"
            startIcon={<DownloadIcon />}
            onClick={handleExportExcel}
            sx={{
              borderRadius: '10px',
              textTransform: 'none',
              fontWeight: 700,
              bgcolor: '#10b981',
              boxShadow: '0 4px 12px rgba(16,185,129,0.25)',
              '&:hover': { bgcolor: '#059669' }
            }}
          >
            Export Excel
          </Button>
        </Box>
      </Box>

      {/* ── Filter Controls Bar ───────────────────────────────────── */}
      <Paper
        elevation={0}
        sx={{
          p: 2.5,
          mb: 3,
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          bgcolor: '#ffffff',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
        }}
      >
        <Grid container spacing={2} alignItems="center">
          {/* FY Filter */}
          <Grid item xs={12} sm={6} md={2.5}>
            <FormControl fullWidth size="small">
              <InputLabel id="fy-select-label" sx={{ fontWeight: 600 }}>Financial Year</InputLabel>
              <Select
                labelId="fy-select-label"
                value={selectedFY}
                label="Financial Year"
                onChange={(e) => setSelectedFY(e.target.value)}
                sx={{ borderRadius: '10px', fontWeight: 700 }}
              >
                {FY_OPTIONS.map((fy) => (
                  <MenuItem key={fy} value={fy} sx={{ fontWeight: 600 }}>
                    {fy}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* Month Filter */}
          <Grid item xs={12} sm={6} md={2.5}>
            <FormControl fullWidth size="small">
              <InputLabel id="month-select-label" sx={{ fontWeight: 600 }}>Month</InputLabel>
              <Select
                labelId="month-select-label"
                value={selectedMonth}
                label="Month"
                onChange={(e) => setSelectedMonth(e.target.value)}
                sx={{ borderRadius: '10px', fontWeight: 600 }}
              >
                {MONTH_OPTIONS.map((m) => (
                  <MenuItem key={m} value={m} sx={{ fontWeight: m === 'ALL' ? 700 : 500 }}>
                    {m}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* Invoice Filter */}
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel id="invoice-select-label" sx={{ fontWeight: 600 }}>Invoice</InputLabel>
              <Select
                labelId="invoice-select-label"
                value={selectedInvoice}
                label="Invoice"
                onChange={(e) => setSelectedInvoice(e.target.value)}
                sx={{ borderRadius: '10px', fontWeight: 600 }}
              >
                <MenuItem value="ALL" sx={{ fontWeight: 700 }}>
                  ALL
                </MenuItem>
                {availableInvoices.map((inv) => (
                  <MenuItem key={inv} value={inv} sx={{ fontWeight: 500 }}>
                    {inv}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* Search Input */}
          <Grid item xs={12} sm={6} md={4}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search Invoice, Ref No, Name, Ledger..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: '#94a3b8', fontSize: 20 }} />
                  </InputAdornment>
                ),
                endAdornment: searchQuery ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearchQuery('')}>
                      <ClearIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </InputAdornment>
                ) : null,
                sx: { borderRadius: '10px', bgcolor: '#f8fafc' }
              }}
            />
          </Grid>
        </Grid>
      </Paper>

      {/* ── Financial Summary KPI Cards ───────────────────────────── */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {/* Total Transactions Card */}
        <Grid item xs={12} sm={6} md={4}>
          <Card
            elevation={0}
            sx={{
              borderRadius: '16px',
              border: '1px solid #e2e8f0',
              background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
              boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                    TOTAL TRANSACTIONS
                  </Typography>
                  <Typography variant="h4" sx={{ fontWeight: 900, color: '#0f172a', mt: 0.5 }}>
                    {summary.totalTransactions}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600 }}>
                    Matching filtered criteria
                  </Typography>
                </Box>
                <Box
                  sx={{
                    width: 52,
                    height: 52,
                    borderRadius: '14px',
                    bgcolor: '#eff6ff',
                    color: '#3b82f6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <ReceiptLongIcon sx={{ fontSize: 28 }} />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Total Payment Received Card */}
        <Grid item xs={12} sm={6} md={4}>
          <Card
            elevation={0}
            sx={{
              borderRadius: '16px',
              border: '1px solid #a7f3d0',
              background: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)',
              boxShadow: '0 4px 16px rgba(16,185,129,0.08)',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="caption" sx={{ color: '#059669', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                    TOTAL PAYMENT RECEIVED
                  </Typography>
                  <Typography variant="h4" sx={{ fontWeight: 900, color: '#065f46', mt: 0.5 }}>
                    {fmtAmt(summary.totalPaymentReceived)}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#047857', fontWeight: 600 }}>
                    Authoritative Bank Book Deposit Total
                  </Typography>
                </Box>
                <Box
                  sx={{
                    width: 52,
                    height: 52,
                    borderRadius: '14px',
                    bgcolor: '#10b981',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(16,185,129,0.3)'
                  }}
                >
                  <AccountBalanceWalletIcon sx={{ fontSize: 28 }} />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Active Date Period Card */}
        <Grid item xs={12} sm={12} md={4}>
          <Card
            elevation={0}
            sx={{
              borderRadius: '16px',
              border: '1px solid #e2e8f0',
              bgcolor: '#ffffff',
              boxShadow: '0 2px 10px rgba(0,0,0,0.03)'
            }}
          >
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                    DATE RANGE WINDOW
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 800, color: '#1e293b', mt: 0.5 }}>
                    {period.display || `${selectedFY} (Till Date)`}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                    <CheckCircleOutlineIcon sx={{ fontSize: 14, color: '#10b981' }} />
                    <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                      Dynamic endpoint (strictly no future records)
                    </Typography>
                  </Box>
                </Box>
                <Box
                  sx={{
                    width: 52,
                    height: 52,
                    borderRadius: '14px',
                    bgcolor: '#f1f5f9',
                    color: '#475569',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <CalendarMonthIcon sx={{ fontSize: 28 }} />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ── Full Transaction Table ────────────────────────────────── */}
      <Paper
        elevation={0}
        sx={{
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          bgcolor: '#ffffff',
          overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0,0,0,0.04)'
        }}
      >
        <TableContainer sx={{ maxHeight: 'calc(100vh - 380px)', minHeight: 350 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ bgcolor: '#0f172a', color: '#f8fafc', fontWeight: 800, fontSize: '0.78rem', py: 1.8, width: 60 }}>
                  SL NO
                </TableCell>
                <TableCell sx={{ bgcolor: '#0f172a', color: '#f8fafc', fontWeight: 800, fontSize: '0.78rem', py: 1.8, width: 100 }}>
                  DATE
                </TableCell>
                <TableCell sx={{ bgcolor: '#0f172a', color: '#f8fafc', fontWeight: 800, fontSize: '0.78rem', py: 1.8, minWidth: 140 }}>
                  INVOICE NO
                </TableCell>
                <TableCell sx={{ bgcolor: '#0f172a', color: '#f8fafc', fontWeight: 800, fontSize: '0.78rem', py: 1.8, width: 110 }}>
                  INVOICE DATE
                </TableCell>
                <TableCell sx={{ bgcolor: '#0f172a', color: '#f8fafc', fontWeight: 800, fontSize: '0.78rem', py: 1.8, minWidth: 150 }}>
                  PAYMENT RECEIVE / TYPE
                </TableCell>
                <TableCell sx={{ bgcolor: '#0f172a', color: '#f8fafc', fontWeight: 800, fontSize: '0.78rem', py: 1.8, minWidth: 130 }}>
                  LEDGER
                </TableCell>
                <TableCell sx={{ bgcolor: '#0f172a', color: '#f8fafc', fontWeight: 800, fontSize: '0.78rem', py: 1.8, width: 100 }}>
                  MONTH
                </TableCell>
                <TableCell sx={{ bgcolor: '#0f172a', color: '#f8fafc', fontWeight: 800, fontSize: '0.78rem', py: 1.8, minWidth: 180 }}>
                  PARTICULARS
                </TableCell>
                <TableCell sx={{ bgcolor: '#0f172a', color: '#f8fafc', fontWeight: 800, fontSize: '0.78rem', py: 1.8, minWidth: 150 }}>
                  NAME
                </TableCell>
                <TableCell sx={{ bgcolor: '#0f172a', color: '#f8fafc', fontWeight: 800, fontSize: '0.78rem', py: 1.8, width: 110 }}>
                  REFERENCE
                </TableCell>
                <TableCell sx={{ bgcolor: '#0f172a', color: '#f8fafc', fontWeight: 800, fontSize: '0.78rem', py: 1.8, minWidth: 140 }}>
                  REFERENCE NUMBER
                </TableCell>
                <TableCell align="right" sx={{ bgcolor: '#0f172a', color: '#f8fafc', fontWeight: 800, fontSize: '0.78rem', py: 1.8, width: 140 }}>
                  AMOUNT RECEIVED
                </TableCell>
                <TableCell align="center" sx={{ bgcolor: '#0f172a', color: '#f8fafc', fontWeight: 800, fontSize: '0.78rem', py: 1.8, width: 90 }}>
                  STATUS
                </TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={13} align="center" sx={{ py: 8 }}>
                    <CircularProgress size={32} sx={{ color: '#10b981', mb: 1.5 }} />
                    <Typography variant="body2" sx={{ color: '#64748b', fontWeight: 600 }}>
                      Loading live payment receive records from Bank Book...
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={13} align="center" sx={{ py: 8 }}>
                    <ReceiptLongIcon sx={{ fontSize: 48, color: '#cbd5e1', mb: 1 }} />
                    <Typography variant="h6" sx={{ color: '#475569', fontWeight: 700 }}>
                      No Payment Receive Transactions Found
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#94a3b8', mt: 0.5 }}>
                      Try adjusting the Financial Year, Month, Invoice filter, or Search query.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                records
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((r) => (
                    <TableRow
                      key={r.id || r._id || r.slNo}
                      hover
                      sx={{
                        '&:nth-of-type(even)': { bgcolor: '#f8fafc' },
                        '&:hover': { bgcolor: '#f1f5f9' },
                        transition: 'background-color 0.15s ease'
                      }}
                    >
                      {/* 1. SL NO */}
                      <TableCell sx={{ fontWeight: 700, color: '#64748b', fontSize: '0.82rem' }}>
                        {r.slNo}
                      </TableCell>

                      {/* 2. DATE (Payment Transaction Date) */}
                      <TableCell sx={{ fontWeight: 700, color: '#0f172a', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                        {r.date}
                      </TableCell>

                      {/* 3. INVOICE NO (Authoritative Bill Register Invoice Number) */}
                      <TableCell sx={{ fontSize: '0.82rem', fontWeight: 800, color: r.invoiceNo !== '—' ? '#0284c7' : '#94a3b8' }}>
                        {r.invoiceNo}
                      </TableCell>

                      {/* 4. INVOICE DATE (Authoritative Bill Register Invoice Date) */}
                      <TableCell sx={{ fontSize: '0.82rem', fontWeight: 600, color: r.invoiceDate !== '—' ? '#334155' : '#94a3b8', whiteSpace: 'nowrap' }}>
                        {r.invoiceDate || '—'}
                      </TableCell>

                      {/* 5. TRANSACTION TYPE */}
                      <TableCell sx={{ fontSize: '0.82rem', color: '#334155' }}>
                        <Chip
                          label={r.transactionType || 'Payment Received'}
                          size="small"
                          sx={{
                            bgcolor: '#f1f5f9',
                            color: '#334155',
                            fontWeight: 700,
                            fontSize: '0.72rem',
                            border: '1px solid #e2e8f0'
                          }}
                        />
                      </TableCell>

                      {/* 6. LEDGER */}
                      <TableCell sx={{ fontWeight: 600, color: '#1e293b', fontSize: '0.82rem' }}>
                        {r.ledger}
                      </TableCell>

                      {/* 7. MONTH */}
                      <TableCell sx={{ color: '#475569', fontSize: '0.82rem', fontWeight: 600 }}>
                        {r.month}
                      </TableCell>

                      {/* 8. PARTICULARS */}
                      <TableCell sx={{ color: '#334155', fontSize: '0.82rem', maxWidth: 260, wordBreak: 'break-word' }}>
                        {r.particulars}
                      </TableCell>

                      {/* 9. NAME */}
                      <TableCell sx={{ fontWeight: 700, color: '#0f172a', fontSize: '0.82rem' }}>
                        {r.name}
                      </TableCell>

                      {/* 10. REFERENCE */}
                      <TableCell sx={{ color: '#475569', fontSize: '0.82rem', fontWeight: 600 }}>
                        {r.reference}
                      </TableCell>

                      {/* 11. REFERENCE NUMBER */}
                      <TableCell sx={{ color: '#1e293b', fontSize: '0.82rem', fontFamily: 'monospace', fontWeight: 600 }}>
                        {r.referenceNumber}
                      </TableCell>

                      {/* 12. AMOUNT RECEIVED */}
                      <TableCell align="right" sx={{ fontWeight: 900, color: '#059669', fontSize: '0.88rem' }}>
                        {fmtAmt(r.amountReceived)}
                      </TableCell>

                      {/* 13. STATUS */}
                      <TableCell align="center">
                        <Chip
                          label="RECEIVED"
                          size="small"
                          sx={{
                            bgcolor: '#dcfce7',
                            color: '#15803d',
                            fontWeight: 800,
                            fontSize: '0.68rem',
                            height: 22,
                            border: '1px solid #bbf7d0'
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* ── Table Pagination & Summary Footer ─────────────────────── */}
        <Box
          sx={{
            p: 1.5,
            px: 2.5,
            bgcolor: '#ffffff',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 2
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="body2" sx={{ color: '#64748b', fontWeight: 600 }}>
              Showing {records.length === 0 ? 0 : page * rowsPerPage + 1} to{' '}
              {Math.min((page + 1) * rowsPerPage, records.length)} of {records.length} records
            </Typography>
            <Chip
              label={`Total: ${fmtAmt(summary.totalPaymentReceived)}`}
              size="small"
              sx={{
                bgcolor: '#ecfdf5',
                color: '#047857',
                fontWeight: 800,
                fontSize: '0.75rem',
                border: '1px solid #a7f3d0'
              }}
            />
          </Box>

          <TablePagination
            component="div"
            count={records.length}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[25, 50, 100, 250]}
            sx={{
              '.MuiTablePagination-selectLabel, .MuiTablePagination-displayedRows': {
                fontWeight: 600,
                fontSize: '0.82rem',
                color: '#64748b'
              }
            }}
          />
        </Box>
      </Paper>

      {/* ── Feedback Snackbar ─────────────────────────────────────── */}
      <Snackbar
        open={Boolean(snack)}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {snack ? (
          <Alert severity={snack.severity} onClose={() => setSnack(null)} sx={{ fontWeight: 600, borderRadius: '10px' }}>
            {snack.message}
          </Alert>
        ) : null}
      </Snackbar>
    </Box>
  );
}
