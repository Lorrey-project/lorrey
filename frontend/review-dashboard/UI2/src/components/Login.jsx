import React, { useState } from 'react';
import {
    Box, Button, TextField, Typography, Alert, InputAdornment, IconButton,
    CircularProgress, Chip
} from '@mui/material';
import EmailIcon from '@mui/icons-material/Email';
import LockIcon from '@mui/icons-material/Lock';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import BusinessIcon from '@mui/icons-material/Business';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:3000`;

// Single brand blue — used everywhere, no accent color changes
const BLUE = '#4285f4';
const BLUE_GLOW = 'rgba(66,133,244,0.4)';

const inputSx = {
    '& .MuiOutlinedInput-root': {
        bgcolor: 'rgba(255,255,255,0.07)',
        borderRadius: '14px',
        color: '#fff',
        fontSize: 15,
        '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
        '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.25)' },
        '&.Mui-focused fieldset': { borderColor: BLUE, borderWidth: '1.5px' },
        '& input': {
            py: '13px',
            '&:-webkit-autofill': {
                WebkitBoxShadow: '0 0 0 1000px #1c1c1e inset !important',
                WebkitTextFillColor: '#fff !important',
            },
        },
    },
    '& .MuiInputLabel-root': {
        color: 'rgba(255,255,255,0.35)',
        fontSize: 14,
        '&.Mui-focused': { color: BLUE },
    },
};

const PORTALS = [
    { id: 'HEAD_OFFICE', label: 'Office', icon: <BusinessIcon sx={{ fontSize: 15 }} /> },
    { id: 'OFFICE', label: 'Site', icon: <LocationOnIcon sx={{ fontSize: 15 }} /> },
    { id: 'PETROL PUMP', label: 'Pump', icon: <LocalGasStationIcon sx={{ fontSize: 15 }} /> },
];

const PUMPS = ['SAS-1', 'SAS-2'];

const Login = ({ onToggle, lockedPortal = null, lockedPump = null }) => {
    const { login, loginWithPasskey } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [portal, setPortal] = useState(lockedPortal || 'HEAD_OFFICE');
    const [pumpId, setPumpId] = useState(lockedPump || 'SAS-1');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const isPump = portal === 'PETROL PUMP';

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const user = await login(email, password, portal);
            if (isPump && user.pumpName && user.pumpName !== pumpId) {
                setError(`This account belongs to ${user.pumpName}, not ${pumpId}.`);
                localStorage.removeItem('token');
                localStorage.removeItem('user');
            }
        } catch (err) {
            setError(err.response?.data?.message || (err.message === 'Network Error' ? 'Backend is unreachable. Please make sure the server is running on HTTP.' : err.message) || 'Invalid credentials. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleBiometricLogin = async () => {
        if (!window.PublicKeyCredential) { setError('Biometrics not supported in this environment.'); return; }
        if (!email) { setError('Enter your email to use Face ID / Fingerprint.'); return; }
        setError(''); setLoading(true);
        try {
            const user = await loginWithPasskey(email, portal);
            if (isPump && user?.pumpName && user.pumpName !== pumpId) {
                setError(`This account belongs to ${user.pumpName}, not ${pumpId}.`);
            }
        } catch (err) {
            const msg = err.message || '';
            if (msg.toLowerCase().includes('invalid domain') || msg.toLowerCase().includes('rpid')) {
                setError('Biometrics require a domain name. Please register your passkey first via localhost, then use it here.');
            } else if (msg.toLowerCase().includes('not registered') || msg.toLowerCase().includes('unregistered')) {
                setError('No biometric registered. Sign in with password first, then register your Face ID in settings.');
            } else {
                setError(msg || 'Biometric login failed. Please use email & password.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box sx={{
            minHeight: '100dvh', bgcolor: '#0a0a0a',
            display: 'flex', flexDirection: 'column',
            fontFamily: `'Inter', 'SF Pro Display', system-ui, sans-serif`,
            overflow: 'hidden',
        }}>
            {/* ── HERO ───────────────────────────────────────── */}
            <Box sx={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                px: 3, pt: 6, pb: 2, position: 'relative',
            }}>
                {/* Static blue glow — no color change */}
                <Box sx={{
                    position: 'absolute', width: 240, height: 240, borderRadius: '50%',
                    background: `radial-gradient(circle, ${BLUE_GLOW} 0%, transparent 70%)`,
                    top: '5%', left: '50%', transform: 'translateX(-50%)',
                    pointerEvents: 'none',
                }} />

                {/* Logo: DAC */}
                <Box sx={{
                    width: 56, height: 56, borderRadius: '18px',
                    background: `linear-gradient(135deg, #1a56db 0%, ${BLUE} 100%)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    mb: 2.5, boxShadow: `0 12px 32px ${BLUE_GLOW}`,
                }}>
                    <Typography sx={{ color: '#fff', fontWeight: 900, fontSize: 16, letterSpacing: 0.5 }}>DAC</Typography>
                </Box>

                <Typography sx={{
                    color: '#fff', fontWeight: 800, fontSize: { xs: 18, sm: 22 },
                    letterSpacing: '-0.5px', textAlign: 'center',
                }}>
                    DIPALI ASSOCIATES & CO.
                </Typography>
                <Typography sx={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, mt: 0.5, letterSpacing: 1 }}>
                    {lockedPump ? `${lockedPump} — PUMP PORTAL` : lockedPortal === 'OFFICE' ? 'SITE ADMIN PORTAL' : 'OFFICE / ADMIN PORTAL'}
                </Typography>
            </Box>

            {/* ── BOTTOM CARD ─────────────────────────────────── */}
            <Box sx={{
                bgcolor: '#1c1c1e',
                borderRadius: { xs: '28px 28px 0 0', sm: '28px' },
                p: { xs: '28px 20px 36px', sm: '32px 28px' },
                mx: { sm: 'auto' },
                width: { sm: '100%' },
                maxWidth: { sm: 420 },
                mb: { sm: 4 },
                boxShadow: '0 -8px 40px rgba(0,0,0,0.6)',
                border: '1px solid rgba(255,255,255,0.07)',
            }}>
                {/* Drag handle */}
                <Box sx={{
                    width: 36, height: 4, borderRadius: 2,
                    bgcolor: 'rgba(255,255,255,0.15)', mx: 'auto', mb: 3,
                    display: { sm: 'none' },
                }} />

                {/* Portal Tabs */}
                {!lockedPortal && (
                    <Box sx={{
                        display: 'flex', gap: 1, mb: 3,
                        bgcolor: 'rgba(255,255,255,0.05)',
                        borderRadius: '14px', p: '4px',
                    }}>
                        {PORTALS.map(p => (
                            <Box key={p.id} onClick={() => { setPortal(p.id); setError(''); }}
                                sx={{
                                    flex: 1, display: 'flex', flexDirection: 'column',
                                    alignItems: 'center', gap: 0.4,
                                    py: '8px', borderRadius: '10px', cursor: 'pointer',
                                    bgcolor: portal === p.id ? 'rgba(66,133,244,0.15)' : 'transparent',
                                    border: portal === p.id ? `1px solid rgba(66,133,244,0.4)` : '1px solid transparent',
                                    transition: 'all 0.2s',
                                }}>
                                <Box sx={{ color: portal === p.id ? BLUE : 'rgba(255,255,255,0.35)' }}>
                                    {p.icon}
                                </Box>
                                <Typography sx={{
                                    fontSize: 10, fontWeight: portal === p.id ? 800 : 500,
                                    color: portal === p.id ? BLUE : 'rgba(255,255,255,0.35)',
                                    letterSpacing: 0.3,
                                }}>
                                    {p.label}
                                </Typography>
                            </Box>
                        ))}
                    </Box>
                )}

                {/* Locked badge */}
                {lockedPortal && (
                    <Chip
                        icon={lockedPump ? <LocalGasStationIcon sx={{ fontSize: 13, color: `${BLUE} !important` }} /> : undefined}
                        label={lockedPump ? `${lockedPump} — PUMP PORTAL` : (PORTALS.find(p => p.id === lockedPortal)?.label?.toUpperCase() + ' ADMIN')}
                        size="small"
                        sx={{
                            mb: 2.5, bgcolor: 'rgba(66,133,244,0.15)', color: BLUE,
                            fontWeight: 800, fontSize: 10, letterSpacing: 1,
                            border: `1px solid rgba(66,133,244,0.35)`,
                        }}
                    />
                )}

                {/* Pump sub-selector — hidden when pump is locked to a specific one */}
                {isPump && !lockedPump && (
                    <Box sx={{ display: 'flex', gap: 1.5, mb: 3 }}>
                        {PUMPS.map(p => (
                            <Box key={p} onClick={() => setPumpId(p)}
                                sx={{
                                    flex: 1, py: 1.5, borderRadius: '12px', textAlign: 'center',
                                    bgcolor: pumpId === p ? 'rgba(66,133,244,0.15)' : 'rgba(255,255,255,0.04)',
                                    border: pumpId === p ? `1.5px solid ${BLUE}` : '1.5px solid rgba(255,255,255,0.08)',
                                    cursor: 'pointer', transition: 'all 0.2s',
                                }}>
                                <LocalGasStationIcon sx={{ fontSize: 16, color: BLUE, mb: 0.3 }} />
                                <Typography sx={{ color: pumpId === p ? BLUE : 'rgba(255,255,255,0.4)', fontWeight: 800, fontSize: 12 }}>
                                    {p}
                                </Typography>
                            </Box>
                        ))}
                    </Box>
                )}

                {/* Heading */}
                <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: 17, mb: 0.5 }}>
                    {isPump ? `${pumpId} — Sign in` : 'Welcome back'}
                </Typography>
                <Typography sx={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, mb: 2.5 }}>
                    {isPump ? 'Pump Admin Portal' : `${PORTALS.find(p => p.id === portal)?.label} Admin — Secure Access`}
                </Typography>

                {/* Error */}
                {error && (
                    <Alert severity="error" sx={{
                        mb: 2, borderRadius: '12px', py: 0.5, fontSize: 12,
                        bgcolor: 'rgba(239,68,68,0.1)', color: '#fca5a5',
                        border: '1px solid rgba(239,68,68,0.2)',
                        '& .MuiAlert-icon': { color: '#fca5a5', fontSize: 16 },
                    }}>
                        {error}
                    </Alert>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <TextField
                        label="Email" type="email" fullWidth required size="small"
                        value={email} onChange={e => setEmail(e.target.value)}
                        autoComplete="new-password" sx={inputSx}
                        InputProps={{ startAdornment: <InputAdornment position="start"><EmailIcon sx={{ color: 'rgba(255,255,255,0.25)', fontSize: 17, mr: 0.5 }} /></InputAdornment> }}
                    />
                    <TextField
                        label="Password" fullWidth required size="small"
                        type={showPass ? 'text' : 'password'}
                        value={password} onChange={e => setPassword(e.target.value)}
                        autoComplete="new-password" sx={inputSx}
                        InputProps={{
                            startAdornment: <InputAdornment position="start"><LockIcon sx={{ color: 'rgba(255,255,255,0.25)', fontSize: 17, mr: 0.5 }} /></InputAdornment>,
                            endAdornment: (
                                <InputAdornment position="end">
                                    <IconButton size="small" onClick={() => setShowPass(!showPass)} edge="end" sx={{ color: 'rgba(255,255,255,0.25)', mr: -0.5 }}>
                                        {showPass ? <VisibilityOffIcon sx={{ fontSize: 17 }} /> : <VisibilityIcon sx={{ fontSize: 17 }} />}
                                    </IconButton>
                                </InputAdornment>
                            ),
                        }}
                    />

                    <Button
                        type="submit" variant="contained" fullWidth disabled={loading}
                        endIcon={loading ? <CircularProgress size={15} sx={{ color: '#fff' }} /> : <ArrowForwardIcon sx={{ fontSize: 18 }} />}
                        sx={{
                            mt: 0.5, py: '13px', borderRadius: '14px',
                            background: `linear-gradient(135deg, #1a56db 0%, ${BLUE} 100%)`,
                            color: '#fff', fontWeight: 900, fontSize: 14, letterSpacing: 0.3,
                            boxShadow: `0 8px 24px ${BLUE_GLOW}`,
                            transition: 'all 0.25s ease',
                            '&:hover': { opacity: 0.9, transform: 'translateY(-1px)', boxShadow: `0 12px 28px ${BLUE_GLOW}` },
                            '&:disabled': { bgcolor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)', boxShadow: 'none' },
                        }}
                    >
                        {loading ? 'Signing in…' : 'Sign In'}
                    </Button>

                    <Button
                        variant="text" fullWidth disabled={loading}
                        onClick={handleBiometricLogin}
                        startIcon={<FingerprintIcon sx={{ fontSize: 18 }} />}
                        sx={{
                            py: '10px', borderRadius: '14px',
                            color: 'rgba(255,255,255,0.4)', fontWeight: 700, fontSize: 13,
                            bgcolor: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.07)',
                            '&:hover': { bgcolor: 'rgba(66,133,244,0.08)', color: BLUE, borderColor: 'rgba(66,133,244,0.35)' },
                            transition: 'all 0.2s',
                        }}
                    >
                        Use Face ID / Fingerprint
                    </Button>
                </form>

                {onToggle && (
                    <Typography sx={{ textAlign: 'center', mt: 2.5, color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>
                        New here?{' '}
                        <Box component="span" onClick={onToggle}
                            sx={{ color: BLUE, fontWeight: 800, cursor: 'pointer', '&:hover': { opacity: 0.8 } }}>
                            Create account
                        </Box>
                    </Typography>
                )}
            </Box>
        </Box>
    );
};

export default Login;
