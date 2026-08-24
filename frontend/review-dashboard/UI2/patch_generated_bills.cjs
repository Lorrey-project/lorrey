const fs = require('fs');
const file = 'src/pages/CementRegister.jsx';
let content = fs.readFileSync(file, 'utf8');

// Insert the useMemo for generatedBillsPreviewDetails
const useMemoString = `
  const generatedBillsPreviewDetails = useMemo(() => {
    if (!showPreviousScreen || !generatedBillsPreview || generatedBillsPreview.length === 0) return [];
    
    const bills = [];
    
    generatedBillsPreview.forEach(billNo => {
      const billRows = computedRows.filter(r => 
        (r['BILL NO'] === billNo && r['Freight Generated'] === 'Yes') || 
        (r['UNLOADING BILL NO'] === billNo && r['Unloading Generated'] === 'Yes')
      );

      if (billRows.length === 0) return;

      const invoiceNos = Array.from(new Set(billRows.map(r => r['INVOICE NO'] || r['Invoice No']).filter(Boolean)));
      
      const partyNames = Array.from(new Set(billRows.map(r => {
        const rawSite = String(r['SITE'] || '').trim().toUpperCase();
        return rawSite === 'NVL' ? 'DAC' : 'NVCL';
      })));
      
      const vehicleNos = Array.from(new Set(billRows.map(r => r['VEHICLE NUMBER'] || r['VEHICLE NO'] || r['Lorry No']).filter(Boolean)));
      
      let billDate = '';
      let isFreight = false;
      let isUnloading = false;
      let totalAmount = 0;

      billRows.forEach(r => {
        if (r['BILL NO'] === billNo) {
          isFreight = true;
          if (!billDate) billDate = r['BILL DATE'];
          
          let billAmtStr = r['Billing Amount'] || r['BILLING ER 95%'] || r['BILLING @ 95% (PARTY PAYABLE)'] || r['AMOUNT'];
          const amt = parseFloat(String(billAmtStr).replace(/,/g, '')) || 0;
          totalAmount += amt;
        } else if (r['UNLOADING BILL NO'] === billNo) {
          isUnloading = true;
          if (!billDate) billDate = r['UNLOADING BILL DATE'];
          
          const amt = parseFloat(String(r['EXTRA UNLOADING'] || 0).replace(/,/g, '')) || 0;
          totalAmount += amt;
        }
      });
      
      totalAmount = Math.round(totalAmount * 100) / 100;

      bills.push({
        billNo: billNo,
        invoiceNo: invoiceNos.length > 0 ? invoiceNos.join(', ') : '—',
        invoiceDate: billDate || '—',
        partyName: partyNames.length > 0 ? partyNames.join(', ') : '—',
        vehicleNo: vehicleNos.length > 0 ? vehicleNos.join(', ') : '—',
        billAmount: totalAmount,
        amountPaid: 0,
        outstanding: totalAmount,
        status: 'Pending'
      });
    });

    return bills;
  }, [showPreviousScreen, generatedBillsPreview, computedRows]);
`;

// Insert the useMemo right before the main return (line 1018 roughly)
content = content.replace('  return (', useMemoString + '\n\n  return (');

fs.writeFileSync(file, content);
