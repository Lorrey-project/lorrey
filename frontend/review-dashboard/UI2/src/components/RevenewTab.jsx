import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box, Typography, Paper, IconButton,
  FormControl, Select, MenuItem, Button, Tooltip, Tabs, Tab,
  Popover, Grid, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, InputAdornment, CircularProgress, Chip, Menu
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import EditIcon from '@mui/icons-material/Edit';
import axios from 'axios';
import { io } from 'socket.io-client';
import * as XLSX from 'xlsx';

const API_URL = import.meta.env.VITE_API_URL;
const SOCKET_URL = import.meta.env.VITE_SOCKET_IO_URL || import.meta.env.VITE_API_URL;

const VALID_BILL_TYPES = ['FREIGHT', 'UNLOADING', 'TOLL'];

const MONTH_NAMES = [
  'ALL', 'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December', 'January', 'February', 'March'
];

const FULL_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const FY_OPTIONS = ['FY 2026-27', 'FY 2025-26', 'FY 2024-25'];

// Format currency numbers in Indian numbering system
const fmtNumber = (val) => {
  if (val === undefined || val === null || val === '' || isNaN(Number(val))) {
    return '-';
  }
  const num = Number(val);
  return '₹' + num.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
};

// Safe date parser to avoid timezone shifts
function parseCalendarDate(val) {
  if (!val && val !== 0) return null;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return {
      year: val.getFullYear(),
      month: val.getMonth() + 1,
      day: val.getDate()
    };
  }

  const rawStr = String(val).trim();
  if (!rawStr || rawStr === '-' || rawStr === 'undefined' || rawStr === 'null') return null;
  const str = rawStr.replace(/\s+\d{1,2}:\d{2}(:\d{2})?.*$/, '').replace(/T\d{2}:\d{2}.*$/, '').trim();

  // Excel serial number (numeric or string)
  if (/^\d{5}(\.\d+)?$/.test(str) || (typeof val === 'number' && val >= 1000 && val <= 100000)) {
    const excelDays = typeof val === 'number' ? val : parseFloat(str);
    const msPerDay = 86400 * 1000;
    const epochMs = Date.UTC(1899, 11, 30);
    const date = new Date(epochMs + Math.round(excelDays * msPerDay));
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate()
    };
  }

  // DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY, DD-MM-YY, DD/MM/YY, DD.MM.YY
  const ddmmyyyy = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (ddmmyyyy) {
    let d = parseInt(ddmmyyyy[1], 10), m = parseInt(ddmmyyyy[2], 10), y = parseInt(ddmmyyyy[3], 10);
    if (y < 100) y += 2000;
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      return { year: y, month: m, day: d };
    }
  }

  // YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD
  const yyyymmdd = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (yyyymmdd) {
    let y = parseInt(yyyymmdd[1], 10), m = parseInt(yyyymmdd[2], 10), d = parseInt(yyyymmdd[3], 10);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      return { year: y, month: m, day: d };
    }
  }

  // DD-MMM-YYYY or DD MMM YYYY (e.g. 21-Sep-2026, 21-Sep-26)
  const ddmmmyyyy = str.match(/^(\d{1,2})[\/\-\.\s]([A-Za-z]+)[\/\-\.\s](\d{2,4})$/);
  if (ddmmmyyyy) {
    const d = parseInt(ddmmmyyyy[1], 10);
    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const mIdx = monthNames.indexOf(ddmmmyyyy[2].toLowerCase().slice(0, 3));
    let y = parseInt(ddmmmyyyy[3], 10);
    if (y < 100) y += 2000;
    if (mIdx >= 0 && d >= 1 && d <= 31) {
      return { year: y, month: mIdx + 1, day: d };
    }
  }

  return null;
}

function formatDisplayDate(val) {
  const cal = parseCalendarDate(val);
  if (!cal) return String(val || '-').trim();
  const d = String(cal.day).padStart(2, '0');
  const m = String(cal.month).padStart(2, '0');
  const y = String(cal.year);
  return `${d}-${m}-${y}`;
}

// Business Rule: DUE DATE = INVOICE DATE + 15 CALENDAR DAYS (Pure calendar arithmetic)
function calculateDueDate(invoiceDateVal) {
  const cal = parseCalendarDate(invoiceDateVal);
  if (!cal) return '-';
  const due = new Date(cal.year, cal.month - 1, cal.day + 15);
  const d = String(due.getDate()).padStart(2, '0');
  const m = String(due.getMonth() + 1).padStart(2, '0');
  const y = String(due.getFullYear());
  return `${d}-${m}-${y}`;
}

function getCalNum(cal) {
  if (!cal) return 0;
  return cal.year * 10000 + cal.month * 100 + cal.day;
}

function getDisplayMonth(monthVal, invoiceDateVal) {
  if (monthVal) {
    const str = String(monthVal).trim();
    const num = parseInt(str, 10);
    if (!isNaN(num) && num >= 1 && num <= 12) {
      return FULL_MONTH_NAMES[num - 1].toUpperCase();
    }
    return str.toUpperCase();
  }
  const cal = parseCalendarDate(invoiceDateVal);
  if (cal && cal.month >= 1 && cal.month <= 12) {
    return FULL_MONTH_NAMES[cal.month - 1].toUpperCase();
  }
  return '-';
}

// Authoritative Bill Type Extraction (Only FREIGHT, UNLOADING, TOLL are valid; else NULL)
function getAuthoritativeBillType(sourceBillType) {
  if (!sourceBillType) return '';
  const clean = String(sourceBillType).trim().toUpperCase();
  if (VALID_BILL_TYPES.includes(clean)) {
    return clean;
  }
  return '';
}

export default function RevenewTab({
  onBack,
  mainTab,
  setMainTab,
  financialYear: initialFY = 'FY 2026-27',
  month: initialMonth = 'ALL',
  date: initialDate = 'ALL'
}) {
  const [financialYear, setFinancialYear] = useState(initialFY || 'FY 2026-27');
  const [month, setMonth] = useState(initialMonth || 'ALL');
  const [date, setDate] = useState(initialDate || 'ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [calendarAnchorEl, setCalendarAnchorEl] = useState(null);

  // Authoritative live rows from Bill Register
  const [rawRows, setRawRows] = useState([]);
  const [loading, setLoading] = useState(false);

  // Local manual overrides for BILL column (persisted in DB and state)
  const [manualBillOverrides, setManualBillOverrides] = useState(() => {
    try {
      const stored = localStorage.getItem('REVENUE_MANUAL_BILL_OVERRIDES');
      return stored ? JSON.parse(stored) : {};
    } catch (_) {
      return {};
    }
  });

  // Anchor for BILL editing menu
  const [billMenuAnchorEl, setBillMenuAnchorEl] = useState(null);
  const [activeBillRow, setActiveBillRow] = useState(null);

  // Fetch authoritative Bill Register data
  const fetchBillRegisterData = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      // Normalize FY parameter (e.g. "FY 2026-27" -> "2026-2027")
      let cleanFY = '2026-2027';
      const parts = String(financialYear).replace(/^FY\s*/i, '').split('-');
      if (parts.length > 0) {
        let sy = parseInt(parts[0], 10);
        if (sy < 100) sy += 2000;
        if (!isNaN(sy)) cleanFY = `${sy}-${sy + 1}`;
      }

      const res = await axios.get(`${API_URL}/fy-details/data`, {
        params: { fy: cleanFY },
        headers
      });

      setRawRows(res.data?.rows || []);
    } catch (err) {
      console.error('[RevenewTab] Failed to fetch Bill Register data:', err);
    } finally {
      setLoading(false);
    }
  }, [financialYear]);

  useEffect(() => {
    fetchBillRegisterData();
  }, [fetchBillRegisterData]);

  // Real-time live synchronization with Bill Register updates
  useEffect(() => {
    const socket = io(SOCKET_URL, { autoConnect: true, transports: ['websocket', 'polling'] });

    const handleUpdate = () => {
      fetchBillRegisterData();
    };

    socket.on('billRegisterUpdated', handleUpdate);
    socket.on('billRegisterCleared', handleUpdate);
    socket.on('billRegisterExcelImport', handleUpdate);
    socket.on('cementUpdates', handleUpdate);
    socket.on('fyDetailsUpdates', handleUpdate);
    socket.on('batchBillsGenerated', handleUpdate);

    return () => {
      socket.off('billRegisterUpdated', handleUpdate);
      socket.off('billRegisterCleared', handleUpdate);
      socket.off('billRegisterExcelImport', handleUpdate);
      socket.off('cementUpdates', handleUpdate);
      socket.off('fyDetailsUpdates', handleUpdate);
      socket.off('batchBillsGenerated', handleUpdate);
      socket.disconnect();
    };
  }, [fetchBillRegisterData]);

  const handleOpenCalendar = (e) => setCalendarAnchorEl(e.currentTarget);
  const handleCloseCalendar = () => setCalendarAnchorEl(null);

  // Handle Manual Bill Type Editing / Override
  const handleOpenBillMenu = (event, row) => {
    event.stopPropagation();
    setBillMenuAnchorEl(event.currentTarget);
    setActiveBillRow(row);
  };

  const handleCloseBillMenu = () => {
    setBillMenuAnchorEl(null);
    setActiveBillRow(null);
  };

  const handleSelectBillType = async (selectedType) => {
    if (!activeBillRow) return;
    const billNo = activeBillRow.invoiceNumber || activeBillRow.rawInvoiceNumber || activeBillRow._id;
    const newOverrides = { ...manualBillOverrides, [billNo]: selectedType };
    setManualBillOverrides(newOverrides);
    try {
      localStorage.setItem('REVENUE_MANUAL_BILL_OVERRIDES', JSON.stringify(newOverrides));
    } catch (_) {}

    // Persist to backend
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.post(`${API_URL}/fy-details/update-bill-type`, {
        billNo,
        billType: selectedType
      }, { headers });
    } catch (err) {
      console.error('Failed to persist billType to backend:', err);
    }

    handleCloseBillMenu();
  };

  // Compute calendar year for selected FY and Month
  const displayYear = useMemo(() => {
    let startYear = 2026;
    const parts = String(financialYear).replace(/^FY\s*/i, '').split('-');
    if (parts.length > 0) {
      let sy = parseInt(parts[0], 10);
      if (sy < 100) sy += 2000;
      if (!isNaN(sy)) startYear = sy;
    }
    const mIdx = MONTH_NAMES.indexOf(month);
    return mIdx >= 10 ? startYear + 1 : startYear;
  }, [financialYear, month]);

  // Compute available dates dynamically for the selected month & year
  const dateOptions = useMemo(() => {
    const jsMonthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const jsMonthIdx = jsMonthNames.indexOf(month);
    if (jsMonthIdx === -1) return [];

    const daysInMonth = new Date(displayYear, jsMonthIdx + 1, 0).getDate();
    const list = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dStr = String(d).padStart(2, '0');
      const mStr = String(jsMonthIdx + 1).padStart(2, '0');
      list.push({
        day: d,
        display: `${dStr}-${mStr}-${displayYear}`,
        value: `${dStr}-${mStr}-${displayYear}`,
        isoDate: `${displayYear}-${mStr}-${dStr}`
      });
    }
    return list;
  }, [displayYear, month]);

  const selectedDateDisplay = useMemo(() => {
    if (date === 'ALL') {
      return month === 'ALL' ? `All Months (FY to Date)` : `${month} ${displayYear}`;
    }
    return date;
  }, [date, month, displayYear]);

  // ── Process Bill Register Rows with 12 Column Mapping & FY-Till-Date Boundary ──
  const processedBillRegisterRows = useMemo(() => {
    const now = new Date();
    const todayCal = {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate()
    };
    const todayNum = getCalNum(todayCal);
    const currentFYStartYear = todayCal.month >= 4 ? todayCal.year : todayCal.year - 1;

    let startYear = 2026;
    const parts = String(financialYear).replace(/^FY\s*/i, '').split('-');
    if (parts.length > 0) {
      let sy = parseInt(parts[0], 10);
      if (sy < 100) sy += 2000;
      if (!isNaN(sy)) startYear = sy;
    }
    const endYear = startYear + 1;
    const fyStartNum = startYear * 10000 + 401; // 01 April
    const fyEndNum = endYear * 10000 + 331;     // 31 March

    // For current financial year, strictly include records up to TODAY
    const maxAllowedDateNum = (startYear === currentFYStartYear)
      ? Math.min(fyEndNum, todayNum)
      : (startYear < currentFYStartYear ? fyEndNum : todayNum);

    const validRows = rawRows.filter(r => {
      if (!r) return false;
      const invCal = parseCalendarDate(r.invoiceDate);
      if (!invCal) return false;
      const invNum = getCalNum(invCal);
      return invNum >= fyStartNum && invNum <= maxAllowedDateNum;
    });

    const mapped = validRows.map(r => {
      const amt = parseFloat(r.amount || 0) || 0;
      const cgst = r.cgst !== undefined && r.cgst !== null ? Number(r.cgst) : Math.round(amt * 0.09 * 100) / 100;
      const sgst = r.sgst !== undefined && r.sgst !== null ? Number(r.sgst) : Math.round(amt * 0.09 * 100) / 100;
      const totalAmount = r.totalAmount !== undefined && r.totalAmount !== null ? Number(r.totalAmount) : (amt + cgst + sgst);

      const siteUpper = String(r.site || '').trim().toUpperCase();
      const rawInvNo = r.displayInvoiceNumber || r.invoiceNumber || r.billNo || '-';

      // Bill Type: Check manual override first, then authoritative source (only FREIGHT, UNLOADING, TOLL), else NULL
      const manualOverride = manualBillOverrides[rawInvNo] ?? manualBillOverrides[r.invoiceNumber] ?? manualBillOverrides[r.billNo];
      let billUpper = '';
      if (manualOverride !== undefined) {
        billUpper = manualOverride ? String(manualOverride).trim().toUpperCase() : '';
      } else {
        billUpper = getAuthoritativeBillType(r.billType || r.bill);
      }

      // TDS Calculation: If NVL + TOLL -> 0, else 2%
      const isTollNvl = siteUpper === 'NVL' && billUpper === 'TOLL';
      const tdsRate = isTollNvl ? 0 : 0.02;
      const tds = r.tds !== undefined && r.tds !== null ? Number(r.tds) : Math.round(amt * tdsRate * 100) / 100;

      const receivableAmount = r.receivable !== undefined && r.receivable !== null ? Number(r.receivable) : (totalAmount - tds);

      // Automatic Due Date: Invoice Date + 15 Calendar Days
      const dueDateFormatted = calculateDueDate(r.invoiceDate);

      return {
        _id: r._id || r.id,
        rawInvoiceDate: r.invoiceDate,
        rawInvoiceNumber: r.invoiceNumber || r.billNo,
        invoiceDate: formatDisplayDate(r.invoiceDate),
        invoiceDateCal: parseCalendarDate(r.invoiceDate),
        invoiceNumber: rawInvNo,
        month: getDisplayMonth(r.month, r.invoiceDate),
        site: siteUpper,
        bill: billUpper,
        hasManualBillOverride: manualOverride !== undefined,
        dueDate: dueDateFormatted,
        amount: amt,
        cgst,
        sgst,
        totalAmount,
        tds,
        receivableAmount
      };
    });

    // Chronological sort by actual calendar Invoice Date timestamp
    mapped.sort((a, b) => {
      const numA = getCalNum(a.invoiceDateCal);
      const numB = getCalNum(b.invoiceDateCal);
      if (numA !== numB) return numA - numB;
      const invComp = String(a.invoiceNumber).localeCompare(String(b.invoiceNumber));
      if (invComp !== 0) return invComp;
      return String(a._id || '').localeCompare(String(b._id || ''));
    });

    return mapped;
  }, [rawRows, financialYear, manualBillOverrides]);

  // Filter records based on Month, Date, and Search Term
  const filteredRecords = useMemo(() => {
    let result = processedBillRegisterRows;

    // Month filter
    if (month && month !== 'ALL') {
      const targetMonthUpper = month.toUpperCase();
      result = result.filter(r => {
        const mStr = String(r.month || '').toUpperCase();
        return mStr.includes(targetMonthUpper);
      });
    }

    // Date filter
    if (date && date !== 'ALL') {
      const targetDateFormatted = formatDisplayDate(date);
      result = result.filter(r => r.invoiceDate === targetDateFormatted);
    }

    // Search filter
    if (searchTerm && searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      result = result.filter(r => {
        return (
          String(r.invoiceNumber || '').toLowerCase().includes(term) ||
          String(r.invoiceDate || '').toLowerCase().includes(term) ||
          String(r.site || '').toLowerCase().includes(term) ||
          String(r.bill || '').toLowerCase().includes(term) ||
          String(r.month || '').toLowerCase().includes(term) ||
          String(r.dueDate || '').toLowerCase().includes(term) ||
          String(r.amount || '').includes(term) ||
          String(r.totalAmount || '').includes(term) ||
          String(r.receivableAmount || '').includes(term)
        );
      });
    }

    return result;
  }, [processedBillRegisterRows, month, date, searchTerm]);

  // Dynamic calculation for bottom total row
  const totals = useMemo(() => {
    return filteredRecords.reduce((acc, r) => {
      acc.amount += Number(r.amount || 0);
      acc.cgst += Number(r.cgst || 0);
      acc.sgst += Number(r.sgst || 0);
      acc.totalAmount += Number(r.totalAmount || 0);
      acc.tds += Number(r.tds || 0);
      acc.receivableAmount += Number(r.receivableAmount || 0);
      return acc;
    }, {
      amount: 0,
      cgst: 0,
      sgst: 0,
      totalAmount: 0,
      tds: 0,
      receivableAmount: 0
    });
  }, [filteredRecords]);

  // Export to Excel handler
  const handleExportExcel = useCallback(() => {
    try {
      const wsData = [
        ['REVENEW REPORT'],
        [`Financial Year: ${financialYear} | Month: ${month} | Date: ${selectedDateDisplay}`],
        [],
        [
          'SL NO',
          'Invoice Date',
          'Invoice Number',
          'Month',
          'SITE',
          'BILL',
          'Due Date',
          'Amount',
          'CGST',
          'SGST',
          'Total Amount',
          'TDS @2%',
          'Receivable Amount From Nuvoco'
        ]
      ];

      filteredRecords.forEach((r, idx) => {
        wsData.push([
          idx + 1,
          r.invoiceDate || '-',
          r.invoiceNumber || '-',
          r.month || '-',
          r.site || '-',
          r.bill || '',
          r.dueDate || '-',
          r.amount || 0,
          r.cgst || 0,
          r.sgst || 0,
          r.totalAmount || 0,
          r.tds || 0,
          r.receivableAmount || 0
        ]);
      });

      // Add Total Row
      wsData.push([
        'TOTAL',
        '',
        '',
        '',
        '',
        '',
        '',
        totals.amount,
        totals.cgst,
        totals.sgst,
        totals.totalAmount,
        totals.tds,
        totals.receivableAmount
      ]);

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Revenew');
      const exportFileName = `Revenew_${month}_${financialYear.replace(/\s+/g, '_')}.xlsx`;
      XLSX.writeFile(wb, exportFileName);
    } catch (err) {
      console.error('Excel export error:', err);
    }
  }, [filteredRecords, totals, financialYear, month, selectedDateDisplay]);

  return (
    <Box sx={{ width: '100%', minHeight: '100vh', bgcolor: '#f8fafc', p: { xs: 1.5, sm: 2, md: 3 } }}>
      {/* ── Top Header Bar ──────────────────────────────────────────────────────── */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 1.5, md: 2 },
          mb: 2.5,
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: { xs: 1, md: 1.5 },
          bgcolor: '#ffffff'
        }}
      >
        <Box display="flex" alignItems="center" gap={1} flexShrink={0} sx={{ order: 1 }}>
          {onBack && (
            <IconButton onClick={onBack} size="small" sx={{ color: '#0f172a', bgcolor: '#f1f5f9', '&:hover': { bgcolor: '#e2e8f0' }, p: 0.8 }}>
              <ArrowBackIcon fontSize="small" />
            </IconButton>
          )}
          <Box sx={{ p: 0.8, bgcolor: '#0f172a', borderRadius: '8px', display: 'flex' }}>
            <MonetizationOnIcon sx={{ color: '#38bdf8', fontSize: 20 }} />
          </Box>
          <Box>
            <Typography variant="subtitle1" fontWeight={900} sx={{ letterSpacing: '-0.3px', color: '#0f172a', lineHeight: 1.2, fontSize: { xs: '0.95rem', md: '1.05rem', xl: '1.15rem' }, whiteSpace: 'nowrap' }}>
              REVENEW
            </Typography>
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600, display: { xs: 'none', '2xl': 'block' }, lineHeight: 1 }}>
              Revenue & Invoice Statement • {selectedDateDisplay}
            </Typography>
          </Box>
        </Box>

        {/* Center Tabs */}
        {setMainTab && (
          <Box sx={{
            flexShrink: 0,
            display: 'flex',
            justifyContent: 'center',
            order: { xs: 3, xl: 2 },
            width: { xs: '100%', xl: 'auto' },
            mx: { xs: 0, xl: 'auto' },
            mt: { xs: 1.5, xl: 0 }
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
              <Tab label="REVENEW" />
            </Tabs>
          </Box>
        )}

        {/* Action Controls */}
        <Box
          display="flex"
          alignItems="center"
          gap={{ xs: 0.8, md: 1 }}
          flexWrap="wrap"
          sx={{
            order: { xs: 2, xl: 3 },
            justifyContent: { xs: 'flex-start', sm: 'flex-end' },
            flexShrink: 0
          }}
        >
          {/* FY Selector */}
          <FormControl size="small">
            <Select
              value={financialYear}
              onChange={(e) => {
                setFinancialYear(e.target.value);
                setDate('ALL');
              }}
              sx={{
                borderRadius: '8px',
                bgcolor: 'background.default',
                fontWeight: 700,
                fontSize: { xs: '0.75rem', sm: '0.8rem' },
                height: 34,
                '& .MuiSelect-select': { py: 0.7, px: 1.2 }
              }}
            >
              {FY_OPTIONS.map((fy) => (
                <MenuItem key={fy} value={fy} sx={{ fontSize: '0.8rem', fontWeight: 600 }}>{fy}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Month Selector */}
          <FormControl size="small">
            <Select
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                setDate('ALL');
              }}
              sx={{
                borderRadius: '8px',
                bgcolor: 'background.default',
                fontWeight: 700,
                fontSize: { xs: '0.75rem', sm: '0.8rem' },
                height: 34,
                '& .MuiSelect-select': { py: 0.7, px: 1.2 }
              }}
            >
              {MONTH_NAMES.map((m) => (
                <MenuItem key={m} value={m} sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                  {m === 'ALL' ? 'ALL (Full FY)' : m}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Date Picker Button */}
          <Button
            variant="outlined"
            size="small"
            onClick={handleOpenCalendar}
            startIcon={<CalendarTodayIcon sx={{ fontSize: '15px !important' }} />}
            endIcon={<KeyboardArrowDownIcon sx={{ fontSize: '15px !important' }} />}
            disabled={month === 'ALL'}
            sx={{
              borderRadius: '8px',
              bgcolor: 'background.default',
              borderColor: '#e2e8f0',
              color: '#0f172a',
              fontWeight: 700,
              fontSize: { xs: '0.75rem', sm: '0.8rem' },
              height: 34,
              px: 1.2,
              textTransform: 'none',
              '&:hover': { bgcolor: '#f1f5f9', borderColor: '#cbd5e1' }
            }}
          >
            {date === 'ALL' ? 'ALL' : date.split('-')[0]}
          </Button>

          <Popover
            open={Boolean(calendarAnchorEl)}
            anchorEl={calendarAnchorEl}
            onClose={handleCloseCalendar}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            PaperProps={{ sx: { p: 2, width: 280, borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' } }}
          >
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="subtitle2" fontWeight={800} color="#0f172a">
                {month} {displayYear}
              </Typography>
            </Box>
            <Button
              fullWidth
              variant={date === 'ALL' ? 'contained' : 'outlined'}
              onClick={() => { setDate('ALL'); handleCloseCalendar(); }}
              sx={{
                bgcolor: date === 'ALL' ? '#0f172a' : 'transparent',
                color: date === 'ALL' ? '#fff' : '#0f172a',
                borderColor: '#0f172a',
                fontWeight: 700,
                borderRadius: '8px',
                mb: 1.5,
                py: 0.6,
                fontSize: '0.75rem',
                '&:hover': { bgcolor: date === 'ALL' ? '#1e293b' : '#f8fafc', borderColor: '#1e293b' }
              }}
            >
              ALL (Full Month)
            </Button>
            <Grid container spacing={0.8}>
              {dateOptions.map(d => {
                const isSelected = date === d.value;
                return (
                  <Grid item xs={12 / 7} key={d.value}>
                    <Box
                      onClick={() => { setDate(d.value); handleCloseCalendar(); }}
                      sx={{
                        cursor: 'pointer',
                        bgcolor: isSelected ? '#3b82f6' : 'transparent',
                        color: isSelected ? '#fff' : '#1e293b',
                        borderRadius: '6px',
                        py: 0.6,
                        textAlign: 'center',
                        fontSize: '0.75rem',
                        fontWeight: isSelected ? 800 : 600,
                        '&:hover': { bgcolor: isSelected ? '#2563eb' : '#f1f5f9' }
                      }}
                    >
                      {d.day}
                    </Box>
                  </Grid>
                );
              })}
            </Grid>
          </Popover>

          {/* Refresh button */}
          <Tooltip title="Refresh">
            <IconButton
              size="small"
              onClick={fetchBillRegisterData}
              disabled={loading}
              sx={{ color: '#0f172a', bgcolor: 'background.default', '&:hover': { bgcolor: '#e2e8f0' }, p: 0.8 }}
            >
              {loading ? <CircularProgress size={18} color="inherit" /> : <RefreshIcon fontSize="small" />}
            </IconButton>
          </Tooltip>

          {/* Export Excel Button */}
          <Button
            variant="contained"
            color="primary"
            startIcon={<DownloadIcon fontSize="small" />}
            onClick={handleExportExcel}
            sx={{
              fontWeight: 800,
              borderRadius: '8px',
              textTransform: 'none',
              fontSize: { xs: '0.75rem', sm: '0.8rem' },
              height: 34,
              px: 1.5,
              bgcolor: '#10b981',
              '&:hover': { bgcolor: '#059669' },
              boxShadow: 'none'
            }}
          >
            Export Excel
          </Button>
        </Box>
      </Paper>

      {/* ── Search Bar & Stats Bar ──────────────────────────────────────────────── */}
      <Paper
        elevation={0}
        sx={{
          p: 1.5,
          mb: 2,
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 1.5,
          bgcolor: '#ffffff'
        }}
      >
        <TextField
          size="small"
          placeholder="Search by Invoice No, Site, Bill..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: '#94a3b8', fontSize: 20 }} />
              </InputAdornment>
            ),
            endAdornment: searchTerm ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setSearchTerm('')} sx={{ p: 0.2 }}>
                  <ClearIcon sx={{ fontSize: '0.95rem' }} />
                </IconButton>
              </InputAdornment>
            ) : null
          }}
          sx={{
            width: { xs: '100%', sm: 280, md: 340 },
            '& .MuiOutlinedInput-root': {
              borderRadius: '8px',
              fontSize: '0.82rem',
              bgcolor: '#f8fafc'
            }
          }}
        />

        <Box display="flex" alignItems="center" gap={2}>
          <Typography variant="body2" sx={{ color: '#64748b', fontWeight: 600 }}>
            Total Invoices: <strong style={{ color: '#0f172a' }}>{filteredRecords.length}</strong>
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b', fontWeight: 600 }}>
            Total Receivable: <strong style={{ color: '#059669' }}>{fmtNumber(totals.receivableAmount)}</strong>
          </Typography>
        </Box>
      </Paper>

      {/* ── Main Spreadsheet Table ──────────────────────────────────────────────── */}
      <Paper
        elevation={0}
        sx={{
          borderRadius: '16px',
          border: '1px solid #cbd5e1',
          overflow: 'hidden',
          bgcolor: '#ffffff',
          boxShadow: '0 4px 16px rgba(0,0,0,0.04)'
        }}
      >
        <TableContainer sx={{ maxHeight: 'calc(100vh - 270px)', overflowX: 'auto', overflowY: 'auto' }}>
          <Table stickyHeader size="small" sx={{ minWidth: 1200, borderCollapse: 'collapse' }}>
            <TableHead>
              <TableRow sx={{ '& th': { border: '1px solid #cbd5e1' } }}>
                <TableCell align="center" sx={{ bgcolor: '#1e293b', color: '#ffffff', fontWeight: 800, fontSize: '0.75rem', py: 1, px: 1, width: 50 }}>
                  SL NO
                </TableCell>
                <TableCell align="center" sx={{ bgcolor: '#1e293b', color: '#ffffff', fontWeight: 800, fontSize: '0.75rem', py: 1, px: 1.2, width: 110 }}>
                  Invoice Date
                </TableCell>
                <TableCell align="left" sx={{ bgcolor: '#1e293b', color: '#ffffff', fontWeight: 800, fontSize: '0.75rem', py: 1, px: 1.5, width: 140 }}>
                  Invoice Number
                </TableCell>
                <TableCell align="center" sx={{ bgcolor: '#1e293b', color: '#ffffff', fontWeight: 800, fontSize: '0.75rem', py: 1, px: 1, width: 100 }}>
                  Month
                </TableCell>
                <TableCell align="center" sx={{ bgcolor: '#1e293b', color: '#ffffff', fontWeight: 800, fontSize: '0.75rem', py: 1, px: 1, width: 90 }}>
                  SITE
                </TableCell>
                <TableCell align="center" sx={{ bgcolor: '#1e293b', color: '#ffffff', fontWeight: 800, fontSize: '0.75rem', py: 1, px: 1.2, width: 130 }}>
                  BILL
                </TableCell>
                <TableCell align="center" sx={{ bgcolor: '#1e293b', color: '#ffffff', fontWeight: 800, fontSize: '0.75rem', py: 1, px: 1.2, width: 110 }}>
                  Due Date
                </TableCell>
                <TableCell align="right" sx={{ bgcolor: '#1e293b', color: '#ffffff', fontWeight: 800, fontSize: '0.75rem', py: 1, px: 1.5, width: 130 }}>
                  Amount
                </TableCell>
                <TableCell align="right" sx={{ bgcolor: '#1e293b', color: '#ffffff', fontWeight: 800, fontSize: '0.75rem', py: 1, px: 1.2, width: 110 }}>
                  CGST
                </TableCell>
                <TableCell align="right" sx={{ bgcolor: '#1e293b', color: '#ffffff', fontWeight: 800, fontSize: '0.75rem', py: 1, px: 1.2, width: 110 }}>
                  SGST
                </TableCell>
                <TableCell align="right" sx={{ bgcolor: '#1e293b', color: '#ffffff', fontWeight: 800, fontSize: '0.75rem', py: 1, px: 1.5, width: 140 }}>
                  Total Amount
                </TableCell>
                <TableCell align="right" sx={{ bgcolor: '#1e293b', color: '#ffffff', fontWeight: 800, fontSize: '0.75rem', py: 1, px: 1.2, width: 110 }}>
                  TDS @2%
                </TableCell>
                <TableCell align="right" sx={{ bgcolor: '#1e293b', color: '#ffffff', fontWeight: 800, fontSize: '0.75rem', py: 1, px: 1.5, width: 190 }}>
                  Receivable Amount From Nuvoco
                </TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {loading && filteredRecords.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={13} align="center" sx={{ py: 6, border: '1px solid #e2e8f0' }}>
                    <CircularProgress size={32} />
                    <Typography variant="body2" sx={{ mt: 1, color: '#64748b', fontWeight: 600 }}>
                      Loading live Bill Register data...
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : filteredRecords.length > 0 ? (
                filteredRecords.map((row, idx) => {
                  const billVal = row.bill;
                  return (
                    <TableRow
                      key={row._id || `${row.invoiceNumber}-${idx}`}
                      hover
                      sx={{
                        '&:nth-of-type(even)': { bgcolor: '#f8fafc' },
                        '& td': { border: '1px solid #e2e8f0', py: 0.7, px: 1 }
                      }}
                    >
                      <TableCell align="center" sx={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
                        {idx + 1}
                      </TableCell>
                      <TableCell align="center" sx={{ fontSize: '0.78rem', color: '#334155', fontWeight: 600 }}>
                        {row.invoiceDate || '-'}
                      </TableCell>
                      <TableCell align="left" sx={{ fontSize: '0.78rem', color: '#0f172a', fontWeight: 700 }}>
                        {row.invoiceNumber || '-'}
                      </TableCell>
                      <TableCell align="center" sx={{ fontSize: '0.78rem', color: '#334155', fontWeight: 500 }}>
                        {row.month || '-'}
                      </TableCell>
                      <TableCell align="center" sx={{ fontSize: '0.78rem', color: '#334155', fontWeight: 700 }}>
                        {row.site || '-'}
                      </TableCell>

                      {/* ── BILL Column: Authoritative 3 Types or Editable Fallback ── */}
                      <TableCell align="center" sx={{ fontSize: '0.78rem', py: 0.4, px: 0.8 }}>
                        <Box
                          onClick={(e) => handleOpenBillMenu(e, row)}
                          sx={{
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 0.5,
                            px: 1,
                            py: 0.3,
                            borderRadius: '6px',
                            fontWeight: 800,
                            fontSize: '0.74rem',
                            minWidth: '80px',
                            minHeight: '24px',
                            bgcolor: billVal === 'FREIGHT' ? '#eff6ff'
                              : billVal === 'UNLOADING' ? '#f5f3ff'
                              : billVal === 'TOLL' ? '#ecfdf5'
                              : '#f8fafc',
                            color: billVal === 'FREIGHT' ? '#1d4ed8'
                              : billVal === 'UNLOADING' ? '#6d28d9'
                              : billVal === 'TOLL' ? '#047857'
                              : '#94a3b8',
                            border: billVal ? `1px solid ${
                              billVal === 'FREIGHT' ? '#bfdbfe'
                              : billVal === 'UNLOADING' ? '#ddd6fe'
                              : '#a7f3d0'
                            }` : '1px dashed #cbd5e1',
                            transition: 'all 0.15s ease',
                            '&:hover': {
                              borderColor: '#94a3b8',
                              bgcolor: billVal ? undefined : '#f1f5f9'
                            }
                          }}
                          title="Click to select/edit Bill Type"
                        >
                          {billVal || (
                            <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.72rem', fontStyle: 'italic' }}>
                              Select...
                            </Typography>
                          )}
                          <EditIcon sx={{ fontSize: '0.65rem', opacity: 0.4 }} />
                        </Box>
                      </TableCell>

                      {/* ── Due Date Column: Automatically Invoice Date + 15 Days ── */}
                      <TableCell align="center" sx={{ fontSize: '0.78rem', color: '#1e293b', fontWeight: 700 }}>
                        {row.dueDate || '-'}
                      </TableCell>

                      <TableCell align="right" sx={{ fontSize: '0.78rem', color: '#0f172a', fontWeight: 600 }}>
                        {fmtNumber(row.amount)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.78rem', color: '#475569', fontWeight: 600 }}>
                        {fmtNumber(row.cgst)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.78rem', color: '#475569', fontWeight: 600 }}>
                        {fmtNumber(row.sgst)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.78rem', color: '#0f172a', fontWeight: 700 }}>
                        {fmtNumber(row.totalAmount)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.78rem', color: '#b91c1c', fontWeight: 600 }}>
                        {fmtNumber(row.tds)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.78rem', color: '#047857', fontWeight: 800 }}>
                        {fmtNumber(row.receivableAmount)}
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={13} align="center" sx={{ py: 6, border: '1px solid #e2e8f0' }}>
                    <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center">
                      <MonetizationOnIcon sx={{ fontSize: 44, color: '#cbd5e1', mb: 1 }} />
                      <Typography variant="body1" fontWeight={700} color="#475569">
                        No revenue records found for selected period
                      </Typography>
                      <Typography variant="caption" color="#94a3b8">
                        Records from Bill Register dated between 01 April and today will automatically appear here.
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              )}

              {/* ── Bottom Total Row ──────────────────────────────────────────────── */}
              <TableRow
                sx={{
                  bgcolor: '#f1f5f9',
                  position: 'sticky',
                  bottom: 0,
                  zIndex: 2,
                  boxShadow: '0 -2px 6px rgba(0,0,0,0.05)',
                  '& td': {
                    border: '1px solid #94a3b8',
                    py: 1,
                    px: 1.2,
                    fontWeight: 900
                  }
                }}
              >
                <TableCell colSpan={7} align="right" sx={{ fontSize: '0.82rem', color: '#0f172a', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  TOTAL
                </TableCell>
                <TableCell align="right" sx={{ fontSize: '0.82rem', color: '#0f172a' }}>
                  {fmtNumber(totals.amount)}
                </TableCell>
                <TableCell align="right" sx={{ fontSize: '0.82rem', color: '#475569' }}>
                  {fmtNumber(totals.cgst)}
                </TableCell>
                <TableCell align="right" sx={{ fontSize: '0.82rem', color: '#475569' }}>
                  {fmtNumber(totals.sgst)}
                </TableCell>
                <TableCell align="right" sx={{ fontSize: '0.82rem', color: '#0f172a' }}>
                  {fmtNumber(totals.totalAmount)}
                </TableCell>
                <TableCell align="right" sx={{ fontSize: '0.82rem', color: '#b91c1c' }}>
                  {fmtNumber(totals.tds)}
                </TableCell>
                <TableCell align="right" sx={{ fontSize: '0.85rem', color: '#047857' }}>
                  {fmtNumber(totals.receivableAmount)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* ── Bill Type Selection / Edit Menu ────────────────────────────────────────── */}
      <Menu
        anchorEl={billMenuAnchorEl}
        open={Boolean(billMenuAnchorEl)}
        onClose={handleCloseBillMenu}
        PaperProps={{
          sx: {
            borderRadius: '10px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            minWidth: 150
          }
        }}
      >
        <MenuItem
          onClick={() => handleSelectBillType('FREIGHT')}
          sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#1d4ed8' }}
        >
          FREIGHT
        </MenuItem>
        <MenuItem
          onClick={() => handleSelectBillType('UNLOADING')}
          sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#6d28d9' }}
        >
          UNLOADING
        </MenuItem>
        <MenuItem
          onClick={() => handleSelectBillType('TOLL')}
          sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#047857' }}
        >
          TOLL
        </MenuItem>
        <MenuItem
          onClick={() => handleSelectBillType('')}
          sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}
        >
          (Clear / Blank)
        </MenuItem>
      </Menu>
    </Box>
  );
}
