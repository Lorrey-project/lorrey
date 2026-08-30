import React, { useState, useEffect, useMemo } from 'react';
import { Box, Typography, Button, Snackbar, Alert, CircularProgress, Tooltip, Select, MenuItem, FormControl } from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import InfoIcon from '@mui/icons-material/Info';
import axios from 'axios';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_IO_URL || import.meta.env.VITE_API_URL;
const socket = io(SOCKET_URL, { autoConnect: true, transports: ["websocket", "polling"] });

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const API_URL = import.meta.env.VITE_API_URL;

const parseAmount = (val) => {
  if (val === null || val === undefined || val === '') return 0;
  const num = parseFloat(String(val).replace(/,/g, ''));
  return isNaN(num) ? 0 : num;
};

const formatAmount = (val) => {
  return Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const parseInvoiceDate = (dateStr) => {
  if (!dateStr) return null;
  // Check format: YYYY-MM-DD
  let parts = String(dateStr).split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  // Check format: DD.MM.YYYY or DD-MM-YYYY
  parts = String(dateStr).split(/[.-]/);
  if (parts.length === 3 && parts[2].length === 4) {
    return new Date(parts[2], parts[1] - 1, parts[0]);
  }
  
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
};

const getMonthYearStr = (dateObj) => {
  if (!dateObj) return null;
  return `${MONTH_NAMES[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
};

export default function Gstr1Tab({ filterMonth, filterYear }) {
  const [rows, setRows] = useState([]);
  const [siteFilter, setSiteFilter] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('ALL');
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState({ open: false, message: '', type: 'success' });

  // Compute the Financial Year string for the Bill Register fetch
  // E.g., if filterMonth=8 (August) and filterYear=2026, then it's part of FY 2026-2027
  // If filterMonth=2 (February) and filterYear=2027, it's also FY 2026-2027
  const fyYearStr = useMemo(() => {
    if (!filterYear) return '';
    if (filterMonth >= 4) {
      return `${filterYear}-${filterYear + 1}`;
    } else {
      return `${filterYear - 1}-${filterYear}`;
    }
  }, [filterMonth, filterYear]);

  useEffect(() => {
    const fetchBillRegisterData = async () => {
      if (!fyYearStr) return;
      setLoading(true);
      try {
        const [gstDataRes, fyDataRes] = await Promise.all([
          axios.get(`${API_URL}/gst-portal`),
          axios.get(`${API_URL}/fy-details/data`, { params: { fy: fyYearStr } })
        ]);

        const gstPortalEntries = (gstDataRes.data?.entries || []).filter(e => e.type === 'gstr1');
        const allFyRows = fyDataRes.data?.rows || [];

        let sourceRows = [];
        if (gstPortalEntries.length > 0) {
          sourceRows = gstPortalEntries.map(g => ({
            invoiceNumber: g['Invoice Number'] || g.sourceBillId,
            displayInvoiceNumber: g['Invoice Number'],
            invoiceDate: g['Invoice Date'],
            month: g['Month'],
            site: g['SITE'],
            billType: g['BILL'],
            amount: parseAmount(g['Amount']),
            cgst: parseAmount(g['CGST']),
            sgst: parseAmount(g['SGST']),
            totalAmount: parseAmount(g['Total Amount']),
            sentToGST: true
          }));
        } else {
          sourceRows = allFyRows;
        }

        const mappedRows = sourceRows.map((r, i) => {
          const amt = parseAmount(r.amount);
          let c = parseAmount(r.cgst);
          let s = parseAmount(r.sgst);
          
          if (c === 0 && s === 0 && amt > 0) {
            c = Math.round(amt * 0.09);
            s = Math.round(amt * 0.09);
          }

          const parsedDate = parseInvoiceDate(r.invoiceDate);
          const monthYearStr = getMonthYearStr(parsedDate);

          return {
            id: r.invoiceNumber || `temp-${i}`,
            slNo: i + 1,
            invoiceDate: r.invoiceDate || '',
            invoiceDateObj: parsedDate,
            monthYearStr: monthYearStr,
            invoiceNumber: r.displayInvoiceNumber || r.invoiceNumber || '',
            month: r.month || '',
            site: r.site || '',
            billSubmissionThrough: 'PORTAL',
            bill: r.billType || '',
            billType: r.billType || '',
            amount: amt,
            cgst: c,
            sgst: s,
            totalAmount: amt + c + s
          };
        });

        setRows(mappedRows);
      } catch (err) {
        console.error("Failed to fetch bill register data", err);
        setNotification({ open: true, message: 'Failed to sync with Bill Register', type: 'error' });
      } finally {
        setLoading(false);
      }
    };

    fetchBillRegisterData();

    const handler = () => {
      fetchBillRegisterData();
    };
    socket.on('gstPortalUpdates', handler);
    socket.on('fyDetailsUpdates', handler);
    return () => {
      socket.off('gstPortalUpdates', handler);
      socket.off('fyDetailsUpdates', handler);
    };
  }, [fyYearStr, filterMonth]);

  const availableMonths = useMemo(() => {
    const unique = new Set();
    rows.forEach(r => {
      if (r.monthYearStr) {
        unique.add(r.monthYearStr);
      }
    });
    // Sort descending by Year and then Month
    return Array.from(unique).sort((a, b) => {
      const [monthA, yearA] = a.split(' ');
      const [monthB, yearB] = b.split(' ');
      if (yearA !== yearB) return Number(yearB) - Number(yearA);
      return MONTH_NAMES.indexOf(monthB) - MONTH_NAMES.indexOf(monthA);
    });
  }, [rows]);

  // Reset dateFilter to ALL if the currently selected filter is no longer available after an update
  useEffect(() => {
    if (dateFilter !== 'ALL' && !availableMonths.includes(dateFilter)) {
      setDateFilter('ALL');
    }
  }, [availableMonths, dateFilter]);

  const filteredRows = useMemo(() => {
    let result = rows;
    if (siteFilter !== 'ALL') {
      result = result.filter(r => (r.site || '').trim().toUpperCase() === siteFilter.toUpperCase());
    }
    if (dateFilter !== 'ALL') {
      result = result.filter(r => r.monthYearStr === dateFilter);
    }
    return result;
  }, [rows, siteFilter, dateFilter]);

  // Calculate overall totals
  const totals = useMemo(() => {
    let amount = 0, cgst = 0, sgst = 0, totalAmount = 0;
    filteredRows.forEach(row => {
      amount += row.amount;
      cgst += row.cgst;
      sgst += row.sgst;
      totalAmount += row.totalAmount;
    });
    return { amount, cgst, sgst, totalAmount };
  }, [filteredRows]);

  const CellDisplay = ({ value, align = "left", isNumeric = false }) => {
    const displayValue = isNumeric ? (typeof value === 'number' ? formatAmount(value) : value) : value;
    return (
      <Box sx={{ 
        width: '100%', boxSizing: 'border-box', padding: '8px 6px',
        fontSize: '13px', fontFamily: 'inherit', textAlign: align,
        color: '#334155', backgroundColor: 'transparent',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
      }}>
        {displayValue || '-'}
      </Box>
    );
  };

  const thStyle = {
    position: 'sticky',
    top: 0,
    backgroundColor: '#f1f5f9',
    color: '#1e293b',
    padding: '12px 8px',
    borderBottom: '2px solid #cbd5e1',
    borderRight: '1px solid #e2e8f0',
    fontSize: '12px',
    fontWeight: 700,
    textTransform: 'uppercase',
    textAlign: 'center',
    zIndex: 10,
    whiteSpace: 'normal',
    wordWrap: 'break-word',
    boxShadow: '0 2px 2px -1px rgba(0,0,0,0.1)'
  };

  const tdStyle = {
    padding: '2px 4px',
    borderBottom: '1px solid #e2e8f0',
    borderRight: '1px solid #e2e8f0',
    backgroundColor: '#fff'
  };

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, flex: 1, height: '100%', bgcolor: '#f8fafc', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      
      {/* Page Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h4" fontWeight="800" color="#0f172a">GSTR-1</Typography>
            <Tooltip title="Data automatically sourced from Bill Register">
              <InfoIcon color="primary" sx={{ opacity: 0.7 }} />
            </Tooltip>
          </Box>
          <Typography variant="subtitle2" color="#64748b" fontWeight="600" mt={0.5}>
            GST Return / Invoice Details (Synced with Bill Register)
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="subtitle2" fontWeight="700" color="#475569">SITE:</Typography>
            <Select
              size="small"
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value)}
              sx={{ minWidth: 120, height: 36, backgroundColor: '#fff', fontSize: '13px', fontWeight: 600 }}
            >
              <MenuItem value="ALL">ALL</MenuItem>
              <MenuItem value="NVL">NVL</MenuItem>
              <MenuItem value="NVCL">NVCL</MenuItem>
            </Select>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="subtitle2" fontWeight="700" color="#475569">INVOICE DATE:</Typography>
            <Select
              size="small"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              sx={{ minWidth: 160, height: 36, backgroundColor: '#fff', fontSize: '13px', fontWeight: 600 }}
            >
              <MenuItem value="ALL">ALL</MenuItem>
              {availableMonths.map(m => (
                <MenuItem key={m} value={m}>{m}</MenuItem>
              ))}
            </Select>
          </Box>
          <Button 
            variant="contained" 
            color="primary" 
            startIcon={<SaveIcon />} 
            disabled={true} // Disabled because data comes from the Bill Register
            sx={{ px: 4, py: 1.5, fontWeight: 'bold', borderRadius: 1, opacity: 0.7 }}
          >
            SAVE GSTR-1
          </Button>
        </Box>
      </Box>

      {/* Table Container */}
      <Box sx={{ 
        flex: 1, 
        overflow: 'auto', 
        border: '1px solid #cbd5e1', 
        borderRadius: '4px',
        backgroundColor: '#fff',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
        mb: 2,
        position: 'relative'
      }}>
        {loading && (
          <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.7)', zIndex: 20 }}>
            <CircularProgress />
          </Box>
        )}
        <table style={{ width: '100%', minWidth: '1350px', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: '50px' }}>Sl No</th>
              <th style={{ ...thStyle, width: '120px' }}>Invoice Date</th>
              <th style={{ ...thStyle, width: '150px' }}>Invoice Number</th>
              <th style={{ ...thStyle, width: '100px' }}>Month</th>
              <th style={{ ...thStyle, width: '130px' }}>SITE</th>
              <th style={{ ...thStyle, width: '180px' }}>BILL SUBMISSION THROUGH</th>
              <th style={{ ...thStyle, width: '150px' }}>BILL</th>
              <th style={{ ...thStyle, width: '150px' }}>BILL TYPE</th>
              <th style={{ ...thStyle, width: '120px' }}>Amount</th>
              <th style={{ ...thStyle, width: '110px' }}>CGST</th>
              <th style={{ ...thStyle, width: '110px' }}>SGST</th>
              <th style={{ ...thStyle, width: '130px' }}>Total Amount</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 && !loading && (
              <tr>
                <td colSpan={12} style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                  No bills found in the Bill Register for this month and site.
                </td>
              </tr>
            )}
            {filteredRows.map((row) => (
              <tr key={row.id} style={{ transition: 'background-color 0.2s', '&:hover': { backgroundColor: '#f1f5f9' } }}>
                <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc' }}>
                  {row.slNo}
                </td>
                <td style={tdStyle}><CellDisplay value={row.invoiceDate} align="center" /></td>
                <td style={tdStyle}><CellDisplay value={row.invoiceNumber} /></td>
                <td style={tdStyle}><CellDisplay value={row.month} align="center" /></td>
                <td style={tdStyle}><CellDisplay value={row.site} /></td>
                <td style={tdStyle}><CellDisplay value={row.billSubmissionThrough} /></td>
                <td style={tdStyle}><CellDisplay value={row.bill} /></td>
                <td style={tdStyle}><CellDisplay value={row.billType} /></td>
                <td style={tdStyle}><CellDisplay value={row.amount} isNumeric align="right" /></td>
                <td style={tdStyle}><CellDisplay value={row.cgst} isNumeric align="right" /></td>
                <td style={tdStyle}><CellDisplay value={row.sgst} isNumeric align="right" /></td>
                <td style={{ ...tdStyle, textAlign: 'right', paddingRight: '12px', fontWeight: 700, color: '#0f172a' }}>
                  ₹{formatAmount(row.totalAmount)}
                </td>
              </tr>
            ))}

            {/* Total Row */}
            {filteredRows.length > 0 && (
              <tr style={{ backgroundColor: '#f1f5f9' }}>
                <td colSpan={8} style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, paddingRight: '16px', fontSize: '13px', color: '#0f172a', backgroundColor: '#f8fafc' }}>
                  TOTAL
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, paddingRight: '6px', fontSize: '13px', color: '#0f172a', backgroundColor: '#f8fafc' }}>
                  ₹{formatAmount(totals.amount)}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, paddingRight: '6px', fontSize: '13px', color: '#0f172a', backgroundColor: '#f8fafc' }}>
                  ₹{formatAmount(totals.cgst)}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, paddingRight: '6px', fontSize: '13px', color: '#0f172a', backgroundColor: '#f8fafc' }}>
                  ₹{formatAmount(totals.sgst)}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, paddingRight: '12px', fontSize: '13px', color: '#0f172a', backgroundColor: '#f8fafc' }}>
                  ₹{formatAmount(totals.totalAmount)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
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


