import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Box, Typography, IconButton, Button, CircularProgress,
  Snackbar, Alert, Grid, Card, CardContent
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PrintIcon from '@mui/icons-material/Print';
import SaveIcon from '@mui/icons-material/Save';
import axios from 'axios';
import SearchableSelect from '../components/SearchableSelect';
import { useTableNavigation } from '../hooks/useTableNavigation';
import { useShortcut } from '../context/ShortcutContext';

const API_URL = import.meta.env.VITE_API_URL;
const parseNum = (val) => parseFloat(String(val || 0).replace(/,/g, '')) || 0;
const round2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

// Formatting helpers
const f = (val) => {
  if (!val || isNaN(val) || val === 0) return '-';
  return Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const fq = (val) => {
  if (!val || isNaN(val) || val === 0) return '-';
  return Number(val).toLocaleString('en-IN');
};

// Base column definitions — wheel-incentive columns are inserted dynamically
// per owner based on their vehicle portfolio (show6WHColumn / show10WHColumn props).
const BASE_FREIGHT_COLUMNS = [
  { key: 'SL NO', label: 'SL NO', width: 50, type: 'auto' },
  { key: 'LOADING DATE', label: 'LOADING\nDATE', width: 90, type: 'manual', isDate: true },
  { key: 'SITE', label: 'SITE', width: 80, type: 'manual' },
  { key: 'CHALLAN STATUS', label: 'CHALLAN\nSTATUS', width: 100, type: 'dropdown', options: ['STAMP', 'NON STAMP', 'BILLED'] },
  { key: 'DESTINATION', label: 'DESTINATION', width: 120, type: 'manual' },
  { key: 'PARTY NAME', label: 'PARTY NAME', width: 120, type: 'manual' },
  { key: 'MT', label: 'MT', width: 70, type: 'manual', isNumeric: true },
  { key: 'PARTY RATE', label: 'FREIGHT\n/MT', width: 80, type: 'manual', isNumeric: true },
  { key: 'AMOUNT', label: 'AMOUNT', width: 100, type: 'manual', isNumeric: true },
  { key: 'ADVANCE', label: 'LOADING\nADVANCE', width: 90, type: 'manual', isNumeric: true },
  { key: 'HSD (LTR)', label: 'HSD\n(LTR)', width: 70, type: 'manual', isNumeric: true },
  { key: 'HSD RATE', label: 'HSD\nRATE', width: 70, type: 'manual', isNumeric: true },
  { key: 'HSD AMOUNT', label: 'HSD\nAMOUNT', width: 90, type: 'manual', isNumeric: true },
  { key: 'BASIC AMOUNT', label: 'BASIC\nAMOUNT', width: 100, type: 'calc', isNumeric: true },
  { key: 'INCENTIVE', label: 'INCENTIVE\nDEDICATED', width: 90, type: 'manual', isNumeric: true },
  // ↑ Wheel-incentive columns are inserted HERE dynamically (see buildActiveColumns)
  { key: 'EXTRA UNLOADING', label: 'EXTRA\nUNLOADING', width: 90, type: 'manual', isNumeric: true },
  { key: 'TOLL', label: 'TOLL', width: 80, type: 'manual', isNumeric: true },
  { key: 'NET REALIZATION', label: 'NET\nREALIZATION', width: 110, type: 'calc', isNumeric: true },
];

// Column descriptors for the two optional wheel-incentive columns
const COL_10WH = { key: '10WH_INCENTIVE', label: '10WH extra\n8.5% incentive', width: 110, type: 'readonly', isNumeric: true };
const COL_6WH = { key: '6WH_INCENTIVE', label: '6WH extra\n15% incentive', width: 110, type: 'readonly', isNumeric: true };

// Top section (Deductions above NET BALANCE) dropdown options
const TOP_ADJUSTMENT_OPTIONS = [
  { key: 'advance_bank_tf', label: 'Advance bank TF', settingKey: 'advanceBankTF' },
  { key: 'rfid', label: 'RFID charges', settingKey: 'rfid' },
  { key: 'damage_shortage', label: 'Damage/shortage', settingKey: 'damage' },
  { key: 'gps_installation', label: 'GPS installation charges', settingKey: 'gpsDeviceInstallation' },
  { key: 'others', label: 'Others', settingKey: null },
];

/**
 * Build the active column list for a given owner's vehicle portfolio.
 * Wheel-incentive columns are inserted immediately after INCENTIVE DEDICATED.
 */
function buildActiveColumns(show6WH, show10WH) {
  const incentiveIdx = BASE_FREIGHT_COLUMNS.findIndex(c => c.key === 'INCENTIVE');
  const extra = [];
  if (show6WH) extra.push(COL_6WH);
  if (show10WH) extra.push(COL_10WH);
  if (extra.length === 0) return BASE_FREIGHT_COLUMNS;
  return [
    ...BASE_FREIGHT_COLUMNS.slice(0, incentiveIdx + 1),
    ...extra,
    ...BASE_FREIGHT_COLUMNS.slice(incentiveIdx + 1),
  ];
}


// Date helpers
function ddmmyyyyToIso(str) {
  if (!str) return '';
  const m = String(str).match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  return '';
}
function isoToDdmmyyyy(str) {
  if (!str) return '';
  const m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return str;
}

function DatePickerCell({ value, onChange, style }) {
  const isoVal = ddmmyyyyToIso(value);
  return (
    <input
      type="date"
      value={isoVal}
      onChange={e => onChange(isoToDdmmyyyy(e.target.value))}
      style={{
        width: '100%', height: '100%', border: 'none', background: 'transparent',
        fontSize: '11px', padding: '4px 6px', cursor: 'pointer',
        color: isoVal ? '#0f172a' : '#94a3b8', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box'
      }}
      onFocus={e => {
        e.currentTarget.parentElement.style.boxShadow = 'inset 0 0 0 2px #3b82f6';
        e.currentTarget.style.background = '#eff6ff';
      }}
      onBlur={e => {
        e.currentTarget.parentElement.style.boxShadow = '';
        e.currentTarget.style.background = 'transparent';
      }}
    />
  );
}

function EditableCell({ value, onChange, style }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current) {
      ref.current.innerText = value ?? '';
    }
  }, [value]);

  const handleBlur = () => {
    const nv = ref.current?.innerText?.trim() ?? '';
    if (nv !== String(value ?? '').trim()) onChange(nv);
  };

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onBlur={handleBlur}
      style={{
        ...style,
        outline: 'none', cursor: 'text', minHeight: '24px', display: 'flex',
        alignItems: 'center',
        justifyContent: style?.textAlign === 'right' ? 'flex-end' : 'flex-start',
        padding: '4px 6px', boxSizing: 'border-box'
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      onFocus={e => {
        e.currentTarget.style.boxShadow = 'inset 0 0 0 2px #3b82f6';
        e.currentTarget.style.background = '#eff6ff';
      }}
      onBlurCapture={e => {
        e.currentTarget.style.boxShadow = '';
        e.currentTarget.style.background = '';
      }}
    />
  );
}

function CellRenderer({ col, value, isDirty, onChange }) {
  const cellStyle = {
    padding: '6px 8px',
    border: '1px solid #e2e8f0',
    fontSize: '11px',
    color: '#1e293b',
    whiteSpace: 'nowrap',
    lineHeight: 1.4,
    borderRight: isDirty ? '2px solid #f59e0b' : '1px solid #e2e8f0',
    background: isDirty ? 'rgba(254,243,199,0.6)' : 'inherit',
    minWidth: col.width,
    textAlign: col.isNumeric ? 'right' : 'left',
  };

  if (col.type === 'auto') {
    const bg = isDirty ? 'rgba(254,243,199,0.5)' : 'rgba(241,245,249,0.7)';
    return (
      <td style={{ ...cellStyle, background: bg, color: '#1e293b', fontWeight: 400, cursor: 'default' }}>
        {value || ''}
      </td>
    );
  }

  // Read-only computed cell (wheel-type incentive columns)
  if (col.type === 'readonly') {
    const hasValue = value && value !== 0;
    return (
      <td style={{
        ...cellStyle,
        background: hasValue ? 'rgba(236,253,245,0.8)' : 'rgba(248,250,252,0.5)',
        color: hasValue ? '#065f46' : '#94a3b8',
        fontWeight: hasValue ? 700 : 400,
        textAlign: 'right',
        cursor: 'default',
        borderLeft: hasValue ? '2px solid #10b981' : '1px solid #e2e8f0',
      }}>
        {hasValue ? f(value) : '-'}
      </td>
    );
  }

  if (col.type === 'calc') {
    const bg = isDirty ? 'rgba(254,243,199,0.5)' : 'rgba(220,252,231,0.5)';
    return (
      <td style={{ ...cellStyle, padding: 0 }}>
        <EditableCell
          value={value}
          onChange={onChange}
          style={{ ...cellStyle, background: bg, color: '#065f46', fontWeight: 600, width: '100%' }}
        />
      </td>
    );
  }

  if (col.type === 'dropdown') {
    let bgColor = 'inherit';
    if (col.key === 'CHALLAN STATUS') {
      bgColor = value === 'STAMP' ? '#dcfce7' : value === 'NON STAMP' ? '#fee2e2' : 'inherit';
    }
    return (
      <td style={{ ...cellStyle, padding: 0, background: bgColor }}>
        <SearchableSelect
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          variant="standard"
          sx={{
            width: '100%', height: '100%',
            '.MuiInputBase-input': {
              fontSize: '11px', cursor: 'pointer', padding: '4px 5px !important',
              color: value ? '#0f172a' : '#94a3b8', fontWeight: 600
            },
            '.MuiInput-underline:before': { borderBottom: 'none' },
            '.MuiInput-underline:hover:not(.Mui-disabled):before': { borderBottom: 'none' },
            '.MuiInput-underline:after': { borderBottom: 'none' },
            background: 'transparent'
          }}
        >
          <option value="" disabled>(none)</option>
          {(col.options || []).map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </SearchableSelect>
      </td>
    );
  }

  if (col.isDate) {
    return (
      <td style={{ ...cellStyle, padding: 0, background: isDirty ? 'rgba(254,243,199,0.75)' : 'rgba(255,247,237,0.04)' }}>
        <DatePickerCell value={value} onChange={onChange} style={cellStyle} />
      </td>
    );
  }

  return (
    <td style={{ ...cellStyle, padding: 0 }}>
      <EditableCell value={value} onChange={onChange} style={{ ...cellStyle, width: '100%' }} />
    </td>
  );
}

const getCurrentFYAndMonth = () => {
  const currentDate = new Date();
  const currentMonthIndex = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();
  let currentFY;
  if (currentMonthIndex < 3) {
    currentFY = `FY ${currentYear - 1}-${String(currentYear).substring(2)}`;
  } else {
    currentFY = `FY ${currentYear}-${String(currentYear + 1).substring(2)}`;
  }
  const monthNamesArray = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return { fy: currentFY, month: monthNamesArray[currentMonthIndex] };
};

const fyOptions = ['FY 2024-25', 'FY 2025-26', 'FY 2026-27', 'FY 2027-28'];
const monthOptions = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];

export default function PartyReportView({
  partyName, selectedVehicle, ownerDetails, onBack,
  // Dynamic wheel-incentive column flags derived from the owner's full vehicle portfolio
  show6WHColumn = false,
  show10WHColumn = false,
  ownerVehicles = [],
  vehicleWheelMap = {},
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState([]);
  const [localData, setLocalData] = useState({});
  const localDataRef = useRef({});
  const [globalGPS, setGlobalGPS] = useState(0);
  // Full deduction settings (rfid, damage, gpsDeviceInstallation, advanceBankTF, gpsTripCharge)
  const [deductionSettings, setDeductionSettings] = useState({});

  // Manual adjustment rows (fetched from MongoDB, scoped to this owner+vehicle+month context)
  const [adjustmentRows, setAdjustmentRows] = useState([]);
  const [adjLoading, setAdjLoading] = useState(false);
  const [adjSaving, setAdjSaving] = useState(false);

  // Top section (Deductions above NET BALANCE) states
  const [addingTopRow, setAddingTopRow] = useState(false);
  const [selectedTopType, setSelectedTopType] = useState('advance_bank_tf');
  const [pendingTopOthersDesc, setPendingTopOthersDesc] = useState('');
  const [pendingTopOthersAmt, setPendingTopOthersAmt] = useState('');
  const [topSaving, setTopSaving] = useState(false);

  // Bottom section (Manual Additions below NET BALANCE) states
  const [manualReason, setManualReason] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [editingRowId, setEditingRowId] = useState(null);
  const [editingReason, setEditingReason] = useState('');
  const [editingAmount, setEditingAmount] = useState('');

  useEffect(() => {
    localDataRef.current = localData;
  }, [localData]);

  const [snack, setSnack] = useState(null);

  const initialSelection = useMemo(() => getCurrentFYAndMonth(), []);
  const [financialYear, setFinancialYear] = useState(initialSelection.fy);
  const [month, setMonth] = useState(initialSelection.month);

  const tableContainerRef = useRef(null);
  useTableNavigation(tableContainerRef);

  // Build active column set dynamically based on owner's vehicle portfolio wheel types.
  // This is memoized so it only recomputes when the flags change.
  const activeColumns = useMemo(
    () => buildActiveColumns(show6WHColumn, show10WHColumn),
    [show6WHColumn, show10WHColumn]
  );
  const NUMERIC_KEYS = useMemo(
    () => new Set(activeColumns.filter(c => c.isNumeric).map(c => c.key)),
    [activeColumns]
  );

  const fetchReportData = useCallback(async () => {
    if (!financialYear || !month) return;
    try {
      setLoading(true);

      const fyStartYear = parseInt(financialYear.substring(3, 7), 10);
      const monthIndex = monthOptions.indexOf(month);

      // monthOptions: April(0), May(1), ..., March(11)
      // Jan(9), Feb(10), Mar(11) are next year
      let calendarYear = fyStartYear;
      let actualMonthIndex = monthIndex + 3; // April(3), May(4)
      if (monthIndex >= 9) { // Jan, Feb, Mar
        calendarYear = fyStartYear + 1;
        actualMonthIndex = monthIndex - 9; // Jan(0), Feb(1), Mar(2)
      }

      const y = calendarYear;
      const m = actualMonthIndex + 1;

      const res = await axios.get(`${API_URL}/cement-register`, {
        params: {
          owner: partyName,
          vehicle: selectedVehicle,
          month: m,
          year: y
        }
      });

      if (res.data && res.data.success) {
        setData(res.data.entries || []);
        setLocalData({});
      }
    } catch (err) {
      console.error(err);
      setSnack({ severity: 'error', msg: 'Failed to fetch data' });
    } finally {
      setLoading(false);
    }
  }, [financialYear, month, partyName, selectedVehicle]);

  const fetchGlobalSettings = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/settings/projected-deductions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success && res.data.data) {
        const d = res.data.data;
        setGlobalGPS(parseFloat(d.gpsTripCharge) || 0);
        // Store full settings for auto-populating adjustment amounts
        setDeductionSettings({
          rfid: parseFloat(d.rfid) || 0,
          damage: parseFloat(d.damage) || 0,
          gpsDeviceInstallation: parseFloat(d.gpsDeviceInstallation) || 0,
          advanceBankTF: parseFloat(d.advanceBankTF) || 0,
        });
      }
    } catch (e) {
      console.error('Failed to fetch projected deductions', e);
    }
  }, []);

  // Fetch persisted adjustment rows for this specific owner + vehicle + month context
  const fetchAdjustments = useCallback(async () => {
    if (!partyName || !selectedVehicle) return;
    setAdjLoading(true);
    try {
      const res = await axios.get(`${API_URL}/freight-adjustments`, {
        params: {
          ownerName: partyName,
          vehicleNo: selectedVehicle,
          month: month || '',
          financialYear: financialYear || '',
        }
      });
      if (res.data.success) {
        setAdjustmentRows(res.data.adjustments || []);
      }
    } catch (e) {
      console.error('Failed to fetch adjustments', e);
    } finally {
      setAdjLoading(false);
    }
  }, [partyName, selectedVehicle, month, financialYear]);

  useEffect(() => {
    fetchGlobalSettings();
  }, [fetchGlobalSettings]);

  useEffect(() => {
    fetchAdjustments();
  }, [fetchAdjustments]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  const handlePrint = () => {
    window.print();
  };

  const handleCellEdit = useCallback((rowId, field, value) => {
    setLocalData(prev => ({
      ...prev,
      [rowId]: { ...(prev[rowId] || {}), [`_PR_${field}`]: value }
    }));
  }, []);

  const handleSave = async () => {
    if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
    // Give React a tick to process any pending onBlur updates
    await new Promise(r => setTimeout(r, 100));

    const currentData = localDataRef.current;
    if (Object.keys(currentData).length === 0) {
      setSnack({ severity: 'info', msg: 'No changes to save.' });
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const dbUpdates = Object.entries(currentData).map(([id, changes]) => ({
        id, changes
      }));

      await axios.put(
        `${API_URL}/cement-register/bulk-update`,
        { updates: dbUpdates },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSnack({ severity: 'success', msg: 'Changes saved successfully!' });
      fetchReportData();
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Save failed: ' + (err.response?.data?.error || err.message) });
    } finally {
      setSaving(false);
    }
  };

  useShortcut('ctrl+s', handleSave);

  // ── Top Section (Deductions above NET BALANCE) Handlers ─────────────────────
  const handleAddTopAdjustment = async () => {
    if (!selectedTopType) return;
    const opt = TOP_ADJUSTMENT_OPTIONS.find(o => o.key === selectedTopType);
    let finalLabel = opt ? opt.label : selectedTopType;
    let finalAmount = 0;

    if (selectedTopType === 'others') {
      finalLabel = pendingTopOthersDesc.trim() || 'Others';
      finalAmount = parseFloat(pendingTopOthersAmt) || 0;
    } else {
      finalAmount = opt && opt.settingKey ? (deductionSettings[opt.settingKey] || 0) : 0;
    }

    setTopSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${API_URL}/freight-adjustments`,
        {
          ownerName: partyName,
          vehicleNo: selectedVehicle,
          ownerId: ownerDetails?._id || ownerDetails?.ownerId || '',
          vehicleId: ownerDetails?.vehicleId || '',
          month: month || '',
          financialYear: financialYear || '',
          summaryRecordId: firstRowId || '',
          category: 'deduction',
          adjustmentType: selectedTopType,
          reason: finalLabel,
          label: finalLabel,
          amount: finalAmount,
          othersDescription: selectedTopType === 'others' ? finalLabel : '',
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.success) {
        setAdjustmentRows(prev => [...prev, res.data.adjustment]);
        setSnack({ severity: 'success', msg: `Deduction "${finalLabel}" added.` });
        setAddingTopRow(false);
        setSelectedTopType('advance_bank_tf');
        setPendingTopOthersDesc('');
        setPendingTopOthersAmt('');
      } else {
        setSnack({ severity: 'error', msg: res.data.error || 'Failed to add deduction.' });
      }
    } catch (err) {
      setSnack({ severity: 'error', msg: err.response?.data?.error || 'Failed to add deduction.' });
    } finally {
      setTopSaving(false);
    }
  };

  const handleDeleteTopAdjustment = async (id) => {
    setTopSaving(true);
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_URL}/freight-adjustments/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAdjustmentRows(prev => prev.filter(r => r._id !== id));
      setSnack({ severity: 'success', msg: 'Deduction removed.' });
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Failed to remove deduction.' });
    } finally {
      setTopSaving(false);
    }
  };

  const handleUpdateTopAdjustmentAmount = async (id, newAmount) => {
    const parsed = parseFloat(newAmount) || 0;
    setAdjustmentRows(prev => prev.map(r => r._id === id ? { ...r, amount: parsed } : r));
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `${API_URL}/freight-adjustments/${id}`,
        { amount: parsed },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (err) {
      console.error('Failed to update deduction amount', err);
    }
  };

  // ── Bottom Section (Manual Additions below NET BALANCE) Handlers ───────────
  const handleAddBottomAdjustment = async () => {
    if (!manualReason.trim() && !manualAmount) {
      setSnack({ severity: 'warning', msg: 'Please enter Reason and Amount.' });
      return;
    }
    const finalReason = manualReason.trim() || 'Manual Addition';
    const finalAmount = parseFloat(manualAmount) || 0;

    setAdjSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${API_URL}/freight-adjustments`,
        {
          ownerName: partyName,
          vehicleNo: selectedVehicle,
          ownerId: ownerDetails?._id || ownerDetails?.ownerId || '',
          vehicleId: ownerDetails?.vehicleId || '',
          month: month || '',
          financialYear: financialYear || '',
          summaryRecordId: firstRowId || '',
          category: 'addition',
          adjustmentType: 'manual',
          reason: finalReason,
          label: finalReason,
          amount: finalAmount,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.success) {
        setAdjustmentRows(prev => [...prev, res.data.adjustment]);
        setSnack({ severity: 'success', msg: `Addition "${finalReason}" added.` });
        setManualReason('');
        setManualAmount('');
      } else {
        setSnack({ severity: 'error', msg: res.data.error || 'Failed to add manual adjustment.' });
      }
    } catch (err) {
      setSnack({ severity: 'error', msg: err.response?.data?.error || 'Failed to add manual adjustment.' });
    } finally {
      setAdjSaving(false);
    }
  };

  const handleDeleteBottomAdjustment = async (id) => {
    setAdjSaving(true);
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_URL}/freight-adjustments/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAdjustmentRows(prev => prev.filter(r => r._id !== id));
      setSnack({ severity: 'success', msg: 'Manual adjustment deleted.' });
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Failed to delete adjustment.' });
    } finally {
      setAdjSaving(false);
    }
  };

  const handleUpdateBottomAdjustmentAmount = async (id, newAmount) => {
    const parsed = parseFloat(newAmount) || 0;
    setAdjustmentRows(prev => prev.map(r => r._id === id ? { ...r, amount: parsed } : r));
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `${API_URL}/freight-adjustments/${id}`,
        { amount: parsed },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (err) {
      console.error('Failed to update adjustment amount', err);
    }
  };

  const startEditBottomAdjustment = (row) => {
    setEditingRowId(row._id);
    setEditingReason(row.reason || row.label || '');
    setEditingAmount(String(row.amount ?? ''));
  };

  const cancelEditBottomAdjustment = () => {
    setEditingRowId(null);
    setEditingReason('');
    setEditingAmount('');
  };

  const saveEditBottomAdjustment = async (id) => {
    const finalReason = editingReason.trim() || 'Manual Addition';
    const finalAmount = parseFloat(editingAmount) || 0;
    setAdjustmentRows(prev => prev.map(r => r._id === id ? { ...r, reason: finalReason, label: finalReason, amount: finalAmount } : r));
    setEditingRowId(null);
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `${API_URL}/freight-adjustments/${id}`,
        { reason: finalReason, label: finalReason, amount: finalAmount },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSnack({ severity: 'success', msg: 'Adjustment updated.' });
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Failed to update adjustment.' });
    }
  };

  // Apply manual overrides and calculate fields
  let totalMT = 0, totalAmount = 0, totalAdvance = 0;
  let totalHSDLtr = 0, totalHSDAmount = 0, totalBasicAmount = 0;
  let totalIncentive = 0, totalExtraUL = 0, totalToll = 0, totalNetRealization = 0;
  let totalGPS = 0;
  let total10WHIncentive = 0, total6WHIncentive = 0;

  const rows = data.map((originalRow, i) => {
    const changes = localData[originalRow._id] || {};
    // Helper to get effective value: local override > DB override > DB original > fallback
    const getVal = (key, dbKey, fallback = '') => {
      if (changes[`_PR_${key}`] !== undefined) return changes[`_PR_${key}`];
      if (originalRow[`_PR_${key}`] !== undefined) return originalRow[`_PR_${key}`];
      if (dbKey && originalRow[dbKey] !== undefined) return originalRow[dbKey];
      return fallback;
    };

    const mt = parseNum(getVal('MT', 'MT', 0));
    const frtRate = parseNum(getVal('PARTY RATE', 'BILLING', 0));

    // AMOUNT = MT × Freight/MT
    let amount = round2(mt * frtRate);
    if (changes['_PR_AMOUNT'] !== undefined) amount = parseNum(changes['_PR_AMOUNT']);
    else if (originalRow['_PR_AMOUNT'] !== undefined) amount = parseNum(originalRow['_PR_AMOUNT']);

    const advance = parseNum(getVal('ADVANCE', 'LOADING ADVANCE') || getVal('ADVANCE', 'ADVANCE', 0));
    const hsdLtr = parseNum(getVal('HSD (LTR)', 'HSD') || getVal('HSD (LTR)', 'HSD (LTR)', 0));
    const hsdRate = parseNum(getVal('HSD RATE', 'HSD RATE', 0));
    const hsdAmt = parseNum(getVal('HSD AMOUNT', 'HSD AMOUNT', 0));

    // BASIC AMOUNT = AMOUNT - LOADING ADVANCE - HSD AMOUNT
    let basicAmount = round2(amount - advance - hsdAmt);
    if (changes['_PR_BASIC AMOUNT'] !== undefined) basicAmount = parseNum(changes['_PR_BASIC AMOUNT']);
    else if (originalRow['_PR_BASIC AMOUNT'] !== undefined) basicAmount = parseNum(originalRow['_PR_BASIC AMOUNT']);

    // INCENTIVE DEDICATED:
    // originalIncentiveDedicated = existing calculated value
    // manualIncentiveDedicated = user-entered manual override
    // IF manual override exists (including 0) -> use manual override, ELSE -> use original calculated value
    const originalIncentiveDedicated = parseNum(originalRow['DEDICATED'] ?? originalRow['INCENTIVE'] ?? 0);
    let manualIncentiveDedicated = null;
    if (changes['_PR_INCENTIVE'] !== undefined) {
      manualIncentiveDedicated = (changes['_PR_INCENTIVE'] !== '' && changes['_PR_INCENTIVE'] !== null)
        ? parseNum(changes['_PR_INCENTIVE'])
        : 0;
    } else if (originalRow['_PR_INCENTIVE'] !== undefined && originalRow['_PR_INCENTIVE'] !== null && originalRow['_PR_INCENTIVE'] !== '') {
      manualIncentiveDedicated = parseNum(originalRow['_PR_INCENTIVE']);
    }

    const incentive = manualIncentiveDedicated !== null ? manualIncentiveDedicated : originalIncentiveDedicated;
    const extraUL = parseNum(getVal('EXTRA UNLOADING', 'EXTRA UNLOADING') || getVal('EXTRA UNLOADING', 'EXTRA U/L', 0));

    // TOLL (preserved if present in record)
    let dbToll = parseNum(originalRow['UP TOLL']) + parseNum(originalRow['DOWN TOLL']);
    let toll = changes['_PR_TOLL'] !== undefined ? parseNum(changes['_PR_TOLL']) :
      (originalRow['_PR_TOLL'] !== undefined ? parseNum(originalRow['_PR_TOLL']) : dbToll);

    // ── Wheel-type-specific incentive calculations ───────────────────────────
    // Determine wheel type from Owner & Vehicle Directory (vehicleWheelMap) or row WHEEL field.
    const vehicleKey = selectedVehicle || originalRow['VEHICLE NUMBER'] || '';
    const wheelFromMap = vehicleWheelMap[vehicleKey] || '';
    const wheelFromRow = String(originalRow['WHEEL'] || '').trim();
    const effectiveWheel = (wheelFromMap || wheelFromRow).toUpperCase();

    const rowIs10Wheel = effectiveWheel.includes('10');
    const rowIs6Wheel = !rowIs10Wheel && !effectiveWheel.includes('12') && !effectiveWheel.includes('14') && effectiveWheel.includes('6');

    // Applicable incentive base from corresponding vehicle/trip
    const billingRate = parseNum(originalRow['BILLING'] || originalRow['BILLING RATE'] || originalRow['PARTY RATE'] || 0);
    const incentiveBase = billingRate > 0 ? (billingRate * mt) : amount;

    let incentive10WH = 0;
    if (rowIs10Wheel) {
      const stored10W = parseNum(originalRow['10W EXTRA 8.5%']);
      if (stored10W > 0) {
        incentive10WH = stored10W;
      } else {
        incentive10WH = incentiveBase > 0 ? round2(incentiveBase * 0.085) : 0;
      }
    }

    let incentive6WH = 0;
    if (rowIs6Wheel) {
      incentive6WH = incentiveBase > 0 ? round2(incentiveBase * 0.15) : 0;
    }

    // EXTRA INCENTIVE for this vehicle/trip
    const extraIncentive = incentive10WH + incentive6WH;

    // NET REALIZATION = BASIC AMOUNT + INCENTIVE DEDICATED + EXTRA INCENTIVE + EXTRA UNLOADING
    let netRealization = round2(basicAmount + incentive + extraIncentive + extraUL);
    if (changes['_PR_NET REALIZATION'] !== undefined) netRealization = parseNum(changes['_PR_NET REALIZATION']);
    else if (originalRow['_PR_NET REALIZATION'] !== undefined) netRealization = parseNum(originalRow['_PR_NET REALIZATION']);

    // Aggregate row values for GROSS TOTAL
    totalMT += mt;
    totalAmount += amount;
    totalAdvance += advance;
    totalHSDLtr += hsdLtr;
    totalHSDAmount += hsdAmt;
    totalBasicAmount += basicAmount;
    totalIncentive += incentive;
    total10WHIncentive += incentive10WH;
    total6WHIncentive += incentive6WH;
    totalExtraUL += extraUL;
    totalToll += toll;
    totalNetRealization += netRealization;

    return {
      _original: originalRow,
      'SL NO': i + 1,
      'LOADING DATE': getVal('LOADING DATE', 'INVOICE DATE') || getVal('LOADING DATE', 'LOADING DATE', '-'),
      'SITE': getVal('SITE', 'SITE', '-'),
      'CHALLAN STATUS': getVal('CHALLAN STATUS', 'CHALLAN STATUS', '-'),
      'DESTINATION': getVal('DESTINATION', 'DESTINATION', '-'),
      'PARTY NAME': getVal('PARTY NAME', 'PARTY NAME', '-'),
      'MT': mt,
      'PARTY RATE': frtRate,
      'AMOUNT': amount,
      'ADVANCE': advance,
      'HSD (LTR)': hsdLtr,
      'HSD RATE': hsdRate,
      'HSD AMOUNT': hsdAmt,
      'BASIC AMOUNT': basicAmount,
      'INCENTIVE': incentive,
      '10WH_INCENTIVE': incentive10WH,
      '6WH_INCENTIVE': incentive6WH,
      'EXTRA UNLOADING': extraUL,
      'TOLL': toll,
      'NET REALIZATION': netRealization,
    };
  });

  // Summary HSD Rate = weighted average rate from Total HSD Amount / Total HSD Litres
  const summaryHsdRate = totalHSDLtr > 0 ? round2(totalHSDAmount / totalHSDLtr) : 0;

  const totalsMap = {
    'MT': totalMT,
    'AMOUNT': totalAmount,
    'ADVANCE': totalAdvance,
    'HSD (LTR)': totalHSDLtr,
    'HSD RATE': summaryHsdRate,
    'HSD AMOUNT': totalHSDAmount,
    'BASIC AMOUNT': totalBasicAmount,
    'INCENTIVE': totalIncentive,
    '10WH_INCENTIVE': total10WHIncentive,
    '6WH_INCENTIVE': total6WHIncentive,
    'EXTRA UNLOADING': totalExtraUL,
    'TOLL': totalToll,
    'NET REALIZATION': totalNetRealization
  };

  const firstRowId = data.length > 0 ? data[0]._id : null;
  const firstRowLocal = firstRowId ? (localData[firstRowId] || {}) : {};
  const firstRowOrig = data.length > 0 ? data[0] : {};

  const getManualSummary = (key) => {
    if (firstRowLocal[`_PR_SUMMARY_${key}`] !== undefined) return firstRowLocal[`_PR_SUMMARY_${key}`];
    if (firstRowOrig[`_PR_SUMMARY_${key}`] !== undefined) return firstRowOrig[`_PR_SUMMARY_${key}`];
    return '';
  };

  const handleManualSummaryChange = (key, val) => {
    if (!firstRowId) return;
    setLocalData(prev => ({
      ...prev,
      [firstRowId]: { ...(prev[firstRowId] || {}), [`_PR_SUMMARY_${key}`]: val }
    }));
  };

  // ── TDS DEDUCTION @ 1% Calculation ──────────────────────────────────────────
  // TDS Base = AMOUNT TOTAL + INCENTIVE DEDICATED TOTAL (including manual overrides) + EXTRA UNLOADING TOTAL
  // TDS DEDUCTION @ 1% = TDS Base × 1% (0.01)
  const tdsBase = round2(totalAmount + totalIncentive + totalExtraUL);
  const tdsCalculated = round2(tdsBase * 0.01);

  const manualTds = getManualSummary('TDS');
  const tdsValue = (manualTds !== '' && manualTds !== undefined && manualTds !== null)
    ? parseNum(manualTds)
    : tdsCalculated;

  const displayTds = (manualTds !== '' && manualTds !== undefined && manualTds !== null)
    ? manualTds
    : (tdsCalculated > 0 ? tdsCalculated.toFixed(2) : (rows.length > 0 ? '0.00' : ''));

  const gpsValue = parseNum(globalGPS);

  // Separate TOP deductions (System 1) vs BOTTOM manual additions (System 2)
  const topDeductionRows = adjustmentRows.filter(
    r => r.category === 'deduction' || (r.adjustmentType && r.adjustmentType !== 'manual' && r.category !== 'addition')
  );
  const bottomAdditionRows = adjustmentRows.filter(
    r => r.category === 'addition' || (!r.category && (!r.adjustmentType || r.adjustmentType === 'manual'))
  );

  // 1. TOP SECTION DEDUCTIONS: sum of all "+ ADD ADJUSTMENT" amounts
  const totalTopDeductions = topDeductionRows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);

  // NET BALANCE = Base Amount (Total Net Realization) - TDS - GPS - TOTAL OF ALL "ADD ADJUSTMENT" DEDUCTIONS
  const netBalanceCalc = totalNetRealization - tdsValue - gpsValue - totalTopDeductions;

  // 2. BOTTOM SECTION MANUAL REASON/AMOUNT: sum of all manually entered additions
  const totalManualAddition = bottomAdditionRows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);

  // 3. FINAL NET PAYABLE = NET BALANCE + TOTAL OF ALL MANUALLY ENTERED REASON/AMOUNT VALUES
  const netPayableCalc = netBalanceCalc + totalManualAddition;


  const dirtyCount = Object.keys(localData).length;

  let titleMonth = '';
  if (financialYear && month) {
    const fyStartYear = parseInt(financialYear.substring(3, 7), 10);
    const mIdx = monthOptions.indexOf(month);
    const calYear = mIdx >= 9 ? fyStartYear + 1 : fyStartYear;
    const shortMonth = month.substring(0, 3).toUpperCase();
    titleMonth = `${shortMonth}'${String(calYear).substring(2)}`;
  }

  return (
    <Box sx={{ bgcolor: 'background.paper', minHeight: '100vh', pb: 8, display: 'flex', flexDirection: 'column' }}>

      {/* ── Toolbar & Quick Filters (Print hidden) ────────────────────────────────────── */}
      <Box sx={{
        '@media print': { display: 'none' },
        px: { xs: 2, md: 4 }, py: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        bgcolor: 'background.paper', borderBottom: '1px solid #e2e8f0',
        gap: 2, flexWrap: 'wrap'
      }}>
        <Box display="flex" alignItems="center" gap={2}>
          <IconButton onClick={onBack} sx={{ bgcolor: 'background.default', '&:hover': { bgcolor: '#e2e8f0' }, p: 1, borderRadius: '12px' }}>
            <ArrowBackIcon fontSize="small" sx={{ color: '#0f172a' }} />
          </IconButton>
          <Box>
            <Typography variant="h6" fontWeight={800} sx={{ color: '#0f172a', letterSpacing: '-0.5px' }}>
              {partyName} - Freight Summary
            </Typography>
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
              {rows.length} Records found
            </Typography>
          </Box>
        </Box>

        <Box display="flex" alignItems="center" gap={1.5}>
          <select
            value={financialYear}
            onChange={(e) => setFinancialYear(e.target.value)}
            style={{
              padding: '8px 12px', borderRadius: '10px', border: '1px solid #cbd5e1',
              outline: 'none', fontWeight: 'bold', fontSize: '13px', color: '#0f172a',
              background: '#f8fafc', cursor: 'pointer'
            }}
          >
            <option value="" disabled>Financial Year</option>
            {fyOptions.map(fy => <option key={fy} value={fy}>{fy}</option>)}
          </select>

          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            style={{
              padding: '8px 12px', borderRadius: '10px', border: '1px solid #cbd5e1',
              outline: 'none', fontWeight: 'bold', fontSize: '13px', color: '#0f172a',
              background: '#f8fafc', cursor: 'pointer'
            }}
          >
            <option value="" disabled>Month</option>
            {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
          </select>

          <Button
            size="small" variant="outlined" startIcon={<PrintIcon />} onClick={handlePrint}
            sx={{ fontWeight: 700, borderRadius: '10px', fontSize: '0.8rem', color: '#475569', borderColor: '#e2e8f0', textTransform: 'none', ml: 1 }}
          >
            Print
          </Button>
          <Button
            size="small" variant="contained"
            startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon sx={{ fontSize: '1.1rem' }} />}
            onClick={handleSave} disabled={saving}
            sx={{
              fontWeight: 700, borderRadius: '10px', px: 2.5, fontSize: '0.85rem', textTransform: 'none',
              background: dirtyCount > 0 ? 'linear-gradient(135deg,#10b981,#059669)' : '#f1f5f9',
              color: dirtyCount > 0 ? '#fff' : '#0f172a',
              boxShadow: dirtyCount > 0 ? '0 4px 12px rgba(16, 185, 129, 0.25)' : 'none',
              border: dirtyCount === 0 ? '1px solid #cbd5e1' : 'none',
              '&:hover': { background: dirtyCount > 0 ? 'linear-gradient(135deg,#059669,#047857)' : '#e2e8f0' },
            }}>
            {saving ? 'Saving…' : `Save${dirtyCount > 0 ? ` (${dirtyCount})` : ''}`}
          </Button>
        </Box>
      </Box>

      {/* Printable Report Container */}
      <Box sx={{ p: { xs: 2, md: 4 }, flex: 1, display: 'flex', flexDirection: 'column', '@media print': { p: 0, m: 0 } }}>

        {/* Header Section Redesigned */}
        <Grid container spacing={3} mb={4} sx={{ '@media print': { display: 'flex', gap: '20px' } }}>
          <Grid item xs={12} md={6}>
            <Card sx={{
              height: '100%',
              borderRadius: '16px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
              border: '1px solid #e2e8f0',
              overflow: 'hidden',
              '@media print': { border: '1px solid #000', boxShadow: 'none' }
            }}>
              <Box sx={{ bgcolor: '#0f172a', py: 1.5, px: 2.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Typography variant="subtitle2" fontWeight={800} sx={{ color: '#fff', letterSpacing: '0.5px' }}>
                  🏢 COMPANY DETAILS
                </Typography>
              </Box>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" fontWeight={800} color="#1e293b" mb={1.5}>DIPALI ASSOCIATES & CO.</Typography>
                <Box display="flex" flexDirection="column" gap={0.5}>
                  <Typography variant="body2" color="#475569" fontWeight={500}>PANJA HOTEL 1st FLOOR</Typography>
                  <Typography variant="body2" color="#475569" fontWeight={500}>DARJEELING MORE, PANAGARH</Typography>
                  <Typography variant="body2" color="#334155" fontWeight={800} mt={1}>SITE - NUVOCO PANAGARH</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card sx={{
              height: '100%',
              borderRadius: '16px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
              border: '1px solid #e2e8f0',
              overflow: 'hidden',
              '@media print': { border: '1px solid #000', boxShadow: 'none' }
            }}>
              <Box sx={{ bgcolor: '#4f46e5', py: 1.5, px: 2.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Typography variant="subtitle2" fontWeight={800} sx={{ color: '#fff', letterSpacing: '0.5px' }}>
                  👤 OWNER DETAILS
                </Typography>
              </Box>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" fontWeight={800} color="#1e293b" mb={2}>{partyName}</Typography>
                <Grid container spacing={1.5}>
                  <Grid item xs={4}><Typography variant="body2" color="#64748b" fontWeight={700}>PAN NO</Typography></Grid>
                  <Grid item xs={8}><Typography variant="body2" color="#1e293b" fontWeight={700}>{ownerDetails?.pan || '-'}</Typography></Grid>

                  <Grid item xs={4}><Typography variant="body2" color="#64748b" fontWeight={700}>ADDRESS</Typography></Grid>
                  <Grid item xs={8}><Typography variant="body2" color="#1e293b" fontWeight={700}>{ownerDetails?.address || '-'}</Typography></Grid>

                  <Grid item xs={4}><Typography variant="body2" color="#64748b" fontWeight={700}>CONTACT NO</Typography></Grid>
                  <Grid item xs={8}><Typography variant="body2" color="#1e293b" fontWeight={700}>{ownerDetails?.contactNo || '-'}</Typography></Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Vehicle & Title Section */}
        <Box display="flex" flexDirection="column" alignItems="center" mb={4}>
          <Typography variant="h5" fontWeight={900} sx={{ color: '#0f172a', letterSpacing: '-0.5px', mb: 2 }}>
            FREIGHT SUMMARY <span style={{ color: '#4f46e5' }}>{titleMonth}</span>
          </Typography>
          <Box display="flex" gap={2} flexWrap="wrap" justifyContent="center">
            <Box sx={{ bgcolor: 'background.default', border: '1px solid #e2e8f0', px: 2.5, py: 1, borderRadius: '10px', display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="caption" color="#64748b" fontWeight={700}>FINANCIAL YEAR:</Typography>
              <Typography variant="body2" color="#0f172a" fontWeight={800}>{financialYear}</Typography>
            </Box>
            <Box sx={{ bgcolor: 'background.default', border: '1px solid #e2e8f0', px: 2.5, py: 1, borderRadius: '10px', display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="caption" color="#64748b" fontWeight={700}>MONTH:</Typography>
              <Typography variant="body2" color="#0f172a" fontWeight={800}>{month.toUpperCase()}</Typography>
            </Box>
            <Box sx={{ bgcolor: '#e0e7ff', border: '1px solid #c7d2fe', px: 2.5, py: 1, borderRadius: '10px', display: 'flex', alignItems: 'center', gap: 1.5, boxShadow: '0 2px 8px rgba(79,70,229,0.1)' }}>
              <Typography variant="caption" color="#4338ca" fontWeight={800}>🚛 VEHICLE:</Typography>
              <Typography variant="body1" color="#312e81" fontWeight={900}>{selectedVehicle}</Typography>
            </Box>
          </Box>
        </Box>

        {loading ? (
          <Box textAlign="center" py={10}><CircularProgress /></Box>
        ) : (
          <>
            {/* Table Container exactly like Cement Register */}
            <Box ref={tableContainerRef} sx={{ overflow: 'auto', maxHeight: { xs: '72vh', md: 'calc(100vh - 215px)' }, minHeight: '400px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 15px rgba(0,0,0,0.03)', bgcolor: 'background.paper', position: 'relative', '@media print': { borderRadius: 0, border: 'none', boxShadow: 'none' } }}>
              <table style={{
                borderCollapse: 'separate',
                borderSpacing: 0,
                minWidth: '100%',
                tableLayout: 'auto', fontFamily: 'Inter, system-ui, sans-serif', fontSize: '11px'
              }}>
                <colgroup>
                  {activeColumns.map(c => <col key={c.key} style={{ width: c.width, minWidth: c.width }} />)}
                </colgroup>

                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr>
                    {activeColumns.map((col) => {
                      const typeStyle = col.type === 'auto'
                        ? { background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)', color: '#e2e8f0' } // Slate
                        : col.type === 'calc'
                          ? { background: 'linear-gradient(180deg, #064e3b 0%, #022c22 100%)', color: '#a7f3d0' } // Emerald
                          : col.type === 'dropdown'
                            ? { background: 'linear-gradient(180deg, #7c2d12 0%, #431407 100%)', color: '#fed7aa' } // Orange
                            : col.type === 'readonly'
                              ? { background: 'linear-gradient(180deg, #065f46 0%, #022c22 100%)', color: '#6ee7b7' } // Teal-green (wheel incentive)
                              : { background: 'linear-gradient(180deg, #1e3a8a 0%, #172554 100%)', color: '#bfdbfe' }; // Blue (Manual)

                      return (
                        <th key={col.key} style={{
                          position: 'sticky', top: 0, zIndex: 10,
                          ...typeStyle,
                          padding: '10px 6px',
                          textAlign: 'center',
                          fontSize: '10px', fontWeight: 700,
                          letterSpacing: '0.5px',
                          whiteSpace: 'pre-line', lineHeight: 1.2,
                          borderRight: '1px solid rgba(255,255,255,0.05)',
                          borderBottom: '2px solid rgba(255,255,255,0.2)',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                          '@media print': { background: '#f1f5f9', color: '#000', border: '1px solid #000' }
                        }}>
                          {col.label}
                          {col.type === 'auto' && <div style={{ fontSize: '7px', opacity: 0.6, marginTop: 4, letterSpacing: '1px' }}>AUTO</div>}
                          {col.type === 'calc' && <div style={{ fontSize: '7px', opacity: 0.7, marginTop: 4, letterSpacing: '1px' }}>CALC</div>}
                          {col.type === 'readonly' && <div style={{ fontSize: '7px', opacity: 0.7, marginTop: 4, letterSpacing: '1px' }}>AUTO</div>}
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={activeColumns.length} style={{ textAlign: 'center', padding: '60px', color: '#64748b', fontSize: '13px' }}>
                        No records found for this period.
                      </td>
                    </tr>
                  )}
                  {rows.map((row, index) => {
                    const rowId = row._original._id;
                    const hasDraft = !!localData[rowId];
                    return (
                      <tr key={rowId} style={{
                        background: hasDraft ? '#fffbeb' : index % 2 === 0 ? '#ffffff' : '#fafafa',
                        transition: 'background 0.2s',
                        '@media print': { background: '#fff', border: '1px solid #000' }
                      }}>
                        {activeColumns.map((col) => {
                          const val = row[col.key];
                          const isDirty = localData[rowId]?.[`_PR_${col.key}`] !== undefined;
                          return (
                            <CellRenderer
                              key={col.key}
                              col={col}
                              value={val}
                              isDirty={isDirty}
                              onChange={(newVal) => handleCellEdit(rowId, col.key, newVal)}
                            />
                          );
                        })}
                      </tr>
                    );
                  })}

                  {/* GROSS TOTAL ROW */}
                  {rows.length > 0 && (
                    <tr style={{ fontWeight: 900, borderBottom: '2px solid #e2e8f0', '@media print': { border: '1px solid #000' } }}>
                      {activeColumns.map((col, idx) => {
                        const isFirst = idx === 0;
                        const isNumeric = NUMERIC_KEYS.has(col.key);
                        const val = isNumeric ? totalsMap[col.key] : '';

                        let display = '';
                        if (isFirst) display = 'GROSS TOTAL';
                        else if (isNumeric) display = col.key === 'HSD (LTR)' || col.key === 'MT' ? fq(val) : f(val);

                        return (
                          <td key={`total-${col.key}`} colSpan={isFirst ? 6 : 1} style={{
                            display: (idx > 0 && idx < 6) ? 'none' : 'table-cell', // Merging first 6 cols
                            border: '1px solid #e2e8f0', padding: '14px 10px', fontSize: '12px',
                            color: isFirst ? '#0f172a' : '#1e293b', textAlign: isNumeric ? 'right' : 'center',
                            fontWeight: 900, position: 'sticky', bottom: 0, zIndex: 10,
                            background: isNumeric ? 'linear-gradient(180deg, #e0e7ff 0%, #c7d2fe 100%)' : 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
                            boxShadow: '0 -4px 12px rgba(0,0,0,0.05)',
                            borderTop: '3px solid #6366f1',
                            '@media print': { background: '#f1f5f9', color: '#000', border: '1px solid #000' }
                          }}>
                            {display}
                          </td>
                        );
                      })}
                    </tr>
                  )}
                </tbody>
              </table>
            </Box>

            {/* Manual Summary Deductions Section */}
            <Box display="flex" justifyContent="flex-end" mt={5} mb={3}>
              <Box sx={{
                width: 440,
                border: '1px solid #e2e8f0',
                borderRadius: '16px',
                overflow: 'hidden',
                background: '#ffffff',
                boxShadow: '0 8px 24px -4px rgba(79, 70, 229, 0.12)',
                '@media print': { border: '1px solid #000', boxShadow: 'none', background: '#fff' }
              }}>
                <Box sx={{ bgcolor: '#4f46e5', py: 2, px: 2.5, textAlign: 'center', borderBottom: '1px solid #e2e8f0' }}>
                  <Typography variant="subtitle2" fontWeight={800} sx={{ color: '#fff', letterSpacing: '0.5px' }}>
                    ✦ MANUAL SUMMARY / ADJUSTMENTS
                  </Typography>
                </Box>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px', fontFamily: 'Inter, sans-serif', fontWeight: 700, color: '#334155' }}>
                  <tbody>
                    {/* 1. TDS DEDUCTION @ 1% */}
                    <tr style={{ transition: 'background 0.2s', '&:hover': { background: '#f8fafc' } }}>
                      <td style={{ padding: '16px 20px', borderBottom: '1px dashed #cbd5e1', borderRight: '1px solid #e2e8f0' }}>TDS DEDUCTION @ 1%</td>
                      <td style={{ padding: '10px 20px', borderBottom: '1px dashed #cbd5e1', textAlign: 'right', width: '160px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                          <span style={{ color: '#94a3b8' }}>₹</span>
                          <EditableCell
                            value={displayTds}
                            onChange={(v) => handleManualSummaryChange('TDS', v)}
                            style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '6px 10px', borderRadius: '8px', minWidth: '90px', textAlign: 'right', color: '#0f172a', fontWeight: 800, transition: 'all 0.2s' }}
                          />
                        </div>
                      </td>
                    </tr>

                    {/* 2. GPS TRIP MONITORING CHARGES */}
                    <tr style={{ background: '#f8fafc' }}>
                      <td style={{ padding: '16px 20px', borderBottom: '1px dashed #cbd5e1', borderRight: '1px solid #e2e8f0' }}>GPS MONITORING / TRIP CHARGE</td>
                      <td style={{ padding: '10px 20px', borderBottom: '1px dashed #cbd5e1', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                          <span style={{ color: '#64748b' }}>₹</span>
                          <div style={{ background: '#e2e8f0', border: '1px solid #cbd5e1', padding: '6px 10px', borderRadius: '8px', minWidth: '90px', textAlign: 'right', color: '#475569', fontWeight: 800 }}>
                            {globalGPS}
                          </div>
                        </div>
                      </td>
                    </tr>

                    {/* 3. DYNAMIC TOP DEDUCTION ROWS (Added via "+ ADD ADJUSTMENT") */}
                    {topDeductionRows.map((row) => (
                      <tr key={row._id} style={{ background: '#fff' }}>
                        <td style={{ padding: '12px 20px', borderBottom: '1px dashed #e2e8f0', borderRight: '1px solid #e2e8f0' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }} />
                              <span style={{ fontWeight: 700, color: '#334155', fontSize: '13px' }}>
                                {row.label || row.reason || 'Deduction'}
                              </span>
                            </div>
                            <button
                              onClick={() => handleDeleteTopAdjustment(row._id)}
                              disabled={topSaving}
                              title="Remove deduction"
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: '#ef4444', fontSize: '12px', fontWeight: 700,
                                padding: '2px 6px', borderRadius: '4px',
                                opacity: topSaving ? 0.5 : 1,
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        </td>
                        <td style={{ padding: '8px 20px', borderBottom: '1px dashed #e2e8f0', textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                            <span style={{ color: '#94a3b8', fontSize: '12px' }}>₹</span>
                            <EditableCell
                              value={row.amount}
                              onChange={(v) => handleUpdateTopAdjustmentAmount(row._id, v)}
                              style={{
                                background: '#fef2f2', border: '1px solid #fca5a5',
                                padding: '5px 10px', borderRadius: '8px',
                                minWidth: '90px', textAlign: 'right',
                                color: '#991b1b', fontWeight: 800, fontSize: '13px',
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}

                    {/* 4. "+ ADD ADJUSTMENT" CONTROLS (Top Deductions System) */}
                    <tr style={{ background: '#f8fafc' }}>
                      <td colSpan={2} style={{ padding: '10px 20px', borderBottom: '1px dashed #cbd5e1' }}>
                        {!addingTopRow ? (
                          <button
                            onClick={() => setAddingTopRow(true)}
                            style={{
                              background: 'none', border: '1.5px dashed #6366f1',
                              borderRadius: '8px', padding: '6px 14px',
                              color: '#4f46e5', fontWeight: 700, fontSize: '12.5px',
                              cursor: 'pointer', display: 'flex', alignItems: 'center',
                              gap: '6px', width: '100%', justifyContent: 'center',
                              transition: 'all 0.15s',
                            }}
                          >
                            + ADD ADJUSTMENT
                          </button>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <select
                                value={selectedTopType}
                                onChange={e => setSelectedTopType(e.target.value)}
                                style={{
                                  padding: '6px 10px', borderRadius: '6px',
                                  border: '1.5px solid #6366f1', fontSize: '12.5px',
                                  color: '#0f172a', fontWeight: 700, background: '#fff',
                                  flex: 1, outline: 'none'
                                }}
                              >
                                {TOP_ADJUSTMENT_OPTIONS.map(opt => (
                                  <option key={opt.key} value={opt.key}>{opt.label}</option>
                                ))}
                              </select>
                              <button
                                onClick={handleAddTopAdjustment}
                                disabled={topSaving}
                                style={{
                                  padding: '6px 14px', borderRadius: '6px', border: 'none',
                                  background: '#4f46e5', color: '#fff', fontWeight: 800,
                                  fontSize: '12px', cursor: 'pointer',
                                  opacity: topSaving ? 0.6 : 1,
                                }}
                              >
                                {topSaving ? 'Adding…' : 'Add'}
                              </button>
                              <button
                                onClick={() => setAddingTopRow(false)}
                                style={{
                                  padding: '6px 10px', borderRadius: '6px',
                                  border: '1px solid #cbd5e1', background: '#fff',
                                  color: '#475569', fontWeight: 700, fontSize: '12px',
                                  cursor: 'pointer'
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                            {selectedTopType === 'others' && (
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <input
                                  type="text"
                                  placeholder="Description (e.g. Penalty)"
                                  value={pendingTopOthersDesc}
                                  onChange={e => setPendingTopOthersDesc(e.target.value)}
                                  style={{
                                    padding: '6px 10px', borderRadius: '6px',
                                    border: '1px solid #cbd5e1', fontSize: '12px',
                                    flex: 2, background: '#fff', outline: 'none', fontWeight: 600
                                  }}
                                />
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                                  <span style={{ color: '#475569', fontWeight: 700, fontSize: '12px' }}>₹</span>
                                  <input
                                    type="number"
                                    placeholder="Amount"
                                    value={pendingTopOthersAmt}
                                    onChange={e => setPendingTopOthersAmt(e.target.value)}
                                    style={{
                                      padding: '6px 10px', borderRadius: '6px',
                                      border: '1px solid #cbd5e1', fontSize: '12px',
                                      width: '100%', background: '#fff', outline: 'none', fontWeight: 700
                                    }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>

                    {/* ── NET BALANCE (Base - TDS - GPS - Total Top Deductions) ── */}
                    <tr>
                      <td style={{ padding: '18px 20px', borderBottom: '1px dashed #cbd5e1', borderRight: '1px solid #e2e8f0', fontSize: '14.5px', color: '#0f172a', fontWeight: 800 }}>NET BALANCE</td>
                      <td style={{ padding: '12px 20px', borderBottom: '1px dashed #cbd5e1', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                          <span style={{ fontWeight: 800, color: '#0f172a' }}>₹</span>
                          <div style={{ background: '#fff', border: '2px solid #cbd5e1', padding: '8px 10px', borderRadius: '8px', minWidth: '100px', textAlign: 'right', fontWeight: 900, color: '#0f172a', fontSize: '14.5px' }}>
                            {netBalanceCalc ? f(netBalanceCalc) : (netBalanceCalc === 0 ? '0.00' : f(netBalanceCalc))}
                          </div>
                        </div>
                      </td>
                    </tr>

                    {/* ── MANUAL REASON / ADJUSTMENT (DIRECTLY BELOW NET BALANCE) ── */}
                    <tr style={{ background: '#f1f5f9' }}>
                      <td colSpan={2} style={{ padding: '10px 20px', borderBottom: '1px solid #cbd5e1', borderTop: '1px solid #cbd5e1' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '12px', fontWeight: 800, color: '#475569', letterSpacing: '0.5px' }}>
                            MANUAL REASON / ADJUSTMENT
                          </span>
                          <div style={{ display: 'flex', gap: '20px', fontSize: '11px', color: '#64748b', fontWeight: 700 }}>
                            <span>Reason</span>
                            <span style={{ minWidth: '80px', textAlign: 'right' }}>Amount</span>
                          </div>
                        </div>
                      </td>
                    </tr>

                    {adjLoading && (
                      <tr>
                        <td colSpan={2} style={{ padding: '10px 20px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', borderBottom: '1px dashed #e2e8f0' }}>
                          Loading adjustments…
                        </td>
                      </tr>
                    )}

                    {/* Bottom Manual Addition Rows */}
                    {bottomAdditionRows.map((row) => {
                      const isEditing = editingRowId === row._id;
                      if (isEditing) {
                        return (
                          <tr key={row._id} style={{ background: '#f0fdfa' }}>
                            <td colSpan={2} style={{ padding: '10px 20px', borderBottom: '1px dashed #e2e8f0' }}>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <input
                                  type="text"
                                  placeholder="Reason / Description"
                                  value={editingReason}
                                  onChange={e => setEditingReason(e.target.value)}
                                  style={{
                                    padding: '6px 10px', border: '1.5px solid #14b8a6',
                                    borderRadius: '6px', fontSize: '12.5px', color: '#0f172a',
                                    fontWeight: 700, flex: 2, background: '#fff', outline: 'none'
                                  }}
                                  autoFocus
                                />
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                                  <span style={{ color: '#475569', fontWeight: 700, fontSize: '12.5px' }}>₹</span>
                                  <input
                                    type="number"
                                    placeholder="Amount"
                                    value={editingAmount}
                                    onChange={e => setEditingAmount(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') saveEditBottomAdjustment(row._id); }}
                                    style={{
                                      padding: '6px 10px', border: '1.5px solid #14b8a6',
                                      borderRadius: '6px', fontSize: '12.5px', color: '#0f172a',
                                      fontWeight: 700, width: '100%', background: '#fff', outline: 'none'
                                    }}
                                  />
                                </div>
                                <button
                                  onClick={() => saveEditBottomAdjustment(row._id)}
                                  style={{
                                    padding: '6px 12px', borderRadius: '6px', border: 'none',
                                    background: '#0f172a', color: '#fff', fontWeight: 800,
                                    fontSize: '11.5px', cursor: 'pointer'
                                  }}
                                >
                                  Save
                                </button>
                                <button
                                  onClick={cancelEditBottomAdjustment}
                                  style={{
                                    padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1',
                                    background: '#fff', color: '#475569', fontWeight: 700,
                                    fontSize: '11.5px', cursor: 'pointer'
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      }

                      return (
                        <tr key={row._id} style={{ background: '#fff', transition: 'background 0.15s' }}>
                          <td style={{ padding: '10px 20px', borderBottom: '1px dashed #e2e8f0', borderRight: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                                <span style={{
                                  display: 'inline-block',
                                  width: 6, height: 6, borderRadius: '50%',
                                  background: '#14b8a6', flexShrink: 0
                                }} />
                                <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {row.reason || row.label || 'Manual Addition'}
                                </span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                <button
                                  onClick={() => startEditBottomAdjustment(row)}
                                  title="Edit Reason and Amount"
                                  style={{
                                    background: '#f1f5f9', border: '1px solid #cbd5e1', cursor: 'pointer',
                                    color: '#475569', fontSize: '11px', fontWeight: 700,
                                    padding: '3px 8px', borderRadius: '5px',
                                    transition: 'all 0.15s',
                                  }}
                                  onMouseEnter={e => { e.currentTarget.style.background = '#e2e8f0'; }}
                                  onMouseLeave={e => { e.currentTarget.style.background = '#f1f5f9'; }}
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteBottomAdjustment(row._id)}
                                  disabled={adjSaving}
                                  title="Delete this manual addition"
                                  style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    color: '#ef4444', fontSize: '11px', fontWeight: 700,
                                    padding: '3px 6px', borderRadius: '5px',
                                    transition: 'background 0.15s',
                                    opacity: adjSaving ? 0.5 : 1,
                                  }}
                                  onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; }}
                                  onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                                >
                                  ✕ Delete
                                </button>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '8px 20px', borderBottom: '1px dashed #e2e8f0', textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                              <span style={{ color: '#94a3b8', fontSize: '12px' }}>₹</span>
                              <EditableCell
                                value={row.amount}
                                onChange={(v) => handleUpdateBottomAdjustmentAmount(row._id, v)}
                                style={{
                                  background: '#f0fdf4', border: '1px solid #86efac',
                                  padding: '5px 10px', borderRadius: '8px',
                                  minWidth: '90px', textAlign: 'right',
                                  color: '#065f46', fontWeight: 800, fontSize: '13px',
                                  transition: 'all 0.2s',
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {/* Manual Reason / Amount Input Row */}
                    <tr style={{ background: '#f8fafc' }}>
                      <td colSpan={2} style={{ padding: '12px 20px', borderBottom: '1px dashed #cbd5e1' }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input
                            type="text"
                            placeholder="Reason: e.g. Advance Payment"
                            value={manualReason}
                            onChange={e => setManualReason(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleAddBottomAdjustment(); }}
                            style={{
                              padding: '8px 12px', borderRadius: '8px',
                              border: '1.5px solid #cbd5e1', outline: 'none',
                              fontSize: '12.5px', color: '#0f172a',
                              background: '#fff', flex: 2, fontWeight: 600,
                            }}
                          />
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1.2 }}>
                            <span style={{ color: '#475569', fontWeight: 700, fontSize: '13px' }}>₹</span>
                            <input
                              type="number"
                              placeholder="Amount"
                              value={manualAmount}
                              onChange={e => setManualAmount(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') handleAddBottomAdjustment(); }}
                              style={{
                                padding: '8px 12px', borderRadius: '8px',
                                border: '1.5px solid #cbd5e1', outline: 'none',
                                fontSize: '12.5px', color: '#0f172a',
                                background: '#fff', width: '100%', fontWeight: 700,
                              }}
                            />
                          </div>
                          <button
                            onClick={handleAddBottomAdjustment}
                            disabled={adjSaving || (!manualReason && !manualAmount)}
                            style={{
                              padding: '8px 16px', borderRadius: '8px',
                              border: 'none', cursor: 'pointer',
                              background: '#0f172a', color: '#fff',
                              fontWeight: 800, fontSize: '12.5px',
                              transition: 'all 0.18s',
                              opacity: adjSaving ? 0.6 : 1,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {adjSaving ? 'Adding…' : '+ ADD'}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* ── TOTAL MANUAL AMOUNT ROW ─────────────────────────────── */}
                    {bottomAdditionRows.length > 0 && (
                      <tr style={{ background: '#f8fafc' }}>
                        <td style={{ padding: '14px 20px', borderBottom: '1px dashed #cbd5e1', borderRight: '1px solid #e2e8f0', fontSize: '13.5px', color: '#334155', fontWeight: 800 }}>
                          TOTAL MANUAL AMOUNT
                        </td>
                        <td style={{ padding: '10px 20px', borderBottom: '1px dashed #cbd5e1', textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                            <span style={{ fontWeight: 800, color: '#0f172a' }}>₹</span>
                            <div style={{ background: '#fff', border: '1.5px solid #cbd5e1', padding: '6px 10px', borderRadius: '8px', minWidth: '90px', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>
                              {totalManualAddition > 0 ? f(totalManualAddition) : (totalManualAddition === 0 ? '0.00' : f(totalManualAddition))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* ── NET PAYABLE (NET BALANCE + TOTAL MANUALLY ENTERED AMOUNTS) ── */}
                    <tr style={{ background: '#0f172a', color: '#fff' }}>
                      <td style={{ padding: '20px', borderRight: '1px solid #334155', fontSize: '16px', fontWeight: 900, letterSpacing: '0.5px' }}>NET PAYABLE</td>
                      <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                          <span style={{ fontWeight: 900, fontSize: '16px', color: '#94a3b8' }}>₹</span>
                          <div style={{ background: '#1e293b', border: '2px solid #6366f1', padding: '8px 10px', borderRadius: '8px', minWidth: '100px', textAlign: 'right', fontWeight: 900, fontSize: '16px', color: '#fff', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)' }}>
                            {netPayableCalc ? f(netPayableCalc) : (netPayableCalc === 0 ? '0.00' : f(netPayableCalc))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </Box>
            </Box>
          </>
        )}
      </Box>

      <Snackbar open={!!snack} autoHideDuration={4000} onClose={() => setSnack(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        {snack && <Alert severity={snack.severity} variant="filled" sx={{ fontWeight: 600 }}>{snack.msg}</Alert>}
      </Snackbar>
    </Box>
  );
}
