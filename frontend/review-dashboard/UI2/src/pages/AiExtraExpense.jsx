import React, { useState, useEffect, useMemo } from 'react';
import { Box, Typography, Card, CardContent, Grid, IconButton, CircularProgress, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, TextField, FormControl, Select, MenuItem, Tabs, Tab, Dialog, DialogTitle, DialogContent, DialogActions, Button, Paper } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

const parseNum = (val) => {
  const n = parseFloat(String(val).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};

const fyMonths = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];
const monthNamesArray = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const fyOptions = ['FY 2024-25', 'FY 2025-26', 'FY 2026-27', 'FY 2027-28'];

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
  return { fy: currentFY, month: monthNamesArray[currentMonthIndex] };
};

const calculateAnalysisPeriod = (fy, month) => {
  if (!fy || !month) return { isFuture: true, startDate: null, endDate: null };
  const startYear = parseInt(fy.substring(3, 7), 10);
  const monthIdx = monthNamesArray.indexOf(month);
  const calendarYear = (monthIdx < 3) ? startYear + 1 : startYear;
  
  const today = new Date();
  today.setHours(0,0,0,0);
  const currentMonthIdx = today.getMonth();
  const currentYear = today.getFullYear();
  
  const startDate = new Date(calendarYear, monthIdx, 1);
  let endDate;
  let isFuture = false;
  
  if (calendarYear > currentYear || (calendarYear === currentYear && monthIdx > currentMonthIdx)) {
    isFuture = true;
    endDate = null;
  } else if (calendarYear === currentYear && monthIdx === currentMonthIdx) {
    endDate = new Date(today);
  } else {
    endDate = new Date(calendarYear, monthIdx + 1, 0); 
  }
  return { startDate, endDate, isFuture };
};

const formatDate = (d) => {
  if (!d) return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const parseDateObject = (dateStr) => {
  if (!dateStr) return null;
  const str = String(dateStr).trim();
  const parts = str.split(/[-/]/);
  let d = new Date(str);

  if (parts.length === 3) {
    let day, month, year;
    if (parts[0].length === 4) {
      year = parts[0];
      month = parts[1];
      day = parts[2];
    } else {
      day = parts[0];
      month = parts[1];
      year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
    }

    if (isNaN(parseInt(month, 10))) {
      d = new Date(`${month} ${day}, ${year}`);
    } else {
      d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
    }
  }

  if (!isNaN(d)) {
    d.setHours(0,0,0,0);
    return d;
  }
  return null;
};

const getVehicleStatusLabel = (v) => {
  const hasFuel = v.excessFuelSum > 0;
  const hasAdv = v.excessAdvSum > 0;
  if (hasFuel && hasAdv) return { label: 'EXCESS FUEL + EXPENSE', color: '#9f1239', bgcolor: '#fff1f2' };
  if (hasFuel) return { label: 'EXCESS FUEL', color: '#9a3412', bgcolor: '#fff7ed' };
  if (hasAdv) return { label: 'EXCESS EXPENSE', color: '#991b1b', bgcolor: '#fef2f2' };
  return { label: 'NORMAL', color: '#166534', bgcolor: '#f0fdf4' };
};

const VehicleDetailsModal = ({ open, vehicle: v, onClose, selectedMonth, currentTab }) => {
  const [tripFilter, setTripFilter] = useState('ALL');

  useEffect(() => {
    setTripFilter('ALL');
  }, [v, currentTab]);

  const filterOptions = useMemo(() => {
    if (currentTab === 0) return [{ label: 'All Trips', value: 'ALL' }, { label: 'Extra Fuel Trips', value: 'EXCESS' }, { label: 'Normal Trips', value: 'NORMAL' }];
    if (currentTab === 1) return [{ label: 'All Trips', value: 'ALL' }, { label: 'Extra Expense Trips', value: 'EXCESS' }, { label: 'Normal Trips', value: 'NORMAL' }];
    if (currentTab === 2) return [{ label: 'All Trips', value: 'ALL' }, { label: 'Both Excess Trips', value: 'EXCESS' }, { label: 'Normal Trips', value: 'NORMAL' }];
    return [{ label: 'All Trips', value: 'ALL' }]; 
  }, [currentTab]);

  const filteredTrips = useMemo(() => {
    if (!v) return [];
    return v.trips.filter(t => {
      if (tripFilter === 'ALL') return true;
      const hasFuel = t.excessFuel > 0;
      const hasAdv = t.excessAdv > 0;
      if (currentTab === 0) return tripFilter === 'EXCESS' ? hasFuel : !hasFuel;
      if (currentTab === 1) return tripFilter === 'EXCESS' ? hasAdv : !hasAdv;
      if (currentTab === 2) return tripFilter === 'EXCESS' ? (hasFuel && hasAdv) : !(hasFuel && hasAdv);
      return true;
    });
  }, [v, tripFilter, currentTab]);

  const getRowStyle = (t) => {
    const hasFuel = t.excessFuel > 0;
    const hasAdv = t.excessAdv > 0;
    let isHighlighted = false;
    if (currentTab === 0 && hasFuel) isHighlighted = true;
    if (currentTab === 1 && hasAdv) isHighlighted = true;
    if (currentTab === 2 && (hasFuel && hasAdv)) isHighlighted = true;

    return {
      bgcolor: isHighlighted ? '#fff1f2' : 'inherit',
      '&:hover': { bgcolor: isHighlighted ? '#ffe4e6' : '#f8fafc' }
    };
  };

  const getTripStatusLabel = (t) => {
    const hasFuel = t.excessFuel > 0;
    const hasAdv = t.excessAdv > 0;
    if (currentTab === 0) {
      return hasFuel ? <Typography variant="caption" sx={{ color: '#ef4444', fontWeight: 800, bgcolor: '#fef2f2', px: 1, py: 0.5, borderRadius: '4px' }}>EXTRA FUEL</Typography> : <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 700 }}>Normal</Typography>;
    }
    if (currentTab === 1) {
      return hasAdv ? <Typography variant="caption" sx={{ color: '#ef4444', fontWeight: 800, bgcolor: '#fef2f2', px: 1, py: 0.5, borderRadius: '4px' }}>EXTRA EXPENSE</Typography> : <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 700 }}>Normal</Typography>;
    }
    if (currentTab === 2) {
      if (hasFuel && hasAdv) return <Typography variant="caption" sx={{ color: '#e11d48', fontWeight: 800, bgcolor: '#fff1f2', px: 1, py: 0.5, borderRadius: '4px' }}>BOTH EXCESS</Typography>;
      if (hasFuel) return <Typography variant="caption" sx={{ color: '#f59e0b', fontWeight: 700 }}>Only Fuel</Typography>;
      if (hasAdv) return <Typography variant="caption" sx={{ color: '#f59e0b', fontWeight: 700 }}>Only Exp</Typography>;
      return <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 700 }}>Normal</Typography>;
    }
    return <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 700 }}>Normal</Typography>;
  };

  if (!open || !v) return null;

  const status = getVehicleStatusLabel(v);
  const fuelPct = v.expectedFuelSum > 0 ? ((v.excessFuelSum / v.expectedFuelSum) * 100).toFixed(0) : 0;
  const advPct = v.expectedAdvSum > 0 ? ((v.excessAdvSum / v.expectedAdvSum) * 100).toFixed(0) : 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth PaperProps={{ sx: { borderRadius: '24px', overflow: 'hidden' } }}>
      <DialogTitle sx={{ bgcolor: '#0f172a', color: 'white', p: 3 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="overline" sx={{ color: '#94a3b8', letterSpacing: 1.5, fontWeight: 800 }}>VEHICLE EXPENSE ANALYSIS</Typography>
            <Typography variant="h4" fontWeight={900} sx={{ mt: 0.5 }}>{v.vehicle}</Typography>
          </Box>
          <Box textAlign="right">
            <Typography variant="subtitle2" sx={{ color: '#cbd5e1' }}>MONTH</Typography>
            <Typography variant="h6" fontWeight={700}>{selectedMonth === 'ALL' ? 'ALL MONTHS' : selectedMonth.toUpperCase()}</Typography>
          </Box>
        </Box>
      </DialogTitle>
      
      <DialogContent sx={{ p: 4, bgcolor: '#f8fafc' }}>
        <Grid container spacing={4} mb={5} mt={0}>
          <Grid item xs={12} md={4}>
            <Card sx={{ borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: 'none' }}>
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary" fontWeight={800} mb={2}>FUEL ANALYSIS</Typography>
                <Box display="flex" justifyContent="space-between" mb={1}><Typography color="text.secondary">Expected Fuel:</Typography><Typography fontWeight={700}>{v.expectedFuelSum.toFixed(1)} L</Typography></Box>
                <Box display="flex" justifyContent="space-between" mb={1}><Typography color="text.secondary">Actual Fuel:</Typography><Typography fontWeight={700}>{v.actualFuelSum.toFixed(1)} L</Typography></Box>
                <Box display="flex" justifyContent="space-between" mb={1}><Typography color="text.secondary">Excess Fuel:</Typography><Typography fontWeight={900} color={v.excessFuelSum > 0 ? '#ef4444' : '#16a34a'}>{v.excessFuelSum > 0 ? '+' : ''}{v.excessFuelSum.toFixed(1)} L</Typography></Box>
                <Box display="flex" justifyContent="space-between"><Typography color="text.secondary">Excess %:</Typography><Typography fontWeight={900} color={v.excessFuelSum > 0 ? '#ef4444' : '#16a34a'}>{v.excessFuelSum > 0 ? `+${fuelPct}%` : '0%'}</Typography></Box>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <Card sx={{ borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: 'none' }}>
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary" fontWeight={800} mb={2}>EXPENSE ANALYSIS</Typography>
                <Box display="flex" justifyContent="space-between" mb={1}><Typography color="text.secondary">Expected Expense:</Typography><Typography fontWeight={700}>₹{Math.round(v.expectedAdvSum).toLocaleString()}</Typography></Box>
                <Box display="flex" justifyContent="space-between" mb={1}><Typography color="text.secondary">Actual Expense:</Typography><Typography fontWeight={700}>₹{Math.round(v.actualAdvSum).toLocaleString()}</Typography></Box>
                <Box display="flex" justifyContent="space-between" mb={1}><Typography color="text.secondary">Excess Expense:</Typography><Typography fontWeight={900} color={v.excessAdvSum > 0 ? '#ef4444' : '#16a34a'}>{v.excessAdvSum > 0 ? '+' : ''}₹{Math.round(v.excessAdvSum).toLocaleString()}</Typography></Box>
                <Box display="flex" justifyContent="space-between"><Typography color="text.secondary">Excess %:</Typography><Typography fontWeight={900} color={v.excessAdvSum > 0 ? '#ef4444' : '#16a34a'}>{v.excessAdvSum > 0 ? `+${advPct}%` : '0%'}</Typography></Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={4}>
            <Card sx={{ borderRadius: '16px', border: 'none', bgcolor: status.bgcolor, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', p: 2 }}>
              <Typography variant="overline" sx={{ color: status.color, fontWeight: 800, mb: 1 }}>AI STATUS</Typography>
              <Typography variant="h6" fontWeight={900} textAlign="center" sx={{ color: status.color }}>
                {status.label}
              </Typography>
              <Typography variant="h3" fontWeight={900} sx={{ color: status.color, mt: 2, opacity: 0.8 }}>
                {v.tripsCount} <span style={{ fontSize: '1rem' }}>TRIPS</span>
              </Typography>
            </Card>
          </Grid>
        </Grid>

        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6" fontWeight={900} color="#0f172a">COMPLETE TRIP HISTORY</Typography>
          <Box display="flex" gap={1}>
            {filterOptions.map(opt => (
              <Button
                key={opt.value}
                size="small"
                onClick={() => setTripFilter(opt.value)}
                variant={tripFilter === opt.value ? 'contained' : 'outlined'}
                sx={{ 
                  borderRadius: '20px', 
                  textTransform: 'none',
                  fontWeight: 700,
                  bgcolor: tripFilter === opt.value ? '#0f172a' : 'transparent',
                  color: tripFilter === opt.value ? '#fff' : '#64748b',
                  borderColor: '#cbd5e1',
                  '&:hover': { bgcolor: tripFilter === opt.value ? '#1e293b' : '#f1f5f9' }
                }}
              >
                {opt.label}
              </Button>
            ))}
          </Box>
        </Box>
        
        <TableContainer component={Paper} sx={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: 'none', maxHeight: 400, overflowY: 'auto' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f1f5f9' }}>
                <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f8fafc' }}>DATE</TableCell>
                <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f8fafc' }}>INV</TableCell>
                <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f8fafc' }}>DESTINATION</TableCell>
                <TableCell align="right" sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f8fafc' }}>EXP FUEL</TableCell>
                <TableCell align="right" sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f8fafc' }}>ACT FUEL</TableCell>
                <TableCell align="right" sx={{ fontWeight: 800, color: '#b45309', bgcolor: '#f8fafc' }}>EXC FUEL</TableCell>
                <TableCell align="right" sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f8fafc' }}>EXP ADV</TableCell>
                <TableCell align="right" sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f8fafc' }}>ACT ADV</TableCell>
                <TableCell align="right" sx={{ fontWeight: 800, color: '#b91c1c', bgcolor: '#f8fafc' }}>EXC ADV</TableCell>
                {currentTab !== 3 && <TableCell align="center" sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f8fafc' }}>TRIP STATUS</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredTrips.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary" fontWeight={600}>No trips found for this filter.</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                filteredTrips.map((t, i) => (
                  <TableRow key={i} hover sx={getRowStyle(t)}>
                    <TableCell sx={{ borderBottom: '1px solid #f1f5f9' }}>{t.date}</TableCell>
                    <TableCell sx={{ color: '#64748b', borderBottom: '1px solid #f1f5f9' }}>{t.invoice}</TableCell>
                    <TableCell sx={{ fontWeight: 700, borderBottom: '1px solid #f1f5f9' }}>{t.destination}</TableCell>
                    <TableCell align="right" sx={{ color: '#64748b', borderBottom: '1px solid #f1f5f9' }}>{t.expectedFuel > 0 ? t.expectedFuel.toFixed(1) : '-'}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, borderBottom: '1px solid #f1f5f9' }}>{t.actualFuel > 0 ? t.actualFuel.toFixed(1) : '-'}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800, color: t.excessFuel > 0 ? '#d97706' : '#94a3b8', borderBottom: '1px solid #f1f5f9' }}>{t.excessFuel > 0 ? `+${t.excessFuel.toFixed(1)}` : '-'}</TableCell>
                    <TableCell align="right" sx={{ color: '#64748b', borderBottom: '1px solid #f1f5f9' }}>{t.expectedAdv > 0 ? t.expectedAdv.toFixed(0) : '-'}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, borderBottom: '1px solid #f1f5f9' }}>{t.actualAdv > 0 ? t.actualAdv.toFixed(0) : '-'}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800, color: t.excessAdv > 0 ? '#ef4444' : '#94a3b8', borderBottom: '1px solid #f1f5f9' }}>{t.excessAdv > 0 ? `+${t.excessAdv.toFixed(0)}` : '-'}</TableCell>
                    {currentTab !== 3 && <TableCell align="center" sx={{ borderBottom: '1px solid #f1f5f9' }}>{getTripStatusLabel(t)}</TableCell>}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

      </DialogContent>
      <DialogActions sx={{ p: 3, bgcolor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
        <Button onClick={onClose} variant="contained" sx={{ bgcolor: '#0f172a', borderRadius: '8px', px: 4, fontWeight: 700, '&:hover': { bgcolor: '#334155' } }}>
          CLOSE WINDOW
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const AiExtraExpense = ({ onBack }) => {
  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  const initialSelection = useMemo(() => getCurrentFYAndMonth(), []);
  const [selectedFY, setSelectedFY] = useState(initialSelection.fy);
  const [selectedMonth, setSelectedMonth] = useState(initialSelection.month);
  const [currentTab, setCurrentTab] = useState(0);
  const [selectedVehicle, setSelectedVehicle] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/cement-register`);
      if (res.data.success) {
        setTrips(res.data.entries || []);
      }
    } catch (e) {
      console.error("Failed to fetch historical trips", e);
    } finally {
      setLoading(false);
    }
  };

  const { analysisPeriod, stats, excessFuelOnly, excessExpenseOnly, bothExcess, normalVehicles } = useMemo(() => {
    const period = calculateAnalysisPeriod(selectedFY, selectedMonth);
    
    if (!trips.length || period.isFuture) {
      return { analysisPeriod: period, stats: null, excessFuelOnly: [], excessExpenseOnly: [], bothExcess: [], normalVehicles: [] };
    }

    // 1. Calculate Historical Baselines (across all time)
    const destinationStats = {};
    trips.forEach(trip => {
      const site = String(trip["SITE"] || trip["DESTINATION"] || "Unknown").trim().toUpperCase();
      if (!site || site === "UNKNOWN") return;
      if (!destinationStats[site]) destinationStats[site] = { totalFuel: 0, fuelCount: 0, totalAdv: 0, advCount: 0 };
      
      const fuel = parseNum(trip["HSD (LTR)"]);
      const adv = parseNum(trip["ADVANCE"] || trip["LOADING ADVANCE"]);
      
      if (fuel > 0) {
        destinationStats[site].totalFuel += fuel;
        destinationStats[site].fuelCount += 1;
      }
      if (adv > 0) {
        destinationStats[site].totalAdv += adv;
        destinationStats[site].advCount += 1;
      }
    });

    const baselines = {};
    Object.keys(destinationStats).forEach(site => {
      const s = destinationStats[site];
      baselines[site] = {
        avgFuel: s.fuelCount > 0 ? (s.totalFuel / s.fuelCount) : 0,
        avgAdv: s.advCount > 0 ? (s.totalAdv / s.advCount) : 0
      };
    });

    // 2. Filter trips by selected date range
    const filteredTrips = trips.filter(t => {
      const tripDate = parseDateObject(t["LOADING DT"] || t["LOADING DATE"]);
      if (!tripDate) return false;
      return tripDate >= period.startDate && tripDate <= period.endDate;
    });

    let totalExpense = 0;
    let expectedExpenseTotal = 0;
    let extraExpenseTotal = 0;

    const vehicleMap = {};

    filteredTrips.forEach(trip => {
      const site = String(trip["SITE"] || trip["DESTINATION"] || "Unknown").trim().toUpperCase();
      const vehicle = String(trip["VEHICLE NUMBER"] || trip["VEHICLE NO"] || "Unknown").trim().toUpperCase();
      
      const actualFuel = parseNum(trip["HSD (LTR)"]);
      const actualAdv = parseNum(trip["ADVANCE"] || trip["LOADING ADVANCE"]);
      
      if (actualFuel === 0 && actualAdv === 0) return;
      const base = baselines[site];
      if (!base) return;

      if (!vehicleMap[vehicle]) {
        vehicleMap[vehicle] = { 
          vehicle, 
          tripsCount: 0, 
          expectedFuelSum: 0, 
          actualFuelSum: 0, 
          excessFuelSum: 0,
          expectedAdvSum: 0, 
          actualAdvSum: 0, 
          excessAdvSum: 0, 
          trips: []
        };
      }
      
      const v = vehicleMap[vehicle];
      v.tripsCount += 1;
      
      let excessFuelForTrip = 0;
      let excessAdvForTrip = 0;
      const expectedAdvForTrip = base.avgAdv > 0 ? base.avgAdv : actualAdv;
      
      // Expense Stats
      if (actualAdv > 0) {
        totalExpense += actualAdv;
        expectedExpenseTotal += expectedAdvForTrip;
        
        v.actualAdvSum += actualAdv;
        v.expectedAdvSum += expectedAdvForTrip;

        if (base.avgAdv > 0 && actualAdv > base.avgAdv) {
          excessAdvForTrip = actualAdv - base.avgAdv;
          extraExpenseTotal += excessAdvForTrip;
          v.excessAdvSum += excessAdvForTrip;
        }
      }

      // Fuel Stats
      if (actualFuel > 0) {
        v.actualFuelSum += actualFuel;
        v.expectedFuelSum += base.avgFuel > 0 ? base.avgFuel : actualFuel;

        if (base.avgFuel > 0 && actualFuel > base.avgFuel) {
          excessFuelForTrip = actualFuel - base.avgFuel;
          v.excessFuelSum += excessFuelForTrip;
        }
      }

      v.trips.push({
        date: trip["LOADING DT"] || trip["LOADING DATE"],
        invoice: trip["BILL NO"] || "—",
        destination: site,
        expectedFuel: base.avgFuel,
        actualFuel,
        excessFuel: excessFuelForTrip,
        expectedAdv: expectedAdvForTrip,
        actualAdv,
        excessAdv: excessAdvForTrip
      });
    });

    const exFuel = [];
    const exAdv = [];
    const both = [];
    const norm = [];

    Object.values(vehicleMap).forEach(v => {
      const hasFuel = v.excessFuelSum > 0;
      const hasAdv = v.excessAdvSum > 0;

      if (hasFuel && hasAdv) both.push(v);
      else if (hasFuel) exFuel.push(v);
      else if (hasAdv) exAdv.push(v);
      else norm.push(v);
    });

    exFuel.sort((a, b) => b.excessFuelSum - a.excessFuelSum);
    exAdv.sort((a, b) => b.excessAdvSum - a.excessAdvSum);
    both.sort((a, b) => (b.excessFuelSum + b.excessAdvSum) - (a.excessFuelSum + a.excessAdvSum));
    norm.sort((a, b) => b.tripsCount - a.tripsCount);

    return {
      analysisPeriod: period,
      stats: { totalExpense, expectedExpenseTotal, extraExpenseTotal },
      excessFuelOnly: exFuel,
      excessExpenseOnly: exAdv,
      bothExcess: both,
      normalVehicles: norm
    };
  }, [trips, selectedFY, selectedMonth]);

  const searchFilter = (list) => {
    if (!searchTerm) return list;
    const lower = searchTerm.toLowerCase();
    return list.filter(v => v.vehicle.toLowerCase().includes(lower));
  };

  const currentListData = currentTab === 0 ? searchFilter(excessFuelOnly) : 
                          currentTab === 1 ? searchFilter(excessExpenseOnly) :
                          currentTab === 2 ? searchFilter(bothExcess) :
                          searchFilter(normalVehicles);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100vh" bgcolor="#0f172a">
        <CircularProgress sx={{ color: '#8b5cf6' }} size={60} thickness={4} />
      </Box>
    );
  }

  const handleVehicleClick = (v) => {
    setSelectedVehicle(v);
  };



  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f4f6f8', pb: 6, fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif' }}>
      
      {/* ── HERO HEADER (AI Command Center) ── */}
      <Box sx={{ bgcolor: '#ffffff', borderBottom: '1px solid #e2e8f0', pt: { xs: 4, md: 5 }, pb: { xs: 4, md: 5 }, px: { xs: 2, md: 6 }, position: 'relative' }}>
        <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={3}>
          <Box display="flex" alignItems="center">
            <IconButton onClick={onBack} sx={{ mr: 3, border: '1px solid #e2e8f0', color: '#475569', '&:hover': { bgcolor: '#f8fafc' } }}>
              <ArrowBackIcon />
            </IconButton>
            <Box>
              <Typography variant="h5" fontWeight={900} sx={{ color: '#0f172a', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                THE AI with EXTRA EXPENSE
              </Typography>
              <Typography variant="body2" fontWeight={500} sx={{ color: '#64748b', mt: 0.5 }}>
                AI-Powered Extra Expense & Fuel Management
              </Typography>
            </Box>
          </Box>

          <Box display="flex" alignItems="center" gap={3}>
            <Box display="flex" alignItems="center" gap={2} bgcolor="#f8fafc" p={1.5} px={2.5} borderRadius="8px" border="1px solid #e2e8f0">
              <Typography variant="overline" sx={{ color: '#64748b', fontWeight: 700, lineHeight: 1 }}>FINANCIAL YEAR</Typography>
              <Select
                value={selectedFY}
                onChange={(e) => setSelectedFY(e.target.value)}
                size="small"
                variant="standard"
                disableUnderline
                sx={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9rem' }}
              >
                {fyOptions.map(fy => (
                  <MenuItem key={fy} value={fy} sx={{ fontWeight: 600 }}>{fy}</MenuItem>
                ))}
              </Select>
              
              <Box sx={{ width: '1px', height: '20px', bgcolor: '#cbd5e1', mx: 1 }} />
              
              <Typography variant="overline" sx={{ color: '#64748b', fontWeight: 700, lineHeight: 1 }}>MONTH</Typography>
              <Select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                size="small"
                variant="standard"
                disableUnderline
                sx={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9rem' }}
              >
                {fyMonths.map(m => (
                  <MenuItem key={m} value={m} sx={{ fontWeight: 600 }}>{m.toUpperCase()}</MenuItem>
                ))}
              </Select>
            </Box>
          </Box>
        </Box>
        
        {/* Analysis Period Indicator */}
        {!analysisPeriod.isFuture && analysisPeriod.startDate && (
          <Box mt={2} display="flex" justifyContent="flex-end">
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 500 }}>
              Analysis Period: <strong>{formatDate(analysisPeriod.startDate)} – {formatDate(analysisPeriod.endDate)}</strong>
            </Typography>
          </Box>
        )}
      </Box>

      {/* ── 4 TABS LAYOUT ── */}
      <Box sx={{ px: { xs: 2, md: 6 }, mt: 4, position: 'relative', zIndex: 2 }}>
        
        {analysisPeriod.isFuture ? (
          <Card sx={{ borderRadius: '20px', bgcolor: 'white', boxShadow: '0 10px 40px -10px rgba(0,0,0,0.05)', textAlign: 'center', py: 10, border: '1px solid #e2e8f0' }}>
            <CardContent>
              <WarningAmberIcon sx={{ fontSize: 48, color: '#94a3b8', mb: 2 }} />
              <Typography variant="h5" fontWeight={800} color="#1e293b" mb={1}>No Data Available Yet</Typography>
              <Typography variant="body1" color="#64748b">The selected month has not started.</Typography>
            </CardContent>
          </Card>
        ) : (
          <>
        {/* AI SUMMARY ROW */}
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} px={1} py={1.5} borderBottom="1px solid #e2e8f0">
          <Typography variant="h6" fontWeight={800} color="#0f172a">Vehicle Analysis</Typography>
          <Box display="flex" gap={2} alignItems="center">
            <Typography variant="body2" color="#475569">
              <strong style={{color: '#0f172a'}}>{excessFuelOnly.length + excessExpenseOnly.length + bothExcess.length + normalVehicles.length}</strong> Total Vehicles Analysed
            </Typography>
          </Box>
        </Box>

        {/* TABS HEADER - DASHBOARD TILES */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          {[
            { 
              tabIndex: 0, title: 'EXTRA FUEL', subtitle: 'Vehicles exceeding fuel limits', count: excessFuelOnly.length,
              icon: <LocalGasStationIcon sx={{ fontSize: 20 }} />, color: '#0284c7', activeBg: '#f0f9ff'
            },
            { 
              tabIndex: 1, title: 'EXTRA EXPENSE', subtitle: 'Vehicles with excess expense', count: excessExpenseOnly.length,
              icon: <AccountBalanceWalletIcon sx={{ fontSize: 20 }} />, color: '#1e3a8a', activeBg: '#eff6ff'
            },
            { 
              tabIndex: 2, title: 'EXTRA FUEL + EXPENSE', subtitle: 'Vehicles exceeding both limits', count: bothExcess.length,
              icon: <WarningAmberIcon sx={{ fontSize: 20 }} />, color: '#9f1239', activeBg: '#fff1f2'
            },
            { 
              tabIndex: 3, title: 'NORMAL VEHICLES', subtitle: 'Vehicles within approved limits', count: normalVehicles.length,
              icon: <CheckCircleIcon sx={{ fontSize: 20 }} />, color: '#0f766e', activeBg: '#f0fdf4'
            }
          ].map((item) => {
            const isActive = currentTab === item.tabIndex;
            return (
              <Grid item xs={12} sm={6} md={3} key={item.tabIndex}>
                <Card 
                  onClick={() => setCurrentTab(item.tabIndex)}
                  elevation={0}
                  sx={{
                    borderRadius: '8px', 
                    bgcolor: isActive ? item.activeBg : '#ffffff', 
                    border: '1px solid',
                    borderColor: isActive ? item.color : '#e2e8f0',
                    borderBottomWidth: isActive ? '3px' : '1px',
                    cursor: 'pointer', 
                    transition: 'all 0.2s ease',
                    height: '100%',
                    '&:hover': { 
                      borderColor: isActive ? item.color : '#cbd5e1',
                      bgcolor: item.activeBg
                    }
                  }}
                >
                  <CardContent sx={{ p: 2, display: 'flex', alignItems: 'flex-start', gap: 1.5, pb: '16px !important' }}>
                    <Box sx={{ color: item.color, mt: 0.5 }}>
                      {item.icon}
                    </Box>
                    <Box flex={1}>
                      <Typography variant="subtitle2" fontWeight={800} color="#0f172a" sx={{ lineHeight: 1.2 }}>{item.title}</Typography>
                      <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 500, display: 'block', mt: 0.5, lineHeight: 1.3 }}>{item.subtitle}</Typography>
                      <Box mt={2}>
                        <Typography variant="h6" sx={{ fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>
                          {item.count} <Typography component="span" variant="caption" color="#64748b" fontWeight={700}>VEHICLES</Typography>
                        </Typography>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>

        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="subtitle1" fontWeight={700} color="#0f172a">Vehicle List</Typography>
          <TextField 
            size="small" placeholder="Search vehicle..." variant="outlined" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            sx={{ width: { xs: '100%', sm: 300 }, '& .MuiOutlinedInput-root': { borderRadius: '8px', bgcolor: '#fff', '& fieldset': { borderColor: '#e2e8f0' } } }}
          />
        </Box>

        {/* ── TAB CONTENT ── */}
        <Card sx={{ borderRadius: '8px', boxShadow: 'none', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <CardContent sx={{ p: 0 }}>
            {!currentListData.length ? (
              <Box display="flex" p={8} alignItems="center" justifyContent="center">
                <Typography variant="h6" color="text.secondary" fontWeight={600}>No vehicles found for this category.</Typography>
              </Box>
            ) : (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#f8fafc' }}>
                      <TableCell sx={{ fontWeight: 800, color: '#475569', py: 2, pl: 4 }}>VEHICLE NUMBER</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: '#475569', py: 2 }}>TOTAL TRIPS</TableCell>
                      
                      {currentTab === 0 && (
                        <>
                          <TableCell align="right" sx={{ fontWeight: 800, color: '#475569' }}>EXPECTED FUEL</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 800, color: '#475569' }}>ACTUAL FUEL</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 800, color: '#b45309' }}>EXCESS FUEL</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 800, color: '#b45309', pr: 4 }}>EXCESS %</TableCell>
                        </>
                      )}

                      {currentTab === 1 && (
                        <>
                          <TableCell align="right" sx={{ fontWeight: 800, color: '#475569' }}>EXPECTED EXPENSE</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 800, color: '#475569' }}>ACTUAL EXPENSE</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 800, color: '#b91c1c' }}>EXCESS AMOUNT</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 800, color: '#b91c1c', pr: 4 }}>EXCESS %</TableCell>
                        </>
                      )}

                      {currentTab === 2 && (
                        <>
                          <TableCell align="right" sx={{ fontWeight: 800, color: '#b45309' }}>EXCESS FUEL</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 800, color: '#b91c1c' }}>EXCESS EXPENSE</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 800, color: '#9f1239', pr: 4 }}>STATUS</TableCell>
                        </>
                      )}

                      {currentTab === 3 && (
                        <>
                          <TableCell align="right" sx={{ fontWeight: 800, color: '#475569' }}>FUEL STATUS</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 800, color: '#475569', pr: 4 }}>EXPENSE STATUS</TableCell>
                        </>
                      )}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {currentListData.map((row, idx) => {
                      const fuelPct = row.expectedFuelSum > 0 ? ((row.excessFuelSum / row.expectedFuelSum) * 100).toFixed(0) : 0;
                      const advPct = row.expectedAdvSum > 0 ? ((row.excessAdvSum / row.expectedAdvSum) * 100).toFixed(0) : 0;

                      return (
                        <TableRow 
                          key={row.vehicle} 
                          hover 
                          onClick={() => handleVehicleClick(row)}
                          sx={{ 
                            bgcolor: '#ffffff', 
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            '&:hover': { bgcolor: '#f8fafc' }
                          }}
                        >
                          <TableCell sx={{ pl: 4, borderBottom: '1px solid #f1f5f9' }}>
                            <Typography variant="body2" sx={{ fontWeight: 800, color: '#0f172a', letterSpacing: 0.5 }}>
                              {row.vehicle}
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ color: '#475569', fontWeight: 700, fontSize: '1.1rem', borderBottom: '1px solid #f1f5f9' }}>
                            {row.tripsCount}
                          </TableCell>

                          {currentTab === 0 && (
                            <>
                              <TableCell align="right" sx={{ fontWeight: 600, color: '#64748b' }}>{row.expectedFuelSum.toFixed(1)} L</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 700, color: '#334155' }}>{row.actualFuelSum.toFixed(1)} L</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 900, color: '#d97706' }}>+{row.excessFuelSum.toFixed(1)} L</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 800, color: '#d97706', pr: 4 }}>+{fuelPct}%</TableCell>
                            </>
                          )}

                          {currentTab === 1 && (
                            <>
                              <TableCell align="right" sx={{ fontWeight: 600, color: '#64748b' }}>₹{Math.round(row.expectedAdvSum).toLocaleString()}</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 700, color: '#334155' }}>₹{Math.round(row.actualAdvSum).toLocaleString()}</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 900, color: '#ef4444' }}>+₹{Math.round(row.excessAdvSum).toLocaleString()}</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 800, color: '#ef4444', pr: 4 }}>+{advPct}%</TableCell>
                            </>
                          )}

                          {currentTab === 2 && (
                            <>
                              <TableCell align="right" sx={{ fontWeight: 900, color: '#d97706' }}>+{row.excessFuelSum.toFixed(1)} L</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 900, color: '#ef4444' }}>+₹{Math.round(row.excessAdvSum).toLocaleString()}</TableCell>
                              <TableCell align="right" sx={{ pr: 4 }}>
                                <Chip label="⚠ BOTH EXCESS" size="small" sx={{ fontWeight: 800, bgcolor: '#ffe4e6', color: '#9f1239', borderRadius: '4px' }} />
                              </TableCell>
                            </>
                          )}

                          {currentTab === 3 && (
                            <>
                              <TableCell align="right" sx={{ fontWeight: 700, color: '#16a34a' }}>Normal</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 700, color: '#16a34a', pr: 4 }}>
                                <Chip label="✓ ALL OK" size="small" sx={{ fontWeight: 800, bgcolor: '#dcfce7', color: '#166534', borderRadius: '4px' }} />
                              </TableCell>
                            </>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>
          </>
        )}
      </Box>

      {/* ── VEHICLE DETAILS MODAL ── */}
      <VehicleDetailsModal 
        open={Boolean(selectedVehicle)} 
        vehicle={selectedVehicle} 
        onClose={() => setSelectedVehicle(null)} 
        selectedMonth={selectedMonth} 
        currentTab={currentTab}
      />

    </Box>
  );
};

export default AiExtraExpense;
