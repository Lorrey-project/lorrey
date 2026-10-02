import React, { useEffect, useState } from 'react';
import {
    Box, Typography, Button, Card, CardContent,
    Snackbar, Alert, Divider, CircularProgress,
    TextField, Paper, Tabs, Tab, Grid, Select, MenuItem,
    FormControl, InputLabel, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, IconButton, Chip,
    Dialog, DialogTitle, DialogContent, DialogActions, Tooltip
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
import HistoryIcon from '@mui/icons-material/History';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CloseIcon from '@mui/icons-material/Close';
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
// PROJECTED DEDUCTION SETTINGS TAB
// ─────────────────────────────────────────────────────────────────────────────
const SETTING_DEFINITIONS = [
    {
        key: 'damage',
        dateKey: 'damageEffectiveDate',
        type: 'DAMAGE_DEDUCTION',
        label: 'Damage Deduction',
        defaultAmt: 476
    },
    {
        key: 'gpsDeviceInstallation',
        dateKey: 'gpsDeviceInstallationEffectiveDate',
        type: 'GPS_DEVICE_INSTALLATION',
        label: 'GPS Device Installation',
        defaultAmt: 1500
    },
    {
        key: 'rfid',
        dateKey: 'rfidEffectiveDate',
        type: 'RFID',
        label: 'RFID',
        defaultAmt: 100
    },
    {
        key: 'gpsTripCharge',
        dateKey: 'gpsTripChargeEffectiveDate',
        type: 'GPS_MONITORING_TRIP_CHARGE',
        label: 'GPS Monitoring / Trip Charge',
        defaultAmt: 145
    },
    {
        key: 'travellingExpense',
        dateKey: 'travellingExpenseEffectiveDate',
        type: 'TRAVELLING_EXPENSE',
        label: 'Travelling Expense',
        defaultAmt: 0
    }
];

const formatSafeDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    const clean = String(dateStr).split('T')[0];
    const parts = clean.split('-');
    if (parts.length === 3) {
        const [y, m, d] = parts;
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const mIdx = parseInt(m, 10) - 1;
        const mName = months[mIdx] || m;
        return `${d}-${mName}-${y}`;
    }
    return dateStr;
};

const formatSafeDateTime = (isoStr) => {
    if (!isoStr) return 'N/A';
    try {
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return formatSafeDate(isoStr);
        return d.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    } catch {
        return formatSafeDate(isoStr);
    }
};

function ProjectedDeductionTab({ snackHandler }) {
    const todayStr = new Date().toISOString().split('T')[0];
    const [settings, setSettings] = useState({
        damage: '',
        damageEffectiveDate: todayStr,
        gpsDeviceInstallation: '',
        gpsDeviceInstallationEffectiveDate: todayStr,
        rfid: '',
        rfidEffectiveDate: todayStr,
        gpsTripCharge: '',
        gpsTripChargeEffectiveDate: todayStr,
        travellingExpense: '',
        travellingExpenseEffectiveDate: todayStr
    });
    const [latestVersions, setLatestVersions] = useState({});
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);

    // History Modal State
    const [historyOpen, setHistoryOpen] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [selectedSetting, setSelectedSetting] = useState(null);
    const [historyData, setHistoryData] = useState([]);

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`${API_URL}/settings/projected-deductions`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data.success && res.data.data) {
                const d = res.data.data;
                const lv = res.data.latestVersions || {};
                setLatestVersions(lv);

                setSettings({
                    damage: String(d.damage ?? 476),
                    damageEffectiveDate: d.damageEffectiveDate || lv.damage?.effectiveDate || todayStr,

                    gpsDeviceInstallation: String(d.gpsDeviceInstallation ?? 1500),
                    gpsDeviceInstallationEffectiveDate: d.gpsDeviceInstallationEffectiveDate || lv.gpsDeviceInstallation?.effectiveDate || todayStr,

                    rfid: String(d.rfid ?? 100),
                    rfidEffectiveDate: d.rfidEffectiveDate || lv.rfid?.effectiveDate || todayStr,

                    gpsTripCharge: String(d.gpsTripCharge ?? 145),
                    gpsTripChargeEffectiveDate: d.gpsTripChargeEffectiveDate || lv.gpsTripCharge?.effectiveDate || todayStr,

                    travellingExpense: String(d.travellingExpense ?? 0),
                    travellingExpenseEffectiveDate: d.travellingExpenseEffectiveDate || lv.travellingExpense?.effectiveDate || todayStr
                });
            }
        } catch (e) {
            snackHandler({ msg: 'Failed to load projected deduction settings', sev: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const token = localStorage.getItem('token');
            const payload = {};

            for (const item of SETTING_DEFINITIONS) {
                const amtVal = parseFloat(settings[item.key]);
                const dateVal = settings[item.dateKey];

                if (isNaN(amtVal) || amtVal < 0) {
                    snackHandler({ msg: `${item.label} must be a valid non-negative amount.`, sev: 'error' });
                    setSaving(false);
                    return;
                }
                if (!dateVal) {
                    snackHandler({ msg: `Effective date is required for ${item.label}.`, sev: 'error' });
                    setSaving(false);
                    return;
                }

                payload[item.key] = amtVal;
                payload[item.dateKey] = dateVal;
            }

            const res = await axios.put(`${API_URL}/settings/projected-deductions`,
                payload,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            
            if (res.data.success) {
                snackHandler({ msg: 'Projected Deduction Settings & Version History saved successfully!', sev: 'success' });
                fetchSettings();
            }
        } catch (error) {
            snackHandler({ msg: error.response?.data?.error || 'Failed to update settings', sev: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleReset = () => {
        fetchSettings();
        snackHandler({ msg: 'Settings reset to active version values', sev: 'info' });
    };

    const handleChange = (field, value) => {
        setSettings(prev => ({ ...prev, [field]: value }));
    };

    const handleOpenHistory = async (settingItem) => {
        setSelectedSetting(settingItem);
        setHistoryOpen(true);
        setHistoryLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`${API_URL}/settings/projected-deductions/history`, {
                params: { settingType: settingItem.type },
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data.success) {
                setHistoryData(res.data.data || []);
            }
        } catch (err) {
            snackHandler({ msg: 'Failed to load history for ' + settingItem.label, sev: 'error' });
        } finally {
            setHistoryLoading(false);
        }
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Grid container spacing={4} justifyContent="center">
                <Grid item xs={12} md={9} lg={7}>
                    <Card sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
                        <Box sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.05)', bgcolor: 'rgba(255,255,255,0.02)' }}>
                            <Typography variant="h6" fontWeight={700} sx={{ letterSpacing: -0.3 }}>
                                Projected Deduction Settings
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                Configure the default projected deduction amounts and their effective dates used throughout the ERP.
                            </Typography>
                        </Box>
                        
                        <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 3.5 }}>
                            {SETTING_DEFINITIONS.map((def) => {
                                const currentEffDate = latestVersions[def.key]?.effectiveDate || settings[def.dateKey];
                                const currentAmt = latestVersions[def.key]?.amount ?? settings[def.key];
                                const isFuture = currentEffDate > todayStr;

                                return (
                                    <Box 
                                        key={def.key} 
                                        sx={{ 
                                            p: 2.5, 
                                            borderRadius: 2.5, 
                                            border: '1px solid rgba(255,255,255,0.08)',
                                            bgcolor: 'rgba(255,255,255,0.015)',
                                            transition: 'border-color 0.2s ease',
                                            '&:hover': {
                                                borderColor: 'rgba(249, 115, 22, 0.4)'
                                            }
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                            <Typography variant="subtitle1" fontWeight={600} color="text.primary">
                                                {def.label} (₹)
                                            </Typography>
                                            <Button
                                                size="small"
                                                variant="outlined"
                                                startIcon={<HistoryIcon sx={{ fontSize: 16 }} />}
                                                onClick={() => handleOpenHistory(def)}
                                                sx={{
                                                    borderRadius: 2,
                                                    textTransform: 'none',
                                                    fontSize: '0.8rem',
                                                    fontWeight: 600,
                                                    borderColor: 'rgba(255,255,255,0.15)',
                                                    color: 'text.secondary',
                                                    '&:hover': {
                                                        borderColor: 'warning.main',
                                                        color: 'warning.main',
                                                        bgcolor: 'rgba(249, 115, 22, 0.08)'
                                                    }
                                                }}
                                            >
                                                History
                                            </Button>
                                        </Box>

                                        <Grid container spacing={2} alignItems="center">
                                            <Grid item xs={12} sm={6}>
                                                <TextField 
                                                    label={`${def.label} (₹)`}
                                                    type="number" 
                                                    value={settings[def.key]}
                                                    onChange={(e) => handleChange(def.key, e.target.value)}
                                                    fullWidth
                                                    InputProps={{
                                                        sx: { borderRadius: 2 }
                                                    }}
                                                />
                                            </Grid>
                                            <Grid item xs={12} sm={6}>
                                                <TextField 
                                                    label="Effective From" 
                                                    type="date" 
                                                    value={settings[def.dateKey]}
                                                    onChange={(e) => handleChange(def.dateKey, e.target.value)}
                                                    InputLabelProps={{ shrink: true }}
                                                    fullWidth
                                                    InputProps={{
                                                        sx: { borderRadius: 2 }
                                                    }}
                                                />
                                            </Grid>
                                        </Grid>

                                        {/* Status / Active Info Footer */}
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1.5, flexWrap: 'wrap' }}>
                                            <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                <CalendarMonthIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                                                Active from: <strong style={{ color: '#fff' }}>{formatSafeDate(currentEffDate)}</strong>
                                            </Typography>
                                            {isFuture && (
                                                <Chip 
                                                    label={`Takes effect on ${formatSafeDate(currentEffDate)}`} 
                                                    size="small" 
                                                    color="info" 
                                                    variant="outlined" 
                                                    sx={{ fontSize: '0.7rem', height: 20 }} 
                                                />
                                            )}
                                        </Box>
                                    </Box>
                                );
                            })}

                            <Divider sx={{ my: 1 }} />

                            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                                <Button 
                                    variant="contained" 
                                    color="warning" 
                                    startIcon={<SaveIcon />} 
                                    onClick={handleSave} 
                                    disabled={saving} 
                                    sx={{ 
                                        flex: 1, 
                                        borderRadius: 2, 
                                        py: 1.2, 
                                        fontWeight: 700,
                                        bgcolor: '#ea580c',
                                        '&:hover': { bgcolor: '#c2410c' }
                                    }}
                                >
                                    {saving ? 'Saving...' : 'Save'}
                                </Button>
                                <Button 
                                    variant="text" 
                                    color="inherit" 
                                    startIcon={<RefreshIcon />} 
                                    onClick={handleReset} 
                                    sx={{ flex: 1, borderRadius: 2, py: 1.2, fontWeight: 600 }}
                                >
                                    Reset
                                </Button>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Version History Modal */}
            <Dialog
                open={historyOpen}
                onClose={() => setHistoryOpen(false)}
                maxWidth="sm"
                fullWidth
                PaperProps={{
                    sx: {
                        borderRadius: 3,
                        bgcolor: 'background.paper',
                        backgroundImage: 'none',
                        border: '1px solid rgba(255,255,255,0.1)'
                    }
                }}
            >
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
                    <Box>
                        <Typography variant="h6" fontWeight={700}>
                            {selectedSetting?.label} History
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            Complete chronological version history and effective dates
                        </Typography>
                    </Box>
                    <IconButton onClick={() => setHistoryOpen(false)} size="small">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>

                <DialogContent dividers sx={{ p: 0 }}>
                    {historyLoading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                            <CircularProgress size={32} />
                        </Box>
                    ) : historyData.length === 0 ? (
                        <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
                            <Typography variant="body2">No version history records found.</Typography>
                        </Box>
                    ) : (
                        <TableContainer sx={{ maxHeight: 400 }}>
                            <Table stickyHeader size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 700, bgcolor: 'rgba(255,255,255,0.05)' }}>Amount</TableCell>
                                        <TableCell sx={{ fontWeight: 700, bgcolor: 'rgba(255,255,255,0.05)' }}>Effective From</TableCell>
                                        <TableCell sx={{ fontWeight: 700, bgcolor: 'rgba(255,255,255,0.05)' }}>Changed On</TableCell>
                                        <TableCell sx={{ fontWeight: 700, bgcolor: 'rgba(255,255,255,0.05)' }}>Status</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {historyData.map((row, idx) => {
                                        const isUpcoming = row.effectiveDate > todayStr;
                                        return (
                                            <TableRow key={row._id || idx} hover>
                                                <TableCell sx={{ fontWeight: 700, color: 'warning.light' }}>
                                                    ₹{row.amount}
                                                </TableCell>
                                                <TableCell sx={{ fontWeight: 500 }}>
                                                    {formatSafeDate(row.effectiveDate)}
                                                </TableCell>
                                                <TableCell sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                                                    {formatSafeDateTime(row.createdAt)}
                                                </TableCell>
                                                <TableCell>
                                                    {isUpcoming ? (
                                                        <Chip label="Upcoming" size="small" color="info" variant="outlined" sx={{ height: 22, fontSize: '0.7rem' }} />
                                                    ) : idx === (historyData.findIndex(h => h.effectiveDate <= todayStr)) ? (
                                                        <Chip label="Active" size="small" color="success" variant="outlined" sx={{ height: 22, fontSize: '0.7rem' }} />
                                                    ) : (
                                                        <Chip label="Archived" size="small" variant="outlined" sx={{ height: 22, fontSize: '0.7rem', color: 'text.disabled' }} />
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </DialogContent>

                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setHistoryOpen(false)} variant="outlined" color="inherit" sx={{ borderRadius: 2 }}>
                        Close
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// EXTRA CASH EXPENSE TAB
// ─────────────────────────────────────────────────────────────────────────────
function ExtraCashExpenseTab({ snackHandler }) {
    const [amountInput, setAmountInput] = useState('');
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchExpenseAmount();
    }, []);

    const fetchExpenseAmount = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`${API_URL}/settings/oil-allowances`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data.success && res.data.data) {
                setAmountInput(String(res.data.data.extraCashExpenseAmount || 0));
            }
        } catch (e) {
            snackHandler({ msg: 'Failed to load extra cash expense', sev: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        const amt = parseFloat(amountInput);
        if (amountInput === '' || isNaN(amt) || amt < 0) {
            snackHandler({ msg: 'Please enter a valid extra cash expense amount.', sev: 'error' });
            return;
        }

        setSaving(true);
        try {
            const token = localStorage.getItem('token');
            const res = await axios.put(`${API_URL}/settings/oil-allowances`, {
                extraCashExpenseAmount: amt
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.data.success) {
                snackHandler({ msg: 'Extra cash expense saved successfully.', sev: 'success' });
                if (res.data.data) {
                    setAmountInput(String(res.data.data.extraCashExpenseAmount || 0));
                }
            }
        } catch (err) {
            snackHandler({ msg: err.response?.data?.error || 'Failed to save settings', sev: 'error' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Grid container spacing={4}>
                <Grid item xs={12} md={6} lg={4}>
                    <Card sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
                        <Box sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.05)', bgcolor: 'rgba(255,255,255,0.02)' }}>
                            <Typography variant="h6" fontWeight={600}>Extra Cash Expense</Typography>
                            <Typography variant="body2" color="text.secondary">Enter the extra cash expense amount.</Typography>
                        </Box>
                        <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {loading ? (
                                <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                                    <CircularProgress size={24} />
                                </Box>
                            ) : (
                                <>
                                    <TextField
                                        label="Extra Cash Expense Amount"
                                        type="text"
                                        value={amountInput}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (val === '') {
                                                setAmountInput('');
                                                return;
                                            }
                                            if (/^\d*\.?\d*$/.test(val)) {
                                                setAmountInput(val);
                                            }
                                        }}
                                        InputProps={{
                                            startAdornment: <Typography sx={{ mr: 1, color: 'text.secondary' }}>₹</Typography>,
                                        }}
                                        fullWidth
                                    />
                                    <Box sx={{ display: 'flex', gap: 2 }}>
                                        <Button 
                                            variant="contained" 
                                            color="info" 
                                            startIcon={<SaveIcon />} 
                                            onClick={handleSave} 
                                            disabled={saving} 
                                            sx={{ flex: 1, borderRadius: 2 }}
                                        >
                                            {saving ? 'Saving...' : 'Save'}
                                        </Button>
                                    </Box>
                                </>
                            )}
                        </CardContent>
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
                            Fuel & Deduction Settings
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Manage Fuel Rates, Pump Cash Discounts, and Projected Deductions efficiently.
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
                                bgcolor: tabIndex === 0 ? 'primary.main' : tabIndex === 1 ? 'success.main' : tabIndex === 2 ? 'warning.main' : 'info.main',
                                color: '#fff !important',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                            }
                        }}
                    >
                        <Tab label="Fuel Rate Settings" />
                        <Tab label="Pump Cash Discount" />
                        <Tab label="Projected Deduction Settings" />
                        <Tab label="Extra Cash Expense" />
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
            <TabPanel value={tabIndex} index={2}>
                <ProjectedDeductionTab snackHandler={snackHandler} />
            </TabPanel>
            <TabPanel value={tabIndex} index={3}>
                <ExtraCashExpenseTab snackHandler={snackHandler} />
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
