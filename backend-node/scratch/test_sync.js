const mongoose = require('mongoose');
const AccountDetail = require('./models/AccountDetail');
const PartyPayment = require('./models/PartyPayment');
mongoose.connect('mongodb://localhost:27017/invoice_system').then(async () => {
  // Mock data
  await AccountDetail.deleteMany({ vehicle: 'TEST-123' });
  await PartyPayment.deleteMany({ vehicleNo: 'TEST-123' });
  
  await AccountDetail.create([
    { vehicle: 'TEST-123', month: 'June', selectedYear: '2026', ledgerName: 'Freight Payment', withdraw: '25000' },
    { vehicle: 'TEST-123', month: 'June', selectedYear: '2026', ledgerName: 'Toll Payment', withdraw: '10,000' }
  ]);
  
  // Call the function
  const { syncPartyPayments } = require('./routes/accountDetailRoutes');
  // wait we can't easily export it. 
  // let's just run an api hit using axios or something?
  // Or copy paste the function here
  const syncFunc = async (affectedDocs) => {
    const monthNameToNumber = (name) => {
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      return months.indexOf(name) + 1;
    };
  
    const combinations = new Set();
    affectedDocs.forEach(doc => {
      const ledger = (doc.ledgerName || '').trim();
      if (ledger === 'Freight Payment' || ledger === 'Toll Payment') {
        const v = (doc.vehicle || '').trim();
        const m = monthNameToNumber((doc.month || '').trim());
        const y = parseInt(doc.selectedYear, 10);
        if (v && m >= 1 && m <= 12 && !isNaN(y)) {
          combinations.add(JSON.stringify({ vehicleNo: v, month: m, year: y }));
        }
      }
    });
  
    for (const comboStr of combinations) {
      const combo = JSON.parse(comboStr);
      const monthStr = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][combo.month - 1];
      const relatedDocs = await AccountDetail.find({
        vehicle: combo.vehicleNo,
        month: monthStr,
        selectedYear: String(combo.year),
        ledgerName: { $in: ['Freight Payment', 'Toll Payment'] }
      });
      let totalWithdraw = 0;
      relatedDocs.forEach(d => {
        const amt = parseFloat(String(d.withdraw || '').replace(/,/g, ''));
        if (!isNaN(amt)) totalWithdraw += amt;
      });
      await PartyPayment.updateOne(
        { vehicleNo: combo.vehicleNo, month: combo.month, year: combo.year },
        { $set: { paidToParty: totalWithdraw } },
        { upsert: true }
      );
    }
  };

  const docs = await AccountDetail.find({ vehicle: 'TEST-123' });
  await syncFunc(docs);

  const party = await PartyPayment.findOne({ vehicleNo: 'TEST-123' });
  console.log('Resulting PartyPayment paidToParty:', party.paidToParty);

  process.exit(0);
});
