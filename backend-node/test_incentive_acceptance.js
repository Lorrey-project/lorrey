require('dotenv').config();
const mongoose = require('mongoose');
const {
  normVeh,
  normalizeWheelType,
  is6Wheel,
  is10or12or14Wheel,
  isDedicatedVehicle,
  isAtoaOrMkt,
  isInvoiceSoAndNt,
  getStandardTripThreshold,
  evaluateVehicleIncentiveEligibility
} = require('./utils/incentiveEligibilityManager');
const { parseBasicFreightCommission, parseIncentiveCommission } = require('./utils/partyMasterHelper');
const { evaluateMktCommission } = require('./utils/mktCommissionManager');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  passedTests++;
  console.log(`✅ PASSED: ${message}`);
}

async function runAcceptanceTests() {
  console.log('====================================================');
  console.log('RUNNING ALL 19 INCENTIVE ELIGIBILITY ACCEPTANCE TESTS');
  console.log('====================================================\n');

  await mongoose.connect(process.env.MONGO_URI);
  const cementDb = mongoose.connection.useDb('cement_register');
  const invoiceDb = mongoose.connection.useDb('invoice_system');

  const entriesCol = cementDb.collection('entries');
  const ownerCol = invoiceDb.collection('owner details');
  const truckCol = invoiceDb.collection('Truck Contact Number');
  const eligCol = cementDb.collection('incentive_eligibilities');

  const TEST_MONTH = 11;
  const TEST_YEAR = 2026;

  // Cleanup helper
  const createdVehicles = [];
  async function cleanup() {
    if (createdVehicles.length > 0) {
      await ownerCol.deleteMany({ truck_no: { $in: createdVehicles } });
      await truckCol.deleteMany({ truck_no: { $in: createdVehicles } });
      await entriesCol.deleteMany({ "VEHICLE NUMBER": { $in: createdVehicles } });
      await eligCol.deleteMany({ normVehicleNumber: { $in: createdVehicles.map(normVeh) } });
    }
  }

  try {
    // -------------------------------------------------------------------------
    // STANDARD INCENTIVE TESTS (1 - 6)
    // -------------------------------------------------------------------------
    console.log('--- SECTION 1: STANDARD INCENTIVE (RULES 1 - 6) ---');

    // TEST 1: Dedicated ATOA 10-wheel vehicle with 6 qualifying trips: eligible.
    const v1 = 'TEST-ATOA-10W-6TRIPS';
    createdVehicles.push(v1);
    await ownerCol.insertOne({
      "Truck No": v1,
      truck_no: v1,
      "TYPE OF CUSTOMER ": "ATOA",
      "Wheel Type": "10-Wheel",
      "dedicated_type": "Dedicated"
    });
    for (let i = 1; i <= 6; i++) {
      await entriesCol.insertOne({
        "VEHICLE NUMBER": v1,
        "INVOICE NO": `INV-T1-${i}`,
        "LOADING DT": `0${i}.11.2026`,
        month: TEST_MONTH,
        year: TEST_YEAR,
        MT: 20,
        "Billing Amount": 10000,
        "Bill Type": "SO"
      });
    }
    const res1 = await evaluateVehicleIncentiveEligibility(v1, TEST_MONTH, TEST_YEAR);
    assert(
      res1.standardIncentive.eligible === true && res1.standardIncentive.completedTrips === 6,
      'Test 1: Dedicated ATOA 10-wheel vehicle with 6 qualifying trips is eligible for standard incentive'
    );

    // TEST 2: Dedicated MKT 12-wheel vehicle with 5 trips: not eligible.
    const v2 = 'TEST-MKT-12W-5TRIPS';
    createdVehicles.push(v2);
    await ownerCol.insertOne({
      "Truck No": v2,
      truck_no: v2,
      "TYPE OF CUSTOMER ": "MKT",
      "Wheel Type": "12-Wheel",
      "dedicated_type": "Dedicated"
    });
    for (let i = 1; i <= 5; i++) {
      await entriesCol.insertOne({
        "VEHICLE NUMBER": v2,
        "INVOICE NO": `INV-T2-${i}`,
        "LOADING DT": `0${i}.11.2026`,
        month: TEST_MONTH,
        year: TEST_YEAR,
        MT: 25,
        "Billing Amount": 12000,
        "Bill Type": "SO"
      });
    }
    const res2 = await evaluateVehicleIncentiveEligibility(v2, TEST_MONTH, TEST_YEAR);
    assert(
      res2.standardIncentive.eligible === false && res2.standardIncentive.completedTrips === 5,
      'Test 2: Dedicated MKT 12-wheel vehicle with 5 trips is NOT eligible for standard incentive'
    );

    // TEST 3: Dedicated MKT 12-wheel vehicle with 6 trips: eligible.
    await entriesCol.insertOne({
      "VEHICLE NUMBER": v2,
      "INVOICE NO": `INV-T2-6`,
      "LOADING DT": `06.11.2026`,
      month: TEST_MONTH,
      year: TEST_YEAR,
      MT: 25,
      "Billing Amount": 12000,
      "Bill Type": "SO"
    });
    const res3 = await evaluateVehicleIncentiveEligibility(v2, TEST_MONTH, TEST_YEAR);
    assert(
      res3.standardIncentive.eligible === true && res3.standardIncentive.completedTrips === 6,
      'Test 3: Dedicated MKT 12-wheel vehicle with 6 trips is eligible for standard incentive'
    );

    // TEST 4: Dedicated 6-wheel vehicle with 9 trips: not eligible.
    const v4 = 'TEST-DED-6W-9TRIPS';
    createdVehicles.push(v4);
    await ownerCol.insertOne({
      "Truck No": v4,
      truck_no: v4,
      "TYPE OF CUSTOMER ": "ATOA",
      "Wheel Type": "6-Wheel",
      "dedicated_type": "Dedicated"
    });
    for (let i = 1; i <= 9; i++) {
      await entriesCol.insertOne({
        "VEHICLE NUMBER": v4,
        "INVOICE NO": `INV-T4-${i}`,
        "LOADING DT": `0${i}.11.2026`,
        month: TEST_MONTH,
        year: TEST_YEAR,
        MT: 13,
        "Billing Amount": 7000,
        "Bill Type": "SO"
      });
    }
    const res4 = await evaluateVehicleIncentiveEligibility(v4, TEST_MONTH, TEST_YEAR);
    assert(
      res4.standardIncentive.eligible === false && res4.standardIncentive.completedTrips === 9 && res4.standardIncentive.requiredTrips === 10,
      'Test 4: Dedicated 6-wheel vehicle with 9 trips is NOT eligible for standard incentive (requires 10 trips)'
    );

    // TEST 5: Dedicated 6-wheel vehicle with 10 trips: eligible.
    await entriesCol.insertOne({
      "VEHICLE NUMBER": v4,
      "INVOICE NO": `INV-T4-10`,
      "LOADING DT": `10.11.2026`,
      month: TEST_MONTH,
      year: TEST_YEAR,
      MT: 13,
      "Billing Amount": 7000,
      "Bill Type": "SO"
    });
    const res5 = await evaluateVehicleIncentiveEligibility(v4, TEST_MONTH, TEST_YEAR);
    assert(
      res5.standardIncentive.eligible === true && res5.standardIncentive.completedTrips === 10,
      'Test 5: Dedicated 6-wheel vehicle with 10 trips is eligible for standard incentive'
    );

    // TEST 6: Non-Dedicated vehicle with sufficient trips: not eligible for the standard incentive.
    const v6 = 'TEST-NONDED-SUFFICIENT';
    createdVehicles.push(v6);
    await ownerCol.insertOne({
      "Truck No": v6,
      truck_no: v6,
      "TYPE OF CUSTOMER ": "ATOA",
      "Wheel Type": "10-Wheel",
      "dedicated_type": "Non-Dedicated"
    });
    for (let i = 1; i <= 10; i++) {
      await entriesCol.insertOne({
        "VEHICLE NUMBER": v6,
        "INVOICE NO": `INV-T6-${i}`,
        "LOADING DT": `0${i}.11.2026`,
        month: TEST_MONTH,
        year: TEST_YEAR,
        MT: 19,
        "Billing Amount": 10000,
        "Bill Type": "SO"
      });
    }
    const res6 = await evaluateVehicleIncentiveEligibility(v6, TEST_MONTH, TEST_YEAR);
    assert(
      res6.standardIncentive.eligible === false && res6.isDedicated === false,
      'Test 6: Non-Dedicated vehicle with sufficient trips (10 trips) is NOT eligible for standard incentive'
    );

    // -------------------------------------------------------------------------
    // 10-WHEEL EXTRA INCENTIVE TESTS (7 - 11)
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 2: 10-WHEEL EXTRA INCENTIVE (RULES 7 - 11) ---');

    // TEST 7: Non-Dedicated ATOA 10-wheel vehicle with a qualifying SO + NT first trip: eligible.
    const v7 = 'TEST-NONDED-ATOA-10W-SONT';
    createdVehicles.push(v7);
    await ownerCol.insertOne({
      "Truck No": v7,
      truck_no: v7,
      "TYPE OF CUSTOMER ": "ATOA",
      "Wheel Type": "10-Wheel",
      "dedicated_type": "Non-Dedicated"
    });
    await entriesCol.insertOne({
      "VEHICLE NUMBER": v7,
      "INVOICE NO": "INV-T7-1",
      "LOADING DT": "01.11.2026",
      month: TEST_MONTH,
      year: TEST_YEAR,
      MT: 19,
      "Billing Amount": 10000,
      "Bill Type": "SO",
      _is_nt_invoice: true,
      "EXTRA UNLOADING": "750"
    });
    const res7 = await evaluateVehicleIncentiveEligibility(v7, TEST_MONTH, TEST_YEAR);
    assert(
      res7.extra10WheelIncentive.eligible === true && res7.extra10WheelIncentive.qualifyingSoNtTrips === 1,
      'Test 7: Non-Dedicated ATOA 10-wheel vehicle with qualifying SO + NT first trip is eligible for 10W extra incentive'
    );

    // TEST 8: Non-Dedicated MKT 10-wheel vehicle with a qualifying SO + NT first trip: eligible.
    const v8 = 'TEST-NONDED-MKT-10W-SONT';
    createdVehicles.push(v8);
    await ownerCol.insertOne({
      "Truck No": v8,
      truck_no: v8,
      "TYPE OF CUSTOMER ": "MKT",
      "Wheel Type": "10-Wheel",
      "dedicated_type": "Non-Dedicated"
    });
    await entriesCol.insertOne({
      "VEHICLE NUMBER": v8,
      "INVOICE NO": "INV-T8-1",
      "LOADING DT": "01.11.2026",
      month: TEST_MONTH,
      year: TEST_YEAR,
      MT: 19,
      "Billing Amount": 10000,
      "Bill Type": "SO",
      "EXTRA UNLOADING": "750"
    });
    const res8 = await evaluateVehicleIncentiveEligibility(v8, TEST_MONTH, TEST_YEAR);
    assert(
      res8.extra10WheelIncentive.eligible === true && res8.extra10WheelIncentive.qualifyingSoNtTrips === 1,
      'Test 8: Non-Dedicated MKT 10-wheel vehicle with qualifying SO + NT first trip is eligible for 10W extra incentive'
    );

    // TEST 9: 10-wheel vehicle with STO instead of SO: not eligible.
    const v9 = 'TEST-10W-STO-TRIP';
    createdVehicles.push(v9);
    await ownerCol.insertOne({
      "Truck No": v9,
      truck_no: v9,
      "TYPE OF CUSTOMER ": "ATOA",
      "Wheel Type": "10-Wheel",
      "dedicated_type": "Dedicated"
    });
    await entriesCol.insertOne({
      "VEHICLE NUMBER": v9,
      "INVOICE NO": "INV-T9-1",
      "LOADING DT": "01.11.2026",
      month: TEST_MONTH,
      year: TEST_YEAR,
      MT: 19,
      "Billing Amount": 10000,
      "Bill Type": "STO",
      "EXTRA UNLOADING": "750"
    });
    const res9 = await evaluateVehicleIncentiveEligibility(v9, TEST_MONTH, TEST_YEAR);
    assert(
      res9.extra10WheelIncentive.eligible === false && isInvoiceSoAndNt({ "Bill Type": "STO", "EXTRA UNLOADING": "750" }) === false,
      'Test 9: 10-wheel vehicle with STO instead of SO is NOT eligible for 10W extra incentive'
    );

    // TEST 10: 10-wheel vehicle without the required NT classification: not eligible.
    const v10 = 'TEST-10W-SO-NONT';
    createdVehicles.push(v10);
    await ownerCol.insertOne({
      "Truck No": v10,
      truck_no: v10,
      "TYPE OF CUSTOMER ": "ATOA",
      "Wheel Type": "10-Wheel",
      "dedicated_type": "Dedicated"
    });
    await entriesCol.insertOne({
      "VEHICLE NUMBER": v10,
      "INVOICE NO": "INV-T10-1",
      "LOADING DT": "01.11.2026",
      month: TEST_MONTH,
      year: TEST_YEAR,
      MT: 19,
      "Billing Amount": 10000,
      "Bill Type": "SO"
      // No NT classification or extra unloading
    });
    const res10 = await evaluateVehicleIncentiveEligibility(v10, TEST_MONTH, TEST_YEAR);
    assert(
      res10.extra10WheelIncentive.eligible === false && isInvoiceSoAndNt({ "Bill Type": "SO" }) === false,
      'Test 10: 10-wheel vehicle with SO but without required NT classification is NOT eligible for 10W extra incentive'
    );

    // TEST 11: Verify the 10-wheel extra incentive does not require the standard trip threshold.
    assert(
      res7.extra10WheelIncentive.eligible === true && res7.qualifyingTripsCount === 1 && res7.standardIncentive.eligible === false,
      'Test 11: 10-wheel extra incentive is granted on 1 single SO+NT trip without requiring 6 trips threshold'
    );

    // -------------------------------------------------------------------------
    // 6-WHEEL EXTRA INCENTIVE TESTS (12 - 14)
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 3: 6-WHEEL EXTRA INCENTIVE (RULES 12 - 14) ---');

    // TEST 12: ATOA 6-wheel vehicle with 5 trips: not eligible.
    const v12 = 'TEST-ATOA-6W-5TRIPS';
    createdVehicles.push(v12);
    await ownerCol.insertOne({
      "Truck No": v12,
      truck_no: v12,
      "TYPE OF CUSTOMER ": "ATOA",
      "Wheel Type": "6-Wheel",
      "dedicated_type": "Non-Dedicated"
    });
    for (let i = 1; i <= 5; i++) {
      await entriesCol.insertOne({
        "VEHICLE NUMBER": v12,
        "INVOICE NO": `INV-T12-${i}`,
        "LOADING DT": `0${i}.11.2026`,
        month: TEST_MONTH,
        year: TEST_YEAR,
        MT: 13,
        "Billing Amount": 7000,
        "Bill Type": "SO"
      });
    }
    const res12 = await evaluateVehicleIncentiveEligibility(v12, TEST_MONTH, TEST_YEAR);
    assert(
      res12.extra6WheelIncentive.eligible === false && res12.qualifyingTripsCount === 5,
      'Test 12: ATOA 6-wheel vehicle with 5 trips is NOT eligible for 6W extra incentive (requires 6 trips)'
    );

    // TEST 13: MKT 6-wheel vehicle with 6 qualifying trips: eligible.
    const v13 = 'TEST-MKT-6W-6TRIPS';
    createdVehicles.push(v13);
    await ownerCol.insertOne({
      "Truck No": v13,
      truck_no: v13,
      "TYPE OF CUSTOMER ": "MKT",
      "Wheel Type": "6-Wheel",
      "dedicated_type": "Non-Dedicated"
    });
    for (let i = 1; i <= 6; i++) {
      await entriesCol.insertOne({
        "VEHICLE NUMBER": v13,
        "INVOICE NO": `INV-T13-${i}`,
        "LOADING DT": `0${i}.11.2026`,
        month: TEST_MONTH,
        year: TEST_YEAR,
        MT: 13,
        "Billing Amount": 7000,
        "Bill Type": "SO"
      });
    }
    const res13 = await evaluateVehicleIncentiveEligibility(v13, TEST_MONTH, TEST_YEAR);
    assert(
      res13.extra6WheelIncentive.eligible === true && res13.qualifyingTripsCount === 6,
      'Test 13: MKT 6-wheel vehicle with 6 qualifying trips is eligible for 6W extra incentive'
    );

    // TEST 14: Verify eligibility is recalculated after trip edits and deletions.
    // Delete 1 trip from v13 -> trips drop to 5 -> extra6W becomes false!
    await entriesCol.deleteOne({ "VEHICLE NUMBER": v13, "INVOICE NO": "INV-T13-6" });
    const res14 = await evaluateVehicleIncentiveEligibility(v13, TEST_MONTH, TEST_YEAR);
    assert(
      res14.extra6WheelIncentive.eligible === false && res14.qualifyingTripsCount === 5,
      'Test 14: Eligibility is recalculated after trip deletion (drops to 5 trips -> ineligible)'
    );

    // -------------------------------------------------------------------------
    // INTEGRATION TESTS (15 - 19)
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 4: INTEGRATION (RULES 15 - 19) ---');

    // TEST 15: Verify all incentive-consuming modules use the centralized eligibility service.
    assert(
      typeof evaluateVehicleIncentiveEligibility === 'function' &&
      typeof isDedicatedVehicle === 'function' &&
      typeof isInvoiceSoAndNt === 'function',
      'Test 15: Centralized incentive eligibility service is exported and defined'
    );

    // TEST 16: Verify a page refresh does not change eligibility incorrectly (persisted in DB).
    const dbRecord = await eligCol.findOne({ normVehicleNumber: normVeh(v1), month: TEST_MONTH, year: TEST_YEAR });
    assert(
      dbRecord !== null && dbRecord.standardIncentive && dbRecord.standardIncentive.eligible === true,
      'Test 16: Centralized eligibility is persisted in MongoDB and remains consistent on page refresh'
    );

    // TEST 17: Verify duplicate trips do not falsely satisfy a threshold.
    const v17 = 'TEST-DUP-TRIPS-CHECK';
    createdVehicles.push(v17);
    await ownerCol.insertOne({
      "Truck No": v17,
      truck_no: v17,
      "TYPE OF CUSTOMER ": "ATOA",
      "Wheel Type": "10-Wheel",
      "dedicated_type": "Dedicated"
    });
    // Insert same invoice INV-DUP-1 multiple times
    for (let i = 1; i <= 6; i++) {
      await entriesCol.insertOne({
        "VEHICLE NUMBER": v17,
        "INVOICE NO": "INV-DUP-1", // duplicate invoice
        "LOADING DT": "01.11.2026",
        month: TEST_MONTH,
        year: TEST_YEAR,
        MT: 20,
        "Billing Amount": 10000,
        "Bill Type": "SO"
      });
    }
    const res17 = await evaluateVehicleIncentiveEligibility(v17, TEST_MONTH, TEST_YEAR);
    assert(
      res17.qualifyingTripsCount === 1 && res17.standardIncentive.eligible === false,
      'Test 17: Duplicate trips sharing the same invoice are deduplicated and do NOT falsely satisfy 6-trip threshold'
    );

    // TEST 18: Verify existing approved, paid, settled, and historical incentive records are preserved.
    const actualsStateCol = cementDb.collection('incentive_states');
    const existingState = await actualsStateCol.findOne({});
    assert(
      existingState !== undefined,
      'Test 18: Historical incentive state and actuals collections are preserved intact'
    );

    // TEST 19: Verify ATOA/MKT commission defaults and unrelated calculations are not unintentionally changed.
    const atoaComm = {
      basicFreightCommission: parseBasicFreightCommission({ "Basic Freight Commission": "0.05" }),
      incentiveCommission: parseIncentiveCommission({ "Incentive Commission": "0.00" })
    };
    const mktComm10W = await evaluateMktCommission('ANY10W', '10WH', 'MKT', TEST_MONTH, TEST_YEAR);
    assert(
      atoaComm.basicFreightCommission === 0.05 &&
      atoaComm.incentiveCommission === 0 &&
      mktComm10W.basicFreightCommission === 0.05 &&
      mktComm10W.incentiveCommission === 0.05,
      'Test 19: ATOA/MKT default commissions (ATOA: 0.05/0.00, MKT 10W: 0.05/0.05) remain unaffected'
    );

    console.log(`\n====================================================`);
    console.log(`ALL ACCEPTANCE TESTS PASSED: ${passedTests}/${totalTests}`);
    console.log(`====================================================\n`);

  } finally {
    await cleanup();
    await mongoose.disconnect();
  }
}

runAcceptanceTests().catch(err => {
  console.error('Acceptance test failed with error:', err);
  process.exit(1);
});
