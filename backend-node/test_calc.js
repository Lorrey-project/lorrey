const fs = require('fs');

const num = (val) => {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const s = String(val).replace(/[^\d.-]/g, '');
  const parsed = parseFloat(s);
  return isNaN(parsed) ? 0 : parsed;
};

const fmt2 = (n) => Math.round(num(n) * 100) / 100;

const applyCalcs = (row) => {
  const r = { ...row };
  r['Billing Amount'] = fmt2(num(r.BILLING) * num(r.MT));
  r['BILLING ER 95%'] = fmt2(num(r['Billing Amount']) * 0.95);
  r['AMOUNT'] = r.AMOUNT || 0; // Just simulating
  return r;
};

const { MongoClient } = require('mongodb');
async function run() {
  const client = new MongoClient('mongodb+srv://lorrey0004:lorrey0004@cluster0.pqbigfd.mongodb.net/invoiceAI?retryWrites=true&w=majority');
  try {
    await client.connect();
    const db = client.db('invoiceAI');
    const cementDb = client.db('cement_register');
    const col = cementDb.collection('entries');
    const doc = await col.findOne({ "BILL NO": "NVCL/26-27/0013" });
    console.log("RAW DOC KEYS:", Object.keys(doc || {}));
    console.log("RAW DOC BILLING:", doc.BILLING, "MT:", doc.MT, "AMOUNT:", doc.AMOUNT);
    
    if(doc) {
       const calculated = applyCalcs(doc);
       console.log("CALCULATED:", calculated['Billing Amount'], calculated['BILLING ER 95%'], calculated['AMOUNT']);
       
       let billAmtStr = calculated['Billing Amount'] || calculated['BILLING ER 95%'] || calculated['BILLING @ 95% (PARTY PAYABLE)'] || calculated['AMOUNT'];
       const amt = parseFloat(String(billAmtStr).replace(/,/g, '')) || 0;
       console.log("FINAL AMT:", amt);
    }
  } catch (e) {
    console.error(e);
  } finally {
    await client.close();
  }
}
run();
