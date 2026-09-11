import React, { useState } from 'react';
import {
    Box, Button, TextField, Typography, Alert,
    InputAdornment, IconButton, CircularProgress, Drawer, List, ListItem, ListItemText, ListItemIcon
} from '@mui/material';
import EmailIcon from '@mui/icons-material/Email';
import LockIcon from '@mui/icons-material/Lock';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import HomeIcon from '@mui/icons-material/Home';
import DashboardIcon from '@mui/icons-material/Dashboard';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import ContactSupportIcon from '@mui/icons-material/ContactSupport';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import { useAuth } from '../context/AuthContext';

// Background images: Aerial logistics green winding road background
import aerialBg from '../assets/dac_aerial_logistics_bg.jpg';
import heroBgFallback from '../assets/logistics_hero_bg.jpg';

const pillInputSx = {
    '& .MuiOutlinedInput-root': {
        bgcolor: 'rgba(255, 255, 255, 0.12)',
        backdropFilter: 'blur(12px)',
        borderRadius: '28px',
        color: '#ffffff',
        fontSize: '15px',
        fontWeight: 600,
        px: '6px',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        '& fieldset': {
            borderColor: 'rgba(255, 255, 255, 0.25)',
            borderWidth: '1px',
        },
        '&:hover fieldset': {
            borderColor: 'rgba(52, 211, 153, 0.6)',
        },
        '&.Mui-focused fieldset': {
            borderColor: '#34d399',
            borderWidth: '2px',
            boxShadow: '0 0 20px rgba(52, 211, 153, 0.35)',
        },
        '& input': {
            py: '13px',
            px: '14px',
            fontSize: '14.5px',
            fontWeight: 500,
            '&::placeholder': {
                color: 'rgba(255, 255, 255, 0.55)',
                opacity: 1,
            },
            '&:-webkit-autofill': {
                WebkitBoxShadow: '0 0 0 1000px #064e3b inset !important',
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
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [activeNav, setActiveNav] = useState('Home');

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

    const navItems = [
        { label: 'Home', icon: <HomeIcon /> },
        { label: 'Dashboard', icon: <DashboardIcon /> },
        { label: 'Services', icon: <LocalShippingIcon /> },
        { label: 'Contact Us', icon: <ContactSupportIcon /> },
    ];

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
            {/* Atmospheric Dark & Green Gradient Overlay */}
            <Box sx={{
                position: 'absolute',
                inset: 0,
                background: `linear-gradient(135deg, rgba(6, 78, 59, 0.72) 0%, rgba(15, 23, 42, 0.82) 50%, rgba(15, 23, 42, 0.92) 100%)`,
                backdropFilter: 'brightness(0.95) contrast(1.05)',
                zIndex: 1,
                pointerEvents: 'none'
            }} />

            {/* ── 1. TOP NAVIGATION BAR ──────────────────────────────────────────────── */}
            <Box sx={{
                position: 'relative',
                zIndex: 10,
                width: '100%',
                px: { xs: 2.5, sm: 4, md: 8 },
                py: { xs: 2, sm: 3 },
                display: 'flex',
                alignItems: 'center',
                justify: 'space-between',
                boxSizing: 'border-box'
            }}>
                {/* Left: Hamburger Button + DAC Logo Brand */}
                <Box display="flex" alignItems="center" gap={{ xs: 1.5, sm: 2 }}>
                    <IconButton
                        onClick={() => setMobileMenuOpen(true)}
                        sx={{
                            color: '#ffffff',
                            bgcolor: 'rgba(255, 255, 255, 0.12)',
                            backdropFilter: 'blur(12px)',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            p: 1,
                            '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.22)' }
                        }}
                    >
                        <MenuIcon sx={{ fontSize: 22 }} />
                    </IconButton>

                    {/* Brand Badge */}
                    <Box display="flex" alignItems="center" gap={1.2}>
                        <Box sx={{
                            width: { xs: 38, sm: 42 },
                            height: { xs: 38, sm: 42 },
                            borderRadius: '12px',
                            background: 'linear-gradient(135deg, #059669 0%, #0d9488 50%, #1d4ed8 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justify: 'center',
                            boxShadow: '0 8px 20px rgba(5, 150, 105, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
                            border: '1px solid rgba(255, 255, 255, 0.25)'
                        }}>
                            <Typography sx={{ color: '#ffffff', fontWeight: 900, fontSize: { xs: 13, sm: 15 }, letterSpacing: '0.5px' }}>
                                DAC
                            </Typography>
                        </Box>
                        <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
                            <Typography variant="h6" fontWeight={900} sx={{ color: '#ffffff', fontSize: '16px', letterSpacing: '-0.3px', lineHeight: 1.1 }}>
                                DIPALI ASSOCIATES & CO.
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.7)', fontWeight: 700, fontSize: '10px', letterSpacing: '1px' }}>
                                DIGITAL LOGISTICS MANAGEMENT
                            </Typography>
                        </Box>
                    </Box>
                </Box>

                {/* Center/Right Desktop Navigation Links */}
                <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 4 }}>
                    {navItems.map((item) => {
                        const isActive = activeNav === item.label;
                        return (
                            <Box
                                key={item.label}
                                onClick={() => setActiveNav(item.label)}
                                sx={{
                                    position: 'relative',
                                    cursor: 'pointer',
                                    color: isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.75)',
                                    fontWeight: isActive ? 800 : 600,
                                    fontSize: '14.5px',
                                    letterSpacing: '0.2px',
                                    py: 0.5,
                                    transition: 'color 0.25s ease',
                                    '&:hover': { color: '#ffffff' },
                                    '&::after': isActive ? {
                                        content: '""',
                                        position: 'absolute',
                                        bottom: -4,
                                        left: 0,
                                        right: 0,
                                        height: '2px',
                                        borderRadius: '2px',
                                        background: 'linear-gradient(90deg, #34d399 0%, #38bdf8 100%)',
                                        boxShadow: '0 0 8px #34d399'
                                    } : {}
                                }}
                            >
                                {item.label}
                            </Box>
                        );
                    })}
                </Box>
            </Box>

            {/* Mobile Navigation Drawer */}
            <Drawer
                anchor="left"
                open={mobileMenuOpen}
                onClose={() => setMobileMenuOpen(false)}
                PaperProps={{
                    sx: {
                        width: 280,
                        bgcolor: '#064e3b',
                        color: '#ffffff',
                        p: 3,
                        boxSizing: 'border-box'
                    }
                }}
            >
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                    <Box display="flex" alignItems="center" gap={1}>
                        <Box sx={{ width: 32, height: 32, borderRadius: '8px', bgcolor: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Typography fontWeight={900} fontSize={12}>DAC</Typography>
                        </Box>
                        <Typography fontWeight={800} fontSize={14}>DIPALI ASSOCIATES</Typography>
                    </Box>
                    <IconButton onClick={() => setMobileMenuOpen(false)} sx={{ color: '#ffffff' }}>
                        <CloseIcon />
                    </IconButton>
                </Box>

                <List>
                    {navItems.map((item) => (
                        <ListItem
                            key={item.label}
                            button
                            onClick={() => { setActiveNav(item.label); setMobileMenuOpen(false); }}
                            sx={{
                                borderRadius: '12px',
                                mb: 1,
                                bgcolor: activeNav === item.label ? 'rgba(255,255,255,0.15)' : 'transparent',
                                '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }
                            }}
                        >
                            <ListItemIcon sx={{ color: '#34d399', minWidth: 38 }}>
                                {item.icon}
                            </ListItemIcon>
                            <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: 700, fontSize: '14px' }} />
                        </ListItem>
                    ))}
                </List>
            </Drawer>

            {/* ── 2. HERO CONTENT & RIGHT-SIDE GLASS LOGIN CARD ─────────────────────── */}
            <Box sx={{
                position: 'relative',
                zIndex: 10,
                flex: 1,
                width: '100%',
                maxWidth: 1440,
                mx: 'auto',
                px: { xs: 2.5, sm: 4, md: 8 },
                py: { xs: 3, md: 5 },
                display: 'flex',
                flexDirection: { xs: 'column', lg: 'row' },
                alignItems: 'center',
                justify: 'space-between',
                gap: { xs: 4, lg: 6 },
                boxSizing: 'border-box'
            }}>
                {/* ── LEFT HERO SECTION ──────────────────────────────────────────────── */}
                <Box sx={{
                    flex: 1,
                    maxWidth: { lg: 580 },
                    animation: 'slideRightFade 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                    textAlign: { xs: 'center', lg: 'left' },
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: { xs: 'center', lg: 'flex-start' }
                }}>
                    {/* Small Subtitle Badge */}
                    <Box sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 1,
                        px: 2,
                        py: 0.75,
                        borderRadius: '30px',
                        bgcolor: 'rgba(52, 211, 153, 0.15)',
                        border: '1px solid rgba(52, 211, 153, 0.35)',
                        mb: 2.5,
                        backdropFilter: 'blur(10px)'
                    }}>
                        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#34d399' }} />
                        <Typography variant="caption" sx={{ color: '#6ee7b7', fontWeight: 800, fontSize: '11px', letterSpacing: '1px' }}>
                            SMART LOGISTICS &bull; SIMPLE MANAGEMENT
                        </Typography>
                    </Box>

                    {/* Main Bold Headline */}
                    <Typography
                        variant="h1"
                        fontWeight={900}
                        sx={{
                            color: '#ffffff',
                            fontSize: { xs: '32px', sm: '46px', md: '56px', lg: '62px' },
                            lineHeight: 1.05,
                            letterSpacing: '-1.5px',
                            mb: 2.5,
                            textShadow: '0 4px 20px rgba(0, 0, 0, 0.4)'
                        }}
                    >
                        MANAGE <br />
                        <span style={{
                            background: 'linear-gradient(135deg, #34d399 0%, #38bdf8 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent'
                        }}>
                            YOUR LOGISTICS
                        </span>
                    </Typography>

                    {/* Description Paragraph */}
                    <Typography
                        variant="body1"
                        sx={{
                            color: 'rgba(255, 255, 255, 0.82)',
                            fontSize: { xs: '14px', sm: '16px' },
                            lineHeight: 1.6,
                            fontWeight: 500,
                            maxWidth: 520,
                            mb: 4
                        }}
                    >
                        Centralized digital portal for Dipali Associates & Co. Streamline fleet operations, vehicle directory, billing, pump slips, GST & TDS reports with precision.
                    </Typography>

                    {/* CTA Buttons */}
                    <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
                        <Button
                            variant="outlined"
                            startIcon={<ArrowForwardIcon />}
                            sx={{
                                py: '11px',
                                px: 3,
                                borderRadius: '24px',
                                borderColor: 'rgba(255, 255, 255, 0.4)',
                                color: '#ffffff',
                                fontWeight: 800,
                                fontSize: '14px',
                                textTransform: 'none',
                                backdropFilter: 'blur(10px)',
                                bgcolor: 'rgba(255, 255, 255, 0.08)',
                                transition: 'all 0.3s ease',
                                '&:hover': {
                                    borderColor: '#34d399',
                                    bgcolor: 'rgba(52, 211, 153, 0.2)',
                                    transform: 'translateY(-2px)'
                                }
                            }}
                        >
                            Explore Platform
                        </Button>

                        <Button
                            variant="text"
                            startIcon={<InfoOutlinedIcon />}
                            sx={{
                                py: '11px',
                                px: 2.5,
                                color: 'rgba(255, 255, 255, 0.8)',
                                fontWeight: 700,
                                fontSize: '14px',
                                textTransform: 'none',
                                '&:hover': { color: '#ffffff', bgcolor: 'rgba(255, 255, 255, 0.05)' }
                            }}
                        >
                            Learn More
                        </Button>
                    </Box>
                </Box>

                {/* ── 3. RIGHT-SIDE FROSTED GLASS LOGIN CARD ──────────────────────────── */}
                <Box sx={{
                    width: '100%',
                    maxWidth: { xs: '100%', sm: 410, md: 430 },
                    bgcolor: 'rgba(6, 78, 59, 0.32)',
                    backdropFilter: 'blur(28px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(28px) saturate(180%)',
                    borderRadius: '32px',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                    boxShadow: '0 30px 60px -12px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
                    p: { xs: 3, sm: 4 },
                    boxSizing: 'border-box',
                    animation: 'slideUpFade 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                    transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                    '&:hover': {
                        boxShadow: '0 35px 70px -10px rgba(0, 0, 0, 0.75), inset 0 1px 0 rgba(255, 255, 255, 0.4)',
                    }
                }}>
                    {/* Raised Rounded Glass/Green Logo Header Section */}
                    <Box sx={{
                        bgcolor: 'rgba(5, 150, 105, 0.35)',
                        backdropFilter: 'blur(16px)',
                        borderRadius: '24px',
                        border: '1px solid rgba(52, 211, 153, 0.35)',
                        p: 2,
                        mb: 3,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.3)'
                    }}>
                        <Box sx={{
                            width: 48,
                            height: 48,
                            borderRadius: '16px',
                            background: 'linear-gradient(135deg, #059669 0%, #10b981 50%, #3b82f6 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justify: 'center',
                            boxShadow: '0 8px 20px rgba(5, 150, 105, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.4)',
                            border: '1px solid rgba(255, 255, 255, 0.3)'
                        }}>
                            <Typography sx={{ color: '#ffffff', fontWeight: 900, fontSize: 16, letterSpacing: '0.5px' }}>
                                DAC
                            </Typography>
                        </Box>
                        <Box>
                            <Typography variant="subtitle1" fontWeight={900} sx={{ color: '#ffffff', lineHeight: 1.2 }}>
                                DIPALI ASSOCIATES & CO.
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#a7f3d0', fontWeight: 700, fontSize: '11px' }}>
                                Authorized Portal Access
                            </Typography>
                        </Box>
                    </Box>

                    {/* Card Titles */}
                    <Box mb={2.5}>
                        <Typography variant="h5" fontWeight={900} sx={{ color: '#ffffff', letterSpacing: '-0.5px', fontSize: '22px' }}>
                            Welcome Back
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.7)', mt: 0.5, fontWeight: 500, fontSize: '13px' }}>
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
                            bgcolor: 'rgba(239, 68, 68, 0.2)',
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
                            bgcolor: 'rgba(56, 189, 248, 0.2)',
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
                            sx={pillInputSx}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <EmailIcon sx={{ color: 'rgba(255, 255, 255, 0.65)', fontSize: 19, ml: 0.5 }} />
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
                            sx={pillInputSx}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <LockIcon sx={{ color: 'rgba(255, 255, 255, 0.65)', fontSize: 19, ml: 0.5 }} />
                                    </InputAdornment>
                                ),
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <IconButton
                                            size="small"
                                            onClick={() => setShowPass(!showPass)}
                                            edge="end"
                                            sx={{ color: 'rgba(255, 255, 255, 0.65)', mr: 0.5, '&:hover': { color: '#ffffff' } }}
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
                                background: 'linear-gradient(135deg, #059669 0%, #0d9488 50%, #1d4ed8 100%)',
                                color: '#ffffff',
                                fontWeight: 900,
                                fontSize: '15px',
                                letterSpacing: '1px',
                                textTransform: 'uppercase',
                                boxShadow: '0 10px 25px rgba(5, 150, 105, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.35)',
                                border: '1px solid rgba(255, 255, 255, 0.25)',
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                '&:hover': {
                                    opacity: 0.95,
                                    transform: 'translateY(-2px)',
                                    boxShadow: '0 14px 32px rgba(5, 150, 105, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.45)',
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

                        {/* Forgot Password */}
                        <Box textAlign="center" mt={0.5}>
                            <Typography
                                onClick={handleForgotPassword}
                                variant="caption"
                                sx={{
                                    color: 'rgba(255, 255, 255, 0.75)',
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

                    {/* Bottom Security Note */}
                    <Box display="flex" alignItems="center" justifyContent="center" gap={0.8} mt={3}>
                        <ShieldOutlinedIcon sx={{ color: '#34d399', fontSize: 16 }} />
                        <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.65)', fontWeight: 600, fontSize: '11px' }}>
                            Encrypted Logistics Security &bull; DAC 2.0
                        </Typography>
                    </Box>
                </Box>
            </Box>

            {/* ── 4. MINIMAL FOOTER ─────────────────────────────────────────────────── */}
            <Box sx={{
                position: 'relative',
                zIndex: 10,
                width: '100%',
                py: 2,
                px: 3,
                textAlign: 'center',
                boxSizing: 'border-box'
            }}>
                <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.6)', fontWeight: 600, fontSize: '11.5px', letterSpacing: '0.3px' }}>
                    &copy; {new Date().getFullYear()} DIPALI ASSOCIATES & CO. &bull; Digital Logistics Management Platform
                </Typography>
            </Box>
        </Box>
    );
};

export default Login;
