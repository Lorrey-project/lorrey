import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Box, Button, CircularProgress, Typography, IconButton,
  Snackbar, Alert, Chip, Tooltip, Select, MenuItem
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import TableChartIcon from '@mui/icons-material/TableChart';
import axios from 'axios';
import { io } from 'socket.io-client';
import * as XLSX from 'xlsx';

const API_URL  = import.meta.env.VITE_API_URL  || 'http://localhost:3000';
const SOCKET_URL = import.meta.env.VITE_SOCKET_IO_URL || API_URL;

// ─── Column Definitions ───────────────────────────────────────────────────────
const COLUMNS = [
  { key: 'voucherNumber', label: 'VOUCHER\nNO.',     width: 140, type: 'auto'    },
  { key: 'date',          label: 'DATE',              width: 120, type: 'auto', isDate: true },
  { key: 'vehicleNumber', label: 'VEHICLE\nNUMBER',  width: 130, type: 'auto'    },
  { key: 'purpose',       label: 'PURPOSE',           width: 110, type: 'dropdown',
    options: ['Fuel', 'Advance', 'Repair', 'Toll', 'Others'],
    colorMap: { Fuel: '#fff7ed', Advance: '#eff6ff', Repair: '#fef2f2', Toll: '#f0fdf4', Others: '#f5f3ff' }
  },
  { key: 'name',          label: 'PAYEE NAME',        width: 150, type: 'manual'  },
  { key: 'reason',        label: 'REASON',            width: 160, type: 'manual'  },
  { key: 'amount',        label: 'AMOUNT (₹)',        width: 120, type: 'manual'  },
  { key: 'remarks',       label: 'REMARKS',           width: 180, type: 'manual'  },
  { key: 'createdAt',     label: 'CREATED AT',        width: 140, type: 'auto'    },
  { key: 'slip_url',      label: 'VOUCHER\nSLIP PDF', width: 120, type: 'slipUrl' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return String(d);
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yyyy = dt.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
};

const fmtAmt = (n) =>
  n !== undefined && n !== '' && n !== null
    ? '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 })
    : '';

const PURPOSE_COLORS = {
  Fuel: '#c2410c', Advance: '#1d4ed8', Repair: '#b91c1c', Toll: '#15803d', Others: '#374151'
};

// ─── Socket (singleton) ───────────────────────────────────────────────────────
const socket = io(SOCKET_URL, { transports: ['websocket'], autoConnect: true });

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function VoucherRegister({ onBack }) {
  const [vouchers, setVouchers]     = useState([]);
  const [localData, setLocalData]   = useState({});
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [snack, setSnack]           = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, setDeleting]     = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const dirtyCount  = Object.keys(localData).length;
  const allSelected = vouchers.length > 0 && selectedIds.size === vouchers.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleSelect = (id) => setSelectedIds(prev => {
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  });
  const toggleSelectAll = () => {
    if (allSelected || someSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(vouchers.map(v => v._id)));
  };

  // ── Fetch ────────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/voucher`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) {
        setVouchers(res.data.vouchers);
        setLocalData({});
      }
    } catch (e) { console.error('Fetch failed:', e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchData();
    const onUpdate = () => fetchData();
    socket.on('voucherUpdate', onUpdate);
    return () => socket.off('voucherUpdate', onUpdate);
  }, [fetchData]);

  // ── Cell edit ───────────────────────────────────────────────────────────────
  const handleCellEdit = useCallback((rowId, field, value) => {
    setLocalData(prev => ({
      ...prev,
      [rowId]: { ...(prev[rowId] || {}), [field]: value }
    }));
  }, []);

  // ── Bulk Save (manual fields only) ─────────────────────────────────────────
  const handleSave = async () => {
    if (dirtyCount === 0) return;
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      for (const [id, changes] of Object.entries(localData)) {
        await axios.put(`${API_URL}/voucher/${id}`, changes, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      setVouchers(prev => prev.map(row => {
        const patch = localData[row._id];
        return patch ? { ...row, ...patch } : row;
      }));
      setLocalData({});
      setSnack({ severity: 'success', msg: `${dirtyCount} row(s) saved!` });
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Save failed: ' + (err.response?.data?.error || err.message) });
    } finally { setSaving(false); }
  };

  // ── Delete selected ─────────────────────────────────────────────────────────
  const handleDelete = async () => {
    setDeleting(true);
    try {
      const token = localStorage.getItem('token');
      const ids = [...selectedIds];
      for (const id of ids) {
        await axios.delete(`${API_URL}/voucher/${id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      setVouchers(prev => prev.filter(v => !ids.includes(v._id)));
      setLocalData(prev => {
        const n = { ...prev };
        ids.forEach(id => delete n[id]);
        return n;
      });
      setSelectedIds(new Set());
      setConfirmDel(false);
      setSnack({ severity: 'success', msg: `${ids.length} voucher(s) deleted.` });
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Delete failed: ' + (err.response?.data?.error || err.message) });
    } finally { setDeleting(false); }
  };

  // ── Excel (.xlsx) Export ───────────────────────────────────────────────────
  const handleExportExcel = () => {
    const EXCEL_COLS = COLUMNS.filter(c => c.type !== 'slipUrl');
    const headerRow  = EXCEL_COLS.map(c => c.label.replace(/\n/g, ' '));
    const dataRows   = vouchers.map(v =>
      EXCEL_COLS.map(c => {
        const val = v[c.key];
        if (c.isDate || c.key === 'createdAt') return fmtDate(val);
        if (c.key === 'amount') return Number(val) || 0;
        return val !== undefined && val !== null ? String(val) : '';
      })
    );
    const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
    ws['!cols'] = EXCEL_COLS.map(c => ({ wch: Math.max(12, Math.floor(c.width / 7)) }));
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Voucher Register');
    XLSX.writeFile(wb, `Voucher_Register_${fmtDate(new Date().toISOString())}.xlsx`);
  };

  // ── XLS Export (via shared utility) ──────────────────────────────────────
  const handleExport = () => {
    const rows = vouchers.map(v => {
      const row = {};
      COLUMNS.filter(c => c.type !== 'slipUrl').forEach(c => {
        const val = v[c.key];
        row[c.label.replace(/\n/g, ' ')] = (c.isDate || c.key === 'createdAt') ? fmtDate(val)
          : c.key === 'amount' ? (Number(val) || 0)
          : (val !== null && val !== undefined ? String(val) : '');
      });
      return row;
    });
    // Use the global shared XLS utility
    import('../utils/exportCsv').then(({ exportToCsv }) =>
      exportToCsv('voucher_register.xls', rows)
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100vh" gap={2}>
        <CircularProgress size={48} thickness={4} sx={{ color: '#7c3aed' }} />
        <Typography color="text.secondary" fontWeight={600}>Loading Voucher Register…</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#f8fafc', overflow: 'hidden' }}>

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
          <TableChartIcon sx={{ color: '#7c3aed', fontSize: 18 }} />
          <Typography variant="h6" fontWeight={800} sx={{ color: '#0f172a', letterSpacing: '-0.5px' }}>
            Voucher Register
          </Typography>
        </Box>

        <Chip
          label={`${vouchers.length} voucher${vouchers.length !== 1 ? 's' : ''}`}
          size="small"
          sx={{ fontWeight: 700, bgcolor: '#ede9fe', color: '#7c3aed' }}
        />

        {dirtyCount > 0 && (
          <Chip label={`${dirtyCount} unsaved`} size="small" color="warning" sx={{ fontWeight: 700 }} />
        )}
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
          <Tooltip title="Reload">
            <IconButton size="small" onClick={fetchData} sx={{ bgcolor: '#f1f5f9' }}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={handleExport}
            sx={{ fontWeight: 700, borderRadius: 2, fontSize: '12px' }}>XLS</Button>
          <Button size="small" variant="contained"
            startIcon={saving ? <CircularProgress size={13} color="inherit" /> : <SaveIcon />}
            onClick={handleSave} disabled={dirtyCount === 0 || saving}
            sx={{
              fontWeight: 800, borderRadius: 2, px: 2.5, fontSize: '12px',
              background: dirtyCount > 0 ? 'linear-gradient(135deg,#7c3aed,#4f46e5)' : '#cbd5e1',
              boxShadow: dirtyCount > 0 ? '0 4px 12px rgba(124,58,237,0.35)' : 'none',
              '&:disabled': { background: '#cbd5e1', color: '#94a3b8' },
            }}
          >{saving ? 'Saving…' : `Save${dirtyCount > 0 ? ` (${dirtyCount})` : ''}`}</Button>
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
                background: 'linear-gradient(135deg,#1e293b,#0f172a)',
                textAlign: 'center', padding: '7px 4px',
                borderRight: '1px solid rgba(255,255,255,0.12)',
                borderBottom: '2px solid rgba(255,255,255,0.2)',
              }}>
                <input type="checkbox" checked={allSelected}
                  ref={el => { if (el) el.indeterminate = someSelected; }}
                  onChange={toggleSelectAll}
                  style={{ cursor: 'pointer', width: 14, height: 14, accentColor: '#7c3aed' }} />
              </th>

              {COLUMNS.map(col => {
                const typeStyle = col.type === 'auto'
                  ? { background: 'linear-gradient(135deg,#312e81,#1e1b4b)', color: '#c7d2fe' }
                  : col.type === 'slipUrl'
                  ? { background: 'linear-gradient(135deg,#7c2d12,#9a3412)', color: '#fed7aa' }
                  : col.type === 'dropdown'
                  ? { background: 'linear-gradient(135deg,#0c4a6e,#0369a1)', color: '#bae6fd' }
                  : { background: 'linear-gradient(135deg,#1e40af,#1d4ed8)', color: '#bfdbfe' };
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
            {vouchers.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 1} style={{
                  textAlign: 'center', padding: '60px', color: '#64748b', fontSize: '13px'
                }}>
                  No vouchers found. Create a voucher — it will appear here automatically.
                </td>
              </tr>
            )}
            {vouchers.map((row, ri) => {
              const hasDraft   = !!localData[row._id];
              const isSelected = selectedIds.has(row._id);
              return (
                <tr key={row._id} style={{
                  background: isSelected ? 'rgba(124,58,237,0.08)'
                    : hasDraft ? '#fffbeb'
                    : ri % 2 === 0 ? '#fff' : '#f8fafc',
                  outline: isSelected ? '2px solid rgba(124,58,237,0.4)' : 'none',
                }}>
                  {/* Row checkbox */}
                  <td style={{
                    width: 40, textAlign: 'center', border: '1px solid #e2e8f0', padding: '4px',
                    background: isSelected ? 'rgba(124,58,237,0.06)' : 'transparent',
                  }}>
                    <input type="checkbox" checked={isSelected}
                      onChange={() => toggleSelect(row._id)}
                      style={{ cursor: 'pointer', width: 13, height: 13, accentColor: '#7c3aed' }} />
                  </td>

                  {COLUMNS.map(col => {
                    const rawVal   = row[col.key];
                    const localVal = localData[row._id]?.[col.key];
                    const isDirty  = localVal !== undefined;
                    let display    = localVal !== undefined ? localVal
                                   : (rawVal !== null && rawVal !== undefined ? String(rawVal) : '');

                    // Format dates
                    if (col.isDate || col.key === 'createdAt') display = fmtDate(rawVal);
                    // Format amount
                    if (col.key === 'amount') display = fmtAmt(isDirty ? localVal : rawVal);

                    const cellStyle = {
                      padding: '4px 5px', border: '1px solid #e2e8f0', fontSize: '11px',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      borderRight: isDirty ? '2px solid #f59e0b' : '1px solid #e2e8f0',
                      width: col.width, maxWidth: col.width,
                    };

                    // ── Slip URL (PDF link) ──────────────────────────────────
                    if (col.type === 'slipUrl') {
                      return (
                        <td key={col.key} style={{ ...cellStyle, textAlign: 'center', padding: '3px' }}>
                          {rawVal ? (
                            <a href={rawVal} target="_blank" rel="noopener noreferrer"
                              title="View / Download Voucher Slip PDF"
                              style={{
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                gap: 3, padding: '3px 8px', borderRadius: 6,
                                background: '#fef2f2', border: '1px solid #fca5a5',
                                color: '#dc2626', textDecoration: 'none', fontSize: '10px', fontWeight: 700,
                              }}>
                              📄 PDF
                            </a>
                          ) : <span style={{ color: '#cbd5e1', fontSize: '10px' }}>—</span>}
                        </td>
                      );
                    }

                    // ── Auto (read-only) ────────────────────────────────────
                    if (col.type === 'auto') {
                      return (
                        <td key={col.key} style={{
                          ...cellStyle,
                          background: isDirty ? 'rgba(254,243,199,0.5)' : 'rgba(237,233,254,0.18)',
                          cursor: 'default',
                        }}>{display}</td>
                      );
                    }

                    // ── Dropdown ────────────────────────────────────────────
                    if (col.type === 'dropdown') {
                      const bgColor = col.colorMap?.[display] || 'inherit';
                      return (
                        <td key={col.key} style={{ ...cellStyle, padding: 0, background: bgColor }}>
                          <select value={display}
                            onChange={e => handleCellEdit(row._id, col.key, e.target.value)}
                            style={{
                              width: '100%', height: '100%', border: 'none', background: 'transparent',
                              fontSize: '11px', cursor: 'pointer', padding: '4px 5px',
                              color: PURPOSE_COLORS[display] || '#0f172a', fontWeight: 700,
                            }}>
                            {col.options.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </td>
                      );
                    }

                    // ── Manual editable ─────────────────────────────────────
                    return (
                      <EditableCell key={col.key}
                        value={isDirty ? String(localVal) : String(rawVal ?? '')}
                        isDirty={isDirty}
                        onChange={v => handleCellEdit(row._id, col.key, v)}
                        style={cellStyle}
                      />
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
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
              🗑️ Delete {selectedIds.size} Voucher{selectedIds.size > 1 ? 's' : ''}?
            </Typography>
            <Typography color="text.secondary" fontSize="13px" mb={3}>
              This will permanently remove the selected vouchers from MongoDB. <strong>Cannot be undone.</strong>
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
        background: isDirty ? 'rgba(254,243,199,0.6)' : '#fff7ed0a',
      }}
      onFocus={e => { e.currentTarget.style.boxShadow = 'inset 0 0 0 2px #3b82f6'; e.currentTarget.style.background = '#eff6ff'; }}
      onBlurCapture={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.background = ''; }}
    />
  );
}
