import SearchableSelect from '../components/SearchableSelect';
import MultiSelectSearchable from '../components/MultiSelectSearchable';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box, Typography, Button, IconButton, CircularProgress,
  Snackbar, Alert, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Chip, Tooltip, MenuItem, Checkbox
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LockIcon from '@mui/icons-material/Lock';
import SaveIcon from '@mui/icons-material/Save';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import PrintIcon from '@mui/icons-material/Print';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import UploadIcon from '@mui/icons-material/Upload';
import TableChartIcon from '@mui/icons-material/TableChart';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import B2BEntryDialog from '../components/B2BEntryDialog';
import * as XLSX from 'xlsx';

import axios from 'axios';
import { io } from 'socket.io-client';
import { exportToCsv } from '../utils/exportCsv';

const API_URL = import.meta.env.VITE_API_URL;
const SOCKET_URL = import.meta.env.VITE_SOCKET_IO_URL || import.meta.env.VITE_API_URL;
const socket = io(SOCKET_URL, {
  autoConnect: true,
  transports: ["websocket", "polling"]
});
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
  const str = String(dateStr).split('T')[0].split(' ')[0].trim();
  // Match DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
  const ddmmyyyy = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (ddmmyyyy) {
    const m = parseInt(ddmmyyyy[2], 10);
    if (m >= 1 && m <= 12) return m;
  }
  // Match YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
  const yyyymmdd = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (yyyymmdd) {
    const m = parseInt(yyyymmdd[2], 10);
    if (m >= 1 && m <= 12) return m;
  }
  return 99;
};

const formatDateForInput = (dateStr) => {
  if (!dateStr) return '';
  if (dateStr instanceof Date && !isNaN(dateStr.getTime())) {
    const y = dateStr.getFullYear();
    const m = String(dateStr.getMonth() + 1).padStart(2, '0');
    const d = String(dateStr.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const str = String(dateStr).split('T')[0].split(' ')[0].trim();
  const ddmmyyyy = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (ddmmyyyy) {
    let d = ddmmyyyy[1].padStart(2, '0');
    let m = ddmmyyyy[2].padStart(2, '0');
    let y = ddmmyyyy[3];
    if (y.length === 2 || parseInt(y, 10) < 100) y = String(2000 + parseInt(y, 10));
    return `${y}-${m}-${d}`;
  }
  const yyyymmdd = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (yyyymmdd) {
    let y = yyyymmdd[1];
    let m = yyyymmdd[2].padStart(2, '0');
    let d = yyyymmdd[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return '';
};

const DEBIT_REASONS = [
  'Damage / Shortage',
  'GPS Deviation Charges',
  'GPS Monitoring / Trip Charges',
  'Device Installation Charges',
  'RFID Deduction / Charges',
  'Suspense',
  'TDS Provision',
  'Site office Rent',
  'Safty violation charges'
];

export const isB2BEligibleDebitReason = (reason) => {
  if (!reason || typeof reason !== 'string') return false;
  const clean = reason.trim().toLowerCase().replace(/\s+/g, ' ');
  if (clean.includes('device installation')) return true;
  if (clean.includes('rfid')) return true;
  if (clean.includes('site office rent')) return true;
  return false;
};
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

  // Deduction Allocation States
  const FY_OPTIONS = ['FY 2024-25', 'FY 2025-26', 'FY 2026-27', 'FY 2027-28', '2024-2025', '2025-2026', '2026-2027', '2027-2028'];
  const ALL_MONTHS_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const [damageModalOpen, setDamageModalOpen] = useState(false);
  const [damageTarget, setDamageTarget] = useState(null); // { invoiceNumber, groupId }
  const [damageYear, setDamageYear] = useState('');
  const [damageMonth, setDamageMonth] = useState('');
  const [damageSelectedMonths, setDamageSelectedMonths] = useState([]);
  const [damageVehicles, setDamageVehicles] = useState([]);
  const [damageSelectedVehicles, setDamageSelectedVehicles] = useState([]);
  const [damageDebitReason, setDamageDebitReason] = useState('');
  const [damageAllocateAmount, setDamageAllocateAmount] = useState('');
  const [loadedTrips, setLoadedTrips] = useState([]);
  const [tripsLoading, setTripsLoading] = useState(false);
  const [showTripsReference, setShowTripsReference] = useState(false);
  const [selectedTripIds, setSelectedTripIds] = useState([]);
  const [tripAllocAmounts, setTripAllocAmounts] = useState({});
  const [damageTrips, setDamageTrips] = useState([]);
  const [damageSelectedTrips, setDamageSelectedTrips] = useState([]);
  const [damageVehicleAmounts, setDamageVehicleAmounts] = useState({});
  const [damageManualRemarks, setDamageManualRemarks] = useState('');
  const [b2bDialogOpen, setB2bDialogOpen] = useState(false);

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ id: '', paymentAmount: '', paymentDate: '', referenceNo: '', debitAmount: '', remarks: '' });
  const [uploadingGroup, setUploadingGroup] = useState(null);
  const [pageDocuments, setPageDocuments] = useState([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [dirtyRows, setDirtyRows] = useState(new Set());
  const [dirtyGroups, setDirtyGroups] = useState(new Set());
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [siteFilter, setSiteFilter] = useState('All'); // 'All' | 'NVCL' | 'NVL'
  const [filterMonth, setFilterMonth] = useState('All'); // 'All' | 1..12
  const [filterYear, setFilterYear] = useState('All');   // 'All' | '2026' | '2027'
  const [filterBillType, setFilterBillType] = useState('All');
  const [filterPartyName, setFilterPartyName] = useState('All');
  const [filterPaymentStatus, setFilterPaymentStatus] = useState('All');
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const [selYear, setSelYear] = useState('2026-2027');
  const [saving, setSaving] = useState(false);

  // Payment Status Dashboard States
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [dashboardM, setDashboardM] = useState(new Date().getMonth() + 1); // Defaults to current calendar month

  // Excel Upload States
  const [excelModalOpen, setExcelModalOpen] = useState(false);
  const [uploadSiteTarget, setUploadSiteTarget] = useState('NVL'); // 'NVL' | 'NVCL'
  const [excelFile, setExcelFile] = useState(null);
  const [excelParsedRows, setExcelParsedRows] = useState([]);
  const [excelHeaders, setExcelHeaders] = useState([]);
  const [excelHeaderMap, setExcelHeaderMap] = useState({});
  const [excelSummary, setExcelSummary] = useState(null);
  const [uploadingExcel, setUploadingExcel] = useState(false);
  const [uploadFileType, setUploadFileType] = useState('EXCEL');
  const [pdfFile, setPdfFile] = useState(null);
  const [parsingPdf, setParsingPdf] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearingData, setClearingData] = useState(false);

  const parseExcelString = (val) => {
    if (val === null || val === undefined) return '';
    return String(val).trim();
  };

  const parseExcelNumber = (val) => {
    if (val === null || val === undefined || val === '') return 0;
    const cleaned = String(val).replace(/,/g, '').trim();
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  };

  const parseExcelDate = (val) => {
    if (val === null || val === undefined || val === '') return '';

    // If already a JS Date object (e.g. from SheetJS UTC parsing)
    if (val instanceof Date) {
      if (isNaN(val.getTime())) return '';
      // Extract UTC calendar date because SheetJS constructs dates via Date.UTC(...)
      const d = String(val.getUTCDate()).padStart(2, '0');
      const m = String(val.getUTCMonth() + 1).padStart(2, '0');
      const y = val.getUTCFullYear();
      return `${d}/${m}/${y}`;
    }

    // If Excel serial number (numeric)
    if (typeof val === 'number') {
      try {
        const jsDate = XLSX.SSF.parse_date_code(val);
        if (jsDate && jsDate.y && jsDate.m && jsDate.d) {
          const d = String(jsDate.d).padStart(2, '0');
          const m = String(jsDate.m).padStart(2, '0');
          const y = jsDate.y;
          return `${d}/${m}/${y}`;
        }
      } catch (_) { }
    }

    const rawStr = String(val).trim();
    if (!rawStr) return '';
    const str = rawStr.replace(/\s+\d{1,2}:\d{2}(:\d{2})?.*$/, '').replace(/T\d{2}:\d{2}.*$/, '').trim();

    // Check if numeric serial number as string (e.g. "46286")
    if (/^\d{5}(\.\d+)?$/.test(str)) {
      try {
        const numVal = parseFloat(str);
        const jsDate = XLSX.SSF.parse_date_code(numVal);
        if (jsDate && jsDate.y && jsDate.m && jsDate.d) {
          const d = String(jsDate.d).padStart(2, '0');
          const m = String(jsDate.m).padStart(2, '0');
          const y = jsDate.y;
          return `${d}/${m}/${y}`;
        }
      } catch (_) { }
    }

    // Match DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY, DD-MM-YY, DD/MM/YY, DD.MM.YY
    const ddmmyyyy = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
    if (ddmmyyyy) {
      let day = ddmmyyyy[1].padStart(2, '0');
      let month = ddmmyyyy[2].padStart(2, '0');
      let year = ddmmyyyy[3];
      if (year.length === 2 || parseInt(year, 10) < 100) year = String(2000 + parseInt(year, 10));
      return `${day}/${month}/${year}`;
    }

    // Match YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD
    const yyyymmdd = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
    if (yyyymmdd) {
      let year = yyyymmdd[1];
      let month = yyyymmdd[2].padStart(2, '0');
      let day = yyyymmdd[3].padStart(2, '0');
      return `${day}/${month}/${year}`;
    }

    // Match named month: DD-MMM-YYYY, DD MMM YYYY, DD-MMMM-YYYY
    const ddmmmyyyy = str.match(/^(\d{1,2})[\/\-\.\s]([A-Za-z]+)[\/\-\.\s](\d{2,4})$/);
    if (ddmmmyyyy) {
      const day = ddmmmyyyy[1].padStart(2, '0');
      const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      const mIdx = monthNames.indexOf(ddmmmyyyy[2].toLowerCase().slice(0, 3));
      let year = ddmmmyyyy[3];
      if (year.length === 2 || parseInt(year, 10) < 100) year = String(2000 + parseInt(year, 10));
      if (mIdx >= 0) {
        const month = String(mIdx + 1).padStart(2, '0');
        return `${day}/${month}/${year}`;
      }
    }

    return rawStr;
  };

  const handleClearBillRegister = async () => {
    if (!window.confirm('Are you sure you want to clear all uploaded Bill Register data? This will remove transaction rows to prepare for a fresh Excel upload.')) {
      return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.post(`${API_URL}/fy-details/clear-bill-register`, {}, { headers });
      if (res.data.success) {
        setSnack({ severity: 'success', msg: 'Bill Register data cleared successfully! Ready for fresh upload.' });
        await fetchData();
      }
    } catch (err) {
      console.error('Failed to clear Bill Register data:', err);
      setSnack({ severity: 'error', msg: 'Failed to clear data: ' + (err.response?.data?.error || err.message) });
    } finally {
      setLoading(false);
    }
  };

  const handleClearAllBillRegister = async () => {
    setClearingData(true);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.post(`${API_URL}/fy-details/clear-bill-register`, {}, { headers });
      if (res.data.success) {
        setSnack({ severity: 'success', msg: 'All Bill Register data has been cleared successfully.' });
        setClearConfirmOpen(false);
        await fetchData();
      }
    } catch (err) {
      console.error('Failed to clear Bill Register data:', err);
      setSnack({ severity: 'error', msg: 'Failed to clear data: ' + (err.response?.data?.error || err.message) });
    } finally {
      setClearingData(false);
    }
  };

  const handlePdfFileChange = async (e, targetSiteOverride = null) => {
    const file = e?.target?.files?.[0];
    const targetSite = (targetSiteOverride || uploadSiteTarget || 'NVL').toUpperCase();
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setSnack({ severity: 'error', msg: 'Please select a valid PDF file (.pdf).' });
      return;
    }

    setUploadFileType('PDF');
    setPdfFile(file);
    setUploadSiteTarget(targetSite);
    setParsingPdf(true);

    try {
      const formData = new FormData();
      formData.append('pdf', file);
      formData.append('targetSite', targetSite);

      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const res = await axios.post(`${API_URL}/fy-details/parse-pdf`, formData, {
        headers: { ...headers, 'Content-Type': 'multipart/form-data' }
      });

      if (res.data.success) {
        setExcelParsedRows(res.data.rows);
        setExcelSummary({
          total: res.data.totalRows,
          valid: res.data.validCount,
          existing: res.data.existingCount,
          failed: res.data.reviewCount,
          errors: res.data.rows.filter(r => r.needsReview).map(r => ({ row: r.slNo, error: r.reviewReason || 'Review needed' })),
          targetSite: res.data.targetSite,
          isPdf: true,
          totalPages: res.data.totalPages,
          filename: res.data.filename
        });
        setExcelModalOpen(true);
        setSnack({
          severity: 'success',
          msg: `PDF extracted successfully! ${res.data.totalRows} rows extracted across ${res.data.totalPages} page(s).`
        });
      }
    } catch (err) {
      console.error('PDF parsing error:', err);
      setSnack({ severity: 'error', msg: 'Failed to extract PDF: ' + (err.response?.data?.error || err.message) });
    } finally {
      setParsingPdf(false);
    }
  };

  const handleExcelFileChange = (e, targetSiteOverride = null, existingFile = null) => {
    const file = e?.target?.files?.[0] || existingFile || excelFile;
    const targetSite = (targetSiteOverride || uploadSiteTarget || 'NVL').toUpperCase();
    if (!file) return;
    setExcelFile(file);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true, cellText: false });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        const rawMatrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        if (rawMatrix.length === 0) {
          setSnack({ severity: 'error', msg: 'Excel sheet is empty.' });
          return;
        }

        let headerRowIdx = 0;
        for (let i = 0; i < Math.min(10, rawMatrix.length); i++) {
          if (rawMatrix[i].some(cell => String(cell).trim() !== '')) {
            headerRowIdx = i;
            break;
          }
        }

        const headers = rawMatrix[headerRowIdx].map(h => String(h).trim());
        setExcelHeaders(headers);

        const map = {};
        headers.forEach((h, colIdx) => {
          const cleanH = String(h).toLowerCase().replace(/[^a-z0-9]/g, '');
          if (['slno', 'sno', 'sl', 'srno'].includes(cleanH)) map.slNo = colIdx;
          else if (['invoicenumber', 'invoiceno', 'invoicen', 'billnumber', 'billno', 'billn', 'invno'].includes(cleanH)) map.invoiceNumber = colIdx;
          else if (['invoicedate', 'invdate', 'date', 'billdate'].includes(cleanH)) map.invoiceDate = colIdx;
          else if (['shipmentnumber', 'shipmentno', 'shipment', 'shipmentn'].includes(cleanH)) map.shipmentNumber = colIdx;
          else if (['month'].includes(cleanH)) map.month = colIdx;
          else if (['site', 'plant'].includes(cleanH)) map.site = colIdx;
          else if (['billtype', 'type', 'bill', 'billname'].includes(cleanH)) map.billType = colIdx;
          else if (['amount', 'taxableamount', 'taxablevalue', 'taxableval', 'billingamount', 'netamount'].includes(cleanH)) map.amount = colIdx;
          else if (['cgst', 'cgstamount'].includes(cleanH)) map.cgst = colIdx;
          else if (['sgst', 'sgstamount'].includes(cleanH)) map.sgst = colIdx;
          else if (['igst', 'igstamount'].includes(cleanH)) map.igst = colIdx;
          else if (['totalamount', 'total', 'grossamount', 'grandtotal'].includes(cleanH)) map.totalAmount = colIdx;
          else if (['tds2', 'tds', 'tdsamount', 'tds2percent'].includes(cleanH)) map.tds = colIdx;
          else if (['receivable', 'receivableamount', 'receivableamountfromnuvoco'].includes(cleanH)) map.receivable = colIdx;
          else if (['paymentamountpaid', 'paymentamount', 'paidamount', 'amountpaid'].includes(cleanH)) map.paymentAmount = colIdx;
          else if (['tdsprovision'].includes(cleanH)) map.tdsProvision = colIdx;
          else if (['difference'].includes(cleanH)) map.difference = colIdx;
          else if (['paymentdate'].includes(cleanH)) map.paymentDate = colIdx;
          else if (['referenceno', 'refno', 'reference', 'referenceno.'].includes(cleanH)) map.referenceNo = colIdx;
          else if (['debitamount'].includes(cleanH)) map.debitAmount = colIdx;
          else if (['debitreasonsdeduction', 'debitreasons', 'debitreason', 'deductionreasons'].includes(cleanH)) map.debitReasons = colIdx;
          else if (['remarks', 'remark'].includes(cleanH)) map.remarks = colIdx;
        });

        // Positional fallback mapping if header mapping missed key fields
        if (map.invoiceNumber === undefined) map.invoiceNumber = 2;
        if (map.invoiceDate === undefined) map.invoiceDate = 1;

        setExcelHeaderMap(map);

        const parsed = [];
        let validCount = 0;
        let existingCount = 0;
        let failedCount = 0;
        let summaryRowCount = 0;
        const failedErrors = [];

        const existingKeys = new Set(rows.map(r => String(r.invoiceNumber || r.billNo || '').trim().toUpperCase()));

        for (let rIdx = headerRowIdx + 1; rIdx < rawMatrix.length; rIdx++) {
          const rowArr = rawMatrix[rIdx];
          if (!rowArr || rowArr.every(cell => String(cell).trim() === '')) continue;

          const getVal = (colIdx) => (colIdx !== undefined && colIdx < rowArr.length) ? rowArr[colIdx] : '';

          const isValidParsedDate = (dStr) => {
            if (!dStr) return true; // Optional if missing
            const parts = dStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
            if (!parts) return false;
            const d = parseInt(parts[1], 10);
            const m = parseInt(parts[2], 10);
            const y = parseInt(parts[3], 10);
            if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2099) return false;
            const daysInMonth = new Date(y, m, 0).getDate();
            return d <= daysInMonth;
          };

          const rawDateVal = getVal(map.invoiceDate);
          let invDate = parseExcelDate(rawDateVal);
          const isDateValid = !rawDateVal || isValidParsedDate(invDate);

          if (!isDateValid) {
            failedCount++;
            failedErrors.push({ row: rIdx + 1, error: `Invalid / Unparseable Bill Date: "${rawDateVal}"` });
          }

          let shipNo = parseExcelString(getVal(map.shipmentNumber));
          let monthStr = parseExcelString(getVal(map.month));

          let excelSite = parseExcelString(getVal(map.site)).toUpperCase();
          let siteStr = (excelSite === 'NVL' || excelSite === 'NVCL') ? excelSite : targetSite;

          // Detect Excel bottom formula/summary/total rows (no invoice number AND no date AND no month AND no site)
          if (!invNo && !invDate && !monthStr && !excelSite) {
            summaryRowCount++;
            continue;
          }

          if (!invNo) {
            failedCount++;
            failedErrors.push({ row: rIdx + 1, error: 'Missing Invoice / Bill Number' });
            continue;
          }

          let bType = parseExcelString(getVal(map.billType)).toUpperCase() || 'FREIGHT';
          let amt = parseExcelNumber(getVal(map.amount));
          let cgstVal = parseExcelNumber(getVal(map.cgst));
          let sgstVal = parseExcelNumber(getVal(map.sgst));
          let totalAmtVal = parseExcelNumber(getVal(map.totalAmount)) || (amt + cgstVal + sgstVal);
          let tdsVal = parseExcelNumber(getVal(map.tds));
          let recVal = parseExcelNumber(getVal(map.receivable)) || (totalAmtVal - tdsVal);
          let payAmtVal = parseExcelNumber(getVal(map.paymentAmount));
          let tdsProvVal = parseExcelNumber(getVal(map.tdsProvision));
          let payDateVal = parseExcelDate(getVal(map.paymentDate));
          let refNoVal = parseExcelString(getVal(map.referenceNo));
          let debitAmtVal = parseExcelNumber(getVal(map.debitAmount)) || parseExcelNumber(getVal(map.difference));
          let debitReasonsVal = parseExcelString(getVal(map.debitReasons));
          let remarksVal = parseExcelString(getVal(map.remarks));
          let sl = parseExcelNumber(getVal(map.slNo));

          const isExisting = existingKeys.has(invNo.toUpperCase());
          if (!isDateValid) {
            // Already flagged
          } else if (isExisting) {
            existingCount++;
          } else {
            validCount++;
          }

          parsed.push({
            slNo: sl || (parsed.length + 1),
            invoiceNumber: invNo,
            displayInvoiceNumber: invNo,
            invoiceDate: invDate,
            shipmentNo: shipNo,
            month: monthStr,
            site: siteStr,
            billType: bType,
            amount: amt,
            cgst: cgstVal,
            sgst: sgstVal,
            totalAmount: totalAmtVal,
            tds: tdsVal,
            receivable: recVal,
            paymentAmount: payAmtVal,
            tdsProvision: tdsProvVal,
            paymentDate: payDateVal,
            referenceNo: refNoVal,
            debitAmount: debitAmtVal,
            debitReasons: debitReasonsVal ? [debitReasonsVal] : [],
            remarks: remarksVal,
            isExisting,
            needsReview: !isDateValid,
            reviewReason: !isDateValid ? `Invalid Date (${rawDateVal})` : ''
          });
        }

        setExcelParsedRows(parsed);
        setExcelSummary({
          total: parsed.length + failedCount,
          valid: validCount,
          existing: existingCount,
          failed: failedCount,
          errors: failedErrors,
          targetSite
        });
      } catch (err) {
        console.error('Excel parse error:', err);
        setSnack({ severity: 'error', msg: 'Failed to read Excel file: ' + err.message });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleConfirmExcelImport = async () => {
    if (excelParsedRows.length === 0) return;
    setUploadingExcel(true);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.post(`${API_URL}/fy-details/import-excel`, { rows: excelParsedRows }, { headers });

      if (res.data.success) {
        const siteLabel = (excelSummary?.targetSite || uploadSiteTarget).toUpperCase();
        setSnack({
          severity: 'success',
          msg: `${siteLabel} Excel uploaded successfully. ${res.data.importedCount} records imported (${res.data.existingCount} already existed).`
        });
        setExcelModalOpen(false);
        setExcelFile(null);
        setExcelParsedRows([]);
        setExcelSummary(null);
        await fetchData();
      }
    } catch (err) {
      console.error('Excel import failed:', err);
      setSnack({ severity: 'error', msg: 'Import failed: ' + (err.response?.data?.error || err.message) });
    } finally {
      setUploadingExcel(false);
    }
  };

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
      let mIdx = new Date().getMonth();
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
      debitReasons: [],
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
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const [dataRes, docsRes] = await Promise.all([
        axios.get(`${API_URL}/fy-details/data`, { params: { fy: selYear }, headers }),
        axios.get(`${API_URL}/fy-details/documents`, { headers })
      ]);
      setRows(dataRes.data.rows || []);
      setPayments(dataRes.data.payments || []);
      setPageDocuments(docsRes.data || []);
      setSelectedIds([]);
      setDirtyRows(new Set());
      setDirtyGroups(new Set());
      setPage(0);
    } catch (err) {
      console.error('[FinancialYearDetails] fetchData error:', err);
      setSnack({ severity: 'error', msg: 'Failed to load details' });
    } finally { setLoading(false); }
  }, [selYear]);

  // Listen to WebSocket events
  useEffect(() => {
    const handleCementUpdate = (data) => {
      console.log('socket event cementUpdates', data);
      if (data?.action === 'batchBillsGenerated') {
        setPage(0);
        if (data.financialYear) {
          const newFy = `20${data.financialYear.split('-')[0]}-${data.financialYear.split('-')[1]}`;
          if (newFy !== selYear) {
            setSelYear(newFy);
          } else {
            fetchData();
          }
        } else {
          fetchData();
        }
      } else if (data?.action === 'paymentMapped') {
        fetchData();
      }
    };
    const handleFyUpdate = () => {
      fetchData();
    };

    socket.on('cementUpdates', handleCementUpdate);
    socket.on('fyDetailsUpdates', handleFyUpdate);
    return () => {
      socket.off('cementUpdates', handleCementUpdate);
      socket.off('fyDetailsUpdates', handleFyUpdate);
    };
  }, [fetchData, selYear]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getSelectionCondition = (months, vehicles) => {
    const mCount = months?.length || 0;
    const vCount = vehicles?.length || 0;
    if (mCount === 0 || vCount === 0) return null;
    if (mCount === 1 && vCount === 1) return 'ONE MONTH + ONE VEHICLE';
    if (mCount > 1 && vCount === 1) return 'MULTIPLE MONTHS + ONE VEHICLE';
    if (mCount === 1 && vCount > 1) return 'ONE MONTH + MULTIPLE VEHICLES';
    return 'INVALID';
  };

  const fetchTripsForSelection = async (months, vehicles, fy) => {
    if (!months || months.length === 0 || !vehicles || vehicles.length === 0 || !fy) {
      setLoadedTrips([]);
      return;
    }
    setTripsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/fy-details/trips`, {
        params: {
          months: months.join(','),
          vehicles: vehicles.join(','),
          fy
        }
      });
      const trips = res.data || [];
      setLoadedTrips(trips);
      const validTripIds = new Set(trips.map(t => String(t._id || t.tripId || `${t.invoiceNo}-${t.loadingDate}`)));
      setSelectedTripIds(prev => prev.filter(id => validTripIds.has(id)));
    } catch (err) {
      console.error('Failed to load trips for selection:', err);
      setLoadedTrips([]);
    } finally {
      setTripsLoading(false);
    }
  };

  const toggleTripSelect = (trip) => {
    const key = String(trip._id || trip.tripId || `${trip.invoiceNo}-${trip.loadingDate}`);
    setSelectedTripIds(prev => {
      const exists = prev.includes(key);
      if (exists) {
        return prev.filter(k => k !== key);
      } else {
        return [...prev, key];
      }
    });
  };

  const handleTripAmountChange = (trip, val) => {
    const key = String(trip._id || trip.tripId || `${trip.invoiceNo}-${trip.loadingDate}`);
    setTripAllocAmounts(prev => ({
      ...prev,
      [key]: val
    }));
    if (val && parseFloat(val) > 0) {
      setSelectedTripIds(prev => (prev.includes(key) ? prev : [...prev, key]));
    }
  };

  const handleDamageYearChange = async (e) => {
    const newYear = e.target.value;
    setDamageYear(newYear);
    if (damageSelectedMonths.length > 0 && newYear) {
      try {
        const res = await axios.get(`${API_URL}/fy-details/vehicles?months=${damageSelectedMonths.join(',')}&fy=${newYear}`);
        const vList = res.data || [];
        const combined = [...new Set([...vList, ...damageSelectedVehicles])].filter(Boolean).sort();
        setDamageVehicles(combined);
        if (damageSelectedVehicles.length > 0) {
          fetchTripsForSelection(damageSelectedMonths, damageSelectedVehicles, newYear);
        } else {
          setLoadedTrips([]);
        }
      } catch {
        setSnack({ severity: 'error', msg: 'Failed to fetch vehicles for selected year' });
      }
    } else {
      setDamageVehicles([]);
      setDamageSelectedVehicles([]);
      setLoadedTrips([]);
    }
  };

  const handleDamageMonthsChange = async (newMonths) => {
    const monthsArr = Array.isArray(newMonths) ? newMonths : [newMonths].filter(Boolean);
    setDamageSelectedMonths(monthsArr);
    if (monthsArr.length === 1) {
      setDamageMonth(monthsArr[0]);
    } else {
      setDamageMonth('');
    }
    if (monthsArr.length === 0 || !damageYear) {
      setDamageVehicles([]);
      setDamageSelectedVehicles([]);
      setLoadedTrips([]);
      return;
    }
    try {
      const res = await axios.get(`${API_URL}/fy-details/vehicles?months=${monthsArr.join(',')}&fy=${damageYear}`);
      const vList = res.data || [];
      const combined = [...new Set([...vList, ...damageSelectedVehicles])].filter(Boolean).sort();
      setDamageVehicles(combined);
      if (damageSelectedVehicles.length > 0) {
        fetchTripsForSelection(monthsArr, damageSelectedVehicles, damageYear);
      } else {
        setLoadedTrips([]);
      }
    } catch {
      setSnack({ severity: 'error', msg: 'Failed to fetch vehicles for selected months' });
    }
  };

  const handleDamageVehiclesChange = async (updated) => {
    const vArr = Array.isArray(updated) ? updated : [updated].filter(Boolean);
    setDamageSelectedVehicles(vArr);

    if (vArr.length === 0) {
      setLoadedTrips([]);
      return;
    }

    if (damageSelectedMonths.length > 0 && damageYear) {
      fetchTripsForSelection(damageSelectedMonths, vArr, damageYear);
    }
  };

  const handleConfirmAllocation = async () => {
    if (!damageTarget) return;
    const inv = damageTarget.invoiceNumber;
    const condition = getSelectionCondition(damageSelectedMonths, damageSelectedVehicles);

    if (!damageYear) {
      setSnack({ severity: 'warning', msg: 'Please select a Financial Year.' });
      return;
    }
    if (damageSelectedMonths.length === 0) {
      setSnack({ severity: 'warning', msg: 'Please select at least one Month.' });
      return;
    }
    if (damageSelectedVehicles.length === 0) {
      setSnack({ severity: 'warning', msg: 'Please select at least one Vehicle.' });
      return;
    }
    if (condition === 'INVALID' || !condition) {
      setSnack({ severity: 'error', msg: 'Invalid combination. Please select either Multiple Months + 1 Vehicle, 1 Month + Multiple Vehicles, or 1 Month + 1 Vehicle.' });
      return;
    }
    if (!damageDebitReason) {
      setSnack({ severity: 'warning', msg: 'Please select a Debit Reason.' });
      return;
    }

    const targetRow = rows.find(x => x.invoiceNumber === inv);
    const computedTargetRow = computedRows.find(x => x.invoiceNumber === inv);
    const groupTotalRecv = computedRows.filter(cr => cr.groupId === damageTarget.groupId).reduce((s, x) => s + x.receivable, 0);
    const calculatedGroupDiff = Math.max(0, groupTotalRecv - num(computedTargetRow?.groupData?.paymentAmount) - num(computedTargetRow?.groupData?.tdsProvision));
    const baseOriginalDebit = targetRow?.originalDebitAmount != null ? targetRow.originalDebitAmount : calculatedGroupDiff;
    const currentAllocations = targetRow?.deductionAllocations || [];
    const currentTotalAlloc = currentAllocations.reduce((s, a) => s + (parseFloat(a.allocatedAmount) || 0), 0);
    const currentRemaining = Math.max(0, baseOriginalDebit - currentTotalAlloc);

    if (currentRemaining <= 0) {
      setSnack({ severity: 'error', msg: 'Remaining Debit is ₹0. This debit is fully allocated and settled.' });
      return;
    }

    // Build parsed trip allocations from selected trips
    const selectedTripsList = loadedTrips.filter(t => {
      const key = String(t._id || t.tripId || `${t.invoiceNo}-${t.loadingDate}`);
      return selectedTripIds.includes(key);
    });

    const parsedTripAllocs = selectedTripsList.map(t => {
      const key = String(t._id || t.tripId || `${t.invoiceNo}-${t.loadingDate}`);
      const amt = parseFloat(tripAllocAmounts[key]) || 0;
      return {
        tripRecordId: t._id ? String(t._id) : (t.tripId || key),
        tripId: t.tripId || (t._id ? String(t._id) : key),
        shipmentNo: t.shipmentNo || '',
        invoiceNo: t.invoiceNo || '',
        month: t.month || '',
        vehicle: t.vehicleNumber || t.vehicle || '',
        vehicleNumber: t.vehicleNumber || t.vehicle || '',
        loadingDate: t.loadingDate || t.invoiceDate || '',
        allocatedAmount: amt
      };
    }).filter(t => t.allocatedAmount > 0);

    const totalTripAllocated = parsedTripAllocs.reduce((s, t) => s + t.allocatedAmount, 0);
    const allocAmt = totalTripAllocated > 0 ? totalTripAllocated : (parseFloat(damageAllocateAmount) || 0);

    if (isNaN(allocAmt) || allocAmt <= 0) {
      setSnack({ severity: 'warning', msg: 'Please select at least one trip and enter an allocate amount (> ₹0).' });
      return;
    }

    if (allocAmt > currentRemaining) {
      setSnack({
        severity: 'error',
        msg: `Only ₹${currentRemaining.toLocaleString('en-IN')} is available for allocation.`
      });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        billNo: inv,
        debitReason: damageDebitReason,
        financialYear: damageYear,
        months: damageSelectedMonths,
        vehicles: damageSelectedVehicles,
        condition,
        originalDebitAmount: baseOriginalDebit,
        allocatedAmount: allocAmt,
        allocationDate: new Date().toISOString().split('T')[0],
        tripAllocations: parsedTripAllocs
      };

      const res = await axios.post(`${API_URL}/fy-details/allocate-deduction`, payload);

      if (res.data?.success) {
        setRows(prev => prev.map(r => {
          if (r.invoiceNumber === inv) {
            return {
              ...r,
              originalDebitAmount: res.data.originalDebitAmount,
              totalAllocatedAmount: res.data.totalAllocatedAmount,
              remainingDebitAmount: res.data.remainingDebitAmount,
              deductionAllocations: res.data.row?.deductionAllocations || [...currentAllocations, res.data.allocation],
              debitReasons: res.data.row?.debitReasons || r.debitReasons
            };
          }
          return r;
        }));

        setPayments(prev => prev.map(p => {
          if (p.billNos?.includes(inv)) {
            return { ...p, debitAmount: res.data.remainingDebitAmount };
          }
          return p;
        }));

        setSelectedTripIds([]);
        setTripAllocAmounts({});
        setDamageAllocateAmount('');
        setSnack({
          severity: 'success',
          msg: `Allocated ₹${allocAmt.toLocaleString('en-IN')} to ${damageDebitReason} across ${parsedTripAllocs.length} trip(s) successfully! Bank Book debit updated to ₹${res.data.remainingDebitAmount.toLocaleString('en-IN')}.`
        });
      }
    } catch (err) {
      console.error('Allocation error:', err);
      setSnack({ severity: 'error', msg: err.response?.data?.error || 'Failed to save deduction allocation' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAllocation = async (allocationId) => {
    if (!damageTarget) return;
    const inv = damageTarget.invoiceNumber;
    setLoading(true);
    try {
      const res = await axios.delete(`${API_URL}/fy-details/allocate-deduction/${inv}/${allocationId}`);
      if (res.data?.success) {
        setRows(prev => prev.map(r => {
          if (r.invoiceNumber === inv) {
            return {
              ...r,
              totalAllocatedAmount: res.data.totalAllocatedAmount,
              remainingDebitAmount: res.data.remainingDebitAmount,
              deductionAllocations: res.data.deductionAllocations,
              debitReasons: res.data.row?.debitReasons || r.debitReasons
            };
          }
          return r;
        }));

        setPayments(prev => prev.map(p => {
          if (p.billNos?.includes(inv)) {
            return { ...p, debitAmount: res.data.remainingDebitAmount };
          }
          return p;
        }));

        setSnack({ severity: 'info', msg: 'Allocation removed. Bank Book debit updated.' });
      }
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Failed to remove allocation' });
    } finally {
      setLoading(false);
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

    const targetAmt = Math.max(0, num(damageTarget.difference));

    // Sum amounts keyed by invoiceNo (one per trip-row)
    // Wait, the validation should sum ALL allocations for the group, not just the currently selected trips!
    const groupRows = computedRows.filter(cr => cr.groupId === gid);
    const groupAllocatedAmt = groupRows.reduce((total, cr) => {
      const rowAmountsObj = cr.invoiceNumber === inv ? damageVehicleAmounts : cr.damageVehicleAmounts;
      return total + Object.values(rowAmountsObj || {}).reduce((tripSum, tripObj) => {
        return tripSum + Object.values(tripObj || {}).reduce((s, v) => s + num(v), 0);
      }, 0);
    }, 0);

    if (groupAllocatedAmt > targetAmt && targetAmt > 0) {
      setSnack({ severity: 'error', msg: `Total allocated amount (₹${groupAllocatedAmt}) cannot exceed the Difference (₹${targetAmt}).` });
      return;
    }

    const calculatedDebitAmount = Math.max(0, targetAmt - groupAllocatedAmt);

    try {
      const valRes = await axios.post(`${API_URL}/fy-details/validate-deduction`, {
        reasons: damageTarget.reasons,
        year: damageYear,
        month: damageMonth,
        trips: damageSelectedTrips,
        currentBillNo: inv
      });
      if (!valRes.data.valid) {
        setSnack({ severity: 'error', msg: valRes.data.message });
        return;
      }
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Failed to validate deduction reason uniqueness.' });
      return;
    }

    // Auto-populate group remarks – one line per trip-row (vehicle + trip + amount)
    const sortedSelectedTrips = [...damageSelectedTrips].sort((a, b) => {
      if (a.vehicle !== b.vehicle) return a.vehicle.localeCompare(b.vehicle);
      return a.tripNumber - b.tripNumber;
    });

    const monthCap = damageMonth.charAt(0).toUpperCase() + damageMonth.slice(1).toLowerCase();

    // One remark line per trip-row: Month-Vehicle-Trip N (date) - Reason1: ₹amt1, Reason2: ₹amt2
    const newRemarks = sortedSelectedTrips.map(t => {
      const parts = (damageTarget.reasons || []).map(reason => {
        const amt = (damageVehicleAmounts[t.invoiceNo] && damageVehicleAmounts[t.invoiceNo][reason]) || 0;
        if (num(amt) === 0) return null;
        let suffix = reason;
        if (suffix === 'Damage / Shortage') suffix = 'Damage/Shortage';
        else if (suffix === 'RFID Deduction / Charges') suffix = 'RFID Deduction';
        return `${suffix}: ₹${amt}`;
      }).filter(Boolean);

      const reasonStr = parts.length > 0 ? ` - ${parts.join(', ')}` : '';
      return `${monthCap}-${t.vehicle}-Trip No. ${t.tripNumber} (${t.tripDate})${reasonStr}`;
    }).join('\n');

    // Build the combined remarks:
    // Auto-generated trip lines come first, then the user's manual remarks (if any)
    const combinedRemarks = damageManualRemarks.trim()
      ? `${newRemarks}\n---\n${damageManualRemarks.trim()}`
      : newRemarks;

    // Build the updated payment record
    const existingPayment = payments.find(p => p.id === gid);
    const updatedPayment = existingPayment
      ? { ...existingPayment, remarks: combinedRemarks, debitAmount: calculatedDebitAmount }
      : { id: gid, billNos: [inv], paymentAmount: '', paymentDate: '', referenceNo: '', debitAmount: calculatedDebitAmount, remarks: combinedRemarks, tdsProvision: '' };

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
        debitReasons: damageTarget.reasons,
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

  // Parse date string/object to timestamp for sorting
  const parseDateToTime = useCallback((val) => {
    if (!val) return 0;
    if (val instanceof Date) return isNaN(val.getTime()) ? 0 : val.getTime();

    const rawStr = String(val).trim();
    const str = rawStr.split('T')[0].split(' ')[0].trim();

    // Indian format: DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY
    const ddmmyyyy = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
    if (ddmmyyyy) {
      let d = parseInt(ddmmyyyy[1], 10);
      let m = parseInt(ddmmyyyy[2], 10);
      let y = parseInt(ddmmyyyy[3], 10);
      if (y < 100) y += 2000;
      if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
        return new Date(y, m - 1, d).getTime();
      }
    }

    // ISO format: YYYY-MM-DD
    const yyyymmdd = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
    if (yyyymmdd) {
      let y = parseInt(yyyymmdd[1], 10);
      let m = parseInt(yyyymmdd[2], 10);
      let d = parseInt(yyyymmdd[3], 10);
      if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
        return new Date(y, m - 1, d).getTime();
      }
    }

    const d = new Date(str);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }, []);

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
      if (siteUpper === 'NVCL' && autoInv.match(/^DAC[\/\-]/i)) {
        autoInv = autoInv.replace(/^DAC[\/\-]/i, 'NVCL-');
      } else if (siteUpper === 'NVL' && autoInv.match(/^NVCL[\/\-]/i)) {
        autoInv = autoInv.replace(/^NVCL[\/\-]/i, 'DAC-');
      }
      autoInv = autoInv.replace(/\//g, '-');

      const paymentObj = payments.find(p => p.billNos?.includes(r.invoiceNumber));
      return {
        ...r, amount: amt, cgst, sgst, totalAmount, tds, receivable,
        displayInvoiceNumber: autoInv,
        groupId: paymentObj?.id || `AUTO-${r.invoiceNumber}`,
        groupData: paymentObj || { id: `AUTO-${r.invoiceNumber}`, billNos: [r.invoiceNumber], paymentAmount: '', paymentDate: '', referenceNo: '', debitAmount: '', remarks: '', paymentProofUrl: '' }
      };
    }).sort((a, b) => {
      // Sort combined NVL + NVCL rows strictly by actual Invoice Date timestamp
      const timeA = parseDateToTime(a.invoiceDate);
      const timeB = parseDateToTime(b.invoiceDate);
      if (timeA !== timeB) return timeA - timeB;
      return (a.slNo || 0) - (b.slNo || 0);
    });
  }, [rows, payments, parseDateToTime]);

  // Helper to extract month index (1-12) and 4-digit year string from a row
  const getRowMonthAndYear = useCallback((r) => {
    let dateStr = r.invoiceDate;
    let year = null;
    let month = null;

    if (dateStr) {
      if (dateStr instanceof Date && !isNaN(dateStr.getTime())) {
        year = dateStr.getFullYear();
        month = dateStr.getMonth() + 1;
      } else {
        const str = String(dateStr).split('T')[0].split(' ')[0].trim();
        const ddmmyyyy = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
        if (ddmmyyyy) {
          month = parseInt(ddmmyyyy[2], 10);
          let y = parseInt(ddmmyyyy[3], 10);
          if (y < 100) y += 2000;
          year = y;
        } else {
          const yyyymmdd = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
          if (yyyymmdd) {
            year = parseInt(yyyymmdd[1], 10);
            month = parseInt(yyyymmdd[2], 10);
          } else {
            const parsedD = new Date(str);
            if (!isNaN(parsedD.getTime())) {
              year = parsedD.getFullYear();
              month = parsedD.getMonth() + 1;
            }
          }
        }
      }
    }

    if ((!year || !month) && r.month) {
      const mStr = String(r.month).trim();
      if (mStr.includes('-')) {
        const parts = mStr.split('-');
        const mName = parts[0].trim().toUpperCase();
        const yStr = parts[1].trim();
        if (!month) {
          const foundM = MONTHS_LIST.find(m => m.label.toUpperCase().startsWith(mName) || mName.startsWith(m.label.toUpperCase().slice(0, 3)));
          if (foundM) month = foundM.value;
        }
        if (!year) {
          let y = parseInt(yStr, 10);
          if (!isNaN(y)) {
            if (y < 100) y += 2000;
            year = y;
          }
        }
      } else if (mStr.includes("'")) {
        const parts = mStr.split("'");
        const mName = parts[0].trim().toUpperCase();
        const yStr = parts[1].trim();
        if (!month) {
          const foundM = MONTHS_LIST.find(m => m.label.toUpperCase().startsWith(mName) || mName.startsWith(m.label.toUpperCase().slice(0, 3)));
          if (foundM) month = foundM.value;
        }
        if (!year) {
          let y = parseInt(yStr, 10);
          if (!isNaN(y)) {
            if (y < 100) y += 2000;
            year = y;
          }
        }
      } else if (!month) {
        const u = mStr.toUpperCase();
        const foundM = MONTHS_LIST.find(m => m.label.toUpperCase() === u || u.startsWith(m.label.toUpperCase().slice(0, 3)));
        if (foundM) month = foundM.value;
      }
    }

    return { year: year ? String(year) : '', month: month || 99 };
  }, []);

  // Dynamically extract all available years strictly from existing Bill Register records
  const availableYears = useMemo(() => {
    const yearsSet = new Set();
    computedRows.forEach(r => {
      const { year } = getRowMonthAndYear(r);
      if (year && year !== 'NaN' && String(year).trim().length === 4) {
        yearsSet.add(String(year).trim());
      }
    });
    return Array.from(yearsSet).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  }, [computedRows, getRowMonthAndYear]);

  // Site filter helpers
  const isNVL = useCallback((site) => /^NVL$/i.test((site || '').trim()), []);
  const isNVCL = useCallback((site) => /^NVCL$/i.test((site || '').trim()), []);
  const filteredRows = useMemo(() => {
    let result = computedRows;
    if (siteFilter === 'NVL') result = result.filter(r => isNVL(r.site));
    if (siteFilter === 'NVCL') result = result.filter(r => isNVCL(r.site));

    if (filterMonth !== 'All' && filterMonth !== '') {
      const targetM = parseInt(filterMonth, 10);
      result = result.filter(r => {
        const { month } = getRowMonthAndYear(r);
        return month === targetM;
      });
    }

    if (filterYear !== 'All' && filterYear !== '') {
      const targetY = String(filterYear).trim();
      result = result.filter(r => {
        const { year } = getRowMonthAndYear(r);
        return year === targetY;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(r => {
        const inv = (r.displayInvoiceNumber || r.invoiceNumber || '').toLowerCase();
        const site = (r.site || '').toLowerCase();
        const month = (r.month || '').toLowerCase();
        const ship = (r.shipmentNos || []).join(' ').toLowerCase();
        return inv.includes(q) || site.includes(q) || month.includes(q) || ship.includes(q);
      });
    }

    return result;
  }, [computedRows, siteFilter, filterMonth, filterYear, searchQuery, isNVL, isNVCL, getRowMonthAndYear]);

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

  const openDeductionModal = useCallback((invNo, specificReason = '') => {
    const r = rows.find(x => x.invoiceNumber === invNo);
    const computedR = computedRows.find(x => x.invoiceNumber === invNo);
    if (!r || !computedR) return;

    const groupTotalRecv = computedRows.filter(cr => cr.groupId === computedR.groupId).reduce((s, x) => s + x.receivable, 0);
    const groupDiff = Math.max(0, groupTotalRecv - num(computedR.groupData?.paymentAmount) - num(computedR.groupData?.tdsProvision));
    const origDebit = r.originalDebitAmount != null ? r.originalDebitAmount : groupDiff;

    const existingAllocations = r.deductionAllocations || [];
    const totalAlloc = existingAllocations.reduce((sum, a) => sum + (parseFloat(a.allocatedAmount) || 0), 0);
    const remDebit = Math.max(0, origDebit - totalAlloc);

    const reasonsList = r.debitReasons && r.debitReasons.length > 0 ? r.debitReasons : (specificReason ? [specificReason] : ['Damage / Shortage']);
    const selectedReason = specificReason || (reasonsList.length > 0 ? reasonsList[0] : 'Damage / Shortage');

    setDamageTarget({
      invoiceNumber: invNo,
      groupId: computedR.groupId,
      reasons: reasonsList,
      difference: origDebit,
      originalDebitAmount: origDebit,
      alreadyAllocated: totalAlloc,
      remainingDebitAmount: remDebit
    });

    let activeFy = r.damageYear || (selYear ? (selYear.startsWith('FY') ? selYear : `FY ${selYear}`) : 'FY 2026-27');
    if (activeFy && !activeFy.startsWith('FY') && activeFy.includes('-')) {
      activeFy = `FY ${activeFy}`;
    }
    setDamageYear(activeFy);

    let initMonths = [];
    if (r.damageMonth) {
      const matchMonth = ALL_MONTHS_NAMES.find(m => m.toLowerCase().startsWith(String(r.damageMonth).toLowerCase().slice(0, 3))) || r.damageMonth;
      initMonths = [matchMonth];
    } else if (r.month) {
      const matchMonth = ALL_MONTHS_NAMES.find(m => m.toLowerCase().startsWith(String(r.month).toLowerCase().slice(0, 3)));
      if (matchMonth) initMonths = [matchMonth];
    }
    setDamageSelectedMonths(initMonths);
    setDamageMonth(initMonths.length === 1 ? initMonths[0] : '');

    const initVehicles = r.damageVehicles || [];
    setDamageSelectedVehicles(initVehicles);

    setDamageDebitReason(selectedReason);
    setDamageAllocateAmount('');
    setSelectedTripIds([]);
    setTripAllocAmounts({});

    if (initMonths.length > 0 && activeFy) {
      axios.get(`${API_URL}/fy-details/vehicles?months=${initMonths.join(',')}&fy=${activeFy}`)
        .then(res => {
          const vList = res.data || [];
          const combined = [...new Set([...vList, ...initVehicles])].filter(Boolean).sort();
          setDamageVehicles(combined);
          if (initVehicles.length > 0) {
            fetchTripsForSelection(initMonths, initVehicles, activeFy);
          } else {
            setLoadedTrips([]);
          }
        })
        .catch(() => {
          setDamageVehicles(initVehicles);
          setLoadedTrips([]);
        });
    } else {
      setDamageVehicles(initVehicles);
      setLoadedTrips([]);
    }

    setDamageTrips(r.damageTrips || []);
    setDamageSelectedTrips(r.damageTrips || []);
    setDamageVehicleAmounts(r.damageVehicleAmounts || {});

    const existingRemarks = computedR.groupData?.remarks || '';
    const sepIdx = existingRemarks.indexOf('\n---\n');
    setDamageManualRemarks(sepIdx !== -1 ? existingRemarks.slice(sepIdx + 5) : '');

    setDamageModalOpen(true);
  }, [rows, computedRows, selYear]);

  const handleRowEdit = useCallback((invoiceNumber, field, value) => {
    if (field === 'debitReasons') {
      const r = rows.find(x => x.invoiceNumber === invoiceNumber);
      const computedR = computedRows.find(x => x.invoiceNumber === invoiceNumber);
      const oldReasons = r?.debitReasons || [];
      const newReasons = value || [];
      const addedReasons = newReasons.filter(x => !oldReasons.includes(x) && x !== 'None');

      if (r && computedR && addedReasons.length > 0) {
        openDeductionModal(invoiceNumber, addedReasons[0]);
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
          updated.displayInvoiceNumber = inv.replace(/^DAC[\/\-]/i, 'NVCL-').replace(/\//g, '-');
        } else if (value === 'NVL') {
          updated.displayInvoiceNumber = inv.replace(/^NVCL[\/\-]/i, 'DAC-').replace(/\//g, '-');
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
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
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
          debitReasons: r.debitReasons,
          damageYear: r.damageYear,
          damageMonth: r.damageMonth,
          damageVehicles: r.damageVehicles || [],
          damageTrips: r.damageTrips || [],
          damageVehicleAmounts: r.damageVehicleAmounts || {},
          slNo: r.slNo
        }, { headers });
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
        }, { headers });
      });
      await Promise.all([...rowP, ...payP]);
      setSnack({ severity: 'success', msg: 'All changes saved successfully!' });
      setDirtyRows(new Set());
      setDirtyGroups(new Set());
      await fetchData();
    } catch (err) {
      console.error('[saveAllChanges] error:', err);
      setSnack({ severity: 'error', msg: 'Failed to save: ' + (err.response?.data?.error || err.message) });
    } finally { setSaving(false); }
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

      const groupDiff = g.id ? groupTotalRecv - num(g.paymentAmount) - num(g.tdsProvision) : 0;

      const groupDeductionAlloc = g.id ? computedRows.filter(cr => cr.groupId === g.id).reduce((total, cr) => {
        const list = cr.deductionAllocations || [];
        return total + list.reduce((s, a) => s + num(a.allocatedAmount), 0);
      }, 0) : 0;

      const calcDebit = g.id
        ? (r.remainingDebitAmount != null
            ? Math.max(0, r.remainingDebitAmount)
            : (groupDeductionAlloc > 0
                ? Math.max(0, groupDiff - groupDeductionAlloc)
                : (g.debitAmount !== undefined && g.debitAmount !== '' && g.debitAmount !== null && Number(g.debitAmount) >= 0 && Number(g.debitAmount) !== groupDiff
                    ? Math.max(0, num(g.debitAmount))
                    : Math.max(0, groupDiff))))
        : 0;

      return { 'Invoice Date': r.invoiceDate, 'Invoice Number': r.invoiceNumber, 'Shipment Number': r.shipmentNos?.join(', ') || '', 'Month': r.month, 'SITE': r.site, 'BILL': r.billType, 'Amount': r.amount, 'CGST': r.cgst, 'SGST': r.sgst, 'Total Amount': r.totalAmount, 'Tds @2%': r.tds, 'Receivable': r.receivable, 'Payment Amount': g.paymentAmount || 0, 'TDS Provision': g.tdsProvision || 0, 'Difference': groupDiff, 'Payment Date': g.paymentDate || '', 'Reference No': g.referenceNo || '', 'Debit Amount': calcDebit, 'Debit Reasons(Deduction)': (r.debitReasons || []).join(', ') || 'None', 'Remarks': g.remarks || '' };
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

    const groupDiff = isGroupStart ? groupTotalRecv - num(gd.paymentAmount) - num(gd.tdsProvision) : 0;

    const groupAlloc = isGroupStart ? computedRows.filter(cr => cr.groupId === gid).reduce((total, cr) => {
      return total + Object.values(cr.damageVehicleAmounts || {}).reduce((tripSum, tripObj) => {
        return tripSum + Object.values(tripObj || {}).reduce((s, v) => s + num(v), 0);
      }, 0);
    }, 0) : 0;

    const groupDeductionAlloc = isGroupStart ? computedRows.filter(cr => cr.groupId === gid).reduce((total, cr) => {
      const list = cr.deductionAllocations || [];
      return total + list.reduce((s, a) => s + num(a.allocatedAmount), 0);
    }, 0) : 0;

    const groupRows = computedRows.filter(cr => cr.groupId === gid);
    const rowWithRemaining = groupRows.find(cr => cr.remainingDebitAmount != null);
    const calcDebit = isGroupStart
      ? (rowWithRemaining
          ? Math.max(0, rowWithRemaining.remainingDebitAmount)
          : (groupDeductionAlloc > 0
              ? Math.max(0, groupDiff - groupDeductionAlloc)
              : (gd.debitAmount !== undefined && gd.debitAmount !== '' && gd.debitAmount !== null && Number(gd.debitAmount) >= 0 && Number(gd.debitAmount) !== groupDiff
                  ? Math.max(0, num(gd.debitAmount))
                  : Math.max(0, groupDiff - groupAlloc))))
      : 0;

    // Row styling logic matched perfectly to Cement Register
    const hasDraft = dirtyRows.has(r.invoiceNumber) || (gid && dirtyGroups.has(gid));
    const isSelected = selectedIds.includes(r.invoiceNumber);
    const isMatch = !!searchQuery;

    let baseBg = r.isLocked ? '#f8fafc' : isMatch
      ? '#f1f5f9'
      : isSelected
        ? '#f5f3ff'
        : hasDraft ? '#fffbeb'
          : ri % 2 === 0 ? '#ffffff' : '#fafafa';

    let paymentBg = baseBg;
    const autoGenBg = baseBg;
    const calcBg = baseBg;
    const financeBg = baseBg;

    const td = (extra = {}) => {
      return {
        padding: '10px 6px', borderRight: '1px solid rgba(0,0,0,0.05)', borderBottom: '1px solid #e2e8f0',
        fontSize: 11, verticalAlign: 'middle', background: baseBg,
        color: '#1e293b',
        ...extra
      };
    };


    // Parse month/year for the Month/Year column
    const { year: derivedYear, month: derivedMonthIdx } = getRowMonthAndYear(r);
    const derivedMonthName = (derivedMonthIdx >= 1 && derivedMonthIdx <= 12) ? MONTH_NAMES_FULL[derivedMonthIdx] : '';

    const rawMonth = String(r.month || '').trim();
    let curM = '', curY = '';
    if (rawMonth.includes('-')) {
      const parts = rawMonth.split('-');
      curM = parts[0].trim();
      curY = parts[1].trim();
      if (curY.startsWith("'")) curY = '20' + curY.substring(1);
    } else if (rawMonth.includes("'")) {
      const parts = rawMonth.split("'");
      curM = parts[0].trim();
      curY = '20' + parts[1].trim();
    } else if (rawMonth.includes(' ')) {
      const parts = rawMonth.split(' ');
      curM = parts[0].trim();
      curY = parts[1].trim();
      if (curY.startsWith("'")) curY = '20' + curY.substring(1);
    } else {
      curM = rawMonth;
    }

    const matchFull = MONTH_NAMES_FULL.find(m => m && m.toUpperCase() === curM.toUpperCase());
    if (matchFull) curM = matchFull;
    else curM = derivedMonthName;

    if (!curY || isNaN(parseInt(curY, 10))) {
      curY = derivedYear;
    }

    const rowYears = (curY && !availableYears.includes(curY))
      ? [...availableYears, curY].sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
      : availableYears;

    const handleMonthYearChange = (type, val) => {
      let newM = type === 'M' ? val : (curM || derivedMonthName || 'January');
      let newY = type === 'Y' ? val : (curY || derivedYear || '');

      handleRowEdit(r.invoiceNumber, 'month', newY ? `${newM.toUpperCase()}-${newY}` : newM.toUpperCase());
    };

    return (
      <React.Fragment key={ri}>
        <tr style={{
          background: baseBg,
          outline: isMatch ? '2px solid #cbd5e1' : (isSelected ? '2px solid rgba(124,58,237,0.4)' : 'none'),
          transition: 'background 0.2s, opacity 0.2s',
          opacity: r.isLocked ? 0.85 : 1,
          boxShadow: r.isLocked ? 'inset 0 0 0 9999px rgba(226,232,240,0.3)' : 'none'
        }} className="table-row-hover">
          {/* Sl No */}
          <td style={td({ textAlign: 'center', color: '#64748b', fontWeight: 600, position: 'sticky', left: 0, zIndex: 4, background: baseBg, borderRight: '1px solid #cbd5e1' })}>{page * PAGE_SIZE + ri + 1}</td>

          {/* Select */}
          <td style={td({ textAlign: 'center', position: 'sticky', left: 50, zIndex: 4, background: baseBg, borderRight: '1px solid #cbd5e1' })}>
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

          {/* Invoice Number */}
          <td style={td({ textAlign: 'left', position: 'sticky', left: 100, zIndex: 4, background: r.isLocked ? autoGenBg : baseBg, borderRight: '1px solid #cbd5e1' })}>
            <Box display="flex" alignItems="center" gap={0.5}>
              {r.isLocked && (
                <Tooltip title="Generated from Cement Register - Read Only">
                  <LockIcon sx={{ fontSize: 14, color: '#0284c7' }} />
                </Tooltip>
              )}
              <input
                value={r.displayInvoiceNumber || ''}
                onChange={e => handleRowEdit(r.invoiceNumber, 'displayInvoiceNumber', e.target.value)}
                disabled={r.isLocked}
                style={{ ...iStyle, fontWeight: 700, width: '100%', color: r.isLocked ? '#0369a1' : 'inherit' }}
              />
            </Box>
          </td>

          {/* Invoice Date */}
          <td style={td({ textAlign: 'center', background: r.isLocked ? autoGenBg : baseBg })}>
            <input
              type="date"
              value={formatDateForInput(r.invoiceDate)}
              onChange={e => handleRowEdit(r.invoiceNumber, 'invoiceDate', e.target.value)}
              disabled={r.isLocked}
              style={{ ...iStyle, width: 110, textAlign: 'center', fontWeight: 600, color: r.isLocked ? '#0369a1' : 'inherit' }}
            />
          </td>

          {/* Shipment Number */}
          <td style={td({ textAlign: 'left', whiteSpace: 'normal', maxWidth: 120, background: r.isLocked ? autoGenBg : baseBg, color: r.isLocked ? '#0369a1' : 'inherit' })}>
            {r.shipmentNos?.join(', ') || ''}
          </td>

          {/* Month */}
          <td style={td({ textAlign: 'center', background: r.isLocked ? autoGenBg : baseBg })}>
            <div style={{ display: 'flex', gap: 2 }}>
              <SearchableSelect variant="standard" value={curM} onChange={e => handleMonthYearChange('M', e.target.value)} style={{ ...selStyle, color: r.isLocked ? '#0369a1' : 'inherit', minWidth: 110 }} disabled={r.isLocked}>
                <option value="">Month</option>
                {MONTH_NAMES_FULL.slice(1).map(m => <option key={m} value={m}>{m}</option>)}
              </SearchableSelect>
              <SearchableSelect variant="standard" value={curY} onChange={e => handleMonthYearChange('Y', e.target.value)} style={{ ...selStyle, color: r.isLocked ? '#0369a1' : 'inherit', minWidth: 80 }} disabled={r.isLocked}>
                <option value="">Year</option>
                {rowYears.map(y => <option key={y} value={y}>{y}</option>)}
              </SearchableSelect>
            </div>
          </td>

          {/* Site */}
          <td style={td({ textAlign: 'center', background: r.isLocked ? autoGenBg : baseBg })}>
            <SearchableSelect variant="standard"
              value={r.site || 'NVCL'}
              onChange={e => handleRowEdit(r.invoiceNumber, 'site', e.target.value)}
              disabled={r.isLocked}
              style={{ ...selStyle, fontWeight: 600, textAlign: 'center', color: r.isLocked ? '#0369a1' : 'inherit', minWidth: 100 }}
            >
              <option value="NVCL">NVCL</option>
              <option value="NVL">NVL</option>
            </SearchableSelect>
          </td>

          {/* Bill Type */}
          <td style={td({ background: r.isLocked ? autoGenBg : baseBg })}>
            <SearchableSelect variant="standard" value={r.billType || 'FREIGHT'} onChange={e => handleRowEdit(r.invoiceNumber, 'billType', e.target.value)} disabled={r.isLocked} style={{ ...selStyle, color: r.isLocked ? '#0369a1' : 'inherit', minWidth: 130 }}>
              {BILL_TYPES.map(b => <option key={b} value={b}>{b}</option>)}
            </SearchableSelect>
          </td>

          {/* Amount */}
          <td style={td({ textAlign: 'right', background: r.isLocked ? autoGenBg : baseBg })}>
            <input
              type="number"
              value={r.amount || ''}
              onChange={e => handleRowEdit(r.invoiceNumber, 'amount', e.target.value)}
              disabled={r.isLocked}
              style={{ ...iStyle, textAlign: 'right', fontWeight: 600, color: r.isLocked ? '#0369a1' : 'inherit' }}
              placeholder="0"
            />
          </td>

          {/* CGST */}
          <td style={td({ textAlign: 'right', background: calcBg })}>₹{r.cgst?.toLocaleString('en-IN')}</td>
          {/* SGST */}
          <td style={td({ textAlign: 'right', background: calcBg })}>₹{r.sgst?.toLocaleString('en-IN')}</td>
          {/* Total Amount */}
          <td style={td({ textAlign: 'right', background: calcBg, fontWeight: 700 })}>₹{r.totalAmount?.toLocaleString('en-IN')}</td>
          {/* TDS */}
          <td style={td({ textAlign: 'right', background: calcBg, fontWeight: 600 })}>₹{r.tds?.toLocaleString('en-IN')}</td>
          {/* Receivable */}
          <td style={td({ textAlign: 'right', background: financeBg, fontWeight: 800 })}>₹{r.receivable?.toLocaleString('en-IN')}</td>

          {/* Payment Amount — grouped cell */}
          {(!gid || isGroupStart) && (
            <td style={td({ background: paymentBg })} rowSpan={rowSpan}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <input
                  type="number"
                  value={gd.paymentAmount || ''}
                  readOnly
                  style={{
                    width: '100%', padding: '4px 6px',
                    border: '1px solid #cbd5e1', borderRadius: '4px',
                    fontSize: '0.8rem', background: '#f8fafc',
                    color: '#64748b'
                  }}
                  title="Auto-synced from Bank Book"
                />
                <label style={{ cursor: 'pointer', textAlign: 'right' }}>
                  <span style={{ fontSize: 10, color: '#4f46e5', fontWeight: 600, border: '1px solid #818cf8', borderRadius: 4, padding: '2px 6px', background: '#fff' }}>
                    {uploadingGroup === gid ? 'Uploading…' : gd.paymentProofUrl ? 'Change Proof' : 'Upload Proof'}
                  </span>
                  <input type="file" hidden accept=".pdf,image/*" onChange={e => { if (e.target.files[0]) handleFileUpload(gid, e.target.files[0], gd); }} />
                </label>
                {gd.paymentProofUrl && <a href={gd.paymentProofUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#3b82f6', textAlign: 'right', fontWeight: 600 }}>View Proof</a>}
              </div>
            </td>
          )}

          {/* TDS Provision */}
          {(!gid || isGroupStart) && (
            <td style={td({ background: paymentBg })} rowSpan={rowSpan}>
              <input type="number" value={gd.tdsProvision || ''} onChange={e => handleInlineEdit(gid, 'tdsProvision', e.target.value, gd)} style={{ ...iStyle, textAlign: 'right', fontWeight: 700, color: '#0f172a' }} placeholder="0" />
            </td>
          )}

          {/* Difference */}
          {(!gid || isGroupStart) && (
            <td style={td({ textAlign: 'right', background: paymentBg, fontWeight: 800 })} rowSpan={rowSpan}>
              {isGroupStart ? `₹${groupDiff.toLocaleString('en-IN')}` : ''}
            </td>
          )}

          {/* Payment Date */}
          {(!gid || isGroupStart) && (
            <td style={td({ textAlign: 'center', background: paymentBg, fontWeight: 600, color: '#334155' })} rowSpan={rowSpan}>
              {gd.paymentDate ? (() => {
                const p = gd.paymentDate.split('-');
                return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : gd.paymentDate;
              })() : ''}
            </td>
          )}

          {/* Reference No */}
          {(!gid || isGroupStart) && (
            <td style={td({ background: paymentBg, fontWeight: 600, color: '#334155' })} rowSpan={rowSpan}>
              {gd.referenceNo || ''}
            </td>
          )}

          {/* Debit Amount */}
          {(!gid || isGroupStart) && (
            <td style={td({ background: paymentBg, textAlign: 'right', fontWeight: 700, color: '#0f172a' })} rowSpan={rowSpan}>
              {isGroupStart && calcDebit > 0 ? `₹${calcDebit.toLocaleString('en-IN')}` : (isGroupStart ? '₹0' : '')}
            </td>
          )}

          {/* Debit Reasons (per row) */}
          <td style={td({ background: paymentBg, minWidth: 220 })}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <MultiSelectSearchable
                variant="standard"
                value={r.debitReasons || []}
                onChange={e => handleRowEdit(r.invoiceNumber, 'debitReasons', e.target.value)}
                options={DEBIT_REASONS}
                style={{ ...selStyle, minWidth: 190, fontWeight: 600, color: '#334155' }}
              />
              {((r.debitReasons && r.debitReasons.length > 0) || (r.deductionAllocations && r.deductionAllocations.length > 0)) && (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.5 }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openDeductionModal(r.invoiceNumber);
                    }}
                    style={{
                      background: (r.deductionAllocations && r.deductionAllocations.length > 0) ? '#ecfdf5' : '#eef2ff',
                      color: (r.deductionAllocations && r.deductionAllocations.length > 0) ? '#059669' : '#4f46e5',
                      border: `1px solid ${(r.deductionAllocations && r.deductionAllocations.length > 0) ? '#a7f3d0' : '#c7d2fe'}`,
                      borderRadius: 4,
                      padding: '2px 8px',
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <span>📊</span>
                    <span>
                      {(r.deductionAllocations && r.deductionAllocations.length > 0)
                        ? `Allocated (₹${(r.totalAllocatedAmount || 0).toLocaleString('en-IN')})`
                        : 'Allocate Deduction'}
                    </span>
                  </button>
                  {r.remainingDebitAmount === 0 && (r.deductionAllocations && r.deductionAllocations.length > 0) && (
                    <span style={{ fontSize: 9, fontWeight: 800, color: '#16a34a', background: '#dcfce7', padding: '1px 5px', borderRadius: 4 }}>
                      SETTLED
                    </span>
                  )}
                </Box>
              )}
            </Box>
          </td>

          {/* Remarks */}
          {(!gid || isGroupStart) && (
            <td style={td({ background: paymentBg })} rowSpan={rowSpan}>
              <textarea value={gd.remarks || ''} onChange={e => handleInlineEdit(gid, 'remarks', e.target.value, gd)} style={{ ...iStyle, resize: 'vertical', minHeight: '36px', fontFamily: 'inherit', color: '#334155' }} />
            </td>
          )}
        </tr>
      </React.Fragment>
    );
  };
  const thStyle = (extra = {}) => ({
    position: 'sticky', top: 0, zIndex: 10,
    background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
    backgroundColor: '#0f172a',
    color: '#e2e8f0',
    padding: '10px 6px', whiteSpace: 'pre-line',
    fontSize: 10, fontWeight: 700, textAlign: 'center', letterSpacing: '0.5px',
    borderRight: '1px solid rgba(255,255,255,0.05)',
    borderBottom: '2px solid rgba(255,255,255,0.15)',
    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
    ...extra
  });



  const finalFilteredRows = computedRows.filter(r => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const match = Object.values(r).some(v => String(v || '').toLowerCase().includes(q));
      if (!match) return false;
    }
    if (filterBillType !== 'All' && String(r.billType || '') !== filterBillType) return false;
    if (filterPartyName !== 'All' && String(r.partyName || '') !== filterPartyName) return false;
    if (filterPaymentStatus !== 'All') {
      const isPaid = num(r.paymentAmount) >= num(r.receivable) && num(r.receivable) > 0;
      if (filterPaymentStatus === 'Paid' && !isPaid) return false;
      if (filterPaymentStatus === 'Pending' && isPaid) return false;
    }
    return true;
  });

  const totalBills = finalFilteredRows.length;
  const freightBills = finalFilteredRows.filter(r => String(r.billType).toUpperCase() === 'FREIGHT').length;
  const unloadingBills = finalFilteredRows.filter(r => String(r.billType).toUpperCase() === 'UNLOADING').length;
  const totalBillAmount = finalFilteredRows.reduce((sum, r) => sum + num(r.totalAmount), 0);
  const totalPaidAmount = finalFilteredRows.reduce((sum, r) => sum + num(r.paymentAmount), 0);
  const totalDueAmount = totalBillAmount - totalPaidAmount;
  const pendingBills = finalFilteredRows.filter(r => num(r.paymentAmount) < num(r.receivable)).length;
  const paidBills = finalFilteredRows.filter(r => num(r.paymentAmount) >= num(r.receivable) && num(r.receivable) > 0).length;

  return (
    <Box sx={{
      minHeight: '100vh',
      maxHeight: { md: '100vh' },
      display: 'flex',
      flexDirection: 'column',
      bgcolor: 'background.default',
      fontFamily: 'Inter, sans-serif',
      overflow: { xs: 'auto', md: 'hidden' }
    }}>

      {/* ── Premium Header ───────────────────────────────────────────── */}
      <Box sx={{
        px: { xs: 2, md: 4 }, py: 2,
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 2, borderBottom: '1px solid rgba(255,255,255,0.1)',
      }}>
        <Box display="flex" alignItems="center" gap={2}>
          <IconButton onClick={onBack} sx={{ bgcolor: 'rgba(255,255,255,0.05)', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }, p: 1, borderRadius: '12px' }}>
            <ArrowBackIcon fontSize="small" sx={{ color: '#f8fafc' }} />
          </IconButton>
          <Box>
            <Typography variant="h5" fontWeight={800} sx={{ color: '#fff', letterSpacing: '-0.5px' }}>
              Bill Register
            </Typography>
            <Box display="flex" alignItems="center" gap={1.5} mt={0.5}>
              <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600 }}>
                Total Records: <span style={{ color: '#e2e8f0' }}>{filteredRows.length}</span>
              </Typography>
              <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: '#475569' }} />
              <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600 }}>
                Period: <span style={{ color: '#e2e8f0' }}>FY {selYear}</span>
              </Typography>
            </Box>
          </Box>
        </Box>

        <Box display="flex" alignItems="center" gap={1.5}>
          <SearchableSelect
            value={selYear}
            onChange={e => setSelYear(e.target.value)}
            size="small"
            sx={{
              borderRadius: '10px', fontSize: '12px', fontWeight: 700,
              color: '#fff', bgcolor: 'rgba(255,255,255,0.05)',
              '& .MuiInputBase-input': { color: '#fff' },
              '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#a78bfa' },
              '.MuiSvgIcon-root': { color: '#94a3b8' },
              minWidth: 140,
            }}
          >
            {FY_OPTIONS.map(y => (
              <MenuItem key={y} value={y} sx={{ fontSize: '12px', fontWeight: 600 }}>{y}</MenuItem>
            ))}
          </SearchableSelect>
        </Box>
      </Box>



      {/* ── Toolbar & Quick Filters ────────────────────────────────────── */}
      <Box sx={{
        px: { xs: 2, md: 4 }, py: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        bgcolor: 'background.paper', borderBottom: '1px solid #e2e8f0',
        gap: 2, flexWrap: 'wrap'
      }}>
        {/* Filters Left Side */}
        <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
          <Box display="flex" alignItems="center" sx={{
            bgcolor: 'background.default', borderRadius: '12px', px: 2, py: 1, border: '1px solid #e2e8f0',
            '&:focus-within': { borderColor: '#7c3aed', boxShadow: '0 0 0 2px rgba(124,58,237,0.1)' }, width: 260
          }}>
            <span style={{ marginRight: 8, opacity: 0.5 }}>🔍</span>
            <input
              type="text"
              placeholder="Search invoice, party, vehicle..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '13px', width: '100%', color: '#0f172a', fontWeight: 500 }}
            />
            {searchQuery && (
              <div onClick={() => { setSearchQuery(''); setPage(0); }} style={{ cursor: 'pointer', color: '#94a3b8', fontSize: '14px', marginLeft: '4px', fontWeight: 'bold' }}>✕</div>
            )}
          </Box>

          <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
            <SearchableSelect
              value={siteFilter}
              onChange={(e) => handleSiteFilter(e.target.value)}
              size="small"
              sx={{ borderRadius: '10px', fontSize: '12px', fontWeight: 600, bgcolor: 'background.default', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' }, minWidth: 130 }}
            >
              <MenuItem value="All" sx={{ fontSize: '12px' }}>All Sites ({computedRows.length})</MenuItem>
              <MenuItem value="NVCL" sx={{ fontSize: '12px' }}>NVCL ({computedRows.filter(r => isNVCL(r.site)).length})</MenuItem>
              <MenuItem value="NVL" sx={{ fontSize: '12px' }}>NVL ({computedRows.filter(r => isNVL(r.site)).length})</MenuItem>
            </SearchableSelect>

            <SearchableSelect
              value={filterMonth}
              onChange={(e) => { setFilterMonth(e.target.value); setPage(0); }}
              size="small"
              sx={{ borderRadius: '10px', fontSize: '12px', fontWeight: 600, bgcolor: 'background.default', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' }, minWidth: 130 }}
            >
              <MenuItem value="All" sx={{ fontSize: '12px' }}>All Months</MenuItem>
              {MONTHS_LIST.map(m => (
                <MenuItem key={m.value} value={m.value} sx={{ fontSize: '12px' }}>{m.label}</MenuItem>
              ))}
            </SearchableSelect>

            <SearchableSelect
              value={filterYear}
              onChange={(e) => { setFilterYear(e.target.value); setPage(0); }}
              size="small"
              sx={{ borderRadius: '10px', fontSize: '12px', fontWeight: 600, bgcolor: 'background.default', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' }, minWidth: 120 }}
            >
              <MenuItem value="All" sx={{ fontSize: '12px' }}>All Years</MenuItem>
              {availableYears.map(y => (
                <MenuItem key={y} value={y} sx={{ fontSize: '12px' }}>{y}</MenuItem>
              ))}
            </SearchableSelect>
          </Box>
        </Box>

        {/* Action Buttons Right Side */}
        <Box display="flex" gap={1} alignItems="center">
          {selectedIds.length > 0 && (
            <Button size="small" variant="contained" color="error" startIcon={<DeleteIcon sx={{ fontSize: '1rem' }} />}
              onClick={handleDeleteRows}
              sx={{ fontWeight: 700, borderRadius: '10px', fontSize: '0.8rem', textTransform: 'none', boxShadow: 'none', mr: 1 }}>
              Delete
            </Button>
          )}

          <Button size="small" variant="outlined" startIcon={<TableChartIcon sx={{ fontSize: '1rem', color: '#10b981' }} />}
            onClick={() => setExcelModalOpen(true)}
            sx={{ fontWeight: 700, borderRadius: '10px', fontSize: '0.8rem', color: '#059669', borderColor: '#a7f3d0', bgcolor: '#ecfdf5', textTransform: 'none', '&:hover': { bgcolor: '#d1fae5', borderColor: '#34d399' } }}>
            Upload Bill Register
          </Button>

          <Button size="small" variant="outlined" color="error" startIcon={<DeleteForeverIcon sx={{ fontSize: '1rem' }} />}
            onClick={() => setClearConfirmOpen(true)}
            disabled={loading || clearingData}
            sx={{ fontWeight: 700, borderRadius: '10px', fontSize: '0.8rem', color: '#dc2626', borderColor: '#fca5a5', bgcolor: '#fef2f2', textTransform: 'none', '&:hover': { bgcolor: '#fee2e2', borderColor: '#f87171' } }}>
            Clear All Data
          </Button>

          <Button size="small" variant="outlined" startIcon={<AddIcon sx={{ fontSize: '1rem' }} />} onClick={handleAddRow}
            sx={{ fontWeight: 700, borderRadius: '10px', fontSize: '0.8rem', color: '#475569', borderColor: '#e2e8f0', textTransform: 'none', '&:hover': { bgcolor: 'background.default', borderColor: '#cbd5e1' } }}>
            Add Row
          </Button>

          <Button size="small" variant="outlined" startIcon={<UploadIcon sx={{ fontSize: '1rem' }} />} onClick={() => setDocModalOpen(true)}
            sx={{ fontWeight: 700, borderRadius: '10px', fontSize: '0.8rem', color: '#475569', borderColor: '#e2e8f0', textTransform: 'none', '&:hover': { bgcolor: 'background.default', borderColor: '#cbd5e1' } }}>
            PDF Docs ({pageDocuments.length})
          </Button>

          <Box sx={{ width: '1px', height: '24px', bgcolor: '#e2e8f0', mx: 0.5, display: { xs: 'none', md: 'block' } }} />

          {selectedIds.length > 0 && (
            <Button variant="contained" size="small" onClick={openPaymentModal}
              sx={{ fontWeight: 700, borderRadius: '10px', bgcolor: '#3b82f6', color: '#fff', textTransform: 'none', boxShadow: '0 4px 10px rgba(59,130,246,0.3)', '&:hover': { bgcolor: '#2563eb' } }}>
              Group Payment
            </Button>
          )}

          <Button size="small" variant="outlined" startIcon={<DownloadIcon sx={{ fontSize: '1rem' }} />} onClick={handleExport}
            sx={{ fontWeight: 700, borderRadius: '10px', fontSize: '0.8rem', color: '#475569', borderColor: '#e2e8f0', textTransform: 'none', '&:hover': { bgcolor: 'background.default', borderColor: '#cbd5e1' } }}>
            Export
          </Button>

          <Button
            size="small" variant="contained"
            startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon sx={{ fontSize: '1.1rem' }} />}
            onClick={saveAllChanges} disabled={(dirtyRows.size === 0 && dirtyGroups.size === 0) || saving}
            sx={{
              fontWeight: 700, borderRadius: '10px', px: 2.5, fontSize: '0.85rem', textTransform: 'none',
              background: (dirtyRows.size > 0 || dirtyGroups.size > 0) ? 'linear-gradient(135deg,#10b981,#059669)' : '#f1f5f9',
              color: (dirtyRows.size > 0 || dirtyGroups.size > 0) ? '#fff' : '#94a3b8',
              boxShadow: (dirtyRows.size > 0 || dirtyGroups.size > 0) ? '0 4px 12px rgba(16, 185, 129, 0.25)' : 'none',
              '&:hover': { background: (dirtyRows.size > 0 || dirtyGroups.size > 0) ? 'linear-gradient(135deg,#059669,#047857)' : '#f1f5f9' },
            }}>
            {saving ? 'Saving...' : `Save${(dirtyRows.size + dirtyGroups.size) > 0 ? ` (${dirtyRows.size + dirtyGroups.size})` : ''}`}
          </Button>

          <Tooltip title="Print Register">
            <IconButton size="small" onClick={() => window.print()} sx={{ bgcolor: 'background.default', border: '1px solid #e2e8f0', '&:hover': { bgcolor: 'background.default' }, p: 0.75, borderRadius: '10px' }}>
              <PrintIcon sx={{ fontSize: '1.1rem', color: '#475569' }} />
            </IconButton>
          </Tooltip>

          <Tooltip title="Refresh Data">
            <IconButton size="small" onClick={fetchData} sx={{ bgcolor: 'background.default', border: '1px solid #e2e8f0', '&:hover': { bgcolor: 'background.default' }, p: 0.75, borderRadius: '10px' }}>
              <RefreshIcon sx={{ fontSize: '1.1rem', color: '#475569' }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* 4. Table Container */}
      <Box sx={{ p: { xs: 1, md: 2 }, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          overflow: 'auto',
          maxHeight: { xs: '72vh', md: 'calc(100vh - 215px)' },
          minHeight: '400px',
          bgcolor: 'background.paper',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
          position: 'relative'
        }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, whiteSpace: 'normal', fontFamily: 'Inter,sans-serif', fontSize: 13, width: 'max-content', minWidth: '100%' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr>
                <th style={thStyle({ minWidth: 50, position: 'sticky', left: 0, top: 0, zIndex: 12, borderRight: '1px solid rgba(255,255,255,0.05)' })}>Sl No</th>
                <th style={thStyle({ minWidth: 50, position: 'sticky', left: 50, top: 0, zIndex: 12, borderRight: '1px solid rgba(255,255,255,0.05)' })}>Select</th>
                <th style={thStyle({ minWidth: 170, position: 'sticky', left: 100, top: 0, zIndex: 12, borderRight: '1px solid rgba(255,255,255,0.05)' })}>Invoice Number</th>
                <th style={thStyle({ minWidth: 120 })}>Invoice Date</th>
                <th style={thStyle({ minWidth: 150 })}>Shipment Number</th>
                <th style={thStyle({ minWidth: 220 })}>Month</th>
                <th style={thStyle({ minWidth: 140 })}>SITE</th>
                <th style={thStyle({ minWidth: 160 })}>BILL</th>
                <th style={thStyle({ minWidth: 100 })}>Amount</th>
                <th style={thStyle({ minWidth: 80 })}>CGST</th>
                <th style={thStyle({ minWidth: 80 })}>SGST</th>
                <th style={thStyle({ minWidth: 110 })}>Total Amount</th>
                <th style={thStyle({ minWidth: 90 })}>TDS @2%</th>
                <th style={thStyle({ minWidth: 130 })}>Receivable</th>
                <th style={thStyle({ minWidth: 150 })}>Payment Amount<br />(Paid)</th>
                <th style={thStyle({ minWidth: 100 })}>TDS Provision</th>
                <th style={thStyle({ minWidth: 100 })}>Difference</th>
                <th style={thStyle({ minWidth: 130 })}>Payment Date</th>
                <th style={thStyle({ minWidth: 100 })}>Reference No</th>
                <th style={thStyle({ minWidth: 110 })}>Debit Amount</th>
                <th style={thStyle({ minWidth: 240 })}>Debit Reasons(Deduction)</th>
                <th style={thStyle({ minWidth: 350, borderRight: 'none' })}>Remarks</th>
              </tr>
            </thead>
            <tbody style={{ '& > tr:hover': { background: '#f8fafc' } }}>
              {visibleRows.map((r, ri) => renderRow(r, ri))}
            </tbody>
          </table>
        </Box>
      </Box>

      {/* Pagination */}
      {totalPages > 1 && (
        <Box sx={{ p: 2, bgcolor: 'background.paper', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 2, alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="body2" sx={{ color: '#64748b', fontWeight: 600 }}>
            Showing {page * PAGE_SIZE + 1} – {Math.min((page + 1) * PAGE_SIZE, filteredRows.length)} of {filteredRows.length} records
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button size="small" variant="outlined" disabled={page === 0} onClick={() => setPage(p => p - 1)} sx={{ borderRadius: 1.5, fontWeight: 700, textTransform: 'none' }}>Previous</Button>
            <Button size="small" variant="outlined" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} sx={{ borderRadius: 1.5, fontWeight: 700, textTransform: 'none' }}>Next</Button>
          </Box>
        </Box>
      )}

      {/* Payment Modal */}
      {/* Payment Modal */}
      <Dialog open={paymentModalOpen} onClose={() => setPaymentModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Group Payment Details</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <Typography variant="body2" color="text.secondary">Applying to {selectedIds.length} invoices.</Typography>
          <TextField label="Receivable Amount (Auto-Calculated)" fullWidth value={paymentForm.receivableAmount || 0} InputProps={{ readOnly: true }} type="number" sx={{ bgcolor: 'background.default' }} />
          <TextField label="Payment Amount (Paid - Auto synced)" fullWidth value={paymentForm.paymentAmount} InputProps={{ readOnly: true }} type="number" sx={{ bgcolor: 'background.default' }} />
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
              <Box key={doc._id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1.5, border: '1px solid #e2e8f0', borderRadius: 2, bgcolor: 'background.default' }}>
                <Box>
                  <Typography variant="body2" fontWeight={600} sx={{ wordBreak: 'break-all' }}>
                    {doc.fileName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {doc.createdAt ? new Date(doc.createdAt).toLocaleString() : 'Uploaded just now'}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
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

      <Dialog
        open={damageModalOpen}
        onClose={() => setDamageModalOpen(false)}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '16px',
            bgcolor: '#ffffff',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            maxHeight: '94vh'
          }
        }}
      >
        {(() => {
          const inv = damageTarget?.invoiceNumber;
          const targetRow = rows.find(x => x.invoiceNumber === inv);
          const computedTargetRow = computedRows.find(x => x.invoiceNumber === inv);
          const groupTotalRecv = computedRows.filter(cr => cr.groupId === damageTarget?.groupId).reduce((s, x) => s + x.receivable, 0);
          const calculatedGroupDiff = Math.max(0, groupTotalRecv - num(computedTargetRow?.groupData?.paymentAmount) - num(computedTargetRow?.groupData?.tdsProvision));
          const baseOriginalDebit = targetRow?.originalDebitAmount != null ? targetRow.originalDebitAmount : calculatedGroupDiff;
          const currentAllocations = targetRow?.deductionAllocations || [];
          const totalAllocatedAmount = currentAllocations.reduce((s, a) => s + (parseFloat(a.allocatedAmount) || 0), 0);
          const remainingDebitAmount = Math.max(0, baseOriginalDebit - totalAllocatedAmount);
          const condition = getSelectionCondition(damageSelectedMonths, damageSelectedVehicles);

          const selectedTripsList = loadedTrips.filter(t => {
            const key = String(t._id || t.tripId || `${t.invoiceNo}-${t.loadingDate}`);
            return selectedTripIds.includes(key);
          });
          const totalTripAllocated = selectedTripsList.reduce((sum, t) => {
            const key = String(t._id || t.tripId || `${t.invoiceNo}-${t.loadingDate}`);
            return sum + (parseFloat(tripAllocAmounts[key]) || 0);
          }, 0);

          const enteredAllocateAmt = totalTripAllocated > 0 ? totalTripAllocated : (parseFloat(damageAllocateAmount) || 0);
          const isOverAllocated = totalTripAllocated > remainingDebitAmount;
          const newRemainingDebitAfterInput = Math.max(0, remainingDebitAmount - totalTripAllocated);

          const reasonBreakdown = currentAllocations.reduce((acc, a) => {
            const r = a.debitReason || 'Other';
            acc[r] = (acc[r] || 0) + (parseFloat(a.allocatedAmount) || 0);
            return acc;
          }, {});

          const getTripsForMonth = (m) => loadedTrips.filter(t => (t.month || '').toLowerCase() === (m || '').toLowerCase());
          const getTripsForVehicle = (v) => loadedTrips.filter(t => (t.vehicleNumber || t.vehicle || '').toLowerCase() === (v || '').toLowerCase());

          const renderTripCard = (trip) => {
            const tripKey = String(trip._id || trip.tripId || `${trip.invoiceNo}-${trip.loadingDate}`);
            const isSelected = selectedTripIds.includes(tripKey);
            const tripAmt = tripAllocAmounts[tripKey] ?? '';

            return (
              <Box
                key={tripKey}
                onClick={(e) => {
                  if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') {
                    toggleTripSelect(trip);
                  }
                }}
                sx={{
                  p: 1.5,
                  mb: 1.5,
                  borderRadius: '10px',
                  border: isSelected ? '2px solid #6366f1' : '1.5px solid #e2e8f0',
                  bgcolor: isSelected ? '#f5f3ff' : '#ffffff',
                  boxShadow: isSelected ? '0 4px 12px rgba(99, 102, 241, 0.12)' : '0 1px 3px rgba(0,0,0,0.03)',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer',
                  '&:hover': {
                    borderColor: isSelected ? '#4f46e5' : '#cbd5e1',
                    boxShadow: '0 4px 8px rgba(0,0,0,0.06)'
                  }
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, flex: 1 }}>
                    <Checkbox
                      checked={isSelected}
                      onChange={() => toggleTripSelect(trip)}
                      onClick={(e) => e.stopPropagation()}
                      sx={{
                        p: 0,
                        mt: 0.25,
                        color: '#94a3b8',
                        '&.Mui-checked': { color: '#6366f1' }
                      }}
                    />
                    <Box sx={{ flex: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>
                          Shipment No: <span style={{ color: '#4338ca', fontFamily: 'monospace' }}>{trip.shipmentNo || '—'}</span>
                        </Typography>
                        <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>
                          | Invoice: <span style={{ color: '#1e293b', fontFamily: 'monospace' }}>{trip.invoiceNo || '—'}</span>
                        </Typography>
                        {trip.month && (
                          <Chip
                            size="small"
                            label={trip.month}
                            sx={{ height: 18, fontSize: 10, fontWeight: 700, bgcolor: '#e0e7ff', color: '#3730a3' }}
                          />
                        )}
                      </Box>

                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 0.5, flexWrap: 'wrap', fontSize: '11px', color: '#64748b' }}>
                        <span>📅 Loading Date: <strong style={{ color: '#334155' }}>{trip.loadingDate || trip.invoiceDate || '—'}</strong></span>
                        <span>🚛 Vehicle: <strong style={{ color: '#334155' }}>{trip.vehicleNumber || trip.vehicle || '—'}</strong></span>
                        {(trip.origin || trip.destination) && (
                          <span>📍 Route: <strong style={{ color: '#334155' }}>{trip.origin || '—'} → {trip.destination || '—'}</strong></span>
                        )}
                        {(trip.totalFreight != null || trip.freightAmount != null) && (
                          <span>💰 Freight: <strong style={{ color: '#0f172a' }}>₹{Number(trip.totalFreight != null ? trip.totalFreight : trip.freightAmount).toLocaleString('en-IN')}</strong></span>
                        )}
                      </Box>
                    </Box>
                  </Box>

                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
                    <Typography sx={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      ALLOCATE AMOUNT
                    </Typography>
                    <Box
                      onClick={(e) => e.stopPropagation()}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        bgcolor: isSelected ? '#ffffff' : '#f8fafc',
                        border: isSelected ? '1.5px solid #6366f1' : '1px solid #cbd5e1',
                        borderRadius: '8px',
                        px: 1,
                        py: 0.5,
                        boxShadow: isSelected ? '0 2px 4px rgba(99, 102, 241, 0.15)' : 'none'
                      }}
                    >
                      <span style={{ fontSize: '13px', fontWeight: 800, color: isSelected ? '#4338ca' : '#94a3b8', marginRight: '4px' }}>₹</span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="0.00"
                        value={tripAmt}
                        disabled={!isSelected}
                        onChange={(e) => handleTripAmountChange(trip, e.target.value)}
                        style={{
                          width: '110px',
                          border: 'none',
                          outline: 'none',
                          fontSize: '13px',
                          fontWeight: 800,
                          color: isSelected ? '#0f172a' : '#94a3b8',
                          background: 'transparent',
                          fontFamily: 'monospace'
                        }}
                      />
                    </Box>
                  </Box>
                </Box>
              </Box>
            );
          };

          return (
            <React.Fragment>
              <DialogTitle sx={{ p: 2.5, borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: '#f8fafc' }}>
                <Box display="flex" alignItems="center" gap={1.5}>
                  <span style={{ fontSize: '22px' }}>⚖️</span>
                  <Box>
                    <Typography variant="h6" fontWeight={800} color="#0f172a" sx={{ lineHeight: 1.2 }}>
                      Debit Reasons (Deduction) Allocation
                    </Typography>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>
                      Invoice: <span style={{ color: '#4f46e5', fontFamily: 'monospace' }}>{inv || '—'}</span>
                    </Typography>
                  </Box>
                </Box>
                <Box display="flex" alignItems="center" gap={1}>
                  {isB2BEligibleDebitReason(damageDebitReason) && (
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => setB2bDialogOpen(true)}
                      startIcon={<ReceiptLongIcon sx={{ fontSize: 14 }} />}
                      sx={{
                        bgcolor: '#0ea5e9', '&:hover': { bgcolor: '#0284c7' },
                        color: '#fff', fontSize: 11, fontWeight: 800, py: 0.5, px: 1.5,
                        borderRadius: '6px', textTransform: 'none',
                        boxShadow: '0 2px 4px rgba(14, 165, 233, 0.25)'
                      }}
                    >
                      B2B
                    </Button>
                  )}
                  <Button size="small" onClick={() => setDamageModalOpen(false)} sx={{ minWidth: 32, p: 0.5, color: '#64748b' }}>✕</Button>
                </Box>
              </DialogTitle>

              <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 3, p: 3 }}>
                {/* 1. FINANCIAL YEAR */}
                <Box>
                  <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#334155', mb: 0.75, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    1. Financial Year
                  </Typography>
                  <SearchableSelect
                    variant="standard"
                    value={damageYear}
                    onChange={handleDamageYearChange}
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #cbd5e1',
                      fontSize: '13px', fontWeight: 600, color: '#1e293b', background: '#fff'
                    }}
                  >
                    <option value="">Select Financial Year</option>
                    {FY_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
                  </SearchableSelect>
                </Box>

                {/* 2. MONTH SELECTION */}
                <Box>
                  <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#334155', mb: 0.75, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    2. Month Selection (Choose 1 or Multiple Months)
                  </Typography>
                  <Box sx={{ border: '1.5px solid #cbd5e1', borderRadius: '8px', p: 0.5, bgcolor: '#fff' }}>
                    <MultiSelectSearchable
                      options={ALL_MONTHS_NAMES}
                      value={damageSelectedMonths}
                      onChange={(e) => handleDamageMonthsChange(e.target.value)}
                      label="Select Month(s)..."
                    />
                  </Box>
                </Box>

                {/* 3. VEHICLE SELECTION */}
                <Box>
                  <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#334155', mb: 0.75, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    3. Vehicle Selection (Choose 1 or Multiple Vehicles)
                  </Typography>
                  <Box sx={{ border: '1.5px solid #cbd5e1', borderRadius: '8px', p: 0.5, bgcolor: damageSelectedMonths.length > 0 ? '#fff' : '#f8fafc' }}>
                    {damageSelectedMonths.length === 0 ? (
                      <Typography variant="body2" color="text.secondary" sx={{ py: 1.5, px: 1.5, fontSize: 12, textAlign: 'center' }}>
                        Please select Month(s) first to load available vehicles.
                      </Typography>
                    ) : (
                      <MultiSelectSearchable
                        options={damageVehicles}
                        value={damageSelectedVehicles}
                        onChange={(e) => handleDamageVehiclesChange(e.target.value)}
                        label="Select Vehicle(s)..."
                      />
                    )}
                  </Box>
                </Box>

                {/* 4. FINAL SELECTION PREVIEW */}
                {damageYear && (damageSelectedMonths.length > 0 || damageSelectedVehicles.length > 0) && (
                  <Box sx={{
                    border: '1.5px solid #cbd5e1', borderRadius: '12px', bgcolor: '#f8fafc',
                    p: 2.5, boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                  }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, pb: 1, borderBottom: '1.5px solid #e2e8f0' }}>
                      <Typography sx={{ fontSize: 12, fontWeight: 800, color: '#1e293b', letterSpacing: '0.5px' }}>
                        FINAL SELECTION PREVIEW
                      </Typography>
                      {condition && condition !== 'INVALID' ? (
                        <Box sx={{
                          px: 1.5, py: 0.5, borderRadius: '999px',
                          bgcolor: '#e0e7ff', color: '#4338ca',
                          fontSize: 11, fontWeight: 800, letterSpacing: '0.5px'
                        }}>
                          {condition}
                        </Box>
                      ) : condition === 'INVALID' ? (
                        <Box sx={{
                          px: 1.5, py: 0.5, borderRadius: '999px',
                          bgcolor: '#fef2f2', color: '#dc2626',
                          fontSize: 11, fontWeight: 800
                        }}>
                          ⚠️ Unsupported Combination
                        </Box>
                      ) : null}
                    </Box>

                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 2 }}>
                      <Box>
                        <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                          FINANCIAL YEAR
                        </Typography>
                        <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                          {damageYear || '—'}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                          MONTH{damageSelectedMonths.length > 1 ? 'S' : ''}
                        </Typography>
                        <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                          {damageSelectedMonths.length > 0 ? damageSelectedMonths.join(', ') : 'None selected'}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                          VEHICLE{damageSelectedVehicles.length > 1 ? 'S' : ''}
                        </Typography>
                        <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                          {damageSelectedVehicles.length > 0 ? damageSelectedVehicles.join(', ') : 'None selected'}
                        </Typography>
                      </Box>
                    </Box>

                    {condition === 'INVALID' && (
                      <Typography sx={{ mt: 1.5, fontSize: 12, color: '#dc2626', fontWeight: 600 }}>
                        Notice: The system supports <strong>Multiple Months + 1 Vehicle</strong>, <strong>1 Month + Multiple Vehicles</strong>, or <strong>1 Month + 1 Vehicle</strong>. Please select either 1 vehicle or 1 month.
                      </Typography>
                    )}
                  </Box>
                )}

                {/* 5. ALLOCATION & DEBIT BALANCE */}
                {damageYear && condition && condition !== 'INVALID' && (
                  <Box sx={{
                    border: '1.5px solid #cbd5e1', borderRadius: '12px', bgcolor: '#ffffff',
                    p: 2.5, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
                  }}>
                    <Box sx={{ mb: 2.5, pb: 2, borderBottom: '1.5px solid #f1f5f9' }}>
                      <Typography sx={{ fontSize: 13, fontWeight: 800, color: '#1e293b', mb: 1.5, letterSpacing: '0.5px' }}>
                        ALLOCATION & DEBIT BALANCE
                      </Typography>
                      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 2 }}>
                        {/* DEBIT REASON */}
                        <Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                            <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                              DEBIT REASON
                            </Typography>
                            {isB2BEligibleDebitReason(damageDebitReason) && (
                              <Button
                                size="small"
                                variant="contained"
                                onClick={() => setB2bDialogOpen(true)}
                                startIcon={<ReceiptLongIcon sx={{ fontSize: 13 }} />}
                                sx={{
                                  fontSize: 10, fontWeight: 800, py: 0.2, px: 1, minHeight: 22,
                                  bgcolor: '#0ea5e9', '&:hover': { bgcolor: '#0284c7' },
                                  borderRadius: '6px', textTransform: 'none',
                                  boxShadow: '0 2px 4px rgba(14, 165, 233, 0.25)'
                                }}
                              >
                                B2B
                              </Button>
                            )}
                          </Box>
                          <select
                            value={damageDebitReason}
                            onChange={e => setDamageDebitReason(e.target.value)}
                            style={{
                              width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1',
                              fontSize: '12px', fontWeight: 700, color: '#1e293b', background: '#f8fafc', outline: 'none'
                            }}
                          >
                            {DEBIT_REASONS.filter(r => r !== 'None').map(reason => (
                              <option key={reason} value={reason}>{reason.toUpperCase()}</option>
                            ))}
                          </select>
                        </Box>

                        {/* ORIGINAL DEBIT AMOUNT */}
                        <Box sx={{ p: 1.5, bgcolor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                          <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                            ORIGINAL DEBIT AMOUNT
                          </Typography>
                          <Typography sx={{ fontSize: 18, fontWeight: 800, color: '#0f172a', fontFamily: 'monospace' }}>
                            ₹{baseOriginalDebit.toLocaleString('en-IN')}
                          </Typography>
                        </Box>

                        {/* ALREADY ALLOCATED */}
                        <Box sx={{ p: 1.5, bgcolor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                          <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                            ALREADY ALLOCATED
                          </Typography>
                          <Typography sx={{ fontSize: 18, fontWeight: 800, color: '#d97706', fontFamily: 'monospace' }}>
                            ₹{totalAllocatedAmount.toLocaleString('en-IN')}
                          </Typography>
                          {Object.keys(reasonBreakdown).length > 0 && (
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.75 }}>
                              {Object.entries(reasonBreakdown).map(([r, amt]) => (
                                <span
                                  key={r}
                                  style={{
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    background: '#fef3c7',
                                    color: '#92400e',
                                    padding: '1px 6px',
                                    borderRadius: '4px'
                                  }}
                                >
                                  {r}: ₹{amt.toLocaleString('en-IN')}
                                </span>
                              ))}
                            </Box>
                          )}
                        </Box>

                        {/* REMAINING AMOUNT */}
                        <Box sx={{
                          p: 1.5,
                          bgcolor: remainingDebitAmount === 0 ? '#f0fdf4' : '#f8fafc',
                          borderRadius: '8px',
                          border: remainingDebitAmount === 0 ? '1.5px solid #86efac' : '1px solid #e2e8f0'
                        }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Typography sx={{ fontSize: 10, fontWeight: 700, color: remainingDebitAmount === 0 ? '#15803d' : '#64748b', textTransform: 'uppercase' }}>
                              REMAINING AMOUNT
                            </Typography>
                            {remainingDebitAmount === 0 && (
                              <span style={{ fontSize: '10px', fontWeight: 800, background: '#dcfce7', color: '#166534', padding: '1px 6px', borderRadius: '4px' }}>
                                SETTLED
                              </span>
                            )}
                          </Box>
                          <Typography sx={{ fontSize: 18, fontWeight: 800, color: remainingDebitAmount === 0 ? '#16a34a' : '#2563eb', fontFamily: 'monospace' }}>
                            ₹{remainingDebitAmount.toLocaleString('en-IN')}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>

                    {/* SETTLED NOTICE OR TRIP SELECTION */}
                    {remainingDebitAmount === 0 ? (
                      <Box sx={{ p: 2.5, bgcolor: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: '10px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
                        <Typography sx={{ fontSize: 14, fontWeight: 800, color: '#15803d' }}>
                          ✓ Remaining Debit = ₹0. This debit is fully allocated and settled.
                        </Typography>
                        <Typography sx={{ fontSize: 12, color: '#166534', fontWeight: 600 }}>
                          No further allocations can be made against this debit record.
                        </Typography>
                        {isB2BEligibleDebitReason(damageDebitReason) && (
                          <Button
                            variant="contained"
                            onClick={() => setB2bDialogOpen(true)}
                            startIcon={<ReceiptLongIcon sx={{ fontSize: 16 }} />}
                            sx={{
                              bgcolor: '#0ea5e9', '&:hover': { bgcolor: '#0284c7' },
                              px: 2.5, py: 0.75, fontWeight: 800, fontSize: '12px', textTransform: 'none',
                              borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(14, 165, 233, 0.25)'
                            }}
                          >
                            B2B Entry
                          </Button>
                        )}
                      </Box>
                    ) : (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                        {/* TRIP SELECTION HEADER */}
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1, borderBottom: '1.5px solid #e2e8f0' }}>
                          <Box display="flex" alignItems="center" gap={1}>
                            <span style={{ fontSize: '18px' }}>🚚</span>
                            <Typography sx={{ fontSize: 13, fontWeight: 800, color: '#1e293b', letterSpacing: '0.5px' }}>
                              TRIP SELECTION
                            </Typography>
                            <Chip
                              size="small"
                              label={tripsLoading ? 'Loading…' : `${loadedTrips.length} trip${loadedTrips.length === 1 ? '' : 's'} available`}
                              sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: '#f1f5f9', border: '1px solid #cbd5e1' }}
                            />
                          </Box>
                          <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>
                            Select one or multiple trips and enter the Allocate Amount per trip
                          </Typography>
                        </Box>

                        {tripsLoading ? (
                          <Box sx={{ p: 4, textAlign: 'center', bgcolor: '#f8fafc', borderRadius: '10px', border: '1px dashed #cbd5e1' }}>
                            <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>
                              Loading matching trips from Cement Register...
                            </Typography>
                          </Box>
                        ) : loadedTrips.length === 0 ? (
                          <Box sx={{ p: 3, textAlign: 'center', bgcolor: '#f8fafc', borderRadius: '10px', border: '1px dashed #cbd5e1' }}>
                            <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>
                              No trips found matching Financial Year ({damageYear}), Month(s) ({damageSelectedMonths.join(', ')}), and Vehicle(s) ({damageSelectedVehicles.join(', ')}).
                            </Typography>
                          </Box>
                        ) : (
                          <Box>
                            {/* CONDITION 1: MULTIPLE MONTHS + ONE VEHICLE (Side-by-side Month Columns) */}
                            {condition === 'MULTIPLE MONTHS + ONE VEHICLE' && (
                              <Box sx={{
                                display: 'grid',
                                gridTemplateColumns: damageSelectedMonths.length === 2 ? '1fr 1fr' : 'repeat(auto-fit, minmax(320px, 1fr))',
                                gap: 2.5
                              }}>
                                {damageSelectedMonths.map(m => {
                                  const mTrips = getTripsForMonth(m);
                                  return (
                                    <Box
                                      key={m}
                                      sx={{
                                        border: '1.5px solid #cbd5e1',
                                        borderRadius: '12px',
                                        bgcolor: '#f8fafc',
                                        overflow: 'hidden',
                                        display: 'flex',
                                        flexDirection: 'column'
                                      }}
                                    >
                                      <Box sx={{
                                        p: 1.5, bgcolor: '#f1f5f9', borderBottom: '1.5px solid #e2e8f0',
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                                      }}>
                                        <Typography sx={{ fontSize: 12, fontWeight: 800, color: '#1e293b', letterSpacing: '0.5px' }}>
                                          {m.toUpperCase()} — ALL MATCHING TRIPS
                                        </Typography>
                                        <Chip
                                          size="small"
                                          label={`${mTrips.length} trip${mTrips.length === 1 ? '' : 's'}`}
                                          sx={{ height: 20, fontSize: 10, fontWeight: 700, bgcolor: '#ffffff', border: '1px solid #cbd5e1' }}
                                        />
                                      </Box>
                                      <Box sx={{ p: 1.5, maxHeight: 420, overflowY: 'auto' }}>
                                        {mTrips.length === 0 ? (
                                          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3, fontSize: 12 }}>
                                            No matching trips found for {m}.
                                          </Typography>
                                        ) : (
                                          mTrips.map(trip => renderTripCard(trip))
                                        )}
                                      </Box>
                                    </Box>
                                  );
                                })}
                              </Box>
                            )}

                            {/* CONDITION 2: ONE MONTH + MULTIPLE VEHICLES (Organized by Vehicle) */}
                            {condition === 'ONE MONTH + MULTIPLE VEHICLES' && (
                              <Box>
                                <Typography sx={{ fontSize: 13, fontWeight: 800, color: '#4338ca', mb: 1.5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                  {damageSelectedMonths[0]} — TRIPS BY VEHICLE
                                </Typography>
                                <Box sx={{
                                  display: 'grid',
                                  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                                  gap: 2.5
                                }}>
                                  {damageSelectedVehicles.map(v => {
                                    const vTrips = getTripsForVehicle(v);
                                    return (
                                      <Box
                                        key={v}
                                        sx={{
                                          border: '1.5px solid #cbd5e1',
                                          borderRadius: '12px',
                                          bgcolor: '#f8fafc',
                                          overflow: 'hidden',
                                          display: 'flex',
                                          flexDirection: 'column'
                                        }}
                                      >
                                        <Box sx={{
                                          p: 1.5, bgcolor: '#f1f5f9', borderBottom: '1.5px solid #e2e8f0',
                                          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                                        }}>
                                          <Typography sx={{ fontSize: 12, fontWeight: 800, color: '#1e293b', letterSpacing: '0.5px' }}>
                                            VEHICLE: {v}
                                          </Typography>
                                          <Chip
                                            size="small"
                                            label={`${vTrips.length} trip${vTrips.length === 1 ? '' : 's'}`}
                                            sx={{ height: 20, fontSize: 10, fontWeight: 700, bgcolor: '#ffffff', border: '1px solid #cbd5e1' }}
                                          />
                                        </Box>
                                        <Box sx={{ p: 1.5, maxHeight: 420, overflowY: 'auto' }}>
                                          {vTrips.length === 0 ? (
                                            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3, fontSize: 12 }}>
                                              No matching trips found for vehicle {v}.
                                            </Typography>
                                          ) : (
                                            vTrips.map(trip => renderTripCard(trip))
                                          )}
                                        </Box>
                                      </Box>
                                    );
                                  })}
                                </Box>
                              </Box>
                            )}

                            {/* CONDITION 3: ONE MONTH + ONE VEHICLE */}
                            {condition === 'ONE MONTH + ONE VEHICLE' && (
                              <Box sx={{ border: '1.5px solid #cbd5e1', borderRadius: '12px', bgcolor: '#f8fafc', overflow: 'hidden' }}>
                                <Box sx={{
                                  p: 1.5, bgcolor: '#f1f5f9', borderBottom: '1.5px solid #e2e8f0',
                                  display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                                }}>
                                  <Typography sx={{ fontSize: 12, fontWeight: 800, color: '#1e293b', letterSpacing: '0.5px' }}>
                                    {damageSelectedMonths[0]?.toUpperCase()} — ALL MATCHING TRIPS ({damageSelectedVehicles[0]})
                                  </Typography>
                                  <Chip
                                    size="small"
                                    label={`${loadedTrips.length} trip${loadedTrips.length === 1 ? '' : 's'}`}
                                    sx={{ height: 20, fontSize: 10, fontWeight: 700, bgcolor: '#ffffff', border: '1px solid #cbd5e1' }}
                                  />
                                </Box>
                                <Box sx={{ p: 1.5, maxHeight: 450, overflowY: 'auto' }}>
                                  {loadedTrips.map(trip => renderTripCard(trip))}
                                </Box>
                              </Box>
                            )}
                          </Box>
                        )}

                        {/* SUMMARY BAR & CONFIRM ACTION */}
                        <Box sx={{
                          p: 2.5, borderRadius: '10px', bgcolor: '#f8fafc', border: '1.5px solid #cbd5e1',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, mt: 1
                        }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
                            <Box>
                              <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                                SELECTED TRIPS
                              </Typography>
                              <Typography sx={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>
                                {selectedTripIds.length} {selectedTripIds.length === 1 ? 'Trip' : 'Trips'}
                              </Typography>
                            </Box>
                            <Box sx={{ height: 36, width: '1px', bgcolor: '#cbd5e1' }} />
                            <Box>
                              <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                                TOTAL ALLOCATED AMOUNT
                              </Typography>
                              <Typography sx={{ fontSize: 20, fontWeight: 800, color: isOverAllocated ? '#dc2626' : '#4f46e5', fontFamily: 'monospace' }}>
                                ₹{totalTripAllocated.toLocaleString('en-IN')}
                              </Typography>
                            </Box>
                            <Box sx={{ height: 36, width: '1px', bgcolor: '#cbd5e1' }} />
                            <Box>
                              <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                                REMAINING DEBIT AFTER ALLOCATION
                              </Typography>
                              <Typography sx={{
                                fontSize: 20, fontWeight: 800,
                                color: isOverAllocated ? '#dc2626' : (newRemainingDebitAfterInput === 0 ? '#16a34a' : '#2563eb'),
                                fontFamily: 'monospace'
                              }}>
                                ₹{newRemainingDebitAfterInput.toLocaleString('en-IN')} {newRemainingDebitAfterInput === 0 && totalTripAllocated > 0 ? '(SETTLED)' : ''}
                              </Typography>
                            </Box>
                          </Box>

                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            {isB2BEligibleDebitReason(damageDebitReason) && (
                              <Button
                                variant="contained"
                                onClick={() => setB2bDialogOpen(true)}
                                startIcon={<ReceiptLongIcon sx={{ fontSize: 16 }} />}
                                sx={{
                                  bgcolor: '#0ea5e9', '&:hover': { bgcolor: '#0284c7' },
                                  px: 2, py: 1.2, fontWeight: 800, fontSize: '13px', textTransform: 'none',
                                  borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(14, 165, 233, 0.25)'
                                }}
                              >
                                B2B
                              </Button>
                            )}
                            <Button
                              variant="contained"
                              onClick={handleConfirmAllocation}
                              disabled={
                                loading ||
                                selectedTripIds.length === 0 ||
                                totalTripAllocated <= 0 ||
                                isOverAllocated ||
                                condition === 'INVALID' ||
                                !condition
                              }
                              sx={{
                                bgcolor: '#4f46e5', '&:hover': { bgcolor: '#4338ca' },
                                px: 3, py: 1.25, fontWeight: 800, fontSize: '13px', textTransform: 'none',
                                borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(79, 70, 229, 0.2)'
                              }}
                            >
                              {loading ? 'Allocating…' : 'CONFIRM ALLOCATION'}
                            </Button>
                          </Box>
                        </Box>

                        {/* OVER-ALLOCATION ERROR */}
                        {isOverAllocated && (
                          <Box sx={{ p: 1.5, bgcolor: '#fef2f2', border: '1.5px solid #fca5a5', borderRadius: '8px' }}>
                            <Typography sx={{ fontSize: 13, fontWeight: 800, color: '#dc2626' }}>
                              ⚠️ Only ₹{remainingDebitAmount.toLocaleString('en-IN')} is available for allocation.
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    )}
                  </Box>
                )}

                {/* 7. ALLOCATION HISTORY TABLE (SECTION 13) */}
                {currentAllocations.length > 0 && (
                  <Box sx={{ border: '1.5px solid #e2e8f0', borderRadius: '12px', bgcolor: '#ffffff', p: 2.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, pb: 0.75, borderBottom: '1px solid #f1f5f9' }}>
                      <Typography sx={{ fontSize: 13, fontWeight: 800, color: '#1e293b' }}>
                        ALLOCATION HISTORY ({currentAllocations.length})
                      </Typography>
                      <Typography sx={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                        All allocations linked to this Bank Book debit record
                      </Typography>
                    </Box>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0' }}>
                            <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Unique ID</th>
                            <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Record ID / Invoice No</th>
                            <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Debit Reason</th>
                            <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>FY</th>
                            <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Month(s)</th>
                            <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Vehicle(s)</th>
                            <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Condition</th>
                            <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#475569' }}>Original (₹)</th>
                            <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#475569' }}>Allocated (₹)</th>
                            <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#475569' }}>Remaining (₹)</th>
                            <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Date</th>
                            <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: '#475569' }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {currentAllocations.map((alloc, idx) => {
                            const allocUid = alloc.allocationId || (alloc._id ? String(alloc._id) : `alloc-${idx}`);
                            const recordIdDisp = alloc.bankBookRecordId
                              ? `${String(alloc.bankBookRecordId).slice(-6)} (${alloc.invoiceNumber || inv})`
                              : (alloc.invoiceNumber || inv);

                            return (
                              <tr key={allocUid} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>
                                  {allocUid.length > 12 ? `${allocUid.slice(0, 6)}...${allocUid.slice(-4)}` : allocUid}
                                </td>
                                <td style={{ padding: '8px 10px', color: '#334155', fontWeight: 600, fontSize: '11px', whiteSpace: 'nowrap' }}>
                                  {recordIdDisp}
                                </td>
                                <td style={{ padding: '8px 10px', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap' }}>
                                  <span style={{ background: '#ede9fe', color: '#5b21b6', padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>
                                    {alloc.debitReason}
                                  </span>
                                </td>
                                <td style={{ padding: '8px 10px', color: '#334155', whiteSpace: 'nowrap' }}>
                                  {alloc.financialYear || '—'}
                                </td>
                                <td style={{ padding: '8px 10px', color: '#334155', whiteSpace: 'nowrap' }}>
                                  {alloc.months?.join(', ') || '—'}
                                </td>
                                <td style={{ padding: '8px 10px', fontWeight: 600, color: '#4338ca', whiteSpace: 'nowrap' }}>
                                  {alloc.vehicles?.join(', ') || '—'}
                                </td>
                                <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                                  <span style={{ background: '#e0e7ff', color: '#3730a3', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>
                                    {alloc.condition || '—'}
                                  </span>
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#475569', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                                  ₹{Number(alloc.originalDebitAmount != null ? alloc.originalDebitAmount : baseOriginalDebit).toLocaleString('en-IN')}
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: '#d97706', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                                  ₹{Number(alloc.allocatedAmount).toLocaleString('en-IN')}
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: Number(alloc.remainingDebitAmount) === 0 ? '#16a34a' : '#2563eb', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                                  ₹{Number(alloc.remainingDebitAmount != null ? alloc.remainingDebitAmount : Math.max(0, baseOriginalDebit - Number(alloc.allocatedAmount))).toLocaleString('en-IN')}
                                </td>
                                <td style={{ padding: '8px 10px', color: '#64748b', fontSize: '11px', whiteSpace: 'nowrap' }}>
                                  {alloc.allocationDate || (alloc.createdAt && String(alloc.createdAt).slice(0, 10)) || '—'}
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteAllocation(alloc.allocationId || alloc._id)}
                                    style={{
                                      background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca',
                                      borderRadius: '4px', padding: '3px 8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer'
                                    }}
                                  >
                                    ✕ Remove
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Box>
                )}
              </DialogContent>

              <DialogActions sx={{ p: 2, bgcolor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                <Button onClick={() => setDamageModalOpen(false)} variant="outlined" sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700 }}>
                  Close
                </Button>
              </DialogActions>
            </React.Fragment>
          );
        })()}
      </Dialog>

      {/* ── B2B Entry Dialog (Accessible from Debit Reason Allocation) ── */}
      <B2BEntryDialog
        open={b2bDialogOpen}
        onClose={() => setB2bDialogOpen(false)}
        invoiceNumber={damageTarget?.invoiceNumber}
        debitReason={damageDebitReason}
        row={rows.find(x => x.invoiceNumber === damageTarget?.invoiceNumber)}
        allocationId={damageTarget?.allocationId}
        onSaved={(res) => {
          setSnack({
            severity: 'success',
            msg: `B2B record ${res.isNew ? 'created' : 'updated'} successfully in GST Portal database!`
          });
          if (res.entryId && damageTarget?.invoiceNumber) {
            setRows(prev => prev.map(r =>
              r.invoiceNumber === damageTarget.invoiceNumber
                ? { ...r, b2bEntryId: res.entryId }
                : r
            ));
          }
        }}
      />

      {/* ── Payment Status Dashboard Modal ── */}
      <Dialog
        open={dashboardOpen}
        onClose={() => setDashboardOpen(false)}
        maxWidth="xl"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '24px',
            bgcolor: 'background.paper',
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

            <IconButton onClick={() => setDashboardOpen(false)} sx={{ bgcolor: 'background.default', '&:hover': { bgcolor: '#e2e8f0' } }}>
              ✕
            </IconButton>
          </Box>
        </DialogTitle>

        <DialogContent sx={{ p: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Summary Cards */}
          <Box display="grid" gridTemplateColumns="repeat(auto-fit, minmax(220px, 1fr))" gap={3}>
            {/* Card 1: Total Bills */}
            <Box sx={{
              p: 3, borderRadius: '16px', bgcolor: 'background.default', border: '1px solid #f1f5f9',
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
                        <td style={{ padding: '14px 16px', fontSize: '12px', color: '#334155', maxWidth: '200px', whiteSpace: 'normal' }} title={b.invoiceNo}>{b.invoiceNo}</td>
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

      {/* ── Bill Register Excel & PDF Upload Modal ────────────────────────────────────── */}
      <Dialog open={excelModalOpen} onClose={() => { if (!uploadingExcel && !parsingPdf) setExcelModalOpen(false); }} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, fontSize: '1.2rem', color: '#0f172a', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box display="flex" alignItems="center" gap={1}>
            <TableChartIcon sx={{ color: uploadSiteTarget === 'NVL' ? '#10b981' : '#0284c7' }} />
            Upload Bill Register (Excel / PDF)
          </Box>
          <Box display="flex" gap={1} alignItems="center">
            {uploadFileType === 'PDF' && (
              <Chip label="PDF EXTRACTION MODE" color="secondary" size="small" sx={{ fontWeight: 800, fontSize: '10px' }} />
            )}
            <Chip
              label={`TARGET SITE: ${uploadSiteTarget}`}
              sx={{
                fontWeight: 800,
                fontSize: '11px',
                bgcolor: uploadSiteTarget === 'NVL' ? '#dcfce7' : '#e0f2fe',
                color: uploadSiteTarget === 'NVL' ? '#15803d' : '#0369a1',
                border: `1px solid ${uploadSiteTarget === 'NVL' ? '#86efac' : '#7dd3fc'}`
              }}
            />
          </Box>
        </DialogTitle>
        <DialogContent sx={{ py: 3 }}>
          <Box display="flex" flexDirection="column" gap={2.5}>
            {/* ── Separate NVL & NVCL Upload Options ──────────────── */}
            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#1e293b' }}>
              SELECT SITE & FILE TYPE TO UPLOAD:
            </Typography>

            <Box display="flex" flexDirection="column" gap={2}>
              {/* NVL Group */}
              <Box p={1.5} sx={{ border: '1px solid #a7f3d0', borderRadius: '12px', bgcolor: '#f0fdf4' }}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: '#047857', display: 'block', mb: 1 }}>
                  SITE NVL OPTIONS:
                </Typography>
                <Box display="flex" gap={1.5}>
                  <Button
                    variant={uploadSiteTarget === 'NVL' && uploadFileType === 'EXCEL' ? 'contained' : 'outlined'}
                    component="label"
                    startIcon={<TableChartIcon />}
                    sx={{
                      flex: 1, py: 1.2, fontWeight: 800, fontSize: '0.85rem', borderRadius: '8px',
                      bgcolor: uploadSiteTarget === 'NVL' && uploadFileType === 'EXCEL' ? '#10b981' : '#fff',
                      color: uploadSiteTarget === 'NVL' && uploadFileType === 'EXCEL' ? '#fff' : '#047857',
                      borderColor: '#10b981',
                      '&:hover': { bgcolor: uploadSiteTarget === 'NVL' && uploadFileType === 'EXCEL' ? '#059669' : '#dcfce7' }
                    }}
                  >
                    NVL EXCEL UPLOAD
                    <input type="file" accept=".xlsx, .xls, .csv" hidden onChange={(e) => { setUploadFileType('EXCEL'); handleExcelFileChange(e, 'NVL'); }} />
                  </Button>

                  <Button
                    variant={uploadSiteTarget === 'NVL' && uploadFileType === 'PDF' ? 'contained' : 'outlined'}
                    component="label"
                    startIcon={parsingPdf && uploadSiteTarget === 'NVL' ? <CircularProgress size={16} color="inherit" /> : <PictureAsPdfIcon />}
                    disabled={parsingPdf}
                    sx={{
                      flex: 1, py: 1.2, fontWeight: 800, fontSize: '0.85rem', borderRadius: '8px',
                      bgcolor: uploadSiteTarget === 'NVL' && uploadFileType === 'PDF' ? '#059669' : '#fff',
                      color: uploadSiteTarget === 'NVL' && uploadFileType === 'PDF' ? '#fff' : '#047857',
                      borderColor: '#059669',
                      '&:hover': { bgcolor: uploadSiteTarget === 'NVL' && uploadFileType === 'PDF' ? '#047857' : '#dcfce7' }
                    }}
                  >
                    {parsingPdf && uploadSiteTarget === 'NVL' ? 'Extracting NVL PDF...' : 'UPLOAD NVL PDF'}
                    <input type="file" accept=".pdf" hidden onChange={(e) => handlePdfFileChange(e, 'NVL')} />
                  </Button>
                </Box>
              </Box>

              {/* NVCL Group */}
              <Box p={1.5} sx={{ border: '1px solid #7dd3fc', borderRadius: '12px', bgcolor: '#f0f9ff' }}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: '#0369a1', display: 'block', mb: 1 }}>
                  SITE NVCL OPTIONS:
                </Typography>
                <Box display="flex" gap={1.5}>
                  <Button
                    variant={uploadSiteTarget === 'NVCL' && uploadFileType === 'EXCEL' ? 'contained' : 'outlined'}
                    component="label"
                    startIcon={<TableChartIcon />}
                    sx={{
                      flex: 1, py: 1.2, fontWeight: 800, fontSize: '0.85rem', borderRadius: '8px',
                      bgcolor: uploadSiteTarget === 'NVCL' && uploadFileType === 'EXCEL' ? '#0284c7' : '#fff',
                      color: uploadSiteTarget === 'NVCL' && uploadFileType === 'EXCEL' ? '#fff' : '#0369a1',
                      borderColor: '#0284c7',
                      '&:hover': { bgcolor: uploadSiteTarget === 'NVCL' && uploadFileType === 'EXCEL' ? '#0369a1' : '#e0f2fe' }
                    }}
                  >
                    NVCL EXCEL UPLOAD
                    <input type="file" accept=".xlsx, .xls, .csv" hidden onChange={(e) => { setUploadFileType('EXCEL'); handleExcelFileChange(e, 'NVCL'); }} />
                  </Button>

                  <Button
                    variant={uploadSiteTarget === 'NVCL' && uploadFileType === 'PDF' ? 'contained' : 'outlined'}
                    component="label"
                    startIcon={parsingPdf && uploadSiteTarget === 'NVCL' ? <CircularProgress size={16} color="inherit" /> : <PictureAsPdfIcon />}
                    disabled={parsingPdf}
                    sx={{
                      flex: 1, py: 1.2, fontWeight: 800, fontSize: '0.85rem', borderRadius: '8px',
                      bgcolor: uploadSiteTarget === 'NVCL' && uploadFileType === 'PDF' ? '#0369a1' : '#fff',
                      color: uploadSiteTarget === 'NVCL' && uploadFileType === 'PDF' ? '#fff' : '#0369a1',
                      borderColor: '#0369a1',
                      '&:hover': { bgcolor: uploadSiteTarget === 'NVCL' && uploadFileType === 'PDF' ? '#0284c7' : '#e0f2fe' }
                    }}
                  >
                    {parsingPdf && uploadSiteTarget === 'NVCL' ? 'Extracting NVCL PDF...' : 'UPLOAD NVCL PDF'}
                    <input type="file" accept=".pdf" hidden onChange={(e) => handlePdfFileChange(e, 'NVCL')} />
                  </Button>
                </Box>
              </Box>
            </Box>

            <Typography variant="body2" sx={{ color: '#475569', fontWeight: 500, fontStyle: 'italic' }}>
              {uploadSiteTarget === 'NVL'
                ? 'Uploading file for site NVL. All imported rows will be assigned Site = NVL automatically.'
                : 'Uploading file for site NVCL. All imported rows will be assigned Site = NVCL automatically.'}
            </Typography>

            {parsingPdf && (
              <Box display="flex" alignItems="center" gap={2} p={2} bgcolor="#f8fafc" borderRadius="8px" border="1px solid #e2e8f0">
                <CircularProgress size={24} />
                <Typography variant="body2" fontWeight={700} color="#1e293b">
                  Extracting tabular rows from multi-page PDF... Please wait.
                </Typography>
              </Box>
            )}

            {excelSummary && (
              <Box sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1, color: '#1e293b' }}>
                  📊 Import Validation &amp; Summary ({excelSummary.targetSite}) {excelSummary.isPdf ? `[PDF Mode - ${excelSummary.totalPages || 1} Page(s)]` : '[Excel Mode]'}
                </Typography>
                <Box display="flex" gap={1.5} flexWrap="wrap" mb={excelSummary.failed > 0 ? 1.5 : 0}>
                  <Chip label={`Total Rows: ${excelSummary.total}`} sx={{ fontWeight: 700, bgcolor: '#e2e8f0', color: '#334155' }} />
                  <Chip label={`Ready to Import: ${excelSummary.valid}`} color="success" sx={{ fontWeight: 700 }} />
                  <Chip label={`Already Existing: ${excelSummary.existing}`} color="warning" sx={{ fontWeight: 700 }} />
                  {excelSummary.failed > 0 && <Chip label={`Review Needed: ${excelSummary.failed}`} color="error" sx={{ fontWeight: 700 }} />}
                </Box>

                {excelSummary.failed > 0 && excelSummary.errors && (
                  <Alert severity="warning" sx={{ mt: 1, fontSize: '12px', fontWeight: 600 }}>
                    <strong>Validation Alerts ({excelSummary.failed} rows need review):</strong>
                    <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                      {excelSummary.errors.slice(0, 5).map((err, idx) => (
                        <li key={idx}>Row {err.row}: {err.error}</li>
                      ))}
                      {excelSummary.errors.length > 5 && <li>...and {excelSummary.errors.length - 5} more</li>}
                    </ul>
                  </Alert>
                )}
              </Box>
            )}

            {excelParsedRows.length > 0 && (
              <Box>
                <Typography variant="caption" sx={{ fontWeight: 700, color: '#64748b', mb: 1, display: 'block' }}>
                  PREVIEW OF MAPPED RECORDS ({excelParsedRows.length} Rows - Site: <strong>{uploadSiteTarget}</strong>):
                </Typography>
                <Box sx={{ maxHeight: 260, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                  <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                        <th style={{ padding: '6px' }}>SL NO</th>
                        <th style={{ padding: '6px' }}>Bill / Invoice No</th>
                        <th style={{ padding: '6px' }}>Invoice Date</th>
                        <th style={{ padding: '6px' }}>Shipment No</th>
                        <th style={{ padding: '6px' }}>Month</th>
                        <th style={{ padding: '6px' }}>Site</th>
                        <th style={{ padding: '6px' }}>Bill Type</th>
                        <th style={{ padding: '6px' }}>Amount (₹)</th>
                        <th style={{ padding: '6px' }}>CGST</th>
                        <th style={{ padding: '6px' }}>SGST</th>
                        <th style={{ padding: '6px' }}>Total Amount</th>
                        <th style={{ padding: '6px' }}>TDS</th>
                        <th style={{ padding: '6px' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {excelParsedRows.map((r, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: r.needsReview ? '#fef2f2' : r.isExisting ? '#fffbeb' : '#fff' }}>
                          <td style={{ padding: '6px' }}>{r.slNo}</td>
                          <td style={{ padding: '6px', fontWeight: 700 }}>{r.invoiceNumber || <span style={{ color: '#ef4444' }}>[Missing]</span>}</td>
                          <td style={{ padding: '6px' }}>{r.invoiceDate}</td>
                          <td style={{ padding: '6px' }}>{r.shipmentNo || '-'}</td>
                          <td style={{ padding: '6px' }}>{r.month || '-'}</td>
                          <td style={{ padding: '6px', fontWeight: 800, color: r.site === 'NVL' ? '#047857' : '#0369a1' }}>{r.site}</td>
                          <td style={{ padding: '6px' }}>{r.billType}</td>
                          <td style={{ padding: '6px', fontWeight: 700 }}>₹{r.amount?.toLocaleString('en-IN')}</td>
                          <td style={{ padding: '6px' }}>₹{r.cgst?.toLocaleString('en-IN')}</td>
                          <td style={{ padding: '6px' }}>₹{r.sgst?.toLocaleString('en-IN')}</td>
                          <td style={{ padding: '6px', fontWeight: 700 }}>₹{r.totalAmount?.toLocaleString('en-IN')}</td>
                          <td style={{ padding: '6px' }}>₹{r.tds?.toLocaleString('en-IN')}</td>
                          <td style={{ padding: '6px' }}>
                            {r.needsReview ? (
                              <Chip size="small" label="Review Needed" color="error" sx={{ height: 18, fontSize: '9px', fontWeight: 800 }} />
                            ) : r.isExisting ? (
                              <Chip size="small" label="Exists" color="warning" sx={{ height: 18, fontSize: '9px', fontWeight: 800 }} />
                            ) : (
                              <Chip size="small" label="Ready" color="success" sx={{ height: 18, fontSize: '9px', fontWeight: 800 }} />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Box>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between' }}>
          <Button
            variant="outlined"
            color="error"
            onClick={handleClearBillRegister}
            disabled={uploadingExcel || parsingPdf}
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '8px' }}
          >
            Clear Current Data
          </Button>

          <Box display="flex" gap={1}>
            <Button onClick={() => setExcelModalOpen(false)} disabled={uploadingExcel || parsingPdf} sx={{ textTransform: 'none', color: '#64748b', fontWeight: 700 }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleConfirmExcelImport}
              disabled={!excelParsedRows.length || uploadingExcel || parsingPdf}
              startIcon={uploadingExcel ? <CircularProgress size={16} color="inherit" /> : <TableChartIcon />}
              sx={{
                bgcolor: uploadSiteTarget === 'NVL' ? '#10b981' : '#0284c7',
                '&:hover': { bgcolor: uploadSiteTarget === 'NVL' ? '#059669' : '#0369a1' },
                fontWeight: 700,
                textTransform: 'none',
                borderRadius: '8px'
              }}
            >
              {uploadingExcel ? 'Importing...' : `Import ${excelParsedRows.length} Rows into Bill Register (${uploadSiteTarget})`}
            </Button>
          </Box>
        </DialogActions>
      </Dialog>


      {/* ── Clear All Data Confirmation Dialog ────────────────────────────── */}
      <Dialog open={clearConfirmOpen} onClose={() => { if (!clearingData) setClearConfirmOpen(false); }} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningAmberIcon color="error" />
          Clear All Bill Register Data?
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: '#1e293b', fontWeight: 600, mb: 1.5 }}>
            <strong>WARNING:</strong> This will permanently delete ALL Bill Register data currently stored in the system (Current Records: <strong>{rows.length}</strong>). This action cannot be undone. Are you sure you want to continue?
          </Typography>
          <Typography variant="caption" sx={{ color: '#64748b', fontStyle: 'italic', display: 'block' }}>
            Note: Cement Register, GST Portal, Main Cashbook, and other modules will NOT be affected.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid #f1f5f9' }}>
          <Button onClick={() => setClearConfirmOpen(false)} disabled={clearingData} sx={{ textTransform: 'none', color: '#64748b', fontWeight: 700 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleClearAllBillRegister}
            disabled={clearingData}
            startIcon={clearingData ? <CircularProgress size={16} color="inherit" /> : <DeleteForeverIcon />}
            sx={{ fontWeight: 700, textTransform: 'none', borderRadius: '8px', bgcolor: '#dc2626', '&:hover': { bgcolor: '#b91c1c' } }}
          >
            {clearingData ? 'Clearing...' : 'Yes, Delete All Bill Register Data'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack(null)}>
        {snack && <Alert severity={snack.severity}>{snack.msg}</Alert>}
      </Snackbar>
    </Box>
  );
}
