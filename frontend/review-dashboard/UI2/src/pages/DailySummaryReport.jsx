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
import TableChartIcon from '@mui/icons-material/TableChart';
import axios from 'axios';
import * as XLSX from 'xlsx';

const API_URL = import.meta.env.VITE_API_URL || '/api';

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
        { Metric: "Net Cash Balance Flow", Value: `₹${(metrics.cashIn - metrics.cashOut).toLocaleString()}` },
        { Metric: "Total Fuel Issued (LTR)", Value: metrics.fuelLtr },
        { Metric: "Total Fuel Slips", Value: metrics.fuelSlips },
        { Metric: "Total Vouchers Created", Value: metrics.voucherCount },
        { Metric: "Total Voucher Amount", Value: `₹${metrics.voucherAmount.toLocaleString()}` }
      ];
      const wsSummary = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

      // 2. Cement Register
      const cementRows = (data.cement || []).map((e, idx) => ({
        "SL NO": idx + 1,
        "GCN NO": e["GCN NO"] || "",
        "BILL NO": e["BILL NO"] || "",
        "INVOICE NO": e["INVOICE NO"] || e["INVOICE NO."] || "",
        "SITE": e["SITE"] || "",
        "BILLING RATE": parseFloat(e["BILLING"]) || 0,
        "QUANTITY (MT)": parseFloat(e["MT"]) || 0,
        "BILLING AMOUNT": parseFloat(e["Billing Amount"]) || parseFloat(e["AMOUNT"]) || 0
      }));
      const wsCement = XLSX.utils.json_to_sheet(cementRows);
      XLSX.utils.book_append_sheet(wb, wsCement, "Cement Register");

      // 3. Cashbook
      const cashbookRows = (data.cashbook || []).map(e => ({
        "SL NO": e["SL NO"] || "",
        "DATE": e["DATE"] || "",
        "PARTICULARS": e["PARTICULARS"] || "",
        "RECEIPTS": parseFloat(e["RECEIPTS"]) || 0,
        "PAYMENTS": parseFloat(e["PAYMENTS"]) || 0,
        "BALANCE": parseFloat(e["BALANCE"]) || 0
      }));
      const wsCash = XLSX.utils.json_to_sheet(cashbookRows);
      XLSX.utils.book_append_sheet(wb, wsCash, "Cashbook");

      // 4. Diesel slips
      const fuelRows = (data.pumpSlips || []).map((e, idx) => ({
        "SL NO": idx + 1,
        "PUMP NAME": e["PUMP NAME"] || "",
        "VEHICLE NO": e["VEHICLE NUMBER"] || e["VEHICLE NO"] || "",
        "HSD SLIP NO": e["HSD SLIP NO"] || "",
        "HSD (LTR)": parseFloat(e["HSD (LTR)"]) || 0,
        "HSD AMOUNT": parseFloat(e["HSD AMOUNT"]) || 0
      }));
      const wsFuel = XLSX.utils.json_to_sheet(fuelRows);
      XLSX.utils.book_append_sheet(wb, wsFuel, "Diesel Slips");

      // 5. Vouchers
      const voucherRows = (data.vouchers || []).map((e, idx) => ({
        "SL NO": idx + 1,
        "VOUCHER NUMBER": e.voucherNumber || "",
        "EXPENSE TYPE": e.expenseType || "",
        "VEHICLE NUMBER": e.vehicleNumber || "",
        "PURPOSE": e.purpose || "",
        "AMOUNT": parseFloat(e.amount) || 0,
        "REMARKS": e.remarks || ""
      }));
      const wsVoucher = XLSX.utils.json_to_sheet(voucherRows);
      XLSX.utils.book_append_sheet(wb, wsVoucher, "Vouchers");

      XLSX.writeFile(wb, `Daily_Operations_Report_${date}.xlsx`);
      setSnack({ severity: 'success', msg: 'Daily Excel operations report downloaded successfully.' });
    } catch (err) {
      console.error(err);
      setSnack({ severity: 'error', msg: 'Failed to generate Excel report file.' });
    }
  };

  const metrics = useMemo(() => {
    if (!data) return { cementMT: 0, cementTrips: 0, cashIn: 0, cashOut: 0, fuelLtr: 0, fuelSlips: 0, voucherCount: 0, voucherAmount: 0 };
    
    // Cement
    let cMT = 0;
    (data.cement || []).forEach(e => {
      cMT += parseFloat(e["MT"]) || 0;
    });

    // Cashbook
    let cIn = 0;
    let cOut = 0;
    (data.cashbook || []).forEach(e => {
      cIn += parseFloat(e["RECEIPTS"]) || 0;
      cOut += parseFloat(e["PAYMENTS"]) || 0;
    });

    // Fuel Slips
    let fL = 0;
    (data.pumpSlips || []).forEach(e => {
      fL += parseFloat(e["HSD (LTR)"]) || 0;
    });

    // Vouchers
    let vAmt = 0;
    (data.vouchers || []).forEach(e => {
      vAmt += parseFloat(e.amount) || 0;
    });

    return {
      cementMT: Math.round(cMT * 100) / 100,
      cementTrips: (data.cement || []).length,
      cashIn: cIn,
      cashOut: cOut,
      fuelLtr: Math.round(fL * 100) / 100,
      fuelSlips: (data.pumpSlips || []).length,
      voucherCount: (data.vouchers || []).length,
      voucherAmount: vAmt
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
          <Grid container spacing={3} mb={4}>
            {/* Cement Card */}
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ borderRadius: '16px', background: 'linear-gradient(135deg, #004d40 0%, #00796b 100%)', color: '#fff' }}>
                <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="caption" sx={{ opacity: 0.8, fontWeight: 700, textTransform: 'uppercase' }}>Cement Loaded</Typography>
                    <Typography variant="h4" fontWeight={950} mt={0.5}>{metrics.cementMT} <span style={{ fontSize: 16 }}>MT</span></Typography>
                    <Typography variant="body2" sx={{ opacity: 0.7, mt: 0.5 }}>{metrics.cementTrips} Trip(s)</Typography>
                  </Box>
                  <LocalShippingIcon sx={{ fontSize: 48, opacity: 0.3 }} />
                </CardContent>
              </Card>
            </Grid>

            {/* Cash Balance Card */}
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ borderRadius: '16px', background: 'linear-gradient(135deg, #b45309 0%, #d97706 100%)', color: '#fff' }}>
                <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="caption" sx={{ opacity: 0.8, fontWeight: 700, textTransform: 'uppercase' }}>Net Cash Flow</Typography>
                    <Typography variant="h4" fontWeight={950} mt={0.5}>₹{(metrics.cashIn - metrics.cashOut).toLocaleString()}</Typography>
                    <Typography variant="body2" sx={{ opacity: 0.7, mt: 0.5 }}>In: ₹{metrics.cashIn.toLocaleString()} | Out: ₹{metrics.cashOut.toLocaleString()}</Typography>
                  </Box>
                  <CurrencyRupeeIcon sx={{ fontSize: 48, opacity: 0.3 }} />
                </CardContent>
              </Card>
            </Grid>

            {/* Diesel Card */}
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ borderRadius: '16px', background: 'linear-gradient(135deg, #0369a1 0%, #0284c7 100%)', color: '#fff' }}>
                <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="caption" sx={{ opacity: 0.8, fontWeight: 700, textTransform: 'uppercase' }}>Diesel Issued</Typography>
                    <Typography variant="h4" fontWeight={950} mt={0.5}>{metrics.fuelLtr} <span style={{ fontSize: 16 }}>LTR</span></Typography>
                    <Typography variant="body2" sx={{ opacity: 0.7, mt: 0.5 }}>{metrics.fuelSlips} Slip(s)</Typography>
                  </Box>
                  <LocalGasStationIcon sx={{ fontSize: 48, opacity: 0.3 }} />
                </CardContent>
              </Card>
            </Grid>

            {/* Vouchers Card */}
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ borderRadius: '16px', background: 'linear-gradient(135deg, #701a75 0%, #86198f 100%)', color: '#fff' }}>
                <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="caption" sx={{ opacity: 0.8, fontWeight: 700, textTransform: 'uppercase' }}>Vouchers Value</Typography>
                    <Typography variant="h4" fontWeight={950} mt={0.5}>₹{metrics.voucherAmount.toLocaleString()}</Typography>
                    <Typography variant="body2" sx={{ opacity: 0.7, mt: 0.5 }}>{metrics.voucherCount} Voucher(s)</Typography>
                  </Box>
                  <ReceiptLongIcon sx={{ fontSize: 48, opacity: 0.3 }} />
                </CardContent>
              </Card>
            </Grid>
          </Grid>

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
                <Tab label="Cashbook" />
                <Tab label="Diesel slips" />
                <Tab label="Vouchers" />
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
                            <TableCell>₹{parseFloat(e["BILLING"])?.toLocaleString() || "-"}</TableCell>
                            <TableCell>{e["MT"] || "-"}</TableCell>
                            <TableCell>₹{(parseFloat(e["Billing Amount"]) || parseFloat(e["AMOUNT"]))?.toLocaleString() || "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Box>
            )}

            {/* Tab Panel 1: Cashbook */}
            {tabValue === 1 && (
              <Box p={3} bgcolor="#fff">
                <Typography variant="h6" fontWeight={850} mb={2}>Cashbook Registry</Typography>
                {!data?.cashbook?.length ? (
                  <Typography color="text.secondary">No cashbook transactions on this date.</Typography>
                ) : (
                  <TableContainer component={Paper} sx={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: 'none' }}>
                    <Table>
                      <TableHead sx={{ bgcolor: '#f8fafc' }}>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 850 }}>SL NO</TableCell>
                          <TableCell sx={{ fontWeight: 850 }}>PARTICULARS</TableCell>
                          <TableCell sx={{ fontWeight: 850 }} align="right">RECEIPTS</TableCell>
                          <TableCell sx={{ fontWeight: 850 }} align="right">PAYMENTS</TableCell>
                          <TableCell sx={{ fontWeight: 850 }} align="right">BALANCE</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {data.cashbook.map((e, idx) => (
                          <TableRow key={idx}>
                            <TableCell>{e["SL NO"] || "-"}</TableCell>
                            <TableCell>{e["PARTICULARS"] || "-"}</TableCell>
                            <TableCell align="right" sx={{ color: parseFloat(e["RECEIPTS"]) > 0 ? '#166534' : 'inherit', fontWeight: parseFloat(e["RECEIPTS"]) > 0 ? 700 : 'inherit' }}>
                              {parseFloat(e["RECEIPTS"]) > 0 ? `₹${parseFloat(e["RECEIPTS"]).toLocaleString()}` : "-"}
                            </TableCell>
                            <TableCell align="right" sx={{ color: parseFloat(e["PAYMENTS"]) > 0 ? '#991b1b' : 'inherit', fontWeight: parseFloat(e["PAYMENTS"]) > 0 ? 700 : 'inherit' }}>
                              {parseFloat(e["PAYMENTS"]) > 0 ? `₹${parseFloat(e["PAYMENTS"]).toLocaleString()}` : "-"}
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700 }}>
                              ₹{parseFloat(e["BALANCE"])?.toLocaleString() || "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Box>
            )}

            {/* Tab Panel 2: Diesel slips */}
            {tabValue === 2 && (
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
                            <TableCell>₹{parseFloat(e["HSD AMOUNT"])?.toLocaleString() || "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Box>
            )}

            {/* Tab Panel 3: Vouchers */}
            {tabValue === 3 && (
              <Box p={3} bgcolor="#fff">
                <Typography variant="h6" fontWeight={850} mb={2}>Voucher Entry Ledger</Typography>
                {!data?.vouchers?.length ? (
                  <Typography color="text.secondary">No voucher entries created on this date.</Typography>
                ) : (
                  <TableContainer component={Paper} sx={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: 'none' }}>
                    <Table>
                      <TableHead sx={{ bgcolor: '#f8fafc' }}>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 850 }}>VOUCHER NO</TableCell>
                          <TableCell sx={{ fontWeight: 850 }}>EXPENSE TYPE</TableCell>
                          <TableCell sx={{ fontWeight: 850 }}>VEHICLE NUMBER</TableCell>
                          <TableCell sx={{ fontWeight: 850 }}>PURPOSE</TableCell>
                          <TableCell sx={{ fontWeight: 850 }}>AMOUNT</TableCell>
                          <TableCell sx={{ fontWeight: 850 }}>REMARKS</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {data.vouchers.map((e, idx) => (
                          <TableRow key={idx}>
                            <TableCell>{e.voucherNumber || "-"}</TableCell>
                            <TableCell>{e.expenseType || "-"}</TableCell>
                            <TableCell>{e.vehicleNumber || "-"}</TableCell>
                            <TableCell>{e.purpose || "-"}</TableCell>
                            <TableCell>₹{parseFloat(e.amount)?.toLocaleString() || "-"}</TableCell>
                            <TableCell>{e.remarks || "-"}</TableCell>
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
