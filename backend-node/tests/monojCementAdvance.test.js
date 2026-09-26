const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const othersCreditorRoutes = require('../routes/othersCreditorRoutes');
const OthersCreditor = require('../models/OthersCreditor');

jest.mock('../socket', () => ({
  getIO: () => ({ emit: jest.fn() })
}));

const app = express();
app.use(express.json());
app.use('/api/others-creditors', othersCreditorRoutes);

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
});

describe('OTHER CREDITOR -> MONOJ BANDHAN -> CEMENT REGISTER Pipeline', () => {

  test('Case 1: Vehicle has no existing Advance Bank TF -> Monoj Debit ₹500 makes Bank TF ₹500', async () => {
    // 1. Seed Cement Register with vehicle WB 41 G 1024
    const cementCol = getCementCol();
    const cementRes = await cementCol.insertOne({
      "VEHICLE NUMBER": "WB 41 G 1024",
      "LOADING DATE": "2026-09-01",
      "OWNER NAME": "ABHIJIT GHOSH",
      "Bank TF": 0
    });
    const cementId = cementRes.insertedId;

    // 2. Create Monoj Bandhan Debit ₹500
    const res = await request(app)
      .post('/api/others-creditors')
      .send({
        creditorName: 'MONOJ BANDHAN',
        names: 'ABHIJIT GHOSH',
        vehicleNo: 'WB 41 G 1024',
        debit: 500,
        date: '2026-09-26'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.cementSyncResult.applied).toBe(true);

    // 3. Verify Cement Register record
    const updatedCement = await cementCol.findOne({ _id: cementId });
    expect(updatedCement["Bank TF"]).toBe(500);
    expect(updatedCement._monojDebitContributions).toHaveLength(1);
    expect(updatedCement._monojDebitContributions[0].amount).toBe(500);
    expect(updatedCement._monojDebitContributions[0].txId).toBe(res.body.entry._id);
  });

  test('Case 2: Vehicle has existing Advance Bank TF ₹2,000 -> Monoj Debit ₹500 makes Bank TF ₹2,500', async () => {
    const cementCol = getCementCol();
    const cementRes = await cementCol.insertOne({
      "VEHICLE NUMBER": "WB 41 G 1024",
      "LOADING DATE": "2026-09-05",
      "OWNER NAME": "ABHIJIT GHOSH",
      "Bank TF": 2000
    });
    const cementId = cementRes.insertedId;

    const res = await request(app)
      .post('/api/others-creditors')
      .send({
        creditorName: 'MONOJ BANDHAN',
        names: 'ABHIJIT GHOSH',
        vehicleNo: 'WB 41 G 1024',
        debit: 500,
        date: '2026-09-26'
      });

    expect(res.status).toBe(201);
    const updatedCement = await cementCol.findOne({ _id: cementId });
    expect(updatedCement["Bank TF"]).toBe(2500);
  });

  test('Case 3: Three separate Monoj Debits (₹500 + ₹700 + ₹300) -> all accumulate correctly to ₹2,500 from initial ₹1,000', async () => {
    const cementCol = getCementCol();
    const cementRes = await cementCol.insertOne({
      "VEHICLE NUMBER": "WB 41 G 1024",
      "LOADING DATE": "2026-09-10",
      "OWNER NAME": "ABHIJIT GHOSH",
      "Bank TF": 1000
    });
    const cementId = cementRes.insertedId;

    // Tx 1: ₹500
    await request(app).post('/api/others-creditors').send({
      creditorName: 'MONOJ BANDHAN',
      names: 'ABHIJIT GHOSH',
      vehicleNo: 'WB 41 G 1024',
      debit: 500,
      date: '2026-09-26'
    });
    let curCement = await cementCol.findOne({ _id: cementId });
    expect(curCement["Bank TF"]).toBe(1500);

    // Tx 2: ₹700
    await request(app).post('/api/others-creditors').send({
      creditorName: 'MONOJ BANDHAN',
      names: 'ABHIJIT GHOSH',
      vehicleNo: 'WB 41 G 1024',
      debit: 700,
      date: '2026-09-26'
    });
    curCement = await cementCol.findOne({ _id: cementId });
    expect(curCement["Bank TF"]).toBe(2200);

    // Tx 3: ₹300
    await request(app).post('/api/others-creditors').send({
      creditorName: 'MONOJ BANDHAN',
      names: 'ABHIJIT GHOSH',
      vehicleNo: 'WB 41 G 1024',
      debit: 300,
      date: '2026-09-26'
    });
    curCement = await cementCol.findOne({ _id: cementId });
    expect(curCement["Bank TF"]).toBe(2500);
    expect(curCement._monojDebitContributions).toHaveLength(3);
  });

  test('Case 4: Same vehicle has multiple invoices -> only the latest invoice receives a NEW Monoj Debit', async () => {
    const cementCol = getCementCol();
    // Older invoice (01-09-2026)
    const older = await cementCol.insertOne({
      "VEHICLE NUMBER": "WB 41 G 1024",
      "LOADING DATE": "01-09-2026",
      "Bank TF": 100
    });
    // Newer invoice (20-09-2026)
    const newer = await cementCol.insertOne({
      "VEHICLE NUMBER": "WB 41 G 1024",
      "LOADING DATE": "20-09-2026",
      "Bank TF": 500
    });

    await request(app).post('/api/others-creditors').send({
      creditorName: 'MONOJ BANDHAN',
      names: 'ABHIJIT GHOSH',
      vehicleNo: 'WB 41 G 1024',
      debit: 400,
      date: '2026-09-26'
    });

    const checkOlder = await cementCol.findOne({ _id: older.insertedId });
    const checkNewer = await cementCol.findOne({ _id: newer.insertedId });

    expect(checkOlder["Bank TF"]).toBe(100); // Unchanged
    expect(checkNewer["Bank TF"]).toBe(900); // 500 + 400
  });

  test('Case 5: A new invoice uploaded later -> existing contribution stays on old invoice, new debit targets new invoice', async () => {
    const cementCol = getCementCol();
    // 1st invoice
    const inv1 = await cementCol.insertOne({
      "VEHICLE NUMBER": "WB 41 G 1024",
      "LOADING DATE": "01-09-2026",
      "Bank TF": 200
    });

    // 1st Monoj Debit
    await request(app).post('/api/others-creditors').send({
      creditorName: 'MONOJ BANDHAN',
      names: 'ABHIJIT GHOSH',
      vehicleNo: 'WB 41 G 1024',
      debit: 300,
      date: '2026-09-02'
    });

    let checkInv1 = await cementCol.findOne({ _id: inv1.insertedId });
    expect(checkInv1["Bank TF"]).toBe(500); // 200 + 300

    // Later, new invoice uploaded (15-09-2026)
    const inv2 = await cementCol.insertOne({
      "VEHICLE NUMBER": "WB 41 G 1024",
      "LOADING DATE": "15-09-2026",
      "Bank TF": 1000
    });

    // 2nd Monoj Debit
    await request(app).post('/api/others-creditors').send({
      creditorName: 'MONOJ BANDHAN',
      names: 'ABHIJIT GHOSH',
      vehicleNo: 'WB 41 G 1024',
      debit: 600,
      date: '2026-09-16'
    });

    checkInv1 = await cementCol.findOne({ _id: inv1.insertedId });
    const checkInv2 = await cementCol.findOne({ _id: inv2.insertedId });

    expect(checkInv1["Bank TF"]).toBe(500); // Still 500 (historical contribution preserved)
    expect(checkInv2["Bank TF"]).toBe(1600); // 1000 + 600
  });

  test('Case 6: Same Monoj transaction is saved again (bulk-save / refresh) -> must NOT double add', async () => {
    const cementCol = getCementCol();
    const inv = await cementCol.insertOne({
      "VEHICLE NUMBER": "WB 41 G 1024",
      "LOADING DATE": "2026-09-01",
      "Bank TF": 1000
    });

    const createRes = await request(app).post('/api/others-creditors').send({
      creditorName: 'MONOJ BANDHAN',
      names: 'ABHIJIT GHOSH',
      vehicleNo: 'WB 41 G 1024',
      debit: 500,
      date: '2026-09-26'
    });

    let checkInv = await cementCol.findOne({ _id: inv.insertedId });
    expect(checkInv["Bank TF"]).toBe(1500);

    // Call bulk-save with the exact saved row
    const bulkRes = await request(app).post('/api/others-creditors/bulk-save').send({
      rows: [createRes.body.entry]
    });
    expect(bulkRes.status).toBe(200);

    checkInv = await cementCol.findOne({ _id: inv.insertedId });
    expect(checkInv["Bank TF"]).toBe(1500); // Still 1500, NOT 2000
    expect(checkInv._monojDebitContributions).toHaveLength(1);
  });

  test('Case 7: Same amount on same date in two different transactions -> applied separately', async () => {
    const cementCol = getCementCol();
    const inv = await cementCol.insertOne({
      "VEHICLE NUMBER": "WB 41 G 1024",
      "LOADING DATE": "2026-09-01",
      "Bank TF": 0
    });

    await request(app).post('/api/others-creditors').send({
      creditorName: 'MONOJ BANDHAN',
      names: 'ABHIJIT GHOSH',
      vehicleNo: 'WB 41 G 1024',
      debit: 500,
      date: '2026-09-26'
    });

    await request(app).post('/api/others-creditors').send({
      creditorName: 'MONOJ BANDHAN',
      names: 'ABHIJIT GHOSH',
      vehicleNo: 'WB 41 G 1024',
      debit: 500,
      date: '2026-09-26'
    });

    const checkInv = await cementCol.findOne({ _id: inv.insertedId });
    expect(checkInv["Bank TF"]).toBe(1000);
    expect(checkInv._monojDebitContributions).toHaveLength(2);
  });

  test('Case 8: Edit ₹500 -> ₹800 -> Final contribution is ₹800, not ₹1,300', async () => {
    const cementCol = getCementCol();
    const inv = await cementCol.insertOne({
      "VEHICLE NUMBER": "WB 41 G 1024",
      "LOADING DATE": "2026-09-01",
      "Bank TF": 1000
    });

    const createRes = await request(app).post('/api/others-creditors').send({
      creditorName: 'MONOJ BANDHAN',
      names: 'ABHIJIT GHOSH',
      vehicleNo: 'WB 41 G 1024',
      debit: 500,
      date: '2026-09-26'
    });

    let checkInv = await cementCol.findOne({ _id: inv.insertedId });
    expect(checkInv["Bank TF"]).toBe(1500);

    // Edit to 800
    const editRes = await request(app)
      .put(`/api/others-creditors/${createRes.body.entry._id}`)
      .send({
        ...createRes.body.entry,
        debit: 800
      });
    expect(editRes.status).toBe(200);

    checkInv = await cementCol.findOne({ _id: inv.insertedId });
    expect(checkInv["Bank TF"]).toBe(1800); // 1000 + 800
    expect(checkInv._monojDebitContributions).toHaveLength(1);
    expect(checkInv._monojDebitContributions[0].amount).toBe(800);
  });

  test('Case 9: Change vehicle during edit -> Reverse old vehicle contribution, apply to new vehicle', async () => {
    const cementCol = getCementCol();
    const veh1Inv = await cementCol.insertOne({
      "VEHICLE NUMBER": "WB 41 G 1024",
      "LOADING DATE": "2026-09-01",
      "Bank TF": 1000
    });
    const veh2Inv = await cementCol.insertOne({
      "VEHICLE NUMBER": "WB 39 G 7433",
      "LOADING DATE": "2026-09-01",
      "Bank TF": 2000
    });

    const createRes = await request(app).post('/api/others-creditors').send({
      creditorName: 'MONOJ BANDHAN',
      names: 'ABHIJIT GHOSH',
      vehicleNo: 'WB 41 G 1024',
      debit: 500,
      date: '2026-09-26'
    });

    let checkVeh1 = await cementCol.findOne({ _id: veh1Inv.insertedId });
    expect(checkVeh1["Bank TF"]).toBe(1500);

    // Edit vehicle to WB 39 G 7433
    await request(app)
      .put(`/api/others-creditors/${createRes.body.entry._id}`)
      .send({
        ...createRes.body.entry,
        vehicleNo: 'WB 39 G 7433',
        debit: 500
      });

    checkVeh1 = await cementCol.findOne({ _id: veh1Inv.insertedId });
    const checkVeh2 = await cementCol.findOne({ _id: veh2Inv.insertedId });

    expect(checkVeh1["Bank TF"]).toBe(1000); // Reverted back to 1000
    expect(checkVeh1._monojDebitContributions).toHaveLength(0);
    expect(checkVeh2["Bank TF"]).toBe(2500); // 2000 + 500
    expect(checkVeh2._monojDebitContributions).toHaveLength(1);
  });

  test('Case 10: Delete transaction -> Reverse only that transaction contribution', async () => {
    const cementCol = getCementCol();
    const inv = await cementCol.insertOne({
      "VEHICLE NUMBER": "WB 41 G 1024",
      "LOADING DATE": "2026-09-01",
      "Bank TF": 2000
    });

    const tx1 = await request(app).post('/api/others-creditors').send({
      creditorName: 'MONOJ BANDHAN',
      names: 'ABHIJIT GHOSH',
      vehicleNo: 'WB 41 G 1024',
      debit: 500,
      date: '2026-09-26'
    });

    const tx2 = await request(app).post('/api/others-creditors').send({
      creditorName: 'MONOJ BANDHAN',
      names: 'ABHIJIT GHOSH',
      vehicleNo: 'WB 41 G 1024',
      debit: 1000,
      date: '2026-09-26'
    });

    let checkInv = await cementCol.findOne({ _id: inv.insertedId });
    expect(checkInv["Bank TF"]).toBe(3500); // 2000 + 500 + 1000

    // Delete tx1 (₹500)
    await request(app).delete(`/api/others-creditors/${tx1.body.entry._id}`);

    checkInv = await cementCol.findOne({ _id: inv.insertedId });
    expect(checkInv["Bank TF"]).toBe(3000); // 3500 - 500
    expect(checkInv._monojDebitContributions).toHaveLength(1);
    expect(checkInv._monojDebitContributions[0].amount).toBe(1000);
  });

  test('Case 11: No Cement Register invoice -> Do not create fake record, return notFound message', async () => {
    const cementCol = getCementCol();

    const res = await request(app).post('/api/others-creditors').send({
      creditorName: 'MONOJ BANDHAN',
      names: 'ABHIJIT GHOSH',
      vehicleNo: 'WB 99 ZZ 9999',
      debit: 500,
      date: '2026-09-26'
    });

    expect(res.status).toBe(201);
    expect(res.body.cementSyncResult.success).toBe(false);
    expect(res.body.cementSyncResult.notFound).toBe(true);
    expect(res.body.cementSyncResult.message).toContain('no Cement Register invoice was found');

    const totalCementDocs = await cementCol.countDocuments({});
    expect(totalCementDocs).toBe(0); // No fake records created
  });

  test('Case 12: Blank vehicle or 0 debit -> Skipped without modifying Cement Register', async () => {
    const cementCol = getCementCol();
    await cementCol.insertOne({
      "VEHICLE NUMBER": "WB 41 G 1024",
      "LOADING DATE": "2026-09-01",
      "Bank TF": 1000
    });

    // Monoj credit row (debit = 0)
    const res = await request(app).post('/api/others-creditors').send({
      creditorName: 'MONOJ BANDHAN',
      credit: 5000,
      debit: 0,
      date: '2026-09-26'
    });

    expect(res.status).toBe(201);
    const count = await cementCol.countDocuments({ "Bank TF": { $ne: 1000 } });
    expect(count).toBe(0);
  });
});
