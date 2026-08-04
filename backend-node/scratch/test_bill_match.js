require('dotenv').config();
const mongoose = require('mongoose');

async function test() {
  await mongoose.connect(process.env.MONGO_URI);
  const col = mongoose.connection.useDb('cement_register').collection('entries');
  const bills = await col.find({ 'BILL NO': { $exists: true } }).limit(5).toArray();
  for (let row of bills) {
      let invNo = row['BILL NO'];
      const rawSite = (row['SITE'] || '').trim().toUpperCase();
      const prefix = rawSite === 'NVCL' ? 'NVCL-' : 'DAC-';
      const cleanInvNo = invNo.replace(/^(DAC|NVCL)[\/\-]/i, '').replace(/\//g, '-');
      const finalInvNo = `${prefix}${cleanInvNo}`;
      console.log(`Original: ${invNo}, Final: ${finalInvNo}`);
      
      const searchNum = finalInvNo.replace(/^(DAC|NVCL)[\/\-]/i, '').replace(/\//g, '-');
      const regexStr = searchNum.replace(/[-/]/g, '[-/\\\\s]*');
      console.log(`Regex to match: ${regexStr}`);
      
      const matchedBill = await col.findOne({
          $or: [
            { 'INVOICE NO': finalInvNo },
            { 'BILL NO': finalInvNo },
            { 'INVOICE NO': { $regex: new RegExp(regexStr, 'i') } },
            { 'BILL NO': { $regex: new RegExp(regexStr, 'i') } }
          ]
      });
      console.log(`Found using regex: ${matchedBill ? matchedBill['BILL NO'] : 'NONE'}`);
  }

  process.exit(0);
}
test();
