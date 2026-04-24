import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Button, Chip, CircularProgress, Alert,
    Card, CardContent, Divider, Avatar, Tooltip, Container, IconButton,
    Tabs, Tab
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import BusinessIcon from '@mui/icons-material/Business';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import RefreshIcon from '@mui/icons-material/Refresh';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import ListAltIcon from '@mui/icons-material/ListAlt';
import BadgeIcon from '@mui/icons-material/Badge';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const ROLE_MAP = {
    'HEAD_OFFICE': { label: 'Head Office', color: '#7c3aed', bg: '#ede9fe', icon: <BusinessIcon sx={{ fontSize: 14 }} /> },
    'OFFICE':      { label: 'Site Admin',  color: '#0052cc', bg: '#dbeafe', icon: <LocationOnIcon sx={{ fontSize: 14 }} /> },
    'PETROL PUMP': { label: 'Pump Admin',  color: '#059669', bg: '#dcfce7', icon: <LocalGasStationIcon sx={{ fontSize: 14 }} /> },
};

const fmtDate = (d) => new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
});

const AccountApprovalsPage = ({ onBack }) => {
    const [tabIndex, setTabIndex] = useState(0);
    const [requests, setRequests] = useState([]);
    const [activeUsers, setActiveUsers] = useState([]);
    const [truckRequests, setTruckRequests] = useState([]);
    const [loading, setLoading]   = useState(true);
    const [actionId, setActionId] = useState(null);
    const [snack, setSnack]       = useState(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const [pendingRes, activeRes, truckRes] = await Promise.all([
                axios.get(`${API_URL}/auth/admin/pending-registrations`, { headers: { Authorization: `Bearer ${token}` } }),
                axios.get(`${API_URL}/auth/admin/active-users`, { headers: { Authorization: `Bearer ${token}` } }),
                axios.get(`${API_URL}/truck-contacts/approvals`, { headers: { Authorization: `Bearer ${token}` } })
            ]);
            if (pendingRes.data.success) setRequests(pendingRes.data.users);
            if (activeRes.data.success) setActiveUsers(activeRes.data.users);
            if (truckRes.data.success) setTruckRequests(truckRes.data.requests);
        } catch (e) {
            setSnack({ type: 'error', message: 'Failed to load approval data.' });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 60000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const handleApprove = async (id) => {
        setActionId(id);
        try {
            const token = localStorage.getItem('token');
            await axios.put(`${API_URL}/auth/admin/approve/${id}`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setRequests(prev => prev.filter(u => u._id !== id));
            setSnack({ type: 'success', message: '✅ Account approved! The user can now log in.' });
        } catch (e) {
            setSnack({ type: 'error', message: '❌ Failed to approve. Please try again.' });
        } finally {
            setActionId(null);
        }
    };

    const handleReject = async (id) => {
        if (!window.confirm('Are you sure you want to completely remove this user account? This cannot be undone.')) return;
        setActionId(id);
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`${API_URL}/auth/admin/reject/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setRequests(prev => prev.filter(u => u._id !== id));
            setActiveUsers(prev => prev.filter(u => u._id !== id));
            setSnack({ type: 'info', message: 'User account successfully removed.' });
        } catch (e) {
            setSnack({ type: 'error', message: '❌ Failed to reject. Please try again.' });
        } finally {
            setActionId(null);
        }
    };

    const handleProcessTruck = async (id, status) => {
        setActionId(id);
        try {
            const token = localStorage.getItem('token');
            await axios.put(`${API_URL}/truck-contacts/approvals/${id}`, { 
                status, 
                isVerified: status === 'approved',
                actionBy: localStorage.getItem('username') || 'Head Office' 
            }, { headers: { Authorization: `Bearer ${token}` } });

            setTruckRequests(prev => prev.filter(r => r._id !== id));
            setSnack({ 
                type: 'success', 
                message: status === 'approved' ? '✅ Profile Verified & Approved!' : 'Rejected.' 
            });
        } catch (e) {
            setSnack({ type: 'error', message: 'Failed to process truck profile.' });
        } finally {
            setActionId(null);
        }
    };

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: '#f4f7f9', fontFamily: '"Outfit", "Inter", system-ui, sans-serif' }}>

            {/* ── Top Bar ───────────────────────────────────────── */}
            <Box sx={{
                background: 'linear-gradient(135deg, #1e0a3c 0%, #3b0764 50%, #6d28d9 100%)',
                px: { xs: 2, md: 4 }, py: 3,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                boxShadow: '0 4px 24px rgba(109,40,217,0.25)',
            }}>
                <Box display="flex" alignItems="center" gap={2}>
                    <IconButton onClick={onBack} sx={{ color: 'rgba(255,255,255,0.8)', bgcolor: 'rgba(255,255,255,0.1)', borderRadius: '12px', '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' } }}>
                        <ArrowBackIcon />
                    </IconButton>
                    <Box>
                        <Typography sx={{ color: '#fff', fontWeight: 900, fontSize: { xs: 18, md: 22 }, letterSpacing: '-0.5px', lineHeight: 1 }}>
                            Account Approvals
                        </Typography>
                        <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, mt: 0.3 }}>
                            Head Office · Registration Management
                        </Typography>
                    </Box>
                </Box>
                <Box display="flex" alignItems="center" gap={1.5}>
                    {/* Live count pill */}
                    <Box sx={{
                        bgcolor: (requests.length + truckRequests.length) > 0 ? '#ef4444' : 'rgba(255,255,255,0.15)',
                        borderRadius: '20px', px: 2, py: 0.6,
                        display: 'flex', alignItems: 'center', gap: 1,
                        animation: (requests.length + truckRequests.length) > 0 ? 'pulse 2s infinite' : 'none'
                    }}>
                        <HourglassTopIcon sx={{ fontSize: 13, color: '#fff' }} />
                        <Typography sx={{ fontWeight: 900, fontSize: 13, color: '#fff' }}>
                            {loading ? '…' : requests.length + truckRequests.length} Total Pending
                        </Typography>
                    </Box>
                    <Tooltip title="Refresh All Data">
                        <IconButton onClick={fetchData} sx={{ color: 'rgba(255,255,255,0.8)', bgcolor: 'rgba(255,255,255,0.1)', borderRadius: '10px', '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' } }}>
                            <RefreshIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Tooltip>
                </Box>
            </Box>

            {/* ── Stat Overview Bar — MODERN ADDITION ────────────────── */}
            <Box sx={{ bgcolor: '#fff', borderBottom: '1px solid #e2e8f0', py: 3 }}>
                <Container maxWidth="md">
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 2 }}>
                        {[
                            { label: 'User Apps', count: requests.length, color: '#7c3aed', icon: PeopleAltIcon },
                            { label: 'Truck Profiles', count: truckRequests.length, color: '#0ea5e9', icon: LocalShippingIcon },
                            { label: 'Active Staff', count: activeUsers.length, color: '#16a34a', icon: VerifiedUserIcon }
                        ].map((stat, i) => (
                            <Box 
                                key={stat.label}
                                onClick={() => setTabIndex(i)}
                                sx={{ 
                                    p: 2, borderRadius: '16px', bgcolor: tabIndex === i ? `${stat.color}08` : '#fafafa',
                                    border: '1.5px solid', borderColor: tabIndex === i ? stat.color : '#f1f5f9',
                                    cursor: 'pointer', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    '&:hover': { transform: 'translateY(-2px)', boxShadow: `0 8px 16px ${stat.color}15`, borderColor: stat.color }
                                }}
                            >
                                <Box display="flex" alignItems="center" gap={1.5}>
                                    <Box sx={{ p: 1, bgcolor: `${stat.color}15`, color: stat.color, borderRadius: '10px', display: 'flex' }}>
                                        <stat.icon sx={{ fontSize: 20 }} />
                                    </Box>
                                    <Box>
                                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 800, textTransform: 'uppercase', fontSize: 10 }}>{stat.label}</Typography>
                                        <Typography variant="h6" sx={{ fontWeight: 900, lineHeight: 1, color: '#0f172a' }}>{stat.count}</Typography>
                                    </Box>
                                </Box>
                            </Box>
                        ))}
                    </Box>
                </Container>
            </Box>

            {/* ── Custom Tab Nav ────────────────────────────────────── */}
            <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: '#fff', px: { xs: 1, md: 4 }, position: 'sticky', top: 0, zIndex: 10 }}>
                <Tabs 
                    value={tabIndex} 
                    onChange={(e, v) => setTabIndex(v)} 
                    centered 
                    variant="fullWidth" 
                    TabIndicatorProps={{ sx: { height: 4, borderRadius: '4px 4px 0 0', bgcolor: tabIndex === 0 ? '#7c3aed' : (tabIndex === 1 ? '#0ea5e9' : '#16a34a') } }}
                    sx={{
                        '& .MuiTab-root': { py: 2.5, transition: 'all 0.2s' },
                        '& .Mui-selected': { 
                            bgcolor: 'rgba(0,0,0,0.02)',
                            color: `${tabIndex === 0 ? '#7c3aed' : (tabIndex === 1 ? '#0ea5e9' : '#16a34a')} !important`
                        }
                    }}
                >
                    <Tab 
                      icon={<PeopleAltIcon sx={{ fontSize: 20 }} />} iconPosition="start"
                      label={`User Apps (${requests.length})`} 
                      sx={{ fontWeight: 900, textTransform: 'none', fontSize: 14 }} 
                    />
                    <Tab 
                      icon={<LocalShippingIcon sx={{ fontSize: 20 }} />} iconPosition="start"
                      label={`Truck Profiles (${truckRequests.length})`} 
                      sx={{ fontWeight: 900, textTransform: 'none', fontSize: 14 }} 
                    />
                    <Tab 
                      icon={<VerifiedUserIcon sx={{ fontSize: 20 }} />} iconPosition="start"
                      label={`Active Staff (${activeUsers.length})`} 
                      sx={{ fontWeight: 900, textTransform: 'none', fontSize: 14 }} 
                    />
                </Tabs>
            </Box>

            <Container maxWidth="md" sx={{ py: 4 }}>

                {/* Snack alert */}
                {snack && (
                    <Alert severity={snack.type} onClose={() => setSnack(null)}
                        sx={{ mb: 3, borderRadius: '14px', fontWeight: 600 }}>
                        {snack.message}
                    </Alert>
                )}

                {/* Loading */}
                {loading && (
                    <Box display="flex" flexDirection="column" alignItems="center" py={10} gap={2}>
                        <CircularProgress sx={{ color: '#7c3aed' }} size={40} />
                        <Typography color="text.secondary" fontWeight={600}>Loading pending requests…</Typography>
                    </Box>
                )}

                {/* Empty state */}
                {!loading && (tabIndex === 0 ? requests.length === 0 : activeUsers.length === 0) && (
                    <Box sx={{ textAlign: 'center', py: 12, px: 4 }}>
                        <Box sx={{
                            width: 80, height: 80, borderRadius: '24px',
                            background: tabIndex === 0 ? 'linear-gradient(135deg, #dcfce7, #bbf7d0)' : 'linear-gradient(135deg, #f1f5f9, #e2e8f0)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            mx: 'auto', mb: 3, boxShadow: tabIndex === 0 ? '0 12px 30px rgba(34,197,94,0.2)' : 'none'
                        }}>
                            {tabIndex === 0 ? <CheckCircleIcon sx={{ fontSize: 40, color: '#16a34a' }} /> : <VerifiedUserIcon sx={{ fontSize: 40, color: '#64748b' }} />}
                        </Box>
                        <Typography variant="h6" fontWeight={900} color="#0f172a" mb={0.5}>
                            {tabIndex === 0 ? 'All clear!' : 'No active accounts'}
                        </Typography>
                        <Typography color="text.secondary" fontWeight={500}>
                            {tabIndex === 0 ? 'No pending registration requests at the moment.' : 'No other users are currently marked as active.'}
                        </Typography>
                        <Button onClick={onBack} variant="outlined" sx={{ mt: 4, borderRadius: '12px', px: 4, fontWeight: 700 }}>
                            Back to Dashboard
                        </Button>
                    </Box>
                )}

                {/* Request / Active cards */}
                {!loading && (tabIndex === 0 ? requests : (tabIndex === 1 ? truckRequests : activeUsers)).map((req, idx) => {
                    const roleInfo = ROLE_MAP[req.role] || ROLE_MAP['OFFICE'];
                    const isActioning = actionId === req._id;

                    return (
                        <Card key={req._id} elevation={0} sx={{
                            mb: 2.5, borderRadius: '24px',
                            border: '1.5px solid #e2e8f0',
                            bgcolor: '#fff',
                            transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                            '&:hover': { 
                                boxShadow: '0 20px 40px rgba(0,0,0,0.08)', 
                                borderColor: tabIndex === 0 ? '#c4b5fd' : (tabIndex === 1 ? '#bae6fd' : '#bbf7d0'),
                                transform: 'scale(1.01)'
                            }
                        }}>
                            {/* Color top accent bar based on tab */}
                            <Box sx={{ 
                                height: 6, 
                                background: tabIndex === 0 ? 'linear-gradient(90deg, #7c3aed, #a78bfa)' : (tabIndex === 1 ? 'linear-gradient(90deg, #0ea5e9, #38bdf8)' : 'linear-gradient(90deg, #16a34a, #4ade80)'), 
                                borderRadius: '20px 20px 0 0' 
                            }} />

                            <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
                                {/* Header row */}
                                <Box display="flex" alignItems="flex-start" justifyContent="space-between" mb={2}>
                                    <Box display="flex" alignItems="center" gap={2}>
                                        <Avatar sx={{
                                            width: 50, height: 50, bgcolor: tabIndex === 1 ? '#faf5ff' : roleInfo.bg, color: tabIndex === 1 ? '#7c3aed' : roleInfo.color,
                                            fontWeight: 900, fontSize: 20, border: `2px solid ${tabIndex === 1 ? '#7c3aed' : roleInfo.color}22`
                                        }}>
                                            {tabIndex === 1 ? (req["Truck No "] || 'T')[0] : (req.name || req.email || 'U')[0].toUpperCase()}
                                        </Avatar>
                                        <Box>
                                            <Typography fontWeight={900} fontSize={16} color="#0f172a">
                                                {tabIndex === 1 ? req["Truck No "] : (req.name || '(No name provided)')}
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                                                {tabIndex === 1 ? req["Owner Name "] : req.email}
                                            </Typography>
                                        </Box>
                                    </Box>
                                    <Box display="flex" alignItems="center" gap={0.5} sx={{ bgcolor: (tabIndex === 0 || tabIndex === 1) ? '#fff8e1' : '#f0fdf4', borderRadius: '10px', px: 1.5, py: 0.7 }}>
                                        {(tabIndex === 0 || tabIndex === 1) ? <HourglassTopIcon sx={{ fontSize: 14, color: '#d97706' }} /> : <VerifiedUserIcon sx={{ fontSize: 14, color: '#16a34a' }} />}
                                        <Typography sx={{ fontSize: 11, fontWeight: 800, color: (tabIndex === 0 || tabIndex === 1) ? '#d97706' : '#16a34a' }}>
                                            {(tabIndex === 0 || tabIndex === 1) ? 'PENDING' : 'ACTIVE'}
                                        </Typography>
                                    </Box>
                                </Box>

                                {/* Chips */}
                                <Box display="flex" gap={1} mb={2} flexWrap="wrap">
                                    {tabIndex === 1 ? (
                                        <>
                                            <Chip icon={<BadgeIcon sx={{ fontSize: 14 }} />} label={req.requestType || 'New Registration'} size="small"
                                                sx={{ bgcolor: '#ede9fe', color: '#7c3aed', fontWeight: 700, fontSize: 12 }} />
                                            <Chip label={req["TYPE OF CUSTOMER "] || 'ATOA'} size="small"
                                                sx={{ bgcolor: '#f1f5f9', color: '#475569', fontWeight: 700, fontSize: 12 }} />
                                        </>
                                    ) : (
                                        <>
                                            <Chip icon={roleInfo.icon} label={roleInfo.label} size="small"
                                                sx={{ bgcolor: roleInfo.bg, color: roleInfo.color, fontWeight: 700, fontSize: 12 }} />
                                            {req.pumpName && (
                                                <Chip label={req.pumpName} size="small"
                                                    sx={{ bgcolor: '#dcfce7', color: '#059669', fontWeight: 700, fontSize: 12 }} />
                                            )}
                                        </>
                                    )}
                                </Box>

                                {/* Date */}
                                <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: 'block', mb: 2.5 }}>
                                    {tabIndex === 1 ? `Driver: ${req["Driver Name "] || 'N/A'}` : `Applied: ${fmtDate(req.createdAt)}`}
                                </Typography>

                                <Divider sx={{ mb: 2.5 }} />

                                <Box display="flex" gap={2}>
                                    {(tabIndex === 0 || tabIndex === 1) ? (
                                        <>
                                            <Button
                                                variant="contained" fullWidth disabled={isActioning}
                                                startIcon={isActioning ? <CircularProgress size={15} sx={{ color: '#fff' }} /> : <CheckCircleIcon />}
                                                onClick={() => tabIndex === 0 ? handleApprove(req._id) : handleProcessTruck(req._id, 'approved')}
                                                sx={{
                                                    py: 1.5, borderRadius: '12px', fontWeight: 800, fontSize: 14,
                                                    bgcolor: '#16a34a', '&:hover': { bgcolor: '#15803d' },
                                                    boxShadow: '0 4px 14px rgba(22,163,74,0.3)', textTransform: 'none',
                                                }}
                                            >
                                                {tabIndex === 1 ? 'Verify & Approve' : 'Approve'}
                                            </Button>
                                            <Button
                                                variant="outlined" fullWidth disabled={isActioning}
                                                startIcon={<CancelIcon />} 
                                                onClick={() => tabIndex === 0 ? handleReject(req._id) : handleProcessTruck(req._id, 'rejected')}
                                                sx={{
                                                    py: 1.5, borderRadius: '12px', fontWeight: 800, fontSize: 14,
                                                    borderColor: '#ef4444', color: '#ef4444', borderWidth: 1.5,
                                                    '&:hover': { bgcolor: '#fef2f2', borderColor: '#dc2626', borderWidth: 1.5 }, textTransform: 'none',
                                                }}
                                            >
                                                Reject
                                            </Button>
                                        </>
                                    ) : (
                                        <Button
                                            variant="outlined" fullWidth disabled={isActioning}
                                            startIcon={isActioning ? <CircularProgress size={15} sx={{ color: '#ef4444' }} /> : <DeleteForeverIcon />}
                                            onClick={() => handleReject(req._id)}
                                            sx={{
                                                py: 1.5, borderRadius: '12px', fontWeight: 800, fontSize: 14,
                                                borderColor: '#ef4444', color: '#ef4444', borderWidth: 1.5,
                                                '&:hover': { bgcolor: '#fef2f2', borderColor: '#dc2626', borderWidth: 1.5 }, textTransform: 'none',
                                            }}
                                        >
                                            Revoke Access & Delete Account
                                        </Button>
                                    )}
                                </Box>
                            </CardContent>
                        </Card>
                    );
                })}
            </Container>
        </Box>
    );
};

export default AccountApprovalsPage;
