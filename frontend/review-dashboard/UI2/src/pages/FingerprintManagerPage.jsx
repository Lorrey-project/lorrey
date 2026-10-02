import React, { useState, useEffect, useCallback } from 'react';
import {
    Container, Box, Typography, Button, Paper, Tabs, Tab,
    Grid, Card, CardContent, Chip, IconButton, TextField,
    Dialog, DialogTitle, DialogContent, DialogActions,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    TablePagination, CircularProgress, Alert, Tooltip, MenuItem,
    Select, FormControl, InputLabel, Divider, Badge
} from '@mui/material';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import BusinessIcon from '@mui/icons-material/Business';
import LocationCityIcon from '@mui/icons-material/LocationCity';
import CodeIcon from '@mui/icons-material/Code';
import UsbIcon from '@mui/icons-material/Usb';
import HistoryIcon from '@mui/icons-material/History';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SecurityIcon from '@mui/icons-material/Security';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import { useAuth } from '../context/AuthContext';
import FingerprintClientService from '../services/fingerprintService';

const FINGER_POSITIONS = [
    { value: 'RIGHT_THUMB', label: 'Right Thumb' },
    { value: 'LEFT_THUMB', label: 'Left Thumb' },
    { value: 'RIGHT_INDEX', label: 'Right Index' },
    { value: 'LEFT_INDEX', label: 'Left Index' },
    { value: 'RIGHT_MIDDLE', label: 'Right Middle' },
    { value: 'LEFT_MIDDLE', label: 'Left Middle' },
];

const FingerprintManagerPage = ({ onBack }) => {
    const { user } = useAuth();
    const [currentTab, setCurrentTab] = useState(0); // 0: Drivers, 1: Office, 2: Site, 3: Developers, 4: Devices, 5: Audit
    const [loading, setLoading] = useState(false);
    const [stats, setStats] = useState({
        totalDrivers: 0,
        totalOfficeMembers: 0,
        totalSiteMembers: 0,
        totalDevelopers: 0,
        activeDevices: 0,
        todayAuditEvents: 0
    });

    const [enrolledRecords, setEnrolledRecords] = useState([]);
    const [totalRecords, setTotalRecords] = useState(0);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [searchQuery, setSearchQuery] = useState('');
    const [driverTypeFilter, setDriverTypeFilter] = useState('ALL');

    // Devices & Audit
    const [devices, setDevices] = useState([]);
    const [auditLogs, setAuditLogs] = useState([]);
    const [auditTotal, setAuditTotal] = useState(0);
    const [auditPage, setAuditPage] = useState(0);
    const [auditActionFilter, setAuditActionFilter] = useState('ALL');

    // Notification snack/banner
    const [alertMsg, setAlertMsg] = useState(null);

    // Enrollment Dialog State
    const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);
    const [enrollForm, setEnrollForm] = useState({
        subjectType: 'DRIVER', // 'DRIVER' | 'OFFICE_MEMBER' | 'SITE_MEMBER' | 'DEVELOPER'
        subjectId: '',
        subjectName: '',
        driverType: 'PERMANENT', // 'PERMANENT' | 'TEMPORARY'
        mobile: '',
        licenseNo: '',
        assignedVehicle: '',
        fingerPosition: 'RIGHT_THUMB',
        deviceId: 'DEV-USB-MANTRA-01'
    });

    const [candidates, setCandidates] = useState([]);
    const [scanningState, setScanningState] = useState('IDLE'); // 'IDLE' | 'SCANNING' | 'SCANNED' | 'FAILED'
    const [capturedScan, setCapturedScan] = useState(null);
    const [enrollSubmitting, setEnrollSubmitting] = useState(false);

    // Initial Load
    const fetchStats = useCallback(async () => {
        try {
            const data = await FingerprintClientService.getSummaryStats();
            if (data) setStats(data);
        } catch (e) {
            console.error('Failed to load stats:', e);
        }
    }, []);

    const fetchRecords = useCallback(async () => {
        setLoading(true);
        try {
            let type = 'DRIVER';
            if (currentTab === 1) type = 'OFFICE_MEMBER';
            else if (currentTab === 2) type = 'SITE_MEMBER';
            else if (currentTab === 3) type = 'DEVELOPER';

            const res = await FingerprintClientService.getEnrolledIdentities({
                subjectType: type,
                driverType: currentTab === 0 ? driverTypeFilter : 'ALL',
                search: searchQuery,
                page,
                limit: rowsPerPage
            });

            if (res?.success) {
                setEnrolledRecords(res.records);
                setTotalRecords(res.total);
            }
        } catch (e) {
            console.error('Failed to load enrolled records:', e);
        } finally {
            setLoading(false);
        }
    }, [currentTab, driverTypeFilter, searchQuery, page, rowsPerPage]);

    const fetchDevices = useCallback(async () => {
        try {
            const list = await FingerprintClientService.getConnectedDevices();
            setDevices(list);
        } catch (e) {
            console.error('Failed to load devices:', e);
        }
    }, []);

    const fetchAudit = useCallback(async () => {
        setLoading(true);
        try {
            const res = await FingerprintClientService.getAuditLogs({
                action: auditActionFilter,
                search: searchQuery,
                page: auditPage,
                limit: 15
            });
            if (res?.success) {
                setAuditLogs(res.logs);
                setAuditTotal(res.total);
            }
        } catch (e) {
            console.error('Failed to load audit logs:', e);
        } finally {
            setLoading(false);
        }
    }, [auditActionFilter, searchQuery, auditPage]);

    useEffect(() => {
        fetchStats();
    }, [fetchStats]);

    useEffect(() => {
        if (currentTab < 4) {
            fetchRecords();
        } else if (currentTab === 4) {
            fetchDevices();
        } else if (currentTab === 5) {
            fetchAudit();
        }
    }, [currentTab, fetchRecords, fetchDevices, fetchAudit]);

    // Handle Candidates for Enrollment Auto-fill
    const loadCandidates = async (type) => {
        try {
            const list = await FingerprintClientService.getEnrollmentCandidates(type);
            setCandidates(list);
        } catch (e) {
            console.error('Failed to load candidates:', e);
        }
    };

    const handleOpenEnrollDialog = (presetType = 'DRIVER') => {
        setEnrollForm({
            subjectType: presetType,
            subjectId: '',
            subjectName: '',
            driverType: 'PERMANENT',
            mobile: '',
            licenseNo: '',
            assignedVehicle: '',
            fingerPosition: 'RIGHT_THUMB',
            deviceId: devices[0]?.deviceId || 'DEV-USB-MANTRA-01'
        });
        setScanningState('IDLE');
        setCapturedScan(null);
        setAlertMsg(null);
        loadCandidates(presetType);
        setEnrollDialogOpen(true);
    };

    const handleCandidateSelect = (e) => {
        const selectedId = e.target.value;
        const candidate = candidates.find(c => String(c.id) === String(selectedId));
        if (candidate) {
            setEnrollForm(prev => ({
                ...prev,
                subjectId: String(candidate.id).startsWith('DEV-') ? candidate.id : '',
                subjectName: candidate.name || '',
                mobile: candidate.mobile || '',
                licenseNo: candidate.licenseNo || '',
                assignedVehicle: candidate.assignedVehicle || ''
            }));
        }
    };

    // Trigger Real Biometric Scan (Prompts OS Touch ID / Windows Hello / USB Scanner)
    const handleTriggerScan = async () => {
        setScanningState('SCANNING');
        setAlertMsg(null);
        try {
            const scanResult = await FingerprintClientService.captureFingerprint({
                subjectName: enrollForm.subjectName || 'User',
                fingerPosition: enrollForm.fingerPosition,
                deviceId: enrollForm.deviceId
            });

            if (scanResult.success && scanResult.rawTemplate) {
                setCapturedScan(scanResult);
                setScanningState('SCANNED');
            } else {
                setScanningState('FAILED');
                setAlertMsg({ type: 'error', text: 'Biometric scan was not completed. Please try again.' });
            }
        } catch (err) {
            console.error('Biometric scan error:', err);
            setScanningState('FAILED');
            if (err.name === 'NotAllowedError') {
                setAlertMsg({ type: 'warning', text: 'Biometric prompt was cancelled. Please place your finger on the scanner sensor.' });
            } else {
                setAlertMsg({ type: 'error', text: err.response?.data?.error || err.message || 'Fingerprint scanner could not capture fingerprint.' });
            }
        }
    };

    // Submit Enrollment
    const handleSaveEnrollment = async () => {
        if (!enrollForm.subjectName.trim()) {
            setAlertMsg({ type: 'error', text: 'Please enter or select a Name for enrollment.' });
            return;
        }

        if (!capturedScan || !capturedScan.rawTemplate) {
            setAlertMsg({ type: 'error', text: 'Please complete the fingerprint scan first.' });
            return;
        }

        setEnrollSubmitting(true);
        try {
            const res = await FingerprintClientService.enrollSubject({
                subjectId: enrollForm.subjectId || undefined,
                subjectType: enrollForm.subjectType,
                subjectName: enrollForm.subjectName,
                driverType: enrollForm.driverType,
                mobile: enrollForm.mobile,
                licenseNo: enrollForm.licenseNo,
                assignedVehicle: enrollForm.assignedVehicle,
                fingerPosition: enrollForm.fingerPosition,
                rawTemplate: capturedScan.rawTemplate,
                qualityScore: capturedScan.qualityScore,
                deviceId: enrollForm.deviceId
            });

            if (res.success) {
                setAlertMsg({ type: 'success', text: `Fingerprint enrolled successfully for ${res.data.subjectName} (${res.data.subjectId})!` });
                setEnrollDialogOpen(false);
                fetchStats();
                fetchRecords();
            }
        } catch (err) {
            console.error('Enrollment submission error:', err);
            const msg = err.response?.data?.error || err.message || 'Enrollment failed.';
            setAlertMsg({ type: 'error', text: msg });
        } finally {
            setEnrollSubmitting(false);
        }
    };

    // Toggle Status
    const handleToggleStatus = async (record) => {
        const nextStatus = record.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
        try {
            await FingerprintClientService.updateEnrollmentStatus(record._id, nextStatus);
            setEnrolledRecords(prev => prev.map(r => r._id === record._id ? { ...r, status: nextStatus } : r));
            fetchStats();
        } catch (e) {
            alert('Failed to update status');
        }
    };

    // Delete
    const handleDeleteRecord = async (id) => {
        if (!window.confirm('Are you sure you want to remove this enrolled fingerprint identity?')) return;
        try {
            await FingerprintClientService.deleteEnrollment(id);
            setEnrolledRecords(prev => prev.filter(r => r._id !== id));
            fetchStats();
        } catch (e) {
            alert('Failed to delete enrollment');
        }
    };

    return (
        <Container maxWidth="xl" sx={{ mt: { xs: 2, md: 4 }, mb: 6, position: 'relative', zIndex: 10 }}>

            {/* ── TOP NAV & HEADER ────────────────────────────────────────── */}
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} flexWrap="wrap" gap={2}>
                <Box display="flex" alignItems="center" gap={2}>
                    {onBack && (
                        <IconButton
                            onClick={onBack}
                            sx={{
                                color: '#fff',
                                bgcolor: 'rgba(255, 255, 255, 0.08)',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                borderRadius: '12px',
                                p: 1.2,
                                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.15)' }
                            }}
                        >
                            <ArrowBackIcon />
                        </IconButton>
                    )}
                    <Box>
                        <Box display="flex" alignItems="center" gap={1.5}>
                            <FingerprintIcon sx={{ fontSize: 32, color: '#38bdf8' }} />
                            <Typography variant="h4" fontWeight="900" sx={{ letterSpacing: '-0.5px', color: '#f8fafc' }}>
                                FINGERPRINT <span style={{ color: '#38bdf8' }}>AUTHORIZATION SYSTEM</span>
                            </Typography>
                        </Box>
                        <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600, display: 'block', mt: 0.3 }}>
                            Central Biometric Management for Office Members, Site Members, Drivers & Developers
                        </Typography>
                    </Box>
                </Box>

                <Box display="flex" gap={1.5}>
                    <Button
                        variant="contained"
                        startIcon={<PersonAddIcon />}
                        onClick={() => handleOpenEnrollDialog(currentTab === 1 ? 'OFFICE_MEMBER' : currentTab === 2 ? 'SITE_MEMBER' : currentTab === 3 ? 'DEVELOPER' : 'DRIVER')}
                        sx={{
                            borderRadius: '10px',
                            px: 3,
                            py: 1.2,
                            fontWeight: 800,
                            bgcolor: '#0284c7',
                            color: '#fff',
                            boxShadow: '0 4px 15px rgba(2, 132, 199, 0.4)',
                            '&:hover': { bgcolor: '#0369a1' }
                        }}
                    >
                        Enroll Fingerprint
                    </Button>
                </Box>
            </Box>

            {/* Alert Banner */}
            {alertMsg && (
                <Alert
                    severity={alertMsg.type}
                    onClose={() => setAlertMsg(null)}
                    sx={{ mb: 3, borderRadius: '12px', fontWeight: 700 }}
                >
                    {alertMsg.text}
                </Alert>
            )}

            {/* ── STATS OVERVIEW CARDS ────────────────────────────────────── */}
            <Grid container spacing={2.5} sx={{ mb: 4 }}>
                <Grid item xs={12} sm={6} md={2}>
                    <Card sx={{
                        borderRadius: '16px', bgcolor: '#1e293b', border: '1px solid rgba(56, 189, 248, 0.25)',
                        background: 'linear-gradient(145deg, #1e293b 0%, #0f172a 100%)', color: '#fff', p: 1
                    }}>
                        <CardContent sx={{ p: 1.5 }}>
                            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                                <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase' }}>Drivers</Typography>
                                <LocalShippingIcon sx={{ color: '#38bdf8', fontSize: 20 }} />
                            </Box>
                            <Typography variant="h4" fontWeight="900" sx={{ color: '#38bdf8' }}>{stats.totalDrivers}</Typography>
                            <Typography variant="caption" sx={{ color: '#64748b' }}>Active Enrolled</Typography>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} sm={6} md={2}>
                    <Card sx={{
                        borderRadius: '16px', bgcolor: '#1e293b', border: '1px solid rgba(168, 85, 247, 0.25)',
                        background: 'linear-gradient(145deg, #1e293b 0%, #0f172a 100%)', color: '#fff', p: 1
                    }}>
                        <CardContent sx={{ p: 1.5 }}>
                            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                                <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase' }}>Office</Typography>
                                <BusinessIcon sx={{ color: '#a855f7', fontSize: 20 }} />
                            </Box>
                            <Typography variant="h4" fontWeight="900" sx={{ color: '#c084fc' }}>{stats.totalOfficeMembers}</Typography>
                            <Typography variant="caption" sx={{ color: '#64748b' }}>Office Members</Typography>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} sm={6} md={2}>
                    <Card sx={{
                        borderRadius: '16px', bgcolor: '#1e293b', border: '1px solid rgba(34, 197, 94, 0.25)',
                        background: 'linear-gradient(145deg, #1e293b 0%, #0f172a 100%)', color: '#fff', p: 1
                    }}>
                        <CardContent sx={{ p: 1.5 }}>
                            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                                <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase' }}>Site</Typography>
                                <LocationCityIcon sx={{ color: '#22c55e', fontSize: 20 }} />
                            </Box>
                            <Typography variant="h4" fontWeight="900" sx={{ color: '#4ade80' }}>{stats.totalSiteMembers}</Typography>
                            <Typography variant="caption" sx={{ color: '#64748b' }}>Site Members</Typography>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} sm={6} md={2}>
                    <Card sx={{
                        borderRadius: '16px', bgcolor: '#1e293b', border: '1px solid rgba(245, 158, 11, 0.25)',
                        background: 'linear-gradient(145deg, #1e293b 0%, #0f172a 100%)', color: '#fff', p: 1
                    }}>
                        <CardContent sx={{ p: 1.5 }}>
                            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                                <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase' }}>Developers</Typography>
                                <CodeIcon sx={{ color: '#f59e0b', fontSize: 20 }} />
                            </Box>
                            <Typography variant="h4" fontWeight="900" sx={{ color: '#fbbf24' }}>{stats.totalDevelopers}</Typography>
                            <Typography variant="caption" sx={{ color: '#64748b' }}>Dev Identities</Typography>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} sm={6} md={2}>
                    <Card sx={{
                        borderRadius: '16px', bgcolor: '#1e293b', border: '1px solid rgba(6, 182, 212, 0.25)',
                        background: 'linear-gradient(145deg, #1e293b 0%, #0f172a 100%)', color: '#fff', p: 1
                    }}>
                        <CardContent sx={{ p: 1.5 }}>
                            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                                <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase' }}>Scanners</Typography>
                                <UsbIcon sx={{ color: '#06b6d4', fontSize: 20 }} />
                            </Box>
                            <Typography variant="h4" fontWeight="900" sx={{ color: '#22d3ee' }}>{stats.activeDevices}</Typography>
                            <Typography variant="caption" sx={{ color: '#64748b' }}>Connected Hardware</Typography>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} sm={6} md={2}>
                    <Card sx={{
                        borderRadius: '16px', bgcolor: '#1e293b', border: '1px solid rgba(244, 63, 94, 0.25)',
                        background: 'linear-gradient(145deg, #1e293b 0%, #0f172a 100%)', color: '#fff', p: 1
                    }}>
                        <CardContent sx={{ p: 1.5 }}>
                            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                                <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase' }}>Audit Logs</Typography>
                                <HistoryIcon sx={{ color: '#f43f5e', fontSize: 20 }} />
                            </Box>
                            <Typography variant="h4" fontWeight="900" sx={{ color: '#fb7185' }}>{stats.todayAuditEvents}</Typography>
                            <Typography variant="caption" sx={{ color: '#64748b' }}>Today's Events</Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* ── TABS NAVIGATION ─────────────────────────────────────────── */}
            <Paper elevation={0} sx={{
                borderRadius: '16px', bgcolor: '#1e293b', border: '1px solid rgba(255, 255, 255, 0.08)',
                p: 1, mb: 3
            }}>
                <Tabs
                    value={currentTab}
                    onChange={(e, val) => { setCurrentTab(val); setPage(0); }}
                    variant="scrollable"
                    scrollButtons="auto"
                    sx={{
                        '& .MuiTabs-indicator': { bgcolor: '#38bdf8', height: 3, borderRadius: '3px' },
                        '& .MuiTab-root': {
                            color: '#94a3b8', fontWeight: 700, fontSize: '0.9rem', textTransform: 'none',
                            minHeight: 48, px: 2.5,
                            '&.Mui-selected': { color: '#38bdf8' }
                        }
                    }}
                >
                    <Tab icon={<LocalShippingIcon sx={{ fontSize: 18, mr: 1 }} />} iconPosition="start" label="Drivers" />
                    <Tab icon={<BusinessIcon sx={{ fontSize: 18, mr: 1 }} />} iconPosition="start" label="Office Members" />
                    <Tab icon={<LocationCityIcon sx={{ fontSize: 18, mr: 1 }} />} iconPosition="start" label="Site Members" />
                    <Tab icon={<CodeIcon sx={{ fontSize: 18, mr: 1 }} />} iconPosition="start" label="Developers" />
                    <Tab icon={<UsbIcon sx={{ fontSize: 18, mr: 1 }} />} iconPosition="start" label="Connected Devices" />
                    <Tab icon={<HistoryIcon sx={{ fontSize: 18, mr: 1 }} />} iconPosition="start" label="Audit Trail" />
                </Tabs>
            </Paper>

            {/* ── FILTER & SEARCH BAR ─────────────────────────────────────── */}
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2.5} flexWrap="wrap" gap={2}>
                <Box display="flex" gap={1.5} alignItems="center" flex={1} maxWidth={{ xs: '100%', md: 450 }}>
                    <TextField
                        size="small"
                        fullWidth
                        placeholder="Search by name, ID, vehicle, mobile, or license..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        InputProps={{
                            startAdornment: <SearchIcon sx={{ color: '#64748b', mr: 1 }} />,
                            sx: {
                                bgcolor: '#1e293b',
                                color: '#f8fafc',
                                borderRadius: '10px',
                                border: '1px solid rgba(255, 255, 255, 0.08)'
                            }
                        }}
                    />
                </Box>

                <Box display="flex" gap={1.5} alignItems="center">
                    {currentTab === 0 && (
                        <FormControl size="small" sx={{ minWidth: 160 }}>
                            <Select
                                value={driverTypeFilter}
                                onChange={(e) => setDriverTypeFilter(e.target.value)}
                                sx={{ bgcolor: '#1e293b', color: '#fff', borderRadius: '10px' }}
                            >
                                <MenuItem value="ALL">All Drivers</MenuItem>
                                <MenuItem value="PERMANENT">Permanent Drivers</MenuItem>
                                <MenuItem value="TEMPORARY">Temporary Drivers</MenuItem>
                            </Select>
                        </FormControl>
                    )}

                    {currentTab === 5 && (
                        <FormControl size="small" sx={{ minWidth: 160 }}>
                            <Select
                                value={auditActionFilter}
                                onChange={(e) => setAuditActionFilter(e.target.value)}
                                sx={{ bgcolor: '#1e293b', color: '#fff', borderRadius: '10px' }}
                            >
                                <MenuItem value="ALL">All Actions</MenuItem>
                                <MenuItem value="ENROLLMENT">Enrollment</MenuItem>
                                <MenuItem value="VERIFICATION">Verification</MenuItem>
                                <MenuItem value="FAILED_VERIFICATION">Failed Verification</MenuItem>
                                <MenuItem value="PAYMENT_AUTHORIZATION">Payment Auth</MenuItem>
                                <MenuItem value="TEMPORARY_DRIVER_CREATION">Temp Driver Created</MenuItem>
                            </Select>
                        </FormControl>
                    )}

                    <IconButton
                        onClick={() => {
                            if (currentTab < 4) fetchRecords();
                            else if (currentTab === 4) fetchDevices();
                            else fetchAudit();
                        }}
                        sx={{ bgcolor: '#1e293b', color: '#38bdf8', borderRadius: '10px', p: 1 }}
                    >
                        <RefreshIcon />
                    </IconButton>
                </Box>
            </Box>

            {/* ── ENROLLED IDENTITIES TABLE (Tabs 0 - 3) ───────────────────── */}
            {currentTab < 4 && (
                <Paper elevation={0} sx={{
                    borderRadius: '16px', bgcolor: '#1e293b', border: '1px solid rgba(255, 255, 255, 0.08)',
                    overflow: 'hidden'
                }}>
                    <TableContainer>
                        <Table sx={{ minWidth: 650 }}>
                            <TableHead sx={{ bgcolor: 'rgba(15, 23, 42, 0.8)' }}>
                                <TableRow>
                                    <TableCell sx={{ color: '#94a3b8', fontWeight: 800 }}>SUBJECT ID</TableCell>
                                    <TableCell sx={{ color: '#94a3b8', fontWeight: 800 }}>NAME</TableCell>
                                    <TableCell sx={{ color: '#94a3b8', fontWeight: 800 }}>ROLE / TYPE</TableCell>
                                    <TableCell sx={{ color: '#94a3b8', fontWeight: 800 }}>DETAILS</TableCell>
                                    <TableCell sx={{ color: '#94a3b8', fontWeight: 800 }}>FINGER</TableCell>
                                    <TableCell sx={{ color: '#94a3b8', fontWeight: 800 }}>QUALITY</TableCell>
                                    <TableCell sx={{ color: '#94a3b8', fontWeight: 800 }}>PANEL</TableCell>
                                    <TableCell sx={{ color: '#94a3b8', fontWeight: 800 }}>STATUS</TableCell>
                                    <TableCell sx={{ color: '#94a3b8', fontWeight: 800, textAlign: 'right' }}>ACTIONS</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={9} sx={{ textAlign: 'center', py: 6, color: '#94a3b8' }}>
                                            <CircularProgress size={32} sx={{ color: '#38bdf8' }} />
                                            <Typography variant="body2" sx={{ mt: 1 }}>Loading biometric records...</Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : enrolledRecords.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9} sx={{ textAlign: 'center', py: 6, color: '#94a3b8' }}>
                                            <FingerprintIcon sx={{ fontSize: 44, color: '#475569', mb: 1 }} />
                                            <Typography variant="body2" fontWeight="700">No fingerprint identities found.</Typography>
                                            <Typography variant="caption" color="#64748b">Click "Enroll Fingerprint" above to register a new identity.</Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : enrolledRecords.map((r) => (
                                    <TableRow key={r._id} sx={{ '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.02)' } }}>
                                        <TableCell sx={{ color: '#38bdf8', fontWeight: 800, fontFamily: 'monospace' }}>
                                            {r.subjectId}
                                        </TableCell>
                                        <TableCell sx={{ color: '#f8fafc', fontWeight: 800 }}>
                                            {r.subjectName}
                                        </TableCell>
                                        <TableCell>
                                            {r.subjectType === 'DRIVER' ? (
                                                <Chip
                                                    size="small"
                                                    label={r.driverType === 'TEMPORARY' ? 'TEMP DRIVER' : 'PERMANENT DRIVER'}
                                                    sx={{
                                                        bgcolor: r.driverType === 'TEMPORARY' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                                                        color: r.driverType === 'TEMPORARY' ? '#fbbf24' : '#38bdf8',
                                                        fontWeight: 800,
                                                        fontSize: '11px',
                                                        borderRadius: '6px'
                                                    }}
                                                />
                                            ) : (
                                                <Chip
                                                    size="small"
                                                    label={r.subjectType.replace('_', ' ')}
                                                    sx={{
                                                        bgcolor: 'rgba(168, 85, 247, 0.15)',
                                                        color: '#c084fc',
                                                        fontWeight: 800,
                                                        fontSize: '11px',
                                                        borderRadius: '6px'
                                                    }}
                                                />
                                            )}
                                        </TableCell>
                                        <TableCell sx={{ color: '#cbd5e1', fontSize: '0.85rem' }}>
                                            {r.assignedVehicle && (
                                                <Box display="flex" alignItems="center" gap={0.5}>
                                                    <LocalShippingIcon sx={{ fontSize: 14, color: '#38bdf8' }} />
                                                    <span>{r.assignedVehicle}</span>
                                                </Box>
                                            )}
                                            {r.licenseNo && <div>DL: {r.licenseNo}</div>}
                                            {r.mobile && <div>Ph: {r.mobile}</div>}
                                        </TableCell>
                                        <TableCell sx={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                                            {r.fingerPosition ? r.fingerPosition.replace('_', ' ') : 'Thumb'}
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                size="small"
                                                label={`${r.qualityScore || 85}%`}
                                                sx={{
                                                    bgcolor: (r.qualityScore || 85) >= 80 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                                    color: (r.qualityScore || 85) >= 80 ? '#4ade80' : '#fbbf24',
                                                    fontWeight: 800,
                                                    borderRadius: '6px'
                                                }}
                                            />
                                        </TableCell>
                                        <TableCell sx={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                                            {r.enrolledPanel || 'OFFICE'}
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                size="small"
                                                label={r.status}
                                                sx={{
                                                    bgcolor: r.status === 'ACTIVE' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                                    color: r.status === 'ACTIVE' ? '#4ade80' : '#f87171',
                                                    fontWeight: 900,
                                                    fontSize: '10px',
                                                    borderRadius: '6px'
                                                }}
                                            />
                                        </TableCell>
                                        <TableCell sx={{ textAlign: 'right' }}>
                                            <Tooltip title={r.status === 'ACTIVE' ? 'Disable Fingerprint' : 'Activate Fingerprint'}>
                                                <IconButton
                                                    size="small"
                                                    onClick={() => handleToggleStatus(r)}
                                                    sx={{ color: r.status === 'ACTIVE' ? '#fbbf24' : '#4ade80', mr: 1 }}
                                                >
                                                    {r.status === 'ACTIVE' ? <BlockIcon fontSize="small" /> : <CheckCircleOutlineIcon fontSize="small" />}
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Delete Enrollment">
                                                <IconButton
                                                    size="small"
                                                    onClick={() => handleDeleteRecord(r._id)}
                                                    sx={{ color: '#f87171' }}
                                                >
                                                    <DeleteOutlineIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>

                    <TablePagination
                        component="div"
                        count={totalRecords}
                        page={page}
                        onPageChange={(e, newPage) => setPage(newPage)}
                        rowsPerPage={rowsPerPage}
                        onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
                        sx={{ color: '#94a3b8' }}
                    />
                </Paper>
            )}

            {/* ── DEVICES TAB (Tab 4) ─────────────────────────────────────── */}
            {currentTab === 4 && (
                <Grid container spacing={3}>
                    {devices.map((d) => (
                        <Grid item xs={12} md={4} key={d.deviceId}>
                            <Card sx={{
                                borderRadius: '16px', bgcolor: '#1e293b', border: '1px solid rgba(255, 255, 255, 0.08)',
                                color: '#fff', p: 1
                            }}>
                                <CardContent>
                                    <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
                                        <Box display="flex" alignItems="center" gap={1.5}>
                                            <Box sx={{
                                                width: 44, height: 44, borderRadius: '12px',
                                                bgcolor: 'rgba(56, 189, 248, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                            }}>
                                                <UsbIcon sx={{ color: '#38bdf8', fontSize: 24 }} />
                                            </Box>
                                            <Box>
                                                <Typography variant="subtitle1" fontWeight="800">{d.deviceName}</Typography>
                                                <Typography variant="caption" sx={{ color: '#64748b' }}>{d.deviceId}</Typography>
                                            </Box>
                                        </Box>
                                        <Chip
                                            size="small"
                                            label={d.status}
                                            sx={{
                                                bgcolor: d.status === 'ONLINE' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                                color: d.status === 'ONLINE' ? '#4ade80' : '#f87171',
                                                fontWeight: 800,
                                                borderRadius: '6px'
                                            }}
                                        />
                                    </Box>

                                    <Divider sx={{ my: 1.5, borderColor: 'rgba(255, 255, 255, 0.06)' }} />

                                    <Typography variant="body2" sx={{ color: '#94a3b8', mb: 0.5 }}>Model: <span style={{ color: '#f8fafc' }}>{d.model}</span></Typography>
                                    <Typography variant="body2" sx={{ color: '#94a3b8', mb: 0.5 }}>Panel Access: <span style={{ color: '#f8fafc' }}>{d.panel}</span></Typography>
                                    <Typography variant="body2" sx={{ color: '#94a3b8', mb: 0.5 }}>Hardware Type: <span style={{ color: '#f8fafc' }}>{d.deviceType}</span></Typography>
                                    <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mt: 1 }}>
                                        Last Heartbeat: {new Date(d.lastSeenAt || Date.now()).toLocaleTimeString()}
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Grid>
                    ))}
                </Grid>
            )}

            {/* ── AUDIT TRAIL TAB (Tab 5) ─────────────────────────────────── */}
            {currentTab === 5 && (
                <Paper elevation={0} sx={{
                    borderRadius: '16px', bgcolor: '#1e293b', border: '1px solid rgba(255, 255, 255, 0.08)',
                    overflow: 'hidden'
                }}>
                    <TableContainer>
                        <Table sx={{ minWidth: 650 }}>
                            <TableHead sx={{ bgcolor: 'rgba(15, 23, 42, 0.8)' }}>
                                <TableRow>
                                    <TableCell sx={{ color: '#94a3b8', fontWeight: 800 }}>TIMESTAMP</TableCell>
                                    <TableCell sx={{ color: '#94a3b8', fontWeight: 800 }}>ACTION</TableCell>
                                    <TableCell sx={{ color: '#94a3b8', fontWeight: 800 }}>SUBJECT</TableCell>
                                    <TableCell sx={{ color: '#94a3b8', fontWeight: 800 }}>PANEL</TableCell>
                                    <TableCell sx={{ color: '#94a3b8', fontWeight: 800 }}>PERFORMED BY</TableCell>
                                    <TableCell sx={{ color: '#94a3b8', fontWeight: 800 }}>DEVICE</TableCell>
                                    <TableCell sx={{ color: '#94a3b8', fontWeight: 800 }}>RESULT</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={7} sx={{ textAlign: 'center', py: 6, color: '#94a3b8' }}>
                                            <CircularProgress size={32} sx={{ color: '#38bdf8' }} />
                                            <Typography variant="body2" sx={{ mt: 1 }}>Loading audit trail...</Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : auditLogs.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} sx={{ textAlign: 'center', py: 6, color: '#94a3b8' }}>
                                            <HistoryIcon sx={{ fontSize: 44, color: '#475569', mb: 1 }} />
                                            <Typography variant="body2" fontWeight="700">No audit events logged yet.</Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : auditLogs.map((log) => (
                                    <TableRow key={log._id || log.auditId} sx={{ '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.02)' } }}>
                                        <TableCell sx={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                                            {new Date(log.timestamp).toLocaleString()}
                                        </TableCell>
                                        <TableCell sx={{ fontWeight: 800, color: '#f8fafc' }}>
                                            {log.action.replace(/_/g, ' ')}
                                        </TableCell>
                                        <TableCell sx={{ color: '#38bdf8', fontWeight: 700 }}>
                                            {log.subjectName} ({log.subjectId || 'N/A'})
                                        </TableCell>
                                        <TableCell sx={{ color: '#cbd5e1' }}>
                                            {log.panel}
                                        </TableCell>
                                        <TableCell sx={{ color: '#cbd5e1' }}>
                                            {log.performedBy}
                                        </TableCell>
                                        <TableCell sx={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                                            {log.deviceId || 'SCANNER'}
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                size="small"
                                                label={log.success ? 'SUCCESS' : 'REJECTED'}
                                                sx={{
                                                    bgcolor: log.success ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                                    color: log.success ? '#4ade80' : '#f87171',
                                                    fontWeight: 900,
                                                    fontSize: '10px',
                                                    borderRadius: '6px'
                                                }}
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>

                    <TablePagination
                        component="div"
                        count={auditTotal}
                        page={auditPage}
                        onPageChange={(e, newPage) => setAuditPage(newPage)}
                        rowsPerPage={15}
                        rowsPerPageOptions={[15]}
                        sx={{ color: '#94a3b8' }}
                    />
                </Paper>
            )}

            {/* ── CENTRAL ENROLLMENT MODAL ─────────────────────────────────── */}
            <Dialog
                open={enrollDialogOpen}
                onClose={() => setEnrollDialogOpen(false)}
                maxWidth="md"
                fullWidth
                PaperProps={{
                    sx: {
                        borderRadius: '20px',
                        bgcolor: '#0f172a',
                        color: '#f8fafc',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        boxShadow: '0 25px 60px rgba(0, 0, 0, 0.5)'
                    }
                }}
            >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1, borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                    <Box sx={{ p: 1, bgcolor: 'rgba(56, 189, 248, 0.15)', borderRadius: '10px', color: '#38bdf8' }}>
                        <FingerprintIcon fontSize="medium" />
                    </Box>
                    <Box>
                        <Typography variant="h6" fontWeight="900">Enroll Fingerprint Identity</Typography>
                        <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                            Register biometric signature for Drivers, Office/Site Members, or Developers
                        </Typography>
                    </Box>
                </DialogTitle>

                <DialogContent sx={{ pt: 3 }}>
                    <Grid container spacing={3}>
                        {/* Left Column: Form Details */}
                        <Grid item xs={12} md={6}>
                            <Typography variant="subtitle2" fontWeight="800" sx={{ color: '#38bdf8', mb: 2 }}>
                                1. IDENTITY & DETAILS
                            </Typography>

                            {/* Subject Type Selector */}
                            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                                <InputLabel sx={{ color: '#94a3b8' }}>Role / Identity Category</InputLabel>
                                <Select
                                    value={enrollForm.subjectType}
                                    label="Role / Identity Category"
                                    onChange={(e) => {
                                        const t = e.target.value;
                                        setEnrollForm(p => ({ ...p, subjectType: t, subjectName: '', subjectId: '' }));
                                        loadCandidates(t);
                                    }}
                                    sx={{ bgcolor: '#1e293b', color: '#fff', borderRadius: '10px' }}
                                >
                                    <MenuItem value="DRIVER">Driver (Permanent / Temporary)</MenuItem>
                                    <MenuItem value="OFFICE_MEMBER">Office Member / Employee</MenuItem>
                                    <MenuItem value="SITE_MEMBER">Site Member</MenuItem>
                                    <MenuItem value="DEVELOPER">Developer (Dev 1, 2, 3...)</MenuItem>
                                </Select>
                            </FormControl>

                            {/* Auto-fill from Existing Staff/Drivers */}
                            {candidates.length > 0 && (
                                <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                                    <InputLabel sx={{ color: '#94a3b8' }}>Select Existing Record (Optional)</InputLabel>
                                    <Select
                                        label="Select Existing Record (Optional)"
                                        onChange={handleCandidateSelect}
                                        defaultValue=""
                                        sx={{ bgcolor: '#1e293b', color: '#fff', borderRadius: '10px' }}
                                    >
                                        <MenuItem value="">-- Enter New / Custom --</MenuItem>
                                        {candidates.map(c => (
                                            <MenuItem key={c.id} value={c.id}>
                                                {c.name} {c.assignedVehicle ? `(${c.assignedVehicle})` : ''} {c.isEnrolled ? '✓ [Already Enrolled]' : ''}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            )}

                            {/* Driver Type Toggle */}
                            {enrollForm.subjectType === 'DRIVER' && (
                                <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                                    <InputLabel sx={{ color: '#94a3b8' }}>Driver Type</InputLabel>
                                    <Select
                                        value={enrollForm.driverType}
                                        label="Driver Type"
                                        onChange={(e) => setEnrollForm(p => ({ ...p, driverType: e.target.value }))}
                                        sx={{ bgcolor: '#1e293b', color: '#fff', borderRadius: '10px' }}
                                    >
                                        <MenuItem value="PERMANENT">Permanent Driver (Fleet Staff)</MenuItem>
                                        <MenuItem value="TEMPORARY">Temporary / New Driver</MenuItem>
                                    </Select>
                                </FormControl>
                            )}

                            {/* Subject Name */}
                            <TextField
                                fullWidth
                                size="small"
                                label="Full Name"
                                required
                                value={enrollForm.subjectName}
                                onChange={(e) => setEnrollForm(p => ({ ...p, subjectName: e.target.value }))}
                                sx={{ mb: 2, bgcolor: '#1e293b', input: { color: '#fff' } }}
                                InputLabelProps={{ sx: { color: '#94a3b8' } }}
                            />

                            {/* Driver specific: License & Vehicle */}
                            {enrollForm.subjectType === 'DRIVER' && (
                                <>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Assigned Vehicle (Optional)"
                                        value={enrollForm.assignedVehicle}
                                        onChange={(e) => setEnrollForm(p => ({ ...p, assignedVehicle: e.target.value.toUpperCase() }))}
                                        sx={{ mb: 2, bgcolor: '#1e293b', input: { color: '#fff' } }}
                                        InputLabelProps={{ sx: { color: '#94a3b8' } }}
                                    />
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Driving License No."
                                        value={enrollForm.licenseNo}
                                        onChange={(e) => setEnrollForm(p => ({ ...p, licenseNo: e.target.value }))}
                                        sx={{ mb: 2, bgcolor: '#1e293b', input: { color: '#fff' } }}
                                        InputLabelProps={{ sx: { color: '#94a3b8' } }}
                                    />
                                </>
                            )}

                            {/* Mobile */}
                            <TextField
                                fullWidth
                                size="small"
                                label="Mobile / Contact No."
                                value={enrollForm.mobile}
                                onChange={(e) => setEnrollForm(p => ({ ...p, mobile: e.target.value }))}
                                sx={{ mb: 2, bgcolor: '#1e293b', input: { color: '#fff' } }}
                                InputLabelProps={{ sx: { color: '#94a3b8' } }}
                            />

                            {/* Finger Position */}
                            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                                <InputLabel sx={{ color: '#94a3b8' }}>Finger Position</InputLabel>
                                <Select
                                    value={enrollForm.fingerPosition}
                                    label="Finger Position"
                                    onChange={(e) => setEnrollForm(p => ({ ...p, fingerPosition: e.target.value }))}
                                    sx={{ bgcolor: '#1e293b', color: '#fff', borderRadius: '10px' }}
                                >
                                    {FINGER_POSITIONS.map(f => (
                                        <MenuItem key={f.value} value={f.value}>{f.label}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>

                        {/* Right Column: Biometric Capture Widget */}
                        <Grid item xs={12} md={6}>
                            <Typography variant="subtitle2" fontWeight="800" sx={{ color: '#38bdf8', mb: 2 }}>
                                2. BIOMETRIC CAPTURE & SCANNER
                            </Typography>

                            {/* Device Selection */}
                            <FormControl fullWidth size="small" sx={{ mb: 3 }}>
                                <InputLabel sx={{ color: '#94a3b8' }}>Select Biometric Device</InputLabel>
                                <Select
                                    value={enrollForm.deviceId}
                                    label="Select Biometric Device"
                                    onChange={(e) => setEnrollForm(p => ({ ...p, deviceId: e.target.value }))}
                                    sx={{ bgcolor: '#1e293b', color: '#fff', borderRadius: '10px' }}
                                >
                                    {devices.map(d => (
                                        <MenuItem key={d.deviceId} value={d.deviceId}>
                                            {d.deviceName} ({d.status})
                                        </MenuItem>
                                    ))}
                                    {devices.length === 0 && (
                                        <MenuItem value="DEV-USB-MANTRA-01">Mantra MFS100 USB Scanner (ONLINE)</MenuItem>
                                    )}
                                </Select>
                            </FormControl>

                            {/* Interactive Fingerprint Sensor Box */}
                            <Paper sx={{
                                p: 3,
                                borderRadius: '16px',
                                bgcolor: '#1e293b',
                                border: scanningState === 'SCANNED' ? '2px solid #4ade80' : scanningState === 'SCANNING' ? '2px solid #38bdf8' : '1px dashed rgba(255, 255, 255, 0.2)',
                                textAlign: 'center',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                minHeight: 220,
                                position: 'relative',
                                overflow: 'hidden'
                            }}>
                                <Box sx={{
                                    width: 80,
                                    height: 80,
                                    borderRadius: '50%',
                                    bgcolor: scanningState === 'SCANNED' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(56, 189, 248, 0.12)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    mb: 2,
                                    border: scanningState === 'SCANNED' ? '2px solid #22c55e' : '1px solid rgba(56, 189, 248, 0.3)',
                                    animation: scanningState === 'SCANNING' ? 'pulse 1s infinite' : 'none'
                                }}>
                                    {scanningState === 'SCANNING' ? (
                                        <CircularProgress size={40} sx={{ color: '#38bdf8' }} />
                                    ) : scanningState === 'SCANNED' ? (
                                        <CheckCircleIcon sx={{ fontSize: 44, color: '#4ade80' }} />
                                    ) : (
                                        <FingerprintIcon sx={{ fontSize: 44, color: '#38bdf8' }} />
                                    )}
                                </Box>

                                <Typography variant="subtitle1" fontWeight="800" sx={{ color: '#f8fafc' }}>
                                    {scanningState === 'SCANNING' ? 'Scanning Fingerprint on Device...' : scanningState === 'SCANNED' ? 'Fingerprint Captured!' : 'Ready for Capture'}
                                </Typography>

                                <Typography variant="caption" sx={{ color: '#94a3b8', mt: 0.5, maxWidth: 280 }}>
                                    {scanningState === 'SCANNED'
                                        ? `Template verified. Quality score: ${capturedScan?.qualityScore}%. Ready to enroll.`
                                        : 'Place finger firmly on the biometric optical sensor and click capture.'}
                                </Typography>

                                {scanningState === 'SCANNED' && (
                                    <Box mt={2} display="flex" gap={1}>
                                        <Chip size="small" label={`Quality: ${capturedScan?.qualityScore}%`} color="success" sx={{ fontWeight: 800 }} />
                                        <Chip size="small" label={enrollForm.fingerPosition.replace('_', ' ')} sx={{ bgcolor: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', fontWeight: 800 }} />
                                    </Box>
                                )}

                                <Button
                                    variant="contained"
                                    startIcon={scanningState === 'SCANNING' ? <CircularProgress size={18} color="inherit" /> : <FingerprintIcon />}
                                    disabled={scanningState === 'SCANNING' || !enrollForm.subjectName.trim()}
                                    onClick={handleTriggerScan}
                                    sx={{
                                        mt: 2.5,
                                        borderRadius: '10px',
                                        px: 3,
                                        fontWeight: 800,
                                        bgcolor: scanningState === 'SCANNED' ? 'rgba(255, 255, 255, 0.1)' : '#0284c7',
                                        color: '#fff',
                                        '&:hover': { bgcolor: scanningState === 'SCANNED' ? 'rgba(255, 255, 255, 0.2)' : '#0369a1' }
                                    }}
                                >
                                    {scanningState === 'SCANNED' ? 'Rescan Fingerprint' : 'Capture Fingerprint'}
                                </Button>
                            </Paper>
                        </Grid>
                    </Grid>
                </DialogContent>

                <DialogActions sx={{ p: 2.5, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                    <Button onClick={() => setEnrollDialogOpen(false)} sx={{ color: '#94a3b8', fontWeight: 700 }}>
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        disabled={scanningState !== 'SCANNED' || enrollSubmitting}
                        onClick={handleSaveEnrollment}
                        sx={{
                            borderRadius: '10px',
                            px: 4,
                            fontWeight: 900,
                            bgcolor: '#22c55e',
                            color: '#052e16',
                            '&:hover': { bgcolor: '#16a34a' }
                        }}
                    >
                        {enrollSubmitting ? 'Saving Enrollment...' : 'Save & Activate Enrollment'}
                    </Button>
                </DialogActions>
            </Dialog>

        </Container>
    );
};

export default FingerprintManagerPage;
