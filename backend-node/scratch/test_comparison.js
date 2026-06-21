const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

function num(val, fb = 0) { const n = parseFloat(val); return isNaN(n) ? fb : n; }

function parseLoadingDate(str) {
  if (!str) return null;
  const parts = String(str).split(/[-\/]/);
  if (parts.length === 3) {
    const [a, b, c] = parts.map(Number);
    if (a >= 1 && a <= 31 && b >= 1 && b <= 12 && c > 100) {
      return new Date(c, b - 1, a);
    }
    if (a > 100 && b >= 1 && b <= 12 && c >= 1 && c <= 31) {
      return new Date(a, b - 1, c);
    }
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function classifyRow(row) {
  const site = (row['SITE'] || '').toUpperCase().trim();
  if (site === 'NVL') return 'NVL';
  if (site === 'NVCL') return 'NVCL';
  if (row._is_ato === true || row._is_ato === 'true') return 'NVL';
  if (row._is_ato === false || row._is_ato === 'false') return 'NVCL';
  const billType = (row['Bill Type'] || '').toUpperCase();
  if (billType === 'NT') return 'NVL';
  if (billType === 'STO' || billType === 'SO') return 'NVCL';
  const type = (row['TYPE'] || '').toUpperCase();
  if (type === 'ATOA' || type === 'ATO') return 'NVL';
  if (type === 'MKT') return 'NVCL';
  return 'NVL';
}

function truckDisplayType(row) {
  const cat = classifyRow(row);
  if (row['TYPE']) return row['TYPE'];
  return cat === 'NVL' ? 'ATOA' : 'MKT';
}

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

function buildIncentiveData(rows, year, month, truckContacts = []) {
  const filtered = rows.filter(row => {
    const ld = row['LOADING DT'];
    const d = parseLoadingDate(ld);
    if (!d) return false;
    return d.getFullYear() === year && d.getMonth() === month;
  });

  const byTruck = {};
  for (const row of filtered) {
    const truck = (row['VEHICLE NUMBER'] || '').trim().toUpperCase();
    if (!truck) continue;

    if (!byTruck[truck]) {
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
      const dbCustType = contact ? (
        contact['TYPE OF CUSTOMER '] ||
        contact['type_of_customer'] ||
        contact['type_of_customers'] ||
        contact.cust_type ||
        contact.type ||
        ''
      ) : '';
      let displayType = truckDisplayType(row);
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

    entry.tripsCount += 1;
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

    if (entry.hasComm) {
      const commRate = num(entry.commRate, 0.05);
      entry.commission += orgFreight * commRate;
    }

    const manualW10 = num(row['10W EXTRA 8.5%']);
    if (manualW10 > 0) entry.extra10W += manualW10;
  }

  return Object.values(byTruck).map(t => {
    const metCriteria = t.tripsCount > 6;
    if (!metCriteria) {
      t.extra10W = 0;
      t.extra6W = 0;
    }
    t.nvl.amt = Math.round(t.nvl.amt);
    t.nvcl.amt = Math.round(t.nvcl.amt);
    t.extra10W = Math.round(t.extra10W);
    t.extra6W = Math.round(t.extra6W);
    const nvlNvclTotal = t.nvl.amt + t.nvcl.amt;
    const totalIncentiveWithBonus = nvlNvclTotal + t.extra10W + t.extra6W;
    const totalFinal = totalIncentiveWithBonus - Math.round(t.commission);
    return { ...t, total: nvlNvclTotal, totalFinal };
  }).sort((a, b) => a.type.localeCompare(b.type) || a.ownerName.localeCompare(b.ownerName));
}

function parseExcelNum(val) {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/,/g, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

// Import updated buildComparisonData logic directly
// We'll write it out exactly as in IncentiveAnalysis.jsx
function buildComparisonData(data, year, month, actuals = {}, uploadedExcelData = null) {
  if (!uploadedExcelData || uploadedExcelData.length === 0) return null;

  const normalize = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  let firstDataRowIdx = -1;
  for (let i = 0; i < Math.min(15, uploadedExcelData.length); i++) {
    const row = uploadedExcelData[i];
    if (!row) continue;
    let hasTruck = false;
    for (let c = 0; c < row.length; c++) {
      const truck = extractTruckNo(row[c]);
      if (row[c]) {
        console.log(`Row ${i} Col ${c}: "${row[c]}" -> extractTruckNo: "${truck}"`);
      }
      if (row[c] && truck) {
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
    leftTruckCol: -1,
    leftQty: -1,
    leftAmt: -1,
    leftFreight: -1,
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

  if (colMap.leftTruckCol === -1 && colMap.rightTruckCol !== -1) {
    colMap.leftTruckCol = colMap.rightTruckCol;
  }
  if (colMap.rightTruckCol === -1 && colMap.leftTruckCol !== -1) {
    colMap.rightTruckCol = colMap.leftTruckCol;
  }
  if (colMap.grandTotal === -1 && colMap.total !== -1) {
    colMap.grandTotal = colMap.total;
  }
  if (colMap.grandTotal === -1) colMap.grandTotal = colMap.leftAmt;
  if (colMap.nvlQty === -1) colMap.nvlQty = colMap.leftQty;
  if (colMap.nvlAmt === -1) colMap.nvlAmt = colMap.leftAmt;

  const excelLeftMap = new Map();
  const excelRightMap = new Map();

  uploadedExcelData.forEach((row, rIdx) => {
    if (!row || rIdx <= headerRowIdx) return;
    if (colMap.leftTruckCol !== -1 && colMap.leftTruckCol < row.length) {
      const cell = row[colMap.leftTruckCol];
      const cleaned = extractTruckNo(cell);
      if (cleaned) {
        excelLeftMap.set(cleaned, { rowIndex: rIdx, row });
      }
    }
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

  const parseVal = (row, idx) => {
    if (idx === -1 || !row || idx >= row.length) return 0;
    return parseExcelNum(row[idx]);
  };

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
        excelValues,
        hasDiscrepancy: mismatches.length > 0,
        mismatches,
        status: 'NOT_IN_SYSTEM'
      };
    }

    if (!excelLeft && !excelRight) {
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
        excelValues: { trips: 0, nvlQty: 0, nvlAmt: 0, nvclQty: 0, nvclAmt: 0, extra10w: 0, grandTotal: 0 },
        hasDiscrepancy: mismatches.length > 0,
        mismatches,
        status: 'MISSING_IN_EXCEL'
      };
    }

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
      excelValues,
      hasDiscrepancy,
      mismatches,
      status: hasDiscrepancy ? 'MISMATCH' : 'PERFECT_MATCH'
    };
  });

  return {
    headerRowIdx,
    colMap,
    stats: {
      systemCount: data.length,
      excelTrucksCount: excelLeftMap.size,
      matchedCount,
      mismatchedCount,
      missingInExcelCount,
      missingInSystemCount
    },
    systemTrucksDetail
  };
}

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    const db = mongoose.connection.useDb('cement_register');
    
    // Fetch cement register entries
    const entriesCol = db.collection('entries');
    const entries = await entriesCol.find({}).toArray();
    console.log("Total entries in DB:", entries.length);

    // Fetch saved state for March 2026 (year=2026, month=2)
    const statesCol = db.collection('incentive_states');
    const state = await statesCol.findOne({ year: 2026, month: 2 });
    if (!state) {
      console.log("No saved state found for March 2026");
      process.exit(0);
    }
    
    // Fetch truck contacts
    const contactsCol = db.collection('truck_contacts');
    let contacts = [];
    try {
      contacts = await contactsCol.find({}).toArray();
    } catch (e) {
      console.log("No truck_contacts collection or error:", e.message);
    }
    console.log("Total truck contacts:", contacts.length);

    // Run core aggregation
    const data = buildIncentiveData(entries, 2026, 2, contacts);
    console.log("System Generated Incentive Data length:", data.length);

    // Run comparison
    const result = buildComparisonData(data, 2026, 2, {}, state.excelData);
    console.log("\nComparison Results:");
    console.log("headerRowIdx:", result.headerRowIdx);
    console.log("colMap:", result.colMap);
    console.log("stats:", result.stats);

    // Print details of mismatched/problematic rows to verify
    console.log("\nMismatched / Non-Perfect Rows:");
    result.systemTrucksDetail.forEach(d => {
      if (d.status !== 'PERFECT_MATCH') {
        console.log(`Truck: ${d.truck.truckNo} (${d.truck.type}) - Status: ${d.status}`);
        console.log(`  System: trips=${d.truck.tripsCount}, nvlQty=${d.truck.nvl.invQty}, nvlAmt=${d.truck.nvl.amt}, nvclQty=${d.truck.nvcl.invQty}, nvclAmt=${d.truck.nvcl.amt}, extra10w=${d.truck.extra10W + d.truck.extra6W}, totalFinal=${d.truck.totalFinal}`);
        console.log(`  Excel:  trips=${d.excelValues.trips}, nvlQty=${d.excelValues.nvlQty}, nvlAmt=${d.excelValues.nvlAmt}, nvclQty=${d.excelValues.nvclQty}, nvclAmt=${d.excelValues.nvclAmt}, extra10w=${d.excelValues.extra10w}, grandTotal=${d.excelValues.grandTotal}`);
        if (d.mismatches.length > 0) {
          console.log(`  Mismatches in:`, d.mismatches);
        }
      }
    });

    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
