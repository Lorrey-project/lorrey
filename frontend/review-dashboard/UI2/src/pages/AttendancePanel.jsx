import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Button, Container, Grid, Card, CardContent,
    CircularProgress, Alert, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Paper, Divider, Dialog, DialogTitle, DialogContent,
    DialogActions, TextField, MenuItem, Tabs, Tab, Snackbar, Badge
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import HistoryIcon from '@mui/icons-material/History';
import SecurityIcon from '@mui/icons-material/Security';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import GpsFixedIcon from '@mui/icons-material/GpsFixed';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

function getHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Radius of the Earth in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in meters
}

export default function AttendancePanel({ onBack }) {
    const { user } = useAuth();
    const token = localStorage.getItem('token');

    // State for employee flow
    const [today, setToday] = useState(null);
    const [history, setHistory] = useState([]);
    const [assignedSite, setAssignedSite] = useState(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    // State for location capture
    const [gpsCoords, setGpsCoords] = useState(null);
    const [gpsAccuracy, setGpsAccuracy] = useState(null);
    const [gpsLoading, setGpsLoading] = useState(false);
    const [gpsError, setGpsError] = useState('');
    const [selectedLocation, setSelectedLocation] = useState('');

    // Admin states
    const [activeTab, setActiveTab] = useState(0); // 0: My Attendance, 1: Employee Logs, 2: Audit Logs
    const [allHistory, setAllHistory] = useState([]);
    const [auditLogs, setAuditLogs] = useState([]);
    const [sitesList, setSitesList] = useState([]);
    const [adminLoading, setAdminLoading] = useState(false);

    // Dialog states for Admin corrections/creations
    const [correctOpen, setCorrectOpen] = useState(false);
    const [correctTarget, setCorrectTarget] = useState(null);
    const [correctFields, setCorrectFields] = useState({
        checkInTime: '',
        checkOutTime: '',
        status: 'checked-in',
        reason: ''
    });

    const [createManualOpen, setCreateManualOpen] = useState(false);
    const [createManualFields, setCreateManualFields] = useState({
        employeeId: '',
        siteId: '',
        date: new Date().toISOString().split('T')[0],
        checkInTime: '',
        checkOutTime: '',
        reason: ''
    });

    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleteTargetId, setDeleteTargetId] = useState(null);
    const [deleteReason, setDeleteReason] = useState('');

    const [usersList, setUsersList] = useState([]);

    // Fetch personal data
    const fetchMyAttendance = useCallback(async () => {
        try {
            setLoading(true);
            const res = await axios.get(`${API_URL}/attendance/my`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data.success) {
                setToday(res.data.today);
                setHistory(res.data.history || []);
                setAssignedSite(res.data.assignedSite);
            }
        } catch (e) {
            setErrorMsg(e.response?.data?.error || 'Failed to load attendance.');
        } finally {
            setLoading(false);
        }
    }, [token]);

    const fetchSites = useCallback(async () => {
        try {
            const res = await axios.get(`${API_URL}/attendance/sites`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data.success) {
                const filtered = res.data.sites.filter(s => s.siteName === 'Office' || s.siteName === 'Raj House');
                setSitesList(filtered);
            }
        } catch (e) {
            console.error('Failed to load sites:', e);
        }
    }, [token]);

    // Fetch administrative lists
    const fetchAdminData = useCallback(async () => {
        if (user.role !== 'HEAD_OFFICE') return;
        try {
            setAdminLoading(true);
            const headers = { Authorization: `Bearer ${token}` };
            const [histRes, auditRes, sitesRes, usersRes] = await Promise.all([
                axios.get(`${API_URL}/attendance/history`, { headers }),
                axios.get(`${API_URL}/attendance/audit`, { headers }),
                axios.get(`${API_URL}/attendance/sites`, { headers }),
                axios.get(`${API_URL}/auth/admin/active-users`, { headers }).catch(() => ({ data: { success: true, users: [] } }))
            ]);

            if (histRes.data.success) setAllHistory(histRes.data.history);
            if (auditRes.data.success) setAuditLogs(auditRes.data.logs);
            if (sitesRes.data.success) {
                const filtered = sitesRes.data.sites.filter(s => s.siteName === 'Office' || s.siteName === 'Raj House');
                setSitesList(filtered);
            }
            if (usersRes.data.success) setUsersList(usersRes.data.users);
        } catch (e) {
            setErrorMsg('Failed to load administrative logs.');
        } finally {
            setAdminLoading(false);
        }
    }, [user.role, token]);

    useEffect(() => {
        fetchMyAttendance();
        fetchSites();
    }, [fetchMyAttendance, fetchSites]);

    useEffect(() => {
        if (today) {
            if (today.siteId?.siteName) {
                setSelectedLocation(today.siteId.siteName);
            } else if (today.selectedLocationName) {
                setSelectedLocation(today.selectedLocationName);
            }
        } else {
            setSelectedLocation('');
        }
    }, [today]);

    useEffect(() => {
        if (activeTab > 0 && user.role === 'HEAD_OFFICE') {
            fetchAdminData();
        }
    }, [activeTab, user.role, fetchAdminData]);

    // Request device location
    const captureLocation = () => {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                const errMsg = 'Geolocation is not supported by your browser.';
                setGpsError(errMsg);
                reject(new Error(errMsg));
                return;
            }

            setGpsLoading(true);
            setGpsError('');

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const lat = position.coords.latitude;
                    const lon = position.coords.longitude;
                    const acc = position.coords.accuracy;

                    console.log("[RAW BROWSER GPS DATA]", {
                        latitude: lat,
                        longitude: lon,
                        accuracy: acc
                    });

                    setGpsCoords({ latitude: lat, longitude: lon });
                    setGpsAccuracy(acc);
                    setGpsLoading(false);
                    resolve({ latitude: lat, longitude: lon, accuracy: acc });
                },
                (error) => {
                    let errMsg = 'Unable to determine your current location.';
                    if (error.code === error.PERMISSION_DENIED) {
                        errMsg = 'Location permission is required to mark attendance.';
                    } else if (error.code === error.TIMEOUT) {
                        errMsg = 'Location request timed out. Please try again.';
                    }
                    setGpsError(errMsg);
                    setGpsLoading(false);
                    reject(error);
                },
                { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
            );
        });
    };

    // Check-In handler
    const handleCheckIn = async () => {
        if (!selectedLocation) {
            setErrorMsg('Please select an attendance location.');
            return;
        }
        setActionLoading(true);
        setErrorMsg('');
        setSuccessMsg('');
        try {
            const activeSite = sitesList.find(s => s.siteName === selectedLocation);
            const loc = await captureLocation();
            const payload = {
                selectedLocationId: activeSite?._id,
                selectedLocationName: selectedLocation,
                latitude: loc.latitude,
                longitude: loc.longitude,
                accuracy: loc.accuracy
            };
            console.log("[FRONTEND SEND PAYLOAD /check-in]", payload);
            const res = await axios.post(`${API_URL}/attendance/check-in`, payload, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.data.success) {
                setSuccessMsg('Check-in successful.');
                fetchMyAttendance();
            }
        } catch (e) {
            if (e.response?.data?.error) {
                setErrorMsg(e.response.data.error);
            } else if (e.message) {
                setErrorMsg(e.message);
            } else {
                setErrorMsg('Check-in failed.');
            }
        } finally {
            setActionLoading(false);
        }
    };

    // Check-Out handler
    const handleCheckOut = async () => {
        setActionLoading(true);
        setErrorMsg('');
        setSuccessMsg('');
        try {
            const loc = await captureLocation();
            const payload = {
                latitude: loc.latitude,
                longitude: loc.longitude,
                accuracy: loc.accuracy
            };
            console.log("[FRONTEND SEND PAYLOAD /check-out]", payload);
            const res = await axios.post(`${API_URL}/attendance/check-out`, payload, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.data.success) {
                setSuccessMsg('Check-out successful.');
                fetchMyAttendance();
            }
        } catch (e) {
            if (e.response?.data?.error) {
                setErrorMsg(e.response.data.error);
            } else if (e.message) {
                setErrorMsg(e.message);
            } else {
                setErrorMsg('Check-out failed.');
            }
        } finally {
            setActionLoading(false);
        }
    };

    // Admin Action Correction Submit
    const submitCorrection = async () => {
        if (!correctFields.reason) {
            setErrorMsg('Reason is required.');
            return;
        }
        try {
            const res = await axios.post(`${API_URL}/attendance/correct`, {
                attendanceId: correctTarget._id,
                checkInTime: correctFields.checkInTime || undefined,
                checkOutTime: correctFields.checkOutTime === '' ? null : correctFields.checkOutTime,
                status: correctFields.status,
                siteId: correctFields.siteId || undefined,
                reason: correctFields.reason
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data.success) {
                setSuccessMsg('Attendance record corrected successfully.');
                setCorrectOpen(false);
                fetchAdminData();
            }
        } catch (e) {
            setErrorMsg(e.response?.data?.error || 'Correction failed.');
        }
    };

    // Admin Action Create Manual Submit
    const submitManualCreate = async () => {
        const { employeeId, siteId, date, checkInTime, checkOutTime, reason } = createManualFields;
        if (!employeeId || !siteId || !date || !checkInTime || !reason) {
            setErrorMsg('All fields are required.');
            return;
        }
        try {
            const res = await axios.post(`${API_URL}/attendance/create-manual`, {
                employeeId,
                siteId,
                date,
                checkInTime,
                checkOutTime: checkOutTime || undefined,
                reason
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data.success) {
                setSuccessMsg('Manual attendance record created.');
                setCreateManualOpen(false);
                fetchAdminData();
            }
        } catch (e) {
            setErrorMsg(e.response?.data?.error || 'Manual creation failed.');
        }
    };

    // Admin Action Delete Submit
    const submitDelete = async () => {
        if (!deleteReason) {
            setErrorMsg('Reason is required.');
            return;
        }
        try {
            const res = await axios.delete(`${API_URL}/attendance/delete/${deleteTargetId}`, {
                headers: { Authorization: `Bearer ${token}` },
                data: { reason: deleteReason }
            });
            if (res.data.success) {
                setSuccessMsg('Attendance deleted successfully.');
                setDeleteOpen(false);
                fetchAdminData();
            }
        } catch (e) {
            setErrorMsg(e.response?.data?.error || 'Deletion failed.');
        }
    };

    const formatDateTime = (dateStr) => {
        if (!dateStr) return '--';
        return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const formatDateFull = (dateStr) => {
        if (!dateStr) return '--';
        return new Date(dateStr).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
    };

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: '#f4f7f9', py: 4 }}>
            <Container maxWidth="lg">
                {/* Header Row */}
                <Box display="flex" justifyContent="space-between" alignItems="center" gap={2} mb={4} flexDirection={{ xs: 'column', sm: 'row' }}>
                    <Box display="flex" alignItems="center" gap={2}>
                        <Button
                            variant="outlined"
                            startIcon={<ArrowBackIcon />}
                            onClick={onBack}
                            sx={{
                                borderRadius: '12px',
                                textTransform: 'none',
                                fontWeight: 700,
                                borderColor: '#cbd5e1',
                                color: '#334155',
                                bgcolor: 'white',
                                '&:hover': { bgcolor: '#f1f5f9', borderColor: '#94a3b8' }
                            }}
                        >
                            Back
                        </Button>
                        <Box display="flex" alignItems="center" gap={1.5}>
                            <Box sx={{ p: 1, bgcolor: '#4f46e5', borderRadius: '10px', color: 'white', display: 'flex', alignItems: 'center' }}>
                                <LocationOnIcon />
                            </Box>
                            <Typography variant="h4" fontWeight={900} sx={{ color: '#0f172a', letterSpacing: '-0.5px' }}>
                                Attendance Panel
                            </Typography>
                        </Box>
                    </Box>
                    {user.role === 'HEAD_OFFICE' && (
                        <Box sx={{ bgcolor: 'white', borderRadius: '14px', p: 0.5, border: '1px solid #e2e8f0' }}>
                            <Tabs value={activeTab} onChange={(e, val) => setActiveTab(val)} sx={{ minHeight: 40 }} TabIndicatorProps={{ sx: { display: 'none' } }}>
                                <Tab label="My Attendance" sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '10px', minHeight: 36, '&.Mui-selected': { bgcolor: '#4f46e5', color: 'white' } }} />
                                <Tab label="Employee Logs" sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '10px', minHeight: 36, '&.Mui-selected': { bgcolor: '#4f46e5', color: 'white' } }} />
                                <Tab label="Audit Logs" sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '10px', minHeight: 36, '&.Mui-selected': { bgcolor: '#4f46e5', color: 'white' } }} />
                            </Tabs>
                        </Box>
                    )}
                </Box>

                {errorMsg && <Alert severity="error" sx={{ borderRadius: '16px', mb: 3 }} onClose={() => setErrorMsg('')}>{errorMsg}</Alert>}
                {successMsg && <Alert severity="success" sx={{ borderRadius: '16px', mb: 3 }} onClose={() => setSuccessMsg('')}>{successMsg}</Alert>}

                {/* Tab 0: Personal Attendance */}
                {activeTab === 0 && (
                    <Grid container spacing={3}>
                        {/* Check-In/Check-Out Operations */}
                        <Grid item xs={12} md={5}>
                            <Card sx={{ borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)', mb: 3 }}>
                                <CardContent sx={{ p: 4 }}>
                                    <Typography variant="h6" fontWeight={850} color="#0f172a" mb={2}>
                                        Mark Attendance
                                    </Typography>
                                    <Divider sx={{ mb: 3 }} />

                                    <Typography variant="caption" fontWeight={800} color="#64748b" display="block" mb={1}>
                                        Assigned/Attendance Location
                                    </Typography>
                                    <TextField
                                        select
                                        label=""
                                        value={selectedLocation}
                                        onChange={(e) => setSelectedLocation(e.target.value)}
                                        fullWidth
                                        disabled={actionLoading || (today && today.checkIn !== null)}
                                        sx={{ mb: 3 }}
                                        SelectProps={{
                                            displayEmpty: true,
                                            renderValue: (selected) => {
                                                if (!selected) {
                                                    return <em>Select Attendance Location</em>;
                                                }
                                                return selected;
                                            }
                                        }}
                                    >
                                        <MenuItem disabled value="">
                                            <em>Select Attendance Location</em>
                                        </MenuItem>
                                        <MenuItem value="Office">Office</MenuItem>
                                        <MenuItem value="Raj House">Raj House</MenuItem>
                                    </TextField>

                                    {selectedLocation && (
                                        <Box sx={{ mb: 3, p: 2, bgcolor: '#f8fafc', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                                            <Typography variant="body2" color="#0f172a" fontWeight={700}>
                                                Selected Location: {selectedLocation}
                                            </Typography>
                                            <Typography variant="body2" color="#475569" fontWeight={500} mt={0.5}>
                                                Geofence: 100m
                                            </Typography>
                                        </Box>
                                    )}

                                    {/* Action Buttons */}
                                    <Box display="flex" gap={2} flexDirection="column">
                                        <Box display="flex" gap={2}>
                                            <Button
                                                fullWidth
                                                variant="contained"
                                                size="large"
                                                onClick={handleCheckIn}
                                                disabled={actionLoading || gpsLoading || !selectedLocation || (today && today.checkIn !== null)}
                                                sx={{
                                                    borderRadius: '14px', py: 1.8, fontWeight: 900,
                                                    bgcolor: '#10b981', '&:hover': { bgcolor: '#059669' },
                                                    boxShadow: '0 8px 16px rgba(16,185,129,0.2)'
                                                }}
                                            >
                                                {actionLoading ? <CircularProgress size={24} color="inherit" /> : 'Check In'}
                                            </Button>

                                            <Button
                                                fullWidth
                                                variant="contained"
                                                size="large"
                                                onClick={handleCheckOut}
                                                disabled={actionLoading || gpsLoading || !selectedLocation || !today || today.status === 'checked-out'}
                                                sx={{
                                                    borderRadius: '14px', py: 1.8, fontWeight: 900,
                                                    bgcolor: '#ef4444', '&:hover': { bgcolor: '#dc2626' },
                                                    boxShadow: '0 8px 16px rgba(239,68,68,0.2)'
                                                }}
                                            >
                                                {actionLoading ? <CircularProgress size={24} color="inherit" /> : 'Check Out'}
                                            </Button>
                                        </Box>

                                        <Button
                                            variant="outlined"
                                            onClick={captureLocation}
                                            disabled={gpsLoading}
                                            startIcon={<GpsFixedIcon />}
                                            sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 700 }}
                                        >
                                            {gpsLoading ? 'Capturing GPS…' : 'Capture Current Coordinates'}
                                        </Button>
                                    </Box>

                                    {/* GPS Debug Stats */}
                                    {/* GPS Debug Stats */}
                                    {(() => {
                                        const activeSite = sitesList.find(s => s.siteName === selectedLocation);
                                        let calculatedDistance = null;
                                        let gpsAccuracyValid = null;
                                        let geofenceValid = null;
                                        let finalValid = null;

                                        if (gpsCoords && activeSite) {
                                            calculatedDistance = getHaversineDistance(
                                                gpsCoords.latitude,
                                                gpsCoords.longitude,
                                                activeSite.latitude,
                                                activeSite.longitude
                                            );
                                            gpsAccuracyValid = gpsAccuracy !== null && gpsAccuracy <= 250;
                                            geofenceValid = calculatedDistance <= 100;
                                            finalValid = gpsAccuracyValid && geofenceValid;
                                        }

                                        return (
                                            <>
                                                <Box sx={{ mt: 3, p: 2, bgcolor: '#f1f5f9', borderRadius: '16px', border: '1px solid #cbd5e1' }}>
                                                    <Typography variant="subtitle2" fontWeight={800} color="#0f172a" mb={1}>Current GPS:</Typography>
                                                    {gpsError ? (
                                                        <Typography variant="body2" color="error" fontWeight={650}>{gpsError}</Typography>
                                                    ) : (
                                                        <>
                                                            <Typography variant="body2" color="text.secondary">Latitude: {gpsCoords ? gpsCoords.latitude : '<value>'}</Typography>
                                                            <Typography variant="body2" color="text.secondary">Longitude: {gpsCoords ? gpsCoords.longitude : '<value>'}</Typography>
                                                            <Typography variant="body2" color={gpsAccuracy > 250 ? 'error' : 'text.secondary'} fontWeight={gpsAccuracy !== null ? 700 : 400}>
                                                                Accuracy: {gpsAccuracy !== null ? `${gpsAccuracy} meters` : '<value> meters'}
                                                            </Typography>
                                                            {gpsAccuracy !== null && gpsAccuracy > 250 && (
                                                                <Typography variant="body2" color="error" fontWeight={700} mt={1}>
                                                                    GPS accuracy is low. Please wait a few seconds or move to an open area and try again.
                                                                </Typography>
                                                            )}
                                                        </>
                                                    )}
                                                    <Box mt={1}>
                                                        <Typography variant="body2" color="text.secondary"><strong>Maximum Allowed Accuracy:</strong> 250 meters</Typography>
                                                    </Box>
                                                </Box>

                                                {/* Developer Debug Section */}
                                                <Box sx={{ mt: 3, p: 2, bgcolor: '#fffbeb', borderRadius: '16px', border: '1px solid #fef3c7' }}>
                                                    <Typography variant="subtitle2" fontWeight={800} color="#b45309" mb={1}>DEVELOPER DEBUG INFO</Typography>
                                                    <Typography variant="caption" color="text.secondary" display="block">
                                                        <strong>Selected Location:</strong> {selectedLocation || 'None'}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary" display="block">
                                                        <strong>Current Latitude:</strong> {gpsCoords ? gpsCoords.latitude : 'N/A'}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary" display="block">
                                                        <strong>Current Longitude:</strong> {gpsCoords ? gpsCoords.longitude : 'N/A'}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary" display="block">
                                                        <strong>GPS Accuracy:</strong> {gpsAccuracy !== null ? `${gpsAccuracy} meters` : 'N/A'}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary" display="block">
                                                        <strong>Distance From Selected Location:</strong> {calculatedDistance !== null ? `${calculatedDistance.toFixed(1)} meters` : 'N/A'}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary" display="block">
                                                        <strong>Geofence Radius:</strong> 100 meters
                                                    </Typography>
                                                    <Typography variant="caption" color={gpsAccuracyValid === true ? 'success.main' : 'error.main'} fontWeight={700} display="block">
                                                        <strong>GPS Accuracy Validation:</strong> {gpsAccuracyValid === null ? 'N/A' : (gpsAccuracyValid ? 'PASS' : 'FAIL')}
                                                    </Typography>
                                                    <Typography variant="caption" color={geofenceValid === true ? 'success.main' : 'error.main'} fontWeight={700} display="block">
                                                        <strong>Geofence Validation:</strong> {geofenceValid === null ? 'N/A' : (geofenceValid ? 'PASS' : 'FAIL')}
                                                    </Typography>
                                                    <Typography variant="caption" color={finalValid === true ? 'success.main' : 'error.main'} fontWeight={800} display="block" mt={1}>
                                                        <strong>Final Attendance Validation:</strong> {finalValid === null ? 'N/A' : (finalValid ? 'PASS' : 'FAIL')}
                                                    </Typography>
                                                </Box>
                                            </>
                                        );
                                    })()}
                                </CardContent>
                            </Card>
                        </Grid>

                        {/* Current Status and Logs History */}
                        <Grid item xs={12} md={7}>
                            {/* Today Status Widget */}
                            <Card sx={{ borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.02)', mb: 3 }}>
                                <CardContent sx={{ p: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <Box>
                                        <Typography variant="h6" fontWeight={850} color="#0f172a">Today's Session</Typography>
                                        <Typography variant="caption" color="text.secondary" fontWeight={500}>{new Date().toDateString()}</Typography>
                                        <Box display="flex" gap={2} mt={2}>
                                            <Box>
                                                <Typography variant="caption" color="#64748b" display="block">CHECK-IN</Typography>
                                                <Typography variant="subtitle1" fontWeight={800} color="#10b981">{today ? formatDateTime(today.checkIn?.time) : '--:--'}</Typography>
                                            </Box>
                                            <Box>
                                                <Typography variant="caption" color="#64748b" display="block">CHECK-OUT</Typography>
                                                <Typography variant="subtitle1" fontWeight={800} color="#ef4444">{today && today.checkOut ? formatDateTime(today.checkOut?.time) : '--:--'}</Typography>
                                            </Box>
                                        </Box>
                                    </Box>
                                    <Box>
                                        <Badge
                                            badgeContent={today ? today.status.toUpperCase() : 'NO RECORD'}
                                            color={today ? (today.status === 'checked-out' ? 'success' : 'warning') : 'default'}
                                            sx={{ '& .MuiBadge-badge': { height: 26, fontSize: '0.75rem', fontWeight: 800, px: 2, borderRadius: '8px' } }}
                                        />
                                    </Box>
                                </CardContent>
                            </Card>

                            {/* Personal History */}
                            <TableContainer component={Paper} sx={{ borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: 'none' }}>
                                <Box p={3} pb={1} display="flex" alignItems="center" gap={1}>
                                    <HistoryIcon color="action" />
                                    <Typography variant="h6" fontWeight={850} color="#0f172a">Recent Attendance</Typography>
                                </Box>
                                <Table>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell sx={{ fontWeight: 800, color: '#475569' }}>Date</TableCell>
                                            <TableCell sx={{ fontWeight: 800, color: '#475569' }}>Location</TableCell>
                                            <TableCell sx={{ fontWeight: 800, color: '#475569' }}>Check-In</TableCell>
                                            <TableCell sx={{ fontWeight: 800, color: '#475569' }}>Check-Out</TableCell>
                                            <TableCell sx={{ fontWeight: 800, color: '#475569' }}>Status</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {history.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={5} align="center" sx={{ color: 'text.secondary', py: 4 }}>No attendance records found.</TableCell>
                                            </TableRow>
                                        ) : (
                                            history.map((row) => (
                                                <TableRow key={row._id}>
                                                    <TableCell sx={{ fontWeight: 700 }}>{row.date}</TableCell>
                                                    <TableCell sx={{ fontWeight: 600 }}>{row.siteId?.siteName || 'Auto Site'}</TableCell>
                                                    <TableCell>{formatDateTime(row.checkIn?.time)}</TableCell>
                                                    <TableCell>{row.checkOut ? formatDateTime(row.checkOut.time) : '--'}</TableCell>
                                                    <TableCell>
                                                        <Badge
                                                            badgeContent={row.status}
                                                            color={row.status === 'checked-out' ? 'success' : 'warning'}
                                                            sx={{ '& .MuiBadge-badge': { fontWeight: 700, fontSize: '0.65rem' } }}
                                                        />
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Grid>
                    </Grid>
                )}

                {/* Tab 1: Employee Logs (Admin Only) */}
                {activeTab === 1 && user.role === 'HEAD_OFFICE' && (
                    <Card sx={{ borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: 'none' }}>
                        <Box p={3} display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
                            <Typography variant="h6" fontWeight={850} color="#0f172a">All Employee Attendance</Typography>
                            <Button
                                variant="contained"
                                startIcon={<AddIcon />}
                                onClick={() => setCreateManualOpen(true)}
                                sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 700, bgcolor: '#4f46e5', '&:hover': { bgcolor: '#4338ca' } }}
                            >
                                Manual Check-In
                            </Button>
                        </Box>
                        <Divider />
                        {adminLoading ? (
                            <Box display="flex" justifyContent="center" py={8}><CircularProgress /></Box>
                        ) : (
                            <TableContainer>
                                <Table>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell sx={{ fontWeight: 800 }}>Employee</TableCell>
                                            <TableCell sx={{ fontWeight: 800 }}>Date</TableCell>
                                            <TableCell sx={{ fontWeight: 800 }}>Assigned Site</TableCell>
                                            <TableCell sx={{ fontWeight: 800 }}>Check-In Time</TableCell>
                                            <TableCell sx={{ fontWeight: 800 }}>Check-Out Time</TableCell>
                                            <TableCell sx={{ fontWeight: 800 }}>Status</TableCell>
                                            <TableCell sx={{ fontWeight: 800 }} align="center">Actions</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {allHistory.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={7} align="center" sx={{ py: 6, color: 'text.secondary' }}>No records found.</TableCell>
                                            </TableRow>
                                        ) : (
                                            allHistory.map((row) => (
                                                <TableRow key={row._id}>
                                                    <TableCell sx={{ fontWeight: 700 }}>
                                                        {row.employeeId?.name || 'Unnamed Employee'}
                                                        <Typography variant="caption" display="block" color="text.secondary">{row.employeeId?.email}</Typography>
                                                    </TableCell>
                                                    <TableCell sx={{ fontWeight: 600 }}>{row.date}</TableCell>
                                                    <TableCell>{row.siteId?.siteName || 'N/A'}</TableCell>
                                                    <TableCell>{formatDateTime(row.checkIn?.time)}</TableCell>
                                                    <TableCell>{row.checkOut ? formatDateTime(row.checkOut.time) : '--'}</TableCell>
                                                    <TableCell>
                                                        <Badge
                                                            badgeContent={row.status}
                                                            color={row.status === 'checked-out' ? 'success' : 'warning'}
                                                            sx={{ '& .MuiBadge-badge': { fontWeight: 700 } }}
                                                        />
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        <Box display="flex" justifyContent="center" gap={1}>
                                                            <Button
                                                                size="small"
                                                                variant="outlined"
                                                                startIcon={<EditIcon />}
                                                                onClick={() => {
                                                                    setCorrectTarget(row);
                                                                    setCorrectFields({
                                                                        checkInTime: row.checkIn ? new Date(row.checkIn.time).toISOString().slice(0, 16) : '',
                                                                        checkOutTime: row.checkOut ? new Date(row.checkOut.time).toISOString().slice(0, 16) : '',
                                                                        status: row.status,
                                                                        siteId: row.siteId?._id || '',
                                                                        reason: ''
                                                                    });
                                                                    setCorrectOpen(true);
                                                                }}
                                                                sx={{ borderRadius: '8px', textTransform: 'none' }}
                                                            >
                                                                Correct
                                                            </Button>
                                                            <Button
                                                                size="small"
                                                                variant="outlined"
                                                                color="error"
                                                                startIcon={<DeleteIcon />}
                                                                onClick={() => {
                                                                    setDeleteTargetId(row._id);
                                                                    setDeleteReason('');
                                                                    setDeleteOpen(true);
                                                                }}
                                                                sx={{ borderRadius: '8px', textTransform: 'none' }}
                                                            >
                                                                Delete
                                                            </Button>
                                                        </Box>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        )}
                    </Card>
                )}

                {/* Tab 2: Audit Logs (Admin Only) */}
                {activeTab === 2 && user.role === 'HEAD_OFFICE' && (
                    <Card sx={{ borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: 'none' }}>
                        <Box p={3} display="flex" alignItems="center" gap={1.5}>
                            <SecurityIcon color="action" />
                            <Typography variant="h6" fontWeight={850} color="#0f172a">Attendance Security Audit Logs</Typography>
                        </Box>
                        <Divider />
                        {adminLoading ? (
                            <Box display="flex" justifyContent="center" py={8}><CircularProgress /></Box>
                        ) : (
                            <TableContainer>
                                <Table>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell sx={{ fontWeight: 800 }}>Timestamp</TableCell>
                                            <TableCell sx={{ fontWeight: 800 }}>Employee</TableCell>
                                            <TableCell sx={{ fontWeight: 800 }}>Action Taken</TableCell>
                                            <TableCell sx={{ fontWeight: 800 }}>Details / Reason</TableCell>
                                            <TableCell sx={{ fontWeight: 800 }}>Performed By</TableCell>
                                            <TableCell sx={{ fontWeight: 800 }}>Device Info</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {auditLogs.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={6} align="center" sx={{ py: 6, color: 'text.secondary' }}>No audit records found.</TableCell>
                                            </TableRow>
                                        ) : (
                                            auditLogs.map((log) => (
                                                <TableRow key={log._id}>
                                                    <TableCell sx={{ fontWeight: 600 }}>{formatDateFull(log.timestamp)} {formatDateTime(log.timestamp)}</TableCell>
                                                    <TableCell sx={{ fontWeight: 700 }}>{log.employeeId?.name || 'N/A'}</TableCell>
                                                    <TableCell>
                                                        <Badge
                                                            badgeContent={log.action}
                                                            color={log.action.includes('REJECT') ? 'error' : (log.action.includes('SUCCESS') ? 'success' : 'primary')}
                                                            sx={{ '& .MuiBadge-badge': { fontWeight: 700, fontSize: '0.65rem' } }}
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        <Typography variant="body2" fontWeight={500}>{log.reason || 'Succeeded validation.'}</Typography>
                                                        {log.previousValue && (
                                                            <Box mt={1} sx={{ p: 1, bgcolor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.75rem' }}>
                                                                {log.previousValue.checkInTime !== undefined && (
                                                                    <div><strong>Prev Check-In:</strong> {formatDateTime(log.previousValue.checkInTime)} | <strong>Prev Check-Out:</strong> {formatDateTime(log.previousValue.checkOutTime)}</div>
                                                                )}
                                                                {log.previousValue.siteName && (
                                                                    <div><strong>Prev Location:</strong> {log.previousValue.siteName}</div>
                                                                )}
                                                            </Box>
                                                        )}
                                                        {log.newValue && (
                                                            <Box mt={0.5} sx={{ p: 1, bgcolor: '#f0fdf4', borderRadius: '8px', border: '1px solid #dcfce7', fontSize: '0.75rem' }}>
                                                                {log.newValue.checkInTime !== undefined && (
                                                                    <div><strong>New Check-In:</strong> {formatDateTime(log.newValue.checkInTime)} | <strong>New Check-Out:</strong> {formatDateTime(log.newValue.checkOutTime)}</div>
                                                                )}
                                                                {log.newValue.siteName && (
                                                                    <div><strong>New Location:</strong> {log.newValue.siteName}</div>
                                                                )}
                                                                {log.newValue.location && (
                                                                    <div><strong>Location:</strong> {log.newValue.location} | <strong>Distance:</strong> {log.newValue.distance} | <strong>Accuracy:</strong> {log.newValue.accuracy}</div>
                                                                )}
                                                            </Box>
                                                        )}
                                                    </TableCell>
                                                    <TableCell sx={{ fontWeight: 600 }}>{log.performedBy?.name || 'System'}</TableCell>
                                                    <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                                                        IP: {log.ipAddress || 'unknown'}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        )}
                    </Card>
                )}

                {/* Dialog: Admin Correction */}
                <Dialog open={correctOpen} onClose={() => setCorrectOpen(false)} fullWidth maxWidth="sm">
                    <DialogTitle fontWeight={800}>Correct Attendance Log</DialogTitle>
                    <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
                        <TextField
                            label="Check-In Time"
                            type="datetime-local"
                            value={correctFields.checkInTime}
                            onChange={(e) => setCorrectFields({ ...correctFields, checkInTime: e.target.value })}
                            InputLabelProps={{ shrink: true }}
                            fullWidth
                        />
                        <TextField
                            label="Check-Out Time (Leave blank to remove check-out)"
                            type="datetime-local"
                            value={correctFields.checkOutTime}
                            onChange={(e) => setCorrectFields({ ...correctFields, checkOutTime: e.target.value })}
                            InputLabelProps={{ shrink: true }}
                            fullWidth
                        />
                        <TextField
                            select
                            label="Attendance Location / Site"
                            value={correctFields.siteId || ''}
                            onChange={(e) => setCorrectFields({ ...correctFields, siteId: e.target.value })}
                            fullWidth
                        >
                            {sitesList.map((s) => (
                                <MenuItem key={s._id} value={s._id}>{s.siteName}</MenuItem>
                            ))}
                        </TextField>
                        <TextField
                            select
                            label="Status"
                            value={correctFields.status}
                            onChange={(e) => setCorrectFields({ ...correctFields, status: e.target.value })}
                            fullWidth
                        >
                            <MenuItem value="checked-in">Checked In</MenuItem>
                            <MenuItem value="checked-out">Checked Out</MenuItem>
                            <MenuItem value="absent">Absent</MenuItem>
                        </TextField>
                        <TextField
                            label="Reason for Correction"
                            value={correctFields.reason}
                            onChange={(e) => setCorrectFields({ ...correctFields, reason: e.target.value })}
                            fullWidth
                            required
                        />
                    </DialogContent>
                    <DialogActions sx={{ p: 3 }}>
                        <Button onClick={() => setCorrectOpen(false)}>Cancel</Button>
                        <Button onClick={submitCorrection} variant="contained" sx={{ bgcolor: '#4f46e5', '&:hover': { bgcolor: '#4338ca' } }}>Submit Correction</Button>
                    </DialogActions>
                </Dialog>

                {/* Dialog: Manual Attendance Create */}
                <Dialog open={createManualOpen} onClose={() => setCreateManualOpen(false)} fullWidth maxWidth="sm">
                    <DialogTitle fontWeight={800}>Create Manual Attendance</DialogTitle>
                    <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
                        <TextField
                            select
                            label="Select Employee"
                            value={createManualFields.employeeId}
                            onChange={(e) => setCreateManualFields({ ...createManualFields, employeeId: e.target.value })}
                            fullWidth
                            required
                        >
                            {usersList.map((u) => (
                                <MenuItem key={u._id} value={u._id}>{u.name} ({u.email})</MenuItem>
                            ))}
                        </TextField>
                        <TextField
                            select
                            label="Select Location / Site"
                            value={createManualFields.siteId}
                            onChange={(e) => setCreateManualFields({ ...createManualFields, siteId: e.target.value })}
                            fullWidth
                            required
                        >
                            {sitesList.map((s) => (
                                <MenuItem key={s._id} value={s._id}>{s.siteName}</MenuItem>
                            ))}
                        </TextField>
                        <TextField
                            label="Date"
                            type="date"
                            value={createManualFields.date}
                            onChange={(e) => setCreateManualFields({ ...createManualFields, date: e.target.value })}
                            InputLabelProps={{ shrink: true }}
                            fullWidth
                            required
                        />
                        <TextField
                            label="Check-In Time"
                            type="datetime-local"
                            value={createManualFields.checkInTime}
                            onChange={(e) => setCreateManualFields({ ...createManualFields, checkInTime: e.target.value })}
                            InputLabelProps={{ shrink: true }}
                            fullWidth
                            required
                        />
                        <TextField
                            label="Check-Out Time (Optional)"
                            type="datetime-local"
                            value={createManualFields.checkOutTime}
                            onChange={(e) => setCreateManualFields({ ...createManualFields, checkOutTime: e.target.value })}
                            InputLabelProps={{ shrink: true }}
                            fullWidth
                        />
                        <TextField
                            label="Reason for Manual Log"
                            value={createManualFields.reason}
                            onChange={(e) => setCreateManualFields({ ...createManualFields, reason: e.target.value })}
                            fullWidth
                            required
                        />
                    </DialogContent>
                    <DialogActions sx={{ p: 3 }}>
                        <Button onClick={() => setCreateManualOpen(false)}>Cancel</Button>
                        <Button onClick={submitManualCreate} variant="contained" sx={{ bgcolor: '#4f46e5', '&:hover': { bgcolor: '#4338ca' } }}>Create Log</Button>
                    </DialogActions>
                </Dialog>

                {/* Dialog: Delete Attendance */}
                <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} fullWidth maxWidth="xs">
                    <DialogTitle fontWeight={800}>Cancel/Delete Attendance Record</DialogTitle>
                    <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
                        <Typography variant="body2" color="text.secondary">Are you sure you want to completely remove this attendance record? This action will be fully logged in the permanent security audit history.</Typography>
                        <TextField
                            label="Reason for deletion"
                            value={deleteReason}
                            onChange={(e) => setDeleteReason(e.target.value)}
                            fullWidth
                            required
                        />
                    </DialogContent>
                    <DialogActions sx={{ p: 3 }}>
                        <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
                        <Button onClick={submitDelete} variant="contained" color="error">Confirm Delete</Button>
                    </DialogActions>
                </Dialog>
            </Container>
        </Box>
    );
}
