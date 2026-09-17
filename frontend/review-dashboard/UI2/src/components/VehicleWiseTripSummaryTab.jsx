import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Button, IconButton, Grid, Card, CircularProgress,
  Tabs, Tab, Select, MenuItem, FormControl, TableContainer, Table, TableHead,
  TableRow, TableCell, TableBody, Paper, TextField, Tooltip, Chip, Dialog,
  DialogTitle, DialogContent, DialogActions, Divider
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import TableChartIcon from '@mui/icons-material/TableChart';
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

// Parse a record's loading date and check if it matches the selected year and month
// Returns day number (1-31) or null
export const extractDayNumber = (dStr, targetYear, targetMonthIndex) => {
  if (!dStr) return null;
  const s = String(dStr).trim();
  if (!s || s === '-' || s.toLowerCase() === 'null') return null;

  let d = null;
  let m = null;
  let y = null;

  // Pattern: DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
  const parts = s.split(/[\/\-\.]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      y = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10);
      d = parseInt(parts[2], 10);
    } else {
      // DD-MM-YYYY
      d = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10);
      y = parseInt(parts[2], 10);
      if (y < 100) y += 2000;
    }
  }

  if (d && m && y) {
    if (y === targetYear && m === targetMonthIndex + 1) {
      return d;
    }
  }
  return null;
};

export default function VehicleWiseTripSummaryTab({
  financialYear,
  setFinancialYear,
  month,
  setMonth,
  fyOptions = [],
  monthOptions = [],
  mainTab,
  setMainTab,
  onBack,
  isModal = false,
  onCloseModal = null
}) {
  const [loading, setLoading] = useState(false);
  const [cementEntries, setCementEntries] = useState([]);
  const [truckContacts, setTruckContacts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [patternFilter, setPatternFilter] = useState('ALL');
  const [dedicatedFilter, setDedicatedFilter] = useState('ALL');
  const [viewMode, setViewMode] = useState('COMBINED'); // 'COMBINED' | 'SPREADSHEET' | 'REFERENCE_STRIP'
  const [selectedDayTripDetail, setSelectedDayTripDetail] = useState(null); // { vehNo, day, trips }

  // Calendar year and day array for selected month
  const calendarYear = useMemo(() => getCalendarYear(financialYear, month), [financialYear, month]);
  const monthIndex = useMemo(() => MONTH_NAMES.indexOf(month), [month]);
  const totalDays = useMemo(() => getDaysCountInMonth(calendarYear, month), [calendarYear, month]);

  // Array of day strings: ['01', '02', ..., totalDays]
  const daysArray = useMemo(() => {
    const arr = [];
    for (let i = 1; i <= totalDays; i++) {
      arr.push(String(i).padStart(2, '0'));
    }
    return arr;
  }, [totalDays]);

  // Fetch complete Cement Register data for selected month + truck contacts
  const fetchReportData = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const [dailyRes, contactsRes] = await Promise.all([
        axios.get(`${API_URL}/daily-summary/data`, {
          params: { date: 'ALL', fy: financialYear, month },
          headers
        }).catch(err => ({ data: { success: false, error: err.message } })),
        axios.get(`${API_URL}/truck-contacts`, { headers })
          .catch(() => ({ data: { success: false, contacts: [] } }))
      ]);

      if (dailyRes.data?.success && Array.isArray(dailyRes.data.cement)) {
        setCementEntries(dailyRes.data.cement);
      } else {
        setCementEntries([]);
      }

      if (contactsRes.data?.contacts && Array.isArray(contactsRes.data.contacts)) {
        setTruckContacts(contactsRes.data.contacts);
      }
    } catch (err) {
      console.error('[VehicleWiseTripSummaryTab] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [financialYear, month]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  // Real-time synchronization
  useEffect(() => {
    const handler = () => fetchReportData();
    socket.on('cementUpdates', handler);
    socket.on('mainCashbookUpdates', handler);
    return () => {
      socket.off('cementUpdates', handler);
      socket.off('mainCashbookUpdates', handler);
    };
  }, [fetchReportData]);

  // Map of truck contact details for fallback lookups
  const truckContactMap = useMemo(() => {
    const map = {};
    truckContacts.forEach(c => {
      const rawNo = c['Truck No '] || c['Truck No'] || c.truck_no || '';
      const key = String(rawNo).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      if (key) {
        map[key] = {
          vehType: (c['Type of vehicle '] || c['Type of vehicle'] || c.veh_type || '').trim(),
          custType: (c['TYPE OF CUSTOMER '] || c.cust_type || '').trim(),
          owner: (c['Owner Name '] || c['Owner Name'] || c.owner_name || '').trim()
        };
      }
    });
    return map;
  }, [truckContacts]);

  // Aggregate trip data per vehicle and day
  const computedData = useMemo(() => {
    if (!cementEntries || cementEntries.length === 0) {
      return { vehicles: [], byPattern: {}, totals: { totalVehicles: 0, totalTrips: 0, totalMT: 0, dayTotals: {} } };
    }

    const vehMap = {};
    const seenTripIds = new Set(); // De-duplication check: prevent double counting identical invoice records

    cementEntries.forEach(row => {
      const rawVeh = row['VEHICLE NUMBER'] || row['VEHICLE NO'] || row['VEHICLE NO.'] || '';
      const vehClean = String(rawVeh).trim().toUpperCase();
      if (!vehClean || vehClean === '-' || vehClean === 'UNKNOWN') return;

      const normKey = vehClean.replace(/[^a-zA-Z0-9]/g, '');

      // Exclude pure adjustment / diesel deduction rows that have no MT, no invoice, and 0 billing amount
      const mtVal = parseNum(row['MT']);
      const billAmt = parseNum(row['Billing Amount'] || row['BILLING AMOUNT'] || row['AMOUNT']);
      const invNo = String(row['INVOICE NO'] || row['INVOICE NO.'] || '').trim();
      const loadDateRaw = row['LOADING DT'] || row['LOADING DATE'] || '';

      if (mtVal === 0 && billAmt === 0 && !invNo) {
        return;
      }

      // De-duplicate multiple identical invoice records
      const tripId = invNo ? `${normKey}_${invNo}` : String(row._id || `${normKey}_${loadDateRaw}_${mtVal}`);
      if (seenTripIds.has(tripId)) {
        return; // Skip duplicate
      }
      seenTripIds.add(tripId);

      const dayNum = extractDayNumber(loadDateRaw, calendarYear, monthIndex);

      if (!vehMap[normKey]) {
        // Look up master contact if available
        const contact = truckContactMap[normKey] || {};

        // Extract wheel from record or contact
        let rawWheel = String(row['WHEEL'] || contact.vehType || '').trim().toUpperCase();
        let wheelKey = 'OTHER';
        if (rawWheel.includes('10')) wheelKey = '10W';
        else if (rawWheel.includes('12')) wheelKey = '12W';
        else if (rawWheel.includes('14')) wheelKey = '14W';
        else if (rawWheel.includes('6')) wheelKey = '6W';

        // Check Dedicated classification
        const rawDedicated = String(row['DEDICATED'] || '').trim();
        const billType = String(row['Bill Type'] || row['BILL TYPE'] || '').trim().toUpperCase();
        const custType = String(contact.custType || '').toUpperCase();
        const hasDedicatedAmt = rawDedicated && rawDedicated !== '-' && parseNum(rawDedicated) > 0;
        const isDedicatedType = billType === 'NT' || custType === 'ATOA' || custType === 'ATO' || custType === 'DEDICATED';

        vehMap[normKey] = {
          vehicleNo: vehClean,
          normKey,
          wheel: rawWheel || wheelKey,
          wheelPattern: wheelKey,
          isDedicatedInitial: Boolean(hasDedicatedAmt || isDedicatedType),
          contactOwner: contact.owner || row['OWNER NAME'] || '',
          distinctMTs: new Set(),
          dailyTrips: {},      // dayStr -> count
          dailyTripDocs: {},   // dayStr -> array of records
          totalTrips: 0,
          totalMT: 0,
          allTrips: []
        };
      }

      const v = vehMap[normKey];
      if (mtVal > 0) {
        v.distinctMTs.add(mtVal);
        v.totalMT += mtVal;
      }
      v.allTrips.push(row);

      if (dayNum !== null && dayNum >= 1 && dayNum <= totalDays) {
        const dayStr = String(dayNum).padStart(2, '0');
        v.dailyTrips[dayStr] = (v.dailyTrips[dayStr] || 0) + 1;
        if (!v.dailyTripDocs[dayStr]) v.dailyTripDocs[dayStr] = [];
        v.dailyTripDocs[dayStr].push(row);
        v.totalTrips += 1;
      } else {
        // Even if day couldn't be parsed into a calendar day of this month, count towards total if within month
        v.totalTrips += 1;
      }
    });

    // Format loading pattern and finalize dedicated classification (Raftar thresholds)
    const vehicleList = Object.values(vehMap).map(v => {
      // Formatted Loading Pattern: e.g. "18MT / 19MT", "25MT", "30MT"
      const mtArray = Array.from(v.distinctMTs).sort((a, b) => a - b);
      let loadingPatternStr = '';
      if (mtArray.length > 0) {
        loadingPatternStr = mtArray.map(m => `${m}MT`).join(' / ');
      } else {
        // Standard default pattern by wheel if MT was not explicit
        if (v.wheelPattern === '10W') loadingPatternStr = '18MT / 19MT';
        else if (v.wheelPattern === '12W') loadingPatternStr = '25MT';
        else if (v.wheelPattern === '14W') loadingPatternStr = '30MT';
        else if (v.wheelPattern === '6W') loadingPatternStr = '13MT';
        else loadingPatternStr = '-';
      }

      // Raftar Dedicated Logic from operational rules:
      // 10W: >= 8 trips = Raftar Qualified Dedicated (Both Side Toll)
      // 12W / 14W: >= 6 trips = Raftar Qualified Dedicated (Both Side Toll)
      const meetsRaftarThreshold = (v.wheelPattern === '10W' && v.totalTrips >= 8) ||
        ((v.wheelPattern === '12W' || v.wheelPattern === '14W') && v.totalTrips >= 6);

      const isDedicated = v.isDedicatedInitial || meetsRaftarThreshold;

      return {
        ...v,
        totalMT: Math.round(v.totalMT * 100) / 100,
        loadingPattern: loadingPatternStr,
        isDedicated,
        meetsRaftarThreshold,
        classification: isDedicated ? 'DEDICATED (Both Side)' : 'SINGLE SIDE (Non-Dedicated)'
      };
    });

    // Sort vehicles stably: By wheel pattern order, then alphabetical vehicle number
    const patternSortOrder = { '10W': 1, '12W': 2, '14W': 3, '6W': 4, 'OTHER': 5 };
    vehicleList.sort((a, b) => {
      const pA = patternSortOrder[a.wheelPattern] || 99;
      const pB = patternSortOrder[b.wheelPattern] || 99;
      if (pA !== pB) return pA - pB;
      return a.vehicleNo.localeCompare(b.vehicleNo);
    });

    // Group by pattern
    const byPattern = {
      '10W': [],
      '12W': [],
      '14W': [],
      '6W': [],
      'OTHER': []
    };

    vehicleList.forEach(v => {
      if (byPattern[v.wheelPattern]) {
        byPattern[v.wheelPattern].push(v);
      } else {
        byPattern['OTHER'].push(v);
      }
    });

    // Calculate daily totals across all vehicles
    const dayTotals = {};
    daysArray.forEach(d => { dayTotals[d] = 0; });

    let grandTotalTrips = 0;
    let grandTotalMT = 0;

    vehicleList.forEach(v => {
      grandTotalTrips += v.totalTrips;
      grandTotalMT += v.totalMT;
      daysArray.forEach(d => {
        dayTotals[d] += (v.dailyTrips[d] || 0);
      });
    });

    return {
      vehicles: vehicleList,
      byPattern,
      totals: {
        totalVehicles: vehicleList.length,
        totalTrips: grandTotalTrips,
        totalMT: Math.round(grandTotalMT * 100) / 100,
        dayTotals
      }
    };
  }, [cementEntries, truckContactMap, calendarYear, monthIndex, totalDays, daysArray]);

  // Filtered vehicles based on search & chips
  const filteredVehicles = useMemo(() => {
    let list = computedData.vehicles;

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
        v.contactOwner.toLowerCase().includes(q) ||
        v.loadingPattern.toLowerCase().includes(q)
      );
    }

    return list;
  }, [computedData.vehicles, patternFilter, dedicatedFilter, searchTerm]);

  // Regroup filtered vehicles by pattern
  const filteredByPattern = useMemo(() => {
    const groups = { '10W': [], '12W': [], '14W': [], '6W': [], 'OTHER': [] };
    filteredVehicles.forEach(v => {
      if (groups[v.wheelPattern]) groups[v.wheelPattern].push(v);
      else groups['OTHER'].push(v);
    });
    return groups;
  }, [filteredVehicles]);

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

  // Excel Export: Full Month-Wise, Day-Wise Operational Register
  const handleExportExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      // Header row structure
      const rows = [];

      // Row 1: Main Title Banner
      rows.push([`MONTH OF ${month.substring(0, 3)}'${String(calendarYear).slice(-2)} VEHICLE- NO OF TRIPS`]);
      rows.push([`Financial Year: ${financialYear} | Selected Month: ${month} ${calendarYear} | Total Days: ${totalDays} | Total Vehicles: ${computedData.totals.totalVehicles} | Total Trips: ${computedData.totals.totalTrips}`]);
      rows.push([]); // Empty spacing line

      // Build table headers
      const tableHeaders = ['SL NO', 'WHEEL', 'VEHICLE NUMBER', 'LOADING PATTERN', 'CLASSIFICATION'];
      daysArray.forEach(d => {
        tableHeaders.push(`${d}-${String(monthIndex + 1).padStart(2, '0')}`);
      });
      tableHeaders.push('TOTAL TRIPS', 'TOTAL MT');

      rows.push(tableHeaders);

      // Add vehicles grouped by pattern
      patternConfigs.forEach(cfg => {
        const pVehicles = filteredByPattern[cfg.key] || [];
        if (pVehicles.length === 0) return;

        // Pattern Rule Header Banner in Excel
        rows.push([`--- ${cfg.title} --- ${cfg.ruleHeader}`]);

        pVehicles.forEach((v, idx) => {
          const rowData = [
            idx + 1,
            v.wheel || cfg.key,
            v.vehicleNo,
            v.loadingPattern,
            v.classification
          ];

          // Daily counts
          daysArray.forEach(d => {
            rowData.push(v.dailyTrips[d] || 0);
          });

          rowData.push(v.totalTrips);
          rowData.push(v.totalMT);
          rows.push(rowData);
        });

        // Pattern subtotal row
        const subtotalRow = ['', `${cfg.key} TOTAL`, `${pVehicles.length} Vehicles`, '', ''];
        let pTotalTrips = 0;
        let pTotalMT = 0;

        daysArray.forEach(d => {
          const daySum = pVehicles.reduce((acc, v) => acc + (v.dailyTrips[d] || 0), 0);
          subtotalRow.push(daySum);
        });

        pTotalTrips = pVehicles.reduce((acc, v) => acc + v.totalTrips, 0);
        pTotalMT = pVehicles.reduce((acc, v) => acc + v.totalMT, 0);

        subtotalRow.push(pTotalTrips);
        subtotalRow.push(Math.round(pTotalMT * 100) / 100);
        rows.push(subtotalRow);
        rows.push([]); // spacing row
      });

      // Grand Total Row
      const grandRow = ['', 'GRAND TOTAL', `${filteredVehicles.length} Vehicles`, '', ''];
      daysArray.forEach(d => {
        const dSum = filteredVehicles.reduce((acc, v) => acc + (v.dailyTrips[d] || 0), 0);
        grandRow.push(dSum);
      });
      const grandTrips = filteredVehicles.reduce((acc, v) => acc + v.totalTrips, 0);
      const grandMT = filteredVehicles.reduce((acc, v) => acc + v.totalMT, 0);
      grandRow.push(grandTrips);
      grandRow.push(Math.round(grandMT * 100) / 100);
      rows.push(grandRow);

      const ws = XLSX.utils.aoa_to_sheet(rows);

      // Set nice column widths
      ws['!cols'] = [
        { wch: 7 },   // SL
        { wch: 10 },  // Wheel
        { wch: 16 },  // Vehicle No
        { wch: 16 },  // Loading Pattern
        { wch: 25 },  // Classification
        ...daysArray.map(() => ({ wch: 6 })), // Day columns
        { wch: 12 },  // Total Trips
        { wch: 12 }   // Total MT
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Trip Summary');
      XLSX.writeFile(wb, `Vehicle_Wise_Trip_Summary_${financialYear}_${month}_${calendarYear}.xlsx`);
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
          p: 2,
          mb: 2.5,
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          bgcolor: '#ffffff'
        }}
      >
        <Box display="flex" alignItems="center" gap={1.5}>
          {onBack && !isModal && (
            <IconButton onClick={onBack} sx={{ color: '#0f172a', '&:hover': { bgcolor: '#f1f5f9' } }}>
              <ArrowBackIcon />
            </IconButton>
          )}
          <Box sx={{ p: 1, bgcolor: '#0f172a', borderRadius: '10px', display: 'flex' }}>
            <LocalShippingIcon sx={{ color: '#38bdf8', fontSize: 24 }} />
          </Box>
          <Box>
            <Typography variant="h6" fontWeight={900} sx={{ letterSpacing: '-0.3px', color: '#0f172a' }}>
              Vehicle-Wise Trip Summary
            </Typography>
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
              Month-Wise & Day-Wise Pattern Register • {month} {calendarYear}
            </Typography>
          </Box>
        </Box>

        {/* Center Tabs (only if not in modal mode) */}
        {!isModal && setMainTab && (
          <Box sx={{ display: 'flex', justifyContent: 'center' }}>
            <Tabs
              value={mainTab}
              onChange={(e, v) => setMainTab(v)}
              sx={{
                minHeight: 40,
                '& .MuiTab-root': {
                  minHeight: 40,
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 800,
                  px: 2.5,
                  mx: 0.5,
                  transition: 'all 0.3s ease'
                },
                '& .Mui-selected': {
                  bgcolor: '#0f172a',
                  color: '#fff !important',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                }
              }}
              TabIndicatorProps={{ style: { display: 'none' } }}
            >
              <Tab label="DAILY SUMMARY REPORTS" />
              <Tab label="ALL PARTY REPORTS" />
              <Tab label="VEHICLE WISE TRIP SUMMARY" />
            </Tabs>
          </Box>
        )}

        {/* Top Control Selectors */}
        <Box display="flex" alignItems="center" gap={1.5}>
          <FormControl size="small">
            <Select
              value={financialYear}
              onChange={(e) => setFinancialYear(e.target.value)}
              sx={{
                bgcolor: 'background.default',
                borderRadius: '8px',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
                fontWeight: 700,
                minWidth: 120
              }}
            >
              {fyOptions.map(fy => <MenuItem key={fy} value={fy} sx={{ fontWeight: 600 }}>{fy}</MenuItem>)}
            </Select>
          </FormControl>

          <FormControl size="small">
            <Select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              sx={{
                bgcolor: 'background.default',
                borderRadius: '8px',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
                fontWeight: 700,
                minWidth: 125
              }}
            >
              {monthOptions.map(m => <MenuItem key={m} value={m} sx={{ fontWeight: 600 }}>{m}</MenuItem>)}
            </Select>
          </FormControl>

          <Tooltip title="Refresh Trip Data">
            <IconButton
              onClick={fetchReportData}
              disabled={loading}
              sx={{ color: '#0f172a', bgcolor: '#f1f5f9', '&:hover': { bgcolor: '#e2e8f0' } }}
            >
              <RefreshIcon sx={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            </IconButton>
          </Tooltip>

          <Button
            variant="contained"
            startIcon={<DownloadIcon />}
            onClick={handleExportExcel}
            sx={{
              bgcolor: '#0284c7',
              color: '#ffffff',
              borderRadius: '8px',
              fontWeight: 800,
              textTransform: 'none',
              px: 2,
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
          bgcolor: '#fed7aa', // Peach/apricot background as in reference screenshot
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
          MONTH OF {month.substring(0, 3)}'{String(calendarYear).slice(-2)} VEHICLE - NO OF TRIPS
        </Typography>
        <Typography variant="caption" sx={{ fontWeight: 800, color: '#9a3412', letterSpacing: '0.5px' }}>
          COMPLETE DAY-WISE OPERATIONAL REGISTER • 01-{String(monthIndex + 1).padStart(2, '0')}-{calendarYear} TO {totalDays}-{String(monthIndex + 1).padStart(2, '0')}-{calendarYear} ({totalDays} CALENDAR DAYS)
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
              {computedData.totals.totalVehicles}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Active in {month}
            </Typography>
          </Card>
        </Grid>

        <Grid item xs={6} sm={4} md={2.4}>
          <Card sx={{ borderRadius: '12px', border: '1px solid #e2e8f0', p: 1.5, bgcolor: '#ffffff' }}>
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
              Total Trips
            </Typography>
            <Typography variant="h5" fontWeight={900} color="#059669">
              {computedData.totals.totalTrips}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Across {totalDays} days
            </Typography>
          </Card>
        </Grid>

        <Grid item xs={6} sm={4} md={2.4}>
          <Card sx={{ borderRadius: '12px', border: '1px solid #e2e8f0', p: 1.5, bgcolor: '#ffffff' }}>
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
              Total Cement Load
            </Typography>
            <Typography variant="h5" fontWeight={900} color="#d97706">
              {computedData.totals.totalMT} <span style={{ fontSize: '13px', fontWeight: 700 }}>MT</span>
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Recorded in register
            </Typography>
          </Card>
        </Grid>

        <Grid item xs={6} sm={4} md={2.4}>
          <Card sx={{ borderRadius: '12px', border: '1px solid #e2e8f0', p: 1.5, bgcolor: '#ffffff' }}>
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
              Pattern Breakdown
            </Typography>
            <Box display="flex" gap={1} mt={0.5} flexWrap="wrap">
              <Chip label={`10W: ${computedData.byPattern['10W']?.length || 0}`} size="small" sx={{ height: 20, fontSize: '10px', fontWeight: 800, bgcolor: '#fef3c7', color: '#b45309' }} />
              <Chip label={`12W: ${computedData.byPattern['12W']?.length || 0}`} size="small" sx={{ height: 20, fontSize: '10px', fontWeight: 800, bgcolor: '#dbeafe', color: '#1d4ed8' }} />
              <Chip label={`14W: ${computedData.byPattern['14W']?.length || 0}`} size="small" sx={{ height: 20, fontSize: '10px', fontWeight: 800, bgcolor: '#fae8ff', color: '#86198f' }} />
              <Chip label={`6W: ${computedData.byPattern['6W']?.length || 0}`} size="small" sx={{ height: 20, fontSize: '10px', fontWeight: 800, bgcolor: '#dcfce7', color: '#15803d' }} />
            </Box>
          </Card>
        </Grid>

        <Grid item xs={6} sm={4} md={2.4}>
          <Card sx={{ borderRadius: '12px', border: '1px solid #e2e8f0', p: 1.5, bgcolor: '#ffffff' }}>
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
              Dedicated / Non-Dedicated
            </Typography>
            <Box display="flex" gap={1} mt={0.5}>
              <Chip
                label={`Dedicated: ${computedData.vehicles.filter(v => v.isDedicated).length}`}
                size="small"
                sx={{ height: 20, fontSize: '10px', fontWeight: 800, bgcolor: '#e0e7ff', color: '#3730a3' }}
              />
              <Chip
                label={`Single: ${computedData.vehicles.filter(v => !v.isDedicated).length}`}
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
            Loading Vehicle-Wise Trip Register for {month} {calendarYear}...
          </Typography>
        </Box>
      ) : filteredVehicles.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
          <LocalShippingIcon sx={{ fontSize: 48, color: '#cbd5e1', mb: 1.5 }} />
          <Typography variant="h6" fontWeight={800} color="#0f172a">
            No vehicle trip records found for {month} {calendarYear}
          </Typography>
          <Typography variant="body2" color="#64748b" mt={0.5}>
            Try changing the month or financial year, or clear active search filters.
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
              patternDayTotals[d] = patternVehicles.reduce((sum, v) => sum + (v.dailyTrips[d] || 0), 0);
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
                      NO OF TRIPS FROM 01.{String(monthIndex + 1).padStart(2, '0')}.{String(calendarYear).slice(-2)} - {totalDays}.{String(monthIndex + 1).padStart(2, '0')}.{String(calendarYear).slice(-2)}
                    </Typography>
                  </Box>
                </Box>

                {/* ── Visual Reference Horizontal Strip Cards (from Screenshot) ── */}
                {(viewMode === 'COMBINED' || viewMode === 'REFERENCE_STRIP') && (
                  <Box sx={{ p: 2, bgcolor: '#ffffff', borderBottom: '1px solid #e2e8f0', overflowX: 'auto' }}>
                    <Typography variant="caption" fontWeight={800} color="#94a3b8" sx={{ textTransform: 'uppercase', letterSpacing: '1px', display: 'block', mb: 1 }}>
                      OPERATIONAL REFERENCE STRIP ({cfg.key})
                    </Typography>

                    <Box sx={{ display: 'flex', gap: 1, minWidth: 'max-content', pb: 1 }}>
                      {patternVehicles.map(v => {
                        // Color styling matching reference image
                        let vehBg = '#ffffff';
                        if (v.wheelPattern === '14W') {
                          vehBg = '#fef08a'; // Yellow highlight in reference screenshot
                        } else if (v.wheelPattern === '6W') {
                          vehBg = '#bae6fd'; // Cyan / Sky blue in screenshot
                        } else if (v.isDedicated) {
                          vehBg = '#fef9c3'; // Soft yellow for dedicated
                        } else {
                          vehBg = '#ffedd5'; // Soft peach/orange
                        }

                        return (
                          <Box
                            key={v.normKey}
                            sx={{
                              border: '1.5px solid #334155',
                              borderRadius: '6px',
                              minWidth: 100,
                              maxWidth: 130,
                              textAlign: 'center',
                              bgcolor: '#ffffff',
                              overflow: 'hidden',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
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
                          {daysArray.map(dayStr => (
                            <TableCell
                              key={dayStr}
                              align="center"
                              sx={{
                                borderBottom: '2px solid #334155',
                                minWidth: 38,
                                px: 0.5,
                                bgcolor: '#1e293b'
                              }}
                            >
                              {dayStr}
                            </TableCell>
                          ))}

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

                              {/* Sticky Vehicle Number Cell */}
                              <TableCell
                                sx={{
                                  position: 'sticky',
                                  left: 0,
                                  zIndex: 5,
                                  bgcolor: isEven ? '#ffffff' : '#f8fafc',
                                  borderRight: '2px solid #38bdf8 !important',
                                  fontWeight: 900,
                                  color: '#0f172a'
                                }}
                              >
                                <Box display="flex" alignItems="center" gap={1}>
                                  <Box
                                    sx={{
                                      width: 6,
                                      height: 6,
                                      borderRadius: '50%',
                                      bgcolor: v.isDedicated ? '#10b981' : '#94a3b8'
                                    }}
                                  />
                                  <Typography variant="body2" fontWeight={900} sx={{ fontSize: '12px', letterSpacing: '-0.2px' }}>
                                    {v.vehicleNo}
                                  </Typography>
                                </Box>
                                {v.contactOwner && (
                                  <Typography variant="caption" sx={{ color: '#64748b', fontSize: '10px', display: 'block', pl: 1.7 }}>
                                    {v.contactOwner}
                                  </Typography>
                                )}
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
                                const tripsOnDay = v.dailyTrips[dayStr] || 0;
                                const docs = v.dailyTripDocs[dayStr] || [];

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
                                      <Tooltip title={`${v.vehicleNo}: ${tripsOnDay} trip(s) on ${dayStr}-${String(monthIndex + 1).padStart(2, '0')}. Click to view details.`}>
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
              MONTH GRAND TOTAL BAR
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
                MONTH GRAND TOTAL: {computedData.totals.totalTrips} TRIPS
              </Typography>
              <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600 }}>
                Across {computedData.totals.totalVehicles} Vehicles • Total Cement Volume: {computedData.totals.totalMT} MT
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
                Export Complete Month Sheet (.xlsx)
              </Button>
            </Box>
          </Paper>
        </Box>
      )}

      {/* =========================================================================
          INSPECTION DIALOG (When user clicks a day's trip count)
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
                Trip Details: {selectedDayTripDetail?.vehNo} on {selectedDayTripDetail?.day}-{String(monthIndex + 1).padStart(2, '0')}-{calendarYear}
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
                    <TableCell>SHIPMENT NO</TableCell>
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
                      <TableCell sx={{ color: '#64748b' }}>
                        {t['SHIPMENT NO'] || '-'}
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
            <Typography variant="body2" color="#64748b">No trip records found for this date.</Typography>
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
