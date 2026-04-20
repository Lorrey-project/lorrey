import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Box, Button, CircularProgress, Typography, IconButton,
  Snackbar, Alert, Chip, Tooltip, Select, MenuItem
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import TableChartIcon from '@mui/icons-material/TableChart';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import axios from 'axios';
import { io } from 'socket.io-client';
import * as XLSX from 'xlsx';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const SOCKET_URL = import.meta.env.VITE_SOCKET_IO_URL || API_URL;

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

// ─── Helpers ──────────────────────────────────────────────────────────────────
const socket = io(SOCKET_URL, { transports: ['websocket'], autoConnect: true });

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function GSTPortalRegister({ onBack }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [snack, setSnack] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [uploadingObj, setUploadingObj] = useState(null); // { id: rowId }

  const allSelected = entries.length > 0 && selectedIds.size === entries.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const fileInputRef = useRef(null);
  const [targetRowIdForUpload, setTargetRowIdForUpload] = useState(null);

  const toggleSelect = (id) => setSelectedIds(prev => {
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  });
  const toggleSelectAll = () => {
    if (allSelected || someSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(entries.map(v => v._id)));
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
      }
    } catch (e) { console.error('Fetch failed:', e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchData();
    const onUpdate = () => fetchData();
    socket.on('gstPortalUpdates', onUpdate);
    return () => socket.off('gstPortalUpdates', onUpdate);
  }, [fetchData]);

  // ── Row Insert ─────────────────────────────────────────────────────────────
  const handleAddNewRow = async () => {
    try {
      const token = localStorage.getItem('token');
      const nextSlNo = entries.length > 0 ? Math.max(...entries.map(e => e['SL NO'] || 0)) + 1 : 1;
      const res = await axios.post(`${API_URL}/gst-portal`,
        { "SL NO": nextSlNo },
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
      // No manual success snackbar to keep it unobtrusive
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Auto-save failed: ' + (err.response?.data?.error || err.message) });
    }
  }, []);

  // ── Delete selected ─────────────────────────────────────────────────────────
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

  // ── Excel (.xlsx) Export ───────────────────────────────────────────────────
  const handleExportExcel = () => {
    const EXCEL_COLS = COLUMNS.filter(c => c.type !== 'upload');
    const headerRow = EXCEL_COLS.map(c => c.label.replace(/\n/g, ' '));
    const dataRows = entries.map(v =>
      EXCEL_COLS.map(c => {
        const val = v[c.key];
        return val !== undefined && val !== null ? String(val) : '';
      })
    );
    const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
    ws['!cols'] = EXCEL_COLS.map(c => ({ wch: Math.max(12, Math.floor(c.width / 7)) }));
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'GST Portal Details');
    XLSX.writeFile(wb, `GST_Portal_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // ── XLS Export ──────────────────────────────────────────────────────────────
  const handleExport = () => {
    const exportCols = COLUMNS.filter(c => c.type !== 'upload');
    const rows = entries.map(v => {
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
  const totals = {
    'Invoice Value': 0,
    'Taxable Value': 0,
    'Integrated Tax': 0,
    'CGST': 0,
    'SGST': 0,
    'Cess': 0
  };

  entries.forEach(row => {
    Object.keys(totals).forEach(k => {
      const val = parseFloat(row[k]);
      if (!isNaN(val)) totals[k] += val;
    });
  });

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#f8fafc', overflow: 'hidden' }}>

      {/* Hidden file input */}
      <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*,application/pdf" onChange={onFileSelected} />

      {/* ── Top Bar ─────────────────────────────────────────────────────────── */}
      <Box sx={{
        px: 2.5, py: 1.2,
        display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap',
        bgcolor: '#fff', borderBottom: '1px solid #e2e8f0',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)', flexShrink: 0
      }}>
        <IconButton onClick={onBack} size="small" sx={{ bgcolor: '#f1f5f9', '&:hover': { bgcolor: '#e2e8f0' } }}>
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
        {selectedIds.size > 0 && (
          <Chip label={`${selectedIds.size} selected`} size="small"
            sx={{ fontWeight: 700, bgcolor: '#fee2e2', color: '#b91c1c' }} />
        )}

        <Box sx={{ ml: 'auto', display: 'flex', gap: 1, alignItems: 'center' }}>
          {selectedIds.size > 0 && (
            <Button size="small" variant="contained"
              startIcon={deleting ? <CircularProgress size={13} color="inherit" /> : <DeleteIcon />}
              onClick={() => setConfirmDel(true)} disabled={deleting}
              sx={{
                fontWeight: 800, borderRadius: 2, px: 2, fontSize: '12px',
                background: 'linear-gradient(135deg,#dc2626,#b91c1c)',
                boxShadow: '0 4px 12px rgba(220,38,38,0.35)',
              }}
            >Delete ({selectedIds.size})</Button>
          )}

          <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={handleAddNewRow}
            sx={{ fontWeight: 700, borderRadius: 2, fontSize: '12px' }}>New Row</Button>

          <Tooltip title="Reload">
            <IconButton size="small" onClick={fetchData} sx={{ bgcolor: '#f1f5f9' }}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={handleExport}
            sx={{ fontWeight: 700, borderRadius: 2, fontSize: '12px' }}>XLS</Button>
        </Box>
      </Box>

      {/* ── Excel Table ─────────────────────────────────────────────────────── */}
      <Box sx={{ overflow: 'auto', flex: 1 }}>
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
              {/* Select-all checkbox */}
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
            {entries.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 1} style={{
                  textAlign: 'center', padding: '60px', color: '#64748b', fontSize: '13px'
                }}>
                  No entries found. Click "New Row" to add one.
                </td>
              </tr>
            )}
            {entries.map((row, ri) => {
              const isSelected = selectedIds.has(row._id);
              return (
                <tr key={row._id} style={{
                  background: isSelected ? 'rgba(14,165,233,0.08)'
                    : ri % 2 === 0 ? '#fff' : '#f8fafc',
                  outline: isSelected ? '2px solid rgba(14,165,233,0.4)' : 'none',
                }}>
                  {/* Row checkbox */}
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

                    // ── Auto (read-only) ────────────────────────────────────
                    if (col.type === 'auto') {
                      return (
                        <td key={col.key} style={{
                          ...cellStyle,
                          background: 'rgba(237,233,254,0.18)',
                          cursor: 'default',
                        }}>{display}</td>
                      );
                    }

                    // ── Upload ───────────────────────────────────────────────
                    if (col.type === 'upload') {
                      return (
                        <td key={col.key} style={{ ...cellStyle, textAlign: 'center', padding: '3px' }}>
                          {uploadingObj === row._id ? (
                            <CircularProgress size={16} />
                          ) : rawVal ? (
                            <Box display="flex" gap={1} justifyContent="center" alignItems="center">
                              <a href={rawVal} target="_blank" rel="noopener noreferrer"
                                title="View GST File"
                                style={{
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  gap: 3, padding: '3px 8px', borderRadius: 6,
                                  background: '#eff6ff', border: '1px solid #93c5fd',
                                  color: '#2563eb', textDecoration: 'none', fontSize: '10px', fontWeight: 700,
                                }}>📄 View</a>
                              <IconButton size="small" onClick={() => handleTriggerUpload(row._id)} sx={{ padding: '2px' }}>
                                <RefreshIcon sx={{ fontSize: 14 }} />
                              </IconButton>
                            </Box>
                          ) : (
                            <Button size="small" variant="outlined" onClick={() => handleTriggerUpload(row._id)}
                              startIcon={<FileUploadIcon sx={{ fontSize: 14 }} />}
                              sx={{
                                padding: '2px 6px', fontSize: '10px', minWidth: '40px',
                                textTransform: 'none', borderRadius: '6px'
                              }}>Upload</Button>
                          )}
                        </td>
                      );
                    }

                    // ── Dropdown ────────────────────────────────────────────
                    if (col.type === 'dropdown') {
                      return (
                        <td key={col.key} style={{ ...cellStyle, padding: 0 }}>
                          <select value={display}
                            onChange={e => handleCellEdit(row._id, col.key, e.target.value)}
                            style={{
                              width: '100%', height: '100%', border: 'none', background: 'transparent',
                              fontSize: '11px', cursor: 'pointer', padding: '4px 5px',
                              color: '#0f172a', fontWeight: 700,
                            }}>
                            {col.options.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </td>
                      );
                    }

                    // ── Manual editable ─────────────────────────────────────
                    return (
                      <EditableCell key={col.key}
                        value={String(rawVal ?? '')}
                        isDirty={false}
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
              {COLUMNS.map((col, idx) => {
                const isTotalCol = Object.keys(totals).includes(col.key);
                const isLabelCol = idx === 0;

                return (
                  <td key={col.key} style={{
                    padding: '10px 5px', textAlign: isTotalCol ? 'left' : 'center', fontSize: '12px',
                    borderTop: '3px solid #94a3b8', borderRight: '1px solid #e2e8f0',
                    color: isTotalCol ? '#000' : '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    background: isLabelCol ? '#f1f5f9' : 'transparent',
                    letterSpacing: isLabelCol ? '1px' : 'normal'
                  }}>
                    {isLabelCol ? 'TOTAL' : isTotalCol ? totals[col.key].toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </Box>

      {/* ── Confirm delete ──────────────────────────────────────────────────── */}
      {confirmDel && (
        <Box sx={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setConfirmDel(false)}>
          <Box sx={{
            bgcolor: '#fff', borderRadius: 3, p: 4, maxWidth: 420, width: '90%',
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
