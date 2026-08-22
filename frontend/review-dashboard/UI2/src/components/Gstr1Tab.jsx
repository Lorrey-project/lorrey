import React, { useState, useEffect, useMemo } from 'react';
import { Box, Typography, Button, Paper, Snackbar, Alert, Grid } from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const API_URL = import.meta.env.VITE_API_URL;

// ─── Helpers ────────────────────────────────────────────────────────────────
const parseNum = (val) => parseFloat(val) || 0;
const formatMoney = (val) => Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const defaultRowState = { count: '0', docType: '', val: '0', igst: '0', cgst: '0', sgst: '0', cess: '0' };

export default function Gstr1Tab({ entries, filterMonth, filterYear }) {
  const monthName = MONTH_NAMES[filterMonth - 1] || '';
  const fyStr = filterMonth >= 4 ? `${filterYear}-${String(filterYear + 1).slice(-2)}` : `${filterYear - 1}-${String(filterYear).slice(-2)}`;

  // ─── State Management ───────────────────────────────────────────────────────
  const [formData, setFormData] = useState({});
  const [savedDocId, setSavedDocId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [notification, setNotification] = useState({ open: false, message: '', type: 'success' });

  // Load existing form data when entries/month/year changes
  useEffect(() => {
    const existingDoc = entries.find(e => e.type === 'gstr1_form' && e.filterMonth === filterMonth && e.filterYear === filterYear);
    if (existingDoc && existingDoc.formData) {
      setFormData(existingDoc.formData);
      setSavedDocId(existingDoc._id);
    } else {
      setFormData({});
      setSavedDocId(null);
    }
  }, [entries, filterMonth, filterYear]);

  // Handle cell changes
  const updateField = (rowId, field, value) => {
    setFormData(prev => ({
      ...prev,
      [rowId]: {
        ...(prev[rowId] || defaultRowState),
        [field]: value
      }
    }));
  };

  const getRow = (rowId) => formData[rowId] || defaultRowState;

  // ─── Save Functionality ─────────────────────────────────────────────────────
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = {
        type: 'gstr1_form',
        filterMonth,
        filterYear,
        formData
      };

      const token = localStorage.getItem('token');
      const headers = {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      };

      if (savedDocId) {
        // Update existing
        await fetch(`${API_URL}/gst-portal/${savedDocId}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(payload)
        });
      } else {
        // Create new
        const res = await fetch(`${API_URL}/gst-portal`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success && data.entry) {
          setSavedDocId(data.entry._id);
        }
      }
      setNotification({ open: true, message: 'GSTR-1 data saved successfully!', type: 'success' });
    } catch (err) {
      console.error(err);
      setNotification({ open: true, message: 'Failed to save data.', type: 'error' });
    }
    setIsSaving(false);
  };

  // ─── Summary Calculations ───────────────────────────────────────────────────
  const summary = useMemo(() => {
    let invoices = 0, val = 0, igst = 0, cgst = 0, sgst = 0, cess = 0;
    Object.values(formData).forEach(row => {
      val += parseNum(row.val);
      igst += parseNum(row.igst);
      cgst += parseNum(row.cgst);
      sgst += parseNum(row.sgst);
      cess += parseNum(row.cess);
      invoices += parseNum(row.count);
    });
    return { invoices, val, igst, cgst, sgst, cess };
  }, [formData]);

  // ─── UI Components ──────────────────────────────────────────────────────────

  const inputStyle = {
    width: '100%',
    boxSizing: 'border-box',
    border: '1px solid transparent',
    backgroundColor: 'transparent',
    fontSize: '13px',
    fontFamily: 'inherit',
    fontWeight: 500,
    color: '#0f172a',
    outline: 'none',
    padding: '4px 6px',
    transition: 'all 0.1s',
  };

  const inputHoverStyle = {
    border: '1px solid #cbd5e1',
    backgroundColor: '#f8fafc',
    borderRadius: '2px',
  };

  const inputFocusStyle = {
    border: '1px solid #3b82f6',
    backgroundColor: '#fff',
    borderRadius: '2px',
    boxShadow: '0 0 0 1px rgba(59, 130, 246, 0.2)',
  };

  const EditableCell = ({ value, onChange, align = 'left', isNumeric = true }) => {
    const [isHovered, setIsHovered] = useState(false);
    const [isFocused, setIsFocused] = useState(false);

    const handleChange = (e) => {
      let val = e.target.value;
      if (isNumeric) {
        if (val === '' || val === '-' || /^-?\d*\.?\d*$/.test(val)) {
          onChange(val);
        }
      } else {
        onChange(val);
      }
    };

    const handleBlur = () => {
      setIsFocused(false);
      if (isNumeric) {
        if (value === '' || value === '-' || isNaN(parseFloat(value))) {
          onChange('0');
        } else {
          const num = parseFloat(value);
          onChange(value.includes('.') ? value : num.toString());
        }
      }
    };

    return (
      <input
        type="text"
        value={value}
        onChange={handleChange}
        onFocus={() => setIsFocused(true)}
        onBlur={handleBlur}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          ...inputStyle,
          textAlign: align,
          ...(isHovered && !isFocused ? inputHoverStyle : {}),
          ...(isFocused ? inputFocusStyle : {})
        }}
      />
    );
  };

  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    border: '1px solid #cbd5e1',
    marginBottom: '28px',
    backgroundColor: '#fff'
  };

  const thStyle = {
    backgroundColor: '#f1f5f9',
    color: '#334155',
    padding: '8px 12px',
    borderBottom: '2px solid #cbd5e1',
    borderRight: '1px solid #e2e8f0',
    fontSize: '12px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
    textAlign: 'left'
  };

  const thStyleCenter = { ...thStyle, textAlign: 'center' };
  const thStyleRight = { ...thStyle, textAlign: 'right' };

  const tdStyle = {
    padding: '6px 12px',
    borderBottom: '1px solid #e2e8f0',
    borderRight: '1px solid #e2e8f0',
    fontSize: '13px',
    color: '#1e293b'
  };

  const tdStyleRight = { ...tdStyle, textAlign: 'right' };
  const tdStyleCenter = { ...tdStyle, textAlign: 'center' };

  const TableHeaderRow = () => (
    <thead>
      <tr>
        <th style={{ ...thStyle, width: '25%' }}>Description</th>
        <th style={{ ...thStyleCenter, width: '10%' }}>No. of<br />records</th>
        <th style={{ ...thStyleCenter, width: '15%' }}>Document Type</th>
        <th style={{ ...thStyleRight, width: '12.5%' }}>Value (₹)</th>
        <th style={{ ...thStyleRight, width: '12.5%' }}>Integrated Tax (₹)</th>
        <th style={{ ...thStyleRight, width: '12.5%' }}>Central Tax (₹)</th>
        <th style={{ ...thStyleRight, width: '12.5%' }}>State/UT Tax (₹)</th>
        <th style={{ ...thStyleRight, width: '12.5%' }}>Cess (₹)</th>
      </tr>
    </thead>
  );

  const SectionBar = ({ title }) => (
    <Typography
      variant="subtitle2"
      sx={{
        bgcolor: '#e2e8f0',
        color: '#0f172a',
        p: '8px 12px',
        fontWeight: 700,
        border: '1px solid #cbd5e1',
        borderBottom: 'none'
      }}
    >
      {title}
    </Typography>
  );

  const SectionRow = ({ rowId, label, isTotal = false }) => {
    const row = getRow(rowId);
    return (
      <tr style={{ backgroundColor: isTotal ? '#f8fafc' : '#fff' }}>
        <td style={{ ...tdStyle, fontWeight: isTotal ? 700 : 500, color: isTotal ? '#0f172a' : '#334155' }}>{label}</td>
        <td style={tdStyle}>
          <EditableCell value={row.count} onChange={(v) => updateField(rowId, 'count', v)} align="center" />
        </td>
        <td style={tdStyle}>
          <EditableCell value={row.docType} onChange={(v) => updateField(rowId, 'docType', v)} align="center" isNumeric={false} />
        </td>
        <td style={tdStyle}>
          <EditableCell value={row.val} onChange={(v) => updateField(rowId, 'val', v)} align="right" />
        </td>
        <td style={tdStyle}>
          <EditableCell value={row.igst} onChange={(v) => updateField(rowId, 'igst', v)} align="right" />
        </td>
        <td style={tdStyle}>
          <EditableCell value={row.cgst} onChange={(v) => updateField(rowId, 'cgst', v)} align="right" />
        </td>
        <td style={tdStyle}>
          <EditableCell value={row.sgst} onChange={(v) => updateField(rowId, 'sgst', v)} align="right" />
        </td>
        <td style={tdStyle}>
          <EditableCell value={row.cess} onChange={(v) => updateField(rowId, 'cess', v)} align="right" />
        </td>
      </tr>
    );
  };

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: '#f8fafc', flex: 1, height: '100%', overflowY: 'auto', fontFamily: 'Inter, sans-serif' }}>

      <Box sx={{ maxWidth: 1280, margin: '0 auto', bgcolor: '#fff', p: 4, border: '1px solid #e2e8f0' }}>

        {/* ─── Top Header & Save Bar ────────────────────────────────────────────── */}
        <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={4}>
          <Box>
            <Typography variant="h5" fontWeight={800} color="#0f172a">FORM GSTR-1</Typography>
            <Typography variant="subtitle2" fontWeight={600} color="#64748b">[See rule 59(1)]</Typography>
            <Typography variant="subtitle1" fontWeight={700} mt={1} color="#1e293b">Details of outward supplies of goods or services</Typography>
          </Box>
          <Box display="flex" gap={2} alignItems="center">
            <Paper elevation={0} sx={{ p: 1.5, px: 3, display: 'flex', gap: 3, border: '1px solid #cbd5e1', bgcolor: '#f1f5f9' }}>
              <Box>
                <Typography fontSize="11px" fontWeight={700} color="#64748b" textTransform="uppercase">Financial Year</Typography>
                <Typography fontSize="14px" fontWeight={800} color="#0f172a">{fyStr}</Typography>
              </Box>
              <Box>
                <Typography fontSize="11px" fontWeight={700} color="#64748b" textTransform="uppercase">Tax Period</Typography>
                <Typography fontSize="14px" fontWeight={800} color="#0f172a">{monthName}</Typography>
              </Box>
            </Paper>
            <Button
              variant="outlined"
              color="primary"
              startIcon={<SaveIcon />}
              onClick={handleSave}
              disabled={isSaving}
              sx={{ px: 3, py: 1.5, fontWeight: 700, textTransform: 'none', border: '2px solid' }}
            >
              {isSaving ? 'Saving...' : 'Save Draft'}
            </Button>
          </Box>
        </Box>

        {/* ─── Summary Area ────────────────────────────────────────────────── */}
        <Grid container spacing={2} mb={4}>
          {[
            { label: 'Total Invoices', value: summary.invoices, isCurrency: false },
            { label: 'Taxable Value', value: summary.val, isCurrency: true },
            { label: 'Total IGST', value: summary.igst, isCurrency: true },
            { label: 'Total CGST', value: summary.cgst, isCurrency: true },
            { label: 'Total SGST', value: summary.sgst, isCurrency: true },
            { label: 'Total CESS', value: summary.cess, isCurrency: true },
          ].map((item, idx) => (
            <Grid item xs={12} sm={4} md={2} key={idx}>
              <Box sx={{ border: '1px solid #cbd5e1', p: 2, bgcolor: '#f8fafc' }}>
                <Typography fontSize="11px" fontWeight={700} color="#64748b" textTransform="uppercase">{item.label}</Typography>
                <Typography fontSize="16px" fontWeight={800} color="#0f172a" mt={0.5}>
                  {item.isCurrency ? '₹ ' : ''}{formatMoney(item.value)}
                </Typography>
              </Box>
            </Grid>
          ))}
        </Grid>

        {/* ─── Registered Person ────────────────────────────────────────────────── */}
        <table style={{ ...tableStyle, marginBottom: '32px' }}>
          <tbody>
            <tr>
              <td style={{ ...tdStyle, width: '40%', fontWeight: 700, backgroundColor: '#f8fafc' }}>1 GSTIN</td>
              <td style={{ ...tdStyle, fontWeight: 600 }}>19AAHFD5294R1ZK</td>
            </tr>
            <tr>
              <td style={{ ...tdStyle, fontWeight: 700, backgroundColor: '#f8fafc' }}>2 (a) Legal name of the registered person</td>
              <td style={{ ...tdStyle }}>DIPALI NAYEK</td>
            </tr>
            <tr>
              <td style={{ ...tdStyle, fontWeight: 700, backgroundColor: '#f8fafc' }}>(b) Trade name if any</td>
              <td style={{ ...tdStyle }}>LORREY PROJECTS</td>
            </tr>
            <tr>
              <td style={{ ...tdStyle, fontWeight: 700, backgroundColor: '#f8fafc' }}>(c) ARN</td>
              <td style={{ ...tdStyle }}></td>
            </tr>
            <tr>
              <td style={{ ...tdStyle, fontWeight: 700, backgroundColor: '#f8fafc' }}>(d) ARN date</td>
              <td style={{ ...tdStyle }}></td>
            </tr>
          </tbody>
        </table>

        {/* ─── GSTR-1 Sections ──────────────────────────────────────────────────── */}

        <Box sx={{ overflowX: 'auto' }}>

          <SectionBar title="4A - Taxable outward supplies made to registered persons (other than reverse charge supplies) including supplies made through e-commerce operator attracting TCS - B2B Regular" />
          <table style={tableStyle}>
            <TableHeaderRow />
            <tbody><SectionRow rowId="4A_total" label="Total" isTotal /></tbody>
          </table>

          <SectionBar title="4B - Taxable outward supplies made to registered persons attracting tax on reverse charge - B2B Reverse charge" />
          <table style={tableStyle}>
            <TableHeaderRow />
            <tbody><SectionRow rowId="4B_total" label="Total" isTotal /></tbody>
          </table>

          <SectionBar title="5 - Taxable outward inter-state supplies made to unregistered persons (where invoice value is more than Rs. 1 lakh) including supplies made through e-commerce operator, rate wise - B2CL (Large)" />
          <table style={tableStyle}>
            <TableHeaderRow />
            <tbody><SectionRow rowId="5_total" label="Total" isTotal /></tbody>
          </table>

          <SectionBar title="6A - Exports (with/without payment)" />
          <table style={tableStyle}>
            <TableHeaderRow />
            <tbody>
              <SectionRow rowId="6A_total" label="Total" isTotal />
              <SectionRow rowId="6A_expwp" label="EXPWP" />
              <SectionRow rowId="6A_expwop" label="EXPWOP" />
            </tbody>
          </table>

          <SectionBar title="6B - Supplies made to SEZ unit or SEZ developer - SEZWP/SEZWOP" />
          <table style={tableStyle}>
            <TableHeaderRow />
            <tbody>
              <SectionRow rowId="6B_total" label="Total" isTotal />
              <SectionRow rowId="6B_sezwp" label="SEZWP" />
              <SectionRow rowId="6B_sezwop" label="SEZWOP" />
            </tbody>
          </table>

          <SectionBar title="6C - Deemed Exports – DE" />
          <table style={tableStyle}>
            <TableHeaderRow />
            <tbody><SectionRow rowId="6C_total" label="Total" isTotal /></tbody>
          </table>

          <SectionBar title="7 - Taxable supplies (Net of debit and credit notes) to unregistered persons (other than the supplies covered in Table 5) including supplies made through e-commerce operator attracting TCS - B2CS (Others)" />
          <table style={tableStyle}>
            <TableHeaderRow />
            <tbody>
              <SectionRow rowId="7_total" label="Total" isTotal />
              <SectionRow rowId="7_net" label="Net Value" />
            </tbody>
          </table>

          <SectionBar title="8 - Nil rated, exempted and non GST outward supplies" />
          <table style={tableStyle}>
            <TableHeaderRow />
            <tbody>
              <SectionRow rowId="8_total" label="Total" isTotal />
              <SectionRow rowId="8_nil" label="Nil" />
              <SectionRow rowId="8_exempted" label="Exempted" />
              <SectionRow rowId="8_nongst" label="Non-GST" />
            </tbody>
          </table>

          <SectionBar title="9A - Amendments to Outward Supplies" />
          <table style={tableStyle}>
            <TableHeaderRow />
            <tbody>
              <tr><td colSpan={8} style={{ ...tdStyle, backgroundColor: '#f1f5f9', fontWeight: 700, color: '#334155' }}>B2B Regular</td></tr>
              <SectionRow rowId="9A_b2b_reg_amended" label="Amended amount - Total" />
              <SectionRow rowId="9A_b2b_reg_net" label="Net differential amount" />

              <tr><td colSpan={8} style={{ ...tdStyle, backgroundColor: '#f1f5f9', fontWeight: 700, color: '#334155' }}>B2B Reverse charge</td></tr>
              <SectionRow rowId="9A_b2b_rev_amended" label="Amended amount - Total" />
              <SectionRow rowId="9A_b2b_rev_net" label="Net differential amount" />

              <tr><td colSpan={8} style={{ ...tdStyle, backgroundColor: '#f1f5f9', fontWeight: 700, color: '#334155' }}>B2CL (Large)</td></tr>
              <SectionRow rowId="9A_b2cl_amended" label="Amended amount - Total" />
              <SectionRow rowId="9A_b2cl_net" label="Net differential amount" />
            </tbody>
          </table>

          <SectionBar title="9B - Credit/Debit Notes" />
          <table style={tableStyle}>
            <TableHeaderRow />
            <tbody>
              <tr><td colSpan={8} style={{ ...tdStyle, backgroundColor: '#f1f5f9', fontWeight: 700, color: '#334155' }}>Registered (CDNR)</td></tr>
              <SectionRow rowId="9B_cdnr_b2b_reg" label="B2B Regular" />
              <SectionRow rowId="9B_cdnr_b2b_rev" label="B2B Reverse charge" />
              <SectionRow rowId="9B_cdnr_sez" label="SEZWP/SEZWOP" />
              <SectionRow rowId="9B_cdnr_de" label="DE" />
              <SectionRow rowId="9B_cdnr_net" label="Net Total (Debit notes - Credit notes)" isTotal />

              <tr><td colSpan={8} style={{ ...tdStyle, backgroundColor: '#f1f5f9', fontWeight: 700, color: '#334155' }}>Unregistered (CDNUR)</td></tr>
              <SectionRow rowId="9B_cdnur_b2cl" label="B2CL" />
              <SectionRow rowId="9B_cdnur_expwp" label="EXPWP" />
              <SectionRow rowId="9B_cdnur_expwop" label="EXPWOP" />
            </tbody>
          </table>

          <SectionBar title="11 - Advances" />
          <table style={tableStyle}>
            <TableHeaderRow />
            <tbody>
              <tr><td colSpan={8} style={{ ...tdStyle, backgroundColor: '#f1f5f9', fontWeight: 700, color: '#334155' }}>11A - Advances received for which invoice has not been issued</td></tr>
              <SectionRow rowId="11A_total" label="Total" isTotal />
              <tr><td colSpan={8} style={{ ...tdStyle, backgroundColor: '#f1f5f9', fontWeight: 700, color: '#334155' }}>11B - Advance amount received in earlier tax period and adjusted against supplies</td></tr>
              <SectionRow rowId="11B_total" label="Total" isTotal />
            </tbody>
          </table>

          <SectionBar title="12 - HSN-wise summary of outward supplies" />
          <table style={tableStyle}>
            <TableHeaderRow />
            <tbody>
              <SectionRow rowId="12_total" label="Total" isTotal />
              <SectionRow rowId="12_b2b" label="B2B Total" />
              <SectionRow rowId="12_b2c" label="B2C Total" />
            </tbody>
          </table>

          <SectionBar title="13 - Documents issued" />
          <table style={tableStyle}>
            <TableHeaderRow />
            <tbody>
              <SectionRow rowId="13_total" label="Net issued documents" />
            </tbody>
          </table>

          <SectionBar title="14 - Supplies made through E-Commerce Operators" />
          <table style={tableStyle}>
            <TableHeaderRow />
            <tbody>
              <SectionRow rowId="14_total" label="Total" isTotal />
              <SectionRow rowId="14_a" label="(a) Liable to collect tax u/s 52" />
              <SectionRow rowId="14_b" label="(b) Liable to pay tax u/s 9(5)" />
            </tbody>
          </table>

          {/* Final Liability Row */}
          <table style={{ ...tableStyle, border: '2px solid #0f172a', marginTop: '40px', marginBottom: '40px' }}>
            <tbody>
              <tr>
                <td style={{ ...tdStyle, width: '35%', fontWeight: 800, fontSize: '14px', backgroundColor: '#e2e8f0', color: '#0f172a' }}>Total Liability (Outward supplies other than Reverse charge)</td>
                <td style={{ ...tdStyle, width: '10%', backgroundColor: '#e2e8f0' }}></td>
                <td style={{ ...tdStyle, width: '15%', backgroundColor: '#e2e8f0' }}></td>
                <td style={{ ...tdStyleRight, width: '10%', fontWeight: 800, fontSize: '14px', backgroundColor: '#e2e8f0' }}>{formatMoney(summary.val)}</td>
                <td style={{ ...tdStyleRight, width: '10%', fontWeight: 800, fontSize: '14px', backgroundColor: '#e2e8f0' }}>{formatMoney(summary.igst)}</td>
                <td style={{ ...tdStyleRight, width: '10%', fontWeight: 800, fontSize: '14px', backgroundColor: '#e2e8f0' }}>{formatMoney(summary.cgst)}</td>
                <td style={{ ...tdStyleRight, width: '10%', fontWeight: 800, fontSize: '14px', backgroundColor: '#e2e8f0' }}>{formatMoney(summary.sgst)}</td>
                <td style={{ ...tdStyleRight, width: '10%', fontWeight: 800, fontSize: '14px', backgroundColor: '#e2e8f0' }}>{formatMoney(summary.cess)}</td>
              </tr>
            </tbody>
          </table>

          {/* Verification */}
          <Box mt={4} pt={4} borderTop="1px solid #cbd5e1">
            <Typography variant="h6" fontWeight={800} color="#0f172a" mb={2}>Verification:</Typography>
            <Typography variant="body2" color="#334155" mb={4} sx={{ lineHeight: 1.6 }}>
              I hereby solemnly affirm and declare that the information given herein above is true and correct to the best of my knowledge and belief and nothing has been concealed therefrom and in case of any reduction in output tax liability the benefit thereof has been/will be passed on to the recipient of supply.
            </Typography>

            <Box display="flex" justifyContent="space-between" mt={4}>
              <Box>
                <Typography variant="body2" fontWeight={700} color="#64748b">Date</Typography>
                <Typography variant="body2" fontWeight={700} mt={1} color="#64748b">Signature</Typography>
              </Box>
              <Box textAlign="right">
                <Typography variant="body2" fontWeight={700} color="#64748b" textTransform="uppercase" fontSize="10px">Name of Authorized Signatory</Typography>
                <Typography variant="subtitle1" fontWeight={800} color="#0f172a" mb={1}>DIPALI NAYEK</Typography>

                <Typography variant="body2" fontWeight={700} color="#64748b" textTransform="uppercase" fontSize="10px">Designation/Status</Typography>
                <Typography variant="subtitle2" fontWeight={800} color="#0f172a">PARTNER</Typography>
              </Box>
            </Box>
          </Box>

        </Box>
      </Box>

      <Snackbar
        open={notification.open}
        autoHideDuration={4000}
        onClose={() => setNotification(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={notification.type} variant="filled" sx={{ width: '100%', fontWeight: 600 }}>
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
