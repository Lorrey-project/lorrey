import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Button,
  IconButton,
  TextField,
  Chip,
  Paper,
  Tooltip,
  CircularProgress,
  Radio,
  Divider,
  Alert,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ImageIcon from '@mui/icons-material/Image';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

const API_URL = import.meta.env.VITE_API_URL;

function toInputDateFormat(val) {
  if (!val) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  const dmyMatch = String(val).match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }
  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return val;
}

function formatDateDisplay(val) {
  if (!val) return '—';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) return val;
  const ymdMatch = String(val).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymdMatch) {
    return `${ymdMatch[3]}/${ymdMatch[2]}/${ymdMatch[1]}`;
  }
  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }
  return String(val);
}

export default function CheckSelectionModal({
  open,
  onClose,
  checkNumber,
  matchingChecks = [],
  onConfirm,
  defaultReceivingDate = '',
}) {
  const [selectedCheckId, setSelectedCheckId] = useState('');
  const [receivingDate, setReceivingDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [previewDoc, setPreviewDoc] = useState({ open: false, url: '', name: '', type: '' });

  // Pre-select the check and receiving date when opened
  useEffect(() => {
    if (open && matchingChecks.length > 0) {
      const initial = matchingChecks[0];
      setSelectedCheckId(initial._id);
      const initialRecDate = initial.receivingDate || defaultReceivingDate || new Date().toISOString().split('T')[0];
      setReceivingDate(toInputDateFormat(initialRecDate));
      setError('');
    }
  }, [open, matchingChecks, defaultReceivingDate]);

  const selectedCheck = matchingChecks.find((c) => c._id === selectedCheckId) || matchingChecks[0];

  const handleSelect = (check) => {
    setSelectedCheckId(check._id);
    if (check.receivingDate) {
      setReceivingDate(toInputDateFormat(check.receivingDate));
    }
    setError('');
  };

  const getDocUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `${API_URL.replace(/\/+$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  const handleOpenDoc = (c, e) => {
    if (e) e.stopPropagation();
    const fullUrl = getDocUrl(c.documentUrl);
    const isPdf =
      (c.documentType && c.documentType.includes('pdf')) ||
      (c.documentName && c.documentName.toLowerCase().endsWith('.pdf'));
    setPreviewDoc({
      open: true,
      url: fullUrl,
      name: c.documentName || `Check #${c.checkNumber}`,
      type: isPdf ? 'pdf' : 'image',
    });
  };

  const handleConfirmClick = async () => {
    if (!selectedCheck) {
      setError('Please select a saved check record.');
      return;
    }

    const cleanDate = String(receivingDate || '').trim();
    if (!cleanDate) {
      setError('Receiving Date is required to confirm check.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await onConfirm(selectedCheck, cleanDate);
      onClose();
    } catch (err) {
      console.error('Check confirmation error:', err);
      setError(err.response?.data?.error || err.message || 'Failed to confirm check.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={!submitting ? onClose : undefined}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            overflow: 'hidden',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
          },
        }}
      >
        {/* Header */}
        <DialogTitle
          sx={{
            py: 2,
            px: 2.5,
            bgcolor: '#0f766e',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 38,
                height: 38,
                borderRadius: 2,
                bgcolor: 'rgba(255,255,255,0.18)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MenuBookIcon sx={{ color: '#fff', fontSize: 22 }} />
            </Box>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="subtitle1" fontWeight={800} sx={{ letterSpacing: '-0.2px' }}>
                  Select Check from Check Book
                </Typography>
                {checkNumber && (
                  <Chip
                    label={`#${checkNumber}`}
                    size="small"
                    sx={{
                      bgcolor: 'rgba(255,255,255,0.25)',
                      color: '#fff',
                      fontWeight: 800,
                      fontFamily: 'monospace',
                    }}
                  />
                )}
              </Box>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.85)' }}>
                Matching saved check found. Confirm details to auto-populate Bank Book Deposit.
              </Typography>
            </Box>
          </Box>

          <IconButton
            onClick={onClose}
            disabled={submitting}
            sx={{ color: '#fff', '&:hover': { bgcolor: 'rgba(255,255,255,0.15)' } }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ p: 2.5, bgcolor: '#f8fafc' }}>
          {error && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {error}
            </Alert>
          )}

          {/* List of matching saved checks */}
          <Typography variant="subtitle2" fontWeight={800} color="#334155" sx={{ mb: 1 }}>
            Matching Saved Checks ({matchingChecks.length})
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 2.5 }}>
            {matchingChecks.map((c) => {
              const isSelected = c._id === selectedCheckId;
              const isPdf =
                (c.documentType && c.documentType.includes('pdf')) ||
                (c.documentName && c.documentName.toLowerCase().endsWith('.pdf'));

              return (
                <Paper
                  key={c._id}
                  onClick={() => handleSelect(c)}
                  elevation={0}
                  sx={{
                    p: 2,
                    borderRadius: 2.5,
                    border: '2px solid',
                    borderColor: isSelected ? '#0f766e' : '#e2e8f0',
                    bgcolor: isSelected ? '#f0fdfa' : '#ffffff',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: isSelected
                      ? '0 4px 12px rgba(15,118,110,0.12)'
                      : '0 1px 3px rgba(0,0,0,0.03)',
                    '&:hover': {
                      borderColor: isSelected ? '#0f766e' : '#cbd5e1',
                      bgcolor: isSelected ? '#f0fdfa' : '#fafafa',
                    },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Radio
                        checked={isSelected}
                        onChange={() => handleSelect(c)}
                        value={c._id}
                        sx={{
                          color: '#94a3b8',
                          '&.Mui-checked': { color: '#0f766e' },
                          p: 0.5,
                        }}
                      />
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Typography
                            variant="body1"
                            fontWeight={800}
                            fontFamily="monospace"
                            sx={{ color: '#0f172a', fontSize: '1rem' }}
                          >
                            CHECK #{c.checkNumber}
                          </Typography>
                          <Typography
                            variant="h6"
                            fontWeight={800}
                            sx={{ color: '#047857', fontSize: '1.05rem' }}
                          >
                            ₹{Number(c.checkAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </Typography>
                        </Box>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 0.5 }}>
                          <Typography variant="caption" sx={{ color: '#475569', fontWeight: 600 }}>
                            Check Date:{' '}
                            <strong style={{ color: '#0f172a' }}>{formatDateDisplay(c.checkDate)}</strong>
                          </Typography>
                          <Divider orientation="vertical" flexItem sx={{ height: 14 }} />
                          <Typography variant="caption" sx={{ color: '#475569', fontWeight: 600 }}>
                            Receiving Date:{' '}
                            {c.receivingDate ? (
                              <strong style={{ color: '#047857' }}>{formatDateDisplay(c.receivingDate)}</strong>
                            ) : (
                              <Chip
                                label="Pending"
                                size="small"
                                sx={{
                                  height: 18,
                                  fontSize: 10,
                                  fontWeight: 800,
                                  bgcolor: '#fef3c7',
                                  color: '#92400e',
                                }}
                              />
                            )}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>

                    {/* Document Preview Button */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {c.documentUrl && (
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={
                            isPdf ? (
                              <PictureAsPdfIcon sx={{ color: '#dc2626', fontSize: 16 }} />
                            ) : (
                              <ImageIcon sx={{ color: '#2563eb', fontSize: 16 }} />
                            )
                          }
                          onClick={(e) => handleOpenDoc(c, e)}
                          sx={{
                            borderRadius: 2,
                            borderColor: '#cbd5e1',
                            color: '#334155',
                            textTransform: 'none',
                            fontSize: 11,
                            fontWeight: 700,
                            py: 0.5,
                            px: 1.25,
                            bgcolor: '#fff',
                            '&:hover': { borderColor: '#0f766e', bgcolor: '#f0fdfa' },
                          }}
                        >
                          View Document
                        </Button>
                      )}
                    </Box>
                  </Box>
                </Paper>
              );
            })}
          </Box>

          {/* Selected Check Details & Receiving Date Confirmation */}
          {selectedCheck && (
            <Paper
              elevation={0}
              sx={{
                p: 2.5,
                borderRadius: 2.5,
                bgcolor: '#ffffff',
                border: '1px solid #cbd5e1',
              }}
            >
              <Typography variant="subtitle2" fontWeight={800} color="#0f766e" sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <CheckCircleIcon sx={{ fontSize: 18, color: '#0f766e' }} />
                Confirm Check & Receiving Date
              </Typography>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mb: 2 }}>
                <Box>
                  <Typography variant="caption" fontWeight={700} color="#64748b" sx={{ display: 'block', mb: 0.5 }}>
                    CHECK NUMBER & AMOUNT
                  </Typography>
                  <Box sx={{ p: 1, bgcolor: '#f1f5f9', borderRadius: 2 }}>
                    <Typography variant="body2" fontWeight={800} sx={{ color: '#0f172a', fontFamily: 'monospace' }}>
                      #{selectedCheck.checkNumber}
                    </Typography>
                    <Typography variant="body1" fontWeight={800} sx={{ color: '#047857' }}>
                      ₹{Number(selectedCheck.checkAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </Typography>
                  </Box>
                </Box>

                <Box>
                  <Typography variant="caption" fontWeight={700} color="#334155" sx={{ display: 'block', mb: 0.5 }}>
                    RECEIVING DATE <span style={{ color: '#dc2626' }}>*</span>
                  </Typography>
                  <TextField
                    size="small"
                    fullWidth
                    type="date"
                    value={receivingDate}
                    onChange={(e) => {
                      setReceivingDate(e.target.value);
                      setError('');
                    }}
                    InputLabelProps={{ shrink: true }}
                    helperText="Date check/document was received in Bank Book"
                    sx={{
                      bgcolor: '#fff',
                      '& .MuiOutlinedInput-root': { borderRadius: 2 },
                    }}
                  />
                </Box>
              </Box>

              {/* Automatic Deposit Notice */}
              <Box
                sx={{
                  p: 1.5,
                  bgcolor: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                }}
              >
                <ArrowForwardIcon sx={{ color: '#059669', fontSize: 20 }} />
                <Typography variant="body2" sx={{ color: '#065f46', fontWeight: 600 }}>
                  Automatic Mapping: Bank Book <strong>DEPOSIT</strong> will be set to{' '}
                  <strong style={{ color: '#047857' }}>
                    ₹{Number(selectedCheck.checkAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </strong>
                  . Receiving Date will be saved permanently.
                </Typography>
              </Box>
            </Paper>
          )}
        </DialogContent>

        <Divider />

        <DialogActions sx={{ p: 2, px: 2.5, bgcolor: '#f8fafc', display: 'flex', justifyContent: 'space-between' }}>
          <Button
            onClick={onClose}
            disabled={submitting}
            variant="outlined"
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
          >
            Cancel
          </Button>

          <Button
            variant="contained"
            onClick={handleConfirmClick}
            disabled={submitting || !selectedCheck || !receivingDate}
            startIcon={submitting ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : <CheckCircleIcon />}
            sx={{
              bgcolor: '#0f766e',
              fontWeight: 800,
              textTransform: 'none',
              borderRadius: 2,
              px: 3,
              boxShadow: '0 4px 10px rgba(15,118,110,0.25)',
              '&:hover': { bgcolor: '#0d655e' },
            }}
          >
            {submitting ? 'CONFIRMING…' : 'CONFIRM / DONE'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Document Preview Modal */}
      <Dialog
        open={previewDoc.open}
        onClose={() => setPreviewDoc({ open: false, url: '', name: '', type: '' })}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, maxHeight: '90vh' } }}
      >
        <DialogTitle
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            py: 1.5,
            px: 2.5,
            bgcolor: '#0f766e',
            color: '#fff',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {previewDoc.type === 'pdf' ? (
              <PictureAsPdfIcon sx={{ color: '#fff' }} />
            ) : (
              <ImageIcon sx={{ color: '#fff' }} />
            )}
            <Typography variant="subtitle1" fontWeight={700}>
              {previewDoc.name}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Tooltip title="Open in new window">
              <IconButton size="small" onClick={() => window.open(previewDoc.url, '_blank')} sx={{ color: '#fff' }}>
                <OpenInNewIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <IconButton
              size="small"
              onClick={() => setPreviewDoc({ open: false, url: '', name: '', type: '' })}
              sx={{ color: '#fff' }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 2, bgcolor: '#f8fafc', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
          {previewDoc.type === 'pdf' ? (
            <iframe
              src={previewDoc.url}
              title={previewDoc.name}
              width="100%"
              height="600px"
              style={{ border: 'none', borderRadius: 8, background: '#fff' }}
            />
          ) : (
            <img
              src={previewDoc.url}
              alt={previewDoc.name}
              style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', borderRadius: 8 }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
