const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const FinancialYearPayment = require('../models/FinancialYearPayment');
const FinancialYearRow = require('../models/FinancialYearRow');
const paymentProofUpload = require('../middleware/paymentProofUpload');

function getCementCol() {
  return mongoose.connection.useDb("cement_register").collection("entries");
}

function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val) ? null : val;

  const str = String(val).trim();

  // ── Detect DD-MM-YYYY (Indian format) — MUST check first ──
  const ddmmyyyy = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddmmyyyy) {
    const d = parseInt(ddmmyyyy[1]), m = parseInt(ddmmyyyy[2]), y = parseInt(ddmmyyyy[3]);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      return new Date(y, m - 1, d);
    }
  }

  // ── Try ISO / standard JS parsing ──
  const iso = new Date(str);
  if (!isNaN(iso.getTime())) return iso;

  return null;
}


const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
];

router.get('/data', async (req, res) => {
  try {
    const allCement = await getCementCol().find({}).toArray();
    
    // Group by Invoice Number (Try GCN NO, then BILL NO, then INVOICE NO)
    const aggregated = {};

    allCement.forEach(row => {
      // Find the invoice format like NVCL/25-26 or DAC/25-26
      let invNo = row['GCN NO'] || row['BILL NO'] || row['INVOICE NO'] || row['BILLING'];
      if (!invNo) return;
      invNo = String(invNo).trim();

      if (!aggregated[invNo]) {
        let invDate = row['LOADING DT'] || row['LOADING DATE'] || '';
        let monthStr = '';
        const dObj = parseDate(invDate);
        if (dObj) {
          const m = dObj.getMonth();
          const yy = String(dObj.getFullYear()).slice(-2);
          monthStr = `${MONTH_NAMES[m]} '${yy}`;
        }

        aggregated[invNo] = {
          invoiceDate: invDate,
          invoiceNumber: invNo,
          month: monthStr,
          site: row['SITE'] || '',
          amount: 0
        };
      }

      // Sum Amount (Billing ER 95% or Amount)
      const amt = parseFloat(row['BILLING ER 95%']) || parseFloat(row['BILLING @ 95% (PARTY PAYABLE)']) || parseFloat(row['AMOUNT']) || parseFloat(row['Billing Amount']) || 0;
      aggregated[invNo].amount += amt;
    });

    const rows = Object.values(aggregated);

    // Fetch manual row mappings (BILL dropdowns & Overrides)
    const rowOverrides = await FinancialYearRow.find({});
    const rowMap = {};
    rowOverrides.forEach(r => { rowMap[r.billNo] = r; });

    // Build final table rows
    const finalRows = rows.map(r => {
      const override = rowMap[r.invoiceNumber] || {};
      return {
        ...r,
        billType: override.billType || 'FREIGHT',
        invoiceDate: override.editedInvoiceDate !== undefined ? override.editedInvoiceDate : r.invoiceDate,
        displayInvoiceNumber: override.editedInvoiceNumber !== undefined ? override.editedInvoiceNumber : r.invoiceNumber,
        month: override.editedMonth !== undefined ? override.editedMonth : r.month,
        site: override.editedSite !== undefined ? override.editedSite : r.site,
        amount: override.editedAmount !== undefined ? override.editedAmount : r.amount
      };
    });

    // Fetch grouped payments
    const payments = await FinancialYearPayment.find({});

    res.json({ rows: finalRows, payments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/save-group', async (req, res) => {
  try {
    const { id, billNos, paymentAmount, paymentDate, referenceNo, debitAmount, remarks } = req.body;
    await FinancialYearPayment.findOneAndUpdate(
      { id },
      { billNos, paymentAmount, paymentDate, referenceNo, debitAmount, remarks },
      { upsert: true, returnDocument: 'after' }
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/upload-proof', paymentProofUpload.single('proof'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const { id } = req.body;
    if (id) {
      await FinancialYearPayment.findOneAndUpdate(
        { id },
        { paymentProofUrl: req.file.location },
        { upsert: true, returnDocument: 'after' }
      );
    }
    res.json({ message: "Proof saved successfully", url: req.file.location });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

router.post('/save-row', async (req, res) => {
  try {
    const { billNo, billType, editedInvoiceDate, editedInvoiceNumber, editedMonth, editedSite, editedAmount } = req.body;
    let updateObj = {};
    if (billType !== undefined) updateObj.billType = billType;
    if (editedInvoiceDate !== undefined) updateObj.editedInvoiceDate = editedInvoiceDate;
    if (editedInvoiceNumber !== undefined) updateObj.editedInvoiceNumber = editedInvoiceNumber;
    if (editedMonth !== undefined) updateObj.editedMonth = editedMonth;
    if (editedSite !== undefined) updateObj.editedSite = editedSite;
    if (editedAmount !== undefined) updateObj.editedAmount = parseFloat(editedAmount) || 0;

    await FinancialYearRow.findOneAndUpdate(
      { billNo },
      { $set: updateObj },
      { upsert: true, returnDocument: 'after' }
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
