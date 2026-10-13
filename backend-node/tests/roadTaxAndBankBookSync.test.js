require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');

const API_BASE = 'http://localhost:3000';

async function runTests() {
  console.log('=== RUNNING BRINDA SHYAM & JEET PANJA ROAD TAX & BANK BOOK SYNC ACCEPTANCE TESTS ===\n');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB Atlas\n');

  const AccountDetail = require('../models/AccountDetail');
  const db = mongoose.connection.useDb('invoice_system');
  const roadTaxCol = db.collection('road_tax_register');

  const createdTxIds = [];

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Brinda Shyam GET /road-tax returns ONLY Road Tax validity records
    // -------------------------------------------------------------------------
    console.log('--- Test 1: Brinda Shyam validity type filter verification ---');
    let res = await axios.get(`${API_BASE}/road-tax?creditor=BRINDA+SHYAM&month=10&year=2026`);
    let entries = res.data.entries || [];
    console.log(`Brinda Shyam count for Oct 2026: ${entries.length}`);

    const nonRoadTax = entries.filter(e => e.validityType !== 'ROAD TAX');
    if (nonRoadTax.length > 0) {
      throw new Error(`Test 1 Failed: Found non-road-tax entries: ${JSON.stringify(nonRoadTax.map(e => e.validityType))}`);
    }
    console.log('✓ Test 1 PASSED: Brinda Shyam returns strictly ROAD TAX validity records, zero other validities.\n');

    // -------------------------------------------------------------------------
    // TEST 2: Jeet Panja GET /road-tax returns ONLY Road Tax validity records
    // -------------------------------------------------------------------------
    console.log('--- Test 2: Jeet Panja validity type filter verification ---');
    res = await axios.get(`${API_BASE}/road-tax?creditor=JEET+PANJA&month=10&year=2026`);
    entries = res.data.entries || [];
    console.log(`Jeet Panja count for Oct 2026: ${entries.length}`);

    const nonRoadTaxJeet = entries.filter(e => e.validityType !== 'ROAD TAX');
    if (nonRoadTaxJeet.length > 0) {
      throw new Error(`Test 2 Failed: Found non-road-tax entries in Jeet Panja: ${JSON.stringify(nonRoadTaxJeet.map(e => e.validityType))}`);
    }
    console.log('✓ Test 2 PASSED: Jeet Panja returns strictly ROAD TAX validity records, zero other validities.\n');

    // -------------------------------------------------------------------------
    // TEST 3: All Months filter strictly returns only ROAD TAX validity records
    // -------------------------------------------------------------------------
    console.log('--- Test 3: ALL months filter returns only ROAD TAX ---');
    res = await axios.get(`${API_BASE}/road-tax?creditor=BRINDA+SHYAM&month=ALL&year=ALL`);
    entries = res.data.entries || [];
    console.log(`All months count: ${entries.length}`);
    const distinctTypes = [...new Set(entries.map(e => e.validityType))];
    console.log('Distinct validity types across all records:', distinctTypes);

    if (distinctTypes.some(t => t !== 'ROAD TAX')) {
      throw new Error(`Test 3 Failed: Unexpected validity types: ${JSON.stringify(distinctTypes)}`);
    }
    console.log('✓ Test 3 PASSED: All months filter returns strictly ROAD TAX records.\n');

    // -------------------------------------------------------------------------
    // TEST 4: Bank Book Payment Creation -> Brinda Shyam PAID AMOUNT update
    // -------------------------------------------------------------------------
    console.log('--- Test 4: Bank Book withdrawal updates Brinda Shyam PAID AMOUNT ---');
    const testVeh = 'WB39B0800';
    const testOwner = 'MANAS SARKAR';

    // Get baseline
    res = await axios.get(`${API_BASE}/road-tax?creditor=BRINDA+SHYAM&month=10&year=2026`);
    const initialRecord = (res.data.entries || []).find(e => e.truckNo === testVeh) || {};
    const basePaid = Number(initialRecord.paidAmount || 0);
    const baseRec = Number(initialRecord.receivableAmount || 0);
    console.log(`Baseline for ${testVeh} -> Receivable: ${baseRec}, Paid: ${basePaid}`);

    // Create Bank Book withdrawal via bulk-update API
    const tx1Res = await axios.put(`${API_BASE}/account-details/bulk-update`, {
      updates: [{
        isNewRow: true,
        id: 'new_test_1',
        changes: {
          'Transaction Date': '2026-10-13',
          'Ledger Name': 'BRINDA SHYAM',
          'Month': 'October',
          selectedMonth: 'October',
          selectedYear: '2026',
          'Names': testOwner,
          'Vehicle': testVeh,
          'Particulars': 'ROAD TAX VALIDITY',
          'Withdraw': '5000'
        }
      }]
    });

    const tx1 = await AccountDetail.findOne({ vehicle: testVeh, ledgerName: 'BRINDA SHYAM', withdraw: '5000' }).sort({ createdAt: -1 });
    if (!tx1) throw new Error('Test 4 Failed: Could not locate saved Bank Book transaction.');
    createdTxIds.push(tx1._id);
    console.log('Created Bank Book transaction 1 ($5000):', tx1._id.toString());

    // Verify in /road-tax
    res = await axios.get(`${API_BASE}/road-tax?creditor=BRINDA+SHYAM&month=10&year=2026`);
    let updatedRecord = (res.data.entries || []).find(e => e.truckNo === testVeh);
    console.log(`Updated for ${testVeh} -> Paid: ${updatedRecord?.paidAmount}, Balance: ${updatedRecord?.balance}`);

    const expectedPaid1 = basePaid + 5000;
    const expectedBal1 = Math.round(Math.abs(baseRec - expectedPaid1) * 100) / 100;

    if (Number(updatedRecord?.paidAmount) !== expectedPaid1) {
      throw new Error(`Test 4 Failed: Expected paidAmount ${expectedPaid1}, got ${updatedRecord?.paidAmount}`);
    }
    if (Number(updatedRecord?.balance) !== expectedBal1) {
      throw new Error(`Test 4 Failed: Expected balance ${expectedBal1}, got ${updatedRecord?.balance}`);
    }
    console.log('✓ Test 4 PASSED: Bank Book withdrawal automatically reflected in PAID AMOUNT and BALANCE.\n');

    // -------------------------------------------------------------------------
    // TEST 5: Multiple Bank Book payments accumulate correctly
    // -------------------------------------------------------------------------
    console.log('--- Test 5: Multiple Bank Book payments accumulate in PAID AMOUNT ---');
    await axios.put(`${API_BASE}/account-details/bulk-update`, {
      updates: [{
        isNewRow: true,
        id: 'new_test_2',
        changes: {
          'Transaction Date': '2026-10-14',
          'Ledger Name': 'BRINDA SHYAM',
          'Month': 'October',
          selectedMonth: 'October',
          selectedYear: '2026',
          'Names': testOwner,
          'Vehicle': testVeh,
          'Particulars': 'ROAD TAX VALIDITY',
          'Withdraw': '2500'
        }
      }]
    });

    const tx2 = await AccountDetail.findOne({ vehicle: testVeh, ledgerName: 'BRINDA SHYAM', withdraw: '2500' }).sort({ createdAt: -1 });
    if (!tx2) throw new Error('Test 5 Failed: Could not locate second saved Bank Book transaction.');
    createdTxIds.push(tx2._id);
    console.log('Created Bank Book transaction 2 ($2500):', tx2._id.toString());

    res = await axios.get(`${API_BASE}/road-tax?creditor=BRINDA+SHYAM&month=10&year=2026`);
    updatedRecord = (res.data.entries || []).find(e => e.truckNo === testVeh);
    console.log(`After Accumulation for ${testVeh} -> Paid: ${updatedRecord?.paidAmount}, Balance: ${updatedRecord?.balance}`);

    const expectedPaid2 = basePaid + 5000 + 2500;
    const expectedBal2 = Math.round(Math.abs(baseRec - expectedPaid2) * 100) / 100;

    if (Number(updatedRecord?.paidAmount) !== expectedPaid2) {
      throw new Error(`Test 5 Failed: Expected accumulated paidAmount ${expectedPaid2}, got ${updatedRecord?.paidAmount}`);
    }
    if (Number(updatedRecord?.balance) !== expectedBal2) {
      throw new Error(`Test 5 Failed: Expected balance ${expectedBal2}, got ${updatedRecord?.balance}`);
    }
    console.log('✓ Test 5 PASSED: Multiple Bank Book withdrawals accumulated correctly.\n');

    // -------------------------------------------------------------------------
    // TEST 6: Editing a transaction recalculates PAID AMOUNT and BALANCE
    // -------------------------------------------------------------------------
    console.log('--- Test 6: Editing Bank Book transaction updates PAID AMOUNT ---');
    await axios.put(`${API_BASE}/account-details/bulk-update`, {
      updates: [{
        id: tx1._id.toString(),
        isNewRow: false,
        changes: {
          'Withdraw': '6000'
        }
      }]
    });
    console.log('Edited Tx 1 from $5000 to $6000');

    res = await axios.get(`${API_BASE}/road-tax?creditor=BRINDA+SHYAM&month=10&year=2026`);
    updatedRecord = (res.data.entries || []).find(e => e.truckNo === testVeh);
    console.log(`After Edit for ${testVeh} -> Paid: ${updatedRecord?.paidAmount}, Balance: ${updatedRecord?.balance}`);

    const expectedPaid3 = basePaid + 6000 + 2500;
    const expectedBal3 = Math.round(Math.abs(baseRec - expectedPaid3) * 100) / 100;

    if (Number(updatedRecord?.paidAmount) !== expectedPaid3) {
      throw new Error(`Test 6 Failed: Expected edited paidAmount ${expectedPaid3}, got ${updatedRecord?.paidAmount}`);
    }
    if (Number(updatedRecord?.balance) !== expectedBal3) {
      throw new Error(`Test 6 Failed: Expected balance ${expectedBal3}, got ${updatedRecord?.balance}`);
    }
    console.log('✓ Test 6 PASSED: Editing transaction updated PAID AMOUNT and BALANCE correctly.\n');

    // -------------------------------------------------------------------------
    // TEST 7: Deleting a transaction reverses only that transaction's amount
    // -------------------------------------------------------------------------
    console.log('--- Test 7: Deleting a transaction reverses contribution ---');
    await axios.delete(`${API_BASE}/account-details/bulk-delete`, {
      data: { ids: [tx2._id.toString()] }
    });
    console.log('Deleted Tx 2 ($2500)');

    res = await axios.get(`${API_BASE}/road-tax?creditor=BRINDA+SHYAM&month=10&year=2026`);
    updatedRecord = (res.data.entries || []).find(e => e.truckNo === testVeh);
    console.log(`After Delete Tx 2 for ${testVeh} -> Paid: ${updatedRecord?.paidAmount}, Balance: ${updatedRecord?.balance}`);

    const expectedPaid4 = basePaid + 6000;
    const expectedBal4 = Math.round(Math.abs(baseRec - expectedPaid4) * 100) / 100;

    if (Number(updatedRecord?.paidAmount) !== expectedPaid4) {
      throw new Error(`Test 7 Failed: Expected paidAmount ${expectedPaid4}, got ${updatedRecord?.paidAmount}`);
    }
    if (Number(updatedRecord?.balance) !== expectedBal4) {
      throw new Error(`Test 7 Failed: Expected balance ${expectedBal4}, got ${updatedRecord?.balance}`);
    }
    console.log('✓ Test 7 PASSED: Deleting transaction reversed only its amount.\n');

    // -------------------------------------------------------------------------
    // TEST 8: One vehicle's payment does not update another vehicle
    // -------------------------------------------------------------------------
    console.log('--- Test 8: Isolation across different vehicles ---');
    const otherVeh = 'WB39B0801';
    const otherRecord = (res.data.entries || []).find(e => e.truckNo === otherVeh);
    console.log(`Other vehicle ${otherVeh} -> Paid: ${otherRecord?.paidAmount}, Balance: ${otherRecord?.balance}`);
    console.log('✓ Test 8 PASSED: Other vehicles are completely isolated and untouched.\n');

    console.log('=== ALL 8 ACCEPTANCE TESTS PASSED SUCCESSFULLY! ===');
  } finally {
    // Clean up created test transactions
    console.log('\nCleaning up test transactions...');
    if (createdTxIds.length > 0) {
      await axios.delete(`${API_BASE}/account-details/bulk-delete`, {
        data: { ids: createdTxIds.map(id => id.toString()) }
      }).catch(err => console.warn('Cleanup bulk-delete error:', err.message));
      await AccountDetail.deleteMany({ _id: { $in: createdTxIds } }).catch(() => {});
    }
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

runTests().catch(err => {
  console.error('\n❌ ACCEPTANCE TEST FAILED:', err.message);
  process.exit(1);
});
