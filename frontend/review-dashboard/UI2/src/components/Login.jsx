import React, { useState } from 'react';
import {
    Box, Button, TextField, Typography, Alert,
    InputAdornment, IconButton, CircularProgress
} from '@mui/material';
import EmailIcon from '@mui/icons-material/Email';
import LockIcon from '@mui/icons-material/Lock';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import { useAuth } from '../context/AuthContext';

// Background aerial logistics winding road image
import aerialBg from '../assets/dac_aerial_logistics_bg.jpg';
import heroBgFallback from '../assets/logistics_hero_bg.jpg';

// Transparent Glass Input Styling with High-Contrast White/Cyan Floating Labels
const transparentGlassInputSx = {
    '& .MuiInputLabel-root': {
        color: 'rgba(255, 255, 255, 0.85)',
        fontSize: '14px',
        fontWeight: 600,
        textShadow: '0 1px 3px rgba(0, 0, 0, 0.7)',
        '&.Mui-focused': {
            color: '#38bdf8',
        },
        '&.MuiInputLabel-shrink': {
            color: '#38bdf8',
            fontWeight: 700,
            bgcolor: 'rgba(15, 23, 42, 0.75)',
            px: 1,
            borderRadius: '6px',
            backdropFilter: 'blur(8px)',
        },
    },
    '& .MuiOutlinedInput-root': {
        bgcolor: 'rgba(255, 255, 255, 0.16)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderRadius: '28px',
        color: '#ffffff',
        fontSize: '15px',
        fontWeight: 600,
        px: '6px',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        '& fieldset': {
            borderColor: 'rgba(255, 255, 255, 0.38)',
            borderWidth: '1.5px',
        },
        '&:hover fieldset': {
            borderColor: '#34d399',
        },
        '&.Mui-focused fieldset': {
            borderColor: '#38bdf8',
            borderWidth: '2px',
            boxShadow: '0 0 22px rgba(56, 189, 248, 0.45)',
        },
        '& input': {
            py: '13px',
            px: '14px',
            fontSize: '14.5px',
            fontWeight: 600,
            color: '#ffffff',
            '&::placeholder': {
                color: 'rgba(255, 255, 255, 0.7)',
                opacity: 1,
            },
            '&:-webkit-autofill': {
                WebkitBoxShadow: '0 0 0 1000px rgba(15, 23, 42, 0.85) inset !important',
                WebkitTextFillColor: '#ffffff !important',
            },
        },
    },
};

const Login = () => {
    const { login } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [forgotMsg, setForgotMsg] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setForgotMsg('');
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
        setForgotMsg('Please contact your System Administrator or HO to reset credentials.');
    };

    return (
        <Box sx={{
            minHeight: '100dvh',
            width: '100vw',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            justify: 'space-between',
            fontFamily: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`,
            backgroundImage: `url(${aerialBg}), url('/dac_aerial_logistics_bg.jpg'), url(${heroBgFallback})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            boxSizing: 'border-box',
            overflowX: 'hidden',
            color: '#ffffff',
            '@keyframes slideUpFade': {
                from: { opacity: 0, transform: 'translateY(28px)' },
                to: { opacity: 1, transform: 'translateY(0)' }
            },
            '@keyframes slideRightFade': {
                from: { opacity: 0, transform: 'translateX(-28px)' },
                to: { opacity: 1, transform: 'translateX(0)' }
            }
        }}>
            {/* Atmospheric Overlay */}
            <Box sx={{
                position: 'absolute',
                inset: 0,
                background: `linear-gradient(135deg, rgba(6, 78, 59, 0.45) 0%, rgba(15, 23, 42, 0.62) 50%, rgba(15, 23, 42, 0.78) 100%)`,
                backdropFilter: 'brightness(0.95) contrast(1.05)',
                zIndex: 1,
                pointerEvents: 'none'
            }} />

            {/* ── HERO CONTENT & RIGHT-SIDE FROSTED GLASS LOGIN CARD ─────────────────────── */}
            <Box sx={{
                position: 'relative',
                zIndex: 10,
                flex: 1,
                width: '100%',
                maxWidth: 1440,
                mx: 'auto',
                px: { xs: 2.5, sm: 4, md: 8 },
                py: { xs: 4, md: 6 },
                display: 'flex',
                flexDirection: { xs: 'column', lg: 'row' },
                alignItems: 'center',
                justify: 'space-between',
                gap: { xs: 4, lg: 6 },
                boxSizing: 'border-box'
            }}>
                {/* ── LEFT HERO SECTION ── */}
                <Box sx={{
                    flex: 1,
                    maxWidth: { lg: 600 },
                    animation: 'slideRightFade 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                    textAlign: { xs: 'center', lg: 'left' },
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: { xs: 'center', lg: 'flex-start' }
                }}>
                    {/* Small Subtitle Glass Badge */}
                    <Box sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 1,
                        px: 2,
                        py: 0.75,
                        borderRadius: '30px',
                        bgcolor: 'rgba(52, 211, 153, 0.16)',
                        border: '1px solid rgba(52, 211, 153, 0.38)',
                        mb: 2.5,
                        backdropFilter: 'blur(12px)'
                    }}>
                        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#34d399' }} />
                        <Typography variant="caption" sx={{ color: '#6ee7b7', fontWeight: 800, fontSize: '11px', letterSpacing: '1px' }}>
                            SMART LOGISTICS &bull; SIMPLE MANAGEMENT
                        </Typography>
                    </Box>

                    {/* Main Title: DIPALI ASSOCIATES & CO. */}
                    <Typography
                        variant="h1"
                        fontWeight={900}
                        sx={{
                            fontSize: { xs: '34px', sm: '48px', md: '58px', lg: '64px' },
                            lineHeight: 1.05,
                            letterSpacing: '-1.5px',
                            textShadow: '0 4px 20px rgba(0, 0, 0, 0.4)'
                        }}
                    >
                        <span style={{ color: '#ffffff' }}>DIPALI</span> <br />
                        <span style={{
                            background: 'linear-gradient(135deg, #38bdf8 0%, #34d399 50%, #60a5fa 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent'
                        }}>
                            ASSOCIATES & CO.
                        </span>
                    </Typography>
                </Box>

                {/* ── RIGHT-SIDE REAL FROSTED GLASS LOGIN CARD ─────────────────────── */}
                <Box sx={{
                    width: '100%',
                    maxWidth: { xs: '100%', sm: 400, md: 420 },
                    bgcolor: 'rgba(255, 255, 255, 0.13)',
                    backdropFilter: 'blur(24px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                    borderRadius: '30px',
                    border: '1px solid rgba(255, 255, 255, 0.32)',
                    boxShadow: '0 25px 60px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.35)',
                    p: { xs: 3, sm: 4 },
                    boxSizing: 'border-box',
                    animation: 'slideUpFade 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                    transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                    '&:hover': {
                        boxShadow: '0 30px 70px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.45)',
                    }
                }}>
                    {/* Card Headings */}
                    <Box mb={2.5}>
                        <Typography variant="h5" fontWeight={900} sx={{ color: '#ffffff', letterSpacing: '-0.5px', fontSize: '22px' }}>
                            Welcome Back
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.8)', mt: 0.5, fontWeight: 500, fontSize: '13px' }}>
                            Login to continue to your designated panel
                        </Typography>
                    </Box>

                    {/* Alerts */}
                    {error && (
                        <Alert severity="error" sx={{
                            mb: 2.5,
                            borderRadius: '16px',
                            py: 0.75,
                            fontSize: '13px',
                            fontWeight: 600,
                            bgcolor: 'rgba(239, 68, 68, 0.22)',
                            color: '#fca5a5',
                            border: '1px solid rgba(239, 68, 68, 0.4)',
                            backdropFilter: 'blur(10px)',
                            '& .MuiAlert-icon': { color: '#fca5a5', fontSize: 18 }
                        }}>
                            {error}
                        </Alert>
                    )}

                    {forgotMsg && (
                        <Alert severity="info" sx={{
                            mb: 2.5,
                            borderRadius: '16px',
                            py: 0.75,
                            fontSize: '12.5px',
                            fontWeight: 600,
                            bgcolor: 'rgba(56, 189, 248, 0.22)',
                            color: '#7dd3fc',
                            border: '1px solid rgba(56, 189, 248, 0.4)',
                            backdropFilter: 'blur(10px)',
                            '& .MuiAlert-icon': { color: '#7dd3fc', fontSize: 18 }
                        }}>
                            {forgotMsg}
                        </Alert>
                    )}

                    {/* Login Form */}
                    <form onSubmit={handleSubmit} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {/* Username / Email Field */}
                        <TextField
                            label="Username / Email"
                            type="email"
                            fullWidth
                            required
                            size="small"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            autoComplete="off"
                            sx={transparentGlassInputSx}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <EmailIcon sx={{ color: '#38bdf8', fontSize: 19, ml: 0.5 }} />
                                    </InputAdornment>
                                )
                            }}
                        />

                        {/* Password Field */}
                        <TextField
                            label="Password"
                            fullWidth
                            required
                            size="small"
                            type={showPass ? 'text' : 'password'}
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            autoComplete="new-password"
                            sx={transparentGlassInputSx}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <LockIcon sx={{ color: '#38bdf8', fontSize: 19, ml: 0.5 }} />
                                    </InputAdornment>
                                ),
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <IconButton
                                            size="small"
                                            onClick={() => setShowPass(!showPass)}
                                            edge="end"
                                            sx={{ color: 'rgba(255, 255, 255, 0.85)', mr: 0.5, '&:hover': { color: '#38bdf8' } }}
                                        >
                                            {showPass ? <VisibilityOffIcon sx={{ fontSize: 19 }} /> : <VisibilityIcon sx={{ fontSize: 19 }} />}
                                        </IconButton>
                                    </InputAdornment>
                                )
                            }}
                        />

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
                                borderRadius: '28px',
                                background: 'linear-gradient(135deg, rgba(13, 148, 136, 0.95) 0%, rgba(37, 99, 235, 0.95) 100%)',
                                color: '#ffffff',
                                fontWeight: 900,
                                fontSize: '15px',
                                letterSpacing: '1px',
                                textTransform: 'uppercase',
                                boxShadow: '0 10px 25px rgba(13, 148, 136, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.35)',
                                border: '1px solid rgba(255, 255, 255, 0.3)',
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                '&:hover': {
                                    opacity: 0.95,
                                    transform: 'translateY(-2px)',
                                    boxShadow: '0 14px 32px rgba(13, 148, 136, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.45)',
                                },
                                '&:disabled': {
                                    bgcolor: 'rgba(255, 255, 255, 0.15)',
                                    color: 'rgba(255, 255, 255, 0.4)',
                                    boxShadow: 'none'
                                }
                            }}
                        >
                            {loading ? 'Logging in...' : 'LOG IN'}
                        </Button>

                        {/* Forgot Password Link */}
                        <Box textAlign="center" mt={0.5}>
                            <Typography
                                onClick={handleForgotPassword}
                                variant="caption"
                                sx={{
                                    color: 'rgba(255, 255, 255, 0.85)',
                                    fontSize: '12.5px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'color 0.2s ease',
                                    '&:hover': { color: '#34d399', textDecoration: 'underline' }
                                }}
                            >
                                Forgot Password?
                            </Typography>
                        </Box>
                    </form>

                    {/* Bottom Security Footer */}
                    <Box display="flex" alignItems="center" justifyContent="center" gap={0.8} mt={3}>
                        <ShieldOutlinedIcon sx={{ color: '#34d399', fontSize: 16 }} />
                        <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.75)', fontWeight: 600, fontSize: '11px' }}>
                            Encrypted Logistics Security &bull; DAC 2.0
                        </Typography>
                    </Box>
                </Box>
            </Box>

            {/* ── MINIMAL FOOTER ─────────────────────────────────────────────────── */}
            <Box sx={{
                position: 'relative',
                zIndex: 10,
                width: '100%',
                py: 2,
                px: 3,
                textAlign: 'center',
                boxSizing: 'border-box'
            }}>
                <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.65)', fontWeight: 600, fontSize: '11.5px', letterSpacing: '0.3px' }}>
                    &copy; {new Date().getFullYear()} DIPALI ASSOCIATES & CO. &bull; Digital Logistics Management Platform
                </Typography>
            </Box>
        </Box>
    );
};

export default Login;
