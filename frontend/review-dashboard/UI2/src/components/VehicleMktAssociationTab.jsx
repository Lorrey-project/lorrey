import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Grid, Select, MenuItem, CircularProgress,
  Button, TableContainer, Table, TableHead, TableRow, TableCell,
  TableBody, Chip, Card, Divider, Stack, Alert, Paper, Tooltip as MuiTooltip
} from '@mui/material';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import RefreshIcon from '@mui/icons-material/Refresh';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import StorefrontIcon from '@mui/icons-material/Storefront';
import GroupsIcon from '@mui/icons-material/Groups';
import AssessmentIcon from '@mui/icons-material/Assessment';
import DownloadIcon from '@mui/icons-material/Download';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer, LabelList
} from 'recharts';
import axios from 'axios';
import { io } from 'socket.io-client';
import * as XLSX from 'xlsx';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const SOCKET_URL = import.meta.env.VITE_SOCKET_IO_URL || import.meta.env.VITE_API_URL || 'http://localhost:5000';

const MONTHS = [
  "ALL",
  "April", "May", "June", "July", "August", "September",
  "October", "November", "December", "January", "February", "March"
];

const getFYOptions = () => {
  const currentYear = new Date().getFullYear();
  return [
    `FY ${currentYear + 1}-${(currentYear + 2).toString().slice(-2)}`,
    `FY ${currentYear}-${(currentYear + 1).toString().slice(-2)}`,
    `FY ${currentYear - 1}-${(currentYear).toString().slice(-2)}`,
    `FY ${currentYear - 2}-${(currentYear - 1).toString().slice(-2)}`,
    `FY ${currentYear - 3}-${(currentYear - 2).toString().slice(-2)}`
  ];
};

const getDaysInMonth = (fyStr, monthName) => {
  if (!fyStr || !monthName || monthName === 'ALL') return 31;
  const parts = fyStr.replace(/\D+/g, ' ').trim().split(' ');
  const startYear = parseInt(parts[0], 10) || 2026;
  const endYear = startYear + 1;
  const allMonths = [
    "January", "February", "March", "April", "May", "June", 
    "July", "August", "September", "October", "November", "December"
  ];
  const mIdx = allMonths.indexOf(monthName);
  if (mIdx === -1) return 31;
  const targetYear = mIdx >= 3 ? startYear : endYear;
  return new Date(targetYear, mIdx + 1, 0).getDate();
};

const formatMT = (val) => {
  if (val === null || val === undefined || isNaN(val)) return '0 MT';
  return `${Number(val).toLocaleString('en-IN', { maximumFractionDigits: 2 })} MT`;
};

const GlassCard = ({ children, sx = {}, onClick }) => (
  <Card
    onClick={onClick}
    sx={{
      background: 'rgba(20, 24, 28, 0.65)',
      backdropFilter: 'blur(16px)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '12px',
      boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
      color: '#F5F7FA',
      ...sx
    }}
  >
    {children}
  </Card>
);

const selectStyle = {
  color: '#FFF',
  bgcolor: 'rgba(255,255,255,0.04)',
  fontSize: '0.85rem',
  fontWeight: 600,
  '& .MuiOutlinedInput-notchedOutline': { border: '1px solid rgba(255,255,255,0.12)' },
  '&:hover .MuiOutlinedInput-notchedOutline': { border: '1px solid rgba(255,255,255,0.25)' },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { border: '1px solid #8b5cf6' },
  height: '38px',
  borderRadius: '8px'
};

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const marketVal = payload.find(p => p.dataKey === 'market')?.value || 0;
    const assocVal = payload.find(p => p.dataKey === 'association')?.value || 0;
    const totalVal = marketVal + assocVal;
    const mktPct = totalVal > 0 ? ((marketVal / totalVal) * 100).toFixed(1) : 0;
    const assocPct = totalVal > 0 ? ((assocVal / totalVal) * 100).toFixed(1) : 0;

    return (
      <Box sx={{
        bgcolor: '#0f172a',
        border: '1px solid rgba(255,255,255,0.15)',
        p: 2,
        borderRadius: '10px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
        minWidth: 200
      }}>
        <Typography variant="subtitle2" fontWeight={800} color="#f8fafc" sx={{ mb: 1, borderBottom: '1px solid rgba(255,255,255,0.1)', pb: 0.5 }}>
          Vehicle Type: {label}
        </Typography>
        <Box display="flex" justifyContent="space-between" alignItems="center" my={0.5}>
          <Box display="flex" alignItems="center" gap={1}>
            <Box sx={{ width: 10, height: 10, bgcolor: '#3b82f6', borderRadius: '2px' }} />
            <Typography variant="caption" color="#94a3b8" fontWeight={600}>Market:</Typography>
          </Box>
          <Typography variant="caption" color="#60a5fa" fontWeight={700}>
            {marketVal.toLocaleString('en-IN')} MT ({mktPct}%)
          </Typography>
        </Box>
        <Box display="flex" justifyContent="space-between" alignItems="center" my={0.5}>
          <Box display="flex" alignItems="center" gap={1}>
            <Box sx={{ width: 10, height: 10, bgcolor: '#10b981', borderRadius: '2px' }} />
            <Typography variant="caption" color="#94a3b8" fontWeight={600}>Association:</Typography>
          </Box>
          <Typography variant="caption" color="#34d399" fontWeight={700}>
            {assocVal.toLocaleString('en-IN')} MT ({assocPct}%)
          </Typography>
        </Box>
        <Divider sx={{ my: 1, borderColor: 'rgba(255,255,255,0.1)' }} />
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="caption" color="#f1f5f9" fontWeight={800}>Total Lifting:</Typography>
          <Typography variant="caption" color="#fbbf24" fontWeight={800}>
            {totalVal.toLocaleString('en-IN')} MT
          </Typography>
        </Box>
      </Box>
    );
  }
  return null;
};

export default function VehicleMktAssociationTab() {
  const currentMonthName = useMemo(() => {
    const allMonths = [
      "January", "February", "March", "April", "May", "June", 
      "July", "August", "September", "October", "November", "December"
    ];
    return allMonths[new Date().getMonth()];
  }, []);

  const [financialYear, setFinancialYear] = useState(getFYOptions()[1]);
  const [month, setMonth] = useState(currentMonthName);
  const [date, setDate] = useState('ALL');

  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [error, setError] = useState(null);

  const daysInMonth = useMemo(() => {
    return getDaysInMonth(financialYear, month);
  }, [financialYear, month]);

  const dateOptions = useMemo(() => {
    if (month === 'ALL') return ['ALL'];
    return ['ALL', ...Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, '0'))];
  }, [month, daysInMonth]);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const res = await axios.get(`${API_URL}/pie-chart/vehicle-mkt-association`, {
        params: {
          financialYear,
          month,
          date
        },
        headers
      });

      if (res.data?.success) {
        setReportData(res.data);
      } else {
        setError(res.data?.error || 'Failed to load report data');
        setReportData(null);
      }
    } catch (err) {
      console.error('[VehicleMktAssociationTab] Fetch error:', err);
      setError(err.response?.data?.error || err.message || 'Server connection error');
      setReportData(null);
    } finally {
      setLoading(false);
    }
  }, [financialYear, month, date]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // Real-time synchronization
  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    const handleUpdate = () => {
      fetchReport();
    };

    socket.on('cementUpdates', handleUpdate);
    socket.on('truckContactUpdates', handleUpdate);
    socket.on('partyPaymentUpdate', handleUpdate);

    return () => {
      socket.disconnect();
    };
  }, [fetchReport]);

  const tableRows = reportData?.table || [];
  const chartData = reportData?.chartData || [];
  const summary = reportData?.summary || { totalLifting: 0, marketTotal: 0, associationTotal: 0, marketPercentage: 0, associationPercentage: 0 };
  const periodInfo = reportData?.period || {};

  const handleExportExcel = () => {
    if (!tableRows || tableRows.length === 0) return;
    try {
      const wb = XLSX.utils.book_new();
      const rows = [
        ['VEHICLE ( MKT & ASSOCIATION ) - LIFTING ANALYSIS REPORT'],
        [`Financial Year: ${financialYear} | Month: ${month} | Date: ${date} | Period: ${periodInfo.display || '-'}`],
        [`Source: Cement Register (Actual TOTAL MT) & Party Master (Relationship Type)`],
        [],
        ['VEHICLE TYPE', 'TOTAL LIFTING (MT)', 'MARKET (MT)', 'ASSOCIATION (MT)', 'VEHICLES COUNT', 'RECORDS COUNT']
      ];

      tableRows.forEach(r => {
        rows.push([
          r.vehicleType,
          r.totalLifting,
          r.market,
          r.association,
          r.vehicleCount || '-',
          r.recordCount || '-'
        ]);
      });

      rows.push([]);
      rows.push(['SUMMARY RATIOS']);
      rows.push(['Market Share', `${summary.marketPercentage}%`]);
      rows.push(['Association Share', `${summary.associationPercentage}%`]);

      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Mkt & Assoc Summary');
      XLSX.writeFile(wb, `Vehicle_MKT_and_Association_${financialYear.replace(/\s+/g, '_')}_${month}.xlsx`);
    } catch (err) {
      console.error('[VehicleMktAssociationTab] Export error:', err);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* =========================================================================
          TOP HEADER & FILTER BAR
         ========================================================================= */}
      <GlassCard sx={{ p: 2 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
          <Box>
            <Box display="flex" alignItems="center" gap={1.2}>
              <LocalShippingIcon sx={{ color: '#8b5cf6', fontSize: '1.4rem' }} />
              <Typography variant="h6" fontWeight={800} sx={{ letterSpacing: '0.5px', color: '#FFF' }}>
                VEHICLE ( MKT & ASSOCIATION)
              </Typography>
            </Box>
            <Typography variant="caption" sx={{ color: '#94a3b8', display: 'block', mt: 0.3 }}>
              Operational Lifting Distribution • Cement Register TOTAL MT vs Party Master (MKT / ATOA)
            </Typography>
          </Box>

          {/* Controls */}
          <Box display="flex" alignItems="center" gap={1.5} flexWrap="wrap">
            {/* Financial Year */}
            <Box sx={{ minWidth: 140 }}>
              <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.68rem', fontWeight: 700, mb: 0.3, display: 'block' }}>
                FINANCIAL YEAR
              </Typography>
              <Select
                value={financialYear}
                onChange={(e) => {
                  setFinancialYear(e.target.value);
                  setDate('ALL');
                }}
                size="small"
                fullWidth
                sx={selectStyle}
              >
                {getFYOptions().map(fy => (
                  <MenuItem key={fy} value={fy} sx={{ fontSize: '0.82rem', fontWeight: 600 }}>{fy}</MenuItem>
                ))}
              </Select>
            </Box>

            {/* Month */}
            <Box sx={{ minWidth: 130 }}>
              <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.68rem', fontWeight: 700, mb: 0.3, display: 'block' }}>
                MONTH
              </Typography>
              <Select
                value={month}
                onChange={(e) => {
                  setMonth(e.target.value);
                  setDate('ALL');
                }}
                size="small"
                fullWidth
                sx={selectStyle}
              >
                {MONTHS.map(m => (
                  <MenuItem key={m} value={m} sx={{ fontSize: '0.82rem', fontWeight: 600 }}>{m}</MenuItem>
                ))}
              </Select>
            </Box>

            {/* Date */}
            <Box sx={{ minWidth: 110, opacity: month === 'ALL' ? 0.4 : 1, pointerEvents: month === 'ALL' ? 'none' : 'auto' }}>
              <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.68rem', fontWeight: 700, mb: 0.3, display: 'block' }}>
                DATE
              </Typography>
              <Select
                value={date}
                onChange={(e) => setDate(e.target.value)}
                size="small"
                fullWidth
                sx={selectStyle}
              >
                {dateOptions.map(d => (
                  <MenuItem key={d} value={d} sx={{ fontSize: '0.82rem', fontWeight: 600 }}>
                    {d === 'ALL' ? `All (1-${daysInMonth})` : d}
                  </MenuItem>
                ))}
              </Select>
            </Box>

            {/* Action Buttons */}
            <Box display="flex" alignItems="flex-end" gap={1} sx={{ pt: 2 }}>
              <Button
                variant="contained"
                onClick={fetchReport}
                disabled={loading}
                startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <FilterAltIcon />}
                sx={{
                  bgcolor: '#5a45cf',
                  color: '#FFF',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  py: 1,
                  px: 2.2,
                  borderRadius: '8px',
                  textTransform: 'none',
                  boxShadow: '0 4px 14px rgba(90, 69, 207, 0.4)',
                  '&:hover': { bgcolor: '#4c39b8' }
                }}
              >
                Apply
              </Button>

              <Button
                variant="outlined"
                onClick={handleExportExcel}
                startIcon={<DownloadIcon />}
                sx={{
                  color: '#94a3b8',
                  borderColor: 'rgba(255,255,255,0.15)',
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  py: 1,
                  px: 2,
                  borderRadius: '8px',
                  textTransform: 'none',
                  '&:hover': { color: '#FFF', borderColor: '#FFF', bgcolor: 'rgba(255,255,255,0.05)' }
                }}
              >
                Excel
              </Button>
            </Box>
          </Box>
        </Box>
      </GlassCard>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ bgcolor: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
          {error}
        </Alert>
      )}

      {/* KPI Top Highlights */}
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={4}>
          <GlassCard sx={{ p: 2 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 700, letterSpacing: '0.5px' }}>
                TOTAL LIFTING
              </Typography>
              <LocalShippingIcon sx={{ color: '#fbbf24', fontSize: '1.2rem' }} />
            </Box>
            <Typography variant="h4" fontWeight={900} color="#fbbf24" sx={{ my: 0.8 }}>
              {summary.totalLifting.toLocaleString('en-IN')} <span style={{ fontSize: '14px', fontWeight: 700 }}>MT</span>
            </Typography>
            <Typography variant="caption" sx={{ color: '#64748b' }}>
              6W + 10WH + 12WH + 14WH total
            </Typography>
          </GlassCard>
        </Grid>

        <Grid item xs={12} sm={6} md={4}>
          <GlassCard sx={{ p: 2 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 700, letterSpacing: '0.5px' }}>
                MARKET (MKT)
              </Typography>
              <StorefrontIcon sx={{ color: '#60a5fa', fontSize: '1.2rem' }} />
            </Box>
            <Typography variant="h4" fontWeight={900} color="#60a5fa" sx={{ my: 0.8 }}>
              {summary.marketTotal.toLocaleString('en-IN')} <span style={{ fontSize: '14px', fontWeight: 700 }}>MT</span>
            </Typography>
            <Typography variant="caption" sx={{ color: '#38bdf8', fontWeight: 700 }}>
              {summary.marketPercentage}% <span style={{ color: '#64748b', fontWeight: 400 }}>of total lifting</span>
            </Typography>
          </GlassCard>
        </Grid>

        <Grid item xs={12} sm={6} md={4}>
          <GlassCard sx={{ p: 2 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 700, letterSpacing: '0.5px' }}>
                ASSOCIATION (ATOA)
              </Typography>
              <GroupsIcon sx={{ color: '#34d399', fontSize: '1.2rem' }} />
            </Box>
            <Typography variant="h4" fontWeight={900} color="#34d399" sx={{ my: 0.8 }}>
              {summary.associationTotal.toLocaleString('en-IN')} <span style={{ fontSize: '14px', fontWeight: 700 }}>MT</span>
            </Typography>
            <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 700 }}>
              {summary.associationPercentage}% <span style={{ color: '#64748b', fontWeight: 400 }}>of total lifting</span>
            </Typography>
          </GlassCard>
        </Grid>
      </Grid>

      {/* =========================================================================
          MAIN LAYOUT: SIMPLE TABLE + SIMPLE BAR GRAPH
         ========================================================================= */}
      <Grid container spacing={2.5}>
        {/* LEFT COLUMN: MAIN SUMMARY TABLE */}
        <Grid item xs={12} lg={5}>
          <GlassCard sx={{ p: 2.5, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Box>
                <Typography variant="subtitle1" fontWeight={800} color="#f8fafc">
                  Vehicle Lifting Table
                </Typography>
                <Typography variant="caption" color="#94a3b8">
                  Period: {periodInfo.display || `${month} ${financialYear}`}
                </Typography>
              </Box>
              <Chip
                label="Authoritative MT"
                size="small"
                sx={{ bgcolor: 'rgba(139, 92, 246, 0.15)', color: '#c084fc', fontWeight: 700, fontSize: '0.72rem' }}
              />
            </Box>

            <TableContainer sx={{
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.08)',
              bgcolor: 'rgba(10, 14, 18, 0.5)',
              flex: 1
            }}>
              <Table size="medium">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'rgba(255,255,255,0.05)' }}>
                    <TableCell sx={{ color: '#94a3b8', fontWeight: 800, fontSize: '0.78rem', py: 1.5, letterSpacing: '0.5px' }}>
                      VEHICLE TYPE
                    </TableCell>
                    <TableCell align="right" sx={{ color: '#fbbf24', fontWeight: 800, fontSize: '0.78rem', py: 1.5 }}>
                      TOTAL LIFTING
                    </TableCell>
                    <TableCell align="right" sx={{ color: '#60a5fa', fontWeight: 800, fontSize: '0.78rem', py: 1.5 }}>
                      MARKET
                    </TableCell>
                    <TableCell align="right" sx={{ color: '#34d399', fontWeight: 800, fontSize: '0.78rem', py: 1.5 }}>
                      ASSOCIATION
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading && tableRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} align="center" sx={{ py: 6, color: '#94a3b8' }}>
                        <CircularProgress size={26} sx={{ color: '#8b5cf6', mb: 1 }} />
                        <Typography variant="body2">Loading vehicle lifting data...</Typography>
                      </TableCell>
                    </TableRow>
                  ) : tableRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} align="center" sx={{ py: 6, color: '#64748b' }}>
                        No loading records found for the selected period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    tableRows.map((row) => {
                      const isTotal = row.vehicleType === 'TOTAL';
                      return (
                        <TableRow
                          key={row.vehicleType}
                          sx={{
                            bgcolor: isTotal ? 'rgba(139, 92, 246, 0.12)' : 'transparent',
                            borderTop: isTotal ? '2px solid rgba(139, 92, 246, 0.4)' : '1px solid rgba(255,255,255,0.04)',
                            transition: 'all 0.15s ease',
                            '&:hover': {
                              bgcolor: isTotal ? 'rgba(139, 92, 246, 0.18)' : 'rgba(255,255,255,0.03)'
                            }
                          }}
                        >
                          <TableCell sx={{
                            color: isTotal ? '#ffffff' : '#e2e8f0',
                            fontWeight: isTotal ? 900 : 700,
                            fontSize: isTotal ? '0.9rem' : '0.85rem',
                            py: isTotal ? 1.8 : 1.4
                          }}>
                            {row.vehicleType}
                          </TableCell>
                          <TableCell align="right" sx={{
                            color: isTotal ? '#fbbf24' : '#fef08a',
                            fontWeight: isTotal ? 900 : 700,
                            fontSize: isTotal ? '0.95rem' : '0.85rem',
                            py: isTotal ? 1.8 : 1.4
                          }}>
                            {row.totalLifting.toLocaleString('en-IN')} MT
                          </TableCell>
                          <TableCell align="right" sx={{
                            color: isTotal ? '#60a5fa' : '#93c5fd',
                            fontWeight: isTotal ? 900 : 600,
                            fontSize: isTotal ? '0.95rem' : '0.85rem',
                            py: isTotal ? 1.8 : 1.4
                          }}>
                            {row.market.toLocaleString('en-IN')} MT
                          </TableCell>
                          <TableCell align="right" sx={{
                            color: isTotal ? '#34d399' : '#86efac',
                            fontWeight: isTotal ? 900 : 600,
                            fontSize: isTotal ? '0.95rem' : '0.85rem',
                            py: isTotal ? 1.8 : 1.4
                          }}>
                            {row.association.toLocaleString('en-IN')} MT
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Footnote notes */}
            <Box display="flex" justifyContent="space-between" alignItems="center" mt={2} pt={1} borderTop="1px solid rgba(255,255,255,0.06)">
              <Typography variant="caption" sx={{ color: '#64748b' }}>
                • Classification: Party Master Relationship (MKT / ATOA)
              </Typography>
              {reportData?.unclassified?.totalMT > 0 && (
                <Typography variant="caption" sx={{ color: '#f59e0b', fontWeight: 600 }}>
                  Site/Unclassified: {reportData.unclassified.totalMT.toLocaleString('en-IN')} MT
                </Typography>
              )}
            </Box>
          </GlassCard>
        </Grid>

        {/* RIGHT COLUMN: SIMPLE BAR GRAPH */}
        <Grid item xs={12} lg={7}>
          <GlassCard sx={{ p: 2.5, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Box>
                <Typography variant="subtitle1" fontWeight={800} color="#f8fafc">
                  Market vs Association by Vehicle Type
                </Typography>
                <Typography variant="caption" color="#94a3b8">
                  Visual MT Comparison (6W, 10WH, 12WH, 14WH)
                </Typography>
              </Box>

              {/* Legend Badges */}
              <Box display="flex" gap={1.5} alignItems="center">
                <Box display="flex" alignItems="center" gap={0.8}>
                  <Box sx={{ width: 12, height: 12, bgcolor: '#3b82f6', borderRadius: '3px' }} />
                  <Typography variant="caption" color="#cbd5e1" fontWeight={700}>Market</Typography>
                </Box>
                <Box display="flex" alignItems="center" gap={0.8}>
                  <Box sx={{ width: 12, height: 12, bgcolor: '#10b981', borderRadius: '3px' }} />
                  <Typography variant="caption" color="#cbd5e1" fontWeight={700}>Association</Typography>
                </Box>
              </Box>
            </Box>

            {/* Graph Container */}
            <Box sx={{ flex: 1, minHeight: 380, width: '100%', pt: 1 }}>
              {loading && chartData.length === 0 ? (
                <Box display="flex" justifyContent="center" alignItems="center" height={360}>
                  <CircularProgress size={32} sx={{ color: '#8b5cf6' }} />
                </Box>
              ) : chartData.length === 0 ? (
                <Box display="flex" justifyContent="center" alignItems="center" height={360}>
                  <Typography variant="body2" color="#64748b">No data available for visualization.</Typography>
                </Box>
              ) : (
                <ResponsiveContainer width="100%" height={360}>
                  <BarChart
                    data={chartData}
                    margin={{ top: 20, right: 30, left: 10, bottom: 20 }}
                    barGap={8}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis
                      dataKey="vehicleType"
                      tick={{ fill: '#cbd5e1', fontSize: 13, fontWeight: 700 }}
                      axisLine={{ stroke: 'rgba(255,255,255,0.15)' }}
                      tickLine={{ stroke: 'rgba(255,255,255,0.15)' }}
                    />
                    <YAxis
                      tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }}
                      axisLine={{ stroke: 'rgba(255,255,255,0.15)' }}
                      tickLine={{ stroke: 'rgba(255,255,255,0.15)' }}
                      unit=" MT"
                    />
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Bar
                      dataKey="market"
                      name="Market"
                      fill="#3b82f6"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={55}
                    >
                      <LabelList
                        dataKey="market"
                        position="top"
                        fill="#93c5fd"
                        fontSize={11}
                        fontWeight={700}
                        formatter={(val) => val > 0 ? `${val.toLocaleString('en-IN')} MT` : ''}
                      />
                    </Bar>
                    <Bar
                      dataKey="association"
                      name="Association"
                      fill="#10b981"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={55}
                    >
                      <LabelList
                        dataKey="association"
                        position="top"
                        fill="#86efac"
                        fontSize={11}
                        fontWeight={700}
                        formatter={(val) => val > 0 ? `${val.toLocaleString('en-IN')} MT` : ''}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Box>
          </GlassCard>
        </Grid>
      </Grid>
    </Box>
  );
}
