import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Paper, IconButton, CircularProgress,
  FormControl, Select, MenuItem, Button, Tooltip, Tabs, Tab,
  Dialog, DialogTitle, DialogContent, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TableFooter, Chip
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import AssessmentIcon from '@mui/icons-material/Assessment';
import CloseIcon from '@mui/icons-material/Close';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { io } from 'socket.io-client';
import { API_URL } from '../config';

const SOCKET_URL = import.meta.env.VITE_SOCKET_IO_URL || import.meta.env.VITE_API_URL;
const socket = io(SOCKET_URL, { autoConnect: true, transports: ["websocket", "polling"] });

const FY_OPTIONS = ['FY 2026-27', 'FY 2025-26', 'FY 2024-25'];

const FY_MONTHS = [
  'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December', 'January', 'February', 'March'
];

const MONTH_NUMBER_MAP = {
  'January': 1, 'February': 2, 'March': 3, 'April': 4, 'May': 5, 'June': 6,
  'July': 7, 'August': 8, 'September': 9, 'October': 10, 'November': 11, 'December': 12
};

// Format numbers in Indian numbering system, or '-' if 0 / null
const fmt = (val) => {
  if (val === undefined || val === null || val === '' || val === 0 || Number(val) === 0) {
    return '-';
  }
  return Number(val).toLocaleString('en-IN');
};

const parseNum = (v) => {
  if (v === undefined || v === null || v === '') return 0;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};

export default function DailyRevenueNvlNvclTab({
  onBack,
  mainTab,
  setMainTab,
  financialYear: initialFY = 'FY 2026-27',
  setFinancialYear: propSetFY
}) {
  // Filter states
  const [filterFY, setFilterFY] = useState(initialFY);
  const [filterMonth, setFilterMonth] = useState('ALL');
  const [filterDate, setFilterDate] = useState('ALL');

  // Applied filter state that triggers API fetch
  const [appliedFilters, setAppliedFilters] = useState({
    fy: initialFY,
    month: 'ALL',
    date: 'ALL'
  });

  const [loading, setLoading] = useState(false);
  const [summaryData, setSummaryData] = useState({
    NVL: { site: 'NVL', billedRevenue: 0, stampNotBilled: 0, nonStampNotBilled: 0, challanNotReceived: 0, total: 0 },
    NVCL: { site: 'NVCL', billedRevenue: 0, stampNotBilled: 0, nonStampNotBilled: 0, challanNotReceived: 0, total: 0 },
    TOTAL: { site: 'TOTAL', billedRevenue: 0, stampNotBilled: 0, nonStampNotBilled: 0, challanNotReceived: 0, total: 0 }
  });
  const [detailedRecords, setDetailedRecords] = useState({
    stampNotBilled: {
      NVL: { all: [], freight: [], unloading: [], total: [] },
      NVCL: { all: [], freight: [], unloading: [], total: [] },
      TOTAL: { all: [], freight: [], unloading: [], total: [] }
    },
    nonStampNotBilled: { NVL: [], NVCL: [], TOTAL: [] },
    challanNotReceived: { NVL: [], NVCL: [], TOTAL: [] }
  });
  const [selectedDateDisplay, setSelectedDateDisplay] = useState('01-04-2026 to Current');

  // Detail Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalType, setModalType] = useState(''); // 'STAMP_NON_BILLED' | 'NON_STAMP_NON_BILLED' | 'CHALLAN_PENDING'
  const [modalSite, setModalSite] = useState('TOTAL');
  const [stampNonBilledTab, setStampNonBilledTab] = useState(0); // 0: ALL, 1: FREIGHT, 2: UNLOADING

  // Calculate startYear and endYear from filterFY
  const { startYear, endYear } = useMemo(() => {
    let sy = 2026;
    if (filterFY && /^FY\s*\d{4}-\d{2}$/i.test(filterFY)) {
      sy = parseInt(filterFY.replace(/\D/g, '').substring(0, 4), 10);
    } else if (filterFY && /^\d{4}-\d{4}$/.test(filterFY)) {
      sy = parseInt(filterFY.split('-')[0], 10);
    } else if (filterFY && /^FY\s*\d{2}-\d{2}$/i.test(filterFY)) {
      const y2 = parseInt(filterFY.replace(/\D/g, '').substring(0, 2), 10);
      sy = (y2 >= 70 ? 1900 : 2000) + y2;
    }
    return { startYear: sy, endYear: sy + 1 };
  }, [filterFY]);

  // Generate dynamic date options based on selected FY and Month
  const dateOptions = useMemo(() => {
    if (filterMonth === 'ALL') return ['ALL'];

    const monthNum = MONTH_NUMBER_MAP[filterMonth];
    if (!monthNum) return ['ALL'];

    const calYear = monthNum >= 4 ? startYear : endYear;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();

    const totalDaysInMonth = new Date(calYear, monthNum, 0).getDate();

    let maxDay = totalDaysInMonth;
    if (calYear === currentYear && monthNum === currentMonth) {
      maxDay = Math.min(currentDay, totalDaysInMonth);
    } else if (calYear > currentYear || (calYear === currentYear && monthNum > currentMonth)) {
      maxDay = 0; // Future month
    }

    const options = ['ALL'];
    const mmStr = String(monthNum).padStart(2, '0');
    for (let d = 1; d <= maxDay; d++) {
      const ddStr = String(d).padStart(2, '0');
      options.push(`${ddStr}-${mmStr}-${calYear}`);
    }
    return options;
  }, [filterMonth, startYear, endYear]);

  // When Month changes, reset Date to 'ALL' if previous selection is invalid
  const handleMonthChange = (e) => {
    const newMonth = e.target.value;
    setFilterMonth(newMonth);
    setFilterDate('ALL');
  };

  // When FY changes
  const handleFYChange = (e) => {
    const newFY = e.target.value;
    setFilterFY(newFY);
    if (propSetFY) propSetFY(newFY);
    setFilterDate('ALL');
  };

  // Apply button handler
  const handleApplyFilters = () => {
    setAppliedFilters({
      fy: filterFY,
      month: filterMonth,
      date: filterDate
    });
  };

  // Fetch real-time consolidated FY summary data from backend
  const fetchRevenueReport = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/daily-summary/revenue-nvl-nvcl`, {
        params: {
          fy: appliedFilters.fy,
          month: appliedFilters.month,
          date: appliedFilters.date
        },
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      if (res.data?.success) {
        if (res.data.summary) {
          setSummaryData(res.data.summary);
        } else if (res.data.rows && res.data.rows.length >= 3) {
          setSummaryData({
            NVL: res.data.rows[0],
            NVCL: res.data.rows[1],
            TOTAL: res.data.rows[2]
          });
        }
        if (res.data.records) {
          setDetailedRecords(res.data.records);
        }
        if (res.data.selectedDate) {
          setSelectedDateDisplay(res.data.selectedDate);
        } else if (res.data.period?.display) {
          setSelectedDateDisplay(res.data.period.display);
        }
      }
    } catch (err) {
      console.error('[DailyRevenueNvlNvclTab] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [appliedFilters]);

  useEffect(() => {
    fetchRevenueReport();
  }, [fetchRevenueReport]);

  // Live real-time socket refresh
  useEffect(() => {
    const handler = () => fetchRevenueReport();
    socket.on('cementUpdates', handler);
    socket.on('fyDetailsUpdates', handler);
    socket.on('billRegisterUpdated', handler);
    socket.on('mainCashbookUpdates', handler);
    return () => {
      socket.off('cementUpdates', handler);
      socket.off('fyDetailsUpdates', handler);
      socket.off('billRegisterUpdated', handler);
      socket.off('mainCashbookUpdates', handler);
    };
  }, [fetchRevenueReport]);

  // Open detail modal on clickable summary cell
  const handleCellClick = (type, site) => {
    setModalType(type);
    setModalSite(site);
    setStampNonBilledTab(0);

    if (type === 'STAMP_NON_BILLED') {
      setModalTitle(`STAMP BUT NON-BILLED — ${site}`);
    } else if (type === 'NON_STAMP_NON_BILLED') {
      setModalTitle(`NON-STAMP BILL DETAILS — ${site}`);
    } else if (type === 'CHALLAN_PENDING') {
      setModalTitle(`PENDING CHALLAN DETAILS — ${site}`);
    }
    setModalOpen(true);
  };

  // Get active modal records based on modalType, modalSite, and stampNonBilledTab
  const modalRecords = useMemo(() => {
    if (!detailedRecords) return [];
    if (modalType === 'STAMP_NON_BILLED') {
      const siteGroup = detailedRecords.stampNotBilled?.[modalSite] || { all: [], freight: [], unloading: [], total: [] };
      if (stampNonBilledTab === 1) return siteGroup.freight || [];
      if (stampNonBilledTab === 2) return siteGroup.unloading || [];
      return siteGroup.all || siteGroup.total || [];
    } else if (modalType === 'NON_STAMP_NON_BILLED') {
      return detailedRecords.nonStampNotBilled?.[modalSite] || [];
    } else if (modalType === 'CHALLAN_PENDING') {
      return detailedRecords.challanNotReceived?.[modalSite] || [];
    }
    return [];
  }, [modalType, modalSite, stampNonBilledTab, detailedRecords]);

  // Modal total billing amount
  const modalTotalAmount = useMemo(() => {
    return modalRecords.reduce((sum, r) => {
      const amt = parseNum(r["Billing Amount"] ?? r["BILLING AMOUNT"] ?? r["BILLING ER 95%"] ?? r["AMOUNT"]);
      return sum + amt;
    }, 0);
  }, [modalRecords]);

  // Export summary table to Excel
  const handleExportExcel = () => {
    try {
      const nvl = summaryData.NVL || {};
      const nvcl = summaryData.NVCL || {};
      const total = summaryData.TOTAL || {};

      const wsData = [
        ['Summary', '', '', '', selectedDateDisplay, ''],
        ['Site', 'Billed Revenue\n(As per Bill register)', 'Unbilled Revenue', '', '', 'TOTAL'],
        ['', '', 'Stamp (Not Billed)', 'Non Stamp(Not Billed)', 'Challan Not Received', ''],
        ['NVL', nvl.billedRevenue || '-', nvl.stampNotBilled || '-', nvl.nonStampNotBilled || '-', nvl.challanNotReceived || '-', nvl.total || '-'],
        ['NVCL', nvcl.billedRevenue || '-', nvcl.stampNotBilled || '-', nvcl.nonStampNotBilled || '-', nvcl.challanNotReceived || '-', nvcl.total || '-'],
        ['TOTAL', total.billedRevenue || '-', total.stampNotBilled || '-', total.nonStampNotBilled || '-', total.challanNotReceived || '-', total.total || '-']
      ];

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }, // Summary across col 0 to 3
        { s: { r: 0, c: 4 }, e: { r: 0, c: 5 } }, // Date col 4 to 5
        { s: { r: 1, c: 0 }, e: { r: 2, c: 0 } }, // Site header
        { s: { r: 1, c: 1 }, e: { r: 2, c: 1 } }, // Billed Revenue
        { s: { r: 1, c: 2 }, e: { r: 1, c: 4 } }, // Unbilled Revenue colSpan 3
        { s: { r: 1, c: 5 }, e: { r: 2, c: 5 } }  // TOTAL
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Summary Revenue');
      const exportFileName = `Summary_Revenue_NVL_NVCL_${appliedFilters.fy.replace(/\s+/g, '_')}_${appliedFilters.month}_${appliedFilters.date}.xlsx`;
      XLSX.writeFile(wb, exportFileName);
    } catch (err) {
      console.error('Excel export error:', err);
    }
  };

  // Export detail modal records to Excel
  const handleExportModalExcel = () => {
    try {
      const exportRows = modalRecords.map((row, idx) => ({
        'SL NO': idx + 1,
        'LOADING DATE': row["LOADING DT"] || row["LOADING DATE"] || row["BILL DATE"] || row["DATE"] || "-",
        'RECEIVING DATE': row["RECEIVING DATE"] || row["Receiving Date"] || row["RECV DATE"] || "-",
        'SITE': row["SITE"] || row["Site"] || "-",
        'VEHICLE NUMBER': row["VEHICLE NUMBER"] || row["VEHICLE NO"] || row["VEHICLE NO."] || "-",
        'INVOICE NO': row["INVOICE NO"] || row["INVOICE NO."] || row["Invoice No"] || "-",
        'SHIPMENT NO': row["SHIPMENT NO"] || row["SHIPMENT NO."] || row["Shipment No"] || row["GCN NO"] || "-",
        'CHALLAN STATUS': row["CHALLAN STATUS"] || "-",
        'DESTINATION': row["DESTINATION"] || row["Destination"] || "-",
        'PARTY NAME': row["PARTY NAME"] || row["Party Name"] || row["PARTY"] || "-",
        'MT': row["MT"] !== undefined && row["MT"] !== null && row["MT"] !== "" ? row["MT"] : (row["QTY (MT)"] || row["QTY"] || "-"),
        'BILLING AMOUNT': parseNum(row["Billing Amount"] ?? row["BILLING AMOUNT"] ?? row["BILLING ER 95%"] ?? row["AMOUNT"]),
        'FREIGHT BILL NO': row["BILL NO"] || row["BILL NUMBER"] || row["FREIGHT BILL NO"] || row["Freight Bill No"] || row.freightBillNo || "-",
        'UNLOADING BILL NO': row["UNLOADING BILL NO"] || row["UNLOADING BILL NUMBER"] || row["Unloading Bill No"] || row.unloadingBillNo || "-"
      }));

      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Detail Records');
      XLSX.writeFile(wb, `${modalTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}_${selectedDateDisplay}.xlsx`);
    } catch (err) {
      console.error('Modal Excel export error:', err);
    }
  };

  // Table cell style helpers
  const tableBorder = '1px solid #000000';
  const thStyle = {
    border: tableBorder,
    padding: '8px 10px',
    fontWeight: 800,
    fontSize: '0.85rem',
    textAlign: 'center',
    verticalAlign: 'middle',
    color: '#000000',
    backgroundColor: '#ffffff',
    lineHeight: 1.25,
    fontFamily: '"Calibri", "Segoe UI", Arial, sans-serif'
  };

  const tdStyle = {
    border: tableBorder,
    padding: '7px 10px',
    fontSize: '0.88rem',
    fontWeight: 700,
    color: '#000000',
    fontFamily: '"Calibri", "Segoe UI", Arial, sans-serif',
    whiteSpace: 'nowrap'
  };

  const clickableTdStyle = {
    ...tdStyle,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    '&:hover': {
      filter: 'brightness(0.92)',
      textDecoration: 'underline'
    }
  };

  const nvl = summaryData.NVL || {};
  const nvcl = summaryData.NVCL || {};
  const total = summaryData.TOTAL || {};

  const stampCounts = detailedRecords.stampNotBilled?.[modalSite] || { all: [], freight: [], unloading: [], total: [] };

  return (
    <Box sx={{
      width: '100%',
      maxWidth: '100vw',
      boxSizing: 'border-box',
      minHeight: '100vh',
      bgcolor: '#f8fafc',
      p: { xs: 1.5, md: 3 },
      overflowX: 'hidden'
    }}>
      {/* ── Top Header Controls ── */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 1.5, md: 2 },
          mb: 3,
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          display: 'flex',
          flexWrap: { xs: 'wrap', xl: 'nowrap' },
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
            <AssessmentIcon sx={{ color: '#38bdf8', fontSize: 20 }} />
          </Box>
          <Box>
            <Typography variant="subtitle1" fontWeight={900} sx={{ letterSpacing: '-0.3px', color: '#0f172a', lineHeight: 1.2, fontSize: { xs: '0.95rem', md: '1.05rem', xl: '1.15rem' }, whiteSpace: 'nowrap' }}>
              SUMMARY REVENUE NVL AND NVCL
            </Typography>
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600, display: { xs: 'none', '2xl': 'block' }, lineHeight: 1 }}>
              Live Billed & Unbilled Revenue Statement • {appliedFilters.fy} ({selectedDateDisplay})
            </Typography>
          </Box>
        </Box>

        {/* Center Navigation Tabs */}
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
              <Tab label="SUMMARY REVENUE NVL AND NVCL" />
              <Tab label="REVENEW" />
            </Tabs>
          </Box>
        )}

        {/* ── Filter Area Controls ── */}
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
          {/* Financial Year Selector */}
          <FormControl size="small">
            <Select
              value={filterFY}
              onChange={handleFYChange}
              sx={{
                bgcolor: 'background.default',
                borderRadius: '8px',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: '#cbd5e1' },
                fontWeight: 700,
                minWidth: { xs: 110, md: 125 },
                fontSize: '0.82rem',
                py: 0
              }}
            >
              {FY_OPTIONS.map(fy => (
                <MenuItem key={fy} value={fy} sx={{ fontWeight: 600, fontSize: '0.82rem' }}>{fy}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Month Selector */}
          <FormControl size="small">
            <Select
              value={filterMonth}
              onChange={handleMonthChange}
              sx={{
                bgcolor: 'background.default',
                borderRadius: '8px',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: '#cbd5e1' },
                fontWeight: 700,
                minWidth: { xs: 90, md: 115 },
                fontSize: '0.82rem',
                py: 0
              }}
            >
              <MenuItem value="ALL" sx={{ fontWeight: 700, fontSize: '0.82rem' }}>ALL</MenuItem>
              {FY_MONTHS.map(m => (
                <MenuItem key={m} value={m} sx={{ fontWeight: 600, fontSize: '0.82rem' }}>{m}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Date Selector */}
          <FormControl size="small">
            <Select
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              disabled={filterMonth === 'ALL'}
              sx={{
                bgcolor: filterMonth === 'ALL' ? '#f1f5f9' : 'background.default',
                borderRadius: '8px',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: '#cbd5e1' },
                fontWeight: 700,
                minWidth: { xs: 90, md: 125 },
                fontSize: '0.82rem',
                py: 0
              }}
            >
              {dateOptions.map(d => (
                <MenuItem key={d} value={d} sx={{ fontWeight: d === 'ALL' ? 700 : 600, fontSize: '0.82rem' }}>
                  {d}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* APPLY Button */}
          <Button
            variant="contained"
            size="small"
            startIcon={<FilterAltIcon />}
            onClick={handleApplyFilters}
            sx={{
              bgcolor: '#2563eb',
              color: '#ffffff',
              fontWeight: 800,
              borderRadius: '8px',
              textTransform: 'none',
              px: 2,
              py: 0.6,
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 4px rgba(37,99,235,0.25)',
              '&:hover': { bgcolor: '#1d4ed8' }
            }}
          >
            APPLY
          </Button>

          {/* Refresh Button */}
          <Tooltip title="Refresh Real-time Data">
            <IconButton
              onClick={fetchRevenueReport}
              disabled={loading}
              sx={{
                bgcolor: '#f1f5f9',
                borderRadius: '8px',
                color: '#0f172a',
                flexShrink: 0,
                '&:hover': { bgcolor: '#e2e8f0' }
              }}
            >
              <RefreshIcon sx={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            </IconButton>
          </Tooltip>

          {/* Export Excel Button */}
          <Button
            variant="contained"
            size="small"
            startIcon={<DownloadIcon />}
            onClick={handleExportExcel}
            sx={{
              bgcolor: '#0f172a',
              color: '#ffffff',
              fontWeight: 700,
              borderRadius: '8px',
              textTransform: 'none',
              px: 2,
              py: 0.6,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              '&:hover': { bgcolor: '#1e293b' }
            }}
          >
            Export Excel
          </Button>
        </Box>
      </Paper>

      {/* ── Table Card Container ── */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, md: 3 },
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          bgcolor: '#ffffff',
          boxShadow: '0 4px 20px rgba(0,0,0,0.03)'
        }}
      >
        {loading ? (
          <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" py={10} gap={2}>
            <CircularProgress size={44} sx={{ color: '#0f172a' }} />
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Calculating live database-driven financial year revenue statement...
            </Typography>
          </Box>
        ) : (
          /* ── Responsive Horizontal Scrolling Wrapper ── */
          <Box sx={{ width: '100%', overflowX: 'auto' }}>
            <Box sx={{ minWidth: 800, display: 'inline-block', width: '100%' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  border: tableBorder,
                  backgroundColor: '#ffffff'
                }}
              >
                <thead style={{ backgroundColor: '#ffffff' }}>
                  {/* Top Bar: Summary (Left/Center) and Selected Reporting Period (Right) */}
                  <tr>
                    <th
                      colSpan={4}
                      style={{
                        ...thStyle,
                        borderBottom: tableBorder,
                        fontSize: '1rem',
                        fontWeight: 900,
                        padding: '9px 16px',
                        textAlign: 'center',
                        backgroundColor: '#ffffff'
                      }}
                    >
                      Summary
                    </th>
                    <th
                      colSpan={2}
                      style={{
                        ...thStyle,
                        borderBottom: tableBorder,
                        fontSize: '0.92rem',
                        fontWeight: 900,
                        textAlign: 'right',
                        padding: '9px 16px',
                        textDecoration: 'underline',
                        backgroundColor: '#ffffff',
                        color: '#0f172a'
                      }}
                    >
                      {selectedDateDisplay}
                    </th>
                  </tr>

                  {/* Header Row 1: Site, Billed Revenue, Unbilled Revenue (merged), TOTAL */}
                  <tr>
                    <th rowSpan={2} style={{ ...thStyle, width: '12%' }}>
                      Site
                    </th>
                    <th rowSpan={2} style={{ ...thStyle, width: '22%' }}>
                      Billed Revenue<br />
                      <span style={{ fontWeight: 700, fontSize: '0.78rem' }}>( As per Bill register )</span>
                    </th>
                    <th
                      colSpan={3}
                      style={{
                        ...thStyle,
                        width: '48%',
                        fontSize: '0.85rem'
                      }}
                    >
                      Unbilled Revenue
                    </th>
                    <th rowSpan={2} style={{ ...thStyle, width: '18%' }}>
                      TOTAL
                    </th>
                  </tr>

                  {/* Header Row 2: Sub-columns under Unbilled Revenue */}
                  <tr>
                    <th style={{ ...thStyle, width: '16%' }}>
                      Stamp ( Not Billed )
                    </th>
                    <th
                      style={{
                        ...thStyle,
                        width: '16%',
                        backgroundColor: '#ffff00', // Yellow highlighted
                        color: '#000000'
                      }}
                    >
                      Non Stamp( Not Billed)
                    </th>
                    <th
                      style={{
                        ...thStyle,
                        width: '16%',
                        backgroundColor: '#ffff00', // Yellow highlighted
                        color: '#000000'
                      }}
                    >
                      Challan Not Received
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {/* Row 1: NVL */}
                  <tr>
                    <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 800 }}>
                      NVL
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      {fmt(nvl.billedRevenue)}
                    </td>
                    <td
                      onClick={() => handleCellClick('STAMP_NON_BILLED', 'NVL')}
                      title="Click to view NVL Stamp (Not Billed) Details"
                      style={{
                        ...clickableTdStyle,
                        textAlign: 'center',
                        color: (nvl.stampNotBilled || 0) > 0 ? '#1d4ed8' : '#000000',
                        cursor: (nvl.stampNotBilled || 0) > 0 ? 'pointer' : 'default'
                      }}
                    >
                      {fmt(nvl.stampNotBilled)}
                    </td>
                    <td
                      onClick={() => handleCellClick('NON_STAMP_NON_BILLED', 'NVL')}
                      title="Click to view NVL Non Stamp (Not Billed) Details"
                      style={{
                        ...clickableTdStyle,
                        textAlign: 'right',
                        backgroundColor: '#ffff00',
                        color: '#000000'
                      }}
                    >
                      {fmt(nvl.nonStampNotBilled)}
                    </td>
                    <td
                      onClick={() => handleCellClick('CHALLAN_PENDING', 'NVL')}
                      title="Click to view NVL Challan Not Received Details"
                      style={{
                        ...clickableTdStyle,
                        textAlign: 'right',
                        backgroundColor: '#ffff00',
                        color: '#000000'
                      }}
                    >
                      {fmt(nvl.challanNotReceived)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800 }}>
                      {fmt(nvl.total)}
                    </td>
                  </tr>

                  {/* Row 2: NVCL */}
                  <tr>
                    <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 800 }}>
                      NVCL
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      {fmt(nvcl.billedRevenue)}
                    </td>
                    <td
                      onClick={() => handleCellClick('STAMP_NON_BILLED', 'NVCL')}
                      title="Click to view NVCL Stamp (Not Billed) Details"
                      style={{
                        ...clickableTdStyle,
                        textAlign: 'center',
                        color: (nvcl.stampNotBilled || 0) > 0 ? '#1d4ed8' : '#000000',
                        cursor: (nvcl.stampNotBilled || 0) > 0 ? 'pointer' : 'default'
                      }}
                    >
                      {fmt(nvcl.stampNotBilled)}
                    </td>
                    <td
                      onClick={() => handleCellClick('NON_STAMP_NON_BILLED', 'NVCL')}
                      title="Click to view NVCL Non Stamp (Not Billed) Details"
                      style={{
                        ...clickableTdStyle,
                        textAlign: 'right',
                        backgroundColor: '#ffff00',
                        color: '#000000'
                      }}
                    >
                      {fmt(nvcl.nonStampNotBilled)}
                    </td>
                    <td
                      onClick={() => handleCellClick('CHALLAN_PENDING', 'NVCL')}
                      title="Click to view NVCL Challan Not Received Details"
                      style={{
                        ...clickableTdStyle,
                        textAlign: 'right',
                        backgroundColor: '#ffff00',
                        color: '#000000'
                      }}
                    >
                      {fmt(nvcl.challanNotReceived)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800 }}>
                      {fmt(nvcl.total)}
                    </td>
                  </tr>

                  {/* Row 3: TOTAL */}
                  <tr style={{ backgroundColor: '#f1f5f9' }}>
                    <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 900, borderBottom: '3px double #0f172a' }}>
                      TOTAL
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 900, borderBottom: '3px double #0f172a' }}>
                      {fmt(total.billedRevenue)}
                    </td>
                    <td
                      onClick={() => handleCellClick('STAMP_NON_BILLED', 'TOTAL')}
                      title="Click to view TOTAL Stamp (Not Billed) Details"
                      style={{
                        ...clickableTdStyle,
                        textAlign: 'center',
                        fontWeight: 900,
                        borderBottom: '3px double #0f172a',
                        color: (total.stampNotBilled || 0) > 0 ? '#1d4ed8' : '#000000'
                      }}
                    >
                      {fmt(total.stampNotBilled)}
                    </td>
                    <td
                      onClick={() => handleCellClick('NON_STAMP_NON_BILLED', 'TOTAL')}
                      title="Click to view TOTAL Non Stamp (Not Billed) Details"
                      style={{
                        ...clickableTdStyle,
                        textAlign: 'right',
                        fontWeight: 900,
                        backgroundColor: '#ffff00',
                        color: '#000000',
                        borderBottom: '3px double #0f172a'
                      }}
                    >
                      {fmt(total.nonStampNotBilled)}
                    </td>
                    <td
                      onClick={() => handleCellClick('CHALLAN_PENDING', 'TOTAL')}
                      title="Click to view TOTAL Challan Not Received Details"
                      style={{
                        ...clickableTdStyle,
                        textAlign: 'right',
                        fontWeight: 900,
                        backgroundColor: '#ffff00',
                        color: '#000000',
                        borderBottom: '3px double #0f172a'
                      }}
                    >
                      {fmt(total.challanNotReceived)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 900, fontSize: '0.94rem', borderBottom: '3px double #0f172a' }}>
                      {fmt(total.total)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </Box>
          </Box>
        )}
      </Paper>

      {/* ── Detail Drill-Down Dialog (Exact Daily Summary Structure) ── */}
      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        maxWidth="xl"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '16px',
            bgcolor: '#ffffff',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            maxHeight: '90vh'
          }
        }}
      >
        <DialogTitle sx={{ bgcolor: 'background.paper', borderBottom: modalType === 'STAMP_NON_BILLED' ? 'none' : '1px solid #e2e8f0', px: 3, py: 2 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box display="flex" alignItems="center" gap={1.5}>
              <Typography variant="h6" fontWeight={800} color="#0f172a">
                {modalTitle}
              </Typography>
              <Chip
                label={`Context: ${appliedFilters.fy} • ${selectedDateDisplay}`}
                size="small"
                sx={{ bgcolor: '#f1f5f9', color: '#475569', fontWeight: 700, fontSize: '0.75rem' }}
              />
            </Box>
            <Box display="flex" alignItems="center" gap={1.5}>
              <Chip
                label={`Total: ₹${modalTotalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                sx={{ bgcolor: '#dcfce7', color: '#15803d', fontWeight: 800, borderRadius: '8px' }}
              />
              <Chip
                label={`${modalRecords.length} Records`}
                sx={{ bgcolor: '#e0e7ff', color: '#4338ca', fontWeight: 800, borderRadius: '8px' }}
              />
              <Button
                variant="outlined"
                size="small"
                startIcon={<DownloadIcon />}
                onClick={handleExportModalExcel}
                sx={{
                  bgcolor: '#ffffff',
                  color: '#0f172a',
                  fontWeight: 700,
                  borderRadius: '8px',
                  px: 1.5,
                  py: 0.5,
                  textTransform: 'none',
                  border: '1px solid #cbd5e1',
                  '&:hover': { bgcolor: '#f1f5f9' }
                }}
              >
                Export Excel
              </Button>
              <IconButton onClick={() => setModalOpen(false)} size="small" sx={{ color: '#64748b' }}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>
        </DialogTitle>

        {modalType === 'STAMP_NON_BILLED' && (
          <Box sx={{ px: 3, pb: 1.5, bgcolor: 'background.paper', borderBottom: '1px solid #e2e8f0' }}>
            <Tabs
              value={stampNonBilledTab}
              onChange={(e, val) => setStampNonBilledTab(val)}
              sx={{
                minHeight: '38px',
                '& .MuiTab-root': {
                  textTransform: 'none',
                  fontWeight: 800,
                  fontSize: '0.82rem',
                  minHeight: '38px',
                  py: 0.5,
                  px: 2.5,
                  mr: 1.5,
                  borderRadius: '8px',
                  color: '#64748b',
                  bgcolor: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  transition: 'all 0.2s',
                  '&:hover': { bgcolor: '#e2e8f0', color: '#0f172a' }
                },
                '& .Mui-selected': {
                  bgcolor: '#0f172a !important',
                  color: '#ffffff !important',
                  borderColor: '#0f172a !important',
                  boxShadow: '0 2px 8px rgba(15,23,42,0.2)'
                }
              }}
              TabIndicatorProps={{ style: { display: 'none' } }}
            >
              <Tab label={`ALL (${(stampCounts.all || []).length})`} />
              <Tab label={`FREIGHT (${(stampCounts.freight || []).length})`} />
              <Tab label={`UNLOADING (${(stampCounts.unloading || []).length})`} />
            </Tabs>
          </Box>
        )}

        <DialogContent sx={{ p: 2.5, bgcolor: '#f8fafc' }}>
          <TableContainer
            component={Paper}
            sx={{
              borderRadius: '12px',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)',
              border: '1px solid #e2e8f0',
              overflowX: 'auto',
              maxHeight: '62vh'
            }}
          >
            <Table stickyHeader size="small" sx={{ minWidth: modalType === 'STAMP_NON_BILLED' ? 1700 : 1400 }}>
              <TableHead>
                {modalType === 'STAMP_NON_BILLED' ? (
                  <TableRow>
                    <TableCell sx={{ fontWeight: 800, color: '#475569', py: 1.5, bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>SL NO</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>LOADING DATE</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>RECEIVING DATE</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>SITE</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>VEHICLE NUMBER</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>INVOICE NO</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>SHIPMENT NO</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>CHALLAN STATUS</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>DESTINATION</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>PARTY NAME</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>MT</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>BILLING AMOUNT</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>FREIGHT BILL NO</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>UNLOADING BILL NO</TableCell>
                  </TableRow>
                ) : modalType === 'NON_STAMP_NON_BILLED' ? (
                  <TableRow>
                    <TableCell sx={{ fontWeight: 800, color: '#475569', py: 1.5, bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>SL NO</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>LOADING DATE</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>RECEIVING DATE</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>SITE</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>VEHICLE NUMBER</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>INVOICE NO</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>SHIPMENT NO</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>CHALLAN STATUS</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>DESTINATION</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>PARTY NAME</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>MT</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>BILLING AMOUNT</TableCell>
                  </TableRow>
                ) : (
                  <TableRow>
                    <TableCell sx={{ fontWeight: 800, color: '#475569', py: 1.5, bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>SL NO</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>LOADING DATE</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>SITE</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>VEHICLE NUMBER</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>INVOICE NO</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>SHIPMENT NO</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>CHALLAN STATUS</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>DESTINATION</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>PARTY NAME</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>MT</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>BILLING AMOUNT</TableCell>
                  </TableRow>
                )}
              </TableHead>
              <TableBody>
                {modalRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={modalType === 'STAMP_NON_BILLED' ? 14 : 12} align="center" sx={{ py: 4, color: '#64748b', fontWeight: 600 }}>
                      No records found for the selected filter context.
                    </TableCell>
                  </TableRow>
                ) : (
                  modalRecords.map((row, idx) => {
                    const status = String(row["CHALLAN STATUS"] || (modalType === 'STAMP_NON_BILLED' ? 'STAMP' : modalType === 'NON_STAMP_NON_BILLED' ? 'NON STAMP' : 'Pending')).trim();
                    const statusUpper = status.toUpperCase();
                    const isStamp = statusUpper === 'STAMP';
                    const isNonStamp = statusUpper.includes('NON-STAMP') || statusUpper.includes('NON STAMP');
                    const chipBg = isStamp ? '#dcfce7' : isNonStamp ? '#fee2e2' : '#fffbeb';
                    const chipColor = isStamp ? '#15803d' : isNonStamp ? '#b91c1c' : '#b45309';
                    const chipBorder = isStamp ? '#86efac' : isNonStamp ? '#fca5a5' : '#fcd34d';

                    const rawAmt = row["Billing Amount"] ?? row["BILLING AMOUNT"] ?? row["BILLING ER 95%"] ?? row["AMOUNT"];
                    const formattedAmt = (rawAmt !== undefined && rawAmt !== null && rawAmt !== '')
                      ? `₹${parseNum(rawAmt).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : '-';

                    const recvDate = row["RECEIVING DATE"] || row["Receiving Date"] || row["RECV DATE"] || "-";

                    const freightBillNo = String(row["BILL NO"] || row["BILL NUMBER"] || row["FREIGHT BILL NO"] || row["Freight Bill No"] || row.freightBillNo || '').trim();
                    const hasFreight = freightBillNo !== '' && freightBillNo !== '-' && freightBillNo.toLowerCase() !== 'null' && freightBillNo.toLowerCase() !== 'undefined';

                    const unloadingBillNo = String(row["UNLOADING BILL NO"] || row["UNLOADING BILL NUMBER"] || row["Unloading Bill No"] || row.unloadingBillNo || '').trim();
                    const hasUnloading = unloadingBillNo !== '' && unloadingBillNo !== '-' && unloadingBillNo.toLowerCase() !== 'null' && unloadingBillNo.toLowerCase() !== 'undefined';

                    return (
                      <TableRow key={row.id || row._id || idx} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                        <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 700, color: '#64748b' }}>{idx + 1}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{row["LOADING DT"] || row["LOADING DATE"] || row["BILL DATE"] || row["DATE"] || "-"}</TableCell>
                        {modalType !== 'CHALLAN_PENDING' && (
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>{recvDate}</TableCell>
                        )}
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{row["SITE"] || row["Site"] || "-"}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 700, color: '#0f172a' }}>{row["VEHICLE NUMBER"] || row["VEHICLE NO"] || row["VEHICLE NO."] || "-"}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{row["INVOICE NO"] || row["INVOICE NO."] || row["Invoice No"] || "-"}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{row["SHIPMENT NO"] || row["SHIPMENT NO."] || row["Shipment No"] || row["GCN NO"] || "-"}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <Chip
                            size="small"
                            label={status}
                            sx={{
                              bgcolor: chipBg,
                              color: chipColor,
                              border: `1px solid ${chipBorder}`,
                              fontWeight: 800,
                              fontSize: '0.72rem'
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{row["DESTINATION"] || row["Destination"] || "-"}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{row["PARTY NAME"] || row["Party Name"] || row["PARTY"] || "-"}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{row["MT"] !== undefined && row["MT"] !== null && row["MT"] !== "" ? row["MT"] : (row["QTY (MT)"] || row["QTY"] || "-")}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 700, color: '#0f172a' }}>{formattedAmt}</TableCell>
                        {modalType === 'STAMP_NON_BILLED' && (
                          <>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>
                              {hasFreight ? (
                                <Chip size="small" label={freightBillNo} sx={{ bgcolor: '#dbeafe', color: '#1e40af', fontWeight: 800, fontSize: '0.72rem' }} />
                              ) : (
                                <Typography variant="caption" sx={{ color: '#dc2626', fontWeight: 800, bgcolor: '#fee2e2', px: 1, py: 0.3, borderRadius: '4px', display: 'inline-block' }}>PENDING</Typography>
                              )}
                            </TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>
                              {hasUnloading ? (
                                <Chip size="small" label={unloadingBillNo} sx={{ bgcolor: '#dcfce7', color: '#166534', fontWeight: 800, fontSize: '0.72rem' }} />
                              ) : (
                                <Typography variant="caption" sx={{ color: '#dc2626', fontWeight: 800, bgcolor: '#fee2e2', px: 1, py: 0.3, borderRadius: '4px', display: 'inline-block' }}>PENDING</Typography>
                              )}
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
              {modalRecords.length > 0 && (
                <TableFooter sx={{ position: 'sticky', bottom: 0, bgcolor: '#f8fafc', zIndex: 3 }}>
                  <TableRow sx={{ bgcolor: '#f1f5f9', borderTop: '2px solid #cbd5e1' }}>
                    <TableCell colSpan={modalType === 'STAMP_NON_BILLED' ? 11 : (modalType === 'NON_STAMP_NON_BILLED' ? 11 : 10)} sx={{ fontWeight: 900, fontSize: '0.85rem', color: '#0f172a', py: 1.5, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      TOTAL BILLING AMOUNT:
                    </TableCell>
                    <TableCell sx={{ fontWeight: 900, fontSize: '0.9rem', color: '#15803d', py: 1.5, whiteSpace: 'nowrap' }}>
                      ₹{modalTotalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                    {modalType === 'STAMP_NON_BILLED' && (
                      <TableCell colSpan={2} />
                    )}
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </TableContainer>
        </DialogContent>
      </Dialog>
    </Box>
  );
}

