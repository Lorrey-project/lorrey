import React, { useState, useEffect, useRef } from 'react';
import {
    Box, Container, Typography, TextField, Button, Paper, Grid,
    Divider, CircularProgress, Snackbar, Alert, IconButton, Chip,
    Stepper, Step, StepLabel, Card, CardContent,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import SaveIcon from '@mui/icons-material/Save';
import DownloadIcon from '@mui/icons-material/Download';
import PrintIcon from '@mui/icons-material/Print';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import PersonIcon from '@mui/icons-material/Person';
import BusinessIcon from '@mui/icons-material/Business';
import InventoryIcon from '@mui/icons-material/Inventory';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ReceiptIcon from '@mui/icons-material/Receipt';
import DescriptionIcon from '@mui/icons-material/Description';
import axios from 'axios';
import html2pdf from 'html2pdf.js';
import LorryHireSlipDocument from './LorryHireSlipDocument';
import { API_URL } from '../config';

const STEPS = ['Review Details', 'Generate Slip'];

/* ─── Helpers ───────────────────────────────────────────────────────────── */
export const buildGcnDataFromInvoice = (data) => {
    const inv = data?.human_verified_data || data?.ai_data?.invoice_data || (data?.invoice_details ? data : {});
    const details = inv?.invoice_details || {};
    const seller = inv?.seller_details || {};
    const buyer = inv?.buyer_details || {};
    const consignee = inv?.consignee_details || {};
    const supply = inv?.supply_details || {};
    const ewb = inv?.ewb_details || {};
    const items = inv?.items || [];
    const amount = inv?.amount_summary || {};
    const firstItem = items[0] || {};

    const rawDate = details.invoice_date || '';
    let fyDate = new Date();
    if (rawDate) {
        const parts = rawDate.includes('/') ? rawDate.split('/') : null;
        if (parts?.length === 3) fyDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
        else { const p = new Date(rawDate); if (!isNaN(p)) fyDate = p; }
    }
    const month = fyDate.getMonth() + 1;
    const yr = fyDate.getFullYear();
    const fyStart = month >= 4 ? yr : yr - 1;
    const fyShort = `${String(fyStart).slice(-2)}-${String(fyStart + 1).slice(-2)}`;
    const ref = details.reference_number || '';
    const gcnNo = supply.lorrey_receipt_number || (inv?.gcn_data?.gcn_no && inv.gcn_data.gcn_no !== '' ? inv.gcn_data.gcn_no : `DAC/${fyShort}/?`);

    return {
        company_name: 'DIPALI ASSOCIATES & CO.',
        gcn_no: gcnNo,
        gcn_date: details.invoice_date || new Date().toLocaleDateString('en-IN'),
        company_site_office_address: '1st Floor, Panja Hotel, Darjeeling More, Panagarh',
        company_phone_number: '7810935738 / 8116221063 / 9474485192',
        company_email: 'dipaliassociates.durgapur@gmail.com',
        company_gst: '19AATFD1733C1ZH',
        consignor_name: seller.seller_name || buyer.buyer_name || '',
        consignee_name: consignee.consignee_name || '',
        consignee_address: consignee.consignee_address || '',
        destination: supply.destination || '',
        consignee_pincode: consignee.consignee_pincode || '',
        truck_no: supply.vehicle_number || '',
        agent_name: supply.transporter_name || '',
        invoice_no: details.invoice_number || '',
        shipment_no: supply.shipment_number || '',
        challan_number: supply.challan_number || '',
        e_way_bill_number: ewb.ewb_number || '',
        e_way_bill_creation_date: ewb.ewb_create_date || '',
        e_way_bill_creation_time: ewb.ewb_create_time || '',
        e_way_bill_validUpto_date: ewb.ewb_valid_date || '',
        e_way_bill_validUpto_time: ewb.ewb_valid_time || '',
        material: firstItem.description_of_product || firstItem.material_code || '',
        bags: String(supply.bags || firstItem.bags || ''),
        qty_mt: String(firstItem.quantity || ''),
        material_value: String(amount.net_payable || firstItem.taxable_value || ''),
    };
};

/* ─── Small helper component ─────────────────────────────────────────────── */
const InfoRow = ({ label, value, mono }) => (
    value ? (
        <Box sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            py: 0.8,
            borderBottom: '1px solid #f1f5f9',
            transition: 'background-color 0.2s',
            '&:hover': { bgcolor: '#f8fafc' },
            px: 0.5,
        }}>
            <Typography variant="body2" sx={{ color: '#64748b', flexShrink: 0, fontWeight: 500, fontSize: '0.85rem' }}>
                {label}
            </Typography>
            <Typography variant="body2" sx={{
                fontWeight: 700,
                textAlign: 'right',
                wordBreak: 'break-word',
                fontSize: '0.9rem',
                fontFamily: mono ? '"Roboto Mono", monospace' : 'inherit',
                color: '#1e293b',
            }}>
                {value}
            </Typography>
        </Box>
    ) : null
);

const SectionCard = ({ icon, title, color = '#3b82f6', children }) => (
    <Card sx={{ 
        height: '100%',
        overflow: 'visible', 
        borderRadius: 3, 
        border: '1px solid #e2e8f0',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.02)',
        transition: 'transform 0.2s, box-shadow 0.2s',
        '&:hover': {
            transform: 'translateY(-1px)',
            boxShadow: '0 4px 15px rgba(0, 0, 0, 0.04)'
        }
    }}>
        <Box sx={{ 
            bgcolor: '#ffffff',
            px: 2, 
            py: 1.5,
            borderBottom: '1px solid #f1f5f9',
            display: 'flex', 
            alignItems: 'center', 
            gap: 1.5,
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12
        }}>
            <Box sx={{ 
                bgcolor: color, 
                p: 0.8, 
                borderRadius: 2, 
                display: 'flex', 
                color: '#fff',
                boxShadow: `0 4px 12px ${color}40`
            }}>
                {React.cloneElement(icon, { sx: { fontSize: 18 } })}
            </Box>
            <Typography variant="subtitle2" fontWeight="800" sx={{ color: color, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                {title}
            </Typography>
        </Box>
        <CardContent sx={{ px: 3, py: 2, '&:last-child': { pb: 2 } }}>
            {children}
        </CardContent>
    </Card>
);

/* ─── Main Component ──────────────────────────────────────────────────────── */
const LorryHireSlipReview = ({ invoiceId, onBack, formData: propFormData, onOpenFuelSlip }) => {
    const [step, setStep] = useState(0); // 0 = review, 1 = document
    const [invoiceData, setInvoiceData] = useState(null);
    const [gcnData, setGcnData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savedUrl, setSavedUrl] = useState(null);
    const [snack, setSnack] = useState(null);

    // Zoom state for document preview
    const [zoom, setZoom] = useState(0.85);
    const ZOOM_STEP = 0.1;
    const ZOOM_MAX = 2.0;
    const ZOOM_MIN = 0.3;
    const zoomIn = () => setZoom(prev => Math.min(prev + ZOOM_STEP, ZOOM_MAX));
    const zoomOut = () => setZoom(prev => Math.max(prev - ZOOM_STEP, ZOOM_MIN));
    const zoomReset = () => setZoom(0.85);

    // Editable advance fields
    const [loadingAdv, setLoadingAdv] = useState('');
    const [dieselLtrs, setDieselLtrs] = useState('');
    const [dieselRate, setDieselRate] = useState('0');

    // Required fuel (auto-calculated, read-only)
    const [fuelRequirement, setFuelRequirement] = useState(null);  // { required_fuel_litres, distance_km, mileage_kmpl, vehicle_type, wheels }
    const [fuelLoading, setFuelLoading] = useState(false);
    const [fuelError, setFuelError] = useState('');

    // Derived
    const dieselAdv = (parseFloat(dieselLtrs) || 0) * (parseFloat(dieselRate) || 0);
    const totalAdv = (parseFloat(loadingAdv) || 0) + dieselAdv;

    // Random slip numbers, fixed on mount
    const [slipNo] = useState(() => String(Math.floor(100000 + Math.random() * 900000)));
    const [fuelSlipNo] = useState(() => String(Math.floor(1000 + Math.random() * 90000)));

    const docRef = useRef();

    // ── Fetch invoice + truck contact ──────────────────────────────────────
    useEffect(() => {
        const load = async () => {
            try {
                const token = localStorage.getItem('token');
                let inv = propFormData;

                if (!inv) {
                    const res = await axios.get(`${API_URL}/invoice/lorry-data/${invoiceId}`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    inv = res.data;
                }
                setInvoiceData(inv);

                // Pre-fill advance if already saved
                if (inv?.lorry_hire_slip_data?.lorry_hire_slip_url) {
                    setSavedUrl(inv.lorry_hire_slip_data.lorry_hire_slip_url);
                    setLoadingAdv(String(inv.lorry_hire_slip_data.loading_advance ?? ''));
                    setDieselLtrs(String(inv.lorry_hire_slip_data.diesel_litres ?? ''));
                    if (inv.lorry_hire_slip_data.diesel_rate != null) {
                        setDieselRate(inv.lorry_hire_slip_data.diesel_rate);
                    }
                }

                const derived = buildGcnDataFromInvoice(inv);
                const truckNo = derived.truck_no;
                let dbContact = {};
                if (truckNo) {
                    try {
                        const tc = await axios.get(
                            `${API_URL}/invoice/truck-contact/${encodeURIComponent(truckNo)}`,
                            { headers: { Authorization: `Bearer ${token}` } }
                        );
                        if (tc.data.found) {
                            dbContact = tc.data;
                        }
                    } catch (_) { }
                }

                const savedGcn = inv?.gcn_data || {};
                const finalGcnData = {
                    ...derived,
                    ...savedGcn,
                    agent_name: dbContact.owner || savedGcn.agent_name || derived.agent_name || '',
                    owner_agent_contact: dbContact.contact || savedGcn.owner_agent_contact || '',
                    driver_name: dbContact.driver_name || savedGcn.driver_name || '',
                    driver_license_no: dbContact.license_no || savedGcn.driver_license_no || '',
                    owner_agent_aadhaar: dbContact.aadhar_no || savedGcn.owner_agent_aadhaar || '',
                    owner_agent_pan: dbContact.pan_no || savedGcn.owner_agent_pan || '',
                    address: dbContact.address || savedGcn.address || '',
                    rc_validity: dbContact.rc_validity || savedGcn.rc_validity || '',
                    insurance_validity: dbContact.insurance_validity || savedGcn.insurance_validity || '',
                    fitness_validity: dbContact.fitness_validity || savedGcn.fitness_validity || '',
                    road_tax_validity: dbContact.road_tax_validity || savedGcn.road_tax_validity || '',
                    permit: dbContact.permit || savedGcn.permit || '',
                    puc: dbContact.puc || savedGcn.puc || '',
                    np_validity: dbContact.np_validity || savedGcn.np_validity || '',
                };
                setGcnData(finalGcnData);

                // ── Fetch required fuel (read-only) ──────────────────────────
                const finalTruckNo = finalGcnData.truck_no;
                const finalDestination = finalGcnData.destination;
                if (finalTruckNo && finalDestination) {
                    setFuelLoading(true);
                    try {
                        const fuelRes = await axios.get(
                            `${API_URL}/invoice/fuel-requirement/${encodeURIComponent(finalTruckNo)}/${encodeURIComponent(finalDestination)}`,
                            { headers: { Authorization: `Bearer ${token}` } }
                        );
                        if (fuelRes.data.found && fuelRes.data.required_fuel_litres != null) {
                            setFuelRequirement(fuelRes.data);
                            // Pre-fill Diesel field with the estimate only if not already loaded from a saved slip
                            if (!inv?.lorry_hire_slip_data?.lorry_hire_slip_url) {
                                setDieselLtrs(String(fuelRes.data.required_fuel_litres));
                            }
                        } else {
                            setFuelError(fuelRes.data.error || 'Could not calculate required fuel');
                        }
                    } catch (fuelErr) {
                        setFuelError('Fuel calculation failed: ' + fuelErr.message);
                    } finally {
                        setFuelLoading(false);
                    }
                } else {
                    setFuelError(!finalTruckNo ? 'Truck number not found' : 'Destination not found');
                }

            } catch (err) {
                setSnack({ type: 'error', message: 'Failed to load data: ' + err.message });
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [invoiceId, propFormData]);

    const handleSaveAndUpload = async () => {
        setSaving(true);
        try {
            const pdfBlob = await html2pdf().set({
                margin: 0,
                filename: `lorry_hire_slip_${slipNo}.pdf`,
                image: { type: 'jpeg', quality: 1.0 },
                html2canvas: { scale: 3, useCORS: true, logging: false },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            }).from(docRef.current).outputPdf('blob');

            const slipData = {
                lorry_hire_slip_no: slipNo,
                fuel_slip_no: fuelSlipNo,
                loading_advance: parseFloat(loadingAdv) || 0,
                diesel_litres: parseFloat(dieselLtrs) || 0,
                diesel_rate: parseFloat(dieselRate) || 0,
                diesel_advance: parseFloat(dieselAdv.toFixed(2)),
                total_advance: parseFloat(totalAdv.toFixed(2)),
                estimated_required_fuel: fuelRequirement?.required_fuel_litres ?? null,
            };

            const formData = new FormData();
            formData.append('softcopy', pdfBlob, `lorry_hire_slip_${slipNo}.pdf`);
            formData.append('invoice_id', invoiceData?._id || invoiceId);
            formData.append('slip_data', JSON.stringify(slipData));

            const token = localStorage.getItem('token');
            const res = await axios.post(
                `${API_URL}/invoice/lorry-hire-slip-softcopy`,
                formData,
                { headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${token}` } }
            );
            setSavedUrl(res.data.url);
            setSnack({ type: 'success', message: '✅ Lorry Hire Slip saved to S3 successfully!' });
        } catch (err) {
            setSnack({ type: 'error', message: '❌ Upload failed: ' + err.message });
        } finally {
            setSaving(false);
        }
    };

    useEffect(() => {
        if (step === 1 && !savedUrl && gcnData && !saving) {
            handleSaveAndUpload();
        }
    }, [step]);

    const handleDownload = async () => {
        if (!docRef.current) {
            setSnack({
                type: 'error',
                message: 'Document reference not found. This usually happens if the preview is still loading. Please wait a moment and try again.'
            });
            return;
        }
        try {
            setSnack({ type: 'info', message: 'Preparing high-quality PDF. Please wait...' });
            await html2pdf().set({
                margin: 0,
                filename: `lorry_hire_slip_${slipNo}.pdf`,
                image: { type: 'jpeg', quality: 1.0 },
                html2canvas: { scale: 3, useCORS: true, logging: false },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            }).from(docRef.current).save();
            setSnack({ type: 'success', message: '✅ Download started successfully!' });
        } catch (err) {
            console.error('Download error:', err);
            setSnack({ type: 'error', message: '❌ Download failed: ' + err.message });
        }
    };

    if (loading) return (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh" flexDirection="column" gap={2}>
            <CircularProgress size={48} />
            <Typography color="text.secondary">Loading invoice data from database…</Typography>
        </Box>
    );

    if (step === 0) {
        return (
            <Box sx={{ bgcolor: '#f8fafc', minHeight: '100vh', pb: 8, fontFamily: '"Inter", sans-serif' }}>
                 {/* Glassy Header */}
                <Box sx={{ 
                    position: 'sticky', top: 0, zIndex: 50,
                    bgcolor: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(12px)',
                    borderBottom: '1px solid rgba(226,232,240,0.8)', px: { xs: 2, md: 4 }, py: 2, 
                    display: 'flex', alignItems: 'center', gap: { xs: 1.5, md: 3 } 
                }}>
                    <IconButton onClick={() => window.location.href = '/'} size="small" sx={{ bgcolor: '#f1f5f9', color: '#475569', '&:hover': { bgcolor: '#e2e8f0', color: '#0f172a' }, flexShrink: 0, boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                        <ArrowBackIcon fontSize="small" />
                    </IconButton>
                    <Box flex={1} sx={{ minWidth: 0 }}>
                        <Typography variant="h6" fontWeight="900" sx={{
                            color: '#0f172a', lineHeight: 1.2, fontSize: { xs: '1.1rem', sm: '1.4rem' },
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                        }}>
                            Lorry Hire Slip Setup
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#64748b', display: { xs: 'none', sm: 'block' }, fontWeight: 500 }}>
                            Review details and finalize advance payment configuration
                        </Typography>
                    </Box>
                    <Stepper activeStep={step} alternativeLabel sx={{ minWidth: 250, display: { xs: 'none', md: 'flex' }, '& .MuiStepLabel-label': { fontWeight: 600 } }}>
                        {STEPS.map(label => (
                            <Step key={label}><StepLabel>{label}</StepLabel></Step>
                        ))}
                    </Stepper>
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={() => window.location.href = '/'}
                        sx={{ ml: 'auto', borderRadius: 2, px: { xs: 2, sm: 2.5 }, py: { xs: 0.5, sm: 0.8 }, color: '#334155', borderColor: '#cbd5e1', fontWeight: 700, '&:hover': { bgcolor: '#f1f5f9' }, whiteSpace: 'nowrap', display: 'flex' }}
                    >
                        Home
                    </Button>
                </Box>

                <Container maxWidth="xl" sx={{ pt: { xs: 3, md: 5 }, px: { xs: 2, md: 4 } }}>
                    <Grid container spacing={{ xs: 3, md: 5 }} justifyContent="center">
                        <Grid item xs={12} lg={5} xl={4}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, height: '100%' }}>
                                <Box>
                                    <Typography variant="h6" fontWeight="800" color="#1e293b" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <span style={{ width: 4, height: 20, backgroundColor: '#3b82f6', borderRadius: 2 }}></span>
                                        Slip Configuration
                                    </Typography>
                                    <Typography variant="body2" color="#64748b" mt={1}>Review core identifiers and vehicle allocations.</Typography>
                                </Box>
                                
                                <SectionCard icon={<ReceiptIcon />} title="Slip Reference" color="#8b5cf6">
                                    <InfoRow label="GCN No." value={gcnData?.gcn_no} mono />
                                    <InfoRow label="Date" value={gcnData?.gcn_date} />
                                    <InfoRow label="Invoice No." value={gcnData?.invoice_no} mono />
                                </SectionCard>

                                <SectionCard icon={<LocalShippingIcon />} title="Vehicle Details" color="#f59e0b">
                                    <InfoRow label="Truck No." value={gcnData?.truck_no} mono />
                                    <InfoRow label="Truck Owner" value={gcnData?.agent_name} />
                                    <InfoRow label="Driver Name" value={gcnData?.driver_name} />
                                    <InfoRow label="Driver Number" value={gcnData?.owner_agent_contact || gcnData?.driver_number} />
                                    <InfoRow label="License No" value={gcnData?.driver_license_no} />
                                </SectionCard>
                            </Box>
                        </Grid>
                        
                        <Grid item xs={12} lg={5} xl={4}>
                            <Paper sx={{
                                p: { xs: 3, md: 4 },
                                borderRadius: 5,
                                position: { xs: 'static', lg: 'sticky' },
                                top: 100,
                                bgcolor: '#fff',
                                boxShadow: '0 12px 40px rgba(0,0,0,0.06)',
                                border: '1px solid rgba(226,232,240,0.8)',
                            }} elevation={0}>
                                <Typography variant="h5" fontWeight="900" color="#0f172a" mb={1}>Trip Advance</Typography>
                                <Typography variant="body2" color="#64748b" mb={4}>Review the AI estimated fuel allowance and input the specific loading advance amounts.</Typography>

                                {/* ── Required Fuel (Read-only, auto-calculated) ── */}
                                <Box sx={{
                                    mb: 4,
                                    borderRadius: 4,
                                    border: fuelError ? '1px solid #fecaca' : '1px solid #10b981',
                                    bgcolor: fuelError ? '#fef2f2' : '#ecfdf5',
                                    p: 3,
                                    position: 'relative',
                                    overflow: 'hidden',
                                    boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.01)'
                                }}>
                                    <Box sx={{
                                        position: 'absolute', top: 0, left: 0, width: 6, height: '100%',
                                        bgcolor: fuelError ? '#ef4444' : '#10b981',
                                    }} />
                                    <Box display="flex" alignItems="center" gap={1.5} mb={1}>
                                        <Box sx={{ p: 1, bgcolor: fuelError ? '#fee2e2' : '#d1fae5', borderRadius: 2, display: 'flex' }}>
                                            <LocalGasStationIcon sx={{ fontSize: 20, color: fuelError ? '#ef4444' : '#059669' }} />
                                        </Box>
                                        <Typography variant="subtitle2" fontWeight="800" sx={{ color: fuelError ? '#ef4444' : '#065f46', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                            AI Fuel Estimate
                                        </Typography>
                                    </Box>
                                    {fuelLoading ? (
                                        <Box display="flex" alignItems="center" gap={1.5} mt={1.5} ml={6}>
                                            <CircularProgress size={16} sx={{ color: '#059669' }} />
                                            <Typography variant="body2" fontWeight="600" color="#065f46">Calculating route...</Typography>
                                        </Box>
                                    ) : fuelError ? (
                                        <Typography variant="body2" sx={{ color: '#b91c1c', fontWeight: 600, mt: 1, ml: 6 }}>
                                            {fuelError}
                                        </Typography>
                                    ) : fuelRequirement ? (
                                        <Box ml={6}>
                                            <Typography variant="h3" fontWeight="900" sx={{ color: '#047857', lineHeight: 1.1, letterSpacing: '-1px' }}>
                                                {fuelRequirement.required_fuel_litres} <Typography component="span" variant="h5" fontWeight="700" color="#059669">Liters</Typography>
                                            </Typography>
                                            <Typography variant="caption" fontWeight="600" sx={{ display: 'block', mt: 1, color: '#065f46', opacity: 0.8 }}>
                                                Route: {fuelRequirement.distance_km} km × 2 trips
                                            </Typography>
                                            <Typography variant="caption" fontWeight="600" sx={{ display: 'block', color: '#065f46', opacity: 0.8 }}>
                                                Vehicle: {fuelRequirement.vehicle_type} ({fuelRequirement.mileage_kmpl} km/L)
                                            </Typography>
                                        </Box>
                                    ) : (
                                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, ml: 6 }}>—</Typography>
                                    )}
                                </Box>

                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mb: 4 }}>
                                    <TextField 
                                        label="Loading Advance Amount" 
                                        type="number" 
                                        fullWidth 
                                        value={loadingAdv} 
                                        onChange={e => setLoadingAdv(e.target.value)} 
                                        variant="outlined"
                                        InputLabelProps={{ sx: { fontWeight: 600, color: '#475569' } }}
                                        InputProps={{ 
                                            startAdornment: <Typography sx={{ mr: 1, color: '#0f172a', fontSize: '1.1rem', fontWeight: 800 }}>₹</Typography>,
                                            sx: { borderRadius: 3, bgcolor: '#f8fafc', fontWeight: 700, fontSize: '1.1rem' } 
                                        }} 
                                    />
                                    
                                    <TextField
                                        label="Fuel Advance (Litres)"
                                        type="number"
                                        fullWidth
                                        value={dieselLtrs}
                                        onChange={e => setDieselLtrs(e.target.value)}
                                        variant="outlined"
                                        helperText={fuelRequirement ? `* AI suggested constraint is ${fuelRequirement.required_fuel_litres} Litres` : ''}
                                        FormHelperTextProps={{ sx: { fontWeight: 600, color: '#64748b' } }}
                                        InputLabelProps={{ sx: { fontWeight: 600, color: '#475569' } }}
                                        InputProps={{ 
                                            endAdornment: <LocalGasStationIcon sx={{ color: '#3b82f6' }} />,
                                            sx: { borderRadius: 3, bgcolor: '#f8fafc', fontWeight: 700, fontSize: '1.1rem' }
                                        }}
                                    />
                                </Box>

                                <Button 
                                    variant="contained" 
                                    fullWidth 
                                    size="large" 
                                    endIcon={<ArrowForwardIcon />} 
                                    onClick={() => setStep(1)} 
                                    sx={{ 
                                        borderRadius: 3, 
                                        fontWeight: 800, 
                                        py: 1.8, 
                                        fontSize: '1.05rem',
                                        background: 'linear-gradient(135deg, #020617 0%, #1e293b 100%)', 
                                        boxShadow: '0 10px 25px rgba(15,23,42,0.3)',
                                        transition: 'all 0.2s',
                                        '&:hover': { 
                                            background: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)',
                                            transform: 'translateY(-2px)',
                                            boxShadow: '0 15px 30px rgba(15,23,42,0.4)',
                                        } 
                                    }}
                                >
                                    Generate Lorry Slip
                                </Button>
                            </Paper>
                        </Grid>
                    </Grid>
                </Container>
                <Snackbar open={!!snack} autoHideDuration={5000} onClose={() => setSnack(null)} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
                    <Alert severity={snack?.type || 'info'} onClose={() => setSnack(null)} variant="filled" sx={{ borderRadius: 3, fontWeight: 600 }}>
                        {snack?.message}
                    </Alert>
                </Snackbar>
            </Box>
        );
    }
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
              <Button variant="outlined" size="small" onClick={() => setStep(0)} sx={{ flex: { xs: 1, md: 'none' } }}>
                ← Setup
              </Button>
              <Button variant="outlined" size="small" onClick={() => window.location.href = '/'} sx={{ flex: { xs: 1, md: 'none' } }}>
                🏠 Home
              </Button>
            </Box>

            {/* Zoom Tool */}
            <Box display="flex" justifyContent="center" sx={{ flex: { xs: '1 1 100%', md: '0 1 auto' }, order: { xs: 3, md: 2 } }}>
              <Box display="flex" alignItems="center" sx={{ bgcolor: '#f8f9fa', border: '1px solid #e2e8f0', borderRadius: '8px', px: 0.5, py: 0.25 }}>
                <IconButton size="small" onClick={zoomOut} disabled={zoom <= ZOOM_MIN} sx={{ p: 0.5, width: 28, height: 28 }}><span style={{ fontSize: '1.2rem', lineHeight: 1 }}>−</span></IconButton>
                <Box onClick={zoomReset} sx={{ fontWeight: 600, fontSize: '0.85rem', width: 46, textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}>{Math.round(zoom * 100)}%</Box>
                <IconButton size="small" onClick={zoomIn} disabled={zoom >= ZOOM_MAX} sx={{ p: 0.5, width: 28, height: 28 }}><span style={{ fontSize: '1.2rem', lineHeight: 1 }}>+</span></IconButton>
              </Box>
            </Box>

            {/* Actions Group */}
            <Box display="flex" gap={1} sx={{ flex: { xs: '1 1 100%', md: '0 1 auto' }, order: { xs: 2, md: 3 } }}>
              <Button variant="outlined" size="small" startIcon={<PrintIcon />} onClick={() => window.print()} sx={{ flex: 1, borderRadius: 2 }}>Print Document</Button>
              <Button variant="contained" size="small" startIcon={<DownloadIcon />} onClick={handleDownload} sx={{ flex: 1, borderRadius: 2 }}>Save PDF</Button>
              {savedUrl && onOpenFuelSlip && (
                  <Button variant="contained" color="secondary" size="small" startIcon={<LocalGasStationIcon />} onClick={() => onOpenFuelSlip(invoiceId)} sx={{ flex: 1, borderRadius: 2 }}>Get Fuel Slip</Button>
              )}
            </Box>

          </Box>
        </Box>

        <Box sx={{ width: '100%', height: '100svh', overflow: 'auto', backgroundColor: '#f0f0f0', p: { xs: 2, sm: 4, md: 10 }, pt: { xs: 16, sm: 14 }, textAlign: 'center', '@media print': { height: 'auto !important', overflow: 'visible !important', display: 'block !important', position: 'static !important', p: 0, pt: 0, backgroundColor: 'transparent' } }}>
          <Box sx={{ display: 'inline-block', textAlign: 'left', zoom: zoom, transition: 'zoom 0.2s cubic-bezier(0.4,0,0.2,1)', boxShadow: '0 20px 60px rgba(0,0,0,0.1)', '@media print': { zoom: '1 !important', display: 'block !important', boxShadow: 'none' } }}>
                    <LorryHireSlipDocument
                        ref={docRef}
                        gcnData={gcnData}
                        slipNo={slipNo}
                        fuelSlipNo={fuelSlipNo}
                        loadingAdv={parseFloat(loadingAdv) || 0}
                        dieselLtrs={parseFloat(dieselLtrs) || 0}
                        dieselRate={parseFloat(dieselRate) || 0}
                        dieselAdv={dieselAdv.toFixed(2)}
                        totalAdv={totalAdv.toFixed(2)}
                        invoiceData={invoiceData}
                    />
          </Box>
        </Box>

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

export default LorryHireSlipReview;
