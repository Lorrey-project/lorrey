const mongoose = require('mongoose');

function normalizeSite(site) {
  if (!site) return '';
  const s = String(site).trim().toUpperCase();
  if (s === 'NVCL') return 'NVCL';
  if (s === 'NVL') return 'NVL';
  return site.trim();
}

async function run() {
  await mongoose.connect('mongodb+srv://lorrey0004:lorrey0004@cluster0.pqbigfd.mongodb.net/invoiceAI?retryWrites=true&w=majority');
  const cementCol = mongoose.connection.useDb('cement_register').collection('entries');
  const FinancialYearPayment = mongoose.connection.useDb('invoiceAI').collection('financialyearpayments');
  const party = 'NVCL';
  
  const allCement = await cementCol.find({ SITE: { $regex: new RegExp(`^${party}$`, 'i') } }).toArray();
  const payments = await FinancialYearPayment.find({}).toArray();
  
  const aggregated = {};
    for (const row of allCement) {
      let invNo = row['BILL NO'];
      if (!invNo || String(row['CHALLAN STATUS']).toUpperCase().trim() !== 'BILLED') continue;
      invNo = String(invNo).trim();

      const rawSite = normalizeSite(row['SITE']);
      if (rawSite !== party.toUpperCase()) continue;

      const prefix = rawSite === 'NVCL' ? 'NVCL/' : 'DAC/';
      const cleanInvNo = invNo.replace(/^(DAC|NVCL)\//i, '');
      const finalInvNo = `${prefix}${cleanInvNo}`;

      if (!aggregated[finalInvNo]) {
        aggregated[finalInvNo] = {
          invoiceNumber: finalInvNo,
          amount: 0,
          invoiceNos: new Set(),
        };
      }

      const amt =
        parseFloat(row['BILLING AMOUNT']) ||
        parseFloat(row['Billing Amount']) ||
        parseFloat(row['BILLING ER 95%']) ||
        parseFloat(String(row['AMOUNT']).replace(/,/g, '')) || 0;
      aggregated[finalInvNo].amount += amt;
    }

    const computedRows = [];
    for (const r of Object.values(aggregated)) {
      const amt = r.amount;
      const cgst = Math.round((amt * 0.09) * 100) / 100;
      const sgst = Math.round((amt * 0.09) * 100) / 100;
      const totalAmount = amt + cgst + sgst;
      const tdsRate = 0.02;
      const tds = Math.round((amt * tdsRate) * 100) / 100;
      const receivable = totalAmount - tds;
      
      const paymentObj = payments.find(p => p.billNos && p.billNos.includes(r.invoiceNumber));

      computedRows.push({
        invoiceNumber: r.invoiceNumber,
        amount: amt,
        receivable,
        groupId: paymentObj ? paymentObj.id : `AUTO-${r.invoiceNumber}`,
        groupData: paymentObj || {}
      });
    }

    const pendingBills = [];
    const groupRowsMap = {};
    for (const row of computedRows) {
      if (!groupRowsMap[row.groupId]) groupRowsMap[row.groupId] = [];
      groupRowsMap[row.groupId].push(row);
    }
    
    for (const r of computedRows) {
      const gid = r.groupId;
      const gd = r.groupData || {};

      const groupRows = groupRowsMap[gid];
      const groupTotalRecv = groupRows.reduce((s, x) => s + (x.receivable || 0), 0);

      const paymentAmt = parseFloat(gd.paymentAmount) || 0;
      const debitAmt = parseFloat(gd.debitAmount) || 0;
      const tdsProv = parseFloat(gd.tdsProvision) || 0;

      const isPaid = paymentAmt > 0 && (paymentAmt + debitAmt + tdsProv >= groupTotalRecv - 1);
      
      console.log('Bill:', r.invoiceNumber, 'Receivable:', r.receivable, 'PaymentAmt:', paymentAmt, 'isPaid:', isPaid);

      if (!isPaid) {
        pendingBills.push(r.invoiceNumber);
      }
    }
  
  console.log('Pending Bills:', pendingBills);
  await mongoose.disconnect();
}
run().catch(console.error);
