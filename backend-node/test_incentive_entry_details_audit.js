/**
 * Authoritative Regression Test Suite for:
 * Incentive Entry Sheet → Incentive Entry Details → EXTRA → Projected / Dedicated
 *
 * Verifies:
 * 1. Criteria-based vehicle filtering: Ineligible vehicles are excluded from Incentive Entry Details.
 * 2. Dedicated thresholds: 14W/12W/10W min 6 trips, 6WH min 10 trips.
 * 3. 10WH Extra independent qualification: >= 1 SO/NT trip qualifies, STO trips excluded.
 * 4. 6WH Extra independent qualification: min 6 trips qualifies at 15%.
 * 5. Calculation bases: ATOA on Billing Amount (0% commission deduction for standard, 8.5% for 10WH Extra, 15% for 6WH Extra);
 *    MKT on Original Freight (9.5% for 14W/12W, 8.5% for 10WH/6WH, 8.5% for 10WH Extra, 15% for 6WH Extra).
 * 6. Historical and current month isolation.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const assert = require('assert');

const {
  normVeh,
  getCanonicalTruckNo,
  evaluateVehicleIncentiveEligibility
} = require('./utils/incentiveEligibilityManager');

const TEST_MONTH = 8;
const TEST_YEAR = 2026;

async function setupMongo() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/lorrey_db');
  }
}

// Emulate frontend buildIncentiveData algorithm directly in Node to test criteria-based filtering
function testBuildIncentiveData(rows, year, month, contacts = []) {
  const filtered = rows.filter(row => {
    const ld = row['LOADING DT'] || row['LOADING DATE'] || row['BILL DATE'] || row.date;
    if (!ld) return false;
    const parts = String(ld).trim().split(/[-\/\.]/);
    if (parts.length === 3) {
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      let y = parseInt(parts[2], 10);
      if (parts[2].length === 2) y += 2000;
      return y === year && m === month;
    }
    return false;
  });

  const byTruck = {};
  for (const row of filtered) {
    const rawTruck = (row['VEHICLE NUMBER'] || row['VEHICLE NO'] || row['VEHICLE NO.'] || row.vehicleNumber || row['Truck No'] || '').trim().toUpperCase();
    if (!rawTruck) continue;
    const truck = getCanonicalTruckNo(rawTruck);
    if (!truck) continue;

    if (!byTruck[truck]) {
      const contact = contacts.find(c => {
        const cNo = (c['Truck No'] || c['Truck No '] || c.truck_no || '').trim().toUpperCase();
        return cNo === rawTruck || cNo === truck || getCanonicalTruckNo(cNo) === truck;
      }) || null;
      const displayWheel = contact ? (contact['Type of vehicle'] || contact.wheelType || '') : (row['WHEEL'] || '');
      let normWheel = 'OTHER';
      const wheelRaw = String(displayWheel).toUpperCase();
      if (wheelRaw.includes('14')) normWheel = '14WH';
      else if (wheelRaw.includes('12')) normWheel = '12WH';
      else if (wheelRaw.includes('10')) normWheel = '10WH';
      else if (wheelRaw.includes('6')) normWheel = '6WH';

      const displayType = contact ? (contact['TYPE OF CUSTOMER '] || contact.type || 'MKT') : (row['TYPE'] || 'MKT');
      const upperType = displayType.toUpperCase();
      const isAtoa = upperType.startsWith('ATO');
      const isMktOrOwn = upperType.startsWith('MKT') || upperType.startsWith('OWN');
      const isAtoaOrMkt = isAtoa || isMktOrOwn;

      const rawDedicated = contact ? (contact['Dedicated Type'] || contact.dedicated_type || '') : '';
      const isDedicated = String(rawDedicated).trim().toLowerCase() === 'dedicated';

      let standardCap = 0;
      if (normWheel === '14WH') standardCap = 30;
      else if (normWheel === '12WH') standardCap = 25;
      else if (normWheel === '10WH') standardCap = 19;
      else if (normWheel === '6WH') standardCap = 13;

      byTruck[truck] = {
        type: displayType,
        ownerName: (contact && contact['Owner Name']) || row['OWNER NAME'] || '',
        truckNo: truck,
        wheel: displayWheel,
        normWheel,
        standardCap,
        isDedicated,
        isAtoa,
        isAtoaOrMkt,
        tripsCount: 0,
        dailyMT: {},
        totalMT: 0,
        seenInvoices: new Set(),
        nvl: { invQty: 0, orgBillingAmt: 0, orgFreight: 0, amt: 0 },
        nvcl: { invQty: 0, orgBillingAmt: 0, orgFreight: 0, amt: 0 },
        extra10W: 0,
        qualifying10WTripCount: 0,
        extra6W: 0
      };
    }

    const entry = byTruck[truck];
    const invNo = String(row['INVOICE NO'] || '').trim().toUpperCase();
    if (invNo) {
      if (entry.seenInvoices.has(invNo)) continue;
      entry.seenInvoices.add(invNo);
    }

    const mt = parseFloat(row['MT'] || 0) || 0;
    const bAmt = parseFloat(row['Billing Amount'] || 0) || 0;
    const pFreight = parseFloat(row['BILLING ER 95%'] || row['PARTY FREIGHT'] || 0) || 0;

    const ldRaw = row['LOADING DT'] || '';
    entry.dailyMT[ldRaw] = (entry.dailyMT[ldRaw] || 0) + mt;
    entry.totalMT += mt;

    const site = (row['SITE'] || 'NVL').toUpperCase();
    if (site === 'NVL') {
      entry.nvl.invQty += mt;
      entry.nvl.orgBillingAmt += bAmt;
      entry.nvl.orgFreight += pFreight;
    } else {
      entry.nvcl.invQty += mt;
      entry.nvcl.orgBillingAmt += bAmt;
      entry.nvcl.orgFreight += pFreight;
    }

    const bType = String(row['Bill Type'] || '').trim().toUpperCase();
    const isSto = bType === 'STO' || bType.includes('STOCK');
    const isSoNt = !isSto && (bType === 'SO' || bType === 'NT');

    if (entry.normWheel === '10WH' && isSoNt) {
      entry.qualifying10WTripCount += 1;
    }
  }

  return Object.values(byTruck).map(t => {
    let tripsCount = 0;
    for (const dKey of Object.keys(t.dailyMT)) {
      const dayMT = t.dailyMT[dKey] || 0;
      if (dayMT > 0) {
        tripsCount += t.standardCap > 0 ? Math.max(1, Math.round(dayMT / t.standardCap)) : 1;
      }
    }
    t.tripsCount = tripsCount;

    const reqStandardTrips = (t.normWheel === '6WH') ? 10 : ((t.normWheel === '10WH' || t.normWheel === '12WH' || t.normWheel === '14WH') ? 6 : null);
    const isStandardEligible = Boolean(t.isAtoaOrMkt && t.isDedicated && reqStandardTrips !== null && tripsCount >= reqStandardTrips);
    t.standardEligible = isStandardEligible;

    if (isStandardEligible) {
      if (t.isAtoa) {
        t.nvl.amt = Math.round(t.nvl.orgBillingAmt);
        t.nvcl.amt = Math.round(t.nvcl.orgBillingAmt);
      } else {
        const rate = (t.normWheel === '10WH' || t.normWheel === '6WH') ? 0.085 : 0.095;
        t.nvl.amt = Math.round(t.nvl.orgFreight * rate);
        t.nvcl.amt = Math.round(t.nvcl.orgFreight * rate);
      }
    } else {
      t.nvl.amt = 0;
      t.nvcl.amt = 0;
    }

    const extra10WEligible = Boolean(t.isAtoaOrMkt && t.normWheel === '10WH' && t.qualifying10WTripCount >= 1);
    if (extra10WEligible) {
      const nvlBase = t.isAtoa ? t.nvl.orgBillingAmt : t.nvl.orgFreight;
      const nvclBase = t.isAtoa ? t.nvcl.orgBillingAmt : t.nvcl.orgFreight;
      t.extra10W = Math.round((nvlBase + nvclBase) * 0.085);
    } else {
      t.extra10W = 0;
    }

    const extra6WEligible = Boolean(t.isAtoaOrMkt && t.normWheel === '6WH' && t.tripsCount >= 6);
    if (extra6WEligible) {
      const nvlBase = t.isAtoa ? t.nvl.orgBillingAmt : t.nvl.orgFreight;
      const nvclBase = t.isAtoa ? t.nvcl.orgBillingAmt : t.nvcl.orgFreight;
      t.extra6W = Math.round((nvlBase + nvclBase) * 0.15);
    } else {
      t.extra6W = 0;
    }

    t.total = t.nvl.amt + t.nvcl.amt;
    t.totalFinal = t.total + t.extra10W + t.extra6W;

    return {
      ...t,
      extra10WEligible,
      extra6WEligible
    };
  })
  .filter(t => t.standardEligible || t.extra10WEligible || t.extra6WEligible)
  .sort((a, b) => a.truckNo.localeCompare(b.truckNo));
}

async function runAuditTests() {
  console.log('========================================================================');
  console.log('RUNNING INCENTIVE ENTRY DETAILS COMPLETE AUDIT TEST SUITE');
  console.log('========================================================================\n');

  await setupMongo();

  const invoiceDb = mongoose.connection.useDb('invoice_system');
  const cementDb = mongoose.connection.useDb('cement_register');

  const ownerCol = invoiceDb.collection('owner details');
  const entriesCol = cementDb.collection('entries');
  const eligCol = cementDb.collection('incentive_eligibilities');

  const createdVehs = [];

  try {
    // -------------------------------------------------------------------------
    // 1. INELIGIBLE VEHICLES BELOW TRIP THRESHOLD MUST BE EXCLUDED
    // -------------------------------------------------------------------------
    console.log('Test 1: Standard Dedicated vehicle below threshold is excluded from Incentive Entry Details');
    const vehIneligible12W = 'AUDIT_INELIG_12W';
    createdVehs.push(vehIneligible12W);

    await ownerCol.deleteMany({ "Truck No": vehIneligible12W });
    await entriesCol.deleteMany({ "VEHICLE NUMBER": vehIneligible12W });

    await ownerCol.insertOne({
      "Truck No": vehIneligible12W,
      "Owner Name": "Owner Ineligible 12W",
      "Type of vehicle": "12W",
      "TYPE OF CUSTOMER ": "MKT",
      "Dedicated Type": "Dedicated"
    });

    // 4 trips completed (requires 6)
    for (let i = 1; i <= 4; i++) {
      await entriesCol.insertOne({
        "VEHICLE NUMBER": vehIneligible12W,
        "INVOICE NO": `INV-INELIG-12W-${i}`,
        "LOADING DT": `0${i}-08-2026`,
        month: TEST_MONTH,
        year: TEST_YEAR,
        "MT": 25,
        "Billing Amount": 1000,
        "BILLING ER 95%": 950,
        "SITE": "NVL",
        "Bill Type": "STO"
      });
    }

    const evalInelig = await evaluateVehicleIncentiveEligibility(vehIneligible12W, TEST_MONTH, TEST_YEAR);
    assert.strictEqual(evalInelig.standardIncentive.eligible, false, '12W with 4 trips must NOT be standard eligible');
    assert.strictEqual(evalInelig.isEligible, false, 'Overall isEligible must be false');
    assert.strictEqual(evalInelig.totalProjectedIncentive, 0, 'Total projected incentive must be ₹0');

    // Verify it is excluded in buildIncentiveData
    const sampleRows = await entriesCol.find({ "VEHICLE NUMBER": vehIneligible12W }).toArray();
    const sampleContacts = [await ownerCol.findOne({ "Truck No": vehIneligible12W })];
    const sheetData = testBuildIncentiveData(sampleRows, TEST_YEAR, TEST_MONTH - 1, sampleContacts);
    assert.strictEqual(sheetData.length, 0, 'Ineligible 12W vehicle must be completely excluded from Incentive Entry Details sheet data');
    console.log('✅ PASSED: Standard Dedicated 12W with 4 trips is excluded (0 records in sheet)\n');

    // -------------------------------------------------------------------------
    // 2. 6WH DEDICATED VEHICLE BELOW 10 TRIPS THRESHOLD (e.g. 5 trips) IS EXCLUDED
    // -------------------------------------------------------------------------
    console.log('Test 2: 6WH Dedicated vehicle with 5 trips (< 10 standard, < 6 extra) is excluded');
    const vehInelig6W = 'AUDIT_INELIG_6W';
    createdVehs.push(vehInelig6W);

    await ownerCol.deleteMany({ "Truck No": vehInelig6W });
    await entriesCol.deleteMany({ "VEHICLE NUMBER": vehInelig6W });

    await ownerCol.insertOne({
      "Truck No": vehInelig6W,
      "Owner Name": "Owner Ineligible 6W",
      "Type of vehicle": "6WH",
      "TYPE OF CUSTOMER ": "MKT",
      "Dedicated Type": "Dedicated"
    });

    for (let i = 1; i <= 5; i++) {
      await entriesCol.insertOne({
        "VEHICLE NUMBER": vehInelig6W,
        "INVOICE NO": `INV-INELIG-6W-${i}`,
        "LOADING DT": `0${i}-08-2026`,
        month: TEST_MONTH,
        year: TEST_YEAR,
        "MT": 13,
        "Billing Amount": 1000,
        "BILLING ER 95%": 950,
        "SITE": "NVL",
        "Bill Type": "STO"
      });
    }

    const evalInelig6W = await evaluateVehicleIncentiveEligibility(vehInelig6W, TEST_MONTH, TEST_YEAR);
    assert.strictEqual(evalInelig6W.standardIncentive.eligible, false, '6WH with 5 trips must be standard ineligible (5/10)');
    assert.strictEqual(evalInelig6W.extra6WheelIncentive.eligible, false, '6WH with 5 trips must be 6W Extra ineligible (5/6)');
    assert.strictEqual(evalInelig6W.isEligible, false, 'Overall isEligible must be false');

    const sampleRows6W = await entriesCol.find({ "VEHICLE NUMBER": vehInelig6W }).toArray();
    const sampleContacts6W = [await ownerCol.findOne({ "Truck No": vehInelig6W })];
    const sheetData6W = testBuildIncentiveData(sampleRows6W, TEST_YEAR, TEST_MONTH - 1, sampleContacts6W);
    assert.strictEqual(sheetData6W.length, 0, '6WH vehicle with 5 trips must be completely excluded from sheet data');
    console.log('✅ PASSED: 6WH vehicle with 5 trips is excluded from sheet\n');

    // -------------------------------------------------------------------------
    // 3. 10WH EXTRA VEHICLE WITH >= 1 QUALIFYING SO/NT TRIP QUALIFIES INDEPENDENTLY
    // -------------------------------------------------------------------------
    console.log('Test 3: 10WH Extra qualifies with 2 SO trips independently of Dedicated criteria');
    const vehExtra10W = 'AUDIT_EXTRA_10W';
    createdVehs.push(vehExtra10W);

    await ownerCol.deleteMany({ "Truck No": vehExtra10W });
    await entriesCol.deleteMany({ "VEHICLE NUMBER": vehExtra10W });

    await ownerCol.insertOne({
      "Truck No": vehExtra10W,
      "Owner Name": "Owner Extra 10W",
      "Type of vehicle": "10WH",
      "TYPE OF CUSTOMER ": "MKT",
      "Dedicated Type": "Non-Dedicated" // Not dedicated!
    });

    // 2 trips (SO): NVL 500 + NVCL 500 = 1000 freight
    await entriesCol.insertOne({
      "VEHICLE NUMBER": vehExtra10W,
      "INVOICE NO": "INV-EX10-1",
      "LOADING DT": "01-08-2026",
      month: TEST_MONTH,
      year: TEST_YEAR,
      "MT": 19,
      "BILLING ER 95%": 500,
      "SITE": "NVL",
      "Bill Type": "SO"
    });
    await entriesCol.insertOne({
      "VEHICLE NUMBER": vehExtra10W,
      "INVOICE NO": "INV-EX10-2",
      "LOADING DT": "02-08-2026",
      month: TEST_MONTH,
      year: TEST_YEAR,
      "MT": 19,
      "BILLING ER 95%": 500,
      "SITE": "NVCL",
      "Bill Type": "SO"
    });

    const evalExtra10W = await evaluateVehicleIncentiveEligibility(vehExtra10W, TEST_MONTH, TEST_YEAR);
    assert.strictEqual(evalExtra10W.standardIncentive.eligible, false, 'Non-dedicated 10W must NOT be standard eligible');
    assert.strictEqual(evalExtra10W.standardIncentive.amount, 0, 'Standard dedicated amount must be 0');
    assert.strictEqual(evalExtra10W.extra10WheelIncentive.eligible, true, '10WH Extra must be eligible from SO trips');
    assert.strictEqual(evalExtra10W.extra10WheelIncentive.amount, 85, '10WH Extra amount must be ₹85 (8.5% of 1,000)');
    assert.strictEqual(evalExtra10W.isEligible, true, 'Overall isEligible must be true');

    const sampleRowsEx10 = await entriesCol.find({ "VEHICLE NUMBER": vehExtra10W }).toArray();
    const sampleContactsEx10 = [await ownerCol.findOne({ "Truck No": vehExtra10W })];
    const sheetDataEx10 = testBuildIncentiveData(sampleRowsEx10, TEST_YEAR, TEST_MONTH - 1, sampleContactsEx10);
    assert.strictEqual(sheetDataEx10.length, 1, '10WH Extra vehicle must appear in sheet');
    const row10W = sheetDataEx10[0];
    assert.strictEqual(row10W.standardEligible, false, 'standardEligible must be false');
    assert.strictEqual(row10W.extra10WEligible, true, 'extra10WEligible must be true');
    assert.strictEqual(row10W.nvl.amt, 0, 'NVL standard amt must be 0');
    assert.strictEqual(row10W.nvcl.amt, 0, 'NVCL standard amt must be 0');
    assert.strictEqual(row10W.total, 0, 'Total standard amt must be 0');
    assert.strictEqual(row10W.extra10W, 85, 'extra10W column must show ₹85');
    assert.strictEqual(row10W.totalFinal, 85, 'totalFinal must show ₹85');
    console.log('✅ PASSED: 10WH Extra vehicle qualifies independently, standard Dedicated shows ₹0, Extra shows ₹85\n');

    // -------------------------------------------------------------------------
    // 4. 10WH STO-ONLY TRIPS STRICTLY DISALLOWED FROM 10WH EXTRA
    // -------------------------------------------------------------------------
    console.log('Test 4: 10WH vehicle with STO-only trips is excluded from 10WH Extra');
    const vehSto10W = 'AUDIT_STO_10W';
    createdVehs.push(vehSto10W);

    await ownerCol.deleteMany({ "Truck No": vehSto10W });
    await entriesCol.deleteMany({ "VEHICLE NUMBER": vehSto10W });

    await ownerCol.insertOne({
      "Truck No": vehSto10W,
      "Owner Name": "Owner STO 10W",
      "Type of vehicle": "10WH",
      "TYPE OF CUSTOMER ": "MKT",
      "Dedicated Type": "Non-Dedicated"
    });

    for (let i = 1; i <= 3; i++) {
      await entriesCol.insertOne({
        "VEHICLE NUMBER": vehSto10W,
        "INVOICE NO": `INV-STO-10W-${i}`,
        "LOADING DT": `0${i}-08-2026`,
        month: TEST_MONTH,
        year: TEST_YEAR,
        "MT": 19,
        "BILLING ER 95%": 1000,
        "SITE": "NVL",
        "Bill Type": "STO"
      });
    }

    const evalSto10W = await evaluateVehicleIncentiveEligibility(vehSto10W, TEST_MONTH, TEST_YEAR);
    assert.strictEqual(evalSto10W.extra10WheelIncentive.eligible, false, 'STO trips must never qualify for 10WH Extra');
    assert.strictEqual(evalSto10W.extra10WheelIncentive.amount, 0, '10WH Extra amount must be ₹0');
    assert.strictEqual(evalSto10W.isEligible, false, 'Overall isEligible must be false');

    const sampleRowsSto = await entriesCol.find({ "VEHICLE NUMBER": vehSto10W }).toArray();
    const sampleContactsSto = [await ownerCol.findOne({ "Truck No": vehSto10W })];
    const sheetDataSto = testBuildIncentiveData(sampleRowsSto, TEST_YEAR, TEST_MONTH - 1, sampleContactsSto);
    assert.strictEqual(sheetDataSto.length, 0, '10WH vehicle with STO-only trips must be completely excluded from sheet');
    console.log('✅ PASSED: 10WH STO-only vehicle excluded from Incentive Entry Details\n');

    // -------------------------------------------------------------------------
    // 5. 6WH EXTRA QUALIFIES WITH 7 TRIPS (INDEPENDENT OF 10-TRIP DEDICATED THRESHOLD)
    // -------------------------------------------------------------------------
    console.log('Test 5: 6WH vehicle with 7 trips qualifies for 6WH Extra (15%) while Standard is ₹0');
    const vehExtra6W = 'AUDIT_EXTRA_6W';
    createdVehs.push(vehExtra6W);

    await ownerCol.deleteMany({ "Truck No": vehExtra6W });
    await entriesCol.deleteMany({ "VEHICLE NUMBER": vehExtra6W });

    await ownerCol.insertOne({
      "Truck No": vehExtra6W,
      "Owner Name": "Owner Extra 6W",
      "Type of vehicle": "6WH",
      "TYPE OF CUSTOMER ": "ATOA",
      "Dedicated Type": "Dedicated"
    });

    // 7 trips with Billing Amount = 200 each (total billing = 1,400)
    for (let i = 1; i <= 7; i++) {
      await entriesCol.insertOne({
        "VEHICLE NUMBER": vehExtra6W,
        "INVOICE NO": `INV-EX6W-${i}`,
        "LOADING DT": `0${i}-08-2026`,
        month: TEST_MONTH,
        year: TEST_YEAR,
        "MT": 13,
        "Billing Amount": 200,
        "SITE": i % 2 === 0 ? "NVCL" : "NVL",
        "Bill Type": "NT"
      });
    }

    const evalExtra6W = await evaluateVehicleIncentiveEligibility(vehExtra6W, TEST_MONTH, TEST_YEAR);
    assert.strictEqual(evalExtra6W.standardIncentive.eligible, false, '7 trips is below 10 trips required for standard Dedicated');
    assert.strictEqual(evalExtra6W.standardIncentive.amount, 0, 'Standard incentive must be 0');
    assert.strictEqual(evalExtra6W.extra6WheelIncentive.eligible, true, '7 trips meets >= 6 trips threshold for 6WH Extra');
    assert.strictEqual(evalExtra6W.extra6WheelIncentive.amount, 210, '6WH Extra amount must be ₹210 (15% of 1,400)');
    assert.strictEqual(evalExtra6W.isEligible, true, 'Overall isEligible must be true');

    const sampleRowsEx6W = await entriesCol.find({ "VEHICLE NUMBER": vehExtra6W }).toArray();
    const sampleContactsEx6W = [await ownerCol.findOne({ "Truck No": vehExtra6W })];
    const sheetDataEx6W = testBuildIncentiveData(sampleRowsEx6W, TEST_YEAR, TEST_MONTH - 1, sampleContactsEx6W);
    assert.strictEqual(sheetDataEx6W.length, 1, '6WH Extra vehicle must appear in sheet');
    const row6W = sheetDataEx6W[0];
    assert.strictEqual(row6W.standardEligible, false, 'standardEligible must be false');
    assert.strictEqual(row6W.extra6WEligible, true, 'extra6WEligible must be true');
    assert.strictEqual(row6W.total, 0, 'Total standard amt must be 0');
    assert.strictEqual(row6W.extra6W, 210, 'extra6W column must show ₹210');
    assert.strictEqual(row6W.totalFinal, 210, 'totalFinal must show ₹210');
    console.log('✅ PASSED: 6WH vehicle with 7 trips appears with 6WH Extra ₹210 and Standard Dedicated ₹0\n');

    // -------------------------------------------------------------------------
    // 6. STANDARD DEDICATED MEETING THRESHOLD (14W with 6 trips)
    // -------------------------------------------------------------------------
    console.log('Test 6: Dedicated 14W meeting 6-trip threshold appears with full details');
    const vehDed14W = 'AUDIT_DED_14W';
    createdVehs.push(vehDed14W);

    await ownerCol.deleteMany({ "Truck No": vehDed14W });
    await entriesCol.deleteMany({ "VEHICLE NUMBER": vehDed14W });

    await ownerCol.insertOne({
      "Truck No": vehDed14W,
      "Owner Name": "Owner Ded 14W",
      "Type of vehicle": "14W",
      "TYPE OF CUSTOMER ": "MKT",
      "Dedicated Type": "Dedicated"
    });

    for (let i = 1; i <= 6; i++) {
      await entriesCol.insertOne({
        "VEHICLE NUMBER": vehDed14W,
        "INVOICE NO": `INV-DED14W-${i}`,
        "LOADING DT": `0${i}-08-2026`,
        month: TEST_MONTH,
        year: TEST_YEAR,
        "MT": 30,
        "BILLING ER 95%": 1000,
        "SITE": i % 2 === 0 ? "NVCL" : "NVL",
        "Bill Type": "STO"
      });
    }

    const evalDed14W = await evaluateVehicleIncentiveEligibility(vehDed14W, TEST_MONTH, TEST_YEAR);
    assert.strictEqual(evalDed14W.standardIncentive.eligible, true, '14W with 6 trips must be standard eligible');
    assert.strictEqual(evalDed14W.standardIncentive.amount, 570, 'Standard incentive must be 9.5% of 6,000 = ₹570');
    assert.strictEqual(evalDed14W.isEligible, true, 'Overall isEligible must be true');

    const sampleRowsDed14W = await entriesCol.find({ "VEHICLE NUMBER": vehDed14W }).toArray();
    const sampleContactsDed14W = [await ownerCol.findOne({ "Truck No": vehDed14W })];
    const sheetDataDed14W = testBuildIncentiveData(sampleRowsDed14W, TEST_YEAR, TEST_MONTH - 1, sampleContactsDed14W);
    assert.strictEqual(sheetDataDed14W.length, 1, 'Eligible 14W must appear in sheet');
    const row14W = sheetDataDed14W[0];
    assert.strictEqual(row14W.standardEligible, true, 'standardEligible must be true');
    assert.strictEqual(row14W.total, 570, 'total standard must be ₹570');
    assert.strictEqual(row14W.totalFinal, 570, 'totalFinal must be ₹570');
    console.log('✅ PASSED: Dedicated 14W with 6 trips appears with complete details (Standard ₹570)\n');

    // -------------------------------------------------------------------------
    // 7. HISTORICAL MONTH ISOLATION
    // -------------------------------------------------------------------------
    console.log('Test 7: Historical Month Isolation — data from Month 8 does not leak into Month 7');
    const evalJuly = await evaluateVehicleIncentiveEligibility(vehDed14W, 7, TEST_YEAR);
    assert.strictEqual(evalJuly.qualifyingTripsCount, 0, 'July trips count must be 0');
    assert.strictEqual(evalJuly.standardIncentive.eligible, false, 'July standard incentive must be ineligible');
    assert.strictEqual(evalJuly.isEligible, false, 'July isEligible must be false');

    const sheetJuly = testBuildIncentiveData(sampleRowsDed14W, TEST_YEAR, 6, sampleContactsDed14W); // Month 7 (0-indexed 6)
    assert.strictEqual(sheetJuly.length, 0, 'July sheet must exclude August vehicles (0 records)');
    console.log('✅ PASSED: Historical month isolation verified: Month 8 data never appears in Month 7\n');

    // -------------------------------------------------------------------------
    // 8. CANONICAL TRUCK NORMALIZATION: MIXED REGISTRATION FORMATS MERGE INTO 4-DIGIT CANONICAL TRUCK NO
    // -------------------------------------------------------------------------
    console.log('Test 8: Mixed registration formats (WB33C6016 and 6016) merge into a single canonical 4-digit row without splitting');
    const vehMixedFull = 'WB33C6016';
    const vehMixedShort = '6016';
    createdVehs.push(vehMixedFull);
    createdVehs.push(vehMixedShort);

    await ownerCol.deleteMany({ "Truck No": { $in: [vehMixedFull, vehMixedShort] } });
    await entriesCol.deleteMany({ "VEHICLE NUMBER": { $in: [vehMixedFull, vehMixedShort] }, month: TEST_MONTH, year: TEST_YEAR });

    await ownerCol.insertOne({
      "Truck No": vehMixedFull,
      "Owner Name": "Indranil Roy",
      "Type of vehicle": "10W",
      "TYPE OF CUSTOMER ": "MKT",
      "Dedicated Type": "Dedicated"
    });

    const sampleRowsMixed = [];
    // 5 trips entered as 6016
    for (let i = 1; i <= 5; i++) {
      sampleRowsMixed.push({
        "VEHICLE NUMBER": vehMixedShort,
        "INVOICE NO": `INV-MIX-SHORT-${i}`,
        "LOADING DT": `0${i}-08-2026`,
        month: TEST_MONTH,
        year: TEST_YEAR,
        "MT": 19,
        "Billing Amount": 1000,
        "BILLING ER 95%": 950,
        "SITE": "NVCL",
        "Bill Type": "SO"
      });
    }
    // 2 trips entered as WB33C6016
    for (let i = 6; i <= 7; i++) {
      sampleRowsMixed.push({
        "VEHICLE NUMBER": vehMixedFull,
        "INVOICE NO": `INV-MIX-FULL-${i}`,
        "LOADING DT": `0${i}-08-2026`,
        month: TEST_MONTH,
        year: TEST_YEAR,
        "MT": 19,
        "Billing Amount": 1000,
        "BILLING ER 95%": 950,
        "SITE": "NVCL",
        "Bill Type": "SO"
      });
    }

    const mixedContacts = [{
      "Truck No": vehMixedFull,
      "Owner Name": "Indranil Roy",
      "Type of vehicle": "10W",
      "TYPE OF CUSTOMER ": "MKT",
      "Dedicated Type": "Dedicated"
    }];

    const sheetMixed = testBuildIncentiveData(sampleRowsMixed, TEST_YEAR, TEST_MONTH - 1, mixedContacts);
    assert.strictEqual(sheetMixed.length, 1, 'Mixed entries for same truck must produce exactly 1 row, not 2 separate rows');
    assert.strictEqual(sheetMixed[0].truckNo, '6016', 'Truck No column must display 4-digit canonical number (6016), never full vehicle number');
    assert.strictEqual(sheetMixed[0].tripsCount, 7, 'Trips must be combined (5 + 2 = 7 trips)');
    assert.strictEqual(sheetMixed[0].standardEligible, true, 'Vehicle with 7 trips must qualify for Dedicated Standard Incentive (>= 6 trips)');
    assert.strictEqual(sheetMixed[0].extra10WEligible, true, 'Vehicle must qualify for 10WH Extra (SO trips)');
    console.log('✅ PASSED: Mixed vehicle registration merging verified: WB33C6016 and 6016 merged into single row 6016 with 7 trips\n');

    console.log('========================================================================');
    console.log('ALL INCENTIVE ENTRY DETAILS AUDIT TESTS COMPLETED SUCCESSFULLY!');
    console.log('========================================================================\n');

  } finally {
    for (const v of createdVehs) {
      await ownerCol.deleteMany({ "Truck No": v });
      await entriesCol.deleteMany({ "VEHICLE NUMBER": v });
      await eligCol.deleteMany({ normVehicleNumber: normVeh(v) });
    }
    await mongoose.disconnect();
  }
}

runAuditTests().catch(err => {
  console.error('❌ Audit test suite failed:', err);
  process.exit(1);
});
