const fs = require('fs');

let content = fs.readFileSync('src/pages/CementRegister.jsx', 'utf8');

// The hooks block to replace
const useMemoStart = content.indexOf('  const previewRows = useMemo(() => {');
const useMemoEnd = content.indexOf('  }, [previewRows]);') + '  }, [previewRows]);'.length;

const newHooks = `  const previewRows = useMemo(() => {
    if (!showPreviousScreen) return [];
    return computedRows.filter(r => selectedIds.has(r._id)).map(r => {
      // Use the computed row 'r' so we include any dynamically calculated values like 'Billing Amount'
      let amt = 0;
      if (bulkBillInput.billType === 'Unloading') {
        // For unloading, backend uses EXTRA UNLOADING
        amt = parseFloat(String(r['EXTRA UNLOADING'] || 0).replace(/,/g, '')) || 0;
      } else {
        // For freight, backend cascade is BILLING AMOUNT -> Billing Amount -> BILLING ER 95% -> AMOUNT
        // Since the user explicitly provided examples that match the gross "Billing Amount" (e.g. 27375),
        // we check the computed 'Billing Amount' which applies the formula: fmt2(num(r.BILLING) * num(r.MT))
        amt = parseFloat(String(r['BILLING AMOUNT'] || '').replace(/,/g, '')) ||
              parseFloat(String(r['Billing Amount'] || '').replace(/,/g, '')) ||
              parseFloat(String(r['BILLING ER 95%'] || '').replace(/,/g, '')) ||
              parseFloat(String(r['AMOUNT'] || '').replace(/,/g, '')) || 0;
      }
      return { ...r, _previewAmt: amt };
    });
  }, [showPreviousScreen, selectedIds, computedRows, bulkBillInput.billType]);

  const previewTotals = useMemo(() => {
    let totalMT = 0;
    let totalAmt = 0;
    previewRows.forEach(r => {
      const mt = parseFloat(String(r.MT || 0).replace(/,/g, '')) || 0;
      totalMT += mt;
      totalAmt += r._previewAmt || 0;
    });
    return { totalMT, totalAmt };
  }, [previewRows]);`;

content = content.substring(0, useMemoStart) + newHooks + content.substring(useMemoEnd);
fs.writeFileSync('src/pages/CementRegister.jsx', content);

