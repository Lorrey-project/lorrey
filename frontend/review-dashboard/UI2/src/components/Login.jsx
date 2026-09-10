import React, { useState } from 'react';
import {
    Box, Button, TextField, Typography, Alert, InputAdornment, IconButton,
    CircularProgress
} from '@mui/material';
import EmailIcon from '@mui/icons-material/Email';
import LockIcon from '@mui/icons-material/Lock';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useAuth } from '../context/AuthContext';

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

const Login = () => {
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
            await login(email, password);
        } catch (err) {
            setError(err.response?.data?.message || 'Invalid email or password');
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
                    SINGLE APPLICATION PORTAL
                </Typography>
            </Box>

            {/* ── CARD ─────────────────────────────────── */}
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
                <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: 17, mb: 0.5 }}>
                    Sign in to your account
                </Typography>
                <Typography sx={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, mb: 2.5 }}>
                    Enter credentials to access your designated panel
                </Typography>

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

                <form onSubmit={handleSubmit} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <TextField
                        label="Email" type="email" fullWidth required size="small"
                        value={email} onChange={e => setEmail(e.target.value)}
                        autoComplete="off" sx={inputSx}
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
                            mt: 1, py: '13px', borderRadius: '14px',
                            background: `linear-gradient(135deg, #1a56db 0%, ${BLUE} 100%)`,
                            color: '#fff', fontWeight: 900, fontSize: 14, letterSpacing: 0.3,
                            boxShadow: `0 8px 24px ${BLUE_GLOW}`,
                            transition: 'all 0.25s ease',
                            '&:hover': { opacity: 0.9, transform: 'translateY(-1px)', boxShadow: `0 12px 28px ${BLUE_GLOW}` },
                            '&:disabled': { bgcolor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)', boxShadow: 'none' },
                        }}
                    >
                        {loading ? 'Logging in…' : 'LOGIN'}
                    </Button>
                </form>
            </Box>
        </Box>
    );
};

export default Login;
