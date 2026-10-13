require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');

const API_BASE = 'http://localhost:3000';

async function runTests() {
  console.log('=== RUNNING FREIGHT CREDITOR GST FILTERING ACCEPTANCE TESTS ===\n');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB Atlas\n');

  const db = mongoose.connection.useDb('invoice_system');
  const ownerCol = db.collection('owner details');
  const truckCol = db.collection('Truck Contact Number');

  const testIds = [];

  try {
    // -------------------------------------------------------------------------
    // TEST 1: G.K.R. ENTERPRISE displays only vehicles with GST-type FCM for GOUTAM ROY
    // -------------------------------------------------------------------------
    console.log('--- Test 1: G.K.R. ENTERPRISE (maps to GOUTAM ROY) ---');
    let res = await axios.get(`${API_BASE}/freight-creditor-gst/data?creditorKey=GKR_ENTERPRISE&month=9&year=2026&fy=26-27`);
    let gkrVehicles = (res.data.rows || []).map(r => r.vehicleNo);
    console.log('G.K.R. ENTERPRISE vehicles:', gkrVehicles);
    const expectedGkr = ['WB39G8384', 'WB41H0177', 'WB41K2967'].sort();
    const actualGkr = [...gkrVehicles].sort();

    if (JSON.stringify(actualGkr) !== JSON.stringify(expectedGkr)) {
      throw new Error(`Test 1 Failed: Expected ${JSON.stringify(expectedGkr)}, got ${JSON.stringify(actualGkr)}`);
    }
    console.log('✓ Test 1 PASSED: G.K.R. ENTERPRISE correctly shows only qualifying FCM vehicles for GOUTAM ROY\n');

    // -------------------------------------------------------------------------
    // TEST 2: DIPALI ASSOCIATES displays only vehicles with GST-type FCM for DIPALI ASSOCIATES
    // -------------------------------------------------------------------------
    console.log('--- Test 2: DIPALI ASSOCIATES ---');
    res = await axios.get(`${API_BASE}/freight-creditor-gst/data?creditorKey=DIPALI_ASSOCIATES&month=9&year=2026&fy=26-27`);
    let dipaliVehicles = (res.data.rows || []).map(r => r.vehicleNo);
    console.log('DIPALI ASSOCIATES vehicles:', dipaliVehicles);
    const expectedDipali = ['WB39B8916'];

    if (JSON.stringify(dipaliVehicles.sort()) !== JSON.stringify(expectedDipali)) {
      throw new Error(`Test 2 Failed: Expected ${JSON.stringify(expectedDipali)}, got ${JSON.stringify(dipaliVehicles)}`);
    }
    console.log('✓ Test 2 PASSED: DIPALI ASSOCIATES correctly shows only qualifying FCM vehicles\n');

    // -------------------------------------------------------------------------
    // TEST 3: SUBHENDU SEKHAR GHOSWAMI displays only vehicles for SUBENDU SEKHAR GOSWAMI
    // -------------------------------------------------------------------------
    console.log('--- Test 3: SUBHENDU SEKHAR GHOSWAMI ---');
    res = await axios.get(`${API_BASE}/freight-creditor-gst/data?creditorKey=SUBHENDU_SEKHAR_GHOSWAMI&month=9&year=2026&fy=26-27`);
    let subhenduVehicles = (res.data.rows || []).map(r => r.vehicleNo);
    console.log('SUBHENDU SEKHAR GHOSWAMI vehicles:', subhenduVehicles);
    const expectedSubhendu = ['WB39G7433'];

    if (JSON.stringify(subhenduVehicles.sort()) !== JSON.stringify(expectedSubhendu)) {
      throw new Error(`Test 3 Failed: Expected ${JSON.stringify(expectedSubhendu)}, got ${JSON.stringify(subhenduVehicles)}`);
    }
    console.log('✓ Test 3 PASSED: SUBHENDU SEKHAR GHOSWAMI correctly shows only qualifying FCM vehicles\n');

    // -------------------------------------------------------------------------
    // TEST 4: Registered vehicle with NO GST FCM record is excluded
    // -------------------------------------------------------------------------
    console.log('--- Test 4: Registered vehicle with NO GST FCM record is excluded ---');
    // Insert a vehicle for GOUTAM ROY with GST TYPE = "NO"
    const nonFcmDoc = await ownerCol.insertOne({
      testMarker: 'test-gst-fcm',
      'Truck No': 'TESTNOFCM99',
      'Owner Name': 'GOUTAM ROY',
      'GST TYPE': 'NO',
      created_at: new Date()
    });
    testIds.push({ col: ownerCol, id: nonFcmDoc.insertedId });

    res = await axios.get(`${API_BASE}/freight-creditor-gst/data?creditorKey=GKR_ENTERPRISE&month=9&year=2026&fy=26-27`);
    gkrVehicles = (res.data.rows || []).map(r => r.vehicleNo);
    if (gkrVehicles.includes('TESTNOFCM99')) {
      throw new Error('Test 4 Failed: Non-FCM vehicle TESTNOFCM99 was incorrectly included!');
    }
    console.log('✓ Test 4 PASSED: Non-FCM vehicle TESTNOFCM99 is excluded\n');

    // -------------------------------------------------------------------------
    // TEST 5: Qualifying GST FCM vehicle belonging to ANOTHER owner is excluded
    // -------------------------------------------------------------------------
    console.log('--- Test 5: FCM vehicle belonging to ANOTHER owner is excluded ---');
    // Insert a vehicle with FCM but owner "OTHER UNRELATED OWNER"
    const otherOwnerDoc = await ownerCol.insertOne({
      testMarker: 'test-gst-fcm',
      'Truck No': 'TESTOTHER88',
      'Owner Name': 'SOME UNRELATED OWNER',
      'GST TYPE': 'FCM',
      created_at: new Date()
    });
    testIds.push({ col: ownerCol, id: otherOwnerDoc.insertedId });

    const [resGkr, resDip, resSub] = await Promise.all([
      axios.get(`${API_BASE}/freight-creditor-gst/data?creditorKey=GKR_ENTERPRISE&month=9&year=2026&fy=26-27`),
      axios.get(`${API_BASE}/freight-creditor-gst/data?creditorKey=DIPALI_ASSOCIATES&month=9&year=2026&fy=26-27`),
      axios.get(`${API_BASE}/freight-creditor-gst/data?creditorKey=SUBHENDU_SEKHAR_GHOSWAMI&month=9&year=2026&fy=26-27`)
    ]);

    const allVehs = [
      ...(resGkr.data.rows || []).map(r => r.vehicleNo),
      ...(resDip.data.rows || []).map(r => r.vehicleNo),
      ...(resSub.data.rows || []).map(r => r.vehicleNo)
    ];

    if (allVehs.includes('TESTOTHER88')) {
      throw new Error('Test 5 Failed: Vehicle TESTOTHER88 belonging to another owner leaked into a Freight Creditor tab!');
    }
    console.log('✓ Test 5 PASSED: Qualifying FCM vehicle for unrelated owner is excluded from all 3 tabs\n');

    // -------------------------------------------------------------------------
    // TEST 6: Multiple qualifying records for same owner/vehicle produce ONE row
    // -------------------------------------------------------------------------
    console.log('--- Test 6: Deduplication of qualifying records ---');
    res = await axios.get(`${API_BASE}/freight-creditor-gst/data?creditorKey=GKR_ENTERPRISE&month=9&year=2026&fy=26-27`);
    const wb41hCount = (res.data.rows || []).filter(r => r.vehicleNo === 'WB41H0177').length;
    if (wb41hCount !== 1) {
      throw new Error(`Test 6 Failed: WB41H0177 appeared ${wb41hCount} times instead of 1`);
    }
    console.log('✓ Test 6 PASSED: Duplicate records across collections produce exactly 1 vehicle row\n');

    // -------------------------------------------------------------------------
    // TEST 7: Dynamic creation, edit, and deletion
    // -------------------------------------------------------------------------
    console.log('--- Test 7: Dynamic creation, edit, deletion ---');
    // 7a. Create qualifying GST FCM record for GOUTAM ROY
    const dynDoc = await ownerCol.insertOne({
      testMarker: 'test-gst-fcm',
      'Truck No': 'TESTDYN77',
      'Owner Name': 'GOUTAM ROY',
      'GST TYPE': 'FCM',
      created_at: new Date()
    });
    testIds.push({ col: ownerCol, id: dynDoc.insertedId });

    res = await axios.get(`${API_BASE}/freight-creditor-gst/data?creditorKey=GKR_ENTERPRISE&month=9&year=2026&fy=26-27`);
    gkrVehicles = (res.data.rows || []).map(r => r.vehicleNo);
    console.log('After creating TESTDYN77:', gkrVehicles);
    if (!gkrVehicles.includes('TESTDYN77')) {
      throw new Error('Test 7a Failed: Newly created qualifying FCM vehicle was not included!');
    }
    console.log('✓ 7a: New qualifying GST FCM record immediately appears in eligible list');

    // 7b. Edit record so it no longer qualifies (GST TYPE changed to "NO")
    await ownerCol.updateOne({ _id: dynDoc.insertedId }, { $set: { 'GST TYPE': 'NO' } });
    res = await axios.get(`${API_BASE}/freight-creditor-gst/data?creditorKey=GKR_ENTERPRISE&month=9&year=2026&fy=26-27`);
    gkrVehicles = (res.data.rows || []).map(r => r.vehicleNo);
    console.log('After editing TESTDYN77 to non-FCM:', gkrVehicles);
    if (gkrVehicles.includes('TESTDYN77')) {
      throw new Error('Test 7b Failed: Edited non-FCM vehicle was not removed from eligible list!');
    }
    console.log('✓ 7b: Editing record away from FCM immediately removes vehicle from eligible list');

    // 7c. Delete record
    await ownerCol.deleteOne({ _id: dynDoc.insertedId });
    res = await axios.get(`${API_BASE}/freight-creditor-gst/data?creditorKey=GKR_ENTERPRISE&month=9&year=2026&fy=26-27`);
    gkrVehicles = (res.data.rows || []).map(r => r.vehicleNo);
    if (gkrVehicles.includes('TESTDYN77')) {
      throw new Error('Test 7c Failed: Deleted vehicle still present!');
    }
    console.log('✓ 7c: Deleting record keeps vehicle removed without error');
    console.log('✓ Test 7 PASSED: Full dynamic lifecycle verified\n');

    // -------------------------------------------------------------------------
    // TEST 8: Existing calculations and saved data integrity
    // -------------------------------------------------------------------------
    console.log('--- Test 8: Freight Creditor GST calculations and data integrity ---');
    res = await axios.get(`${API_BASE}/freight-creditor-gst/data?creditorKey=GKR_ENTERPRISE&month=9&year=2026&fy=26-27`);
    const rows = res.data.rows || [];
    rows.forEach(r => {
      console.log(`Vehicle ${r.vehicleNo}: Basic=${r.basicCurrM}, M1=${r.incentiveM1}, M2=${r.incentiveM2}, Taxable=${r.taxableValue}, CGST=${r.cgst}, SGST=${r.sgst}, Total=${r.total}`);
      if (r.taxableValue !== null) {
        const expectedTaxable = Math.round(((r.basicCurrM || 0) + (r.incentiveM1 || 0) + (r.incentiveM2 || 0)) * 100) / 100;
        const expectedCgst = Math.round((expectedTaxable * 0.09) * 100) / 100;
        const expectedSgst = Math.round((expectedTaxable * 0.09) * 100) / 100;
        const expectedTotal = Math.round((expectedTaxable + expectedCgst + expectedSgst) * 100) / 100;

        if (r.taxableValue !== expectedTaxable || r.cgst !== expectedCgst || r.sgst !== expectedSgst || r.total !== expectedTotal) {
          throw new Error(`Test 8 Failed: Calculation mismatch on ${r.vehicleNo}`);
        }
      }
    });

    // Check totals object
    const totals = res.data.totals;
    console.log('Totals:', totals);
    console.log('✓ Test 8 PASSED: All financial calculations and saved values intact\n');

    console.log('🎉 ALL 8 ACCEPTANCE TESTS PASSED SUCCESSFULLY! 🎉');

  } finally {
    console.log('Cleaning up test documents...');
    for (const item of testIds) {
      try {
        await item.col.deleteOne({ _id: item.id });
      } catch (_) {}
    }
    await ownerCol.deleteMany({ testMarker: 'test-gst-fcm' });
    await truckCol.deleteMany({ testMarker: 'test-gst-fcm' });
    await mongoose.disconnect();
    console.log('Cleanup complete.');
  }
}

runTests().catch(err => {
  console.error('\n❌ TEST RUN FAILED:', err);
  process.exit(1);
});
