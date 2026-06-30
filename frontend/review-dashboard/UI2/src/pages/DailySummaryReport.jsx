import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Button, CircularProgress, Typography, IconButton,
  Card, CardContent, Grid, Tabs, Tab, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper,
  Snackbar, Alert, TextField, Tooltip
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import CurrencyRupeeIcon from '@mui/icons-material/CurrencyRupee';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import TableChartIcon from '@mui/icons-material/TableChart';
import axios from 'axios';
import * as XLSX from 'xlsx';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const parseNum = (val) => parseFloat(String(val || 0).replace(/,/g, '')) || 0;

export default function DailySummaryReport({ onBack }) {
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
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
        { Metric: "Total Cash Receipts", Value: `₹${metrics.cashIn.toLocaleString()}` },
        { Metric: "Total Cash Payments", Value: `₹${metrics.cashOut.toLocaleString()}` },
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
      cashReceivedAmount: 0, cashOpeningBalance: 0, miscExpenses: 0, closingAdvanceBalance: 0 
    };
    
    // Cement
    let cMT = 0;
    let advAmt = 0;
    const advVehicles = [];
    (data.cement || []).forEach(e => {
      cMT += parseNum(e["MT"]);
      const adv = parseNum(e["ADVANCE"] || e["LOADING ADVANCE"]);
      if (adv > 0) {
        advAmt += adv;
        const veh = e["VEHICLE NUMBER"] || e["VEHICLE NO"] || e["VEHICLE NO."] || "Unknown";
        if (veh !== "Unknown") {
          advVehicles.push(veh);
        }
      }
    });

    // Fuel Slips
    let fL = 0;
    (data.pumpSlips || []).forEach(e => {
      fL += parseNum(e["HSD (LTR)"]);
    });

    const cb = data.cashbookEntry || {};
    const cashRecv = parseNum(cb["P_WITHDRAW"]);
    const cashOpen = parseNum(cb["O_OPENING"]) + parseNum(cb["P_OPENING"]) + parseNum(cb["S_OPENING"]);
    const miscExp = parseNum(cb["O_EXPENSE"]);

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
      closingAdvanceBalance: (cashRecv - cashOpen - advAmt - miscExp)
    };
  }, [data]);

  return (
    <Box sx={{ bgcolor: '#f1f5f9', minHeight: '100vh', pb: 6 }}>
      {/* --- Sticky Header --- */}
      <Box sx={{
        position: 'sticky', top: 0, zIndex: 10,
        bgcolor: '#0f172a', color: '#fff',
        px: { xs: 2, md: 4 }, py: 2,
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <IconButton onClick={onBack} sx={{ color: '#fff', bgcolor: 'rgba(255,255,255,0.1)', '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' } }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h5" fontWeight={900} sx={{ letterSpacing: '-0.5px' }}>
            Daily Summary Report
          </Typography>
        </Box>
        <Box display="flex" alignItems="center" gap={2}>
          <TextField
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            size="small"
            sx={{
              bgcolor: '#fff', borderRadius: '8px',
              width: 170,
              '& .MuiOutlinedInput-root': {
                '& fieldset': { border: 'none' },
              }
            }}
          />
          <Tooltip title="Refresh Data">
            <IconButton onClick={() => fetchData(date)} sx={{ color: '#fff', bgcolor: 'rgba(255,255,255,0.1)', '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' } }}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            color="secondary"
            startIcon={<DownloadIcon />}
            onClick={handleExportExcel}
            disabled={!data}
            sx={{
              fontWeight: 800, borderRadius: '10px',
              background: 'linear-gradient(135deg, #a21caf #86198f)',
              color: '#fff',
              '&:hover': { background: 'linear-gradient(135deg, #be185d #9d174d)' }
            }}
          >
            Export Excel
          </Button>
        </Box>
      </Box>

      {loading ? (
        <Box display="flex" justifyContent="center" alignItems="center" height="70vh">
          <CircularProgress size={50} color="secondary" />
        </Box>
      ) : (
        <Box sx={{ px: { xs: 2, md: 4 }, mt: 4 }}>
          {/* --- KPI Grid --- */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(5, 1fr)' }, gap: 3, mb: 4 }}>
            {/* Total Invoices Card */}
            <Card sx={{ borderRadius: '16px', background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', color: '#fff' }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="caption" sx={{ opacity: 0.8, fontWeight: 700, textTransform: 'uppercase' }}>Invoices Uploaded</Typography>
                  <Typography variant="h4" fontWeight={950} mt={0.5}>{metrics.invoicesUploaded}</Typography>
                  <Typography variant="body2" sx={{ opacity: 0.7, mt: 0.5 }}>Processed automatically</Typography>
                </Box>
                <ReceiptLongIcon sx={{ fontSize: 48, opacity: 0.3 }} />
              </CardContent>
            </Card>

            {/* Cement Card */}
            <Card sx={{ borderRadius: '16px', background: 'linear-gradient(135deg, #004d40 0%, #00796b 100%)', color: '#fff' }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="caption" sx={{ opacity: 0.8, fontWeight: 700, textTransform: 'uppercase' }}>Total Cement Load</Typography>
                  <Typography variant="h4" fontWeight={950} mt={0.5}>{metrics.cementMT} <span style={{ fontSize: 16 }}>MT</span></Typography>
                  <Typography variant="body2" sx={{ opacity: 0.7, mt: 0.5 }}>{metrics.cementTrips} Trip(s)</Typography>
                </Box>
                <LocalShippingIcon sx={{ fontSize: 48, opacity: 0.3 }} />
              </CardContent>
            </Card>

            {/* Diesel Card */}
            <Card sx={{ borderRadius: '16px', background: 'linear-gradient(135deg, #0369a1 0%, #0284c7 100%)', color: '#fff' }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="caption" sx={{ opacity: 0.8, fontWeight: 700, textTransform: 'uppercase' }}>Total Diesel</Typography>
                  <Typography variant="h4" fontWeight={950} mt={0.5}>{metrics.fuelLtr} <span style={{ fontSize: 16 }}>LTR</span></Typography>
                  <Typography variant="body2" sx={{ opacity: 0.7, mt: 0.5 }}>{metrics.fuelSlips} Slip(s)</Typography>
                </Box>
                <LocalGasStationIcon sx={{ fontSize: 48, opacity: 0.3 }} />
              </CardContent>
            </Card>
            
            {/* Loading Advance Card */}
            <Card sx={{ borderRadius: '16px', background: 'linear-gradient(135deg, #4338ca 0%, #4f46e5 100%)', color: '#fff' }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="caption" sx={{ opacity: 0.8, fontWeight: 700, textTransform: 'uppercase' }}>Total Loading Advance</Typography>
                  <Typography variant="h4" fontWeight={950} mt={0.5}>₹{metrics.loadingAdvanceAmt.toLocaleString()}</Typography>
                  
                  <Tooltip 
                    title={
                      metrics.advanceVehicles.length > 0 
                        ? <Box sx={{ p: 0.5, maxHeight: 150, overflowY: 'auto' }}>
                            <Typography variant="body2" fontWeight={600} mb={1}>Vehicles:</Typography>
                            {metrics.advanceVehicles.map((v, i) => <Typography key={i} variant="caption" display="block">{v}</Typography>)}
                          </Box> 
                        : "No loading advances issued."
                    }
                    arrow
                    placement="top"
                  >
                    <Typography 
                      variant="body2" 
                      sx={{ 
                        opacity: 0.9, mt: 0.5, 
                        display: 'inline-block', 
                        cursor: 'help', 
                        borderBottom: '1px dotted rgba(255,255,255,0.6)' 
                      }}
                    >
                      {metrics.advanceVehicles.length} Vehicle(s)
                    </Typography>
                  </Tooltip>
                </Box>
                <AccountBalanceWalletIcon sx={{ fontSize: 48, opacity: 0.3 }} />
              </CardContent>
            </Card>

            {/* Closing Advance Calculation Card */}
            <Card sx={{ borderRadius: '16px', background: 'linear-gradient(135deg, #b91c1c 0%, #7f1d1d 100%)', color: '#fff' }}>
              <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <Typography variant="caption" sx={{ opacity: 0.9, fontWeight: 700, textTransform: 'uppercase', mb: 1 }}>Closing Advance Calculation</Typography>
                
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2" sx={{ opacity: 0.8 }}>Cash Received Amount:</Typography>
                  <Typography variant="body2" fontWeight={700}>₹{metrics.cashReceivedAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2" sx={{ opacity: 0.8 }}>Cash Opening Balance:</Typography>
                  <Typography variant="body2" fontWeight={700}>₹{metrics.cashOpeningBalance.toLocaleString(undefined, {minimumFractionDigits: 2})}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2" sx={{ opacity: 0.8 }}>Loading Advance Total:</Typography>
                  <Typography variant="body2" fontWeight={700}>₹{metrics.loadingAdvanceAmt.toLocaleString(undefined, {minimumFractionDigits: 2})}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
                  <Typography variant="body2" sx={{ opacity: 0.8 }}>Miscellaneous Expenses:</Typography>
                  <Typography variant="body2" fontWeight={700}>₹{metrics.miscExpenses.toLocaleString(undefined, {minimumFractionDigits: 2})}</Typography>
                </Box>

                <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.2)', pt: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body1" fontWeight={700}>Closing Balance:</Typography>
                  <Typography variant="h5" fontWeight={950}>₹{metrics.closingAdvanceBalance.toLocaleString(undefined, {minimumFractionDigits: 2})}</Typography>
                </Box>
              </CardContent>
            </Card>

          </Box>

          {/* --- Detail Sections --- */}
          <Paper sx={{ borderRadius: '20px', overflow: 'hidden', boxShadow: '0 4px 30px rgba(0,0,0,0.03)' }}>
            <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: '#fff' }}>
              <Tabs
                value={tabValue}
                onChange={(e, v) => setTabValue(v)}
                textColor="secondary"
                indicatorColor="secondary"
                variant="scrollable"
                scrollButtons="auto"
                sx={{
                  px: 2, py: 0.5,
                  '& .MuiTab-root': { fontWeight: 800, fontSize: 14, textTransform: 'none' }
                }}
              >
                <Tab label="Cement Loading" />
                <Tab label="Diesel slips" />
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
                    <Table>
                      <TableHead sx={{ bgcolor: '#f8fafc' }}>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 850 }}>GCN NO</TableCell>
                          <TableCell sx={{ fontWeight: 850 }}>BILL NO</TableCell>
                          <TableCell sx={{ fontWeight: 850 }}>INVOICE NO</TableCell>
                          <TableCell sx={{ fontWeight: 850 }}>SITE</TableCell>
                          <TableCell sx={{ fontWeight: 850 }}>BILLING RATE</TableCell>
                          <TableCell sx={{ fontWeight: 850 }}>QTY (MT)</TableCell>
                          <TableCell sx={{ fontWeight: 850 }}>AMOUNT</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {data.cement.map((e, idx) => (
                          <TableRow key={idx}>
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
                    <Table>
                      <TableHead sx={{ bgcolor: '#f8fafc' }}>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 850 }}>PUMP NAME</TableCell>
                          <TableCell sx={{ fontWeight: 850 }}>VEHICLE NUMBER</TableCell>
                          <TableCell sx={{ fontWeight: 850 }}>SLIP NO</TableCell>
                          <TableCell sx={{ fontWeight: 850 }}>QTY (LTR)</TableCell>
                          <TableCell sx={{ fontWeight: 850 }}>AMOUNT</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {data.pumpSlips.map((e, idx) => (
                          <TableRow key={idx}>
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
