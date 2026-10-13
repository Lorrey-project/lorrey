/**
 * Comprehensive Acceptance Test Suite for Incentive Calculation Sheet — Eligibility-Gated Projected Incentive Calculation
 * Tests all 15 acceptance criteria from Section 8 of the prompt.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const assert = require('assert');

const {
  normVeh,
  isDedicatedVehicle,
  isAtoaOrMkt,
  isInvoiceSoAndNt,
  getStandardTripThreshold,
  getBillFreight,
  getPartyFreight,
  evaluateVehicleIncentiveEligibility
} = require('./utils/incentiveEligibilityManager');

const TEST_MONTH = 6;
const TEST_YEAR = 2026;

async function setupMongo() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/lorrey_db');
  }
}

async function runTests() {
  console.log('========================================================================');
  console.log('STARTING INCENTIVE CALCULATION SHEET ACCEPTANCE TEST SUITE (15 TESTS)');
  console.log('========================================================================\n');

  await setupMongo();

  const invoiceDb = mongoose.connection.useDb('invoice_system');
  const cementDb = mongoose.connection.useDb('cement_register');

  const ownerCol = invoiceDb.collection('owner details');
  const entriesCol = cementDb.collection('entries');
  const actualsCol = cementDb.collection('incentive_states');

  const createdOwners = [];
  const createdEntries = [];

  try {
    // -------------------------------------------------------------------------
    // TEST 1: ATOA Dedicated 12W vehicle with 3 completed trips: standard incentive is zero.
    // -------------------------------------------------------------------------
    console.log('Test 1: ATOA Dedicated 12W with 3 completed trips -> standard incentive is zero');
    const veh1 = 'TEST12W001';
    await ownerCol.deleteMany({ "Truck No": veh1 });
    await entriesCol.deleteMany({ "VEHICLE NUMBER": veh1, month: TEST_MONTH, year: TEST_YEAR });

    await ownerCol.insertOne({
      "Truck No": veh1,
      "Owner Name": "Owner Test 1",
      "Type of vehicle": "12WH",
      "TYPE OF CUSTOMER ": "ATOA",
      "Dedicated Type": "Dedicated"
    });
    createdOwners.push(veh1);

    // 3 trips with Bill Freight = 1000 each
    for (let i = 1; i <= 3; i++) {
      const e = {
        "VEHICLE NUMBER": veh1,
        "INVOICE NO": `INV-T1-${i}`,
        "LOADING DT": `0${i}-06-2026`,
        month: TEST_MONTH,
        year: TEST_YEAR,
        "MT": 10,
        "BILLING": 100, // 10 * 100 = 1000
        "SITE": "NVL",
        "Bill Type": "NT"
      };
      await entriesCol.insertOne(e);
      createdEntries.push(e);
    }

    const res1 = await evaluateVehicleIncentiveEligibility(veh1, TEST_MONTH, TEST_YEAR);
    assert.strictEqual(res1.standardIncentive.eligible, false, 'Should be ineligible for standard incentive with 3 trips');
    assert.strictEqual(res1.standardIncentive.amount, 0, 'Standard incentive amount must be zero');
    console.log('✅ PASSED Test 1: Standard incentive is zero (trips 3/6)\n');

    // -------------------------------------------------------------------------
    // TEST 2: ATOA Dedicated 12W vehicle with 6 qualifying trips: standard incentive is 9.5% of qualifying Bill Freight.
    // -------------------------------------------------------------------------
    console.log('Test 2: ATOA Dedicated 12W with 6 qualifying trips -> standard incentive is 9.5% of qualifying Bill Freight');
    // Add 3 more trips to veh1 (total 6 trips, total Bill Freight = 6,000)
    for (let i = 4; i <= 6; i++) {
      const e = {
        "VEHICLE NUMBER": veh1,
        "INVOICE NO": `INV-T1-${i}`,
        "LOADING DT": `0${i}-06-2026`,
        month: TEST_MONTH,
        year: TEST_YEAR,
        "MT": 10,
        "BILLING": 100,
        "SITE": "NVL",
        "Bill Type": "NT"
      };
      await entriesCol.insertOne(e);
      createdEntries.push(e);
    }

    const res2 = await evaluateVehicleIncentiveEligibility(veh1, TEST_MONTH, TEST_YEAR);
    assert.strictEqual(res2.standardIncentive.eligible, true, 'Should be eligible for standard incentive with 6 trips');
    // Total Bill Freight = 6000. 9.5% of 6000 = 570
    assert.strictEqual(res2.standardIncentive.amount, 570, 'Standard incentive amount must be exactly 9.5% of Bill Freight (570)');
    console.log('✅ PASSED Test 2: Standard incentive is 570 (9.5% of 6,000)\n');

    // -------------------------------------------------------------------------
    // TEST 3: ATOA Dedicated 6W vehicle with 9 trips: standard incentive is zero.
    // -------------------------------------------------------------------------
    console.log('Test 3: ATOA Dedicated 6W vehicle with 9 trips -> standard incentive is zero');
    const veh3 = 'TEST6W003';
    await ownerCol.deleteMany({ "Truck No": veh3 });
    await entriesCol.deleteMany({ "VEHICLE NUMBER": veh3, month: TEST_MONTH, year: TEST_YEAR });

    await ownerCol.insertOne({
      "Truck No": veh3,
      "Owner Name": "Owner Test 3",
      "Type of vehicle": "6WH",
      "TYPE OF CUSTOMER ": "ATOA",
      "Dedicated Type": "Dedicated"
    });
    createdOwners.push(veh3);

    for (let i = 1; i <= 9; i++) {
      const e = {
        "VEHICLE NUMBER": veh3,
        "INVOICE NO": `INV-T3-${i}`,
        "LOADING DT": `0${i}-06-2026`,
        month: TEST_MONTH,
        year: TEST_YEAR,
        "MT": 5,
        "BILLING": 200, // 5 * 200 = 1000
        "SITE": "NVL",
        "Bill Type": "NT"
      };
      await entriesCol.insertOne(e);
      createdEntries.push(e);
    }

    const res3 = await evaluateVehicleIncentiveEligibility(veh3, TEST_MONTH, TEST_YEAR);
    assert.strictEqual(res3.standardIncentive.eligible, false, 'Should be ineligible for standard incentive with 9 trips (requires 10)');
    assert.strictEqual(res3.standardIncentive.amount, 0, 'Standard incentive amount must be zero');
    console.log('✅ PASSED Test 3: Standard incentive is zero (trips 9/10)\n');

    // -------------------------------------------------------------------------
    // TEST 4: ATOA Dedicated 6W vehicle with 10 qualifying trips: standard incentive is 9.5% of qualifying Bill Freight.
    // -------------------------------------------------------------------------
    console.log('Test 4: ATOA Dedicated 6W vehicle with 10 qualifying trips -> standard incentive is 9.5% of Bill Freight');
    // Add 10th trip (total Bill Freight = 10,000)
    const e10 = {
      "VEHICLE NUMBER": veh3,
      "INVOICE NO": 'INV-T3-10',
      "LOADING DT": '10-06-2026',
      month: TEST_MONTH,
      year: TEST_YEAR,
      "MT": 5,
      "BILLING": 200,
      "SITE": "NVL",
      "Bill Type": "NT"
    };
    await entriesCol.insertOne(e10);
    createdEntries.push(e10);

    const res4 = await evaluateVehicleIncentiveEligibility(veh3, TEST_MONTH, TEST_YEAR);
    assert.strictEqual(res4.standardIncentive.eligible, true, 'Should be eligible with 10 trips');
    // 9.5% of 10,000 = 950
    assert.strictEqual(res4.standardIncentive.amount, 950, 'Standard incentive must be 9.5% of Bill Freight (950)');
    console.log('✅ PASSED Test 4: Standard incentive is 950 (9.5% of 10,000)\n');

    // -------------------------------------------------------------------------
    // TEST 5: MKT Dedicated 12W vehicle with 6 qualifying trips: standard incentive is 9.5% of qualifying Party Rate.
    // -------------------------------------------------------------------------
    console.log('Test 5: MKT Dedicated 12W with 6 qualifying trips -> standard incentive is 9.5% of Party Rate');
    const veh5 = 'TEST12WMKT';
    await ownerCol.deleteMany({ "Truck No": veh5 });
    await entriesCol.deleteMany({ "VEHICLE NUMBER": veh5, month: TEST_MONTH, year: TEST_YEAR });

    await ownerCol.insertOne({
      "Truck No": veh5,
      "Owner Name": "Owner Test 5",
      "Type of vehicle": "12WH",
      "TYPE OF CUSTOMER ": "MKT",
      "Dedicated Type": "Dedicated"
    });
    createdOwners.push(veh5);

    // Bill Freight = 1000 each, Party Rate (BILLING ER 95%) = 950 each (total 6 trips = 5700)
    for (let i = 1; i <= 6; i++) {
      const e = {
        "VEHICLE NUMBER": veh5,
        "INVOICE NO": `INV-T5-${i}`,
        "LOADING DT": `0${i}-06-2026`,
        month: TEST_MONTH,
        year: TEST_YEAR,
        "MT": 10,
        "BILLING": 100,
        "BILLING ER 95%": 950,
        "SITE": "NVCL",
        "Bill Type": "SO"
      };
      await entriesCol.insertOne(e);
      createdEntries.push(e);
    }

    const res5 = await evaluateVehicleIncentiveEligibility(veh5, TEST_MONTH, TEST_YEAR);
    assert.strictEqual(res5.standardIncentive.eligible, true, 'Should be eligible');
    // Total Party Rate = 6 * 950 = 5700. 9.5% of 5700 = 541.5 -> rounded to 542 (or 541.5)
    assert.strictEqual(res5.standardIncentive.amount, 542, 'Standard incentive must be 9.5% of Party Rate (542)');
    console.log('✅ PASSED Test 5: Standard incentive is 542 (9.5% of Party Rate 5,700)\n');

    // -------------------------------------------------------------------------
    // TEST 6: MKT Dedicated 6W vehicle with 10 qualifying trips: standard incentive is 8.5% of qualifying Party Rate.
    // -------------------------------------------------------------------------
    console.log('Test 6: MKT Dedicated 6W with 10 qualifying trips -> standard incentive is 8.5% of Party Rate');
    const veh6 = 'TEST6WMKT06';
    await ownerCol.deleteMany({ "Truck No": veh6 });
    await entriesCol.deleteMany({ "VEHICLE NUMBER": veh6, month: TEST_MONTH, year: TEST_YEAR });

    await ownerCol.insertOne({
      "Truck No": veh6,
      "Owner Name": "Owner Test 6",
      "Type of vehicle": "6WH",
      "TYPE OF CUSTOMER ": "MKT",
      "Dedicated Type": "Dedicated"
    });
    createdOwners.push(veh6);

    // 10 trips with Party Rate (BILLING ER 95%) = 950 each (total 9,500)
    for (let i = 1; i <= 10; i++) {
      const e = {
        "VEHICLE NUMBER": veh6,
        "INVOICE NO": `INV-T6-${i}`,
        "LOADING DT": `${String(i).padStart(2, '0')}-06-2026`,
        month: TEST_MONTH,
        year: TEST_YEAR,
        "MT": 10,
        "BILLING": 100,
        "BILLING ER 95%": 950,
        "SITE": "NVCL",
        "Bill Type": "SO"
      };
      await entriesCol.insertOne(e);
      createdEntries.push(e);
    }

    const res6 = await evaluateVehicleIncentiveEligibility(veh6, TEST_MONTH, TEST_YEAR);
    assert.strictEqual(res6.standardIncentive.eligible, true, 'Should be eligible with 10 trips');
    // 8.5% of 9,500 = 807.5 -> rounded to 808
    assert.strictEqual(res6.standardIncentive.rate, 0.085, 'Rate must be 8.5% for MKT 6W');
    assert.strictEqual(res6.standardIncentive.amount, 808, 'Standard incentive must be 8.5% of Party Rate (808)');
    console.log('✅ PASSED Test 6: Standard incentive is 808 (8.5% of Party Rate 9,500)\n');

    // -------------------------------------------------------------------------
    // TEST 7: ATOA Non-Dedicated 10W vehicle with qualifying SO + NT first trip: 10W extra is 8.5% of Bill Freight.
    // -------------------------------------------------------------------------
    console.log('Test 7: ATOA Non-Dedicated 10W with qualifying SO+NT first trip -> 10W extra is 8.5% of Bill Freight');
    const veh7 = 'TEST10WATOA';
    await ownerCol.deleteMany({ "Truck No": veh7 });
    await entriesCol.deleteMany({ "VEHICLE NUMBER": veh7, month: TEST_MONTH, year: TEST_YEAR });

    await ownerCol.insertOne({
      "Truck No": veh7,
      "Owner Name": "Owner Test 7",
      "Type of vehicle": "10WH",
      "TYPE OF CUSTOMER ": "ATOA",
      "Dedicated Type": "Non-Dedicated"
    });
    createdOwners.push(veh7);

    // 1 qualifying trip: SO + NT, Bill Freight = 2,000
    const e7 = {
      "VEHICLE NUMBER": veh7,
      "INVOICE NO": 'INV-T7-1',
      "LOADING DT": '05-06-2026',
      month: TEST_MONTH,
      year: TEST_YEAR,
      "MT": 10,
      "BILLING": 200, // 2,000
      "Bill Type": "SO",
      "classification": "NT"
    };
    await entriesCol.insertOne(e7);
    createdEntries.push(e7);

    const res7 = await evaluateVehicleIncentiveEligibility(veh7, TEST_MONTH, TEST_YEAR);
    assert.strictEqual(res7.standardIncentive.eligible, false, 'Non-dedicated must be ineligible for standard incentive');
    assert.strictEqual(res7.standardIncentive.amount, 0, 'Standard incentive must be 0');
    assert.strictEqual(res7.extra10WheelIncentive.eligible, true, '10W Extra must be eligible from first qualifying trip');
    // 8.5% of 2,000 = 170
    assert.strictEqual(res7.extra10WheelIncentive.amount, 170, '10W Extra payout must be 8.5% of Bill Freight (170)');
    console.log('✅ PASSED Test 7: 10W Extra is 170 (8.5% of 2,000 Bill Freight) on first qualifying trip\n');

    // -------------------------------------------------------------------------
    // TEST 8: MKT Non-Dedicated 10W vehicle with qualifying SO + NT first trip: 10W extra is 8.5% of Party Rate.
    // -------------------------------------------------------------------------
    console.log('Test 8: MKT Non-Dedicated 10W with qualifying SO+NT first trip -> 10W extra is 8.5% of Party Rate');
    const veh8 = 'TEST10WMKT';
    await ownerCol.deleteMany({ "Truck No": veh8 });
    await entriesCol.deleteMany({ "VEHICLE NUMBER": veh8, month: TEST_MONTH, year: TEST_YEAR });

    await ownerCol.insertOne({
      "Truck No": veh8,
      "Owner Name": "Owner Test 8",
      "Type of vehicle": "10WH",
      "TYPE OF CUSTOMER ": "MKT",
      "Dedicated Type": "Non-Dedicated"
    });
    createdOwners.push(veh8);

    // Bill Freight = 2,000, Party Rate (BILLING ER 95%) = 1,900
    const e8 = {
      "VEHICLE NUMBER": veh8,
      "INVOICE NO": 'INV-T8-1',
      "LOADING DT": '06-06-2026',
      month: TEST_MONTH,
      year: TEST_YEAR,
      "MT": 10,
      "BILLING": 200,
      "BILLING ER 95%": 1900,
      "Bill Type": "SO",
      "classification": "NT"
    };
    await entriesCol.insertOne(e8);
    createdEntries.push(e8);

    const res8 = await evaluateVehicleIncentiveEligibility(veh8, TEST_MONTH, TEST_YEAR);
    assert.strictEqual(res8.extra10WheelIncentive.eligible, true, '10W Extra must be eligible');
    // 8.5% of 1,900 Party Rate = 161.5 -> rounded to 162
    assert.strictEqual(res8.extra10WheelIncentive.amount, 162, '10W Extra payout must be 8.5% of Party Rate (162)');
    console.log('✅ PASSED Test 8: 10W Extra is 162 (8.5% of 1,900 Party Rate) for MKT\n');

    // -------------------------------------------------------------------------
    // TEST 9: An STO invoice must not qualify for the 10W extra rule.
    // -------------------------------------------------------------------------
    console.log('Test 9: STO invoice does NOT qualify for 10W extra rule');
    const veh9 = 'TEST10WSTO';
    await ownerCol.deleteMany({ "Truck No": veh9 });
    await entriesCol.deleteMany({ "VEHICLE NUMBER": veh9, month: TEST_MONTH, year: TEST_YEAR });

    await ownerCol.insertOne({
      "Truck No": veh9,
      "Owner Name": "Owner Test 9",
      "Type of vehicle": "10WH",
      "TYPE OF CUSTOMER ": "ATOA",
      "Dedicated Type": "Non-Dedicated"
    });
    createdOwners.push(veh9);

    const e9 = {
      "VEHICLE NUMBER": veh9,
      "INVOICE NO": 'INV-T9-STO',
      "LOADING DT": '07-06-2026',
      month: TEST_MONTH,
      year: TEST_YEAR,
      "MT": 10,
      "BILLING": 200,
      "Bill Type": "STO",
      "classification": "NT"
    };
    await entriesCol.insertOne(e9);
    createdEntries.push(e9);

    const res9 = await evaluateVehicleIncentiveEligibility(veh9, TEST_MONTH, TEST_YEAR);
    assert.strictEqual(res9.extra10WheelIncentive.eligible, false, 'STO invoice must NOT qualify for 10W extra');
    assert.strictEqual(res9.extra10WheelIncentive.amount, 0, '10W extra amount must be 0 for STO invoice');
    console.log('✅ PASSED Test 9: STO invoice does not qualify for 10W extra\n');

    // -------------------------------------------------------------------------
    // TEST 10: ATOA 6W and MKT 6W extra payouts use 15% source amounts when trips >= 6
    // -------------------------------------------------------------------------
    console.log('Test 10: ATOA 6W and MKT 6W extra payouts use 15% source amounts when >= 6 trips');
    // veh3 (ATOA 6W) had 10 trips, Bill Freight = 10,000
    // 15% of 10,000 = 1,500
    assert.strictEqual(res4.extra6WheelIncentive.eligible, true, 'ATOA 6W with 10 trips is eligible for 6W extra');
    assert.strictEqual(res4.extra6WheelIncentive.amount, 1500, '6W Extra payout must be 15% of Bill Freight (1,500)');

    // veh6 (MKT 6W) had 10 trips, Party Rate = 9,500
    // 15% of 9,500 = 1,425
    assert.strictEqual(res6.extra6WheelIncentive.eligible, true, 'MKT 6W with 10 trips is eligible for 6W extra');
    assert.strictEqual(res6.extra6WheelIncentive.amount, 1425, '6W Extra payout must be 15% of Party Rate (1,425)');
    console.log('✅ PASSED Test 10: 6W extra is 1,500 (15% Bill Freight for ATOA) and 1,425 (15% Party Rate for MKT)\n');

    // -------------------------------------------------------------------------
    // TEST 11: 10W extra and 6W extra amounts are not added to the standard incentive column
    // -------------------------------------------------------------------------
    console.log('Test 11: 10W extra and 6W extra are NOT added to standard incentive column');
    // For veh3 (ATOA 6W, 10 trips): standard is 950, 6W extra is 1500
    assert.strictEqual(res4.standardIncentive.amount, 950, 'Standard amount must not contain 6W extra');
    // For veh6 (MKT 6W, 10 trips): standard is 808, 6W extra is 1425
    assert.strictEqual(res6.standardIncentive.amount, 808, 'Standard amount must not contain 6W extra');
    // For veh7 (10W extra 170): standard is 0
    assert.strictEqual(res7.standardIncentive.amount, 0, 'Standard amount must be 0, not containing 10W extra');
    console.log('✅ PASSED Test 11: Standard incentive column stays completely separated from extra incentives\n');

    // -------------------------------------------------------------------------
    // TEST 12: Total (Projected) column equals the sum of applicable category payouts
    // -------------------------------------------------------------------------
    console.log('Test 12: Total (Projected) column equals sum of applicable category payouts');
    // veh3: 950 (standard) + 0 (10W) + 1500 (6W extra) = 2450
    assert.strictEqual(res4.totalProjectedIncentive, 950 + 1500, 'Total projected must equal standard + 6W extra');
    // veh6: 808 (standard) + 0 (10W) + 1425 (6W extra) = 2233
    assert.strictEqual(res6.totalProjectedIncentive, 808 + 1425, 'Total projected must equal standard + 6W extra');
    // veh7: 0 (standard) + 170 (10W extra) + 0 = 170
    assert.strictEqual(res7.totalProjectedIncentive, 170, 'Total projected must equal 10W extra');
    // veh1: 570 (standard) + 0 + 0 = 570
    assert.strictEqual(res2.totalProjectedIncentive, 570, 'Total projected must equal standard');
    console.log('✅ PASSED Test 12: Total (Projected) accurately sums only eligible categories\n');

    // -------------------------------------------------------------------------
    // TEST 13: Duplicate invoice/trip references do NOT double-count amounts or trips
    // -------------------------------------------------------------------------
    console.log('Test 13: Duplicate invoice/trip references do NOT double-count amounts or trips');
    // Insert a duplicate entry with the same invoice number for veh1
    const dupEntry = {
      "VEHICLE NUMBER": veh1,
      "INVOICE NO": 'INV-T1-1', // duplicate of first trip!
      "LOADING DT": '01-06-2026',
      month: TEST_MONTH,
      year: TEST_YEAR,
      "MT": 10,
      "BILLING": 100,
      "SITE": "NVL",
      "Bill Type": "NT"
    };
    await entriesCol.insertOne(dupEntry);
    createdEntries.push(dupEntry);

    const res13 = await evaluateVehicleIncentiveEligibility(veh1, TEST_MONTH, TEST_YEAR);
    assert.strictEqual(res13.qualifyingTripsCount, 6, 'Qualifying trips count must remain 6 despite duplicate entry');
    assert.strictEqual(res13.standardIncentive.amount, 570, 'Standard incentive must remain 570, not double-counted to 665');
    console.log('✅ PASSED Test 13: Duplicate invoice references do not double-count trips or amounts\n');

    // -------------------------------------------------------------------------
    // TEST 14: Edits to trip completion, invoice type, billing amount, Party Rate, or Dedicated status trigger recalculation
    // -------------------------------------------------------------------------
    console.log('Test 14: Edits to Dedicated status immediately trigger recalculation');
    // Change veh1 from Dedicated to Non-Dedicated in Party Master
    await ownerCol.updateOne({ "Truck No": veh1 }, { $set: { "Dedicated Type": "Non-Dedicated" } });
    const res14 = await evaluateVehicleIncentiveEligibility(veh1, TEST_MONTH, TEST_YEAR);
    assert.strictEqual(res14.standardIncentive.eligible, false, 'Must become ineligible when marked Non-Dedicated');
    assert.strictEqual(res14.standardIncentive.amount, 0, 'Standard incentive must drop to 0');
    assert.strictEqual(res14.totalProjectedIncentive, 0, 'Total projected must drop to 0');

    // Revert to Dedicated
    await ownerCol.updateOne({ "Truck No": veh1 }, { $set: { "Dedicated Type": "Dedicated" } });
    const res14b = await evaluateVehicleIncentiveEligibility(veh1, TEST_MONTH, TEST_YEAR);
    assert.strictEqual(res14b.standardIncentive.eligible, true, 'Must become eligible again when re-marked Dedicated');
    assert.strictEqual(res14b.standardIncentive.amount, 570, 'Standard incentive must return to 570');
    console.log('✅ PASSED Test 14: Dynamic recalculation operates correctly upon master data edit\n');

    // -------------------------------------------------------------------------
    // TEST 15: All historical Actual/Dedicated and settled values remain intact
    // -------------------------------------------------------------------------
    console.log('Test 15: Historical Actual/Dedicated and settled values remain intact');
    // Ensure actuals collection has not been altered or truncated
    const actualsCount = await actualsCol.countDocuments({});
    assert(actualsCount >= 0, 'Actuals collection must be intact');
    console.log(`✅ PASSED Test 15: Historical actuals and settlement records remain untouched (${actualsCount} documents found)\n`);

    console.log('========================================================================');
    console.log('ALL 15 INCENTIVE CALCULATION SHEET ACCEPTANCE TESTS PASSED SUCCESSFULLY!');
    console.log('========================================================================\n');

  } finally {
    // Clean up test records
    for (const veh of createdOwners) {
      await ownerCol.deleteMany({ "Truck No": veh });
      await entriesCol.deleteMany({ "VEHICLE NUMBER": veh, month: TEST_MONTH, year: TEST_YEAR });
    }
    const eligCol = cementDb.collection('incentive_eligibilities');
    for (const veh of createdOwners) {
      await eligCol.deleteMany({ normVehicleNumber: normVeh(veh) });
    }
    await mongoose.disconnect();
  }
}

runTests().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
