import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Button, IconButton, Grid, Card, CircularProgress,
  Tabs, Tab, Select, MenuItem, FormControl, TableContainer, Table, TableHead,
  TableRow, TableCell, TableBody, Paper, TextField, Tooltip, Chip, Dialog,
  DialogTitle, DialogContent, DialogActions, Divider, Popover
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import TableChartIcon from '@mui/icons-material/TableChart';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import axios from 'axios';
import { io } from 'socket.io-client';
import * as XLSX from 'xlsx';

const API_URL = import.meta.env.VITE_API_URL;
const SOCKET_URL = import.meta.env.VITE_SOCKET_IO_URL || import.meta.env.VITE_API_URL;
const socket = io(SOCKET_URL, { autoConnect: true, transports: ['websocket', 'polling'] });

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const parseNum = (val) => {
  if (val === undefined || val === null || val === '') return 0;
  const n = parseFloat(String(val).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};

// Helper to determine Calendar Year from Financial Year & Month
export const getCalendarYear = (financialYear, monthName) => {
  const mIdx = MONTH_NAMES.indexOf(monthName);
  const startYearStr = String(financialYear).substring(3, 7); // e.g. "FY 2026-27" -> "2026"
  let year = parseInt(startYearStr, 10);
  if (isNaN(year)) year = new Date().getFullYear();
  // Months Jan (0), Feb (1), Mar (2) belong to second half of the financial year
  if (mIdx !== -1 && mIdx < 3) {
    year += 1;
  }
  return year;
};

// Calculate exact days in the selected month (handles leap years e.g. Feb 29 vs 28)
export const getDaysCountInMonth = (year, monthName) => {
  const mIdx = MONTH_NAMES.indexOf(monthName);
  if (mIdx === -1) return 31;
  return new Date(year, mIdx + 1, 0).getDate();
};

export default function VehicleWiseTripSummaryTab({
  financialYear,
  setFinancialYear,
  month,
  setMonth,
  date: propDate,
  setDate: propSetDate,
  fyOptions = [],
  monthOptions = [],
  mainTab,
  setMainTab,
  onBack,
  isModal = false,
  onCloseModal = null
}) {
  const [internalDate, setInternalDate] = useState('ALL');
  const date = propDate !== undefined ? propDate : internalDate;
  const setDate = propSetDate || setInternalDate;

  const [loading, setLoading] = useState(false);
  const [serverData, setServerData] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [patternFilter, setPatternFilter] = useState('ALL');
  const [dedicatedFilter, setDedicatedFilter] = useState('ALL');
  const [viewMode, setViewMode] = useState('COMBINED'); // 'COMBINED' | 'SPREADSHEET' | 'REFERENCE_STRIP'
  const [selectedDayTripDetail, setSelectedDayTripDetail] = useState(null); // { vehNo, day, trips }
  const [selectedVehicleModal, setSelectedVehicleModal] = useState(null); // Full trip inspection for vehicle

  // Calendar popover anchor
  const [calendarAnchorEl, setCalendarAnchorEl] = useState(null);
  const handleOpenCalendar = (e) => setCalendarAnchorEl(e.currentTarget);
  const handleCloseCalendar = () => setCalendarAnchorEl(null);

  // Calendar year and day array for selected month
  const calendarYear = useMemo(() => getCalendarYear(financialYear, month), [financialYear, month]);
  const monthIndex = useMemo(() => MONTH_NAMES.indexOf(month), [month]);
  const totalDays = useMemo(() => getDaysCountInMonth(calendarYear, month), [calendarYear, month]);

  // Calendar display year for popover
  const displayYear = useMemo(() => {
    const startYear = parseInt(String(financialYear).substring(3, 7), 10) || new Date().getFullYear();
    const mIdx = MONTH_NAMES.indexOf(month);
    return mIdx < 3 ? startYear + 1 : startYear;
  }, [financialYear, month]);

  // Available dates for the popover calendar grid
  const dateOptions = useMemo(() => {
    const mIdx = MONTH_NAMES.indexOf(month);
    if (mIdx === -1) return [];
    const daysInMonth = new Date(displayYear, mIdx + 1, 0).getDate();
    const list = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dStr = String(d).padStart(2, '0');
      const mStr = String(mIdx + 1).padStart(2, '0');
      list.push({
        day: d,
        display: `${dStr}-${mStr}-${displayYear}`,
        value: `${dStr}-${mStr}-${displayYear}`
      });
    }
    return list;
  }, [displayYear, month]);

  // Default day strings array: ['01', '02', ..., totalDays]
  const defaultDaysArray = useMemo(() => {
    const arr = [];
    for (let i = 1; i <= totalDays; i++) {
      arr.push(String(i).padStart(2, '0'));
    }
    return arr;
  }, [totalDays]);

  const daysArray = useMemo(() => {
    return serverData?.daysArray || defaultDaysArray;
  }, [serverData, defaultDaysArray]);

  // Fetch complete Cement Register data directly from dedicated single-source-of-truth backend route
  const fetchReportData = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const res = await axios.get(`${API_URL}/daily-summary/vehicle-trip-summary`, {
        params: { date, fy: financialYear, month },
        headers
      });

      if (res.data?.success) {
        setServerData(res.data);
      } else {
        setServerData(null);
      }
    } catch (err) {
      console.error('[VehicleWiseTripSummaryTab] Fetch error:', err);
      setServerData(null);
    } finally {
      setLoading(false);
    }
  }, [date, financialYear, month]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  // Real-time synchronization on Cement Register and Cashbook updates
  useEffect(() => {
    const handler = () => fetchReportData();
    socket.on('cementUpdates', handler);
    socket.on('mainCashbookUpdates', handler);
    return () => {
      socket.off('cementUpdates', handler);
      socket.off('mainCashbookUpdates', handler);
    };
  }, [fetchReportData]);

  // Vehicles list from server
  const rawVehicles = useMemo(() => {
    return serverData?.vehicles || [];
  }, [serverData]);

  // Filtered vehicles based on search & chips
  const filteredVehicles = useMemo(() => {
    let list = rawVehicles;

    if (patternFilter !== 'ALL') {
      list = list.filter(v => v.wheelPattern === patternFilter);
    }

    if (dedicatedFilter === 'DEDICATED') {
      list = list.filter(v => v.isDedicated);
    } else if (dedicatedFilter === 'NON_DEDICATED') {
      list = list.filter(v => !v.isDedicated);
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter(v =>
        v.vehicleNo.toLowerCase().includes(q) ||
        (v.contactOwner && v.contactOwner.toLowerCase().includes(q)) ||
        (v.loadingPattern && v.loadingPattern.toLowerCase().includes(q))
      );
    }

    return list;
  }, [rawVehicles, patternFilter, dedicatedFilter, searchTerm]);

  // Regroup filtered vehicles by pattern
  const filteredByPattern = useMemo(() => {
    const groups = { '10W': [], '12W': [], '14W': [], '6W': [], 'OTHER': [] };
    filteredVehicles.forEach(v => {
      if (groups[v.wheelPattern]) groups[v.wheelPattern].push(v);
      else groups['OTHER'].push(v);
    });
    return groups;
  }, [filteredVehicles]);

  // Totals computed over the active filtered vehicle set
  const computedTotals = useMemo(() => {
    const dayTotals = {};
    daysArray.forEach(d => { dayTotals[d] = 0; });

    let grandTotalTrips = 0;
    let grandTotalMT = 0;
    let grandTotalAdvance = 0;

    filteredVehicles.forEach(v => {
      grandTotalTrips += v.totalTrips;
      grandTotalMT += v.totalMT;
      grandTotalAdvance += (v.totalAdvance || 0);
      daysArray.forEach(d => {
        dayTotals[d] += (v.dailyTrips?.[d] || 0);
      });
    });

    return {
      totalVehicles: filteredVehicles.length,
      totalTrips: grandTotalTrips,
      totalMT: Math.round(grandTotalMT * 100) / 100,
      totalAdvance: Math.round(grandTotalAdvance * 100) / 100,
      dayTotals
    };
  }, [filteredVehicles, daysArray]);

  // Pattern configuration with exact reference headers
  const patternConfigs = [
    {
      key: '10W',
      title: 'PATTERN: 10W (10-WHEELER)',
      ruleHeader: 'FOR RAFTAR- 10 WHEELER (8TRIPS) & IF "DEDICATED" - BOTH SIDE TOLL APPLICABLE FROM FEB-23, OTHERWISE "SINGLE SIDE" (NON DEDICATED)',
      bgColor: '#fffbeb',
      badgeBg: '#fef3c7',
      badgeColor: '#b45309',
      borderColor: '#fcd34d'
    },
    {
      key: '12W',
      title: 'PATTERN: 12W (12-WHEELER)',
      ruleHeader: '12W FOR RAFTAR (6 TRIPS) & IF "DEDICATED" = BOTH SIDE TOLL APPLICABLE FROM FEB-23, OTHERWISE "SINGLE SIDE" (NON DEDICATED)',
      bgColor: '#eff6ff',
      badgeBg: '#dbeafe',
      badgeColor: '#1d4ed8',
      borderColor: '#93c5fd'
    },
    {
      key: '14W',
      title: 'PATTERN: 14W (14-WHEELER)',
      ruleHeader: '14W FOR RAFTAR (6 TRIPS) & IF "DEDICATED" = BOTH SIDE TOLL APPLICABLE, OTHERWISE "SINGLE SIDE"',
      bgColor: '#fdf4ff',
      badgeBg: '#fae8ff',
      badgeColor: '#86198f',
      borderColor: '#f0abfc'
    },
    {
      key: '6W',
      title: 'PATTERN: 6W (6-WHEELER)',
      ruleHeader: '6-WHEELER OPERATIONAL TRIPS & TOLL ALLOCATION (SINGLE SIDE / BOTH SIDE)',
      bgColor: '#f0fdf4',
      badgeBg: '#dcfce7',
      badgeColor: '#15803d',
      borderColor: '#86efac'
    },
    {
      key: 'OTHER',
      title: 'PATTERN: OTHER VEHICLES',
      ruleHeader: 'OTHER REGISTERED FLEET OPERATIONAL TRIPS',
      bgColor: '#f8fafc',
      badgeBg: '#f1f5f9',
      badgeColor: '#475569',
      borderColor: '#cbd5e1'
    }
  ];

  // Excel Export: Full Month-Wise or Day-Wise Operational Register
  const handleExportExcel = () => {
    try {
      const wb = XLSX.utils.book_new();
      const rows = [];

      if (date === 'ALL') {
        // Main Title Banner
        rows.push([`MONTH OF ${month.substring(0, 3)}'${String(calendarYear).slice(-2)} VEHICLE- NO OF TRIPS`]);
        rows.push([`Financial Year: ${financialYear} | Selected Month: ${month} ${calendarYear} | Total Days: ${totalDays} | Total Vehicles: ${computedTotals.totalVehicles} | Total Trips: ${computedTotals.totalTrips} | Total MT: ${computedTotals.totalMT}`]);
        rows.push([]);

        // Build table headers
        const tableHeaders = ['SL NO', 'WHEEL', 'VEHICLE NUMBER', 'LOADING PATTERN', 'CLASSIFICATION'];
        daysArray.forEach(d => {
          tableHeaders.push(`${d}-${String(monthIndex + 1).padStart(2, '0')}`);
        });
        tableHeaders.push('TOTAL TRIPS', 'TOTAL MT', 'TOTAL ADVANCE (₹)');
        rows.push(tableHeaders);

        // Add vehicles grouped by pattern
        patternConfigs.forEach(cfg => {
          const pVehicles = filteredByPattern[cfg.key] || [];
          if (pVehicles.length === 0) return;

          rows.push([`--- ${cfg.title} --- ${cfg.ruleHeader}`]);

          pVehicles.forEach((v, idx) => {
            const rowData = [
              idx + 1,
              v.wheel || cfg.key,
              v.vehicleNo,
              v.loadingPattern,
              v.classification
            ];

            daysArray.forEach(d => {
              rowData.push(v.dailyTrips?.[d] || 0);
            });

            rowData.push(v.totalTrips);
            rowData.push(v.totalMT);
            rowData.push(v.totalAdvance || 0);
            rows.push(rowData);
          });

          // Subtotal row
          const subtotalRow = ['', `${cfg.key} TOTAL`, `${pVehicles.length} Vehicles`, '', ''];
          let pTotalTrips = 0;
          let pTotalMT = 0;
          let pTotalAdv = 0;

          daysArray.forEach(d => {
            const daySum = pVehicles.reduce((acc, v) => acc + (v.dailyTrips?.[d] || 0), 0);
            subtotalRow.push(daySum);
          });

          pTotalTrips = pVehicles.reduce((acc, v) => acc + v.totalTrips, 0);
          pTotalMT = pVehicles.reduce((acc, v) => acc + v.totalMT, 0);
          pTotalAdv = pVehicles.reduce((acc, v) => acc + (v.totalAdvance || 0), 0);

          subtotalRow.push(pTotalTrips);
          subtotalRow.push(Math.round(pTotalMT * 100) / 100);
          subtotalRow.push(Math.round(pTotalAdv * 100) / 100);
          rows.push(subtotalRow);
          rows.push([]);
        });

        // Grand Total Row
        const grandRow = ['', 'GRAND TOTAL', `${filteredVehicles.length} Vehicles`, '', ''];
        daysArray.forEach(d => {
          const dSum = filteredVehicles.reduce((acc, v) => acc + (v.dailyTrips?.[d] || 0), 0);
          grandRow.push(dSum);
        });
        grandRow.push(computedTotals.totalTrips);
        grandRow.push(computedTotals.totalMT);
        grandRow.push(computedTotals.totalAdvance);
        rows.push(grandRow);

      } else {
        // Single Date Mode
        rows.push([`DAILY VEHICLE TRIP SUMMARY - DATE: ${date}`]);
        rows.push([`Financial Year: ${financialYear} | Month: ${month} | Total Vehicles: ${computedTotals.totalVehicles} | Total Trips: ${computedTotals.totalTrips} | Total MT: ${computedTotals.totalMT}`]);
        rows.push([]);

        const headers = ['SL NO', 'VEHICLE NUMBER', 'WHEEL', 'LOADING PATTERN', 'CLASSIFICATION', 'TRIPS ON DATE', 'TOTAL MT', 'ADVANCE (₹)', 'OWNER'];
        rows.push(headers);

        filteredVehicles.forEach((v, idx) => {
          rows.push([
            idx + 1,
            v.vehicleNo,
            v.wheel || v.wheelPattern,
            v.loadingPattern,
            v.classification,
            v.totalTrips,
            v.totalMT,
            v.totalAdvance || 0,
            v.contactOwner || '-'
          ]);
        });

        rows.push([]);
        rows.push(['', 'TOTAL', '', '', '', computedTotals.totalTrips, computedTotals.totalMT, computedTotals.totalAdvance, '']);
      }

      const ws = XLSX.utils.aoa_to_sheet(rows);
      const filename = date === 'ALL'
        ? `Vehicle_Wise_Trip_Summary_${financialYear.replace(/\s+/g, '_')}_${month}_Full_Month.xlsx`
        : `Vehicle_Wise_Trip_Summary_${date}.xlsx`;

      XLSX.utils.book_append_sheet(wb, ws, 'Trip Summary');
      XLSX.writeFile(wb, filename);
    } catch (err) {
      console.error('[VehicleWiseTripSummaryTab] Excel Export Error:', err);
    }
  };

  return (
    <Box sx={{ width: '100%', minHeight: '100vh', bgcolor: '#f8fafc', p: { xs: 1.5, md: 3 } }}>
      {/* =========================================================================
          TOP HEADER BAR (Consistent with Daily Operations Dashboard)
         ========================================================================= */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 1.5, md: 2 },
          mb: 2.5,
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          display: 'flex',
          flexWrap: { xs: 'wrap', lg: 'nowrap' },
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: { xs: 1, md: 1.5 },
          bgcolor: '#ffffff'
        }}
      >
        <Box display="flex" alignItems="center" gap={1} flexShrink={0}>
          {onBack && !isModal && (
            <IconButton onClick={onBack} size="small" sx={{ color: '#0f172a', bgcolor: '#f1f5f9', '&:hover': { bgcolor: '#e2e8f0' }, p: 0.8 }}>
              <ArrowBackIcon fontSize="small" />
            </IconButton>
          )}
          <Box sx={{ p: 0.8, bgcolor: '#0f172a', borderRadius: '8px', display: 'flex' }}>
            <LocalShippingIcon sx={{ color: '#38bdf8', fontSize: 20 }} />
          </Box>
          <Box>
            <Typography variant="subtitle1" fontWeight={900} sx={{ letterSpacing: '-0.3px', color: '#0f172a', lineHeight: 1.2, fontSize: { xs: '0.95rem', md: '1.05rem', xl: '1.15rem' }, whiteSpace: 'nowrap' }}>
              Vehicle-Wise Trip Summary
            </Typography>
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600, display: { xs: 'none', '2xl': 'block' }, lineHeight: 1 }}>
              Cement Register Live Data • {date === 'ALL' ? `${month} ${calendarYear}` : date}
            </Typography>
          </Box>
        </Box>

        {/* Center Tabs (only if not in modal mode) */}
        {!isModal && setMainTab && (
          <Box sx={{
            flexShrink: 0,
            display: 'flex',
            justifyContent: 'center',
            order: { xs: 3, lg: 2 },
            width: { xs: '100%', lg: 'auto' },
            mx: { xs: 0, lg: 'auto' }
          }}>
            <Tabs
              value={mainTab}
              onChange={(e, v) => setMainTab(v)}
              variant="scrollable"
              scrollButtons="auto"
              allowScrollButtonsMobile
              sx={{
                minHeight: 34,
                '& .MuiTabs-scroller': { display: 'flex', alignItems: 'center' },
                '& .MuiTabs-flexContainer': { gap: { xs: 0.4, md: 0.6 } },
                '& .MuiTab-root': {
                  minWidth: 'auto',
                  minHeight: 32,
                  borderRadius: '8px',
                  textTransform: 'none',
                  fontWeight: 800,
                  fontSize: { xs: '0.7rem', sm: '0.74rem', md: '0.78rem' },
                  px: { xs: 1, sm: 1.3, md: 1.6 },
                  py: 0.4,
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                  color: '#475569',
                  bgcolor: 'rgba(241, 245, 249, 0.8)',
                  '&:hover': { bgcolor: '#e2e8f0', color: '#0f172a' }
                },
                '& .Mui-selected': {
                  bgcolor: '#0f172a !important',
                  color: '#ffffff !important',
                  boxShadow: '0 2px 8px rgba(15,23,42,0.2)'
                }
              }}
              TabIndicatorProps={{ style: { display: 'none' } }}
            >
              <Tab label="DAILY SUMMARY REPORTS" />
              <Tab label="ALL PARTY REPORTS" />
              <Tab label="VEHICLE WISE TRIP SUMMARY" />
              <Tab label="DAILY REVENUE NVL & NVCL" />
            </Tabs>
          </Box>
        )}

        {/* Top Control Selectors */}
        <Box display="flex" alignItems="center" gap={{ xs: 0.8, md: 1 }} flexShrink={0} sx={{ order: { xs: 2, lg: 3 } }}>
          <FormControl size="small">
            <Select
              value={financialYear}
              onChange={(e) => {
                setFinancialYear(e.target.value);
                setDate('ALL');
              }}
              sx={{
                bgcolor: 'background.default',
                borderRadius: '8px',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
                fontWeight: 700,
                minWidth: { xs: 90, md: 105 },
                fontSize: '0.8rem',
                py: 0
              }}
            >
              {fyOptions.map(fy => <MenuItem key={fy} value={fy} sx={{ fontWeight: 600, fontSize: '0.8rem' }}>{fy}</MenuItem>)}
            </Select>
          </FormControl>

          <FormControl size="small">
            <Select
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                setDate('ALL');
              }}
              sx={{
                bgcolor: 'background.default',
                borderRadius: '8px',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
                fontWeight: 700,
                minWidth: { xs: 90, md: 105 },
                fontSize: '0.8rem',
                py: 0
              }}
            >
              {monthOptions.map(m => <MenuItem key={m} value={m} sx={{ fontWeight: 600, fontSize: '0.8rem' }}>{m}</MenuItem>)}
            </Select>
          </FormControl>

          {/* Calendar-Style Date Selector Button */}
          <Button
            onClick={handleOpenCalendar}
            variant="outlined"
            startIcon={<CalendarTodayIcon sx={{ fontSize: '0.95rem !important', color: '#64748b' }} />}
            endIcon={<KeyboardArrowDownIcon sx={{ fontSize: '1.1rem !important', transition: 'transform 0.2s', transform: calendarAnchorEl ? 'rotate(180deg)' : 'none', color: '#64748b' }} />}
            sx={{
              bgcolor: 'background.default',
              borderRadius: '8px',
              borderColor: '#e2e8f0',
              color: '#0f172a',
              fontWeight: 700,
              minWidth: { xs: 110, md: 125 },
              fontSize: '0.8rem',
              textTransform: 'none',
              px: 1.4,
              py: 0.6,
              boxShadow: 'none',
              '&:hover': { bgcolor: '#f8fafc', borderColor: '#cbd5e1' }
            }}
          >
            {date === 'ALL' ? 'Full Month' : date}
          </Button>

          {/* Calendar Popover */}
          <Popover
            open={Boolean(calendarAnchorEl)}
            anchorEl={calendarAnchorEl}
            onClose={handleCloseCalendar}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            PaperProps={{
              sx: {
                mt: 1,
                p: 2.5,
                borderRadius: '16px',
                boxShadow: '0 10px 40px rgba(0,0,0,0.12)',
                border: '1px solid #e2e8f0',
                width: '320px',
                bgcolor: '#ffffff'
              }
            }}
          >
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography
                variant="subtitle1"
                fontWeight={900}
                color="#0f172a"
                sx={{
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  fontSize: '0.95rem'
                }}
              >
                {month.toUpperCase()} {displayYear}
              </Typography>
            </Box>

            <Button
              fullWidth
              variant={date === 'ALL' ? 'contained' : 'outlined'}
              onClick={() => {
                setDate('ALL');
                handleCloseCalendar();
              }}
              sx={{
                bgcolor: date === 'ALL' ? '#0f172a' : 'transparent',
                color: date === 'ALL' ? '#ffffff' : '#0f172a',
                borderColor: '#0f172a',
                fontWeight: 800,
                borderRadius: '8px',
                mb: 2.2,
                py: 1.1,
                fontSize: '0.88rem',
                textTransform: 'none',
                boxShadow: date === 'ALL' ? '0 4px 12px rgba(15,23,42,0.15)' : 'none',
                '&:hover': {
                  bgcolor: date === 'ALL' ? '#1e293b' : '#f8fafc',
                  borderColor: '#0f172a'
                }
              }}
            >
              ALL (Full Month)
            </Button>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: 0.8,
                userSelect: 'none'
              }}
            >
              {dateOptions.map(d => {
                const isSelected = date !== 'ALL' && (date === d.display || date === d.value || date === String(d.day));
                return (
                  <Box
                    key={d.value}
                    onClick={() => {
                      setDate(d.display);
                      handleCloseCalendar();
                    }}
                    sx={{
                      cursor: 'pointer',
                      bgcolor: isSelected ? '#3b82f6' : 'transparent',
                      color: isSelected ? '#ffffff' : '#1e293b',
                      borderRadius: '8px',
                      py: 0.9,
                      textAlign: 'center',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      '&:hover': {
                        bgcolor: isSelected ? '#2563eb' : '#f1f5f9'
                      }
                    }}
                  >
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: isSelected ? 800 : 600,
                        fontSize: '0.9rem',
                        lineHeight: 1.2
                      }}
                    >
                      {d.day}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          </Popover>

          <Tooltip title="Refresh Live Cement Register Data">
            <IconButton
              size="small"
              onClick={fetchReportData}
              disabled={loading}
              sx={{ color: '#0f172a', bgcolor: '#f1f5f9', '&:hover': { bgcolor: '#e2e8f0' }, p: 0.8 }}
            >
              <RefreshIcon fontSize="small" sx={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            </IconButton>
          </Tooltip>

          <Button
            variant="contained"
            size="small"
            startIcon={<DownloadIcon fontSize="small" />}
            onClick={handleExportExcel}
            sx={{
              bgcolor: '#0284c7',
              color: '#ffffff',
              borderRadius: '8px',
              fontWeight: 800,
              textTransform: 'none',
              fontSize: '0.8rem',
              py: 0.6,
              px: 1.5,
              '&:hover': { bgcolor: '#0369a1' }
            }}
          >
            Export Excel
          </Button>

          {isModal && onCloseModal && (
            <IconButton onClick={onCloseModal} sx={{ color: '#64748b' }}>
              <CloseIcon />
            </IconButton>
          )}
        </Box>
      </Paper>

      {/* =========================================================================
          OPERATIONAL REFERENCE BANNER (Exact Style from Reference Screenshot)
         ========================================================================= */}
      <Box
        sx={{
          bgcolor: '#fed7aa',
          color: '#1e293b',
          border: '2px solid #ea580c',
          borderRadius: '12px',
          p: 1.5,
          mb: 2.5,
          textAlign: 'center',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
        }}
      >
        <Typography
          variant="h6"
          sx={{
            fontWeight: 900,
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
            fontSize: { xs: '15px', md: '18px' },
            color: '#7c2d12'
          }}
        >
          {date === 'ALL'
            ? `MONTH OF ${month.substring(0, 3)}'${String(calendarYear).slice(-2)} VEHICLE - NO OF TRIPS`
            : `DATE: ${date} VEHICLE - NO OF TRIPS`}
        </Typography>
        <Typography variant="caption" sx={{ fontWeight: 800, color: '#9a3412', letterSpacing: '0.5px' }}>
          {date === 'ALL'
            ? `COMPLETE DAY-WISE OPERATIONAL REGISTER • 01-${String(monthIndex + 1).padStart(2, '0')}-${calendarYear} TO ${totalDays}-${String(monthIndex + 1).padStart(2, '0')}-${calendarYear} (${totalDays} CALENDAR DAYS) • SOURCE: CEMENT REGISTER`
            : `DAILY OPERATIONAL REGISTER FOR ${date} • SOURCE: CEMENT REGISTER`}
        </Typography>
      </Box>

      {/* =========================================================================
          KPI SUMMARY CARDS STRIP
         ========================================================================= */}
      <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
        <Grid item xs={6} sm={4} md={2.4}>
          <Card sx={{ borderRadius: '12px', border: '1px solid #e2e8f0', p: 1.5, bgcolor: '#ffffff' }}>
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
              Total Vehicles
            </Typography>
            <Typography variant="h5" fontWeight={900} color="#0284c7">
              {computedTotals.totalVehicles}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Active in {date === 'ALL' ? month : date}
            </Typography>
          </Card>
        </Grid>

        <Grid item xs={6} sm={4} md={2.4}>
          <Card sx={{ borderRadius: '12px', border: '1px solid #e2e8f0', p: 1.5, bgcolor: '#ffffff' }}>
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
              Total Trips
            </Typography>
            <Typography variant="h5" fontWeight={900} color="#059669">
              {computedTotals.totalTrips}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Cement Register count
            </Typography>
          </Card>
        </Grid>

        <Grid item xs={6} sm={4} md={2.4}>
          <Card sx={{ borderRadius: '12px', border: '1px solid #e2e8f0', p: 1.5, bgcolor: '#ffffff' }}>
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
              Total Cement Load
            </Typography>
            <Typography variant="h5" fontWeight={900} color="#d97706">
              {computedTotals.totalMT} <span style={{ fontSize: '13px', fontWeight: 700 }}>MT</span>
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Recorded in register
            </Typography>
          </Card>
        </Grid>

        <Grid item xs={6} sm={4} md={2.4}>
          <Card sx={{ borderRadius: '12px', border: '1px solid #e2e8f0', p: 1.5, bgcolor: '#ffffff' }}>
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
              Total Advance
            </Typography>
            <Typography variant="h5" fontWeight={900} color="#dc2626">
              ₹{Number(computedTotals.totalAdvance || 0).toLocaleString()}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Trip advance paid
            </Typography>
          </Card>
        </Grid>

        <Grid item xs={6} sm={4} md={2.4}>
          <Card sx={{ borderRadius: '12px', border: '1px solid #e2e8f0', p: 1.5, bgcolor: '#ffffff' }}>
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
              Dedicated / Non-Dedicated
            </Typography>
            <Box display="flex" gap={1} mt={0.5}>
              <Chip
                label={`Dedicated: ${filteredVehicles.filter(v => v.isDedicated).length}`}
                size="small"
                sx={{ height: 20, fontSize: '10px', fontWeight: 800, bgcolor: '#e0e7ff', color: '#3730a3' }}
              />
              <Chip
                label={`Single: ${filteredVehicles.filter(v => !v.isDedicated).length}`}
                size="small"
                sx={{ height: 20, fontSize: '10px', fontWeight: 800, bgcolor: '#f1f5f9', color: '#475569' }}
              />
            </Box>
          </Card>
        </Grid>
      </Grid>

      {/* =========================================================================
          TOOLBAR: SEARCH, PATTERN FILTER CHIPS & VIEW SWITCHER
         ========================================================================= */}
      <Paper
        elevation={0}
        sx={{
          p: 2,
          mb: 3,
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          bgcolor: '#ffffff'
        }}
      >
        <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
          <Typography variant="caption" fontWeight={800} color="#64748b" sx={{ textTransform: 'uppercase', mr: 0.5 }}>
            Pattern:
          </Typography>
          {['ALL', '10W', '12W', '14W', '6W'].map(p => (
            <Chip
              key={p}
              label={p}
              size="small"
              onClick={() => setPatternFilter(p)}
              variant={patternFilter === p ? 'filled' : 'outlined'}
              color={patternFilter === p ? 'primary' : 'default'}
              sx={{ fontWeight: 800, cursor: 'pointer', height: 28 }}
            />
          ))}

          <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />

          <Typography variant="caption" fontWeight={800} color="#64748b" sx={{ textTransform: 'uppercase', mr: 0.5 }}>
            Type:
          </Typography>
          <Chip
            label="ALL"
            size="small"
            onClick={() => setDedicatedFilter('ALL')}
            variant={dedicatedFilter === 'ALL' ? 'filled' : 'outlined'}
            color={dedicatedFilter === 'ALL' ? 'secondary' : 'default'}
            sx={{ fontWeight: 800, cursor: 'pointer', height: 28 }}
          />
          <Chip
            label="DEDICATED"
            size="small"
            onClick={() => setDedicatedFilter('DEDICATED')}
            variant={dedicatedFilter === 'DEDICATED' ? 'filled' : 'outlined'}
            color={dedicatedFilter === 'DEDICATED' ? 'secondary' : 'default'}
            sx={{ fontWeight: 800, cursor: 'pointer', height: 28 }}
          />
          <Chip
            label="SINGLE SIDE"
            size="small"
            onClick={() => setDedicatedFilter('NON_DEDICATED')}
            variant={dedicatedFilter === 'NON_DEDICATED' ? 'filled' : 'outlined'}
            color={dedicatedFilter === 'NON_DEDICATED' ? 'secondary' : 'default'}
            sx={{ fontWeight: 800, cursor: 'pointer', height: 28 }}
          />
        </Box>

        <Box display="flex" alignItems="center" gap={2}>
          <TextField
            size="small"
            placeholder="Search vehicle, owner, pattern..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: <SearchIcon sx={{ color: '#94a3b8', mr: 1, fontSize: 18 }} />
            }}
            sx={{ width: { xs: 200, sm: 260 }, bgcolor: '#f8fafc', borderRadius: '8px' }}
          />

          <Box sx={{ display: 'flex', bgcolor: '#f1f5f9', p: 0.5, borderRadius: '8px' }}>
            <Tooltip title="Combined View (Reference Cards + Full Day-Wise Table)">
              <IconButton
                size="small"
                onClick={() => setViewMode('COMBINED')}
                sx={{ bgcolor: viewMode === 'COMBINED' ? '#ffffff' : 'transparent', borderRadius: '6px' }}
              >
                <TableChartIcon fontSize="small" color={viewMode === 'COMBINED' ? 'primary' : 'inherit'} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Spreadsheet Day-Wise Table Only">
              <IconButton
                size="small"
                onClick={() => setViewMode('SPREADSHEET')}
                sx={{ bgcolor: viewMode === 'SPREADSHEET' ? '#ffffff' : 'transparent', borderRadius: '6px' }}
              >
                <TableChartIcon fontSize="small" color={viewMode === 'SPREADSHEET' ? 'primary' : 'inherit'} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Reference Horizontal Strip Cards Only">
              <IconButton
                size="small"
                onClick={() => setViewMode('REFERENCE_STRIP')}
                sx={{ bgcolor: viewMode === 'REFERENCE_STRIP' ? '#ffffff' : 'transparent', borderRadius: '6px' }}
              >
                <ViewModuleIcon fontSize="small" color={viewMode === 'REFERENCE_STRIP' ? 'primary' : 'inherit'} />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </Paper>

      {/* Loading state */}
      {loading ? (
        <Box sx={{ py: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
          <CircularProgress size={40} thickness={4} />
          <Typography variant="body2" fontWeight={700} color="#64748b">
            Loading Vehicle-Wise Trip Register from Cement Register ({date === 'ALL' ? `${month} ${calendarYear}` : date})...
          </Typography>
        </Box>
      ) : filteredVehicles.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
          <LocalShippingIcon sx={{ fontSize: 48, color: '#cbd5e1', mb: 1.5 }} />
          <Typography variant="h6" fontWeight={800} color="#0f172a">
            No vehicle trip records found in Cement Register for {date === 'ALL' ? `${month} ${calendarYear}` : date}
          </Typography>
          <Typography variant="body2" color="#64748b" mt={0.5}>
            Try changing the selected date, month or financial year, or clear active search filters.
          </Typography>
        </Paper>
      ) : (
        /* =========================================================================
            PATTERN SECTIONS (10W, 12W, 14W, 6W, OTHER)
           ========================================================================= */
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {patternConfigs.map(cfg => {
            const patternVehicles = filteredByPattern[cfg.key] || [];
            if (patternVehicles.length === 0) return null;

            // Pattern subtotal calculations
            const patternTotalTrips = patternVehicles.reduce((sum, v) => sum + v.totalTrips, 0);
            const patternTotalMT = Math.round(patternVehicles.reduce((sum, v) => sum + v.totalMT, 0) * 100) / 100;
            const patternDayTotals = {};
            daysArray.forEach(d => {
              patternDayTotals[d] = patternVehicles.reduce((sum, v) => sum + (v.dailyTrips?.[d] || 0), 0);
            });

            return (
              <Paper
                key={cfg.key}
                elevation={0}
                sx={{
                  borderRadius: '16px',
                  border: `2px solid ${cfg.borderColor}`,
                  overflow: 'hidden',
                  bgcolor: '#ffffff',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
                }}
              >
                {/* ── Pattern Header with Operational Rule (from Reference Screenshot) ── */}
                <Box sx={{ bgcolor: cfg.bgColor, p: 2, borderBottom: `1px solid ${cfg.borderColor}` }}>
                  <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
                    <Box>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Chip
                          label={cfg.key}
                          size="small"
                          sx={{
                            fontWeight: 900,
                            bgcolor: cfg.badgeBg,
                            color: cfg.badgeColor,
                            border: `1px solid ${cfg.borderColor}`
                          }}
                        />
                        <Typography variant="subtitle1" fontWeight={900} color="#0f172a" sx={{ letterSpacing: '-0.2px' }}>
                          {cfg.title}
                        </Typography>
                        <Chip
                          label={`${patternVehicles.length} Vehicles • ${patternTotalTrips} Trips • ${patternTotalMT} MT`}
                          size="small"
                          sx={{ fontWeight: 800, height: 22, bgcolor: 'rgba(0,0,0,0.06)', color: '#334155' }}
                        />
                      </Box>
                      <Typography variant="caption" sx={{ display: 'block', fontWeight: 800, color: '#334155', mt: 0.5, letterSpacing: '0.3px' }}>
                        {cfg.ruleHeader}
                      </Typography>
                    </Box>

                    <Typography variant="caption" sx={{ fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {date === 'ALL'
                        ? `NO OF TRIPS FROM 01.${String(monthIndex + 1).padStart(2, '0')}.${String(calendarYear).slice(-2)} - ${totalDays}.${String(monthIndex + 1).padStart(2, '0')}.${String(calendarYear).slice(-2)}`
                        : `NO OF TRIPS ON ${date}`}
                    </Typography>
                  </Box>
                </Box>

                {/* ── Visual Reference Horizontal Strip Cards (from Screenshot) ── */}
                {(viewMode === 'COMBINED' || viewMode === 'REFERENCE_STRIP') && (
                  <Box sx={{ p: 2, bgcolor: '#ffffff', borderBottom: '1px solid #e2e8f0', overflowX: 'auto' }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                      <Typography variant="caption" fontWeight={800} color="#94a3b8" sx={{ textTransform: 'uppercase', letterSpacing: '1px' }}>
                        OPERATIONAL REFERENCE STRIP ({cfg.key}) • CLICK CARD TO VIEW FULL TRIP SUMMARY
                      </Typography>
                    </Box>

                    <Box sx={{ display: 'flex', gap: 1, minWidth: 'max-content', pb: 1 }}>
                      {patternVehicles.map(v => {
                        let vehBg = '#ffffff';
                        if (v.wheelPattern === '14W') {
                          vehBg = '#fef08a';
                        } else if (v.wheelPattern === '6W') {
                          vehBg = '#bae6fd';
                        } else if (v.isDedicated) {
                          vehBg = '#fef9c3';
                        } else {
                          vehBg = '#ffedd5';
                        }

                        return (
                          <Tooltip key={v.normKey} title={`Click to view all Cement Register trips for ${v.vehicleNo}`}>
                            <Box
                              onClick={() => setSelectedVehicleModal(v)}
                              sx={{
                                border: '1.5px solid #334155',
                                borderRadius: '6px',
                                minWidth: 100,
                                maxWidth: 130,
                                textAlign: 'center',
                                bgcolor: '#ffffff',
                                overflow: 'hidden',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                '&:hover': {
                                  transform: 'translateY(-2px)',
                                  boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
                                  borderColor: '#0284c7'
                                }
                              }}
                            >
                              {/* Row 1: WHEEL */}
                              <Box sx={{ bgcolor: '#f1f5f9', py: 0.3, px: 0.5, borderBottom: '1px solid #334155' }}>
                                <Typography variant="caption" sx={{ fontWeight: 800, fontSize: '10px', color: '#475569' }}>
                                  {v.wheel || cfg.key}
                                </Typography>
                              </Box>

                              {/* Row 2: VEHICLE NUMBER (Highlighted) */}
                              <Box sx={{ bgcolor: vehBg, py: 0.6, px: 0.5, borderBottom: '1px solid #334155' }}>
                                <Typography variant="body2" sx={{ fontWeight: 900, fontSize: '11px', color: '#0f172a', whiteSpace: 'nowrap' }}>
                                  {v.vehicleNo}
                                </Typography>
                              </Box>

                              {/* Row 3: NO OF TRIPS (Bold red as in reference screenshot) */}
                              <Box sx={{ py: 0.4, px: 0.5, borderBottom: '1px solid #334155', bgcolor: '#ffffff' }}>
                                <Typography variant="body2" sx={{ fontWeight: 900, fontSize: '13px', color: '#dc2626' }}>
                                  {v.totalTrips}
                                </Typography>
                              </Box>

                              {/* Row 4: LOADING PATTERN */}
                              <Box sx={{ py: 0.4, px: 0.5, bgcolor: '#f8fafc' }}>
                                <Typography variant="caption" sx={{ fontWeight: 800, fontSize: '10px', color: '#334155', display: 'block' }}>
                                  {v.loadingPattern}
                                </Typography>
                              </Box>
                            </Box>
                          </Tooltip>
                        );
                      })}
                    </Box>
                  </Box>
                )}

                {/* ── Complete Day-Wise Matrix Table ── */}
                {(viewMode === 'COMBINED' || viewMode === 'SPREADSHEET') && (
                  <TableContainer sx={{ maxHeight: '600px', overflowX: 'auto', overflowY: 'auto' }}>
                    <Table size="small" stickyHeader sx={{ minWidth: 1200, borderCollapse: 'separate', borderSpacing: 0 }}>
                      <TableHead>
                        <TableRow sx={{ '& th': { bgcolor: '#0f172a', color: '#ffffff', fontWeight: 800, fontSize: '11px', whiteSpace: 'nowrap', borderRight: '1px solid rgba(255,255,255,0.1)' } }}>
                          <TableCell width={36} align="center" sx={{ borderBottom: '2px solid #334155' }}>#</TableCell>
                          {/* Sticky left vehicle column */}
                          <TableCell
                            sx={{
                              position: 'sticky',
                              left: 0,
                              zIndex: 10,
                              bgcolor: '#0f172a !important',
                              borderRight: '2px solid #38bdf8 !important',
                              borderBottom: '2px solid #334155',
                              minWidth: 140
                            }}
                          >
                            VEHICLE NUMBER
                          </TableCell>
                          <TableCell sx={{ borderBottom: '2px solid #334155', minWidth: 70 }}>WHEEL</TableCell>
                          <TableCell sx={{ borderBottom: '2px solid #334155', minWidth: 100 }}>LOADING PATTERN</TableCell>
                          <TableCell sx={{ borderBottom: '2px solid #334155', minWidth: 140 }}>CLASSIFICATION</TableCell>

                          {/* Day Columns (01 to 28/29/30/31) */}
                          {daysArray.map(dayStr => {
                            const isSelectedDayCol = date !== 'ALL' && date.startsWith(dayStr);
                            return (
                              <TableCell
                                key={dayStr}
                                align="center"
                                sx={{
                                  borderBottom: '2px solid #334155',
                                  minWidth: 38,
                                  px: 0.5,
                                  bgcolor: isSelectedDayCol ? '#0284c7' : '#1e293b',
                                  color: '#ffffff'
                                }}
                              >
                                {dayStr}
                              </TableCell>
                            );
                          })}

                          {/* Sticky right totals */}
                          <TableCell
                            align="center"
                            sx={{
                              position: 'sticky',
                              right: 75,
                              zIndex: 10,
                              bgcolor: '#0369a1 !important',
                              borderBottom: '2px solid #334155',
                              minWidth: 75,
                              fontWeight: 900
                            }}
                          >
                            TOTAL TRIPS
                          </TableCell>
                          <TableCell
                            align="right"
                            sx={{
                              position: 'sticky',
                              right: 0,
                              zIndex: 10,
                              bgcolor: '#0f172a !important',
                              borderBottom: '2px solid #334155',
                              minWidth: 80,
                              fontWeight: 900
                            }}
                          >
                            TOTAL MT
                          </TableCell>
                        </TableRow>
                      </TableHead>

                      <TableBody>
                        {patternVehicles.map((v, index) => {
                          const isEven = index % 2 === 0;
                          return (
                            <TableRow
                              key={v.normKey}
                              hover
                              sx={{
                                bgcolor: isEven ? '#ffffff' : '#f8fafc',
                                '&:hover': { bgcolor: '#f1f5f9' },
                                '& td': { borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #f1f5f9', py: 0.8, px: 1, fontSize: '12px' }
                              }}
                            >
                              <TableCell align="center" sx={{ color: '#94a3b8', fontWeight: 600 }}>
                                {index + 1}
                              </TableCell>

                              {/* Sticky Vehicle Number Cell (Clickable -> Full Trip Inspection Modal) */}
                              <TableCell
                                onClick={() => setSelectedVehicleModal(v)}
                                sx={{
                                  position: 'sticky',
                                  left: 0,
                                  zIndex: 5,
                                  bgcolor: isEven ? '#ffffff' : '#f8fafc',
                                  borderRight: '2px solid #38bdf8 !important',
                                  fontWeight: 900,
                                  color: '#0f172a',
                                  cursor: 'pointer',
                                  '&:hover': { bgcolor: '#e0f2fe' }
                                }}
                              >
                                <Tooltip title={`Click to view all Cement Register trips for ${v.vehicleNo}`}>
                                  <Box>
                                    <Box display="flex" alignItems="center" gap={1}>
                                      <Box
                                        sx={{
                                          width: 6,
                                          height: 6,
                                          borderRadius: '50%',
                                          bgcolor: v.isDedicated ? '#10b981' : '#94a3b8'
                                        }}
                                      />
                                      <Typography variant="body2" fontWeight={900} sx={{ fontSize: '12px', letterSpacing: '-0.2px', textDecoration: 'underline' }}>
                                        {v.vehicleNo}
                                      </Typography>
                                    </Box>
                                    {v.contactOwner && (
                                      <Typography variant="caption" sx={{ color: '#64748b', fontSize: '10px', display: 'block', pl: 1.7 }}>
                                        {v.contactOwner}
                                      </Typography>
                                    )}
                                  </Box>
                                </Tooltip>
                              </TableCell>

                              <TableCell sx={{ fontWeight: 800, color: '#334155' }}>
                                {v.wheel || cfg.key}
                              </TableCell>

                              {/* Loading Pattern */}
                              <TableCell sx={{ fontWeight: 700, color: '#0369a1' }}>
                                {v.loadingPattern}
                              </TableCell>

                              {/* Dedicated Classification */}
                              <TableCell>
                                <Chip
                                  label={v.isDedicated ? 'DEDICATED' : 'SINGLE SIDE'}
                                  size="small"
                                  sx={{
                                    height: 20,
                                    fontSize: '10px',
                                    fontWeight: 800,
                                    bgcolor: v.isDedicated ? '#dcfce7' : '#f1f5f9',
                                    color: v.isDedicated ? '#15803d' : '#475569',
                                    border: v.isDedicated ? '1px solid #86efac' : '1px solid #cbd5e1'
                                  }}
                                />
                              </TableCell>

                              {/* Days 01 through N */}
                              {daysArray.map(dayStr => {
                                const tripsOnDay = v.dailyTrips?.[dayStr] || 0;
                                const docs = v.dailyTripDocs?.[dayStr] || [];

                                return (
                                  <TableCell
                                    key={dayStr}
                                    align="center"
                                    onClick={() => {
                                      if (tripsOnDay > 0) {
                                        setSelectedDayTripDetail({
                                          vehNo: v.vehicleNo,
                                          day: dayStr,
                                          trips: docs
                                        });
                                      }
                                    }}
                                    sx={{
                                      px: 0.5,
                                      cursor: tripsOnDay > 0 ? 'pointer' : 'default',
                                      bgcolor: tripsOnDay > 0 ? (tripsOnDay > 1 ? '#e0f2fe' : '#f0fdf4') : 'inherit',
                                      '&:hover': tripsOnDay > 0 ? { bgcolor: '#bae6fd' } : {}
                                    }}
                                  >
                                    {tripsOnDay > 0 ? (
                                      <Tooltip title={`${v.vehicleNo}: ${tripsOnDay} trip(s) on ${dayStr}-${String(monthIndex + 1).padStart(2, '0')}. Click to inspect day trips.`}>
                                        <Box
                                          sx={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            minWidth: 22,
                                            height: 20,
                                            borderRadius: '4px',
                                            bgcolor: tripsOnDay > 1 ? '#0284c7' : '#16a34a',
                                            color: '#ffffff',
                                            fontWeight: 900,
                                            fontSize: '11px',
                                            px: 0.5
                                          }}
                                        >
                                          {tripsOnDay}
                                        </Box>
                                      </Tooltip>
                                    ) : (
                                      <Typography variant="caption" sx={{ color: '#cbd5e1', fontWeight: 600 }}>
                                        0
                                      </Typography>
                                    )}
                                  </TableCell>
                                );
                              })}

                              {/* Sticky Total Trips */}
                              <TableCell
                                align="center"
                                sx={{
                                  position: 'sticky',
                                  right: 75,
                                  zIndex: 5,
                                  bgcolor: isEven ? '#f0f9ff' : '#e0f2fe',
                                  borderLeft: '1px solid #93c5fd',
                                  borderRight: '1px solid #93c5fd',
                                  fontWeight: 900,
                                  color: '#0369a1',
                                  fontSize: '13px'
                                }}
                              >
                                {v.totalTrips}
                              </TableCell>

                              {/* Sticky Total MT */}
                              <TableCell
                                align="right"
                                sx={{
                                  position: 'sticky',
                                  right: 0,
                                  zIndex: 5,
                                  bgcolor: isEven ? '#ffffff' : '#f8fafc',
                                  fontWeight: 900,
                                  color: '#0f172a'
                                }}
                              >
                                {v.totalMT}
                              </TableCell>
                            </TableRow>
                          );
                        })}

                        {/* Pattern Subtotal Row */}
                        <TableRow sx={{ bgcolor: cfg.badgeBg, '& td': { fontWeight: 900, fontSize: '12px', borderTop: '2px solid #334155', borderBottom: '2px solid #334155', py: 1 } }}>
                          <TableCell></TableCell>
                          <TableCell
                            sx={{
                              position: 'sticky',
                              left: 0,
                              zIndex: 6,
                              bgcolor: `${cfg.badgeBg} !important`,
                              borderRight: '2px solid #38bdf8 !important',
                              color: cfg.badgeColor
                            }}
                          >
                            {cfg.key} TOTAL ({patternVehicles.length} VEHS)
                          </TableCell>
                          <TableCell sx={{ color: cfg.badgeColor }}>{cfg.key}</TableCell>
                          <TableCell></TableCell>
                          <TableCell></TableCell>

                          {/* Pattern day sums */}
                          {daysArray.map(dayStr => {
                            const dSum = patternDayTotals[dayStr] || 0;
                            return (
                              <TableCell key={dayStr} align="center" sx={{ color: dSum > 0 ? '#0f172a' : '#94a3b8', fontWeight: 900 }}>
                                {dSum}
                              </TableCell>
                            );
                          })}

                          {/* Pattern Total Trips */}
                          <TableCell
                            align="center"
                            sx={{
                              position: 'sticky',
                              right: 75,
                              zIndex: 6,
                              bgcolor: '#0284c7 !important',
                              color: '#ffffff',
                              fontWeight: 900,
                              fontSize: '13px'
                            }}
                          >
                            {patternTotalTrips}
                          </TableCell>

                          {/* Pattern Total MT */}
                          <TableCell
                            align="right"
                            sx={{
                              position: 'sticky',
                              right: 0,
                              zIndex: 6,
                              bgcolor: `${cfg.badgeBg} !important`,
                              color: '#0f172a',
                              fontWeight: 900
                            }}
                          >
                            {patternTotalMT}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Paper>
            );
          })}

          {/* =======================================================================
              GRAND TOTAL BAR
             ======================================================================= */}
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              borderRadius: '16px',
              border: '2px solid #0f172a',
              bgcolor: '#0f172a',
              color: '#ffffff',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 2
            }}
          >
            <Box>
              <Typography variant="h6" fontWeight={900} sx={{ letterSpacing: '-0.2px', color: '#ffffff' }}>
                GRAND TOTAL: {computedTotals.totalTrips} TRIPS • {computedTotals.totalMT} MT
              </Typography>
              <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600 }}>
                Across {computedTotals.totalVehicles} Vehicles • Total Trip Advance: ₹{Number(computedTotals.totalAdvance || 0).toLocaleString()} • Single Source of Truth: Cement Register
              </Typography>
            </Box>

            <Box display="flex" alignItems="center" gap={2}>
              <Button
                variant="contained"
                startIcon={<DownloadIcon />}
                onClick={handleExportExcel}
                sx={{
                  bgcolor: '#38bdf8',
                  color: '#0f172a',
                  fontWeight: 900,
                  borderRadius: '10px',
                  textTransform: 'none',
                  px: 3,
                  '&:hover': { bgcolor: '#7dd3fc' }
                }}
              >
                Export Excel Sheet (.xlsx)
              </Button>
            </Box>
          </Paper>
        </Box>
      )}

      {/* =========================================================================
          VIEW FULL TRIP SUMMARY MODAL (When clicking Vehicle Card or Vehicle No)
         ========================================================================= */}
      <Dialog
        open={Boolean(selectedVehicleModal)}
        onClose={() => setSelectedVehicleModal(null)}
        maxWidth="lg"
        fullWidth
        PaperProps={{ sx: { borderRadius: '16px', bgcolor: '#ffffff' } }}
      >
        <DialogTitle sx={{ bgcolor: '#0f172a', color: '#ffffff', px: 3, py: 2 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box display="flex" alignItems="center" gap={1.5}>
              <LocalShippingIcon sx={{ color: '#38bdf8', fontSize: 28 }} />
              <Box>
                <Typography variant="h6" fontWeight={900} color="#ffffff">
                  VIEW FULL TRIP SUMMARY: {selectedVehicleModal?.vehicleNo}
                </Typography>
                <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600 }}>
                  Single Source of Truth: Cement Register Records ({month} {calendarYear})
                </Typography>
              </Box>
            </Box>
            <IconButton size="small" onClick={() => setSelectedVehicleModal(null)} sx={{ color: '#94a3b8', '&:hover': { color: '#ffffff' } }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          {selectedVehicleModal && (
            <Box display="flex" flexDirection="column" gap={2}>
              {/* Vehicle Meta Strip */}
              <Paper sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={12} sm={6} md={3}>
                    <Typography variant="caption" color="text.secondary" fontWeight={700}>VEHICLE & OWNER</Typography>
                    <Typography variant="body1" fontWeight={900} color="#0f172a">{selectedVehicleModal.vehicleNo}</Typography>
                    <Typography variant="caption" color="#64748b">{selectedVehicleModal.contactOwner || 'No owner recorded'}</Typography>
                  </Grid>
                  <Grid item xs={6} sm={3} md={2}>
                    <Typography variant="caption" color="text.secondary" fontWeight={700}>WHEEL & PATTERN</Typography>
                    <Typography variant="body1" fontWeight={800} color="#0284c7">{selectedVehicleModal.wheel || selectedVehicleModal.wheelPattern}</Typography>
                    <Typography variant="caption" color="#0369a1">{selectedVehicleModal.loadingPattern}</Typography>
                  </Grid>
                  <Grid item xs={6} sm={3} md={2}>
                    <Typography variant="caption" color="text.secondary" fontWeight={700}>CLASSIFICATION</Typography>
                    <Box mt={0.5}>
                      <Chip
                        label={selectedVehicleModal.isDedicated ? 'DEDICATED' : 'SINGLE SIDE'}
                        size="small"
                        sx={{
                          fontWeight: 800,
                          bgcolor: selectedVehicleModal.isDedicated ? '#dcfce7' : '#f1f5f9',
                          color: selectedVehicleModal.isDedicated ? '#15803d' : '#475569'
                        }}
                      />
                    </Box>
                  </Grid>
                  <Grid item xs={6} sm={3} md={2.5}>
                    <Typography variant="caption" color="text.secondary" fontWeight={700}>TOTAL VOLUME</Typography>
                    <Typography variant="body1" fontWeight={900} color="#059669">{selectedVehicleModal.totalTrips} Trips • {selectedVehicleModal.totalMT} MT</Typography>
                    <Typography variant="caption" color="#64748b">In selected period</Typography>
                  </Grid>
                  <Grid item xs={6} sm={3} md={2.5}>
                    <Typography variant="caption" color="text.secondary" fontWeight={700}>TOTAL ADVANCE</Typography>
                    <Typography variant="body1" fontWeight={900} color="#dc2626">₹{Number(selectedVehicleModal.totalAdvance || 0).toLocaleString()}</Typography>
                    <Typography variant="caption" color="#64748b">Loading advance</Typography>
                  </Grid>
                </Grid>
              </Paper>

              {/* Trips Table */}
              <Typography variant="subtitle2" fontWeight={800} color="#0f172a">
                All Cement Register Trips ({selectedVehicleModal.trips?.length || 0})
              </Typography>
              <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '10px', maxHeight: 420 }}>
                <Table size="small" stickyHeader>
                  <TableHead sx={{ bgcolor: '#f1f5f9' }}>
                    <TableRow sx={{ '& th': { fontWeight: 800, fontSize: '11px', color: '#334155', bgcolor: '#f1f5f9' } }}>
                      <TableCell>#</TableCell>
                      <TableCell>CEMENT REGISTER _ID</TableCell>
                      <TableCell>LOADING DATE</TableCell>
                      <TableCell>INVOICE NO</TableCell>
                      <TableCell>SHIPMENT / GCN</TableCell>
                      <TableCell>PARTY NAME</TableCell>
                      <TableCell>DESTINATION</TableCell>
                      <TableCell align="right">MT</TableCell>
                      <TableCell align="right">ADVANCE (₹)</TableCell>
                      <TableCell align="right">HSD (LTR)</TableCell>
                      <TableCell align="right">BILLING AMT (₹)</TableCell>
                      <TableCell>STATUS</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {selectedVehicleModal.trips?.map((t, idx) => (
                      <TableRow key={t._id || idx} hover>
                        <TableCell sx={{ color: '#94a3b8', fontWeight: 600 }}>{idx + 1}</TableCell>
                        <TableCell>
                          <Typography variant="caption" sx={{ fontFamily: 'monospace', bgcolor: '#f1f5f9', px: 0.8, py: 0.3, borderRadius: '4px', color: '#475569', fontSize: '10px' }}>
                            {String(t._id)}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {t['LOADING DT'] || t['LOADING DATE'] || '-'}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#0f172a' }}>
                          {t['INVOICE NO'] || t['INVOICE NO.'] || '-'}
                        </TableCell>
                        <TableCell sx={{ color: '#64748b' }}>
                          {t['SHIPMENT NO'] || t['GCN NO'] || t['E-WAY BILL NO'] || '-'}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600, color: '#334155' }}>
                          {t['PARTY NAME'] || '-'}
                        </TableCell>
                        <TableCell sx={{ color: '#475569' }}>
                          {t['DESTINATION'] || '-'}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800, color: '#0284c7' }}>
                          {t['MT'] || 0}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, color: '#b91c1c' }}>
                          ₹{parseNum(t['ADVANCE'] || t['LOADING ADVANCE']).toLocaleString()}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, color: '#d97706' }}>
                          {parseNum(t['HSD (LTR)'] || t['QTY (LTR)'])} L
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, color: '#0f172a' }}>
                          ₹{parseNum(t['Billing Amount'] || t['BILLING AMOUNT'] || t['AMOUNT']).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={t['CHALLAN STATUS'] || 'RECORDED'}
                            size="small"
                            sx={{ height: 20, fontSize: '10px', fontWeight: 800 }}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setSelectedVehicleModal(null)} variant="outlined" sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700 }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* =========================================================================
          INSPECTION DIALOG (When user clicks a day's trip count cell)
         ========================================================================= */}
      <Dialog
        open={Boolean(selectedDayTripDetail)}
        onClose={() => setSelectedDayTripDetail(null)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: '16px', bgcolor: '#ffffff' } }}
      >
        <DialogTitle sx={{ bgcolor: '#0f172a', color: '#ffffff', px: 3, py: 2 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box display="flex" alignItems="center" gap={1}>
              <LocalShippingIcon sx={{ color: '#38bdf8' }} />
              <Typography variant="subtitle1" fontWeight={800} color="#ffffff">
                Day Trips: {selectedDayTripDetail?.vehNo} on {selectedDayTripDetail?.day}-{String(monthIndex + 1).padStart(2, '0')}-{calendarYear}
              </Typography>
            </Box>
            <IconButton size="small" onClick={() => setSelectedDayTripDetail(null)} sx={{ color: '#94a3b8', '&:hover': { color: '#ffffff' } }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 2.5 }}>
          {selectedDayTripDetail?.trips?.length > 0 ? (
            <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '10px' }}>
              <Table size="small">
                <TableHead sx={{ bgcolor: '#f8fafc' }}>
                  <TableRow sx={{ '& th': { fontWeight: 800, fontSize: '11px', color: '#475569' } }}>
                    <TableCell>INVOICE NO</TableCell>
                    <TableCell>CEMENT REGISTER _ID</TableCell>
                    <TableCell>PARTY NAME</TableCell>
                    <TableCell>DESTINATION</TableCell>
                    <TableCell align="right">MT</TableCell>
                    <TableCell align="right">ADVANCE (₹)</TableCell>
                    <TableCell align="right">HSD (LTR)</TableCell>
                    <TableCell>STATUS</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {selectedDayTripDetail.trips.map((t, idx) => (
                    <TableRow key={t._id || idx} hover>
                      <TableCell sx={{ fontWeight: 800, color: '#0f172a' }}>
                        {t['INVOICE NO'] || t['INVOICE NO.'] || '-'}
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace', bgcolor: '#f1f5f9', px: 0.8, py: 0.3, borderRadius: '4px', color: '#475569', fontSize: '10px' }}>
                          {String(t._id)}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, color: '#334155' }}>
                        {t['PARTY NAME'] || '-'}
                      </TableCell>
                      <TableCell sx={{ color: '#475569' }}>
                        {t['DESTINATION'] || '-'}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800, color: '#0284c7' }}>
                        {t['MT'] || 0}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: '#b91c1c' }}>
                        ₹{parseNum(t['ADVANCE'] || t['LOADING ADVANCE']).toLocaleString()}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: '#d97706' }}>
                        {parseNum(t['HSD (LTR)'] || t['QTY (LTR)'])} L
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={t['CHALLAN STATUS'] || 'RECORDED'}
                          size="small"
                          sx={{ height: 20, fontSize: '10px', fontWeight: 800 }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Typography variant="body2" color="#64748b">No trip records found for this date in Cement Register.</Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setSelectedDayTripDetail(null)} variant="outlined" sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700 }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
