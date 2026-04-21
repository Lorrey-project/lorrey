import React, { useState } from 'react';
import {
    Box, Button, TextField, Typography, Alert, InputAdornment, IconButton,
    CircularProgress, Chip
} from '@mui/material';
import EmailIcon from '@mui/icons-material/Email';
import LockIcon from '@mui/icons-material/Lock';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import BusinessIcon from '@mui/icons-material/Business';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import { useAuth } from '../context/AuthContext';

// Single brand blue — no colour changes
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
    { id: 'OFFICE',      label: 'Site',   icon: <LocationOnIcon sx={{ fontSize: 15 }} /> },
    { id: 'PETROL PUMP', label: 'Pump',   icon: <LocalGasStationIcon sx={{ fontSize: 15 }} /> },
];

const PUMPS = ['SAS-1', 'SAS-2'];

const Signup = ({ onToggle, lockedPortal = null, lockedPump = null }) => {
    const { signup } = useAuth();
    const [name,             setName]             = useState('');
    const [email,            setEmail]            = useState('');
    const [password,         setPassword]         = useState('');
    const [confirmPassword,  setConfirmPassword]  = useState('');
    const [showPass,         setShowPass]         = useState(false);
    const [registrationSecret, setRegistrationSecret] = useState('');
    const [portal,           setPortal]           = useState(lockedPump ? 'PETROL PUMP' : (lockedPortal || 'HEAD_OFFICE'));
    const [pumpName,         setPumpName]         = useState(lockedPump || 'SAS-1');
    const [error,            setError]            = useState('');
    const [loading,          setLoading]          = useState(false);
    const [pendingSuccess,   setPendingSuccess]   = useState(false);

    const isPump = portal === 'PETROL PUMP';
    const isHeadOffice = portal === 'HEAD_OFFICE';
    const locked = !!(lockedPortal || lockedPump);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (password !== confirmPassword) return setError('Passwords do not match.');
        if (isPump && !PUMPS.includes(pumpName)) return setError('Please select a valid pump (SAS-1 or SAS-2).');
        if (isHeadOffice && !registrationSecret) return setError('Registration secret is required for Head Office accounts.');
        setLoading(true);
        try {
            const result = await signup(email, password, portal, isPump ? pumpName : null, name, isHeadOffice ? registrationSecret : undefined);
            // If pending (non-HEAD_OFFICE), show success holding screen
            if (result?.pending) {
                setPendingSuccess(true);
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to create account. Please try again.');
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
            {/* ── PENDING APPROVAL SCREEN ────────────────────────────── */}
            {pendingSuccess && (
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', px: 3, textAlign: 'center' }}>
                    <Box sx={{ width: 72, height: 72, borderRadius: '22px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3, boxShadow: '0 16px 40px rgba(245,158,11,0.3)' }}>
                        <HourglassTopIcon sx={{ color: '#fff', fontSize: 36 }} />
                    </Box>
                    <Typography sx={{ color: '#fff', fontWeight: 900, fontSize: 22, letterSpacing: '-0.5px', mb: 1 }}>Pending Approval</Typography>
                    <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, lineHeight: 1.7, maxWidth: 300, mb: 4 }}>
                        Your registration request has been sent to the <strong style={{ color: 'rgba(255,255,255,0.8)' }}>Head Office admin</strong>.
                        You will be able to log in once your account is approved.
                    </Typography>
                    <Box sx={{ bgcolor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '14px', px: 3, py: 2, maxWidth: 320, width: '100%', mb: 3 }}>
                        <Typography sx={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, mb: 0.5 }}>Registered As</Typography>
                        <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{email}</Typography>
                        <Typography sx={{ color: '#f59e0b', fontWeight: 600, fontSize: 12, mt: 0.3 }}>
                            {portal === 'PETROL PUMP' ? `${pumpName} Pump Admin` : 'Site Admin'}
                        </Typography>
                    </Box>
                    {onToggle && (
                        <Typography sx={{ color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>
                            Back to{' '}
                            <Box component="span" onClick={onToggle} sx={{ color: BLUE, fontWeight: 800, cursor: 'pointer', '&:hover': { opacity: 0.8 } }}>Sign In</Box>
                        </Typography>
                    )}
                </Box>
            )}

            {/* ── NORMAL SIGNUP FORM ─────────────────────────────────── */}
            {!pendingSuccess && <>
            {/* ── HERO ───────────────────────────────────────── */}
            <Box sx={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                px: 3, pt: 6, pb: 2, position: 'relative',
            }}>
                {/* Static blue glow */}
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
                    CREATE YOUR ACCOUNT
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
                {!locked && (
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
                {locked && (
                    <Chip
                        label={lockedPump ? `${lockedPump} PUMP ADMIN` : (PORTALS.find(p => p.id === lockedPortal)?.label?.toUpperCase() + ' ADMIN')}
                        size="small"
                        sx={{
                            mb: 2.5, bgcolor: 'rgba(66,133,244,0.15)', color: BLUE,
                            fontWeight: 800, fontSize: 10, letterSpacing: 1,
                            border: `1px solid rgba(66,133,244,0.35)`,
                        }}
                    />
                )}

                {/* Pump sub-selector */}
                {isPump && !lockedPump && (
                    <Box sx={{ display: 'flex', gap: 1.5, mb: 3 }}>
                        {PUMPS.map(p => (
                            <Box key={p} onClick={() => setPumpName(p)}
                                sx={{
                                    flex: 1, py: 1.5, borderRadius: '12px', textAlign: 'center',
                                    bgcolor: pumpName === p ? 'rgba(66,133,244,0.15)' : 'rgba(255,255,255,0.04)',
                                    border: pumpName === p ? `1.5px solid ${BLUE}` : '1.5px solid rgba(255,255,255,0.08)',
                                    cursor: 'pointer', transition: 'all 0.2s',
                                }}>
                                <LocalGasStationIcon sx={{ fontSize: 16, color: BLUE, mb: 0.3 }} />
                                <Typography sx={{ color: pumpName === p ? BLUE : 'rgba(255,255,255,0.4)', fontWeight: 800, fontSize: 12 }}>
                                    {p}
                                </Typography>
                            </Box>
                        ))}
                    </Box>
                )}

                {/* Heading */}
                <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: 17, mb: 0.5 }}>
                    Create Account
                </Typography>
                <Typography sx={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, mb: 2.5 }}>
                    {isPump ? `${pumpName} Pump Admin Registration` : `${PORTALS.find(p => p.id === portal)?.label} Admin — New Account`}
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
                        label="Full Name" type="text" fullWidth required size="small"
                        value={name} onChange={e => setName(e.target.value)}
                        autoComplete="off" sx={inputSx}
                        InputProps={{ startAdornment: <InputAdornment position="start"><PersonOutlineIcon sx={{ color: 'rgba(255,255,255,0.25)', fontSize: 17, mr: 0.5 }} /></InputAdornment> }}
                    />
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
                    <TextField
                        label="Confirm Password" fullWidth required size="small"
                        type={showPass ? 'text' : 'password'}
                        value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                        autoComplete="new-password" sx={inputSx}
                        InputProps={{ startAdornment: <InputAdornment position="start"><LockIcon sx={{ color: 'rgba(255,255,255,0.25)', fontSize: 17, mr: 0.5 }} /></InputAdornment> }}
                    />

                    {/* Registration Secret — only for HEAD_OFFICE */}
                    {isHeadOffice && (
                        <TextField
                            label="Registration Secret *" type="password" fullWidth required size="small"
                            value={registrationSecret} onChange={e => setRegistrationSecret(e.target.value)}
                            autoComplete="new-password" sx={{
                                ...inputSx,
                                '& .MuiOutlinedInput-root': {
                                    ...inputSx['& .MuiOutlinedInput-root'],
                                    '& fieldset': { borderColor: 'rgba(245,158,11,0.3)' },
                                    '&.Mui-focused fieldset': { borderColor: '#f59e0b', borderWidth: '1.5px' },
                                },
                                '& .MuiInputLabel-root': { ...inputSx['& .MuiInputLabel-root'], '&.Mui-focused': { color: '#f59e0b' } },
                            }}
                            helperText={<span style={{ color: 'rgba(245,158,11,0.7)', fontSize: 11 }}>Required for Head Office registration. Contact your system administrator.</span>}
                            InputProps={{ startAdornment: <InputAdornment position="start"><VpnKeyIcon sx={{ color: 'rgba(245,158,11,0.5)', fontSize: 17, mr: 0.5 }} /></InputAdornment> }}
                        />
                    )}

                    {/* Pending info notice for non-HEAD_OFFICE */}
                    {!isHeadOffice && (
                        <Box sx={{ bgcolor: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.18)', borderRadius: '12px', px: 2, py: 1.2 }}>
                            <Typography sx={{ color: 'rgba(245,158,11,0.85)', fontSize: 11, fontWeight: 600 }}>
                                ⏳ Your account will require Head Office approval before you can log in.
                            </Typography>
                        </Box>
                    )}

                    <Button
                        type="submit" variant="contained" fullWidth disabled={loading}
                        endIcon={loading ? <CircularProgress size={15} sx={{ color: '#fff' }} /> : <PersonAddIcon sx={{ fontSize: 17 }} />}
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
                        {loading ? 'Creating Account…' : 'Get Started'}
                    </Button>
                </form>

                {onToggle && (
                    <Typography sx={{ textAlign: 'center', mt: 2.5, color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>
                        Already have an account?{' '}
                        <Box component="span" onClick={onToggle}
                            sx={{ color: BLUE, fontWeight: 800, cursor: 'pointer', '&:hover': { opacity: 0.8 } }}>Sign In</Box>
                    </Typography>
                )}
            </Box>
            </>}
        </Box>
    );
};

export default Signup;
