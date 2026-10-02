import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Grid, Select, MenuItem, FormControl, InputLabel,
  CircularProgress, Button, TableContainer, Table, TableHead, TableRow,
  TableCell, TableBody, Paper, Card, CardContent, Divider, Stack, Chip
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import BarChartIcon from '@mui/icons-material/BarChart';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer
} from 'recharts';
import axios from 'axios';
import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const SOCKET_URL = import.meta.env.VITE_SOCKET_IO_URL || import.meta.env.VITE_API_URL || 'http://localhost:5000';

const FY_OPTIONS = [
  "FY 2026-27",
  "FY 2025-26",
  "FY 2024-25",
  "FY 2023-24",
  "FY 2022-23",
  "FY 2021-22"
];

const FY_MONTHS = [
  "April", "May", "June", "July", "August", "September",
  "October", "November", "December", "January", "February", "March"
];

// Custom currency formatter for INR
const formatCurrency = (val) => {
  if (val === null || val === undefined || isNaN(val)) return '₹0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(val || 0);
};

// Custom tonnage formatter (MT)
const formatMT = (val) => {
  if (val === null || val === undefined || isNaN(val)) return '0.00 MT';
  return `${Number(val).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} MT`;
};

// Formatter for Y-Axis labels
const formatTonnageAxis = (val) => {
  if (val >= 1000) return `${(val / 1000).toFixed(1)}k MT`;
  return `${val} MT`;
};

const formatRevenueAxis = (val) => {
  if (val >= 10000000) return `₹${(val / 10000000).toFixed(2)} Cr`;
  if (val >= 100000) return `₹${(val / 100000).toFixed(1)} L`;
  if (val >= 1000) return `₹${(val / 1000).toFixed(0)} k`;
  return `₹${val}`;
};

// Premium Glassmorphism Card
const GlassCard = ({ children, sx = {} }) => (
  <Card
    sx={{
      background: 'linear-gradient(135deg, rgba(26, 32, 44, 0.85) 0%, rgba(15, 23, 42, 0.95) 100%)',
      backdropFilter: 'blur(16px)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '16px',
      boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.45)',
      color: '#F8FAFC',
      ...sx
    }}
  >
    {children}
  </Card>
);

// Custom Chart Tooltip
const CustomChartTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <Box
        sx={{
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '10px',
          p: 2,
          boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
          minWidth: 220
        }}
      >
        <Typography sx={{ color: '#E2E8F0', fontWeight: 700, fontSize: '0.95rem', mb: 1.5, pb: 0.5, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          {label}
        </Typography>
        {payload.map((entry, index) => (
          <Box key={`item-${index}`} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', my: 0.75 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: entry.color }} />
              <Typography sx={{ color: '#94A3B8', fontSize: '0.82rem' }}>
                {entry.name}:
              </Typography>
            </Box>
            <Typography sx={{ color: '#FFFFFF', fontWeight: 700, fontSize: '0.88rem' }}>
              {entry.dataKey === 'tonnage' ? `${Number(entry.value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT` : formatCurrency(entry.value)}
            </Typography>
          </Box>
        ))}
      </Box>
    );
  }
  return null;
};

export default function VolumeVsRevenueGrowthTab() {
  const [financialYear, setFinancialYear] = useState('FY 2026-27');
  const [periodType, setPeriodType] = useState('FULL_FY'); // 'FULL_FY' | 'MONTH'
  const [selectedMonth, setSelectedMonth] = useState('September');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [reportData, setReportData] = useState(null);

  // Fetch Report Data from authoritative backend endpoint
  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);

    try {
      const res = await axios.get(`${API_URL}/pie-chart/tonnage-revenue-summary`, {
        params: {
          financialYear,
          periodType,
          month: periodType === 'MONTH' ? selectedMonth : 'ALL'
        },
        timeout: 25000
      });

      if (res.data && res.data.success) {
        setReportData(res.data);
      } else {
        throw new Error(res.data?.message || 'Failed to fetch tonnage and revenue data');
      }
    } catch (err) {
      console.error('[VolumeVsRevenueGrowthTab] Fetch Error:', err);
      if (!silent) {
        setError(err.response?.data?.message || err.message || 'Error connecting to server');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [financialYear, periodType, selectedMonth]);

  // Initial fetch and trigger on filter change
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-time socket updates for live database-driven sync
  useEffect(() => {
    let socket;
    try {
      socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
      
      const handleLiveUpdate = () => {
        console.log('[VolumeVsRevenueGrowthTab] Real-time database update received');
        fetchData(true);
      };

      socket.on('cementUpdates', handleLiveUpdate);
      socket.on('cementEntriesUpdate', handleLiveUpdate);
      socket.on('billRegisterUpdates', handleLiveUpdate);
      socket.on('financialYearRowUpdated', handleLiveUpdate);

    } catch (e) {
      console.warn('[VolumeVsRevenueGrowthTab] Socket connection failed:', e);
    }

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [fetchData]);

  // Extract totals and chart data
  const totals = reportData?.totals || {
    totalTonnage: 0,
    totalRevenue: 0,
    tonnageDisplay: '0.00 MT',
    revenueDisplay: '₹0'
  };

  const chartData = useMemo(() => {
    if (!reportData?.monthlyData) return [];
    return reportData.monthlyData.map(item => ({
      name: item.month,
      monthShort: item.monthShort,
      tonnage: item.tonnage || 0,
      revenue: item.revenue || 0,
      tonnageDisplay: item.tonnageDisplay,
      revenueDisplay: item.revenueDisplay,
      isFuture: item.isFuture
    }));
  }, [reportData]);

  return (
    <Box sx={{ width: '100%', pb: 6, pt: 1 }}>
      {/* ── 1. FILTER SECTION ── */}
      <GlassCard sx={{ p: 2.5, mb: 3 }}>
        <Grid container spacing={2.5} alignItems="center">
          {/* Financial Year */}
          <Grid item xs={12} sm={4} md={3.5}>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.75 }}>
              FINANCIAL YEAR
            </Typography>
            <FormControl fullWidth size="small">
              <Select
                value={financialYear}
                onChange={(e) => setFinancialYear(e.target.value)}
                sx={{
                  bgcolor: 'rgba(15, 23, 42, 0.7)',
                  color: '#FFFFFF',
                  borderRadius: '10px',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  '& .MuiSelect-icon': { color: '#94A3B8' },
                  '&:hover': { borderColor: 'rgba(255, 255, 255, 0.25)' }
                }}
              >
                {FY_OPTIONS.map((fy) => (
                  <MenuItem key={fy} value={fy} sx={{ fontWeight: 600 }}>
                    {fy}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* Period Type: FULL FY / MONTH */}
          <Grid item xs={12} sm={4} md={3.5}>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.75 }}>
              PERIOD TYPE
            </Typography>
            <FormControl fullWidth size="small">
              <Select
                value={periodType}
                onChange={(e) => setPeriodType(e.target.value)}
                sx={{
                  bgcolor: 'rgba(15, 23, 42, 0.7)',
                  color: '#FFFFFF',
                  borderRadius: '10px',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  '& .MuiSelect-icon': { color: '#94A3B8' },
                  '&:hover': { borderColor: 'rgba(255, 255, 255, 0.25)' }
                }}
              >
                <MenuItem value="FULL_FY" sx={{ fontWeight: 600 }}>FULL FINANCIAL YEAR</MenuItem>
                <MenuItem value="MONTH" sx={{ fontWeight: 600 }}>MONTH</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {/* Month Selector (Only active in MONTH mode) */}
          {periodType === 'MONTH' && (
            <Grid item xs={12} sm={4} md={3.5}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.75 }}>
                MONTH
              </Typography>
              <FormControl fullWidth size="small">
                <Select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  sx={{
                    bgcolor: 'rgba(15, 23, 42, 0.7)',
                    color: '#FFFFFF',
                    borderRadius: '10px',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    '& .MuiSelect-icon': { color: '#94A3B8' },
                    '&:hover': { borderColor: 'rgba(255, 255, 255, 0.25)' }
                  }}
                >
                  {FY_MONTHS.map((m) => (
                    <MenuItem key={m} value={m} sx={{ fontWeight: 600 }}>
                      {m}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          )}

          {/* Refresh / Action Button */}
          <Grid item xs={12} sm={periodType === 'MONTH' ? 12 : 4} md={periodType === 'MONTH' ? 1.5 : 1.5} sx={{ display: 'flex', alignItems: 'flex-end' }}>
            <Button
              variant="outlined"
              fullWidth
              onClick={() => fetchData()}
              disabled={loading}
              startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
              sx={{
                height: 40,
                color: '#38BDF8',
                borderColor: 'rgba(56, 189, 248, 0.4)',
                borderRadius: '10px',
                fontWeight: 600,
                textTransform: 'none',
                '&:hover': {
                  borderColor: '#38BDF8',
                  bgcolor: 'rgba(56, 189, 248, 0.08)'
                }
              }}
            >
              Refresh
            </Button>
          </Grid>
        </Grid>
      </GlassCard>

      {/* ── 2. ERROR STATE ── */}
      {error && (
        <Box sx={{ p: 2, mb: 3, bgcolor: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '12px', color: '#FCA5A5' }}>
          <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>
            {error}
          </Typography>
        </Box>
      )}

      {/* ── 3. TOP SUMMARY CARDS (TOTAL TONNAGE & TOTAL REVENUE) ── */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {/* TOTAL TONNAGE / LIFTING */}
        <Grid item xs={12} sm={6}>
          <GlassCard
            sx={{
              p: 3,
              position: 'relative',
              overflow: 'hidden',
              borderLeft: '4px solid #10B981',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 12px 36px rgba(16, 185, 129, 0.2)'
              }
            }}
          >
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <Box
                  sx={{
                    p: 1,
                    borderRadius: '10px',
                    bgcolor: 'rgba(16, 185, 129, 0.15)',
                    color: '#10B981',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <LocalShippingIcon sx={{ fontSize: 24 }} />
                </Box>
                <Typography sx={{ color: '#94A3B8', fontWeight: 700, fontSize: '0.85rem', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                  TOTAL TONNAGE / LIFTING
                </Typography>
              </Box>
              <Chip
                label="Cement Register"
                size="small"
                sx={{
                  bgcolor: 'rgba(16, 185, 129, 0.12)',
                  color: '#34D399',
                  fontWeight: 600,
                  fontSize: '0.72rem',
                  border: '1px solid rgba(16, 185, 129, 0.25)'
                }}
              />
            </Stack>

            <Typography sx={{ fontSize: { xs: '1.85rem', md: '2.4rem' }, fontWeight: 800, color: '#10B981', letterSpacing: '-0.5px' }}>
              {loading ? (
                <CircularProgress size={28} sx={{ color: '#10B981' }} />
              ) : (
                formatMT(totals.totalTonnage)
              )}
            </Typography>
            <Typography sx={{ fontSize: '0.78rem', color: '#64748B', mt: 0.5, fontWeight: 500 }}>
              Authoritative sum of TOTAL MT for selected period
            </Typography>
          </GlassCard>
        </Grid>

        {/* TOTAL BILLED REVENUE */}
        <Grid item xs={12} sm={6}>
          <GlassCard
            sx={{
              p: 3,
              position: 'relative',
              overflow: 'hidden',
              borderLeft: '4px solid #8B5CF6',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 12px 36px rgba(139, 92, 246, 0.2)'
              }
            }}
          >
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <Box
                  sx={{
                    p: 1,
                    borderRadius: '10px',
                    bgcolor: 'rgba(139, 92, 246, 0.15)',
                    color: '#8B5CF6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <AccountBalanceWalletIcon sx={{ fontSize: 24 }} />
                </Box>
                <Typography sx={{ color: '#94A3B8', fontWeight: 700, fontSize: '0.85rem', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                  TOTAL BILLED REVENUE
                </Typography>
              </Box>
              <Chip
                label="Bill Register"
                size="small"
                sx={{
                  bgcolor: 'rgba(139, 92, 246, 0.12)',
                  color: '#A78BFA',
                  fontWeight: 600,
                  fontSize: '0.72rem',
                  border: '1px solid rgba(139, 92, 246, 0.25)'
                }}
              />
            </Stack>

            <Typography sx={{ fontSize: { xs: '1.85rem', md: '2.4rem' }, fontWeight: 800, color: '#A78BFA', letterSpacing: '-0.5px' }}>
              {loading ? (
                <CircularProgress size={28} sx={{ color: '#8B5CF6' }} />
              ) : (
                formatCurrency(totals.totalRevenue)
              )}
            </Typography>
            <Typography sx={{ fontSize: '0.78rem', color: '#64748B', mt: 0.5, fontWeight: 500 }}>
              Authoritative billed revenue from Bill Register
            </Typography>
          </GlassCard>
        </Grid>
      </Grid>

      {/* ── 4. COMBINED BAR GRAPH (DUAL-AXIS) ── */}
      <GlassCard sx={{ p: { xs: 2, md: 3 }, mb: 3.5 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" sx={{ mb: 3, gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                p: 1,
                borderRadius: '10px',
                bgcolor: 'rgba(56, 189, 248, 0.12)',
                color: '#38BDF8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <BarChartIcon sx={{ fontSize: 22 }} />
            </Box>
            <Box>
              <Typography sx={{ fontSize: '1.15rem', fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.2px' }}>
                TONNAGE & REVENUE
              </Typography>
              <Typography sx={{ fontSize: '0.8rem', color: '#94A3B8', fontWeight: 500 }}>
                {periodType === 'FULL_FY' ? `${financialYear} — Monthly Breakdown` : `${selectedMonth} (${financialYear})`}
              </Typography>
            </Box>
          </Box>

          {/* Legend Indicators */}
          <Stack direction="row" spacing={2.5} alignItems="center">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 14, height: 14, borderRadius: '4px', bgcolor: '#10B981' }} />
              <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: '#10B981' }}>
                TOTAL TONNAGE (MT)
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 14, height: 14, borderRadius: '4px', bgcolor: '#8B5CF6' }} />
              <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: '#A78BFA' }}>
                TOTAL BILLED REVENUE (₹)
              </Typography>
            </Box>
          </Stack>
        </Stack>

        {loading ? (
          <Box sx={{ height: 380, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CircularProgress size={40} sx={{ color: '#38BDF8' }} />
          </Box>
        ) : chartData.length === 0 ? (
          <Box sx={{ height: 380, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography sx={{ color: '#64748B', fontWeight: 600 }}>
              No data available for the selected period
            </Typography>
          </Box>
        ) : (
          <Box sx={{ width: '100%', height: { xs: 320, md: 420 } }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 20, right: 30, left: 10, bottom: 25 }}
                barGap={8}
                barCategoryGap="20%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.07)" vertical={false} />
                
                {/* X-Axis */}
                <XAxis
                  dataKey="name"
                  stroke="#94A3B8"
                  tick={{ fill: '#94A3B8', fontSize: 12, fontWeight: 600 }}
                  tickLine={false}
                  axisLine={{ stroke: 'rgba(255, 255, 255, 0.15)' }}
                />

                {/* Left Y-Axis: Tonnage (MT) */}
                <YAxis
                  yAxisId="left"
                  orientation="left"
                  stroke="#10B981"
                  tickFormatter={formatTonnageAxis}
                  tick={{ fill: '#10B981', fontSize: 11, fontWeight: 600 }}
                  tickLine={false}
                  axisLine={{ stroke: 'rgba(16, 185, 129, 0.4)' }}
                />

                {/* Right Y-Axis: Billed Revenue (₹) */}
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#8B5CF6"
                  tickFormatter={formatRevenueAxis}
                  tick={{ fill: '#A78BFA', fontSize: 11, fontWeight: 600 }}
                  tickLine={false}
                  axisLine={{ stroke: 'rgba(139, 92, 246, 0.4)' }}
                />

                <RechartsTooltip content={<CustomChartTooltip />} />

                {/* GREEN BAR: Total Tonnage / Lifting */}
                <Bar
                  yAxisId="left"
                  dataKey="tonnage"
                  name="Total Tonnage / Lifting"
                  fill="#10B981"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={55}
                />

                {/* PURPLE BAR: Total Billed Revenue */}
                <Bar
                  yAxisId="right"
                  dataKey="revenue"
                  name="Total Billed Revenue"
                  fill="#8B5CF6"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={55}
                />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        )}
      </GlassCard>

      {/* ── 5. MONTHLY BREAKDOWN TABLE ── */}
      <GlassCard sx={{ p: 2.5, overflow: 'hidden' }}>
        <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: '#FFFFFF', mb: 2 }}>
          {periodType === 'FULL_FY' ? 'Monthly Breakdown Table' : 'Selected Month Summary'}
        </Typography>

        <TableContainer sx={{ maxHeight: 400 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ bgcolor: 'rgba(15, 23, 42, 0.95)', color: '#94A3B8', fontWeight: 700, fontSize: '0.82rem', borderColor: 'rgba(255,255,255,0.1)' }}>
                  MONTH
                </TableCell>
                <TableCell align="right" sx={{ bgcolor: 'rgba(15, 23, 42, 0.95)', color: '#10B981', fontWeight: 700, fontSize: '0.82rem', borderColor: 'rgba(255,255,255,0.1)' }}>
                  TOTAL TONNAGE / LIFTING (MT)
                </TableCell>
                <TableCell align="right" sx={{ bgcolor: 'rgba(15, 23, 42, 0.95)', color: '#A78BFA', fontWeight: 700, fontSize: '0.82rem', borderColor: 'rgba(255,255,255,0.1)' }}>
                  TOTAL BILLED REVENUE (₹)
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {chartData.map((row, idx) => (
                <TableRow
                  key={row.name || idx}
                  sx={{
                    '&:nth-of-type(odd)': { bgcolor: 'rgba(255, 255, 255, 0.02)' },
                    '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.05)' },
                    transition: 'background-color 0.15s'
                  }}
                >
                  <TableCell sx={{ color: '#E2E8F0', fontWeight: 600, borderColor: 'rgba(255,255,255,0.06)' }}>
                    {row.name}
                  </TableCell>
                  <TableCell align="right" sx={{ color: '#10B981', fontWeight: 700, borderColor: 'rgba(255,255,255,0.06)' }}>
                    {formatMT(row.tonnage)}
                  </TableCell>
                  <TableCell align="right" sx={{ color: '#A78BFA', fontWeight: 700, borderColor: 'rgba(255,255,255,0.06)' }}>
                    {formatCurrency(row.revenue)}
                  </TableCell>
                </TableRow>
              ))}

              {/* Total Row */}
              <TableRow sx={{ bgcolor: 'rgba(30, 41, 59, 0.8)', borderTop: '2px solid rgba(255, 255, 255, 0.15)' }}>
                <TableCell sx={{ color: '#FFFFFF', fontWeight: 800, fontSize: '0.9rem', borderColor: 'rgba(255,255,255,0.15)' }}>
                  TOTAL ({periodType === 'FULL_FY' ? 'FULL FY' : selectedMonth})
                </TableCell>
                <TableCell align="right" sx={{ color: '#10B981', fontWeight: 800, fontSize: '0.95rem', borderColor: 'rgba(255,255,255,0.15)' }}>
                  {formatMT(totals.totalTonnage)}
                </TableCell>
                <TableCell align="right" sx={{ color: '#A78BFA', fontWeight: 800, fontSize: '0.95rem', borderColor: 'rgba(255,255,255,0.15)' }}>
                  {formatCurrency(totals.totalRevenue)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </GlassCard>
    </Box>
  );
}
