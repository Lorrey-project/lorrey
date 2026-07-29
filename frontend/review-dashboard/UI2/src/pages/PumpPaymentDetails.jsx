import React, { useEffect, useState, useCallback, useMemo } from 'react';
import SearchableSelect from '../components/SearchableSelect';
import {
  Box, Button, CircularProgress, Typography, IconButton,
  Snackbar, Alert, Chip, Tooltip, Select, MenuItem, FormControl,
  InputLabel, TextField, Divider, Card, CardContent, useMediaQuery, Grid, Paper,
  Checkbox, Dialog, DialogTitle, DialogContent, DialogActions, Table, TableBody, TableCell, TableContainer, TableHead, TableRow
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import DescriptionIcon from '@mui/icons-material/Description';
import AutoPdfRegenerator from '../components/AutoPdfRegenerator';
import axios from 'axios';
import { exportToCsv } from '../utils/exportCsv';
import { useAuth } from '../context/AuthContext';
import { useShortcut } from '../context/ShortcutContext';
import { useTableNavigation } from '../hooks/useTableNavigation';
import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL;
const SOCKET_URL = import.meta.env.VITE_SOCKET_IO_URL || import.meta.env.VITE_API_URL;
const socket = io(SOCKET_URL, {
    autoConnect: true,
    transports: ["websocket", "polling"]
});
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const PERIODS = [
  { value: 0, label: 'All (Full Month)' },
  { value: 1, label: 'Period 1 (1 – 10)' },
  { value: 2, label: 'Period 2 (11 – 20)' },
  { value: 3, label: 'Period 3 (21 – End)' },
];

function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
function round2(n) { return Math.round(num(n) * 100) / 100; }

function formatDate(val) {
  if (!val) return '';
  let d;
  if (val instanceof Date) { d = val; }
  else if (typeof val === 'string') {
    const parts = val.split('-');
    if (parts.length === 3 && parts[2].length === 4)
      d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    else d = new Date(val);
  } else { d = new Date(val); }
  if (isNaN(d.getTime())) return String(val);
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

function shortDate(val) {
  // "21.03.26"
  if (!val) return '';
  let d;
  if (val instanceof Date) { d = val; }
  else if (typeof val === 'string') {
    const parts = val.split('-');
    if (parts.length === 3 && parts[2].length === 4)
      d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    else d = new Date(val);
  } else { d = new Date(val); }
  if (isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getFullYear()).slice(2)}`;
}

function getPeriodRange(period, month, year) {
  const lastDay = new Date(year, month, 0).getDate();
  const startDay = period === 0 ? 1 : period === 1 ? 1 : period === 2 ? 11 : 21;
  const endDay = period === 0 ? lastDay : period === 1 ? 10 : period === 2 ? 20 : lastDay;
  return { startDay, endDay };
}

// All columns are read-only — only PAYMENT STATUS is interactive (office admin only)
const COLUMNS = [
  { key: 'LOADING DATE', label: 'Loading Date', width: 110, editable: false, calc: false },
  { key: 'VEHICLE NUMBER', label: 'Vehicle No', width: 130, editable: false, calc: false },
  { key: 'PUMP NAME', label: 'Pump Name', width: 100, editable: false, calc: false },
  { key: 'HSD SLIP NO', label: 'HSD Slip No', width: 100, editable: false, calc: false },
  { key: 'HSD BILL NO', label: 'HSD Bill No', width: 140, editable: false, calc: false },
  { key: 'HSD (LTR)', label: 'HSD (Ltr)', width: 90, editable: false, calc: false },
  { key: 'VERIFICATION STATUS', label: 'Verification Status', width: 130, editable: false, calc: false },
  { key: 'VERIFICATION CODE', label: 'Verification Code', width: 140, editable: false, calc: false, custom: true },
  { key: 'HSD RATE', label: 'HSD Rate', width: 90, editable: false, calc: false },
  {
    key: 'HSD AMOUNT', label: 'HSD Amount', width: 120, editable: false, calc: true,
    formula: r => round2(num(r['HSD (LTR)']) * num(r['HSD RATE']))
  },
  { key: 'PAYMENT STATUS', label: 'Payment Status', width: 180, editable: false, calc: false, custom: true },
];

export default function PumpPaymentDetails({ onBack, lockedPump = null }) {
  const { user } = useAuth();
  const isMobile = useMediaQuery('(max-width:960px)');
  const isPumpAdmin = user?.role === 'PETROL PUMP';
  const isOfficeAdmin = user?.role === 'OFFICE' || user?.role === 'HEAD_OFFICE';

  // Port-based Auto Detection
  const autoPump = window.location.port === '5175' ? 'SAS-1' : window.location.port === '5176' ? 'SAS-2' : null;
  const effectiveLockedPump = autoPump || lockedPump;

  const now = new Date();
  const currentFyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const currentDay = now.getDate();
  const [selPump, setSelPump] = useState(effectiveLockedPump || '');
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1);
  const [selYear, setSelYear] = useState(`${currentFyStart}-${currentFyStart + 1}`);
  const [selPeriod, setSelPeriod] = useState(currentDay <= 10 ? 1 : currentDay <= 20 ? 2 : 3);
  const [hsdBillNo, setHsdBillNo] = useState('');
  const [localEdits, setLocalEdits] = useState({});

  const [pumps, setPumps] = useState([]);
  const [rows, setRows] = useState([]);
  const [loadingPumps, setLoadingPumps] = useState(true);

  const tableContainerRef = React.useRef(null);
  useTableNavigation(tableContainerRef);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState(null);
  const [isNotified, setIsNotified] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [allNotifications, setAllNotifications] = useState([]);
  // Period-level bulk payment (Office Admin sets, Pump Admin sees)
  const [periodPaymentStatus, setPeriodPaymentStatus] = useState('Unpaid');
  const [periodProofUrls, setPeriodProofUrls] = useState([]); // array of uploaded proof URLs
  const [periodUploading, setPeriodUploading] = useState(false);

  // Verification Code typed directly in the table
  const [verificationCodes, setVerificationCodes] = useState({});
  // Pump's own config (name + fuel rate) — fetched from /auth/me
  const [pumpConfig, setPumpConfig] = useState({ pumpName: null, fuelRate: 90 });
  // Map of specific fuel prices for all pumps
  const [fuelRatesMap, setFuelRatesMap] = useState({});
  // partitioning for pump admin
  const [pumpTab, setPumpTab] = useState('today'); // 'today', 'expired' or 'all'

  // Batch Billing State
  const [selectedRowIds, setSelectedRowIds] = useState([]);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [batchBillingSaving, setBatchBillingSaving] = useState(false);
  const [batchBillDate, setBatchBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [nextBillNumber, setNextBillNumber] = useState('');

  useEffect(() => {
    if (batchDialogOpen && batchBillDate && selPump) {
      axios.get(`${API_URL}/pump-payment/next-batch-bill-number`, {
        params: { pumpName: selPump, billDate: batchBillDate },
        headers: { Authorization: `Bearer ${token()}` }
      }).then(r => {
        if (r.data.success) {
          setNextBillNumber(r.data.nextBillNumber);
        }
      }).catch(console.error);
    }
  }, [batchDialogOpen, batchBillDate, selPump]);

  const yearOptions = [];
  for (let y = currentFyStart - 2; y <= currentFyStart + 1; y++) yearOptions.push(`${y}-${y + 1}`);

  const token = () => localStorage.getItem('token');
  const dirtyCount = Object.keys(localEdits).length;

  // ── Fetch pump admin's own config (pumpName + fuelRate) on mount ──────
  useEffect(() => {
    if (!isPumpAdmin) return;
    axios.get(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => {
        if (r.data.success) {
          const u = r.data.user;
          setPumpConfig({
            pumpName: u.pumpName || null,
            fuelRate: u.fuelRate ?? 90
          });
          // Auto-select this pump's pump name in the filter
          if (u.pumpName && !lockedPump) setSelPump(u.pumpName);
        }
      })
      .catch(console.error);
  }, [isPumpAdmin]);

  const [regeneratingInvoiceId, setRegeneratingInvoiceId] = useState(null);

  // ── Fetch distinct pump names ──────────────────────────────────────────
  useEffect(() => {
    axios.get(`${API_URL}/pump-payment/pumps`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => {
        if (r.data.success) {
          setPumps(r.data.pumps);

          // Port-based Auto Detection
          const autoPump = window.location.port === '5175' ? 'SAS-1' : window.location.port === '5176' ? 'SAS-2' : null;

          if (autoPump && r.data.pumps.includes(autoPump)) {
            setSelPump(autoPump);
          } else if (lockedPump) {
            setSelPump(lockedPump);
          } else if (autoPump) {
            setSelPump(autoPump);
          } else if (r.data.pumps.length > 0) {
            setSelPump(r.data.pumps[0]);
          }
        }
      }).catch(console.error)
      .finally(() => setLoadingPumps(false));
  }, []);

  // ── Fetch global fuel rates ──────────────────────────────────────────
  useEffect(() => {
    axios.get(`${API_URL}/pump-payment/fuel-rates`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => {
        if (r.data.success) {
          setFuelRatesMap(r.data.rates || {});
        }
      }).catch(console.error);
  }, []);

  // ── Fetch cement data + saved overrides for selected filters ───────────
  const fetchData = useCallback(async () => {
    if (!selPump) return;
    setLoading(true);
    setLocalEdits({});
    const fyStartYear = parseInt(selYear.split('-')[0], 10);
    const calendarYear = selMonth >= 4 ? fyStartYear : fyStartYear + 1;
    try {
      const params = { pumpName: selPump, month: selMonth, year: calendarYear, period: selPeriod };

      // Debug: log what pump names and sample entries look like in DB
      axios.get(`${API_URL}/pump-payment/debug`, {
        params: { pumpName: selPump },
        headers: { Authorization: `Bearer ${token()}` }
      }).then(r => {
        console.log('[PumpPayment Debug]', r.data);
      }).catch(() => { });

      const [cRes, sRes] = await Promise.all([
        axios.get(`${API_URL}/pump-payment/cement-data`, { params, headers: { Authorization: `Bearer ${token()}` } }),
        axios.get(`${API_URL}/pump-payment/saved`, { params, headers: { Authorization: `Bearer ${token()}` } }),
      ]);

      const cEntries = cRes.data.entries || [];
      const savedRecs = sRes.data.records || [];

      // Build a map: slipNo → saved record
      const savedMap = {};
      savedRecs.forEach(s => { savedMap[s['HSD SLIP NO']] = s; });

      // If saved records exist, auto-fill hsdBillNo from first record
      if (savedRecs.length > 0 && savedRecs[0].hsdBillNo) setHsdBillNo(savedRecs[0].hsdBillNo);

      // Merge: cement row + any saved overrides
      const merged = cEntries.map((entry) => {
        const slip = entry['HSD SLIP NO'];
        const saved = savedMap[slip];
        const vStatus = entry['VERIFICATION STATUS'] || 'Not Verified';
        return {
          _cementId: String(entry._id),
          _invoiceId: entry._invoiceId,
          'LOADING DATE': formatDate(entry['LOADING DT'] || entry['LOADING DATE']),
          'VEHICLE NUMBER': entry['VEHICLE NUMBER'] || '',
          'PUMP NAME': entry['PUMP NAME'] || '',
          'HSD SLIP NO': slip || '',
          'HSD BILL NO': saved?.['HSD BILL NO'] || entry['HSD BILL NO'] || '',
          'HSD (LTR)': saved?.['HSD (LTR)'] ?? (entry['HSD (LTR)'] ?? ''),
          'HSD RATE': saved?.['HSD RATE'] ?? (vStatus === 'Verified' ? (entry['HSD RATE'] ?? '') : 0),
          'HSD AMOUNT': '',
          'VERIFICATION STATUS': vStatus,
          'PAYMENT STATUS': saved?.paymentStatus || 'Unpaid',
          'PAYMENT PROOF URL': saved?.paymentProofUrl || '',
          'CHALLAN STATUS': entry['CHALLAN STATUS'] || '',
        };
      });
      // For pump admins: hide rows that have no vehicle number AND no HSD litres
      // (these are ghost/dummy entries with nothing actionable to verify)
      const filtered = isPumpAdmin
        ? merged.filter(r => r['VEHICLE NUMBER'] || (r['HSD (LTR)'] !== '' && r['HSD (LTR)'] !== 0 && r['HSD (LTR)'] !== null && r['HSD (LTR)'] !== undefined))
        : merged;
      setRows(filtered);
    } catch (err) {
      console.error('Fetch error:', err);
      setSnack({ severity: 'error', msg: 'Fetch failed: ' + (err.response?.data?.error || err.message) });
    } finally { setLoading(false); }
  }, [selPump, selMonth, selYear, selPeriod]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Fetch notification status for current period ────────────────────────────────
  const fetchNotificationStatus = useCallback(async () => {
    if (!selPump) return;
    const fyStartYear = parseInt(selYear.split('-')[0], 10);
    const calendarYear = selMonth >= 4 ? fyStartYear : fyStartYear + 1;
    try {
      const { data } = await axios.get(`${API_URL}/pump-payment/notification-status`, {
        params: { pumpName: selPump, month: selMonth, year: calendarYear, period: selPeriod },
        headers: { Authorization: `Bearer ${token()}` }
      });
      setIsNotified(data.notified || false);
    } catch { setIsNotified(false); }
  }, [selPump, selMonth, selYear, selPeriod]);

  useEffect(() => { fetchNotificationStatus(); }, [fetchNotificationStatus]);

  // ── Fetch period-level bulk payment status ───────────────────────────────────────
  const fetchPeriodPaymentStatus = useCallback(async () => {
    if (!selPump) return;
    const fyStartYear = parseInt(selYear.split('-')[0], 10);
    const calendarYear = selMonth >= 4 ? fyStartYear : fyStartYear + 1;
    try {
      const { data } = await axios.get(`${API_URL}/pump-payment/period-payment-status`, {
        params: { pumpName: selPump, month: selMonth, year: calendarYear, period: selPeriod },
        headers: { Authorization: `Bearer ${token()}` }
      });
      if (data.success) {
        setPeriodPaymentStatus(data.status || 'Unpaid');
        setPeriodProofUrls(data.proofUrls || []);
      }
    } catch { }
  }, [selPump, selMonth, selYear, selPeriod]);

  useEffect(() => { fetchPeriodPaymentStatus(); }, [fetchPeriodPaymentStatus]);

  // ── Fetch ALL notifications (Office Admin global view) ─────────────────────────
  const fetchAllNotifications = useCallback(async () => {
    if (!isOfficeAdmin) return;
    try {
      const { data } = await axios.get(`${API_URL}/pump-payment/all-notifications`, {
        headers: { Authorization: `Bearer ${token()}` }
      });
      if (data.success) setAllNotifications(data.notifications || []);
    } catch { }
  }, [isOfficeAdmin]);

  useEffect(() => { fetchAllNotifications(); }, [fetchAllNotifications]);

  // ── Auto-Refresh Listener (cement updates + live payment notifications) ────────
  useEffect(() => {
    socket.on('cementUpdates', () => fetchData());
    socket.on('paymentNotification', (msg) => {
      const fyStartYear = parseInt(selYear.split('-')[0], 10);
      const calendarYear = selMonth >= 4 ? fyStartYear : fyStartYear + 1;
      if (msg.pumpName === selPump && msg.month === selMonth && msg.year === calendarYear && msg.period === selPeriod) {
        setIsNotified(true);
      }
      if (isOfficeAdmin) {
        setAllNotifications(prev => {
          const key = `${msg.pumpName}-${msg.month}-${msg.year}-${msg.period}`;
          const filtered = prev.filter(n => `${n.pumpName}-${n.month}-${n.year}-${n.period}` !== key);
          return [msg, ...filtered];
        });
        setSnack({ severity: 'warning', msg: `🔔 ${msg.pumpName} pump (Period ${msg.period}): Please complete the payment!` });
      }
    });
    // Listen for period payment updates (pump admin sees paid status live)
    socket.on('periodPaymentUpdated', (msg) => {
      const fyStartYear = parseInt(selYear.split('-')[0], 10);
      const calendarYear = selMonth >= 4 ? fyStartYear : fyStartYear + 1;
      if (msg.pumpName === selPump && msg.month === selMonth && msg.year === calendarYear && msg.period === selPeriod) {
        setPeriodPaymentStatus(msg.status);
        setPeriodProofUrls(msg.proofUrls || []);
      }
      if (isOfficeAdmin && msg.status === 'Paid' && msg.proofUrls?.length > 0) {
        setAllNotifications(prev => prev.filter(n =>
          !(n.pumpName === msg.pumpName && n.month === msg.month && n.year === msg.year && n.period === msg.period)
        ));
      }
    });
    socket.on('fuelRateUpdated', (msg) => {
      setFuelRatesMap(prev => ({ ...prev, [msg.pumpName]: msg.rate }));
    });
    return () => { socket.off('cementUpdates'); socket.off('paymentNotification'); socket.off('periodPaymentUpdated'); socket.off('fuelRateUpdated'); };
  }, [fetchData, selPump, selMonth, selYear, selPeriod, isOfficeAdmin]);


  // ── Upload period-level proofs — supports multiple files (Office Admin only) ──
  const handlePeriodProofUpload = async (files) => {
    if (!files || files.length === 0 || !isOfficeAdmin) return;
    setPeriodUploading(true);
    try {
      const uploaded = [];
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('proof', file);
        const { data } = await axios.post(`${API_URL}/pump-payment/upload-payment-proof`, formData, {
          headers: { Authorization: `Bearer ${token()}` }
        });
        if (data.success) uploaded.push(data.url);
      }
      if (uploaded.length === 0) return;
      const newUrls = [...periodProofUrls, ...uploaded];
      setPeriodProofUrls(newUrls);
      const fyStartYear = parseInt(selYear.split('-')[0], 10);
      const calendarYear = selMonth >= 4 ? fyStartYear : fyStartYear + 1;
      await axios.put(`${API_URL}/pump-payment/save-period-payment`, {
        pumpName: selPump, month: selMonth, year: calendarYear, period: selPeriod,
        status: periodPaymentStatus, proofUrls: newUrls
      }, { headers: { Authorization: `Bearer ${token()}` } });
      if (periodPaymentStatus === 'Paid') {
        setAllNotifications(prev => prev.filter(n =>
          !(n.pumpName === selPump && n.month === selMonth && n.year === calendarYear && n.period === selPeriod)
        ));
        setSnack({ severity: 'success', msg: `${uploaded.length} proof file(s) uploaded — notification cleared!` });
      } else {
        setSnack({ severity: 'success', msg: `${uploaded.length} proof file(s) uploaded` });
      }
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Upload failed: ' + (err.response?.data?.error || err.message) });
    } finally { setPeriodUploading(false); }
  };

  // ── Remove a single proof URL (Office Admin only) ──────────────────────────
  const handleRemovePeriodProof = async (urlToRemove) => {
    if (!isOfficeAdmin) return;
    const fyStartYear = parseInt(selYear.split('-')[0], 10);
    const calendarYear = selMonth >= 4 ? fyStartYear : fyStartYear + 1;
    try {
      const { data } = await axios.put(`${API_URL}/pump-payment/remove-period-proof`, {
        pumpName: selPump, month: selMonth, year: calendarYear, period: selPeriod, urlToRemove
      }, { headers: { Authorization: `Bearer ${token()}` } });
      if (data.success) {
        setPeriodProofUrls(data.proofUrls || []);
        setPeriodPaymentStatus(data.status || 'Unpaid');
        setSnack({ severity: 'info', msg: 'Proof removed' + (data.status === 'Unpaid' && (data.proofUrls || []).length === 0 ? ' — status reset to Unpaid' : '') });
      }
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Remove failed: ' + (err.response?.data?.error || err.message) });
    }
  };


  // ── Save period payment status (Office Admin only) ───────────────────────
  const handleSavePeriodPayment = async (newStatus) => {
    if (!isOfficeAdmin) return;
    setPeriodPaymentStatus(newStatus);
    if (newStatus === 'Paid' && periodProofUrls.length === 0) {
      setSnack({ severity: 'warning', msg: '⚠️ Upload at least one payment receipt to confirm Paid status' });
      return;
    }
    const fyStartYear = parseInt(selYear.split('-')[0], 10);
    const calendarYear = selMonth >= 4 ? fyStartYear : fyStartYear + 1;
    try {
      await axios.put(`${API_URL}/pump-payment/save-period-payment`, {
        pumpName: selPump, month: selMonth, year: calendarYear, period: selPeriod,
        status: newStatus, proofUrls: periodProofUrls
      }, { headers: { Authorization: `Bearer ${token()}` } });
      if (newStatus === 'Unpaid') {
        setSnack({ severity: 'info', msg: 'Period payment reset to Unpaid' });
      }
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Save failed: ' + (err.response?.data?.error || err.message) });
    }
  };

  // ── Verify Slip (Pump Admin only) ───────────────────────
  const handleVerifyCode = async (ri, row) => {
    if (!isPumpAdmin) return;
    const code = (verificationCodes[ri] || '').trim();
    const actualSlip = (row['HSD SLIP NO'] || '').trim();

    if (!code) {
      setSnack({ severity: 'error', msg: 'Please enter a verification code first.' });
      return;
    }
    if (code !== actualSlip) {
      setSnack({ severity: 'error', msg: 'Invalid verification code. Please check the slip directly.' });
      return;
    }

    // Determine the authoritative pump name and fuel rate for this pump admin
    const verifiedPumpName = pumpConfig.pumpName || selPump;
    const verifiedFuelRate = fuelRatesMap[verifiedPumpName] ?? pumpConfig.fuelRate ?? 90;

    // Valid match -> apply verification + stamp pump name + HSD rate
    try {
      await axios.put(`${API_URL}/cement-register/${row._cementId}`, {
        'VERIFICATION STATUS': 'Verified',
        'PUMP NAME': verifiedPumpName,   // Exact pump that verified
        'HSD RATE': verifiedFuelRate,    // Pump's configured fuel price
      }, { headers: { Authorization: `Bearer ${token()}` } });

      setRows(prev => prev.map((r, idx) =>
        idx === ri
          ? { ...r, 'VERIFICATION STATUS': 'Verified', 'PUMP NAME': verifiedPumpName, 'HSD RATE': verifiedFuelRate }
          : r
      ));

      if (row._invoiceId) {
        setRegeneratingInvoiceId(row._invoiceId);
      }

      setSnack({ severity: 'success', msg: `\u2705 Slip ${code} verified for ${verifiedPumpName} @ ₹${verifiedFuelRate}/ltr. Rebuilding softcopies...` });
      fetchData();
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Verification failed: ' + (err.response?.data?.error || err.message) });
    }
  };
  // ── Apply calcs + local edits to produce final display rows ───────────
  const computedRows = useMemo(() => {
    return rows.map((row, ri) => {
      const edits = localEdits[ri] || {};
      const merged = { ...row, ...edits, originalIndex: ri };
      // HSD AMOUNT = HSD (LTR) × HSD RATE
      const ltr = num(merged['HSD (LTR)']);
      const rate = num(merged['HSD RATE']);
      merged['HSD AMOUNT'] = round2(ltr * rate);
      return merged;
    });
  }, [rows, localEdits]);

  // Partition for Pump Admin
  const { todayRows, expiredRows } = useMemo(() => {
    if (!isPumpAdmin) return { todayRows: [], expiredRows: [] };
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const f = (d) => `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    const f2 = (d) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getFullYear()).slice(2)}`;

    const todayS1 = f(today);
    const todayS2 = f2(today);
    const yestS1 = f(yesterday);
    const yestS2 = f2(yesterday);

    return {
      todayRows: computedRows.filter(r => r['LOADING DATE'] === todayS1 || r['LOADING DATE'] === todayS2),
      expiredRows: computedRows.filter(r => r['LOADING DATE'] === yestS1 || r['LOADING DATE'] === yestS2)
    };
  }, [computedRows, isPumpAdmin]);

  const activeRows = isPumpAdmin
    ? (pumpTab === 'today' ? todayRows : pumpTab === 'expired' ? expiredRows : computedRows)
    : computedRows;

  const totals = useMemo(() => ({
    'HSD (LTR)': round2(activeRows.reduce((s, r) => s + num(r['HSD (LTR)']), 0)),
    'HSD AMOUNT': round2(activeRows.reduce((s, r) => s + num(r['HSD AMOUNT']), 0)),
  }), [activeRows]);

  const handleEdit = (ri, field, value) => {
    setLocalEdits(prev => ({ ...prev, [ri]: { ...(prev[ri] || {}), [field]: value } }));
  };

  // ── Save (only saves PAYMENT STATUS + PAYMENT PROOF URL — office admin only) ────
  const handleSave = async () => {
    if (!isOfficeAdmin) return;
    setSaving(true);
    try {
      // Only persist payment-related fields — everything else is from cement register (source of truth)
      const saveRows = computedRows.map(r => ({
        _cementId: r._cementId,
        'LOADING DATE': r['LOADING DATE'],
        'VEHICLE NUMBER': r['VEHICLE NUMBER'],
        'PUMP NAME': r['PUMP NAME'],
        'HSD SLIP NO': r['HSD SLIP NO'],
        'HSD BILL NO': r['HSD BILL NO'],
        'HSD (LTR)': r['HSD (LTR)'],
        'HSD RATE': r['HSD RATE'],
        'HSD AMOUNT': r['HSD AMOUNT'],
        'PAYMENT STATUS': r['PAYMENT STATUS'],
        'PAYMENT PROOF URL': r['PAYMENT PROOF URL'],
        'VERIFICATION STATUS': r['VERIFICATION STATUS'],
      }));
      const fyStartYear = parseInt(selYear.split('-')[0], 10);
      const calendarYear = selMonth >= 4 ? fyStartYear : fyStartYear + 1;
      await axios.put(`${API_URL}/pump-payment/save-period`, {
        pumpName: selPump, month: selMonth, year: calendarYear,
        period: selPeriod, hsdBillNo: '', rows: saveRows
      }, { headers: { Authorization: `Bearer ${token()}` } });

      setSnack({ severity: 'success', msg: 'Payment status saved!' });
      setLocalEdits({});
      fetchData();
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Save failed: ' + (err.response?.data?.error || err.message) });
    } finally { setSaving(false); }
  };


  // ── CSV export ─────────────────────────────────────────────────────────
  const handleExport = () => {
    const fyStartYear = parseInt(selYear.split('-')[0], 10);
    const calendarYear = selMonth >= 4 ? fyStartYear : fyStartYear + 1;
    const { startDay, endDay } = getPeriodRange(selPeriod, selMonth, calendarYear);
    const startFmt = `${String(startDay).padStart(2, '0')}.${String(selMonth).padStart(2, '0')}.${String(calendarYear).slice(2)}`;
    const endFmt = `${String(endDay).padStart(2, '0')}.${String(selMonth).padStart(2, '0')}.${String(calendarYear).slice(2)}`;

    const exportRows = computedRows.map(r => ({
      'LOADING DT': r['LOADING DATE'],
      'VEHICLE NUMBER': r['VEHICLE NUMBER'],
      'PUMP NAME': r['PUMP NAME'],
      'HSD SLIP NO': r['HSD SLIP NO'],
      'HSD BILL NO': hsdBillNo || r['HSD BILL NO'],
      'HSD (LTR)': r['HSD (LTR)'],
      'HSD RATE': r['HSD RATE'],
      'HSD AMOUNT': r['HSD AMOUNT'],
      'PAYMENT STATUS': r['PAYMENT STATUS'] || '',
      'VERIFICATION STATUS': r['VERIFICATION STATUS'],
    }));
    // Add summary row
    exportRows.push({
      'LOADING DT': 'TOTAL',
      'VEHICLE NUMBER': '', 'PUMP NAME': '', 'HSD SLIP NO': '', 'HSD BILL NO': '',
      'HSD (LTR)': totals['HSD (LTR)'],
      'HSD RATE': '',
      'HSD AMOUNT': totals['HSD AMOUNT'],
    });
    exportToCsv(`pump_payment_${selPump}_${selYear}_${selMonth}_P${selPeriod}.xls`, exportRows);
  };

  const billTitle = useMemo(() => {
    const fyStartYear = parseInt(selYear.split('-')[0], 10);
    const calendarYear = selMonth >= 4 ? fyStartYear : fyStartYear + 1;
    const { startDay, endDay } = getPeriodRange(selPeriod, selMonth, calendarYear);
    const s = `${String(startDay).padStart(2, '0')}.${String(selMonth).padStart(2, '0')}.${String(calendarYear).slice(2)}`;
    const e = `${String(endDay).padStart(2, '0')}.${String(selMonth).padStart(2, '0')}.${String(calendarYear).slice(2)}`;
    return `${selPump || '—'} ( ${s} - ${e} )${hsdBillNo ? ' -' + hsdBillNo : ''}`;
  }, [selPump, selMonth, selYear, selPeriod, hsdBillNo]);

  const billableRows = activeRows.filter(r => r['VERIFICATION STATUS'] === 'Verified' && !r.isBilled && r['CHALLAN STATUS'] !== 'BILLED');

  useShortcut('ctrl+s', handleSave);
  useShortcut('ctrl+r', () => fetchData());
  useShortcut('ctrl+e', handleExport);
  useShortcut('delete', () => {
    // Basic fallback if delete logic is not explicit or supported
  });

  const visibleCols = isPumpAdmin
    ? COLUMNS.filter(c => ['LOADING DATE', 'VEHICLE NUMBER', 'HSD (LTR)', 'VERIFICATION CODE'].includes(c.key))
      .map(c => ({
        ...c,
        label: c.key === 'LOADING DATE' ? 'Date'
          : c.key === 'VEHICLE NUMBER' ? 'Vehicle No'
            : c.key === 'HSD (LTR)' ? 'Litre'
              : c.key === 'VERIFICATION CODE' ? 'Verify'
                : c.label,
        width: c.key === 'LOADING DATE' ? 90
          : c.key === 'VEHICLE NUMBER' ? 95
            : c.key === 'HSD (LTR)' ? 60
              : c.key === 'VERIFICATION CODE' ? 100
                : c.width
      }))
    : COLUMNS.filter(c => c.key !== 'VERIFICATION CODE');

  if (loadingPumps) return (
    <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100vh" gap={2}>
      <CircularProgress size={48} sx={{ color: '#0891b2' }} />
      <Typography color="text.secondary" fontWeight={600}>Loading pump list...</Typography>
    </Box>
  );

  if (!loadingPumps && !effectiveLockedPump && pumps.length === 0) return (
    <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100vh" gap={2}>
      <Typography color="text.secondary" fontWeight={600} fontSize={18} sx={{ mb: 1 }}>No pumps found in cement register.</Typography>
      <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>Please ensure there are entries in the cement register with assigned pump names.</Typography>
      <Button onClick={onBack} variant="contained" sx={{ bgcolor: '#0891b2', '&:hover': { bgcolor: '#0e7490' } }}>Go Back</Button>
    </Box>
  );


  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#f0fdfa', overflow: 'hidden' }}>
      {regeneratingInvoiceId && (
        <AutoPdfRegenerator
          invoiceId={regeneratingInvoiceId}
          onComplete={(success) => {
            setRegeneratingInvoiceId(null);
            if (success) setSnack({ severity: 'success', msg: 'Softcopies fully rebuilt and synced to S3 limitlessly.' });
          }}
        />
      )}

      {/* ── Toolbar ── */}
      <Box sx={{
        px: 2, py: 1, bgcolor: '#fff', borderBottom: '2px solid #0891b2',
        boxShadow: '0 2px 8px rgba(8,145,178,0.1)', flexShrink: 0
      }}>

        {/* Row 1: Back + Title + Selectors */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 1 }}>
          <IconButton onClick={onBack} size="small" sx={{ bgcolor: '#e0f7fa', '&:hover': { bgcolor: '#b2ebf2' } }}>
            <ArrowBackIcon fontSize="small" sx={{ color: '#0891b2' }} />
          </IconButton>
          <Typography variant="h6" fontWeight={900} sx={{ color: '#0c4a6e', letterSpacing: '-0.5px' }}>
            Pump Payment Details
          </Typography>

          {/* Pump */}
          {effectiveLockedPump ? (
            /* Locked to assigned pump – shown as a status badge */
            <Box display="flex" alignItems="center" gap={1}
              sx={{ px: 1.5, py: 0.6, bgcolor: '#e0f7fa', borderRadius: '8px', border: '1px solid #0891b2' }}>
              <Typography sx={{ fontSize: 12, fontWeight: 900, color: '#0c4a6e' }}>⛽ {effectiveLockedPump}</Typography>
            </Box>
          ) : (
            <Box sx={{ minWidth: 160 }}>
              <SearchableSelect value={selPump} label="Pump" onChange={e => setSelPump(e.target.value)} sx={{ fontSize: 12, fontWeight: 700 }}>
                {pumps.map(p => <MenuItem key={p} value={p} sx={{ fontSize: 12 }}>{p}</MenuItem>)}
              </SearchableSelect>
            </Box>
          )}

          {/* Month */}
          <Box sx={{ minWidth: 140 }}>
            <SearchableSelect value={selMonth} label="Month" onChange={e => setSelMonth(e.target.value)} sx={{ fontSize: 12, fontWeight: 700 }}>
              {MONTH_NAMES.map((m, i) => <MenuItem key={i + 1} value={i + 1} sx={{ fontSize: 12 }}>{m}</MenuItem>)}
            </SearchableSelect>
          </Box>

          <Box sx={{ minWidth: 140 }}>
            <SearchableSelect value={selYear} label="Financial Year" onChange={e => setSelYear(e.target.value)} sx={{ fontSize: 12, fontWeight: 700 }}>
              {yearOptions.map(y => <MenuItem key={y} value={y} sx={{ fontSize: 12 }}>{y}</MenuItem>)}
            </SearchableSelect>
          </Box>

          {/* Period */}
          <Box sx={{ minWidth: 220 }}>
            <SearchableSelect value={selPeriod} label="Period" onChange={e => setSelPeriod(parseInt(e.target.value))} sx={{ fontSize: 12, fontWeight: 700 }}>
              {PERIODS.map(p => <MenuItem key={p.value} value={p.value} sx={{ fontSize: 12 }}>{p.label}</MenuItem>)}
            </SearchableSelect>
          </Box>

          {isOfficeAdmin && dirtyCount > 0 && <Chip label="Unsaved changes" size="small" color="warning" sx={{ fontWeight: 700 }} />}
          <Chip label={`${activeRows.length} entries`} size="small" sx={{ bgcolor: '#e0f7fa', fontWeight: 700, color: '#0891b2' }} />

          <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
            <Tooltip title="Reload from cement register">
              <IconButton size="small" onClick={fetchData} sx={{ bgcolor: '#e0f7fa' }}>
                <RefreshIcon fontSize="small" sx={{ color: '#0891b2' }} />
              </IconButton>
            </Tooltip>
            {!isPumpAdmin && (
              <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={handleExport}
                sx={{ fontWeight: 700, borderRadius: 2, fontSize: 12, borderColor: '#0891b2', color: '#0891b2' }}>
                XLS
              </Button>
            )}
            {!isPumpAdmin && (
              <Button size="small" variant="contained"
                startIcon={saving ? <CircularProgress size={13} color="inherit" /> : <SaveIcon />}
                onClick={handleSave} disabled={saving}
                sx={{
                  fontWeight: 800, borderRadius: 2, px: 2,
                  background: 'linear-gradient(135deg,#0891b2,#0e7490)'
                }}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            )}
            {!isPumpAdmin && (
              <Button size="small" variant="contained"
                onClick={() => {
                  if (selectedRowIds.length === 0) {
                    setSnack({ severity: 'warning', msg: 'Please select at least one record before running Batch Billing.' });
                    return;
                  }

                  setBatchDialogOpen(true);
                }}
                sx={{
                  fontWeight: 800, borderRadius: 2, px: 2,
                  background: 'linear-gradient(135deg,#10b981,#047857)',
                }}>
                Run Batch Billing ({selectedRowIds.length})
              </Button>
            )}
          </Box>
        </Box>

        {/* Row 2: Bill title + role badge + current-period notification chip */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Typography fontWeight={900} fontSize={14} color="#0c4a6e" sx={{ fontFamily: 'monospace', letterSpacing: 0.5 }}>
            {billTitle}
          </Typography>

          {isOfficeAdmin && isNotified && (
            <Chip
              label="⚠️ Payment notification for this period"
              size="small"
              sx={{ height: 26, fontSize: 11, fontWeight: 800, bgcolor: '#fef3c7', color: '#92400e', border: '1px solid #fbbf24', px: 1 }}
            />
          )}
        </Box>
      </Box>

      {/* ── Pump Admin Tabs ── */}
      {isPumpAdmin && (
        <Box sx={{ px: 2, py: 1.5, bgcolor: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 2 }}>
          <Button
            onClick={() => setPumpTab('all')}
            variant={pumpTab === 'all' ? 'contained' : 'outlined'}
            sx={{
              borderRadius: '20px', px: 3, fontWeight: 800, fontSize: 13,
              bgcolor: pumpTab === 'all' ? '#64748b' : 'transparent',
              color: pumpTab === 'all' ? '#fff' : '#64748b',
              borderColor: '#64748b',
              '&:hover': { bgcolor: pumpTab === 'all' ? '#475569' : '#f8fafc' }
            }}
          >
            All ({computedRows.length})
          </Button>
          <Button
            onClick={() => setPumpTab('today')}
            variant={pumpTab === 'today' ? 'contained' : 'outlined'}
            sx={{
              borderRadius: '20px', px: 3, fontWeight: 800, fontSize: 13,
              bgcolor: pumpTab === 'today' ? '#0891b2' : 'transparent',
              color: pumpTab === 'today' ? '#fff' : '#0891b2',
              borderColor: '#0891b2',
              '&:hover': { bgcolor: pumpTab === 'today' ? '#0e7490' : '#f0fdfa' }
            }}
          >
            Today ({todayRows.length})
          </Button>
          <Button
            onClick={() => setPumpTab('expired')}
            variant={pumpTab === 'expired' ? 'contained' : 'outlined'}
            sx={{
              borderRadius: '20px', px: 3, fontWeight: 800, fontSize: 13,
              bgcolor: pumpTab === 'expired' ? '#ef4444' : 'transparent',
              color: pumpTab === 'expired' ? '#fff' : '#ef4444',
              borderColor: '#ef4444',
              '&:hover': { bgcolor: pumpTab === 'expired' ? '#dc2626' : '#fef2f2' }
            }}
          >
            Expired ({expiredRows.length})
          </Button>
        </Box>
      )}

      {/* ── Global Notifications Panel (Office Admin only) ── */}
      {isOfficeAdmin && allNotifications.length > 0 && (
        <Box sx={{
          mx: 0, px: 2, py: 1,
          bgcolor: '#fffbeb', borderBottom: '2px solid #f59e0b',
          borderTop: '1px solid #fde68a', flexShrink: 0
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 900, color: '#92400e', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              🔔 Pending Payment Notifications ({allNotifications.length})
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {allNotifications.map((notif, i) => {
              const PERIOD_LABELS = { 0: 'Full Month', 1: '1–10', 2: '11–20', 3: '21–End' };
              const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
              const label = `${notif.pumpName} · ${monthNames[(notif.month || 1) - 1]} ${notif.year} · Period ${PERIOD_LABELS[notif.period] || notif.period}`;
              return (
                <Chip
                  key={i}
                  label={`⚠️ ${label}: Please complete the payment`}
                  size="small"
                  sx={{
                    height: 24, fontSize: 11, fontWeight: 700,
                    bgcolor: '#fef3c7', color: '#92400e',
                    border: '1px solid #fbbf24',
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    // Jump to that pump/period
                    setSelPump(notif.pumpName);
                    setSelMonth(notif.month);
                    setSelYear(notif.year);
                    setSelPeriod(notif.period);
                  }}
                />
              );
            })}
          </Box>
        </Box>
      )}

      {/* ── Table/Cards ── */}
      <Box ref={tableContainerRef} sx={{ overflow: 'auto', flex: 1, p: 0, bgcolor: isMobile ? '#f8fafc' : 'inherit' }}>
        {loading ? (
          <Box display="flex" alignItems="center" justifyContent="center" height="60%" gap={2}>
            <CircularProgress sx={{ color: '#0891b2' }} />
            <Typography color="text.secondary">Loading...</Typography>
          </Box>
        ) : isMobile ? (
          <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {activeRows.length === 0 && (
              <Box sx={{ textAlign: 'center', py: 5, color: '#64748b' }}>
                <Typography variant="body2">No entries found for this period.</Typography>
              </Box>
            )}
            {activeRows.map((row, i) => {
              const ri = row.originalIndex;
              return (
                <Card key={i} sx={{
                  borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                  overflow: 'visible', position: 'relative'
                }}>
                  <CardContent sx={{ p: 2 }}>
                    <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1.5}>
                      <Box>
                        <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600, display: 'block' }}>{row['LOADING DATE']}</Typography>
                        <Box display="flex" alignItems="center" gap={3}>
                          <Box>
                            <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 700, display: 'block', fontSize: '10px', textTransform: 'uppercase' }}>Vehicle No</Typography>
                            <Typography variant="subtitle1" fontWeight={900} color="#0c4a6e">{row['VEHICLE NUMBER']}</Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 700, display: 'block', fontSize: '10px', textTransform: 'uppercase' }}>Fuel (Ltrs)</Typography>
                            <Typography variant="subtitle1" fontWeight={900} color="#059669">{row['HSD (LTR)']} L</Typography>
                          </Box>
                        </Box>
                      </Box>
                      {row['VERIFICATION STATUS'] === 'Verified' ? (
                        <Chip label="VERIFIED" size="small" color="success" sx={{ fontWeight: 900, fontSize: 10 }} />
                      ) : (
                        <Chip label="UNVERIFIED" size="small" color="error" sx={{ fontWeight: 900, fontSize: 10 }} />
                      )}
                    </Box>

                    {/* Compact Grid with no Slip No */}
                    <Box sx={{ mb: 1 }} />

                    {isPumpAdmin && row['VERIFICATION STATUS'] !== 'Verified' && (
                      <Box sx={{ mt: 1, pt: 1.5, borderTop: '1px dashed #e2e8f0', display: 'flex', gap: 1 }}>
                        <TextField
                          size="small"
                          placeholder="Code"
                          type="number"
                          value={verificationCodes[ri] || ''}
                          onChange={e => setVerificationCodes(prev => ({ ...prev, [ri]: e.target.value }))}
                          sx={{ flex: 1, '& .MuiInputBase-input': { p: 1, fontSize: 13, fontWeight: 700 } }}
                        />
                        <Button
                          variant="contained" color="success" size="small"
                          onClick={() => handleVerifyCode(ri, row)}
                          sx={{ fontWeight: 800, px: 2, borderRadius: 2 }}
                        >
                          VERIFY
                        </Button>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              );
            })}

            {/* Mobile Footer Total (Office Admin Only) */}
            {activeRows.length > 0 && isOfficeAdmin && (
              <Paper sx={{ p: 2, borderRadius: 3, bgcolor: '#0c4a6e', color: '#fff', mt: 2 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Typography variant="subtitle2" fontWeight={800}>PERIOD TOTAL</Typography>
                  <Typography variant="h5" fontWeight={900}>₹{totals['HSD AMOUNT'].toLocaleString('en-IN')}</Typography>
                </Box>
                <Box display="flex" justifyContent="space-between" mt={1}>
                  <Typography variant="caption" sx={{ opacity: 0.8 }}>Total Quantity</Typography>
                  <Typography variant="caption" fontWeight={800}>{totals['HSD (LTR)']} Ltrs</Typography>
                </Box>
              </Paper>
            )}
          </Box>
        ) : (
          <table style={{
            width: '100%', borderCollapse: 'collapse', tableLayout: 'auto', minWidth: '100%',
            fontFamily: 'Inter, system-ui, sans-serif', fontSize: isPumpAdmin ? '13px' : '11px'
          }}>
            <colgroup>
              <col style={{ minWidth: isPumpAdmin ? 35 : 50 }} /> {/* SL No */}
              {visibleCols.map(c => <col key={c.key} style={{ minWidth: c.width }} />)}
            </colgroup>

            <thead>
              <tr>
                {!isPumpAdmin && (
                  <th style={{
                    position: 'sticky', top: 0, zIndex: 3, background: '#0891b2', color: '#fff',
                    minWidth: 40, padding: '10px 4px', textAlign: 'center', border: '1px solid #0e7490'
                  }}>
                    <Checkbox
                      size="small"
                      sx={{ color: '#fff', '&.Mui-checked': { color: '#fff' }, p: 0 }}
                      checked={billableRows.length > 0 && selectedRowIds.length > 0 && selectedRowIds.length === billableRows.length}
                      indeterminate={selectedRowIds.length > 0 && selectedRowIds.length < billableRows.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          const allIds = billableRows.map(r => String(r._cementId));
                          setSelectedRowIds(allIds);
                        } else {
                          setSelectedRowIds([]);
                        }
                      }}
                    />
                  </th>
                )}
                <th style={{
                  position: 'sticky', top: 0, zIndex: 3, background: '#0891b2', color: '#fff',
                  minWidth: isPumpAdmin ? 35 : 50,
                  padding: isPumpAdmin ? '14px 6px' : '10px 6px', textAlign: 'center', fontSize: isPumpAdmin ? 13 : 11, fontWeight: 900,
                  border: '1px solid #0e7490'
                }}>SL No</th>
                {visibleCols.map(col => (
                  <th key={col.key} style={{
                    position: 'sticky', top: 0, zIndex: 3,
                    background: col.editable ? '#0e7490' : col.calc ? '#155e75' : '#0891b2',
                    color: '#fff', padding: isPumpAdmin ? '14px 8px' : '10px 4px', textAlign: 'center',
                    fontSize: isPumpAdmin ? 13 : 11, fontWeight: 900, border: '1px solid #0e7490',
                    whiteSpace: 'pre-line',
                    minWidth: col.width
                  }}>
                    {col.label}
                    {col.editable && <div style={{ fontSize: 9, opacity: 0.8, fontWeight: 400 }}>✏ editable</div>}
                    {col.calc && <div style={{ fontSize: 9, opacity: 0.8, fontWeight: 400 }}>= auto-calc</div>}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {activeRows.length === 0 && (
                <tr><td colSpan={visibleCols.length + 1} style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
                  {isPumpAdmin
                    ? (pumpTab === 'today' ? "No vehicles pending for today." : "No expired pending vehicles.")
                    : `No cement register entries found for ${selPump} in ${MONTH_NAMES[selMonth - 1]} ${selYear} — ${PERIODS.find(p => p.value === selPeriod)?.label || 'selected period'}.`}
                  <br />Check that pump name matches exactly or verify entries exist in the cement register.
                </td></tr>
              )}
              {activeRows.map((row, i) => {
                const ri = row.originalIndex;

                const isBilled = row.isBilled || row['VERIFICATION STATUS'] === 'Billed' || row['CHALLAN STATUS'] === 'BILLED';
                return (
                  <tr key={i} style={{ 
                    background: selectedRowIds.includes(String(row._cementId)) ? '#e0f2fe' : (i % 2 === 0 ? '#f0fdfa' : '#fff'),
                    opacity: isBilled ? 0.6 : 1,
                    transition: 'opacity 0.2s'
                  }}>
                    {!isPumpAdmin && (
                      <td style={{ textAlign: 'center', border: '1px solid #e2e8f0', padding: 0 }}>
                        <Checkbox
                          size="small"
                          sx={{ p: 0.5 }}
                          disabled={isBilled || row['VERIFICATION STATUS'] !== 'Verified'}
                          checked={selectedRowIds.includes(String(row._cementId))}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedRowIds(prev => [...prev, String(row._cementId)]);
                            else setSelectedRowIds(prev => prev.filter(id => id !== String(row._cementId)));
                          }}
                        />
                      </td>
                    )}
                    <td style={{
                      textAlign: 'center', border: '1px solid #e2e8f0', fontWeight: 700,
                      color: '#475569', padding: isPumpAdmin ? '16px 6px' : '4px', background: '#e0f7fa'
                    }}>
                      {i + 1}
                    </td>
                    {visibleCols.map(col => {
                      const val = row[col.key];
                      const display = val !== null && val !== undefined ? String(val) : '';
                      const isDirty = localEdits[ri]?.[col.key] !== undefined;

                      const isPaymentCol = col.key === 'PAYMENT STATUS';
                      const cellBg = col.calc
                        ? '#ecfeff'
                        : (isPaymentCol && isOfficeAdmin)
                          ? (isDirty ? '#fef08a' : '#f0fdf4')
                          : col.key === 'VERIFICATION STATUS'
                            ? (ri % 2 === 0 ? '#f0fdfa' : '#fff')
                            : (ri % 2 === 0 ? '#f0fdfa' : '#fff');

                      return (
                        <td key={col.key} style={{
                          padding: 0, border: '1px solid #e2e8f0', background: cellBg,
                          fontWeight: col.calc || isDirty ? 700 : 400
                        }}>
                          {col.calc ? (
                            <div style={{ padding: '5px 6px', textAlign: 'right', fontFamily: 'monospace' }}>
                              {display}
                            </div>
                          ) : col.key === 'VERIFICATION STATUS' ? (
                            <div style={{ padding: '5px 6px', textAlign: 'center' }}>
                              {display === 'Verified' ? (
                                <Chip label="Verified" size="small" sx={{ height: 20, fontSize: 10, bgcolor: '#dcfce7', color: '#166534', fontWeight: 800 }} />
                              ) : (
                                <Chip label="Pending" size="small" sx={{ height: 20, fontSize: 10, bgcolor: '#fef9c3', color: '#854d0e', fontWeight: 800 }} />
                              )}
                            </div>
                          ) : col.key === 'VERIFICATION CODE' ? (
                            <div style={{ display: 'flex', flexDirection: isPumpAdmin ? 'column' : 'row', gap: '6px', alignItems: 'center', justifyContent: 'center', padding: isPumpAdmin ? '8px 4px' : '2px' }}>
                              {!isPumpAdmin ? (
                                <Typography variant="caption" sx={{ color: '#94a3b8' }}>—</Typography>
                              ) : row['VERIFICATION STATUS'] === 'Verified' ? (
                                <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 800 }}>✅ Validated</Typography>
                              ) : (
                                <>
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    placeholder="Slip Code"
                                    value={verificationCodes[ri] || ''}
                                    onChange={e => setVerificationCodes(prev => ({ ...prev, [ri]: e.target.value }))}
                                    style={{
                                      width: isPumpAdmin ? '80px' : '60px', padding: isPumpAdmin ? '8px 6px' : '3px 2px', fontSize: isPumpAdmin ? '12px' : '10px',
                                      border: '1px solid #cbd5e1', borderRadius: '4px', outline: 'none'
                                    }}
                                  />
                                  <Button
                                    size="small"
                                    variant="contained"
                                    color="success"
                                    sx={{ minWidth: 0, px: isPumpAdmin ? 1.5 : 0.5, py: isPumpAdmin ? 0.8 : 0.3, fontSize: isPumpAdmin ? '11px' : '9px', fontWeight: 800, borderRadius: '4px' }}
                                    onClick={() => handleVerifyCode(ri, row)}
                                  >
                                    Verify
                                  </Button>
                                </>
                              )}
                            </div>
                          ) : col.key === 'PAYMENT STATUS' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '4px 5px' }}>
                              <Typography variant="caption" sx={{ color: '#94a3b8' }}>—</Typography>
                            </div>
                          ) : col.editable ? (
                            <input
                              type="text" value={display}
                              disabled={isBilled}
                              onChange={e => handleEdit(ri, col.key, e.target.value)}
                              style={{
                                width: '100%', padding: '5px 6px', border: 'none',
                                background: 'transparent', fontSize: 12, outline: 'none',
                                fontWeight: isDirty ? 700 : 400, textAlign: col.key.includes('AMOUNT') || col.key.includes('RATE') || col.key.includes('LTR') ? 'right' : 'left'
                              }}
                            />
                          ) : (
                            <div style={{ padding: isPumpAdmin ? '16px 10px' : '5px 6px', textAlign: col.key.includes('LTR') ? 'right' : 'left', whiteSpace: col.key === 'LOADING DATE' ? 'nowrap' : 'normal' }}>
                              {display}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>

            {/* ── Totals row ── */}
            {activeRows.length > 0 && !isPumpAdmin && (
              <tfoot>
                <tr style={{ background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f7fa 100%)', position: 'sticky', bottom: 0, boxShadow: '0 -2px 10px rgba(8,145,178,0.12)' }}>
                  {/* TOTAL label spans: SL No + Loading Date + Vehicle No + Pump Name + HSD Slip No + HSD Bill No = 6 cols */}
                  <td colSpan={6} style={{
                    padding: '10px 14px', border: '1px solid #94a3b8',
                    borderTop: '2px solid #0891b2', fontWeight: 900, fontSize: 13,
                    color: '#0c4a6e', textAlign: 'left', textTransform: 'uppercase',
                    letterSpacing: '1px', fontFamily: 'monospace'
                  }}>
                    TOTAL
                  </td>
                  {/* HSD (LTR) col */}
                  <td style={{
                    padding: '10px 8px', border: '1px solid #94a3b8', borderTop: '2px solid #0891b2',
                    fontWeight: 900, color: '#0c4a6e', textAlign: 'right', fontFamily: 'monospace', fontSize: 13
                  }}>
                    {totals['HSD (LTR)']} Ltr
                  </td>
                  {/* VERIFICATION STATUS col — empty */}
                  <td style={{ border: '1px solid #94a3b8', borderTop: '2px solid #0891b2' }} />
                  {/* VERIFICATION CODE col — empty */}
                  <td style={{ border: '1px solid #94a3b8', borderTop: '2px solid #0891b2' }} />
                  {/* HSD RATE col — empty */}
                  <td style={{ border: '1px solid #94a3b8', borderTop: '2px solid #0891b2' }} />
                  {/* HSD AMOUNT col — ₹ total, aligned to column */}
                  <td style={{
                    padding: '10px 10px', border: '1px solid #94a3b8', borderTop: '2px solid #0891b2',
                    fontWeight: 900, color: '#0c4a6e', textAlign: 'right', fontFamily: 'monospace', fontSize: 13,
                    background: '#ecfeff'
                  }}>
                    ₹ {totals['HSD AMOUNT'].toLocaleString('en-IN')}
                  </td>
                  {/* PAYMENT STATUS col — summary chip in footer */}
                  <td style={{
                    border: '1px solid #94a3b8', borderTop: '2px solid #0891b2',
                    padding: '6px 8px', textAlign: 'center',
                    background: '#f8fafc'
                  }}>
                    <Box display="flex" flexDirection="column" gap={1} alignItems="center">
                      {isOfficeAdmin ? (
                        <>
                          <SearchableSelect variant="standard"
                            value={periodPaymentStatus}
                            onChange={e => handleSavePeriodPayment(e.target.value)}
                            style={{
                              padding: '4px 8px', fontSize: 11, fontWeight: 800,
                              borderRadius: 4, cursor: 'pointer', outline: 'none',
                              borderColor: periodPaymentStatus === 'Paid' ? '#22c55e' : '#f59e0b',
                              color: periodPaymentStatus === 'Paid' ? '#166534' : '#92400e',
                              background: periodPaymentStatus === 'Paid' ? '#dcfce7' : '#fef3c7',
                            }}
                          >
                            <option value="Unpaid">Unpaid Period</option>
                            <option value="Paid">Paid Period</option>
                          </SearchableSelect>
                          <Button
                            component="label"
                            variant="outlined"
                            size="small"
                            disabled={periodUploading}
                            sx={{ fontSize: 10, py: 0, px: 1, borderColor: '#ca8a04', color: '#ca8a04', '&:hover': { borderColor: '#a16207', bgcolor: '#fefce8' } }}
                          >
                            {periodUploading ? 'Uploading...' : '+ Attach Proof(s)'}
                            <input type="file" hidden multiple accept="image/*,application/pdf" onChange={e => handlePeriodProofUpload(e.target.files)} />
                          </Button>
                          {periodProofUrls.length > 0 && (
                            <Box display="flex" flexDirection="column" gap={0.5} mt={0.5} width="100%">
                              {periodProofUrls.map((url, idx) => (
                                <Box key={idx} display="flex" alignItems="center" gap={0.5}>
                                  <a href={url} target="_blank" rel="noreferrer"
                                    style={{
                                      flex: 1, fontSize: 9, fontWeight: 700, color: '#0891b2',
                                      textDecoration: 'none', background: '#cffafe', borderRadius: 3,
                                      padding: '2px 4px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis'
                                    }}>
                                    📄 Proof {idx + 1}
                                  </a>
                                  <Tooltip title="Remove proof">
                                    <IconButton size="small" sx={{ p: 0, color: '#ef4444' }} onClick={() => handleRemovePeriodProof(url)}>
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                      </svg>
                                    </IconButton>
                                  </Tooltip>
                                </Box>
                              ))}
                            </Box>
                          )}
                        </>
                      ) : (
                        <>
                          <Chip
                            label={periodPaymentStatus === 'Paid' ? 'Paid Period' : 'Unpaid Period'}
                            size="small"
                            sx={{
                              height: 22, fontSize: 11, fontWeight: 900,
                              bgcolor: periodPaymentStatus === 'Paid' ? '#dcfce7' : '#fef3c7',
                              color: periodPaymentStatus === 'Paid' ? '#166534' : '#92400e',
                            }}
                          />
                          {periodProofUrls.length > 0 && (
                            <Box display="flex" flexDirection="column" gap={0.5}>
                              {periodProofUrls.map((url, idx) => (
                                <a key={idx} href={url} target="_blank" rel="noreferrer"
                                  style={{
                                    fontSize: 9, fontWeight: 700, color: '#0891b2',
                                    textDecoration: 'none', background: '#cffafe',
                                    borderRadius: 3, padding: '2px 5px'
                                  }}>
                                  📄 View {idx + 1}
                                </a>
                              ))}
                            </Box>
                          )}
                        </>
                      )}
                    </Box>
                  </td>
                  {/* PAYMENT PROOF col — empty */}
                  <td style={{ border: '1px solid #94a3b8', borderTop: '2px solid #0891b2' }} />
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </Box>

      <Snackbar open={!!snack} autoHideDuration={4500} onClose={() => setSnack(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {snack && <Alert severity={snack.severity || 'info'} variant="filled">{snack.msg}</Alert>}
      </Snackbar>

      {/* ── Batch Billing Dialog ── */}
      <Dialog
        open={batchDialogOpen}
        onClose={() => !batchBillingSaving && setBatchDialogOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ bgcolor: '#0891b2', color: '#fff', fontWeight: 900 }}>
          Batch Billing Verification
        </DialogTitle>
        <DialogContent dividers sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', gap: 3, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <Box>
              <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700 }}>Financial Year</Typography>
              <Typography variant="subtitle1" fontWeight={900} color="#0c4a6e">{selYear}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700 }}>Month</Typography>
              <Typography variant="subtitle1" fontWeight={900} color="#0c4a6e">{MONTH_NAMES[selMonth - 1]}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700 }}>Total Records</Typography>
              <Typography variant="subtitle1" fontWeight={900} color="#0c4a6e">{selectedRowIds.length}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700 }}>Total Billing Amount</Typography>
              <Typography variant="subtitle1" fontWeight={900} color="#059669">
                ₹{activeRows
                  .filter(r => selectedRowIds.includes(String(r._cementId)))
                  .reduce((acc, r) => acc + (round2(num(r['HSD (LTR)']) * num(r['HSD RATE'])) || 0), 0)
                  .toLocaleString('en-IN')
                }
              </Typography>
            </Box>
            <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
            <Box>
              <TextField
                label="Bill Date"
                type="date"
                size="small"
                value={batchBillDate}
                onChange={(e) => setBatchBillDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ minWidth: 150, '& .MuiInputBase-input': { fontWeight: 700, color: '#0f172a' } }}
              />
            </Box>
            <Box sx={{ ml: 2, px: 2, py: 0.5, bgcolor: '#e0f2fe', borderRadius: 2, border: '1px dashed #38bdf8' }}>
              <Typography variant="caption" sx={{ color: '#0284c7', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>Auto-Generated Bill No</Typography>
              <Typography variant="subtitle1" fontWeight={900} color="#0369a1" sx={{ fontFamily: 'monospace', letterSpacing: 1 }}>{nextBillNumber || '...'}</Typography>
            </Box>
            <Box sx={{ ml: 1, px: 2, py: 0.5, bgcolor: '#fef3c7', borderRadius: 2, border: '1px dashed #fbbf24' }}>
              <Typography variant="caption" sx={{ color: '#d97706', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>Total HSD Litre</Typography>
              <Typography variant="subtitle1" fontWeight={900} color="#b45309" sx={{ fontFamily: 'monospace', letterSpacing: 1 }}>
                {activeRows
                  .filter(r => selectedRowIds.includes(String(r._cementId)))
                  .reduce((acc, r) => acc + (num(r['HSD (LTR)']) || 0), 0)
                  .toLocaleString('en-IN')
                } Ltr
              </Typography>
            </Box>
          </Box>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead sx={{ bgcolor: '#f1f5f9' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 800, fontSize: 11 }}>SL No</TableCell>
                  <TableCell sx={{ fontWeight: 800, fontSize: 11 }}>Pump Name</TableCell>
                  <TableCell sx={{ fontWeight: 800, fontSize: 11 }}>Vehicle No</TableCell>
                  <TableCell sx={{ fontWeight: 800, fontSize: 11 }}>Owner Name</TableCell>
                  <TableCell sx={{ fontWeight: 800, fontSize: 11 }}>Driver Name</TableCell>
                  <TableCell sx={{ fontWeight: 800, fontSize: 11 }}>Fuel Date</TableCell>
                  <TableCell sx={{ fontWeight: 800, fontSize: 11 }}>Invoice No</TableCell>
                  <TableCell sx={{ fontWeight: 800, fontSize: 11, textAlign: 'right' }}>Fuel (Ltr)</TableCell>
                  <TableCell sx={{ fontWeight: 800, fontSize: 11, textAlign: 'right' }}>Fuel Amt</TableCell>
                  <TableCell sx={{ fontWeight: 800, fontSize: 11, textAlign: 'right' }}>Payment Amt</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {activeRows.filter(r => selectedRowIds.includes(String(r._cementId))).map((r, i) => (
                  <TableRow key={i}>
                    <TableCell sx={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>{r.originalIndex + 1}</TableCell>
                    <TableCell sx={{ fontSize: 11 }}>{r['PUMP NAME']}</TableCell>
                    <TableCell sx={{ fontSize: 11, fontWeight: 700 }}>{r['VEHICLE NUMBER']}</TableCell>
                    <TableCell sx={{ fontSize: 11 }}>{r['OWNER NAME'] || '-'}</TableCell>
                    <TableCell sx={{ fontSize: 11 }}>{r['DRIVER NAME'] || '-'}</TableCell>
                    <TableCell sx={{ fontSize: 11 }}>{r['LOADING DATE']}</TableCell>
                    <TableCell sx={{ fontSize: 11 }}>{r['_invoiceId'] || '-'}</TableCell>
                    <TableCell sx={{ fontSize: 11, textAlign: 'right' }}>{r['HSD (LTR)']}</TableCell>
                    <TableCell sx={{ fontSize: 11, textAlign: 'right', fontWeight: 700 }}>₹{round2(num(r['HSD (LTR)']) * num(r['HSD RATE']))}</TableCell>
                    <TableCell sx={{ fontSize: 11, textAlign: 'right', fontWeight: 700 }}>₹{round2(num(r['HSD (LTR)']) * num(r['HSD RATE']))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: '#f8fafc' }}>
          <Button
            onClick={() => setBatchDialogOpen(false)}
            disabled={batchBillingSaving}
            sx={{ fontWeight: 700 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={async () => {
              setBatchBillingSaving(true);
              try {
                const res = await axios.post(`${API_URL}/pump-payment/generate-batch-bills`, {
                  recordIds: selectedRowIds,
                  pumpName: selPump,
                  billDate: batchBillDate
                }, { headers: { Authorization: `Bearer ${token()}` } });
                if (res.data.success) {
                  setSnack({ severity: 'success', msg: `Batch Bill ${res.data.billNumber} generated successfully!` });
                  setBatchDialogOpen(false);
                  setSelectedRowIds([]);
                  fetchData(); // Reload table
                } else {
                  setSnack({ severity: 'error', msg: res.data.error || 'Failed to generate bills' });
                }
              } catch (e) {
                setSnack({ severity: 'error', msg: e.response?.data?.error || e.message });
              } finally {
                setBatchBillingSaving(false);
              }
            }}
            disabled={batchBillingSaving || selectedRowIds.length === 0 || !batchBillDate}
            sx={{ fontWeight: 800, bgcolor: '#10b981', '&:hover': { bgcolor: '#059669' } }}
          >
            {batchBillingSaving ? 'Generating...' : 'Generate Bill'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
