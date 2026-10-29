import React, { useMemo, useState, useEffect } from 'react';
import SearchableSelect from './SearchableSelect';
import axios from 'axios';
import {
  Box, Button, Typography, IconButton, Select, MenuItem,
  Tooltip, Divider, Dialog, DialogTitle, DialogContent, DialogActions,
  CircularProgress, Snackbar, Alert, Chip, Popover
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import * as XLSX from 'xlsx';
import UploadIncentiveExcelDialog from './UploadIncentiveExcelDialog';

// ─── helpers ──────────────────────────────────────────────────────────────────
function num(val, fb = 0) {
  if (val === undefined || val === null || val === '') return fb;
  const cleaned = String(val).replace(/,/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? fb : n;
}

/**
 * ACTUAL / DEDICATED -> ACTUAL PAYOUT:
 * ACTUAL PAYOUT = Normal Actual Payout + 10 WH Extra Payout + 6 WH Extra Payout
 *
 * Component A: Normal Actual Payout
 * Calculated from SUM OF AC NVL & NVCL (sumAc) based on Vehicle Type and Wheel:
 * 1. ATOA (Any wheel) -> 0% commission deducted: sumAc
 * 2. MKT (12 WH & 14 WH) -> 5% commission deducted: sumAc * 0.95
 * 3. MKT (10 WH) -> ((sumAc / 9.5%) * (100% - 5%)) * 8.5%
 * 4. MKT (6 WH)  -> ((sumAc / 9.5%) * (100% - 7%)) * 8.5%
 */
export function calculateNormalActualPayout(sumAc, type, wheel) {
  const numSum = num(sumAc);
  if (!numSum) return 0;

  const upperType = String(type || '').toUpperCase().trim();
  const upperWheel = String(wheel || '').toUpperCase().trim();

  // 1. ATOA — All Wheel Types (0% commission)
  if (upperType === 'ATOA' || upperType === 'ATO' || upperType.startsWith('ATO')) {
    return numSum;
  }

  // 2, 3, 4. MKT Rules
  if (upperType === 'MKT' || upperType === 'MKTA' || upperType.startsWith('MKT')) {
    // 2. MKT — 12 WH and 14 WH (5% commission)
    if (upperWheel.includes('12') || upperWheel.includes('14')) {
      return numSum * 0.95;
    }

    // 3. MKT — 10 WH (((sumAc / 9.5%) * (100% - 5%)) * 8.5%)
    if (upperWheel.includes('10')) {
      return (numSum / 0.095) * 0.95 * 0.085;
    }

    // 4. MKT — 6 WH (((sumAc / 9.5%) * (100% - 7%)) * 8.5%)
    if (upperWheel.includes('6')) {
      return (numSum / 0.095) * 0.93 * 0.085;
    }

    // Default MKT fallback
    return numSum * 0.95;
  }

  // Default fallback if type is neither ATOA nor MKT
  return numSum;
}

/**
 * Component B: 10 WH Extra Payout
 * Calculated strictly from SUM OF 10WH EXT (sum10W):
 * - ATOA: 0% commission -> sum10W
 * - MKTA / MKT: 5% commission -> sum10W * 0.95
 */
export function calculate10WHExtraPayout(sum10W, type) {
  const num10W = num(sum10W);
  if (!num10W) return 0;

  const upperType = String(type || '').toUpperCase().trim();

  // ATOA: 0% commission
  if (upperType === 'ATOA' || upperType === 'ATO' || upperType.startsWith('ATO')) {
    return num10W;
  }

  // MKTA / MKT: 5% commission
  if (upperType === 'MKTA' || upperType === 'MKT' || upperType.startsWith('MKT')) {
    return num10W * 0.95;
  }

  return num10W;
}

/**
 * Component C: 6 WH Extra Payout
 * Calculated strictly from SUM OF 6WH EXT (sum6W):
 * - ATOA: 0% commission -> sum6W
 * - MKTA / MKT: 7% commission -> sum6W * 0.93
 */
export function calculate6WHExtraPayout(sum6W, type) {
  const num6W = num(sum6W);
  if (!num6W) return 0;

  const upperType = String(type || '').toUpperCase().trim();

  // ATOA: 0% commission
  if (upperType === 'ATOA' || upperType === 'ATO' || upperType.startsWith('ATO')) {
    return num6W;
  }

  // MKTA / MKT: 7% commission
  if (upperType === 'MKTA' || upperType === 'MKT' || upperType.startsWith('MKT')) {
    return num6W * 0.93;
  }

  return num6W;
}

/**
 * Combined Actual Payout:
 * ACTUAL PAYOUT = Normal Actual Payout + 10 WH Extra Payout + 6 WH Extra Payout
 */
export function calculateCombinedActualPayout(sumAc, sum10W, sum6W, type, wheel) {
  const normalPayout = calculateNormalActualPayout(sumAc, type, wheel);
  const extra10Payout = calculate10WHExtraPayout(sum10W, type);
  const extra6Payout = calculate6WHExtraPayout(sum6W, type);
  return normalPayout + extra10Payout + extra6Payout;
}

/**
 * Polymorphic calculateActualPayout:
 * If sum10W & sum6W are passed, calculates combined payout.
 * If only 3 args are passed, acts as combined calculation where 10W & 6W default to 0.
 */
export function calculateActualPayout(sumAc, type, wheel, sum10W = 0, sum6W = 0) {
  return calculateCombinedActualPayout(sumAc, sum10W, sum6W, type, wheel);
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

// Canonical 4-digit truck number extractor - standardizes full registrations and short numbers
export function getCanonicalTruckNo(val) {
  if (val === undefined || val === null) return '';
  const rawStr = String(val).trim();
  const str = rawStr.toUpperCase();
  const clean = str.replace(/[^A-Z0-9]/g, '');
  if (!clean) return rawStr;

  // 1. Pure 3 or 4 digit truck number (e.g. "6016", "0800", "0034", "9375")
  if (/^\d{3,4}$/.test(clean)) {
    return clean;
  }

  // 2. Standard Indian vehicle registration (e.g. "WB33C6016", "WB-39-B-8879", "NL01K2373", "KA32D2548", "JH10BY9023")
  const regMatch = clean.match(/^[A-Z]{2}\d{1,2}[A-Z]{0,3}(\d{1,4})$/);
  if (regMatch) {
    const digits = regMatch[1];
    return digits.length < 4 ? digits.padStart(4, '0') : digits;
  }

  // 3. Fallback: if string ends with 4 digits and has leading alphanumeric plate pattern
  const end4Match = clean.match(/^[A-Z0-9]+?(\d{4})$/);
  if (end4Match && clean.length <= 12) {
    return end4Match[1];
  }

  return rawStr;
}

// Resolves actuals entry for a truck, supporting exact 4-digit key or full registration key
export function resolveActualEntry(actuals, truckNo) {
  if (!actuals || !truckNo) return null;
  if (actuals[truckNo] !== undefined) return actuals[truckNo];
  const cleanT = String(truckNo).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const canonT = getCanonicalTruckNo(truckNo);
  for (const key of Object.keys(actuals)) {
    if (key === canonT) return actuals[key];
    const cleanK = String(key).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const canonK = getCanonicalTruckNo(key);
    if (canonK === canonT || matchVehicleRegistration(cleanK, cleanT)) {
      return actuals[key];
    }
  }
  return null;
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

// Universal vehicle number matcher (handles full registration e.g. WB39B8879 and short suffix 8879)
export function matchVehicleRegistration(v1, v2) {
  if (!v1 || !v2) return false;
  const c1 = String(v1).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const c2 = String(v2).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (!c1 || !c2) return false;
  if (c1 === c2) return true;
  if (c1.length >= 4 && c2.length >= 4) {
    return c1.endsWith(c2) || c2.endsWith(c1);
  }
  return false;
}

// Find contact info from Party Master contacts list, matching exact or 4-digit suffix
export function findMatchingContact(truck, rowOwner, truckContacts = []) {
  if (!truck || !truckContacts || truckContacts.length === 0) return null;
  const normT = String(truck).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (!normT) return null;

  const cleanRowOwner = String(rowOwner || '').trim().toLowerCase();

  // 1. Exact registration match
  const exact = truckContacts.find(c => {
    const rawNo = c['Truck No '] || c['Truck No'] || c.truck_no || c.vehicleNo || c['Vehicle No'] || '';
    const dbNo = String(rawNo).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    return dbNo === normT;
  });
  if (exact) return exact;

  // 2. Suffix / 4-digit match
  const matches = truckContacts.filter(c => {
    const rawNo = c['Truck No '] || c['Truck No'] || c.truck_no || c.vehicleNo || c['Vehicle No'] || '';
    const dbNo = String(rawNo).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (!dbNo || !normT) return false;
    if (dbNo.length >= 4 && normT.length >= 4) {
      return dbNo.endsWith(normT) || normT.endsWith(dbNo);
    }
    return false;
  });

  if (matches.length === 1) return matches[0];
  if (matches.length > 1 && cleanRowOwner) {
    const ownerMatch = matches.find(c => {
      const cOwner = String(c['Owner Name '] || c['Owner Name'] || c.owner_name || '').trim().toLowerCase();
      return cOwner === cleanRowOwner || cOwner.includes(cleanRowOwner) || cleanRowOwner.includes(cOwner);
    });
    if (ownerMatch) return ownerMatch;
  }
  return matches[0] || null;
}

// ─── Core aggregation ─────────────────────────────────────────────────────────
// Logic per user spec:
//   Sum of Inv Qty  = Σ MT  (all monthly trips for this truck, per NVL/NVCL)
//   Sum of ORG FREIGHT = Σ (MT × BILLING)   → the raw freight value
//   Sum of Amt      = 9.5% of Sum of ORG FREIGHT  → the incentive figure
//   Total           = NVL Sum of Amt + NVCL Sum of Amt
//   Final TOTAL     = Total + 10W Extra 8.5%
export function buildIncentiveData(rows, year, month, truckContacts = []) {
  // 1. Filter to selected month (by LOADING DT / LOADING DATE / BILL DATE / RECEIVING DATE / INVOICE DATE)
  const filtered = rows.filter(row => {
    const ld = row['LOADING DT'] || row['LOADING DATE'] || row['BILL DATE'] || row['RECEIVING DATE'] || row['INVOICE DATE'] || row.date || row.Date;
    const d = parseLoadingDate(ld);
    if (!d) {
      if (row.month !== undefined && row.year !== undefined) {
        const rM = parseInt(row.month, 10);
        const rY = parseInt(row.year, 10);
        return rM === (month + 1) && (rY === year || rY === (year % 100));
      }
      return false;
    }
    const now = new Date();
    const isOngoing = (year === now.getFullYear() && month === now.getMonth());
    if (isOngoing && d.getDate() > now.getDate()) {
      return false;
    }
    return d.getFullYear() === year && d.getMonth() === month;
  });

  // 2. Group by canonical VEHICLE NUMBER (truck)
  const byTruck = {};
  for (const row of filtered) {
    const rawTruck = (row['VEHICLE NUMBER'] || row['VEHICLE NO'] || row['VEHICLE NO.'] || row.vehicleNumber || row['Truck No'] || '').trim().toUpperCase();
    if (!rawTruck) continue;
    const truck = getCanonicalTruckNo(rawTruck);
    if (!truck) continue;

    if (!byTruck[truck]) {
      // Find contact info from MongoDB using normalized vehicle registration (exact or 4-digit suffix)
      const contact = findMatchingContact(rawTruck, row['OWNER NAME'] || row['PARTY NAME'], truckContacts) ||
                      findMatchingContact(truck, row['OWNER NAME'] || row['PARTY NAME'], truckContacts);

      // 1. WHEEL must come from Party Master (do NOT manually calculate or infer)
      const dbWheel = contact ? (
        contact['Wheel Type '] ||
        contact['Wheel Type'] ||
        contact.wheelType ||
        contact.wheel_type ||
        contact['Type of vehicle '] ||
        contact['Type of vehicle'] ||
        contact['type_of_vehicle'] ||
        contact.veh_type ||
        ''
      ) : '';
      let displayWheel = dbWheel || row['WHEEL'] || '';
      if (displayWheel) {
        const upW = String(displayWheel).toUpperCase();
        if (upW.includes('14')) displayWheel = '14W';
        else if (upW.includes('12')) displayWheel = '12W';
        else if (upW.includes('10')) displayWheel = '10W';
        else if (upW.includes('6')) displayWheel = '6W';
      }

      // 2. OWNER NAME from Party Master / Owner Details primary, fallback to row
      const dbOwner = contact ? (
        contact['Owner Name '] ||
        contact['Owner Name'] ||
        contact.owner_name ||
        contact.owner ||
        ''
      ) : '';
      const displayOwner = (dbOwner || row['OWNER NAME'] || row['PARTY NAME'] || '').trim();

      // 3. TYPE: Read existing Relationship Type from Party Master / Party Payment, preserve exact value
      const dbRelationshipType = contact ? (
        contact['Relationship Type '] ||
        contact['Relationship Type'] ||
        contact.relationshipType ||
        contact.RelationshipType ||
        contact['TYPE OF CUSTOMER '] ||
        contact['TYPE OF CUSTOMER'] ||
        contact['type_of_customer'] ||
        contact['type_of_customers'] ||
        contact.cust_type ||
        contact.custType ||
        contact.type ||
        ''
      ) : '';
      let displayType = '';
      if (dbRelationshipType) {
        displayType = String(dbRelationshipType).trim();
      } else if (row['TYPE']) {
        displayType = String(row['TYPE']).trim();
      } else {
        displayType = truckDisplayType(row);
      }

      const upperType = displayType.toUpperCase();
      const isAtoa = upperType === 'ATOA' || upperType === 'ATO' || upperType.startsWith('ATO');
      const isMktOrOwn = upperType === 'MKT' || upperType === 'MKTA' || upperType.startsWith('MKT') || upperType === 'OWN' || upperType.startsWith('OWN');
      const isAtoaOrMktRel = isAtoa || isMktOrOwn;

      const commApp = contact ? (contact['Incentive Comission Appliciability '] || contact.incentive_commission_applicability || '') : '';
      let rawComm = contact ? (contact.incentive_commission || contact['incentive_commission ']) : undefined;
      let commValue = (rawComm !== null && rawComm !== undefined && rawComm !== '') ? num(rawComm) : 5;
      if (commValue > 0 && commValue < 1) {
        commValue = commValue * 100;
      }
      commValue = commValue / 100;

      // 4. DEDICATED TYPE: Party Master MUST be DEDICATED
      const rawDedicated = contact ? (
        contact.dedicated_type ||
        contact.dedicatedType ||
        contact['Dedicated Type'] ||
        contact['Dedicated Type '] ||
        contact.dedicated ||
        contact.TYPE ||
        ''
      ) : '';
      const isDedicated = String(rawDedicated).trim().toLowerCase() === 'dedicated';

      let normWheel = 'OTHER';
      const wheelRaw = String(displayWheel).toUpperCase();
      if (wheelRaw.includes('14')) normWheel = '14WH';
      else if (wheelRaw.includes('12')) normWheel = '12WH';
      else if (wheelRaw.includes('10')) normWheel = '10WH';
      else if (wheelRaw.includes('6')) normWheel = '6WH';

      // Capacity according to vehicle-wise trip summary: 14W -> 30 MT, 12W -> 25 MT, 10W -> 19 MT, 6W -> 13 MT
      let standardCap = 0;
      if (normWheel === '14WH') standardCap = 30;
      else if (normWheel === '12WH') standardCap = 25;
      else if (normWheel === '10WH') standardCap = 19;
      else if (normWheel === '6WH') standardCap = 13;

      byTruck[truck] = {
        type: displayType,
        ownerName: displayOwner,
        truckNo: truck,
        wheel: displayWheel,
        normWheel,
        standardCap,
        isDedicated,
        isAtoa,
        isMktOrOwn,
        isAtoaOrMkt: isAtoaOrMktRel,
        contact,
        tripsCount: 0,
        dailyMT: {},
        totalMT: 0,
        seenInvoices: new Set(),
        nvl: { invQty: 0, orgBillingAmt: 0, orgFreight: 0, amt: 0, sourceAmt: 0, extra10W: 0, extra10WBase: 0, extra6WPotential: 0, extra6W: 0, extra6WBase: 0 },
        nvcl: { invQty: 0, orgBillingAmt: 0, orgFreight: 0, amt: 0, sourceAmt: 0, extra10W: 0, extra10WBase: 0, extra6WPotential: 0, extra6W: 0, extra6WBase: 0 },
        extra10W: 0,
        extra10WBase: 0,
        qualifying10WTripCount: 0,
        extra6WPotential: 0,
        extra6W: 0,
        extra6WBase: 0,
        commission: 0,
        hasComm: String(commApp).toUpperCase().includes('YES'),
        commRate: num(commValue, 0.05)
      };
    } else {
      const entry = byTruck[truck];
      if (!entry.contact) {
        const contact = findMatchingContact(rawTruck, row['OWNER NAME'] || row['PARTY NAME'], truckContacts) ||
                        findMatchingContact(truck, row['OWNER NAME'] || row['PARTY NAME'], truckContacts);
        if (contact) {
          entry.contact = contact;
          const dbOwner = contact['Owner Name '] || contact['Owner Name'] || contact.owner_name || contact.owner || '';
          if (dbOwner) entry.ownerName = dbOwner.trim();
          const dbWheel = contact['Wheel Type '] || contact['Wheel Type'] || contact.wheelType || contact.wheel_type || contact['Type of vehicle '] || contact['Type of vehicle'] || '';
          if (dbWheel) {
            let dw = dbWheel;
            const upW = String(dw).toUpperCase();
            if (upW.includes('14')) dw = '14W';
            else if (upW.includes('12')) dw = '12W';
            else if (upW.includes('10')) dw = '10W';
            else if (upW.includes('6')) dw = '6W';
            entry.wheel = dw;
            if (upW.includes('14')) { entry.normWheel = '14WH'; entry.standardCap = 30; }
            else if (upW.includes('12')) { entry.normWheel = '12WH'; entry.standardCap = 25; }
            else if (upW.includes('10')) { entry.normWheel = '10WH'; entry.standardCap = 19; }
            else if (upW.includes('6')) { entry.normWheel = '6WH'; entry.standardCap = 13; }
          }
        }
      }
    }

    const entry = byTruck[truck];

    // Check dummy / incomplete entries
    const isDummy = row.isDummy === true || row._isDummy === true || row._source === 'auto_dummy';
    if (isDummy) continue;

    const invNo = String(row['INVOICE NO'] || row['INVOICE NO.'] || '').trim().toUpperCase().replace(/\s+/g, '');
    const shipmentNo = String(row['SHIPMENT NO'] || row['SHIPMENT NUMBER'] || '').trim();
    const mt = num(row['MT']);
    const billingRate = num(row['BILLING'] || row['BILLING RATE']);
    const bAmt = num(row['Billing Amount'] || row['BILLING AMOUNT']);

    if (mt === 0 && billingRate === 0 && bAmt === 0 && !invNo && !shipmentNo) continue;

    if (
      invNo.includes('DUMMY') ||
      invNo.includes('CASHVOUCHER') ||
      invNo === 'NOSLIP' ||
      invNo === '-' ||
      invNo === '—' ||
      invNo === 'N/A' ||
      invNo === 'NA'
    ) {
      continue;
    }

    // Deduplicate duplicate invoice references so trips and amounts are not double-counted
    if (invNo) {
      if (entry.seenInvoices.has(invNo)) {
        continue;
      }
      entry.seenInvoices.add(invNo);
    }

    // Track daily MT to calculate trip count per vehicle-wise trip summary logic
    const ldRaw = row['LOADING DT'] || row['LOADING DATE'] || row['BILL DATE'] || row.date;
    const ldKey = formatLoadingDate(ldRaw) || 'single_date';
    entry.dailyMT[ldKey] = (entry.dailyMT[ldKey] || 0) + mt;
    entry.totalMT = (entry.totalMT || 0) + mt;

    // Bill Freight / Billing Amount Total from Cement Register
    let billFreight = billingRate > 0 && mt > 0 ? billingRate * mt : bAmt;
    if (billFreight === 0 && billingRate > 0) billFreight = billingRate;
    if (billFreight === 0 && bAmt > 0) billFreight = bAmt;
    const orgBillingAmt = billFreight > 0 ? billFreight : (bAmt > 0 ? bAmt : (billingRate > 0 && mt > 0 ? billingRate * mt : 0));

    // Party Freight from Party Payment / Cement Register (BILLING ER 95% / PARTY PAYABLE)
    let partyFreight = 0;
    const storedPartyFreight = num(row['BILLING ER 95%'] || row['BILLING @ 95% (PARTY PAYABLE)']);
    const storedPartyRateAmt = num(row['PARTY RATE AMOUNT'] || row['PARTY FREIGHT']);
    const storedPartyRate = num(row['PARTY RATE (95-97%)'] || row['PARTY RATE (95%)'] || row['PARTY RATE']);
    const storedAmount = num(row['AMOUNT']);

    if (storedPartyFreight > 0) {
      partyFreight = storedPartyFreight;
    } else if (storedPartyRateAmt > 0) {
      partyFreight = storedPartyRateAmt;
    } else if (storedPartyRate > 0 && mt > 0) {
      partyFreight = storedPartyRate * mt;
    } else if (storedAmount > 0) {
      partyFreight = storedAmount;
    } else if (billFreight > 0) {
      let comm = 0.05;
      if (entry.contact) {
        const rawComm = entry.contact.freight_commission ?? entry.contact._freight_commission ?? entry.contact['Basic Freight Commission'];
        if (rawComm !== undefined && rawComm !== null && rawComm !== '') {
          const cNum = num(rawComm);
          comm = cNum > 1 ? cNum / 100 : cNum;
        }
      }
      partyFreight = billFreight * (1 - comm);
    }

    const cat = classifyRow(row);
    const rawDed = row['DEDICATED'] ?? row['Dedicated'] ?? row['dedicated'] ?? '';
    const dedAmt = parseExcelNum(rawDed);

    if (cat === 'NVL') {
      entry.nvl.invQty = Math.round(entry.nvl.invQty + mt);
      entry.nvl.orgBillingAmt += orgBillingAmt;
      entry.nvl.orgFreight += partyFreight; // Strictly Party Freight / Party Payable
      if (dedAmt > 0) {
        entry.nvl.sourceAmt += dedAmt;
      }
    } else {
      entry.nvcl.invQty = Math.round(entry.nvcl.invQty + mt);
      entry.nvcl.orgBillingAmt += orgBillingAmt;
      entry.nvcl.orgFreight += partyFreight; // Strictly Party Freight / Party Payable
      if (dedAmt > 0) {
        entry.nvcl.sourceAmt += dedAmt;
      }
    }

    // Rule 2: 10-Wheel Extra Incentive from first qualifying trip (Eligible Bill Types: SO and NT only, STO disallowed)
    const bType = String(row['Bill Type'] || row['BILL TYPE'] || row.billType || row.invoice_type || '').trim().toUpperCase();
    const isSto = bType === 'STO' || bType.includes('STOCK');
    const isSo = !isSto && (bType === 'SO' || bType.includes('SALES'));
    const isNtBill = !isSto && (bType === 'NT' || bType.includes('NON-TRADE') || bType.includes('NON TRADE'));
    const isExplicitNonSoNt = bType === 'FREIGHT' || bType === 'TAX INVOICE' || bType === 'TAX';
    const ntWordRegex = /\bNT\b|\bNON[-\s]?TRADE\b/i;
    const hasUnloadingCharges = Boolean(
      (row.nt_details && (row.nt_details.unloading_charges || row.nt_details.unloadingCharges)) ||
      (row['EXTRA UNLOADING'] && parseExcelNum(row['EXTRA UNLOADING']) > 0)
    );
    const isNtSecondary = !isSto && !isExplicitNonSoNt && (
      row._is_nt_invoice === true || row._is_nt_invoice === 'true' ||
      row._source_nt_unloading === true || row._source_nt_unloading === 'true' ||
      hasUnloadingCharges ||
      ntWordRegex.test(String(row.classification || row.category || row.invoice_type_classification || '')) ||
      ntWordRegex.test(String(row['UNLOADING STATUS NOTE'] || row['UNLOADING STATUS'] || row.notes || ''))
    );
    const isQualifying10WTrip = !isSto && (isSo || isNtBill || isNtSecondary);

    if (entry.normWheel === '10WH' && isQualifying10WTrip) {
      const extra10Base = entry.isAtoa ? orgBillingAmt : partyFreight;
      entry.qualifying10WTripCount = (entry.qualifying10WTripCount || 0) + 1;
      if (cat === 'NVL') {
        entry.nvl.extra10WBase = (entry.nvl.extra10WBase || 0) + extra10Base;
      } else {
        entry.nvcl.extra10WBase = (entry.nvcl.extra10WBase || 0) + extra10Base;
      }
    }

    // Rule 3: 6-Wheel Extra Incentive (All qualifying 6WH trips contribute, minimum 6 trips threshold)
    // ATOA: on Sum of Original Billing Amount | MKT: on Sum of Original Freight
    if (entry.normWheel === '6WH') {
      const extra6Base = entry.isAtoa ? orgBillingAmt : partyFreight;
      if (cat === 'NVL') {
        entry.nvl.extra6WBase = (entry.nvl.extra6WBase || 0) + extra6Base;
      } else {
        entry.nvcl.extra6WBase = (entry.nvcl.extra6WBase || 0) + extra6Base;
      }
    }
  }

  // 3. Final Aggregation with Achievement Criteria
  return Object.values(byTruck).map(t => {
    // Calculate Trips using vehicle-wise trip summary logic:
    // Capacity: 14W -> 30 MT, 12W -> 25 MT, 10W -> 19 MT, 6W -> 13 MT
    let tripsCount = 0;
    const dates = Object.keys(t.dailyMT || {});
    if (dates.length > 0) {
      for (const dKey of dates) {
        const dayMT = t.dailyMT[dKey] || 0;
        if (dayMT > 0) {
          const dayTrips = t.standardCap > 0 ? Math.max(1, Math.round(dayMT / t.standardCap)) : 1;
          tripsCount += dayTrips;
        }
      }
    }
    if (tripsCount === 0 && t.totalMT > 0 && t.standardCap > 0) {
      tripsCount = Math.max(1, Math.round(t.totalMT / t.standardCap));
    }
    t.tripsCount = tripsCount;

    // Rule 1: Dedicated Incentive Calculation (PROJECTED / DEDICATED)
    // Dedicated Type in Party Master MUST be DEDICATED (Non-Dedicated vehicles are NOT eligible for Dedicated Incentive)
    // Achievement criteria:
    // - 14W, 12W, 10W: minimum 6 completed trips
    // - 6WH: minimum 10 completed trips
    const reqStandardTrips = (t.normWheel === '6WH') ? 10 : ((t.normWheel === '10WH' || t.normWheel === '12WH' || t.normWheel === '14WH') ? 6 : null);
    const isStandardEligible = Boolean(t.isAtoaOrMkt && t.isDedicated && reqStandardTrips !== null && tripsCount >= reqStandardTrips);
    t.standardEligible = isStandardEligible;
    t.reqTrips = reqStandardTrips || 0;

    let standardRatePercent = 0;
    if (isStandardEligible) {
      if (t.isAtoa) {
        // Section 1: ATOA (14W, 12W, 10W, 6WH):
        // Commission = 0% on SUM OF ORIGINAL BILLING AMOUNT
        // Sum of Amt = SUM OF ORG Billing Amt (0% deduction, 100% retained)
        standardRatePercent = 0;
        t.nvl.amt = t.nvl.orgBillingAmt > 0 ? Math.round(t.nvl.orgBillingAmt * 1.0) : (t.nvl.sourceAmt > 0 ? Math.round(t.nvl.sourceAmt) : 0);
        t.nvcl.amt = t.nvcl.orgBillingAmt > 0 ? Math.round(t.nvcl.orgBillingAmt * 1.0) : (t.nvcl.sourceAmt > 0 ? Math.round(t.nvcl.sourceAmt) : 0);
      } else {
        // MKT / MKTA / OWN:
        // Section 2: 14W and 12W -> Commission = 9.5% on SUM OF ORIGINAL FREIGHT -> Sum of Amt = SUM OF ORG FREIGHT * 9.5 / 100
        // Section 3: 10WH -> Commission = 8.5% on SUM OF ORIGINAL FREIGHT -> Sum of Amt = SUM OF ORG FREIGHT * 8.5 / 100
        // Section 4: 6WH -> Commission = 8.5% on SUM OF ORIGINAL FREIGHT -> Sum of Amt = SUM OF ORG FREIGHT * 8.5 / 100
        let mktRate = 0.095;
        standardRatePercent = 9.5;
        if (t.normWheel === '10WH' || t.normWheel === '6WH') {
          mktRate = 0.085;
          standardRatePercent = 8.5;
        }
        t.nvl.amt = t.nvl.orgFreight > 0 ? Math.round(t.nvl.orgFreight * mktRate) : (t.nvl.sourceAmt > 0 ? Math.round(t.nvl.sourceAmt * mktRate) : 0);
        t.nvcl.amt = t.nvcl.orgFreight > 0 ? Math.round(t.nvcl.orgFreight * mktRate) : (t.nvcl.sourceAmt > 0 ? Math.round(t.nvcl.sourceAmt * mktRate) : 0);
      }
    } else {
      // Ineligible vehicles (non-dedicated or below trip threshold) MUST have incentive amounts = 0!
      t.nvl.amt = 0;
      t.nvcl.amt = 0;
    }
    t.standardRatePercent = standardRatePercent;

    // Total = NVL Sum of Amt + NVCL Sum of Amt
    const nvlNvclTotal = t.nvl.amt + t.nvcl.amt;

    // Rule 2: 10-Wheel Extra Incentive (Achievement Criteria: 10W >= 1 qualifying SO/NT trip)
    // Formula: Combine NVL and NVCL source amounts first, then calculate 8.5%
    const extra10WEligible = Boolean(t.isAtoaOrMkt && t.normWheel === '10WH' && (t.qualifying10WTripCount || 0) >= 1);
    if (extra10WEligible) {
      const nvlBase = t.isAtoa ? (t.nvl.orgBillingAmt || 0) : (t.nvl.orgFreight || 0);
      const nvclBase = t.isAtoa ? (t.nvcl.orgBillingAmt || 0) : (t.nvcl.orgFreight || 0);
      const combined10WBase = nvlBase + nvclBase;
      t.extra10W = Math.round(combined10WBase * 0.085);
      t.nvl.extra10W = Math.round(nvlBase * 0.085);
      t.nvcl.extra10W = t.extra10W - t.nvl.extra10W;
      t.extra10WRatePercent = 8.5;
    } else {
      t.extra10W = 0;
      t.nvl.extra10W = 0;
      t.nvcl.extra10W = 0;
      t.extra10WRatePercent = 0;
    }

    // Rule 3: 6-Wheel Extra Incentive (Achievement Criteria: minimum 6 completed qualifying trips)
    // Formula: Combine NVL and NVCL source amounts first, then calculate 15%
    const extra6WEligible = Boolean(t.isAtoaOrMkt && t.normWheel === '6WH' && t.tripsCount >= 6);
    if (extra6WEligible) {
      const nvlBase = t.isAtoa ? (t.nvl.orgBillingAmt || 0) : (t.nvl.orgFreight || 0);
      const nvclBase = t.isAtoa ? (t.nvcl.orgBillingAmt || 0) : (t.nvcl.orgFreight || 0);
      const combined6WBase = nvlBase + nvclBase;
      t.extra6W = Math.round(combined6WBase * 0.15);
      t.nvl.extra6W = Math.round(nvlBase * 0.15);
      t.nvcl.extra6W = t.extra6W - t.nvl.extra6W;
      t.extra6WRatePercent = 15;
    } else {
      t.extra6W = 0;
      t.nvl.extra6W = 0;
      t.nvcl.extra6W = 0;
      t.extra6WRatePercent = 0;
    }

    // Total (Projected) = standard incentive + 10W extra + 6W extra
    const totalFinal = nvlNvclTotal + t.extra10W + t.extra6W;

    // Incentive Commission Amount = Incentive Amount × (Incentive Commission % ÷ 100)
    if (t.hasComm) {
      t.commission = Math.round(totalFinal * num(t.commRate, 0.05));
    } else {
      t.commission = 0;
    }

    const standardEligible = t.standardEligible;

    return {
      ...t,
      standardEligible,
      extra10WEligible,
      extra6WEligible,
      total: nvlNvclTotal,
      totalFinal
    };
  })
  .filter(t => t.standardEligible || t.extra10WEligible || t.extra6WEligible)
  .sort((a, b) => a.type.localeCompare(b.type) || a.ownerName.localeCompare(b.ownerName));
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

// ─── Headline Categorizer & Month/Year Extractor ──────────────────────────────
export function parseHeadlineInfo(headlineText) {
  if (!headlineText || typeof headlineText !== 'string') return null;
  const raw = String(headlineText).trim();
  const text = raw.toLowerCase().replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');

  // Look for signature keywords in headline
  const isDedicatedKeyword = text.includes('dedicated') || text.includes('dedi') || text.includes('qualified') || text.includes('extra freight');
  const isExtraKeyword = text.includes('extra') || text.includes('8.5%') || text.includes('15%') || text.includes('10wh') || text.includes('10w') || text.includes('6wh') || text.includes('6w');
  const isSiteKeyword = text.includes('nvl') || text.includes('nvcl') || text.includes('dispatch') || text.includes('wb so') || text.includes('so of') || text.includes('plant') || text.includes('9214');

  if (!((isDedicatedKeyword || isExtraKeyword) && isSiteKeyword)) {
    return null;
  }

  // Determine Category & Target Field
  // 1. Check NVCL vs NVL
  const isNVCL = text.includes('nvcl') || text.includes('mkt') || text.includes('market');
  const isNVL = (text.includes('nvl') || text.includes('ato') || text.includes('atoa') || text.includes('plant') || text.includes('9214')) && !isNVCL;

  // 2. Check 10WH vs 6WH vs Normal Dedicated
  const is10W = text.includes('10wh') || text.includes('10w') || text.includes('8.5%') || text.includes('10 wheel') || text.includes('10-wheel');
  const is6W = text.includes('6wh') || text.includes('6w') || text.includes('15%') || text.includes('6 wheel') || text.includes('6-wheel');
  const isDedicatedFreight = isDedicatedKeyword && !is10W && !is6W;

  let category = '';
  let targetField = '';
  let subField = '';

  if (isDedicatedFreight) {
    if (isNVCL) {
      category = 'Dedicated Freight 9.5% of NVCL';
      targetField = 'nvcl';
    } else {
      category = 'Dedicated Freight 9.5% of NVL';
      targetField = 'nvl';
    }
  } else if (is10W) {
    if (isNVCL) {
      category = 'Extra Freight 8.5% 10WH of NVCL';
      targetField = 'w10';
      subField = 'w10_nvcl';
    } else {
      category = 'Extra Freight 8.5% 10WH of NVL';
      targetField = 'w10';
      subField = 'w10_nvl';
    }
  } else if (is6W) {
    if (isNVCL) {
      category = 'Extra Freight 15% 6WH of NVCL';
      targetField = 'w6';
      subField = 'w6_nvcl';
    } else {
      category = 'Extra Freight 15% 6WH of NVL';
      targetField = 'w6';
      subField = 'w6_nvl';
    }
  } else if (isNVCL) {
    category = 'Dedicated Freight 9.5% of NVCL';
    targetField = 'nvcl';
  } else if (isNVL) {
    category = 'Dedicated Freight 9.5% of NVL';
    targetField = 'nvl';
  } else {
    return null;
  }

  // 3. Extract Month & Year from headline
  let detectedMonthIndex = null; // 0 for Jan ... 11 for Dec
  let detectedCalendarYear = null; // e.g. 2026
  let detectedFY = null; // e.g. "FY 2026–27"

  const monthRegex = /(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember))[\s'_/-]*(\d{2,4})/i;
  const match = text.match(monthRegex);
  if (match) {
    const mStr = match[1].toLowerCase().slice(0, 3);
    const mIdxMap = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    };
    if (mIdxMap[mStr] !== undefined) {
      detectedMonthIndex = mIdxMap[mStr];
      let yNum = parseInt(match[2], 10);
      if (yNum < 100) {
        yNum += (yNum >= 70 ? 1900 : 2000);
      }
      detectedCalendarYear = yNum;
      if (detectedMonthIndex >= 3) {
        detectedFY = `FY ${yNum}–${String(yNum + 1).slice(-2)}`;
      } else {
        detectedFY = `FY ${yNum - 1}–${String(yNum).slice(-2)}`;
      }
    }
  }

  return {
    rawHeadline: raw,
    category,
    targetField,
    subField,
    detectedMonthIndex,
    detectedCalendarYear,
    detectedFY
  };
}

// ─── Multi-Table Workbook Parser ──────────────────────────────────────────────
export function parseIncentiveWorkbook(wb, systemTrucks = []) {
  if (!wb || !wb.SheetNames || wb.SheetNames.length === 0) return null;

  const allTables = [];
  const normalizedRecords = [];
  let globalDetectedMonthIndex = null;
  let globalDetectedYear = null;
  let globalDetectedFY = null;

  const monthRegex = /(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember))[\s'_/-]*(\d{2,4})/i;
  const mIdxMap = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  };

  // Inspect sheet names first for period
  for (const s of wb.SheetNames) {
    const m = s.match(monthRegex);
    if (m) {
      globalDetectedMonthIndex = mIdxMap[m[1].toLowerCase().slice(0, 3)];
      let yNum = parseInt(m[2], 10);
      globalDetectedYear = yNum < 100 ? 2000 + yNum : yNum;
      globalDetectedFY = globalDetectedMonthIndex >= 3
        ? `FY ${globalDetectedYear}–${String(globalDetectedYear + 1).slice(-2)}`
        : `FY ${globalDetectedYear - 1}–${String(globalDetectedYear).slice(-2)}`;
      break;
    }
  }

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const aoa = parseWorksheetToAOA(ws);
    if (!aoa || aoa.length === 0) continue;

    let r = 0;
    while (r < aoa.length) {
      const row = aoa[r];
      if (!row) { r++; continue; }

      let headlineInfo = null;
      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        if (cell && typeof cell === 'string' && cell.trim().length > 8) {
          const info = parseHeadlineInfo(cell);
          if (info) {
            headlineInfo = info;
            break;
          }
        }
      }

      if (headlineInfo) {
        if (headlineInfo.detectedMonthIndex !== null && globalDetectedMonthIndex === null) {
          globalDetectedMonthIndex = headlineInfo.detectedMonthIndex;
          globalDetectedYear = headlineInfo.detectedCalendarYear;
          globalDetectedFY = headlineInfo.detectedFY;
        }

        // Find header row for this table
        let headerRowIdx = -1;
        let truckColIdx = -1;
        let diffAmtColIdx = -1;
        let amtColIdx = -1;

        for (let hr = r + 1; hr <= Math.min(r + 6, aoa.length - 1); hr++) {
          const hRow = aoa[hr];
          if (!hRow) continue;
          const isNextHead = hRow.some(c => c && typeof c === 'string' && c.trim().length > 8 && parseHeadlineInfo(c));
          if (isNextHead) break;

          for (let c = 0; c < hRow.length; c++) {
            const hText = String(hRow[c] || '').toLowerCase().trim().replace(/[\r\n]+/g, ' ');
            if (hText.includes('truck') || hText.includes('vehicle') || hText === 'no' || hText.includes('truck no') || hText.includes('vehicle no')) {
              truckColIdx = c;
            }
            if (hText.includes('diff') || (hText.includes('dedi') && hText.includes('diff')) || hText.includes('difference')) {
              diffAmtColIdx = c;
            }
            if (hText.includes('sum of') && (hText.includes('amt') || hText.includes('amount') || hText.includes('dedi'))) {
              amtColIdx = c;
            }
          }
          if (truckColIdx !== -1 && (diffAmtColIdx !== -1 || amtColIdx !== -1)) {
            headerRowIdx = hr;
            break;
          }
        }

        const chosenAmtColIdx = diffAmtColIdx !== -1 ? diffAmtColIdx : amtColIdx;

        // Fallback column identification if header text was merged or implicit
        let finalTruckColIdx = truckColIdx;
        let finalAmtColIdx = chosenAmtColIdx;

        if (finalTruckColIdx === -1 || finalAmtColIdx === -1) {
          const scanStart = r + 1;
          for (let dr = scanStart; dr < Math.min(scanStart + 12, aoa.length); dr++) {
            const dRow = aoa[dr];
            if (!dRow) continue;
            for (let c = 0; c < dRow.length; c++) {
              if (finalTruckColIdx === -1 && extractTruckNo(dRow[c])) {
                finalTruckColIdx = c;
              }
              if (finalAmtColIdx === -1 && typeof dRow[c] === 'number' && dRow[c] > 0) {
                finalAmtColIdx = c;
              }
            }
          }
        }

        const tableRows = [];
        let currRow = (headerRowIdx !== -1 ? headerRowIdx + 1 : r + 1);

        while (currRow < aoa.length) {
          const row = aoa[currRow];
          if (!row) { currRow++; continue; }

          const isAnotherHeadline = row.some(cell => cell && typeof cell === 'string' && cell.trim().length > 8 && parseHeadlineInfo(cell));
          if (isAnotherHeadline) {
            break;
          }

          const firstNonEmpty = row.find(c => String(c || '').trim() !== '');
          const firstLower = String(firstNonEmpty || '').toLowerCase().trim();
          if (firstLower.startsWith('total') || firstLower.startsWith('grand total') || firstLower === 'sum' || firstLower === 'totals') {
            currRow++;
            break;
          }

          if (finalTruckColIdx !== -1 && finalAmtColIdx !== -1) {
            const rawTruck = row[finalTruckColIdx];
            const cleanTruck = extractTruckNo(rawTruck);
            const rawAmt = row[finalAmtColIdx];
            const cleanAmt = parseExcelNum(rawAmt);

            if (cleanTruck) {
              const record = {
                sheetName,
                headline: headlineInfo.rawHeadline,
                category: headlineInfo.category,
                targetField: headlineInfo.targetField,
                subField: headlineInfo.subField,
                truckNo: cleanTruck,
                rawTruckNo: String(rawTruck || '').trim(),
                amount: cleanAmt,
                rowIdx: currRow
              };
              tableRows.push(record);
              normalizedRecords.push(record);
            }
          }

          currRow++;
        }

        allTables.push({
          headline: headlineInfo.rawHeadline,
          category: headlineInfo.category,
          targetField: headlineInfo.targetField,
          subField: headlineInfo.subField,
          rowCount: tableRows.length,
          totalAmount: tableRows.reduce((sum, tr) => sum + tr.amount, 0),
          records: tableRows
        });

        r = currRow - 1;
      }
      r++;
    }
  }

  // Construct actuals map with difference field
  const actuals = {};
  const truckDiffs = {};
  const truckBreakdowns = {};

  normalizedRecords.forEach(rec => {
    const t = rec.truckNo;
    const diffVal = rec.differenceAmount !== undefined ? rec.differenceAmount : rec.amount;
    truckDiffs[t] = (truckDiffs[t] || 0) + diffVal;
    if (!truckBreakdowns[t]) truckBreakdowns[t] = [];
    truckBreakdowns[t].push({
      category: rec.category,
      targetField: rec.targetField,
      subField: rec.subField,
      amount: diffVal
    });
  });

  for (const [t, diffSum] of Object.entries(truckDiffs)) {
    const bds = truckBreakdowns[t] || [];
    let actNvl = '';
    let actNvcl = '';
    let actW10Nvl = '';
    let actW10Nvcl = '';
    let actW6Nvl = '';
    let actW6Nvcl = '';
    bds.forEach(b => {
      const amt = Number(b.amount) || 0;
      if (b.subField === 'w10_nvl') actW10Nvl = String((Number(actW10Nvl) || 0) + amt);
      else if (b.subField === 'w10_nvcl') actW10Nvcl = String((Number(actW10Nvcl) || 0) + amt);
      else if (b.subField === 'w6_nvl') actW6Nvl = String((Number(actW6Nvl) || 0) + amt);
      else if (b.subField === 'w6_nvcl') actW6Nvcl = String((Number(actW6Nvcl) || 0) + amt);
      else if (b.targetField === 'nvl') actNvl = String((Number(actNvl) || 0) + amt);
      else if (b.targetField === 'nvcl') actNvcl = String((Number(actNvcl) || 0) + amt);
    });

    const sumW10 = (Number(actW10Nvl) || 0) + (Number(actW10Nvcl) || 0);
    const sumW6 = (Number(actW6Nvl) || 0) + (Number(actW6Nvcl) || 0);

    actuals[t] = {
      nvl: actNvl,
      nvcl: actNvcl,
      w10: sumW10 ? String(sumW10) : '',
      w6: sumW6 ? String(sumW6) : '',
      w10_nvl: actW10Nvl,
      w10_nvcl: actW10Nvcl,
      w6_nvl: actW6Nvl,
      w6_nvcl: actW6Nvcl,
      difference: diffSum,
      diffBreakdown: bds
    };
  }

  // System trucks matching comparison
  const systemTruckList = (systemTrucks || []).map(st => st.truckNo || st['Truck No']).filter(Boolean);
  const uniqueExcelTrucks = Array.from(new Set(normalizedRecords.map(r => r.truckNo)));
  const matchedTrucks = uniqueExcelTrucks.filter(t => systemTruckList.some(st => matchVehicleRegistration(st, t)));
  const unmatchedTrucks = uniqueExcelTrucks.filter(t => !systemTruckList.some(st => matchVehicleRegistration(st, t)));
  const totalAmount = normalizedRecords.reduce((sum, r) => sum + r.amount, 0);

  return {
    detectedMonthIndex: globalDetectedMonthIndex,
    detectedCalendarYear: globalDetectedYear,
    detectedFY: globalDetectedFY,
    tables: allTables,
    normalizedRecords,
    actuals,
    totalRows: normalizedRecords.length,
    uniqueTruckCount: uniqueExcelTrucks.length,
    matchedCount: matchedTrucks.length,
    unmatchedCount: unmatchedTrucks.length,
    unmatchedTrucks: unmatchedTrucks.map(t => ({
      truckNo: t,
      records: normalizedRecords.filter(r => r.truckNo === t)
    })),
    totalAmount
  };
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
      const match = Object.keys(rawExcelMapped).find(k => 
        k === normSys || 
        getCanonicalTruckNo(k) === getCanonicalTruckNo(normSys) ||
        matchVehicleRegistration(k, normSys)
      );
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
  aoa[1][OUR_START_COL + 7] = 'NVCL';

  const ourHeaders = [
    'TYPE', 'Owner Name', 'Truck No',
    'Sum of Inv Qty', 'SUM OF ORG Billing Amt', 'Sum of ORG FREIGHT', 'Sum of Amt',
    'Sum of Inv Qty', 'SUM OF ORG Billing Amt', 'Sum of ORG FREIGHT', 'Sum Amt',
    'Total', '10WH extra 8.5% incentive', '6WH extra 15% incentive', 'Total (Projected)'
  ];
  for (let i = 0; i < ourHeaders.length; i++) aoa[2][OUR_START_COL + i] = ourHeaders[i];

  let matchedTrucks = new Set();

  for (let r = 0; r < aoa.length; r++) {
    const row = aoa[r];
    let matchedData = null;
    let foundTruckNo = null;

    if (colMap.leftTruckCol !== -1 && colMap.leftTruckCol < row.length) {
      const cell = row[colMap.leftTruckCol];
      if (cell) {
        matchedData = data.find(t => matchVehicleRegistration(t.truckNo, cell));
        if (matchedData) {
          foundTruckNo = matchedData.truckNo;
        }
      }
    }

    if (!matchedData) {
      for (let c = 0; c < mailMaxCol; c++) {
        if (row[c] !== undefined && row[c] !== null && row[c] !== '') {
          matchedData = data.find(t => matchVehicleRegistration(t.truckNo, row[c]));
          if (matchedData) {
            foundTruckNo = matchedData.truckNo;
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
      row[OUR_START_COL + 4] = Math.round(m.nvl.orgBillingAmt) || 0;
      row[OUR_START_COL + 5] = Math.round(m.nvl.orgFreight) || 0;
      row[OUR_START_COL + 6] = Math.round(m.nvl.amt) || 0;
      row[OUR_START_COL + 7] = m.nvcl.invQty || 0;
      row[OUR_START_COL + 8] = Math.round(m.nvcl.orgBillingAmt) || 0;
      row[OUR_START_COL + 9] = Math.round(m.nvcl.orgFreight) || 0;
      row[OUR_START_COL + 10] = Math.round(m.nvcl.amt) || 0;
      row[OUR_START_COL + 11] = Math.round(m.total) || 0;
      row[OUR_START_COL + 12] = Math.round(m.extra10W) || 0;
      row[OUR_START_COL + 13] = Math.round(m.extra6W) || 0;
      row[OUR_START_COL + 14] = Math.round(m.totalFinal) || 0;
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
      newRow[OUR_START_COL + 4] = Math.round(m.nvl.orgBillingAmt) || 0;
      newRow[OUR_START_COL + 5] = Math.round(m.nvl.orgFreight) || 0;
      newRow[OUR_START_COL + 6] = Math.round(m.nvl.amt) || 0;
      newRow[OUR_START_COL + 7] = m.nvcl.invQty || 0;
      newRow[OUR_START_COL + 8] = Math.round(m.nvcl.orgBillingAmt) || 0;
      newRow[OUR_START_COL + 9] = Math.round(m.nvcl.orgFreight) || 0;
      newRow[OUR_START_COL + 10] = Math.round(m.nvcl.amt) || 0;
      newRow[OUR_START_COL + 11] = Math.round(m.total) || 0;
      newRow[OUR_START_COL + 12] = Math.round(m.extra10W) || 0;
      newRow[OUR_START_COL + 13] = Math.round(m.extra6W) || 0;
      newRow[OUR_START_COL + 14] = Math.round(m.totalFinal) || 0;
      aoa.push(newRow);
    }
  }

  const merges = [
    { s: { r: 0, c: OUR_START_COL }, e: { r: 0, c: OUR_START_COL + 14 } },
    { s: { r: 1, c: OUR_START_COL + 3 }, e: { r: 1, c: OUR_START_COL + 6 } },
    { s: { r: 1, c: OUR_START_COL + 7 }, e: { r: 1, c: OUR_START_COL + 10 } },
    { s: { r: 1, c: OUR_START_COL + 0 }, e: { r: 2, c: OUR_START_COL + 0 } },
    { s: { r: 1, c: OUR_START_COL + 1 }, e: { r: 2, c: OUR_START_COL + 1 } },
    { s: { r: 1, c: OUR_START_COL + 2 }, e: { r: 2, c: OUR_START_COL + 2 } },
    { s: { r: 1, c: OUR_START_COL + 11 }, e: { r: 2, c: OUR_START_COL + 11 } },
    { s: { r: 1, c: OUR_START_COL + 12 }, e: { r: 2, c: OUR_START_COL + 12 } },
    { s: { r: 1, c: OUR_START_COL + 13 }, e: { r: 2, c: OUR_START_COL + 13 } },
    { s: { r: 1, c: OUR_START_COL + 14 }, e: { r: 2, c: OUR_START_COL + 14 } }
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
  XLSX.writeFile(wb, `Incentive_Comparison_${MONTH_NAMES[month]}_${year}.xlsx`);
}

function exportIncentiveExcel(data, year, month, actuals = {}) {
  const wb = XLSX.utils.book_new();
  const aoa = [];

  // Row 1: Big title
  const monthLabel = `${MONTH_NAMES[month]} ${year}`.toUpperCase();
  aoa.push([`QUALIFIED VEHICLE EXTRA FREIGHT 9.5% NVL & NVCL FOR DEDICATED FROM OUR CALCULATION NVL   MONTH OF ${monthLabel}`]);

  // Row 2: Column group headers
  aoa.push([
    'TYPE', 'Owner Name', 'Truck No', 'Wheel', 'Trips',
    'Sum of\nInv Qty', 'SUM OF\nORG Billing Amt', 'Sum of\nORG FREIGHT', 'Sum of\nAmt',   // NVL
    'Sum of\nInv Qty', 'SUM OF\nORG Billing Amt', 'Sum of\nORG FREIGHT', 'Sum Amt',        // NVCL
    'Total',
    '10W EXTRA\n8.5%',
    '6W EXTRA\n15%',
    'TOTAL (PROJECTED)',
    'ACTUAL NVL',
    'ACTUAL NVCL',
    'SUM OF AC NVL & NVCL',
    '10 WH EXTRA NVL',
    '10 WH EXTRA NVCL',
    'SUM OF 10WH EXT',
    '6 WH EXTRA NVL',
    '6 WH EXTRA NVCL',
    'SUM OF 6WH EXT',
    'TOTAL ACTUAL',
    'ACTUAL PAYOUT',
    'DIFFERENCE\n(ACTUAL-PROJECTED)',
    'SETTLED AMOUNT'
  ]);

  // Row 3: NVL / NVCL sub-group labels
  aoa.push([
    '', '', '', '', '',
    '', 'NVL', '', '',
    '', 'NVCL', '', '',
    '', '', '', '',
    '', '', '',
    '', '', '',
    '', '', '',
    '', '', '', ''
  ]);

  // Data rows
  for (const t of data) {
    const rawAct = resolveActualEntry(actuals, t.truckNo);
    const actNVL = (typeof rawAct === 'object' && rawAct !== null) ? num(rawAct.nvl) : 0;
    const actNVCL = (typeof rawAct === 'object' && rawAct !== null) ? num(rawAct.nvcl) : (parseFloat(rawAct) || 0);
    const sumAc = actNVL + actNVCL;
    const act10WH_NVL = (typeof rawAct === 'object' && rawAct !== null)
      ? num(rawAct.w10_nvl !== undefined && rawAct.w10_nvl !== '' ? rawAct.w10_nvl : (rawAct.w10 && (t.type === 'ATOA' || t.type === 'ATO' || (t.nvl?.amt > 0 && !t.nvcl?.amt)) ? rawAct.w10 : 0))
      : 0;
    const act10WH_NVCL = (typeof rawAct === 'object' && rawAct !== null)
      ? num(rawAct.w10_nvcl !== undefined && rawAct.w10_nvcl !== '' ? rawAct.w10_nvcl : (rawAct.w10 && (t.type === 'MKT' || (t.nvcl?.amt > 0 && !t.nvl?.amt)) ? rawAct.w10 : 0))
      : 0;
    const sum10W = act10WH_NVL + act10WH_NVCL;
    const act6WH_NVL = (typeof rawAct === 'object' && rawAct !== null)
      ? num(rawAct.w6_nvl !== undefined && rawAct.w6_nvl !== '' ? rawAct.w6_nvl : (rawAct.w6 && (t.type === 'ATOA' || t.type === 'ATO' || (t.nvl?.amt > 0 && !t.nvcl?.amt)) ? rawAct.w6 : 0))
      : 0;
    const act6WH_NVCL = (typeof rawAct === 'object' && rawAct !== null)
      ? num(rawAct.w6_nvcl !== undefined && rawAct.w6_nvcl !== '' ? rawAct.w6_nvcl : (rawAct.w6 && (t.type === 'MKT' || (t.nvcl?.amt > 0 && !t.nvl?.amt)) ? rawAct.w6 : 0))
      : 0;
    const sum6W = act6WH_NVL + act6WH_NVCL;
    const totalAct = actNVL + actNVCL + act10WH_NVL + act10WH_NVCL + act6WH_NVL + act6WH_NVCL;
    const actualPayout = calculateCombinedActualPayout(sumAc, sum10W, sum6W, t.type, t.wheel);
    const totalProj = num(t.totalFinal);
    const diff = totalProj - totalAct;
    const settled = (totalAct > 0 && totalAct > t.totalFinal) ? t.totalFinal : (totalAct > 0 ? totalAct : 0);

    aoa.push([
      t.type,
      t.ownerName,
      t.truckNo,
      t.wheel,
      t.tripsCount,
      t.nvl.invQty || '',
      t.nvl.orgBillingAmt ? Math.round(t.nvl.orgBillingAmt) : '',
      t.nvl.orgFreight ? Math.round(t.nvl.orgFreight) : '',
      t.nvl.amt ? Math.round(t.nvl.amt) : '',
      t.nvcl.invQty || '',
      t.nvcl.orgBillingAmt ? Math.round(t.nvcl.orgBillingAmt) : '',
      t.nvcl.orgFreight ? Math.round(t.nvcl.orgFreight) : '',
      t.nvcl.amt ? Math.round(t.nvcl.amt) : '',
      t.total || 0,
      t.extra10W ? Math.round(t.extra10W) : 0,
      t.extra6W ? Math.round(t.extra6W) : 0,
      t.totalFinal || 0,
      actNVL || 0,
      actNVCL || 0,
      sumAc || 0,
      act10WH_NVL || 0,
      act10WH_NVCL || 0,
      sum10W || 0,
      act6WH_NVL || 0,
      act6WH_NVCL || 0,
      sum6W || 0,
      totalAct || 0,
      actualPayout ? Math.round(actualPayout * 100) / 100 : 0,
      diff || 0,
      settled || 0
    ]);
  }

  // Footer totals row
  const totals = data.reduce((acc, t) => {
    acc.nvlQty = Math.round(acc.nvlQty + t.nvl.invQty);
    acc.nvlBillingAmt += (t.nvl.orgBillingAmt || 0);
    acc.nvlFreight += t.nvl.orgFreight;
    acc.nvlAmt += t.nvl.amt;
    acc.nvclQty = Math.round(acc.nvclQty + t.nvcl.invQty);
    acc.nvclBillingAmt += (t.nvcl.orgBillingAmt || 0);
    acc.nvclFreight += t.nvcl.orgFreight;
    acc.nvclAmt += t.nvcl.amt;
    acc.total += t.total;
    acc.w10 += t.extra10W;
    acc.w6 += t.extra6W;
    acc.grand += t.totalFinal;

    const rawAct = resolveActualEntry(actuals, t.truckNo);
    const actNVL = (typeof rawAct === 'object' && rawAct !== null) ? num(rawAct.nvl) : 0;
    const actNVCL = (typeof rawAct === 'object' && rawAct !== null) ? num(rawAct.nvcl) : (parseFloat(rawAct) || 0);
    const sumAc = actNVL + actNVCL;
    const act10WH_NVL = (typeof rawAct === 'object' && rawAct !== null)
      ? num(rawAct.w10_nvl !== undefined && rawAct.w10_nvl !== '' ? rawAct.w10_nvl : (rawAct.w10 && (t.type === 'ATOA' || t.type === 'ATO' || (t.nvl?.amt > 0 && !t.nvcl?.amt)) ? rawAct.w10 : 0))
      : 0;
    const act10WH_NVCL = (typeof rawAct === 'object' && rawAct !== null)
      ? num(rawAct.w10_nvcl !== undefined && rawAct.w10_nvcl !== '' ? rawAct.w10_nvcl : (rawAct.w10 && (t.type === 'MKT' || (t.nvcl?.amt > 0 && !t.nvl?.amt)) ? rawAct.w10 : 0))
      : 0;
    const sum10W = act10WH_NVL + act10WH_NVCL;
    const act6WH_NVL = (typeof rawAct === 'object' && rawAct !== null)
      ? num(rawAct.w6_nvl !== undefined && rawAct.w6_nvl !== '' ? rawAct.w6_nvl : (rawAct.w6 && (t.type === 'ATOA' || t.type === 'ATO' || (t.nvl?.amt > 0 && !t.nvcl?.amt)) ? rawAct.w6 : 0))
      : 0;
    const act6WH_NVCL = (typeof rawAct === 'object' && rawAct !== null)
      ? num(rawAct.w6_nvcl !== undefined && rawAct.w6_nvcl !== '' ? rawAct.w6_nvcl : (rawAct.w6 && (t.type === 'MKT' || (t.nvcl?.amt > 0 && !t.nvl?.amt)) ? rawAct.w6 : 0))
      : 0;
    const sum6W = act6WH_NVL + act6WH_NVCL;
    const totalAct = actNVL + actNVCL + act10WH_NVL + act10WH_NVCL + act6WH_NVL + act6WH_NVCL;
    const actualPayout = calculateCombinedActualPayout(sumAc, sum10W, sum6W, t.type, t.wheel);
    const totalProj = num(t.totalFinal);
    const diff = totalProj - totalAct;
    const settled = (totalAct > 0 && totalAct > t.totalFinal) ? t.totalFinal : (totalAct > 0 ? totalAct : 0);

    acc.actNVL += actNVL;
    acc.actNVCL += actNVCL;
    acc.actSumAc += sumAc;
    acc.act10WH_NVL += act10WH_NVL;
    acc.act10WH_NVCL += act10WH_NVCL;
    acc.actSum10W += sum10W;
    acc.act6WH_NVL += act6WH_NVL;
    acc.act6WH_NVCL += act6WH_NVCL;
    acc.actSum6W += sum6W;
    acc.actual += totalAct;
    acc.actualPayout += actualPayout;
    acc.diff += diff;
    acc.settled += settled;
    return acc;
  }, {
    nvlQty: 0, nvlBillingAmt: 0, nvlFreight: 0, nvlAmt: 0,
    nvclQty: 0, nvclBillingAmt: 0, nvclFreight: 0, nvclAmt: 0,
    total: 0, w10: 0, w6: 0, grand: 0,
    actNVL: 0, actNVCL: 0, actSumAc: 0, act10WH_NVL: 0, act10WH_NVCL: 0, actSum10W: 0, act6WH_NVL: 0, act6WH_NVCL: 0, actSum6W: 0,
    actual: 0, actualPayout: 0, diff: 0, settled: 0
  });

  aoa.push([
    'TOTALS', '', '', '', '',
    Math.round(totals.nvlQty),
    Math.round(totals.nvlBillingAmt),
    Math.round(totals.nvlFreight),
    Math.round(totals.nvlAmt),
    Math.round(totals.nvclQty),
    Math.round(totals.nvclBillingAmt),
    Math.round(totals.nvclFreight),
    Math.round(totals.nvclAmt),
    Math.round(totals.total),
    Math.round(totals.w10),
    Math.round(totals.w6),
    Math.round(totals.grand),
    Math.round(totals.actNVL),
    Math.round(totals.actNVCL),
    Math.round(totals.actSumAc),
    Math.round(totals.act10WH_NVL),
    Math.round(totals.act10WH_NVCL),
    Math.round(totals.actSum10W),
    Math.round(totals.act6WH_NVL),
    Math.round(totals.act6WH_NVCL),
    Math.round(totals.actSum6W),
    Math.round(totals.actual),
    Math.round(totals.actualPayout * 100) / 100,
    Math.round(totals.diff),
    Math.round(totals.settled)
  ]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // ── Column widths ──────────────────────────────────────────────────────────
  ws['!cols'] = [
    { wch: 8 },   // TYPE
    { wch: 22 },  // Owner Name
    { wch: 14 },  // Truck No
    { wch: 8 },   // Wheel
    { wch: 8 },   // Trips
    { wch: 12 },  // NVL inv qty
    { wch: 16 },  // NVL org billing amt
    { wch: 14 },  // NVL org freight
    { wch: 12 },  // NVL amt
    { wch: 12 },  // NVCL inv qty
    { wch: 16 },  // NVCL org billing amt
    { wch: 14 },  // NVCL org freight
    { wch: 12 },  // NVCL amt
    { wch: 10 },  // Total
    { wch: 12 },  // 10W Extra
    { wch: 12 },  // 6W Extra
    { wch: 16 },  // TOTAL(PROJECTED)
    { wch: 12 },  // ACTUAL NVL
    { wch: 12 },  // ACTUAL NVCL
    { wch: 14 },  // SUM OF AC NVL & NVCL
    { wch: 12 },  // 10WH NVL
    { wch: 12 },  // 10WH NVCL
    { wch: 14 },  // SUM OF 10WH EXT
    { wch: 12 },  // 6WH NVL
    { wch: 12 },  // 6WH NVCL
    { wch: 14 },  // SUM OF 6WH EXT
    { wch: 14 },  // TOTAL ACTUAL
    { wch: 14 },  // ACTUAL PAYOUT
    { wch: 16 },  // DIFFERENCE
    { wch: 16 },  // SETTLED AMOUNT
  ];

  // ── Merges (30 cols total now: A–AD) ────────────────────────────────────────
  ws['!merges'] = [
    // Title row spans all 30 cols (A1:AD1)
    { s: { r: 0, c: 0 }, e: { r: 0, c: 29 } },
    // NVL sub-header (F3:I3)
    { s: { r: 2, c: 5 }, e: { r: 2, c: 8 } },
    // NVCL sub-header (J3:M3)
    { s: { r: 2, c: 9 }, e: { r: 2, c: 12 } },
    // TYPE spans rows 2-3
    { s: { r: 1, c: 0 }, e: { r: 2, c: 0 } },
    // Owner Name spans rows 2-3
    { s: { r: 1, c: 1 }, e: { r: 2, c: 1 } },
    // Truck No spans rows 2-3
    { s: { r: 1, c: 2 }, e: { r: 2, c: 2 } },
    // Wheel spans rows 2-3
    { s: { r: 1, c: 3 }, e: { r: 2, c: 3 } },
    // Trips spans rows 2-3
    { s: { r: 1, c: 4 }, e: { r: 2, c: 4 } },
    // Total spans rows 2-3
    { s: { r: 1, c: 13 }, e: { r: 2, c: 13 } },
    // 10W spans rows 2-3
    { s: { r: 1, c: 14 }, e: { r: 2, c: 14 } },
    // 6W spans rows 2-3
    { s: { r: 1, c: 15 }, e: { r: 2, c: 15 } },
    // TOTAL(PROJECTED) spans rows 2-3
    { s: { r: 1, c: 16 }, e: { r: 2, c: 16 } },
    // ACTUAL NVL spans rows 2-3
    { s: { r: 1, c: 17 }, e: { r: 2, c: 17 } },
    // ACTUAL NVCL spans rows 2-3
    { s: { r: 1, c: 18 }, e: { r: 2, c: 18 } },
    // SUM OF AC NVL & NVCL spans rows 2-3
    { s: { r: 1, c: 19 }, e: { r: 2, c: 19 } },
    // TOTAL ACTUAL spans rows 2-3
    { s: { r: 1, c: 26 }, e: { r: 2, c: 26 } },
    // ACTUAL PAYOUT spans rows 2-3
    { s: { r: 1, c: 27 }, e: { r: 2, c: 27 } },
    // DIFFERENCE spans rows 2-3
    { s: { r: 1, c: 28 }, e: { r: 2, c: 28 } },
    // SETTLED spans rows 2-3
    { s: { r: 1, c: 29 }, e: { r: 2, c: 29 } },
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
  const [uploadSummaryModalOpen, setUploadSummaryModalOpen] = useState(false);
  const [uploadSummaryData, setUploadSummaryData] = useState(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [importingExcel, setImportingExcel] = useState(false);
  const [mailNvlTotal, setMailNvlTotal] = useState('');
  const [mailW10Total, setMailW10Total] = useState('');
  const [mailNvclTotal, setMailNvclTotal] = useState('');

  // State for uploaded files preview and actuals loaded from database
  const [uploadedPdfUrl, setUploadedPdfUrl] = useState(null);
  const [uploadedExcelName, setUploadedExcelName] = useState(null);
  const [uploadedExcelData, setUploadedExcelData] = useState(null);
  const [pendingExcelRemoval, setPendingExcelRemoval] = useState(false);
  const [excelFileAnchorEl, setExcelFileAnchorEl] = useState(null);
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
    if (hasNewUpload || pendingExcelRemoval) {
      return (
        <Chip
          label={pendingExcelRemoval ? "⚠️ File Removal (Unsaved)" : "⚠️ Preview (Unsaved)"}
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
            bgcolor: 'background.default',
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
    const keys1 = Object.keys(actuals || {});
    const keys2 = Object.keys(dbActuals || {});
    const allKeys = Array.from(new Set([...keys1, ...keys2]));

    for (const key of allKeys) {
      const v1 = actuals?.[key];
      const v2 = dbActuals?.[key];
      if (typeof v1 === 'object' || typeof v2 === 'object') {
        const o1 = typeof v1 === 'object' && v1 !== null ? v1 : { nvl: v1 || '' };
        const o2 = typeof v2 === 'object' && v2 !== null ? v2 : { nvl: v2 || '' };
        if (
          String(o1.nvl ?? '').trim() !== String(o2.nvl ?? '').trim() ||
          String(o1.nvcl ?? '').trim() !== String(o2.nvcl ?? '').trim() ||
          String(o1.w10 ?? '').trim() !== String(o2.w10 ?? '').trim() ||
          String(o1.w6 ?? '').trim() !== String(o2.w6 ?? '').trim() ||
          String(o1.w10_nvl ?? '').trim() !== String(o2.w10_nvl ?? '').trim() ||
          String(o1.w10_nvcl ?? '').trim() !== String(o2.w10_nvcl ?? '').trim() ||
          String(o1.w6_nvl ?? '').trim() !== String(o2.w6_nvl ?? '').trim() ||
          String(o1.w6_nvcl ?? '').trim() !== String(o2.w6_nvcl ?? '').trim()
        ) {
          return true;
        }
      } else {
        if (String(v1 ?? '').trim() !== String(v2 ?? '').trim()) return true;
      }
    }
    return false;
  }, [actuals, dbActuals]);

  const isDirty = hasNewUpload || isActualsModified || pendingExcelRemoval;

  // ── Unified Excel Upload Handler ──────────────────────────────────────────
  const handleExcelUpload = async (file) => {
    if (!file) return;
    setImportingExcel(true);
    try {
      setUploadedExcelName(file.name);
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, { cellDates: true });
      const mainSheetName = wb.SheetNames.find(name => name.toUpperCase().includes('INCENTIVE')) || wb.SheetNames[0];
      const parsedRows = parseWorksheetToAOA(wb.Sheets[mainSheetName]);
      setUploadedExcelData(parsedRows);

      // Run multi-table workbook parser
      const parsedResult = parseIncentiveWorkbook(wb, data);
      if (!parsedResult || (parsedResult.tables.length === 0 && Object.keys(parsedResult.actuals).length === 0)) {
        // Fallback to legacy single table mapping
        const mapped = mapExcelToActuals(parsedRows, data);
        if (Object.keys(mapped).length === 0) {
          alert("The uploaded Excel sheet does not contain valid incentive tables or truck data.");
          setImportingExcel(false);
          return;
        }
        setActuals(prev => ({ ...prev, ...mapped }));
        setHasNewUpload(true);
        setSaveCompleted(false);
        setComparisonModalOpen(true);
        setImportingExcel(false);
        return;
      }

      // Check if month/year detected from Excel differs from current UI view
      let targetYear = year;
      let targetMonth = month;
      if (parsedResult.detectedCalendarYear !== null && parsedResult.detectedMonthIndex !== null) {
        targetYear = parsedResult.detectedCalendarYear;
        targetMonth = parsedResult.detectedMonthIndex;
        if (targetYear !== year || targetMonth !== month) {
          setYear(targetYear);
          setMonth(targetMonth);
          if (onPeriodChange) {
            onPeriodChange(targetYear, targetMonth + 1);
          }
        }
      }

      // Merge parsed actuals with existing actuals
      const mergedActuals = { ...actuals, ...parsedResult.actuals };
      setActuals(mergedActuals);
      setUploadedExcelName(file.name);
      setUploadedExcelData(parsedRows);
      setUploadSummaryData(parsedResult);
      setHasNewUpload(true);
      setPendingExcelRemoval(false);
      setSaveCompleted(false);
      setUploadSummaryModalOpen(true);
      setSnack({
        severity: 'info',
        msg: `Excel parsed: ${parsedResult.tables.length} tables found (${parsedResult.totalRows} records). Click SAVE to persist.`
      });
    } catch (err) {
      console.error("Excel upload failed:", err);
      alert("Failed to process uploaded Excel: " + (err.response?.data?.error || err.message));
    } finally {
      setImportingExcel(false);
    }
  };

  // ── Authoritative Callback for Redesigned Upload Dialog ─────────────────────
  const handleConfirmExcelImport = async ({
    targetYear,
    targetMonth,
    financialYear: importedFY,
    newActuals,
    normalizedRecords,
    uploadSummary,
    excelName,
    excelData
  }) => {
    const fy = importedFY || (targetMonth >= 3 ? `FY ${targetYear}-${String(targetYear + 1).slice(-2)}` : `FY ${targetYear - 1}-${String(targetYear).slice(-2)}`);

    // Merge/replace imported vehicle actuals state immediately for instantaneous UI update
    setActuals(newActuals);
    setDbActuals(newActuals);
    setUploadedExcelName(excelName);
    setUploadedExcelData(excelData);
    setUploadSummaryData(uploadSummary);
    setHasNewUpload(false);
    setPendingExcelRemoval(false);
    setSaveCompleted(true);
    setUploadDialogOpen(false);

    // Save immediately to MongoDB so the imported Actual Incentive values persist across refresh/reopen
    try {
      const token = localStorage.getItem('token');
      const API_URL = import.meta.env.VITE_API_URL;
      await axios.post(`${API_URL}/cement-register/incentive-state`, {
        year: targetYear,
        month: targetMonth,
        actuals: newActuals,
        pdfUrl: uploadedPdfUrl,
        excelName,
        excelData,
        uploadSummary,
        financialYear: fy,
        normalizedRecords: normalizedRecords || []
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setSnack({
        severity: 'success',
        msg: `Actual Incentive Excel imported & saved! (${uploadSummary.matchedCount} matched, ${uploadSummary.unmatchedCount} unmatched, ₹${Math.round(uploadSummary.totalDifference || 0).toLocaleString('en-IN')})`
      });

      // Automatically open the detailed import summary report
      setUploadSummaryModalOpen(true);
    } catch (err) {
      console.error("Failed to persist imported incentive state:", err);
      setSnack({
        severity: 'error',
        msg: 'Imported into view, but saving to database failed: ' + (err.response?.data?.error || err.message)
      });
    }

    // If target period is different from currently active view, align UI view
    if (targetYear !== year || targetMonth !== month) {
      setYear(targetYear);
      setMonth(targetMonth);
      if (onPeriodChange) onPeriodChange(targetYear, targetMonth + 1);
    }
  };

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
      setPendingExcelRemoval(false);
      try {
        const token = localStorage.getItem('token');
        const API_URL = import.meta.env.VITE_API_URL;
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
          setUploadSummaryData(st.uploadSummary || null);
          setSaveCompleted(!!st.excelName);
          setHasNewUpload(false);
          setPendingExcelRemoval(false);
          setComparisonModalOpen(false);
        } else {
          setActuals({});
          setDbActuals({});
          setUploadedPdfUrl(null);
          setUploadedExcelName(null);
          setUploadedExcelData(null);
          setUploadSummaryData(null);
          setSaveCompleted(false);
          setHasNewUpload(false);
          setPendingExcelRemoval(false);
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
    if (!isDirty && !pendingExcelRemoval) {
      return setSnack({ severity: 'info', msg: 'No unsaved changes to save.' });
    }
    setSavingActuals(true);
    try {
      const token = localStorage.getItem('token');
      const API_URL = import.meta.env.VITE_API_URL;
      const targetExcelName = pendingExcelRemoval ? null : uploadedExcelName;
      const targetExcelData = pendingExcelRemoval ? null : uploadedExcelData;
      const targetUploadSummary = pendingExcelRemoval ? null : uploadSummaryData;
      const fy = (month >= 3 ? `FY ${year}-${String(year + 1).slice(-2)}` : `FY ${year - 1}-${String(year).slice(-2)}`);

      await axios.post(`${API_URL}/cement-register/incentive-state`, {
        year,
        month,
        actuals,
        pdfUrl: uploadedPdfUrl,
        excelName: targetExcelName,
        excelData: targetExcelData,
        uploadSummary: targetUploadSummary,
        financialYear: fy,
        normalizedRecords: pendingExcelRemoval ? [] : (uploadSummaryData?.normalizedRecords || [])
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (pendingExcelRemoval) {
        setUploadedExcelName(null);
        setUploadedExcelData(null);
        setUploadSummaryData(null);
        setPendingExcelRemoval(false);
      }
      setSaveCompleted(true);
      setDbActuals(actuals);
      setHasNewUpload(false);
      setSnack({ severity: 'success', msg: 'Incentive Calculation Sheet saved successfully!' });
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
      const API_URL = import.meta.env.VITE_API_URL;
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
    const API_URL = import.meta.env.VITE_API_URL;
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
    const API_URL = import.meta.env.VITE_API_URL;
    setFetchingRows(true);
    axios.get(`${API_URL}/cement-register`, {
      params: { month: month + 1, year }
    })
      .then(res => {
        if (res.data?.success) {
          // Format dates to DD.MM.YY to match the same format as computedRows
          const entries = (res.data.entries || []).map(row => {
            const rawDt = row['LOADING DT'] || row['LOADING DATE'] || row['BILL DATE'] || row['RECEIVING DATE'] || row['INVOICE DATE'] || row.date;
            return {
              ...row,
              'LOADING DT': rawDt ? formatLoadingDate(rawDt) : (row['LOADING DT'] || '')
            };
          });
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
    acc.nvlBillingAmt += (t.nvl.orgBillingAmt || 0);
    acc.nvlFreight += t.nvl.orgFreight;
    acc.nvlAmt += t.nvl.amt; // already rounded in buildIncentiveData
    acc.nvclQty = Math.round(acc.nvclQty + t.nvcl.invQty);
    acc.nvclBillingAmt += (t.nvcl.orgBillingAmt || 0);
    acc.nvclFreight += t.nvcl.orgFreight;
    acc.nvclAmt += t.nvcl.amt; // already rounded in buildIncentiveData
    acc.total += t.total;
    acc.extra10W += t.extra10W;
    acc.extra6W += t.extra6W;
    acc.grand += t.totalFinal;
    return acc;
  }, { nvlQty: 0, nvlBillingAmt: 0, nvlFreight: 0, nvlAmt: 0, nvclQty: 0, nvclBillingAmt: 0, nvclFreight: 0, nvclAmt: 0, total: 0, extra10W: 0, extra6W: 0, grand: 0 }), [data]);

  // Available years (5 year window)
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  const monthLabel = `${MONTH_NAMES[month]} '${String(year).slice(2)}`;

  // ── Styles ─────────────────────────────────────────────────────────────────
  const thBase = {
    padding: '5px 6px',
    fontSize: '11px',
    fontWeight: 700,
    textAlign: 'center',
    border: '1px solid #94a3b8',
    whiteSpace: 'pre-line',
    lineHeight: 1.2,
    position: 'sticky',
    boxSizing: 'border-box',
  };
  const tdBase = {
    padding: '5px 8px',
    fontSize: '11px',
    border: '1px solid #cbd5e1',
    textAlign: 'right',
    whiteSpace: 'nowrap',
  };
  const fmt = (n, maxDec = 0) => {
    const numVal = Number(n) || 0;
    if (numVal === 0 || Object.is(numVal, -0)) return '0';
    if (maxDec > 0) {
      const rounded = Math.round(numVal * Math.pow(10, maxDec)) / Math.pow(10, maxDec);
      if (rounded === 0 || Object.is(rounded, -0)) return '0';
      return rounded.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: maxDec });
    }
    const r = Math.round(numVal);
    return (r === 0 || Object.is(r, -0)) ? '0' : r.toLocaleString('en-IN');
  };

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

  const resolveActual = (truckNo) => resolveActualEntry(actuals, truckNo);

  const getActualNVL = (truckNo) => {
    const act = resolveActual(truckNo);
    if (typeof act === 'object' && act !== null) {
      if (act.nvl !== undefined && act.nvl !== null && act.nvl !== '') return act.nvl;
      if (uploadedExcelName) return '0';
      return '';
    }
    if (uploadedExcelName) return '0';
    return '';
  };

  const getActualNVCL = (truckNo) => {
    const act = resolveActual(truckNo);
    if (typeof act === 'object' && act !== null) {
      if (act.nvcl !== undefined && act.nvcl !== null && act.nvcl !== '') return act.nvcl;
      if (uploadedExcelName) return '0';
      return '';
    }
    if (typeof act !== 'undefined' && act !== null) return act;
    if (uploadedExcelName) return '0';
    return '';
  };

  const getActual10WH = (truckNo) => {
    const act = resolveActual(truckNo);
    if (typeof act === 'object' && act !== null) {
      if (act.w10_nvl || act.w10_nvcl) {
        return (num(act.w10_nvl) + num(act.w10_nvcl)) || '';
      }
      return act.w10 || (uploadedExcelName ? '0' : '');
    }
    return uploadedExcelName ? '0' : '';
  };

  const getActual6WH = (truckNo) => {
    const act = resolveActual(truckNo);
    if (typeof act === 'object' && act !== null) {
      if (act.w6_nvl || act.w6_nvcl) {
        return (num(act.w6_nvl) + num(act.w6_nvcl)) || '';
      }
      return act.w6 || (uploadedExcelName ? '0' : '');
    }
    return uploadedExcelName ? '0' : '';
  };

  const getActual10WH_NVL = (truckNo, truckData) => {
    const act = resolveActual(truckNo);
    if (typeof act === 'object' && act !== null) {
      if (act.w10_nvl !== undefined && act.w10_nvl !== null && act.w10_nvl !== '') return act.w10_nvl;
      if (Array.isArray(act.diffBreakdown)) {
        const bd = act.diffBreakdown.find(b => b.subField === 'w10_nvl' || (b.targetField === 'w10' && b.category?.includes('NVL')));
        if (bd && bd.amount !== undefined) return bd.amount;
      }
      if (act.w10 !== undefined && act.w10 !== null && act.w10 !== '' && !act.w10_nvcl) {
        if (!truckData || truckData.type === 'ATOA' || truckData.type === 'ATO' || (truckData.nvl?.amt > 0 && !truckData.nvcl?.amt)) {
          return act.w10;
        }
      }
      if (uploadedExcelName) return '0';
    }
    if (uploadedExcelName) return '0';
    return '';
  };

  const getActual10WH_NVCL = (truckNo, truckData) => {
    const act = resolveActual(truckNo);
    if (typeof act === 'object' && act !== null) {
      if (act.w10_nvcl !== undefined && act.w10_nvcl !== null && act.w10_nvcl !== '') return act.w10_nvcl;
      if (Array.isArray(act.diffBreakdown)) {
        const bd = act.diffBreakdown.find(b => b.subField === 'w10_nvcl' || (b.targetField === 'w10' && b.category?.includes('NVCL')));
        if (bd && bd.amount !== undefined) return bd.amount;
      }
      if (act.w10 !== undefined && act.w10 !== null && act.w10 !== '' && !act.w10_nvl) {
        if (truckData && (truckData.type === 'MKT' || (truckData.nvcl?.amt > 0 && !truckData.nvl?.amt))) {
          return act.w10;
        }
      }
      if (uploadedExcelName) return '0';
    }
    if (uploadedExcelName) return '0';
    return '';
  };

  const getActual6WH_NVL = (truckNo, truckData) => {
    const act = resolveActual(truckNo);
    if (typeof act === 'object' && act !== null) {
      if (act.w6_nvl !== undefined && act.w6_nvl !== null && act.w6_nvl !== '') return act.w6_nvl;
      if (Array.isArray(act.diffBreakdown)) {
        const bd = act.diffBreakdown.find(b => b.subField === 'w6_nvl' || (b.targetField === 'w6' && b.category?.includes('NVL')));
        if (bd && bd.amount !== undefined) return bd.amount;
      }
      if (act.w6 !== undefined && act.w6 !== null && act.w6 !== '' && !act.w6_nvcl) {
        if (!truckData || truckData.type === 'ATOA' || truckData.type === 'ATO' || (truckData.nvl?.amt > 0 && !truckData.nvcl?.amt)) {
          return act.w6;
        }
      }
      if (uploadedExcelName) return '0';
    }
    if (uploadedExcelName) return '0';
    return '';
  };

  const getActual6WH_NVCL = (truckNo, truckData) => {
    const act = resolveActual(truckNo);
    if (typeof act === 'object' && act !== null) {
      if (act.w6_nvcl !== undefined && act.w6_nvcl !== null && act.w6_nvcl !== '') return act.w6_nvcl;
      if (Array.isArray(act.diffBreakdown)) {
        const bd = act.diffBreakdown.find(b => b.subField === 'w6_nvcl' || (b.targetField === 'w6' && b.category?.includes('NVCL')));
        if (bd && bd.amount !== undefined) return bd.amount;
      }
      if (act.w6 !== undefined && act.w6 !== null && act.w6 !== '' && !act.w6_nvl) {
        if (truckData && (truckData.type === 'MKT' || (truckData.nvcl?.amt > 0 && !truckData.nvl?.amt))) {
          return act.w6;
        }
      }
      if (uploadedExcelName) return '0';
    }
    if (uploadedExcelName) return '0';
    return '';
  };

  const getTotalActual = (truckNo, truckData) => {
    const actNVL = num(getActualNVL(truckNo));
    const actNVCL = num(getActualNVCL(truckNo));
    const act10WH_NVL = num(getActual10WH_NVL(truckNo, truckData));
    const act10WH_NVCL = num(getActual10WH_NVCL(truckNo, truckData));
    const act6WH_NVL = num(getActual6WH_NVL(truckNo, truckData));
    const act6WH_NVCL = num(getActual6WH_NVCL(truckNo, truckData));
    return actNVL + actNVCL + act10WH_NVL + act10WH_NVCL + act6WH_NVL + act6WH_NVCL;
  };

  const getActualPayout = (truckNo, truckData) => {
    const tData = truckData || data.find(d => d.truckNo === truckNo);
    const actNVL = num(getActualNVL(truckNo));
    const actNVCL = num(getActualNVCL(truckNo));
    const sumAc = actNVL + actNVCL;
    const act10WH_NVL = num(getActual10WH_NVL(truckNo, tData));
    const act10WH_NVCL = num(getActual10WH_NVCL(truckNo, tData));
    const sum10W = act10WH_NVL + act10WH_NVCL;
    const act6WH_NVL = num(getActual6WH_NVL(truckNo, tData));
    const act6WH_NVCL = num(getActual6WH_NVCL(truckNo, tData));
    const sum6W = act6WH_NVL + act6WH_NVCL;
    return calculateCombinedActualPayout(sumAc, sum10W, sum6W, tData?.type, tData?.wheel);
  };

  const updateActual = (truckNo, field, value) => {
    setActuals(prev => {
      const current = prev[truckNo];
      let newObj = { nvl: '', nvcl: '', w10: '', w6: '', w10_nvl: '', w10_nvcl: '', w6_nvl: '', w6_nvcl: '' };
      if (typeof current === 'object' && current !== null) {
        newObj = { ...current };
      } else if (typeof current !== 'undefined') {
        newObj.nvcl = current;
      }
      newObj[field] = value;
      if (field === 'w10_nvl' || field === 'w10_nvcl') {
        const v1 = field === 'w10_nvl' ? value : (newObj.w10_nvl || '');
        const v2 = field === 'w10_nvcl' ? value : (newObj.w10_nvcl || '');
        newObj.w10 = (v1 !== '' || v2 !== '') ? String((num(v1) || 0) + (num(v2) || 0)) : '';
      }
      if (field === 'w6_nvl' || field === 'w6_nvcl') {
        const v1 = field === 'w6_nvl' ? value : (newObj.w6_nvl || '');
        const v2 = field === 'w6_nvcl' ? value : (newObj.w6_nvcl || '');
        newObj.w6 = (v1 !== '' || v2 !== '') ? String((num(v1) || 0) + (num(v2) || 0)) : '';
      }
      return { ...prev, [truckNo]: newObj };
    });
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default', overflow: 'hidden', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* ── Top Bar ─────────────────────────────────────────────────────── */}
      <Box sx={{
        px: 2.5, py: 1.2,
        display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap',
        bgcolor: 'background.paper', borderBottom: '1px solid #e2e8f0',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)', flexShrink: 0,
      }}>
        <IconButton onClick={onBack} size="small" sx={{ bgcolor: 'background.default', '&:hover': { bgcolor: '#e2e8f0' } }}>
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
            <SearchableSelect
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
                bgcolor: 'background.default',
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#e2e8f0',
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#cbd5e1',
                },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#7c3aed',
                },
                minWidth: 120,
              }}
            >
              {MONTH_NAMES.map((m, i) => (
                <MenuItem key={i} value={i} sx={{ fontSize: '11px', fontWeight: 600 }}>{m}</MenuItem>
              ))}
            </SearchableSelect>

            <SearchableSelect
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
                bgcolor: 'background.default',
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#e2e8f0',
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#cbd5e1',
                },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#7c3aed',
                },
                minWidth: 100,
              }}
            >
              {years.map(y => (
                <MenuItem key={y} value={y} sx={{ fontSize: '11px', fontWeight: 600 }}>{y}</MenuItem>
              ))}
            </SearchableSelect>
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
              '&:hover': { bgcolor: 'background.default', borderColor: '#94a3b8' }
            }}>
            Upload PDF
            <input type="file" accept="application/pdf" hidden onChange={async (e) => {
              const file = e.target.files[0];
              if (file) {
                try {
                  const token = localStorage.getItem('token');
                  const API_URL = import.meta.env.VITE_API_URL;
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

          {uploadSummaryData && !pendingExcelRemoval && (
            <Button
              size="small" variant="outlined"
              onClick={() => setUploadSummaryModalOpen(true)}
              sx={{
                fontWeight: 700, borderRadius: 2, px: 1.5, fontSize: '11px',
                borderColor: '#10b981', color: '#047857', bgcolor: '#ecfdf5',
                textTransform: 'none',
                '&:hover': { bgcolor: '#d1fae5', borderColor: '#059669' }
              }}>
              📊 Import Report ({uploadSummaryData.tables?.length || uploadSummaryData.tablesDetected || 0} Tables)
            </Button>
          )}

          {/* ── UPLOAD INCENTIVE EXCEL & ATTACHED FILE INDICATOR ── */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {uploadedExcelName && !pendingExcelRemoval ? (
              <>
                {/* Visual blurred/disabled-looking upload button */}
                <Tooltip title="An Excel file is already attached. Click the file chip to remove or replace.">
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<UploadIcon />}
                    sx={{
                      fontWeight: 700,
                      borderRadius: 2,
                      px: 1.5,
                      fontSize: '11px',
                      borderColor: '#cbd5e1',
                      color: '#94a3b8',
                      textTransform: 'none',
                      bgcolor: '#f8fafc',
                      filter: 'blur(0.8px)',
                      opacity: 0.65,
                      cursor: 'default',
                      userSelect: 'none',
                    }}
                  >
                    Upload Incentive Excel
                  </Button>
                </Tooltip>

                {/* Compact chip / card displaying the uploaded file name */}
                <Tooltip title="Click to view file details or remove">
                  <Box
                    onClick={(e) => setExcelFileAnchorEl(e.currentTarget)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.75,
                      px: 1.25,
                      py: 0.5,
                      borderRadius: 2,
                      bgcolor: '#eff6ff',
                      border: '1px solid #bfdbfe',
                      color: '#1d4ed8',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      maxWidth: 220,
                      transition: 'all 0.2s ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                      '&:hover': {
                        bgcolor: '#dbeafe',
                        borderColor: '#93c5fd',
                        transform: 'translateY(-1px)',
                        boxShadow: '0 2px 5px rgba(29, 78, 216, 0.15)'
                      }
                    }}
                  >
                    <InsertDriveFileIcon sx={{ fontSize: 16, color: '#2563eb' }} />
                    <Typography
                      sx={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#1e40af',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {uploadedExcelName}
                    </Typography>
                  </Box>
                </Tooltip>
              </>
            ) : pendingExcelRemoval ? (
              <>
                {/* Active upload control when pending removal */}
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={importingExcel ? <CircularProgress size={14} color="inherit" /> : <UploadIcon />}
                  disabled={importingExcel}
                  onClick={() => setUploadDialogOpen(true)}
                  sx={{
                    fontWeight: 700,
                    borderRadius: 2,
                    px: 1.5,
                    fontSize: '11px',
                    borderColor: '#cbd5e1',
                    color: '#475569',
                    textTransform: 'none',
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'background.default', borderColor: '#94a3b8' }
                  }}
                >
                  {importingExcel ? 'Importing Excel…' : 'Upload Incentive Excel'}
                </Button>

                {/* Staged unsaved removal indicator chip */}
                <Tooltip title="Marked for removal. Click to manage or click SAVE to commit.">
                  <Chip
                    icon={<DeleteOutlineIcon sx={{ fontSize: '14px !important', color: '#dc2626 !important' }} />}
                    label="File removed — UNSAVED"
                    size="small"
                    onClick={(e) => setExcelFileAnchorEl(e.currentTarget)}
                    sx={{
                      bgcolor: '#fef2f2',
                      border: '1px dashed #f87171',
                      color: '#b91c1c',
                      fontWeight: 700,
                      fontSize: '11px',
                      cursor: 'pointer',
                      '&:hover': { bgcolor: '#fee2e2' }
                    }}
                  />
                </Tooltip>
              </>
            ) : (
              /* No file attached: active upload button */
              <Button
                size="small"
                variant="outlined"
                startIcon={importingExcel ? <CircularProgress size={14} color="inherit" /> : <UploadIcon />}
                disabled={importingExcel}
                onClick={() => setUploadDialogOpen(true)}
                sx={{
                  fontWeight: 700,
                  borderRadius: 2,
                  px: 1.5,
                  fontSize: '11px',
                  borderColor: '#cbd5e1',
                  color: '#475569',
                  textTransform: 'none',
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'background.default', borderColor: '#94a3b8' },
                  '&:disabled': { background: '#f1f5f9', color: '#94a3b8', border: '1px solid #e2e8f0' }
                }}
              >
                {importingExcel ? 'Importing Excel…' : 'Upload Incentive Excel'}
              </Button>
            )}
          </Box>

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

          {/* ── Top-Right Action Buttons: [ EXPORT EXCEL ] [ SAVE ] ── */}
          <Button
            size="small" variant="contained" startIcon={<DownloadIcon />}
            onClick={() => exportIncentiveExcel(data, year, month, actuals)}
            sx={{
              fontWeight: 800, borderRadius: 2, px: 2, fontSize: '11.5px',
              background: 'linear-gradient(135deg,#059669,#047857)',
              boxShadow: '0 4px 12px rgba(5,150,105,0.3)',
              textTransform: 'none',
              letterSpacing: '0.2px',
              '&:hover': { background: 'linear-gradient(135deg,#047857,#065f46)' },
            }}>
            Export Excel
          </Button>

          <Button
            size="small"
            variant="contained"
            startIcon={savingActuals ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
            onClick={handleSaveActuals}
            disabled={!isDirty || savingActuals}
            sx={{
              fontWeight: 800,
              borderRadius: 2,
              px: 2.2,
              fontSize: '11.5px',
              background: isDirty ? 'linear-gradient(135deg,#10b981,#059669)' : '#f1f5f9',
              color: isDirty ? '#fff' : '#94a3b8',
              boxShadow: isDirty ? '0 4px 12px rgba(16, 185, 129, 0.3)' : 'none',
              textTransform: 'none',
              letterSpacing: '0.3px',
              '&:hover': { background: isDirty ? 'linear-gradient(135deg,#059669,#047857)' : '#f1f5f9' },
              '&:disabled': { background: '#f1f5f9', color: '#94a3b8', border: '1px solid #e2e8f0' }
            }}>
            {savingActuals ? 'Saving…' : 'SAVE'}
          </Button>
        </Box>
      </Box>

      {/* ── Management Popover for Uploaded Excel ────────────────────────────── */}
      <Popover
        open={Boolean(excelFileAnchorEl)}
        anchorEl={excelFileAnchorEl}
        onClose={() => setExcelFileAnchorEl(null)}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'left',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'left',
        }}
        PaperProps={{
          sx: {
            p: 2,
            mt: 1,
            width: 290,
            borderRadius: 2.5,
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            border: '1px solid #e2e8f0'
          }
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 1.5 }}>
          <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: '#eff6ff', color: '#2563eb', display: 'flex' }}>
            <InsertDriveFileIcon sx={{ fontSize: 24 }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600, display: 'block', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Attached Incentive Excel
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a', wordBreak: 'break-all', fontSize: '12px', lineHeight: 1.3 }}>
              {uploadedExcelName || 'Incentive Excel'}
            </Typography>
            {uploadSummaryData && (
              <Typography variant="caption" sx={{ color: '#059669', fontWeight: 600, display: 'block', mt: 0.5, fontSize: '11px' }}>
                ✓ {uploadSummaryData.tables?.length || uploadSummaryData.tablesDetected || 0} tables parsed
              </Typography>
            )}
          </Box>
        </Box>

        <Divider sx={{ my: 1.25, borderColor: '#f1f5f9' }} />

        {pendingExcelRemoval ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography variant="caption" sx={{ color: '#dc2626', fontWeight: 600, fontSize: '11px' }}>
              Marked for removal. Click <b>SAVE</b> to persist removal to database.
            </Typography>
            <Button
              fullWidth
              size="small"
              variant="outlined"
              onClick={() => {
                setPendingExcelRemoval(false);
                setExcelFileAnchorEl(null);
              }}
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '11px',
                borderColor: '#94a3b8',
                color: '#475569'
              }}
            >
              Undo Remove
            </Button>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Button
              fullWidth
              size="small"
              variant="outlined"
              startIcon={<UploadIcon sx={{ fontSize: 16 }} />}
              onClick={() => {
                setExcelFileAnchorEl(null);
                setUploadDialogOpen(true);
              }}
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '11.5px',
                borderRadius: 1.5,
                borderColor: '#cbd5e1',
                color: '#334155',
                '&:hover': { bgcolor: '#f1f5f9' }
              }}
            >
              Replace / Re-upload Excel
            </Button>
            <Typography variant="caption" sx={{ color: '#64748b', fontSize: '10.5px' }}>
              Clicking Remove will detach this Excel in the current unsaved state. Click <b>SAVE</b> afterwards to commit.
            </Typography>
            <Button
              fullWidth
              size="small"
              variant="contained"
              color="error"
              startIcon={<DeleteOutlineIcon sx={{ fontSize: 16 }} />}
              onClick={() => {
                setPendingExcelRemoval(true);
                setExcelFileAnchorEl(null);
              }}
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '11.5px',
                borderRadius: 1.5,
                bgcolor: '#ef4444',
                '&:hover': { bgcolor: '#dc2626' }
              }}
            >
              REMOVE
            </Button>
          </Box>
        )}
      </Popover>

      {/* ── Main Table Area ──────────────────────────────────────────────── */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 2, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
        {(loadingState || fetchingRows) && (
          <Box sx={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            bgcolor: 'rgba(255,255,255,0.7)', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', zIndex: 50, gap: 2
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
          flexShrink: 0,
        }}>
          <Typography sx={{
            fontSize: '13px', fontWeight: 800, color: '#713f12',
            letterSpacing: '0.3px', textTransform: 'uppercase',
          }}>
            Qualified Vehicle Extra Freight 9.5% NVL &amp; NVCL FOR Dedicated FROM OUR CALCULATION NVL &nbsp;&nbsp; Month of {monthLabel}
          </Typography>
        </Box>

        {/* ── Table Container ──────────────────────────────────────────────── */}
        <Box sx={{
          flex: 1,
          overflow: 'auto',
          minHeight: 0,
          bgcolor: '#fff',
          border: '1px solid #cbd5e1',
          borderRadius: 1,
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          position: 'relative',
          '&::-webkit-scrollbar': { width: 8, height: 8 },
          '&::-webkit-scrollbar-thumb': { bgcolor: '#cbd5e1', borderRadius: 4 },
          '&::-webkit-scrollbar-thumb:hover': { bgcolor: '#94a3b8' }
        }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: 2200, width: '100%', fontFamily: 'inherit', fontSize: 12 }}>
            <thead>
              {/* Row 1: Top Level group headers (Height ~28px, Top: 0) */}
              <tr style={{ height: 28 }}>
                <th rowSpan={3} style={{ ...thBase, top: 0, zIndex: 30, background: '#bfdbfe', minWidth: 60 }}>TYPE</th>
                <th rowSpan={3} style={{ ...thBase, top: 0, zIndex: 30, background: '#bfdbfe', minWidth: 180 }}>Owner Name</th>
                <th rowSpan={3} style={{ ...thBase, top: 0, zIndex: 30, background: '#bfdbfe', minWidth: 120 }}>Truck No</th>
                <th rowSpan={3} style={{ ...thBase, top: 0, zIndex: 30, background: '#bfdbfe', minWidth: 70 }}>Wheel</th>
                <th rowSpan={3} style={{ ...thBase, top: 0, zIndex: 30, background: '#bfdbfe', minWidth: 60 }}>Trips</th>
                <th colSpan={12} style={{ ...thBase, top: 0, zIndex: 20, height: 28, background: '#e2e8f0', color: '#1e293b', letterSpacing: '1px' }}>PROJECTED / DEDICATED</th>
                <th colSpan={11} style={{ ...thBase, top: 0, zIndex: 20, height: 28, background: '#fed7aa', color: '#9a3412', letterSpacing: '1px' }}>ACTUAL / DEDICATED</th>
                <th rowSpan={3} style={{ ...thBase, top: 0, zIndex: 30, background: '#fbcfe8', minWidth: 90 }}>DIFFERENCE<br />(ACTUAL-PROJECTED)</th>
                <th rowSpan={3} style={{ ...thBase, top: 0, zIndex: 30, background: '#e0e7ff', minWidth: 90 }}>SETTLED AMOUNT</th>
              </tr>

              {/* Row 2: Sub-Level group headers (Height ~26px, Top: 28px) */}
              <tr style={{ height: 26 }}>
                {/* Under PROJECTED / DEDICATED */}
                <th colSpan={4} style={{ ...thBase, top: 28, zIndex: 20, height: 26, background: '#ddd6fe', color: '#4c1d95' }}>NVL</th>
                <th colSpan={4} style={{ ...thBase, top: 28, zIndex: 20, height: 26, background: '#bbf7d0', color: '#14532d' }}>NVCL</th>
                <th rowSpan={2} style={{ ...thBase, top: 28, zIndex: 20, background: '#fef9c3', minWidth: 80 }}>Total</th>
                <th rowSpan={2} style={{ ...thBase, top: 28, zIndex: 20, background: '#fef9c3', minWidth: 90 }}>10WH extra 8.5% incentive</th>
                <th rowSpan={2} style={{ ...thBase, top: 28, zIndex: 20, background: '#fef9c3', minWidth: 90 }}>6WH extra 15% incentive</th>
                <th rowSpan={2} style={{ ...thBase, top: 28, zIndex: 20, background: '#fef9c3', minWidth: 80 }}>Total (Projected)</th>

                {/* Under ACTUAL / DEDICATED */}
                <th rowSpan={2} style={{ ...thBase, top: 28, zIndex: 20, background: '#ffedd5', color: '#4c1d95', minWidth: 80, whiteSpace: 'nowrap' }}>ACTUAL NVL</th>
                <th rowSpan={2} style={{ ...thBase, top: 28, zIndex: 20, background: '#ffedd5', color: '#14532d', minWidth: 80, whiteSpace: 'nowrap' }}>ACTUAL NVCL</th>
                <th rowSpan={2} style={{ ...thBase, top: 28, zIndex: 20, background: '#fed7aa', color: '#713f12', fontWeight: 800, minWidth: 90, whiteSpace: 'nowrap' }}>SUM OF AC NVL &amp; NVCL</th>
                <th colSpan={3} style={{ ...thBase, top: 28, zIndex: 20, height: 26, background: '#fed7aa', color: '#b91c1c', fontWeight: 800, whiteSpace: 'nowrap' }}>10 WH Extra</th>
                <th colSpan={3} style={{ ...thBase, top: 28, zIndex: 20, height: 26, background: '#fed7aa', color: '#b91c1c', fontWeight: 800, whiteSpace: 'nowrap' }}>6 WH Extra</th>
                <th rowSpan={2} style={{ ...thBase, top: 28, zIndex: 20, background: '#fed7aa', color: '#9a3412', fontWeight: 900, minWidth: 85, whiteSpace: 'nowrap' }}>TOTAL ACTUAL</th>
                <th rowSpan={2} style={{ ...thBase, top: 28, zIndex: 20, background: '#fed7aa', color: '#9a3412', fontWeight: 900, minWidth: 90, whiteSpace: 'nowrap' }}>ACTUAL PAYOUT</th>
              </tr>

              {/* Row 3: Third-Level headers (Height ~38px, Top: 54px) */}
              <tr style={{ height: 38 }}>
                {/* Under PROJECTED NVL */}
                <th style={{ ...thBase, top: 54, zIndex: 20, background: '#ede9fe', fontSize: 10, minWidth: 65 }}>Sum of{'\n'}Inv Qty</th>
                <th style={{ ...thBase, top: 54, zIndex: 20, background: '#ede9fe', fontSize: 10, minWidth: 80 }}>SUM OF{'\n'}ORG Billing Amt</th>
                <th style={{ ...thBase, top: 54, zIndex: 20, background: '#ede9fe', fontSize: 10, minWidth: 75 }}>Sum of{'\n'}ORG{'\n'}FREIGHT</th>
                <th style={{ ...thBase, top: 54, zIndex: 20, background: '#ede9fe', fontSize: 10, minWidth: 70 }}>Sum of{'\n'}Amt</th>
                {/* Under PROJECTED NVCL */}
                <th style={{ ...thBase, top: 54, zIndex: 20, background: '#dcfce7', fontSize: 10, minWidth: 65 }}>Sum of{'\n'}Inv Qty</th>
                <th style={{ ...thBase, top: 54, zIndex: 20, background: '#dcfce7', fontSize: 10, minWidth: 80 }}>SUM OF{'\n'}ORG Billing Amt</th>
                <th style={{ ...thBase, top: 54, zIndex: 20, background: '#dcfce7', fontSize: 10, minWidth: 75 }}>Sum of{'\n'}ORG{'\n'}FREIGHT</th>
                <th style={{ ...thBase, top: 54, zIndex: 20, background: '#dcfce7', fontSize: 10, minWidth: 70 }}>Sum Amt</th>
                {/* Under ACTUAL 10 WH Extra */}
                <th style={{ ...thBase, top: 54, zIndex: 20, background: '#ffedd5', color: '#4c1d95', fontSize: 11, minWidth: 65 }}>NVL</th>
                <th style={{ ...thBase, top: 54, zIndex: 20, background: '#ffedd5', color: '#14532d', fontSize: 11, minWidth: 65 }}>NVCL</th>
                <th style={{ ...thBase, top: 54, zIndex: 20, background: '#ffedd5', color: '#b91c1c', fontSize: 10, fontWeight: 800, minWidth: 80, whiteSpace: 'nowrap' }}>SUM OF 10WH EXT</th>
                {/* Under ACTUAL 6 WH Extra */}
                <th style={{ ...thBase, top: 54, zIndex: 20, background: '#ffedd5', color: '#4c1d95', fontSize: 11, minWidth: 65 }}>NVL</th>
                <th style={{ ...thBase, top: 54, zIndex: 20, background: '#ffedd5', color: '#14532d', fontSize: 11, minWidth: 65 }}>NVCL</th>
                <th style={{ ...thBase, top: 54, zIndex: 20, background: '#ffedd5', color: '#b91c1c', fontSize: 10, fontWeight: 800, minWidth: 80, whiteSpace: 'nowrap' }}>SUM OF 6WH EXT</th>
              </tr>
            </thead>

            <tbody>
              {data.length === 0 && (
                <tr>
                  <td colSpan={30} style={{ ...tdBase, textAlign: 'center', padding: '40px', color: '#64748b' }}>
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
                  <td style={{ ...tdBase, textAlign: 'center', fontWeight: 800, color: t.tripsCount >= (t.normWheel === '6WH' ? 10 : 6) ? '#16a34a' : '#dc2626' }}>{t.tripsCount}</td>

                  {/* NVL */}
                  <td style={{ ...tdBase, background: 'rgba(237,233,254,0.3)' }}>{t.nvl.invQty ? Math.round(t.nvl.invQty) : ''}</td>
                  <td style={{ ...tdBase, background: 'rgba(237,233,254,0.3)' }}>{t.nvl.orgBillingAmt ? fmt(t.nvl.orgBillingAmt) : ''}</td>
                  <td style={{ ...tdBase, background: 'rgba(237,233,254,0.3)' }}>{t.nvl.orgFreight ? fmt(t.nvl.orgFreight) : ''}</td>
                  <td style={{ ...tdBase, background: 'rgba(237,233,254,0.3)' }}>{t.nvl.amt ? fmt(t.nvl.amt) : ''}</td>

                  {/* NVCL */}
                  <td style={{ ...tdBase, background: 'rgba(220,252,231,0.3)' }}>{t.nvcl.invQty ? Math.round(t.nvcl.invQty) : ''}</td>
                  <td style={{ ...tdBase, background: 'rgba(220,252,231,0.3)' }}>{t.nvcl.orgBillingAmt ? fmt(t.nvcl.orgBillingAmt) : ''}</td>
                  <td style={{ ...tdBase, background: 'rgba(220,252,231,0.3)' }}>{t.nvcl.orgFreight ? fmt(t.nvcl.orgFreight) : ''}</td>
                  <td style={{ ...tdBase, background: 'rgba(220,252,231,0.3)' }}>{t.nvcl.amt ? fmt(t.nvcl.amt) : ''}</td>

                  {/* Totals */}
                  <td style={{ ...tdBase, fontWeight: 700, background: 'rgba(254,249,195,0.4)' }}>{fmt(t.total)}</td>
                  <td style={{ ...tdBase, color: t.extra10W > 0 ? '#b91c1c' : '#94a3b8' }}>{t.extra10W ? fmt(t.extra10W) : '0'}</td>
                  <td style={{ ...tdBase, color: t.extra6W > 0 ? '#b91c1c' : '#94a3b8' }}>{t.extra6W ? fmt(t.extra6W) : '0'}</td>
                  <td style={{ ...tdBase, fontWeight: 800, color: '#0f172a', background: 'rgba(254,249,195,0.4)' }}>{fmt(t.totalFinal)}</td>

                  {/* ACTUAL / DEDICATED (6 Sub-Columns + TOTAL ACTUAL + 4 NEW COLUMNS) */}
                  {/* 1. ACTUAL NVL */}
                  <td style={{ ...tdBase, background: '#fff', padding: '2px' }}>
                    <input type="number"
                      value={getActualNVL(t.truckNo)}
                      onChange={e => updateActual(t.truckNo, 'nvl', e.target.value)}
                      style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', fontWeight: 700, fontSize: '11px', color: '#166534', padding: '4px' }}
                      placeholder="0"
                    />
                  </td>
                  {/* 2. ACTUAL NVCL */}
                  <td style={{ ...tdBase, background: '#fff', padding: '2px' }}>
                    <input type="number"
                      value={getActualNVCL(t.truckNo)}
                      onChange={e => updateActual(t.truckNo, 'nvcl', e.target.value)}
                      style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', fontWeight: 700, fontSize: '11px', color: '#166534', padding: '4px' }}
                      placeholder="0"
                    />
                  </td>
                  {/* 3. SUM OF AC NVL & NVCL (NEW) */}
                  {(() => {
                    const actNVL = num(getActualNVL(t.truckNo));
                    const actNVCL = num(getActualNVCL(t.truckNo));
                    return (
                      <td style={{ ...tdBase, fontWeight: 700, color: '#713f12', background: 'rgba(254, 215, 170, 0.3)', textAlign: 'right' }}>
                        {fmt(actNVL + actNVCL)}
                      </td>
                    );
                  })()}
                  {/* 4. 10 WH Extra -> NVL */}
                  <td style={{ ...tdBase, background: '#fff', padding: '2px' }}>
                    <input type="number"
                      value={getActual10WH_NVL(t.truckNo, t)}
                      onChange={e => updateActual(t.truckNo, 'w10_nvl', e.target.value)}
                      style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', fontWeight: 700, fontSize: '11px', color: '#b91c1c', padding: '4px' }}
                      placeholder="0"
                    />
                  </td>
                  {/* 5. 10 WH Extra -> NVCL */}
                  <td style={{ ...tdBase, background: '#fff', padding: '2px' }}>
                    <input type="number"
                      value={getActual10WH_NVCL(t.truckNo, t)}
                      onChange={e => updateActual(t.truckNo, 'w10_nvcl', e.target.value)}
                      style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', fontWeight: 700, fontSize: '11px', color: '#b91c1c', padding: '4px' }}
                      placeholder="0"
                    />
                  </td>
                  {/* 6. SUM OF 10WH EXT (NEW) */}
                  {(() => {
                    const act10_nvl = num(getActual10WH_NVL(t.truckNo, t));
                    const act10_nvcl = num(getActual10WH_NVCL(t.truckNo, t));
                    return (
                      <td style={{ ...tdBase, fontWeight: 700, color: '#b91c1c', background: 'rgba(254, 215, 170, 0.3)', textAlign: 'right' }}>
                        {fmt(act10_nvl + act10_nvcl)}
                      </td>
                    );
                  })()}
                  {/* 7. 6 WH Extra -> NVL */}
                  <td style={{ ...tdBase, background: '#fff', padding: '2px' }}>
                    <input type="number"
                      value={getActual6WH_NVL(t.truckNo, t)}
                      onChange={e => updateActual(t.truckNo, 'w6_nvl', e.target.value)}
                      style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', fontWeight: 700, fontSize: '11px', color: '#b91c1c', padding: '4px' }}
                      placeholder="0"
                    />
                  </td>
                  {/* 8. 6 WH Extra -> NVCL */}
                  <td style={{ ...tdBase, background: '#fff', padding: '2px' }}>
                    <input type="number"
                      value={getActual6WH_NVCL(t.truckNo, t)}
                      onChange={e => updateActual(t.truckNo, 'w6_nvcl', e.target.value)}
                      style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', fontWeight: 700, fontSize: '11px', color: '#b91c1c', padding: '4px' }}
                      placeholder="0"
                    />
                  </td>
                  {/* 9. SUM OF 6WH EXT (NEW) */}
                  {(() => {
                    const act6_nvl = num(getActual6WH_NVL(t.truckNo, t));
                    const act6_nvcl = num(getActual6WH_NVCL(t.truckNo, t));
                    return (
                      <td style={{ ...tdBase, fontWeight: 700, color: '#b91c1c', background: 'rgba(254, 215, 170, 0.3)', textAlign: 'right' }}>
                        {fmt(act6_nvl + act6_nvcl)}
                      </td>
                    );
                  })()}

                  {(() => {
                    const totalAct = getTotalActual(t.truckNo, t);
                    const actPayout = getActualPayout(t.truckNo, t);
                    const totalProj = num(t.totalFinal);
                    const diffVal = totalProj - totalAct;
                    const settledVal = (totalAct > 0 && totalAct > t.totalFinal) ? t.totalFinal : (totalAct > 0 ? totalAct : 0);
                    return (
                      <>
                        {/* 10. TOTAL ACTUAL */}
                        <td style={{ ...tdBase, fontWeight: 800, color: '#9a3412', background: 'rgba(254, 215, 170, 0.45)', textAlign: 'right' }}>
                          {fmt(totalAct)}
                        </td>
                        {/* 11. ACTUAL PAYOUT (NEW) */}
                        <td style={{ ...tdBase, fontWeight: 900, color: '#9a3412', background: 'rgba(254, 215, 170, 0.55)', textAlign: 'right' }}>
                          {fmt(actPayout, 2)}
                        </td>
                        {/* DIFFERENCE (ACTUAL - PROJECTED) */}
                        <td style={{ ...tdBase, fontWeight: 800, color: diffVal < 0 ? '#b91c1c' : (diffVal > 0 ? '#047857' : '#64748b'), background: 'rgba(251,207,232,0.3)', textAlign: 'right' }}>
                          {fmt(diffVal)}
                        </td>
                        {/* SETTLED AMOUNT */}
                        <td style={{ ...tdBase, fontWeight: 800, color: '#4338ca', background: 'rgba(224,231,255,0.4)', textAlign: 'right' }}>
                          {fmt(settledVal)}
                        </td>
                      </>
                    );
                  })()}
                </tr>
              ))}

              {/* Totals footer row */}
              {data.length > 0 && (() => {
                let totalActualNVL = 0;
                let totalActualNVCL = 0;
                let totalActualSumAc = 0;
                let totalActual10WH_NVL = 0;
                let totalActual10WH_NVCL = 0;
                let totalActualSum10W = 0;
                let totalActual6WH_NVL = 0;
                let totalActual6WH_NVCL = 0;
                let totalActualSum6W = 0;
                let grandTotalActual = 0;
                let grandActualPayout = 0;
                let totalDiff = 0;
                let totalSettled = 0;
                data.forEach(t => {
                  const actNVL = num(getActualNVL(t.truckNo));
                  const actNVCL = num(getActualNVCL(t.truckNo));
                  const sumAc = actNVL + actNVCL;
                  const act10WH_NVL = num(getActual10WH_NVL(t.truckNo, t));
                  const act10WH_NVCL = num(getActual10WH_NVCL(t.truckNo, t));
                  const sum10W = act10WH_NVL + act10WH_NVCL;
                  const act6WH_NVL = num(getActual6WH_NVL(t.truckNo, t));
                  const act6WH_NVCL = num(getActual6WH_NVCL(t.truckNo, t));
                  const sum6W = act6WH_NVL + act6WH_NVCL;
                  const totalAct = actNVL + actNVCL + act10WH_NVL + act10WH_NVCL + act6WH_NVL + act6WH_NVCL;
                  const actPayout = getActualPayout(t.truckNo, t);

                  totalActualNVL += actNVL;
                  totalActualNVCL += actNVCL;
                  totalActualSumAc += sumAc;
                  totalActual10WH_NVL += act10WH_NVL;
                  totalActual10WH_NVCL += act10WH_NVCL;
                  totalActualSum10W += sum10W;
                  totalActual6WH_NVL += act6WH_NVL;
                  totalActual6WH_NVCL += act6WH_NVCL;
                  totalActualSum6W += sum6W;
                  grandTotalActual += totalAct;
                  grandActualPayout += actPayout;

                  const totalProj = num(t.totalFinal);
                  const diffVal = totalProj - totalAct;
                  const settledVal = (totalAct > 0 && totalAct > t.totalFinal) ? t.totalFinal : (totalAct > 0 ? totalAct : 0);

                  totalDiff += diffVal;
                  totalSettled += settledVal;
                });
                return (
                  <tr style={{ background: '#e2e8f0', borderTop: '2px solid #475569', position: 'sticky', bottom: 0, zIndex: 15 }}>
                    <td colSpan={5} style={{ ...tdBase, position: 'sticky', bottom: 0, zIndex: 15, textAlign: 'center', fontWeight: 900, color: '#0f172a', background: '#e2e8f0' }}>TOTALS</td>
                    {/* NVL totals */}
                    <td style={{ ...tdBase, position: 'sticky', bottom: 0, zIndex: 15, fontWeight: 800, background: '#ede9fe' }}>{Math.round(totals.nvlQty).toLocaleString('en-IN')}</td>
                    <td style={{ ...tdBase, position: 'sticky', bottom: 0, zIndex: 15, fontWeight: 800, background: '#ede9fe' }}>{fmt(totals.nvlBillingAmt)}</td>
                    <td style={{ ...tdBase, position: 'sticky', bottom: 0, zIndex: 15, fontWeight: 800, background: '#ede9fe' }}>{fmt(totals.nvlFreight)}</td>
                    <td style={{ ...tdBase, position: 'sticky', bottom: 0, zIndex: 15, fontWeight: 800, background: '#ede9fe' }}>{fmt(totals.nvlAmt)}</td>
                    {/* NVCL totals */}
                    <td style={{ ...tdBase, position: 'sticky', bottom: 0, zIndex: 15, fontWeight: 800, background: '#dcfce7' }}>{Math.round(totals.nvclQty).toLocaleString('en-IN')}</td>
                    <td style={{ ...tdBase, position: 'sticky', bottom: 0, zIndex: 15, fontWeight: 800, background: '#dcfce7' }}>{fmt(totals.nvclBillingAmt)}</td>
                    <td style={{ ...tdBase, position: 'sticky', bottom: 0, zIndex: 15, fontWeight: 800, background: '#dcfce7' }}>{fmt(totals.nvclFreight)}</td>
                    <td style={{ ...tdBase, position: 'sticky', bottom: 0, zIndex: 15, fontWeight: 800, background: '#dcfce7' }}>{fmt(totals.nvclAmt)}</td>
                    {/* Grand totals */}
                    <td style={{ ...tdBase, position: 'sticky', bottom: 0, zIndex: 15, fontWeight: 900, background: '#fef08a', color: '#713f12' }}>{fmt(totals.total)}</td>
                    <td style={{ ...tdBase, position: 'sticky', bottom: 0, zIndex: 15, fontWeight: 800, background: '#f1f5f9' }}>{fmt(totals.extra10W)}</td>
                    <td style={{ ...tdBase, position: 'sticky', bottom: 0, zIndex: 15, fontWeight: 800, background: '#f1f5f9' }}>{fmt(totals.extra6W)}</td>
                    <td style={{ ...tdBase, position: 'sticky', bottom: 0, zIndex: 15, fontWeight: 900, fontSize: 13, color: '#0f172a', background: '#fef9c3' }}>{fmt(totals.grand)}</td>
                    {/* ACTUAL / DEDICATED totals (11 columns) */}
                    <td style={{ ...tdBase, position: 'sticky', bottom: 0, zIndex: 15, fontWeight: 800, background: '#fed7aa', color: '#9a3412' }}>{fmt(totalActualNVL)}</td>
                    <td style={{ ...tdBase, position: 'sticky', bottom: 0, zIndex: 15, fontWeight: 800, background: '#fed7aa', color: '#9a3412' }}>{fmt(totalActualNVCL)}</td>
                    <td style={{ ...tdBase, position: 'sticky', bottom: 0, zIndex: 15, fontWeight: 800, background: '#fed7aa', color: '#713f12' }}>{fmt(totalActualSumAc)}</td>
                    <td style={{ ...tdBase, position: 'sticky', bottom: 0, zIndex: 15, fontWeight: 800, background: '#fed7aa', color: '#9a3412' }}>{fmt(totalActual10WH_NVL)}</td>
                    <td style={{ ...tdBase, position: 'sticky', bottom: 0, zIndex: 15, fontWeight: 800, background: '#fed7aa', color: '#9a3412' }}>{fmt(totalActual10WH_NVCL)}</td>
                    <td style={{ ...tdBase, position: 'sticky', bottom: 0, zIndex: 15, fontWeight: 800, background: '#fed7aa', color: '#b91c1c' }}>{fmt(totalActualSum10W)}</td>
                    <td style={{ ...tdBase, position: 'sticky', bottom: 0, zIndex: 15, fontWeight: 800, background: '#fed7aa', color: '#9a3412' }}>{fmt(totalActual6WH_NVL)}</td>
                    <td style={{ ...tdBase, position: 'sticky', bottom: 0, zIndex: 15, fontWeight: 800, background: '#fed7aa', color: '#9a3412' }}>{fmt(totalActual6WH_NVCL)}</td>
                    <td style={{ ...tdBase, position: 'sticky', bottom: 0, zIndex: 15, fontWeight: 800, background: '#fed7aa', color: '#b91c1c' }}>{fmt(totalActualSum6W)}</td>
                    <td style={{ ...tdBase, position: 'sticky', bottom: 0, zIndex: 15, fontWeight: 900, background: '#fed7aa', color: '#9a3412' }}>{fmt(grandTotalActual)}</td>
                    <td style={{ ...tdBase, position: 'sticky', bottom: 0, zIndex: 15, fontWeight: 900, background: '#fed7aa', color: '#9a3412' }}>{fmt(grandActualPayout, 2)}</td>
                    <td style={{ ...tdBase, position: 'sticky', bottom: 0, zIndex: 15, fontWeight: 900, fontSize: 13, color: totalDiff < 0 ? '#b91c1c' : (totalDiff > 0 ? '#047857' : '#64748b'), background: '#fbcfe8' }}>{fmt(totalDiff)}</td>
                    <td style={{ ...tdBase, position: 'sticky', bottom: 0, zIndex: 15, fontWeight: 900, fontSize: 13, color: '#312e81', background: '#e0e7ff' }}>{fmt(totalSettled)}</td>
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
              <Box sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 2, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#1e293b' }}>PDF Preview</Typography>
                  <Button size="small" color="error" onClick={() => setUploadedPdfUrl(null)}>Close</Button>
                </Box>
                <iframe src={uploadedPdfUrl} width="100%" height="600px" style={{ border: 'none', borderRadius: '4px' }} title="PDF Preview" />
              </Box>
            )}

            {uploadedExcelData && (
              <Box sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 2, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
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

      {/* ── Excel Import Summary Modal ── */}
      <Dialog
        open={uploadSummaryModalOpen}
        onClose={() => setUploadSummaryModalOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            bgcolor: 'background.paper',
            boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
            overflow: 'hidden'
          }
        }}
      >
        <DialogTitle
          sx={{
            fontWeight: 800,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid #e2e8f0',
            bgcolor: '#f8fafc',
            py: 2,
            px: 3
          }}
        >
          <Box display="flex" alignItems="center" gap={1.5}>
            <Box sx={{ width: 10, height: 10, bgcolor: '#10b981', borderRadius: '50%' }} />
            <Typography variant="h6" fontWeight={800} color="#0f172a">
              Incentive Excel Import Summary
            </Typography>
            {uploadSummaryData?.detectedFY && (
              <Chip
                label={`${uploadSummaryData.detectedMonthIndex !== null ? MONTH_NAMES[uploadSummaryData.detectedMonthIndex] : ''} ${uploadSummaryData.detectedCalendarYear || ''} (${uploadSummaryData.detectedFY})`}
                size="small"
                sx={{ fontWeight: 800, bgcolor: '#ede9fe', color: '#6d28d9', fontSize: '11px' }}
              />
            )}
          </Box>
          <Button size="small" variant="outlined" onClick={() => setUploadSummaryModalOpen(false)} sx={{ fontWeight: 700 }}>
            Close
          </Button>
        </DialogTitle>

        <DialogContent sx={{ p: 3, bgcolor: 'background.default' }}>
          {uploadSummaryData && (
            <Box display="flex" flexDirection="column" gap={2.5}>
              {/* Stat Metric Cards */}
              <Box display="grid" gridTemplateColumns="repeat(auto-fit, minmax(130px, 1fr))" gap={1.5}>
                <Box sx={{ p: 2, borderRadius: 2, bgcolor: '#eff6ff', border: '1px solid #dbeafe', textAlign: 'center' }}>
                  <Typography variant="caption" fontWeight={700} color="#1e40af" textTransform="uppercase">Tables Detected</Typography>
                  <Typography variant="h5" fontWeight={900} color="#1d4ed8" mt={0.5}>{uploadSummaryData.tables?.length || 0}</Typography>
                </Box>
                <Box sx={{ p: 2, borderRadius: 2, bgcolor: '#f5f3ff', border: '1px solid #ede9fe', textAlign: 'center' }}>
                  <Typography variant="caption" fontWeight={700} color="#5b21b6" textTransform="uppercase">Extracted Rows</Typography>
                  <Typography variant="h5" fontWeight={900} color="#6d28d9" mt={0.5}>{uploadSummaryData.totalRows || 0}</Typography>
                </Box>
                <Box sx={{ p: 2, borderRadius: 2, bgcolor: '#f0fdf4', border: '1px solid #dcfce7', textAlign: 'center' }}>
                  <Typography variant="caption" fontWeight={700} color="#166534" textTransform="uppercase">Matched Vehicles</Typography>
                  <Typography variant="h5" fontWeight={900} color="#15803d" mt={0.5}>{uploadSummaryData.matchedCount || 0}</Typography>
                </Box>
                <Box sx={{ p: 2, borderRadius: 2, bgcolor: uploadSummaryData.unmatchedCount > 0 ? '#fff7ed' : '#f8fafc', border: '1px solid #fed7aa', textAlign: 'center' }}>
                  <Typography variant="caption" fontWeight={700} color="#c2410c" textTransform="uppercase">Unmatched</Typography>
                  <Typography variant="h5" fontWeight={900} color="#ea580c" mt={0.5}>{uploadSummaryData.unmatchedCount || 0}</Typography>
                </Box>
                <Box sx={{ p: 2, borderRadius: 2, bgcolor: '#fefce8', border: '1px solid #fef08a', textAlign: 'center' }}>
                  <Typography variant="caption" fontWeight={700} color="#854d0e" textTransform="uppercase">Total Amount</Typography>
                  <Typography variant="h6" fontWeight={900} color="#a16207" mt={0.5}>₹{Math.round(uploadSummaryData.totalAmount || 0).toLocaleString('en-IN')}</Typography>
                </Box>
              </Box>

              {/* Detected Tables Breakdown */}
              <Box sx={{ bgcolor: 'background.paper', p: 2, borderRadius: 2, border: '1px solid #e2e8f0' }}>
                <Typography variant="subtitle2" fontWeight={800} color="#0f172a" mb={1.5}>
                  Detected Tables & Destination Columns
                </Typography>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 700, color: '#475569' }}>#</th>
                      <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 700, color: '#475569' }}>Category / Headline Detected</th>
                      <th style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 700, color: '#475569' }}>Destination Column</th>
                      <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 700, color: '#475569' }}>Rows</th>
                      <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 700, color: '#475569' }}>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploadSummaryData.tables?.map((tbl, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 600, color: '#64748b' }}>{idx + 1}</td>
                        <td style={{ padding: '8px 12px', fontWeight: 700, color: '#0f172a' }}>{tbl.headline || tbl.category}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <Chip
                            label={`ACTUAL / DEDICATED → ${tbl.targetField === 'w10' ? '10 WH Extra' : tbl.targetField === 'w6' ? '6 WH Extra' : tbl.targetField === 'nvl' ? 'ACTUAL NVL' : 'ACTUAL NVCL'}${tbl.subField ? ` (${tbl.subField.includes('nvl') ? 'NVL' : 'NVCL'})` : ''}`}
                            size="small"
                            sx={{ fontWeight: 700, fontSize: '10px', bgcolor: tbl.targetField === 'nvl' ? '#ede9fe' : tbl.targetField === 'nvcl' ? '#dcfce7' : '#ffedd5', color: '#0f172a' }}
                          />
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>{tbl.rowCount}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: '#047857' }}>
                          ₹{tbl.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Box>

              {/* Unmatched Records Alert */}
              {uploadSummaryData.unmatchedCount > 0 && (
                <Alert severity="warning" sx={{ fontWeight: 600, borderRadius: 2 }}>
                  <Typography variant="body2" fontWeight={700}>
                    {uploadSummaryData.unmatchedCount} vehicles in the Excel were not found in this month's Cement Register trips:
                  </Typography>
                  <Box display="flex" flexWrap="wrap" gap={0.8} mt={1}>
                    {uploadSummaryData.unmatchedTrucks?.map((u, i) => (
                      <Chip
                        key={i}
                        label={`${u.truckNo} (₹${u.records?.reduce((s, r) => s + r.amount, 0)?.toFixed(2) || 0})`}
                        size="small"
                        sx={{ bgcolor: '#fff', border: '1px solid #fcd34d', fontWeight: 700, fontSize: '10.5px' }}
                      />
                    ))}
                  </Box>
                </Alert>
              )}
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ p: 2, px: 3, bgcolor: '#f8fafc', borderTop: '1px solid #e2e8f0', justifyContent: 'space-between' }}>
          <Button
            variant="outlined"
            startIcon={<CompareArrowsIcon />}
            onClick={() => {
              setUploadSummaryModalOpen(false);
              setComparisonModalOpen(true);
            }}
            sx={{ fontWeight: 700, textTransform: 'none' }}
          >
            Open Comparison View
          </Button>
          <Button
            variant="contained"
            onClick={() => setUploadSummaryModalOpen(false)}
            sx={{
              fontWeight: 800,
              background: 'linear-gradient(135deg, #10b981, #059669)',
              color: '#fff',
              px: 3,
              textTransform: 'none'
            }}
          >
            Done & View Sheet
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Comparison Modal ── */}
      <Dialog open={comparisonModalOpen} onClose={() => setComparisonModalOpen(false)} maxWidth="xl" fullWidth PaperProps={{ sx: { height: '95vh', bgcolor: 'background.default', m: 2 } }}>
        <DialogTitle sx={{ fontWeight: 800, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', bgcolor: 'background.paper' }}>
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
        <DialogContent sx={{ p: 0, bgcolor: 'background.default', display: 'flex', flexDirection: 'column', height: '100%' }}>
          {uploadedExcelData ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              {/* ── Summary Dashboard Bar ── */}
              <Box sx={{
                display: 'flex', gap: 2, p: 2, bgcolor: 'background.paper', borderBottom: '1px solid #e2e8f0',
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
                <Box sx={{ flex: '1 1 48%', display: 'flex', flexDirection: 'column', bgcolor: 'background.paper', borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                  <Box sx={{ p: 1.5, bgcolor: 'background.default', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
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
                <Box sx={{ flex: '1 1 48%', display: 'flex', flexDirection: 'column', bgcolor: 'background.paper', borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                  <Box sx={{ p: 1.5, bgcolor: 'background.default', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
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
              <Box sx={{ width: '45%', borderRight: '2px solid #cbd5e1', height: '100%', bgcolor: 'background.paper' }}>
                <iframe src={uploadedPdfUrl} width="100%" height="100%" style={{ border: 'none' }} title="Client PDF Mail" />
              </Box>
              <Box sx={{ width: '55%', height: '100%', overflow: 'auto', p: 2, bgcolor: 'background.default' }}>
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
                <Box sx={{ mt: 3, p: 3, bgcolor: 'background.paper', borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
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
            bgcolor: 'background.paper', borderRadius: 3, p: 4, maxWidth: 420, width: '90%',
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

      {/* ── Redesigned Upload Incentive Excel Dialog ── */}
      <UploadIncentiveExcelDialog
        open={uploadDialogOpen}
        onClose={() => setUploadDialogOpen(false)}
        initialMonth={month}
        initialYear={year}
        years={years || [2024, 2025, 2026, 2027, 2028]}
        systemVehicles={data}
        onConfirmImport={handleConfirmExcelImport}
      />
    </Box>
  );
}
