const mongoose = require('mongoose');
mongoose.connect('mongodb+srv://lorrey0004:lorrey0004@cluster0.pqbigfd.mongodb.net/invoiceAI?retryWrites=true&w=majority').then(async () => {
  const AccountDetail = mongoose.connection.useDb('invoiceAI').model('AccountDetail', new mongoose.Schema({
    referenceNo: String, withdraw: String, remarks: String
  }, { collection: 'account_details' }));
  
  const pumpCol = mongoose.connection.useDb('pump_payment_register').collection('records');
  const bill = await pumpCol.findOne({ "BILL NO": "SAS/26-27/004" });
  console.log("Before update:", bill["REF. NO"]);
  
  // mock syncPumpPayments
  const syncPumpPayments = async (allocations, manualWithdrawAmount, referenceNo, remarks) => {
    console.log("Called syncPumpPayments with:", { manualWithdrawAmount, referenceNo, remarks });
    const allocatedAmount = Number(manualWithdrawAmount) || 0;
    for (const alloc of allocations) {
      const { rawBillNumber } = alloc;
      const b = await pumpCol.findOne({ "BILL NO": rawBillNumber });
      const currentPaid = Number(b["PAYMENT AMOUNT"]) || 0;
      const newPaid = currentPaid + allocatedAmount;
      await pumpCol.updateOne(
        { _id: b._id },
        { 
          $set: { 
            "PAYMENT AMOUNT": newPaid,
            "REF. NO": referenceNo !== undefined ? referenceNo : (b["REF. NO"] || ""),
          }
        }
      );
    }
  };

  // Mock docMap simulating bulk-update
  const saved = { referenceNo: 'TEST-123', withdraw: '100', remarks: 'test' };
  const item = { changes: { _pumpAllocations: [{ rawBillNumber: 'SAS/26-27/004' }] } };
  
  let merged = {
    ...item.changes,
    'Reference No': saved.referenceNo || '',
    'Withdraw': saved.withdraw || '',
    'Remarks': saved.remarks || ''
  };

  await syncPumpPayments(merged._pumpAllocations, merged['Withdraw'], merged['Reference No'], merged['Remarks']);
  
  const updatedBill = await pumpCol.findOne({ "BILL NO": "SAS/26-27/004" });
  console.log("After update:", updatedBill["REF. NO"]);
  process.exit(0);
});
