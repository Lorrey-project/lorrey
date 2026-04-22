import React, { useState, useEffect, useMemo } from 'react';
import {
  Box, Typography, Button, IconButton, TextField, CircularProgress,
  Chip, Snackbar, Alert, Tooltip, MenuItem, Select, FormControl, InputLabel,
  Dialog, DialogTitle, DialogContent, DialogActions, Checkbox
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import EditIcon from '@mui/icons-material/Edit';
import axios from 'axios';
import { exportToCsv } from '../utils/exportCsv';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const num = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};
const round2 = (n) => Math.round(n);

const COLUMNS = [
  { key: 'select', label: 'Select', width: 60, align: 'center' },
  { key: 'invoiceDate', label: 'Invoice Date', width: 130, align: 'center', userEdit: true, type: 'date' },
  { key: 'displayInvoiceNumber', label: 'Invoice Number', width: 180, align: 'left', sticky: true, userEdit: true },
  { key: 'month', label: 'Month', width: 150, align: 'center', userEdit: true, type: 'monthYear' },
  { key: 'site', label: 'SITE', width: 120, align: 'left', userEdit: true, type: 'select', options: ['NVL', 'NVCL', 'NUVOCO VISTAS CORP. LTD.'] },
  {
    key: 'billType', label: 'BILL', width: 130, align: 'left', type: 'select',
    options: ['FREIGHT', 'EXTRA FREIGHT', 'TOLL', 'UNLOADING', 'CREDIT NOTE']
  },
  { key: 'amount', label: 'Amount', width: 100, align: 'right', userEdit: true },
  { key: 'cgst', label: 'CGST', width: 90, align: 'right', bg: '#fef3c7' },
  { key: 'sgst', label: 'SGST', width: 90, align: 'right', bg: '#fef3c7' },
  { key: 'totalAmount', label: 'Total Amount', width: 110, align: 'right', highlight: '#e0e7ff' },
  { key: 'tds', label: 'Tds @2%', width: 90, align: 'right', highlight: '#cffafe' },
  { key: 'receivable', label: 'Receivable Amount\nFrom Nuvoco', width: 130, align: 'right', highlight: '#dcfce7' },
  { key: 'paymentAmount', label: 'Payment Amount\n(Paid)', width: 150, align: 'right', isGrouped: true, bg: '#fdf2f8' },
  { key: 'difference', label: 'Difference', width: 100, align: 'right', isGrouped: true, bg: '#fdf2f8' },
  { key: 'paymentDate', label: 'Payment Date', width: 130, align: 'center', isGrouped: true, bg: '#fdf2f8' },
  { key: 'referenceNo', label: 'Reference No.', width: 140, align: 'left', isGrouped: true, bg: '#fdf2f8' },
  { key: 'debitAmount', label: 'Debit Amount', width: 110, align: 'right', isGrouped: true, bg: '#fdf2f8' },
  { key: 'remarks', label: 'Remarks', width: 160, align: 'left', isGrouped: true, bg: '#fdf2f8' }
];

export default function FinancialYearDetails({ onBack }) {
  const [rows, setRows] = useState([]);
  const [payments, setPayments] = useState([]); // Array of grouped payment objects
  const [loading, setLoading] = useState(false);
  const [snack, setSnack] = useState(null);

  // Selection
  const [selectedIds, setSelectedIds] = useState([]);

  // Modal State
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    id: '', paymentAmount: '', paymentDate: '', referenceNo: '', debitAmount: '', remarks: ''
  });
  const [uploadingGroup, setUploadingGroup] = useState(null);

  const [dirtyRows, setDirtyRows] = useState(new Set());
  const [dirtyGroups, setDirtyGroups] = useState(new Set());

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_URL}/fy-details/data`);
      setRows(data.rows || []);
      setPayments(data.payments || []);
      setSelectedIds([]);
      setDirtyRows(new Set());
      setDirtyGroups(new Set());
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Failed to load details' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // Compute calculated fields row-by-row
  const computedRows = useMemo(() => {
    return rows.map(r => {
      const amt = num(r.amount);
      const cgst = round2(amt * 0.06);
      const sgst = round2(amt * 0.06);
      const totalAmount = amt + cgst + sgst;
      const tds = round2(amt * 0.02);
      const receivable = totalAmount - tds;

      let paymentObj = payments.find(p => p.billNos.includes(r.invoiceNumber));

      return {
        ...r,
        amount: amt, cgst, sgst, totalAmount, tds, receivable,
        groupId: paymentObj?.id || `AUTO-${r.invoiceNumber}`,
        groupData: paymentObj || { id: `AUTO-${r.invoiceNumber}`, billNos: [r.invoiceNumber], paymentAmount: '', paymentDate: '', referenceNo: '', debitAmount: '', remarks: '', paymentProofUrl: '' }
      };
    }).sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate) || a.invoiceNumber.localeCompare(b.invoiceNumber));
  }, [rows, payments]);

  // Handle billType edit 
  const handleBillTypeChange = (invoiceNumber, newType) => {
    setRows(prev => prev.map(r => r.invoiceNumber === invoiceNumber ? { ...r, billType: newType } : r));
    setDirtyRows(prev => new Set(prev).add(invoiceNumber));
  };

  const handleRowEdit = (invoiceNumber, field, value) => {
    setRows(prev => prev.map(r => r.invoiceNumber === invoiceNumber ? { ...r, [field]: value } : r));
    setDirtyRows(prev => new Set(prev).add(invoiceNumber));
  };

  // Group handling for UI rowSpan
  const groupSpanMap = useMemo(() => {
    const map = {};
    for (let i = 0; i < computedRows.length; i++) {
      const gid = computedRows[i].groupId;
      if (gid) {
        if (map[gid]) map[gid].count++;
        else map[gid] = { startIdx: i, count: 1 };
      }
    }
    return map;
  }, [computedRows]);

  const toggleSelect = (invoiceNumber) => {
    setSelectedIds(prev => prev.includes(invoiceNumber)
      ? prev.filter(id => id !== invoiceNumber)
      : [...prev, invoiceNumber]);
  };

  const openPaymentModal = () => {
    if (selectedIds.length === 0) return setSnack({ severity: 'warning', msg: 'Select invoices first' });

    // Check if these are already part of a group
    let existingGroup = null;
    for (const p of payments) {
      if (p.billNos.some(bn => selectedIds.includes(bn))) {
        existingGroup = p;
        break;
      }
    }

    if (existingGroup) {
      // Edit existing group
      setPaymentForm({
        id: existingGroup.id,
        paymentAmount: existingGroup.paymentAmount || '',
        paymentDate: existingGroup.paymentDate || '',
        referenceNo: existingGroup.referenceNo || '',
        debitAmount: existingGroup.debitAmount || '',
        remarks: existingGroup.remarks || ''
      });
      // also auto-select all from this group
      const allBillNos = new Set([...selectedIds, ...existingGroup.billNos]);
      setSelectedIds(Array.from(allBillNos));
    } else {
      // New group
      setPaymentForm({
        id: `G-${Date.now()}`, paymentAmount: '', paymentDate: '', referenceNo: '', debitAmount: '', remarks: ''
      });
    }
    setPaymentModalOpen(true);
  };

  const clearSelectionFromGroup = async () => {
    if (selectedIds.length === 0) return;
    try {
      // For any group that has selectedIds, remove those ids
      await Promise.all(payments.map(async p => {
        const intersection = p.billNos.filter(bn => selectedIds.includes(bn));
        if (intersection.length > 0) {
          const newBillNos = p.billNos.filter(bn => !selectedIds.includes(bn));
          await axios.post(`${API_URL}/fy-details/save-group`, { ...p, billNos: newBillNos });
        }
      }));
      setSnack({ severity: 'success', msg: 'Selection cleared from group' });
      setPaymentModalOpen(false);
      fetchData();
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Failed to clear' });
    }
  };

  const saveGroup = async () => {
    try {
      await axios.post(`${API_URL}/fy-details/save-group`, {
        id: paymentForm.id,
        billNos: selectedIds,
        paymentAmount: num(paymentForm.paymentAmount),
        paymentDate: paymentForm.paymentDate,
        referenceNo: paymentForm.referenceNo,
        debitAmount: num(paymentForm.debitAmount),
        remarks: paymentForm.remarks
      });
      setSnack({ severity: 'success', msg: 'Payment Group Saved!' });
      setPaymentModalOpen(false);
      fetchData();
    } catch {
      setSnack({ severity: 'error', msg: 'Failed to save group' });
    }
  };

  const handleInlineEdit = (groupId, field, value, cellGroupData) => {
    // If it's an AUTO group, make sure billNos is updated properly
    let payload = {
      id: groupId,
      billNos: cellGroupData.billNos,
      paymentAmount: num(cellGroupData.paymentAmount),
      paymentDate: cellGroupData.paymentDate || '',
      referenceNo: cellGroupData.referenceNo || '',
      debitAmount: num(cellGroupData.debitAmount),
      remarks: cellGroupData.remarks || '',
      [field]: value
    };
    if (field === 'paymentAmount' || field === 'debitAmount') payload[field] = num(value);

    // Optimistic update locally
    setPayments(prev => {
      const idx = prev.findIndex(p => p.id === groupId);
      if (idx !== -1) {
        let np = [...prev];
        np[idx] = { ...np[idx], [field]: payload[field] };
        return np;
      }
      return [...prev, payload];
    });
    setDirtyGroups(prev => new Set(prev).add(groupId));
  };

  const handleFileUpload = async (groupId, file, cellGroupData) => {
    setUploadingGroup(groupId);
    const formData = new FormData();
    formData.append('proof', file);
    formData.append('id', groupId);

    // If it's new AUTO group, we must ensure it is saved first
    if (!payments.some(p => p.id === groupId)) {
      await axios.post(`${API_URL}/fy-details/save-group`, {
        id: groupId,
        billNos: cellGroupData.billNos,
        paymentAmount: num(cellGroupData.paymentAmount),
        paymentDate: cellGroupData.paymentDate || '',
        referenceNo: cellGroupData.referenceNo || '',
        debitAmount: num(cellGroupData.debitAmount),
        remarks: cellGroupData.remarks || ''
      });
    }

    try {
      const { data } = await axios.post(`${API_URL}/fy-details/upload-proof`, formData);
      setPayments(prev => {
        const np = [...prev];
        const idx = np.findIndex(p => p.id === groupId);
        if (idx !== -1) np[idx].paymentProofUrl = data.url;
        else np.push({ id: groupId, paymentProofUrl: data.url, billNos: cellGroupData.billNos });
        return np;
      });
      setSnack({ severity: 'success', msg: 'Proof uploaded' });
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Failed to upload proof' });
    } finally {
      setUploadingGroup(null);
    }
  };

  const saveAllChanges = async () => {
    setLoading(true);
    try {
      const rowPromises = Array.from(dirtyRows).map(invoiceNum => {
        const r = rows.find(x => x.invoiceNumber === invoiceNum);
        if (!r) return Promise.resolve();
        return axios.post(`${API_URL}/fy-details/save-row`, {
          billNo: invoiceNum,
          editedInvoiceDate: r.invoiceDate,
          editedInvoiceNumber: r.displayInvoiceNumber,
          editedMonth: r.month,
          editedSite: r.site,
          editedAmount: r.amount,
          billType: r.billType
        });
      });

      const payPromises = Array.from(dirtyGroups).map(gid => {
        const p = payments.find(x => x.id === gid);
        if (!p) return Promise.resolve();
        return axios.post(`${API_URL}/fy-details/save-group`, p);
      });

      await Promise.all([...rowPromises, ...payPromises]);
      setSnack({ severity: 'success', msg: 'All changes saved successfully!' });
      setDirtyRows(new Set());
      setDirtyGroups(new Set());
    } catch (e) {
      setSnack({ severity: 'error', msg: 'Failed to save some changes.' });
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    // Basic CSV export
    let csvData = computedRows.map(r => {
      const g = r.groupData || {};
      const difference = g.id ? (
        computedRows.filter(cr => cr.groupId === g.id).reduce((s, x) => s + x.receivable, 0) - num(g.paymentAmount)
      ) : 0;

      return {
        'Invoice Date': r.invoiceDate,
        'Invoice Number': r.invoiceNumber,
        'Month': r.month,
        'SITE': r.site,
        'BILL': r.billType,
        'Amount': r.amount,
        'CGST': r.cgst,
        'SGST': r.sgst,
        'Total Amount': r.totalAmount,
        'Tds @2%': r.tds,
        'Receivable': r.receivable,
        'Payment Amount': g.paymentAmount || 0,
        'Difference': difference,
        'Payment Date': g.paymentDate || '',
        'Reference No': g.referenceNo || '',
        'Debit Amount': g.debitAmount || 0,
        'Remarks': g.remarks || ''
      };
    });
    exportToCsv('FinancialYearDetails.xls', csvData);
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#f4f7f9', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <Box sx={{ p: 2, bgcolor: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 2, alignItems: 'center' }}>
        <IconButton onClick={onBack} size="small" sx={{ bgcolor: '#ede9fe' }}>
          <ArrowBackIcon fontSize="small" sx={{ color: '#6d28d9' }} />
        </IconButton>
        <Typography variant="h6" fontWeight={900} sx={{ color: '#0f172a' }}>
          FY 25-26 Financial Year Details
        </Typography>
        <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
          <Button
            variant="contained"
            color="success"
            startIcon={<SaveIcon />}
            onClick={saveAllChanges}
            disabled={dirtyRows.size === 0 && dirtyGroups.size === 0}
            sx={{ fontWeight: 'bold' }}
          >
            Save Details
          </Button>
          <IconButton onClick={fetchData}><RefreshIcon /></IconButton>
          <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleExport}>XLS</Button>
          <Button
            variant="contained"
            startIcon={<EditIcon />}
            disabled={selectedIds.length === 0}
            onClick={openPaymentModal}
            sx={{ bgcolor: '#4f46e5', '&:hover': { bgcolor: '#4338ca' } }}
          >
            Group Payment ({selectedIds.length})
          </Button>
        </Box>
      </Box>

      {/* ── Table ── */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {loading ? <Box p={4} display="flex" justifyContent="center"><CircularProgress /></Box> : (
          <table style={{ borderCollapse: 'collapse', whiteSpace: 'nowrap', fontFamily: 'Inter, sans-serif', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', top: 0, zIndex: 10, background: '#1e293b', color: '#fff', padding: '8px' }}>Sl No</th>
                {COLUMNS.map(c => (
                  <th key={c.key} style={{ position: 'sticky', top: 0, zIndex: c.sticky ? 11 : 10, left: c.sticky ? 0 : undefined, background: '#1e293b', color: '#fff', padding: '8px', whiteSpace: 'pre-line', minWidth: c.width }}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {computedRows.map((r, ri) => {
                const isGroupStart = r.groupId && groupSpanMap[r.groupId]?.startIdx === ri;
                const isGrouped = !!r.groupId;
                const rowSpan = isGroupStart ? groupSpanMap[r.groupId].count : 1;

                // Difference Calculation for the group
                let groupDifference = 0;
                if (isGroupStart) {
                  const groupTotalRecv = computedRows.filter(cr => cr.groupId === r.groupId).reduce((s, x) => s + x.receivable, 0);
                  groupDifference = groupTotalRecv - num(r.groupData.paymentAmount);
                }

                return (
                  <tr key={ri} style={{ borderBottom: '1px solid #e2e8f0', background: ri % 2 ? '#f8fafc' : '#fff' }}>
                    <td style={{ padding: '6px', textAlign: 'center' }}>{ri + 1}</td>

                    {COLUMNS.map(c => {
                      if (c.isGrouped && isGrouped && !isGroupStart) return null; // Skip rendering cells that are spanned over

                      const cellStyle = {
                        padding: '6px', textAlign: c.align,
                        background: c.bg || (c.highlight) || (isGrouped && c.isGrouped ? '#fdf2f8' : 'inherit'),
                        borderRight: '1px solid #e2e8f0',
                        position: c.sticky ? 'sticky' : undefined,
                        left: c.sticky ? 0 : undefined,
                        zIndex: c.sticky ? 5 : undefined,
                        fontWeight: c.highlight || c.isGrouped ? 600 : 400
                      };

                      if (c.key === 'select') {
                        return <td key={c.key} style={cellStyle}>
                          <Checkbox size="small" checked={selectedIds.includes(r.invoiceNumber)} onChange={() => toggleSelect(r.invoiceNumber)} />
                        </td>
                      }

                      if (c.key === 'billType') {
                        return <td key={c.key} style={cellStyle}>
                          <Select
                            variant="standard" size="small" value={r.billType}
                            onChange={e => handleBillTypeChange(r.invoiceNumber, e.target.value)}
                            disableUnderline sx={{ fontSize: 11, fontWeight: 700 }}
                          >
                            {c.options.map(o => <MenuItem key={o} value={o} sx={{ fontSize: 11 }}>{o}</MenuItem>)}
                          </Select>
                        </td>
                      }

                      if (c.key === 'paymentAmount') {
                        return <td key={c.key} style={cellStyle} rowSpan={c.isGrouped && isGroupStart ? rowSpan : 1}>
                          <Box display="flex" flexDirection="column" gap={0.5} width="100%">
                            <TextField
                              variant="standard" type="number"
                              value={r.groupData.paymentAmount !== 0 ? r.groupData.paymentAmount : ''}
                              onChange={e => handleInlineEdit(r.groupId, 'paymentAmount', e.target.value, r.groupData)}
                              InputProps={{ disableUnderline: true }}
                              sx={{ '.MuiInputBase-input': { fontSize: 12, fontWeight: 700, p: '4px', textAlign: 'right' } }}
                            />
                            <Button
                              component="label" size="small" variant="outlined"
                              disabled={uploadingGroup === r.groupId}
                              sx={{ fontSize: 9, py: 0, px: 0.5, borderColor: '#d1d5db', color: '#6b7280', '&:hover': { bgcolor: '#f3f4f6' } }}
                            >
                              {uploadingGroup === r.groupId ? 'Uploading...' : r.groupData.paymentProofUrl ? 'Change Proof' : 'Upload Proof'}
                              <input type="file" hidden accept=".pdf,image/*" onChange={(e) => {
                                if (e.target.files[0]) handleFileUpload(r.groupId, e.target.files[0], r.groupData);
                              }} />
                            </Button>
                            {r.groupData.paymentProofUrl && (
                              <a href={r.groupData.paymentProofUrl} target="_blank" rel="noreferrer" style={{ fontSize: 9, color: '#3b82f6', textDecoration: 'none' }}>View Proof</a>
                            )}
                          </Box>
                        </td>
                      }

                      if (c.key === 'paymentDate') {
                        return <td key={c.key} style={cellStyle} rowSpan={c.isGrouped && isGroupStart ? rowSpan : 1}>
                          <TextField
                            variant="standard" type="date"
                            value={r.groupData.paymentDate || ''}
                            onChange={e => handleInlineEdit(r.groupId, 'paymentDate', e.target.value, r.groupData)}
                            InputProps={{ disableUnderline: true }}
                            sx={{
                              '.MuiInputBase-input': {
                                fontSize: 12, p: '4px', textAlign: 'center',
                                '&::-webkit-calendar-picker-indicator': { cursor: 'pointer' }
                              }
                            }}
                          />
                        </td>
                      }

                      if (c.key === 'referenceNo' || c.key === 'remarks') {
                        return <td key={c.key} style={cellStyle} rowSpan={c.isGrouped && isGroupStart ? rowSpan : 1}>
                          <TextField
                            variant="standard"
                            value={r.groupData[c.key] || ''}
                            onChange={e => handleInlineEdit(r.groupId, c.key, e.target.value, r.groupData)}
                            InputProps={{ disableUnderline: true }}
                            sx={{ '.MuiInputBase-input': { fontSize: 12, p: '4px' } }}
                          />
                        </td>
                      }

                      if (c.key === 'debitAmount') {
                        return <td key={c.key} style={cellStyle} rowSpan={c.isGrouped && isGroupStart ? rowSpan : 1}>
                          <TextField
                            variant="standard" type="number"
                            value={r.groupData.debitAmount !== 0 ? r.groupData.debitAmount : ''}
                            onChange={e => handleInlineEdit(r.groupId, 'debitAmount', e.target.value, r.groupData)}
                            InputProps={{ disableUnderline: true }}
                            sx={{ '.MuiInputBase-input': { fontSize: 12, p: '4px', textAlign: 'right' } }}
                          />
                        </td>
                      }

                      if (c.userEdit) {
                        if (c.type === 'monthYear') {
                          const val = String(r[c.key] || '').toUpperCase();
                          let curM = '', curY = '';
                          if (val.includes('-')) {
                            [curM, curY] = val.split('-');
                          } else if (val.includes(' ')) {
                            [curM, curY] = val.split(' ');
                            if (curY.startsWith("'")) curY = '20' + curY.substring(1);
                          } else {
                            curM = val;
                          }
                          // Provide defaults if mapping misses
                          if (!['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'].includes(curM)) curM = '';
                          if (!['2024', '2025', '2026', '2027', '2028'].includes(curY)) curY = '';

                          return <td key={c.key} style={cellStyle}>
                            <Box display="flex" gap={0.5} justifyContent="center">
                              <Select
                                variant="standard" size="small" value={curM} displayEmpty
                                onChange={e => handleRowEdit(r.invoiceNumber, c.key, `${e.target.value}-${curY || '2025'}`)}
                                disableUnderline sx={{ fontSize: 11, fontWeight: 700 }}
                              >
                                <MenuItem value="" disabled sx={{ display: 'none' }}>Month</MenuItem>
                                {['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'].map(m => <MenuItem key={m} value={m} sx={{ fontSize: 11 }}>{m}</MenuItem>)}
                              </Select>
                              <Select
                                variant="standard" size="small" value={curY} displayEmpty
                                onChange={e => handleRowEdit(r.invoiceNumber, c.key, `${curM || 'JANUARY'}-${e.target.value}`)}
                                disableUnderline sx={{ fontSize: 11, fontWeight: 700 }}
                              >
                                <MenuItem value="" disabled sx={{ display: 'none' }}>Year</MenuItem>
                                {['2024', '2025', '2026', '2027', '2028'].map(y => <MenuItem key={y} value={y} sx={{ fontSize: 11 }}>{y}</MenuItem>)}
                              </Select>
                            </Box>
                          </td>
                        }

                        return <td key={c.key} style={cellStyle}>
                          {c.type === 'select' ? (
                            <Select
                              variant="standard" size="small" value={r[c.key] || ''}
                              onChange={e => handleRowEdit(r.invoiceNumber, c.key, e.target.value)}
                              disableUnderline sx={{ fontSize: 11, fontWeight: 700 }}
                            >
                              {c.options.map(o => <MenuItem key={o} value={o} sx={{ fontSize: 11 }}>{o}</MenuItem>)}
                            </Select>
                          ) : (
                            <TextField
                              variant="standard"
                              type={c.type || 'text'}
                              value={r[c.key] || ''}
                              onChange={e => handleRowEdit(r.invoiceNumber, c.key, e.target.value)}
                              InputProps={{ disableUnderline: true }}
                              sx={{ '.MuiInputBase-input': { fontSize: 12, p: '4px', textAlign: c.align, fontWeight: 600, color: '#334155' } }}
                            />
                          )}
                        </td>
                      }

                      let displayVal = r[c.key];
                      if (c.isGrouped && isGroupStart) {
                        displayVal = c.key === 'difference' ? groupDifference : r.groupData[c.key];
                      }

                      const isNum = typeof displayVal === 'number';
                      const formatted = isNum && displayVal !== 0 ? displayVal.toLocaleString('en-IN') : displayVal;

                      return (
                        <td key={c.key} style={cellStyle} rowSpan={c.isGrouped && isGroupStart ? rowSpan : 1}>
                          {isNum && formatted !== '0' ? `₹${formatted}` : formatted}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Box>

      {/* Payment Modal */}
      <Dialog open={paymentModalOpen} onClose={() => setPaymentModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Group Payment Details</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Applying to {selectedIds.length} invoices.
          </Typography>
          <TextField label="Payment Amount" fullWidth value={paymentForm.paymentAmount} onChange={e => setPaymentForm({ ...paymentForm, paymentAmount: e.target.value })} type="number" />
          <TextField label="Payment Date" fullWidth value={paymentForm.paymentDate} onChange={e => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })} type="date" InputLabelProps={{ shrink: true }} />
          <TextField label="Reference No" fullWidth value={paymentForm.referenceNo} onChange={e => setPaymentForm({ ...paymentForm, referenceNo: e.target.value })} />
          <TextField label="Debit Amount" fullWidth value={paymentForm.debitAmount} onChange={e => setPaymentForm({ ...paymentForm, debitAmount: e.target.value })} type="number" />
          <TextField label="Remarks" fullWidth value={paymentForm.remarks} onChange={e => setPaymentForm({ ...paymentForm, remarks: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={clearSelectionFromGroup} color="error" sx={{ mr: 'auto' }}>Clear Grouping</Button>
          <Button onClick={() => setPaymentModalOpen(false)}>Cancel</Button>
          <Button onClick={saveGroup} variant="contained">Save Linked Payment</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack(null)}>
        {snack && <Alert severity={snack.severity}>{snack.msg}</Alert>}
      </Snackbar>
    </Box>
  )
}
