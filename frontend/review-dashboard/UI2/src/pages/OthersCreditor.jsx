import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Box, Typography, Button, IconButton, Tabs, Tab, Paper, Chip, Card, CardContent,
  TextField, CircularProgress, Snackbar, Alert, Checkbox, Dialog, DialogTitle,
  DialogContent, DialogActions
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
import axios from 'axios';
import { exportToCsv } from '../utils/exportCsv';
import { useTableNavigation } from '../hooks/useTableNavigation';

const API_URL = import.meta.env.VITE_API_URL;

const num = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};

const formatAmt = (val) => {
  return Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Calculate running balance row-by-row for Monoj Bandhan
const computeMonojBalances = (rowList) => {
  let currentBalance = 0;
  return rowList.map((row, index) => {
    const credit = num(row.credit);
    const debit = num(row.debit);
    if (index === 0) {
      currentBalance = credit - debit;
    } else {
      currentBalance = currentBalance + credit - debit;
    }
    return {
      ...row,
      slNo: index + 1,
      credit,
      debit,
      balance: Math.round(currentBalance * 100) / 100
    };
  });
};

export default function OthersCreditor({ onBack }) {
  const [activeTab, setActiveTab] = useState(0);

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
      {activeTab === 1 && <CreditorVehicleLedgerSection creditorName="BRINDA SHYAM" />}
      {activeTab === 2 && <CreditorVehicleLedgerSection creditorName="JEET PANJA" />}

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

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [confirmDelOpen, setConfirmDelOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const tableContainerRef = useRef(null);
  useTableNavigation(tableContainerRef);

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
  }, []);

  // Handle cell edit
  const handleCellChange = (index, field, value) => {
    setRows(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return computeMonojBalances(copy);
    });
  };

  // Add new empty row
  const handleAddRow = () => {
    const newRow = {
      tempId: `temp-${Date.now()}-${Math.random()}`,
      creditorName: 'MONOJ BANDHAN',
      date: new Date().toISOString().split('T')[0],
      credit: 0,
      debit: 0,
      balance: 0,
      remarks: ''
    };
    setRows(prev => computeMonojBalances([...prev, newRow]));
  };

  // Save all rows
  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const computed = computeMonojBalances(rows);
      const payloadRows = computed.map((r, idx) => ({
        ...r,
        creditorName: 'MONOJ BANDHAN',
        slNo: idx + 1
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

  // Filtered rows for search
  const filteredRows = useMemo(() => {
    if (!searchTerm.trim()) return rows;
    const term = searchTerm.toLowerCase();
    return rows.filter(r =>
      (r.date || '').toLowerCase().includes(term) ||
      (r.remarks || '').toLowerCase().includes(term) ||
      String(r.credit).includes(term) ||
      String(r.debit).includes(term)
    );
  }, [rows, searchTerm]);

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

  // Summary Metrics
  const summaryMetrics = useMemo(() => {
    let totalCredit = 0;
    let totalDebit = 0;
    filteredRows.forEach(r => {
      totalCredit += num(r.credit);
      totalDebit += num(r.debit);
    });
    const finalBalance = filteredRows.length > 0 ? filteredRows[filteredRows.length - 1].balance : 0;
    return {
      count: filteredRows.length,
      totalCredit,
      totalDebit,
      finalBalance
    };
  }, [filteredRows]);

  // Export CSV
  const handleExportCsv = () => {
    const exportData = filteredRows.map((r, i) => ({
      'SL NO': i + 1,
      'DATE': r.date || '',
      'CREDIT (Rs)': r.credit || 0,
      'DEBIT (Rs)': r.debit || 0,
      'BALANCE (Rs)': r.balance || 0,
      'REMARKS': r.remarks || ''
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

      {/* Control Bar: Search & Action Buttons */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <TextField
            size="small"
            placeholder="Search date or remarks..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: <SearchIcon sx={{ color: '#94a3b8', mr: 1 }} />
            }}
            sx={{
              width: 300,
              bgcolor: '#1e293b',
              borderRadius: 1,
              input: { color: '#fff', fontSize: '13px' },
              '.MuiOutlinedInput-notchedOutline': { borderColor: '#475569' }
            }}
          />

          {selectedIds.size > 0 && (
            <Chip
              label={`${selectedIds.size} selected`}
              color="primary"
              variant="outlined"
              sx={{ fontWeight: 700, height: 36, color: '#60a5fa', borderColor: '#3b82f6' }}
            />
          )}

          {selectedIds.size > 0 && (
            <Button
              variant="contained"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={() => setConfirmDelOpen(true)}
              sx={{ height: 36, px: 2, fontWeight: 700, bgcolor: '#ef4444', '&:hover': { bgcolor: '#dc2626' } }}
            >
              Delete Selected
            </Button>
          )}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <IconButton onClick={fetchData} sx={{ color: '#f8fafc', bgcolor: '#1e293b', '&:hover': { bgcolor: '#334155' } }}>
            <RefreshIcon />
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

      {/* Main Ledger Table */}
      <Box ref={tableContainerRef} sx={{ flex: 1, overflow: 'auto', borderRadius: 2, border: '1px solid #334155', bgcolor: '#fff', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.3)', position: 'relative', minHeight: 380 }}>
        {loading && (
          <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(255,255,255,0.7)', zIndex: 20 }}>
            <CircularProgress />
          </Box>
        )}

        <table style={{ width: '100%', minWidth: '950px', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
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
              <th style={{ ...thStyle, width: '150px' }}>DATE</th>
              <th style={{ ...thStyle, width: '160px' }}>CREDIT</th>
              <th style={{ ...thStyle, width: '160px' }}>DEBIT</th>
              <th style={{ ...thStyle, width: '180px' }}>BALANCE</th>
              <th style={{ ...thStyle, width: '320px' }}>REMARKS</th>
              <th style={{ ...thStyle, width: '70px' }}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 && !loading && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '48px', color: '#64748b', fontWeight: 600 }}>
                  No entries recorded for MONOJ BANDHAN yet. Click "+ Add Row" to add a new transaction.
                </td>
              </tr>
            )}

            {filteredRows.map((row, index) => {
              const rowId = row._id || row.tempId || `temp-${index}`;
              const isChecked = selectedIds.has(rowId);

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

                  {/* 1. SL NO (AUTO GENERATED) */}
                  <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 800, color: '#475569', backgroundColor: '#f1f5f9' }}>
                    {index + 1}
                  </td>

                  {/* 2. DATE (MANUAL DATE PICKER) */}
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <input
                      type="date"
                      value={row.date || ''}
                      onChange={(e) => handleCellChange(index, 'date', e.target.value)}
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
                      onChange={(e) => handleCellChange(index, 'credit', e.target.value)}
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

                  {/* 4. DEBIT (MANUAL NUMERIC INPUT) */}
                  <td style={{ ...tdStyle, backgroundColor: '#e0f2fe' }}>
                    <input
                      type="number"
                      value={row.debit !== undefined ? row.debit : 0}
                      onChange={(e) => handleCellChange(index, 'debit', e.target.value)}
                      placeholder="0.00"
                      style={{
                        width: '100%',
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        fontSize: '13px',
                        fontWeight: 800,
                        textAlign: 'right',
                        color: '#0369a1',
                        paddingRight: '6px'
                      }}
                    />
                  </td>

                  {/* 5. BALANCE (AUTO CALCULATED ROW BY ROW) */}
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

                  {/* 6. REMARKS (MANUAL TEXT INPUT) */}
                  <td style={{ ...tdStyle }}>
                    <input
                      type="text"
                      value={row.remarks || ''}
                      onChange={(e) => handleCellChange(index, 'remarks', e.target.value)}
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
                <td style={{ ...tdStyle, textAlign: 'right', paddingRight: '6px', fontSize: '13px', color: '#0369a1', backgroundColor: '#e0f2fe' }}>
                  ₹{formatAmt(summaryMetrics.totalDebit)}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', paddingRight: '12px', fontSize: '13px', color: summaryMetrics.finalBalance >= 0 ? '#15803d' : '#b91c1c', backgroundColor: summaryMetrics.finalBalance >= 0 ? '#dcfce7' : '#fee2e2' }}>
                  ₹{formatAmt(summaryMetrics.finalBalance)}
                </td>
                <td colSpan={2} style={{ ...tdStyle, backgroundColor: '#e2e8f0' }}></td>
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

// ─────────────────────────────────────────────────────────────────────────────
// CREDITOR VEHICLE LEDGER SECTION (BRINDA SHYAM & JEET PANJA TABS)
// ─────────────────────────────────────────────────────────────────────────────
function CreditorVehicleLedgerSection({ creditorName }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [confirmDelOpen, setConfirmDelOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const tableContainerRef = useRef(null);
  useTableNavigation(tableContainerRef);

  // Compute row balances (BALANCE = AMOUNT - PAID AMOUNT) & SL NO
  const computeRows = (rowList) => {
    return rowList.map((row, idx) => {
      const amt = num(row.amount);
      const paid = num(row.paidAmount);
      const bal = Math.round((amt - paid) * 100) / 100;
      return {
        ...row,
        slNo: idx + 1,
        amount: amt,
        paidAmount: paid,
        balance: bal
      };
    });
  };

  // Fetch data for specific creditor
  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.get(`${API_URL}/others-creditors`, {
        params: { creditorName },
        headers
      });

      if (res.data?.success) {
        const rawEntries = res.data.entries || [];
        setRows(computeRows(rawEntries));
      }
    } catch (err) {
      console.error(`[${creditorName}] Fetch error:`, err);
      setSnack({ severity: 'error', message: `Failed to fetch ${creditorName} data: ` + (err.response?.data?.error || err.message) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [creditorName]);

  // Handle cell edit
  const handleCellChange = (index, field, value) => {
    setRows(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return computeRows(copy);
    });
  };

  // Add new empty row
  const handleAddRow = () => {
    const today = new Date().toISOString().split('T')[0];
    const newRow = {
      tempId: `temp-${Date.now()}-${Math.random()}`,
      creditorName,
      dateOfUpdate: today,
      validity: '',
      vehicleNo: '',
      owner: '',
      amount: 0,
      paidAmount: 0,
      date: today,
      balance: 0
    };
    setRows(prev => computeRows([...prev, newRow]));
  };

  // Save all rows
  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const computed = computeRows(rows);
      const payloadRows = computed.map((r, idx) => ({
        ...r,
        creditorName,
        slNo: idx + 1
      }));

      const res = await axios.post(`${API_URL}/others-creditors/bulk-save`, { rows: payloadRows }, { headers });
      if (res.data?.success) {
        setSnack({ severity: 'success', message: `${creditorName} register saved successfully!` });
        fetchData();
      }
    } catch (err) {
      console.error(`[${creditorName}] Save error:`, err);
      setSnack({ severity: 'error', message: `Failed to save ${creditorName} register: ` + (err.response?.data?.error || err.message) });
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
      setRows(prev => computeRows(prev.filter(r => (r._id || r.tempId) !== rowId)));
      setSelectedIds(prev => {
        const copy = new Set(prev);
        copy.delete(rowId);
        return copy;
      });
      setSnack({ severity: 'success', message: 'Row deleted.' });
    } catch (err) {
      console.error(`[${creditorName}] Delete error:`, err);
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

      setRows(prev => computeRows(prev.filter(r => !selectedIds.has(r._id || r.tempId))));
      setSelectedIds(new Set());
      setConfirmDelOpen(false);
      setSnack({ severity: 'success', message: `Deleted ${idsArray.length} record(s).` });
    } catch (err) {
      console.error(`[${creditorName}] Delete error:`, err);
      setSnack({ severity: 'error', message: 'Delete failed: ' + (err.response?.data?.error || err.message) });
    } finally {
      setDeleting(false);
    }
  };

  // Filtered rows for search
  const filteredRows = useMemo(() => {
    if (!searchTerm.trim()) return rows;
    const term = searchTerm.toLowerCase();
    return rows.filter(r =>
      (r.vehicleNo || '').toLowerCase().includes(term) ||
      (r.owner || '').toLowerCase().includes(term) ||
      (r.dateOfUpdate || '').toLowerCase().includes(term) ||
      (r.validity || '').toLowerCase().includes(term) ||
      (r.date || '').toLowerCase().includes(term)
    );
  }, [rows, searchTerm]);

  // Selection states
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

  // Summary Metrics
  const summaryMetrics = useMemo(() => {
    let totalAmt = 0;
    let totalPaid = 0;
    let totalBal = 0;
    filteredRows.forEach(r => {
      totalAmt += num(r.amount);
      totalPaid += num(r.paidAmount);
      totalBal += num(r.balance);
    });
    return {
      count: filteredRows.length,
      totalAmt,
      totalPaid,
      totalBal
    };
  }, [filteredRows]);

  // Export CSV
  const handleExportCsv = () => {
    const exportData = filteredRows.map((r, i) => ({
      'SL NO': i + 1,
      'DATE OF UPDATE': r.dateOfUpdate || '',
      'VALIDITY': r.validity || '',
      'VEHICLE NO': r.vehicleNo || '',
      'OWNER': r.owner || '',
      'AMOUNT (Rs)': r.amount || 0,
      'PAID AMOUNT (Rs)': r.paidAmount || 0,
      'DATE': r.date || '',
      'BALANCE (Rs)': r.balance || 0
    }));
    const cleanName = creditorName.replace(/\s+/g, '_');
    exportToCsv(`${cleanName}_Ledger.csv`, exportData);
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

      {/* Control Bar: Search & Action Buttons */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <TextField
            size="small"
            placeholder="Search vehicle no, owner, date..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: <SearchIcon sx={{ color: '#94a3b8', mr: 1 }} />
            }}
            sx={{
              width: 320,
              bgcolor: '#1e293b',
              borderRadius: 1,
              input: { color: '#fff', fontSize: '13px' },
              '.MuiOutlinedInput-notchedOutline': { borderColor: '#475569' }
            }}
          />

          {selectedIds.size > 0 && (
            <Chip
              label={`${selectedIds.size} selected`}
              color="primary"
              variant="outlined"
              sx={{ fontWeight: 700, height: 36, color: '#60a5fa', borderColor: '#3b82f6' }}
            />
          )}

          {selectedIds.size > 0 && (
            <Button
              variant="contained"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={() => setConfirmDelOpen(true)}
              sx={{ height: 36, px: 2, fontWeight: 700, bgcolor: '#ef4444', '&:hover': { bgcolor: '#dc2626' } }}
            >
              Delete Selected
            </Button>
          )}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <IconButton onClick={fetchData} sx={{ color: '#f8fafc', bgcolor: '#1e293b', '&:hover': { bgcolor: '#334155' } }}>
            <RefreshIcon />
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

      {/* Main Table Container */}
      <Box ref={tableContainerRef} sx={{ flex: 1, overflow: 'auto', borderRadius: 2, border: '1px solid #334155', bgcolor: '#fff', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.3)', position: 'relative', minHeight: 380 }}>
        {loading && (
          <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(255,255,255,0.7)', zIndex: 20 }}>
            <CircularProgress />
          </Box>
        )}

        <table style={{ width: '100%', minWidth: '1250px', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
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
              <th style={{ ...thStyle, width: '65px' }}>SL NO</th>
              <th style={{ ...thStyle, width: '145px' }}>DATE OF UPDATE</th>
              <th style={{ ...thStyle, width: '135px' }}>VALIDITY</th>
              <th style={{ ...thStyle, width: '155px' }}>VEHICLE NO</th>
              <th style={{ ...thStyle, width: '180px' }}>OWNER</th>
              <th style={{ ...thStyle, width: '145px' }}>AMOUNT</th>
              <th style={{ ...thStyle, width: '145px' }}>PAID AMOUNT</th>
              <th style={{ ...thStyle, width: '145px' }}>DATE</th>
              <th style={{ ...thStyle, width: '155px' }}>BALANCE</th>
              <th style={{ ...thStyle, width: '65px' }}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 && !loading && (
              <tr>
                <td colSpan={11} style={{ textAlign: 'center', padding: '48px', color: '#64748b', fontWeight: 600 }}>
                  No records found for {creditorName}. Click "+ Add Row" to create an entry.
                </td>
              </tr>
            )}

            {filteredRows.map((row, index) => {
              const rowId = row._id || row.tempId || `temp-${index}`;
              const isChecked = selectedIds.has(rowId);
              const calculatedBalance = Math.round((num(row.amount) - num(row.paidAmount)) * 100) / 100;

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

                  {/* 1. SL NO */}
                  <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 800, color: '#475569', backgroundColor: '#f1f5f9' }}>
                    {index + 1}
                  </td>

                  {/* 2. DATE OF UPDATE */}
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <input
                      type="date"
                      value={row.dateOfUpdate || ''}
                      onChange={(e) => handleCellChange(index, 'dateOfUpdate', e.target.value)}
                      style={{
                        width: '100%',
                        border: '1px solid #cbd5e1',
                        borderRadius: '4px',
                        padding: '4px 6px',
                        outline: 'none',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#0f172a',
                        textAlign: 'center',
                        backgroundColor: '#fff'
                      }}
                    />
                  </td>

                  {/* 3. VALIDITY */}
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <input
                      type="text"
                      value={row.validity || ''}
                      onChange={(e) => handleCellChange(index, 'validity', e.target.value)}
                      placeholder="Validity / Date"
                      style={{
                        width: '100%',
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#334155',
                        textAlign: 'center'
                      }}
                    />
                  </td>

                  {/* 4. VEHICLE NO */}
                  <td style={{ ...tdStyle }}>
                    <input
                      type="text"
                      value={row.vehicleNo || ''}
                      onChange={(e) => handleCellChange(index, 'vehicleNo', e.target.value.toUpperCase())}
                      placeholder="Vehicle No"
                      style={{
                        width: '100%',
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        fontSize: '13px',
                        fontWeight: 700,
                        color: '#0f172a',
                        textTransform: 'uppercase'
                      }}
                    />
                  </td>

                  {/* 5. OWNER */}
                  <td style={{ ...tdStyle }}>
                    <input
                      type="text"
                      value={row.owner || ''}
                      onChange={(e) => handleCellChange(index, 'owner', e.target.value)}
                      placeholder="Owner Name"
                      style={{
                        width: '100%',
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        fontSize: '13px',
                        fontWeight: 600,
                        color: '#334155'
                      }}
                    />
                  </td>

                  {/* 6. AMOUNT */}
                  <td style={{ ...tdStyle, backgroundColor: '#fef3c7' }}>
                    <input
                      type="number"
                      value={row.amount !== undefined ? row.amount : 0}
                      onChange={(e) => handleCellChange(index, 'amount', e.target.value)}
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

                  {/* 7. PAID AMOUNT */}
                  <td style={{ ...tdStyle, backgroundColor: '#d1fae5' }}>
                    <input
                      type="number"
                      value={row.paidAmount !== undefined ? row.paidAmount : 0}
                      onChange={(e) => handleCellChange(index, 'paidAmount', e.target.value)}
                      placeholder="0.00"
                      style={{
                        width: '100%',
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        fontSize: '13px',
                        fontWeight: 800,
                        textAlign: 'right',
                        color: '#065f46',
                        paddingRight: '6px'
                      }}
                    />
                  </td>

                  {/* 8. DATE (PAYMENT DATE) */}
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <input
                      type="date"
                      value={row.date || ''}
                      onChange={(e) => handleCellChange(index, 'date', e.target.value)}
                      style={{
                        width: '100%',
                        border: '1px solid #cbd5e1',
                        borderRadius: '4px',
                        padding: '4px 6px',
                        outline: 'none',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#0f172a',
                        textAlign: 'center',
                        backgroundColor: '#fff'
                      }}
                    />
                  </td>

                  {/* 9. BALANCE (AMOUNT - PAID AMOUNT) */}
                  <td style={{
                    ...tdStyle,
                    backgroundColor: calculatedBalance <= 0 ? '#dcfce7' : '#fee2e2',
                    textAlign: 'right',
                    fontWeight: 900,
                    color: calculatedBalance <= 0 ? '#15803d' : '#b91c1c',
                    paddingRight: '12px'
                  }}>
                    ₹{formatAmt(calculatedBalance)}
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

            {/* Total Summary Row */}
            {filteredRows.length > 0 && (
              <tr style={{ backgroundColor: '#f1f5f9', fontWeight: 900 }}>
                <td style={{ ...tdStyle, backgroundColor: '#e2e8f0' }}></td>
                <td colSpan={5} style={{ ...tdStyle, textAlign: 'right', paddingRight: '12px', fontSize: '13px', color: '#0f172a', backgroundColor: '#e2e8f0' }}>
                  TOTAL SUMMARY
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', paddingRight: '6px', fontSize: '13px', color: '#b45309', backgroundColor: '#fef3c7' }}>
                  ₹{formatAmt(summaryMetrics.totalAmt)}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', paddingRight: '6px', fontSize: '13px', color: '#065f46', backgroundColor: '#d1fae5' }}>
                  ₹{formatAmt(summaryMetrics.totalPaid)}
                </td>
                <td style={{ ...tdStyle, backgroundColor: '#e2e8f0' }}></td>
                <td style={{ ...tdStyle, textAlign: 'right', paddingRight: '12px', fontSize: '13px', color: summaryMetrics.totalBal <= 0 ? '#15803d' : '#b91c1c', backgroundColor: summaryMetrics.totalBal <= 0 ? '#dcfce7' : '#fee2e2' }}>
                  ₹{formatAmt(summaryMetrics.totalBal)}
                </td>
                <td style={{ ...tdStyle, backgroundColor: '#e2e8f0' }}></td>
              </tr>
            )}
          </tbody>
        </table>
      </Box>

      {/* Delete Confirmation Dialog */}
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
