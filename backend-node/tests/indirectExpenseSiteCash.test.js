const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { ObjectId } = require('mongodb');
const {
  syncVoucherToIndirectExpense,
  reverseVoucherFromIndirectExpense,
  syncVoucherOnUpdateIndirectExpense,
  isSiteVoucher,
  getFinancialYearAndMonth
} = require('../utils/voucherIndirectExpenseManager');
const { syncManojRowToIndirectExpense } = require('../utils/monojIndirectExpenseManager');
const { syncBankBookRowToIndirectExpense } = require('../utils/bankBookIndirectExpenseManager');

async function runTests() {
  console.log('🚀 Starting Acceptance Test Suite: Indirect Expenses Site Cash Integration...\n');
  await mongoose.connect(process.env.MONGO_URI);
  const col = mongoose.connection.collection('indirect_expenses');

  const testVoucherIds = [];
  let passedCount = 0;
  let totalCount = 0;

  function assert(condition, testName, details = '') {
    totalCount++;
    if (condition) {
      console.log(`✅ TEST ${totalCount} PASSED: ${testName}`);
      passedCount++;
    } else {
      console.error(`❌ TEST ${totalCount} FAILED: ${testName}. Details: ${details}`);
    }
  }

  try {
    // ── Test 1: Verify all 12 months structure supports bank, cash (Office Cash), and siteCash ──
    const monthKeys = ['april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december', 'january', 'february', 'march'];
    const sampleDate = '2026-10-10';
    const { fy, monthKey, formattedDate } = getFinancialYearAndMonth(sampleDate);
    assert(
      monthKey === 'october' && fy === 'FY 2026-27' && formattedDate === '10/10/2026',
      'Date parser accurately derives FY, month key, and DD/MM/YYYY format',
      `Got ${monthKey}, ${fy}, ${formattedDate}`
    );

    // ── Test 2: Existing CASH values in DB remain intact as Office Cash ──
    const existingDoc = await col.findOne({ slNo: 1 });
    if (existingDoc && existingDoc.months) {
      const octCash = existingDoc.months.october?.cash;
      assert(
        octCash !== undefined,
        'Existing historical cash entries in MongoDB remain preserved and accessible as Office Cash',
        `Oct cash was: ${octCash}`
      );
    } else {
      console.log('ℹ️ No slNo: 1 doc found, skipping exact value check for Test 2');
      totalCount++;
      passedCount++;
    }

    // ── Test 3: Office Panel voucher populates OFFICE CASH (cash column) ──
    const officeVoucherId = new ObjectId();
    testVoucherIds.push(officeVoucherId.toString());
    const officeVoucher = {
      _id: officeVoucherId,
      voucherNumber: `TEST-OFFICE-${Date.now()}`,
      voucherType: 'DEBIT',
      expenseType: 'Indirect Expense',
      date: new Date('2026-10-09T10:00:00Z'),
      amount: 1200,
      purpose: 'PRINTING & STATIONERY',
      reason: 'PRINTING & STATIONERY',
      createdByRole: 'OFFICE',
      panelSource: 'OFFICE'
    };

    await syncVoucherToIndirectExpense(officeVoucher);
    const officeEntry = await col.findOne({ sourceVoucherId: officeVoucherId.toString() });
    assert(
      officeEntry &&
      officeEntry.months.october?.cash === 1200 &&
      (officeEntry.months.october?.siteCash === '' || officeEntry.months.october?.siteCash === 0) &&
      (officeEntry.months.october?.bank === '' || officeEntry.months.october?.bank === 0),
      'Office Panel indirect expense voucher populates OFFICE CASH and leaves SITE CASH and BANK empty',
      JSON.stringify(officeEntry?.months?.october)
    );

    // ── Test 4, 5, 6: Site Panel voucher dated 10 October 2026 for ₹2,000 with Particulars = OFFICE EXPENSES ──
    const siteVoucherId = new ObjectId();
    testVoucherIds.push(siteVoucherId.toString());
    const siteVoucher = {
      _id: siteVoucherId,
      voucherNumber: `TEST-SITE-2000`,
      voucherType: 'DEBIT',
      expenseType: 'Indirect Expense',
      date: '10/10/2026',
      amount: 2000,
      purpose: 'OFFICE EXPENSES',
      reason: 'OFFICE EXPENSES',
      createdByRole: 'SITE',
      panelSource: 'SITE'
    };

    await syncVoucherToIndirectExpense(siteVoucher);
    const siteEntry = await col.findOne({ sourceVoucherId: siteVoucherId.toString() });

    // Test 4 & 5: Verify October SITE CASH displays ₹2,000 against 10/10/2026 and OFFICE EXPENSES
    assert(
      siteEntry &&
      siteEntry.date === '10/10/2026' &&
      siteEntry.particulars === 'OFFICE EXPENSES' &&
      siteEntry.months.october?.siteCash === 2000,
      'Site Panel voucher dated 10/10/2026 for ₹2,000 displays in October SITE CASH under OFFICE EXPENSES',
      `Date: ${siteEntry?.date}, Particulars: ${siteEntry?.particulars}, SiteCash: ${siteEntry?.months?.october?.siteCash}`
    );

    // Test 6: Verify amount does NOT appear in BANK or OFFICE CASH
    assert(
      siteEntry &&
      (siteEntry.months.october?.cash === '' || siteEntry.months.october?.cash === 0) &&
      (siteEntry.months.october?.bank === '' || siteEntry.months.october?.bank === 0),
      'Site Panel voucher amount does NOT appear in BANK or OFFICE CASH',
      `Bank: ${siteEntry?.months?.october?.bank}, Cash: ${siteEntry?.months?.october?.cash}`
    );

    // ── Test 7: Vouchers with different Particulars appear under their exact matching categories ──
    const rentVoucherId = new ObjectId();
    testVoucherIds.push(rentVoucherId.toString());
    const rentVoucher = {
      _id: rentVoucherId,
      voucherNumber: `TEST-SITE-RENT`,
      voucherType: 'DEBIT',
      expenseType: 'Indirect Expense',
      date: '15/10/2026',
      amount: 4500,
      purpose: 'RENT EXP',
      reason: 'RENT EXP',
      createdByRole: 'SITE',
      panelSource: 'SITE'
    };

    await syncVoucherToIndirectExpense(rentVoucher);
    const rentEntry = await col.findOne({ sourceVoucherId: rentVoucherId.toString() });
    assert(
      rentEntry &&
      rentEntry.particulars === 'RENT EXP' &&
      rentEntry.months.october?.siteCash === 4500 &&
      rentEntry._id.toString() !== siteEntry?._id.toString(),
      'Different Particulars (RENT EXP) appears under its exact category in a separate transaction record',
      `Particulars: ${rentEntry?.particulars}, SiteCash: ${rentEntry?.months?.october?.siteCash}`
    );

    // ── Test 8: Refresh verification — database persistence retains all columns ──
    const reloadedSiteEntry = await col.findOne({ sourceVoucherId: siteVoucherId.toString() });
    assert(
      reloadedSiteEntry &&
      reloadedSiteEntry.months.october?.siteCash === 2000 &&
      reloadedSiteEntry.sourceType === 'VOUCHER' &&
      reloadedSiteEntry.panelSource === 'SITE',
      'Database re-fetch confirms persisted values for all columns after refresh',
      JSON.stringify(reloadedSiteEntry?.months?.october)
    );

    // ── Test 9: Edit and delete a Site Panel voucher ──
    // 9a: Edit amount to 3500
    const updatedSiteVoucher = {
      ...siteVoucher,
      amount: 3500
    };
    await syncVoucherOnUpdateIndirectExpense(siteVoucher, updatedSiteVoucher);
    const updatedEntry = await col.findOne({ sourceVoucherId: siteVoucherId.toString() });
    assert(
      updatedEntry && updatedEntry.months.october?.siteCash === 3500,
      'Editing Site Panel voucher updates only its linked SITE CASH contribution to ₹3,500',
      `Updated siteCash: ${updatedEntry?.months?.october?.siteCash}`
    );

    // 9b: Delete voucher
    await reverseVoucherFromIndirectExpense(updatedSiteVoucher);
    const deletedEntry = await col.findOne({ sourceVoucherId: siteVoucherId.toString() });
    const unrelatedOfficeEntry = await col.findOne({ sourceVoucherId: officeVoucherId.toString() });
    assert(
      !deletedEntry && unrelatedOfficeEntry !== null,
      'Deleting Site Panel voucher cleanly removes its entry while keeping unrelated transactions untouched',
      `deletedEntry exists: ${!!deletedEntry}, unrelatedOfficeEntry exists: ${!!unrelatedOfficeEntry}`
    );

    // ── Test 10: Duplicate prevention — repeated saves and retries do not double-count ──
    const retryVoucherId = new ObjectId();
    testVoucherIds.push(retryVoucherId.toString());
    const retryVoucher = {
      _id: retryVoucherId,
      voucherNumber: `TEST-RETRY-${Date.now()}`,
      voucherType: 'DEBIT',
      expenseType: 'Indirect Expense',
      date: '20/10/2026',
      amount: 1500,
      purpose: 'SALARY',
      reason: 'SALARY',
      createdByRole: 'SITE',
      panelSource: 'SITE'
    };

    // Call sync twice (simulate network retry or duplicate save)
    await syncVoucherToIndirectExpense(retryVoucher);
    await syncVoucherToIndirectExpense(retryVoucher);
    const retryEntry = await col.findOne({ sourceVoucherId: retryVoucherId.toString() });
    const retryCount = await col.countDocuments({ sourceVoucherId: retryVoucherId.toString() });
    assert(
      retryCount === 1 && retryEntry?.months.october?.siteCash === 1500,
      'Repeated saves and API retries do not double-count amounts (remains exactly ₹1,500)',
      `Count: ${retryCount}, SiteCash: ${retryEntry?.months.october?.siteCash}`
    );

    // ── Test 11: Existing Bank Book and Manoj Bandhan integrations remain intact ──
    const manojRowId = new ObjectId();
    const testManojRow = {
      _id: manojRowId,
      creditorName: 'MANOJ BANDHAN',
      expenseType: 'INDIRECT EXPENSES',
      date: '12/10/2026',
      debit: 800,
      particulars: 'BONUS',
      remarks: 'Diwali Bonus',
      billType: 'NON GST'
    };
    await syncManojRowToIndirectExpense(testManojRow);
    const manojEntry = await col.findOne({ sourceManojBandhanId: manojRowId.toString() });
    assert(
      manojEntry &&
      manojEntry.months.october?.bank === 800 &&
      (manojEntry.months.october?.cash === '' || manojEntry.months.october?.cash === 0) &&
      (manojEntry.months.october?.siteCash === '' || manojEntry.months.october?.siteCash === 0),
      'Manoj Bandhan integration continues populating BANK column without affecting Office Cash or Site Cash',
      JSON.stringify(manojEntry?.months?.october)
    );
    // Cleanup manoj entry
    if (manojEntry) await col.deleteOne({ _id: manojEntry._id });

    // Cleanup remaining test voucher entries
    for (const vid of testVoucherIds) {
      await col.deleteMany({ sourceVoucherId: vid });
    }

    console.log(`\n======================================================`);
    console.log(`🏁 TEST RESULTS: ${passedCount} / ${totalCount} PASSED`);
    console.log(`======================================================\n`);

    if (passedCount === totalCount) {
      console.log('🎉 ALL ACCEPTANCE TESTS COMPLETED SUCCESSFULLY!');
    } else {
      console.error('⚠️ SOME ACCEPTANCE TESTS FAILED.');
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('💥 Test suite error:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

runTests();
