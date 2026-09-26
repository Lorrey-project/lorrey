import React, { useState, useEffect, useCallback } from 'react';
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
  setFinancialYear: propSetFY
}) {
  const [financialYear, setInternalFY] = useState(initialFY);
  const activeFY = propSetFY ? initialFY : financialYear;
  const updateFY = (newFY) => {
    if (propSetFY) propSetFY(newFY);
    setInternalFY(newFY);
  };

  const [loading, setLoading] = useState(false);
  const [summaryData, setSummaryData] = useState({
    NVL: { site: 'NVL', billedRevenue: 0, stampNotBilled: 0, nonStampNotBilled: 0, challanNotReceived: 0, total: 0 },
    NVCL: { site: 'NVCL', billedRevenue: 0, stampNotBilled: 0, nonStampNotBilled: 0, challanNotReceived: 0, total: 0 },
    TOTAL: { site: 'TOTAL', billedRevenue: 0, stampNotBilled: 0, nonStampNotBilled: 0, challanNotReceived: 0, total: 0 }
  });
  const [selectedDateDisplay, setSelectedDateDisplay] = useState('01-04-2026 to Current');

  // Fetch consolidated FY summary data from backend
  const fetchRevenueReport = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/daily-summary/revenue-nvl-nvcl`, {
        params: {
          fy: activeFY
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
  }, [activeFY]);

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

  // Export to Excel replicating the exact table structure
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
      const exportFileName = `Summary_Revenue_NVL_NVCL_${activeFY.replace(/\s+/g, '_')}.xlsx`;
      XLSX.writeFile(wb, exportFileName);
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
    padding: '7px 10px',
    fontSize: '0.88rem',
    fontWeight: 700,
    color: '#000000',
    fontFamily: '"Calibri", "Segoe UI", Arial, sans-serif',
    whiteSpace: 'nowrap'
  };

  const nvl = summaryData.NVL || {};
  const nvcl = summaryData.NVCL || {};
  const total = summaryData.TOTAL || {};

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
              Live Billed & Unbilled Revenue Statement • {activeFY} ({selectedDateDisplay})
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
          {/* Financial Year Selector */}
          <FormControl size="small">
            <Select
              value={activeFY}
              onChange={(e) => updateFY(e.target.value)}
              sx={{
                bgcolor: 'background.default',
                borderRadius: '8px',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
                fontWeight: 700,
                minWidth: { xs: 100, md: 120 },
                fontSize: '0.82rem',
                py: 0
              }}
            >
              {FY_OPTIONS.map(fy => (
                <MenuItem key={fy} value={fy} sx={{ fontWeight: 600, fontSize: '0.82rem' }}>{fy}</MenuItem>
              ))}
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
              Calculating live consolidated financial year revenue statement...
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
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {fmt(nvl.stampNotBilled)}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: 'right',
                        backgroundColor: '#ffff00',
                        color: '#000000'
                      }}
                    >
                      {fmt(nvl.nonStampNotBilled)}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
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
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {fmt(nvcl.stampNotBilled)}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: 'right',
                        backgroundColor: '#ffff00',
                        color: '#000000'
                      }}
                    >
                      {fmt(nvcl.nonStampNotBilled)}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
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
                    <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 900, borderBottom: '3px double #0f172a' }}>
                      {fmt(total.stampNotBilled)}
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
                      {fmt(total.nonStampNotBilled)}
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
    </Box>
  );
}
