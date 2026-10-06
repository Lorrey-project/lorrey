const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const OthersCreditor = require('../models/OthersCreditor');
const AccountDetail = require('../models/AccountDetail');
const othersCreditorRoutes = require('../routes/othersCreditorRoutes');
const accountDetailRoutes = require('../routes/accountDetailRoutes');

let mongoServer;
let app;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);

  app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    if (req.url.startsWith('/api')) {
      req.url = req.url.replace(/^\/api/, '');
    }
    next();
  });
  app.use('/others-creditors', othersCreditorRoutes);
  app.use('/account-details', accountDetailRoutes);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await OthersCreditor.deleteMany({});
  await AccountDetail.deleteMany({});
});

describe('MANOJ BANDHAN Rules 1 & 2 Integration Tests', () => {

  test('Rule 1: Bank Book (LEDGER = MANOJ BANDHAN, NAMES = MANOJ BANDHAN, WITHDRAW = 10,000) creates Credit in MANOJ BANDHAN tab with Balance = 10,000', async () => {
    // 1. Create Bank Book withdrawal
    const bbRes = await request(app)
      .put('/account-details/bulk-update')
      .send({
        updates: [{
          isNewRow: true,
          changes: {
            'Transaction Date': '2026-10-04',
            'Ledger Name': 'MANOJ BANDHAN',
            'Names': 'MANOJ BANDHAN',
            'Month': 'October',
            'Withdraw': 10000,
            'Remarks': 'Bank Book initial credit'
          }
        }]
      });

    expect(bbRes.status).toBe(200);

    // 2. Fetch MANOJ BANDHAN records
    const creditorRes = await request(app)
      .get('/api/others-creditors')
      .query({ creditorName: 'MANOJ BANDHAN' });

    expect(creditorRes.status).toBe(200);
    expect(creditorRes.body.entries).toHaveLength(1);

    const r1 = creditorRes.body.entries[0];
    expect(r1.credit).toBe(10000);
    expect(r1.debit).toBe(0);
    expect(r1.balance).toBe(10000);
    expect(r1.creditorName).toBe('MANOJ BANDHAN');
  });

  test('Rule 2 & Balance Flow: Starting Credit 10,000 + Three Debits (2000, 1000, 1000) -> Balance 6000 -> Settle 2000 Debit -> Balance 8000', async () => {
    // 1. Rule 1: Bank Book creates 10,000 Credit
    await request(app)
      .put('/account-details/bulk-update')
      .send({
        updates: [{
          isNewRow: true,
          changes: {
            'Transaction Date': '2026-10-04',
            'Ledger Name': 'MANOJ BANDHAN',
            'Names': 'MANOJ BANDHAN',
            'Month': 'October',
            'Withdraw': 10000
          }
        }]
      });

    // 2. Create 3 Debits in MANOJ BANDHAN
    const d1Res = await request(app)
      .post('/api/others-creditors')
      .send({
        creditorName: 'MANOJ BANDHAN',
        date: '2026-10-04',
        ledgerName: 'Freight payment',
        names: 'ABHIJIT GHOSH',
        vehicleNo: 'WB 41 G 1024',
        credit: 0,
        debit: 2000
      });
    const d1Id = d1Res.body.entry._id;

    const d2Res = await request(app)
      .post('/api/others-creditors')
      .send({
        creditorName: 'MANOJ BANDHAN',
        date: '2026-10-04',
        ledgerName: 'Freight payment',
        names: 'AVIJIT GORAI',
        vehicleNo: 'WB 41 G 5555',
        credit: 0,
        debit: 1000
      });
    const d2Id = d2Res.body.entry._id;

    const d3Res = await request(app)
      .post('/api/others-creditors')
      .send({
        creditorName: 'MANOJ BANDHAN',
        date: '2026-10-04',
        ledgerName: 'Freight payment',
        names: 'BABLU BAR',
        vehicleNo: 'WB 41 G 9999',
        credit: 0,
        debit: 1000
      });
    const d3Id = d3Res.body.entry._id;

    // Check balance before settlement: 10,000 - 2,000 - 1,000 - 1,000 = 6,000
    let listRes = await request(app).get('/api/others-creditors').query({ creditorName: 'MANOJ BANDHAN' });
    let rows = listRes.body.entries;
    expect(rows).toHaveLength(4);
    expect(rows[rows.length - 1].balance).toBe(6000);

    // 3. Bank Book: Settle Debit 1 (2,000) using OTHERS CREDITOR
    const bbPayRes = await request(app)
      .put('/account-details/bulk-update')
      .send({
        updates: [{
          isNewRow: true,
          changes: {
            'Transaction Date': '2026-10-04',
            'Ledger Name': 'MANOJ BANDHAN',
            'Names': 'OTHERS CREDITOR',
            'Month': 'October',
            'Withdraw': 2000
          }
        }]
      });
    expect(bbPayRes.status).toBe(200);

    const bbTx = await AccountDetail.findOne({ names: 'OTHERS CREDITOR' });
    expect(bbTx).toBeTruthy();

    // Allocate to Debit 1
    const allocRes = await request(app)
      .post('/api/others-creditors/monoj-bandhan/allocate-debits')
      .send({
        bankBookTxId: bbTx._id.toString(),
        bankBookDate: '2026-10-04',
        bankBookMonth: 'October',
        withdrawAmount: 2000,
        selectedDebitIds: [d1Id]
      });

    expect(allocRes.status).toBe(200);
    expect(allocRes.body.success).toBe(true);

    // 4. Verify MANOJ BANDHAN rows & final balance
    listRes = await request(app).get('/api/others-creditors').query({ creditorName: 'MANOJ BANDHAN' });
    rows = listRes.body.entries;

    // Row for Debit 1
    const updatedD1 = rows.find(r => String(r._id) === String(d1Id));
    expect(updatedD1.debit).toBe(2000);
    expect(updatedD1.credit).toBe(2000);
    expect(updatedD1.paidAmount).toBe(2000);
    expect(updatedD1.balanceDue).toBe(0);
    expect(updatedD1.status).toBe('Paid');

    // Unpaid debits remain unchanged
    const updatedD2 = rows.find(r => String(r._id) === String(d2Id));
    expect(updatedD2.debit).toBe(1000);
    expect(updatedD2.credit).toBe(0);
    expect(updatedD2.paidAmount).toBe(0);
    expect(updatedD2.status).toBe('Pending');

    const updatedD3 = rows.find(r => String(r._id) === String(d3Id));
    expect(updatedD3.debit).toBe(1000);
    expect(updatedD3.credit).toBe(0);
    expect(updatedD3.paidAmount).toBe(0);
    expect(updatedD3.status).toBe('Pending');

    // Final balance must be 8,000
    expect(rows[rows.length - 1].balance).toBe(8000);
  });

  test('Multiple Selected Debits: Settle Debit A (2,000) and Debit B (1,000) with Withdraw = 3,000', async () => {
    // Create Debit A & Debit B
    const dA = await OthersCreditor.create({
      creditorName: 'MANOJ BANDHAN',
      date: '2026-10-04',
      debit: 2000,
      credit: 0
    });
    const dB = await OthersCreditor.create({
      creditorName: 'MANOJ BANDHAN',
      date: '2026-10-04',
      debit: 1000,
      credit: 0
    });

    const allocRes = await request(app)
      .post('/api/others-creditors/monoj-bandhan/allocate-debits')
      .send({
        bankBookTxId: new mongoose.Types.ObjectId().toString(),
        bankBookDate: '2026-10-04',
        withdrawAmount: 3000,
        selectedDebitIds: [dA._id.toString(), dB._id.toString()]
      });

    expect(allocRes.status).toBe(200);

    const checkA = await OthersCreditor.findById(dA._id);
    expect(checkA.paidAmount).toBe(2000);
    expect(checkA.credit).toBe(2000);
    expect(checkA.status).toBe('Paid');

    const checkB = await OthersCreditor.findById(dB._id);
    expect(checkB.paidAmount).toBe(1000);
    expect(checkB.credit).toBe(1000);
    expect(checkB.status).toBe('Paid');
  });

  test('Partial Payment: Debit = 4,000, Withdraw = 2,000 -> 2,000 Paid, 2,000 Due, Status = Partial, Credit = 2,000', async () => {
    const d4 = await OthersCreditor.create({
      creditorName: 'MANOJ BANDHAN',
      date: '2026-10-04',
      debit: 4000,
      credit: 0
    });

    const allocRes = await request(app)
      .post('/api/others-creditors/monoj-bandhan/allocate-debits')
      .send({
        bankBookTxId: new mongoose.Types.ObjectId().toString(),
        bankBookDate: '2026-10-04',
        withdrawAmount: 2000,
        selectedDebitIds: [d4._id.toString()]
      });

    expect(allocRes.status).toBe(200);

    const check4 = await OthersCreditor.findById(d4._id);
    expect(check4.debit).toBe(4000);
    expect(check4.credit).toBe(2000);
    expect(check4.paidAmount).toBe(2000);
    expect(check4.balanceDue).toBe(2000);
    expect(check4.status).toBe('Partial');
  });

  test('No Duplicate Credit: Calling allocate-debits multiple times for the same Bank Book transaction replaces/reapplies without multiplying credit', async () => {
    const dRow = await OthersCreditor.create({
      creditorName: 'MANOJ BANDHAN',
      date: '2026-10-04',
      debit: 2000,
      credit: 0
    });

    const txId = new mongoose.Types.ObjectId().toString();

    // 1st call
    await request(app)
      .post('/api/others-creditors/monoj-bandhan/allocate-debits')
      .send({
        bankBookTxId: txId,
        withdrawAmount: 2000,
        selectedDebitIds: [dRow._id.toString()]
      });

    let check = await OthersCreditor.findById(dRow._id);
    expect(check.credit).toBe(2000);
    expect(check.paidAmount).toBe(2000);

    // 2nd call with same txId (e.g. reload or re-save)
    await request(app)
      .post('/api/others-creditors/monoj-bandhan/allocate-debits')
      .send({
        bankBookTxId: txId,
        withdrawAmount: 2000,
        selectedDebitIds: [dRow._id.toString()]
      });

    check = await OthersCreditor.findById(dRow._id);
    expect(check.credit).toBe(2000); // Still 2000, NOT 4000
    expect(check.paidAmount).toBe(2000);
  });

  test('Edit Bank Book Payment: Withdraw changed from 2,000 to 1,500 -> Credit and Paid become 1,500', async () => {
    const dRow = await OthersCreditor.create({
      creditorName: 'MANOJ BANDHAN',
      date: '2026-10-04',
      debit: 2000,
      credit: 0
    });

    const txId = new mongoose.Types.ObjectId().toString();

    // 1. Initial 2000
    await request(app)
      .post('/api/others-creditors/monoj-bandhan/allocate-debits')
      .send({
        bankBookTxId: txId,
        withdrawAmount: 2000,
        selectedDebitIds: [dRow._id.toString()]
      });

    let check = await OthersCreditor.findById(dRow._id);
    expect(check.credit).toBe(2000);
    expect(check.paidAmount).toBe(2000);
    expect(check.status).toBe('Paid');

    // 2. Edit to 1500
    await request(app)
      .post('/api/others-creditors/monoj-bandhan/allocate-debits')
      .send({
        bankBookTxId: txId,
        withdrawAmount: 1500,
        selectedDebitIds: [dRow._id.toString()]
      });

    check = await OthersCreditor.findById(dRow._id);
    expect(check.credit).toBe(1500); // NOT 3500!
    expect(check.paidAmount).toBe(1500);
    expect(check.balanceDue).toBe(500);
    expect(check.status).toBe('Partial');
  });

  test('Delete Bank Book Payment: Reverting transaction restores debit to unpaid status and removes settlement credit', async () => {
    const dRow = await OthersCreditor.create({
      creditorName: 'MANOJ BANDHAN',
      date: '2026-10-04',
      debit: 2000,
      credit: 0
    });

    const txId = new mongoose.Types.ObjectId().toString();

    // 1. Allocate 2000
    await request(app)
      .post('/api/others-creditors/monoj-bandhan/allocate-debits')
      .send({
        bankBookTxId: txId,
        withdrawAmount: 2000,
        selectedDebitIds: [dRow._id.toString()]
      });

    let check = await OthersCreditor.findById(dRow._id);
    expect(check.credit).toBe(2000);
    expect(check.status).toBe('Paid');

    // 2. Revert allocation
    const revRes = await request(app)
      .post('/api/others-creditors/monoj-bandhan/revert-allocation')
      .send({ bankBookTxId: txId });

    expect(revRes.status).toBe(200);

    check = await OthersCreditor.findById(dRow._id);
    expect(check.credit).toBe(0);
    expect(check.paidAmount).toBe(0);
    expect(check.balanceDue).toBe(2000);
    expect(check.status).toBe('Unpaid');
  });

  test('TASK 1 Locking: Saved MANOJ BANDHAN row cannot be updated via PUT or manual bulk-save', async () => {
    // 1. Create a saved row
    const savedDoc = await OthersCreditor.create({
      creditorName: 'MANOJ BANDHAN',
      date: '2026-10-06',
      debit: 2500,
      credit: 0,
      remarks: 'Original Remarks',
      vehicleNo: 'WB39B1234'
    });

    // 2. Attempt direct PUT update
    const putRes = await request(app)
      .put(`/api/others-creditors/${savedDoc._id}`)
      .send({
        creditorName: 'MANOJ BANDHAN',
        debit: 5000,
        remarks: 'Hacked Remarks'
      });
    expect(putRes.status).toBe(403);
    expect(putRes.body.error).toMatch(/permanently locked/i);

    // 3. Attempt manual bulk-save overwrite
    const bulkRes = await request(app)
      .post('/api/others-creditors/bulk-save')
      .send({
        rows: [
          {
            _id: savedDoc._id.toString(),
            creditorName: 'MANOJ BANDHAN',
            debit: 9999,
            remarks: 'Overwritten'
          },
          {
            tempId: 'temp-new-row-1',
            creditorName: 'MANOJ BANDHAN',
            date: '2026-10-06',
            debit: 1500,
            credit: 500, // Should be forced to 0 by backend
            remarks: 'Brand New Row'
          }
        ]
      });
    expect(bulkRes.status).toBe(200);

    // Verify saved document was NOT modified
    const verifiedSaved = await OthersCreditor.findById(savedDoc._id);
    expect(verifiedSaved.debit).toBe(2500);
    expect(verifiedSaved.remarks).toBe('Original Remarks');

    // Verify new row was created with credit forced to 0
    const newDoc = await OthersCreditor.findOne({ remarks: 'Brand New Row' });
    expect(newDoc).toBeTruthy();
    expect(newDoc.debit).toBe(1500);
    expect(newDoc.credit).toBe(0);
  });

  test('TASK 2 Filtering: GET /monoj-bandhan/debit-rows returns ONLY unpaid / outstanding rows (excludes PAID)', async () => {
    // Clear and create 3 rows: 1 PAID, 1 PARTIAL, 1 UNPAID
    await OthersCreditor.deleteMany({ creditorName: 'MANOJ BANDHAN' });

    // Row 1: Fully Paid (Debit 2000, Paid 2000, Outstanding 0)
    await OthersCreditor.create({
      creditorName: 'MANOJ BANDHAN',
      date: '2026-10-06',
      debit: 2000,
      paidAmount: 2000,
      balanceDue: 0,
      status: 'Paid'
    });

    // Row 2: Partial (Debit 3000, Paid 1000, Outstanding 2000)
    const partialDoc = await OthersCreditor.create({
      creditorName: 'MANOJ BANDHAN',
      date: '2026-10-06',
      debit: 3000,
      paidAmount: 1000,
      balanceDue: 2000,
      status: 'Partial'
    });

    // Row 3: Unpaid (Debit 1500, Paid 0, Outstanding 1500)
    const unpaidDoc = await OthersCreditor.create({
      creditorName: 'MANOJ BANDHAN',
      date: '2026-10-06',
      debit: 1500,
      paidAmount: 0,
      balanceDue: 1500,
      status: 'Unpaid'
    });

    const res = await request(app).get('/api/others-creditors/monoj-bandhan/debit-rows');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const rows = res.body.debitRows;
    // Must return exactly 2 rows (Partial and Unpaid). Paid row must NOT be present!
    expect(rows.length).toBe(2);
    expect(rows.find(r => String(r._id) === String(partialDoc._id))).toBeTruthy();
    expect(rows.find(r => String(r._id) === String(unpaidDoc._id))).toBeTruthy();

    const partialItem = rows.find(r => String(r._id) === String(partialDoc._id));
    expect(partialItem.outstanding).toBe(2000);
    expect(partialItem.status).toBe('Partial');
  });

});
