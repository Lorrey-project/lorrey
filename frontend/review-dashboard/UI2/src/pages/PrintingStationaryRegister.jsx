import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Box, Button, CircularProgress, Typography, IconButton,
  Snackbar, Alert, Checkbox, Dialog, DialogTitle, DialogContent,
  DialogContentText, DialogActions, Tooltip, Chip, Paper
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import VisibilityIcon from '@mui/icons-material/Visibility';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CloseIcon from '@mui/icons-material/Close';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import axios from 'axios';
import { io } from 'socket.io-client';
import * as XLSX from 'xlsx';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const SOCKET_URL = import.meta.env.VITE_SOCKET_IO_URL || API_URL;

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
});

const fmtAmt = (n) => {
  if (n === undefined || n === null || n === '') return '';
  const num = Number(n);
  if (isNaN(num)) return n;
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function PrintingStationaryRegister({ onBack }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [snack, setSnack] = useState(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [uploadingRowId, setUploadingRowId] = useState(null);

  const fileInputRef = useRef(null);
  const targetRowForUpload = useRef(null);

  // Socket setup
  useEffect(() => {
    const socket = io(SOCKET_URL, {
      autoConnect: true,
      transports: ['websocket', 'polling']
    });

    socket.on('printingStationaryUpdates', () => {
      fetchData(false);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const fetchData = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/printing-stationary`, getAuthHeaders());
      if (res.data && res.data.success) {
        const fetchedRows = res.data.entries.map((item, idx) => ({
          _id: item._id,
          slNo: item['SL NO'] || idx + 1,
          purchase_item_name: item.purchase_item_name || '',
          date: item.date || '',
          amount: item.amount !== undefined ? item.amount : '',
          reason: item.reason || '',
          bill_pdf_url: item.bill_pdf_url || '',
          bill_pdf_name: item.bill_pdf_name || '',
          isDirty: false,
          isNew: false
        }));
        setRows(fetchedRows);
      }
    } catch (err) {
      console.error('Error fetching Printing & Stationary entries:', err);
      setSnack({ severity: 'error', message: 'Failed to load Printing & Stationary data' });
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(true);
  }, []);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleAddRow = () => {
    const nextSlNo = rows.length > 0 ? Math.max(...rows.map(r => Number(r.slNo) || 0)) + 1 : 1;
    const today = new Date().toISOString().split('T')[0];
    const newRow = {
      _id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      slNo: nextSlNo,
      purchase_item_name: '',
      date: today,
      amount: '',
      reason: '',
      bill_pdf_url: '',
      bill_pdf_name: '',
      isDirty: true,
      isNew: true
    };
    setRows(prev => [...prev, newRow]);
  };

  const handleCellChange = (id, field, value) => {
    setRows(prev => prev.map(row => {
      if (row._id === id) {
        return {
          ...row,
          [field]: value,
          isDirty: true
        };
      }
      return row;
    }));
  };

  // ── Save Function ──────────────────────────────────────────────────────────
  const handleSave = async () => {
    const dirtyRows = rows.filter(r => r.isDirty);
    if (dirtyRows.length === 0) {
      setSnack({ severity: 'info', message: 'No unsaved changes detected' });
      return;
    }

    setSaving(true);
    try {
      // 1. Create new rows
      const newRows = dirtyRows.filter(r => r.isNew);
      for (const nr of newRows) {
        const payload = {
          'SL NO': Number(nr.slNo),
          purchase_item_name: nr.purchase_item_name,
          date: nr.date,
          amount: nr.amount,
          reason: nr.reason,
          bill_pdf_url: nr.bill_pdf_url,
          bill_pdf_name: nr.bill_pdf_name
        };
        await axios.post(`${API_URL}/printing-stationary`, payload, getAuthHeaders());
      }

      // 2. Update existing edited rows
      const existingDirtyRows = dirtyRows.filter(r => !r.isNew);
      if (existingDirtyRows.length > 0) {
        const updates = existingDirtyRows.map(r => ({
          id: r._id,
          changes: {
            'SL NO': Number(r.slNo),
            purchase_item_name: r.purchase_item_name,
            date: r.date,
            amount: r.amount,
            reason: r.reason,
            bill_pdf_url: r.bill_pdf_url,
            bill_pdf_name: r.bill_pdf_name
          }
        }));
        await axios.put(`${API_URL}/printing-stationary/bulk-update`, { updates }, getAuthHeaders());
      }

      setSnack({ severity: 'success', message: 'All changes saved successfully' });
      await fetchData(false);
    } catch (err) {
      console.error('Error saving records:', err);
      setSnack({ severity: 'error', message: err.response?.data?.error || 'Failed to save changes' });
    } finally {
      setSaving(false);
    }
  };

  // ── Delete Handler ─────────────────────────────────────────────────────────
  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    const selectedArr = Array.from(selectedIds);
    
    // Separate unsaved temporary rows vs saved db rows
    const tempIds = selectedArr.filter(id => String(id).startsWith('temp_'));
    const dbIds = selectedArr.filter(id => !String(id).startsWith('temp_'));

    try {
      if (dbIds.length > 0) {
        await axios.delete(`${API_URL}/printing-stationary/bulk-delete`, {
          ...getAuthHeaders(),
          data: { ids: dbIds }
        });
      }

      // Remove from local state
      setRows(prev => prev.filter(r => !selectedIds.has(r._id)));
      setSelectedIds(new Set());
      setConfirmDel(false);
      setSnack({ severity: 'success', message: `Deleted ${selectedArr.length} record(s)` });
      
      if (dbIds.length > 0) {
        await fetchData(false);
      }
    } catch (err) {
      console.error('Error deleting records:', err);
      setSnack({ severity: 'error', message: err.response?.data?.error || 'Failed to delete records' });
    }
  };

  // ── File Upload / View / Remove ────────────────────────────────────────────
  const triggerPdfUpload = (row) => {
    targetRowForUpload.current = row;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileSelected = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setSnack({ severity: 'warning', message: 'Please select a valid PDF file (.pdf only)' });
      return;
    }

    const row = targetRowForUpload.current;
    if (!row) return;

    setUploadingRowId(row._id);

    try {
      let targetId = row._id;

      // If the row is a newly added unsaved row, save it to the DB first
      if (row.isNew || String(row._id).startsWith('temp_')) {
        const payload = {
          'SL NO': Number(row.slNo),
          purchase_item_name: row.purchase_item_name,
          date: row.date,
          amount: row.amount,
          reason: row.reason,
          bill_pdf_url: row.bill_pdf_url,
          bill_pdf_name: row.bill_pdf_name
        };
        const createRes = await axios.post(`${API_URL}/printing-stationary`, payload, getAuthHeaders());
        if (createRes.data && createRes.data.entry) {
          targetId = createRes.data.entry._id;
        }
      }

      // Upload the PDF attachment
      const formData = new FormData();
      formData.append('file', file);

      const attachRes = await axios.post(`${API_URL}/printing-stationary/attach/${targetId}`, formData, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      if (attachRes.data && attachRes.data.success) {
        setSnack({ severity: 'success', message: `PDF bill attached: ${file.name}` });
        await fetchData(false);
      }
    } catch (err) {
      console.error('PDF attachment upload error:', err);
      setSnack({ severity: 'error', message: err.response?.data?.error || 'Failed to upload PDF bill' });
    } finally {
      setUploadingRowId(null);
      targetRowForUpload.current = null;
    }
  };

  const handleRemovePdf = async (row) => {
    if (row.isNew || String(row._id).startsWith('temp_')) {
      handleCellChange(row._id, 'bill_pdf_url', '');
      handleCellChange(row._id, 'bill_pdf_name', '');
      return;
    }

    try {
      await axios.delete(`${API_URL}/printing-stationary/detach/${row._id}`, getAuthHeaders());
      setSnack({ severity: 'success', message: 'PDF bill removed' });
      await fetchData(false);
    } catch (err) {
      console.error('Error detaching PDF:', err);
      setSnack({ severity: 'error', message: 'Failed to remove PDF bill' });
    }
  };

  const handleViewPdf = (pdfUrl) => {
    if (!pdfUrl) return;
    const fullUrl = pdfUrl.startsWith('http') ? pdfUrl : `${API_URL}${pdfUrl}`;
    window.open(fullUrl, '_blank', 'noopener,noreferrer');
  };

  // ── Excel Export ───────────────────────────────────────────────────────────
  const handleExportExcel = () => {
    if (rows.length === 0) {
      setSnack({ severity: 'info', message: 'No rows to export' });
      return;
    }

    const exportData = rows.map((r, idx) => ({
      'SL NO': r.slNo || idx + 1,
      'PURCHASE ITEM NAME': r.purchase_item_name || '',
      'DATE': r.date || '',
      'AMOUNT (₹)': r.amount || '',
      'REASON': r.reason || '',
      'BILL ATTACHED': r.bill_pdf_name ? 'Yes (' + r.bill_pdf_name + ')' : 'No'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Printing_Stationary');
    XLSX.writeFile(wb, `Printing_and_Stationary_${new Date().toISOString().split('T')[0]}.xlsx`);
    setSnack({ severity: 'success', message: 'Exported to Excel successfully' });
  };

  // ── Select All Checkbox Handler ───────────────────────────────────────────
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(new Set(rows.map(r => r._id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectRow = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Total amount summary calculation
  const totalAmount = rows.reduce((sum, r) => {
    const val = parseFloat(r.amount);
    return sum + (isNaN(val) ? 0 : val);
  }, 0);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0b0f19', color: '#f8fafc', p: { xs: 2, md: 3 } }}>
      {/* Hidden file input for PDF uploads */}
      <input
        type="file"
        ref={fileInputRef}
        accept="application/pdf"
        style={{ display: 'none' }}
        onChange={handleFileSelected}
      />

      {/* ── Top Header Navigation Bar ──────────────────────────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton
            onClick={onBack}
            sx={{
              bgcolor: '#1e293b',
              border: '1px solid #334155',
              color: '#38bdf8',
              '&:hover': { bgcolor: '#334155', color: '#60a5fa' }
            }}
          >
            <ArrowBackIcon />
          </IconButton>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="h5" fontWeight={900} sx={{ color: '#f8fafc', letterSpacing: '-0.5px' }}>
                PRINTING & STATIONARY
              </Typography>
              <Chip
                label={`${rows.length} RECORD${rows.length !== 1 ? 'S' : ''}`}
                size="small"
                sx={{ bgcolor: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', fontWeight: 800, border: '1px solid rgba(56, 189, 248, 0.3)' }}
              />
            </Box>
            <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600 }}>
              Manual Expense & Purchase Item Register
            </Typography>
          </Box>
        </Box>

        {/* Action Controls */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAddRow}
            sx={{
              bgcolor: '#10b981',
              color: '#ffffff',
              fontWeight: 800,
              px: 2.5,
              py: 1,
              borderRadius: '8px',
              textTransform: 'none',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
              '&:hover': { bgcolor: '#059669' }
            }}
          >
            ADD ROW
          </Button>

          <Button
            variant="contained"
            startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
            onClick={handleSave}
            disabled={saving}
            sx={{
              bgcolor: '#2563eb',
              color: '#ffffff',
              fontWeight: 800,
              px: 2.5,
              py: 1,
              borderRadius: '8px',
              textTransform: 'none',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)',
              '&:hover': { bgcolor: '#1d4ed8' }
            }}
          >
            SAVE
          </Button>

          {selectedIds.size > 0 && (
            <Button
              variant="contained"
              startIcon={<DeleteIcon />}
              onClick={() => setConfirmDel(true)}
              sx={{
                bgcolor: '#ef4444',
                color: '#ffffff',
                fontWeight: 800,
                px: 2,
                py: 1,
                borderRadius: '8px',
                textTransform: 'none',
                boxShadow: '0 4px 14px rgba(239, 68, 68, 0.3)',
                '&:hover': { bgcolor: '#dc2626' }
              }}
            >
              DELETE ({selectedIds.size})
            </Button>
          )}

          <Tooltip title="Refresh Data">
            <IconButton
              onClick={() => fetchData(true)}
              sx={{ bgcolor: '#1e293b', border: '1px solid #334155', color: '#94a3b8', '&:hover': { color: '#f8fafc', bgcolor: '#334155' } }}
            >
              <RefreshIcon />
            </IconButton>
          </Tooltip>

          <Tooltip title="Export to Excel">
            <IconButton
              onClick={handleExportExcel}
              sx={{ bgcolor: '#1e293b', border: '1px solid #334155', color: '#10b981', '&:hover': { bgcolor: '#334155' } }}
            >
              <DownloadIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>


      {/* ── Table Container ─────────────────────────────────────────────────── */}
      <Paper
        elevation={0}
        sx={{
          bgcolor: '#131c2e',
          border: '1px solid #1e293b',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.25)'
        }}
      >
        {loading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 10, gap: 2 }}>
            <CircularProgress size={40} sx={{ color: '#38bdf8' }} />
            <Typography variant="body2" sx={{ color: '#94a3b8', fontWeight: 600 }}>
              Loading Printing & Stationary Records...
            </Typography>
          </Box>
        ) : (
          <Box sx={{ overflowX: 'auto', maxHeight: 'calc(100vh - 300px)', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', color: '#f8fafc', fontSize: '13px', textAlign: 'left' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#0f172a' }}>
                <tr style={{ borderBottom: '2px solid #334155' }}>
                  <th style={{ width: '50px', padding: '12px 10px', textAlign: 'center' }}>
                    <Checkbox
                      size="small"
                      checked={rows.length > 0 && selectedIds.size === rows.length}
                      indeterminate={selectedIds.size > 0 && selectedIds.size < rows.length}
                      onChange={handleSelectAll}
                      sx={{ color: '#64748b', '&.Mui-checked': { color: '#38bdf8' }, p: 0 }}
                    />
                  </th>
                  <th style={{ width: '80px', padding: '12px 16px', color: '#94a3b8', fontWeight: 800, letterSpacing: '0.5px' }}>
                    SL NO
                  </th>
                  <th style={{ minWidth: '220px', padding: '12px 16px', color: '#94a3b8', fontWeight: 800, letterSpacing: '0.5px' }}>
                    PURCHASE ITEM NAME
                  </th>
                  <th style={{ minWidth: '150px', padding: '12px 16px', color: '#94a3b8', fontWeight: 800, letterSpacing: '0.5px' }}>
                    DATE
                  </th>
                  <th style={{ minWidth: '150px', padding: '12px 16px', color: '#94a3b8', fontWeight: 800, letterSpacing: '0.5px' }}>
                    AMOUNT
                  </th>
                  <th style={{ minWidth: '250px', padding: '12px 16px', color: '#94a3b8', fontWeight: 800, letterSpacing: '0.5px' }}>
                    REASON
                  </th>
                  <th style={{ minWidth: '240px', padding: '12px 16px', color: '#94a3b8', fontWeight: 800, letterSpacing: '0.5px' }}>
                    BILL ATTACHD
                  </th>
                </tr>
              </thead>

              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                      <Typography variant="body1" fontWeight={600}>No records found</Typography>
                      <Typography variant="caption" sx={{ mt: 0.5, display: 'block' }}>
                        Click "ADD ROW" to create your first Printing & Stationary entry.
                      </Typography>
                    </td>
                  </tr>
                ) : (
                  rows.map((row, idx) => {
                    const isSelected = selectedIds.has(row._id);
                    const isUploading = uploadingRowId === row._id;

                    return (
                      <tr
                        key={row._id}
                        style={{
                          borderBottom: '1px solid #1e293b',
                          backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.08)' : (idx % 2 === 0 ? '#131c2e' : '#0f172a'),
                          transition: 'background-color 0.15s ease'
                        }}
                      >
                        {/* Checkbox */}
                        <td style={{ textAlign: 'center', padding: '10px' }}>
                          <Checkbox
                            size="small"
                            checked={isSelected}
                            onChange={() => handleSelectRow(row._id)}
                            sx={{ color: '#64748b', '&.Mui-checked': { color: '#38bdf8' }, p: 0 }}
                          />
                        </td>

                        {/* 1. SL NO */}
                        <td style={{ padding: '10px 16px', color: '#38bdf8', fontWeight: 700 }}>
                          <input
                            type="number"
                            value={row.slNo}
                            onChange={(e) => handleCellChange(row._id, 'slNo', e.target.value)}
                            style={{
                              width: '50px',
                              background: 'transparent',
                              border: '1px solid transparent',
                              color: '#38bdf8',
                              fontWeight: 700,
                              fontSize: '13px',
                              outline: 'none',
                              textAlign: 'center'
                            }}
                          />
                        </td>

                        {/* 2. PURCHASE ITEM NAME */}
                        <td style={{ padding: '8px 12px' }}>
                          <input
                            type="text"
                            placeholder="Enter Item Name..."
                            value={row.purchase_item_name}
                            onChange={(e) => handleCellChange(row._id, 'purchase_item_name', e.target.value)}
                            style={{
                              width: '100%',
                              backgroundColor: '#0b0f19',
                              border: '1px solid #334155',
                              borderRadius: '6px',
                              color: '#f8fafc',
                              padding: '8px 12px',
                              fontSize: '13px',
                              outline: 'none',
                              boxSizing: 'border-box'
                            }}
                          />
                        </td>

                        {/* 3. DATE */}
                        <td style={{ padding: '8px 12px' }}>
                          <input
                            type="date"
                            value={row.date || ''}
                            onChange={(e) => handleCellChange(row._id, 'date', e.target.value)}
                            style={{
                              width: '100%',
                              backgroundColor: '#0b0f19',
                              border: '1px solid #334155',
                              borderRadius: '6px',
                              color: '#f8fafc',
                              padding: '7px 10px',
                              fontSize: '13px',
                              outline: 'none',
                              colorScheme: 'dark',
                              boxSizing: 'border-box'
                            }}
                          />
                        </td>

                        {/* 4. AMOUNT */}
                        <td style={{ padding: '8px 12px' }}>
                          <input
                            type="text"
                            placeholder="0.00"
                            value={row.amount}
                            onChange={(e) => handleCellChange(row._id, 'amount', e.target.value)}
                            style={{
                              width: '100%',
                              backgroundColor: '#0b0f19',
                              border: '1px solid #334155',
                              borderRadius: '6px',
                              color: '#10b981',
                              fontWeight: 700,
                              padding: '8px 12px',
                              fontSize: '13px',
                              outline: 'none',
                              boxSizing: 'border-box'
                            }}
                          />
                        </td>

                        {/* 5. REASON */}
                        <td style={{ padding: '8px 12px' }}>
                          <input
                            type="text"
                            placeholder="Enter Reason/Purpose..."
                            value={row.reason}
                            onChange={(e) => handleCellChange(row._id, 'reason', e.target.value)}
                            style={{
                              width: '100%',
                              backgroundColor: '#0b0f19',
                              border: '1px solid #334155',
                              borderRadius: '6px',
                              color: '#f8fafc',
                              padding: '8px 12px',
                              fontSize: '13px',
                              outline: 'none',
                              boxSizing: 'border-box'
                            }}
                          />
                        </td>

                        {/* 6. BILL ATTACHD */}
                        <td style={{ padding: '8px 12px' }}>
                          {isUploading ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <CircularProgress size={16} sx={{ color: '#38bdf8' }} />
                              <Typography variant="caption" sx={{ color: '#94a3b8' }}>Uploading PDF...</Typography>
                            </Box>
                          ) : row.bill_pdf_url ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                              <Chip
                                icon={<PictureAsPdfIcon style={{ color: '#ef4444', fontSize: '16px' }} />}
                                label={row.bill_pdf_name || 'PDF Bill'}
                                size="small"
                                onClick={() => handleViewPdf(row.bill_pdf_url)}
                                title="Click to view PDF"
                                sx={{
                                  bgcolor: 'rgba(239, 68, 68, 0.12)',
                                  color: '#f87171',
                                  fontWeight: 600,
                                  fontSize: '11px',
                                  border: '1px solid rgba(239, 68, 68, 0.3)',
                                  maxWidth: '150px',
                                  cursor: 'pointer',
                                  '&:hover': { bgcolor: 'rgba(239, 68, 68, 0.25)' }
                                }}
                              />

                              {/* View Button */}
                              <Tooltip title="View / Open PDF">
                                <IconButton
                                  size="small"
                                  onClick={() => handleViewPdf(row.bill_pdf_url)}
                                  sx={{ color: '#38bdf8', p: '4px', '&:hover': { bgcolor: 'rgba(56, 189, 248, 0.15)' } }}
                                >
                                  <VisibilityIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>

                              {/* Replace Button */}
                              <Tooltip title="Replace PDF">
                                <IconButton
                                  size="small"
                                  onClick={() => triggerPdfUpload(row)}
                                  sx={{ color: '#f59e0b', p: '4px', '&:hover': { bgcolor: 'rgba(245, 158, 11, 0.15)' } }}
                                >
                                  <UploadFileIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>

                              {/* Remove Button */}
                              <Tooltip title="Remove PDF">
                                <IconButton
                                  size="small"
                                  onClick={() => handleRemovePdf(row)}
                                  sx={{ color: '#ef4444', p: '4px', '&:hover': { bgcolor: 'rgba(239, 68, 68, 0.15)' } }}
                                >
                                  <CloseIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          ) : (
                            <Button
                              variant="outlined"
                              size="small"
                              startIcon={<UploadFileIcon fontSize="small" />}
                              onClick={() => triggerPdfUpload(row)}
                              sx={{
                                border: '1px dashed #475569',
                                color: '#94a3b8',
                                fontSize: '11px',
                                textTransform: 'none',
                                py: '3px',
                                px: '10px',
                                borderRadius: '6px',
                                '&:hover': { border: '1px dashed #38bdf8', color: '#38bdf8', bgcolor: 'rgba(56, 189, 248, 0.05)' }
                              }}
                            >
                              Upload PDF
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </Box>
        )}
      </Paper>

      {/* ── Confirmation Modal for Deleting ─────────────────────────────────── */}
      <Dialog
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        PaperProps={{
          sx: { bgcolor: '#1e293b', color: '#f8fafc', borderRadius: '12px', border: '1px solid #334155' }
        }}
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#ef4444' }}>
          Confirm Delete
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: '#94a3b8' }}>
            Are you sure you want to delete {selectedIds.size} selected Printing & Stationary record(s)? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setConfirmDel(false)} sx={{ color: '#94a3b8', textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteSelected}
            variant="contained"
            sx={{ bgcolor: '#ef4444', '&:hover': { bgcolor: '#dc2626' }, textTransform: 'none', fontWeight: 700 }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Snackbar Notifications ──────────────────────────────────────────── */}
      {snack && (
        <Snackbar
          open={!!snack}
          autoHideDuration={4000}
          onClose={() => setSnack(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          <Alert onClose={() => setSnack(null)} severity={snack.severity} sx={{ width: '100%', fontWeight: 600 }}>
            {snack.message}
          </Alert>
        </Snackbar>
      )}
    </Box>
  );
}
