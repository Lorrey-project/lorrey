import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Box, Typography, Button, Chip, CircularProgress, Alert,
    Container, IconButton, Tabs, Tab, TextField, InputAdornment,
    MenuItem, Select, FormControl, InputLabel, Table, TableBody,
    TableCell, TableContainer, TableHead, TableRow, Paper, Dialog,
    DialogTitle, DialogContent, DialogActions, Grid
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import RefreshIcon from '@mui/icons-material/Refresh';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import SearchIcon from '@mui/icons-material/Search';
import VisibilityIcon from '@mui/icons-material/Visibility';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

const fmtDate = (d) => {
    if (!d) return '-';
    return new Date(d).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
};

const AccountApprovalsPage = ({ onBack }) => {
    const [tabIndex, setTabIndex] = useState(0);
    const [requests, setRequests] = useState([]);
    const [activeUsers, setActiveUsers] = useState([]);
    const [loading, setLoading]   = useState(true);
    const [actionId, setActionId] = useState(null);
    const [snack, setSnack]       = useState(null);
    const [searchQ, setSearchQ]   = useState('');
    const [filterType, setFilterType] = useState('All');
    
    // Details Modal state
    const [detailsModalOpen, setDetailsModalOpen] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const [pendingRes, activeRes, truckRes] = await Promise.all([
                axios.get(`${API_URL}/auth/admin/pending-registrations`, { headers: { Authorization: `Bearer ${token}` } }),
                axios.get(`${API_URL}/auth/admin/active-users`, { headers: { Authorization: `Bearer ${token}` } }),
                axios.get(`${API_URL}/truck-contacts/approvals`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: { success: false } }))
            ]);
            
            let unified = [];
            
            if (pendingRes.data.success && pendingRes.data.users) {
                unified.push(...pendingRes.data.users.map(u => ({
                    _id: u._id,
                    type: 'User Account Login',
                    date: u.createdAt,
                    requestedBy: u.name || u.email || 'Unknown',
                    vehicleNo: '-',
                    ownerName: '-',
                    status: 'Pending',
                    remarks: u.pumpName ? `Role: ${u.role}, Pump: ${u.pumpName}` : `Role: ${u.role}`,
                    source: 'user',
                    raw: u
                })));
            }

            if (truckRes.data?.success && truckRes.data?.requests) {
                unified.push(...truckRes.data.requests.map(t => ({
                    _id: t._id,
                    type: t.requestType || (t["Truck No "] ? 'Truck Registration' : 'Truck Update'),
                    date: t.requestedAt || t.createdAt,
                    requestedBy: t.actionBy || t["Driver Name "] || 'System',
                    vehicleNo: t["Truck No "] || '-',
                    ownerName: t["Owner Name "] || '-',
                    status: t.status === 'pending' ? 'Pending' : t.status,
                    remarks: t.remarks || '-',
                    source: 'truck',
                    raw: t
                })));
            }

            // Sort newest first
            unified.sort((a, b) => new Date(b.date) - new Date(a.date));
            setRequests(unified);

            if (activeRes.data.success) setActiveUsers(activeRes.data.users);
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

    const handleApprove = async (id, source) => {
        setActionId(id);
        try {
            const token = localStorage.getItem('token');
            if (source === 'user') {
                await axios.put(`${API_URL}/auth/admin/approve/${id}`, {}, { headers: { Authorization: `Bearer ${token}` } });
                setSnack({ type: 'success', message: '✅ User account approved!' });
            } else if (source === 'truck') {
                await axios.put(`${API_URL}/truck-contacts/approvals/${id}`, { 
                    status: 'approved', 
                    isVerified: true,
                    actionBy: localStorage.getItem('username') || 'Head Office' 
                }, { headers: { Authorization: `Bearer ${token}` } });
                setSnack({ type: 'success', message: '✅ Profile Verified & Approved!' });
            }
            setRequests(prev => prev.filter(req => req._id !== id));
            setDetailsModalOpen(false);
        } catch (e) {
            setSnack({ type: 'error', message: '❌ Failed to approve. Please try again.' });
        } finally {
            setActionId(null);
        }
    };

    const handleReject = async (id, source) => {
        if (!window.confirm('Are you sure you want to reject and remove this request?')) return;
        setActionId(id);
        try {
            const token = localStorage.getItem('token');
            if (source === 'user') {
                await axios.delete(`${API_URL}/auth/admin/reject/${id}`, { headers: { Authorization: `Bearer ${token}` } });
                setSnack({ type: 'info', message: 'User request rejected and removed.' });
            } else if (source === 'truck') {
                await axios.put(`${API_URL}/truck-contacts/approvals/${id}`, { 
                    status: 'rejected', 
                    actionBy: localStorage.getItem('username') || 'Head Office' 
                }, { headers: { Authorization: `Bearer ${token}` } });
                setSnack({ type: 'info', message: 'Truck request rejected.' });
            }
            setRequests(prev => prev.filter(req => req._id !== id));
            setDetailsModalOpen(false);
        } catch (e) {
            setSnack({ type: 'error', message: '❌ Failed to reject. Please try again.' });
        } finally {
            setActionId(null);
        }
    };

    const handleRevokeActive = async (id) => {
        if (!window.confirm('Are you sure you want to completely remove this user account? This cannot be undone.')) return;
        setActionId(id);
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`${API_URL}/auth/admin/reject/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setActiveUsers(prev => prev.filter(u => u._id !== id));
            setSnack({ type: 'info', message: 'User account successfully removed.' });
        } catch (e) {
            setSnack({ type: 'error', message: '❌ Failed to revoke access.' });
        } finally {
            setActionId(null);
        }
    };

    // Derived filters
    const typeOptions = useMemo(() => {
        const types = new Set(requests.map(r => r.type));
        return ['All', ...Array.from(types)];
    }, [requests]);

    const filteredRequests = useMemo(() => {
        return requests.filter(r => {
            if (filterType !== 'All' && r.type !== filterType) return false;
            if (searchQ) {
                const q = searchQ.toLowerCase();
                return (
                    (r.vehicleNo && r.vehicleNo.toLowerCase().includes(q)) ||
                    (r.ownerName && r.ownerName.toLowerCase().includes(q)) ||
                    (r.requestedBy && r.requestedBy.toLowerCase().includes(q)) ||
                    (r.type && r.type.toLowerCase().includes(q))
                );
            }
            return true;
        });
    }, [requests, searchQ, filterType]);

    const openDetails = (req) => {
        setSelectedRequest(req);
        setDetailsModalOpen(true);
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
                            Centralized Approval Dashboard
                        </Typography>
                        <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, mt: 0.3 }}>
                            Review & manage all pending requests across the system
                        </Typography>
                    </Box>
                </Box>
                <Box display="flex" alignItems="center" gap={1.5}>
                    <Box sx={{
                        bgcolor: requests.length > 0 ? '#ef4444' : 'rgba(255,255,255,0.15)',
                        borderRadius: '20px', px: 2, py: 0.6,
                        display: 'flex', alignItems: 'center', gap: 1,
                        animation: requests.length > 0 ? 'pulse 2s infinite' : 'none'
                    }}>
                        <HourglassTopIcon sx={{ fontSize: 13, color: '#fff' }} />
                        <Typography sx={{ fontWeight: 900, fontSize: 13, color: '#fff' }}>
                            {loading ? '…' : requests.length} Total Pending
                        </Typography>
                    </Box>
                    <IconButton onClick={fetchData} sx={{ color: 'rgba(255,255,255,0.8)', bgcolor: 'rgba(255,255,255,0.1)', borderRadius: '10px', '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' } }}>
                        <RefreshIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                </Box>
            </Box>

            {/* ── Custom Tab Nav ────────────────────────────────────── */}
            <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: '#fff', px: { xs: 1, md: 4 }, position: 'sticky', top: 0, zIndex: 10 }}>
                <Tabs 
                    value={tabIndex} 
                    onChange={(e, v) => setTabIndex(v)} 
                    variant="fullWidth" 
                    TabIndicatorProps={{ sx: { height: 4, borderRadius: '4px 4px 0 0', bgcolor: tabIndex === 0 ? '#7c3aed' : '#16a34a' } }}
                    sx={{
                        '& .MuiTab-root': { py: 2.5, transition: 'all 0.2s' },
                        '& .Mui-selected': { 
                            bgcolor: 'rgba(0,0,0,0.02)',
                            color: `${tabIndex === 0 ? '#7c3aed' : '#16a34a'} !important`
                        }
                    }}
                >
                    <Tab 
                      icon={<AdminPanelSettingsIcon sx={{ fontSize: 20 }} />} iconPosition="start"
                      label={`Pending Approvals (${requests.length})`} 
                      sx={{ fontWeight: 900, textTransform: 'none', fontSize: 14 }} 
                    />
                    <Tab 
                      icon={<VerifiedUserIcon sx={{ fontSize: 20 }} />} iconPosition="start"
                      label={`Active Staff (${activeUsers.length})`} 
                      sx={{ fontWeight: 900, textTransform: 'none', fontSize: 14 }} 
                    />
                </Tabs>
            </Box>

            <Container maxWidth="xl" sx={{ py: 4 }}>
                {snack && (
                    <Alert severity={snack.type} onClose={() => setSnack(null)} sx={{ mb: 3, borderRadius: '14px', fontWeight: 600 }}>
                        {snack.message}
                    </Alert>
                )}

                {loading && (
                    <Box display="flex" flexDirection="column" alignItems="center" py={10} gap={2}>
                        <CircularProgress sx={{ color: '#7c3aed' }} size={40} />
                        <Typography color="text.secondary" fontWeight={600}>Loading data…</Typography>
                    </Box>
                )}

                {/* ── TAB 0: PENDING APPROVALS ── */}
                {!loading && tabIndex === 0 && (
                    <Paper sx={{ borderRadius: 4, overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                        <Box sx={{ p: 2, display: 'flex', gap: 2, alignItems: 'center', bgcolor: '#fafafa', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
                            <TextField
                                size="small"
                                placeholder="Search vehicle, owner, requester..."
                                value={searchQ}
                                onChange={(e) => setSearchQ(e.target.value)}
                                InputProps={{
                                    startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: '#94a3b8' }} /></InputAdornment>,
                                    sx: { borderRadius: 3, bgcolor: '#fff' }
                                }}
                                sx={{ minWidth: 300, flex: 1 }}
                            />
                            <FormControl size="small" sx={{ minWidth: 200 }}>
                                <Select
                                    value={filterType}
                                    onChange={(e) => setFilterType(e.target.value)}
                                    sx={{ borderRadius: 3, bgcolor: '#fff', fontSize: 14, fontWeight: 600 }}
                                >
                                    {typeOptions.map(t => <MenuItem key={t} value={t} sx={{ fontSize: 14 }}>{t}</MenuItem>)}
                                </Select>
                            </FormControl>
                        </Box>
                        
                        <TableContainer sx={{ maxHeight: '65vh' }}>
                            <Table stickyHeader>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9' }}>Approval Type</TableCell>
                                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9' }}>Date &amp; Time</TableCell>
                                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9' }}>Requested By</TableCell>
                                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9' }}>Vehicle Number</TableCell>
                                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9' }}>Owner Name</TableCell>
                                        <TableCell sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9' }}>Remarks</TableCell>
                                        <TableCell align="center" sx={{ fontWeight: 800, color: '#475569', bgcolor: '#f1f5f9' }}>Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {filteredRequests.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} align="center" sx={{ py: 8 }}>
                                                <HourglassTopIcon sx={{ fontSize: 40, color: '#cbd5e1', mb: 1 }} />
                                                <Typography variant="h6" color="text.secondary" fontWeight={700}>No pending approvals</Typography>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredRequests.map((req) => (
                                            <TableRow key={req._id} hover sx={{ '&:hover': { bgcolor: '#f8fafc' } }}>
                                                <TableCell>
                                                    <Chip label={req.type} size="small" sx={{ fontWeight: 700, bgcolor: req.source === 'user' ? '#ede9fe' : '#e0f2fe', color: req.source === 'user' ? '#7c3aed' : '#0369a1' }} />
                                                </TableCell>
                                                <TableCell sx={{ fontSize: 13, fontWeight: 500, color: '#64748b' }}>{fmtDate(req.date)}</TableCell>
                                                <TableCell sx={{ fontWeight: 600 }}>{req.requestedBy}</TableCell>
                                                <TableCell sx={{ fontWeight: 900, color: '#0f172a' }}>{req.vehicleNo}</TableCell>
                                                <TableCell sx={{ fontSize: 13 }}>{req.ownerName}</TableCell>
                                                <TableCell sx={{ fontSize: 12, color: '#64748b', maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {req.remarks}
                                                </TableCell>
                                                <TableCell align="center">
                                                    <Box display="flex" gap={1} justifyContent="center">
                                                        <Button size="small" variant="outlined" startIcon={<VisibilityIcon />} onClick={() => openDetails(req)} sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700 }}>
                                                            Details
                                                        </Button>
                                                        <Button size="small" variant="contained" color="success" onClick={() => handleApprove(req._id, req.source)} disabled={actionId === req._id} sx={{ borderRadius: 2, minWidth: 32, px: 1 }}>
                                                            <CheckCircleIcon fontSize="small" />
                                                        </Button>
                                                        <Button size="small" variant="contained" color="error" onClick={() => handleReject(req._id, req.source)} disabled={actionId === req._id} sx={{ borderRadius: 2, minWidth: 32, px: 1 }}>
                                                            <CancelIcon fontSize="small" />
                                                        </Button>
                                                    </Box>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                )}

                {/* ── TAB 1: ACTIVE STAFF ── */}
                {!loading && tabIndex === 1 && (
                    <Grid container spacing={3}>
                        {activeUsers.length === 0 ? (
                            <Grid item xs={12}>
                                <Box sx={{ textAlign: 'center', py: 8 }}>
                                    <VerifiedUserIcon sx={{ fontSize: 40, color: '#cbd5e1', mb: 1 }} />
                                    <Typography variant="h6" color="text.secondary" fontWeight={700}>No active staff members found</Typography>
                                </Box>
                            </Grid>
                        ) : (
                            activeUsers.map(user => (
                                <Grid item xs={12} sm={6} md={4} key={user._id}>
                                    <Paper sx={{ p: 3, borderRadius: 4, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', height: '100%' }}>
                                        <Box display="flex" alignItems="center" gap={2} mb={2}>
                                            <Box sx={{ width: 48, height: 48, borderRadius: '50%', bgcolor: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 20 }}>
                                                {(user.name || user.email || 'U')[0].toUpperCase()}
                                            </Box>
                                            <Box>
                                                <Typography fontWeight={800}>{user.name || '(No name)'}</Typography>
                                                <Typography variant="caption" color="text.secondary">{user.email}</Typography>
                                            </Box>
                                        </Box>
                                        <Box display="flex" gap={1} mb={3} flexWrap="wrap">
                                            <Chip label={user.role} size="small" sx={{ bgcolor: '#f1f5f9', fontWeight: 700, fontSize: 11 }} />
                                            {user.pumpName && <Chip label={user.pumpName} size="small" color="primary" variant="outlined" sx={{ fontWeight: 700, fontSize: 11 }} />}
                                        </Box>
                                        <Box mt="auto">
                                            <Button fullWidth variant="outlined" color="error" startIcon={<DeleteForeverIcon />} onClick={() => handleRevokeActive(user._id)} disabled={actionId === user._id} sx={{ borderRadius: 2, fontWeight: 700 }}>
                                                Revoke Access
                                            </Button>
                                        </Box>
                                    </Paper>
                                </Grid>
                            ))
                        )}
                    </Grid>
                )}
            </Container>

            {/* ── Details Modal ── */}
            <Dialog open={detailsModalOpen} onClose={() => setDetailsModalOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
                <DialogTitle sx={{ fontWeight: 900, borderBottom: '1px solid #e2e8f0', bgcolor: '#f8fafc' }}>
                    Approval Request Details
                </DialogTitle>
                <DialogContent sx={{ py: 3 }}>
                    {selectedRequest && (
                        <Grid container spacing={2}>
                            <Grid item xs={12} sm={6}>
                                <Typography variant="caption" color="text.secondary" fontWeight={700}>Approval Type</Typography>
                                <Typography fontWeight={600} mb={2}>{selectedRequest.type}</Typography>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <Typography variant="caption" color="text.secondary" fontWeight={700}>Requested By</Typography>
                                <Typography fontWeight={600} mb={2}>{selectedRequest.requestedBy}</Typography>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <Typography variant="caption" color="text.secondary" fontWeight={700}>Date</Typography>
                                <Typography fontWeight={600} mb={2}>{fmtDate(selectedRequest.date)}</Typography>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <Typography variant="caption" color="text.secondary" fontWeight={700}>Status</Typography>
                                <Typography fontWeight={600} mb={2} color="warning.main">{selectedRequest.status}</Typography>
                            </Grid>
                            
                            {selectedRequest.source === 'truck' && (
                                <>
                                    <Grid item xs={12} sm={6}>
                                        <Typography variant="caption" color="text.secondary" fontWeight={700}>Vehicle Number</Typography>
                                        <Typography fontWeight={900} color="primary" mb={2}>{selectedRequest.vehicleNo}</Typography>
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                        <Typography variant="caption" color="text.secondary" fontWeight={700}>Owner Name</Typography>
                                        <Typography fontWeight={600} mb={2}>{selectedRequest.ownerName}</Typography>
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                        <Typography variant="caption" color="text.secondary" fontWeight={700}>Driver Name</Typography>
                                        <Typography fontWeight={600} mb={2}>{selectedRequest.raw["Driver Name "] || '-'}</Typography>
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                        <Typography variant="caption" color="text.secondary" fontWeight={700}>License No</Typography>
                                        <Typography fontWeight={600} mb={2}>{selectedRequest.raw.license_no || '-'}</Typography>
                                    </Grid>
                                </>
                            )}
                            
                            <Grid item xs={12}>
                                <Typography variant="caption" color="text.secondary" fontWeight={700}>Remarks / Extra Info</Typography>
                                <Box sx={{ p: 2, bgcolor: '#f1f5f9', borderRadius: 2, mt: 0.5, maxHeight: 150, overflowY: 'auto' }}>
                                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                        {selectedRequest.remarks !== '-' ? selectedRequest.remarks : JSON.stringify(selectedRequest.raw, null, 2)}
                                    </Typography>
                                </Box>
                            </Grid>
                        </Grid>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 3, borderTop: '1px solid #e2e8f0', bgcolor: '#f8fafc' }}>
                    <Button onClick={() => setDetailsModalOpen(false)} variant="outlined" sx={{ borderRadius: 2, fontWeight: 700 }}>Close</Button>
                    <Box sx={{ flex: 1 }} />
                    <Button variant="outlined" color="error" onClick={() => handleReject(selectedRequest?._id, selectedRequest?.source)} disabled={!selectedRequest || actionId === selectedRequest._id} sx={{ borderRadius: 2, fontWeight: 700 }}>
                        Reject
                    </Button>
                    <Button variant="contained" color="success" onClick={() => handleApprove(selectedRequest?._id, selectedRequest?.source)} disabled={!selectedRequest || actionId === selectedRequest._id} sx={{ borderRadius: 2, fontWeight: 700 }}>
                        Approve
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default AccountApprovalsPage;
