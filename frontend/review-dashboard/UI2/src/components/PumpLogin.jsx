import React, { useState } from 'react';
import {
    Box, Button, TextField, Typography, Alert,
    InputAdornment, IconButton, CircularProgress
} from '@mui/material';
import EmailIcon from '@mui/icons-material/Email';
import LockIcon from '@mui/icons-material/Lock';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import LoginIcon from '@mui/icons-material/Login';
import { useAuth } from '../context/AuthContext';

const PUMPS = [
    {
        id: 'SAS-1',
        gradient: 'linear-gradient(135deg, #0d47a1 0%, #1565c0 50%, #1976d2 100%)',
        glow: 'rgba(25,118,210,0.45)',
        accent: '#60a5fa',
        icon: '⛽',
    },
    {
        id: 'SAS-2',
        gradient: 'linear-gradient(135deg, #004d40 0%, #00695c 50%, #00897b 100%)',
        glow: 'rgba(0,137,123,0.45)',
        accent: '#34d399',
        icon: '⛽',
    },
];

function PumpPanel({ pump, onToggle }) {
    const { login } = useAuth();
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
            // Verify pumpName matches this panel
            if (user.pumpName && user.pumpName !== pump.id) {
                setError(`This account belongs to ${user.pumpName}, not ${pump.id}.`);
                // force logout
                localStorage.removeItem('token');
                localStorage.removeItem('user');
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Invalid credentials.');
        } finally {
            setLoading(false);
        }
    };

    const fieldSx = (accent) => ({
        '& .MuiOutlinedInput-root': {
            bgcolor: 'rgba(255,255,255,0.07)',
            borderRadius: '14px',
            color: '#fff',
            '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' },
            '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.3)' },
            '&.Mui-focused fieldset': { borderColor: accent, borderWidth: '2px', boxShadow: `0 0 16px ${accent}40` },
            '& input': {
                '&:-webkit-autofill': {
                    WebkitBoxShadow: '0 0 0 1000px rgba(10,30,70,0.3) inset !important',
                    WebkitTextFillColor: '#fff !important',
                },
            },
        },
        '& .MuiInputLabel-root': {
            color: 'rgba(255,255,255,0.4)',
            '&.Mui-focused': { color: accent },
        },
    });

    return (
        <Box sx={{
            flex: 1,
            minWidth: { xs: '100%', md: 360 },
            maxWidth: { xs: '100%', md: 460 },
            background: pump.gradient,
            borderRadius: '28px',
            border: `1px solid rgba(255,255,255,0.12)`,
            boxShadow: `0 24px 60px ${pump.glow}, inset 0 0 40px rgba(255,255,255,0.03)`,
            p: { xs: 4, sm: 5 },
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            overflow: 'hidden',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            '&:hover': {
                transform: 'translateY(-4px)',
                boxShadow: `0 32px 80px ${pump.glow}`,
            },
        }}>
            {/* Decorative circles */}
            <Box sx={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.04)' }} />
            <Box sx={{ position: 'absolute', bottom: -60, left: -30, width: 200, height: 200, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.03)' }} />

            {/* Header */}
            <Box sx={{ mb: 4, position: 'relative' }}>
                <Box sx={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 56, height: 56, borderRadius: '16px',
                    bgcolor: 'rgba(255,255,255,0.15)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    mb: 2,
                    boxShadow: `0 8px 24px rgba(0,0,0,0.2)`,
                }}>
                    <LocalGasStationIcon sx={{ fontSize: 28, color: '#fff' }} />
                </Box>
                <Typography variant="h5" fontWeight={900} sx={{ color: '#fff', letterSpacing: '-0.5px', lineHeight: 1.2 }}>
                    {pump.id}
                </Typography>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mt: 0.5, fontWeight: 600 }}>
                    Pump Admin Portal
                </Typography>
                <Box sx={{
                    mt: 1.5, display: 'inline-flex', alignItems: 'center', gap: 0.8,
                    bgcolor: 'rgba(255,255,255,0.12)', borderRadius: '8px', px: 1.5, py: 0.4,
                    border: '1px solid rgba(255,255,255,0.15)',
                }}>
                    <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: pump.accent, boxShadow: `0 0 6px ${pump.accent}` }} />
                    <Typography variant="caption" fontWeight={800} sx={{ color: pump.accent, letterSpacing: 0.5 }}>
                        SECURE ACCESS
                    </Typography>
                </Box>
            </Box>

            {/* Divider */}
            <Box sx={{ height: 1, bgcolor: 'rgba(255,255,255,0.1)', mb: 3, position: 'relative' }} />

            {error && (
                <Alert severity="error" sx={{ mb: 2.5, borderRadius: '12px', bgcolor: 'rgba(211,47,47,0.15)', color: '#fca5a5', border: '1px solid rgba(211,47,47,0.25)', fontWeight: 700 }}>
                    {error}
                </Alert>
            )}

            <form onSubmit={handleSubmit} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <TextField
                    label="Email Address"
                    type="email"
                    fullWidth
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    autoComplete="new-password"
                    sx={fieldSx(pump.accent)}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <EmailIcon sx={{ color: pump.accent, fontSize: 20, mr: 1 }} />
                            </InputAdornment>
                        ),
                    }}
                />
                <TextField
                    label="Password"
                    type={showPass ? 'text' : 'password'}
                    fullWidth
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="new-password"
                    sx={{ ...fieldSx(pump.accent), mb: 0.5 }}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <LockIcon sx={{ color: pump.accent, fontSize: 20, mr: 1 }} />
                            </InputAdornment>
                        ),
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
                    type="submit"
                    variant="contained"
                    fullWidth
                    size="large"
                    disabled={loading}
                    startIcon={loading ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : <LoginIcon />}
                    sx={{
                        py: 1.8, borderRadius: '14px', fontWeight: 900, fontSize: 15,
                        bgcolor: 'rgba(255,255,255,0.2)',
                        color: '#fff',
                        border: '1px solid rgba(255,255,255,0.25)',
                        boxShadow: 'none',
                        mt: 1,
                        '&:hover': {
                            bgcolor: 'rgba(255,255,255,0.3)',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                            transform: 'translateY(-1px)',
                        },
                        transition: 'all 0.2s',
                    }}
                >
                    {loading ? 'Signing In...' : `Sign In as ${pump.id}`}
                </Button>
            </form>

            <Box sx={{ mt: 3, textAlign: 'center', position: 'relative' }}>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)', fontWeight: 500 }}>
                    New here?{' '}
                    <Box
                        component="span"
                        onClick={onToggle}
                        sx={{ color: pump.accent, fontWeight: 800, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                    >
                        Create Account
                    </Box>
                </Typography>
            </Box>
        </Box>
    );
}

const PumpLogin = ({ onToggle, lockedPump = null }) => {
    // If lockedPump is set, only show that pump's panel
    const visiblePumps = lockedPump
        ? PUMPS.filter(p => p.id === lockedPump)
        : PUMPS;

    return (
        <Box sx={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #020818 0%, #0a1628 50%, #050d1f 100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            px: { xs: 2, md: 4 },
            py: 6,
            position: 'relative',
            overflow: 'hidden',
        }}>
            {/* Ambient glow blobs */}
            <Box sx={{ position: 'absolute', top: '10%', left: '5%', width: 400, height: 400, borderRadius: '50%', bgcolor: 'rgba(25,118,210,0.06)', filter: 'blur(80px)', pointerEvents: 'none' }} />
            <Box sx={{ position: 'absolute', bottom: '10%', right: '5%', width: 400, height: 400, borderRadius: '50%', bgcolor: 'rgba(0,137,123,0.06)', filter: 'blur(80px)', pointerEvents: 'none' }} />

            {/* Brand Header */}
            <Box textAlign="center" mb={6}>
                <Box sx={{
                    width: 64, height: 64, borderRadius: '20px',
                    background: 'linear-gradient(135deg, #1a73e8 0%, #0d47a1 100%)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    mb: 2.5,
                    boxShadow: '0 12px 30px rgba(26,115,232,0.3)',
                    border: '1px solid rgba(255,255,255,0.1)',
                }}>
                    <Typography sx={{ color: '#fff', fontWeight: 900, fontSize: 28 }}>D</Typography>
                </Box>
                <Typography variant="h4" fontWeight={900} sx={{ color: '#fff', letterSpacing: '-1px' }}>
                    DIPALI ASSOCIATES &amp; CO
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.45)', mt: 1, fontWeight: 500 }}>
                    Petrol Pump Admin Portal
                </Typography>

                {/* Section label */}
                <Box sx={{
                    mt: 2, display: 'inline-flex', alignItems: 'center', gap: 1.5,
                    bgcolor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px', px: 3, py: 1,
                }}>
                    <LocalGasStationIcon sx={{ fontSize: 18, color: 'rgba(255,255,255,0.5)' }} />
                    <Typography variant="body2" fontWeight={800} sx={{ color: 'rgba(255,255,255,0.5)', letterSpacing: 1, textTransform: 'uppercase' }}>
                        {lockedPump ? `${lockedPump} — Secure Access` : 'Select Your Pump to Sign In'}
                    </Typography>
                </Box>
            </Box>

            {/* Pump panel(s) */}
            <Box sx={{
                display: 'flex',
                flexDirection: { xs: 'column', md: 'row' },
                gap: { xs: 3, md: 4 },
                width: '100%',
                maxWidth: lockedPump ? 480 : 960,
                alignItems: 'stretch',
            }}>
                {visiblePumps.map(pump => (
                    <PumpPanel key={pump.id} pump={pump} onToggle={onToggle} />
                ))}
            </Box>

            <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mt: 5, color: 'rgba(255,255,255,0.2)', fontWeight: 500, letterSpacing: '0.5px' }}>
                © 2026 DIPALI ASSOCIATES &amp; CO. ALL RIGHTS RESERVED.
            </Typography>
        </Box>
    );
};

export default PumpLogin;
