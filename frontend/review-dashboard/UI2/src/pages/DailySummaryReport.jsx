import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Button, IconButton, Grid, Card, CardContent, CircularProgress, 
  Tabs, Tab, Select, MenuItem, FormControl, TableContainer, Table, TableHead, 
  TableRow, TableCell, TableBody, Paper, Collapse,
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
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PersonIcon from '@mui/icons-material/Person';

import axios from 'axios';
import * as XLSX from 'xlsx';
import PartyReportView from './PartyReportView';

const API_URL = import.meta.env.VITE_API_URL;

const parseNum = (val) => parseFloat(String(val || 0).replace(/,/g, '')) || 0;

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
  setMainTab
}) {
  const initialSelection = useMemo(() => getCurrentFYAndMonth(), []);
  const [financialYear, setFinancialYear] = useState(initialSelection.fy);
  const [month, setMonth] = useState(initialSelection.month);

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

  const [alertModalOpen, setAlertModalOpen] = useState(false);
  const [alertModalTitle, setAlertModalTitle] = useState('');
  const [alertModalData, setAlertModalData] = useState([]);

  const fetchData = useCallback(async (targetDate) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      
      let queryDate = targetDate;
      if (targetDate === 'ALL') {
        // Build comma-separated list of all dates in current month selection
        queryDate = dateOptions.map(d => d.value).join(',');
      }

      const res = await axios.get(`${API_URL}/daily-summary/data`, {
        params: { date: queryDate },
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
  }, [dateOptions]);

  useEffect(() => {
    fetchData(date);
  }, [date, fetchData]);

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
      const cementRows = (data.cement || []).map(e => ({
        "GCN NO": e["GCN NO"] || "",
        "BILL NO": e["BILL NO"] || "",
        "INVOICE NO": e["INVOICE NO"] || e["INVOICE NO."] || "",
        "SITE": e["SITE"] || "",
        "BILLING RATE": parseNum(e["BILLING"]),
        "QTY (MT)": parseNum(e["MT"]),
        "AMOUNT": parseNum(e["Billing Amount"]) || parseNum(e["AMOUNT"]),
        "LOADING ADVANCE": parseNum(e["ADVANCE"] || e["LOADING ADVANCE"])
      }));
      const wsCement = XLSX.utils.json_to_sheet(cementRows);
      XLSX.utils.book_append_sheet(wb, wsCement, "Cement Register");

      // 3. Diesel slips
      const fuelRows = (data.pumpSlips || []).map((e, idx) => ({
        "SL NO": idx + 1,
        "PUMP NAME": e["PUMP NAME"] || "",
        "VEHICLE NO": e["VEHICLE NUMBER"] || e["VEHICLE NO"] || "",
        "HSD SLIP NO": e["HSD SLIP NO"] || "",
        "HSD (LTR)": parseNum(e["HSD (LTR)"]),
        "HSD AMOUNT": parseNum(e["HSD AMOUNT"])
      }));
      const wsFuel = XLSX.utils.json_to_sheet(fuelRows);
      XLSX.utils.book_append_sheet(wb, wsFuel, "Diesel Slips");

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
      tBillAmt += parseNum(e["Billing Amount"] || 0);
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

    // Fuel Slips
    let fL = 0;
    let pPaymentAmt = 0;
    (data.pumpSlips || []).forEach(e => {
      fL += parseNum(e["HSD (LTR)"]);
      pPaymentAmt += parseNum(e["HSD AMOUNT"]);
    });

    const cb = data.cashbookEntry || {};
    const advData = data.advanceSummary || {};

    // Values from advanceSummary (from DB), fallback to basic calculation if missing
    const cashRecv = advData.cashReceived ?? parseNum(cb["P_GIVEN_DAC"]);
    const cashOpen = advData.openingBalance ?? 0;
    const miscExp = advData.miscExpense ?? parseNum(cb["O_EXPENSE"]);
    const closingAdv = advData.closingBalance ?? (cashRecv - cashOpen - advAmt - miscExp);

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

  // Bill Breakdown Categories
  const billBreakdown = useMemo(() => {
    const pending = [];
    const nonStamp = [];
    const stamp = [];

    (data?.cement || []).forEach(e => {
      const billAmt = parseNum(e["Billing Amount"] || 0);
      if (billAmt === 0) return; // Only count those that contribute to the total

      const status = String(e["CHALLAN STATUS"] || "").toUpperCase().trim();
      if (status === "STAMP") stamp.push(e);
      else if (status.includes("NON-STAMP") || status.includes("NON STAMP")) nonStamp.push(e);
      else pending.push(e);
    });

    const sumAmt = (arr) => arr.reduce((acc, e) => acc + parseNum(e["Billing Amount"] || 0), 0);

    return {
      pending, pendingAmt: sumAmt(pending),
      nonStamp, nonStampAmt: sumAmt(nonStamp),
      stamp, stampAmt: sumAmt(stamp),
      totalPendingCount: pending.length
    };
  }, [data]);

  const challanAlerts = useMemo(() => {
    const pending = [];
    const nonStamp = [];
    const stamp = [];

    (data?.cement || []).forEach(e => {
      const status = String(e["CHALLAN STATUS"] || "").toUpperCase().trim();
      if (status === "STAMP") stamp.push(e);
      else if (status.includes("NON-STAMP") || status.includes("NON STAMP")) nonStamp.push(e);
      else pending.push(e);
    });

    return { pending, nonStamp, stamp };
  }, [data]);

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
        if(da.length === 3 && db.length === 3) {
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

  const handleAlertClick = (type, records) => {
    if (type === 'Pending') setAlertModalTitle('PENDING CHALLAN DETAILS');
    else if (type === 'STAMP') setAlertModalTitle('STAMP BILL DETAILS');
    else if (type === 'NON-STAMP') setAlertModalTitle('NON-STAMP BILL DETAILS');

    setAlertModalData(records);
    setAlertModalOpen(true);
  };

  return (
    <Box sx={{ bgcolor: '#f4f7fa', minHeight: '100vh', pb: 6 }}>
      {/* --- Sticky Header --- */}
      <Box sx={{
        position: 'sticky', top: 0, zIndex: 10,
        bgcolor: '#ffffff', color: '#0f172a',
        px: { xs: 2, md: 4 }, py: 2,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.1)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <IconButton onClick={onBack} sx={{ color: '#0f172a', bgcolor: '#f1f5f9', '&:hover': { bgcolor: '#e2e8f0' } }}>
            <ArrowBackIcon />
          </IconButton>
          <Box>
            <Typography variant="h5" fontWeight={900} sx={{ letterSpacing: '-0.5px' }}>
              Daily Operations Dashboard
            </Typography>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
              Live operational metrics and invoice processing
            </Typography>
          </Box>
        </Box>
        <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'center' }}>
          <Tabs
            value={mainTab}
            onChange={(e, v) => setMainTab(v)}
            sx={{
              minHeight: 40,
              '& .MuiTab-root': {
                minHeight: 40,
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 800,
                px: 3,
                mx: 1,
                transition: 'all 0.3s ease'
              },
              '& .Mui-selected': {
                bgcolor: '#0f172a',
                color: '#fff !important',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
              }
            }}
            TabIndicatorProps={{ style: { display: 'none' } }}
          >
            <Tab label="DAILY SUMMARY REPORTS" />
            <Tab label="ALL PARTY REPORTS" />
          </Tabs>
        </Box>
        <Box display="flex" alignItems="center" gap={1.5}>
          <FormControl size="small">
            <Select
              value={financialYear}
              onChange={(e) => setFinancialYear(e.target.value)}
              sx={{ bgcolor: '#f8fafc', borderRadius: '8px', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' }, fontWeight: 700, minWidth: 120 }}
            >
              {fyOptions.map(fy => <MenuItem key={fy} value={fy} sx={{ fontWeight: 600 }}>{fy}</MenuItem>)}
            </Select>
          </FormControl>

          <FormControl size="small">
            <Select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              sx={{ bgcolor: '#f8fafc', borderRadius: '8px', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' }, fontWeight: 700, minWidth: 120 }}
            >
              {monthOptions.map(m => <MenuItem key={m} value={m} sx={{ fontWeight: 600 }}>{m}</MenuItem>)}
            </Select>
          </FormControl>

          <Button
            onClick={handleOpenCalendar}
            variant="outlined"
            endIcon={<CalendarTodayIcon />}
            sx={{
              bgcolor: '#f8fafc', 
              borderRadius: '8px', 
              borderColor: '#e2e8f0', 
              color: '#0f172a',
              fontWeight: 800, 
              minWidth: 130,
              textTransform: 'none',
              px: 2,
              '&:hover': { bgcolor: '#f1f5f9', borderColor: '#cbd5e1' }
            }}
          >
            {date === 'ALL' ? 'ALL' : (dateOptions.find(d => d.value === date)?.display?.split('-')[0] + ' ' + month.substring(0,3))}
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
                border: '1px solid #e2e8f0', width: '320px', bgcolor: '#fff'
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
                  <Grid item xs={12/7} key={d.value}>
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
            <IconButton onClick={() => fetchData(date)} sx={{ color: '#0f172a', bgcolor: '#f1f5f9', '&:hover': { bgcolor: '#e2e8f0' } }}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            color="primary"
            startIcon={<DownloadIcon />}
            onClick={handleExportExcel}
            disabled={!data}
            sx={{
              fontWeight: 800, borderRadius: '10px',
              background: '#0f172a',
              color: '#fff',
              boxShadow: 'none',
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

          <Grid container spacing={4} mb={4}>
            {/* ==========================================
                SECTION 3: FINANCIAL SUMMARY
               ========================================== */}
            <Grid item xs={12} lg={4}>
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
            <Grid item xs={12} lg={4}>
              <Typography variant="subtitle2" fontWeight={800} color="text.secondary" mb={1.5} sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                4. Alerts & Action Items
              </Typography>
              <Card sx={{ borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', height: 'calc(100% - 34px)' }}>
                <CardContent sx={{ p: 3 }}>

                  <Box
                    onClick={() => handleAlertClick('Pending', challanAlerts.pending)}
                    display="flex" alignItems="center" gap={2} p={2} mb={2} borderRadius="12px"
                    sx={{ cursor: 'pointer', bgcolor: challanAlerts.pending.length > 0 ? '#fffbeb' : '#f8fafc', border: `1px solid ${challanAlerts.pending.length > 0 ? '#fde68a' : '#e2e8f0'}`, transition: 'all 0.2s', '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' } }}
                  >
                    <WarningAmberIcon sx={{ color: challanAlerts.pending.length > 0 ? '#d97706' : '#94a3b8', fontSize: 32 }} />
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" fontWeight={800} color={challanAlerts.pending.length > 0 ? '#b45309' : '#64748b'}>Challan Status Pending</Typography>
                      <Typography variant="caption" fontWeight={600} color={challanAlerts.pending.length > 0 ? '#d97706' : '#94a3b8'}>Click to view pending records</Typography>
                    </Box>
                    <Typography variant="h5" fontWeight={900} color={challanAlerts.pending.length > 0 ? '#92400e' : '#64748b'}>{challanAlerts.pending.length}</Typography>
                  </Box>

                  <Box
                    onClick={() => handleAlertClick('STAMP', challanAlerts.stamp)}
                    display="flex" alignItems="center" gap={2} p={2} mb={2} borderRadius="12px"
                    sx={{ cursor: 'pointer', bgcolor: challanAlerts.stamp.length > 0 ? '#f0fdf4' : '#f8fafc', border: `1px solid ${challanAlerts.stamp.length > 0 ? '#bbf7d0' : '#e2e8f0'}`, transition: 'all 0.2s', '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' } }}
                  >
                    <CheckCircleOutlineIcon sx={{ color: challanAlerts.stamp.length > 0 ? '#16a34a' : '#94a3b8', fontSize: 32 }} />
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" fontWeight={800} color={challanAlerts.stamp.length > 0 ? '#15803d' : '#64748b'}>STAMP Bills</Typography>
                      <Typography variant="caption" fontWeight={600} color={challanAlerts.stamp.length > 0 ? '#16a34a' : '#94a3b8'}>Click to view STAMP records</Typography>
                    </Box>
                    <Typography variant="h5" fontWeight={900} color={challanAlerts.stamp.length > 0 ? '#14532d' : '#64748b'}>{challanAlerts.stamp.length}</Typography>
                  </Box>

                  <Box
                    onClick={() => handleAlertClick('NON-STAMP', challanAlerts.nonStamp)}
                    display="flex" alignItems="center" gap={2} p={2} borderRadius="12px"
                    sx={{ cursor: 'pointer', bgcolor: challanAlerts.nonStamp.length > 0 ? '#fff1f2' : '#f8fafc', border: `1px solid ${challanAlerts.nonStamp.length > 0 ? '#fecdd3' : '#e2e8f0'}`, transition: 'all 0.2s', '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' } }}
                  >
                    <ErrorOutlineIcon sx={{ color: challanAlerts.nonStamp.length > 0 ? '#e11d48' : '#94a3b8', fontSize: 32 }} />
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" fontWeight={800} color={challanAlerts.nonStamp.length > 0 ? '#be123c' : '#64748b'}>NON-STAMP Bills</Typography>
                      <Typography variant="caption" fontWeight={600} color={challanAlerts.nonStamp.length > 0 ? '#e11d48' : '#94a3b8'}>Click to view NON-STAMP records</Typography>
                    </Box>
                    <Typography variant="h5" fontWeight={900} color={challanAlerts.nonStamp.length > 0 ? '#881337' : '#64748b'}>{challanAlerts.nonStamp.length}</Typography>
                  </Box>

                </CardContent>
              </Card>
            </Grid>

            {/* ==========================================
                SECTION 5: QUICK ACTIONS
               ========================================== */}
            <Grid item xs={12} lg={4}>
              <Typography variant="subtitle2" fontWeight={800} color="text.secondary" mb={1.5} sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                5. Quick Actions
              </Typography>
              <Card sx={{ borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', height: 'calc(100% - 34px)', bgcolor: '#0f172a' }}>
                <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>

                  <Button
                    fullWidth variant="contained"
                    startIcon={<PublishIcon />}
                    onClick={onUploadNew}
                    sx={{ py: 1.5, borderRadius: '10px', bgcolor: '#4f46e5', fontWeight: 800, '&:hover': { bgcolor: '#4338ca' } }}
                  >
                    Upload New Invoice
                  </Button>

                  <Button
                    fullWidth variant="contained"
                    startIcon={<PlayCircleOutlineIcon />}
                    onClick={() => alert('Batch Billing module not connected yet.')}
                    sx={{ py: 1.5, borderRadius: '10px', bgcolor: '#059669', fontWeight: 800, '&:hover': { bgcolor: '#047857' } }}
                  >
                    Run Batch Billing
                  </Button>

                  <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

                  <Button
                    fullWidth variant="outlined"
                    startIcon={<AssessmentIcon />}
                    onClick={onOpenCementRegister}
                    sx={{ py: 1, borderRadius: '10px', color: '#fff', borderColor: 'rgba(255,255,255,0.3)', fontWeight: 700, '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.05)' } }}
                  >
                    Open Cement Register
                  </Button>

                  <Button
                    fullWidth variant="outlined"
                    startIcon={<DescriptionIcon />}
                    onClick={onOpenPartyPayment}
                    sx={{ py: 1, borderRadius: '10px', color: '#fff', borderColor: 'rgba(255,255,255,0.3)', fontWeight: 700, '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.05)' } }}
                  >
                    Open Bill Register
                  </Button>

                  <Button
                    fullWidth variant="outlined"
                    startIcon={<LocalGasStationIcon />}
                    onClick={onOpenPumpPaymentRegister}
                    sx={{ py: 1, borderRadius: '10px', color: '#fff', borderColor: 'rgba(255,255,255,0.3)', fontWeight: 700, '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.05)' } }}
                  >
                    Pump Payment Register
                  </Button>

                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* ==========================================
              SECTION 6: LIVE TRENDS / ANALYTICS
             ========================================== */}
          <Card sx={{ width: '100%', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', mb: 5, bgcolor: '#fff', overflow: 'hidden' }}>
            <Box sx={{ bgcolor: '#f8fafc', px: { xs: 2, md: 4 }, py: 2.5, borderBottom: '1px solid #e2e8f0' }}>
              <Typography variant="subtitle2" fontWeight={800} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                6. Live Trends / Analytics
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
                      <Paper elevation={0} sx={{ p: 2, border: '1px solid #e2e8f0', borderRadius: '8px', bgcolor: '#f8fafc' }}>
                        <Typography variant="body2" color="text.secondary" fontWeight={700}>Total Lifting</Typography>
                        <Typography variant="h6" fontWeight={800} color="#0f172a">{metrics.cementMT} MT</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={6} md={4} lg={2}>
                      <Paper elevation={0} sx={{ p: 2, border: '1px solid #e2e8f0', borderRadius: '8px', bgcolor: '#f8fafc' }}>
                        <Typography variant="body2" color="text.secondary" fontWeight={700}>Total L/A Given</Typography>
                        <Typography variant="h6" fontWeight={800} color="#ef4444">₹{metrics.loadingAdvanceAmt.toLocaleString()}</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={6} md={4} lg={2}>
                      <Paper elevation={0} sx={{ p: 2, border: '1px solid #e2e8f0', borderRadius: '8px', bgcolor: '#f8fafc' }}>
                        <Typography variant="body2" color="text.secondary" fontWeight={700}>Cash Opening</Typography>
                        <Typography variant="h6" fontWeight={800} color="#0f172a">₹{metrics.cashOpeningBalance.toLocaleString()}</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={6} md={4} lg={2}>
                      <Paper elevation={0} sx={{ p: 2, border: '1px solid #e2e8f0', borderRadius: '8px', bgcolor: '#f8fafc' }}>
                        <Typography variant="body2" color="text.secondary" fontWeight={700}>Total Expense</Typography>
                        <Typography variant="h6" fontWeight={800} color="#f59e0b">₹{metrics.miscExpenses.toLocaleString()}</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={6} md={4} lg={2}>
                      <Paper elevation={0} sx={{ p: 2, border: '1px solid #e2e8f0', borderRadius: '8px', bgcolor: '#f8fafc' }}>
                        <Typography variant="body2" color="text.secondary" fontWeight={700}>Cash Closing</Typography>
                        <Typography variant="h6" fontWeight={800} color={metrics.closingAdvanceBalance >= 0 ? '#10b981' : '#ef4444'}>₹{metrics.closingAdvanceBalance.toLocaleString()}</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={6} md={4} lg={2}>
                      <Paper elevation={0} sx={{ p: 2, border: '1px solid #e2e8f0', borderRadius: '8px', bgcolor: '#f8fafc' }}>
                        <Typography variant="body2" color="text.secondary" fontWeight={700}>Total Fuel Issued</Typography>
                        <Typography variant="h6" fontWeight={800} color="#3b82f6">{metrics.fuelLtr} LTR</Typography>
                      </Paper>
                    </Grid>
                  </Grid>
                </Grid>

                {/* MONTHLY / YEARLY PERFORMANCE */}
                <Grid item xs={12}>
                  <Box sx={{ p: 4, borderRadius: '16px', border: '1px solid #e2e8f0', bgcolor: '#ffffff', display: 'flex', flexDirection: 'column', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
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
                              tickFormatter={(value) => `₹${value >= 1000 ? (value/1000).toFixed(0) + 'k' : value}`} 
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
            <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: '#fff' }}>
              <Tabs
                value={tabValue}
                onChange={(e, v) => setTabValue(v)}
                textColor="primary"
                indicatorColor="primary"
                variant="scrollable"
                scrollButtons="auto"
                sx={{
                  px: 2, py: 0.5,
                  '& .MuiTab-root': { fontWeight: 800, fontSize: 14, textTransform: 'none' }
                }}
              >
                <Tab label="Cement Loading (DB)" />
                <Tab label="Diesel Slips (DB)" />
              </Tabs>
            </Box>

            {/* Tab Panel 0: Cement Loading */}
            {tabValue === 0 && (
              <Box p={3} bgcolor="#fff">
                <Typography variant="h6" fontWeight={850} mb={2}>Cement Loading Register</Typography>
                {!data?.cement?.length ? (
                  <Typography color="text.secondary">No cement entries loaded on this date.</Typography>
                ) : (
                  <TableContainer component={Paper} sx={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: 'none' }}>
                    <Table size="small">
                      <TableHead sx={{ bgcolor: '#f8fafc' }}>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 800, color: '#475569' }}>GCN NO</TableCell>
                          <TableCell sx={{ fontWeight: 800, color: '#475569' }}>BILL NO</TableCell>
                          <TableCell sx={{ fontWeight: 800, color: '#475569' }}>INVOICE NO</TableCell>
                          <TableCell sx={{ fontWeight: 800, color: '#475569' }}>SITE</TableCell>
                          <TableCell sx={{ fontWeight: 800, color: '#475569' }}>BILLING RATE</TableCell>
                          <TableCell sx={{ fontWeight: 800, color: '#475569' }}>QTY (MT)</TableCell>
                          <TableCell sx={{ fontWeight: 800, color: '#475569' }}>AMOUNT</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {data.cement.map((e, idx) => (
                          <TableRow key={idx} hover>
                            <TableCell>{e["GCN NO"] || "-"}</TableCell>
                            <TableCell>{e["BILL NO"] || "-"}</TableCell>
                            <TableCell>{e["INVOICE NO"] || e["INVOICE NO."] || "-"}</TableCell>
                            <TableCell>{e["SITE"] || "-"}</TableCell>
                            <TableCell>₹{parseNum(e["BILLING"])?.toLocaleString() || "-"}</TableCell>
                            <TableCell>{e["MT"] || "-"}</TableCell>
                            <TableCell>₹{(parseNum(e["Billing Amount"]) || parseNum(e["AMOUNT"]))?.toLocaleString() || "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Box>
            )}

            {/* Tab Panel 1: Diesel slips */}
            {tabValue === 1 && (
              <Box p={3} bgcolor="#fff">
                <Typography variant="h6" fontWeight={850} mb={2}>Diesel Issuance Registry</Typography>
                {!data?.pumpSlips?.length ? (
                  <Typography color="text.secondary">No diesel slips issued on this date.</Typography>
                ) : (
                  <TableContainer component={Paper} sx={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: 'none' }}>
                    <Table size="small">
                      <TableHead sx={{ bgcolor: '#f8fafc' }}>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 800, color: '#475569' }}>PUMP NAME</TableCell>
                          <TableCell sx={{ fontWeight: 800, color: '#475569' }}>VEHICLE NUMBER</TableCell>
                          <TableCell sx={{ fontWeight: 800, color: '#475569' }}>SLIP NO</TableCell>
                          <TableCell sx={{ fontWeight: 800, color: '#475569' }}>QTY (LTR)</TableCell>
                          <TableCell sx={{ fontWeight: 800, color: '#475569' }}>AMOUNT</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {data.pumpSlips.map((e, idx) => (
                          <TableRow key={idx} hover>
                            <TableCell>{e["PUMP NAME"] || "-"}</TableCell>
                            <TableCell>{e["VEHICLE NUMBER"] || e["VEHICLE NO"] || "-"}</TableCell>
                            <TableCell>{e["HSD SLIP NO"] || "-"}</TableCell>
                            <TableCell>{e["HSD (LTR)"] || "-"}</TableCell>
                            <TableCell>₹{parseNum(e["HSD AMOUNT"])?.toLocaleString() || "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Box>
            )}
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
        <DialogTitle sx={{ p: 3, bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box display="flex" alignItems="center" gap={1.5}>
            <span style={{ fontSize: '24px' }}>📋</span>
            <Typography variant="h6" fontWeight={800} color="#0f172a">
              Total Bill Breakdown
            </Typography>
          </Box>
          <IconButton onClick={() => setBillBreakdownOpen(false)} sx={{ bgcolor: '#f1f5f9', '&:hover': { bgcolor: '#e2e8f0' } }}>
            ✕
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: '#fff', px: 3, pt: 2 }}>
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
                    <TableCell sx={{ fontWeight: 800, bgcolor: '#f1f5f9', color: '#475569' }}>Bill Number</TableCell>
                    <TableCell sx={{ fontWeight: 800, bgcolor: '#f1f5f9', color: '#475569' }}>Invoice Number</TableCell>
                    {billTabValue === 0 && <TableCell sx={{ fontWeight: 800, bgcolor: '#f1f5f9', color: '#475569' }}>Invoice Date</TableCell>}
                    <TableCell sx={{ fontWeight: 800, bgcolor: '#f1f5f9', color: '#475569' }}>Vehicle Number</TableCell>
                    {billTabValue === 0 && <TableCell sx={{ fontWeight: 800, bgcolor: '#f1f5f9', color: '#475569' }}>Party Name</TableCell>}
                    <TableCell sx={{ fontWeight: 800, bgcolor: '#f1f5f9', color: '#475569' }}>Bill Amount</TableCell>
                    <TableCell sx={{ fontWeight: 800, bgcolor: '#f1f5f9', color: '#475569' }}>Status</TableCell>
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
      <Dialog open={alertModalOpen} onClose={() => setAlertModalOpen(false)} maxWidth="lg" fullWidth PaperProps={{ sx: { borderRadius: '16px', bgcolor: '#f8fafc' } }}>
        <DialogTitle sx={{ bgcolor: '#ffffff', borderBottom: '1px solid #e2e8f0', px: 3, py: 2.5 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6" fontWeight={800} color="#0f172a">
              {alertModalTitle}
            </Typography>
            <Chip label={`${alertModalData.length} Records`} sx={{ bgcolor: '#e0e7ff', color: '#4338ca', fontWeight: 800, borderRadius: '8px' }} />
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          <TableContainer component={Paper} sx={{ borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)', border: '1px solid #e2e8f0' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f1f5f9' }}>
                  <TableCell sx={{ fontWeight: 800, color: '#475569', py: 2 }}>SL</TableCell>
                  <TableCell sx={{ fontWeight: 800, color: '#475569' }}>VEHICLE</TableCell>
                  <TableCell sx={{ fontWeight: 800, color: '#475569' }}>DATE</TableCell>
                  <TableCell sx={{ fontWeight: 800, color: '#475569' }}>PARTY</TableCell>
                  <TableCell sx={{ fontWeight: 800, color: '#475569' }}>DESTINATION</TableCell>
                  <TableCell sx={{ fontWeight: 800, color: '#475569' }}>CHALLAN STATUS</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {alertModalData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4, color: '#64748b', fontWeight: 600 }}>
                      No records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  alertModalData.map((row, idx) => (
                    <TableRow key={idx} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                      <TableCell>{idx + 1}</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: '#0f172a' }}>{row["VEHICLE NUMBER"] || row["VEHICLE NO"] || row["VEHICLE NO."] || "-"}</TableCell>
                      <TableCell>{row["LOADING DT"] || row["LOADING DATE"] || row["BILL DATE"] || "-"}</TableCell>
                      <TableCell>{row["PARTY NAME"] || "-"}</TableCell>
                      <TableCell>{row["DESTINATION"] || row["SITE"] || "-"}</TableCell>
                      <TableCell>
                        <Chip size="small" label={row["CHALLAN STATUS"] || "Pending"} sx={{ fontWeight: 700, fontSize: '0.7rem' }} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 0 }}>
          <Button onClick={() => setAlertModalOpen(false)} variant="contained" sx={{ bgcolor: '#0f172a', color: '#fff', borderRadius: '8px', px: 4, fontWeight: 700, '&:hover': { bgcolor: '#1e293b' } }}>
            Close
          </Button>
        </DialogActions>
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
      }
    } catch (err) {
      console.error(err);
      setSnack({ msg: 'Failed to fetch party names', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  if (selectedParty && selectedVehicle) {
    return (
      <PartyReportView
        partyName={selectedParty}
        selectedVehicle={selectedVehicle}
        ownerDetails={ownerDetailsMap[selectedParty] || {}}
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
    <Box sx={{ bgcolor: '#f8fafc', minHeight: '100vh', pb: 6 }}>
      {/* --- Sticky Header --- */}
      <Box sx={{
        position: 'sticky', top: 0, zIndex: 10,
        bgcolor: '#ffffff', color: '#0f172a',
        px: { xs: 2, md: 4 }, py: 2,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.1)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <IconButton onClick={onBack} sx={{ color: '#0f172a', bgcolor: '#f1f5f9', '&:hover': { bgcolor: '#e2e8f0' } }}>
            <ArrowBackIcon />
          </IconButton>
          <Box>
            <Typography variant="h5" fontWeight={900} sx={{ letterSpacing: '-0.5px' }}>
              Daily Operations Dashboard
            </Typography>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
              All Party Reports Module
            </Typography>
          </Box>
        </Box>

        <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'center' }}>
          <Tabs
            value={mainTab}
            onChange={(e, v) => setMainTab(v)}
            sx={{
              minHeight: 40,
              '& .MuiTab-root': {
                minHeight: 40,
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 800,
                px: 3,
                mx: 1,
                transition: 'all 0.3s ease'
              },
              '& .Mui-selected': {
                bgcolor: '#0f172a',
                color: '#fff !important',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
              }
            }}
            TabIndicatorProps={{ style: { display: 'none' } }}
          >
            <Tab label="DAILY SUMMARY REPORTS" />
            <Tab label="ALL PARTY REPORTS" />
          </Tabs>
        </Box>

        <Box sx={{ width: 170 }}>
          <Tooltip title="Refresh Data">
            <IconButton onClick={fetchParties} sx={{ color: '#0f172a', bgcolor: '#f1f5f9', '&:hover': { bgcolor: '#e2e8f0' } }}>
              <RefreshIcon />
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
            sx={{ width: 350, bgcolor: '#fff', borderRadius: 2, '& fieldset': { borderColor: '#e2e8f0' } }}
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
                    <AccordionDetails sx={{ p: 0, bgcolor: '#fff', borderTop: '1px solid #e2e8f0' }}>
                      <List disablePadding>
                        {vehicles.length === 0 ? (
                          <ListItem sx={{ py: 3, px: 3 }}>
                            <Typography variant="body2" color="text.secondary" fontWeight={500}>No vehicles registered to this owner.</Typography>
                          </ListItem>
                        ) : (
                          vehicles.map((v, i) => (
                            <React.Fragment key={v}>
                              <ListItem sx={{ py: 2, px: { xs: 2, md: 4 }, display: 'flex', justifyContent: 'space-between', '&:hover': { bgcolor: '#f8fafc' }, transition: 'background-color 0.2s' }}>
                                <Box display="flex" alignItems="center" gap={2}>
                                  <LocalShippingIcon sx={{ color: '#94a3b8', fontSize: 24 }} />
                                  <Typography variant="body1" fontWeight={700} color="#1e293b" sx={{ letterSpacing: '0.5px' }}>
                                    {v}
                                  </Typography>
                                </Box>
                                <Button
                                  variant="contained"
                                  size="small"
                                  onClick={() => { setSelectedParty(party); setSelectedVehicle(v); }}
                                  sx={{
                                    borderRadius: '8px', fontWeight: 800, textTransform: 'none', py: 0.5, px: 2,
                                    bgcolor: '#fff', color: '#0f172a', border: '1px solid #cbd5e1', boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                    '&:hover': { bgcolor: '#0f172a', color: '#fff', borderColor: '#0f172a' }
                                  }}
                                >
                                  VIEW REPORT
                                </Button>
                              </ListItem>
                              {i < vehicles.length - 1 && <Divider sx={{ mx: 4 }} />}
                            </React.Fragment>
                          ))
                        )}
                      </List>
                    </AccordionDetails>
                  </Accordion>
                );
              })}
              {filteredParties.length === 0 && (
                <Card sx={{ p: 8, textAlign: 'center', borderRadius: '16px', border: '1px dashed #cbd5e1', boxShadow: 'none', bgcolor: '#fff' }}>
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

  if (mainTab === 0) {
    return <DailySummaryTab {...props} mainTab={mainTab} setMainTab={setMainTab} />;
  } else {
    return <AllPartyReportsTab {...props} mainTab={mainTab} setMainTab={setMainTab} />;
  }
}
