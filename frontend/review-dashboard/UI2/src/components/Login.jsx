import React, { useState } from 'react';
import {
    Box, Button, TextField, Typography, Alert,
    InputAdornment, IconButton, CircularProgress, Checkbox, FormControlLabel, Link
} from '@mui/material';
import EmailIcon from '@mui/icons-material/Email';
import LockIcon from '@mui/icons-material/Lock';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import ShieldIcon from '@mui/icons-material/Shield';
import { useAuth } from '../context/AuthContext';

// Background image imported for Vite bundler, fallback to public path
import heroBg from '../assets/logistics_hero_bg.jpg';

const inputSx = {
    '& .MuiOutlinedInput-root': {
        bgcolor: 'rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(10px)',
        borderRadius: '16px',
        color: '#f8fafc',
        fontSize: '15px',
        fontWeight: 600,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        '& fieldset': {
            borderColor: 'rgba(255, 255, 255, 0.18)',
            borderWidth: '1px',
        },
        '&:hover fieldset': {
            borderColor: 'rgba(255, 255, 255, 0.35)',
        },
        '&.Mui-focused fieldset': {
            borderColor: '#38bdf8',
            borderWidth: '2px',
            boxShadow: '0 0 16px rgba(56, 189, 248, 0.25)',
        },
        '& input': {
            py: '14px',
            px: '12px',
            fontSize: '15px',
            fontWeight: 500,
            '&::placeholder': {
                color: 'rgba(255, 255, 255, 0.45)',
                opacity: 1,
            },
            '&:-webkit-autofill': {
                WebkitBoxShadow: '0 0 0 1000px #0f172a inset !important',
                WebkitTextFillColor: '#f8fafc !important',
            },
        },
    },
    '& .MuiInputLabel-root': {
        color: 'rgba(255, 255, 255, 0.6)',
        fontSize: '14px',
        fontWeight: 600,
        '&.Mui-focused': { color: '#38bdf8' },
    },
};

const Login = () => {
    const { login } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [rememberMe, setRememberMe] = useState(true);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [forgotInfo, setForgotInfo] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setForgotInfo('');
        setLoading(true);
        try {
            await login(email, password);
        } catch (err) {
            setError(err.response?.data?.message || 'Invalid email or password. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleForgotPassword = (e) => {
        e.preventDefault();
        setForgotInfo('Please contact your System Administrator or HO to reset your credentials.');
    };

    return (
        <Box sx={{
            minHeight: '100dvh',
            width: '100vw',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            fontFamily: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`,
            backgroundImage: `url(${heroBg}), url('/logistics_hero_bg.jpg')`,
            backgroundSize: 'cover',
            backgroundPosition: { xs: 'center 30%', md: 'center 45%' },
            backgroundRepeat: 'no-repeat',
            boxSizing: 'border-box',
            overflowX: 'hidden',
            overflowY: 'auto',
            color: '#f8fafc',
            '@keyframes fadeInUp': {
                from: { opacity: 0, transform: 'translateY(24px)' },
                to: { opacity: 1, transform: 'translateY(0)' }
            },
            '@keyframes pulseDot': {
                '0%, 100%': { opacity: 1, transform: 'scale(1)' },
                '50%': { opacity: 0.5, transform: 'scale(1.2)' }
            }
        }}>
            {/* Dark Cinematic Gradient Overlay */}
            <Box sx={{
                position: 'absolute',
                inset: 0,
                background: `linear-gradient(135deg, rgba(15, 23, 42, 0.78) 0%, rgba(15, 23, 42, 0.42) 50%, rgba(15, 23, 42, 0.82) 100%)`,
                backdropFilter: 'brightness(0.92) contrast(1.05)',
                zIndex: 1,
                pointerEvents: 'none'
            }} />

            {/* ── TOP MINIMAL NAVIGATION BAR ────────────────────────────────────────── */}
            <Box sx={{
                position: 'relative',
                zIndex: 10,
                width: '100%',
                px: { xs: 2.5, sm: 4, md: 6 },
                py: { xs: 2, sm: 2.5 },
                display: 'flex',
                alignItems: 'center',
                justify: 'space-between',
                boxSizing: 'border-box'
            }}>
                {/* Brand Logo & Name */}
                <Box display="flex" alignItems="center" gap={1.5}>
                    <Box sx={{
                        width: { xs: 38, sm: 44 },
                        height: { xs: 38, sm: 44 },
                        borderRadius: '12px',
                        background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 50%, #059669 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justify: 'center',
                        boxShadow: '0 8px 20px rgba(37, 99, 235, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
                        border: '1px solid rgba(255, 255, 255, 0.2)'
                    }}>
                        <Typography sx={{ color: '#ffffff', fontWeight: 900, fontSize: { xs: 13, sm: 15 }, letterSpacing: '0.5px' }}>
                            DAC
                        </Typography>
                    </Box>
                    <Box>
                        <Typography variant="h6" fontWeight={900} sx={{ color: '#ffffff', fontSize: { xs: '14px', sm: '17px' }, letterSpacing: '-0.3px', lineHeight: 1.1 }}>
                            DIPALI ASSOCIATES & CO.
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.65)', fontWeight: 700, fontSize: { xs: '9px', sm: '11px' }, letterSpacing: '1px' }}>
                            LOGISTICS & TRANSPORT MANAGEMENT
                        </Typography>
                    </Box>
                </Box>

                {/* Minimal Status / System Badge */}
                <Box sx={{
                    display: { xs: 'none', sm: 'flex' },
                    alignItems: 'center',
                    gap: 1.2,
                    px: 2,
                    py: 0.8,
                    borderRadius: '30px',
                    bgcolor: 'rgba(255, 255, 255, 0.1)',
                    backdropFilter: 'blur(16px)',
                    border: '1px solid rgba(255, 255, 255, 0.18)',
                    boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)'
                }}>
                    <Box sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        bgcolor: '#10b981',
                        boxShadow: '0 0 10px #10b981',
                        animation: 'pulseDot 2s infinite ease-in-out'
                    }} />
                    <Typography variant="caption" sx={{ color: '#ffffff', fontWeight: 800, fontSize: '11px', letterSpacing: '0.8px' }}>
                        DIGITAL PLATFORM
                    </Typography>
                </Box>
            </Box>

            {/* ── HERO & CENTRAL FROSTED GLASS LOGIN PANEL ─────────────────────────── */}
            <Box sx={{
                position: 'relative',
                zIndex: 10,
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justify: { xs: 'center', lg: 'flex-end' },
                px: { xs: 2, sm: 4, md: 8, lg: 12 },
                py: { xs: 3, sm: 4 },
                boxSizing: 'border-box'
            }}>
                {/* Frosted Glass Login Panel */}
                <Box sx={{
                    width: '100%',
                    maxWidth: { xs: '92%', sm: 440, md: 460 },
                    bgcolor: 'rgba(15, 23, 42, 0.58)',
                    backdropFilter: 'blur(28px) saturate(190%)',
                    WebkitBackdropFilter: 'blur(28px) saturate(190%)',
                    borderRadius: { xs: '24px', sm: '32px' },
                    border: '1px solid rgba(255, 255, 255, 0.22)',
                    boxShadow: '0 30px 60px -12px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.25)',
                    p: { xs: 3, sm: 4, md: 4.5 },
                    boxSizing: 'border-box',
                    animation: 'fadeInUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                    transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                    '&:hover': {
                        boxShadow: '0 35px 70px -10px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.35)',
                    }
                }}>
                    {/* Glass Panel Header */}
                    <Box display="flex" flexDirection="column" alignItems="center" textAlign="center" mb={3}>
                        <Box sx={{
                            width: 52,
                            height: 52,
                            borderRadius: '16px',
                            background: 'linear-gradient(135deg, rgba(30, 58, 138, 0.8) 0%, rgba(37, 99, 235, 0.8) 50%, rgba(5, 150, 105, 0.8) 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justify: 'center',
                            mb: 2,
                            boxShadow: '0 10px 25px rgba(37, 99, 235, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.4)',
                            border: '1px solid rgba(255, 255, 255, 0.3)'
                        }}>
                            <LocalShippingIcon sx={{ color: '#ffffff', fontSize: 26 }} />
                        </Box>

                        <Typography variant="h5" fontWeight={900} sx={{ color: '#ffffff', letterSpacing: '-0.5px', fontSize: { xs: '20px', sm: '23px' } }}>
                            Welcome Back
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.7)', mt: 0.5, fontWeight: 500, fontSize: { xs: '12px', sm: '13.5px' } }}>
                            Sign in to access your designated portal
                        </Typography>
                    </Box>

                    {/* Alert Notifications */}
                    {error && (
                        <Alert severity="error" sx={{
                            mb: 2.5,
                            borderRadius: '14px',
                            py: 0.75,
                            fontSize: '13px',
                            fontWeight: 600,
                            bgcolor: 'rgba(239, 68, 68, 0.18)',
                            color: '#fca5a5',
                            border: '1px solid rgba(239, 68, 68, 0.35)',
                            backdropFilter: 'blur(10px)',
                            '& .MuiAlert-icon': { color: '#fca5a5', fontSize: 18 }
                        }}>
                            {error}
                        </Alert>
                    )}

                    {forgotInfo && (
                        <Alert severity="info" sx={{
                            mb: 2.5,
                            borderRadius: '14px',
                            py: 0.75,
                            fontSize: '12.5px',
                            fontWeight: 600,
                            bgcolor: 'rgba(56, 189, 248, 0.18)',
                            color: '#7dd3fc',
                            border: '1px solid rgba(56, 189, 248, 0.35)',
                            backdropFilter: 'blur(10px)',
                            '& .MuiAlert-icon': { color: '#7dd3fc', fontSize: 18 }
                        }}>
                            {forgotInfo}
                        </Alert>
                    )}

                    {/* Login Form */}
                    <form onSubmit={handleSubmit} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {/* Email Input */}
                        <TextField
                            label="Email or Username"
                            type="email"
                            fullWidth
                            required
                            size="small"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            autoComplete="off"
                            sx={inputSx}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <EmailIcon sx={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: 19, mr: 0.5 }} />
                                    </InputAdornment>
                                )
                            }}
                        />

                        {/* Password Input */}
                        <TextField
                            label="Password"
                            fullWidth
                            required
                            size="small"
                            type={showPass ? 'text' : 'password'}
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            autoComplete="new-password"
                            sx={inputSx}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <LockIcon sx={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: 19, mr: 0.5 }} />
                                    </InputAdornment>
                                ),
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <IconButton
                                            size="small"
                                            onClick={() => setShowPass(!showPass)}
                                            edge="end"
                                            sx={{ color: 'rgba(255, 255, 255, 0.5)', mr: -0.5, '&:hover': { color: '#ffffff' } }}
                                        >
                                            {showPass ? <VisibilityOffIcon sx={{ fontSize: 19 }} /> : <VisibilityIcon sx={{ fontSize: 19 }} />}
                                        </IconButton>
                                    </InputAdornment>
                                )
                            }}
                        />

                        {/* Remember Me & Forgot Password */}
                        <Box display="flex" alignItems="center" justifyContent="space-between" mt={0.5}>
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={rememberMe}
                                        onChange={e => setRememberMe(e.target.checked)}
                                        size="small"
                                        sx={{
                                            color: 'rgba(255, 255, 255, 0.4)',
                                            '&.Mui-checked': { color: '#38bdf8' }
                                        }}
                                    />
                                }
                                label={
                                    <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.75)', fontSize: '13px', fontWeight: 600 }}>
                                        Remember me
                                    </Typography>
                                }
                            />

                            <Link
                                href="#forgot"
                                onClick={handleForgotPassword}
                                underline="hover"
                                sx={{
                                    color: '#38bdf8',
                                    fontSize: '12.5px',
                                    fontWeight: 700,
                                    letterSpacing: '0.2px',
                                    cursor: 'pointer',
                                    '&:hover': { color: '#7dd3fc' }
                                }}
                            >
                                Forgot Password?
                            </Link>
                        </Box>

                        {/* Submit Button */}
                        <Button
                            type="submit"
                            variant="contained"
                            fullWidth
                            disabled={loading}
                            endIcon={loading ? <CircularProgress size={18} color="inherit" /> : <ArrowForwardIcon sx={{ fontSize: 20 }} />}
                            sx={{
                                mt: 1,
                                py: '14px',
                                borderRadius: '16px',
                                background: 'linear-gradient(135deg, #0f172a 0%, #1d4ed8 50%, #059669 100%)',
                                color: '#ffffff',
                                fontWeight: 900,
                                fontSize: '15px',
                                letterSpacing: '0.8px',
                                textTransform: 'uppercase',
                                boxShadow: '0 10px 25px rgba(5, 150, 105, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
                                border: '1px solid rgba(255, 255, 255, 0.2)',
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                '&:hover': {
                                    opacity: 0.95,
                                    transform: 'translateY(-2px)',
                                    boxShadow: '0 14px 32px rgba(5, 150, 105, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.4)',
                                },
                                '&:disabled': {
                                    bgcolor: 'rgba(255, 255, 255, 0.12)',
                                    color: 'rgba(255, 255, 255, 0.4)',
                                    boxShadow: 'none'
                                }
                            }}
                        >
                            {loading ? 'Signing in...' : 'LOGIN'}
                        </Button>
                    </form>

                    {/* Bottom Security Note */}
                    <Box display="flex" alignItems="center" justifyContent="center" gap={0.8} mt={3}>
                        <ShieldIcon sx={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: 15 }} />
                        <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.5)', fontWeight: 600, fontSize: '11px' }}>
                            256-bit Encrypted Digital Logistics Access
                        </Typography>
                    </Box>
                </Box>
            </Box>

            {/* ── MINIMAL FOOTER ────────────────────────────────────────────────────── */}
            <Box sx={{
                position: 'relative',
                zIndex: 10,
                width: '100%',
                py: 2,
                px: 3,
                textAlign: 'center',
                boxSizing: 'border-box'
            }}>
                <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.55)', fontWeight: 600, fontSize: '11.5px', letterSpacing: '0.3px' }}>
                    &copy; {new Date().getFullYear()} DIPALI ASSOCIATES & CO. &bull; Digital Logistics Management Platform
                </Typography>
            </Box>
        </Box>
    );
};

export default Login;
