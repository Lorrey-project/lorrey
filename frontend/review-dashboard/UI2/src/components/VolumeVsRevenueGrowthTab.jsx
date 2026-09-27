import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Grid, Select, MenuItem, TextField, CircularProgress,
  Button, TableContainer, Table, TableHead, TableRow, TableCell,
  TableBody, Chip, Alert, Card, Divider, Stack, Dialog,
  DialogTitle, DialogContent, DialogActions, TablePagination, Tooltip as MuiTooltip
} from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import RemoveIcon from '@mui/icons-material/Remove';
import RefreshIcon from '@mui/icons-material/Refresh';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import AssessmentIcon from '@mui/icons-material/Assessment';
import SpeedIcon from '@mui/icons-material/Speed';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import BarChartIcon from '@mui/icons-material/BarChart';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import DateRangeIcon from '@mui/icons-material/DateRange';
import ViewWeekIcon from '@mui/icons-material/ViewWeek';
import TodayIcon from '@mui/icons-material/Today';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer, Cell, ReferenceLine
} from 'recharts';
import axios from 'axios';
import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const SOCKET_URL = import.meta.env.VITE_SOCKET_IO_URL || import.meta.env.VITE_API_URL || 'http://localhost:5000';

const MONTHS = [
  "April", "May", "June", "July", "August", "September",
  "October", "November", "December", "January", "February", "March"
];

const FY_OPTIONS = [
  "FY 2026-27",
  "FY 2025-26",
  "FY 2024-25",
  "FY 2023-24",
  "FY 2022-23",
  "FY 2021-22"
];

const WEEKS = [
  { value: '1', label: 'Week 1 (Day 1 - 7)' },
  { value: '2', label: 'Week 2 (Day 8 - 14)' },
  { value: '3', label: 'Week 3 (Day 15 - 21)' },
  { value: '4', label: 'Week 4 (Day 22 - 28)' },
  { value: '5', label: 'Week 5 (Day 29 - End)' }
];

const formatCurrency = (val) => {
  if (val === null || val === undefined || isNaN(val)) return '₹0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(val || 0);
};

const formatNumber = (val, decimals = 2) => {
  if (val === null || val === undefined || isNaN(val)) return '0.00';
  return Number(val).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
};

const formatPct = (val) => {
  if (val === null || val === undefined || isNaN(Number(val))) return 'N/A';
  const num = Number(val);
  const prefix = num > 0 ? '+' : '';
  return `${prefix}${num.toFixed(2)}%`;
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

export default function VolumeVsRevenueGrowthTab() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Dynamic Today Date (YYYY-MM-DD)
  const todayIso = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

  // Comparison Parameters State
  const [tyFY, setTyFY] = useState('FY 2026-27');
  const [pyFY, setPyFY] = useState('FY 2025-26');
  const [periodType, setPeriodType] = useState('MONTHLY'); // 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'FULL_FY'
  
  // Independent Month Selectors
  const [tyMonth, setTyMonth] = useState('September');
  const [pyMonth, setPyMonth] = useState('August');

  // Independent Week Selectors
  const [tyWeek, setTyWeek] = useState('1');
  const [pyWeek, setPyWeek] = useState('1');

  // Independent Date Selectors
  const [tyDate, setTyDate] = useState(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });
  const [pyDate, setPyDate] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });

  // Data Response
  const [data, setData] = useState(null);

  // Source Records Modal State
  const [recordsModalOpen, setRecordsModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalRecords, setModalRecords] = useState([]);
  const [modalType, setModalType] = useState('cement'); // 'cement' | 'bills' | 'deductions'
  const [modalPage, setModalPage] = useState(0);
  const [modalRowsPerPage, setModalRowsPerPage] = useState(10);

  const fetchGrowthData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/pie-chart/growth-analysis`, {
        params: {
          tyFY,
          pyFY,
          periodType,
          tyMonth,
          pyMonth,
          tyWeek,
          pyWeek,
          tyDate,
          pyDate
        },
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      if (res.data && res.data.success) {
        setData(res.data);
      } else {
        setError(res.data?.error || 'Failed to load growth analysis data');
      }
    } catch (err) {
      console.error('[GrowthAnalysis] Fetch Error:', err);
      setError(err.response?.data?.error || err.message || 'Error fetching growth analysis');
    } finally {
      setLoading(false);
    }
  }, [tyFY, pyFY, periodType, tyMonth, pyMonth, tyWeek, pyWeek, tyDate, pyDate]);

  useEffect(() => {
    fetchGrowthData();
  }, [fetchGrowthData]);

  // Real-time socket auto-update
  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    const handleUpdate = () => {
      fetchGrowthData();
    };
    socket.on('cementUpdates', handleUpdate);
    socket.on('fyDetailsUpdates', handleUpdate);
    socket.on('billUpdates', handleUpdate);
    socket.on('accountDetailsUpdate', handleUpdate);

    return () => {
      socket.off('cementUpdates', handleUpdate);
      socket.off('fyDetailsUpdates', handleUpdate);
      socket.off('billUpdates', handleUpdate);
      socket.off('accountDetailsUpdate', handleUpdate);
      socket.disconnect();
    };
  }, [fetchGrowthData]);

  const ty = data?.ty || {};
  const py = data?.py || {};
  const comp = data?.comparison || {};
  const trend = data?.trend || [];

  const pyLabel = py.headerLabel || pyFY;
  const tyLabel = ty.headerLabel || tyFY;

  // BAR GRAPH 1: Total Tonnage Comparison Data (MT)
  const tonnageBarChartData = useMemo(() => {
    return [
      {
        period: pyLabel,
        tonnage: py.tonnage || 0,
        fill: '#94a3b8'
      },
      {
        period: tyLabel,
        tonnage: ty.tonnage || 0,
        fill: '#38bdf8'
      }
    ];
  }, [ty, py, tyLabel, pyLabel]);

  // BAR GRAPH 2: Total Billed Revenue Comparison Data (₹ Lakhs)
  const revenueBarChartData = useMemo(() => {
    return [
      {
        period: pyLabel,
        revenue: Math.round(((py.revenue || 0) / 100000) * 100) / 100,
        rawRevenue: py.revenue || 0,
        fill: '#94a3b8'
      },
      {
        period: tyLabel,
        revenue: Math.round(((ty.revenue || 0) / 100000) * 100) / 100,
        rawRevenue: ty.revenue || 0,
        fill: '#10b981'
      }
    ];
  }, [ty, py, tyLabel, pyLabel]);

  // BAR GRAPH 3: Growth Rates Comparison Data (%)
  const growthRatesChartData = useMemo(() => {
    const isNum = (v) => v !== null && v !== undefined && !isNaN(Number(v));
    return [
      {
        name: 'Tonnage (Lifting) Growth',
        growth: isNum(comp.volumeGrowthPct) ? Number(comp.volumeGrowthPct) : 0,
        color: (comp.volumeGrowthPct || 0) >= 0 ? '#38bdf8' : '#f43f5e',
        hasData: isNum(comp.volumeGrowthPct)
      },
      {
        name: 'Billed Revenue Growth',
        growth: isNum(comp.revenueGrowthPct) ? Number(comp.revenueGrowthPct) : 0,
        color: (comp.revenueGrowthPct || 0) >= 0 ? '#10b981' : '#f43f5e',
        hasData: isNum(comp.revenueGrowthPct)
      },
      {
        name: 'Revenue / MT Growth (Diagnostic)',
        growth: isNum(comp.revPerMtGrowthPct) ? Number(comp.revPerMtGrowthPct) : 0,
        color: (comp.revPerMtGrowthPct || 0) >= 0 ? '#a855f7' : '#f43f5e',
        hasData: isNum(comp.revPerMtGrowthPct)
      }
    ];
  }, [comp]);

  const selectStyle = {
    color: '#FFF',
    fontSize: '0.85rem',
    bgcolor: 'rgba(255,255,255,0.05)',
    borderRadius: '8px',
    '& .MuiSelect-select': { py: 1, px: 1.5 },
    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.3)' },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#8b5cf6' },
    '& .MuiSvgIcon-root': { color: '#AAB4C0' }
  };

  const openSourceModal = (type, title, records) => {
    setModalType(type);
    setModalTitle(title);
    setModalRecords(records || []);
    setModalPage(0);
    setRecordsModalOpen(true);
  };

  return (
    <Box sx={{ width: '100%', pb: 6 }}>
      
      {/* ── TOP FILTER CONTROL PANEL (NO SITE FILTER) ─────────────────────── */}
      <GlassCard sx={{ p: 2.5, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <FilterAltIcon sx={{ color: '#8b5cf6', fontSize: '1.25rem' }} />
            <Typography variant="subtitle1" fontWeight={700} sx={{ color: '#FFF' }}>
              Comparative Analytics Parameters
            </Typography>
            <Chip
              size="small"
              label="Primary Growth Basis: Actual Total Tonnage (Cement Register) vs Actual Billed Revenue (Bill Register)"
              sx={{ bgcolor: 'rgba(139, 92, 246, 0.15)', color: '#c084fc', fontSize: '0.72rem', fontWeight: 600, border: '1px solid rgba(139, 92, 246, 0.3)' }}
            />
            <Chip
              size="small"
              label="No Assumed Fixed Rates (Zero ₹600/MT Assumption)"
              sx={{ bgcolor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontSize: '0.7rem', fontWeight: 600, border: '1px solid rgba(16, 185, 129, 0.3)' }}
            />
          </Box>
          <Button
            size="small"
            variant="outlined"
            startIcon={<RefreshIcon fontSize="small" />}
            onClick={fetchGrowthData}
            disabled={loading}
            sx={{
              color: '#FFF',
              borderColor: 'rgba(255,255,255,0.2)',
              textTransform: 'none',
              fontSize: '0.8rem',
              '&:hover': { borderColor: '#8b5cf6', bgcolor: 'rgba(139, 92, 246, 0.1)' }
            }}
          >
            {loading ? 'Refreshing...' : 'Refresh Data'}
          </Button>
        </Box>

        <Grid container spacing={2} alignItems="center">
          {/* Target Year (TY) Selector */}
          <Grid item xs={12} sm={6} md={periodType === 'FULL_FY' ? 4 : 2.4}>
            <Typography variant="caption" sx={{ color: '#AAB4C0', mb: 0.5, display: 'block', fontWeight: 600 }}>
              TARGET / CURRENT FY (TY)
            </Typography>
            <Select
              fullWidth
              value={tyFY}
              onChange={(e) => setTyFY(e.target.value)}
              sx={selectStyle}
            >
              {FY_OPTIONS.map(fy => (
                <MenuItem key={`ty-${fy}`} value={fy}>{fy}</MenuItem>
              ))}
            </Select>
          </Grid>

          {/* Comparison / Previous FY (PY) Selector */}
          <Grid item xs={12} sm={6} md={periodType === 'FULL_FY' ? 4 : 2.4}>
            <Typography variant="caption" sx={{ color: '#AAB4C0', mb: 0.5, display: 'block', fontWeight: 600 }}>
              COMPARISON / PREVIOUS FY (PY)
            </Typography>
            <Select
              fullWidth
              value={pyFY}
              onChange={(e) => setPyFY(e.target.value)}
              sx={selectStyle}
            >
              {FY_OPTIONS.map(fy => (
                <MenuItem key={`py-${fy}`} value={fy}>{fy}</MenuItem>
              ))}
            </Select>
          </Grid>

          {/* Period Type Selector (DAILY, WEEKLY, MONTHLY, FULL FINANCIAL YEAR) */}
          <Grid item xs={12} sm={6} md={periodType === 'FULL_FY' ? 4 : 2.4}>
            <Typography variant="caption" sx={{ color: '#AAB4C0', mb: 0.5, display: 'block', fontWeight: 600 }}>
              PERIOD TYPE
            </Typography>
            <Select
              fullWidth
              value={periodType}
              onChange={(e) => setPeriodType(e.target.value)}
              sx={selectStyle}
            >
              <MenuItem value="DAILY">DAILY</MenuItem>
              <MenuItem value="WEEKLY">WEEKLY</MenuItem>
              <MenuItem value="MONTHLY">MONTHLY</MenuItem>
              <MenuItem value="FULL_FY">FULL FINANCIAL YEAR</MenuItem>
            </Select>
          </Grid>

          {/* MONTHLY Mode: Independent Month Selectors */}
          {periodType === 'MONTHLY' && (
            <>
              <Grid item xs={12} sm={6} md={2.4}>
                <Typography variant="caption" sx={{ color: '#38bdf8', mb: 0.5, display: 'block', fontWeight: 700 }}>
                  CURRENT FY MONTH
                </Typography>
                <Select
                  fullWidth
                  value={tyMonth}
                  onChange={(e) => setTyMonth(e.target.value)}
                  sx={selectStyle}
                >
                  {MONTHS.map(m => (
                    <MenuItem key={`ty-m-${m}`} value={m}>{m}</MenuItem>
                  ))}
                </Select>
              </Grid>

              <Grid item xs={12} sm={6} md={2.4}>
                <Typography variant="caption" sx={{ color: '#94a3b8', mb: 0.5, display: 'block', fontWeight: 700 }}>
                  PREVIOUS FY MONTH
                </Typography>
                <Select
                  fullWidth
                  value={pyMonth}
                  onChange={(e) => setPyMonth(e.target.value)}
                  sx={selectStyle}
                >
                  {MONTHS.map(m => (
                    <MenuItem key={`py-m-${m}`} value={m}>{m}</MenuItem>
                  ))}
                </Select>
              </Grid>
            </>
          )}

          {/* WEEKLY Mode: Independent Month + Week Selectors */}
          {periodType === 'WEEKLY' && (
            <>
              <Grid item xs={12} sm={6} md={2.4}>
                <Typography variant="caption" sx={{ color: '#38bdf8', mb: 0.5, display: 'block', fontWeight: 700 }}>
                  TARGET MONTH & WEEK
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Select
                    fullWidth
                    value={tyMonth}
                    onChange={(e) => setTyMonth(e.target.value)}
                    sx={selectStyle}
                  >
                    {MONTHS.map(m => (
                      <MenuItem key={`ty-wm-${m}`} value={m}>{m}</MenuItem>
                    ))}
                  </Select>
                  <Select
                    sx={{ ...selectStyle, minWidth: 100 }}
                    value={tyWeek}
                    onChange={(e) => setTyWeek(e.target.value)}
                  >
                    {WEEKS.map(w => (
                      <MenuItem key={`ty-w-${w.value}`} value={w.value}>W{w.value}</MenuItem>
                    ))}
                  </Select>
                </Box>
              </Grid>

              <Grid item xs={12} sm={6} md={2.4}>
                <Typography variant="caption" sx={{ color: '#94a3b8', mb: 0.5, display: 'block', fontWeight: 700 }}>
                  COMPARISON MONTH & WEEK
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Select
                    fullWidth
                    value={pyMonth}
                    onChange={(e) => setPyMonth(e.target.value)}
                    sx={selectStyle}
                  >
                    {MONTHS.map(m => (
                      <MenuItem key={`py-wm-${m}`} value={m}>{m}</MenuItem>
                    ))}
                  </Select>
                  <Select
                    sx={{ ...selectStyle, minWidth: 100 }}
                    value={pyWeek}
                    onChange={(e) => setPyWeek(e.target.value)}
                  >
                    {WEEKS.map(w => (
                      <MenuItem key={`py-w-${w.value}`} value={w.value}>W{w.value}</MenuItem>
                    ))}
                  </Select>
                </Box>
              </Grid>
            </>
          )}

          {/* DAILY Mode: Independent Date Pickers */}
          {periodType === 'DAILY' && (
            <>
              <Grid item xs={12} sm={6} md={2.4}>
                <Typography variant="caption" sx={{ color: '#38bdf8', mb: 0.5, display: 'block', fontWeight: 700 }}>
                  CURRENT FY DATE
                </Typography>
                <TextField
                  fullWidth
                  type="date"
                  value={tyDate}
                  inputProps={{ max: todayIso }}
                  onChange={(e) => setTyDate(e.target.value)}
                  sx={{
                    '& .MuiInputBase-root': { color: '#FFF', bgcolor: 'rgba(255,255,255,0.05)', borderRadius: '8px', fontSize: '0.85rem' },
                    '& .MuiOutlinedInput-input': { py: 1, px: 1.5 },
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' }
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={2.4}>
                <Typography variant="caption" sx={{ color: '#94a3b8', mb: 0.5, display: 'block', fontWeight: 700 }}>
                  PREVIOUS FY DATE
                </Typography>
                <TextField
                  fullWidth
                  type="date"
                  value={pyDate}
                  onChange={(e) => setPyDate(e.target.value)}
                  sx={{
                    '& .MuiInputBase-root': { color: '#FFF', bgcolor: 'rgba(255,255,255,0.05)', borderRadius: '8px', fontSize: '0.85rem' },
                    '& .MuiOutlinedInput-input': { py: 1, px: 1.5 },
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' }
                  }}
                />
              </Grid>
            </>
          )}
        </Grid>
      </GlassCard>

      {/* ── COMPARISON HEADING ──────────────────────────────────────────────── */}
      {data?.comparisonHeading && (
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Chip
            label={data.comparisonHeading}
            sx={{
              bgcolor: 'rgba(139, 92, 246, 0.15)',
              color: '#c084fc',
              fontSize: '1rem',
              fontWeight: 800,
              py: 2.2,
              px: 2,
              borderRadius: '12px',
              border: '1px solid rgba(139, 92, 246, 0.3)',
              letterSpacing: '1px'
            }}
          />
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 3, bgcolor: 'rgba(244,63,94,0.15)', color: '#f43f5e', border: '1px solid rgba(244,63,94,0.3)' }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '45vh', gap: 2 }}>
          <CircularProgress sx={{ color: '#8b5cf6' }} />
          <Typography variant="body2" sx={{ color: '#AAB4C0' }}>
            Aggregating Full Project Cement Register Tonnage, Bill Register Revenue, and Bank Book Realization...
          </Typography>
        </Box>
      ) : (
        <>
          {/* ── TWO-SIDE COMPARISON CARDS & GROWTH SUMMARY ────────────────────── */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            
            {/* LEFT CARD: TARGET / CURRENT PERIOD */}
            <Grid item xs={12} md={4}>
              <GlassCard sx={{ p: 2.5, height: '100%', borderTop: '3px solid #38bdf8' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                  <Box>
                    <Typography variant="caption" sx={{ color: '#38bdf8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      CURRENT / TARGET PERIOD
                    </Typography>
                    <Typography variant="h6" fontWeight={800} sx={{ color: '#FFF' }}>
                      {ty.headerLabel || ty.financialYear || tyFY}
                    </Typography>
                  </Box>
                  <Chip size="small" label={ty.periodDisplay || '-'} sx={{ bgcolor: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', fontWeight: 600, fontSize: '0.7rem' }} />
                </Box>
                <Divider sx={{ borderColor: 'rgba(255,255,255,0.06)', mb: 2 }} />

                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Typography variant="caption" sx={{ color: '#AAB4C0', display: 'block' }}>TOTAL TONNAGE / LIFTING</Typography>
                    <Typography variant="h6" fontWeight={800} sx={{ color: '#38bdf8' }}>
                      {formatNumber(ty.tonnage)} <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#AAB4C0' }}>MT</span>
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.7rem' }}>
                      Cement Register TOTAL MT
                    </Typography>
                  </Grid>

                  <Grid item xs={6}>
                    <Typography variant="caption" sx={{ color: '#AAB4C0', display: 'block' }}>TOTAL BILLED REVENUE</Typography>
                    <Typography variant="h6" fontWeight={800} sx={{ color: '#10b981' }}>
                      {formatCurrency(ty.revenue)}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.7rem' }}>
                      Actual Bill Register Total
                    </Typography>
                  </Grid>

                  <Grid item xs={12}>
                    <Box sx={{ bgcolor: 'rgba(255,255,255,0.03)', p: 1.5, borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <Typography variant="caption" sx={{ color: '#AAB4C0', display: 'block' }}>REVENUE / MT (DIAGNOSTIC)</Typography>
                        <Typography variant="subtitle1" fontWeight={800} sx={{ color: '#c084fc' }}>
                          {ty.tonnage > 0 ? `₹${formatNumber(ty.revPerMt)}` : 'N/A'} <span style={{ fontSize: '0.7rem', fontWeight: 500, color: '#AAB4C0' }}>{ty.tonnage > 0 ? '/ MT' : ''}</span>
                        </Typography>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="caption" sx={{ color: '#AAB4C0', display: 'block' }}>OPERATIONS</Typography>
                        <Typography variant="caption" fontWeight={700} sx={{ color: '#FFF' }}>
                          {ty.tripCount || 0} Trips • {ty.billCount || 0} Bills
                        </Typography>
                      </Box>
                    </Box>
                  </Grid>

                  <Grid item xs={12}>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        fullWidth
                        startIcon={<VisibilityIcon fontSize="small" />}
                        onClick={() => openSourceModal('cement', `Cement Register Records (${ty.headerLabel})`, ty.cementRecords)}
                        sx={{ color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.3)', textTransform: 'none', fontSize: '0.75rem', '&:hover': { borderColor: '#38bdf8', bgcolor: 'rgba(56, 189, 248, 0.1)' } }}
                      >
                        Tonnage Records
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        fullWidth
                        startIcon={<ReceiptLongIcon fontSize="small" />}
                        onClick={() => openSourceModal('bills', `Bill Register Invoices (${ty.headerLabel})`, ty.billRecords)}
                        sx={{ color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.3)', textTransform: 'none', fontSize: '0.75rem', '&:hover': { borderColor: '#10b981', bgcolor: 'rgba(16, 185, 129, 0.1)' } }}
                      >
                        Revenue Bills
                      </Button>
                    </Box>
                  </Grid>
                </Grid>
              </GlassCard>
            </Grid>

            {/* MIDDLE CARD: COMPARATIVE GROWTH & DISPROPORTION GAP */}
            <Grid item xs={12} md={4}>
              <GlassCard sx={{ p: 2.5, height: '100%', borderTop: '3px solid #8b5cf6', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                    <Typography variant="caption" sx={{ color: '#c084fc', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      PRIMARY GROWTH COMPARISON
                    </Typography>
                    <CompareArrowsIcon sx={{ color: '#c084fc', fontSize: '1.25rem' }} />
                  </Box>
                  <Divider sx={{ borderColor: 'rgba(255,255,255,0.06)', mb: 2 }} />

                  <Stack spacing={1.5}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1, bgcolor: 'rgba(56, 189, 248, 0.08)', borderRadius: '6px', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
                      <Box>
                        <Typography variant="body2" sx={{ color: '#38bdf8', fontWeight: 600 }}>Tonnage Growth %</Typography>
                        <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.68rem' }}>((Curr MT - Prev MT) / Prev MT) × 100</Typography>
                      </Box>
                      <Typography variant="subtitle2" fontWeight={800} sx={{ color: (comp.volumeGrowthPct || 0) >= 0 ? '#38bdf8' : '#f43f5e' }}>
                        {formatPct(comp.volumeGrowthPct)}
                      </Typography>
                    </Box>

                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1, bgcolor: 'rgba(16, 185, 129, 0.08)', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                      <Box>
                        <Typography variant="body2" sx={{ color: '#10b981', fontWeight: 600 }}>Billed Revenue Growth %</Typography>
                        <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.68rem' }}>((Curr Rev - Prev Rev) / Prev Rev) × 100</Typography>
                      </Box>
                      <Typography variant="subtitle2" fontWeight={800} sx={{ color: (comp.revenueGrowthPct || 0) >= 0 ? '#10b981' : '#f43f5e' }}>
                        {formatPct(comp.revenueGrowthPct)}
                      </Typography>
                    </Box>

                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1, bgcolor: 'rgba(168, 85, 247, 0.08)', borderRadius: '6px', border: '1px solid rgba(168, 85, 247, 0.2)' }}>
                      <Box>
                        <Typography variant="body2" sx={{ color: '#c084fc', fontWeight: 600 }}>Revenue / MT Growth (Diagnostic)</Typography>
                        <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.68rem' }}>Realization Rate Delta %</Typography>
                      </Box>
                      <Typography variant="subtitle2" fontWeight={800} sx={{ color: (comp.revPerMtGrowthPct || 0) >= 0 ? '#c084fc' : '#f43f5e' }}>
                        {formatPct(comp.revPerMtGrowthPct)}
                      </Typography>
                    </Box>
                  </Stack>
                </Box>

                {/* Growth Difference / Disproportion Banner */}
                <Box sx={{ mt: 2, p: 1.5, borderRadius: '8px', bgcolor: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="caption" sx={{ color: '#AAB4C0', display: 'block', fontWeight: 600 }}>
                      GROWTH GAP (REVENUE % - TONNAGE %)
                    </Typography>
                    <Typography variant="subtitle1" fontWeight={900} sx={{ color: (comp?.growthGap || 0) > 0 ? '#10b981' : (comp?.growthGap || 0) < 0 ? '#f59e0b' : '#38bdf8' }}>
                      {comp?.growthGap !== null && comp?.growthGap !== undefined && !isNaN(Number(comp?.growthGap))
                        ? `${Number(comp.growthGap) > 0 ? '+' : ''}${Number(comp.growthGap).toFixed(2)} pp`
                        : 'N/A'}
                    </Typography>
                  </Box>
                  <Chip
                    size="small"
                    label={(comp?.growthGap || 0) > 0 ? 'Revenue Outpacing Tonnage' : (comp?.growthGap || 0) < 0 ? 'Revenue Growth Lower Than Tonnage' : 'Proportionate Growth'}
                    sx={{
                      bgcolor: (comp?.growthGap || 0) > 0 ? 'rgba(16, 185, 129, 0.15)' : (comp?.growthGap || 0) < 0 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                      color: (comp?.growthGap || 0) > 0 ? '#10b981' : (comp?.growthGap || 0) < 0 ? '#f59e0b' : '#38bdf8',
                      fontWeight: 700,
                      fontSize: '0.7rem'
                    }}
                  />
                </Box>
              </GlassCard>
            </Grid>

            {/* RIGHT CARD: COMPARISON / PREVIOUS PERIOD */}
            <Grid item xs={12} md={4}>
              <GlassCard sx={{ p: 2.5, height: '100%', borderTop: '3px solid #94a3b8' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                  <Box>
                    <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      PREVIOUS / COMPARISON PERIOD
                    </Typography>
                    <Typography variant="h6" fontWeight={800} sx={{ color: '#FFF' }}>
                      {py.headerLabel || py.financialYear || pyFY}
                    </Typography>
                  </Box>
                  <Chip size="small" label={py.periodDisplay || '-'} sx={{ bgcolor: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8', fontWeight: 600, fontSize: '0.7rem' }} />
                </Box>
                <Divider sx={{ borderColor: 'rgba(255,255,255,0.06)', mb: 2 }} />

                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Typography variant="caption" sx={{ color: '#AAB4C0', display: 'block' }}>TOTAL TONNAGE / LIFTING</Typography>
                    <Typography variant="h6" fontWeight={800} sx={{ color: '#94a3b8' }}>
                      {formatNumber(py.tonnage)} <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#AAB4C0' }}>MT</span>
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.7rem' }}>
                      Cement Register TOTAL MT
                    </Typography>
                  </Grid>

                  <Grid item xs={6}>
                    <Typography variant="caption" sx={{ color: '#AAB4C0', display: 'block' }}>TOTAL BILLED REVENUE</Typography>
                    <Typography variant="h6" fontWeight={800} sx={{ color: '#10b981' }}>
                      {formatCurrency(py.revenue)}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.7rem' }}>
                      Actual Bill Register Total
                    </Typography>
                  </Grid>

                  <Grid item xs={12}>
                    <Box sx={{ bgcolor: 'rgba(255,255,255,0.03)', p: 1.5, borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <Typography variant="caption" sx={{ color: '#AAB4C0', display: 'block' }}>REVENUE / MT (DIAGNOSTIC)</Typography>
                        <Typography variant="subtitle1" fontWeight={800} sx={{ color: '#c084fc' }}>
                          {py.tonnage > 0 ? `₹${formatNumber(py.revPerMt)}` : 'N/A'} <span style={{ fontSize: '0.7rem', fontWeight: 500, color: '#AAB4C0' }}>{py.tonnage > 0 ? '/ MT' : ''}</span>
                        </Typography>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="caption" sx={{ color: '#AAB4C0', display: 'block' }}>OPERATIONS</Typography>
                        <Typography variant="caption" fontWeight={700} sx={{ color: '#FFF' }}>
                          {py.tripCount || 0} Trips • {py.billCount || 0} Bills
                        </Typography>
                      </Box>
                    </Box>
                  </Grid>

                  <Grid item xs={12}>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        fullWidth
                        startIcon={<VisibilityIcon fontSize="small" />}
                        onClick={() => openSourceModal('cement', `Cement Register Records (${py.headerLabel})`, py.cementRecords)}
                        sx={{ color: '#94a3b8', borderColor: 'rgba(148, 163, 184, 0.3)', textTransform: 'none', fontSize: '0.75rem', '&:hover': { borderColor: '#94a3b8', bgcolor: 'rgba(148, 163, 184, 0.1)' } }}
                      >
                        Tonnage Records
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        fullWidth
                        startIcon={<ReceiptLongIcon fontSize="small" />}
                        onClick={() => openSourceModal('bills', `Bill Register Invoices (${py.headerLabel})`, py.billRecords)}
                        sx={{ color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.3)', textTransform: 'none', fontSize: '0.75rem', '&:hover': { borderColor: '#10b981', bgcolor: 'rgba(16, 185, 129, 0.1)' } }}
                      >
                        Revenue Bills
                      </Button>
                    </Box>
                  </Grid>
                </Grid>
              </GlassCard>
            </Grid>
          </Grid>

          {/* ── 3 DISTINCT BAR GRAPHS (REQUIREMENT 16) ─────────────────────────── */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            
            {/* BAR GRAPH 1: Total Tonnage (Previous vs Current) */}
            <Grid item xs={12} md={4}>
              <GlassCard sx={{ p: 2.5, height: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <LocalShippingIcon sx={{ color: '#38bdf8', fontSize: '1.2rem' }} />
                  <Typography variant="subtitle2" fontWeight={800} sx={{ color: '#FFF' }}>
                    BAR GRAPH 1: TOTAL TONNAGE
                  </Typography>
                </Box>
                <Typography variant="caption" sx={{ color: '#AAB4C0', mb: 2, display: 'block' }}>
                  Actual Lifting MT comparison ({pyLabel} vs {tyLabel})
                </Typography>

                <Box sx={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={tonnageBarChartData}
                      margin={{ top: 20, right: 20, left: 10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="period" stroke="#AAB4C0" fontSize={11} tickLine={false} />
                      <YAxis stroke="#AAB4C0" fontSize={11} tickLine={false} tickFormatter={(v) => `${v} MT`} />
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: '#111315',
                          borderColor: 'rgba(255,255,255,0.15)',
                          borderRadius: '8px',
                          color: '#FFF'
                        }}
                        formatter={(val) => [`${formatNumber(val)} MT`, 'Total Tonnage']}
                      />
                      <Bar dataKey="tonnage" radius={[6, 6, 0, 0]}>
                        {tonnageBarChartData.map((entry, index) => (
                          <Cell key={`tonnage-cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </GlassCard>
            </Grid>

            {/* BAR GRAPH 2: Total Billed Revenue (Previous vs Current) */}
            <Grid item xs={12} md={4}>
              <GlassCard sx={{ p: 2.5, height: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <AccountBalanceWalletIcon sx={{ color: '#10b981', fontSize: '1.2rem' }} />
                  <Typography variant="subtitle2" fontWeight={800} sx={{ color: '#FFF' }}>
                    BAR GRAPH 2: TOTAL BILLED REVENUE
                  </Typography>
                </Box>
                <Typography variant="caption" sx={{ color: '#AAB4C0', mb: 2, display: 'block' }}>
                  Actual Billed Revenue in ₹ Lakhs ({pyLabel} vs {tyLabel})
                </Typography>

                <Box sx={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={revenueBarChartData}
                      margin={{ top: 20, right: 20, left: 10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="period" stroke="#AAB4C0" fontSize={11} tickLine={false} />
                      <YAxis stroke="#AAB4C0" fontSize={11} tickLine={false} tickFormatter={(v) => `₹${v}L`} />
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: '#111315',
                          borderColor: 'rgba(255,255,255,0.15)',
                          borderRadius: '8px',
                          color: '#FFF'
                        }}
                        formatter={(val, name, item) => [`₹${formatNumber(val)} Lakhs (${formatCurrency(item.payload.rawRevenue)})`, 'Total Billed Revenue']}
                      />
                      <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
                        {revenueBarChartData.map((entry, index) => (
                          <Cell key={`rev-cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </GlassCard>
            </Grid>

            {/* BAR GRAPH 3: Growth Comparison (Tonnage Growth % vs Revenue Growth %) */}
            <Grid item xs={12} md={4}>
              <GlassCard sx={{ p: 2.5, height: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <TrendingUpIcon sx={{ color: '#c084fc', fontSize: '1.2rem' }} />
                  <Typography variant="subtitle2" fontWeight={800} sx={{ color: '#FFF' }}>
                    BAR GRAPH 3: GROWTH COMPARISON %
                  </Typography>
                </Box>
                <Typography variant="caption" sx={{ color: '#AAB4C0', mb: 2, display: 'block' }}>
                  Tonnage Growth % vs Billed Revenue Growth %
                </Typography>

                <Box sx={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={growthRatesChartData}
                      layout="vertical"
                      margin={{ top: 20, right: 20, left: 10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis type="number" stroke="#AAB4C0" fontSize={11} tickFormatter={(v) => `${v}%`} />
                      <YAxis type="category" dataKey="name" stroke="#AAB4C0" fontSize={10} width={110} tickLine={false} />
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: '#111315',
                          borderColor: 'rgba(255,255,255,0.15)',
                          borderRadius: '8px',
                          color: '#FFF'
                        }}
                        formatter={(val) => {
                          if (val === null || val === undefined || isNaN(Number(val))) return ['N/A', 'Growth Rate'];
                          const num = Number(val);
                          return [`${num > 0 ? '+' : ''}${num.toFixed(2)}%`, 'Growth Rate'];
                        }}
                      />
                      <ReferenceLine x={0} stroke="rgba(255,255,255,0.3)" />
                      <Bar dataKey="growth" radius={[0, 4, 4, 0]}>
                        {growthRatesChartData.map((entry, index) => (
                          <Cell key={`growth-cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </GlassCard>
            </Grid>
          </Grid>

          {/* ── PERIODIC TREND BAR GRAPH (DAILY / WEEKLY / MONTHLY) ────────────── */}
          {trend.length > 0 && (
            <GlassCard sx={{ p: 2.5, mb: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <ShowChartIcon sx={{ color: '#8b5cf6', fontSize: '1.25rem' }} />
                  <Typography variant="subtitle1" fontWeight={800} sx={{ color: '#FFF' }}>
                    {periodType === 'DAILY' ? 'Daily Lifting & Billed Revenue Trend' :
                     periodType === 'WEEKLY' ? 'Weekly Lifting & Billed Revenue Trend' :
                     'Monthly Lifting & Billed Revenue Trend (Full FY)'}
                  </Typography>
                </Box>
                <Chip
                  size="small"
                  label={`Granularity: ${periodType}`}
                  sx={{ bgcolor: 'rgba(139, 92, 246, 0.15)', color: '#c084fc', fontWeight: 600, fontSize: '0.7rem' }}
                />
              </Box>
              <Typography variant="caption" sx={{ color: '#AAB4C0', mb: 2, display: 'block' }}>
                Actual Total Tonnage (MT) and Billed Revenue (₹ Lakhs) distribution across the active timeframe
              </Typography>

              <Box sx={{ width: '100%', height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trend} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis dataKey="label" stroke="#AAB4C0" fontSize={11} tickLine={false} />
                    <YAxis yAxisId="left" stroke="#38bdf8" fontSize={11} tickLine={false} tickFormatter={(v) => `${v} MT`} />
                    <YAxis yAxisId="right" orientation="right" stroke="#10b981" fontSize={11} tickLine={false} tickFormatter={(v) => `₹${v}L`} />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: '#111315',
                        borderColor: 'rgba(255,255,255,0.15)',
                        borderRadius: '8px',
                        color: '#FFF'
                      }}
                      formatter={(val, name) => {
                        if (name.includes('Tonnage') || name.includes('MT')) return [`${formatNumber(val)} MT`, name];
                        return [`₹${formatNumber(val)} Lakhs`, name];
                      }}
                    />
                    <Legend wrapperStyle={{ color: '#AAB4C0', fontSize: '12px' }} />
                    {periodType === 'DAILY' ? (
                      <>
                        <Bar yAxisId="left" dataKey="tonnage" fill="#38bdf8" name="Total MT" radius={[4, 4, 0, 0]} />
                        <Bar yAxisId="right" dataKey="revenueLakhs" fill="#10b981" name="Billed Rev (₹ Lakhs)" radius={[4, 4, 0, 0]} />
                      </>
                    ) : (
                      <>
                        <Bar yAxisId="left" dataKey="tyTonnage" fill="#38bdf8" name={`Tonnage (${tyLabel})`} radius={[4, 4, 0, 0]} />
                        <Bar yAxisId="right" dataKey="tyRevenueLakhs" fill="#10b981" name={`Revenue Lakhs (${tyLabel})`} radius={[4, 4, 0, 0]} />
                        <Bar yAxisId="left" dataKey="pyTonnage" fill="#64748b" name={`Tonnage (${pyLabel})`} radius={[4, 4, 0, 0]} />
                        <Bar yAxisId="right" dataKey="pyRevenueLakhs" fill="#f59e0b" name={`Revenue Lakhs (${pyLabel})`} radius={[4, 4, 0, 0]} />
                      </>
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </GlassCard>
          )}

          {/* ── DISPROPORTION & SHORTFALL REASONS SECTION ──────────────────────── */}
          <GlassCard sx={{ p: 2.5, mb: 3, borderLeft: '4px solid #8b5cf6' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <AssessmentIcon sx={{ color: '#8b5cf6', fontSize: '1.25rem' }} />
              <Typography variant="subtitle1" fontWeight={800} sx={{ color: '#FFF' }}>
                WHY IS REVENUE GROWTH DIFFERENT FROM TONNAGE GROWTH?
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ color: '#AAB4C0', mb: 2 }}>
              Mathematical variance decomposition and authoritative financial factor analysis based on verified project records:
            </Typography>

            {/* Diagnostic Realization Breakdown */}
            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid item xs={12} sm={6} md={3}>
                <Box sx={{ p: 1.5, borderRadius: '8px', bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <Typography variant="caption" sx={{ color: '#94a3b8', display: 'block', fontWeight: 600 }}>
                    PREVIOUS REVENUE / MT
                  </Typography>
                  <Typography variant="subtitle1" fontWeight={800} sx={{ color: '#94a3b8' }}>
                    {py.tonnage > 0 ? `₹${formatNumber(py.revPerMt)} / MT` : 'N/A'}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.7rem' }}>{pyLabel}</Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Box sx={{ p: 1.5, borderRadius: '8px', bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <Typography variant="caption" sx={{ color: '#38bdf8', display: 'block', fontWeight: 600 }}>
                    CURRENT REVENUE / MT
                  </Typography>
                  <Typography variant="subtitle1" fontWeight={800} sx={{ color: '#38bdf8' }}>
                    {ty.tonnage > 0 ? `₹${formatNumber(ty.revPerMt)} / MT` : 'N/A'}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.7rem' }}>{tyLabel}</Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Box sx={{ p: 1.5, borderRadius: '8px', bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <Typography variant="caption" sx={{ color: '#c084fc', display: 'block', fontWeight: 600 }}>
                    CHANGE IN REVENUE / MT
                  </Typography>
                  <Typography variant="subtitle1" fontWeight={800} sx={{ color: (comp?.diffRevPerMt || 0) >= 0 ? '#10b981' : '#f43f5e' }}>
                    {comp?.diffRevPerMt !== undefined && py.tonnage > 0 && ty.tonnage > 0
                      ? `${Number(comp.diffRevPerMt) >= 0 ? '+' : ''}₹${formatNumber(comp.diffRevPerMt)} / MT`
                      : 'N/A'}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.7rem' }}>Realization Rate Delta</Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Box sx={{ p: 1.5, borderRadius: '8px', bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <Typography variant="caption" sx={{ color: '#10b981', display: 'block', fontWeight: 600 }}>
                    REVENUE / MT GROWTH %
                  </Typography>
                  <Typography variant="subtitle1" fontWeight={800} sx={{ color: (comp?.revPerMtGrowthPct || 0) >= 0 ? '#10b981' : '#f43f5e' }}>
                    {formatPct(comp.revPerMtGrowthPct)}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.7rem' }}>Percentage Realization Change</Typography>
                </Box>
              </Grid>
            </Grid>

            {/* Diagnostic explanations */}
            <Stack spacing={1.5} sx={{ mb: 2 }}>
              {(comp.disproportionReasons || []).map((reason, idx) => (
                <Box
                  key={`reason-${idx}`}
                  sx={{
                    p: 1.5,
                    borderRadius: '8px',
                    bgcolor: reason.type === 'POSITIVE_IMPACT'
                      ? 'rgba(16, 185, 129, 0.08)'
                      : reason.type === 'NEGATIVE_IMPACT'
                      ? 'rgba(244, 63, 94, 0.08)'
                      : 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 1.5
                  }}
                >
                  <SpeedIcon sx={{ color: '#c084fc', fontSize: '1.1rem', mt: 0.3 }} />
                  <Box>
                    <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#FFF', mb: 0.2 }}>
                      {reason.factor}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#cbd5e1', fontSize: '0.85rem', lineHeight: 1.5 }}>
                      {reason.detail}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Stack>

            {/* REVENUE GROWTH SHORTFALL ANALYSIS (When Revenue Growth < Tonnage Growth) */}
            {comp.shortfallContributors && comp.shortfallContributors.length > 0 && (
              <Box sx={{ mt: 2, pt: 2, borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
                <Typography variant="subtitle2" fontWeight={800} sx={{ color: '#f59e0b', mb: 1.5 }}>
                  REVENUE GROWTH SHORTFALL CONTRIBUTORS (RANKED BY MEASURABLE IMPACT)
                </Typography>
                <Grid container spacing={2}>
                  {comp.shortfallContributors.map((c) => (
                    <Grid item xs={12} sm={6} key={`shortfall-${c.rank}`}>
                      <Box sx={{ p: 1.5, borderRadius: '8px', bgcolor: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                          <Chip size="small" label={`Rank #${c.rank}`} sx={{ bgcolor: '#f59e0b', color: '#000', fontWeight: 800, height: 20, fontSize: '0.7rem' }} />
                          <Typography variant="subtitle2" fontWeight={800} sx={{ color: '#f43f5e' }}>
                            {c.impactDisplay}
                          </Typography>
                        </Box>
                        <Typography variant="body2" fontWeight={700} sx={{ color: '#FFF', mb: 0.5 }}>
                          {c.name}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#cbd5e1', display: 'block', mb: 0.5 }}>
                          {c.description}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#AAB4C0', fontSize: '0.7rem' }}>
                          Source: <strong>{c.source}</strong>
                        </Typography>
                      </Box>
                    </Grid>
                  ))}
                </Grid>
              </Box>
            )}
          </GlassCard>

          {/* ── DOCUMENTED DEDUCTIONS & REDUCTIONS TABLE SECTION ──────────────── */}
          <GlassCard sx={{ p: 2.5, mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1.5 }}>
              <Box>
                <Typography variant="subtitle1" fontWeight={800} sx={{ color: '#FFF' }}>
                  Documented Deductions & Reductions Analysis
                </Typography>
                <Typography variant="caption" sx={{ color: '#AAB4C0' }}>
                  Authoritative deductions traced directly to source payment settlements and bill allocations
                </Typography>
              </Box>
              <Chip
                label={`${(ty.attributableDeductions || []).length} Documented Deductions`}
                sx={{ bgcolor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', fontWeight: 700 }}
              />
            </Box>

            <TableContainer sx={{ borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'rgba(255,255,255,0.04)' }}>
                    <TableCell sx={{ color: '#AAB4C0', fontWeight: 700, fontSize: '0.75rem' }}>REASON / LEDGER</TableCell>
                    <TableCell sx={{ color: '#AAB4C0', fontWeight: 700, fontSize: '0.75rem' }}>SOURCE</TableCell>
                    <TableCell sx={{ color: '#AAB4C0', fontWeight: 700, fontSize: '0.75rem' }}>DATE</TableCell>
                    <TableCell sx={{ color: '#AAB4C0', fontWeight: 700, fontSize: '0.75rem' }}>REFERENCE / INVOICE</TableCell>
                    <TableCell align="right" sx={{ color: '#AAB4C0', fontWeight: 700, fontSize: '0.75rem' }}>GROSS AMOUNT</TableCell>
                    <TableCell align="right" sx={{ color: '#f43f5e', fontWeight: 700, fontSize: '0.75rem' }}>DEDUCTION AMOUNT</TableCell>
                    <TableCell align="right" sx={{ color: '#AAB4C0', fontWeight: 700, fontSize: '0.75rem' }}>REVENUE SHARE %</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(!ty.attributableDeductions || ty.attributableDeductions.length === 0) ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 3, color: '#7F8A96' }}>
                        No attributable deductions recorded for the current selected period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    ty.attributableDeductions.map((d, idx) => (
                      <TableRow key={`deduction-${idx}`} hover sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' } }}>
                        <TableCell sx={{ color: '#FFF', fontWeight: 600 }}>{d.reason}</TableCell>
                        <TableCell sx={{ color: '#60a5fa' }}>{d.source}</TableCell>
                        <TableCell sx={{ color: '#AAB4C0', whiteSpace: 'nowrap' }}>{d.date}</TableCell>
                        <TableCell sx={{ color: '#AAB4C0' }}>{d.invoiceNumber || d.reference}</TableCell>
                        <TableCell align="right" sx={{ color: '#FFF' }}>{formatCurrency(d.grossAmount)}</TableCell>
                        <TableCell align="right" sx={{ color: '#f43f5e', fontWeight: 700 }}>
                          -{formatCurrency(d.deductionAmount)}
                        </TableCell>
                        <TableCell align="right" sx={{ color: '#AAB4C0' }}>{d.percentageImpact}%</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </GlassCard>

          {/* ── FINANCIAL REALIZATION & PAYMENT WATERFALL BRIDGE ────────────────── */}
          <GlassCard sx={{ p: 2.5, mb: 3 }}>
            <Typography variant="subtitle1" fontWeight={800} sx={{ color: '#FFF', mb: 0.5 }}>
              Financial Realization & Payment Bridge
            </Typography>
            <Typography variant="caption" sx={{ color: '#AAB4C0', mb: 2, display: 'block' }}>
              Authoritative reconciliation from Billed Revenue → Deductions → Payment Realized → Outstanding Balance
            </Typography>

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <Box sx={{ p: 2, borderRadius: '8px', bgcolor: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
                  <Typography variant="caption" sx={{ color: '#38bdf8', display: 'block', fontWeight: 700 }}>
                    1. BILLED REVENUE
                  </Typography>
                  <Typography variant="h6" fontWeight={800} sx={{ color: '#FFF' }}>
                    {formatCurrency(ty.revenue)}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>Bill Register Gross Billing</Typography>
                </Box>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <Box sx={{ p: 2, borderRadius: '8px', bgcolor: 'rgba(244, 63, 94, 0.08)', border: '1px solid rgba(244, 63, 94, 0.2)' }}>
                  <Typography variant="caption" sx={{ color: '#f43f5e', display: 'block', fontWeight: 700 }}>
                    2. DOCUMENTED DEDUCTIONS
                  </Typography>
                  <Typography variant="h6" fontWeight={800} sx={{ color: '#f43f5e' }}>
                    -{formatCurrency(ty.totalDocumentedDeductions)}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>Damages, Shortage & TDS</Typography>
                </Box>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <Box sx={{ p: 2, borderRadius: '8px', bgcolor: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                  <Typography variant="caption" sx={{ color: '#10b981', display: 'block', fontWeight: 700 }}>
                    3. PAYMENTS REALIZED
                  </Typography>
                  <Typography variant="h6" fontWeight={800} sx={{ color: '#10b981' }}>
                    {formatCurrency(ty.paymentReceived)}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>Bank Book / Settled Receipts</Typography>
                </Box>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <Box sx={{ p: 2, borderRadius: '8px', bgcolor: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                  <Typography variant="caption" sx={{ color: '#f59e0b', display: 'block', fontWeight: 700 }}>
                    4. UNREALIZED BALANCE
                  </Typography>
                  <Typography variant="h6" fontWeight={800} sx={{ color: '#f59e0b' }}>
                    {formatCurrency(ty.unrealizedBalance)}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>Outstanding / In Settlement</Typography>
                </Box>
              </Grid>
            </Grid>
          </GlassCard>

          {/* ── CONSOLIDATED NUMERICAL COMPARISON TABLE ───────────────────────── */}
          <GlassCard sx={{ p: 2.5 }}>
            <Typography variant="subtitle1" fontWeight={800} sx={{ color: '#FFF', mb: 0.5 }}>
              Consolidated Period Financial & Operational Summary
            </Typography>
            <Typography variant="caption" sx={{ color: '#AAB4C0', mb: 2, display: 'block' }}>
              Full project analysis across physical volume (Cement Register), billed revenue (Bill Register), and financial settlements
            </Typography>

            <TableContainer sx={{ borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'rgba(255,255,255,0.04)' }}>
                    <TableCell sx={{ color: '#AAB4C0', fontWeight: 700, fontSize: '0.75rem', py: 1.2 }}>METRIC / DIMENSION</TableCell>
                    <TableCell align="right" sx={{ color: '#94a3b8', fontWeight: 700, fontSize: '0.75rem', py: 1.2 }}>{pyLabel} (PREVIOUS)</TableCell>
                    <TableCell align="right" sx={{ color: '#38bdf8', fontWeight: 700, fontSize: '0.75rem', py: 1.2 }}>{tyLabel} (TARGET)</TableCell>
                    <TableCell align="right" sx={{ color: '#FFF', fontWeight: 700, fontSize: '0.75rem', py: 1.2 }}>ABSOLUTE VARIANCE</TableCell>
                    <TableCell align="right" sx={{ color: '#10b981', fontWeight: 700, fontSize: '0.75rem', py: 1.2 }}>GROWTH %</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {/* Total Tonnage */}
                  <TableRow hover sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' } }}>
                    <TableCell sx={{ color: '#FFF', fontWeight: 600, fontSize: '0.8rem' }}>Total Lifting Tonnage (MT)</TableCell>
                    <TableCell align="right" sx={{ color: '#94a3b8', fontWeight: 600 }}>{formatNumber(py.tonnage)} MT</TableCell>
                    <TableCell align="right" sx={{ color: '#38bdf8', fontWeight: 700 }}>{formatNumber(ty.tonnage)} MT</TableCell>
                    <TableCell align="right" sx={{ color: (ty.tonnage - py.tonnage) >= 0 ? '#38bdf8' : '#f43f5e', fontWeight: 600 }}>
                      {(ty.tonnage - py.tonnage) >= 0 ? '+' : ''}{formatNumber(ty.tonnage - py.tonnage)} MT
                    </TableCell>
                    <TableCell align="right" sx={{ color: (comp.volumeGrowthPct || 0) >= 0 ? '#38bdf8' : '#f43f5e', fontWeight: 800 }}>
                      {formatPct(comp.volumeGrowthPct)}
                    </TableCell>
                  </TableRow>

                  {/* Total Revenue */}
                  <TableRow hover sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' } }}>
                    <TableCell sx={{ color: '#FFF', fontWeight: 600, fontSize: '0.8rem' }}>Total Billed Revenue (₹)</TableCell>
                    <TableCell align="right" sx={{ color: '#94a3b8', fontWeight: 600 }}>{formatCurrency(py.revenue)}</TableCell>
                    <TableCell align="right" sx={{ color: '#10b981', fontWeight: 700 }}>{formatCurrency(ty.revenue)}</TableCell>
                    <TableCell align="right" sx={{ color: (ty.revenue - py.revenue) >= 0 ? '#10b981' : '#f43f5e', fontWeight: 600 }}>
                      {(ty.revenue - py.revenue) >= 0 ? '+' : ''}{formatCurrency(ty.revenue - py.revenue)}
                    </TableCell>
                    <TableCell align="right" sx={{ color: (comp.revenueGrowthPct || 0) >= 0 ? '#10b981' : '#f43f5e', fontWeight: 800 }}>
                      {formatPct(comp.revenueGrowthPct)}
                    </TableCell>
                  </TableRow>

                  {/* Average Revenue Per MT */}
                  <TableRow hover sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' } }}>
                    <TableCell sx={{ color: '#FFF', fontWeight: 600, fontSize: '0.8rem' }}>Average Revenue / MT Realization (Diagnostic)</TableCell>
                    <TableCell align="right" sx={{ color: '#94a3b8', fontWeight: 600 }}>
                      {py.tonnage > 0 ? `₹${formatNumber(py.revPerMt)} / MT` : 'N/A'}
                    </TableCell>
                    <TableCell align="right" sx={{ color: '#c084fc', fontWeight: 700 }}>
                      {ty.tonnage > 0 ? `₹${formatNumber(ty.revPerMt)} / MT` : 'N/A'}
                    </TableCell>
                    <TableCell align="right" sx={{ color: (ty.revPerMt - py.revPerMt) >= 0 ? '#c084fc' : '#f43f5e', fontWeight: 600 }}>
                      {py.tonnage > 0 && ty.tonnage > 0
                        ? `${(ty.revPerMt - py.revPerMt) >= 0 ? '+' : ''}₹${formatNumber(ty.revPerMt - py.revPerMt)} / MT`
                        : 'N/A'}
                    </TableCell>
                    <TableCell align="right" sx={{ color: (comp.revPerMtGrowthPct || 0) >= 0 ? '#c084fc' : '#f43f5e', fontWeight: 800 }}>
                      {formatPct(comp.revPerMtGrowthPct)}
                    </TableCell>
                  </TableRow>

                  {/* Operations Dispatches / Trips */}
                  <TableRow hover sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' } }}>
                    <TableCell sx={{ color: '#AAB4C0', fontSize: '0.8rem' }}>Total Cement Register Trips / Dispatches</TableCell>
                    <TableCell align="right" sx={{ color: '#94a3b8' }}>{py.tripCount || 0} Trips</TableCell>
                    <TableCell align="right" sx={{ color: '#38bdf8' }}>{ty.tripCount || 0} Trips</TableCell>
                    <TableCell align="right" sx={{ color: '#FFF' }}>{(ty.tripCount || 0) - (py.tripCount || 0)} Trips</TableCell>
                    <TableCell align="right" sx={{ color: '#FFF', fontWeight: 700 }}>
                      {py.tripCount > 0 ? formatPct((((ty.tripCount || 0) - (py.tripCount || 0)) / py.tripCount) * 100) : 'N/A'}
                    </TableCell>
                  </TableRow>

                  {/* Total Bills */}
                  <TableRow hover sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' } }}>
                    <TableCell sx={{ color: '#AAB4C0', fontSize: '0.8rem' }}>Total Generated Bills</TableCell>
                    <TableCell align="right" sx={{ color: '#94a3b8' }}>{py.billCount || 0} Bills</TableCell>
                    <TableCell align="right" sx={{ color: '#38bdf8' }}>{ty.billCount || 0} Bills</TableCell>
                    <TableCell align="right" sx={{ color: '#FFF' }}>{(ty.billCount || 0) - (py.billCount || 0)} Bills</TableCell>
                    <TableCell align="right" sx={{ color: '#FFF', fontWeight: 700 }}>
                      {py.billCount > 0 ? formatPct((((ty.billCount || 0) - (py.billCount || 0)) / py.billCount) * 100) : 'N/A'}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </GlassCard>
        </>
      )}

      {/* ── SOURCE RECORD INSPECTION MODAL ──────────────────────────────────── */}
      <Dialog
        open={recordsModalOpen}
        onClose={() => setRecordsModalOpen(false)}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: '#111315',
            color: '#F5F7FA',
            borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.8)'
          }
        }}
      >
        <DialogTitle sx={{ borderBottom: '1px solid rgba(255,255,255,0.1)', pb: 2 }}>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Typography variant="h6" fontWeight={800} color="#FFF">
              {modalTitle}
            </Typography>
            <Chip
              label={`${modalRecords.length} Authoritative Records`}
              sx={{ bgcolor: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', fontWeight: 800 }}
            />
          </Box>
        </DialogTitle>
        <DialogContent sx={{ py: 3 }}>
          <TableContainer sx={{ maxHeight: 450, borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <Table stickyHeader size="small">
              <TableHead>
                {modalType === 'cement' ? (
                  <TableRow>
                    <TableCell sx={{ bgcolor: '#1a1d21', color: '#AAB4C0', fontWeight: 800 }}>DATE</TableCell>
                    <TableCell sx={{ bgcolor: '#1a1d21', color: '#AAB4C0', fontWeight: 800 }}>TRUCK NO</TableCell>
                    <TableCell sx={{ bgcolor: '#1a1d21', color: '#AAB4C0', fontWeight: 800 }}>TOTAL MT</TableCell>
                    <TableCell sx={{ bgcolor: '#1a1d21', color: '#AAB4C0', fontWeight: 800 }}>SITE</TableCell>
                    <TableCell sx={{ bgcolor: '#1a1d21', color: '#AAB4C0', fontWeight: 800 }}>PARTY NAME</TableCell>
                    <TableCell sx={{ bgcolor: '#1a1d21', color: '#AAB4C0', fontWeight: 800 }}>BILL / GCN NO</TableCell>
                  </TableRow>
                ) : (
                  <TableRow>
                    <TableCell sx={{ bgcolor: '#1a1d21', color: '#AAB4C0', fontWeight: 800 }}>INVOICE DATE</TableCell>
                    <TableCell sx={{ bgcolor: '#1a1d21', color: '#AAB4C0', fontWeight: 800 }}>INVOICE NUMBER</TableCell>
                    <TableCell sx={{ bgcolor: '#1a1d21', color: '#AAB4C0', fontWeight: 800 }}>BILLED AMOUNT</TableCell>
                    <TableCell sx={{ bgcolor: '#1a1d21', color: '#AAB4C0', fontWeight: 800 }}>BILL TYPE</TableCell>
                    <TableCell sx={{ bgcolor: '#1a1d21', color: '#AAB4C0', fontWeight: 800 }}>SITE</TableCell>
                    <TableCell sx={{ bgcolor: '#1a1d21', color: '#AAB4C0', fontWeight: 800 }}>ALLOCATED DEBIT</TableCell>
                  </TableRow>
                )}
              </TableHead>
              <TableBody>
                {modalRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4, color: '#7F8A96' }}>
                      No source records found for the selected timeframe.
                    </TableCell>
                  </TableRow>
                ) : (
                  modalRecords.slice(modalPage * modalRowsPerPage, modalPage * modalRowsPerPage + modalRowsPerPage).map((r, idx) => (
                    <TableRow key={r.id || idx} hover sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' } }}>
                      {modalType === 'cement' ? (
                        <>
                          <TableCell sx={{ color: '#FFF', whiteSpace: 'nowrap' }}>{r.date}</TableCell>
                          <TableCell sx={{ color: '#38bdf8', fontWeight: 700 }}>{r.truckNo}</TableCell>
                          <TableCell sx={{ color: '#10b981', fontWeight: 800 }}>{formatNumber(r.mt)} MT</TableCell>
                          <TableCell sx={{ color: '#AAB4C0' }}>{r.site}</TableCell>
                          <TableCell sx={{ color: '#FFF' }}>{r.party}</TableCell>
                          <TableCell sx={{ color: '#AAB4C0' }}>{r.billNo}</TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell sx={{ color: '#FFF', whiteSpace: 'nowrap' }}>{r.invoiceDate}</TableCell>
                          <TableCell sx={{ color: '#38bdf8', fontWeight: 700 }}>{r.displayInvoiceNumber || r.invoiceNumber}</TableCell>
                          <TableCell sx={{ color: '#10b981', fontWeight: 800 }}>{formatCurrency(r.amount)}</TableCell>
                          <TableCell sx={{ color: '#AAB4C0' }}>{r.billType}</TableCell>
                          <TableCell sx={{ color: '#AAB4C0' }}>{r.site}</TableCell>
                          <TableCell sx={{ color: r.allocatedDebit > 0 ? '#f43f5e' : '#AAB4C0', fontWeight: r.allocatedDebit > 0 ? 700 : 400 }}>
                            {r.allocatedDebit > 0 ? `-${formatCurrency(r.allocatedDebit)}` : '₹0'}
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            rowsPerPageOptions={[10, 25, 50]}
            component="div"
            count={modalRecords.length}
            rowsPerPage={modalRowsPerPage}
            page={modalPage}
            onPageChange={(e, p) => setModalPage(p)}
            onRowsPerPageChange={(e) => { setModalRowsPerPage(parseInt(e.target.value, 10)); setModalPage(0); }}
            sx={{ color: '#AAB4C0', borderTop: '1px solid rgba(255,255,255,0.08)' }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2.5, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <Button
            onClick={() => setRecordsModalOpen(false)}
            variant="contained"
            sx={{ bgcolor: '#3b82f6', color: '#FFF', fontWeight: 700, borderRadius: '8px', px: 3, '&:hover': { bgcolor: '#2563eb' } }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
