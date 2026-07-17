const mongoose = require('mongoose');

// Helper functions (same as in financialYearRoutes)
const parseDate = (str) => {
  if (!str) return null;
  const ddmmyyyy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (ddmmyyyy) {
      const d = parseInt(ddmmyyyy[1], 10);
      const m = parseInt(ddmmyyyy[2], 10);
      const y = parseInt(ddmmyyyy[3], 10);
      return new Date(y, m - 1, d);
  }
  const yyyymmdd = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (yyyymmdd) {
      const y = parseInt(yyyymmdd[1], 10);
      const m = parseInt(yyyymmdd[2], 10);
      const d = parseInt(yyyymmdd[3], 10);
      return new Date(y, m - 1, d);
  }
  return null;
};
const normalizeSite = (site) => (site || '').trim().toUpperCase();

async function test() {
  await mongoose.connect('mongodb+srv://lorrey0004:lorrey0004@cluster0.pqbigfd.mongodb.net/invoiceAI?retryWrites=true&w=majority');
  
  const fy = '2026-27';
  let startYear = 2026;
  const shortCode = '26-27';

  const db = mongoose.connection.useDb('cement_register');
  const allCement = await db.collection('entries').find({}).toArray();
  
  let matchCount = 0;
  
  for (const row of allCement) {
    if (String(row['CHALLAN STATUS']).toUpperCase().trim() !== 'BILLED') continue;

    const invNo = row['BILL NO'] || row['INVOICE NO'];
    const uInvNo = row['UNLOADING BILL NO'];

    const hasShortCode = (invNo && String(invNo).includes(shortCode)) || (uInvNo && String(uInvNo).includes(shortCode));

    if (hasShortCode) {
      matchCount++;
      continue;
    }

    const fInvDate = row['BILL DATE'] || row['LOADING DT'] || row['LOADING DATE'] || '';
    const uInvDate = row['UNLOADING BILL DATE'] || '';

    let matchedDate = false;
    for (const d of [fInvDate, uInvDate]) {
      if (!d) continue;
      const dObj = parseDate(d);
      if (dObj) {
        const y = dObj.getFullYear();
        const m = dObj.getMonth() + 1;
        if (m >= 4 && y === startYear) { matchedDate = true; break; }
        if (m <= 3 && y === startYear + 1) { matchedDate = true; break; }
      }
    }
    if (matchedDate) matchCount++;
  }

  console.log(`Matched ${matchCount} rows for FY 2026-27 in cement_register`);
  mongoose.disconnect();
}
test();
