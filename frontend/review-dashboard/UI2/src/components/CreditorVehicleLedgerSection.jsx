import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Box, Typography, Button, IconButton, TextField, CircularProgress,
  Snackbar, Alert, Checkbox, Dialog, DialogTitle, DialogContent,
  DialogActions, Chip
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
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

export default function CreditorVehicleLedgerSection({ creditorName }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [contacts, setContacts] = useState([]);

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [confirmDelOpen, setConfirmDelOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const tableContainerRef = useRef(null);
  useTableNavigation(tableContainerRef);

  // Fetch truck contacts for vehicle autocomplete & automatic owner lookup
  useEffect(() => {
    const fetchContacts = async () => {
      try {
        const token = localStorage.getItem('token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await axios.get(`${API_URL}/truck-contacts`, { headers });
        if (res.data?.success) {
          setContacts(res.data.contacts || []);
        }
      } catch (err) {
        console.error('[OthersCreditor] Truck contacts fetch error:', err);
      }
    };
    fetchContacts();
  }, []);

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

  // Handle cell edit with auto-fill owner on vehicleNo match
  const handleCellChange = (index, field, value) => {
    setRows(prev => {
      const copy = [...prev];
      const updatedRow = { ...copy[index], [field]: value };

      if (field === 'vehicleNo') {
        const normVeh = String(value).trim().toUpperCase().replace(/\s+/g, '');
        const matched = contacts.find(c => {
          const tNo = String(c["Truck No"] || c["Truck No "] || c.truck_no || "").trim().toUpperCase().replace(/\s+/g, '');
          return tNo === normVeh;
        });
        if (matched) {
          const ownerName = String(matched["Owner Name"] || matched["Owner Name "] || matched.owner_name || "").trim();
          if (ownerName) {
            updatedRow.owner = ownerName;
          }
        }
      }

      copy[index] = updatedRow;
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

  const listIdVeh = `vehicle-list-${creditorName.replace(/\s+/g, '-')}`;
  const listIdVal = `validity-list-${creditorName.replace(/\s+/g, '-')}`;

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
              <th style={{ ...thStyle, width: '145px' }}>VALIDITY</th>
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
                      list={listIdVal}
                      value={row.validity || ''}
                      onChange={(e) => handleCellChange(index, 'validity', e.target.value)}
                      placeholder="Validity / Date"
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

                  {/* 4. VEHICLE NO */}
                  <td style={{ ...tdStyle }}>
                    <input
                      type="text"
                      list={listIdVeh}
                      value={row.vehicleNo || ''}
                      onChange={(e) => handleCellChange(index, 'vehicleNo', e.target.value.toUpperCase())}
                      placeholder="Vehicle No"
                      style={{
                        width: '100%',
                        border: '1px solid #cbd5e1',
                        borderRadius: '4px',
                        padding: '4px 6px',
                        outline: 'none',
                        fontSize: '13px',
                        fontWeight: 800,
                        color: '#0284c7',
                        textTransform: 'uppercase',
                        backgroundColor: '#fff'
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
                        border: '1px solid #cbd5e1',
                        borderRadius: '4px',
                        padding: '4px 6px',
                        outline: 'none',
                        fontSize: '13px',
                        fontWeight: 600,
                        color: '#0f172a',
                        backgroundColor: '#fff'
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

      {/* Datalists for Autocomplete */}
      <datalist id={listIdVeh}>
        {contacts.map((c, idx) => {
          const tNo = c["Truck No"] || c["Truck No "] || c.truck_no;
          const oName = c["Owner Name"] || c["Owner Name "] || c.owner_name;
          return tNo ? <option key={idx} value={tNo}>{oName ? `${tNo} (${oName})` : tNo}</option> : null;
        })}
      </datalist>

      <datalist id={listIdVal}>
        <option value="RC VALIDITY" />
        <option value="INSURANCE VALIDITY" />
        <option value="FITNESS VALIDITY" />
        <option value="ROAD TAX VALIDITY" />
        <option value="PERMIT VALIDITY" />
        <option value="PUC VALIDITY" />
        <option value="NP VALIDITY" />
        <option value="LICENSE VALIDITY" />
        <option value="DRIVER AUTHORISE VALIDITY" />
      </datalist>

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
