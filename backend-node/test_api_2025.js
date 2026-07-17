const mongoose = require('mongoose');
const FinancialYearPayment = require('./models/FinancialYearPayment');
const FinancialYearRow = require('./models/FinancialYearRow');
const BillRegisterDocument = require('./models/BillRegisterDocument');

async function test() {
  await mongoose.connect('mongodb+srv://lorrey0004:lorrey0004@cluster0.pqbigfd.mongodb.net/invoiceAI?retryWrites=true&w=majority');
  try {
    const docs = await BillRegisterDocument.find({}).sort({ createdAt: -1 });
    console.log(`Documents fetched: ${docs.length}`);
  } catch (err) {
    console.error("Documents error:", err.message);
  }

  try {
    const fy = '2025-26';
    let startYear = new Date().getFullYear();
    const parts = fy.split('-');
    if (parts.length === 2) {
      let sy = parseInt(parts[0], 10);
      if (sy < 100) sy += 2000;
      startYear = sy;
    }
    const shortCode = `${String(startYear).slice(-2)}-${String(startYear + 1).slice(-2)}`;
    console.log(`startYear: ${startYear}, shortCode: ${shortCode}`);

    const allCement = await mongoose.connection.useDb("cement_register").collection("entries").find({}, { projection: {
      'GCN NO': 1, 'BILL NO': 1, 'INVOICE NO': 1, 'BILLING': 1,
      'LOADING DT': 1, 'LOADING DATE': 1,
      'BILL DATE': 1,
      'SITE': 1,
      'BILLING ER 95%': 1, 'BILLING @ 95% (PARTY PAYABLE)': 1,
      'AMOUNT': 1, 'Billing Amount': 1,
      'VEHICLE NUMBER': 1, 'VEHICLE NO': 1,
      'PARTY NAME': 1,
      'CHALLAN STATUS': 1,
      'UNLOADING BILL NO': 1, 'UNLOADING BILL DATE': 1,
      'EXTRA UNLOADING': 1,
      'Freight Generated': 1, 'Unloading Generated': 1,
      'SHIPMENT NO': 1,
      _id: 0
    }}).toArray();
    console.log(`allCement length: ${allCement.length}`);

    const rowOverrides = await mongoose.connection.useDb("invoiceAI").collection("financialyearpayments")
      .find({ financialYear: fy }).toArray();
    
    console.log(`rowOverrides length: ${rowOverrides.length}`);

    const payments = await mongoose.connection.useDb("invoiceAI").collection("financialyearpayments_transactions")
      .find({ financialYear: fy }).toArray();

    console.log(`payments length: ${payments.length}`);

  } catch (err) {
    console.error("Data error:", err);
  }
  mongoose.disconnect();
}
test();
