const mongoose = require('mongoose');
const assert = require('assert');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const FinancialYearRow = require('./models/FinancialYearRow');
const FinancialYearPayment = require('./models/FinancialYearPayment');

// We test by making direct HTTP calls to the running backend or importing the router handler / testing via supertest/express.
// Since server is running or we can test the routes directly, let's test via HTTP against http://localhost:3000
const axios = require('axios');
const API_BASE = 'http://localhost:3000';

async function runTests() {
  console.log("========================================================================");
  console.log("RUNNING ACCEPTANCE TEST SUITE: DEDUCTION ALLOCATION AMOUNT REPLACEMENT");
  console.log("========================================================================\n");

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGO_URI);
  }

  const cementCol = mongoose.connection.useDb("cement_register").collection("entries");
  const fyRowCol = mongoose.connection.useDb("financial_year").collection("rows");

  const DEDUCTION_REASONS = [
    {
      name: 'DAMAGE / SHORTAGE',
      canonical: 'Damage / Shortage',
      primaryField: 'SHORTAGE (AMOUNT)',
      relatedField: 'Damage Deduction'
    },
    {
      name: 'RFID',
      canonical: 'RFID Deduction / Charges',
      primaryField: 'Give RFID TAG',
      relatedField: null
    },
    {
      name: 'GPS DEVIATION CHARGES',
      canonical: 'GPS Deviation Charge',
      primaryField: 'GPS Deviation Charges',
      relatedField: null
    },
    {
      name: 'GPS DEVICE',
      canonical: 'GPS Installation Charges',
      primaryField: 'Give GPS DEVICE',
      relatedField: null
    },
    {
      name: 'GPS MONITORING / TRIP CHARGE',
      canonical: 'GPS Monitoring / Trip Charges',
      primaryField: 'GPS Monitoring Charge',
      relatedField: null
    },
    {
      name: 'SUSPENSE',
      canonical: 'Suspense',
      primaryField: 'Suspense',
      relatedField: null
    }
  ];

  let passedTotal = 0;
  let testCountTotal = 0;

  for (const reasonConfig of DEDUCTION_REASONS) {
    console.log(`\n------------------------------------------------------------------------`);
    console.log(`TESTING REASON: ${reasonConfig.name} (Canonical: ${reasonConfig.canonical})`);
    console.log(`Target Field: ${reasonConfig.primaryField}`);
    console.log(`------------------------------------------------------------------------`);

    const prefix = `TEST_${reasonConfig.name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;
    const trip1Id = new mongoose.Types.ObjectId();
    const trip2Id = new mongoose.Types.ObjectId();
    const bill1 = `${prefix}_BILL1`;
    const bill2 = `${prefix}_BILL2`;
    const vehicle1 = `TRUCK_${prefix}_1`;
    const vehicle2 = `TRUCK_${prefix}_2`;

    // Clean up
    await cementCol.deleteMany({ _id: { $in: [trip1Id, trip2Id] } });
    await fyRowCol.deleteMany({ billNo: { $in: [bill1, bill2] } });

    // 1. Create Trip 1 with Existing Amount = 1,000
    const initialTrip1 = {
      _id: trip1Id,
      'VEHICLE NUMBER': vehicle1,
      'INVOICE NO': `INV_${prefix}_1`,
      'LOADING DT': '10-10-2026',
      'BILLING ER 95%': 50000,
      'NET AMOUNT': 49000,
      'GROSS AMOUNT': 49000,
      [reasonConfig.primaryField]: 1000,
      debitAllocations: []
    };
    if (reasonConfig.relatedField) {
      initialTrip1[reasonConfig.relatedField] = 1000;
    }
    await cementCol.insertOne(initialTrip1);

    // Create Trip 2 with Existing Amount = 1,000 for trip isolation test
    const initialTrip2 = {
      _id: trip2Id,
      'VEHICLE NUMBER': vehicle2,
      'INVOICE NO': `INV_${prefix}_2`,
      'LOADING DT': '10-10-2026',
      'BILLING ER 95%': 50000,
      'NET AMOUNT': 49000,
      'GROSS AMOUNT': 49000,
      [reasonConfig.primaryField]: 1000,
      debitAllocations: []
    };
    if (reasonConfig.relatedField) {
      initialTrip2[reasonConfig.relatedField] = 1000;
    }
    await cementCol.insertOne(initialTrip2);

    // Create FinancialYearRow for Bill 1 (Original Debit: 10,000)
    await fyRowCol.insertOne({
      billNo: bill1,
      originalDebitAmount: 10000,
      totalAllocatedAmount: 0,
      remainingDebitAmount: 10000,
      deductionAllocations: []
    });

    // ── Test 1: Case A — Greater than (Existing: 1,000; Allocation: 1,200 -> Result: 1,200, NOT 2,200) ──
    testCountTotal++;
    console.log(`[Test 1] Greater-than: Existing ₹1,000; allocation ₹1,200...`);
    const alloc1Res = await axios.post(`${API_BASE}/fy-details/allocate-deduction`, {
      billNo: bill1,
      debitReason: reasonConfig.name,
      financialYear: '2026-2027',
      months: ['October'],
      vehicles: [vehicle1],
      originalDebitAmount: 10000,
      allocatedAmount: 1200,
      tripAllocations: [
        {
          tripRecordId: String(trip1Id),
          tripId: String(trip1Id),
          vehicle: vehicle1,
          month: 'October',
          loadingDate: '10-10-2026',
          allocatedAmount: 1200
        }
      ]
    });
    assert.strictEqual(alloc1Res.data.success, true, 'allocate-deduction API should succeed');

    let trip1Doc = await cementCol.findOne({ _id: trip1Id });
    assert.strictEqual(
      trip1Doc[reasonConfig.primaryField],
      1200,
      `Case A: ${reasonConfig.primaryField} must be ₹1,200, not ${trip1Doc[reasonConfig.primaryField]} (must NOT be ₹2,200)`
    );
    if (reasonConfig.relatedField) {
      assert.strictEqual(
        trip1Doc[reasonConfig.relatedField],
        1200,
        `Case A: ${reasonConfig.relatedField} must also be ₹1,200, not ${trip1Doc[reasonConfig.relatedField]}`
      );
    }
    console.log(`✅ Passed: ${reasonConfig.primaryField} = ₹1,200 (not ₹2,200)`);
    passedTotal++;

    // ── Test 5: Re-saving the same allocation does not increase the amount ──
    testCountTotal++;
    console.log(`[Test 5] Re-saving the same allocation (duplicate save)...`);
    const allocId1 = alloc1Res.data.allocation.allocationId;
    const reSaveRes = await axios.post(`${API_BASE}/fy-details/allocate-deduction`, {
      billNo: bill1,
      allocationId: allocId1,
      debitReason: reasonConfig.name,
      financialYear: '2026-2027',
      months: ['October'],
      vehicles: [vehicle1],
      originalDebitAmount: 10000,
      allocatedAmount: 1200,
      tripAllocations: [
        {
          tripRecordId: String(trip1Id),
          tripId: String(trip1Id),
          vehicle: vehicle1,
          month: 'October',
          loadingDate: '10-10-2026',
          allocatedAmount: 1200
        }
      ]
    });
    assert.strictEqual(reSaveRes.data.success, true);
    trip1Doc = await cementCol.findOne({ _id: trip1Id });
    assert.strictEqual(
      trip1Doc[reasonConfig.primaryField],
      1200,
      `Re-saving must keep value at ₹1,200, not ${trip1Doc[reasonConfig.primaryField]}`
    );
    console.log(`✅ Passed: Value remains ₹1,200 after re-save`);
    passedTotal++;

    // ── Test 8A: Edit allocation up (to ₹1,500) ──
    testCountTotal++;
    console.log(`[Test 8A] Edit allocation to ₹1,500...`);
    const editUpRes = await axios.post(`${API_BASE}/fy-details/allocate-deduction`, {
      billNo: bill1,
      allocationId: allocId1,
      debitReason: reasonConfig.name,
      financialYear: '2026-2027',
      months: ['October'],
      vehicles: [vehicle1],
      originalDebitAmount: 10000,
      allocatedAmount: 1500,
      tripAllocations: [
        {
          tripRecordId: String(trip1Id),
          tripId: String(trip1Id),
          vehicle: vehicle1,
          month: 'October',
          loadingDate: '10-10-2026',
          allocatedAmount: 1500
        }
      ]
    });
    assert.strictEqual(editUpRes.data.success, true);
    trip1Doc = await cementCol.findOne({ _id: trip1Id });
    assert.strictEqual(
      trip1Doc[reasonConfig.primaryField],
      1500,
      `Editing to ₹1,500 must update field to ₹1,500, not ${trip1Doc[reasonConfig.primaryField]}`
    );
    console.log(`✅ Passed: Value updated to ₹1,500`);
    passedTotal++;

    // ── Test 2 & 8B: Edit allocation to equal existing amount (₹1,000) ──
    testCountTotal++;
    console.log(`[Test 2 & 8B] Equal-to: Edit allocation to ₹1,000 (equal to base ₹1,000)...`);
    const editEqRes = await axios.post(`${API_BASE}/fy-details/allocate-deduction`, {
      billNo: bill1,
      allocationId: allocId1,
      debitReason: reasonConfig.name,
      financialYear: '2026-2027',
      months: ['October'],
      vehicles: [vehicle1],
      originalDebitAmount: 10000,
      allocatedAmount: 1000,
      tripAllocations: [
        {
          tripRecordId: String(trip1Id),
          tripId: String(trip1Id),
          vehicle: vehicle1,
          month: 'October',
          loadingDate: '10-10-2026',
          allocatedAmount: 1000
        }
      ]
    });
    assert.strictEqual(editEqRes.data.success, true);
    trip1Doc = await cementCol.findOne({ _id: trip1Id });
    assert.strictEqual(
      trip1Doc[reasonConfig.primaryField],
      1000,
      `Case B: Value must remain ₹1,000, not ${trip1Doc[reasonConfig.primaryField]}`
    );
    console.log(`✅ Passed: Value remains ₹1,000`);
    passedTotal++;

    // ── Test 3 & 8C: Edit allocation lower than existing amount (₹800) ──
    testCountTotal++;
    console.log(`[Test 3 & 8C] Lower-than: Edit allocation to ₹800 (lower than base ₹1,000)...`);
    const editLowRes = await axios.post(`${API_BASE}/fy-details/allocate-deduction`, {
      billNo: bill1,
      allocationId: allocId1,
      debitReason: reasonConfig.name,
      financialYear: '2026-2027',
      months: ['October'],
      vehicles: [vehicle1],
      originalDebitAmount: 10000,
      allocatedAmount: 800,
      tripAllocations: [
        {
          tripRecordId: String(trip1Id),
          tripId: String(trip1Id),
          vehicle: vehicle1,
          month: 'October',
          loadingDate: '10-10-2026',
          allocatedAmount: 800
        }
      ]
    });
    assert.strictEqual(editLowRes.data.success, true);
    trip1Doc = await cementCol.findOne({ _id: trip1Id });
    assert.strictEqual(
      trip1Doc[reasonConfig.primaryField],
      1000,
      `Case C: Value must remain ₹1,000, not lower ₹800 or ${trip1Doc[reasonConfig.primaryField]}`
    );
    console.log(`✅ Passed: Value preserved at ₹1,000`);
    passedTotal++;

    // ── Test 9: Delete allocation (reverts to baseline ₹1,000) ──
    testCountTotal++;
    console.log(`[Test 9] Delete allocation...`);
    const delRes = await axios.delete(`${API_BASE}/fy-details/allocate-deduction/${bill1}/${allocId1}`);
    assert.strictEqual(delRes.data.success, true);
    trip1Doc = await cementCol.findOne({ _id: trip1Id });
    assert.strictEqual(
      trip1Doc[reasonConfig.primaryField],
      1000,
      `After deletion, value must revert to base ₹1,000, not ${trip1Doc[reasonConfig.primaryField]}`
    );
    assert.strictEqual(trip1Doc.debitAllocations.length, 0, 'debitAllocations must be empty');
    console.log(`✅ Passed: After delete, value reverts to ₹1,000`);
    passedTotal++;

    // ── Test 4: Multiple entries (₹600 + ₹600 = ₹1,200 cumulative) ──
    testCountTotal++;
    console.log(`[Test 4] Two allocation entries of ₹600 and ₹600...`);
    // First entry: ₹600
    const allocEntry1 = await axios.post(`${API_BASE}/fy-details/allocate-deduction`, {
      billNo: bill1,
      debitReason: reasonConfig.name,
      financialYear: '2026-2027',
      months: ['October'],
      vehicles: [vehicle1],
      originalDebitAmount: 10000,
      allocatedAmount: 600,
      tripAllocations: [
        {
          tripRecordId: String(trip1Id),
          tripId: String(trip1Id),
          vehicle: vehicle1,
          month: 'October',
          loadingDate: '10-10-2026',
          allocatedAmount: 600
        }
      ]
    });
    assert.strictEqual(allocEntry1.data.success, true);
    trip1Doc = await cementCol.findOne({ _id: trip1Id });
    // Since cumulative 600 < base 1000, field should still be 1000
    assert.strictEqual(trip1Doc[reasonConfig.primaryField], 1000, 'With 600 allocated (< 1000), field remains 1000');

    // Create Bill 2 for the second entry
    await fyRowCol.insertOne({
      billNo: bill2,
      originalDebitAmount: 10000,
      totalAllocatedAmount: 0,
      remainingDebitAmount: 10000,
      deductionAllocations: []
    });

    // Second entry from Bill 2: ₹600
    const allocEntry2 = await axios.post(`${API_BASE}/fy-details/allocate-deduction`, {
      billNo: bill2,
      debitReason: reasonConfig.name,
      financialYear: '2026-2027',
      months: ['October'],
      vehicles: [vehicle1],
      originalDebitAmount: 10000,
      allocatedAmount: 600,
      tripAllocations: [
        {
          tripRecordId: String(trip1Id),
          tripId: String(trip1Id),
          vehicle: vehicle1,
          month: 'October',
          loadingDate: '10-10-2026',
          allocatedAmount: 600
        }
      ]
    });
    assert.strictEqual(allocEntry2.data.success, true);

    trip1Doc = await cementCol.findOne({ _id: trip1Id });
    // Cumulative allocation is 600 + 600 = 1200 (> 1000), so field must be 1200
    assert.strictEqual(
      trip1Doc[reasonConfig.primaryField],
      1200,
      `Two ₹600 entries (total ₹1,200) must update field to ₹1,200 once, not ${trip1Doc[reasonConfig.primaryField]}`
    );
    console.log(`✅ Passed: Two ₹600 entries updated cumulative amount to ₹1,200`);
    passedTotal++;

    // ── Test 6: Trip Isolation (Trip 2 is not modified by allocations to Trip 1) ──
    testCountTotal++;
    console.log(`[Test 6] Trip Isolation: Trip 2 remains untouched...`);
    const trip2Doc = await cementCol.findOne({ _id: trip2Id });
    assert.strictEqual(
      trip2Doc[reasonConfig.primaryField],
      1000,
      `Trip 2 must remain ₹1,000, not ${trip2Doc[reasonConfig.primaryField]}`
    );
    assert.strictEqual(trip2Doc.debitAllocations.length, 0, 'Trip 2 must have no debit allocations');
    console.log(`✅ Passed: Trip 2 remains ₹1,000`);
    passedTotal++;

    // ── Test 7: Reason Isolation (Allocating another deduction reason does not modify this reason) ──
    testCountTotal++;
    console.log(`[Test 7] Reason Isolation: Allocating another reason does not modify ${reasonConfig.name}...`);
    const otherReason = reasonConfig.name === 'SUSPENSE' ? 'RFID' : 'SUSPENSE';
    const otherTargetField = otherReason === 'RFID' ? 'Give RFID TAG' : 'Suspense';

    await axios.post(`${API_BASE}/fy-details/allocate-deduction`, {
      billNo: bill2,
      debitReason: otherReason,
      financialYear: '2026-2027',
      months: ['October'],
      vehicles: [vehicle1],
      originalDebitAmount: 10000,
      allocatedAmount: 500,
      tripAllocations: [
        {
          tripRecordId: String(trip1Id),
          tripId: String(trip1Id),
          vehicle: vehicle1,
          month: 'October',
          loadingDate: '10-10-2026',
          allocatedAmount: 500
        }
      ]
    });

    trip1Doc = await cementCol.findOne({ _id: trip1Id });
    assert.strictEqual(
      trip1Doc[reasonConfig.primaryField],
      1200,
      `Allocating ${otherReason} must NOT change ${reasonConfig.primaryField} (expected 1200, got ${trip1Doc[reasonConfig.primaryField]})`
    );
    assert.strictEqual(
      trip1Doc[otherTargetField],
      500,
      `${otherTargetField} must be updated to 500`
    );
    console.log(`✅ Passed: Other reason allocated without affecting ${reasonConfig.name}`);
    passedTotal++;

    // ── Test 10: Specific field mapping check (no unauthorized duplicate fields) ──
    testCountTotal++;
    console.log(`[Test 10] Checking no unwanted duplicate fields created on trip...`);
    if (reasonConfig.name === 'RFID') {
      assert.strictEqual(trip1Doc['RFID Charges'], undefined, 'RFID Charges should not be created');
      assert.strictEqual(trip1Doc['RFID Deduction / Charges'], undefined, 'RFID Deduction / Charges should not be created');
    } else if (reasonConfig.name === 'GPS DEVICE') {
      assert.strictEqual(trip1Doc['Device Installation Charges'], undefined, 'Device Installation Charges should not be created');
      assert.strictEqual(trip1Doc['GPS Installation Charges'], undefined, 'GPS Installation Charges should not be created');
    }
    console.log(`✅ Passed: Clean authoritative field mapping verified`);
    passedTotal++;

    // Cleanup test records
    await cementCol.deleteMany({ _id: { $in: [trip1Id, trip2Id] } });
    await fyRowCol.deleteMany({ billNo: { $in: [bill1, bill2] } });
  }

  console.log(`\n========================================================================`);
  console.log(`FINAL RESULTS: ${passedTotal}/${testCountTotal} TESTS PASSED SUCCESSFULLY!`);
  console.log(`========================================================================\n`);

  await mongoose.disconnect();
}

runTests().catch(err => {
  console.error("Test Suite Failed with Error:", err);
  process.exit(1);
});
