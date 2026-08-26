import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Box, Typography, Button, Paper, Grid, Card, CardContent,
  CircularProgress, Alert, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, IconButton, MenuItem
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import RefreshIcon from '@mui/icons-material/Refresh';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import StorefrontIcon from '@mui/icons-material/Storefront';
import BusinessIcon from '@mui/icons-material/Business';
import SearchableSelect from '../components/SearchableSelect';
import axios from 'axios';
import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL;
const SOCKET_URL = import.meta.env.VITE_SOCKET_IO_URL || import.meta.env.VITE_API_URL;

const parseDate = (dStr) => {
  if (!dStr) return new Date(0);
  const parts = String(dStr).trim().split(/[-\/]/);
  if (parts.length === 3) {
    return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
  }
  return new Date(dStr);
};

export default function TotalPaymentReports({ onBack }) {
  const now = useMemo(() => new Date(), []);
  const currentFyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1);
  const [selYear, setSelYear] = useState(`${currentFyStart}-${currentFyStart + 1}`);
  const [entries, setEntries] = useState([]);
  const [prevClosing, setPrevClosing] = useState({ P_CLOSING: 0, S_CLOSING: 0, O_CLOSING: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Year options matching MainCashbook logic
  const yearOptions = useMemo(() => {
    const list = [];
    for (let y = currentFyStart - 2; y <= currentFyStart + 1; y++) {
      list.push(`${y}-${y + 1}`);
    }
    return list;
  }, [currentFyStart]);

  const MONTH_NAMES = useMemo(() => [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ], []);

  const token = () => localStorage.getItem('token');

  // Helpers
  const num = (val, fallback = 0) => { const n = parseFloat(val); return isNaN(n) ? fallback : n; };
  const fmt2 = (n) => Math.round(num(n) * 100) / 100;

  // Fetch current month's transactions and compute prevClosing chronologically
  const fetchData = useCallback(async (month, yearStr, silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      
      const fyStartYear = parseInt(String(yearStr).split('-')[0], 10);
      const calendarYear = month >= 4 ? fyStartYear : fyStartYear + 1;

      // Calculate previous month and year
      let prevMonth = month - 1;
      let prevCalendarYear = calendarYear;
      if (prevMonth < 1) {
        prevMonth = 12;
        prevCalendarYear--;
      }

      // Fetch prev month's entries and current month's entries in parallel
      const [prevMonthRes, mainCashbookRes] = await Promise.all([
        axios.get(`${API_URL}/main-cashbook`, {
          params: { month: prevMonth, year: prevCalendarYear },
          headers: { Authorization: `Bearer ${token()}` }
        }),
        axios.get(`${API_URL}/main-cashbook`, {
          params: { month, year: calendarYear },
          headers: { Authorization: `Bearer ${token()}` }
        })
      ]);

      // Calculate prevClosing from previous month's entries chronologically
      let prevClosingBal = { P_CLOSING: 0, S_CLOSING: 0, O_CLOSING: 0 };
      if (prevMonthRes.data.success && prevMonthRes.data.entries.length > 0) {
        const prevEntriesSorted = [...prevMonthRes.data.entries].sort((a, b) => parseDate(a.DATE) - parseDate(b.DATE));
        
        const prevResult = [];
        for (let i = 0; i < prevEntriesSorted.length; i++) {
          const r = { ...prevEntriesSorted[i] };
          if (i === 0) {
            r.P_OPENING = num(r.P_OPENING);
            r.S_OPENING = num(r.S_OPENING);
            r.O_OPENING = num(r.O_OPENING);
          } else {
            const prevRow = prevResult[i - 1];
            r.P_OPENING = prevRow.P_CLOSING;
            r.S_OPENING = prevRow.S_CLOSING;
            r.O_OPENING = prevRow.O_CLOSING;
          }
          
          r.P_TOTAL = fmt2(num(r.P_OPENING) + num(r.P_WITHDRAW));
          r.P_CLOSING = fmt2(num(r.P_TOTAL) - num(r.P_GIVEN_DAC) - num(r.P_GIVEN_OFFICE) - num(r.P_OTHERS));

          r.S_RECV_SANGRAM = num(r.P_GIVEN_DAC);
          r.S_TOTAL = fmt2(num(r.S_OPENING) + num(r.S_RECV_SANGRAM) + num(r.S_TRANS_OFFICE));
          r.S_CLOSING = fmt2(num(r.S_TOTAL) - num(r.S_EXPENSE) - num(r.S_TRANS_TO_OFFICE));

          r.O_RECV_HFS = num(r.P_GIVEN_OFFICE);
          r.O_RECV_SITE = num(r.S_TRANS_TO_OFFICE);
          r.O_TOTAL = fmt2(num(r.O_OPENING) + num(r.O_RECV_HFS) + num(r.O_RECV_SITE));
          r.O_CLOSING = fmt2(num(r.O_TOTAL) - num(r.O_EXPENSE));

          prevResult.push(r);
        }
        
        if (prevResult.length > 0) {
          const lastPrevRow = prevResult[prevResult.length - 1];
          prevClosingBal = {
            P_CLOSING: lastPrevRow.P_CLOSING,
            S_CLOSING: lastPrevRow.S_CLOSING,
            O_CLOSING: lastPrevRow.O_CLOSING
          };
        }
      }

      setPrevClosing(prevClosingBal);
      if (mainCashbookRes.data.success) {
        setEntries(mainCashbookRes.data.entries);
      } else {
        throw new Error(mainCashbookRes.data.error || 'Failed to fetch cashbook data.');
      }
    } catch (e) {
      console.error('Fetch failed:', e);
      setError('Unable to load cash summary data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial and reactive load
  useEffect(() => {
    fetchData(selMonth, selYear);
  }, [selMonth, selYear, fetchData]);

  // Sockets for real-time synchronization
  useEffect(() => {
    const socket = io(SOCKET_URL, {
      autoConnect: true,
      transports: ["websocket", "polling"]
    });

    let timer = null;
    const handler = () => {
      clearTimeout(timer);
      timer = setTimeout(() => fetchData(selMonth, selYear, true), 150);
    };

    socket.on('mainCashbookUpdates', handler);
    socket.on('expenseUpdate', handler);
    socket.on('voucherCreated', handler);

    return () => {
      socket.off('mainCashbookUpdates', handler);
      socket.off('expenseUpdate', handler);
      socket.off('voucherCreated', handler);
      socket.disconnect();
      clearTimeout(timer);
    };
  }, [selMonth, selYear, fetchData]);

  // Compute daily running carry-forwards and calculations chronologically
  const computedRows = useMemo(() => {
    const rawList = [...entries].sort((a, b) => parseDate(a.DATE) - parseDate(b.DATE));
    const result = [];
    for (let i = 0; i < rawList.length; i++) {
      const r = { ...rawList[i] };
      if (i === 0) {
        if (r.P_OPENING === undefined || r.P_OPENING === null || r.P_OPENING === '') {
          r.P_OPENING = prevClosing.P_CLOSING || 0;
        }
        if (r.S_OPENING === undefined || r.S_OPENING === null || r.S_OPENING === '') {
          r.S_OPENING = prevClosing.S_CLOSING || 0;
        }
        if (r.O_OPENING === undefined || r.O_OPENING === null || r.O_OPENING === '') {
          r.O_OPENING = prevClosing.O_CLOSING || 0;
        }
      } else {
        const prev = result[i - 1];
        r.P_OPENING = prev.P_CLOSING;
        r.S_OPENING = prev.S_CLOSING;
        r.O_OPENING = prev.O_CLOSING;
      }
      
      // Pump calculations
      r.P_TOTAL = fmt2(num(r.P_OPENING) + num(r.P_WITHDRAW));
      r.P_CLOSING = fmt2(num(r.P_TOTAL) - num(r.P_GIVEN_DAC) - num(r.P_GIVEN_OFFICE) - num(r.P_OTHERS));

      // Site calculations (subtract S_TRANS_TO_OFFICE to prevent site-to-office transfer double counting)
      r.S_RECV_SANGRAM = num(r.P_GIVEN_DAC);
      r.S_TOTAL = fmt2(num(r.S_OPENING) + num(r.S_RECV_SANGRAM) + num(r.S_TRANS_OFFICE));
      r.S_CLOSING = fmt2(num(r.S_TOTAL) - num(r.S_EXPENSE) - num(r.S_TRANS_TO_OFFICE));

      // Office calculations
      r.O_RECV_HFS = num(r.P_GIVEN_OFFICE);
      r.O_RECV_SITE = num(r.S_TRANS_TO_OFFICE);
      r.O_TOTAL = fmt2(num(r.O_OPENING) + num(r.O_RECV_HFS) + num(r.O_RECV_SITE));
      r.O_CLOSING = fmt2(num(r.O_TOTAL) - num(r.O_EXPENSE));

      result.push(r);
    }
    return result;
  }, [entries, prevClosing]);

  // Derived current balances for the summary row
  const currentBalances = useMemo(() => {
    if (computedRows.length === 0) {
      return { pump: 0, site: 0, office: 0, total: 0 };
    }
    const lastRow = computedRows[computedRows.length - 1];
    const pump = num(lastRow.P_CLOSING);
    const site = num(lastRow.S_CLOSING);
    const office = num(lastRow.O_CLOSING);
    return {
      pump,
      site,
      office,
      total: fmt2(pump + site + office)
    };
  }, [computedRows]);

  // Pump transactions list
  const pumpTransactions = useMemo(() => {
    const list = computedRows.filter(r => 
      num(r.P_WITHDRAW) > 0 || 
      num(r.P_GIVEN_DAC) > 0 || 
      num(r.P_GIVEN_OFFICE) > 0 || 
      num(r.P_OTHERS) > 0 || 
      (r.P_LOAN_RECV && String(r.P_LOAN_RECV).trim() !== '') || 
      (r.P_LOAN_PAY && String(r.P_LOAN_PAY).trim() !== '')
    ).map(r => {
      const descParts = [];
      if (num(r.P_WITHDRAW) > 0) descParts.push("Cash Withdraw");
      if (num(r.P_GIVEN_DAC) > 0) descParts.push("Site Cash Given to Sangram");
      if (num(r.P_GIVEN_OFFICE) > 0) descParts.push("Cash Given to Office");
      if (num(r.P_OTHERS) > 0) descParts.push("Others");
      if (r.P_LOAN_RECV && String(r.P_LOAN_RECV).trim() !== '') descParts.push(`Loan Recv: ${r.P_LOAN_RECV}`);
      if (r.P_LOAN_PAY && String(r.P_LOAN_PAY).trim() !== '') descParts.push(`Loan Pay: ${r.P_LOAN_PAY}`);
      
      return {
        date: r.DATE,
        description: descParts.join(" | ") || "Adjustment/Movement",
        reference: r.REMARKS || "",
        inflow: num(r.P_WITHDRAW),
        outflow: num(r.P_GIVEN_DAC) + num(r.P_GIVEN_OFFICE) + num(r.P_OTHERS),
        balance: r.P_CLOSING
      };
    });
    return [...list].reverse();
  }, [computedRows]);

  // Site transactions list
  const siteTransactions = useMemo(() => {
    const list = computedRows.filter(r => 
      num(r.S_RECV_SANGRAM) > 0 || 
      num(r.S_TRANS_OFFICE) > 0 || 
      num(r.S_EXPENSE) > 0 || 
      num(r.S_TRANS_TO_OFFICE) > 0
    ).map(r => {
      const descParts = [];
      if (num(r.S_RECV_SANGRAM) > 0) descParts.push("Recv from Sangram");
      if (num(r.S_TRANS_OFFICE) > 0) descParts.push("Transferred from Office");
      if (num(r.S_EXPENSE) > 0) descParts.push("Site Expense");
      if (num(r.S_TRANS_TO_OFFICE) > 0) descParts.push("Transferred to Office Cash");

      return {
        date: r.DATE,
        description: descParts.join(" | ") || "Adjustment/Movement",
        reference: r.REMARKS || "",
        inflow: num(r.S_RECV_SANGRAM) + num(r.S_TRANS_OFFICE),
        outflow: num(r.S_EXPENSE) + num(r.S_TRANS_TO_OFFICE),
        balance: r.S_CLOSING
      };
    });
    return [...list].reverse();
  }, [computedRows]);

  // Office transactions list
  const officeTransactions = useMemo(() => {
    const list = computedRows.filter(r => 
      num(r.O_RECV_HFS) > 0 || 
      num(r.O_RECV_SITE) > 0 || 
      num(r.O_EXPENSE) > 0
    ).map(r => {
      const descParts = [];
      if (num(r.O_RECV_HFS) > 0) descParts.push("Recv from HFS");
      if (num(r.O_RECV_SITE) > 0) descParts.push("Recv from Site");
      if (num(r.O_EXPENSE) > 0) {
        if (r.REMARKS_EXP) {
          descParts.push(`Office Expense (${r.REMARKS_EXP})`);
        } else {
          descParts.push("Office Expense");
        }
      }

      return {
        date: r.DATE,
        description: descParts.join(" | ") || "Adjustment/Movement",
        reference: r.REMARKS || "",
        inflow: num(r.O_RECV_HFS) + num(r.O_RECV_SITE),
        outflow: num(r.O_EXPENSE),
        balance: r.O_CLOSING
      };
    });
    return [...list].reverse();
  }, [computedRows]);

  const renderKPICard = (title, amount, color, icon) => (
    <Card sx={{ flex: 1, minWidth: '220px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{ p: 1.5, borderRadius: '8px', bgcolor: `${color}15`, color: color, display: 'flex', alignItems: 'center' }}>
          {icon}
        </Box>
        <Box>
          <Typography variant="caption" sx={{ fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
            {title}
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a', mt: 0.5 }}>
            ₹ {amount.toLocaleString('en-IN')}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );

  const renderRegisterSection = (title, balance, transactions, color) => (
    <Paper sx={{ p: 3, mb: 4, borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color }} />
          {title}
        </Typography>
        <Typography variant="h6" sx={{ fontWeight: 800, color: '#0f172a' }}>
          Current Balance: <span style={{ color: color }}>₹ {balance.toLocaleString('en-IN')}</span>
        </Typography>
      </Box>

      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#64748b', mb: 2 }}>
        Recent Transactions
      </Typography>

      {transactions.length === 0 ? (
        <Box sx={{ p: 4, textAlign: 'center', bgcolor: '#f8fafc', borderRadius: '8px', border: '1px dashed #e2e8f0' }}>
          <Typography variant="body2" sx={{ color: '#64748b' }}>
            No transactions recorded for this period.
          </Typography>
        </Box>
      ) : (
        <TableContainer sx={{ maxHeight: 350, border: '1px solid #e2e8f0', borderRadius: '8px' }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, bgcolor: '#f8fafc', color: '#475569' }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 700, bgcolor: '#f8fafc', color: '#475569' }}>Description / Source</TableCell>
                <TableCell sx={{ fontWeight: 700, bgcolor: '#f8fafc', color: '#475569' }}>Reference</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, bgcolor: '#f8fafc', color: '#475569' }}>Cash In</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, bgcolor: '#f8fafc', color: '#475569' }}>Cash Out</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, bgcolor: '#f8fafc', color: '#475569' }}>Running Balance</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {transactions.map((tx, idx) => (
                <TableRow key={idx} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                  <TableCell sx={{ fontWeight: 600 }}>{tx.date}</TableCell>
                  <TableCell sx={{ color: '#334155' }}>{tx.description}</TableCell>
                  <TableCell sx={{ color: '#64748b', fontStyle: tx.reference ? 'normal' : 'italic' }}>
                    {tx.reference || '-'}
                  </TableCell>
                  <TableCell align="right" sx={{ color: tx.inflow > 0 ? '#16a34a' : '#94a3b8', fontWeight: tx.inflow > 0 ? 600 : 400 }}>
                    {tx.inflow > 0 ? `+₹${tx.inflow.toLocaleString('en-IN')}` : '-'}
                  </TableCell>
                  <TableCell align="right" sx={{ color: tx.outflow > 0 ? '#dc2626' : '#94a3b8', fontWeight: tx.outflow > 0 ? 600 : 400 }}>
                    {tx.outflow > 0 ? `-₹${tx.outflow.toLocaleString('en-IN')}` : '-'}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: '#0f172a' }}>
                    ₹{tx.balance.toLocaleString('en-IN')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  );

  return (
    <Box sx={{ p: 3, minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      {/* Header & Filter Controls */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button
            variant="text"
            startIcon={<ArrowBackIcon />}
            onClick={onBack}
            sx={{
              color: '#64748b',
              fontWeight: 600,
              '&:hover': { color: '#0f172a', bgcolor: 'rgba(0,0,0,0.04)' }
            }}
          >
            Back to Home
          </Button>
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 1 }}>
            <AccountBalanceWalletIcon sx={{ color: '#0284c7' }} />
            Total Incoming & Outgoing Payment Reports
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {/* Month selector */}
          <Box sx={{ minWidth: 140 }}>
            <SearchableSelect sx={{ minWidth: 140 }} value={selMonth} label="Month" onChange={e => setSelMonth(e.target.value)}>
              {MONTH_NAMES.map((m, i) => <MenuItem key={i + 1} value={i + 1}>{m}</MenuItem>)}
            </SearchableSelect>
          </Box>

          {/* Year selector */}
          <Box sx={{ minWidth: 140 }}>
            <SearchableSelect sx={{ minWidth: 140 }} value={selYear} label="Financial Year" onChange={e => setSelYear(e.target.value)}>
              {yearOptions.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
            </SearchableSelect>
          </Box>

          {/* Refresh icon */}
          <IconButton size="medium" onClick={() => fetchData(selMonth, selYear)} sx={{ bgcolor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', '&:hover': { bgcolor: '#e2e8f0' } }}>
            <RefreshIcon sx={{ color: '#475569' }} />
          </IconButton>
        </Box>
      </Box>

      {/* Main Content Area */}
      {error ? (
        <Alert severity="error" sx={{ mb: 3 }} action={
          <Button color="inherit" size="small" onClick={() => fetchData(selMonth, selYear)}>
            Retry
          </Button>
        }>
          {error}
        </Alert>
      ) : null}

      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, py: 8, gap: 2 }}>
          <CircularProgress size={48} thickness={4} sx={{ color: '#0284c7' }} />
          <Typography color="text.secondary" fontWeight={600}>Loading Cash Summary...</Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* KPI Summary Row */}
          <Grid container spacing={3} sx={{ mb: 1 }}>
            <Grid item xs={12} sm={6} md={3}>
              {renderKPICard("Pump Cash", currentBalances.pump, "#9c27b0", <LocalGasStationIcon />)}
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              {renderKPICard("Site Cash", currentBalances.site, "#2e7d32", <StorefrontIcon />)}
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              {renderKPICard("Office Cash", currentBalances.office, "#1565c0", <BusinessIcon />)}
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              {renderKPICard("Total Cash", currentBalances.total, "#0284c7", <AccountBalanceWalletIcon />)}
            </Grid>
          </Grid>

          {/* Detailed Cash Registers */}
          {renderRegisterSection("Pump Cash", currentBalances.pump, pumpTransactions, "#9c27b0")}
          {renderRegisterSection("Site Cash", currentBalances.site, siteTransactions, "#2e7d32")}
          {renderRegisterSection("Office Cash", currentBalances.office, officeTransactions, "#1565c0")}
        </Box>
      )}
    </Box>
  );
}


