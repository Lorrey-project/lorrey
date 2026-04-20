import React, { useState } from 'react';
import {
    Box, Button, TextField, Typography, Paper, Alert, Link, InputAdornment, IconButton,
    ToggleButtonGroup, ToggleButton
} from '@mui/material';
import EmailIcon from '@mui/icons-material/Email';
import LockIcon from '@mui/icons-material/Lock';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { useAuth } from '../context/AuthContext';
import AnimatedBackground from './AnimatedBackground';

const PORTAL_LABELS = {
    HEAD_OFFICE: { title: 'office', badge: 'OFFICE ADMIN' },
    OFFICE: { title: 'site', badge: 'SITE ADMIN' },
    'PETROL PUMP': { title: 'petrol pump', badge: 'PUMP ADMIN' },
};

const Signup = ({ onToggle, lockedPortal = null, lockedPump = null }) => {
    const { signup } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    // If lockedPump is set, portal must be PETROL PUMP
    const [portal, setPortal] = useState(lockedPump ? 'PETROL PUMP' : (lockedPortal || 'OFFICE'));
    const [pumpName, setPumpName] = useState(lockedPump || 'SAS-1');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const portalInfo = PORTAL_LABELS[portal] || PORTAL_LABELS.OFFICE;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (password !== confirmPassword) return setError('Passwords do not match');
        if (portal === 'PETROL PUMP' && !['SAS-1', 'SAS-2'].includes(pumpName)) {
            return setError('Please select a pump (SAS-1 or SAS-2)');
        }
        setLoading(true);
        try {
            await signup(email, password, portal, portal === 'PETROL PUMP' ? pumpName : null);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to create account. Please try again.');
        } finally {
            setLoading(false);
        }
    };


    return (
        <AnimatedBackground>
            <Box sx={{ width: '100%', maxWidth: '440px', px: 2 }}>
                {/* Logo / Brand */}
                <Box textAlign="center" mb={5}>
                    <Box sx={{
                        width: 64, height: 64, borderRadius: '20px',
                        background: 'linear-gradient(135deg, #1a73e8 0%, #0d47a1 100%)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        mb: 2.5,
                        boxShadow: '0 12px 30px rgba(26,115,232,0.3), inset 0 0 15px rgba(255,255,255,0.2)',
                        border: '1px solid rgba(255,255,255,0.1)'
                    }}>
                        <Typography sx={{ color: '#fff', fontWeight: '900', fontSize: '28px', textShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>D</Typography>
                    </Box>
                    <Typography variant="h4" fontWeight="900" sx={{ color: '#fff', letterSpacing: '-1px', textShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
                        DIPALI ASSOCIATES & CO
                    </Typography>
                    <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.6)', mt: 1, fontWeight: 500 }}>
                        Create your secure slip management account
                    </Typography>
                </Box>
                {/* Card */}
                <Paper elevation={0} sx={{
                    p: { xs: 4, sm: 5 },
                    borderRadius: '32px',
                    backgroundColor: 'rgba(255,255,255,0.04)',
                    backdropFilter: 'blur(30px) saturate(180%)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    boxShadow: '0 24px 80px rgba(0,0,0,0.4), inset 0 0 40px rgba(255,255,255,0.02)',
                    overflow: 'hidden',
                    position: 'relative',
                    '&::before': {
                        content: '""',
                        position: 'absolute',
                        top: 0, left: 0, right: 0, height: '2px',
                        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)'
                    }
                }}>
                    {/* Portal toggle — only when not locked */}
                    {!lockedPortal && !lockedPump && (
                        <Box display="flex" justifyContent="center" mb={portal === 'PETROL PUMP' ? 2 : 4}>
                             <ToggleButtonGroup
                                 value={portal}
                                 exclusive
                                 onChange={(e, val) => val && setPortal(val)}
                                 fullWidth
                                 sx={{ 
                                     bgcolor: 'rgba(255,255,255,0.05)', 
                                     p: 0.5, borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)',
                                     '& .MuiToggleButton-root': {
                                         color: 'rgba(255,255,255,0.5)',
                                         borderRadius: '12px !important',
                                         border: 'none',
                                         fontWeight: 800,
                                         py: 1.5,
                                         '&.Mui-selected': {
                                             bgcolor: 'rgba(66, 133, 244, 0.4)',
                                             color: '#fff',
                                             boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                                         }
                                     }
                                 }}
                             >
                                 <ToggleButton value="HEAD_OFFICE">OFFICE ADMIN</ToggleButton>
                                 <ToggleButton value="OFFICE">SITE ADMIN</ToggleButton>
                                 <ToggleButton value="PETROL PUMP">PUMP ADMIN</ToggleButton>
                             </ToggleButtonGroup>
                        </Box>
                    )}

                    {/* Locked-portal or locked-pump badge */}
                    {(lockedPortal || lockedPump) && (
                        <Box display="flex" justifyContent="center" mb={3}>
                            <Box sx={{
                                px: 3, py: 1.2, borderRadius: '14px',
                                bgcolor: 'rgba(66,133,244,0.2)', border: '1px solid rgba(66,133,244,0.35)',
                                display: 'inline-flex', alignItems: 'center', gap: 1,
                            }}>
                                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#4285f4', boxShadow: '0 0 8px #4285f4' }} />
                                <Typography sx={{ color: '#fff', fontWeight: 900, fontSize: 13, letterSpacing: 1 }}>
                                    {lockedPump ? `⛽ ${lockedPump} PUMP ADMIN` : portalInfo.badge}
                                </Typography>
                            </Box>
                        </Box>
                    )}

                    {/* Pump sub-selector — only visible when Pump Admin is chosen AND not locked to a specific pump */}
                    {portal === 'PETROL PUMP' && !lockedPump && (
                        <Box mb={4}>
                            <Typography variant="caption" fontWeight={800}
                                sx={{ color: 'rgba(255,255,255,0.5)', letterSpacing: 1, display: 'block', mb: 1, textTransform: 'uppercase' }}>
                                Select Your Pump
                            </Typography>
                            <Box display="flex" gap={1.5}>
                                {['SAS-1', 'SAS-2'].map(p => (
                                    <Button
                                        key={p}
                                        fullWidth
                                        variant={pumpName === p ? 'contained' : 'outlined'}
                                        onClick={() => setPumpName(p)}
                                        sx={{
                                            borderRadius: '14px', py: 1.8, fontWeight: 900, fontSize: 15,
                                            ...(pumpName === p ? {
                                                background: 'linear-gradient(135deg, #1565c0 0%, #1976d2 100%)',
                                                color: '#fff',
                                                boxShadow: '0 6px 20px rgba(25,118,210,0.4)',
                                                border: 'none',
                                            } : {
                                                borderColor: 'rgba(255,255,255,0.25)',
                                                color: 'rgba(255,255,255,0.6)',
                                                bgcolor: 'rgba(255,255,255,0.04)',
                                                '&:hover': { borderColor: '#fff', color: '#fff', bgcolor: 'rgba(255,255,255,0.1)' },
                                            }),
                                        }}
                                    >
                                        ⛽ {p}
                                    </Button>
                                ))}
                            </Box>
                        </Box>
                    )}

                    <Typography variant="h5" fontWeight="900" sx={{ color: '#fff', mb: 1, letterSpacing: '-0.5px' }}>Register Now</Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', mb: 4, fontWeight: 500 }}>
                        Join the secure {portalInfo.title} network
                    </Typography>

                    {error && <Alert severity="error" sx={{ mb: 3, borderRadius: '16px', bgcolor: 'rgba(211, 47, 47, 0.15)', color: '#ff8a80', border: '1px solid rgba(211, 47, 47, 0.2)' }}>{error}</Alert>}

                    <form onSubmit={handleSubmit} autoComplete="off">
                        <TextField
                            label="Email Address"
                            variant="outlined"
                            fullWidth
                            autoComplete="new-password"
                            sx={{
                                mb: 2.5,
                                '& .MuiOutlinedInput-root': {
                                    backgroundColor: 'rgba(255,255,255,0.02)',
                                    borderRadius: '18px',
                                    color: '#fff',
                                    transition: 'all 0.3s ease',
                                    '& input': {
                                        '&:-webkit-autofill': {
                                            WebkitBoxShadow: '0 0 0 1000px rgba(13, 27, 78, 0.2) inset !important',
                                            WebkitTextFillColor: '#fff !important',
                                            transition: 'background-color 5000s ease-in-out 0s',
                                            borderRadius: 'inherit',
                                        },
                                    },
                                    '& fieldset': {
                                        borderColor: 'rgba(255,255,255,0.1)',
                                        borderWidth: '1px',
                                    },
                                    '&:hover fieldset': {
                                        borderColor: 'rgba(255,255,255,0.2)',
                                    },
                                    '&.Mui-focused fieldset': {
                                        borderColor: '#4285f4',
                                        borderWidth: '2px',
                                        boxShadow: '0 0 20px rgba(66,133,244,0.15)',
                                    },
                                },
                                '& .MuiInputLabel-root': {
                                    color: 'rgba(255,255,255,0.4)',
                                    fontWeight: 500,
                                    '&.Mui-focused': { color: '#4285f4' }
                                }
                            }}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required type="email"
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <EmailIcon sx={{ color: '#4285f4', mr: 1, fontSize: 20 }} />
                                    </InputAdornment>
                                ),
                            }}
                        />
                        <TextField
                            label="Password"
                            variant="outlined"
                            fullWidth
                            autoComplete="new-password"
                            sx={{
                                mb: 2.5,
                                '& .MuiOutlinedInput-root': {
                                    backgroundColor: 'rgba(255,255,255,0.02)',
                                    borderRadius: '18px',
                                    color: '#fff',
                                    transition: 'all 0.3s ease',
                                    '& input': {
                                        '&:-webkit-autofill': {
                                            WebkitBoxShadow: '0 0 0 1000px rgba(13, 27, 78, 0.2) inset !important',
                                            WebkitTextFillColor: '#fff !important',
                                            transition: 'background-color 5000s ease-in-out 0s',
                                            borderRadius: 'inherit',
                                        },
                                    },
                                    '& fieldset': {
                                        borderColor: 'rgba(255,255,255,0.1)',
                                        borderWidth: '1px',
                                    },
                                    '&:hover fieldset': {
                                        borderColor: 'rgba(255,255,255,0.2)',
                                    },
                                    '&.Mui-focused fieldset': {
                                        borderColor: '#4285f4',
                                        borderWidth: '2px',
                                        boxShadow: '0 0 20px rgba(66,133,244,0.15)',
                                    },
                                },
                                '& .MuiInputLabel-root': {
                                    color: 'rgba(255,255,255,0.4)',
                                    fontWeight: 500,
                                    '&.Mui-focused': { color: '#4285f4' }
                                }
                            }}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required type={showPass ? 'text' : 'password'}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <LockIcon sx={{ color: '#4285f4', mr: 1, fontSize: 20 }} />
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
                        <TextField
                            label="Confirm Password"
                            variant="outlined"
                            fullWidth
                            autoComplete="new-password"
                            sx={{
                                mb: 4,
                                '& .MuiOutlinedInput-root': {
                                    backgroundColor: 'rgba(255,255,255,0.02)',
                                    borderRadius: '18px',
                                    color: '#fff',
                                    transition: 'all 0.3s ease',
                                    '& input': {
                                        '&:-webkit-autofill': {
                                            WebkitBoxShadow: '0 0 0 1000px rgba(13, 27, 78, 0.2) inset !important',
                                            WebkitTextFillColor: '#fff !important',
                                            transition: 'background-color 5000s ease-in-out 0s',
                                            borderRadius: 'inherit',
                                        },
                                    },
                                    '& fieldset': {
                                        borderColor: 'rgba(255,255,255,0.1)',
                                        borderWidth: '1px',
                                    },
                                    '&:hover fieldset': {
                                        borderColor: 'rgba(255,255,255,0.2)',
                                    },
                                    '&.Mui-focused fieldset': {
                                        borderColor: '#4285f4',
                                        borderWidth: '2px',
                                        boxShadow: '0 0 20px rgba(66,133,244,0.15)',
                                    },
                                },
                                '& .MuiInputLabel-root': {
                                    color: 'rgba(255,255,255,0.4)',
                                    fontWeight: 500,
                                    '&.Mui-focused': { color: '#4285f4' }
                                }
                            }}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required type={showPass ? 'text' : 'password'}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <LockIcon sx={{ color: '#4285f4', mr: 1, fontSize: 20 }} />
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
                            startIcon={<PersonAddIcon />}
                            sx={{
                                py: 2, borderRadius: '16px', fontWeight: '900', fontSize: '16px',
                                background: 'linear-gradient(45deg, #1a73e8 30%, #4285f4 90%)',
                                boxShadow: '0 12px 30px rgba(26,115,232,0.4)',
                                transition: 'all 0.3s ease',
                                '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 15px 35px rgba(26,115,232,0.5)' }
                            }}
                        >
                            {loading ? 'Creating Account...' : 'Get Started Now'}
                        </Button>
                    </form>

                    <Box textAlign="center" mt={4}>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>
                            Already a member?{' '}
                            <Link component="button" onClick={onToggle} sx={{ color: '#4285f4', fontWeight: '800', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
                                Sign In
                            </Link>
                        </Typography>
                    </Box>
                </Paper>

                <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mt: 4, color: 'rgba(255,255,255,0.3)', fontWeight: 500, letterSpacing: '0.5px' }}>
                    © 2026 DIPALI ASSOCIATES & CO. ALL RIGHTS RESERVED.
                </Typography>
            </Box>
        </AnimatedBackground >
    );
};

export default Signup;
