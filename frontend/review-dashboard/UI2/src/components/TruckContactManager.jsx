import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, Box, Typography, TextField,
  Button, IconButton, CircularProgress, Snackbar, Alert,
  Tabs, Tab, Divider, Backdrop, MenuItem, Chip, Autocomplete,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import ListAltIcon from '@mui/icons-material/ListAlt';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import PersonIcon from '@mui/icons-material/Person';
import BadgeIcon from '@mui/icons-material/Badge';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import PhoneIcon from '@mui/icons-material/Phone';
import HomeIcon from '@mui/icons-material/Home';
import ArticleIcon from '@mui/icons-material/Article';
import ReceiptIcon from '@mui/icons-material/Receipt';
import EventIcon from '@mui/icons-material/Event';
import axios from 'axios';
import { API_URL } from '../config';

function TabPanel({ value, index, children }) {
  return value === index ? <Box>{children}</Box> : null;
}

// Section label like VoucherDialog
function SectionLabel({ icon: Icon, label }) {
  return (
    <Box display="flex" alignItems="center" gap={1} mb={2} mt={1}>
      <Box sx={{ p: 0.75, bgcolor: '#f3e5f5', borderRadius: '8px', display: 'flex', alignItems: 'center' }}>
        <Icon sx={{ fontSize: 16, color: '#7b1fa2' }} />
      </Box>
      <Typography variant="caption" fontWeight={800} color="#7b1fa2" sx={{ letterSpacing: 1, textTransform: 'uppercase' }}>
        {label}
      </Typography>
      <Box flex={1} sx={{ height: '1px', bgcolor: 'rgba(123,31,162,0.12)', ml: 1 }} />
    </Box>
  );
}

// Styled field wrapper exactly like voucher form
function FieldBox({ children }) {
  return <Box sx={{ mb: 2 }}>{children}</Box>;
}

const inputSx = { borderRadius: '14px' };

// These MUST exactly match the column names already in MongoDB (including trailing spaces)
// DO NOT change these strings — they are the real column names in the "Truck Contact Number" collection
const DB_KEYS = {
  truckNo:           'Truck No ',
  vehType:           'Type of vehicle ',
  custType:          'TYPE OF CUSTOMER ',
  ownerName:         'Owner Name ',
  panNo:             'PAN No. ',
  aadharNo:          'Aadhar No. ',
  panAadharLink:     'PAN Addahar Link ',
  contactNo:         'Contact No. ',
  address:           'Adress ',
  nilTds:            'NIL TDS Declaration ',
  tdsApp:            'TDS Applicability ',
  basicFreight:      'Basic Freight Comission Applicability ',
  incentiveComm:     'Incentive Comission Appliciability ',
  gstType:           'GST TYPE ',
  gstNo:             'GST NO ',
  gstPercent:        'GST % ',
  rcValidity:        'RC Validity ',
  insuranceValidity: 'Insurance Validity ',
  fitnessValidity:   'Fitness Validity ',
  roadTaxValidity:   'Road Tax Validity ',
  permit:            'Permit ',
  puc:               'PUC ',
  npValidity:        'NP Validity ',
  driverName:        'Driver Name ',
  licenseNo:         'License No ',
  licenseValidity:   'License Validity ',
};

const getStr = (...candidates) => {
  for (const v of candidates) {
    if (v !== undefined && v !== null && String(v).trim()) return String(v).trim();
  }
  return '';
};

export default function TruckContactManager({ open, onClose }) {
  const [tab, setTab] = useState(0);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState(null);
  const [form, setForm] = useState({});
  const [errors, setErrors] = useState({});
  const [editId, setEditId] = useState(null);

  useEffect(() => {
    if (open) {
      setTab(0);
      setForm({});
      setErrors({});
      setEditId(null);
      fetchContacts();
    }
  }, [open]);

  const fetchContacts = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/truck-contacts`);
      if (res.data.success) setContacts(res.data.contacts);
    } catch {
      setSnack({ type: 'error', message: 'Failed to load contacts.' });
    } finally {
      setLoading(false);
    }
  };

  const uniqueOwners = Array.from(new Set(
    contacts.map(c => getStr(c["Owner Name "], c["Owner Name"], c.owner_name)).filter(Boolean)
  ));

  const handleOwnerSelect = (_, newValue) => {
    handleChange('ownerName', newValue || '');
    if (newValue) {
      const match = contacts.find(c =>
        getStr(c["Owner Name "], c["Owner Name"], c.owner_name) === newValue
      );
      if (match) {
        // Auto-populate owner-level fields — read from legacy DB keys first
        setForm(prev => ({
          ...prev,
          ownerName:     newValue,
          panNo:         prev.panNo         || getStr(match["PAN No. "],         match["PAN No."],   match.pan_no),
          aadharNo:      prev.aadharNo      || getStr(match["Aadhar No. "],      match["Aadhar No."], match.aadhar_no),
          contactNo:     prev.contactNo     || getStr(match["Contact No. "],     match["Contact No."], match.contact_no),
          address:       prev.address       || getStr(match["Adress "],          match["Address"],    match.address),
          custType:      prev.custType      || getStr(match["TYPE OF CUSTOMER "], match.type),
          panAadharLink: prev.panAadharLink || getStr(match["PAN Addahar Link "], match.pan_aadhar_link),
        }));
      }
    }
  };

  const handleSave = async () => {
    const errs = {};
    if (!form.truckNo?.trim()) errs.truckNo = 'Truck Number is required';
    if (!form.ownerName?.trim()) errs.ownerName = 'Owner Name is required';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    try {
      // Build payload using EXACT legacy column names already in MongoDB
      // These string keys must stay exactly as-is (including trailing spaces)
      const payload = {};
      const formToKey = {
        truckNo:           form.truckNo,
        vehType:           form.vehType,
        custType:          form.custType,
        ownerName:         form.ownerName,
        panNo:             form.panNo,
        aadharNo:          form.aadharNo,
        panAadharLink:     form.panAadharLink,
        contactNo:         form.contactNo,
        address:           form.address,
        nilTds:            form.nilTds,
        tdsApp:            form.tdsApp,
        basicFreight:      form.basicFreight,
        incentiveComm:     form.incentiveComm,
        gstType:           form.gstType,
        gstNo:             form.gstNo,
        gstPercent:        form.gstPercent,
        rcValidity:        form.rcValidity,
        insuranceValidity: form.insuranceValidity,
        fitnessValidity:   form.fitnessValidity,
        roadTaxValidity:   form.roadTaxValidity,
        permit:            form.permit,
        puc:               form.puc,
        npValidity:        form.npValidity,
        driverName:        form.driverName,
        licenseNo:         form.licenseNo,
        licenseValidity:   form.licenseValidity,
      };

      Object.entries(formToKey).forEach(([k, v]) => {
        const dbKey = DB_KEYS[k];
        if (dbKey && v !== undefined && v !== null) {
          const val = String(v).trim();
          if (val !== '' || !editId) payload[dbKey] = val;
        }
      });

      if (editId) {
        const res = await axios.put(`${API_URL}/truck-contacts/${editId}`, payload);
        if (res.data.success) setSnack({ type: 'success', message: 'Profile updated!' });
      } else {
        const res = await axios.post(`${API_URL}/truck-contacts`, payload);
        if (res.data.success) setSnack({ type: 'success', message: 'Profile saved!' });
      }

      setForm({});
      setEditId(null);
      fetchContacts();
      setTab(1);
    } catch {
      setSnack({ type: 'error', message: 'Failed to save.' });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (c) => {
    // Read from legacy DB column names first (that's where real data lives)
    setForm({
      truckNo:           getStr(c["Truck No "],                           c["Truck No"],        c.truck_no),
      ownerName:         getStr(c["Owner Name "],                         c["Owner Name"],      c.owner_name),
      driverName:        getStr(c["Driver Name "],                        c["Driver Name"],     c.driver_name),
      contactNo:         getStr(c["Contact No. "],                        c["Contact No."],     c.contact_no),
      address:           getStr(c["Adress "],                             c["Address"],         c.address),
      panNo:             getStr(c["PAN No. "],                            c["PAN No."],         c.pan_no),
      aadharNo:          getStr(c["Aadhar No. "],                         c["Aadhar No."],      c.aadhar_no),
      panAadharLink:     getStr(c["PAN Addahar Link "],                   c.pan_aadhar_link),
      vehType:           getStr(c["Type of vehicle "],                    c.type),
      custType:          getStr(c["TYPE OF CUSTOMER "],                   c.type),
      nilTds:            getStr(c["NIL TDS Declaration "],                c.nil_tds_declaration),
      tdsApp:            getStr(c["TDS Applicability "],                  c.tds_applicability),
      basicFreight:      getStr(c["Basic Freight Comission Applicability "], c.incentive_commission_applicability),
      incentiveComm:     getStr(c["Incentive Comission Appliciability "], c.incentive_commission_applicability),
      gstType:           getStr(c["GST TYPE "],                           c.gst_type),
      gstNo:             getStr(c["GST NO "],                             c.gst_no),
      gstPercent:        getStr(c["GST % "],                              c.gst_percent),
      rcValidity:        getStr(c["RC Validity "],                        c.rc_validity),
      insuranceValidity: getStr(c["Insurance Validity "],                 c.insurance_validity),
      fitnessValidity:   getStr(c["Fitness Validity "],                   c.fitness_validity),
      roadTaxValidity:   getStr(c["Road Tax Validity "],                  c.road_tax_validity),
      puc:               getStr(c["PUC "],                                c.puc),
      npValidity:        getStr(c["NP Validity "],                        c.np_validity),
      permit:            getStr(c["Permit "],                             c.permit),
      licenseNo:         getStr(c["License No "],                         c.license_no),
      licenseValidity:   getStr(c["License Validity "],                   c.license_validity),
    });
    setEditId(c._id);
    setTab(0);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this contact permanently?')) return;
    setSaving(true);
    try {
      const res = await axios.delete(`${API_URL}/truck-contacts/${id}`);
      if (res.data.success) {
        setSnack({ type: 'success', message: 'Contact removed.' });
        fetchContacts();
      }
    } catch {
      setSnack({ type: 'error', message: 'Failed to delete.' });
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field, val) => {
    setForm(p => ({ ...p, [field]: val }));
    if (errors[field]) setErrors(p => ({ ...p, [field]: null }));
  };

  const tf = (label, field, extra = {}) => (
    <TextField
      fullWidth
      label={label}
      value={form[field] || ''}
      onChange={e => handleChange(field, e.target.value)}
      error={!!errors[field]}
      helperText={errors[field]}
      InputProps={{ sx: inputSx }}
      {...extra}
    />
  );

  const selectTf = (label, field, options) => (
    <TextField
      fullWidth
      select
      label={label}
      value={form[field] || ''}
      onChange={e => handleChange(field, e.target.value)}
      InputProps={{ sx: inputSx }}
    >
      {options.map(o => <MenuItem key={o} value={o}>{o}</MenuItem>)}
    </TextField>
  );

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '24px',
            overflow: 'hidden',
            background: '#ffffff',
            maxHeight: '92vh',
          }
        }}
      >
        {/* ── Header — matches VoucherDialog purple gradient ── */}
        <DialogTitle sx={{ p: 0 }}>
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 2,
            px: 3, py: 2,
            background: 'linear-gradient(135deg, #4a148c 0%, #7b1fa2 50%, #9c27b0 100%)',
            color: '#fff',
          }}>
            <Box sx={{ width: 40, height: 40, borderRadius: '10px', bgcolor: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <LocalShippingIcon />
            </Box>
            <Box flex={1}>
              <Typography variant="h6" fontWeight={900}>Truck & Driver Manager</Typography>
              <Typography variant="caption" sx={{ opacity: 0.75 }}>DIPALI ASSOCIATES & CO.</Typography>
            </Box>
            <IconButton onClick={onClose} sx={{ color: '#fff' }}><CloseIcon /></IconButton>
          </Box>

          {/* ── Tabs — matches VoucherDialog #faf5ff style ── */}
          <Box sx={{ bgcolor: '#faf5ff', borderBottom: '1px solid #ede7f6' }}>
            <Tabs
              value={tab}
              onChange={(_, v) => {
                setTab(v);
                if (v === 0 && !editId) setForm({});
              }}
              sx={{
                px: 2,
                '& .MuiTab-root': { fontWeight: 800, fontSize: '13px', minHeight: 48, textTransform: 'none' },
                '& .Mui-selected': { color: '#7b1fa2 !important' },
                '& .MuiTabs-indicator': { backgroundColor: '#7b1fa2' },
              }}
            >
              <Tab icon={<AddCircleOutlineIcon sx={{ fontSize: 18 }} />} iconPosition="start"
                label={editId ? 'Edit Contact' : 'Add New Contact'} />
              <Tab icon={<ListAltIcon sx={{ fontSize: 18 }} />} iconPosition="start"
                label={`Existing Contacts (${contacts.length})`} />
            </Tabs>
          </Box>
        </DialogTitle>

        <DialogContent sx={{ p: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ flex: 1, overflowY: 'auto' }}>

            {/* ── TAB 0: ADD / EDIT FORM ── */}
            <TabPanel value={tab} index={0}>
              <Box sx={{ p: { xs: 2.5, sm: 3.5 } }}>

                {/* Title row */}
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                  <Box>
                    <Typography variant="h6" fontWeight={900} color="#4a148c">
                      {editId ? 'Modify Profile' : 'Register New Profile'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {editId ? 'Edit and save changes below' : 'Fill in the details for the new truck owner / driver'}
                    </Typography>
                  </Box>
                  {editId && (
                    <Button size="small" variant="outlined"
                      sx={{ borderRadius: '10px', borderColor: '#7b1fa2', color: '#7b1fa2', fontWeight: 700 }}
                      onClick={() => { setEditId(null); setForm({}); }}>
                      Cancel Edit
                    </Button>
                  )}
                </Box>

                {/* ─── PRIMARY IDENTIFIERS ─── */}
                <SectionLabel icon={PersonIcon} label="Primary Identifiers" />

                <FieldBox>
                  {tf('Truck Number *', 'truckNo')}
                </FieldBox>

                <FieldBox>
                  <Autocomplete
                    freeSolo
                    options={uniqueOwners}
                    value={form.ownerName || ''}
                    onChange={handleOwnerSelect}
                    onInputChange={(_, v) => handleChange('ownerName', v)}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Owner Name *"
                        error={!!errors.ownerName}
                        helperText={errors.ownerName || (uniqueOwners.length > 0 ? `${uniqueOwners.length} existing owners — or type a new name` : 'Type a new owner name')}
                        InputProps={{
                          ...params.InputProps,
                          sx: inputSx,
                          startAdornment: <PersonIcon sx={{ color: '#7b1fa2', mr: 0.5, fontSize: 20 }} />,
                        }}
                      />
                    )}
                    renderOption={(props, option) => (
                      <li {...props} key={option}>
                        <Box>
                          <Typography variant="body2" fontWeight={700}>{option}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {contacts.filter(c => getStr(c.owner_name, c["Owner Name"], c["Owner Name "]) === option).length} truck(s)
                          </Typography>
                        </Box>
                      </li>
                    )}
                  />
                </FieldBox>

                <FieldBox>
                  <TextField
                    fullWidth label="Driver Name"
                    value={form.driverName || ''}
                    onChange={e => handleChange('driverName', e.target.value)}
                    InputProps={{
                      sx: inputSx,
                      startAdornment: <BadgeIcon sx={{ color: '#7b1fa2', mr: 0.5, fontSize: 20 }} />,
                    }}
                  />
                </FieldBox>

                <FieldBox>
                  <TextField
                    fullWidth label="Contact No."
                    value={form.contactNo || ''}
                    onChange={e => handleChange('contactNo', e.target.value)}
                    InputProps={{
                      sx: inputSx,
                      startAdornment: <PhoneIcon sx={{ color: '#7b1fa2', mr: 0.5, fontSize: 20 }} />,
                    }}
                  />
                </FieldBox>

                <FieldBox>
                  <TextField
                    fullWidth label="Address"
                    value={form.address || ''}
                    onChange={e => handleChange('address', e.target.value)}
                    InputProps={{
                      sx: inputSx,
                      startAdornment: <HomeIcon sx={{ color: '#7b1fa2', mr: 0.5, fontSize: 20 }} />,
                    }}
                  />
                </FieldBox>

                {/* ─── VEHICLE DETAILS ─── */}
                <SectionLabel icon={DirectionsCarIcon} label="Vehicle Details" />

                <FieldBox>{tf('Type of Vehicle', 'vehType')}</FieldBox>
                <FieldBox>{tf('Customer Type', 'custType')}</FieldBox>

                {/* ─── DOCUMENTS & TAX ─── */}
                <SectionLabel icon={ArticleIcon} label="Documents & Tax" />

                <FieldBox>{tf('PAN No.', 'panNo')}</FieldBox>
                <FieldBox>{tf('Aadhar No.', 'aadharNo')}</FieldBox>
                <FieldBox>{selectTf('PAN / Aadhar Linked', 'panAadharLink', ['Yes', 'No'])}</FieldBox>
                <FieldBox>{selectTf('NIL TDS Declaration', 'nilTds', ['Yes', 'No'])}</FieldBox>
                <FieldBox>{tf('TDS Applicability', 'tdsApp')}</FieldBox>
                <FieldBox>{tf('Basic Freight Commission Applicability', 'basicFreight')}</FieldBox>
                <FieldBox>{tf('Incentive Commission Applicability', 'incentiveComm')}</FieldBox>

                {/* ─── GST ─── */}
                <SectionLabel icon={ReceiptIcon} label="GST Information" />

                <FieldBox>{tf('GST Type', 'gstType')}</FieldBox>
                <FieldBox>{tf('GST No', 'gstNo')}</FieldBox>
                <FieldBox>{tf('GST %', 'gstPercent')}</FieldBox>

                {/* ─── VALIDITY DATES ─── */}
                <SectionLabel icon={EventIcon} label="Validity Dates" />

                <FieldBox>{tf('RC Validity', 'rcValidity')}</FieldBox>
                <FieldBox>{tf('Insurance Validity', 'insuranceValidity')}</FieldBox>
                <FieldBox>{tf('Fitness Validity', 'fitnessValidity')}</FieldBox>
                <FieldBox>{tf('Road Tax Validity', 'roadTaxValidity')}</FieldBox>
                <FieldBox>{tf('PUC Validity', 'puc')}</FieldBox>
                <FieldBox>{tf('NP Validity', 'npValidity')}</FieldBox>
                <FieldBox>{tf('Permit Details', 'permit')}</FieldBox>

                {/* ── Save Button — matches VoucherDialog purple gradient ── */}
                <Button
                  fullWidth variant="contained" size="large" onClick={handleSave}
                  disabled={saving}
                  sx={{
                    mt: 3.5, py: 1.8, borderRadius: '16px', fontWeight: 900, fontSize: '1rem',
                    background: 'linear-gradient(45deg, #4a148c, #7b1fa2)',
                    boxShadow: '0 10px 30px rgba(123,31,162,0.3)',
                    '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 14px 36px rgba(123,31,162,0.4)' },
                    transition: 'all 0.2s',
                  }}
                >
                  {saving ? <CircularProgress size={22} color="inherit" /> : (editId ? 'Save Changes' : 'Save Truck & Driver Profile')}
                </Button>
              </Box>
            </TabPanel>

            {/* ── TAB 1: EXISTING CONTACTS ── */}
            <TabPanel value={tab} index={1}>
              <Box sx={{ p: 2 }}>
                {loading ? (
                  <Box display="flex" justifyContent="center" py={6}>
                    <CircularProgress sx={{ color: '#7b1fa2' }} />
                  </Box>
                ) : contacts.length === 0 ? (
                  <Box sx={{ textAlign: 'center', py: 8, opacity: 0.5 }}>
                    <LocalShippingIcon sx={{ fontSize: 48, color: '#7b1fa2', mb: 1 }} />
                    <Typography color="text.secondary">No contacts found</Typography>
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    {contacts.map((c) => {
                      // Read legacy DB keys first — that's where existing data lives in MongoDB
                      const tNo =   getStr(c["Truck No "],    c["Truck No"],   c.truck_no)  || 'No Truck No.';
                      const oName = getStr(c["Owner Name "],  c["Owner Name"], c.owner_name) || 'Unknown Owner';
                      const dName = getStr(c["Driver Name "], c["Driver Name"], c.driver_name);
                      const phone = getStr(c["Contact No. "], c["Contact No."], c.contact_no);
                      const pan =   getStr(c["PAN No. "],     c["PAN No."],    c.pan_no);

                      return (
                        <Box
                          key={c._id}
                          sx={{
                            p: 2, borderRadius: '14px',
                            border: '1px solid #ede7f6',
                            bgcolor: '#faf5ff',
                            '&:hover': { bgcolor: '#f3e5f5', borderColor: 'rgba(123,31,162,0.25)' },
                            transition: 'all 0.2s',
                          }}
                        >
                          <Box display="flex" alignItems="flex-start" gap={2}>
                            {/* Icon */}
                            <Box sx={{ p: 1, bgcolor: 'rgba(123,31,162,0.1)', borderRadius: '10px', flexShrink: 0, mt: 0.3 }}>
                              <LocalShippingIcon sx={{ fontSize: 20, color: '#7b1fa2' }} />
                            </Box>

                            {/* Details */}
                            <Box flex={1} minWidth={0}>
                              <Box display="flex" alignItems="center" gap={1} flexWrap="wrap" mb={0.5}>
                                <Typography fontWeight={900} color="#4a148c" sx={{ fontFamily: 'monospace', fontSize: '15px' }}>
                                  {tNo}
                                </Typography>
                                <Chip
                                  label={oName}
                                  size="small"
                                  sx={{ bgcolor: '#f3e5f5', color: '#7b1fa2', fontWeight: 700, fontSize: '12px' }}
                                />
                              </Box>
                              <Box display="flex" flexWrap="wrap" gap={1.5}>
                                {dName && (
                                  <Box display="flex" alignItems="center" gap={0.4}>
                                    <BadgeIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
                                    <Typography variant="caption" color="text.secondary">{dName}</Typography>
                                  </Box>
                                )}
                                {phone && (
                                  <Box display="flex" alignItems="center" gap={0.4}>
                                    <PhoneIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
                                    <Typography variant="caption" color="text.secondary">{phone}</Typography>
                                  </Box>
                                )}
                                {pan && (
                                  <Box display="flex" alignItems="center" gap={0.4}>
                                    <ArticleIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
                                    <Typography variant="caption" color="text.secondary">PAN: {pan}</Typography>
                                  </Box>
                                )}
                              </Box>
                            </Box>

                            {/* Actions */}
                            <Box display="flex" gap={0.5} flexShrink={0}>
                              <IconButton
                                size="small"
                                onClick={() => handleEdit(c)}
                                sx={{
                                  color: '#7b1fa2',
                                  bgcolor: 'rgba(123,31,162,0.08)',
                                  borderRadius: '8px',
                                  '&:hover': { bgcolor: 'rgba(123,31,162,0.18)' },
                                }}
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                              <IconButton
                                size="small"
                                onClick={() => handleDelete(c._id)}
                                sx={{
                                  color: '#d32f2f',
                                  bgcolor: 'rgba(211,47,47,0.06)',
                                  borderRadius: '8px',
                                  '&:hover': { bgcolor: 'rgba(211,47,47,0.16)' },
                                }}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Box>
                          </Box>
                        </Box>
                      );
                    })}
                  </Box>
                )}
              </Box>
            </TabPanel>

          </Box>
        </DialogContent>
      </Dialog>

      <Backdrop open={saving} sx={{ color: '#fff', zIndex: 9999 }}>
        <CircularProgress color="inherit" />
      </Backdrop>

      <Snackbar open={!!snack} autoHideDuration={4000} onClose={() => setSnack(null)}>
        <Alert severity={snack?.type || 'info'} variant="filled" sx={{ borderRadius: '12px', fontWeight: 700 }}>
          {snack?.message}
        </Alert>
      </Snackbar>
    </>
  );
}
