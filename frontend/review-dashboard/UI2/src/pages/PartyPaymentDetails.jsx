import React, { useState, useEffect, useMemo } from 'react';
import {
  Box, Typography, Button, IconButton, TextField, CircularProgress,
  Chip, Snackbar, Alert, Tooltip, MenuItem, Select, FormControl, InputLabel
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import axios from 'axios';
import { exportToCsv } from '../utils/exportCsv';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// Safe numeric parser
const num = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};
const round2 = (n) => Math.round(n);

// Normalise a vehicle number: uppercase + strip all whitespace
const normVeh = (v) => String(v || '').trim().toUpperCase().replace(/\s+/g, '');

// ─── Column definitions ───────────────────────────────────────────────────────
// calc   = auto-calculated (read-only, purple header)
// editable = manual entry (red header)
// highlight = special background for computed result columns
const COLUMNS = [
  // ① Truck DB
  { key: 'OWNER NAME',          label: 'Owner Name',              width: 150, calc: true  },
  { key: 'VEHICLE NO',           label: 'Vehicle No',              width: 120, calc: true  },
  // ③–⑫ Aggregated from Cement Register
  { key: 'GROSS FREIGHT',        label: 'Gross Freight\n(95% Payable)', width: 110, calc: true, bg: '#fef3c7' },
  { key: 'LOADING ADVANCE',      label: 'Loading\nAdvance',        width: 90,  calc: true  },
  { key: 'FUEL',                 label: 'Fuel\n(HSD Amt)',         width: 90,  calc: true  },
  { key: 'TDS',                  label: 'TDS\n(1%)',               width: 80,  calc: true  },
  { key: 'TRAVELLING EXP',       label: 'Travelling\nExp',         width: 90,  calc: true  },
  { key: 'DAMAGE RECOVERY',      label: 'Damage\nRecovery',        width: 90,  calc: true  },
  { key: 'CASH_BANK_OTHERS',     label: 'Cash/Bank\nTF/Others',    width: 100, calc: true  },
  { key: 'OTHER DEDUCTION',      label: 'Other\nDeduction',        width: 90,  calc: true  },
  { key: 'GPS TRIP CHARGE',      label: 'GPS Trip\nCharge',        width: 80,  calc: true  },
  { key: 'GPS DEVICE',           label: 'GPS\nDevice',             width: 80,  calc: true  },
  // ⑬ Net Amount  (calculated)
  { key: 'NET AMOUNT',           label: 'Net Amount',              width: 100, calc: true, highlight: '#dcfce7' },
  // ⑭–⑲ Incentives from Cement Register
  { key: '8.5% NVCL',           label: '8.5% NVCL\nIncentive',   width: 90,  calc: true, bg: '#e0f2fe' },
  { key: 'DEDICATED INCENTIVE',  label: 'Dedicated\nIncentive',    width: 90,  calc: true, bg: '#e0f2fe' },
  { key: 'RAFTER',               label: 'Rafter',                  width: 80,  calc: true, bg: '#e0f2fe' },
  { key: 'EXTRA U/L',            label: 'Extra U/L',               width: 80,  calc: true, bg: '#e0f2fe' },
  { key: 'TOLL UP',              label: 'Toll UP',                 width: 80,  calc: true, bg: '#fef08a' },
  { key: 'TOLL DOWN',            label: 'Toll Down',               width: 80,  calc: true, bg: '#fef08a' },
  // ⑳ TDS on Incentive (calculated)
  { key: 'TDS ON INCENTIVE',     label: 'TDS on\nIncentive/UL',   width: 90,  calc: true, bg: '#bbf7d0' },
  // ㉑ Total Freight (calculated)
  { key: 'TOTAL FREIGHT',        label: 'Total Freight',           width: 100, calc: true, highlight: '#f3e8ff' },
  // ㉒–㉔ Manual entries
  { key: 'GST FCM',              label: 'GST FCM',                 width: 90,  editable: true, bg: '#fee2e2' },
  { key: 'WITHHOLD AMOUNT',      label: 'Withhold\nAmount',        width: 90,  editable: true, bg: '#fee2e2' },
  { key: 'PREV MONTH DUE',       label: 'Prev Month\nDue',         width: 100, editable: true, bg: '#fee2e2' },
  // ㉕ Gross Payable (calculated)
  { key: 'GROSS PAYABLE',        label: 'Gross Payable',           width: 110, calc: true, highlight: '#e0e7ff' },
  // ㉖–㉗ Manual Credit entries
  { key: 'CREDIT DA',            label: 'Credit (DA)',             width: 90,  editable: true, bg: '#ffedd5' },
  { key: 'CREDIT DAC',           label: 'Credit (DAC)',            width: 90,  editable: true, bg: '#ffedd5' },
  // ㉘ Net Payable (calculated)
  { key: 'NET PAYABLE',          label: 'Net Payable\n(after deduct)', width: 120, calc: true, highlight: '#e0e7ff' },
  // ㉙ Manual
  { key: 'RECOVERED TO DAC',     label: 'Recovered\nto DAC',       width: 100, editable: true, bg: '#fce7f3' },
  // ㉚ Amount Paid (manual)
  { key: 'CREDIT REFUND',        label: 'Credit\nRefund',          width: 90,  editable: true, bg: '#d1fae5' },
  { key: 'PAID TO PARTY',        label: 'Paid to\nParty',          width: 90,  editable: true, bg: '#d1fae5' },
  // ㉛ Balance Due (calculated)
  { key: 'BALANCE DUE',          label: 'Balance Due',             width: 100, calc: true, highlight: '#fee2e2' },
  // ㉜–㉝ Manual
  { key: 'PAYMENT DATE',         label: 'Payment\nDate',           width: 110, editable: true, date: true, bg: '#f8fafc' },
  { key: 'REMARKS',              label: 'Remarks',                 width: 160, editable: true, bg: '#f8fafc' },
];

export default function PartyPaymentDetails({ onBack }) {
  const now = new Date();
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1);
  const [selYear,  setSelYear]  = useState(now.getFullYear());

  const [rows,       setRows]       = useState([]);
  const [localEdits, setLocalEdits] = useState({});
  const [loading,    setLoading]    = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [snack,      setSnack]      = useState(null);
  const [debugInfo,  setDebugInfo]  = useState('');

  const yearOptions = [];
  for (let y = now.getFullYear() - 2; y <= now.getFullYear() + 1; y++) yearOptions.push(y);

  // ── Fetch ────────────────────────────────────────────────────────────────────
  const fetchData = async () => {
    setLoading(true);
    setLocalEdits({});
    setDebugInfo('');
    try {
      // 1. Truck contacts → vehicle→owner map
      const truckRes = await axios.get(`${API_URL}/truck-contacts`);
      const trucksData = truckRes.data?.contacts || [];

      const truckMap = {}; // normVeh → owner name
      trucksData.forEach(t => {
        // The collection stores fields with trailing spaces e.g. "Truck No "
        const raw = t['Truck No '] || t['Truck No'] || t['Vehicle No'] || t['vehicleNo'] || '';
        const owner = (t['Owner Name '] || t['Owner Name'] || t['ownerName'] || '').trim();
        const key = normVeh(raw);
        if (key) truckMap[key] = owner;
      });

      // 2. Cement register entries for this month via our date-aware endpoint
      const cementRes = await axios.get(`${API_URL}/party-payment/cement-data`, {
        params: { month: selMonth, year: selYear }
      });
      const entries = cementRes.data?.entries || [];
      setDebugInfo(`Cement entries for month: ${entries.length}`);

      // 3. Saved manual overrides
      const manualRes = await axios.get(`${API_URL}/party-payment`, {
        params: { month: selMonth, year: selYear }
      });
      const manuals = manualRes.data || [];
      const manualMap = {};
      manuals.forEach(m => { manualMap[normVeh(m.vehicleNo)] = m; });

      // 4. Aggregate per vehicle
      const agg = {}; // normVeh → accumulated row

      entries.forEach(row => {
        // Field name in DB: "VEHICLE NUMBER"
        const rawVeh = row['VEHICLE NUMBER'] || '';
        const vKey   = normVeh(rawVeh);
        if (!vKey) return;

        if (!agg[vKey]) {
          agg[vKey] = {
            'VEHICLE NO':          rawVeh.trim().toUpperCase(),
            'OWNER NAME':          truckMap[vKey] || (row['OWNER NAME'] || '').trim() || 'Unknown',
            'GROSS FREIGHT':       0,   // = SUM of "BILLING @ 95% (PARTY PAYABLE)"
            'LOADING ADVANCE':     0,   // = SUM of "ADVANCE"
            'FUEL':                0,   // = SUM of "HSD AMOUNT"
            'TDS':                 0,   // = SUM of "TDS@1%"
            'TRAVELLING EXP':      0,   // = SUM of "TRAVELLING EXP"
            'DAMAGE RECOVERY':     0,   // = SUM of "SHORTAGE AMOUNT"
            'CASH_BANK_OTHERS':    0,   // = SUM of BANK TF + OTHERS + SITE CASH
            'OTHER DEDUCTION':     0,   // = SUM of "OTHERS DEDUCTION"
            'GPS TRIP CHARGE':     0,   // = SUM of "GPS MONITORING CHARGE"
            'GPS DEVICE':          0,   // = SUM of "GPS DEVICE"
            '8.5% NVCL':           0,   // = SUM of "10W EXTRA 8.5%"
            'DEDICATED INCENTIVE': 0,   // = SUM of "DEDICATED"
            'RAFTER':              0,   // = SUM of "RAFTER"
            'EXTRA U/L':           0,   // = SUM of "EXTRA UNLOADING"
            'TOLL UP':             0,   // = SUM of "UP TOLL"
            'TOLL DOWN':           0,   // = SUM of "DOWN TOLL"
          };
        }

        const a = agg[vKey];

        // Multi-variant field reader — tries multiple possible key names
        // (DB field names differ from the schema comment due to Excel import variations)
        const getF = (...keys) => {
          for (const k of keys) {
            const v = row[k];
            if (v !== undefined && v !== null && v !== '') {
              if (typeof v === 'object' && !Array.isArray(v)) {
                // Nested object like '10W EXTRA 8': {'5%': 59.92} — sum all values
                return Object.values(v).reduce((s, x) => s + num(x), 0);
              }
              return num(v);
            }
          }
          return 0;
        };

        // ③ Gross Freight — actual DB key is 'BILLING ER 95%'
        a['GROSS FREIGHT']       += getF('BILLING ER 95%', 'BILLING @ 95% (PARTY PAYABLE)', 'BILLING@95%', 'AMOUNT');

        // ④ Loading Advance
        a['LOADING ADVANCE']     += getF('ADVANCE');

        // ⑤ Fuel (HSD Amount)
        a['FUEL']                += getF('HSD AMOUNT');

        // ⑥ TDS — stored as _tds_percent (percentage) or TDS@1% (absolute)
        const tdsAbs  = getF('TDS@1%', 'TDS 1%', 'TDS');
        const tdsPct  = getF('_tds_percent');
        const grFr    = getF('BILLING ER 95%', 'BILLING @ 95% (PARTY PAYABLE)', 'AMOUNT');
        a['TDS'] += tdsAbs !== 0 ? tdsAbs : (tdsPct > 0 ? grFr * (tdsPct / 100) : grFr * 0.01);

        // ⑦ Travelling Expense
        a['TRAVELLING EXP']      += getF('TRAVELLING EXP', 'TRAVELLING  EXP', 'TRAVEL EXP');

        // ⑧ Damage Recovery (price per bag * total bags)
        const shortageBags = getF('SHORTAGE (BAG)', 'SHORTAGE BAG');
        const shortageRate = getF('SHORTAGE (RATE)', 'SHORTAGE RATE');
        a['DAMAGE RECOVERY']     += (shortageBags * shortageRate);

        // ⑨ Cash/Bank TF/Others — note actual key is 'Site Cash' (mixed case)
        a['CASH_BANK_OTHERS']    += getF('BANK TF', 'BANK TF ') + getF('Site Cash', 'SITE CASH', 'SITE_CASH');

        // ⑩ Other Deduction
        a['OTHER DEDUCTION']     += getF('OTHERS DEDUCTION', 'OTHERS  DEDUCTION', 'OTHER DEDUCTION', 'OTHERS');

        // ⑪ GPS Trip Charge
        a['GPS TRIP CHARGE']     += getF('GPS Monitoring Charge', 'GPS MONITORING CHARGE', 'GPS MONITORING  CHARGE', 'GPS TRIP CHARGE');

        // ⑫ GPS Device
        a['GPS DEVICE']          += getF('GPS DEVICE', 'GPS  DEVICE');

        // ⑭ 8.5% NVCL Incentive — stored as nested '10W EXTRA 8': {'5%': 59.92}
        const ncvl85 = row['10W EXTRA 8.5%'] !== undefined
          ? num(row['10W EXTRA 8.5%'])
          : row['10W EXTRA 8'] !== undefined
            ? (typeof row['10W EXTRA 8'] === 'object'
              ? Object.values(row['10W EXTRA 8']).reduce((s, x) => s + num(x), 0)
              : num(row['10W EXTRA 8']))
            : 0;
        a['8.5% NVCL'] += ncvl85;

        // ⑮ Dedicated Incentive
        a['DEDICATED INCENTIVE'] += getF('DEDICATED', 'DEDICATED INCENTIVE');

        // ⑯ Rafter
        a['RAFTER']              += getF('RAFTER');

        // ⑰ Extra U/L
        a['EXTRA U/L']           += getF('EXTRA UNLOADING', 'EXTRA  UNLOADING', 'EXTRA UL');

        // ⑱ Toll UP
        a['TOLL UP']             += getF('UP TOLL', 'TOLL UP', 'TOLL_UP', 'TOLL UP ');

        // ⑲ Toll Down
        a['TOLL DOWN']           += getF('DOWN TOLL', 'TOLL DOWN', 'TOLL_DOWN', 'TOLL DOWN ');
      });

      // 5. Build final rows merging aggregated + saved manuals
      const finalRows = Object.values(agg).map(ag => {
        const vKey  = normVeh(ag['VEHICLE NO']);
        const saved = manualMap[vKey] || {};
        return {
          ...ag,
          'GST FCM':          num(saved.gstFcm),
          'WITHHOLD AMOUNT':  num(saved.withholdAmount),
          'PREV MONTH DUE':   num(saved.prevMonthDue),
          'CREDIT DA':        num(saved.creditDa),
          'CREDIT DAC':       num(saved.creditDac),
          'RECOVERED TO DAC': num(saved.recoveredToDac),
          'CREDIT REFUND':    num(saved.creditRefund),
          'PAID TO PARTY':    num(saved.paidToParty),
          'PAYMENT DATE':     saved.paymentDate || '',
          'REMARKS':          saved.remarks     || '',
        };
      });

      // Sort by owner name then vehicle
      finalRows.sort((a, b) =>
        a['OWNER NAME'].localeCompare(b['OWNER NAME']) ||
        a['VEHICLE NO'].localeCompare(b['VEHICLE NO'])
      );

      setRows(finalRows);
    } catch (err) {
      console.error('PartyPayment fetch error:', err);
      setSnack({ severity: 'error', msg: `Failed to load: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [selMonth, selYear]); // eslint-disable-line

  // ── Computed rows (formulas) ──────────────────────────────────────────────────
  const computedRows = useMemo(() => {
    return rows.map((base, ri) => {
      const r = { ...base, ...(localEdits[ri] || {}) };

      // ⑬ Net Amount = Gross Freight - (all deductions)
      const totalDeductions =
        num(r['LOADING ADVANCE']) +
        num(r['FUEL'])            +
        num(r['TDS'])             +
        num(r['TRAVELLING EXP']) +
        num(r['DAMAGE RECOVERY']) +
        num(r['CASH_BANK_OTHERS']) +
        num(r['OTHER DEDUCTION']) +
        num(r['GPS TRIP CHARGE']) +
        num(r['GPS DEVICE']);
      r['NET AMOUNT'] = round2(num(r['GROSS FREIGHT']) - totalDeductions);

      // ⑳ TDS on Incentive = (Dedicated Incentive + Extra U/L) × 1%
      r['TDS ON INCENTIVE'] = round2((num(r['DEDICATED INCENTIVE']) + num(r['EXTRA U/L'])) * 0.01);

      // ㉑ Total Freight = Net Amount + (8.5% NVCL + Dedicated + Extra UL + Toll UP + Toll Down) − TDS on Incentive
      const incentiveSum =
        num(r['8.5% NVCL'])           +
        num(r['DEDICATED INCENTIVE']) +
        num(r['EXTRA U/L'])           +
        num(r['TOLL UP'])             +
        num(r['TOLL DOWN']);
      r['TOTAL FREIGHT'] = round2(r['NET AMOUNT'] + incentiveSum - r['TDS ON INCENTIVE']);

      // ㉕ Gross Payable = (Total Freight + GST FCM + Prev Month Due) − Withhold Amount
      r['GROSS PAYABLE'] = round2(
        r['TOTAL FREIGHT'] +
        num(r['GST FCM'])        +
        num(r['PREV MONTH DUE']) -
        num(r['WITHHOLD AMOUNT'])
      );

      // ㉘ Net Payable = Gross Payable − (Credit DA + Credit DAC)
      r['NET PAYABLE'] = round2(r['GROSS PAYABLE'] - (num(r['CREDIT DA']) + num(r['CREDIT DAC'])));

      // ㉛ Balance Due = Net Payable − Paid to Party
      r['BALANCE DUE'] = round2(r['NET PAYABLE'] - num(r['PAID TO PARTY']));

      return r;
    });
  }, [rows, localEdits]);

  // ── Totals row ────────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const t = {};
    COLUMNS.forEach(c => {
      if (!['OWNER NAME', 'VEHICLE NO', 'PAYMENT DATE', 'REMARKS'].includes(c.key)) t[c.key] = 0;
    });
    computedRows.forEach(r => { for (const k in t) t[k] += num(r[k]); });
    return t;
  }, [computedRows]);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleEdit = (ri, field, val) =>
    setLocalEdits(prev => ({ ...prev, [ri]: { ...(prev[ri] || {}), [field]: val } }));

  const handleSave = async () => {
    const dirtyIdxs = Object.keys(localEdits).map(Number);
    if (!dirtyIdxs.length) return setSnack({ severity: 'info', msg: 'No changes to save.' });
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const data  = dirtyIdxs.map(ri => {
        const cr = computedRows[ri];
        return {
          vehicleNo:      cr['VEHICLE NO'],
          gstFcm:         num(cr['GST FCM']),
          withholdAmount: num(cr['WITHHOLD AMOUNT']),
          prevMonthDue:   num(cr['PREV MONTH DUE']),
          creditDa:       num(cr['CREDIT DA']),
          creditDac:      num(cr['CREDIT DAC']),
          recoveredToDac: num(cr['RECOVERED TO DAC']),
          creditRefund:   num(cr['CREDIT REFUND']),
          paidToParty:    num(cr['PAID TO PARTY']),
          paymentDate:    cr['PAYMENT DATE'] || '',
          remarks:        cr['REMARKS']      || '',
        };
      });
      await axios.post(`${API_URL}/party-payment/bulk`,
        { month: selMonth, year: selYear, data },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSnack({ severity: 'success', msg: 'Saved successfully!' });
      setRows(prev => {
        const next = [...prev];
        dirtyIdxs.forEach(ri => { next[ri] = { ...next[ri], ...(localEdits[ri]) }; });
        return next;
      });
      setLocalEdits({});
    } catch (err) {
      console.error(err);
      setSnack({ severity: 'error', msg: 'Save failed.' });
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    if (!computedRows.length) return setSnack({ severity: 'warning', msg: 'No data to export.' });
    exportToCsv(
      `PartyPayment_${MONTH_NAMES[selMonth - 1]}_${selYear}.xls`,
      [...computedRows, { 'OWNER NAME': 'TOTAL', ...totals }]
    );
  };

  const dirtyCount = Object.keys(localEdits).length;

  // ── Sticky column offsets ─────────────────────────────────────────────────────
  // #(40) | Owner Name(150) | Vehicle No(120)
  const stickyLeft = { '#': 0, 'OWNER NAME': 40, 'VEHICLE NO': 190 };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#f4f7f9', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <Box sx={{ p: 2, bgcolor: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 2, zIndex: 10 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <IconButton onClick={onBack} size="small" sx={{ bgcolor: '#ede9fe', '&:hover': { bgcolor: '#ddd6fe' } }}>
            <ArrowBackIcon fontSize="small" sx={{ color: '#6d28d9' }} />
          </IconButton>
          <Typography variant="h6" fontWeight={900} sx={{ color: '#0f172a', letterSpacing: '-0.5px' }}>
            Party Payment Details
          </Typography>
          <Chip label="Cement Register + Truck DB" size="small" variant="outlined"
            sx={{ fontWeight: 700, borderColor: '#c4b5fd', color: '#6d28d9' }} />
          {debugInfo && (
            <Chip label={debugInfo} size="small" variant="outlined"
              sx={{ fontWeight: 600, borderColor: '#86efac', color: '#16a34a', fontSize: 11 }} />
          )}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Month</InputLabel>
            <Select value={selMonth} label="Month" onChange={e => setSelMonth(e.target.value)}>
              {MONTH_NAMES.map((m, i) => <MenuItem key={i} value={i + 1}>{m}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 100 }}>
            <InputLabel>Year</InputLabel>
            <Select value={selYear} label="Year" onChange={e => setSelYear(e.target.value)}>
              {yearOptions.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
            </Select>
          </FormControl>

          <Chip
            label={`${computedRows.length} vehicle${computedRows.length !== 1 ? 's' : ''}`}
            size="small"
            sx={{ bgcolor: '#ede9fe', fontWeight: 700, color: '#6d28d9' }}
          />
          {dirtyCount > 0 && (
            <Chip label={`${dirtyCount} unsaved row${dirtyCount > 1 ? 's' : ''}`} size="small" color="warning" sx={{ fontWeight: 700 }} />
          )}

          <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
            <Tooltip title="Reload from Cement Register & database">
              <IconButton size="small" onClick={fetchData} sx={{ bgcolor: '#f1f5f9' }}>
                <RefreshIcon fontSize="small" sx={{ color: '#475569' }} />
              </IconButton>
            </Tooltip>
            <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={handleExport}
              sx={{ fontWeight: 700, borderRadius: 2, borderColor: '#6d28d9', color: '#6d28d9' }}>
              XLS
            </Button>
            <Button
              size="small" variant="contained"
              disabled={saving || dirtyCount === 0}
              startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
              onClick={handleSave}
              sx={{ fontWeight: 700, borderRadius: 2, bgcolor: '#10b981', '&:hover': { bgcolor: '#059669' }, px: 3, boxShadow: '0 4px 10px rgba(16,185,129,0.3)' }}
            >
              Save Edits
            </Button>
          </Box>
        </Box>
      </Box>

      {/* ── Spreadsheet ── */}
      <Box sx={{ overflow: 'auto', flex: 1 }}>
        {loading ? (
          <Box display="flex" alignItems="center" justifyContent="center" height="100%" gap={2}>
            <CircularProgress sx={{ color: '#6d28d9' }} />
            <Typography fontWeight={600} color="text.secondary">
              Fetching trip data & generating party ledger…
            </Typography>
          </Box>
        ) : (
          <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', fontFamily: 'Inter, system-ui, sans-serif', fontSize: '12px', minWidth: 'max-content' }}>
            <colgroup>
              <col style={{ width: 40, minWidth: 40 }} />
              {COLUMNS.map(c => <col key={c.key} style={{ width: c.width, minWidth: c.width }} />)}
            </colgroup>

            {/* ── Head ── */}
            <thead>
              <tr>
                {/* # */}
                <th style={{
                  position: 'sticky', top: 0, left: 0, zIndex: 6,
                  background: '#6d28d9', color: '#fff',
                  padding: '10px 4px', textAlign: 'center', fontSize: 11, fontWeight: 900,
                  border: '1px solid #5b21b6', whiteSpace: 'nowrap'
                }}>#</th>

                {COLUMNS.map((col, ci) => {
                  const isSticky = col.key === 'OWNER NAME' || col.key === 'VEHICLE NO';
                  const leftPx   = isSticky ? stickyLeft[col.key] : undefined;
                  const bg       = col.editable ? '#e11d48' : col.highlight ? '#4f46e5' : '#6d28d9';
                  return (
                    <th key={col.key} style={{
                      position: 'sticky', top: 0,
                      left: isSticky ? leftPx : undefined,
                      zIndex: isSticky ? 7 : 5,
                      background: bg, color: '#fff',
                      padding: '10px 6px', textAlign: 'center',
                      fontSize: 11, fontWeight: 900, border: '1px solid #5b21b6',
                      whiteSpace: 'pre-line', lineHeight: 1.25,
                    }}>
                      {col.label}
                      {col.editable && <div style={{ fontSize: 9, opacity: 0.85, fontWeight: 400, marginTop: 1 }}>✎ manual</div>}
                      {col.calc    && <div style={{ fontSize: 9, opacity: 0.65, fontWeight: 400, marginTop: 1 }}>∑ auto</div>}
                    </th>
                  );
                })}
              </tr>
            </thead>

            {/* ── Body ── */}
            <tbody>
              {computedRows.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length + 1} style={{ textAlign: 'center', padding: '48px 20px', color: '#64748b', fontSize: 14 }}>
                    No cement register trips found for <strong>{MONTH_NAMES[selMonth - 1]} {selYear}</strong>.
                  </td>
                </tr>
              )}

              {computedRows.map((row, ri) => {
                const rowBg = ri % 2 === 0 ? '#fff' : '#fafafa';
                return (
                  <tr key={ri}>
                    {/* # cell */}
                    <td style={{
                      position: 'sticky', left: 0, zIndex: 3,
                      textAlign: 'center', border: '1px solid #e2e8f0',
                      fontWeight: 700, color: '#6d28d9', padding: '5px 4px',
                      background: '#f5f3ff', fontSize: 11
                    }}>
                      {ri + 1}
                    </td>

                    {COLUMNS.map(col => {
                      const val     = row[col.key];
                      const isDirty = localEdits[ri]?.[col.key] !== undefined;
                      const isSticky = col.key === 'OWNER NAME' || col.key === 'VEHICLE NO';
                      const leftPx   = isSticky ? stickyLeft[col.key] : undefined;

                      const isText   = ['OWNER NAME', 'VEHICLE NO', 'REMARKS'].includes(col.key);
                      const isDate   = col.key === 'PAYMENT DATE';
                      const align    = isText ? 'left' : isDate ? 'center' : 'right';

                      // Cell background priority: dirty → highlight → col.bg → alternating row
                      const cellBg = isDirty
                        ? '#fef08a'
                        : (col.highlight || col.bg || rowBg);

                      // Format number with Indian comma grouping
                      let display = '';
                      if (val !== null && val !== undefined && val !== '') {
                        if (isDate) {
                          // Try converting standard YYYY-MM-DD to DD-MM-YYYY for display
                          if (/^\d{4}-\d{2}-\d{2}$/.test(String(val))) {
                            const [y, m, d] = String(val).split('-');
                            display = `${d}-${m}-${y}`;
                          } else {
                            display = String(val);
                          }
                        } else if (isText) {
                          display = String(val);
                        } else {
                          const n = num(val);
                          display = n !== 0 ? n.toLocaleString('en-IN') : '0';
                        }
                      }

                      return (
                        <td key={col.key} style={{
                          position: isSticky ? 'sticky' : undefined,
                          left: isSticky ? leftPx : undefined,
                          zIndex: isSticky ? 3 : 1,
                          border: '1px solid #e2e8f0',
                          background: cellBg,
                          padding: 0,
                          fontWeight: col.calc ? 600 : isDirty ? 800 : 400,
                          color: isDirty ? '#92400e' : '#0f172a',
                        }}>
                          {col.editable ? (
                            <TextField
                              type={col.date ? 'date' : 'text'}
                              variant="standard"
                              value={val !== undefined && val !== null ? val : ''}
                              onChange={e => handleEdit(ri, col.key, e.target.value)}
                              InputProps={{ disableUnderline: true }}
                              sx={{
                                width: '100%',
                                '.MuiInputBase-input': {
                                  padding: '5px 7px', fontSize: 12,
                                  fontWeight: isDirty ? 800 : 500,
                                  color: isDirty ? '#92400e' : '#0f172a',
                                  textAlign: align,
                                  fontFamily: !isText && !isDate ? 'monospace' : 'inherit',
                                  // remove ugly calendar picker default styles when empty
                                  '&::-webkit-calendar-picker-indicator': {
                                    cursor: 'pointer',
                                    opacity: 0.6,
                                    '&:hover': { opacity: 1 }
                                  }
                                }
                              }}
                            />
                          ) : (
                            <div style={{ padding: '5px 7px', textAlign: align, fontFamily: !isText && !isDate ? 'monospace' : 'inherit' }}>
                              {display}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>

            {/* ── Totals ── */}
            {computedRows.length > 0 && (
              <tfoot>
                <tr style={{ position: 'sticky', bottom: 0, zIndex: 10, boxShadow: '0 -2px 8px rgba(0,0,0,0.08)' }}>
                  {/* # */}
                  <td style={{
                    position: 'sticky', left: 0, zIndex: 12,
                    background: '#6d28d9', border: '1px solid #5b21b6',
                    padding: '8px 6px', textAlign: 'center',
                    fontWeight: 900, color: '#fff', fontSize: 11
                  }}>Σ</td>

                  {COLUMNS.map(col => {
                    const isSticky = col.key === 'OWNER NAME' || col.key === 'VEHICLE NO';
                    const leftPx   = isSticky ? stickyLeft[col.key] : undefined;

                    let cellContent = '—';
                    if (col.key === 'OWNER NAME') cellContent = 'TOTAL';
                    else if (col.key === 'VEHICLE NO') cellContent = '';
                    else if (!['PAYMENT DATE', 'REMARKS'].includes(col.key) && totals[col.key] !== undefined) {
                      cellContent = totals[col.key] !== 0
                        ? `₹${round2(totals[col.key]).toLocaleString('en-IN')}`
                        : '₹0';
                    }

                    const isText = ['OWNER NAME', 'VEHICLE NO', 'REMARKS'].includes(col.key);

                    return (
                      <td key={col.key} style={{
                        position: isSticky ? 'sticky' : undefined,
                        left: isSticky ? leftPx : undefined,
                        zIndex: isSticky ? 12 : 10,
                        padding: '8px 7px', border: '1px solid #5b21b6',
                        fontWeight: 900, fontSize: 12,
                        color: col.key === 'OWNER NAME' ? '#fff' : '#0f172a',
                        textAlign: isText ? 'left' : 'right',
                        background: col.key === 'OWNER NAME' ? '#6d28d9' : col.highlight ? col.highlight : '#f1f5f9',
                        fontFamily: !isText ? 'monospace' : 'inherit',
                      }}>
                        {cellContent}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </Box>

      <Snackbar open={!!snack} autoHideDuration={4000} onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {snack && <Alert severity={snack.severity} variant="filled">{snack.msg}</Alert>}
      </Snackbar>
    </Box>
  );
}
