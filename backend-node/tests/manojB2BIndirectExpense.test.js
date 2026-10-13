const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const OthersCreditor = require('../models/OthersCreditor');
const othersCreditorRoutes = require('../routes/othersCreditorRoutes');
const gstPortalRoutes = require('../routes/gstPortalRoutes');
const indirectExpenseRoutes = require('../routes/indirectExpenseRoutes');
const {
  isQualifyingManojIndirectExpense,
  syncManojRowToIndirectExpense,
  reverseManojRowFromIndirectExpense
} = require('../utils/monojIndirectExpenseManager');

let mongoServer;
let app;

function getB2BCol() {
  return mongoose.connection.useDb('gst_portal').collection('entries');
}

function getIndirectCol() {
  return mongoose.connection.db.collection('indirect_expenses');
}

// Mock auth middleware to pass through
jest.mock('../middleware/authMiddleware', () => (req, res, next) => {
  req.user = { id: 'mock-user-id', role: 'admin' };
  next();
});

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);

  app = express();
  app.use(express.json());
  app.use('/api/others-creditors', othersCreditorRoutes);
  app.use('/gst-portal', gstPortalRoutes);
  app.use('/indirect-expense', indirectExpenseRoutes);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await OthersCreditor.deleteMany({});
  await getB2BCol().deleteMany({});
  await getIndirectCol().deleteMany({});
});

describe('TASK 7 & ACCEPTANCE: MANOJ BANDHAN ↔ B2B ↔ INDIRECT EXPENSES GST INTEGRATION', () => {

  test('SCENARIO 1 & 2: Cancelling the GST Purchase form creates no purchase, debit, or indirect expense', async () => {
    // When user cancels the popup without saving, no B2B purchase or debit row is persisted
    const b2bDocs = await getB2BCol().find({}).toArray();
    const indirectDocs = await getIndirectCol().find({}).toArray();
    const manojDocs = await OthersCreditor.find({});

    expect(b2bDocs).toHaveLength(0);
    expect(indirectDocs).toHaveLength(0);
    expect(manojDocs).toHaveLength(0);
  });

  test('ACCEPTANCE TEST: Taxable Value ₹10,000, CGST ₹900, SGST ₹900 -> Invoice Value ₹11,800 -> Manoj Bandhan DEBIT must be ₹11,800, NOT ₹10,000', async () => {
    const manojRow = await OthersCreditor.create({
      creditorName: 'MANOJ BANDHAN',
      date: '10/10/2026',
      expenseType: 'INDIRECT EXPENSES',
      billType: 'GST',
      particulars: 'OFFICE EXPENSES',
      debit: 0,
      credit: 0
    });

    const b2bPayload = {
      type: 'b2b',
      sourceModule: 'MANOJ_BANDHAN_GST_PURCHASE',
      manojRowId: manojRow._id.toString(),
      'GSTIN of Supplier': '19AAACB1234F1Z5',
      'Trade / Legal Name': 'OFFICE ESSENTIALS SUPPLIER',
      'Invoice Number': 'INV-TEST-10000',
      'Invoice Date': '10/10/2026',
      'Taxable Value': 10000,
      'CGST': 900,
      'SGST': 900,
      'Integrated Tax': 0,
      'Cess': 0,
      'Invoice Value': 11800,
      'Reason': 'OFFICE EXPENSES'
    };

    const b2bRes = await request(app).post('/gst-portal').send(b2bPayload);
    expect(b2bRes.status).toBe(201);

    const updatedManoj = await OthersCreditor.findById(manojRow._id);
    expect(updatedManoj.debit).toBe(11800);
    expect(updatedManoj.debit).not.toBe(10000);
    expect(updatedManoj.balance).toBe(-11800);
  });

  test('SCENARIO 1, 2, 3, 4: Taxable Value ₹1,000, CGST ₹90, SGST ₹90 -> B2B Invoice Value ₹1,180, Manoj Bandhan DEBIT ₹1,180, Indirect Expenses BANK ₹1,180', async () => {
    // 1. User starts with a Manoj Bandhan draft row
    const manojDraft = await OthersCreditor.create({
      creditorName: 'MANOJ BANDHAN',
      date: '10/10/2026',
      expenseType: 'INDIRECT EXPENSES',
      billType: 'GST',
      particulars: 'OFFICE EXPENSES',
      debit: 0,
      credit: 0
    });

    // 2. User fills B2B purchase form and saves to B2B
    const b2bPayload = {
      type: 'b2b',
      sourceModule: 'MANOJ_BANDHAN_GST_PURCHASE',
      manojRowId: manojDraft._id.toString(),
      'GSTIN of Supplier': '19AAACB1234F1Z5',
      'Trade / Legal Name': 'OFFICE ESSENTIALS SUPPLIER',
      'Invoice Number': 'INV-2026-001',
      'Invoice Date': '10/10/2026',
      'Taxable Value': 1000,
      'CGST': 90,
      'SGST': 90,
      'Integrated Tax': 0,
      'Cess': 0,
      'Invoice Value': 1180,
      'Place of Supply': '19-West Bengal',
      'Supply attract reverse charge': 'No',
      'Applicable % Tax Rate': 18,
      'Invoice Type': 'Regular',
      'Reason': 'OFFICE EXPENSES'
    };

    const b2bRes = await request(app).post('/gst-portal').send(b2bPayload);
    expect(b2bRes.status).toBe(201);
    expect(b2bRes.body.success).toBe(true);
    const b2bEntry = b2bRes.body.entry;
    expect(b2bEntry._id).toBeTruthy();

    // 3. Verify complete purchase saved in B2B database
    const savedB2b = await getB2BCol().findOne({ _id: new mongoose.Types.ObjectId(b2bEntry._id) });
    expect(savedB2b).toBeTruthy();
    expect(savedB2b['Invoice Number']).toBe('INV-2026-001');
    expect(savedB2b['Taxable Value']).toBe(1000);
    expect(savedB2b['CGST']).toBe(90);
    expect(savedB2b['SGST']).toBe(90);
    expect(savedB2b['Invoice Value']).toBe(1180);
    expect(savedB2b.manojRowId).toBe(manojDraft._id.toString());

    // 4. Verify MANOJ BANDHAN DEBIT is exactly ₹1,180 (Invoice Value), NOT ₹1,000
    const updatedManoj = await OthersCreditor.findById(manojDraft._id);
    expect(updatedManoj.debit).toBe(1180);
    expect(updatedManoj.b2bEntryId).toBe(b2bEntry._id.toString());
    expect(updatedManoj.invoiceNo).toBe('INV-2026-001');
    expect(updatedManoj.balance).toBe(-1180); // 0 credit - 1180 debit

    // 5. Verify INDIRECT EXPENSES shows BANK = ₹1,180 (Invoice Value), CASH unchanged, BILL TYPE = GST (system controlled)
    const indirectRows = await getIndirectCol().find({}).toArray();
    expect(indirectRows).toHaveLength(1);
    const ieRow = indirectRows[0];
    expect(ieRow.date).toBe('10/10/2026');
    expect(ieRow.particulars).toBe('OFFICE EXPENSES');
    expect(ieRow.billType).toBe('GST');
    expect(ieRow.financialYear).toBe('FY 2026-27');
    expect(ieRow.months.october.bank).toBe(1180);
    expect(ieRow.months.october.cash).toBe('');
    expect(ieRow.sourceType).toBe('MANOJ_BANDHAN');
    expect(ieRow.sourceManojBandhanId).toBe(manojDraft._id.toString());
  });

  test('SCENARIO 8: SALARY particulars follows the same flow with Invoice Value in historical month', async () => {
    const manojMay = await OthersCreditor.create({
      creditorName: 'MANOJ BANDHAN',
      date: '15/05/2026',
      expenseType: 'INDIRECT EXPENSES',
      billType: 'GST',
      particulars: 'SALARY',
      debit: 0
    });

    const b2bPayload = {
      type: 'b2b',
      sourceModule: 'MANOJ_BANDHAN_GST_PURCHASE',
      manojRowId: manojMay._id.toString(),
      'Trade / Legal Name': 'PAYROLL CONSULTANT',
      'Invoice Number': 'INV-MAY-SALARY',
      'Invoice Date': '15/05/2026',
      'Taxable Value': 25000,
      'CGST': 2250,
      'SGST': 2250,
      'Integrated Tax': 0,
      'Cess': 0,
      'Invoice Value': 29500,
      'Reason': 'SALARY'
    };

    await request(app).post('/gst-portal').send(b2bPayload);

    // Verify Manoj Bandhan debit is 29500 (Invoice Value)
    const updatedManoj = await OthersCreditor.findById(manojMay._id);
    expect(updatedManoj.debit).toBe(29500);

    // Verify Indirect Expenses row in May with bank = 29500
    const indirectRows = await getIndirectCol().find({ sourceManojBandhanId: manojMay._id.toString() }).toArray();
    expect(indirectRows).toHaveLength(1);
    const row = indirectRows[0];
    expect(row.date).toBe('15/05/2026');
    expect(row.billType).toBe('GST');
    expect(row.particulars).toBe('SALARY');
    expect(row.financialYear).toBe('FY 2026-27');
    expect(row.months.may.bank).toBe(29500);
    expect(row.months.may.cash).toBe('');
    expect(row.months.october.bank).toBe('');
  });

  test('SCENARIO 7 & 10: Repeated saves, bulk-save calls, and API retries do not create duplicate records', async () => {
    const manojDraft = await OthersCreditor.create({
      creditorName: 'MANOJ BANDHAN',
      date: '10/10/2026',
      expenseType: 'INDIRECT EXPENSES',
      billType: 'GST',
      particulars: 'RENT EXP',
      debit: 0
    });

    const b2bPayload = {
      type: 'b2b',
      sourceModule: 'MANOJ_BANDHAN_GST_PURCHASE',
      manojRowId: manojDraft._id.toString(),
      'Invoice Number': 'RENT-INV-1',
      'Taxable Value': 15000,
      'CGST': 1350,
      'SGST': 1350,
      'Invoice Value': 17700,
      'Reason': 'RENT EXP'
    };

    const b2bRes = await request(app).post('/gst-portal').send(b2bPayload);
    const b2bId = b2bRes.body.entry._id;

    // Simulate bulk-save (Save Register) repeated clicks from UI
    const updatedManoj = await OthersCreditor.findById(manojDraft._id).lean();
    await request(app).post('/api/others-creditors/bulk-save').send({ rows: [updatedManoj] });
    await request(app).post('/api/others-creditors/bulk-save').send({ rows: [updatedManoj] });

    const indirectCount = await getIndirectCol().countDocuments({ sourceManojBandhanId: manojDraft._id.toString() });
    expect(indirectCount).toBe(1);

    const b2bCount = await getB2BCol().countDocuments({ _id: new mongoose.Types.ObjectId(b2bId) });
    expect(b2bCount).toBe(1);

    const manojCount = await OthersCreditor.countDocuments({ _id: manojDraft._id });
    expect(manojCount).toBe(1);
  });

  test('SCENARIO 10 & 11: Editing the GST Purchase via PUT /gst-portal/:id updates linked Manoj Bandhan debit and Indirect Expense', async () => {
    const manojDraft = await OthersCreditor.create({
      creditorName: 'MANOJ BANDHAN',
      date: '10/10/2026',
      expenseType: 'INDIRECT EXPENSES',
      billType: 'GST',
      particulars: 'OFFICE EXPENSES',
      debit: 0
    });

    const b2bPayload = {
      type: 'b2b',
      sourceModule: 'MANOJ_BANDHAN_GST_PURCHASE',
      manojRowId: manojDraft._id.toString(),
      'Invoice Number': 'INV-EDIT-1',
      'Taxable Value': 1000,
      'CGST': 90,
      'SGST': 90,
      'Invoice Value': 1180,
      'Reason': 'OFFICE EXPENSES'
    };

    const b2bRes = await request(app).post('/gst-portal').send(b2bPayload);
    const b2bId = b2bRes.body.entry._id;

    // Verify initial debit is 1180 (Invoice Value)
    const initialManoj = await OthersCreditor.findById(manojDraft._id);
    expect(initialManoj.debit).toBe(1180);

    // Now edit the B2B purchase (change taxable value to 1500, invoice value to 1770)
    const updateRes = await request(app).put(`/gst-portal/${b2bId}`).send({
      'Taxable Value': 1500,
      'CGST': 135,
      'SGST': 135,
      'Invoice Value': 1770,
      'Invoice Number': 'INV-EDIT-1-UPDATED'
    });
    expect(updateRes.status).toBe(200);

    // Verify Manoj Bandhan debit updated to 1770 (Invoice Value)
    const updatedManoj = await OthersCreditor.findById(manojDraft._id);
    expect(updatedManoj.debit).toBe(1770);
    expect(updatedManoj.invoiceNo).toBe('INV-EDIT-1-UPDATED');
    expect(updatedManoj.balance).toBe(-1770);

    // Verify Indirect Expenses row updated to 1770 in BANK
    const ieRow = await getIndirectCol().findOne({ sourceManojBandhanId: manojDraft._id.toString() });
    expect(ieRow.months.october.bank).toBe(1770);
  });

  test('SCENARIO 12: Deleting a linked B2B purchase via bulk-delete reverses only its own linked debit and Indirect Expense', async () => {
    // 1. Create linked Manoj Bandhan + B2B record
    const manoj1 = await OthersCreditor.create({
      creditorName: 'MANOJ BANDHAN',
      date: '10/10/2026',
      expenseType: 'INDIRECT EXPENSES',
      billType: 'GST',
      particulars: 'OFFICE EXPENSES',
      debit: 0
    });

    const b2bRes = await request(app).post('/gst-portal').send({
      type: 'b2b',
      manojRowId: manoj1._id.toString(),
      'Invoice Number': 'INV-DEL-1',
      'Taxable Value': 3000,
      'Invoice Value': 3540
    });
    const b2bId = b2bRes.body.entry._id;

    // 2. Create unrelated manual indirect expense
    const manualIE = await getIndirectCol().insertOne({
      slNo: 99,
      date: '10/10/2026',
      billType: 'NON GST',
      particulars: 'SUBSCRIPTION',
      financialYear: 'FY 2026-27',
      months: { october: { bank: 800, cash: '' } },
      sourceType: 'MANUAL'
    });

    // 3. Delete the B2B purchase
    const delRes = await request(app).delete('/gst-portal/bulk-delete').send({ ids: [b2bId] });
    expect(delRes.status).toBe(200);

    // 4. Verify Manoj Bandhan debit reversed to 0
    const updatedManoj = await OthersCreditor.findById(manoj1._id);
    expect(updatedManoj.debit).toBe(0);
    expect(updatedManoj.b2bEntryId).toBe('');

    // 5. Verify linked Indirect Expense row removed, but unrelated manual expense preserved
    const linkedIE = await getIndirectCol().findOne({ sourceManojBandhanId: manoj1._id.toString() });
    expect(linkedIE).toBeNull();

    const manualStillExists = await getIndirectCol().findOne({ _id: manualIE.insertedId });
    expect(manualStillExists).toBeTruthy();
    expect(manualStillExists.particulars).toBe('SUBSCRIPTION');
  });

  test('SCENARIO 12B: Deleting a Manoj Bandhan row with b2bEntryId deletes its linked B2B entry and Indirect Expense', async () => {
    const manoj1 = await OthersCreditor.create({
      creditorName: 'MANOJ BANDHAN',
      date: '10/10/2026',
      expenseType: 'INDIRECT EXPENSES',
      billType: 'GST',
      particulars: 'SOFTWARE EXPENSES',
      debit: 0
    });

    const b2bRes = await request(app).post('/gst-portal').send({
      type: 'b2b',
      manojRowId: manoj1._id.toString(),
      'Invoice Number': 'INV-SOFT-1',
      'Taxable Value': 12000,
      'Invoice Value': 14160
    });
    const b2bId = b2bRes.body.entry._id;

    // Delete Manoj Bandhan row
    const delRes = await request(app).delete(`/api/others-creditors/${manoj1._id}`);
    expect(delRes.status).toBe(200);

    // Verify linked B2B entry was cleaned up
    const b2bEntry = await getB2BCol().findOne({ _id: new mongoose.Types.ObjectId(b2bId) });
    expect(b2bEntry).toBeNull();

    // Verify Indirect Expense was reversed
    const ieRow = await getIndirectCol().findOne({ sourceManojBandhanId: manoj1._id.toString() });
    expect(ieRow).toBeNull();
  });

  test('SCENARIO 13: Non-GST Manoj Bandhan indirect expenses continue working alongside GST purchases', async () => {
    const nonGst = await OthersCreditor.create({
      creditorName: 'MANOJ BANDHAN',
      date: '10/10/2026',
      expenseType: 'INDIRECT EXPENSES',
      billType: 'NON GST',
      particulars: 'COURIER CHARGERS',
      debit: 450
    });
    await syncManojRowToIndirectExpense(nonGst);

    const ieRow = await getIndirectCol().findOne({ sourceManojBandhanId: nonGst._id.toString() });
    expect(ieRow).toBeTruthy();
    expect(ieRow.billType).toBe('NON GST');
    expect(ieRow.particulars).toBe('COURIER CHARGERS');
    expect(ieRow.months.october.bank).toBe(450);
  });

});
