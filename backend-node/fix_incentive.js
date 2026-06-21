const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../frontend/review-dashboard/UI2/src/components/IncentiveAnalysis.jsx');
let content = fs.readFileSync(file, 'utf8');

// Find start and end of buildComparisonData
const startStr = '// ─── Comparison Logic & Excel Export ───────────────────────────────────────────\nfunction buildComparisonData';
const endStr = 'function exportComparisonExcel';

const startIdx = content.indexOf(startStr);
const endIdx = content.indexOf(endStr);

if (startIdx === -1 || endIdx === -1) {
  console.error("Could not find start or end mark!");
  process.exit(1);
}

const replacement = `// ─── Comparison Logic & Excel Export ───────────────────────────────────────────
function buildComparisonData(data, year, month, actuals = {}, uploadedExcelData = null) {
  if (!uploadedExcelData || uploadedExcelData.length === 0) return null;

  const normalize = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  // 1. Find header row in uploadedExcelData
  let headerRowIdx = -1;
  let maxHeaderMatches = 0;
  for (let i = 0; i < Math.min(15, uploadedExcelData.length); i++) {
    const row = uploadedExcelData[i];
    if (!row || row.length === 0) continue;
    let matches = 0;
    row.forEach(cell => {
      if (cell && typeof cell === 'string' && cell.trim().length > 1) {
        matches++;
      }
    });
    if (matches > maxHeaderMatches) {
      maxHeaderMatches = matches;
      headerRowIdx = i;
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
    const cleaned = combinedText.toLowerCase().trim().replace(/[\\r\\n]+/g, ' ').replace(/\\s+/g, ' ');
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
    const cleaned = combinedText.toLowerCase().trim().replace(/[\\r\\n]+/g, ' ').replace(/\\s+/g, ' ');
    if (!cleaned) continue;

    // Detect left vs right side based on index c.
    const isRight = (c >= 8);

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

  aoa[0][OUR_START_COL] = \`Qualified Vehicle Extra Freight 9.5% NVL & NVCL FOR DEDICATED FROM OUR CALCULATION NVL Month of \${MONTH_NAMES[month]} '\${String(year).slice(2)}\`;
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

  // 4. Map of normalizedTruckNo -> { rowIndex, row }
  const excelLeftMap = new Map();
  const excelRightMap = new Map();

  uploadedExcelData.forEach((row, rIdx) => {
    if (!row || rIdx <= headerRowIdx) return;

    // Match left truck
    if (colMap.leftTruckCol !== -1 && colMap.leftTruckCol < row.length) {
      const cell = row[colMap.leftTruckCol];
      const cleaned = extractTruckNo(cell);
      if (cleaned) {
        excelLeftMap.set(cleaned, { rowIndex: rIdx, row });
      }
    }

    // Match right truck
    if (colMap.rightTruckCol !== -1 && colMap.rightTruckCol < row.length) {
      const cell = row[colMap.rightTruckCol];
      const cleaned = extractTruckNo(cell);
      if (cleaned) {
        excelRightMap.set(cleaned, { rowIndex: rIdx, row });
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

  // Build System trucks details for top section
  let mismatchedCount = 0;
  let matchedCount = 0;
  let missingInExcelCount = 0;
  let missingInSystemCount = 0;

  const systemTrucksDetail = allTruckNos.map(normTruck => {
    const t = systemTrucksMap.get(normTruck);
    const excelLeft = excelLeftMap.get(normTruck);
    const excelRight = excelRightMap.get(normTruck);

    const rightRow = excelRight ? excelRight.row : null;
    const leftRow = excelLeft ? excelLeft.row : null;

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
        truckNo: excelLeft ? (excelLeft.row[colMap.leftTruckCol] || normTruck) : (excelRight.row[colMap.rightTruckCol] || normTruck),
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
        trips: parseVal(rightRow, colMap.trips),
        nvlQty: parseVal(rightRow, colMap.nvlQty) || (isExcelNvl ? parseVal(leftRow, colMap.leftQty) : 0),
        nvlAmt: parseVal(rightRow, colMap.nvlAmt) || (isExcelNvl ? parseVal(leftRow, colMap.leftAmt) : 0),
        nvclQty: parseVal(rightRow, colMap.nvclQty) || (!isExcelNvl ? parseVal(leftRow, colMap.leftQty) : 0),
        nvclAmt: parseVal(rightRow, colMap.nvclAmt) || (!isExcelNvl ? parseVal(leftRow, colMap.leftAmt) : 0),
        extra10w: parseVal(rightRow, colMap.extra10w),
        grandTotal: parseVal(rightRow, colMap.grandTotal) || parseVal(leftRow, colMap.leftAmt)
      };

      const mismatches = ['trips', 'nvlQty', 'nvlAmt', 'nvclQty', 'nvclAmt', 'extra10w', 'grandTotal'].filter(f => excelValues[f] > 0);

      return {
        truck: dummyTruck,
        excelRowIndex: excelRight ? excelRight.rowIndex : excelLeft.rowIndex,
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
      trips: parseVal(rightRow, colMap.trips),
      nvlQty: parseVal(rightRow, colMap.nvlQty) || (isNvl ? parseVal(leftRow, colMap.leftQty) : 0),
      nvlAmt: parseVal(rightRow, colMap.nvlAmt) || (isNvl ? parseVal(leftRow, colMap.leftAmt) : 0),
      nvclQty: parseVal(rightRow, colMap.nvclQty) || (!isNvl ? parseVal(leftRow, colMap.leftQty) : 0),
      nvclAmt: parseVal(rightRow, colMap.nvclAmt) || (!isNvl ? parseVal(leftRow, colMap.leftAmt) : 0),
      extra10w: parseVal(rightRow, colMap.extra10w),
      grandTotal: parseVal(rightRow, colMap.grandTotal) || parseVal(leftRow, colMap.leftAmt)
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
      excelRowIndex: excelRight ? excelRight.rowIndex : excelLeft.rowIndex,
      excelRow: rightRow || leftRow,
      excelValues,
      hasDiscrepancy,
      mismatches,
      status: hasDiscrepancy ? 'MISMATCH' : 'PERFECT_MATCH'
    };
  });

  const stats = {
    systemCount: data.length,
    excelTrucksCount: excelLeftMap.size,
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
`;

content = content.substring(0, startIdx) + replacement + content.substring(endIdx);
fs.writeFileSync(file, content, 'utf8');
console.log("Replaced successfully!");
process.exit(0);
