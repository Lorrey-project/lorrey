import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Container, Grid, Card, CardContent,
    IconButton, Button, Avatar, Chip, Paper,
    BottomNavigation, BottomNavigationAction,
    Drawer, List, ListItem, ListItemIcon, ListItemText,
    Divider, TextField, Dialog, DialogTitle, DialogContent, DialogActions,
    Alert, AlertTitle, Select, MenuItem, FormControl, InputLabel, Checkbox
} from '@mui/material';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../config';

// Icons
import AddIcon from '@mui/icons-material/Add';
import DescriptionIcon from '@mui/icons-material/Description';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import LogoutIcon from '@mui/icons-material/Logout';
import RefreshIcon from '@mui/icons-material/Refresh';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import MenuIcon from '@mui/icons-material/Menu';
import DashboardIcon from '@mui/icons-material/Dashboard';
import StorageIcon from '@mui/icons-material/Storage';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import VoucherDialog from '../../components/VoucherDialog';
import TruckContactManager from '../../components/TruckContactManager';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';

const MobileDashboard = ({
    onUploadNew,
    onOpenLorrySlip,
    onOpenFuelSlip,
    onOpenFuelRateSettings,
    onOpenVouchers,
    onOpenContacts,
    onOpenRegisters,
    onOpenBillingSheet,
    onRegisterBiometrics,
    onOpenAccountApprovals,
}) => {
    const { user, logout, registerPasskey } = useAuth();
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [securityDialogOpen, setSecurityDialogOpen] = useState(false);
    const [regError, setRegError] = useState('');
    const [regSuccess, setRegSuccess] = useState(false);
    const [isRegistering, setIsRegistering] = useState(false);
    const [navValue, setNavValue] = useState(0);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [truckManagerOpen, setTruckManagerOpen] = useState(false);
    const [voucherDialogOpen, setVoucherDialogOpen] = useState(false);
    const [filterMonth, setFilterMonth] = useState('');
    const [filterYear, setFilterYear] = useState('');
    const [page, setPage] = useState(0);
    const [selectedInvoices, setSelectedInvoices] = useState(new Set());
    const [portalStatuses, setPortalStatuses] = useState([]);

    const [pumpVerifications, setPumpVerifications] = useState([]);
    const [pumpStats, setPumpStats] = useState({ totalLitresToday: 0, verifiedTodayCount: 0, pendingCount: 0 });
    const [billingRows, setBillingRows] = useState([]);
    const [periodStatus, setPeriodStatus] = useState('Unpaid');
    const [verificationCodes, setVerificationCodes] = useState({});
    const [billingLoading, setBillingLoading] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [pendingApprovals, setPendingApprovals] = useState(0);

    // Live Clock Effect
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Portal Status polling (HEAD_OFFICE only)
    useEffect(() => {
        if (user?.role !== 'HEAD_OFFICE') return;
        const fetchPortalStatuses = async () => {
            try {
                const res = await axios.get(`${API_URL}/system/portal-status`);
                if (res.data.success) setPortalStatuses(res.data.statuses);
            } catch (e) { console.error('Portal status fetch failed', e); }
        };
        fetchPortalStatuses();
        const intervalId = setInterval(fetchPortalStatuses, 60000);
        return () => clearInterval(intervalId);
    }, [user?.role]);

    // Pending Approvals fetch (HEAD_OFFICE only)
    useEffect(() => {
        if (user?.role !== 'HEAD_OFFICE') return;
        const fetchPending = async () => {
            try {
                const token = localStorage.getItem('token');
                const res = await axios.get(`${API_URL}/auth/admin/pending-registrations`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.data.success) setPendingApprovals(res.data.users.length);
            } catch (e) { /* silent */ }
        };
        fetchPending();
        const id = setInterval(fetchPending, 60000);
        return () => clearInterval(id);
    }, [user?.role]);

    // Port-based Auto Detection
    const autoPump = window.location.port === '5175' ? 'SAS-1' : window.location.port === '5176' ? 'SAS-2' : null;

    // Period calculation
    const now = new Date();
    const currentDay = now.getDate();
    const selMonth = now.getMonth() + 1;
    const selYear = now.getFullYear();
    const selPeriod = currentDay <= 10 ? 1 : currentDay <= 20 ? 2 : 3;

    useEffect(() => {
        if (user?.role !== 'PETROL PUMP') {
            fetchInvoices();
        } else {
            // Priority: Port detection -> user profile -> null
            const finalPump = autoPump || user?.pumpName;
            if (finalPump) {
                fetchPumpData(finalPump);
            } else {
                setLoading(false);
            }
        }
    }, [user, autoPump]);

    const fetchPumpData = async (pumpName = user?.pumpName) => {
        if (!pumpName) return;
        try {
            const token = localStorage.getItem('token');
            const [verRes, statRes] = await Promise.all([
                axios.get(`${API_URL}/invoice/pump-verifications/${pumpName}`, {
                    headers: { Authorization: `Bearer ${token}` }
                }),
                axios.get(`${API_URL}/invoice/pump-stats/${pumpName}`, {
                    headers: { Authorization: `Bearer ${token}` }
                })
            ]);
            setPumpVerifications(verRes.data);
            setPumpStats(statRes.data);

            // Also fetch current period billing rows
            fetchBillingRows(token, pumpName);
        } catch (e) {
            console.error('Fetch pump data failed', e);
        } finally {
            setLoading(false);
        }
    };

    const fetchBillingRows = async (token, pumpName = user?.pumpName) => {
        setBillingLoading(true);
        try {
            const res = await axios.get(`${API_URL}/pump-payment/data`, {
                params: { pumpName: pumpName, month: selMonth, year: selYear, period: selPeriod },
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data.success) {
                setBillingRows(res.data.rows || []);
                setPeriodStatus(res.data.periodStatus || 'Unpaid');
            }
        } catch (e) {
            console.error('Fetch billing rows failed', e);
        } finally {
            setBillingLoading(false);
        }
    };

    const handleVerifyCode = async (row) => {
        const code = (verificationCodes[row._cementId] || '').trim();
        if (!code) return alert('Enter code');
        if (code !== (row['HSD SLIP NO'] || '').trim()) return alert('Invalid code');

        try {
            const token = localStorage.getItem('token');
            const finalPump = autoPump || user?.pumpName;
            await axios.put(`${API_URL}/cement-register/${row._cementId}`, {
                'VERIFICATION STATUS': 'Verified',
                'HSD RATE': 90, // Default for now
                'PUMP NAME': finalPump
            }, { headers: { Authorization: `Bearer ${token}` } });

            alert('Verified!');
            fetchPumpData(finalPump); // Refresh everything
        } catch (e) {
            alert('Verification failed');
        }
    };
    const handleRegisterDevice = async () => {
        setRegError('');
        setRegSuccess(false);
        setIsRegistering(true);
        try {
            await registerPasskey();
            setRegSuccess(true);
        } catch (err) {
            setRegError(err.message || 'Registration failed');
        } finally {
            setIsRegistering(false);
        }
    };

    const fetchInvoices = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`${API_URL}/invoice/all`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setInvoices(res.data);
            setSelectedInvoices(new Set());
        } catch (e) {
            console.error('Fetch failed', e);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectInvoice = (id) => {
        const newSelected = new Set(selectedInvoices);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedInvoices(newSelected);
    };

    const handleBulkDelete = async () => {
        if (!window.confirm(`Delete ${selectedInvoices.size} slip${selectedInvoices.size > 1 ? 's' : ''} permanently?`)) return;
        try {
            const token = localStorage.getItem('token');
            await axios.post(`${API_URL}/invoice/bulk-delete`, 
                { ids: Array.from(selectedInvoices) }, 
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setSelectedInvoices(new Set());
            fetchInvoices();
        } catch (e) {
            alert('Failed to delete slips');
        }
    };


    const isOffice = user?.role === 'HEAD_OFFICE' || (user?.role === 'OFFICE' && import.meta.env.VITE_PORTAL !== 'site');
    const isSite = import.meta.env.VITE_PORTAL === 'site';
    const isPump = user?.role === 'PETROL PUMP';

    const getStatusChip = (status) => {
        const color = status === 'approved' ? 'success' : 'warning';
        return <Chip label={status.toUpperCase()} color={color} size="small" sx={{ fontWeight: 800, fontSize: '9px', borderRadius: 1.5 }} />;
    };

    const isRecent = (dateStr) => {
        if (!dateStr) return false;
        try {
            const p = dateStr.replace(/[\.\/]/g, '-').split('-');
            if (p.length !== 3) return true;
            
            let d;
            const p0 = parseInt(p[0]);
            const p1 = parseInt(p[1]);
            const p2 = parseInt(p[2]);

            if (p0 > 1000) { // YYYY-MM-DD
                d = new Date(p0, p1 - 1, p2);
            } else { // DD-MM-YYYY or DD-MM-YY
                const y = p2 < 50 ? 2000 + p2 : p2 > 1000 ? p2 : 1900 + p2;
                d = new Date(y, p1 - 1, p0);
            }
            
            const diffDays = (new Date() - d) / (1000 * 60 * 60 * 24);
            return diffDays <= 1.5;
        } catch (e) { return true; }
    };

    const currentYear = new Date().getFullYear();
    const yearOptions = [currentYear, currentYear - 1, currentYear - 2];

    // Filter logic
    const filteredInvoices = invoices.filter(inv => {
        if (!filterMonth && !filterYear) return true;

        // Try to get a date string from various possible paths
        let dateStr = inv.human_verified_data?.invoice_details?.invoice_date || 
                      inv.ai_data?.invoice_data?.invoice_details?.invoice_date ||
                      inv.ai_data?.invoice_details?.invoice_date;

        let m, y;

        if (dateStr) {
            const parts = dateStr.replace(/[\.\/]/g, '-').split('-');
            if (parts.length === 3) {
                // Determine which part is the year (usually 4 digits)
                const p0 = parseInt(parts[0]);
                const p1 = parseInt(parts[1]);
                const p2 = parseInt(parts[2]);

                if (p0 > 1000) { // YYYY-MM-DD
                    y = p0;
                    m = p1;
                } else if (p2 > 1000) { // DD-MM-YYYY
                    y = p2;
                    m = p1;
                } else { // Assume DD-MM-YY and attempt to fix year
                    y = p2 < 50 ? 2000 + p2 : 1900 + p2;
                    m = p1;
                }
            }
        }

        // If still no m/y, fallback to created_at
        if ((!m || !y) && inv.created_at) {
            const d = new Date(inv.created_at);
            m = d.getMonth() + 1;
            y = d.getFullYear();
        }

        if (!m || !y) return false;

        if (filterMonth && m !== parseInt(filterMonth)) return false;
        if (filterYear && y !== parseInt(filterYear)) return false;

        return true;
    });

    const displayedInvoices = filteredInvoices.slice(page * 10, (page + 1) * 10);

    return (
        <Box sx={{
            minHeight: '100vh',
            bgcolor: '#f8fafc', // Light slate background
            color: '#1e293b',
            pb: 10,
            fontFamily: '"Outfit", sans-serif'
        }}>
            {/* ── Top Bar ─────────────────────────────────────────────── */}
            <Box sx={{
                p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: 'rgba(255, 255, 255, 0.8)', backdropFilter: 'blur(12px)',
                position: 'sticky', top: 0, zIndex: 1000,
                borderBottom: '1px solid rgba(0,0,0,0.05)'
            }}>
                <IconButton onClick={() => setDrawerOpen(true)} sx={{ color: '#1e293b' }}>
                    <MenuIcon />
                </IconButton>
                <Typography variant="h6" fontWeight="900" sx={{ letterSpacing: '-0.5px', color: '#0052cc' }}>
                    {isPump ? 'PUMP ' : 'LORREY '} <span style={{ color: '#1e293b' }}>{isPump ? 'PORTAL' : isSite ? 'SITE ADMIN' : 'ADMIN'}</span>
                </Typography>
                <Avatar sx={{ bgcolor: '#0052cc', width: 34, height: 34, fontSize: '16px', border: '2px solid #fff', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}>
                    🙏
                </Avatar>
            </Box>

            {/* ── Pump Info HUD (Added for Pump Role) ────────────────── */}
            {isPump && (
                <Box sx={{ px: 2, mt: 1 }}>
                    <Paper elevation={0} sx={{
                        p: 1.5, borderRadius: 3, bgcolor: '#fff', border: '1px solid rgba(0,0,0,0.05)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}>
                        <Box>
                            <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', fontSize: '9px' }}>Active Pump</Typography>
                            <Typography variant="body2" fontWeight={900} color="#059669">{autoPump || 'Detecting...'}</Typography>
                        </Box>
                        <Box sx={{ textAlign: 'right' }}>
                            <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', fontSize: '9px' }}>Real-time Status</Typography>
                            <Typography variant="body2" fontWeight={800} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                                {currentTime.toLocaleDateString('en-GB')} | {currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                            </Typography>
                        </Box>
                    </Paper>
                </Box>
            )}

            <Container maxWidth="sm" sx={{ mt: 1, px: { xs: 2, sm: 3 } }}>
                {/* ── Greeting with inline Portal Status (HEAD_OFFICE) ──── */}
                {!isPump && (
                    <Box mb={4} sx={{ px: 0.5, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Box>
                            <Typography variant="h5" fontWeight="900" sx={{ color: '#0f172a' }}>
                                Hello, {user?.name?.split(' ')[0] || (isSite ? 'Site Admin' : 'Admin')}
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#64748b', fontWeight: 500 }}>
                                {isOffice ? 'Office Operations' : 'Site Field Operations'}
                            </Typography>
                        </Box>

                        {/* Compact portal dots — right side, HEAD_OFFICE only */}
                        {user?.role === 'HEAD_OFFICE' && portalStatuses.length > 0 && (
                            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.75, mt: 0.5 }}>
                                {portalStatuses.map(ps => (
                                    <Box key={ps.id} sx={{
                                        display: 'flex', alignItems: 'center', gap: 0.6,
                                        bgcolor: ps.active ? '#f0fdf4' : '#fff5f5',
                                        border: `1px solid ${ps.active ? '#bbf7d0' : '#fecaca'}`,
                                        borderRadius: '20px', px: 1, py: 0.4,
                                    }}>
                                        <Box sx={{
                                            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                                            bgcolor: ps.active ? '#22c55e' : '#ef4444',
                                        }} />
                                        <Typography sx={{ fontSize: '0.6rem', fontWeight: 800, color: ps.active ? '#166534' : '#991b1b', lineHeight: 1, whiteSpace: 'nowrap' }}>
                                            {ps.name}
                                        </Typography>
                                    </Box>
                                ))}
                            </Box>
                        )}
                    </Box>
                )}

                {/* ── Action Cards Grid ───────────────────────────────────── */}
                {/* ── Action Cards (Office/Site Only) ────────────────── */}
                {!isPump && (<>
                    <Typography variant="overline" sx={{ letterSpacing: 1.5, color: '#94a3b8', fontWeight: 800, px: 0.5 }}>Quick Actions</Typography>
                    <Box sx={{
                        display: 'flex', gap: 1, mt: 0.5, mb: 4, px: 0.5,
                        width: '100%', justifyContent: 'space-between'
                    }}>
                        <Card onClick={onUploadNew} sx={{
                            flex: 1, p: 1, borderRadius: 4, bgcolor: '#fff', border: '1px solid rgba(0,0,0,0.05)',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer',
                            boxShadow: '0 4px 15px rgba(0,0,0,0.03)',
                            '&:active': { transform: 'scale(0.95)', transition: '0.1s' }
                        }}>
                            <Box sx={{ p: 1, bgcolor: '#e0f2fe', borderRadius: 3, mb: 1 }}>
                                <AddIcon sx={{ color: '#0052cc', fontSize: 20 }} />
                            </Box>
                            <Typography variant="caption" fontWeight="800" sx={{ color: '#1e293b', fontSize: '10px', textAlign: 'center', lineHeight: 1.1 }}>New<br />Invoice</Typography>
                        </Card>

                        {isOffice && (
                            <Card onClick={onOpenFuelRateSettings} sx={{
                                flex: 1, p: 1, borderRadius: 4, bgcolor: '#fff', border: '1px solid rgba(0,0,0,0.05)',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer',
                                boxShadow: '0 4px 15px rgba(0,0,0,0.03)',
                                '&:active': { transform: 'scale(0.95)', transition: '0.1s' }
                            }}>
                                <Box sx={{ p: 1, bgcolor: '#fef3c7', borderRadius: 3, mb: 1 }}>
                                    <LocalGasStationIcon sx={{ color: '#d97706', fontSize: 20 }} />
                                </Box>
                                <Typography variant="caption" fontWeight="800" sx={{ color: '#1e293b', fontSize: '10px', textAlign: 'center', lineHeight: 1.1 }}>HSD<br />Rate</Typography>
                            </Card>
                        )}

                        {/* Contacts Card */}
                        {isOffice && (
                            <Card onClick={() => setTruckManagerOpen(true)} sx={{
                                flex: 1, p: 1, borderRadius: 4, bgcolor: '#fff', border: '1px solid rgba(0,0,0,0.05)',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer',
                                boxShadow: '0 4px 15px rgba(0,0,0,0.03)',
                                '&:active': { transform: 'scale(0.95)', transition: '0.1s' }
                            }}>
                                <Box sx={{ p: 1, bgcolor: '#dbeafe', borderRadius: 3, mb: 1 }}>
                                    <LocalShippingIcon sx={{ color: '#1d4ed8', fontSize: 20 }} />
                                </Box>
                                <Typography variant="caption" fontWeight="800" sx={{ color: '#1e293b', fontSize: '10px', textAlign: 'center', lineHeight: 1.1 }}>Contacts</Typography>
                            </Card>
                        )}

                        {/* Vouchers Card */}
                        {(isOffice || isSite) && onOpenVouchers && (
                            <Card onClick={() => setVoucherDialogOpen(true)} sx={{
                                flex: 1, p: 1, borderRadius: 4, bgcolor: '#fff', border: '1px solid rgba(0,0,0,0.05)',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer',
                                boxShadow: '0 4px 15px rgba(0,0,0,0.03)',
                                '&:active': { transform: 'scale(0.95)', transition: '0.1s' }
                            }}>
                                <Box sx={{ p: 1, bgcolor: '#ede9fe', borderRadius: 3, mb: 1 }}>
                                    <ReceiptLongIcon sx={{ color: '#7c3aed', fontSize: 20 }} />
                                </Box>
                                <Typography variant="caption" fontWeight="800" sx={{ color: '#1e293b', fontSize: '10px', textAlign: 'center', lineHeight: 1.1 }}>Vouchers</Typography>
                            </Card>
                        )}

                        <Card onClick={fetchInvoices} sx={{
                            flex: 1, p: 1, borderRadius: 4, bgcolor: '#fff', border: '1px solid rgba(0,0,0,0.05)',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer',
                            boxShadow: '0 4px 15px rgba(0,0,0,0.03)',
                            '&:active': { transform: 'scale(0.95)', transition: '0.1s' }
                        }}>
                            <Box sx={{ p: 1, bgcolor: '#f3e8ff', borderRadius: 3, mb: 1 }}>
                                <RefreshIcon sx={{ color: '#9333ea', fontSize: 20 }} />
                            </Box>
                            <Typography variant="caption" fontWeight="800" sx={{ color: '#1e293b', fontSize: '10px', textAlign: 'center', lineHeight: 1.1 }}>Refresh</Typography>
                        </Card>
                    </Box>
                </>)}

                {/* ── Stats Summary ────────────────────────────────────────── */}
                {!isPump && (
                    <Paper sx={{
                        borderRadius: 5, p: 3, mb: 4,
                        background: 'linear-gradient(135deg, #0052cc 0%, #003d99 100%)',
                        color: '#fff', border: 'none', boxShadow: '0 10px 30px rgba(0, 82, 204, 0.2)'
                    }}>
                        <Box display="flex" justifyContent="space-between" alignItems="center">
                            <Box>
                                <Typography variant="h3" fontWeight="900" sx={{ letterSpacing: '-1px' }}>
                                    {(filterMonth || filterYear) ? filteredInvoices.length : invoices.length}
                                </Typography>
                                <Typography variant="body2" sx={{ opacity: 0.8, fontWeight: 500 }}>
                                    {(filterMonth || filterYear) ? 'Results found' : 'Total Invoices'}
                                </Typography>
                            </Box>
                            <Box sx={{ textAlign: 'right' }}>
                                <Box display="flex" gap={1} mb={1} sx={{ alignItems: 'center', justifyContent: 'flex-end' }}>
                                    <Chip label="Approved" size="small" sx={{ height: 18, bgcolor: 'rgba(255,255,255,0.2)', color: '#fff', fontSize: '9px', fontWeight: 900 }} />
                                    <Typography variant="body2" fontWeight="800">
                                        {filteredInvoices.filter(i => i.status === 'approved').length}
                                    </Typography>
                                </Box>
                                <Box display="flex" gap={1} sx={{ alignItems: 'center', justifyContent: 'flex-end' }}>
                                    <Chip label="Pending" size="small" sx={{ height: 18, bgcolor: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: '9px', fontWeight: 900 }} />
                                    <Typography variant="body2" fontWeight="800">
                                        {filteredInvoices.filter(i => i.status === 'pending').length}
                                    </Typography>
                                </Box>
                            </Box>
                        </Box>
                    </Paper>
                )}

                {/* ── Account Approvals Mobile Banner (HEAD_OFFICE only) ─── */}
                {user?.role === 'HEAD_OFFICE' && onOpenAccountApprovals && (
                    <Box
                        onClick={onOpenAccountApprovals}
                        sx={{
                            mb: 3, borderRadius: 5, overflow: 'hidden', cursor: 'pointer',
                            background: 'linear-gradient(135deg, #1e0a3c 0%, #3b0764 55%, #6d28d9 100%)',
                            boxShadow: pendingApprovals > 0 ? '0 10px 30px rgba(109,40,217,0.35)' : '0 4px 15px rgba(109,40,217,0.15)',
                            border: pendingApprovals > 0 ? '1.5px solid rgba(251,191,36,0.4)' : '1.5px solid rgba(109,40,217,0.2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            p: 2.5, gap: 2,
                            transition: 'all 0.2s',
                            '&:active': { transform: 'scale(0.98)' },
                            position: 'relative',
                        }}
                    >
                        {/* Decorative blobs */}
                        <Box sx={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />

                        <Box display="flex" alignItems="center" gap={2}>
                            <Box sx={{
                                width: 46, height: 46, borderRadius: '14px',
                                bgcolor: pendingApprovals > 0 ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.12)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            }}>
                                <PersonAddAlt1Icon sx={{ color: pendingApprovals > 0 ? '#fbbf24' : 'rgba(255,255,255,0.7)', fontSize: 24 }} />
                            </Box>
                            <Box>
                                <Typography sx={{ color: '#fff', fontWeight: 900, fontSize: 14, letterSpacing: '-0.3px', lineHeight: 1 }}>
                                    Account Approvals
                                </Typography>
                                <Typography sx={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 600, mt: 0.4 }}>
                                    {pendingApprovals > 0
                                        ? `${pendingApprovals} request${pendingApprovals !== 1 ? 's' : ''} waiting for review`
                                        : 'No pending registrations'}
                                </Typography>
                            </Box>
                        </Box>

                        {/* Right count badge */}
                        <Box sx={{
                            minWidth: 42, height: 42, borderRadius: '12px',
                            bgcolor: pendingApprovals > 0 ? '#fbbf24' : 'rgba(255,255,255,0.1)',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                        }}>
                            <Typography sx={{ color: pendingApprovals > 0 ? '#1e0a3c' : 'rgba(255,255,255,0.5)', fontWeight: 900, fontSize: 18, lineHeight: 1 }}>
                                {pendingApprovals}
                            </Typography>
                            <Typography sx={{ color: pendingApprovals > 0 ? '#3b0764' : 'rgba(255,255,255,0.35)', fontWeight: 700, fontSize: 8, letterSpacing: 0.5 }}>
                                PENDING
                            </Typography>
                        </Box>
                    </Box>
                )}

                {/* ── Actionable Blocks Launcher ────────────────── */}
                {isPump && (
                    <Box sx={{ mt: 2, mb: 1 }}>
                        <Card
                            onClick={onOpenBillingSheet}
                            sx={{
                                borderRadius: 5, p: 2.5,
                                background: 'linear-gradient(135deg, #059669, #10b981)',
                                color: '#fff', cursor: 'pointer',
                                boxShadow: '0 8px 25px rgba(5, 150, 105, 0.25)',
                                display: 'flex', alignItems: 'center', gap: 2,
                                transition: 'transform 0.2s',
                                '&:active': { transform: 'scale(0.96)' }
                            }}
                        >
                            <Box sx={{ bgcolor: 'rgba(255,255,255,0.2)', p: 1.5, borderRadius: 3 }}>
                                <AccountBalanceWalletIcon sx={{ fontSize: 32 }} />
                            </Box>
                            <Box>
                                <Typography variant="h6" fontWeight={900} sx={{ letterSpacing: -0.5 }}>Fuel Slips</Typography>
                                <Typography variant="caption" sx={{ opacity: 0.9, fontWeight: 600 }}>Verify & View Billing Sheet</Typography>
                            </Box>
                        </Card>
                    </Box>
                )}

                {/* ── Recent Invoices ────────────────────────── */}
                {!isPump && (<>
                    <Box display="flex" justifyContent="space-between" alignItems="center" px={0.5} mt={2}>
                        <Typography variant="overline" sx={{ letterSpacing: 1.5, color: '#94a3b8', fontWeight: 800 }}>
                            {(!filterMonth && !filterYear) ? '10 Recent Slips' : 'Filtered Slips'}
                        </Typography>
                    </Box>

                    {/* Filters */}
                    <Box display="flex" gap={1.5} mb={2} mt={1}>
                        <FormControl size="small" sx={{ flex: 1, bgcolor: '#fff', borderRadius: 2 }}>
                            <InputLabel sx={{ fontSize: 13, fontWeight: 600 }}>Month</InputLabel>
                            <Select
                                value={filterMonth}
                                label="Month"
                                onChange={(e) => setFilterMonth(e.target.value)}
                                sx={{ borderRadius: 2, fontSize: 14, fontWeight: 600 }}
                            >
                                <MenuItem value=""><em>All</em></MenuItem>
                                {[...Array(12)].map((_, i) => (
                                    <MenuItem key={i + 1} value={i + 1}>{new Date(2000, i).toLocaleString('en', { month: 'short' })}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <FormControl size="small" sx={{ flex: 1, bgcolor: '#fff', borderRadius: 2 }}>
                            <InputLabel sx={{ fontSize: 13, fontWeight: 600 }}>Year</InputLabel>
                            <Select
                                value={filterYear}
                                label="Year"
                                onChange={(e) => setFilterYear(e.target.value)}
                                sx={{ borderRadius: 2, fontSize: 14, fontWeight: 600 }}
                            >
                                <MenuItem value=""><em>All</em></MenuItem>
                                {yearOptions.map(y => (
                                    <MenuItem key={y} value={y}>{y}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Box>

                    {/* Pagination Controls */}
                    {filteredInvoices.length > 0 && (
                        <Box sx={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            mb: 2, p: 0.5, borderRadius: 3, bgcolor: '#fff',
                            border: '1px solid rgba(0,0,0,0.05)'
                        }}>
                            <Button
                                disabled={page === 0}
                                onClick={() => setPage(page - 1)}
                                sx={{ minWidth: 40, color: '#0052cc', fontWeight: 900 }}
                            >
                                &lt;
                            </Button>

                            <Typography variant="caption" fontWeight="800" sx={{ color: '#64748b' }}>
                                {page * 10 + 1}-{Math.min((page + 1) * 10, filteredInvoices.length)} of {filteredInvoices.length}
                            </Typography>

                            <Button
                                disabled={(page + 1) * 10 >= filteredInvoices.length}
                                onClick={() => setPage(page + 1)}
                                sx={{ minWidth: 40, color: '#0052cc', fontWeight: 900 }}
                            >
                                &gt;
                            </Button>
                        </Box>
                    )}

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {displayedInvoices.length === 0 ? (
                            <Paper elevation={0} sx={{ textAlign: 'center', py: 6, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.6)', border: '1px dashed rgba(0,0,0,0.1)' }}>
                                <Typography sx={{ color: '#94a3b8', fontWeight: 600 }}>No slips found</Typography>
                            </Paper>
                        ) : displayedInvoices.map((inv) => (
                            <Card key={inv._id} elevation={0} sx={{
                                borderRadius: 4, bgcolor: '#fff',
                                border: '1px solid rgba(0,0,0,0.06)',
                                p: 0, overflow: 'hidden',
                                boxShadow: '0 4px 15px rgba(0,0,0,0.03)',
                                transition: 'all 0.2s',
                                '&:active': { transform: 'scale(0.98)' }
                            }}>
                                {/* Top color accent & Header */}
                                <Box sx={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    p: 2, pb: 1.5, borderBottom: '1px solid rgba(0,0,0,0.04)',
                                    bgcolor: inv.status === 'approved' ? 'rgba(22, 163, 74, 0.03)' : 'rgba(245, 158, 11, 0.03)'
                                }}>
                                    <Box display="flex" alignItems="center" gap={1.5}>
                                        <Checkbox 
                                            checked={selectedInvoices.has(inv._id)}
                                            onChange={() => handleSelectInvoice(inv._id)}
                                            sx={{ p: 0, color: '#cbd5e1', '&.Mui-checked': { color: '#ef4444' } }}
                                        />
                                        <Box sx={{
                                            width: 36, height: 36, borderRadius: '10px',
                                            bgcolor: inv.status === 'approved' ? '#dcfce7' : '#fef3c7',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            <DescriptionIcon sx={{ fontSize: 18, color: inv.status === 'approved' ? '#16a34a' : '#d97706' }} />
                                        </Box>
                                        <Box>
                                            <Typography variant="body2" fontWeight="900" sx={{ color: '#1e293b', fontSize: 14 }}>
                                                {inv.human_verified_data?.invoice_details?.invoice_number || 'INV-TEMP'}
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                                                {inv.human_verified_data?.invoice_details?.invoice_date || 'N/A'}
                                            </Typography>
                                        </Box>
                                    </Box>
                                    {getStatusChip(inv.status)}
                                </Box>

                                {/* Content Details */}
                                <Box sx={{ p: 2, pt: 1.5 }}>
                                    <Box mb={2} display="flex" alignItems="center" gap={1}>
                                        <Box sx={{ width: 4, height: 16, bgcolor: '#0052cc', borderRadius: 2 }} />
                                        <Typography variant="body2" fontWeight="800" sx={{ color: '#0f172a' }}>
                                            {inv.human_verified_data?.supply_details?.vehicle_number || 'UNKNOWN TRUCK'}
                                        </Typography>
                                    </Box>
                                    <Box display="flex" gap={1} flexWrap="wrap">
                                        <Button
                                            size="small" variant="contained" disableElevation
                                            onClick={() => window.open(inv.softcopy_url, '_blank')}
                                            disabled={!inv.softcopy_url}
                                            sx={{ flex: '1 1 auto', bgcolor: '#f1f5f9', color: '#334155', fontWeight: 700, borderRadius: 2.5, '&:hover': { bgcolor: '#e2e8f0' } }}
                                        >
                                            INV
                                        </Button>
                                        <Button
                                            size="small" variant="contained" disableElevation
                                            onClick={() => window.open(inv.gcn_url, '_blank')}
                                            disabled={!inv.gcn_url}
                                            sx={{ flex: '1 1 auto', bgcolor: '#fce7f3', color: '#be185d', fontWeight: 700, borderRadius: 2.5, '&:hover': { bgcolor: '#fbcfe8' } }}
                                        >
                                            GCN
                                        </Button>
                                        <Button
                                            size="small" variant="contained" disableElevation
                                            onClick={() => onOpenLorrySlip(inv._id)}
                                            sx={{ flex: '1 1 auto', bgcolor: '#e0e7ff', color: '#4f46e5', fontWeight: 700, borderRadius: 2.5, '&:hover': { bgcolor: '#c7d2fe' } }}
                                        >
                                            LHR
                                        </Button>
                                        <Button
                                            size="small" variant="contained" disableElevation
                                            onClick={() => onOpenFuelSlip(inv._id)}
                                            sx={{ flex: '1 1 auto', bgcolor: '#ecfccb', color: '#4d7c0f', fontWeight: 700, borderRadius: 2.5, '&:hover': { bgcolor: '#d9f99d' } }}
                                        >
                                            FUEL
                                        </Button>
                                    </Box>
                                </Box>
                            </Card>
                        ))}
                    </Box>
                </>)}
            </Container>

            {/* ── Navigation Drawer ───────────────────────────────────── */}
            <Drawer anchor="left" open={drawerOpen} onClose={() => setDrawerOpen(false)} sx={{
                '& .MuiDrawer-paper': { bgcolor: '#fff', color: '#1e293b', width: 280, borderRight: 'none', boxShadow: '20px 0 60px rgba(0,0,0,0.05)' }
            }}>
                <Box p={3}>
                    <Typography variant="h5" fontWeight="900" sx={{ mb: 4, letterSpacing: '-1px' }}>
                        {isPump ? 'Pump ' : 'Admin '} <span style={{ color: '#0052cc' }}>{isPump ? 'Portal' : 'Panel'}</span>
                    </Typography>
                    <List sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <ListItem button sx={{ borderRadius: 2, bgcolor: '#f0f7ff' }}>
                            <ListItemIcon><DashboardIcon sx={{ color: '#0052cc' }} /></ListItemIcon>
                            <ListItemText primary="Dashboard" primaryTypographyProps={{ fontWeight: 800, color: '#0052cc' }} />
                        </ListItem>
                        {!isPump && <>
                            {isOffice && (
                                <ListItem button onClick={() => { setDrawerOpen(false); setTruckManagerOpen(true); }} sx={{ borderRadius: 2 }}>
                                    <ListItemIcon><LocalShippingIcon sx={{ color: '#64748b' }} /></ListItemIcon>
                                    <ListItemText primary="Contacts" primaryTypographyProps={{ fontWeight: 600 }} />
                                </ListItem>
                            )}
                            {(isOffice || isSite) && onOpenVouchers && (
                                <ListItem button onClick={() => { setDrawerOpen(false); setVoucherDialogOpen(true); }} sx={{ borderRadius: 2 }}>
                                    <ListItemIcon><ReceiptLongIcon sx={{ color: '#64748b' }} /></ListItemIcon>
                                    <ListItemText primary="Vouchers" primaryTypographyProps={{ fontWeight: 600 }} />
                                </ListItem>
                            )}
                            {isOffice && (
                                <ListItem button onClick={() => { setDrawerOpen(false); onOpenFuelRateSettings(); }} sx={{ borderRadius: 2 }}>
                                    <ListItemIcon><LocalGasStationIcon sx={{ color: '#64748b' }} /></ListItemIcon>
                                    <ListItemText primary="HSD Pricing" primaryTypographyProps={{ fontWeight: 600 }} />
                                </ListItem>
                            )}
                        </>}
                        {isPump && (
                            <ListItem button onClick={() => { setDrawerOpen(false); onOpenBillingSheet(); }} sx={{ borderRadius: 2 }}>
                                <ListItemIcon><AccountBalanceWalletIcon sx={{ color: '#64748b' }} /></ListItemIcon>
                                <ListItemText primary="Billing Sheet" primaryTypographyProps={{ fontWeight: 600 }} />
                            </ListItem>
                        )}
                        <ListItem button onClick={() => setSecurityDialogOpen(true)} sx={{ borderRadius: 2 }}>
                            <ListItemIcon><FingerprintIcon sx={{ color: '#64748b' }} /></ListItemIcon>
                            <ListItemText primary="Security Opts" primaryTypographyProps={{ fontWeight: 600 }} />
                        </ListItem>
                    </List>

                    <Box sx={{ mt: 'auto', pt: 10 }}>
                        <Button
                            fullWidth variant="outlined" color="error"
                            startIcon={<LogoutIcon />}
                            onClick={logout}
                            sx={{ borderRadius: 3, p: 1.5, fontWeight: 900, border: '2px solid' }}
                        >
                            Log Out
                        </Button>
                    </Box>
                </Box>
            </Drawer>

            {/* ── Bottom Nav ─────────────────────────────────────────── */}
            <Paper sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, bgcolor: '#fff', borderTop: '1px solid rgba(0,0,0,0.05)', zIndex: 1000 }} elevation={10}>
                <BottomNavigation
                    showLabels
                    value={navValue}
                    onChange={(event, newValue) => setNavValue(newValue)}
                    sx={{ bgcolor: 'transparent', height: 75 }}
                >
                    <BottomNavigationAction label="Home" icon={<DashboardIcon />} sx={{ color: '#94a3b8', '&.Mui-selected': { color: isPump ? '#059669' : '#0052cc' } }} />
                    {!isPump && <BottomNavigationAction label="Upload" icon={<AddIcon sx={{ bgcolor: '#0052cc', color: '#fff', borderRadius: '50%', p: 0.5, fontSize: 32, boxShadow: '0 4px 12px rgba(0, 82, 204, 0.3)' }} />} onClick={onUploadNew} />}
                </BottomNavigation>
            </Paper>

            {/* ── Bulk Delete Bar ─────────────────────────────────────────── */}
            {selectedInvoices.size > 0 && (
                <Paper sx={{
                    position: 'fixed', bottom: 85, left: 16, right: 16,
                    bgcolor: '#ef4444', color: '#fff', borderRadius: 4,
                    p: 2, display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', zIndex: 1100,
                    boxShadow: '0 10px 25px rgba(239, 68, 68, 0.4)'
                }}>
                    <Typography fontWeight={800}>{selectedInvoices.size} Slips Selected</Typography>
                    <Button 
                        variant="contained" 
                        color="inherit" 
                        onClick={handleBulkDelete}
                        sx={{ color: '#ef4444', bgcolor: '#fff', fontWeight: 900, borderRadius: 3, '&:hover': { bgcolor: '#f8fafc' } }}
                    >
                        Delete
                    </Button>
                </Paper>
            )}


            {/* ── Security Options Dialog ─────────────────────────── */}
            <Dialog
                open={securityDialogOpen}
                onClose={() => setSecurityDialogOpen(false)}
                PaperProps={{ sx: { borderRadius: 5, p: 1 } }}
            >
                <DialogTitle sx={{ fontWeight: 900, pb: 1 }}>Security Options</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        Register your phone to enable <b>Biometric Login</b> (Face ID / Touch ID). This allows you to skip passwords on this device.
                    </Typography>

                    {regError && (
                        <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}>
                            <AlertTitle>Registration Failed</AlertTitle>
                            {regError}
                        </Alert>
                    )}

                    {regSuccess && (
                        <Alert severity="success" sx={{ mb: 2, borderRadius: 3 }}>
                            <AlertTitle>Success</AlertTitle>
                            This device is now registered for biometric login.
                        </Alert>
                    )}

                    <Box sx={{ bgcolor: '#f8fafc', p: 2, borderRadius: 3, border: '1px dashed #e2e8f0' }}>
                        <Typography variant="caption" fontWeight={800} color="primary" sx={{ display: 'block', mb: 1 }}>DEVICE TRUSTED</Typography>
                        <Typography variant="body2" fontWeight={600}>{navigator.userAgent.split(' ')[0]} Mobile Interface</Typography>
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 2, pt: 0 }}>
                    <Button onClick={() => setSecurityDialogOpen(false)} sx={{ fontWeight: 700, color: '#64748b' }}>Close</Button>
                    <Button
                        variant="contained"
                        onClick={handleRegisterDevice}
                        disabled={isRegistering}
                        startIcon={<FingerprintIcon />}
                        sx={{ borderRadius: 3, fontWeight: 800, px: 3 }}
                    >
                        {isRegistering ? 'Registering...' : 'Register Device'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* ── Modals ──────────────────────── */}
            <TruckContactManager open={truckManagerOpen} onClose={() => setTruckManagerOpen(false)} />
            <VoucherDialog open={voucherDialogOpen} onClose={() => setVoucherDialogOpen(false)} initialTab={0} />
        </Box>
    );
};

export default MobileDashboard;
