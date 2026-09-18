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
  const [reportDays, setReportDays] = useState([]);
  const [monthTotal, setMonthTotal] = useState(null);
  const [selectedDateDisplay, setSelectedDateDisplay] = useState('September 2026');

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
        setReportDays(res.data.days || []);
        setMonthTotal(res.data.monthTotal || null);
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

  // Export to Excel replicating the exact day-wise sheet structure
  const handleExportExcel = () => {
    try {
      const wsData = [
        ['Summary', '', '', '', '', '', '', '', selectedDateDisplay],
        ['Date', 'Site', 'Billed Revenue\n(As per Bill register)', 'Billed\nSubmitted', 'Payment Received', 'Revised Billed Revenue', 'Unbilled Revenue', '', '', 'TOTAL'],
        ['', '', '', '', '', '', 'Stamp (Not Billed)', 'Non Stamp(Not Billed)', 'Challan Not Received', '']
      ];

      // Add each day's rows
      reportDays.forEach(d => {
        wsData.push([
          d.date,
          'NVL',
          d.NVL.billedRevenue || '-',
          d.NVL.billedSubmitted || '-',
          d.NVL.paymentReceived || '-',
          d.NVL.revisedBilledRevenue || '-',
          d.NVL.stampNotBilled || '-',
          d.NVL.nonStampNotBilled || '-',
          d.NVL.challanNotReceived || '-',
          d.NVL.total || '-'
        ]);
        wsData.push([
          d.date,
          'NVCL',
          d.NVCL.billedRevenue || '-',
          d.NVCL.billedSubmitted || '-',
          d.NVCL.paymentReceived || '-',
          d.NVCL.revisedBilledRevenue || '-',
          d.NVCL.stampNotBilled || '-',
          d.NVCL.nonStampNotBilled || '-',
          d.NVCL.challanNotReceived || '-',
          d.NVCL.total || '-'
        ]);
        wsData.push([
          d.date,
          'TOTAL',
          d.TOTAL.billedRevenue || '-',
          d.TOTAL.billedSubmitted || '-',
          d.TOTAL.paymentReceived || '-',
          d.TOTAL.revisedBilledRevenue || '-',
          d.TOTAL.stampNotBilled || '-',
          d.TOTAL.nonStampNotBilled || '-',
          d.TOTAL.challanNotReceived || '-',
          d.TOTAL.total || '-'
        ]);
      });

      // Add Month Total at the bottom
      if (monthTotal) {
        wsData.push(['', '', '', '', '', '', '', '', '', '']); // Spacer row
        wsData.push([
          'MONTH TOTAL',
          'NVL',
          monthTotal.NVL.billedRevenue || '-',
          monthTotal.NVL.billedSubmitted || '-',
          monthTotal.NVL.paymentReceived || '-',
          monthTotal.NVL.revisedBilledRevenue || '-',
          monthTotal.NVL.stampNotBilled || '-',
          monthTotal.NVL.nonStampNotBilled || '-',
          monthTotal.NVL.challanNotReceived || '-',
          monthTotal.NVL.total || '-'
        ]);
        wsData.push([
          'MONTH TOTAL',
          'NVCL',
          monthTotal.NVCL.billedRevenue || '-',
          monthTotal.NVCL.billedSubmitted || '-',
          monthTotal.NVCL.paymentReceived || '-',
          monthTotal.NVCL.revisedBilledRevenue || '-',
          monthTotal.NVCL.stampNotBilled || '-',
          monthTotal.NVCL.nonStampNotBilled || '-',
          monthTotal.NVCL.challanNotReceived || '-',
          monthTotal.NVCL.total || '-'
        ]);
        wsData.push([
          'MONTH TOTAL',
          'GRAND TOTAL',
          monthTotal.TOTAL.billedRevenue || '-',
          monthTotal.TOTAL.billedSubmitted || '-',
          monthTotal.TOTAL.paymentReceived || '-',
          monthTotal.TOTAL.revisedBilledRevenue || '-',
          monthTotal.TOTAL.stampNotBilled || '-',
          monthTotal.TOTAL.nonStampNotBilled || '-',
          monthTotal.TOTAL.challanNotReceived || '-',
          monthTotal.TOTAL.total || '-'
        ]);
      }

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      // Merges
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }, // Summary across col 0 to 7
        { s: { r: 0, c: 8 }, e: { r: 0, c: 9 } }, // Date col 8 to 9
        { s: { r: 1, c: 0 }, e: { r: 2, c: 0 } }, // Date header
        { s: { r: 1, c: 1 }, e: { r: 2, c: 1 } }, // Site header
        { s: { r: 1, c: 2 }, e: { r: 2, c: 2 } }, // Billed Revenue
        { s: { r: 1, c: 3 }, e: { r: 2, c: 3 } }, // Billed Submitted
        { s: { r: 1, c: 4 }, e: { r: 2, c: 4 } }, // Payment Received
        { s: { r: 1, c: 5 }, e: { r: 2, c: 5 } }, // Revised Billed Revenue
        { s: { r: 1, c: 6 }, e: { r: 1, c: 8 } }, // Unbilled Revenue colSpan 3
        { s: { r: 1, c: 9 }, e: { r: 2, c: 9 } }, // TOTAL
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Daily Revenue');
      XLSX.writeFile(wb, `Daily_Revenue_NVL_NVCL_${month}_${financialYear.replace(/\s+/g, '_')}.xlsx`);
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
    padding: '6px 10px',
    fontSize: '0.88rem',
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
              Calculating live day-wise revenue statement from registers...
            </Typography>
          </Box>
        ) : (
          /* ── Responsive Horizontal Scrolling Wrapper ── */
          <Box sx={{ width: '100%', overflowX: 'auto', maxHeight: '75vh', overflowY: 'auto' }}>
            <Box sx={{ minWidth: 1050, display: 'inline-block', width: '100%' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  border: tableBorder,
                  backgroundColor: '#ffffff'
                }}
              >
                <thead style={{ position: 'sticky', top: 0, zIndex: 3, backgroundColor: '#ffffff' }}>
                  {/* Top Bar: Summary (Left/Center) and Selected Month / Date (Right) */}
                  <tr>
                    <th
                      colSpan={8}
                      style={{
                        ...thStyle,
                        borderBottom: tableBorder,
                        fontSize: '1rem',
                        fontWeight: 900,
                        padding: '8px 16px',
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
                        fontSize: '0.95rem',
                        fontWeight: 900,
                        textAlign: 'right',
                        padding: '8px 16px',
                        textDecoration: 'underline',
                        backgroundColor: '#ffffff'
                      }}
                    >
                      {selectedDateDisplay}
                    </th>
                  </tr>

                  {/* Header Row 1: Date, Site, Billed Revenue, Billed Submitted, Payment Received, Revised Billed Revenue, Unbilled Revenue (merged), TOTAL */}
                  <tr>
                    <th rowSpan={2} style={{ ...thStyle, width: '10%' }}>
                      Date
                    </th>
                    <th rowSpan={2} style={{ ...thStyle, width: '7%' }}>
                      Site
                    </th>
                    <th rowSpan={2} style={{ ...thStyle, width: '13%' }}>
                      Billed Revenue<br />
                      <span style={{ fontWeight: 700, fontSize: '0.78rem' }}>( As per Bill register )</span>
                    </th>
                    <th rowSpan={2} style={{ ...thStyle, width: '10%' }}>
                      Billed<br />Submitted
                    </th>
                    <th rowSpan={2} style={{ ...thStyle, width: '10%' }}>
                      Payment Received
                    </th>
                    <th rowSpan={2} style={{ ...thStyle, width: '13%' }}>
                      Revised Billed Revenue
                    </th>
                    <th
                      colSpan={3}
                      style={{
                        ...thStyle,
                        width: '27%',
                        fontSize: '0.85rem'
                      }}
                    >
                      Unbilled Revenue
                    </th>
                    <th rowSpan={2} style={{ ...thStyle, width: '10%' }}>
                      TOTAL
                    </th>
                  </tr>

                  {/* Header Row 2: Sub-columns under Unbilled Revenue */}
                  <tr>
                    <th style={{ ...thStyle, width: '9%' }}>
                      Stamp ( Not Billed )
                    </th>
                    <th
                      style={{
                        ...thStyle,
                        width: '9%',
                        backgroundColor: '#ffff00', // Exact bright yellow from reference image
                        color: '#000000'
                      }}
                    >
                      Non Stamp( Not Billed)
                    </th>
                    <th
                      style={{
                        ...thStyle,
                        width: '9%',
                        backgroundColor: '#ffff00', // Exact bright yellow from reference image
                        color: '#000000'
                      }}
                    >
                      Challan Not Received
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {reportDays.map(d => (
                    <React.Fragment key={d.date}>
                      {/* NVL Row */}
                      <tr>
                        <td
                          rowSpan={3}
                          style={{
                            ...tdStyle,
                            textAlign: 'center',
                            verticalAlign: 'middle',
                            fontWeight: 800,
                            backgroundColor: '#f8fafc',
                            borderBottom: '2px solid #64748b'
                          }}
                        >
                          {d.date}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 800 }}>
                          NVL
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          {fmt(d.NVL.billedRevenue)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          {fmt(d.NVL.billedSubmitted)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          {fmt(d.NVL.paymentReceived)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          {fmt(d.NVL.revisedBilledRevenue)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          {fmt(d.NVL.stampNotBilled)}
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            textAlign: 'right',
                            backgroundColor: '#ffff00', // Yellow highlighted as in screenshot
                            color: '#000000'
                          }}
                        >
                          {fmt(d.NVL.nonStampNotBilled)}
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            textAlign: 'right',
                            backgroundColor: '#ffff00', // Yellow highlighted as in screenshot
                            color: '#000000'
                          }}
                        >
                          {fmt(d.NVL.challanNotReceived)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800 }}>
                          {fmt(d.NVL.total)}
                        </td>
                      </tr>

                      {/* NVCL Row */}
                      <tr>
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 800 }}>
                          NVCL
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          {fmt(d.NVCL.billedRevenue)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          {fmt(d.NVCL.billedSubmitted)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          {fmt(d.NVCL.paymentReceived)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          {fmt(d.NVCL.revisedBilledRevenue)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          {fmt(d.NVCL.stampNotBilled)}
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            textAlign: 'right',
                            backgroundColor: '#ffff00', // Yellow highlighted as in screenshot
                            color: '#000000'
                          }}
                        >
                          {fmt(d.NVCL.nonStampNotBilled)}
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            textAlign: 'right',
                            backgroundColor: '#ffff00', // Yellow highlighted as in screenshot
                            color: '#000000'
                          }}
                        >
                          {fmt(d.NVCL.challanNotReceived)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800 }}>
                          {fmt(d.NVCL.total)}
                        </td>
                      </tr>

                      {/* Day TOTAL Row */}
                      <tr style={{ backgroundColor: '#f1f5f9' }}>
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 900, borderBottom: '2px solid #64748b' }}>
                          TOTAL
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 900, borderBottom: '2px solid #64748b' }}>
                          {fmt(d.TOTAL.billedRevenue)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 900, borderBottom: '2px solid #64748b' }}>
                          {fmt(d.TOTAL.billedSubmitted)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 900, borderBottom: '2px solid #64748b' }}>
                          {fmt(d.TOTAL.paymentReceived)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 900, borderBottom: '2px solid #64748b' }}>
                          {fmt(d.TOTAL.revisedBilledRevenue)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 900, borderBottom: '2px solid #64748b' }}>
                          {fmt(d.TOTAL.stampNotBilled)}
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            textAlign: 'right',
                            fontWeight: 900,
                            backgroundColor: '#ffff00',
                            color: '#000000',
                            borderBottom: '2px solid #64748b'
                          }}
                        >
                          {fmt(d.TOTAL.nonStampNotBilled)}
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            textAlign: 'right',
                            fontWeight: 900,
                            backgroundColor: '#ffff00',
                            color: '#000000',
                            borderBottom: '2px solid #64748b'
                          }}
                        >
                          {fmt(d.TOTAL.challanNotReceived)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 900, borderBottom: '2px solid #64748b' }}>
                          {fmt(d.TOTAL.total)}
                        </td>
                      </tr>
                    </React.Fragment>
                  ))}

                  {/* ── Month Total Section at the bottom ── */}
                  {monthTotal && (
                    <>
                      <tr>
                        <td colSpan={10} style={{ backgroundColor: '#0f172a', height: '4px', padding: 0, border: 'none' }} />
                      </tr>

                      {/* Month Total NVL */}
                      <tr style={{ backgroundColor: '#f8fafc' }}>
                        <td
                          rowSpan={3}
                          style={{
                            ...tdStyle,
                            textAlign: 'center',
                            verticalAlign: 'middle',
                            fontWeight: 900,
                            backgroundColor: '#e2e8f0',
                            fontSize: '0.92rem',
                            borderBottom: '3px double #0f172a'
                          }}
                        >
                          MONTH TOTAL
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 800 }}>
                          NVL
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800 }}>
                          {fmt(monthTotal.NVL.billedRevenue)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 800 }}>
                          {fmt(monthTotal.NVL.billedSubmitted)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 800 }}>
                          {fmt(monthTotal.NVL.paymentReceived)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800 }}>
                          {fmt(monthTotal.NVL.revisedBilledRevenue)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 800 }}>
                          {fmt(monthTotal.NVL.stampNotBilled)}
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            textAlign: 'right',
                            fontWeight: 800,
                            backgroundColor: '#ffff00',
                            color: '#000000'
                          }}
                        >
                          {fmt(monthTotal.NVL.nonStampNotBilled)}
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            textAlign: 'right',
                            fontWeight: 800,
                            backgroundColor: '#ffff00',
                            color: '#000000'
                          }}
                        >
                          {fmt(monthTotal.NVL.challanNotReceived)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 900 }}>
                          {fmt(monthTotal.NVL.total)}
                        </td>
                      </tr>

                      {/* Month Total NVCL */}
                      <tr style={{ backgroundColor: '#f8fafc' }}>
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 800 }}>
                          NVCL
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800 }}>
                          {fmt(monthTotal.NVCL.billedRevenue)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 800 }}>
                          {fmt(monthTotal.NVCL.billedSubmitted)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 800 }}>
                          {fmt(monthTotal.NVCL.paymentReceived)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800 }}>
                          {fmt(monthTotal.NVCL.revisedBilledRevenue)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 800 }}>
                          {fmt(monthTotal.NVCL.stampNotBilled)}
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            textAlign: 'right',
                            fontWeight: 800,
                            backgroundColor: '#ffff00',
                            color: '#000000'
                          }}
                        >
                          {fmt(monthTotal.NVCL.nonStampNotBilled)}
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            textAlign: 'right',
                            fontWeight: 800,
                            backgroundColor: '#ffff00',
                            color: '#000000'
                          }}
                        >
                          {fmt(monthTotal.NVCL.challanNotReceived)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 900 }}>
                          {fmt(monthTotal.NVCL.total)}
                        </td>
                      </tr>

                      {/* Month Grand Total */}
                      <tr style={{ backgroundColor: '#e2e8f0' }}>
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 900, borderBottom: '3px double #0f172a' }}>
                          TOTAL
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 900, borderBottom: '3px double #0f172a' }}>
                          {fmt(monthTotal.TOTAL.billedRevenue)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 900, borderBottom: '3px double #0f172a' }}>
                          {fmt(monthTotal.TOTAL.billedSubmitted)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 900, borderBottom: '3px double #0f172a' }}>
                          {fmt(monthTotal.TOTAL.paymentReceived)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 900, borderBottom: '3px double #0f172a' }}>
                          {fmt(monthTotal.TOTAL.revisedBilledRevenue)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 900, borderBottom: '3px double #0f172a' }}>
                          {fmt(monthTotal.TOTAL.stampNotBilled)}
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            textAlign: 'right',
                            fontWeight: 900,
                            backgroundColor: '#ffff00',
                            color: '#000000',
                            borderBottom: '3px double #0f172a'
                          }}
                        >
                          {fmt(monthTotal.TOTAL.nonStampNotBilled)}
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            textAlign: 'right',
                            fontWeight: 900,
                            backgroundColor: '#ffff00',
                            color: '#000000',
                            borderBottom: '3px double #0f172a'
                          }}
                        >
                          {fmt(monthTotal.TOTAL.challanNotReceived)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 900, fontSize: '0.95rem', borderBottom: '3px double #0f172a' }}>
                          {fmt(monthTotal.TOTAL.total)}
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </Box>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
