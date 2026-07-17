const mongoose = require('mongoose');

async function test() {
  await mongoose.connect('mongodb+srv://lorrey0004:lorrey0004@cluster0.pqbigfd.mongodb.net/invoiceAI?retryWrites=true&w=majority');
  try {
    const fy = '2025-26';
    let startYear = 2025;
    const shortCode = '25-26';
    
    console.log(`startYear: ${startYear}, shortCode: ${shortCode}`);

    const allCement = await mongoose.connection.useDb("cement_register").collection("entries").find({}).toArray();
    console.log(`Total cement entries: ${allCement.length}`);
    
    let billedCount = 0;
    let matchCodeCount = 0;
    let matchedBills = [];

    for (const row of allCement) {
      if (String(row['CHALLAN STATUS']).toUpperCase().trim() === 'BILLED') {
        billedCount++;
        const invNo = row['BILL NO'] || row['INVOICE NO'];
        const uInvNo = row['UNLOADING BILL NO'];
        const hasShortCode = (invNo && String(invNo).includes(shortCode)) || (uInvNo && String(uInvNo).includes(shortCode));
        if (hasShortCode) {
          matchCodeCount++;
          matchedBills.push({
            invNo, uInvNo, 
            billDate: row['BILL DATE'] || row['INVOICE DATE'] || row['LOADING DT'] || row['LOADING DATE']
          });
        }
      }
    }
    
    console.log(`Billed count: ${billedCount}`);
    console.log(`Matched code count: ${matchCodeCount}`);
    if (matchCodeCount > 0) {
      console.log('Sample matched bills:', matchedBills.slice(0, 5));
    }

  } catch (err) {
    console.error("Data error:", err);
  }
  mongoose.disconnect();
}
test();
