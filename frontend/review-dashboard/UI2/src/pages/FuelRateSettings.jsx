import React, { useEffect, useState } from 'react';
import {
    Box, Typography, Button, Card, CardContent,
    Snackbar, Alert, Divider, CircularProgress,
    TextField, Paper, IconButton, Tooltip
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import SaveIcon from '@mui/icons-material/Save';
import HistoryIcon from '@mui/icons-material/History';
import EventIcon from '@mui/icons-material/Event';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const PUMPS = ['SAS-1', 'SAS-2'];

export default function FuelRateSettings({ onBack }) {
    const [history, setHistory] = useState({ 'SAS-1': [], 'SAS-2': [] });
    const [selectedPump, setSelectedPump] = useState('SAS-1');
    const [rateInput, setRateInput] = useState('');
    const [dateInput, setDateInput] = useState(new Date().toISOString().split('T')[0]);
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [snack, setSnack] = useState(null);

    useEffect(() => {
        fetchRates();
    }, []);

    const fetchRates = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`${API_URL}/pump-payment/fuel-rates`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data.success) {
                setHistory(res.data.history);
                // Pre-fill editor with latest rate if available
                const latest = res.data.history[selectedPump]?.[0];
                if (latest) setRateInput(String(latest.rate));
            }
        } catch (e) {
            setSnack({ msg: 'Failed to load rates', sev: 'error' });
        } finally {
            setLoading(false);
        }
    };

    // Update rate input when pump changes
    useEffect(() => {
        const latest = history[selectedPump]?.[0];
        if (latest) setRateInput(String(latest.rate));
        else setRateInput('90');
    }, [selectedPump, history]);

    const handleSave = async () => {
        const rateVal = parseFloat(rateInput);
        if (isNaN(rateVal) || rateVal <= 0) {
            setSnack({ msg: 'Rate must be a positive number', sev: 'error' });
            return;
        }
        if (!dateInput) {
            setSnack({ msg: 'Effective date is required', sev: 'error' });
            return;
        }

        setSaving(true);
        try {
            const token = localStorage.getItem('token');
            const res = await axios.put(`${API_URL}/pump-payment/fuel-rates`,
                { pumpName: selectedPump, rate: rateVal, effectiveDate: dateInput },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            
            if (res.data.success) {
                setSnack({ 
                    msg: `${selectedPump} rate updated to ₹${rateVal}/L from ${dateInput}. ${res.data.reSyncCount} invoices re-syncing.`, 
                    sev: 'success' 
                });
                fetchRates(); // Refresh history
            }
        } catch (e) {
            setSnack({ msg: e.response?.data?.error || 'Failed to save rate', sev: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const pumpHistory = history[selectedPump] || [];
    const currentRate = pumpHistory[0]?.rate ?? 90;
    const newRate = parseFloat(rateInput);
    const diff = isNaN(newRate) ? 0 : newRate - currentRate;
    const diffColor = diff > 0 ? '#f87171' : diff < 0 ? '#34d399' : 'rgba(255,255,255,0.35)';

    return (
        <Box sx={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #0a1628 0%, #0f2347 50%, #0a1e3d 100%)',
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
        }}>
            {/* ── Header ────────────────────────────────────────────────── */}
            <Box sx={{
                display: 'flex', alignItems: 'center', gap: 2,
                px: { xs: 2, md: 5 }, py: 2.5,
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                backdropFilter: 'blur(10px)',
                background: 'rgba(10,22,40,0.6)',
                position: 'sticky', top: 0, zIndex: 10,
            }}>
                <Button
                    startIcon={<ArrowBackIcon />}
                    onClick={onBack}
                    sx={{
                        color: 'rgba(255,255,255,0.7)', fontWeight: 700, borderRadius: '10px',
                        '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.08)' },
                    }}
                >
                    Back
                </Button>
                <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />
                <Box sx={{ p: 0.8, bgcolor: 'rgba(25,118,210,0.3)', borderRadius: '10px', border: '1px solid rgba(25,118,210,0.4)' }}>
                    <LocalGasStationIcon sx={{ fontSize: 20, color: '#60a5fa' }} />
                </Box>
                <Box>
                    <Typography variant="h6" fontWeight={900} sx={{ lineHeight: 1.2 }}>
                        Fuel Rate Settings
                    </Typography>
                    <Typography variant="caption" sx={{ opacity: 0.5 }}>
                        Head Office — Pricing History Control
                    </Typography>
                </Box>
            </Box>

            {loading ? (
                <Box display="flex" justifyContent="center" alignItems="center" flex={1} pt={10}>
                    <CircularProgress sx={{ color: '#60a5fa' }} />
                </Box>
            ) : (
                <Box sx={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: { xs: 'column', lg: 'row' },
                    gap: 4,
                    px: { xs: 2, md: 5 },
                    py: 4,
                    maxWidth: 1400,
                    width: '100%',
                    mx: 'auto',
                }}>
                    {/* ── Left: Current Rates Summary ─────────────────────── */}
                    <Box sx={{ width: { xs: '100%', lg: 320 }, flexShrink: 0 }}>
                        <Typography variant="caption" fontWeight={800} sx={{ opacity: 0.5, letterSpacing: 1, mb: 1.5, display: 'block' }}>
                            SELECT PUMP
                        </Typography>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {PUMPS.map(pump => {
                                const isSelected = pump === selectedPump;
                                const latest = history[pump]?.[0];
                                return (
                                    <Card
                                        key={pump}
                                        onClick={() => setSelectedPump(pump)}
                                        sx={{
                                            cursor: 'pointer',
                                            borderRadius: '18px',
                                            background: isSelected
                                                ? 'linear-gradient(135deg, #1565c0 0%, #1976d2 100%)'
                                                : 'rgba(255,255,255,0.05)',
                                            border: isSelected
                                                ? '1px solid rgba(96,165,250,0.5)'
                                                : '1px solid rgba(255,255,255,0.08)',
                                            transition: 'all 0.2s ease',
                                            '&:hover': !isSelected ? {
                                                background: 'rgba(255,255,255,0.08)',
                                                border: '1px solid rgba(255,255,255,0.15)',
                                            } : {},
                                        }}
                                    >
                                        <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                                            <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                                                <Box>
                                                    <Typography variant="caption" fontWeight={800} sx={{
                                                        opacity: isSelected ? 0.9 : 0.6,
                                                        letterSpacing: 0.5, color: '#fff',
                                                    }}>
                                                        {pump}
                                                    </Typography>
                                                    <Box display="flex" alignItems="baseline" gap={0.5} mt={0.5}>
                                                        <Typography sx={{ fontSize: 13, opacity: 0.7, color: '#fff', fontWeight: 700 }}>₹</Typography>
                                                        <Typography variant="h3" fontWeight={900} sx={{ color: '#fff', lineHeight: 1 }}>
                                                            {latest?.rate ?? 90}
                                                        </Typography>
                                                        <Typography sx={{ fontSize: 14, opacity: 0.6, color: '#fff', fontWeight: 700 }}>/L</Typography>
                                                    </Box>
                                                </Box>
                                                <Box sx={{
                                                    p: 1, borderRadius: '10px',
                                                    bgcolor: isSelected ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.07)',
                                                }}>
                                                    <LocalGasStationIcon sx={{ fontSize: 20, color: isSelected ? '#fff' : 'rgba(255,255,255,0.4)' }} />
                                                </Box>
                                            </Box>
                                            {latest && (
                                                <Typography variant="caption" sx={{ opacity: 0.5, fontSize: '10px', mt: 1, display: 'block', color: '#fff' }}>
                                                    Effective from {new Date(latest.effectiveDate).toLocaleDateString('en-IN')}
                                                </Typography>
                                            )}
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </Box>

                        {/* ── History List (Embedded in left col) ── */}
                        <Box sx={{ mt: 5 }}>
                             <Box display="flex" alignItems="center" gap={1} mb={2}>
                                <HistoryIcon sx={{ fontSize: 18, opacity: 0.5 }} />
                                <Typography variant="caption" fontWeight={800} sx={{ opacity: 0.5, letterSpacing: 1 }}>
                                    HISTORY — {selectedPump}
                                </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                                {pumpHistory.length === 0 ? (
                                    <Typography variant="caption" sx={{ opacity: 0.3, fontStyle: 'italic' }}>No history found</Typography>
                                ) : pumpHistory.map((item, idx) => (
                                    <Box key={item._id || idx} sx={{
                                        p: 1.5, borderRadius: '12px',
                                        bgcolor: 'rgba(255,255,255,0.03)',
                                        border: '1px solid rgba(255,255,255,0.05)',
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                    }}>
                                        <Box>
                                            <Typography variant="body2" fontWeight={800}>₹{item.rate}</Typography>
                                            <Typography variant="caption" sx={{ opacity: 0.5 }}>
                                                {new Date(item.effectiveDate).toLocaleDateString('en-IN')}
                                            </Typography>
                                        </Box>
                                        {idx === 0 && (
                                            <Chip label="Active" size="small" sx={{ height: 18, fontSize: '9px', fontWeight: 900, bgcolor: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.2)' }} />
                                        )}
                                    </Box>
                                ))}
                            </Box>
                        </Box>
                    </Box>

                    {/* ── Middle: Rate Editor ──────────────────────────────── */}
                    <Box sx={{ flex: 1 }}>
                        <Typography variant="caption" fontWeight={800} sx={{ opacity: 0.5, letterSpacing: 1, mb: 1.5, display: 'block' }}>
                            UPDATE PRICE SCHEDULER
                        </Typography>

                        <Paper sx={{
                            bgcolor: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '24px',
                            p: 4,
                            mb: 3,
                            backgroundImage: 'none'
                        }}>
                            {/* Pump Indicator */}
                            <Box display="flex" alignItems="center" gap={1.5} mb={4}>
                                <Box sx={{ width: 40, height: 40, borderRadius: '12px', bgcolor: 'rgba(96,165,250,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(96,165,250,0.2)' }}>
                                    <LocalGasStationIcon sx={{ color: '#60a5fa' }} />
                                </Box>
                                <Box>
                                    <Typography variant="h6" fontWeight={900}>{selectedPump}</Typography>
                                    <Typography variant="caption" sx={{ opacity: 0.5 }}>Configuring rate schedule</Typography>
                                </Box>
                            </Box>

                            {/* Date Selection */}
                            <Box sx={{ mb: 4 }}>
                                <Typography variant="caption" fontWeight={800} sx={{ opacity: 0.5, letterSpacing: 1, mb: 1, display: 'block' }}>
                                    EFFECTIVE DATE
                                </Typography>
                                <TextField
                                    fullWidth
                                    type="date"
                                    value={dateInput}
                                    onChange={e => setDateInput(e.target.value)}
                                    InputProps={{
                                        startAdornment: <EventIcon sx={{ color: '#60a5fa', mr: 1, fontSize: 20 }} />,
                                        sx: {
                                            color: '#fff',
                                            fontWeight: 800,
                                            borderRadius: '16px',
                                            bgcolor: 'rgba(255,255,255,0.05)',
                                            '& input::-webkit-calendar-picker-indicator': { filter: 'invert(1)' }
                                        }
                                    }}
                                />
                                <Typography variant="caption" sx={{ mt: 1, display: 'block', opacity: 0.4, fontStyle: 'italic' }}>
                                    The rate will apply to all slips on or after this date.
                                </Typography>
                            </Box>

                            {/* Rate Input */}
                            <Box sx={{ mb: 4 }}>
                                <Typography variant="caption" fontWeight={800} sx={{ opacity: 0.5, letterSpacing: 1, mb: 1, display: 'block' }}>
                                    DIESEL RATE (₹ per Litre)
                                </Typography>
                                <Box sx={{
                                    display: 'flex', alignItems: 'center',
                                    bgcolor: 'rgba(255,255,255,0.08)',
                                    borderRadius: '20px',
                                    border: '2px solid rgba(96,165,250,0.3)',
                                    px: 3, py: 1,
                                    '&:focus-within': { borderColor: 'rgba(96,165,250,0.7)' },
                                }}>
                                    <Typography sx={{ fontSize: 32, fontWeight: 900, opacity: 0.6, mr: 1.5 }}>₹</Typography>
                                    <input
                                        type="number"
                                        value={rateInput}
                                        onChange={e => setRateInput(e.target.value)}
                                        style={{
                                            background: 'transparent', border: 'none', outline: 'none',
                                            color: '#fff', fontSize: '64px', fontWeight: 900,
                                            width: '100%', lineHeight: 1,
                                        }}
                                        placeholder="0"
                                        step="0.01"
                                    />
                                    <Typography sx={{ fontSize: 24, fontWeight: 700, opacity: 0.5, ml: 1 }}>/L</Typography>
                                </Box>
                            </Box>

                            {/* Impact Warning */}
                            <Box sx={{
                                p: 2, borderRadius: '16px',
                                bgcolor: 'rgba(245,158,11,0.05)',
                                border: '1px solid rgba(245,158,11,0.15)',
                                mb: 4
                            }}>
                                <Typography variant="caption" sx={{ color: '#fbbf24', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
                                    ⚠️ SYSTEM IMPACT
                                </Typography>
                                <Typography variant="caption" sx={{ color: '#fbbf24', opacity: 0.8, display: 'block', mt: 0.5 }}>
                                    Changing the rate for a date will automatically update all HSD calculations in the Cement Register from that date onwards.
                                </Typography>
                            </Box>

                            {/* Save button */}
                            <Button
                                fullWidth
                                variant="contained"
                                size="large"
                                startIcon={saving ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : <SaveIcon />}
                                disabled={saving || isNaN(newRate) || newRate <= 0}
                                onClick={handleSave}
                                sx={{
                                    py: 2, borderRadius: '18px', fontWeight: 900, fontSize: 16,
                                    background: 'linear-gradient(45deg, #1565c0 0%, #1976d2 100%)',
                                    boxShadow: '0 8px 24px rgba(25,118,210,0.4)',
                                    '&:hover': { boxShadow: '0 12px 32px rgba(25,118,210,0.55)', transform: 'translateY(-1px)' },
                                    '&:disabled': { opacity: 0.4 },
                                    transition: 'all 0.2s',
                                }}
                            >
                                {saving ? 'Scheduling Update...' : `Apply New Rate`}
                            </Button>
                        </Paper>
                    </Box>
                </Box>
            )}

            <Snackbar
                open={!!snack}
                autoHideDuration={4500}
                onClose={() => setSnack(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert severity={snack?.sev || 'info'} onClose={() => setSnack(null)} sx={{ fontWeight: 700 }}>
                    {snack?.msg}
                </Alert>
            </Snackbar>
        </Box>
    );
}

const Chip = ({ label, size, sx }) => (
    <Box sx={{
        px: 1, py: 0.2, borderRadius: '6px',
        display: 'inline-flex', alignItems: 'center',
        ...sx
    }}>
        <Typography sx={{ fontSize: 'inherit', fontWeight: 'inherit' }}>{label}</Typography>
    </Box>
);
