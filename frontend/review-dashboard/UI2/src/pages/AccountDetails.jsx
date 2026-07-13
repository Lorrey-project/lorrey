import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  Box, Button, CircularProgress, Typography, IconButton,
  Snackbar, Alert, Chip, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions,
  Autocomplete, TextField, Divider, LinearProgress,
  TableContainer, Table, TableHead, TableRow, TableCell, TableBody, Checkbox
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import UploadIcon from '@mui/icons-material/Upload';
import AddIcon from '@mui/icons-material/Add';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import axios from 'axios';
import { io } from 'socket.io-client';
import { exportToCsv } from '../utils/exportCsv';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const SOCKET_URL = import.meta.env.VITE_SOCKET_IO_URL || '/';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const currentYear = new Date().getFullYear();
const YEARS = Array.from({length: 10}, (_, i) => String(currentYear - 5 + i));

// Columns configuration
const COLUMNS = [
  { key: 'Transaction Date', label: 'TRANSACTION\nDATE', width: 140, isDate: true },
  { key: 'Ledger Name', label: 'LEDGER\nNAME', width: 180 },
  { key: 'Month', label: 'MONTH', width: 140 },
  { key: 'Names', label: 'NAMES', width: 160 },
  { key: 'Vehicle', label: 'VEHICLE', width: 150 },
  { key: 'Particulars', label: 'PARTICULARS', width: 220 },
  { key: 'Remarks', label: 'REMARKS', width: 800 },
  { key: 'Reference No', label: 'REFERENCE\nNO', width: 140 },
  { key: 'Cheque No', label: 'CHEQUE\nNO', width: 140 },
  { key: 'Withdraw', label: 'WITHDRAW', width: 130 },
  { key: 'Deposit', label: 'DEPOSIT', width: 130 },
  { key: 'Closing Balance', label: 'CLOSING\nBALANCE', width: 140 },
  { key: 'Remittance Copy', label: 'REMITTANCE\nCOPY', width: 150 },
];

const LEDGER_OPTIONS = [
  "CA charges", "Capital investment", "Capital investment refund", "Challan Sign",
  "Employee P Tax", "Endhan Cash Back", "Fasttag payment", "Freight Advance",
  "Freight payment", "Freight Payment Refund", "GST Paid", "interest Paid",
  "ITR return", "Main cash", "Office Exp", "Partner Interest", "Partner Salary",
  "Payment recived", "Printing&stationary", "Pump payment", "Room rent",
  "Salary Advance", "Staff Salary", "subscription", "TDS on Cash Withdrawl",
  "Tds Payment", "Toll Payment"
];

const NAMES_OPTIONS = [
  "Abhijit Ghosh", "Animesh Banerjee", "Animesh mukherjee", "Arobindo Roy",
  "Arup Mondol", "Avijit Gorai", "Bablu Bar", "Bhola Yadav", "Biplab Goswami",
  "Bithi Nayak", "Challan Sign", "DAC GST paid", "Dilip Panja", "Dipali Nayak",
  "Dipali Association", "Endhaan Cash Book", "Fasttag Payment", "Gorachand Dutta",
  "Goutam Kumar roy", "Haradhan Mondal", "Indranil Ray", "Interest paid",
  "ITR retund", "Jayanta maji", "Kanika nayak", "Kush Singh", "Main Cash",
  "Manas Sarkar", "Manoj Modak", "Md Faiyaz Alam", "Mir Ahasan Ali", "NVCL",
  "NVL", "Office Exp.", "Pbd Associations", "Prasanta Maji",
  "Printing & Stationary", "Ragunath guin", "Room Rent", "Ruhul Sk",
  "Sajal Banerjee", "satyanarayan Ghosh", "Sekh mustafa", "Suvadip Konar",
  "Sonthalia Pump", "Sourav Ghosh", "Subscription", "Suman Ghosh",
  "Supriyo Das CA charges", "Suraj Singh", "Swarup Bhowal", "Tapas Maji",
  "TDS on CashWithdrawl", "TDS Payment", "Tushar Kanti Mondal", "Uday Malik",
  "Uttam Roy"
];

const AUTO_COLS = new Set(['Transaction Date', 'Remarks', 'Reference No', 'Cheque No', 'Withdraw', 'Deposit', 'Closing Balance']);
const MANUAL_COLS = new Set(['Ledger Name', 'Month', 'Names', 'Vehicle', 'Particulars']);


const RAW_EXCEL_HEADER_MAP = {
  // Transaction Date
  'transaction date': 'Transaction Date', 'date': 'Transaction Date', 'txn date': 'Transaction Date', 'value date': 'Transaction Date', 'tran date': 'Transaction Date', 'trans date': 'Transaction Date', 'booking date': 'Transaction Date', 'narration date': 'Transaction Date', 'tx date': 'Transaction Date', 'transactiondate': 'Transaction Date', 'txndate': 'Transaction Date',

  // Ledger Name & Names & Month
  'ledger name': 'Ledger Name', 'ledger': 'Ledger Name', 'ledgername': 'Ledger Name',
  'month': 'Month',
  'names': 'Names', 'name': 'Names',
  'vehicle': 'Vehicle', 'vehicle no': 'Vehicle', 'vehicle number': 'Vehicle', 'truck no': 'Vehicle', 'veh no': 'Vehicle',

  // Particulars & Remarks
  'particulars': 'Particulars', 'particular': 'Particulars',
  'remarks': 'Remarks', 'remark': 'Remarks', 'narration': 'Remarks', 'description': 'Remarks', 'transaction details': 'Remarks', 'details': 'Remarks', 'tran particular': 'Remarks', 'transaction narration': 'Remarks', 'transaction description': 'Remarks', 'chq/ref particulars': 'Remarks', 'transaction remarks': 'Remarks',

  // Reference No & Cheque No
  'reference no': 'Reference No', 'ref no': 'Reference No', 'ref. no.': 'Reference No', 'ref. no': 'Reference No', 'reference number': 'Reference No', 'transaction id': 'Reference No', 'tran id': 'Reference No', 'trans id': 'Reference No', 'utr no': 'Reference No', 'utr number': 'Reference No', 'transaction reference': 'Reference No', 'instrument id': 'Reference No', 'chq / ref no': 'Reference No', 'chq/ref no': 'Reference No', 'referenceno': 'Reference No', 'refno': 'Reference No',
  'cheque no': 'Cheque No', 'chq no': 'Cheque No', 'chequeno': 'Cheque No', 'chqno': 'Cheque No',

  // Withdraw & Deposit
  'withdraw': 'Withdraw', 'withdrawal': 'Withdraw', 'dr': 'Withdraw', 'debit': 'Withdraw', 'withdrawals': 'Withdraw', 'dr amount': 'Withdraw', 'debit amount': 'Withdraw',
  'deposit': 'Deposit', 'cr': 'Deposit', 'credit': 'Deposit', 'deposits': 'Deposit', 'cr amount': 'Deposit', 'credit amount': 'Deposit',

  // Closing Balance
  'closing balance': 'Closing Balance', 'balance': 'Closing Balance', 'avail bal': 'Closing Balance', 'available balance': 'Closing Balance', 'running balance': 'Closing Balance', 'bal': 'Closing Balance', 'closingbalance': 'Closing Balance'
};

const normalizeHeader = h => String(h).trim().toLowerCase();
const EXCEL_HEADER_MAP = {};
Object.entries(RAW_EXCEL_HEADER_MAP).forEach(([k, v]) => {
  EXCEL_HEADER_MAP[normalizeHeader(k)] = v;
});

function parseWorksheetToAOA(ws) {
  try {
    const rangeStr = ws['!ref'];
    if (!rangeStr) return [];
    const range = window.XLSX ? window.XLSX.utils.decode_range(rangeStr) : {s:{r:0,c:0}, e:{r:50000, c:20}};
    const aoa = [];
    for (let R = range.s.r; R <= Math.min(range.e.r, 50000); ++R) {
      const row = [];
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = { c: C, r: R };
        const cellRef = window.XLSX ? window.XLSX.utils.encode_cell(cellAddress) : `${String.fromCharCode(65+C)}${R+1}`;
        const cell = ws[cellRef];
        if (!cell) {
          row.push('');
        } else if (cell.w !== undefined) {
          row.push(cell.w);
        } else if (cell.v !== undefined) {
          row.push(cell.v);
        } else {
          row.push('');
        }
      }
      aoa.push(row);
    }
    return aoa;
  } catch (e) {
    console.warn("Manual range parse failed, falling back", e);
    return window.XLSX ? window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) : [];
  }
}

function formatExcelDate(rawDate) {
  if (!rawDate) return '';
  if (!isNaN(rawDate)) {
    const excelEpoch = new Date(1899, 11, 30);
    const dateObj = new Date(excelEpoch.getTime() + rawDate * 86400000);
    if (!isNaN(dateObj.getTime())) {
      const yyyy = dateObj.getFullYear();
      const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
      const dd = String(dateObj.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
  }
  const parts = String(rawDate).trim().split(/[-/\.]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    } else if (parts[2].length === 4) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  const parsed = new Date(rawDate);
  if (!isNaN(parsed.getTime())) {
    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const dd = String(parsed.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return String(rawDate);
}


export default function AccountDetails({ onBack }) {
  const [entries, setEntries] = useState([]);
  const [vehicleList, setVehicleList] = useState([]);
  const [ownerVehicleMap, setOwnerVehicleMap] = useState({});
  const [localData, setLocalData] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [snack, setSnack] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [confirmDel, setConfirmDel] = useState(false);
  const [bankUploadPreview, setBankUploadPreview] = useState(null);
  const [bankDateDialog, setBankDateDialog] = useState(false);
  const [bankFromDate, setBankFromDate] = useState('');
  const [bankToDate, setBankToDate] = useState('');
  const [uploadedDates, setUploadedDates] = useState([]);
  const fileInputRef = useRef(null);
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [rowUploading, setRowUploading] = useState(null); // Track per-row upload state
  const [displayMonth, setDisplayMonth] = useState(MONTHS[new Date().getMonth()]);
  const [displayYear, setDisplayYear] = useState(String(new Date().getFullYear()));
  const [showExcelWizard, setShowExcelWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardMonth, setWizardMonth] = useState(MONTHS[new Date().getMonth()]);
  const [wizardYear, setWizardYear] = useState(String(new Date().getFullYear()));
  const [wizardPreview, setWizardPreview] = useState(null);
  const [unsavedImportRows, setUnsavedImportRows] = useState([]);
  const wizardFileRef = useRef(null);

  const [pendingBillsModal, setPendingBillsModal] = useState({ open: false, rowId: null, party: null, bills: [], loading: false, selectedBills: [], allocations: {} });

  const openPendingBillsModal = async (rowId, party) => {
    setPendingBillsModal({ open: true, rowId, party, bills: [], loading: true, selectedBills: [], allocations: {} });
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/fy-details/pending-bills?party=${party}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPendingBillsModal(prev => ({ ...prev, loading: false, bills: res.data.pendingBills }));
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Failed to fetch pending bills' });
      setPendingBillsModal(prev => ({ ...prev, loading: false }));
    }
  };

  const handlePendingBillsToggleSelect = (bill) => {
    setPendingBillsModal(prev => {
      const isSelected = prev.selectedBills.some(b => b.rawBillNumber === bill.rawBillNumber);
      let newSelected;
      let newAllocations = { ...prev.allocations };
      if (isSelected) {
        newSelected = prev.selectedBills.filter(b => b.rawBillNumber !== bill.rawBillNumber);
        delete newAllocations[bill.rawBillNumber];
      } else {
        newSelected = [...prev.selectedBills, bill];
        newAllocations[bill.rawBillNumber] = bill.pendingAmount;
      }
      return { ...prev, selectedBills: newSelected, allocations: newAllocations };
    });
  };

  const handleAllocationChange = (rawBillNumber, val) => {
    setPendingBillsModal(prev => ({
      ...prev,
      allocations: { ...prev.allocations, [rawBillNumber]: num(val) }
    }));
  };

  const handlePendingBillsApply = () => {
    const allocs = pendingBillsModal.allocations;
    const totalAmount = pendingBillsModal.selectedBills.reduce((sum, b) => sum + num(allocs[b.rawBillNumber]), 0);
    const billsStr = pendingBillsModal.selectedBills.map(b => `${b.billNumber}(₹${num(allocs[b.rawBillNumber])})`).join(', ');
    const existingRemarks = localData[pendingBillsModal.rowId]?.['Remarks'] || entries.find(e => e._id === pendingBillsModal.rowId)?.['Remarks'] || '';
    
    // Pass allocations payload
    const allocPayload = pendingBillsModal.selectedBills.map(b => ({
      rawBillNumber: b.rawBillNumber,
      allocatedAmount: num(allocs[b.rawBillNumber])
    }));

    setLocalData(prev => ({
      ...prev,
      [pendingBillsModal.rowId]: {
        ...(prev[pendingBillsModal.rowId] || {}),
        'Withdraw': totalAmount.toFixed(2),
        'Names': pendingBillsModal.party,
        'Remarks': billsStr ? `${existingRemarks} [Allocations: ${billsStr}]`.trim() : existingRemarks,
        '_allocations': allocPayload
      }
    }));
    setPendingBillsModal({ open: false, rowId: null, party: null, bills: [], loading: false, selectedBills: [], allocations: {} });
  };

  const dirtyCount = Object.keys(localData).length;
  const allSelected = entries.length > 0 && selectedIds.size === entries.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleSelect = (id) => setSelectedIds(prev => {
    const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s;
  });
  const toggleSelectAll = () => {
    if (allSelected || someSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(entries.map(r => r._id)));
  };

  useEffect(() => {
    let socket;
    try {
      socket = io(SOCKET_URL, { autoConnect: true });
      socket.on('accountDetailsUpdate', () => fetchData(true));
    } catch (err) {
      console.warn('Socket error in AccountDetails:', err.message);
    }
    
    const fetchVehicles = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API_URL}/truck-contacts`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.data && res.data.contacts) {
          const ownerMap = {};
          res.data.contacts.forEach(c => {
            const owner = c['Owner Name '] || c['Owner Name'] || c.owner_name;
            const truck = c['Truck No '] || c['Truck No'] || c.truck_no;
            if (owner && truck) {
              const oName = String(owner).trim();
              const tNo = String(truck).trim();
              if (oName && tNo) {
                if (!ownerMap[oName]) ownerMap[oName] = [];
                ownerMap[oName].push(tNo);
              }
            }
          });
          for (let owner in ownerMap) {
            ownerMap[owner] = [...new Set(ownerMap[owner])].sort();
          }
          setOwnerVehicleMap(ownerMap);

          const uniqueVehicles = [...new Set(res.data.contacts.map(c => c['Truck No ']).filter(Boolean))].sort();
          setVehicleList(uniqueVehicles);
        }
      } catch (err) {
        console.error('Failed to fetch vehicles:', err);
      }
    };
    fetchVehicles();

    return () => { if (socket) socket.disconnect(); };
  }, []);

  const fetchData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/account-details`, {
        params: { month: displayMonth, year: displayYear },
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) {
        setEntries(res.data.entries);
      setUnsavedImportRows([]);
        setLocalData({});
      }
    } catch (e) {
      console.error('Fetch AccountDetails failed:', e);
      setSnack({ severity: 'error', msg: 'Failed to fetch data' });
    } finally {
      setLoading(false);
    }
  }, [displayMonth, displayYear]);

  const fetchUploadedDates = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/account-details/uploaded-date-ranges`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) setUploadedDates(res.data.uploadedDates || []);
    } catch (e) {
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchUploadedDates();
  }, [fetchData, fetchUploadedDates, displayMonth, displayYear]);

  const computedRows = useMemo(() =>
    entries.map(row => ({ ...row, ...(localData[row._id] || {}) })),
    [entries, localData]);

  const filteredRows = useMemo(() => {
    const parseDateStr = (dStr) => {
      if (!dStr) return null;
      const parts = String(dStr).split(/[-/]/);
      if (parts.length !== 3) return null;
      if (parts[0].length === 4) {
        return new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2])).getTime();
      } else {
        return new Date(parseInt(parts[2]), parseInt(parts[1])-1, parseInt(parts[0])).getTime();
      }
    };

    const finalArr = [
      ...unsavedImportRows.map(row => ({...row, ...(localData[row._id] || {})})),
      ...computedRows
    ];
    let result = [...finalArr];
    if (filterFrom || filterTo) {
      const fromTime = filterFrom ? new Date(filterFrom).getTime() : 0;
      const toTime = filterTo ? new Date(filterTo).getTime() : Infinity;
      result = result.filter(row => {
        const d = row['Transaction Date'] || row.transactionDate || '';
        const t = parseDateStr(d);
        if (!t) return true; // keep empty dates if filtering? Or drop them? Let's keep or drop? Let's drop if there is a filter.
        if (fromTime && t < fromTime) return false;
        if (toTime && toTime !== Infinity && t > toTime) return false;
        return true;
      });
    }

    result.sort((a, b) => {
      const tA = parseDateStr(a['Transaction Date'] || a.transactionDate) || 0;
      const tB = parseDateStr(b['Transaction Date'] || b.transactionDate) || 0;
      // Also consider created_at for stable sort if dates are equal
      if (tA !== tB) return tA - tB; 
      // If dates are equal, sort new rows to bottom (since they are newer in ascending chronological order)
      if (a.isNewRow && !b.isNewRow) return 1;
      if (!a.isNewRow && b.isNewRow) return -1;

      // Stable sort by id if available
      const idA = a._id ? a._id.toString() : '';
      const idB = b._id ? b._id.toString() : '';
      if (idA && idB) return idA.localeCompare(idB);
      
      return 0;
    });

    return result;
  }, [computedRows, filterFrom, filterTo, unsavedImportRows, localData]);

  const isFiltered = !!(filterFrom || filterTo);

  const handleCellEdit = useCallback((rowId, field, value) => {
    setLocalData(prev => ({ ...prev, [rowId]: { ...(prev[rowId] || {}), [field]: value } }));
  }, []);

  const handleAddRow = () => {
    const newId = 'new_' + Date.now();
    const today = new Date().toISOString().split('T')[0]; // Auto-fill today's date (YYYY-MM-DD)
    setEntries(prev => [{ _id: newId, isNewRow: true }, ...prev]);
    setLocalData(prev => ({ 
      ...prev, 
      [newId]: { 
        isNewRow: true,
        'Transaction Date': today,
        selectedMonth: displayMonth,
        selectedYear: displayYear 
      } 
    }));
  };

  const handleBulkDelete = async () => {
    try {
      const token = localStorage.getItem('token');
      const ids = [...selectedIds].filter(id => !id.startsWith('new_'));
      if (ids.length > 0) {
        // Clear main cashbook for each deleted 'Main cash' row
        for (const id of ids) {
          const row = entries.find(e => e._id === id);
          if (row && row['Ledger Name'] && row['Ledger Name'].toLowerCase() === 'main cash') {
            const transactionDate = row['Transaction Date'] || row.transactionDate;
            if (transactionDate) {
              try {
                await axios.post(`${API_URL}/account-details/clear-main-cash`, { transactionDate }, {
                  headers: { Authorization: `Bearer ${token}` }
                });
              } catch (e) {
                console.warn('Failed to clear main cash for date:', transactionDate);
              }
            }
          }
        }

        await axios.delete(`${API_URL}/account-details/bulk-delete`, {
          headers: { Authorization: `Bearer ${token}` },
          data: { ids },
        });
      }
      setEntries(prev => prev.filter(r => !selectedIds.has(r._id)));
      setSelectedIds(new Set());
      setConfirmDel(false);
      setSnack({ severity: 'success', msg: `${selectedIds.size} row(s) deleted.` });
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Delete failed: ' + (err.response?.data?.error || err.message) });
    }
  };

  const handleSave = async () => {
    if (dirtyCount === 0 && unsavedImportRows.length === 0) return;
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const updates = [];
      
      // Validation: Ensure all modified rows have a Transaction Date
      for (const row of unsavedImportRows) {
        const rowEdits = localData[row._id] || {};
        const mergedRow = { ...row, ...rowEdits };
        
        if (!mergedRow['Transaction Date']) {
          setSnack({ severity: 'error', msg: 'Error: Transaction Date is required for all imported rows.' });
          setSaving(false);
          return;
        }

        updates.push({
          id: null,
          isNewRow: true,
          changes: {
            ...mergedRow,
            selectedMonth: mergedRow.selectedMonth || wizardMonth || displayMonth,
            selectedYear: mergedRow.selectedYear || wizardYear || displayYear
          }
        });
      }

      for (const [id, changes] of Object.entries(localData)) {
        const originalEntry = entries.find(e => e._id === id);
        const transactionDate = changes['Transaction Date'] ?? originalEntry?.['Transaction Date'] ?? originalEntry?.transactionDate ?? '';
        
        if (!transactionDate) {
          setSnack({ severity: 'error', msg: 'Error: Transaction Date is required for all rows.' });
          setSaving(false);
          return;
        }
        
        updates.push({
          id: id.startsWith('new_') ? null : id,
          isNewRow: id.startsWith('new_'),
          changes
        });
      }

      await axios.put(`${API_URL}/account-details/bulk-update`, { updates }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const syncErrors = [];
      for (const [rowId, changes] of Object.entries(localData)) {
        const newLedger = changes['Ledger Name'];
        const originalEntry = entries.find(e => e._id === rowId);
        const oldLedger = originalEntry?.['Ledger Name'] || '';
        const transactionDate = changes['Transaction Date'] ?? originalEntry?.['Transaction Date'] ?? originalEntry?.transactionDate ?? '';

        if (!transactionDate) continue;
        const newIsMainCash = typeof newLedger === 'string' && newLedger.toLowerCase() === 'main cash';
        const oldWasMainCash = typeof oldLedger === 'string' && oldLedger.toLowerCase() === 'main cash';

        if (newIsMainCash) {
          const withdraw = changes['Withdraw'] !== undefined ? changes['Withdraw'] : (originalEntry?.['Withdraw'] || originalEntry?.withdraw || '');
          if (!withdraw || parseFloat(withdraw) <= 0) continue;
          try {
            await axios.post(`${API_URL}/account-details/sync-main-cash`, {
              transactionDate,
              withdrawAmount: parseFloat(withdraw)
            }, { headers: { Authorization: `Bearer ${token}` } });
          } catch (syncErr) {
            syncErrors.push(syncErr.response?.data?.error || `Sync failed for ${transactionDate}: ${syncErr.message}`);
          }
        } else if (oldWasMainCash && newLedger !== undefined && !newIsMainCash) {
          try {
            await axios.post(`${API_URL}/account-details/clear-main-cash`, {
              transactionDate
            }, { headers: { Authorization: `Bearer ${token}` } });
          } catch (clearErr) {
            syncErrors.push(clearErr.response?.data?.error || `Clear failed for ${transactionDate}: ${clearErr.message}`);
          }
        }
      }

      if (syncErrors.length > 0) {
        setSnack({ severity: 'warning', msg: `Saved ✓ — Cashbook sync issue: ${syncErrors[0]}` });
      } else {
        setSnack({ severity: 'success', msg: 'Saved! Main Cashbook updated.' });
      }
      fetchData();
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Save failed: ' + (err.response?.data?.error || err.message) });
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => exportToCsv('bank_book.xls', computedRows);

  const handleUploadBankStatementClick = () => {
    setBankFromDate('');
    setBankToDate('');
    setBankDateDialog(true);
  };

  const handleDateConfirmed = () => {
    if (!bankFromDate || !bankToDate) {
      setSnack({ severity: 'warning', msg: 'Please select both From and To dates.' });
      return;
    }
    if (bankFromDate > bankToDate) {
      setSnack({ severity: 'warning', msg: '"From" date must be before or equal to "To" date.' });
      return;
    }
    setBankDateDialog(false);
    setTimeout(() => fileInputRef.current?.click(), 100);
  };

  const handleBankStatementUpload = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('statement', file);
      formData.append('fromDate', bankFromDate);
      formData.append('toDate', bankToDate);
      const res = await axios.post(`${API_URL}/account-details/upload-statement`, formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
      });
      if (res.data.success) {
        setBankUploadPreview({ count: res.data.count, filename: file.name, fromDate: bankFromDate, toDate: bankToDate });
        fetchData();
        fetchUploadedDates();
      }
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Upload failed: ' + (err.response?.data?.error || err.message) });
    } finally {
      setUploading(false);
    }
  };

  
  const handleWizardFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const XLSX = await import('xlsx');
      window.XLSX = XLSX; // Expose for our helper
      
      const reader = new FileReader();
      reader.onload = (evt) => {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        let aoa = parseWorksheetToAOA(worksheet);
        if (!aoa || aoa.length === 0) {
          aoa = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        }
        
        if (!aoa || aoa.length === 0) {
          setSnack({ severity: 'error', msg: 'The selected Excel sheet appears to be empty.' });
          return;
        }

        const searchLimit = Math.min(aoa.length, 50);
        let bestHeaderRowIdx = 0;
        let maxMatches = 0;

        for (let i = 0; i < searchLimit; i++) {
          const row = aoa[i];
          if (!row) continue;
          let matches = 0;
          row.forEach(cell => {
            if (cell && EXCEL_HEADER_MAP[normalizeHeader(cell)]) {
              matches++;
            }
          });
          if (matches > maxMatches) {
            maxMatches = matches;
            bestHeaderRowIdx = i;
          }
        }

        if (maxMatches === 0) {
          setSnack({ severity: 'error', msg: 'Could not find any matching columns (e.g. Transaction Date, Remarks, Withdraw, etc) in the first 50 rows.' });
          return;
        }

        const excelHeaders = aoa[bestHeaderRowIdx].map(h => String(h).trim());
        const dataRows = aoa.slice(bestHeaderRowIdx + 1);

        const headerMapping = {};
        const unmappedHeaders = [];
        excelHeaders.forEach((h, colIdx) => {
          if (!h) return;
          const key = EXCEL_HEADER_MAP[normalizeHeader(h)];
          if (key) {
            headerMapping[colIdx] = key;
          } else {
            const rawKey = h.trim().toUpperCase();
            headerMapping[colIdx] = rawKey;
            unmappedHeaders.push(rawKey);
          }
        });

        let mappedRows = [];
        dataRows.forEach(rowArr => {
          if (!rowArr || !rowArr.some(cell => String(cell).trim() !== '')) return;

          const rowObj = {};
          Object.entries(headerMapping).forEach(([colIdxStr, internalKey]) => {
            const colIdx = parseInt(colIdxStr, 10);
            const rawVal = rowArr[colIdx];
            let val = String(rawVal ?? '').trim();
            if (val !== '') {
              if (internalKey === 'Transaction Date') {
                val = formatExcelDate(val);
              }
              rowObj[internalKey] = val;
            }
          });
          
          if (Object.keys(rowObj).length > 0) {
            if (!rowObj['Transaction Date']) return; // Skip rows without Transaction Date
            
            const d = new Date(rowObj['Transaction Date']);
            if (!isNaN(d.getTime())) {
              const parsedMonth = MONTHS[d.getMonth()];
              const parsedYear = String(d.getFullYear());
              if (parsedMonth !== wizardMonth || parsedYear !== wizardYear) {
                return; // Skip dates outside selected month/year
              }
            }
            rowObj.selectedMonth = wizardMonth;
            rowObj.selectedYear = wizardYear;
            mappedRows.push(rowObj);
          }
        });

        setWizardPreview({
          fileName: file.name,
          totalRows: dataRows.length,
          mappedCols: headerMapping,
          unmappedHeaders,
          dataRows: mappedRows
        });
        setWizardStep(2);
      };
      reader.readAsArrayBuffer(file);
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Failed to read Excel file: ' + err.message });
    }
  };

  const handleWizardImportConfirm = () => {
    const rows = wizardPreview?.dataRows || [];
    if (rows.length === 0) return;
    const tempRows = rows.map((row, idx) => ({
      ...row,
      _id: `temp-${idx}-${Date.now()}`,
      isUnsavedImport: true,
      selectedMonth: wizardMonth,
      selectedYear: wizardYear
    }));
    setUnsavedImportRows(prev => [...tempRows, ...prev]);
    setShowExcelWizard(false);
    setWizardPreview(null);
    setWizardStep(0);
    if (wizardFileRef.current) wizardFileRef.current.value = null;
    setSnack({ severity: 'success', msg: `${tempRows.length} rows imported into UI. Click Save to persist.` });
  };


  const handleRowRemittanceUpload = async (rowId, e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;

    if (rowId.startsWith('new_')) {
      setSnack({ severity: 'warning', msg: 'Please save the row first before uploading a remittance copy.' });
      return;
    }

    try {
      setRowUploading(rowId);
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', file);

      const res = await axios.post(`${API_URL}/account-details/upload-remittance/${rowId}`, formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
      });
      if (res.data.success) {
        setSnack({ severity: 'success', msg: 'Remittance copy uploaded for row!' });
        fetchData(true);
      }
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Upload failed: ' + (err.response?.data?.error || err.message) });
    } finally {
      setRowUploading(null);
    }
  };

  if (loading) {
    return (
      <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100vh" gap={2}>
        <CircularProgress size={48} thickness={4} sx={{ color: '#0f766e' }} />
        <Typography color="text.secondary" fontWeight={600}>Loading Bank Book…</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#f8fafc', overflow: 'hidden' }}>
      <Box sx={{
        px: 2.5, py: 1.2,
        display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap',
        bgcolor: '#fff', borderBottom: '1px solid #e2e8f0',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)', flexShrink: 0
      }}>
        <IconButton onClick={onBack} size="small" sx={{ bgcolor: '#f1f5f9', '&:hover': { bgcolor: '#e2e8f0' } }}>
          <ArrowBackIcon fontSize="small" />
        </IconButton>
        <Typography variant="h6" fontWeight={800} sx={{ color: '#0f172a', letterSpacing: '-0.5px' }}>
          Bank Book
        </Typography>

        {dirtyCount > 0 && <Chip label={`${dirtyCount} unsaved`} size="small" color="warning" sx={{ fontWeight: 700 }} />}
        {selectedIds.size > 0 && (
          <Tooltip title="Delete selected">
            <IconButton size="small" color="error" onClick={() => setConfirmDel(true)} sx={{ bgcolor: '#fee2e2' }}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        <Box sx={{ ml: 'auto', display: 'flex', gap: 1, alignItems: 'center' }}>
          <Autocomplete
            options={MONTHS}
            value={displayMonth}
            onChange={(e, v) => v && setDisplayMonth(v)}
            renderInput={(params) => <TextField {...params} label="Month" size="small" sx={{ width: 140, bgcolor: 'rgba(255,255,255,0.08)' }} />}
            disableClearable
          />
          <Autocomplete
            options={YEARS}
            value={displayYear}
            onChange={(e, v) => v && setDisplayYear(v)}
            renderInput={(params) => <TextField {...params} label="Year" size="small" sx={{ width: 100, bgcolor: 'rgba(255,255,255,0.08)' }} />}
            disableClearable
          />
          <Button
            size="small" variant="contained"
            startIcon={uploading ? <CircularProgress size={13} color="inherit" /> : <AccountBalanceIcon />}
            disabled={uploading}
            onClick={handleUploadBankStatementClick}
            sx={{
              fontWeight: 800, borderRadius: 2, px: 2, fontSize: '12px',
              background: 'linear-gradient(135deg, #0891b2, #0e7490)',
              '&:hover': { background: 'linear-gradient(135deg, #0e7490, #155e75)' }
            }}>
            {uploading ? 'Parsing...' : 'Upload Bank Statement'}
          </Button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={handleBankStatementUpload} />


          <Tooltip title="Discard & reload">
            <IconButton size="small" onClick={() => fetchData()} sx={{ bgcolor: '#f1f5f9' }}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Button size="small" variant="contained" startIcon={<UploadIcon />} onClick={() => setShowExcelWizard(true)} sx={{ bgcolor: '#8b5cf6', '&:hover': { bgcolor: '#7c3aed' }, fontWeight: 700, px: 2, borderRadius: 2 }}>
            Import Excel
          </Button>
          <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={handleExport}
            sx={{ fontWeight: 700, borderRadius: 2, fontSize: '12px' }}>XLS</Button>
          <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={handleAddRow}
            sx={{ fontWeight: 800, borderRadius: 2, px: 2, fontSize: '12px', bgcolor: '#3b82f6', '&:hover': { bgcolor: '#2563eb' } }}>
            Add Row
          </Button>
          <Button
            size="small" variant="contained"
            startIcon={saving ? <CircularProgress size={13} color="inherit" /> : <SaveIcon />}
            onClick={handleSave} disabled={(dirtyCount === 0 && unsavedImportRows.length === 0) || saving}
            sx={{
              fontWeight: 800, borderRadius: 2, px: 2.5, fontSize: '12px',
              bgcolor: (dirtyCount > 0 || unsavedImportRows.length > 0) ? '#16a34a' : '#cbd5e1',
              boxShadow: (dirtyCount > 0 || unsavedImportRows.length > 0) ? '0 4px 12px rgba(22,163,74,0.35)' : 'none',
              filter: (dirtyCount === 0 && unsavedImportRows.length === 0 && !saving) ? 'grayscale(100%) opacity(0.7)' : 'none',
              '&:disabled': { bgcolor: '#cbd5e1', color: '#64748b' },
            }}>
            {saving ? 'Saving…' : `Save${(dirtyCount > 0 || unsavedImportRows.length > 0) ? ` (${dirtyCount + unsavedImportRows.length})` : ''}`}
          </Button>
        </Box>
      </Box>

      {/* ── Column Key Bar ── */}
      <Box sx={{ px: 2.5, py: 0.7, bgcolor: '#f0f9ff', borderBottom: '1px solid #bae6fd', display: 'flex', gap: 2, alignItems: 'center', flexShrink: 0 }}>
        <Typography variant="caption" fontWeight={700} color="#0369a1">Column Key:</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: '#dcfce7', border: '1px solid #16a34a' }} />
          <Typography variant="caption" color="#15803d" fontWeight={600}>Auto (from bank statement)</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: '#fff7ed', border: '1px solid #f97316' }} />
          <Typography variant="caption" color="#c2410c" fontWeight={600}>Manual (Ledger Name, Names, Particulars)</Typography>
        </Box>
      </Box>

      {/* ── Date Range Filter Bar ── */}
      <Box sx={{
        px: 3, py: 1.2, flexShrink: 0,
        background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
        borderBottom: '2px solid #0ea5e9',
        display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{
            width: 30, height: 30, borderRadius: '8px',
            background: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(14,165,233,0.4)'
          }}>
            <span style={{ fontSize: 15 }}>📅</span>
          </Box>
          <Box>
            <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: '12px', lineHeight: 1.1 }}>
              Date Range Filter
            </Typography>
            <Typography sx={{ color: '#94a3b8', fontWeight: 500, fontSize: '10px', lineHeight: 1.1 }}>
              Filter bank statements by date
            </Typography>
          </Box>
        </Box>

        <Box sx={{ width: '1px', height: 32, bgcolor: 'rgba(255,255,255,0.15)' }} />

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4 }}>
          <Typography sx={{ color: '#94a3b8', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            From Date
          </Typography>
          <input
            type="date"
            value={filterFrom}
            onChange={e => setFilterFrom(e.target.value)}
            style={{
              padding: '7px 12px', borderRadius: 8, fontSize: '13px', fontWeight: 700,
              border: filterFrom ? '2px solid #0ea5e9' : '2px solid rgba(255,255,255,0.15)',
              background: filterFrom ? 'rgba(14,165,233,0.18)' : 'rgba(255,255,255,0.07)',
              color: filterFrom ? '#e0f2fe' : '#94a3b8', outline: 'none', cursor: 'pointer', transition: 'all 0.2s', minWidth: 145,
            }}
          />
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'flex-end', pb: 0.3 }}>
          <Typography sx={{ color: '#475569', fontSize: '18px', fontWeight: 900, mt: '18px' }}>→</Typography>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4 }}>
          <Typography sx={{ color: '#94a3b8', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            To Date
          </Typography>
          <input
            type="date"
            value={filterTo}
            min={filterFrom || undefined}
            onChange={e => setFilterTo(e.target.value)}
            style={{
              padding: '7px 12px', borderRadius: 8, fontSize: '13px', fontWeight: 700,
              border: filterTo ? '2px solid #0ea5e9' : '2px solid rgba(255,255,255,0.15)',
              background: filterTo ? 'rgba(14,165,233,0.18)' : 'rgba(255,255,255,0.07)',
              color: filterTo ? '#e0f2fe' : '#94a3b8', outline: 'none', cursor: 'pointer', transition: 'all 0.2s', minWidth: 145,
            }}
          />
        </Box>

        {isFiltered && (
          <>
            <Box sx={{ width: '1px', height: 32, bgcolor: 'rgba(255,255,255,0.15)', ml: 1 }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, ml: 0.5 }}>
              <Box sx={{
                display: 'flex', alignItems: 'center', gap: 0.8, px: 2, py: 0.8, borderRadius: 10,
                background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', boxShadow: '0 2px 10px rgba(14,165,233,0.4)'
              }}>
                <Typography sx={{ color: '#fff', fontWeight: 900, fontSize: '13px' }}>{filteredRows.length}</Typography>
                <Typography sx={{ color: 'rgba(255,255,255,0.8)', fontWeight: 600, fontSize: '11px' }}>
                  {filteredRows.length === 1 ? 'row found' : 'rows found'}
                </Typography>
              </Box>
              <Button size="small" onClick={() => { setFilterFrom(''); setFilterTo(''); }}
                sx={{ fontWeight: 800, fontSize: '12px', color: '#fca5a5', border: '1.5px solid rgba(252,165,165,0.4)', borderRadius: '8px', px: 1.5, py: 0.5, textTransform: 'none' }}>
                ✕ Clear Filter
              </Button>
            </Box>
          </>
        )}
      </Box>

      <Box sx={{ overflow: 'auto', flex: 1 }}>
        <table style={{ borderCollapse: 'collapse', width: 'max-content', tableLayout: 'fixed', fontFamily: 'Inter, sans-serif', fontSize: '12px' }}>
          <colgroup>
            <col style={{ width: 40 }} />
            {COLUMNS.map(c => <col key={c.key} style={{ width: c.width }} />)}
          </colgroup>
          <thead>
            <tr>
              <th style={{ position: 'sticky', top: 0, zIndex: 3, background: '#1e293b', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} style={{ cursor: 'pointer' }} />
              </th>
              {COLUMNS.map((col) => {
                const isAuto = AUTO_COLS.has(col.key);
                const isManual = MANUAL_COLS.has(col.key);
                return (
                  <th key={col.key} style={{
                    position: 'sticky', top: 0, zIndex: 2,
                    background: isAuto ? '#059669' : isManual ? '#ea580c' : '#0f766e',
                    color: '#fff', padding: '10px 5px', textAlign: 'center', fontSize: '10px', fontWeight: 700,
                    whiteSpace: 'pre-line', borderRight: '1px solid rgba(255,255,255,0.1)',
                  }}>
                    {col.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, ri) => (
              <tr key={row._id} style={{ background: selectedIds.has(row._id) ? '#f0f9ff' : ri % 2 === 0 ? '#fff' : '#f8fafc' }}>
                <td style={{ textAlign: 'center', border: '1px solid #e2e8f0' }}>
                  <input type="checkbox" checked={selectedIds.has(row._id)} onChange={() => toggleSelect(row._id)} />
                </td>
                {COLUMNS.map((col) => {
                  const val = localData[row._id]?.[col.key] ?? (row[col.key] || '');
                  const isAuto = AUTO_COLS.has(col.key);
                  const isFromBank = row._source === 'bank_statement';
                  return (
                    <td key={col.key} style={{ border: '1px solid #e2e8f0', padding: 0 }}>
                      {col.key === 'Remittance Copy' ? (
                        <Box sx={{ p: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                          {rowUploading === row._id ? (
                            <CircularProgress size={20} sx={{ color: '#0284c7' }} />
                          ) : (row.remittanceFileUrl || localData[row._id]?.remittanceFileUrl) ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={() => window.open(row.remittanceFileUrl || localData[row._id]?.remittanceFileUrl, '_blank')}
                                sx={{ fontSize: '10px', p: '2px 8px', fontWeight: 700, borderRadius: 1 }}
                              >
                                View
                              </Button>
                              <Tooltip title="Replace file">
                                <IconButton
                                  size="small"
                                  component="label"
                                  sx={{ bgcolor: '#f1f5f9', width: 24, height: 24, '&:hover': { bgcolor: '#e2e8f0' } }}
                                >
                                  <RefreshIcon sx={{ fontSize: '14px', color: '#64748b' }} />
                                  <input type="file" hidden onChange={(e) => handleRowRemittanceUpload(row._id, e)} />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          ) : (
                            <Button
                              size="small"
                              variant="contained"
                              component="label"
                              sx={{
                                fontSize: '10px', p: '2px 10px', fontWeight: 800, borderRadius: 1,
                                bgcolor: '#0284c7', '&:hover': { bgcolor: '#0369a1' },
                                boxShadow: 'none'
                              }}
                            >
                              Upload
                              <input type="file" hidden onChange={(e) => handleRowRemittanceUpload(row._id, e)} />
                            </Button>
                          )}
                        </Box>
                      ) : col.key === 'Ledger Name' || col.key === 'Names' || col.key === 'Month' || col.key === 'Vehicle' ? (
                        <Autocomplete
                          disabled={col.key === 'Vehicle' && !(localData[row._id]?.['Names'] || row['Names'])}
                          options={
                            col.key === 'Month'
                              ? MONTHS
                              : col.key === 'Vehicle'
                                ? (() => {
                                    const typed = String(localData[row._id]?.['Names'] || row['Names'] || '').trim();
                                    if (!typed) return [];
                                    if (ownerVehicleMap[typed]) return ownerVehicleMap[typed];
                                    const typedLower = typed.toLowerCase();
                                    return [...new Set(Object.keys(ownerVehicleMap).reduce((acc, k) => {
                                      if (k.toLowerCase().includes(typedLower) || typedLower.includes(k.toLowerCase())) {
                                        return acc.concat(ownerVehicleMap[k]);
                                      }
                                      return acc;
                                    }, []))];
                                  })()
                                : col.key === 'Ledger Name'
                                  ? LEDGER_OPTIONS
                                  : ( (localData[row._id]?.['Ledger Name'] || row['Ledger Name'] || '')?.toLowerCase().includes('payment')
                                      && (localData[row._id]?.['Ledger Name'] || row['Ledger Name'] || '')?.toLowerCase().includes('receiv')
                                        ? ['NVL', 'NVCL'] : NAMES_OPTIONS )
                          }
                          value={val || ''}
                          freeSolo
                          onChange={(e, newValue) => {
                            handleCellEdit(row._id, col.key, newValue);
                            if (col.key === 'Names') {
                              if (newValue === 'NVL' || newValue === 'NVCL') {
                                const ledger = localData[row._id]?.['Ledger Name'] || row['Ledger Name'] || '';
                                const ledgerLower = ledger.toLowerCase();
                                if (
                                    (ledgerLower.includes('payment') && ledgerLower.includes('receiv')) ||
                                    (ledgerLower.includes('freight') && ledgerLower.includes('payment'))
                                ) {
                                    openPendingBillsModal(row._id, newValue);
                                }
                              }
                              // Clear vehicle if it doesn't belong to the new owner
                              const currentVehicle = localData[row._id]?.['Vehicle'] !== undefined ? localData[row._id]['Vehicle'] : (row['Vehicle'] || '');
                              if (currentVehicle) {
                                const typedLower = String(newValue || '').trim().toLowerCase();
                                const allowedVehicles = Object.keys(ownerVehicleMap).reduce((acc, k) => {
                                  if (k.toLowerCase().includes(typedLower) || typedLower.includes(k.toLowerCase())) {
                                    return acc.concat(ownerVehicleMap[k]);
                                  }
                                  return acc;
                                }, []);
                                if (allowedVehicles.length > 0 && !allowedVehicles.includes(currentVehicle)) {
                                  handleCellEdit(row._id, 'Vehicle', '');
                                }
                              }
                            }
                          }}
                          onInputChange={(e, newInputValue) => handleCellEdit(row._id, col.key, newInputValue)}
                          ListboxProps={{
                            style: {
                              background: 'rgba(255, 255, 255, 0.98)',
                              backdropFilter: 'blur(8px)',
                              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                              border: '1px solid #e2e8f0',
                              borderRadius: '10px',
                              padding: '4px',
                              maxHeight: '300px'
                            }
                          }}
                          renderOption={(props, option) => (
                            <li {...props} style={{
                              fontSize: '13px',
                              padding: '8px 12px',
                              borderRadius: '6px',
                              color: '#334155',
                              backgroundColor: props['aria-selected'] === true ? '#eff6ff' : 'transparent'
                            }}>
                              {option}
                            </li>
                          )}
                          renderInput={(params) => (
                            <TextField
                              {...params}
                              variant="standard"
                              placeholder={col.key === 'Month' ? 'Select Month...' : col.key === 'Ledger Name' ? "Search Ledger..." : col.key === 'Vehicle' ? "Search Vehicle..." : "Search Name..."}
                              InputProps={{
                                ...params.InputProps,
                                disableUnderline: true,
                                style: {
                                  fontSize: '12px',
                                  padding: '4px 8px',
                                  fontWeight: val ? 700 : 400,
                                  color: '#1e293b'
                                }
                              }}
                            />
                          )}
                          sx={{
                            width: '100%',
                            '& .MuiAutocomplete-inputRoot': { padding: 0 },
                            '& .MuiAutocomplete-input': {
                              padding: '8px 8px !important',
                              transition: 'background 0.2s',
                              '&:hover': { bgcolor: '#f8fafc' },
                              '&:focus': { bgcolor: '#fff' }
                            },
                            '& .MuiAutocomplete-endAdornment': { display: 'none' }
                          }}
                        />
                      ) : col.key === 'Remarks' ? (
                        <textarea
                          value={val}
                          readOnly={isAuto && isFromBank && !localData[row._id]?.[col.key]}
                          onChange={(e) => handleCellEdit(row._id, col.key, e.target.value)}
                          style={{
                            width: '100%', height: '100%', border: 'none', padding: '6px 8px',
                            background: 'transparent', outline: 'none', fontSize: '12px',
                            resize: 'vertical', minHeight: '80px', fontFamily: 'inherit',
                            whiteSpace: 'pre-wrap'
                          }}
                        />
                      ) : (
                        <input
                          type={col.isDate ? 'date' : 'text'}
                          value={val}
                          readOnly={isAuto && isFromBank && !localData[row._id]?.[col.key]}
                          onChange={(e) => handleCellEdit(row._id, col.key, e.target.value)}
                          style={{
                            width: '100%', height: '100%', border: 'none', padding: '6px 8px',
                            background: 'transparent', outline: 'none', fontSize: '12px'
                          }}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Box>

      {/* ── Bank Statement Date Range Picker Dialog ── */}
      <Dialog
        open={bankDateDialog}
        onClose={() => setBankDateDialog(false)}
        maxWidth="sm" fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            background: 'linear-gradient(145deg, #0f172a, #1e293b)',
            color: '#f8fafc',
            boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
            border: '1px solid rgba(255,255,255,0.08)'
          }
        }}
      >
        <DialogTitle sx={{ fontWeight: 800, fontSize: '1.15rem', color: '#38bdf8', pb: 0, display: 'flex', alignItems: 'center', gap: 1 }}>
          <AccountBalanceIcon sx={{ fontSize: 22 }} /> Select Statement Date Range
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography variant="body2" sx={{ color: '#94a3b8', mb: 2.5, lineHeight: 1.6 }}>
            Choose the date range covered by your bank statement. If a statement has already been uploaded for any date in this range, the upload will be blocked to prevent duplicates.
          </Typography>

          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" fontWeight={700} sx={{ color: '#7dd3fc', mb: 0.5, display: 'block' }}>From Date</Typography>
              <input
                type="date"
                value={bankFromDate}
                onChange={e => setBankFromDate(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(56,189,248,0.35)',
                  color: '#f8fafc', fontSize: '14px', fontWeight: 600, outline: 'none',
                  cursor: 'pointer', boxSizing: 'border-box'
                }}
              />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" fontWeight={700} sx={{ color: '#7dd3fc', mb: 0.5, display: 'block' }}>To Date</Typography>
              <input
                type="date"
                value={bankToDate}
                min={bankFromDate || undefined}
                onChange={e => setBankToDate(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(56,189,248,0.35)',
                  color: '#f8fafc', fontSize: '14px', fontWeight: 600, outline: 'none',
                  cursor: 'pointer', boxSizing: 'border-box'
                }}
              />
            </Box>
          </Box>

          {uploadedDates.length > 0 && (
            <Box sx={{ mt: 1 }}>
              <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)', mb: 1.5 }} />
              <Typography variant="caption" fontWeight={700} sx={{ color: '#fbbf24', mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                ⚠️ Already Uploaded Dates ({uploadedDates.length} dates in DB)
              </Typography>
              <Box sx={{
                maxHeight: 120, overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5,
                '&::-webkit-scrollbar': { width: 4 },
                '&::-webkit-scrollbar-thumb': { background: 'rgba(255,255,255,0.2)', borderRadius: 2 }
              }}>
                {uploadedDates.map(d => (
                  <Chip
                    key={d} label={d} size="small"
                    sx={{
                      bgcolor: 'rgba(239,68,68,0.18)', color: '#fca5a5', fontSize: '10px', fontWeight: 700,
                      border: '1px solid rgba(239,68,68,0.35)', height: 20
                    }}
                  />
                ))}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={() => setBankDateDialog(false)} sx={{ color: '#94a3b8', fontWeight: 600 }}>Cancel</Button>
          <Button
            onClick={handleDateConfirmed}
            variant="contained"
            disabled={!bankFromDate || !bankToDate}
            sx={{
              fontWeight: 800, borderRadius: 2, px: 3,
              background: 'linear-gradient(135deg, #0891b2, #0e7490)',
              '&:hover': { background: 'linear-gradient(135deg, #0e7490, #155e75)' },
              '&:disabled': { bgcolor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)' }
            }}
          >
            Continue → Select File
          </Button>
        </DialogActions>
      </Dialog>

      {confirmDel && (
        <Dialog open={confirmDel} onClose={() => setConfirmDel(false)}>
          <DialogTitle sx={{ fontWeight: 800, color: 'error.main' }}>Delete {selectedIds.size} row(s)?</DialogTitle>
          <DialogActions>
            <Button onClick={() => setConfirmDel(false)}>Cancel</Button>
            <Button variant="contained" color="error" onClick={handleBulkDelete}>Delete</Button>
          </DialogActions>
        </Dialog>
      )}

      <Dialog open={!!bankUploadPreview} onClose={() => setBankUploadPreview(null)} maxWidth="sm" fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            background: 'linear-gradient(145deg, #0f172a, #1e293b)',
            color: '#f8fafc',
            border: '1px solid rgba(255,255,255,0.08)'
          }
        }}
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 1 }}>
          🏦 Bank Statement Imported!
        </DialogTitle>
        <DialogContent>
          <Typography variant="h3" fontWeight={900} color="#4ade80" textAlign="center">{bankUploadPreview?.count}</Typography>
          <Typography variant="body1" textAlign="center" sx={{ color: '#94a3b8' }}>
            transactions from <strong style={{ color: '#f8fafc' }}>{bankUploadPreview?.filename}</strong>
          </Typography>
          {bankUploadPreview?.fromDate && (
            <Typography variant="body2" textAlign="center" sx={{ mt: 1, color: '#7dd3fc', fontWeight: 600 }}>
              📅 {bankUploadPreview.fromDate} → {bankUploadPreview.toDate}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBankUploadPreview(null)} variant="contained"
            sx={{ bgcolor: '#15803d', '&:hover': { bgcolor: '#166534' }, fontWeight: 800 }}
          >Got it</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snack} autoHideDuration={4000} onClose={() => setSnack(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {snack && <Alert severity={snack.severity} variant="filled">{snack.msg}</Alert>}
      </Snackbar>

      {/* Excel Import Wizard Dialog */}
      <Dialog open={showExcelWizard} onClose={() => { setShowExcelWizard(false); setWizardStep(0); }} maxWidth="md" fullWidth>
        <DialogTitle sx={{ pb: 1, borderBottom: '1px solid #e2e8f0' }}>Excel Import Wizard</DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          {wizardStep === 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, py: 2 }}>
              <Typography variant="body1" sx={{ color: '#475569' }}>
                Please select the Month and Year that this Excel file belongs to.
              </Typography>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Autocomplete
                  options={MONTHS}
                  value={wizardMonth}
                  onChange={(e,v) => setWizardMonth(v)}
                  renderInput={(params) => <TextField {...params} label="Month" size="small" sx={{ width: 200 }} />}
                  disableClearable
                />
                <Autocomplete
                  options={YEARS}
                  value={wizardYear}
                  onChange={(e,v) => setWizardYear(v)}
                  renderInput={(params) => <TextField {...params} label="Year" size="small" sx={{ width: 150 }} />}
                  disableClearable
                />
              </Box>
            </Box>
          )}

          {wizardStep === 1 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4, gap: 2, border: '2px dashed #cbd5e1', borderRadius: '8px', mt: 2 }}>
              <UploadIcon sx={{ fontSize: 40, color: '#94a3b8' }} />
              <Typography variant="body1" sx={{ color: '#475569', fontWeight: 500 }}>
                Upload Bank Book Excel for {wizardMonth} {wizardYear}
              </Typography>
              <Typography variant="body2" sx={{ color: '#64748b' }}>
                Any rows with dates outside {wizardMonth} {wizardYear} will be skipped.
              </Typography>
              <Button variant="contained" component="label">
                Select File
                <input type="file" hidden accept=".xlsx,.xls,.csv" ref={wizardFileRef} onChange={handleWizardFileSelect} />
              </Button>
            </Box>
          )}

          {wizardStep === 2 && wizardPreview && (
            <Box>
              <Typography variant="h6" fontWeight={800} color="#0f172a" mb={1}>
                Preview Import: {wizardPreview.fileName}
              </Typography>
              
              <Box sx={{ bgcolor: '#fff', borderRadius: 2, border: '1px solid #e2e8f0', p: 2, mb: 3 }}>
                <Typography variant="body2" color="#475569" mb={1}>
                  Total rows found: <strong>{wizardPreview.totalRows}</strong>
                </Typography>
                <Typography variant="body2" color="#475569" mb={1}>
                  Valid rows to import: <strong>{wizardPreview.dataRows.length}</strong>
                </Typography>
                <Typography variant="body2" color="#16a34a">
                  Columns mapped: <strong>{Object.keys(wizardPreview.mappedCols).length}</strong> / {COLUMNS.length}
                </Typography>
                
                {wizardPreview.unmappedHeaders.length > 0 && (
                  <Box mt={2} p={1.5} bgcolor="#fef2f2" border="1px solid #fecaca" borderRadius={1}>
                    <Typography variant="caption" fontWeight={700} color="#dc2626" display="block" mb={0.5}>
                      Unmapped Columns (Will be passed exactly as-is):
                    </Typography>
                    <Typography variant="caption" color="#991b1b">
                      {wizardPreview.unmappedHeaders.join(', ')}
                    </Typography>
                  </Box>
                )}
              </Box>

              <Box display="flex" gap={2} justifyContent="flex-end">
                <Button onClick={() => setWizardStep(1)} sx={{ color: '#64748b', fontWeight: 700 }}>
                  Back
                </Button>
                <Button
                  variant="contained"
                  onClick={handleWizardImportConfirm}
                  sx={{
                    bgcolor: '#10b981', '&:hover': { bgcolor: '#059669' },
                    px: 3, fontWeight: 800, boxShadow: '0 4px 14px rgba(16,185,129,0.3)', textTransform: 'none'
                  }}
                >
                  Load into View
                </Button>
              </Box>
            </Box>
          )}

          {wizardStep === 0 && (
            <Box display="flex" gap={2} justifyContent="flex-end" mt={3} borderTop="1px solid #e2e8f0" pt={2}>
              <Button onClick={() => setShowExcelWizard(false)} sx={{ color: '#64748b', fontWeight: 700 }}>
                Cancel
              </Button>
              <Button
                variant="contained"
                onClick={() => setWizardStep(1)}
                sx={{
                  bgcolor: '#3b82f6', '&:hover': { bgcolor: '#2563eb' },
                  px: 3, fontWeight: 800, textTransform: 'none'
                }}
              >
                Next
              </Button>
            </Box>
          )}

          {wizardStep === 1 && (
            <Box display="flex" gap={2} justifyContent="flex-end" mt={3} borderTop="1px solid #e2e8f0" pt={2}>
              <Button onClick={() => setWizardStep(0)} sx={{ color: '#64748b', fontWeight: 700 }}>
                Back
              </Button>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={pendingBillsModal.open} onClose={() => setPendingBillsModal(prev => ({ ...prev, open: false }))} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          Select Pending Bills for {pendingBillsModal.party}
        </DialogTitle>
        <DialogContent sx={{ p: 0, bgcolor: '#fff' }}>
          {pendingBillsModal.loading ? (
            <Box p={4} display="flex" justifyContent="center"><CircularProgress /></Box>
          ) : pendingBillsModal.bills.length === 0 ? (
            <Box p={4} display="flex" justifyContent="center"><Typography>No pending bills found for {pendingBillsModal.party}.</Typography></Box>
          ) : (
            <TableContainer sx={{ maxHeight: 400 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        indeterminate={pendingBillsModal.selectedBills.length > 0 && pendingBillsModal.selectedBills.length < pendingBillsModal.bills.length}
                        checked={pendingBillsModal.bills.length > 0 && pendingBillsModal.selectedBills.length === pendingBillsModal.bills.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            const newAllocations = {};
                            pendingBillsModal.bills.forEach(b => newAllocations[b.rawBillNumber] = b.pendingAmount);
                            setPendingBillsModal(prev => ({ ...prev, selectedBills: [...prev.bills], allocations: newAllocations }));
                          } else {
                            setPendingBillsModal(prev => ({ ...prev, selectedBills: [], allocations: {} }));
                          }
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Bill No</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Inv No</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Vehicle</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">Bill Amt</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">Paid Amt</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">Pending</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">Allocate (₹)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pendingBillsModal.bills.map(b => (
                    <TableRow key={b.rawBillNumber} hover>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={pendingBillsModal.selectedBills.some(s => s.rawBillNumber === b.rawBillNumber)}
                          onChange={() => handlePendingBillsToggleSelect(b)}
                        />
                      </TableCell>
                      <TableCell>{b.billNumber}</TableCell>
                      <TableCell>{b.invoiceNumber}</TableCell>
                      <TableCell>{b.invoiceDate ? new Date(b.invoiceDate).toLocaleDateString() : ''}</TableCell>
                      <TableCell>{b.vehicleNumber}</TableCell>
                      <TableCell align="right">₹{b.billAmount.toLocaleString('en-IN')}</TableCell>
                      <TableCell align="right" sx={{ color: 'success.main' }}>₹{b.amountPaid.toLocaleString('en-IN')}</TableCell>
                      <TableCell align="right" sx={{ color: 'error.main', fontWeight: 600 }}>₹{b.pendingAmount.toLocaleString('en-IN')}</TableCell>
                      <TableCell align="right">
                        <TextField
                          size="small"
                          type="number"
                          value={pendingBillsModal.allocations[b.rawBillNumber] !== undefined ? pendingBillsModal.allocations[b.rawBillNumber] : ''}
                          onChange={(e) => handleAllocationChange(b.rawBillNumber, e.target.value)}
                          disabled={!pendingBillsModal.selectedBills.some(s => s.rawBillNumber === b.rawBillNumber)}
                          sx={{ width: 100 }}
                          inputProps={{ style: { textAlign: 'right', padding: '4px 8px' } }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
          <Typography sx={{ mr: 'auto', fontWeight: 600 }}>
            {pendingBillsModal.selectedBills.length} bills selected (Total Allocated: ₹{pendingBillsModal.selectedBills.reduce((s, b) => s + num(pendingBillsModal.allocations[b.rawBillNumber]), 0).toLocaleString('en-IN')})
          </Typography>
          <Button onClick={() => setPendingBillsModal(prev => ({ ...prev, open: false }))} color="inherit">Cancel</Button>
          <Button onClick={handlePendingBillsApply} variant="contained" disabled={pendingBillsModal.selectedBills.length === 0}>
            Apply Total to Deposit
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}
