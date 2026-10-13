const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const AccountDetail = require('../models/AccountDetail');
const accountDetailRoutes = require('../routes/accountDetailRoutes');
const indirectExpenseRoutes = require('../routes/indirectExpenseRoutes');
const {
  QUALIFYING_PARTICULARS,
  isQualifyingBankBookIndirectExpense,
  syncBankBookDocToIndirectExpense,
  reverseBankBookDocFromIndirectExpense
} = require('../utils/bankBookIndirectExpenseManager');
const { syncVoucherToIndirectExpense } = require('../utils/voucherIndirectExpenseManager');

let mongoServer;
let app;

function getIndirectCol() {
  return mongoose.connection.db.collection('indirect_expenses');
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);

  app = express();
  app.use(express.json());
  app.use('/account-details', accountDetailRoutes);
  app.use('/indirect-expense', indirectExpenseRoutes);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await AccountDetail.deleteMany({});
  await getIndirectCol().deleteMany({});
});

describe('BANK BOOK -> INDIRECT EXPENSES LIVE INTEGRATION', () => {

  test('TEST 1: Save October 2026 Bank Book row with PRINTING & STATIONERY, Names = INDIRECT EXPENSE, amount ₹400', async () => {
    const res = await request(app)
      .put('/account-details/bulk-update')
      .send({
        updates: [
          {
            id: 'new_1',
            isNewRow: true,
            changes: {
              'Transaction Date': '2026-10-10',
              'Ledger Name': 'PRINTING & STATIONERY',
              'Month': 'October',
              'Names': 'INDIRECT EXPENSE',
              'Withdraw': '400',
              'Deposit': '',
              'Remarks': 'Office Paper & Pens'
            }
          }
        ]
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const getRes = await request(app).get('/indirect-expense?fy=FY%202026-27');
    expect(getRes.status).toBe(200);
    expect(getRes.body.entries).toHaveLength(1);

    const ieRow = getRes.body.entries[0];
    expect(ieRow.date).toBe('2026-10-10');
    expect(ieRow.particulars).toBe('PRINTING & STATIONERY');
    expect(ieRow.financialYear).toBe('FY 2026-27');
    expect(ieRow.months.october.bank).toBe(400);
    expect(ieRow.months.october.cash).toBe('');
    expect(ieRow.sourceType).toBe('BANK_BOOK');
    expect(ieRow.sourceBankBookId).toBeTruthy();
    expect(ieRow.remarks).toBe('Office Paper & Pens');
  });

  test('TEST 2: Save September 2026 transaction and verify it appears in September, not October', async () => {
    const res = await request(app)
      .put('/account-details/bulk-update')
      .send({
        updates: [
          {
            id: 'new_sep',
            isNewRow: true,
            changes: {
              'Transaction Date': '2026-09-15',
              'Ledger Name': 'OFFICE EXPENSES',
              'Month': 'September',
              'Names': 'INDIRECT EXPENSE',
              'Withdraw': '750',
              'Remarks': 'Coffee and tea supplies'
            }
          }
        ]
      });

    expect(res.status).toBe(200);

    const getRes = await request(app).get('/indirect-expense?fy=FY%202026-27');
    expect(getRes.status).toBe(200);
    expect(getRes.body.entries).toHaveLength(1);

    const ieRow = getRes.body.entries[0];
    expect(ieRow.date).toBe('2026-09-15');
    expect(ieRow.particulars).toBe('OFFICE EXPENSES');
    expect(ieRow.months.september.bank).toBe(750);
    expect(ieRow.months.october.bank).toBe('');
  });

  test('TEST 3: Save two separate ₹400 transactions with same date and Particulars; verify both preserved as separate records', async () => {
    const res = await request(app)
      .put('/account-details/bulk-update')
      .send({
        updates: [
          {
            id: 'new_tx1',
            isNewRow: true,
            changes: {
              'Transaction Date': '2026-10-10',
              'Ledger Name': 'PRINTING & STATIONERY',
              'Month': 'October',
              'Names': 'INDIRECT EXPENSE',
              'Withdraw': '400',
              'Remarks': 'Batch 1'
            }
          },
          {
            id: 'new_tx2',
            isNewRow: true,
            changes: {
              'Transaction Date': '2026-10-10',
              'Ledger Name': 'PRINTING & STATIONERY',
              'Month': 'October',
              'Names': 'INDIRECT EXPENSE',
              'Withdraw': '400',
              'Remarks': 'Batch 2'
            }
          }
        ]
      });

    expect(res.status).toBe(200);

    const getRes = await request(app).get('/indirect-expense?fy=FY%202026-27');
    expect(getRes.status).toBe(200);
    expect(getRes.body.entries).toHaveLength(2);

    const row1 = getRes.body.entries.find(r => r.remarks === 'Batch 1');
    const row2 = getRes.body.entries.find(r => r.remarks === 'Batch 2');

    expect(row1).toBeTruthy();
    expect(row1.months.october.bank).toBe(400);
    expect(row2).toBeTruthy();
    expect(row2.months.october.bank).toBe(400);
    expect(row1._id.toString()).not.toBe(row2._id.toString());
    expect(row1.sourceBankBookId).not.toBe(row2.sourceBankBookId);
  });

  test('TEST 4: Persistence after refresh and duplicate prevention on repeat saves', async () => {
    // 1. Initial save
    const res1 = await request(app)
      .put('/account-details/bulk-update')
      .send({
        updates: [
          {
            id: 'new_pers',
            isNewRow: true,
            changes: {
              'Transaction Date': '2026-10-10',
              'Ledger Name': 'RENT EXP',
              'Month': 'October',
              'Names': 'INDIRECT EXPENSE',
              'Withdraw': '15000'
            }
          }
        ]
      });

    expect(res1.status).toBe(200);
    const createdDoc = Object.values(res1.body.createdDocs)[0];
    const bankDocId = createdDoc._id.toString();

    // 2. Repeat save with same ID (e.g. user clicks save again)
    const res2 = await request(app)
      .put('/account-details/bulk-update')
      .send({
        updates: [
          {
            id: bankDocId,
            isNewRow: false,
            changes: {
              'Transaction Date': '2026-10-10',
              'Ledger Name': 'RENT EXP',
              'Month': 'October',
              'Names': 'INDIRECT EXPENSE',
              'Withdraw': '15000'
            }
          }
        ]
      });

    expect(res2.status).toBe(200);

    // 3. Verify exactly 1 record exists in Indirect Expenses
    const getRes = await request(app).get('/indirect-expense?fy=FY%202026-27');
    expect(getRes.status).toBe(200);
    expect(getRes.body.entries).toHaveLength(1);
    expect(getRes.body.entries[0].particulars).toBe('RENT EXP');
    expect(getRes.body.entries[0].months.october.bank).toBe(15000);
  });

  test('TEST 5: Edit transaction amount from ₹400 to ₹600; verify linked expense reflects ₹600 exactly once', async () => {
    // 1. Create with ₹400
    const res1 = await request(app)
      .put('/account-details/bulk-update')
      .send({
        updates: [
          {
            id: 'new_edit',
            isNewRow: true,
            changes: {
              'Transaction Date': '2026-10-10',
              'Ledger Name': 'BANK CHARGES',
              'Month': 'October',
              'Names': 'INDIRECT EXPENSE',
              'Withdraw': '400'
            }
          }
        ]
      });
    const bankDocId = Object.values(res1.body.createdDocs)[0]._id.toString();

    // 2. Edit to ₹600
    const res2 = await request(app)
      .put('/account-details/bulk-update')
      .send({
        updates: [
          {
            id: bankDocId,
            isNewRow: false,
            changes: {
              'Transaction Date': '2026-10-10',
              'Ledger Name': 'BANK CHARGES',
              'Month': 'October',
              'Names': 'INDIRECT EXPENSE',
              'Withdraw': '600'
            }
          }
        ]
      });
    expect(res2.status).toBe(200);

    const getRes = await request(app).get('/indirect-expense?fy=FY%202026-27');
    expect(getRes.status).toBe(200);
    expect(getRes.body.entries).toHaveLength(1);
    expect(getRes.body.entries[0].months.october.bank).toBe(600);
  });

  test('TEST 6: Delete source Bank Book transaction; verify only its linked expense is removed', async () => {
    // 1. Create two Bank Book transactions
    const res = await request(app)
      .put('/account-details/bulk-update')
      .send({
        updates: [
          {
            id: 'new_del1',
            isNewRow: true,
            changes: {
              'Transaction Date': '2026-10-10',
              'Ledger Name': 'BONUS',
              'Month': 'October',
              'Names': 'INDIRECT EXPENSE',
              'Withdraw': '5000'
            }
          },
          {
            id: 'new_del2',
            isNewRow: true,
            changes: {
              'Transaction Date': '2026-10-10',
              'Ledger Name': 'SALARY',
              'Month': 'October',
              'Names': 'INDIRECT EXPENSE',
              'Withdraw': '25000'
            }
          }
        ]
      });

    const created = Object.values(res.body.createdDocs);
    const idToDelete = created[0]._id.toString();
    const idToKeep = created[1]._id.toString();

    // 2. Delete the first transaction
    const delRes = await request(app)
      .delete('/account-details/bulk-delete')
      .send({ ids: [idToDelete] });
    expect(delRes.status).toBe(200);

    // 3. Verify only BONUS was deleted and SALARY remains
    const getRes = await request(app).get('/indirect-expense?fy=FY%202026-27');
    expect(getRes.status).toBe(200);
    expect(getRes.body.entries).toHaveLength(1);
    expect(getRes.body.entries[0].particulars).toBe('SALARY');
    expect(getRes.body.entries[0].months.october.bank).toBe(25000);
    expect(getRes.body.entries[0].sourceBankBookId).toBe(idToKeep);
  });

  test('TEST 7: Change Names from INDIRECT EXPENSE to NVCL; verify linked expense is reversed', async () => {
    // 1. Create with INDIRECT EXPENSE
    const res1 = await request(app)
      .put('/account-details/bulk-update')
      .send({
        updates: [
          {
            id: 'new_chg',
            isNewRow: true,
            changes: {
              'Transaction Date': '2026-10-10',
              'Ledger Name': 'SERVICES CHARGES',
              'Month': 'October',
              'Names': 'INDIRECT EXPENSE',
              'Withdraw': '1200'
            }
          }
        ]
      });
    const bankDocId = Object.values(res1.body.createdDocs)[0]._id.toString();

    const getRes1 = await request(app).get('/indirect-expense?fy=FY%202026-27');
    expect(getRes1.body.entries).toHaveLength(1);

    // 2. Change Names to NVCL
    const res2 = await request(app)
      .put('/account-details/bulk-update')
      .send({
        updates: [
          {
            id: bankDocId,
            isNewRow: false,
            changes: {
              'Transaction Date': '2026-10-10',
              'Ledger Name': 'SERVICES CHARGES',
              'Month': 'October',
              'Names': 'NVCL',
              'Withdraw': '1200'
            }
          }
        ]
      });
    expect(res2.status).toBe(200);

    const getRes2 = await request(app).get('/indirect-expense?fy=FY%202026-27');
    expect(getRes2.body.entries).toHaveLength(0);
  });

  test('TEST 8: Verify every listed Ledger Name (all 21 options) works with Names = INDIRECT EXPENSE', async () => {
    for (const [idx, ledger] of QUALIFYING_PARTICULARS.entries()) {
      const res = await request(app)
        .put('/account-details/bulk-update')
        .send({
          updates: [
            {
              id: `new_ledger_${idx}`,
              isNewRow: true,
              changes: {
                'Transaction Date': '2026-10-10',
                'Ledger Name': ledger,
                'Month': 'October',
                'Names': 'INDIRECT EXPENSE',
                'Withdraw': `${100 + idx * 10}`
              }
            }
          ]
        });
      expect(res.status).toBe(200);
    }

    const getRes = await request(app).get('/indirect-expense?fy=FY%202026-27');
    expect(getRes.status).toBe(200);
    expect(getRes.body.entries).toHaveLength(21);

    for (const ledger of QUALIFYING_PARTICULARS) {
      const found = getRes.body.entries.find(r => r.particulars.toLowerCase() === ledger.toLowerCase());
      expect(found).toBeTruthy();
      expect(found.months.october.bank).toBeGreaterThan(0);
    }
  });

  test('TEST 9: Verify normal Bank Book transaction does not create an Indirect Expenses record', async () => {
    // Normal freight payment
    await request(app)
      .put('/account-details/bulk-update')
      .send({
        updates: [
          {
            id: 'new_normal',
            isNewRow: true,
            changes: {
              'Transaction Date': '2026-10-10',
              'Ledger Name': 'FREIGHT PAYMENT',
              'Month': 'October',
              'Names': 'UDAY MALIK',
              'Withdraw': '50000'
            }
          }
        ]
      });

    const getRes = await request(app).get('/indirect-expense?fy=FY%202026-27');
    expect(getRes.status).toBe(200);
    expect(getRes.body.entries).toHaveLength(0);
  });

  test('TEST 10: Verify voucher-linked expenses appear in CASH and Bank Book-linked expenses appear in BANK', async () => {
    // 1. Create voucher-linked indirect expense (CASH)
    await syncVoucherToIndirectExpense({
      _id: new mongoose.Types.ObjectId(),
      voucherNumber: 'VCH-001',
      date: new Date('2026-10-05'),
      amount: 350,
      voucherType: 'DEBIT',
      expenseType: 'INDIRECT EXPENSE',
      purpose: 'PRINTING & STATIONERY',
      remarks: 'Voucher Cash Payment'
    });

    // 2. Create Bank Book indirect expense (BANK)
    await request(app)
      .put('/account-details/bulk-update')
      .send({
        updates: [
          {
            id: 'new_bb_dual',
            isNewRow: true,
            changes: {
              'Transaction Date': '2026-10-10',
              'Ledger Name': 'PRINTING & STATIONERY',
              'Month': 'October',
              'Names': 'INDIRECT EXPENSE',
              'Withdraw': '400',
              'Remarks': 'Bank Transfer for Paper'
            }
          }
        ]
      });

    const getRes = await request(app).get('/indirect-expense?fy=FY%202026-27');
    expect(getRes.status).toBe(200);
    expect(getRes.body.entries.length).toBeGreaterThanOrEqual(1);

    // Verify voucher record has cash amount 350
    const vchRow = getRes.body.entries.find(r => r.months.october.cash === 350);
    expect(vchRow).toBeTruthy();
    expect(vchRow.months.october.cash).toBe(350);

    // Verify Bank Book record has bank amount 400
    const bbRow = getRes.body.entries.find(r => r.months.october.bank === 400);
    expect(bbRow).toBeTruthy();
    expect(bbRow.months.october.bank).toBe(400);
    expect(bbRow.sourceType).toBe('BANK_BOOK');
  });

  test('TEST 11: Verify Financial Year and historical month filtering', async () => {
    // FY 2025-26 transaction (October 2025)
    await request(app)
      .put('/account-details/bulk-update')
      .send({
        updates: [
          {
            id: 'new_hist',
            isNewRow: true,
            changes: {
              'Transaction Date': '2025-10-10',
              'Ledger Name': 'SALARY',
              'Month': 'October',
              'Year': '2025',
              'Names': 'INDIRECT EXPENSE',
              'Withdraw': '20000'
            }
          }
        ]
      });

    // FY 2026-27 transaction (October 2026)
    await request(app)
      .put('/account-details/bulk-update')
      .send({
        updates: [
          {
            id: 'new_curr',
            isNewRow: true,
            changes: {
              'Transaction Date': '2026-10-10',
              'Ledger Name': 'SALARY',
              'Month': 'October',
              'Year': '2026',
              'Names': 'INDIRECT EXPENSE',
              'Withdraw': '30000'
            }
          }
        ]
      });

    // Query FY 2025-26
    const res25 = await request(app).get('/indirect-expense?fy=FY%202025-26');
    expect(res25.status).toBe(200);
    expect(res25.body.entries).toHaveLength(1);
    expect(res25.body.entries[0].months.october.bank).toBe(20000);

    // Query FY 2026-27
    const res26 = await request(app).get('/indirect-expense?fy=FY%202026-27');
    expect(res26.status).toBe(200);
    expect(res26.body.entries).toHaveLength(1);
    expect(res26.body.entries[0].months.october.bank).toBe(30000);
  });

});
