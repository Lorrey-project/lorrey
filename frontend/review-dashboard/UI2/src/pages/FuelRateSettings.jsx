import React, { useEffect, useState } from 'react';
import {
    Box, Typography, Button, Card, CardContent,
    Snackbar, Alert, Divider, CircularProgress,
    TextField, Paper, Tabs, Tab, Grid, Select, MenuItem,
    FormControl, InputLabel, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, IconButton, Chip
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import AssessmentIcon from '@mui/icons-material/Assessment';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import EvStationIcon from '@mui/icons-material/EvStation';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;
const PUMPS = ['SAS-1', 'SAS-2'];

function TabPanel(props) {
    const { children, value, index, ...other } = props;
    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`settings-tabpanel-${index}`}
            aria-labelledby={`settings-tab-${index}`}
            style={{ display: value === index ? 'flex' : 'none', flex: 1, flexDirection: 'column' }}
            {...other}
        >
            {value === index && (
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', pt: 3 }}>
                    {children}
                </Box>
            )}
        </div>
    );
}

const StatCard = ({ title, value, icon, color }) => (
    <Card sx={{ 
        height: '100%', 
        background: `linear-gradient(135deg, ${color}15 0%, ${color}05 100%)`,
        border: `1px solid ${color}30`,
        borderRadius: 3,
        boxShadow: 'none'
    }}>
        <CardContent sx={{ display: 'flex', alignItems: 'center', p: 3 }}>
            <Box sx={{ 
                p: 1.5, 
                borderRadius: 2, 
                backgroundColor: `${color}20`,
                color: color,
                mr: 2
            }}>
                {icon}
            </Box>
            <Box>
                <Typography variant="body2" color="text.secondary" fontWeight={600} gutterBottom>
                    {title}
                </Typography>
                <Typography variant="h5" fontWeight={700} color="text.primary">
                    {value}
                </Typography>
            </Box>
        </CardContent>
    </Card>
);

// ─────────────────────────────────────────────────────────────────────────────
// FUEL RATE SETTINGS TAB
// ─────────────────────────────────────────────────────────────────────────────
function FuelRateTab({ snackHandler }) {
    const [history, setHistory] = useState({ 'SAS-1': [], 'SAS-2': [] });
    const [selectedPump, setSelectedPump] = useState('SAS-1');
    const [rateInput, setRateInput] = useState('');
    const [dateInput, setDateInput] = useState(new Date().toISOString().split('T')[0]);
    const [statusInput, setStatusInput] = useState('Active');
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        fetchRates();
    }, []);

    const fetchRates = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`${API_URL}/pump-payment/fuel-rates`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data.success) {
                setHistory(res.data.history);
                const latest = res.data.history[selectedPump]?.[0];
                if (latest) setRateInput(String(latest.rate));
            }
        } catch (e) {
            snackHandler({ msg: 'Failed to load rates', sev: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        const rateVal = parseFloat(rateInput);
        if (isNaN(rateVal) || rateVal <= 0) {
            snackHandler({ msg: 'Rate must be a positive number', sev: 'error' });
            return;
        }
        if (!dateInput) {
            snackHandler({ msg: 'Effective date is required', sev: 'error' });
            return;
        }

        setSaving(true);
        try {
            const token = localStorage.getItem('token');
            const res = await axios.put(`${API_URL}/pump-payment/fuel-rates`,
                { pumpName: selectedPump, rate: rateVal, effectiveDate: dateInput },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            
            if (res.data.success) {
                snackHandler({ msg: `${selectedPump} rate updated successfully!`, sev: 'success' });
                fetchRates();
            }
        } catch (error) {
            snackHandler({ msg: error.response?.data?.error || 'Failed to update rate', sev: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleReset = () => {
        const latest = history[selectedPump]?.[0];
        setRateInput(latest ? String(latest.rate) : '');
        setDateInput(new Date().toISOString().split('T')[0]);
        setStatusInput('Active');
    };

    const handleAddNew = () => {
        setRateInput('');
        setDateInput(new Date().toISOString().split('T')[0]);
        setStatusInput('Active');
    };

    // Calculate Summary Stats
    const allHistory = [...history['SAS-1'], ...history['SAS-2']].sort((a, b) => new Date(b.effectiveDate) - new Date(a.effectiveDate));
    const latestRates = PUMPS.map(p => history[p]?.[0]?.rate).filter(r => r);
    const avgCurrentRate = latestRates.length ? (latestRates.reduce((a, b) => a + b, 0) / latestRates.length).toFixed(2) : 'N/A';
    const lastUpdated = allHistory[0] ? new Date(allHistory[0].effectiveDate).toLocaleDateString() : 'N/A';

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {/* Summary Cards */}
            <Grid container spacing={3}>
                <Grid item xs={12} sm={6} md={3}>
                    <StatCard title="Avg Current Rate" value={`₹${avgCurrentRate}/L`} icon={<AssessmentIcon />} color="#0ea5e9" />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <StatCard title="Total Pumps" value="2" icon={<EvStationIcon />} color="#0ea5e9" />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <StatCard title="Last Updated" value={lastUpdated} icon={<AccessTimeIcon />} color="#0ea5e9" />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <StatCard title="Configured Fuel Types" value="1 (Diesel/HSD)" icon={<LocalGasStationIcon />} color="#0ea5e9" />
                </Grid>
            </Grid>

            {/* Configuration & Table */}
            <Grid container spacing={4}>
                <Grid item xs={12} lg={4}>
                    <Card sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
                        <Box sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.05)', bgcolor: 'rgba(255,255,255,0.02)' }}>
                            <Typography variant="h6" fontWeight={600}>Fuel Rate Configuration</Typography>
                            <Typography variant="body2" color="text.secondary">Add or update rates for a pump.</Typography>
                        </Box>
                        <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <FormControl fullWidth>
                                <InputLabel>Fuel Type</InputLabel>
                                <Select value="HSD" label="Fuel Type" disabled>
                                    <MenuItem value="HSD">Diesel (HSD)</MenuItem>
                                </Select>
                            </FormControl>
                            <FormControl fullWidth>
                                <InputLabel>Select Pump</InputLabel>
                                <Select 
                                    value={selectedPump} 
                                    label="Select Pump"
                                    onChange={(e) => {
                                        setSelectedPump(e.target.value);
                                        const latest = history[e.target.value]?.[0];
                                        setRateInput(latest ? String(latest.rate) : '');
                                    }}
                                >
                                    {PUMPS.map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}
                                </Select>
                            </FormControl>
                            <TextField 
                                label="Fuel Rate (₹/Litre)" 
                                type="number" 
                                value={rateInput}
                                onChange={(e) => setRateInput(e.target.value)}
                                fullWidth
                            />
                            <TextField 
                                label="Effective Date" 
                                type="date" 
                                value={dateInput}
                                onChange={(e) => setDateInput(e.target.value)}
                                InputLabelProps={{ shrink: true }}
                                fullWidth
                            />
                            <FormControl fullWidth>
                                <InputLabel>Status</InputLabel>
                                <Select value={statusInput} label="Status" onChange={e => setStatusInput(e.target.value)}>
                                    <MenuItem value="Active">Active</MenuItem>
                                    <MenuItem value="Inactive">Inactive</MenuItem>
                                </Select>
                            </FormControl>
                            <Divider sx={{ my: 1 }} />
                            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                                <Button variant="contained" color="primary" startIcon={<SaveIcon />} onClick={handleSave} disabled={saving} sx={{ flex: 1, borderRadius: 2 }}>
                                    {saving ? 'Saving...' : 'Save'}
                                </Button>
                                <Button variant="outlined" color="primary" startIcon={<AddIcon />} onClick={handleAddNew} sx={{ flex: 1, borderRadius: 2 }}>
                                    New
                                </Button>
                                <Button variant="text" color="inherit" startIcon={<RefreshIcon />} onClick={handleReset} sx={{ flex: 1, borderRadius: 2 }}>
                                    Reset
                                </Button>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} lg={8}>
                    <Card sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.2)', height: '100%', display: 'flex', flexDirection: 'column' }}>
                        <Box sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.05)', bgcolor: 'rgba(255,255,255,0.02)' }}>
                            <Typography variant="h6" fontWeight={600}>Fuel Rate History</Typography>
                            <Typography variant="body2" color="text.secondary">All configured rates across pumps.</Typography>
                        </Box>
                        <TableContainer sx={{ flex: 1, maxHeight: 500 }}>
                            <Table stickyHeader>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 600 }}>Pump Name</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>Rate (₹/L)</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>Effective Date</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>Last Modified</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {loading ? (
                                        <TableRow><TableCell colSpan={5} align="center"><CircularProgress size={24} sx={{ my: 3 }} /></TableCell></TableRow>
                                    ) : allHistory.length === 0 ? (
                                        <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>No rates found</TableCell></TableRow>
                                    ) : (
                                        allHistory.map((row, idx) => (
                                            <TableRow key={row._id || idx} hover>
                                                <TableCell sx={{ fontWeight: 500 }}>{row.pumpName}</TableCell>
                                                <TableCell>₹{row.rate}</TableCell>
                                                <TableCell>{new Date(row.effectiveDate).toLocaleDateString()}</TableCell>
                                                <TableCell><Chip label="Active" size="small" color="success" variant="outlined" /></TableCell>
                                                <TableCell>{row.updatedAt ? new Date(row.updatedAt).toLocaleString() : 'N/A'}</TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Card>
                </Grid>
            </Grid>
        </Box>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// PUMP CASH DISCOUNT TAB
// ─────────────────────────────────────────────────────────────────────────────
function CashDiscountTab({ snackHandler }) {
    const [history, setHistory] = useState({ 'SAS-1': [], 'SAS-2': [] });
    const [selectedPump, setSelectedPump] = useState('SAS-1');
    const [discountInput, setDiscountInput] = useState('');
    const [dateInput, setDateInput] = useState(new Date().toISOString().split('T')[0]);
    const [statusInput, setStatusInput] = useState('Active');
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        fetchDiscounts();
    }, []);

    const fetchDiscounts = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`${API_URL}/pump-payment/cash-discounts`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data.success) {
                setHistory(res.data.history);
                const latest = res.data.history[selectedPump]?.[0];
                if (latest) setDiscountInput(String(latest.discount));
            }
        } catch (e) {
            snackHandler({ msg: 'Failed to load cash discounts', sev: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        const discountVal = parseFloat(discountInput);
        if (isNaN(discountVal) || discountVal < 0) {
            snackHandler({ msg: 'Discount must be a positive number', sev: 'error' });
            return;
        }
        if (!dateInput) {
            snackHandler({ msg: 'Effective date is required', sev: 'error' });
            return;
        }

        setSaving(true);
        try {
            const token = localStorage.getItem('token');
            const res = await axios.put(`${API_URL}/pump-payment/cash-discounts`,
                { pumpName: selectedPump, discount: discountVal, effectiveDate: dateInput },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            
            if (res.data.success) {
                snackHandler({ msg: `${selectedPump} cash discount updated successfully!`, sev: 'success' });
                fetchDiscounts();
            }
        } catch (error) {
            snackHandler({ msg: error.response?.data?.error || 'Failed to update cash discount', sev: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleReset = () => {
        const latest = history[selectedPump]?.[0];
        setDiscountInput(latest ? String(latest.discount) : '');
        setDateInput(new Date().toISOString().split('T')[0]);
        setStatusInput('Active');
    };

    // Calculate Summary Stats
    const allHistory = [...history['SAS-1'], ...history['SAS-2']].sort((a, b) => new Date(b.effectiveDate) - new Date(a.effectiveDate));
    const latestDiscounts = PUMPS.map(p => history[p]?.[0]?.discount).filter(d => d !== undefined);
    const avgCurrentDiscount = latestDiscounts.length ? (latestDiscounts.reduce((a, b) => a + b, 0) / latestDiscounts.length).toFixed(2) : '0.00';
    const lastUpdated = allHistory[0] ? new Date(allHistory[0].effectiveDate).toLocaleDateString() : 'N/A';

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {/* Summary Cards */}
            <Grid container spacing={3}>
                <Grid item xs={12} sm={6} md={3}>
                    <StatCard title="Total Pumps Configured" value="2" icon={<EvStationIcon />} color="#10b981" />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <StatCard title="Avg Discount Rate" value={`₹${avgCurrentDiscount}/L`} icon={<AssessmentIcon />} color="#10b981" />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <StatCard title="Active Discounts" value={latestDiscounts.length} icon={<LocalGasStationIcon />} color="#10b981" />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <StatCard title="Last Updated" value={lastUpdated} icon={<AccessTimeIcon />} color="#10b981" />
                </Grid>
            </Grid>

            {/* Configuration & Table */}
            <Grid container spacing={4}>
                <Grid item xs={12} lg={4}>
                    <Card sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
                        <Box sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.05)', bgcolor: 'rgba(255,255,255,0.02)' }}>
                            <Typography variant="h6" fontWeight={600}>Pump Configuration</Typography>
                            <Typography variant="body2" color="text.secondary">Set cash discount per litre.</Typography>
                        </Box>
                        <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <FormControl fullWidth>
                                <InputLabel>Select Pump</InputLabel>
                                <Select 
                                    value={selectedPump} 
                                    label="Select Pump"
                                    onChange={(e) => {
                                        setSelectedPump(e.target.value);
                                        const latest = history[e.target.value]?.[0];
                                        setDiscountInput(latest ? String(latest.discount) : '');
                                    }}
                                >
                                    {PUMPS.map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}
                                </Select>
                            </FormControl>
                            <TextField 
                                label="Cash Discount (₹/Litre)" 
                                type="number" 
                                value={discountInput}
                                onChange={(e) => setDiscountInput(e.target.value)}
                                fullWidth
                            />
                            <TextField 
                                label="Effective Date" 
                                type="date" 
                                value={dateInput}
                                onChange={(e) => setDateInput(e.target.value)}
                                InputLabelProps={{ shrink: true }}
                                fullWidth
                            />
                            <FormControl fullWidth>
                                <InputLabel>Status</InputLabel>
                                <Select value={statusInput} label="Status" onChange={e => setStatusInput(e.target.value)}>
                                    <MenuItem value="Active">Active</MenuItem>
                                    <MenuItem value="Inactive">Inactive</MenuItem>
                                </Select>
                            </FormControl>
                            <Divider sx={{ my: 1 }} />
                            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                                <Button variant="contained" color="success" startIcon={<SaveIcon />} onClick={handleSave} disabled={saving} sx={{ flex: 1, borderRadius: 2 }}>
                                    {saving ? 'Saving...' : 'Save'}
                                </Button>
                                <Button variant="text" color="inherit" startIcon={<RefreshIcon />} onClick={handleReset} sx={{ flex: 1, borderRadius: 2 }}>
                                    Reset
                                </Button>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} lg={8}>
                    <Card sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.2)', height: '100%', display: 'flex', flexDirection: 'column' }}>
                        <Box sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.05)', bgcolor: 'rgba(255,255,255,0.02)' }}>
                            <Typography variant="h6" fontWeight={600}>Discount Table</Typography>
                            <Typography variant="body2" color="text.secondary">All configured discounts across pumps.</Typography>
                        </Box>
                        <TableContainer sx={{ flex: 1, maxHeight: 500 }}>
                            <Table stickyHeader>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 600 }}>Pump Name</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>Discount (₹/L)</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>Effective Date</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>Last Modified</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {loading ? (
                                        <TableRow><TableCell colSpan={5} align="center"><CircularProgress size={24} sx={{ my: 3 }} /></TableCell></TableRow>
                                    ) : allHistory.length === 0 ? (
                                        <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>No discounts found</TableCell></TableRow>
                                    ) : (
                                        allHistory.map((row, idx) => (
                                            <TableRow key={row._id || idx} hover>
                                                <TableCell sx={{ fontWeight: 500 }}>{row.pumpName}</TableCell>
                                                <TableCell>₹{row.discount}</TableCell>
                                                <TableCell>{new Date(row.effectiveDate).toLocaleDateString()}</TableCell>
                                                <TableCell><Chip label="Active" size="small" color="success" variant="outlined" /></TableCell>
                                                <TableCell>{row.updatedAt ? new Date(row.updatedAt).toLocaleString() : 'N/A'}</TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Card>
                </Grid>
            </Grid>
        </Box>
    );
}


// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function FuelRateSettings({ onBack }) {
    const [tabIndex, setTabIndex] = useState(0);
    const [snack, setSnack] = useState({ open: false, msg: '', sev: 'info' });

    const snackHandler = ({ msg, sev }) => setSnack({ open: true, msg, sev });

    return (
        <Box sx={{ 
            height: '100%', 
            display: 'flex', 
            flexDirection: 'column', 
            bgcolor: 'background.default',
            overflow: 'auto',
            p: { xs: 2, md: 4 }
        }}>
            {/* Page Header */}
            <Box sx={{ 
                display: 'flex', 
                flexDirection: { xs: 'column', md: 'row' },
                alignItems: { xs: 'flex-start', md: 'center' }, 
                justifyContent: 'space-between',
                mb: 4,
                gap: 2
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <IconButton onClick={onBack} sx={{ bgcolor: 'rgba(255,255,255,0.05)' }}>
                        <ArrowBackIcon />
                    </IconButton>
                    <Box>
                        <Typography variant="h5" fontWeight={700}>
                            Settings & Configurations
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Manage Fuel Rates and Pump Cash Discounts efficiently.
                        </Typography>
                    </Box>
                </Box>
                
                {/* Tabs */}
                <Paper sx={{ 
                    borderRadius: 3, 
                    bgcolor: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    p: 0.5
                }}>
                    <Tabs 
                        value={tabIndex} 
                        onChange={(e, nv) => setTabIndex(nv)}
                        TabIndicatorProps={{ style: { display: 'none' } }}
                        sx={{
                            minHeight: 40,
                            '& .MuiTab-root': {
                                minHeight: 40,
                                borderRadius: 2,
                                textTransform: 'none',
                                fontWeight: 600,
                                px: 3,
                                transition: 'all 0.3s ease'
                            },
                            '& .Mui-selected': {
                                bgcolor: tabIndex === 0 ? 'primary.main' : 'success.main',
                                color: '#fff !important',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                            }
                        }}
                    >
                        <Tab label="Fuel Rate Settings" />
                        <Tab label="Pump Cash Discount" />
                    </Tabs>
                </Paper>
            </Box>

            {/* Tab Contents */}
            <TabPanel value={tabIndex} index={0}>
                <FuelRateTab snackHandler={snackHandler} />
            </TabPanel>
            <TabPanel value={tabIndex} index={1}>
                <CashDiscountTab snackHandler={snackHandler} />
            </TabPanel>

            <Snackbar 
                open={snack.open} 
                autoHideDuration={6000} 
                onClose={() => setSnack(p => ({ ...p, open: false }))}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert severity={snack.sev} variant="filled" sx={{ width: '100%', borderRadius: 2, boxShadow: 3 }}>
                    {snack.msg}
                </Alert>
            </Snackbar>
        </Box>
    );
}
