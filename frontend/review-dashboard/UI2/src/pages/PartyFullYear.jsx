import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import SearchableSelect from '../components/SearchableSelect';
import {
  Box, Typography, Button, IconButton, CircularProgress,
  Chip, Snackbar, Alert, Tooltip, MenuItem, Paper, Tabs, Tab
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import axios from 'axios';
import { io } from 'socket.io-client';
import { exportToCsv } from '../utils/exportCsv';
import { useTableNavigation } from '../hooks/useTableNavigation';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const SOCKET_URL = import.meta.env.VITE_SOCKET_IO_URL || import.meta.env.VITE_API_URL || 'http://localhost:3000';

const FY_OPTIONS = ['FY 2026-27', 'FY 2025-26', 'FY 2024-25', 'FY 2027-28', 'FY 2023-24'];

const num = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};
const round2 = (n) => Math.round(n);
const normVeh = (v) => String(v || '').trim().toUpperCase().replace(/\s+/g, '');

const COLUMNS = [
  { key: 'MONTH', label: 'Month\n(Period)', width: 140, calc: true },
  { key: 'GROSS FREIGHT', label: 'Gross Freight\n(95% Payable)', width: 115, calc: true, bg: '#fffbeb' },
  { key: 'LOADING ADVANCE', label: 'Loading\nAdvance', width: 95, calc: true },
  { key: 'FUEL', label: 'Fuel\n(HSD Amt)', width: 95, calc: true },
  { key: 'TDS', label: 'TDS', width: 95, calc: true, bg: '#fef2f2' },
  { key: 'TRAVELLING EXP', label: 'Travelling\nExp', width: 95, calc: true },
  { key: 'DAMAGE RECOVERY', label: 'Damage\nRecovery', width: 95, calc: true },
  { key: 'CASH_BANK_OTHERS', label: 'Cash/Bank\nTF/Others', width: 105, calc: true },
  { key: 'OTHER DEDUCTION', label: 'Other\nDeduction', width: 95, calc: true },
  { key: 'OTHER REASON', label: 'Other\nReason', width: 120, calc: true, bg: '#fffbeb' },
  { key: 'GPS TRIP CHARGE', label: 'GPS Monitoring /\nTrip Charge', width: 115, calc: true },
  { key: 'GPS DEVICE', label: 'GPS\nDevice', width: 85, calc: true },
  { key: 'NET AMOUNT', label: 'Net Amount', width: 110, calc: true, highlight: '#ecfdf5' },
  { key: '8.5% NVCL', label: '8.5% NVCL\nIncentive', width: 95, calc: true, bg: '#f0f9ff' },
  { key: 'DEDICATED INCENTIVE', label: 'Dedicated\nIncentive', width: 115, calc: true, bg: '#f0f9ff' },
  { key: 'RAFTER', label: 'Others', width: 85, calc: true, bg: '#f0f9ff' },
  { key: 'EXTRA U/L', label: 'Extra U/L', width: 85, calc: true, bg: '#f0f9ff' },
  { key: 'TOLL UP', label: 'Toll UP', width: 85, calc: true, bg: '#fef9c3' },
  { key: 'TOLL DOWN', label: 'Toll Down', width: 85, calc: true, bg: '#fef9c3' },
  { key: 'TDS ON INCENTIVE', label: 'TDS on\nIncentive/UL', width: 95, calc: true, bg: '#f0fdf4' },
  { key: 'TOTAL FREIGHT', label: 'Total Freight', width: 110, calc: true, highlight: '#faf5ff' },
  { key: 'GST FCM', label: 'GST FCM', width: 110, calc: true, bg: '#f0f9ff' },
  { key: 'WITHHOLD AMOUNT', label: 'Withhold\nAmount', width: 95, calc: true, bg: '#fef2f2' },
  { key: 'WITHHOLD REASON', label: 'Withhold\nReason', width: 120, calc: true, bg: '#fef2f2' },
  { key: 'PREV MONTH DUE', label: 'Prev Month\nDue', width: 105, calc: true, bg: '#fef2f2' },
  { key: 'NET PAYABLE', label: 'Net Payable\n(after deduct)', width: 125, calc: true, highlight: '#eef2ff' },
  { key: 'RECOVERED TO DAC', label: 'Recovered\nto DAC', width: 105, calc: true, bg: '#fdf2f8' },
  { key: 'CREDIT REFUND', label: 'Credit\nRefund', width: 95, calc: true, bg: '#ecfdf5' },
  { key: 'PAID TO PARTY', label: 'Paid to\nParty', width: 95, calc: true, bg: '#ecfdf5' },
  { key: 'BALANCE DUE', label: 'Balance Due', width: 110, calc: true, highlight: '#fef2f2' },
  { key: 'PAYMENT DATE', label: 'Payment\nDate', width: 110, calc: true, date: true, bg: '#f8fafc' },
  { key: 'REMARKS', label: 'Remarks', width: 350, calc: true, bg: '#f8fafc' },
];

export default function PartyFullYear({ onBack, initialFy, initialParty }) {
  const [selFy, setSelFy] = useState(initialFy || 'FY 2026-27');
  const [parties, setParties] = useState([]);
  const [partyVehicles, setPartyVehicles] = useState({});
  const [selectedParty, setSelectedParty] = useState(initialParty || '');
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingParties, setLoadingParties] = useState(true);
  const [snack, setSnack] = useState(null);

  const tableContainerRef = useRef(null);
  useTableNavigation(tableContainerRef);

  // 1. Fetch all authoritative parties and their associated vehicles
  const fetchPartiesAndVehicles = useCallback(async () => {
    setLoadingParties(true);
    try {
      const res = await axios.get(`${API_URL}/party-payment/parties-and-vehicles`);
      if (res.data?.success) {
        const sortedParties = res.data.parties || [];
        const pvMap = res.data.partyVehicles || {};
        setParties(sortedParties);
        setPartyVehicles(pvMap);

        if (!selectedParty || !sortedParties.includes(selectedParty)) {
          const firstParty = sortedParties[0] || '';
          setSelectedParty(firstParty);
          const firstVehicles = pvMap[firstParty] || [];
          setSelectedVehicle(firstVehicles[0] || '');
        } else {
          const currentVehicles = pvMap[selectedParty] || [];
          if (!selectedVehicle || !currentVehicles.includes(selectedVehicle)) {
            setSelectedVehicle(currentVehicles[0] || '');
          }
        }
      }
    } catch (err) {
      console.error('[PartyFullYear] Error loading parties:', err);
      setSnack({ severity: 'error', msg: `Failed to load parties: ${err.message}` });
    } finally {
      setLoadingParties(false);
    }
  }, [selectedParty, selectedVehicle]);

  useEffect(() => {
    fetchPartiesAndVehicles();
  }, []);

  // When selectedParty changes, update selectedVehicle to first vehicle of that party
  const handlePartyChange = (newParty) => {
    setSelectedParty(newParty);
    const vList = partyVehicles[newParty] || [];
    setSelectedVehicle(vList[0] || '');
  };

  // 2. Fetch full 12-month report for selected Party + Vehicle + FY
  const fetchFullYearReport = useCallback(async () => {
    if (!selectedVehicle) {
      setReportData(null);
      return;
    }
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/party-payment/full-year`, {
        params: {
          partyName: selectedParty,
          vehicleNo: selectedVehicle,
          fy: selFy
        }
      });
      if (res.data?.success) {
        setReportData(res.data);
      } else {
        setSnack({ severity: 'error', msg: res.data?.error || 'Failed to fetch full year data' });
      }
    } catch (err) {
      console.error('[PartyFullYear] Fetch report error:', err);
      setSnack({ severity: 'error', msg: `Error fetching statement: ${err.response?.data?.error || err.message}` });
    } finally {
      setLoading(false);
    }
  }, [selectedParty, selectedVehicle, selFy]);

  useEffect(() => {
    fetchFullYearReport();
  }, [fetchFullYearReport]);

  // Live Socket.io subscriptions
  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socket.on('partyPaymentUpdate', () => {
      fetchFullYearReport();
    });
    socket.on('voucherCreated', () => {
      fetchFullYearReport();
    });
    socket.on('voucherUpdate', () => {
      fetchFullYearReport();
    });
    socket.on('voucherDeleted', () => {
      fetchFullYearReport();
    });
    socket.on('freightCreditorGstUpdate', () => {
      fetchFullYearReport();
    });
    socket.on('cementUpdates', () => {
      fetchFullYearReport();
    });
    return () => {
      socket.disconnect();
    };
  }, [fetchFullYearReport]);

  const currentVehicles = useMemo(() => {
    return partyVehicles[selectedParty] || [];
  }, [partyVehicles, selectedParty]);

  const monthsRows = useMemo(() => {
    return reportData?.months || [];
  }, [reportData]);

  const summaryTotals = useMemo(() => {
    return reportData?.totals || {};
  }, [reportData]);

  // Export to Excel
  const handleExport = () => {
    if (!monthsRows.length) return setSnack({ severity: 'warning', msg: 'No data to export.' });
    const cleanParty = (selectedParty || 'Party').replace(/[^a-zA-Z0-9]/g, '_');
    const cleanVeh = (selectedVehicle || 'Veh').replace(/[^a-zA-Z0-9]/g, '_');
    const cleanFy = (selFy || 'FY').replace(/[^a-zA-Z0-9]/g, '_');
    exportToCsv(
      `PartyFullYear_${cleanParty}_${cleanVeh}_${cleanFy}.xls`,
      [...monthsRows, { 'MONTH': 'TOTAL', ...summaryTotals }]
    );
  };

  const stickyLeft = { '#': 0, 'MONTH': 40 };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#f8fafc', overflow: 'hidden' }}>

      {/* ── Top Navigation Bar ── */}
      <Box sx={{ p: 2, bgcolor: 'background.paper', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, zIndex: 10 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Button
            onClick={onBack}
            startIcon={<ArrowBackIcon />}
            variant="outlined"
            size="small"
            sx={{
              fontWeight: 700,
              color: '#334155',
              borderColor: '#cbd5e1',
              borderRadius: 2,
              textTransform: 'none',
              '&:hover': { bgcolor: '#f1f5f9', borderColor: '#94a3b8' }
            }}
          >
            Back to Party Payment Details
          </Button>

          <Typography variant="h6" fontWeight={900} sx={{ color: '#0f172a', letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', gap: 1 }}>
            PARTY FULL YEAR
          </Typography>

          <Chip
            label="12 Months Financial Year Statement (01-Apr → 31-Mar)"
            size="small"
            sx={{ fontWeight: 700, bgcolor: '#f5f3ff', color: '#6d28d9', border: '1px solid #ddd6fe' }}
          />
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Tooltip title="Refresh live statement">
            <IconButton size="small" onClick={fetchFullYearReport} disabled={loading} sx={{ bgcolor: '#f1f5f9', '&:hover': { bgcolor: '#e2e8f0' } }}>
              <RefreshIcon fontSize="small" sx={{ color: '#475569', animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            </IconButton>
          </Tooltip>
          <Button
            size="small"
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleExport}
            sx={{ fontWeight: 700, borderRadius: 2, color: '#475569', borderColor: '#cbd5e1' }}
          >
            Export XLS
          </Button>
        </Box>
      </Box>

      {/* ── Filter / Dropdown Bar ── */}
      <Box sx={{ px: 2, py: 1.5, bgcolor: 'background.paper', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', zIndex: 9 }}>
        {/* Financial Year Selector */}
        <SearchableSelect
          sx={{ minWidth: 150 }}
          value={selFy}
          label="Financial Year"
          onChange={e => setSelFy(e.target.value)}
        >
          {FY_OPTIONS.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
        </SearchableSelect>

        {/* Party Name Selector */}
        <SearchableSelect
          sx={{ minWidth: 260 }}
          value={selectedParty}
          label="Party Name"
          onChange={e => handlePartyChange(e.target.value)}
          disabled={loadingParties}
        >
          {parties.map(p => (
            <MenuItem key={p} value={p}>
              {p} ({partyVehicles[p]?.length || 0} veh)
            </MenuItem>
          ))}
        </SearchableSelect>

        {/* Vehicle Number Selector */}
        <SearchableSelect
          sx={{ minWidth: 170 }}
          value={selectedVehicle}
          label="Vehicle Number"
          onChange={e => setSelectedVehicle(e.target.value)}
          disabled={!currentVehicles.length}
        >
          {currentVehicles.map(v => (
            <MenuItem key={v} value={v}>{v}</MenuItem>
          ))}
        </SearchableSelect>

        <Chip
          icon={<LocalShippingIcon sx={{ fontSize: '16px !important' }} />}
          label={`${currentVehicles.length} vehicle(s) for ${selectedParty || 'Party'}`}
          size="small"
          sx={{ bgcolor: '#f1f5f9', fontWeight: 700, color: '#334155' }}
        />

        {selectedVehicle && (
          <Chip
            label={`Active: ${selectedVehicle}`}
            size="small"
            sx={{ bgcolor: '#eff6ff', fontWeight: 800, color: '#1d4ed8', border: '1px solid #bfdbfe' }}
          />
        )}
      </Box>

      {/* ── Vehicle Tabs Bar (One tab per vehicle) ── */}
      {currentVehicles.length > 0 && (
        <Box sx={{ px: 2, bgcolor: '#ffffff', borderBottom: '1px solid #cbd5e1', display: 'flex', alignItems: 'center' }}>
          <Typography variant="caption" fontWeight={800} color="#64748b" sx={{ mr: 1.5, textTransform: 'uppercase', fontSize: '11px' }}>
            Vehicle Tabs:
          </Typography>
          <Tabs
            value={selectedVehicle || (currentVehicles[0] || false)}
            onChange={(e, newVeh) => setSelectedVehicle(newVeh)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              minHeight: '40px',
              '& .MuiTab-root': {
                minHeight: '40px',
                py: 0.5,
                px: 2,
                fontWeight: 800,
                fontSize: '12px',
                textTransform: 'none',
                color: '#475569',
                '&.Mui-selected': {
                  color: '#2563eb',
                  bgcolor: '#eff6ff'
                }
              }
            }}
          >
            {currentVehicles.map((veh) => (
              <Tab
                key={veh}
                value={veh}
                label={
                  <Box display="flex" alignItems="center" gap={0.8}>
                    <LocalShippingIcon sx={{ fontSize: 15 }} />
                    <span>{veh}</span>
                  </Box>
                }
              />
            ))}
          </Tabs>
        </Box>
      )}

      {/* ── Executive Summary Cards Bar ── */}
      {reportData && !loading && (
        <Box sx={{ px: 2, py: 1.2, bgcolor: '#ffffff', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 1.5, overflowX: 'auto', flexWrap: 'nowrap' }}>
          <Paper elevation={0} sx={{ p: 1, minWidth: 130, border: '1px solid #e2e8f0', bgcolor: '#fffbeb', borderRadius: 1.5 }}>
            <Typography variant="caption" color="#92400e" fontWeight={700} display="block" sx={{ fontSize: '10px' }}>GROSS FREIGHT (95%)</Typography>
            <Typography variant="body2" fontWeight={900} color="#78350f" sx={{ fontFamily: 'monospace' }}>
              ₹{round2(summaryTotals['GROSS FREIGHT'] || 0).toLocaleString('en-IN')}
            </Typography>
          </Paper>

          <Paper elevation={0} sx={{ p: 1, minWidth: 120, border: '1px solid #e2e8f0', bgcolor: '#ecfdf5', borderRadius: 1.5 }}>
            <Typography variant="caption" color="#065f46" fontWeight={700} display="block" sx={{ fontSize: '10px' }}>NET AMOUNT</Typography>
            <Typography variant="body2" fontWeight={900} color="#047857" sx={{ fontFamily: 'monospace' }}>
              ₹{round2(summaryTotals['NET AMOUNT'] || 0).toLocaleString('en-IN')}
            </Typography>
          </Paper>

          <Paper elevation={0} sx={{ p: 1, minWidth: 130, border: '1px solid #e2e8f0', bgcolor: '#faf5ff', borderRadius: 1.5 }}>
            <Typography variant="caption" color="#6b21a8" fontWeight={700} display="block" sx={{ fontSize: '10px' }}>TOTAL FREIGHT</Typography>
            <Typography variant="body2" fontWeight={900} color="#581c87" sx={{ fontFamily: 'monospace' }}>
              ₹{round2(summaryTotals['TOTAL FREIGHT'] || 0).toLocaleString('en-IN')}
            </Typography>
          </Paper>

          <Paper elevation={0} sx={{ p: 1, minWidth: 120, border: '1px solid #e2e8f0', bgcolor: '#f0f9ff', borderRadius: 1.5 }}>
            <Typography variant="caption" color="#0369a1" fontWeight={700} display="block" sx={{ fontSize: '10px' }}>GST FCM (AUTO)</Typography>
            <Typography variant="body2" fontWeight={900} color="#0284c7" sx={{ fontFamily: 'monospace' }}>
              {summaryTotals['GST FCM'] !== null && summaryTotals['GST FCM'] !== undefined ? `₹${round2(summaryTotals['GST FCM']).toLocaleString('en-IN')}` : '—'}
            </Typography>
          </Paper>

          <Paper elevation={0} sx={{ p: 1, minWidth: 130, border: '1px solid #e2e8f0', bgcolor: '#eef2ff', borderRadius: 1.5 }}>
            <Typography variant="caption" color="#3730a3" fontWeight={700} display="block" sx={{ fontSize: '10px' }}>NET PAYABLE</Typography>
            <Typography variant="body2" fontWeight={900} color="#1d4ed8" sx={{ fontFamily: 'monospace' }}>
              ₹{round2(summaryTotals['NET PAYABLE'] || 0).toLocaleString('en-IN')}
            </Typography>
          </Paper>

          <Paper elevation={0} sx={{ p: 1, minWidth: 120, border: '1px solid #e2e8f0', bgcolor: '#f0fdf4', borderRadius: 1.5 }}>
            <Typography variant="caption" color="#166534" fontWeight={700} display="block" sx={{ fontSize: '10px' }}>PAID TO PARTY</Typography>
            <Typography variant="body2" fontWeight={900} color="#15803d" sx={{ fontFamily: 'monospace' }}>
              ₹{round2(summaryTotals['PAID TO PARTY'] || 0).toLocaleString('en-IN')}
            </Typography>
          </Paper>

          <Paper elevation={0} sx={{ p: 1, minWidth: 120, border: '1px solid #e2e8f0', bgcolor: '#fef2f2', borderRadius: 1.5 }}>
            <Typography variant="caption" color="#991b1b" fontWeight={700} display="block" sx={{ fontSize: '10px' }}>BALANCE DUE</Typography>
            <Typography variant="body2" fontWeight={900} color="#b91c1c" sx={{ fontFamily: 'monospace' }}>
              ₹{round2(summaryTotals['BALANCE DUE'] || 0).toLocaleString('en-IN')}
            </Typography>
          </Paper>
        </Box>
      )}

      {/* ── 12-Month Statement Spreadsheet ── */}
      <Box ref={tableContainerRef} sx={{ overflow: 'auto', flex: 1, position: 'relative', bgcolor: '#ffffff' }}>
        {loading ? (
          <Box display="flex" alignItems="center" justifyContent="center" height="100%" gap={2}>
            <CircularProgress sx={{ color: '#6d28d9' }} />
            <Typography fontWeight={700} color="text.secondary">
              Generating full 12-month statement for {selectedParty} • {selectedVehicle}…
            </Typography>
          </Box>
        ) : !selectedVehicle ? (
          <Box display="flex" alignItems="center" justifyContent="center" height="100%" color="#64748b">
            <Typography fontWeight={600}>Please select a Party and Vehicle to view the full financial year statement.</Typography>
          </Box>
        ) : (
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed', fontFamily: 'Inter, system-ui, sans-serif', fontSize: '12px', minWidth: 'max-content' }}>
            <colgroup>
              <col style={{ width: 40, minWidth: 40 }} />
              {COLUMNS.map(c => <col key={c.key} style={{ width: c.width, minWidth: c.width }} />)}
            </colgroup>

            {/* ── Head ── */}
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr>
                <th style={{
                  position: 'sticky', top: 0, left: 0, zIndex: 20,
                  background: '#f8fafc', color: '#475569',
                  padding: '10px 4px', textAlign: 'center', fontSize: 11, fontWeight: 800,
                  border: '1px solid #e2e8f0', borderBottom: '2px solid #cbd5e1',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.08)', whiteSpace: 'nowrap'
                }}>#</th>

                {COLUMNS.map((col) => {
                  const isSticky = col.key === 'MONTH';
                  const leftPx = isSticky ? stickyLeft[col.key] : undefined;
                  const bg = col.highlight ? '#f0fdf4' : '#f8fafc';
                  const textColor = col.highlight ? '#166534' : '#0f172a';
                  return (
                    <th key={col.key} style={{
                      position: 'sticky', top: 0,
                      left: isSticky ? leftPx : undefined,
                      zIndex: isSticky ? 18 : 10,
                      background: bg, color: textColor,
                      padding: '10px 6px', textAlign: 'center',
                      fontSize: 11, fontWeight: 800, border: '1px solid #e2e8f0', borderBottom: '2px solid #cbd5e1',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
                      whiteSpace: 'pre-line', lineHeight: 1.25,
                    }}>
                      {col.label}
                      <div style={{ fontSize: 9, opacity: 0.6, fontWeight: 600, marginTop: 1, color: '#0284c7' }}>∑ auto</div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            {/* ── Body (April -> March: Exactly 12 Rows) ── */}
            <tbody>
              {monthsRows.map((row, ri) => {
                const isFuture = row.isFuture === true;
                const rowBg = isFuture ? '#fafafa' : (ri % 2 === 0 ? '#ffffff' : '#f8fafc');
                const hasTrips = (row.tripCount || 0) > 0;
                return (
                  <tr key={ri} style={{ backgroundColor: rowBg, opacity: isFuture ? 0.75 : 1 }}>
                    {/* # cell */}
                    <td style={{
                      position: 'sticky', left: 0, zIndex: 3,
                      textAlign: 'center', border: '1px solid #e2e8f0',
                      fontWeight: 700, color: isFuture ? '#94a3b8' : '#475569', padding: '6px 4px',
                      background: isFuture ? '#f8fafc' : '#f8fafc', fontSize: 11
                    }}>
                      {ri + 1}
                    </td>

                    {COLUMNS.map(col => {
                      const val = row[col.key];
                      const isSticky = col.key === 'MONTH';
                      const leftPx = isSticky ? stickyLeft[col.key] : undefined;
                      const isText = ['MONTH', 'REMARKS', 'OTHER REASON', 'WITHHOLD REASON'].includes(col.key);
                      const isDate = col.key === 'PAYMENT DATE';
                      const align = isText ? 'left' : isDate ? 'center' : 'right';

                      let cellBg = rowBg;
                      if (!isFuture) {
                        if (col.bg) cellBg = col.bg;
                        if (col.highlight) cellBg = col.highlight;
                      }

                      // Format value
                      let display = '';
                      if (isFuture) {
                        if (col.key === 'MONTH') {
                          display = String(val || '');
                        } else if (isText || isDate) {
                          display = '';
                        } else {
                          display = '—';
                        }
                      } else if (val !== null && val !== undefined && val !== '') {
                        if (isDate) {
                          if (/^\d{4}-\d{2}-\d{2}$/.test(String(val))) {
                            const [y, m, d] = String(val).split('-');
                            display = `${d}-${m}-${y}`;
                          } else {
                            display = String(val);
                          }
                        } else if (isText) {
                          display = String(val);
                        } else {
                          const n = num(val);
                          display = n !== 0 ? n.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : (col.key === 'GST FCM' ? '0' : '0');
                        }
                      } else {
                        if (col.key === 'GST FCM') {
                          display = '—';
                        } else if (isText || isDate) {
                          display = '';
                        } else {
                          display = '0';
                        }
                      }

                      let txtColor = isFuture ? '#94a3b8' : '#334155';
                      if (!isFuture) {
                        if (col.key === 'MONTH') txtColor = '#0f172a';
                        if (col.key === 'GST FCM') txtColor = (val !== null && val !== undefined && val !== '') ? '#0369a1' : '#94a3b8';
                        if (col.key === 'NET PAYABLE') txtColor = '#1d4ed8';
                        if (col.key === 'PAID TO PARTY') txtColor = '#047857';
                        if (col.key === 'BALANCE DUE') txtColor = '#b91c1c';
                      }

                      return (
                        <td
                          key={col.key}
                          style={{
                            position: isSticky ? 'sticky' : undefined,
                            left: isSticky ? leftPx : undefined,
                            zIndex: isSticky ? 3 : 1,
                            border: '1px solid #e2e8f0',
                            background: isSticky ? (isFuture ? '#fafafa' : (ri % 2 === 0 ? '#ffffff' : '#f8fafc')) : cellBg,
                            padding: '6px 7px',
                            fontWeight: col.key === 'MONTH' ? 800 : (isFuture ? 400 : 500),
                            color: txtColor,
                            textAlign: align,
                            fontFamily: !isText && !isDate ? 'monospace' : 'inherit',
                            whiteSpace: col.key === 'MONTH' ? 'nowrap' : 'normal'
                          }}
                        >
                          {col.key === 'MONTH' ? (
                            <Box display="flex" alignItems="center" gap={0.8}>
                              <CalendarMonthIcon sx={{ fontSize: 14, color: isFuture ? '#94a3b8' : '#6d28d9' }} />
                              <span style={{ color: isFuture ? '#64748b' : '#0f172a' }}>{display}</span>
                              {isFuture ? (
                                <Chip label="Future" size="small" variant="outlined" sx={{ fontSize: '9px', height: '18px', color: '#94a3b8', borderColor: '#cbd5e1' }} />
                              ) : hasTrips ? (
                                <Chip label={`${row.tripCount} trips`} size="small" sx={{ fontSize: '9px', height: '18px', bgcolor: '#dcfce7', color: '#166534', fontWeight: 800 }} />
                              ) : null}
                            </Box>
                          ) : (
                            display
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>

            {/* ── Summary Footer: Full FY Total (Σ) ── */}
            {monthsRows.length > 0 && (
              <tfoot>
                <tr style={{ position: 'sticky', bottom: 0, zIndex: 10, boxShadow: '0 -2px 8px rgba(0,0,0,0.08)' }}>
                  <td style={{
                    position: 'sticky', left: 0, zIndex: 12,
                    background: '#f8fafc', border: '1px solid #cbd5e1', borderTop: '2px solid #94a3b8',
                    padding: '8px 6px', textAlign: 'center',
                    fontWeight: 900, color: '#0f172a', fontSize: 12
                  }}>Σ</td>

                  {COLUMNS.map(col => {
                    const isSticky = col.key === 'MONTH';
                    const leftPx = isSticky ? stickyLeft[col.key] : undefined;

                    let cellContent = '—';
                    if (col.key === 'MONTH') {
                      cellContent = 'TOTAL (FULL FY)';
                    } else if (!['PAYMENT DATE', 'REMARKS', 'OTHER REASON', 'WITHHOLD REASON'].includes(col.key) && summaryTotals[col.key] !== undefined) {
                      cellContent = summaryTotals[col.key] !== 0
                        ? `₹${round2(summaryTotals[col.key]).toLocaleString('en-IN')}`
                        : (col.key === 'GST FCM' ? '—' : '₹0');
                    }

                    const isText = ['MONTH', 'REMARKS', 'OTHER REASON', 'WITHHOLD REASON'].includes(col.key);

                    return (
                      <td
                        key={col.key}
                        style={{
                          position: isSticky ? 'sticky' : undefined,
                          left: isSticky ? leftPx : undefined,
                          zIndex: isSticky ? 12 : 10,
                          padding: '8px 7px', border: '1px solid #cbd5e1', borderTop: '2px solid #94a3b8',
                          fontWeight: 900, fontSize: 13,
                          color: col.key === 'MONTH' ? '#0f172a' : '#1e293b',
                          textAlign: isText ? 'left' : 'right',
                          background: col.key === 'MONTH' ? '#f8fafc' : col.highlight ? col.highlight : '#f1f5f9',
                          fontFamily: !isText ? 'monospace' : 'inherit',
                        }}
                      >
                        {cellContent}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </Box>

      {/* ── Snackbar Feedback ── */}
      <Snackbar open={!!snack} autoHideDuration={4000} onClose={() => setSnack(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {snack && <Alert severity={snack.severity} variant="filled">{snack.msg}</Alert>}
      </Snackbar>
    </Box>
  );
}
