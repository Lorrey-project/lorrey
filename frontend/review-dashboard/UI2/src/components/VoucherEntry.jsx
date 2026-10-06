import React, { useState, useEffect, useRef, forwardRef } from 'react';
import {
  Box, Typography, TextField, Button, Grid, Card, CardContent,
  CircularProgress, Snackbar, Alert, Divider, MenuItem, InputAdornment,
  IconButton, Chip, Backdrop, Fade, Autocomplete
} from '@mui/material';
import axios from 'axios';
import html2pdf from 'html2pdf.js';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PrintIcon from '@mui/icons-material/Print';
import DownloadIcon from '@mui/icons-material/Download';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PersonIcon from '@mui/icons-material/Person';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import { API_URL } from '../config';
import { useAuth } from '../context/AuthContext';
import { toIndianWords } from '../utils/toIndianWords';

// ── Voucher Slip Document (printable) ───────────────────────────────────────
const VoucherSlipDocument = forwardRef(({ voucher, companyInfo }, ref) => {
  const isCredit = voucher.voucherType === 'CREDIT';
  const headerBg = isCredit ? '#059669' : '#1a237e';
  const headerTitle = isCredit ? 'CREDIT VOUCHER' : 'DEBIT VOUCHER';

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  };
  const formatAmount = (n) =>
    Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
        fontSize: '70px', color: isCredit ? 'rgba(5,150,105,0.05)' : 'rgba(26,35,126,0.04)',
        fontWeight: 900, whiteSpace: 'nowrap', pointerEvents: 'none',
        zIndex: 0, userSelect: 'none',
      }}>{headerTitle}</div>

      {/* Header */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: headerBg, letterSpacing: '1px' }}>
              {companyInfo.name}
            </div>
            <div style={{ fontSize: '10px', color: '#555', marginTop: '3px' }}>{companyInfo.address}</div>
            <div style={{ fontSize: '10px', color: '#555' }}>Ph: {companyInfo.phone} | GST: {companyInfo.gst}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{
              display: 'inline-block',
              background: headerBg,
              color: '#fff',
              padding: '4px 14px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '1px',
              marginBottom: '6px'
            }}>{headerTitle}</div>
            <div style={{ fontSize: '10px', color: '#555' }}>Voucher No: <strong>{voucher.voucherNumber}</strong></div>
            <div style={{ fontSize: '10px', color: '#555' }}>Date: <strong>{formatDate(voucher.date)}</strong></div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ borderTop: `3px solid ${headerBg}`, marginBottom: '12px' }} />

        {/* Main Content */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', marginBottom: '12px' }}>
          <tbody>
            <tr style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '7px 4px', color: '#666', width: '35%' }}>Type of Voucher</td>
              <td style={{ padding: '7px 4px', fontWeight: 700 }}>{headerTitle}</td>
            </tr>
            {(voucher.ownerName || voucher.name) && (
              <tr style={{ borderBottom: '1px solid #eee', background: '#fafafa' }}>
                <td style={{ padding: '7px 4px', color: '#666' }}>{isCredit ? 'Owner Name' : 'Payee / Owner'}</td>
                <td style={{ padding: '7px 4px', fontWeight: 700 }}>{voucher.ownerName || voucher.name}</td>
              </tr>
            )}
            {voucher.vehicleNumber && (
              <tr style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '7px 4px', color: '#666' }}>Vehicle Number</td>
                <td style={{ padding: '7px 4px', fontWeight: 700, fontFamily: 'monospace', fontSize: '13px', color: '#1a1a1a' }}>
                  {voucher.vehicleNumber}
                </td>
              </tr>
            )}
            <tr style={{ borderBottom: '1px solid #eee', background: '#fafafa' }}>
              <td style={{ padding: '7px 4px', color: '#666' }}>Reason / Purpose</td>
              <td style={{ padding: '7px 4px', fontWeight: 700 }}>{voucher.reason || voucher.purpose}</td>
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
          border: `2px solid ${headerBg}`,
          borderRadius: '6px',
          padding: '12px 16px',
          marginBottom: '14px',
          background: isCredit ? '#ecfdf5' : '#fafafa',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: '10px', color: '#777', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Amount (In Words)</div>
            <div style={{ fontSize: '11px', fontWeight: 600, fontStyle: 'italic', marginTop: '3px', color: headerBg }}>
              {toIndianWords(voucher.amount)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '10px', color: '#777', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Amount</div>
            <div style={{ fontSize: '22px', fontWeight: 900, color: headerBg }}>
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
const INDIRECT_PURPOSES = ['Fuel', 'Advance', 'Repair', 'Toll', 'Others'];
const DIRECT_PURPOSES = ['Water', 'Cleaning', 'WiFi Recharge', 'Salary', 'Others'];

const COMPANY_INFO = {
  name: 'DIPALI ASSOCIATES & CO.',
  address: '1st Floor, Panja Hotel, Darjeeling More, Panagarh',
  phone: '7810935738 / 9091418737',
  gst: '19AATFD1733C1ZH',
};

// ── Auto voucher number counter ───────────────────────────────────────────────
const genVoucherNo = () => `VCH-${String(Date.now()).slice(-5)}`;

// ── Main Component ────────────────────────────────────────────────────────────
const VoucherEntry = ({ invoiceId, invoiceData, onBack, onDashboard }) => {
  const { user } = useAuth();
  const slipRef = useRef();

  const [step, setStep] = useState('form'); // 'form' | 'slip'
  const [saving, setSaving] = useState(false);
  const [savedVoucher, setSavedVoucher] = useState(null);
  const [slipSavedUrl, setSlipSavedUrl] = useState(null);
  const [snack, setSnack] = useState(null);

  const [contacts, setContacts] = useState({ names: [], vehicles: [], ownerMap: {}, ownerIdMap: {}, vehicleIdMap: {} });
  const [contactsLoading, setContactsLoading] = useState(false);

  useEffect(() => {
    setContactsLoading(true);
    axios.get(`${API_URL}/voucher/contacts`)
      .then(res => { if (res.data.success) setContacts(res.data); })
      .catch(console.error)
      .finally(() => setContactsLoading(false));
  }, []);

  // Form fields
  const [form, setForm] = useState({
    voucherType: 'DEBIT',
    voucherNumber: genVoucherNo(),
    expenseType: 'Indirect Expense',
    name: '',
    vehicleNumber: invoiceData?.human_verified_data?.supply_details?.vehicle_number || '',
    date: new Date().toISOString().split('T')[0],
    amount: '',
    purpose: 'Fuel',
    reason: '',
    remarks: '',
  });
  const [errors, setErrors] = useState({});

  const filteredVehicles = form.voucherType === 'CREDIT'
    ? (form.name ? (contacts.ownerMap?.[form.name] || []) : [])
    : (form.name && contacts.ownerMap?.[form.name] ? contacts.ownerMap[form.name] : contacts.vehicles);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(p => {
      let updates = { [name]: value };
      if (name === 'expenseType') {
        updates.purpose = value === 'Direct Expense' ? 'Water' : 'Fuel';
      }
      if (name === 'voucherType') {
        updates.name = '';
        updates.vehicleNumber = '';
        updates.reason = '';
        updates.amount = '';
      }
      return { ...p, ...updates };
    });
    if (errors[name]) setErrors(p => ({ ...p, [name]: '' }));
  };

  const handleOwnerChange = (_, val) => {
    setForm(p => ({
      ...p,
      name: val || '',
      vehicleNumber: p.voucherType === 'CREDIT' ? '' : p.vehicleNumber
    }));
    if (errors.name) setErrors(p => ({ ...p, name: '' }));
  };

  const validate = () => {
    const errs = {};
    if (form.voucherType === 'CREDIT') {
      if (!form.name) errs.name = 'Owner name is required';
      if (!form.vehicleNumber) errs.vehicleNumber = 'Vehicle number is required';
      if (!form.reason.trim()) errs.reason = 'Reason is required';
      if (!form.amount || parseFloat(form.amount) <= 0) errs.amount = 'Must be a positive number';
    } else {
      if (form.expenseType === 'Indirect Expense') {
        if (!form.vehicleNumber.trim()) errs.vehicleNumber = 'Required';
      }
      if (!form.date) errs.date = 'Required';
      if (!form.amount || parseFloat(form.amount) <= 0) errs.amount = 'Must be a positive number';
      if (!form.purpose) errs.purpose = 'Required';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // Step 1: Save voucher to DB, then generate PDF and upload to S3
  const handleSaveAndGenerate = async () => {
    if (saving) return;
    if (!validate()) return;
    setSaving(true);

    try {
      const token = localStorage.getItem('token');
      const isSite = String(user?.role || '').toUpperCase().includes('SITE');
      const ownerId = contacts.ownerIdMap?.[form.name] || null;
      const vehicleId = contacts.vehicleIdMap?.[form.vehicleNumber] || null;

      const payload = {
        voucherType: form.voucherType,
        ownerId,
        ownerName: form.name,
        vehicleId,
        voucherNumber: form.voucherNumber.trim(),
        expenseType: form.voucherType === 'CREDIT' ? 'Credit Voucher' : form.expenseType,
        vehicleNumber: form.vehicleNumber ? form.vehicleNumber.trim().toUpperCase() : '',
        date: form.date,
        amount: parseFloat(form.amount),
        purpose: form.voucherType === 'CREDIT' ? 'Credit Voucher' : form.purpose,
        name: form.name,
        reason: form.reason || form.purpose,
        remarks: form.remarks,
        invoiceId: invoiceId || null,
        createdByRole: user?.role || 'OFFICE',
        panelSource: isSite ? 'SITE' : 'OFFICE',
      };
      const createRes = await axios.post(`${API_URL}/voucher`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!createRes.data.success) {
        throw new Error(createRes.data.error || 'Failed to create voucher');
      }
      const voucher = createRes.data.voucher;
      setSavedVoucher(voucher);

      setStep('slip');
      await new Promise(r => setTimeout(r, 600));

      const blob = await html2pdf().set({
        margin: 0,
        filename: `voucher_${voucher.voucherNumber}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 3, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a5', orientation: 'landscape' },
      }).from(slipRef.current).output('blob');

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
      }

      setSnack({ type: 'success', message: `✅ ${form.voucherType === 'CREDIT' ? 'Credit' : 'Debit'} Voucher slip saved successfully!` });
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      setSnack({ type: 'error', message: '❌ Error: ' + msg });
      if (!savedVoucher) setStep('form');
    } finally {
      setSaving(false);
    }
  };

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
              background: form.voucherType === 'CREDIT' ? 'linear-gradient(135deg, #059669, #10b981)' : 'linear-gradient(135deg, #1a237e, #3949ab)',
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
            {/* TYPE OF VOUCHER DROPDOWN ABOVE VOUCHER NO */}
            <Grid item xs={12}>
              <TextField
                select
                fullWidth
                label="TYPE OF VOUCHER *"
                name="voucherType"
                value={form.voucherType}
                onChange={handleChange}
                InputProps={{
                  sx: {
                    borderRadius: '14px',
                    fontWeight: 800,
                    bgcolor: form.voucherType === 'CREDIT' ? '#ecfdf5' : '#f5f3ff',
                    color: form.voucherType === 'CREDIT' ? '#047857' : '#6b21a8'
                  }
                }}
              >
                <MenuItem value="DEBIT">1. DEBIT VOUCHER</MenuItem>
                <MenuItem value="CREDIT">2. CREDIT VOUCHER</MenuItem>
              </TextField>
            </Grid>

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

            {form.voucherType === 'CREDIT' ? (
              <>
                {/* CREDIT VOUCHER: 1. OWNER NAME, 2. VEHICLE NUMBER, 3. REASON, 4. AMOUNT */}
                <Grid item xs={12}>
                  <Autocomplete
                    fullWidth
                    options={contacts.names}
                    value={form.name}
                    onChange={handleOwnerChange}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="OWNER NAME *"
                        error={!!errors.name}
                        helperText={errors.name || `${contacts.names.length} registered owners`}
                        InputProps={{
                          ...params.InputProps,
                          sx: { borderRadius: '14px' },
                          startAdornment: <PersonIcon sx={{ color: '#059669', mr: 0.5, fontSize: 20 }} />
                        }}
                      />
                    )}
                  />
                </Grid>

                <Grid item xs={12}>
                  <Autocomplete
                    fullWidth
                    options={filteredVehicles}
                    value={form.vehicleNumber}
                    disabled={!form.name}
                    onChange={(_, val) => setForm(p => ({ ...p, vehicleNumber: val || '' }))}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="VEHICLE NUMBER *"
                        error={!!errors.vehicleNumber}
                        helperText={errors.vehicleNumber || (form.name ? `${filteredVehicles.length} vehicles for ${form.name}` : 'Select owner first')}
                        InputProps={{
                          ...params.InputProps,
                          sx: { borderRadius: '14px' },
                          startAdornment: <LocalShippingIcon sx={{ color: form.name ? '#059669' : '#aaa', mr: 0.5, fontSize: 20 }} />
                        }}
                      />
                    )}
                  />
                </Grid>

                <Grid item xs={12}>
                  <TextField
                    fullWidth label="REASON *" name="reason"
                    value={form.reason} onChange={handleChange}
                    placeholder="e.g. Advance refund / Party payment adjustment"
                    error={!!errors.reason} helperText={errors.reason}
                    multiline rows={2}
                    InputProps={{ sx: { borderRadius: '14px' } }}
                  />
                </Grid>

                <Grid item xs={12}>
                  <TextField
                    fullWidth label="AMOUNT (₹) *" name="amount" type="number"
                    value={form.amount} onChange={handleChange}
                    error={!!errors.amount} helperText={errors.amount}
                    InputProps={{
                      startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                      sx: { borderRadius: '14px' },
                    }}
                  />
                </Grid>
              </>
            ) : (
              <>
                {/* DEBIT VOUCHER: Existing flow */}
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth select label="Expense Type" name="expenseType"
                    value={form.expenseType} onChange={handleChange}
                    InputProps={{ sx: { borderRadius: '14px' } }}
                  >
                    <MenuItem value="Indirect Expense">Indirect Expense (Trucks/Logistics)</MenuItem>
                    <MenuItem value="Direct Expense">Direct Expense (Office/Misc)</MenuItem>
                  </TextField>
                </Grid>

                {form.expenseType === 'Indirect Expense' && (
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
                )}

                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth select label="Purpose" name="purpose"
                    value={form.purpose} onChange={handleChange}
                    error={!!errors.purpose} helperText={errors.purpose}
                    InputProps={{ sx: { borderRadius: '14px' } }}
                  >
                    {form.expenseType === 'Direct Expense'
                      ? DIRECT_PURPOSES.map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)
                      : INDIRECT_PURPOSES.map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}
                  </TextField>
                </Grid>

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

                <Grid item xs={12}>
                  <TextField
                    fullWidth label="Remarks (Optional)" name="remarks"
                    value={form.remarks} onChange={handleChange}
                    multiline rows={3}
                    InputProps={{ sx: { borderRadius: '14px' } }}
                  />
                </Grid>
              </>
            )}
          </Grid>

          <Button
            fullWidth variant="contained" size="large"
            onClick={handleSaveAndGenerate}
            disabled={saving}
            startIcon={<ReceiptLongIcon />}
            sx={{
              mt: 4, py: 1.8, borderRadius: '16px', fontWeight: 900, fontSize: '1rem',
              background: form.voucherType === 'CREDIT' ? 'linear-gradient(45deg, #059669, #10b981)' : 'linear-gradient(45deg, #1a237e, #3949ab)',
              boxShadow: form.voucherType === 'CREDIT' ? '0 10px 30px rgba(5,150,105,0.3)' : '0 10px 30px rgba(26,35,126,0.3)',
              '&:hover': { transform: 'translateY(-2px)' },
              transition: 'all 0.2s',
            }}
          >
            {saving ? 'Saving...' : `Save & Generate ${form.voucherType === 'CREDIT' ? 'Credit' : 'Debit'} Voucher Slip`}
          </Button>
        </CardContent>
      </Card>
    </Box>
  );

  // ── SLIP VIEW ──────────────────────────────────────────────────────────────
  const SlipView = () => (
    <Box>
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

      {/* Slip Display */}
      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 4, px: 2 }}>
        <Box sx={{
          boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
          borderRadius: '4px',
          overflow: 'hidden',
        }}>
          <VoucherSlipDocument
            ref={slipRef}
            voucher={savedVoucher || form}
            companyInfo={COMPANY_INFO}
          />
        </Box>
      </Box>

      {/* Action buttons */}
      <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap', px: 2, pb: 6 }}>
        <Button
          variant="outlined"
          startIcon={<PrintIcon />}
          onClick={() => window.print()}
          sx={{ borderRadius: '14px', px: 3, py: 1.2, fontWeight: 700 }}
        >
          Print Slip
        </Button>
        <Button
          variant="contained"
          startIcon={<DownloadIcon />}
          onClick={handleDownload}
          sx={{
            borderRadius: '14px', px: 3, py: 1.2, fontWeight: 700,
            background: 'linear-gradient(45deg, #1a237e, #3949ab)',
          }}
        >
          Download PDF
        </Button>
        <Button
          variant="outlined"
          onClick={() => {
            setStep('form');
            setSavedVoucher(null);
            setSlipSavedUrl(null);
          }}
          sx={{ borderRadius: '14px', px: 3, py: 1.2, fontWeight: 700 }}
        >
          Create Another Voucher
        </Button>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc', py: 4 }}>
      <Box sx={{ maxWidth: 800, mx: 'auto', px: 2, mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
        {onBack && (
          <IconButton onClick={onBack} sx={{ bgcolor: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <ArrowBackIcon />
          </IconButton>
        )}
        <Typography variant="h5" fontWeight={900} color="#0f172a">
          {step === 'slip' ? 'Voucher Slip Generated' : 'New Voucher'}
        </Typography>
      </Box>

      {step === 'form' ? <FormView /> : <SlipView />}

      <Snackbar
        open={!!snack}
        autoHideDuration={5000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack?.type || 'info'} variant="filled" onClose={() => setSnack(null)} sx={{ borderRadius: '12px' }}>
          {snack?.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default VoucherEntry;
