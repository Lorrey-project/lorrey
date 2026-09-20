import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Box, Typography, Button, IconButton, Select, MenuItem, TextField,
  CircularProgress, Paper, Chip, TableContainer, Table, TableHead,
  TableRow, TableCell, TableBody, Snackbar, Alert, Tooltip, InputAdornment
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import SearchIcon from '@mui/icons-material/Search';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import SaveIcon from '@mui/icons-material/Save';
import axios from 'axios';
import { io } from 'socket.io-client';
import { exportToCsv } from '../utils/exportCsv';
import { useTableNavigation } from '../hooks/useTableNavigation';

const API_URL = import.meta.env.VITE_API_URL;
const SOCKET_URL = import.meta.env.VITE_SOCKET_IO_URL || import.meta.env.VITE_API_URL;

const MONTH_LIST = [
  { value: 1, name: 'January' },
  { value: 2, name: 'February' },
  { value: 3, name: 'March' },
  { value: 4, name: 'April' },
  { value: 5, name: 'May' },
  { value: 6, name: 'June' },
  { value: 7, name: 'July' },
  { value: 8, name: 'August' },
  { value: 9, name: 'September' },
  { value: 10, name: 'October' },
  { value: 11, name: 'November' },
  { value: 12, name: 'December' }
];

const num = (val) => {
  if (val === null || val === undefined || val === '') return 0;
  const n = parseFloat(String(val).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};

const formatAmt = (val) => {
  return Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatDateForInput = (val) => {
  if (!val || val === '-' || val === 'null' || val === 'undefined') return '';
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const m = str.match(/^(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{2,4})$/);
  if (m) {
    const d = m[1].padStart(2, '0');
    const mo = m[2].padStart(2, '0');
    let y = m[3];
    if (y.length === 2) y = '20' + y;
    return `${y}-${mo}-${d}`;
  }
  return '';
};

export default function RoadTaxRegisterSection({
  creditorName = 'BRINDA SHYAM',
  panelTitle = 'BRINDA SHYAM PANEL'
}) {
  const now = new Date();
  const currentMonthNum = now.getMonth() + 1; // 1-12
  const currentYearNum = now.getFullYear();

  // Previous month calculation
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthNum = prevDate.getMonth() + 1;
  const prevYearNum = prevDate.getFullYear();

  // Controls State
  const [selYear, setSelYear] = useState(currentYearNum);
  const [selMonth, setSelMonth] = useState(currentMonthNum);
  const [searchTerm, setSearchTerm] = useState('');

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadingIndex, setUploadingIndex] = useState(null);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState(null);

  const tableContainerRef = useRef(null);
  useTableNavigation(tableContainerRef);

  const yearOptions = useMemo(() => {
    const list = [];
    for (let y = currentYearNum - 2; y <= currentYearNum + 2; y++) {
      list.push(y);
    }
    return list;
  }, [currentYearNum]);

  // Dynamic names for current and previous month labels
  const currentMonthName = MONTH_LIST.find(m => m.value === currentMonthNum)?.name || 'Current Month';
  const prevMonthName = MONTH_LIST.find(m => m.value === prevMonthNum)?.name || 'Previous Month';

  // Fetch Vehicle Validity records
  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.get(`${API_URL}/road-tax`, {
        params: {
          month: selMonth,
          year: selYear,
          search: searchTerm,
          creditor: creditorName
        },
        headers
      });

      if (res.data?.success) {
        setRows(res.data.entries || []);
      }
    } catch (err) {
      console.error('[VehicleValidity] Fetch error:', err);
      setSnack({ severity: 'error', msg: 'Failed to load Vehicle Validity records.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selMonth, selYear, searchTerm, creditorName]);

  // Real-time live synchronization on bank book creditor sync
  useEffect(() => {
    let socket;
    try {
      socket = io(SOCKET_URL, { transports: ["websocket", "polling"] });
      socket.on('roadTaxUpdate', () => {
        fetchData();
      });
      socket.on('cementUpdates', () => {
        fetchData();
      });
    } catch (e) {
      console.warn('Socket connection error in RoadTaxRegisterSection:', e);
    }
    return () => {
      if (socket) {
        socket.off('roadTaxUpdate');
        socket.off('cementUpdates');
        socket.disconnect();
      }
    };
  }, [selMonth, selYear, creditorName]);

  // Handle local cell edit and trigger auto-save
  const handleCellChange = (index, field, value) => {
    setRows(prev => {
      const copy = [...prev];
      const updatedRow = { ...copy[index], [field]: value };

      // Recalculate balance automatically (never negative)
      const rec = num(updatedRow.receivableAmount);
      const paid = num(updatedRow.paidAmount);
      updatedRow.balance = Math.round(Math.abs(rec - paid) * 100) / 100;

      copy[index] = updatedRow;

      // Auto save to MongoDB
      autoSaveRecord(updatedRow);
      return copy;
    });
  };

  // Auto-save a modified record to MongoDB
  const autoSaveRecord = async (row) => {
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.post(`${API_URL}/road-tax/save`, {
        recordId: row.recordId,
        truckNo: row.truckNo,
        validityType: row.validityType,
        creditor: creditorName,
        month: selMonth,
        year: selYear,
        renewStatus: row.renewStatus,
        renewDate: row.renewDate,
        newValidityDate: row.newValidityDate,
        receivableAmount: row.receivableAmount,
        paidAmount: row.paidAmount,
        pdfUrl: row.pdfUrl,
        pdfName: row.pdfName
      }, { headers });
    } catch (err) {
      console.error('[VehicleValidity] Auto save error:', err);
    }
  };

  // PDF File Upload Handler
  const handleFileUpload = async (index, file) => {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setSnack({ severity: 'error', msg: 'Only PDF files are allowed for validity renewal receipts.' });
      return;
    }

    setUploadingIndex(index);
    try {
      const formData = new FormData();
      formData.append('pdf', file);

      const token = localStorage.getItem('token');
      const headers = token ? {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data'
      } : { 'Content-Type': 'multipart/form-data' };

      const res = await axios.post(`${API_URL}/road-tax/upload-pdf`, formData, { headers });

      if (res.data?.success) {
        const uploadedUrl = res.data.url;
        const fileName = res.data.fileName || file.name;

        handleCellChange(index, 'pdfUrl', uploadedUrl);
        handleCellChange(index, 'pdfName', fileName);
        setSnack({ severity: 'success', msg: `PDF uploaded successfully for ${rows[index].truckNo} (${rows[index].validityType})!` });
      } else {
        setSnack({ severity: 'error', msg: res.data?.error || 'PDF upload failed.' });
      }
    } catch (err) {
      console.error('[VehicleValidity] Upload error:', err);
      setSnack({ severity: 'error', msg: 'Error uploading PDF file.' });
    } finally {
      setUploadingIndex(null);
    }
  };

  // CSV Export
  const handleExportCsv = () => {
    const exportData = rows.map(r => ({
      'SL NO': r.slNo,
      'OWNER NAME': r.ownerName,
      'VEHICLE NO': r.truckNo,
      'VEHICLE TYPE': r.vehicleType,
      'TYPE OF VALIDITY': r.validityType,
      'EXPIRE DATE': r.expireDate,
      'RENEW STATUS': r.renewStatus,
      'RENEW DATE': r.renewDate,
      'NEW VALIDITY DATE': r.newValidityDate || '',
      'RECEIVABLE AMOUNT (Rs)': r.receivableAmount,
      'PAID AMOUNT (Rs)': r.paidAmount,
      'BALANCE (Rs)': Math.abs(num(r.balance)),
      'PDF URL': r.pdfUrl || 'No PDF'
    }));
    const sanitizedCreditor = creditorName.replace(/\s+/g, '_').toUpperCase();
    exportToCsv(`${sanitizedCreditor}_VEHICLE_VALIDITY_REGISTER_${selMonth}_${selYear}.csv`, exportData);
  };

  // Bulk Save all rows to MongoDB
  const handleSaveAll = async () => {
    if (rows.length === 0) return;
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const savePromises = rows.map(row =>
        axios.post(`${API_URL}/road-tax/save`, {
          recordId: row.recordId,
          truckNo: row.truckNo,
          validityType: row.validityType,
          creditor: creditorName,
          month: selMonth,
          year: selYear,
          renewStatus: row.renewStatus,
          renewDate: row.renewDate,
          newValidityDate: row.newValidityDate,
          receivableAmount: row.receivableAmount,
          paidAmount: row.paidAmount,
          pdfUrl: row.pdfUrl,
          pdfName: row.pdfName
        }, { headers })
      );

      await Promise.all(savePromises);
      setSnack({ severity: 'success', msg: 'Vehicle Validity Register saved successfully!' });
      fetchData();
    } catch (err) {
      console.error('[VehicleValidity] Save all error:', err);
      setSnack({ severity: 'error', msg: 'Failed to save register: ' + (err.response?.data?.error || err.message) });
    } finally {
      setSaving(false);
    }
  };

  const thStyle = {
    backgroundColor: '#0f172a',
    color: '#ffffff',
    padding: '12px 10px',
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
    <Box sx={{ width: '100%', boxSizing: 'border-box' }}>
      {/* ── TOP CONTROLS BAR ────────────────────────────────────────────── */}
      <Paper elevation={0} sx={{ p: 2.5, mb: 3, bgcolor: '#1e293b', borderRadius: 3, border: '1px solid #334155' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>

            {/* YEAR SELECTOR */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" color="#94a3b8" fontWeight="800">
                YEAR:
              </Typography>
              <Select
                size="small"
                value={selYear}
                onChange={(e) => setSelYear(e.target.value)}
                sx={{
                  bgcolor: '#0f172a',
                  color: '#fff',
                  fontWeight: 800,
                  borderRadius: '8px',
                  minWidth: 110,
                  '.MuiOutlinedInput-notchedOutline': { borderColor: '#475569' },
                  '.MuiSvgIcon-root': { color: '#fff' }
                }}
              >
                {yearOptions.map(y => (
                  <MenuItem key={y} value={y} sx={{ fontWeight: 700 }}>{y}</MenuItem>
                ))}
              </Select>
            </Box>

            {/* MONTH SELECTOR WITH CURRENT & PREVIOUS MONTH HIGHLIGHTS */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" color="#94a3b8" fontWeight="800">
                MONTH:
              </Typography>
              <Select
                size="small"
                value={selMonth}
                onChange={(e) => setSelMonth(e.target.value)}
                sx={{
                  bgcolor: '#0f172a',
                  color: '#38bdf8',
                  fontWeight: 800,
                  borderRadius: '8px',
                  minWidth: 230,
                  '.MuiOutlinedInput-notchedOutline': { borderColor: '#475569' },
                  '.MuiSvgIcon-root': { color: '#38bdf8' }
                }}
              >
                <MenuItem value={currentMonthNum} sx={{ fontWeight: 800, color: '#0284c7' }}>
                  📌 Current Month ({currentMonthName} {currentYearNum})
                </MenuItem>
                <MenuItem value="7_DAYS" sx={{ fontWeight: 800, color: '#eab308' }}>
                  ⚡ Next 7 Days (Upcoming)
                </MenuItem>
                <MenuItem value={prevMonthNum} sx={{ fontWeight: 800, color: '#d97706' }}>
                  ⏮️ Previous Month ({prevMonthName} {prevYearNum})
                </MenuItem>
                <MenuItem value="ALL" sx={{ fontWeight: 800, color: '#a855f7' }}>
                  🌐 ALL MONTHS
                </MenuItem>
                {MONTH_LIST.map(m => (
                  <MenuItem key={m.value} value={m.value} sx={{ fontWeight: 600 }}>
                    {m.name}
                  </MenuItem>
                ))}
              </Select>
            </Box>

            {/* Quick Month Filter Buttons */}
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant={selMonth === currentMonthNum && selYear === currentYearNum ? 'contained' : 'outlined'}
                size="small"
                onClick={() => { setSelMonth(currentMonthNum); setSelYear(currentYearNum); }}
                sx={{
                  fontWeight: 800,
                  fontSize: '12px',
                  borderRadius: '6px',
                  textTransform: 'none',
                  bgcolor: selMonth === currentMonthNum && selYear === currentYearNum ? '#0284c7' : 'transparent',
                  borderColor: '#0284c7',
                  color: selMonth === currentMonthNum && selYear === currentYearNum ? '#fff' : '#38bdf8'
                }}
              >
                Current Month
              </Button>

              <Button
                variant={selMonth === '7_DAYS' ? 'contained' : 'outlined'}
                size="small"
                onClick={() => { setSelMonth('7_DAYS'); }}
                sx={{
                  fontWeight: 800,
                  fontSize: '12px',
                  borderRadius: '6px',
                  textTransform: 'none',
                  bgcolor: selMonth === '7_DAYS' ? '#eab308' : 'transparent',
                  borderColor: '#eab308',
                  color: selMonth === '7_DAYS' ? '#0f172a' : '#facc15'
                }}
              >
                Next 7 Days
              </Button>

              <Button
                variant={selMonth === prevMonthNum && selYear === prevYearNum ? 'contained' : 'outlined'}
                size="small"
                onClick={() => { setSelMonth(prevMonthNum); setSelYear(prevYearNum); }}
                sx={{
                  fontWeight: 800,
                  fontSize: '12px',
                  borderRadius: '6px',
                  textTransform: 'none',
                  bgcolor: selMonth === prevMonthNum && selYear === prevYearNum ? '#d97706' : 'transparent',
                  borderColor: '#d97706',
                  color: selMonth === prevMonthNum && selYear === prevYearNum ? '#fff' : '#fbbf24'
                }}
              >
                Previous Month
              </Button>
            </Box>

          </Box>

          {/* RIGHT ACTION BUTTONS & SEARCH */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              placeholder="Search Owner, Vehicle No, Validity Type..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: <SearchIcon sx={{ color: '#94a3b8', mr: 0.5, fontSize: 18 }} />
              }}
              sx={{
                width: 240,
                bgcolor: '#0f172a',
                borderRadius: '8px',
                input: { color: '#fff', fontSize: '13px' },
                '.MuiOutlinedInput-notchedOutline': { borderColor: '#475569' }
              }}
            />

            <IconButton onClick={fetchData} sx={{ color: '#f8fafc', bgcolor: '#0f172a', '&:hover': { bgcolor: '#334155' } }}>
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
              color="success"
              startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
              onClick={handleSaveAll}
              disabled={saving}
              sx={{ height: 36, px: 2.5, fontWeight: 800, bgcolor: '#16a34a', '&:hover': { bgcolor: '#15803d' } }}
            >
              Save Register
            </Button>
          </Box>

        </Box>
      </Paper>

      {/* ── VEHICLE VALIDITY TABLE CONTAINER ─────────────────────────────────────── */}
      <Paper elevation={4} sx={{ p: { xs: 2, md: 3 }, bgcolor: '#ffffff', color: '#0f172a', borderRadius: 3, boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)', overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box>
            <Typography variant="h6" fontWeight="900" sx={{ color: '#0f172a', letterSpacing: '-0.3px' }}>
              VEHICLE VALIDITY REGISTER
            </Typography>
            <Typography variant="caption" color="#64748b" fontWeight="700">
              Selected Period: {MONTH_LIST.find(m => m.value === selMonth)?.name || selMonth} {selYear} &bull; {rows.length} Upcoming Validities (Next 7 Days)
            </Typography>
          </Box>

          <Chip
            icon={<CheckCircleOutlineIcon sx={{ color: '#16a3a0 !important' }} />}
            label="Live Sync with Owner & Vehicle Directory"
            sx={{ bgcolor: '#f0fdf4', color: '#15803d', fontWeight: 800, border: '1px solid #bbf7d0' }}
          />
        </Box>

        <TableContainer ref={tableContainerRef} sx={{ overflowX: 'auto', position: 'relative', minHeight: 350, border: '1px solid #cbd5e1', borderRadius: '8px' }}>
          {loading && (
            <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(255,255,255,0.7)', zIndex: 20 }}>
              <CircularProgress color="primary" />
            </Box>
          )}

          <Table size="small" style={{ width: '100%', minWidth: 1520, borderCollapse: 'collapse', fontFamily: 'Inter, system-ui, sans-serif' }}>
            <TableHead>
              <TableRow>
                <TableCell style={{ ...thStyle, width: '60px' }}>1. SL NO</TableCell>
                <TableCell style={{ ...thStyle, textAlign: 'left', minWidth: '180px' }}>2. OWNER NAME</TableCell>
                <TableCell style={{ ...thStyle, minWidth: '130px' }}>3. VEHICLE NO</TableCell>
                <TableCell style={{ ...thStyle, minWidth: '110px' }}>4. VEHICLE TYPE</TableCell>
                <TableCell style={{ ...thStyle, minWidth: '150px' }}>5. TYPE OF VALIDITY</TableCell>
                <TableCell style={{ ...thStyle, minWidth: '130px' }}>6. EXPIRE DATE</TableCell>
                <TableCell style={{ ...thStyle, minWidth: '140px' }}>7. RENEW STATUS</TableCell>
                <TableCell style={{ ...thStyle, minWidth: '150px' }}>8. RENEW DATE</TableCell>
                <TableCell style={{ ...thStyle, minWidth: '150px' }}>9. NEW VALIDITY DATE</TableCell>
                <TableCell style={{ ...thStyle, textAlign: 'right', minWidth: '160px' }}>10. RECEIVABLE AMOUNT</TableCell>
                <TableCell style={{ ...thStyle, textAlign: 'right', minWidth: '160px' }}>11. PAID AMOUNT</TableCell>
                <TableCell style={{ ...thStyle, textAlign: 'right', minWidth: '150px' }}>12. BALANCE</TableCell>
                <TableCell style={{ ...thStyle, minWidth: '200px' }}>13. PDF UPLOAD</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {rows.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={13} align="center" sx={{ py: 6, color: '#64748b', fontWeight: 600 }}>
                    No vehicle validities expiring in the next 7 days found for {MONTH_LIST.find(m => m.value === selMonth)?.name || selMonth} {selYear}.
                  </TableCell>
                </TableRow>
              )}

              {rows.map((row, index) => {
                const isEven = index % 2 === 0;
                const isRenewed = row.renewStatus === 'RENEWED';

                return (
                  <TableRow
                    key={row.id || index}
                    style={{
                      backgroundColor: isEven ? '#ffffff' : '#f8fafc',
                      borderBottom: '1px solid #e2e8f0'
                    }}
                  >
                    {/* 1. SL NO */}
                    <TableCell style={{ ...tdStyle, textAlign: 'center', fontWeight: 800, color: '#475569' }}>
                      {row.slNo}
                    </TableCell>

                    {/* 2. OWNER NAME */}
                    <TableCell style={{ ...tdStyle, fontWeight: 700, color: '#0f172a' }}>
                      {row.ownerName}
                    </TableCell>

                    {/* 3. VEHICLE NO */}
                    <TableCell style={{ ...tdStyle, textAlign: 'center', fontWeight: 800, color: '#0284c7' }}>
                      {row.truckNo}
                    </TableCell>

                    {/* 4. VEHICLE TYPE */}
                    <TableCell style={{ ...tdStyle, textAlign: 'center', fontWeight: 600, color: '#334155' }}>
                      <Chip label={row.vehicleType || '-'} size="small" sx={{ bgcolor: '#f1f5f9', fontWeight: 700, fontSize: '0.72rem' }} />
                    </TableCell>

                    {/* 5. TYPE OF VALIDITY */}
                    <TableCell style={{ ...tdStyle, textAlign: 'center', fontWeight: 800, color: '#6b21a8' }}>
                      <Chip label={row.validityType || '-'} size="small" sx={{ bgcolor: '#f3e8ff', color: '#7e22ce', fontWeight: 800, fontSize: '0.75rem', border: '1px solid #d8b4fe' }} />
                    </TableCell>

                    {/* 6. EXPIRE DATE */}
                    <TableCell style={{ ...tdStyle, textAlign: 'center', fontWeight: 800, color: '#d97706' }}>
                      {row.expireDate}
                    </TableCell>

                    {/* 7. RENEW STATUS */}
                    <TableCell style={{ ...tdStyle, textAlign: 'center' }}>
                      <Select
                        size="small"
                        value={row.renewStatus || 'PENDING'}
                        onChange={(e) => handleCellChange(index, 'renewStatus', e.target.value)}
                        sx={{
                          height: 32,
                          fontSize: '12px',
                          fontWeight: 800,
                          color: isRenewed ? '#15803d' : '#b45309',
                          bgcolor: isRenewed ? '#f0fdf4' : '#fffbe6',
                          borderRadius: '6px',
                          '.MuiOutlinedInput-notchedOutline': { borderColor: isRenewed ? '#86efac' : '#fef08a' }
                        }}
                      >
                        <MenuItem value="PENDING" sx={{ fontWeight: 800, color: '#b45309' }}>⏳ PENDING</MenuItem>
                        <MenuItem value="RENEWED" sx={{ fontWeight: 800, color: '#15803d' }}>✅ RENEWED</MenuItem>
                      </Select>
                    </TableCell>

                    {/* 8. RENEW DATE */}
                    <TableCell style={{ ...tdStyle, textAlign: 'center' }}>
                      <TextField
                        size="small"
                        type="date"
                        value={formatDateForInput(row.renewDate)}
                        onChange={(e) => handleCellChange(index, 'renewDate', e.target.value)}
                        InputLabelProps={{ shrink: true }}
                        sx={{
                          width: 145,
                          input: { fontSize: '12px', padding: '5px 8px', fontWeight: 700, color: '#0f172a' },
                          '.MuiOutlinedInput-notchedOutline': { borderColor: '#cbd5e1' }
                        }}
                      />
                    </TableCell>

                    {/* 9. NEW VALIDITY DATE */}
                    <TableCell style={{ ...tdStyle, textAlign: 'center' }}>
                      <TextField
                        size="small"
                        type="date"
                        value={formatDateForInput(row.newValidityDate)}
                        onChange={(e) => handleCellChange(index, 'newValidityDate', e.target.value)}
                        InputLabelProps={{ shrink: true }}
                        sx={{
                          width: 145,
                          input: { fontSize: '12px', padding: '5px 8px', fontWeight: 700, color: '#0f172a' },
                          '.MuiOutlinedInput-notchedOutline': { borderColor: '#cbd5e1' }
                        }}
                      />
                    </TableCell>

                    {/* 10. RECEIVABLE AMOUNT */}
                    <TableCell style={{ ...tdStyle, textAlign: 'right' }}>
                      <TextField
                        size="small"
                        type="number"
                        value={row.receivableAmount || ''}
                        onChange={(e) => handleCellChange(index, 'receivableAmount', e.target.value)}
                        placeholder="0.00"
                        InputProps={{
                          startAdornment: <InputAdornment position="start"><span style={{ fontSize: '11px', fontWeight: 700 }}>₹</span></InputAdornment>
                        }}
                        sx={{
                          width: 130,
                          input: { textAlign: 'right', fontSize: '12px', padding: '5px 8px', fontWeight: 700, color: '#0f172a' },
                          '.MuiOutlinedInput-notchedOutline': { borderColor: '#cbd5e1' }
                        }}
                      />
                    </TableCell>

                    {/* 11. PAID AMOUNT */}
                    <TableCell style={{ ...tdStyle, textAlign: 'right' }}>
                      <TextField
                        size="small"
                        type="number"
                        value={row.paidAmount || ''}
                        onChange={(e) => handleCellChange(index, 'paidAmount', e.target.value)}
                        placeholder="0.00"
                        InputProps={{
                          startAdornment: <InputAdornment position="start"><span style={{ fontSize: '11px', fontWeight: 700 }}>₹</span></InputAdornment>
                        }}
                        sx={{
                          width: 130,
                          input: { textAlign: 'right', fontSize: '12px', padding: '5px 8px', fontWeight: 700, color: '#047857' },
                          '.MuiOutlinedInput-notchedOutline': { borderColor: '#cbd5e1' }
                        }}
                      />
                    </TableCell>

                    {/* 12. BALANCE (RECEIVABLE - PAID) */}
                    <TableCell style={{ ...tdStyle, textAlign: 'right', fontWeight: 900, fontSize: '13px', color: row.balance === 0 ? '#15803d' : '#b91c1c' }}>
                      ₹{formatAmt(Math.abs(row.balance))}
                    </TableCell>

                    {/* 13. PDF UPLOAD */}
                    <TableCell style={{ ...tdStyle, textAlign: 'center' }}>
                      <Box display="flex" alignItems="center" justifyContent="center" gap={1}>
                        <input
                          type="file"
                          accept="application/pdf"
                          id={`validity-pdf-${index}`}
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              handleFileUpload(index, e.target.files[0]);
                            }
                          }}
                        />

                        {uploadingIndex === index ? (
                          <CircularProgress size={22} color="primary" />
                        ) : row.pdfUrl ? (
                          <Box display="flex" alignItems="center" gap={1}>
                            <Tooltip title={row.pdfName || 'View PDF'}>
                              <Button
                                size="small"
                                variant="outlined"
                                startIcon={<PictureAsPdfIcon sx={{ color: '#dc2626' }} />}
                                endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
                                onClick={() => window.open(row.pdfUrl, '_blank')}
                                sx={{
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  color: '#0284c7',
                                  borderColor: '#0284c7',
                                  borderRadius: '6px',
                                  textTransform: 'none',
                                  py: 0.25,
                                  px: 1,
                                  maxWidth: 130,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                {row.pdfName || 'View PDF'}
                              </Button>
                            </Tooltip>

                            <label htmlFor={`validity-pdf-${index}`}>
                              <Button
                                size="small"
                                component="span"
                                sx={{ fontSize: '10px', fontWeight: 700, color: '#64748b', minWidth: 40, p: 0.5 }}
                              >
                                Replace
                              </Button>
                            </label>
                          </Box>
                        ) : (
                          <label htmlFor={`validity-pdf-${index}`}>
                            <Button
                              size="small"
                              variant="contained"
                              component="span"
                              startIcon={<CloudUploadIcon sx={{ fontSize: 16 }} />}
                              sx={{
                                fontSize: '11px',
                                fontWeight: 800,
                                bgcolor: '#0284c7',
                                color: '#ffffff',
                                borderRadius: '6px',
                                textTransform: 'none',
                                px: 1.5,
                                py: 0.5,
                                '&:hover': { bgcolor: '#0369a1' }
                              }}
                            >
                              Upload PDF
                            </Button>
                          </label>
                        )}
                      </Box>
                    </TableCell>

                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Snackbar Notifications */}
      <Snackbar
        open={Boolean(snack)}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert onClose={() => setSnack(null)} severity={snack?.severity || 'info'} sx={{ width: '100%', fontWeight: 700 }}>
          {snack?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}

