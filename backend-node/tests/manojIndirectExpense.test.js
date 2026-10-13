const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const OthersCreditor = require('../models/OthersCreditor');
const othersCreditorRoutes = require('../routes/othersCreditorRoutes');
const indirectExpenseRoutes = require('../routes/indirectExpenseRoutes');
const {
  syncManojRowToIndirectExpense,
  reverseManojRowFromIndirectExpense
} = require('../utils/monojIndirectExpenseManager');

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
  app.use('/api/others-creditors', othersCreditorRoutes);
  app.use('/indirect-expense', indirectExpenseRoutes);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await OthersCreditor.deleteMany({});
  await getIndirectCol().deleteMany({});
});

describe('MANOJ BANDHAN -> INDIRECT EXPENSES LIVE INTEGRATION', () => {

  test('TEST 1: Single qualifying MANOJ BANDHAN row creates exactly one linked INDIRECT EXPENSES row in correct month BANK column', async () => {
    const res = await request(app)
      .post('/api/others-creditors')
      .send({
        creditorName: 'MANOJ BANDHAN',
        date: '08/10/2026',
        expenseType: 'INDIRECT EXPENSES',
        billType: 'NON GST',
        particulars: 'SALARY',
        debit: 1000
      });

    expect(res.status).toBe(201);
    const manojEntry = res.body.entry;
    expect(manojEntry).toBeTruthy();

    const getRes = await request(app).get('/indirect-expense?fy=FY%202026-27');
    expect(getRes.status).toBe(200);
    expect(getRes.body.entries).toHaveLength(1);

    const ieRow = getRes.body.entries[0];
    expect(ieRow.date).toBe('08/10/2026');
    expect(ieRow.particulars).toBe('SALARY');
    expect(ieRow.financialYear).toBe('FY 2026-27');
    expect(ieRow.months.october.bank).toBe(1000);
    expect(ieRow.months.october.cash).toBe('');
    expect(ieRow.sourceType).toBe('MANOJ_BANDHAN');
    expect(ieRow.sourceManojBandhanId).toBe(manojEntry._id.toString());
  });

  test('TEST 2: Two rows on the same date do NOT merge into one row', async () => {
    await request(app).post('/api/others-creditors').send({
      creditorName: 'MANOJ BANDHAN',
      date: '08/10/2026',
      expenseType: 'INDIRECT EXPENSES',
      billType: 'NON GST',
      particulars: 'SALARY',
      debit: 1000
    });

    await request(app).post('/api/others-creditors').send({
      creditorName: 'MANOJ BANDHAN',
      date: '08/10/2026',
      expenseType: 'INDIRECT EXPENSES',
      billType: 'NON GST',
      particulars: 'BANK CHARGES',
      debit: 500
    });

    const getRes = await request(app).get('/indirect-expense?fy=FY%202026-27');
    expect(getRes.status).toBe(200);
    expect(getRes.body.entries).toHaveLength(2);

    const salaryRow = getRes.body.entries.find(r => r.particulars === 'SALARY');
    expect(salaryRow).toBeTruthy();
    expect(salaryRow.date).toBe('08/10/2026');
    expect(salaryRow.months.october.bank).toBe(1000);

    const bankChargesRow = getRes.body.entries.find(r => r.particulars === 'BANK CHARGES');
    expect(bankChargesRow).toBeTruthy();
    expect(bankChargesRow.date).toBe('08/10/2026');
    expect(bankChargesRow.months.october.bank).toBe(500);
  });

  test('TEST 3: Multiple same-day same-particulars rows also remain separate', async () => {
    await request(app).post('/api/others-creditors').send({
      creditorName: 'MANOJ BANDHAN',
      date: '08/10/2026',
      expenseType: 'INDIRECT EXPENSES',
      billType: 'NON GST',
      particulars: 'SALARY',
      debit: 1000
    });

    await request(app).post('/api/others-creditors').send({
      creditorName: 'MANOJ BANDHAN',
      date: '08/10/2026',
      expenseType: 'INDIRECT EXPENSES',
      billType: 'NON GST',
      particulars: 'BANK CHARGES',
      debit: 500
    });

    await request(app).post('/api/others-creditors').send({
      creditorName: 'MANOJ BANDHAN',
      date: '08/10/2026',
      expenseType: 'INDIRECT EXPENSES',
      billType: 'NON GST',
      particulars: 'SALARY',
      debit: 2000
    });

    const getRes = await request(app).get('/indirect-expense?fy=FY%202026-27');
    expect(getRes.status).toBe(200);
    expect(getRes.body.entries).toHaveLength(3);

    const salaryRows = getRes.body.entries.filter(r => r.particulars === 'SALARY');
    expect(salaryRows).toHaveLength(2);
    const salaryAmounts = salaryRows.map(r => r.months.october.bank).sort((a, b) => a - b);
    expect(salaryAmounts).toEqual([1000, 2000]);

    const bankChargesRow = getRes.body.entries.find(r => r.particulars === 'BANK CHARGES');
    expect(bankChargesRow.months.october.bank).toBe(500);
  });

  test('TEST 4: BILL TYPE = GST triggers automatic INDIRECT EXPENSES integration with GST billType', async () => {
    await request(app).post('/api/others-creditors').send({
      creditorName: 'MANOJ BANDHAN',
      date: '08/10/2026',
      expenseType: 'INDIRECT EXPENSES',
      billType: 'GST',
      particulars: 'OFFICE EXPENSES',
      debit: 1000
    });

    const getRes = await request(app).get('/indirect-expense?fy=FY%202026-27');
    expect(getRes.status).toBe(200);
    expect(getRes.body.entries).toHaveLength(1);
    expect(getRes.body.entries[0].billType).toBe('GST');
    expect(getRes.body.entries[0].particulars).toBe('OFFICE EXPENSES');
    expect(getRes.body.entries[0].months.october.bank).toBe(1000);
  });

  test('TEST 5: EXPENSE TYPE != INDIRECT EXPENSES does NOT trigger automatic integration', async () => {
    await request(app).post('/api/others-creditors').send({
      creditorName: 'MANOJ BANDHAN',
      date: '08/10/2026',
      expenseType: 'DIRECT EXPENSES',
      billType: 'NON GST',
      particulars: 'SALARY',
      debit: 1000
    });

    const getRes = await request(app).get('/indirect-expense?fy=FY%202026-27');
    expect(getRes.status).toBe(200);
    expect(getRes.body.entries).toHaveLength(0);
  });

  test('TEST 6: Persistence across multiple queries / browser reloads', async () => {
    const res = await request(app).post('/api/others-creditors').send({
      creditorName: 'MANOJ BANDHAN',
      date: '08/10/2026',
      expenseType: 'INDIRECT EXPENSES',
      billType: 'NON GST',
      particulars: 'OFFICE EXPENSES',
      debit: 1250
    });
    expect(res.status).toBe(201);

    // Query 1
    let getRes = await request(app).get('/indirect-expense?fy=FY%202026-27');
    expect(getRes.body.entries).toHaveLength(1);
    expect(getRes.body.entries[0].particulars).toBe('OFFICE EXPENSES');
    expect(getRes.body.entries[0].months.october.bank).toBe(1250);

    // Query 2 (simulating browser reload)
    getRes = await request(app).get('/indirect-expense?fy=FY%202026-27');
    expect(getRes.body.entries).toHaveLength(1);
  });

  test('TEST 7: Idempotency - bulk-save called repeatedly does NOT duplicate INDIRECT EXPENSES rows', async () => {
    const m1 = await OthersCreditor.create({
      creditorName: 'MANOJ BANDHAN',
      date: '08/10/2026',
      expenseType: 'INDIRECT EXPENSES',
      billType: 'NON GST',
      particulars: 'RENT EXP',
      debit: 15000
    });

    // 1st sync
    await syncManojRowToIndirectExpense(m1);

    // 2nd sync
    await syncManojRowToIndirectExpense(m1);

    // 3rd sync via bulk-save
    await request(app).post('/api/others-creditors/bulk-save').send({
      rows: [
        {
          _id: m1._id.toString(),
          creditorName: 'MANOJ BANDHAN',
          date: '08/10/2026',
          expenseType: 'INDIRECT EXPENSES',
          billType: 'NON GST',
          particulars: 'RENT EXP',
          debit: 15000
        }
      ]
    });

    const getRes = await request(app).get('/indirect-expense?fy=FY%202026-27');
    expect(getRes.body.entries).toHaveLength(1);
    expect(getRes.body.entries[0].months.october.bank).toBe(15000);
  });

  test('TEST 8: Edit synchronization - editing date, particulars, and debit amount updates the linked INDIRECT EXPENSES row', async () => {
    const m1 = await OthersCreditor.create({
      creditorName: 'MANOJ BANDHAN',
      date: '08/10/2026',
      expenseType: 'INDIRECT EXPENSES',
      billType: 'NON GST',
      particulars: 'SALARY',
      debit: 1000
    });
    await syncManojRowToIndirectExpense(m1);

    let getRes = await request(app).get('/indirect-expense?fy=FY%202026-27');
    expect(getRes.body.entries).toHaveLength(1);
    expect(getRes.body.entries[0].particulars).toBe('SALARY');
    expect(getRes.body.entries[0].months.october.bank).toBe(1000);

    // Update row
    m1.date = '09/10/2026';
    m1.particulars = 'RENT EXP';
    m1.debit = 1500;
    await m1.save();
    await syncManojRowToIndirectExpense(m1);

    getRes = await request(app).get('/indirect-expense?fy=FY%202026-27');
    expect(getRes.body.entries).toHaveLength(1);
    const updatedIe = getRes.body.entries[0];
    expect(updatedIe.date).toBe('09/10/2026');
    expect(updatedIe.particulars).toBe('RENT EXP');
    expect(updatedIe.months.october.bank).toBe(1500);
  });

  test('TEST 9: Qualification change - Changing expenseType to DIRECT EXPENSES removes linked INDIRECT EXPENSES row', async () => {
    const m1 = await OthersCreditor.create({
      creditorName: 'MANOJ BANDHAN',
      date: '08/10/2026',
      expenseType: 'INDIRECT EXPENSES',
      billType: 'NON GST',
      particulars: 'SALARY',
      debit: 1000
    });
    await syncManojRowToIndirectExpense(m1);

    let getRes = await request(app).get('/indirect-expense?fy=FY%202026-27');
    expect(getRes.body.entries).toHaveLength(1);

    // Change to DIRECT EXPENSES
    m1.expenseType = 'DIRECT EXPENSES';
    await m1.save();
    await syncManojRowToIndirectExpense(m1);

    getRes = await request(app).get('/indirect-expense?fy=FY%202026-27');
    expect(getRes.body.entries).toHaveLength(0);
  });

  test('TEST 10: Delete synchronization - Deleting MANOJ BANDHAN row deletes the linked INDIRECT EXPENSES row', async () => {
    const res = await request(app).post('/api/others-creditors').send({
      creditorName: 'MANOJ BANDHAN',
      date: '08/10/2026',
      expenseType: 'INDIRECT EXPENSES',
      billType: 'NON GST',
      particulars: 'COURIER CHARGERS',
      debit: 350
    });
    expect(res.status).toBe(201);
    const createdId = res.body.entry._id;

    let getRes = await request(app).get('/indirect-expense?fy=FY%202026-27');
    expect(getRes.body.entries).toHaveLength(1);

    // Delete
    const delRes = await request(app).delete(`/api/others-creditors/${createdId}`);
    expect(delRes.status).toBe(200);

    getRes = await request(app).get('/indirect-expense?fy=FY%202026-27');
    expect(getRes.body.entries).toHaveLength(0);
  });

  test('TEST 11: Manual INDIRECT EXPENSES rows and MANOJ BANDHAN-linked rows coexist safely', async () => {
    // 1. Create a manual indirect expense
    await request(app).post('/indirect-expense').send({
      date: '08/10/2026',
      particulars: 'PRINTING & STATIONERY',
      financialYear: 'FY 2026-27',
      months: {
        october: { bank: 800, cash: 200 }
      },
      remarks: 'Manual entry'
    });

    // 2. Create MANOJ BANDHAN-linked row
    await request(app).post('/api/others-creditors').send({
      creditorName: 'MANOJ BANDHAN',
      date: '08/10/2026',
      expenseType: 'INDIRECT EXPENSES',
      billType: 'NON GST',
      particulars: 'SALARY',
      debit: 5000
    });

    const getRes = await request(app).get('/indirect-expense?fy=FY%202026-27');
    expect(getRes.body.entries).toHaveLength(2);

    const manualRow = getRes.body.entries.find(r => r.particulars === 'PRINTING & STATIONERY');
    expect(manualRow).toBeTruthy();
    expect(manualRow.months.october.bank).toBe(800);
    expect(manualRow.months.october.cash).toBe(200);
    expect(manualRow.sourceType).toBe('MANUAL');

    const manojRow = getRes.body.entries.find(r => r.particulars === 'SALARY');
    expect(manojRow).toBeTruthy();
    expect(manojRow.months.october.bank).toBe(5000);
    expect(manojRow.months.october.cash).toBe('');
    expect(manojRow.sourceType).toBe('MANOJ_BANDHAN');
  });

  test('TEST 12: Month mapping across different dates and financial year boundaries', async () => {
    // 1. August 2026 -> AUGUST BANK
    await request(app).post('/api/others-creditors').send({
      creditorName: 'MANOJ BANDHAN',
      date: '31/08/2026',
      expenseType: 'INDIRECT EXPENSES',
      billType: 'NON GST',
      particulars: 'SALARY',
      debit: 1000
    });

    // 2. March 2027 -> MARCH BANK (FY 2026-27)
    await request(app).post('/api/others-creditors').send({
      creditorName: 'MANOJ BANDHAN',
      date: '15/03/2027',
      expenseType: 'INDIRECT EXPENSES',
      billType: 'NON GST',
      particulars: 'RENT EXP',
      debit: 2500
    });

    const getRes = await request(app).get('/indirect-expense?fy=FY%202026-27');
    expect(getRes.body.entries).toHaveLength(2);

    const augRow = getRes.body.entries.find(r => r.particulars === 'SALARY');
    expect(augRow.date).toBe('31/08/2026');
    expect(augRow.months.august.bank).toBe(1000);
    expect(augRow.months.october.bank).toBe('');

    const marRow = getRes.body.entries.find(r => r.particulars === 'RENT EXP');
    expect(marRow.date).toBe('15/03/2027');
    expect(marRow.months.march.bank).toBe(2500);
    expect(marRow.months.august.bank).toBe('');
  });

  test('TEST 13: EXPENSE TYPE = INDIRECT EXPENSES clears and prevents stale ledgerName, names, and vehicleNo from saving', async () => {
    // 1. Single create with stale fields
    const res = await request(app).post('/api/others-creditors').send({
      creditorName: 'MANOJ BANDHAN',
      date: '08/10/2026',
      expenseType: 'INDIRECT EXPENSES',
      billType: 'NON GST',
      particulars: 'OFFICE EXPENSES',
      ledgerName: 'Stale Ledger',
      names: 'Stale Name',
      vehicleNo: 'WB123456',
      debit: 2000
    });
    expect(res.status).toBe(201);
    expect(res.body.entry.ledgerName).toBe('');
    expect(res.body.entry.names).toBe('');
    expect(res.body.entry.vehicleNo).toBe('');

    // 2. Bulk save with stale fields
    const bulkRes = await request(app).post('/api/others-creditors/bulk-save').send({
      rows: [
        {
          creditorName: 'MANOJ BANDHAN',
          date: '08/10/2026',
          expenseType: 'INDIRECT EXPENSES',
          billType: 'NON GST',
          particulars: 'RENT EXP',
          ledgerName: 'Old Ledger',
          names: 'Old Owner',
          vehicleNo: 'WB999999',
          debit: 10000
        }
      ]
    });
    expect(bulkRes.status).toBe(200);
    const rentRow = bulkRes.body.entries.find(r => r.particulars === 'RENT EXP');
    expect(rentRow).toBeTruthy();
    expect(rentRow.ledgerName).toBe('');
    expect(rentRow.names).toBe('');
    expect(rentRow.vehicleNo).toBe('');
  });

  test('TEST 14: Non-INDIRECT EXPENSES rows preserve ledgerName, names, and vehicleNo normally', async () => {
    const res = await request(app).post('/api/others-creditors').send({
      creditorName: 'MANOJ BANDHAN',
      date: '08/10/2026',
      expenseType: 'DIRECT EXPENSES',
      billType: '',
      particulars: '',
      ledgerName: 'FREIGHT ADVANCE',
      names: 'SURAJ SINGH',
      vehicleNo: 'JH10BY9023',
      debit: 1500
    });
    expect(res.status).toBe(201);
    expect(res.body.entry.ledgerName).toBe('FREIGHT ADVANCE');
    expect(res.body.entry.names).toBe('SURAJ SINGH');
    expect(res.body.entry.vehicleNo).toBe('JH10BY9023');
  });

});

