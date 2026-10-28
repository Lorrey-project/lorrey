import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Button,
  IconButton,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Tabs,
  Tab,
  Chip,
  Tooltip,
  CircularProgress,
  Snackbar,
  Alert,
  InputAdornment,
  Divider,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ImageIcon from '@mui/icons-material/Image';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import SaveIcon from '@mui/icons-material/Save';
import axios from 'axios';
import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL;
const SOCKET_URL = import.meta.env.VITE_SOCKET_IO_URL || import.meta.env.VITE_API_URL;

function toInputDateFormat(val) {
  if (!val) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  const dmyMatch = String(val).match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }
  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return val;
}

function formatDateDisplay(val) {
  if (!val) return '—';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) return val;
  const ymdMatch = String(val).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymdMatch) {
    return `${ymdMatch[3]}/${ymdMatch[2]}/${ymdMatch[1]}`;
  }
  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }
  return String(val);
}

function createEmptyRow() {
  return {
    id: Date.now() + Math.random(),
    checkDate: '',
    checkNumber: '',
    checkAmount: '',
    receivingDate: '',
    file: null,
    remarks: '',
    error: '',
  };
}

export default function CheckBookModal({ open, onClose, initialTab = 0 }) {
  const [tabValue, setTabValue] = useState(initialTab); // 0 = List, 1 = Add Checks

  useEffect(() => {
    if (open) {
      setTabValue(initialTab);
    }
  }, [open, initialTab]);
  const [checks, setChecks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  // Multi-entry form state
  const [entryRows, setEntryRows] = useState([createEmptyRow()]);
  const [saving, setSaving] = useState(false);

  // Document preview modal state
  const [previewDoc, setPreviewDoc] = useState({ open: false, url: '', name: '', type: '' });

  // Edit modal state
  const [editModal, setEditModal] = useState({
    open: false,
    check: null,
    checkDate: '',
    checkNumber: '',
    checkAmount: '',
    receivingDate: '',
    remarks: '',
    file: null,
    saving: false,
    error: '',
  });

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState({
    open: false,
    check: null,
    deleting: false,
  });

  // Snackbar notifications
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'info' });

  // Fetch all saved check entries
  const fetchChecks = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/check-book`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.data?.success) {
        setChecks(res.data.checks || []);
      }
    } catch (err) {
      console.error('Error fetching checks:', err);
      setSnack({
        open: true,
        message: err.response?.data?.error || 'Failed to load check book entries.',
        severity: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchChecks();
    }
  }, [open]);

  // Real-time socket sync
  useEffect(() => {
    if (!open) return;
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socket.on('checkBookUpdated', () => {
      fetchChecks();
    });
    return () => {
      socket.disconnect();
    };
  }, [open]);

  // Filtered checks list based on search
  const filteredChecks = useMemo(() => {
    if (!search.trim()) return checks;
    const q = search.trim().toLowerCase();
    return checks.filter(
      (c) =>
        String(c.checkNumber || '').toLowerCase().includes(q) ||
        String(c.checkDate || '').toLowerCase().includes(q) ||
        String(c.receivingDate || '').toLowerCase().includes(q) ||
        String(c.documentName || '').toLowerCase().includes(q) ||
        String(c.remarks || '').toLowerCase().includes(q)
    );
  }, [checks, search]);

  const totalChecksValue = useMemo(() => {
    return checks.reduce((sum, c) => sum + (Number(c.checkAmount) || 0), 0);
  }, [checks]);

  // ── Multi-entry row handlers ────────────────────────────────────────────────
  const handleAddRow = () => {
    setEntryRows((prev) => [...prev, createEmptyRow()]);
  };

  const handleRemoveRow = (idx) => {
    if (entryRows.length <= 1) {
      // Just clear the single row
      setEntryRows([createEmptyRow()]);
      return;
    }
    setEntryRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleRowChange = (idx, field, val) => {
    setEntryRows((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: val, error: '' };
      return copy;
    });
  };

  const handleFileChange = (idx, file) => {
    if (!file) return;
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    const ext = file.name.split('.').pop().toLowerCase();
    const allowedExts = ['jpg', 'jpeg', 'png', 'pdf'];

    if (!allowed.includes(file.type) && !allowedExts.includes(ext)) {
      setSnack({
        open: true,
        message: 'Invalid file format. Please upload JPEG, JPG, PNG, or PDF.',
        severity: 'warning',
      });
      return;
    }

    setEntryRows((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], file, error: '' };
      return copy;
    });
  };

  // ── Save Multiple Checks at Once ────────────────────────────────────────────
  const handleSaveChecks = async () => {
    // 1. Validation across all rows
    let hasError = false;
    const updatedRows = [...entryRows];
    const seenNumbers = new Set();

    for (let i = 0; i < updatedRows.length; i++) {
      const r = updatedRows[i];
      const checkDate = String(r.checkDate || '').trim();
      const checkNo = String(r.checkNumber || '').trim();
      const rawAmt = r.checkAmount;
      const parsedAmt = parseFloat(String(rawAmt || '').replace(/,/g, ''));
      const receivingDate = String(r.receivingDate || '').trim();

      if (!checkDate) {
        updatedRows[i].error = 'Check Date is required.';
        hasError = true;
        continue;
      }

      if (!checkNo) {
        updatedRows[i].error = 'Check Number is required.';
        hasError = true;
        continue;
      }

      if (isNaN(parsedAmt) || parsedAmt <= 0) {
        updatedRows[i].error = 'Valid positive amount is required.';
        hasError = true;
        continue;
      }

      if (!r.file) {
        updatedRows[i].error = 'Check Document (JPEG/PNG/PDF) is required.';
        hasError = true;
        continue;
      }

      // Duplicate check within batch
      if (seenNumbers.has(checkNo.toLowerCase())) {
        updatedRows[i].error = `Duplicate check number "${checkNo}" in entry list.`;
        hasError = true;
        continue;
      }
      seenNumbers.add(checkNo.toLowerCase());
      updatedRows[i].error = '';
    }

    if (hasError) {
      setEntryRows(updatedRows);
      setSnack({
        open: true,
        message: 'Please resolve errors in the highlighted check row(s).',
        severity: 'error',
      });
      return;
    }

    // 2. Prepare FormData payload
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();

      const metadata = updatedRows.map((r, i) => ({
        checkDate: String(r.checkDate || '').trim(),
        checkNumber: String(r.checkNumber).trim(), // preserve leading zeros as string
        checkAmount: parseFloat(r.checkAmount),
        receivingDate: String(r.receivingDate || '').trim(),
        fileField: `file_${i}`,
        fileIndex: i,
        remarks: (r.remarks || '').trim(),
      }));

      formData.append('checks', JSON.stringify(metadata));

      updatedRows.forEach((r, i) => {
        formData.append(`file_${i}`, r.file);
      });

      const res = await axios.post(`${API_URL}/check-book/bulk`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (res.data?.success) {
        setSnack({
          open: true,
          message: `Saved ${res.data.count || updatedRows.length} check(s) successfully!`,
          severity: 'success',
        });
        // Reset rows
        setEntryRows([createEmptyRow()]);
        // Switch to Saved Checks list
        setTabValue(0);
        await fetchChecks();
      }
    } catch (err) {
      console.error('Error saving checks:', err);
      const errMsg = err.response?.data?.error || err.message || 'Failed to save checks.';
      setSnack({
        open: true,
        message: errMsg,
        severity: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  // ── Edit Check Handler ──────────────────────────────────────────────────────
  const handleOpenEdit = (check) => {
    setEditModal({
      open: true,
      check,
      checkDate: check.checkDate || '',
      checkNumber: String(check.checkNumber || ''),
      checkAmount: String(check.checkAmount || ''),
      receivingDate: check.receivingDate || '',
      remarks: check.remarks || '',
      file: null,
      saving: false,
      error: '',
    });
  };

  const handleSaveEdit = async () => {
    const cleanDate = String(editModal.checkDate || '').trim();
    const cleanNo = String(editModal.checkNumber || '').trim();
    const parsedAmt = parseFloat(String(editModal.checkAmount || '').replace(/,/g, ''));
    const cleanRecDate = String(editModal.receivingDate || '').trim();

    if (!cleanDate) {
      setEditModal((prev) => ({ ...prev, error: 'Check Date is required.' }));
      return;
    }
    if (!cleanNo) {
      setEditModal((prev) => ({ ...prev, error: 'Check Number is required.' }));
      return;
    }
    if (isNaN(parsedAmt) || parsedAmt <= 0) {
      setEditModal((prev) => ({ ...prev, error: 'Valid positive amount is required.' }));
      return;
    }
    if (!cleanRecDate) {
      setEditModal((prev) => ({ ...prev, error: 'Receiving Date is required.' }));
      return;
    }

    setEditModal((prev) => ({ ...prev, saving: true, error: '' }));
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('checkDate', cleanDate);
      formData.append('checkNumber', cleanNo);
      formData.append('checkAmount', parsedAmt);
      formData.append('receivingDate', cleanRecDate);
      formData.append('remarks', (editModal.remarks || '').trim());
      if (editModal.file) {
        formData.append('file', editModal.file);
      }

      const res = await axios.put(`${API_URL}/check-book/${editModal.check._id}`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (res.data?.success) {
        setSnack({
          open: true,
          message: `Check #${cleanNo} updated successfully!`,
          severity: 'success',
        });
        setEditModal({ open: false, check: null, checkDate: '', checkNumber: '', checkAmount: '', receivingDate: '', remarks: '', file: null, saving: false, error: '' });
        await fetchChecks();
      }
    } catch (err) {
      console.error('Error updating check:', err);
      setEditModal((prev) => ({
        ...prev,
        saving: false,
        error: err.response?.data?.error || err.message || 'Failed to update check.',
      }));
    }
  };

  // ── Delete Check Handler ────────────────────────────────────────────────────
  const handleConfirmDelete = async () => {
    if (!deleteConfirm.check) return;
    setDeleteConfirm((prev) => ({ ...prev, deleting: true }));
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_URL}/check-book/${deleteConfirm.check._id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      setSnack({
        open: true,
        message: `Check #${deleteConfirm.check.checkNumber} deleted permanently.`,
        severity: 'success',
      });
      setDeleteConfirm({ open: false, check: null, deleting: false });
      await fetchChecks();
    } catch (err) {
      console.error('Error deleting check:', err);
      setSnack({
        open: true,
        message: err.response?.data?.error || err.message || 'Failed to delete check.',
        severity: 'error',
      });
      setDeleteConfirm((prev) => ({ ...prev, deleting: false }));
    }
  };

  // Resolve document view URL (handles S3 absolute URLs and local /uploads fallback)
  const getDocumentUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `${API_URL.replace(/\/+$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  const handleOpenDoc = (c) => {
    const fullUrl = getDocumentUrl(c.documentUrl);
    const isPdf = (c.documentType && c.documentType.includes('pdf')) || (c.documentName && c.documentName.toLowerCase().endsWith('.pdf'));
    setPreviewDoc({
      open: true,
      url: fullUrl,
      name: c.documentName || `Check #${c.checkNumber}`,
      type: isPdf ? 'pdf' : 'image',
    });
  };

  // Calculate live total amount of entry rows
  const entryTotalAmount = useMemo(() => {
    return entryRows.reduce((sum, r) => {
      const n = parseFloat(String(r.checkAmount || '').replace(/,/g, ''));
      return sum + (isNaN(n) ? 0 : n);
    }, 0);
  }, [entryRows]);

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 40px rgba(0,0,0,0.18)',
            overflow: 'hidden',
          },
        }}
      >
        {/* ── Dialog Header ── */}
        <DialogTitle
          sx={{
            m: 0,
            p: 2.5,
            bgcolor: '#0f766e',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 42,
                height: 42,
                borderRadius: 2,
                bgcolor: 'rgba(255,255,255,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MenuBookIcon sx={{ color: '#fff', fontSize: 26 }} />
            </Box>
            <Box>
              <Typography variant="h6" fontWeight={800} sx={{ letterSpacing: '-0.3px', lineHeight: 1.2 }}>
                Check Book Management
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>
                Record and manage checks, amounts, and uploaded documents
              </Typography>
            </Box>
          </Box>

          <IconButton onClick={onClose} sx={{ color: '#fff', '&:hover': { bgcolor: 'rgba(255,255,255,0.15)' } }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        {/* ── Tabs Bar ── */}
        <Box sx={{ borderBottom: 1, borderColor: '#e2e8f0', bgcolor: '#f8fafc', px: 2.5, pt: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Tabs
            value={tabValue}
            onChange={(e, v) => setTabValue(v)}
            sx={{
              '& .MuiTab-root': {
                fontWeight: 700,
                fontSize: '0.875rem',
                textTransform: 'none',
                minHeight: 44,
                color: '#64748b',
                '&.Mui-selected': { color: '#0f766e' },
              },
              '& .MuiTabs-indicator': {
                backgroundColor: '#0f766e',
                height: 3,
                borderRadius: '3px 3px 0 0',
              },
            }}
          >
            <Tab
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <span>Saved Checks</span>
                  <Chip
                    label={checks.length}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: 11,
                      fontWeight: 800,
                      bgcolor: tabValue === 0 ? '#0f766e' : '#e2e8f0',
                      color: tabValue === 0 ? '#fff' : '#475569',
                    }}
                  />
                </Box>
              }
            />
            <Tab
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <AddIcon fontSize="small" />
                  <span>+ Add Checks</span>
                  {entryRows.length > 1 && (
                    <Chip label={`${entryRows.length} rows`} size="small" color="primary" sx={{ height: 18, fontSize: 10, fontWeight: 700 }} />
                  )}
                </Box>
              }
            />
          </Tabs>

          {/* Quick Metrics */}
          {tabValue === 0 && (
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', pb: 1 }}>
              <Typography variant="body2" sx={{ color: '#475569', fontWeight: 600 }}>
                Total Recorded: <strong style={{ color: '#0f172a' }}>₹{totalChecksValue.toLocaleString('en-IN')}</strong>
              </Typography>
              <Tooltip title="Refresh checks list">
                <IconButton size="small" onClick={fetchChecks} sx={{ bgcolor: '#fff', border: '1px solid #cbd5e1' }}>
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          )}
        </Box>

        {/* ── Dialog Body ── */}
        <DialogContent sx={{ p: 2.5, bgcolor: '#ffffff', overflowY: 'auto' }}>
          {/* TAB 0: Saved Checks List */}
          {tabValue === 0 && (
            <Box>
              {/* Search & Actions Bar */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, gap: 2 }}>
                <TextField
                  size="small"
                  placeholder="Search by Check Number, file or remarks…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  sx={{ width: 340 }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" sx={{ color: '#94a3b8' }} />
                      </InputAdornment>
                    ),
                    sx: { borderRadius: 2, fontSize: '0.875rem' },
                  }}
                />

                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => setTabValue(1)}
                  sx={{
                    bgcolor: '#0f766e',
                    fontWeight: 700,
                    textTransform: 'none',
                    borderRadius: 2,
                    boxShadow: 'none',
                    '&:hover': { bgcolor: '#0d655e', boxShadow: '0 2px 6px rgba(15,118,110,0.3)' },
                  }}
                >
                  + Add New Checks
                </Button>
              </Box>

              {/* Table */}
              <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: 2 }}>
                <Table size="small" sx={{ minWidth: 850 }}>
                  <TableHead sx={{ bgcolor: '#f1f5f9' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 800, color: '#334155', width: 50, textAlign: 'center', py: 1.5 }}>SL NO</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: '#334155', width: 120 }}>CHECK DATE</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: '#334155', width: 130 }}>CHECK NUMBER</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: '#334155', width: 130, textAlign: 'right' }}>CHECK AMOUNT</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: '#334155', width: 130 }}>RECEIVING DATE</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: '#334155', minWidth: 180 }}>CHECK DOCUMENT</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: '#334155', width: 150 }}>CREATED DATE</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: '#334155', width: 100, textAlign: 'center' }}>ACTIONS</TableCell>
                    </TableRow>
                  </TableHead>

                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={8} sx={{ textAlign: 'center', py: 6 }}>
                          <CircularProgress size={32} sx={{ color: '#0f766e', mb: 1 }} />
                          <Typography variant="body2" color="text.secondary" fontWeight={600}>
                            Loading Check Book records…
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : filteredChecks.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} sx={{ textAlign: 'center', py: 6 }}>
                          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                            <MenuBookIcon sx={{ fontSize: 48, color: '#cbd5e1' }} />
                            <Typography variant="subtitle1" fontWeight={700} color="#475569">
                              No Check Records Found
                            </Typography>
                            <Typography variant="body2" color="#64748b" sx={{ maxWidth: 400 }}>
                              {search
                                ? `No checks matched your search query "${search}".`
                                : 'No checks have been recorded yet. Click below to add check entries.'}
                            </Typography>
                            {!search && (
                              <Button
                                variant="outlined"
                                startIcon={<AddIcon />}
                                onClick={() => setTabValue(1)}
                                sx={{ mt: 1, borderColor: '#0f766e', color: '#0f766e', fontWeight: 700 }}
                              >
                                Add First Check
                              </Button>
                            )}
                          </Box>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredChecks.map((row, idx) => {
                        const isPdf =
                          (row.documentType && row.documentType.includes('pdf')) ||
                          (row.documentName && row.documentName.toLowerCase().endsWith('.pdf'));
                        const formattedDate = row.createdAt
                          ? new Date(row.createdAt).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—';

                        return (
                          <TableRow
                            key={row._id}
                            sx={{
                              '&:hover': { bgcolor: '#f8fafc' },
                              transition: 'background-color 0.15s ease',
                            }}
                          >
                            <TableCell sx={{ textAlign: 'center', fontWeight: 700, color: '#64748b', py: 1.2 }}>
                              {idx + 1}
                            </TableCell>

                            <TableCell sx={{ fontWeight: 600, color: '#334155', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                              {formatDateDisplay(row.checkDate)}
                            </TableCell>

                            <TableCell sx={{ fontWeight: 800, fontFamily: 'monospace', fontSize: '0.9rem', color: '#0f172a' }}>
                              {row.checkNumber}
                            </TableCell>

                            <TableCell sx={{ fontWeight: 600, color: '#334155', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                              {row.receivingDate ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <CheckCircleOutlineIcon sx={{ color: '#059669', fontSize: 16 }} />
                                  <span>{formatDateDisplay(row.receivingDate)}</span>
                                </Box>
                              ) : (
                                <Chip
                                  label="Pending"
                                  size="small"
                                  sx={{
                                    bgcolor: '#fef3c7',
                                    color: '#92400e',
                                    fontWeight: 800,
                                    fontSize: 11,
                                    height: 22,
                                    borderRadius: '6px'
                                  }}
                                />
                              )}
                            </TableCell>

                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                {isPdf ? (
                                  <PictureAsPdfIcon sx={{ color: '#dc2626', fontSize: 20 }} />
                                ) : (
                                  <ImageIcon sx={{ color: '#2563eb', fontSize: 20 }} />
                                )}
                                <Typography
                                  variant="body2"
                                  sx={{
                                    maxWidth: 180,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    fontWeight: 600,
                                    color: '#334155',
                                  }}
                                  title={row.documentName}
                                >
                                  {row.documentName || 'Attachment'}
                                </Typography>

                                <Button
                                  size="small"
                                  variant="outlined"
                                  startIcon={<VisibilityOutlinedIcon sx={{ fontSize: '15px !important' }} />}
                                  onClick={() => handleOpenDoc(row)}
                                  sx={{
                                    py: 0.2,
                                    px: 1,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    textTransform: 'none',
                                    borderColor: '#cbd5e1',
                                    color: '#0f766e',
                                    ml: 'auto',
                                    '&:hover': { borderColor: '#0f766e', bgcolor: '#f0fdfa' },
                                  }}
                                >
                                  VIEW
                                </Button>
                              </Box>
                            </TableCell>

                            <TableCell sx={{ color: '#475569', fontSize: '0.8125rem', fontWeight: 500 }}>
                              {formattedDate}
                            </TableCell>

                            <TableCell sx={{ textAlign: 'center' }}>
                              <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5 }}>
                                <Tooltip title="Edit check">
                                  <IconButton
                                    size="small"
                                    onClick={() => handleOpenEdit(row)}
                                    sx={{ color: '#2563eb', '&:hover': { bgcolor: '#eff6ff' } }}
                                  >
                                    <EditOutlinedIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Delete check">
                                  <IconButton
                                    size="small"
                                    onClick={() => setDeleteConfirm({ open: true, check: row, deleting: false })}
                                    sx={{ color: '#dc2626', '&:hover': { bgcolor: '#fef2f2' } }}
                                  >
                                    <DeleteOutlineIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </Box>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}

          {/* TAB 1: Dynamic Multi-Check Entry Window */}
          {tabValue === 1 && (
            <Box>
              <Box
                sx={{
                  p: 2,
                  mb: 2.5,
                  bgcolor: '#f0fdfa',
                  border: '1px solid #ccfbf1',
                  borderRadius: 2,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Box>
                  <Typography variant="subtitle2" fontWeight={700} color="#0f766e">
                    Multiple Check Entry
                  </Typography>
                  <Typography variant="caption" color="#115e59">
                    Add one or more checks below. Each check must have a valid Check Number, Check Amount, and uploaded document (JPEG, JPG, PNG, or PDF).
                  </Typography>
                </Box>
                <Chip
                  label={`${entryRows.length} Check(s) in batch`}
                  color="teal"
                  sx={{ bgcolor: '#0f766e', color: '#fff', fontWeight: 700 }}
                />
              </Box>

              {/* Dynamic Check Rows */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {entryRows.map((row, idx) => {
                  return (
                    <Paper
                      key={row.id}
                      elevation={0}
                      sx={{
                        p: 2,
                        border: '1px solid',
                        borderColor: row.error ? '#fca5a5' : '#e2e8f0',
                        borderRadius: 2.5,
                        bgcolor: row.error ? '#fff5f5' : '#ffffff',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                        <Typography variant="subtitle2" fontWeight={800} sx={{ color: '#0f766e', display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <span
                            style={{
                              display: 'inline-block',
                              width: 24,
                              height: 24,
                              lineHeight: '24px',
                              textAlign: 'center',
                              borderRadius: '50%',
                              backgroundColor: '#0f766e',
                              color: '#fff',
                              fontSize: 12,
                            }}
                          >
                            {idx + 1}
                          </span>
                          CHECK ENTRY #{idx + 1}
                        </Typography>

                        {entryRows.length > 1 && (
                          <Tooltip title="Remove this check row">
                            <IconButton
                              size="small"
                              onClick={() => handleRemoveRow(idx)}
                              sx={{ color: '#94a3b8', '&:hover': { color: '#dc2626', bgcolor: '#fef2f2' } }}
                            >
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>

                      <Box
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: {
                            xs: '1fr',
                            sm: '1fr 1fr',
                            md: '1.2fr 1.2fr 1.2fr 1.2fr 2fr',
                          },
                          gap: 2,
                          alignItems: 'start',
                        }}
                      >
                        {/* 1. CHECK DATE */}
                        <Box>
                          <Typography variant="caption" fontWeight={700} color="#334155" sx={{ mb: 0.5, display: 'block' }}>
                            CHECK DATE <span style={{ color: '#dc2626' }}>*</span>
                          </Typography>
                          <TextField
                            size="small"
                            fullWidth
                            type="date"
                            value={toInputDateFormat(row.checkDate)}
                            onChange={(e) => handleRowChange(idx, 'checkDate', e.target.value)}
                            InputLabelProps={{ shrink: true }}
                            sx={{
                              bgcolor: '#fff',
                              '& .MuiOutlinedInput-root': { borderRadius: 2 },
                            }}
                          />
                        </Box>

                        {/* 2. CHECK NUMBER */}
                        <Box>
                          <Typography variant="caption" fontWeight={700} color="#334155" sx={{ mb: 0.5, display: 'block' }}>
                            CHECK NUMBER <span style={{ color: '#dc2626' }}>*</span>
                          </Typography>
                          <TextField
                            size="small"
                            fullWidth
                            placeholder="e.g. 001245"
                            value={row.checkNumber}
                            onChange={(e) => handleRowChange(idx, 'checkNumber', e.target.value)}
                            inputProps={{
                              style: { fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.5px' },
                            }}
                            sx={{
                              bgcolor: '#fff',
                              '& .MuiOutlinedInput-root': { borderRadius: 2 },
                            }}
                          />
                        </Box>

                        {/* 3. CHECK AMOUNT */}
                        <Box>
                          <Typography variant="caption" fontWeight={700} color="#334155" sx={{ mb: 0.5, display: 'block' }}>
                            CHECK AMOUNT <span style={{ color: '#dc2626' }}>*</span>
                          </Typography>
                          <TextField
                            size="small"
                            fullWidth
                            type="number"
                            placeholder="e.g. 50000"
                            value={row.checkAmount}
                            onChange={(e) => handleRowChange(idx, 'checkAmount', e.target.value)}
                            InputProps={{
                              startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                              inputProps: { min: 0, step: 'any' },
                            }}
                            sx={{
                              bgcolor: '#fff',
                              '& .MuiOutlinedInput-root': { borderRadius: 2 },
                            }}
                          />
                        </Box>

                        {/* 4. RECEIVING DATE */}
                        <Box>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                            <Typography variant="caption" fontWeight={700} color="#334155">
                              RECEIVING DATE
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#64748b', fontSize: 10 }}>
                              (Optional / Pending)
                            </Typography>
                          </Box>
                          <TextField
                            size="small"
                            fullWidth
                            type="date"
                            value={toInputDateFormat(row.receivingDate)}
                            onChange={(e) => handleRowChange(idx, 'receivingDate', e.target.value)}
                            InputLabelProps={{ shrink: true }}
                            sx={{
                              bgcolor: '#fff',
                              '& .MuiOutlinedInput-root': { borderRadius: 2 },
                            }}
                          />
                        </Box>

                        {/* 5. UPLOAD DOCUMENT */}
                        <Box>
                          <Typography variant="caption" fontWeight={700} color="#334155" sx={{ mb: 0.5, display: 'block' }}>
                            UPLOAD DOCUMENT (JPEG / JPG / PNG / PDF) <span style={{ color: '#dc2626' }}>*</span>
                          </Typography>

                          {!row.file ? (
                            <Button
                              component="label"
                              variant="outlined"
                              fullWidth
                              startIcon={<CloudUploadIcon sx={{ color: '#0f766e' }} />}
                              sx={{
                                height: 40,
                                borderRadius: 2,
                                borderStyle: 'dashed',
                                borderColor: '#0f766e',
                                color: '#0f766e',
                                fontWeight: 600,
                                textTransform: 'none',
                                fontSize: '0.8125rem',
                                '&:hover': { bgcolor: '#f0fdfa', borderStyle: 'dashed', borderColor: '#0d655e' },
                              }}
                            >
                              Choose Check Image / PDF
                              <input
                                type="file"
                                hidden
                                accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                                onChange={(e) => {
                                  if (e.target.files && e.target.files[0]) {
                                    handleFileChange(idx, e.target.files[0]);
                                  }
                                }}
                              />
                            </Button>
                          ) : (
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                px: 1.5,
                                py: 0.75,
                                bgcolor: '#f0fdf4',
                                border: '1px solid #bbf7d0',
                                borderRadius: 2,
                                height: 40,
                              }}
                            >
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                                {row.file.type.includes('pdf') || row.file.name.toLowerCase().endsWith('.pdf') ? (
                                  <PictureAsPdfIcon sx={{ color: '#dc2626', fontSize: 20 }} />
                                ) : (
                                  <ImageIcon sx={{ color: '#2563eb', fontSize: 20 }} />
                                )}
                                <Typography
                                  variant="body2"
                                  fontWeight={700}
                                  sx={{
                                    color: '#166534',
                                    fontSize: '0.8125rem',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    maxWidth: 160,
                                  }}
                                  title={row.file.name}
                                >
                                  {row.file.name}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  ({(row.file.size / 1024).toFixed(1)} KB)
                                </Typography>
                              </Box>

                              <Tooltip title="Remove / change file">
                                <IconButton
                                  size="small"
                                  onClick={() => handleRowChange(idx, 'file', null)}
                                  sx={{ color: '#94a3b8', '&:hover': { color: '#dc2626' } }}
                                >
                                  <CloseIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          )}
                        </Box>
                      </Box>

                      {/* Error message for this row */}
                      {row.error && (
                        <Typography variant="caption" color="#dc2626" fontWeight={700} sx={{ mt: 1, display: 'block' }}>
                          ⚠️ {row.error}
                        </Typography>
                      )}
                    </Paper>
                  );
                })}
              </Box>

              {/* Dynamic Add Row Button */}
              <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
                <Button
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={handleAddRow}
                  sx={{
                    borderRadius: 2,
                    fontWeight: 700,
                    textTransform: 'none',
                    borderColor: '#cbd5e1',
                    color: '#0f766e',
                    borderStyle: 'dashed',
                    px: 3,
                    py: 1,
                    '&:hover': {
                      borderColor: '#0f766e',
                      bgcolor: '#f0fdfa',
                      borderStyle: 'dashed',
                    },
                  }}
                >
                  + ADD CHECK
                </Button>
              </Box>
            </Box>
          )}
        </DialogContent>

        {/* ── Dialog Footer (Save Actions) ── */}
        <Divider />
        <DialogActions sx={{ p: 2, px: 3, bgcolor: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {tabValue === 1 ? (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography variant="body2" color="#475569" fontWeight={600}>
                  Checks: <strong style={{ color: '#0f172a' }}>{entryRows.length}</strong>
                </Typography>
                <Divider orientation="vertical" flexItem sx={{ height: 20 }} />
                <Typography variant="body2" color="#475569" fontWeight={600}>
                  Total Amount: <strong style={{ color: '#047857' }}>₹{entryTotalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <Button
                  variant="outlined"
                  onClick={() => setTabValue(0)}
                  disabled={saving}
                  sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
                >
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  startIcon={saving ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : <SaveIcon />}
                  onClick={handleSaveChecks}
                  disabled={saving}
                  sx={{
                    bgcolor: '#0f766e',
                    fontWeight: 800,
                    textTransform: 'none',
                    borderRadius: 2,
                    px: 3,
                    boxShadow: '0 4px 10px rgba(15,118,110,0.25)',
                    '&:hover': { bgcolor: '#0d655e' },
                  }}
                >
                  {saving ? 'SAVING CHECKS…' : 'SAVE CHECKS'}
                </Button>
              </Box>
            </>
          ) : (
            <>
              <Typography variant="caption" color="text.secondary">
                Showing {filteredChecks.length} of {checks.length} recorded checks
              </Typography>
              <Button onClick={onClose} variant="outlined" sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}>
                Close
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      {/* ── Document Preview Modal ── */}
      <Dialog
        open={previewDoc.open}
        onClose={() => setPreviewDoc({ open: false, url: '', name: '', type: '' })}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, maxHeight: '90vh' } }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1.5, px: 2.5, bgcolor: '#0f766e', color: '#fff' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {previewDoc.type === 'pdf' ? <PictureAsPdfIcon sx={{ color: '#fff' }} /> : <ImageIcon sx={{ color: '#fff' }} />}
            <Typography variant="subtitle1" fontWeight={700} title={previewDoc.name}>
              {previewDoc.name}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Tooltip title="Open in new window">
              <IconButton size="small" onClick={() => window.open(previewDoc.url, '_blank')} sx={{ color: '#fff' }}>
                <OpenInNewIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <IconButton size="small" onClick={() => setPreviewDoc({ open: false, url: '', name: '', type: '' })} sx={{ color: '#fff' }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 2, bgcolor: '#f8fafc', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
          {previewDoc.type === 'pdf' ? (
            <iframe
              src={previewDoc.url}
              title={previewDoc.name}
              width="100%"
              height="600px"
              style={{ border: 'none', borderRadius: 8, background: '#fff' }}
            />
          ) : (
            <img
              src={previewDoc.url}
              alt={previewDoc.name}
              style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', borderRadius: 8 }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Edit Check Modal ── */}
      <Dialog
        open={editModal.open}
        onClose={() => !editModal.saving && setEditModal({ open: false, check: null, checkNumber: '', checkAmount: '', remarks: '', file: null, saving: false, error: '' })}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ py: 2, px: 2.5, bgcolor: '#f1f5f9', fontWeight: 800, color: '#0f172a' }}>
          Edit Check Details
        </DialogTitle>
        <DialogContent sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {editModal.error && (
            <Alert severity="error" sx={{ mb: 1, borderRadius: 2 }}>
              {editModal.error}
            </Alert>
          )}

          <Box>
            <Typography variant="caption" fontWeight={700} color="#334155" sx={{ mb: 0.5, display: 'block' }}>
              CHECK DATE <span style={{ color: '#dc2626' }}>*</span>
            </Typography>
            <TextField
              size="small"
              fullWidth
              type="date"
              value={toInputDateFormat(editModal.checkDate)}
              onChange={(e) => setEditModal((prev) => ({ ...prev, checkDate: e.target.value, error: '' }))}
              InputLabelProps={{ shrink: true }}
            />
          </Box>

          <Box>
            <Typography variant="caption" fontWeight={700} color="#334155" sx={{ mb: 0.5, display: 'block' }}>
              CHECK NUMBER <span style={{ color: '#dc2626' }}>*</span>
            </Typography>
            <TextField
              size="small"
              fullWidth
              value={editModal.checkNumber}
              onChange={(e) => setEditModal((prev) => ({ ...prev, checkNumber: e.target.value, error: '' }))}
              inputProps={{ style: { fontFamily: 'monospace', fontWeight: 700 } }}
            />
          </Box>

          <Box>
            <Typography variant="caption" fontWeight={700} color="#334155" sx={{ mb: 0.5, display: 'block' }}>
              CHECK AMOUNT (₹) <span style={{ color: '#dc2626' }}>*</span>
            </Typography>
            <TextField
              size="small"
              fullWidth
              type="number"
              value={editModal.checkAmount}
              onChange={(e) => setEditModal((prev) => ({ ...prev, checkAmount: e.target.value, error: '' }))}
              InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
            />
          </Box>

          <Box>
            <Typography variant="caption" fontWeight={700} color="#334155" sx={{ mb: 0.5, display: 'block' }}>
              RECEIVING DATE <span style={{ color: '#dc2626' }}>*</span>
            </Typography>
            <TextField
              size="small"
              fullWidth
              type="date"
              value={toInputDateFormat(editModal.receivingDate)}
              onChange={(e) => setEditModal((prev) => ({ ...prev, receivingDate: e.target.value, error: '' }))}
              InputLabelProps={{ shrink: true }}
            />
          </Box>

          <Box>
            <Typography variant="caption" fontWeight={700} color="#334155" sx={{ mb: 0.5, display: 'block' }}>
              ATTACHED DOCUMENT
            </Typography>
            <Box sx={{ p: 1.5, border: '1px solid #e2e8f0', borderRadius: 2, bgcolor: '#f8fafc', mb: 1 }}>
              <Typography variant="body2" fontWeight={600} color="#334155">
                Current: {editModal.check?.documentName || 'Uploaded File'}
              </Typography>
              {editModal.check?.documentUrl && (
                <Button
                  size="small"
                  variant="text"
                  startIcon={<VisibilityOutlinedIcon />}
                  onClick={() => handleOpenDoc(editModal.check)}
                  sx={{ mt: 0.5, color: '#0f766e', textTransform: 'none', fontWeight: 700, p: 0 }}
                >
                  View Current Document
                </Button>
              )}
            </Box>

            <Button
              component="label"
              variant="outlined"
              size="small"
              startIcon={<CloudUploadIcon />}
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2, borderColor: '#cbd5e1' }}
            >
              {editModal.file ? `Replace with: ${editModal.file.name}` : 'Replace Document (Optional)'}
              <input
                type="file"
                hidden
                accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setEditModal((prev) => ({ ...prev, file: e.target.files[0] }));
                  }
                }}
              />
            </Button>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2, px: 2.5, bgcolor: '#f8fafc' }}>
          <Button
            onClick={() => setEditModal({ open: false, check: null, checkDate: '', checkNumber: '', checkAmount: '', receivingDate: '', remarks: '', file: null, saving: false, error: '' })}
            disabled={editModal.saving}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveEdit}
            disabled={editModal.saving}
            sx={{ bgcolor: '#0f766e', fontWeight: 700, textTransform: 'none', '&:hover': { bgcolor: '#0d655e' } }}
          >
            {editModal.saving ? 'Saving Changes…' : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Delete Confirmation Dialog ── */}
      <Dialog
        open={deleteConfirm.open}
        onClose={() => !deleteConfirm.deleting && setDeleteConfirm({ open: false, check: null, deleting: false })}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#dc2626', py: 2 }}>
          Delete Check Record?
        </DialogTitle>
        <DialogContent sx={{ py: 1 }}>
          <Typography variant="body2" color="#334155" sx={{ mb: 1 }}>
            Are you sure you want to permanently delete Check <strong>#{deleteConfirm.check?.checkNumber}</strong> with amount{' '}
            <strong>₹{Number(deleteConfirm.check?.checkAmount || 0).toLocaleString('en-IN')}</strong>?
          </Typography>
          <Typography variant="caption" color="#64748b">
            This action cannot be undone and will remove the check document permanently.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: '#f8fafc' }}>
          <Button
            onClick={() => setDeleteConfirm({ open: false, check: null, deleting: false })}
            disabled={deleteConfirm.deleting}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleConfirmDelete}
            disabled={deleteConfirm.deleting}
            sx={{ fontWeight: 700, textTransform: 'none' }}
          >
            {deleteConfirm.deleting ? 'Deleting…' : 'Confirm Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Snackbar Notifications ── */}
      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={() => setSnack((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnack((prev) => ({ ...prev, open: false }))}
          severity={snack.severity}
          sx={{ width: '100%', borderRadius: 2, fontWeight: 600 }}
        >
          {snack.message}
        </Alert>
      </Snackbar>
    </>
  );
}
