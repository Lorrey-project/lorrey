const mongoose = require('mongoose');
require('dotenv').config();

const monthNameToNumber = (name) => {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return months.indexOf(name) + 1;
};

const getCombo = (doc) => {
  const ledger = (doc.ledgerName || '').trim().toLowerCase();
  if (ledger !== 'freight payment' && ledger !== 'toll payment') return null;
  const v = (doc.vehicle || '').trim();
  if (!v) return null;
  const docMonthStr = (doc.month || doc.selectedMonth || '').trim();
  const m = monthNameToNumber(docMonthStr);
  if (m < 1 || m > 12) return null;
  let fyStart = parseInt(doc.selectedYear, 10);
  if (isNaN(fyStart)) return null;
  const y = (m >= 4) ? fyStart : fyStart + 1;
  return { vehicleNo: v, month: m, year: y };
};

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const AccountDetail = require('../models/AccountDetail');
  const PartyPayment = require('../models/PartyPayment');
  
  const affectedDocs = await AccountDetail.find({ vehicle: { $ne: '' } });
  const combinationsToUpdate = new Set();
  
  affectedDocs.forEach(doc => {
    const combo = getCombo(doc);
    if (combo) combinationsToUpdate.add(JSON.stringify(combo));
  });

  for (const comboStr of combinationsToUpdate) {
    const combo = JSON.parse(comboStr);
    const relatedDocs = await AccountDetail.find({
      vehicle: combo.vehicleNo,
      ledgerName: { $regex: /^(freight payment|toll payment)$/i }
    });

    let totalWithdraw = 0;
    relatedDocs.forEach(d => {
      const dCombo = getCombo(d);
      if (dCombo && dCombo.month === combo.month && dCombo.year === combo.year) {
        const amt = parseFloat(String(d.withdraw || '').replace(/,/g, ''));
        if (!isNaN(amt)) totalWithdraw += amt;
      }
    });

    await PartyPayment.updateOne(
      { vehicleNo: combo.vehicleNo, month: combo.month, year: combo.year },
      { $set: { paidToParty: totalWithdraw } },
      { upsert: true }
    );
    console.log(`Synced ${combo.vehicleNo} - ${combo.month}/${combo.year} - Total: ${totalWithdraw}`);
  }
  process.exit(0);
});
