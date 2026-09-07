const { parseBillRegisterLines } = require('../utils/pdfBillRegisterParser');

describe('PDF Bill Register Parser Unit Tests', () => {
  test('should parse text lines into structured rows with exact NVL site assignment', () => {
    const sampleLines = [
      'SL NO   INVOICE NO   INVOICE DATE   SHIPMENT NO   MONTH   AMOUNT   CGST   SGST   TOTAL AMOUNT   TDS',
      '1   DAC/26-27-0016   26/04/2026   70012345   APRIL\'26   59125.00   1478.13   1478.13   62081.26   1182.50',
      '2   DAC/26-27-0020   28/04/2026   70012346   MARCH\'26   52010.00   1300.25   1300.25   54610.50   1040.20'
    ];

    const rows = parseBillRegisterLines(sampleLines, 'NVL');
    expect(rows.length).toBe(2);

    expect(rows[0].slNo).toBe(1);
    expect(rows[0].invoiceNumber).toBe('DAC/26-27-0016');
    expect(rows[0].invoiceDate).toBe('26/04/2026');
    expect(rows[0].shipmentNo).toBe('70012345');
    expect(rows[0].month).toBe("APRIL'26");
    expect(rows[0].site).toBe('NVL');
    expect(rows[0].amount).toBe(59125);
    expect(rows[0].cgst).toBe(1478.13);
    expect(rows[0].sgst).toBe(1478.13);
    expect(rows[0].totalAmount).toBe(62081.26);
    expect(rows[0].tds).toBe(1182.50);

    expect(rows[1].site).toBe('NVL');
    expect(rows[1].invoiceNumber).toBe('DAC/26-27-0020');
  });

  test('should force NVCL site assignment when targetSite is NVCL', () => {
    const sampleLines = [
      '1   NVCL/26-27-0062   28/04/2026   429920.00   10748.00   10748.00   451416.00   8598.40'
    ];

    const rows = parseBillRegisterLines(sampleLines, 'NVCL');
    expect(rows.length).toBe(1);
    expect(rows[0].site).toBe('NVCL');
    expect(rows[0].invoiceNumber).toBe('NVCL/26-27-0062');
    expect(rows[0].amount).toBe(429920);
  });

  test('should flag rows with missing invoice number or mismatching total amount for review', () => {
    const sampleLines = [
      '1   28/04/2026   100.00   5.00   5.00   150.00' // Total 150 != 100+5+5
    ];

    const rows = parseBillRegisterLines(sampleLines, 'NVL');
    expect(rows.length).toBe(1);
    expect(rows[0].needsReview).toBe(true);
  });
});
