import React, { useState, useEffect } from 'react';
import { Box, Typography, IconButton, Grid, Select, MenuItem, TextField, CircularProgress, Button, Divider } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SearchIcon from '@mui/icons-material/Search';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import RemoveIcon from '@mui/icons-material/Remove';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import IosShareIcon from '@mui/icons-material/IosShare';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import PercentIcon from '@mui/icons-material/Percent';
import DynamicPieChart from '../components/DynamicPieChart';
import axios from 'axios';

const LEDGER_NAMES = [
  "Payment Received (NVCL/NVL)",
  "Freight Payment",
  "Freight Advance",
  "Staff Salary",
  "Toll Payment",
  "Fasttag Payment",
  "ROOM RENT",
  "Main Cash",
  "Office Exp",
  "Travelling Exp",
  "Challan Sign exp",
  "Subcription(Donation)",
  "Pump Payment",
  "PRINTING & STATIONARY",
  "Loading advance",
  "Tonage",
  "Freight Billing"
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June", 
  "July", "August", "September", "October", "November", "December"
];

const getFYOptions = () => {
  const currentYear = new Date().getFullYear();
  return [
    `${currentYear - 2}-${(currentYear - 1).toString().slice(-2)}`,
    `${currentYear - 1}-${(currentYear).toString().slice(-2)}`,
    `${currentYear}-${(currentYear + 1).toString().slice(-2)}`,
    `${currentYear + 1}-${(currentYear + 2).toString().slice(-2)}`
  ];
};

const getDaysInMonth = (fyStr, monthName) => {
  if (!fyStr || !monthName) return 31;
  const parts = fyStr.split('-');
  const startYear = parseInt(parts[0], 10);
  const endYear = startYear + 1;
  const monthIndex = MONTHS.indexOf(monthName);
  
  const targetYear = monthIndex >= 3 ? startYear : endYear;
  return new Date(targetYear, monthIndex + 1, 0).getDate();
};

const GlassBox = ({ children, sx = {} }) => (
  <Box
    sx={{
      background: 'rgba(20, 24, 28, 0.4)',
      backdropFilter: 'blur(16px)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: '8px',
      ...sx
    }}
  >
    {children}
  </Box>
);

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return <Box sx={{ p: 4, color: 'red' }}><h1>CRASH</h1><pre>{this.state.error.toString()}</pre></Box>;
    }
    return this.props.children;
  }
}

const PieChartDashboard = ({ onBack }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLedger, setSelectedLedger] = useState('Freight Payment');
  
  const defaultFY = getFYOptions()[2];
  const defaultMonth = MONTHS[new Date().getMonth()];

  const [leftFilters, setLeftFilters] = useState({
    period: 'MONTHLY',
    financialYear: defaultFY,
    month: defaultMonth,
    date: 'ALL'
  });

  const [rightFilters, setRightFilters] = useState({
    period: 'MONTHLY',
    financialYear: defaultFY,
    month: defaultMonth === 'January' ? 'December' : MONTHS[MONTHS.indexOf(defaultMonth) - 1], // default to previous month for right
    date: 'ALL'
  });

  const [leftData, setLeftData] = useState(null);
  const [rightData, setRightData] = useState(null);
  
  const [loadingLeft, setLoadingLeft] = useState(false);
  const [loadingRight, setLoadingRight] = useState(false);

  const filteredLedgers = LEDGER_NAMES.filter(name => 
    name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const fetchSideData = async (filters, setLoader, setData) => {
    setLoader(true);
    try {
      const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const res = await axios.get(`${backendUrl}/pie-chart`, {
        params: {
          ledger: selectedLedger,
          ...filters
        }
      });
      setData(res.data);
    } catch (err) {
      console.error(err);
      setData(null);
    } finally {
      setLoader(false);
    }
  };

  const applyFilters = () => {
    fetchSideData(leftFilters, setLoadingLeft, setLeftData);
    fetchSideData(rightFilters, setLoadingRight, setRightData);
  };

  useEffect(() => {
    applyFilters();
    const interval = setInterval(() => {
      applyFilters();
    }, 60000);
    return () => clearInterval(interval);
    // eslint-disable-next-line
  }, [selectedLedger]); 

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(val || 0);
  };
  
  const formatRange = (start, end) => {
    if (!start || !end) return '';
    const formatDate = (dateStr) => {
      const d = new Date(dateStr);
      return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
    };

    if (start === end) {
      return `${formatDate(start)}`;
    }
    return `${formatDate(start)} – ${formatDate(end)}`;
  };

  const getDisplayTitle = (filters) => {
    if (filters.period === 'MONTHLY') {
       return `${filters.month.toUpperCase()} ${filters.financialYear.substring(0,4)}`;
    } else if (filters.period === 'YEARLY') {
       return `FY ${filters.financialYear}`;
    }
    return filters.period;
  };

  const getSubtitle = (filters, range) => {
    if (filters.period === 'MONTHLY') {
       return `${filters.date === 'ALL' ? 'All Dates' : filters.date} (${formatRange(range.start, range.end)})`;
    }
    return formatRange(range.start, range.end);
  };

  const leftTotal = leftData?.currentData?.totalAmount || 0;
  const rightTotal = rightData?.currentData?.totalAmount || 0;
  const difference = leftTotal - rightTotal;
  
  let percentChangeStr = "N/A";
  if (rightTotal > 0) {
    const pc = ((difference / rightTotal) * 100).toFixed(2);
    percentChangeStr = `${pc > 0 ? '+' : ''}${pc}%`;
  }

  // Common Select Style matching mockup
  const selectStyle = {
    color: '#FFF', 
    bgcolor: 'rgba(255,255,255,0.03)', 
    fontSize: '0.85rem',
    '& .MuiOutlinedInput-notchedOutline': { border: '1px solid rgba(255,255,255,0.1)' },
    '&:hover .MuiOutlinedInput-notchedOutline': { border: '1px solid rgba(255,255,255,0.2)' },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { border: '1px solid #8b5cf6' },
    height: '38px'
  };

  const renderFilterRow = (label, filters, setFilters, isRight) => {
    const daysInMonth = getDaysInMonth(filters.financialYear, filters.month);
    const dateOptions = ['ALL', ...Array.from({length: daysInMonth}, (_, i) => String(i + 1).padStart(2, '0'))];

    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: isRight ? 0 : 2 }}>
        <Typography variant="caption" color={isRight ? '#8b5cf6' : '#10b981'} fontWeight={700} sx={{ width: '50px' }}>
          {label}
        </Typography>
        
        <Box sx={{ flex: 1, display: 'flex', gap: 2 }}>
          <Box sx={{ flex: 1 }}>
            {(!isRight) && <Typography variant="caption" color="#AAB4C0" sx={{ mb: 0.5, display: 'block', fontSize: '0.65rem' }}>FINANCIAL YEAR</Typography>}
            <Select fullWidth value={filters.financialYear} onChange={(e) => setFilters({...filters, financialYear: e.target.value})} size="small" sx={selectStyle}>
              {getFYOptions().map(fy => <MenuItem key={fy} value={fy}>{fy}</MenuItem>)}
            </Select>
          </Box>
          <Box sx={{ flex: 1 }}>
            {(!isRight) && <Typography variant="caption" color="#AAB4C0" sx={{ mb: 0.5, display: 'block', fontSize: '0.65rem' }}>PERIOD TYPE</Typography>}
            <Select fullWidth value={filters.period} onChange={(e) => setFilters({...filters, period: e.target.value})} size="small" sx={selectStyle}>
              <MenuItem value="TODAY">TODAY</MenuItem>
              <MenuItem value="MONTHLY">MONTHLY</MenuItem>
              <MenuItem value="YEARLY">YEARLY</MenuItem>
            </Select>
          </Box>
          <Box sx={{ flex: 1, opacity: filters.period === 'MONTHLY' ? 1 : 0.3, pointerEvents: filters.period === 'MONTHLY' ? 'auto' : 'none' }}>
            {(!isRight) && <Typography variant="caption" color="#AAB4C0" sx={{ mb: 0.5, display: 'block', fontSize: '0.65rem' }}>MONTH</Typography>}
            <Select fullWidth value={filters.month} onChange={(e) => {
                  const newMonth = e.target.value;
                  const newDays = getDaysInMonth(filters.financialYear, newMonth);
                  let newDate = filters.date;
                  if (newDate !== 'ALL' && parseInt(newDate, 10) > newDays) newDate = 'ALL';
                  setFilters({...filters, month: newMonth, date: newDate});
                }} size="small" sx={selectStyle}>
              {MONTHS.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
            </Select>
          </Box>
          <Box sx={{ flex: 1, opacity: filters.period === 'MONTHLY' ? 1 : 0.3, pointerEvents: filters.period === 'MONTHLY' ? 'auto' : 'none' }}>
            {(!isRight) && <Typography variant="caption" color="#AAB4C0" sx={{ mb: 0.5, display: 'block', fontSize: '0.65rem' }}>DATE</Typography>}
            <Select fullWidth value={filters.date} onChange={(e) => setFilters({...filters, date: e.target.value})} size="small" sx={selectStyle}>
              {dateOptions.map(d => <MenuItem key={d} value={d}>{d === 'ALL' ? `All (1-${daysInMonth})` : d}</MenuItem>)}
            </Select>
          </Box>
        </Box>
      </Box>
    );
  };

  const renderSmallCard = (title, content, icon, iconColor, subtext) => (
    <GlassBox sx={{ p: 2, flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <Typography variant="overline" color="#AAB4C0" sx={{ fontSize: '0.65rem', lineHeight: 1 }}>
          {title}
        </Typography>
        <Box sx={{ ml: 'auto', color: iconColor }}>{icon}</Box>
      </Box>
      <Typography variant="body1" fontWeight={700} color={title.includes('SELECTED') ? '#3b82f6' : title.includes('DIFFERENCE') || title.includes('CHANGE') ? iconColor : '#FFF'}>
        {content}
      </Typography>
      {subtext && (
        <Typography variant="caption" color="#7F8A96" sx={{ fontSize: '0.65rem', mt: 0.5 }}>
          {subtext}
        </Typography>
      )}
    </GlassBox>
  );

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, minHeight: '100vh', color: '#F5F7FA', bgcolor: '#111315' }}>
      
      {/* HEADER */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <IconButton onClick={onBack} sx={{ mr: 2, color: '#AAB4C0', bgcolor: 'rgba(255,255,255,0.05)', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}>
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <Box>
            <Typography variant="h6" fontWeight={800} sx={{ letterSpacing: '-0.5px', lineHeight: 1.2 }}>
              FINANCIAL ANALYTICS
            </Typography>
            <Typography variant="caption" color="#AAB4C0">
              Real-time financial insights and smart data analysis
            </Typography>
          </Box>
        </Box>
        <Button 
          variant="outlined" 
          startIcon={<IosShareIcon fontSize="small" />}
          sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.2)', textTransform: 'none', fontSize: '0.8rem', px: 2, '&:hover': { borderColor: '#FFF', bgcolor: 'rgba(255,255,255,0.05)' } }}
        >
          Export Report
        </Button>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', md: 'row' } }}>
        
        {/* LEFT SIDEBAR - LEDGER LIST */}
        <Box sx={{ width: { xs: '100%', md: '250px', lg: '280px' }, flexShrink: 0 }}>
          <GlassBox sx={{ p: 2, height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 2, color: '#FFF' }}>Ledgers</Typography>
            <Box sx={{ position: 'relative', mb: 2 }}>
              <SearchIcon sx={{ position: 'absolute', top: 10, left: 12, color: '#AAB4C0', fontSize: '1rem' }} />
              <TextField 
                fullWidth
                variant="outlined"
                placeholder="Search ledger..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                sx={{
                  '& .MuiOutlinedInput-root': { bgcolor: 'rgba(0,0,0,0.2)', borderRadius: '6px', color: '#FFF', '& fieldset': { border: '1px solid rgba(255,255,255,0.1)' } },
                  '& input': { py: 1, pl: 4.5, fontSize: '0.8rem' }
                }}
              />
            </Box>
            <Box sx={{ flex: 1, overflowY: 'auto', pr: 1, '&::-webkit-scrollbar': { width: '4px' }, '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.2)', borderRadius: '4px' } }}>
              {filteredLedgers.map((ledger) => (
                <Box
                  key={ledger}
                  onClick={() => setSelectedLedger(ledger)}
                  sx={{
                    py: 1, px: 1.5, mb: 0.5, borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                    bgcolor: selectedLedger === ledger ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                    border: selectedLedger === ledger ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent',
                    color: selectedLedger === ledger ? '#60a5fa' : '#AAB4C0',
                    transition: 'all 0.2s ease',
                    '&:hover': { bgcolor: selectedLedger === ledger ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.05)', color: '#FFF' }
                  }}
                >
                  <ReceiptLongIcon sx={{ fontSize: '1rem', mr: 1, opacity: selectedLedger === ledger ? 1 : 0.7 }} />
                  <Typography variant="body2" fontWeight={selectedLedger === ledger ? 600 : 400} sx={{ fontSize: '0.75rem' }}>
                    {ledger}
                  </Typography>
                </Box>
              ))}
            </Box>
          </GlassBox>
        </Box>

        {/* MAIN AREA */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, overflowX: 'hidden' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, height: '100%' }}>
            
            {/* TOP BAR: FILTERS */}
            <GlassBox sx={{ p: 2, display: 'flex', alignItems: 'center' }}>
              <Box sx={{ width: '250px' }}>
                <Typography variant="subtitle2" fontWeight={800}>DATA ANALYSIS</Typography>
                <Typography variant="caption" color="#AAB4C0" sx={{ fontSize: '0.65rem' }}>Select financial year, month and date to analyze and compare</Typography>
              </Box>
              <Box sx={{ flex: 1, px: 2 }}>
                {renderFilterRow('LEFT', leftFilters, setLeftFilters, false)}
                {renderFilterRow('RIGHT', rightFilters, setRightFilters, true)}
              </Box>
              <Box sx={{ pl: 2, borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
                <Button 
                  variant="contained" 
                  onClick={applyFilters}
                  startIcon={<FilterAltIcon fontSize="small"/>}
                  sx={{ 
                    bgcolor: '#5a45cf', color: '#FFF', fontWeight: 600, borderRadius: '6px', fontSize: '0.8rem', py: 1, px: 3,
                    '&:hover': { bgcolor: '#4c39b8' },
                    boxShadow: '0 4px 14px rgba(90, 69, 207, 0.4)'
                  }}
                >
                  Apply Filters
                </Button>
              </Box>
            </GlassBox>

            {/* SUMMARY CARDS ROW */}
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {renderSmallCard('SELECTED LEDGER', selectedLedger.toUpperCase(), <LocalShippingIcon fontSize="small"/>, '#3b82f6')}
              {renderSmallCard('PERIOD (LEFT)', getDisplayTitle(leftFilters), <CalendarMonthIcon fontSize="small"/>, '#ef4444', formatRange(leftData?.currentRange?.start, leftData?.currentRange?.end))}
              {renderSmallCard('PERIOD (RIGHT)', getDisplayTitle(rightFilters), <CalendarMonthIcon fontSize="small"/>, '#3b82f6', formatRange(rightData?.currentRange?.start, rightData?.currentRange?.end))}
              {renderSmallCard('TOTAL AMOUNT (LEFT)', formatCurrency(leftTotal), <AccountBalanceWalletIcon fontSize="small"/>, '#10b981')}
              {renderSmallCard('TOTAL AMOUNT (RIGHT)', formatCurrency(rightTotal), <AccountBalanceWalletIcon fontSize="small"/>, '#3b82f6')}
              {renderSmallCard('DIFFERENCE', `${difference > 0 ? '+' : ''}${formatCurrency(difference)}`, difference > 0 ? <TrendingUpIcon fontSize="small"/> : difference < 0 ? <TrendingDownIcon fontSize="small"/> : <RemoveIcon fontSize="small"/>, difference > 0 ? '#10b981' : difference < 0 ? '#ef4444' : '#AAB4C0')}
              {renderSmallCard('CHANGE', percentChangeStr, difference > 0 ? <TrendingUpIcon fontSize="small"/> : difference < 0 ? <TrendingDownIcon fontSize="small"/> : <RemoveIcon fontSize="small"/>, difference > 0 ? '#10b981' : difference < 0 ? '#ef4444' : '#AAB4C0')}
            </Box>

            {/* TWO PIE CHARTS */}
            <Box sx={{ display: 'flex', gap: 2, flex: 1, flexDirection: { xs: 'column', xl: 'row' }, minHeight: '350px' }}>
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <GlassBox sx={{ p: 2.5, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Box>
                      <Typography variant="subtitle2" fontWeight={800}>LEFT ANALYSIS</Typography>
                      <Typography variant="caption" color="#AAB4C0">{getDisplayTitle(leftFilters)} | {getSubtitle(leftFilters, leftData?.currentRange || {})}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" color="#10b981" fontWeight={700}>Total: {formatCurrency(leftTotal)}</Typography>
                      <IconButton size="small" sx={{ color: '#AAB4C0', bgcolor: 'rgba(255,255,255,0.05)' }}><OpenInFullIcon sx={{ fontSize: '0.9rem' }}/></IconButton>
                    </Box>
                  </Box>
                  <Box sx={{ flex: 1, position: 'relative', minHeight: 300 }}>
                    {loadingLeft && (
                      <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
                        <CircularProgress sx={{ color: '#10b981' }} size={30} />
                      </Box>
                    )}
                    <DynamicPieChart data={leftData?.currentData?.pieData || []} ledgerName={selectedLedger} palette="cool" totalAmount={leftTotal} />
                  </Box>
                </GlassBox>
              </Box>
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <GlassBox sx={{ p: 2.5, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Box>
                      <Typography variant="subtitle2" fontWeight={800}>RIGHT ANALYSIS</Typography>
                      <Typography variant="caption" color="#AAB4C0">{getDisplayTitle(rightFilters)} | {getSubtitle(rightFilters, rightData?.currentRange || {})}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" color="#3b82f6" fontWeight={700}>Total: {formatCurrency(rightTotal)}</Typography>
                      <IconButton size="small" sx={{ color: '#AAB4C0', bgcolor: 'rgba(255,255,255,0.05)' }}><OpenInFullIcon sx={{ fontSize: '0.9rem' }}/></IconButton>
                    </Box>
                  </Box>
                  <Box sx={{ flex: 1, position: 'relative', minHeight: 300 }}>
                    {loadingRight && (
                      <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
                        <CircularProgress sx={{ color: '#3b82f6' }} size={30} />
                      </Box>
                    )}
                    <DynamicPieChart data={rightData?.currentData?.pieData || []} ledgerName={selectedLedger} palette="warm" totalAmount={rightTotal} />
                  </Box>
                </GlassBox>
              </Box>
            </Box>

            {/* BOTTOM COMPARISON SUMMARY */}
            <GlassBox sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="subtitle2" fontWeight={800}>COMPARISON SUMMARY</Typography>
                <Typography variant="caption" color="#AAB4C0">{getDisplayTitle(leftFilters)} vs {getDisplayTitle(rightFilters)}</Typography>
              </Box>
              <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />
              <Box>
                <Typography variant="caption" color="#AAB4C0" display="block">LEFT TOTAL</Typography>
                <Typography variant="body1" fontWeight={700} color="#10b981">{formatCurrency(leftTotal)}</Typography>
              </Box>
              <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />
              <Box>
                <Typography variant="caption" color="#AAB4C0" display="block">RIGHT TOTAL</Typography>
                <Typography variant="body1" fontWeight={700} color="#3b82f6">{formatCurrency(rightTotal)}</Typography>
              </Box>
              <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: difference > 0 ? 'rgba(16, 185, 129, 0.2)' : difference < 0 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: difference > 0 ? '#10b981' : difference < 0 ? '#ef4444' : '#FFF' }}>
                  {difference > 0 ? <TrendingUpIcon fontSize="small"/> : difference < 0 ? <TrendingDownIcon fontSize="small"/> : <RemoveIcon fontSize="small"/>}
                </Box>
                <Box>
                  <Typography variant="caption" color="#AAB4C0" display="block">DIFFERENCE</Typography>
                  <Typography variant="body1" fontWeight={700} color={difference > 0 ? '#10b981' : difference < 0 ? '#ef4444' : '#FFF'}>{formatCurrency(difference)}</Typography>
                </Box>
              </Box>
              <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: difference > 0 ? 'rgba(16, 185, 129, 0.2)' : difference < 0 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: difference > 0 ? '#10b981' : difference < 0 ? '#ef4444' : '#FFF' }}>
                  <PercentIcon fontSize="small"/>
                </Box>
                <Box>
                  <Typography variant="caption" color="#AAB4C0" display="block">PERCENTAGE CHANGE</Typography>
                  <Typography variant="body1" fontWeight={700} color={difference > 0 ? '#10b981' : difference < 0 ? '#ef4444' : '#FFF'}>{percentChangeStr}</Typography>
                </Box>
              </Box>
            </GlassBox>

          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default PieChartDashboard;
