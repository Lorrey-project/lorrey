import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Box, Typography, Button, IconButton, Tabs, Tab, Paper, Chip, Card, CardContent,
  TextField, CircularProgress, Snackbar, Alert, Checkbox, Dialog, DialogTitle,
  DialogContent, DialogActions, Autocomplete, Tooltip, Select, MenuItem, FormControl
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PersonIcon from '@mui/icons-material/Person';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import TableChartIcon from '@mui/icons-material/TableChart';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ClearIcon from '@mui/icons-material/Clear';
import axios from 'axios';
import { exportToCsv } from '../utils/exportCsv';
import { useTableNavigation } from '../hooks/useTableNavigation';

import BrindaPortal from '../portals/brinda/BrindaPortal';
import JeetPortal from '../portals/jeet/JeetPortal';
import CreditorVehicleLedgerSection from '../components/CreditorVehicleLedgerSection';
import { LEDGER_OPTIONS, NAMES_OPTIONS } from './AccountDetails';
import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL;
const SOCKET_URL = import.meta.env.VITE_SOCKET_IO_URL || import.meta.env.VITE_API_URL || 'http://localhost:3000';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function getMonthFromDate(dateStr) {
  if (!dateStr) return '';
  const s = String(dateStr).trim();
  if (s.includes('-')) {
    const parts = s.split('-');
    if (parts[0].length === 4) {
      const m = parseInt(parts[1], 10);
      if (m >= 1 && m <= 12) return MONTH_NAMES[m - 1];
    }
  } else if (s.includes('/')) {
    const parts = s.split('/');
    if (parts.length === 3) {
      const m = parseInt(parts[1], 10);
      if (m >= 1 && m <= 12) return MONTH_NAMES[m - 1];
    }
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return MONTH_NAMES[d.getMonth()];
  }
  return '';
}

const num = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};

const formatAmt = (val) => {
  return Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const parseRowDate = (dateStr) => {
  if (!dateStr) return 0;
  const s = String(dateStr).trim();
  if (s.includes('-')) {
    const parts = s.split('-');
    if (parts[0].length === 4) {
      return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)).getTime() || 0;
    }
    if (parts[2].length === 4) {
      return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10)).getTime() || 0;
    }
  } else if (s.includes('/')) {
    const parts = s.split('/');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)).getTime() || 0;
      }
      return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10)).getTime() || 0;
    }
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? 0 : d.getTime();
};

// Calculate running balance row-by-row for Monoj Bandhan in chronological order
const computeMonojBalances = (rowList) => {
  const sortedList = [...rowList].sort((a, b) => {
    const tA = parseRowDate(a.date);
    const tB = parseRowDate(b.date);
    if (tA && tB && tA !== tB) return tA - tB;
    if (tA && !tB) return -1;
    if (!tA && tB) return 1;
    const sA = num(a.slNo);
    const sB = num(b.slNo);
    if (sA && sB && sA !== sB) return sA - sB;
    return 0;
  });

  let currentBalance = 0;
  return sortedList.map((row, index) => {
    const credit = num(row.credit);
    const debit = num(row.debit);
    if (index === 0) {
      currentBalance = credit - debit;
    } else {
      currentBalance = currentBalance + credit - debit;
    }
    const resolvedSlNo = (row.slNo !== undefined && row.slNo !== null && row.slNo !== '')
      ? Number(row.slNo)
      : (index + 1);

    return {
      ...row,
      slNo: resolvedSlNo,
      credit,
      debit,
      ledgerName: row.ledgerName || '',
      names: row.names || '',
      vehicleNo: row.vehicleNo || '',
      pdfUrl: row.pdfUrl || '',
      pdfName: row.pdfName || '',
      balance: Math.round(currentBalance * 100) / 100
    };
  });
};

export default function OthersCreditor({
  onBack,
  initialTab = 0,
  onOpenCementRegister,
  onOpenMainCashbook,
  onOpenDailySummaryReport
}) {
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    if (initialTab !== undefined && initialTab !== null) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, flex: 1, minHeight: '100vh', bgcolor: '#0f172a', color: '#f8fafc', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>

      {/* Header Bar */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton onClick={onBack} sx={{ color: '#f8fafc', bgcolor: 'rgba(255,255,255,0.1)', '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' } }}>
            <ArrowBackIcon />
          </IconButton>
          <Box>
            <Typography variant="h4" fontWeight="900" sx={{ letterSpacing: '-0.5px', color: '#f8fafc' }}>
              OTHERS CREDITOR
            </Typography>
            <Typography variant="subtitle2" color="#94a3b8" fontWeight="600">
              Financial Management &bull; Individual Creditor Accounts
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* 3 Tabs Header */}
      <Box sx={{ borderBottom: '1px solid #334155', mb: 3, bgcolor: '#1e293b', borderRadius: 2, px: 2, pt: 1 }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          sx={{
            '& .MuiTab-root': {
              fontWeight: 800,
              fontSize: '14px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: '#94a3b8',
              minWidth: 160,
              px: 3,
              py: 1.5,
              transition: 'all 0.2s',
              '&:hover': {
                color: '#f8fafc',
              },
            },
            '& .Mui-selected': {
              color: '#c084fc !important',
            },
            '& .MuiTabs-indicator': {
              backgroundColor: '#c084fc',
              height: 3,
              borderRadius: '3px 3px 0 0',
            },
          }}
        >
          <Tab label="MONOJ BANDHAN" icon={<PersonIcon sx={{ fontSize: 18 }} />} iconPosition="start" />
          <Tab label="BRINDA SHYAM" icon={<PersonIcon sx={{ fontSize: 18 }} />} iconPosition="start" />
          <Tab label="JEET PANJA" icon={<PersonIcon sx={{ fontSize: 18 }} />} iconPosition="start" />
        </Tabs>
      </Box>

      {/* Tab Panels */}
      {activeTab === 0 && <MonojBandhanSection />}
      {activeTab === 1 && (
        <BrindaPortal
          hideHeader={true}
          onOpenCementRegister={onOpenCementRegister}
          onOpenMainCashbook={onOpenMainCashbook}
          onOpenDailySummaryReport={onOpenDailySummaryReport}
        />
      )}
      {activeTab === 2 && (
        <JeetPortal
          hideHeader={true}
          onOpenCementRegister={onOpenCementRegister}
          onOpenMainCashbook={onOpenMainCashbook}
          onOpenDailySummaryReport={onOpenDailySummaryReport}
        />
      )}

    </Box>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MONOJ BANDHAN SECTION - Dedicated Ledger Table (UNTOUCHED)
// ─────────────────────────────────────────────────────────────────────────────
function MonojBandhanSection() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('ALL');
  const [selectedDate, setSelectedDate] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [uploadingId, setUploadingId] = useState(null);

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [confirmDelOpen, setConfirmDelOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const tableContainerRef = useRef(null);
  useTableNavigation(tableContainerRef);

  const [ownerVehicleMap, setOwnerVehicleMap] = useState({});

  // Fetch MONOJ BANDHAN data from backend
  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.get(`${API_URL}/others-creditors`, {
        params: { creditorName: 'MONOJ BANDHAN' },
        headers
      });

      if (res.data?.success) {
        const rawEntries = res.data.entries || [];
        setRows(computeMonojBalances(rawEntries));
      }
    } catch (err) {
      console.error('[MonojBandhan] Fetch error:', err);
      setSnack({ severity: 'error', message: 'Failed to fetch MONOJ BANDHAN ledger data: ' + (err.response?.data?.error || err.message) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Fetch truck-contacts matching Bank Book's source logic
    const fetchContacts = async () => {
      try {
        const token = localStorage.getItem('token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await axios.get(`${API_URL}/truck-contacts`, { headers });
        if (res.data && res.data.contacts) {
          const ownerMap = {};
          res.data.contacts.forEach(c => {
            const owner = c['Owner Name '] || c['Owner Name'] || c.owner_name;
            const truck = c['Truck No '] || c['Truck No'] || c.truck_no;
            if (owner && truck) {
              const oName = String(owner).trim();
              const tNo = String(truck).trim();
              if (oName && tNo) {
                if (!ownerMap[oName]) ownerMap[oName] = [];
                ownerMap[oName].push(tNo);
              }
            }
          });
          for (let owner in ownerMap) {
            ownerMap[owner] = [...new Set(ownerMap[owner])].sort();
          }
          setOwnerVehicleMap(ownerMap);
        }
      } catch (err) {
        console.error('[MonojBandhan] Failed to fetch contacts:', err);
      }
    };
    fetchContacts();

    let socket;
    try {
      socket = io(SOCKET_URL, { transports: ["websocket", "polling"] });
      socket.on('othersCreditorUpdate', (data) => {
        if (!data || !data.creditorName || data.creditorName === 'MONOJ BANDHAN') {
          fetchData();
        }
      });
      socket.on('accountDetailsUpdate', () => fetchData());
    } catch (err) {
      console.warn('Socket error in OthersCreditor:', err.message);
    }

    return () => {
      if (socket) socket.disconnect();
    };
  }, []);

  const dynamicNamesOptions = useMemo(() => {
    return [...new Set([...(NAMES_OPTIONS || []), ...Object.keys(ownerVehicleMap)])].sort();
  }, [ownerVehicleMap]);

  // Retrieve all vehicles belonging to the specified owner (exact Bank Book logic)
  const getVehiclesForOwner = (ownerName) => {
    const typed = String(ownerName || '').trim();
    if (!typed) return [];
    if (ownerVehicleMap[typed]) return ownerVehicleMap[typed];
    const typedLower = typed.toLowerCase();
    return [...new Set(Object.keys(ownerVehicleMap).reduce((acc, k) => {
      if (k.toLowerCase().includes(typedLower) || typedLower.includes(k.toLowerCase())) {
        return acc.concat(ownerVehicleMap[k]);
      }
      return acc;
    }, []))];
  };

  // When owner changes, update names and clear vehicle if it no longer belongs to that owner
  const handleOwnerChange = (target, newOwner) => {
    const owner = newOwner || '';
    const allowedVehicles = getVehiclesForOwner(owner);
    setRows(prev => {
      const copy = [...prev];
      let idx = -1;
      if (typeof target === 'number') {
        idx = target;
      } else if (typeof target === 'string') {
        idx = copy.findIndex(r => (r._id && r._id === target) || (r.tempId && r.tempId === target));
      } else if (target && typeof target === 'object') {
        idx = copy.findIndex(r => (r._id && target._id && r._id === target._id) || (r.tempId && target.tempId && r.tempId === target.tempId) || r === target);
      }
      if (idx === -1 || !copy[idx]) return prev;
      const currentVehicle = copy[idx]?.vehicleNo || '';
      const shouldClearVehicle = !owner || (currentVehicle && !allowedVehicles.includes(currentVehicle));
      copy[idx] = {
        ...copy[idx],
        names: owner,
        vehicleNo: shouldClearVehicle ? '' : currentVehicle
      };
      return computeMonojBalances(copy);
    });
  };

  // Handle cell edit by index or rowId
  const handleCellChange = (target, field, value) => {
    setRows(prev => {
      const copy = [...prev];
      let idx = -1;
      if (typeof target === 'number') {
        idx = target;
      } else if (typeof target === 'string') {
        idx = copy.findIndex(r => (r._id && r._id === target) || (r.tempId && r.tempId === target));
      } else if (target && typeof target === 'object') {
        idx = copy.findIndex(r => (r._id && target._id && r._id === target._id) || (r.tempId && target.tempId && r.tempId === target.tempId) || r === target);
      }
      if (idx === -1 || !copy[idx]) return prev;
      copy[idx] = { ...copy[idx], [field]: value };
      return computeMonojBalances(copy);
    });
  };

  // PDF Upload Handler - linked directly to row ID
  const handlePdfUpload = async (targetRow, file) => {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setSnack({ severity: 'error', message: 'Only PDF files are allowed.' });
      return;
    }

    const rowIdentifier = targetRow._id || targetRow.tempId;
    setUploadingId(rowIdentifier);
    try {
      const formData = new FormData();
      formData.append('pdf', file);
      if (targetRow._id && targetRow._id.length === 24) {
        formData.append('rowId', targetRow._id);
      }

      const token = localStorage.getItem('token');
      const headers = token ? {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data'
      } : { 'Content-Type': 'multipart/form-data' };

      const res = await axios.post(`${API_URL}/others-creditors/upload-pdf`, formData, { headers });
      if (res.data?.success) {
        const uploadedUrl = res.data.url;
        const fileName = res.data.fileName || file.name;

        setRows(prev => {
          const idx = prev.findIndex(r => (r._id && r._id === targetRow._id) || (r.tempId && r.tempId === targetRow.tempId));
          if (idx === -1) return prev;
          const copy = [...prev];
          copy[idx] = { ...copy[idx], pdfUrl: uploadedUrl, pdfName: fileName };
          return computeMonojBalances(copy);
        });
        setSnack({ severity: 'success', message: 'PDF uploaded successfully!' });
      } else {
        setSnack({ severity: 'error', message: res.data?.error || 'PDF upload failed.' });
      }
    } catch (err) {
      console.error('[MonojBandhan] PDF upload error:', err);
      setSnack({ severity: 'error', message: 'Error uploading PDF: ' + (err.response?.data?.error || err.message) });
    } finally {
      setUploadingId(null);
    }
  };

  // PDF Remove Handler
  const handlePdfRemove = async (targetRow) => {
    try {
      if (targetRow._id && targetRow._id.length === 24) {
        const token = localStorage.getItem('token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        await axios.post(`${API_URL}/others-creditors/remove-pdf`, { rowId: targetRow._id }, { headers });
      }
      setRows(prev => {
        const idx = prev.findIndex(r => (r._id && r._id === targetRow._id) || (r.tempId && r.tempId === targetRow.tempId));
        if (idx === -1) return prev;
        const copy = [...prev];
        copy[idx] = { ...copy[idx], pdfUrl: '', pdfName: '' };
        return computeMonojBalances(copy);
      });
      setSnack({ severity: 'success', message: 'PDF removed.' });
    } catch (err) {
      console.error('[MonojBandhan] Remove PDF error:', err);
      setSnack({ severity: 'error', message: 'Failed to remove PDF.' });
    }
  };

  // Add new empty row with continuous SL NO
  const handleAddRow = async () => {
    const defaultDate = selectedDate || new Date().toISOString().split('T')[0];
    const initialCredit = num(manualAmount) || 0;

    // Determine current highest SL NO across loaded rows
    let maxSlNo = Math.max(0, ...rows.map(r => num(r.slNo) || 0));

    // Also query database to ensure no filters (month/date/search) reduce the global highest SL NO
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.get(`${API_URL}/others-creditors/next-sl-no`, {
        params: { creditorName: 'MONOJ BANDHAN' },
        headers
      });
      if (res.data?.success && res.data.nextSlNo) {
        maxSlNo = Math.max(maxSlNo, Number(res.data.nextSlNo) - 1);
      }
    } catch (err) {
      console.warn('[MonojBandhan] next-sl-no check fallback:', err.message);
    }

    const nextSlNo = maxSlNo + 1;

    const newRow = {
      tempId: `temp-${Date.now()}-${Math.random()}`,
      creditorName: 'MONOJ BANDHAN',
      slNo: nextSlNo,
      date: defaultDate,
      credit: initialCredit,
      ledgerName: '',
      names: '',
      vehicleNo: '',
      debit: 0,
      balance: 0,
      remarks: '',
      pdfUrl: '',
      pdfName: ''
    };
    if (manualAmount) {
      setManualAmount('');
    }
    setRows(prev => computeMonojBalances([...prev, newRow]));
  };

  // Save all rows
  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const computed = computeMonojBalances(rows);
      const payloadRows = computed.map((r) => ({
        ...r,
        creditorName: 'MONOJ BANDHAN',
        slNo: num(r.slNo) || 1
      }));

      const res = await axios.post(`${API_URL}/others-creditors/bulk-save`, { rows: payloadRows }, { headers });
      if (res.data?.success) {
        setSnack({ severity: 'success', message: 'MONOJ BANDHAN ledger saved successfully!' });
        fetchData();
      }
    } catch (err) {
      console.error('[MonojBandhan] Save error:', err);
      setSnack({ severity: 'error', message: 'Failed to save ledger: ' + (err.response?.data?.error || err.message) });
    } finally {
      setSaving(false);
    }
  };

  // Single row delete
  const handleDeleteSingle = async (rowId) => {
    const dbId = typeof rowId === 'string' && rowId.length === 24 ? rowId : null;
    try {
      if (dbId) {
        const token = localStorage.getItem('token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        await axios.delete(`${API_URL}/others-creditors/${dbId}`, { headers });
      }
      setRows(prev => computeMonojBalances(prev.filter(r => (r._id || r.tempId) !== rowId)));
      setSelectedIds(prev => {
        const copy = new Set(prev);
        copy.delete(rowId);
        return copy;
      });
      setSnack({ severity: 'success', message: 'Row deleted.' });
    } catch (err) {
      console.error('[MonojBandhan] Single delete error:', err);
      setSnack({ severity: 'error', message: 'Delete failed: ' + (err.response?.data?.error || err.message) });
    }
  };

  // Bulk delete selected
  const handleConfirmDelete = async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const idsArray = Array.from(selectedIds);
      const dbIds = idsArray.filter(id => typeof id === 'string' && id.length === 24);

      if (dbIds.length > 0) {
        await axios.post(`${API_URL}/others-creditors/bulk-delete`, { ids: dbIds }, { headers });
      }

      setRows(prev => computeMonojBalances(prev.filter(r => !selectedIds.has(r._id || r.tempId))));
      setSelectedIds(new Set());
      setConfirmDelOpen(false);
      setSnack({ severity: 'success', message: `Deleted ${idsArray.length} record(s).` });
    } catch (err) {
      console.error('[MonojBandhan] Delete error:', err);
      setSnack({ severity: 'error', message: 'Delete failed: ' + (err.response?.data?.error || err.message) });
    } finally {
      setDeleting(false);
    }
  };

  // Filtered rows for Month, Date, and Search
  const filteredRows = useMemo(() => {
    return rows.filter(r => {
      // 1. Month Filter
      if (selectedMonth && selectedMonth !== 'ALL') {
        const rMonth = getMonthFromDate(r.date);
        if (rMonth.toLowerCase() !== selectedMonth.toLowerCase()) {
          return false;
        }
      }
      // 2. Date Filter
      if (selectedDate) {
        const rowTime = parseRowDate(r.date);
        const selTime = parseRowDate(selectedDate);
        if (rowTime && selTime) {
          if (rowTime !== selTime) return false;
        } else if ((r.date || '') !== selectedDate) {
          return false;
        }
      }
      // 3. Search Filter
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matches = (
          (r.date || '').toLowerCase().includes(term) ||
          (r.ledgerName || '').toLowerCase().includes(term) ||
          (r.names || '').toLowerCase().includes(term) ||
          (r.vehicleNo || '').toLowerCase().includes(term) ||
          (r.remarks || '').toLowerCase().includes(term) ||
          String(r.credit).includes(term) ||
          String(r.debit).includes(term)
        );
        if (!matches) return false;
      }
      return true;
    });
  }, [rows, selectedMonth, selectedDate, searchTerm]);

  // Selection state
  const isAllSelected = filteredRows.length > 0 && filteredRows.every(r => selectedIds.has(r._id || r.tempId));
  const isSomeSelected = filteredRows.length > 0 && selectedIds.size > 0 && !isAllSelected;

  const toggleSelectRow = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (isAllSelected || isSomeSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filteredRows.forEach(r => next.delete(r._id || r.tempId));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filteredRows.forEach(r => next.add(r._id || r.tempId));
        return next;
      });
    }
  };

  // Summary Metrics with Continuous Opening Balance, Amount, and Closing Balance
  const summaryMetrics = useMemo(() => {
    let totalCredit = 0;
    let totalDebit = 0;

    if (rows.length === 0) {
      return {
        count: 0,
        baseOpeningBalance: 0,
        openingBalance: 0,
        closingBalance: 0,
        totalCredit: 0,
        totalDebit: 0,
        finalBalance: 0
      };
    }

    if (filteredRows.length > 0) {
      filteredRows.forEach(r => {
        totalCredit += num(r.credit);
        totalDebit += num(r.debit);
      });

      // Find the first filtered row's index in the full continuous sorted ledger
      const firstFilteredRow = filteredRows[0];
      const firstIdx = rows.findIndex(r => 
        (r._id && firstFilteredRow._id && r._id === firstFilteredRow._id) ||
        (r.tempId && firstFilteredRow.tempId && r.tempId === firstFilteredRow.tempId) ||
        r === firstFilteredRow
      );

      // Base opening balance = closing balance of the immediately preceding row in continuous ledger
      const baseOpenBal = firstIdx > 0 ? num(rows[firstIdx - 1].balance) : 0;

      // Available Opening Balance = Base Opening (Previous Closing) + Today's / Filtered Credit
      const openBal = baseOpenBal + totalCredit;

      const lastFilteredRow = filteredRows[filteredRows.length - 1];
      const baseCloseBal = num(lastFilteredRow.balance);
      const effectiveCloseBal = baseCloseBal + (num(manualAmount) || 0);

      return {
        count: filteredRows.length,
        baseOpeningBalance: baseOpenBal,
        openingBalance: openBal,
        closingBalance: effectiveCloseBal,
        totalCredit,
        totalDebit,
        finalBalance: baseCloseBal
      };
    } else {
      // When no rows match filter (e.g. newly selected date or month where no entries exist yet)
      let baseOpenBal = 0;
      if (selectedDate) {
        const selTime = parseRowDate(selectedDate);
        const priorRows = rows.filter(r => {
          const t = parseRowDate(r.date);
          return t > 0 && t < selTime;
        });
        if (priorRows.length > 0) {
          baseOpenBal = num(priorRows[priorRows.length - 1].balance);
        }
      } else if (selectedMonth && selectedMonth !== 'ALL') {
        const mIdx = MONTH_NAMES.findIndex(m => m.toLowerCase() === selectedMonth.toLowerCase());
        if (mIdx !== -1) {
          const priorRows = rows.filter(r => {
            const rM = getMonthFromDate(r.date);
            const rMIdx = MONTH_NAMES.findIndex(m => m.toLowerCase() === rM.toLowerCase());
            return rMIdx !== -1 && rMIdx < mIdx;
          });
          if (priorRows.length > 0) {
            baseOpenBal = num(priorRows[priorRows.length - 1].balance);
          }
        }
      }
      const openBal = baseOpenBal;
      const effectiveCloseBal = openBal + (num(manualAmount) || 0);
      return {
        count: 0,
        baseOpeningBalance: baseOpenBal,
        openingBalance: openBal,
        closingBalance: effectiveCloseBal,
        totalCredit: 0,
        totalDebit: 0,
        finalBalance: openBal
      };
    }
  }, [rows, filteredRows, manualAmount, selectedDate, selectedMonth]);

  // Export CSV
  const handleExportCsv = () => {
    const exportData = filteredRows.map((r, i) => ({
      'SL NO': i + 1,
      'DATE': r.date || '',
      'CREDIT (Rs)': r.credit || 0,
      'LEDGER NAME': r.ledgerName || '',
      'NAMES': r.names || '',
      'VEHICLE NO': r.vehicleNo || '',
      'DEBIT (Rs)': r.debit || 0,
      'BALANCE (Rs)': r.balance || 0,
      'REMARKS': r.remarks || '',
      'PDF URL': r.pdfUrl || ''
    }));
    exportToCsv(`Monoj_Bandhan_Ledger.csv`, exportData);
  };

  const thStyle = {
    position: 'sticky',
    top: 0,
    backgroundColor: '#0f172a',
    color: '#f8fafc',
    padding: '12px 10px',
    borderBottom: '2px solid #334155',
    borderRight: '1px solid #334155',
    fontSize: '12px',
    fontWeight: 800,
    textTransform: 'uppercase',
    textAlign: 'center',
    zIndex: 10,
    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
  };

  const tdStyle = {
    padding: '6px 8px',
    borderBottom: '1px solid #cbd5e1',
    borderRight: '1px solid #cbd5e1',
    fontSize: '13px'
  };

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2.5 }}>

      {/* Control Bar: Month, Date, Search, Opening Balance, Amount, Closing Balance & Actions */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          
          {/* Left section: Month, Date, Search, Opening Balance, Amount, Closing Balance */}
          <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
            
            {/* 1. Month Selector */}
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <Select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                displayEmpty
                sx={{
                  bgcolor: '#1e293b',
                  color: '#fff',
                  borderRadius: 1,
                  fontSize: '13px',
                  fontWeight: 600,
                  height: 38,
                  '.MuiOutlinedInput-notchedOutline': { borderColor: '#475569' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#64748b' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#60a5fa' },
                  '.MuiSvgIcon-root': { color: '#94a3b8' }
                }}
              >
                <MenuItem value="ALL" sx={{ fontSize: '13px', fontWeight: 600 }}>All Months</MenuItem>
                {MONTH_NAMES.map(m => (
                  <MenuItem key={m} value={m} sx={{ fontSize: '13px', fontWeight: 500 }}>{m}</MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* 2. Date Selector */}
            <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <TextField
                type="date"
                size="small"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{
                  width: 145,
                  bgcolor: '#1e293b',
                  borderRadius: 1,
                  input: { color: '#fff', fontSize: '13px', fontWeight: 600, py: '8.5px' },
                  '.MuiOutlinedInput-notchedOutline': { borderColor: '#475569' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#64748b' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#60a5fa' }
                }}
              />
              {selectedDate && (
                <IconButton
                  size="small"
                  onClick={() => setSelectedDate('')}
                  title="Clear Date Filter"
                  sx={{ position: 'absolute', right: 28, color: '#94a3b8', p: 0.2, '&:hover': { color: '#f87171' } }}
                >
                  <ClearIcon sx={{ fontSize: 16 }} />
                </IconButton>
              )}
            </Box>

            {/* 3. Search Bar */}
            <TextField
              size="small"
              placeholder="Search date, ledger, name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: <SearchIcon sx={{ color: '#94a3b8', mr: 1, fontSize: 20 }} />
              }}
              sx={{
                width: 220,
                bgcolor: '#1e293b',
                borderRadius: 1,
                input: { color: '#fff', fontSize: '13px' },
                '.MuiOutlinedInput-notchedOutline': { borderColor: '#475569' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#64748b' },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#60a5fa' }
              }}
            />

            {/* 4. OPENING BALANCE */}
            <Box
              title={summaryMetrics.baseOpeningBalance > 0
                ? `Base Opening (Previous Day Closing): ₹${formatAmt(summaryMetrics.baseOpeningBalance)} + Credit: ₹${formatAmt(summaryMetrics.totalCredit)} = ₹${formatAmt(summaryMetrics.openingBalance)}`
                : `Opening Balance (Credit): ₹${formatAmt(summaryMetrics.openingBalance)}`}
              sx={{
                bgcolor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: 1,
                px: 1.5,
                py: 0.5,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                minWidth: 125,
                height: 38,
                boxSizing: 'border-box'
              }}
            >
              <Typography sx={{ fontSize: '9px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                Opening Balance
              </Typography>
              <Typography sx={{
                fontSize: '13px',
                fontWeight: 900,
                color: summaryMetrics.openingBalance >= 0 ? '#4ade80' : '#f87171',
                lineHeight: 1.2
              }}>
                ₹{formatAmt(summaryMetrics.openingBalance)}
              </Typography>
            </Box>

            {/* 5. AMOUNT INPUT */}
            <Box sx={{
              bgcolor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 1,
              px: 1.5,
              py: 0.5,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              width: 130,
              height: 38,
              boxSizing: 'border-box'
            }}>
              <Typography sx={{ fontSize: '9px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                Amount
              </Typography>
              <input
                type="number"
                placeholder="0.00"
                value={manualAmount}
                onChange={(e) => setManualAmount(e.target.value)}
                style={{
                  width: '100%',
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  color: '#fbbf24',
                  fontSize: '13px',
                  fontWeight: 800,
                  padding: 0
                }}
              />
            </Box>

            {/* 6. CLOSING BALANCE */}
            <Box sx={{
              bgcolor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 1,
              px: 1.5,
              py: 0.5,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              minWidth: 125,
              height: 38,
              boxSizing: 'border-box'
            }}>
              <Typography sx={{ fontSize: '9px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                Closing Balance
              </Typography>
              <Typography sx={{
                fontSize: '13px',
                fontWeight: 900,
                color: summaryMetrics.closingBalance >= 0 ? '#4ade80' : '#f87171',
                lineHeight: 1.2
              }}>
                ₹{formatAmt(summaryMetrics.closingBalance)}
              </Typography>
            </Box>

          </Box>

          {/* Right Action buttons */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {selectedIds.size > 0 && (
              <Button
                variant="contained"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={() => setConfirmDelOpen(true)}
                sx={{ height: 38, px: 2, fontWeight: 700, bgcolor: '#ef4444', '&:hover': { bgcolor: '#dc2626' } }}
              >
                Delete ({selectedIds.size})
              </Button>
            )}

            <IconButton onClick={fetchData} sx={{ color: '#f8fafc', bgcolor: '#1e293b', border: '1px solid #334155', '&:hover': { bgcolor: '#334155' }, height: 38, width: 38 }}>
              <RefreshIcon sx={{ fontSize: 20 }} />
            </IconButton>

            <Button
              variant="contained"
              startIcon={<DownloadIcon />}
              onClick={handleExportCsv}
              sx={{ height: 38, px: 2, fontWeight: 700, bgcolor: '#0284c7', '&:hover': { bgcolor: '#0369a1' } }}
            >
              Export CSV
            </Button>

            <Button
              variant="contained"
              color="success"
              startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
              onClick={handleSaveAll}
              disabled={saving}
              sx={{ height: 38, px: 2.5, fontWeight: 800, bgcolor: '#16a34a', '&:hover': { bgcolor: '#15803d' } }}
            >
              Save Register
            </Button>

            <Button
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
              onClick={handleAddRow}
              sx={{ height: 38, px: 2.5, fontWeight: 800, bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}
            >
              Add Row
            </Button>
          </Box>

        </Box>
      </Box>

      {/* Main Ledger Table */}
      <Box ref={tableContainerRef} sx={{ flex: 1, overflow: 'auto', borderRadius: 2, border: '1px solid #334155', bgcolor: '#fff', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.3)', position: 'relative', minHeight: 380 }}>
        {loading && (
          <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(255,255,255,0.7)', zIndex: 20 }}>
            <CircularProgress />
          </Box>
        )}

        <table style={{ width: '100%', minWidth: '1600px', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: '45px' }}>
                <Checkbox
                  size="small"
                  checked={isAllSelected}
                  indeterminate={isSomeSelected}
                  onChange={toggleSelectAll}
                  disabled={filteredRows.length === 0}
                  sx={{ p: 0, color: '#94a3b8', '&.Mui-checked': { color: '#60a5fa' } }}
                />
              </th>
              <th style={{ ...thStyle, width: '70px' }}>SL NO</th>
              <th style={{ ...thStyle, width: '140px' }}>DATE</th>
              <th style={{ ...thStyle, width: '150px' }}>CREDIT</th>
              <th style={{ ...thStyle, width: '190px' }}>LEDGER NAME</th>
              <th style={{ ...thStyle, width: '190px' }}>NAMES</th>
              <th style={{ ...thStyle, width: '180px' }}>VEHICLE NO</th>
              <th style={{ ...thStyle, width: '150px' }}>DEBIT</th>
              <th style={{ ...thStyle, width: '160px' }}>BALANCE</th>
              <th style={{ ...thStyle, width: '240px' }}>REMARKS</th>
              <th style={{ ...thStyle, width: '180px' }}>PDF UPLOAD</th>
              <th style={{ ...thStyle, width: '70px' }}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 && !loading && (
              <tr>
                <td colSpan={12} style={{ textAlign: 'center', padding: '48px', color: '#64748b', fontWeight: 600 }}>
                  No entries recorded for MONOJ BANDHAN yet. Click "+ Add Row" to add a new transaction.
                </td>
              </tr>
            )}

            {filteredRows.map((row, index) => {
              const rowId = row._id || row.tempId || `temp-${index}`;
              const isChecked = selectedIds.has(rowId);
              const isUploading = uploadingId === rowId;

              return (
                <tr key={rowId} style={{ backgroundColor: isChecked ? '#eff6ff' : index % 2 === 0 ? '#ffffff' : '#f8fafc', transition: 'background-color 0.15s' }}>
                  {/* Select Checkbox */}
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <Checkbox
                      size="small"
                      checked={isChecked}
                      onChange={() => toggleSelectRow(rowId)}
                      sx={{ p: 0 }}
                    />
                  </td>

                  {/* 1. SL NO (PERSISTENT / DATABASE LINKED) */}
                  <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 800, color: '#475569', backgroundColor: '#f1f5f9' }}>
                    {row.slNo !== undefined && row.slNo !== null && row.slNo !== '' ? row.slNo : (index + 1)}
                  </td>

                  {/* 2. DATE (MANUAL DATE PICKER) */}
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <input
                      type="date"
                      value={row.date || ''}
                      onChange={(e) => handleCellChange(rowId, 'date', e.target.value)}
                      style={{
                        width: '100%',
                        border: '1px solid #cbd5e1',
                        borderRadius: '4px',
                        padding: '4px 6px',
                        outline: 'none',
                        fontSize: '13px',
                        fontWeight: 600,
                        color: '#0f172a',
                        textAlign: 'center',
                        backgroundColor: '#fff'
                      }}
                    />
                  </td>

                  {/* 3. CREDIT (MANUAL NUMERIC INPUT) */}
                  <td style={{ ...tdStyle, backgroundColor: '#fef3c7' }}>
                    <input
                      type="number"
                      value={row.credit !== undefined ? row.credit : 0}
                      onChange={(e) => handleCellChange(rowId, 'credit', e.target.value)}
                      placeholder="0.00"
                      style={{
                        width: '100%',
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        fontSize: '13px',
                        fontWeight: 800,
                        textAlign: 'right',
                        color: '#b45309',
                        paddingRight: '6px'
                      }}
                    />
                  </td>

                  {/* 4. LEDGER NAME (BANK BOOK DROPDOWN SYSTEM) */}
                  <td style={{ ...tdStyle, padding: '2px 4px' }}>
                    <Autocomplete
                      options={LEDGER_OPTIONS}
                      value={row.ledgerName || ''}
                      freeSolo
                      onChange={(event, newValue) => {
                        handleCellChange(rowId, 'ledgerName', newValue || '');
                      }}
                      onInputChange={(event, newInputValue, reason) => {
                        if (reason === 'input' || reason === 'clear') {
                          handleCellChange(rowId, 'ledgerName', newInputValue || '');
                        }
                      }}
                      ListboxProps={{
                        style: {
                          background: 'rgba(255, 255, 255, 0.98)',
                          backdropFilter: 'blur(8px)',
                          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                          border: '1px solid #e2e8f0',
                          borderRadius: '10px',
                          padding: '4px',
                          maxHeight: '300px'
                        }
                      }}
                      renderOption={(props, option) => (
                        <li {...props} style={{
                          fontSize: '13px',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          color: '#334155',
                          backgroundColor: props['aria-selected'] === true ? '#eff6ff' : 'transparent'
                        }}>
                          {option}
                        </li>
                      )}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          variant="standard"
                          placeholder="Search Ledger..."
                          InputProps={{
                            ...params.InputProps,
                            disableUnderline: true,
                            style: {
                              fontSize: '12px',
                              padding: '6px 8px',
                              fontWeight: 600,
                              color: '#0f172a'
                            }
                          }}
                        />
                      )}
                    />
                  </td>

                  {/* 5. NAMES (BANK BOOK DROPDOWN SYSTEM) */}
                  <td style={{ ...tdStyle, padding: '2px 4px' }}>
                    <Autocomplete
                      options={dynamicNamesOptions}
                      value={row.names || ''}
                      freeSolo
                      onChange={(event, newValue) => {
                        handleOwnerChange(rowId, newValue || '');
                      }}
                      onInputChange={(event, newInputValue, reason) => {
                        if (reason === 'input' || reason === 'clear') {
                          handleOwnerChange(rowId, newInputValue || '');
                        }
                      }}
                      ListboxProps={{
                        style: {
                          background: 'rgba(255, 255, 255, 0.98)',
                          backdropFilter: 'blur(8px)',
                          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                          border: '1px solid #e2e8f0',
                          borderRadius: '10px',
                          padding: '4px',
                          maxHeight: '300px'
                        }
                      }}
                      renderOption={(props, option) => (
                        <li {...props} style={{
                          fontSize: '13px',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          color: '#334155',
                          backgroundColor: props['aria-selected'] === true ? '#eff6ff' : 'transparent'
                        }}>
                          {option}
                        </li>
                      )}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          variant="standard"
                          placeholder="Search Name..."
                          InputProps={{
                            ...params.InputProps,
                            disableUnderline: true,
                            style: {
                              fontSize: '12px',
                              padding: '6px 8px',
                              fontWeight: 600,
                              color: '#0f172a'
                            }
                          }}
                        />
                      )}
                    />
                  </td>

                  {/* 6. VEHICLE NO (CONNECTED TO NAMES DROPDOWN - EXACT BANK BOOK LOGIC) */}
                  <td style={{ ...tdStyle, padding: '2px 4px' }}>
                    <Autocomplete
                      disabled={!row.names}
                      options={getVehiclesForOwner(row.names)}
                      value={row.vehicleNo || ''}
                      freeSolo
                      onChange={(event, newValue) => {
                        handleCellChange(rowId, 'vehicleNo', (newValue || '').toUpperCase());
                      }}
                      onInputChange={(event, newInputValue, reason) => {
                        if (reason === 'input' || reason === 'clear') {
                          handleCellChange(rowId, 'vehicleNo', (newInputValue || '').toUpperCase());
                        }
                      }}
                      ListboxProps={{
                        style: {
                          background: 'rgba(255, 255, 255, 0.98)',
                          backdropFilter: 'blur(8px)',
                          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                          border: '1px solid #e2e8f0',
                          borderRadius: '10px',
                          padding: '4px',
                          maxHeight: '300px'
                        }
                      }}
                      renderOption={(props, option) => (
                        <li {...props} style={{
                          fontSize: '13px',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          color: '#0f172a',
                          fontWeight: 700,
                          backgroundColor: props['aria-selected'] === true ? '#eff6ff' : 'transparent'
                        }}>
                          {option}
                        </li>
                      )}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          variant="standard"
                          placeholder={row.names ? "Search Vehicle..." : "Select Owner first..."}
                          InputProps={{
                            ...params.InputProps,
                            disableUnderline: true,
                            style: {
                              fontSize: '12px',
                              padding: '6px 8px',
                              fontWeight: 700,
                              color: row.names ? '#0f172a' : '#94a3b8',
                              textTransform: 'uppercase'
                            }
                          }}
                        />
                      )}
                    />
                  </td>

                  {/* 7. DEBIT (MANUAL NUMERIC INPUT) */}
                  {(() => {
                    const dVal = Number(row.debit) || 0;
                    const pVal = Number(row.paidAmount) || 0;
                    const isPaid = dVal > 0 && (pVal >= dVal || row.status === 'Paid' || row.status === 'Cleared');
                    const isPartial = dVal > 0 && !isPaid && pVal > 0;
                    // Paid => Green (#16a34a), Partial => Amber (#d97706), Pending / Unpaid => Red (#dc2626)
                    const debitColor = isPaid ? '#16a34a' : (isPartial ? '#d97706' : (dVal > 0 ? '#dc2626' : '#64748b'));
                    const titleText = dVal === 0
                      ? ''
                      : isPaid
                      ? `Status: Paid (₹${(pVal || dVal).toLocaleString('en-IN')})`
                      : isPartial
                      ? `Status: Partial Paid (Paid: ₹${pVal.toLocaleString('en-IN')}, Due: ₹${(dVal - pVal).toLocaleString('en-IN')})`
                      : `Status: Pending / Unpaid (₹${dVal.toLocaleString('en-IN')})`;

                    return (
                      <td style={{ ...tdStyle, backgroundColor: '#e0f2fe' }}>
                        <input
                          type="number"
                          value={row.debit !== undefined ? row.debit : 0}
                          onChange={(e) => handleCellChange(rowId, 'debit', e.target.value)}
                          placeholder="0.00"
                          title={titleText}
                          style={{
                            width: '100%',
                            border: 'none',
                            outline: 'none',
                            background: 'transparent',
                            fontSize: '13px',
                            fontWeight: 800,
                            textAlign: 'right',
                            color: debitColor,
                            paddingRight: '6px'
                          }}
                        />
                      </td>
                    );
                  })()}

                  {/* 8. BALANCE (AUTO CALCULATED ROW BY ROW) */}
                  <td style={{
                    ...tdStyle,
                    backgroundColor: row.balance >= 0 ? '#dcfce7' : '#fee2e2',
                    textAlign: 'right',
                    fontWeight: 900,
                    color: row.balance >= 0 ? '#15803d' : '#b91c1c',
                    paddingRight: '12px'
                  }}>
                    ₹{formatAmt(row.balance)}
                  </td>

                  {/* 9. REMARKS (MANUAL TEXT INPUT) */}
                  <td style={{ ...tdStyle }}>
                    <input
                      type="text"
                      value={row.remarks || ''}
                      onChange={(e) => handleCellChange(rowId, 'remarks', e.target.value)}
                      placeholder="Enter remarks / notes..."
                      style={{
                        width: '100%',
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        fontSize: '13px',
                        color: '#334155'
                      }}
                    />
                  </td>

                  {/* 10. PDF UPLOAD */}
                  <td style={{ ...tdStyle, textAlign: 'center', padding: '4px 6px' }}>
                    {isUploading ? (
                      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                        <CircularProgress size={16} sx={{ color: '#2563eb' }} />
                        <Typography variant="caption" sx={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                          Uploading...
                        </Typography>
                      </Box>
                    ) : row.pdfUrl ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                        <Tooltip title={row.pdfName || 'Document.pdf'} arrow>
                          <Box
                            sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 0.5,
                              maxWidth: '80px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              px: 0.6,
                              py: 0.25,
                              borderRadius: '4px',
                              bgcolor: '#f1f5f9',
                              border: '1px solid #e2e8f0',
                              fontSize: '11px',
                              fontWeight: 600,
                              color: '#334155'
                            }}
                          >
                            <PictureAsPdfIcon sx={{ fontSize: 13, color: '#ef4444', flexShrink: 0 }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {row.pdfName || 'PDF'}
                            </span>
                          </Box>
                        </Tooltip>

                        {/* View PDF in new tab */}
                        <Tooltip title="View / Open PDF" arrow>
                          <IconButton
                            size="small"
                            onClick={() => window.open(row.pdfUrl, '_blank')}
                            sx={{ color: '#2563eb', p: 0.35, '&:hover': { bgcolor: '#eff6ff' } }}
                          >
                            <OpenInNewIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>

                        {/* Replace PDF */}
                        <Tooltip title="Replace PDF" arrow>
                          <label htmlFor={`pdf-replace-${rowId}`} style={{ display: 'inline-flex', margin: 0, cursor: 'pointer' }}>
                            <input
                              id={`pdf-replace-${rowId}`}
                              type="file"
                              accept="application/pdf"
                              style={{ display: 'none' }}
                              onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                  handlePdfUpload(row, e.target.files[0]);
                                  e.target.value = '';
                                }
                              }}
                            />
                            <IconButton
                              component="span"
                              size="small"
                              sx={{ color: '#64748b', p: 0.35, '&:hover': { bgcolor: '#f1f5f9', color: '#1e293b' } }}
                            >
                              <CloudUploadIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </label>
                        </Tooltip>

                        {/* Remove PDF */}
                        <Tooltip title="Remove PDF" arrow>
                          <IconButton
                            size="small"
                            onClick={() => handlePdfRemove(row)}
                            sx={{ color: '#94a3b8', p: 0.35, '&:hover': { bgcolor: '#fee2e2', color: '#ef4444' } }}
                          >
                            <ClearIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    ) : (
                      <label htmlFor={`pdf-upload-${rowId}`} style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', margin: 0 }}>
                        <input
                          id={`pdf-upload-${rowId}`}
                          type="file"
                          accept="application/pdf"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              handlePdfUpload(row, e.target.files[0]);
                              e.target.value = '';
                            }
                          }}
                        />
                        <Box
                          component="span"
                          sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 0.5,
                            px: 1.1,
                            py: 0.35,
                            borderRadius: '5px',
                            fontSize: '11px',
                            fontWeight: 700,
                            color: '#2563eb',
                            bgcolor: '#eff6ff',
                            border: '1px dashed #93c5fd',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                            '&:hover': { bgcolor: '#dbeafe', borderColor: '#3b82f6' }
                          }}
                        >
                          <CloudUploadIcon sx={{ fontSize: 13 }} />
                          Upload PDF
                        </Box>
                      </label>
                    )}
                  </td>

                  {/* Individual Delete Action */}
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <IconButton
                      size="small"
                      onClick={() => handleDeleteSingle(rowId)}
                      sx={{ color: '#ef4444', p: 0.5, '&:hover': { bgcolor: 'rgba(239, 68, 68, 0.1)' } }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </td>
                </tr>
              );
            })}

            {/* Total Row */}
            {filteredRows.length > 0 && (
              <tr style={{ backgroundColor: '#f1f5f9', fontWeight: 900 }}>
                <td style={{ ...tdStyle, backgroundColor: '#e2e8f0' }}></td>
                <td colSpan={2} style={{ ...tdStyle, textAlign: 'right', paddingRight: '12px', fontSize: '13px', color: '#0f172a', backgroundColor: '#e2e8f0' }}>
                  TOTAL SUMMARY
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', paddingRight: '6px', fontSize: '13px', color: '#b45309', backgroundColor: '#fef3c7' }}>
                  ₹{formatAmt(summaryMetrics.totalCredit)}
                </td>
                <td colSpan={3} style={{ ...tdStyle, backgroundColor: '#e2e8f0' }}></td>
                <td style={{ ...tdStyle, textAlign: 'right', paddingRight: '6px', fontSize: '13px', color: '#0369a1', backgroundColor: '#e0f2fe' }}>
                  ₹{formatAmt(summaryMetrics.totalDebit)}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', paddingRight: '12px', fontSize: '13px', color: summaryMetrics.finalBalance >= 0 ? '#15803d' : '#b91c1c', backgroundColor: summaryMetrics.finalBalance >= 0 ? '#dcfce7' : '#fee2e2' }}>
                  ₹{formatAmt(summaryMetrics.finalBalance)}
                </td>
                <td colSpan={3} style={{ ...tdStyle, backgroundColor: '#e2e8f0' }}></td>
              </tr>
            )}
          </tbody>
        </table>
      </Box>

      {/* Delete Confirmation Modal */}
      <Dialog open={confirmDelOpen} onClose={() => !deleting && setConfirmDelOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, color: '#0f172a' }}>
          Confirm Deletion
        </DialogTitle>
        <DialogContent>
          <Typography color="#334155" fontSize="14px">
            Are you sure you want to delete the selected row(s)?
          </Typography>
          <Typography variant="body2" color="#dc2626" mt={1.5} fontWeight={700}>
            {selectedIds.size} record(s) selected for deletion.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setConfirmDelOpen(false)} disabled={deleting} sx={{ color: '#64748b', fontWeight: 600 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleConfirmDelete}
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={18} color="inherit" /> : <DeleteIcon />}
            sx={{ fontWeight: 700, bgcolor: '#ef4444', '&:hover': { bgcolor: '#dc2626' } }}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!snack}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack?.severity || 'info'} onClose={() => setSnack(null)} sx={{ fontWeight: 600 }}>
          {snack?.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}



