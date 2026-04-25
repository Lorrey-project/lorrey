import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box, Typography, Button, IconButton, CircularProgress,
  Snackbar, Alert, Dialog, DialogTitle, DialogContent, DialogActions, TextField
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';

import axios from 'axios';
import { exportToCsv } from '../utils/exportCsv';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const PAGE_SIZE = 100;

const num = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};
const round2 = (n) => Math.round(n);

const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth();
const startFyYear = currentMonth >= 3 ? currentYear : currentYear - 1;
const endFyYear = startFyYear + 1;
const FY_LABEL = `FY ${String(startFyYear).slice(-2)}-${String(endFyYear).slice(-2)}`;

const YEARS = [
  String(startFyYear - 2),
  String(startFyYear - 1),
  String(startFyYear),
  String(endFyYear)
];
const BILL_TYPES = ['FREIGHT', 'EXTRA FREIGHT', 'TOLL', 'UNLOADING', 'CREDIT NOTE'];
const SITES = ['NVL', 'NVCL'];

// Shared native input styles — tiny, borderless, matches table feel
const iStyle = {
  fontSize: 11, border: 'none', outline: 'none',
  background: 'transparent', width: '100%', padding: '2px 3px',
  fontFamily: 'Inter, sans-serif', color: '#0f172a',
};
const selStyle = { ...iStyle, cursor: 'pointer' };

export default function FinancialYearDetails({ onBack }) {
  const [rows, setRows] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [snack, setSnack] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ id: '', paymentAmount: '', paymentDate: '', referenceNo: '', debitAmount: '', remarks: '' });
  const [uploadingGroup, setUploadingGroup] = useState(null);
  const [dirtyRows, setDirtyRows] = useState(new Set());
  const [dirtyGroups, setDirtyGroups] = useState(new Set());
  const [page, setPage] = useState(0);
  const [siteFilter, setSiteFilter] = useState('All'); // 'All' | 'NVCL' | 'NVL'

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_URL}/fy-details/data`);
      setRows(data.rows || []);
      setPayments(data.payments || []);
      setSelectedIds([]);
      setDirtyRows(new Set());
      setDirtyGroups(new Set());
      setPage(0);
    } catch {
      setSnack({ severity: 'error', msg: 'Failed to load details' });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Compute calculated fields
  const computedRows = useMemo(() => {
    return rows.filter(r => {
      const s = (r.site || '').trim().toUpperCase();
      return s === 'NVCL' || s === 'NVL';
    }).map(r => {
      const siteUpper = (r.site || '').trim().toUpperCase();
      const billUpper = (r.billType || '').trim().toUpperCase();

      const amt = num(r.amount);
      const cgst = round2(amt * 0.09);
      const sgst = round2(amt * 0.09);
      const totalAmount = amt + cgst + sgst;
      
      const tdsRate = (siteUpper === 'NVL' && billUpper === 'TOLL') ? 0 : 0.02;
      const tds = round2(amt * tdsRate);
      
      const receivable = totalAmount - tds;
      let autoInv = r.displayInvoiceNumber || r.invoiceNumber || '';
      
      // Auto-correct existing invoice prefix based on loaded site
      if (siteUpper === 'NVCL' && autoInv.match(/^DAC\//i)) {
        autoInv = autoInv.replace(/^DAC\//i, 'NVCL/');
      } else if (siteUpper === 'NVL' && autoInv.match(/^NVCL\//i)) {
        autoInv = autoInv.replace(/^NVCL\//i, 'DAC/');
      }

      const paymentObj = payments.find(p => p.billNos?.includes(r.invoiceNumber));
      return {
        ...r, amount: amt, cgst, sgst, totalAmount, tds, receivable,
        displayInvoiceNumber: autoInv,
        groupId: paymentObj?.id || `AUTO-${r.invoiceNumber}`,
        groupData: paymentObj || { id: `AUTO-${r.invoiceNumber}`, billNos: [r.invoiceNumber], paymentAmount: '', paymentDate: '', referenceNo: '', debitAmount: '', remarks: '', paymentProofUrl: '' }
      };
    }).sort((a, b) => (a.invoiceDate || '').localeCompare(b.invoiceDate || '') || (a.invoiceNumber || '').localeCompare(b.invoiceNumber || ''));
  }, [rows, payments]);

  // Site filter helpers
  const isNVL  = useCallback((site) => /^NVL$/i.test((site || '').trim()), []);
  const isNVCL = useCallback((site) => /^NVCL$/i.test((site || '').trim()), []);
  const filteredRows = useMemo(() => {
    if (siteFilter === 'All') return computedRows;
    if (siteFilter === 'NVL') return computedRows.filter(r => isNVL(r.site));
    if (siteFilter === 'NVCL') return computedRows.filter(r => isNVCL(r.site));
    return computedRows;
  }, [computedRows, siteFilter, isNVL, isNVCL]);

  const groupSpanMap = useMemo(() => {
    const map = {};
    for (let i = 0; i < filteredRows.length; i++) {
      const gid = filteredRows[i].groupId;
      if (gid) {
        if (map[gid]) map[gid].count++;
        else map[gid] = { startIdx: i, count: 1 };
      }
    }
    return map;
  }, [filteredRows]);

  // Pagination
  const totalPages = Math.ceil(filteredRows.length / PAGE_SIZE);
  const visibleRows = useMemo(() => filteredRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filteredRows, page]);

  // Reset page when filter changes
  const handleSiteFilter = useCallback((f) => { setSiteFilter(f); setPage(0); }, []);

  const handleRowEdit = useCallback((invoiceNumber, field, value) => {
    setRows(prev => prev.map(r => {
      if (r.invoiceNumber !== invoiceNumber) return r;
      const updated = { ...r, [field]: value };
      
      // Auto-update Invoice Number prefix based on Site selection
      if (field === 'site') {
        let inv = updated.displayInvoiceNumber || updated.invoiceNumber || '';
        if (value === 'NVCL') {
          updated.displayInvoiceNumber = inv.replace(/^DAC\//i, 'NVCL/');
        } else if (value === 'NVL') {
          updated.displayInvoiceNumber = inv.replace(/^NVCL\//i, 'DAC/');
        }
      }
      return updated;
    }));
    setDirtyRows(prev => new Set(prev).add(invoiceNumber));
  }, []);

  const handleInlineEdit = useCallback((groupId, field, value, cellGroupData) => {
    const payload = {
      id: groupId, billNos: cellGroupData.billNos,
      paymentAmount: num(cellGroupData.paymentAmount), paymentDate: cellGroupData.paymentDate || '',
      referenceNo: cellGroupData.referenceNo || '', debitAmount: num(cellGroupData.debitAmount),
      remarks: cellGroupData.remarks || '', tdsProvision: num(cellGroupData.tdsProvision), [field]: (field === 'paymentAmount' || field === 'debitAmount' || field === 'tdsProvision') ? num(value) : value
    };
    setPayments(prev => {
      const idx = prev.findIndex(p => p.id === groupId);
      if (idx !== -1) { const np = [...prev]; np[idx] = { ...np[idx], [field]: payload[field] }; return np; }
      return [...prev, payload];
    });
    setDirtyGroups(prev => new Set(prev).add(groupId));
  }, []);

  const toggleSelect = useCallback((id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }, []);

  const openPaymentModal = () => {
    if (!selectedIds.length) return setSnack({ severity: 'warning', msg: 'Select invoices first' });
    let existing = null;
    for (const p of payments) { if (p.billNos?.some(bn => selectedIds.includes(bn))) { existing = p; break; } }
    
    const allIdsToGroup = Array.from(new Set([...selectedIds, ...(existing?.billNos || [])]));
    const totalReceivable = computedRows.filter(r => allIdsToGroup.includes(r.invoiceNumber)).reduce((sum, r) => sum + (r.receivable || 0), 0);
    const roundedReceivable = Math.round(totalReceivable * 100) / 100;

    if (existing) {
      setPaymentForm({ id: existing.id, receivableAmount: roundedReceivable, paymentAmount: existing.paymentAmount || '', paymentDate: existing.paymentDate || '', referenceNo: existing.referenceNo || '', debitAmount: existing.debitAmount || '', remarks: existing.remarks || '', tdsProvision: existing.tdsProvision || '' });
      setSelectedIds(allIdsToGroup);
    } else {
      setPaymentForm({ id: `G-${Date.now()}`, receivableAmount: roundedReceivable, paymentAmount: '', paymentDate: '', referenceNo: '', debitAmount: '', remarks: '', tdsProvision: '' });
    }
    setPaymentModalOpen(true);
  };

  const saveGroup = async () => {
    try {
      await axios.post(`${API_URL}/fy-details/save-group`, { id: paymentForm.id, billNos: selectedIds, paymentAmount: num(paymentForm.paymentAmount), paymentDate: paymentForm.paymentDate, referenceNo: paymentForm.referenceNo, debitAmount: num(paymentForm.debitAmount), remarks: paymentForm.remarks, tdsProvision: num(paymentForm.tdsProvision) });
      setSnack({ severity: 'success', msg: 'Payment Group Saved!' });
      setPaymentModalOpen(false);
      fetchData();
    } catch { setSnack({ severity: 'error', msg: 'Failed to save group' }); }
  };

  const clearSelectionFromGroup = async () => {
    try {
      await Promise.all(payments.map(p => {
        if (p.billNos?.some(bn => selectedIds.includes(bn))) {
          return axios.post(`${API_URL}/fy-details/save-group`, { ...p, billNos: p.billNos.filter(bn => !selectedIds.includes(bn)) });
        }
      }));
      setSnack({ severity: 'success', msg: 'Cleared from group' });
      setPaymentModalOpen(false);
      fetchData();
    } catch { setSnack({ severity: 'error', msg: 'Failed to clear' }); }
  };

  const handleFileUpload = async (groupId, file, cellGroupData) => {
    setUploadingGroup(groupId);
    if (!payments.some(p => p.id === groupId)) {
      await axios.post(`${API_URL}/fy-details/save-group`, { id: groupId, billNos: cellGroupData.billNos, paymentAmount: num(cellGroupData.paymentAmount), paymentDate: cellGroupData.paymentDate || '', referenceNo: cellGroupData.referenceNo || '', debitAmount: num(cellGroupData.debitAmount), remarks: cellGroupData.remarks || '', tdsProvision: num(cellGroupData.tdsProvision) });
    }
    const fd = new FormData(); fd.append('proof', file); fd.append('id', groupId);
    try {
      const { data } = await axios.post(`${API_URL}/fy-details/upload-proof`, fd);
      setPayments(prev => { const np = [...prev]; const idx = np.findIndex(p => p.id === groupId); if (idx !== -1) np[idx].paymentProofUrl = data.url; else np.push({ id: groupId, paymentProofUrl: data.url, billNos: cellGroupData.billNos }); return np; });
      setSnack({ severity: 'success', msg: 'Proof uploaded' });
    } catch { setSnack({ severity: 'error', msg: 'Upload failed' }); }
    finally { setUploadingGroup(null); }
  };

  const saveAllChanges = async () => {
    setLoading(true);
    try {
      const rowP = Array.from(dirtyRows).map(inv => {
        const r = rows.find(x => x.invoiceNumber === inv); if (!r) return Promise.resolve();
        return axios.post(`${API_URL}/fy-details/save-row`, { billNo: inv, editedInvoiceDate: r.invoiceDate, editedInvoiceNumber: r.displayInvoiceNumber, editedMonth: r.month, editedSite: r.site, editedAmount: r.amount, billType: r.billType });
      });
      const payP = Array.from(dirtyGroups).map(gid => {
        const p = payments.find(x => x.id === gid); if (!p) return Promise.resolve();
        return axios.post(`${API_URL}/fy-details/save-group`, p);
      });
      await Promise.all([...rowP, ...payP]);
      setSnack({ severity: 'success', msg: 'All changes saved!' });
      setDirtyRows(new Set()); setDirtyGroups(new Set());
    } catch { setSnack({ severity: 'error', msg: 'Failed to save some changes.' }); }
    finally { setLoading(false); }
  };

  const handleDeleteRows = async () => {
    if (!selectedIds.length) return;
    const confirmed = window.confirm(
      `Delete ${selectedIds.length} selected bill(s) from the register?\nThis can be undone only from the database.`
    );
    if (!confirmed) return;
    setLoading(true);
    try {
      await axios.post(`${API_URL}/fy-details/delete-rows`, { billNos: selectedIds });
      setSnack({ severity: 'success', msg: `${selectedIds.length} bill(s) deleted successfully` });
      setSelectedIds([]);
      fetchData();
    } catch {
      setSnack({ severity: 'error', msg: 'Delete failed' });
    } finally { setLoading(false); }
  };

  const handleExport = () => {
    exportToCsv('FinancialYearDetails.xls', computedRows.map(r => {
      const g = r.groupData || {};
      const diff = g.id ? computedRows.filter(cr => cr.groupId === g.id).reduce((s, x) => s + x.receivable, 0) - num(g.paymentAmount) : 0;
      const groupTotalRecv = g.id ? computedRows.filter(cr => cr.groupId === g.id).reduce((s, x) => s + x.receivable, 0) : 0;
      const calcDebit = g.id ? num(g.paymentAmount) - groupTotalRecv : 0;
      return { 'Invoice Date': r.invoiceDate, 'Invoice Number': r.invoiceNumber, 'Month': r.month, 'SITE': r.site, 'BILL': r.billType, 'Amount': r.amount, 'CGST': r.cgst, 'SGST': r.sgst, 'Total Amount': r.totalAmount, 'Tds @2%': r.tds, 'Receivable': r.receivable, 'Payment Amount': g.paymentAmount || 0, 'TDS Provision': g.tdsProvision || 0, 'Difference': diff, 'Payment Date': g.paymentDate || '', 'Reference No': g.referenceNo || '', 'Debit Amount': calcDebit, 'Remarks': g.remarks || '' };
    }));
  };

  // ── Render a single row (native HTML only — no MUI inside cells) ──
  const renderRow = (r, ri) => {
    const gid = r.groupId;
    const isGroupStart = gid && groupSpanMap[gid]?.startIdx === (page * PAGE_SIZE + ri);
    const rowSpan = isGroupStart ? groupSpanMap[gid].count : 1;
    const gd = r.groupData || {};
    
    const groupTotalRecv = isGroupStart
      ? computedRows.filter(cr => cr.groupId === gid).reduce((s, x) => s + x.receivable, 0)
      : 0;
      
    const groupDiff = isGroupStart ? groupTotalRecv - num(gd.paymentAmount) : 0;
    const calcDebit = isGroupStart ? num(gd.paymentAmount) - groupTotalRecv : 0;

    const bg = ri % 2 ? '#f8fafc' : '#fff';
    const td = (extra = {}) => ({ padding: '5px 6px', borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0', fontSize: 12, verticalAlign: 'middle', background: bg, ...extra });

    // Parse month/year for the monthYear column
    const rawMonth = String(r.month || '').toUpperCase();
    let curM = '', curY = '';
    if (rawMonth.includes('-')) { [curM, curY] = rawMonth.split('-'); }
    else if (rawMonth.includes(' ')) {
      [curM, curY] = rawMonth.split(' ');
      if (curY?.startsWith("'")) curY = '20' + curY.substring(1);
    } else { curM = rawMonth; }
    if (!MONTHS.includes(curM)) curM = '';
    if (!YEARS.includes(curY)) curY = '';

    const handleMonthYearChange = (type, val) => {
      let newM = type === 'M' ? val : (curM || 'JANUARY');
      let newY = type === 'Y' ? val : (curY || String(new Date().getFullYear()));
      
      const mIndex = MONTHS.indexOf(newM);
      const now = new Date();
      const curMonthIndex = now.getMonth(); // 0-11
      const curYear = now.getFullYear();
      
      if (parseInt(newY) > curYear) {
         newY = String(curYear);
      }
      if (parseInt(newY) === curYear && mIndex > curMonthIndex) {
         newY = String(curYear - 1);
      }
      
      handleRowEdit(r.invoiceNumber, 'month', `${newM}-${newY}`);
    };

    return (
      <tr key={ri}>
        {/* Sl No */}
        <td style={td({ textAlign: 'center', color: '#64748b', fontWeight: 600 })}>{page * PAGE_SIZE + ri + 1}</td>

        {/* Select */}
        <td style={td({ textAlign: 'center' })}>
          <input type="checkbox" checked={selectedIds.includes(r.invoiceNumber)} onChange={() => toggleSelect(r.invoiceNumber)} style={{ cursor: 'pointer', width: 14, height: 14 }} />
        </td>

        {/* Invoice Date */}
        <td style={td({ textAlign: 'center', fontWeight: 600, color: '#1e293b' })}>
          {r.invoiceDate || ''}
        </td>

        {/* Invoice Number */}
        <td style={td({ textAlign: 'left', position: 'sticky', left: 0, background: bg, zIndex: 4 })}>
          <input value={r.displayInvoiceNumber || ''} onChange={e => handleRowEdit(r.invoiceNumber, 'displayInvoiceNumber', e.target.value)} style={{ ...iStyle, fontWeight: 700 }} />
        </td>

        {/* Month */}
        <td style={td({ textAlign: 'center' })}>
          <div style={{ display: 'flex', gap: 2 }}>
            <select value={curM} onChange={e => handleMonthYearChange('M', e.target.value)} style={selStyle}>
              <option value="">Month</option>
              {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select value={curY} onChange={e => handleMonthYearChange('Y', e.target.value)} style={selStyle}>
              <option value="">Year</option>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </td>

        {/* Site */}
        <td style={td({ textAlign: 'center', fontWeight: 600, color: '#334155' })}>
          {r.site || ''}
        </td>

        {/* Bill Type */}
        <td style={td()}>
          <select value={r.billType || 'FREIGHT'} onChange={e => handleRowEdit(r.invoiceNumber, 'billType', e.target.value)} style={selStyle}>
            {BILL_TYPES.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </td>

        {/* Amount */}
        <td style={td({ textAlign: 'right', fontWeight: 600, color: '#334155' })}>
          {r.amount || 0}
        </td>

        {/* CGST */}
        <td style={td({ textAlign: 'right', background: '#fef9e7' })}>₹{r.cgst?.toLocaleString('en-IN')}</td>
        {/* SGST */}
        <td style={td({ textAlign: 'right', background: '#fef9e7' })}>₹{r.sgst?.toLocaleString('en-IN')}</td>
        {/* Total Amount */}
        <td style={td({ textAlign: 'right', background: '#eef2ff', fontWeight: 700 })}>₹{r.totalAmount?.toLocaleString('en-IN')}</td>
        {/* TDS */}
        <td style={td({ textAlign: 'right', background: '#ecfeff', fontWeight: 600 })}>₹{r.tds?.toLocaleString('en-IN')}</td>
        {/* Receivable */}
        <td style={td({ textAlign: 'right', background: '#f0fdf4', fontWeight: 700 })}>₹{r.receivable?.toLocaleString('en-IN')}</td>

        {/* Payment Amount — grouped cell */}
        {(!gid || isGroupStart) && (
          <td style={td({ background: '#fdf2f8' })} rowSpan={rowSpan}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ textAlign: 'right', fontWeight: 700, color: '#1e293b', fontSize: '12px' }}>
                {gd.paymentAmount || 0}
              </div>
              <label style={{ cursor: 'pointer' }}>
                <span style={{ fontSize: 9, color: '#6b7280', border: '1px solid #d1d5db', borderRadius: 3, padding: '1px 4px' }}>
                  {uploadingGroup === gid ? 'Uploading…' : gd.paymentProofUrl ? 'Change Proof' : 'Upload Proof'}
                </span>
                <input type="file" hidden accept=".pdf,image/*" onChange={e => { if (e.target.files[0]) handleFileUpload(gid, e.target.files[0], gd); }} />
              </label>
              {gd.paymentProofUrl && <a href={gd.paymentProofUrl} target="_blank" rel="noreferrer" style={{ fontSize: 9, color: '#3b82f6' }}>View Proof</a>}
            </div>
          </td>
        )}

        {/* TDS Provision */}
        {(!gid || isGroupStart) && (
          <td style={td({ background: '#fdf2f8' })} rowSpan={rowSpan}>
            <input type="number" value={gd.tdsProvision || ''} onChange={e => handleInlineEdit(gid, 'tdsProvision', e.target.value, gd)} style={{ ...iStyle, textAlign: 'right', fontWeight: 700, color: '#0f172a' }} placeholder="0" />
          </td>
        )}

        {/* Difference */}
        {(!gid || isGroupStart) && (
          <td style={td({ textAlign: 'right', background: '#fdf2f8', fontWeight: 700, color: groupDiff < 0 ? '#dc2626' : '#166534' })} rowSpan={rowSpan}>
            {isGroupStart ? `₹${groupDiff.toLocaleString('en-IN')}` : ''}
          </td>
        )}

        {/* Payment Date */}
        {(!gid || isGroupStart) && (
          <td style={td({ textAlign: 'center', background: '#fdf2f8', fontWeight: 600, color: '#334155' })} rowSpan={rowSpan}>
            {gd.paymentDate ? (() => {
              const p = gd.paymentDate.split('-');
              return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : gd.paymentDate;
            })() : ''}
          </td>
        )}

        {/* Reference No */}
        {(!gid || isGroupStart) && (
          <td style={td({ background: '#fdf2f8', fontWeight: 600, color: '#334155' })} rowSpan={rowSpan}>
            {gd.referenceNo || ''}
          </td>
        )}

        {/* Debit Amount */}
        {(!gid || isGroupStart) && (
          <td style={td({ textAlign: 'right', background: '#fdf2f8', fontWeight: 700, color: calcDebit > 0 ? '#166534' : (calcDebit < 0 ? '#dc2626' : 'inherit') })} rowSpan={rowSpan}>
            {isGroupStart ? (calcDebit === 0 ? '0' : `₹${calcDebit.toLocaleString('en-IN')}`) : ''}
          </td>
        )}

        {/* Remarks */}
        {(!gid || isGroupStart) && (
          <td style={td({ background: '#fdf2f8' })} rowSpan={rowSpan}>
            <input value={gd.remarks || ''} onChange={e => handleInlineEdit(gid, 'remarks', e.target.value, gd)} style={iStyle} />
          </td>
        )}
      </tr>
    );
  };

  const thStyle = (extra = {}) => ({
    position: 'sticky', top: 0, zIndex: 10,
    background: '#1e293b', color: '#fff',
    padding: '8px 6px', whiteSpace: 'pre-line',
    fontSize: 11, fontWeight: 700, textAlign: 'center',
    borderRight: '1px solid #334155',
    ...extra
  });

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#f4f7f9', overflow: 'hidden' }}>

      {/* Header */}
      <Box sx={{ p: 2, bgcolor: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <IconButton onClick={onBack} size="small" sx={{ bgcolor: '#ede9fe' }}>
          <ArrowBackIcon fontSize="small" sx={{ color: '#6d28d9' }} />
        </IconButton>
        <Box>
          <Typography variant="h6" fontWeight={900} sx={{ color: '#0f172a', lineHeight: 1.2 }}>
            Bill Register
          </Typography>
          <Typography variant="caption" sx={{ color: '#64748b' }}>{FY_LABEL}</Typography>
        </Box>

        {/* ── Site Filter Tabs ── */}
        <Box sx={{ display: 'flex', gap: 0.5, bgcolor: '#f1f5f9', borderRadius: '10px', p: '3px' }}>
          {['All', 'NVCL', 'NVL'].map(tab => (
            <button key={tab} onClick={() => handleSiteFilter(tab)} style={{
              border: 'none', cursor: 'pointer', borderRadius: '8px', padding: '4px 14px',
              fontWeight: 700, fontSize: 13, fontFamily: 'Inter,sans-serif',
              background: siteFilter === tab ? '#4f46e5' : 'transparent',
              color: siteFilter === tab ? '#fff' : '#64748b',
              transition: 'all 0.15s'
            }}>
              {tab}
              <span style={{ marginLeft: 5, fontSize: 10, opacity: 0.75 }}>
                ({tab === 'All' ? computedRows.length
                  : tab === 'NVL' ? computedRows.filter(r => isNVL(r.site)).length
                  : computedRows.filter(r => isNVCL(r.site)).length})
              </span>
            </button>
          ))}
        </Box>

        <Box sx={{ ml: 'auto', display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <Typography variant="caption" color="text.secondary">{filteredRows.length} records</Typography>
          <Button variant="contained" color="success" startIcon={<SaveIcon />} onClick={saveAllChanges}
            disabled={dirtyRows.size === 0 && dirtyGroups.size === 0} sx={{ fontWeight: 'bold' }}>
            Save Details
          </Button>
          <IconButton onClick={fetchData}><RefreshIcon /></IconButton>
          <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleExport}>XLS</Button>
          <Button variant="contained" startIcon={<EditIcon />} disabled={!selectedIds.length} onClick={openPaymentModal}
            sx={{ bgcolor: '#4f46e5', '&:hover': { bgcolor: '#4338ca' } }}>
            Group Payment ({selectedIds.length})
          </Button>
          <Button variant="contained" color="error" startIcon={<DeleteIcon />}
            disabled={!selectedIds.length} onClick={handleDeleteRows}
            sx={{ fontWeight: 700 }}>
            Delete ({selectedIds.length})
          </Button>
        </Box>
      </Box>

      {/* Table */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {loading
          ? <Box p={4} display="flex" justifyContent="center"><CircularProgress /></Box>
          : (
            <table style={{ borderCollapse: 'collapse', whiteSpace: 'nowrap', fontFamily: 'Inter,sans-serif', fontSize: 12, width: 'max-content' }}>
              <thead>
                <tr>
                  <th style={thStyle({ minWidth: 40 })}>Sl No</th>
                  <th style={thStyle({ minWidth: 50 })}>Select</th>
                  <th style={thStyle({ minWidth: 120 })}>Invoice Date</th>
                  <th style={thStyle({ minWidth: 170, position: 'sticky', left: 0, zIndex: 12 })}>Invoice Number</th>
                  <th style={thStyle({ minWidth: 150 })}>Month</th>
                  <th style={thStyle({ minWidth: 120 })}>SITE</th>
                  <th style={thStyle({ minWidth: 120 })}>BILL</th>
                  <th style={thStyle({ minWidth: 100 })}>Amount</th>
                  <th style={thStyle({ minWidth: 80, background: '#92400e' })}>CGST</th>
                  <th style={thStyle({ minWidth: 80, background: '#92400e' })}>SGST</th>
                  <th style={thStyle({ minWidth: 110, background: '#3730a3' })}>Total Amount</th>
                  <th style={thStyle({ minWidth: 90, background: '#0e7490' })}>TDS @2%</th>
                  <th style={thStyle({ minWidth: 130, background: '#166534' })}>Receivable</th>
                  <th style={thStyle({ minWidth: 150, background: '#6b21a8' })}>Payment Amount{'\n'}(Paid)</th>
                  <th style={thStyle({ minWidth: 100, background: '#6b21a8' })}>TDS Provision</th>
                  <th style={thStyle({ minWidth: 100, background: '#6b21a8' })}>Difference</th>
                  <th style={thStyle({ minWidth: 130, background: '#6b21a8' })}>Payment Date</th>
                  <th style={thStyle({ minWidth: 140, background: '#6b21a8' })}>Reference No.</th>
                  <th style={thStyle({ minWidth: 110, background: '#6b21a8' })}>Debit Amount</th>
                  <th style={thStyle({ minWidth: 160, background: '#6b21a8' })}>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r, ri) => renderRow(r, ri))}
              </tbody>
            </table>
          )
        }
      </Box>

      {/* Pagination */}
      {totalPages > 1 && (
        <Box sx={{ p: 1.5, bgcolor: '#fff', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Button size="small" variant="outlined" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Prev</Button>
          <Typography variant="body2" fontWeight={700}>Page {page + 1} / {totalPages} &nbsp;·&nbsp; rows {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredRows.length)} of {filteredRows.length}</Typography>
          <Button size="small" variant="outlined" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next →</Button>
        </Box>
      )}

      {/* Payment Modal */}
      <Dialog open={paymentModalOpen} onClose={() => setPaymentModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Group Payment Details</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <Typography variant="body2" color="text.secondary">Applying to {selectedIds.length} invoices.</Typography>
          <TextField label="Receivable Amount (Auto-Calculated)" fullWidth value={paymentForm.receivableAmount || 0} InputProps={{ readOnly: true }} type="number" sx={{ bgcolor: '#f8fafc' }} />
          <TextField label="Payment Amount" fullWidth value={paymentForm.paymentAmount} onChange={e => setPaymentForm({ ...paymentForm, paymentAmount: e.target.value })} type="number" />
          <TextField label="TDS Provision" fullWidth value={paymentForm.tdsProvision} onChange={e => setPaymentForm({ ...paymentForm, tdsProvision: e.target.value })} type="number" />
          <TextField label="Payment Date" fullWidth value={paymentForm.paymentDate} onChange={e => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })} type="date" InputLabelProps={{ shrink: true }} />
          <TextField label="Reference No" fullWidth value={paymentForm.referenceNo} onChange={e => setPaymentForm({ ...paymentForm, referenceNo: e.target.value })} />
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
  );
}
