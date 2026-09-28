import React, { useState, useEffect, useMemo } from 'react';
import {
  Box, Typography, Button, IconButton, Select, MenuItem, TextField,
  CircularProgress, Paper, Tabs, Tab, Chip
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DownloadIcon from '@mui/icons-material/Download';
import PrintIcon from '@mui/icons-material/Print';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import axios from 'axios';
import { io } from 'socket.io-client';
import { exportToCsv } from '../utils/exportCsv';

const API_URL = import.meta.env.VITE_API_URL;
const SOCKET_URL = import.meta.env.VITE_SOCKET_IO_URL || import.meta.env.VITE_API_URL;

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
  // Party TDS Month & FY (Strictly Month-Wise, Defaults to current calendar month & FY):
  const [partyMonth, setPartyMonth] = useState(now.getMonth() + 1);
  const [partyFy, setPartyFy] = useState(`${currentFyStart}-${currentFyStart + 1}`);

  // Billing TDS Month & FY:
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1); // 1-12 or 'ALL'
  const [selYear, setSelYear] = useState(`${currentFyStart}-${currentFyStart + 1}`);
  const [searchTerm, setSearchTerm] = useState('');

  const [records, setRecords] = useState([]);
  const [uniqueOwnerCount, setUniqueOwnerCount] = useState(0);
  const [totalVehicles, setTotalVehicles] = useState(0);
  const [loading, setLoading] = useState(false);

  const yearOptions = useMemo(() => {
    const list = [];
    for (let y = currentFyStart - 2; y <= currentFyStart + 1; y++) {
      list.push(`${y}-${y + 1}`);
    }
    return list;
  }, [currentFyStart]);

  // Available months for selected Financial Year (April .. March)
  const partyMonthOptions = useMemo(() => {
    const fyStart = parseInt(partyFy.split('-')[0], 10);
    const monthsOrder = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
    return monthsOrder.map(m => {
      const calYear = m >= 4 ? fyStart : fyStart + 1;
      const monthName = MONTH_NAMES[m - 1];
      const titleMonth = monthName.charAt(0) + monthName.slice(1).toLowerCase();
      return {
        value: m,
        month: m,
        year: calYear,
        label: `${titleMonth} ${calYear}`
      };
    });
  }, [partyFy]);

  // Header string for Party TDS (e.g. "SEPTEMBER 2026")
  const partyMonthHeaderText = useMemo(() => {
    const fyStart = parseInt(partyFy.split('-')[0], 10);
    const calYear = partyMonth >= 4 ? fyStart : fyStart + 1;
    const monthName = MONTH_NAMES[partyMonth - 1] || 'SEPTEMBER';
    return `${monthName} ${calYear}`;
  }, [partyMonth, partyFy]);

  // Fetch Party TDS Report records from API (3 rows per registered vehicle)
  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const fyStart = parseInt(partyFy.split('-')[0], 10);
      const calYear = partyMonth >= 4 ? fyStart : fyStart + 1;
      const res = await axios.get(`${API_URL}/tds-reports/party-tds`, {
        params: {
          month: partyMonth,
          year: calYear,
          fy: partyFy,
          search: searchTerm
        },
        headers
      });

      if (res.data?.success) {
        setRecords(res.data.entries || []);
        setUniqueOwnerCount(res.data.uniqueOwnerCount || 0);
        setTotalVehicles(res.data.totalVehicles || 0);
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
  }, [mainTab, partyMonth, partyFy, billingSubTab, selMonth, selYear, searchTerm]);

  // ── Live WebSocket connection to automatically reflect updates ──
  useEffect(() => {
    let socket;
    try {
      socket = io(SOCKET_URL, { autoConnect: true, transports: ['websocket', 'polling'] });
      const handleLiveUpdate = () => {
        if (mainTab === 'BILLING_TDS') {
          fetchBillingTdsData();
        } else if (mainTab === 'PARTY_TDS') {
          fetchData();
        }
      };

      socket.on('fyDetailsUpdates', handleLiveUpdate);
      socket.on('cementUpdates', handleLiveUpdate);
      socket.on('partyPaymentUpdates', handleLiveUpdate);
      socket.on('truckContactsUpdates', handleLiveUpdate);
      socket.on('incentiveStateUpdates', handleLiveUpdate);
      socket.on('billRegisterUpdated', handleLiveUpdate);
      socket.on('partyTdsUpdated', handleLiveUpdate);
      socket.on('tdsDifferentialUpdated', handleLiveUpdate);
    } catch (e) {
      console.error('[TdsReports] Socket connection error:', e);
    }

    return () => {
      if (socket) {
        socket.off('fyDetailsUpdates');
        socket.off('cementUpdates');
        socket.off('partyPaymentUpdates');
        socket.off('truckContactsUpdates');
        socket.off('incentiveStateUpdates');
        socket.off('billRegisterUpdated');
        socket.off('partyTdsUpdated');
        socket.off('tdsDifferentialUpdated');
        socket.disconnect();
      }
    };
  }, [mainTab, partyMonth, partyFy, billingSubTab, selMonth, selYear, searchTerm]);

  // Pending uncommitted DIFFERENTIAL edits: { [rowKey]: { sourceType, selectedMonth, selectedYear, manualAmount } }
  const [pendingDiffEdits, setPendingDiffEdits] = useState({});
  const [savingRows, setSavingRows] = useState({}); // { [rowKey]: boolean }

  // Clear pending edits whenever main filters change
  useEffect(() => {
    setPendingDiffEdits({});
  }, [partyMonth, partyFy, mainTab]);

  // Handle dropdown change for DIFFERENTIAL row (Marks as PENDING edit, does NOT auto-save)
  const handleDifferentialSourceChange = (row, newSelectionVal) => {
    const oKey = (row.name || '').trim().toUpperCase();
    const vKey = (row.vehicleNo || '').trim();
    const rowKey = `${oKey}_${vKey}`;
    const isOthers = newSelectionVal === 'OTHERS';

    const fyStart = parseInt(partyFy.split('-')[0], 10);
    const calYear = partyMonth >= 4 ? fyStart : fyStart + 1;

    let sMonth = partyMonth;
    let sYear = calYear;

    if (!isOthers) {
      const [mStr, yStr] = newSelectionVal.split('_');
      sMonth = parseInt(mStr, 10);
      sYear = parseInt(yStr, 10);
    }

    const currentPending = pendingDiffEdits[rowKey] || {};
    const currentManual = currentPending.manualAmount !== undefined
      ? currentPending.manualAmount
      : (row.differentialConfig?.manualAmount || '');

    setPendingDiffEdits(prev => ({
      ...prev,
      [rowKey]: {
        sourceType: isOthers ? 'OTHERS' : 'MONTH',
        selectedMonth: sMonth,
        selectedYear: sYear,
        manualAmount: currentManual
      }
    }));
  };

  // Handle manual amount input for OTHERS (Marks as PENDING edit, does NOT auto-save)
  const handleDifferentialManualAmountChange = (row, rawVal) => {
    const oKey = (row.name || '').trim().toUpperCase();
    const vKey = (row.vehicleNo || '').trim();
    const rowKey = `${oKey}_${vKey}`;
    const currentPending = pendingDiffEdits[rowKey] || {};

    const fyStart = parseInt(partyFy.split('-')[0], 10);
    const calYear = partyMonth >= 4 ? fyStart : fyStart + 1;

    setPendingDiffEdits(prev => ({
      ...prev,
      [rowKey]: {
        sourceType: 'OTHERS',
        selectedMonth: currentPending.selectedMonth || row.differentialConfig?.selectedMonth || partyMonth,
        selectedYear: currentPending.selectedYear || row.differentialConfig?.selectedYear || calYear,
        manualAmount: rawVal
      }
    }));
  };

  // Save single DIFFERENTIAL row to MongoDB
  const handleSaveRow = async (row) => {
    const oKey = (row.name || '').trim().toUpperCase();
    const vKey = (row.vehicleNo || '').trim();
    const rowKey = `${oKey}_${vKey}`;
    const pending = pendingDiffEdits[rowKey];
    if (!pending) return;

    setSavingRows(prev => ({ ...prev, [rowKey]: true }));

    const fyStart = parseInt(partyFy.split('-')[0], 10);
    const calYear = partyMonth >= 4 ? fyStart : fyStart + 1;

    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      await axios.post(`${API_URL}/tds-reports/party-tds/differential-override`, {
        ownerName: row.name,
        vehicleNo: row.vehicleNo,
        fy: partyFy,
        reportMonth: partyMonth,
        reportYear: calYear,
        sourceType: pending.sourceType,
        sourceMonth: pending.selectedMonth,
        sourceYear: pending.selectedYear,
        manualAmount: pending.manualAmount
      }, { headers });

      // Update record in `records` state with newly persisted configuration
      setRecords(prev => prev.map(item => {
        if (item.billType === 'DIFFERENTIAL' && (item.name || '').trim().toUpperCase() === oKey && (item.vehicleNo || '').trim() === vKey) {
          const config = item.differentialConfig || {};
          const availableMonths = config.availableMonths || [];
          let newBasic = null;
          let note = 'AUTO';
          let autoStatus = 'AUTO';
          let sourceModule = 'Incentive Entry (Actual - Projected)';

          if (pending.sourceType === 'OTHERS') {
            note = 'MANUAL';
            autoStatus = 'MANUAL';
            sourceModule = 'Manual Others Entry';
            if (pending.manualAmount !== '' && pending.manualAmount !== null && pending.manualAmount !== undefined && !isNaN(Number(pending.manualAmount))) {
              newBasic = Number(pending.manualAmount);
            }
          } else {
            const matchedCandidate = availableMonths.find(c => c.month === pending.selectedMonth && c.year === pending.selectedYear);
            if (matchedCandidate && matchedCandidate.hasData && matchedCandidate.diff !== null) {
              newBasic = matchedCandidate.diff;
            }
          }

          const applicableTds = item.tdsPercent || 0;
          const calcTds = (amt) => {
            if (amt === null || amt === undefined || isNaN(amt) || !applicableTds || applicableTds <= 0) return 0;
            return Math.round((amt * (applicableTds / 100)) * 100) / 100;
          };
          const newTdsAmt = newBasic !== null ? calcTds(newBasic) : null;

          return {
            ...item,
            basicAmount: newBasic,
            tdsAmount: newTdsAmt,
            tdsDeducted: newTdsAmt,
            note,
            autoStatus,
            sourceModule,
            differentialConfig: {
              ...config,
              sourceType: pending.sourceType,
              selectedMonth: pending.selectedMonth,
              selectedYear: pending.selectedYear,
              manualAmount: pending.manualAmount
            }
          };
        }
        return item;
      }));

      // Clear from pending state
      setPendingDiffEdits(prev => {
        const next = { ...prev };
        delete next[rowKey];
        return next;
      });
    } catch (err) {
      console.error('[TdsReports] Failed to persist differential edit:', err);
    } finally {
      setSavingRows(prev => ({ ...prev, [rowKey]: false }));
    }
  };

  // Discard pending edit for a single row
  const handleDiscardRow = (row) => {
    const oKey = (row.name || '').trim().toUpperCase();
    const vKey = (row.vehicleNo || '').trim();
    const rowKey = `${oKey}_${vKey}`;
    setPendingDiffEdits(prev => {
      const next = { ...prev };
      delete next[rowKey];
      return next;
    });
  };

  // Discard all pending edits
  const handleDiscardAllPending = () => {
    setPendingDiffEdits({});
  };

  // Save all pending edits in a batch
  const handleSaveAllPending = async () => {
    const keys = Object.keys(pendingDiffEdits);
    if (keys.length === 0) return;

    const token = localStorage.getItem('token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const fyStart = parseInt(partyFy.split('-')[0], 10);
    const calYear = partyMonth >= 4 ? fyStart : fyStart + 1;

    for (const rowKey of keys) {
      const pending = pendingDiffEdits[rowKey];
      const matchedRow = records.find(r => r.billType === 'DIFFERENTIAL' && `${(r.name || '').trim().toUpperCase()}_${(r.vehicleNo || '').trim()}` === rowKey);
      if (matchedRow && pending) {
        try {
          await axios.post(`${API_URL}/tds-reports/party-tds/differential-override`, {
            ownerName: matchedRow.name,
            vehicleNo: matchedRow.vehicleNo,
            fy: partyFy,
            reportMonth: partyMonth,
            reportYear: calYear,
            sourceType: pending.sourceType,
            sourceMonth: pending.selectedMonth,
            sourceYear: pending.selectedYear,
            manualAmount: pending.manualAmount
          }, { headers });
        } catch (e) {
          console.error('[TdsReports] Batch save error for', rowKey, e);
        }
      }
    }

    setPendingDiffEdits({});
    fetchData();
  };

  // Ensure continuous SL NO if filtered locally
  const filteredRecords = useMemo(() => {
    let result = records;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      result = result.filter(r =>
        (r.name || '').toLowerCase().includes(term) ||
        (r.vehicleNo || '').toLowerCase().includes(term) ||
        (r.wheel || '').toLowerCase().includes(term) ||
        (r.panCardNumber || '').toLowerCase().includes(term) ||
        (r.aadharNo || '').toLowerCase().includes(term)
      );
    }
    return result.map((r, idx) => ({
      ...r,
      slNo: idx + 1
    }));
  }, [records, searchTerm]);

  // Dynamic Month/Year Header text for Billing TDS
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
      'Vehicle Number': r.vehicleNo || '-',
      'Wheel': r.wheel || '-',
      'Bill No.': r.billNo,
      'Bill date': r.billDate,
      'Bill type': r.billType === 'DIFFERENTIAL'
        ? (r.differentialConfig?.sourceType === 'OTHERS'
            ? 'DIFFERENTIAL (Others)'
            : `DIFFERENTIAL (${r.differentialConfig?.availableMonths?.find(c => c.month === r.differentialConfig?.selectedMonth && c.year === r.differentialConfig?.selectedYear)?.label || ''})`)
        : r.billType,
      'Basic Amount (Rs)': r.basicAmount !== null && r.basicAmount !== undefined ? r.basicAmount : '—',
      'Note': r.note || '-',
      'TDS (%)': `${r.tdsPercent}%`,
      'TDS Amount (Rs)': r.tdsAmount !== null && r.tdsAmount !== undefined ? r.tdsAmount : '—',
      'TDS Deducted (Rs)': r.tdsDeducted !== null && r.tdsDeducted !== undefined ? r.tdsDeducted : '—',
      'PAN CARD NUMBER': r.panCardNumber,
      'AADHAR NO': r.aadharNo,
      'AADHAAR - PAN LINKED': r.aadhaarPanLinked || (r.panCardNumber !== '-' && r.aadharNo !== '-' ? 'YES' : 'NO')
    }));
    exportToCsv(`PARTY_TDS_REPORT_${partyMonthHeaderText.replace(/\s+/g, '_')}.csv`, exportData);
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

  // Sticky header cell styles with solid opaque background and explicit borders
  const thStyle = {
    position: 'sticky',
    top: 0,
    zIndex: 10,
    backgroundColor: '#0f172a',
    color: '#ffffff',
    padding: '12px 10px',
    borderBottom: '2px solid #475569',
    borderRight: '1px solid #334155',
    borderTop: '1px solid #334155',
    borderLeft: '1px solid #334155',
    fontSize: '11px',
    fontWeight: 800,
    textTransform: 'uppercase',
    textAlign: 'center',
    whiteSpace: 'nowrap',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.25)'
  };

  const tdStyle = {
    padding: '8px 10px',
    borderBottom: '1px solid #cbd5e1',
    borderRight: '1px solid #cbd5e1',
    borderLeft: '1px solid #cbd5e1',
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
          .print-only { display: block !important; }
          .print-only-inline { display: inline !important; }
          .print-only-bg { background-color: #ffffff !important; color: #000000 !important; border: none !important; box-shadow: none !important; p: 0 !important; }
          table { width: 100% !important; border-collapse: collapse !important; color: #000000 !important; }
          th { position: static !important; background-color: #f1f5f9 !important; color: #000000 !important; border: 1px solid #000000 !important; font-size: 10pt !important; }
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
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              {/* Month Selector: [ Month: September 2026 ▼ ] */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" color="#94a3b8" fontWeight="700">Month:</Typography>
                <Select
                  size="small"
                  value={partyMonth}
                  onChange={(e) => setPartyMonth(Number(e.target.value))}
                  sx={{
                    bgcolor: '#1e293b',
                    color: '#fff',
                    fontWeight: 700,
                    borderRadius: 1,
                    minWidth: 175,
                    '.MuiOutlinedInput-notchedOutline': { borderColor: '#475569' },
                    '.MuiSvgIcon-root': { color: '#fff' }
                  }}
                >
                  {partyMonthOptions.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </Select>
              </Box>

              {/* Financial Year Selector */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" color="#94a3b8" fontWeight="700">Financial Year:</Typography>
                <Select
                  size="small"
                  value={partyFy}
                  onChange={(e) => setPartyFy(e.target.value)}
                  sx={{
                    bgcolor: '#1e293b',
                    color: '#fff',
                    fontWeight: 700,
                    borderRadius: 1,
                    minWidth: 130,
                    '.MuiOutlinedInput-notchedOutline': { borderColor: '#475569' },
                    '.MuiSvgIcon-root': { color: '#fff' }
                  }}
                >
                  {yearOptions.map((y) => (
                    <MenuItem key={y} value={y}>{y}</MenuItem>
                  ))}
                </Select>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: { xs: 0, md: 1 } }}>
                <Typography variant="body2" fontWeight="700" color="#38bdf8">
                  UNIQUE OWNERS: {uniqueOwnerCount}
                </Typography>
                <Typography variant="body2" color="#94a3b8" fontWeight="600" sx={{ ml: 0.5 }}>
                  ({filteredRecords.length} TOTAL ROWS)
                </Typography>
              </Box>
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
                  width: 250,
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
              p: { xs: 2, md: 3 },
              bgcolor: '#ffffff',
              color: '#0f172a',
              borderRadius: 2,
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
              overflow: 'visible'
            }}
          >
            {/* Header */}
            <Box sx={{ textAlign: 'center', mb: 2.5 }}>
              <Typography variant="h4" fontWeight="900" sx={{ letterSpacing: '1px', color: '#0f172a', textTransform: 'uppercase' }}>
                DIPALI ASSOCIATES &amp; CO.
              </Typography>
              <Typography variant="h6" fontWeight="800" sx={{ letterSpacing: '0.5px', color: '#334155', mt: 0.5 }}>
                PARTY TDS REPORT — {partyMonthHeaderText}
              </Typography>
              <Typography variant="subtitle1" fontWeight="700" sx={{ color: '#475569', mt: 0.5, fontStyle: 'italic' }}>
                {uniqueOwnerCount} UNIQUE OWNERS — {totalVehicles || Math.round(filteredRecords.length / 3)} VEHICLES ({filteredRecords.length} TOTAL ROWS)
              </Typography>
            </Box>

            {/* ── Visual Separator & DIFFERENTIAL Controls Info Bar ── */}
            <Box
              className="no-print"
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                p: 1.5,
                mb: 2,
                bgcolor: Object.keys(pendingDiffEdits).length > 0 ? '#fffbeb' : '#f8fafc',
                border: '1px solid',
                borderColor: Object.keys(pendingDiffEdits).length > 0 ? '#fde68a' : '#e2e8f0',
                borderRadius: 2,
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                flexWrap: 'wrap',
                gap: 1.5
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, color: Object.keys(pendingDiffEdits).length > 0 ? '#b45309' : '#1e293b' }}>
                  {Object.keys(pendingDiffEdits).length > 0
                    ? `⚠️ ${Object.keys(pendingDiffEdits).length} Unsaved DIFFERENTIAL Edit(s) Pending`
                    : '📋 DIFFERENTIAL ENTRY & TDS EDIT CONTROLS'}
                </Typography>
                <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                  Select month or enter manual Others amount in the table below, then click SAVE to persist to MongoDB database.
                </Typography>
              </Box>

              {Object.keys(pendingDiffEdits).length > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={handleSaveAllPending}
                    sx={{
                      height: 28,
                      px: 2,
                      fontWeight: 800,
                      fontSize: '11px',
                      bgcolor: '#059669',
                      color: '#ffffff',
                      textTransform: 'none',
                      borderRadius: 1,
                      '&:hover': { bgcolor: '#047857' }
                    }}
                  >
                    SAVE ALL PENDING ({Object.keys(pendingDiffEdits).length})
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={handleDiscardAllPending}
                    sx={{
                      height: 28,
                      px: 1.5,
                      fontWeight: 700,
                      fontSize: '11px',
                      color: '#64748b',
                      borderColor: '#cbd5e1',
                      textTransform: 'none',
                      borderRadius: 1,
                      '&:hover': { bgcolor: '#f1f5f9' }
                    }}
                  >
                    Discard All
                  </Button>
                </Box>
              )}
            </Box>

            {/* Table Container with Continuous Vertical & Horizontal Scroll and Sticky Header */}
            <Box
              sx={{
                overflowX: 'auto',
                overflowY: 'auto',
                maxHeight: 'calc(100vh - 270px)',
                minHeight: 420,
                position: 'relative',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                '&::-webkit-scrollbar': {
                  width: '8px',
                  height: '8px'
                },
                '&::-webkit-scrollbar-track': {
                  backgroundColor: '#f1f5f9'
                },
                '&::-webkit-scrollbar-thumb': {
                  backgroundColor: '#94a3b8',
                  borderRadius: '4px'
                }
              }}
            >
              {loading && (
                <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(255,255,255,0.7)', zIndex: 30 }}>
                  <CircularProgress color="primary" />
                </Box>
              )}

              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontFamily: 'Inter, system-ui, sans-serif' }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: '55px' }}>SL NO</th>
                    <th style={{ ...thStyle, textAlign: 'left', minWidth: '160px' }}>Name</th>
                    <th style={{ ...thStyle, minWidth: '130px' }}>Vehicle Number</th>
                    <th style={{ ...thStyle, minWidth: '75px' }}>Wheel</th>
                    <th style={{ ...thStyle, textAlign: 'left', minWidth: '110px' }}>Bill No.</th>
                    <th style={{ ...thStyle, minWidth: '100px' }}>Bill date</th>
                    <th style={{ ...thStyle, minWidth: '190px' }}>Bill type</th>
                    <th style={{ ...thStyle, textAlign: 'right', minWidth: '150px' }}>Basic Amount</th>
                    <th style={{ ...thStyle, minWidth: '120px' }}>Note</th>
                    <th style={{ ...thStyle, width: '75px' }}>TDS (%)</th>
                    <th style={{ ...thStyle, textAlign: 'right', minWidth: '120px' }}>TDS Amount</th>
                    <th style={{ ...thStyle, textAlign: 'right', minWidth: '120px' }}>TDS Deducted</th>
                    <th style={{ ...thStyle, minWidth: '140px' }}>PAN CARD NUMBER</th>
                    <th style={{ ...thStyle, minWidth: '140px' }}>AADHAR NO</th>
                    <th style={{ ...thStyle, minWidth: '150px' }}>AADHAAR - PAN LINKED</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.length === 0 && !loading && (
                    <tr>
                      <td colSpan={15} style={{ textAlign: 'center', padding: '48px', color: '#64748b', fontWeight: 600 }}>
                        No owners found in MongoDB Owner Details database.
                      </td>
                    </tr>
                  )}

                  {(() => {
                    let vehicleGroupIdx = 0;
                    return filteredRecords.map((r, index) => {
                      const isFirstInVeh = r.vehicleIndexRow === 1;
                      if (isFirstInVeh) {
                        vehicleGroupIdx++;
                      }
                      const rowBg = vehicleGroupIdx % 2 === 1 ? '#ffffff' : '#f8fafc';
                      const isGroupEnd = r.isLastOfVehicle || false;
                      const isDiff = r.billType === 'DIFFERENTIAL';

                      const oKey = (r.name || '').trim().toUpperCase();
                      const vKey = (r.vehicleNo || '').trim();
                      const rowKey = `${oKey}_${vKey}`;
                      const pending = isDiff ? pendingDiffEdits[rowKey] : null;
                      const isRowDirty = isDiff && !!pending;
                      const isRowSaving = isDiff && !!savingRows[rowKey];

                      const currentSourceType = pending ? pending.sourceType : (r.differentialConfig?.sourceType || 'MONTH');
                      const currentSelectedMonth = pending ? pending.selectedMonth : (r.differentialConfig?.selectedMonth || partyMonth);
                      const currentSelectedYear = pending ? pending.selectedYear : (r.differentialConfig?.selectedYear || (partyMonth >= 4 ? parseInt(partyFy.split('-')[0], 10) : parseInt(partyFy.split('-')[0], 10) + 1));
                      const currentManualAmount = pending ? pending.manualAmount : (r.differentialConfig?.manualAmount !== undefined ? r.differentialConfig.manualAmount : '');

                      // Calculate effective preview basic amount
                      let displayBasicAmt = r.basicAmount;
                      let displayTdsAmt = r.tdsAmount;
                      let displayTdsDeducted = r.tdsDeducted;

                      if (isDiff && pending) {
                        const config = r.differentialConfig || {};
                        const availableMonths = config.availableMonths || [];
                        let tempBasic = null;
                        if (currentSourceType === 'OTHERS') {
                          if (currentManualAmount !== '' && currentManualAmount !== null && !isNaN(Number(currentManualAmount))) {
                            tempBasic = Number(currentManualAmount);
                          }
                        } else {
                          const matchedCandidate = availableMonths.find(c => c.month === currentSelectedMonth && c.year === currentSelectedYear);
                          if (matchedCandidate && matchedCandidate.hasData && matchedCandidate.diff !== null) {
                            tempBasic = matchedCandidate.diff;
                          }
                        }
                        displayBasicAmt = tempBasic;
                        const applicableTds = r.tdsPercent || 0;
                        const calcTds = (amt) => {
                          if (amt === null || amt === undefined || isNaN(amt) || !applicableTds || applicableTds <= 0) return 0;
                          return Math.round((amt * (applicableTds / 100)) * 100) / 100;
                        };
                        displayTdsAmt = tempBasic !== null ? calcTds(tempBasic) : null;
                        displayTdsDeducted = displayTdsAmt;
                      }

                      return (
                        <tr
                          key={index}
                          style={{
                            backgroundColor: isRowDirty ? '#fefce8' : rowBg,
                            borderBottom: isGroupEnd ? '2px solid #94a3b8' : '1px solid #e2e8f0'
                          }}
                        >
                          {/* 1. SL NO */}
                          <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 800, color: '#475569' }}>
                            {r.slNo}
                          </td>

                          {/* 2. Name (Owner Name) */}
                          <td style={{ ...tdStyle, fontWeight: 700, color: '#0f172a' }}>
                            {isFirstInVeh ? r.name : ''}
                          </td>

                          {/* 3. Vehicle Number */}
                          <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, color: '#1e293b', letterSpacing: '0.5px' }}>
                            {isFirstInVeh ? (r.vehicleNo || '-') : ''}
                          </td>

                          {/* 4. Wheel */}
                          <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, color: '#0369a1' }}>
                            {isFirstInVeh ? (r.wheel || '-') : ''}
                          </td>

                          {/* 5. Bill No. */}
                          <td style={{ ...tdStyle, fontWeight: 600, color: '#334155' }}>
                            {r.billNo}
                          </td>

                          {/* 6. Bill date */}
                          <td style={{ ...tdStyle, textAlign: 'center', color: '#334155' }}>
                            {r.billDate}
                          </td>

                          {/* 7. Bill type & Dropdown for DIFFERENTIAL */}
                          <td style={{ ...tdStyle, textAlign: 'center', color: '#475569', fontWeight: 600 }}>
                            {isDiff ? (
                              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, py: 0.5 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <Typography variant="body2" sx={{ fontWeight: 800, color: '#0f172a', fontSize: '11px', letterSpacing: '0.3px' }}>
                                    DIFFERENTIAL
                                  </Typography>
                                  {isRowDirty && (
                                    <Chip
                                      label="UNSAVED"
                                      size="small"
                                      sx={{
                                        height: 16,
                                        fontSize: '9px',
                                        fontWeight: 900,
                                        bgcolor: '#fee2e2',
                                        color: '#b91c1c',
                                        border: '1px solid #fca5a5'
                                      }}
                                    />
                                  )}
                                </Box>
                                <Box className="no-print" sx={{ width: '100%' }}>
                                  <Select
                                    size="small"
                                    value={
                                      currentSourceType === 'OTHERS'
                                        ? 'OTHERS'
                                        : `${currentSelectedMonth}_${currentSelectedYear}`
                                    }
                                    onChange={(e) => handleDifferentialSourceChange(r, e.target.value)}
                                    sx={{
                                      height: 26,
                                      fontSize: '11px',
                                      fontWeight: 700,
                                      bgcolor: currentSourceType === 'OTHERS' ? '#fffbeb' : '#f0f9ff',
                                      color: currentSourceType === 'OTHERS' ? '#b45309' : '#0369a1',
                                      borderRadius: '6px',
                                      width: '100%',
                                      minWidth: 145,
                                      '.MuiSelect-select': { py: '2px', px: '6px' },
                                      '.MuiOutlinedInput-notchedOutline': {
                                        borderColor: isRowDirty ? '#f59e0b' : (currentSourceType === 'OTHERS' ? '#fde68a' : '#bae6fd'),
                                        borderWidth: isRowDirty ? '2px' : '1px'
                                      },
                                      '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#38bdf8' }
                                    }}
                                  >
                                    {(r.differentialConfig?.availableMonths || []).map((cand) => (
                                      <MenuItem key={`${cand.month}_${cand.year}`} value={`${cand.month}_${cand.year}`} sx={{ fontSize: '12px', fontWeight: 600 }}>
                                        {cand.label}
                                      </MenuItem>
                                    ))}
                                    <MenuItem value="OTHERS" sx={{ fontSize: '12px', fontWeight: 700, color: '#b45309' }}>
                                      Others
                                    </MenuItem>
                                  </Select>
                                </Box>
                                <Box className="print-only" sx={{ display: 'none', fontSize: '10px', fontWeight: 700, color: '#334155' }}>
                                  {currentSourceType === 'OTHERS'
                                    ? '(Others)'
                                    : `(${r.differentialConfig?.availableMonths?.find(c => c.month === currentSelectedMonth && c.year === currentSelectedYear)?.label || ''})`}
                                </Box>
                              </Box>
                            ) : (
                              r.billType
                            )}
                          </td>

                          {/* 8. Basic Amount & Save Action */}
                          <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                            {isDiff ? (
                              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
                                {currentSourceType === 'OTHERS' ? (
                                  <Box className="no-print" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 800, fontSize: '12px', color: '#b45309' }}>₹</Typography>
                                    <TextField
                                      size="small"
                                      type="number"
                                      placeholder="0.00"
                                      value={currentManualAmount !== undefined && currentManualAmount !== null ? currentManualAmount : ''}
                                      onChange={(e) => handleDifferentialManualAmountChange(r, e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          handleSaveRow(r);
                                        }
                                      }}
                                      sx={{
                                        width: 105,
                                        bgcolor: '#ffffff',
                                        borderRadius: '4px',
                                        input: {
                                          py: '2px',
                                          px: '6px',
                                          fontSize: '12px',
                                          fontWeight: 800,
                                          textAlign: 'right',
                                          color: '#0f172a'
                                        },
                                        '.MuiOutlinedInput-notchedOutline': { borderColor: isRowDirty ? '#f59e0b' : '#cbd5e1' }
                                      }}
                                    />
                                  </Box>
                                ) : (
                                  <Typography variant="body2" sx={{ fontWeight: 800, fontSize: '12px', color: '#0f172a' }}>
                                    {displayBasicAmt !== null && displayBasicAmt !== undefined ? `₹${formatAmt(displayBasicAmt)}` : <span style={{ color: '#94a3b8', fontWeight: 500 }}>—</span>}
                                  </Typography>
                                )}

                                {/* Row-Level SAVE Button when dirty / unsaved */}
                                {isRowDirty && (
                                  <Box className="no-print" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                                    <Button
                                      size="small"
                                      variant="contained"
                                      disabled={isRowSaving}
                                      onClick={() => handleSaveRow(r)}
                                      sx={{
                                        height: 22,
                                        px: 1,
                                        fontSize: '10px',
                                        fontWeight: 800,
                                        bgcolor: '#059669',
                                        color: '#ffffff',
                                        borderRadius: '4px',
                                        textTransform: 'none',
                                        minWidth: 50,
                                        '&:hover': { bgcolor: '#047857' }
                                      }}
                                    >
                                      {isRowSaving ? 'Saving...' : 'SAVE'}
                                    </Button>
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      onClick={() => handleDiscardRow(r)}
                                      sx={{
                                        height: 22,
                                        px: 0.5,
                                        fontSize: '9px',
                                        fontWeight: 700,
                                        color: '#64748b',
                                        borderColor: '#cbd5e1',
                                        borderRadius: '4px',
                                        textTransform: 'none',
                                        minWidth: 40,
                                        '&:hover': { bgcolor: '#f1f5f9', borderColor: '#94a3b8' }
                                      }}
                                    >
                                      Cancel
                                    </Button>
                                  </Box>
                                )}

                                <Box className="print-only" sx={{ display: 'none', fontWeight: 800 }}>
                                  {displayBasicAmt !== null && displayBasicAmt !== undefined ? `₹${formatAmt(displayBasicAmt)}` : '—'}
                                </Box>
                              </Box>
                            ) : (
                              r.basicAmount !== null && r.basicAmount !== undefined ? (
                                `₹${formatAmt(r.basicAmount)}`
                              ) : (
                                <span style={{ color: '#94a3b8', fontWeight: 500 }}>—</span>
                              )
                            )}
                          </td>

                          {/* 9. Note / AUTO UPDATED Indicator */}
                          <td style={{ ...tdStyle, textAlign: 'center', whiteSpace: 'nowrap' }}>
                            {isDiff ? (
                              currentSourceType === 'OTHERS' ? (
                                <Chip
                                  label="MANUAL OTHERS"
                                  size="small"
                                  sx={{
                                    height: 20,
                                    fontSize: '10px',
                                    fontWeight: 800,
                                    bgcolor: '#fef3c7',
                                    color: '#b45309',
                                    border: '1px solid #fde68a',
                                    letterSpacing: '0.3px'
                                  }}
                                />
                              ) : displayBasicAmt !== null ? (
                                <Chip
                                  label={currentSelectedMonth === partyMonth ? "AUTO (CURRENT)" : "AUTO (PREV)"}
                                  size="small"
                                  sx={{
                                    height: 20,
                                    fontSize: '10px',
                                    fontWeight: 800,
                                    bgcolor: '#e0f2fe',
                                    color: '#0369a1',
                                    border: '1px solid #7dd3fc',
                                    letterSpacing: '0.3px'
                                  }}
                                />
                              ) : (
                                <Chip
                                  label="NO DATA"
                                  size="small"
                                  sx={{
                                    height: 20,
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    bgcolor: '#f1f5f9',
                                    color: '#64748b',
                                    border: '1px solid #e2e8f0',
                                    letterSpacing: '0.3px'
                                  }}
                                />
                              )
                            ) : (r.autoStatus === 'AUTO UPDATED' || r.note === 'AUTO UPDATED') ? (
                              <Chip
                                label="AUTO UPDATED"
                                size="small"
                                sx={{
                                  height: 20,
                                  fontSize: '10px',
                                  fontWeight: 800,
                                  bgcolor: '#dcfce7',
                                  color: '#15803d',
                                  border: '1px solid #86efac',
                                  letterSpacing: '0.3px'
                                }}
                              />
                            ) : (r.autoStatus === 'AUTO CALCULATED' || r.note === 'AUTO CALCULATED') ? (
                              <Chip
                                label="AUTO"
                                size="small"
                                sx={{
                                  height: 20,
                                  fontSize: '10px',
                                  fontWeight: 800,
                                  bgcolor: '#e0f2fe',
                                  color: '#0369a1',
                                  border: '1px solid #7dd3fc',
                                  letterSpacing: '0.3px'
                                }}
                              />
                            ) : (
                              <Typography variant="body2" sx={{ fontSize: '12px', color: '#475569', fontWeight: 600 }}>
                                {r.note || '-'}
                              </Typography>
                            )}
                          </td>

                          {/* 10. TDS (%) */}
                          <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, color: '#0284c7' }}>
                            {r.tdsPercent}%
                          </td>

                          {/* 11. TDS Amount */}
                          <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#b45309' }}>
                            {displayTdsAmt !== null && displayTdsAmt !== undefined ? `₹${formatAmt(displayTdsAmt)}` : <span style={{ color: '#94a3b8', fontWeight: 500 }}>—</span>}
                          </td>

                          {/* 12. TDS Deducted */}
                          <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: '#047857' }}>
                            {displayTdsDeducted !== null && displayTdsDeducted !== undefined ? `₹${formatAmt(displayTdsDeducted)}` : <span style={{ color: '#94a3b8', fontWeight: 500 }}>—</span>}
                          </td>

                          {/* 13. PAN CARD NUMBER */}
                          <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, letterSpacing: '0.5px', color: '#1e293b' }}>
                            {isFirstInVeh ? r.panCardNumber : ''}
                          </td>

                          {/* 14. AADHAR NO */}
                          <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600, color: '#475569' }}>
                            {isFirstInVeh ? r.aadharNo : ''}
                          </td>

                          {/* 15. AADHAAR - PAN LINKED */}
                          <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 800, color: (r.aadhaarPanLinked === 'YES' || r.aadhaarPanLinked === 'Yes') ? '#15803d' : '#b91c1c' }}>
                            {isFirstInVeh ? r.aadhaarPanLinked : ''}
                          </td>
                        </tr>
                      );
                    });
                  })()}
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
                        key={r.id || r._id || r.billNo || index}
                        data-record-id={r.id || r._id}
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
