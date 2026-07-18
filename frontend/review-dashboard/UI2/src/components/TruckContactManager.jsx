import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, Box, Typography, TextField,
  Button, IconButton, CircularProgress, Snackbar, Alert,
  Tabs, Tab, Divider, Backdrop, MenuItem, Chip, Autocomplete,
  useTheme, useMediaQuery, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper
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
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import DescriptionIcon from '@mui/icons-material/Description';
import CurrencyRupeeIcon from '@mui/icons-material/CurrencyRupee';
import axios from 'axios';
import { API_URL } from '../config';

function TabPanel({ value, index, children }) {
  return value === index ? <Box>{children}</Box> : null;
}

// Section label like VoucherDialog
function SectionLabel({ icon: Icon, label }) {
  return (
    <Box display="flex" alignItems="center" gap={1} mb={2} mt={1}>
      <Box sx={{ p: 0.75, bgcolor: '#f1f5f9', borderRadius: '8px', display: 'flex', alignItems: 'center' }}>
        <Icon sx={{ fontSize: 16, color: '#475569' }} />
      </Box>
      <Typography variant="caption" fontWeight={800} color="#475569" sx={{ letterSpacing: 1, textTransform: 'uppercase' }}>
        {label}
      </Typography>
      <Box flex={1} sx={{ height: '1px', bgcolor: '#e2e8f0', ml: 1 }} />
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
  truckNo: 'Truck No ',
  vehType: 'Type of vehicle ',
  custType: 'TYPE OF CUSTOMER ',
  ownerName: 'Owner Name ',
  panNo: 'PAN No. ',
  aadharNo: 'Aadhar No. ',
  panAadharLink: 'PAN Addahar Link ',
  contactNo: 'Contact No. ',
  address: 'Adress ',
  nilTds: 'NIL TDS Declaration ',
  tdsApp: 'TDS Applicability ',
  basicFreight: 'Basic Freight Comission Applicability ',
  incentiveComm: 'Incentive Comission Appliciability ',
  gstType: 'GST TYPE ',
  gstNo: 'GST NO ',
  gstPercent: 'GST % ',
  rcValidity: 'RC Validity ',
  insuranceValidity: 'Insurance Validity ',
  fitnessValidity: 'Fitness Validity ',
  roadTaxValidity: 'Road Tax Validity ',
  permit: 'Permit ',
  puc: 'PUC ',
  npValidity: 'NP Validity ',
  driverName: 'Driver Name ',
  licenseValidity: 'License Validity ',
  ownerBankAcc: 'Owner Bank Account No ',
  ownerIfsc: 'Owner IFSC Code ',
  driverContactNo: 'Driver Contact No ',
  driverPanNo: 'Driver PAN No ',
  driverAadharNo: 'Driver Aadhar No ',
  driverAddress: 'Driver Address ',
  driverBankAcc: 'Driver Bank Account No ',
  driverIfsc: 'Driver IFSC Code ',
  driverPanAadharLink: 'Driver PAN Aadhar Link ',
  basicFreightComm: 'basic_freight_commission',
  incentiveCommVal: 'incentive_commission',
  gstDocs: 'gst_documents',
  wheelType: 'wheel_type',
};

const getStr = (...candidates) => {
  for (const v of candidates) {
    if (v !== undefined && v !== null && String(v).trim()) return String(v).trim();
  }
  return '';
};

export default function TruckContactManager({ open, onClose }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [tab, setTab] = useState(0);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState(null);
  const [form, setForm] = useState({});
  const [errors, setErrors] = useState({});
  const [editId, setEditId] = useState(null);
  const [formTab, setFormTab] = useState(0); // Sub-tab within form (Owner, Driver, Vehicle)
  const [approvals, setApprovals] = useState([]);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const userRole = localStorage.getItem('role') || 'Site';
  const [docs, setDocs] = useState([
    { id: 'pan', label: 'PAN Card Copy', status: 'Pending' },
    { id: 'aadhar', label: 'Aadhar Card Copy', status: 'Pending' },
    { id: 'bank', label: 'Bank Passbook / Cheque', status: 'Pending' },
    { id: 'rc', label: 'RC (Registration Certificate)', status: 'Pending' },
    { id: 'dl', label: 'Driving License', status: 'Pending' },
    { id: 'insurance', label: 'Insurance Policy', status: 'Pending' },
    { id: 'puc', label: 'PUC Copy', status: 'Pending' },
    { id: 'fitness', label: 'Fitness Certificate', status: 'Pending' },
    { id: 'roadtax', label: 'Road Tax Copy', status: 'Pending' },
    { id: 'np', label: 'NP (National Permit) Copy', status: 'Pending' },
    { id: 'driverPan', label: 'Driver PAN Card Copy', status: 'Pending' },
    { id: 'driverAadhar', label: 'Driver Aadhar Copy', status: 'Pending' },
    { id: 'driverBank', label: 'Driver Bank Passbook / Cheque', status: 'Pending' },
  ]);

  useEffect(() => {
    if (open) {
      setTab(0);
      setFormTab(0);
      setForm({});
      setErrors({});
      setEditId(null);
      setDocs(prev => prev.map(d => ({ ...d, status: 'Pending', url: undefined, fileName: undefined })));
      fetchContacts();
      if (userRole === 'Head-office') fetchApprovals();
    }
  }, [open]);

  const fetchApprovals = async () => {
    setApprovalLoading(true);
    try {
      const res = await axios.get(`${API_URL}/truck-contacts/approvals`);
      if (res.data.success) setApprovals(res.data.requests);
    } catch {
      setSnack({ type: 'error', message: 'Failed to load approvals.' });
    } finally {
      setApprovalLoading(false);
    }
  };

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
          ownerName: newValue,
          panNo: prev.panNo || getStr(match["PAN No. "], match["PAN No."], match.pan_no),
          aadharNo: prev.aadharNo || getStr(match["Aadhar No. "], match["Aadhar No."], match.aadhar_no),
          contactNo: prev.contactNo || getStr(match["Contact No. "], match["Contact No."], match.contact_no),
          address: prev.address || getStr(match["Adress "], match["Address"], match.address),
          custType: prev.custType || getStr(match["TYPE OF CUSTOMER "], match.type),
          panAadharLink: prev.panAadharLink || getStr(match["PAN Addahar Link "], match.pan_aadhar_link),
          ownerBankAcc: prev.ownerBankAcc || getStr(match["Owner Bank Account No "], match.owner_bank_acc),
          ownerIfsc: prev.ownerIfsc || getStr(match["Owner IFSC Code "], match.owner_ifsc),
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
        truckNo: form.truckNo,
        vehType: form.vehType,
        custType: form.custType,
        ownerName: form.ownerName,
        panNo: form.panNo,
        aadharNo: form.aadharNo,
        panAadharLink: form.panAadharLink,
        contactNo: form.contactNo,
        address: form.address,
        nilTds: form.nilTds,
        tdsApp: form.tdsApp,
        basicFreight: form.basicFreight,
        incentiveComm: form.incentiveComm,
        gstType: form.gstType,
        gstNo: form.gstNo,
        gstPercent: form.gstPercent,
        rcValidity: form.rcValidity,
        insuranceValidity: form.insuranceValidity,
        fitnessValidity: form.fitnessValidity,
        roadTaxValidity: form.roadTaxValidity,
        permit: form.permit,
        puc: form.puc,
        npValidity: form.npValidity,
        driverName: form.driverName,
        licenseNo: form.licenseNo,
        licenseValidity: form.licenseValidity,
        ownerBankAcc: form.ownerBankAcc,
        ownerIfsc: form.ownerIfsc,
        driverContactNo: form.driverContactNo,
        driverPanNo: form.driverPanNo,
        driverAadharNo: form.driverAadharNo,
        driverAddress: form.driverAddress,
        driverBankAcc: form.driverBankAcc,
        driverIfsc: form.driverIfsc,
        driverPanAadharLink: form.driverPanAadharLink,
        basicFreightComm: form.basicFreightComm,
        incentiveCommVal: form.incentiveCommVal,
        wheelType: form.wheelType,
        gstDocs: form.gstDocs,
      };

      docs.forEach(d => {
        if (d.url) {
          payload[`doc_url_${d.id}`] = d.url;
          if (d.fileName) payload[`doc_fileName_${d.id}`] = d.fileName;
        }
      });

      Object.entries(formToKey).forEach(([k, v]) => {
        const dbKey = DB_KEYS[k];
        if (dbKey && v !== undefined && v !== null) {
          if (Array.isArray(v)) {
            payload[dbKey] = v;
          } else {
            const val = String(v).trim();
            if (val !== '' || !editId) payload[dbKey] = val;
          }
        }
      });

      if (userRole !== 'Head-office') {
        // Site / SAS User: Submit Request
        await axios.post(`${API_URL}/truck-contacts/request`, payload);
        setSnack({ type: 'success', message: 'Registration request sent for Head Office approval!' });
      } else {
        // Head Office User: Save Directly
        if (editId) {
          const res = await axios.put(`${API_URL}/truck-contacts/${editId}`, payload);
          if (res.data.success) setSnack({ type: 'success', message: 'Profile updated!' });
        } else {
          const res = await axios.post(`${API_URL}/truck-contacts`, payload);
          if (res.data.success) setSnack({ type: 'success', message: 'Profile saved!' });
        }
      }

      setForm({});
      setEditId(null);
      fetchContacts();
      if (userRole === 'Head-office') fetchApprovals();
      setTab(userRole === 'Head-office' ? 3 : 0); // Open contacts for HO, or stay for Site
    } catch {
      setSnack({ type: 'error', message: 'Failed to save.' });
    } finally {
      setSaving(false);
    }
  };

  const handleProcessApproval = async (id, status) => {
    setSaving(true);
    try {
      await axios.put(`${API_URL}/truck-contacts/approvals/${id}`, {
        status,
        actionBy: localStorage.getItem('username') || 'Head Office'
      });
      setSnack({ type: 'success', message: `Request ${status} successfully!` });
      fetchApprovals();
      fetchContacts();
    } catch {
      setSnack({ type: 'error', message: 'Failed to process approval.' });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (c) => {
    // Read from legacy DB column names first (that's where real data lives)
    setForm({
      truckNo: getStr(c["Truck No "], c["Truck No"], c.truck_no),
      ownerName: getStr(c["Owner Name "], c["Owner Name"], c.owner_name),
      driverName: getStr(c["Driver Name "], c["Driver Name"], c.driver_name),
      contactNo: getStr(c["Contact No. "], c["Contact No."], c.contact_no),
      address: getStr(c["Adress "], c["Address"], c.address),
      panNo: getStr(c["PAN No. "], c["PAN No."], c.pan_no),
      aadharNo: getStr(c["Aadhar No. "], c["Aadhar No."], c.aadhar_no),
      panAadharLink: getStr(c["PAN Addahar Link "], c.pan_aadhar_link),
      vehType: getStr(c["Type of vehicle "], c.type),
      custType: getStr(c["TYPE OF CUSTOMER "], c.type),
      nilTds: getStr(c["NIL TDS Declaration "], c.nil_tds_declaration),
      tdsApp: getStr(c["TDS Applicability "], c.tds_applicability),
      basicFreight: getStr(c["Basic Freight Comission Applicability "], c.basic_freight_commission_applicability),
      incentiveComm: getStr(c["Incentive Comission Appliciability "], c.incentive_commission_applicability),
      gstType: getStr(c["GST TYPE "], c.gst_type),
      gstNo: getStr(c["GST NO "], c.gst_no),
      gstPercent: getStr(c["GST % "], c.gst_percent),
      rcValidity: getStr(c["RC Validity "], c.rc_validity),
      insuranceValidity: getStr(c["Insurance Validity "], c.insurance_validity),
      fitnessValidity: getStr(c["Fitness Validity "], c.fitness_validity),
      roadTaxValidity: getStr(c["Road Tax Validity "], c.road_tax_validity),
      puc: getStr(c["PUC "], c.puc),
      npValidity: getStr(c["NP Validity "], c.np_validity),
      permit: getStr(c["Permit "], c.permit),
      licenseNo: getStr(c["License No "], c.license_no),
      licenseValidity: getStr(c["License Validity "], c.license_validity),
      ownerBankAcc: getStr(c["Owner Bank Account No "], c.owner_bank_acc),
      ownerIfsc: getStr(c["Owner IFSC Code "], c.owner_ifsc),
      driverContactNo: getStr(c["Driver Contact No "], c.driver_contact_no),
      driverPanNo: getStr(c["Driver PAN No "], c.driver_pan_no),
      driverAadharNo: getStr(c["Driver Aadhar No "], c.driver_aadhar_no),
      driverAddress: getStr(c["Driver Address "], c.driver_address),
      driverBankAcc: getStr(c["Driver Bank Account No "], c.driver_bank_acc),
      driverIfsc: getStr(c["Driver IFSC Code "], c.driver_ifsc),
      driverPanAadharLink: getStr(c["Driver PAN Aadhar Link "], c.driver_pan_aadhar_link),
      basicFreightComm: getStr(c.basic_freight_commission, c["basic_freight_commission "]),
      incentiveCommVal: getStr(c.incentive_commission, c["incentive_commission "]),
      wheelType: getStr(c.wheel_type, c["Wheel Type "]),
      gstDocs: Array.isArray(c.gst_documents) ? c.gst_documents : [],
    });
    setEditId(c._id);
    setTab(0);
    setFormTab(0);
    
    setDocs(prevDocs => prevDocs.map(d => {
      const url = c[`doc_url_${d.id}`];
      const fileName = c[`doc_fileName_${d.id}`];
      if (url) {
        return { ...d, status: 'Uploaded', url, fileName };
      }
      return { ...d, status: 'Pending', url: undefined, fileName: undefined };
    }));
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
    // Auto-fetch logic for existing vehicles
    if (field === 'truckNo' && !editId) {
      const formattedVal = val.replace(/\s+/g, '').toLowerCase();
      // Only search if length is reasonable to prevent premature matching on short strings (though exact match handles this)
      if (formattedVal.length >= 4) {
        const existing = contacts.find(c => {
          const dbVal = getStr(c["Truck No "], c["Truck No"], c.truck_no) || '';
          return dbVal.replace(/\s+/g, '').toLowerCase() === formattedVal;
        });
        
        if (existing) {
          handleEdit(existing);
          setSnack({ type: 'success', message: 'Vehicle found! Details auto-filled from database.' });
          return;
        }
      }
    }

    setForm(p => {
      const updated = { ...p, [field]: val };
      if (field === 'nilTds' && val === 'Yes') {
        updated.tdsApp = '';
      }
      if (field === 'gstType' && val === 'URD (Unregistered)') {
        updated.gstNo = '';
        updated.gstPercent = '';
      }
      return updated;
    });
    if (errors[field]) setErrors(p => ({ ...p, [field]: null }));
  };

  const tf = (label, field, Icon = null, extra = {}) => (
    <FieldBox>
      <TextField
        fullWidth
        label={label}
        value={form[field] || ''}
        onChange={e => handleChange(field, e.target.value)}
        error={!!errors[field]}
        helperText={errors[field]}
        InputProps={{
          sx: inputSx,
          startAdornment: Icon ? (
            <Icon sx={{ color: '#64748b', mr: 1, fontSize: 18 }} />
          ) : null
        }}
        {...extra}
      />
    </FieldBox>
  );

  const selectTf = (label, field, options, Icon = null) => (
    <FieldBox>
      <TextField
        fullWidth
        select
        label={label}
        value={form[field] || ''}
        onChange={e => handleChange(field, e.target.value)}
        InputProps={{
          sx: inputSx,
          startAdornment: Icon ? (
            <Icon sx={{ color: '#64748b', mr: 1, fontSize: 18 }} />
          ) : null
        }}
      >
        {options.map(o => <MenuItem key={o} value={o}>{o}</MenuItem>)}
      </TextField>
    </FieldBox>
  );

  const uploadTf = (label, field, docId, Icon = null) => {
    const doc = docs.find(d => d.id === docId);
    return (
      <FieldBox>
        <TextField
          fullWidth
          label={label}
          value={form[field] || ''}
          onChange={e => handleChange(field, e.target.value)}
          error={!!errors[field]}
          helperText={errors[field]}
          InputProps={{
            sx: inputSx,
            startAdornment: Icon ? (
              <Icon sx={{ color: '#64748b', mr: 1, fontSize: 18 }} />
            ) : null,
            endAdornment: (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {doc?.status === 'Uploaded' && <CheckCircleIcon sx={{ color: '#16a34a', fontSize: 18 }} />}
                <Button
                  component="label"
                  size="small"
                  startIcon={<CloudUploadIcon sx={{ fontSize: 16 }} />}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 800,
                    fontSize: '11px',
                    color: doc?.status === 'Uploaded' ? '#16a34a' : '#1a73e8',
                    bgcolor: doc?.status === 'Uploaded' ? '#f0fdf4' : 'transparent',
                    '&:hover': { bgcolor: doc?.status === 'Uploaded' ? '#dcfce7' : '#f1f5f9' }
                  }}
                >
                  {doc?.status === 'Uploaded' ? 'Uploaded' : 'Upload PDF'}
                  <input
                    type="file"
                    hidden
                    accept="application/pdf"
                    onChange={(e) => {
                      if (e.target.files[0]) {
                        const newDocs = docs.map(d =>
                          d.id === docId ? { ...d, status: 'Uploaded', fileName: e.target.files[0].name } : d
                        );
                        setDocs(newDocs);
                        setSnack({ type: 'success', message: `${label} attached.` });
                      }
                    }}
                  />
                </Button>
              </Box>
            )
          }}
        />
      </FieldBox>
    );
  };

  const handleDocUpload = async (e, globalIdx) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('document', file);
    
    try {
      setSaving(true);
      const res = await axios.post(`${API_URL}/truck-contacts/upload-document`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (res.data.success) {
        const newDocs = [...docs];
        newDocs[globalIdx].status = 'Uploaded';
        newDocs[globalIdx].fileName = file.name;
        newDocs[globalIdx].url = res.data.url;
        setDocs(newDocs);
        setSnack({ type: 'success', message: 'Document uploaded successfully' });
      }
    } catch (err) {
      setSnack({ type: 'error', message: 'Failed to upload document.' });
    } finally {
      setSaving(false);
      e.target.value = null;
    }
  };

  const handleDocDelete = (globalIdx) => {
    const newDocs = [...docs];
    newDocs[globalIdx].status = 'Pending';
    newDocs[globalIdx].fileName = undefined;
    newDocs[globalIdx].url = undefined;
    setDocs(newDocs);
  };

  const TabDocVault = (allowedIds, label = "Mandatory Documents") => {
    const filteredDocs = docs.filter(d => allowedIds.includes(d.id));
    return (
      <Box sx={{ mt: 3, pt: 3, borderTop: '1px dashed #e2e8f0' }}>
        <SectionLabel icon={CloudUploadIcon} label={label} />
        <Box sx={{ border: '1px solid #e2e8f0', borderRadius: '16px', overflow: 'hidden' }}>
          {filteredDocs.map((doc, idx) => {
            const globalIdx = docs.findIndex(d => d.id === doc.id);
            return (
              <Box key={doc.id} sx={{
                display: 'flex', alignItems: 'center', gap: 2, p: 1.5,
                borderBottom: idx === filteredDocs.length - 1 ? 'none' : '1px solid #f1f5f9',
                bgcolor: doc.status === 'Uploaded' ? '#f0fdf4' : 'transparent'
              }}>
                <DescriptionIcon sx={{ color: doc.status === 'Uploaded' ? '#16a34a' : '#94a3b8', fontSize: 20 }} />
                <Typography flex={1} variant="body2" fontWeight={700} color={doc.status === 'Uploaded' ? '#166534' : '#475569'}>
                  {doc.fileName || doc.label}
                </Typography>
                <Chip
                  label={doc.status}
                  size="small"
                  icon={doc.status === 'Uploaded' ? <CheckCircleIcon /> : undefined}
                  sx={{
                    fontSize: '10px', height: 20, fontWeight: 800,
                    bgcolor: doc.status === 'Uploaded' ? '#dcfce7' : '#f1f5f9',
                    color: doc.status === 'Uploaded' ? '#166534' : '#64748b'
                  }}
                />
                
                {doc.url && (
                  <Button
                    size="small" variant="text"
                    onClick={() => window.open(doc.url, '_blank')}
                    sx={{ textTransform: 'none', fontWeight: 800, color: '#1976d2' }}
                  >
                    View
                  </Button>
                )}
                
                {doc.url && (
                  <Button
                    size="small" variant="text"
                    onClick={() => handleDocDelete(globalIdx)}
                    sx={{ textTransform: 'none', fontWeight: 800, color: '#d32f2f' }}
                  >
                    Delete
                  </Button>
                )}
                
                {!doc.url && (
                  <Button
                    component="label" size="small" variant="text"
                    sx={{ textTransform: 'none', fontWeight: 800, color: '#1a73e8' }}
                  >
                    Upload PDF
                    <input type="file" hidden accept="application/pdf,image/jpeg,image/png" onChange={(e) => handleDocUpload(e, globalIdx)} />
                  </Button>
                )}
              </Box>
            );
          })}
        </Box>
      </Box>
    );
  };

  const handleGstUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('document', file);
    
    try {
      setSaving(true);
      const res = await axios.post(`${API_URL}/truck-contacts/upload-document`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (res.data.success) {
        const newDoc = { name: file.name, url: res.data.url };
        handleChange('gstDocs', [...(form.gstDocs || []), newDoc]);
        setSnack({ type: 'success', message: 'GST Document uploaded successfully' });
      }
    } catch (err) {
      setSnack({ type: 'error', message: 'Failed to upload GST document.' });
    } finally {
      setSaving(false);
      e.target.value = null;
    }
  };

  const handleGstDelete = (idx) => {
    const newDocs = [...(form.gstDocs || [])];
    newDocs.splice(idx, 1);
    handleChange('gstDocs', newDocs);
  };

  const GstDocVault = () => {
    const currentGstDocs = form.gstDocs || [];
    return (
      <Box sx={{ mt: 3, pt: 3, borderTop: '1px dashed #e2e8f0' }}>
        <SectionLabel icon={CloudUploadIcon} label="GST Documents" />
        <Box sx={{ border: '1px solid #e2e8f0', borderRadius: '16px', overflow: 'hidden' }}>
          {currentGstDocs.length === 0 && (
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">No GST documents uploaded.</Typography>
            </Box>
          )}
          {currentGstDocs.map((doc, idx) => (
            <Box key={idx} sx={{
              display: 'flex', alignItems: 'center', gap: 2, p: 1.5,
              borderBottom: idx === currentGstDocs.length - 1 ? 'none' : '1px solid #f1f5f9',
              bgcolor: '#f0fdf4'
            }}>
              <DescriptionIcon sx={{ color: '#16a34a', fontSize: 20 }} />
              <Typography flex={1} variant="body2" fontWeight={700} color={'#166534'}>
                {doc.name || `GST Document ${idx + 1}`}
              </Typography>
              <Chip
                label="Uploaded"
                size="small"
                icon={<CheckCircleIcon />}
                sx={{
                  fontSize: '10px', height: 20, fontWeight: 800,
                  bgcolor: '#dcfce7',
                  color: '#166534'
                }}
              />
              <Button
                size="small" variant="text"
                onClick={() => window.open(doc.url, '_blank')}
                sx={{ textTransform: 'none', fontWeight: 800, color: '#1976d2' }}
              >
                View
              </Button>
              <Button
                size="small" variant="text"
                onClick={() => handleGstDelete(idx)}
                sx={{ textTransform: 'none', fontWeight: 800, color: '#d32f2f' }}
              >
                Delete
              </Button>
            </Box>
          ))}
          <Box sx={{ p: 1.5, borderTop: currentGstDocs.length > 0 ? '1px solid #f1f5f9' : 'none', bgcolor: '#fafafa', textAlign: 'center' }}>
            <Button
              component="label" size="small" variant="contained"
              sx={{ textTransform: 'none', fontWeight: 700, bgcolor: '#1a73e8', '&:hover': { bgcolor: '#0d47a1' } }}
            >
              Upload GST Document
              <input type="file" hidden accept="application/pdf,image/jpeg,image/png" onChange={handleGstUpload} />
            </Button>
          </Box>
        </Box>
      </Box>
    );
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        fullScreen={true}
        PaperProps={{
          sx: {
            background: '#f8fafc',
          }
        }}
      >
        {/* ── Header — matches Modern ERP style ── */}
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 2,
          px: 3, py: 2,
          bgcolor: '#fff',
          borderBottom: '1px solid #e2e8f0',
        }}>
          <Box sx={{ width: 40, height: 40, borderRadius: '10px', bgcolor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LocalShippingIcon sx={{ color: '#475569' }} />
          </Box>
          <Box flex={1}>
            <Typography variant="h6" fontWeight={800} color="#0f172a">Owner & Vehicle Directory</Typography>
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>DIPALI ASSOCIATES & CO.</Typography>
          </Box>
          <IconButton onClick={onClose} sx={{ color: '#64748b' }}><CloseIcon /></IconButton>
        </Box>

        {/* ── Tabs — matches Modern ERP style ── */}
        <Box sx={{ bgcolor: '#fff', borderBottom: '1px solid #e2e8f0', px: 3 }}>
          <Tabs
            value={tab}
            onChange={(_, v) => {
              setTab(v);
              if (v === 0 && !editId) setForm({});
            }}
            sx={{
              '& .MuiTab-root': { fontWeight: 700, fontSize: '13px', minHeight: 48, textTransform: 'none', color: '#64748b' },
              '& .Mui-selected': { color: '#0f172a !important' },
              '& .MuiTabs-indicator': { backgroundColor: '#0f172a' },
            }}
          >
            <Tab icon={<AddCircleOutlineIcon sx={{ fontSize: 18 }} />} iconPosition="start" label={editId ? 'Edit Contact' : 'Add New Contact'} />
            <Tab icon={<BadgeIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Temp Driver Assign" />
            <Tab icon={<ListAltIcon sx={{ fontSize: 18 }} />} iconPosition="start" label={`Existing Contacts (${contacts.length})`} />
            {userRole === 'Head-office' && (
              <Tab
                icon={<ReceiptIcon sx={{ fontSize: 18 }} />} iconPosition="start"
                label={`Approvals (${approvals.length})`}
                sx={{ color: approvals.length > 0 ? '#d32f2f !important' : 'inherit' }}
              />
            )}
          </Tabs>
        </Box>

        <DialogContent sx={{ p: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ flex: 1, overflowY: 'auto' }}>

            {/* ── TAB 0: ADD / EDIT FORM ── */}
            <TabPanel value={tab} index={0}>
              <Box sx={{ p: { xs: 2.5, sm: 3.5 } }}>

                {/* Title row */}
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                  <Box>
                    <Typography variant="h6" fontWeight={900} color="#0f172a">
                      {editId ? 'Modify Profile' : 'Register New Profile'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {editId ? 'Edit and save changes below' : 'Fill in the details for the new truck owner / driver'}
                    </Typography>
                  </Box>
                  {editId && (
                    <Button size="small" variant="outlined"
                      sx={{ borderRadius: '10px', borderColor: '#e2e8f0', color: '#475569', fontWeight: 700 }}
                      onClick={() => { setEditId(null); setForm({}); }}>
                      Cancel Edit
                    </Button>
                  )}
                </Box>

                {/* ─── FIXED PRIMARY HEADER ─── */}
                <Box sx={{ bgcolor: '#f8fafc', p: 2.5, borderRadius: '20px', mb: 3, border: '1px solid #e2e8f0', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1.2fr 1fr 1fr' }, gap: 3, alignItems: 'center' }}>
                    <Box>
                      <Typography variant="caption" fontWeight={900} color="#475569" sx={{ letterSpacing: 1, textTransform: 'uppercase', mb: 1, display: 'block' }}>
                        Vehicle Primary ID
                      </Typography>
                      {tf('Truck Number *', 'truckNo', LocalShippingIcon)}
                    </Box>
                    <Box>
                      <Typography variant="caption" fontWeight={900} color="#475569" sx={{ letterSpacing: 1, textTransform: 'uppercase', mb: 1, display: 'block' }}>
                        Wheel Type
                      </Typography>
                      <TextField
                        select
                        fullWidth
                        label="Wheel Type"
                        value={form.wheelType || ''}
                        onChange={(e) => handleChange('wheelType', e.target.value)}
                        variant="outlined"
                        InputProps={{
                          sx: inputSx,
                        }}
                      >
                        <MenuItem value=""><em>None</em></MenuItem>
                        <MenuItem value="6WH">6WH</MenuItem>
                        <MenuItem value="10WH">10WH</MenuItem>
                        <MenuItem value="12WH">12WH</MenuItem>
                        <MenuItem value="14WH">14WH</MenuItem>
                      </TextField>
                    </Box>
                    <Box>
                      <Typography variant="caption" fontWeight={900} color="#475569" sx={{ letterSpacing: 1, textTransform: 'uppercase', mb: 1, display: 'block' }}>
                        Relationship Type
                      </Typography>
                      {tf('ATOA / MKT / Site', 'custType', ArticleIcon)}
                    </Box>
                  </Box>
                </Box>

                {/* ─── NESTED FORM TABS ─── */}
                <Box sx={{ bgcolor: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
                  <Tabs
                    value={formTab}
                    onChange={(_, v) => setFormTab(v)}
                    variant="fullWidth"
                    sx={{
                      bgcolor: '#f8fafc',
                      '& .MuiTab-root': { fontWeight: 900, fontSize: '13px', py: 2, minHeight: 60, textTransform: 'none', color: '#64748b' },
                      '& .Mui-selected': { color: '#0f172a !important', bgcolor: '#fff' },
                      '& .MuiTabs-indicator': { backgroundColor: '#0f172a', height: 4, borderRadius: '4px 4px 0 0' }
                    }}
                  >
                    <Tab label="Truck Owner" icon={<PersonIcon sx={{ fontSize: 20 }} />} iconPosition="start" />
                    <Tab label="Truck Driver" icon={<BadgeIcon sx={{ fontSize: 20 }} />} iconPosition="start" />
                    <Tab label="Compliance & Validity" icon={<ArticleIcon sx={{ fontSize: 20 }} />} iconPosition="start" />
                  </Tabs>

                  <Box sx={{ p: 3 }}>
                    {/* Sub-Tab 0: OWNER */}
                    {formTab === 0 && (
                      <Box sx={{ animation: 'fadeIn 0.3s ease-in-out' }}>
                        <SectionLabel icon={PersonIcon} label="Full Owner Details" />
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
                                helperText={errors.ownerName || `${uniqueOwners.length} owners in database`}
                                InputProps={{
                                  ...params.InputProps,
                                  sx: inputSx,
                                  startAdornment: (
                                    <>
                                      <PersonIcon sx={{ color: '#64748b', mr: 1, fontSize: 18 }} />
                                      {params.InputProps.startAdornment}
                                    </>
                                  ),
                                }}
                              />
                            )}
                          />
                        </FieldBox>
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1.2fr 1fr' }, gap: 2 }}>
                          {tf('Owner Contact No.', 'contactNo', PhoneIcon)}
                          {tf('PAN Card No.', 'panNo', ArticleIcon)}
                        </Box>
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                          {tf('Aadhar Number', 'aadharNo', BadgeIcon)}
                          {selectTf('PAN-Aadhar Link Status', 'panAadharLink', ['Yes', 'No'], BadgeIcon)}
                        </Box>
                        {tf('Complete Correspondence Address', 'address', HomeIcon)}

                        <SectionLabel icon={ReceiptIcon} label="Owner Banking Details" />
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1.2fr 1fr' }, gap: 2 }}>
                          {tf('Bank Account No.', 'ownerBankAcc', ArticleIcon)}
                          {tf('IFSC Code', 'ownerIfsc', ArticleIcon)}
                        </Box>

                        <SectionLabel icon={CurrencyRupeeIcon} label="Financial & Commission Settings" />
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                          <Box>
                            {tf('Basic Freight Comm (%)', 'basicFreightComm', ReceiptIcon)}
                            {form.basicFreightComm && !isNaN(parseFloat(form.basicFreightComm)) && (
                              <Typography variant="caption" sx={{ color: '#16a34a', fontWeight: 800, ml: 1 }}>
                                {(() => {
                                  let val = parseFloat(form.basicFreightComm);
                                  if (val > 0 && val < 1) val = val * 100;
                                  return (100 - val).toFixed(1);
                                })()}% Payout to Owner
                              </Typography>
                            )}
                          </Box>
                          <Box>
                            {tf('Incentive Commission (%)', 'incentiveCommVal', ReceiptIcon)}
                            {form.incentiveCommVal && !isNaN(parseFloat(form.incentiveCommVal)) && (
                              <Typography variant="caption" sx={{ color: '#16a34a', fontWeight: 800, ml: 1 }}>
                                {(() => {
                                  let val = parseFloat(form.incentiveCommVal);
                                  if (val > 0 && val < 1) val = val * 100;
                                  return (100 - val).toFixed(1);
                                })()}% Payout to Owner
                              </Typography>
                            )}
                          </Box>
                        </Box>
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                          {selectTf('NIL TDS Option', 'nilTds', ['Yes', 'No'], ArticleIcon)}
                          {tf('TDS Category (%)', 'tdsApp', ReceiptIcon, { disabled: form.nilTds === 'Yes' })}
                        </Box>

                        <SectionLabel icon={ReceiptIcon} label="GST Information" />
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1.5fr 0.5fr' }, gap: 2 }}>
                          {selectTf('GST Type', 'gstType', ['URD (Unregistered)', 'RCM (Reverse Charge Mechanism)', 'FCM (Forward Charge Mechanism)'])}
                          {tf('GST No', 'gstNo', null, { disabled: form.gstType === 'URD (Unregistered)' })}
                          {tf('GST %', 'gstPercent', null, { disabled: form.gstType === 'URD (Unregistered)' })}
                        </Box>

                        {TabDocVault(['pan', 'aadhar', 'bank'], "Owner Identification Documents")}
                        {GstDocVault()}
                      </Box>
                    )}

                    {/* Sub-Tab 1: DRIVER */}
                    {formTab === 1 && (
                      <Box sx={{ animation: 'fadeIn 0.3s ease-in-out' }}>
                        <SectionLabel icon={BadgeIcon} label="Truck Driver Information" />
                        {tf('Full Driver Name', 'driverName', PersonIcon)}
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                          {tf('Driver Phone No.', 'driverContactNo', PhoneIcon)}
                          {tf('Driver Address', 'driverAddress', HomeIcon)}
                        </Box>
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                          {tf('License No (DL)', 'licenseNo', ArticleIcon)}
                          {tf('License Expiry Date', 'licenseValidity', EventIcon)}
                        </Box>
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                          {tf('Driver PAN No.', 'driverPanNo', ArticleIcon)}
                          {tf('Driver Aadhar No.', 'driverAadharNo', BadgeIcon)}
                        </Box>
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                          {selectTf('PAN-Aadhar Link Status', 'driverPanAadharLink', ['Yes', 'No'], BadgeIcon)}
                          {tf('Driver Bank Acc No.', 'driverBankAcc', ReceiptIcon)}
                        </Box>
                        {tf('Driver IFSC Code', 'driverIfsc', ReceiptIcon)}
                        {TabDocVault(['dl', 'driverPan', 'driverAadhar', 'driverBank'], "Driver Identification & Document Verification")}
                      </Box>
                    )}

                    {/* Sub-Tab 2: COMPLIANCE & VALIDITY */}
                    {formTab === 2 && (
                      <Box sx={{ animation: 'fadeIn 0.3s ease-in-out' }}>
                        <SectionLabel icon={EventIcon} label="Road Side Validities" />
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                          {tf('RC Validity', 'rcValidity', EventIcon)}
                          {tf('Insurance Validity', 'insuranceValidity', EventIcon)}
                          {tf('Fitness Validity', 'fitnessValidity', EventIcon)}
                          {tf('Road Tax Validity', 'roadTaxValidity', EventIcon)}
                          {tf('PUC Validity', 'puc', EventIcon)}
                          {tf('NP Validity', 'npValidity', EventIcon)}
                        </Box>
                        {tf('Permit Details & Serial', 'permit', ArticleIcon)}

                        <SectionLabel icon={ReceiptIcon} label="Financial Settings" />
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                          {selectTf('NIL TDS Option', 'nilTds', ['Yes', 'No'], ArticleIcon)}
                          {tf('TDS Category', 'tdsApp', ReceiptIcon)}
                        </Box>
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                          {tf('Basic Freight Comm Applicability', 'basicFreight', ReceiptIcon)}
                          {tf('Incentive Comm Applicability', 'incentiveComm', ReceiptIcon)}
                        </Box>
                        {tf('Specific Vehicle Detail', 'vehType', DirectionsCarIcon)}
                        {TabDocVault(['rc', 'insurance', 'fitness', 'roadtax', 'np'], "Legal Compliance Vault")}
                      </Box>
                    )}
                  </Box>
                </Box>


                {/* ── Save Button — matches VoucherDialog purple gradient ── */}
                <Button
                  fullWidth variant="contained" size="large" onClick={handleSave}
                  disabled={saving}
                  sx={{
                    mt: 3.5, py: 1.8, borderRadius: '16px', fontWeight: 900, fontSize: '1rem',
                    bgcolor: '#1a73e8',
                    boxShadow: '0 10px 30px rgba(26,115,232,0.2)',
                    '&:hover': { transform: 'translateY(-2px)', bgcolor: '#0d47a1', boxShadow: '0 14px 36px rgba(26,115,232,0.3)' },
                    transition: 'all 0.2s',
                  }}
                >
                  {saving ? <CircularProgress size={22} color="inherit" /> : (editId ? 'Save Changes' : 'Save Truck & Driver Profile')}
                </Button>
              </Box>
            </TabPanel>

            {/* ── TAB 1: TEMPORARY DRIVER ASSIGN ── */}
            <TabPanel value={tab} index={1}>
              <Box sx={{ p: { xs: 2.5, sm: 3.5 } }}>
                <Box mb={3} display="flex" justifyContent="space-between" alignItems="flex-start">
                  <Box>
                    <Typography variant="h6" fontWeight={900} color="#0f172a">Assign Temporary Driver</Typography>
                    <Typography variant="caption" color="text.secondary">Fast-track driver updates for trucks already in your database</Typography>
                  </Box>
                  <Chip label="Existing Fleet Only" color="primary" variant="outlined" sx={{ fontWeight: 800, fontSize: '10px' }} />
                </Box>

                <SectionLabel icon={LocalShippingIcon} label="Select Registered Vehicle" />
                <FieldBox>
                  <Autocomplete
                    options={contacts}
                    getOptionLabel={(c) => `${getStr(c["Truck No "], c["Truck No"], c.truck_no)} — ${getStr(c["Owner Name "], c["Owner Name"], c.owner_name)}`}
                    onChange={(_, c) => {
                      if (c) {
                        handleEdit(c);
                        setTab(1); // Stay in this tab
                      } else {
                        setForm({});
                      }
                    }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        placeholder="Type Truck No... (e.g. WB39...)"
                        label="Search Database *"
                        InputProps={{ ...params.InputProps, sx: inputSx, startAdornment: <LocalShippingIcon sx={{ color: '#64748b', mr: 1, fontSize: 18 }} /> }}
                      />
                    )}
                  />
                </FieldBox>

                {form.truckNo ? (
                  <Box sx={{ animation: 'fadeIn 0.3s' }}>
                    {/* Display Current Owner info (Read Only) */}
                    <Box sx={{ p: 2.5, bgcolor: '#f8fafc', borderRadius: '20px', mb: 3, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Box sx={{ width: 45, height: 45, bgcolor: '#fff', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e2e8f0' }}>
                        <PersonIcon sx={{ color: '#475569' }} />
                      </Box>
                      <Box flex={1}>
                        <Typography variant="caption" fontWeight={900} color="#1a73e8" sx={{ textTransform: 'uppercase', fontSize: '10px' }}>Owner Verified</Typography>
                        <Typography variant="body2" fontWeight={800} color="#0f172a">{form.ownerName}</Typography>
                        <Typography variant="caption" color="text.secondary">{form.contactNo || 'No contact found in DB'}</Typography>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="h6" fontWeight={900} color="#0f172a" sx={{ fontFamily: 'monospace' }}>{form.truckNo}</Typography>
                      </Box>
                    </Box>

                    <SectionLabel icon={BadgeIcon} label="New Temporary Driver Information" />
                    {tf('Driver Full Name *', 'driverName', PersonIcon)}
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                      {tf('License No (DL)', 'licenseNo', ArticleIcon)}
                      {tf('License Validity', 'licenseValidity', EventIcon)}
                    </Box>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                      {tf('Driver Phone', 'driverContactNo', PhoneIcon)}
                      {tf('Driver PAN', 'driverPanNo', ArticleIcon)}
                    </Box>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                      {tf('Driver Aadhar', 'driverAadharNo', BadgeIcon)}
                      {tf('Driver Address', 'driverAddress', HomeIcon)}
                    </Box>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                      {tf('Bank Account No.', 'driverBankAcc', ReceiptIcon)}
                      {tf('IFSC Code', 'driverIfsc', ReceiptIcon)}
                    </Box>

                    {/* Full Digital Document Vault for Temp Driver */}
                    <Box sx={{ mt: 2 }}>
                      <SectionLabel icon={CloudUploadIcon} label="Verification Vault" />
                      <Box sx={{ border: '1px solid #e2e8f0', borderRadius: '16px', overflow: 'hidden', bgcolor: '#fff' }}>
                        {docs.map((doc, idx) => (
                          <Box key={doc.id} sx={{
                            display: 'flex', alignItems: 'center', gap: 2, p: 1.5,
                            borderBottom: idx === docs.length - 1 ? 'none' : '1px solid #f1f5f9',
                            bgcolor: doc.status === 'Uploaded' ? '#f0fdf4' : 'transparent'
                          }}>
                            <DescriptionIcon sx={{ color: doc.status === 'Uploaded' ? '#16a34a' : '#94a3b8', fontSize: 18 }} />
                            <Typography flex={1} variant="caption" fontWeight={800} color={doc.status === 'Uploaded' ? '#166534' : '#475569'}>
                              {doc.label}
                            </Typography>
                            <Chip label={doc.status} size="small" sx={{ fontSize: '9px', height: 18, fontWeight: 800, bgcolor: doc.status === 'Uploaded' ? '#dcfce7' : '#f1f5f9' }} />
                            <Button component="label" size="small" variant="text" sx={{ textTransform: 'none', fontWeight: 800, color: '#1a73e8', fontSize: '11px' }}>
                              {doc.status === 'Uploaded' ? 'Change' : 'Upload'}
                              <input type="file" hidden accept="application/pdf" onChange={(e) => {
                                if (e.target.files[0]) {
                                  const newDocs = [...docs];
                                  newDocs[idx].status = 'Uploaded';
                                  setDocs(newDocs);
                                }
                              }} />
                            </Button>
                          </Box>
                        ))}
                      </Box>
                    </Box>

                    <Alert severity="info" sx={{ mt: 3, mb: 1, borderRadius: '12px', backgroundColor: '#f0f9ff', color: '#075985', border: '1px solid #bae6fd' }}>
                      <Typography variant="caption" fontWeight={700}>
                        Updating this will only change the Driver details. All owner and vehicle records remain protected.
                      </Typography>
                    </Alert>

                    <Button
                      fullWidth variant="contained" size="large" onClick={handleSave}
                      disabled={saving || !form.driverName}
                      sx={{
                        mt: 2, py: 1.8, borderRadius: '16px', fontWeight: 900, fontSize: '1rem',
                        bgcolor: '#1a73e8',
                        boxShadow: '0 8px 24px rgba(26,115,232,0.2)',
                        '&:hover': { transform: 'translateY(-2px)', bgcolor: '#0d47a1' }
                      }}
                    >
                      {saving ? <CircularProgress size={22} color="inherit" /> : 'Confirm & Update Driver'}
                    </Button>
                  </Box>
                ) : (
                  <Box sx={{ textAlign: 'center', py: 10, px: 4, bgcolor: '#fbfbff', borderRadius: '24px', border: '2px dashed #e2e8f0' }}>
                    <Box sx={{ width: 64, height: 64, bgcolor: '#fff', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2, boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                      <BadgeIcon sx={{ fontSize: 32, color: '#94a3b8' }} />
                    </Box>
                    <Typography fontWeight={800} color="#64748b" gutterBottom>No Vehicle Selected</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 300, display: 'block', mx: 'auto' }}>
                      Please search and select a truck number above to update its driver profile.
                    </Typography>
                  </Box>
                )}
              </Box>
            </TabPanel>

            {/* ── TAB 2: EXISTING CONTACTS ── */}
            <TabPanel value={tab} index={2}>
              <Box sx={{ p: 3 }}>
                <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <Box sx={{ flex: 1, minWidth: 160, p: 2, borderRadius: 2, border: '1px solid #e2e8f0', bgcolor: '#ffffff', display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <PersonIcon sx={{ color: '#475569' }} />
                    </Box>
                    <Box>
                      <Typography variant="caption" fontWeight={700} color="#64748b" textTransform="uppercase">Total Owners</Typography>
                      <Typography variant="h6" fontWeight={800} color="#0f172a">{uniqueOwners.length}</Typography>
                    </Box>
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 160, p: 2, borderRadius: 2, border: '1px solid #e2e8f0', bgcolor: '#ffffff', display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <LocalShippingIcon sx={{ color: '#10b981' }} />
                    </Box>
                    <Box>
                      <Typography variant="caption" fontWeight={700} color="#64748b" textTransform="uppercase">Total Vehicles</Typography>
                      <Typography variant="h6" fontWeight={800} color="#047857">{contacts.length}</Typography>
                    </Box>
                  </Box>
                </Box>

                {loading ? (
                  <Box display="flex" justifyContent="center" py={6}>
                    <CircularProgress sx={{ color: '#1a73e8' }} />
                  </Box>
                ) : contacts.length === 0 ? (
                  <Box sx={{ textAlign: 'center', py: 8, opacity: 0.5 }}>
                    <LocalShippingIcon sx={{ fontSize: 48, color: '#64748b', mb: 1 }} />
                    <Typography color="text.secondary">No contacts found</Typography>
                  </Box>
                ) : (
                  <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '12px', maxHeight: '55vh' }}>
                    <Table stickyHeader size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 800, bgcolor: '#f8fafc', color: '#475569', minWidth: 50 }}>#</TableCell>
                          <TableCell sx={{ fontWeight: 800, bgcolor: '#f8fafc', color: '#475569', minWidth: 120 }}>Vehicle No</TableCell>
                          <TableCell sx={{ fontWeight: 800, bgcolor: '#f8fafc', color: '#475569', minWidth: 150 }}>Owner Name</TableCell>
                          <TableCell sx={{ fontWeight: 800, bgcolor: '#f8fafc', color: '#475569', minWidth: 150 }}>Driver Name</TableCell>
                          <TableCell sx={{ fontWeight: 800, bgcolor: '#f8fafc', color: '#475569', minWidth: 120 }}>Phone</TableCell>
                          <TableCell sx={{ fontWeight: 800, bgcolor: '#f8fafc', color: '#475569', minWidth: 120 }}>PAN</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 800, bgcolor: '#f8fafc', color: '#475569', minWidth: 100 }}>Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {contacts.map((c, idx) => {
                          const tNo = getStr(c["Truck No "], c["Truck No"], c.truck_no) || '-';
                          const oName = getStr(c["Owner Name "], c["Owner Name"], c.owner_name) || '-';
                          const dName = getStr(c["Driver Name "], c["Driver Name"], c.driver_name) || '-';
                          const phone = getStr(c["Contact No. "], c["Contact No."], c.contact_no) || '-';
                          const pan = getStr(c["PAN No. "], c["PAN No."], c.pan_no) || '-';

                          return (
                            <TableRow key={c._id} hover sx={{ '&:nth-of-type(even)': { bgcolor: '#fbfbff' } }}>
                              <TableCell sx={{ color: '#64748b', fontSize: '13px' }}>{idx + 1}</TableCell>
                              <TableCell sx={{ fontWeight: 700, color: '#0f172a', fontSize: '13px' }}>{tNo}</TableCell>
                              <TableCell sx={{ fontSize: '13px' }}>{oName}</TableCell>
                              <TableCell sx={{ fontSize: '13px' }}>{dName}</TableCell>
                              <TableCell sx={{ fontSize: '13px' }}>{phone}</TableCell>
                              <TableCell sx={{ fontSize: '13px' }}>{pan}</TableCell>
                              <TableCell align="right">
                                <IconButton size="small" onClick={() => handleEdit(c)} sx={{ color: '#1a73e8' }}>
                                  <EditIcon fontSize="small" />
                                </IconButton>
                                <IconButton size="small" onClick={() => handleDelete(c._id)} sx={{ color: '#d32f2f' }}>
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Box>
            </TabPanel>

            {/* ── TAB 3: APPROVALS QUEUE (Head Office Only) ── */}
            {userRole === 'Head-office' && (
              <TabPanel value={tab} index={3}>
                <Box sx={{ p: 3 }}>
                  <Box mb={3} display="flex" justifyContent="space-between" alignItems="center">
                    <Box>
                      <Typography variant="h6" fontWeight={800} color="#0f172a">Approvals Queue</Typography>
                      <Typography variant="caption" color="text.secondary">Review and authorize new truck/driver registrations</Typography>
                    </Box>
                    <Button variant="outlined" startIcon={<ListAltIcon />} size="small" onClick={fetchApprovals} sx={{ borderColor: '#e2e8f0', color: '#475569' }}>Refresh</Button>
                  </Box>

                  {approvalLoading ? <CircularProgress sx={{ display: 'block', mx: 'auto', mt: 4 }} /> :
                    approvals.length === 0 ? (
                      <Box sx={{ textAlign: 'center', py: 10, bgcolor: '#f8fafc', borderRadius: '16px', border: '1px dashed #cbd5e1' }}>
                        <CheckCircleIcon sx={{ fontSize: 48, color: '#10b981', mb: 2, opacity: 0.5 }} />
                        <Typography color="text.secondary" fontWeight={600}>All clear! No pending approvals found.</Typography>
                      </Box>
                    ) : (
                      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell sx={{ fontWeight: 800, bgcolor: '#f8fafc', color: '#475569' }}>Requested Date</TableCell>
                              <TableCell sx={{ fontWeight: 800, bgcolor: '#f8fafc', color: '#475569' }}>Type</TableCell>
                              <TableCell sx={{ fontWeight: 800, bgcolor: '#f8fafc', color: '#475569' }}>Vehicle No</TableCell>
                              <TableCell sx={{ fontWeight: 800, bgcolor: '#f8fafc', color: '#475569' }}>Owner / Driver</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 800, bgcolor: '#f8fafc', color: '#475569' }}>Action</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {approvals.map((req) => (
                              <TableRow key={req._id} hover>
                                <TableCell sx={{ color: '#64748b' }}>{new Date(req.requestedAt).toLocaleDateString()}</TableCell>
                                <TableCell><Chip label={req.requestType} size="small" sx={{ fontWeight: 700, bgcolor: '#fff7ed', color: '#c2410c' }} /></TableCell>
                                <TableCell sx={{ fontWeight: 700, color: '#0f172a' }}>{req["Truck No "] || 'N/A'}</TableCell>
                                <TableCell>
                                  <Typography variant="caption" sx={{ display: 'block', color: '#475569' }}><b>Owner:</b> {req["Owner Name "]}</Typography>
                                  <Typography variant="caption" sx={{ display: 'block', color: '#475569' }}><b>Driver:</b> {req["Driver Name "]}</Typography>
                                </TableCell>
                                <TableCell align="right">
                                  <Button variant="contained" color="success" size="small" sx={{ borderRadius: '6px', fontWeight: 700, textTransform: 'none', mr: 1, bgcolor: '#10b981', '&:hover': { bgcolor: '#059669' } }} onClick={() => handleProcessApproval(req._id, 'approved')}>
                                    Approve
                                  </Button>
                                  <Button variant="outlined" color="error" size="small" sx={{ borderRadius: '6px', fontWeight: 700, textTransform: 'none' }} onClick={() => handleProcessApproval(req._id, 'rejected')}>
                                    Reject
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                </Box>
              </TabPanel>
            )}

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
