import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, TextField, Button, CircularProgress,
  IconButton, Chip, Alert
} from '@mui/material';
import SearchableSelect from './SearchableSelect';
import CloseIcon from '@mui/icons-material/Close';
import SaveIcon from '@mui/icons-material/Save';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

const INVOICE_TYPES = [
  'Regular',
  'SEZ supplies with payment',
  'SEZ supplies without payment',
  'Deemed Exp'
];

const REVERSE_CHARGE_OPTIONS = ['No', 'Yes'];

const ITC_OPTIONS = [
  'Inputs',
  'Capital Goods',
  'Input Services',
  'Ineligible'
];

const INITIAL_FORM_DATA = {
  'GSTIN of Supplier': '',
  'Trade / Legal Name': '',
  'Invoice Number': '',
  'Invoice Type': 'Regular',
  'Invoice Date': new Date().toISOString().split('T')[0],
  'Invoice Value': '',
  'Place of Supply': '19-West Bengal',
  'Supply attract reverse charge': 'No',
  'Taxable Value': '',
  'Integrated Tax': '0',
  'CGST': '0',
  'SGST': '0',
  'Cess': '0',
  'GSTR-1/1A/IFF/GSTR-5 Period': '',
  'GSTR-1/1A/IFF/GSTR-5 Filing Date': '',
  'ITC Availability': 'Inputs',
  'Reason': '',
  'Applicable % Tax Rate': '18',
  'Source': 'Debit Reason Allocation',
  'IRN': '',
  'IRN Date': ''
};

export default function B2BEntryDialog({
  open,
  onClose,
  invoiceNumber,
  debitReason,
  row,
  allocationId,
  onSaved
}) {
  const [formData, setFormData] = useState({ ...INITIAL_FORM_DATA });
  const [existingEntryId, setExistingEntryId] = useState(null);
  const [existingPdfUrl, setExistingPdfUrl] = useState(null);
  const [pdfFile, setPdfFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Fetch existing B2B entry matching this bill and debit reason
  const loadExistingB2BRecord = useCallback(async () => {
    if (!open || !invoiceNumber) return;
    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/gst-portal`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      const allEntries = res.data?.entries || [];
      // Look for an existing B2B record linked to this invoice number and debit reason
      const match = allEntries.find(e =>
        (!e.type || e.type === 'b2b') &&
        (
          (e.billRegisterInvoiceNo === invoiceNumber && e.debitReason === debitReason) ||
          (e.bankBookRecordId && row?._id && String(e.bankBookRecordId) === String(row._id) && e.debitReason === debitReason) ||
          (row?.b2bEntryId && String(e._id) === String(row.b2bEntryId))
        )
      );

      if (match) {
        setExistingEntryId(match._id);
        setExistingPdfUrl(match.GST_FILE_URL || null);
        setFormData({
          'GSTIN of Supplier': match['GSTIN of Supplier'] || '',
          'Trade / Legal Name': match['Trade / Legal Name'] || '',
          'Invoice Number': match['Invoice Number'] || '',
          'Invoice Type': match['Invoice Type'] || 'Regular',
          'Invoice Date': match['Invoice Date'] || new Date().toISOString().split('T')[0],
          'Invoice Value': match['Invoice Value'] != null ? String(match['Invoice Value']) : '',
          'Place of Supply': match['Place of Supply'] || '19-West Bengal',
          'Supply attract reverse charge': match['Supply attract reverse charge'] || 'No',
          'Taxable Value': match['Taxable Value'] != null ? String(match['Taxable Value']) : '',
          'Integrated Tax': match['Integrated Tax'] != null ? String(match['Integrated Tax']) : '0',
          'CGST': match['CGST'] != null ? String(match['CGST']) : '0',
          'SGST': match['SGST'] != null ? String(match['SGST']) : '0',
          'Cess': match['Cess'] != null ? String(match['Cess']) : '0',
          'GSTR-1/1A/IFF/GSTR-5 Period': match['GSTR-1/1A/IFF/GSTR-5 Period'] || row?.month || '',
          'GSTR-1/1A/IFF/GSTR-5 Filing Date': match['GSTR-1/1A/IFF/GSTR-5 Filing Date'] || '',
          'ITC Availability': match['ITC Availability'] || 'Inputs',
          'Reason': match['Reason'] || debitReason || '',
          'Applicable % Tax Rate': match['Applicable % Tax Rate'] != null ? String(match['Applicable % Tax Rate']) : '18',
          'Source': match['Source'] || 'Debit Reason Allocation',
          'IRN': match['IRN'] || '',
          'IRN Date': match['IRN Date'] || ''
        });
      } else {
        // Initialize new form
        setExistingEntryId(null);
        setExistingPdfUrl(null);
        setPdfFile(null);
        setFormData({
          ...INITIAL_FORM_DATA,
          'Trade / Legal Name': row?.site || '',
          'Reason': debitReason || '',
          'GSTR-1/1A/IFF/GSTR-5 Period': row?.month || '',
          'Source': 'Debit Reason Allocation'
        });
      }
    } catch (err) {
      console.error('[B2BEntryDialog] Error loading B2B records:', err);
    } finally {
      setLoading(false);
    }
  }, [open, invoiceNumber, debitReason, row]);

  useEffect(() => {
    if (open) {
      loadExistingB2BRecord();
    }
  }, [open, loadExistingB2BRecord]);

  // Dynamic calculations when Taxable Value or Tax Rate changes
  const handleTaxableValueChange = (taxVal, rateStr) => {
    const tvNum = parseFloat(taxVal) || 0;
    const rateNum = parseFloat(rateStr !== undefined ? rateStr : formData['Applicable % Tax Rate']) || 18;
    const halfRate = rateNum / 200;

    const cgst = Math.round(tvNum * halfRate);
    const sgst = Math.round(tvNum * halfRate);
    const igst = parseFloat(formData['Integrated Tax']) || 0;
    const cess = parseFloat(formData['Cess']) || 0;
    const invVal = tvNum + cgst + sgst + igst + cess;

    setFormData(prev => ({
      ...prev,
      'Taxable Value': taxVal,
      'CGST': String(cgst),
      'SGST': String(sgst),
      'Invoice Value': String(invVal)
    }));
  };

  const handleRateChange = (newRate) => {
    const rateNum = parseFloat(newRate) || 0;
    const tvNum = parseFloat(formData['Taxable Value']) || 0;
    const halfRate = rateNum / 200;

    const cgst = Math.round(tvNum * halfRate);
    const sgst = Math.round(tvNum * halfRate);
    const igst = parseFloat(formData['Integrated Tax']) || 0;
    const cess = parseFloat(formData['Cess']) || 0;
    const invVal = tvNum + cgst + sgst + igst + cess;

    setFormData(prev => ({
      ...prev,
      'Applicable % Tax Rate': newRate,
      'CGST': String(cgst),
      'SGST': String(sgst),
      'Invoice Value': String(invVal)
    }));
  };

  const handleFieldChange = (field, val) => {
    setFormData(prev => ({ ...prev, [field]: val }));
  };

  const handleSave = async () => {
    setSaving(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      // Prepare payload with relationship tracking
      const payload = {
        type: 'b2b',
        'GSTIN of Supplier': formData['GSTIN of Supplier'] || '',
        'Trade / Legal Name': formData['Trade / Legal Name'] || '',
        'Invoice Number': formData['Invoice Number'] || '',
        'Invoice Type': formData['Invoice Type'] || 'Regular',
        'Invoice Date': formData['Invoice Date'] || '',
        'Invoice Value': formData['Invoice Value'] !== '' ? Number(formData['Invoice Value']) : '',
        'Place of Supply': formData['Place of Supply'] || '19-West Bengal',
        'Supply attract reverse charge': formData['Supply attract reverse charge'] || 'No',
        'Taxable Value': formData['Taxable Value'] !== '' ? Number(formData['Taxable Value']) : '',
        'Integrated Tax': formData['Integrated Tax'] !== '' ? Number(formData['Integrated Tax']) : 0,
        'CGST': formData['CGST'] !== '' ? Number(formData['CGST']) : 0,
        'SGST': formData['SGST'] !== '' ? Number(formData['SGST']) : 0,
        'Cess': formData['Cess'] !== '' ? Number(formData['Cess']) : 0,
        'GSTR-1/1A/IFF/GSTR-5 Period': formData['GSTR-1/1A/IFF/GSTR-5 Period'] || '',
        'GSTR-1/1A/IFF/GSTR-5 Filing Date': formData['GSTR-1/1A/IFF/GSTR-5 Filing Date'] || '',
        'ITC Availability': formData['ITC Availability'] || 'Inputs',
        'Reason': formData['Reason'] || debitReason || '',
        'Applicable % Tax Rate': formData['Applicable % Tax Rate'] !== '' ? Number(formData['Applicable % Tax Rate']) : 18,
        'Source': formData['Source'] || 'Debit Reason Allocation',
        'IRN': formData['IRN'] || '',
        'IRN Date': formData['IRN Date'] || '',
        // Preserved Relationships
        bankBookRecordId: row?._id ? String(row._id) : '',
        billRegisterInvoiceNo: invoiceNumber || '',
        debitReason: debitReason || '',
        allocationId: allocationId || '',
        sourceModule: 'BANK_BOOK_DEBIT_REASON_ALLOCATION'
      };

      let savedRecordId = existingEntryId;

      if (existingEntryId) {
        // Update existing record (prevents duplicates)
        const updateRes = await axios.put(`${API_URL}/gst-portal/${existingEntryId}`, payload, { headers });
        if (!updateRes.data?.success) {
          throw new Error(updateRes.data?.error || 'Failed to update B2B record.');
        }
      } else {
        // Fetch current records to determine the next gapless SL NO
        const getRes = await axios.get(`${API_URL}/gst-portal`, { headers });
        const existingEntries = getRes.data?.entries || [];
        const b2bEntries = existingEntries.filter(e => !e.type || e.type === 'b2b');
        const nextSlNo = b2bEntries.length > 0 ? Math.max(...b2bEntries.map(e => Number(e['SL NO']) || 0)) + 1 : 1;

        payload['SL NO'] = nextSlNo;

        const createRes = await axios.post(`${API_URL}/gst-portal`, payload, { headers });
        if (!createRes.data?.success || !createRes.data?.entry?._id) {
          throw new Error(createRes.data?.error || 'Failed to create B2B record.');
        }
        savedRecordId = createRes.data.entry._id;
        setExistingEntryId(savedRecordId);
      }

      // If PDF file was selected, upload it
      if (pdfFile && savedRecordId) {
        try {
          const fileFormData = new FormData();
          fileFormData.append('file', pdfFile);
          await axios.post(`${API_URL}/gst-portal/attach/${savedRecordId}/gst_file`, fileFormData, {
            headers: {
              ...headers,
              'Content-Type': 'multipart/form-data'
            }
          });
        } catch (uploadErr) {
          console.error('[B2BEntryDialog] PDF Upload Error:', uploadErr);
        }
      }

      // Link B2B ID back to FinancialYearRow for complete two-way traceability
      try {
        await axios.post(`${API_URL}/fy-details/save-row`, {
          billNo: invoiceNumber,
          b2bEntryId: String(savedRecordId)
        }, { headers });
      } catch (linkErr) {
        console.warn('[B2BEntryDialog] Linking to FY row notice:', linkErr);
      }

      setSuccessMessage('B2B record saved successfully into GST Portal database!');
      if (onSaved) {
        onSaved({
          entryId: savedRecordId,
          isNew: !existingEntryId,
          payload
        });
      }

      // Briefly wait to display success then close modal
      setTimeout(() => {
        onClose();
      }, 700);

    } catch (err) {
      console.error('[B2BEntryDialog] Save error:', err);
      setErrorMessage(err.response?.data?.error || err.message || 'Failed to save B2B record.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '12px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.08)',
          overflow: 'hidden'
        }
      }}
    >
      {/* ── Dialog Header ── */}
      <DialogTitle sx={{
        p: 2.5,
        background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <ReceiptLongIcon sx={{ fontSize: 28 }} />
          <Box>
            <Typography variant="h6" fontWeight={800} sx={{ lineHeight: 1.2, color: '#ffffff' }}>
              B2B ENTRY — DEBIT REASON ALLOCATION
            </Typography>
            <Box display="flex" alignItems="center" gap={1} mt={0.5}>
              <Chip
                size="small"
                label={debitReason}
                sx={{ bgcolor: 'rgba(255,255,255,0.25)', color: '#fff', fontWeight: 700, fontSize: '11px' }}
              />
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600 }}>
                Bill: <span style={{ fontFamily: 'monospace', fontWeight: 800 }}>{invoiceNumber || '—'}</span>
              </Typography>
            </Box>
          </Box>
        </Box>
        <IconButton
          size="small"
          onClick={onClose}
          disabled={saving}
          sx={{ color: 'rgba(255,255,255,0.85)', '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.1)' } }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      {/* ── Dialog Content ── */}
      <DialogContent dividers sx={{ p: 3, bgcolor: '#f8fafc' }}>
        {loading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 6, gap: 2 }}>
            <CircularProgress size={32} sx={{ color: '#0ea5e9' }} />
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Loading existing B2B record…
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {/* Status alerts */}
            {errorMessage && (
              <Alert severity="error" onClose={() => setErrorMessage('')}>
                {errorMessage}
              </Alert>
            )}
            {successMessage && (
              <Alert severity="success" onClose={() => setSuccessMessage('')}>
                {successMessage}
              </Alert>
            )}

            {existingEntryId && (
              <Box sx={{
                p: 1.5, bgcolor: '#e0f2fe', borderRadius: '8px', border: '1px solid #bae6fd',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
              }}>
                <Typography variant="body2" sx={{ fontSize: 12, fontWeight: 700, color: '#0369a1' }}>
                  ✓ Existing B2B Record Linked (ID: <span style={{ fontFamily: 'monospace' }}>{existingEntryId}</span>). Changes will update this record.
                </Typography>
              </Box>
            )}

            {/* Input Grid */}
            <Box sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 2,
              bgcolor: '#ffffff',
              p: 2.5,
              borderRadius: '10px',
              border: '1px solid #e2e8f0'
            }}>
              {/* 1. GSTIN */}
              <TextField
                label="GSTIN of Supplier"
                size="small"
                fullWidth
                value={formData['GSTIN of Supplier'] || ''}
                onChange={(e) => handleFieldChange('GSTIN of Supplier', e.target.value)}
                inputProps={{ style: { textTransform: 'uppercase', fontFamily: 'monospace', fontWeight: 600 } }}
              />

              {/* 2. Trade / Legal Name */}
              <TextField
                label="Trade / Legal Name"
                size="small"
                fullWidth
                value={formData['Trade / Legal Name'] || ''}
                onChange={(e) => handleFieldChange('Trade / Legal Name', e.target.value)}
              />

              {/* 3. Invoice Number */}
              <TextField
                label="Invoice Number"
                size="small"
                fullWidth
                value={formData['Invoice Number'] || ''}
                onChange={(e) => handleFieldChange('Invoice Number', e.target.value)}
              />

              {/* 4. Invoice Type */}
              <Box>
                <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#64748b', mb: 0.5 }}>
                  INVOICE TYPE
                </Typography>
                <SearchableSelect
                  variant="standard"
                  value={formData['Invoice Type'] || 'Regular'}
                  onChange={(e) => handleFieldChange('Invoice Type', e.target.value)}
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1',
                    fontSize: '12px', fontWeight: 600, color: '#1e293b', background: '#fff'
                  }}
                >
                  {INVOICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </SearchableSelect>
              </Box>

              {/* 5. Invoice Date */}
              <TextField
                label="Invoice Date"
                type="date"
                size="small"
                fullWidth
                InputLabelProps={{ shrink: true }}
                value={formData['Invoice Date'] || ''}
                onChange={(e) => handleFieldChange('Invoice Date', e.target.value)}
              />

              {/* 6. Taxable Value */}
              <TextField
                label="Taxable Value (₹)"
                type="number"
                size="small"
                fullWidth
                value={formData['Taxable Value'] || ''}
                onChange={(e) => handleTaxableValueChange(e.target.value)}
                inputProps={{ style: { fontWeight: 700, fontFamily: 'monospace' } }}
              />

              {/* 7. Applicable % Tax Rate */}
              <TextField
                label="Applicable % Tax Rate"
                type="number"
                size="small"
                fullWidth
                value={formData['Applicable % Tax Rate'] || ''}
                onChange={(e) => handleRateChange(e.target.value)}
              />

              {/* 8. Integrated Tax */}
              <TextField
                label="Integrated Tax (₹)"
                type="number"
                size="small"
                fullWidth
                value={formData['Integrated Tax'] || ''}
                onChange={(e) => {
                  const igst = e.target.value;
                  const tvNum = parseFloat(formData['Taxable Value']) || 0;
                  const cgst = parseFloat(formData['CGST']) || 0;
                  const sgst = parseFloat(formData['SGST']) || 0;
                  const cess = parseFloat(formData['Cess']) || 0;
                  const invVal = tvNum + cgst + sgst + (parseFloat(igst) || 0) + cess;
                  setFormData(prev => ({ ...prev, 'Integrated Tax': igst, 'Invoice Value': String(invVal) }));
                }}
              />

              {/* 9. CGST */}
              <TextField
                label="CGST (₹)"
                type="number"
                size="small"
                fullWidth
                value={formData['CGST'] || ''}
                onChange={(e) => handleFieldChange('CGST', e.target.value)}
                inputProps={{ style: { fontFamily: 'monospace' } }}
              />

              {/* 10. SGST */}
              <TextField
                label="SGST (₹)"
                type="number"
                size="small"
                fullWidth
                value={formData['SGST'] || ''}
                onChange={(e) => handleFieldChange('SGST', e.target.value)}
                inputProps={{ style: { fontFamily: 'monospace' } }}
              />

              {/* 11. Cess */}
              <TextField
                label="Cess (₹)"
                type="number"
                size="small"
                fullWidth
                value={formData['Cess'] || ''}
                onChange={(e) => handleFieldChange('Cess', e.target.value)}
                inputProps={{ style: { fontFamily: 'monospace' } }}
              />

              {/* 12. Total Invoice Value */}
              <TextField
                label="Invoice Value (₹)"
                type="number"
                size="small"
                fullWidth
                value={formData['Invoice Value'] || ''}
                onChange={(e) => handleFieldChange('Invoice Value', e.target.value)}
                inputProps={{ style: { fontWeight: 800, color: '#0369a1', fontFamily: 'monospace' } }}
              />

              {/* 13. Place of Supply */}
              <TextField
                label="Place of Supply"
                size="small"
                fullWidth
                value={formData['Place of Supply'] || ''}
                onChange={(e) => handleFieldChange('Place of Supply', e.target.value)}
              />

              {/* 14. Reverse Charge */}
              <Box>
                <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#64748b', mb: 0.5 }}>
                  REVERSE CHARGE
                </Typography>
                <SearchableSelect
                  variant="standard"
                  value={formData['Supply attract reverse charge'] || 'No'}
                  onChange={(e) => handleFieldChange('Supply attract reverse charge', e.target.value)}
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1',
                    fontSize: '12px', fontWeight: 600, color: '#1e293b', background: '#fff'
                  }}
                >
                  {REVERSE_CHARGE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </SearchableSelect>
              </Box>

              {/* 15. GSTR Period */}
              <TextField
                label="GSTR Period"
                size="small"
                fullWidth
                value={formData['GSTR-1/1A/IFF/GSTR-5 Period'] || ''}
                onChange={(e) => handleFieldChange('GSTR-1/1A/IFF/GSTR-5 Period', e.target.value)}
              />

              {/* 16. GSTR Filing Date */}
              <TextField
                label="GSTR Filing Date"
                type="date"
                size="small"
                fullWidth
                InputLabelProps={{ shrink: true }}
                value={formData['GSTR-1/1A/IFF/GSTR-5 Filing Date'] || ''}
                onChange={(e) => handleFieldChange('GSTR-1/1A/IFF/GSTR-5 Filing Date', e.target.value)}
              />

              {/* 17. ITC Availability */}
              <Box>
                <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#64748b', mb: 0.5 }}>
                  ITC AVAILABILITY
                </Typography>
                <SearchableSelect
                  variant="standard"
                  value={formData['ITC Availability'] || 'Inputs'}
                  onChange={(e) => handleFieldChange('ITC Availability', e.target.value)}
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1',
                    fontSize: '12px', fontWeight: 600, color: '#1e293b', background: '#fff'
                  }}
                >
                  {ITC_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </SearchableSelect>
              </Box>

              {/* 18. Reason */}
              <TextField
                label="Reason"
                size="small"
                fullWidth
                value={formData['Reason'] || ''}
                onChange={(e) => handleFieldChange('Reason', e.target.value)}
              />

              {/* 19. Source */}
              <TextField
                label="Source"
                size="small"
                fullWidth
                value={formData['Source'] || ''}
                onChange={(e) => handleFieldChange('Source', e.target.value)}
              />

              {/* 20. IRN */}
              <TextField
                label="IRN"
                size="small"
                fullWidth
                value={formData['IRN'] || ''}
                onChange={(e) => handleFieldChange('IRN', e.target.value)}
              />

              {/* 21. IRN Date */}
              <TextField
                label="IRN Date"
                type="date"
                size="small"
                fullWidth
                InputLabelProps={{ shrink: true }}
                value={formData['IRN Date'] || ''}
                onChange={(e) => handleFieldChange('IRN Date', e.target.value)}
              />
            </Box>

            {/* ── File Upload Section ── */}
            <Box sx={{
              p: 2, bgcolor: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2
            }}>
              <Box display="flex" alignItems="center" gap={1.5}>
                <FileUploadIcon sx={{ color: '#0ea5e9' }} />
                <Box>
                  <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>
                    GST Invoice Attachment / Proof (Optional)
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {pdfFile ? `Selected: ${pdfFile.name}` : existingPdfUrl ? 'Existing attachment available' : 'Upload invoice copy or verification document'}
                  </Typography>
                </Box>
              </Box>
              <Box display="flex" alignItems="center" gap={1}>
                {existingPdfUrl && !pdfFile && (
                  <Button
                    size="small"
                    variant="outlined"
                    href={existingPdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ textTransform: 'none', fontSize: 11, fontWeight: 700 }}
                  >
                    View File
                  </Button>
                )}
                <Button
                  component="label"
                  size="small"
                  variant="outlined"
                  sx={{ textTransform: 'none', fontSize: 11, fontWeight: 700, borderColor: '#cbd5e1', color: '#334155' }}
                >
                  {pdfFile ? 'Change File' : 'Choose File'}
                  <input
                    type="file"
                    hidden
                    accept=".pdf,image/*"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setPdfFile(e.target.files[0]);
                      }
                    }}
                  />
                </Button>
              </Box>
            </Box>
          </Box>
        )}
      </DialogContent>

      {/* ── Dialog Actions ── */}
      <DialogActions sx={{ p: 2.5, bgcolor: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
        <Button
          onClick={onClose}
          disabled={saving}
          variant="outlined"
          sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '8px' }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving || loading}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
          sx={{
            bgcolor: '#0ea5e9',
            '&:hover': { bgcolor: '#0284c7' },
            textTransform: 'none',
            fontWeight: 800,
            borderRadius: '8px',
            px: 3,
            py: 1,
            boxShadow: '0 4px 6px -1px rgba(14, 165, 233, 0.3)'
          }}
        >
          {saving ? 'Saving to B2B…' : existingEntryId ? 'Update B2B Record' : 'Save B2B Record'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
