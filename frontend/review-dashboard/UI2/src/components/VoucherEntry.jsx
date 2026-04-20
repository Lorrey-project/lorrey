import React, { useState, useRef, forwardRef } from 'react';
import {
  Box, Typography, TextField, Button, Grid, Card, CardContent,
  CircularProgress, Snackbar, Alert, Divider, MenuItem, InputAdornment,
  IconButton, Chip, Backdrop, Fade,
} from '@mui/material';
import axios from 'axios';
import html2pdf from 'html2pdf.js';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PrintIcon from '@mui/icons-material/Print';
import DownloadIcon from '@mui/icons-material/Download';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { API_URL } from '../config';
import { useAuth } from '../context/AuthContext';

// ── Voucher Slip Document (printable) ───────────────────────────────────────
const VoucherSlipDocument = forwardRef(({ voucher, companyInfo }, ref) => {
  const purposeColors = {
    Fuel: '#e65100', Advance: '#1a237e', Repair: '#b71c1c',
    Toll: '#1b5e20', Others: '#37474f',
  };
  const color = purposeColors[voucher.purpose] || '#333';

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  };
  const formatAmount = (n) =>
    Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const amountInWords = (num) => {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
      'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
      'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    if (num === 0) return 'Zero';
    const convert = (n) => {
      if (n < 20) return ones[n];
      if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
      if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convert(n % 100) : '');
      if (n < 100000) return convert(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + convert(n % 1000) : '');
      if (n < 10000000) return convert(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + convert(n % 100000) : '');
      return convert(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + convert(n % 10000000) : '');
    };
    const [intPart, decPart] = String(Number(num).toFixed(2)).split('.');
    let result = convert(parseInt(intPart, 10)) + ' Rupees';
    if (decPart && parseInt(decPart) > 0) result += ' and ' + convert(parseInt(decPart)) + ' Paise';
    return result + ' Only';
  };

  return (
    <div ref={ref} style={{
      width: '210mm',
      minHeight: '148mm',
      backgroundColor: '#fff',
      fontFamily: '"Times New Roman", Times, serif',
      padding: '14mm 16mm',
      boxSizing: 'border-box',
      color: '#1a1a1a',
      position: 'relative',
    }}>
      {/* Watermark */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%) rotate(-30deg)',
        fontSize: '72px', color: 'rgba(0,0,0,0.04)',
        fontWeight: 900, whiteSpace: 'nowrap', pointerEvents: 'none',
        zIndex: 0, userSelect: 'none',
      }}>VOUCHER</div>

      {/* Header */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#1a1a1a', letterSpacing: '1px' }}>
              {companyInfo.name}
            </div>
            <div style={{ fontSize: '10px', color: '#555', marginTop: '3px' }}>{companyInfo.address}</div>
            <div style={{ fontSize: '10px', color: '#555' }}>Ph: {companyInfo.phone} | GST: {companyInfo.gst}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{
              display: 'inline-block',
              background: color,
              color: '#fff',
              padding: '4px 14px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '1px',
              marginBottom: '6px'
            }}>{voucher.purpose.toUpperCase()} VOUCHER</div>
            <div style={{ fontSize: '10px', color: '#555' }}>Voucher No: <strong>{voucher.voucherNumber}</strong></div>
            <div style={{ fontSize: '10px', color: '#555' }}>Date: <strong>{formatDate(voucher.date)}</strong></div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ borderTop: `3px solid ${color}`, marginBottom: '12px' }} />

        {/* Main Content */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', marginBottom: '12px' }}>
          <tbody>
            <tr style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '7px 4px', color: '#666', width: '35%' }}>Vehicle Number</td>
              <td style={{ padding: '7px 4px', fontWeight: 700, fontFamily: 'monospace', fontSize: '13px', color: '#1a1a1a' }}>
                {voucher.vehicleNumber}
              </td>
            </tr>
            <tr style={{ borderBottom: '1px solid #eee', background: '#fafafa' }}>
              <td style={{ padding: '7px 4px', color: '#666' }}>Purpose</td>
              <td style={{ padding: '7px 4px', fontWeight: 700 }}>{voucher.purpose}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '7px 4px', color: '#666' }}>Date</td>
              <td style={{ padding: '7px 4px', fontWeight: 700 }}>{formatDate(voucher.date)}</td>
            </tr>
            {voucher.remarks && (
              <tr style={{ borderBottom: '1px solid #eee', background: '#fafafa' }}>
                <td style={{ padding: '7px 4px', color: '#666' }}>Remarks</td>
                <td style={{ padding: '7px 4px' }}>{voucher.remarks}</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Amount Box */}
        <div style={{
          border: `2px solid ${color}`,
          borderRadius: '6px',
          padding: '12px 16px',
          marginBottom: '14px',
          background: '#fafafa',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: '10px', color: '#777', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Amount (In Words)</div>
            <div style={{ fontSize: '11px', fontWeight: 600, fontStyle: 'italic', marginTop: '3px', color: '#333' }}>
              {amountInWords(voucher.amount)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '10px', color: '#777', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Amount</div>
            <div style={{ fontSize: '22px', fontWeight: 900, color: color }}>
              ₹{formatAmount(voucher.amount)}
            </div>
          </div>
        </div>

        {/* Signature Section */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
          <div style={{ textAlign: 'center', width: '30%' }}>
            <div style={{ borderTop: '1.5px solid #999', paddingTop: '5px', fontSize: '9px', color: '#888' }}>Prepared By</div>
          </div>
          <div style={{ textAlign: 'center', width: '30%' }}>
            <div style={{ borderTop: '1.5px solid #999', paddingTop: '5px', fontSize: '9px', color: '#888' }}>Checked By</div>
          </div>
          <div style={{ textAlign: 'center', width: '30%' }}>
            <div style={{ borderTop: '1.5px solid #999', paddingTop: '5px', fontSize: '9px', color: '#888' }}>Authorised Signatory</div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          marginTop: '14px', borderTop: '1px dashed #ccc', paddingTop: '6px',
          display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#aaa'
        }}>
          <span>Generated on: {new Date().toLocaleString('en-IN')}</span>
          <span>Voucher No: {voucher.voucherNumber}</span>
        </div>
      </div>
    </div>
  );
});
VoucherSlipDocument.displayName = 'VoucherSlipDocument';

// ── Purpose meta ─────────────────────────────────────────────────────────────
const PURPOSES = ['Fuel', 'Advance', 'Repair', 'Toll', 'Others'];
const VEHICLE_REGEX = /^[A-Z]{2}\d{2}[A-Z]{1,3}\d{4}$/i;

const COMPANY_INFO = {
  name: 'DIPALI ASSOCIATES & CO.',
  address: '1st Floor, Panja Hotel, Darjeeling More, Panagarh',
  phone: '7810935738 / 8116221063',
  gst: '19AATFD1733C1ZH',
};

// ── Auto voucher number counter ───────────────────────────────────────────────
let _autoCounter = 1;
const genVoucherNo = () => {
  const no = `VCH-${String(Date.now()).slice(-5)}`;
  _autoCounter++;
  return no;
};

// ── Main Component ────────────────────────────────────────────────────────────
const VoucherEntry = ({ invoiceId, invoiceData, onBack, onDashboard }) => {
  const { user } = useAuth();
  const slipRef = useRef();

  const [step, setStep] = useState('form'); // 'form' | 'slip'
  const [saving, setSaving] = useState(false);
  const [savedVoucher, setSavedVoucher] = useState(null);
  const [slipSavedUrl, setSlipSavedUrl] = useState(null);
  const [snack, setSnack] = useState(null);

  // Form fields
  const [form, setForm] = useState({
    voucherNumber: genVoucherNo(),
    vehicleNumber: invoiceData?.human_verified_data?.supply_details?.vehicle_number || '',
    date: new Date().toISOString().split('T')[0],
    amount: '',
    purpose: 'Fuel',
    remarks: '',
  });
  const [errors, setErrors] = useState({});

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(p => ({ ...p, [name]: value }));
    if (errors[name]) setErrors(p => ({ ...p, [name]: '' }));
  };

  const validate = () => {
    const errs = {};
    if (!form.vehicleNumber.trim()) errs.vehicleNumber = 'Required';
    else if (!VEHICLE_REGEX.test(form.vehicleNumber.trim())) errs.vehicleNumber = 'Format: WB12AB1234';
    if (!form.date) errs.date = 'Required';
    if (!form.amount || parseFloat(form.amount) <= 0) errs.amount = 'Must be a positive number';
    if (!form.purpose) errs.purpose = 'Required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // Step 1: Save voucher to DB, then generate PDF and upload to S3
  const handleSaveAndGenerate = async () => {
    if (!validate()) return;
    setSaving(true);

    try {
      const token = localStorage.getItem('token');

      // 1. Create voucher in MongoDB
      const payload = {
        voucherNumber: form.voucherNumber.trim(),
        vehicleNumber: form.vehicleNumber.trim().toUpperCase(),
        date: form.date,
        amount: parseFloat(form.amount),
        purpose: form.purpose,
        remarks: form.remarks,
        invoiceId: invoiceId || null,
        createdByRole: user?.role || 'OFFICE',
      };
      const createRes = await axios.post(`${API_URL}/voucher`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!createRes.data.success) {
        throw new Error(createRes.data.error || 'Failed to create voucher');
      }
      const voucher = createRes.data.voucher;
      setSavedVoucher(voucher);

      // Move to slip view first so the ref renders
      setStep('slip');

      // Small delay to let DOM render
      await new Promise(r => setTimeout(r, 600));

      // 2. Generate PDF blob from the rendered slip
      const blob = await html2pdf().set({
        margin: 0,
        filename: `voucher_${voucher.voucherNumber}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 3, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a5', orientation: 'landscape' },
      }).from(slipRef.current).output('blob');

      // 3. Upload PDF to S3 via backend
      const formData = new FormData();
      formData.append('slip', blob, `voucher_${voucher.voucherNumber}.pdf`);
      const uploadRes = await axios.post(
        `${API_URL}/voucher/${voucher._id}/slip`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${token}` } }
      );

      if (uploadRes.data.success) {
        setSlipSavedUrl(uploadRes.data.slip_url);
        setSavedVoucher(uploadRes.data.voucher);
        setSnack({ type: 'success', message: '✅ Voucher slip saved to S3 successfully!' });
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      setSnack({ type: 'error', message: '❌ Error: ' + msg });
      // Revert to form if save failed completely
      if (!savedVoucher) setStep('form');
    } finally {
      setSaving(false);
    }
  };

  // Download PDF
  const handleDownload = async () => {
    if (!slipRef.current) return;
    try {
      setSnack({ type: 'info', message: 'Generating PDF...' });
      await html2pdf().set({
        margin: 0,
        filename: `voucher_${savedVoucher?.voucherNumber || 'slip'}.pdf`,
        image: { type: 'jpeg', quality: 1.0 },
        html2canvas: { scale: 3, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a5', orientation: 'landscape' },
      }).from(slipRef.current).save();
      setSnack({ type: 'success', message: '✅ Download started!' });
    } catch (err) {
      setSnack({ type: 'error', message: '❌ Download failed: ' + err.message });
    }
  };

  // ── FORM VIEW ──────────────────────────────────────────────────────────────
  const FormView = () => (
    <Box sx={{ maxWidth: 620, mx: 'auto', px: 2 }}>
      <Card sx={{
        borderRadius: '28px',
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(0,0,0,0.06)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.08)',
      }}>
        <CardContent sx={{ p: { xs: 3, md: 5 } }}>
          <Box display="flex" alignItems="center" gap={1.5} mb={4}>
            <Box sx={{
              width: 44, height: 44, borderRadius: '12px',
              background: 'linear-gradient(135deg, #1a237e, #3949ab)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 6px 20px rgba(26,35,126,0.3)',
            }}>
              <ReceiptLongIcon sx={{ color: '#fff', fontSize: 22 }} />
            </Box>
            <Box>
              <Typography variant="h6" fontWeight={900} color="#1a1a1a">Voucher Entry</Typography>
              <Typography variant="caption" color="text.secondary">Fill in the details to generate a voucher slip</Typography>
            </Box>
          </Box>

          <Grid container spacing={2.5}>
            {/* Voucher Number (read-only — assigned by server) */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth label="Voucher Number"
                value={savedVoucher?.voucherNumber || 'Auto-assigned by server'}
                disabled
                helperText="The server assigns a unique sequential number"
                InputProps={{ sx: { borderRadius: '14px' } }}
              />
            </Grid>

            {/* Date */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth label="Date" name="date" type="date"
                value={form.date} onChange={handleChange}
                error={!!errors.date} helperText={errors.date}
                InputLabelProps={{ shrink: true }}
                InputProps={{ sx: { borderRadius: '14px' } }}
              />
            </Grid>

            {/* Vehicle Number */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth label="Vehicle Number" name="vehicleNumber"
                value={form.vehicleNumber} onChange={handleChange}
                placeholder="WB12AB1234"
                error={!!errors.vehicleNumber} helperText={errors.vehicleNumber || 'Format: WB12AB1234'}
                inputProps={{ style: { textTransform: 'uppercase' } }}
                InputProps={{ sx: { borderRadius: '14px' } }}
              />
            </Grid>

            {/* Purpose */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth select label="Purpose" name="purpose"
                value={form.purpose} onChange={handleChange}
                error={!!errors.purpose} helperText={errors.purpose}
                InputProps={{ sx: { borderRadius: '14px' } }}
              >
                {PURPOSES.map(p => (
                  <MenuItem key={p} value={p}>{p}</MenuItem>
                ))}
              </TextField>
            </Grid>

            {/* Amount */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth label="Amount (₹)" name="amount" type="number"
                value={form.amount} onChange={handleChange}
                error={!!errors.amount} helperText={errors.amount}
                InputProps={{
                  startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                  sx: { borderRadius: '14px' },
                }}
              />
            </Grid>

            {/* Remarks */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth label="Remarks (Optional)" name="remarks"
                value={form.remarks} onChange={handleChange}
                InputProps={{ sx: { borderRadius: '14px' } }}
              />
            </Grid>
          </Grid>

          <Button
            fullWidth variant="contained" size="large"
            onClick={handleSaveAndGenerate}
            startIcon={<ReceiptLongIcon />}
            sx={{
              mt: 4, py: 1.8, borderRadius: '16px', fontWeight: 900, fontSize: '1rem',
              background: 'linear-gradient(45deg, #1a237e, #3949ab)',
              boxShadow: '0 10px 30px rgba(26,35,126,0.3)',
              '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 14px 36px rgba(26,35,126,0.4)' },
              transition: 'all 0.2s',
            }}
          >
            Save & Generate Voucher Slip
          </Button>
        </CardContent>
      </Card>
    </Box>
  );

  // ── SLIP VIEW ──────────────────────────────────────────────────────────────
  const SlipView = () => (
    <Box>
      {/* Slip saved badge */}
      {slipSavedUrl && (
        <Box sx={{ maxWidth: 800, mx: 'auto', mb: 3, px: 2 }}>
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1.5, p: 2,
            borderRadius: '14px', bgcolor: '#e8f5e9', border: '1px solid #a5d6a7',
          }}>
            <CheckCircleIcon sx={{ color: '#2e7d32' }} />
            <Box flex={1}>
              <Typography variant="body2" fontWeight={700} color="#1b5e20">
                Voucher slip saved to S3
              </Typography>
              <Typography variant="caption" color="#388e3c" sx={{ wordBreak: 'break-all' }}>
                {slipSavedUrl}
              </Typography>
            </Box>
          </Box>
        </Box>
      )}

      {/* Slip preview */}
      <Box sx={{
        display: 'flex', justifyContent: 'center', px: 2,
        overflowX: 'auto',
        '&::-webkit-scrollbar': { display: 'none' },
      }}>
        <Box sx={{
          transform: { xs: 'scale(0.55)', sm: 'scale(0.75)', md: 'scale(0.9)', lg: 'scale(1)' },
          transformOrigin: 'top center',
          mb: { xs: -30, sm: -14, md: -6 },
          boxShadow: '0 12px 50px rgba(0,0,0,0.15)',
          borderRadius: '4px',
        }}>
          <VoucherSlipDocument
            ref={slipRef}
            voucher={savedVoucher || { ...form, amount: parseFloat(form.amount) || 0 }}
            companyInfo={COMPANY_INFO}
          />
        </Box>
      </Box>
    </Box>
  );

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <Box sx={{
      minHeight: '100vh',
      background: 'radial-gradient(circle at 60% 20%, #e8eaf6 0%, #f4f7f9 60%, #fce4ec 100%)',
      pt: 0, pb: 8,
      '@media print': {
        background: 'none !important',
        '.no-print': { display: 'none !important' },
        '.print-only': { display: 'block !important' },
      },
    }}>

      {/* Top Action Bar */}
      <Box className="no-print" sx={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        px: 3, py: 1.5, mb: 4,
        background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <IconButton
            onClick={step === 'slip' ? () => setStep('form') : onBack}
            size="small"
            sx={{ bgcolor: '#f0f6ff', '&:hover': { bgcolor: '#d0e4ff' } }}
          >
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <Box>
            <Typography variant="h6" fontWeight={900} color="#1a237e" sx={{ lineHeight: 1.2 }}>
              {step === 'form' ? 'Voucher Entry' : `Voucher Slip — ${savedVoucher?.voucherNumber}`}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {step === 'form' ? 'Enter details to generate a slip' : 'Review, download or print the voucher'}
            </Typography>
          </Box>
        </Box>

        <Box display="flex" gap={1.5} alignItems="center">
          {step === 'slip' && (
            <>
              <Chip
                label={savedVoucher?.purpose}
                size="small"
                sx={{ fontWeight: 700, display: { xs: 'none', sm: 'flex' } }}
                color="primary" variant="outlined"
              />
              <Button
                variant="outlined" size="small"
                startIcon={<PrintIcon />}
                onClick={() => window.print()}
                sx={{ borderRadius: 2 }}
              >
                Print
              </Button>
              <Button
                variant="contained" size="small"
                startIcon={<DownloadIcon />}
                onClick={handleDownload}
                sx={{ borderRadius: 2, background: 'linear-gradient(45deg, #1a237e, #3949ab)' }}
              >
                Download PDF
              </Button>
            </>
          )}
          <Button
            variant="contained" size="small"
            onClick={() => window.location.href = '/'}
            sx={{ borderRadius: 2, bgcolor: '#333', '&:hover': { bgcolor: '#000' } }}
          >
            Dashboard
          </Button>
        </Box>
      </Box>

      {/* Content */}
      <Fade in={step === 'form'} unmountOnExit>
        <Box><FormView /></Box>
      </Fade>
      <Fade in={step === 'slip'} unmountOnExit>
        <Box className="print-only"><SlipView /></Box>
      </Fade>

      {/* Hidden render for PDF generation while in form state */}
      {step === 'form' && (
        <Box sx={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
          <VoucherSlipDocument
            ref={slipRef}
            voucher={{ ...form, amount: parseFloat(form.amount) || 0 }}
            companyInfo={COMPANY_INFO}
          />
        </Box>
      )}

      {/* Saving overlay */}
      <Backdrop
        open={saving}
        sx={{ color: '#fff', zIndex: 9999, backdropFilter: 'blur(8px)', flexDirection: 'column', gap: 2 }}
      >
        <CircularProgress color="inherit" size={56} thickness={4} />
        <Typography variant="h6" fontWeight={700}>Generating & Uploading Voucher Slip...</Typography>
        <Typography variant="caption" sx={{ opacity: 0.7 }}>Saving to MongoDB & AWS S3</Typography>
      </Backdrop>

      <Snackbar
        open={!!snack} autoHideDuration={6000} onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack?.type || 'info'} variant="filled"
          onClose={() => setSnack(null)}
          sx={{ borderRadius: '14px', fontWeight: 700, boxShadow: '0 8px 30px rgba(0,0,0,0.2)' }}
        >
          {snack?.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default VoucherEntry;
