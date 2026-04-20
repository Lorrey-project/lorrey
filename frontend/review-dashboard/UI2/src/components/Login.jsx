import React, { useState } from 'react';
import {
    Box, Button, TextField, Typography, Paper, Alert, Link, InputAdornment, IconButton,
    ToggleButtonGroup, ToggleButton, CircularProgress
} from '@mui/material';
import EmailIcon from '@mui/icons-material/Email';
import LockIcon from '@mui/icons-material/Lock';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import LoginIcon from '@mui/icons-material/Login';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import { useAuth } from '../context/AuthContext';
import AnimatedBackground from './AnimatedBackground';
import axios from 'axios';
import { startAuthentication } from '@simplewebauthn/browser';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const fieldSx = (accent = '#4285f4') => ({
    '& .MuiOutlinedInput-root': {
        bgcolor: 'rgba(255,255,255,0.05)',
        borderRadius: '14px',
        color: '#fff',
        '& fieldset': { borderColor: 'rgba(255,255,255,0.12)' },
        '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.25)' },
        '&.Mui-focused fieldset': { borderColor: accent, borderWidth: '2px', boxShadow: `0 0 14px ${accent}35` },
        '& input': {
            '&:-webkit-autofill': {
                WebkitBoxShadow: '0 0 0 1000px rgba(10,20,60,0.3) inset !important',
                WebkitTextFillColor: '#fff !important',
            },
        },
    },
    '& .MuiInputLabel-root': {
        color: 'rgba(255,255,255,0.4)',
        '&.Mui-focused': { color: accent },
    },
});

const PUMPS = [
    { id: 'SAS-1', gradient: 'linear-gradient(135deg, #0d47a1 0%, #1565c0 100%)', glow: 'rgba(25,118,210,0.4)', accent: '#60a5fa' },
    { id: 'SAS-2', gradient: 'linear-gradient(135deg, #004d40 0%, #00695c 100%)', glow: 'rgba(0,137,123,0.4)', accent: '#34d399' },
];

function PumpPanel({ pump, onToggle }) {
    const { login, loginWithToken } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const user = await login(email, password, 'PETROL PUMP');
            if (user.pumpName && user.pumpName !== pump.id) {
                setError(`This account belongs to ${user.pumpName}, not ${pump.id}.`);
                localStorage.removeItem('token');
                localStorage.removeItem('user');
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Invalid credentials.');
        } finally {
            setLoading(false);
        }
    };

    const handleBiometricLogin = async () => {
        if (!window.PublicKeyCredential) {
            setError('Biometrics are not natively supported or are blocked in this environment.');
            return;
        }
        if (!email) {
            setError('Please enter your email to use FaceID/TouchID.');
            return;
        }
        setError('');
        setLoading(true);
        try {
            const optRes = await axios.post(`${API_URL}/auth/generate-authentication-options`, { email });
            let asseResp;
            try { asseResp = await startAuthentication({ optionsJSON: optRes.data }); }
            catch (err) { setError('Biometric login cancelled.'); setLoading(false); return; }

            const verifyRes = await axios.post(`${API_URL}/auth/verify-authentication`, { email, body: asseResp, role: 'PETROL PUMP' });
            if (verifyRes.data.verified) {
                const user = verifyRes.data.user;
                if (user.pumpName && user.pumpName !== pump.id) {
                    setError(`This account belongs to ${user.pumpName}, not ${pump.id}.`);
                    setLoading(false);
                    return;
                }
                loginWithToken(verifyRes.data.token, user);
            } else setError('Biometric verification failed.');
        } catch (err) { setError(err.response?.data?.error || err.response?.data?.message || 'Biometric login error.'); }
        finally { setLoading(false); }
    };

    return (
        <Box sx={{
            flex: 1,
            background: pump.gradient,
            borderRadius: '20px',
            border: '1px solid rgba(255,255,255,0.12)',
            boxShadow: `0 16px 48px ${pump.glow}`,
            p: 3,
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            overflow: 'hidden',
            transition: 'transform 0.2s, box-shadow 0.2s',
            '&:hover': { transform: 'translateY(-3px)', boxShadow: `0 24px 64px ${pump.glow}` },
        }}>
            <Box sx={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.05)' }} />

            <Box display="flex" alignItems="center" gap={1.5} mb={2.5}>
                <Box sx={{ p: 1, bgcolor: 'rgba(255,255,255,0.15)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.2)' }}>
                    <LocalGasStationIcon sx={{ fontSize: 22, color: '#fff' }} />
                </Box>
                <Box>
                    <Typography variant="subtitle1" fontWeight={900} sx={{ color: '#fff', lineHeight: 1.2 }}>{pump.id}</Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>Pump Admin Portal</Typography>
                </Box>
                <Box sx={{
                    ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.6,
                    bgcolor: 'rgba(255,255,255,0.1)', borderRadius: '8px', px: 1, py: 0.3,
                }}>
                    <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: pump.accent, boxShadow: `0 0 5px ${pump.accent}` }} />
                    <Typography variant="caption" fontWeight={800} sx={{ color: pump.accent, fontSize: 9, letterSpacing: 0.5 }}>LIVE</Typography>
                </Box>
            </Box>

            <Box sx={{ height: '1px', bgcolor: 'rgba(255,255,255,0.1)', mb: 2 }} />

            {error && (
                <Alert severity="error" sx={{ mb: 2, borderRadius: '10px', bgcolor: 'rgba(211,47,47,0.15)', color: '#fca5a5', border: '1px solid rgba(211,47,47,0.2)', fontSize: 12, py: 0.5 }}>
                    {error}
                </Alert>
            )}

            <form onSubmit={handleSubmit} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <TextField
                    label="Email" type="email" fullWidth required size="small"
                    value={email} onChange={e => setEmail(e.target.value)}
                    autoComplete="new-password" sx={fieldSx(pump.accent)}
                    InputProps={{ startAdornment: <InputAdornment position="start"><EmailIcon sx={{ color: pump.accent, fontSize: 18, mr: 0.5 }} /></InputAdornment> }}
                />
                <TextField
                    label="Password" type={showPass ? 'text' : 'password'} fullWidth required size="small"
                    value={password} onChange={e => setPassword(e.target.value)}
                    autoComplete="new-password" sx={fieldSx(pump.accent)}
                    InputProps={{
                        startAdornment: <InputAdornment position="start"><LockIcon sx={{ color: pump.accent, fontSize: 18, mr: 0.5 }} /></InputAdornment>,
                        endAdornment: (
                            <InputAdornment position="end">
                                <IconButton onClick={() => setShowPass(!showPass)} edge="end" size="small" sx={{ color: 'rgba(255,255,255,0.3)' }}>
                                    {showPass ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                                </IconButton>
                            </InputAdornment>
                        ),
                    }}
                />
                <Button
                    type="submit" variant="contained" fullWidth disabled={loading}
                    startIcon={loading ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : <LoginIcon sx={{ fontSize: 18 }} />}
                    sx={{
                        py: 1.4, borderRadius: '12px', fontWeight: 900, fontSize: 14, mt: 0.5,
                        bgcolor: 'rgba(255,255,255,0.18)', color: '#fff',
                        border: '1px solid rgba(255,255,255,0.25)', boxShadow: 'none',
                        '&:hover': { bgcolor: 'rgba(255,255,255,0.28)', boxShadow: '0 6px 20px rgba(0,0,0,0.25)', transform: 'translateY(-1px)' },
                        transition: 'all 0.2s',
                    }}
                >
                    {loading ? 'Signing in...' : `Sign In — ${pump.id}`}
                </Button>
                <Button
                    variant="outlined" fullWidth disabled={loading} onClick={handleBiometricLogin}
                    startIcon={<FingerprintIcon sx={{ fontSize: 18 }} />}
                    sx={{
                        py: 1, borderRadius: '12px', fontWeight: 800, fontSize: 13,
                        color: pump.accent, borderColor: pump.accent,
                        boxShadow: 'none', '&:hover': { bgcolor: `rgba(255,255,255,0.05)`, borderColor: pump.accent },
                        transition: 'all 0.2s',
                    }}
                >
                    Biometric Unlock
                </Button>
            </form>

            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', mt: 2, display: 'block' }}>
                No account?{' '}
                <Box component="span" onClick={onToggle}
                    sx={{ color: pump.accent, fontWeight: 800, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}>
                    Create one
                </Box>
            </Typography>
        </Box>
    );
}

const PORTAL_LABELS = {
    HEAD_OFFICE: { title: 'Office Workspace', subtitle: 'office', badge: 'OFFICE ADMIN' },
    OFFICE: { title: 'Site Workspace', subtitle: 'site', badge: 'SITE ADMIN' },
    'PETROL PUMP': { title: 'Pump Workspace', subtitle: 'pump', badge: 'PUMP ADMIN' },
};

const Login = ({ onToggle, lockedPortal = null }) => {
    const { login, loginWithToken } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [portal, setPortal] = useState(lockedPortal || 'HEAD_OFFICE');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const isPump = portal === 'PETROL PUMP';
    const portalInfo = PORTAL_LABELS[portal] || PORTAL_LABELS.HEAD_OFFICE;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await login(email, password, portal);
        } catch (err) {
            setError(err.response?.data?.message || 'Invalid credentials. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleBiometricLogin = async () => {
        if (!window.PublicKeyCredential) {
            setError('Biometrics are not natively supported or are blocked in this environment.');
            return;
        }
        if (!email) {
            setError('Please enter your email Address to use FaceID/TouchID.');
            return;
        }
        setError('');
        setLoading(true);
        try {
            const optRes = await axios.post(`${API_URL}/auth/generate-authentication-options`, { email });
            let asseResp;
            try { asseResp = await startAuthentication({ optionsJSON: optRes.data }); }
            catch (err) { setError('Biometric login cancelled or failed.'); setLoading(false); return; }

            const verifyRes = await axios.post(`${API_URL}/auth/verify-authentication`, { 
                email, body: asseResp, role: portal 
            });

            if (verifyRes.data.verified) {
                loginWithToken(verifyRes.data.token, verifyRes.data.user);
            } else { setError('Biometric verification failed.'); }
        } catch (err) { setError(err.response?.data?.error || err.response?.data?.message || 'Biometric login error.'); }
        finally { setLoading(false); }
    };

    return (
        <AnimatedBackground>
            <Box sx={{ width: '100%', maxWidth: isPump ? 860 : 440, px: 2, transition: 'max-width 0.4s ease' }}>
                <Box textAlign="center" mb={5}>
                    <Box sx={{
                        width: 64, height: 64, borderRadius: '20px',
                        background: 'linear-gradient(135deg, #1a73e8 0%, #0d47a1 100%)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', mb: 2.5,
                        boxShadow: '0 12px 30px rgba(26,115,232,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                    }}>
                        <Typography sx={{ color: '#fff', fontWeight: 900, fontSize: 28 }}>D</Typography>
                    </Box>
                    <Typography variant="h4" fontWeight={900} sx={{ color: '#fff', letterSpacing: '-1px', textShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
                        DIPALI ASSOCIATES &amp; CO
                    </Typography>
                    <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.6)', mt: 1, fontWeight: 500 }}>
                        Premium Slip &amp; Invoice Portal
                    </Typography>
                </Box>

                <Paper elevation={0} sx={{
                    p: { xs: 3, sm: isPump ? 4 : 5 },
                    borderRadius: '32px',
                    backgroundColor: 'rgba(255,255,255,0.04)',
                    backdropFilter: 'blur(30px) saturate(180%)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    boxShadow: '0 24px 80px rgba(0,0,0,0.4)',
                    overflow: 'hidden', position: 'relative',
                    transition: 'all 0.4s ease',
                    '&::before': {
                        content: '""', position: 'absolute',
                        top: 0, left: 0, right: 0, height: '2px',
                        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
                    },
                }}>
                    {/* Portal toggle — only visible when not locked to a specific portal */}
                    {!lockedPortal && (
                        <Box display="flex" justifyContent="center" mb={isPump ? 3 : 4}>
                            <ToggleButtonGroup
                                value={portal} exclusive fullWidth
                                onChange={(e, val) => { if (val) { setPortal(val); setError(''); } }}
                                sx={{
                                    bgcolor: 'rgba(255,255,255,0.05)', p: 0.5,
                                    borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)',
                                    '& .MuiToggleButton-root': {
                                        color: 'rgba(255,255,255,0.5)', borderRadius: '12px !important',
                                        border: 'none', fontWeight: 800, py: 1.5, fontSize: 12,
                                        '&.Mui-selected': { bgcolor: 'rgba(66,133,244,0.4)', color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' },
                                    },
                                }}
                            >
                                <ToggleButton value="HEAD_OFFICE">OFFICE ADMIN</ToggleButton>
                                <ToggleButton value="OFFICE">SITE ADMIN</ToggleButton>
                                <ToggleButton value="PETROL PUMP">PUMP ADMIN</ToggleButton>
                            </ToggleButtonGroup>
                        </Box>
                    )}

                    {/* Locked-portal badge */}
                    {lockedPortal && (
                        <Box display="flex" justifyContent="center" mb={3}>
                            <Box sx={{
                                px: 3, py: 1.2, borderRadius: '14px',
                                bgcolor: 'rgba(66,133,244,0.2)', border: '1px solid rgba(66,133,244,0.35)',
                                display: 'inline-flex', alignItems: 'center', gap: 1,
                            }}>
                                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#4285f4', boxShadow: '0 0 8px #4285f4' }} />
                                <Typography sx={{ color: '#fff', fontWeight: 900, fontSize: 13, letterSpacing: 1 }}>
                                    {portalInfo.badge}
                                </Typography>
                            </Box>
                        </Box>
                    )}

                    {isPump ? (
                        <Box>
                            <Typography variant="body2" fontWeight={700}
                                sx={{ color: 'rgba(255,255,255,0.45)', textAlign: 'center', mb: 3, letterSpacing: 0.5 }}>
                                Select your pump portal to sign in
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 2.5, flexDirection: { xs: 'column', sm: 'row' } }}>
                                {PUMPS.map(p => <PumpPanel key={p.id} pump={p} onToggle={onToggle} />)}
                            </Box>
                        </Box>
                    ) : (
                        <>
                            <Typography variant="h5" fontWeight={900} sx={{ color: '#fff', mb: 1, letterSpacing: '-0.5px' }}>
                                {portalInfo.title}
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', mb: 4, fontWeight: 500 }}>
                                Sign in to your secure {portalInfo.subtitle} portal
                            </Typography>

                            {error && <Alert severity="error" sx={{ mb: 3, borderRadius: '16px', bgcolor: 'rgba(211,47,47,0.15)', color: '#ff8a80', border: '1px solid rgba(211,47,47,0.2)' }}>{error}</Alert>}

                            <form onSubmit={handleSubmit} autoComplete="off">
                                <TextField
                                    label="Email Address" variant="outlined" fullWidth
                                    autoComplete="new-password" type="email" required
                                    sx={{ mb: 3, ...fieldSx() }}
                                    value={email} onChange={e => setEmail(e.target.value)}
                                    InputProps={{ startAdornment: <InputAdornment position="start"><EmailIcon sx={{ color: '#4285f4', mr: 1, fontSize: 20 }} /></InputAdornment> }}
                                />
                                <TextField
                                    label="Password" variant="outlined" fullWidth
                                    autoComplete="new-password" required
                                    type={showPass ? 'text' : 'password'}
                                    sx={{ mb: 4, ...fieldSx() }}
                                    value={password} onChange={e => setPassword(e.target.value)}
                                    InputProps={{
                                        startAdornment: <InputAdornment position="start"><LockIcon sx={{ color: '#4285f4', mr: 1, fontSize: 20 }} /></InputAdornment>,
                                        endAdornment: (
                                            <InputAdornment position="end">
                                                <IconButton onClick={() => setShowPass(!showPass)} edge="end" sx={{ color: 'rgba(255,255,255,0.3)', mr: 0.5 }}>
                                                    {showPass ? <VisibilityOffIcon /> : <VisibilityIcon />}
                                                </IconButton>
                                            </InputAdornment>
                                        ),
                                    }}
                                />
                                <Button
                                    type="submit" variant="contained" fullWidth size="large"
                                    disabled={loading} startIcon={<LoginIcon />}
                                    sx={{
                                        py: 2, borderRadius: '16px', fontWeight: 900, fontSize: 16,
                                        background: 'linear-gradient(45deg, #1a73e8 30%, #4285f4 90%)',
                                        boxShadow: '0 12px 30px rgba(26,115,232,0.4)',
                                        '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 15px 35px rgba(26,115,232,0.5)' },
                                        transition: 'all 0.3s ease',
                                    }}
                                >
                                    {loading ? 'Verifying...' : 'Sign In Now'}
                                </Button>
                                <Button
                                    variant="outlined" fullWidth size="large" disabled={loading} onClick={handleBiometricLogin}
                                    startIcon={<FingerprintIcon />}
                                    sx={{
                                        py: 1.5, mt: 2, borderRadius: '16px', fontWeight: 800, fontSize: 15,
                                        color: '#4285f4', borderColor: '#4285f4',
                                        boxShadow: 'none', '&:hover': { bgcolor: `rgba(66,133,244,0.1)`, borderColor: '#4285f4' },
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    Login with Biometrics
                                </Button>
                            </form>

                            <Box textAlign="center" mt={4}>
                                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>
                                    New to the portal?{' '}
                                    <Link component="button" onClick={onToggle}
                                        sx={{ color: '#4285f4', fontWeight: 800, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
                                        Create Account
                                    </Link>
                                </Typography>
                            </Box>
                        </>
                    )}
                </Paper>

                <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mt: 4, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.5px' }}>
                    © 2026 DIPALI ASSOCIATES &amp; CO. ALL RIGHTS RESERVED.
                </Typography>
            </Box>
        </AnimatedBackground>
    );
};

export default Login;
