import React, { useState, useEffect, useMemo } from 'react';
import {
  Box, Typography, Button, IconButton, Select, MenuItem, TextField,
  CircularProgress, Paper, Tabs, Tab
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DownloadIcon from '@mui/icons-material/Download';
import PrintIcon from '@mui/icons-material/Print';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import axios from 'axios';
import { exportToCsv } from '../utils/exportCsv';

const API_URL = import.meta.env.VITE_API_URL;

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
];

const num = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};

const formatAmt = (val) => {
  return Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function TdsReportsPage({ onBack }) {
  const now = new Date();
  const currentFyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;

  // ── Tab State ─────────────────────────────────────────────────────────────
  const [mainTab, setMainTab] = useState('PARTY_TDS'); // 'PARTY_TDS' | 'BILLING_TDS'
  const [billingSubTab, setBillingSubTab] = useState('NVL'); // 'NVL' | 'NVCL'

  // ── Controls State ────────────────────────────────────────────────────────
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1); // 1-12 or 'ALL'
  const [selYear, setSelYear] = useState(`${currentFyStart}-${currentFyStart + 1}`);
  const [searchTerm, setSearchTerm] = useState('');

  const [records, setRecords] = useState([]);
  const [uniqueOwnerCount, setUniqueOwnerCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const yearOptions = useMemo(() => {
    const list = [];
    for (let y = currentFyStart - 2; y <= currentFyStart + 1; y++) {
      list.push(`${y}-${y + 1}`);
    }
    return list;
  }, [currentFyStart]);

  // Fetch Party TDS Report records from API (4 rows per unique owner, continuous SL NO)
  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.get(`${API_URL}/tds-reports/party-tds`, {
        params: { search: searchTerm },
        headers
      });

      if (res.data?.success) {
        setRecords(res.data.entries || []);
        setUniqueOwnerCount(res.data.uniqueOwnerCount || 0);
      }
    } catch (err) {
      console.error('[TdsReports] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── BILLING TDS Data Fetching ─────────────────────────────────────────────
  const [billingRecords, setBillingRecords] = useState([]);
  const [billingSummary, setBillingSummary] = useState({ totalBasicFreight: 0, totalTdsAmount: 0 });
  const [billingLoading, setBillingLoading] = useState(false);

  const fetchBillingTdsData = async () => {
    setBillingLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.get(`${API_URL}/tds-reports/billing-tds`, {
        params: {
          site: billingSubTab,
          month: selMonth,
          year: selYear,
          search: searchTerm
        },
        headers
      });

      if (res.data?.success) {
        setBillingRecords(res.data.entries || []);
        setBillingSummary(res.data.summary || { totalBasicFreight: 0, totalTdsAmount: 0 });
      }
    } catch (err) {
      console.error('[TdsReports] Billing TDS fetch error:', err);
    } finally {
      setBillingLoading(false);
    }
  };

  useEffect(() => {
    if (mainTab === 'PARTY_TDS') {
      fetchData();
    } else if (mainTab === 'BILLING_TDS') {
      fetchBillingTdsData();
    }
  }, [mainTab, billingSubTab, selMonth, selYear, searchTerm]);

  // Ensure continuous SL NO if filtered locally
  const filteredRecords = useMemo(() => {
    let result = records;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      result = result.filter(r =>
        (r.name || '').toLowerCase().includes(term) ||
        (r.panCardNumber || '').toLowerCase().includes(term) ||
        (r.aadharNo || '').toLowerCase().includes(term)
      );
    }
    return result.map((r, idx) => ({
      ...r,
      slNo: idx + 1
    }));
  }, [records, searchTerm]);

  // Dynamic Month/Year Header text
  const monthHeaderText = useMemo(() => {
    if (selMonth === 'ALL') {
      return `ALL MONTHS (${selYear})`;
    }
    const monthName = MONTH_NAMES[parseInt(selMonth, 10) - 1] || 'JUNE';
    const calYear = parseInt(selMonth, 10) >= 4 ? (selYear.split('-')[0] || '2025') : (selYear.split('-')[1] || '2026');
    return `${monthName} ${calYear}`;
  }, [selMonth, selYear]);

  // Export CSV Party TDS
  const handleExportCsv = () => {
    const exportData = filteredRecords.map(r => ({
      'SL NO': r.slNo,
      'Name': r.name,
      'Bill No.': r.billNo,
      'Bill date': r.billDate,
      'Bill type': r.billType,
      'Basic Amount (Rs)': r.basicAmount,
      'TDS (%)': `${r.tdsPercent}%`,
      'TDS Amount (Rs)': r.tdsAmount,
      'TDS Deducted (Rs)': r.tdsDeducted,
      'PAN CARD NUMBER': r.panCardNumber,
      'AADHAR NO': r.aadharNo,
      'AADHAAR - PAN LINKED': r.aadhaarPanLinked || (r.panCardNumber !== '-' && r.aadharNo !== '-' ? 'YES' : 'NO')
    }));
    exportToCsv(`PARTY_TDS_REPORT_${selYear}.csv`, exportData);
  };

  // Export CSV Billing TDS
  const handleExportBillingCsv = () => {
    const exportData = billingRecords.map(r => ({
      'SL NO': r.slNo,
      'SITE': r.site,
      'BILL NO': r.billNo,
      'BILL DATE': r.billDate,
      'BILL TYPE': r.billType,
      'PARTY NAME': r.partyName,
      'VEHICLE NO': r.vehicleNo,
      'BASIC FREIGHT (Rs)': r.basicFreight,
      'TDS RATE (%)': `${r.tdsPercent}%`,
      'TDS AMOUNT (Rs)': r.tdsAmount
    }));
    exportToCsv(`BILLING_TDS_${billingSubTab}_REPORT_${selYear}.csv`, exportData);
  };

  // Print Report
  const handlePrint = () => {
    window.print();
  };

  const thStyle = {
    backgroundColor: '#0f172a',
    color: '#ffffff',
    padding: '10px 8px',
    border: '1px solid #334155',
    fontSize: '11px',
    fontWeight: 800,
    textTransform: 'uppercase',
    textAlign: 'center',
    whiteSpace: 'nowrap'
  };

  const tdStyle = {
    padding: '8px 10px',
    border: '1px solid #cbd5e1',
    fontSize: '12px',
    color: '#0f172a',
    backgroundColor: 'transparent'
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0f172a', color: '#f8fafc', p: { xs: 2, md: 4 }, boxSizing: 'border-box' }}>

      {/* Print Specific CSS */}
      <style>{`
        @media print {
          body { background-color: #ffffff !important; color: #000000 !important; }
          .no-print { display: none !important; }
          .print-only-bg { background-color: #ffffff !important; color: #000000 !important; border: none !important; box-shadow: none !important; p: 0 !important; }
          table { width: 100% !important; border-collapse: collapse !important; color: #000000 !important; }
          th { background-color: #f1f5f9 !important; color: #000000 !important; border: 1px solid #000000 !important; font-size: 10pt !important; }
          td { background-color: #ffffff !important; color: #000000 !important; border: 1px solid #000000 !important; font-size: 9pt !important; }
        }
      `}</style>

      {/* ── Top Bar / Header ─────────────────────────────────────────── */}
      <Box className="no-print" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton onClick={onBack} sx={{ color: '#f8fafc', bgcolor: 'rgba(255,255,255,0.1)', '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' } }}>
            <ArrowBackIcon />
          </IconButton>
          <Box>
            <Typography variant="h5" fontWeight="900" sx={{ letterSpacing: '-0.5px', color: '#f8fafc' }}>
              TDS REPORTS
            </Typography>
            <Typography variant="caption" color="#94a3b8" fontWeight="600">
              Tax Deducted at Source — Accounting Ledger &amp; Deductions Statement
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* ── Level 1 Main Tabs: [ PARTY TDS ] [ BILLING TDS ] ───────────────── */}
      <Box className="no-print" sx={{ borderBottom: 1, borderColor: '#334155', mb: 3 }}>
        <Tabs
          value={mainTab}
          onChange={(_, val) => setMainTab(val)}
          sx={{
            '& .MuiTab-root': {
              fontWeight: 800,
              fontSize: '14px',
              color: '#94a3b8',
              textTransform: 'none',
              px: 3,
              py: 1.5,
              minHeight: 48,
            },
            '& .Mui-selected': {
              color: '#38bdf8 !important',
            },
            '& .MuiTabs-indicator': {
              backgroundColor: '#38bdf8',
              height: 3,
              borderRadius: '3px 3px 0 0',
            },
          }}
        >
          <Tab value="PARTY_TDS" label="PARTY TDS" />
          <Tab value="BILLING_TDS" label="BILLING TDS" />
        </Tabs>
      </Box>

      {/* ── Level 2 Sub-Tabs (When BILLING TDS selected): [ NVL ] [ NVCL ] ── */}
      {mainTab === 'BILLING_TDS' && (
        <Box className="no-print" sx={{ mb: 3, display: 'flex', gap: 1.5 }}>
          <Button
            variant={billingSubTab === 'NVL' ? 'contained' : 'outlined'}
            onClick={() => setBillingSubTab('NVL')}
            sx={{
              fontWeight: 800,
              fontSize: '13px',
              borderRadius: '8px',
              px: 3,
              py: 1,
              textTransform: 'none',
              bgcolor: billingSubTab === 'NVL' ? '#0284c7' : 'transparent',
              borderColor: '#475569',
              color: billingSubTab === 'NVL' ? '#ffffff' : '#cbd5e1',
              '&:hover': {
                bgcolor: billingSubTab === 'NVL' ? '#0369a1' : 'rgba(255,255,255,0.05)',
                borderColor: '#64748b',
              },
            }}
          >
            NVL
          </Button>
          <Button
            variant={billingSubTab === 'NVCL' ? 'contained' : 'outlined'}
            onClick={() => setBillingSubTab('NVCL')}
            sx={{
              fontWeight: 800,
              fontSize: '13px',
              borderRadius: '8px',
              px: 3,
              py: 1,
              textTransform: 'none',
              bgcolor: billingSubTab === 'NVCL' ? '#0284c7' : 'transparent',
              borderColor: '#475569',
              color: billingSubTab === 'NVCL' ? '#ffffff' : '#cbd5e1',
              '&:hover': {
                bgcolor: billingSubTab === 'NVCL' ? '#0369a1' : 'rgba(255,255,255,0.05)',
                borderColor: '#64748b',
              },
            }}
          >
            NVCL
          </Button>
        </Box>
      )}

      {/* ── 1. PARTY TDS TAB CONTENT ────────────────────────────────────── */}
      {mainTab === 'PARTY_TDS' && (
        <>
          {/* Controls Bar */}
          <Box className="no-print" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" fontWeight="700" color="#38bdf8">
                UNIQUE OWNERS: {uniqueOwnerCount}
              </Typography>
              <Typography variant="body2" color="#94a3b8" fontWeight="600" sx={{ ml: 1 }}>
                ({filteredRecords.length} TOTAL PARTY TDS ROWS)
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              {/* Search Box */}
              <TextField
                size="small"
                placeholder="Search Owner Name, PAN, Aadhaar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: <SearchIcon sx={{ color: '#94a3b8', mr: 0.5, fontSize: 18 }} />
                }}
                sx={{
                  width: 260,
                  bgcolor: '#1e293b',
                  borderRadius: 1,
                  input: { color: '#fff', fontSize: '13px' },
                  '.MuiOutlinedInput-notchedOutline': { borderColor: '#475569' }
                }}
              />

              <IconButton onClick={fetchData} sx={{ color: '#f8fafc', bgcolor: '#1e293b', '&:hover': { bgcolor: '#334155' } }}>
                <RefreshIcon />
              </IconButton>

              <Button
                variant="contained"
                startIcon={<DownloadIcon />}
                onClick={handleExportCsv}
                sx={{ height: 36, px: 2, fontWeight: 700, bgcolor: '#0284c7', '&:hover': { bgcolor: '#0369a1' } }}
              >
                Export CSV
              </Button>

              <Button
                variant="contained"
                startIcon={<PrintIcon />}
                onClick={handlePrint}
                sx={{ height: 36, px: 2, fontWeight: 700, bgcolor: '#059669', '&:hover': { bgcolor: '#047857' } }}
              >
                Print / PDF
              </Button>
            </Box>
          </Box>

          {/* Main Report Sheet Container */}
          <Paper
            className="print-only-bg"
            elevation={4}
            sx={{
              p: { xs: 2, md: 4 },
              bgcolor: '#ffffff',
              color: '#0f172a',
              borderRadius: 2,
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
              overflow: 'hidden'
            }}
          >
            {/* Header */}
            <Box sx={{ textAlign: 'center', mb: 3 }}>
              <Typography variant="h4" fontWeight="900" sx={{ letterSpacing: '1px', color: '#0f172a', textTransform: 'uppercase' }}>
                DIPALI ASSOCIATES &amp; CO.
              </Typography>
              <Typography variant="h6" fontWeight="800" sx={{ letterSpacing: '0.5px', color: '#334155', mt: 0.5 }}>
                PARTY TDS REPORT
              </Typography>
              <Typography variant="subtitle1" fontWeight="700" sx={{ color: '#475569', mt: 0.5, fontStyle: 'italic' }}>
                {uniqueOwnerCount} UNIQUE OWNERS — 4 ROWS PER OWNER ({filteredRecords.length} TOTAL ROWS)
              </Typography>
            </Box>

            {/* Table */}
            <Box sx={{ overflowX: 'auto', position: 'relative', minHeight: 350 }}>
              {loading && (
                <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(255,255,255,0.7)', zIndex: 20 }}>
                  <CircularProgress color="primary" />
                </Box>
              )}

              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Inter, system-ui, sans-serif' }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: '55px' }}>SL NO</th>
                    <th style={{ ...thStyle, textAlign: 'left', minWidth: '180px' }}>Name</th>
                    <th style={{ ...thStyle, textAlign: 'left', minWidth: '140px' }}>Bill No.</th>
                    <th style={{ ...thStyle, minWidth: '110px' }}>Bill date</th>
                    <th style={{ ...thStyle, minWidth: '100px' }}>Bill type</th>
                    <th style={{ ...thStyle, textAlign: 'right', minWidth: '130px' }}>Basic Amount</th>
                    <th style={{ ...thStyle, width: '80px' }}>TDS (%)</th>
                    <th style={{ ...thStyle, textAlign: 'right', minWidth: '130px' }}>TDS Amount</th>
                    <th style={{ ...thStyle, textAlign: 'right', minWidth: '130px' }}>TDS Deducted</th>
                    <th style={{ ...thStyle, minWidth: '150px' }}>PAN CARD NUMBER</th>
                    <th style={{ ...thStyle, minWidth: '150px' }}>AADHAR NO</th>
                    <th style={{ ...thStyle, minWidth: '170px' }}>AADHAAR - PAN LINKED</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.length === 0 && !loading && (
                    <tr>
                      <td colSpan={12} style={{ textAlign: 'center', padding: '48px', color: '#64748b', fontWeight: 600 }}>
                        No owners found in MongoDB Owner Details database.
                      </td>
                    </tr>
                  )}

                  {filteredRecords.map((r, index) => {
                    const ownerGroupIndex = Math.floor(index / 4);
                    const isGroupEnd = (index + 1) % 4 === 0;
                    const rowBg = ownerGroupIndex % 2 === 0 ? '#ffffff' : '#f8fafc';

                    return (
                      <tr
                        key={index}
                        style={{
                          backgroundColor: rowBg,
                          borderBottom: isGroupEnd ? '2px solid #94a3b8' : '1px solid #e2e8f0'
                        }}
                      >
                        {/* 1. SL NO (Continuous 1..N*4) */}
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 800, color: '#475569' }}>
                          {r.slNo}
                        </td>

                        {/* 2. Name (Owner Name) */}
                        <td style={{ ...tdStyle, fontWeight: 700, color: '#0f172a' }}>
                          {r.name}
                        </td>

                        {/* 3. Bill No. */}
                        <td style={{ ...tdStyle, fontWeight: 600, color: '#334155' }}>
                          {r.billNo}
                        </td>

                        {/* 4. Bill date */}
                        <td style={{ ...tdStyle, textAlign: 'center', color: '#334155' }}>
                          {r.billDate}
                        </td>

                        {/* 5. Bill type */}
                        <td style={{ ...tdStyle, textAlign: 'center', color: '#475569', fontWeight: 600 }}>
                          {r.billType}
                        </td>

                        {/* 6. Basic Amount */}
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                          ₹{formatAmt(r.basicAmount)}
                        </td>

                        {/* 7. TDS (%) */}
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, color: '#0284c7' }}>
                          {r.tdsPercent}%
                        </td>

                        {/* 8. TDS Amount */}
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#b45309' }}>
                          ₹{formatAmt(r.tdsAmount)}
                        </td>

                        {/* 9. TDS Deducted */}
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: '#047857' }}>
                          ₹{formatAmt(r.tdsDeducted)}
                        </td>

                        {/* 10. PAN CARD NUMBER */}
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, letterSpacing: '0.5px', color: '#1e293b' }}>
                          {r.panCardNumber}
                        </td>

                        {/* 11. AADHAR NO */}
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600, color: '#475569' }}>
                          {r.aadharNo}
                        </td>

                        {/* 12. AADHAAR - PAN LINKED */}
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 800, color: (r.aadhaarPanLinked === 'YES' || r.aadhaarPanLinked === 'Yes') ? '#15803d' : '#b91c1c' }}>
                          {r.aadhaarPanLinked}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Box>
          </Paper>
        </>
      )}

      {/* ── 2. BILLING TDS TAB CONTENT (NVL & NVCL) ────────────────────── */}
      {mainTab === 'BILLING_TDS' && (
        <>
          {/* Controls Bar for Billing TDS */}
          <Box className="no-print" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              {/* Month Selector */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" color="#94a3b8" fontWeight="700">Month:</Typography>
                <Select
                  size="small"
                  value={selMonth}
                  onChange={(e) => setSelMonth(e.target.value)}
                  sx={{
                    bgcolor: '#1e293b',
                    color: '#fff',
                    fontWeight: 700,
                    borderRadius: 1,
                    '.MuiOutlinedInput-notchedOutline': { borderColor: '#475569' },
                    '.MuiSvgIcon-root': { color: '#fff' }
                  }}
                >
                  <MenuItem value="ALL">ALL MONTHS</MenuItem>
                  {MONTH_NAMES.map((m, idx) => (
                    <MenuItem key={idx} value={idx + 1}>{m}</MenuItem>
                  ))}
                </Select>
              </Box>

              {/* FY Year Selector */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" color="#94a3b8" fontWeight="700">Financial Year:</Typography>
                <Select
                  size="small"
                  value={selYear}
                  onChange={(e) => setSelYear(e.target.value)}
                  sx={{
                    bgcolor: '#1e293b',
                    color: '#fff',
                    fontWeight: 700,
                    borderRadius: 1,
                    '.MuiOutlinedInput-notchedOutline': { borderColor: '#475569' },
                    '.MuiSvgIcon-root': { color: '#fff' }
                  }}
                >
                  {yearOptions.map((y) => (
                    <MenuItem key={y} value={y}>{y}</MenuItem>
                  ))}
                </Select>
              </Box>

              <Typography variant="body2" fontWeight="700" color="#38bdf8" sx={{ ml: 1 }}>
                RECORDS: {billingRecords.length}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              {/* Search Box */}
              <TextField
                size="small"
                placeholder="Search Bill No, Party, Vehicle..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: <SearchIcon sx={{ color: '#94a3b8', mr: 0.5, fontSize: 18 }} />
                }}
                sx={{
                  width: 250,
                  bgcolor: '#1e293b',
                  borderRadius: 1,
                  input: { color: '#fff', fontSize: '13px' },
                  '.MuiOutlinedInput-notchedOutline': { borderColor: '#475569' }
                }}
              />

              <IconButton onClick={fetchBillingTdsData} sx={{ color: '#f8fafc', bgcolor: '#1e293b', '&:hover': { bgcolor: '#334155' } }}>
                <RefreshIcon />
              </IconButton>

              <Button
                variant="contained"
                startIcon={<DownloadIcon />}
                onClick={handleExportBillingCsv}
                sx={{ height: 36, px: 2, fontWeight: 700, bgcolor: '#0284c7', '&:hover': { bgcolor: '#0369a1' } }}
              >
                Export CSV
              </Button>

              <Button
                variant="contained"
                startIcon={<PrintIcon />}
                onClick={handlePrint}
                sx={{ height: 36, px: 2, fontWeight: 700, bgcolor: '#059669', '&:hover': { bgcolor: '#047857' } }}
              >
                Print / PDF
              </Button>
            </Box>
          </Box>

          {/* Main Report Sheet Container */}
          <Paper
            className="print-only-bg"
            elevation={4}
            sx={{
              p: { xs: 2, md: 4 },
              bgcolor: '#ffffff',
              color: '#0f172a',
              borderRadius: 2,
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
              overflow: 'hidden'
            }}
          >
            {/* Header */}
            <Box sx={{ textAlign: 'center', mb: 3 }}>
              <Typography variant="h4" fontWeight="900" sx={{ letterSpacing: '1px', color: '#0f172a', textTransform: 'uppercase' }}>
                DIPALI ASSOCIATES &amp; CO.
              </Typography>
              <Typography variant="h6" fontWeight="800" sx={{ letterSpacing: '0.5px', color: '#0284c7', mt: 0.5 }}>
                BILLING TDS REPORT — {billingSubTab}
              </Typography>
              <Typography variant="subtitle1" fontWeight="700" sx={{ color: '#475569', mt: 0.5, fontStyle: 'italic' }}>
                {billingSubTab === 'NVL' ? 'NUVOCO VISTAS LIMITED (NVL)' : 'NUVOCO VISTAS CORPORATION LIMITED (NVCL)'} — {monthHeaderText}
              </Typography>
              {billingSubTab === 'NVL' && (
                <Typography variant="caption" fontWeight="700" sx={{ color: '#d97706', display: 'block', mt: 0.5 }}>
                  * NOTE: NVL Toll Bills are exempted from TDS (TDS = ₹0.00) as per regulation rules.
                </Typography>
              )}
            </Box>

            {/* Table */}
            <Box sx={{ overflowX: 'auto', position: 'relative', minHeight: 350 }}>
              {billingLoading && (
                <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(255,255,255,0.7)', zIndex: 20 }}>
                  <CircularProgress color="primary" />
                </Box>
              )}

              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Inter, system-ui, sans-serif' }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: '55px' }}>SL NO</th>
                    <th style={{ ...thStyle, width: '75px' }}>SITE</th>
                    <th style={{ ...thStyle, textAlign: 'left', minWidth: '140px' }}>BILL NO.</th>
                    <th style={{ ...thStyle, minWidth: '110px' }}>BILL DATE</th>
                    <th style={{ ...thStyle, minWidth: '110px' }}>BILL TYPE</th>
                    <th style={{ ...thStyle, textAlign: 'left', minWidth: '200px' }}>PARTY NAME</th>
                    <th style={{ ...thStyle, minWidth: '140px' }}>VEHICLE NO</th>
                    <th style={{ ...thStyle, textAlign: 'right', minWidth: '140px' }}>BASIC FREIGHT</th>
                    <th style={{ ...thStyle, width: '90px' }}>TDS (%)</th>
                    <th style={{ ...thStyle, textAlign: 'right', minWidth: '140px' }}>TDS AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  {billingRecords.length === 0 && !billingLoading && (
                    <tr>
                      <td colSpan={10} style={{ textAlign: 'center', padding: '48px', color: '#64748b', fontWeight: 600 }}>
                        No billing records found for {billingSubTab} in the selected period.
                      </td>
                    </tr>
                  )}

                  {billingRecords.map((r, index) => {
                    const isEven = index % 2 === 0;
                    const isToll = billingSubTab === 'NVL' && r.billType.toUpperCase().includes('TOLL');

                    return (
                      <tr
                        key={index}
                        style={{
                          backgroundColor: isEven ? '#ffffff' : '#f8fafc',
                          borderBottom: '1px solid #e2e8f0'
                        }}
                      >
                        {/* 1. SL NO */}
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 800, color: '#475569' }}>
                          {r.slNo}
                        </td>

                        {/* 2. SITE */}
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 800, color: '#0284c7' }}>
                          {r.site}
                        </td>

                        {/* 3. BILL NO */}
                        <td style={{ ...tdStyle, fontWeight: 700, color: '#0f172a' }}>
                          {r.billNo}
                        </td>

                        {/* 4. BILL DATE */}
                        <td style={{ ...tdStyle, textAlign: 'center', color: '#334155' }}>
                          {r.billDate}
                        </td>

                        {/* 5. BILL TYPE */}
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600, color: isToll ? '#d97706' : '#475569' }}>
                          {r.billType}
                        </td>

                        {/* 6. PARTY NAME */}
                        <td style={{ ...tdStyle, fontWeight: 700, color: '#0f172a' }}>
                          {r.partyName}
                        </td>

                        {/* 7. VEHICLE NO */}
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, color: '#1e293b' }}>
                          {r.vehicleNo}
                        </td>

                        {/* 8. BASIC FREIGHT */}
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                          ₹{formatAmt(r.basicFreight)}
                        </td>

                        {/* 9. TDS RATE */}
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 800, color: isToll ? '#64748b' : '#0284c7' }}>
                          {r.tdsPercent}%
                        </td>

                        {/* 10. TDS AMOUNT */}
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: isToll ? '#64748b' : '#047857' }}>
                          ₹{formatAmt(r.tdsAmount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                {/* Summary Row */}
                {billingRecords.length > 0 && (
                  <tfoot>
                    <tr style={{ backgroundColor: '#f1f5f9', borderTop: '2px solid #0f172a' }}>
                      <td colSpan={7} style={{ ...tdStyle, textAlign: 'right', fontWeight: 900, color: '#0f172a', fontSize: '13px', textTransform: 'uppercase' }}>
                        TOTAL ({billingRecords.length} BILLS):
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 900, color: '#0f172a', fontSize: '13px' }}>
                        ₹{formatAmt(billingSummary.totalBasicFreight)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 900, color: '#0284c7', fontSize: '13px' }}>
                        -
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 900, color: '#047857', fontSize: '13px' }}>
                        ₹{formatAmt(billingSummary.totalTdsAmount)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </Box>
          </Paper>
        </>
      )}

    </Box>
  );
}
