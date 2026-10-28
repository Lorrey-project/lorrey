const CheckBook = require('../models/CheckBook');
const AccountDetail = require('../models/AccountDetail');

/**
 * Calculates current Check Book balance based on persisted CheckBook records
 * and confirmed Bank Book (AccountDetail) transactions.
 *
 * Business Rule:
 * availableChecks = totalSavedChecks - alreadyUsed/confirmedChecks
 *
 * IF availableChecks <= 2:
 *     SHOW LOW CHECK BALANCE ALERT (or CRITICAL if 0)
 *     SHOW AVAILABLE CHECK COUNT
 *     SHOW "ADD CHECKS" ACTION
 * ELSE:
 *     DO NOT SHOW LOW CHECK BALANCE ALERT
 */
async function getCheckBookBalance() {
  const allChecks = await CheckBook.find({}).sort({ createdAt: -1 }).lean();
  const totalSavedChecks = allChecks.length;

  // Find all active Bank Book entries that reference checks using raw collection
  // to avoid Mongoose schema casting issues with legacy empty-string ObjectIds
  const usedAccountDetails = await AccountDetail.collection.find({
    $or: [
      { checkBookId: { $exists: true, $nin: ['', null] } },
      { '_checkBookRecord.checkId': { $exists: true, $nin: ['', null] } },
      { 'Cheque No': { $exists: true, $nin: ['', null] } },
      { chequeNo: { $exists: true, $nin: ['', null] } }
    ]
  }, {
    projection: {
      _id: 1,
      checkBookId: 1,
      _checkBookRecord: 1,
      'Cheque No': 1,
      chequeNo: 1,
      Deposit: 1,
      deposit: 1
    }
  }).toArray();

  const usedCheckIdSet = new Set();
  const usedRowIdSet = new Set();
  const usedCheckNumberSet = new Set();

  for (const ad of usedAccountDetails) {
    usedRowIdSet.add(String(ad._id));
    if (ad.checkBookId) {
      usedCheckIdSet.add(String(ad.checkBookId));
    }
    if (ad._checkBookRecord && ad._checkBookRecord.checkId) {
      usedCheckIdSet.add(String(ad._checkBookRecord.checkId));
    }
    const chkNo = String(ad['Cheque No'] || ad.chequeNo || '').trim();
    const depAmt = parseFloat(String(ad.Deposit || 0).replace(/,/g, ''));
    if (chkNo && depAmt > 0) {
      usedCheckNumberSet.add(chkNo.toLowerCase());
      usedCheckNumberSet.add(chkNo.replace(/^0+/, '').toLowerCase());
    }
  }

  const usedChecksList = [];
  const availableChecksList = [];

  for (const check of allChecks) {
    const cId = String(check._id);
    const cNo = String(check.checkNumber || '').trim().toLowerCase();
    const cNoUnpadded = cNo.replace(/^0+/, '');
    const bankRowId = check.bankBookRowId ? String(check.bankBookRowId).trim() : '';

    const isUsed =
      (bankRowId !== '' && usedRowIdSet.has(bankRowId)) ||
      usedCheckIdSet.has(cId) ||
      (cNo && (usedCheckNumberSet.has(cNo) || usedCheckNumberSet.has(cNoUnpadded)));

    if (isUsed) {
      usedChecksList.push(check);
    } else {
      availableChecksList.push(check);
    }
  }

  const alreadyUsedChecks = usedChecksList.length;
  const availableChecks = Math.max(0, totalSavedChecks - alreadyUsedChecks);
  const isLow = availableChecks <= 2;
  const isCritical = availableChecks === 0;

  let alertLevel = 'none';
  let alertTitle = '';
  let alertMessage = '';
  let actionText = '';

  if (availableChecks === 0) {
    alertLevel = 'critical';
    alertTitle = '🔴 NO CHECKS AVAILABLE';
    alertMessage = 'No checks are currently available. Please add checks to the Check Book before processing the next cheque transaction.';
    actionText = 'ADD CHECKS';
  } else if (availableChecks <= 2) {
    alertLevel = 'low';
    alertTitle = '⚠️ LOW CHECK BALANCE';
    alertMessage = `You currently have ${availableChecks} check${availableChecks === 1 ? '' : 's'} available. More checks are required. Please add additional checks to the Check Book.`;
    actionText = 'ADD CHECKS';
  }

  return {
    totalSavedChecks,
    alreadyUsedChecks,
    availableChecks,
    threshold: 2,
    isLow,
    isCritical,
    alertLevel,
    alertTitle,
    alertMessage,
    actionText,
    availableChecksList: availableChecksList.map(c => ({
      _id: c._id,
      checkNumber: c.checkNumber,
      checkAmount: c.checkAmount,
      checkDate: c.checkDate,
      receivingDate: c.receivingDate,
      documentUrl: c.documentUrl,
      documentName: c.documentName
    })),
    usedChecksList: usedChecksList.map(c => ({
      _id: c._id,
      checkNumber: c.checkNumber,
      checkAmount: c.checkAmount,
      checkDate: c.checkDate,
      receivingDate: c.receivingDate,
      bankBookRowId: c.bankBookRowId
    }))
  };
}

module.exports = {
  getCheckBookBalance
};
