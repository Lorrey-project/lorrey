import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Button, IconButton, Grid, Card, CardContent, CircularProgress,
  Tabs, Tab, Select, MenuItem, FormControl, TableContainer, Table, TableHead,
  TableRow, TableCell, TableBody, TableFooter, Paper, Collapse,
  Snackbar, Alert, TextField, Tooltip, Popover, Chip, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions,
  InputAdornment, List, ListItem, ListItemText, ListItemIcon,
  Accordion, AccordionSummary, AccordionDetails
} from '@mui/material';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area, ComposedChart, Line } from 'recharts';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import AssessmentIcon from '@mui/icons-material/Assessment';
import DescriptionIcon from '@mui/icons-material/Description';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PublishIcon from '@mui/icons-material/Publish';
import VisibilityIcon from '@mui/icons-material/Visibility';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PersonIcon from '@mui/icons-material/Person';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import AssignmentLateIcon from '@mui/icons-material/AssignmentLate';
import CloseIcon from '@mui/icons-material/Close';
import ClearIcon from '@mui/icons-material/Clear';

import axios from 'axios';
import { io } from 'socket.io-client';
import * as XLSX from 'xlsx';
import PartyReportView from './PartyReportView';
import VehicleWiseTripSummaryTab from '../components/VehicleWiseTripSummaryTab';
import DailyRevenueNvlNvclTab from '../components/DailyRevenueNvlNvclTab';
import RevenewTab from '../components/RevenewTab';

const API_URL = import.meta.env.VITE_API_URL;
const SOCKET_URL = import.meta.env.VITE_SOCKET_IO_URL || import.meta.env.VITE_API_URL;
const socket = io(SOCKET_URL, { autoConnect: true, transports: ["websocket", "polling"] });

const parseNum = (val) => parseFloat(String(val || 0).replace(/,/g, '')) || 0;

const parseDateToStartOfDay = (dStr) => {
  if (!dStr) return null;
  const s = String(dStr).trim();
  if (!s || s === '-' || s === 'undefined' || s === 'null') return null;

  // YYYY-MM-DD format
  if (/^\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}$/.test(s)) {
    const parts = s.split(/[\/\-\.]/);
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    return new Date(year, month, day).getTime();
  }

  // DD-MM-YYYY or D-M-YYYY or DD/MM/YYYY
  const parts = s.split(/[\/\-\.]/);
  if (parts.length === 3) {
    let day = parseInt(parts[0], 10);
    let month = parseInt(parts[1], 10) - 1;
    let year = parseInt(parts[2], 10);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    if (year < 100) year += 2000;
    return new Date(year, month, day).getTime();
  }
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

const parseDateTimeToMs = (dStr, defaultToEndOfDay = false) => {
  if (!dStr) return null;
  const s = String(dStr).trim();
  if (!s || s === '-' || s === 'undefined' || s === 'null') return null;

  const timeMatch = s.match(/(?:,\s*|\s+)(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?/);
  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  if (timeMatch) {
    hours = parseInt(timeMatch[1], 10);
    minutes = parseInt(timeMatch[2], 10);
    if (timeMatch[3]) seconds = parseInt(timeMatch[3], 10);
    const ampm = timeMatch[4] ? timeMatch[4].toUpperCase() : null;

    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
  } else if (defaultToEndOfDay) {
    hours = 23;
    minutes = 59;
    seconds = 59;
  }

  const dateOnlyStr = s.replace(/(?:,\s*|\s+)\d{1,2}:\d{2}.*$/, '').trim();

  if (/^\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}$/.test(dateOnlyStr)) {
    const parts = dateOnlyStr.split(/[\/\-\.]/);
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    return new Date(year, month, day, hours, minutes, seconds).getTime();
  }

  const parts = dateOnlyStr.split(/[\/\-\.]/);
  if (parts.length === 3) {
    let day = parseInt(parts[0], 10);
    let month = parseInt(parts[1], 10) - 1;
    let year = parseInt(parts[2], 10);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    if (year < 100) year += 2000;
    return new Date(year, month, day, hours, minutes, seconds).getTime();
  }

  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.getTime();
};

const formatDateToDDMMYYYY = (isoDateStr) => {
  if (!isoDateStr) return '';
  const s = String(isoDateStr).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-');
    return `${d}-${m}-${y}`;
  }
  return s;
};

const formatDateToYYYYMMDD = (dStr) => {
  if (!dStr) return '';
  const ms = parseDateToStartOfDay(dStr);
  if (!ms) return '';
  const dObj = new Date(ms);
  const y = dObj.getFullYear();
  const m = String(dObj.getMonth() + 1).padStart(2, '0');
  const d = String(dObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getEWayBillStatus = (row) => {
  const ewayNo = String(row["E-WAY BILL NO"] || row["E-WAY BILL NUMBER"] || row["E-WAY BILL NO."] || row["E-WAY BILL"] || "").trim();
  const originalValidityRaw = String(row["E-WAY BILL VALIDITY"] || row["E-WAY BILL VALIDITY DATE"] || "").trim();
  const extendedValidityRaw = String(row["EXTENDED E-WAY BILL VALIDITY"] || row["extendedValidityDate"] || "").trim();
  const effectiveValidityRaw = (extendedValidityRaw && extendedValidityRaw !== "-") ? extendedValidityRaw : originalValidityRaw;
  const isExtended = Boolean(extendedValidityRaw && extendedValidityRaw !== "-" && extendedValidityRaw !== originalValidityRaw);

  const unloadingRaw = String(
    row["UNLOADING STATUS"] ||
    row["RECEIVING DATE"] ||
    row["UNLOADING DATE"] ||
    row["RECEIVING DT"] ||
    row["UNLOADING DT"] ||
    row["unloadingStatus"] ||
    row["receivingDate"] ||
    row["unloadingDate"] ||
    row["UNLOADING_STATUS"] ||
    row["RECEIVING_DATE"] ||
    row["UNLOADING_DATE"] ||
    ""
  ).trim();

  const hasUnloadingDate = Boolean(
    unloadingRaw &&
    unloadingRaw !== "-" &&
    unloadingRaw.toLowerCase() !== "null" &&
    unloadingRaw.toLowerCase() !== "undefined"
  );

  // E-WAY BILL COMPLETED = Unloading Status / Unloading Date exists in Cement Register.
  // Immediately consider vehicle as COMPLETED (DONE) and remove from E-Way Bill extension pending list.
  if (hasUnloadingDate) {
    return {
      status: "DONE",
      label: isExtended ? "✓ DONE (EXTENDED)" : "✓ DONE",
      code: "DONE",
      subtitle: `Unloaded (${unloadingRaw})`,
      color: "#047857",
      bgColor: "#ecfdf5",
      borderColor: "#6ee7b7",
      isUrgent: false,
      isBlinking: false,
      isExtended,
      effectiveValidity: effectiveValidityRaw || "-",
      originalValidity: originalValidityRaw || "-"
    };
  }

  if (!ewayNo || ewayNo === "-" || !effectiveValidityRaw || effectiveValidityRaw === "-") {
    return {
      status: "DATA NOT AVAILABLE",
      label: "DATA NOT AVAILABLE",
      code: "NO_DATA",
      color: "#64748b",
      bgColor: "#f1f5f9",
      borderColor: "#cbd5e1",
      isUrgent: false,
      isBlinking: false,
      isExtended: false,
      effectiveValidity: effectiveValidityRaw || "-",
      originalValidity: originalValidityRaw || "-"
    };
  }

  const validityMs = parseDateTimeToMs(effectiveValidityRaw, true);
  const validityStartMs = parseDateToStartOfDay(effectiveValidityRaw);
  if (!validityMs || !validityStartMs) {
    return {
      status: "DATA NOT AVAILABLE",
      label: "DATA NOT AVAILABLE",
      code: "NO_DATA",
      color: "#64748b",
      bgColor: "#f1f5f9",
      borderColor: "#cbd5e1",
      isUrgent: false,
      isBlinking: false,
      isExtended: false,
      effectiveValidity: effectiveValidityRaw || "-",
      originalValidity: originalValidityRaw || "-"
    };
  }

  const now = new Date();
  const nowMs = now.getTime();
  const todayStartMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  // Case: Current timestamp has passed the validity timestamp -> EXPIRED
  if (nowMs > validityMs) {
    return {
      status: "EXPIRED",
      label: isExtended ? "🔴 EXPIRED (EXTENDED)" : "🔴 EXPIRED",
      code: "EXPIRED",
      action: "E-Way Bill validity expired - Extension required",
      color: "#b91c1c",
      bgColor: "#fff1f2",
      borderColor: "#fda4af",
      isUrgent: true,
      isBlinking: false,
      isExtended,
      effectiveValidity: effectiveValidityRaw,
      originalValidity: originalValidityRaw
    };
  }

  // Case: Validity date is today (and current time <= validity time) -> EXPIRING TODAY
  if (validityStartMs === todayStartMs) {
    return {
      status: "EXPIRING TODAY",
      label: isExtended ? "⚠ EXPIRING TODAY (EXTENDED)" : "⚠ EXPIRING TODAY",
      code: "EXPIRING_TODAY",
      action: "Extend E-Way Bill Validity",
      color: "#b91c1c",
      bgColor: "#fef2f2",
      borderColor: "#fca5a5",
      isUrgent: true,
      isBlinking: true,
      isExtended,
      effectiveValidity: effectiveValidityRaw,
      originalValidity: originalValidityRaw
    };
  }

  // Case: Validity date is in the past -> EXPIRED
  if (validityStartMs < todayStartMs) {
    return {
      status: "EXPIRED",
      label: isExtended ? "🔴 EXPIRED (EXTENDED)" : "🔴 EXPIRED",
      code: "EXPIRED",
      action: "E-Way Bill validity expired - Extension required",
      color: "#b91c1c",
      bgColor: "#fff1f2",
      borderColor: "#fda4af",
      isUrgent: true,
      isBlinking: false,
      isExtended,
      effectiveValidity: effectiveValidityRaw,
      originalValidity: originalValidityRaw
    };
  }

  // Case: Active (Validity date in future, Unloading Status/Date is EMPTY)
  return {
    status: "ACTIVE",
    label: isExtended ? "● ACTIVE (EXTENDED)" : "● ACTIVE",
    code: "ACTIVE",
    subtitle: `Valid until ${effectiveValidityRaw}`,
    color: isExtended ? "#4338ca" : "#0369a1",
    bgColor: isExtended ? "#e0e7ff" : "#f0f9ff",
    borderColor: isExtended ? "#a5b4fc" : "#7dd3fc",
    isUrgent: false,
    isBlinking: false,
    isExtended,
    effectiveValidity: effectiveValidityRaw,
    originalValidity: originalValidityRaw
  };
};

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
  return { fy: currentFY, month: monthNamesArray[currentMonthIndex], dateStr: currentDate.toISOString().split('T')[0] };
};

const fyOptions = ['FY 2024-25', 'FY 2025-26', 'FY 2026-27'];
const monthOptions = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];

const getDatesForFYAndMonth = (fy, monthName) => {
  if (!fy || !monthName) return [];
  const startYearStr = fy.substring(3, 7);
  let year = parseInt(startYearStr, 10);

  const mIdx = monthOptions.indexOf(monthName);
  if (mIdx >= 9) {
    year += 1;
  }

  const jsMonthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const jsMonthIdx = jsMonthNames.indexOf(monthName);

  const daysInMonth = new Date(year, jsMonthIdx + 1, 0).getDate();
  const dates = [];
  for (let i = 1; i <= daysInMonth; i++) {
    const dStr = String(i).padStart(2, '0');
    const mStr = String(jsMonthIdx + 1).padStart(2, '0');
    const yStr = year;
    dates.push({
      display: `${dStr}-${monthName.substring(0, 3)}-${yStr}`,
      value: `${yStr}-${mStr}-${dStr}`
    });
  }
  return dates;
};

function DailySummaryTab({
  onBack,
  onUploadNew,
  onOpenCementRegister,
  onOpenPartyPayment,
  onOpenPumpPaymentRegister,
  mainTab,
  setMainTab,
  initialOpenVehicleSummary = false,
  financialYear: propFY,
  setFinancialYear: propSetFY,
  month: propMonth,
  setMonth: propSetMonth
}) {
  const initialSelection = useMemo(() => getCurrentFYAndMonth(), []);
  const [internalFY, setInternalFY] = useState(initialSelection.fy);
  const [internalMonth, setInternalMonth] = useState(initialSelection.month);

  const financialYear = propFY || internalFY;
  const setFinancialYear = propSetFY || setInternalFY;
  const month = propMonth || internalMonth;
  const setMonth = propSetMonth || setInternalMonth;

  const dateOptions = useMemo(() => getDatesForFYAndMonth(financialYear, month), [financialYear, month]);

  const [date, setDate] = useState('ALL');

  useEffect(() => {
    setDate('ALL');
  }, [financialYear, month]);

  const [calendarAnchorEl, setCalendarAnchorEl] = useState(null);
  const handleOpenCalendar = (event) => setCalendarAnchorEl(event.currentTarget);
  const handleCloseCalendar = () => setCalendarAnchorEl(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [billBreakdownOpen, setBillBreakdownOpen] = useState(false);
  const [billTabValue, setBillTabValue] = useState(0);
  const [tabValue, setTabValue] = useState(0);
  const [snack, setSnack] = useState(null);

  // ── Vehicle Wise Trip Summary States ────────────────────────────────────────
  const [vehSearchTerm, setVehSearchTerm] = useState('');
  const [vehicleSummaryModalOpen, setVehicleSummaryModalOpen] = useState(initialOpenVehicleSummary);
  const [selectedVehicleDetail, setSelectedVehicleDetail] = useState(null);
  const [modalSearchTerm, setModalSearchTerm] = useState('');
  const [modalTripFilter, setModalTripFilter] = useState('ALL');
  const [expandedVehicles, setExpandedVehicles] = useState(new Set());

  const toggleExpandVehicle = (vehNo) => {
    setExpandedVehicles(prev => {
      const next = new Set(prev);
      if (next.has(vehNo)) next.delete(vehNo);
      else next.add(vehNo);
      return next;
    });
  };

  const [alertModalOpen, setAlertModalOpen] = useState(false);
  const [alertModalTitle, setAlertModalTitle] = useState('');
  const [alertModalData, setAlertModalData] = useState([]);
  const [stampNonBilledTab, setStampNonBilledTab] = useState(0); // 0: ALL, 1: ONLY FREIGHT, 2: FREIGHT BILLED / UNLOADING PENDING

  // ── Live Validity End Alerts State ──────────────────────────────────────────
  const [validityAlerts, setValidityAlerts] = useState({
    count: 0,
    expiredCount: 0,
    expiringSoonCount: 0,
    alerts: []
  });
  const [loadingValidityAlerts, setLoadingValidityAlerts] = useState(false);

  const [extendValidityItem, setExtendValidityItem] = useState(null);
  const [extendValidityDate, setExtendValidityDate] = useState('');
  const [savingValidityExt, setSavingValidityExt] = useState(false);

  const [extensionDialogOpen, setExtensionDialogOpen] = useState(false);
  const [extensionRecords, setExtensionRecords] = useState([]);
  const [extensionDraft, setExtensionDraft] = useState({});
  const [extensionErrors, setExtensionErrors] = useState({});
  const [savingExtensions, setSavingExtensions] = useState(false);
  const [unloadingStatusOpen, setUnloadingStatusOpen] = useState(false);
  const [unloadingActiveTab, setUnloadingActiveTab] = useState(0); // 0: YESTERDAY UNLOADED, 1: TODAY UNLOADING
  const [unloadingSearchTerm, setUnloadingSearchTerm] = useState('');
  const [eWayAlertsSearchTerm, setEWayAlertsSearchTerm] = useState('');

  // ── Live YTD Alerts Data from Cement Register (01 April to Today) ───────────
  const [ytdAlertsData, setYtdAlertsData] = useState({
    pending: { count: 0, records: [] },
    stamp: { count: 0, records: [] },
    nonStamp: { count: 0, records: [] },
    stampNonBilled: { count: 0, all: [], freight: [], unloading: [] }
  });
  const [loadingYtdAlerts, setLoadingYtdAlerts] = useState(false);

  const fetchAlertsYtd = useCallback(async () => {
    setLoadingYtdAlerts(true);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.get(`${API_URL}/daily-summary/alerts-ytd`, {
        params: { fy: financialYear },
        headers
      });
      if (res.data?.success) {
        setYtdAlertsData({
          pending: res.data.pending || { count: 0, records: [] },
          stamp: res.data.stamp || { count: 0, records: [] },
          nonStamp: res.data.nonStamp || { count: 0, records: [] },
          stampNonBilled: res.data.stampNonBilled || { count: 0, all: [], freight: [], unloading: [] }
        });
        setPendingChallansData({
          records: res.data.pending?.records || [],
          count: res.data.pending?.count || 0,
          totalBillingAmount: (res.data.pending?.records || []).reduce((s, r) => s + parseNum(r["Billing Amount"] ?? r["BILLING AMOUNT"] ?? r["AMOUNT"]), 0)
        });
      }
    } catch (err) {
      console.error('[DailySummaryReport] Fetch YTD alerts error:', err);
    } finally {
      setLoadingYtdAlerts(false);
    }
  }, [financialYear]);

  // ── Live Pending Challans from Shipment Register ────────────────────────────
  const [pendingChallansData, setPendingChallansData] = useState({
    records: [],
    count: 0,
    totalBillingAmount: 0
  });
  const [loadingPendingChallans, setLoadingPendingChallans] = useState(false);

  const fetchPendingChallans = useCallback(async () => {
    setLoadingPendingChallans(true);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.get(`${API_URL}/daily-summary/pending-challans`, {
        params: { fy: financialYear },
        headers
      });
      if (res.data?.success) {
        setPendingChallansData({
          records: res.data.records || [],
          count: res.data.count || 0,
          totalBillingAmount: res.data.totalBillingAmount || 0
        });
      }
    } catch (err) {
      console.error('[DailySummaryReport] Fetch pending challans error:', err);
    } finally {
      setLoadingPendingChallans(false);
    }
  }, [financialYear]);

  const fetchValidityAlerts = useCallback(async () => {
    setLoadingValidityAlerts(true);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.get(`${API_URL}/truck-contacts/validity-alerts`, { headers });
      if (res.data?.success) {
        setValidityAlerts({
          count: res.data.count || 0,
          expiredCount: res.data.expiredCount || 0,
          expiringSoonCount: res.data.expiringSoonCount || 0,
          alerts: res.data.alerts || []
        });
      }
    } catch (err) {
      console.error('[DailySummaryReport] Fetch validity alerts error:', err);
    } finally {
      setLoadingValidityAlerts(false);
    }
  }, []);

  // ── Live SIX TRIP NOT COMPLETE Alerts State (Monthly check by 25th) ─────────
  const [sixTripAlerts, setSixTripAlerts] = useState({
    count: 0,
    isApplicable: false,
    records: [],
    monthFullName: '',
    monthShort: '',
    evaluationPeriod: ''
  });
  const [loadingSixTripAlerts, setLoadingSixTripAlerts] = useState(false);

  const fetchSixTripAlerts = useCallback(async () => {
    setLoadingSixTripAlerts(true);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.get(`${API_URL}/daily-summary/six-trip-alerts`, {
        params: { fy: financialYear, month },
        headers
      });
      if (res.data?.success) {
        setSixTripAlerts({
          count: res.data.count || 0,
          isApplicable: res.data.isApplicable || false,
          records: res.data.records || [],
          monthFullName: res.data.monthFullName || '',
          monthShort: res.data.monthShort || '',
          evaluationPeriod: res.data.evaluationPeriod || ''
        });
      }
    } catch (err) {
      console.error('[DailySummaryReport] Fetch six-trip alerts error:', err);
    } finally {
      setLoadingSixTripAlerts(false);
    }
  }, [financialYear, month]);

  const handleExportSixTripExcel = () => {
    try {
      const rows = alertModalData.map((v, idx) => ({
        'SL NO': idx + 1,
        'VEHICLE NUMBER': v.vehicleNo,
        'OWNER': v.ownerName || '-',
        'MONTH': v.month || v.monthFullName || '-',
        'TRIP COUNT (DAY 1-25)': v.tripCount,
        'REQUIRED TRIPS': v.requiredTrips || 6,
        'SHORTFALL': v.shortfall,
        'TOTAL MT LOADED': v.totalMT,
        'EVALUATION PERIOD': v.evaluationPeriod
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, "Six Trip Not Complete");
      XLSX.writeFile(wb, `Six_Trip_Not_Complete_${financialYear}_${month}.xlsx`);
      setSnack({ severity: 'success', msg: 'Six Trip Not Complete Excel exported successfully.' });
    } catch (err) {
      console.error(err);
      setSnack({ severity: 'error', msg: 'Failed to export Excel report.' });
    }
  };

  // ── Live VEHICLE NOT LOADED Alerts State (>3 days after unloading) ───────────
  const [vehicleNotLoadedAlerts, setVehicleNotLoadedAlerts] = useState({
    count: 0,
    records: [],
    today: ''
  });
  const [loadingVehicleNotLoadedAlerts, setLoadingVehicleNotLoadedAlerts] = useState(false);

  const fetchVehicleNotLoadedAlerts = useCallback(async () => {
    setLoadingVehicleNotLoadedAlerts(true);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.get(`${API_URL}/daily-summary/vehicle-not-loaded-alerts`, { headers });
      if (res.data?.success) {
        setVehicleNotLoadedAlerts({
          count: res.data.count || 0,
          records: res.data.records || [],
          today: res.data.today || ''
        });
      }
    } catch (err) {
      console.error('[DailySummaryReport] Fetch vehicle not loaded alerts error:', err);
    } finally {
      setLoadingVehicleNotLoadedAlerts(false);
    }
  }, []);

  const handleExportVehicleNotLoadedExcel = () => {
    try {
      const rows = (alertModalData.length > 0 ? alertModalData : (vehicleNotLoadedAlerts.records || [])).map((r, idx) => ({
        'SL NO': r.slNo || idx + 1,
        'VEHICLE NUMBER': r.vehicleNo,
        'OWNER': r.ownerName || '—',
        'LAST UNLOADING DATE': r.lastUnloadingDate || '—',
        'WAITING PERIOD END DATE': r.waitingPeriodEndDate || '—',
        'TODAY': r.today || '—',
        'DAYS SINCE ELIGIBLE': r.daysSinceEligible,
        'LAST INVOICE / LOADING DATE': r.lastInvoiceLoadingDate || '—',
        'STATUS': r.status || 'NOT LOADED'
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, "Vehicle Not Loaded");
      XLSX.writeFile(wb, `Vehicle_Not_Loaded_Alerts_${new Date().toISOString().split('T')[0]}.xlsx`);
      setSnack({ severity: 'success', msg: 'Vehicle Not Loaded Excel exported successfully.' });
    } catch (err) {
      console.error(err);
      setSnack({ severity: 'error', msg: 'Failed to export Excel report.' });
    }
  };

  const handleSaveVehicleValidityExtension = async () => {
    if (!extendValidityItem || !extendValidityDate) return;
    setSavingValidityExt(true);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const payload = {
        [extendValidityItem.fieldKey]: extendValidityDate
      };

      const res = await axios.put(`${API_URL}/truck-contacts/${extendValidityItem.recordId}`, payload, { headers });
      if (res.data?.success) {
        setSnack({ severity: 'success', msg: `${extendValidityItem.validityType} validity updated for ${extendValidityItem.truckNo}!` });
        setExtendValidityItem(null);
        setExtendValidityDate('');
        await fetchValidityAlerts();
      } else {
        setSnack({ severity: 'error', msg: res.data?.error || 'Failed to update validity' });
      }
    } catch (err) {
      console.error('[DailySummaryReport] Update validity error:', err);
      setSnack({ severity: 'error', msg: err.message || 'Error updating validity' });
    } finally {
      setSavingValidityExt(false);
    }
  };

  const getRowUniqueKey = (row, idx) => {
    if (row._id) return String(row._id);
    if (row.id) return String(row.id);
    const invoiceNo = String(row["INVOICE NO"] || row["INVOICE NO."] || "").trim();
    const ewayNo = String(row["E-WAY BILL NO"] || row["E-WAY BILL NUMBER"] || "").trim();
    const vehNo = String(row["VEHICLE NUMBER"] || row["VEHICLE NO"] || row["VEHICLE NO."] || "").trim();
    return `${invoiceNo}_${ewayNo}_${vehNo}_${idx}`;
  };

  const handleOpenExtensionDialog = () => {
    const recordsToExtend = alertModalData.length > 0 ? alertModalData : (eWayAlerts.urgentRecords.length > 0 ? eWayAlerts.urgentRecords : (data?.cement || []));
    setExtensionRecords(recordsToExtend);

    const initialDraft = {};
    recordsToExtend.forEach((row, idx) => {
      const rowId = getRowUniqueKey(row, idx);
      const extVal = row["EXTENDED E-WAY BILL VALIDITY"] || row["extendedValidityDate"];
      if (extVal) {
        initialDraft[rowId] = formatDateToYYYYMMDD(extVal);
      } else {
        initialDraft[rowId] = '';
      }
    });
    setExtensionDraft(initialDraft);
    setExtensionErrors({});
    setExtensionDialogOpen(true);
  };

  const handleSaveExtensions = async () => {
    const payload = [];
    const errors = {};
    let hasErrors = false;

    extensionRecords.forEach((row, idx) => {
      const rowId = getRowUniqueKey(row, idx);
      const enteredVal = (extensionDraft[rowId] || '').trim();
      if (!enteredVal) return;

      const info = getEWayBillStatus(row);
      const currentMs = parseDateToStartOfDay(info.effectiveValidity);
      const newMs = parseDateToStartOfDay(enteredVal);

      if (!newMs) {
        errors[rowId] = "Invalid date format.";
        hasErrors = true;
        return;
      }

      if (currentMs && newMs < currentMs) {
        errors[rowId] = `Date cannot be earlier than ${info.effectiveValidity}`;
        hasErrors = true;
        return;
      }

      const formattedVal = formatDateToDDMMYYYY(enteredVal);
      payload.push({
        id: row._id || row.id || null,
        invoiceNo: row["INVOICE NO"] || row["INVOICE NO."],
        ewayBillNo: row["E-WAY BILL NO"] || row["E-WAY BILL NUMBER"],
        vehicleNo: row["VEHICLE NUMBER"] || row["VEHICLE NO"] || row["VEHICLE NO."],
        extendedValidityDate: formattedVal
      });
    });

    setExtensionErrors(errors);

    if (hasErrors) {
      setSnack({ severity: 'error', msg: 'Please fix the validation errors highlighted in red.' });
      return;
    }

    if (payload.length === 0) {
      setSnack({ severity: 'warning', msg: 'No new validity dates were selected.' });
      return;
    }

    setSavingExtensions(true);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      
      let res;
      try {
        res = await axios.post(`${API_URL}/daily-summary/extend-eway-validity`, {
          extensions: payload
        }, { headers });
      } catch (postErr) {
        // Fallback to cement-register bulk endpoint if needed
        res = await axios.put(`${API_URL}/cement-register/bulk-extend-eway`, {
          extensions: payload
        }, { headers });
      }

      if (res?.data?.success) {
        const count = res.data.count || res.data.modifiedCount || payload.length;
        setSnack({ severity: 'success', msg: `Successfully updated ${count} E-Way bill validity dates!` });
        setExtensionDialogOpen(false);
        fetchData(date);
      } else {
        setSnack({ severity: 'error', msg: res?.data?.error || 'Failed to update E-Way bill validities.' });
      }
    } catch (err) {
      console.error('[DailySummaryReport] Extension error:', err);
      const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message || 'Error updating E-Way bill validities.';
      setSnack({ severity: 'error', msg: errorMsg });
    } finally {
      setSavingExtensions(false);
    }
  };



  const fetchData = useCallback(async (targetDate) => {
    setLoading(true);
    fetchValidityAlerts();
    fetchPendingChallans();
    fetchAlertsYtd();
    fetchSixTripAlerts();
    fetchVehicleNotLoadedAlerts();
    try {
      const token = localStorage.getItem('token');

      const res = await axios.get(`${API_URL}/daily-summary/data`, {
        params: { date: targetDate, fy: financialYear, month: month },
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) {
        setData(res.data);
      } else {
        setSnack({ severity: 'error', msg: res.data.error || 'Failed to load daily summary' });
      }
    } catch (err) {
      console.error(err);
      setSnack({ severity: 'error', msg: 'Error fetching daily summary report data.' });
    } finally {
      setLoading(false);
    }
  }, [dateOptions, fetchValidityAlerts, fetchPendingChallans, fetchAlertsYtd, fetchSixTripAlerts, fetchVehicleNotLoadedAlerts, financialYear, month]);

  useEffect(() => {
    fetchData(date);
  }, [date, fetchData]);

  useEffect(() => {
    fetchAlertsYtd();
    fetchPendingChallans();
    fetchSixTripAlerts();
    fetchVehicleNotLoadedAlerts();
  }, [fetchAlertsYtd, fetchPendingChallans, fetchSixTripAlerts, fetchVehicleNotLoadedAlerts]);

  // Live auto-refresh when Main Cashbook or Cement Register data changes
  useEffect(() => {
    const handler = () => {
      fetchData(date);
      fetchValidityAlerts();
      fetchPendingChallans();
      fetchAlertsYtd();
      fetchSixTripAlerts();
      fetchVehicleNotLoadedAlerts();
    };
    socket.on('mainCashbookUpdates', handler);
    socket.on('cementUpdates', handler);
    return () => {
      socket.off('mainCashbookUpdates', handler);
      socket.off('cementUpdates', handler);
    };
  }, [date, fetchData, fetchValidityAlerts, fetchPendingChallans, fetchAlertsYtd, fetchSixTripAlerts, fetchVehicleNotLoadedAlerts]);

  const handleExportExcel = () => {
    if (!data) return;

    try {
      const wb = XLSX.utils.book_new();

      // 1. Summary sheet
      const summaryData = [
        { Metric: "Operations Date", Value: date },
        { Metric: "Total Cement Quantity (MT)", Value: metrics.cementMT },
        { Metric: "Total Cement Trips", Value: metrics.cementTrips },
        { Metric: "Total Cash Receipts", Value: `₹${metrics.cashReceivedAmount.toLocaleString()}` },
        { Metric: "Total Cash Payments", Value: `₹${(metrics.miscExpenses + metrics.loadingAdvanceAmt).toLocaleString()}` },
        { Metric: "Total Fuel Issued (LTR)", Value: metrics.fuelLtr },
        { Metric: "Total Fuel Slips", Value: metrics.fuelSlips }
      ];
      const wsSummary = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

      // 2. Cement Register
      const cementRows = (data.cement || []).map(e => {
        const info = getEWayBillStatus(e);
        return {
          "GCN NO": e["GCN NO"] || "",
          "BILL NO": e["BILL NO"] || "",
          "INVOICE NO": e["INVOICE NO"] || e["INVOICE NO."] || "",
          "SITE": e["SITE"] || "",
          "BILLING RATE": parseNum(e["BILLING"]),
          "QTY (MT)": parseNum(e["MT"]),
          "AMOUNT": parseNum(e["AMOUNT"]),
          "LOADING ADVANCE": parseNum(e["ADVANCE"] || e["LOADING ADVANCE"]),
          "VEHICLE NO": e["VEHICLE NUMBER"] || e["VEHICLE NO"] || e["VEHICLE NO."] || "",
          "HSD SLIP NUMBER": e["HSD SLIP NO"] || e["HSD SLIP NUMBER"] || "",
          "QTY (LTR)": parseNum(e["HSD (LTR)"] || e["QTY (LTR)"]),
          "DESTINATION": e["DESTINATION"] || "",
          "PARTY NAME": e["PARTY NAME"] || "",
          "BILLING AMOUNT": parseNum(e["Billing Amount"] || e["BILLING AMOUNT"]),
          "E-WAY BILL NO": e["E-WAY BILL NO"] || e["E-WAY BILL NUMBER"] || "",
          "E-WAY BILL VALIDITY": e["E-WAY BILL VALIDITY"] || e["E-WAY BILL VALIDITY DATE"] || "",
          "E-WAY BILL STATUS": info.status
        };
      });
      const wsCement = XLSX.utils.json_to_sheet(cementRows);
      XLSX.utils.book_append_sheet(wb, wsCement, "Cement Register");

      XLSX.writeFile(wb, `Daily_Operations_Report_${date}.xlsx`);
      setSnack({ severity: 'success', msg: 'Daily Excel operations report downloaded successfully.' });
    } catch (err) {
      console.error(err);
      setSnack({ severity: 'error', msg: 'Failed to generate Excel report file.' });
    }
  };

  const metrics = useMemo(() => {
    if (!data) return {
      invoicesUploaded: 0, cementMT: 0, cementTrips: 0, fuelLtr: 0, fuelSlips: 0, loadingAdvanceAmt: 0, advanceVehicles: [],
      cashReceivedAmount: 0, cashOpeningBalance: 0, miscExpenses: 0, closingAdvanceBalance: 0, totalBillAmt: 0,
      totalPumpPaymentAmt: 0, missingChallans: 0
    };

    // Cement
    let cMT = 0;
    let advAmt = 0;
    let tBillAmt = 0;
    let missingChallansCount = 0;
    const advVehicles = [];

    (data.cement || []).forEach(e => {
      cMT += parseNum(e["MT"]);
      // robust parsing for billing amount to catch alternate names
      tBillAmt += parseNum(e["Billing Amount"] || e["BILLING AMOUNT"] || e["AMOUNT"]);
      const adv = parseNum(e["ADVANCE"] || e["LOADING ADVANCE"]);
      if (adv > 0) {
        advAmt += adv;
        const veh = e["VEHICLE NUMBER"] || e["VEHICLE NO"] || e["VEHICLE NO."] || "Unknown";
        if (veh !== "Unknown") {
          advVehicles.push(veh);
        }
      }

      if (!e["GCN NO"] || String(e["GCN NO"]).trim() === "") {
        missingChallansCount++;
      }
    });

    // Fuel Slips (using main cement array to be 100% accurate per requirement)
    let fL = 0;
    let pPaymentAmt = 0;
    (data.cement || []).forEach(e => {
      fL += parseNum(e["HSD (LTR)"]);
      pPaymentAmt += parseNum(e["HSD AMOUNT"]);
    });

    const cb = data.cashbookEntry || {};
    const advData = data.advanceSummary || {};
    const mainCb = data.mainCashbookData || {};

    // Dynamic calculations from Main Cash Book (Source of Truth)
    const cashRecv = mainCb.cashReceivedDAC ?? advData.cashReceived ?? parseNum(cb["P_GIVEN_DAC"]);
    const cashOpen = mainCb.openingBalance ?? advData.openingBalance ?? 0;
    const miscExp = mainCb.miscExpenses ?? advData.miscExpense ?? parseNum(cb["O_EXPENSE"]);
    const closingAdv = (cashOpen + cashRecv) - advAmt - miscExp;

    return {
      cementMT: Math.round(cMT * 100) / 100,
      cementTrips: (data.cement || []).length,
      fuelLtr: Math.round(fL * 100) / 100,
      fuelSlips: (data.pumpSlips || []).length,
      loadingAdvanceAmt: advAmt,
      advanceVehicles: advVehicles,

      // Cashbook logic
      cashReceivedAmount: cashRecv,
      cashOpeningBalance: cashOpen,
      miscExpenses: miscExp,
      closingAdvanceBalance: closingAdv,
      totalBillAmt: tBillAmt,
      totalPumpPaymentAmt: pPaymentAmt,
      missingChallans: missingChallansCount
    };
  }, [data]);

  // ── VEHICLE WISE TRIP SUMMARY COMPUTATION ────────────────────────────────────
  const vehicleTripSummary = useMemo(() => {
    if (!data?.cement || !Array.isArray(data.cement)) return [];

    const map = {};
    data.cement.forEach(e => {
      const rawVeh = e["VEHICLE NUMBER"] || e["VEHICLE NO"] || e["VEHICLE NO."] || "";
      const veh = String(rawVeh).trim().toUpperCase();
      if (!veh || veh === "-" || veh === "UNKNOWN") return;

      if (!map[veh]) {
        map[veh] = {
          vehicleNo: veh,
          tripCount: 0,
          totalMT: 0,
          totalBillingAmt: 0,
          totalAdvance: 0,
          totalDieselLtr: 0,
          totalDieselAmt: 0,
          parties: new Set(),
          destinations: new Set(),
          trips: []
        };
      }

      const mt = parseNum(e["MT"]);
      const billAmt = parseNum(e["Billing Amount"] || e["BILLING AMOUNT"] || e["AMOUNT"]);
      const adv = parseNum(e["ADVANCE"] || e["LOADING ADVANCE"]);
      const hsdLtr = parseNum(e["HSD (LTR)"] || e["QTY (LTR)"]);
      const hsdAmt = parseNum(e["HSD AMOUNT"]);
      const party = (e["PARTY NAME"] || e["OWNER NAME"] || "").trim();
      const dest = (e["DESTINATION"] || "").trim();

      map[veh].tripCount += 1;
      map[veh].totalMT += mt;
      map[veh].totalBillingAmt += billAmt;
      map[veh].totalAdvance += adv;
      map[veh].totalDieselLtr += hsdLtr;
      map[veh].totalDieselAmt += hsdAmt;
      if (party) map[veh].parties.add(party);
      if (dest) map[veh].destinations.add(dest);
      map[veh].trips.push(e);
    });

    return Object.values(map)
      .map(v => ({
        ...v,
        totalMT: Math.round(v.totalMT * 100) / 100,
        totalBillingAmt: Math.round(v.totalBillingAmt * 100) / 100,
        totalAdvance: Math.round(v.totalAdvance * 100) / 100,
        totalDieselLtr: Math.round(v.totalDieselLtr * 100) / 100,
        partiesList: Array.from(v.parties),
        destinationsList: Array.from(v.destinations)
      }))
      .sort((a, b) => b.tripCount - a.tripCount || b.totalMT - a.totalMT);
  }, [data?.cement]);

  const filteredCardVehicles = useMemo(() => {
    if (!vehSearchTerm.trim()) return vehicleTripSummary;
    const term = vehSearchTerm.toLowerCase().trim();
    return vehicleTripSummary.filter(v => v.vehicleNo.toLowerCase().includes(term));
  }, [vehicleTripSummary, vehSearchTerm]);

  const filteredModalVehicles = useMemo(() => {
    let list = vehicleTripSummary;
    if (modalTripFilter === 'MULTIPLE') {
      list = list.filter(v => v.tripCount > 1);
    } else if (modalTripFilter === 'SINGLE') {
      list = list.filter(v => v.tripCount === 1);
    }
    if (modalSearchTerm.trim()) {
      const term = modalSearchTerm.toLowerCase().trim();
      list = list.filter(v =>
        v.vehicleNo.toLowerCase().includes(term) ||
        v.partiesList.some(p => p.toLowerCase().includes(term)) ||
        v.destinationsList.some(d => d.toLowerCase().includes(term))
      );
    }
    return list;
  }, [vehicleTripSummary, modalTripFilter, modalSearchTerm]);

  const handleExportVehicleSummaryExcel = () => {
    try {
      const rows = filteredModalVehicles.map((v, idx) => ({
        'SL NO': idx + 1,
        'VEHICLE NUMBER': v.vehicleNo,
        'TOTAL TRIPS': v.tripCount,
        'TOTAL MT': v.totalMT,
        'TOTAL BILLING AMOUNT (Rs)': v.totalBillingAmt,
        'LOADING ADVANCE (Rs)': v.totalAdvance,
        'DIESEL (LTR)': v.totalDieselLtr,
        'PARTIES': v.partiesList.join(', ') || '-',
        'DESTINATIONS': v.destinationsList.join(', ') || '-'
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, "Vehicle Trip Summary");
      XLSX.writeFile(wb, `Vehicle_Wise_Trip_Summary_${financialYear}_${month}_${date}.xlsx`);
      setSnack({ severity: 'success', msg: 'Vehicle Wise Trip Summary Excel exported successfully.' });
    } catch (err) {
      console.error(err);
      setSnack({ severity: 'error', msg: 'Failed to export vehicle summary.' });
    }
  };

  // Bill Breakdown Categories
  const billBreakdown = useMemo(() => {
    const pending = [];
    const nonStamp = [];
    const stamp = [];

    (data?.cement || []).forEach(e => {
      const billAmt = parseNum(e["Billing Amount"] || e["BILLING AMOUNT"] || e["AMOUNT"]);
      if (billAmt === 0) return; // Only count those that contribute to the total

      const status = String(e["CHALLAN STATUS"] || "").toUpperCase().trim();
      if (status === "STAMP") stamp.push(e);
      else if (status.includes("NON-STAMP") || status.includes("NON STAMP")) nonStamp.push(e);
      else pending.push(e);
    });

    const sumAmt = (arr) => arr.reduce((acc, e) => acc + parseNum(e["Billing Amount"] || e["BILLING AMOUNT"] || e["AMOUNT"]), 0);

    return {
      pending, pendingAmt: sumAmt(pending),
      nonStamp, nonStampAmt: sumAmt(nonStamp),
      stamp, stampAmt: sumAmt(stamp),
      totalPendingCount: pending.length
    };
  }, [data]);

  const challanAlerts = useMemo(() => {
    if (ytdAlertsData.stamp.records.length > 0 || ytdAlertsData.nonStamp.records.length > 0 || ytdAlertsData.pending.records.length > 0) {
      return {
        pending: ytdAlertsData.pending.records,
        nonStamp: ytdAlertsData.nonStamp.records,
        stamp: ytdAlertsData.stamp.records
      };
    }

    // Fallback using client-side YTD filtering:
    // Pending Challan: FY START -> YESTERDAY (TODAY - 1 DAY)
    // STAMP / NON-STAMP: FY START -> TODAY
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();
    let startYear = currentMonth < 4 ? currentYear - 1 : currentYear;
    if (financialYear && /^FY\s*\d{4}-\d{2}$/i.test(financialYear)) {
      startYear = parseInt(financialYear.replace(/\D/g, '').substring(0, 4), 10);
    }
    const endYear = startYear + 1;
    const fyStart = new Date(startYear, 3, 1, 0, 0, 0, 0).getTime();
    const fyEnd = new Date(endYear, 2, 31, 23, 59, 59, 999).getTime();
    const todayEnd = new Date(currentYear, currentMonth - 1, currentDay, 23, 59, 59, 999).getTime();
    const yesterdayEnd = new Date(currentYear, currentMonth - 1, currentDay - 1, 23, 59, 59, 999).getTime();
    const reportEndToday = todayEnd < fyEnd ? todayEnd : fyEnd;
    const reportEndPending = yesterdayEnd < fyEnd ? yesterdayEnd : fyEnd;

    const pending = [];
    const nonStamp = [];
    const stamp = [];

    (data?.cement || []).forEach(e => {
      const rawDate = e["LOADING DT"] || e["LOADING DATE"] || e["BILL DATE"] || e["DATE"];
      const t = parseDateToStartOfDay(rawDate);
      if (!t) return;
      if (t < fyStart) return;

      const status = String(e["CHALLAN STATUS"] || "").toUpperCase().trim();
      if (status === "STAMP") {
        if (t <= reportEndToday) stamp.push(e);
      } else if (status.includes("NON-STAMP") || status.includes("NON STAMP")) {
        if (t <= reportEndToday) nonStamp.push(e);
      } else {
        if (t <= reportEndPending) pending.push(e);
      }
    });

    return { pending, nonStamp, stamp };
  }, [ytdAlertsData, data, financialYear]);

  const stampNonBilledAlerts = useMemo(() => {
    if (ytdAlertsData.stampNonBilled.count > 0 || ytdAlertsData.stampNonBilled.all.length > 0 || ytdAlertsData.stampNonBilled.freight.length > 0 || ytdAlertsData.stampNonBilled.unloading.length > 0) {
      return ytdAlertsData.stampNonBilled;
    }

    // Fallback using client-side YTD filtering (Loading Date >= Current FY Start && Loading Date <= TODAY)
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();
    let startYear = currentMonth < 4 ? currentYear - 1 : currentYear;
    if (financialYear && /^FY\s*\d{4}-\d{2}$/i.test(financialYear)) {
      startYear = parseInt(financialYear.replace(/\D/g, '').substring(0, 4), 10);
    }
    const endYear = startYear + 1;
    const fyStart = new Date(startYear, 3, 1, 0, 0, 0, 0).getTime();
    const fyEnd = new Date(endYear, 2, 31, 23, 59, 59, 999).getTime();
    const todayEnd = new Date(currentYear, currentMonth - 1, currentDay, 23, 59, 59, 999).getTime();
    const reportEnd = todayEnd < fyEnd ? todayEnd : fyEnd;

    const all = [];
    const freight = [];
    const unloading = [];
    const totalNonBilled = [];

    (data?.cement || []).forEach(e => {
      const rawDate = e["LOADING DT"] || e["LOADING DATE"] || e["BILL DATE"] || e["DATE"];
      const t = parseDateToStartOfDay(rawDate);
      if (!t) return;
      if (t < fyStart || t > reportEnd) return;

      const status = String(e["CHALLAN STATUS"] || "").toUpperCase().trim();
      if (status !== "STAMP") return;

      const freightBillNo = String(e["BILL NO"] || e["BILL NUMBER"] || e["FREIGHT BILL NO"] || e["Freight Bill No"] || e.freightBillNo || "").trim();
      const hasFreight = freightBillNo !== "" && freightBillNo !== "-" && freightBillNo.toLowerCase() !== "null" && freightBillNo.toLowerCase() !== "undefined";

      const unloadingBillNo = String(e["UNLOADING BILL NO"] || e["UNLOADING BILL NUMBER"] || e["Unloading Bill No"] || e.unloadingBillNo || "").trim();
      const hasUnloading = unloadingBillNo !== "" && unloadingBillNo !== "-" && unloadingBillNo.toLowerCase() !== "null" && unloadingBillNo.toLowerCase() !== "undefined";

      // Fully billed (both exist) -> EXCLUDE
      if (hasFreight && hasUnloading) return;

      totalNonBilled.push(e);

      // 1. ALL TAB -> Freight missing AND Unloading missing
      if (!hasFreight && !hasUnloading) {
        all.push(e);
      }

      // 2. FREIGHT TAB -> Freight missing
      if (!hasFreight) {
        freight.push(e);
      }

      // 3. UNLOADING TAB -> Unloading missing
      if (!hasUnloading) {
        unloading.push(e);
      }
    });

    return {
      all,
      freight,
      unloading,
      count: totalNonBilled.length
    };
  }, [ytdAlertsData, data, financialYear]);

  const eWayAlerts = useMemo(() => {
    const expiringToday = [];
    const expired = [];
    const active = [];
    const done = [];
    const noData = [];

    (data?.cement || []).forEach(e => {
      const info = getEWayBillStatus(e);
      if (info.code === "EXPIRING_TODAY") expiringToday.push({ ...e, ewayInfo: info });
      else if (info.code === "EXPIRED") expired.push({ ...e, ewayInfo: info });
      else if (info.code === "ACTIVE") active.push({ ...e, ewayInfo: info });
      else if (info.code === "DONE") done.push({ ...e, ewayInfo: info });
      else noData.push({ ...e, ewayInfo: info });
    });

    const urgentRecords = [...expiringToday, ...expired];

    return {
      expiringToday,
      expired,
      active,
      done,
      noData,
      urgentRecords,
      urgentCount: urgentRecords.length,
      hasBlinking: expiringToday.length > 0
    };
  }, [data]);

  const unloadingStatusData = useMemo(() => {
    const allRecords = data?.cement || [];
    const now = new Date();
    const todayStartMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStartMs = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();

    const formatDateDDMMYYYY = (ms) => {
      const d = new Date(ms);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}-${month}-${year}`;
    };

    const todayFormatted = formatDateDDMMYYYY(todayStartMs);
    const yesterdayFormatted = formatDateDDMMYYYY(yesterdayStartMs);

    const yesterdayUnloaded = [];
    const todayUnloading = [];
    const seenYesterday = new Set();
    const seenToday = new Set();

    allRecords.forEach((row, idx) => {
      const uniqueKey = row._id || `${row["INVOICE NO"] || row["INVOICE NO."] || ''}_${row["E-WAY BILL NO"] || row["E-WAY BILL NUMBER"] || ''}_${row["VEHICLE NUMBER"] || row["VEHICLE NO"] || ''}_${idx}`;
      const info = getEWayBillStatus(row);

      const unloadingRaw = String(
        row["UNLOADING STATUS"] ||
        row["RECEIVING DATE"] ||
        row["UNLOADING DATE"] ||
        row["RECEIVING DT"] ||
        row["UNLOADING DT"] ||
        row["unloadingStatus"] ||
        row["receivingDate"] ||
        row["unloadingDate"] ||
        row["UNLOADING_STATUS"] ||
        row["RECEIVING_DATE"] ||
        row["UNLOADING_DATE"] ||
        ""
      ).trim();

      const hasUnloadingDate = Boolean(
        unloadingRaw &&
        unloadingRaw !== "-" &&
        unloadingRaw.toLowerCase() !== "null" &&
        unloadingRaw.toLowerCase() !== "undefined"
      );

      const unloadingMs = hasUnloadingDate ? parseDateToStartOfDay(unloadingRaw) : null;
      const validityMs = parseDateToStartOfDay(info.effectiveValidity);

      // Condition 1: YESTERDAY UNLOADED
      // Vehicles whose unloading was completed yesterday
      if (hasUnloadingDate && unloadingMs === yesterdayStartMs) {
        if (!seenYesterday.has(uniqueKey)) {
          seenYesterday.add(uniqueKey);
          yesterdayUnloaded.push({
            ...row,
            uniqueKey,
            ewayInfo: info,
            unloadingDateFormatted: unloadingRaw,
            validityStatus: 'UNLOADED'
          });
        }
      }

      // Condition 2: TODAY UNLOADING
      // Vehicles that are expected/required to complete unloading today before 11:59:59 PM
      const isExpiringToday = info.code === "EXPIRING_TODAY" || validityMs === todayStartMs;
      const isUnloadedToday = hasUnloadingDate && unloadingMs === todayStartMs;

      if (isExpiringToday || isUnloadedToday) {
        if (!seenToday.has(uniqueKey)) {
          seenToday.add(uniqueKey);
          todayUnloading.push({
            ...row,
            uniqueKey,
            ewayInfo: info,
            isPending: !hasUnloadingDate,
            unloadingDisplay: hasUnloadingDate ? unloadingRaw : 'UNLOADING PENDING',
            validityStatus: isUnloadedToday ? 'UNLOADED' : (info.label || 'EXPIRING TODAY')
          });
        }
      }
    });

    return {
      todayFormatted,
      yesterdayFormatted,
      yesterdayUnloaded,
      todayUnloading,
      yesterdayCount: yesterdayUnloaded.length,
      todayCount: todayUnloading.length,
      allRecords
    };
  }, [data]);

  const unloadingSearchMatches = useMemo(() => {
    const term = unloadingSearchTerm.trim().toLowerCase().replace(/\s+/g, '');
    if (!term) return [];
    return (data?.cement || []).filter((row) => {
      const eway = String(row["E-WAY BILL NO"] || row["E-WAY BILL NUMBER"] || row["E-WAY BILL NO."] || row["E-WAY BILL"] || "").trim().toLowerCase().replace(/\s+/g, '');
      const veh = String(row["VEHICLE NUMBER"] || row["VEHICLE NO"] || row["VEHICLE NO."] || "").trim().toLowerCase().replace(/\s+/g, '');
      const inv = String(row["INVOICE NO"] || row["INVOICE NO."] || "").trim().toLowerCase().replace(/\s+/g, '');
      return eway.includes(term) || veh.includes(term) || inv.includes(term);
    });
  }, [data?.cement, unloadingSearchTerm]);

  const performanceAnalytics = useMemo(() => {
    if (!data?.cement) return { chartData: [] };

    // Group logic: determine if we need to group by month
    const monthSet = new Set();
    data.cement.forEach(e => {
      const d = String(e["LOADING DT"] || e["LOADING DATE"] || e["BILL DATE"] || "Unknown").trim();
      if (d !== "Unknown") {
        const parts = d.split('-'); // Format is DD-MMM-YYYY or YYYY-MM-DD
        if (parts.length >= 2) {
          let mm = parts[1];
          monthSet.add(mm);
        }
      }
    });

    const groupByMonth = monthSet.size > 1;

    const mapRev = {};
    const mapMT = {};

    data.cement.forEach(e => {
      const amt = parseNum(e["Billing Amount"] || e["AMOUNT"] || 0);
      const mt = parseNum(e["MT"] || 0);

      const d = String(e["LOADING DT"] || e["LOADING DATE"] || e["BILL DATE"] || "Unknown").trim();
      let key = d;

      if (d !== "Unknown" && groupByMonth) {
        const parts = d.split('-');
        if (parts.length === 3) {
          key = parts[1]; // e.g. 'Jun'
        }
      }

      if (amt > 0) mapRev[key] = (mapRev[key] || 0) + amt;
      if (mt > 0) mapMT[key] = (mapMT[key] || 0) + mt;
    });

    const allKeys = Array.from(new Set([...Object.keys(mapRev), ...Object.keys(mapMT)]));

    // Sort logic
    if (!groupByMonth) {
      allKeys.sort((a, b) => {
        const da = a.split(/[-/]/);
        const db = b.split(/[-/]/);
        if (da.length === 3 && db.length === 3) {
          return Number(da[0]) - Number(db[0]);
        }
        return a.localeCompare(b);
      });
    } else {
      const monthOrder = { 'Apr': 1, 'May': 2, 'Jun': 3, 'Jul': 4, 'Aug': 5, 'Sep': 6, 'Oct': 7, 'Nov': 8, 'Dec': 9, 'Jan': 10, 'Feb': 11, 'Mar': 12 };
      allKeys.sort((a, b) => (monthOrder[a] || 99) - (monthOrder[b] || 99));
    }

    const chartData = allKeys.map(key => ({
      name: key,
      revenue: Math.round((mapRev[key] || 0) * 100) / 100,
      tonnage: Math.round((mapMT[key] || 0) * 100) / 100
    }));

    return { chartData };
  }, [data]);

  const handleAlertClick = (type, records, customTitle) => {
    if (type === 'Pending') {
      setAlertModalTitle('PENDING CHALLAN DETAILS');
      setAlertModalData(pendingChallansData.records.length > 0 ? pendingChallansData.records : (records || []));
      setAlertModalOpen(true);
      fetchPendingChallans();
      return;
    }
    if (type === 'STAMP') setAlertModalTitle('STAMP BILL DETAILS');
    else if (type === 'NON-STAMP') setAlertModalTitle('NON-STAMP BILL DETAILS');
    else if (type === 'STAMP-NON-BILLED') {
      setAlertModalTitle('STAMP BUT NON-BILLED');
      setStampNonBilledTab(0);
      setAlertModalData(stampNonBilledAlerts.all);
      setAlertModalOpen(true);
      return;
    }
    else if (type === 'E-WAY-BILL') {
      setAlertModalTitle('E-WAY BILL VALIDITY ALERTS');
      setEWayAlertsSearchTerm('');
    }
    else if (type === 'VALIDITY-END') setAlertModalTitle('VALIDITY END');
    else if (type === 'VEHICLE-NOT-LOADED') {
      setAlertModalTitle(customTitle || 'VEHICLE NOT LOADED');
      setAlertModalData(vehicleNotLoadedAlerts.records);
      setAlertModalOpen(true);
      return;
    }
    else if (type === 'SIX-TRIP-NOT-COMPLETE') {
      const monthTitle = sixTripAlerts.monthFullName ? sixTripAlerts.monthFullName.toUpperCase() : (month ? `${month.toUpperCase()} ${financialYear}` : 'MONTHLY CHECK');
      setAlertModalTitle(customTitle || `SIX TRIP NOT COMPLETE — ${monthTitle}`);
      setAlertModalData(sixTripAlerts.records);
      setAlertModalOpen(true);
      return;
    }

    setAlertModalData(records);
    setAlertModalOpen(true);
  };

  useEffect(() => {
    if (alertModalOpen && alertModalTitle === 'PENDING CHALLAN DETAILS') {
      setAlertModalData(pendingChallansData.records);
    } else if (alertModalOpen && alertModalTitle === 'STAMP BILL DETAILS') {
      setAlertModalData(challanAlerts.stamp);
    } else if (alertModalOpen && alertModalTitle === 'NON-STAMP BILL DETAILS') {
      setAlertModalData(challanAlerts.nonStamp);
    } else if (alertModalOpen && alertModalTitle === 'STAMP BUT NON-BILLED') {
      if (stampNonBilledTab === 1) setAlertModalData(stampNonBilledAlerts.freight);
      else if (stampNonBilledTab === 2) setAlertModalData(stampNonBilledAlerts.unloading);
      else setAlertModalData(stampNonBilledAlerts.all);
    } else if (alertModalOpen && alertModalTitle === 'E-WAY BILL VALIDITY ALERTS') {
      setAlertModalData(eWayAlerts.urgentRecords);
    } else if (alertModalOpen && alertModalTitle === 'VALIDITY END') {
      setAlertModalData(validityAlerts.alerts);
    } else if (alertModalOpen && alertModalTitle === 'VEHICLE NOT LOADED') {
      setAlertModalData(vehicleNotLoadedAlerts.records);
    } else if (alertModalOpen && alertModalTitle.startsWith('SIX TRIP NOT COMPLETE')) {
      setAlertModalData(sixTripAlerts.records);
    }
  }, [data, alertModalOpen, alertModalTitle, stampNonBilledTab, pendingChallansData.records, challanAlerts.stamp, challanAlerts.nonStamp, stampNonBilledAlerts, eWayAlerts.urgentRecords, validityAlerts.alerts, vehicleNotLoadedAlerts.records, sixTripAlerts.records]);

  const displayedAlertModalData = useMemo(() => {
    if (alertModalTitle === 'E-WAY BILL VALIDITY ALERTS' && eWayAlertsSearchTerm.trim()) {
      const term = eWayAlertsSearchTerm.trim().toLowerCase().replace(/\s+/g, '');
      return alertModalData.filter(row => {
        const eway = String(row["E-WAY BILL NO"] || row["E-WAY BILL NUMBER"] || row["E-WAY BILL NO."] || row["E-WAY BILL"] || "").toLowerCase().replace(/\s+/g, '');
        const veh = String(row["VEHICLE NUMBER"] || row["VEHICLE NO"] || row["VEHICLE NO."] || "").toLowerCase().replace(/\s+/g, '');
        const inv = String(row["INVOICE NO"] || row["INVOICE NO."] || "").toLowerCase().replace(/\s+/g, '');
        const party = String(row["PARTY NAME"] || row["PARTY"] || "").toLowerCase().replace(/\s+/g, '');
        const dest = String(row["DESTINATION"] || "").toLowerCase().replace(/\s+/g, '');
        return eway.includes(term) || veh.includes(term) || inv.includes(term) || party.includes(term) || dest.includes(term);
      });
    }
    return alertModalData;
  }, [alertModalTitle, alertModalData, eWayAlertsSearchTerm]);


  return (
    <Box sx={{ bgcolor: '#f4f7fa', minHeight: '100vh', pb: 6 }}>
      {/* --- Sticky Header --- */}
      <Box sx={{
        position: 'sticky', top: 0, zIndex: 10,
        bgcolor: 'background.paper', color: '#0f172a',
        px: { xs: 1.5, md: 2.5 }, py: 1.2,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.1)',
        display: 'flex',
        flexWrap: { xs: 'wrap', xl: 'nowrap' },
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: { xs: 1, md: 1.5 }
      }}>
        {/* Left Title */}
        <Box display="flex" alignItems="center" gap={1} flexShrink={0} sx={{ order: 1 }}>
          <IconButton onClick={onBack} size="small" sx={{ color: '#0f172a', bgcolor: 'background.default', '&:hover': { bgcolor: '#e2e8f0' }, p: 0.8 }}>
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <Box>
            <Typography variant="subtitle1" fontWeight={900} sx={{ letterSpacing: '-0.3px', lineHeight: 1.2, fontSize: { xs: '0.95rem', md: '1.05rem', xl: '1.15rem' }, whiteSpace: 'nowrap' }}>
              Daily Operations Dashboard
            </Typography>
            <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: { xs: 'none', '2xl': 'block' }, lineHeight: 1 }}>
              Live operational metrics and invoice processing
            </Typography>
          </Box>
        </Box>

        {/* Center Tabs */}
        <Box sx={{
          flexShrink: 0,
          display: 'flex',
          justifyContent: 'center',
          order: { xs: 3, xl: 2 },
          width: { xs: '100%', xl: 'auto' },
          mx: { xs: 0, xl: 'auto' },
          mt: { xs: 1.5, xl: 0 }
        }}>
          <Tabs
            value={mainTab}
            onChange={(e, v) => setMainTab(v)}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            sx={{
              minHeight: 34,
              '& .MuiTabs-scroller': { display: 'flex', alignItems: 'center' },
              '& .MuiTabs-flexContainer': { gap: { xs: 0.4, md: 0.6 } },
              '& .MuiTab-root': {
                minWidth: 'auto',
                minHeight: 32,
                borderRadius: '8px',
                textTransform: 'none',
                fontWeight: 800,
                fontSize: { xs: '0.7rem', sm: '0.74rem', md: '0.78rem' },
                px: { xs: 1, sm: 1.3, md: 1.6 },
                py: 0.4,
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
                color: '#475569',
                bgcolor: 'rgba(241, 245, 249, 0.8)',
                '&:hover': { bgcolor: '#e2e8f0', color: '#0f172a' }
              },
              '& .Mui-selected': {
                bgcolor: '#0f172a !important',
                color: '#ffffff !important',
                boxShadow: '0 2px 8px rgba(15,23,42,0.2)'
              }
            }}
            TabIndicatorProps={{ style: { display: 'none' } }}
          >
            <Tab label="DAILY SUMMARY REPORTS" />
            <Tab label="ALL PARTY REPORTS" />
            <Tab label="VEHICLE WISE TRIP SUMMARY" />
            <Tab label="DAILY REVENUE NVL & NVCL" />
            <Tab label="REVENEW" />
          </Tabs>
        </Box>

        {/* Right Controls */}
        <Box
          display="flex"
          alignItems="center"
          gap={{ xs: 0.8, md: 1 }}
          flexWrap="wrap"
          sx={{
            order: { xs: 2, xl: 3 },
            justifyContent: { xs: 'flex-start', sm: 'flex-end' },
            flexShrink: 0
          }}
        >
          <FormControl size="small">
            <Select
              value={financialYear}
              onChange={(e) => setFinancialYear(e.target.value)}
              sx={{ bgcolor: 'background.default', borderRadius: '8px', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' }, fontWeight: 700, minWidth: { xs: 90, md: 105 }, fontSize: '0.8rem', py: 0 }}
            >
              {fyOptions.map(fy => <MenuItem key={fy} value={fy} sx={{ fontWeight: 600, fontSize: '0.8rem' }}>{fy}</MenuItem>)}
            </Select>
          </FormControl>

          <FormControl size="small">
            <Select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              sx={{ bgcolor: 'background.default', borderRadius: '8px', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' }, fontWeight: 700, minWidth: { xs: 90, md: 105 }, fontSize: '0.8rem', py: 0 }}
            >
              {monthOptions.map(m => <MenuItem key={m} value={m} sx={{ fontWeight: 600, fontSize: '0.8rem' }}>{m}</MenuItem>)}
            </Select>
          </FormControl>

          <Button
            onClick={handleOpenCalendar}
            variant="outlined"
            endIcon={<CalendarTodayIcon sx={{ fontSize: '1rem !important' }} />}
            sx={{
              bgcolor: 'background.default',
              borderRadius: '8px',
              borderColor: '#e2e8f0',
              color: '#0f172a',
              fontWeight: 800,
              minWidth: { xs: 75, md: 88 },
              fontSize: '0.8rem',
              textTransform: 'none',
              px: 1.2,
              py: 0.6,
              '&:hover': { bgcolor: 'background.default', borderColor: '#cbd5e1' }
            }}
          >
            {date === 'ALL' ? 'ALL' : (dateOptions.find(d => d.value === date)?.display?.split('-')[0] + ' ' + month.substring(0, 3))}
          </Button>

          <Popover
            open={Boolean(calendarAnchorEl)}
            anchorEl={calendarAnchorEl}
            onClose={handleCloseCalendar}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            PaperProps={{
              sx: {
                mt: 1, p: 2, borderRadius: '16px', boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
                border: '1px solid #e2e8f0', width: '320px', bgcolor: 'background.paper'
              }
            }}
          >
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="subtitle1" fontWeight={900} color="#0f172a" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {month} {financialYear.substring(3, 7)}
              </Typography>
            </Box>

            <Button
              fullWidth
              variant={date === 'ALL' ? 'contained' : 'outlined'}
              onClick={() => { setDate('ALL'); handleCloseCalendar(); }}
              sx={{
                bgcolor: date === 'ALL' ? '#0f172a' : 'transparent',
                color: date === 'ALL' ? '#fff' : '#0f172a',
                borderColor: '#0f172a',
                fontWeight: 800,
                borderRadius: '8px',
                mb: 2,
                py: 1,
                '&:hover': { bgcolor: date === 'ALL' ? '#1e293b' : '#f8fafc', borderColor: '#1e293b' }
              }}
            >
              ALL (Full Month)
            </Button>

            <Grid container spacing={1}>
              {dateOptions.map(d => {
                const dNum = parseInt(d.display.split('-')[0], 10);
                const isSelected = date === d.value;
                const isToday = new Date().toISOString().split('T')[0] === d.value;
                return (
                  <Grid item xs={12 / 7} key={d.value}>
                    <Box
                      onClick={() => { setDate(d.value); handleCloseCalendar(); }}
                      sx={{
                        cursor: 'pointer',
                        bgcolor: isSelected ? '#3b82f6' : 'transparent',
                        color: isSelected ? '#fff' : '#1e293b',
                        borderRadius: '8px',
                        py: 1,
                        textAlign: 'center',
                        transition: 'all 0.15s',
                        '&:hover': { bgcolor: isSelected ? '#2563eb' : '#f1f5f9' }
                      }}
                    >
                      <Typography variant="body2" fontWeight={isSelected ? 800 : 600}>{dNum}</Typography>
                      {isToday && <Box sx={{ width: 4, height: 4, bgcolor: isSelected ? '#fff' : '#3b82f6', borderRadius: '50%', mx: 'auto', mt: 0.5 }} />}
                    </Box>
                  </Grid>
                );
              })}
            </Grid>
          </Popover>
          <Tooltip title="Refresh Data">
            <IconButton onClick={() => fetchData(date)} size="small" sx={{ color: '#0f172a', bgcolor: 'background.default', '&:hover': { bgcolor: '#e2e8f0' }, p: 0.8 }}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            color="primary"
            startIcon={<DownloadIcon fontSize="small" />}
            onClick={handleExportExcel}
            disabled={!data}
            size="small"
            sx={{
              fontWeight: 800, borderRadius: '8px',
              background: '#0f172a',
              color: '#fff',
              boxShadow: 'none',
              fontSize: '0.8rem',
              py: 0.6,
              px: 1.5,
              '&:hover': { background: '#1e293b', boxShadow: '0 4px 12px rgba(15,23,42,0.2)' }
            }}
          >
            Export
          </Button>
        </Box>
      </Box>

      {loading ? (
        <Box display="flex" justifyContent="center" alignItems="center" height="70vh">
          <CircularProgress size={50} color="primary" />
        </Box>
      ) : (
        <Box sx={{ px: { xs: 2, md: 4 }, mt: 4, maxWidth: '1600px', mx: 'auto' }}>

          {/* ==========================================
              SECTION 1: DAILY OPERATIONS (KPI CARDS)
             ========================================== */}
          <Typography variant="subtitle2" fontWeight={800} color="text.secondary" mb={1.5} sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
            1. Daily Operations
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)', xl: 'repeat(6, 1fr)' }, gap: 2.5, mb: 4 }}>

            <Card sx={{ borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
              <CardContent sx={{ p: '20px !important' }}>
                <Typography variant="caption" color="text.secondary" fontWeight={700} textTransform="uppercase">TOTAL INVOICE</Typography>
                <Typography variant="h4" fontWeight={900} mt={0.5} color="#0f172a">{data?.invoicesUploaded || 0}</Typography>
                <Typography variant="body2" color="text.secondary" mt={0.5} fontWeight={500}>From Cement Register</Typography>
              </CardContent>
            </Card>

            <Card sx={{ borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', borderLeft: '4px solid #0d9488' }}>
              <CardContent sx={{ p: '20px !important' }}>
                <Typography variant="caption" color="text.secondary" fontWeight={700} textTransform="uppercase">Total Cement Load</Typography>
                <Typography variant="h4" fontWeight={900} mt={0.5} color="#0f172a">{metrics.cementMT} <span style={{ fontSize: 16, color: '#64748b' }}>MT</span></Typography>
                <Typography variant="body2" color="text.secondary" mt={0.5} fontWeight={500}>{metrics.cementTrips} Trip(s)</Typography>
              </CardContent>
            </Card>

            <Card sx={{ borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', borderLeft: '4px solid #0284c7' }}>
              <CardContent sx={{ p: '20px !important' }}>
                <Typography variant="caption" color="text.secondary" fontWeight={700} textTransform="uppercase">Total Diesel</Typography>
                <Typography variant="h4" fontWeight={900} mt={0.5} color="#0f172a">{metrics.fuelLtr} <span style={{ fontSize: 16, color: '#64748b' }}>LTR</span></Typography>
                <Typography variant="body2" color="text.secondary" mt={0.5} fontWeight={500}>{metrics.fuelSlips} Slip(s)</Typography>
              </CardContent>
            </Card>

            <Card sx={{ borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', borderLeft: '4px solid #4f46e5' }}>
              <CardContent sx={{ p: '20px !important' }}>
                <Typography variant="caption" color="text.secondary" fontWeight={700} textTransform="uppercase">Loading Advance</Typography>
                <Typography variant="h4" fontWeight={900} mt={0.5} color="#0f172a">₹{metrics.loadingAdvanceAmt.toLocaleString()}</Typography>
                <Typography variant="body2" color="text.secondary" mt={0.5} fontWeight={500}>{metrics.advanceVehicles.length} Vehicle(s)</Typography>
              </CardContent>
            </Card>

            <Card sx={{ borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', borderLeft: '4px solid #b91c1c' }}>
              <CardContent sx={{ p: '20px !important' }}>
                <Typography variant="caption" color="text.secondary" fontWeight={700} textTransform="uppercase">Closing Advance</Typography>
                <Typography variant="h4" fontWeight={900} mt={0.5} color="#0f172a">₹{metrics.closingAdvanceBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Typography>
                <Typography variant="body2" color="text.secondary" mt={0.5} fontWeight={500}>End of day balance</Typography>
              </CardContent>
            </Card>

            <Card
              onClick={() => setBillBreakdownOpen(true)}
              sx={{ borderRadius: '12px', boxShadow: '0 4px 12px rgba(217,119,6,0.15)', border: '1px solid #fcd34d', bgcolor: '#fffbeb', cursor: 'pointer', transition: 'all 0.2s', '&:hover': { transform: 'translateY(-2px)' } }}
            >
              <CardContent sx={{ p: '20px !important' }}>
                <Typography variant="caption" color="#92400e" fontWeight={800} textTransform="uppercase">Total Bill Amount</Typography>
                <Typography variant="h4" fontWeight={900} mt={0.5} color="#78350f">₹{metrics.totalBillAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Typography>
                <Typography variant="body2" color="#b45309" mt={0.5} fontWeight={600}>Pending Bills: {billBreakdown.totalPendingCount}</Typography>
              </CardContent>
            </Card>
          </Box>

          <Grid container spacing={2.5} mb={4}>
            {/* ==========================================
                SECTION 3: FINANCIAL SUMMARY
               ========================================== */}
            <Grid item xs={12} sm={6} lg={3}>
              <Typography variant="subtitle2" fontWeight={800} color="text.secondary" mb={1.5} sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                3. Financial Overview
              </Typography>
              <Card sx={{ borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', height: 'calc(100% - 34px)' }}>
                <CardContent sx={{ p: 3 }}>
                  <Box display="flex" justifyContent="space-between" mb={2}>
                    <Typography variant="body2" color="text.secondary" fontWeight={600}>Cash Received (DAC)</Typography>
                    <Typography variant="body1" fontWeight={800} color="#0f172a">₹{metrics.cashReceivedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Typography>
                  </Box>
                  <Box display="flex" justifyContent="space-between" mb={2}>
                    <Typography variant="body2" color="text.secondary" fontWeight={600}>Opening Balance</Typography>
                    <Typography variant="body1" fontWeight={800} color="#0f172a">₹{metrics.cashOpeningBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Typography>
                  </Box>
                  <Divider sx={{ my: 2 }} />
                  <Box display="flex" justifyContent="space-between" mb={2}>
                    <Typography variant="body2" color="text.secondary" fontWeight={600}>Loading Advance (-)</Typography>
                    <Typography variant="body1" fontWeight={800} color="#dc2626">₹{metrics.loadingAdvanceAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Typography>
                  </Box>
                  <Box display="flex" justifyContent="space-between" mb={2}>
                    <Typography variant="body2" color="text.secondary" fontWeight={600}>Misc Expenses (-)</Typography>
                    <Typography variant="body1" fontWeight={800} color="#dc2626">₹{metrics.miscExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Typography>
                  </Box>
                  <Divider sx={{ my: 2 }} />
                  <Box display="flex" justifyContent="space-between" alignItems="center" p={1.5} bgcolor="#f8fafc" borderRadius="8px">
                    <Typography variant="subtitle1" fontWeight={800} color="#0f172a">Closing Advance</Typography>
                    <Typography variant="h6" fontWeight={900} color={metrics.closingAdvanceBalance < 0 ? '#dc2626' : '#059669'}>
                      ₹{metrics.closingAdvanceBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </Typography>
                  </Box>

                  <Box mt={3} p={2} bgcolor="#eff6ff" borderRadius="8px" border="1px dashed #bfdbfe">
                    <Box display="flex" justifyContent="space-between" mb={1}>
                      <Typography variant="caption" fontWeight={800} color="#1e40af" textTransform="uppercase">Total Gross Freight</Typography>
                      <Typography variant="subtitle2" fontWeight={900} color="#1e3a8a">₹{metrics.totalBillAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Typography>
                    </Box>
                    <Box display="flex" justifyContent="space-between">
                      <Typography variant="caption" fontWeight={800} color="#1e40af" textTransform="uppercase">Pump Payments (HSD)</Typography>
                      <Typography variant="subtitle2" fontWeight={900} color="#1e3a8a">₹{metrics.totalPumpPaymentAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* ==========================================
                SECTION 4: ALERTS & PENDING ACTIONS
               ========================================== */}
            <Grid item xs={12} sm={6} lg={3}>
              <Typography variant="subtitle2" fontWeight={800} color="text.secondary" mb={1.5} sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                4. Alerts & Action Items
              </Typography>
              <Card sx={{ borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', height: 'calc(100% - 34px)' }}>
                <CardContent sx={{ p: 2.5 }}>

                  <Box
                    onClick={() => handleAlertClick('Pending', pendingChallansData.records)}
                    display="flex" alignItems="center" gap={1.5} p={1.5} mb={1.5} borderRadius="12px"
                    sx={{ cursor: 'pointer', bgcolor: pendingChallansData.count > 0 ? '#fffbeb' : '#f8fafc', border: `1px solid ${pendingChallansData.count > 0 ? '#fde68a' : '#e2e8f0'}`, transition: 'all 0.2s', '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' } }}
                  >
                    <WarningAmberIcon sx={{ color: pendingChallansData.count > 0 ? '#d97706' : '#94a3b8', fontSize: 26 }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={800} color={pendingChallansData.count > 0 ? '#b45309' : '#64748b'} noWrap>Challan Status Pending</Typography>
                      <Typography variant="caption" fontWeight={600} color={pendingChallansData.count > 0 ? '#d97706' : '#94a3b8'} noWrap display="block">Click to view pending records</Typography>
                    </Box>
                    <Typography variant="h6" fontWeight={900} color={pendingChallansData.count > 0 ? '#92400e' : '#64748b'}>{pendingChallansData.count}</Typography>
                  </Box>

                  <Box
                    onClick={() => handleAlertClick('STAMP', challanAlerts.stamp)}
                    display="flex" alignItems="center" gap={1.5} p={1.5} mb={1.5} borderRadius="12px"
                    sx={{ cursor: 'pointer', bgcolor: challanAlerts.stamp.length > 0 ? '#f0fdf4' : '#f8fafc', border: `1px solid ${challanAlerts.stamp.length > 0 ? '#bbf7d0' : '#e2e8f0'}`, transition: 'all 0.2s', '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' } }}
                  >
                    <CheckCircleOutlineIcon sx={{ color: challanAlerts.stamp.length > 0 ? '#16a34a' : '#94a3b8', fontSize: 26 }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={800} color={challanAlerts.stamp.length > 0 ? '#15803d' : '#64748b'} noWrap>STAMP Bills</Typography>
                      <Typography variant="caption" fontWeight={600} color={challanAlerts.stamp.length > 0 ? '#16a34a' : '#94a3b8'} noWrap display="block">Click to view STAMP records</Typography>
                    </Box>
                    <Typography variant="h6" fontWeight={900} color={challanAlerts.stamp.length > 0 ? '#14532d' : '#64748b'}>{challanAlerts.stamp.length}</Typography>
                  </Box>

                  <Box
                    onClick={() => handleAlertClick('NON-STAMP', challanAlerts.nonStamp)}
                    display="flex" alignItems="center" gap={1.5} p={1.5} mb={1.5} borderRadius="12px"
                    sx={{ cursor: 'pointer', bgcolor: challanAlerts.nonStamp.length > 0 ? '#fff1f2' : '#f8fafc', border: `1px solid ${challanAlerts.nonStamp.length > 0 ? '#fecdd3' : '#e2e8f0'}`, transition: 'all 0.2s', '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' } }}
                  >
                    <ErrorOutlineIcon sx={{ color: challanAlerts.nonStamp.length > 0 ? '#e11d48' : '#94a3b8', fontSize: 26 }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={800} color={challanAlerts.nonStamp.length > 0 ? '#be123c' : '#64748b'} noWrap>NON-STAMP Bills</Typography>
                      <Typography variant="caption" fontWeight={600} color={challanAlerts.nonStamp.length > 0 ? '#e11d48' : '#94a3b8'} noWrap display="block">Click to view NON-STAMP records</Typography>
                    </Box>
                    <Typography variant="h6" fontWeight={900} color={challanAlerts.nonStamp.length > 0 ? '#881337' : '#64748b'}>{challanAlerts.nonStamp.length}</Typography>
                  </Box>

                  {/* ── STAMP BUT NON-BILLED ALERT ──────────────────────────────── */}
                  <Box
                    onClick={() => handleAlertClick('STAMP-NON-BILLED', stampNonBilledAlerts.all)}
                    display="flex" alignItems="center" gap={1.5} p={1.5} mb={1.5} borderRadius="12px"
                    sx={{
                      cursor: 'pointer',
                      bgcolor: stampNonBilledAlerts.count > 0 ? '#fff7ed' : '#f8fafc',
                      border: `1px solid ${stampNonBilledAlerts.count > 0 ? '#fed7aa' : '#e2e8f0'}`,
                      transition: 'all 0.2s',
                      '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }
                    }}
                  >
                    <AssignmentLateIcon sx={{ color: stampNonBilledAlerts.count > 0 ? '#ea580c' : '#94a3b8', fontSize: 26 }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={800} color={stampNonBilledAlerts.count > 0 ? '#c2410c' : '#64748b'} noWrap>STAMP BUT NON-BILLED</Typography>
                      <Typography variant="caption" fontWeight={600} color={stampNonBilledAlerts.count > 0 ? '#ea580c' : '#94a3b8'} noWrap display="block">Click to view STAMP but non-billed records</Typography>
                    </Box>
                    <Typography variant="h6" fontWeight={900} color={stampNonBilledAlerts.count > 0 ? '#9a3412' : '#64748b'}>{stampNonBilledAlerts.count}</Typography>
                  </Box>

                  <Box
                    onClick={() => handleAlertClick('E-WAY-BILL', eWayAlerts.urgentRecords)}
                    display="flex" alignItems="center" gap={1.5} p={1.5} borderRadius="12px"
                    sx={{
                      cursor: 'pointer',
                      bgcolor: eWayAlerts.urgentCount > 0 ? '#fff1f2' : '#f8fafc',
                      border: `1px solid ${eWayAlerts.urgentCount > 0 ? '#fecdd3' : '#e2e8f0'}`,
                      transition: 'all 0.2s',
                      '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' },
                      animation: eWayAlerts.hasBlinking ? 'pulseEWayCardRed 1.5s infinite ease-in-out' : 'none',
                      '@keyframes pulseEWayCardRed': {
                        '0%, 100%': { boxShadow: '0 0 0 0 rgba(225, 29, 72, 0.4)' },
                        '50%': { boxShadow: '0 0 0 8px rgba(225, 29, 72, 0)' }
                      }
                    }}
                  >
                    <WarningAmberIcon sx={{ color: eWayAlerts.urgentCount > 0 ? '#e11d48' : '#94a3b8', fontSize: 26 }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={800} color={eWayAlerts.urgentCount > 0 ? '#be123c' : '#64748b'} noWrap>E-Way Bill Validity Alert</Typography>
                      <Typography variant="caption" fontWeight={600} color={eWayAlerts.urgentCount > 0 ? '#e11d48' : '#94a3b8'} noWrap display="block">Click to view alerts</Typography>
                    </Box>
                    <Typography variant="h6" fontWeight={900} color={eWayAlerts.urgentCount > 0 ? '#881337' : '#64748b'}>{eWayAlerts.urgentCount}</Typography>
                  </Box>

                  {/* ── VALIDITY END ALERT ──────────────────────────────────────── */}
                  <Box
                    onClick={() => handleAlertClick('VALIDITY-END', validityAlerts.alerts)}
                    display="flex" alignItems="center" gap={1.5} p={1.5} mt={1.5} borderRadius="12px"
                    sx={{
                      cursor: 'pointer',
                      bgcolor: validityAlerts.count > 0 ? '#fff1f2' : '#f8fafc',
                      border: `1px solid ${validityAlerts.count > 0 ? '#fecdd3' : '#e2e8f0'}`,
                      transition: 'all 0.2s',
                      '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' },
                      animation: validityAlerts.count > 0 ? 'pulseValidityCardRed 1.5s infinite ease-in-out' : 'none',
                      '@keyframes pulseValidityCardRed': {
                        '0%, 100%': { boxShadow: '0 0 0 0 rgba(225, 29, 72, 0.4)' },
                        '50%': { boxShadow: '0 0 0 8px rgba(225, 29, 72, 0)' }
                      }
                    }}
                  >
                    <WarningAmberIcon sx={{ color: validityAlerts.count > 0 ? '#e11d48' : '#94a3b8', fontSize: 26 }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={800} color={validityAlerts.count > 0 ? '#be123c' : '#64748b'} noWrap>VALIDITY END</Typography>
                      <Typography variant="caption" fontWeight={600} color={validityAlerts.count > 0 ? '#e11d48' : '#94a3b8'} noWrap display="block">Vehicle validities ending</Typography>
                    </Box>
                    <Typography variant="h6" fontWeight={900} color={validityAlerts.count > 0 ? '#881337' : '#64748b'}>{validityAlerts.count}</Typography>
                  </Box>

                  {/* ── VEHICLE NOT LOADED ALERT ──────────────────────────────────────── */}
                  <Box
                    onClick={() => handleAlertClick('VEHICLE-NOT-LOADED', vehicleNotLoadedAlerts.records, 'VEHICLE NOT LOADED')}
                    display="flex" alignItems="center" gap={1.5} p={1.5} mt={1.5} borderRadius="12px"
                    sx={{
                      cursor: 'pointer',
                      bgcolor: vehicleNotLoadedAlerts.count > 0 ? '#fff1f2' : '#f8fafc',
                      border: `1px solid ${vehicleNotLoadedAlerts.count > 0 ? '#fecdd3' : '#e2e8f0'}`,
                      transition: 'all 0.2s',
                      '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' },
                      animation: vehicleNotLoadedAlerts.count > 0 ? 'pulseVehicleNotLoadedCardRed 1.5s infinite ease-in-out' : 'none',
                      '@keyframes pulseVehicleNotLoadedCardRed': {
                        '0%, 100%': { boxShadow: '0 0 0 0 rgba(225, 29, 72, 0.4)' },
                        '50%': { boxShadow: '0 0 0 8px rgba(225, 29, 72, 0)' }
                      }
                    }}
                  >
                    <WarningAmberIcon sx={{ color: vehicleNotLoadedAlerts.count > 0 ? '#e11d48' : '#94a3b8', fontSize: 26 }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={800} color={vehicleNotLoadedAlerts.count > 0 ? '#be123c' : '#64748b'} noWrap>
                        VEHICLE NOT LOADED
                      </Typography>
                      <Typography variant="caption" fontWeight={600} color={vehicleNotLoadedAlerts.count > 0 ? '#e11d48' : '#94a3b8'} noWrap display="block">
                        {vehicleNotLoadedAlerts.count > 0 ? `${vehicleNotLoadedAlerts.count} vehicle(s) waiting for loading (>3 days)` : 'No unloaded vehicles pending'}
                      </Typography>
                    </Box>
                    <Typography variant="h6" fontWeight={900} color={vehicleNotLoadedAlerts.count > 0 ? '#881337' : '#64748b'}>
                      {vehicleNotLoadedAlerts.count}
                    </Typography>
                  </Box>

                  {/* ── SIX TRIP NOT COMPLETE ALERT ──────────────────────────────────────── */}
                  <Box
                    onClick={() => {
                      const monthTitle = sixTripAlerts.monthFullName ? sixTripAlerts.monthFullName.toUpperCase() : (month ? `${month.toUpperCase()} ${financialYear}` : 'MONTHLY CHECK');
                      handleAlertClick('SIX-TRIP-NOT-COMPLETE', sixTripAlerts.records, `SIX TRIP NOT COMPLETE — ${monthTitle}`);
                    }}
                    display="flex" alignItems="center" gap={1.5} p={1.5} mt={1.5} borderRadius="12px"
                    sx={{
                      cursor: 'pointer',
                      bgcolor: (sixTripAlerts.isApplicable && sixTripAlerts.count > 0) ? '#fff1f2' : '#f8fafc',
                      border: `1px solid ${(sixTripAlerts.isApplicable && sixTripAlerts.count > 0) ? '#fecdd3' : '#e2e8f0'}`,
                      transition: 'all 0.2s',
                      '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' },
                      animation: (sixTripAlerts.isApplicable && sixTripAlerts.count > 0) ? 'pulseSixTripCardRed 1.5s infinite ease-in-out' : 'none',
                      '@keyframes pulseSixTripCardRed': {
                        '0%, 100%': { boxShadow: '0 0 0 0 rgba(225, 29, 72, 0.4)' },
                        '50%': { boxShadow: '0 0 0 8px rgba(225, 29, 72, 0)' }
                      }
                    }}
                  >
                    <WarningAmberIcon sx={{ color: (sixTripAlerts.isApplicable && sixTripAlerts.count > 0) ? '#e11d48' : '#94a3b8', fontSize: 26 }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={800} color={(sixTripAlerts.isApplicable && sixTripAlerts.count > 0) ? '#be123c' : '#64748b'} noWrap>
                        SIX TRIP NOT COMPLETE
                      </Typography>
                      <Typography variant="caption" fontWeight={600} color={(sixTripAlerts.isApplicable && sixTripAlerts.count > 0) ? '#e11d48' : '#94a3b8'} noWrap display="block">
                        {sixTripAlerts.isApplicable
                          ? `Vehicles < 6 trips by 25th (${sixTripAlerts.monthShort || month})`
                          : `Evaluation active after 25th (${month})`}
                      </Typography>
                    </Box>
                    <Typography variant="h6" fontWeight={900} color={(sixTripAlerts.isApplicable && sixTripAlerts.count > 0) ? '#881337' : '#64748b'}>
                      {sixTripAlerts.isApplicable ? sixTripAlerts.count : 0}
                    </Typography>
                  </Box>

                </CardContent>
              </Card>
            </Grid>

            {/* ==========================================
                SECTION 5: QUICK ACTIONS
               ========================================== */}
            <Grid item xs={12} sm={6} lg={3}>
              <Typography variant="subtitle2" fontWeight={800} color="text.secondary" mb={1.5} sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                5. Quick Actions
              </Typography>
              <Card sx={{ borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', height: 'calc(100% - 34px)', bgcolor: '#0f172a' }}>
                <CardContent sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>

                  <Button
                    fullWidth variant="contained"
                    startIcon={<PublishIcon />}
                    onClick={onUploadNew}
                    sx={{ py: 1.2, borderRadius: '10px', bgcolor: '#4f46e5', fontWeight: 800, textTransform: 'none', '&:hover': { bgcolor: '#4338ca' } }}
                  >
                    Upload New Invoice
                  </Button>

                  <Button
                    fullWidth variant="contained"
                    startIcon={<PlayCircleOutlineIcon />}
                    onClick={() => alert('Batch Billing module not connected yet.')}
                    sx={{ py: 1.2, borderRadius: '10px', bgcolor: '#059669', fontWeight: 800, textTransform: 'none', '&:hover': { bgcolor: '#047857' } }}
                  >
                    Run Batch Billing
                  </Button>

                  <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

                  <Button
                    fullWidth variant="outlined"
                    startIcon={<AssessmentIcon />}
                    onClick={onOpenCementRegister}
                    sx={{ py: 0.8, borderRadius: '10px', color: '#fff', borderColor: 'rgba(255,255,255,0.3)', fontWeight: 700, textTransform: 'none', '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.05)' } }}
                  >
                    Open Cement Register
                  </Button>

                  <Button
                    fullWidth variant="outlined"
                    startIcon={<DescriptionIcon />}
                    onClick={onOpenPartyPayment}
                    sx={{ py: 0.8, borderRadius: '10px', color: '#fff', borderColor: 'rgba(255,255,255,0.3)', fontWeight: 700, textTransform: 'none', '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.05)' } }}
                  >
                    Open Bill Register
                  </Button>

                  <Button
                    fullWidth variant="outlined"
                    startIcon={<LocalGasStationIcon />}
                    onClick={onOpenPumpPaymentRegister}
                    sx={{ py: 0.8, borderRadius: '10px', color: '#fff', borderColor: 'rgba(255,255,255,0.3)', fontWeight: 700, textTransform: 'none', '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.05)' } }}
                  >
                    Pump Payment Register
                  </Button>

                  <Button
                    fullWidth variant="outlined"
                    startIcon={<LocalShippingIcon />}
                    onClick={() => {
                      setSelectedVehicleDetail(null);
                      setVehicleSummaryModalOpen(true);
                    }}
                    sx={{ py: 0.8, borderRadius: '10px', color: '#38bdf8', borderColor: 'rgba(56,189,248,0.4)', fontWeight: 700, textTransform: 'none', '&:hover': { borderColor: '#38bdf8', bgcolor: 'rgba(56,189,248,0.1)' } }}
                  >
                    Vehicle Trip Summary
                  </Button>

                </CardContent>
              </Card>
            </Grid>

            {/* ==========================================
                SECTION 6: VEHICLE WISE TRIP SUMMARY (RIGHT SIDE OF 5. QUICK ACTIONS)
               ========================================== */}
            <Grid item xs={12} sm={6} lg={3}>
              <Typography variant="subtitle2" fontWeight={800} color="text.secondary" mb={1.5} sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                6. VEHICLE WISE TRIP SUMMARY
              </Typography>
              <Card sx={{
                borderRadius: '16px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                border: '1px solid #e2e8f0',
                height: 'calc(100% - 34px)',
                bgcolor: '#0f172a',
                display: 'flex',
                flexDirection: 'column'
              }}>
                <CardContent sx={{ p: 2.5, display: 'flex', flexDirection: 'column', flex: 1, gap: 1.5 }}>
                  {/* Top KPI Metrics Strip */}
                  <Box sx={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    p: 1.5,
                    bgcolor: 'rgba(255,255,255,0.05)',
                    borderRadius: '10px',
                    border: '1px solid rgba(255,255,255,0.1)'
                  }}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', display: 'block' }}>Vehicles</Typography>
                      <Typography variant="subtitle1" sx={{ color: '#38bdf8', fontWeight: 900 }}>{vehicleTripSummary.length}</Typography>
                    </Box>
                    <Box sx={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.1)', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                      <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', display: 'block' }}>Trips</Typography>
                      <Typography variant="subtitle1" sx={{ color: '#4ade80', fontWeight: 900 }}>{metrics.cementTrips}</Typography>
                    </Box>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', display: 'block' }}>Total MT</Typography>
                      <Typography variant="subtitle1" sx={{ color: '#facc15', fontWeight: 900 }}>{metrics.cementMT}</Typography>
                    </Box>
                  </Box>

                  {/* Search Input */}
                  <TextField
                    size="small"
                    placeholder="Search vehicle number..."
                    value={vehSearchTerm}
                    onChange={(e) => setVehSearchTerm(e.target.value)}
                    InputProps={{
                      startAdornment: <SearchIcon sx={{ color: '#94a3b8', mr: 0.5, fontSize: 18 }} />
                    }}
                    sx={{
                      bgcolor: 'rgba(255,255,255,0.06)',
                      borderRadius: '8px',
                      input: { color: '#ffffff', fontSize: '12px' },
                      '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' },
                      '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.3)' }
                    }}
                  />

                  {/* Scrollable Vehicle List */}
                  <Box sx={{
                    flex: 1,
                    maxHeight: 175,
                    overflowY: 'auto',
                    pr: 0.5,
                    '&::-webkit-scrollbar': { width: '4px' },
                    '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.2)', borderRadius: '4px' }
                  }}>
                    {filteredCardVehicles.length === 0 ? (
                      <Box sx={{ py: 3, textAlign: 'center', color: '#64748b' }}>
                        <Typography variant="caption" fontWeight={600}>No vehicles found</Typography>
                      </Box>
                    ) : (
                      filteredCardVehicles.map((v) => (
                        <Box
                          key={v.vehicleNo}
                          onClick={() => {
                            setSelectedVehicleDetail(v);
                            setVehicleSummaryModalOpen(true);
                          }}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            p: 1,
                            mb: 0.8,
                            borderRadius: '8px',
                            bgcolor: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                            '&:hover': {
                              bgcolor: 'rgba(255,255,255,0.1)',
                              borderColor: 'rgba(56,189,248,0.5)',
                              transform: 'translateX(2px)'
                            }
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <LocalShippingIcon sx={{ fontSize: 18, color: '#38bdf8' }} />
                            <Box>
                              <Typography variant="body2" fontWeight={800} color="#f8fafc" sx={{ fontSize: '12px' }}>
                                {v.vehicleNo}
                              </Typography>
                              <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '10px' }}>
                                {v.totalMT} MT • Adv: ₹{v.totalAdvance.toLocaleString()}
                              </Typography>
                            </Box>
                          </Box>
                          <Chip
                            label={`${v.tripCount} ${v.tripCount === 1 ? 'Trip' : 'Trips'}`}
                            size="small"
                            sx={{
                              fontWeight: 800,
                              fontSize: '11px',
                              height: 22,
                              bgcolor: v.tripCount > 1 ? '#0369a1' : 'rgba(255,255,255,0.1)',
                              color: '#ffffff',
                              border: v.tripCount > 1 ? '1px solid #38bdf8' : 'none'
                            }}
                          />
                        </Box>
                      ))
                    )}
                  </Box>

                  {/* Button to open full Vehicle Wise Summary Dialog */}
                  <Button
                    fullWidth
                    variant="contained"
                    startIcon={<VisibilityIcon />}
                    onClick={() => {
                      if (setMainTab) {
                        setMainTab(2);
                      } else {
                        setSelectedVehicleDetail(null);
                        setVehicleSummaryModalOpen(true);
                      }
                    }}
                    sx={{
                      py: 1.2,
                      borderRadius: '10px',
                      bgcolor: '#0284c7',
                      color: '#ffffff',
                      fontWeight: 800,
                      textTransform: 'none',
                      fontSize: '13px',
                      '&:hover': { bgcolor: '#0369a1' }
                    }}
                  >
                    View Full Trip Summary
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* ==========================================
              SECTION 7: LIVE TRENDS / ANALYTICS
             ========================================== */}
          <Card sx={{ width: '100%', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', mb: 5, bgcolor: 'background.paper', overflow: 'hidden' }}>
            <Box sx={{ bgcolor: 'background.default', px: { xs: 2, md: 4 }, py: 2.5, borderBottom: '1px solid #e2e8f0' }}>
              <Typography variant="subtitle2" fontWeight={800} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                7. Live Trends / Analytics
              </Typography>
            </Box>

            <CardContent sx={{ p: { xs: 2, md: 4 } }}>
              <Grid container spacing={4}>

                {/* DAILY / OPERATIONAL TRENDS */}
                <Grid item xs={12}>
                  <Typography variant="subtitle1" fontWeight={800} color="#0f172a" mb={2}>
                    DAILY / OPERATIONAL TRENDS
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={6} md={4} lg={2}>
                      <Paper elevation={0} sx={{ p: 2, border: '1px solid #e2e8f0', borderRadius: '8px', bgcolor: 'background.default' }}>
                        <Typography variant="body2" color="text.secondary" fontWeight={700}>Total Lifting</Typography>
                        <Typography variant="h6" fontWeight={800} color="#0f172a">{metrics.cementMT} MT</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={6} md={4} lg={2}>
                      <Paper elevation={0} sx={{ p: 2, border: '1px solid #e2e8f0', borderRadius: '8px', bgcolor: 'background.default' }}>
                        <Typography variant="body2" color="text.secondary" fontWeight={700}>Total L/A Given</Typography>
                        <Typography variant="h6" fontWeight={800} color="#ef4444">₹{metrics.loadingAdvanceAmt.toLocaleString()}</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={6} md={4} lg={2}>
                      <Paper elevation={0} sx={{ p: 2, border: '1px solid #e2e8f0', borderRadius: '8px', bgcolor: 'background.default' }}>
                        <Typography variant="body2" color="text.secondary" fontWeight={700}>Cash Opening</Typography>
                        <Typography variant="h6" fontWeight={800} color="#0f172a">₹{metrics.cashOpeningBalance.toLocaleString()}</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={6} md={4} lg={2}>
                      <Paper elevation={0} sx={{ p: 2, border: '1px solid #e2e8f0', borderRadius: '8px', bgcolor: 'background.default' }}>
                        <Typography variant="body2" color="text.secondary" fontWeight={700}>Total Expense</Typography>
                        <Typography variant="h6" fontWeight={800} color="#f59e0b">₹{metrics.miscExpenses.toLocaleString()}</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={6} md={4} lg={2}>
                      <Paper elevation={0} sx={{ p: 2, border: '1px solid #e2e8f0', borderRadius: '8px', bgcolor: 'background.default' }}>
                        <Typography variant="body2" color="text.secondary" fontWeight={700}>Cash Closing</Typography>
                        <Typography variant="h6" fontWeight={800} color={metrics.closingAdvanceBalance >= 0 ? '#10b981' : '#ef4444'}>₹{metrics.closingAdvanceBalance.toLocaleString()}</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={6} md={4} lg={2}>
                      <Paper elevation={0} sx={{ p: 2, border: '1px solid #e2e8f0', borderRadius: '8px', bgcolor: 'background.default' }}>
                        <Typography variant="body2" color="text.secondary" fontWeight={700}>Total Fuel Issued</Typography>
                        <Typography variant="h6" fontWeight={800} color="#3b82f6">{metrics.fuelLtr} LTR</Typography>
                      </Paper>
                    </Grid>
                  </Grid>
                </Grid>

                {/* MONTHLY / YEARLY PERFORMANCE */}
                <Grid item xs={12}>
                  <Box sx={{ p: 4, borderRadius: '16px', border: '1px solid #e2e8f0', bgcolor: 'background.paper', display: 'flex', flexDirection: 'column', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
                    <Typography variant="h5" fontWeight={800} color="#0f172a" mb={1} align="center">
                      MONTHLY / YEARLY PERFORMANCE
                    </Typography>
                    <Typography variant="subtitle2" fontWeight={700} color="text.secondary" mb={4} align="center">
                      Revenue & Tonnage Trends
                    </Typography>

                    {performanceAnalytics.chartData.length === 0 ? (
                      <Box display="flex" flex={1} alignItems="center" justifyContent="center" minHeight={450}>
                        <Typography variant="body1" color="text.secondary" fontWeight={600}>No data for selected period</Typography>
                      </Box>
                    ) : (
                      <Box sx={{ width: '100%', height: 450 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={performanceAnalytics.chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis
                              dataKey="name"
                              axisLine={false}
                              tickLine={false}
                              tick={{ fill: '#64748b', fontSize: 13, fontWeight: 700 }}
                              dy={10}
                            />
                            {/* Primary Y-Axis for REVENUE */}
                            <YAxis
                              yAxisId="left"
                              orientation="left"
                              axisLine={false}
                              tickLine={false}
                              tick={{ fill: '#4f46e5', fontSize: 13, fontWeight: 700 }}
                              tickFormatter={(value) => `₹${value >= 1000 ? (value / 1000).toFixed(0) + 'k' : value}`}
                            />
                            {/* Secondary Y-Axis for TONNAGE */}
                            <YAxis
                              yAxisId="right"
                              orientation="right"
                              axisLine={false}
                              tickLine={false}
                              tick={{ fill: '#10b981', fontSize: 13, fontWeight: 700 }}
                              tickFormatter={(value) => `${value} MT`}
                            />
                            <RechartsTooltip
                              cursor={{ fill: '#f8fafc' }}
                              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', fontWeight: 700, padding: '12px 16px' }}
                              formatter={(value, name) => {
                                if (name === 'Revenue') return [`₹${value.toLocaleString()}`, 'Revenue'];
                                if (name === 'Tonnage') return [`${value} MT`, 'Tonnage'];
                                return [value, name];
                              }}
                              labelStyle={{ color: '#0f172a', fontWeight: 800, marginBottom: '8px' }}
                            />
                            <Legend verticalAlign="bottom" height={40} iconType="circle" wrapperStyle={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }} />

                            {/* Revenue as the primary visual (Bars) */}
                            <Bar yAxisId="left" dataKey="revenue" name="Revenue" fill="#4f46e5" radius={[6, 6, 0, 0]} maxBarSize={60} />

                            {/* Tonnage as the secondary visual (Line) */}
                            <Line yAxisId="right" type="monotone" dataKey="tonnage" name="Tonnage" stroke="#10b981" strokeWidth={4} dot={{ r: 5, strokeWidth: 2 }} activeDot={{ r: 7 }} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </Box>
                    )}
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>


          {/* --- Detail Sections (Registers) --- */}
          <Paper sx={{ borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
            <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', px: 3, py: 2 }}>
              <Typography variant="h6" fontWeight={850} color="#0f172a">
                Cement Loading (DB)
              </Typography>
            </Box>

            <Box p={3} bgcolor="#fff">
              <Typography variant="subtitle1" fontWeight={800} color="#475569" mb={2}>Cement Loading Register</Typography>
              {!data?.cement?.length ? (
                <Typography color="text.secondary">No cement entries loaded on this date.</Typography>
              ) : (
                <TableContainer component={Paper} sx={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: 'none', overflowX: 'auto' }}>
                  <Table size="small" sx={{ minWidth: 1600 }}>
                    <TableHead sx={{ bgcolor: 'background.default' }}>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', whiteSpace: 'nowrap' }}>GCN NO</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', whiteSpace: 'nowrap' }}>BILL NO</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', whiteSpace: 'nowrap' }}>INVOICE NO</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', whiteSpace: 'nowrap' }}>SITE</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', whiteSpace: 'nowrap' }}>BILLING RATE</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', whiteSpace: 'nowrap' }}>QTY (MT)</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', whiteSpace: 'nowrap' }}>AMOUNT</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', whiteSpace: 'nowrap' }}>LOADING ADVANCE</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', whiteSpace: 'nowrap' }}>VEHICLE NO</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', whiteSpace: 'nowrap' }}>HSD SLIP NUMBER</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', whiteSpace: 'nowrap' }}>QTY (LTR)</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', whiteSpace: 'nowrap' }}>DESTINATION</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', whiteSpace: 'nowrap' }}>PARTY NAME</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', whiteSpace: 'nowrap' }}>BILLING AMOUNT</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', whiteSpace: 'nowrap' }}>E-WAY BILL NO</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', whiteSpace: 'nowrap' }}>E-WAY BILL VALIDITY</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', whiteSpace: 'nowrap' }}>E-WAY BILL STATUS</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.cement.map((e, idx) => {
                        const ewayInfo = getEWayBillStatus(e);
                        return (
                          <TableRow key={idx} hover>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{e["GCN NO"] || "-"}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{e["BILL NO"] || "-"}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{e["INVOICE NO"] || e["INVOICE NO."] || "-"}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{e["SITE"] || "-"}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{parseNum(e["BILLING"]) ? `₹${parseNum(e["BILLING"]).toLocaleString()}` : "-"}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{e["MT"] || "-"}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>
                              {e["AMOUNT"] !== undefined && e["AMOUNT"] !== null && e["AMOUNT"] !== ""
                                ? (typeof e["AMOUNT"] === "number" ? `₹${e["AMOUNT"].toLocaleString()}` : (String(e["AMOUNT"]).startsWith("₹") ? e["AMOUNT"] : `₹${parseNum(e["AMOUNT"]).toLocaleString()}`))
                                : "-"}
                            </TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>
                              {(e["ADVANCE"] || e["LOADING ADVANCE"]) ? `₹${parseNum(e["ADVANCE"] || e["LOADING ADVANCE"]).toLocaleString()}` : "-"}
                            </TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{e["VEHICLE NUMBER"] || e["VEHICLE NO"] || e["VEHICLE NO."] || "-"}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{e["HSD SLIP NO"] || e["HSD SLIP NUMBER"] || "-"}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>
                              {(e["HSD (LTR)"] || e["QTY (LTR)"]) ? parseNum(e["HSD (LTR)"] || e["QTY (LTR)"]).toLocaleString() : "-"}
                            </TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{e["DESTINATION"] || "-"}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{e["PARTY NAME"] || "-"}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>
                              {(e["Billing Amount"] || e["BILLING AMOUNT"]) ? `₹${parseNum(e["Billing Amount"] || e["BILLING AMOUNT"]).toLocaleString()}` : "-"}
                            </TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{e["E-WAY BILL NO"] || e["E-WAY BILL NUMBER"] || "-"}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{e["E-WAY BILL VALIDITY"] || e["E-WAY BILL VALIDITY DATE"] || "-"}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>
                              <Box
                                sx={{
                                  px: 1.5, py: 0.5, borderRadius: '20px', display: 'inline-block', fontSize: '0.75rem', fontWeight: 800,
                                  bgcolor: ewayInfo.bgColor, color: ewayInfo.color, border: `1px solid ${ewayInfo.borderColor}`,
                                  animation: ewayInfo.isBlinking ? 'pulseChipRed 1.5s infinite ease-in-out' : 'none',
                                  '@keyframes pulseChipRed': {
                                    '0%, 100%': { opacity: 1, transform: 'scale(1)' },
                                    '50%': { opacity: 0.7, transform: 'scale(1.03)' }
                                  }
                                }}
                              >
                                {ewayInfo.label}
                              </Box>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>
          </Paper>
        </Box>
      )}

      {/* --- Bill Breakdown Modal --- */}
      <Dialog
        open={billBreakdownOpen}
        onClose={() => setBillBreakdownOpen(false)}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: { borderRadius: '24px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', minHeight: '60vh' }
        }}
      >
        <DialogTitle sx={{ p: 3, bgcolor: 'background.default', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box display="flex" alignItems="center" gap={1.5}>
            <span style={{ fontSize: '24px' }}>📋</span>
            <Typography variant="h6" fontWeight={800} color="#0f172a">
              Total Bill Breakdown
            </Typography>
          </Box>
          <IconButton onClick={() => setBillBreakdownOpen(false)} sx={{ bgcolor: 'background.default', '&:hover': { bgcolor: '#e2e8f0' } }}>
            ✕
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', px: 3, pt: 2 }}>
            <Tabs
              value={billTabValue}
              onChange={(e, v) => setBillTabValue(v)}
              TabIndicatorProps={{ style: { backgroundColor: '#4f46e5', height: 3, borderRadius: '3px 3px 0 0' } }}
            >
              <Tab
                label={
                  <Box>
                    <Typography fontWeight={700}>Pending Challan</Typography>
                    <Typography variant="caption" color="text.secondary">{billBreakdown.pending.length} Bills | ₹{billBreakdown.pendingAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Typography>
                  </Box>
                }
              />
              <Tab
                label={
                  <Box>
                    <Typography fontWeight={700}>Non-Stamp</Typography>
                    <Typography variant="caption" color="text.secondary">{billBreakdown.nonStamp.length} Bills | ₹{billBreakdown.nonStampAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Typography>
                  </Box>
                }
              />
              <Tab
                label={
                  <Box>
                    <Typography fontWeight={700}>Stamp</Typography>
                    <Typography variant="caption" color="text.secondary">{billBreakdown.stamp.length} Bills | ₹{billBreakdown.stampAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Typography>
                  </Box>
                }
              />
            </Tabs>
          </Box>

          <Box sx={{ p: 3, bgcolor: '#fafafa', minHeight: '400px' }}>
            <TableContainer component={Paper} sx={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: 'none', maxHeight: '500px', overflowY: 'auto' }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 800, bgcolor: 'background.default', color: '#475569' }}>Bill Number</TableCell>
                    <TableCell sx={{ fontWeight: 800, bgcolor: 'background.default', color: '#475569' }}>Invoice Number</TableCell>
                    {billTabValue === 0 && <TableCell sx={{ fontWeight: 800, bgcolor: 'background.default', color: '#475569' }}>Invoice Date</TableCell>}
                    <TableCell sx={{ fontWeight: 800, bgcolor: 'background.default', color: '#475569' }}>Vehicle Number</TableCell>
                    {billTabValue === 0 && <TableCell sx={{ fontWeight: 800, bgcolor: 'background.default', color: '#475569' }}>Party Name</TableCell>}
                    <TableCell sx={{ fontWeight: 800, bgcolor: 'background.default', color: '#475569' }}>Bill Amount</TableCell>
                    <TableCell sx={{ fontWeight: 800, bgcolor: 'background.default', color: '#475569' }}>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(() => {
                    const activeList = billTabValue === 0 ? billBreakdown.pending : billTabValue === 1 ? billBreakdown.nonStamp : billBreakdown.stamp;
                    if (activeList.length === 0) {
                      return (
                        <TableRow>
                          <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                            <Typography color="text.secondary" fontStyle="italic">No bills found in this category.</Typography>
                          </TableCell>
                        </TableRow>
                      );
                    }
                    return activeList.map((row, idx) => (
                      <TableRow key={idx} hover>
                        <TableCell>{row["BILL NO"] || "-"}</TableCell>
                        <TableCell>{row["INVOICE NO"] || "-"}</TableCell>
                        {billTabValue === 0 && <TableCell>{row["RECEIVING DATE"] || row["BILL DATE"] || row["LOADING DT"] || "-"}</TableCell>}
                        <TableCell>{row["VEHICLE NUMBER"] || row["VEHICLE NO"] || "-"}</TableCell>
                        {billTabValue === 0 && <TableCell>{row["PARTY NAME"] || "-"}</TableCell>}
                        <TableCell fontWeight={600}>₹{parseNum(row["Billing Amount"] || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell>
                          <Box sx={{
                            px: 1.5, py: 0.5, borderRadius: '20px', display: 'inline-block', fontSize: '0.75rem', fontWeight: 800,
                            bgcolor: billTabValue === 0 ? '#fffbeb' : billTabValue === 1 ? '#fef2f2' : '#ecfdf5',
                            color: billTabValue === 0 ? '#b45309' : billTabValue === 1 ? '#b91c1c' : '#047857',
                            border: `1px solid ${billTabValue === 0 ? '#fcd34d' : billTabValue === 1 ? '#fca5a5' : '#6ee7b7'}`
                          }}>
                            {billTabValue === 0 ? 'Pending' : billTabValue === 1 ? 'Non-Stamp' : 'Stamp'}
                          </Box>
                        </TableCell>
                      </TableRow>
                    ));
                  })()}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </DialogContent>
      </Dialog>

      {/* --- Dynamic Alert Detail Dialog --- */}
      <Dialog open={alertModalOpen} onClose={() => { setAlertModalOpen(false); setEWayAlertsSearchTerm(''); }} maxWidth="xl" fullWidth PaperProps={{ sx: { borderRadius: '16px', bgcolor: 'background.default' } }}>
        <DialogTitle sx={{ bgcolor: 'background.paper', borderBottom: alertModalTitle === 'STAMP BUT NON-BILLED' ? 'none' : '1px solid #e2e8f0', px: 3, py: 2.5 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6" fontWeight={800} color="#0f172a">
              {alertModalTitle}
            </Typography>
            <Box display="flex" alignItems="center" gap={1.5}>
              {alertModalTitle.startsWith('SIX TRIP NOT COMPLETE') && (
                <>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<DownloadIcon />}
                    onClick={handleExportSixTripExcel}
                    sx={{
                      bgcolor: '#ffffff',
                      color: '#0f172a',
                      fontWeight: 700,
                      borderRadius: '8px',
                      px: 2,
                      py: 0.75,
                      textTransform: 'none',
                      border: '1px solid #cbd5e1',
                      '&:hover': { bgcolor: '#f1f5f9' }
                    }}
                  >
                    Export Excel
                  </Button>
                  <Chip
                    label={`Cutoff: ${sixTripAlerts.evaluationPeriod || 'Day 1 to 25'}`}
                    sx={{ bgcolor: '#fee2e2', color: '#991b1b', fontWeight: 800, borderRadius: '8px' }}
                  />
                </>
              )}
              {alertModalTitle === 'VEHICLE NOT LOADED' && (
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<DownloadIcon />}
                  onClick={handleExportVehicleNotLoadedExcel}
                  sx={{
                    bgcolor: '#ffffff',
                    color: '#0f172a',
                    fontWeight: 700,
                    borderRadius: '8px',
                    px: 2,
                    py: 0.75,
                    textTransform: 'none',
                    border: '1px solid #cbd5e1',
                    '&:hover': { bgcolor: '#f1f5f9' }
                  }}
                >
                  Export Excel
                </Button>
              )}
              {alertModalTitle === 'E-WAY BILL VALIDITY ALERTS' && (
                <Box display="flex" alignItems="center" gap={1.2}>
                  <TextField
                    size="small"
                    placeholder="Search E-Way Bill No..."
                    value={eWayAlertsSearchTerm}
                    onChange={(e) => setEWayAlertsSearchTerm(e.target.value)}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon sx={{ color: '#64748b', fontSize: '1.1rem' }} />
                        </InputAdornment>
                      ),
                      endAdornment: eWayAlertsSearchTerm ? (
                        <InputAdornment position="end">
                          <IconButton
                            size="small"
                            onClick={() => setEWayAlertsSearchTerm('')}
                            sx={{ p: 0.2 }}
                          >
                            <ClearIcon sx={{ fontSize: '0.95rem' }} />
                          </IconButton>
                        </InputAdornment>
                      ) : null
                    }}
                    sx={{
                      width: { xs: 180, sm: 240 },
                      bgcolor: '#ffffff',
                      borderRadius: '8px',
                      '& .MuiOutlinedInput-root': {
                        borderRadius: '8px',
                        fontSize: '0.82rem',
                        '& fieldset': { borderColor: '#cbd5e1' },
                        '&:hover fieldset': { borderColor: '#94a3b8' },
                        '&.Mui-focused fieldset': { borderColor: '#2563eb' }
                      },
                      '& .MuiInputBase-input': {
                        py: '6.5px'
                      }
                    }}
                  />
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<LocalShippingIcon />}
                    onClick={() => setUnloadingStatusOpen(true)}
                    sx={{
                      bgcolor: '#ffffff',
                      color: '#0f172a',
                      fontWeight: 700,
                      borderRadius: '8px',
                      px: 2,
                      py: 0.75,
                      textTransform: 'none',
                      border: '1px solid #cbd5e1',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                      '&:hover': { bgcolor: '#f1f5f9', borderColor: '#94a3b8' }
                    }}
                  >
                    UNLOADING STATUS
                  </Button>
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<AccessTimeIcon />}
                    onClick={handleOpenExtensionDialog}
                    sx={{
                      bgcolor: '#2563eb',
                      color: '#ffffff',
                      fontWeight: 700,
                      borderRadius: '8px',
                      px: 2,
                      py: 0.75,
                      textTransform: 'none',
                      boxShadow: '0 2px 4px rgba(37, 99, 235, 0.25)',
                      '&:hover': { bgcolor: '#1d4ed8' }
                    }}
                  >
                    EXTEND E-WAY BILL VALIDITY
                  </Button>
                </Box>
              )}
              {['PENDING CHALLAN DETAILS', 'STAMP BILL DETAILS', 'NON-STAMP BILL DETAILS', 'STAMP BUT NON-BILLED'].includes(alertModalTitle) && (
                <Chip
                  label={`Total: ₹${alertModalData.reduce((sum, r) => sum + parseNum(r["Billing Amount"] ?? r["BILLING AMOUNT"] ?? r["AMOUNT"]), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  sx={{ bgcolor: '#dcfce7', color: '#15803d', fontWeight: 800, borderRadius: '8px' }}
                />
              )}
              <Chip label={`${displayedAlertModalData.length} Records`} sx={{ bgcolor: '#e0e7ff', color: '#4338ca', fontWeight: 800, borderRadius: '8px' }} />
            </Box>
          </Box>
        </DialogTitle>

        {alertModalTitle === 'STAMP BUT NON-BILLED' && (
          <Box sx={{ px: 3, pb: 1.5, bgcolor: 'background.paper', borderBottom: '1px solid #e2e8f0' }}>
            <Tabs
              value={stampNonBilledTab}
              onChange={(e, val) => {
                setStampNonBilledTab(val);
                if (val === 1) setAlertModalData(stampNonBilledAlerts.freight);
                else if (val === 2) setAlertModalData(stampNonBilledAlerts.unloading);
                else setAlertModalData(stampNonBilledAlerts.all);
              }}
              sx={{
                minHeight: '38px',
                '& .MuiTab-root': {
                  textTransform: 'none',
                  fontWeight: 800,
                  fontSize: '0.82rem',
                  minHeight: '38px',
                  py: 0.5,
                  px: 2.5,
                  mr: 1.5,
                  borderRadius: '8px',
                  color: '#64748b',
                  bgcolor: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  transition: 'all 0.2s',
                  '&:hover': { bgcolor: '#e2e8f0', color: '#0f172a' }
                },
                '& .Mui-selected': {
                  bgcolor: '#0f172a !important',
                  color: '#ffffff !important',
                  borderColor: '#0f172a !important',
                  boxShadow: '0 2px 8px rgba(15,23,42,0.2)'
                }
              }}
              TabIndicatorProps={{ style: { display: 'none' } }}
            >
              <Tab label={`ALL (${stampNonBilledAlerts.all.length})`} />
              <Tab label={`FREIGHT (${stampNonBilledAlerts.freight.length})`} />
              <Tab label={`UNLOADING (${stampNonBilledAlerts.unloading.length})`} />
            </Tabs>
          </Box>
        )}

        <DialogContent sx={{ p: 2.5, bgcolor: '#f8fafc' }}>
          {(() => {
            const isStampNonBilled = alertModalTitle === 'STAMP BUT NON-BILLED';
            const isStampOrNonStamp = alertModalTitle === 'STAMP BILL DETAILS' || alertModalTitle === 'NON-STAMP BILL DETAILS';
            const isSixTrip = alertModalTitle.startsWith('SIX TRIP NOT COMPLETE');
            const isVehicleNotLoaded = alertModalTitle === 'VEHICLE NOT LOADED';
            return (
              <TableContainer
                component={Paper}
                sx={{
                  borderRadius: '12px',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)',
                  border: '1px solid #e2e8f0',
                  overflowX: 'auto',
                  maxHeight: '65vh'
                }}
              >
                <Table stickyHeader size="small" sx={{ minWidth: (isSixTrip || isVehicleNotLoaded) ? 1000 : (alertModalTitle === 'VALIDITY END' ? 1000 : (isStampNonBilled ? 1700 : (isStampOrNonStamp ? 1500 : 1400))) }}>
                  <TableHead>
                    {isSixTrip ? (
                      <TableRow>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', py: 1.5, bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>SL NO</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>VEHICLE NUMBER</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>OWNER</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>MONTH</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>TRIP COUNT (DAY 1–25)</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>REQUIRED TRIPS</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>SHORTFALL</TableCell>
                      </TableRow>
                    ) : isVehicleNotLoaded ? (
                      <TableRow>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', py: 1.5, bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>SL NO</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>VEHICLE NUMBER</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>OWNER</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>LAST UNLOADING DATE</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>WAITING PERIOD END DATE</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>TODAY</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap', textAlign: 'center' }}>DAYS SINCE ELIGIBLE</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>LAST INVOICE / LOADING DATE</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap', textAlign: 'center' }}>STATUS</TableCell>
                      </TableRow>
                    ) : alertModalTitle === 'E-WAY BILL VALIDITY ALERTS' ? (
                      <TableRow>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', py: 1.5, bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>SL</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>INVOICE DATE</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>INVOICE NO</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>E-WAY BILL NO</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>E-WAY BILL VALIDITY</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>UNLOADING DATE / STATUS</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>VEHICLE NO</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>SITE</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>DESTINATION</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>PARTY NAME</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>STATUS</TableCell>
                      </TableRow>
                    ) : alertModalTitle === 'VALIDITY END' ? (
                      <TableRow>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', py: 1.5, bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>SL</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>VEHICLE NO</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>OWNER NAME</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>VALIDITY TYPE</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>EXPIRY DATE</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>DAYS REMAINING</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>STATUS</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap', textAlign: 'center' }}>ACTION</TableCell>
                      </TableRow>
                    ) : isStampNonBilled ? (
                      <TableRow>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', py: 1.5, bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>SL NO</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>LOADING DATE</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>RECEIVING DATE</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>SITE</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>VEHICLE NUMBER</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>INVOICE NO</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>SHIPMENT NO</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>CHALLAN STATUS</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>DESTINATION</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>PARTY NAME</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>MT</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>BILLING AMOUNT</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>FREIGHT BILL NO</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>UNLOADING BILL NO</TableCell>
                      </TableRow>
                    ) : isStampOrNonStamp ? (
                      <TableRow>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', py: 1.5, bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>SL NO</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>LOADING DATE</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>RECEIVING DATE</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>SITE</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>VEHICLE NUMBER</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>INVOICE NO</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>SHIPMENT NO</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>CHALLAN STATUS</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>DESTINATION</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>PARTY NAME</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>MT</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>BILLING AMOUNT</TableCell>
                      </TableRow>
                    ) : (
                      <TableRow>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', py: 1.5, bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>SL NO</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>LOADING DATE</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>SITE</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>VEHICLE NUMBER</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>INVOICE NO</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>SHIPMENT NO</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>CHALLAN STATUS</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>DESTINATION</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>PARTY NAME</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>MT</TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9', whiteSpace: 'nowrap' }}>BILLING AMOUNT</TableCell>
                      </TableRow>
                    )}
                  </TableHead>
                  <TableBody>
                    {displayedAlertModalData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={isSixTrip ? 7 : (isVehicleNotLoaded ? 9 : (alertModalTitle === 'E-WAY BILL VALIDITY ALERTS' ? 11 : alertModalTitle === 'VALIDITY END' ? 8 : (isStampNonBilled ? 14 : (isStampOrNonStamp ? 12 : 11))))} align="center" sx={{ py: 4, color: '#64748b', fontWeight: 600 }}>
                          No records found.
                        </TableCell>
                      </TableRow>
                    ) : isSixTrip ? (
                      alertModalData.map((row, idx) => (
                        <TableRow key={row.vehicleNo || idx} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                          <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 700, color: '#64748b' }}>{row.slNo || idx + 1}</TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 800, color: '#0f172a' }}>{row.vehicleNo}</TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 700, color: '#334155' }}>{row.ownerName || '-'}</TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>
                            <Chip
                              size="small"
                              label={row.month || row.monthFullName || '-'}
                              sx={{ bgcolor: '#f1f5f9', color: '#475569', fontWeight: 700, fontSize: '0.75rem' }}
                            />
                          </TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 800, color: row.tripCount === 0 ? '#dc2626' : '#d97706' }}>
                            {row.tripCount}
                          </TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 800, color: '#16a34a' }}>
                            {row.requiredTrips || 6}
                          </TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>
                            <Chip
                              size="small"
                              label={`-${row.shortfall}`}
                              sx={{
                                fontWeight: 900,
                                fontSize: '0.75rem',
                                bgcolor: '#fee2e2',
                                color: '#b91c1c',
                                border: '1px solid #fca5a5'
                              }}
                            />
                          </TableCell>
                        </TableRow>
                      ))
                    ) : isVehicleNotLoaded ? (
                      alertModalData.map((row, idx) => (
                        <TableRow key={row.vehicleNo || idx} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                          <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 700, color: '#64748b' }}>{row.slNo || idx + 1}</TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 800, color: '#0f172a' }}>{row.vehicleNo}</TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 700, color: '#334155' }}>{row.ownerName || '—'}</TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 700, color: '#047857' }}>{row.lastUnloadingDate || '—'}</TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 700, color: '#d97706' }}>{row.waitingPeriodEndDate || '—'}</TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 600, color: '#475569' }}>{row.today || '—'}</TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap', textAlign: 'center' }}>
                            <Chip
                              size="small"
                              label={`${row.daysSinceEligible} ${row.daysSinceEligible === 1 ? 'day' : 'days'}`}
                              sx={{
                                fontWeight: 900,
                                fontSize: '0.75rem',
                                bgcolor: '#fee2e2',
                                color: '#b91c1c',
                                border: '1px solid #fca5a5'
                              }}
                            />
                          </TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 600, color: '#64748b' }}>{row.lastInvoiceLoadingDate || '—'}</TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap', textAlign: 'center' }}>
                            <Chip
                              size="small"
                              label={row.status || 'NOT LOADED'}
                              sx={{
                                fontWeight: 800,
                                fontSize: '0.75rem',
                                bgcolor: '#ffe4e6',
                                color: '#be123c',
                                border: '1px solid #fecdd3'
                              }}
                            />
                          </TableCell>
                        </TableRow>
                      ))
                    ) : alertModalTitle === 'E-WAY BILL VALIDITY ALERTS' ? (
                      displayedAlertModalData.map((row, idx) => {
                        const info = getEWayBillStatus(row);
                        return (
                          <TableRow key={idx} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{idx + 1}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{row["LOADING DT"] || row["LOADING DATE"] || row["BILL DATE"] || "-"}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{row["INVOICE NO"] || row["INVOICE NO."] || "-"}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{row["E-WAY BILL NO"] || row["E-WAY BILL NUMBER"] || "-"}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>
                              <Box display="flex" flexDirection="column" gap={0.5}>
                                <Box display="flex" alignItems="center" gap={1}>
                                  <Typography variant="body2" fontWeight={800} color={info.isExtended ? '#2563eb' : '#dc2626'}>
                                    {info.effectiveValidity}
                                  </Typography>
                                  {info.isExtended && (
                                    <Chip
                                      size="small"
                                      label="EXTENDED"
                                      sx={{
                                        bgcolor: '#e0e7ff',
                                        color: '#4338ca',
                                        fontWeight: 800,
                                        fontSize: '0.65rem',
                                        height: '20px'
                                      }}
                                    />
                                  )}
                                </Box>
                                {info.isExtended && (
                                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
                                    Original: {info.originalValidity}
                                  </Typography>
                                )}
                              </Box>
                            </TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{row["UNLOADING STATUS"] || row["RECEIVING DATE"] || row["UNLOADING DATE"] || "-"}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 700, color: '#0f172a' }}>{row["VEHICLE NUMBER"] || row["VEHICLE NO"] || row["VEHICLE NO."] || "-"}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{row["SITE"] || "-"}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{row["DESTINATION"] || "-"}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{row["PARTY NAME"] || "-"}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>
                              <Box
                                sx={{
                                  px: 1.5, py: 0.5, borderRadius: '20px', display: 'inline-block', fontSize: '0.75rem', fontWeight: 800,
                                  bgcolor: info.bgColor, color: info.color, border: `1px solid ${info.borderColor}`,
                                  animation: info.isBlinking ? 'pulseModalChipRed 1.5s infinite ease-in-out' : 'none',
                                  '@keyframes pulseModalChipRed': {
                                    '0%, 100%': { opacity: 1, transform: 'scale(1)' },
                                    '50%': { opacity: 0.7, transform: 'scale(1.03)' }
                                  }
                                }}
                              >
                                {info.label}
                              </Box>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    ) : alertModalTitle === 'VALIDITY END' ? (
                      alertModalData.map((row, idx) => {
                        return (
                          <TableRow key={row.id || idx} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                            <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 700, color: '#64748b' }}>{idx + 1}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 800, color: '#0f172a' }}>{row.truckNo}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 700, color: '#334155' }}>{row.ownerName}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>
                              <Chip
                                size="small"
                                label={row.validityType}
                                sx={{ bgcolor: '#e0f2fe', color: '#0369a1', fontWeight: 800, fontSize: '0.75rem' }}
                              />
                            </TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 700, color: '#d97706' }}>
                              {row.expiryDateFormatted}
                            </TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 700, color: '#0284c7' }}>
                              {row.statusLabel}
                            </TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>
                              <Chip
                                size="small"
                                label="EXPIRING SOON"
                                sx={{
                                  fontWeight: 800,
                                  fontSize: '0.7rem',
                                  bgcolor: '#fffbe6',
                                  color: '#b45309',
                                  border: '1px solid #fef08a'
                                }}
                              />
                            </TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap', textAlign: 'center' }}>
                              <Button
                                size="small"
                                variant="contained"
                                onClick={() => {
                                  setExtendValidityItem(row);
                                  setExtendValidityDate(formatDateToYYYYMMDD(row.expiryDateFormatted));
                                }}
                                sx={{
                                  bgcolor: '#059669',
                                  color: '#ffffff',
                                  fontWeight: 800,
                                  fontSize: '0.75rem',
                                  px: 2,
                                  py: 0.5,
                                  borderRadius: '6px',
                                  textTransform: 'none',
                                  '&:hover': { bgcolor: '#047857' }
                                }}
                              >
                                EXTEND
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    ) : (
                      alertModalData.map((row, idx) => {
                        const status = String(row["CHALLAN STATUS"] || (alertModalTitle === 'STAMP BILL DETAILS' || isStampNonBilled ? 'STAMP' : alertModalTitle === 'NON-STAMP BILL DETAILS' ? 'NON STAMP' : 'Pending')).trim();
                        const statusUpper = status.toUpperCase();
                        const isStamp = statusUpper === 'STAMP';
                        const isNonStamp = statusUpper.includes('NON-STAMP') || statusUpper.includes('NON STAMP');
                        const chipBg = isStamp ? '#dcfce7' : isNonStamp ? '#fee2e2' : '#fffbeb';
                        const chipColor = isStamp ? '#15803d' : isNonStamp ? '#b91c1c' : '#b45309';
                        const chipBorder = isStamp ? '#86efac' : isNonStamp ? '#fca5a5' : '#fcd34d';

                        const rawAmt = row["Billing Amount"] ?? row["BILLING AMOUNT"] ?? row["AMOUNT"];
                        const formattedAmt = (rawAmt !== undefined && rawAmt !== null && rawAmt !== '')
                          ? `₹${parseNum(rawAmt).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : '-';

                        const recvDate = row["RECEIVING DATE"] || row["Receiving Date"] || row["RECV DATE"] || "-";

                        const freightBillNo = String(row["BILL NO"] || row["BILL NUMBER"] || row["FREIGHT BILL NO"] || row["Freight Bill No"] || row.freightBillNo || '').trim();
                        const hasFreight = freightBillNo !== '' && freightBillNo !== '-' && freightBillNo.toLowerCase() !== 'null' && freightBillNo.toLowerCase() !== 'undefined';

                        const unloadingBillNo = String(row["UNLOADING BILL NO"] || row["UNLOADING BILL NUMBER"] || row["Unloading Bill No"] || row.unloadingBillNo || '').trim();
                        const hasUnloading = unloadingBillNo !== '' && unloadingBillNo !== '-' && unloadingBillNo.toLowerCase() !== 'null' && unloadingBillNo.toLowerCase() !== 'undefined';

                        return (
                          <TableRow key={row.id || row._id || idx} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                            <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 700, color: '#64748b' }}>{idx + 1}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{row["LOADING DT"] || row["LOADING DATE"] || row["BILL DATE"] || row["DATE"] || "-"}</TableCell>
                            {(isStampOrNonStamp || isStampNonBilled) && (
                              <TableCell sx={{ whiteSpace: 'nowrap' }}>{recvDate}</TableCell>
                            )}
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{row["SITE"] || row["Site"] || "-"}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 700, color: '#0f172a' }}>{row["VEHICLE NUMBER"] || row["VEHICLE NO"] || row["VEHICLE NO."] || "-"}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{row["INVOICE NO"] || row["INVOICE NO."] || row["Invoice No"] || "-"}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{row["SHIPMENT NO"] || row["SHIPMENT NO."] || row["Shipment No"] || row["GCN NO"] || "-"}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>
                              <Chip
                                size="small"
                                label={status}
                                sx={{
                                  bgcolor: chipBg,
                                  color: chipColor,
                                  border: `1px solid ${chipBorder}`,
                                  fontWeight: 800,
                                  fontSize: '0.72rem'
                                }}
                              />
                            </TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{row["DESTINATION"] || row["Destination"] || "-"}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{row["PARTY NAME"] || row["Party Name"] || row["PARTY"] || "-"}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{row["MT"] !== undefined && row["MT"] !== null && row["MT"] !== "" ? row["MT"] : (row["QTY (MT)"] || row["QTY"] || "-")}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 700, color: '#0f172a' }}>{formattedAmt}</TableCell>
                            {isStampNonBilled && (
                              <>
                                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                                  {hasFreight ? (
                                    <Chip size="small" label={freightBillNo} sx={{ bgcolor: '#dbeafe', color: '#1e40af', fontWeight: 800, fontSize: '0.72rem' }} />
                                  ) : (
                                    <Typography variant="caption" sx={{ color: '#dc2626', fontWeight: 800, bgcolor: '#fee2e2', px: 1, py: 0.3, borderRadius: '4px', display: 'inline-block' }}>PENDING</Typography>
                                  )}
                                </TableCell>
                                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                                  {hasUnloading ? (
                                    <Chip size="small" label={unloadingBillNo} sx={{ bgcolor: '#dcfce7', color: '#166534', fontWeight: 800, fontSize: '0.72rem' }} />
                                  ) : (
                                    <Typography variant="caption" sx={{ color: '#dc2626', fontWeight: 800, bgcolor: '#fee2e2', px: 1, py: 0.3, borderRadius: '4px', display: 'inline-block' }}>PENDING</Typography>
                                  )}
                                </TableCell>
                              </>
                            )}
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                  {['PENDING CHALLAN DETAILS', 'STAMP BILL DETAILS', 'NON-STAMP BILL DETAILS', 'STAMP BUT NON-BILLED'].includes(alertModalTitle) && alertModalData.length > 0 && (
                    <TableFooter sx={{ position: 'sticky', bottom: 0, bgcolor: '#f8fafc', zIndex: 3 }}>
                      <TableRow sx={{ bgcolor: '#f1f5f9', borderTop: '2px solid #cbd5e1' }}>
                        <TableCell colSpan={isStampNonBilled ? 10 : (isStampOrNonStamp ? 10 : 9)} sx={{ fontWeight: 900, fontSize: '0.85rem', color: '#0f172a', py: 1.5, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          TOTAL BILLING AMOUNT:
                        </TableCell>
                        <TableCell sx={{ fontWeight: 800, fontSize: '0.85rem', color: '#475569', py: 1.5, whiteSpace: 'nowrap' }}>
                          {(() => {
                            const totalMT = alertModalData.reduce((sum, r) => sum + parseNum(r["MT"] ?? r["QTY (MT)"] ?? r["QTY"]), 0);
                            return totalMT > 0 ? `${totalMT.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-';
                          })()}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 900, fontSize: '0.9rem', color: '#0f172a', py: 1.5, whiteSpace: 'nowrap' }}>
                          ₹{alertModalData.reduce((sum, r) => sum + parseNum(r["Billing Amount"] ?? r["BILLING AMOUNT"] ?? r["AMOUNT"]), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                        {isStampNonBilled && (
                          <>
                            <TableCell sx={{ bgcolor: '#f1f5f9' }} />
                            <TableCell sx={{ bgcolor: '#f1f5f9' }} />
                          </>
                        )}
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </TableContainer>
            );
          })()}
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 0 }}>
          <Button onClick={() => { setAlertModalOpen(false); setEWayAlertsSearchTerm(''); }} variant="contained" sx={{ bgcolor: '#0f172a', color: '#fff', borderRadius: '8px', px: 4, fontWeight: 700, '&:hover': { bgcolor: '#1e293b' } }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* --- Single Vehicle Validity Extension Dialog --- */}
      <Dialog open={Boolean(extendValidityItem)} onClose={() => setExtendValidityItem(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ fontWeight: 800, pb: 1, color: '#0f172a' }}>
          Extend {extendValidityItem?.validityType} Validity
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary" mb={2} sx={{ lineHeight: 1.6 }}>
            Vehicle No: <b>{extendValidityItem?.truckNo}</b><br />
            Owner: <b>{extendValidityItem?.ownerName}</b><br />
            Current Expiry: <b>{extendValidityItem?.expiryDateFormatted}</b>
          </Typography>
          <TextField
            fullWidth
            type="date"
            label="New Expiry Date"
            InputLabelProps={{ shrink: true }}
            value={extendValidityDate}
            onChange={(e) => setExtendValidityDate(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2.5, pt: 0 }}>
          <Button onClick={() => setExtendValidityItem(null)} sx={{ color: '#64748b', fontWeight: 700 }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSaveVehicleValidityExtension}
            disabled={savingValidityExt}
            sx={{ bgcolor: '#0284c7', fontWeight: 800, px: 3, '&:hover': { bgcolor: '#0369a1' } }}
          >
            {savingValidityExt ? <CircularProgress size={20} color="inherit" /> : 'Save Extension'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* --- Dedicated Extension Mode / Modal --- */}
      <Dialog
        open={extensionDialogOpen}
        onClose={() => !savingExtensions && setExtensionDialogOpen(false)}
        maxWidth="xl"
        fullWidth
        PaperProps={{ sx: { borderRadius: '16px', bgcolor: 'background.default' } }}
      >
        <DialogTitle sx={{ bgcolor: 'background.paper', borderBottom: '1px solid #e2e8f0', px: 3, py: 2.5 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box display="flex" alignItems="center" gap={1.5}>
              <AccessTimeIcon sx={{ color: '#2563eb', fontSize: 28 }} />
              <Box>
                <Typography variant="h6" fontWeight={800} color="#0f172a">
                  EXTEND E-WAY BILL VALIDITY
                </Typography>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                  Enter new validity dates individually per vehicle / E-Way Bill record
                </Typography>
              </Box>
            </Box>
            <Chip label={`${extensionRecords.length} Records`} sx={{ bgcolor: '#e0e7ff', color: '#4338ca', fontWeight: 800, borderRadius: '8px' }} />
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          <Box sx={{ mb: 2.5, p: 2, bgcolor: '#eff6ff', borderRadius: '10px', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <CalendarTodayIcon sx={{ color: '#2563eb' }} />
            <Typography variant="body2" color="#1e40af" fontWeight={600}>
              Enter or select a new date in the <strong>NEW EXTENDED VALIDITY DATE</strong> column for each individual vehicle/record you want to extend. Unchanged fields remain untouched.
            </Typography>
          </Box>
          <TableContainer component={Paper} sx={{ borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'background.default' }}>
                  <TableCell sx={{ fontWeight: 800, color: '#475569', py: 2, whiteSpace: 'nowrap' }}>SL NO</TableCell>
                  <TableCell sx={{ fontWeight: 800, color: '#475569', whiteSpace: 'nowrap' }}>INVOICE DATE</TableCell>
                  <TableCell sx={{ fontWeight: 800, color: '#475569', whiteSpace: 'nowrap' }}>INVOICE NO</TableCell>
                  <TableCell sx={{ fontWeight: 800, color: '#475569', whiteSpace: 'nowrap' }}>E-WAY BILL NO</TableCell>
                  <TableCell sx={{ fontWeight: 800, color: '#475569', whiteSpace: 'nowrap' }}>CURRENT E-WAY BILL VALIDITY</TableCell>
                  <TableCell sx={{ fontWeight: 800, color: '#475569', whiteSpace: 'nowrap' }}>UNLOADING DATE / STATUS</TableCell>
                  <TableCell sx={{ fontWeight: 800, color: '#475569', whiteSpace: 'nowrap' }}>VEHICLE NO</TableCell>
                  <TableCell sx={{ fontWeight: 800, color: '#475569', whiteSpace: 'nowrap' }}>SITE</TableCell>
                  <TableCell sx={{ fontWeight: 800, color: '#475569', whiteSpace: 'nowrap' }}>DESTINATION</TableCell>
                  <TableCell sx={{ fontWeight: 800, color: '#475569', whiteSpace: 'nowrap' }}>PARTY NAME</TableCell>
                  <TableCell sx={{ fontWeight: 900, color: '#1e40af', bgcolor: '#dbeafe', whiteSpace: 'nowrap', minWidth: 230, borderBottom: '2px solid #2563eb' }}>
                    NEW EXTENDED VALIDITY DATE 📅
                  </TableCell>
                  <TableCell sx={{ fontWeight: 800, color: '#475569', whiteSpace: 'nowrap' }}>ACTION / STATUS</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {extensionRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} align="center" sx={{ py: 4, color: '#64748b', fontWeight: 600 }}>
                      No records available to extend.
                    </TableCell>
                  </TableRow>
                ) : (
                  extensionRecords.map((row, idx) => {
                    const rowId = getRowUniqueKey(row, idx);
                    const info = getEWayBillStatus(row);
                    const err = extensionErrors[rowId];
                    const enteredVal = extensionDraft[rowId] || '';

                    return (
                      <TableRow key={rowId} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{idx + 1}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{row["LOADING DT"] || row["LOADING DATE"] || row["BILL DATE"] || "-"}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{row["INVOICE NO"] || row["INVOICE NO."] || "-"}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{row["E-WAY BILL NO"] || row["E-WAY BILL NUMBER"] || "-"}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <Box display="flex" flexDirection="column" gap={0.5}>
                            <Typography variant="body2" fontWeight={700} color={info.isExtended ? '#2563eb' : '#dc2626'}>
                              {info.effectiveValidity}
                            </Typography>
                            {info.isExtended && (
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
                                Original: {info.originalValidity}
                              </Typography>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{row["UNLOADING STATUS"] || row["RECEIVING DATE"] || row["UNLOADING DATE"] || "-"}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 700, color: '#0f172a' }}>{row["VEHICLE NUMBER"] || row["VEHICLE NO"] || row["VEHICLE NO."] || "-"}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{row["SITE"] || "-"}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{row["DESTINATION"] || "-"}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{row["PARTY NAME"] || "-"}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap', py: 1.5, minWidth: 230, bgcolor: '#f8fafc' }}>
                          <TextField
                            type="date"
                            size="small"
                            value={enteredVal}
                            onChange={(e) => {
                              const val = e.target.value;
                              setExtensionDraft(prev => ({ ...prev, [rowId]: val }));

                              const currentMs = parseDateToStartOfDay(info.effectiveValidity);
                              const newMs = parseDateToStartOfDay(val);
                              if (val && currentMs && newMs < currentMs) {
                                setExtensionErrors(prev => ({ ...prev, [rowId]: `Must be on or after ${info.effectiveValidity}` }));
                              } else {
                                setExtensionErrors(prev => ({ ...prev, [rowId]: null }));
                              }
                            }}
                            error={Boolean(err)}
                            helperText={err || (info.isExtended ? `Active: ${info.effectiveValidity}` : '')}
                            inputProps={{
                              min: formatDateToYYYYMMDD(info.effectiveValidity) || undefined
                            }}
                            InputProps={{
                              startAdornment: (
                                <InputAdornment position="start">
                                  <CalendarTodayIcon sx={{ color: err ? '#ef4444' : (enteredVal ? '#2563eb' : '#64748b'), fontSize: 18 }} />
                                </InputAdornment>
                              ),
                            }}
                            sx={{
                              width: '210px',
                              '& .MuiOutlinedInput-root': {
                                borderRadius: '8px',
                                bgcolor: enteredVal ? '#f0f9ff' : '#ffffff',
                                fontWeight: 700,
                                fontSize: '0.85rem',
                                '& fieldset': {
                                  borderWidth: '2px',
                                  borderColor: err ? '#ef4444' : (enteredVal ? '#2563eb' : '#cbd5e1')
                                },
                                '&:hover fieldset': {
                                  borderColor: err ? '#ef4444' : '#1d4ed8'
                                }
                              },
                              '& .MuiFormHelperText-root': {
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                mt: 0.5,
                                mx: 0,
                                color: err ? '#dc2626' : '#64748b'
                              }
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <Box display="flex" flexDirection="column" gap={0.5}>
                            <Box
                              sx={{
                                px: 1.5, py: 0.5, borderRadius: '20px', display: 'inline-block', fontSize: '0.75rem', fontWeight: 800,
                                bgcolor: info.bgColor, color: info.color, border: `1px solid ${info.borderColor}`,
                                animation: info.isBlinking ? 'pulseModalChipRed 1.5s infinite ease-in-out' : 'none'
                              }}
                            >
                              {info.label}
                            </Box>
                            {info.isExtended && (
                              <Chip
                                size="small"
                                label="EXTENDED"
                                sx={{
                                  bgcolor: '#e0e7ff',
                                  color: '#4338ca',
                                  fontWeight: 800,
                                  fontSize: '0.65rem',
                                  height: '20px',
                                  width: 'fit-content'
                                }}
                              />
                            )}
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 0, justifyContent: 'space-between' }}>
          <Button
            onClick={() => setExtensionDialogOpen(false)}
            variant="outlined"
            disabled={savingExtensions}
            sx={{ borderRadius: '8px', px: 3, fontWeight: 700, borderColor: '#cbd5e1', color: '#475569' }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveExtensions}
            variant="contained"
            disabled={savingExtensions}
            startIcon={savingExtensions ? <CircularProgress size={18} color="inherit" /> : <CheckCircleOutlineIcon />}
            sx={{ bgcolor: '#047857', color: '#fff', borderRadius: '8px', px: 4, fontWeight: 700, '&:hover': { bgcolor: '#065f46' } }}
          >
            {savingExtensions ? 'Saving...' : 'SAVE EXTENDED VALIDITY'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* --- Dedicated Unloading Status Modal / Panel with Exactly 2 Tabs --- */}
      <Dialog
        open={unloadingStatusOpen}
        onClose={() => setUnloadingStatusOpen(false)}
        maxWidth="xl"
        fullWidth
        PaperProps={{ sx: { borderRadius: '16px', bgcolor: 'background.default', maxHeight: '90vh' } }}
      >
        <DialogTitle sx={{ bgcolor: 'background.paper', borderBottom: '1px solid #e2e8f0', px: 3, py: 2 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1.5}>
            <Box display="flex" alignItems="center" gap={1.5}>
              <LocalShippingIcon sx={{ color: '#0284c7', fontSize: 28 }} />
              <Box>
                <Typography variant="h6" fontWeight={800} color="#0f172a">
                  UNLOADING STATUS
                </Typography>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                  Authoritative CIM/CIMA Register live unloading tracking
                </Typography>
              </Box>
            </Box>
            <IconButton onClick={() => setUnloadingStatusOpen(false)} size="small" sx={{ color: '#64748b' }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </DialogTitle>

        {/* --- Two Dedicated Tabs Header --- */}
        <Box sx={{ px: 3, pt: 1.5, pb: 0, bgcolor: 'background.paper', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
          <Tabs
            value={unloadingActiveTab}
            onChange={(e, val) => setUnloadingActiveTab(val)}
            sx={{
              minHeight: '40px',
              '& .MuiTab-root': {
                textTransform: 'none',
                fontWeight: 800,
                fontSize: '0.84rem',
                minHeight: '38px',
                py: 0.5,
                px: 2.2,
                mr: 1.5,
                borderRadius: '8px 8px 0 0',
                color: '#64748b',
                bgcolor: '#f1f5f9',
                border: '1px solid #e2e8f0',
                borderBottom: 'none',
                transition: 'all 0.2s',
                '&:hover': { bgcolor: '#e2e8f0', color: '#0f172a' }
              },
              '& .Mui-selected': {
                bgcolor: '#0f172a !important',
                color: '#ffffff !important',
                borderColor: '#0f172a !important',
                boxShadow: '0 2px 8px rgba(15,23,42,0.2)'
              }
            }}
            TabIndicatorProps={{ style: { display: 'none' } }}
          >
            <Tab
              label={
                <Box display="flex" alignItems="center" gap={1}>
                  <CheckCircleOutlineIcon sx={{ fontSize: 18 }} />
                  <span>YESTERDAY UNLOADED — {unloadingStatusData.yesterdayFormatted}</span>
                  <Chip
                    size="small"
                    label={unloadingStatusData.yesterdayCount}
                    sx={{
                      height: '20px',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      bgcolor: unloadingActiveTab === 0 ? 'rgba(255,255,255,0.25)' : '#dcfce7',
                      color: unloadingActiveTab === 0 ? '#ffffff' : '#15803d'
                    }}
                  />
                </Box>
              }
            />
            <Tab
              label={
                <Box display="flex" alignItems="center" gap={1}>
                  <AccessTimeIcon sx={{ fontSize: 18 }} />
                  <span>TODAY UNLOADING — {unloadingStatusData.todayFormatted}</span>
                  <Chip
                    size="small"
                    label={unloadingStatusData.todayCount}
                    sx={{
                      height: '20px',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      bgcolor: unloadingActiveTab === 1 ? 'rgba(255,255,255,0.25)' : '#e0f2fe',
                      color: unloadingActiveTab === 1 ? '#ffffff' : '#0369a1'
                    }}
                  />
                </Box>
              }
            />
          </Tabs>

          <TextField
            size="small"
            placeholder="Search E-Way Bill / Vehicle No."
            value={unloadingSearchTerm}
            onChange={(e) => setUnloadingSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: '#64748b', fontSize: 18 }} />
                </InputAdornment>
              ),
              endAdornment: unloadingSearchTerm ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setUnloadingSearchTerm('')}>
                    <ClearIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
            sx={{
              width: { xs: '100%', sm: 300 },
              mb: 1,
              bgcolor: '#ffffff',
              '& .MuiOutlinedInput-root': { borderRadius: '8px', height: '36px' }
            }}
          />
        </Box>

        <DialogContent sx={{ p: 3 }}>
          {unloadingActiveTab === 0 ? (
            /* TAB 1: YESTERDAY UNLOADED */
            <Box>
              <TableContainer component={Paper} sx={{ borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#f0fdf4' }}>
                      <TableCell sx={{ fontWeight: 800, color: '#166534', py: 1.5, whiteSpace: 'nowrap' }}>SL NO</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: '#166534', whiteSpace: 'nowrap' }}>INVOICE NO</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: '#166534', whiteSpace: 'nowrap' }}>E-WAY BILL NO</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: '#166534', whiteSpace: 'nowrap' }}>VEHICLE NO</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: '#166534', whiteSpace: 'nowrap' }}>SITE</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: '#166534', whiteSpace: 'nowrap' }}>DESTINATION</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: '#166534', whiteSpace: 'nowrap' }}>PARTY NAME</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: '#166534', whiteSpace: 'nowrap' }}>UNLOADING DATE</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: '#166534', whiteSpace: 'nowrap' }}>UNLOADING STATUS</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(() => {
                      const term = unloadingSearchTerm.trim().toLowerCase().replace(/\s+/g, '');
                      const list = term
                        ? unloadingStatusData.yesterdayUnloaded.filter(row => {
                            const eway = String(row["E-WAY BILL NO"] || row["E-WAY BILL NUMBER"] || "").toLowerCase().replace(/\s+/g, '');
                            const veh = String(row["VEHICLE NUMBER"] || row["VEHICLE NO"] || "").toLowerCase().replace(/\s+/g, '');
                            const inv = String(row["INVOICE NO"] || row["INVOICE NO."] || "").toLowerCase().replace(/\s+/g, '');
                            return eway.includes(term) || veh.includes(term) || inv.includes(term);
                          })
                        : unloadingStatusData.yesterdayUnloaded;

                      if (list.length === 0) {
                        return (
                          <TableRow>
                            <TableCell colSpan={9} align="center" sx={{ py: 4, color: '#64748b', fontWeight: 600 }}>
                              {term
                                ? `No matching records found for "${unloadingSearchTerm}" in Yesterday Unloaded.`
                                : `No vehicles unloaded yesterday (${unloadingStatusData.yesterdayFormatted}).`}
                            </TableCell>
                          </TableRow>
                        );
                      }

                      return list.map((row, idx) => (
                        <TableRow key={row.uniqueKey || idx} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                          <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 700, color: '#64748b' }}>{idx + 1}</TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{row["INVOICE NO"] || row["INVOICE NO."] || "-"}</TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 700, color: '#2563eb' }}>{row["E-WAY BILL NO"] || row["E-WAY BILL NUMBER"] || "-"}</TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 800, color: '#0f172a' }}>{row["VEHICLE NUMBER"] || row["VEHICLE NO"] || row["VEHICLE NO."] || "-"}</TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>{row["SITE"] || "-"}</TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>{row["DESTINATION"] || "-"}</TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>{row["PARTY NAME"] || "-"}</TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 700, color: '#047857' }}>
                            {row.unloadingDateFormatted || "-"}
                          </TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>
                            <Chip
                              size="small"
                              label="UNLOADED"
                              sx={{ bgcolor: '#dcfce7', color: '#15803d', fontWeight: 800, fontSize: '0.75rem' }}
                            />
                          </TableCell>
                        </TableRow>
                      ));
                    })()}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          ) : (
            /* TAB 2: TODAY UNLOADING */
            <Box>
              <TableContainer component={Paper} sx={{ borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#eff6ff' }}>
                      <TableCell sx={{ fontWeight: 800, color: '#1e40af', py: 1.5, whiteSpace: 'nowrap' }}>SL NO</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: '#1e40af', whiteSpace: 'nowrap' }}>INVOICE NO</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: '#1e40af', whiteSpace: 'nowrap' }}>E-WAY BILL NO</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: '#1e40af', whiteSpace: 'nowrap' }}>VEHICLE NO</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: '#1e40af', whiteSpace: 'nowrap' }}>SITE</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: '#1e40af', whiteSpace: 'nowrap' }}>DESTINATION</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: '#1e40af', whiteSpace: 'nowrap' }}>PARTY NAME</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: '#1e40af', whiteSpace: 'nowrap' }}>E-WAY BILL VALIDITY</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: '#1e40af', whiteSpace: 'nowrap' }}>UNLOADING DATE / STATUS</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: '#1e40af', whiteSpace: 'nowrap' }}>STATUS</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(() => {
                      const term = unloadingSearchTerm.trim().toLowerCase().replace(/\s+/g, '');
                      const list = term
                        ? unloadingStatusData.todayUnloading.filter(row => {
                            const eway = String(row["E-WAY BILL NO"] || row["E-WAY BILL NUMBER"] || "").toLowerCase().replace(/\s+/g, '');
                            const veh = String(row["VEHICLE NUMBER"] || row["VEHICLE NO"] || "").toLowerCase().replace(/\s+/g, '');
                            const inv = String(row["INVOICE NO"] || row["INVOICE NO."] || "").toLowerCase().replace(/\s+/g, '');
                            return eway.includes(term) || veh.includes(term) || inv.includes(term);
                          })
                        : unloadingStatusData.todayUnloading;

                      if (list.length === 0) {
                        return (
                          <TableRow>
                            <TableCell colSpan={10} align="center" sx={{ py: 4, color: '#64748b', fontWeight: 600 }}>
                              {term
                                ? `No matching records found for "${unloadingSearchTerm}" in Today Unloading.`
                                : `No vehicles scheduled/due for unloading today (${unloadingStatusData.todayFormatted}).`}
                            </TableCell>
                          </TableRow>
                        );
                      }

                      return list.map((row, idx) => {
                        const info = row.ewayInfo || getEWayBillStatus(row);
                        return (
                          <TableRow key={row.uniqueKey || idx} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                            <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 700, color: '#64748b' }}>{idx + 1}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{row["INVOICE NO"] || row["INVOICE NO."] || "-"}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 700, color: '#2563eb' }}>{row["E-WAY BILL NO"] || row["E-WAY BILL NUMBER"] || "-"}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 800, color: '#0f172a' }}>{row["VEHICLE NUMBER"] || row["VEHICLE NO"] || row["VEHICLE NO."] || "-"}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{row["SITE"] || "-"}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{row["DESTINATION"] || "-"}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{row["PARTY NAME"] || "-"}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 700, color: info.isExtended ? '#2563eb' : '#dc2626' }}>
                              {info.effectiveValidity || "-"}
                            </TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>
                              {row.isPending ? (
                                <Chip
                                  size="small"
                                  label="UNLOADING PENDING"
                                  sx={{ bgcolor: '#fef2f2', color: '#b91c1c', border: '1px solid #fca5a5', fontWeight: 800, fontSize: '0.72rem' }}
                                />
                              ) : (
                                <Typography variant="body2" fontWeight={700} color="#047857">
                                  {row.unloadingDisplay || "-"}
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>
                              <Box
                                sx={{
                                  px: 1.5, py: 0.5, borderRadius: '20px', display: 'inline-block', fontSize: '0.75rem', fontWeight: 800,
                                  bgcolor: info.bgColor, color: info.color, border: `1px solid ${info.borderColor}`,
                                  animation: info.isBlinking ? 'pulseModalChipRed 1.5s infinite ease-in-out' : 'none'
                                }}
                              >
                                {info.label}
                              </Box>
                            </TableCell>
                          </TableRow>
                        );
                      });
                    })()}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid #e2e8f0', bgcolor: 'background.paper', justifyContent: 'space-between' }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            Live operational unloading feed synced with Cement Register
          </Typography>
          <Button
            onClick={() => setUnloadingStatusOpen(false)}
            sx={{
              bgcolor: '#0f172a',
              color: '#ffffff',
              fontWeight: 700,
              borderRadius: '8px',
              px: 3,
              py: 0.8,
              textTransform: 'none',
              '&:hover': { bgcolor: '#1e293b' }
            }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>


      {/* ==========================================
          VEHICLE WISE TRIP SUMMARY MODAL DIALOG
         ========================================== */}
      <Dialog
        open={vehicleSummaryModalOpen}
        onClose={() => setVehicleSummaryModalOpen(false)}
        maxWidth="xl"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '20px',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            maxHeight: '95vh',
            bgcolor: '#f8fafc',
            overflow: 'auto'
          }
        }}
      >
        <VehicleWiseTripSummaryTab
          financialYear={financialYear}
          setFinancialYear={setFinancialYear}
          month={month}
          setMonth={setMonth}
          date={date}
          setDate={setDate}
          fyOptions={fyOptions}
          monthOptions={monthOptions}
          isModal={true}
          onCloseModal={() => setVehicleSummaryModalOpen(false)}
        />
      </Dialog>


      {/* --- Snackbar alerts --- */}
      <Snackbar
        open={!!snack}
        autoHideDuration={6000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setSnack(null)} severity={snack?.severity || 'info'} sx={{ width: '100%', fontWeight: 700 }}>
          {snack?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}


// ==========================================
// NEW: ALL PARTY REPORTS TAB SKELETON
// ==========================================


function AllPartyReportsTab({ onBack, mainTab, setMainTab }) {
  const [parties, setParties] = useState([]);
  const [ownerDetailsMap, setOwnerDetailsMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [snack, setSnack] = useState(null);
  const [selectedParty, setSelectedParty] = useState(null);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [ownerMap, setOwnerMap] = useState({});
  const [expandedOwner, setExpandedOwner] = useState(null);
  // vehicleWheelMap: { "TRUCK_NO": "10W" | "6W" | "12W" | "" }
  const [vehicleWheelMap, setVehicleWheelMap] = useState({});

  useEffect(() => {
    fetchParties();
  }, []);

  const fetchParties = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/voucher/contacts`);
      if (res.data.success) {
        setParties(res.data.names || []);
        setOwnerMap(res.data.ownerMap || {});
        setOwnerDetailsMap(res.data.ownerDetails || {});
        setVehicleWheelMap(res.data.vehicleWheelMap || {});
      }
    } catch (err) {
      console.error(err);
      setSnack({ msg: 'Failed to fetch party names', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  if (selectedParty && selectedVehicle) {
    // Determine which extra incentive columns this owner needs, based on
    // the full wheel-type portfolio of ALL vehicles registered to that owner.
    const ownerVehicles = ownerMap[selectedParty] || [];
    const ownerHas6W = ownerVehicles.some(v => vehicleWheelMap[v] === '6W');
    const ownerHas10W = ownerVehicles.some(v => vehicleWheelMap[v] === '10W');

    return (
      <PartyReportView
        partyName={selectedParty}
        selectedVehicle={selectedVehicle}
        ownerDetails={ownerDetailsMap[selectedParty] || {}}
        ownerVehicles={ownerVehicles}
        vehicleWheelMap={vehicleWheelMap}
        show6WHColumn={ownerHas6W}
        show10WHColumn={ownerHas10W}
        onBack={() => { setSelectedParty(null); setSelectedVehicle(null); }}
      />
    );
  }

  const filteredParties = parties.filter(p => {
    const term = searchTerm.toLowerCase();
    const matchOwner = p.toLowerCase().includes(term);
    const vehicles = ownerMap[p] || [];
    const matchVehicle = vehicles.some(v => v.toLowerCase().includes(term));
    return matchOwner || matchVehicle;
  });

  return (
    <Box sx={{ bgcolor: 'background.default', minHeight: '100vh', pb: 6 }}>
      {/* --- Sticky Header --- */}
      <Box sx={{
        position: 'sticky', top: 0, zIndex: 10,
        bgcolor: 'background.paper', color: '#0f172a',
        px: { xs: 1.5, md: 2.5 }, py: 1.2,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.1)',
        display: 'flex',
        flexWrap: { xs: 'wrap', xl: 'nowrap' },
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: { xs: 1, md: 1.5 }
      }}>
        {/* Left Title */}
        <Box display="flex" alignItems="center" gap={1} flexShrink={0} sx={{ order: 1 }}>
          <IconButton onClick={onBack} size="small" sx={{ color: '#0f172a', bgcolor: 'background.default', '&:hover': { bgcolor: '#e2e8f0' }, p: 0.8 }}>
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <Box>
            <Typography variant="subtitle1" fontWeight={900} sx={{ letterSpacing: '-0.3px', lineHeight: 1.2, fontSize: { xs: '0.95rem', md: '1.05rem', xl: '1.15rem' }, whiteSpace: 'nowrap' }}>
              Daily Operations Dashboard
            </Typography>
            <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: { xs: 'none', '2xl': 'block' }, lineHeight: 1 }}>
              All Party Reports Module
            </Typography>
          </Box>
        </Box>

        {/* Center Tabs */}
        <Box sx={{
          flexShrink: 0,
          display: 'flex',
          justifyContent: 'center',
          order: { xs: 3, xl: 2 },
          width: { xs: '100%', xl: 'auto' },
          mx: { xs: 0, xl: 'auto' },
          mt: { xs: 1.5, xl: 0 }
        }}>
          <Tabs
            value={mainTab}
            onChange={(e, v) => setMainTab(v)}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            sx={{
              minHeight: 34,
              '& .MuiTabs-scroller': { display: 'flex', alignItems: 'center' },
              '& .MuiTabs-flexContainer': { gap: { xs: 0.4, md: 0.6 } },
              '& .MuiTab-root': {
                minWidth: 'auto',
                minHeight: 32,
                borderRadius: '8px',
                textTransform: 'none',
                fontWeight: 800,
                fontSize: { xs: '0.7rem', sm: '0.74rem', md: '0.78rem' },
                px: { xs: 1, sm: 1.3, md: 1.6 },
                py: 0.4,
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
                color: '#475569',
                bgcolor: 'rgba(241, 245, 249, 0.8)',
                '&:hover': { bgcolor: '#e2e8f0', color: '#0f172a' }
              },
              '& .Mui-selected': {
                bgcolor: '#0f172a !important',
                color: '#ffffff !important',
                boxShadow: '0 2px 8px rgba(15,23,42,0.2)'
              }
            }}
            TabIndicatorProps={{ style: { display: 'none' } }}
          >
            <Tab label="DAILY SUMMARY REPORTS" />
            <Tab label="ALL PARTY REPORTS" />
            <Tab label="VEHICLE WISE TRIP SUMMARY" />
            <Tab label="DAILY REVENUE NVL & NVCL" />
            <Tab label="REVENEW" />
          </Tabs>
        </Box>

        {/* Right Controls */}
        <Box display="flex" alignItems="center" justifyContent="flex-end" sx={{ order: { xs: 2, xl: 3 }, minWidth: { xs: 'auto', xl: 120 }, flexShrink: 0 }}>
          <Tooltip title="Refresh Data">
            <IconButton onClick={fetchParties} size="small" sx={{ color: '#0f172a', bgcolor: 'background.default', '&:hover': { bgcolor: '#e2e8f0' }, p: 0.8 }}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Box sx={{ px: { xs: 2, md: 4 }, mt: 4, maxWidth: '1000px', mx: 'auto' }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
          <Typography variant="h5" fontWeight={800} color="#0f172a" sx={{ letterSpacing: '-0.5px' }}>
            ALL PARTY REPORTS
          </Typography>
          <TextField
            size="small"
            placeholder="Search Owner / Vehicle..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
            sx={{ width: 350, bgcolor: 'background.paper', borderRadius: 2, '& fieldset': { borderColor: '#e2e8f0' } }}
          />
        </Box>

        <Box sx={{ mb: 4 }}>
          {loading ? (
            <Box display="flex" justifyContent="center" p={8}>
              <CircularProgress />
            </Box>
          ) : (
            <Box>
              {filteredParties.map((party, index) => {
                const vehicles = ownerMap[party] || [];
                const isExpanded = expandedOwner === party;
                return (
                  <Accordion
                    key={party}
                    expanded={isExpanded}
                    onChange={(e, expanded) => setExpandedOwner(expanded ? party : null)}
                    disableGutters
                    elevation={0}
                    sx={{
                      mb: 2,
                      borderRadius: '12px !important',
                      border: '1px solid #e2e8f0',
                      boxShadow: isExpanded ? '0 10px 25px -5px rgba(0,0,0,0.1)' : '0 2px 4px rgba(0,0,0,0.02)',
                      transition: 'all 0.3s ease',
                      overflow: 'hidden',
                      '&:before': { display: 'none' },
                      '&:hover': {
                        borderColor: isExpanded ? '#e2e8f0' : '#cbd5e1',
                        boxShadow: isExpanded ? '0 10px 25px -5px rgba(0,0,0,0.1)' : '0 4px 6px -1px rgba(0,0,0,0.05)'
                      }
                    }}
                  >
                    <AccordionSummary
                      expandIcon={<ExpandMoreIcon sx={{ color: isExpanded ? '#0f172a' : '#64748b' }} />}
                      sx={{
                        py: 1, px: 3,
                        bgcolor: isExpanded ? '#f1f5f9' : '#fff',
                        transition: 'background-color 0.3s ease'
                      }}
                    >
                      <Box display="flex" alignItems="center" gap={2}>
                        <Box sx={{
                          width: 40, height: 40, borderRadius: '10px',
                          bgcolor: isExpanded ? '#0f172a' : '#f1f5f9',
                          color: isExpanded ? '#fff' : '#64748b',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.3s ease'
                        }}>
                          <PersonIcon />
                        </Box>
                        <Box>
                          <Typography variant="subtitle1" fontWeight={800} color="#0f172a" sx={{ letterSpacing: '-0.3px' }}>
                            {party}
                          </Typography>
                          <Typography variant="body2" color="text.secondary" fontWeight={600}>
                            {vehicles.length} Vehicle{vehicles.length !== 1 ? 's' : ''}
                          </Typography>
                        </Box>
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails sx={{ p: 0, bgcolor: 'background.paper', borderTop: '1px solid #e2e8f0' }}>
                      <List disablePadding>
                        {vehicles.length === 0 ? (
                          <ListItem sx={{ py: 3, px: 3 }}>
                            <Typography variant="body2" color="text.secondary" fontWeight={500}>No vehicles registered to this owner.</Typography>
                          </ListItem>
                        ) : (
                        vehicles.map((v, i) => {
                            // Wheel type badge for this vehicle
                            const wheelType = vehicleWheelMap[v] || '';
                            const is6W = wheelType === '6W';
                            const is10W = wheelType === '10W';
                            const wheelBadgeColor = is6W
                              ? { bg: '#dcfce7', color: '#166534', border: '#86efac' }
                              : is10W
                              ? { bg: '#dbeafe', color: '#1e40af', border: '#93c5fd' }
                              : wheelType
                              ? { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' }
                              : null;

                            return (
                              <React.Fragment key={v}>
                                <ListItem sx={{ py: 2, px: { xs: 2, md: 4 }, display: 'flex', justifyContent: 'space-between', '&:hover': { bgcolor: 'background.default' }, transition: 'background-color 0.2s' }}>
                                  <Box display="flex" alignItems="center" gap={2}>
                                    <LocalShippingIcon sx={{ color: '#94a3b8', fontSize: 24 }} />
                                    <Typography variant="body1" fontWeight={700} color="#1e293b" sx={{ letterSpacing: '0.5px' }}>
                                      {v}
                                    </Typography>
                                    {wheelBadgeColor && (
                                      <Box sx={{
                                        display: 'inline-flex', alignItems: 'center',
                                        px: 1, py: 0.25,
                                        borderRadius: '6px',
                                        bgcolor: wheelBadgeColor.bg,
                                        border: `1px solid ${wheelBadgeColor.border}`,
                                        color: wheelBadgeColor.color,
                                        fontSize: '10px', fontWeight: 800,
                                        letterSpacing: '0.5px',
                                      }}>
                                        {wheelType}
                                      </Box>
                                    )}
                                  </Box>
                                  <Button
                                    variant="contained"
                                    size="small"
                                    onClick={() => { setSelectedParty(party); setSelectedVehicle(v); }}
                                    sx={{
                                      borderRadius: '8px', fontWeight: 800, textTransform: 'none', py: 0.5, px: 2,
                                      bgcolor: 'background.paper', color: '#0f172a', border: '1px solid #cbd5e1', boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                      '&:hover': { bgcolor: '#0f172a', color: '#fff', borderColor: '#0f172a' }
                                    }}
                                  >
                                    VIEW REPORT
                                  </Button>
                                </ListItem>
                                {i < vehicles.length - 1 && <Divider sx={{ mx: 4 }} />}
                              </React.Fragment>
                            );
                          })
                        )}
                      </List>
                    </AccordionDetails>
                  </Accordion>
                );
              })}
              {filteredParties.length === 0 && (
                <Card sx={{ p: 8, textAlign: 'center', borderRadius: '16px', border: '1px dashed #cbd5e1', boxShadow: 'none', bgcolor: 'background.paper' }}>
                  <Typography variant="h6" color="text.secondary" fontWeight={700}>
                    No results found
                  </Typography>
                  <Typography variant="body2" color="text.secondary" mt={1}>
                    Try searching for a different Owner Name or Vehicle Number.
                  </Typography>
                </Card>
              )}
            </Box>
          )}
        </Box>
      </Box>

      <Snackbar
        open={!!snack}
        autoHideDuration={6000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setSnack(null)} severity={snack?.severity || 'info'} sx={{ width: '100%', fontWeight: 700 }}>
          {snack?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}

// ==========================================
// WRAPPER MODULE
// ==========================================
export default function DailySummaryReport(props) {
  const [mainTab, setMainTab] = useState(0);
  const initialSelection = useMemo(() => getCurrentFYAndMonth(), []);
  const [financialYear, setFinancialYear] = useState(initialSelection.fy);
  const [month, setMonth] = useState(initialSelection.month);
  const [date, setDate] = useState('ALL');

  if (mainTab === 0) {
    return (
      <DailySummaryTab
        {...props}
        mainTab={mainTab}
        setMainTab={setMainTab}
        financialYear={financialYear}
        setFinancialYear={setFinancialYear}
        month={month}
        setMonth={setMonth}
        date={date}
        setDate={setDate}
      />
    );
  } else if (mainTab === 1) {
    return <AllPartyReportsTab {...props} mainTab={mainTab} setMainTab={setMainTab} />;
  } else if (mainTab === 2) {
    return (
      <VehicleWiseTripSummaryTab
        {...props}
        mainTab={mainTab}
        setMainTab={setMainTab}
        financialYear={financialYear}
        setFinancialYear={setFinancialYear}
        month={month}
        setMonth={setMonth}
        date={date}
        setDate={setDate}
        fyOptions={fyOptions}
        monthOptions={monthOptions}
      />
    );
  } else if (mainTab === 3) {
    return (
      <DailyRevenueNvlNvclTab
        {...props}
        mainTab={mainTab}
        setMainTab={setMainTab}
        financialYear={financialYear}
        setFinancialYear={setFinancialYear}
        month={month}
        setMonth={setMonth}
        date={date}
        setDate={setDate}
      />
    );
  } else {
    return (
      <RevenewTab
        {...props}
        mainTab={mainTab}
        setMainTab={setMainTab}
        financialYear={financialYear}
        setFinancialYear={setFinancialYear}
        month={month}
        setMonth={setMonth}
        date={date}
        setDate={setDate}
      />
    );
  }
}
