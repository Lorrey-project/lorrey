import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box, Typography, IconButton, Tabs, Tab, Paper, TextField, Chip,
  Button, Snackbar, Alert, CircularProgress, Tooltip
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PersonIcon from '@mui/icons-material/Person';
import BusinessIcon from '@mui/icons-material/Business';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import axios from 'axios';
import { API_URL } from '../config';
import { toIndianWords } from '../utils/toIndianWords';

const CREDITOR_TABS = [
  {
    id: 0,
    creditorKey: 'DIPALI_ASSOCIATES',
    name: 'DIPALI ASSOCIATES(DIPALI NAYEK)',
    creditorTitle: 'DIPALI ASSOCIATES',
    ownerName: 'Dipali Nayek',
    firmName: 'Dipali Associates',
    address: 'Netaji Shubash Pally, Durgaur-713201, Bardhaman, West Bengal',
    gstn: '19AQRPN7331C1ZL',
    pan: 'AQRPN7331C',
    bankName: 'Central Bank Of India',
    branch: 'HATTALA ROAD',
    accountNo: '5467713899',
    ifsc: 'CBIN0280120',
    minGuaranteeRow1: '25 Days/150km per day',
    fixedRentalText: 'Rs.10000/day',
    fixedRentalRate: 10000,
    hsnCode: '996601',
    minGuaranteeRow2: 'N/A',
    extraWorkingText: 'Rs.80/km',
    extraWorkingRate: 80
  },
  {
    id: 1,
    creditorKey: 'GKR_ENTERPRISE',
    name: 'G.K.R.  ENTERPRISE',
    creditorTitle: 'G.K.R. ENTERPRISE',
    ownerName: 'Goutam Roy',
    firmName: 'G.K.R. Enterprise',
    address: '',
    gstn: '',
    pan: '',
    bankName: '',
    branch: '',
    accountNo: '',
    ifsc: '',
    minGuaranteeRow1: '25 Days/150km per day',
    fixedRentalText: 'Rs.10000/day',
    fixedRentalRate: 10000,
    hsnCode: '996601',
    minGuaranteeRow2: 'N/A',
    extraWorkingText: 'Rs.80/km',
    extraWorkingRate: 80
  },
  {
    id: 2,
    creditorKey: 'SUBHENDU_SEKHAR_GHOSWAMI',
    name: 'SUBHENDU SEKHAR GHOSWAMI',
    creditorTitle: 'SUBHENDU SEKHAR GHOSWAMI',
    ownerName: 'Subhendu Sekhar Ghoswami',
    firmName: '',
    address: '',
    gstn: '',
    pan: '',
    bankName: '',
    branch: '',
    accountNo: '',
    ifsc: '',
    minGuaranteeRow1: '25 Days/150km per day',
    fixedRentalText: 'Rs.10000/day',
    fixedRentalRate: 10000,
    hsnCode: '996601',
    minGuaranteeRow2: 'N/A',
    extraWorkingText: 'Rs.80/km',
    extraWorkingRate: 80
  }
];

/**
 * Extracts a positive numeric rate from a string (e.g. 'Rs.10000/day' -> 10000, 'Rs.80/km' -> 80)
 * or returns defaultRate if unavailable.
 */
export function extractNumericRate(val, defaultRate) {
  if (typeof val === 'number' && !isNaN(val) && val > 0) return val;
  if (!val) return defaultRate || 0;
  const match = String(val).match(/(\d+(\.\d+)?)/);
  if (match && match[1]) {
    const num = Number(match[1]);
    return !isNaN(num) && num > 0 ? num : (defaultRate || 0);
  }
  return defaultRate || 0;
}

/**
 * Normalizes any date string or Date object safely without timezone offset issues.
 */
export function parseDateSafe(dateInput) {
  if (!dateInput) return new Date();
  if (dateInput instanceof Date && !isNaN(dateInput.getTime())) return dateInput;
  
  const str = String(dateInput).trim();
  // Format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  // Format: DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY
  if (/^\d{1,2}[-/.](0[1-9]|1[0-2]|\d{1,2})[-/.]\d{4}$/.test(str)) {
    const [d, m, y] = str.split(/[-/.]/).map(Number);
    return new Date(y, m - 1, d);
  }
  const fallback = new Date(str);
  return isNaN(fallback.getTime()) ? new Date() : fallback;
}

export const FY_OPTIONS = ['FY 2026-27', 'FY 2025-26', 'FY 2024-25', 'FY 2027-28', 'FY 2023-24'];

export const FY_MONTHS = [
  { name: 'April', monthNum: 4, half: 'H1', position: '01' },
  { name: 'May', monthNum: 5, half: 'H1', position: '02' },
  { name: 'June', monthNum: 6, half: 'H1', position: '03' },
  { name: 'July', monthNum: 7, half: 'H1', position: '04' },
  { name: 'August', monthNum: 8, half: 'H1', position: '05' },
  { name: 'September', monthNum: 9, half: 'H1', position: '06' },
  { name: 'October', monthNum: 10, half: 'H2', position: '01' },
  { name: 'November', monthNum: 11, half: 'H2', position: '02' },
  { name: 'December', monthNum: 12, half: 'H2', position: '03' },
  { name: 'January', monthNum: 1, half: 'H2', position: '04' },
  { name: 'February', monthNum: 2, half: 'H2', position: '05' },
  { name: 'March', monthNum: 3, half: 'H2', position: '06' }
];

/**
 * Authoritative Tax Invoice Details generator:
 * Format: DAC / FINANCIAL YEAR / H1-or-H2 / MONTH-POSITION-IN-HALF
 * e.g., FY 2026-27 + September -> DAC/26-27/H1/06
 *       FY 2026-27 + October   -> DAC/26-27/H2/01
 *       FY 2026-27 + January   -> DAC/26-27/H2/04
 *       FY 2026-27 + March     -> DAC/26-27/H2/06
 */
export function getInvoiceTaxDetails(fyOrDate, monthNameInput) {
  // If invoked with FY and Month name (e.g. 'FY 2026-27', 'September')
  if (monthNameInput || (typeof fyOrDate === 'string' && fyOrDate.includes('FY'))) {
    const selectedFy = typeof fyOrDate === 'string' && fyOrDate.includes('FY') ? fyOrDate : 'FY 2026-27';
    const selectedMonth = monthNameInput || 'September';

    let startYear = 2026;
    const match = String(selectedFy).match(/(\d{4})/);
    if (match) {
      startYear = Number(match[1]);
    }
    const endYear = startYear + 1;
    const fyStr = `${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`;
    const fullFy = `FY ${startYear}-${String(endYear).slice(-2)}`;

    const monthObj = FY_MONTHS.find(m => m.name.toLowerCase() === String(selectedMonth).toLowerCase()) || FY_MONTHS[5];
    const month = monthObj.monthNum;
    const half = monthObj.half;
    const monthPosition = monthObj.position;
    const year = (month >= 4 && month <= 12) ? startYear : endYear;

    const invoiceNumber = `DAC/${fyStr}/${half}/${monthPosition}`;
    const lastDay = new Date(year, month, 0).getDate();
    const formattedDate = `${String(lastDay).padStart(2, '0')}.${String(month).padStart(2, '0')}.${String(year).slice(-2)}`;
    const dateInputStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    return {
      invoiceNumber,
      fyStr,
      fullFy,
      half,
      monthPosition,
      formattedDate,
      dateInputStr,
      monthName: monthObj.name,
      year,
      month,
      day: lastDay
    };
  }

  // Fallback for dateInput parameter
  const d = parseDateSafe(fyOrDate);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();

  let fyStartYear, fyEndYear;
  if (month >= 4 && month <= 12) {
    fyStartYear = year;
    fyEndYear = year + 1;
  } else {
    fyStartYear = year - 1;
    fyEndYear = year;
  }
  const fyStr = `${String(fyStartYear).slice(-2)}-${String(fyEndYear).slice(-2)}`;
  const fullFy = `FY ${fyStartYear}-${String(fyEndYear).slice(-2)}`;

  let half;
  let monthPosition;
  if (month >= 4 && month <= 9) {
    half = 'H1';
    monthPosition = month - 3;
  } else {
    half = 'H2';
    monthPosition = (month >= 10 && month <= 12) ? month - 9 : month + 3;
  }

  const monthPosStr = String(monthPosition).padStart(2, '0');
  const invoiceNumber = `DAC/${fyStr}/${half}/${monthPosStr}`;
  const formattedDate = `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${String(year).slice(-2)}`;
  const dateInputStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const monthName = FY_MONTHS.find(m => m.monthNum === month)?.name || 'September';

  return {
    invoiceNumber,
    fyStr,
    fullFy,
    half,
    monthPosition: monthPosStr,
    formattedDate,
    dateInputStr,
    monthName,
    year,
    month,
    day
  };
}

// Format numbers in Indian numbering system, or '—' if null/empty
const fmtNum = (val) => {
  if (val === undefined || val === null || val === '') return '—';
  const n = Number(val);
  if (isNaN(n)) return '—';
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
};

// Format Extra Km preserving exact fractional precision up to 6 decimals
const fmtKm = (val) => {
  if (val === undefined || val === null || val === '') return '—';
  const n = Number(val);
  if (isNaN(n)) return '—';
  return n.toLocaleString('en-IN', { maximumFractionDigits: 6 });
};

function CreditorInvoiceSpreadsheet({ creditor, taxDetails }) {
  const [breakdownData, setBreakdownData] = useState([]);
  const [editValues, setEditValues] = useState({});
  const [selectedVehicleNo, setSelectedVehicleNo] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState(null);

  const creditorKey = creditor.creditorKey || 'DIPALI_ASSOCIATES';
  const { month, year, fyStr } = taxDetails;

  // Fetch breakdown data from backend for the selected creditor and month/year
  const fetchBreakdown = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/freight-creditor-gst/data`, {
        params: {
          creditorKey,
          month,
          year,
          fy: fyStr
        }
      });

      if (res.data?.success && Array.isArray(res.data.rows)) {
        setBreakdownData(res.data.rows);
        const initialEdits = {};
        res.data.rows.forEach(r => {
          initialEdits[r.vehicleNo] = {
            incentiveM2: r.incentiveM2 !== null && r.incentiveM2 !== undefined ? String(r.incentiveM2) : '',
            incentiveM1: r.incentiveM1 !== null && r.incentiveM1 !== undefined ? String(r.incentiveM1) : ''
          };
        });
        setEditValues(initialEdits);
      }
    } catch (err) {
      console.error('[FreightCreditorGst] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [creditorKey, month, year, fyStr]);

  useEffect(() => {
    fetchBreakdown();
  }, [fetchBreakdown]);

  // Keep selected vehicle in sync with available rows
  useEffect(() => {
    if (breakdownData.length > 0) {
      setSelectedVehicleNo(prev => {
        const exists = breakdownData.some(r => r.vehicleNo === prev);
        return exists ? prev : breakdownData[0].vehicleNo;
      });
    } else {
      setSelectedVehicleNo('');
    }
  }, [breakdownData]);

  // Handle manual input change for M-2 and M-1
  const handleInputChange = (vehNo, field, val) => {
    setEditValues(prev => ({
      ...prev,
      [vehNo]: {
        ...(prev[vehNo] || { incentiveM2: '', incentiveM1: '' }),
        [field]: val
      }
    }));
  };

  // Check if there are unsaved pending edits
  const hasPendingChanges = useMemo(() => {
    return breakdownData.some(r => {
      const current = editValues[r.vehicleNo] || {};
      const origM2 = r.incentiveM2 !== null && r.incentiveM2 !== undefined ? String(r.incentiveM2) : '';
      const origM1 = r.incentiveM1 !== null && r.incentiveM1 !== undefined ? String(r.incentiveM1) : '';
      const curM2 = current.incentiveM2 !== undefined ? String(current.incentiveM2) : '';
      const curM1 = current.incentiveM1 !== undefined ? String(current.incentiveM1) : '';
      return origM2 !== curM2 || origM1 !== curM1;
    });
  }, [breakdownData, editValues]);

  // Save manual M-2 and M-1 entries to MongoDB
  const handleSave = async () => {
    setSaving(true);
    try {
      const payloadRows = breakdownData.map(r => {
        const current = editValues[r.vehicleNo] || {};
        const m2 = current.incentiveM2 !== '' && current.incentiveM2 !== undefined ? Number(current.incentiveM2) : null;
        const m1 = current.incentiveM1 !== '' && current.incentiveM1 !== undefined ? Number(current.incentiveM1) : null;
        return {
          vehicleNo: r.vehicleNo,
          ownerName: r.ownerName,
          incentiveM2: isNaN(m2) ? null : m2,
          incentiveM1: isNaN(m1) ? null : m1
        };
      });

      const res = await axios.post(`${API_URL}/freight-creditor-gst/save`, {
        creditorKey,
        fy: fyStr,
        month,
        year,
        rows: payloadRows
      });

      if (res.data?.success) {
        setSnack({ type: 'success', text: `Incentive breakdown saved successfully for ${creditor.creditorTitle || creditor.name}!` });
        await fetchBreakdown();
      } else {
        setSnack({ type: 'error', text: res.data?.error || 'Failed to save incentive breakdown' });
      }
    } catch (err) {
      console.error('[FreightCreditorGst] Save error:', err);
      setSnack({ type: 'error', text: err.response?.data?.error || err.message || 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  // Compute live computed rows & totals incorporating local edits
  const { displayRows, computedTotals } = useMemo(() => {
    let totalM2 = 0;
    let hasM2 = false;
    let totalM1 = 0;
    let hasM1 = false;
    let totalBasic = 0;
    let hasBasic = false;
    let grandTotal = 0;
    let hasGrandTotal = false;

    const rows = breakdownData.map(r => {
      const current = editValues[r.vehicleNo] || {};
      const m2Str = current.incentiveM2 !== undefined ? current.incentiveM2 : (r.incentiveM2 !== null ? String(r.incentiveM2) : '');
      const m1Str = current.incentiveM1 !== undefined ? current.incentiveM1 : (r.incentiveM1 !== null ? String(r.incentiveM1) : '');

      const m2Num = m2Str !== '' && !isNaN(Number(m2Str)) ? Number(m2Str) : null;
      const m1Num = m1Str !== '' && !isNaN(Number(m1Str)) ? Number(m1Str) : null;
      const basicNum = r.basicCurrM !== null && r.basicCurrM !== undefined ? Number(r.basicCurrM) : null;

      let rowTotal = null;
      if (m2Num !== null || m1Num !== null || basicNum !== null) {
        rowTotal = (m2Num || 0) + (m1Num || 0) + (basicNum || 0);
      }

      if (m2Num !== null) {
        totalM2 += m2Num;
        hasM2 = true;
      }
      if (m1Num !== null) {
        totalM1 += m1Num;
        hasM1 = true;
      }
      if (basicNum !== null) {
        totalBasic += basicNum;
        hasBasic = true;
      }
      if (rowTotal !== null) {
        grandTotal += rowTotal;
        hasGrandTotal = true;
      }

      return {
        ...r,
        m2Input: m2Str,
        m1Input: m1Str,
        m2Num,
        m1Num,
        basicNum,
        rowTotal
      };
    });

    return {
      displayRows: rows,
      computedTotals: {
        totalM2: hasM2 ? totalM2 : null,
        totalM1: hasM1 ? totalM1 : null,
        totalBasic: hasBasic ? totalBasic : null,
        grandTotal: hasGrandTotal ? grandTotal : null
      }
    };
  }, [breakdownData, editValues]);

  // Active selected vehicle row for the GST Invoice
  const activeVehicleRow = useMemo(() => {
    if (!displayRows.length) return null;
    if (!selectedVehicleNo) return displayRows[0];
    return displayRows.find(r => r.vehicleNo === selectedVehicleNo) || displayRows[0];
  }, [displayRows, selectedVehicleNo]);

  // Taxable Value directly from Working Breakdown's rowTotal for that vehicle
  const taxableValue = useMemo(() => {
    if (!activeVehicleRow || activeVehicleRow.rowTotal === null || activeVehicleRow.rowTotal === undefined) {
      return null;
    }
    const num = Number(activeVehicleRow.rowTotal);
    return isNaN(num) ? null : num;
  }, [activeVehicleRow]);

  // Automatic Working Calculation Algorithm
  const workingAllocation = useMemo(() => {
    if (taxableValue === null || taxableValue === undefined || isNaN(taxableValue) || taxableValue < 0) {
      return {
        hasData: false,
        days: null,
        row1Total: null,
        remainingAmount: null,
        extraKm: null,
        row2Total: null
      };
    }

    if (taxableValue === 0) {
      return {
        hasData: true,
        days: 0,
        row1Total: 0,
        remainingAmount: 0,
        extraKm: 0,
        row2Total: 0
      };
    }

    const fixedRate = extractNumericRate(creditor.fixedRentalRate || creditor.fixedRentalText, 10000);
    const extraRate = extractNumericRate(creditor.extraWorkingRate || creditor.extraWorkingText, 80);

    if (!fixedRate || fixedRate <= 0) {
      return {
        hasData: false,
        days: null,
        row1Total: null,
        remainingAmount: null,
        extraKm: null,
        row2Total: null,
        error: 'Invalid or missing Fixed Rental Rate'
      };
    }

    // Step 1: Days = FLOOR(T / F)
    const days = Math.floor(taxableValue / fixedRate);

    // Step 2: Fixed Rental Total = Days * F
    const row1Total = days * fixedRate;

    // Step 3: Remaining = T - Fixed Rental Total
    const remaining = taxableValue - row1Total;

    // Step 4 & 5: Extra Km = Remaining / E, Extra Working Total = Extra Km * E
    let extraKm = 0;
    let row2Total = 0;

    if (remaining > 0) {
      if (extraRate && extraRate > 0) {
        extraKm = remaining / extraRate;
        row2Total = remaining; // Exact reconciliation: row1Total + row2Total === taxableValue
      } else {
        extraKm = null;
        row2Total = null;
      }
    } else {
      extraKm = 0;
      row2Total = 0;
    }

    return {
      hasData: true,
      fixedRate,
      extraRate,
      days,
      row1Total,
      remainingAmount: remaining,
      extraKm,
      row2Total
    };
  }, [taxableValue, creditor]);

  const cgstValue = useMemo(() => {
    if (taxableValue === null) return null;
    return Math.round((taxableValue * 0.09) * 100) / 100;
  }, [taxableValue]);

  const sgstValue = useMemo(() => {
    if (taxableValue === null) return null;
    return Math.round((taxableValue * 0.09) * 100) / 100;
  }, [taxableValue]);

  const totalInvoiceAmount = useMemo(() => {
    if (taxableValue === null) return null;
    return Math.round((taxableValue + (cgstValue || 0) + (sgstValue || 0)) * 100) / 100;
  }, [taxableValue, cgstValue, sgstValue]);

  const totalInWords = useMemo(() => {
    if (totalInvoiceAmount === null) return '—';
    return toIndianWords(totalInvoiceAmount);
  }, [totalInvoiceAmount]);

  const tableHeaderStyle = {
    backgroundColor: '#f1f5f9',
    color: '#0f172a',
    fontWeight: 800,
    fontSize: '12px',
    textAlign: 'center',
    padding: '8px 10px',
    border: '1px solid #94a3b8',
    whiteSpace: 'nowrap'
  };

  const tableCellStyle = {
    padding: '8px 10px',
    border: '1px solid #cbd5e1',
    fontSize: '12px',
    color: '#1e293b',
    backgroundColor: '#ffffff'
  };

  const sideTableHeaderStyle = {
    color: '#0f172a',
    fontWeight: 800,
    fontSize: '11px',
    textAlign: 'center',
    padding: '6px 8px',
    border: '1px solid #94a3b8',
    whiteSpace: 'nowrap'
  };

  const sideTableCellStyle = {
    padding: '5px 6px',
    border: '1px solid #cbd5e1',
    fontSize: '11px',
    textAlign: 'center',
    color: '#1e293b',
    backgroundColor: '#ffffff'
  };

  return (
    <Box sx={{ width: '100%', overflowX: 'auto', pb: 3 }}>
      <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start', minWidth: '1380px' }}>
        
        {/* ── Main Invoice Document Form (Left / Primary Block) ── */}
        <Paper
          elevation={4}
          sx={{
            flex: '1 1 760px',
            maxWidth: '820px',
            bgcolor: '#ffffff',
            color: '#0f172a',
            borderRadius: '4px',
            border: '2px solid #0f172a',
            p: 0,
            overflow: 'hidden'
          }}
        >
          {/* Top Header Section */}
          <Box sx={{ p: 2, textAlign: 'center', position: 'relative', borderBottom: '1px solid #0f172a', bgcolor: '#f8fafc' }}>
            <Typography
              variant="caption"
              sx={{
                position: 'absolute',
                top: 8,
                right: 12,
                fontSize: '10px',
                fontStyle: 'italic',
                color: '#64748b'
              }}
            >
              Duplicate For Receiving
            </Typography>

            <Typography variant="h6" fontWeight="900" sx={{ letterSpacing: '0.5px', color: '#0f172a', textTransform: 'uppercase' }}>
              {creditor.creditorTitle || creditor.name}
            </Typography>
            {creditor.ownerName && (
              <Typography variant="body2" fontWeight="700" color="#334155">
                {creditor.ownerName}
              </Typography>
            )}
            {creditor.firmName && creditor.firmName !== creditor.creditorTitle && (
              <Typography variant="body2" fontWeight="600" color="#475569">
                {creditor.firmName}
              </Typography>
            )}
            <Typography variant="caption" display="block" color="#475569" sx={{ mt: 0.3 }}>
              {creditor.address || '—'}
            </Typography>
          </Box>

          {/* Section: TAX INVOICE */}
          <Box sx={{ bgcolor: '#e2e8f0', py: 0.8, textAlign: 'center', borderBottom: '1px solid #0f172a' }}>
            <Typography variant="subtitle2" fontWeight="900" sx={{ letterSpacing: '1px', color: '#0f172a' }}>
              TAX INVOICE
            </Typography>
          </Box>

          {/* BILL TO / BILL FROM Section */}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid #0f172a' }}>
            {/* BILL TO */}
            <Box sx={{ p: 1.5, borderRight: '1px solid #0f172a', fontSize: '11px', lineHeight: 1.4 }}>
              <Typography variant="caption" fontWeight="900" color="#0f172a" display="block" sx={{ mb: 0.5 }}>
                BILL TO,
              </Typography>
              <Typography variant="body2" fontWeight="700" fontSize="11px" color="#1e293b">
                Dipali Associates & Co.,
              </Typography>
              <Typography variant="caption" color="#475569" display="block">
                Regd. Office: 1st Floor, Panja Hotel, Panagarh, G T Road, Darjeeling More, Debipur, Paschim Bardhaman, West Bengal, 713148
              </Typography>
              <Typography variant="caption" fontWeight="700" color="#0f172a" display="block" sx={{ mt: 0.5 }}>
                GSTN: 19AATFD1733C1ZH
              </Typography>
            </Box>

            {/* BILL FROM */}
            <Box sx={{ p: 1.5, fontSize: '11px', lineHeight: 1.4 }}>
              <Typography variant="caption" fontWeight="900" color="#0f172a" display="block" sx={{ mb: 0.5 }}>
                BILL FROM,
              </Typography>
              <Typography variant="body2" fontWeight="700" fontSize="11px" color="#1e293b">
                {creditor.ownerName || creditor.creditorTitle || '—'}
              </Typography>
              <Typography variant="caption" color="#475569" display="block">
                {creditor.firmName || creditor.creditorTitle || '—'}
              </Typography>
              <Typography variant="caption" color="#475569" display="block">
                {creditor.address || '—'}
              </Typography>
              <Typography variant="caption" fontWeight="700" color="#0f172a" display="block" sx={{ mt: 0.5 }}>
                GSTN: {creditor.gstn || '—'}
              </Typography>
            </Box>
          </Box>

          {/* VEHICLE SELECTOR (When multiple vehicles exist) */}
          {displayRows.length > 1 && (
            <Box
              sx={{
                px: 2,
                py: 1,
                bgcolor: '#f1f5f9',
                borderBottom: '1px solid #0f172a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 1
              }}
            >
              <Typography variant="caption" fontWeight="900" color="#0f172a" sx={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                Select Vehicle Invoice:
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {displayRows.map(r => {
                  const isSel = (activeVehicleRow?.vehicleNo === r.vehicleNo);
                  return (
                    <Button
                      key={r.vehicleNo}
                      size="small"
                      onClick={() => setSelectedVehicleNo(r.vehicleNo)}
                      sx={{
                        py: 0.3,
                        px: 1.2,
                        fontSize: '11px',
                        fontWeight: 900,
                        borderRadius: '4px',
                        textTransform: 'none',
                        minHeight: '26px',
                        bgcolor: isSel ? '#0f172a' : '#ffffff',
                        color: isSel ? '#ffffff' : '#334155',
                        border: '1px solid',
                        borderColor: isSel ? '#0f172a' : '#cbd5e1',
                        boxShadow: isSel ? '0 2px 4px rgba(0,0,0,0.15)' : 'none',
                        '&:hover': { bgcolor: isSel ? '#1e293b' : '#f8fafc' }
                      }}
                    >
                      {r.vehicleNo}
                    </Button>
                  );
                })}
              </Box>
            </Box>
          )}

          {/* TAX INVOICE NO, DATE & VEHICLE NO (AUTOMATIC GENERATION) */}
          <Box sx={{ display: 'grid', gridTemplateColumns: activeVehicleRow?.vehicleNo ? '1.2fr 1fr 1fr' : '1fr 1fr', borderBottom: '1px solid #0f172a', bgcolor: '#f8fafc' }}>
            <Box sx={{ p: 1.2, borderRight: '1px solid #0f172a' }}>
              <Typography variant="caption" fontWeight="900" color="#0f172a" sx={{ fontSize: '11px' }}>
                TAX INVOICE NO:{' '}
                <span style={{ fontWeight: 900, color: '#0369a1', fontFamily: 'monospace', letterSpacing: '0.5px' }}>
                  {taxDetails.invoiceNumber}
                </span>
              </Typography>
            </Box>
            <Box sx={{ p: 1.2, borderRight: activeVehicleRow?.vehicleNo ? '1px solid #0f172a' : 'none' }}>
              <Typography variant="caption" fontWeight="900" color="#0f172a" sx={{ fontSize: '11px' }}>
                DATE:{' '}
                <span style={{ fontWeight: 800, color: '#334155' }}>
                  {taxDetails.formattedDate}
                </span>
              </Typography>
            </Box>
            {activeVehicleRow?.vehicleNo && (
              <Box sx={{ p: 1.2 }}>
                <Typography variant="caption" fontWeight="900" color="#0f172a" sx={{ fontSize: '11px' }}>
                  VEHICLE NO:{' '}
                  <span style={{ fontWeight: 900, color: '#0369a1', letterSpacing: '0.5px' }}>
                    {activeVehicleRow.vehicleNo}
                  </span>
                </Typography>
              </Box>
            )}
          </Box>

          {/* Invoice Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', border: 'none' }}>
            <thead>
              <tr>
                <th rowSpan={2} style={{ ...tableHeaderStyle, width: '45px' }}>SL.No.</th>
                <th rowSpan={2} style={{ ...tableHeaderStyle, textAlign: 'left' }}>Particulars</th>
                <th rowSpan={2} style={{ ...tableHeaderStyle, width: '130px' }}>Min Guarantee</th>
                <th rowSpan={2} style={{ ...tableHeaderStyle, width: '95px' }}>Fixed Rental</th>
                <th rowSpan={2} style={{ ...tableHeaderStyle, width: '80px' }}>HSN/SAC<br />Code</th>
                <th colSpan={2} style={{ ...tableHeaderStyle, width: '120px' }}>Actual Working</th>
                <th rowSpan={2} style={{ ...tableHeaderStyle, width: '105px' }}>Total Amount</th>
              </tr>
              <tr>
                <th style={{ ...tableHeaderStyle, fontSize: '11px', width: '55px', bgcolor: '#e2e8f0' }}>Days</th>
                <th style={{ ...tableHeaderStyle, fontSize: '11px', width: '65px', bgcolor: '#e2e8f0' }}>Extra Km</th>
              </tr>
            </thead>
            <tbody>
              {/* Row 1: Fixed Rental charges */}
              <tr>
                <td style={{ ...tableCellStyle, textAlign: 'center', fontWeight: 700 }}>1</td>
                <td style={{ ...tableCellStyle, fontWeight: 600 }}>Fixed Rental charges</td>
                <td style={{ ...tableCellStyle, textAlign: 'center', fontSize: '11px' }}>
                  {creditor.minGuaranteeRow1 || '25 Days/150km per day'}
                </td>
                <td style={{ ...tableCellStyle, textAlign: 'center', fontSize: '11px' }}>
                  {creditor.fixedRentalText || 'Rs.10000/day'}
                </td>
                <td style={{ ...tableCellStyle, textAlign: 'center', fontWeight: 600 }}>
                  {creditor.hsnCode || '996601'}
                </td>
                <td style={{ ...tableCellStyle, textAlign: 'center', fontWeight: 700, color: workingAllocation.hasData && workingAllocation.days !== null ? '#0f172a' : '#94a3b8' }}>
                  {workingAllocation.hasData && workingAllocation.days !== null ? workingAllocation.days : '—'}
                </td>
                <td style={{ ...tableCellStyle, textAlign: 'center', color: '#94a3b8' }}>—</td>
                <td style={{ ...tableCellStyle, textAlign: 'right', fontWeight: 700, color: workingAllocation.hasData && workingAllocation.row1Total !== null ? '#0f172a' : '#94a3b8' }}>
                  {workingAllocation.hasData && workingAllocation.row1Total !== null ? fmtNum(workingAllocation.row1Total) : '—'}
                </td>
              </tr>

              {/* Row 2: Extra Working Rental */}
              <tr>
                <td style={{ ...tableCellStyle, textAlign: 'center', fontWeight: 700 }}>2</td>
                <td style={{ ...tableCellStyle, fontWeight: 600 }}>Extra Working Rental</td>
                <td style={{ ...tableCellStyle, textAlign: 'center', fontSize: '11px' }}>
                  {creditor.minGuaranteeRow2 || 'N/A'}
                </td>
                <td style={{ ...tableCellStyle, textAlign: 'center', fontSize: '11px' }}>
                  {creditor.extraWorkingText || 'Rs.80/km'}
                </td>
                <td style={{ ...tableCellStyle, textAlign: 'center', color: '#94a3b8' }}>—</td>
                <td style={{ ...tableCellStyle, textAlign: 'center', color: '#94a3b8' }}>—</td>
                <td style={{ ...tableCellStyle, textAlign: 'center', fontWeight: 700, color: workingAllocation.hasData && workingAllocation.extraKm !== null ? (workingAllocation.extraKm > 0 ? '#0f172a' : '#94a3b8') : '#94a3b8' }}>
                  {workingAllocation.hasData && workingAllocation.extraKm !== null ? (workingAllocation.extraKm > 0 ? fmtKm(workingAllocation.extraKm) : '—') : '—'}
                </td>
                <td style={{ ...tableCellStyle, textAlign: 'right', fontWeight: 700, color: workingAllocation.hasData && workingAllocation.row2Total !== null ? (workingAllocation.row2Total > 0 ? '#0f172a' : '#94a3b8') : '#94a3b8' }}>
                  {workingAllocation.hasData && workingAllocation.row2Total !== null ? (workingAllocation.row2Total > 0 ? fmtNum(workingAllocation.row2Total) : '—') : '—'}
                </td>
              </tr>

              {/* Totals Section */}
              <tr>
                <td colSpan={7} style={{ ...tableCellStyle, textAlign: 'right', fontWeight: 800, bgcolor: '#f8fafc', letterSpacing: '0.5px' }}>
                  TOTAL TAXABLE VALUE
                </td>
                <td style={{ ...tableCellStyle, textAlign: 'right', fontWeight: 800, color: taxableValue !== null ? '#0f172a' : '#94a3b8', bgcolor: '#f8fafc' }}>
                  {fmtNum(taxableValue)}
                </td>
              </tr>
              <tr>
                <td colSpan={7} style={{ ...tableCellStyle, textAlign: 'right', fontWeight: 700, bgcolor: '#ffffff' }}>
                  ADD : CGST 9%
                </td>
                <td style={{ ...tableCellStyle, textAlign: 'right', fontWeight: 700, color: cgstValue !== null ? '#0f172a' : '#94a3b8' }}>
                  {fmtNum(cgstValue)}
                </td>
              </tr>
              <tr>
                <td colSpan={7} style={{ ...tableCellStyle, textAlign: 'right', fontWeight: 700, bgcolor: '#ffffff' }}>
                  ADD : SGST 9%
                </td>
                <td style={{ ...tableCellStyle, textAlign: 'right', fontWeight: 700, color: sgstValue !== null ? '#0f172a' : '#94a3b8' }}>
                  {fmtNum(sgstValue)}
                </td>
              </tr>
              <tr>
                <td colSpan={7} style={{ ...tableCellStyle, textAlign: 'right', fontWeight: 900, bgcolor: '#f1f5f9', fontSize: '13px' }}>
                  TOTAL AMOUNT
                </td>
                <td style={{ ...tableCellStyle, textAlign: 'right', fontWeight: 900, color: totalInvoiceAmount !== null ? '#0f172a' : '#94a3b8', bgcolor: '#f1f5f9', fontSize: '13px' }}>
                  {fmtNum(totalInvoiceAmount)}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Footer Details: In Words, Bank Details, Signature */}
          <Box sx={{ display: 'grid', gridTemplateColumns: '62% 38%', borderTop: '1px solid #0f172a' }}>
            {/* Left Box: Value in words + Bank details + T&C */}
            <Box sx={{ p: 1.5, borderRight: '1px solid #0f172a', fontSize: '11px', lineHeight: 1.45 }}>
              <Typography variant="caption" fontWeight="800" color="#0f172a" display="block">
                Total Invoice Value(In Word)
              </Typography>
              <Typography variant="caption" fontStyle="italic" color={totalInvoiceAmount !== null ? '#0f172a' : '#64748b'} display="block" sx={{ mb: 1, fontWeight: totalInvoiceAmount !== null ? 700 : 400 }}>
                {totalInWords}
              </Typography>

              <Typography variant="caption" color="#1e293b" display="block">
                1) Please Pay by Account Payee Cheque/RTGS in Favour Of {creditor.ownerName || creditor.creditorTitle || '—'}
              </Typography>
              <Typography variant="caption" color="#1e293b" display="block">
                A/C NO.{creditor.accountNo || '—'}, Bank: {creditor.bankName || '—'}, Branch: {creditor.branch || '—'} IFSC Code: {creditor.ifsc || '—'}
              </Typography>
              <Typography variant="caption" color="#1e293b" display="block" sx={{ mt: 0.5 }}>
                2) Interest will be charged @18% P.A if the invoice are not paid within 30days from the date of the invoice.
              </Typography>

              <Typography variant="caption" fontWeight="800" color="#0f172a" display="block" sx={{ mt: 1 }}>
                PAN: {creditor.pan || '—'}
              </Typography>
            </Box>

            {/* Right Box: Signatory */}
            <Box
              sx={{
                p: 1.5,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                alignItems: 'center',
                textAlign: 'center',
                minHeight: '120px'
              }}
            >
              <Typography variant="caption" fontWeight="800" color="#0f172a">
                For {creditor.firmName || creditor.creditorTitle || creditor.name}
              </Typography>
            </Box>
          </Box>
        </Paper>

        {/* ── Right-Side Working Breakdown & Incentive Reference (Authoritative Database-Driven) ── */}
        <Paper
          elevation={3}
          sx={{
            flex: '0 0 540px',
            minWidth: '520px',
            maxWidth: '560px',
            bgcolor: '#ffffff',
            color: '#0f172a',
            borderRadius: '6px',
            border: '1px solid #94a3b8',
            p: 1.5,
            overflow: 'visible',
            boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
          }}
        >
          {/* Header Bar with Title and Save Action */}
          <Box sx={{ mb: 1.2, pb: 0.8, borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Box>
              <Typography variant="caption" fontWeight="900" color="#0f172a" sx={{ letterSpacing: '0.4px', textTransform: 'uppercase', fontSize: '11px', display: 'block', lineHeight: 1.2 }}>
                Working Breakdown & Incentive Reference
              </Typography>
              <Typography variant="caption" color="#64748b" sx={{ fontSize: '10px', fontWeight: 600 }}>
                {creditor.creditorTitle} • {taxDetails.fullFy} (M-{taxDetails.monthPosition})
              </Typography>
            </Box>

            <Box display="flex" alignItems="center" gap={0.8}>
              <Tooltip title="Refresh Party Payment & Saved Incentives">
                <IconButton
                  size="small"
                  onClick={fetchBreakdown}
                  disabled={loading}
                  sx={{ p: 0.4, bgcolor: '#f1f5f9', '&:hover': { bgcolor: '#e2e8f0' } }}
                >
                  <RefreshIcon sx={{ fontSize: 16, animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                </IconButton>
              </Tooltip>

              <Button
                variant="contained"
                size="small"
                startIcon={saving ? <CircularProgress size={12} color="inherit" /> : <SaveIcon sx={{ fontSize: 14 }} />}
                disabled={saving || !hasPendingChanges}
                onClick={handleSave}
                sx={{
                  bgcolor: hasPendingChanges ? '#2563eb' : '#0f172a',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '11px',
                  borderRadius: '6px',
                  textTransform: 'none',
                  px: 1.2,
                  py: 0.3,
                  minHeight: '26px',
                  boxShadow: hasPendingChanges ? '0 2px 6px rgba(37,99,235,0.3)' : 'none',
                  '&:hover': { bgcolor: hasPendingChanges ? '#1d4ed8' : '#1e293b' }
                }}
              >
                {saving ? 'Saving...' : hasPendingChanges ? 'SAVE' : 'SAVED'}
              </Button>
            </Box>
          </Box>

          {/* Table Container */}
          <Box sx={{ width: '100%' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', border: 'none', tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th style={{ ...sideTableHeaderStyle, bgcolor: '#f1f5f9', width: '22%' }}>Vehicle Number</th>
                  <th style={{ ...sideTableHeaderStyle, bgcolor: '#dcfce7', width: '20%' }}>Incentive (M-2)</th>
                  <th style={{ ...sideTableHeaderStyle, bgcolor: '#fef3c7', width: '20%' }}>Incentive (M-1)</th>
                  <th style={{ ...sideTableHeaderStyle, bgcolor: '#e0f2fe', width: '20%' }}>Basic (Curr M)</th>
                  <th style={{ ...sideTableHeaderStyle, bgcolor: '#f1f5f9', width: '18%' }}>Total</th>
                </tr>
              </thead>

              <tbody>
                {displayRows.map((row, idx) => {
                  const vehNo = row.vehicleNo;
                  const isSelected = (activeVehicleRow?.vehicleNo === vehNo);
                  return (
                    <tr
                      key={vehNo || idx}
                      onClick={() => setSelectedVehicleNo(vehNo)}
                      style={{
                        cursor: 'pointer',
                        backgroundColor: isSelected ? '#f0f9ff' : '#ffffff',
                        transition: 'background-color 0.15s'
                      }}
                      title={`Click to view GST Tax Invoice for ${vehNo}`}
                    >
                      {/* Vehicle Number */}
                      <td
                        style={{
                          ...sideTableCellStyle,
                          fontWeight: 900,
                          color: isSelected ? '#0369a1' : '#0f172a',
                          bgcolor: isSelected ? '#e0f2fe' : '#f8fafc',
                          letterSpacing: '0.3px',
                          borderLeft: isSelected ? '3px solid #0284c7' : '1px solid #cbd5e1'
                        }}
                      >
                        {vehNo}
                      </td>

                      {/* Incentive (M-2) — Manual Entry */}
                      <td style={{ ...sideTableCellStyle, padding: '3px 4px' }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={row.m2Input !== undefined ? row.m2Input : ''}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9.-]/g, '');
                            handleInputChange(vehNo, 'incentiveM2', val);
                          }}
                          placeholder="—"
                          style={{
                            width: '100%',
                            border: '1px solid transparent',
                            backgroundColor: row.m2Input !== '' ? '#f0fdf4' : 'transparent',
                            borderRadius: '4px',
                            textAlign: 'center',
                            fontWeight: 700,
                            fontSize: '11px',
                            color: '#166534',
                            padding: '3px 2px',
                            outline: 'none',
                            fontFamily: 'inherit',
                            boxSizing: 'border-box'
                          }}
                          onFocus={(e) => { e.target.style.borderColor = '#16a34a'; e.target.style.backgroundColor = '#ffffff'; }}
                          onBlur={(e) => { e.target.style.borderColor = 'transparent'; e.target.style.backgroundColor = row.m2Input !== '' ? '#f0fdf4' : 'transparent'; }}
                          title={`Incentive M-2 for ${vehNo}`}
                        />
                      </td>

                      {/* Incentive (M-1) — Manual Entry */}
                      <td style={{ ...sideTableCellStyle, padding: '3px 4px' }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={row.m1Input !== undefined ? row.m1Input : ''}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9.-]/g, '');
                            handleInputChange(vehNo, 'incentiveM1', val);
                          }}
                          placeholder="—"
                          style={{
                            width: '100%',
                            border: '1px solid transparent',
                            backgroundColor: row.m1Input !== '' ? '#fffbeb' : 'transparent',
                            borderRadius: '4px',
                            textAlign: 'center',
                            fontWeight: 700,
                            fontSize: '11px',
                            color: '#b45309',
                            padding: '3px 2px',
                            outline: 'none',
                            fontFamily: 'inherit',
                            boxSizing: 'border-box'
                          }}
                          onFocus={(e) => { e.target.style.borderColor = '#f59e0b'; e.target.style.backgroundColor = '#ffffff'; }}
                          onBlur={(e) => { e.target.style.borderColor = 'transparent'; e.target.style.backgroundColor = row.m1Input !== '' ? '#fffbeb' : 'transparent'; }}
                          title={`Incentive M-1 for ${vehNo}`}
                        />
                      </td>

                      {/* Basic (Curr M) — Automatic from Party Payment Details */}
                      <td
                        style={{
                          ...sideTableCellStyle,
                          fontWeight: 700,
                          color: row.basicNum !== null ? '#0369a1' : '#64748b',
                          backgroundColor: '#f0f9ff'
                        }}
                        title={`Authoritative Party Payment Gross Freight (95% Payable) for ${vehNo}`}
                      >
                        {fmtNum(row.basicNum)}
                      </td>

                      {/* Total */}
                      <td style={{ ...sideTableCellStyle, fontWeight: 900, color: row.rowTotal !== null ? '#0f172a' : '#64748b', bgcolor: isSelected ? '#f0f9ff' : '#ffffff' }}>
                        {fmtNum(row.rowTotal)}
                      </td>
                    </tr>
                  );
                })}

                {/* Total Summary Row (when more than 1 vehicle) */}
                {displayRows.length > 1 && (
                  <tr style={{ backgroundColor: '#f8fafc', fontWeight: 900 }}>
                    <td style={{ ...sideTableCellStyle, fontWeight: 900, bgcolor: '#f8fafc', color: '#0f172a' }}>
                      TOTAL
                    </td>
                    <td style={{ ...sideTableCellStyle, fontWeight: 900, bgcolor: '#f8fafc', color: computedTotals.totalM2 !== null ? '#166534' : '#64748b' }}>
                      {fmtNum(computedTotals.totalM2)}
                    </td>
                    <td style={{ ...sideTableCellStyle, fontWeight: 900, bgcolor: '#f8fafc', color: computedTotals.totalM1 !== null ? '#b45309' : '#64748b' }}>
                      {fmtNum(computedTotals.totalM1)}
                    </td>
                    <td style={{ ...sideTableCellStyle, fontWeight: 900, bgcolor: '#f8fafc', color: computedTotals.totalBasic !== null ? '#0369a1' : '#64748b' }}>
                      {fmtNum(computedTotals.totalBasic)}
                    </td>
                    <td style={{ ...sideTableCellStyle, fontWeight: 900, bgcolor: '#f8fafc', color: computedTotals.grandTotal !== null ? '#0f172a' : '#64748b' }}>
                      {fmtNum(computedTotals.grandTotal)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Box>

          <Typography variant="caption" color="#64748b" display="block" fontStyle="italic" sx={{ mt: 1.5, fontSize: '10px', lineHeight: 1.35 }}>
            * Authoritative reference format: DA_ Invoice APRIL26.xlsx. Tax Invoice No: <strong>{taxDetails.invoiceNumber}</strong> automatically generated.
          </Typography>
        </Paper>

      </Box>

      {/* Snackbar Feedback */}
      <Snackbar
        open={Boolean(snack)}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {snack ? (
          <Alert severity={snack.type} onClose={() => setSnack(null)} sx={{ fontWeight: 700, borderRadius: '8px' }}>
            {snack.text}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}

export default function FreightCreditorGst({ onBack }) {
  const [activeTab, setActiveTab] = useState(0);

  // Compute default FY and month from current calendar date
  const { defaultFy, defaultMonth } = useMemo(() => {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1; // 1-12
    let startYear;
    if (curMonth >= 4 && curMonth <= 12) {
      startYear = curYear;
    } else {
      startYear = curYear - 1;
    }
    const fy = `FY ${startYear}-${String(startYear + 1).slice(-2)}`;
    const mName = FY_MONTHS.find(m => m.monthNum === curMonth)?.name || 'September';
    return { defaultFy: fy, defaultMonth: mName };
  }, []);

  const [selectedFy, setSelectedFy] = useState(() => {
    return localStorage.getItem('freight_creditor_gst_fy') || defaultFy || 'FY 2026-27';
  });

  const [selectedMonth, setSelectedMonth] = useState(() => {
    return localStorage.getItem('freight_creditor_gst_month') || defaultMonth || 'September';
  });

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const handleFyChange = (e) => {
    const val = e.target.value;
    setSelectedFy(val);
    localStorage.setItem('freight_creditor_gst_fy', val);
  };

  const handleMonthChange = (e) => {
    const val = e.target.value;
    setSelectedMonth(val);
    localStorage.setItem('freight_creditor_gst_month', val);
  };

  // Compute tax details deterministically from the selected FY + Month
  const taxDetails = useMemo(() => {
    return getInvoiceTaxDetails(selectedFy, selectedMonth);
  }, [selectedFy, selectedMonth]);

  const currentCreditor = CREDITOR_TABS[activeTab] || CREDITOR_TABS[0];

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: '#0f172a',
        color: '#f8fafc',
        p: { xs: 2, md: 4 },
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* ── Top Bar / Header ─────────────────────────────────────────── */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
          flexWrap: 'wrap',
          gap: 2,
          pb: 2,
          borderBottom: '1px solid #1e293b'
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton
            onClick={onBack}
            sx={{
              color: '#f8fafc',
              bgcolor: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.16)' }
            }}
          >
            <ArrowBackIcon />
          </IconButton>
          <Box>
            <Typography
              variant="h5"
              fontWeight="900"
              sx={{ letterSpacing: '-0.5px', color: '#f8fafc' }}
            >
              FREIGHT CREDITOR GST
            </Typography>
            <Typography variant="caption" color="#94a3b8" fontWeight="600">
              REPORTS / DATA & SERVICES • Creditor Tax Invoices & Ledger
            </Typography>
          </Box>
        </Box>

        {/* ── Financial Year & Month Selectors + Badges ── */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          {/* Financial Year Selector */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#1e293b', p: 0.6, px: 1.2, borderRadius: 2, border: '1px solid #334155' }}>
            <CalendarTodayIcon sx={{ fontSize: 16, color: '#38bdf8' }} />
            <Typography variant="caption" fontWeight="700" color="#94a3b8">
              Financial Year:
            </Typography>
            <select
              value={selectedFy}
              onChange={handleFyChange}
              style={{
                backgroundColor: '#0f172a',
                color: '#38bdf8',
                border: '1px solid #475569',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '12px',
                fontWeight: 800,
                outline: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit'
              }}
            >
              {FY_OPTIONS.map(fy => (
                <option key={fy} value={fy} style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>
                  {fy}
                </option>
              ))}
            </select>
          </Box>

          {/* Month Selector */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#1e293b', p: 0.6, px: 1.2, borderRadius: 2, border: '1px solid #334155' }}>
            <Typography variant="caption" fontWeight="700" color="#94a3b8">
              Month:
            </Typography>
            <select
              value={selectedMonth}
              onChange={handleMonthChange}
              style={{
                backgroundColor: '#0f172a',
                color: '#c084fc',
                border: '1px solid #475569',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '12px',
                fontWeight: 800,
                outline: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit'
              }}
            >
              {FY_MONTHS.map(m => (
                <option key={m.name} value={m.name} style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>
                  {m.name}
                </option>
              ))}
            </select>
          </Box>

          <Chip
            label={`${taxDetails.half} (M-${taxDetails.monthPosition})`}
            size="small"
            sx={{ bgcolor: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', fontWeight: 800, border: '1px solid rgba(168, 85, 247, 0.3)' }}
          />
          <Chip
            icon={<ReceiptLongIcon sx={{ '&&': { color: '#ec4899', fontSize: 16 } }} />}
            label={taxDetails.invoiceNumber}
            size="small"
            sx={{ bgcolor: 'rgba(236, 72, 153, 0.15)', color: '#f472b6', fontWeight: 900, border: '1px solid rgba(236, 72, 153, 0.3)', letterSpacing: '0.5px' }}
          />
        </Box>
      </Box>

      {/* ── 3 Creditor Sub-Tabs ─────────────────────────────────────────── */}
      <Box
        sx={{
          borderBottom: '1px solid #334155',
          mb: 3,
          bgcolor: '#1e293b',
          borderRadius: 2,
          px: 1.5,
          pt: 1
        }}
      >
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            '& .MuiTab-root': {
              fontWeight: 800,
              fontSize: '13px',
              textTransform: 'none',
              letterSpacing: '0.3px',
              color: '#94a3b8',
              minHeight: 48,
              px: 3,
              py: 1.5,
              transition: 'all 0.2s',
              '&:hover': {
                color: '#f8fafc'
              }
            },
            '& .Mui-selected': {
              color: '#ec4899 !important'
            },
            '& .MuiTabs-indicator': {
              backgroundColor: '#ec4899',
              height: 3,
              borderRadius: '3px 3px 0 0'
            }
          }}
        >
          <Tab
            label="DIPALI ASSOCIATES(DIPALI NAYEK)"
            icon={<BusinessIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
          />
          <Tab
            label="G.K.R.  ENTERPRISE"
            icon={<BusinessIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
          />
          <Tab
            label="SUBHENDU SEKHAR GHOSWAMI"
            icon={<PersonIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
          />
        </Tabs>
      </Box>

      {/* ── Tab Content: Selected Creditor Spreadsheet Table ────────── */}
      <Box sx={{ flex: 1 }}>
        <CreditorInvoiceSpreadsheet creditor={currentCreditor} taxDetails={taxDetails} />
      </Box>
    </Box>
  );
}
