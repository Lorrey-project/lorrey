const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const othersCreditorRoutes = require('../routes/othersCreditorRoutes');
const accountDetailRoutes = require('../routes/accountDetailRoutes');
const OthersCreditor = require('../models/OthersCreditor');
const AccountDetail = require('../models/AccountDetail');
const { pushToRegister } = require('../utils/syncManager');

jest.mock('../socket', () => ({
  getIO: () => ({ emit: jest.fn() })
}));

const app = express();
app.use(express.json());
app.use('/api/others-creditors', othersCreditorRoutes);
app.use('/api/account-details', accountDetailRoutes);

let mongoServer;

function getCementCol() {
  return mongoose.connection.useDb("cement_register").collection("entries");
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await getCementCol().deleteMany({});
  await OthersCreditor.deleteMany({});
  await AccountDetail.deleteMany({});
});

describe('FREIGHT ADVANCE -> CEMENT REGISTER PIPELINE (Multi-Source Accumulation)', () => {

  test('Case 1: Same Date + Owner + Vehicle: Manoj Bandhan (₹300) accumulates into existing Cement Register row', async () => {
    const cementCol = getCementCol();
    const cementRes = await cementCol.insertOne({
      "INVOICE NO": "INV-101",
      "VEHICLE NUMBER": "WB00A1234",
      "LOADING DT": "08/10/2026",
      "OWNER NAME": "SURAJ",
      "Bank TF": 0
    });
    const cementId = cementRes.insertedId;

    const res = await request(app)
      .post('/api/others-creditors')
      .send({
        creditorName: 'MONOJ BANDHAN',
        ledgerName: 'FREIGHT ADVANCE',
        names: 'SURAJ',
        vehicleNo: 'WB00A1234',
        debit: 300,
        date: '08/10/2026'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const updatedCement = await cementCol.findOne({ _id: cementId });
    expect(updatedCement["Bank TF"]).toBe(300);
    expect(updatedCement["BANK TF"]).toBe(300);
    expect(updatedCement["ADVANCE (BANK TF)"]).toBe(300);
    expect(updatedCement._freightAdvanceContributions).toHaveLength(1);
    expect(updatedCement._freightAdvanceContributions[0].amount).toBe(300);
    expect(updatedCement._freightAdvanceContributions[0].source).toBe('MONOJ_BANDHAN');
  });

  test('Case 2: MULTI-SOURCE ACCUMULATION: Manoj Bandhan (₹300) + Bank Book (₹400) accumulate together into ADVANCE BANK TF = ₹700', async () => {
    const cementCol = getCementCol();
    const cementRes = await cementCol.insertOne({
      "INVOICE NO": "INV-101",
      "VEHICLE NUMBER": "WB00A1234",
      "LOADING DT": "08/10/2026",
      "OWNER NAME": "SURAJ",
      "Bank TF": 0
    });
    const cementId = cementRes.insertedId;

    // 1. Manoj Bandhan Freight Advance ₹300
    await request(app)
      .post('/api/others-creditors')
      .send({
        creditorName: 'MANOJ BANDHAN',
        ledgerName: 'FREIGHT ADVANCE',
        names: 'SURAJ',
        vehicleNo: 'WB00A1234',
        debit: 300,
        date: '08/10/2026'
      });

    // 2. Bank Book Freight Advance ₹400
    const bankDoc = await AccountDetail.create({
      ledgerName: 'FREIGHT ADVANCE',
      names: 'SURAJ',
      vehicle: 'WB00A1234',
      withdraw: 400,
      transactionDate: '08/10/2026',
      month: 'October',
      selectedYear: '2026'
    });

    await request(app)
      .put('/api/account-details/bulk-update')
      .send({
        updates: [{
          id: bankDoc._id.toString(),
          changes: {
            'Ledger Name': 'FREIGHT ADVANCE',
            'Names': 'SURAJ',
            'Vehicle': 'WB00A1234',
            'Withdraw': 400,
            'Transaction Date': '08/10/2026',
            'Month': 'October',
            'selectedYear': '2026'
          }
        }]
      });

    // 3. Verify that Cement Register accumulated both to ₹700
    const updatedCement = await cementCol.findOne({ _id: cementId });
    expect(updatedCement["Bank TF"]).toBe(700);
    expect(updatedCement["BANK TF"]).toBe(700);
    expect(updatedCement["ADVANCE (BANK TF)"]).toBe(700);
    expect(updatedCement._freightAdvanceContributions).toHaveLength(2);

    const manojContrib = updatedCement._freightAdvanceContributions.find(c => c.source === 'MONOJ_BANDHAN');
    const bankContrib = updatedCement._freightAdvanceContributions.find(c => c.source === 'BANK_BOOK');
    expect(manojContrib.amount).toBe(300);
    expect(bankContrib.amount).toBe(400);
  });

  test('Case 3: Three separate Freight Advances (Manoj ₹300 + Bank Book ₹400 + Manoj ₹500) -> Total ₹1200', async () => {
    const cementCol = getCementCol();
    const cementRes = await cementCol.insertOne({
      "INVOICE NO": "INV-101",
      "VEHICLE NUMBER": "WB00A1234",
      "LOADING DT": "08/10/2026",
      "OWNER NAME": "SURAJ",
      "Bank TF": 0
    });
    const cementId = cementRes.insertedId;

    // 1. Manoj Bandhan ₹300
    await request(app)
      .post('/api/others-creditors')
      .send({
        creditorName: 'MANOJ BANDHAN',
        ledgerName: 'FREIGHT ADVANCE',
        names: 'SURAJ',
        vehicleNo: 'WB00A1234',
        debit: 300,
        date: '08/10/2026'
      });

    // 2. Bank Book ₹400
    const bankDoc = await AccountDetail.create({
      ledgerName: 'FREIGHT ADVANCE',
      names: 'SURAJ',
      vehicle: 'WB00A1234',
      withdraw: 400,
      transactionDate: '08/10/2026',
      month: 'October',
      selectedYear: '2026'
    });

    await request(app)
      .put('/api/account-details/bulk-update')
      .send({
        updates: [{
          id: bankDoc._id.toString(),
          changes: {
            'Ledger Name': 'FREIGHT ADVANCE',
            'Names': 'SURAJ',
            'Vehicle': 'WB00A1234',
            'Withdraw': 400,
            'Transaction Date': '08/10/2026',
            'Month': 'October',
            'selectedYear': '2026'
          }
        }]
      });

    // 3. Second Manoj Bandhan ₹500
    await request(app)
      .post('/api/others-creditors')
      .send({
        creditorName: 'MANOJ BANDHAN',
        ledgerName: 'FREIGHT ADVANCE',
        names: 'SURAJ',
        vehicleNo: 'WB00A1234',
        debit: 500,
        date: '08/10/2026'
      });

    const updatedCement = await cementCol.findOne({ _id: cementId });
    expect(updatedCement["Bank TF"]).toBe(1200);
    expect(updatedCement._freightAdvanceContributions).toHaveLength(3);
  });

  test('Case 4: Deleting Bank Book advance reverses only its contribution (₹1200 -> ₹800)', async () => {
    const cementCol = getCementCol();
    const cementRes = await cementCol.insertOne({
      "INVOICE NO": "INV-101",
      "VEHICLE NUMBER": "WB00A1234",
      "LOADING DT": "08/10/2026",
      "OWNER NAME": "SURAJ",
      "Bank TF": 0
    });
    const cementId = cementRes.insertedId;

    await request(app).post('/api/others-creditors').send({
      creditorName: 'MANOJ BANDHAN',
      ledgerName: 'FREIGHT ADVANCE',
      names: 'SURAJ',
      vehicleNo: 'WB00A1234',
      debit: 300,
      date: '08/10/2026'
    });

    const bankDoc = await AccountDetail.create({
      ledgerName: 'FREIGHT ADVANCE',
      names: 'SURAJ',
      vehicle: 'WB00A1234',
      withdraw: 400,
      transactionDate: '08/10/2026',
      month: 'October',
      selectedYear: '2026'
    });

    await request(app).put('/api/account-details/bulk-update').send({
      updates: [{
        id: bankDoc._id.toString(),
        changes: {
          'Ledger Name': 'FREIGHT ADVANCE',
          'Names': 'SURAJ',
          'Vehicle': 'WB00A1234',
          'Withdraw': 400,
          'Transaction Date': '08/10/2026',
          'Month': 'October',
          'selectedYear': '2026'
        }
      }]
    });

    await request(app).post('/api/others-creditors').send({
      creditorName: 'MANOJ BANDHAN',
      ledgerName: 'FREIGHT ADVANCE',
      names: 'SURAJ',
      vehicleNo: 'WB00A1234',
      debit: 500,
      date: '08/10/2026'
    });

    let updatedCement = await cementCol.findOne({ _id: cementId });
    expect(updatedCement["Bank TF"]).toBe(1200);

    // Delete Bank Book record
    await request(app).delete('/api/account-details/bulk-delete').send({
      ids: [bankDoc._id.toString()]
    });

    updatedCement = await cementCol.findOne({ _id: cementId });
    expect(updatedCement["Bank TF"]).toBe(800); // 1200 - 400
    expect(updatedCement._freightAdvanceContributions).toHaveLength(2);
    expect(updatedCement._freightAdvanceContributions.every(c => c.source === 'MONOJ_BANDHAN')).toBe(true);
  });

  test('Case 5: Dummy row created when advance recorded before trip -> Real trip arrival accumulates advances & cleans dummy', async () => {
    const cementCol = getCementCol();

    // 1. Advance recorded when trip does not exist yet
    await request(app).post('/api/others-creditors').send({
      creditorName: 'MANOJ BANDHAN',
      ledgerName: 'FREIGHT ADVANCE',
      names: 'SURAJ',
      vehicleNo: 'WB00A1234',
      debit: 300,
      date: '08/10/2026'
    });

    const bDoc = await AccountDetail.create({
      ledgerName: 'FREIGHT ADVANCE',
      names: 'SURAJ',
      vehicle: 'WB00A1234',
      withdraw: 400,
      transactionDate: '08/10/2026',
      month: 'October',
      selectedYear: '2026'
    });

    await request(app).put('/api/account-details/bulk-update').send({
      updates: [{
        id: bDoc._id.toString(),
        changes: {
          'Ledger Name': 'FREIGHT ADVANCE',
          'Names': 'SURAJ',
          'Vehicle': 'WB00A1234',
          'Withdraw': 400,
          'Transaction Date': '08/10/2026',
          'Month': 'October',
          'selectedYear': '2026'
        }
      }]
    });

    // Check dummy row was created with accumulated ₹700
    const dummyRows = await cementCol.find({
      $or: [{ isDummy: true }, { _isDummy: true }]
    }).toArray();
    expect(dummyRows.length).toBeGreaterThan(0);
    const dummy = dummyRows[0];
    expect(dummy["Bank TF"]).toBe(700);

    // 2. Real Invoice is uploaded / synced for that date & vehicle
    const fakeInvoiceId = new mongoose.Types.ObjectId();
    const Invoice = require('../models/Invoice');
    await Invoice.create({
      _id: fakeInvoiceId,
      human_verified_data: {
        supply_details: {
          vehicle_number: 'WB00A1234',
          vehicle_owner: 'SURAJ'
        },
        invoice_details: {
          invoice_date: '08/10/2026',
          invoice_number: 'INV-12345'
        }
      },
      parsed_data: {
        weight: '30'
      }
    });

    await pushToRegister(fakeInvoiceId);

    // 3. Real trip record exists in Cement Register with Bank TF = 700
    const realTrip = await cementCol.findOne({
      "VEHICLE NUMBER": /WB00A1234/i,
      isDummy: { $ne: true },
      _isDummy: { $ne: true }
    });
    expect(realTrip).toBeTruthy();
    expect(realTrip["Bank TF"]).toBe(700);

    // 4. Dummy rows for that vehicle & date are removed
    const remainingDummies = await cementCol.find({
      $or: [{ isDummy: true }, { _isDummy: true }]
    }).toArray();
    expect(remainingDummies).toHaveLength(0);
  });

  test('Case 6: Different date -> does NOT touch other dates', async () => {
    const cementCol = getCementCol();
    const cementRes1 = await cementCol.insertOne({
      "INVOICE NO": "INV-101",
      "VEHICLE NUMBER": "WB00A1234",
      "LOADING DT": "01/10/2026",
      "OWNER NAME": "SURAJ",
      "Bank TF": 500
    });

    // Advance on 08/10/2026
    await request(app).post('/api/others-creditors').send({
      creditorName: 'MANOJ BANDHAN',
      ledgerName: 'FREIGHT ADVANCE',
      names: 'SURAJ',
      vehicleNo: 'WB00A1234',
      debit: 300,
      date: '08/10/2026'
    });

    const checkTrip1 = await cementCol.findOne({ _id: cementRes1.insertedId });
    expect(checkTrip1["Bank TF"]).toBe(500); // 01/10/2026 unchanged
  });

  test('Case 7: MANOJ BANDHAN new columns (expenseType, billType, particulars) are persisted and returned correctly', async () => {
    // 1. Single create
    const createRes = await request(app)
      .post('/api/others-creditors')
      .send({
        creditorName: 'MANOJ BANDHAN',
        ledgerName: 'OFFICE EXPENSES',
        expenseType: 'INDIRECT EXPENSES',
        billType: 'GST',
        particulars: 'OFFICE EXPENSES',
        names: 'ABC CORP',
        debit: 1500,
        date: '08/10/2026'
      });

    expect(createRes.status).toBe(201);
    const createdEntry = createRes.body.entry;
    expect(createdEntry).toBeTruthy();
    expect(createdEntry.expenseType).toBe('INDIRECT EXPENSES');
    expect(createdEntry.billType).toBe('GST');
    expect(createdEntry.particulars).toBe('OFFICE EXPENSES');

    // 2. Bulk save new draft rows
    const bulkRes = await request(app)
      .post('/api/others-creditors/bulk-save')
      .send({
        creditorName: 'MANOJ BANDHAN',
        rows: [
          {
            creditorName: 'MANOJ BANDHAN',
            ledgerName: 'RENT EXP',
            expenseType: 'INDIRECT EXPENSES',
            billType: 'NON GST',
            particulars: 'RENT EXP',
            names: 'LANDLORD',
            debit: 20000,
            date: '08/10/2026'
          },
          {
            creditorName: 'MANOJ BANDHAN',
            ledgerName: 'SALARY',
            expenseType: 'INDIRECT EXPENSES',
            billType: 'NON GST',
            particulars: 'SALARY',
            names: 'STAFF 1',
            debit: 15000,
            date: '08/10/2026'
          }
        ]
      });

    expect(bulkRes.status).toBe(200);
    expect(bulkRes.body.success).toBe(true);

    // 3. Query all rows for MANOJ BANDHAN
    const getRes = await request(app)
      .get('/api/others-creditors?creditorName=MANOJ BANDHAN');

    expect(getRes.status).toBe(200);
    expect(getRes.body.entries).toHaveLength(3);

    const officeRow = getRes.body.entries.find(r => r.particulars === 'OFFICE EXPENSES');
    expect(officeRow).toBeTruthy();
    expect(officeRow.expenseType).toBe('INDIRECT EXPENSES');
    expect(officeRow.billType).toBe('GST');
    expect(officeRow.particulars).toBe('OFFICE EXPENSES');

    const rentRow = getRes.body.entries.find(r => r.particulars === 'RENT EXP');
    expect(rentRow).toBeTruthy();
    expect(rentRow.expenseType).toBe('INDIRECT EXPENSES');
    expect(rentRow.billType).toBe('NON GST');
    expect(rentRow.particulars).toBe('RENT EXP');

    const salaryRow = getRes.body.entries.find(r => r.particulars === 'SALARY');
    expect(salaryRow).toBeTruthy();
    expect(salaryRow.expenseType).toBe('INDIRECT EXPENSES');
    expect(salaryRow.billType).toBe('NON GST');
    expect(salaryRow.particulars).toBe('SALARY');
  });
});

