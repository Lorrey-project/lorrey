import React, { useState, useEffect, useRef } from 'react';
import {
    Box, Typography, TextField, Button, Grid, Card, CardContent,
    CircularProgress, Snackbar, Alert, Paper, Divider, InputAdornment, IconButton, Chip,
    Fade, Container, Backdrop
} from '@mui/material';
import axios from 'axios';
import html2pdf from 'html2pdf.js';
import { API_URL } from '../config';
import { toIndianWords } from '../utils/toIndianWords';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PrintIcon from '@mui/icons-material/Print';
import DownloadIcon from '@mui/icons-material/Download';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber';
import SpeedIcon from '@mui/icons-material/Speed';
import CurrencyRupeeIcon from '@mui/icons-material/CurrencyRupee';
import FuelSlipDocument from './FuelSlipDocument';

const FuelSlipReview = ({ invoiceId, onBack, onOpenVoucher }) => {
    const entrySlipRef = useRef();
    const reviewSlipRef = useRef();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeStep, setActiveStep] = useState('entry'); // 'entry' or 'review'
    const [invoiceData, setInvoiceData] = useState(null);
    const [fuelData, setFuelData] = useState({
        stationName: '',
        stationAddress: '',
        lorrySlipNo: '',
        qty: '',
        rate: '',
        amount: 0
    });
    const [snack, setSnack] = useState(null);

    // Zoom state
    const [zoom, setZoom] = useState(0.85);
    const ZOOM_STEP = 0.1;
    const ZOOM_MAX = 2.0;
    const ZOOM_MIN = 0.3;
    const zoomIn = () => setZoom(prev => Math.min(prev + ZOOM_STEP, ZOOM_MAX));
    const zoomOut = () => setZoom(prev => Math.max(prev - ZOOM_STEP, ZOOM_MIN));
    const zoomReset = () => setZoom(0.85);

    useEffect(() => {
        if (invoiceId) {
            fetchInvoiceData();
        }
    }, [invoiceId]);

    const fetchInvoiceData = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get(`${API_URL}/invoice/lorry-data/${invoiceId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const inv = response.data;
            setInvoiceData(inv);

            // Prefill with existing lorry slip details
            const lsd = inv.lorry_hire_slip_data || {};
            const autoData = {
                stationName: 'SAS',
                stationAddress: 'Panagarh',
                lorrySlipNo: lsd.lorry_hire_slip_no || '',
                qty: lsd.diesel_litres || '',
                rate: lsd.diesel_rate || 0,
                amount: lsd.diesel_advance || 0
            };
            setFuelData(autoData);
            // Auto trigger generation next tick
            setTimeout(() => {
                if (entrySlipRef.current && !savingRef.current) {
                    handleSaveAndGenerate(autoData);
                }
            }, 500);
        } catch (error) {
            console.error('Error fetching invoice for fuel slip:', error);
            setSnack({ type: 'error', message: 'Failed to load invoice data' });
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFuelData(prev => ({ ...prev, [name]: value }));
    };

    const getAmountWords = (amt) => {
        return toIndianWords(amt);
    };

    const hsdSlipNo = invoiceData?.lorry_hire_slip_data?.fuel_slip_no || 'AUTO-GEN';
    const slipDate = new Date().toLocaleDateString('en-IN');
    const amountWords = getAmountWords(fuelData.amount);

    const qrPayload = JSON.stringify({
        hsd_slip: hsdSlipNo,
        date: slipDate,
        vehicle: invoiceData?.human_verified_data?.supply_details?.vehicle_number || '',
        lorry_slip: fuelData.lorrySlipNo,
        station: fuelData.stationName,
        qty: fuelData.qty,
        rate: fuelData.rate,
        amount: Number(fuelData.amount).toFixed(2)
    });

    const savingRef = useRef(false);

    const handleSaveAndGenerate = async (explicitData = null) => {
        if (savingRef.current) return;
        savingRef.current = true;
        setSaving(true);
        const dataToSave = explicitData || fuelData;
        try {
            // 1. Generate PDF
            const opt = {
                margin: 0,
                filename: `fuel_slip_${invoiceId}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 3, useCORS: true },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };

            const blob = await html2pdf().set(opt).from(entrySlipRef.current).output('blob');

            // 2. Upload to S3 & Save to MongoDB
            const formData = new FormData();
            formData.append('invoice_id', invoiceId);
            formData.append('slip_data', JSON.stringify({
                station_name: dataToSave.stationName,
                station_address: dataToSave.stationAddress,
                diesel_litres: dataToSave.qty,
                diesel_rate: dataToSave.rate,
                diesel_advance: dataToSave.amount
            }));
            formData.append('softcopy', blob, `fuel_slip_${invoiceId}.pdf`);

            const token = localStorage.getItem('token');
            console.log('Sending Fuel Slip for invoice:', invoiceId);
            const res = await axios.post(`${API_URL}/invoice/fuel-slip-softcopy`, formData, {
                headers: { 'Content-Type': 'multipart/form-data', 'Authorization': `Bearer ${token}` }
            });

            console.log('Fuel Slip save response:', res.data);
            setSnack({ type: 'success', message: 'Fuel Slip generated and stored successfully!' });
            setActiveStep('review');
        } catch (error) {
            console.error('Error saving fuel slip:', error);
            const msg = error.response?.data?.error || error.message;
            setSnack({ type: 'error', message: 'Failed to upload/save Fuel Slip: ' + msg });
        } finally {
            setSaving(false);
            savingRef.current = false;
        }
    };

    const handleDownload = async () => {
        if (!reviewSlipRef.current) {
            setSnack({
                type: 'error',
                message: 'Document reference not found. This usually happens if the preview is still loading. Please wait a moment and try again.'
            });
            return;
        }

        try {
            setSnack({ type: 'info', message: 'Generating high-quality PDF...' });
            const opt = {
                margin: 0,
                filename: `fuel_slip_${hsdSlipNo}.pdf`,
                image: { type: 'jpeg', quality: 1.0 },
                html2canvas: { scale: 3, useCORS: true, logging: false },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };
            await html2pdf().set(opt).from(reviewSlipRef.current).save();
            setSnack({ type: 'success', message: 'Download started!' });
        } catch (error) {
            console.error('Download error:', error);
            setSnack({ type: 'error', message: 'Failed to generate PDF download' });
        }
    };

    if (loading) return (
        <Box display="flex" justifyContent="center" alignItems="center" height="100vh" sx={{ background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)' }}>
            <CircularProgress size={60} thickness={4} />
        </Box>
    );

    return (
      <Box position="relative">
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="center"
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 1100,
            backgroundColor: '#fff',
            borderBottom: '1px solid #ddd',
            px: 3,
            py: 1.5,
            boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
          }}
          className="no-print"
        >
          <Box display="flex" flexWrap="wrap" gap={1.5} justifyContent="space-between" alignItems="center" sx={{ width: '100%' }}>

            {/* Nav Group */}
            <Box display="flex" gap={1} sx={{ flex: { xs: '1 1 100%', md: '0 1 auto' }, order: { xs: 1, md: 1 } }}>
              <Button variant="outlined" size="small" onClick={activeStep === 'review' ? () => setActiveStep('entry') : onBack} sx={{ flex: { xs: 1, md: 'none' } }}>
                ← Back
              </Button>
              <Button variant="outlined" size="small" onClick={() => window.location.href = '/'} sx={{ flex: { xs: 1, md: 'none' } }}>
                🏠 Home
              </Button>
            </Box>

            {/* Zoom Tool */}
            <Box display="flex" justifyContent="center" sx={{ flex: { xs: '1 1 100%', md: '0 1 auto' }, order: { xs: 3, md: 2 }, opacity: activeStep === 'entry' ? 0.3 : 1, pointerEvents: activeStep === 'entry' ? 'none' : 'auto' }}>
              <Box display="flex" alignItems="center" sx={{ bgcolor: '#f8f9fa', border: '1px solid #e2e8f0', borderRadius: '8px', px: 0.5, py: 0.25 }}>
                <IconButton size="small" onClick={zoomOut} disabled={zoom <= ZOOM_MIN} sx={{ p: 0.5, width: 28, height: 28 }}><span style={{ fontSize: '1.2rem', lineHeight: 1 }}>−</span></IconButton>
                <Box onClick={zoomReset} sx={{ fontWeight: 600, fontSize: '0.85rem', width: 46, textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}>{Math.round(zoom * 100)}%</Box>
                <IconButton size="small" onClick={zoomIn} disabled={zoom >= ZOOM_MAX} sx={{ p: 0.5, width: 28, height: 28 }}><span style={{ fontSize: '1.2rem', lineHeight: 1 }}>+</span></IconButton>
              </Box>
            </Box>

            {/* Actions Group */}
            <Box display="flex" gap={1} sx={{ flex: { xs: '1 1 100%', md: '0 1 auto' }, order: { xs: 2, md: 3 } }}>
                {activeStep === 'review' ? (
                    <>
                        <Button variant="outlined" size="small" startIcon={<PrintIcon />} onClick={() => window.print()} sx={{ flex: 1, borderRadius: 2 }}>Print Document</Button>
                        <Button variant="contained" size="small" startIcon={<DownloadIcon />} onClick={handleDownload} disabled={saving} sx={{ flex: 1, borderRadius: 2 }}>Save PDF</Button>
                    </>
                ) : (
                    <Box sx={{ width: 150, display: { xs: 'none', md: 'block' } }} /> // Spacer to keep layout balanced
                )}
            </Box>

          </Box>
        </Box>

        <Box sx={{ width: '100%', height: '100svh', overflow: 'auto', backgroundColor: '#f0f0f0', p: { xs: 2, sm: 4, md: 10 }, pt: { xs: 16, sm: 14 }, textAlign: 'center', '@media print': { height: 'auto !important', overflow: 'visible !important', display: 'block !important', position: 'static !important', p: 0, pt: 0, backgroundColor: 'transparent' } }}>
            {activeStep === 'entry' && (
                <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" py={10} className="no-print">
                    <CircularProgress size={50} sx={{ mb: 3 }} />
                    <Typography variant="h5" color="text.secondary" fontWeight="700">Auto-generating Fuel Slip...</Typography>
                </Box>
            )}

            <Box sx={{ display: activeStep === 'entry' ? 'none' : 'inline-block', textAlign: 'left', zoom: zoom, transition: 'zoom 0.2s cubic-bezier(0.4,0,0.2,1)', boxShadow: '0 20px 60px rgba(0,0,0,0.1)', '@media print': { zoom: '1 !important', display: 'block !important', boxShadow: 'none' } }}>
                <FuelSlipDocument
                    ref={reviewSlipRef}
                    data={invoiceData}
                    fuelData={fuelData}
                    hsdSlipNo={hsdSlipNo}
                    slipDate={slipDate}
                    amountWords={amountWords}
                    qrPayload={qrPayload}
                />
            </Box>

            {/* Hidden generation layer */}
            {activeStep === 'entry' && (
                <Box sx={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
                    <FuelSlipDocument
                        ref={entrySlipRef}
                        data={invoiceData}
                        fuelData={fuelData}
                        hsdSlipNo={hsdSlipNo}
                        slipDate={slipDate}
                        amountWords={amountWords}
                        qrPayload={qrPayload}
                    />
                </Box>
            )}
        </Box>

        {/* Professional Upload Backdrop */}
        <Backdrop
            sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1, backdropFilter: 'blur(8px)', flexDirection: 'column' }}
            open={saving}
        >
            <CircularProgress color="inherit" size={60} thickness={4} sx={{ mb: 2 }} />
            <Typography variant="h6" fontWeight="700">Uploading to Secure Storage...</Typography>
            <Typography variant="caption" sx={{ opacity: 0.7 }}>Please wait while we sync with S3 and MongoDB</Typography>
        </Backdrop>

        <Snackbar open={!!snack} autoHideDuration={6000} onClose={() => setSnack(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
            <Alert severity={snack?.type || 'info'} variant="filled" onClose={() => setSnack(null)} sx={{ borderRadius: '16px', fontWeight: 700, boxShadow: '0 8px 30px rgba(0,0,0,0.2)' }}>
                {snack?.message}
            </Alert>
        </Snackbar>

        <style dangerouslySetInnerHTML={{
            __html: `
                @media print {
                    .no-print { display: none !important; }
                    body { background: #fff !important; margin: 0 !important; }
                }
            `
        }} />
      </Box>
    );
};

export default FuelSlipReview;
