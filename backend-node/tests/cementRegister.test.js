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
});
