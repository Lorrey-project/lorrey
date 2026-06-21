import React, { useMemo, useState, useEffect } from 'react';
import axios from 'axios';
import {
  Box, Button, Typography, IconButton, Select, MenuItem,
  Tooltip, Divider, Dialog, DialogTitle, DialogContent, DialogActions,
  CircularProgress, Snackbar, Alert, Chip
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import * as XLSX from 'xlsx';

// ─── helpers ──────────────────────────────────────────────────────────────────
function num(val, fb = 0) {
  if (val === undefined || val === null || val === '') return fb;
  const cleaned = String(val).replace(/,/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? fb : n;
}

// Robust truck number extractor - normalizes Indian truck registrations from messy text
function extractTruckNo(val) {
  if (val === undefined || val === null) return '';
  const str = String(val).toUpperCase().trim();
  const match = str.match(/([A-Z]{2})\s*[-_]?\s*(\d{1,2})\s*[-_]?\s*([A-Z]{0,2})\s*[-_]?\s*(\d{3,4})/);
  if (match) {
    return `${match[1]}${match[2]}${match[3]}${match[4]}`;
  }
  const cleaned = str.replace(/[^A-Z0-9]/g, '');
  const hasLetters = /[A-Z]/.test(cleaned);
  const hasDigits = /[0-9]/.test(cleaned);
  const startsWithTwoLetters = /^[A-Z]{2}/.test(cleaned);
  if (startsWithTwoLetters && hasLetters && hasDigits && cleaned.length >= 8 && cleaned.length <= 12) {
    return cleaned;
  }
  return '';
}

// Robust date parser — handles DD-MM-YYYY, DD/MM/YYYY and ISO strings
// LOADING DT from the server is stored as "DD-MM-YYYY" (e.g. "13-04-2026")
function parseLoadingDate(str) {
  if (!str) return null;
  const clean = String(str).trim();
  const parts = clean.split(/[-\/\.]/);
  if (parts.length === 3) {
    const a = parseInt(parts[0], 10);
    const b = parseInt(parts[1], 10);
    const c = parseInt(parts[2], 10);
    
    // Check if it's YYYY-MM-DD
    if (a > 1000 && b >= 1 && b <= 12 && c >= 1 && c <= 31) {
      const date = new Date(a, b - 1, c);
      if (!isNaN(date.getTime())) return date;
    }
    
    // Check if it's DD-MM-YYYY or DD-MM-YY
    const day = a;
    const month = b - 1;
    let year = c;
    if (parts[2].length === 2) {
      year += (year >= 70 ? 1900 : 2000);
    }
    if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) return date;
    }
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

// Format a date string to DD.MM.YY display format (same as CementRegister's computedRows)
function formatLoadingDate(dStr) {
  if (!dStr) return '';
  const clean = String(dStr).trim();
  // Already in DD.MM.YY format
  if (/^\d{2}\.\d{2}\.\d{2}$/.test(clean)) return clean;
  const date = parseLoadingDate(clean);
  if (!date || isNaN(date.getTime())) return dStr;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${day}.${month}.${year}`;
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

    const manualW10 = num(row['10W EXTRA 8.5%']);
    if (manualW10 > 0) {
      entry.extra10W += manualW10;
    } else if (isSoOrNt) {
      const wheelStr = String(entry.wheel).toLowerCase();
      if (wheelStr.includes('10')) {
        entry.extra10W += orgFreight * 0.085;
      }
    }

    if (isSoOrNt) {
      const wheelStr = String(entry.wheel).toLowerCase();
      if (wheelStr.includes('6')) {
        entry.extra6W += orgFreight * 0.15;
      }
    }

    // Commission logic (use dynamic rate from contact, fallback to 5%)
    if (entry.hasComm) {
      const commRate = num(entry.commRate, 0.05);
      entry.commission += orgFreight * commRate;
    }
  }
  // 3. Final Aggregation with Achievement Criteria
  return Object.values(byTruck).map(t => {
    const metCriteria = t.tripsCount > 6;

    // PERFORMANCE RULE: Base 9.5% incentive (NVL/NVCL) is always shown.
    // However, 10W (8.5%) and 6W (15%) bonuses are ONLY paid if the truck makes > 6 trips.
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
    const totalFinal = totalIncentiveWithBonus; // Final Settlement (Removed commission subtraction as per plan)

    return { ...t, total: nvlNvclTotal, totalFinal };
  }).sort((a, b) => a.type.localeCompare(b.type) || a.ownerName.localeCompare(b.ownerName));
}

// Helper to parse Excel cells as numbers, handling commas and formatting
function parseExcelNum(val) {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  let cleaned = String(val)
    .replace(/,/g, '')
    .replace(/[₹$%\s]/g, '')
    .trim();
  
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    cleaned = '-' + cleaned.slice(1, -1);
  }
  
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

// Custom worksheet-to-AOA parser that handles merges, empty rows, and dimensions
function parseWorksheetToAOA(ws) {
  if (!ws) return [];
  
  // 1. Resolve merges: copy value of top-left cell to all cells within the merge range
  if (ws['!merges']) {
    ws['!merges'].forEach(merge => {
      const startRef = XLSX.utils.encode_cell(merge.s);
      const startCell = ws[startRef];
      if (!startCell) return;
      for (let r = merge.s.r; r <= merge.e.r; r++) {
        for (let c = merge.s.c; c <= merge.e.c; c++) {
          const cellRef = XLSX.utils.encode_cell({ r, c });
          if (!ws[cellRef]) {
            ws[cellRef] = { ...startCell };
          } else if (ws[cellRef].v === undefined || ws[cellRef].v === '' || ws[cellRef].v === null) {
            ws[cellRef] = { ...startCell };
          }
        }
      }
    });
  }

  // 2. Decode range and read cell-by-cell to guarantee no rows/columns are skipped
  if (ws['!ref']) {
    try {
      const range = XLSX.utils.decode_range(ws['!ref']);
      const aoa = [];
      for (let r = range.s.r; r <= range.e.r; r++) {
        const row = [];
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cellRef = XLSX.utils.encode_cell({ r, c });
          const cell = ws[cellRef];
          if (!cell) {
            row.push('');
          } else {
            const val = cell.w !== undefined ? String(cell.w).trim() : (cell.v !== undefined && cell.v !== null ? String(cell.v).trim() : '');
            row.push(val);
          }
        }
        aoa.push(row);
      }
      return aoa;
    } catch (e) {
      console.error("Custom range parser failed, falling back to sheet_to_json", e);
    }
  }

  // Fallback
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }).map(row => 
    (row || []).map(cell => (cell !== undefined && cell !== null ? String(cell).trim() : ''))
  );
}

// Locate the column containing "Sum of Dedi SMT Diff" or variation
function findDediSmtDiffColIdx(excelData) {
  if (!excelData || excelData.length === 0) return -1;
  
  // Find header row index
  let firstDataRowIdx = -1;
  for (let i = 0; i < Math.min(15, excelData.length); i++) {
    const row = excelData[i];
    if (!row) continue;
    let hasTruck = false;
    for (let c = 0; c < row.length; c++) {
      if (row[c] && extractTruckNo(row[c])) {
        hasTruck = true;
        break;
      }
    }
    if (hasTruck) {
      firstDataRowIdx = i;
      break;
    }
  }

  let headerRowIdx = -1;
  if (firstDataRowIdx > 0) {
    headerRowIdx = firstDataRowIdx - 1;
  } else {
    let maxHeaderMatches = 0;
    for (let i = 0; i < Math.min(15, excelData.length); i++) {
      const row = excelData[i];
      if (!row || row.length === 0) continue;
      let matches = 0;
      row.forEach(cell => {
        if (cell && typeof cell === 'string' && cell.trim().length > 1) {
          if (!extractTruckNo(cell)) {
            matches++;
          }
        }
      });
      if (matches > maxHeaderMatches) {
        maxHeaderMatches = matches;
        headerRowIdx = i;
      }
    }
  }

  const maxCol = Math.max(...excelData.map(r => r ? r.length : 0), 0);

  for (let c = 0; c < maxCol; c++) {
    let combinedText = '';
    for (let r = 0; r <= Math.max(headerRowIdx, 3); r++) {
      const val = excelData[r]?.[c];
      if (val !== undefined && val !== null && val !== '') {
        combinedText += ' ' + String(val);
      }
    }
    const cleaned = combinedText.toLowerCase().trim().replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');
    if (cleaned.includes('dedi') && (cleaned.includes('smt') || cleaned.includes('diff'))) {
      return c;
    }
  }

  // Fallback check cell by cell
  for (let r = 0; r < Math.min(10, excelData.length); r++) {
    const row = excelData[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const cellText = String(row[c] || '').toLowerCase();
      if (cellText.includes('dedi') && (cellText.includes('smt') || cellText.includes('diff'))) {
        return c;
      }
    }
  }

  // Second fallback: check for any column name containing "diff"
  for (let c = 0; c < maxCol; c++) {
    let combinedText = '';
    for (let r = 0; r <= Math.max(headerRowIdx, 3); r++) {
      const val = excelData[r]?.[c];
      if (val !== undefined && val !== null && val !== '') {
        combinedText += ' ' + String(val);
      }
    }
    const cleaned = combinedText.toLowerCase().trim().replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');
    if (cleaned.includes('diff')) {
      return c;
    }
  }

  return -1;
}

// Extract the "Sum of Dedi SMT Diff" values and map them to truck numbers
function mapExcelToActuals(excelData, systemTrucks) {
  if (!excelData || excelData.length === 0 || !systemTrucks) return {};

  const normalize = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  let firstDataRowIdx = -1;
  for (let i = 0; i < Math.min(15, excelData.length); i++) {
    const row = excelData[i];
    if (!row) continue;
    let hasTruck = false;
    for (let c = 0; c < row.length; c++) {
      if (row[c] && extractTruckNo(row[c])) {
        hasTruck = true;
        break;
      }
    }
    if (hasTruck) {
      firstDataRowIdx = i;
      break;
    }
  }

  let headerRowIdx = -1;
  if (firstDataRowIdx > 0) {
    headerRowIdx = firstDataRowIdx - 1;
  } else {
    let maxHeaderMatches = 0;
    for (let i = 0; i < Math.min(15, excelData.length); i++) {
      const row = excelData[i];
      if (!row || row.length === 0) continue;
      let matches = 0;
      row.forEach(cell => {
        if (cell && typeof cell === 'string' && cell.trim().length > 1) {
          if (!extractTruckNo(cell)) {
            matches++;
          }
        }
      });
      if (matches > maxHeaderMatches) {
        maxHeaderMatches = matches;
        headerRowIdx = i;
      }
    }
  }

  const maxCol = Math.max(...excelData.map(r => r ? r.length : 0), 0);
  const dediColIdx = findDediSmtDiffColIdx(excelData);

  // Find truck/vehicle number column (most matching truck numbers)
  let truckColIdx = -1;
  const truckCounts = new Array(maxCol).fill(0);
  const startRow = firstDataRowIdx !== -1 ? firstDataRowIdx : headerRowIdx + 1;

  for (let r = startRow; r < excelData.length; r++) {
    const row = excelData[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      if (row[c] && extractTruckNo(row[c])) {
        truckCounts[c]++;
      }
    }
  }

  let maxMatches = 0;
  for (let c = 0; c < maxCol; c++) {
    if (truckCounts[c] > maxMatches) {
      maxMatches = truckCounts[c];
      truckColIdx = c;
    }
  }

  if (truckColIdx === -1) {
    for (let c = 0; c < maxCol; c++) {
      let combinedText = '';
      for (let r = 0; r <= Math.max(headerRowIdx, 3); r++) {
        const val = excelData[r]?.[c];
        if (val !== undefined && val !== null && val !== '') {
          combinedText += ' ' + String(val);
        }
      }
      const cleaned = combinedText.toLowerCase().trim().replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');
      if (cleaned.includes('truck') || cleaned.includes('vehicle') || cleaned === 'no' || cleaned.includes('truck no') || cleaned.includes('vehicle no')) {
        truckColIdx = c;
        break;
      }
    }
  }

  const mapped = {};
  if (truckColIdx === -1 || dediColIdx === -1) {
    return mapped;
  }

  const rawExcelMapped = {};
  for (let r = startRow; r < excelData.length; r++) {
    const row = excelData[r];
    if (!row) continue;
    const rawTruck = row[truckColIdx];
    const cleanTruck = extractTruckNo(rawTruck);
    if (!cleanTruck) continue;

    const rawVal = row[dediColIdx];
    const cleanVal = parseExcelNum(rawVal);
    if (rawExcelMapped[cleanTruck] === undefined) {
      rawExcelMapped[cleanTruck] = 0;
    }
    rawExcelMapped[cleanTruck] += cleanVal;
  }

  // Map to systemTrucks
  systemTrucks.forEach(t => {
    const normSys = normalize(t.truckNo);
    if (rawExcelMapped[normSys] !== undefined) {
      mapped[t.truckNo] = rawExcelMapped[normSys];
    } else {
      const match = Object.keys(rawExcelMapped).find(k => k === normSys || normSys.includes(k) || k.includes(normSys));
      if (match) {
        mapped[t.truckNo] = rawExcelMapped[match];
      }
    }
  });

  return mapped;
}

// ─── Comparison Logic & Excel Export ───────────────────────────────────────────
function buildComparisonData(data, year, month, actuals = {}, uploadedExcelData = null) {
  if (!uploadedExcelData || uploadedExcelData.length === 0) return null;

  const normalize = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  // 1. Find header row in uploadedExcelData
  let firstDataRowIdx = -1;
  for (let i = 0; i < Math.min(15, uploadedExcelData.length); i++) {
    const row = uploadedExcelData[i];
    if (!row) continue;
    let hasTruck = false;
    for (let c = 0; c < row.length; c++) {
      if (row[c] && extractTruckNo(row[c])) {
        hasTruck = true;
        break;
      }
    }
    if (hasTruck) {
      firstDataRowIdx = i;
      break;
    }
  }

  let headerRowIdx = -1;
  if (firstDataRowIdx > 0) {
    headerRowIdx = firstDataRowIdx - 1;
  } else {
    let maxHeaderMatches = 0;
    for (let i = 0; i < Math.min(15, uploadedExcelData.length); i++) {
      const row = uploadedExcelData[i];
      if (!row || row.length === 0) continue;
      let matches = 0;
      row.forEach(cell => {
        if (cell && typeof cell === 'string' && cell.trim().length > 1) {
          if (!extractTruckNo(cell)) {
            matches++;
          }
        }
      });
      if (matches > maxHeaderMatches) {
        maxHeaderMatches = matches;
        headerRowIdx = i;
      }
    }
  }

  const mailMaxCol = Math.max(...uploadedExcelData.map(r => r ? r.length : 0), 7);
  const OUR_START_COL = mailMaxCol + 1;

  // 2. Propagate merged parent group headers (NVL/NVCL) across empty cells
  const headerRowsNormal = [];
  for (let r = 0; r <= headerRowIdx; r++) {
    const row = uploadedExcelData[r];
    if (!row) continue;
    const newRow = [...row];
    let lastVal = '';
    for (let c = 0; c < mailMaxCol; c++) {
      const valStr = String(newRow[c] || '').trim();
      if (valStr !== '') {
        lastVal = valStr;
      } else {
        if (lastVal === 'NVL' || lastVal === 'NVCL' || lastVal.toUpperCase().includes('NVL') || lastVal.toUpperCase().includes('NVCL')) {
          newRow[c] = lastVal;
        }
      }
    }
    headerRowsNormal.push(newRow);
  }

  // 3. Map Excel headers
  const colMap = {
    // Left side (Transporter actuals)
    leftTruckCol: -1,
    leftQty: -1,
    leftAmt: -1,
    leftFreight: -1,

    // Right side (System calculations in Excel)
    rightTruckCol: -1,
    nvlQty: -1,
    nvlAmt: -1,
    nvclQty: -1,
    nvclAmt: -1,
    total: -1,
    extra10w: -1,
    grandTotal: -1,
    trips: -1,
    type: -1,
    ownerName: -1,
    wheel: -1
  };

  let typeCol = -1;
  for (let c = 0; c < mailMaxCol; c++) {
    let combinedText = '';
    for (let r = 1; r < headerRowsNormal.length; r++) {
      const val = headerRowsNormal[r]?.[c];
      if (val !== undefined && val !== null && val !== '') {
        combinedText += ' ' + String(val);
      }
    }
    const cleaned = combinedText.toLowerCase().trim().replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');
    if (cleaned === 'type') {
      typeCol = c;
    }
  }

  for (let c = 0; c < mailMaxCol; c++) {
    let combinedText = '';
    for (let r = 1; r < headerRowsNormal.length; r++) {
      const val = headerRowsNormal[r]?.[c];
      if (val !== undefined && val !== null && val !== '') {
        combinedText += ' ' + String(val);
      }
    }
    const cleaned = combinedText.toLowerCase().trim().replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');
    if (!cleaned) continue;

    // Detect left vs right side based on index c.
    const isRight = (c >= (typeCol !== -1 ? typeCol : 8));

    if (isRight) {
      const hasNvcl = cleaned.includes('nvcl') || cleaned.includes('mkt');
      const hasNvl = (cleaned.includes('nvl') || cleaned.includes('atoa') || cleaned.includes('ato')) && !hasNvcl;

      if (cleaned.includes('trips') || cleaned.includes('trip count') || cleaned === 'trips') {
        colMap.trips = c;
      } else if (hasNvcl && (cleaned.includes('qty') || cleaned.includes('inv') || cleaned.includes('quantity'))) {
        colMap.nvclQty = c;
      } else if (hasNvcl && (cleaned.includes('amt') || cleaned.includes('amount') || cleaned.includes('freight') || cleaned.includes('incentive'))) {
        colMap.nvclAmt = c;
      } else if (hasNvl && (cleaned.includes('qty') || cleaned.includes('inv') || cleaned.includes('quantity'))) {
        colMap.nvlQty = c;
      } else if (hasNvl && (cleaned.includes('amt') || cleaned.includes('amount') || cleaned.includes('freight') || cleaned.includes('incentive'))) {
        colMap.nvlAmt = c;
      } else if (cleaned.includes('10w') || cleaned.includes('10wh') || cleaned.includes('8.5%') || cleaned.includes('6w') || cleaned.includes('15%')) {
        colMap.extra10w = c;
      } else if (cleaned.includes('grand') || cleaned.includes('final') || cleaned.includes('settled') || cleaned.includes('total') || cleaned.includes('projected')) {
        if (cleaned.includes('grand') || cleaned.includes('final') || cleaned.includes('settled') || cleaned.includes('projected')) {
          colMap.grandTotal = c;
        } else if (colMap.total === -1 || c > colMap.total) {
          colMap.total = c;
        }
      }

      if (cleaned.includes('truck') || cleaned.includes('vehicle') || cleaned === 'no' || cleaned.includes('truck no') || cleaned.includes('vehicle no')) {
        if (typeCol !== -1 && c > typeCol) {
          colMap.rightTruckCol = c;
        } else if (colMap.rightTruckCol === -1) {
          colMap.rightTruckCol = c;
        }
      }

      if (cleaned === 'type') {
        colMap.type = c;
      } else if (cleaned.includes('owner') || cleaned.includes('transporter') || cleaned.includes('owner name')) {
        colMap.ownerName = c;
      } else if (cleaned.includes('wheel') || cleaned.includes('wh') || cleaned.includes('wheel type')) {
        colMap.wheel = c;
      }
    } else {
      // Left side (Transporter values)
      if (cleaned.includes('truck') || cleaned.includes('vehicle') || cleaned === 'no' || cleaned.includes('truck no') || cleaned.includes('vehicle no')) {
        colMap.leftTruckCol = c;
      } else if (cleaned.includes('qty') || cleaned.includes('inv') || cleaned.includes('quantity')) {
        colMap.leftQty = c;
      } else if (cleaned.includes('diff') || cleaned.includes('dedi amt diff') || cleaned.includes('incentive')) {
        colMap.leftAmt = c;
      } else if (cleaned.includes('freight') || cleaned.includes('sap master')) {
        colMap.leftFreight = c;
      } else if (cleaned.includes('amount') || cleaned.includes('dedi amt')) {
        if (colMap.leftAmt === -1) colMap.leftAmt = c;
      }
    }
  }

  if (colMap.leftTruckCol === -1 && colMap.rightTruckCol !== -1) {
    colMap.leftTruckCol = colMap.rightTruckCol;
  }
  if (colMap.rightTruckCol === -1 && colMap.leftTruckCol !== -1) {
    colMap.rightTruckCol = colMap.leftTruckCol;
  }

  // If right-side columns are not found, map to left side as fallbacks
  if (colMap.grandTotal === -1 && colMap.total !== -1) {
    colMap.grandTotal = colMap.total;
  }
  if (colMap.grandTotal === -1) colMap.grandTotal = colMap.leftAmt;
  if (colMap.nvlQty === -1) colMap.nvlQty = colMap.leftQty;
  if (colMap.nvlAmt === -1) colMap.nvlAmt = colMap.leftAmt;

  // ── PART 1: LEGACY AOA MERGE FOR EXPORT COMPATIBILITY ──
  const aoa = [];
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

    if (colMap.leftTruckCol !== -1 && colMap.leftTruckCol < row.length) {
      const cell = row[colMap.leftTruckCol];
      const cleaned = extractTruckNo(cell);
      if (cleaned) {
        matchedData = data.find(t => normalize(t.truckNo) === cleaned);
        if (matchedData) {
          foundTruckNo = matchedData.truckNo;
        }
      }
    }

    if (!matchedData) {
      for (let c = 0; c < mailMaxCol; c++) {
        if (row[c] !== undefined && row[c] !== null && row[c] !== '') {
          const cleaned = extractTruckNo(row[c]);
          if (cleaned) {
            matchedData = data.find(t => normalize(t.truckNo) === cleaned);
            if (matchedData) {
              foundTruckNo = matchedData.truckNo;
              break;
            }
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

  // 4. Map of normalizedTruckNo -> Array<{ rowIndex, row }>
  const excelLeftMap = new Map();
  const excelRightMap = new Map();

  uploadedExcelData.forEach((row, rIdx) => {
    if (!row || rIdx <= headerRowIdx) return;

    // Match left truck
    if (colMap.leftTruckCol !== -1 && colMap.leftTruckCol < row.length) {
      const cell = row[colMap.leftTruckCol];
      const cleaned = extractTruckNo(cell);
      if (cleaned) {
        if (!excelLeftMap.has(cleaned)) {
          excelLeftMap.set(cleaned, []);
        }
        excelLeftMap.get(cleaned).push({ rowIndex: rIdx, row });
      }
    }

    // Match right truck
    if (colMap.rightTruckCol !== -1 && colMap.rightTruckCol < row.length) {
      const cell = row[colMap.rightTruckCol];
      const cleaned = extractTruckNo(cell);
      if (cleaned) {
        if (!excelRightMap.has(cleaned)) {
          excelRightMap.set(cleaned, []);
        }
        excelRightMap.get(cleaned).push({ rowIndex: rIdx, row });
      }
    }
  });

  const systemTrucksMap = new Map();
  data.forEach(t => {
    systemTrucksMap.set(normalize(t.truckNo), t);
  });

  const allTruckNos = Array.from(new Set([
    ...systemTrucksMap.keys(),
    ...excelLeftMap.keys(),
    ...excelRightMap.keys()
  ])).sort();

  // Build Excel rows details for bottom section (padded up to mailMaxCol)
  const excelRowsDetail = uploadedExcelData.map((row, rIdx) => {
    if (!row) {
      return { rowIndex: rIdx, rowData: new Array(mailMaxCol).fill(''), matchedTruck: null, isSystemMissing: false };
    }
    
    const paddedRow = [...row];
    while (paddedRow.length < mailMaxCol) {
      paddedRow.push('');
    }
    for (let i = 0; i < mailMaxCol; i++) {
      if (paddedRow[i] === undefined || paddedRow[i] === null) {
        paddedRow[i] = '';
      }
    }

    if (rIdx <= headerRowIdx) {
      return { rowIndex: rIdx, rowData: paddedRow, matchedTruck: null, isSystemMissing: false };
    }

    const leftTruck = colMap.leftTruckCol !== -1 && colMap.leftTruckCol < row.length ? extractTruckNo(row[colMap.leftTruckCol]) : '';
    const rightTruck = colMap.rightTruckCol !== -1 && colMap.rightTruckCol < row.length ? extractTruckNo(row[colMap.rightTruckCol]) : '';

    const hasLeftSystem = leftTruck ? systemTrucksMap.has(normalize(leftTruck)) : false;
    const hasRightSystem = rightTruck ? systemTrucksMap.has(normalize(rightTruck)) : false;

    const matchedTruck = leftTruck || rightTruck || null;
    const isSystemMissing = (leftTruck && !hasLeftSystem) || (rightTruck && !hasRightSystem);

    return {
      rowIndex: rIdx,
      rowData: paddedRow,
      matchedTruck: matchedTruck ? normalize(matchedTruck) : null,
      isSystemMissing: isSystemMissing && !hasLeftSystem && !hasRightSystem
    };
  });

  const parseVal = (row, idx) => {
    if (idx === -1 || !row || idx >= row.length) return 0;
    return parseExcelNum(row[idx]);
  };

  // Helper to sum column values for all rows matching a truck
  const sumColVal = (rowsList, colIdx) => {
    if (!rowsList || rowsList.length === 0 || colIdx === -1) return 0;
    return rowsList.reduce((sum, item) => {
      const r = item.row;
      if (!r || colIdx >= r.length) return sum;
      return sum + parseExcelNum(r[colIdx]);
    }, 0);
  };

  // Build System trucks details for top section
  let mismatchedCount = 0;
  let matchedCount = 0;
  let missingInExcelCount = 0;
  let missingInSystemCount = 0;

  const systemTrucksDetail = allTruckNos.map(normTruck => {
    const t = systemTrucksMap.get(normTruck);
    const excelLeft = excelLeftMap.get(normTruck);
    const excelRight = excelRightMap.get(normTruck);

    const firstRightRow = excelRight && excelRight.length > 0 ? excelRight[0].row : null;
    const firstLeftRow = excelLeft && excelLeft.length > 0 ? excelLeft[0].row : null;
    const firstRowIdx = excelRight && excelRight.length > 0 ? excelRight[0].rowIndex : (excelLeft && excelLeft.length > 0 ? excelLeft[0].rowIndex : -1);

    const rightRow = firstRightRow;
    const leftRow = firstLeftRow;

    if (!t) {
      // Excel-only truck
      missingInSystemCount++;
      
      let excelType = 'MKT';
      const excelRowForType = rightRow || leftRow;
      if (colMap.type !== -1 && excelRowForType && colMap.type < excelRowForType.length) {
        excelType = String(excelRowForType[colMap.type] || '').trim().toUpperCase();
      }
      let excelOwnerName = '';
      const excelRowForOwner = rightRow || leftRow;
      if (colMap.ownerName !== -1 && excelRowForOwner && colMap.ownerName < excelRowForOwner.length) {
        excelOwnerName = String(excelRowForOwner[colMap.ownerName] || '').trim();
      }
      let excelWheel = '';
      const excelRowForWheel = rightRow || leftRow;
      if (colMap.wheel !== -1 && excelRowForWheel && colMap.wheel < excelRowForWheel.length) {
        excelWheel = String(excelRowForWheel[colMap.wheel] || '').trim();
      }

      const dummyTruck = {
        type: excelType || 'MKT',
        ownerName: excelOwnerName || '',
        truckNo: excelLeft ? (firstLeftRow[colMap.leftTruckCol] || normTruck) : (firstRightRow[colMap.rightTruckCol] || normTruck),
        wheel: excelWheel || '',
        tripsCount: 0,
        nvl: { invQty: 0, orgFreight: 0, amt: 0 },
        nvcl: { invQty: 0, orgFreight: 0, amt: 0 },
        extra10W: 0,
        extra6W: 0,
        total: 0,
        totalFinal: 0,
        isDummy: true
      };

      const isExcelNvl = (excelType === 'ATOA' || excelType === 'ATO' || excelType === 'NVL');

      const excelValues = {
        trips: sumColVal(excelRight, colMap.trips),
        nvlQty: sumColVal(excelRight, colMap.nvlQty) || (isExcelNvl ? sumColVal(excelLeft, colMap.leftQty) : 0),
        nvlAmt: sumColVal(excelRight, colMap.nvlAmt) || (isExcelNvl ? sumColVal(excelLeft, colMap.leftAmt) : 0),
        nvclQty: sumColVal(excelRight, colMap.nvclQty) || (!isExcelNvl ? sumColVal(excelLeft, colMap.leftQty) : 0),
        nvclAmt: sumColVal(excelRight, colMap.nvclAmt) || (!isExcelNvl ? sumColVal(excelLeft, colMap.leftAmt) : 0),
        extra10w: sumColVal(excelRight, colMap.extra10w),
        grandTotal: sumColVal(excelRight, colMap.grandTotal) || sumColVal(excelLeft, colMap.leftAmt)
      };

      const mismatches = ['trips', 'nvlQty', 'nvlAmt', 'nvclQty', 'nvclAmt', 'extra10w', 'grandTotal'].filter(f => excelValues[f] > 0);

      return {
        truck: dummyTruck,
        excelRowIndex: firstRowIdx,
        excelRow: rightRow || leftRow,
        excelValues,
        hasDiscrepancy: mismatches.length > 0,
        mismatches,
        status: 'NOT_IN_SYSTEM'
      };
    }

    if (!excelLeft && !excelRight) {
      // System-only truck
      missingInExcelCount++;
      const mismatches = ['trips', 'nvlQty', 'nvlAmt', 'nvclQty', 'nvclAmt', 'extra10w', 'grandTotal'].filter(f => {
        if (f === 'trips') return t.tripsCount > 0;
        if (f === 'nvlQty') return t.nvl.invQty > 0;
        if (f === 'nvlAmt') return t.nvl.amt > 0;
        if (f === 'nvclQty') return t.nvcl.invQty > 0;
        if (f === 'nvclAmt') return t.nvcl.amt > 0;
        if (f === 'extra10w') return (t.extra10W + t.extra6W) > 0;
        if (f === 'grandTotal') return t.totalFinal > 0;
        return false;
      });

      return {
        truck: t,
        excelRowIndex: -1,
        excelRow: null,
        excelValues: { trips: 0, nvlQty: 0, nvlAmt: 0, nvclQty: 0, nvclAmt: 0, extra10w: 0, grandTotal: 0 },
        hasDiscrepancy: mismatches.length > 0,
        mismatches,
        status: 'MISSING_IN_EXCEL'
      };
    }

    // Present in both (either left, right, or both)
    matchedCount++;
    const isNvl = (t.type === 'ATOA' || t.type === 'ATO');

    const excelValues = {
      trips: sumColVal(excelRight, colMap.trips),
      nvlQty: sumColVal(excelRight, colMap.nvlQty) || (isNvl ? sumColVal(excelLeft, colMap.leftQty) : 0),
      nvlAmt: sumColVal(excelRight, colMap.nvlAmt) || (isNvl ? sumColVal(excelLeft, colMap.leftAmt) : 0),
      nvclQty: sumColVal(excelRight, colMap.nvclQty) || (!isNvl ? sumColVal(excelLeft, colMap.leftQty) : 0),
      nvclAmt: sumColVal(excelRight, colMap.nvclAmt) || (!isNvl ? sumColVal(excelLeft, colMap.leftAmt) : 0),
      extra10w: sumColVal(excelRight, colMap.extra10w),
      grandTotal: sumColVal(excelRight, colMap.grandTotal) || sumColVal(excelLeft, colMap.leftAmt)
    };

    // Calculate discrepancies
    const mismatches = [];
    if (colMap.trips !== -1 && Math.abs(t.tripsCount - excelValues.trips) > 0) mismatches.push('trips');
    if (colMap.nvlQty !== -1 && Math.abs(t.nvl.invQty - excelValues.nvlQty) > 1) mismatches.push('nvlQty');
    if (colMap.nvlAmt !== -1 && Math.abs(t.nvl.amt - excelValues.nvlAmt) > 5) mismatches.push('nvlAmt');
    if (colMap.nvclQty !== -1 && Math.abs(t.nvcl.invQty - excelValues.nvclQty) > 1) mismatches.push('nvclQty');
    if (colMap.nvclAmt !== -1 && Math.abs(t.nvcl.amt - excelValues.nvclAmt) > 5) mismatches.push('nvclAmt');
    if (colMap.extra10w !== -1 && Math.abs((t.extra10W + t.extra6W) - excelValues.extra10w) > 5) mismatches.push('extra10w');

    const totalDiff = Math.abs(t.totalFinal - excelValues.grandTotal);
    if (totalDiff > 5) {
      mismatches.push('grandTotal');
    }

    const hasDiscrepancy = mismatches.length > 0;
    if (hasDiscrepancy) {
      mismatchedCount++;
    }

    return {
      truck: t,
      excelRowIndex: firstRowIdx,
      excelRow: rightRow || leftRow,
      excelValues,
      hasDiscrepancy,
      mismatches,
      status: hasDiscrepancy ? 'MISMATCH' : 'PERFECT_MATCH'
    };
  });

  const excelTrucksUnion = new Set([...excelLeftMap.keys(), ...excelRightMap.keys()]);
  const stats = {
    systemCount: data.length,
    excelTrucksCount: excelTrucksUnion.size,
    matchedCount,
    mismatchedCount,
    missingInExcelCount,
    missingInSystemCount
  };

  return {
    aoa,
    merges,
    OUR_START_COL,
    mailMaxCol,
    colMap,
    excelRowsDetail,
    systemTrucksDetail,
    stats,
    headerRowIdx
  };
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
export default function IncentiveAnalysis({ rows, initialMonth, initialYear, onPeriodChange, onBack }) {
  const now = new Date();
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth); // 0-indexed

  // UI Modal state
  const [comparisonModalOpen, setComparisonModalOpen] = useState(false);
  const [mailNvlTotal, setMailNvlTotal] = useState('');
  const [mailW10Total, setMailW10Total] = useState('');
  const [mailNvclTotal, setMailNvclTotal] = useState('');

  // State for uploaded files preview and actuals loaded from database
  const [uploadedPdfUrl, setUploadedPdfUrl] = useState(null);
  const [uploadedExcelName, setUploadedExcelName] = useState(null);
  const [uploadedExcelData, setUploadedExcelData] = useState(null);
  const [actuals, setActuals] = useState({});
  const [loadingState, setLoadingState] = useState(false);
  const [savingActuals, setSavingActuals] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletingState, setDeletingState] = useState(false);

  // New Save Status Flow states
  const [saveCompleted, setSaveCompleted] = useState(false);
  const [dbActuals, setDbActuals] = useState({});
  const [hasNewUpload, setHasNewUpload] = useState(false);
  const [snack, setSnack] = useState(null);

  const [dediSmtDiffColIdx, setDediSmtDiffColIdx] = useState(-1);

  useEffect(() => {
    if (initialYear !== undefined) {
      setYear(initialYear);
    }
  }, [initialYear]);

  useEffect(() => {
    if (initialMonth !== undefined) {
      setMonth(initialMonth);
    }
  }, [initialMonth]);

  useEffect(() => {
    if (uploadedExcelData) {
      setDediSmtDiffColIdx(findDediSmtDiffColIdx(uploadedExcelData));
    } else {
      setDediSmtDiffColIdx(-1);
    }
  }, [uploadedExcelData]);

  const hasIncentiveData = useMemo(() => {
    return !!uploadedPdfUrl || !!uploadedExcelName || !!uploadedExcelData || Object.keys(actuals).length > 0;
  }, [uploadedPdfUrl, uploadedExcelName, uploadedExcelData, actuals]);

  const getStatusChip = () => {
    if (hasNewUpload) {
      return (
        <Chip
          label="⚠️ Preview (Unsaved)"
          size="small"
          sx={{
            fontWeight: 700,
            bgcolor: '#fff7ed',
            color: '#c2410c',
            border: '1px solid #ffedd5',
            fontFamily: 'Inter, system-ui, sans-serif',
            px: 1,
            height: 24,
            fontSize: '0.7rem',
          }}
        />
      );
    } else if (saveCompleted) {
      return (
        <Chip
          label="✅ Saved successfully"
          size="small"
          sx={{
            fontWeight: 700,
            bgcolor: '#ecfdf5',
            color: '#047857',
            border: '1px solid #d1fae5',
            fontFamily: 'Inter, system-ui, sans-serif',
            px: 1,
            height: 24,
            fontSize: '0.7rem',
          }}
        />
      );
    } else {
      return (
        <Chip
          label="ℹ️ No data loaded"
          size="small"
          sx={{
            fontWeight: 700,
            bgcolor: '#f1f5f9',
            color: '#475569',
            border: '1px solid #e2e8f0',
            fontFamily: 'Inter, system-ui, sans-serif',
            px: 1,
            height: 24,
            fontSize: '0.7rem',
          }}
        />
      );
    }
  };

  const isActualsModified = useMemo(() => {
    const keys1 = Object.keys(actuals);
    const keys2 = Object.keys(dbActuals);
    
    const activeKeys1 = keys1.filter(k => actuals[k] !== undefined && actuals[k] !== null && String(actuals[k]).trim() !== '');
    const activeKeys2 = keys2.filter(k => dbActuals[k] !== undefined && dbActuals[k] !== null && String(dbActuals[k]).trim() !== '');
    
    if (activeKeys1.length !== activeKeys2.length) return true;
    for (const key of activeKeys1) {
      if (String(actuals[key]).trim() !== String(dbActuals[key] ?? '').trim()) return true;
    }
    return false;
  }, [actuals, dbActuals]);

  const isDirty = hasNewUpload || isActualsModified;

  // Auto-initialize month/year based on latest record date if not provided
  useEffect(() => {
    if ((year === undefined || month === undefined) && rows && rows.length > 0) {
      let latestDate = null;
      let matchedYear = null;
      let matchedMonth = null;

      rows.forEach(row => {
        const dateStrings = [row['LOADING DT'], row['BILL DATE'], row['RECEIVING DATE']].filter(Boolean);
        dateStrings.forEach(ds => {
          let d = null;
          let m = String(ds).match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
          if (m) {
            d = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
          } else {
            const parsedIso = Date.parse(ds);
            if (!isNaN(parsedIso)) {
              d = new Date(parsedIso);
            }
          }
          if (d && (!latestDate || d > latestDate)) {
            latestDate = d;
            matchedYear = d.getFullYear();
            matchedMonth = d.getMonth();
          }
        });
      });

      if (matchedYear !== null && matchedMonth !== null) {
        if (year === undefined) setYear(matchedYear);
        if (month === undefined) setMonth(matchedMonth);
      } else {
        if (year === undefined) setYear(new Date().getFullYear());
        if (month === undefined) setMonth(new Date().getMonth());
      }
    } else {
      if (year === undefined) setYear(new Date().getFullYear());
      if (month === undefined) setMonth(new Date().getMonth());
    }
  }, [rows, initialYear, initialMonth, year, month]);

  // Reload state if month/year changes
  useEffect(() => {
    if (year === undefined || month === undefined) return;
    const fetchState = async () => {
      setLoadingState(true);
      try {
        const token = localStorage.getItem('token');
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
        const res = await axios.get(`${API_URL}/cement-register/incentive-state?year=${year}&month=${month}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.data.success && res.data.state) {
          const st = res.data.state;
          setActuals(st.actuals || {});
          setDbActuals(st.actuals || {});
          setUploadedPdfUrl(st.pdfUrl || null);
          setUploadedExcelName(st.excelName || null);
          setUploadedExcelData(st.excelData || null);
          setSaveCompleted(!!st.excelData);
          setHasNewUpload(false);
          if (st.excelData && st.excelData.length > 0) {
            setComparisonModalOpen(true);
          } else {
            setComparisonModalOpen(false);
          }
        } else {
          setActuals({});
          setDbActuals({});
          setUploadedPdfUrl(null);
          setUploadedExcelName(null);
          setUploadedExcelData(null);
          setSaveCompleted(false);
          setHasNewUpload(false);
          setComparisonModalOpen(false);
        }
      } catch (err) {
        console.error("Failed to load incentive state:", err);
      } finally {
        setLoadingState(false);
      }
    };
    fetchState();
  }, [year, month]);

  const handleSaveActuals = async () => {
    setSavingActuals(true);
    try {
      const token = localStorage.getItem('token');
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      await axios.post(`${API_URL}/cement-register/incentive-state`, {
        year,
        month,
        actuals,
        pdfUrl: uploadedPdfUrl,
        excelName: uploadedExcelName,
        excelData: uploadedExcelData
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSaveCompleted(true);
      setDbActuals(actuals);
      setHasNewUpload(false);
      setSnack({ severity: 'success', msg: 'Incentive data saved successfully!' });
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Failed to save incentive data: ' + (err.response?.data?.error || err.message) });
      console.error("Error saving incentive state:", err);
    } finally {
      setSavingActuals(false);
    }
  };

  const handleDeleteState = async () => {
    setDeletingState(true);
    try {
      const token = localStorage.getItem('token');
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      await axios.delete(`${API_URL}/cement-register/incentive-state?year=${year}&month=${month}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Clear local state variables
      setActuals({});
      setDbActuals({});
      setUploadedPdfUrl(null);
      setUploadedExcelName(null);
      setUploadedExcelData(null);
      setSaveCompleted(false);
      setHasNewUpload(false);
      setConfirmDelete(false);
      setSnack({ severity: 'success', msg: 'Incentive data deleted successfully for this month.' });
    } catch (err) {
      setSnack({ severity: 'error', msg: 'Failed to delete incentive data: ' + (err.response?.data?.error || err.message) });
      console.error("Error deleting incentive state:", err);
    } finally {
      setDeletingState(false);
    }
  };

  // ── Truck Contacts from MongoDB (for Wheel & Owner lookup) ──────────────────
  const [truckContacts, setTruckContacts] = useState([]);
  useEffect(() => {
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    axios.get(`${API_URL}/truck-contacts`)
      .then(res => { if (res.data?.success) setTruckContacts(res.data.contacts || []); })
      .catch(console.error);
  }, []);

  // ── Independent cement register fetch for selected month/year ────────────────
  // This ensures IncentiveAnalysis always has fresh data for the selected period,
  // regardless of what rows the parent has currently loaded.
  const [fetchedRows, setFetchedRows] = useState(rows || []);
  const [fetchingRows, setFetchingRows] = useState(false);
  useEffect(() => {
    if (year === undefined || month === undefined) return;
    // month here is 0-indexed, but API expects 1-indexed
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    setFetchingRows(true);
    axios.get(`${API_URL}/cement-register`, {
      params: { month: month + 1, year }
    })
      .then(res => {
        if (res.data?.success) {
          // Format dates to DD.MM.YY to match the same format as computedRows
          const entries = (res.data.entries || []).map(row => ({
            ...row,
            'LOADING DT': formatLoadingDate(row['LOADING DT'] || row['LOADING DATE'] || '')
          }));
          setFetchedRows(entries);
        }
      })
      .catch(err => {
        console.error('IncentiveAnalysis: failed to fetch cement register rows', err);
        // Fall back to parent rows if fetch fails
        setFetchedRows(rows || []);
      })
      .finally(() => setFetchingRows(false));
  }, [year, month]);

  // Sync fetchedRows with parent rows on first load
  useEffect(() => {
    if (rows && rows.length > 0 && fetchedRows.length === 0) {
      setFetchedRows(rows);
    }
  }, [rows]);

  const data = useMemo(() => buildIncentiveData(fetchedRows, year, month, truckContacts), [fetchedRows, year, month, truckContacts]);

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

  const renderComparedCell = (sysVal, excelVal, isAmount = false, highlightDiff = false) => {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' }}>
        <Typography sx={{ fontSize: '11px', fontWeight: 700, color: '#0f172a' }}>
          {isAmount ? fmt(sysVal) : Math.round(sysVal)}
        </Typography>
        {highlightDiff && (
          <Typography sx={{ fontSize: '9.5px', fontWeight: 700, color: '#dc2626', mt: 0.2 }}>
            Excel: {isAmount ? fmt(excelVal) : Math.round(excelVal)}
          </Typography>
        )}
      </Box>
    );
  };

  // Derived view data for modal
  const comparisonViewDef = useMemo(() => {
    if (!comparisonModalOpen || !uploadedExcelData) return null;
    return buildComparisonData(data, year, month, actuals, uploadedExcelData);
  }, [comparisonModalOpen, data, year, month, actuals, uploadedExcelData]);

  const compTotals = useMemo(() => {
    if (!comparisonViewDef) return null;
    return comparisonViewDef.systemTrucksDetail.reduce((acc, detail) => {
      const t = detail.truck;
      const ev = detail.excelValues;
      
      acc.sysTrips += t.tripsCount;
      acc.sysNvlQty += t.nvl.invQty;
      acc.sysNvlAmt += t.nvl.amt;
      acc.sysNvclQty += t.nvcl.invQty;
      acc.sysNvclAmt += t.nvcl.amt;
      acc.sysExtra10W += (t.extra10W + t.extra6W);
      acc.sysGrand += t.totalFinal;

      acc.excelTrips += ev.trips;
      acc.excelNvlQty += ev.nvlQty;
      acc.excelNvlAmt += ev.nvlAmt;
      acc.excelNvclQty += ev.nvclQty;
      acc.excelNvclAmt += ev.nvclAmt;
      acc.excelExtra10W += ev.extra10w;
      acc.excelGrand += ev.grandTotal;

      return acc;
    }, {
      sysTrips: 0, sysNvlQty: 0, sysNvlAmt: 0, sysNvclQty: 0, sysNvclAmt: 0, sysExtra10W: 0, sysGrand: 0,
      excelTrips: 0, excelNvlQty: 0, excelNvlAmt: 0, excelNvclQty: 0, excelNvclAmt: 0, excelExtra10W: 0, excelGrand: 0
    });
  }, [comparisonViewDef]);

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
        <Box display="flex" alignItems="center" gap={1.5} flexWrap="wrap">
          <Typography variant="h6" fontWeight={800} sx={{ color: '#0f172a', letterSpacing: '-0.5px' }}>
            Incentive Calculation Sheet
          </Typography>
          <Typography sx={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>
            (NVL & NVCL Dedicated 9.5%)
          </Typography>

          {/* Month & Year Selectors */}
          <Box display="flex" alignItems="center" gap={1}>
            <Select
              size="small"
              value={month}
              onChange={(e) => {
                const newMonth = Number(e.target.value);
                setMonth(newMonth);
                setHasNewUpload(false);
                if (onPeriodChange) {
                  onPeriodChange(year, newMonth + 1);
                }
              }}
              sx={{
                height: 28,
                borderRadius: '8px',
                fontSize: '11px',
                fontWeight: 700,
                color: '#0f172a',
                bgcolor: '#f8fafc',
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#e2e8f0',
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#cbd5e1',
                },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#7c3aed',
                },
                minWidth: 105,
              }}
            >
              {MONTH_NAMES.map((m, i) => (
                <MenuItem key={i} value={i} sx={{ fontSize: '11px', fontWeight: 600 }}>{m}</MenuItem>
              ))}
            </Select>

            <Select
              size="small"
              value={year}
              onChange={(e) => {
                const newYear = Number(e.target.value);
                setYear(newYear);
                setHasNewUpload(false);
                if (onPeriodChange) {
                  onPeriodChange(newYear, month + 1);
                }
              }}
              sx={{
                height: 28,
                borderRadius: '8px',
                fontSize: '11px',
                fontWeight: 700,
                color: '#0f172a',
                bgcolor: '#f8fafc',
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#e2e8f0',
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#cbd5e1',
                },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#7c3aed',
                },
                minWidth: 75,
              }}
            >
              {years.map(y => (
                <MenuItem key={y} value={y} sx={{ fontSize: '11px', fontWeight: 600 }}>{y}</MenuItem>
              ))}
            </Select>
          </Box>

          {/* Status Badge */}
          {getStatusChip()}
        </Box>

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
            <input type="file" accept="application/pdf" hidden onChange={async (e) => {
              const file = e.target.files[0];
              if (file) {
                try {
                  const token = localStorage.getItem('token');
                  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
                  const fd = new FormData();
                  fd.append('file', file);
                  const res = await axios.post(`${API_URL}/cement-register/incentive-state/upload`, fd, {
                    headers: {
                      'Content-Type': 'multipart/form-data',
                      'Authorization': `Bearer ${token}`
                    }
                  });
                  if (res.data.success) {
                    setUploadedPdfUrl(res.data.url);
                  }
                } catch (err) {
                  alert("Failed to upload PDF: " + (err.response?.data?.error || err.message));
                }
              }
            }} />
          </Button>

          {saveCompleted && (
            <Button
              size="small" variant="contained" component="label" startIcon={<UploadIcon />}
              sx={{
                fontWeight: 700, borderRadius: 2, px: 2, fontSize: '11px',
                background: 'linear-gradient(135deg,#7c3aed,#6d28d9)',
                color: '#fff',
                textTransform: 'none',
                cursor: 'pointer',
                '&:hover': { background: 'linear-gradient(135deg,#6d28d9,#5b21b6)' }
              }}>
              Upload New
              <input type="file" accept=".xls,.xlsx" hidden onChange={async (e) => {
                const file = e.target.files[0];
                if (file) {
                  setUploadedExcelName(file.name);
                  const ab = await file.arrayBuffer();
                  const wb = XLSX.read(ab);
                  const sheetName = wb.SheetNames.find(name => name.toUpperCase().includes('INCENTIVE')) || wb.SheetNames[0];
                  const ws = wb.Sheets[sheetName];
                  const parsedRows = parseWorksheetToAOA(ws);
                  if (!parsedRows || parsedRows.length === 0) {
                    alert("The uploaded Excel sheet is empty or invalid.");
                    return;
                  }
                  const hasTrucks = parsedRows.some(row => row.some(cell => extractTruckNo(cell)));
                  if (!hasTrucks) {
                    alert("Warning: No valid vehicle/truck numbers were detected in this Excel sheet. Please verify you uploaded the correct file.");
                  }
                  setUploadedExcelData(parsedRows);
                  const mapped = mapExcelToActuals(parsedRows, data);
                  setActuals(prev => ({ ...prev, ...mapped }));
                  setHasNewUpload(true);
                  setSaveCompleted(false);
                  setComparisonModalOpen(true);
                }
              }} />
            </Button>
          )}

          <Button
            size="small" variant="outlined" component="label" startIcon={<UploadIcon />}
            disabled={saveCompleted}
            sx={{
              fontWeight: 700, borderRadius: 2, px: 1.5, fontSize: '11px',
              borderColor: '#cbd5e1', color: '#475569',
              textTransform: 'none',
              cursor: saveCompleted ? 'default' : 'pointer',
              '&:hover': { bgcolor: '#f8fafc', borderColor: '#94a3b8' },
              '&:disabled': { background: '#f1f5f9', color: '#94a3b8', border: '1px solid #e2e8f0' }
            }}>
            Upload Incentive Excel
            <input type="file" accept=".xls,.xlsx" hidden onChange={async (e) => {
              const file = e.target.files[0];
              if (file) {
                setUploadedExcelName(file.name);
                const ab = await file.arrayBuffer();
                const wb = XLSX.read(ab);
                const sheetName = wb.SheetNames.find(name => name.toUpperCase().includes('INCENTIVE')) || wb.SheetNames[0];
                const ws = wb.Sheets[sheetName];
                const parsedRows = parseWorksheetToAOA(ws);
                if (!parsedRows || parsedRows.length === 0) {
                  alert("The uploaded Excel sheet is empty or invalid.");
                  return;
                }
                const hasTrucks = parsedRows.some(row => row.some(cell => extractTruckNo(cell)));
                if (!hasTrucks) {
                  alert("Warning: No valid vehicle/truck numbers were detected in this Excel sheet. Please verify you uploaded the correct file.");
                }
                setUploadedExcelData(parsedRows);
                const mapped = mapExcelToActuals(parsedRows, data);
                setActuals(prev => ({ ...prev, ...mapped }));
                setHasNewUpload(true);
                setComparisonModalOpen(true);
              }
            }} />
          </Button>

          <Button
            size="small" variant="contained" startIcon={<SaveIcon />}
            onClick={handleSaveActuals}
            disabled={!isDirty || savingActuals}
            sx={{
              fontWeight: 700, borderRadius: 2, px: 2, fontSize: '11px',
              background: isDirty ? '#10b981' : '#f1f5f9',
              color: isDirty ? '#fff' : '#94a3b8',
              boxShadow: isDirty ? '0 2px 4px rgba(16, 185, 129, 0.2)' : 'none',
              '&:hover': { background: isDirty ? '#059669' : '#f1f5f9' },
              '&:disabled': { background: '#f1f5f9', color: '#94a3b8', border: '1px solid #e2e8f0' }
            }}>
            {savingActuals ? 'Saving…' : 'Save Changes'}
          </Button>

          <Button
            size="small" variant="contained" color="error" startIcon={deletingState ? <CircularProgress size={14} color="inherit" /> : <DeleteIcon />}
            onClick={() => setConfirmDelete(true)}
            disabled={!hasIncentiveData || deletingState}
            sx={{
              fontWeight: 700, borderRadius: 2, px: 2, fontSize: '11px',
              boxShadow: '0 2px 4px rgba(239, 68, 68, 0.2)',
              '&:disabled': { background: '#f1f5f9', color: '#94a3b8', border: '1px solid #e2e8f0' }
            }}>
            Delete Data
          </Button>

          <Divider orientation="vertical" flexItem sx={{ my: 0.5, borderColor: '#e2e8f0' }} />

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
      <Box sx={{ flex: 1, overflow: 'auto', p: 2, position: 'relative' }}>
        {(loadingState || fetchingRows) && (
          <Box sx={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            bgcolor: 'rgba(255,255,255,0.7)', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', zIndex: 10, gap: 2
          }}>
            <CircularProgress sx={{ color: '#7c3aed' }} />
            <Typography variant="body2" fontWeight={700} color="text.secondary">
              {fetchingRows ? 'Loading Cement Register Data…' : 'Loading Incentive State…'}
            </Typography>
          </Box>
        )}

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
                          {row.map((cell, cIdx) => {
                            const isDediCol = cIdx === dediSmtDiffColIdx;
                            const bg = isDediCol ? '#e0f2fe' : (rIdx === 0 ? '#f1f5f9' : '#fff');
                            return (
                              <td key={cIdx} style={{ border: '1px solid #cbd5e1', padding: '4px 8px', whiteSpace: 'nowrap', background: bg, fontWeight: (rIdx === 0 || isDediCol) ? 700 : 400 }}>
                                {cell !== undefined && cell !== null ? String(cell) : ''}
                              </td>
                            );
                          })}
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
          Incentive Comparison View — {monthLabel}
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
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              {/* ── Summary Dashboard Bar ── */}
              <Box sx={{
                display: 'flex', gap: 2, p: 2, bgcolor: '#fff', borderBottom: '1px solid #e2e8f0',
                flexWrap: 'wrap', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', flexShrink: 0
              }}>
                {[
                  { label: 'System Trucks', val: comparisonViewDef?.stats.systemCount, bg: '#eff6ff', color: '#1e40af' },
                  { label: 'Excel Trucks Found', val: comparisonViewDef?.stats.excelTrucksCount, bg: '#f5f3ff', color: '#5b21b6' },
                  { label: 'Perfect Matches', val: (comparisonViewDef?.stats.matchedCount || 0) - (comparisonViewDef?.stats.mismatchedCount || 0), bg: '#f0fdf4', color: '#166534' },
                  { label: 'Mismatched Values', val: comparisonViewDef?.stats.mismatchedCount, bg: '#fff7ed', color: '#c2410c' },
                  { label: 'Missing in Excel', val: comparisonViewDef?.stats.missingInExcelCount, bg: '#fef2f2', color: '#991b1b' },
                  { label: 'Missing in System', val: comparisonViewDef?.stats.missingInSystemCount, bg: '#fdf2f8', color: '#9d174d' },
                ].map((stat, idx) => (
                  <Box key={idx} sx={{
                    flex: '1 1 150px', p: 1.5, borderRadius: 2, bgcolor: stat.bg,
                    border: '1px solid rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', alignItems: 'center'
                  }}>
                    <Typography variant="caption" fontWeight={700} sx={{ color: '#64748b', textTransform: 'uppercase', fontSize: 10 }}>
                      {stat.label}
                    </Typography>
                    <Typography variant="h6" fontWeight={800} sx={{ color: stat.color, mt: 0.5 }}>
                      {stat.val || 0}
                    </Typography>
                  </Box>
                ))}
              </Box>

              {/* ── Stacked Tables Scroll Container ── */}
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, p: 2, overflow: 'hidden' }}>
                
                {/* 1. Top Section - System Generated Data */}
                <Box sx={{ flex: '1 1 48%', display: 'flex', flexDirection: 'column', bgcolor: '#fff', borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                  <Box sx={{ p: 1.5, bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                    <Typography variant="subtitle2" fontWeight={800} sx={{ color: '#0f172a', display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ width: 4, height: 16, bgcolor: '#3b82f6', borderRadius: 1 }} />
                      1. System Generated Data (Calculated from Cement Register)
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                      Rows are auto-compared with matching entries in the Excel file
                    </Typography>
                  </Box>
                  <Box sx={{ flex: 1, overflow: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#f1f5f9' }}>
                          <th style={{ ...thBase, minWidth: 60 }}>TYPE</th>
                          <th style={{ ...thBase, minWidth: 150 }}>Owner Name</th>
                          <th style={{ ...thBase, minWidth: 100 }}>Truck No</th>
                          <th style={{ ...thBase }}>Wheel</th>
                          <th style={{ ...thBase }}>Trips</th>
                          <th style={{ ...thBase }}>NVL Qty</th>
                          <th style={{ ...thBase }}>NVL Amt</th>
                          <th style={{ ...thBase }}>NVCL Qty</th>
                          <th style={{ ...thBase }}>NVCL Amt</th>
                          <th style={{ ...thBase }}>10W Extra</th>
                          <th style={{ ...thBase, background: '#fef9c3' }}>Total (Projected)</th>
                          <th style={{ ...thBase, minWidth: 150 }}>Comparison Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparisonViewDef?.systemTrucksDetail.map((detail, idx) => {
                          const t = detail.truck;
                          const ev = detail.excelValues;
                          
                          // Row background color based on status
                          let rowBg = '#fff';
                          if (detail.status === 'MISSING_IN_EXCEL') rowBg = '#fef2f2'; // light red for missing
                          else if (detail.status === 'NOT_IN_SYSTEM') rowBg = '#fdf2f8'; // light pink for not in system
                          else if (detail.hasDiscrepancy) rowBg = '#fffbeb'; // light yellow for discrepancy
                          else rowBg = '#f0fdf4'; // light green for exact match

                          return (
                            <tr key={t.truckNo} style={{ background: rowBg, borderBottom: '1px solid #e2e8f0' }}>
                              <td style={{ ...tdBase, textAlign: 'center', fontWeight: 700, color: t.type === 'ATOA' || t.type === 'ATO' ? '#1e40af' : '#166534' }}>
                                {t.type}
                              </td>
                              <td style={{ ...tdBase, textAlign: 'left', fontWeight: 600 }}>{t.ownerName}</td>
                              <td style={{ ...tdBase, textAlign: 'center', fontFamily: 'monospace', fontWeight: 700 }}>{t.truckNo}</td>
                              <td style={{ ...tdBase, textAlign: 'center' }}>{t.wheel}</td>
                              
                              {/* Trips */}
                              <td style={tdBase}>
                                {renderComparedCell(t.tripsCount, ev.trips, false, detail.mismatches.includes('trips'))}
                              </td>
                              {/* NVL Qty */}
                              <td style={tdBase}>
                                {renderComparedCell(t.nvl.invQty, ev.nvlQty, false, detail.mismatches.includes('nvlQty'))}
                              </td>
                              {/* NVL Amt */}
                              <td style={tdBase}>
                                {renderComparedCell(t.nvl.amt, ev.nvlAmt, true, detail.mismatches.includes('nvlAmt'))}
                              </td>
                              {/* NVCL Qty */}
                              <td style={tdBase}>
                                {renderComparedCell(t.nvcl.invQty, ev.nvclQty, false, detail.mismatches.includes('nvclQty'))}
                              </td>
                              {/* NVCL Amt */}
                              <td style={tdBase}>
                                {renderComparedCell(t.nvcl.amt, ev.nvclAmt, true, detail.mismatches.includes('nvclAmt'))}
                              </td>
                              {/* 10W Extra */}
                              <td style={tdBase}>
                                {renderComparedCell(t.extra10W + t.extra6W, ev.extra10w, true, detail.mismatches.includes('extra10w'))}
                              </td>
                              {/* Total Projected */}
                              <td style={{ ...tdBase, fontWeight: 800, background: 'rgba(254,249,195,0.3)' }}>
                                {renderComparedCell(t.totalFinal, ev.grandTotal, true, detail.mismatches.includes('grandTotal'))}
                              </td>
                              
                              {/* Status badge */}
                              <td style={{ ...tdBase, textAlign: 'center' }}>
                                {detail.status === 'MISSING_IN_EXCEL' && (
                                  <Box sx={{ display: 'inline-block', px: 1, py: 0.2, borderRadius: 1, bgcolor: '#ef4444', color: '#fff', fontSize: '9px', fontWeight: 800 }}>
                                    MISSING IN EXCEL
                                  </Box>
                                )}
                                {detail.status === 'NOT_IN_SYSTEM' && (
                                  <Box sx={{ display: 'inline-block', px: 1, py: 0.2, borderRadius: 1, bgcolor: '#be185d', color: '#fff', fontSize: '9px', fontWeight: 800 }}>
                                    NOT IN SYSTEM
                                  </Box>
                                )}
                                {detail.status === 'MISMATCH' && (
                                  <Box sx={{ display: 'inline-block', px: 1, py: 0.2, borderRadius: 1, bgcolor: '#f97316', color: '#fff', fontSize: '9px', fontWeight: 800 }}>
                                    MISMATCH VALUE
                                  </Box>
                                )}
                                {detail.status === 'PERFECT_MATCH' && (
                                  <Box sx={{ display: 'inline-block', px: 1, py: 0.2, borderRadius: 1, bgcolor: '#22c55e', color: '#fff', fontSize: '9px', fontWeight: 800 }}>
                                    PERFECT MATCH
                                  </Box>
                                )}
                              </td>
                            </tr>
                          );
                        })}

                        {/* Footer Totals */}
                        {compTotals && (
                          <tr style={{ background: '#e2e8f0', borderTop: '2px solid #475569', fontWeight: 900 }}>
                            <td colSpan={4} style={{ ...tdBase, textAlign: 'center', fontWeight: 900, color: '#0f172a', background: '#e2e8f0' }}>TOTALS</td>
                            {/* Trips */}
                            <td style={{ ...tdBase, fontWeight: 900 }}>
                              {renderComparedCell(compTotals.sysTrips, compTotals.excelTrips, false, compTotals.sysTrips !== compTotals.excelTrips)}
                            </td>
                            {/* NVL Qty */}
                            <td style={{ ...tdBase, fontWeight: 900 }}>
                              {renderComparedCell(compTotals.sysNvlQty, compTotals.excelNvlQty, false, compTotals.sysNvlQty !== compTotals.excelNvlQty)}
                            </td>
                            {/* NVL Amt */}
                            <td style={{ ...tdBase, fontWeight: 900 }}>
                              {renderComparedCell(compTotals.sysNvlAmt, compTotals.excelNvlAmt, true, compTotals.sysNvlAmt !== compTotals.excelNvlAmt)}
                            </td>
                            {/* NVCL Qty */}
                            <td style={{ ...tdBase, fontWeight: 900 }}>
                              {renderComparedCell(compTotals.sysNvclQty, compTotals.excelNvclQty, false, compTotals.sysNvclQty !== compTotals.excelNvclQty)}
                            </td>
                            {/* NVCL Amt */}
                            <td style={{ ...tdBase, fontWeight: 900 }}>
                              {renderComparedCell(compTotals.sysNvclAmt, compTotals.excelNvclAmt, true, compTotals.sysNvclAmt !== compTotals.excelNvclAmt)}
                            </td>
                            {/* 10W Extra */}
                            <td style={{ ...tdBase, fontWeight: 900 }}>
                              {renderComparedCell(compTotals.sysExtra10W, compTotals.excelExtra10W, true, compTotals.sysExtra10W !== compTotals.excelExtra10W)}
                            </td>
                            {/* Total Projected */}
                            <td style={{ ...tdBase, fontWeight: 900, background: 'rgba(254,249,195,0.8)' }}>
                              {renderComparedCell(compTotals.sysGrand, compTotals.excelGrand, true, compTotals.sysGrand !== compTotals.excelGrand)}
                            </td>
                            <td style={{ ...tdBase, background: '#e2e8f0' }}></td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </Box>
                </Box>

                {/* 2. Bottom Section - Uploaded Excel Data */}
                <Box sx={{ flex: '1 1 48%', display: 'flex', flexDirection: 'column', bgcolor: '#fff', borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                  <Box sx={{ p: 1.5, bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                    <Typography variant="subtitle2" fontWeight={800} sx={{ color: '#0f172a', display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ width: 4, height: 16, bgcolor: '#10b981', borderRadius: 1 }} />
                      2. Uploaded Incentive (Plant) Excel Data
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                      Rendered exactly as uploaded. Highlighted based on matching status.
                    </Typography>
                  </Box>
                  <Box sx={{ flex: 1, overflow: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '11px', fontFamily: 'monospace' }}>
                      <tbody>
                        {comparisonViewDef?.excelRowsDetail.map((detail, rIdx) => {
                          const isHeader = rIdx <= comparisonViewDef.headerRowIdx;
                          const normalize = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                          const matchingDetail = detail.matchedTruck
                            ? comparisonViewDef.systemTrucksDetail.find(std => normalize(std.truck.truckNo) === detail.matchedTruck)
                            : null;
                          return (
                            <tr key={rIdx} style={{
                              background: isHeader ? '#f1f5f9' : (
                                matchingDetail ? (
                                  matchingDetail.status === 'MISMATCH' ? '#fffbeb' : '#f0fdf4'
                                ) : (
                                  detail.isSystemMissing ? '#fef2f2' : '#fff'
                                )
                              ),
                              borderBottom: '1px solid #cbd5e1'
                            }}>
                              {/* Indicator column */}
                              <td style={{
                                padding: '4px 8px', borderRight: '1px solid #cbd5e1', textAlign: 'center',
                                fontWeight: 800, fontSize: '9px', width: '120px', whiteSpace: 'nowrap'
                              }}>
                                {isHeader ? 'HEADER' : (
                                  matchingDetail ? (
                                    matchingDetail.status === 'MISMATCH' ? (
                                      <span style={{ color: '#d97706' }}>⚠️ MISMATCH</span>
                                    ) : (
                                      <span style={{ color: '#16a34a' }}>✅ MATCHED</span>
                                    )
                                  ) : detail.isSystemMissing ? (
                                    <span style={{ color: '#dc2626' }}>❌ NOT IN SYSTEM</span>
                                  ) : ''
                                )}
                              </td>
                              {detail.rowData.map((cell, cIdx) => {
                                const isDediCol = cIdx === dediSmtDiffColIdx;
                                const bg = isDediCol ? '#e0f2fe' : (
                                  isHeader ? '#f1f5f9' : (
                                    matchingDetail ? (
                                      matchingDetail.status === 'MISMATCH' ? '#fffbeb' : '#f0fdf4'
                                    ) : (
                                      detail.isSystemMissing ? '#fef2f2' : '#fff'
                                    )
                                  )
                                );
                                return (
                                  <td key={cIdx} style={{
                                    borderRight: '1px solid #cbd5e1', padding: '4px 8px', whiteSpace: 'nowrap',
                                    background: bg,
                                    fontWeight: (isHeader || isDediCol) ? 700 : 400
                                  }}>
                                    {cell !== undefined && cell !== null ? String(cell) : ''}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </Box>
                </Box>

              </Box>
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

      {/* ── Confirm delete state dialog ──────────────────────────────────────────── */}
      {confirmDelete && (
        <Box sx={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setConfirmDelete(false)}>
          <Box sx={{
            bgcolor: '#fff', borderRadius: 3, p: 4, maxWidth: 420, width: '90%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }} onClick={e => e.stopPropagation()}>
            <Typography variant="h6" fontWeight={800} color="error.main" mb={1}>
              🗑️ Delete Incentive Data?
            </Typography>
            <Typography color="text.secondary" fontSize="13px" mb={3}>
              This will permanently delete the saved Excel preview, PDF URL, and manual actuals for{' '}
              <strong>
                {MONTH_NAMES[month]} {year}
              </strong>{' '}
              from the database. This action <strong>cannot be undone</strong>.
            </Typography>
            <Box display="flex" gap={1.5} justifyContent="flex-end">
              <Button variant="outlined" size="small" onClick={() => setConfirmDelete(false)}
                sx={{ fontWeight: 700 }}>Cancel</Button>
              <Button variant="contained" size="small" color="error"
                startIcon={deletingState ? <CircularProgress size={13} color="inherit" /> : <DeleteIcon />}
                onClick={handleDeleteState} disabled={deletingState}
                sx={{ fontWeight: 800 }}>
                {deletingState ? 'Deleting…' : 'Yes, Delete'}
              </Button>
            </Box>
          </Box>
        </Box>
      )}
      <Snackbar open={!!snack} autoHideDuration={4500} onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {snack && (
          <Alert severity={snack.severity} onClose={() => setSnack(null)} variant="filled" sx={{ fontWeight: 600 }}>
            {snack.msg}
          </Alert>
        )}
      </Snackbar>
    </Box>
  );
}
