import React, { useEffect, useState } from 'react';
import {
    Box, Typography, Button, Card, CardContent,
    Snackbar, Alert, Divider, CircularProgress
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import SaveIcon from '@mui/icons-material/Save';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const PUMPS = ['SAS-1', 'SAS-2'];

export default function FuelRateSettings({ onBack }) {
    const [fuelRates, setFuelRates] = useState({ 'SAS-1': 90, 'SAS-2': 90 });
    const [selectedPump, setSelectedPump] = useState('SAS-1');
    const [rateInput, setRateInput] = useState('');
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [snack, setSnack] = useState(null);
    const [lastUpdated, setLastUpdated] = useState({});

    useEffect(() => {
        fetchRates();
    }, []);

    // When pump selection changes, pre-fill the input with the current rate
    useEffect(() => {
        setRateInput(String(fuelRates[selectedPump] ?? 90));
    }, [selectedPump, fuelRates]);

    const fetchRates = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`${API_URL}/pump-payment/fuel-rates`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data.success) {
                setFuelRates(res.data.rates);
                setRateInput(String(res.data.rates['SAS-1'] ?? 90));
            }
        } catch (e) {
            setSnack({ msg: 'Failed to load rates', sev: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        const rateVal = parseFloat(rateInput);
        if (isNaN(rateVal) || rateVal <= 0) {
            setSnack({ msg: 'Rate must be a positive number', sev: 'error' });
            return;
        }
        setSaving(true);
        try {
            const token = localStorage.getItem('token');
            await axios.put(`${API_URL}/pump-payment/fuel-rates`,
                { pumpName: selectedPump, rate: rateVal },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setFuelRates(p => ({ ...p, [selectedPump]: rateVal }));
            setLastUpdated(p => ({ ...p, [selectedPump]: new Date() }));
            setSnack({ msg: `${selectedPump} rate updated to ₹${rateVal}/L`, sev: 'success' });
        } catch (e) {
            setSnack({ msg: e.response?.data?.error || 'Failed to save rate', sev: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const currentRate = fuelRates[selectedPump] ?? 90;
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
                        Office Admin — Restricted Access
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
                    flexDirection: { xs: 'column', md: 'row' },
                    gap: 3,
                    px: { xs: 2, md: 5 },
                    py: 4,
                    maxWidth: 1100,
                    width: '100%',
                    mx: 'auto',
                }}>
                    {/* ── Left: Current Rates Summary ─────────────────────── */}
                    <Box sx={{ width: { xs: '100%', md: 300 }, flexShrink: 0 }}>
                        <Typography variant="caption" fontWeight={800} sx={{ opacity: 0.5, letterSpacing: 1, mb: 1.5, display: 'block' }}>
                            CURRENT RATES
                        </Typography>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {PUMPS.map(pump => {
                                const isSelected = pump === selectedPump;
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
                                            boxShadow: isSelected
                                                ? '0 8px 32px rgba(25,118,210,0.35)'
                                                : 'none',
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
                                                        letterSpacing: 0.5,
                                                        color: '#fff',
                                                    }}>
                                                        {pump}
                                                    </Typography>
                                                    <Box display="flex" alignItems="baseline" gap={0.5} mt={0.5}>
                                                        <Typography sx={{ fontSize: 13, opacity: 0.7, color: '#fff', fontWeight: 700 }}>₹</Typography>
                                                        <Typography variant="h3" fontWeight={900} sx={{ color: '#fff', lineHeight: 1 }}>
                                                            {fuelRates[pump] ?? 90}
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
                                            {lastUpdated[pump] && (
                                                <Typography variant="caption" sx={{ opacity: 0.5, fontSize: '10px', mt: 1, display: 'block', color: '#fff' }}>
                                                    Updated {lastUpdated[pump].toLocaleTimeString()}
                                                </Typography>
                                            )}
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </Box>
                    </Box>

                    {/* ── Right: Rate Editor ──────────────────────────────── */}
                    <Box sx={{ flex: 1 }}>
                        <Typography variant="caption" fontWeight={800} sx={{ opacity: 0.5, letterSpacing: 1, mb: 1.5, display: 'block' }}>
                            SET NEW RATE — {selectedPump}
                        </Typography>

                        {/* Big rate input */}
                        <Box sx={{
                            bgcolor: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '20px',
                            p: 4,
                            mb: 3,
                        }}>
                            <Typography variant="caption" fontWeight={700} sx={{ opacity: 0.5, letterSpacing: 1, mb: 2, display: 'block' }}>
                                DIESEL RATE (₹ per Litre)
                            </Typography>
                            <Box sx={{
                                display: 'flex', alignItems: 'center',
                                bgcolor: 'rgba(255,255,255,0.08)',
                                borderRadius: '16px',
                                border: '2px solid rgba(96,165,250,0.3)',
                                px: 3, py: 2, mb: 2,
                                transition: 'border-color 0.2s',
                                '&:focus-within': { borderColor: 'rgba(96,165,250,0.7)' },
                            }}>
                                <Typography sx={{ fontSize: 28, fontWeight: 900, opacity: 0.6, mr: 1.5 }}>₹</Typography>
                                <input
                                    type="number"
                                    value={rateInput}
                                    onChange={e => setRateInput(e.target.value)}
                                    style={{
                                        background: 'transparent', border: 'none', outline: 'none',
                                        color: '#fff', fontSize: '56px', fontWeight: 900,
                                        width: '100%', lineHeight: 1,
                                    }}
                                    placeholder="0"
                                    step="0.5"
                                    min="1"
                                    autoFocus
                                />
                                <Typography sx={{ fontSize: 20, fontWeight: 700, opacity: 0.5, ml: 1 }}>/L</Typography>
                            </Box>

                            {/* Change Preview */}
                            <Box sx={{
                                bgcolor: 'rgba(255,255,255,0.04)',
                                borderRadius: '12px',
                                p: 2,
                                border: '1px solid rgba(255,255,255,0.07)',
                            }}>
                                <Typography variant="caption" fontWeight={700} sx={{ opacity: 0.4, letterSpacing: 0.5, display: 'block', mb: 1.5 }}>
                                    CHANGE PREVIEW
                                </Typography>
                                <Box display="flex" alignItems="center" gap={3} flexWrap="wrap">
                                    <Box>
                                        <Typography variant="caption" sx={{ opacity: 0.5, display: 'block' }}>Current</Typography>
                                        <Typography variant="h5" fontWeight={900}>₹{currentRate}<Typography component="span" variant="caption" sx={{ opacity: 0.5 }}>/L</Typography></Typography>
                                    </Box>
                                    <Typography sx={{ fontSize: 28, opacity: 0.3 }}>→</Typography>
                                    <Box>
                                        <Typography variant="caption" sx={{ opacity: 0.5, display: 'block' }}>New</Typography>
                                        <Typography variant="h5" fontWeight={900} sx={{ color: isNaN(newRate) ? 'inherit' : '#60a5fa' }}>
                                            {isNaN(newRate) ? '—' : `₹${newRate}`}<Typography component="span" variant="caption" sx={{ opacity: 0.5 }}>/L</Typography>
                                        </Typography>
                                    </Box>
                                    {diff !== 0 && !isNaN(newRate) && (
                                        <Box sx={{
                                            ml: 'auto',
                                            px: 2, py: 1,
                                            bgcolor: diff > 0 ? 'rgba(248,113,113,0.15)' : 'rgba(52,211,153,0.15)',
                                            borderRadius: '10px',
                                            border: `1px solid ${diffColor}40`,
                                        }}>
                                            <Typography fontWeight={900} sx={{ color: diffColor, fontSize: 18 }}>
                                                {diff > 0 ? '+' : ''}{diff.toFixed(2)} ₹/L
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: diffColor, opacity: 0.8, fontWeight: 700 }}>
                                                {diff > 0 ? '↑ Increase' : '↓ Decrease'}
                                            </Typography>
                                        </Box>
                                    )}
                                    {diff === 0 && !isNaN(newRate) && (
                                        <Box sx={{ ml: 'auto', px: 2, py: 1, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: '10px' }}>
                                            <Typography variant="caption" sx={{ opacity: 0.4 }}>No change</Typography>
                                        </Box>
                                    )}
                                </Box>
                            </Box>
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
                                py: 1.8, borderRadius: '16px', fontWeight: 900, fontSize: 16,
                                background: 'linear-gradient(45deg, #1565c0 0%, #1976d2 100%)',
                                boxShadow: '0 8px 24px rgba(25,118,210,0.4)',
                                '&:hover': { boxShadow: '0 12px 32px rgba(25,118,210,0.55)', transform: 'translateY(-1px)' },
                                '&:disabled': { opacity: 0.4 },
                                transition: 'all 0.2s',
                            }}
                        >
                            {saving ? 'Saving...' : `Save Rate for ${selectedPump}`}
                        </Button>
                    </Box>
                </Box>
            )}

            <Snackbar
                open={!!snack}
                autoHideDuration={3500}
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
