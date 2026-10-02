import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Box, Typography, Button, Paper, CircularProgress,
    Alert, Chip, Divider, IconButton, Stepper, Step, StepLabel,
    TextField
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SecurityIcon from '@mui/icons-material/Security';
import PersonIcon from '@mui/icons-material/Person';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import LockIcon from '@mui/icons-material/Lock';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import axios from 'axios';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { API_URL } from '../config';
import FingerprintClientService from '../services/fingerprintService';

const AdvanceBiometricAuthDialog = ({
    open,
    onClose,
    invoiceId,
    vehicleNumber,
    driverName,
    driverLicenseNo,
    advanceDetails,
    siteMemberName,
    onAuthorized
}) => {
    const [supported, setSupported] = useState(true);
    const [sessionId, setSessionId] = useState(null);
    const [driverVerified, setDriverVerified] = useState(false);
    const [matchedDriverName, setMatchedDriverName] = useState('');
    const [driverId, setDriverId] = useState('');
    const [siteMemberVerified, setSiteMemberVerified] = useState(false);
    const [authToken, setAuthToken] = useState(null);
    const [loading, setLoading] = useState(false);
    const [activeRole, setActiveRole] = useState(null); // 'driver' | 'site_member' | null
    const [errorMsg, setErrorMsg] = useState(null);

    // New/Temporary Driver Flow State
    const [showTempDriverForm, setShowTempDriverForm] = useState(false);
    const [tempDriverData, setTempDriverData] = useState({
        name: '',
        mobile: '',
        licenseNo: ''
    });
    const [tempDriverEnrolling, setTempDriverEnrolling] = useState(false);

    const {
        loadingAdv = 0,
        dieselLtrs = 0,
        dieselRate = 0,
        dieselAdv = 0,
        totalAdv = 0,
    } = advanceDetails || {};

    const advanceType = (loadingAdv > 0 && dieselLtrs > 0)
        ? 'BOTH'
        : loadingAdv > 0
            ? 'LOADING'
            : 'FUEL';

    // 1. Check Hardware & Initialize Session
    useEffect(() => {
        if (!open) {
            setSessionId(null);
            setDriverVerified(false);
            setMatchedDriverName('');
            setDriverId('');
            setSiteMemberVerified(false);
            setAuthToken(null);
            setLoading(false);
            setActiveRole(null);
            setErrorMsg(null);
            setShowTempDriverForm(false);
            return;
        }

        const checkHardwareAndInit = async () => {
            setErrorMsg(null);
            try {
                // Check if platform authenticator or USB scanner is available
                const hasPlatformAuth = await FingerprintClientService.isPlatformAuthenticatorAvailable();
                setSupported(hasPlatformAuth);

                // Initialize Biometric Authorization Session on server
                const token = localStorage.getItem('token');
                const res = await axios.post(
                    `${API_URL}/advance-auth/initiate`,
                    {
                        invoice_id: invoiceId,
                        vehicle_number: vehicleNumber,
                        driver_name: driverName ? driverName.trim() : 'UNASSIGNED DRIVER',
                        driver_license_no: driverLicenseNo || '',
                        advance_type: advanceType,
                        loading_advance: loadingAdv,
                        diesel_litres: dieselLtrs,
                        diesel_rate: dieselRate,
                        diesel_advance: dieselAdv,
                        total_advance: totalAdv,
                    },
                    { headers: { Authorization: `Bearer ${token}` } }
                );

                if (res.data?.success) {
                    setSessionId(res.data.sessionId);
                    if (res.data.driver_id) setDriverId(res.data.driver_id);
                } else {
                    setErrorMsg('Failed to initialize advance authorization session.');
                }
            } catch (err) {
                console.error('Biometric initialization error:', err);
                setErrorMsg(err.response?.data?.error || err.message || 'Error connecting to authorization service.');
            }
        };

        checkHardwareAndInit();
    }, [open, invoiceId, vehicleNumber, driverName, loadingAdv, dieselLtrs, totalAdv]);

    // 2. Scan Driver Fingerprint (Triggers REAL OS / Hardware Biometric Prompt)
    const handleVerifyDriver = async () => {
        if (!sessionId) return;
        setLoading(true);
        setActiveRole('driver');
        setErrorMsg(null);

        try {
            const token = localStorage.getItem('token');

            // 1. Request cryptographic challenge from server
            const { data: challengeData } = await axios.post(
                `${API_URL}/advance-auth/challenge`,
                { sessionId, role: 'driver' },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            const { options, isRegistration } = challengeData;

            // 2. TRIGGER REAL OS BIOMETRIC SENSOR CEREMONY (Touch ID / Windows Hello / Android / Security Key)
            let response;
            if (isRegistration) {
                response = await startRegistration({ optionsJSON: options });
            } else {
                response = await startAuthentication({ optionsJSON: options });
            }

            // 3. Send back assertion to server for cryptographic signature verification
            const { data: verifyData } = await axios.post(
                `${API_URL}/advance-auth/verify`,
                { sessionId, role: 'driver', response, isRegistration },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            if (verifyData.verified) {
                setDriverVerified(true);
                setMatchedDriverName(driverName);
                if (verifyData.driverId) setDriverId(verifyData.driverId);
                setShowTempDriverForm(false);
            } else {
                setErrorMsg('Driver fingerprint verification failed.');
            }
        } catch (err) {
            console.error('Driver biometric scan error:', err);
            if (err.name === 'NotAllowedError') {
                setErrorMsg('Fingerprint scan was cancelled or timed out. Please place your finger firmly on the sensor.');
            } else if (err.response?.data?.error) {
                const apiError = err.response.data.error;
                setErrorMsg(apiError);
                if (apiError.includes('not found') || apiError.includes('not recognized') || !driverName) {
                    setShowTempDriverForm(true);
                }
            } else {
                setErrorMsg(err.message || 'Driver fingerprint verification failed.');
                setShowTempDriverForm(true);
            }
        } finally {
            setLoading(false);
            setActiveRole(null);
        }
    };

    // 3. Handle Temporary Driver Real Biometric Registration
    const handleEnrollTemporaryDriver = async () => {
        if (!tempDriverData.name.trim()) {
            setErrorMsg('Please enter the temporary driver name.');
            return;
        }

        setTempDriverEnrolling(true);
        setErrorMsg(null);

        try {
            const token = localStorage.getItem('token');

            // 1. Request temporary driver challenge
            const { data: challengeData } = await axios.post(
                `${API_URL}/advance-auth/challenge`,
                { sessionId, role: 'driver' },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            const { options } = challengeData;

            // 2. Trigger real biometric capture for the temporary driver
            const response = await startRegistration({ optionsJSON: options });

            // 3. Verify on server
            const { data: verifyData } = await axios.post(
                `${API_URL}/advance-auth/verify`,
                { sessionId, role: 'driver', response, isRegistration: true },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            if (verifyData.verified) {
                setDriverVerified(true);
                setMatchedDriverName(tempDriverData.name.trim());
                setShowTempDriverForm(false);
            }
        } catch (err) {
            console.error('Temporary driver enrollment error:', err);
            if (err.name === 'NotAllowedError') {
                setErrorMsg('Fingerprint scan was cancelled. Please touch your fingerprint sensor to register.');
            } else {
                setErrorMsg(err.response?.data?.error || err.message || 'Temporary driver biometric registration failed.');
            }
        } finally {
            setTempDriverEnrolling(false);
        }
    };

    // 4. Scan Site / Office Member Fingerprint (Step 2 — Real Biometric Prompt)
    const handleVerifySiteMember = async () => {
        if (!sessionId || !driverVerified) return;
        setLoading(true);
        setActiveRole('site_member');
        setErrorMsg(null);

        try {
            const token = localStorage.getItem('token');

            // 1. Get challenge for site/office member
            const { data: challengeData } = await axios.post(
                `${API_URL}/advance-auth/challenge`,
                { sessionId, role: 'site_member' },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            const { options, isRegistration } = challengeData;

            // 2. TRIGGER REAL OS BIOMETRIC SENSOR CEREMONY
            let response;
            if (isRegistration) {
                response = await startRegistration({ optionsJSON: options });
            } else {
                response = await startAuthentication({ optionsJSON: options });
            }

            // 3. Verify with server
            const { data: verifyData } = await axios.post(
                `${API_URL}/advance-auth/verify`,
                { sessionId, role: 'site_member', response, isRegistration },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            if (verifyData.verified && verifyData.authorization_token) {
                setSiteMemberVerified(true);
                setAuthToken(verifyData.authorization_token);
            } else {
                setErrorMsg('Authorized Member fingerprint verification failed.');
            }
        } catch (err) {
            console.error('Member biometric error:', err);
            if (err.name === 'NotAllowedError') {
                setErrorMsg('Fingerprint scan was cancelled or timed out. Please touch your fingerprint sensor.');
            } else {
                setErrorMsg(err.response?.data?.error || err.message || 'Staff fingerprint verification failed.');
            }
        } finally {
            setLoading(false);
            setActiveRole(null);
        }
    };

    const handleConfirmAuthorization = () => {
        if (authToken && sessionId) {
            onAuthorized({
                authorizationId: sessionId,
                authorizationToken: authToken,
                driverId: driverId || 'DRV-VERIFIED',
                driverName: matchedDriverName || driverName
            });
            onClose();
        }
    };

    const activeStep = (driverVerified && siteMemberVerified) ? 2 : driverVerified ? 1 : 0;

    return (
        <Dialog
            open={open}
            onClose={(e, reason) => {
                if (loading) return; // Prevent closing while scanning
                onClose();
            }}
            maxWidth="sm"
            fullWidth
            PaperProps={{
                sx: {
                    borderRadius: 4,
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                    overflow: 'hidden'
                }
            }}
        >
            {/* Header */}
            <DialogTitle sx={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                color: '#fff',
                px: 3,
                py: 2.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}>
                <Box display="flex" alignItems="center" gap={1.5}>
                    <Box sx={{
                        bgcolor: 'rgba(59, 130, 246, 0.2)',
                        p: 1,
                        borderRadius: 2,
                        display: 'flex',
                        color: '#60a5fa'
                    }}>
                        <FingerprintIcon sx={{ fontSize: 26 }} />
                    </Box>
                    <Box>
                        <Typography variant="h6" fontWeight="800" sx={{ lineHeight: 1.2, letterSpacing: '0.3px' }}>
                            Trip Advance Fingerprint Authorization
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 500 }}>
                            Dual-custody verification required for advance issuance
                        </Typography>
                    </Box>
                </Box>
                <IconButton onClick={onClose} disabled={loading} sx={{ color: '#94a3b8', '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.1)' } }}>
                    <CloseIcon fontSize="small" />
                </IconButton>
            </DialogTitle>

            <DialogContent sx={{ p: 3, bgcolor: '#f8fafc' }}>
                {/* Advance Summary Card */}
                <Paper sx={{
                    p: 2,
                    mb: 3,
                    borderRadius: 3,
                    bgcolor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5}>
                        <Box display="flex" alignItems="center" gap={1}>
                            <LocalShippingIcon sx={{ color: '#64748b', fontSize: 18 }} />
                            <Typography variant="subtitle2" fontWeight="700" color="#1e293b">
                                Vehicle: <span style={{ color: '#2563eb' }}>{vehicleNumber || '—'}</span>
                            </Typography>
                        </Box>
                        <Chip
                            size="small"
                            label={`Total: ₹${Number(totalAdv).toLocaleString('en-IN')}`}
                            sx={{
                                fontWeight: 800,
                                bgcolor: '#eff6ff',
                                color: '#1d4ed8',
                                border: '1px solid #bfdbfe'
                            }}
                        />
                    </Box>

                    <Divider sx={{ my: 1, borderColor: '#f1f5f9' }} />

                    <Box display="flex" justifyContent="space-around" py={0.5}>
                        {loadingAdv > 0 && (
                            <Box textAlign="center">
                                <Typography variant="caption" color="text.secondary" fontWeight="600">
                                    Loading Advance
                                </Typography>
                                <Typography variant="body1" fontWeight="800" color="#0f172a">
                                    ₹{Number(loadingAdv).toLocaleString('en-IN')}
                                </Typography>
                            </Box>
                        )}
                        {dieselLtrs > 0 && (
                            <Box textAlign="center">
                                <Typography variant="caption" color="text.secondary" fontWeight="600">
                                    Fuel Advance
                                </Typography>
                                <Typography variant="body1" fontWeight="800" color="#0f172a">
                                    {dieselLtrs} Ltrs {dieselAdv > 0 ? `(₹${Number(dieselAdv).toLocaleString('en-IN')})` : ''}
                                </Typography>
                            </Box>
                        )}
                    </Box>
                </Paper>

                {/* Hardware Unsupported Warning */}
                {supported === false && (
                    <Alert
                        severity="warning"
                        icon={<WarningAmberIcon />}
                        sx={{ mb: 3, borderRadius: 3, fontWeight: 700 }}
                    >
                        Biometric sensor prompt is ready. Please ensure your device's fingerprint sensor / Touch ID / Windows Hello is enabled.
                    </Alert>
                )}

                {/* Error Banner */}
                {errorMsg && (
                    <Alert
                        severity="error"
                        onClose={() => setErrorMsg(null)}
                        sx={{ mb: 3, borderRadius: 3, fontWeight: 600 }}
                    >
                        {errorMsg}
                    </Alert>
                )}

                {/* Two-Person Stepper */}
                <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 3 }}>
                    <Step completed={driverVerified}>
                        <StepLabel
                            StepIconProps={{
                                sx: {
                                    '&.Mui-completed': { color: '#16a34a' },
                                    '&.Mui-active': { color: '#2563eb' }
                                }
                            }}
                        >
                            <Typography variant="caption" fontWeight="700">1. Assigned Driver</Typography>
                        </StepLabel>
                    </Step>
                    <Step completed={siteMemberVerified}>
                        <StepLabel
                            StepIconProps={{
                                sx: {
                                    '&.Mui-completed': { color: '#16a34a' },
                                    '&.Mui-active': { color: '#2563eb' }
                                }
                            }}
                        >
                            <Typography variant="caption" fontWeight="700">2. Office / Site Member</Typography>
                        </StepLabel>
                    </Step>
                    <Step completed={Boolean(authToken)}>
                        <StepLabel
                            StepIconProps={{
                                sx: {
                                    '&.Mui-completed': { color: '#16a34a' }
                                }
                            }}
                        >
                            <Typography variant="caption" fontWeight="700">3. Authorized</Typography>
                        </StepLabel>
                    </Step>
                </Stepper>

                {/* Step 1: Assigned Driver Biometric Card */}
                <Paper sx={{
                    p: 2.5,
                    mb: 2,
                    borderRadius: 3,
                    bgcolor: '#ffffff',
                    border: driverVerified ? '1.5px solid #86efac' : activeStep === 0 ? '1.5px solid #93c5fd' : '1px solid #e2e8f0',
                    boxShadow: activeStep === 0 ? '0 4px 14px rgba(37, 99, 235, 0.08)' : 'none',
                    transition: 'all 0.2s ease'
                }}>
                    <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                        <Box display="flex" gap={1.5} alignItems="center">
                            <Box sx={{
                                width: 42,
                                height: 42,
                                borderRadius: '50%',
                                bgcolor: driverVerified ? '#dcfce7' : '#eff6ff',
                                color: driverVerified ? '#16a34a' : '#2563eb',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                {driverVerified ? <CheckCircleIcon /> : <PersonIcon />}
                            </Box>
                            <Box>
                                <Typography variant="subtitle2" fontWeight="800" color="#0f172a">
                                    Assigned Driver: {matchedDriverName || driverName || 'Not Set'}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {driverId ? `Driver ID: ${driverId}` : driverLicenseNo ? `DL: ${driverLicenseNo}` : 'Biometric fingerprint verification required'}
                                </Typography>
                            </Box>
                        </Box>
                        {driverVerified ? (
                            <Chip size="small" icon={<CheckCircleIcon />} label="Fingerprint Verified" color="success" sx={{ fontWeight: 700 }} />
                        ) : (
                            <Chip size="small" label="Step 1 Required" sx={{ bgcolor: '#fef3c7', color: '#92400e', fontWeight: 700 }} />
                        )}
                    </Box>

                    {!driverVerified && (
                        <Box mt={2} display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
                            <Button
                                size="small"
                                startIcon={<PersonAddIcon />}
                                onClick={() => setShowTempDriverForm(!showTempDriverForm)}
                                sx={{ textTransform: 'none', fontWeight: 700, color: '#6366f1' }}
                            >
                                {showTempDriverForm ? 'Hide Temporary Driver Form' : 'New / Temporary Driver?'}
                            </Button>

                            <Button
                                variant="contained"
                                startIcon={loading && activeRole === 'driver' ? <CircularProgress size={18} color="inherit" /> : <FingerprintIcon />}
                                onClick={handleVerifyDriver}
                                disabled={loading || !sessionId}
                                sx={{
                                    borderRadius: 2.5,
                                    fontWeight: 700,
                                    textTransform: 'none',
                                    bgcolor: '#2563eb',
                                    '&:hover': { bgcolor: '#1d4ed8' },
                                    px: 2.5
                                }}
                            >
                                {loading && activeRole === 'driver' ? 'Scanning Driver Fingerprint...' : 'Scan Driver Fingerprint'}
                            </Button>
                        </Box>
                    )}

                    {/* Temporary Driver Registration Box */}
                    {showTempDriverForm && !driverVerified && (
                        <Box sx={{
                            mt: 2, p: 2, borderRadius: 2.5,
                            bgcolor: '#f8fafc', border: '1px dashed #cbd5e1'
                        }}>
                            <Typography variant="caption" fontWeight="800" sx={{ color: '#4338ca', display: 'block', mb: 1.5 }}>
                                REGISTER TEMPORARY DRIVER FOR THIS TRIP
                            </Typography>
                            <Box display="grid" gridTemplateColumns="1fr 1fr" gap={1.5} mb={1.5}>
                                <TextField
                                    size="small"
                                    label="Driver Name"
                                    value={tempDriverData.name}
                                    onChange={(e) => setTempDriverData(p => ({ ...p, name: e.target.value }))}
                                />
                                <TextField
                                    size="small"
                                    label="Mobile No."
                                    value={tempDriverData.mobile}
                                    onChange={(e) => setTempDriverData(p => ({ ...p, mobile: e.target.value }))}
                                />
                            </Box>
                            <Box display="flex" justifyContent="flex-end">
                                <Button
                                    variant="contained"
                                    size="small"
                                    startIcon={tempDriverEnrolling ? <CircularProgress size={16} color="inherit" /> : <FingerprintIcon />}
                                    disabled={tempDriverEnrolling || !tempDriverData.name.trim()}
                                    onClick={handleEnrollTemporaryDriver}
                                    sx={{ bgcolor: '#4f46e5', fontWeight: 800, textTransform: 'none', borderRadius: 2 }}
                                >
                                    {tempDriverEnrolling ? 'Waiting for Fingerprint...' : 'Scan & Register Temporary Driver'}
                                </Button>
                            </Box>
                        </Box>
                    )}
                </Paper>

                {/* Step 2: Site/Office Member Biometric Card */}
                <Paper sx={{
                    p: 2.5,
                    mb: 2,
                    borderRadius: 3,
                    bgcolor: '#ffffff',
                    opacity: !driverVerified ? 0.7 : 1,
                    border: siteMemberVerified ? '1.5px solid #86efac' : activeStep === 1 ? '1.5px solid #93c5fd' : '1px solid #e2e8f0',
                    boxShadow: activeStep === 1 ? '0 4px 14px rgba(37, 99, 235, 0.08)' : 'none',
                    transition: 'all 0.2s ease'
                }}>
                    <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                        <Box display="flex" gap={1.5} alignItems="center">
                            <Box sx={{
                                width: 42,
                                height: 42,
                                borderRadius: '50%',
                                bgcolor: siteMemberVerified ? '#dcfce7' : !driverVerified ? '#f1f5f9' : '#eff6ff',
                                color: siteMemberVerified ? '#16a34a' : !driverVerified ? '#94a3b8' : '#2563eb',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                {siteMemberVerified ? <CheckCircleIcon /> : !driverVerified ? <LockIcon /> : <SecurityIcon />}
                            </Box>
                            <Box>
                                <Typography variant="subtitle2" fontWeight="800" color="#0f172a">
                                    Authorized Member: {siteMemberName || 'Staff Member'}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {!driverVerified ? 'Locked until Driver fingerprint is verified' : 'Dual-sign confirmation required'}
                                </Typography>
                            </Box>
                        </Box>
                        {siteMemberVerified ? (
                            <Chip size="small" icon={<CheckCircleIcon />} label="Fingerprint Verified" color="success" sx={{ fontWeight: 700 }} />
                        ) : (
                            <Chip
                                size="small"
                                label={!driverVerified ? 'Locked' : 'Step 2 Ready'}
                                sx={{
                                    bgcolor: !driverVerified ? '#f1f5f9' : '#eff6ff',
                                    color: !driverVerified ? '#64748b' : '#1d4ed8',
                                    fontWeight: 700
                                }}
                            />
                        )}
                    </Box>

                    {driverVerified && !siteMemberVerified && (
                        <Box mt={2} display="flex" justifyContent="flex-end">
                            <Button
                                variant="contained"
                                startIcon={loading && activeRole === 'site_member' ? <CircularProgress size={18} color="inherit" /> : <FingerprintIcon />}
                                onClick={handleVerifySiteMember}
                                disabled={loading || !sessionId}
                                sx={{
                                    borderRadius: 2.5,
                                    fontWeight: 700,
                                    textTransform: 'none',
                                    bgcolor: '#0f172a',
                                    '&:hover': { bgcolor: '#1e293b' },
                                    px: 2.5
                                }}
                            >
                                {loading && activeRole === 'site_member' ? 'Scanning Member Fingerprint...' : 'Scan Member Fingerprint'}
                            </Button>
                        </Box>
                    )}
                </Paper>

                {/* Final Authorized State */}
                {authToken && (
                    <Box sx={{
                        p: 2,
                        borderRadius: 3,
                        bgcolor: '#ecfdf5',
                        border: '1px solid #a7f3d0',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5
                    }}>
                        <CheckCircleIcon sx={{ color: '#059669', fontSize: 28 }} />
                        <Box>
                            <Typography variant="subtitle2" fontWeight="800" color="#065f46">
                                Advance Biometric Authorization Complete
                            </Typography>
                            <Typography variant="caption" color="#047857">
                                Cryptographically signed by Driver ({matchedDriverName || driverName}) & Authorized Member. Token generated and locked to these exact amounts.
                            </Typography>
                        </Box>
                    </Box>
                )}
            </DialogContent>

            <DialogActions sx={{ p: 2.5, bgcolor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                <Button
                    onClick={onClose}
                    disabled={loading}
                    sx={{ textTransform: 'none', fontWeight: 600, color: '#64748b' }}
                >
                    Cancel
                </Button>
                <Button
                    variant="contained"
                    disabled={!authToken || loading}
                    onClick={handleConfirmAuthorization}
                    sx={{
                        borderRadius: 2.5,
                        fontWeight: 800,
                        textTransform: 'none',
                        px: 3,
                        background: authToken
                            ? 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)'
                            : '#94a3b8'
                    }}
                >
                    Authorize & Proceed
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default AdvanceBiometricAuthDialog;
