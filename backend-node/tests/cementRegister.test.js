const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const cementRoutes = require('../routes/cementRegisterRoutes');
const authMiddleware = require('../middleware/authMiddleware');
const adminOnly = require('../middleware/adminOnly');

jest.mock('../socket', () => ({
  getIO: () => ({ emit: jest.fn() })
}));

jest.mock('../middleware/authMiddleware', () => (req, res, next) => {
  req.user = { id: 'mockUserId', role: 'admin' };
  next();
});
jest.mock('../middleware/adminOnly', () => (req, res, next) => {
  next();
});

const app = express();
app.use(express.json());
app.use('/cement-register', cementRoutes);

let mongoServer;

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
  await mongoose.connection.useDb("cement_register").collection("entries").deleteMany({});
});

describe('Cement Register Routes', () => {
  it('should fetch entries', async () => {
    const res = await request(app).get('/cement-register');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.entries)).toBe(true);
  });

  it('should create an entry', async () => {
    const res = await request(app)
      .post('/cement-register')
      .send({ 'SL NO': 1, SITE: 'Test Site' });
    
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.entry.SITE).toBe('Test Site');
  });

  it('should perform bulk create', async () => {
    const res = await request(app)
      .post('/cement-register/bulk')
      .send({ entries: [{ 'SL NO': 1 }, { 'SL NO': 2 }] });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.insertedCount).toBe(2);
  });

  it('should save, fetch, and delete incentive state', async () => {
    const postRes = await request(app)
      .post('/cement-register/incentive-state')
      .send({
        year: 2026,
        month: 5,
        actuals: { 'WB1234': 5000 },
        excelName: 'test.xlsx',
        excelData: [['col1', 'col2']]
      });
    
    expect(postRes.status).toBe(200);
    expect(postRes.body.success).toBe(true);

    const getRes = await request(app)
      .get('/cement-register/incentive-state?year=2026&month=5');
    
    expect(getRes.status).toBe(200);
    expect(getRes.body.success).toBe(true);
    expect(getRes.body.state.excelName).toBe('test.xlsx');
    expect(getRes.body.state.actuals).toEqual({ 'WB1234': 5000 });

    const delRes = await request(app)
      .delete('/cement-register/incentive-state?year=2026&month=5');
    
    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    const getRes2 = await request(app)
      .get('/cement-register/incentive-state?year=2026&month=5');
    
    expect(getRes2.status).toBe(200);
    expect(getRes2.body.success).toBe(true);
    expect(getRes2.body.state).toBeNull();
  });

  describe('CEMENT REGISTER - TDS Business Logic', () => {
    beforeEach(async () => {
      await mongoose.connection.useDb("invoice_system").collection("owner details").deleteMany({});
      await mongoose.connection.useDb("cement_register").collection("entries").deleteMany({});
    });

    it('Case 1: TDS = 0 gives TDS = 0', async () => {
      const ownerCol = mongoose.connection.useDb("invoice_system").collection("owner details");
      await ownerCol.insertOne({
        'Truck No': 'WB35 18 13',
        'Owner Name': 'TEST OWNER 1',
        'TDS Applicability': 0
      });

      const cementCol = mongoose.connection.useDb("cement_register").collection("entries");
      await cementCol.insertOne({
        'VEHICLE NUMBER': 'WB35 18 13',
        'BILLING ER 95%': 20045,
        'LOADING DT': '01.05.2026',
        month: 5,
        year: 2026
      });

      const res = await request(app).get('/cement-register');
      expect(res.status).toBe(200);
      expect(res.body.entries.length).toBe(1);
      expect(res.body.entries[0].TDS).toBe(0);
      expect(res.body.entries[0].tds_manual).toBe(false);
    });

    it('Case 2: TDS = 0.01 gives TDS = 68.95 on 6,895 base', async () => {
      const ownerCol = mongoose.connection.useDb("invoice_system").collection("owner details");
      await ownerCol.insertOne({
        'Truck No': 'WB33 C 6016',
        'Owner Name': 'TEST OWNER 2',
        'TDS Applicability': 0.01
      });

      const cementCol = mongoose.connection.useDb("cement_register").collection("entries");
      await cementCol.insertOne({
        'VEHICLE NUMBER': 'WB33 C 6016',
        'BILLING ER 95%': 6895,
        'LOADING DT': '02.05.2026',
        month: 5,
        year: 2026
      });

      const res = await request(app).get('/cement-register');
      expect(res.status).toBe(200);
      expect(res.body.entries.length).toBe(1);
      expect(res.body.entries[0].TDS).toBe(68.95);
      expect(res.body.entries[0].tds_manual).toBe(false);
    });

    it('Case 3: TDS = 0.02 gives TDS = 200 on 10,000 base', async () => {
      const ownerCol = mongoose.connection.useDb("invoice_system").collection("owner details");
      await ownerCol.insertOne({
        'Truck No': 'WB11 A 1111',
        'Owner Name': 'TEST OWNER 3',
        'TDS Applicability': 0.02
      });

      const cementCol = mongoose.connection.useDb("cement_register").collection("entries");
      await cementCol.insertOne({
        'VEHICLE NUMBER': 'WB11 A 1111',
        'BILLING ER 95%': 10000,
        'LOADING DT': '03.05.2026',
        month: 5,
        year: 2026
      });

      const res = await request(app).get('/cement-register');
      expect(res.status).toBe(200);
      expect(res.body.entries[0].TDS).toBe(200);
    });

    it('Case 4 & 5: User edits TDS to 50 or 0 (manual override persists)', async () => {
      const ownerCol = mongoose.connection.useDb("invoice_system").collection("owner details");
      await ownerCol.insertOne({
        'Truck No': 'WB33 C 6016',
        'Owner Name': 'TEST OWNER 2',
        'TDS Applicability': 0.01
      });

      const cementCol = mongoose.connection.useDb("cement_register").collection("entries");
      const insertResult = await cementCol.insertOne({
        'VEHICLE NUMBER': 'WB33 C 6016',
        'BILLING ER 95%': 6895,
        'LOADING DT': '02.05.2026',
        month: 5,
        year: 2026
      });

      const entryId = insertResult.insertedId.toString();

      // User manual edit to 50
      const updateRes = await request(app)
        .put('/cement-register/bulk-update')
        .send({
          updates: [{ id: entryId, changes: { TDS: 50 } }]
        });
      expect(updateRes.status).toBe(200);

      // Verify fetch retains manual 50
      const getRes1 = await request(app).get('/cement-register');
      expect(getRes1.body.entries[0].TDS).toBe(50);
      expect(getRes1.body.entries[0].tds_manual).toBe(true);

      // User manual edit to 0
      const updateRes2 = await request(app)
        .put('/cement-register/bulk-update')
        .send({
          updates: [{ id: entryId, changes: { TDS: 0 } }]
        });
      expect(updateRes2.status).toBe(200);

      // Verify fetch retains manual 0
      const getRes2 = await request(app).get('/cement-register');
      expect(getRes2.body.entries[0].TDS).toBe(0);
      expect(getRes2.body.entries[0].tds_manual).toBe(true);
    });

    it('Case 6: Owner Details changes only recalculates non-overridden rows', async () => {
      const ownerCol = mongoose.connection.useDb("invoice_system").collection("owner details");
      await ownerCol.insertOne({
        'Truck No': 'WB55 A 5555',
        'Owner Name': 'TEST OWNER 5',
        'TDS Applicability': 0.01
      });

      const cementCol = mongoose.connection.useDb("cement_register").collection("entries");
      // Row 1: Auto (non-overridden)
      await cementCol.insertOne({
        'VEHICLE NUMBER': 'WB55 A 5555',
        'BILLING ER 95%': 10000,
        'LOADING DT': '01.05.2026',
        tds_manual: false,
        month: 5,
        year: 2026
      });

      // Row 2: Manual override to 75
      await cementCol.insertOne({
        'VEHICLE NUMBER': 'WB55 A 5555',
        'BILLING ER 95%': 10000,
        'LOADING DT': '02.05.2026',
        TDS: 75,
        tds_manual: true,
        month: 5,
        year: 2026
      });

      // Initial check
      let res = await request(app).get('/cement-register');
      expect(res.body.entries.find(e => !e.tds_manual).TDS).toBe(100);
      expect(res.body.entries.find(e => e.tds_manual).TDS).toBe(75);

      // Owner details changes rate from 0.01 to 0
      await ownerCol.updateOne(
        { 'Truck No': 'WB55 A 5555' },
        { $set: { 'TDS Applicability': 0 } }
      );

      // Fetch again
      res = await request(app).get('/cement-register');
      expect(res.body.entries.find(e => !e.tds_manual).TDS).toBe(0);
      expect(res.body.entries.find(e => e.tds_manual).TDS).toBe(75);
    });
  });
});
