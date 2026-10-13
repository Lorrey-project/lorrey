const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const truckContactRoutes = require('../routes/truckContactRoutes');
const cementRoutes = require('../routes/cementRegisterRoutes');
const Invoice = require('../models/Invoice');
const { pushToRegister, getTruckDetails } = require('../utils/syncManager');
const { parseBasicFreightCommission, getEffectivePartyMaster } = require('../utils/partyMasterHelper');

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
app.use('/truck-contacts', truckContactRoutes);
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
  const invDb = mongoose.connection.useDb("invoice_system");
  await invDb.collection("owner details").deleteMany({});
  await invDb.collection("Truck Contact Number").deleteMany({});
  await invDb.collection("Truck Contact Approvals").deleteMany({});
  await invDb.collection("freight_data").deleteMany({});
  await mongoose.connection.useDb("cement_register").collection("entries").deleteMany({});
  await Invoice.deleteMany({});
});

describe('Party Master → Cement Register End-to-End Integration', () => {

  test('Test A: Initial commission (0.05 -> 95%, Basic Amount ₹934 -> ₹887.30)', async () => {
    // 1. Create Party Master record for Vehicle A with commission 0.05
    const ownerCol = mongoose.connection.useDb("invoice_system").collection("owner details");
    const truckCol = mongoose.connection.useDb("invoice_system").collection("Truck Contact Number");
    
    const contactData = {
      'Truck No': 'WB29A8166',
      'Owner Name': 'UDAY MALIK',
      'basic_freight_commission': 0.05,
      'basicFreightCommission': 0.05,
      'BASIC FREIGHT COMMISSION': 0.05,
      'Basic Freight Commission': 0.05,
      'registration_date': '2020-01-01',
      'effective_date': '2020-01-01'
    };
    await ownerCol.insertOne({ ...contactData });
    await truckCol.insertOne({ ...contactData });

    // Verify lookup
    const truck = await getTruckDetails('WB29A8166', 'UDAY MALIK', '2026-10-05');
    expect(truck.basicFreightCommission).toBe(0.05);

    // 2. Create and push invoice with Basic Amount ₹934 (e.g. Rate: 934, MT: 1)
    const invoice = await Invoice.create({
      human_verified_data: {
        invoice_details: { invoice_number: 'INV-TEST-A', invoice_date: '2026-10-05' },
        supply_details: { vehicle_number: 'WB29A8166', transporter_name: 'UDAY MALIK' },
        items: [{ rate: 934, quantity: 1, taxable_value: 934 }],
        amount_summary: { net_payable: 934 }
      }
    });

    await pushToRegister(invoice._id.toString());

    // 3. Fetch Cement Register entries
    const res = await request(app).get('/cement-register');
    expect(res.status).toBe(200);
    expect(res.body.entries.length).toBe(1);

    const entry = res.body.entries[0];
    expect(entry['VEHICLE NUMBER']).toBe('WB29A8166');
    expect(entry['OWNER NAME']).toBe('UDAY MALIK');
    expect(entry['BILLING']).toBe(934);
    expect(entry['PARTY RATE (95-97%)']).toBe(887.30);
    expect(entry['BILLING ER 95%']).toBe(887.30);
    expect(entry['AMOUNT']).toBe(887.30);
    expect(entry['PROFIT']).toBe(46.70);
    expect(entry._freight_commission).toBe(0.05);
  });

  test('Test B: Approved commission change (0.05 to 0.04 -> 96%, Basic Amount ₹934 -> ₹896.64)', async () => {
    // 1. Initial contact with 0.05
    const createRes = await request(app)
      .post('/truck-contacts')
      .send({
        'Truck No ': 'WB29A8166',
        'Owner Name ': 'UDAY MALIK',
        'basicFreightComm': 0.05,
        'registrationDate': '2020-01-01',
        'effectiveDate': '2020-01-01'
      });
    expect(createRes.status).toBe(201);
    const contactId = createRes.body.contact._id;

    // 2. Edit vehicle commission to 0.04 with effective date 2026-10-10
    const editRes = await request(app)
      .put(`/truck-contacts/${contactId}`)
      .send({
        'Truck No ': 'WB29A8166',
        'Owner Name ': 'UDAY MALIK',
        'basicFreightComm': '0.04',
        'effectiveDate': '2026-10-10',
        'changedBy': 'Head Office'
      });
    expect(editRes.status).toBe(200);
    expect(editRes.body.success).toBe(true);

    // 3. Process new invoice uploaded after approval (date 2026-10-10)
    const invoice = await Invoice.create({
      human_verified_data: {
        invoice_details: { invoice_number: 'INV-TEST-B', invoice_date: '2026-10-10' },
        supply_details: { vehicle_number: 'WB29A8166' },
        items: [{ rate: 934, quantity: 1, taxable_value: 934 }]
      }
    });

    await pushToRegister(invoice._id.toString());

    // 4. Verify Cement Register reflects 96% party rate (896.64)
    const res = await request(app).get('/cement-register');
    expect(res.status).toBe(200);
    const entry = res.body.entries.find(e => e['INVOICE NO'] === 'INV-TEST-B');
    expect(entry).toBeDefined();
    expect(entry._freight_commission).toBe(0.04);
    expect(entry['PARTY RATE (95-97%)']).toBe(896.64);
    expect(entry['BILLING ER 95%']).toBe(896.64);
    expect(entry['AMOUNT']).toBe(896.64);
    expect(entry['PROFIT']).toBe(37.36);
  });

  test('Test C: Another commission change (0.04 to 0.06 -> 94%, Basic Amount ₹934 -> ₹877.96)', async () => {
    // 1. Initial contact setup with 0.04
    const createRes = await request(app)
      .post('/truck-contacts')
      .send({
        'Truck No ': 'WB29A8166',
        'Owner Name ': 'UDAY MALIK',
        'basicFreightComm': 0.04,
        'registrationDate': '2020-01-01',
        'effectiveDate': '2020-01-01'
      });
    const contactId = createRes.body.contact._id;

    // 2. Change commission to 0.06
    const editRes = await request(app)
      .put(`/truck-contacts/${contactId}`)
      .send({
        'Truck No ': 'WB29A8166',
        'Owner Name ': 'UDAY MALIK',
        'basicFreightComm': '0.06',
        'effectiveDate': '2026-10-10',
        'changedBy': 'Head Office'
      });
    expect(editRes.status).toBe(200);

    // 3. Upload invoice
    const invoice = await Invoice.create({
      human_verified_data: {
        invoice_details: { invoice_number: 'INV-TEST-C', invoice_date: '2026-10-10' },
        supply_details: { vehicle_number: 'WB29A8166' },
        items: [{ rate: 934, quantity: 1, taxable_value: 934 }]
      }
    });

    await pushToRegister(invoice._id.toString());

    // 4. Verify 94% party rate (877.96)
    const res = await request(app).get('/cement-register');
    expect(res.status).toBe(200);
    const entry = res.body.entries.find(e => e['INVOICE NO'] === 'INV-TEST-C');
    expect(entry).toBeDefined();
    expect(entry._freight_commission).toBe(0.06);
    expect(entry['PARTY RATE (95-97%)']).toBe(877.96);
    expect(entry['BILLING ER 95%']).toBe(877.96);
    expect(entry['AMOUNT']).toBe(877.96);
    expect(entry['PROFIT']).toBe(56.04);
  });

  test('Test D: Pending approval (unapproved change does not affect calculations)', async () => {
    // 1. Initial contact setup with 0.06
    const createRes = await request(app)
      .post('/truck-contacts')
      .send({
        'Truck No ': 'WB29A8166',
        'Owner Name ': 'UDAY MALIK',
        'basicFreightComm': 0.06,
        'registrationDate': '2020-01-01',
        'effectiveDate': '2020-01-01'
      });
    const contactId = createRes.body.contact._id;

    // 2. Submit change to 0.03 via request (pending approval)
    const reqRes = await request(app)
      .post('/truck-contacts/request')
      .send({
        existingContactId: contactId,
        'Truck No ': 'WB29A8166',
        'Owner Name ': 'UDAY MALIK',
        'basicFreightComm': '0.03',
        'effectiveDate': '2026-10-10',
        requestType: 'Edit Profile'
      });
    expect(reqRes.status).toBe(201);
    expect(reqRes.body.success).toBe(true);

    // 3. Upload invoice while approval is pending
    const invoice = await Invoice.create({
      human_verified_data: {
        invoice_details: { invoice_number: 'INV-TEST-D', invoice_date: '2026-10-10' },
        supply_details: { vehicle_number: 'WB29A8166' },
        items: [{ rate: 934, quantity: 1, taxable_value: 934 }]
      }
    });

    await pushToRegister(invoice._id.toString());

    // 4. Verify calculation still uses last approved 0.06 (877.96), NOT unapproved 0.03
    const res = await request(app).get('/cement-register');
    expect(res.status).toBe(200);
    const entry = res.body.entries.find(e => e['INVOICE NO'] === 'INV-TEST-D');
    expect(entry).toBeDefined();
    expect(entry._freight_commission).toBe(0.06);
    expect(entry['PARTY RATE (95-97%)']).toBe(877.96);
    expect(entry['BILLING ER 95%']).toBe(877.96);
  });

  test('Test E: Historical record preservation vs new invoices', async () => {
    // 1. Initial contact with 0.05
    const createRes = await request(app)
      .post('/truck-contacts')
      .send({
        'Truck No ': 'WB29A8166',
        'Owner Name ': 'UDAY MALIK',
        'basicFreightComm': 0.05,
        'registrationDate': '2020-01-01',
        'effectiveDate': '2020-01-01'
      });
    const contactId = createRes.body.contact._id;

    // 2. Upload Historical Invoice on 2026-10-05 under 0.05
    const invoice1 = await Invoice.create({
      human_verified_data: {
        invoice_details: { invoice_number: 'INV-HISTORICAL', invoice_date: '2026-10-05' },
        supply_details: { vehicle_number: 'WB29A8166' },
        items: [{ rate: 934, quantity: 1, taxable_value: 934 }]
      }
    });
    await pushToRegister(invoice1._id.toString());

    // 3. On 2026-10-10, approve commission change to 0.04
    await request(app)
      .put(`/truck-contacts/${contactId}`)
      .send({
        'Truck No ': 'WB29A8166',
        'Owner Name ': 'UDAY MALIK',
        'basicFreightComm': '0.04',
        'effectiveDate': '2026-10-10',
        'changedBy': 'Head Office'
      });

    // 4. Upload New Invoice on 2026-10-10
    const invoice2 = await Invoice.create({
      human_verified_data: {
        invoice_details: { invoice_number: 'INV-NEW', invoice_date: '2026-10-10' },
        supply_details: { vehicle_number: 'WB29A8166' },
        items: [{ rate: 934, quantity: 1, taxable_value: 934 }]
      }
    });
    await pushToRegister(invoice2._id.toString());

    // 5. Verify Historical invoice remains 95% (887.30) and New invoice uses 96% (896.64)
    const res = await request(app).get('/cement-register');
    expect(res.status).toBe(200);

    const histEntry = res.body.entries.find(e => e['INVOICE NO'] === 'INV-HISTORICAL');
    const newEntry = res.body.entries.find(e => e['INVOICE NO'] === 'INV-NEW');

    expect(histEntry._freight_commission).toBe(0.05);
    expect(histEntry['PARTY RATE (95-97%)']).toBe(887.30);
    expect(histEntry['BILLING ER 95%']).toBe(887.30);

    expect(newEntry._freight_commission).toBe(0.04);
    expect(newEntry['PARTY RATE (95-97%)']).toBe(896.64);
    expect(newEntry['BILLING ER 95%']).toBe(896.64);
  });

  test('Test F: Vehicle isolation (changing Vehicle A does not affect Vehicle B)', async () => {
    // Vehicle A
    await request(app).post('/truck-contacts').send({
      'Truck No ': 'WB29A8166',
      'Owner Name ': 'OWNER A',
      'basicFreightComm': 0.05,
      'registrationDate': '2020-01-01',
      'effectiveDate': '2020-01-01'
    });

    // Vehicle B
    await request(app).post('/truck-contacts').send({
      'Truck No ': 'WB33C6016',
      'Owner Name ': 'OWNER B',
      'basicFreightComm': 0.05,
      'registrationDate': '2020-01-01',
      'effectiveDate': '2020-01-01'
    });

    // Change Vehicle A to 0.04
    const contactA = (await request(app).get('/truck-contacts')).body.contacts.find(c => (c['Truck No '] || c['Truck No']) === 'WB29A8166');
    await request(app).put(`/truck-contacts/${contactA._id}`).send({
      'Truck No ': 'WB29A8166',
      'basicFreightComm': '0.04',
      'effectiveDate': '2026-10-10'
    });

    // Upload invoices for both vehicles
    const invA = await Invoice.create({
      human_verified_data: {
        invoice_details: { invoice_number: 'INV-VEH-A', invoice_date: '2026-10-10' },
        supply_details: { vehicle_number: 'WB29A8166' },
        items: [{ rate: 934, quantity: 1, taxable_value: 934 }]
      }
    });
    const invB = await Invoice.create({
      human_verified_data: {
        invoice_details: { invoice_number: 'INV-VEH-B', invoice_date: '2026-10-10' },
        supply_details: { vehicle_number: 'WB33C6016' },
        items: [{ rate: 934, quantity: 1, taxable_value: 934 }]
      }
    });

    await pushToRegister(invA._id.toString());
    await pushToRegister(invB._id.toString());

    const res = await request(app).get('/cement-register');
    const entryA = res.body.entries.find(e => e['INVOICE NO'] === 'INV-VEH-A');
    const entryB = res.body.entries.find(e => e['INVOICE NO'] === 'INV-VEH-B');

    expect(entryA._freight_commission).toBe(0.04);
    expect(entryA['PARTY RATE (95-97%)']).toBe(896.64);

    expect(entryB._freight_commission).toBe(0.05);
    expect(entryB['PARTY RATE (95-97%)']).toBe(887.30);
  });

  test('Test G: Persistence in MongoDB & history tracking', async () => {
    // 1. Create and edit contact
    const createRes = await request(app).post('/truck-contacts').send({
      'Truck No ': 'WB29A8166',
      'Owner Name ': 'UDAY MALIK',
      'basicFreightComm': 0.05,
      'registrationDate': '2020-01-01',
      'effectiveDate': '2020-01-01'
    });
    const contactId = createRes.body.contact._id;

    await request(app).put(`/truck-contacts/${contactId}`).send({
      'Truck No ': 'WB29A8166',
      'Owner Name ': 'UDAY MALIK',
      'basicFreightComm': '0.04',
      'effectiveDate': '2026-10-10',
      'changedBy': 'Office Manager'
    });

    // 2. Fetch history endpoint
    const histRes = await request(app).get(`/truck-contacts/${contactId}/history`);
    expect(histRes.status).toBe(200);
    expect(histRes.body.success).toBe(true);
    expect(histRes.body.history.length).toBeGreaterThanOrEqual(2);

    const latestVer = histRes.body.history[histRes.body.history.length - 1];
    expect(latestVer.effectiveDate).toBe('2026-10-10');
    expect(latestVer.snapshot.basic_freight_commission).toBe(0.04);
  });

  test('Test H: No stale data on immediate upload', async () => {
    const createRes = await request(app).post('/truck-contacts').send({
      'Truck No ': 'WB29A8166',
      'Owner Name ': 'UDAY MALIK',
      'basicFreightComm': 0.05,
      'registrationDate': '2020-01-01',
      'effectiveDate': '2020-01-01'
    });
    const contactId = createRes.body.contact._id;

    // Edit to 0.07 (93% party rate -> 868.62)
    await request(app).put(`/truck-contacts/${contactId}`).send({
      'Truck No ': 'WB29A8166',
      'basicFreightComm': '0.07',
      'effectiveDate': '2026-10-10'
    });

    // Immediate invoice push
    const inv = await Invoice.create({
      human_verified_data: {
        invoice_details: { invoice_number: 'INV-IMMEDIATE', invoice_date: '2026-10-10' },
        supply_details: { vehicle_number: 'WB29A8166' },
        items: [{ rate: 934, quantity: 1, taxable_value: 934 }]
      }
    });
    await pushToRegister(inv._id.toString());

    const res = await request(app).get('/cement-register');
    const entry = res.body.entries.find(e => e['INVOICE NO'] === 'INV-IMMEDIATE');
    expect(entry._freight_commission).toBe(0.07);
    expect(entry['PARTY RATE (95-97%)']).toBe(868.62);
    expect(entry['PARTY RATE %']).toBe('93%');
    expect(entry['PARTY RATE PERCENT']).toBe(93);
    expect(entry['PARTY RATE AMOUNT']).toBe(868.62);
    expect(entry['BILLING ER 95%']).toBe(868.62);
    expect(entry['PROFIT']).toBe(65.38);
  });

  test('Test I: Exact formula checks for all commission rates (0.03, 0.04, 0.05, 0.06, 0.07 on ₹934)', async () => {
    const cases = [
      { comm: 0.03, expectedPct: '97%', expectedPctNum: 97, expectedAmount: 905.98, expectedProfit: 28.02 },
      { comm: 0.04, expectedPct: '96%', expectedPctNum: 96, expectedAmount: 896.64, expectedProfit: 37.36 },
      { comm: 0.05, expectedPct: '95%', expectedPctNum: 95, expectedAmount: 887.30, expectedProfit: 46.70 },
      { comm: 0.06, expectedPct: '94%', expectedPctNum: 94, expectedAmount: 877.96, expectedProfit: 56.04 },
      { comm: 0.07, expectedPct: '93%', expectedPctNum: 93, expectedAmount: 868.62, expectedProfit: 65.38 },
    ];

    for (const [idx, c] of cases.entries()) {
      const vehNo = `WB01TEST${idx}`;
      await request(app).post('/truck-contacts').send({
        'Truck No ': vehNo,
        'Owner Name ': `OWNER ${idx}`,
        'basicFreightComm': c.comm,
        'registrationDate': '2020-01-01',
        'effectiveDate': '2020-01-01'
      });

      const inv = await Invoice.create({
        human_verified_data: {
          invoice_details: { invoice_number: `INV-COMM-${c.comm}`, invoice_date: '2026-10-10' },
          supply_details: { vehicle_number: vehNo },
          items: [{ rate: 934, quantity: 1, taxable_value: 934 }]
        }
      });
      await pushToRegister(inv._id.toString());

      const res = await request(app).get('/cement-register');
      const entry = res.body.entries.find(e => e['INVOICE NO'] === `INV-COMM-${c.comm}`);
      expect(entry).toBeDefined();
      expect(entry._freight_commission).toBe(c.comm);
      expect(entry['PARTY RATE %']).toBe(c.expectedPct);
      expect(entry['PARTY RATE PERCENT']).toBe(c.expectedPctNum);
      expect(entry['PARTY RATE (95-97%)']).toBe(c.expectedAmount);
      expect(entry['PARTY RATE AMOUNT']).toBe(c.expectedAmount);
      expect(entry['BILLING ER 95%']).toBe(c.expectedAmount);
      expect(entry['AMOUNT']).toBe(c.expectedAmount);
      expect(entry['PROFIT']).toBe(c.expectedProfit);
    }
  });

  test('Test J: Missing/Invalid commission sets validation error and does not silently assume 95%', async () => {
    // Invoice for an unknown truck not in Party Master
    const inv = await Invoice.create({
      human_verified_data: {
        invoice_details: { invoice_number: 'INV-UNKNOWN-VEH', invoice_date: '2026-10-10' },
        supply_details: { vehicle_number: 'WB99UNKNOWN' },
        items: [{ rate: 934, quantity: 1, taxable_value: 934 }]
      }
    });
    await pushToRegister(inv._id.toString());

    const res = await request(app).get('/cement-register');
    const entry = res.body.entries.find(e => e['INVOICE NO'] === 'INV-UNKNOWN-VEH');
    expect(entry).toBeDefined();
    expect(entry._freight_commission).toBeNull();
    expect(entry._commission_status).toBe('INVALID_OR_MISSING');
    expect(entry['PARTY RATE %']).toBeUndefined();
    expect(entry['PARTY RATE AMOUNT']).toBeUndefined();
  });

  test('Test K: Rejected Party Master change does not affect future invoices', async () => {
    // 1. Initial contact setup with 0.05
    const createRes = await request(app)
      .post('/truck-contacts')
      .send({
        'Truck No ': 'WB29A8166',
        'Owner Name ': 'UDAY MALIK',
        'basicFreightComm': 0.05,
        'registrationDate': '2020-01-01',
        'effectiveDate': '2020-01-01'
      });
    const contactId = createRes.body.contact._id;

    // 2. Submit change request to 0.04
    const reqRes = await request(app)
      .post('/truck-contacts/request')
      .send({
        existingContactId: contactId,
        'Truck No ': 'WB29A8166',
        'Owner Name ': 'UDAY MALIK',
        'basicFreightComm': '0.04',
        'effectiveDate': '2026-10-10',
        requestType: 'Edit Profile'
      });
    const requestId = reqRes.body.requestId;

    // 3. Head Office REJECTS the request
    const rejectRes = await request(app)
      .put(`/truck-contacts/approvals/${requestId}`)
      .send({
        status: 'rejected',
        actionBy: 'Head Office Approver'
      });
    expect(rejectRes.status).toBe(200);

    // 4. Upload invoice after rejection
    const inv = await Invoice.create({
      human_verified_data: {
        invoice_details: { invoice_number: 'INV-AFTER-REJECT', invoice_date: '2026-10-10' },
        supply_details: { vehicle_number: 'WB29A8166' },
        items: [{ rate: 934, quantity: 1, taxable_value: 934 }]
      }
    });
    await pushToRegister(inv._id.toString());

    // 5. Verify the invoice still uses approved commission 0.05 (887.30), not rejected 0.04
    const res = await request(app).get('/cement-register');
    const entry = res.body.entries.find(e => e['INVOICE NO'] === 'INV-AFTER-REJECT');
    expect(entry._freight_commission).toBe(0.05);
    expect(entry['PARTY RATE (95-97%)']).toBe(887.30);
    expect(entry['PARTY RATE AMOUNT']).toBe(887.30);
  });

  test('Test L: Idempotency on pipeline retry and duplicate upload prevention', async () => {
    // 1. Create Party Master contact
    await request(app).post('/truck-contacts').send({
      'Truck No ': 'WB29A8166',
      'Owner Name ': 'UDAY MALIK',
      'basicFreightComm': 0.04,
      'registrationDate': '2020-01-01',
      'effectiveDate': '2020-01-01'
    });

    const inv = await Invoice.create({
      human_verified_data: {
        invoice_details: { invoice_number: 'INV-RETRY-TEST', invoice_date: '2026-10-10' },
        supply_details: { vehicle_number: 'WB29A8166' },
        items: [{ rate: 934, quantity: 1, taxable_value: 934 }]
      }
    });

    // 2. Call pushToRegister 3 times (simulating retries / re-syncs)
    await pushToRegister(inv._id.toString());
    await pushToRegister(inv._id.toString());
    await pushToRegister(inv._id.toString());

    // 3. Verify exactly one entry exists in Cement Register with correct values
    const res = await request(app).get('/cement-register');
    const matchingEntries = res.body.entries.filter(e => e['INVOICE NO'] === 'INV-RETRY-TEST');
    expect(matchingEntries.length).toBe(1);

    const entry = matchingEntries[0];
    expect(entry['BILLING AMOUNT']).toBe(934);
    expect(entry._freight_commission).toBe(0.04);
    expect(entry['PARTY RATE %']).toBe('96%');
    expect(entry['PARTY RATE (95-97%)']).toBe(896.64);
    expect(entry['PARTY RATE AMOUNT']).toBe(896.64);
    expect(entry['AMOUNT']).toBe(896.64);
    expect(entry['PROFIT']).toBe(37.36);
  });

});

