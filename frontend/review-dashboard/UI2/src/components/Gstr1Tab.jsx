import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box, Typography, Button, Snackbar, Alert, CircularProgress,
  Tooltip, Select, MenuItem, Checkbox, Dialog, DialogTitle,
  DialogContent, DialogActions, Chip
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import InfoIcon from '@mui/icons-material/Info';
import DeleteIcon from '@mui/icons-material/Delete';
import axios from 'axios';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const API_URL = import.meta.env.VITE_API_URL;

const parseAmount = (val) => {
  if (val === null || val === undefined || val === '') return 0;
  const num = parseFloat(String(val).replace(/,/g, ''));
  return isNaN(num) ? 0 : num;
};

const formatAmount = (val) => {
  return Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const getBillSubmissionFromType = (billType) => {
  if (!billType) return '';
  const bt = String(billType).trim().toUpperCase();
  if (bt === 'FREIGHT') return 'PORTAL';
  if (bt === 'TOLL') return 'EXCEL';
  if (bt === 'UNLOADING') return 'EXCEL';
  if (bt === 'INCENTIVE') return 'EXCEL';
  return '';
};

const parseInvoiceDate = (dateStr) => {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? null : dateStr;

  const rawStr = String(dateStr).trim();
  const str = rawStr.replace(/\s+\d{1,2}:\d{2}(:\d{2})?.*$/, '').replace(/T\d{2}:\d{2}.*$/, '').trim();

  // Check format: DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY, DD-MM-YY, DD/MM/YY, DD.MM.YY
  const ddmmyyyy = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (ddmmyyyy) {
    let d = parseInt(ddmmyyyy[1], 10);
    let m = parseInt(ddmmyyyy[2], 10);
    let y = parseInt(ddmmyyyy[3], 10);
    if (y < 100) y += 2000;
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      return new Date(y, m - 1, d);
    }
  }

  // Check format: YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD
  const yyyymmdd = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (yyyymmdd) {
    let y = parseInt(yyyymmdd[1], 10);
    let m = parseInt(yyyymmdd[2], 10);
    let d = parseInt(yyyymmdd[3], 10);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      return new Date(y, m - 1, d);
    }
  }

  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
};

const getMonthYearStr = (dateObj) => {
  if (!dateObj) return null;
  return `${MONTH_NAMES[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
};

export default function Gstr1Tab({ entries = [], filterMonth, filterYear }) {
  const [rows, setRows] = useState([]);
  const [siteFilter, setSiteFilter] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('ALL');
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState({ open: false, message: '', type: 'success' });
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fyYearStr = useMemo(() => {
    if (!filterYear) return '';
    if (filterMonth >= 4) {
      return `${filterYear}-${filterYear + 1}`;
    } else {
      return `${filterYear - 1}-${filterYear}`;
    }
  }, [filterMonth, filterYear]);

  const fetchGstr1Data = useCallback(async () => {
    if (!fyYearStr) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const [fyRes, gstRes] = await Promise.allSettled([
        axios.get(`${API_URL}/fy-details/data`, { params: { fy: fyYearStr }, headers }),
        axios.get(`${API_URL}/gst-portal`, { headers })
      ]);

      let allFyRows = [];
      if (fyRes.status === 'fulfilled' && fyRes.value?.data?.rows) {
        allFyRows = fyRes.value.data.rows;
      }

      let gstEntries = [];
      if (gstRes.status === 'fulfilled' && gstRes.value?.data?.entries) {
        gstEntries = gstRes.value.data.entries.filter(e => e.type === 'gstr1');
      } else if (Array.isArray(entries) && entries.length > 0) {
        gstEntries = entries.filter(e => e.type === 'gstr1');
      }

      const gstMap = {};
      const gstHiddenSet = new Set();
      gstEntries.forEach(g => {
        const invKey = String(g['Invoice Number'] || g.sourceBillId || '').trim();
        if (invKey) {
          if (g.hidden) {
            gstHiddenSet.add(invKey);
          } else {
            gstMap[invKey] = g;
          }
        }
      });

      const seenInvoices = new Set();
      const sourceRows = [];

      // 1. Include ALL Bill Register bills (Primary Source of Truth)
      for (const r of allFyRows) {
        const invKey = String(r.displayInvoiceNumber || r.invoiceNumber || '').trim();
        if (!invKey || gstHiddenSet.has(invKey)) continue; // Skip hidden/deleted GSTR-1 records
        seenInvoices.add(invKey);

        const matchedGst = gstMap[invKey] || {};
        const billTypeVal = r.billType || r.bill || matchedGst['BILL'] || matchedGst.billType || 'FREIGHT';
        const calculatedSubmission = getBillSubmissionFromType(billTypeVal) || matchedGst['Bill Submission'] || r.billSubmissionThrough || 'PORTAL';

        sourceRows.push({
          invoiceNumber: invKey,
          displayInvoiceNumber: invKey,
          invoiceDate: r.invoiceDate || matchedGst['Invoice Date'] || '',
          month: r.month || matchedGst['Month'] || '',
          site: r.site || matchedGst['SITE'] || '',
          billType: billTypeVal,
          billSubmissionThrough: calculatedSubmission,
          amount: parseAmount(r.amount !== undefined ? r.amount : matchedGst['Amount']),
          cgst: parseAmount(r.cgst !== undefined ? r.cgst : matchedGst['CGST']),
          sgst: parseAmount(r.sgst !== undefined ? r.sgst : matchedGst['SGST']),
          totalAmount: parseAmount(r.totalAmount !== undefined ? r.totalAmount : matchedGst['Total Amount']),
          sentToGST: !!(r.sentToGST || matchedGst.sourceBillId)
        });
      }

      // 2. Append any GSTR-1 portal entries not present in Bill Register
      for (const g of gstEntries) {
        const invKey = String(g['Invoice Number'] || g.sourceBillId || '').trim();
        if (invKey && !seenInvoices.has(invKey) && !gstHiddenSet.has(invKey)) {
          seenInvoices.add(invKey);
          const billTypeVal = g['BILL'] || g.billType || 'FREIGHT';
          const calculatedSubmission = getBillSubmissionFromType(billTypeVal) || g['Bill Submission'] || 'PORTAL';
          sourceRows.push({
            invoiceNumber: invKey,
            displayInvoiceNumber: invKey,
            invoiceDate: g['Invoice Date'] || '',
            month: g['Month'] || '',
            site: g['SITE'] || '',
            billType: billTypeVal,
            billSubmissionThrough: calculatedSubmission,
            amount: parseAmount(g['Amount']),
            cgst: parseAmount(g['CGST']),
            sgst: parseAmount(g['SGST']),
            totalAmount: parseAmount(g['Total Amount']),
            sentToGST: true
          });
        }
      }

      const mappedRows = sourceRows.map((r, i) => {
        const amt = parseAmount(r.amount);
        let c = parseAmount(r.cgst);
        let s = parseAmount(r.sgst);

        if (c === 0 && s === 0 && amt > 0) {
          c = Math.round(amt * 0.09);
          s = Math.round(amt * 0.09);
        }

        const parsedDate = parseInvoiceDate(r.invoiceDate);
        const monthYearStr = getMonthYearStr(parsedDate);

        const billTypeVal = r.billType || r.bill || r['BILL'] || '';
        const calculatedSubmission = getBillSubmissionFromType(billTypeVal) || r.billSubmissionThrough || r['Bill Submission'] || 'PORTAL';

        return {
          id: r.invoiceNumber || `temp-${i}`,
          slNo: i + 1,
          invoiceDate: r.invoiceDate || '',
          invoiceDateObj: parsedDate,
          monthYearStr: monthYearStr,
          invoiceNumber: r.displayInvoiceNumber || r.invoiceNumber || '',
          month: r.month || '',
          site: r.site || '',
          billSubmissionThrough: calculatedSubmission,
          bill: billTypeVal,
          billType: billTypeVal,
          amount: amt,
          cgst: c,
          sgst: s,
          totalAmount: amt + c + s
        };
      });

      setRows(mappedRows);
    } catch (err) {
      console.error("Failed to fetch GSTR-1 data", err);
    } finally {
      setLoading(false);
    }
  }, [fyYearStr, filterMonth, entries]);

  useEffect(() => {
    fetchGstr1Data();
  }, [fetchGstr1Data]);

  const availableMonths = useMemo(() => {
    const unique = new Set();
    rows.forEach(r => {
      if (r.monthYearStr) {
        unique.add(r.monthYearStr);
      }
    });
    return Array.from(unique).sort((a, b) => {
      const partsA = String(a || '').split(' ');
      const partsB = String(b || '').split(' ');
      const monthA = partsA[0] || '';
      const yearA = partsA[1] || '';
      const monthB = partsB[0] || '';
      const yearB = partsB[1] || '';
      if (yearA && yearB && yearA !== yearB) return Number(yearB) - Number(yearA);
      return MONTH_NAMES.indexOf(monthB) - MONTH_NAMES.indexOf(monthA);
    });
  }, [rows]);

  // Reset dateFilter to ALL if the currently selected filter is no longer available after an update
  useEffect(() => {
    if (dateFilter !== 'ALL' && !availableMonths.includes(dateFilter)) {
      setDateFilter('ALL');
    }
  }, [availableMonths, dateFilter]);

  const filteredRows = useMemo(() => {
    let result = rows;
    if (siteFilter !== 'ALL') {
      result = result.filter(r => (r.site || '').trim().toUpperCase() === siteFilter.toUpperCase());
    }
    if (dateFilter !== 'ALL') {
      result = result.filter(r => r.monthYearStr === dateFilter);
    }
    return result;
  }, [rows, siteFilter, dateFilter]);

  // Selection states & handlers
  const isAllFilteredSelected = useMemo(() => {
    if (filteredRows.length === 0) return false;
    return filteredRows.every(r => selectedIds.has(r.id));
  }, [filteredRows, selectedIds]);

  const isSomeFilteredSelected = useMemo(() => {
    if (filteredRows.length === 0) return false;
    const count = filteredRows.filter(r => selectedIds.has(r.id)).length;
    return count > 0 && count < filteredRows.length;
  }, [filteredRows, selectedIds]);

  const handleToggleRowSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (isAllFilteredSelected || isSomeFilteredSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filteredRows.forEach(r => next.delete(r.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filteredRows.forEach(r => next.add(r.id));
        return next;
      });
    }
  };

  // Deletion logic
  const handleOpenDeleteDialog = () => {
    if (selectedIds.size > 0) {
      setDeleteDialogOpen(true);
    }
  };

  const handleConfirmDelete = async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const invoiceNumbersToDelete = Array.from(selectedIds);

      const res = await axios.post(
        `${API_URL}/gst-portal/gstr1/delete-rows`,
        { invoiceNumbers: invoiceNumbersToDelete },
        { headers }
      );

      if (res.data.success) {
        setNotification({
          open: true,
          message: `Successfully deleted ${invoiceNumbersToDelete.length} GSTR-1 ${invoiceNumbersToDelete.length === 1 ? 'record' : 'records'}.`,
          type: 'success'
        });
        setSelectedIds(new Set());
        setDeleteDialogOpen(false);
        fetchGstr1Data();
      } else {
        throw new Error(res.data.error || 'Delete failed');
      }
    } catch (err) {
      console.error("GSTR-1 Delete error:", err);
      setNotification({
        open: true,
        message: err.response?.data?.error || err.message || 'Failed to delete GSTR-1 records.',
        type: 'error'
      });
    } finally {
      setDeleting(false);
    }
  };

  // Calculate overall totals
  const totals = useMemo(() => {
    let amount = 0, cgst = 0, sgst = 0, totalAmount = 0;
    filteredRows.forEach(row => {
      amount += row.amount;
      cgst += row.cgst;
      sgst += row.sgst;
      totalAmount += row.totalAmount;
    });
    return { amount, cgst, sgst, totalAmount };
  }, [filteredRows]);

  const CellDisplay = ({ value, align = "left", isNumeric = false }) => {
    const displayValue = isNumeric ? (typeof value === 'number' ? formatAmount(value) : value) : value;
    return (
      <Box sx={{
        width: '100%', boxSizing: 'border-box', padding: '8px 6px',
        fontSize: '13px', fontFamily: 'inherit', textAlign: align,
        color: '#334155', backgroundColor: 'transparent',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
      }}>
        {displayValue || '-'}
      </Box>
    );
  };

  const thStyle = {
    position: 'sticky',
    top: 0,
    backgroundColor: '#f1f5f9',
    color: '#1e293b',
    padding: '12px 8px',
    borderBottom: '2px solid #cbd5e1',
    borderRight: '1px solid #e2e8f0',
    fontSize: '12px',
    fontWeight: 700,
    textTransform: 'uppercase',
    textAlign: 'center',
    zIndex: 10,
    whiteSpace: 'normal',
    wordWrap: 'break-word',
    boxShadow: '0 2px 2px -1px rgba(0,0,0,0.1)'
  };

  const tdStyle = {
    padding: '2px 4px',
    borderBottom: '1px solid #e2e8f0',
    borderRight: '1px solid #e2e8f0',
    backgroundColor: '#fff'
  };

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, flex: 1, height: '100%', bgcolor: '#f8fafc', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Page Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h4" fontWeight="800" color="#0f172a">GSTR-1</Typography>
            <Tooltip title="Data automatically sourced from Bill Register">
              <InfoIcon color="primary" sx={{ opacity: 0.7 }} />
            </Tooltip>
          </Box>
          <Typography variant="subtitle2" color="#64748b" fontWeight="600" mt={0.5}>
            GST Return / Invoice Details (Synced with Bill Register)
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          {selectedIds.size > 0 && (
            <Chip
              label={`${selectedIds.size} ${selectedIds.size === 1 ? 'record' : 'records'} selected`}
              color="primary"
              variant="outlined"
              sx={{ fontWeight: 700, fontSize: '13px', height: 36 }}
            />
          )}

          <Button
            variant="contained"
            color="error"
            startIcon={<DeleteIcon />}
            disabled={selectedIds.size === 0}
            onClick={handleOpenDeleteDialog}
            sx={{
              height: 36,
              px: 2.5,
              fontWeight: 700,
              borderRadius: 1,
              backgroundColor: selectedIds.size > 0 ? '#ef4444' : undefined,
              '&:hover': { backgroundColor: '#dc2626' }
            }}
          >
            DELETE SELECTED
          </Button>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="subtitle2" fontWeight="700" color="#475569">SITE:</Typography>
            <Select
              size="small"
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value)}
              sx={{ minWidth: 120, height: 36, backgroundColor: '#fff', fontSize: '13px', fontWeight: 600 }}
            >
              <MenuItem value="ALL">ALL</MenuItem>
              <MenuItem value="NVL">NVL</MenuItem>
              <MenuItem value="NVCL">NVCL</MenuItem>
            </Select>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="subtitle2" fontWeight="700" color="#475569">INVOICE DATE:</Typography>
            <Select
              size="small"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              sx={{ minWidth: 160, height: 36, backgroundColor: '#fff', fontSize: '13px', fontWeight: 600 }}
            >
              <MenuItem value="ALL">ALL</MenuItem>
              {availableMonths.map(m => (
                <MenuItem key={m} value={m}>{m}</MenuItem>
              ))}
            </Select>
          </Box>
          <Button
            variant="contained"
            color="primary"
            startIcon={<SaveIcon />}
            disabled={true} // Disabled because data comes from the Bill Register
            sx={{ px: 4, py: 1.5, fontWeight: 'bold', borderRadius: 1, opacity: 0.7 }}
          >
            SAVE GSTR-1
          </Button>
        </Box>
      </Box>

      {/* Table Container */}
      <Box sx={{
        flex: 1,
        overflow: 'auto',
        border: '1px solid #cbd5e1',
        borderRadius: '4px',
        backgroundColor: '#fff',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
        mb: 2,
        position: 'relative'
      }}>
        {loading && (
          <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.7)', zIndex: 20 }}>
            <CircularProgress />
          </Box>
        )}
        <table style={{ width: '100%', minWidth: '1400px', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: '45px', textAlign: 'center' }}>
                <Checkbox
                  size="small"
                  checked={isAllFilteredSelected}
                  indeterminate={isSomeFilteredSelected}
                  onChange={handleToggleSelectAll}
                  disabled={filteredRows.length === 0}
                  sx={{ p: 0, color: '#64748b', '&.Mui-checked': { color: '#1976d2' } }}
                />
              </th>
              <th style={{ ...thStyle, width: '50px' }}>Sl No</th>
              <th style={{ ...thStyle, width: '120px' }}>Invoice Date</th>
              <th style={{ ...thStyle, width: '150px' }}>Invoice Number</th>
              <th style={{ ...thStyle, width: '100px' }}>Month</th>
              <th style={{ ...thStyle, width: '130px' }}>SITE</th>
              <th style={{ ...thStyle, width: '180px' }}>BILL SUBMISSION THROUGH</th>
              <th style={{ ...thStyle, width: '150px' }}>BILL</th>
              <th style={{ ...thStyle, width: '150px' }}>BILL TYPE</th>
              <th style={{ ...thStyle, width: '120px' }}>Amount</th>
              <th style={{ ...thStyle, width: '110px' }}>CGST</th>
              <th style={{ ...thStyle, width: '110px' }}>SGST</th>
              <th style={{ ...thStyle, width: '130px' }}>Total Amount</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 && !loading && (
              <tr>
                <td colSpan={13} style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                  No bills found in the Bill Register for this month and site.
                </td>
              </tr>
            )}
            {filteredRows.map((row) => {
              const isSelected = selectedIds.has(row.id);
              return (
                <tr key={row.id} style={{ transition: 'background-color 0.2s', backgroundColor: isSelected ? '#eff6ff' : '#fff', '&:hover': { backgroundColor: isSelected ? '#dbeafe' : '#f1f5f9' } }}>
                  <td style={{ ...tdStyle, textAlign: 'center', backgroundColor: isSelected ? '#eff6ff' : '#fff' }}>
                    <Checkbox
                      size="small"
                      checked={isSelected}
                      onChange={() => handleToggleRowSelect(row.id)}
                      sx={{ p: 0 }}
                    />
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600, color: '#475569', backgroundColor: isSelected ? '#eff6ff' : '#f8fafc' }}>
                    {row.slNo}
                  </td>
                  <td style={tdStyle}><CellDisplay value={row.invoiceDate} align="center" /></td>
                  <td style={tdStyle}><CellDisplay value={row.invoiceNumber} /></td>
                  <td style={tdStyle}><CellDisplay value={row.month} align="center" /></td>
                  <td style={tdStyle}><CellDisplay value={row.site} /></td>
                  <td style={tdStyle}><CellDisplay value={row.billSubmissionThrough} /></td>
                  <td style={tdStyle}><CellDisplay value={row.bill} /></td>
                  <td style={tdStyle}><CellDisplay value={row.billType} /></td>
                  <td style={tdStyle}><CellDisplay value={row.amount} isNumeric align="right" /></td>
                  <td style={tdStyle}><CellDisplay value={row.cgst} isNumeric align="right" /></td>
                  <td style={tdStyle}><CellDisplay value={row.sgst} isNumeric align="right" /></td>
                  <td style={{ ...tdStyle, textAlign: 'right', paddingRight: '12px', fontWeight: 700, color: '#0f172a' }}>
                    ₹{formatAmount(row.totalAmount)}
                  </td>
                </tr>
              );
            })}

            {/* Total Row */}
            {filteredRows.length > 0 && (
              <tr style={{ backgroundColor: '#f1f5f9' }}>
                <td style={{ ...tdStyle, backgroundColor: '#f8fafc' }}></td>
                <td colSpan={8} style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, paddingRight: '16px', fontSize: '13px', color: '#0f172a', backgroundColor: '#f8fafc' }}>
                  TOTAL
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, paddingRight: '6px', fontSize: '13px', color: '#0f172a', backgroundColor: '#f8fafc' }}>
                  ₹{formatAmount(totals.amount)}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, paddingRight: '6px', fontSize: '13px', color: '#0f172a', backgroundColor: '#f8fafc' }}>
                  ₹{formatAmount(totals.cgst)}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, paddingRight: '6px', fontSize: '13px', color: '#0f172a', backgroundColor: '#f8fafc' }}>
                  ₹{formatAmount(totals.sgst)}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, paddingRight: '12px', fontSize: '13px', color: '#0f172a', backgroundColor: '#f8fafc' }}>
                  ₹{formatAmount(totals.totalAmount)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Box>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => !deleting && setDeleteDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700, color: '#0f172a', pb: 1 }}>
          Confirm Deletion
        </DialogTitle>
        <DialogContent>
          <Typography color="#334155" fontSize="14px">
            Are you sure you want to delete the selected GSTR_1 records?
          </Typography>
          <Typography variant="body2" color="#dc2626" mt={1.5} fontWeight={700}>
            {selectedIds.size} {selectedIds.size === 1 ? 'record' : 'records'} selected for deletion.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button
            onClick={() => setDeleteDialogOpen(false)}
            disabled={deleting}
            sx={{ color: '#64748b', fontWeight: 600 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleConfirmDelete}
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={18} color="inherit" /> : <DeleteIcon />}
            sx={{ fontWeight: 700, backgroundColor: '#ef4444', '&:hover': { backgroundColor: '#dc2626' } }}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={notification.open}
        autoHideDuration={4000}
        onClose={() => setNotification(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={notification.type} variant="filled" sx={{ width: '100%', fontWeight: 600 }}>
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
