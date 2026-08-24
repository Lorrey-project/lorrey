const fs = require('fs');

let content = fs.readFileSync('src/pages/CementRegister.jsx', 'utf8');

// The hooks block to replace
const useMemoStart = content.indexOf('  const previewRows = useMemo(() => {');
const useMemoEnd = content.indexOf('  }, [previewRows, bulkBillInput.billType]);') + '  }, [previewRows, bulkBillInput.billType]);'.length;

const newHooks = `  const previewRows = useMemo(() => {
    if (!showPreviousScreen) return [];
    return computedRows.filter(r => selectedIds.has(r._id)).map(r => {
      const rawRow = entries.find(e => e._id === r._id) || r;
      let amt = 0;
      if (bulkBillInput.billType === 'Unloading') {
        amt = parseFloat(String(rawRow['EXTRA UNLOADING'] || 0).replace(/,/g, '')) || 0;
      } else {
        amt = parseFloat(String(rawRow['BILLING AMOUNT'] || '').replace(/,/g, '')) ||
              parseFloat(String(rawRow['Billing Amount'] || '').replace(/,/g, '')) ||
              parseFloat(String(rawRow['BILLING ER 95%'] || '').replace(/,/g, '')) ||
              parseFloat(String(rawRow['AMOUNT'] || '').replace(/,/g, '')) || 0;
      }
      return { ...r, _previewAmt: amt };
    });
  }, [showPreviousScreen, selectedIds, computedRows, entries, bulkBillInput.billType]);

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


// The JSX block to replace
const jsxTrStart = content.indexOf('                {previewRows.map((r, idx) => {');
const jsxTrEnd = content.indexOf('              </tbody>');

const newJsxTr = `                {previewRows.map((r, idx) => {
                  const amt = r._previewAmt || 0;
                  const mt = parseFloat(String(r.MT || 0).replace(/,/g, '')) || 0;

                  return (
                    <tr
                      key={idx}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        background: idx % 2 === 0 ? '#ffffff' : '#fafafa',
                        transition: 'background 0.15s',
                      }}
                    >
                      <td style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>{r['SHIPMENT NO'] || r['SL NO'] || '—'}</td>
                      <td style={{ padding: '14px 16px', fontSize: '12px', color: '#475569', fontFamily: 'monospace' }}>{r['VEHICLE NUMBER'] || r['VEHICLE'] || '—'}</td>
                      <td style={{ padding: '14px 16px', fontSize: '12px', color: '#334155' }}>{r['INVOICE NO'] || r['Invoice No'] || '—'}</td>
                      <td style={{ padding: '14px 16px', fontSize: '12px', color: '#475569', fontWeight: 600 }}>
                        {r['LOADING DT'] || r['LOADING DATE'] || r['INVOICE DATE'] || '—'}
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '12px', color: '#334155' }}>{r['SITE'] || r['PARTY NAME'] || '—'}</td>
                      <td style={{ padding: '14px 16px', fontSize: '12px', color: '#334155' }}>{r['DESTINATION'] || '—'}</td>
                      <td style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 600, color: '#0f172a', textAlign: 'right' }}>
                        {mt}
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, color: '#15803d', textAlign: 'right' }}>
                        ₹{amt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })}
`;

content = content.substring(0, jsxTrStart) + newJsxTr + content.substring(jsxTrEnd);

fs.writeFileSync('src/pages/CementRegister.jsx', content);

