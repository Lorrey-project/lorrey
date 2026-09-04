import React, { useState, useEffect, useMemo } from 'react';
import {
  Box, Typography, Button, IconButton, Select, MenuItem, TextField,
  CircularProgress, Paper
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
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1); // 1-12 or 'ALL'
  const [selYear, setSelYear] = useState(`${currentFyStart}-${currentFyStart + 1}`);
  const [searchTerm, setSearchTerm] = useState('');

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState({ totalBasicAmount: 0, totalTdsAmount: 0, totalTdsDeducted: 0 });

  const yearOptions = useMemo(() => {
    const list = [];
    for (let y = currentFyStart - 2; y <= currentFyStart + 1; y++) {
      list.push(`${y}-${y + 1}`);
    }
    return list;
  }, [currentFyStart]);

  // Fetch TDS Report records from API
  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.get(`${API_URL}/tds-reports`, {
        params: { month: selMonth, year: selYear, search: searchTerm },
        headers
      });

      if (res.data?.success) {
        setRecords(res.data.entries || []);
        if (res.data.summary) {
          setSummary(res.data.summary);
        }
      }
    } catch (err) {
      console.error('[TdsReports] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selMonth, selYear, searchTerm]);

  // Filter records locally if needed and assign sequential SL NO
  const filteredRecords = useMemo(() => {
    let result = records;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      result = result.filter(r =>
        (r.name || '').toLowerCase().includes(term) ||
        (r.billNo || '').toLowerCase().includes(term) ||
        (r.billType || '').toLowerCase().includes(term) ||
        (r.panCardNumber || '').toLowerCase().includes(term) ||
        (r.aadharNo || '').toLowerCase().includes(term)
      );
    }
    return result.map((r, idx) => ({
      ...r,
      slNo: idx + 1
    }));
  }, [records, searchTerm]);

  // Calculate dynamic totals from filtered records
  const dynamicTotals = useMemo(() => {
    let totalBasic = 0;
    let totalTdsAmt = 0;
    let totalTdsDed = 0;

    filteredRecords.forEach(r => {
      totalBasic += num(r.basicAmount);
      totalTdsAmt += num(r.tdsAmount);
      totalTdsDed += num(r.tdsDeducted);
    });

    return {
      totalBasicAmount: Math.round(totalBasic * 100) / 100,
      totalTdsAmount: Math.round(totalTdsAmt * 100) / 100,
      totalTdsDeducted: Math.round(totalTdsDed * 100) / 100
    };
  }, [filteredRecords]);

  // Dynamic Month/Year Header text
  const monthHeaderText = useMemo(() => {
    if (selMonth === 'ALL') {
      return `Month Of ALL MONTHS ${selYear}`;
    }
    const monthName = MONTH_NAMES[parseInt(selMonth, 10) - 1] || 'JUNE';
    const calYear = parseInt(selMonth, 10) >= 4 ? (selYear.split('-')[0] || '2025') : (selYear.split('-')[1] || '2026');
    return `Month Of ${monthName} ${calYear}`;
  }, [selMonth, selYear]);

  // Export CSV
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
    exportToCsv(`TDS_REPORT_${selMonth}_${selYear}.csv`, exportData);
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
    backgroundColor: '#ffffff'
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

      {/* ── Controls Bar (No Print) ────────────────────────────────────────── */}
      <Box className="no-print" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
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

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          {/* Month Selector */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" fontWeight="700" color="#cbd5e1">Month:</Typography>
            <Select
              size="small"
              value={selMonth}
              onChange={(e) => setSelMonth(e.target.value)}
              sx={{ minWidth: 140, height: 36, bgcolor: '#1e293b', color: '#fff', fontSize: '13px', fontWeight: 700, '.MuiOutlinedInput-notchedOutline': { borderColor: '#475569' } }}
            >
              <MenuItem value="ALL">ALL MONTHS</MenuItem>
              {MONTH_NAMES.map((m, idx) => (
                <MenuItem key={m} value={idx + 1}>{m}</MenuItem>
              ))}
            </Select>
          </Box>

          {/* Financial Year Selector */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" fontWeight="700" color="#cbd5e1">FY:</Typography>
            <Select
              size="small"
              value={selYear}
              onChange={(e) => setSelYear(e.target.value)}
              sx={{ minWidth: 130, height: 36, bgcolor: '#1e293b', color: '#fff', fontSize: '13px', fontWeight: 700, '.MuiOutlinedInput-notchedOutline': { borderColor: '#475569' } }}
            >
              {yearOptions.map(y => (
                <MenuItem key={y} value={y}>{y}</MenuItem>
              ))}
            </Select>
          </Box>

          {/* Search Box */}
          <TextField
            size="small"
            placeholder="Search Name, Bill No, PAN..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: <SearchIcon sx={{ color: '#94a3b8', mr: 0.5, fontSize: 18 }} />
            }}
            sx={{
              width: 240,
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

      {/* ── Main Report Sheet Container ───────────────────────────────────── */}
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
        {/* ── 1. Centered Official Header ──────────────────────────────────── */}
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Typography variant="h4" fontWeight="900" sx={{ letterSpacing: '1px', color: '#0f172a', textTransform: 'uppercase' }}>
            DIPALI ASSOCIATES &amp; CO.
          </Typography>
          <Typography variant="h6" fontWeight="800" sx={{ letterSpacing: '0.5px', color: '#334155', mt: 0.5 }}>
            TDS REPORT
          </Typography>
          <Typography variant="subtitle1" fontWeight="700" sx={{ color: '#475569', mt: 0.5, fontStyle: 'italic' }}>
            {monthHeaderText}
          </Typography>
        </Box>

        {/* ── 2. Report Table Container ──────────────────────────────────── */}
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
                    No TDS records found for the selected period.
                  </td>
                </tr>
              )}

              {filteredRecords.map((r, index) => (
                <tr key={index} style={{ backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                  {/* 1. SL NO */}
                  <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 800, color: '#475569' }}>
                    {r.slNo}
                  </td>

                  {/* 2. Name */}
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
                    {r.aadhaarPanLinked || (r.panCardNumber !== '-' && r.aadharNo !== '-' ? 'YES' : 'NO')}
                  </td>
                </tr>
              ))}

              {/* ── 3. Total Summary Row ──────────────────────────────────── */}
              {filteredRecords.length > 0 && (
                <tr style={{ backgroundColor: '#f1f5f9', fontWeight: 900 }}>
                  <td colSpan={5} style={{ ...tdStyle, textAlign: 'right', paddingRight: '16px', fontSize: '13px', color: '#0f172a', backgroundColor: '#e2e8f0' }}>
                    TOTAL
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', paddingRight: '10px', fontSize: '13px', color: '#0f172a', backgroundColor: '#fef3c7' }}>
                    ₹{formatAmt(dynamicTotals.totalBasicAmount)}
                  </td>
                  <td style={{ ...tdStyle, backgroundColor: '#e2e8f0' }}></td>
                  <td style={{ ...tdStyle, textAlign: 'right', paddingRight: '10px', fontSize: '13px', color: '#b45309', backgroundColor: '#fef3c7' }}>
                    ₹{formatAmt(dynamicTotals.totalTdsAmount)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', paddingRight: '10px', fontSize: '13px', color: '#047857', backgroundColor: '#d1fae5' }}>
                    ₹{formatAmt(dynamicTotals.totalTdsDeducted)}
                  </td>
                  <td colSpan={3} style={{ ...tdStyle, backgroundColor: '#e2e8f0' }}></td>
                </tr>
              )}
            </tbody>
          </table>
        </Box>
      </Paper>
    </Box>
  );
}
