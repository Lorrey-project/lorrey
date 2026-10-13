const mongoose = require('mongoose');
const assert = require('assert');
require('dotenv').config({ path: '.env' });

const PartyPayment = require('./models/PartyPayment');
const {
  normalizeVehicle,
  getCalendarMonthYear,
  calculateInvoiceTotalAmount,
  syncFreightGstToPartyPayment,
  reconcileAllFreightGstInvoices
} = require('./utils/freightGstPartyPaymentSync');

async function runTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING FREIGHT CREDITOR GST → B2B → PARTY PAYMENT TEST SUITE');
  console.log('================================================================');

  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB Atlas\n');

  const gstCol = mongoose.connection.useDb('gst_portal').collection('entries');

  const createdTestIds = [];
  const testVehicles = ['TESTVEH01', 'TESTVEH02', 'WB39TEST01'];

  try {
    // Clean up any stale test records first
    await gstCol.deleteMany({ vehicleNo: { $in: testVehicles } });
    await PartyPayment.deleteMany({ vehicleNo: { $in: testVehicles } });

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 1: SCREENSHOT EXAMPLE VERIFICATION
    // Taxable: ₹1,66,093.25 | CGST 9%: ₹14,948.39 | SGST 9%: ₹14,948.39
    // Expected GST FCM = ₹29,896.78 (18% GST Tax Amount)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('▶ TEST 1: Screenshot Example Verification (GST Tax Amount ₹29,896.78)...');
    const invoice1Data = {
      type: 'b2b',
      'Invoice Number': 'DAC/26-27/H1/TEST01',
      'Invoice Date': '2026-09-30',
      'Taxable Value': 166093.25,
      'CGST': 14948.39,
      'SGST': 14948.39,
      'Integrated Tax': 0,
      'Cess': 0,
      'Invoice Value': 195990.03,
      sourceModule: 'FREIGHT_CREDITOR_GST',
      Source: 'Freight Creditor GST',
      creditorKey: 'DIPALI_ASSOCIATES',
      creditorTitle: 'DIPALI ASSOCIATES',
      vehicleNo: 'TESTVEH01',
      month: 9,
      year: 2026,
      fy: '26-27'
    };

    const insertRes1 = await gstCol.insertOne(invoice1Data);
    createdTestIds.push(insertRes1.insertedId);

    // Run sync to PartyPayment
    const syncRes1 = await syncFreightGstToPartyPayment({
      vehicleNo: 'TESTVEH01',
      month: 9,
      year: 2026
    });

    assert.strictEqual(syncRes1.success, true, 'Sync should succeed');
    assert.strictEqual(syncRes1.gstFcm, 29896.78, 'GST FCM must match GST tax amount of ₹29,896.78');

    // Verify directly in MongoDB PartyPayment collection
    const savedDoc1 = await PartyPayment.findOne({
      vehicleNo: 'TESTVEH01',
      month: 9,
      year: 2026
    }).lean();

    assert(savedDoc1, 'PartyPayment record must exist in MongoDB');
    assert.strictEqual(savedDoc1.gstFcm, 29896.78, 'PartyPayment.gstFcm must be exactly 29896.78');
    assert.strictEqual(savedDoc1.gstFcm_source, 'FREIGHT_CREDITOR_GST', 'gstFcm_source must be FREIGHT_CREDITOR_GST');
    assert.strictEqual(savedDoc1.gstFcmInvoices.length, 1, 'Should track 1 linked invoice');
    assert.strictEqual(savedDoc1.gstFcmInvoices[0].invoiceNumber, 'DAC/26-27/H1/TEST01');
    assert.strictEqual(savedDoc1.gstFcmInvoices[0].gstAmount, 29896.78, 'Tracked invoice summary must record gstAmount = 29896.78');
    console.log(`  ✅ PASSED: PartyPayment for TESTVEH01 Month 9 Year 2026 has GST FCM = ₹${savedDoc1.gstFcm}\n`);

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 2: CALENDAR DATE & TIMEZONE BOUNDARIES (30th, 31st, Feb, FY boundaries)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('▶ TEST 2: Calendar Date & Timezone Boundary Safety...');
    const dateBoundaryCases = [
      { month: 4, year: 2026, dateStr: '2026-04-30', desc: 'April 30th (30-day month, FY start)' },
      { month: 5, year: 2026, dateStr: '2026-05-31', desc: 'May 31st (31-day month)' },
      { month: 9, year: 2026, dateStr: '2026-09-30', desc: 'September 30th (End of H1)' },
      { month: 10, year: 2026, dateStr: '2026-10-31', desc: 'October 31st (Start of H2)' },
      { month: 12, year: 2026, dateStr: '2026-12-31', desc: 'December 31st (Calendar Year Boundary)' },
      { month: 1, year: 2027, dateStr: '2027-01-31', desc: 'January 31st (New Calendar Year in FY 26-27)' },
      { month: 2, year: 2027, dateStr: '2027-02-28', desc: 'February 28th (Leap/Non-leap boundary)' },
      { month: 3, year: 2027, dateStr: '2027-03-31', desc: 'March 31st (FY End Boundary)' }
    ];

    for (const testCase of dateBoundaryCases) {
      const parsedCal = getCalendarMonthYear({
        month: testCase.month,
        year: testCase.year,
        'Invoice Date': testCase.dateStr
      });

      assert.strictEqual(parsedCal.month, testCase.month, `Month must remain ${testCase.month} on ${testCase.desc}`);
      assert.strictEqual(parsedCal.year, testCase.year, `Year must remain ${testCase.year} on ${testCase.desc}`);

      // Test fallback parsing from date string alone (no explicit month/year in doc)
      const fallbackCal = getCalendarMonthYear({
        'Invoice Date': testCase.dateStr
      });
      assert.strictEqual(fallbackCal.month, testCase.month, `Fallback month must be ${testCase.month} on ${testCase.desc}`);
      assert.strictEqual(fallbackCal.year, testCase.year, `Fallback year must be ${testCase.year} on ${testCase.desc}`);
      console.log(`  ✓ ${testCase.desc}: month=${parsedCal.month}, year=${parsedCal.year} (Zero timezone shift)`);
    }
    console.log('  ✅ PASSED: All calendar date boundaries are 100% immune to UTC/timezone shift.\n');

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 3: MULTIPLE INVOICES AGGREGATION FOR SAME OWNER/VEHICLE/MONTH
    // ──────────────────────────────────────────────────────────────────────────
    console.log('▶ TEST 3: Aggregation of Multiple Invoices for Same Owner + Vehicle + Month...');
    // Add a second invoice for TESTVEH01 in Month 9 (e.g. ₹50,000 total: taxable 42372.88, CGST 3813.56, SGST 3813.56 -> GST Tax Amount = 7627.12)
    const invoice2Data = {
      type: 'b2b',
      'Invoice Number': 'DAC/26-27/H1/TEST02',
      'Invoice Date': '2026-09-30',
      'Taxable Value': 42372.88,
      'CGST': 3813.56,
      'SGST': 3813.56,
      'Invoice Value': 50000.00,
      sourceModule: 'FREIGHT_CREDITOR_GST',
      Source: 'Freight Creditor GST',
      creditorKey: 'DIPALI_ASSOCIATES',
      vehicleNo: 'TESTVEH01',
      month: 9,
      year: 2026,
      fy: '26-27'
    };

    const insertRes2 = await gstCol.insertOne(invoice2Data);
    createdTestIds.push(insertRes2.insertedId);

    // Sync again
    const syncRes2 = await syncFreightGstToPartyPayment({
      vehicleNo: 'TESTVEH01',
      month: 9,
      year: 2026
    });

    const expectedCombined = Math.round((29896.78 + 7627.12) * 100) / 100; // 37523.90
    assert.strictEqual(syncRes2.gstFcm, expectedCombined, `Combined total must be ₹${expectedCombined}`);

    const savedDocCombined = await PartyPayment.findOne({
      vehicleNo: 'TESTVEH01',
      month: 9,
      year: 2026
    }).lean();

    assert.strictEqual(savedDocCombined.gstFcm, expectedCombined, 'MongoDB record must reflect combined sum');
    assert.strictEqual(savedDocCombined.gstFcmInvoices.length, 2, 'Should track 2 linked invoices');
    console.log(`  ✅ PASSED: Multiple invoices properly combined: ₹29,896.78 + ₹7,627.12 = ₹${savedDocCombined.gstFcm}\n`);

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 4: IDEMPOTENCE (Repeated confirmation / Resave / Refresh)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('▶ TEST 4: Idempotence (Repeated confirmation / Resave)...');
    // Calling sync multiple times must NOT duplicate amounts
    for (let i = 0; i < 3; i++) {
      const retrySync = await syncFreightGstToPartyPayment({
        vehicleNo: 'TESTVEH01',
        month: 9,
        year: 2026
      });
      assert.strictEqual(retrySync.gstFcm, expectedCombined, `Retry #${i + 1} must preserve exact total`);
    }

    const docAfterRetries = await PartyPayment.findOne({
      vehicleNo: 'TESTVEH01',
      month: 9,
      year: 2026
    }).lean();
    assert.strictEqual(docAfterRetries.gstFcm, expectedCombined, 'Total must remain ₹37,523.90 without duplication');
    assert.strictEqual(docAfterRetries.gstFcmInvoices.length, 2, 'Invoice count must remain 2');
    console.log('  ✅ PASSED: Repeated sync / resave is 100% idempotent; no duplicated records.\n');

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 5: INVOICE EDIT (Contribution update)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('▶ TEST 5: Invoice Edit (Contribution update)...');
    // Update invoice 2: taxable 63559.32, CGST 5720.34, SGST 5720.34 -> GST Tax Amount = 11440.68
    await gstCol.updateOne(
      { _id: insertRes2.insertedId },
      {
        $set: {
          'Taxable Value': 63559.32,
          'CGST': 5720.34,
          'SGST': 5720.34,
          'Invoice Value': 75000.00
        }
      }
    );

    const editSyncRes = await syncFreightGstToPartyPayment({
      vehicleNo: 'TESTVEH01',
      month: 9,
      year: 2026
    });

    const expectedAfterEdit = Math.round((29896.78 + 11440.68) * 100) / 100; // 41337.46
    assert.strictEqual(editSyncRes.gstFcm, expectedAfterEdit, `GST FCM after edit must be ₹${expectedAfterEdit}`);

    const docAfterEdit = await PartyPayment.findOne({
      vehicleNo: 'TESTVEH01',
      month: 9,
      year: 2026
    }).lean();
    assert.strictEqual(docAfterEdit.gstFcm, expectedAfterEdit, 'PartyPayment must update contribution to ₹41,337.46');
    console.log(`  ✅ PASSED: Editing invoice dynamically updated contribution: ₹${docAfterEdit.gstFcm}\n`);

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 6: INVOICE DELETION REVERSAL
    // ──────────────────────────────────────────────────────────────────────────
    console.log('▶ TEST 6: Invoice Deletion Reversal...');
    // Delete Invoice 2
    await gstCol.deleteOne({ _id: insertRes2.insertedId });

    const deleteSyncRes = await syncFreightGstToPartyPayment({
      vehicleNo: 'TESTVEH01',
      month: 9,
      year: 2026
    });

    assert.strictEqual(deleteSyncRes.gstFcm, 29896.78, 'GST FCM must reverse back to ₹29,896.78 after deleting Invoice 2');

    const docAfterDelete1 = await PartyPayment.findOne({
      vehicleNo: 'TESTVEH01',
      month: 9,
      year: 2026
    }).lean();
    assert.strictEqual(docAfterDelete1.gstFcm, 29896.78, 'PartyPayment reflects only Invoice 1');
    assert.strictEqual(docAfterDelete1.gstFcmInvoices.length, 1);

    // Delete Invoice 1
    await gstCol.deleteOne({ _id: insertRes1.insertedId });

    const deleteSyncRes2 = await syncFreightGstToPartyPayment({
      vehicleNo: 'TESTVEH01',
      month: 9,
      year: 2026
    });

    assert.strictEqual(deleteSyncRes2.gstFcm, 0, 'GST FCM must reset to 0 after all invoices deleted');

    const docAfterDelete2 = await PartyPayment.findOne({
      vehicleNo: 'TESTVEH01',
      month: 9,
      year: 2026
    }).lean();
    assert.strictEqual(docAfterDelete2.gstFcm, 0, 'PartyPayment gstFcm resets to 0');
    assert.strictEqual(docAfterDelete2.gstFcmInvoices.length, 0, 'PartyPayment gstFcmInvoices is empty');
    console.log('  ✅ PASSED: Deleting invoice cleanly reversed contribution; deleting all reset to 0.\n');

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 7: DIFFERENT OWNERS, VEHICLES & MONTHS (No Cross-Mapping)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('▶ TEST 7: Isolation across Vehicles, Months, and Owners (No cross-mapping)...');
    const multiVehCases = [
      { veh: 'TESTVEH01', m: 4, y: 2026, cgst: 6101.70, sgst: 6101.70, key: 'DIPALI_ASSOCIATES' },
      { veh: 'TESTVEH02', m: 4, y: 2026, cgst: 6864.41, sgst: 6864.41, key: 'GKR_ENTERPRISE' },
      { veh: 'TESTVEH01', m: 5, y: 2026, cgst: 4576.27, sgst: 4576.27, key: 'DIPALI_ASSOCIATES' }
    ];

    for (const c of multiVehCases) {
      const ins = await gstCol.insertOne({
        type: 'b2b',
        'Invoice Number': `INV-${c.veh}-${c.m}`,
        'Invoice Date': `${c.y}-0${c.m}-15`,
        'Invoice Value': Math.round(((c.cgst + c.sgst) / 0.18 * 1.18) * 100) / 100,
        'Taxable Value': Math.round(((c.cgst + c.sgst) / 0.18) * 100) / 100,
        'CGST': c.cgst,
        'SGST': c.sgst,
        sourceModule: 'FREIGHT_CREDITOR_GST',
        Source: 'Freight Creditor GST',
        creditorKey: c.key,
        vehicleNo: c.veh,
        month: c.m,
        year: c.y,
        fy: '26-27'
      });
      createdTestIds.push(ins.insertedId);
      await syncFreightGstToPartyPayment({ vehicleNo: c.veh, month: c.m, year: c.y });
    }

    // Verify isolation
    const pV1M4 = await PartyPayment.findOne({ vehicleNo: 'TESTVEH01', month: 4, year: 2026 }).lean();
    const pV2M4 = await PartyPayment.findOne({ vehicleNo: 'TESTVEH02', month: 4, year: 2026 }).lean();
    const pV1M5 = await PartyPayment.findOne({ vehicleNo: 'TESTVEH01', month: 5, year: 2026 }).lean();

    const expV1M4 = Math.round((6101.70 + 6101.70) * 100) / 100;
    const expV2M4 = Math.round((6864.41 + 6864.41) * 100) / 100;
    const expV1M5 = Math.round((4576.27 + 4576.27) * 100) / 100;

    assert.strictEqual(pV1M4.gstFcm, expV1M4, `TESTVEH01 M4 must be ${expV1M4}`);
    assert.strictEqual(pV2M4.gstFcm, expV2M4, `TESTVEH02 M4 must be ${expV2M4}`);
    assert.strictEqual(pV1M5.gstFcm, expV1M5, `TESTVEH01 M5 must be ${expV1M5}`);
    console.log(`  ✅ PASSED: TESTVEH01 M4 = ${expV1M4}, TESTVEH02 M4 = ${expV2M4}, TESTVEH01 M5 = ${expV1M5}. No cross-mapping.\n`);

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 8: RECONCILIATION OF EXISTING DATABASE INVOICES
    // ──────────────────────────────────────────────────────────────────────────
    console.log('▶ TEST 8: Reconciling Existing Confirmed Database Invoices...');
    const recRes = await reconcileAllFreightGstInvoices();
    assert.strictEqual(recRes.success, true);

    // Verify the confirmed invoices in the DB:
    // WB39G8384 (M4/2026): CGST 21774.71 + SGST 21774.71 = ₹43,549.42
    // WB39B8916 (M9/2026): CGST 9345.15 + SGST 9345.15 = ₹18,690.30
    // WB39G8384 (M8/2026): CGST 17811.79 + SGST 17811.79 = ₹35,623.58
    // WB39B8916 (M4/2026): CGST 21770.44 + SGST 21770.44 = ₹43,540.88
    const pReal1 = await PartyPayment.findOne({ vehicleNo: 'WB39G8384', month: 4, year: 2026 }).lean();
    const pReal2 = await PartyPayment.findOne({ vehicleNo: 'WB39B8916', month: 9, year: 2026 }).lean();
    const pReal3 = await PartyPayment.findOne({ vehicleNo: 'WB39G8384', month: 8, year: 2026 }).lean();
    const pReal4 = await PartyPayment.findOne({ vehicleNo: 'WB39B8916', month: 4, year: 2026 }).lean();

    assert(pReal1 && pReal1.gstFcm === 43549.42, `WB39G8384 M4 must be ₹43,549.42, got ${pReal1?.gstFcm}`);
    assert(pReal2 && pReal2.gstFcm === 18690.3, `WB39B8916 M9 must be ₹18,690.30, got ${pReal2?.gstFcm}`);
    assert(pReal3 && pReal3.gstFcm === 35623.58, `WB39G8384 M8 must be ₹35,623.58, got ${pReal3?.gstFcm}`);
    assert(pReal4 && pReal4.gstFcm === 43540.88, `WB39B8916 M4 must be ₹43,540.88, got ${pReal4?.gstFcm}`);

    console.log(`  ✓ WB39G8384 Month 4: ₹${pReal1.gstFcm} in PartyPayment`);
    console.log(`  ✓ WB39B8916 Month 9: ₹${pReal2.gstFcm} in PartyPayment`);
    console.log(`  ✓ WB39G8384 Month 8: ₹${pReal3.gstFcm} in PartyPayment`);
    console.log(`  ✓ WB39B8916 Month 4: ₹${pReal4.gstFcm} in PartyPayment`);
    console.log('  ✅ PASSED: All existing database invoices accurately reconciled!\n');

    console.log('================================================================');
    console.log('🎉 ALL TESTS PASSED SUCCESSFULLY! 100% COMPLIANT.');
    console.log('================================================================');

  } finally {
    // Cleanup test documents
    if (createdTestIds.length > 0) {
      await gstCol.deleteMany({ _id: { $in: createdTestIds } });
    }
    await gstCol.deleteMany({ vehicleNo: { $in: testVehicles } });
    await PartyPayment.deleteMany({ vehicleNo: { $in: testVehicles } });
    await mongoose.disconnect();
    console.log('🧹 Cleaned up test artifacts.');
  }
}

runTests().catch(err => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});
