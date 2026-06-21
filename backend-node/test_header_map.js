const mongoose = require('mongoose');
const XLSX = require('xlsx');
const fs = require('fs');
require('dotenv').config();

function num(val, fb = 0) { const n = parseFloat(val); return isNaN(n) ? fb : n; }
function parseExcelNum(val) {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  let cleaned = String(val).replace(/,/g, '').replace(/[₹$%\s]/g, '').trim();
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) cleaned = '-' + cleaned.slice(1, -1);
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}
function extractTruckNo(val) {
  if (val === undefined || val === null) return '';
  const str = String(val).toUpperCase().trim();
  const match = str.match(/([A-Z]{2})\s*[-_]?\s*(\d{1,2})\s*[-_]?\s*([A-Z]{0,2})\s*[-_]?\s*(\d{3,4})/);
  if (match) return `${match[1]}${match[2]}${match[3]}${match[4]}`;
  const cleaned = str.replace(/[^A-Z0-9]/g, '');
  if (/^[A-Z]{2}/.test(cleaned) && cleaned.length >= 8 && cleaned.length <= 12) return cleaned;
  return '';
}

function buildComparisonData(data, year, month, actuals = {}, uploadedExcelData = null) {
  if (!uploadedExcelData || uploadedExcelData.length === 0) return null;

  const normalize = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  let firstDataRowIdx = -1;
  for (let i = 0; i < Math.min(15, uploadedExcelData.length); i++) {
    const row = uploadedExcelData[i];
    if (!row) continue;
    let hasTruck = false;
    for (let c = 0; c < row.length; c++) {
      const cleanedTruck = extractTruckNo(row[c]);
      if (row[c] && cleanedTruck) {
        hasTruck = true;
        console.log(`Row ${i} Col ${c} matches truck: ${row[c]} -> ${cleanedTruck}`);
        break;
      }
    }
    if (hasTruck) {
      firstDataRowIdx = i;
      break;
    }
  }

  console.log('firstDataRowIdx:', firstDataRowIdx);

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

  console.log('headerRowIdx:', headerRowIdx);

  const mailMaxCol = Math.max(...uploadedExcelData.map(r => r ? r.length : 0), 7);
  console.log('mailMaxCol:', mailMaxCol);

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

  const colMap = {
    leftTruckCol: -1, leftQty: -1, leftAmt: -1, leftFreight: -1,
    rightTruckCol: -1, nvlQty: -1, nvlAmt: -1, nvclQty: -1, nvclAmt: -1,
    total: -1, extra10w: -1, grandTotal: -1, trips: -1, type: -1, ownerName: -1, wheel: -1
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

  console.log('typeCol:', typeCol);

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

  return { colMap };
}

const wb = XLSX.readFile('../incentive_march.xlsx');
const sheet = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
const parsedData = data.map(r => r.map(c => String(c || '').trim()));

const result = buildComparisonData([], 2026, 2, {}, parsedData);
console.log('Result:', result);
