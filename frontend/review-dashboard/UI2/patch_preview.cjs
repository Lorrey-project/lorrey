const fs = require('fs');

let content = fs.readFileSync('src/pages/CementRegister.jsx', 'utf8');

// Replace generatedBillsPreviewDetails useMemo
const useMemoStart = content.indexOf('const generatedBillsPreviewDetails = useMemo(() => {');
const useMemoEnd = content.indexOf('  }, [showPreviousScreen, generatedBillsPreview, computedRows]);') + '  }, [showPreviousScreen, generatedBillsPreview, computedRows]);'.length;

const newHooks = `  const previewRows = useMemo(() => {
    if (!showPreviousScreen) return [];
    return computedRows.filter(r => selectedIds.has(r._id));
  }, [showPreviousScreen, selectedIds, computedRows]);

  const previewTotals = useMemo(() => {
    let totalMT = 0;
    let totalAmt = 0;
    previewRows.forEach(r => {
      const mt = parseFloat(String(r.MT || 0).replace(/,/g, '')) || 0;
      
      let amt = 0;
      if (bulkBillInput.billType === 'Unloading') {
        amt = parseFloat(String(r['EXTRA UNLOADING'] || 0).replace(/,/g, '')) || 0;
      } else {
        let billAmtStr = r['Billing Amount'] || r['BILLING AMOUNT'] || r['BILLING ER 95%'] || r['BILLING @ 95% (PARTY PAYABLE)'] || r['AMOUNT'];
        amt = parseFloat(String(billAmtStr || 0).replace(/,/g, '')) || 0;
      }
      
      totalMT += mt;
      totalAmt += amt;
    });
    return { totalMT, totalAmt };
  }, [previewRows, bulkBillInput.billType]);`;

content = content.substring(0, useMemoStart) + newHooks + content.substring(useMemoEnd);


// Replace JSX for showPreviousScreen
const jsxStart = content.indexOf('  if (showPreviousScreen) {');
const jsxEnd = content.indexOf('  return (\n    <Box sx={{ height: \'100vh\', display: \'flex\'');

const newJsx = `  if (showPreviousScreen) {
    return (
      <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 3, height: '100vh', bgcolor: '#f1f5f9', overflow: 'hidden' }}>
        {/* Header */}
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box display="flex" alignItems="center" gap={2}>
            <Button
              variant="contained"
              onClick={() => {
                setShowPreviousScreen(false);
                setIsBillingModalOpen(true);
              }}
              sx={{
                bgcolor: '#ffffff', color: '#334155', border: '1px solid #cbd5e1', boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                fontWeight: 600, px: 2.5, py: 1, borderRadius: '8px', textTransform: 'none',
                '&:hover': { bgcolor: '#f8fafc', borderColor: '#94a3b8' }
              }}
            >
              ← Previous
            </Button>
            <Box>
              <Typography variant="h5" fontWeight={800} color="#0f172a" sx={{ letterSpacing: '-0.5px' }}>
                Preview Selected Shipments
              </Typography>
              <Typography variant="body2" color="#64748b" fontWeight={500}>
                Please review the selected {previewRows.length} shipment(s) before final bill generation.
              </Typography>
            </Box>
          </Box>
          <Button
            variant="contained"
            color="primary"
            onClick={handleFinalGenerateBatchBill}
            sx={{
              bgcolor: '#0f172a', color: '#fff', fontWeight: 700, px: 4, py: 1.5, borderRadius: '8px', textTransform: 'none',
              boxShadow: '0 4px 12px rgba(15, 23, 42, 0.3)',
              '&:hover': { bgcolor: '#1e293b' }
            }}
          >
            FINAL BILL GENERATE
          </Button>
        </Box>

        {/* Table Container */}
        <Box sx={{
          flex: 1, bgcolor: '#ffffff', borderRadius: '12px', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 4px 20px rgba(0,0,0,0.03), 0 1px 3px rgba(0,0,0,0.02)',
          border: '1px solid #e2e8f0'
        }}>
          <Box sx={{ overflowX: 'auto', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1000px' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                <tr>
                  {['Shipment Number', 'Vehicle Number', 'Invoice Number', 'Trip Date', 'Party Name', 'Destination', 'MT', 'BILLING AMOUNT'].map((h, i) => (
                    <th key={h} style={{
                      padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
                      textAlign: i >= 6 ? 'right' : 'left',
                      fontSize: '11.5px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px'
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r, idx) => {
                  let amtStr = r['Billing Amount'] || r['BILLING AMOUNT'] || r['BILLING ER 95%'] || r['BILLING @ 95% (PARTY PAYABLE)'] || r['AMOUNT'];
                  let amt = parseFloat(String(amtStr || 0).replace(/,/g, '')) || 0;
                  if (bulkBillInput.billType === 'Unloading') {
                    amt = parseFloat(String(r['EXTRA UNLOADING'] || 0).replace(/,/g, '')) || 0;
                  }
                  
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
              </tbody>
            </table>
          </Box>
          
          {/* Summary Area */}
          <Box sx={{ 
            p: 3, 
            borderTop: '1px solid #e2e8f0', 
            bgcolor: '#f8fafc',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}>
            <Box>
              <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Shipments</Typography>
              <Typography variant="h6" sx={{ color: '#0f172a', fontWeight: 800 }}>{previewRows.length}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total MT</Typography>
              <Typography variant="h6" sx={{ color: '#0f172a', fontWeight: 800 }}>{Math.round(previewTotals.totalMT * 100) / 100} MT</Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Billing Amount</Typography>
              <Typography variant="h6" sx={{ color: '#15803d', fontWeight: 800 }}>₹{previewTotals.totalAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Typography>
            </Box>
          </Box>
        </Box>
      </Box>
    );
  }

`;

content = content.substring(0, jsxStart) + newJsx + content.substring(jsxEnd);

fs.writeFileSync('src/pages/CementRegister.jsx', content);

