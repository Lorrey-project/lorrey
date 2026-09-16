import React, { useState, useEffect, useCallback } from 'react';
import SearchableSelect from '../../components/SearchableSelect';
import {
    Box, Typography, Container, Grid, Card, CardContent,
    IconButton, Button, Avatar, Chip, Paper,
    BottomNavigation, BottomNavigationAction,
    Drawer, List, ListItem, ListItemIcon, ListItemText,
    Divider, TextField, Dialog, DialogTitle, DialogContent, DialogActions,
    Alert, AlertTitle, MenuItem, Checkbox
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
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DeleteIcon from '@mui/icons-material/Delete';

const MobileDashboard = ({
    onUploadNew,
    onOpenLorrySlip,
    onOpenFuelSlip,
    onOpenFuelRateSettings,
    onOpenVouchers,
    onOpenBillingSheet,
    onOpenAccountApprovals,
}) => {
    const { user, logout, registerPasskey } = useAuth();
    const [invoices, setInvoices] = useState([]);
    const [, setLoading] = useState(true);
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

    const [, setPumpVerifications] = useState([]);
    const [, setPumpStats] = useState({ totalLitresToday: 0, verifiedTodayCount: 0, pendingCount: 0 });
    const [, setBillingRows] = useState([]);
    const [, setPeriodStatus] = useState('Unpaid');
    const [, setVerificationCodes] = useState({});
    const [, setBillingLoading] = useState(false);
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
                const [authRes, truckRes] = await Promise.all([
                    axios.get(`${API_URL}/auth/admin/pending-registrations`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: { success: false } })),
                    axios.get(`${API_URL}/truck-contacts/approvals`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: { success: false } }))
                ]);
                let count = 0;
                if (authRes.data?.success && authRes.data.users) count += authRes.data.users.length;
                if (truckRes.data?.success && truckRes.data.requests) count += truckRes.data.requests.length;
                setPendingApprovals(count);
            } catch { /* silent */ }
        };
        fetchPending();
        const interval = setInterval(fetchPending, 30000);
        return () => clearInterval(interval);
    }, [user?.role]);

    // Port-based Auto Detection
    const autoPump = window.location.port === '5175' ? 'SAS-1' : window.location.port === '5176' ? 'SAS-2' : null;

    // Period calculation
    const now = new Date();
    const currentDay = now.getDate();
    const selMonth = now.getMonth() + 1;
    const selYear = now.getFullYear();
    const selPeriod = currentDay <= 10 ? 1 : currentDay <= 20 ? 2 : 3;

    const fetchInvoices = useCallback(async () => {
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
    }, []);

    const fetchBillingRows = useCallback(async (token, pumpName = user?.pumpName) => {
        try {
            await axios.get(`${API_URL}/pump-payment/data`, {
                params: { pumpName: pumpName, month: selMonth, year: selYear, period: selPeriod },
                headers: { Authorization: `Bearer ${token}` }
            });
        } catch (e) {
            console.error('Fetch billing rows failed', e);
        }
    }, [selMonth, selYear, selPeriod, user?.pumpName]);

    const fetchPumpData = useCallback(async (pumpName = user?.pumpName) => {
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
    }, [user?.pumpName, fetchBillingRows]);

    useEffect(() => {
        if (user?.role !== 'PETROL PUMP') {
            fetchInvoices();
        } else {
            const finalPump = autoPump || user?.pumpName;
            if (finalPump) {
                fetchPumpData(finalPump);
            } else {
                setLoading(false);
            }
        }
    }, [user, autoPump, fetchPumpData, fetchInvoices]);

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
        } catch {
            alert('Failed to delete slips');
        }
    };

    const isOffice = user?.role === 'HEAD_OFFICE' || (user?.role === 'OFFICE' && import.meta.env.VITE_PORTAL !== 'site');
    const isSite = import.meta.env.VITE_PORTAL === 'site';
    const isPump = user?.role === 'PETROL PUMP';

    const getStatusChip = (status) => {
        const isApproved = status === 'approved';
        return (
            <Chip
                label={status ? status.toUpperCase() : 'PENDING'}
                size="small"
                sx={{
                    fontWeight: 900,
                    fontSize: '10px',
                    letterSpacing: '0.5px',
                    px: 1,
                    py: 0.2,
                    borderRadius: '8px',
                    bgcolor: isApproved ? 'rgba(34, 197, 94, 0.15)' : 'rgba(245, 158, 11, 0.18)',
                    color: isApproved ? '#4ade80' : '#fbbf24',
                    border: isApproved ? '1px solid rgba(74, 222, 128, 0.3)' : '1px solid rgba(251, 191, 36, 0.35)',
                    boxShadow: isApproved ? '0 0 10px rgba(34, 197, 94, 0.2)' : '0 0 10px rgba(245, 158, 11, 0.2)'
                }}
            />
        );
    };

    const currentFyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;

    // Build Financial Year options (e.g. "2026-2027", "2025-2026", "2024-2025")
    const fySet = new Set();
    for (let y = currentFyStart + 1; y >= currentFyStart - 3; y--) {
        fySet.add(`${y}-${y + 1}`);
    }

    invoices.forEach(inv => {
        let dateStr = inv.human_verified_data?.invoice_details?.invoice_date || 
                      inv.ai_data?.invoice_data?.invoice_details?.invoice_date ||
                      inv.ai_data?.invoice_details?.invoice_date;
        let m, y;
        if (dateStr) {
            const parts = dateStr.replace(/[./]/g, '-').split('-');
            if (parts.length === 3) {
                const p0 = parseInt(parts[0]);
                const p1 = parseInt(parts[1]);
                const p2 = parseInt(parts[2]);
                if (p0 > 1000) { y = p0; m = p1; }
                else if (p2 > 1000) { y = p2; m = p1; }
                else { y = p2 < 50 ? 2000 + p2 : 1900 + p2; m = p1; }
            }
        }
        if ((!m || !y) && inv.created_at) {
            const d = new Date(inv.created_at);
            m = d.getMonth() + 1;
            y = d.getFullYear();
        }
        if (m && y) {
            const fy = m >= 4 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
            fySet.add(fy);
        }
    });

    const yearOptions = Array.from(fySet).sort((a, b) => b.localeCompare(a));

    // Filter logic
    const filteredInvoices = invoices.filter(inv => {
        if (!filterMonth && !filterYear) return true;

        let dateStr = inv.human_verified_data?.invoice_details?.invoice_date || 
                      inv.ai_data?.invoice_data?.invoice_details?.invoice_date ||
                      inv.ai_data?.invoice_details?.invoice_date;

        let m, y;

        if (dateStr) {
            const parts = dateStr.replace(/[./]/g, '-').split('-');
            if (parts.length === 3) {
                const p0 = parseInt(parts[0]);
                const p1 = parseInt(parts[1]);
                const p2 = parseInt(parts[2]);

                if (p0 > 1000) { // YYYY-MM-DD
                    y = p0;
                    m = p1;
                } else if (p2 > 1000) { // DD-MM-YYYY
                    y = p2;
                    m = p1;
                } else { // Assume DD-MM-YY
                    y = p2 < 50 ? 2000 + p2 : 1900 + p2;
                    m = p1;
                }
            }
        }

        if ((!m || !y) && inv.created_at) {
            const d = new Date(inv.created_at);
            m = d.getMonth() + 1;
            y = d.getFullYear();
        }

        if (!m || !y) return false;

        if (filterMonth && m !== parseInt(filterMonth)) return false;
        
        if (filterYear) {
            const invoiceFy = m >= 4 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
            if (invoiceFy !== filterYear) return false;
        }

        return true;
    });

    const displayedInvoices = filteredInvoices.slice(page * 10, (page + 1) * 10);

    return (
        <Box sx={{
            minHeight: '100dvh',
            bgcolor: '#0b1329', // Premium dark logistics slate
            color: '#f8fafc',
            pb: 14,
            fontFamily: '"Outfit", "Inter", sans-serif',
            boxSizing: 'border-box'
        }}>

            {/* ── TOP COMPACT HEADER BAR ─────────────────────────────────────── */}
            <Box sx={{
                p: 2,
                px: { xs: 2.5, sm: 4 },
                display: 'flex',
                justify: 'space-between',
                alignItems: 'center',
                background: 'rgba(15, 23, 42, 0.85)',
                backdropFilter: 'blur(16px)',
                position: 'sticky',
                top: 0,
                zIndex: 1000,
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
            }}>
                <Box display="flex" alignItems="center" gap={1.5}>
                    <IconButton
                        onClick={() => setDrawerOpen(true)}
                        sx={{
                            color: '#f8fafc',
                            bgcolor: 'rgba(255, 255, 255, 0.06)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '12px',
                            p: 1,
                            '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.12)' }
                        }}
                    >
                        <MenuIcon sx={{ fontSize: 22 }} />
                    </IconButton>

                    <Box>
                        <Box display="flex" alignItems="center" gap={1}>
                            <Typography variant="h6" fontWeight="900" sx={{ letterSpacing: '-0.5px', color: '#f8fafc', fontSize: '1.1rem' }}>
                                LORREY <span style={{ color: '#38bdf8' }}>{isPump ? 'PUMP' : isSite ? 'SITE' : 'ADMIN'}</span>
                            </Typography>
                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />
                        </Box>
                        <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600, display: 'block', fontSize: '0.7rem', mt: -0.2 }}>
                            {isOffice ? 'Office Operations' : 'Site Field Operations'}
                        </Typography>
                    </Box>
                </Box>

                <Box display="flex" alignItems="center" gap={1.5}>
                    <Avatar
                        sx={{
                            bgcolor: 'rgba(56, 189, 248, 0.15)',
                            color: '#38bdf8',
                            width: 38,
                            height: 38,
                            fontSize: '15px',
                            fontWeight: 800,
                            border: '1.5px solid rgba(56, 189, 248, 0.4)',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                        }}
                    >
                        {user?.name ? user.name.charAt(0).toUpperCase() : 'S'}
                    </Avatar>
                </Box>
            </Box>

            {/* ── Pump Info HUD (Added for Pump Role) ────────────────── */}
            {isPump && (
                <Box sx={{ px: { xs: 2.5, sm: 4 }, mt: 2 }}>
                    <Paper elevation={0} sx={{
                        p: 2, borderRadius: 3, bgcolor: '#1e293b', border: '1px solid rgba(255, 255, 255, 0.08)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}>
                        <Box>
                            <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', fontSize: '9px' }}>Active Pump</Typography>
                            <Typography variant="body2" fontWeight={900} color="#059669">{autoPump || 'Detecting...'}</Typography>
                        </Box>
                        <Box sx={{ textAlign: 'right' }}>
                            <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', fontSize: '9px' }}>Real-time Status</Typography>
                            <Typography variant="body2" fontWeight={800} sx={{ fontVariantNumeric: 'tabular-nums', color: '#38bdf8' }}>
                                {currentTime.toLocaleDateString('en-GB')} | {currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                            </Typography>
                        </Box>
                    </Paper>
                </Box>
            )}

            <Container maxWidth="sm" sx={{ mt: 2.5, px: { xs: 2.5, sm: 4 } }}>

                {/* ── GREETING BANNER ───────────────────────────────────────── */}
                {!isPump && (
                    <Box mb={3} display="flex" justifyContent="space-between" alignItems="center">
                        <Box>
                            <Typography variant="caption" sx={{ color: '#38bdf8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.7rem' }}>
                                Field Operations Dashboard
                            </Typography>
                            <Typography variant="h5" fontWeight="900" sx={{ color: '#f8fafc', letterSpacing: '-0.5px' }}>
                                Hello, {user?.name?.split(' ')[0] || (isSite ? 'Site' : 'Admin')}
                            </Typography>
                        </Box>

                        <Chip
                            icon={<Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#22c55e', ml: 1, boxShadow: '0 0 6px #22c55e' }} />}
                            label="Live Sync"
                            size="small"
                            sx={{ bgcolor: 'rgba(34, 197, 94, 0.1)', color: '#4ade80', fontWeight: 800, fontSize: '0.7rem', border: '1px solid rgba(34, 197, 94, 0.25)' }}
                        />
                    </Box>
                )}

                {/* ── QUICK ACTIONS CARDS ───────────────────────────────────── */}
                {!isPump && (
                    <Box sx={{ mb: 3.5 }}>
                        <Typography variant="overline" sx={{ letterSpacing: 1.5, color: '#94a3b8', fontWeight: 800, fontSize: '0.7rem' }}>
                            QUICK ACTIONS
                        </Typography>

                        <Grid container spacing={1.5} sx={{ mt: 0.2 }}>
                            {/* New Invoice Action Card */}
                            <Grid item xs={6}>
                                <Paper
                                    elevation={0}
                                    onClick={onUploadNew}
                                    sx={{
                                        p: 2,
                                        borderRadius: 3.5,
                                        bgcolor: '#1e293b',
                                        border: '1px solid rgba(56, 189, 248, 0.25)',
                                        background: 'linear-gradient(145deg, #1e293b 0%, #0f172a 100%)',
                                        cursor: 'pointer',
                                        boxShadow: '0 8px 20px rgba(0,0,0,0.2)',
                                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                        '&:active': { transform: 'scale(0.96)', bgcolor: '#334155' }
                                    }}
                                >
                                    <Box sx={{ width: 40, height: 40, borderRadius: '12px', bgcolor: 'rgba(56, 189, 248, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1.5, border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                                        <AddIcon sx={{ color: '#38bdf8', fontSize: 24 }} />
                                    </Box>
                                    <Typography variant="body2" fontWeight="900" sx={{ color: '#f8fafc', fontSize: '0.95rem' }}>
                                        New Invoice
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600, fontSize: '0.72rem', display: 'block', mt: 0.2 }}>
                                        Upload new slip
                                    </Typography>
                                </Paper>
                            </Grid>

                            {/* Refresh Action Card */}
                            <Grid item xs={6}>
                                <Paper
                                    elevation={0}
                                    onClick={fetchInvoices}
                                    sx={{
                                        p: 2,
                                        borderRadius: 3.5,
                                        bgcolor: '#1e293b',
                                        border: '1px solid rgba(192, 132, 252, 0.25)',
                                        background: 'linear-gradient(145deg, #1e293b 0%, #0f172a 100%)',
                                        cursor: 'pointer',
                                        boxShadow: '0 8px 20px rgba(0,0,0,0.2)',
                                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                        '&:active': { transform: 'scale(0.96)', bgcolor: '#334155' }
                                    }}
                                >
                                    <Box sx={{ width: 40, height: 40, borderRadius: '12px', bgcolor: 'rgba(192, 132, 252, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1.5, border: '1px solid rgba(192, 132, 252, 0.3)' }}>
                                        <RefreshIcon sx={{ color: '#c084fc', fontSize: 22 }} />
                                    </Box>
                                    <Typography variant="body2" fontWeight="900" sx={{ color: '#f8fafc', fontSize: '0.95rem' }}>
                                        Refresh
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600, fontSize: '0.72rem', display: 'block', mt: 0.2 }}>
                                        Sync latest data
                                    </Typography>
                                </Paper>
                            </Grid>

                            {/* Vouchers Action Card (If Site/Office) */}
                            {(isOffice || isSite) && onOpenVouchers && (
                                <Grid item xs={12}>
                                    <Paper
                                        elevation={0}
                                        onClick={() => setVoucherDialogOpen(true)}
                                        sx={{
                                            p: 1.8,
                                            px: 2.2,
                                            borderRadius: 3.5,
                                            bgcolor: '#1e293b',
                                            border: '1px solid rgba(168, 85, 247, 0.25)',
                                            background: 'linear-gradient(145deg, #1e293b 0%, #0f172a 100%)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justify: 'space-between',
                                            cursor: 'pointer',
                                            boxShadow: '0 8px 20px rgba(0,0,0,0.2)',
                                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                            '&:active': { transform: 'scale(0.97)' }
                                        }}
                                    >
                                        <Box display="flex" alignItems="center" gap={1.8}>
                                            <Box sx={{ width: 38, height: 38, borderRadius: '12px', bgcolor: 'rgba(168, 85, 247, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
                                                <ReceiptLongIcon sx={{ color: '#a855f7', fontSize: 22 }} />
                                            </Box>
                                            <Box>
                                                <Typography variant="body2" fontWeight="900" sx={{ color: '#f8fafc', fontSize: '0.92rem' }}>
                                                    Voucher Register
                                                </Typography>
                                                <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600, fontSize: '0.72rem' }}>
                                                    Manage site expense vouchers
                                                </Typography>
                                            </Box>
                                        </Box>
                                        <ChevronRightIcon sx={{ color: '#64748b' }} />
                                    </Paper>
                                </Grid>
                            )}
                        </Grid>
                    </Box>
                )}

                {/* ── HERO STAT CARD (TOTAL INVOICES) ───────────────────────── */}
                {!isPump && (
                    <Paper
                        elevation={0}
                        sx={{
                            borderRadius: 4,
                            p: 3,
                            mb: 3.5,
                            background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 50%, #0f172a 100%)',
                            color: '#ffffff',
                            position: 'relative',
                            overflow: 'hidden',
                            boxShadow: '0 12px 30px -5px rgba(2, 132, 199, 0.35)',
                            border: '1px solid rgba(255, 255, 255, 0.15)'
                        }}
                    >
                        {/* Decorative radial background glow */}
                        <Box sx={{ position: 'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: '50%', background: 'radial-gradient(circle, rgba(56, 189, 248, 0.3) 0%, rgba(0,0,0,0) 70%)', pointerEvents: 'none' }} />

                        <Typography variant="caption" sx={{ textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 800, color: 'rgba(255, 255, 255, 0.75)', fontSize: '0.7rem' }}>
                            {(filterMonth || filterYear) ? 'FILTERED RESULTS' : 'TOTAL INVOICES'}
                        </Typography>

                        <Box display="flex" justifyContent="space-between" alignItems="flex-end" mt={1}>
                            <Typography variant="h2" fontWeight="900" sx={{ letterSpacing: '-1.5px', lineHeight: 1, color: '#ffffff' }}>
                                {(filterMonth || filterYear) ? filteredInvoices.length : invoices.length}
                            </Typography>

                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'flex-end' }}>
                                {/* Approved Pill */}
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'rgba(34, 197, 94, 0.25)', border: '1px solid rgba(74, 222, 128, 0.4)', borderRadius: '20px', px: 1.5, py: 0.4 }}>
                                    <CheckCircleIcon sx={{ fontSize: 14, color: '#4ade80' }} />
                                    <Typography variant="caption" fontWeight="800" sx={{ color: '#ffffff', fontSize: '0.72rem' }}>
                                        APPROVED
                                    </Typography>
                                    <Typography variant="caption" fontWeight="900" sx={{ color: '#ffffff', fontSize: '0.8rem', ml: 0.5 }}>
                                        {filteredInvoices.filter(i => i.status === 'approved').length}
                                    </Typography>
                                </Box>

                                {/* Pending Pill */}
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'rgba(245, 158, 11, 0.25)', border: '1px solid rgba(251, 191, 36, 0.4)', borderRadius: '20px', px: 1.5, py: 0.4 }}>
                                    <HourglassTopIcon sx={{ fontSize: 14, color: '#fbbf24' }} />
                                    <Typography variant="caption" fontWeight="800" sx={{ color: '#ffffff', fontSize: '0.72rem' }}>
                                        PENDING
                                    </Typography>
                                    <Typography variant="caption" fontWeight="900" sx={{ color: '#ffffff', fontSize: '0.8rem', ml: 0.5 }}>
                                        {filteredInvoices.filter(i => i.status === 'pending').length}
                                    </Typography>
                                </Box>
                            </Box>
                        </Box>
                    </Paper>
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

                {/* ── RECENT SLIPS SECTION ───────────────────────────────────── */}
                {!isPump && (
                    <>
                        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5}>
                            <Typography variant="overline" sx={{ letterSpacing: 1.5, color: '#94a3b8', fontWeight: 800, fontSize: '0.7rem' }}>
                                {(!filterMonth && !filterYear) ? '10 RECENT SLIPS' : 'FILTERED SLIPS'}
                            </Typography>

                            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700, fontSize: '0.72rem' }}>
                                Total: {filteredInvoices.length}
                            </Typography>
                        </Box>

                        {/* Month & Year Filter Dropdowns */}
                        <Box display="flex" gap={1.5} mb={2}>
                            <SearchableSelect
                                value={filterMonth}
                                label="Month"
                                onChange={(e) => setFilterMonth(e.target.value)}
                                sx={{ flex: 1, bgcolor: '#1e293b', borderRadius: 2, input: { color: '#fff' } }}
                            >
                                <MenuItem value="">All</MenuItem>
                                {[...Array(12)].map((_, i) => (
                                    <MenuItem key={i + 1} value={i + 1}>{new Date(2000, i).toLocaleString('en', { month: 'short' })}</MenuItem>
                                ))}
                            </SearchableSelect>

                            <SearchableSelect
                                value={filterYear}
                                label="Year"
                                onChange={(e) => setFilterYear(e.target.value)}
                                sx={{ flex: 1, bgcolor: '#1e293b', borderRadius: 2, input: { color: '#fff' } }}
                            >
                                <MenuItem value="">All</MenuItem>
                                {yearOptions.map(y => (
                                    <MenuItem key={y} value={y}>{y}</MenuItem>
                                ))}
                            </SearchableSelect>
                        </Box>

                        {/* Pagination Bar */}
                        {filteredInvoices.length > 0 && (
                            <Paper
                                elevation={0}
                                sx={{
                                    display: 'flex',
                                    justify: 'space-between',
                                    alignItems: 'center',
                                    mb: 2.5,
                                    p: 1,
                                    px: 2,
                                    borderRadius: 3,
                                    bgcolor: '#1e293b',
                                    border: '1px solid rgba(255, 255, 255, 0.08)'
                                }}
                            >
                                <IconButton
                                    disabled={page === 0}
                                    onClick={() => setPage(page - 1)}
                                    size="small"
                                    sx={{ color: '#38bdf8', '&.Mui-disabled': { color: '#475569' } }}
                                >
                                    <ChevronLeftIcon />
                                </IconButton>

                                <Typography variant="caption" fontWeight="800" sx={{ color: '#cbd5e1', fontSize: '0.78rem' }}>
                                    {page * 10 + 1}–{Math.min((page + 1) * 10, filteredInvoices.length)} of {filteredInvoices.length}
                                </Typography>

                                <IconButton
                                    disabled={(page + 1) * 10 >= filteredInvoices.length}
                                    onClick={() => setPage(page + 1)}
                                    size="small"
                                    sx={{ color: '#38bdf8', '&.Mui-disabled': { color: '#475569' } }}
                                >
                                    <ChevronRightIcon />
                                </IconButton>
                            </Paper>
                        )}

                        {/* Recent Invoice Cards */}
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {displayedInvoices.length === 0 ? (
                                <Paper elevation={0} sx={{ textAlign: 'center', py: 6, borderRadius: 4, bgcolor: '#1e293b', border: '1px dashed #334155' }}>
                                    <Typography sx={{ color: '#94a3b8', fontWeight: 600 }}>No slips found for selected filter.</Typography>
                                </Paper>
                            ) : displayedInvoices.map((inv) => {
                                const invNum = inv.human_verified_data?.invoice_details?.invoice_number ||
                                               inv.ai_data?.invoice_data?.invoice_details?.invoice_number ||
                                               inv.ai_data?.invoice_details?.invoice_number ||
                                               'INV-TEMP';

                                const invDate = inv.human_verified_data?.invoice_details?.invoice_date ||
                                                inv.ai_data?.invoice_data?.invoice_details?.invoice_date ||
                                                inv.ai_data?.invoice_details?.invoice_date ||
                                                'N/A';

                                const truckNo = inv.human_verified_data?.supply_details?.vehicle_number ||
                                                inv.ai_data?.invoice_data?.supply_details?.vehicle_number ||
                                                inv.ai_data?.supply_details?.vehicle_number ||
                                                'UNKNOWN TRUCK';

                                return (
                                    <Paper
                                        key={inv._id}
                                        elevation={0}
                                        sx={{
                                            borderRadius: 3.5,
                                            bgcolor: '#1e293b',
                                            border: '1px solid rgba(255, 255, 255, 0.08)',
                                            p: 2,
                                            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                                            transition: 'transform 0.15s ease',
                                            '&:active': { transform: 'scale(0.99)' }
                                        }}
                                    >
                                        {/* Card Header: Checkbox, Invoice No, Date & Status */}
                                        <Box display="flex" justifyContent="space-between" alignItems="center" pb={1.5} mb={1.5} sx={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                                            <Box display="flex" alignItems="center" gap={1.2}>
                                                <Checkbox
                                                    checked={selectedInvoices.has(inv._id)}
                                                    onChange={() => handleSelectInvoice(inv._id)}
                                                    sx={{ p: 0, color: '#64748b', '&.Mui-checked': { color: '#ef4444' } }}
                                                />
                                                <Box sx={{ width: 34, height: 34, borderRadius: '10px', bgcolor: 'rgba(56, 189, 248, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
                                                    <DescriptionIcon sx={{ fontSize: 18, color: '#38bdf8' }} />
                                                </Box>
                                                <Box>
                                                    <Typography variant="body2" fontWeight="900" sx={{ color: '#f8fafc', fontSize: '0.9rem', letterSpacing: '-0.2px' }}>
                                                        {invNum}
                                                    </Typography>
                                                    <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600, fontSize: '0.72rem' }}>
                                                        {invDate}
                                                    </Typography>
                                                </Box>
                                            </Box>
                                            {getStatusChip(inv.status)}
                                        </Box>

                                        {/* Vehicle Number Row */}
                                        <Box display="flex" alignItems="center" gap={1} mb={2} px={0.5}>
                                            <LocalShippingIcon sx={{ fontSize: 18, color: '#38bdf8' }} />
                                            <Typography variant="body2" fontWeight="900" sx={{ color: '#38bdf8', letterSpacing: '0.5px' }}>
                                                {truckNo}
                                            </Typography>
                                        </Box>

                                        {/* Quick Slips Buttons Row */}
                                        <Box display="grid" gridTemplateColumns="repeat(4, 1fr)" gap={1}>
                                            <Button
                                                size="small"
                                                variant="contained"
                                                disableElevation
                                                onClick={() => window.open(inv.softcopy_url, '_blank')}
                                                disabled={!inv.softcopy_url}
                                                sx={{
                                                    bgcolor: '#0f172a',
                                                    color: '#cbd5e1',
                                                    fontWeight: 800,
                                                    fontSize: '0.72rem',
                                                    borderRadius: '8px',
                                                    py: 0.6,
                                                    border: '1px solid rgba(255,255,255,0.08)',
                                                    '&:hover': { bgcolor: '#334155' }
                                                }}
                                            >
                                                INV
                                            </Button>

                                            <Button
                                                size="small"
                                                variant="contained"
                                                disableElevation
                                                onClick={() => window.open(inv.gcn_url, '_blank')}
                                                disabled={!inv.gcn_url}
                                                sx={{
                                                    bgcolor: 'rgba(236, 72, 153, 0.12)',
                                                    color: '#f472b6',
                                                    fontWeight: 800,
                                                    fontSize: '0.72rem',
                                                    borderRadius: '8px',
                                                    py: 0.6,
                                                    border: '1px solid rgba(236, 72, 153, 0.25)',
                                                    '&:hover': { bgcolor: 'rgba(236, 72, 153, 0.2)' }
                                                }}
                                            >
                                                GCN
                                            </Button>

                                            <Button
                                                size="small"
                                                variant="contained"
                                                disableElevation
                                                onClick={() => onOpenLorrySlip(inv._id)}
                                                sx={{
                                                    bgcolor: 'rgba(99, 102, 241, 0.15)',
                                                    color: '#818cf8',
                                                    fontWeight: 800,
                                                    fontSize: '0.72rem',
                                                    borderRadius: '8px',
                                                    py: 0.6,
                                                    border: '1px solid rgba(99, 102, 241, 0.3)',
                                                    '&:hover': { bgcolor: 'rgba(99, 102, 241, 0.25)' }
                                                }}
                                            >
                                                LHR
                                            </Button>

                                            <Button
                                                size="small"
                                                variant="contained"
                                                disableElevation
                                                onClick={() => onOpenFuelSlip(inv._id)}
                                                sx={{
                                                    bgcolor: 'rgba(132, 204, 22, 0.15)',
                                                    color: '#a3e635',
                                                    fontWeight: 800,
                                                    fontSize: '0.72rem',
                                                    borderRadius: '8px',
                                                    py: 0.6,
                                                    border: '1px solid rgba(132, 204, 22, 0.3)',
                                                    '&:hover': { bgcolor: 'rgba(132, 204, 22, 0.25)' }
                                                }}
                                            >
                                                FUEL
                                            </Button>
                                        </Box>
                                    </Paper>
                                );
                            })}
                        </Box>
                    </>
                )}

            </Container>

            {/* ── NAVIGATION DRAWER ────────────────────────────────────────── */}
            <Drawer
                anchor="left"
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                PaperProps={{
                    sx: {
                        bgcolor: '#0f172a',
                        color: '#f8fafc',
                        width: 280,
                        borderRight: '1px solid rgba(255,255,255,0.08)'
                    }
                }}
            >
                <Box p={3}>
                    <Typography variant="h5" fontWeight="900" sx={{ mb: 4, letterSpacing: '-1px' }}>
                        LORREY <span style={{ color: '#38bdf8' }}>ADMIN</span>
                    </Typography>
                    <List sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <ListItem button sx={{ borderRadius: 2, bgcolor: 'rgba(56, 189, 248, 0.12)' }}>
                            <ListItemIcon><DashboardIcon sx={{ color: '#38bdf8' }} /></ListItemIcon>
                            <ListItemText primary="Dashboard" primaryTypographyProps={{ fontWeight: 800, color: '#38bdf8' }} />
                        </ListItem>

                        {!isPump && <>
                            {isOffice && (
                                <ListItem button onClick={() => { setDrawerOpen(false); setTruckManagerOpen(true); }} sx={{ borderRadius: 2 }}>
                                    <ListItemIcon><LocalShippingIcon sx={{ color: '#94a3b8' }} /></ListItemIcon>
                                    <ListItemText primary="Contacts" primaryTypographyProps={{ fontWeight: 600 }} />
                                </ListItem>
                            )}
                            {(isOffice || isSite) && onOpenVouchers && (
                                <ListItem button onClick={() => { setDrawerOpen(false); setVoucherDialogOpen(true); }} sx={{ borderRadius: 2 }}>
                                    <ListItemIcon><ReceiptLongIcon sx={{ color: '#94a3b8' }} /></ListItemIcon>
                                    <ListItemText primary="Vouchers" primaryTypographyProps={{ fontWeight: 600 }} />
                                </ListItem>
                            )}
                            {isOffice && (
                                <ListItem button onClick={() => { setDrawerOpen(false); onOpenFuelRateSettings(); }} sx={{ borderRadius: 2 }}>
                                    <ListItemIcon><LocalGasStationIcon sx={{ color: '#94a3b8' }} /></ListItemIcon>
                                    <ListItemText primary="Fuel & Deduction Settings" primaryTypographyProps={{ fontWeight: 600 }} />
                                </ListItem>
                            )}
                        </>}

                        <ListItem button onClick={() => setSecurityDialogOpen(true)} sx={{ borderRadius: 2 }}>
                            <ListItemIcon><FingerprintIcon sx={{ color: '#94a3b8' }} /></ListItemIcon>
                            <ListItemText primary="Security Opts" primaryTypographyProps={{ fontWeight: 600 }} />
                        </ListItem>
                    </List>

                    <Box sx={{ mt: 'auto', pt: 10 }}>
                        <Button
                            fullWidth
                            variant="outlined"
                            color="error"
                            startIcon={<LogoutIcon />}
                            onClick={logout}
                            sx={{ borderRadius: 3, p: 1.5, fontWeight: 900, borderColor: '#ef4444' }}
                        >
                            Log Out
                        </Button>
                    </Box>
                </Box>
            </Drawer>

            {/* ── FIXED BOTTOM NAVIGATION BAR ──────────────────────────────── */}
            <Paper
                elevation={10}
                sx={{
                    position: 'fixed',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    bgcolor: 'rgba(15, 23, 42, 0.95)',
                    backdropFilter: 'blur(16px)',
                    borderTop: '1px solid rgba(255,255,255,0.08)',
                    zIndex: 1000
                }}
            >
                <BottomNavigation
                    showLabels
                    value={navValue}
                    onChange={(event, newValue) => setNavValue(newValue)}
                    sx={{ bgcolor: 'transparent', height: 70 }}
                >
                    <BottomNavigationAction
                        label="Home"
                        icon={<DashboardIcon />}
                        sx={{
                            color: '#64748b',
                            '&.Mui-selected': { color: '#38bdf8' }
                        }}
                    />
                    {!isPump && (
                        <BottomNavigationAction
                            label="Upload"
                            icon={
                                <AddIcon
                                    sx={{
                                        bgcolor: '#0284c7',
                                        color: '#ffffff',
                                        borderRadius: '50%',
                                        p: 0.5,
                                        fontSize: 32,
                                        boxShadow: '0 4px 15px rgba(2, 132, 199, 0.5)'
                                    }}
                                />
                            }
                            onClick={onUploadNew}
                        />
                    )}
                </BottomNavigation>
            </Paper>

            {/* ── BULK DELETE BAR ─────────────────────────────────────────── */}
            {selectedInvoices.size > 0 && (
                <Paper
                    sx={{
                        position: 'fixed',
                        bottom: 80,
                        left: 16,
                        right: 16,
                        bgcolor: '#ef4444',
                        color: '#fff',
                        borderRadius: 3.5,
                        p: 1.8,
                        px: 2.5,
                        display: 'flex',
                        justify: 'space-between',
                        alignItems: 'center',
                        zIndex: 1100,
                        boxShadow: '0 10px 25px rgba(239, 68, 68, 0.4)'
                    }}
                >
                    <Typography fontWeight={800} fontSize="14px">
                        {selectedInvoices.size} Slips Selected
                    </Typography>
                    <Button 
                        variant="contained" 
                        color="inherit" 
                        onClick={handleBulkDelete}
                        startIcon={<DeleteIcon />}
                        sx={{ color: '#ef4444', bgcolor: '#ffffff', fontWeight: 900, borderRadius: 2.5, '&:hover': { bgcolor: '#f8fafc' } }}
                    >
                        Delete
                    </Button>
                </Paper>
            )}

            {/* ── SECURITY OPTIONS DIALOG ─────────────────────────────────── */}
            <Dialog
                open={securityDialogOpen}
                onClose={() => setSecurityDialogOpen(false)}
                PaperProps={{ sx: { borderRadius: 4, p: 1, bgcolor: '#1e293b', color: '#fff' } }}
            >
                <DialogTitle sx={{ fontWeight: 900, pb: 1 }}>Security Options</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="#94a3b8" sx={{ mb: 3 }}>
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

                    <Box sx={{ bgcolor: '#0f172a', p: 2, borderRadius: 3, border: '1px dashed #334155' }}>
                        <Typography variant="caption" fontWeight={800} color="#38bdf8" sx={{ display: 'block', mb: 1 }}>DEVICE TRUSTED</Typography>
                        <Typography variant="body2" fontWeight={600}>{navigator.userAgent.split(' ')[0]} Mobile Interface</Typography>
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 2, pt: 0 }}>
                    <Button onClick={() => setSecurityDialogOpen(false)} sx={{ fontWeight: 700, color: '#94a3b8' }}>Close</Button>
                    <Button
                        variant="contained"
                        onClick={handleRegisterDevice}
                        disabled={isRegistering}
                        startIcon={<FingerprintIcon />}
                        sx={{ borderRadius: 3, fontWeight: 800, px: 3, bgcolor: '#0284c7' }}
                    >
                        {isRegistering ? 'Registering...' : 'Register Device'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* ── MODALS ─────────────────────────────────────────────────── */}
            <TruckContactManager open={truckManagerOpen} onClose={() => setTruckManagerOpen(false)} />
            <VoucherDialog open={voucherDialogOpen} onClose={() => setVoucherDialogOpen(false)} initialTab={0} />
        </Box>
    );
};

export default MobileDashboard;
