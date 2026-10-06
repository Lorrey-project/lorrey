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
  const clean = String(str).trim();
  if (!clean || clean === '-' || clean === '—') return '';

  // 1. Check YYYY-MM-DD
  const ymdMatch = clean.match(/^(\d{4})[-\/\.](\d{1,2})[-\/\.](\d{1,2})/);
  if (ymdMatch) {
    const y = ymdMatch[1];
    const m = String(ymdMatch[2]).padStart(2, '0');
    const d = String(ymdMatch[3]).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 2. Check DD-MM-YYYY or DD.MM.YYYY or DD/MM/YYYY or DD-MM-YY or DD.MM.YY or DD/MM/YY
  const dmyMatch = clean.match(/^(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{2,4})/);
  if (dmyMatch) {
    const d = String(dmyMatch[1]).padStart(2, '0');
    const m = String(dmyMatch[2]).padStart(2, '0');
    let y = dmyMatch[3];
    if (y.length === 2) {
      y = parseInt(y, 10) >= 70 ? `19${y}` : `20${y}`;
    }
    return `${y}-${m}-${d}`;
  }

  // 3. Fallback for ISO date strings
  const dateObj = new Date(clean);
  if (!isNaN(dateObj.getTime()) && dateObj.getTime() > 0) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return '';
}

function isoToDdmmyyyy(str) {
  if (!str) return '';
  const iso = ddmmyyyyToIso(str);
  if (!iso) return str;
  const parts = iso.split('-');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
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

  // Party Payment Details (authoritative source for Damage Recovery, Cash/Bank TF/Others, GPS Device, Other Deduction)
  const [partyPaymentData, setPartyPaymentData] = useState(null);
  const [partyPaymentLoading, setPartyPaymentLoading] = useState(false);

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

  // Fetch Party Payment Details for this exact Owner + Vehicle + FY + Month context
  const fetchPartyPaymentData = useCallback(async () => {
    if (!partyName || !selectedVehicle || !financialYear || !month) return;
    try {
      setPartyPaymentLoading(true);
      const res = await axios.get(`${API_URL}/party-payment/full-year`, {
        params: {
          partyName,
          vehicleNo: selectedVehicle,
          fy: financialYear,
        }
      });
      if (res.data && res.data.success && Array.isArray(res.data.months)) {
        const mObj = res.data.months.find(
          m => String(m.monthName || '').toLowerCase() === String(month || '').toLowerCase()
        );
        setPartyPaymentData(mObj || null);
      } else {
        setPartyPaymentData(null);
      }
    } catch (err) {
      console.error('Failed to fetch party payment details for freight summary', err);
      setPartyPaymentData(null);
    } finally {
      setPartyPaymentLoading(false);
    }
  }, [partyName, selectedVehicle, financialYear, month]);

  useEffect(() => {
    fetchGlobalSettings();
  }, [fetchGlobalSettings]);

  useEffect(() => {
    fetchPartyPaymentData();
  }, [fetchPartyPaymentData]);

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

  // Apply manual overrides and calculate fields
  let totalMT = 0, totalAmount = 0, totalAdvance = 0;
  let totalHSDLtr = 0, totalHSDAmount = 0, totalBasicAmount = 0;
  let totalIncentive = 0, totalExtraUL = 0, totalToll = 0, totalNetRealization = 0;
  let totalGPS = 0;
  let total10WHIncentive = 0, total6WHIncentive = 0;

  const rows = data.map((originalRow, i) => {
    const changes = localData[originalRow._id] || {};
    // Helper to get effective value: local override > DB override > DB original > fallback
    const getVal = (key, ...dbKeys) => {
      if (changes[`_PR_${key}`] !== undefined) return changes[`_PR_${key}`];
      if (originalRow[`_PR_${key}`] !== undefined) return originalRow[`_PR_${key}`];
      for (const dbKey of dbKeys) {
        if (dbKey && originalRow[dbKey] !== undefined && originalRow[dbKey] !== null && originalRow[dbKey] !== '') {
          return originalRow[dbKey];
        }
      }
      return '';
    };

    const mt = parseNum(getVal('MT', 'MT', 'QTY', 'QUANTITY', 'BILLING QTY', 'NET WEIGHT', 'mt') || 0);
    const frtRate = parseNum(getVal('PARTY RATE', 'PARTY RATE', 'PARTY RATE (95-97%)', 'PARTY RATE (95%)', 'BILLING', 'BILLING RATE', 'partyRate') || 0);

    // AMOUNT = MT × Freight/MT or authoritative AMOUNT from Cement Register
    let amount = 0;
    if (changes['_PR_AMOUNT'] !== undefined) amount = parseNum(changes['_PR_AMOUNT']);
    else if (originalRow['_PR_AMOUNT'] !== undefined) amount = parseNum(originalRow['_PR_AMOUNT']);
    else if (originalRow['AMOUNT'] !== undefined && originalRow['AMOUNT'] !== null && originalRow['AMOUNT'] !== '') amount = parseNum(originalRow['AMOUNT']);
    else if (originalRow['BILLING ER 95%'] !== undefined && originalRow['BILLING ER 95%'] !== null && originalRow['BILLING ER 95%'] !== '') amount = parseNum(originalRow['BILLING ER 95%']);
    else if (originalRow['Billing Amount'] !== undefined && originalRow['Billing Amount'] !== null && originalRow['Billing Amount'] !== '') amount = parseNum(originalRow['Billing Amount']);
    else if (mt > 0 && frtRate > 0) amount = round2(mt * frtRate);

    const advance = parseNum(getVal('ADVANCE', 'ADVANCE', 'LOADING ADVANCE', 'ADV', 'Advance', 'advance') || 0);
    const hsdLtr = parseNum(getVal('HSD (LTR)', 'HSD (LTR)', 'HSD', 'HSD LTR', 'HSD_LTR', 'hsd') || 0);
    const hsdRate = parseNum(getVal('HSD RATE', 'HSD RATE', 'HSD_RATE', 'DIESEL RATE', 'hsdRate') || 0);
    const hsdAmt = parseNum(getVal('HSD AMOUNT', 'HSD AMOUNT', 'HSD_AMOUNT', 'DIESEL AMOUNT', 'hsdAmount') || 0);

    // BASIC AMOUNT = AMOUNT - LOADING ADVANCE - HSD AMOUNT
    let basicAmount = round2(amount - advance - hsdAmt);
    if (changes['_PR_BASIC AMOUNT'] !== undefined) basicAmount = parseNum(changes['_PR_BASIC AMOUNT']);
    else if (originalRow['_PR_BASIC AMOUNT'] !== undefined) basicAmount = parseNum(originalRow['_PR_BASIC AMOUNT']);
    else if (originalRow['BASIC AMOUNT'] !== undefined && originalRow['BASIC AMOUNT'] !== null && originalRow['BASIC AMOUNT'] !== '') basicAmount = parseNum(originalRow['BASIC AMOUNT']);

    // INCENTIVE DEDICATED:
    // 1. Check local unsaved changes for manual override
    // 2. Check DB persisted record for manual override (_PR_INCENTIVE)
    // 3. Fallback to authoritative automatic calculation (originalRow['DEDICATED'] ?? originalRow['INCENTIVE'] ?? 0)
    const originalIncentiveDedicated = parseNum(originalRow['DEDICATED'] ?? originalRow['INCENTIVE'] ?? originalRow['DEDICATED INCENTIVE'] ?? 0);
    let isManualIncentive = false;
    let manualIncentiveVal = null;

    if (changes['_PR_INCENTIVE'] !== undefined) {
      isManualIncentive = true;
      manualIncentiveVal = changes['_PR_INCENTIVE'];
    } else if (originalRow['_PR_INCENTIVE'] !== undefined && originalRow['_PR_INCENTIVE'] !== null) {
      isManualIncentive = true;
      manualIncentiveVal = originalRow['_PR_INCENTIVE'];
    }

    let incentiveNum = 0;
    let incentiveDisplay = '';

    if (isManualIncentive) {
      if (manualIncentiveVal === '' || manualIncentiveVal === null) {
        incentiveNum = 0;
        incentiveDisplay = '';
      } else {
        incentiveNum = parseNum(manualIncentiveVal);
        incentiveDisplay = manualIncentiveVal;
      }
    } else {
      incentiveNum = originalIncentiveDedicated;
      incentiveDisplay = originalIncentiveDedicated > 0
        ? originalIncentiveDedicated
        : (originalRow['DEDICATED'] !== undefined || originalRow['INCENTIVE'] !== undefined ? originalIncentiveDedicated : '');
    }

    const incentive = incentiveNum;
    const extraUL = parseNum(getVal('EXTRA UNLOADING', 'EXTRA UNLOADING', 'EXTRA  UNLOADING', 'EXTRA U/L', 'EXTRA UL') || 0);

    // TOLL (preserved if present in record)
    let dbToll = parseNum(originalRow['UP TOLL'] || originalRow['TOLL UP'] || 0) + parseNum(originalRow['DOWN TOLL'] || originalRow['TOLL DOWN'] || 0) + parseNum(originalRow['TOLL'] || 0);
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
      const stored10W = parseNum(originalRow['10W EXTRA 8.5%'] || originalRow['10WH EXTRA 8.5%'] || originalRow['10W EXTRA 8']);
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
      'LOADING DATE': (() => {
        if (changes['_PR_LOADING DATE'] !== undefined) return changes['_PR_LOADING DATE'];
        if (originalRow['_PR_LOADING DATE'] !== undefined) return originalRow['_PR_LOADING DATE'];
        const rawDate = originalRow['LOADING DATE'] || originalRow['LOADING DT'] || originalRow['BILL DATE'] || originalRow['DATE'] || originalRow['RECEIVING DATE'] || originalRow['INVOICE DATE'] || '';
        if (!rawDate || rawDate === '-' || rawDate === '—') return '';
        return isoToDdmmyyyy(rawDate);
      })(),
      'SITE': getVal('SITE', 'SITE', 'site', 'Site') || '-',
      'CHALLAN STATUS': getVal('CHALLAN STATUS', 'CHALLAN STATUS', 'Challan Status', 'status') || '-',
      'DESTINATION': getVal('DESTINATION', 'DESTINATION', 'Destination', 'destination') || '-',
      'PARTY NAME': getVal('PARTY NAME', 'PARTY NAME', 'Party Name', 'partyName') || '-',
      'MT': mt,
      'PARTY RATE': frtRate,
      'AMOUNT': amount,
      'ADVANCE': advance,
      'HSD (LTR)': hsdLtr,
      'HSD RATE': hsdRate,
      'HSD AMOUNT': hsdAmt,
      'BASIC AMOUNT': basicAmount,
      'INCENTIVE': incentiveDisplay,
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

  // Authoritative values from Party Payment Details for the selected Owner + Vehicle + FY + Month
  const damageRecovery = parseNum(partyPaymentData?.['DAMAGE RECOVERY']);
  const cashBankOthers = parseNum(partyPaymentData?.['CASH_BANK_OTHERS']);
  const gpsDevice = parseNum(partyPaymentData?.['GPS DEVICE']);
  const otherDeduction = parseNum(partyPaymentData?.['OTHER DEDUCTION']);

  // Total adjustments = Damage Recovery + Cash/Bank TF/Others + GPS Device + Other Deduction
  const totalAdjustments = round2(damageRecovery + cashBankOthers + gpsDevice + otherDeduction);

  // NET BALANCE = Base Amount (Total Net Realization) - TDS - GPS - TOTAL ADJUSTMENTS
  const netBalanceCalc = round2(totalNetRealization - tdsValue - gpsValue - totalAdjustments);

  // NET PAYABLE = NET BALANCE
  const netPayableCalc = netBalanceCalc;


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

                    {/* 3. Damage Recovery */}
                    <tr style={{ background: '#fff' }}>
                      <td style={{ padding: '12px 20px', borderBottom: '1px dashed #cbd5e1', borderRight: '1px solid #e2e8f0', color: '#1e293b' }}>
                        Damage Recovery
                      </td>
                      <td style={{ padding: '8px 20px', borderBottom: '1px dashed #cbd5e1', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                          <span style={{ color: '#64748b' }}>₹</span>
                          <div style={{ background: '#e2e8f0', border: '1px solid #cbd5e1', padding: '6px 10px', borderRadius: '8px', minWidth: '90px', textAlign: 'right', color: '#475569', fontWeight: 800 }}>
                            {damageRecovery > 0 ? f(damageRecovery) : '0.00'}
                          </div>
                        </div>
                      </td>
                    </tr>

                    {/* 4. Cash/Bank TF/Others */}
                    <tr style={{ background: '#f8fafc' }}>
                      <td style={{ padding: '12px 20px', borderBottom: '1px dashed #cbd5e1', borderRight: '1px solid #e2e8f0', color: '#1e293b' }}>
                        Cash/Bank TF/Others
                      </td>
                      <td style={{ padding: '8px 20px', borderBottom: '1px dashed #cbd5e1', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                          <span style={{ color: '#64748b' }}>₹</span>
                          <div style={{ background: '#e2e8f0', border: '1px solid #cbd5e1', padding: '6px 10px', borderRadius: '8px', minWidth: '90px', textAlign: 'right', color: '#475569', fontWeight: 800 }}>
                            {cashBankOthers > 0 ? f(cashBankOthers) : '0.00'}
                          </div>
                        </div>
                      </td>
                    </tr>

                    {/* 5. GPS Device */}
                    <tr style={{ background: '#fff' }}>
                      <td style={{ padding: '12px 20px', borderBottom: '1px dashed #cbd5e1', borderRight: '1px solid #e2e8f0', color: '#1e293b' }}>
                        GPS Device
                      </td>
                      <td style={{ padding: '8px 20px', borderBottom: '1px dashed #cbd5e1', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                          <span style={{ color: '#64748b' }}>₹</span>
                          <div style={{ background: '#e2e8f0', border: '1px solid #cbd5e1', padding: '6px 10px', borderRadius: '8px', minWidth: '90px', textAlign: 'right', color: '#475569', fontWeight: 800 }}>
                            {gpsDevice > 0 ? f(gpsDevice) : '0.00'}
                          </div>
                        </div>
                      </td>
                    </tr>

                    {/* 6. Other Deduction */}
                    <tr style={{ background: '#f8fafc' }}>
                      <td style={{ padding: '12px 20px', borderBottom: '1px dashed #cbd5e1', borderRight: '1px solid #e2e8f0', color: '#1e293b' }}>
                        Other Deduction
                      </td>
                      <td style={{ padding: '8px 20px', borderBottom: '1px dashed #cbd5e1', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                          <span style={{ color: '#64748b' }}>₹</span>
                          <div style={{ background: '#e2e8f0', border: '1px solid #cbd5e1', padding: '6px 10px', borderRadius: '8px', minWidth: '90px', textAlign: 'right', color: '#475569', fontWeight: 800 }}>
                            {otherDeduction > 0 ? f(otherDeduction) : '0.00'}
                          </div>
                        </div>
                      </td>
                    </tr>

                    {/* ── NET BALANCE ── */}
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

                    {/* ── NET PAYABLE ── */}
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
