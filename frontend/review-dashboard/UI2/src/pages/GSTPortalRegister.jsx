import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import SearchableSelect from '../components/SearchableSelect';
import {
  Box, Button, CircularProgress, Typography, IconButton,
  Snackbar, Alert, Chip, Tooltip, Select, MenuItem,
  Tabs, Tab, Dialog, DialogTitle, DialogContent, DialogActions,
  Radio, RadioGroup, FormControlLabel, FormControl, FormLabel,
  TextField, InputAdornment
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import TableChartIcon from '@mui/icons-material/TableChart';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import SyncIcon from '@mui/icons-material/Sync';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import axios from 'axios';
import { io } from 'socket.io-client';
import * as XLSX from 'xlsx';
import { useShortcut } from '../context/ShortcutContext';
import { useTableNavigation } from '../hooks/useTableNavigation';
import Gstr1Tab from '../components/Gstr1Tab';

const API_URL = import.meta.env.VITE_API_URL;

// ─── Column Definitions ───────────────────────────────────────────────────────
const COLUMNS = [
  { key: 'SL NO', label: 'SL\nNO', width: 60, type: 'auto' },
  { key: 'GSTIN of Supplier', label: 'GSTIN OF\nSUPPLIER', width: 160, type: 'manual' },
  { key: 'Trade / Legal Name', label: 'TRADE /\nLEGAL NAME', width: 220, type: 'manual' },
  { key: 'Invoice Number', label: 'INVOICE\nNUMBER', width: 150, type: 'manual' },
  { key: 'Invoice Type', label: 'INVOICE\nTYPE', width: 130, type: 'manual' },
  { key: 'Invoice Date', label: 'INVOICE\nDATE', width: 120, type: 'manual' },
  { key: 'Invoice Value', label: 'INVOICE\nVALUE', width: 130, type: 'manual' },
  { key: 'Place of Supply', label: 'PLACE OF\nSUPPLY', width: 160, type: 'manual' },
  { key: 'Supply attract reverse charge', label: 'REVERSE\nCHARGE', width: 110, type: 'dropdown', options: ['', 'Yes', 'No'] },
  { key: 'Taxable Value', label: 'TAXABLE\nVALUE', width: 130, type: 'manual' },
  { key: 'Integrated Tax', label: 'INTEGRATED\nTAX', width: 130, type: 'manual' },
  { key: 'CGST', label: 'CGST', width: 120, type: 'manual' },
  { key: 'SGST', label: 'SGST', width: 120, type: 'manual' },
  { key: 'Cess', label: 'CESS', width: 120, type: 'manual' },
  { key: 'GSTR-1/1A/IFF/GSTR-5 Period', label: 'GSTR\nPERIOD', width: 140, type: 'manual' },
  { key: 'GSTR-1/1A/IFF/GSTR-5 Filing Date', label: 'GSTR\nFILING DATE', width: 140, type: 'manual' },
  { key: 'ITC Availability', label: 'ITC\nAVAILABILITY', width: 140, type: 'manual' },
  { key: 'Reason', label: 'REASON', width: 160, type: 'manual' },
  { key: 'Applicable % Tax Rate', label: 'APPLICABLE %\nTAX RATE', width: 130, type: 'manual' },
  { key: 'Source', label: 'SOURCE', width: 130, type: 'manual' },
  { key: 'IRN', label: 'IRN', width: 180, type: 'manual' },
  { key: 'IRN Date', label: 'IRN\nDATE', width: 130, type: 'manual' },
  { key: 'GST_FILE_URL', label: 'GST FILE\nATTACHMENT', width: 160, type: 'upload' }
];

const LIABILITY_COLUMNS = [
  { key: 'SL NO', label: 'SL\nNO', width: 60, type: 'auto' },
  { key: 'Invoice Date', label: 'Invoice\nDate', width: 120, type: 'manual' },
  { key: 'Invoice Number', label: 'Invoice\nNumber', width: 160, type: 'manual' },
  { key: 'Month', label: 'Month', width: 100, type: 'manual' },
  { key: 'SITE', label: 'SITE', width: 160, type: 'manual' },
  { key: 'BILL', label: 'BILL', width: 140, type: 'manual' },
  { key: 'Amount', label: 'Amount', width: 130, type: 'manual' },
  { key: 'GST(18%)', label: 'GST(18%)', width: 130, type: 'calc', formula: r => Math.round(parseFloat(r.Amount || 0) * 0.18) },
  { key: 'Total Amount', label: 'Total Amount', width: 140, type: 'calc', formula: r => Math.round(parseFloat(r.Amount || 0) * 1.18) }
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const SOCKET_URL = import.meta.env.VITE_SOCKET_IO_URL || import.meta.env.VITE_API_URL;
const socket = io(SOCKET_URL, {
  autoConnect: true,
  transports: ["websocket", "polling"]
});

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function GSTPortalRegister({ onBack }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [snack, setSnack] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [uploadingObj, setUploadingObj] = useState(null); // { id: rowId }
  const [activeTab, setActiveTab] = useState(0);
  const now = new Date();
  const [filterMonth, setFilterMonth] = useState(now.getMonth() + 1);
  const [filterYear, setFilterYear] = useState(now.getFullYear());
  const years = useMemo(() => Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i), [now]);
  const [syncing, setSyncing] = useState(false);
  const [inputReceived, setInputReceived] = useState(0);
  const [tempInputReceived, setTempInputReceived] = useState('0');
  const [savingSummary, setSavingSummary] = useState(false);

  const tableContainerRef = useRef(null);
  useTableNavigation(tableContainerRef);

  const fileInputRef = useRef(null);
  const [targetRowIdForUpload, setTargetRowIdForUpload] = useState(null);

  const excelInputRef = useRef(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const [importSheetName, setImportSheetName] = useState('');
  const [importColCount, setImportColCount] = useState(0);
  const [parsedRows, setParsedRows] = useState([]);
  const [duplicateHandlingMode, setDuplicateHandlingMode] = useState('skip');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null); // { imported: 0, skipped: 0, failed: 0 }

  const [doneModalOpen, setDoneModalOpen] = useState(false);
  const [doneSearchTerm, setDoneSearchTerm] = useState('');
  const [markingDone, setMarkingDone] = useState(false);

  const activeB2BRows = useMemo(() => {
    return entries.filter(e => (!e.type || e.type === 'b2b') && e.status !== 'DONE');
  }, [entries]);

  const doneB2BRows = useMemo(() => {
    return entries.filter(e => (!e.type || e.type === 'b2b') && e.status === 'DONE');
  }, [entries]);

  const allSelected = useMemo(() => {
    if (activeTab === 1) {
      return activeB2BRows.length > 0 && activeB2BRows.every(r => selectedIds.has(r._id));
    }
    const currentList = activeTab === 2
      ? entries.filter(e => e.type === 'liability' && Number(e.filterMonth) === Number(filterMonth) && Number(e.filterYear) === Number(filterYear))
      : entries;
    return currentList.length > 0 && currentList.every(r => selectedIds.has(r._id));
  }, [activeTab, activeB2BRows, entries, selectedIds, filterMonth, filterYear]);

  const someSelected = useMemo(() => {
    if (activeTab === 1) {
      return activeB2BRows.some(r => selectedIds.has(r._id)) && !allSelected;
    }
    const currentList = activeTab === 2
      ? entries.filter(e => e.type === 'liability' && Number(e.filterMonth) === Number(filterMonth) && Number(e.filterYear) === Number(filterYear))
      : entries;
    return currentList.some(r => selectedIds.has(r._id)) && !allSelected;
  }, [activeTab, activeB2BRows, entries, selectedIds, allSelected, filterMonth, filterYear]);

  const toggleSelect = (id) => setSelectedIds(prev => {
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  });

  const toggleSelectAll = () => {
    if (allSelected || someSelected) {
      if (activeTab === 1) {
        setSelectedIds(prev => {
          const s = new Set(prev);
          activeB2BRows.forEach(r => s.delete(r._id));
          return s;
        });
      } else {
        setSelectedIds(new Set());
      }
    } else {
      if (activeTab === 1) {
        setSelectedIds(prev => {
          const s = new Set(prev);
          activeB2BRows.forEach(r => s.add(r._id));
          return s;
        });
      } else {
        setSelectedIds(new Set(entries.map(v => v._id)));
      }
    }
  };

  // ── Mark Selected B2B Rows as DONE ─────────────────────────────────────────
  const handleMarkDone = async () => {
    const activeIdsToMark = activeB2BRows
      .filter(r => selectedIds.has(r._id))
      .map(r => r._id);

    if (activeIdsToMark.length === 0) {
      setSnack({ severity: 'info', msg: 'Please select one or more B2B rows to mark as Done.' });
      return;
    }

    try {
      setMarkingDone(true);
      const token = localStorage.getItem('token');
      const nowIso = new Date().toISOString();

      // Optimistic update: immediately remove from active list
      setEntries(prev => prev.map(r =>
        activeIdsToMark.includes(r._id)
          ? { ...r, status: 'DONE', doneAt: nowIso }
          : r
      ));
      setSelectedIds(prev => {
        const next = new Set(prev);
        activeIdsToMark.forEach(id => next.delete(id));
        return next;
      });

      const res = await axios.post(`${API_URL}/gst-portal/b2b/mark-done`,
        { ids: activeIdsToMark },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data?.success) {
        setSnack({
          severity: 'success',
          msg: `Marked ${activeIdsToMark.length} B2B record(s) as DONE and moved to Done Records.`
        });
      }
    } catch (err) {
      console.error('Mark Done error:', err);
      fetchData();
      setSnack({
        severity: 'error',
        msg: 'Failed to mark records as Done: ' + (err.response?.data?.error || err.message)
      });
    } finally {
      setMarkingDone(false);
    }
  };

  // ── Done Records Filtering & Sorting ──────────────────────────────────────
  const sortedDoneRows = useMemo(() => {
    return [...doneB2BRows].sort((a, b) => {
      const tA = a.doneAt ? new Date(a.doneAt).getTime() : 0;
      const tB = b.doneAt ? new Date(b.doneAt).getTime() : 0;
      if (tA && tB && tA !== tB) return tB - tA; // latest DONE first
      return (Number(a['SL NO']) || 0) - (Number(b['SL NO']) || 0);
    });
  }, [doneB2BRows]);

  const filteredDoneRows = useMemo(() => {
    if (!doneSearchTerm.trim()) return sortedDoneRows;
    const q = doneSearchTerm.toLowerCase();
    return sortedDoneRows.filter(r =>
      String(r['SL NO'] || '').toLowerCase().includes(q) ||
      String(r['Invoice Number'] || '').toLowerCase().includes(q) ||
      String(r['GSTIN of Supplier'] || '').toLowerCase().includes(q) ||
      String(r['Trade / Legal Name'] || '').toLowerCase().includes(q) ||
      String(r['Invoice Date'] || '').toLowerCase().includes(q) ||
      String(r['Invoice Value'] || '').toLowerCase().includes(q) ||
      String(r['Taxable Value'] || '').toLowerCase().includes(q)
    );
  }, [sortedDoneRows, doneSearchTerm]);

  const doneTotals = useMemo(() => {
    let invVal = 0, taxVal = 0, cgst = 0, sgst = 0, igst = 0;
    filteredDoneRows.forEach(r => {
      invVal += parseFloat(r['Invoice Value'] || 0) || 0;
      taxVal += parseFloat(r['Taxable Value'] || 0) || 0;
      cgst += parseFloat(r['CGST'] || 0) || 0;
      sgst += parseFloat(r['SGST'] || 0) || 0;
      igst += parseFloat(r['Integrated Tax'] || 0) || 0;
    });
    return { invVal, taxVal, cgst, sgst, igst, totalTax: cgst + sgst + igst };
  }, [filteredDoneRows]);

  const handleExportDone = () => {
    if (filteredDoneRows.length === 0) return;
    const exportCols = COLUMNS.filter(c => c.type !== 'upload');
    const rows = filteredDoneRows.map(v => {
      const row = {};
      exportCols.forEach(c => {
        const val = v[c.key];
        row[c.label.replace(/\n/g, ' ')] = val !== null && val !== undefined ? String(val) : '';
      });
      row['Status'] = 'DONE';
      row['Done Date'] = v.doneAt ? new Date(v.doneAt).toLocaleString('en-IN') : '';
      return row;
    });
    import('../utils/exportCsv').then(({ exportToCsv }) =>
      exportToCsv('gst_portal_done_b2b_records.xls', rows)
    );
  };


  // ── Fetch ────────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/gst-portal`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) {
        setEntries(res.data.entries);

        // Find input received for current month/year
        const summary = res.data.entries.find(e =>
          e.type === 'liability_summary' &&
          Number(e.filterMonth) === Number(filterMonth) &&
          Number(e.filterYear) === Number(filterYear)
        );
        const val = summary ? Number(summary.value || 0) : 0;
        setInputReceived(val);
        setTempInputReceived(String(val));
      }
    } catch (error) {
      console.error('Fetch error:', error);
    } finally { setLoading(false); }
  }, [filterMonth, filterYear]);

  useEffect(() => {
    fetchData();
    const onUpdate = (data) => {
      fetchData();
      if (data?.action === 'syncLiabilities') {
        setSnack({ severity: 'success', msg: 'Liabilities synced from Bill Register' });
      }
    };
    socket.on('gstPortalUpdates', onUpdate);
    return () => socket.off('gstPortalUpdates', onUpdate);
  }, [fetchData]);

  // ── Sync from Bill Register ───────────────────────────────────────────────
  const handleSyncLiabilities = async () => {
    try {
      setSyncing(true);
      const token = localStorage.getItem('token');
      const res = await axios.post(`${API_URL}/gst-portal/sync-liabilities`,
        { month: filterMonth, year: filterYear },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.success) {
        setSnack({ severity: 'success', msg: `Successfully synced ${res.data.count} records from Bill Register!` });
        fetchData();
      }
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Sync failed: ' + (err.response?.data?.error || err.message) });
    } finally {
      setSyncing(false);
    }
  };

  const handleInputReceivedSave = async () => {
    const numVal = parseFloat(tempInputReceived) || 0;
    try {
      setSavingSummary(true);
      const summary = entries.find(e =>
        e.type === 'liability_summary' &&
        Number(e.filterMonth) === Number(filterMonth) &&
        Number(e.filterYear) === Number(filterYear)
      );
      const payload = {
        type: 'liability_summary',
        filterMonth,
        filterYear,
        value: numVal
      };
      const token = localStorage.getItem('token');
      if (summary) {
        await axios.put(`${API_URL}/gst-portal/${summary._id}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        await axios.post(`${API_URL}/gst-portal`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      setInputReceived(numVal);
      setSnack({ severity: 'success', msg: 'Summary updated successfully' });
      fetchData();
    } catch (err) {
      console.error('Save summary error:', err);
      setSnack({ severity: 'error', msg: 'Failed to save summary' });
    } finally {
      setSavingSummary(false);
    }
  };

  // ── Row Insert ─────────────────────────────────────────────────────────────
  const handleAddNewRow = async () => {
    try {
      const token = localStorage.getItem('token');
      if (activeTab === 0) {
        setSnack({ severity: 'info', msg: 'GSTR_1 functionality is not yet available.' });
        return;
      }
      const currentEntries = activeTab === 1
        ? entries.filter(e => !e.type || e.type === 'b2b')
        : entries.filter(e => e.type === 'liability');

      const nextSlNo = currentEntries.length > 0 ? Math.max(...currentEntries.map(e => e['SL NO'] || 0)) + 1 : 1;

      const payload = { "SL NO": nextSlNo, type: activeTab === 1 ? 'b2b' : 'liability' };
      if (activeTab === 2) {
        payload.filterMonth = filterMonth;
        payload.filterYear = filterYear;
      }

      const res = await axios.post(`${API_URL}/gst-portal`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.success) {
        setEntries(prev => [...prev, res.data.entry]);
        setSnack({ severity: 'success', msg: 'New row added' });
      }
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Failed to add row: ' + err.message });
    }
  };

  // ── Cell edit (Real-time Auto-save) ────────────────────────────────────────
  const handleCellEdit = useCallback(async (rowId, field, value) => {
    // Optimistic UI Update
    setEntries(prev => prev.map(r => r._id === rowId ? { ...r, [field]: value } : r));

    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API_URL}/gst-portal/${rowId}`,
        { [field]: value },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Auto-save failed: ' + (err.response?.data?.error || err.message) });
    }
  }, []);

  // ── Delete selected ─────────────────────────────────────────────────────────
  const handleBulkDelete = async () => {
    setConfirmDel(true);
  };
  const handleSave = () => { };
  const handleDelete = async () => {
    setDeleting(true);
    try {
      const token = localStorage.getItem('token');
      const ids = [...selectedIds];
      await axios.delete(`${API_URL}/gst-portal/bulk-delete`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { ids }
      });
      setEntries(prev => prev.filter(v => !ids.includes(v._id)));
      setSelectedIds(new Set());
      setConfirmDel(false);
      setSnack({ severity: 'success', msg: `${ids.length} entry(s) deleted.` });
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Delete failed: ' + (err.response?.data?.error || err.message) });
    } finally { setDeleting(false); }
  };

  // ── Upload GST File ─────────────────────────────────────────────────────────
  const handleTriggerUpload = (rowId) => {
    setTargetRowIdForUpload(rowId);
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const onFileSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !targetRowIdForUpload) return;

    setUploadingObj(targetRowIdForUpload);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', file);
      const res = await axios.post(`${API_URL}/gst-portal/attach/${targetRowIdForUpload}/gst_file`, formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
      });
      if (res.data.success) {
        setSnack({ severity: 'success', msg: 'File uploaded successfully!' });
        setEntries(prev => prev.map(row =>
          row._id === targetRowIdForUpload ? { ...row, [res.data.field]: res.data.url } : row
        ));
      }
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Upload failed: ' + err.message });
    } finally {
      setUploadingObj(null);
      setTargetRowIdForUpload(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const getColumnKeysAndLabels = () => {
    const map = {};
    COLUMNS.forEach(col => {
      if (col.key === 'SL NO' || col.key === 'GST_FILE_URL') return;

      const possibleMatches = new Set([
        normalizeHeader(col.key),
        normalizeHeader(col.label)
      ]);

      // Also add explicit clean variants for standard B2B columns
      if (col.key === 'GSTIN of Supplier') {
        possibleMatches.add('gstin');
        possibleMatches.add('supplier gstin');
      }
      if (col.key === 'Trade / Legal Name') {
        possibleMatches.add('trade name');
        possibleMatches.add('legal name');
        possibleMatches.add('trade / legal name');
        possibleMatches.add('trade/legal name');
      }
      if (col.key === 'Invoice Number') {
        possibleMatches.add('invoice no');
        possibleMatches.add('invoice no.');
        possibleMatches.add('inv no');
        possibleMatches.add('inv no.');
      }
      if (col.key === 'Invoice Date') {
        possibleMatches.add('inv date');
      }
      if (col.key === 'Invoice Value') {
        possibleMatches.add('inv value');
        possibleMatches.add('invoice value (rs)');
        possibleMatches.add('invoice value (inr)');
        possibleMatches.add('invoice value (₹)');
      }
      if (col.key === 'Supply attract reverse charge') {
        possibleMatches.add('reverse charge');
        possibleMatches.add('rev charge');
      }
      if (col.key === 'Taxable Value') {
        possibleMatches.add('taxable value (rs)');
        possibleMatches.add('taxable value (inr)');
        possibleMatches.add('taxable value (₹)');
      }
      if (col.key === 'Integrated Tax') {
        possibleMatches.add('igst');
        possibleMatches.add('integrated tax (rs)');
        possibleMatches.add('integrated tax (inr)');
        possibleMatches.add('integrated tax (₹)');
      }
      if (col.key === 'CGST') {
        possibleMatches.add('cgst (rs)');
        possibleMatches.add('cgst (inr)');
        possibleMatches.add('cgst (₹)');
      }
      if (col.key === 'SGST') {
        possibleMatches.add('sgst (rs)');
        possibleMatches.add('sgst (inr)');
        possibleMatches.add('sgst (₹)');
      }
      if (col.key === 'Cess') {
        possibleMatches.add('cess (rs)');
        possibleMatches.add('cess (inr)');
        possibleMatches.add('cess (₹)');
      }

      map[col.key] = Array.from(possibleMatches);
    });
    return map;
  };

  const normalizeHeader = (h) => {
    return String(h || '')
      .replace(/\r?\n|\r/g, ' ') // Replace line breaks with space
      .replace(/\s+/g, ' ')      // Normalize repeated spaces to a single space
      .trim()
      .toLowerCase();
  };

  const parseExcelDate = (val) => {
    if (!val) return { isValid: false, reason: 'Empty date' };

    if (val instanceof Date) {
      if (isNaN(val.getTime())) {
        return { isValid: false, reason: 'Invalid Date Object' };
      }
      return { isValid: true, date: val };
    }

    if (typeof val === 'number') {
      const date = new Date((val - 25569) * 86400 * 1000);
      if (isNaN(date.getTime())) {
        return { isValid: false, reason: 'Invalid Excel Serial Date' };
      }
      return { isValid: true, date };
    }

    const str = String(val).trim();

    // Pattern 1: DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    const ddmmyyyy = str.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})$/);
    if (ddmmyyyy) {
      const d = parseInt(ddmmyyyy[1], 10);
      const m = parseInt(ddmmyyyy[2], 10);
      const y = parseInt(ddmmyyyy[3], 10);

      if (m < 1 || m > 12) {
        return { isValid: false, reason: 'Month must be between 1 and 12' };
      }
      const daysInMonth = new Date(y, m, 0).getDate();
      if (d < 1 || d > daysInMonth) {
        return { isValid: false, reason: `Day must be between 1 and ${daysInMonth} for month ${m}` };
      }

      return { isValid: true, date: new Date(y, m - 1, d) };
    }

    // Pattern 2: YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
    const yyyymmdd = str.match(/^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})$/);
    if (yyyymmdd) {
      const y = parseInt(yyyymmdd[1], 10);
      const m = parseInt(yyyymmdd[2], 10);
      const d = parseInt(yyyymmdd[3], 10);

      if (m < 1 || m > 12) {
        return { isValid: false, reason: 'Month must be between 1 and 12' };
      }
      const daysInMonth = new Date(y, m, 0).getDate();
      if (d < 1 || d > daysInMonth) {
        return { isValid: false, reason: `Day must be between 1 and ${daysInMonth} for month ${m}` };
      }

      return { isValid: true, date: new Date(y, m - 1, d) };
    }

    return { isValid: false, reason: 'Ambiguous format (use DD/MM/YYYY or YYYY-MM-DD)' };
  };

  const formatDateToString = (date) => {
    if (!date) return '';
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
  };

  const handleTriggerExcelUpload = () => {
    if (excelInputRef.current) {
      excelInputRef.current.click();
    }
  };

  const handleExcelFileSelected = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const dataStr = evt.target.result;
        const workbook = XLSX.read(dataStr, { type: 'binary', cellDates: true, cellNF: true, cellText: true });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          setSnack({ severity: 'error', msg: 'The Excel file contains no worksheets.' });
          return;
        }

        setImportSheetName(firstSheetName);

        const worksheet = workbook.Sheets[firstSheetName];
        if (!worksheet['!ref']) {
          setSnack({ severity: 'error', msg: 'The Excel worksheet is empty.' });
          return;
        }

        const range = XLSX.utils.decode_range(worksheet['!ref']);
        const excelRows = [];
        const rawHeaders = [];

        // 1. Extract raw headers from the first row
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cell_ref = XLSX.utils.encode_cell({ c: C, r: range.s.r });
          const cell = worksheet[cell_ref];
          let headerVal = '';
          if (cell) {
            headerVal = String(cell.v !== undefined && cell.v !== null ? cell.v : '').trim();
          }
          rawHeaders.push(headerVal);
        }

        setImportColCount(rawHeaders.filter(Boolean).length);

        // 2. Build column mapping dictionary
        const B2B_COLUMN_MATCHES = getColumnKeysAndLabels();
        const headerMapping = {}; // excelHeaderIndex -> B2B_Column_Key

        rawHeaders.forEach((rawHeader, index) => {
          if (!rawHeader) return;
          const normalized = normalizeHeader(rawHeader);

          let matchedKey = null;
          for (const key of Object.keys(B2B_COLUMN_MATCHES)) {
            const matches = B2B_COLUMN_MATCHES[key];
            if (matches.includes(normalized)) {
              matchedKey = key;
              break;
            }
          }
          if (matchedKey) {
            headerMapping[index] = matchedKey;
          }
        });

        // 3. Verify required headers are present
        const mappedB2BKeys = Object.values(headerMapping);
        if (!mappedB2BKeys.includes('GSTIN of Supplier')) {
          setSnack({ severity: 'error', msg: 'Required column not found: GSTIN OF SUPPLIER' });
          return;
        }
        if (!mappedB2BKeys.includes('Invoice Number')) {
          setSnack({ severity: 'error', msg: 'Required column not found: INVOICE NUMBER' });
          return;
        }
        if (!mappedB2BKeys.includes('Invoice Date')) {
          setSnack({ severity: 'error', msg: 'Required column not found: INVOICE DATE' });
          return;
        }

        // 4. Extract data rows preserving raw values exactly
        for (let R = range.s.r + 1; R <= range.e.r; ++R) {
          const rowData = {};
          let rowHasData = false;

          for (let C = range.s.c; C <= range.e.c; ++C) {
            const b2bKey = headerMapping[C];
            if (!b2bKey) continue;

            const cell_ref = XLSX.utils.encode_cell({ c: C, r: R });
            const cell = worksheet[cell_ref];

            let val = '';
            if (cell) {
              rowHasData = true;

              if (cell.t === 'd' || (cell.v instanceof Date)) {
                val = cell.v;
              } else if (cell.t === 'n') {
                val = cell.v; // Exact numeric value
              } else {
                if (typeof cell.v === 'number' && cell.w) {
                  val = cell.w; // leading zeros preserved
                } else {
                  val = cell.v !== undefined && cell.v !== null ? cell.v : '';
                }
              }
            }
            rowData[b2bKey] = val;
          }

          if (rowHasData) {
            excelRows.push(rowData);
          }
        }

        if (excelRows.length === 0) {
          setSnack({ severity: 'error', msg: 'No data rows found in worksheet.' });
          return;
        }

        // 5. Perform validation and duplicate check
        const validated = excelRows.map((mappedRow, index) => {
          const errors = [];

          let gstin = '';
          if (mappedRow['GSTIN of Supplier'] !== undefined && mappedRow['GSTIN of Supplier'] !== null) {
            gstin = String(mappedRow['GSTIN of Supplier']).trim();
          }
          if (!gstin) {
            errors.push({ column: 'GSTIN OF SUPPLIER', problem: 'Missing GSTIN' });
          } else if (!/^[A-Za-z0-9]{15}$/.test(gstin)) {
            errors.push({ column: 'GSTIN OF SUPPLIER', problem: 'Invalid GSTIN format (must be 15 alphanumeric characters)' });
          }

          let invNo = '';
          if (mappedRow['Invoice Number'] !== undefined && mappedRow['Invoice Number'] !== null) {
            invNo = String(mappedRow['Invoice Number']).trim();
          }
          if (!invNo) {
            errors.push({ column: 'INVOICE NUMBER', problem: 'Missing Invoice Number' });
          }

          const invDateVal = mappedRow['Invoice Date'];
          let formattedInvoiceDate = '';
          if (invDateVal === undefined || invDateVal === null || invDateVal === '') {
            errors.push({ column: 'INVOICE DATE', problem: 'Missing Invoice Date' });
          } else {
            const dateParseResult = parseExcelDate(invDateVal);
            if (!dateParseResult.isValid) {
              errors.push({ column: 'INVOICE DATE', problem: `Invalid date: ${dateParseResult.reason}` });
            } else {
              formattedInvoiceDate = formatDateToString(dateParseResult.date);
            }
          }

          const numericFields = ['Invoice Value', 'Taxable Value', 'Integrated Tax', 'CGST', 'SGST', 'Cess', 'Applicable % Tax Rate'];
          const convertedNumerics = {};
          numericFields.forEach(field => {
            const val = mappedRow[field];
            if (val === undefined || val === null || val === '') {
              convertedNumerics[field] = '';
            } else {
              const cleanStr = String(val).replace(/,/g, '');
              const num = parseFloat(cleanStr);
              if (isNaN(num)) {
                errors.push({ column: field.toUpperCase(), problem: `${field} must be a valid numeric value` });
              } else {
                convertedNumerics[field] = num; // Lossless precision
              }
            }
          });

          let revCharge = '';
          if (mappedRow['Supply attract reverse charge'] !== undefined && mappedRow['Supply attract reverse charge'] !== null) {
            const rawRev = String(mappedRow['Supply attract reverse charge']).trim().toLowerCase();
            if (rawRev === 'yes' || rawRev === 'y' || rawRev === 'true') {
              revCharge = 'Yes';
            } else if (rawRev === 'no' || rawRev === 'n' || rawRev === 'false') {
              revCharge = 'No';
            } else if (rawRev === '') {
              revCharge = '';
            } else {
              errors.push({ column: 'REVERSE CHARGE', problem: "Reverse Charge value must be 'Yes', 'No', or empty" });
            }
          }

          let formattedFilingDate = '';
          if (mappedRow['GSTR-1/1A/IFF/GSTR-5 Filing Date']) {
            const dateParse = parseExcelDate(mappedRow['GSTR-1/1A/IFF/GSTR-5 Filing Date']);
            if (dateParse.isValid) {
              formattedFilingDate = formatDateToString(dateParse.date);
            }
          }
          let formattedIrnDate = '';
          if (mappedRow['IRN Date']) {
            const dateParse = parseExcelDate(mappedRow['IRN Date']);
            if (dateParse.isValid) {
              formattedIrnDate = formatDateToString(dateParse.date);
            }
          }

          const b2bEntries = entries.filter(e => !e.type || e.type === 'b2b');
          const existingMatch = b2bEntries.find(e =>
            String(e['GSTIN of Supplier'] || '').trim().toLowerCase() === gstin.toLowerCase() &&
            String(e['Invoice Number'] || '').trim().toLowerCase() === invNo.toLowerCase()
          );

          const finalMappedRow = {
            'GSTIN of Supplier': gstin,
            'Trade / Legal Name': mappedRow['Trade / Legal Name'] !== undefined && mappedRow['Trade / Legal Name'] !== null ? String(mappedRow['Trade / Legal Name']).trim() : '',
            'Invoice Number': invNo,
            'Invoice Type': mappedRow['Invoice Type'] !== undefined && mappedRow['Invoice Type'] !== null ? String(mappedRow['Invoice Type']).trim() : '',
            'Invoice Date': formattedInvoiceDate || String(invDateVal || ''),
            'Invoice Value': convertedNumerics['Invoice Value'],
            'Place of Supply': mappedRow['Place of Supply'] !== undefined && mappedRow['Place of Supply'] !== null ? String(mappedRow['Place of Supply']).trim() : '',
            'Supply attract reverse charge': revCharge,
            'Taxable Value': convertedNumerics['Taxable Value'],
            'Integrated Tax': convertedNumerics['Integrated Tax'],
            'CGST': convertedNumerics['CGST'],
            'SGST': convertedNumerics['SGST'],
            'Cess': convertedNumerics['Cess'],
            'GSTR-1/1A/IFF/GSTR-5 Period': mappedRow['GSTR-1/1A/IFF/GSTR-5 Period'] !== undefined && mappedRow['GSTR-1/1A/IFF/GSTR-5 Period'] !== null ? String(mappedRow['GSTR-1/1A/IFF/GSTR-5 Period']).trim() : '',
            'GSTR-1/1A/IFF/GSTR-5 Filing Date': formattedFilingDate || String(mappedRow['GSTR-1/1A/IFF/GSTR-5 Filing Date'] || ''),
            'ITC Availability': mappedRow['ITC Availability'] !== undefined && mappedRow['ITC Availability'] !== null ? String(mappedRow['ITC Availability']).trim() : '',
            'Reason': mappedRow['Reason'] !== undefined && mappedRow['Reason'] !== null ? String(mappedRow['Reason']).trim() : '',
            'Applicable % Tax Rate': convertedNumerics['Applicable % Tax Rate'],
            'Source': mappedRow['Source'] !== undefined && mappedRow['Source'] !== null ? String(mappedRow['Source']).trim() : '',
            'IRN': mappedRow['IRN'] !== undefined && mappedRow['IRN'] !== null ? String(mappedRow['IRN']).trim() : '',
            'IRN Date': formattedIrnDate || String(mappedRow['IRN Date'] || ''),
            type: 'b2b'
          };

          return {
            rowNum: index + 2,
            mapped: finalMappedRow,
            errors,
            isValid: errors.length === 0,
            isDuplicate: errors.length === 0 && !!existingMatch,
            duplicateRecord: existingMatch
          };
        });

        setParsedRows(validated);
        setDuplicateHandlingMode('skip');
        setImportDialogOpen(true);
      } catch (err) {
        setSnack({ severity: 'error', msg: 'Failed to parse Excel file: ' + err.message });
      } finally {
        if (excelInputRef.current) excelInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleExecuteImport = async () => {
    setImporting(true);
    try {
      const validRows = parsedRows.filter(r => r.isValid);
      const toInsertRows = [];
      const toUpdateRows = [];
      const invalidCount = parsedRows.length - validRows.length;
      let skippedCount = 0;

      const token = localStorage.getItem('token');
      const b2bEntries = entries.filter(e => !e.type || e.type === 'b2b');
      const nextSlNo = b2bEntries.length > 0 ? Math.max(...b2bEntries.map(e => e['SL NO'] || 0)) + 1 : 1;
      let currentNextSl = nextSlNo;

      validRows.forEach(row => {
        if (row.isDuplicate) {
          if (duplicateHandlingMode === 'skip') {
            skippedCount++;
          } else {
            toUpdateRows.push({
              id: row.duplicateRecord._id,
              changes: {
                'GSTIN of Supplier': row.mapped['GSTIN of Supplier'],
                'Trade / Legal Name': row.mapped['Trade / Legal Name'],
                'Invoice Number': row.mapped['Invoice Number'],
                'Invoice Type': row.mapped['Invoice Type'],
                'Invoice Date': row.mapped['Invoice Date'],
                'Invoice Value': row.mapped['Invoice Value'],
                'Place of Supply': row.mapped['Place of Supply'],
                'Supply attract reverse charge': row.mapped['Supply attract reverse charge'],
                'Taxable Value': row.mapped['Taxable Value'],
                'Integrated Tax': row.mapped['Integrated Tax'],
                'CGST': row.mapped['CGST'],
                'SGST': row.mapped['SGST'],
                'Cess': row.mapped['Cess'],
                'GSTR-1/1A/IFF/GSTR-5 Period': row.mapped['GSTR-1/1A/IFF/GSTR-5 Period'],
                'GSTR-1/1A/IFF/GSTR-5 Filing Date': row.mapped['GSTR-1/1A/IFF/GSTR-5 Filing Date'],
                'ITC Availability': row.mapped['ITC Availability'],
                'Reason': row.mapped['Reason'],
                'Applicable % Tax Rate': row.mapped['Applicable % Tax Rate'],
                'Source': row.mapped['Source'],
                'IRN': row.mapped['IRN'],
                'IRN Date': row.mapped['IRN Date']
              }
            });
          }
        } else {
          toInsertRows.push({
            ...row.mapped,
            'SL NO': currentNextSl
          });
          currentNextSl++;
        }
      });

      let insertedCount = 0;
      let updatedCount = 0;

      // 1. Execute Updates
      if (toUpdateRows.length > 0) {
        const updateRes = await axios.put(`${API_URL}/gst-portal/bulk-update`, {
          updates: toUpdateRows
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (updateRes.data.success) {
          updatedCount = updateRes.data.updatedCount || toUpdateRows.length;
        }
      }

      // 2. Execute Inserts
      if (toInsertRows.length > 0) {
        const insertRes = await axios.post(`${API_URL}/gst-portal/bulk`, {
          entries: toInsertRows
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (insertRes.data.success) {
          insertedCount = insertRes.data.insertedCount || toInsertRows.length;
        }
      }

      // Show final results
      setImportResult({
        imported: insertedCount + updatedCount,
        skipped: skippedCount,
        failed: invalidCount
      });

      // Reload B2B table data
      fetchData();
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Import failed: ' + (err.response?.data?.error || err.message) });
    } finally {
      setImporting(false);
    }
  };

  // ── Export ──────────────────────────────────────────────────────────────
  const handleExport = () => {
    if (activeTab === 0) {
      setSnack({ severity: 'info', msg: 'Export for GSTR_1 is not yet available.' });
      return;
    }
    const exportCols = activeTab === 1 ? COLUMNS.filter(c => c.type !== 'upload') : LIABILITY_COLUMNS;
    const rows = (activeTab === 1 ? activeB2BRows : entries.filter(e => e.type === 'liability' && Number(e.filterMonth) === Number(filterMonth) && Number(e.filterYear) === Number(filterYear))).map(v => {
      const row = {};
      exportCols.forEach(c => {
        const val = v[c.key];
        row[c.label.replace(/\n/g, ' ')] = val !== null && val !== undefined ? String(val) : '';
      });
      return row;
    });
    import('../utils/exportCsv').then(({ exportToCsv }) =>
      exportToCsv('gst_portal_register.xls', rows)
    );
  };

  useShortcut('ctrl+s', handleSave);
  useShortcut('ctrl+r', () => fetchData());
  useShortcut('ctrl+e', handleExport);
  useShortcut('delete', handleBulkDelete);

  // ─────────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100vh" gap={2}>
        <CircularProgress size={48} thickness={4} sx={{ color: '#0ea5e9' }} />
        <Typography color="text.secondary" fontWeight={600}>Loading GST Portal Register…</Typography>
      </Box>
    );
  }

  // Calculate Totals
  const totals = activeTab === 1 ? {
    'Invoice Value': 0,
    'Taxable Value': 0,
    'Integrated Tax': 0,
    'CGST': 0,
    'SGST': 0,
    'Cess': 0
  } : activeTab === 2 ? {
    'Amount': 0,
    'GST(18%)': 0,
    'Total Amount': 0
  } : {};

  const filteredEntries = activeTab === 1
    ? activeB2BRows
    : activeTab === 2 ? entries.filter(e => e.type === 'liability' && Number(e.filterMonth) === Number(filterMonth) && Number(e.filterYear) === Number(filterYear)) : [];

  filteredEntries.forEach(row => {
    if (activeTab === 1) {
      Object.keys(totals).forEach(k => {
        const val = parseFloat(row[k]);
        if (!isNaN(val)) totals[k] += val;
      });
    } else {
      const amt = parseFloat(row.Amount || 0);
      totals['Amount'] += amt;
      totals['GST(18%)'] += Math.round(amt * 0.18);
      totals['Total Amount'] += Math.round(amt * 1.18);
    }
  });

  const typedInputVal = parseFloat(tempInputReceived);
  const safeInputReceived = (isNaN(typedInputVal) || typedInputVal < 0) ? 0 : typedInputVal;
  const gstLiabilitiesPayable = Math.max(0, (totals['GST(18%)'] || 0) - safeInputReceived);

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default', overflow: 'hidden' }}>

      {/* Hidden file input */}
      <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*,application/pdf" onChange={onFileSelected} />
      <input type="file" ref={excelInputRef} style={{ display: 'none' }} accept=".xls,.xlsx" onChange={handleExcelFileSelected} />

      {/* ── Top Bar ─────────────────────────────────────────────────────────── */}
      <Box sx={{
        px: 2.5, py: 1.2,
        display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap',
        bgcolor: 'background.paper', borderBottom: '1px solid #e2e8f0',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)', flexShrink: 0
      }}>
        <IconButton onClick={onBack} size="small" sx={{ bgcolor: 'background.default', '&:hover': { bgcolor: '#e2e8f0' } }}>
          <ArrowBackIcon fontSize="small" />
        </IconButton>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TableChartIcon sx={{ color: '#0ea5e9', fontSize: 18 }} />
          <Typography variant="h6" fontWeight={800} sx={{ color: '#0f172a', letterSpacing: '-0.5px' }}>
            GST Portal Details
          </Typography>
        </Box>

        <Chip
          label={`${entries.length} entries`}
          size="small"
          sx={{ fontWeight: 700, bgcolor: '#e0f2fe', color: '#0ea5e9' }}
        />
        <Chip label="Real-time Auto-save Active" size="small" sx={{ fontWeight: 700, bgcolor: '#dcfce7', color: '#166534' }} />

        {(activeTab === 0 || activeTab === 2) && (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', ml: 2 }}>
            <SearchableSelect
              size="small"
              value={filterMonth}
              onChange={e => setFilterMonth(e.target.value)}
              sx={{ fontSize: '12px', fontWeight: 700, bgcolor: 'background.paper', borderRadius: 2, height: 32 }}
            >
              {MONTH_NAMES.map((m, i) => <MenuItem key={i + 1} value={i + 1}>{m}</MenuItem>)}
            </SearchableSelect>
            <SearchableSelect
              size="small"
              value={filterYear}
              onChange={e => setFilterYear(e.target.value)}
              sx={{ fontSize: '12px', fontWeight: 700, bgcolor: 'background.paper', borderRadius: 2, height: 32 }}
            >
              {years.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
            </SearchableSelect>
          </Box>
        )}

        {selectedIds.size > 0 && (
          <Chip label={`${selectedIds.size} selected`} size="small"
            sx={{ fontWeight: 700, bgcolor: '#fee2e2', color: '#b91c1c' }} />
        )}

        <Box sx={{ ml: 'auto', display: 'flex', gap: 1, alignItems: 'center' }}>
          {selectedIds.size > 0 && (
            <Button size="small" variant="contained"
              startIcon={deleting ? <CircularProgress size={13} color="inherit" /> : <DeleteIcon />}
              onClick={handleBulkDelete} disabled={deleting}
              sx={{
                fontWeight: 800, borderRadius: 2, px: 2, fontSize: '12px',
                background: 'linear-gradient(135deg,#dc2626,#b91c1c)',
                boxShadow: '0 4px 12px rgba(220,38,38,0.35)',
              }}
            >Delete ({selectedIds.size})</Button>
          )}

          {activeTab === 2 && (
            <>
              <Button size="small" variant="contained"
                startIcon={syncing ? <CircularProgress size={13} color="inherit" /> : <SyncIcon />}
                onClick={handleSyncLiabilities} disabled={syncing}
                sx={{
                  fontWeight: 800, borderRadius: 2, px: 2, fontSize: '11px',
                  bgcolor: '#0ea5e9', '&:hover': { bgcolor: '#0284c7' }
                }}
              >
                Fetch from Bill Register
              </Button>
              <Button size="small" variant="contained"
                startIcon={savingSummary ? <CircularProgress size={13} color="inherit" /> : <SaveIcon />}
                onClick={handleInputReceivedSave} disabled={savingSummary}
                sx={{
                  fontWeight: 800, borderRadius: 2, px: 2, fontSize: '11px',
                  bgcolor: '#10b981', '&:hover': { bgcolor: '#059669' }
                }}
              >
                Save Summary
              </Button>
            </>
          )}

          <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={handleAddNewRow}
            sx={{ fontWeight: 700, borderRadius: 2, fontSize: '12px' }}>New Row</Button>

          {activeTab === 1 && (
            <>
              {/* DONE BUTTON */}
              <Button
                size="small"
                variant="contained"
                startIcon={markingDone ? <CircularProgress size={13} color="inherit" /> : <CheckCircleIcon sx={{ fontSize: 16 }} />}
                onClick={handleMarkDone}
                onDoubleClick={() => setDoneModalOpen(true)}
                disabled={markingDone}
                title="Click to mark selected B2B rows as DONE. Double-click to open DONE RECORDS window."
                sx={{
                  fontWeight: 800,
                  borderRadius: 2,
                  px: 2,
                  fontSize: '12px',
                  background: selectedIds.size > 0 ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #059669, #047857)',
                  color: '#fff',
                  boxShadow: selectedIds.size > 0 ? '0 3px 10px rgba(16,185,129,0.4)' : 'none',
                  textTransform: 'none',
                  '&:hover': { background: 'linear-gradient(135deg, #059669, #047857)' }
                }}
              >
                DONE {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
              </Button>

              {/* DONE RECORDS BUTTON */}
              <Button
                size="small"
                variant="outlined"
                startIcon={<FactCheckIcon sx={{ fontSize: 16 }} />}
                onClick={() => setDoneModalOpen(true)}
                title="Open DONE RECORDS window"
                sx={{
                  fontWeight: 700,
                  borderRadius: 2,
                  fontSize: '12px',
                  color: '#065f46',
                  borderColor: '#a7f3d0',
                  bgcolor: '#ecfdf5',
                  textTransform: 'none',
                  '&:hover': { bgcolor: '#d1fae5', borderColor: '#34d399' }
                }}
              >
                DONE RECORDS {doneB2BRows.length > 0 ? `(${doneB2BRows.length})` : ''}
              </Button>

              <Button size="small" variant="outlined" startIcon={<FileUploadIcon />} onClick={handleTriggerExcelUpload}
                sx={{ fontWeight: 700, borderRadius: 2, fontSize: '12px' }}>Upload XLS</Button>
            </>
          )}

          <Tooltip title="Reload">
            <IconButton size="small" onClick={fetchData} sx={{ bgcolor: 'background.default' }}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={handleExport}
            sx={{ fontWeight: 700, borderRadius: 2, fontSize: '12px' }}>XLS</Button>
        </Box>
      </Box>

      {/* ── Tabs Section ─────────────────────────────────────────────────── */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', px: 2 }}>
        <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)} aria-label="gst portal tabs"
          sx={{
            '& .MuiTab-root': { fontWeight: 800, fontSize: '13px', textTransform: 'none', minWidth: 100 },
            '& .Mui-selected': { color: '#0ea5e9 !important' },
            '& .MuiTabs-indicator': { backgroundColor: '#0ea5e9', height: 3, borderRadius: '3px 3px 0 0' }
          }}>
          <Tab label="GSTR_1" />
          <Tab label="B2B" />
          <Tab label="GST LIABILITIES" />
        </Tabs>
      </Box>

      {/* ── Tab Content ────────────────────────────────────────────────────── */}
      {activeTab === 0 && (
        <Gstr1Tab entries={entries} filterMonth={filterMonth} filterYear={filterYear} />
      )}

      {activeTab === 1 && (
        <Box ref={tableContainerRef} sx={{ overflow: 'auto', flex: 1 }}>
          <table style={{
            borderCollapse: 'collapse', minWidth: '100%',
            tableLayout: 'fixed', fontFamily: 'Inter, system-ui, sans-serif', fontSize: '11px'
          }}>
            <colgroup>
              <col style={{ width: 40, minWidth: 40 }} />
              {COLUMNS.map(c => <col key={c.key} style={{ width: c.width, minWidth: c.width }} />)}
            </colgroup>

            <thead>
              <tr>
                <th style={{
                  position: 'sticky', top: 0, zIndex: 3, width: 40,
                  background: 'linear-gradient(135deg,#0f172a,#1e293b)',
                  textAlign: 'center', padding: '7px 4px',
                  borderRight: '1px solid rgba(255,255,255,0.12)',
                  borderBottom: '2px solid rgba(255,255,255,0.2)',
                }}>
                  <input type="checkbox" checked={allSelected}
                    ref={el => { if (el) el.indeterminate = someSelected; }}
                    onChange={toggleSelectAll}
                    style={{ cursor: 'pointer', width: 14, height: 14, accentColor: '#0ea5e9' }} />
                </th>

                {COLUMNS.map(col => {
                  const typeStyle = col.type === 'auto'
                    ? { background: 'linear-gradient(135deg,#0369a1,#075985)', color: '#e0f2fe' }
                    : col.type === 'upload'
                      ? { background: 'linear-gradient(135deg,#8b5cf6,#7c3aed)', color: '#ede9fe' }
                      : col.type === 'dropdown'
                        ? { background: 'linear-gradient(135deg,#0284c7,#0369a1)', color: '#bae6fd' }
                        : { background: 'linear-gradient(135deg,#3b82f6,#2563eb)', color: '#bfdbfe' };
                  return (
                    <th key={col.key} style={{
                      position: 'sticky', top: 0, zIndex: 2,
                      ...typeStyle,
                      padding: '7px 5px', textAlign: 'center',
                      fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.3px',
                      whiteSpace: 'pre-line', lineHeight: 1.3,
                      borderRight: '1px solid rgba(255,255,255,0.12)',
                      borderBottom: '2px solid rgba(255,255,255,0.2)',
                    }}>
                      {col.label}
                      {col.type === 'auto' && <div style={{ fontSize: '7px', opacity: 0.7, marginTop: 2 }}>🔒 AUTO</div>}
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {activeB2BRows.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length + 1} style={{
                    textAlign: 'center', padding: '60px', color: '#64748b', fontSize: '13px'
                  }}>
                    No active B2B entries found. Click "New Row" to add one.
                  </td>
                </tr>
              )}
              {activeB2BRows.map((row, ri) => {
                const isSelected = selectedIds.has(row._id);
                return (
                  <tr key={row._id} style={{
                    background: isSelected ? 'rgba(14,165,233,0.08)'
                      : ri % 2 === 0 ? '#fff' : '#f8fafc',
                    outline: isSelected ? '2px solid rgba(14,165,233,0.4)' : 'none',
                  }}>
                    <td style={{
                      width: 40, textAlign: 'center', border: '1px solid #e2e8f0', padding: '4px',
                      background: isSelected ? 'rgba(14,165,233,0.06)' : 'transparent',
                    }}>
                      <input type="checkbox" checked={isSelected}
                        onChange={() => toggleSelect(row._id)}
                        style={{ cursor: 'pointer', width: 13, height: 13, accentColor: '#0ea5e9' }} />
                    </td>

                    {COLUMNS.map(col => {
                      const rawVal = row[col.key];
                      let display = rawVal !== null && rawVal !== undefined ? String(rawVal) : '';
                      const cellStyle = {
                        padding: '4px 5px', border: '1px solid #e2e8f0', fontSize: '11px',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        borderRight: '1px solid #e2e8f0',
                        width: col.width, maxWidth: col.width,
                      };

                      if (col.type === 'auto') return <td key={col.key} style={{ ...cellStyle, background: 'rgba(237,233,254,0.18)' }}>{display}</td>;
                      if (col.type === 'upload') return (
                        <td key={col.key} style={{ ...cellStyle, textAlign: 'center', padding: '3px' }}>
                          {uploadingObj === row._id ? <CircularProgress size={16} /> : rawVal ? (
                            <Box display="flex" gap={1} justifyContent="center" alignItems="center">
                              <a href={rawVal} target="_blank" rel="noopener noreferrer" style={{ padding: '3px 8px', borderRadius: 6, background: '#eff6ff', border: '1px solid #93c5fd', color: '#2563eb', textDecoration: 'none', fontSize: '10px', fontWeight: 700 }}>📄 View</a>
                              <IconButton size="small" onClick={() => handleTriggerUpload(row._id)}><RefreshIcon sx={{ fontSize: 14 }} /></IconButton>
                            </Box>
                          ) : <Button size="small" variant="outlined" onClick={() => handleTriggerUpload(row._id)} startIcon={<FileUploadIcon sx={{ fontSize: 14 }} />} sx={{ padding: '2px 6px', fontSize: '10px', minWidth: '40px', borderRadius: '6px' }}>Upload</Button>}
                        </td>
                      );
                      if (col.type === 'dropdown') return (
                        <td key={col.key} style={{ ...cellStyle, padding: 0 }}>
                          <SearchableSelect variant="standard" value={display} onChange={e => handleCellEdit(row._id, col.key, e.target.value)} style={{ width: '100%', height: '100%', border: 'none', background: 'transparent', fontSize: '11px', cursor: 'pointer', padding: '4px 5px', color: '#0f172a', fontWeight: 700 }}>{col.options.map(o => <option key={o} value={o}>{o}</option>)}</SearchableSelect>
                        </td>
                      );
                      return <EditableCell key={col.key} value={String(rawVal ?? '')} onChange={v => handleCellEdit(row._id, col.key, v)} style={cellStyle} />;
                    })}
                  </tr>
                );
              })}
            </tbody>
            <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 4, boxShadow: '0 -4px 12px rgba(0,0,0,0.06)' }}>
              <tr style={{ background: '#f8fafc', fontWeight: 900, color: '#0f172a' }}>
                <td style={{ background: '#f1f5f9', borderRight: '1px solid #e2e8f0', borderTop: '3px solid #94a3b8' }}></td>
                {COLUMNS.map((col, idx) => {
                  const isTotalCol = Object.keys(totals).includes(col.key);
                  const isLabelCol = idx === 0;
                  return (
                    <td key={col.key} style={{ padding: '10px 5px', textAlign: isTotalCol ? 'left' : 'center', fontSize: '12px', borderTop: '3px solid #94a3b8', borderRight: '1px solid #e2e8f0', color: isTotalCol ? '#000' : '#1e293b', background: isLabelCol ? '#f1f5f9' : 'transparent' }}>
                      {isLabelCol ? 'TOTAL' : isTotalCol ? totals[col.key].toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </Box>
      )}

      {/* ── GST LIABILITIES Tab Content ──────────────────────────────────────── */}
      {activeTab === 2 && (
        <Box ref={tableContainerRef} sx={{ overflow: 'auto', flex: 1 }}>
          <table style={{
            borderCollapse: 'collapse', minWidth: '100%',
            tableLayout: 'fixed', fontFamily: 'Inter, system-ui, sans-serif', fontSize: '11px'
          }}>
            <colgroup>
              <col style={{ width: 40, minWidth: 40 }} />
              {LIABILITY_COLUMNS.map(c => <col key={c.key} style={{ width: c.width, minWidth: c.width }} />)}
            </colgroup>

            <thead>
              <tr>
                <th style={{
                  position: 'sticky', top: 0, zIndex: 3, width: 40,
                  background: 'linear-gradient(135deg,#0f172a,#1e293b)',
                  textAlign: 'center', padding: '7px 4px',
                  borderRight: '1px solid rgba(255,255,255,0.12)',
                  borderBottom: '2px solid rgba(255,255,255,0.2)',
                }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} style={{ accentColor: '#0ea5e9' }} />
                </th>
                {LIABILITY_COLUMNS.map(col => (
                  <th key={col.key} style={{
                    position: 'sticky', top: 0, zIndex: 2,
                    background: 'linear-gradient(135deg,#3b82f6,#2563eb)', color: '#bfdbfe',
                    padding: '7px 5px', textAlign: 'center', fontSize: '9.5px', fontWeight: 700,
                    borderRight: '1px solid rgba(255,255,255,0.12)', borderBottom: '2px solid rgba(255,255,255,0.2)',
                  }}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {entries.filter(e => e.type === 'liability' && Number(e.filterMonth) === Number(filterMonth) && Number(e.filterYear) === Number(filterYear)).length === 0 && (
                <tr>
                  <td colSpan={LIABILITY_COLUMNS.length + 1} style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>
                    No liability records for {MONTH_NAMES[filterMonth - 1]} {filterYear}.
                  </td>
                </tr>
              )}
              {entries.filter(e => e.type === 'liability' && Number(e.filterMonth) === Number(filterMonth) && Number(e.filterYear) === Number(filterYear)).map((row, ri) => {
                const isSelected = selectedIds.has(row._id);
                return (
                  <tr key={row._id} style={{ background: isSelected ? 'rgba(14,165,233,0.08)' : ri % 2 === 0 ? '#fff' : '#f8fafc' }}>
                    <td style={{ textAlign: 'center', border: '1px solid #e2e8f0' }}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(row._id)} style={{ accentColor: '#0ea5e9' }} />
                    </td>
                    {LIABILITY_COLUMNS.map(col => {
                      const cellStyle = { padding: '4px 5px', border: '1px solid #e2e8f0', fontSize: '11px', textAlign: 'center' };
                      if (col.type === 'auto') return <td key={col.key} style={cellStyle}>{ri + 1}</td>;
                      if (col.type === 'calc') return <td key={col.key} style={{ ...cellStyle, fontWeight: 700 }}>{col.formula(row)}</td>;
                      return (
                        <EditableCell key={col.key}
                          value={String(row[col.key] ?? '')}
                          onChange={v => handleCellEdit(row._id, col.key, v)}
                          style={cellStyle}
                        />
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 4, boxShadow: '0 -4px 12px rgba(0,0,0,0.06)' }}>
              <tr style={{ background: '#f8fafc', fontWeight: 900, color: '#0f172a' }}>
                <td style={{ background: '#f1f5f9', borderRight: '1px solid #e2e8f0', borderTop: '3px solid #94a3b8' }}></td>
                {LIABILITY_COLUMNS.map((col, idx) => {
                  const isTotalCol = Object.keys(totals).includes(col.key);
                  const isLabelCol = idx === 0;
                  return (
                    <td key={col.key} style={{
                      padding: '10px 5px', textAlign: isTotalCol ? 'left' : 'center', fontSize: '12px',
                      borderTop: '3px solid #94a3b8', borderRight: '1px solid #e2e8f0',
                      color: isTotalCol ? '#000' : '#1e293b', whiteSpace: 'nowrap',
                      background: isLabelCol ? '#f1f5f9' : 'transparent',
                    }}>
                      {isLabelCol ? 'TOTAL' : isTotalCol ? totals[col.key].toLocaleString('en-IN') : ''}
                    </td>
                  );
                })}
              </tr>
              <tr style={{ background: '#f8fafc' }}>
                <td colSpan={8} style={{
                  textAlign: 'right', padding: '12px 20px',
                  color: '#475569', borderTop: '2px solid #e2e8f0',
                  fontWeight: 700, fontSize: '12px', letterSpacing: '0.025em'
                }}>
                  INPUT RECEIVED
                </td>
                <td style={{
                  padding: '6px 10px', textAlign: 'left',
                  borderTop: '2px solid #e2e8f0', background: '#fff',
                  borderRight: '1px solid #e2e8f0'
                }}>
                  <input
                    type="number"
                    value={tempInputReceived}
                    onChange={e => {
                      const val = e.target.value;
                      if (val === '') {
                        setTempInputReceived('');
                        return;
                      }
                      const parsed = parseFloat(val);
                      if (isNaN(parsed)) return;
                      if (parsed < 0) {
                        setTempInputReceived('0');
                        return;
                      }
                      setTempInputReceived(val);
                    }}
                    placeholder="Enter value"
                    style={{
                      width: '100%', border: '1px solid #cbd5e1', padding: '6px 10px',
                      outline: 'none', background: '#fff', fontWeight: 800,
                      textAlign: 'left', fontSize: '13px', borderRadius: '6px',
                      color: parseFloat(tempInputReceived) < 0 ? '#dc2626' : '#0f172a',
                      transition: 'border-color 0.2s',
                    }}
                    onFocus={e => e.target.style.borderColor = '#0ea5e9'}
                    onBlur={e => e.target.style.borderColor = '#cbd5e1'}
                  />
                </td>
                <td style={{ borderTop: '2px solid #e2e8f0' }}></td>
              </tr>
              <tr style={{ background: '#f0f9ff' }}>
                <td colSpan={8} style={{
                  textAlign: 'right', padding: '14px 20px',
                  color: '#0369a1', borderTop: '1px solid #bae6fd',
                  fontWeight: 800, fontSize: '13px', letterSpacing: '0.025em'
                }}>
                  GST LIABILITIES PAYABLE
                </td>
                <td style={{
                  padding: '14px 10px', textAlign: 'left',
                  color: '#0284c7', borderTop: '1px solid #bae6fd',
                  borderRight: '1px solid #e2e8f0', fontSize: '15px',
                  fontWeight: 900, textShadow: '0 1px 2px rgba(0,0,0,0.05)'
                }}>
                  ₹ {gstLiabilitiesPayable.toLocaleString('en-IN')}
                </td>
                <td style={{ borderTop: '1px solid #bae6fd' }}></td>
              </tr>
            </tfoot>
          </table>
        </Box>
      )}

      {/* ── Confirm delete ──────────────────────────────────────────────────── */}
      {confirmDel && (
        <Box sx={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setConfirmDel(false)}>
          <Box sx={{
            bgcolor: 'background.paper', borderRadius: 3, p: 4, maxWidth: 420, width: '90%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }} onClick={e => e.stopPropagation()}>
            <Typography variant="h6" fontWeight={800} color="error.main" mb={1}>
              🗑️ Delete {selectedIds.size} Entry(s)?
            </Typography>
            <Typography color="text.secondary" fontSize="13px" mb={3}>
              This will permanently remove the selected entries. <strong>Cannot be undone.</strong>
            </Typography>
            <Box display="flex" gap={1.5} justifyContent="flex-end">
              <Button variant="outlined" size="small" onClick={() => setConfirmDel(false)} sx={{ fontWeight: 700 }}>Cancel</Button>
              <Button variant="contained" size="small" color="error"
                startIcon={deleting ? <CircularProgress size={13} color="inherit" /> : <DeleteIcon />}
                onClick={handleDelete} disabled={deleting} sx={{ fontWeight: 800 }}>
                {deleting ? 'Deleting…' : 'Yes, Delete'}
              </Button>
            </Box>
          </Box>
        </Box>
      )}

      {/* ── Excel Import Dialog ────────────────────────────────────────────── */}
      <Dialog
        open={importDialogOpen}
        onClose={importing ? undefined : () => setImportDialogOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: { borderRadius: 3, p: 1 }
        }}
      >
        <DialogTitle sx={{ fontWeight: 800, fontSize: '18px', borderBottom: '1px solid #e2e8f0', pb: 1.5 }}>
          📥 Import B2B Excel
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          {importResult ? (
            <Box sx={{ py: 2, textAlign: 'center' }}>
              <Typography variant="h6" fontWeight={800} color="success.main" mb={2}>
                🎉 Import Completed
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 3, alignItems: 'center', bgcolor: '#f0fdf4', p: 2, borderRadius: 2, border: '1px solid #bbf7d0' }}>
                <Typography fontSize="14px" fontWeight={600} color="green"><strong>Imported/Updated:</strong> {importResult.imported} rows</Typography>
                <Typography fontSize="14px" fontWeight={600} color="text.secondary"><strong>Skipped (Duplicates):</strong> {importResult.skipped} rows</Typography>
                <Typography fontSize="14px" fontWeight={600} color="error"><strong>Failed (Invalid):</strong> {importResult.failed} rows</Typography>
              </Box>
              <Button variant="contained" onClick={() => { setImportDialogOpen(false); setImportResult(null); }} sx={{ fontWeight: 700, borderRadius: 2, px: 4 }}>
                Close
              </Button>
            </Box>
          ) : (() => {
            const totalParsed = parsedRows.length;
            const invalidRows = parsedRows.filter(r => !r.isValid);
            const invalidCount = invalidRows.length;
            const duplicateRows = parsedRows.filter(r => r.isValid && r.isDuplicate);
            const duplicateCount = duplicateRows.length;
            const validCount = parsedRows.filter(r => r.isValid).length;

            const previewCols = [
              { key: 'GSTIN of Supplier', label: 'GSTIN OF SUPPLIER' },
              { key: 'Trade / Legal Name', label: 'TRADE / LEGAL NAME' },
              { key: 'Invoice Number', label: 'INVOICE NUMBER' },
              { key: 'Invoice Type', label: 'INVOICE TYPE' },
              { key: 'Invoice Date', label: 'INVOICE DATE' },
              { key: 'Invoice Value', label: 'INVOICE VALUE' },
              { key: 'Place of Supply', label: 'PLACE OF SUPPLY' },
              { key: 'Supply attract reverse charge', label: 'REVERSE CHARGE' },
              { key: 'Taxable Value', label: 'TAXABLE VALUE' },
              { key: 'Integrated Tax', label: 'INTEGRATED TAX' },
              { key: 'CGST', label: 'CGST' },
              { key: 'SGST', label: 'SGST' },
              { key: 'Cess', label: 'CESS' }
            ];

            return (
              <>
                <Box display="flex" flexDirection="column" gap={0.5} mb={2}>
                  <Typography fontSize="13px"><strong>File Name:</strong> {importFileName}</Typography>
                  <Typography fontSize="13px"><strong>Worksheet Name:</strong> {importSheetName}</Typography>
                  <Typography fontSize="13px"><strong>Total Rows:</strong> {totalParsed}</Typography>
                  <Typography fontSize="13px"><strong>Total Columns Match:</strong> {importColCount}</Typography>
                </Box>

                <Box display="flex" gap={1.5} mb={2.5} flexWrap="wrap">
                  <Chip label={`${totalParsed} Rows Detected`} variant="outlined" sx={{ fontWeight: 700 }} />
                  <Chip label={`${validCount} Valid`} color="success" variant="outlined" sx={{ fontWeight: 700 }} />
                  {invalidCount > 0 && (
                    <Chip label={`${invalidCount} Invalid`} color="error" variant="outlined" sx={{ fontWeight: 700 }} />
                  )}
                  {duplicateCount > 0 && (
                    <Chip label={`${duplicateCount} Duplicates`} color="warning" variant="outlined" sx={{ fontWeight: 700 }} />
                  )}
                </Box>

                {/* VISUAL TABLE PREVIEW */}
                {validCount > 0 && (
                  <>
                    <Typography variant="subtitle2" fontWeight={800} color="text.secondary" mb={1}>
                      📊 Visual Column Mapping Preview (First 5 Rows):
                    </Typography>
                    <Box sx={{ mb: 2, overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 2, maxHeight: 220 }}>
                      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '11px', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f1f5f9' }}>
                            {previewCols.map(c => (
                              <th key={c.key} style={{ padding: '8px', borderBottom: '1px solid #cbd5e1', whiteSpace: 'nowrap', fontWeight: 800, color: '#334155' }}>
                                {c.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {parsedRows.filter(r => r.isValid).slice(0, 5).map((row, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                              {previewCols.map(c => {
                                const val = row.mapped[c.key];
                                return (
                                  <td key={c.key} style={{ padding: '8px', whiteSpace: 'nowrap', color: '#475569' }}>
                                    {val !== undefined && val !== null ? String(val) : ''}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </Box>
                    {validCount > 5 && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2, fontStyle: 'italic' }}>
                        Showing first 5 rows of {validCount} valid rows...
                      </Typography>
                    )}
                  </>
                )}

                {invalidCount > 0 && (
                  <Box sx={{ mb: 2.5, p: 2, bgcolor: '#fef2f2', border: '1px solid #fee2e2', borderRadius: 2, maxHeight: 150, overflowY: 'auto' }}>
                    <Typography variant="subtitle2" fontWeight={800} color="error.main" mb={1}>
                      ⚠️ Invalid Rows (Will be skipped):
                    </Typography>
                    {invalidRows.map(r => (
                      <Box key={r.rowNum} sx={{ mb: 1 }}>
                        <Typography fontSize="12px" fontWeight={700} color="error.dark">
                          Row {r.rowNum}:
                        </Typography>
                        {r.errors.map((e, ei) => (
                          <Typography key={ei} fontSize="11px" color="error.main" sx={{ pl: 2 }}>
                            {e.column} → {e.problem}
                          </Typography>
                        ))}
                      </Box>
                    ))}
                  </Box>
                )}

                {duplicateCount > 0 && (
                  <Box sx={{ mb: 2.5, p: 2, bgcolor: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 2 }}>
                    <Typography variant="subtitle2" fontWeight={800} color="warning.dark" mb={1}>
                      🔁 Duplicate Invoices Detected ({duplicateCount} rows):
                    </Typography>
                    <Typography fontSize="12px" color="text.secondary" mb={1.5}>
                      These invoice numbers already exist in the database for the given GSTINs. Choose option:
                    </Typography>

                    <FormControl component="fieldset">
                      <RadioGroup
                        value={duplicateHandlingMode}
                        onChange={(e) => setDuplicateHandlingMode(e.target.value)}
                      >
                        <FormControlLabel value="skip" control={<Radio size="small" />} label={<Typography fontSize="13px" fontWeight={600}>Skip duplicates (Import only new rows)</Typography>} />
                        <FormControlLabel value="update" control={<Radio size="small" />} label={<Typography fontSize="13px" fontWeight={600}>Update existing (Overwrite database with Excel values)</Typography>} />
                      </RadioGroup>
                    </FormControl>
                  </Box>
                )}

                {invalidCount === totalParsed ? (
                  <Alert severity="error" sx={{ fontWeight: 700 }}>
                    All rows in this Excel sheet are invalid. Please fix the validation errors and try again.
                  </Alert>
                ) : null}
              </>
            );
          })()}
        </DialogContent>
        {!importResult && (
          (() => {
            const totalParsed = parsedRows.length;
            const invalidCount = parsedRows.filter(r => !r.isValid).length;
            const duplicateCount = parsedRows.filter(r => r.isValid && r.isDuplicate).length;
            const validCount = parsedRows.filter(r => r.isValid).length;
            const importCount = duplicateHandlingMode === 'skip' ? validCount - duplicateCount : validCount;

            return (
              <DialogActions sx={{ borderTop: '1px solid #e2e8f0', pt: 1.5, px: 3, pb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  {invalidCount !== totalParsed && (
                    <Typography fontSize="13px" fontWeight={700} color="text.primary">
                      Import {importCount} valid B2B records?
                    </Typography>
                  )}
                </Box>
                <Box display="flex" gap={1.5}>
                  <Button variant="outlined" size="small" onClick={() => setImportDialogOpen(false)} disabled={importing} sx={{ fontWeight: 700, borderRadius: 2 }}>
                    Cancel
                  </Button>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={handleExecuteImport}
                    disabled={importing || invalidCount === totalParsed}
                    startIcon={importing ? <CircularProgress size={13} color="inherit" /> : null}
                    sx={{ fontWeight: 800, borderRadius: 2, px: 3, bgcolor: '#0ea5e9', '&:hover': { bgcolor: '#0284c7' } }}
                  >
                    {importing ? 'Importing…' : 'Import'}
                  </Button>
                </Box>
              </DialogActions>
            );
          })()
        )}
      </Dialog>

      {/* ── DONE RECORDS WINDOW (MODAL) ─────────────────────────────────────── */}
      <Dialog
        open={doneModalOpen}
        onClose={() => setDoneModalOpen(false)}
        maxWidth="xl"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            maxHeight: '90vh',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            display: 'flex',
            flexDirection: 'column'
          }
        }}
      >
        <DialogTitle sx={{
          p: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #0f172a, #1e293b)',
          color: '#fff',
          borderBottom: '1px solid #334155'
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{
              width: 36, height: 36, borderRadius: '50%',
              bgcolor: 'rgba(16,185,129,0.2)', display: 'flex',
              alignItems: 'center', justifyContent: 'center'
            }}>
              <CheckCircleIcon sx={{ color: '#34d399', fontSize: 22 }} />
            </Box>
            <Box>
              <Typography variant="h6" fontWeight={800} sx={{ letterSpacing: '-0.3px', lineHeight: 1.2 }}>
                DONE B2B RECORDS
              </Typography>
              <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600 }}>
                Completed & Archived B2B Invoices (Historical Data Preserved)
              </Typography>
            </Box>
            <Chip
              label={`${doneB2BRows.length} Done Records`}
              size="small"
              sx={{ fontWeight: 800, bgcolor: 'rgba(16,185,129,0.2)', color: '#34d399', ml: 1 }}
            />
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {/* Search within Done Records */}
            <TextField
              size="small"
              placeholder="Search Invoice, Supplier, SL NO..."
              value={doneSearchTerm}
              onChange={e => setDoneSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: '#94a3b8', fontSize: 18 }} />
                  </InputAdornment>
                )
              }}
              sx={{
                width: 260,
                bgcolor: '#334155',
                borderRadius: 2,
                input: { color: '#fff', fontSize: '12px', py: '6px' },
                '.MuiOutlinedInput-notchedOutline': { borderColor: '#475569' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#64748b' }
              }}
            />

            {filteredDoneRows.length > 0 && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<DownloadIcon />}
                onClick={handleExportDone}
                sx={{
                  color: '#e2e8f0',
                  borderColor: '#475569',
                  fontWeight: 700,
                  fontSize: '11px',
                  borderRadius: 2,
                  textTransform: 'none',
                  '&:hover': { bgcolor: '#334155', borderColor: '#64748b' }
                }}
              >
                Export XLS
              </Button>
            )}

            <IconButton
              onClick={() => setDoneModalOpen(false)}
              size="small"
              sx={{ color: '#94a3b8', '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.1)' } }}
            >
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>

        {/* Summary metric banner */}
        <Box sx={{
          px: 3, py: 1, bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0',
          display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap'
        }}>
          <Box>
            <Typography sx={{ fontSize: '10px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
              Showing Records
            </Typography>
            <Typography sx={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
              {filteredDoneRows.length} of {doneB2BRows.length}
            </Typography>
          </Box>
          <Box sx={{ height: 24, width: 1, bgcolor: '#cbd5e1' }} />
          <Box>
            <Typography sx={{ fontSize: '10px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
              Total Invoice Value
            </Typography>
            <Typography sx={{ fontSize: '13px', fontWeight: 800, color: '#047857' }}>
              ₹{doneTotals.invVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Typography>
          </Box>
          <Box sx={{ height: 24, width: 1, bgcolor: '#cbd5e1' }} />
          <Box>
            <Typography sx={{ fontSize: '10px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
              Total Taxable Value
            </Typography>
            <Typography sx={{ fontSize: '13px', fontWeight: 800, color: '#0369a1' }}>
              ₹{doneTotals.taxVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Typography>
          </Box>
          <Box sx={{ height: 24, width: 1, bgcolor: '#cbd5e1' }} />
          <Box>
            <Typography sx={{ fontSize: '10px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
              Total Tax (CGST + SGST + IGST)
            </Typography>
            <Typography sx={{ fontSize: '13px', fontWeight: 800, color: '#b45309' }}>
              ₹{doneTotals.totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Typography>
          </Box>
        </Box>

        <DialogContent sx={{ p: 0, flex: 1, overflow: 'auto' }}>
          <Box sx={{ minWidth: '100%' }}>
            <table style={{
              borderCollapse: 'collapse', minWidth: '100%',
              tableLayout: 'fixed', fontFamily: 'Inter, system-ui, sans-serif', fontSize: '11px'
            }}>
              <colgroup>
                {COLUMNS.map(c => <col key={c.key} style={{ width: c.width, minWidth: c.width }} />)}
                <col style={{ width: 90, minWidth: 90 }} />
                <col style={{ width: 150, minWidth: 150 }} />
              </colgroup>

              <thead>
                <tr>
                  {COLUMNS.map(col => (
                    <th key={col.key} style={{
                      position: 'sticky', top: 0, zIndex: 2,
                      background: 'linear-gradient(135deg,#1e293b,#0f172a)',
                      color: '#e2e8f0',
                      padding: '8px 5px', textAlign: 'center',
                      fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.3px',
                      whiteSpace: 'pre-line', lineHeight: 1.3,
                      borderRight: '1px solid rgba(255,255,255,0.12)',
                      borderBottom: '2px solid rgba(255,255,255,0.2)',
                    }}>
                      {col.label}
                    </th>
                  ))}
                  <th style={{
                    position: 'sticky', top: 0, zIndex: 2,
                    background: 'linear-gradient(135deg,#065f46,#047857)',
                    color: '#d1fae5',
                    padding: '8px 5px', textAlign: 'center',
                    fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.3px',
                    borderRight: '1px solid rgba(255,255,255,0.12)',
                    borderBottom: '2px solid rgba(255,255,255,0.2)',
                  }}>
                    STATUS
                  </th>
                  <th style={{
                    position: 'sticky', top: 0, zIndex: 2,
                    background: 'linear-gradient(135deg,#065f46,#047857)',
                    color: '#d1fae5',
                    padding: '8px 5px', textAlign: 'center',
                    fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.3px',
                    borderRight: '1px solid rgba(255,255,255,0.12)',
                    borderBottom: '2px solid rgba(255,255,255,0.2)',
                  }}>
                    COMPLETED AT
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredDoneRows.length === 0 && (
                  <tr>
                    <td colSpan={COLUMNS.length + 2} style={{
                      textAlign: 'center', padding: '60px', color: '#64748b', fontSize: '13px', fontWeight: 600
                    }}>
                      {doneB2BRows.length === 0
                        ? 'No B2B records have been marked as DONE yet.'
                        : 'No DONE records match your search filter.'}
                    </td>
                  </tr>
                )}

                {filteredDoneRows.map((row, ri) => (
                  <tr key={row._id} style={{
                    background: ri % 2 === 0 ? '#fff' : '#f8fafc',
                    transition: 'background-color 0.15s'
                  }}>
                    {COLUMNS.map(col => {
                      const rawVal = row[col.key];
                      const display = rawVal !== null && rawVal !== undefined ? String(rawVal) : '';
                      const cellStyle = {
                        padding: '5px 6px', border: '1px solid #e2e8f0', fontSize: '11px',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        borderRight: '1px solid #e2e8f0',
                        width: col.width, maxWidth: col.width,
                      };

                      if (col.type === 'auto') {
                        return (
                          <td key={col.key} style={{ ...cellStyle, textAlign: 'center', fontWeight: 800, background: '#f1f5f9', color: '#334155' }}>
                            {display}
                          </td>
                        );
                      }
                      if (col.type === 'upload') {
                        return (
                          <td key={col.key} style={{ ...cellStyle, textAlign: 'center' }}>
                            {rawVal ? (
                              <a href={rawVal} target="_blank" rel="noopener noreferrer" style={{ padding: '2px 6px', borderRadius: 4, background: '#eff6ff', border: '1px solid #93c5fd', color: '#2563eb', textDecoration: 'none', fontSize: '10px', fontWeight: 700 }}>
                                📄 View
                              </a>
                            ) : '-'}
                          </td>
                        );
                      }

                      return (
                        <td key={col.key} style={cellStyle} title={display}>
                          {display}
                        </td>
                      );
                    })}

                    {/* STATUS CHIP */}
                    <td style={{ textAlign: 'center', border: '1px solid #e2e8f0', padding: '4px' }}>
                      <Chip
                        label="DONE"
                        size="small"
                        icon={<CheckCircleIcon sx={{ fontSize: '14px !important', color: '#166534 !important' }} />}
                        sx={{ bgcolor: '#dcfce7', color: '#166534', fontWeight: 800, height: 22, fontSize: '10px' }}
                      />
                    </td>

                    {/* DONE AT TIMESTAMP */}
                    <td style={{ textAlign: 'center', border: '1px solid #e2e8f0', padding: '4px', fontSize: '10.5px', color: '#64748b' }}>
                      {row.doneAt ? new Date(row.doneAt).toLocaleString('en-IN') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
        </DialogContent>

        <DialogActions sx={{ p: 2, bgcolor: '#f8fafc', borderTop: '1px solid #e2e8f0', justifyContent: 'space-between' }}>
          <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
            Showing {filteredDoneRows.length} archived B2B records. Original database records are safely preserved.
          </Typography>
          <Button onClick={() => setDoneModalOpen(false)} variant="contained" sx={{ bgcolor: '#334155', '&:hover': { bgcolor: '#1e293b' }, fontWeight: 700 }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Snackbar ────────────────────────────────────────────────────────── */}
      <Snackbar open={!!snack} autoHideDuration={4500} onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {snack && (
          <Alert severity={snack.severity} onClose={() => setSnack(null)} variant="filled" sx={{ fontWeight: 600 }}>
            {snack.msg}
          </Alert>
        )}
      </Snackbar>
    </Box>
  );
}

// ─── Editable Cell ────────────────────────────────────────────────────────────
function EditableCell({ value, isDirty, onChange, style }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current) {
      ref.current.innerText = value ?? '';
    }
  }, [value]);

  const handleBlur = () => {
    const nv = ref.current?.innerText?.trim() ?? '';
    if (nv !== (value ?? '').trim()) onChange(nv);
  };

  return (
    <td ref={ref} contentEditable suppressContentEditableWarning onBlur={handleBlur}
      style={{
        ...style, outline: 'none', cursor: 'text',
        background: isDirty ? 'rgba(240,249,255,0.6)' : '#fff',
      }}
      onFocus={e => { e.currentTarget.style.boxShadow = 'inset 0 0 0 2px #0ea5e9'; e.currentTarget.style.background = '#e0f2fe'; }}
      onBlurCapture={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.background = ''; }}
    />
  );
}
