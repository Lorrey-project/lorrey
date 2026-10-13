const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const FinancialYearRow = require('../models/FinancialYearRow');
const FinancialYearPayment = require('../models/FinancialYearPayment');
const dailySummaryRoutes = require('../routes/dailySummaryRoutes');

let mongoServer;
let app;

function getCementCol() {
  return mongoose.connection.useDb("cement_register").collection("entries");
}

// Mock authentication middleware
jest.mock('../middleware/authMiddleware', () => (req, res, next) => next());

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);

  app = express();
  app.use(express.json());
  app.use('/daily-summary', dailySummaryRoutes);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await FinancialYearRow.deleteMany({});
  await FinancialYearPayment.deleteMany({});
  await getCementCol().deleteMany({});
});

describe('SUMMARY REVENUE NVL AND NVCL — UNPAID BILL REGISTER AMOUNTS', () => {

  test('TEST 1: Exact specification example with Unpaid, Fully Paid, and Partially Paid bills', async () => {
    // NVL Bill 1: ₹10,000, Unpaid (Paid ₹0) -> Outstanding ₹10,000
    // NVL Bill 2: ₹8,000, Fully Paid (Paid ₹8,000) -> Outstanding ₹0
    // NVCL Bill 1: ₹12,000, Partially Paid (Paid ₹5,000) -> Outstanding ₹7,000
    // NVCL Bill 2: ₹6,000, Fully Paid (Paid ₹6,000) -> Outstanding ₹0
    const cementEntries = [
      {
        'BILL NO': 'DAC-101',
        'BILL DATE': '10-04-2026',
        'SITE': 'NVL',
        'BILLING AMOUNT': 10000,
        'CHALLAN STATUS': 'BILLED',
        month: 4
      },
      {
        'BILL NO': 'DAC-102',
        'BILL DATE': '12-04-2026',
        'SITE': 'NVL',
        'BILLING AMOUNT': 8000,
        'CHALLAN STATUS': 'BILLED',
        month: 4
      },
      {
        'BILL NO': 'NVCL-201',
        'BILL DATE': '15-04-2026',
        'SITE': 'NVCL',
        'BILLING AMOUNT': 12000,
        'CHALLAN STATUS': 'BILLED',
        month: 4
      },
      {
        'BILL NO': 'NVCL-202',
        'BILL DATE': '18-04-2026',
        'SITE': 'NVCL',
        'BILLING AMOUNT': 6000,
        'CHALLAN STATUS': 'BILLED',
        month: 4
      }
    ];
    await getCementCol().insertMany(cementEntries);

    // Payments
    await FinancialYearPayment.insertMany([
      {
        id: 'PAY_1',
        billNos: ['DAC-102'],
        paymentAmount: 8000,
        paymentDate: '2026-04-20'
      },
      {
        id: 'PAY_2',
        billNos: ['NVCL-201'],
        paymentAmount: 5000,
        paymentDate: '2026-04-22'
      },
      {
        id: 'PAY_3',
        billNos: ['NVCL-202'],
        paymentAmount: 6000,
        paymentDate: '2026-04-25'
      }
    ]);

    const res = await request(app)
      .get('/daily-summary/revenue-nvl-nvcl')
      .query({ fy: 'FY 2026-27', month: 'ALL', date: 'ALL' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const { summary } = res.body;
    expect(summary.NVL.billedRevenue).toBe(10000);
    expect(summary.NVCL.billedRevenue).toBe(7000);
    expect(summary.TOTAL.billedRevenue).toBe(17000);
  });

  test('TEST 2: Multiple partial payments against a single bill subtracts all linked payments', async () => {
    // NVL Bill: ₹20,000, Payment 1: ₹5,000, Payment 2: ₹7,000 -> Outstanding ₹8,000
    await getCementCol().insertOne({
      'BILL NO': 'DAC-301',
      'BILL DATE': '05-05-2026',
      'SITE': 'NVL',
      'BILLING AMOUNT': 20000,
      'CHALLAN STATUS': 'BILLED',
      month: 5
    });

    await FinancialYearPayment.insertMany([
      {
        id: 'PAY_MULTI_1',
        billNos: ['DAC-301'],
        paymentAmount: 5000,
        paymentDate: '2026-05-10'
      },
      {
        id: 'PAY_MULTI_2',
        billNos: ['DAC-301'],
        paymentAmount: 7000,
        paymentDate: '2026-05-15'
      }
    ]);

    const res = await request(app)
      .get('/daily-summary/revenue-nvl-nvcl')
      .query({ fy: 'FY 2026-27', month: 'May', date: 'ALL' });

    expect(res.status).toBe(200);
    expect(res.body.summary.NVL.billedRevenue).toBe(8000);
    expect(res.body.summary.NVCL.billedRevenue).toBe(0);
    expect(res.body.summary.TOTAL.billedRevenue).toBe(8000);
  });

  test('TEST 3: Payment allocated across multiple bills calculates each bill proportionally', async () => {
    // NVCL Bill A: ₹10,000
    // NVCL Bill B: ₹10,000
    // Payment Group covering [NVCL-401, NVCL-402] with total ₹10,000
    // Each bill receives ₹5,000 allocation -> Outstanding ₹5,000 each -> NVCL total ₹10,000
    await getCementCol().insertMany([
      {
        'BILL NO': 'NVCL-401',
        'BILL DATE': '10-06-2026',
        'SITE': 'NVCL',
        'BILLING AMOUNT': 10000,
        'CHALLAN STATUS': 'BILLED',
        month: 6
      },
      {
        'BILL NO': 'NVCL-402',
        'BILL DATE': '11-06-2026',
        'SITE': 'NVCL',
        'BILLING AMOUNT': 10000,
        'CHALLAN STATUS': 'BILLED',
        month: 6
      }
    ]);

    await FinancialYearPayment.insertOne({
      id: 'PAY_GROUP_1',
      billNos: ['NVCL-401', 'NVCL-402'],
      paymentAmount: 10000,
      paymentDate: '2026-06-20'
    });

    const res = await request(app)
      .get('/daily-summary/revenue-nvl-nvcl')
      .query({ fy: 'FY 2026-27', month: 'June', date: 'ALL' });

    expect(res.status).toBe(200);
    expect(res.body.summary.NVCL.billedRevenue).toBe(10000);
    expect(res.body.summary.TOTAL.billedRevenue).toBe(10000);
  });

  test('TEST 4: Overpayment or fully settled with deductions/TDS', async () => {
    // NVL Bill: ₹10,000, Payment: ₹9,800 + Debit: ₹200 (Total ₹10,000) -> Outstanding ₹0
    await getCementCol().insertOne({
      'BILL NO': 'DAC-501',
      'BILL DATE': '15-07-2026',
      'SITE': 'NVL',
      'BILLING AMOUNT': 10000,
      'CHALLAN STATUS': 'BILLED',
      month: 7
    });

    await FinancialYearPayment.insertOne({
      id: 'PAY_DED_1',
      billNos: ['DAC-501'],
      paymentAmount: 9800,
      debitAmount: 200,
      paymentDate: '2026-07-25'
    });

    const res = await request(app)
      .get('/daily-summary/revenue-nvl-nvcl')
      .query({ fy: 'FY 2026-27', month: 'July', date: 'ALL' });

    expect(res.status).toBe(200);
    expect(res.body.summary.NVL.billedRevenue).toBe(0);
    expect(res.body.summary.TOTAL.billedRevenue).toBe(0);
  });

  test('TEST 5: Date filter and Month filter accuracy', async () => {
    // NVL Bill in April (Unpaid ₹15,000)
    // NVL Bill in May (Unpaid ₹25,000)
    await getCementCol().insertMany([
      {
        'BILL NO': 'DAC-601',
        'BILL DATE': '10-04-2026',
        'SITE': 'NVL',
        'BILLING AMOUNT': 15000,
        'CHALLAN STATUS': 'BILLED',
        month: 4
      },
      {
        'BILL NO': 'DAC-602',
        'BILL DATE': '10-05-2026',
        'SITE': 'NVL',
        'BILLING AMOUNT': 25000,
        'CHALLAN STATUS': 'BILLED',
        month: 5
      }
    ]);

    // Query April only
    const resApril = await request(app)
      .get('/daily-summary/revenue-nvl-nvcl')
      .query({ fy: 'FY 2026-27', month: 'April', date: 'ALL' });
    expect(resApril.body.summary.NVL.billedRevenue).toBe(15000);

    // Query May only
    const resMay = await request(app)
      .get('/daily-summary/revenue-nvl-nvcl')
      .query({ fy: 'FY 2026-27', month: 'May', date: 'ALL' });
    expect(resMay.body.summary.NVL.billedRevenue).toBe(25000);

    // Query specific date: 10-04-2026
    const resDate = await request(app)
      .get('/daily-summary/revenue-nvl-nvcl')
      .query({ fy: 'FY 2026-27', month: 'April', date: '10-04-2026' });
    expect(resDate.body.summary.NVL.billedRevenue).toBe(15000);

    // Query another date: 11-04-2026
    const resDateOther = await request(app)
      .get('/daily-summary/revenue-nvl-nvcl')
      .query({ fy: 'FY 2026-27', month: 'April', date: '11-04-2026' });
    expect(resDateOther.body.summary.NVL.billedRevenue).toBe(0);
  });

  test('TEST 6: Payment edit and deletion dynamically updates Summary Billed Revenue', async () => {
    // NVL Bill: ₹50,000
    await getCementCol().insertOne({
      'BILL NO': 'DAC-701',
      'BILL DATE': '10-08-2026',
      'SITE': 'NVL',
      'BILLING AMOUNT': 50000,
      'CHALLAN STATUS': 'BILLED',
      month: 8
    });

    // 1. Initial State: Unpaid -> ₹50,000
    let res = await request(app)
      .get('/daily-summary/revenue-nvl-nvcl')
      .query({ fy: 'FY 2026-27', month: 'August', date: 'ALL' });
    expect(res.body.summary.NVL.billedRevenue).toBe(50000);

    // 2. Add partial payment of ₹20,000 -> Remaining ₹30,000
    await FinancialYearPayment.insertOne({
      id: 'PAY_DYN_1',
      billNos: ['DAC-701'],
      paymentAmount: 20000,
      paymentDate: '2026-08-15'
    });

    res = await request(app)
      .get('/daily-summary/revenue-nvl-nvcl')
      .query({ fy: 'FY 2026-27', month: 'August', date: 'ALL' });
    expect(res.body.summary.NVL.billedRevenue).toBe(30000);

    // 3. Edit payment to full ₹50,000 -> Remaining ₹0
    await FinancialYearPayment.updateOne(
      { id: 'PAY_DYN_1' },
      { $set: { paymentAmount: 50000 } }
    );

    res = await request(app)
      .get('/daily-summary/revenue-nvl-nvcl')
      .query({ fy: 'FY 2026-27', month: 'August', date: 'ALL' });
    expect(res.body.summary.NVL.billedRevenue).toBe(0);

    // 4. Delete payment record -> Remaining ₹50,000
    await FinancialYearPayment.deleteOne({ id: 'PAY_DYN_1' });

    res = await request(app)
      .get('/daily-summary/revenue-nvl-nvcl')
      .query({ fy: 'FY 2026-27', month: 'August', date: 'ALL' });
    expect(res.body.summary.NVL.billedRevenue).toBe(50000);
  });

  test('TEST 7: Overridden bill in FinancialYearRow integrates correctly with payment allocation', async () => {
    // Manual/Overridden row in FinancialYearRow for NVCL: ₹30,000
    await FinancialYearRow.create({
      billNo: 'NVCL-801',
      editedSite: 'NVCL',
      editedAmount: 30000,
      editedInvoiceDate: '15-09-2026',
      editedMonth: 'September',
      billType: 'FREIGHT'
    });

    // Partial payment of ₹10,000
    await FinancialYearPayment.create({
      id: 'PAY_OV_1',
      billNos: ['NVCL-801'],
      paymentAmount: 10000,
      paymentDate: '2026-09-20'
    });

    const res = await request(app)
      .get('/daily-summary/revenue-nvl-nvcl')
      .query({ fy: 'FY 2026-27', month: 'September', date: 'ALL' });

    expect(res.status).toBe(200);
    expect(res.body.summary.NVCL.billedRevenue).toBe(20000);
    expect(res.body.summary.TOTAL.billedRevenue).toBe(20000);
  });

  test('TEST 8: Total column equals Billed Revenue + Unbilled Revenue categories', async () => {
    // 1 Billed unpaid NVL bill: ₹10,000
    await getCementCol().insertOne({
      'BILL NO': 'DAC-901',
      'BILL DATE': '05-10-2026',
      'SITE': 'NVL',
      'BILLING AMOUNT': 10000,
      'CHALLAN STATUS': 'BILLED',
      month: 10
    });

    // 1 Unbilled Stamp bill: ₹5,000 (No freight/unloading bill generated)
    await getCementCol().insertOne({
      'BILL NO': '',
      'LOADING DT': '06-10-2026',
      'SITE': 'NVL',
      'BILLING AMOUNT': 5000,
      'CHALLAN STATUS': 'STAMP',
      month: 10
    });

    // 1 Unbilled Non-Stamp bill: ₹3,000
    await getCementCol().insertOne({
      'BILL NO': '',
      'LOADING DT': '07-10-2026',
      'SITE': 'NVL',
      'BILLING AMOUNT': 3000,
      'CHALLAN STATUS': 'NON-STAMP',
      month: 10
    });

    // 1 Challan Not Received: ₹2,000
    await getCementCol().insertOne({
      'BILL NO': '',
      'LOADING DT': '08-10-2026',
      'SITE': 'NVL',
      'BILLING AMOUNT': 2000,
      'CHALLAN STATUS': 'PENDING',
      month: 10
    });

    const res = await request(app)
      .get('/daily-summary/revenue-nvl-nvcl')
      .query({ fy: 'FY 2026-27', month: 'October', date: 'ALL' });

    const nvl = res.body.summary.NVL;
    expect(nvl.billedRevenue).toBe(10000);
    expect(nvl.stampNotBilled).toBe(5000);
    expect(nvl.nonStampNotBilled).toBe(3000);
    expect(nvl.challanNotReceived).toBe(2000);
    expect(nvl.total).toBe(20000);
    expect(res.body.summary.TOTAL.total).toBe(20000);
  });
});
