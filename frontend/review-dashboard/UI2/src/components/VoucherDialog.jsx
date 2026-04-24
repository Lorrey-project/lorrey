import React, { useState, useEffect, useRef, forwardRef } from 'react';
import {
  Dialog, DialogTitle, DialogContent, Box, Typography, TextField,
  Button, Grid, IconButton, CircularProgress, Chip, Autocomplete,
  Snackbar, Alert, Backdrop, Fade, List, ListItem, ListItemText,
  ListItemButton, Divider, Tabs, Tab, Badge, InputAdornment,
  useTheme, useMediaQuery, MenuItem
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import DownloadIcon from '@mui/icons-material/Download';
import PrintIcon from '@mui/icons-material/Print';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import HistoryIcon from '@mui/icons-material/History';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import VisibilityIcon from '@mui/icons-material/Visibility';
import PersonIcon from '@mui/icons-material/Person';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import axios from 'axios';
import html2pdf from 'html2pdf.js';
import { API_URL } from '../config';
import { toIndianWords } from '../utils/toIndianWords';

// ── Company ───────────────────────────────────────────────────────────────────
const COMPANY = {
  name: 'DIPALI ASSOCIATES & CO.',
  address: '1st Floor, Panja Hotel, Darjeeling More, Panagarh',
  phone: '7810935738 / 8116221063',
  gst: '19AATFD1733C1ZH',
};

// ── Amount in words ───────────────────────────────────────────────────────────
function amountInWords(num) {
  return toIndianWords(num);
}

// ── Printable Slip Document ───────────────────────────────────────────────────
const VoucherSlipDoc = forwardRef(({ voucher }, ref) => {
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';
  const fmtTime = (d) => d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }) : '—';
  const fmtAmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  return (
    <div ref={ref} style={{
      width: '210mm', minHeight: '148mm', backgroundColor: '#fff',
      fontFamily: '"Times New Roman", Times, serif',
      padding: '12mm 16mm', boxSizing: 'border-box',
      color: '#1a1a1a', position: 'relative',
    }}>
      {/* Watermark */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%) rotate(-30deg)',
        fontSize: '80px', color: 'rgba(26,35,126,0.04)',
        fontWeight: 900, whiteSpace: 'nowrap', pointerEvents: 'none',
        zIndex: 0, userSelect: 'none', letterSpacing: '8px',
      }}>VOUCHER</div>

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#1a237e' }}>{COMPANY.name}</div>
            <div style={{ fontSize: '9px', color: '#555', marginTop: '2px' }}>{COMPANY.address}</div>
            <div style={{ fontSize: '9px', color: '#555' }}>Ph: {COMPANY.phone} | GST: {COMPANY.gst}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ display: 'inline-block', background: '#1a237e', color: '#fff', padding: '4px 16px', borderRadius: '4px', fontSize: '12px', fontWeight: 700, letterSpacing: '2px', marginBottom: '6px' }}>VOUCHER</div>
            <div style={{ fontSize: '10px' }}>No: <strong style={{ fontFamily: 'monospace' }}>{voucher.voucherNumber}</strong></div>
            <div style={{ fontSize: '10px' }}>Date: <strong>{fmtDate(voucher.date)}</strong></div>
            <div style={{ fontSize: '9px', color: '#777' }}>Time: {fmtTime(voucher.createdAt || new Date())}</div>
          </div>
        </div>

        <div style={{ borderTop: '3px solid #1a237e', marginBottom: '12px' }} />

        {/* Data table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5px', marginBottom: '12px' }}>
          <tbody>
            {[
              { label: 'Name', value: voucher.name || '—', bold: true },
              ...(voucher.expenseType === 'Direct Expense' ? [] : [
                { label: 'Vehicle Number', value: voucher.vehicleNumber || '—', mono: true }
              ]),
              { label: voucher.expenseType === 'Direct Expense' ? 'Expense Category' : 'Reason / Purpose', value: voucher.expenseType === 'Direct Expense' ? `${voucher.purpose} - ${voucher.reason || ''}` : voucher.reason || '—' },
              { label: 'Date & Time', value: `${fmtDate(voucher.date)}  |  ${fmtTime(voucher.createdAt || new Date())}` },
            ].map(({ label, value, bold, mono }, i) => (
              <tr key={label} style={{ background: i % 2 === 1 ? '#f8f9fa' : '#fff' }}>
                <td style={{ padding: '6px 8px', color: '#666', width: '32%', fontWeight: 600, borderTop: '1px solid #f0f0f0' }}>{label}</td>
                <td style={{ padding: '6px 8px', fontWeight: bold ? 700 : 400, fontFamily: mono ? 'monospace' : 'inherit', fontSize: mono ? '12px' : '10.5px', borderTop: '1px solid #f0f0f0' }}>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Amount box */}
        <div style={{ border: '2px solid #1a237e', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', marginBottom: '16px', background: '#f0f4ff' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '9px', color: '#777', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>Amount in Words</div>
            <div style={{ fontSize: '10.5px', fontStyle: 'italic', fontWeight: 600, color: '#1a237e' }}>{amountInWords(voucher.amount)}</div>
          </div>
          <div style={{ textAlign: 'right', marginLeft: '16px' }}>
            <div style={{ fontSize: '9px', color: '#777', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Amount (₹)</div>
            <div style={{ fontSize: '26px', fontWeight: 900, color: '#1a237e', letterSpacing: '-1px' }}>₹{fmtAmt(voucher.amount)}</div>
          </div>
        </div>

        {/* Signatures */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
          {['Prepared By', 'Checked By', 'Authorised Signatory'].map(label => (
            <div key={label} style={{ textAlign: 'center', width: '30%' }}>
              <div style={{ borderTop: '1.5px solid #aaa', paddingTop: '5px', fontSize: '9px', color: '#888' }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ marginTop: '10px', borderTop: '1px dashed #ccc', paddingTop: '5px', display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: '#bbb' }}>
          <span>Generated: {new Date().toLocaleString('en-IN')}</span>
          <span>Voucher No: {voucher.voucherNumber}</span>
        </div>
      </div>
    </div>
  );
});
VoucherSlipDoc.displayName = 'VoucherSlipDoc';

// ── Tab Panel helper ──────────────────────────────────────────────────────────
function TabPanel({ value, index, children }) {
  return value === index ? <Box>{children}</Box> : null;
}

// ── Main VoucherDialog ────────────────────────────────────────────────────────
const VoucherDialog = ({ open, onClose, onVoucherCreated, initialTab = 0 }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
  const slipRef = useRef();
  const [tab, setTab] = useState(initialTab);          // 0=New, 1=Previous, 2=Download
  const [contacts, setContacts] = useState({ names: [], vehicles: [], ownerMap: {} });
  const [contactsLoading, setContactsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [slipStep, setSlipStep] = useState(false);   // show slip preview
  const [savedVoucher, setSavedVoucher] = useState(null);
  const [slipUrl, setSlipUrl] = useState(null);
  const [snack, setSnack] = useState(null);
  const [now, setNow] = useState(new Date());

  // Voucher list (for Previous/Download tabs)
  const [vouchers, setVouchers] = useState([]);
  const [vouchersLoading, setVouchersLoading] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState(null);  // for Download tab

  // Form
  const [form, setForm] = useState({ expenseType: 'Indirect Expense', name: null, vehicleNumber: null, reasonCategory: null, reason: '', amount: '' });
  const [errors, setErrors] = useState({});

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Load contacts + vouchers when dialog opens
  useEffect(() => {
    if (!open) return;
    setTab(initialTab);   // jump to the correct tab based on which button was clicked
    setContactsLoading(true);
    axios.get(`${API_URL}/voucher/contacts`)
      .then(res => { if (res.data.success) setContacts(res.data); })
      .catch(console.error)
      .finally(() => setContactsLoading(false));

    fetchVouchers();

    // Reset form
    setTab(0);
    setSlipStep(false);
    setSavedVoucher(null);
    setSlipUrl(null);
    setSelectedVoucher(null);
    setForm({ expenseType: 'Indirect Expense', name: null, vehicleNumber: null, reasonCategory: null, reason: '', amount: '' });
    setErrors({});
  }, [open]);

  const fetchVouchers = () => {
    setVouchersLoading(true);
    axios.get(`${API_URL}/voucher`)
      .then(res => { if (res.data.success) setVouchers(res.data.vouchers); })
      .catch(console.error)
      .finally(() => setVouchersLoading(false));
  };

  // Vehicles filtered by selected owner
  const filteredVehicles = form.name && contacts.ownerMap?.[form.name]
    ? contacts.ownerMap[form.name]
    : contacts.vehicles;

  // When vehicle is selected → auto-fill owner name
  const handleVehicleChange = (_, val) => {
    setForm(p => {
      let ownerName = p.name;
      if (val && !p.name) {
        // Find which owner has this truck
        const found = Object.entries(contacts.ownerMap || {}).find(([, trucks]) => trucks.includes(val));
        if (found) ownerName = found[0];
      }
      return { ...p, vehicleNumber: val, name: ownerName };
    });
    if (errors.vehicleNumber) setErrors(p => ({ ...p, vehicleNumber: '' }));
  };

  // When owner is selected → clear vehicle if not owned by this owner
  const handleOwnerChange = (_, val) => {
    setForm(p => {
      let vehicle = p.vehicleNumber;
      if (val && p.vehicleNumber) {
        const owned = contacts.ownerMap?.[val] || [];
        if (!owned.includes(p.vehicleNumber)) vehicle = null;
      }
      return { ...p, name: val, vehicleNumber: vehicle };
    });
    if (errors.name) setErrors(p => ({ ...p, name: '' }));
  };

  const validate = () => {
    const errs = {};
    if (form.expenseType === 'Indirect Expense') {
      if (!form.name) errs.name = 'Select a truck owner';
      if (!form.vehicleNumber) errs.vehicleNumber = 'Select a vehicle';
    }
    if (form.expenseType === 'Direct Expense' && !form.reasonCategory) errs.reasonCategory = 'Select an expense category';
    if (!form.reason.trim()) errs.reason = 'Reason is required';
    if (!form.amount || parseFloat(form.amount) <= 0) errs.amount = 'Enter a positive amount';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const payload = {
        expenseType: form.expenseType,
        vehicleNumber: form.expenseType === 'Indirect Expense' ? form.vehicleNumber : undefined,
        date: new Date().toISOString(),
        amount: parseFloat(form.amount),
        purpose: form.expenseType === 'Direct Expense' ? form.reasonCategory : 'Others',
        name: form.expenseType === 'Indirect Expense' ? form.name : 'Dipali Associates & Co.',
        reason: form.reason,
      };

      const createRes = await axios.post(`${API_URL}/voucher`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!createRes.data.success) throw new Error(createRes.data.error);
      const voucher = { ...createRes.data.voucher, createdAt: new Date().toISOString() };
      setSavedVoucher(voucher);
      setSlipStep(true);

      await new Promise(r => setTimeout(r, 700));

      // Generate PDF
      const blob = await html2pdf().set({
        margin: 0,
        filename: `voucher_${voucher.voucherNumber}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 3, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a5', orientation: 'landscape' },
      }).from(slipRef.current).output('blob');

      // Upload to S3
      const formData = new FormData();
      formData.append('slip', blob, `voucher_${voucher.voucherNumber}.pdf`);
      const uploadRes = await axios.post(
        `${API_URL}/voucher/${createRes.data.voucher._id}/slip`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${token}` } }
      );
      if (uploadRes.data.success) {
        setSlipUrl(uploadRes.data.slip_url);
        setSavedVoucher(uploadRes.data.voucher);
      }
      setSnack({ type: 'success', message: '✅ Voucher slip saved to S3!' });
      fetchVouchers();
      onVoucherCreated?.();
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      setSnack({ type: 'error', message: '❌ ' + msg });
      if (!savedVoucher) setSlipStep(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadSlip = async (voucher) => {
    if (!voucher?.slip_url) {
      setSnack({ type: 'warning', message: 'No slip available for this voucher.' });
      return;
    }
    try {
      const token = localStorage.getItem('token');
      const proxyUrl = `${API_URL}/invoice/download-proxy?url=${encodeURIComponent(voucher.slip_url)}&filename=${encodeURIComponent(`voucher_${voucher.voucherNumber}.pdf`)}`;
      const res = await axios({ url: proxyUrl, method: 'GET', headers: { Authorization: `Bearer ${token}` }, responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = `voucher_${voucher.voucherNumber}.pdf`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setSnack({ type: 'success', message: '✅ Download started!' });
    } catch (err) {
      // Fallback: direct link
      window.open(voucher.slip_url, '_blank');
    }
  };

  const handleDownloadCurrentSlip = async () => {
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
      setSnack({ type: 'error', message: '❌ Download failed' });
    }
  };

  const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const previewVoucher = {
    voucherNumber: savedVoucher?.voucherNumber || '—',
    expenseType: form.expenseType,
    vehicleNumber: form.expenseType === 'Indirect Expense' ? form.vehicleNumber || '' : undefined,
    date: new Date(),
    name: form.expenseType === 'Indirect Expense' ? form.name || '' : 'Dipali Associates & Co.',
    purpose: form.expenseType === 'Direct Expense' ? form.reasonCategory : 'Others',
    reason: form.reason,
    amount: parseFloat(form.amount) || 0,
    createdAt: new Date().toISOString(),
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={!slipStep ? onClose : undefined}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
        PaperProps={{
          sx: {
            borderRadius: isMobile ? 0 : '24px',
            overflow: 'hidden',
            background: '#ffffff',
            maxHeight: isMobile ? '100dvh' : '92vh',
          }
        }}
      >
        {/* ── Header ── */}
        <DialogTitle sx={{ p: 0 }}>
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 2,
            px: 3, py: 2,
            background: 'linear-gradient(135deg, #4a148c 0%, #7b1fa2 50%, #9c27b0 100%)',
            color: '#fff',
          }}>
            <Box sx={{ width: 40, height: 40, borderRadius: '10px', bgcolor: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ReceiptLongIcon />
            </Box>
            <Box flex={1}>
              <Typography variant="h6" fontWeight={900}>Voucher Manager</Typography>
              <Typography variant="caption" sx={{ opacity: 0.75 }}>DIPALI ASSOCIATES &amp; CO.</Typography>
            </Box>
            {slipStep && (
              <Box display="flex" gap={1}>
                <Button variant="outlined" size="small" startIcon={<PrintIcon />} onClick={() => window.print()}
                  sx={{ borderRadius: '10px', color: '#fff', borderColor: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>
                  Print
                </Button>
                <Button variant="contained" size="small" startIcon={<DownloadIcon />} onClick={handleDownloadCurrentSlip}
                  sx={{ borderRadius: '10px', bgcolor: 'rgba(255,255,255,0.2)', fontWeight: 700 }}>
                  Download
                </Button>
              </Box>
            )}
            <IconButton onClick={onClose} sx={{ color: '#fff' }}><CloseIcon /></IconButton>
          </Box>

          {/* ── Tabs (hidden when showing slip preview or on mobile) ── */}
          {!slipStep && !isMobile && (
            <Box sx={{ bgcolor: '#faf5ff', borderBottom: '1px solid #ede7f6' }}>
              <Tabs
                value={tab}
                onChange={(_, v) => setTab(v)}
                sx={{
                  px: 2,
                  '& .MuiTab-root': { fontWeight: 800, fontSize: '13px', minHeight: 48, textTransform: 'none' },
                  '& .Mui-selected': { color: '#7b1fa2 !important' },
                  '& .MuiTabs-indicator': { backgroundColor: '#7b1fa2' },
                }}
              >
                <Tab icon={<AddCircleOutlineIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="New Voucher" />
                <Tab
                  icon={<Badge badgeContent={vouchers.length} color="secondary" max={99}><HistoryIcon sx={{ fontSize: 18 }} /></Badge>}
                  iconPosition="start"
                  label="Previous Vouchers"
                />
                <Tab icon={<DownloadIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Download Voucher" />
              </Tabs>
            </Box>
          )}
        </DialogTitle>

        <DialogContent sx={{ p: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

          {/* ────────────────────────────────────────────────────────────
              SLIP STEP — shown after save
          ──────────────────────────────────────────────────────────── */}
          {slipStep && (
            <Box sx={{ flex: 1, overflow: 'auto' }}>
              {slipUrl && (
                <Box sx={{ mx: 3, mt: 2, p: 1.5, borderRadius: '12px', bgcolor: '#e8f5e9', border: '1px solid #a5d6a7', display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CheckCircleIcon sx={{ color: '#2e7d32', fontSize: 20 }} />
                  <Box flex={1}>
                    <Typography variant="body2" fontWeight={700} color="#1b5e20">Slip saved to S3</Typography>
                    <Typography variant="caption" color="#388e3c" sx={{ wordBreak: 'break-all' }}>{slipUrl}</Typography>
                  </Box>
                </Box>
              )}
              <Box sx={{ overflow: 'auto', px: 2, py: 2, display: 'flex', justifyContent: 'center' }}>
                <Box sx={{
                  transform: { xs: 'scale(0.44)', sm: 'scale(0.60)', md: 'scale(0.75)' },
                  transformOrigin: 'top center',
                  mb: { xs: -52, sm: -33, md: -18 },
                  boxShadow: '0 12px 50px rgba(0,0,0,0.15)',
                  borderRadius: '4px',
                }}>
                  <VoucherSlipDoc ref={slipRef} voucher={savedVoucher || previewVoucher} />
                </Box>
              </Box>
              <Box sx={{ p: 2, display: 'flex', gap: 2, justifyContent: 'center' }}>
                <Button variant="outlined" onClick={() => { setSlipStep(false); setTab(1); }}
                  sx={{ borderRadius: '12px', fontWeight: 700, borderColor: '#7b1fa2', color: '#7b1fa2' }}>
                  View Previous Vouchers
                </Button>
                <Button variant="contained" onClick={() => {
                  setSlipStep(false);
                  setSavedVoucher(null);
                  setForm({ expenseType: 'Indirect Expense', name: null, vehicleNumber: null, reasonCategory: null, reason: '', amount: '' });
                }}
                  sx={{ borderRadius: '12px', fontWeight: 700, bgcolor: '#7b1fa2' }}>
                  Create Another
                </Button>
              </Box>
            </Box>
          )}

          {/* ────────────────────────────────────────────────────────────
              TAB 0 — New Voucher Form
          ──────────────────────────────────────────────────────────── */}
          {!slipStep && (
            <Box sx={{ flex: 1, overflowY: 'auto' }}>
              <TabPanel value={tab} index={0}>
                <Box sx={{ p: { xs: 2.5, sm: 3.5 } }}>
                  {/* Live date/time */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2, mb: 3, borderRadius: '14px', background: 'linear-gradient(135deg, #f3e5f5 0%, #e8eaf6 100%)', border: '1px solid rgba(123,31,162,0.1)' }}>
                    <Box flex={1}>
                      <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>Date &amp; Time (Auto)</Typography>
                      <Typography variant="h6" fontWeight={900} color="#4a148c" sx={{ lineHeight: 1.2 }}>
                        {now.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                      </Typography>
                      <Typography variant="body2" color="#7b1fa2" fontWeight={700}>
                        {now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                      </Typography>
                    </Box>
                    <Chip label="Live" size="small" sx={{ bgcolor: '#e8f5e9', color: '#2e7d32', fontWeight: 700 }} />
                  </Box>

                  {/* Voucher No — shown after save */}
                  <Box sx={{ mb: 2.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={700}>VOUCHER NO.</Typography>
                    <Chip
                      label={savedVoucher?.voucherNumber || 'Auto-assigned by server'}
                      size="small"
                      sx={{ fontFamily: 'monospace', fontWeight: 900, bgcolor: '#f3e5f5', color: '#7b1fa2' }}
                    />
                  </Box>

                  <Box display="flex" flexDirection="column" gap={2.5}>
                    {/* Expense Type Toggle */}
                    <Box>
                      <TextField
                        select
                        fullWidth
                        label="Expense Type *"
                        value={form.expenseType}
                        onChange={(e) => setForm(p => ({ ...p, expenseType: e.target.value, reasonCategory: null, reason: '' }))}
                        InputProps={{ sx: { borderRadius: '14px' } }}
                      >
                        <MenuItem value="Indirect Expense">Indirect Expense (Trucks/Logistics)</MenuItem>
                        <MenuItem value="Direct Expense">Direct Expense (Office/Misc)</MenuItem>
                      </TextField>
                    </Box>

                    {/* Owner Name dropdown */}
                    {form.expenseType === 'Indirect Expense' && (
                    <Box>
                      <Autocomplete
                        fullWidth
                        options={contacts.names}
                        value={form.name}
                        onChange={handleOwnerChange}
                        loading={contactsLoading}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label="Truck Owner Name *"
                            error={!!errors.name}
                            helperText={errors.name || `${contacts.names.length} owners in DB`}
                            InputProps={{
                              ...params.InputProps,
                              sx: { borderRadius: '14px' },
                              startAdornment: <PersonIcon sx={{ color: '#7b1fa2', mr: 0.5, fontSize: 20 }} />,
                              endAdornment: (
                                <>
                                  {contactsLoading && <CircularProgress size={16} />}
                                  {params.InputProps.endAdornment}
                                </>
                              ),
                            }}
                          />
                        )}
                        renderOption={(props, option) => (
                          <li {...props} key={option}>
                            <Box>
                              <Typography variant="body2" fontWeight={700}>{option}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {(contacts.ownerMap?.[option] || []).length} vehicle(s)
                              </Typography>
                            </Box>
                          </li>
                        )}
                      />
                    </Box>
                    )}

                    {/* Vehicle Number dropdown — filtered by owner */}
                    {form.expenseType === 'Indirect Expense' && (
                    <Box>
                      <Autocomplete
                        fullWidth
                        options={filteredVehicles}
                        value={form.vehicleNumber}
                        onChange={handleVehicleChange}
                        loading={contactsLoading}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label="Vehicle Number *"
                            error={!!errors.vehicleNumber}
                            helperText={errors.vehicleNumber || (form.name ? `${filteredVehicles.length} vehicle(s) for this owner` : 'All vehicles')}
                            InputProps={{
                              ...params.InputProps,
                              sx: { borderRadius: '14px' },
                              startAdornment: <LocalShippingIcon sx={{ color: '#7b1fa2', mr: 0.5, fontSize: 20 }} />,
                              endAdornment: (
                                <>
                                  {contactsLoading && <CircularProgress size={16} />}
                                  {params.InputProps.endAdornment}
                                </>
                              ),
                            }}
                          />
                        )}
                        renderOption={(props, option) => (
                          <li {...props} key={option}>
                            <Typography variant="body2" fontWeight={700} sx={{ fontFamily: 'monospace' }}>{option}</Typography>
                          </li>
                        )}
                      />
                    </Box>
                    )}

                    {/* Reason Category Dropdown & Reason Input */}
                    <Box display="flex" flexDirection="column" gap={2}>
                      <Autocomplete
                        fullWidth
                        options={form.expenseType === 'Direct Expense' 
                          ? ['Water', 'Cleaning', 'WiFi Recharge', 'Salary', 'Others'] 
                          : ['Service Road Maintanance', 'Service/Maintanance', 'Extra wages', 'Extra(Additional) Toll', 'Others']}
                        value={form.reasonCategory}
                        onChange={(_, val) => {
                          setForm(p => ({
                            ...p,
                            reasonCategory: val,
                            reason: val === 'Others' ? '' : (val || '')
                          }));
                          if (errors.reason) setErrors(p => ({ ...p, reason: '' }));
                        }}
                        renderInput={(params) => (
                          <TextField {...params} label="Reason Category *" InputProps={{ ...params.InputProps, sx: { borderRadius: '14px' } }} />
                        )}
                      />
                      <TextField
                        fullWidth label={form.reasonCategory === 'Others' ? "Specify Custom Reason *" : "Reason"} 
                        value={form.reason}
                        onChange={(e) => { 
                           setForm(p => ({ ...p, reason: e.target.value })); 
                           if (errors.reason) setErrors(p => ({ ...p, reason: '' })); 
                        }}
                        error={!!errors.reason} 
                        helperText={errors.reason || (form.reasonCategory === 'Others' ? 'Describe the purpose of this payment' : 'Auto-filled based on category')}
                        multiline rows={2}
                        disabled={form.reasonCategory !== 'Others'}
                        InputProps={{ 
                          sx: { 
                            borderRadius: '14px', 
                            bgcolor: form.reasonCategory !== 'Others' ? '#f5f5f5' : 'transparent',
                            color: form.reasonCategory !== 'Others' ? '#777' : 'inherit'
                          } 
                        }}
                      />
                    </Box>

                    {/* Amount & Words */}
                    <Box display="flex" gap={2.5} flexDirection={{ xs: 'column', sm: 'row' }}>
                      <Box flex={1}>
                        <TextField
                          fullWidth label="Amount (₹) *" type="number" value={form.amount}
                          onChange={(e) => { setForm(p => ({ ...p, amount: e.target.value })); if (errors.amount) setErrors(p => ({ ...p, amount: '' })); }}
                          error={!!errors.amount} helperText={errors.amount}
                          InputProps={{
                            startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                            sx: { borderRadius: '14px' },
                          }}
                        />
                      </Box>

                      {/* Amount in words live preview */}
                      {form.amount && parseFloat(form.amount) > 0 && (
                        <Box flex={1}>
                          <Box sx={{ p: 1.5, borderRadius: '14px', bgcolor: '#f3e5f5', border: '1px solid rgba(123,31,162,0.15)', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '56px' }}>
                            <Typography variant="caption" color="text.secondary" fontWeight={700}>In Words</Typography>
                            <Typography variant="body2" fontWeight={700} color="#7b1fa2" sx={{ fontStyle: 'italic', wordBreak: 'break-word', lineHeight: 1.2 }}>
                              {amountInWords(parseFloat(form.amount))}
                            </Typography>
                          </Box>
                        </Box>
                      )}
                    </Box>
                  </Box>

                  <Button
                    fullWidth variant="contained" size="large" onClick={handleSave}
                    sx={{
                      mt: 3.5, py: 1.8, borderRadius: '16px', fontWeight: 900, fontSize: '1rem',
                      background: 'linear-gradient(45deg, #4a148c, #7b1fa2)',
                      boxShadow: '0 10px 30px rgba(123,31,162,0.3)',
                      '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 14px 36px rgba(123,31,162,0.4)' },
                      transition: 'all 0.2s',
                    }}
                  >
                    Generate Voucher Slip
                  </Button>
                </Box>
              </TabPanel>

              {/* ──────────────────────────────────────────────────────────
                  TAB 1 — Previous Vouchers
              ────────────────────────────────────────────────────────── */}
              <TabPanel value={tab} index={1}>
                <Box sx={{ p: 2 }}>
                  {vouchersLoading ? (
                    <Box display="flex" justifyContent="center" py={6}><CircularProgress sx={{ color: '#7b1fa2' }} /></Box>
                  ) : vouchers.length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 8, opacity: 0.5 }}>
                      <ReceiptLongIcon sx={{ fontSize: 48, color: '#7b1fa2', mb: 1 }} />
                      <Typography color="text.secondary">No vouchers created yet</Typography>
                    </Box>
                  ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxHeight: '55vh', overflowY: 'auto', pr: 0.5 }}>
                      {vouchers.map((v) => (
                        <Box key={v._id} sx={{
                          p: 2, borderRadius: '14px',
                          border: '1.5px solid #ede7f6',
                          bgcolor: '#fdf8ff',
                          '&:hover': { bgcolor: '#f3e5f5', borderColor: '#ce93d8' },
                          transition: 'all 0.15s',
                        }}>
                          <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={0.5}>
                            <Box flex={1} minWidth={0}>
                              <Typography sx={{ fontFamily: 'monospace', fontWeight: 900, color: '#7b1fa2', fontSize: '13px' }}>
                                {v.voucherNumber}
                              </Typography>
                              <Box display="flex" gap={1.5} mt={0.25}>
                                {v.name && (
                                  <Box display="flex" alignItems="center" gap={0.4}>
                                    <PersonIcon sx={{ fontSize: 13, color: '#888' }} />
                                    <Typography variant="caption" fontWeight={700} color="#333">{v.name}</Typography>
                                  </Box>
                                )}
                                <Box display="flex" alignItems="center" gap={0.4}>
                                  <LocalShippingIcon sx={{ fontSize: 13, color: '#888' }} />
                                  <Typography variant="caption" sx={{ fontFamily: 'monospace' }} color="#555">{v.vehicleNumber}</Typography>
                                </Box>
                              </Box>
                              {v.reason && (
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {v.reason}
                                </Typography>
                              )}
                            </Box>
                            <Box textAlign="right" ml={1} flexShrink={0}>
                              <Typography variant="body2" fontWeight={900} color="#1a237e">
                                ₹{Number(v.amount).toLocaleString('en-IN')}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                {fmtDate(v.date || v.createdAt)}
                              </Typography>
                            </Box>
                          </Box>

                          {v.slip_url && (
                            <Box display="flex" gap={1} mt={1}>
                              <Button size="small" variant="outlined" startIcon={<VisibilityIcon sx={{ fontSize: '13px !important' }} />}
                                component="a" href={v.slip_url} target="_blank"
                                sx={{ borderRadius: '8px', fontSize: '11px', fontWeight: 700, flex: 1, borderColor: '#7b1fa2', color: '#7b1fa2', py: 0.4 }}>
                                View Slip
                              </Button>
                              <Button size="small" variant="contained" startIcon={<DownloadIcon sx={{ fontSize: '13px !important' }} />}
                                onClick={() => handleDownloadSlip(v)}
                                sx={{ borderRadius: '8px', fontSize: '11px', fontWeight: 700, flex: 1, bgcolor: '#7b1fa2', py: 0.4, '&:hover': { bgcolor: '#6a1b9a' } }}>
                                Download
                              </Button>
                            </Box>
                          )}
                        </Box>
                      ))}
                    </Box>
                  )}
                </Box>
              </TabPanel>

              {/* ──────────────────────────────────────────────────────────
                  TAB 2 — Download Voucher (select one to download)
              ────────────────────────────────────────────────────────── */}
              <TabPanel value={tab} index={2}>
                <Box sx={{ p: 2 }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ display: 'block', mb: 1.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Select a voucher to download its slip
                  </Typography>
                  {vouchersLoading ? (
                    <Box display="flex" justifyContent="center" py={6}><CircularProgress sx={{ color: '#7b1fa2' }} /></Box>
                  ) : (
                    <Box sx={{ maxHeight: '48vh', overflowY: 'auto' }}>
                      <List disablePadding>
                        {vouchers.map((v, i) => (
                          <React.Fragment key={v._id}>
                            <ListItemButton
                              selected={selectedVoucher?._id === v._id}
                              onClick={() => setSelectedVoucher(v)}
                              sx={{
                                borderRadius: '12px', mb: 0.5,
                                '&.Mui-selected': { bgcolor: '#f3e5f5', '&:hover': { bgcolor: '#ede7f6' } },
                                border: selectedVoucher?._id === v._id ? '1.5px solid #7b1fa2' : '1.5px solid transparent',
                              }}
                            >
                              <ListItemText
                                primary={
                                  <Box display="flex" alignItems="center" gap={1}>
                                    <Typography sx={{ fontFamily: 'monospace', fontWeight: 900, color: '#7b1fa2', fontSize: '13px' }}>{v.voucherNumber}</Typography>
                                    {v.name && <Chip label={v.name} size="small" sx={{ height: 18, fontSize: '10px', fontWeight: 700 }} />}
                                    <Chip label={v.vehicleNumber} size="small" variant="outlined" sx={{ height: 18, fontSize: '10px', fontFamily: 'monospace', fontWeight: 700 }} />
                                  </Box>
                                }
                                secondary={
                                  <Box display="flex" justifyContent="space-between">
                                    <Typography variant="caption" color="text.secondary">{v.reason}</Typography>
                                    <Typography variant="caption" fontWeight={900} color="#1a237e">₹{Number(v.amount).toLocaleString('en-IN')}</Typography>
                                  </Box>
                                }
                              />
                              {v.slip_url && <CheckCircleIcon sx={{ color: '#4caf50', fontSize: 18, ml: 1, flexShrink: 0 }} />}
                            </ListItemButton>
                            {i < vouchers.length - 1 && <Divider sx={{ my: 0.2 }} />}
                          </React.Fragment>
                        ))}
                      </List>
                    </Box>
                  )}

                  {/* Download actions for selected voucher */}
                  {selectedVoucher && (
                    <Box sx={{ mt: 2, p: 2, borderRadius: '14px', bgcolor: '#f3e5f5', border: '1px solid #ce93d8' }}>
                      <Typography variant="body2" fontWeight={700} color="#4a148c" mb={1}>
                        {selectedVoucher.voucherNumber} — {selectedVoucher.name} — {selectedVoucher.vehicleNumber}
                      </Typography>
                      <Box display="flex" gap={1.5}>
                        {selectedVoucher.slip_url ? (
                          <>
                            <Button variant="outlined" startIcon={<VisibilityIcon />}
                              component="a" href={selectedVoucher.slip_url} target="_blank" fullWidth
                              sx={{ borderRadius: '12px', fontWeight: 700, borderColor: '#7b1fa2', color: '#7b1fa2' }}>
                              View Slip
                            </Button>
                            <Button variant="contained" startIcon={<DownloadIcon />}
                              onClick={() => handleDownloadSlip(selectedVoucher)} fullWidth
                              sx={{ borderRadius: '12px', fontWeight: 700, bgcolor: '#7b1fa2', '&:hover': { bgcolor: '#6a1b9a' } }}>
                              Download PDF
                            </Button>
                          </>
                        ) : (
                          <Typography variant="caption" color="error">No slip uploaded for this voucher yet.</Typography>
                        )}
                      </Box>
                    </Box>
                  )}
                </Box>
              </TabPanel>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* Hidden slip for PDF generation during form stage */}
      {!slipStep && (
        <Box sx={{ position: 'fixed', left: '-9999px', top: '-9999px', zIndex: -1 }}>
          <VoucherSlipDoc ref={slipRef} voucher={previewVoucher} />
        </Box>
      )}

      {/* Saving overlay */}
      <Backdrop open={saving} sx={{ color: '#fff', zIndex: 9999, backdropFilter: 'blur(8px)', flexDirection: 'column', gap: 2 }}>
        <CircularProgress color="inherit" size={56} thickness={4} />
        <Typography variant="h6" fontWeight={700}>Generating & Uploading Voucher Slip...</Typography>
        <Typography variant="caption" sx={{ opacity: 0.7 }}>Saving to MongoDB & AWS S3</Typography>
      </Backdrop>

      <Snackbar open={!!snack} autoHideDuration={5000} onClose={() => setSnack(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack?.type || 'info'} variant="filled" onClose={() => setSnack(null)}
          sx={{ borderRadius: '14px', fontWeight: 700 }}>
          {snack?.message}
        </Alert>
      </Snackbar>
    </>
  );
};

export default VoucherDialog;
