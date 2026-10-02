import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Grid, Select, MenuItem, FormControl, InputLabel,
  CircularProgress, Button, TableContainer, Table, TableHead, TableRow,
  TableCell, TableBody, Card, CardContent, Divider, Stack, Chip, Alert
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CalculateIcon from '@mui/icons-material/Calculate';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import ScaleIcon from '@mui/icons-material/Scale';
import RouteIcon from '@mui/icons-material/AltRoute';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import FunctionsIcon from '@mui/icons-material/Functions';
import BarChartIcon from '@mui/icons-material/BarChart';
import TableChartIcon from '@mui/icons-material/TableChart';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Cell
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

// Custom KM formatter
const formatKM = (val) => {
  if (val === null || val === undefined || isNaN(val)) return '0 KM';
  return `${Number(val).toLocaleString('en-IN', {
    maximumFractionDigits: 0
  })} KM`;
};

// Custom Rate / PTPK formatter
const formatRate = (val, suffix = '') => {
  if (val === null || val === undefined || isNaN(val) || !isFinite(val)) return 'N/A';
  return `₹${Number(val).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}${suffix}`;
};

// Custom Ton/KM ratio formatter
const formatRatio = (val) => {
  if (val === null || val === undefined || isNaN(val) || !isFinite(val)) return 'N/A';
  return Number(val).toFixed(4);
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
    const data = payload[0].payload;
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
        <Typography sx={{ color: '#E2E8F0', fontWeight: 700, fontSize: '0.95rem', mb: 1, pb: 0.5, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          {label}
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', my: 0.5 }}>
          <Typography sx={{ color: '#94A3B8', fontSize: '0.82rem' }}>PTPK:</Typography>
          <Typography sx={{ color: '#38BDF8', fontWeight: 700, fontSize: '0.88rem' }}>
            {formatRate(data.ptpk, ' / TON / KM')}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', my: 0.5 }}>
          <Typography sx={{ color: '#94A3B8', fontSize: '0.82rem' }}>Revenue / MT:</Typography>
          <Typography sx={{ color: '#34D399', fontWeight: 600, fontSize: '0.82rem' }}>
            {formatRate(data.revenuePerMT, ' / MT')}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', my: 0.5 }}>
          <Typography sx={{ color: '#94A3B8', fontSize: '0.82rem' }}>Total Revenue:</Typography>
          <Typography sx={{ color: '#CBD5E1', fontSize: '0.82rem' }}>
            {formatCurrency(data.revenue)}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', my: 0.5 }}>
          <Typography sx={{ color: '#94A3B8', fontSize: '0.82rem' }}>Total MT:</Typography>
          <Typography sx={{ color: '#CBD5E1', fontSize: '0.82rem' }}>
            {formatMT(data.tonnage)}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', my: 0.5 }}>
          <Typography sx={{ color: '#94A3B8', fontSize: '0.82rem' }}>Total KM:</Typography>
          <Typography sx={{ color: '#CBD5E1', fontSize: '0.82rem' }}>
            {formatKM(data.km)}
          </Typography>
        </Box>
      </Box>
    );
  }
  return null;
};

export default function PtpkAnalysisTab() {
  const [financialYear, setFinancialYear] = useState('FY 2026-27');
  const [periodType, setPeriodType] = useState('MONTH'); // 'FULL_FY' | 'MONTH'
  const [selectedMonth, setSelectedMonth] = useState('September');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [reportData, setReportData] = useState(null);

  // Fetch PTPK Data from authoritative backend endpoint
  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);

    try {
      const res = await axios.get(`${API_URL}/pie-chart/ptpk-summary`, {
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
        throw new Error(res.data?.message || 'Failed to fetch PTPK data');
      }
    } catch (err) {
      console.error('[PTPK Analysis] Fetch error:', err);
      setError(err.response?.data?.error || err.message || 'Error connecting to server');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [financialYear, periodType, selectedMonth]);

  // Initial load & whenever filters change
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-time socket sync
  useEffect(() => {
    let socket;
    try {
      socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });

      const handleUpdate = () => {
        fetchData(true);
      };

      socket.on('cementRegisterUpdate', handleUpdate);
      socket.on('billRegisterUpdate', handleUpdate);
      socket.on('partyPaymentUpdate', handleUpdate);
      socket.on('advanceUpdate', handleUpdate);
    } catch (e) {
      console.warn('[PTPK Analysis] Socket connection error:', e);
    }

    return () => {
      if (socket) {
        socket.off('cementRegisterUpdate');
        socket.off('billRegisterUpdate');
        socket.off('partyPaymentUpdate');
        socket.off('advanceUpdate');
        socket.disconnect();
      }
    };
  }, [fetchData]);

  const totals = reportData?.totals || {};
  const monthlyData = reportData?.monthlyData || [];
  const chartData = reportData?.chartData || [];

  return (
    <Box sx={{ width: '100%', py: 1 }}>
      {/* ── 1. FILTER & CONTROL TOOLBAR ── */}
      <GlassCard sx={{ p: 2.5, mb: 3 }}>
        <Grid container spacing={2.5} alignItems="center">
          {/* Financial Year Select */}
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel sx={{ color: '#94A3B8', '&.Mui-focused': { color: '#38BDF8' } }}>
                Financial Year
              </InputLabel>
              <Select
                value={financialYear}
                label="Financial Year"
                onChange={(e) => setFinancialYear(e.target.value)}
                sx={{
                  color: '#FFFFFF',
                  bgcolor: 'rgba(30, 41, 59, 0.7)',
                  borderRadius: '10px',
                  '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255, 255, 255, 0.12)' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#38BDF8' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#38BDF8' },
                  '.MuiSvgIcon-root': { color: '#94A3B8' }
                }}
              >
                {FY_OPTIONS.map(fy => (
                  <MenuItem key={fy} value={fy} sx={{ bgcolor: '#0F172A', color: '#FFF' }}>
                    {fy}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* Period Type Select */}
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel sx={{ color: '#94A3B8', '&.Mui-focused': { color: '#38BDF8' } }}>
                Period Type
              </InputLabel>
              <Select
                value={periodType}
                label="Period Type"
                onChange={(e) => setPeriodType(e.target.value)}
                sx={{
                  color: '#FFFFFF',
                  bgcolor: 'rgba(30, 41, 59, 0.7)',
                  borderRadius: '10px',
                  '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255, 255, 255, 0.12)' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#38BDF8' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#38BDF8' },
                  '.MuiSvgIcon-root': { color: '#94A3B8' }
                }}
              >
                <MenuItem value="FULL_FY" sx={{ bgcolor: '#0F172A', color: '#FFF' }}>
                  FULL FINANCIAL YEAR
                </MenuItem>
                <MenuItem value="MONTH" sx={{ bgcolor: '#0F172A', color: '#FFF' }}>
                  MONTH
                </MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {/* Month Selector (when Period Type is MONTH) */}
          {periodType === 'MONTH' && (
            <Grid item xs={12} sm={6} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel sx={{ color: '#94A3B8', '&.Mui-focused': { color: '#38BDF8' } }}>
                  Month
                </InputLabel>
                <Select
                  value={selectedMonth}
                  label="Month"
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  sx={{
                    color: '#FFFFFF',
                    bgcolor: 'rgba(30, 41, 59, 0.7)',
                    borderRadius: '10px',
                    '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255, 255, 255, 0.12)' },
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#38BDF8' },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#38BDF8' },
                    '.MuiSvgIcon-root': { color: '#94A3B8' }
                  }}
                >
                  {FY_MONTHS.map(m => (
                    <MenuItem key={m} value={m} sx={{ bgcolor: '#0F172A', color: '#FFF' }}>
                      {m}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          )}

          {/* Refresh Action */}
          <Grid item xs={12} sm={6} md={periodType === 'MONTH' ? 3 : 6} sx={{ display: 'flex', justifyContent: { xs: 'flex-start', md: 'flex-end' }, alignItems: 'center', gap: 1.5 }}>
            <Button
              variant="outlined"
              onClick={() => fetchData()}
              disabled={loading}
              startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
              sx={{
                color: '#38BDF8',
                borderColor: 'rgba(56, 189, 248, 0.4)',
                borderRadius: '10px',
                textTransform: 'none',
                fontWeight: 600,
                px: 2.5,
                py: 0.8,
                '&:hover': {
                  borderColor: '#38BDF8',
                  bgcolor: 'rgba(56, 189, 248, 0.08)'
                }
              }}
            >
              {loading ? 'Refreshing...' : 'Refresh Data'}
            </Button>
          </Grid>
        </Grid>
      </GlassCard>

      {/* ── Error Banner ── */}
      {error && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: '12px', bgcolor: 'rgba(239, 68, 68, 0.15)', color: '#FCA5A5', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
          {error}
        </Alert>
      )}

      {/* ── Active Period Label ── */}
      <Box sx={{ mb: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h6" sx={{ color: '#F1F5F9', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
          <CalculateIcon sx={{ color: '#38BDF8' }} />
          PTPK Analysis — {reportData?.period?.display || financialYear}
        </Typography>
        <Chip
          label="100% Database-Driven • Live Rate Chart & Bill Register"
          size="small"
          sx={{
            bgcolor: 'rgba(56, 189, 248, 0.12)',
            color: '#38BDF8',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            fontWeight: 600
          }}
        />
      </Box>

      {/* ── 2. PRIMARY THREE PILLARS: TOTAL REVENUE, TOTAL MT, TOTAL KM ── */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {/* TOTAL REVENUE */}
        <Grid item xs={12} sm={4}>
          <GlassCard sx={{ p: 2.5, height: '100%', borderLeft: '4px solid #10B981' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
              <Typography variant="caption" sx={{ color: '#94A3B8', fontWeight: 700, letterSpacing: '0.5px' }}>
                TOTAL REVENUE
              </Typography>
              <AccountBalanceWalletIcon sx={{ color: '#10B981', fontSize: 24 }} />
            </Box>
            <Typography variant="h4" sx={{ fontWeight: 800, color: '#10B981', my: 1, letterSpacing: '-0.5px' }}>
              {loading ? <CircularProgress size={28} sx={{ color: '#10B981' }} /> : formatCurrency(totals.totalRevenue)}
            </Typography>
            <Divider sx={{ my: 1.5, borderColor: 'rgba(255, 255, 255, 0.08)' }} />
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="caption" sx={{ color: '#64748B' }}>Source</Typography>
              <Chip label="Bill Register (Authoritative)" size="small" sx={{ height: 20, fontSize: '0.7rem', bgcolor: 'rgba(16, 185, 129, 0.12)', color: '#34D399' }} />
            </Stack>
          </GlassCard>
        </Grid>

        {/* TOTAL MT */}
        <Grid item xs={12} sm={4}>
          <GlassCard sx={{ p: 2.5, height: '100%', borderLeft: '4px solid #F59E0B' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
              <Typography variant="caption" sx={{ color: '#94A3B8', fontWeight: 700, letterSpacing: '0.5px' }}>
                TOTAL MT
              </Typography>
              <ScaleIcon sx={{ color: '#F59E0B', fontSize: 24 }} />
            </Box>
            <Typography variant="h4" sx={{ fontWeight: 800, color: '#F59E0B', my: 1, letterSpacing: '-0.5px' }}>
              {loading ? <CircularProgress size={28} sx={{ color: '#F59E0B' }} /> : formatMT(totals.totalTonnage)}
            </Typography>
            <Divider sx={{ my: 1.5, borderColor: 'rgba(255, 255, 255, 0.08)' }} />
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="caption" sx={{ color: '#64748B' }}>Source</Typography>
              <Chip label="Cement Register (TOTAL MT)" size="small" sx={{ height: 20, fontSize: '0.7rem', bgcolor: 'rgba(245, 158, 11, 0.12)', color: '#FBBF24' }} />
            </Stack>
          </GlassCard>
        </Grid>

        {/* TOTAL KM */}
        <Grid item xs={12} sm={4}>
          <GlassCard sx={{ p: 2.5, height: '100%', borderLeft: '4px solid #8B5CF6' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
              <Typography variant="caption" sx={{ color: '#94A3B8', fontWeight: 700, letterSpacing: '0.5px' }}>
                TOTAL KM
              </Typography>
              <RouteIcon sx={{ color: '#8B5CF6', fontSize: 24 }} />
            </Box>
            <Typography variant="h4" sx={{ fontWeight: 800, color: '#A78BFA', my: 1, letterSpacing: '-0.5px' }}>
              {loading ? <CircularProgress size={28} sx={{ color: '#8B5CF6' }} /> : formatKM(totals.totalKM)}
            </Typography>
            <Divider sx={{ my: 1.5, borderColor: 'rgba(255, 255, 255, 0.08)' }} />
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="caption" sx={{ color: '#64748B' }}>Source</Typography>
              <Chip label="Cement Register + Rate Chart" size="small" sx={{ height: 20, fontSize: '0.7rem', bgcolor: 'rgba(139, 92, 246, 0.12)', color: '#C4B5FD' }} />
            </Stack>
          </GlassCard>
        </Grid>
      </Grid>

      {/* ── 3. INTERMEDIATE RATES: REVENUE / MT & TON / KM ── */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {/* REVENUE / MT */}
        <Grid item xs={12} sm={6}>
          <GlassCard sx={{ p: 2.5, bgcolor: 'rgba(15, 23, 42, 0.85)', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2" sx={{ color: '#94A3B8', fontWeight: 700 }}>
                REVENUE / MT (REVENUE PER TON)
              </Typography>
              <Chip label="Revenue ÷ MT" size="small" sx={{ height: 22, fontSize: '0.72rem', bgcolor: 'rgba(56, 189, 248, 0.1)', color: '#38BDF8' }} />
            </Box>
            <Typography variant="h4" sx={{ fontWeight: 800, color: '#38BDF8', my: 1 }}>
              {loading ? <CircularProgress size={24} sx={{ color: '#38BDF8' }} /> : formatRate(totals.revenuePerMT, ' / MT')}
            </Typography>
            <Typography variant="caption" sx={{ color: '#64748B', display: 'block', mt: 0.5 }}>
              Formula: {formatCurrency(totals.totalRevenue)} ÷ {formatMT(totals.totalTonnage)}
            </Typography>
          </GlassCard>
        </Grid>

        {/* TON / KM */}
        <Grid item xs={12} sm={6}>
          <GlassCard sx={{ p: 2.5, bgcolor: 'rgba(15, 23, 42, 0.85)', border: '1px solid rgba(168, 85, 247, 0.2)' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2" sx={{ color: '#94A3B8', fontWeight: 700 }}>
                TON / KM (TON PER KILOMETRE)
              </Typography>
              <Chip label="MT ÷ KM" size="small" sx={{ height: 22, fontSize: '0.72rem', bgcolor: 'rgba(168, 85, 247, 0.1)', color: '#C084FC' }} />
            </Box>
            <Typography variant="h4" sx={{ fontWeight: 800, color: '#C084FC', my: 1 }}>
              {loading ? <CircularProgress size={24} sx={{ color: '#C084FC' }} /> : formatRatio(totals.tonPerKM)}
            </Typography>
            <Typography variant="caption" sx={{ color: '#64748B', display: 'block', mt: 0.5 }}>
              Formula: {formatMT(totals.totalTonnage)} ÷ {formatKM(totals.totalKM)}
            </Typography>
          </GlassCard>
        </Grid>
      </Grid>

      {/* ── 4. HERO SECTION: PTPK (PER TON PER KILOMETRE) ── */}
      <GlassCard
        sx={{
          p: 3.5,
          mb: 3,
          background: 'linear-gradient(135deg, rgba(30, 58, 138, 0.4) 0%, rgba(15, 23, 42, 0.95) 100%)',
          border: '1.5px solid rgba(56, 189, 248, 0.35)',
          boxShadow: '0 12px 40px 0 rgba(0, 0, 0, 0.6)'
        }}
      >
        <Grid container spacing={3} alignItems="center">
          <Grid item xs={12} md={6}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: '12px',
                  bgcolor: 'rgba(56, 189, 248, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#38BDF8'
                }}
              >
                <TrendingUpIcon sx={{ fontSize: 28 }} />
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: '#38BDF8', fontWeight: 800, letterSpacing: '1px' }}>
                  FINAL RESULT
                </Typography>
                <Typography variant="h6" sx={{ color: '#FFFFFF', fontWeight: 800 }}>
                  PTPK (PER TON PER KILOMETRE)
                </Typography>
              </Box>
            </Stack>

            <Typography
              variant="h2"
              sx={{
                fontWeight: 900,
                color: '#38BDF8',
                letterSpacing: '-1px',
                my: 1.5,
                textShadow: '0 0 30px rgba(56, 189, 248, 0.35)'
              }}
            >
              {loading ? (
                <CircularProgress size={42} sx={{ color: '#38BDF8' }} />
              ) : (
                formatRate(totals.ptpk, ' / TON / KM')
              )}
            </Typography>

            <Typography variant="body2" sx={{ color: '#94A3B8', mt: 1 }}>
              Authoritative revenue generated per metric ton per kilometre operated for {reportData?.period?.display || financialYear}.
            </Typography>
          </Grid>

          {/* Mathematical Formula Breakdown Box */}
          <Grid item xs={12} md={6}>
            <Box
              sx={{
                p: 2.5,
                borderRadius: '14px',
                bgcolor: 'rgba(15, 23, 42, 0.9)',
                border: '1px solid rgba(255, 255, 255, 0.12)'
              }}
            >
              <Typography variant="subtitle2" sx={{ color: '#E2E8F0', fontWeight: 700, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                <FunctionsIcon sx={{ color: '#38BDF8', fontSize: 20 }} />
                Mathematical Derivation & Formula
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2 }}>
                {/* Step 1 */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1, borderRadius: '8px', bgcolor: 'rgba(255, 255, 255, 0.03)' }}>
                  <Typography variant="caption" sx={{ color: '#94A3B8' }}>Step 1: Revenue per Ton</Typography>
                  <Typography variant="caption" sx={{ color: '#34D399', fontWeight: 700 }}>
                    TOTAL REVENUE ÷ TOTAL MT = {formatRate(totals.revenuePerMT, ' / MT')}
                  </Typography>
                </Box>

                {/* Step 2 */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1, borderRadius: '8px', bgcolor: 'rgba(255, 255, 255, 0.03)' }}>
                  <Typography variant="caption" sx={{ color: '#94A3B8' }}>Step 2: Ton per KM</Typography>
                  <Typography variant="caption" sx={{ color: '#C084FC', fontWeight: 700 }}>
                    TOTAL MT ÷ TOTAL KM = {formatRatio(totals.tonPerKM)}
                  </Typography>
                </Box>

                {/* Step 3 */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1, borderRadius: '8px', bgcolor: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
                  <Typography variant="caption" sx={{ color: '#38BDF8', fontWeight: 700 }}>Step 3: Final PTPK</Typography>
                  <Typography variant="caption" sx={{ color: '#38BDF8', fontWeight: 800 }}>
                    TOTAL REVENUE ÷ TOTAL KM = {formatRate(totals.ptpk, ' / TON / KM')}
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Grid>
        </Grid>
      </GlassCard>

      {/* ── 5. BAR GRAPH: MONTHLY PTPK TREND ── */}
      <GlassCard sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="subtitle1" sx={{ color: '#FFFFFF', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
            <BarChartIcon sx={{ color: '#38BDF8' }} />
            Monthly PTPK Trend ({financialYear})
          </Typography>
          <Chip label="Actual Database Values" size="small" sx={{ bgcolor: 'rgba(255, 255, 255, 0.06)', color: '#94A3B8', fontSize: '0.72rem' }} />
        </Box>

        <Box sx={{ width: '100%', height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 15, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.06)" />
              <XAxis
                dataKey="monthShort"
                stroke="#64748B"
                fontSize={12}
                tickLine={false}
              />
              <YAxis
                stroke="#64748B"
                fontSize={12}
                tickLine={false}
                tickFormatter={(v) => `₹${v}`}
              />
              <RechartsTooltip content={<CustomChartTooltip />} />
              <Bar dataKey="ptpk" name="PTPK (₹/Ton/KM)" radius={[6, 6, 0, 0]}>
                {chartData.map((entry, index) => {
                  const isSelected = periodType === 'MONTH' && entry.month === selectedMonth;
                  return (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.isFuture ? 'rgba(100, 116, 139, 0.2)' : isSelected ? '#38BDF8' : '#0284C7'}
                      stroke={isSelected ? '#FFFFFF' : 'none'}
                      strokeWidth={isSelected ? 2 : 0}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </GlassCard>

      {/* ── 6. MONTHLY BREAKDOWN TABLE ── */}
      <GlassCard sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="subtitle1" sx={{ color: '#FFFFFF', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
            <TableChartIcon sx={{ color: '#38BDF8' }} />
            Financial Year Monthly Breakdown ({financialYear})
          </Typography>
          <Typography variant="caption" sx={{ color: '#64748B' }}>
            All 12 Months • April {financialYear.split(' ')[1]?.split('-')[0]} to March {financialYear.split(' ')[1]?.split('-')[1]}
          </Typography>
        </Box>

        <TableContainer sx={{ borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <Table size="small">
            <TableHead sx={{ bgcolor: 'rgba(30, 41, 59, 0.8)' }}>
              <TableRow>
                <TableCell sx={{ color: '#94A3B8', fontWeight: 700 }}>MONTH</TableCell>
                <TableCell align="right" sx={{ color: '#10B981', fontWeight: 700 }}>TOTAL REVENUE</TableCell>
                <TableCell align="right" sx={{ color: '#F59E0B', fontWeight: 700 }}>TOTAL MT</TableCell>
                <TableCell align="right" sx={{ color: '#A78BFA', fontWeight: 700 }}>TOTAL KM</TableCell>
                <TableCell align="right" sx={{ color: '#38BDF8', fontWeight: 700 }}>REVENUE / MT</TableCell>
                <TableCell align="right" sx={{ color: '#C084FC', fontWeight: 700 }}>TON / KM</TableCell>
                <TableCell align="right" sx={{ color: '#38BDF8', fontWeight: 800 }}>PTPK</TableCell>
                <TableCell align="right" sx={{ color: '#64748B', fontWeight: 600 }}>TRIPS</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {monthlyData.map((row, idx) => {
                const isSelected = periodType === 'MONTH' && row.month === selectedMonth;
                return (
                  <TableRow
                    key={row.month || idx}
                    sx={{
                      bgcolor: isSelected ? 'rgba(56, 189, 248, 0.12)' : idx % 2 === 0 ? 'rgba(15, 23, 42, 0.4)' : 'rgba(30, 41, 59, 0.2)',
                      borderLeft: isSelected ? '3px solid #38BDF8' : 'none',
                      '&:hover': { bgcolor: 'rgba(56, 189, 248, 0.08)' }
                    }}
                  >
                    <TableCell sx={{ color: isSelected ? '#38BDF8' : '#F8FAFC', fontWeight: isSelected ? 800 : 600 }}>
                      {row.month}
                      {isSelected && <Chip label="Selected" size="small" sx={{ ml: 1, height: 18, fontSize: '0.65rem', bgcolor: '#38BDF8', color: '#0F172A', fontWeight: 700 }} />}
                      {row.isFuture && <Chip label="Future" size="small" sx={{ ml: 1, height: 18, fontSize: '0.65rem', bgcolor: 'rgba(255, 255, 255, 0.06)', color: '#64748B' }} />}
                    </TableCell>
                    <TableCell align="right" sx={{ color: '#10B981', fontWeight: 600 }}>
                      {row.isFuture ? '-' : formatCurrency(row.revenue)}
                    </TableCell>
                    <TableCell align="right" sx={{ color: '#F59E0B', fontWeight: 600 }}>
                      {row.isFuture ? '-' : formatMT(row.tonnage)}
                    </TableCell>
                    <TableCell align="right" sx={{ color: '#A78BFA', fontWeight: 600 }}>
                      {row.isFuture ? '-' : formatKM(row.km)}
                    </TableCell>
                    <TableCell align="right" sx={{ color: '#38BDF8', fontWeight: 600 }}>
                      {row.isFuture ? '-' : formatRate(row.revenuePerMT, ' / MT')}
                    </TableCell>
                    <TableCell align="right" sx={{ color: '#C084FC', fontWeight: 600 }}>
                      {row.isFuture ? '-' : formatRatio(row.tonPerKM)}
                    </TableCell>
                    <TableCell align="right" sx={{ color: '#38BDF8', fontWeight: 800 }}>
                      {row.isFuture ? '-' : formatRate(row.ptpk, ' / TON / KM')}
                    </TableCell>
                    <TableCell align="right" sx={{ color: '#94A3B8' }}>
                      {row.isFuture ? '-' : row.trips}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </GlassCard>
    </Box>
  );
}
