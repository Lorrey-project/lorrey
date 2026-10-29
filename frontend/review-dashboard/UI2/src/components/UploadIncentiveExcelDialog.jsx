import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Button,
  Select,
  MenuItem,
  Radio,
  RadioGroup,
  FormControlLabel,
  Alert,
  Chip,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Paper,
  Tooltip,
  CircularProgress,
  IconButton
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function normVeh(val) {
  if (!val) return '';
  return String(val).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

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

export function findCanonicalSystemTruck(excelTruck, systemTrucks = []) {
  if (!excelTruck || !systemTrucks) return excelTruck;
  const match = systemTrucks.find(st => matchVehicleRegistration(st.truckNo || st['Truck No'], excelTruck));
  return match ? (match.truckNo || match['Truck No']) : excelTruck;
}

function parseExcelNum(val) {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const cleaned = String(val).replace(/,/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

export function parseHeadlineInfo(headlineText) {
  if (!headlineText || typeof headlineText !== 'string') return null;
  const raw = String(headlineText).trim();
  const text = raw.replace(/\u00a0/g, ' ').toLowerCase().replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ');
  const compactText = text.replace(/[\s\-_]/g, '');

  // 1. Identify NVCL vs NVL
  const isNVCL = text.includes('nvcl') || text.includes('market') || /\bmkt\b/i.test(text);
  const isNVL = (text.includes('nvl') || /\batoa?\b/i.test(text) || text.includes('plant') || text.includes('9214')) && !isNVCL;

  const isSiteKeyword = isNVCL || isNVL || text.includes('dispatch') || text.includes('wb so') || text.includes('so of') || text.includes('plant') || text.includes('9214');

  // 2. Identify Wheel / Incentive Type
  const is10W = compactText.includes('10wh') ||
                compactText.includes('10w') ||
                compactText.includes('10wheel') ||
                text.includes('8.5%') ||
                text.includes('8.5 %') ||
                text.includes('8.5');

  const is6W = compactText.includes('6wh') ||
               compactText.includes('6w') ||
               compactText.includes('6wheel') ||
               text.includes('15%') ||
               text.includes('15 %') ||
               text.includes('15');

  const isDedicatedKeyword = text.includes('dedicated') ||
                             text.includes('dedi') ||
                             text.includes('qualified') ||
                             text.includes('extra freight') ||
                             text.includes('freight') ||
                             text.includes('9.5%') ||
                             text.includes('9.5 %') ||
                             text.includes('9.5');

  if (!((isDedicatedKeyword || is10W || is6W) && (isSiteKeyword || text.includes('incentive') || text.includes('freight')))) {
    return null;
  }

  let category = '';
  let targetField = '';
  let subField = '';

  if (is10W) {
    targetField = 'w10';
    if (isNVCL) {
      category = '10 WH 8.5% NVCL';
      subField = 'w10_nvcl';
    } else {
      category = '10 WH 8.5% NVL';
      subField = 'w10_nvl';
    }
  } else if (is6W) {
    targetField = 'w6';
    if (isNVCL) {
      category = 'Extra Freight 15% 6 WH NVCL';
      subField = 'w6_nvcl';
    } else {
      category = 'Extra Freight 15% 6 WH NVL';
      subField = 'w6_nvl';
    }
  } else if (isNVCL) {
    category = 'Dedicated Freight 9.5% of NVCL';
    targetField = 'nvcl';
    subField = 'nvcl';
  } else if (isNVL || isDedicatedKeyword) {
    category = 'Dedicated Freight 9.5% of NVL';
    targetField = 'nvl';
    subField = 'nvl';
  } else {
    return null;
  }

  // Extract Month & Year from headline
  let detectedMonthIndex = null;
  let detectedCalendarYear = null;
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
      if (yNum < 100) yNum += 2000;
      detectedCalendarYear = yNum;
    }
  }

  return {
    rawHeadline: raw,
    category,
    targetField,
    subField,
    detectedMonthIndex,
    detectedCalendarYear
  };
}

export function detectWorkbookPeriod(wb, fileName = '') {
  let detectedMonthIndex = null;
  let detectedCalendarYear = null;

  const monthRegex = /(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember))[\s'_/-]*(\d{2,4})/i;
  const mIdxMap = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  };

  // 1. Check sheet names
  if (wb && wb.SheetNames) {
    for (const s of wb.SheetNames) {
      const m = s.match(monthRegex);
      if (m) {
        detectedMonthIndex = mIdxMap[m[1].toLowerCase().slice(0, 3)];
        let y = parseInt(m[2], 10);
        detectedCalendarYear = y < 100 ? 2000 + y : y;
        break;
      }
    }
  }

  // 2. Check file name
  if (detectedMonthIndex === null && fileName) {
    const m = fileName.match(monthRegex);
    if (m) {
      detectedMonthIndex = mIdxMap[m[1].toLowerCase().slice(0, 3)];
      let y = parseInt(m[2], 10);
      detectedCalendarYear = y < 100 ? 2000 + y : y;
    }
  }

  return { detectedMonthIndex, detectedCalendarYear };
}

export function parseIncentiveSheetData(aoa, systemTrucks = []) {
  if (!aoa || aoa.length === 0) return null;

  // Build canonical system vehicle map
  const systemTruckMap = new Map();
  (systemTrucks || []).forEach(t => {
    const rawNo = t.truckNo || t['Truck No'];
    const norm = normVeh(rawNo);
    if (norm) systemTruckMap.set(norm, rawNo);
  });
  const systemTruckSet = new Set(systemTruckMap.keys());

  const tables = [];
  const normalizedRecords = [];
  const multipleEntries = [];

  let r = 0;
  let hasHeadlines = false;

  while (r < aoa.length) {
    const row = aoa[r];
    if (!row || row.length === 0) { r++; continue; }

    let headlineInfo = null;
    for (let c = 0; c < row.length; c++) {
      if (typeof row[c] === 'string' && row[c].trim().length > 4) {
        headlineInfo = parseHeadlineInfo(row[c]);
        if (headlineInfo) break;
      }
    }

    if (headlineInfo) {
      hasHeadlines = true;
      let truckCol = -1;
      let diffCol = -1;
      let hr = r + 1;

      while (hr < Math.min(r + 6, aoa.length)) {
        const hRow = aoa[hr];
        if (hRow) {
          hRow.forEach((cell, idx) => {
            const s = String(cell || '').toLowerCase().trim();
            if (s.includes('truck') || s.includes('vehicle') || s.includes('lorry')) truckCol = idx;
            if (s.includes('diff') || s.includes('difference') || s.includes('dedi') || s.includes('amount') || s.includes('amt') || s.includes('freight')) {
              if (s.includes('diff') || s.includes('difference')) diffCol = idx;
              else if (diffCol === -1) diffCol = idx;
            }
          });
          if (truckCol !== -1 && diffCol !== -1) break;
        }
        hr++;
      }

      if (truckCol === -1) truckCol = 0;
      if (diffCol === -1) diffCol = 1;

      let cr = hr + 1;
      const tableRecords = [];

      while (cr < aoa.length) {
        const cRow = aoa[cr];
        if (!cRow || cRow.length === 0) { cr++; continue; }
        const isNextHead = cRow.some(cell => typeof cell === 'string' && parseHeadlineInfo(cell));
        if (isNextHead) break;
        const s0 = String(cRow[0] || '').toLowerCase().trim();
        if (s0.startsWith('total') || s0.includes('total') || s0.startsWith('grand total')) { cr++; break; }

        const rawTruck = cRow[truckCol];
        const cleanTruck = normVeh(rawTruck);
        if (cleanTruck && cleanTruck.length >= 4) {
          const amt = parseExcelNum(cRow[diffCol]);
          const canonicalTruckNo = systemTruckMap.get(cleanTruck) || cleanTruck;
          const isMatched = systemTruckSet.size === 0 || systemTruckSet.has(cleanTruck);

          // Check if this vehicle already exists in this table (aggregate rule)
          const existingInTable = tableRecords.find(tr => tr.truckNo === canonicalTruckNo);
          if (existingInTable) {
            existingInTable.amount += amt;
            existingInTable.differenceAmount += amt;
            multipleEntries.push({
              truckNo: canonicalTruckNo,
              category: headlineInfo.category,
              addedAmount: amt,
              newTotal: existingInTable.amount,
              rowIdx: cr + 1
            });
          } else {
            tableRecords.push({
              truckNo: canonicalTruckNo,
              rawTruckNo: String(rawTruck).trim(),
              category: headlineInfo.category,
              targetField: headlineInfo.targetField,
              subField: headlineInfo.subField,
              differenceAmount: amt,
              amount: amt,
              rowIdx: cr + 1,
              isMatched
            });
          }

          normalizedRecords.push({
            truckNo: canonicalTruckNo,
            rawTruckNo: String(rawTruck).trim(),
            category: headlineInfo.category,
            targetField: headlineInfo.targetField,
            subField: headlineInfo.subField,
            differenceAmount: amt,
            amount: amt,
            rowIdx: cr + 1,
            isMatched
          });
        }
        cr++;
      }

      tables.push({
        headline: headlineInfo.category,
        targetField: headlineInfo.targetField,
        subField: headlineInfo.subField,
        rowCount: tableRecords.length,
        totalAmount: tableRecords.reduce((s, rec) => s + rec.amount, 0),
        records: tableRecords
      });
      r = cr - 1;
    }
    r++;
  }

  // Fallback: If no section headlines were detected, parse as single table
  if (!hasHeadlines) {
    let truckCol = -1;
    let diffCol = -1;
    let headerRowIdx = -1;

    for (let idx = 0; idx < Math.min(10, aoa.length); idx++) {
      const row = aoa[idx];
      if (!row) continue;
      row.forEach((cell, cIdx) => {
        const s = String(cell || '').toLowerCase().trim();
        if (s.includes('truck') || s.includes('vehicle') || s.includes('lorry')) truckCol = cIdx;
        if (s.includes('diff') || s.includes('difference') || s.includes('dedi') || s.includes('amount') || s.includes('amt')) {
          if (s.includes('diff') || s.includes('difference')) diffCol = cIdx;
          else if (diffCol === -1) diffCol = cIdx;
        }
      });
      if (truckCol !== -1 && diffCol !== -1) {
        headerRowIdx = idx;
        break;
      }
    }

    if (truckCol === -1) truckCol = 0;
    if (diffCol === -1) diffCol = 1;
    if (headerRowIdx === -1) headerRowIdx = 0;

    const tableRecords = [];

    for (let cr = headerRowIdx + 1; cr < aoa.length; cr++) {
      const cRow = aoa[cr];
      if (!cRow || cRow.length === 0) continue;
      const s0 = String(cRow[0] || '').toLowerCase().trim();
      if (s0.startsWith('total') || s0.includes('total')) break;

      const rawTruck = cRow[truckCol];
      const cleanTruck = normVeh(rawTruck);
      if (cleanTruck && cleanTruck.length >= 4) {
        const amt = parseExcelNum(cRow[diffCol]);
        const canonicalTruckNo = systemTruckMap.get(cleanTruck) || cleanTruck;
        const isMatched = systemTruckSet.size === 0 || systemTruckSet.has(cleanTruck);

        const existingInTable = tableRecords.find(tr => tr.truckNo === canonicalTruckNo);
        if (existingInTable) {
          existingInTable.amount += amt;
          existingInTable.differenceAmount += amt;
          multipleEntries.push({
            truckNo: canonicalTruckNo,
            category: 'General Incentive Difference',
            addedAmount: amt,
            newTotal: existingInTable.amount,
            rowIdx: cr + 1
          });
        } else {
          tableRecords.push({
            truckNo: canonicalTruckNo,
            rawTruckNo: String(rawTruck).trim(),
            category: 'General Incentive Difference',
            targetField: 'diff',
            subField: '',
            differenceAmount: amt,
            amount: amt,
            rowIdx: cr + 1,
            isMatched
          });
        }

        normalizedRecords.push({
          truckNo: canonicalTruckNo,
          rawTruckNo: String(rawTruck).trim(),
          category: 'General Incentive Difference',
          targetField: 'diff',
          subField: '',
          differenceAmount: amt,
          amount: amt,
          rowIdx: cr + 1,
          isMatched
        });
      }
    }

    if (tableRecords.length > 0) {
      tables.push({
        headline: 'General Incentive Difference',
        targetField: 'diff',
        subField: '',
        rowCount: tableRecords.length,
        totalAmount: tableRecords.reduce((s, rec) => s + rec.amount, 0),
        records: tableRecords
      });
    }
  }

  // Construct actuals map with difference field & 6 distinct sub-columns
  const actuals = {};
  const truckDiffs = {};
  const truckBreakdowns = {};

  normalizedRecords.forEach(rec => {
    const t = rec.truckNo;
    truckDiffs[t] = (truckDiffs[t] || 0) + rec.differenceAmount;
    if (!truckBreakdowns[t]) truckBreakdowns[t] = [];
    truckBreakdowns[t].push({
      category: rec.category,
      targetField: rec.targetField,
      subField: rec.subField,
      amount: rec.differenceAmount
    });
  });

  for (const [t, totalDiff] of Object.entries(truckDiffs)) {
    const bds = truckBreakdowns[t] || [];
    let actNvl = 0;
    let actNvcl = 0;
    let actW10Nvl = 0;
    let actW10Nvcl = 0;
    let actW6Nvl = 0;
    let actW6Nvcl = 0;
    let hasNvl = false;
    let hasNvcl = false;
    let hasW10Nvl = false;
    let hasW10Nvcl = false;
    let hasW6Nvl = false;
    let hasW6Nvcl = false;

    bds.forEach(b => {
      const amt = Number(b.amount) || 0;
      if (b.subField === 'w10_nvl') { actW10Nvl += amt; hasW10Nvl = true; }
      else if (b.subField === 'w10_nvcl') { actW10Nvcl += amt; hasW10Nvcl = true; }
      else if (b.subField === 'w6_nvl') { actW6Nvl += amt; hasW6Nvl = true; }
      else if (b.subField === 'w6_nvcl') { actW6Nvcl += amt; hasW6Nvcl = true; }
      else if (b.subField === 'nvl' || b.targetField === 'nvl') { actNvl += amt; hasNvl = true; }
      else if (b.subField === 'nvcl' || b.targetField === 'nvcl') { actNvcl += amt; hasNvcl = true; }
    });

    const sumW10 = (hasW10Nvl ? actW10Nvl : 0) + (hasW10Nvcl ? actW10Nvcl : 0);
    const sumW6 = (hasW6Nvl ? actW6Nvl : 0) + (hasW6Nvcl ? actW6Nvcl : 0);

    const canonicalKey = findCanonicalSystemTruck(t, systemTrucks);
    const entryData = {
      nvl: hasNvl ? String(actNvl) : '0',
      nvcl: hasNvcl ? String(actNvcl) : '0',
      w10_nvl: hasW10Nvl ? String(actW10Nvl) : '0',
      w10_nvcl: hasW10Nvcl ? String(actW10Nvcl) : '0',
      w6_nvl: hasW6Nvl ? String(actW6Nvl) : '0',
      w6_nvcl: hasW6Nvcl ? String(actW6Nvcl) : '0',
      w10: sumW10 ? String(sumW10) : '0',
      w6: sumW6 ? String(sumW6) : '0',
      difference: totalDiff,
      diffBreakdown: bds
    };
    actuals[t] = entryData;
    if (canonicalKey && canonicalKey !== t) {
      actuals[canonicalKey] = entryData;
    }
  }

  // Zero Value Rule: Pre-populate system vehicles that had no entries in Excel with '0'
  (systemTrucks || []).forEach(st => {
    const rawNo = st.truckNo || st['Truck No'];
    if (rawNo && !actuals[rawNo]) {
      actuals[rawNo] = {
        nvl: '0',
        nvcl: '0',
        w10_nvl: '0',
        w10_nvcl: '0',
        w6_nvl: '0',
        w6_nvcl: '0',
        w10: '0',
        w6: '0',
        difference: 0,
        diffBreakdown: []
      };
    }
  });

  const uniqueTruckList = Object.keys(truckDiffs);
  const matchedTrucks = (systemTrucks && systemTrucks.length > 0)
    ? uniqueTruckList.filter(t => systemTrucks.some(st => matchVehicleRegistration(st.truckNo || st['Truck No'], t)))
    : uniqueTruckList;
  const unmatchedTrucks = (systemTrucks && systemTrucks.length > 0)
    ? uniqueTruckList.filter(t => !systemTrucks.some(st => matchVehicleRegistration(st.truckNo || st['Truck No'], t)))
    : [];

  const unmatchedTruckDetails = unmatchedTrucks.map(t => ({
    truckNo: t,
    totalAmount: truckDiffs[t] || 0,
    records: truckBreakdowns[t] || []
  }));

  const totalDifference = Object.values(truckDiffs).reduce((a, b) => a + b, 0);

  return {
    tables,
    normalizedRecords,
    actuals,
    multipleEntries,
    duplicateErrors: [], // No longer blocks import; multiple entries are aggregated
    totalRecords: normalizedRecords.length,
    uniqueTruckCount: uniqueTruckList.length,
    matchedCount: matchedTrucks.length,
    unmatchedCount: unmatchedTrucks.length,
    matchedTrucks,
    unmatchedTrucks,
    unmatchedTruckDetails,
    totalDifference
  };
}

function getFYFromYearAndMonth(y, m) {
  return m >= 3
    ? `FY ${y}-${String(y + 1).slice(-2)}`
    : `FY ${y - 1}-${String(y).slice(-2)}`;
}

export default function UploadIncentiveExcelDialog({
  open,
  onClose,
  initialMonth = 7,
  initialYear = 2026,
  years = [2024, 2025, 2026, 2027, 2028],
  systemVehicles = [],
  onConfirmImport
}) {
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [selectedYear, setSelectedYear] = useState(initialYear);
  const [selectedFY, setSelectedFY] = useState(() => getFYFromYearAndMonth(initialYear, initialMonth));
  const [file, setFile] = useState(null);
  const [workbook, setWorkbook] = useState(null);
  const [sheetNames, setSheetNames] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseResult, setParseResult] = useState(null);
  const [detectedPeriod, setDetectedPeriod] = useState(null);
  const [periodMismatchChoice, setPeriodMismatchChoice] = useState('keep_selected'); // 'keep_selected' | 'switch_to_detected'

  const fyOptions = useMemo(() => {
    const list = [];
    const minYear = Math.min(...years) - 1;
    const maxYear = Math.max(...years) + 1;
    for (let y = minYear; y <= maxYear; y++) {
      list.push(`FY ${y}-${String(y + 1).slice(-2)}`);
    }
    return list;
  }, [years]);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setSelectedMonth(initialMonth);
      setSelectedYear(initialYear);
      setSelectedFY(getFYFromYearAndMonth(initialYear, initialMonth));
      setFile(null);
      setWorkbook(null);
      setSheetNames([]);
      setSelectedSheet('');
      setParsing(false);
      setParseResult(null);
      setDetectedPeriod(null);
      setPeriodMismatchChoice('keep_selected');
    }
  }, [open, initialMonth, initialYear]);

  const handleFYChange = (newFY) => {
    setSelectedFY(newFY);
    const m = newFY.match(/\d{4}/);
    if (m) {
      const startY = parseInt(m[0], 10);
      const computedY = selectedMonth >= 3 ? startY : startY + 1;
      setSelectedYear(computedY);
    }
  };

  const handleMonthChange = (newMonth) => {
    setSelectedMonth(newMonth);
    const m = selectedFY.match(/\d{4}/);
    if (m) {
      const startY = parseInt(m[0], 10);
      const computedY = newMonth >= 3 ? startY : startY + 1;
      setSelectedYear(computedY);
    } else {
      setSelectedFY(getFYFromYearAndMonth(selectedYear, newMonth));
    }
  };

  const handleYearChange = (newYear) => {
    setSelectedYear(newYear);
    setSelectedFY(getFYFromYearAndMonth(newYear, selectedMonth));
  };

  // Handle file selection
  const handleFileChange = async (selectedFile) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setParsing(true);
    setParseResult(null);
    setDetectedPeriod(null);

    try {
      const data = await selectedFile.arrayBuffer();
      const wb = XLSX.read(data, { cellDates: true });
      setWorkbook(wb);
      setSheetNames(wb.SheetNames || []);

      const detected = detectWorkbookPeriod(wb, selectedFile.name);
      setDetectedPeriod(detected);

      // Auto-select best sheet (e.g. matching month name or first sheet)
      let defaultSheet = wb.SheetNames[0];
      const targetMonthName = MONTH_NAMES[selectedMonth].toLowerCase().slice(0, 3);
      const matchingSheet = wb.SheetNames.find(s => s.toLowerCase().includes(targetMonthName));
      if (matchingSheet) {
        defaultSheet = matchingSheet;
      }
      setSelectedSheet(defaultSheet);

      // Parse sheet
      const ws = wb.Sheets[defaultSheet];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      const parsed = parseIncentiveSheetData(aoa, systemVehicles);
      setParseResult({ ...parsed, aoa });
    } catch (err) {
      console.error('Failed to parse Excel file:', err);
      alert('Error parsing Excel file: ' + err.message);
    } finally {
      setParsing(false);
    }
  };

  // Handle sheet change
  const handleSheetChange = (sheetName) => {
    setSelectedSheet(sheetName);
    if (!workbook || !workbook.Sheets[sheetName]) return;
    setParsing(true);
    try {
      const ws = workbook.Sheets[sheetName];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      const parsed = parseIncentiveSheetData(aoa, systemVehicles);
      setParseResult({ ...parsed, aoa });
    } finally {
      setParsing(false);
    }
  };

  // Check period mismatch
  const hasPeriodMismatch = useMemo(() => {
    if (!detectedPeriod || detectedPeriod.detectedMonthIndex === null) return false;
    return (
      detectedPeriod.detectedMonthIndex !== selectedMonth ||
      (detectedPeriod.detectedCalendarYear !== null && detectedPeriod.detectedCalendarYear !== selectedYear)
    );
  }, [detectedPeriod, selectedMonth, selectedYear]);

  // Handle Confirm Import
  const handleConfirm = () => {
    if (!parseResult || !file) return;

    let targetYear = selectedYear;
    let targetMonth = selectedMonth;
    let targetFY = selectedFY;

    if (hasPeriodMismatch && periodMismatchChoice === 'switch_to_detected') {
      if (detectedPeriod.detectedCalendarYear !== null) targetYear = detectedPeriod.detectedCalendarYear;
      if (detectedPeriod.detectedMonthIndex !== null) targetMonth = detectedPeriod.detectedMonthIndex;
      targetFY = getFYFromYearAndMonth(targetYear, targetMonth);
    }

    onConfirmImport({
      targetYear,
      targetMonth,
      financialYear: targetFY,
      newActuals: parseResult.actuals,
      normalizedRecords: parseResult.normalizedRecords,
      uploadSummary: {
        tables: parseResult.tables,
        normalizedRecords: parseResult.normalizedRecords,
        multipleEntries: parseResult.multipleEntries,
        totalRows: parseResult.totalRecords,
        uniqueTruckCount: parseResult.uniqueTruckCount,
        matchedCount: parseResult.matchedCount,
        unmatchedCount: parseResult.unmatchedCount,
        unmatchedTrucks: parseResult.unmatchedTrucks.map(t => ({
          truckNo: t,
          records: (parseResult.unmatchedTruckDetails?.find(d => d.truckNo === t)?.records) || []
        })),
        unmatchedTruckDetails: parseResult.unmatchedTruckDetails || [],
        totalAmount: parseResult.totalDifference,
        totalDifference: parseResult.totalDifference,
        detectedMonthIndex: detectedPeriod?.detectedMonthIndex,
        detectedCalendarYear: detectedPeriod?.detectedCalendarYear,
        detectedFY: targetFY
      },
      excelName: file.name,
      excelData: parseResult.aoa
    });

    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          boxShadow: '0 25px 60px rgba(0,0,0,0.2)',
          bgcolor: 'background.paper',
          overflow: 'hidden'
        }
      }}
    >
      {/* Dialog Header */}
      <DialogTitle
        sx={{
          bgcolor: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          py: 2,
          px: 3,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <Box display="flex" alignItems="center" gap={1.5}>
          <Box sx={{ width: 36, height: 36, borderRadius: 2, bgcolor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <UploadFileIcon sx={{ color: '#2563eb', fontSize: 22 }} />
          </Box>
          <Box>
            <Typography variant="h6" fontWeight={800} color="#0f172a" fontSize="16px">
              Upload Incentive Excel
            </Typography>
            <Typography variant="caption" color="#64748b" fontWeight={500}>
              Import authoritative actual Difference values into Incentive Calculation Sheet
            </Typography>
          </Box>
        </Box>
        <IconButton size="small" onClick={onClose} sx={{ color: '#94a3b8', '&:hover': { color: '#475569' } }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 3, bgcolor: '#f8fafc', display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        {/* Step 1: Target Month and Year Selection */}
        <Box sx={{ p: 2.5, bgcolor: '#fff', borderRadius: 2.5, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <Typography variant="subtitle2" fontWeight={800} color="#1e293b" mb={1.5} display="flex" alignItems="center" gap={1}>
            <Box sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: '#7c3aed', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>1</Box>
            Select Target Accounting Period (Authoritative)
          </Typography>

          <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
            <Box>
              <Typography variant="caption" fontWeight={700} color="#64748b" display="block" mb={0.5}>
                Month
              </Typography>
              <Select
                size="small"
                value={selectedMonth}
                onChange={(e) => handleMonthChange(Number(e.target.value))}
                sx={{ minWidth: 140, height: 36, fontSize: '12px', fontWeight: 700 }}
              >
                {MONTH_NAMES.map((m, idx) => (
                  <MenuItem key={idx} value={idx} sx={{ fontSize: '12px', fontWeight: 600 }}>
                    {m}
                  </MenuItem>
                ))}
              </Select>
            </Box>

            <Box>
              <Typography variant="caption" fontWeight={700} color="#64748b" display="block" mb={0.5}>
                Financial Year
              </Typography>
              <Select
                size="small"
                value={selectedFY}
                onChange={(e) => handleFYChange(e.target.value)}
                sx={{ minWidth: 140, height: 36, fontSize: '12px', fontWeight: 700 }}
              >
                {fyOptions.map(fy => (
                  <MenuItem key={fy} value={fy} sx={{ fontSize: '12px', fontWeight: 600 }}>
                    {fy}
                  </MenuItem>
                ))}
              </Select>
            </Box>

            <Box>
              <Typography variant="caption" fontWeight={700} color="#64748b" display="block" mb={0.5}>
                Year
              </Typography>
              <Select
                size="small"
                value={selectedYear}
                onChange={(e) => handleYearChange(Number(e.target.value))}
                sx={{ minWidth: 110, height: 36, fontSize: '12px', fontWeight: 700 }}
              >
                {years.map(y => (
                  <MenuItem key={y} value={y} sx={{ fontSize: '12px', fontWeight: 600 }}>
                    {y}
                  </MenuItem>
                ))}
              </Select>
            </Box>

            <Box sx={{ ml: 'auto', textAlign: 'right' }}>
              <Typography variant="caption" fontWeight={700} color="#64748b" display="block" mb={0.5}>
                Target Period
              </Typography>
              <Chip
                label={`${MONTH_NAMES[selectedMonth]} ${selectedYear} (${selectedFY})`}
                size="small"
                sx={{ fontWeight: 800, bgcolor: '#ede9fe', color: '#6d28d9', fontSize: '11px' }}
              />
            </Box>
          </Box>
        </Box>

        {/* Step 2: Choose Excel File */}
        <Box sx={{ p: 2.5, bgcolor: '#fff', borderRadius: 2.5, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <Typography variant="subtitle2" fontWeight={800} color="#1e293b" mb={1.5} display="flex" alignItems="center" gap={1}>
            <Box sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: '#7c3aed', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>2</Box>
            Select Incentive Excel File
          </Typography>

          <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
            <Button
              variant="outlined"
              component="label"
              startIcon={<InsertDriveFileIcon />}
              sx={{
                fontWeight: 700,
                textTransform: 'none',
                borderColor: '#cbd5e1',
                color: '#334155',
                '&:hover': { bgcolor: '#f8fafc', borderColor: '#94a3b8' }
              }}
            >
              Browse Excel File (.xlsx, .xls)
              <input
                type="file"
                accept=".xlsx,.xls"
                hidden
                onChange={(e) => handleFileChange(e.target.files[0])}
              />
            </Button>

            {file && (
              <Box display="flex" alignItems="center" gap={1} sx={{ bgcolor: '#eff6ff', px: 1.5, py: 0.6, borderRadius: 2, border: '1px solid #bfdbfe' }}>
                <Typography fontSize="12px" fontWeight={700} color="#1d4ed8">
                  {file.name}
                </Typography>
                <Typography fontSize="11px" color="#64748b">
                  ({(file.size / 1024).toFixed(1)} KB)
                </Typography>
              </Box>
            )}

            {sheetNames.length > 1 && (
              <Box display="flex" alignItems="center" gap={1} sx={{ ml: 'auto' }}>
                <Typography variant="caption" fontWeight={700} color="#64748b">
                  Worksheet:
                </Typography>
                <Select
                  size="small"
                  value={selectedSheet}
                  onChange={(e) => handleSheetChange(e.target.value)}
                  sx={{ height: 32, fontSize: '11px', fontWeight: 700 }}
                >
                  {sheetNames.map((s, idx) => (
                    <MenuItem key={idx} value={s} sx={{ fontSize: '11px', fontWeight: 600 }}>{s}</MenuItem>
                  ))}
                </Select>
              </Box>
            )}
          </Box>
        </Box>

        {/* Step 3: Period Validation & Warning */}
        {parsing && (
          <Box display="flex" alignItems="center" justifyContent="center" p={3} gap={1.5}>
            <CircularProgress size={24} thickness={4} />
            <Typography variant="body2" color="#64748b" fontWeight={600}>Parsing and validating workbook…</Typography>
          </Box>
        )}

        {file && !parsing && (
          <>
            {hasPeriodMismatch ? (
              <Alert
                severity="warning"
                icon={<WarningAmberIcon />}
                sx={{ borderRadius: 2.5, bgcolor: '#fffbeb', border: '1px solid #fde68a' }}
              >
                <Typography variant="subtitle2" fontWeight={800} color="#92400e">
                  Period Mismatch Warning
                </Typography>
                <Typography variant="body2" color="#78350f" mt={0.5} fontSize="12px">
                  The file content mentions <strong>{detectedPeriod?.detectedMonthIndex !== null ? MONTH_NAMES[detectedPeriod.detectedMonthIndex] : ''} {detectedPeriod?.detectedCalendarYear || ''}</strong>, but your target selection above is <strong>{MONTH_NAMES[selectedMonth]} {selectedYear} ({selectedFY})</strong>.
                </Typography>
                <RadioGroup
                  value={periodMismatchChoice}
                  onChange={(e) => setPeriodMismatchChoice(e.target.value)}
                  sx={{ mt: 1 }}
                >
                  <FormControlLabel
                    value="keep_selected"
                    control={<Radio size="small" sx={{ color: '#b45309', '&.Mui-checked': { color: '#b45309' } }} />}
                    label={
                      <Typography fontSize="12px" fontWeight={700} color="#92400e">
                        Import into selected target period: {MONTH_NAMES[selectedMonth]} {selectedYear} ({selectedFY}) (Authoritative)
                      </Typography>
                    }
                  />
                  <FormControlLabel
                    value="switch_to_detected"
                    control={<Radio size="small" sx={{ color: '#b45309', '&.Mui-checked': { color: '#b45309' } }} />}
                    label={
                      <Typography fontSize="12px" fontWeight={700} color="#92400e">
                        Change target period to detected file period: {detectedPeriod?.detectedMonthIndex !== null ? MONTH_NAMES[detectedPeriod.detectedMonthIndex] : ''} {detectedPeriod?.detectedCalendarYear || ''}
                      </Typography>
                    }
                  />
                </RadioGroup>
              </Alert>
            ) : detectedPeriod && detectedPeriod.detectedMonthIndex !== null ? (
              <Alert
                severity="success"
                icon={<CheckCircleOutlineIcon />}
                sx={{ borderRadius: 2.5, bgcolor: '#f0fdf4', border: '1px solid #bbf7d0', py: 0.5 }}
              >
                <Typography variant="body2" color="#166534" fontWeight={700} fontSize="12px">
                  Target Period Matches: File corresponds to {MONTH_NAMES[selectedMonth]} {selectedYear} ({selectedFY}).
                </Typography>
              </Alert>
            ) : null}

            {/* Validation Metrics Cards */}
            {parseResult && (
              <Box display="flex" flexDirection="column" gap={2}>
                <Box display="grid" gridTemplateColumns="repeat(auto-fit, minmax(130px, 1fr))" gap={1.5}>
                  <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: '#fff', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <Typography variant="caption" fontWeight={700} color="#64748b" textTransform="uppercase">Total Rows</Typography>
                    <Typography variant="h6" fontWeight={800} color="#0f172a" mt={0.25}>{parseResult.totalRecords}</Typography>
                  </Box>
                  <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: '#fff', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <Typography variant="caption" fontWeight={700} color="#64748b" textTransform="uppercase">Unique Vehicles</Typography>
                    <Typography variant="h6" fontWeight={800} color="#0f172a" mt={0.25}>{parseResult.uniqueTruckCount}</Typography>
                  </Box>
                  <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: '#f0fdf4', border: '1px solid #bbf7d0', textAlign: 'center' }}>
                    <Typography variant="caption" fontWeight={700} color="#166534" textTransform="uppercase">Matched</Typography>
                    <Typography variant="h6" fontWeight={800} color="#15803d" mt={0.25}>{parseResult.matchedCount}</Typography>
                  </Box>
                  <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: parseResult.unmatchedCount > 0 ? '#fff7ed' : '#f8fafc', border: '1px solid #fed7aa', textAlign: 'center' }}>
                    <Typography variant="caption" fontWeight={700} color="#c2410c" textTransform="uppercase">Unmatched</Typography>
                    <Typography variant="h6" fontWeight={800} color="#ea580c" mt={0.25}>{parseResult.unmatchedCount}</Typography>
                  </Box>
                  <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: '#fefce8', border: '1px solid #fef08a', textAlign: 'center' }}>
                    <Typography variant="caption" fontWeight={700} color="#854d0e" textTransform="uppercase">Total Difference</Typography>
                    <Typography variant="h6" fontWeight={800} color="#a16207" mt={0.25}>
                      ₹{Math.round(parseResult.totalDifference || 0).toLocaleString('en-IN')}
                    </Typography>
                  </Box>
                </Box>

                {/* Multiple Entries Aggregation Notice */}
                {parseResult.multipleEntries && parseResult.multipleEntries.length > 0 && (
                  <Alert severity="info" icon={<CheckCircleOutlineIcon />} sx={{ borderRadius: 2.5, bgcolor: '#eff6ff', border: '1px solid #bfdbfe' }}>
                    <Typography variant="subtitle2" fontWeight={800} color="#1e40af">
                      Aggregated Multiple Entries for Same Vehicle
                    </Typography>
                    <Typography variant="body2" color="#1e3a8a" fontSize="11px" mt={0.5}>
                      {parseResult.multipleEntries.length} multiple rows for the same vehicle under the same category were automatically aggregated and summed together.
                    </Typography>
                  </Alert>
                )}

                {/* Unmatched Vehicles Warning */}
                {parseResult.unmatchedCount > 0 && (
                  <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ borderRadius: 2.5, bgcolor: '#fffbeb', border: '1px solid #fde68a' }}>
                    <Typography variant="subtitle2" fontWeight={800} color="#92400e">
                      {parseResult.unmatchedCount} Unmatched Vehicles Detected in Excel
                    </Typography>
                    <Typography variant="body2" color="#78350f" fontSize="11px" mt={0.5}>
                      The following vehicles from Excel do not match any vehicles in the system for this month: <strong>{parseResult.unmatchedTrucks.join(', ')}</strong>.
                      Their amounts will <strong>not</strong> be assigned to other vehicles and will not create new vehicles.
                    </Typography>
                  </Alert>
                )}

                {/* Data Preview Table */}
                <Box sx={{ bgcolor: '#fff', borderRadius: 2, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                  <Box sx={{ px: 2, py: 1.2, bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="subtitle2" fontWeight={800} color="#0f172a" fontSize="12px">
                      Detected Incentive Data Preview
                    </Typography>
                    <Typography variant="caption" color="#64748b" fontWeight={600}>
                      Showing up to 10 rows
                    </Typography>
                  </Box>
                  <TableContainer sx={{ maxHeight: 220 }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 800, fontSize: '11px', bgcolor: '#f1f5f9' }}>#</TableCell>
                          <TableCell sx={{ fontWeight: 800, fontSize: '11px', bgcolor: '#f1f5f9' }}>Vehicle Number</TableCell>
                          <TableCell sx={{ fontWeight: 800, fontSize: '11px', bgcolor: '#f1f5f9' }}>Section / Category</TableCell>
                          <TableCell sx={{ fontWeight: 800, fontSize: '11px', bgcolor: '#f1f5f9', textAlign: 'right' }}>Difference Amount</TableCell>
                          <TableCell sx={{ fontWeight: 800, fontSize: '11px', bgcolor: '#f1f5f9', textAlign: 'center' }}>Status</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {parseResult.normalizedRecords.slice(0, 10).map((rec, idx) => (
                          <TableRow key={idx} hover>
                            <TableCell sx={{ fontSize: '11px', color: '#64748b' }}>{idx + 1}</TableCell>
                            <TableCell sx={{ fontSize: '11px', fontWeight: 700, color: '#0f172a' }}>{rec.truckNo}</TableCell>
                            <TableCell sx={{ fontSize: '11px', color: '#475569' }}>{rec.category}</TableCell>
                            <TableCell sx={{ fontSize: '11px', fontWeight: 800, textAlign: 'right', color: rec.amount < 0 ? '#dc2626' : '#15803d' }}>
                              ₹{rec.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell sx={{ textAlign: 'center' }}>
                              <Chip
                                label={rec.isMatched ? 'Matched' : 'Unmatched'}
                                size="small"
                                sx={{
                                  fontSize: '10px',
                                  fontWeight: 800,
                                  bgcolor: rec.isMatched ? '#dcfce7' : '#fee2e2',
                                  color: rec.isMatched ? '#166534' : '#991b1b'
                                }}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              </Box>
            )}
          </>
        )}
      </DialogContent>

      {/* Dialog Actions */}
      <DialogActions sx={{ p: 2, px: 3, bgcolor: '#f8fafc', borderTop: '1px solid #e2e8f0', justifyContent: 'space-between' }}>
        <Button onClick={onClose} variant="outlined" sx={{ fontWeight: 700, textTransform: 'none', color: '#475569', borderColor: '#cbd5e1' }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={!parseResult || parsing || !file}
          sx={{
            fontWeight: 800,
            textTransform: 'none',
            px: 3,
            background: 'linear-gradient(135deg, #10b981, #059669)',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
            '&:hover': {
              background: 'linear-gradient(135deg, #059669, #047857)'
            },
            '&:disabled': {
              background: '#cbd5e1',
              color: '#94a3b8'
            }
          }}
        >
          Confirm & Import ({parseResult?.matchedCount || 0} Vehicles, ₹{Math.round(parseResult?.totalDifference || 0).toLocaleString('en-IN')})
        </Button>
      </DialogActions>
    </Dialog>
  );
}
