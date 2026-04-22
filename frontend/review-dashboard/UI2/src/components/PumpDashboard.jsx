import React, { useState } from 'react';
import { Box, Typography, Container, Card, CardContent, Button, Snackbar, Alert } from '@mui/material';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import LogoutIcon from '@mui/icons-material/Logout';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { startRegistration } from '@simplewebauthn/browser';
import PumpPaymentDetails from '../pages/PumpPaymentDetails';

const PumpDashboard = () => {
    const { user, logout } = useAuth();
    const [showPayment, setShowPayment] = useState(false);
    const [snack, setSnack] = useState(null); // Hook must be placed before early returns

    if (showPayment) {
        return <PumpPaymentDetails onBack={() => setShowPayment(false)} lockedPump={user?.pumpName || null} />;
    }

    const handleRegisterBiometrics = async () => {
        if (!window.PublicKeyCredential) {
            setSnack({ sev: 'error', msg: 'Biometrics are not natively supported or are blocked in this environment.' });
            return;
        }
        try {
            const token = localStorage.getItem('token');
            const optRes = await axios.get(`${import.meta.env.VITE_API_URL || '/api'}/auth/generate-registration-options`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            let attResp;
            try { attResp = await startRegistration({ optionsJSON: optRes.data }); }
            catch (error) {
                setSnack({ msg: error.name === 'InvalidStateError' ? 'This device is already registered.' : error.message, sev: 'error' });
                return;
            }

            const verifyRes = await axios.post(`${import.meta.env.VITE_API_URL || '/api'}/auth/verify-registration`, attResp, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (verifyRes.data.verified) setSnack({ msg: 'Biometrics successfully registered!', sev: 'success' });
            else setSnack({ msg: 'Registration verification failed', sev: 'error' });
        } catch (e) {
            setSnack({ msg: e.response?.data?.error || e.message, sev: 'error' });
        }
    };

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: '#f4f7f9', pb: 10 }}>
            <Container maxWidth="xl" sx={{ pt: { xs: 2, md: 4 }, px: { xs: 1, sm: 2, md: 3 } }}>

                {/* ── Header ─────────────────────────────────────────────────────────────── */}
                <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={4}
                    sx={{ flexDirection: { xs: 'column', md: 'row' }, gap: { xs: 3, md: 2 } }}>
                    <Box sx={{ width: { xs: '100%', md: 'auto' } }}>
                        <Typography variant="h3" fontWeight="900" color="primary"
                            sx={{ letterSpacing: '-1.5px', fontSize: { xs: '2rem', sm: '2.4rem', md: '2.8rem' }, textAlign: { xs: 'center', md: 'left' } }}>
                            DIPALI ASSOCIATES &amp; CO
                        </Typography>
                        <Typography variant="subtitle1" color="text.secondary" fontWeight="500"
                            sx={{ textAlign: { xs: 'center', md: 'left' }, opacity: 0.8 }}>
                            Premium Slip &amp; Invoice Management Portal [ROLE: {user?.role || 'NONE'}]
                        </Typography>
                        {user?.pumpName && (
                            <Box display="inline-flex" alignItems="center" gap={1} mt={1}
                                sx={{
                                    bgcolor: 'rgba(2,132,199,0.1)', border: '1px solid rgba(2,132,199,0.3)',
                                    borderRadius: '10px', px: 2, py: 0.6,
                                }}>
                                <LocalGasStationIcon sx={{ fontSize: 16, color: '#0284c7' }} />
                                <Typography variant="caption" fontWeight={900} sx={{ color: '#0284c7', letterSpacing: 0.5 }}>
                                    {user.pumpName} PUMP ADMIN
                                </Typography>
                            </Box>
                        )}
                    </Box>
                    <Box display="flex" gap={2}
                        sx={{ width: { xs: '100%', md: 'auto' }, justifyContent: { xs: 'center', md: 'flex-end' } }}>
                        <Button variant="outlined" color="primary" startIcon={<FingerprintIcon />} onClick={handleRegisterBiometrics}
                            sx={{ borderRadius: '12px', px: { xs: 2.5, sm: 3 }, fontWeight: 700, flex: { xs: 1, md: 'none' }, bgcolor: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(10px)' }}>
                            Register Biometrics
                        </Button>
                        <Button variant="outlined" color="error" startIcon={<LogoutIcon />} onClick={logout}
                            sx={{ borderRadius: '12px', px: { xs: 2.5, sm: 3 }, fontWeight: 700, flex: { xs: 1, md: 'none' }, bgcolor: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(10px)' }}>
                            Logout
                        </Button>
                    </Box>
                </Box>

                {/* ── Pump Payment Details Card (full width) ───────────────────────────── */}
                <Box maxWidth="520px">
                    <Card sx={{
                        borderRadius: '20px',
                        background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                        color: '#fff',
                        boxShadow: '0 16px 40px rgba(2,132,199,0.3)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        overflow: 'hidden',
                        position: 'relative',
                    }}>
                        <Box sx={{
                            position: 'absolute', top: -20, right: -20,
                            width: 100, height: 100, borderRadius: '50%',
                            bgcolor: 'rgba(255,255,255,0.06)',
                        }} />
                        <CardContent sx={{ p: 4, display: 'flex', flexDirection: 'column' }}>
                            <Box display="flex" alignItems="center" gap={1.5} mb={3}>
                                <Box sx={{ p: 1.5, bgcolor: 'rgba(255,255,255,0.15)', borderRadius: '10px' }}>
                                    <ReceiptLongIcon sx={{ fontSize: 28 }} />
                                </Box>
                                <Box>
                                    <Typography variant="h6" fontWeight={900} sx={{ letterSpacing: 0.5, textTransform: 'uppercase' }}>
                                        PUMP PAYMENT DETAILS
                                    </Typography>
                                    <Typography variant="body2" sx={{ opacity: 0.8 }}>
                                        View and manage fuel bills mapped to your pump
                                    </Typography>
                                </Box>
                            </Box>

                            <Typography variant="body1" sx={{ opacity: 0.8, mb: 3 }}>
                                Access the complete billing history, organized in 10-day intervals, verify slip details, and upload payment proofs natively.
                            </Typography>

                            <Button
                                fullWidth variant="contained"
                                startIcon={<ReceiptLongIcon sx={{ fontSize: 18 }} />}
                                onClick={() => setShowPayment(true)}
                                sx={{
                                    borderRadius: '12px', py: 1.5, fontWeight: 800,
                                    bgcolor: 'rgba(255,255,255,0.2)', color: '#fff',
                                    boxShadow: 'none',
                                    '&:hover': { bgcolor: 'rgba(255,255,255,0.3)', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' },
                                    transition: 'all 0.2s',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                }}
                            >
                                Open Billing Sheet
                            </Button>
                        </CardContent>
                    </Card>
                </Box>

            </Container>
            <Snackbar
                open={!!snack} autoHideDuration={4000} onClose={() => setSnack(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                {snack && <Alert severity={snack.sev} variant="filled">{snack.msg}</Alert>}
            </Snackbar>
        </Box>
    );
};

export default PumpDashboard;
