import React, { useEffect, useState } from 'react';
import {
    Container, Typography, Button, Box, Chip, IconButton, CircularProgress,
    Grid, Card, CardContent, Divider, Collapse, Dialog, DialogTitle,
    DialogContent, DialogContentText, DialogActions, Checkbox, Tooltip, TablePagination,
    Snackbar, Alert, Badge, TextField
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DownloadIcon from '@mui/icons-material/Download';
import AddIcon from '@mui/icons-material/Add';
import DescriptionIcon from '@mui/icons-material/Description';
import StorageIcon from '@mui/icons-material/Storage';
import PrintIcon from '@mui/icons-material/Print';
import LogoutIcon from '@mui/icons-material/Logout';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import PersonIcon from '@mui/icons-material/Person';
import CurrencyRupeeIcon from '@mui/icons-material/CurrencyRupee';
import AssignmentIcon from '@mui/icons-material/Assignment';
import DeleteIcon from '@mui/icons-material/Delete';
import ReceiptIcon from '@mui/icons-material/Receipt';
import HistoryIcon from '@mui/icons-material/History';
import TableChartIcon from '@mui/icons-material/TableChart';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import axios from 'axios';
import { startRegistration } from '@simplewebauthn/browser';
import { useAuth } from '../context/AuthContext';
import CementRegisterBlock from './CementRegisterBlock';
import VoucherDialog from './VoucherDialog';
import TruckContactManager from './TruckContactManager';
import AutoPdfRegenerator from './AutoPdfRegenerator';
import { io } from 'socket.io-client';
import html2pdf from 'html2pdf.js';
import { toIndianWords } from '../utils/toIndianWords';
import AdvanceFuelSlipDocument from './AdvanceFuelSlipDocument';

const SOCKET_URL = import.meta.env.VITE_SOCKET_IO_URL || import.meta.env.VITE_API_URL;
const _dashSocket = io(SOCKET_URL, {
    autoConnect: true,
    transports: ["websocket", "polling"]
});

const API_URL = import.meta.env.VITE_API_URL;

const Dashboard = ({ onUploadNew, onOpenLorrySlip, onOpenFuelSlip, onOpenCementRegister, onOpenVoucherRegister, onOpenGSTPortalRegister, onOpenMainCashbook, onOpenPumpPayment, onOpenPumpPaymentRegister, onOpenPartyPayment, onOpenFYDetails, onOpenFuelRateSettings, onOpenAccountDetails, onOpenAccountApprovals, onOpenDailySummaryReport, onOpenIncentiveSheet, onOpenAttendancePanel }) => {
    const { user, logout } = useAuth();
    const advanceFuelSlipRef = React.useRef();
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [bulkConfirm, setBulkConfirm] = useState(false);
    const [selectedDocTypes, setSelectedDocTypes] = useState({});
    const [voucherDialogOpen, setVoucherDialogOpen] = useState(false);
    const [voucherDialogTab, setVoucherDialogTab] = useState(0);
    const [vouchers, setVouchers] = useState([]);
    const [vouchersLoading, setVouchersLoading] = useState(false);
    const [truckManagerOpen, setTruckManagerOpen] = useState(false);
    const [vaultModalOpen, setVaultModalOpen] = useState(false);
    const [snack, setSnack] = useState(null);
    const [fuelRates, setFuelRates] = useState({ 'SAS-1': 90, 'SAS-2': 90 });
    const [fuelRateEdits, setFuelRateEdits] = useState({ 'SAS-1': '90', 'SAS-2': '90' });
    const [fuelRateSaving, setFuelRateSaving] = useState({ 'SAS-1': false, 'SAS-2': false });
    const [fuelRateModalOpen, setFuelRateModalOpen]   = useState(false);
    const [fuelRateModalPump, setFuelRateModalPump]   = useState('SAS-1');
    const [fuelRateModalValue, setFuelRateModalValue] = useState('');
    const [pendingCount, setPendingCount]             = useState(0);
    // Invoice IDs queued for PDF regeneration after a fuel rate change
    const [regenQueue, setRegenQueue] = useState([]);
    
    // For Dashboard Daily Stats
    const [todayStats, setTodayStats] = useState(null);

    const [portalStatuses, setPortalStatuses] = useState([]);
    const [createAdvanceFuelSlipOpen, setCreateAdvanceFuelSlipOpen] = useState(false);
    const [advanceFuelSlipTarget, setAdvanceFuelSlipTarget] = useState(null);
    const [advanceFuelFormData, setAdvanceFuelFormData] = useState({
        stationName: 'SAS-1',
        stationAddress: 'Panagarh',
        hsdSlipNo: '',
        vehicleNo: '',
        driverName: '',
        isDriverNameEditable: false,
        fuelSlipNo: '',
        qty: '',
        loadingAdvance: '',
        totalAdvance: 0
    });
    const [savingAdvanceSlip, setSavingAdvanceSlip] = useState(false);

    // Pagination states
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const handleChangePage = (event, newPage) => setPage(newPage);
    const handleChangeRowsPerPage = (event) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };

    const fetchTodayStats = async () => {
        try {
            const token = localStorage.getItem('token');
            const today = new Date().toISOString().split('T')[0];
            const res = await axios.get(`${API_URL}/daily-summary?date=${today}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data.success) {
                setTodayStats(res.data.summary);
            }
        } catch (e) {
            console.error('Error fetching today stats:', e);
        }
    };

    useEffect(() => { 
        fetchInvoices(); 
        fetchVouchers(); 
        fetchFuelRates(); 
        fetchTodayStats();
        
        // Portal status poller for Head Office
        if (user?.role === 'HEAD_OFFICE') {
            fetchPortalStatuses();
            fetchPending();
            const intervalId = setInterval(() => { fetchPortalStatuses(); fetchPending(); }, 30000);
            return () => clearInterval(intervalId);
        }
    }, [user?.role]);

    // Listen for fuel rate applied — auto-regenerate affected PDFs
    useEffect(() => {
        const handler = ({ pumpName, rate, invoiceIds }) => {
            if (!invoiceIds?.length) return;
            setRegenQueue(prev => {
                const existing = new Set(prev);
                invoiceIds.forEach(id => existing.add(id));
                return [...existing];
            });
            setSnack({ msg: `⛽ Fuel rate updated to ₹${rate}/L. Regenerating ${invoiceIds.length} slip PDF(s)...`, sev: 'info' });
        };
        _dashSocket.on('fuelRateApplied', handler);
        return () => _dashSocket.off('fuelRateApplied', handler);
    }, []);

    const fetchPending = async () => {
        if (user?.role !== 'HEAD_OFFICE') return;
        try {
            const token = localStorage.getItem('token');
            const [authRes, truckRes] = await Promise.all([
                axios.get(`${API_URL}/auth/admin/pending-registrations`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: { success: false } })),
                axios.get(`${API_URL}/truck-contacts/approvals`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: { success: false } }))
            ]);
            let count = 0;
            if (authRes.data?.success && authRes.data.users) count += authRes.data.users.length;
            if (truckRes.data?.success && truckRes.data.requests) count += truckRes.data.requests.length;
            setPendingCount(count);
        } catch (e) { /* silently ignore */ }
    };

    const fetchPortalStatuses = async () => {
        try {
            const res = await axios.get(`${API_URL}/system/portal-status`);
            if (res.data.success) {
                setPortalStatuses(res.data.statuses);
            }
        } catch (e) {
            console.error('Failed to fetch portal statuses:', e);
        }
    };

    const fetchFuelRates = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`${API_URL}/pump-payment/fuel-rates`, { headers: { Authorization: `Bearer ${token}` } });
            if (res.data.success) {
                const rates = res.data.rates || {};
                setFuelRates(rates);
                setFuelRateEdits({ 
                    'SAS-1': String(rates['SAS-1'] ?? 90), 
                    'SAS-2': String(rates['SAS-2'] ?? 90) 
                });
            }
        } catch (e) { console.error('Failed to fetch fuel rates:', e); }
    };

    const handleSaveFuelRate = async (pumpName) => {
        const rateVal = parseFloat(fuelRateEdits[pumpName]);
        if (isNaN(rateVal) || rateVal <= 0) {
            setSnack({ msg: 'Rate must be a positive number', sev: 'error' }); return;
        }
        setFuelRateSaving(p => ({ ...p, [pumpName]: true }));
        try {
            const token = localStorage.getItem('token');
            await axios.put(`${API_URL}/pump-payment/fuel-rates`, { pumpName, rate: rateVal }, { headers: { Authorization: `Bearer ${token}` } });
            setFuelRates(p => ({ ...p, [pumpName]: rateVal }));
            setSnack({ msg: `${pumpName} rate updated to ₹${rateVal}/L`, sev: 'success' });
        } catch (e) {
            setSnack({ msg: e.response?.data?.error || 'Failed to update rate', sev: 'error' });
        } finally {
            setFuelRateSaving(p => ({ ...p, [pumpName]: false }));
        }
    };

    const fetchVouchers = async () => {
        setVouchersLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`${API_URL}/voucher`, { headers: { Authorization: `Bearer ${token}` } });
            if (res.data.success) setVouchers(res.data.vouchers);
        } catch (e) {
            console.error('Failed to fetch vouchers:', e);
        } finally {
            setVouchersLoading(false);
        }
    };

    const fetchInvoices = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get(`${API_URL}/invoice/all`, { headers: { Authorization: `Bearer ${token}` } });
            setInvoices(response.data);
        } catch (error) {
            console.error('Error fetching invoices:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteConfirm = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`${API_URL}/invoice/${deleteTarget._id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setInvoices(prev => prev.filter(i => i._id !== deleteTarget._id));
            setSelectedIds(prev => { const s = new Set(prev); s.delete(deleteTarget._id); return s; });
            setDeleteTarget(null);
        } catch (e) {
            console.error('Delete failed:', e);
        } finally {
            setDeleting(false);
        }
    };

    const isDocReady = (inv, sel) => {
        if (sel === 'invoice_hard') return !!inv.file_url;
        if (sel === 'invoice_soft') return !!(inv.softcopy_url && inv.s3_exists);
        if (sel === 'gcn_soft') return !!inv.gcn_url;
        if (sel === 'lorry_soft') return !!inv.lorry_hire_slip_data?.lorry_hire_slip_url;
        if (sel === 'fuel_soft') return !!inv.lorry_hire_slip_data?.fuel_slip_url;
        if (sel === 'advance_fuel_slip') return !!inv.lorry_hire_slip_data?.advance_fuel_slip_url;
        return false;
    };

    const handleOpenCreateAdvanceFuelSlip = async (inv) => {
        console.log('[ADVANCE_FUEL_SLIP FRONTEND] Opening modal. Incoming invoice data:', inv);
        
        const supplyDetails = inv.human_verified_data?.supply_details || inv.ai_data?.invoice_data?.supply_details || {};
        const driverDetails = inv.human_verified_data?.driver_details || inv.ai_data?.invoice_data?.driver_details || {};
        
        console.log('[ADVANCE_FUEL_SLIP FRONTEND] Extraction sources:', {
            'lorry_hire_slip_data': inv.lorry_hire_slip_data,
            'driverDetails': driverDetails,
            'supplyDetails': supplyDetails
        });

        const vehicleNo = inv.lorry_hire_slip_data?.vehicleNumber || inv.lorry_hire_slip_data?.vehicle_number || supplyDetails.vehicle_number || '';
        let driverName = inv.lorry_hire_slip_data?.driverName || inv.lorry_hire_slip_data?.driver_name || inv.driverName || driverDetails.driver_name || '';
        
        console.log('[ADVANCE_FUEL_SLIP FRONTEND] Initial Extracted values:', { vehicleNo, driverName });

        // Auto-fetch Driver Name from Owner Details (TruckContacts)
        if (vehicleNo) {
            try {
                const token = localStorage.getItem('token');
                const res = await axios.get(`${API_URL}/truck-contacts/search/${encodeURIComponent(vehicleNo)}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.data && res.data.success && res.data.contact) {
                    const fetchedDriverName = res.data.contact["Driver Name "] || res.data.contact.driver_name;
                    if (fetchedDriverName) {
                        driverName = fetchedDriverName;
                        console.log('[ADVANCE_FUEL_SLIP FRONTEND] Successfully fetched Driver Name from Owner Details:', driverName);
                    }
                }
            } catch (err) {
                console.error('[ADVANCE_FUEL_SLIP FRONTEND] Error fetching driver details:', err);
            }
        }

        const randomSlipNo = 'ADV-' + Math.floor(100000 + Math.random() * 900000);

        const hasFuelSlip = !!(inv.lorry_hire_slip_data?.fuel_slip_url && inv.lorry_hire_slip_data?.fuel_slip_no);
        const fuelSlipNoVal = inv.lorry_hire_slip_data?.fuel_slip_url
            ? (inv.lorry_hire_slip_data?.fuel_slip_no || 'Not Available')
            : 'Fuel Slip Not Generated';

        const isDriverNameFetched = !!driverName && 
            !['not available', 'n/a', 'not found', '---'].includes(driverName.toLowerCase().trim()) &&
            !driverName.toLowerCase().includes('missing in') &&
            !driverName.toLowerCase().includes('collection');
        const driverNameVal = isDriverNameFetched ? driverName : '';

        setAdvanceFuelFormData({
            stationName: inv.lorry_hire_slip_data?.station_name || 'SAS-1',
            stationAddress: 'Panagarh',
            date: inv.lorry_hire_slip_data?.advance_fuel_slip_date || new Date().toISOString().split('T')[0],
            hsdSlipNo: randomSlipNo,
            vehicleNo: vehicleNo,
            driverName: driverNameVal,
            isDriverNameEditable: !isDriverNameFetched,
            fuelSlipNo: fuelSlipNoVal,
            qty: '',
            loadingAdvance: '',
            totalAdvance: 0
        });
        setAdvanceFuelSlipTarget(inv);
        setCreateAdvanceFuelSlipOpen(true);
    };

    const handleSaveAdvanceFuelSlip = async () => {
        if (!advanceFuelSlipTarget) return;
        setSavingAdvanceSlip(true);
        try {
            const opt = {
                margin: 0,
                filename: `advance_fuel_slip_${advanceFuelFormData.hsdSlipNo}.pdf`,
                image: { type: 'jpeg', quality: 1.0 },
                html2canvas: { scale: 3, useCORS: true, logging: false },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };

            const element = advanceFuelSlipRef.current;
            if (!element) {
                throw new Error("Print element reference not found");
            }
            
            const blob = await html2pdf().set(opt).from(element).output('blob');

            const formData = new FormData();
            formData.append('invoice_id', advanceFuelSlipTarget._id);
            formData.append('softcopy', blob, `advance_fuel_slip_${advanceFuelSlipTarget._id}.pdf`);
            formData.append('driver_name', advanceFuelFormData.driverName);
            formData.append('date', advanceFuelFormData.date);

            const token = localStorage.getItem('token');
            const res = await axios.post(`${API_URL}/invoice/advance-fuel-slip-softcopy`, formData, {
                headers: { 'Content-Type': 'multipart/form-data', 'Authorization': `Bearer ${token}` }
            });

            // Update local invoices state
            setInvoices(prev => prev.map(inv => {
                if (inv._id === advanceFuelSlipTarget._id) {
                    return {
                        ...inv,
                        lorry_hire_slip_data: {
                            ...inv.lorry_hire_slip_data,
                            advance_fuel_slip_url: res.data.url,
                            driver_name: advanceFuelFormData.driverName,
                            advance_fuel_slip_date: advanceFuelFormData.date
                        }
                    };
                }
                return inv;
            }));

            setSnack({ type: 'success', message: 'Advance Fuel Slip generated and saved successfully!' });
            setCreateAdvanceFuelSlipOpen(false);
            setAdvanceFuelSlipTarget(null);
        } catch (error) {
            console.error('Error saving advance fuel slip:', error);
            const msg = error.response?.data?.error || error.message;
            setSnack({ type: 'error', message: 'Failed to save Advance Fuel Slip: ' + msg });
        } finally {
            setSavingAdvanceSlip(false);
        }
    };

    const toggleSelect = (id, e) => {
        e.stopPropagation();
        setSelectedIds(prev => {
            const s = new Set(prev);
            s.has(id) ? s.delete(id) : s.add(id);
            return s;
        });
    };

    const allSelected = invoices.length > 0 && selectedIds.size === invoices.length;
    const someSelected = selectedIds.size > 0 && !allSelected;

    const toggleSelectAll = () => {
        if (allSelected || someSelected) setSelectedIds(new Set());
        else setSelectedIds(new Set(invoices.map(i => i._id)));
    };

    const handleBulkDelete = async () => {
        setDeleting(true);
        try {
            const token = localStorage.getItem('token');
            await axios.post(`${API_URL}/invoice/bulk-delete`,
                { ids: [...selectedIds] },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setInvoices(prev => prev.filter(i => !selectedIds.has(i._id)));
            setSelectedIds(new Set());
            setBulkConfirm(false);
        } catch (e) {
            console.error('Bulk delete failed:', e);
        } finally {
            setDeleting(false);
        }
    };

    const handleRegisterBiometrics = async () => {
        if (!window.PublicKeyCredential) {
            setSnack({ type: 'error', message: 'Biometrics are not supported or blocked by your browser environment.' });
            return;
        }
        try {
            const token = localStorage.getItem('token');
            const optRes = await axios.get(`${API_URL}/auth/generate-registration-options`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            let attResp;
            try {
                attResp = await startRegistration({ optionsJSON: optRes.data });
            } catch (error) {
                console.error("WebAuthn Browser Error:", error);
                if (error.name === 'InvalidStateError') {
                    setSnack({ type: 'error', message: 'This device is already registered.' });
                } else {
                    setSnack({ type: 'error', message: error.message });
                }
                return;
            }

            const verifyRes = await axios.post(`${API_URL}/auth/verify-registration`, attResp, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (verifyRes.data.verified) {
                setSnack({ type: 'success', message: 'Biometrics successfully registered!' });
            } else {
                setSnack({ type: 'error', message: 'Registration verification failed' });
            }
        } catch (e) {
            console.error("WebAuthn Verify Error:", e);
            setSnack({ type: 'error', message: e.response?.data?.error || e.message });
        }
    };

    const toggleExpand = (id) => {
        setExpanded(prev => prev === id ? null : id);
        if (!selectedDocTypes[id]) {
            setSelectedDocTypes(prev => ({ ...prev, [id]: 'invoice_soft' }));
        }
    };

    const getField = (inv, ...paths) => {
        for (const path of paths) {
            const keys = path.split('.');
            let val = inv;
            for (const k of keys) { val = val?.[k]; }
            if (val) return val;
        }
        return null;
    };

    const statusColor = (status) => {
        switch (status) {
            case 'approved': return { label: 'Approved', color: 'success' };
            case 'pending': return { label: 'Pending', color: 'warning' };
            default: return { label: status, color: 'default' };
        }
    };

    return (
        <>
            <Container maxWidth="xl" sx={{ mt: { xs: 2, md: 4 }, mb: 4, px: { xs: 1, sm: 2, md: 3 } }}>

                {/* ── Header ─────────────────────────────────────────────── */}
                <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={4}
                    sx={{ flexDirection: { xs: 'column', md: 'row' }, gap: { xs: 3, md: 2 } }}>
                    <Box sx={{ width: { xs: '100%', md: 'auto' } }}>
                        <Typography variant="h3" fontWeight="900" color="primary"
                            sx={{ letterSpacing: '-1.5px', fontSize: { xs: '2rem', sm: '2.4rem', md: '2.8rem' }, textAlign: { xs: 'center', md: 'left' } }}>
                            DIPALI ASSOCIATES &amp; CO
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mt: 0.5, justifyContent: { xs: 'center', md: 'flex-start' } }}>
                            <Typography variant="subtitle1" color="text.secondary" fontWeight="500" sx={{ opacity: 0.8 }}>
                                Premium Slip &amp; Invoice Management Portal [Role: {user?.role === 'OFFICE' ? 'Site-office' : (user?.role === 'HEAD_OFFICE' ? 'Head-office' : user?.role) || 'NONE'}]
                            </Typography>
                            {user?.role === 'HEAD_OFFICE' && portalStatuses.length > 0 && (
                                <Box sx={{ display: 'flex', gap: 1, borderLeft: { xs: 'none', md: '2px solid #e2e8f0' }, pl: { xs: 0, md: 1.5 } }}>
                                    {portalStatuses.map(ps => (
                                        <Tooltip key={ps.id} title={`${ps.name} is ${ps.active ? 'Online' : 'Offline'}`}>
                                            <Chip 
                                                size="small" 
                                                label={ps.name.split(' ')[0]} 
                                                sx={{ 
                                                    height: 20, fontSize: '0.65rem', fontWeight: 800,
                                                    bgcolor: ps.active ? '#dcfce7' : '#fee2e2',
                                                    color: ps.active ? '#166534' : '#991b1b',
                                                    border: `1px solid ${ps.active ? '#bbf7d0' : '#fecaca'}`,
                                                    '& .MuiChip-label': { px: 1 }
                                                }}
                                            />
                                        </Tooltip>
                                    ))}
                                </Box>
                            )}
                        </Box>
                    </Box>
                    <Box display="flex" gap={2}
                        sx={{ width: { xs: '100%', md: 'auto' }, justifyContent: { xs: 'center', md: 'flex-end' } }}>
                        <Button variant="outlined" color="primary" startIcon={<FingerprintIcon />} onClick={handleRegisterBiometrics}
                            sx={{ borderRadius: '12px', px: { xs: 2.5, sm: 3 }, fontWeight: 700, flex: { xs: 1, md: 'none' } }}>
                            Register Biometrics
                        </Button>

                        {/* ── Pending Approvals Bell (HEAD_OFFICE only) ── */}
                        {user?.role === 'HEAD_OFFICE' && (
                            <Tooltip title={pendingCount > 0 ? `${pendingCount} pending approval request${pendingCount !== 1 ? 's' : ''}` : 'No pending approvals'}>
                                <Badge badgeContent={pendingCount} color="error" max={99}
                                    sx={{ '& .MuiBadge-badge': { fontWeight: 900, fontSize: 10 } }}>
                                    <IconButton
                                        onClick={onOpenAccountApprovals}
                                        sx={{
                                            bgcolor: pendingCount > 0 ? '#ede9fe' : '#f1f5f9',
                                            border: pendingCount > 0 ? '2px solid #7c3aed' : '2px solid #e2e8f0',
                                            borderRadius: '12px',
                                            transition: 'all 0.2s',
                                            '&:hover': { bgcolor: '#ede9fe', borderColor: '#7c3aed' }
                                        }}>
                                        <PersonAddAlt1Icon sx={{ color: pendingCount > 0 ? '#7c3aed' : '#94a3b8', fontSize: 22 }} />
                                    </IconButton>
                                </Badge>
                            </Tooltip>
                        )}

                        <Button variant="outlined" color="error" startIcon={<LogoutIcon />} onClick={logout}
                            sx={{ borderRadius: '12px', px: { xs: 2.5, sm: 3 }, fontWeight: 700, flex: { xs: 1, md: 'none' } }}>
                            Logout
                        </Button>

                        <Button variant="contained" size="large" startIcon={<AddIcon />} onClick={onUploadNew}
                            sx={{
                                borderRadius: '12px', px: { xs: 2.5, sm: 4 }, py: 1.5,
                                fontWeight: 800, flex: { xs: 1, md: 'none' },
                                boxShadow: '0 10px 20px rgba(26,115,232,0.2)',
                                background: 'linear-gradient(45deg, #1a73e8 30%, #4285f4 90%)',
                            }}>
                            New Slip
                        </Button>
                    </Box>
                </Box>
                <Box display="flex" flexDirection="column" gap={4}>
                <Box display="flex" flexDirection="column" gap={4}>

                    {/* ── Hero Section (Invoices & Daily Summary) ─────────────────────────── */}
                    <Box sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', lg: '7fr 5fr' },
                        gap: 3, alignItems: 'stretch'
                    }}>
                        {/* Invoice Hero Panel */}
                        <Card sx={{
                            borderRadius: '24px',
                            background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
                            border: '1px solid #cbd5e1',
                            boxShadow: '0 20px 40px rgba(0,0,0,0.05)',
                            position: 'relative',
                            overflow: 'hidden'
                        }}>
                            <Box sx={{
                                position: 'absolute', right: -40, top: -40,
                                width: 200, height: 200, borderRadius: '50%',
                                background: 'radial-gradient(circle, rgba(26,115,232,0.1) 0%, transparent 70%)'
                            }} />
                            <CardContent sx={{ p: { xs: 3, md: 4 }, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                <Typography variant="overline" fontWeight={900} sx={{ color: '#64748b', letterSpacing: 1.5, mb: 1 }}>
                                    CORE OPERATIONS
                                </Typography>
                                <Typography variant="h3" fontWeight={900} sx={{ color: '#0f172a', mb: 1, letterSpacing: '-1px' }}>
                                    Invoice Management
                                </Typography>
                                <Typography variant="body1" sx={{ color: '#475569', mb: 4, maxWidth: 500, fontWeight: 500 }}>
                                    Upload, process, and manage all your slips and invoices. 
                                    Our AI automatically extracts data for you.
                                </Typography>
                                <Box display="flex" gap={2}>
                                    <Button variant="contained" size="large" startIcon={<AddIcon />} onClick={onUploadNew}
                                        sx={{
                                            borderRadius: '14px', px: 4, py: 1.5, fontWeight: 900,
                                            boxShadow: '0 10px 20px rgba(26,115,232,0.25)',
                                            background: 'linear-gradient(45deg, #1a73e8 30%, #4285f4 90%)',
                                            '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 14px 28px rgba(26,115,232,0.35)' },
                                            transition: 'all 0.2s'
                                        }}>
                                        Upload New Slip
                                    </Button>
                                    <Button variant="outlined" size="large" startIcon={<StorageIcon />} onClick={() => setVaultModalOpen(true)}
                                        sx={{
                                            borderRadius: '14px', px: 4, py: 1.5, fontWeight: 800,
                                            color: '#334155', borderColor: '#cbd5e1',
                                            bgcolor: 'white',
                                            '&:hover': { bgcolor: '#f1f5f9', borderColor: '#94a3b8' }
                                        }}>
                                        Open Vault
                                    </Button>
                                </Box>
                            </CardContent>
                        </Card>

                        {/* Daily Summary Report Dashboard Card */}
                        <Card sx={{
                            borderRadius: '24px',
                            background: 'linear-gradient(135deg, #4c1d95 0%, #6d28d9 100%)',
                            color: '#fff',
                            boxShadow: '0 20px 40px rgba(109,40,217,0.3)',
                            position: 'relative', overflow: 'hidden',
                            cursor: 'pointer',
                            transition: 'all 0.3s ease',
                            '&:hover': { transform: 'translateY(-4px)', boxShadow: '0 24px 48px rgba(109,40,217,0.45)' }
                        }} onClick={onOpenDailySummaryReport}>
                            <Box sx={{
                                position: 'absolute', top: -30, right: -30,
                                width: 150, height: 150, borderRadius: '50%',
                                bgcolor: 'rgba(255,255,255,0.05)',
                            }} />
                            <CardContent sx={{ p: { xs: 3, md: 4 }, display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
                                <Box display="flex" alignItems="flex-start" gap={2} mb={2}>
                                    <Box sx={{ p: 1.5, bgcolor: 'rgba(255,255,255,0.15)', borderRadius: '12px' }}>
                                        <AssignmentIcon sx={{ fontSize: 32 }} />
                                    </Box>
                                    <Box>
                                        <Typography variant="h5" fontWeight={900} sx={{ letterSpacing: 0.5, mb: 0.5 }}>
                                            DAILY SUMMARY REPORT
                                        </Typography>
                                        <Typography variant="body2" sx={{ opacity: 0.8, fontWeight: 500 }}>
                                            Live operational overview for today
                                        </Typography>
                                    </Box>
                                </Box>
                                {todayStats && (
                                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 3 }}>
                                        <Box>
                                            <Typography variant="caption" sx={{ opacity: 0.7, fontWeight: 700 }}>Invoices Uploaded</Typography>
                                            <Typography variant="h4" fontWeight={900}>{todayStats?.invoiceStats?.totalUploaded || 0}</Typography>
                                        </Box>
                                        <Box>
                                            <Typography variant="caption" sx={{ opacity: 0.7, fontWeight: 700 }}>Pending Review</Typography>
                                            <Typography variant="h4" fontWeight={900} color={todayStats?.invoiceStats?.pendingInvoices > 0 ? '#fbbf24' : 'inherit'}>
                                                {todayStats?.invoiceStats?.pendingInvoices || 0}
                                            </Typography>
                                        </Box>
                                    </Box>
                                )}
                                <Box sx={{ mt: 'auto' }}>
                                    <Button
                                        fullWidth variant="contained"
                                        startIcon={<VisibilityIcon />}
                                        onClick={(e) => { e.stopPropagation(); onOpenDailySummaryReport(); }}
                                        sx={{
                                            borderRadius: '12px', py: 1.5, fontWeight: 900, fontSize: '1rem',
                                            bgcolor: '#fff', color: '#6d28d9',
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                            '&:hover': { bgcolor: '#f8fafc', transform: 'scale(1.02)' },
                                            transition: 'all 0.2s',
                                        }}
                                    >
                                        Open Today's Dashboard
                                    </Button>
                                </Box>
                            </CardContent>
                        </Card>
                    </Box>

                    {/* ── High Priority Registers ─────────────────────────── */}
                    <Box>
                        <Typography variant="overline" fontWeight={900} sx={{ color: '#64748b', ml: 1, letterSpacing: 1.2, mb: 1, display: 'block' }}>
                            HIGH PRIORITY REGISTERS
                        </Typography>
                        <Grid container spacing={3}>
                            {[
                                { title: 'CEMENT REGISTER', subtitle: 'Trip & Freight Logic', icon: <LocalShippingIcon sx={{ fontSize: 24 }} />, bg: '#0369a1', onClick: onOpenCementRegister },
                                { title: 'BILL REGISTER', subtitle: 'Pending & Cleared Bills', icon: <TableChartIcon sx={{ fontSize: 24 }} />, bg: '#0f172a', onClick: onOpenFYDetails },
                                { title: 'PARTY PAYMENT DETAILS', subtitle: 'Aggregated Monthly Ledger', icon: <AccountBalanceWalletIcon sx={{ fontSize: 24 }} />, bg: '#1d4ed8', onClick: onOpenPartyPayment }
                            ].map((item, idx) => (
                                <Grid item xs={12} md={4} key={idx}>
                                    <Card sx={{
                                        borderRadius: '20px', bgcolor: item.bg, color: '#fff',
                                        boxShadow: `0 10px 20px rgba(0,0,0,0.15)`,
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        cursor: 'pointer', transition: 'all 0.2s',
                                        '&:hover': { transform: 'translateY(-2px)', boxShadow: `0 14px 28px rgba(0,0,0,0.25)` }
                                    }} onClick={item.onClick}>
                                        <CardContent sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 2 }}>
                                            <Box sx={{ p: 1.5, bgcolor: 'rgba(255,255,255,0.15)', borderRadius: '12px' }}>
                                                {item.icon}
                                            </Box>
                                            <Box>
                                                <Typography variant="subtitle1" fontWeight={900}>{item.title}</Typography>
                                                <Typography variant="caption" sx={{ opacity: 0.8, fontWeight: 500 }}>{item.subtitle}</Typography>
                                            </Box>
                                        </CardContent>
                                    </Card>
                                </Grid>
                            ))}
                        </Grid>
                    </Box>

                    {/* ── Financial Section ─────────────────────────── */}
                    <Box>
                        <Typography variant="overline" fontWeight={900} sx={{ color: '#64748b', ml: 1, letterSpacing: 1.2, mb: 1, display: 'block' }}>
                            FINANCIAL MANAGEMENT
                        </Typography>
                        <Grid container spacing={3}>
                            {[
                                { title: 'BANK BOOK', subtitle: 'Transactions & Balances', icon: <AccountBalanceWalletIcon sx={{ fontSize: 24 }} />, bg: '#0f766e', onClick: onOpenAccountDetails },
                                { title: 'MAIN CASHBOOK', subtitle: 'Daily Cash Flow', icon: <DescriptionIcon sx={{ fontSize: 24 }} />, bg: '#047857', onClick: onOpenMainCashbook },
                                { title: 'PUMP PAYMENT DETAILS', subtitle: 'Clear pump dues', icon: <LocalGasStationIcon sx={{ fontSize: 24 }} />, bg: '#0ea5e9', onClick: onOpenPumpPayment },
                                { title: 'PUMP PAYMENT REGISTER', subtitle: 'Record payments', icon: <ReceiptLongIcon sx={{ fontSize: 24 }} />, bg: '#0284c7', onClick: onOpenPumpPaymentRegister }
                            ].map((item, idx) => (
                                <Grid item xs={12} sm={6} md={3} key={idx}>
                                    <Card sx={{
                                        borderRadius: '20px', bgcolor: item.bg, color: '#fff',
                                        boxShadow: `0 10px 20px rgba(0,0,0,0.1)`,
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        cursor: 'pointer', transition: 'all 0.2s',
                                        '&:hover': { transform: 'translateY(-2px)', boxShadow: `0 14px 28px rgba(0,0,0,0.2)` }
                                    }} onClick={item.onClick}>
                                        <CardContent sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 2 }}>
                                            <Box sx={{ p: 1, bgcolor: 'rgba(255,255,255,0.15)', borderRadius: '10px' }}>
                                                {item.icon}
                                            </Box>
                                            <Box>
                                                <Typography variant="subtitle2" fontWeight={900}>{item.title}</Typography>
                                                <Typography variant="caption" sx={{ opacity: 0.8, fontWeight: 500 }}>{item.subtitle}</Typography>
                                            </Box>
                                        </CardContent>
                                    </Card>
                                </Grid>
                            ))}
                            {/* Incentive Calculation Sheet Placeholder */}
                            <Grid item xs={12} sm={6} md={3}>
                                <Card sx={{
                                    borderRadius: '20px', bgcolor: 'white', color: '#1e293b',
                                    border: '1px solid #e2e8f0',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.02)',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    '&:hover': {
                                        transform: 'translateY(-2px)',
                                        boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
                                        borderColor: '#94a3b8'
                                    }
                                }} onClick={onOpenIncentiveSheet}>
                                    <CardContent sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 2 }}>
                                        <Box sx={{ p: 1.5, bgcolor: '#f1f5f9', borderRadius: '12px', color: '#64748b' }}>
                                            <PersonIcon sx={{ fontSize: 24 }} />
                                        </Box>
                                        <Box>
                                            <Typography variant="subtitle2" fontWeight={800}>INCENTIVE SHEET</Typography>
                                            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 500 }}>Compare ATO/MKT</Typography>
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>
                        </Grid>
                    </Box>

                    {/* ── Master Data & Operations ─────────────────────────── */}
                    <Box>
                        <Typography variant="overline" fontWeight={900} sx={{ color: '#64748b', ml: 1, letterSpacing: 1.2, mb: 1, display: 'block' }}>
                            MASTER DATA & SETTINGS
                        </Typography>
                        <Grid container spacing={3}>
                            {/* GST Portal Details */}
                            <Grid item xs={12} sm={6} md={3}>
                                <Card sx={{
                                    borderRadius: '20px', bgcolor: '#be123c', color: '#fff',
                                    boxShadow: `0 10px 20px rgba(0,0,0,0.1)`,
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    cursor: 'pointer', transition: 'all 0.2s',
                                    '&:hover': { transform: 'translateY(-2px)', boxShadow: `0 14px 28px rgba(0,0,0,0.2)` }
                                }} onClick={onOpenGSTPortalRegister}>
                                    <CardContent sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 2 }}>
                                        <Box sx={{ p: 1, bgcolor: 'rgba(255,255,255,0.15)', borderRadius: '10px' }}>
                                            <ReceiptIcon sx={{ fontSize: 24 }} />
                                        </Box>
                                        <Box>
                                            <Typography variant="subtitle2" fontWeight={900}>GST INFORMATION</Typography>
                                            <Typography variant="caption" sx={{ opacity: 0.8, fontWeight: 500 }}>Tax Portal Ledger</Typography>
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>

                            {/* Vehicle Information */}
                            <Grid item xs={12} sm={6} md={3}>
                                <Card sx={{
                                    borderRadius: '20px', bgcolor: '#b45309', color: '#fff',
                                    boxShadow: `0 10px 20px rgba(0,0,0,0.1)`,
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    cursor: 'pointer', transition: 'all 0.2s',
                                    '&:hover': { transform: 'translateY(-2px)', boxShadow: `0 14px 28px rgba(0,0,0,0.2)` }
                                }} onClick={() => setTruckManagerOpen(true)}>
                                    <CardContent sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 2 }}>
                                        <Box sx={{ p: 1, bgcolor: 'rgba(255,255,255,0.15)', borderRadius: '10px' }}>
                                            <LocalShippingIcon sx={{ fontSize: 24 }} />
                                        </Box>
                                        <Box>
                                            <Typography variant="subtitle2" fontWeight={900}>OWNER & VEHICLES</Typography>
                                            <Typography variant="caption" sx={{ opacity: 0.8, fontWeight: 500 }}>Fleet Directory</Typography>
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>

                            {/* Vouchers Block */}
                            <Grid item xs={12} sm={6} md={3}>
                                <Card sx={{
                                    borderRadius: '20px', bgcolor: '#1e293b', color: '#fff',
                                    boxShadow: `0 10px 20px rgba(0,0,0,0.1)`,
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    cursor: 'pointer', transition: 'all 0.2s',
                                    '&:hover': { transform: 'translateY(-2px)', boxShadow: `0 14px 28px rgba(0,0,0,0.2)` }
                                }} onClick={() => { setVoucherDialogTab(1); setVoucherDialogOpen(true); }}>
                                    <CardContent sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 2 }}>
                                        <Box sx={{ p: 1, bgcolor: 'rgba(255,255,255,0.15)', borderRadius: '10px' }}>
                                            <HistoryIcon sx={{ fontSize: 24 }} />
                                        </Box>
                                        <Box>
                                            <Typography variant="subtitle2" fontWeight={900}>VOUCHER HISTORY</Typography>
                                            <Typography variant="caption" sx={{ opacity: 0.8, fontWeight: 500 }}>Approved Payouts</Typography>
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>

                            {/* Fuel Rate Settings */}
                            {user?.role === 'HEAD_OFFICE' && (
                                <Grid item xs={12} sm={6} md={3}>
                                    <Card sx={{
                                        borderRadius: '20px', bgcolor: '#0f4c6e', color: '#fff',
                                        boxShadow: `0 10px 20px rgba(0,0,0,0.1)`,
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        cursor: 'pointer', transition: 'all 0.2s',
                                        '&:hover': { transform: 'translateY(-2px)', boxShadow: `0 14px 28px rgba(0,0,0,0.2)` }
                                    }} onClick={onOpenFuelRateSettings}>
                                        <CardContent sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 2 }}>
                                            <Box sx={{ p: 1, bgcolor: 'rgba(255,255,255,0.15)', borderRadius: '10px' }}>
                                                <LocalGasStationIcon sx={{ fontSize: 24 }} />
                                            </Box>
                                            <Box>
                                                <Typography variant="subtitle2" fontWeight={900}>FUEL RATE AND CASH DISCOUNT SETTINGS</Typography>
                                                <Typography variant="caption" sx={{ opacity: 0.8, fontWeight: 500 }}>Admin Config</Typography>
                                            </Box>
                                        </CardContent>
                                    </Card>
                                </Grid>
                            )}
                        </Grid>
                    </Box>

                    {/* ── Attendance Section ─────────────────────────── */}
                    <Box>
                        <Typography variant="overline" fontWeight={900} sx={{ color: '#64748b', ml: 1, letterSpacing: 1.2, mb: 1, display: 'block' }}>
                            ATTENDANCE
                        </Typography>
                        <Grid container spacing={3}>
                            <Grid item xs={12} sm={6} md={3}>
                                <Card sx={{
                                    borderRadius: '20px', bgcolor: '#4f46e5', color: '#fff',
                                    boxShadow: `0 10px 20px rgba(0,0,0,0.1)`,
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    cursor: 'pointer', transition: 'all 0.2s',
                                    '&:hover': { transform: 'translateY(-2px)', boxShadow: `0 14px 28px rgba(0,0,0,0.2)` }
                                }} onClick={onOpenAttendancePanel}>
                                    <CardContent sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 2 }}>
                                        <Box sx={{ p: 1, bgcolor: 'rgba(255,255,255,0.15)', borderRadius: '10px', display: 'flex', alignItems: 'center' }}>
                                            <LocationOnIcon sx={{ fontSize: 24 }} />
                                        </Box>
                                        <Box>
                                            <Typography variant="subtitle2" fontWeight={900}>ATTENDANCE PANEL</Typography>
                                            <Typography variant="caption" sx={{ opacity: 0.8, fontWeight: 500 }}>Location-Based Attendance</Typography>
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>
                        </Grid>
                    </Box>
                </Box>
                    {/* ── Fuel Rate Update Dialog ──────────────────────────── */}
                    <Dialog
                        open={fuelRateModalOpen}
                        onClose={() => setFuelRateModalOpen(false)}
                        PaperProps={{
                            sx: {
                                borderRadius: '20px',
                                background: 'linear-gradient(135deg, #0c3547 0%, #0f4c6e 80%, #1565c0 100%)',
                                color: '#fff',
                                p: 1,
                                minWidth: { xs: '90vw', sm: 420 },
                                boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
                                border: '1px solid rgba(255,255,255,0.12)',
                            }
                        }}
                    >
                        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
                            <Box sx={{ p: 1, bgcolor: 'rgba(255,255,255,0.15)', borderRadius: '10px' }}>
                                <LocalGasStationIcon />
                            </Box>
                            <Box>
                                <Typography variant="h6" fontWeight={900}>Update Fuel Rate</Typography>
                                <Typography variant="caption" sx={{ opacity: 0.6 }}>Office Admin — Restricted</Typography>
                            </Box>
                        </DialogTitle>

                        <DialogContent sx={{ pt: 2 }}>
                            {/* Pump selector */}
                            <Typography variant="caption" fontWeight={800} sx={{ opacity: 0.7, letterSpacing: 0.5, mb: 1, display: 'block' }}>SELECT PUMP</Typography>
                            <Box display="flex" gap={1.5} mb={3}>
                                {['SAS-1', 'SAS-2'].map(p => (
                                    <Button
                                        key={p}
                                        variant={fuelRateModalPump === p ? 'contained' : 'outlined'}
                                        onClick={() => {
                                            setFuelRateModalPump(p);
                                            setFuelRateModalValue(String((fuelRates || {})[p] ?? 90));
                                        }}
                                        sx={{
                                            flex: 1, borderRadius: '12px', fontWeight: 800, py: 1.2,
                                            ...(fuelRateModalPump === p ? {
                                                bgcolor: '#1976d2', color: '#fff', boxShadow: '0 4px 14px rgba(25,118,210,0.4)',
                                            } : {
                                                borderColor: 'rgba(255,255,255,0.3)', color: 'rgba(255,255,255,0.7)',
                                                '&:hover': { borderColor: '#fff', color: '#fff', bgcolor: 'rgba(255,255,255,0.08)' },
                                            }),
                                        }}
                                    >{p}</Button>
                                ))}
                            </Box>

                            {/* Rate input */}
                            <Typography variant="caption" fontWeight={800} sx={{ opacity: 0.7, letterSpacing: 0.5, mb: 1, display: 'block' }}>NEW RATE (₹ per Litre)</Typography>
                            <Box sx={{
                                display: 'flex', alignItems: 'center',
                                bgcolor: 'rgba(255,255,255,0.1)', borderRadius: '14px',
                                border: '1px solid rgba(255,255,255,0.25)',
                                px: 2, py: 1, mb: 1,
                            }}>
                                <Typography sx={{ opacity: 0.7, fontWeight: 700, mr: 1, fontSize: 20 }}>₹</Typography>
                                <input
                                    type="number"
                                    value={fuelRateModalValue}
                                    onChange={e => setFuelRateModalValue(e.target.value)}
                                    style={{
                                        background: 'transparent', border: 'none', outline: 'none',
                                        color: '#fff', fontSize: '28px', fontWeight: 900, width: '100%',
                                    }}
                                    placeholder="0"
                                    step="0.5"
                                    min="1"
                                    autoFocus
                                />
                                <Typography sx={{ opacity: 0.5, fontWeight: 700, fontSize: 16 }}>/L</Typography>
                            </Box>

                            {/* Change preview */}
                            {(() => {
                                const prev = fuelRates[fuelRateModalPump] ?? 90;
                                const next = parseFloat(fuelRateModalValue);
                                const diff = isNaN(next) ? 0 : next - prev;
                                const color = diff > 0 ? '#f87171' : diff < 0 ? '#34d399' : 'rgba(255,255,255,0.4)';
                                const sign = diff > 0 ? '+' : '';
                                return (
                                    <Box display="flex" justifyContent="space-between" alignItems="center"
                                        sx={{ bgcolor: 'rgba(255,255,255,0.06)', borderRadius: '10px', px: 2, py: 1 }}>
                                        <Typography variant="caption" sx={{ opacity: 0.6, fontWeight: 700 }}>Current: ₹{prev}/L</Typography>
                                        {diff !== 0 && (
                                            <Typography variant="caption" fontWeight={900} sx={{ color }}>
                                                {sign}{diff.toFixed(2)} ₹/L {diff > 0 ? '↑ increase' : '↓ decrease'}
                                            </Typography>
                                        )}
                                        {diff === 0 && (
                                            <Typography variant="caption" sx={{ opacity: 0.4, fontWeight: 700 }}>No change</Typography>
                                        )}
                                    </Box>
                                );
                            })()}
                        </DialogContent>

                        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1.5 }}>
                            <Button
                                onClick={() => setFuelRateModalOpen(false)}
                                sx={{ borderRadius: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.6)', '&:hover': { color: '#fff' } }}
                            >Cancel</Button>
                            <Button
                                variant="contained"
                                disabled={(fuelRateSaving || {})[fuelRateModalPump]}
                                onClick={async () => {
                                    const pump = fuelRateModalPump;
                                    const rateVal = parseFloat(fuelRateModalValue);
                                    if (isNaN(rateVal) || rateVal <= 0) {
                                        setSnack({ msg: 'Enter a valid positive rate', sev: 'error' }); return;
                                    }
                                    setFuelRateSaving(p => ({ ...p, [pump]: true }));
                                    try {
                                        const token = localStorage.getItem('token');
                                        await axios.put(`${API_URL}/pump-payment/fuel-rates`, { pumpName: pump, rate: rateVal }, { headers: { Authorization: `Bearer ${token}` } });
                                        setFuelRates(p => ({ ...p, [pump]: rateVal }));
                                        setFuelRateEdits(p => ({ ...p, [pump]: String(rateVal) }));
                                        setSnack({ msg: `${pump} rate updated to ₹${rateVal}/L`, sev: 'success' });
                                        setFuelRateModalOpen(false);
                                    } catch (e) {
                                        setSnack({ msg: e.response?.data?.error || 'Failed to save', sev: 'error' });
                                    } finally {
                                        setFuelRateSaving(p => ({ ...p, [pump]: false }));
                                    }
                                }}
                                sx={{
                                    borderRadius: '12px', px: 4, fontWeight: 900,
                                    background: 'linear-gradient(45deg, #1565c0, #1976d2)',
                                    boxShadow: '0 8px 20px rgba(25,118,210,0.4)',
                                    '&:hover': { boxShadow: '0 12px 28px rgba(25,118,210,0.5)' },
                                }}
                            >
                                {(fuelRateSaving || {})[fuelRateModalPump] ? 'Saving...' : 'Save Rate'}
                            </Button>
                        </DialogActions>
                    </Dialog>

                    {/* ── Slips List ──────────────────────────────────────── */}
                    <Dialog open={vaultModalOpen} fullScreen onClose={() => setVaultModalOpen(false)}>
                        <DialogTitle sx={{ m: 0, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="h6" fontWeight="bold">Invoices & Slips - Management</Typography>
                            <Button onClick={() => setVaultModalOpen(false)} color="error">Close</Button>
                        </DialogTitle>
                        <DialogContent dividers sx={{ backgroundColor: '#f5f7f9' }}>
                            {/* Panel header */}
                            <Box display="flex" alignItems="center" gap={2} mb={3} sx={{ flexWrap: 'wrap' }}>
                                <Box sx={{
                                    backgroundColor: 'primary.main',
                                    color: '#fff',
                                    p: 1.5,
                                    borderRadius: 3,
                                    boxShadow: '0 8px 16px rgba(26,115,232,0.2)'
                                }}>
                                    <DescriptionIcon />
                                </Box>
                                <Box>
                                    <Typography variant="h5" fontWeight="900" sx={{ letterSpacing: '-0.5px' }}>Slips Management</Typography>
                                    <Typography variant="caption" color="text.secondary" fontWeight={700}>System health: Optimized</Typography>
                                </Box>
                                <Chip
                                    label={`${invoices.length} Total Records`}
                                    size="medium"
                                    sx={{ ml: { xs: 0, sm: 'auto' }, fontWeight: 900, borderRadius: 2, bgcolor: '#f0f6ff', color: '#1a73e8', border: '1px solid rgba(26,115,232,0.1)' }}
                                />
                                <TablePagination
                                    component="div"
                                    count={invoices.length}
                                    page={page}
                                    onPageChange={handleChangePage}
                                    rowsPerPage={rowsPerPage}
                                    onRowsPerPageChange={handleChangeRowsPerPage}
                                    rowsPerPageOptions={[10, 20, 50, 100]}
                                    sx={{ borderBottom: 'none', '.MuiTablePagination-toolbar': { minHeight: 40, p: 0 } }}
                                />
                            </Box>

                            {/* ── Selection toolbar ── */}
                            {selectedIds.size > 0 && (
                                <Box sx={{
                                    display: 'flex', alignItems: 'center', gap: 2,
                                    px: 2, py: 1.2, mb: 2, borderRadius: 2,
                                    background: 'linear-gradient(90deg,#1a73e8,#4285f4)',
                                    color: '#fff', boxShadow: '0 4px 14px rgba(26,115,232,0.3)',
                                }}>
                                    <Checkbox
                                        checked={allSelected}
                                        indeterminate={someSelected}
                                        onChange={toggleSelectAll}
                                        sx={{ color: '#fff', '&.Mui-checked': { color: '#fff' }, '&.MuiCheckbox-indeterminate': { color: '#fff' }, p: 0.5 }}
                                    />
                                    <Typography fontWeight="700" sx={{ flex: 1 }}>
                                        {selectedIds.size} invoice{selectedIds.size > 1 ? 's' : ''} selected
                                    </Typography>
                                    <Button
                                        variant="contained"
                                        size="small"
                                        startIcon={<DeleteIcon />}
                                        onClick={() => setBulkConfirm(true)}
                                        sx={{ background: '#d32f2f', '&:hover': { background: '#b71c1c' }, borderRadius: 2, fontWeight: 700 }}>
                                        Delete Selected
                                    </Button>
                                    <Button size="small" onClick={() => setSelectedIds(new Set())}
                                        sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.5)', border: '1px solid', borderRadius: 2 }}>
                                        Cancel
                                    </Button>
                                </Box>
                            )}

                            {/* Select All row when nothing selected yet */}
                            {selectedIds.size === 0 && invoices.length > 0 && (
                                <Box display="flex" alignItems="center" mb={1} sx={{ px: 1 }}>
                                    <Tooltip title="Select all">
                                        <Checkbox
                                            checked={false}
                                            onChange={toggleSelectAll}
                                            size="small"
                                        />
                                    </Tooltip>
                                    <Typography variant="caption" color="text.secondary">Select all</Typography>
                                </Box>
                            )}
                            {loading ? (
                                <Box display="flex" justifyContent="center" py={10}><CircularProgress /></Box>
                            ) : invoices.length === 0 ? (
                                <Card sx={{ borderRadius: 3, p: 6, textAlign: 'center', opacity: 0.5 }}>
                                    <DescriptionIcon sx={{ fontSize: 56, mb: 1 }} />
                                    <Typography variant="h6">No records in the vault</Typography>
                                    <Typography variant="body2">Slips will appear here once uploaded and approved.</Typography>
                                </Card>
                            ) : (
                                <Box display="flex" flexDirection="column" gap={2}>
                                    {invoices.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((inv, idx) => {
                                        const invNo = getField(inv, 'human_verified_data.invoice_details.invoice_number', 'ai_data.invoice_data.invoice_details.invoice_number');
                                        const consignee = getField(inv, 'human_verified_data.consignee_details.consignee_name', 'ai_data.invoice_data.consignee_details.consignee_name');
                                        const vehicle = getField(inv, 'human_verified_data.supply_details.vehicle_number', 'ai_data.invoice_data.supply_details.vehicle_number');
                                        const buyer = getField(inv, 'human_verified_data.buyer_details.buyer_name', 'ai_data.invoice_data.buyer_details.buyer_name');
                                        const amount = getField(inv, 'human_verified_data.amount_summary.net_payable', 'ai_data.invoice_data.amount_summary.net_payable');
                                        const transporter = getField(inv, 'human_verified_data.supply_details.transporter_name', 'ai_data.invoice_data.supply_details.transporter_name');
                                        const lorry = getField(inv, 'human_verified_data.supply_details.lorrey_receipt_number', 'ai_data.invoice_data.supply_details.lorrey_receipt_number');
                                        const ewbNo = getField(inv, 'human_verified_data.ewb_details.ewb_number', 'ai_data.invoice_data.ewb_details.ewb_number');
                                        const ewbValid = getField(inv, 'human_verified_data.ewb_details.ewb_valid_date', 'ai_data.invoice_data.ewb_details.ewb_valid_date');
                                        const ewbCreateTime = getField(inv, 'human_verified_data.ewb_details.ewb_create_time', 'ai_data.invoice_data.ewb_details.ewb_create_time');
                                        const ewbValidTime = getField(inv, 'human_verified_data.ewb_details.ewb_valid_time', 'ai_data.invoice_data.ewb_details.ewb_valid_time');
                                        const date = new Date(inv.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                                        const isOpen = expanded === inv._id;
                                        const st = statusColor(inv.status);

                                        return (
                                            <Card key={inv._id} elevation={0} sx={{
                                                borderRadius: 3,
                                                border: selectedIds.has(inv._id) ? '1.5px solid #d32f2f' : isOpen ? '1.5px solid #1a73e8' : '1px solid #e8e8e8',
                                                boxShadow: isOpen ? '0 8px 30px rgba(26,115,232,0.08)' : '0 2px 8px rgba(0,0,0,0.02)',
                                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                                overflow: 'hidden',
                                                '&:hover': { boxShadow: '0 12px 40px rgba(0,0,0,0.06)', borderColor: '#4285f4' },
                                            }}>
                                                {/* ── Collapsed Row (click to expand) ── */}
                                                <Box
                                                    onClick={() => toggleExpand(inv._id)}
                                                    sx={{
                                                        p: { xs: 1.5, sm: 2 },
                                                        display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 2 },
                                                        cursor: 'pointer',
                                                        backgroundColor: selectedIds.has(inv._id) ? '#fff5f5' : isOpen ? '#f0f6ff' : '#fff',
                                                        transition: 'background 0.2s',
                                                        flexWrap: { xs: 'wrap', sm: 'nowrap' },
                                                    }}
                                                >
                                                    {/* Checkbox */}
                                                    <Checkbox
                                                        checked={selectedIds.has(inv._id)}
                                                        onClick={e => toggleSelect(inv._id, e)}
                                                        size="small"
                                                        sx={{ p: 0.5, flexShrink: 0, color: '#d32f2f', '&.Mui-checked': { color: '#d32f2f' } }}
                                                    />

                                                    {/* Invoice No */}
                                                    <Box sx={{ flex: '1 1 140px', minWidth: 0 }}>
                                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1 }}>Invoice No.</Typography>
                                                        <Typography fontWeight="700" sx={{ fontSize: { xs: '12px', sm: '14px' }, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {invNo || '---'}
                                                        </Typography>
                                                    </Box>

                                                    {/* Consignee */}
                                                    <Box sx={{ flex: '1 1 160px', minWidth: 0, display: { xs: 'none', sm: 'block' } }}>
                                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1 }}>Consignee</Typography>
                                                        <Typography sx={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{consignee || '---'}</Typography>
                                                    </Box>

                                                    {/* Vehicle */}
                                                    {vehicle && (
                                                        <Chip label={vehicle} size="small" variant="filled"
                                                            sx={{ fontWeight: '700', borderRadius: 1.5, px: 0.5, flexShrink: 0, display: { xs: 'none', md: 'flex' } }} />
                                                    )}

                                                    {/* Date */}
                                                    <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, display: { xs: 'none', sm: 'block' } }}>{date}</Typography>

                                                    {/* Status */}
                                                    <Chip label={st.label} color={st.color} size="small" variant="outlined" sx={{ flexShrink: 0 }} />

                                                    {/* Vault badge */}
                                                    {inv.softcopy_url && inv.s3_exists ? (
                                                        <Chip icon={<StorageIcon style={{ fontSize: 14 }} />} label="In Vault" size="small" sx={{ backgroundColor: '#e6f4ea', color: '#1e7e34', fontWeight: '700', flexShrink: 0 }} />
                                                    ) : (
                                                        <Chip label={inv.softcopy_url ? 'S3 MISSING' : 'NOT READY'} size="small"
                                                            sx={{ backgroundColor: inv.softcopy_url ? '#fff0f0' : '#f1f3f4', color: inv.softcopy_url ? '#c0392b' : '#888', fontWeight: '700', flexShrink: 0 }} />
                                                    )}

                                                    {/* Expand icon */}
                                                    <Box sx={{ flexShrink: 0, ml: 'auto' }}>
                                                        {isOpen ? <ExpandLessIcon sx={{ color: '#1a73e8' }} /> : <ExpandMoreIcon sx={{ color: '#aaa' }} />}
                                                    </Box>
                                                </Box>

                                                {/* ── Expanded Detail Panel ── */}
                                                <Collapse in={isOpen} unmountOnExit>
                                                    <Divider />
                                                    <Box sx={{ p: { xs: 2, sm: 3 }, backgroundColor: '#fafcff' }}>
                                                        <Grid container spacing={2}>

                                                            {/* Invoice Info */}
                                                            <Grid item xs={12} sm={6} md={4}>
                                                                <Box sx={{ p: 2, backgroundColor: '#fff', borderRadius: 2, border: '1px solid #e8eaed', height: '100%' }}>
                                                                    <Box display="flex" alignItems="center" gap={1} mb={1.5}>
                                                                        <ReceiptLongIcon sx={{ fontSize: 18, color: '#1a73e8' }} />
                                                                        <Typography variant="subtitle2" fontWeight="bold" color="primary">Invoice Details</Typography>
                                                                    </Box>
                                                                    <DetailRow label="Invoice No." value={invNo} />
                                                                    <DetailRow label="Date" value={date} />
                                                                    {lorry && <DetailRow label="LR No." value={lorry} />}
                                                                    {ewbNo && <DetailRow label="EWB No." value={ewbNo + (ewbCreateTime ? ` (${ewbCreateTime})` : '')} />}
                                                                    {ewbValid && <DetailRow label="EWB Valid" value={ewbValid + (ewbValidTime ? ` (${ewbValidTime})` : '')} />}
                                                                </Box>
                                                            </Grid>

                                                            {/* Party Info */}
                                                            <Grid item xs={12} sm={6} md={4}>
                                                                <Box sx={{ p: 2, backgroundColor: '#fff', borderRadius: 2, border: '1px solid #e8eaed', height: '100%' }}>
                                                                    <Box display="flex" alignItems="center" gap={1} mb={1.5}>
                                                                        <PersonIcon sx={{ fontSize: 18, color: '#34a853' }} />
                                                                        <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#34a853' }}>Party Details</Typography>
                                                                    </Box>
                                                                    {buyer && <DetailRow label="Buyer" value={buyer} />}
                                                                    {consignee && <DetailRow label="Consignee" value={consignee} />}
                                                                </Box>
                                                            </Grid>

                                                            {/* Transport & Amount */}
                                                            <Grid item xs={12} sm={6} md={4}>
                                                                <Box sx={{ p: 2, backgroundColor: '#fff', borderRadius: 2, border: '1px solid #e8eaed', height: '100%' }}>
                                                                    <Box display="flex" alignItems="center" gap={1} mb={1.5}>
                                                                        <LocalShippingIcon sx={{ fontSize: 18, color: '#f4511e' }} />
                                                                        <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#f4511e' }}>Transport &amp; Amount</Typography>
                                                                    </Box>
                                                                    {vehicle && <DetailRow label="Vehicle" value={vehicle} />}
                                                                    {transporter && <DetailRow label="Transporter" value={transporter} />}
                                                                    {amount && (
                                                                        <Box display="flex" alignItems="center" gap={0.5} mt={1.5} sx={{ backgroundColor: '#e8f0fe', borderRadius: 2, p: 1 }}>
                                                                            <CurrencyRupeeIcon sx={{ fontSize: 16, color: '#1a73e8' }} />
                                                                            <Typography variant="body2" fontWeight="900" color="primary">{amount}</Typography>
                                                                        </Box>
                                                                    )}
                                                                </Box>
                                                            </Grid>

                                                        </Grid>

                                                        {/* ── Unified Document Hub ── */}
                                                        <Box sx={{ mt: 3, width: '100%' }}>
                                                            <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 900, mb: 1.5, display: 'block', letterSpacing: 1 }}>
                                                                Document Hub — Select Copy to Download
                                                            </Typography>

                                                            <Box sx={{
                                                                display: 'flex',
                                                                gap: 2,
                                                                overflowX: 'auto',
                                                                pb: 2,
                                                                '::-webkit-scrollbar': { height: '6px' },
                                                                '::-webkit-scrollbar-thumb': { backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: '10px' }
                                                            }}>
                                                                {[
                                                                    { id: 'invoice_hard', label: 'Invoice Hardcopy', icon: <DescriptionIcon />, url: inv.file_url, ready: !!inv.file_url },
                                                                    { id: 'invoice_soft', label: 'Invoice Softcopy', icon: <ReceiptLongIcon />, url: inv.softcopy_url, ready: inv.softcopy_url && inv.s3_exists },
                                                                    { id: 'gcn_soft', label: 'GCN Softcopy', icon: <AssignmentIcon />, url: inv.gcn_url, ready: !!inv.gcn_url },
                                                                    { id: 'lorry_soft', label: 'Lorry Slip Softcopy', icon: <ReceiptIcon />, url: inv.lorry_hire_slip_data?.lorry_hire_slip_url, ready: !!inv.lorry_hire_slip_data?.lorry_hire_slip_url },
                                                                    { id: 'fuel_soft', label: 'Fuel Slip Softcopy', icon: <LocalGasStationIcon />, url: inv.lorry_hire_slip_data?.fuel_slip_url, ready: !!inv.lorry_hire_slip_data?.fuel_slip_url },
                                                                    { id: 'advance_fuel_slip', label: 'Advance Fuel Slip', icon: <LocalGasStationIcon />, url: inv.lorry_hire_slip_data?.advance_fuel_slip_url, ready: !!inv.lorry_hire_slip_data?.advance_fuel_slip_url }
                                                                ].map((doc) => {
                                                                    const isActive = (selectedDocTypes[inv._id] || 'invoice_soft') === doc.id;
                                                                    return (
                                                                        <Box
                                                                            key={doc.id}
                                                                            onClick={() => doc.ready && setSelectedDocTypes(prev => ({ ...prev, [inv._id]: doc.id }))}
                                                                            sx={{
                                                                                flex: '0 0 160px',
                                                                                p: 2,
                                                                                borderRadius: 3,
                                                                                cursor: doc.ready ? 'pointer' : 'default',
                                                                                border: '2px solid',
                                                                                borderColor: isActive ? '#1a73e8' : 'rgba(0,0,0,0.05)',
                                                                                background: isActive ? 'linear-gradient(135deg, #ffffff 0%, #f0f6ff 100%)' : doc.ready ? '#fff' : '#f9f9f9',
                                                                                boxShadow: isActive ? '0 8px 20px rgba(26,115,232,0.15)' : 'none',
                                                                                transition: 'all 0.2s ease',
                                                                                opacity: doc.ready ? 1 : 0.5,
                                                                                position: 'relative',
                                                                                '&:hover': doc.ready ? { borderColor: '#1a73e8', transform: 'translateY(-2px)' } : {}
                                                                            }}
                                                                        >
                                                                            <Box sx={{ color: isActive ? '#1a73e8' : 'text.secondary', mb: 1, display: 'flex', alignItems: 'center' }}>
                                                                                {doc.icon}
                                                                            </Box>
                                                                            <Typography variant="body2" fontWeight={isActive ? 800 : 500} sx={{ lineHeight: 1.2, mb: 0.5 }}>
                                                                                {doc.label}
                                                                            </Typography>
                                                                            {isActive && (
                                                                                <Chip label="Selected" size="small" sx={{ height: 16, fontSize: '9px', fontWeight: 900, bgcolor: '#1a73e8', color: '#fff' }} />
                                                                            )}
                                                                            {!doc.ready && (
                                                                                <Chip label={doc.id === 'advance_fuel_slip' ? 'Not Generated' : 'Not Ready'} size="small" variant="outlined" sx={{ height: 16, fontSize: '9px', fontWeight: 700 }} />
                                                                            )}
                                                                        </Box>
                                                                    );
                                                                })}
                                                            </Box>

                                                            {/* Consolidated Actions */}
                                                            <Box display="flex" sx={{
                                                                flexDirection: { xs: 'column', md: 'row' },
                                                                alignItems: { xs: 'stretch', md: 'center' },
                                                                gap: { xs: 2.5, md: 2 }, mt: 2, p: 2,
                                                                bgcolor: 'rgba(26,115,232,0.04)', borderRadius: '16px',
                                                                border: '1px solid rgba(26,115,232,0.08)'
                                                            }}>
                                                                <Box sx={{ flex: 1, textAlign: { xs: 'center', md: 'left' } }}>
                                                                    <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ letterSpacing: 1 }}>CURRENTLY ACTIVE:</Typography>
                                                                    <Typography variant="body1" fontWeight={900} color="primary" sx={{ fontSize: '1.1rem' }}>
                                                                        {(selectedDocTypes[inv._id] || 'invoice_soft').replace(/_/g, ' ').toUpperCase()}
                                                                    </Typography>
                                                                </Box>

                                                                <Box display="flex" sx={{
                                                                    gap: 1.5,
                                                                    flexWrap: 'wrap',
                                                                    justifyContent: { xs: 'center', md: 'flex-end' },
                                                                    width: { xs: '100%', md: 'auto' }
                                                                }}>
                                                                    {/* Secondary Actions (Generation Flow) */}
                                                                    {!inv.lorry_hire_slip_data?.lorry_hire_slip_url && (
                                                                        <Button variant="outlined" size="small" color="warning" onClick={() => onOpenLorrySlip(inv._id)}
                                                                            sx={{ borderRadius: 2.5, px: 2, fontWeight: 700, flex: { xs: '1 1 100%', sm: '1 1 auto', md: 'none' }, py: 1 }}>
                                                                            Create Lorry Slip
                                                                        </Button>
                                                                    )}
                                                                    {inv.lorry_hire_slip_data?.lorry_hire_slip_url && !inv.lorry_hire_slip_data?.fuel_slip_url && (
                                                                        <Button variant="outlined" size="small" color="secondary" onClick={() => onOpenFuelSlip(inv._id)}
                                                                            sx={{ borderRadius: 2.5, px: 2, fontWeight: 700, flex: { xs: '1 1 100%', sm: '1 1 auto', md: 'none' }, py: 1 }}>
                                                                            Create Fuel Slip
                                                                        </Button>
                                                                    )}

                                                                    {(() => {
                                                                        const sel = selectedDocTypes[inv._id] || 'invoice_soft';
                                                                        const isSelectedReady = isDocReady(inv, sel);
                                                                        return (
                                                                            <>
                                                                                <Button
                                                                                    disabled={!isSelectedReady}
                                                                                    variant="contained"
                                                                                    startIcon={<VisibilityIcon />}
                                                                                    component="a"
                                                                                    target="_blank"
                                                                                    href={isSelectedReady ? (() => {
                                                                                        if (sel === 'invoice_hard') return inv.file_url;
                                                                                        if (sel === 'invoice_soft') return inv.softcopy_url;
                                                                                        if (sel === 'gcn_soft') return inv.gcn_url;
                                                                                        if (sel === 'lorry_soft') return inv.lorry_hire_slip_data?.lorry_hire_slip_url;
                                                                                        if (sel === 'fuel_soft') return inv.lorry_hire_slip_data?.fuel_slip_url;
                                                                                        if (sel === 'advance_fuel_slip') return inv.lorry_hire_slip_data?.advance_fuel_slip_url;
                                                                                    })() : undefined}
                                                                                    sx={{ borderRadius: 2.5, px: 2.5, fontWeight: 700, flex: { xs: '1 1 100%', sm: '1 1 auto', md: 'none' }, py: 1, background: 'linear-gradient(45deg, #1a237e, #3949ab)', textTransform: 'none' }}
                                                                                >
                                                                                    View
                                                                                </Button>

                                                                                {user?.role === 'HEAD_OFFICE' && (
                                                                                    <Button
                                                                                        variant="contained"
                                                                                        startIcon={<AddIcon />}
                                                                                        onClick={() => handleOpenCreateAdvanceFuelSlip(inv)}
                                                                                        sx={{
                                                                                            borderRadius: 2.5,
                                                                                            px: 2.5,
                                                                                            fontWeight: 700,
                                                                                            flex: { xs: '1 1 100%', sm: '1 1 auto', md: 'none' },
                                                                                            py: 1,
                                                                                            background: 'linear-gradient(45deg, #1565c0, #1976d2)',
                                                                                            textTransform: 'none'
                                                                                        }}
                                                                                    >
                                                                                        Create Advance Fuel Slip
                                                                                    </Button>
                                                                                )}

                                                                                <Button
                                                                                    disabled={!isSelectedReady}
                                                                                    variant="contained"
                                                                                    startIcon={<PrintIcon />}
                                                                                    onClick={() => {
                                                                                        let url = '';
                                                                                        if (sel === 'invoice_hard') url = inv.file_url;
                                                                                        if (sel === 'invoice_soft') url = inv.softcopy_url;
                                                                                        if (sel === 'gcn_soft') url = inv.gcn_url;
                                                                                        if (sel === 'lorry_soft') url = inv.lorry_hire_slip_data?.lorry_hire_slip_url;
                                                                                        if (sel === 'fuel_soft') url = inv.lorry_hire_slip_data?.fuel_slip_url;
                                                                                        if (sel === 'advance_fuel_slip') url = inv.lorry_hire_slip_data?.advance_fuel_slip_url;
                                                                                        if (url) {
                                                                                            const printWin = window.open(url, '_blank');
                                                                                            printWin.onload = () => printWin.print();
                                                                                        }
                                                                                    }}
                                                                                    sx={{ borderRadius: 2.5, px: 2.5, fontWeight: 700, flex: { xs: '1 1 100%', sm: '1 1 auto', md: 'none' }, py: 1, background: 'linear-gradient(45deg, #455a64, #78909c)', textTransform: 'none' }}
                                                                                >
                                                                                    Print
                                                                                </Button>

                                                                                <Button
                                                                                    disabled={!isSelectedReady}
                                                                                    variant="contained"
                                                                                    startIcon={<DownloadIcon />}
                                                                                    onClick={async () => {
                                                                                        let url = '';
                                                                                        if (sel === 'invoice_hard') url = inv.file_url;
                                                                                        else if (sel === 'invoice_soft') url = inv.softcopy_url;
                                                                                        else if (sel === 'gcn_soft') url = inv.gcn_url;
                                                                                        else if (sel === 'lorry_soft') url = inv.lorry_hire_slip_data?.lorry_hire_slip_url;
                                                                                        else if (sel === 'fuel_soft') url = inv.lorry_hire_slip_data?.fuel_slip_url;
                                                                                        else if (sel === 'advance_fuel_slip') url = inv.lorry_hire_slip_data?.advance_fuel_slip_url;

                                                                                        if (!url) return;
                                                                                        const ext = url.split('?')[0].split('.').pop().toLowerCase() || 'pdf';
                                                                                        const fileName = `${sel}_${invNo}.${ext}`;

                                                                                        try {
                                                                                            const proxyUrl = `${API_URL}/invoice/download-proxy?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(fileName)}`;

                                                                                            const token = localStorage.getItem('token');
                                                                                            const response = await axios({
                                                                                                url: proxyUrl,
                                                                                                method: 'GET',
                                                                                                headers: { 'Authorization': `Bearer ${token}` },
                                                                                                responseType: 'blob'
                                                                                            });

                                                                                            const blob = response.data;
                                                                                            const blobUrl = window.URL.createObjectURL(blob);
                                                                                            const link = document.createElement('a');
                                                                                            link.href = blobUrl;
                                                                                            link.download = fileName;
                                                                                            document.body.appendChild(link);
                                                                                            link.click();
                                                                                            link.remove();
                                                                                            window.URL.revokeObjectURL(blobUrl);
                                                                                        } catch (e) {
                                                                                            console.error('Download failed:', e);
                                                                                            const msg = e.response?.data?.error || e.message;
                                                                                            setSnack({ type: 'error', message: 'Download failed: ' + msg });
                                                                                        }
                                                                                    }}
                                                                                    sx={{ borderRadius: 2.5, px: 2.5, fontWeight: 800, flex: { xs: '1 1 100%', sm: '1 1 auto', md: 'none' }, py: 1, background: 'linear-gradient(45deg, #1a73e8, #4285f4)', textTransform: 'none' }}
                                                                                >
                                                                                    Download
                                                                                </Button>
                                                                            </>
                                                                        );
                                                                    })()}

                                                                    <IconButton color="error" onClick={() => setDeleteTarget(inv)}
                                                                        sx={{
                                                                            ml: { xs: 0, md: 1 },
                                                                            border: '1px solid rgba(211,47,47,0.15)',
                                                                            borderRadius: 2.5, flexShrink: 0,
                                                                            bgcolor: 'rgba(211,47,47,0.02)',
                                                                            '&:hover': { bgcolor: 'rgba(211,47,47,0.08)' }
                                                                        }}>
                                                                        <DeleteIcon fontSize="small" />
                                                                    </IconButton>
                                                                </Box>
                                                            </Box>
                                                        </Box>
                                                    </Box>
                                                </Collapse>
                                            </Card>
                                        );
                                    })}
                                </Box>
                            )}

                            <Box sx={{ mt: 3, textAlign: 'center' }}>

                                <Typography variant="caption" color="text.secondary">
                                    {invoices.length} records stored in your secure AWS S3 Cloud Instance.
                                </Typography>
                            </Box>
                        </DialogContent>
                    </Dialog>
                </Box>
            </Container>

            {/* ── Delete confirmation dialog ── */}
            <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
                <DialogTitle sx={{ color: '#d32f2f', fontWeight: 700 }}>⚠ Delete Invoice?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        This will permanently delete invoice <strong>{deleteTarget?.human_verified_data?.invoice_details?.invoice_number || deleteTarget?.ai_data?.invoice_data?.invoice_details?.invoice_number || deleteTarget?._id}</strong> and its associated files from S3. This action cannot be undone.
                    </DialogContentText>
                </DialogContent>
                <DialogActions sx={{ pb: 2, px: 3 }}>
                    <Button onClick={() => setDeleteTarget(null)} variant="outlined" disabled={deleting}>Cancel</Button>
                    <Button
                        onClick={handleDeleteConfirm}
                        variant="contained"
                        color="error"
                        disabled={deleting}
                        startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : <DeleteIcon />}>
                        {deleting ? 'Deleting…' : 'Yes, Delete'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* ── Bulk delete confirmation dialog ── */}
            <Dialog open={bulkConfirm} onClose={() => setBulkConfirm(false)}>
                <DialogTitle sx={{ color: '#d32f2f', fontWeight: 700 }}>⚠ Delete {selectedIds.size} Invoice{selectedIds.size > 1 ? 's' : ''}?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        This will permanently delete <strong>{selectedIds.size} selected invoice{selectedIds.size > 1 ? 's' : ''}</strong> and all associated S3 files. This cannot be undone.
                    </DialogContentText>
                </DialogContent>
                <DialogActions sx={{ pb: 2, px: 3 }}>
                    <Button onClick={() => setBulkConfirm(false)} variant="outlined" disabled={deleting}>Cancel</Button>
                    <Button
                        onClick={handleBulkDelete}
                        variant="contained"
                        color="error"
                        disabled={deleting}
                        startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : <DeleteIcon />}>
                        {deleting ? 'Deleting…' : `Yes, Delete ${selectedIds.size}`}
                    </Button>
                </DialogActions>
            </Dialog>
            {/* ── Voucher Dialog ── */}
            <VoucherDialog
                open={voucherDialogOpen}
                initialTab={voucherDialogTab}
                onClose={() => setVoucherDialogOpen(false)}
                onVoucherCreated={() => fetchVouchers()}
            />

            {/* ── Truck Contact Manager Dialog ── */}
            <TruckContactManager
                open={truckManagerOpen}
                onClose={() => setTruckManagerOpen(false)}
            />

            {/* ── Create Advance Fuel Slip Dialog ── */}
            <Dialog open={createAdvanceFuelSlipOpen} onClose={() => setCreateAdvanceFuelSlipOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ fontWeight: 800 }}>Create Advance Fuel Slip</DialogTitle>
                <DialogContent dividers>
                    <Grid container spacing={2}>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                label="Address"
                                fullWidth
                                variant="outlined"
                                InputProps={{ readOnly: true }}
                                value="Panagarh"
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                label="Date"
                                type="date"
                                fullWidth
                                variant="outlined"
                                InputLabelProps={{ shrink: true }}
                                value={advanceFuelFormData.date || ''}
                                onChange={(e) => setAdvanceFuelFormData(prev => ({ ...prev, date: e.target.value }))}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                label="Advance Slip No."
                                fullWidth
                                variant="outlined"
                                value={advanceFuelFormData.hsdSlipNo}
                                onChange={(e) => setAdvanceFuelFormData(prev => ({ ...prev, hsdSlipNo: e.target.value }))}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                label="Fuel Slip No."
                                fullWidth
                                variant="outlined"
                                InputProps={{ readOnly: true }}
                                value={advanceFuelFormData.fuelSlipNo}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                label="Vehicle No"
                                fullWidth
                                variant="outlined"
                                InputProps={{ readOnly: true }}
                                value={advanceFuelFormData.vehicleNo}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                label="Driver Name"
                                fullWidth
                                variant="outlined"
                                required={advanceFuelFormData.isDriverNameEditable}
                                InputProps={{ readOnly: !advanceFuelFormData.isDriverNameEditable }}
                                placeholder={advanceFuelFormData.isDriverNameEditable ? "Enter Driver Name" : undefined}
                                value={advanceFuelFormData.driverName}
                                onChange={advanceFuelFormData.isDriverNameEditable ? (e) => setAdvanceFuelFormData(prev => ({ ...prev, driverName: e.target.value })) : undefined}
                                helperText={advanceFuelFormData.isDriverNameEditable ? "Driver Name not found. Please enter it manually." : undefined}
                                FormHelperTextProps={{ style: { color: '#d32f2f' } }}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                label="Diesel Qty (Litres)"
                                fullWidth
                                variant="outlined"
                                type="number"
                                value={advanceFuelFormData.qty}
                                onChange={(e) => {
                                    const qtyVal = e.target.value;
                                    setAdvanceFuelFormData(prev => ({
                                        ...prev,
                                        qty: qtyVal
                                    }));
                                }}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                label="Loading Advance"
                                fullWidth
                                variant="outlined"
                                type="number"
                                value={advanceFuelFormData.loadingAdvance}
                                onChange={(e) => {
                                    const laVal = e.target.value;
                                    setAdvanceFuelFormData(prev => {
                                        const loadingAdv = parseFloat(laVal) || 0;
                                        return {
                                            ...prev,
                                            loadingAdvance: laVal,
                                            totalAdvance: loadingAdv
                                        };
                                    });
                                }}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ bgcolor: 'rgba(26,115,232,0.04)', p: 2, borderRadius: 2, border: '1px solid rgba(26,115,232,0.08)' }}>
                                <Typography variant="subtitle1" fontWeight="bold">Total Calculated Advance:</Typography>
                                <Typography variant="h6" fontWeight="bold" color="primary">₹{Number(advanceFuelFormData.totalAdvance || 0).toFixed(2)}</Typography>
                            </Box>
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions sx={{ p: 2, px: 3 }}>
                    <Button onClick={() => setCreateAdvanceFuelSlipOpen(false)} variant="outlined" disabled={savingAdvanceSlip}>Cancel</Button>
                    <Button
                        onClick={handleSaveAdvanceFuelSlip}
                        variant="contained"
                        disabled={
                            savingAdvanceSlip || 
                            !advanceFuelFormData.qty || 
                            !advanceFuelFormData.hsdSlipNo || 
                            !advanceFuelFormData.fuelSlipNo || 
                            advanceFuelFormData.fuelSlipNo === 'Fuel Slip Not Generated' || 
                            advanceFuelFormData.fuelSlipNo === 'Not Available' ||
                            (advanceFuelFormData.isDriverNameEditable && !advanceFuelFormData.driverName.trim())
                        }
                        startIcon={savingAdvanceSlip ? <CircularProgress size={16} color="inherit" /> : <AddIcon />}
                    >
                        {savingAdvanceSlip ? 'Generating...' : 'Save & Generate'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Hidden Advance Fuel Slip Document for PDF Generation */}
            {createAdvanceFuelSlipOpen && advanceFuelSlipTarget && (
                <Box sx={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
                    <AdvanceFuelSlipDocument
                        ref={advanceFuelSlipRef}
                        data={advanceFuelSlipTarget}
                        fuelData={advanceFuelFormData}
                        hsdSlipNo={advanceFuelFormData.hsdSlipNo}
                        slipDate={advanceFuelFormData.date ? advanceFuelFormData.date.split('-').reverse().join('/') : new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        amountWords={toIndianWords(Number(advanceFuelFormData.totalAdvance || 0))}
                        qrPayload={JSON.stringify({
                            slipNo: advanceFuelFormData.hsdSlipNo,
                            invoiceId: advanceFuelSlipTarget._id,
                            vehicleNo: advanceFuelFormData.vehicleNo,
                            totalAdvance: advanceFuelFormData.totalAdvance
                        })}
                    />
                </Box>
            )}

            {/* ── Snackbar for Download Errors ── */}
            <Snackbar open={!!snack} autoHideDuration={5000} onClose={() => setSnack(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
                <Alert severity={snack?.sev || snack?.type || 'info'} variant="filled" onClose={() => setSnack(null)} sx={{ borderRadius: '14px', fontWeight: 700 }}>
                    {snack?.msg || snack?.message}
                </Alert>
            </Snackbar>

            {/* ── Hidden PDF Regenerators (triggered by fuel rate changes) ── */}
            {regenQueue.map(invoiceId => (
                <AutoPdfRegenerator
                    key={invoiceId}
                    invoiceId={invoiceId}
                    onComplete={(ok) => {
                        setRegenQueue(prev => prev.filter(id => id !== invoiceId));
                        if (ok) setSnack({ msg: `✅ Slip PDF updated for invoice ${invoiceId.slice(-6)}`, sev: 'success' });
                    }}
                />
            ))}
        </>
    );
};

// Small helper component for detail rows in expanded panel
const DetailRow = ({ label, value }) => (
    value ? (
        <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={0.8} sx={{ gap: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, lineHeight: 1.5 }}>{label}</Typography>
            <Typography variant="caption" fontWeight="600" sx={{ textAlign: 'right', lineHeight: 1.5, wordBreak: 'break-word' }}>{value}</Typography>
        </Box>
    ) : null
);

export default Dashboard;
