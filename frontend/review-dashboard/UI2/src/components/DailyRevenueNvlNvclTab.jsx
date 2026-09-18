import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Paper, IconButton, CircularProgress,
  FormControl, Select, MenuItem, Button, Tooltip, Tabs, Tab
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import AssessmentIcon from '@mui/icons-material/Assessment';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { io } from 'socket.io-client';
import { API_URL } from '../config';

const SOCKET_URL = import.meta.env.VITE_SOCKET_IO_URL || import.meta.env.VITE_API_URL;
const socket = io(SOCKET_URL, { autoConnect: true, transports: ["websocket", "polling"] });

const MONTH_NAMES = [
  'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December', 'January', 'February', 'March'
];

const FY_OPTIONS = ['FY 2026-27', 'FY 2025-26', 'FY 2024-25'];

// Format numbers in Indian numbering system, or '-' if 0 / null
const fmt = (val) => {
  if (val === undefined || val === null || val === '' || val === 0 || Number(val) === 0) {
    return '-';
  }
  return Number(val).toLocaleString('en-IN');
};

export default function DailyRevenueNvlNvclTab({
  onBack,
  mainTab,
  setMainTab,
  financialYear: initialFY = 'FY 2026-27',
  month: initialMonth = 'September',
  date: initialDate = 'ALL'
}) {
  const [financialYear, setFinancialYear] = useState(initialFY);
  const [month, setMonth] = useState(initialMonth);
  const [date, setDate] = useState(initialDate);
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [unbilledHeaderDate, setUnbilledHeaderDate] = useState('April26-15.09.26');
  const [selectedDateDisplay, setSelectedDateDisplay] = useState('16-09-2026');

  // Compute available dates in the selected month & FY
  const availableDates = useMemo(() => {
    let startYear = 2026;
    const parts = String(financialYear).replace(/^FY\s*/i, '').split('-');
    if (parts.length > 0) {
      let sy = parseInt(parts[0], 10);
      if (sy < 100) sy += 2000;
      if (!isNaN(sy)) startYear = sy;
    }

    const mIdx = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ].indexOf(month);

    if (mIdx === -1) return [];

    const yr = mIdx < 3 ? startYear + 1 : startYear;
    const daysInMonth = new Date(yr, mIdx + 1, 0).getDate();

    const dates = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dStr = String(d).padStart(2, '0');
      const mStr = String(mIdx + 1).padStart(2, '0');
      dates.push(`${yr}-${mStr}-${dStr}`);
    }
    return dates;
  }, [financialYear, month]);

  // Fetch report data from backend
  const fetchRevenueReport = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/daily-summary/revenue-nvl-nvcl`, {
        params: {
          date: date,
          fy: financialYear,
          month: month
        },
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data?.success) {
        setReportData(res.data.data);
        if (res.data.unbilledHeaderDate) {
          setUnbilledHeaderDate(res.data.unbilledHeaderDate);
        }
        if (res.data.selectedDate) {
          setSelectedDateDisplay(res.data.selectedDate);
        }
      }
    } catch (err) {
      console.error('[DailyRevenueNvlNvclTab] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [date, financialYear, month]);

  useEffect(() => {
    fetchRevenueReport();
  }, [fetchRevenueReport]);

  // Live real-time socket refresh
  useEffect(() => {
    const handler = () => fetchRevenueReport();
    socket.on('cementUpdates', handler);
    socket.on('fyDetailsUpdates', handler);
    socket.on('mainCashbookUpdates', handler);
    return () => {
      socket.off('cementUpdates', handler);
      socket.off('fyDetailsUpdates', handler);
      socket.off('mainCashbookUpdates', handler);
    };
  }, [fetchRevenueReport]);

  // Fallback / default data structure
  const data = reportData || {
    NVL: {
      billedRevenue: 0,
      billedSubmitted: 0,
      paymentReceived: 0,
      revisedBilledRevenue: 0,
      stampNotBilled: 0,
      nonStampNotBilled: 0,
      challanNotReceived: 0,
      total: 0
    },
    NVCL: {
      billedRevenue: 0,
      billedSubmitted: 0,
      paymentReceived: 0,
      revisedBilledRevenue: 0,
      stampNotBilled: 0,
      nonStampNotBilled: 0,
      challanNotReceived: 0,
      total: 0
    },
    TOTAL: {
      billedRevenue: 0,
      billedSubmitted: 0,
      paymentReceived: 0,
      revisedBilledRevenue: 0,
      stampNotBilled: 0,
      nonStampNotBilled: 0,
      challanNotReceived: 0,
      total: 0
    }
  };

  // Export to Excel replicating the exact sheet structure
  const handleExportExcel = () => {
    try {
      const wsData = [
        ['Summary', '', '', '', '', '', '', selectedDateDisplay],
        ['Site', 'Billed Revenue\n(As per Bill register)', 'Billed\nSubmitted', 'Payment Received', 'Revised Billed Revenue', `Unbilled Revenue (${unbilledHeaderDate})`, '', '', 'TOTAL'],
        ['', '', '', '', '', 'Stamp (Not Billed)', 'Non Stamp(Not Billed)', 'Challan Not Received', ''],
        [
          'NVL',
          data.NVL.billedRevenue || '-',
          data.NVL.billedSubmitted || '-',
          data.NVL.paymentReceived || '-',
          data.NVL.revisedBilledRevenue || '-',
          data.NVL.stampNotBilled || '-',
          data.NVL.nonStampNotBilled || '-',
          data.NVL.challanNotReceived || '-',
          data.NVL.total || '-'
        ],
        [
          'NVCL',
          data.NVCL.billedRevenue || '-',
          data.NVCL.billedSubmitted || '-',
          data.NVCL.paymentReceived || '-',
          data.NVCL.revisedBilledRevenue || '-',
          data.NVCL.stampNotBilled || '-',
          data.NVCL.nonStampNotBilled || '-',
          data.NVCL.challanNotReceived || '-',
          data.NVCL.total || '-'
        ],
        [
          'TOTAL',
          data.TOTAL.billedRevenue || '-',
          data.TOTAL.billedSubmitted || '-',
          data.TOTAL.paymentReceived || '-',
          data.TOTAL.revisedBilledRevenue || '-',
          data.TOTAL.stampNotBilled || '-',
          data.TOTAL.nonStampNotBilled || '-',
          data.TOTAL.challanNotReceived || '-',
          data.TOTAL.total || '-'
        ]
      ];

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      // Merges
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }, // Summary across col 0 to 6
        { s: { r: 0, c: 7 }, e: { r: 0, c: 8 } }, // Date col 7 to 8
        { s: { r: 1, c: 0 }, e: { r: 2, c: 0 } }, // Site
        { s: { r: 1, c: 1 }, e: { r: 2, c: 1 } }, // Billed Revenue
        { s: { r: 1, c: 2 }, e: { r: 2, c: 2 } }, // Billed Submitted
        { s: { r: 1, c: 3 }, e: { r: 2, c: 3 } }, // Payment Received
        { s: { r: 1, c: 4 }, e: { r: 2, c: 4 } }, // Revised Billed Revenue
        { s: { r: 1, c: 5 }, e: { r: 1, c: 7 } }, // Unbilled Revenue colSpan 3
        { s: { r: 1, c: 8 }, e: { r: 2, c: 8 } }, // TOTAL
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Daily Revenue');
      XLSX.writeFile(wb, `Daily_Revenue_NVL_NVCL_${selectedDateDisplay}.xlsx`);
    } catch (err) {
      console.error('Excel export error:', err);
    }
  };

  // Table cell style helpers
  const tableBorder = '1px solid #000000';
  const thStyle = {
    border: tableBorder,
    padding: '8px 10px',
    fontWeight: 800,
    fontSize: '0.88rem',
    textAlign: 'center',
    verticalAlign: 'middle',
    color: '#000000',
    backgroundColor: '#ffffff',
    lineHeight: 1.25,
    fontFamily: '"Calibri", "Segoe UI", Arial, sans-serif'
  };

  const tdStyle = {
    border: tableBorder,
    padding: '7px 12px',
    fontSize: '0.95rem',
    fontWeight: 700,
    color: '#000000',
    fontFamily: '"Calibri", "Segoe UI", Arial, sans-serif',
    whiteSpace: 'nowrap'
  };

  return (
    <Box sx={{ width: '100%', minHeight: '100vh', bgcolor: '#f8fafc', p: { xs: 1.5, md: 3 } }}>
      {/* ── Top Header Controls ── */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 1.5, md: 2 },
          mb: 3,
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
              Daily Revenue NVL & NVCL
            </Typography>
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600, display: { xs: 'none', '2xl': 'block' }, lineHeight: 1 }}>
              Live Billed & Unbilled Revenue Statement • {selectedDateDisplay}
            </Typography>
          </Box>
        </Box>

        {/* Center Tabs */}
        {setMainTab && (
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

        {/* Action Controls */}
        <Box display="flex" alignItems="center" gap={{ xs: 0.8, md: 1 }} flexShrink={0} sx={{ order: { xs: 2, lg: 3 } }}>
          {/* Financial Year Selector */}
          <FormControl size="small">
            <Select
              value={financialYear}
              onChange={(e) => setFinancialYear(e.target.value)}
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
              {FY_OPTIONS.map(fy => (
                <MenuItem key={fy} value={fy} sx={{ fontWeight: 600, fontSize: '0.8rem' }}>{fy}</MenuItem>
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
                bgcolor: 'background.default',
                borderRadius: '8px',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
                fontWeight: 700,
                minWidth: { xs: 90, md: 105 },
                fontSize: '0.8rem',
                py: 0
              }}
            >
              {MONTH_NAMES.map(m => (
                <MenuItem key={m} value={m} sx={{ fontWeight: 600, fontSize: '0.8rem' }}>{m}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Specific Date Selector */}
          <FormControl size="small">
            <Select
              value={date}
              onChange={(e) => setDate(e.target.value)}
              sx={{
                bgcolor: 'background.default',
                borderRadius: '8px',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
                fontWeight: 700,
                minWidth: { xs: 95, md: 110 },
                fontSize: '0.8rem',
                py: 0
              }}
            >
              <MenuItem value="ALL" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>Full Month</MenuItem>
              {availableDates.map(d => {
                const parts = d.split('-');
                const display = `${parts[2]}-${parts[1]}-${parts[0]}`;
                return (
                  <MenuItem key={d} value={d} sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                    {display}
                  </MenuItem>
                );
              })}
            </Select>
          </FormControl>

          {/* Refresh Button */}
          <Tooltip title="Refresh Data">
            <IconButton
              onClick={fetchRevenueReport}
              disabled={loading}
              sx={{
                bgcolor: '#f1f5f9',
                borderRadius: '8px',
                color: '#0f172a',
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
              Calculating live revenue statement from registers...
            </Typography>
          </Box>
        ) : (
          /* ── Responsive Horizontal Scrolling Wrapper ── */
          <Box sx={{ width: '100%', overflowX: 'auto' }}>
            <Box sx={{ minWidth: 900, display: 'inline-block', width: '100%' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  border: tableBorder,
                  backgroundColor: '#ffffff'
                }}
              >
                <thead>
                  {/* Top Bar: Summary (Left/Center) and Selected Date (Right) */}
                  <tr>
                    <th
                      colSpan={7}
                      style={{
                        ...thStyle,
                        borderBottom: tableBorder,
                        fontSize: '1rem',
                        fontWeight: 900,
                        padding: '8px 16px',
                        textAlign: 'center'
                      }}
                    >
                      Summary
                    </th>
                    <th
                      colSpan={2}
                      style={{
                        ...thStyle,
                        borderBottom: tableBorder,
                        fontSize: '0.95rem',
                        fontWeight: 900,
                        textAlign: 'right',
                        padding: '8px 16px',
                        textDecoration: 'underline'
                      }}
                    >
                      {selectedDateDisplay}
                    </th>
                  </tr>

                  {/* Header Row 1: Site, Billed Revenue, Billed Submitted, Payment Received, Revised Billed Revenue, Unbilled Revenue (merged), TOTAL */}
                  <tr>
                    <th rowSpan={2} style={{ ...thStyle, width: '9%' }}>
                      Site
                    </th>
                    <th rowSpan={2} style={{ ...thStyle, width: '14%' }}>
                      Billed Revenue<br />
                      <span style={{ fontWeight: 700, fontSize: '0.8rem' }}>( As per Bill register )</span>
                    </th>
                    <th rowSpan={2} style={{ ...thStyle, width: '10%' }}>
                      Billed<br />Submitted
                    </th>
                    <th rowSpan={2} style={{ ...thStyle, width: '11%' }}>
                      Payment Received
                    </th>
                    <th rowSpan={2} style={{ ...thStyle, width: '14%' }}>
                      Revised Billed Revenue
                    </th>
                    <th
                      colSpan={3}
                      style={{
                        ...thStyle,
                        width: '32%',
                        fontSize: '0.85rem'
                      }}
                    >
                      Unbilled Revenue ({unbilledHeaderDate})
                    </th>
                    <th rowSpan={2} style={{ ...thStyle, width: '10%' }}>
                      TOTAL
                    </th>
                  </tr>

                  {/* Header Row 2: Sub-columns under Unbilled Revenue */}
                  <tr>
                    <th style={{ ...thStyle, width: '11%' }}>
                      Stamp ( Not Billed )
                    </th>
                    <th
                      style={{
                        ...thStyle,
                        width: '10.5%',
                        backgroundColor: '#ffff00', // Exact bright yellow from reference image
                        color: '#000000'
                      }}
                    >
                      Non Stamp( Not Billed)
                    </th>
                    <th
                      style={{
                        ...thStyle,
                        width: '10.5%',
                        backgroundColor: '#ffff00', // Exact bright yellow from reference image
                        color: '#000000'
                      }}
                    >
                      Challan Not Received
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {/* NVL Row */}
                  <tr>
                    <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 800 }}>
                      NVL
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      {fmt(data.NVL.billedRevenue)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {fmt(data.NVL.billedSubmitted)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {fmt(data.NVL.paymentReceived)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      {fmt(data.NVL.revisedBilledRevenue)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {fmt(data.NVL.stampNotBilled)}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: 'right',
                        backgroundColor: '#ffff00', // Yellow highlighted as in screenshot
                        color: '#000000'
                      }}
                    >
                      {fmt(data.NVL.nonStampNotBilled)}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: 'right',
                        backgroundColor: '#ffff00', // Yellow highlighted as in screenshot
                        color: '#000000'
                      }}
                    >
                      {fmt(data.NVL.challanNotReceived)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800 }}>
                      {fmt(data.NVL.total)}
                    </td>
                  </tr>

                  {/* NVCL Row */}
                  <tr>
                    <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 800 }}>
                      NVCL
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      {fmt(data.NVCL.billedRevenue)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {fmt(data.NVCL.billedSubmitted)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {fmt(data.NVCL.paymentReceived)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      {fmt(data.NVCL.revisedBilledRevenue)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {fmt(data.NVCL.stampNotBilled)}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: 'right',
                        backgroundColor: '#ffff00', // Yellow highlighted as in screenshot
                        color: '#000000'
                      }}
                    >
                      {fmt(data.NVCL.nonStampNotBilled)}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: 'right',
                        backgroundColor: '#ffff00', // Yellow highlighted as in screenshot
                        color: '#000000'
                      }}
                    >
                      {fmt(data.NVCL.challanNotReceived)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800 }}>
                      {fmt(data.NVCL.total)}
                    </td>
                  </tr>

                  {/* TOTAL Row */}
                  <tr style={{ backgroundColor: '#ffffff' }}>
                    <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 900 }}>
                      {/* Blank or TOTAL as in screenshot */}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 900 }}>
                      {fmt(data.TOTAL.billedRevenue)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 900 }}>
                      {fmt(data.TOTAL.billedSubmitted)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 900 }}>
                      {fmt(data.TOTAL.paymentReceived)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 900 }}>
                      {fmt(data.TOTAL.revisedBilledRevenue)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 900 }}>
                      {fmt(data.TOTAL.stampNotBilled)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 900 }}>
                      {fmt(data.TOTAL.nonStampNotBilled)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 900 }}>
                      {fmt(data.TOTAL.challanNotReceived)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 900 }}>
                      {fmt(data.TOTAL.total)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </Box>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
