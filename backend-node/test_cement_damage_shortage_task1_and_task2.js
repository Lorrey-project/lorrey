const assert = require('assert');
const mongoose = require('mongoose');
require('dotenv').config({ path: __dirname + '/.env' });

// Load frontend calculation utilities
const cementCalculations = require('../frontend/review-dashboard/UI2/src/utils/cementCalculations');

async function runTests() {
  console.log('=== STARTING VALIDATION TESTS FOR TASK 1 AND TASK 2 ===\n');

  // ---------------------------------------------------------
  // TEST 5: Verify Column Definitions (Task 2)
  // ---------------------------------------------------------
  console.log('--- TEST GROUP 1: Cement Register Column Definitions (Task 2) ---');
  const cols = cementCalculations.COLUMNS;
  const visibleCols = cementCalculations.VISIBLE_COLS;

  const damageCol = cols.find(c => c.key === 'Damage Deduction' || (c.label && c.label.includes('DAMAGE\nDEDUCTION')));
  assert.strictEqual(damageCol, undefined, 'DAMAGE DEDUCTION column must NOT exist in COLUMNS');

  const visibleDamageCol = visibleCols.find(c => c.key === 'Damage Deduction' || (c.label && c.label.includes('DAMAGE\nDEDUCTION')));
  assert.strictEqual(visibleDamageCol, undefined, 'DAMAGE DEDUCTION column must NOT be visible in Cement Register UI');

  const shortageAmtCol = cols.find(c => c.key === 'SHORTAGE (AMOUNT)');
  assert.ok(shortageAmtCol, 'SHORTAGE (AMOUNT) column must exist in COLUMNS');

  const visibleShortageAmtCol = visibleCols.find(c => c.key === 'SHORTAGE (AMOUNT)');
  assert.ok(visibleShortageAmtCol, 'SHORTAGE (AMOUNT) column must be visible in Cement Register UI');

  console.log('✔ Task 2: DAMAGE DEDUCTION is removed from UI table columns');
  console.log('✔ Task 2: SHORTAGE (AMOUNT) remains visible in UI table columns');

  // ---------------------------------------------------------
  // TEST 1: Three Comparison Examples in Frontend Calculations (Task 1)
  // ---------------------------------------------------------
  console.log('\n--- TEST GROUP 2: Frontend SHORTAGE (AMOUNT) Calculation Formula ---');
  
  // Example 1: Existing 476, Allocated 500 -> 500
  const rowEx1 = {
    'SHORTAGE (BAG)': 1,
    'SHORTAGE (RATE)': 476,
    'SHORTAGE (AMOUNT)': 500,
    'BILLING ER 95%': 50000
  };
  const resEx1 = shortageAmtCol.formula(rowEx1);
  assert.strictEqual(Number(resEx1), 500, `Example 1: Expected 500, got ${resEx1}`);
  console.log(`✔ Example 1 (Frontend): 476 base, 500 allocated -> ${resEx1}`);

  // Example 2: Existing 476, Allocated 476 -> 476
  const rowEx2 = {
    'SHORTAGE (BAG)': 1,
    'SHORTAGE (RATE)': 476,
    'SHORTAGE (AMOUNT)': 476,
    'BILLING ER 95%': 50000
  };
  const resEx2 = shortageAmtCol.formula(rowEx2);
  assert.strictEqual(Number(resEx2), 476, `Example 2: Expected 476, got ${resEx2}`);
  console.log(`✔ Example 2 (Frontend): 476 base, 476 allocated -> ${resEx2}`);

  // Example 3: Existing 476, Allocated 400 -> 476
  const rowEx3 = {
    'SHORTAGE (BAG)': 1,
    'SHORTAGE (RATE)': 476,
    'SHORTAGE (AMOUNT)': 400,
    'BILLING ER 95%': 50000
  };
  const resEx3 = shortageAmtCol.formula(rowEx3);
  assert.strictEqual(Number(resEx3), 476, `Example 3: Expected 476, got ${resEx3}`);
  console.log(`✔ Example 3 (Frontend): 476 base, 400 allocated -> ${resEx3}`);

  // applyCalcs row tests
  const rowRecalc1 = {
    'SHORTAGE (BAG)': 1,
    'SHORTAGE (RATE)': 476,
    'SHORTAGE (AMOUNT)': 500,
    'BILLING ER 95%': 50000
  };
  const calcRow1 = cementCalculations.applyCalcs(rowRecalc1, 476);
  assert.strictEqual(Number(calcRow1['SHORTAGE (AMOUNT)']), 500, `applyCalcs Ex1: Expected 500, got ${calcRow1['SHORTAGE (AMOUNT)']}`);
  console.log(`✔ applyCalcs Ex1: 476 base, 500 allocated -> ${calcRow1['SHORTAGE (AMOUNT)']}`);

  const rowRecalc3 = {
    'SHORTAGE (BAG)': 1,
    'SHORTAGE (RATE)': 476,
    'SHORTAGE (AMOUNT)': 400,
    'BILLING ER 95%': 50000
  };
  const calcRow3 = cementCalculations.applyCalcs(rowRecalc3, 476);
  assert.strictEqual(Number(calcRow3['SHORTAGE (AMOUNT)']), 476, `applyCalcs Ex3: Expected 476, got ${calcRow3['SHORTAGE (AMOUNT)']}`);
  console.log(`✔ applyCalcs Ex3: 476 base, 400 allocated -> ${calcRow3['SHORTAGE (AMOUNT)']}`);

  // ---------------------------------------------------------
  // TEST GROUP 3: Backend Database Integration Tests (MongoDB)
  // ---------------------------------------------------------
  console.log('\n--- TEST GROUP 3: Backend Database Integration Tests (Task 1) ---');
  await mongoose.connect(process.env.MONGO_URI);
  const cementCol = mongoose.connection.useDb('cement_register').collection('entries');

  // Generate test IDs
  const testTripId1 = new mongoose.Types.ObjectId();
  const testTripId2 = new mongoose.Types.ObjectId();
  const testVehNo = 'TEST-VEH-' + Date.now();
  const billNo = 'TEST-BILL-' + Date.now();
  const allocId1 = new mongoose.Types.ObjectId().toString();
  const allocId2 = new mongoose.Types.ObjectId().toString();

  try {
    // Insert two trips for the same vehicle
    // Trip 1 has 1 bag shortage @ 476
    await cementCol.insertOne({
      _id: testTripId1,
      'VEHICLE NUMBER': testVehNo,
      'INVOICE NO': 'INV-TRIP-1',
      'LOADING DT': '01-10-2026',
      'SHORTAGE (BAG)': '1',
      'SHORTAGE (RATE)': '476',
      'SHORTAGE (AMOUNT)': 476,
      'BILLING ER 95%': 50000,
      'NET AMOUNT': 49524
    });

    // Trip 2 has 2 bag shortage @ 476 = 952
    await cementCol.insertOne({
      _id: testTripId2,
      'VEHICLE NUMBER': testVehNo,
      'INVOICE NO': 'INV-TRIP-2',
      'LOADING DT': '02-10-2026',
      'SHORTAGE (BAG)': '2',
      'SHORTAGE (RATE)': '476',
      'SHORTAGE (AMOUNT)': 952,
      'BILLING ER 95%': 60000,
      'NET AMOUNT': 59048
    });

    const { syncDebitAllocationToCementRegister } = require('./routes/financialYearRoutes');

    // 1. Test Example 1: Existing 476, final allocated amount = 500 -> update to 500
    console.log('\nTest Case 1: Existing = 476, Allocated = 500');
    await syncDebitAllocationToCementRegister({
      billNo,
      debitReason: 'DAMAGE / SHORTAGE',
      financialYear: '2026-2027',
      allocationId: allocId1,
      previousTripAllocations: [],
      tripAllocations: [
        {
          tripRecordId: testTripId1.toString(),
          allocatedAmount: 500,
          vehicleNumber: testVehNo,
          invoiceNo: 'INV-TRIP-1'
        }
      ],
      isDelete: false
    });

    let trip1Doc = await cementCol.findOne({ _id: testTripId1 });
    let trip2Doc = await cementCol.findOne({ _id: testTripId2 });
    assert.strictEqual(trip1Doc['SHORTAGE (AMOUNT)'], 500, `Expected SHORTAGE (AMOUNT) to be 500, got ${trip1Doc['SHORTAGE (AMOUNT)']}`);
    assert.strictEqual(trip2Doc['SHORTAGE (AMOUNT)'], 952, 'Trip 2 must NOT be modified by allocation to Trip 1');
    console.log(`✔ Trip 1 SHORTAGE (AMOUNT) updated to ₹${trip1Doc['SHORTAGE (AMOUNT)']}`);
    console.log(`✔ Trip 2 on same vehicle remained untouched at ₹${trip2Doc['SHORTAGE (AMOUNT)']}`);

    // 2. Test Example 2: Update allocation to 476 (Equal to existing base 476) -> preserved/no change
    console.log('\nTest Case 2: Existing base = 476, Allocated = 476');
    await syncDebitAllocationToCementRegister({
      billNo,
      debitReason: 'DAMAGE / SHORTAGE',
      financialYear: '2026-2027',
      allocationId: allocId1,
      previousTripAllocations: [
        {
          tripRecordId: testTripId1.toString(),
          allocatedAmount: 500,
          vehicleNumber: testVehNo,
          invoiceNo: 'INV-TRIP-1'
        }
      ],
      tripAllocations: [
        {
          tripRecordId: testTripId1.toString(),
          allocatedAmount: 476,
          vehicleNumber: testVehNo,
          invoiceNo: 'INV-TRIP-1'
        }
      ],
      isDelete: false
    });

    trip1Doc = await cementCol.findOne({ _id: testTripId1 });
    assert.strictEqual(trip1Doc['SHORTAGE (AMOUNT)'], 476, `Expected SHORTAGE (AMOUNT) to be 476, got ${trip1Doc['SHORTAGE (AMOUNT)']}`);
    console.log(`✔ Trip 1 SHORTAGE (AMOUNT) with allocated ₹476 -> preserved at ₹${trip1Doc['SHORTAGE (AMOUNT)']}`);

    // 3. Test Example 3: Update allocation to 400 (Less than base 476) -> preserve 476
    console.log('\nTest Case 3: Existing base = 476, Allocated = 400');
    await syncDebitAllocationToCementRegister({
      billNo,
      debitReason: 'DAMAGE / SHORTAGE',
      financialYear: '2026-2027',
      allocationId: allocId1,
      previousTripAllocations: [
        {
          tripRecordId: testTripId1.toString(),
          allocatedAmount: 476,
          vehicleNumber: testVehNo,
          invoiceNo: 'INV-TRIP-1'
        }
      ],
      tripAllocations: [
        {
          tripRecordId: testTripId1.toString(),
          allocatedAmount: 400,
          vehicleNumber: testVehNo,
          invoiceNo: 'INV-TRIP-1'
        }
      ],
      isDelete: false
    });

    trip1Doc = await cementCol.findOne({ _id: testTripId1 });
    assert.strictEqual(trip1Doc['SHORTAGE (AMOUNT)'], 476, `Expected SHORTAGE (AMOUNT) to preserve 476, got ${trip1Doc['SHORTAGE (AMOUNT)']}`);
    console.log(`✔ Trip 1 SHORTAGE (AMOUNT) with allocated ₹400 -> preserved at ₹${trip1Doc['SHORTAGE (AMOUNT)']}`);

    // 4. Test Multiple Partial Allocations for the same trip (Cumulative amount used)
    console.log('\nTest Case 4: Multiple Partial Allocations (Cumulative Amount)');
    // Bill 1 allocates 300, Bill 2 allocates 350 -> Total = 650 > 476 -> SHORTAGE (AMOUNT) = 650
    await syncDebitAllocationToCementRegister({
      billNo: 'BILL-PARTIAL-1',
      debitReason: 'DAMAGE / SHORTAGE',
      financialYear: '2026-2027',
      allocationId: allocId1,
      previousTripAllocations: [
        {
          tripRecordId: testTripId1.toString(),
          allocatedAmount: 400,
          vehicleNumber: testVehNo,
          invoiceNo: 'INV-TRIP-1'
        }
      ],
      tripAllocations: [
        {
          tripRecordId: testTripId1.toString(),
          allocatedAmount: 300,
          vehicleNumber: testVehNo,
          invoiceNo: 'INV-TRIP-1'
        }
      ],
      isDelete: false
    });

    await syncDebitAllocationToCementRegister({
      billNo: 'BILL-PARTIAL-2',
      debitReason: 'DAMAGE / SHORTAGE',
      financialYear: '2026-2027',
      allocationId: allocId2,
      previousTripAllocations: [],
      tripAllocations: [
        {
          tripRecordId: testTripId1.toString(),
          allocatedAmount: 350,
          vehicleNumber: testVehNo,
          invoiceNo: 'INV-TRIP-1'
        }
      ],
      isDelete: false
    });

    trip1Doc = await cementCol.findOne({ _id: testTripId1 });
    assert.strictEqual(trip1Doc['SHORTAGE (AMOUNT)'], 650, `Cumulative allocated: Expected 650, got ${trip1Doc['SHORTAGE (AMOUNT)']}`);
    console.log(`✔ Trip 1 with partial allocations 300 + 350 = ₹650 -> SHORTAGE (AMOUNT) = ₹${trip1Doc['SHORTAGE (AMOUNT)']}`);

    // 5. Test Deletion of one allocation (Recalculate correctly)
    console.log('\nTest Case 5: Deletion of one partial allocation');
    await syncDebitAllocationToCementRegister({
      billNo: 'BILL-PARTIAL-2',
      debitReason: 'DAMAGE / SHORTAGE',
      financialYear: '2026-2027',
      allocationId: allocId2,
      previousTripAllocations: [
        {
          tripRecordId: testTripId1.toString(),
          allocatedAmount: 350,
          vehicleNumber: testVehNo,
          invoiceNo: 'INV-TRIP-1'
        }
      ],
      tripAllocations: [],
      isDelete: true
    });

    trip1Doc = await cementCol.findOne({ _id: testTripId1 });
    // Remaining is 300. Since 300 < 476, SHORTAGE (AMOUNT) must be preserved at 476!
    assert.strictEqual(trip1Doc['SHORTAGE (AMOUNT)'], 476, `After deleting one alloc (remaining 300 < 476): Expected 476, got ${trip1Doc['SHORTAGE (AMOUNT)']}`);
    console.log(`✔ After deleting allocation 2, remaining allocation is 300 (< 476) -> SHORTAGE (AMOUNT) = ₹${trip1Doc['SHORTAGE (AMOUNT)']}`);

    // 6. Test Deletion of all allocations (Returns to base amount 476)
    console.log('\nTest Case 6: Deletion of all allocations');
    await syncDebitAllocationToCementRegister({
      billNo: 'BILL-PARTIAL-1',
      debitReason: 'DAMAGE / SHORTAGE',
      financialYear: '2026-2027',
      allocationId: allocId1,
      previousTripAllocations: [
        {
          tripRecordId: testTripId1.toString(),
          allocatedAmount: 300,
          vehicleNumber: testVehNo,
          invoiceNo: 'INV-TRIP-1'
        }
      ],
      tripAllocations: [],
      isDelete: true
    });

    trip1Doc = await cementCol.findOne({ _id: testTripId1 });
    assert.strictEqual(trip1Doc['SHORTAGE (AMOUNT)'], 476, `After deleting all allocations: Expected 476, got ${trip1Doc['SHORTAGE (AMOUNT)']}`);
    console.log(`✔ All allocations removed -> SHORTAGE (AMOUNT) restored to base ₹${trip1Doc['SHORTAGE (AMOUNT)']}`);

    // 7. Verify Idempotence (Resave / Refresh without duplicates)
    console.log('\nTest Case 7: Resave / Refresh Idempotence');
    await syncDebitAllocationToCementRegister({
      billNo,
      debitReason: 'DAMAGE / SHORTAGE',
      financialYear: '2026-2027',
      allocationId: allocId1,
      previousTripAllocations: [],
      tripAllocations: [
        {
          tripRecordId: testTripId1.toString(),
          allocatedAmount: 500,
          vehicleNumber: testVehNo,
          invoiceNo: 'INV-TRIP-1'
        }
      ],
      isDelete: false
    });
    // Resave identical allocation
    await syncDebitAllocationToCementRegister({
      billNo,
      debitReason: 'DAMAGE / SHORTAGE',
      financialYear: '2026-2027',
      allocationId: allocId1,
      previousTripAllocations: [
        {
          tripRecordId: testTripId1.toString(),
          allocatedAmount: 500,
          vehicleNumber: testVehNo,
          invoiceNo: 'INV-TRIP-1'
        }
      ],
      tripAllocations: [
        {
          tripRecordId: testTripId1.toString(),
          allocatedAmount: 500,
          vehicleNumber: testVehNo,
          invoiceNo: 'INV-TRIP-1'
        }
      ],
      isDelete: false
    });
    trip1Doc = await cementCol.findOne({ _id: testTripId1 });
    const allocCount = (trip1Doc.debitAllocations || []).filter(a => a.allocationId === allocId1).length;
    assert.strictEqual(allocCount, 1, 'Allocation must not be duplicated on resave');
    assert.strictEqual(trip1Doc['SHORTAGE (AMOUNT)'], 500, 'Amount must be 500 without double counting');
    console.log(`✔ Resave idempotence confirmed: 1 entry, amount = ₹${trip1Doc['SHORTAGE (AMOUNT)']}`);

  } finally {
    // Cleanup test documents
    await cementCol.deleteMany({ _id: { $in: [testTripId1, testTripId2] } });
    await mongoose.disconnect();
  }

  console.log('\n======================================================');
  console.log('ALL TESTS PASSED SUCCESSFULLY! (Tasks 1 & 2 verified)');
  console.log('======================================================\n');
}

runTests().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
