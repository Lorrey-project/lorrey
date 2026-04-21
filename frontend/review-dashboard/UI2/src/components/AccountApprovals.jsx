import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Button, Chip, CircularProgress, Alert,
    Card, CardContent, Divider, Badge, Avatar, Tooltip
} from '@mui/material';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import BusinessIcon from '@mui/icons-material/Business';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import RefreshIcon from '@mui/icons-material/Refresh';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const ROLE_MAP = {
    'HEAD_OFFICE': { label: 'Head Office', color: '#7c3aed', bg: '#ede9fe', icon: <BusinessIcon sx={{ fontSize: 14 }} /> },
    'OFFICE':      { label: 'Site Admin',   color: '#0052cc', bg: '#e0f2fe', icon: <LocationOnIcon sx={{ fontSize: 14 }} /> },
    'PETROL PUMP': { label: 'Pump Admin',   color: '#059669', bg: '#dcfce7', icon: <LocalGasStationIcon sx={{ fontSize: 14 }} /> },
};

const fmtDate = (d) => new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
});

const AccountApprovals = ({ onCountChange }) => {
    const [requests, setRequests]     = useState([]);
    const [loading, setLoading]       = useState(true);
    const [actionId, setActionId]     = useState(null);
    const [snack, setSnack]           = useState(null);

    // Keep parent badge count in sync
    useEffect(() => {
        if (onCountChange) onCountChange(requests.length);
    }, [requests.length, onCountChange]);

    const fetchPending = useCallback(async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`${API_URL}/auth/admin/pending-registrations`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data.success) setRequests(res.data.users);
        } catch (e) {
            console.error('Failed to fetch pending registrations', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPending();
        const interval = setInterval(fetchPending, 60000); // poll every 60s
        return () => clearInterval(interval);
    }, [fetchPending]);

    const handleApprove = async (id) => {
        setActionId(id);
        try {
            const token = localStorage.getItem('token');
            await axios.put(`${API_URL}/auth/admin/approve/${id}`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setRequests(prev => {
                const next = prev.filter(u => u._id !== id);
                if (onCountChange) onCountChange(next.length);
                return next;
            });
            setSnack({ type: 'success', message: '✅ Account approved successfully!' });
        } catch (e) {
            setSnack({ type: 'error', message: '❌ Failed to approve account.' });
        } finally {
            setActionId(null);
        }
    };

    const handleReject = async (id) => {
        if (!window.confirm('Are you sure you want to reject and delete this registration request?')) return;
        setActionId(id);
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`${API_URL}/auth/admin/reject/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setRequests(prev => {
                const next = prev.filter(u => u._id !== id);
                if (onCountChange) onCountChange(next.length);
                return next;
            });
            setSnack({ type: 'info', message: 'Registration request rejected.' });
        } catch (e) {
            setSnack({ type: 'error', message: '❌ Failed to reject account.' });
        } finally {
            setActionId(null);
        }
    };

    return (
        <Box>
            {/* Header */}
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                <Box display="flex" alignItems="center" gap={1.5}>
                    <Badge badgeContent={requests.length} color="error" max={99}>
                        <Box sx={{
                            width: 38, height: 38, borderRadius: '10px',
                            background: 'linear-gradient(135deg, #7c3aed, #9333ea)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <PersonAddAlt1Icon sx={{ color: '#fff', fontSize: 20 }} />
                        </Box>
                    </Badge>
                    <Box>
                        <Typography variant="h6" fontWeight={900} sx={{ color: '#0f172a', lineHeight: 1 }}>
                            Account Approvals
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            {requests.length} pending request{requests.length !== 1 ? 's' : ''}
                        </Typography>
                    </Box>
                </Box>
                <Tooltip title="Refresh">
                    <Button size="small" onClick={() => { setLoading(true); fetchPending(); }}
                        startIcon={<RefreshIcon sx={{ fontSize: 14 }} />}
                        sx={{ borderRadius: '10px', textTransform: 'none', color: '#64748b', fontSize: 12, fontWeight: 700 }}>
                        Refresh
                    </Button>
                </Tooltip>
            </Box>

            {/* Snack */}
            {snack && (
                <Alert severity={snack.type} onClose={() => setSnack(null)}
                    sx={{ mb: 2, borderRadius: '12px', fontSize: 13 }}>
                    {snack.message}
                </Alert>
            )}

            {/* Loading */}
            {loading && (
                <Box display="flex" justifyContent="center" py={6}>
                    <CircularProgress sx={{ color: '#7c3aed' }} />
                </Box>
            )}

            {/* Empty state */}
            {!loading && requests.length === 0 && (
                <Box sx={{
                    textAlign: 'center', py: 6, px: 3,
                    border: '1.5px dashed #e2e8f0', borderRadius: '16px', bgcolor: '#f8fafc'
                }}>
                    <CheckCircleIcon sx={{ fontSize: 40, color: '#86efac', mb: 1 }} />
                    <Typography fontWeight={700} color="text.secondary">All caught up!</Typography>
                    <Typography variant="caption" color="text.secondary">No pending registration requests.</Typography>
                </Box>
            )}

            {/* Request cards */}
            {!loading && requests.map((req) => {
                const roleInfo = ROLE_MAP[req.role] || ROLE_MAP['OFFICE'];
                const isActioning = actionId === req._id;

                return (
                    <Card key={req._id} elevation={0} sx={{
                        mb: 2, borderRadius: '16px',
                        border: '1.5px solid #e2e8f0',
                        bgcolor: '#fff',
                        transition: 'box-shadow 0.2s',
                        '&:hover': { boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }
                    }}>
                        <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                            <Box display="flex" alignItems="flex-start" justifyContent="space-between" mb={1.5}>
                                <Box display="flex" alignItems="center" gap={1.5}>
                                    <Avatar sx={{
                                        width: 40, height: 40, bgcolor: roleInfo.bg, color: roleInfo.color,
                                        fontWeight: 900, fontSize: 16
                                    }}>
                                        {(req.name || req.email || 'U')[0].toUpperCase()}
                                    </Avatar>
                                    <Box>
                                        <Typography fontWeight={800} fontSize={14} color="#0f172a">
                                            {req.name || '(No name)'}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                                            {req.email}
                                        </Typography>
                                    </Box>
                                </Box>
                                <HourglassTopIcon sx={{ color: '#f59e0b', fontSize: 18, mt: 0.3 }} />
                            </Box>

                            <Box display="flex" gap={1} mb={2} flexWrap="wrap">
                                <Chip
                                    icon={roleInfo.icon}
                                    label={roleInfo.label}
                                    size="small"
                                    sx={{ bgcolor: roleInfo.bg, color: roleInfo.color, fontWeight: 700, fontSize: 11 }}
                                />
                                {req.pumpName && (
                                    <Chip label={req.pumpName} size="small"
                                        sx={{ bgcolor: '#dcfce7', color: '#059669', fontWeight: 700, fontSize: 11 }} />
                                )}
                                <Chip label={`Applied ${fmtDate(req.createdAt)}`} size="small"
                                    sx={{ bgcolor: '#f1f5f9', color: '#64748b', fontWeight: 600, fontSize: 10 }} />
                            </Box>

                            <Divider sx={{ mb: 2 }} />

                            <Box display="flex" gap={1.5}>
                                <Button
                                    variant="contained" fullWidth size="small"
                                    disabled={isActioning}
                                    startIcon={isActioning ? <CircularProgress size={13} sx={{ color: '#fff' }} /> : <CheckCircleIcon sx={{ fontSize: 16 }} />}
                                    onClick={() => handleApprove(req._id)}
                                    sx={{
                                        borderRadius: '10px', fontWeight: 800, fontSize: 12, py: 1,
                                        bgcolor: '#16a34a', '&:hover': { bgcolor: '#15803d' },
                                        textTransform: 'none',
                                    }}
                                >
                                    Approve
                                </Button>
                                <Button
                                    variant="outlined" fullWidth size="small"
                                    disabled={isActioning}
                                    startIcon={<CancelIcon sx={{ fontSize: 16 }} />}
                                    onClick={() => handleReject(req._id)}
                                    sx={{
                                        borderRadius: '10px', fontWeight: 800, fontSize: 12, py: 1,
                                        borderColor: '#ef4444', color: '#ef4444',
                                        '&:hover': { bgcolor: '#fef2f2', borderColor: '#dc2626' },
                                        textTransform: 'none',
                                    }}
                                >
                                    Reject
                                </Button>
                            </Box>
                        </CardContent>
                    </Card>
                );
            })}
        </Box>
    );
};

export default AccountApprovals;
