import SearchableSelect from '../components/SearchableSelect';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box, Typography, Button, IconButton, CircularProgress,
  Snackbar, Alert, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Chip, Tooltip
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LockIcon from '@mui/icons-material/Lock';
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

const MONTH_NAMES_FULL = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const MONTHS_LIST = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' }
];

const getMonthIndexFromDate = (dateStr) => {
  if (!dateStr) return 99;
  const parts = String(dateStr).split('-');
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      const m = parseInt(parts[1], 10);
      if (!isNaN(m) && m >= 1 && m <= 12) return m;
    } else if (parts[2].length === 4) {
      const m = parseInt(parts[1], 10);
      if (!isNaN(m) && m >= 1 && m <= 12) return m;
    }
  }
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d.getMonth() + 1;
  } catch (_) { }
  return 99;
};

const formatDateForInput = (dateStr) => {
  if (!dateStr) return '';
  if (String(dateStr).includes('T')) return String(dateStr).split('T')[0];
  const parts = String(dateStr).split('-');
  if (parts.length === 3) {
    if (parts[2].length === 4) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    if (parts[0].length === 4) return String(dateStr);
  }
  return '';
};

const DEBIT_REASONS = [
  'None',
  'Damage / Shortage',
  'GPS Deviation Charges',
  'GPS Trip Charges',
  'Device Installation Charges',
  'RFID Deduction / Charges',
  'Substance',
  'TDS Provision'
];
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

  // Damage / Shortage Modal States
  const FY_OPTIONS = ['2024-2025', '2025-2026', '2026-2027', '2027-2028'];
  const [damageModalOpen, setDamageModalOpen] = useState(false);
  const [damageTarget, setDamageTarget] = useState(null); // { invoiceNumber, groupId }
  const [damageYear, setDamageYear] = useState('');
  const [damageMonth, setDamageMonth] = useState('');
  const [damageVehicles, setDamageVehicles] = useState([]);
  const [damageSelectedVehicles, setDamageSelectedVehicles] = useState([]);
  const [damageTrips, setDamageTrips] = useState([]);
  const [damageSelectedTrips, setDamageSelectedTrips] = useState([]);
  const [damageVehicleAmounts, setDamageVehicleAmounts] = useState({});
  const [damageManualRemarks, setDamageManualRemarks] = useState('');

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ id: '', paymentAmount: '', paymentDate: '', referenceNo: '', debitAmount: '', remarks: '' });
  const [uploadingGroup, setUploadingGroup] = useState(null);
  const [pageDocuments, setPageDocuments] = useState([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [dirtyRows, setDirtyRows] = useState(new Set());
  const [dirtyGroups, setDirtyGroups] = useState(new Set());
  const [page, setPage] = useState(0);
  const [siteFilter, setSiteFilter] = useState('All'); // 'All' | 'NVCL' | 'NVL'
  const [selectedMonth, setSelectedMonth] = useState('All'); // 'All' | '1' | '2' etc
  const [selYear, setSelYear] = useState('2025-2026');

  // Payment Status Dashboard States
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [dashboardM, setDashboardM] = useState(new Date().getMonth() + 1); // Defaults to current calendar month

  const handleAddRow = () => {
    if (selectedIds.length > 1) {
      setSnack({ severity: 'warning', msg: 'Please select at most one row to insert below, or clear selection to add at the end.' });
      return;
    }

    let selIdx = -1;
    let selRow = null;
    let newSlNo = 1;

    if (selectedIds.length === 1) {
      const selId = selectedIds[0];
      selIdx = rows.findIndex(x => x.invoiceNumber === selId);
      if (selIdx !== -1) {
        selRow = rows[selIdx];
        const sortedIdx = computedRows.findIndex(x => x.invoiceNumber === selId);
        newSlNo = (selRow.slNo || 0) + 1;
        if (sortedIdx !== -1 && sortedIdx < computedRows.length - 1) {
          const nextRow = computedRows[sortedIdx + 1];
          newSlNo = ((selRow.slNo || 0) + (nextRow.slNo || 0)) / 2;
        }
      }
    } else {
      // No selection: append to end of current view
      if (computedRows.length > 0) {
        selRow = computedRows[computedRows.length - 1];
        newSlNo = (selRow.slNo || 0) + 1;
      }
      selIdx = rows.length - 1;
    }

    const tempId = `TEMP-${Date.now()}`;
    
    // Determine default month
    let defaultMonthStr = '';
    if (selRow && selRow.month) {
      defaultMonthStr = selRow.month;
    } else {
      let mIdx = selectedMonth !== '' ? Number(selectedMonth) : new Date().getMonth();
      let yStr = selYear ? selYear.split('-')[0] : new Date().getFullYear();
      defaultMonthStr = `${MONTHS[mIdx]}-${yStr}`;
    }

    const newRow = {
      invoiceNumber: tempId,
      displayInvoiceNumber: '',
      invoiceDate: selRow?.invoiceDate || new Date().toISOString().split('T')[0],
      month: defaultMonthStr,
      site: selRow?.site || 'NVCL',
      billType: 'FREIGHT',
      amount: 0,
      cgst: 0,
      sgst: 0,
      totalAmount: 0,
      tds: 0,
      receivable: 0,
      debitReason: 'None',
      isNewRow: true,
      slNo: newSlNo
    };

    // Insert locally immediately after selected index in the rows array
    const newRows = [...rows];
    newRows.splice(selIdx + 1, 0, newRow);
    setRows(newRows);

    setDirtyRows(prev => new Set(prev).add(tempId));
    const msg = selectedIds.length === 1 
      ? 'New blank row inserted below selection. Click Save Details to persist.'
      : 'New blank row added to the end. Click Save Details to persist.';
    setSnack({ severity: 'success', msg });
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [dataRes, docsRes] = await Promise.all([
        axios.get(`${API_URL}/fy-details/data`, { params: { fy: selYear } }),
        axios.get(`${API_URL}/fy-details/documents`)
      ]);
      setRows(dataRes.data.rows || []);
      setPayments(dataRes.data.payments || []);
      setPageDocuments(docsRes.data || []);
      setSelectedIds([]);
      setDirtyRows(new Set());
      setDirtyGroups(new Set());
      setPage(0);
    } catch {
      setSnack({ severity: 'error', msg: 'Failed to load details' });
    } finally { setLoading(false); }
  }, [selYear]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDamageYearChange = (e) => {
    setDamageYear(e.target.value);
    setDamageMonth('');
    setDamageVehicles([]);
    setDamageSelectedVehicles([]);
    setDamageTrips([]);
    setDamageSelectedTrips([]);
    setDamageVehicleAmounts({});
    setDamageManualRemarks('');
  };

  const fetchDamageVehicles = async (monthName) => {
    setDamageMonth(monthName);
    setDamageSelectedVehicles([]);
    setDamageTrips([]);
    setDamageSelectedTrips([]);
    setDamageVehicleAmounts({});
    if (!monthName || !damageYear) return setDamageVehicles([]);
    try {
      const monthIdx = MONTHS.indexOf(monthName) + 1;
      const res = await axios.get(`${API_URL}/fy-details/vehicles?month=${monthIdx}&fy=${damageYear}`);
      setDamageVehicles(res.data || []);
    } catch {
      setSnack({ severity: 'error', msg: 'Failed to fetch vehicles' });
    }
  };

  const toggleDamageVehicle = async (vehicle) => {
    let updated;
    if (damageSelectedVehicles.includes(vehicle)) {
      updated = damageSelectedVehicles.filter(v => v !== vehicle);
    } else {
      updated = [...damageSelectedVehicles, vehicle];
    }
    setDamageSelectedVehicles(updated);

    if (updated.length === 0) {
      setDamageTrips([]);
      setDamageSelectedTrips([]);
      setDamageVehicleAmounts({});
      return;
    }

    try {
      const monthIdx = MONTHS.indexOf(damageMonth) + 1;
      const vehicleQuery = updated.join(',');
      const res = await axios.get(`${API_URL}/fy-details/trips?month=${monthIdx}&vehicle=${vehicleQuery}&fy=${damageYear}`);
      setDamageTrips(res.data || []);
      setDamageSelectedTrips(prev => prev.filter(t => updated.includes(t.vehicle)));
    } catch {
      setSnack({ severity: 'error', msg: 'Failed to fetch trips' });
    }
  };

  const toggleDamageTrip = (trip) => {
    setDamageSelectedTrips(prev => {
      const exists = prev.find(t => t.invoiceNo === trip.invoiceNo && t.tripDate === trip.tripDate);
      if (exists) return prev.filter(t => t.invoiceNo !== trip.invoiceNo || t.tripDate !== trip.tripDate);
      return [...prev, trip];
    });
  };

  const handleDamageSubmit = async () => {
    if (!damageTarget || damageSelectedTrips.length === 0) return;
    const inv = damageTarget.invoiceNumber;
    const gid = damageTarget.groupId;

    const targetAmt = Math.abs(num(damageTarget.debitAmount));
    // Sum amounts keyed by invoiceNo (one per trip-row)
    const allocatedAmt = damageSelectedTrips.reduce((sum, t) => sum + num(damageVehicleAmounts[t.invoiceNo] || 0), 0);
    // Amount matching validation removed as per user request

    // Auto-populate group remarks – one line per trip-row (vehicle + trip + amount)
    let suffix = damageTarget.reason;
    if (suffix === 'Damage / Shortage') suffix = 'Damage/Shortage';
    else if (suffix === 'RFID Deduction / Charges') suffix = 'RFID Deduction';

    const suffixStr = suffix ? `-${suffix}` : '';
    const monthCap = damageMonth.charAt(0).toUpperCase() + damageMonth.slice(1).toLowerCase();

    const sortedSelectedTrips = [...damageSelectedTrips].sort((a, b) => {
      if (a.vehicle !== b.vehicle) return a.vehicle.localeCompare(b.vehicle);
      return a.tripNumber - b.tripNumber;
    });

    // One remark line per trip-row: Month-Vehicle-Trip N (date)-Reason-₹amount
    const newRemarks = sortedSelectedTrips.map(t => {
      const amt = damageVehicleAmounts[t.invoiceNo] || 0;
      return `${monthCap}-${t.vehicle}-Trip No. ${t.tripNumber} (${t.tripDate})${suffixStr}-₹${amt}`;
    }).join('\n');

    // Build the combined remarks:
    // Auto-generated trip lines come first, then the user's manual remarks (if any)
    const combinedRemarks = damageManualRemarks.trim()
      ? `${newRemarks}\n---\n${damageManualRemarks.trim()}`
      : newRemarks;

    // Build the updated payment record
    const existingPayment = payments.find(p => p.id === gid);
    const updatedPayment = existingPayment
      ? { ...existingPayment, remarks: combinedRemarks }
      : { id: gid, billNos: [inv], paymentAmount: '', paymentDate: '', referenceNo: '', debitAmount: '', remarks: combinedRemarks, tdsProvision: '' };

    // Update local state immediately for snappy UI
    setPayments(prev => {
      const idx = prev.findIndex(p => p.id === gid);
      if (idx !== -1) {
        const np = [...prev];
        np[idx] = updatedPayment;
        return np;
      }
      return [...prev, updatedPayment];
    });

    // Update row with damage metadata in local state
    const updatedRow = { damageYear, damageMonth, damageVehicles: damageSelectedVehicles, damageTrips: sortedSelectedTrips, damageVehicleAmounts };
    setRows(prev => prev.map(r => r.invoiceNumber === inv ? { ...r, ...updatedRow } : r));

    setDamageModalOpen(false);

    // ── Immediately persist to MongoDB ──────────────────────────────────
    setLoading(true);
    try {
      // 1. Save the row with damage metadata
      const rowData = rows.find(x => x.invoiceNumber === inv) || {};
      await axios.post(`${API_URL}/fy-details/save-row`, {
        billNo: inv,
        billType: rowData.billType,
        editedInvoiceDate: rowData.invoiceDate,
        editedInvoiceNumber: rowData.displayInvoiceNumber || rowData.invoiceNumber,
        editedMonth: rowData.month,
        editedSite: rowData.site,
        editedAmount: rowData.amount,
        debitReason: damageTarget.reason,
        damageYear,
        damageMonth,
        damageVehicles: damageSelectedVehicles,
        damageTrips: sortedSelectedTrips,
        damageVehicleAmounts
      });

      // 2. Save the payment group with combined remarks (auto + manual)
      await axios.post(`${API_URL}/fy-details/save-group`, {
        id: updatedPayment.id,
        billNos: updatedPayment.billNos,
        paymentAmount: num(updatedPayment.paymentAmount),
        paymentDate: updatedPayment.paymentDate || '',
        referenceNo: updatedPayment.referenceNo || '',
        debitAmount: num(updatedPayment.debitAmount),
        remarks: combinedRemarks,
        tdsProvision: num(updatedPayment.tdsProvision)
      });

      setSnack({ severity: 'success', msg: 'Damage details saved! Remarks updated and Cement Register synchronized.' });
      // Refresh to get latest data including cement register updates
      await fetchData();
    } catch (err) {
      console.error('[DamageSubmit] Save error:', err);
      setSnack({ severity: 'error', msg: 'Save failed: ' + (err.response?.data?.error || err.message) });
      // Mark dirty so user can retry via header Save button
      setDirtyGroups(prev => new Set(prev).add(gid));
      setDirtyRows(prev => new Set(prev).add(inv));
    } finally {
      setLoading(false);
    }
  };

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
    }).sort((a, b) => {
      const mA = getMonthIndexFromDate(a.invoiceDate);
      const mB = getMonthIndexFromDate(b.invoiceDate);
      if (mA !== mB) return mA - mB;
      return (a.invoiceDate || '').localeCompare(b.invoiceDate || '') || (a.invoiceNumber || '').localeCompare(b.invoiceNumber || '');
    });
  }, [rows, payments]);

  // Site filter helpers
  const isNVL = useCallback((site) => /^NVL$/i.test((site || '').trim()), []);
  const isNVCL = useCallback((site) => /^NVCL$/i.test((site || '').trim()), []);
  const filteredRows = useMemo(() => {
    let result = computedRows;
    if (siteFilter === 'NVL') result = result.filter(r => isNVL(r.site));
    if (siteFilter === 'NVCL') result = result.filter(r => isNVCL(r.site));

    if (selectedMonth !== 'All') {
      const mTarget = parseInt(selectedMonth, 10);
      result = result.filter(r => {
        let mIdx = getMonthIndexFromDate(r.invoiceDate);
        if (mIdx === 99 && r.month) {
          const found = MONTHS_LIST.find(m => m.label.toUpperCase() === String(r.month).toUpperCase());
          if (found) mIdx = found.value;
        }
        return mIdx === mTarget;
      });
    }
    return result;
  }, [computedRows, siteFilter, selectedMonth, isNVL, isNVCL]);

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

  // Payment Status Dashboard Filtered Rows
  const dashboardRows = useMemo(() => {
    return computedRows.filter(r => {
      let mIdx = getMonthIndexFromDate(r.invoiceDate);
      if (mIdx === 99 && r.month) {
        const found = MONTHS_LIST.find(m => m.label.toUpperCase() === String(r.month).toUpperCase());
        if (found) mIdx = found.value;
      }
      return mIdx === dashboardM;
    });
  }, [computedRows, dashboardM]);

  // Payment Status Dashboard Details Calculation
  const dashboardDetails = useMemo(() => {
    return dashboardRows.map(r => {
      const gid = r.groupId;
      const gd = r.groupData || {};

      // Filter all rows in the group to get total group receivable
      const groupRows = computedRows.filter(cr => cr.groupId === gid);
      const groupTotalRecv = groupRows.reduce((s, x) => s + (x.receivable || 0), 0);

      const paymentAmt = parseFloat(gd.paymentAmount) || 0;
      const debitAmt = parseFloat(gd.debitAmount) || 0;
      const tdsProv = parseFloat(gd.tdsProvision) || 0;

      // Group is fully paid if total payment + debit + tds >= group total receivable
      const isPaid = paymentAmt > 0 && (paymentAmt + debitAmt + tdsProv >= groupTotalRecv - 1);

      let individualAmountPaid = 0;
      let individualOutstanding = r.receivable || 0;
      let status = 'Pending';

      if (isPaid) {
        individualAmountPaid = r.receivable || 0;
        individualOutstanding = 0;
        status = 'Paid';
      } else if (paymentAmt > 0 || debitAmt > 0 || tdsProv > 0) {
        // Proportional allocation for partial payments
        const ratio = groupTotalRecv > 0 ? ((paymentAmt + debitAmt + tdsProv) / groupTotalRecv) : 0;
        individualAmountPaid = (r.receivable || 0) * ratio;
        individualOutstanding = Math.max(0, (r.receivable || 0) - individualAmountPaid);
        if (individualOutstanding < 1) {
          individualOutstanding = 0;
          status = 'Paid';
        }
      }

      return {
        billNo: r.displayInvoiceNumber || r.invoiceNumber,
        invoiceNo: r.invoiceNos && r.invoiceNos.length > 0 ? r.invoiceNos.join(', ') : '—',
        invoiceDate: r.invoiceDate,
        partyName: r.partyNames && r.partyNames.length > 0 ? r.partyNames.join(', ') : '—',
        vehicleNo: r.vehicleNumbers && r.vehicleNumbers.length > 0 ? r.vehicleNumbers.join(', ') : '—',
        billAmount: r.receivable || 0,
        amountPaid: individualAmountPaid,
        outstanding: individualOutstanding,
        status: status
      };
    });
  }, [dashboardRows, computedRows]);

  // Payment Status Dashboard Summary Stats
  const dashboardStats = useMemo(() => {
    let totalBills = dashboardDetails.length;
    let paidCount = dashboardDetails.filter(d => d.status === 'Paid').length;
    let pendingCount = totalBills - paidCount;
    let totalOutstanding = dashboardDetails.reduce((s, d) => s + d.outstanding, 0);

    return { totalBills, paidCount, pendingCount, totalOutstanding };
  }, [dashboardDetails]);

  // Pagination
  const totalPages = Math.ceil(filteredRows.length / PAGE_SIZE);
  const visibleRows = useMemo(() => filteredRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filteredRows, page]);

  // Reset page when filter changes
  const handleSiteFilter = useCallback((f) => { setSiteFilter(f); setPage(0); }, []);

  const handleRowEdit = useCallback((invoiceNumber, field, value) => {
    const WORKFLOW_REASONS = [
      'Damage / Shortage',
      'GPS Deviation Charges',
      'GPS Trip Charges',
      'Device Installation Charges',
      'RFID Deduction / Charges',
      'Substance'
    ];

    if (field === 'debitReason' && WORKFLOW_REASONS.includes(value)) {
      const r = rows.find(x => x.invoiceNumber === invoiceNumber);
      const computedR = computedRows.find(x => x.invoiceNumber === invoiceNumber);
      if (r && computedR) {
        setDamageTarget({ invoiceNumber: invoiceNumber, groupId: computedR.groupId, reason: value, debitAmount: computedR.groupData?.debitAmount });
        setDamageModalOpen(true);
        // Pre-load any existing manual remarks from the payment record
        // Strip out the auto-generated trip lines (everything before the '---' separator)
        const existingRemarks = computedR.groupData?.remarks || '';
        const sepIdx = existingRemarks.indexOf('\n---\n');
        setDamageManualRemarks(sepIdx !== -1 ? existingRemarks.slice(sepIdx + 5) : '');
      }
    }

    setRows(prev => prev.map(r => {
      if (r.invoiceNumber !== invoiceNumber) return r;
      const updated = { ...r, [field]: value };

      // If this is a new row and we are editing the invoice number, update the primary key invoiceNumber as well
      if (r.isNewRow && field === 'displayInvoiceNumber') {
        updated.invoiceNumber = value;
        setDirtyRows(prevDirty => {
          const ns = new Set(prevDirty);
          ns.delete(invoiceNumber);
          ns.add(value);
          return ns;
        });
      }

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

    setDirtyRows(prev => {
      const rowToDirty = (rows.find(x => x.invoiceNumber === invoiceNumber)?.isNewRow && field === 'displayInvoiceNumber')
        ? value
        : invoiceNumber;
      return new Set(prev).add(rowToDirty);
    });
  }, [rows, computedRows]);

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

  const handleDocumentUpload = async (file) => {
    setUploadingDoc(true);
    const fd = new FormData();
    fd.append('pdf', file);
    try {
      const { data } = await axios.post(`${API_URL}/fy-details/upload-document`, fd);
      setPageDocuments(prev => [data.doc, ...prev]);
      setSnack({ severity: 'success', msg: 'Document uploaded successfully' });
    } catch {
      setSnack({ severity: 'error', msg: 'Failed to upload Document' });
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleDocumentDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this document?")) return;
    try {
      await axios.delete(`${API_URL}/fy-details/delete-document/${id}`);
      setPageDocuments(prev => prev.filter(d => d._id !== id));
      setSnack({ severity: 'success', msg: 'Document deleted' });
    } catch {
      setSnack({ severity: 'error', msg: 'Failed to delete Document' });
    }
  };

  const saveAllChanges = async () => {
    if (dirtyRows.size === 0 && dirtyGroups.size === 0) return;
    setLoading(true);
    try {
      const rowP = Array.from(dirtyRows).map(inv => {
        const r = rows.find(x => x.invoiceNumber === inv); if (!r) return Promise.resolve();
        return axios.post(`${API_URL}/fy-details/save-row`, {
          billNo: inv,
          editedInvoiceDate: r.invoiceDate,
          editedInvoiceNumber: r.displayInvoiceNumber || r.invoiceNumber,
          editedMonth: r.month,
          editedSite: r.site,
          editedAmount: r.amount,
          billType: r.billType,
          debitReason: r.debitReason,
          damageYear: r.damageYear,
          damageMonth: r.damageMonth,
          damageVehicles: r.damageVehicles || [],
          damageTrips: r.damageTrips || [],
          damageVehicleAmounts: r.damageVehicleAmounts || {},
          slNo: r.slNo
        });
      });
      const payP = Array.from(dirtyGroups).map(gid => {
        const p = payments.find(x => x.id === gid); if (!p) return Promise.resolve();
        return axios.post(`${API_URL}/fy-details/save-group`, {
          id: p.id,
          billNos: p.billNos,
          paymentAmount: num(p.paymentAmount),
          paymentDate: p.paymentDate || '',
          referenceNo: p.referenceNo || '',
          debitAmount: num(p.debitAmount),
          remarks: p.remarks || '',
          tdsProvision: num(p.tdsProvision)
        });
      });
      await Promise.all([...rowP, ...payP]);
      setSnack({ severity: 'success', msg: 'All changes saved successfully!' });
      setDirtyRows(new Set());
      setDirtyGroups(new Set());
      // Refresh to confirm persisted data
      await fetchData();
    } catch (err) {
      console.error('[saveAllChanges] error:', err);
      setSnack({ severity: 'error', msg: 'Failed to save: ' + (err.response?.data?.error || err.message) });
    } finally { setLoading(false); }
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
    } catch (err) {
      setSnack({ severity: 'error', msg: err.response?.data?.error || 'Delete failed' });
    } finally { setLoading(false); }
  };

  const handleExport = () => {
    exportToCsv('FinancialYearDetails.xls', computedRows.map(r => {
      const g = r.groupData || {};
      const groupTotalRecv = g.id ? computedRows.filter(cr => cr.groupId === g.id).reduce((s, x) => s + (x.receivable || 0), 0) : 0;
      const calcDebit = g.id ? num(g.debitAmount) : 0;
      const diff = g.id ? groupTotalRecv - num(g.paymentAmount) - calcDebit - num(g.tdsProvision) : 0;
      return { 'Invoice Date': r.invoiceDate, 'Invoice Number': r.invoiceNumber, 'Shipment Number': r.shipmentNos?.join(', ') || '', 'Month': r.month, 'SITE': r.site, 'BILL': r.billType, 'Amount': r.amount, 'CGST': r.cgst, 'SGST': r.sgst, 'Total Amount': r.totalAmount, 'Tds @2%': r.tds, 'Receivable': r.receivable, 'Payment Amount': g.paymentAmount || 0, 'TDS Provision': g.tdsProvision || 0, 'Difference': diff, 'Payment Date': g.paymentDate || '', 'Reference No': g.referenceNo || '', 'Debit Amount': calcDebit, 'Debit Reasons(Deduction)': r.debitReason || 'None', 'Remarks': g.remarks || '' };
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

    const calcDebit = isGroupStart ? num(gd.debitAmount) : 0;
    const groupDiff = isGroupStart ? groupTotalRecv - num(gd.paymentAmount) - calcDebit - num(gd.tdsProvision) : 0;

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

    const curMonthIndex = getMonthIndexFromDate(r.invoiceDate);
    const prevMonthIndex = ri > 0 ? getMonthIndexFromDate(visibleRows[ri - 1].invoiceDate) : null;
    const showHeader = (ri === 0) || (curMonthIndex !== prevMonthIndex);
    const monthName = MONTH_NAMES_FULL[curMonthIndex] || "Other / Date Unspecified";

    return (
      <React.Fragment key={ri}>
        {showHeader && (
          <tr key={`month-header-${curMonthIndex}-${ri}`}>
            <td colSpan={21} style={{
              background: 'linear-gradient(90deg, #3730a3, #4338ca)',
              color: '#ffffff',
              padding: '10px 16px',
              fontSize: '13px',
              fontWeight: 800,
              fontFamily: 'Inter, sans-serif',
              textAlign: 'left',
              letterSpacing: '0.05em',
              textTransform: 'uppercase'
            }}>
              📅 {monthName}
            </td>
          </tr>
        )}
        <tr>
          {/* Sl No */}
          <td style={td({ textAlign: 'center', color: '#64748b', fontWeight: 600 })}>{page * PAGE_SIZE + ri + 1}</td>

          {/* Select */}
          <td style={td({ textAlign: 'center' })}>
            <Tooltip title={r.isLocked ? "Auto-generated bills cannot be deleted here" : ""}>
              <span>
                <input 
                  type="checkbox" 
                  checked={selectedIds.includes(r.invoiceNumber)} 
                  onChange={() => {
                    if (!r.isLocked) toggleSelect(r.invoiceNumber);
                  }} 
                  disabled={r.isLocked}
                  style={{ cursor: r.isLocked ? 'not-allowed' : 'pointer', width: 14, height: 14, opacity: r.isLocked ? 0.5 : 1 }} 
                />
              </span>
            </Tooltip>
          </td>

          {/* Invoice Date */}
          <td style={td({ textAlign: 'center' })}>
            <input
              type="date"
              value={formatDateForInput(r.invoiceDate)}
              onChange={e => handleRowEdit(r.invoiceNumber, 'invoiceDate', e.target.value)}
              disabled={r.isLocked}
              style={{ ...iStyle, width: 110, textAlign: 'center', fontWeight: 600, color: r.isLocked ? '#94a3b8' : 'inherit' }}
            />
          </td>

          {/* Invoice Number */}
          <td style={td({ textAlign: 'left', position: 'sticky', left: 0, background: bg, zIndex: 4 })}>
            <Box display="flex" alignItems="center" gap={0.5}>
              {r.isLocked && (
                <Tooltip title="Generated from Cement Register - Read Only">
                  <LockIcon sx={{ fontSize: 14, color: '#94a3b8' }} />
                </Tooltip>
              )}
              <input 
                value={r.displayInvoiceNumber || ''} 
                onChange={e => handleRowEdit(r.invoiceNumber, 'displayInvoiceNumber', e.target.value)} 
                disabled={r.isLocked}
                style={{ ...iStyle, fontWeight: 700, width: '100%', color: r.isLocked ? '#94a3b8' : 'inherit' }} 
              />
            </Box>
          </td>

          {/* Shipment Number */}
          <td style={td({ textAlign: 'left', whiteSpace: 'normal', maxWidth: 120 })}>
            {r.shipmentNos?.join(', ') || ''}
          </td>

          {/* Month */}
          <td style={td({ textAlign: 'center' })}>
            <div style={{ display: 'flex', gap: 2 }}>
              <SearchableSelect variant="standard" value={curM} onChange={e => handleMonthYearChange('M', e.target.value)} style={{ ...selStyle, color: r.isLocked ? '#94a3b8' : 'inherit', minWidth: 110 }} disabled={r.isLocked}>
                <option value="">Month</option>
                {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
              </SearchableSelect>
              <SearchableSelect variant="standard" value={curY} onChange={e => handleMonthYearChange('Y', e.target.value)} style={{ ...selStyle, color: r.isLocked ? '#94a3b8' : 'inherit', minWidth: 80 }} disabled={r.isLocked}>
                <option value="">Year</option>
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </SearchableSelect>
            </div>
          </td>

          {/* Site */}
          <td style={td({ textAlign: 'center' })}>
            <SearchableSelect variant="standard"
              value={r.site || 'NVCL'}
              onChange={e => handleRowEdit(r.invoiceNumber, 'site', e.target.value)}
              disabled={r.isLocked}
              style={{ ...selStyle, fontWeight: 600, textAlign: 'center', color: r.isLocked ? '#94a3b8' : 'inherit', minWidth: 100 }}
            >
              <option value="NVCL">NVCL</option>
              <option value="NVL">NVL</option>
            </SearchableSelect>
          </td>

          {/* Bill Type */}
          <td style={td()}>
            <SearchableSelect variant="standard" value={r.billType || 'FREIGHT'} onChange={e => handleRowEdit(r.invoiceNumber, 'billType', e.target.value)} disabled={r.isLocked} style={{ ...selStyle, color: r.isLocked ? '#94a3b8' : 'inherit', minWidth: 130 }}>
              {BILL_TYPES.map(b => <option key={b} value={b}>{b}</option>)}
            </SearchableSelect>
          </td>

          {/* Amount */}
          <td style={td({ textAlign: 'right' })}>
            <input
              type="number"
              value={r.amount || ''}
              onChange={e => handleRowEdit(r.invoiceNumber, 'amount', e.target.value)}
              disabled={r.isLocked}
              style={{ ...iStyle, textAlign: 'right', fontWeight: 600, color: r.isLocked ? '#94a3b8' : 'inherit' }}
              placeholder="0"
            />
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
                <input
                  type="number"
                  value={gd.paymentAmount || ''}
                  onChange={e => handleInlineEdit(gid, 'paymentAmount', e.target.value, gd)}
                  style={{ ...iStyle, textAlign: 'right', fontWeight: 700, color: '#1e293b' }}
                  placeholder="0"
                />
                <label style={{ cursor: 'pointer', textAlign: 'right' }}>
                  <span style={{ fontSize: 9, color: '#6b7280', border: '1px solid #d1d5db', borderRadius: 3, padding: '1px 4px' }}>
                    {uploadingGroup === gid ? 'Uploading…' : gd.paymentProofUrl ? 'Change Proof' : 'Upload Proof'}
                  </span>
                  <input type="file" hidden accept=".pdf,image/*" onChange={e => { if (e.target.files[0]) handleFileUpload(gid, e.target.files[0], gd); }} />
                </label>
                {gd.paymentProofUrl && <a href={gd.paymentProofUrl} target="_blank" rel="noreferrer" style={{ fontSize: 9, color: '#3b82f6', textAlign: 'right' }}>View Proof</a>}
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
            <td style={td({ background: '#fdf2f8' })} rowSpan={rowSpan}>
              <input
                type="number"
                value={gd.debitAmount || ''}
                onChange={e => handleInlineEdit(gid, 'debitAmount', e.target.value, gd)}
                style={{ ...iStyle, textAlign: 'right', fontWeight: 700, color: '#0f172a' }}
                placeholder="0"
              />
            </td>
          )}

          {/* Debit Reasons (per row) */}
          <td style={td()}>
            <SearchableSelect variant="standard" value={r.debitReason || 'None'} onChange={e => handleRowEdit(r.invoiceNumber, 'debitReason', e.target.value)} style={{ ...selStyle, minWidth: 200 }}>
              {DEBIT_REASONS.map(d => <option key={d} value={d}>{d}</option>)}
            </SearchableSelect>
          </td>

          {/* Remarks */}
          {(!gid || isGroupStart) && (
            <td style={td({ background: '#fdf2f8' })} rowSpan={rowSpan}>
              <textarea value={gd.remarks || ''} onChange={e => handleInlineEdit(gid, 'remarks', e.target.value, gd)} style={{ ...iStyle, resize: 'vertical', minHeight: '36px', fontFamily: 'inherit' }} />
            </td>
          )}
        </tr>
      </React.Fragment>
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
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#f4f7f9',  }}>

      {/* Header */}
      <Box sx={{ p: 2, bgcolor: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <IconButton onClick={onBack} size="small" sx={{ bgcolor: '#ede9fe' }}>
          <ArrowBackIcon fontSize="small" sx={{ color: '#6d28d9' }} />
        </IconButton>
        <Box>
          <Typography variant="h6" fontWeight={900} sx={{ color: '#0f172a', lineHeight: 1.2 }}>
            Bill Register
          </Typography>
          <Typography variant="caption" sx={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: 0.5 }}>
            FY
            <SearchableSelect variant="standard"
              value={selYear}
              onChange={e => setSelYear(e.target.value)}
              sx={{ minWidth: 120 }}
              style={{
                border: 'none', outline: 'none', background: '#f1f5f9',
                fontWeight: 700, color: '#4f46e5', cursor: 'pointer',
                fontFamily: 'Inter, sans-serif', fontSize: '12px',
                borderRadius: '4px', marginLeft: '4px'
              }}
            >
              <option value="2024-2025">2024-25</option>
              <option value="2025-2026">2025-26</option>
              <option value="2026-2027">2026-27</option>
              <option value="2027-2028">2027-28</option>
              <option value="2028-2029">2028-29</option>
            </SearchableSelect>
          </Typography>
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

        {/* ── Month Filter Tabs ── */}
        <Box sx={{ display: 'flex', gap: 0.5, bgcolor: '#f1f5f9', borderRadius: '10px', p: '3px' }}>
          <SearchableSelect variant="standard"
            value={selectedMonth}
            onChange={e => { setSelectedMonth(e.target.value); setPage(0); }}
            style={{
              minWidth: '120px',
              border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: 13, fontFamily: 'Inter,sans-serif',
              background: selectedMonth !== 'All' ? '#4f46e5' : 'transparent',
              color: selectedMonth !== 'All' ? '#fff' : '#64748b',
              outline: 'none', appearance: 'none'
            }}
          >
            <option value="All" style={{ color: '#000' }}>All Months</option>
            {MONTHS_LIST.map(m => (
              <option key={m.value} value={String(m.value)} style={{ color: '#000' }}>{m.label}</option>
            ))}
          </SearchableSelect>
        </Box>

        <Box sx={{ ml: 'auto', display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <Typography variant="caption" color="text.secondary">{filteredRows.length} records</Typography>

          <Button variant="outlined" color="primary" size="small" onClick={handleAddRow} sx={{ fontWeight: 'bold', borderRadius: 2, px: 2 }}>
            + Add Row
          </Button>

          <Button
            variant="contained"
            size="small"
            onClick={() => setDashboardOpen(true)}
            sx={{
              fontWeight: 800,
              borderRadius: 2,
              px: 2,
              background: 'linear-gradient(135deg, #4f46e5, #4338ca)',
              color: '#ffffff',
              boxShadow: '0 4px 6px -1px rgba(79, 70, 229, 0.2)',
              '&:hover': {
                background: 'linear-gradient(135deg, #4338ca, #3730a3)'
              }
            }}
          >
            💳 Payment Status Dashboard
          </Button>

          <Button variant="outlined" color="primary" size="small" onClick={() => setDocModalOpen(true)} sx={{ fontWeight: 'bold' }}>
            Upload PDF {pageDocuments.length > 0 && `(${pageDocuments.length})`}
          </Button>

          <Button
            variant="contained"
            startIcon={loading ? <CircularProgress size={13} color="inherit" /> : <SaveIcon />}
            onClick={saveAllChanges}
            disabled={(dirtyRows.size === 0 && dirtyGroups.size === 0) || loading}
            sx={{
              fontWeight: 800,
              borderRadius: 2,
              px: 2.5,
              background: (dirtyRows.size > 0 || dirtyGroups.size > 0)
                ? 'linear-gradient(135deg,#10b981,#059669)'
                : '#cbd5e1',
              opacity: (dirtyRows.size === 0 && dirtyGroups.size === 0) ? 0.5 : 1,
              filter: (dirtyRows.size === 0 && dirtyGroups.size === 0) ? 'blur(0.5px)' : 'none',
              transition: 'all 0.2s ease-in-out',
              '&:hover': {
                background: (dirtyRows.size > 0 || dirtyGroups.size > 0)
                  ? 'linear-gradient(135deg,#059669,#047857)'
                  : '#cbd5e1'
              }
            }}
          >
            {loading ? 'Saving...' : `Save Details${(dirtyRows.size + dirtyGroups.size) > 0 ? ` (${dirtyRows.size + dirtyGroups.size})` : ''}`}
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
            <table style={{ borderCollapse: 'collapse', whiteSpace: 'normal', fontFamily: 'Inter,sans-serif', fontSize: 12, width: 'max-content' }}>
              <thead>
                <tr>
                  <th style={thStyle({ minWidth: 40 })}>Sl No</th>
                  <th style={thStyle({ minWidth: 50 })}>Select</th>
                  <th style={thStyle({ minWidth: 120 })}>Invoice Date</th>
                  <th style={thStyle({ minWidth: 170, position: 'sticky', left: 0, zIndex: 12 })}>Invoice Number</th>
                  <th style={thStyle({ minWidth: 150 })}>Shipment Number</th>
                  <th style={thStyle({ minWidth: 220 })}>Month</th>
                  <th style={thStyle({ minWidth: 140 })}>SITE</th>
                  <th style={thStyle({ minWidth: 160 })}>BILL</th>
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
                  <th style={thStyle({ minWidth: 100, background: '#6b21a8' })}>Reference No</th>
                  <th style={thStyle({ minWidth: 110, background: '#6b21a8' })}>Debit Amount</th>
                  <th style={thStyle({ minWidth: 240 })}>Debit Reasons(Deduction)</th>
                  <th style={thStyle({ minWidth: 350, background: '#6b21a8' })}>Remarks</th>
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
          <TextField label="Remarks" fullWidth multiline rows={3} value={paymentForm.remarks} onChange={e => setPaymentForm({ ...paymentForm, remarks: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={clearSelectionFromGroup} color="error" sx={{ mr: 'auto' }}>Clear Grouping</Button>
          <Button onClick={() => setPaymentModalOpen(false)}>Cancel</Button>
          <Button onClick={saveGroup} variant="contained">Save Linked Payment</Button>
        </DialogActions>
      </Dialog>

      {/* Document Manager Modal */}
      <Dialog open={docModalOpen} onClose={() => setDocModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Manage Bill Documents
          {uploadingDoc ? (
            <CircularProgress size={24} />
          ) : (
            <label style={{ cursor: 'pointer' }}>
              <Button component="span" variant="contained" color="primary" size="small" sx={{ fontWeight: 'bold' }}>
                + Upload PDF
              </Button>
              <input type="file" hidden accept=".pdf" onChange={e => { if (e.target.files[0]) handleDocumentUpload(e.target.files[0]); }} />
            </label>
          )}
        </DialogTitle>
        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {pageDocuments.length === 0 ? (
            <Typography variant="body2" color="text.secondary" textAlign="center" py={4}>
              No documents uploaded yet.
            </Typography>
          ) : (
            pageDocuments.map(doc => (
              <Box key={doc._id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1.5, border: '1px solid #e2e8f0', borderRadius: 2, bgcolor: '#f8fafc' }}>
                <Box>
                  <Typography variant="body2" fontWeight={600} sx={{ wordBreak: 'break-all' }}>
                    {doc.fileName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {doc.createdAt ? new Date(doc.createdAt).toLocaleString() : 'Uploaded just now'}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button size="small" variant="outlined" onClick={() => window.open(doc.fileUrl, '_blank')}>
                    View
                  </Button>
                  <Button size="small" variant="outlined" color="error" onClick={() => handleDocumentDelete(doc._id)}>
                    Delete
                  </Button>
                </Box>
              </Box>
            ))
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDocModalOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={damageModalOpen} onClose={() => setDamageModalOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 'bold' }}>{damageTarget?.reason || 'Damage / Shortage'} Details</DialogTitle>
        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Box>
            <Typography variant="body2" fontWeight={600} mb={1}>1. Select Financial Year</Typography>
            <SearchableSelect variant="standard" value={damageYear} onChange={handleDamageYearChange} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}>
              <option value="">Select Financial Year</option>
              {FY_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
            </SearchableSelect>
          </Box>
          <Box>
            <Typography variant="body2" fontWeight={600} mb={1}>2. Select Month</Typography>
            <SearchableSelect variant="standard" value={damageMonth} onChange={e => fetchDamageVehicles(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }} disabled={!damageYear}>
              <option value="">Select Month</option>
              {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
            </SearchableSelect>
          </Box>
          <Box>
            <Typography variant="body2" fontWeight={600} mb={1}>3. Select Vehicle(s)</Typography>
            <Box sx={{ maxHeight: 150, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 2, p: 1, bgcolor: damageMonth ? '#fff' : '#f8fafc' }}>
              {!damageYear ? (
                <Typography variant="body2" color="text.secondary" textAlign="center">Select a financial year first.</Typography>
              ) : !damageMonth ? (
                <Typography variant="body2" color="text.secondary" textAlign="center">Select a month first.</Typography>
              ) : damageVehicles.length === 0 ? (
                <Typography variant="body2" color="text.secondary" textAlign="center">No vehicles found.</Typography>
              ) : (
                damageVehicles.map((v) => (
                  <Box
                    key={v}
                    onClick={() => toggleDamageVehicle(v)}
                    sx={{ p: 1, mb: 0.5, borderRadius: 1, cursor: 'pointer', bgcolor: damageSelectedVehicles.includes(v) ? '#e0e7ff' : '#fff', '&:hover': { bgcolor: '#f1f5f9' }, display: 'flex', alignItems: 'center', gap: 1 }}
                  >
                    <input type="checkbox" checked={damageSelectedVehicles.includes(v)} readOnly style={{ cursor: 'pointer' }} />
                    <Typography variant="body2">{v}</Typography>
                  </Box>
                ))
              )}
            </Box>
          </Box>
          <Box>
            <Typography variant="body2" fontWeight={600} mb={1}>4. Select Trip(s)</Typography>
            <Box sx={{ maxHeight: 340, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 2, bgcolor: '#fafafa' }}>
              {damageTrips.length === 0 ? (
                <Typography variant="body2" color="text.secondary" textAlign="center" py={3}>
                  {damageSelectedVehicles.length > 0 ? 'No trips found for selected vehicle(s).' : 'Select at least one vehicle to see trips.'}
                </Typography>
              ) : (() => {
                // ── Build date-sorted grouping ───────────────────────────────
                const parseDate = (dStr) => {
                  if (!dStr) return 0;
                  const p = dStr.split(/[-/.]/);
                  if (p.length >= 3) { let y = parseInt(p[2]); if (y < 100) y += 2000; return new Date(y, parseInt(p[1]) - 1, parseInt(p[0])).getTime(); }
                  return 0;
                };
                const fmtDate = (dStr) => {
                  try {
                    const p = dStr.split(/[-/.]/);
                    if (p.length === 3) {
                      const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                      let y = parseInt(p[2]); if (y < 100) y += 2000;
                      return `${p[0]} ${M[parseInt(p[1]) - 1]} ${y}`;
                    }
                  } catch (_) { }
                  return dStr;
                };

                // Group by date
                const tripsByDate = {};
                [...damageTrips]
                  .sort((a, b) => parseDate(a.tripDate) - parseDate(b.tripDate))
                  .forEach(t => {
                    const k = t.tripDate || 'Unknown';
                    if (!tripsByDate[k]) tripsByDate[k] = [];
                    tripsByDate[k].push(t);
                  });

                const isSel = (t) => !!damageSelectedTrips.find(s => s.invoiceNo === t.invoiceNo && s.vehicle === t.vehicle);

                const toggleGroup = (trips) => {
                  const allSel = trips.every(t => isSel(t));
                  if (allSel) {
                    setDamageSelectedTrips(prev => prev.filter(s => !trips.find(t => t.invoiceNo === s.invoiceNo && t.vehicle === s.vehicle)));
                  } else {
                    const missing = trips.filter(t => !isSel(t));
                    setDamageSelectedTrips(prev => [...prev, ...missing]);
                  }
                };

                const dateEntries = Object.entries(tripsByDate);

                return dateEntries.map(([dateStr, tripsForDate], groupIdx) => {
                  const allSel = tripsForDate.every(t => isSel(t));
                  const someSel = tripsForDate.some(t => isSel(t));
                  // Sequential trip-occasion number (1st date = Trip 1, etc.)
                  const tripOccasion = groupIdx + 1;

                  return (
                    <Box key={dateStr} sx={{ borderBottom: groupIdx < dateEntries.length - 1 ? '2px solid #e2e8f0' : 'none' }}>
                      {/* ── Date + Trip Occasion Header ─── */}
                      <Box
                        sx={{
                          display: 'flex', alignItems: 'center', gap: 1.5,
                          px: 2, py: 1.25,
                          bgcolor: allSel ? '#e0e7ff' : someSel ? '#f0f4ff' : '#f1f5f9',
                          cursor: 'pointer', '&:hover': { bgcolor: '#e4e8fd' },
                          borderBottom: '1px solid #e2e8f0', userSelect: 'none'
                        }}
                        onClick={() => toggleGroup(tripsForDate)}
                      >
                        <input
                          type="checkbox" checked={allSel} readOnly
                          ref={el => { if (el) el.indeterminate = !allSel && someSel; }}
                          style={{ cursor: 'pointer', width: 14, height: 14, accentColor: '#4f46e5' }}
                        />
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                          <Typography sx={{ fontSize: 13, fontWeight: 800, color: '#3730a3' }}>
                            📅 {fmtDate(dateStr)}
                          </Typography>
                          <Box sx={{
                            px: 1, py: 0.25, borderRadius: '999px',
                            bgcolor: allSel ? '#4f46e5' : '#6366f140',
                            color: allSel ? '#fff' : '#4f46e5',
                            fontSize: 10, fontWeight: 700, lineHeight: 1.6,
                            letterSpacing: 0.5
                          }}>
                            Trip {tripOccasion}
                          </Box>
                        </Box>
                        <Typography sx={{ fontSize: 10, color: '#6b7280', fontWeight: 500 }}>
                          {tripsForDate.length} vehicle{tripsForDate.length !== 1 ? 's' : ''}
                          {someSel ? ` · ${tripsForDate.filter(t => isSel(t)).length} selected` : ''}
                        </Typography>
                      </Box>

                      {/* ── Vehicle rows table ─── */}
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                        <thead>
                          <tr style={{ background: '#f8fafc' }}>
                            <th style={{ width: 30, padding: '4px 8px', borderBottom: '1px solid #e2e8f0' }}></th>
                            <th style={{ padding: '4px 8px', borderBottom: '1px solid #e2e8f0', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Vehicle No.</th>
                            <th style={{ padding: '4px 8px', borderBottom: '1px solid #e2e8f0', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Trip #</th>
                            <th style={{ padding: '4px 8px', borderBottom: '1px solid #e2e8f0', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Invoice No.</th>
                            <th style={{ padding: '4px 8px', borderBottom: '1px solid #e2e8f0', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Destination</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tripsForDate.map((t, ri) => {
                            const selected = isSel(t);
                            return (
                              <tr
                                key={`${t.vehicle}-${t.invoiceNo}`}
                                onClick={() => {
                                  if (selected) setDamageSelectedTrips(prev => prev.filter(s => !(s.invoiceNo === t.invoiceNo && s.vehicle === t.vehicle)));
                                  else setDamageSelectedTrips(prev => [...prev, t]);
                                }}
                                style={{ background: selected ? '#eef2ff' : ri % 2 === 0 ? '#fff' : '#fafafa', cursor: 'pointer' }}
                                onMouseEnter={e => { if (!selected) e.currentTarget.style.background = '#f0f4ff'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = selected ? '#eef2ff' : ri % 2 === 0 ? '#fff' : '#fafafa'; }}
                              >
                                <td style={{ padding: '5px 8px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>
                                  <input type="checkbox" checked={selected} readOnly style={{ cursor: 'pointer', accentColor: '#4f46e5' }} />
                                </td>
                                <td style={{ padding: '5px 8px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, color: '#1e293b', whiteSpace: 'normal' }}>
                                  {t.vehicle}
                                </td>
                                <td style={{ padding: '5px 8px', borderBottom: '1px solid #f1f5f9', textAlign: 'center' }}>
                                  <span style={{ background: '#e0e7ff', color: '#3730a3', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>
                                    #{t.tripNumber}
                                  </span>
                                </td>
                                <td style={{ padding: '5px 8px', borderBottom: '1px solid #f1f5f9', color: '#4f46e5', fontFamily: 'monospace', fontSize: 10.5, fontWeight: 500 }}>
                                  {t.invoiceNo}
                                </td>
                                <td style={{ padding: '5px 8px', borderBottom: '1px solid #f1f5f9', color: '#334155', fontWeight: 600, maxWidth: 180 , whiteSpace: 'normal' }}>
                                  <span style={{ color: '#94a3b8', fontWeight: 400 }}>{t.plant} </span>
                                  <span style={{ color: '#cbd5e1' }}>→ </span>
                                  {t.destination}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </Box>
                  );
                });
              })()}
            </Box>
            {/* Summary bar */}
            {damageTrips.length > 0 && (
              <Box sx={{ mt: 0.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="caption" color="text.secondary">
                  {damageSelectedTrips.length} of {damageTrips.length} trip-rows selected
                </Typography>
                {damageSelectedTrips.length > 0 && (
                  <Typography variant="caption" sx={{ color: '#4f46e5', cursor: 'pointer', fontWeight: 600, '&:hover': { textDecoration: 'underline' } }} onClick={() => setDamageSelectedTrips([])}>
                    Clear all
                  </Typography>
                )}
              </Box>
            )}
          </Box>
          {damageSelectedTrips.length > 0 && (
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" fontWeight={600}>
                  5. Allocate Amount
                  <Typography component="span" variant="caption" color="text.secondary" fontWeight={400} sx={{ ml: 1 }}>
                    Total Debit: ₹{Math.abs(num(damageTarget?.debitAmount || 0))}
                  </Typography>
                </Typography>
                {(() => {
                  const target = Math.abs(num(damageTarget?.debitAmount || 0));
                  const alloc = damageSelectedTrips.reduce((s, t) => s + num(damageVehicleAmounts[t.invoiceNo] || 0), 0);
                  if (target === 0) return null;
                  const remaining = target - alloc;
                  return (
                    <Typography variant="caption" sx={{ fontWeight: 600, color: remaining === 0 ? '#16a34a' : remaining > 0 ? '#d97706' : '#dc2626', fontFamily: 'monospace' }}>
                      {remaining === 0 ? '✓ Fully allocated' : remaining > 0 ? `₹${remaining} remaining` : `₹${Math.abs(remaining)} over-allocated`}
                    </Typography>
                  );
                })()}
              </Box>

              {/* Per-trip-row amount table */}
              <Box sx={{ border: '1px solid #e2e8f0', borderRadius: 2,  }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: '#475569', borderBottom: '1px solid #e2e8f0', width: '30%' }}>Vehicle No.</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 700, color: '#475569', borderBottom: '1px solid #e2e8f0', width: '30%' }}>Trip Details</th>
                      <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#475569', borderBottom: '1px solid #e2e8f0', width: '40%' }}>Allocate Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...damageSelectedTrips]
                      .sort((a, b) => a.vehicle.localeCompare(b.vehicle) || a.tripNumber - b.tripNumber)
                      .map((t, idx) => (
                        <tr key={`${t.invoiceNo}-${idx}`} style={{ background: idx % 2 === 0 ? '#fff' : '#f9fafb' }}>
                          <td style={{ padding: '7px 10px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, color: '#1e293b' }}>
                            {t.vehicle}
                          </td>
                          <td style={{ padding: '7px 10px', borderBottom: '1px solid #f1f5f9', textAlign: 'center' }}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.25 }}>
                              <span style={{ background: '#e0e7ff', color: '#3730a3', borderRadius: 4, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>
                                Trip #{t.tripNumber}
                              </span>
                              <span style={{ fontSize: 9.5, color: '#94a3b8', fontFamily: 'monospace' }}>{t.tripDate}</span>
                            </Box>
                          </td>
                          <td style={{ padding: '7px 10px', borderBottom: '1px solid #f1f5f9', textAlign: 'right' }}>
                            <input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={damageVehicleAmounts[t.invoiceNo] || ''}
                              onChange={e => setDamageVehicleAmounts(prev => ({ ...prev, [t.invoiceNo]: e.target.value }))}
                              style={{
                                width: 110, padding: '4px 8px', fontSize: 12, textAlign: 'right',
                                border: '1.5px solid #e2e8f0', borderRadius: 6, outline: 'none',
                                fontFamily: 'monospace', fontWeight: 600, color: '#1e293b',
                                background: damageVehicleAmounts[t.invoiceNo] ? '#f0f9ff' : '#fff',
                              }}
                              onFocus={e => { e.target.style.borderColor = '#6366f1'; e.target.style.boxShadow = '0 0 0 2px rgba(99,102,241,0.15)'; }}
                              onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
                            />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                  {/* Totals row */}
                  <tfoot>
                    <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                      <td colSpan={2} style={{ padding: '6px 10px', fontWeight: 700, color: '#475569', fontSize: 11 }}>Total Allocated</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 800, fontFamily: 'monospace', fontSize: 13 }}>
                        {(() => {
                          const target = Math.abs(num(damageTarget?.debitAmount || 0));
                          const alloc = damageSelectedTrips.reduce((s, t) => s + num(damageVehicleAmounts[t.invoiceNo] || 0), 0);
                          return (
                            <span style={{ color: alloc === target ? '#16a34a' : alloc > target ? '#dc2626' : '#d97706' }}>
                              ₹{alloc}
                              {target > 0 && <span style={{ fontSize: 10, fontWeight: 400, color: '#94a3b8', marginLeft: 4 }}>/ ₹{target}</span>}
                            </span>
                          );
                        })()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </Box>
            </Box>
          )}

          {/* ── Remarks field – always visible once trips are selected ── */}
          {damageSelectedTrips.length > 0 && (
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 0.75 }}>
                <Typography variant="body2" fontWeight={600}>
                  6. Remarks <Typography component="span" variant="caption" color="text.secondary" fontWeight={400}>(optional)</Typography>
                </Typography>
                <Typography variant="caption" sx={{ color: damageManualRemarks.length > 450 ? '#ef4444' : '#94a3b8', fontFamily: 'monospace', fontSize: 10 }}>
                  {damageManualRemarks.length}/500
                </Typography>
              </Box>
              <Box sx={{ position: 'relative' }}>
                <textarea
                  value={damageManualRemarks}
                  onChange={(e) => {
                    if (e.target.value.length <= 500) setDamageManualRemarks(e.target.value);
                  }}
                  placeholder="Enter any additional notes, observations, or context about this deduction…"
                  maxLength={500}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: 13,
                    fontFamily: 'Inter, system-ui, sans-serif',
                    lineHeight: 1.6,
                    color: '#1e293b',
                    background: '#fff',
                    border: '1.5px solid #e2e8f0',
                    borderRadius: 8,
                    outline: 'none',
                    resize: 'vertical',
                    minHeight: 80,
                    maxHeight: 200,
                    boxSizing: 'border-box',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                    boxShadow: 'none',
                  }}
                  onFocus={e => {
                    e.target.style.borderColor = '#6366f1';
                    e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)';
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = '#e2e8f0';
                    e.target.style.boxShadow = 'none';
                  }}
                />
                {damageManualRemarks && (
                  <button
                    onClick={() => setDamageManualRemarks('')}
                    style={{
                      position: 'absolute', top: 8, right: 8,
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#94a3b8', fontSize: 14, lineHeight: 1, padding: '2px 4px',
                      borderRadius: 4,
                    }}
                    title="Clear remarks"
                  >
                    ✕
                  </button>
                )}
              </Box>
              {damageManualRemarks.trim() && (
                <Typography variant="caption" sx={{ color: '#6b7280', mt: 0.5, display: 'block' }}>
                  This note will be appended to the auto-generated remarks when saved.
                </Typography>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDamageModalOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleDamageSubmit}
            disabled={
              loading ||
              damageSelectedTrips.length === 0
            }
          >
            {loading ? 'Saving…' : 'Save Details'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Payment Status Dashboard Modal ── */}
      <Dialog
        open={dashboardOpen}
        onClose={() => setDashboardOpen(false)}
        maxWidth="xl"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '24px',
            bgcolor: '#ffffff',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            maxHeight: '90vh',
            fontFamily: 'Inter, sans-serif',
          }
        }}
      >
        <DialogTitle sx={{ p: 3, borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: '#fafafa' }}>
          <Box display="flex" alignItems="center" gap={1.5}>
            <span style={{ fontSize: '24px' }}>💳</span>
            <Typography variant="h6" fontWeight={800} color="#0f172a">
              Payment Status Dashboard
            </Typography>
          </Box>
          <Box display="flex" alignItems="center" gap={2}>
            {/* Year Selector */}
            <SearchableSelect variant="standard"
              value={selYear}
              onChange={(e) => setSelYear(e.target.value)}
              style={{
                padding: '8px 16px',
                borderRadius: '12px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                fontWeight: 700,
                color: '#334155',
                outline: 'none',
                cursor: 'pointer',
                background: '#fff'
              }}
            >
              <option value="2024-2025">FY 2024–25</option>
              <option value="2025-2026">FY 2025–26</option>
              <option value="2026-2027">FY 2026–27</option>
              <option value="2027-2028">FY 2027–28</option>
            </SearchableSelect>

            {/* Month Selector */}
            <SearchableSelect variant="standard"
              value={dashboardM}
              onChange={(e) => setDashboardM(Number(e.target.value))}
              style={{
                padding: '8px 16px',
                borderRadius: '12px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                fontWeight: 700,
                color: '#334155',
                outline: 'none',
                cursor: 'pointer',
                background: '#fff'
              }}
            >
              {MONTHS_LIST.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </SearchableSelect>

            <IconButton onClick={() => setDashboardOpen(false)} sx={{ bgcolor: '#f1f5f9', '&:hover': { bgcolor: '#e2e8f0' } }}>
              ✕
            </IconButton>
          </Box>
        </DialogTitle>

        <DialogContent sx={{ p: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Summary Cards */}
          <Box display="grid" gridTemplateColumns="repeat(auto-fit, minmax(220px, 1fr))" gap={3}>
            {/* Card 1: Total Bills */}
            <Box sx={{
              p: 3, borderRadius: '16px', bgcolor: '#f8fafc', border: '1px solid #f1f5f9',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', gap: 0.5
            }}>
              <Typography variant="caption" fontWeight={700} color="#64748b" sx={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Bills</Typography>
              <Typography variant="h4" fontWeight={900} color="#0f172a">{dashboardStats.totalBills}</Typography>
            </Box>

            {/* Card 2: Paid Bills */}
            <Box sx={{
              p: 3, borderRadius: '16px', bgcolor: '#f0fdf4', border: '1px solid #dcfce7',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', gap: 0.5
            }}>
              <Typography variant="caption" fontWeight={700} color="#166534" sx={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>Paid Bills</Typography>
              <Typography variant="h4" fontWeight={900} color="#15803d">{dashboardStats.paidCount}</Typography>
            </Box>

            {/* Card 3: Pending Bills */}
            <Box sx={{
              p: 3, borderRadius: '16px', bgcolor: '#fef2f2', border: '1px solid #fee2e2',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', gap: 0.5
            }}>
              <Typography variant="caption" fontWeight={700} color="#991b1b" sx={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pending Bills</Typography>
              <Typography variant="h4" fontWeight={900} color="#b91c1c">{dashboardStats.pendingCount}</Typography>
            </Box>

            {/* Card 4: Outstanding Amount */}
            <Box sx={{
              p: 3, borderRadius: '16px', bgcolor: '#fffbeb', border: '1px solid #fef3c7',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', gap: 0.5
            }}>
              <Typography variant="caption" fontWeight={700} color="#92400e" sx={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>Outstanding Amount</Typography>
              <Typography variant="h4" fontWeight={900} color="#d97706">
                ₹{dashboardStats.totalOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Typography>
            </Box>
          </Box>

          {/* List Table Container */}
          <Box sx={{
            border: '1px solid #e2e8f0', borderRadius: '16px', display: 'flex', flexDirection: 'column',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)'
          }}>
            <Box sx={{ maxHeight: '480px', overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontFamily: 'Inter, sans-serif' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 10 }}>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', background: '#f8fafc' }}>Bill Number</th>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', background: '#f8fafc' }}>Invoice Number</th>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', background: '#f8fafc' }}>Invoice Date</th>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', background: '#f8fafc' }}>Party Name</th>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', background: '#f8fafc' }}>Vehicle Number</th>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', textAlign: 'right', background: '#f8fafc' }}>Bill Amount</th>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', textAlign: 'right', background: '#f8fafc' }}>Amount Paid</th>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', textAlign: 'right', background: '#f8fafc' }}>Outstanding</th>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', textAlign: 'center', background: '#f8fafc' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardDetails.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ padding: '40px 16px', textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>
                        No bills found for the selected Month and Financial Year.
                      </td>
                    </tr>
                  ) : (
                    dashboardDetails.map((b, idx) => (
                      <tr
                        key={idx}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          background: idx % 2 === 0 ? '#ffffff' : '#fafafa',
                          transition: 'background 0.15s',
                        }}
                      >
                        <td style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>{b.billNo}</td>
                        <td style={{ padding: '14px 16px', fontSize: '12px', color: '#334155', maxWidth: '200px' , whiteSpace: 'normal' }} title={b.invoiceNo}>{b.invoiceNo}</td>
                        <td style={{ padding: '14px 16px', fontSize: '12px', color: '#475569', fontWeight: 600 }}>
                          {b.invoiceDate ? (() => {
                            const p = b.invoiceDate.split('-');
                            return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : b.invoiceDate;
                          })() : '—'}
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: '12px', color: '#334155' }}>{b.partyName}</td>
                        <td style={{ padding: '14px 16px', fontSize: '12px', color: '#475569', fontFamily: 'monospace' }}>{b.vehicleNo}</td>
                        <td style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, color: '#0f172a', textAlign: 'right' }}>₹{b.billAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, color: '#15803d', textAlign: 'right' }}>₹{b.amountPaid.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, color: b.outstanding > 0 ? '#b91c1c' : '#475569', textAlign: 'right' }}>
                          ₹{b.outstanding.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                          {b.status === 'Paid' ? (
                            <Chip
                              label="Paid"
                              size="small"
                              sx={{
                                height: 22, fontSize: '10px', fontWeight: 800,
                                bgcolor: '#dcfce7', color: '#166534',
                                border: '1px solid #bbf7d0', px: 1
                              }}
                            />
                          ) : (
                            <Chip
                              label="Pending"
                              size="small"
                              sx={{
                                height: 22, fontSize: '10px', fontWeight: 800,
                                bgcolor: '#fee2e2', color: '#991b1b',
                                border: '1px solid #fecaca', px: 1
                              }}
                            />
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 4, py: 2.5, borderTop: '1px solid #f1f5f9', bgcolor: '#fafafa' }}>
          <Button onClick={() => setDashboardOpen(false)} variant="contained" sx={{ bgcolor: '#0f172a', '&:hover': { bgcolor: '#1e293b' }, fontWeight: 700, px: 3, borderRadius: 2 }}>
            Close Dashboard
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack(null)}>
        {snack && <Alert severity={snack.severity}>{snack.msg}</Alert>}
      </Snackbar>
    </Box>
  );
}
