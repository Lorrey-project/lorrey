import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Button, CircularProgress, Typography, IconButton,
  Card, CardContent, Grid, Tabs, Tab, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper,
  Snackbar, Alert, TextField, Tooltip, Dialog, DialogTitle,
  DialogContent, Chip, Divider
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
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

import axios from 'axios';
import * as XLSX from 'xlsx';

const API_URL = import.meta.env.VITE_API_URL;

const parseNum = (val) => parseFloat(String(val || 0).replace(/,/g, '')) || 0;

export default function DailySummaryReport({ 
  onBack, 
  onUploadNew, 
  onOpenCementRegister, 
  onOpenPartyPayment, 
  onOpenPumpPaymentRegister 
}) {
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [billBreakdownOpen, setBillBreakdownOpen] = useState(false);
  const [billTabValue, setBillTabValue] = useState(0);
  const [tabValue, setTabValue] = useState(0);
  const [snack, setSnack] = useState(null);

  const fetchData = useCallback(async (targetDate) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/daily-summary/data`, {
        params: { date: targetDate },
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
  }, []);

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
      invoicesUploaded: data.invoicesUploaded || 0,
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

  const invoiceStats = useMemo(() => {
    if (!data || !data.invoiceStats) return {
      totalUploaded: 0, successfullyProcessed: 0, pendingInvoices: 0, failedInvoices: 0,
      lastUploadTime: null, recentInvoices: []
    };
    return data.invoiceStats;
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
        <Box display="flex" alignItems="center" gap={2}>
          <TextField
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            size="small"
            sx={{
              bgcolor: '#f8fafc', borderRadius: '8px',
              width: 170,
              '& .MuiOutlinedInput-root': {
                '& fieldset': { borderColor: '#e2e8f0' },
              }
            }}
          />
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
                <Typography variant="caption" color="text.secondary" fontWeight={700} textTransform="uppercase">Total Invoices (DB)</Typography>
                <Typography variant="h4" fontWeight={900} mt={0.5} color="#0f172a">{metrics.invoicesUploaded}</Typography>
                <Typography variant="body2" color="text.secondary" mt={0.5} fontWeight={500}>Logged in system</Typography>
              </CardContent>
            </Card>

            <Card sx={{ borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', borderLeft: '4px solid #0d9488' }}>
              <CardContent sx={{ p: '20px !important' }}>
                <Typography variant="caption" color="text.secondary" fontWeight={700} textTransform="uppercase">Total Cement Load</Typography>
                <Typography variant="h4" fontWeight={900} mt={0.5} color="#0f172a">{metrics.cementMT} <span style={{fontSize: 16, color: '#64748b'}}>MT</span></Typography>
                <Typography variant="body2" color="text.secondary" mt={0.5} fontWeight={500}>{metrics.cementTrips} Trip(s)</Typography>
              </CardContent>
            </Card>

            <Card sx={{ borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', borderLeft: '4px solid #0284c7' }}>
              <CardContent sx={{ p: '20px !important' }}>
                <Typography variant="caption" color="text.secondary" fontWeight={700} textTransform="uppercase">Total Diesel</Typography>
                <Typography variant="h4" fontWeight={900} mt={0.5} color="#0f172a">{metrics.fuelLtr} <span style={{fontSize: 16, color: '#64748b'}}>LTR</span></Typography>
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
                <Typography variant="h4" fontWeight={900} mt={0.5} color="#0f172a">₹{metrics.closingAdvanceBalance.toLocaleString(undefined, {minimumFractionDigits: 2})}</Typography>
                <Typography variant="body2" color="text.secondary" mt={0.5} fontWeight={500}>End of day balance</Typography>
              </CardContent>
            </Card>

            <Card 
                onClick={() => setBillBreakdownOpen(true)}
                sx={{ borderRadius: '12px', boxShadow: '0 4px 12px rgba(217,119,6,0.15)', border: '1px solid #fcd34d', bgcolor: '#fffbeb', cursor: 'pointer', transition: 'all 0.2s', '&:hover': { transform: 'translateY(-2px)'} }}
            >
              <CardContent sx={{ p: '20px !important' }}>
                <Typography variant="caption" color="#92400e" fontWeight={800} textTransform="uppercase">Total Bill Amount</Typography>
                <Typography variant="h4" fontWeight={900} mt={0.5} color="#78350f">₹{metrics.totalBillAmt.toLocaleString(undefined, {minimumFractionDigits: 2})}</Typography>
                <Typography variant="body2" color="#b45309" mt={0.5} fontWeight={600}>Pending Bills: {billBreakdown.totalPendingCount}</Typography>
              </CardContent>
            </Card>
          </Box>


          {/* ==========================================
              SECTION 2: INVOICE SECTION (HERO PANEL)
             ========================================== */}
          <Typography variant="subtitle2" fontWeight={800} color="text.secondary" mb={1.5} sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
            2. Invoice Uploads & Processing
          </Typography>
          <Card sx={{ borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', mb: 4, overflow: 'hidden' }}>
            <Box sx={{ p: 3, background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', color: '#fff' }}>
                <Grid container spacing={3} alignItems="center">
                    <Grid item xs={12} md={3}>
                        <Box display="flex" alignItems="center" gap={2}>
                            <Box sx={{ p: 1.5, bgcolor: 'rgba(255,255,255,0.1)', borderRadius: '12px' }}>
                                <PublishIcon sx={{ fontSize: 32 }} />
                            </Box>
                            <Box>
                                <Typography variant="h3" fontWeight={900}>{invoiceStats.totalUploaded}</Typography>
                                <Typography variant="body2" fontWeight={600} sx={{ opacity: 0.8 }}>Invoices Uploaded Today</Typography>
                                {invoiceStats.lastUploadTime && (
                                    <Typography variant="caption" sx={{ opacity: 0.6, display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                                        <AccessTimeIcon sx={{ fontSize: 14 }} /> Last: {new Date(invoiceStats.lastUploadTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                    </Typography>
                                )}
                            </Box>
                        </Box>
                    </Grid>
                    <Grid item xs={12} md={9}>
                        <Grid container spacing={2}>
                            <Grid item xs={4}>
                                <Box sx={{ bgcolor: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', p: 2, borderRadius: '12px' }}>
                                    <Typography variant="caption" fontWeight={700} sx={{ color: '#34d399', textTransform: 'uppercase' }}>Processed</Typography>
                                    <Box display="flex" alignItems="center" gap={1} mt={0.5}>
                                        <CheckCircleOutlineIcon sx={{ color: '#34d399' }} />
                                        <Typography variant="h5" fontWeight={800}>{invoiceStats.successfullyProcessed}</Typography>
                                    </Box>
                                </Box>
                            </Grid>
                            <Grid item xs={4}>
                                <Box sx={{ bgcolor: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', p: 2, borderRadius: '12px' }}>
                                    <Typography variant="caption" fontWeight={700} sx={{ color: '#fbbf24', textTransform: 'uppercase' }}>Pending Review</Typography>
                                    <Box display="flex" alignItems="center" gap={1} mt={0.5}>
                                        <PendingActionsIcon sx={{ color: '#fbbf24' }} />
                                        <Typography variant="h5" fontWeight={800}>{invoiceStats.pendingInvoices}</Typography>
                                    </Box>
                                </Box>
                            </Grid>
                            <Grid item xs={4}>
                                <Box sx={{ bgcolor: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', p: 2, borderRadius: '12px' }}>
                                    <Typography variant="caption" fontWeight={700} sx={{ color: '#f87171', textTransform: 'uppercase' }}>Failed / Error</Typography>
                                    <Box display="flex" alignItems="center" gap={1} mt={0.5}>
                                        <ErrorOutlineIcon sx={{ color: '#f87171' }} />
                                        <Typography variant="h5" fontWeight={800}>{invoiceStats.failedInvoices}</Typography>
                                    </Box>
                                </Box>
                            </Grid>
                        </Grid>
                    </Grid>
                </Grid>
            </Box>
            
            <Box sx={{ p: 2, bgcolor: '#fff' }}>
                <Typography variant="subtitle2" fontWeight={800} color="#0f172a" mb={2}>Quick View: Recent Uploads</Typography>
                {invoiceStats.recentInvoices.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" p={2} textAlign="center">No invoices uploaded today.</Typography>
                ) : (
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow sx={{ '& th': { borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 700 } }}>
                                    <TableCell>Time</TableCell>
                                    <TableCell>Consignee / Party</TableCell>
                                    <TableCell>Status</TableCell>
                                    <TableCell align="right">Action</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {invoiceStats.recentInvoices.map((inv, idx) => (
                                    <TableRow key={idx} hover sx={{ '& td': { borderBottom: '1px solid #f1f5f9' } }}>
                                        <TableCell sx={{ color: '#475569', fontSize: '0.875rem' }}>{new Date(inv.created_at).toLocaleTimeString()}</TableCell>
                                        <TableCell sx={{ fontWeight: 600, color: '#0f172a' }}>{inv.consignee_name}</TableCell>
                                        <TableCell>
                                            <Chip 
                                                label={inv.status || 'pending'} 
                                                size="small" 
                                                sx={{ 
                                                    fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', height: 20,
                                                    bgcolor: inv.status === 'approved' ? '#d1fae5' : inv.status === 'failed' ? '#fee2e2' : '#fef3c7',
                                                    color: inv.status === 'approved' ? '#059669' : inv.status === 'failed' ? '#dc2626' : '#d97706'
                                                }} 
                                            />
                                        </TableCell>
                                        <TableCell align="right">
                                            <Button size="small" variant="text" sx={{ fontWeight: 700 }}>View</Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Box>
          </Card>


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
                            <Typography variant="body1" fontWeight={800} color="#0f172a">₹{metrics.cashReceivedAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</Typography>
                        </Box>
                        <Box display="flex" justifyContent="space-between" mb={2}>
                            <Typography variant="body2" color="text.secondary" fontWeight={600}>Opening Balance</Typography>
                            <Typography variant="body1" fontWeight={800} color="#0f172a">₹{metrics.cashOpeningBalance.toLocaleString(undefined, {minimumFractionDigits: 2})}</Typography>
                        </Box>
                        <Divider sx={{ my: 2 }} />
                        <Box display="flex" justifyContent="space-between" mb={2}>
                            <Typography variant="body2" color="text.secondary" fontWeight={600}>Loading Advance (-)</Typography>
                            <Typography variant="body1" fontWeight={800} color="#dc2626">₹{metrics.loadingAdvanceAmt.toLocaleString(undefined, {minimumFractionDigits: 2})}</Typography>
                        </Box>
                        <Box display="flex" justifyContent="space-between" mb={2}>
                            <Typography variant="body2" color="text.secondary" fontWeight={600}>Misc Expenses (-)</Typography>
                            <Typography variant="body1" fontWeight={800} color="#dc2626">₹{metrics.miscExpenses.toLocaleString(undefined, {minimumFractionDigits: 2})}</Typography>
                        </Box>
                        <Divider sx={{ my: 2 }} />
                        <Box display="flex" justifyContent="space-between" alignItems="center" p={1.5} bgcolor="#f8fafc" borderRadius="8px">
                            <Typography variant="subtitle1" fontWeight={800} color="#0f172a">Closing Advance</Typography>
                            <Typography variant="h6" fontWeight={900} color={metrics.closingAdvanceBalance < 0 ? '#dc2626' : '#059669'}>
                                ₹{metrics.closingAdvanceBalance.toLocaleString(undefined, {minimumFractionDigits: 2})}
                            </Typography>
                        </Box>
                        
                        <Box mt={3} p={2} bgcolor="#eff6ff" borderRadius="8px" border="1px dashed #bfdbfe">
                            <Box display="flex" justifyContent="space-between" mb={1}>
                                <Typography variant="caption" fontWeight={800} color="#1e40af" textTransform="uppercase">Total Gross Freight</Typography>
                                <Typography variant="subtitle2" fontWeight={900} color="#1e3a8a">₹{metrics.totalBillAmt.toLocaleString(undefined, {minimumFractionDigits: 2})}</Typography>
                            </Box>
                            <Box display="flex" justifyContent="space-between">
                                <Typography variant="caption" fontWeight={800} color="#1e40af" textTransform="uppercase">Pump Payments (HSD)</Typography>
                                <Typography variant="subtitle2" fontWeight={900} color="#1e3a8a">₹{metrics.totalPumpPaymentAmt.toLocaleString(undefined, {minimumFractionDigits: 2})}</Typography>
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
                        
                        <Box display="flex" alignItems="center" gap={2} p={2} mb={2} borderRadius="12px" sx={{ bgcolor: invoiceStats.pendingInvoices > 0 ? '#fffbeb' : '#f8fafc', border: `1px solid ${invoiceStats.pendingInvoices > 0 ? '#fde68a' : '#e2e8f0'}` }}>
                            <PendingActionsIcon sx={{ color: invoiceStats.pendingInvoices > 0 ? '#d97706' : '#94a3b8', fontSize: 32 }} />
                            <Box>
                                <Typography variant="h6" fontWeight={800} color={invoiceStats.pendingInvoices > 0 ? '#92400e' : '#64748b'}>{invoiceStats.pendingInvoices}</Typography>
                                <Typography variant="body2" fontWeight={600} color={invoiceStats.pendingInvoices > 0 ? '#b45309' : '#94a3b8'}>Invoices Pending Review</Typography>
                            </Box>
                        </Box>

                        <Box display="flex" alignItems="center" gap={2} p={2} mb={2} borderRadius="12px" sx={{ bgcolor: billBreakdown.totalPendingCount > 0 ? '#fff1f2' : '#f8fafc', border: `1px solid ${billBreakdown.totalPendingCount > 0 ? '#fecdd3' : '#e2e8f0'}` }}>
                            <WarningAmberIcon sx={{ color: billBreakdown.totalPendingCount > 0 ? '#e11d48' : '#94a3b8', fontSize: 32 }} />
                            <Box>
                                <Typography variant="h6" fontWeight={800} color={billBreakdown.totalPendingCount > 0 ? '#be123c' : '#64748b'}>{billBreakdown.totalPendingCount}</Typography>
                                <Typography variant="body2" fontWeight={600} color={billBreakdown.totalPendingCount > 0 ? '#e11d48' : '#94a3b8'}>Pending Bills to Generate</Typography>
                            </Box>
                        </Box>

                        <Box display="flex" alignItems="center" gap={2} p={2} borderRadius="12px" sx={{ bgcolor: metrics.missingChallans > 0 ? '#fef2f2' : '#f8fafc', border: `1px solid ${metrics.missingChallans > 0 ? '#fecaca' : '#e2e8f0'}` }}>
                            <ErrorOutlineIcon sx={{ color: metrics.missingChallans > 0 ? '#dc2626' : '#94a3b8', fontSize: 32 }} />
                            <Box>
                                <Typography variant="h6" fontWeight={800} color={metrics.missingChallans > 0 ? '#991b1b' : '#64748b'}>{metrics.missingChallans}</Typography>
                                <Typography variant="body2" fontWeight={600} color={metrics.missingChallans > 0 ? '#ef4444' : '#94a3b8'}>Missing GCN / Challan Nos</Typography>
                            </Box>
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
                    <Typography variant="caption" color="text.secondary">{billBreakdown.pending.length} Bills | ₹{billBreakdown.pendingAmt.toLocaleString(undefined, {minimumFractionDigits:2})}</Typography>
                  </Box>
                }
              />
              <Tab 
                label={
                  <Box>
                    <Typography fontWeight={700}>Non-Stamp</Typography>
                    <Typography variant="caption" color="text.secondary">{billBreakdown.nonStamp.length} Bills | ₹{billBreakdown.nonStampAmt.toLocaleString(undefined, {minimumFractionDigits:2})}</Typography>
                  </Box>
                }
              />
              <Tab 
                label={
                  <Box>
                    <Typography fontWeight={700}>Stamp</Typography>
                    <Typography variant="caption" color="text.secondary">{billBreakdown.stamp.length} Bills | ₹{billBreakdown.stampAmt.toLocaleString(undefined, {minimumFractionDigits:2})}</Typography>
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
                        <TableCell fontWeight={600}>₹{parseNum(row["Billing Amount"] || 0).toLocaleString(undefined, {minimumFractionDigits:2})}</TableCell>
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
