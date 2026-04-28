import React, { useMemo, useState, useEffect } from 'react';
import axios from 'axios';
import {
  Box, Button, Typography, IconButton, Select, MenuItem,
  Tooltip, Divider, Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import SaveIcon from '@mui/icons-material/Save';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import * as XLSX from 'xlsx';

// ─── helpers ──────────────────────────────────────────────────────────────────
function num(val, fb = 0) { const n = parseFloat(val); return isNaN(n) ? fb : n; }

// Robust date parser — handles DD-MM-YYYY, DD/MM/YYYY and ISO strings
// LOADING DT from the server is stored as "DD-MM-YYYY" (e.g. "13-04-2026")
function parseLoadingDate(str) {
  if (!str) return null;
  // Try DD-MM-YYYY or DD/MM/YYYY
  const parts = String(str).split(/[-\/]/);
  if (parts.length === 3) {
    const [a, b, c] = parts.map(Number);
    // If first part is a valid day (1-31) and second is a valid month (1-12)
    if (a >= 1 && a <= 31 && b >= 1 && b <= 12 && c > 100) {
      return new Date(c, b - 1, a); // year, month(0-indexed), day
    }
    // Try YYYY-MM-DD (ISO without time)
    if (a > 100 && b >= 1 && b <= 12 && c >= 1 && c <= 31) {
      return new Date(a, b - 1, c);
    }
  }
  // Fallback: let JS try
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

// Month names for display
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// ─── Classify a single cement-register row as NVL (ATOA) or NVCL (MKT) ────────
// Priority: _is_ato server flag → Bill Type → PARTY NAME heuristic
function classifyRow(row) {
  // 0. Explicit UI override: If the user sets "SITE" exactly to NVL or NVCL
  const site = (row['SITE'] || '').toUpperCase().trim();
  if (site === 'NVL') return 'NVL';
  if (site === 'NVCL') return 'NVCL';

  // 1. Server-set ATO flag
  if (row._is_ato === true || row._is_ato === 'true') return 'NVL';
  if (row._is_ato === false || row._is_ato === 'false') return 'NVCL';

  // 2. Bill Type: NT = normal dedicated (NVL/ATOA), STO/SO = spot market (NVCL/MKT)
  const billType = (row['Bill Type'] || '').toUpperCase();
  if (billType === 'NT') return 'NVL';
  if (billType === 'STO' || billType === 'SO') return 'NVCL';

  // 3. Explicit TYPE field
  const type = (row['TYPE'] || '').toUpperCase();
  if (type === 'ATOA' || type === 'ATO') return 'NVL';
  if (type === 'MKT') return 'NVCL';

  return 'NVL'; // safe default
}

// Derive the display TYPE string (ATOA / MKT) for a truck entry
function truckDisplayType(row) {
  const cat = classifyRow(row);
  if (row['TYPE']) return row['TYPE'];           // use explicit TYPE field if present
  return cat === 'NVL' ? 'ATOA' : 'MKT';
}

// ─── Core aggregation ─────────────────────────────────────────────────────────
// Logic per user spec:
//   Sum of Inv Qty  = Σ MT  (all monthly trips for this truck, per NVL/NVCL)
//   Sum of ORG FREIGHT = Σ (MT × BILLING)   → the raw freight value
//   Sum of Amt      = 9.5% of Sum of ORG FREIGHT  → the incentive figure
//   Total           = NVL Sum of Amt + NVCL Sum of Amt
//   Final TOTAL     = Total + 10W Extra 8.5%
function buildIncentiveData(rows, year, month, truckContacts = []) {
  // 1. Filter to selected month (by LOADING DT)
  const filtered = rows.filter(row => {
    const ld = row['LOADING DT'];
    const d = parseLoadingDate(ld);
    if (!d) return false;
    return d.getFullYear() === year && d.getMonth() === month;
  });

  // 2. Group by VEHICLE NUMBER (truck)
  const byTruck = {};
  for (const row of filtered) {
    const truck = (row['VEHICLE NUMBER'] || '').trim().toUpperCase();
    if (!truck) continue;

    if (!byTruck[truck]) {
      // Find contact info from MongoDB
      const contact = truckContacts.find(c => {
        const dbNo = (c['Truck No '] || c['Truck No'] || c.truck_no || '').trim().toUpperCase();
        return dbNo === truck;
      });

      const dbWheel = contact ? (
        contact['Type of vehicle '] ||
        contact['Type of vehicle'] ||
        contact['type_of_vehicle'] ||
        contact.veh_type ||
        ''
      ) : '';

      const owner = contact ? (contact['Owner Name '] || contact['Owner Name'] || contact.owner_name || '') : '';

      // Determine Customer Type (ATOA vs MKT) from Database primary
      const dbCustType = contact ? (
        contact['TYPE OF CUSTOMER '] ||
        contact['type_of_customer'] ||
        contact['type_of_customers'] ||
        contact.cust_type ||
        contact.type ||
        ''
      ) : '';
      let displayType = truckDisplayType(row); // fallback to trip logic
      if (dbCustType) {
        const upper = String(dbCustType).toUpperCase().trim();
        if (upper === 'ATOA' || upper === 'ATO') displayType = 'ATOA';
        else if (upper === 'MKT') displayType = 'MKT';
      }

      const commApp = contact ? (contact['Basic Freight Comission Applicability '] || contact.basic_freight_commission_applicability || '') : '';
      const commValue = contact ? (contact.basic_freight_commission || contact['basic_freight_commission '] || 0.05) : 0.05;

      byTruck[truck] = {
        type: displayType,
        ownerName: row['OWNER NAME'] || owner || '',
        truckNo: truck,
        wheel: row['WHEEL'] || dbWheel || '',
        tripsCount: 0,
        nvl: { invQty: 0, orgFreight: 0, amt: 0 },
        nvcl: { invQty: 0, orgFreight: 0, amt: 0 },
        extra10W: 0,
        extra6W: 0,
        commission: 0,
        hasComm: String(commApp).toUpperCase().includes('YES'),
        commRate: num(commValue, 0.05)
      };
    }

    const entry = byTruck[truck];
    const cat = classifyRow(row);
    const mt = num(row['MT']);
    const billing = num(row['BILLING']);
    const orgFreight = billing * mt;

    // Track actual trip count (number of loading entries)
    entry.tripsCount += 1;

    // Rule 1: 9.5% Base Incentive on all wheels/bills (SO/STO/NT)
    const baseIncentive = orgFreight * 0.095;

    if (cat === 'NVL') {
      entry.nvl.invQty = Math.round(entry.nvl.invQty + mt);
      entry.nvl.orgFreight += orgFreight;
      entry.nvl.amt += baseIncentive;
    } else {
      entry.nvcl.invQty = Math.round(entry.nvcl.invQty + mt);
      entry.nvcl.orgFreight += orgFreight;
      entry.nvcl.amt += baseIncentive;
    }

    // Rule 2 & 3: Wheel Bonuses (Only on SO/NT)
    const bType = (row['Bill Type'] || '').toUpperCase();
    const isSoOrNt = bType === 'SO' || bType === 'NT';

    if (isSoOrNt) {
      const wheelStr = String(entry.wheel).toLowerCase();
      if (wheelStr.includes('10')) {
        entry.extra10W += orgFreight * 0.085;
      } else if (wheelStr.includes('6')) {
        entry.extra6W += orgFreight * 0.15;
      }
    }

    // Commission logic (use dynamic rate from contact, fallback to 5%)
    if (entry.hasComm) {
      const commRate = num(entry.commRate, 0.05);
      entry.commission += orgFreight * commRate;
    }

    // Add any manual override extra if present in row
    const manualW10 = num(row['10W EXTRA 8.5%']);
    if (manualW10 > 0) entry.extra10W += manualW10;
  }
  // 3. Final Aggregation with Achievement Criteria
  return Object.values(byTruck).map(t => {
    const metCriteria = t.tripsCount > 6;

    // PERFORMANCE RULE: Bonuses (10W/6W extra) are only paid if > 6 trips
    // Base 9.5% (nvl.amt/nvcl.amt) is now always shown as per user request
    if (!metCriteria) {
      t.extra10W = 0;
      t.extra6W = 0;
    }

    // Round the sub-amounts for visual consistency
    t.nvl.amt = Math.round(t.nvl.amt);
    t.nvcl.amt = Math.round(t.nvcl.amt);
    t.extra10W = Math.round(t.extra10W);
    t.extra6W = Math.round(t.extra6W);

    const nvlNvclTotal = t.nvl.amt + t.nvcl.amt;
    const totalIncentiveWithBonus = nvlNvclTotal + t.extra10W + t.extra6W;
    const totalFinal = totalIncentiveWithBonus - Math.round(t.commission); // Final Settlement

    return { ...t, total: nvlNvclTotal, totalFinal };
  }).sort((a, b) => a.type.localeCompare(b.type) || a.ownerName.localeCompare(b.ownerName));
}

// ─── Comparison Logic & Excel Export ───────────────────────────────────────────
function buildComparisonData(data, year, month, actuals = {}, uploadedExcelData = null) {
  if (!uploadedExcelData || uploadedExcelData.length === 0) return null;

  const aoa = [];
  const mailMaxCol = Math.max(...uploadedExcelData.map(r => r ? r.length : 0), 7);
  const OUR_START_COL = mailMaxCol + 1;

  for (let r = 0; r < uploadedExcelData.length; r++) {
    const newRow = [];
    const mailRow = uploadedExcelData[r] || [];
    for (let c = 0; c < mailMaxCol; c++) newRow[c] = mailRow[c] !== undefined ? mailRow[c] : '';
    for (let c = mailMaxCol; c < OUR_START_COL; c++) newRow[c] = '';
    aoa.push(newRow);
  }

  while (aoa.length < 3) aoa.push(new Array(OUR_START_COL).fill(''));

  aoa[0][OUR_START_COL] = `Qualified Vehicle Extra Freight 9.5% NVL & NVCL FOR DEDICATED FROM OUR CALCULATION NVL Month of ${MONTH_NAMES[month]} '${String(year).slice(2)}`;
  aoa[1][OUR_START_COL + 3] = 'NVL';
  aoa[1][OUR_START_COL + 6] = 'NVCL';

  const ourHeaders = [
    'TYPE', 'Owner Name', 'Truck No',
    'Sum of Inv Qty', 'Sum of ORG FREIGHT', 'Sum of Amt',
    'Sum of Inv Qty', 'Sum of ORG FREIGHT', 'Sum Amt',
    'Total', '10W EXTRA 8.5%', 'TOTAL'
  ];
  for (let i = 0; i < ourHeaders.length; i++) aoa[2][OUR_START_COL + i] = ourHeaders[i];

  let matchedTrucks = new Set();

  for (let r = 0; r < aoa.length; r++) {
    const row = aoa[r];
    let matchedData = null;
    let foundTruckNo = null;

    for (let c = 0; c < mailMaxCol; c++) {
      if (typeof row[c] === 'string') {
        const str = row[c].trim().toUpperCase();
        if (str.length > 5 && str.length < 15) {
          const potentialTruck = str.replace(/\s/g, '');
          matchedData = data.find(t => t.truckNo === potentialTruck);
          if (matchedData) {
            foundTruckNo = potentialTruck;
            break;
          }
        }
      }
    }

    if (matchedData) {
      matchedTrucks.add(foundTruckNo);
      const m = matchedData;
      row[OUR_START_COL + 0] = m.type || '';
      row[OUR_START_COL + 1] = m.ownerName || '';
      row[OUR_START_COL + 2] = m.truckNo || '';
      row[OUR_START_COL + 3] = m.nvl.invQty || 0;
      row[OUR_START_COL + 4] = Math.round(m.nvl.orgFreight) || 0;
      row[OUR_START_COL + 5] = Math.round(m.nvl.amt) || 0;
      row[OUR_START_COL + 6] = m.nvcl.invQty || 0;
      row[OUR_START_COL + 7] = Math.round(m.nvcl.orgFreight) || 0;
      row[OUR_START_COL + 8] = Math.round(m.nvcl.amt) || 0;
      row[OUR_START_COL + 9] = Math.round(m.total) || 0;
      row[OUR_START_COL + 10] = Math.round(m.extra10W) || 0;
      row[OUR_START_COL + 11] = Math.round(m.totalFinal) || 0;
    }
  }

  const unmatched = data.filter(t => !matchedTrucks.has(t.truckNo) && t.totalFinal > 0);
  if (unmatched.length > 0) {
    aoa.push([]);
    aoa.push(['Our Calculation Entries NOT found in mail:']);
    for (const m of unmatched) {
      const newRow = new Array(OUR_START_COL).fill('');
      newRow[OUR_START_COL + 0] = m.type || '';
      newRow[OUR_START_COL + 1] = m.ownerName || '';
      newRow[OUR_START_COL + 2] = m.truckNo || '';
      newRow[OUR_START_COL + 3] = m.nvl.invQty || 0;
      newRow[OUR_START_COL + 4] = Math.round(m.nvl.orgFreight) || 0;
      newRow[OUR_START_COL + 5] = Math.round(m.nvl.amt) || 0;
      newRow[OUR_START_COL + 6] = m.nvcl.invQty || 0;
      newRow[OUR_START_COL + 7] = Math.round(m.nvcl.orgFreight) || 0;
      newRow[OUR_START_COL + 8] = Math.round(m.nvcl.amt) || 0;
      newRow[OUR_START_COL + 9] = Math.round(m.total) || 0;
      newRow[OUR_START_COL + 10] = Math.round(m.extra10W) || 0;
      newRow[OUR_START_COL + 11] = Math.round(m.totalFinal) || 0;
      aoa.push(newRow);
    }
  }

  const merges = [
    { s: { r: 0, c: OUR_START_COL }, e: { r: 0, c: OUR_START_COL + 11 } },
    { s: { r: 1, c: OUR_START_COL + 3 }, e: { r: 1, c: OUR_START_COL + 5 } },
    { s: { r: 1, c: OUR_START_COL + 6 }, e: { r: 1, c: OUR_START_COL + 8 } },
    { s: { r: 1, c: OUR_START_COL + 0 }, e: { r: 2, c: OUR_START_COL + 0 } },
    { s: { r: 1, c: OUR_START_COL + 1 }, e: { r: 2, c: OUR_START_COL + 1 } },
    { s: { r: 1, c: OUR_START_COL + 2 }, e: { r: 2, c: OUR_START_COL + 2 } },
    { s: { r: 1, c: OUR_START_COL + 9 }, e: { r: 2, c: OUR_START_COL + 9 } },
    { s: { r: 1, c: OUR_START_COL + 10 }, e: { r: 2, c: OUR_START_COL + 10 } },
    { s: { r: 1, c: OUR_START_COL + 11 }, e: { r: 2, c: OUR_START_COL + 11 } }
  ];

  return { aoa, merges, OUR_START_COL, mailMaxCol };
}

function exportComparisonExcel(data, year, month, actuals = {}, uploadedExcelData = null) {
  const comp = buildComparisonData(data, year, month, actuals, uploadedExcelData);
  if (!comp) return;

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(comp.aoa);
  ws['!merges'] = comp.merges;

  XLSX.utils.book_append_sheet(wb, ws, 'Comparison');
  XLSX.writeFile(wb, `Incentive_Comparison_Full_${MONTH_NAMES[month]}_${year}.xlsx`);
}

function exportIncentiveExcel(data, year, month, actuals = {}) {
  const monthLabel = `${MONTH_NAMES[month].slice(0, 3)}'${String(year).slice(2)}`;
  const wb = XLSX.utils.book_new();

  // ── Sheet rows (manual construction for precise header merges) ──────────────
  const aoa = []; // array of arrays

  // Row 1: Big title
  aoa.push([
    `Qualified Vehicle Extra Freight 9.5% NVL & NVCL FOR Dedicated FROM OUR CALCULATION NVL  Month of ${MONTH_NAMES[month]} '${String(year).slice(2)}`
  ]);

  // Row 2: Column group headers
  aoa.push([
    'TYPE', 'Owner Name', 'Truck No', 'Wheel',
    'Sum of\nInv Qty', 'Sum of\nORG FREIGHT', 'Sum of\nAmt',   // NVL
    'Sum of\nInv Qty', 'Sum of\nORG FREIGHT', 'Sum Amt',        // NVCL
    'Total',
    '10W EXTRA\n8.5%',
    'TOTAL(PROJECTED)',
    'ACTUAL',
    'DIFFERENCE\n(ACTUAL-PROJECTED)',
    'SETTLED AMOUNT'
  ]);

  // Row 3: NVL / NVCL sub-group labels
  aoa.push([
    '', '', '', '',
    '', 'NVL', '',
    '', 'NVCL', '',
    '', '', '', '', '', ''
  ]);

  // Data rows
  for (const t of data) {
    const act = parseFloat(actuals[t.truckNo]) || 0;
    const diff = act - t.totalFinal;
    const settled = act > t.totalFinal ? t.totalFinal : act;
    aoa.push([
      t.type,
      t.ownerName,
      t.truckNo,
      t.wheel,
      t.nvl.invQty || '',
      t.nvl.orgFreight ? Math.round(t.nvl.orgFreight) : '',
      t.nvl.amt ? Math.round(t.nvl.amt) : '',
      t.nvcl.invQty || '',
      t.nvcl.orgFreight ? Math.round(t.nvcl.orgFreight) : '',
      t.nvcl.amt ? Math.round(t.nvcl.amt) : '',
      t.total || 0,
      t.extra10W ? Math.round(t.extra10W) : 0,
      t.totalFinal || 0,
      act || 0,
      diff || 0,
      settled || 0
    ]);
  }

  // Footer totals row
  const totals = data.reduce((acc, t) => {
    acc.nvlQty = Math.round(acc.nvlQty + t.nvl.invQty);
    acc.nvlFreight += t.nvl.orgFreight;
    acc.nvlAmt += t.nvl.amt;
    acc.nvclQty = Math.round(acc.nvclQty + t.nvcl.invQty);
    acc.nvclFreight += t.nvcl.orgFreight;
    acc.nvclAmt += t.nvcl.amt;
    acc.total += t.total;
    acc.w10 += t.extra10W;
    acc.grand += t.totalFinal;
    const act = parseFloat(actuals[t.truckNo]) || 0;
    acc.actual += act;
    acc.diff += act - t.totalFinal;
    acc.settled += (act > t.totalFinal ? t.totalFinal : act);
    return acc;
  }, { nvlQty: 0, nvlFreight: 0, nvlAmt: 0, nvclQty: 0, nvclFreight: 0, nvclAmt: 0, total: 0, w10: 0, grand: 0, actual: 0, diff: 0, settled: 0 });

  aoa.push([
    '', '', '', '',
    Math.round(totals.nvlQty),
    Math.round(totals.nvlFreight),
    Math.round(totals.nvlAmt),
    Math.round(totals.nvclQty),
    Math.round(totals.nvclFreight),
    Math.round(totals.nvclAmt),
    Math.round(totals.total),
    Math.round(totals.w10),
    Math.round(totals.grand),
    Math.round(totals.actual),
    Math.round(totals.diff),
    Math.round(totals.settled),
  ]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // ── Column widths ──────────────────────────────────────────────────────────
  ws['!cols'] = [
    { wch: 8 },   // TYPE
    { wch: 22 },  // Owner Name
    { wch: 14 },  // Truck No
    { wch: 8 },   // Wheel
    { wch: 12 },  // NVL inv qty
    { wch: 14 },  // NVL org freight
    { wch: 12 },  // NVL amt
    { wch: 12 },  // NVCL inv qty
    { wch: 14 },  // NVCL org freight
    { wch: 12 },  // NVCL amt
    { wch: 10 },  // Total
    { wch: 12 },  // 10W Extra
    { wch: 16 },  // TOTAL(PROJECTED)
    { wch: 10 },  // ACTUAL
    { wch: 16 },  // DIFFERENCE
    { wch: 16 },  // SETTLED AMOUNT
  ];

  // ── Merges (16 cols total now: A–P) ────────────────────────────────────────
  ws['!merges'] = [
    // Title row spans all 16 cols (A1:P1)
    { s: { r: 0, c: 0 }, e: { r: 0, c: 15 } },
    // NVL sub-header (E3:G3)
    { s: { r: 2, c: 4 }, e: { r: 2, c: 6 } },
    // NVCL sub-header (H3:J3)
    { s: { r: 2, c: 7 }, e: { r: 2, c: 9 } },
    // TYPE spans rows 2-3
    { s: { r: 1, c: 0 }, e: { r: 2, c: 0 } },
    // Owner Name spans rows 2-3
    { s: { r: 1, c: 1 }, e: { r: 2, c: 1 } },
    // Truck No spans rows 2-3
    { s: { r: 1, c: 2 }, e: { r: 2, c: 2 } },
    // Wheel spans rows 2-3
    { s: { r: 1, c: 3 }, e: { r: 2, c: 3 } },
    // Total spans rows 2-3
    { s: { r: 1, c: 10 }, e: { r: 2, c: 10 } },
    // 10W spans rows 2-3
    { s: { r: 1, c: 11 }, e: { r: 2, c: 11 } },
    // TOTAL(PROJECTED) spans rows 2-3
    { s: { r: 1, c: 12 }, e: { r: 2, c: 12 } },
    // ACTUAL spans rows 2-3
    { s: { r: 1, c: 13 }, e: { r: 2, c: 13 } },
    // DIFFERENCE spans rows 2-3
    { s: { r: 1, c: 14 }, e: { r: 2, c: 14 } },
    // SETTLED spans rows 2-3
    { s: { r: 1, c: 15 }, e: { r: 2, c: 15 } },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Incentive Analysis');
  XLSX.writeFile(wb, `Incentive_Analysis_NVL_${MONTH_NAMES[month]}_${year}.xlsx`);
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function IncentiveAnalysis({ rows, onBack }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed

  // UI Modal state
  const [comparisonModalOpen, setComparisonModalOpen] = useState(false);
  const [mailNvlTotal, setMailNvlTotal] = useState('');
  const [mailW10Total, setMailW10Total] = useState('');
  const [mailNvclTotal, setMailNvclTotal] = useState('');

  const storageKey = `incentive_save_state_${year}_${month}`;

  const loadState = () => {
    try {
      const data = JSON.parse(localStorage.getItem(storageKey));
      return data || { actuals: {}, pdfUrl: null, excelName: null, excelData: null };
    } catch {
      return { actuals: {}, pdfUrl: null, excelName: null, excelData: null };
    }
  };

  const initialState = loadState();

  // State for uploaded files preview
  const [uploadedPdfUrl, setUploadedPdfUrl] = useState(initialState.pdfUrl);
  const [uploadedExcelName, setUploadedExcelName] = useState(initialState.excelName);
  const [uploadedExcelData, setUploadedExcelData] = useState(initialState.excelData);

  // State for manual actual amounts
  const [actuals, setActuals] = useState(initialState.actuals);

  // Reload state if month/year changes
  useEffect(() => {
    const st = loadState();
    setActuals(st.actuals || {});
    setUploadedPdfUrl(st.pdfUrl || null);
    setUploadedExcelName(st.excelName || null);
    setUploadedExcelData(st.excelData || null);
  }, [storageKey]);

  const [savingActuals, setSavingActuals] = useState(false);
  const handleSaveActuals = () => {
    setSavingActuals(true);
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        actuals,
        pdfUrl: uploadedPdfUrl,
        excelName: uploadedExcelName,
        excelData: uploadedExcelData
      }));
    } catch (err) {
      alert("Note: PDF or Excel might be too large to save in standard browser storage. Try smaller files if this persists.");
      console.warn("Storage quota exceeded or error saving:", err);
    }
    setTimeout(() => setSavingActuals(false), 500);
  };

  // ── Truck Contacts from MongoDB (for Wheel & Owner lookup) ──────────────────
  const [truckContacts, setTruckContacts] = useState([]);
  useEffect(() => {
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    axios.get(`${API_URL}/truck-contacts`)
      .then(res => { if (res.data?.success) setTruckContacts(res.data.contacts || []); })
      .catch(console.error);
  }, []);

  const data = useMemo(() => buildIncentiveData(rows, year, month, truckContacts), [rows, year, month, truckContacts]);

  // Column totals for footer
  const totals = useMemo(() => data.reduce((acc, t) => {
    acc.nvlQty = Math.round(acc.nvlQty + t.nvl.invQty);
    acc.nvlFreight += t.nvl.orgFreight;
    acc.nvlAmt += t.nvl.amt; // already rounded in buildIncentiveData
    acc.nvclQty = Math.round(acc.nvclQty + t.nvcl.invQty);
    acc.nvclFreight += t.nvcl.orgFreight;
    acc.nvclAmt += t.nvcl.amt; // already rounded in buildIncentiveData
    acc.total += t.total;
    acc.extra10W += t.extra10W;
    acc.extra6W += t.extra6W;
    acc.grand += t.totalFinal;
    return acc;
  }, { nvlQty: 0, nvlFreight: 0, nvlAmt: 0, nvclQty: 0, nvclFreight: 0, nvclAmt: 0, total: 0, extra10W: 0, extra6W: 0, grand: 0 }), [data]);

  // Available years (5 year window)
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  const monthLabel = `${MONTH_NAMES[month]} '${String(year).slice(2)}`;

  // ── Styles ─────────────────────────────────────────────────────────────────
  const thBase = {
    padding: '6px 8px',
    fontSize: '11px',
    fontWeight: 700,
    textAlign: 'center',
    border: '1px solid #94a3b8',
    whiteSpace: 'pre-line',
    lineHeight: 1.3,
  };
  const tdBase = {
    padding: '5px 8px',
    fontSize: '11px',
    border: '1px solid #cbd5e1',
    textAlign: 'right',
    whiteSpace: 'nowrap',
  };
  const fmt = (n) => n ? Math.round(n).toLocaleString('en-IN') : '0';

  // Derived view data for modal
  const comparisonViewDef = useMemo(() => {
    if (!comparisonModalOpen || !uploadedExcelData) return null;
    return buildComparisonData(data, year, month, actuals, uploadedExcelData);
  }, [comparisonModalOpen, data, year, month, actuals, uploadedExcelData]);

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#f8fafc', overflow: 'hidden', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* ── Top Bar ─────────────────────────────────────────────────────── */}
      <Box sx={{
        px: 2.5, py: 1.2,
        display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap',
        bgcolor: '#fff', borderBottom: '1px solid #e2e8f0',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)', flexShrink: 0,
      }}>
        <IconButton onClick={onBack} size="small" sx={{ bgcolor: '#f1f5f9', '&:hover': { bgcolor: '#e2e8f0' } }}>
          <ArrowBackIcon fontSize="small" />
        </IconButton>
        <Typography variant="h6" fontWeight={800} sx={{ color: '#0f172a', letterSpacing: '-0.5px' }}>
          Incentive Calculation Sheet — {monthLabel}
        </Typography>
        <Typography sx={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>
          (NVL & NVCL Dedicated 9.5%)
        </Typography>

        <Box sx={{ ml: 'auto', display: 'flex', gap: 1.5, alignItems: 'center' }}>
          {/* ── Additional Action Buttons ── */}
          <Button
            size="small" startIcon={<CompareArrowsIcon />}
            onClick={() => {
              if (!uploadedExcelData && !uploadedPdfUrl) {
                alert("Please upload either the client's Excel or PDF mail first before comparing.");
                return;
              }
              setComparisonModalOpen(true);
            }}
            sx={{
              fontWeight: 800, borderRadius: 2.5, px: 2, py: 0.6, fontSize: '11.5px',
              color: '#fff',
              background: 'linear-gradient(135deg, #6366f1, #4338ca)',
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
              textTransform: 'none', letterSpacing: '0.3px',
              transition: 'all 0.2s ease-in-out',
              '&:hover': {
                background: 'linear-gradient(135deg, #4f46e5, #3730a3)',
                boxShadow: '0 6px 16px rgba(99, 102, 241, 0.4)',
                transform: 'translateY(-1.5px)'
              }
            }}>
            Incentive Comparison
          </Button>

          {/* ── Document Uploads ── */}
          <Button
            size="small" variant="outlined" component="label" startIcon={<UploadIcon />}
            sx={{
              fontWeight: 700, borderRadius: 2, px: 1.5, fontSize: '11px',
              borderColor: '#cbd5e1', color: '#475569',
              '&:hover': { bgcolor: '#f8fafc', borderColor: '#94a3b8' }
            }}>
            Upload PDF
            <input type="file" accept="application/pdf" hidden onChange={(e) => {
              const file = e.target.files[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = (e) => setUploadedPdfUrl(e.target.result);
                reader.readAsDataURL(file);
              }
            }} />
          </Button>

          <Button
            size="small" variant="outlined" component="label" startIcon={<UploadIcon />}
            sx={{
              fontWeight: 700, borderRadius: 2, px: 1.5, fontSize: '11px',
              borderColor: '#cbd5e1', color: '#475569',
              '&:hover': { bgcolor: '#f8fafc', borderColor: '#94a3b8' }
            }}>
            Upload Excel
            <input type="file" accept=".xls,.xlsx" hidden onChange={async (e) => {
              const file = e.target.files[0];
              if (file) {
                setUploadedExcelName(file.name);
                const ab = await file.arrayBuffer();
                const wb = XLSX.read(ab);
                const ws = wb.Sheets[wb.SheetNames[0]];
                const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
                setUploadedExcelData(data);
              }
            }} />
          </Button>

          <Button
            size="small" variant="contained" startIcon={<SaveIcon />}
            onClick={handleSaveActuals}
            sx={{
              fontWeight: 700, borderRadius: 2, px: 2, fontSize: '11px',
              bgcolor: savingActuals ? '#10b981' : '#3b82f6', color: '#fff',
              boxShadow: '0 2px 4px rgba(59, 130, 246, 0.2)',
              '&:hover': { bgcolor: '#2563eb' }
            }}>
            {savingActuals ? 'Saved!' : 'Save'}
          </Button>

          <Divider orientation="vertical" flexItem sx={{ my: 0.5, borderColor: '#e2e8f0' }} />

          {/* Month Selector */}
          <Select size="small" value={month} onChange={e => setMonth(e.target.value)}
            sx={{ fontSize: 12, fontWeight: 700, minWidth: 120 }}>
            {MONTH_NAMES.map((m, i) => (
              <MenuItem key={i} value={i} sx={{ fontSize: 12 }}>{m}</MenuItem>
            ))}
          </Select>

          {/* Year Selector */}
          <Select size="small" value={year} onChange={e => setYear(e.target.value)}
            sx={{ fontSize: 12, fontWeight: 700, minWidth: 80 }}>
            {years.map(y => (
              <MenuItem key={y} value={y} sx={{ fontSize: 12 }}>{y}</MenuItem>
            ))}
          </Select>

          <Button
            size="small" variant="contained" startIcon={<DownloadIcon />}
            onClick={() => exportIncentiveExcel(data, year, month, actuals)}
            sx={{
              fontWeight: 800, borderRadius: 2, px: 2, fontSize: '12px',
              background: 'linear-gradient(135deg,#059669,#047857)',
              boxShadow: '0 4px 12px rgba(5,150,105,0.3)',
              '&:hover': { background: 'linear-gradient(135deg,#047857,#065f46)' },
            }}>
            Export Excel
          </Button>
        </Box>
      </Box>

      {/* ── Main Table Area ──────────────────────────────────────────────── */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>

        {/* Big title banner — matching the yellow banner in reference image */}
        <Box sx={{
          bgcolor: '#fef08a',
          border: '2px solid #ca8a04',
          borderRadius: 1,
          py: 0.8, px: 2, mb: 1.5,
          textAlign: 'center',
        }}>
          <Typography sx={{
            fontSize: '13px', fontWeight: 800, color: '#713f12',
            letterSpacing: '0.3px', textTransform: 'uppercase',
          }}>
            Qualified Vehicle Extra Freight 9.5% NVL &amp; NVCL FOR Dedicated FROM OUR CALCULATION NVL &nbsp;&nbsp; Month of {monthLabel}
          </Typography>
        </Box>

        {/* ── Table ──────────────────────────────────────────────────────── */}
        <Box sx={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', minWidth: 900, fontFamily: 'inherit', fontSize: 12 }}>
            <thead>
              {/* Row 1: Column group headers */}
              <tr>
                <th rowSpan={2} style={{ ...thBase, bgcolor: '#bfdbfe', background: '#bfdbfe', minWidth: 60 }}>TYPE</th>
                <th rowSpan={2} style={{ ...thBase, background: '#bfdbfe', minWidth: 180 }}>Owner Name</th>
                <th rowSpan={2} style={{ ...thBase, background: '#bfdbfe', minWidth: 120 }}>Truck No</th>
                <th rowSpan={2} style={{ ...thBase, background: '#bfdbfe', minWidth: 70 }}>Wheel</th>
                <th rowSpan={2} style={{ ...thBase, background: '#bfdbfe', minWidth: 60 }}>Trips</th>
                {/* NVL group */}
                <th colSpan={3} style={{ ...thBase, background: '#ddd6fe', color: '#4c1d95' }}>NVL</th>
                {/* NVCL group */}
                <th colSpan={3} style={{ ...thBase, background: '#bbf7d0', color: '#14532d' }}>NVCL</th>
                <th rowSpan={2} style={{ ...thBase, background: '#fef9c3', minWidth: 80 }}>Total</th>
                <th rowSpan={2} style={{ ...thBase, background: '#fef9c3', minWidth: 90 }}>10WH extra 8.5% incentive</th>
                <th rowSpan={2} style={{ ...thBase, background: '#fef9c3', minWidth: 90 }}>6WH extra 15% incentive</th>
                <th rowSpan={2} style={{ ...thBase, background: '#fef9c3', minWidth: 80 }}>Total (Projected)</th>
                <th rowSpan={2} style={{ ...thBase, background: '#fed7aa', minWidth: 80 }}>ACTUAL</th>
                <th rowSpan={2} style={{ ...thBase, background: '#fbcfe8', minWidth: 90 }}>DIFFERENCE<br />(ACTUAL-PROJECTED)</th>
                <th rowSpan={2} style={{ ...thBase, background: '#e0e7ff', minWidth: 90 }}>SETTLED AMOUNT</th>
              </tr>
              {/* Row 2: Sub-column headers */}
              <tr>
                <th style={{ ...thBase, background: '#ede9fe', fontSize: 10 }}>Sum of{'\n'}Inv Qty</th>
                <th style={{ ...thBase, background: '#ede9fe', fontSize: 10 }}>Sum of{'\n'}ORG{'\n'}FREIGHT</th>
                <th style={{ ...thBase, background: '#ede9fe', fontSize: 10 }}>Sum of{'\n'}Amt</th>
                <th style={{ ...thBase, background: '#dcfce7', fontSize: 10 }}>Sum of{'\n'}Inv Qty</th>
                <th style={{ ...thBase, background: '#dcfce7', fontSize: 10 }}>Sum of{'\n'}ORG{'\n'}FREIGHT</th>
                <th style={{ ...thBase, background: '#dcfce7', fontSize: 10 }}>Sum Amt</th>
              </tr>
            </thead>

            <tbody>
              {data.length === 0 && (
                <tr>
                  <td colSpan={12} style={{ ...tdBase, textAlign: 'center', padding: '40px', color: '#64748b' }}>
                    No data for {MONTH_NAMES[month]} {year}. Check that cement register entries have Loading Dates in this month.
                  </td>
                </tr>
              )}

              {data.map((t, i) => (
                <tr key={t.truckNo} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                  <td style={{ ...tdBase, textAlign: 'center', fontWeight: 700, color: t.type === 'ATOA' || t.type === 'ATO' ? '#1e40af' : '#166534' }}>
                    {t.type}
                  </td>
                  <td style={{ ...tdBase, textAlign: 'left', fontWeight: 600 }}>{t.ownerName}</td>
                  <td style={{ ...tdBase, textAlign: 'center', fontFamily: 'monospace', fontWeight: 700, fontSize: 12 }}>{t.truckNo}</td>
                  <td style={{ ...tdBase, textAlign: 'center', fontWeight: 600, color: '#374151' }}>{t.wheel}</td>
                  <td style={{ ...tdBase, textAlign: 'center', fontWeight: 800, color: t.tripsCount > 6 ? '#16a34a' : '#dc2626' }}>{t.tripsCount}</td>

                  {/* NVL */}
                  <td style={{ ...tdBase, background: 'rgba(237,233,254,0.3)' }}>{t.nvl.invQty ? Math.round(t.nvl.invQty) : ''}</td>
                  <td style={{ ...tdBase, background: 'rgba(237,233,254,0.3)' }}>{t.nvl.orgFreight ? fmt(t.nvl.orgFreight) : ''}</td>
                  <td style={{ ...tdBase, background: 'rgba(237,233,254,0.3)' }}>{t.nvl.amt ? fmt(t.nvl.amt) : ''}</td>

                  {/* NVCL */}
                  <td style={{ ...tdBase, background: 'rgba(220,252,231,0.3)' }}>{t.nvcl.invQty ? Math.round(t.nvcl.invQty) : ''}</td>
                  <td style={{ ...tdBase, background: 'rgba(220,252,231,0.3)' }}>{t.nvcl.orgFreight ? fmt(t.nvcl.orgFreight) : ''}</td>
                  <td style={{ ...tdBase, background: 'rgba(220,252,231,0.3)' }}>{t.nvcl.amt ? fmt(t.nvcl.amt) : ''}</td>

                  {/* Totals */}
                  <td style={{ ...tdBase, fontWeight: 700, background: 'rgba(254,249,195,0.4)' }}>{fmt(t.total)}</td>
                  <td style={{ ...tdBase, color: t.extra10W > 0 ? '#b91c1c' : '#94a3b8' }}>{t.extra10W ? fmt(t.extra10W) : '0'}</td>
                  <td style={{ ...tdBase, color: t.extra6W > 0 ? '#b91c1c' : '#94a3b8' }}>{t.extra6W ? fmt(t.extra6W) : '0'}</td>
                  <td style={{ ...tdBase, fontWeight: 800, color: '#0f172a', background: 'rgba(254,249,195,0.4)' }}>{fmt(t.totalFinal)}</td>
                  <td style={{ ...tdBase, background: '#fff', padding: '2px' }}>
                    <input type="number"
                      value={actuals[t.truckNo] || ''}
                      onChange={e => setActuals(prev => ({ ...prev, [t.truckNo]: e.target.value }))}
                      style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', fontWeight: 700, fontSize: '11px', color: '#166534', padding: '4px' }}
                      placeholder="0"
                    />
                  </td>
                  <td style={{ ...tdBase, fontWeight: 800, color: (num(actuals[t.truckNo]) - t.totalFinal) < 0 ? '#b91c1c' : '#047857', background: 'rgba(251,207,232,0.3)' }}>
                    {fmt(num(actuals[t.truckNo]) - t.totalFinal)}
                  </td>
                  <td style={{ ...tdBase, fontWeight: 800, color: '#4338ca', background: 'rgba(224,231,255,0.4)' }}>
                    {fmt(num(actuals[t.truckNo]) > t.totalFinal ? t.totalFinal : num(actuals[t.truckNo]))}
                  </td>
                </tr>
              ))}

              {/* Totals footer row */}
              {data.length > 0 && (() => {
                let totalActual = 0;
                let totalDiff = 0;
                let totalSettled = 0;
                data.forEach(t => {
                  const act = num(actuals[t.truckNo]);
                  totalActual += act;
                  totalDiff += (act - t.totalFinal);
                  totalSettled += (act > t.totalFinal ? t.totalFinal : act);
                });
                return (
                  <tr style={{ background: '#e2e8f0', borderTop: '2px solid #475569' }}>
                    <td colSpan={5} style={{ ...tdBase, textAlign: 'center', fontWeight: 900, color: '#0f172a', background: '#e2e8f0' }}>TOTALS</td>
                    {/* NVL totals */}
                    <td style={{ ...tdBase, fontWeight: 800, background: 'rgba(237,233,254,0.7)' }}>{Math.round(totals.nvlQty).toLocaleString('en-IN')}</td>
                    <td style={{ ...tdBase, fontWeight: 800, background: 'rgba(237,233,254,0.7)' }}>{fmt(totals.nvlFreight)}</td>
                    <td style={{ ...tdBase, fontWeight: 800, background: 'rgba(237,233,254,0.7)' }}>{fmt(totals.nvlAmt)}</td>
                    {/* NVCL totals */}
                    <td style={{ ...tdBase, fontWeight: 800, background: 'rgba(220,252,231,0.7)' }}>{Math.round(totals.nvclQty).toLocaleString('en-IN')}</td>
                    <td style={{ ...tdBase, fontWeight: 800, background: 'rgba(220,252,231,0.7)' }}>{fmt(totals.nvclFreight)}</td>
                    <td style={{ ...tdBase, fontWeight: 800, background: 'rgba(220,252,231,0.7)' }}>{fmt(totals.nvclAmt)}</td>
                    {/* Grand totals */}
                    <td style={{ ...tdBase, fontWeight: 900, background: 'rgba(254,249,195,0.8)', color: '#713f12' }}>{fmt(totals.total)}</td>
                    <td style={{ ...tdBase, fontWeight: 800 }}>{fmt(totals.extra10W)}</td>
                    <td style={{ ...tdBase, fontWeight: 800 }}>{fmt(totals.extra6W)}</td>
                    <td style={{ ...tdBase, fontWeight: 900, fontSize: 13, color: '#0f172a', background: 'rgba(254,249,195,0.9)' }}>{fmt(totals.grand)}</td>
                    <td style={{ ...tdBase, fontWeight: 900, fontSize: 13, color: '#166534', background: 'rgba(254,215,170,0.6)' }}>{fmt(totalActual)}</td>
                    <td style={{ ...tdBase, fontWeight: 900, fontSize: 13, color: totalDiff < 0 ? '#b91c1c' : '#047857', background: 'rgba(251,207,232,0.8)' }}>{fmt(totalDiff)}</td>
                    <td style={{ ...tdBase, fontWeight: 900, fontSize: 13, color: '#312e81', background: 'rgba(224,231,255,0.8)' }}>{fmt(totalSettled)}</td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </Box>

        {/* ── Uploaded Document Previews ── */}
        {(uploadedPdfUrl || uploadedExcelData) && (
          <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {uploadedPdfUrl && (
              <Box sx={{ p: 2, bgcolor: '#fff', borderRadius: 2, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#1e293b' }}>PDF Preview</Typography>
                  <Button size="small" color="error" onClick={() => setUploadedPdfUrl(null)}>Close</Button>
                </Box>
                <iframe src={uploadedPdfUrl} width="100%" height="600px" style={{ border: 'none', borderRadius: '4px' }} title="PDF Preview" />
              </Box>
            )}

            {uploadedExcelData && (
              <Box sx={{ p: 2, bgcolor: '#fff', borderRadius: 2, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#1e293b' }}>Excel Preview: {uploadedExcelName}</Typography>
                  <Button size="small" color="error" onClick={() => { setUploadedExcelData(null); setUploadedExcelName(null); }}>Close</Button>
                </Box>
                <Box sx={{ overflowX: 'auto', maxHeight: '400px' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '11px', fontFamily: 'monospace' }}>
                    <tbody>
                      {uploadedExcelData.map((row, rIdx) => (
                        <tr key={rIdx}>
                          {row.map((cell, cIdx) => (
                            <td key={cIdx} style={{ border: '1px solid #cbd5e1', padding: '4px 8px', whiteSpace: 'nowrap', background: rIdx === 0 ? '#f1f5f9' : '#fff', fontWeight: rIdx === 0 ? 700 : 400 }}>
                              {cell !== undefined && cell !== null ? String(cell) : ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Box>
              </Box>
            )}
          </Box>
        )}

      </Box>

      {/* ── Comparison Modal ── */}
      <Dialog open={comparisonModalOpen} onClose={() => setComparisonModalOpen(false)} maxWidth="xl" fullWidth PaperProps={{ sx: { height: '95vh', bgcolor: '#f8fafc', m: 2 } }}>
        <DialogTitle sx={{ fontWeight: 800, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', bgcolor: '#fff' }}>
          Side-By-Side Comparison View — {monthLabel}
          <Box display="flex" gap={1}>
            {uploadedExcelData && (
              <Button variant="contained" color="primary" startIcon={<DownloadIcon />} onClick={() => exportComparisonExcel(data, year, month, actuals, uploadedExcelData)}>
                Download Full Excel
              </Button>
            )}
            <Button size="small" variant="outlined" color="error" onClick={() => setComparisonModalOpen(false)}>Close View</Button>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 0, bgcolor: '#f1f5f9', display: 'flex', flexDirection: 'column', height: '100%' }}>
          {uploadedExcelData ? (
            <Box sx={{ overflow: 'auto', maxHeight: '100%', p: 2 }}>
              <table style={{ borderCollapse: 'collapse', minWidth: '100%', fontSize: '12px', fontFamily: 'monospace' }}>
                <tbody>
                  {comparisonViewDef?.aoa.map((row, r) => (
                    <tr key={r}>
                      {row.map((cell, c) => {
                        const isOurCalc = c >= comparisonViewDef.OUR_START_COL;
                        const isHeader = r < 3;
                        const bg = isOurCalc ? (isHeader ? '#fef9c3' : '#fff') : (isHeader ? '#e2e8f0' : '#f8fafc');
                        const borderCol = isOurCalc ? '#cbd5e1' : '#94a3b8';
                        const displayValue = cell !== undefined && cell !== null ? String(cell) : '';
                        return (
                          <td key={c} style={{ border: `1px solid ${borderCol}`, padding: '4px 8px', background: bg, fontWeight: isHeader ? 800 : 500, color: displayValue === '' ? 'transparent' : '#0f172a', whiteSpace: 'nowrap' }}>
                            {displayValue}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
          ) : uploadedPdfUrl ? (
            <Box sx={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
              <Box sx={{ width: '45%', borderRight: '2px solid #cbd5e1', height: '100%', bgcolor: '#fff' }}>
                <iframe src={uploadedPdfUrl} width="100%" height="100%" style={{ border: 'none' }} title="Client PDF Mail" />
              </Box>
              <Box sx={{ width: '55%', height: '100%', overflow: 'auto', p: 2, bgcolor: '#f8fafc' }}>
                <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 2, color: '#0f172a' }}>Our System Calculation Results</Typography>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '11px', whiteSpace: 'nowrap' }}>
                  <thead>
                    <tr>
                      <th style={thBase}>Owner Name</th>
                      <th style={thBase}>Truck No</th>
                      <th style={thBase}>Trips</th>
                      <th style={thBase}>NVL Qty</th>
                      <th style={thBase}>NVL Amt</th>
                      <th style={thBase}>NVCL Qty</th>
                      <th style={thBase}>NVCL Amt</th>
                      <th style={thBase}>10WH extra 8.5% incentive</th>
                      <th style={thBase}>6WH extra 15% incentive</th>
                      <th style={{ ...thBase, background: '#fef9c3' }}>Total (Projected)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map(t => (
                      <tr key={t.truckNo}>
                        <td style={tdBase}>{t.ownerName}</td>
                        <td style={tdBase}>{t.truckNo}</td>
                        <td style={{ ...tdBase, fontWeight: 800 }}>{t.tripsCount}</td>
                        <td style={{ ...tdBase, background: '#f8fafc' }}>{t.nvl.invQty ? Math.round(t.nvl.invQty) : ''}</td>
                        <td style={{ ...tdBase, background: '#f8fafc' }}>{fmt(t.nvl.amt)}</td>
                        <td style={{ ...tdBase, background: '#f1f5f9' }}>{t.nvcl.invQty ? Math.round(t.nvcl.invQty) : ''}</td>
                        <td style={{ ...tdBase, background: '#f1f5f9' }}>{fmt(t.nvcl.amt)}</td>
                        <td style={tdBase}>{fmt(t.extra10W)}</td>
                        <td style={tdBase}>{fmt(t.extra6W)}</td>
                        <td style={{ ...tdBase, fontWeight: 800, background: '#fef9c3' }}>{fmt(t.totalFinal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* ── Summary Comparison Section ── */}
                <Box sx={{ mt: 3, p: 3, bgcolor: '#fff', borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                  <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 2.5, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 4, height: 18, bgcolor: '#3b82f6', borderRadius: 1 }} />
                    Manual Total Validation (Mail Entry)
                  </Typography>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {[
                      { label: `Dedicated Freight Incentive 9.5% on all bills for ${MONTH_NAMES[month].slice(0, 3)}'${String(year).slice(2)}`, our: totals.nvlAmt + totals.nvclAmt, value: mailNvlTotal, setter: setMailNvlTotal },
                      { label: `Extra Wheel Bonus (10W/6W) for SO/NT bills on ${MONTH_NAMES[month].slice(0, 3)}'${String(year).slice(2)}`, our: totals.extra10W + totals.extra6W, value: mailW10Total, setter: setMailW10Total },
                      { label: `Other Adjustments/Settlements for ${MONTH_NAMES[month].slice(0, 3)}'${String(year).slice(2)}`, our: 0, value: mailNvclTotal, setter: setMailNvclTotal }
                    ].map((item, idx) => (
                      <Box key={idx} sx={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        p: 2, borderRadius: 2, bgcolor: idx % 2 === 0 ? '#f8fafc' : '#fff',
                        border: '1px solid #f1f5f9'
                      }}>
                        <Typography variant="body2" fontWeight={600} sx={{ width: '40%', color: '#334155', lineHeight: 1.4 }}>
                          {item.label}
                        </Typography>

                        <Box sx={{ display: 'flex', gap: 4, width: '60%', alignItems: 'center', justifyContent: 'flex-end' }}>
                          <Box sx={{ textAlign: 'center', minWidth: 80 }}>
                            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600, textTransform: 'uppercase', fontSize: 10 }}>Total (Projected)</Typography>
                            <Typography variant="body2" fontWeight={800} sx={{ color: '#0f172a' }}>{fmt(item.our)}</Typography>
                          </Box>

                          <Box sx={{ width: 140 }}>
                            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600, textTransform: 'uppercase', fontSize: 10, mb: 0.5, display: 'block' }}>Total (Actual)</Typography>
                            <input
                              type="number"
                              value={item.value}
                              onChange={e => item.setter(e.target.value)}
                              placeholder="Enter manual total..."
                              style={{
                                width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0',
                                borderRadius: '6px', fontSize: '13px', fontWeight: 600,
                                outline: 'none', transition: 'border-color 0.2s',
                                backgroundColor: '#fff'
                              }}
                            />
                          </Box>

                          <Box sx={{ textAlign: 'right', minWidth: 100 }}>
                            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600, textTransform: 'uppercase', fontSize: 10 }}>Difference</Typography>
                            <Typography
                              variant="body2"
                              fontWeight={900}
                              sx={{
                                color: item.value && (Number(item.value) - item.our !== 0)
                                  ? (Number(item.value) - item.our < 0 ? '#dc2626' : '#16a34a')
                                  : '#94a3b8'
                              }}
                            >
                              {item.value ? (Number(item.value) - item.our > 0 ? '+' : '') + fmt(Number(item.value) - item.our) : '—'}
                            </Typography>
                          </Box>
                        </Box>
                      </Box>
                    ))}
                  </Box>
                </Box>
              </Box>
            </Box>
          ) : null}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
