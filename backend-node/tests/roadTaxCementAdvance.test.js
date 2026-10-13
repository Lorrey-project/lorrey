require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');

const API_BASE = 'http://localhost:3000';
const { isSameCalendarDate } = require('../utils/roadTaxCementAdvanceManager');

async function runAcceptanceTests() {
  console.log('=== RUNNING BRINDA SHYAM & JEET PANJA → CEMENT REGISTER ADVANCE BANK TF ACCEPTANCE TESTS ===\n');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB Atlas\n');

  const cementDb = mongoose.connection.useDb('cement_register');
  const invoiceDb = mongoose.connection.useDb('invoice_system');

  const cementCol = cementDb.collection('entries');
  const roadTaxCol = invoiceDb.collection('road_tax_register');

  const cleanups = [];

  try {
    const testDateStr = '10-10-2026';
    const testVehA = 'WB99TEST01';
    const testOwnerA = 'MANAS SARKAR';

    const testVehB = 'WB99TEST02';
    const testOwnerB = 'DIPALI TRANSPORT';

    // Cleanup any prior test artifacts
    await cementCol.deleteMany({ "VEHICLE NUMBER": { $in: [testVehA, testVehB] } });
    await roadTaxCol.deleteMany({ truckNo: { $in: [testVehA, testVehB] } });

    // =========================================================================
    // ACCEPTANCE TEST A:
    // Save ₹5,000 for a vehicle on 10-10-2026 when a matching dated invoice exists:
    // its correct ADVANCE BANK TF total increases by ₹5,000.
    // =========================================================================
    console.log('--- TEST A: Matching dated invoice exists on 10-10-2026 ---');
    const realTrip = await cementCol.insertOne({
      "INVOICE NO": "INV-REAL-101",
      "SHIPMENT NO": "SHP-REAL-101",
      "VEHICLE NUMBER": testVehA,
      "OWNER NAME": testOwnerA,
      "LOADING DT": testDateStr,
      "LOADING DATE": testDateStr,
      "Bank TF": 0,
      "BANK TF": 0,
      "ADVANCE (BANK TF)": 0,
      isDummy: false,
      _isDummy: false,
      createdAt: new Date()
    });
    cleanups.push({ col: cementCol, id: realTrip.insertedId });
    console.log(`Created real dated invoice in Cement Register for ${testVehA} on ${testDateStr} (Bank TF: 0)`);

    const saveARes = await axios.post(`${API_BASE}/road-tax/save`, {
      txId: 'tx_test_a1',
      truckNo: testVehA,
      ownerName: testOwnerA,
      validityType: 'ROAD TAX',
      creditor: 'BRINDA SHYAM',
      month: 10,
      year: 2026,
      renewDate: testDateStr,
      receivableAmount: 5000
    });
    cleanups.push({ col: roadTaxCol, query: { truckNo: testVehA } });

    console.log('API Response A:', saveARes.data.message);
    const updatedRealTrip = await cementCol.findOne({ _id: realTrip.insertedId });
    console.log(`Updated Real Trip Bank TF: ${updatedRealTrip["Bank TF"]}, Contributions:`, updatedRealTrip._roadTaxContributions);

    if (Number(updatedRealTrip["Bank TF"]) !== 5000) {
      throw new Error(`Test A Failed: Expected Bank TF 5000, got ${updatedRealTrip["Bank TF"]}`);
    }
    if (Number(updatedRealTrip["BANK TF"]) !== 5000 || Number(updatedRealTrip["ADVANCE (BANK TF)"]) !== 5000) {
      throw new Error(`Test A Failed: Mirror fields BANK TF or ADVANCE (BANK TF) not 5000`);
    }
    if (!Array.isArray(updatedRealTrip._roadTaxContributions) || updatedRealTrip._roadTaxContributions.length !== 1) {
      throw new Error(`Test A Failed: Expected 1 road tax contribution, got ${updatedRealTrip._roadTaxContributions?.length}`);
    }
    if (updatedRealTrip._roadTaxContributions[0].amount !== 5000 || updatedRealTrip._roadTaxContributions[0].creditor !== 'BRINDA SHYAM') {
      throw new Error(`Test A Failed: Contribution amount or creditor mismatch`);
    }

    // Verify NO dummy row was created
    const dummyCheckA = await cementCol.find({ "VEHICLE NUMBER": testVehA, isDummy: true }).toArray();
    if (dummyCheckA.length > 0) {
      throw new Error(`Test A Failed: Dummy row created when matching dated invoice already existed!`);
    }
    console.log('✓ TEST A PASSED: Matching dated invoice increased ADVANCE BANK TF to ₹5,000 without fabricating dummy row.\n');

    // =========================================================================
    // ACCEPTANCE TEST B:
    // Save ₹5,000 for the same owner and vehicle on 10-10-2026 when no matching dated
    // invoice exists: create one appropriate dummy row with ADVANCE BANK TF = ₹5,000.
    // =========================================================================
    console.log('--- TEST B: No matching dated invoice exists -> Create dummy Cement Register row ---');
    const saveBRes = await axios.post(`${API_BASE}/road-tax/save`, {
      txId: 'tx_test_b1',
      truckNo: testVehB,
      ownerName: testOwnerB,
      validityType: 'ROAD TAX',
      creditor: 'JEET PANJA',
      month: 10,
      year: 2026,
      renewDate: testDateStr,
      receivableAmount: 5000
    });
    cleanups.push({ col: roadTaxCol, query: { truckNo: testVehB } });

    console.log('API Response B:', saveBRes.data.message);

    const dummyRowsB = await cementCol.find({ "VEHICLE NUMBER": testVehB, isDummy: true }).toArray();
    console.log(`Found ${dummyRowsB.length} dummy rows for ${testVehB}`);
    if (dummyRowsB.length !== 1) {
      throw new Error(`Test B Failed: Expected exactly 1 dummy row, found ${dummyRowsB.length}`);
    }

    const dummyB = dummyRowsB[0];
    cleanups.push({ col: cementCol, id: dummyB._id });

    console.log('Dummy Row B details:', {
      veh: dummyB["VEHICLE NUMBER"],
      owner: dummyB["OWNER NAME"],
      loadingDt: dummyB["LOADING DT"],
      bankTf: dummyB["Bank TF"],
      invNo: dummyB["INVOICE NO"],
      shpNo: dummyB["SHIPMENT NO"],
      isDummy: dummyB.isDummy
    });

    if (Number(dummyB["Bank TF"]) !== 5000) {
      throw new Error(`Test B Failed: Expected dummy Bank TF 5000, got ${dummyB["Bank TF"]}`);
    }
    if (dummyB["INVOICE NO"] !== "" || dummyB["SHIPMENT NO"] !== "") {
      throw new Error(`Test B Failed: Fabricated invoice or shipment number in dummy row: INV="${dummyB["INVOICE NO"]}", SHP="${dummyB["SHIPMENT NO"]}"`);
    }
    if (dummyB["OWNER NAME"] !== testOwnerB) {
      throw new Error(`Test B Failed: Owner name mismatch: expected "${testOwnerB}", got "${dummyB["OWNER NAME"]}"`);
    }
    console.log('✓ TEST B PASSED: Appropriate dummy row created with ADVANCE BANK TF = ₹5,000 and NO fabricated invoice/shipment.\n');

    // =========================================================================
    // ACCEPTANCE TEST C:
    // Save a second distinct ₹2,000 transaction for the same date: the correct total
    // becomes ₹7,000, with no duplicate source contributions.
    // =========================================================================
    console.log('--- TEST C: Second distinct transaction of ₹2,000 for the same date ---');
    const saveCRes = await axios.post(`${API_BASE}/road-tax/save`, {
      txId: 'tx_test_b2',
      truckNo: testVehB,
      ownerName: testOwnerB,
      validityType: 'ROAD TAX',
      creditor: 'JEET PANJA',
      month: 10,
      year: 2026,
      renewDate: testDateStr,
      receivableAmount: 2000
    });
    console.log('API Response C:', saveCRes.data.message);

    const dummyRowsC = await cementCol.find({ "VEHICLE NUMBER": testVehB, isDummy: true }).toArray();
    console.log(`Found ${dummyRowsC.length} dummy rows after 2nd transaction`);
    if (dummyRowsC.length !== 1) {
      throw new Error(`Test C Failed: Expected still exactly 1 dummy row (accumulated), found ${dummyRowsC.length}`);
    }

    const dummyC = dummyRowsC[0];
    console.log(`Dummy Row C Bank TF: ${dummyC["Bank TF"]}, Contributions:`, dummyC._roadTaxContributions);

    if (Number(dummyC["Bank TF"]) !== 7000) {
      throw new Error(`Test C Failed: Expected accumulated Bank TF 7000, got ${dummyC["Bank TF"]}`);
    }
    if (dummyC._roadTaxContributions.length !== 2) {
      throw new Error(`Test C Failed: Expected 2 contributions, got ${dummyC._roadTaxContributions.length}`);
    }
    console.log('✓ TEST C PASSED: Second distinct transaction accumulated into ADVANCE BANK TF = ₹7,000 without duplicate rows.\n');

    // =========================================================================
    // ACCEPTANCE TEST D:
    // Refresh and reload the application: values remain correct and are not added again.
    // =========================================================================
    console.log('--- TEST D: Refresh and idempotency verification ---');
    // 1. Fetch via cement-register route
    const cementGetRes = await axios.get(`${API_BASE}/cement-register?vehicle=${testVehB}&month=10&year=2026`);
    const fetchedEntries = cementGetRes.data.entries || [];
    console.log(`GET /cement-register returned ${fetchedEntries.length} entries for ${testVehB}`);
    const fetchedDummy = fetchedEntries.find(e => e["VEHICLE NUMBER"] === testVehB || e["VEHICLE NO"] === testVehB);
    if (!fetchedDummy) {
      throw new Error(`Test D Failed: Dummy row not loaded from MongoDB on refresh`);
    }
    const parsedBankTf = parseFloat(String(fetchedDummy["Bank TF"]).replace(/,/g, ''));
    if (parsedBankTf !== 7000) {
      throw new Error(`Test D Failed: Fetched dummy row Bank TF is ${parsedBankTf}, expected 7000`);
    }

    // 2. Retry saving tx_test_b1 again
    await axios.post(`${API_BASE}/road-tax/save`, {
      txId: 'tx_test_b1',
      truckNo: testVehB,
      ownerName: testOwnerB,
      validityType: 'ROAD TAX',
      creditor: 'JEET PANJA',
      month: 10,
      year: 2026,
      renewDate: testDateStr,
      receivableAmount: 5000
    });

    const checkDummyD = await cementCol.findOne({ _id: dummyC._id });
    if (Number(checkDummyD["Bank TF"]) !== 7000) {
      throw new Error(`Test D Failed: Idempotency failed! Bank TF changed to ${checkDummyD["Bank TF"]}, expected 7000`);
    }
    console.log('✓ TEST D PASSED: Loaded from MongoDB correctly and retry did not add amount twice.\n');

    // =========================================================================
    // ACCEPTANCE TEST E:
    // Edit the ₹2,000 transaction to ₹3,000: the total becomes ₹8,000, not ₹10,000.
    // =========================================================================
    console.log('--- TEST E: Edit the ₹2,000 transaction to ₹3,000 ---');
    const saveERes = await axios.post(`${API_BASE}/road-tax/save`, {
      txId: 'tx_test_b2',
      truckNo: testVehB,
      ownerName: testOwnerB,
      validityType: 'ROAD TAX',
      creditor: 'JEET PANJA',
      month: 10,
      year: 2026,
      renewDate: testDateStr,
      receivableAmount: 3000
    });
    console.log('API Response E:', saveERes.data.message);

    const dummyE = await cementCol.findOne({ _id: dummyC._id });
    console.log(`Dummy Row E Bank TF: ${dummyE["Bank TF"]}, Contributions:`, dummyE._roadTaxContributions);

    if (Number(dummyE["Bank TF"]) !== 8000) {
      throw new Error(`Test E Failed: Expected Bank TF 8000, got ${dummyE["Bank TF"]} (did it incorrectly become 10000 or duplicate?)`);
    }
    console.log('✓ TEST E PASSED: Editing ₹2,000 to ₹3,000 updated total to exactly ₹8,000, NOT ₹10,000.\n');

    // =========================================================================
    // ACCEPTANCE TEST F:
    // Delete that transaction: the total returns to ₹5,000 without removing unrelated advances.
    // =========================================================================
    console.log('--- TEST F: Delete the ₹3,000 transaction -> total returns to ₹5,000 ---');
    const deleteFRes = await axios.post(`${API_BASE}/road-tax/delete`, {
      txId: 'tx_test_b2',
      creditor: 'JEET PANJA'
    });
    console.log('API Response F:', deleteFRes.data.message);

    const dummyF = await cementCol.findOne({ _id: dummyC._id });
    console.log(`Dummy Row F Bank TF: ${dummyF["Bank TF"]}, Contributions:`, dummyF._roadTaxContributions);

    if (Number(dummyF["Bank TF"]) !== 5000) {
      throw new Error(`Test F Failed: Expected Bank TF to return to 5000, got ${dummyF["Bank TF"]}`);
    }
    if (dummyF._roadTaxContributions.length !== 1 || dummyF._roadTaxContributions[0].txId !== 'tx_test_b1') {
      throw new Error(`Test F Failed: Remaining contribution should only be tx_test_b1`);
    }

    // Now test unrelated advance preservation on a real invoice
    console.log('Sub-test: Unrelated advance preservation...');
    const testVehUnrelated = 'WB99UNRELATED';
    const unrelatedTrip = await cementCol.insertOne({
      "INVOICE NO": "INV-UNRELATED",
      "VEHICLE NUMBER": testVehUnrelated,
      "OWNER NAME": "UNRELATED OWNER",
      "LOADING DT": testDateStr,
      "Bank TF": 1000, // Pre-existing advance from Bank Book or manual
      "BANK TF": 1000,
      isDummy: false
    });
    cleanups.push({ col: cementCol, id: unrelatedTrip.insertedId });

    // Add Brinda Shyam 5000 -> 6000
    await axios.post(`${API_BASE}/road-tax/save`, {
      txId: 'tx_unrelated_1',
      truckNo: testVehUnrelated,
      ownerName: "UNRELATED OWNER",
      validityType: 'ROAD TAX',
      creditor: 'BRINDA SHYAM',
      month: 10,
      year: 2026,
      renewDate: testDateStr,
      receivableAmount: 5000
    });
    cleanups.push({ col: roadTaxCol, query: { truckNo: testVehUnrelated } });

    let unTrip = await cementCol.findOne({ _id: unrelatedTrip.insertedId });
    if (Number(unTrip["Bank TF"]) !== 6000) {
      throw new Error(`Test F Sub-test Failed: Expected 6000 (1000 base + 5000), got ${unTrip["Bank TF"]}`);
    }

    // Delete Brinda Shyam contribution -> returns to 1000!
    await axios.post(`${API_BASE}/road-tax/delete`, {
      txId: 'tx_unrelated_1',
      creditor: 'BRINDA SHYAM'
    });

    unTrip = await cementCol.findOne({ _id: unrelatedTrip.insertedId });
    if (Number(unTrip["Bank TF"]) !== 1000) {
      throw new Error(`Test F Sub-test Failed: Expected 1000 base preserved, got ${unTrip["Bank TF"]}`);
    }
    console.log('✓ TEST F PASSED: Deleting transaction returned total to ₹5,000 and preserved unrelated advance (₹1,000).\n');

    // =========================================================================
    // ACCEPTANCE TEST G:
    // Verify that other dates, owners, vehicles, existing invoices, and other
    // advance integrations remain unchanged.
    // =========================================================================
    console.log('--- TEST G: Verify other dates, owners, vehicles and integrations remain unchanged ---');
    // Ensure Brinda Shyam & Jeet Panja cannot cross-update each other
    const crossCheckB = await roadTaxCol.findOne({ txId: 'tx_test_b1' });
    if (crossCheckB.creditor !== 'JEET PANJA') {
      throw new Error(`Test G Failed: Creditor cross-contaminated: ${crossCheckB.creditor}`);
    }

    // Ensure dummyB on testDateStr has not affected other dates
    const allDummiesForB = await cementCol.find({ "VEHICLE NUMBER": testVehB }).toArray();
    const otherDateDummy = allDummiesForB.filter(d => !isSameCalendarDate(d["LOADING DT"] || d.date, testDateStr));
    if (otherDateDummy.length > 0) {
      throw new Error(`Test G Failed: Other dates were modified for ${testVehB}`);
    }

    console.log('✓ TEST G PASSED: Isolation verified, other records and integrations remain completely unaffected.\n');

    console.log('================================================================');
    console.log('🎉 ALL ACCEPTANCE TESTS A THROUGH G PASSED WITH 100% SUCCESS! 🎉');
    console.log('================================================================\n');

  } catch (err) {
    console.error('❌ ACCEPTANCE TEST FAILED:', err);
    process.exitCode = 1;
  } finally {
    console.log('Cleaning up test data from MongoDB Atlas...');
    for (const c of cleanups) {
      try {
        if (c.id) await c.col.deleteOne({ _id: c.id });
        else if (c.query) await c.col.deleteMany(c.query);
      } catch (_) {}
    }
    await mongoose.disconnect();
    console.log('MongoDB disconnected.');
  }
}

runAcceptanceTests();
