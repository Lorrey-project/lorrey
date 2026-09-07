const { PDFParse } = require('pdf-parse');

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'
];

/**
 * Parses raw text lines from a page or document into structured Bill Register rows.
 * @param {Array<string>} pageLines - Array of string lines extracted from PDF pages.
 * @param {string} targetSite - Target site ('NVL' or 'NVCL').
 * @returns {Array<Object>} Extracted row objects.
 */
function parseBillRegisterLines(pageLines, targetSite = 'NVL') {
  const rows = [];
  let currentSlNo = 1;

  const isHeaderLine = (str) => {
    const s = str.toUpperCase();
    if (s.includes('BILL REGISTER REPORT') || s.includes('REPORT -') || s.startsWith('PAGE ')) return true;
    return (s.includes('SL NO') || s.includes('S.NO') || s.includes('INVOICE NO') || s.includes('BILL NO')) &&
           (s.includes('AMOUNT') || s.includes('DATE') || s.includes('TOTAL') || s.includes('SHIPMENT'));
  };

  const isSummaryLine = (str) => {
    const s = str.toUpperCase();
    return s.startsWith('TOTAL') || s.startsWith('GRAND TOTAL') || s.startsWith('-- ') || s.includes('PAGE OF') || s.includes('CONT.');
  };

  const cleanSite = (targetSite || 'NVL').toUpperCase() === 'NVCL' ? 'NVCL' : 'NVL';

  const dateRegex = /^(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})$/;
  const explicitInvRegex = /^(?:DAC|NVCL|NVL|BILL|INV)[\/\-][A-Z0-9\/\-]+$/i;
  const generalInvRegex = /^[A-Z0-9]+[\/\-][A-Z0-9\/\-]+$/i;

  const reservedWords = new Set(['BILL', 'REGISTER', 'REPORT', 'FREIGHT', 'UNLOADING', 'NVL', 'NVCL', 'TOTAL', 'AMOUNT', 'DATE', 'SL', 'NO', 'S.NO']);

  for (let i = 0; i < pageLines.length; i++) {
    const line = pageLines[i].trim();
    if (!line || isHeaderLine(line) || isSummaryLine(line)) continue;

    const tokens = line.split(/\s+/);
    if (tokens.length < 2) continue;

    // Detect Month
    let monthStr = '';
    for (const t of tokens) {
      const upperT = t.toUpperCase().replace(/['"]/g, '');
      if (MONTH_NAMES.some(m => upperT.startsWith(m))) {
        monthStr = t.toUpperCase();
        break;
      }
    }

    // Detect Date
    let invDate = '';
    for (const t of tokens) {
      if (dateRegex.test(t)) {
        invDate = t;
        break;
      }
    }

    // Detect Invoice Number
    let invNo = '';
    for (const t of tokens) {
      if (explicitInvRegex.test(t)) {
        invNo = t;
        break;
      }
    }
    if (!invNo) {
      for (const t of tokens) {
        const cleanT = t.replace(/['"]/g, '').toUpperCase();
        if (generalInvRegex.test(t) && !dateRegex.test(t) && !reservedWords.has(cleanT) && !MONTH_NAMES.some(m => cleanT.startsWith(m))) {
          invNo = t;
          break;
        }
      }
    }
    if (!invNo) {
      for (const t of tokens) {
        const cleanT = t.replace(/,/g, '').toUpperCase();
        if (isNaN(parseFloat(cleanT)) && !dateRegex.test(t) && !reservedWords.has(cleanT) && !MONTH_NAMES.some(m => cleanT.startsWith(m))) {
          if (t.length >= 3) {
            invNo = t;
            break;
          }
        }
      }
    }

    // Detect Shipment number
    let shipmentNo = '';
    for (const t of tokens) {
      if (/^\d{7,10}$/.test(t) && t !== invNo && t !== invDate) {
        shipmentNo = t;
        break;
      }
    }

    // Bill type
    let billType = 'FREIGHT';
    if (/UNLOADING/i.test(line)) billType = 'UNLOADING';

    // Numbers in line (exclude shipmentNo, invoiceNumber, dates)
    const numberTokens = [];
    tokens.forEach(t => {
      if (t === shipmentNo || t === invNo || t === invDate) return;
      const cleanT = t.replace(/^₹/, '').replace(/,/g, '');
      if (!isNaN(parseFloat(cleanT)) && isFinite(cleanT) && /^\d+(\.\d+)?$/.test(cleanT)) {
        numberTokens.push({ raw: t, val: parseFloat(cleanT) });
      }
    });

    if (!invNo && !invDate && numberTokens.length < 2) continue;

    // Amounts parsing
    let amount = 0, cgst = 0, sgst = 0, totalAmount = 0, tds = 0, receivable = 0, paymentAmount = 0, debitAmount = 0;

    if (numberTokens.length >= 1) {
      let numIdx = 0;
      if (numberTokens[0].val <= 500 && numberTokens.length > 2 && Number.isInteger(numberTokens[0].val)) {
        numIdx = 1;
      }

      const amounts = numberTokens.slice(numIdx).map(n => n.val);
      if (amounts.length === 1) {
        amount = amounts[0];
        totalAmount = amount;
      } else if (amounts.length === 2) {
        amount = amounts[0];
        totalAmount = amounts[1];
      } else if (amounts.length >= 3) {
        amount = amounts[0];
        cgst = amounts[1];
        sgst = amounts[2];
        totalAmount = amounts.length >= 4 ? amounts[3] : (amount + cgst + sgst);
        if (amounts.length >= 5) tds = amounts[4];
        if (amounts.length >= 6) receivable = amounts[5];
        if (amounts.length >= 7) paymentAmount = amounts[6];
      }
    }

    if (!totalAmount && amount) {
      totalAmount = amount + cgst + sgst;
    }

    if (!receivable && totalAmount) {
      receivable = totalAmount - tds;
    }

    let needsReview = false;
    let reviewReason = '';

    if (!invNo) {
      needsReview = true;
      reviewReason = 'Missing Invoice Number';
    } else if (totalAmount > 0 && amount > 0 && Math.abs(totalAmount - (amount + cgst + sgst)) > 2) {
      needsReview = true;
      reviewReason = `Total Amount (${totalAmount}) != Amount (${amount}) + CGST (${cgst}) + SGST (${sgst})`;
    }

    rows.push({
      slNo: currentSlNo++,
      invoiceNumber: invNo || '',
      displayInvoiceNumber: invNo || '',
      invoiceDate: invDate || '',
      shipmentNo: shipmentNo || '',
      month: monthStr || '',
      site: cleanSite,
      billType: billType,
      amount: parseFloat(amount.toFixed(2)),
      cgst: parseFloat(cgst.toFixed(2)),
      sgst: parseFloat(sgst.toFixed(2)),
      totalAmount: parseFloat(totalAmount.toFixed(2)),
      tds: parseFloat(tds.toFixed(2)),
      receivable: parseFloat(receivable.toFixed(2)),
      paymentAmount: parseFloat(paymentAmount.toFixed(2)),
      tdsProvision: 0,
      paymentDate: '',
      referenceNo: '',
      debitAmount: parseFloat(debitAmount.toFixed(2)),
      debitReasons: [],
      remarks: '',
      needsReview,
      reviewReason
    });
  }

  return rows;
}

/**
 * Main PDF parsing entry point using PDFParse class.
 * @param {Buffer} pdfBuffer - Uploaded PDF buffer.
 * @param {string} targetSite - 'NVL' or 'NVCL'.
 * @returns {Promise<Object>} Object containing parsed rows and statistics.
 */
async function parsePdfBillRegister(pdfBuffer, targetSite = 'NVL') {
  if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer)) {
    throw new Error("Invalid PDF buffer provided.");
  }

  const parser = new PDFParse(new Uint8Array(pdfBuffer));
  await parser.load();
  const result = await parser.getText();

  const totalPages = result.total || (result.pages ? result.pages.length : 1);
  const allLines = [];

  if (result.pages && Array.isArray(result.pages)) {
    for (const pageObj of result.pages) {
      if (pageObj && pageObj.text) {
        const lines = pageObj.text.split('\n');
        allLines.push(...lines);
      }
    }
  } else if (result.text) {
    allLines.push(...result.text.split('\n'));
  }

  const rows = parseBillRegisterLines(allLines, targetSite);

  return {
    totalPages,
    totalRows: rows.length,
    rows
  };
}

module.exports = {
  parseBillRegisterLines,
  parsePdfBillRegister
};
