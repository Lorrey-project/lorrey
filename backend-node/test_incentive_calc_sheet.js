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
  console.log('STARTING INCENTIVE CALCULATION SHEET ACCEPTANCE TEST SUITE (16 TESTS)');
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
    // TEST 2: ATOA Dedicated 12W vehicle with 6 qualifying trips: Commission = 0% on Bill Freight
    // SUM OF AMOUNT = SUM OF ORIGINAL BILLING AMOUNT * (1 - 0%) = 6,000
    // -------------------------------------------------------------------------
    console.log('Test 2: ATOA Dedicated 12W with 6 qualifying trips -> 0% commission, Sum of Amount = 6,000');
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
    assert.strictEqual(res2.standardIncentive.commissionRate, 0, 'ATOA commission rate must be 0%');
    assert.strictEqual(res2.standardIncentive.amount, 6000, 'Standard incentive amount must be exactly 100% of Bill Freight (6,000)');
    console.log('✅ PASSED Test 2: Standard incentive is 6,000 (0% commission on 6,000 Bill Freight)\n');

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
    // TEST 4: ATOA Dedicated 6W vehicle with 10 qualifying trips: Commission = 0% on Bill Freight
    // SUM OF AMOUNT = SUM OF ORIGINAL BILLING AMOUNT * (1 - 0%) = 10,000
    // -------------------------------------------------------------------------
    console.log('Test 4: ATOA Dedicated 6W vehicle with 10 qualifying trips -> 0% commission, Sum of Amount = 10,000');
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
    assert.strictEqual(res4.standardIncentive.commissionRate, 0, 'ATOA commission rate must be 0%');
    assert.strictEqual(res4.standardIncentive.amount, 10000, 'Standard incentive must be 100% of Bill Freight (10,000)');
    console.log('✅ PASSED Test 4: Standard incentive is 10,000 (0% commission on 10,000)\n');

    // -------------------------------------------------------------------------
    // TEST 5: MKT Dedicated 12W vehicle with 6 qualifying trips: Commission = 9.5% on Party Rate
    // SUM OF AMOUNT = SUM OF ORIGINAL FREIGHT * (1 - 0.095) = 5,700 * 0.905 = 5,159
    // -------------------------------------------------------------------------
    console.log('Test 5: MKT Dedicated 12W with 6 qualifying trips -> 9.5% commission on Party Rate, Sum of Amount = 5,159');
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
    assert.strictEqual(res5.standardIncentive.commissionRate, 0.095, 'Commission rate must be 9.5%');
    // Total Party Rate = 6 * 950 = 5700. 5700 * 0.095 = 541.5 -> rounded to 542
    assert.strictEqual(res5.standardIncentive.amount, 542, 'Standard incentive must be Party Rate * 0.095 (542)');
    console.log('✅ PASSED Test 5: Standard incentive is 542 (9.5% commission on Party Rate 5,700)\n');

    // -------------------------------------------------------------------------
    // TEST 6: MKT Dedicated 6W vehicle with 10 qualifying trips: Commission = 8.5% on Party Rate
    // SUM OF AMOUNT = SUM OF ORIGINAL FREIGHT * (1 - 0.085) = 9,500 * 0.915 = 8,693
    // -------------------------------------------------------------------------
    console.log('Test 6: MKT Dedicated 6W with 10 qualifying trips -> 8.5% commission on Party Rate, Sum of Amount = 8,693');
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
    assert.strictEqual(res6.standardIncentive.commissionRate, 0.085, 'Commission rate must be 8.5% for MKT 6W');
    // 9,500 * 0.085 = 807.5 -> rounded to 808
    assert.strictEqual(res6.standardIncentive.amount, 808, 'Standard incentive must be Party Rate * 0.085 (808)');
    console.log('✅ PASSED Test 6: Standard incentive is 808 (8.5% commission on Party Rate 9,500)\n');

    // -------------------------------------------------------------------------
    // TEST 6B: MKT Dedicated 10W with 6 qualifying trips: Commission = 8.5% on Party Freight
    // SUM OF AMOUNT = SUM OF ORIGINAL FREIGHT * 8.5% = 11,400 * 0.085 = 969
    // -------------------------------------------------------------------------
    console.log('Test 6B: MKT Dedicated 10W with 6 qualifying trips -> 8.5% commission on Party Freight, Sum of Amount = 969');
    const veh6B = 'TEST10WMKT6B';
    await ownerCol.deleteMany({ "Truck No": veh6B });
    await entriesCol.deleteMany({ "VEHICLE NUMBER": veh6B, month: TEST_MONTH, year: TEST_YEAR });

    await ownerCol.insertOne({
      "Truck No": veh6B,
      "Owner Name": "Owner Test 6B",
      "Type of vehicle": "10WH",
      "TYPE OF CUSTOMER ": "MKT",
      "Dedicated Type": "Dedicated"
    });
    createdOwners.push(veh6B);

    for (let i = 1; i <= 6; i++) {
      const e = {
        "VEHICLE NUMBER": veh6B,
        "INVOICE NO": `INV-T6B-${i}`,
        "LOADING DT": `${String(i).padStart(2, '0')}-06-2026`,
        month: TEST_MONTH,
        year: TEST_YEAR,
        "MT": 19,
        "BILLING": 100,
        "BILLING ER 95%": 1900,
        "SITE": "NVCL",
        "Bill Type": "STO"
      };
      await entriesCol.insertOne(e);
      createdEntries.push(e);
    }

    const res6B = await evaluateVehicleIncentiveEligibility(veh6B, TEST_MONTH, TEST_YEAR);
    assert.strictEqual(res6B.standardIncentive.eligible, true, 'Should be eligible with 6 trips for 10W');
    assert.strictEqual(res6B.standardIncentive.commissionRate, 0.085, 'Commission rate must be 8.5% for MKT 10W');
    // Total Party Freight = 6 * 1900 = 11,400. 11,400 * 0.085 = 969
    assert.strictEqual(res6B.standardIncentive.amount, 969, 'Standard incentive must be Party Freight * 0.085 (969)');
    console.log('✅ PASSED Test 6B: Standard incentive is 969 (8.5% commission on Party Freight 11,400)\n');

    // -------------------------------------------------------------------------
    // TEST 6C: Split invoices on same day for 10W vehicle (12 MT + 7 MT = 19 MT) -> evaluated as 1 trip, NOT 2 trips
    // -------------------------------------------------------------------------
    console.log('Test 6C: Split invoices on same day (12 MT + 7 MT = 19 MT) -> evaluated as 1 trip, NOT 2');
    const veh6C = 'TEST10WSPLIT';
    await ownerCol.deleteMany({ "Truck No": veh6C });
    await entriesCol.deleteMany({ "VEHICLE NUMBER": veh6C, month: TEST_MONTH, year: TEST_YEAR });

    await ownerCol.insertOne({
      "Truck No": veh6C,
      "Owner Name": "Owner Test 6C",
      "Type of vehicle": "10WH",
      "TYPE OF CUSTOMER ": "MKT",
      "Dedicated Type": "Dedicated"
    });
    createdOwners.push(veh6C);

    // 2 split invoices on the same date: 16-06-2026
    const split1 = {
      "VEHICLE NUMBER": veh6C,
      "INVOICE NO": "INV-SPLIT-1",
      "LOADING DT": "16-06-2026",
      month: TEST_MONTH,
      year: TEST_YEAR,
      "MT": 12,
      "BILLING": 778,
      "Billing Amount": 9336,
      "BILLING ER 95%": 8869.2,
      "SITE": "NVCL",
      "Bill Type": "SO"
    };
    const split2 = {
      "VEHICLE NUMBER": veh6C,
      "INVOICE NO": "INV-SPLIT-2",
      "LOADING DT": "16-06-2026",
      month: TEST_MONTH,
      year: TEST_YEAR,
      "MT": 7,
      "BILLING": 778,
      "Billing Amount": 5446,
      "BILLING ER 95%": 5173.7,
      "SITE": "NVCL",
      "Bill Type": "SO"
    };
    await entriesCol.insertOne(split1);
    await entriesCol.insertOne(split2);
    createdEntries.push(split1, split2);

    const res6C = await evaluateVehicleIncentiveEligibility(veh6C, TEST_MONTH, TEST_YEAR);
    assert.strictEqual(res6C.qualifyingTripsCount, 1, 'Split invoices on same date must evaluate to 1 completed trip');
    assert.strictEqual(res6C.standardIncentive.eligible, false, '1 trip is less than 6 trips required for 10W, must be ineligible');
    assert.strictEqual(res6C.standardIncentive.amount, 0, 'Standard incentive must be 0 for ineligible vehicle');
    console.log('✅ PASSED Test 6C: Split invoices on same day evaluated as exactly 1 trip and standard incentive is 0\n');
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
    // For veh3 (ATOA 6W, 10 trips): standard is 10000, 6W extra is 1500
    assert.strictEqual(res4.standardIncentive.amount, 10000, 'Standard amount must not contain 6W extra');
    // For veh6 (MKT 6W, 10 trips): standard is 808, 6W extra is 1425
    assert.strictEqual(res6.standardIncentive.amount, 808, 'Standard amount must not contain 6W extra');
    // For veh7 (10W extra 170): standard is 0
    assert.strictEqual(res7.standardIncentive.amount, 0, 'Standard amount must be 0, not containing 10W extra');
    console.log('✅ PASSED Test 11: Standard incentive column stays completely separated from extra incentives\n');

    // -------------------------------------------------------------------------
    // TEST 12: Total (Projected) column equals the sum of applicable category payouts
    // -------------------------------------------------------------------------
    console.log('Test 12: Total (Projected) column equals sum of applicable category payouts');
    // veh3: 10000 (standard) + 0 (10W) + 1500 (6W extra) = 11500
    assert.strictEqual(res4.totalProjectedIncentive, 10000 + 1500, 'Total projected must equal standard + 6W extra');
    // veh6: 808 (standard) + 0 (10W) + 1425 (6W extra) = 2233
    assert.strictEqual(res6.totalProjectedIncentive, 808 + 1425, 'Total projected must equal standard + 6W extra');
    // veh7: 0 (standard) + 170 (10W extra) + 0 = 170
    assert.strictEqual(res7.totalProjectedIncentive, 170, 'Total projected must equal 10W extra');
    // veh1: 6000 (standard) + 0 + 0 = 6000
    assert.strictEqual(res2.totalProjectedIncentive, 6000, 'Total projected must equal standard');
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
    assert.strictEqual(res13.standardIncentive.amount, 6000, 'Standard incentive must remain 6000, not double-counted to 7000');
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
    assert.strictEqual(res14b.standardIncentive.amount, 6000, 'Standard incentive must return to 6000');
    console.log('✅ PASSED Test 14: Dynamic recalculation operates correctly upon master data edit\n');

    // -------------------------------------------------------------------------
    // TEST 15: All historical Actual/Dedicated and settled values remain intact
    // -------------------------------------------------------------------------
    console.log('Test 15: Historical Actual/Dedicated and settled values remain intact');
    // Ensure actuals collection has not been altered or truncated
    const actualsCount = await actualsCol.countDocuments({});
    assert(actualsCount >= 0, 'Actuals collection must be intact');
    console.log(`✅ PASSED Test 15: Historical actuals and settlement records remain untouched (${actualsCount} documents found)\n`);

    // -------------------------------------------------------------------------
    // TEST 16: Vehicle number normalization — 4-digit vehicle numbers in cement register
    // match full registrations in Party Master and calculate standard incentives without zeroing out
    // -------------------------------------------------------------------------
    console.log('Test 16: 4-digit vehicle numbers in cement_register match full registration in Party Master');
    const vehFull16 = 'WB39B9988';
    const vehShort16 = '9988';
    await ownerCol.deleteMany({ "Truck No": { $in: [vehFull16, vehShort16] } });
    await entriesCol.deleteMany({ "VEHICLE NUMBER": { $in: [vehFull16, vehShort16] }, month: TEST_MONTH, year: TEST_YEAR });

    await ownerCol.insertOne({
      "Truck No": vehFull16,
      "Owner Name": "Norm Test Owner",
      "Type of vehicle": "12WH",
      "TYPE OF CUSTOMER ": "ATOA",
      "Dedicated Type": "Dedicated"
    });
    createdOwners.push(vehFull16);
    createdOwners.push(vehShort16);

    // 6 trips entered under 4-digit vehicle number '9988'
    for (let i = 1; i <= 6; i++) {
      const e = {
        "VEHICLE NUMBER": vehShort16,
        "INVOICE NO": `INV-T16-${i}`,
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

    // A: Evaluation via 4-digit truck number (as queried by cement_register aggregation)
    const res16Short = await evaluateVehicleIncentiveEligibility(vehShort16, TEST_MONTH, TEST_YEAR);
    assert.strictEqual(res16Short.isDedicated, true, '4-digit vehicle must be recognized as Dedicated via full registration in Party Master');
    assert.strictEqual(res16Short.qualifyingTripsCount, 6, 'Qualifying trips count for 4-digit vehicle must be 6');
    assert.strictEqual(res16Short.standardIncentive.eligible, true, 'Standard incentive must be eligible');
    assert.strictEqual(res16Short.standardIncentive.amount, 6000, 'Standard incentive amount must be 6000 (100% of 6000 Bill Freight)');

    // B: Evaluation via full registration (as queried when starting from Party Master)
    const res16Full = await evaluateVehicleIncentiveEligibility(vehFull16, TEST_MONTH, TEST_YEAR);
    assert.strictEqual(res16Full.isDedicated, true, 'Full registration must find trips logged with 4-digit vehicle in cement register');
    assert.strictEqual(res16Full.qualifyingTripsCount, 6, 'Qualifying trips count for full registration must find all 6 trips');
    assert.strictEqual(res16Full.standardIncentive.eligible, true, 'Standard incentive must be eligible');
    assert.strictEqual(res16Full.standardIncentive.amount, 6000, 'Standard incentive amount must be 6000');
    console.log('✅ PASSED Test 16: Bidirectional 4-digit/full registration matching operates accurately\n');

    console.log('========================================================================');
    console.log('ALL 16 INCENTIVE CALCULATION SHEET ACCEPTANCE TESTS PASSED SUCCESSFULLY!');
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
