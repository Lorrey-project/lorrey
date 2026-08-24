const fs = require('fs');

let content = fs.readFileSync('src/pages/CementRegister.jsx', 'utf8');

// 1. Update previewRows to not require showPreviousScreen
const oldHooks = `  const previewRows = useMemo(() => {
    if (!showPreviousScreen) return [];
    return computedRows.filter(r => selectedIds.has(r._id)).map(r => {`;

const newHooks = `  const previewRows = useMemo(() => {
    if (selectedIds.size === 0) return [];
    return computedRows.filter(r => selectedIds.has(r._id)).map(r => {`;

content = content.replace(oldHooks, newHooks);

// 2. Update Billing Confirmation Modal Table
const oldModalTable = `              <tbody>
                {[...selectedIds].map(id => {
                  const row = computedRows.find(r => r._id === id);
                  if (!row) return null;
                  return (
                    <tr key={id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '8px', borderRight: '1px solid #e2e8f0' }}>{row['SHIPMENT NO'] || ''}</td>
                      <td style={{ padding: '8px', borderRight: '1px solid #e2e8f0' }}>{row['VEHICLE NUMBER'] || ''}</td>
                      <td style={{ padding: '8px', borderRight: '1px solid #e2e8f0' }}>{row['INVOICE NO'] || ''}</td>
                      <td style={{ padding: '8px', borderRight: '1px solid #e2e8f0' }}>{row['LOADING DT'] || row['LOADING DATE'] || ''}</td>
                      <td style={{ padding: '8px', borderRight: '1px solid #e2e8f0' }}>{row['PARTY NAME'] || ''}</td>
                      <td style={{ padding: '8px', borderRight: '1px solid #e2e8f0' }}>{row['DESTINATION'] || ''}</td>
                      <td style={{ padding: '8px', borderRight: '1px solid #e2e8f0' }}>{row['MT'] || ''}</td>
                      <td style={{ padding: '8px' }}>{row['Billing Amount'] || ''}</td>
                    </tr>
                  );
                })}
              </tbody>`;

const newModalTable = `              <tbody>
                {previewRows.map((row) => {
                  const amt = row._previewAmt || 0;
                  return (
                    <tr key={row._id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '8px', borderRight: '1px solid #e2e8f0' }}>{row['SHIPMENT NO'] || row['SL NO'] || ''}</td>
                      <td style={{ padding: '8px', borderRight: '1px solid #e2e8f0' }}>{row['VEHICLE NUMBER'] || row['VEHICLE'] || ''}</td>
                      <td style={{ padding: '8px', borderRight: '1px solid #e2e8f0' }}>{row['INVOICE NO'] || row['Invoice No'] || ''}</td>
                      <td style={{ padding: '8px', borderRight: '1px solid #e2e8f0' }}>{row['LOADING DT'] || row['LOADING DATE'] || row['INVOICE DATE'] || ''}</td>
                      <td style={{ padding: '8px', borderRight: '1px solid #e2e8f0' }}>{row['SITE'] || row['PARTY NAME'] || ''}</td>
                      <td style={{ padding: '8px', borderRight: '1px solid #e2e8f0' }}>{row['DESTINATION'] || ''}</td>
                      <td style={{ padding: '8px', borderRight: '1px solid #e2e8f0' }}>{row['MT'] || ''}</td>
                      <td style={{ padding: '8px' }}>
                        {amt > 0 ? \`₹\${amt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\` : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>`;

content = content.replace(oldModalTable, newModalTable);

// 3. Update Preview Selected Shipments Screen Header
const oldPreviewHeader = `          <Box sx={{ mb: 4 }}>
            <Button
              variant="outlined"
              onClick={() => {
                setShowPreviousScreen(false);
                setIsBillingModalOpen(true);
              }}
              sx={{ mb: 3, textTransform: 'none', fontWeight: 600, color: '#475569', borderColor: '#cbd5e1' }}
            >
              &larr; Previous
            </Button>
            <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a', mb: 0.5 }}>
              Preview Selected Shipments
            </Typography>
            <Typography variant="body2" sx={{ color: '#475569' }}>
              Please review the selected {selectedIds.size} shipment(s) before final bill generation.
            </Typography>
          </Box>

          <Box sx={{
            border: '1px solid #e2e8f0',`;

const newPreviewHeader = `          <Box sx={{ mb: 4 }}>
            <Button
              variant="outlined"
              onClick={() => {
                setShowPreviousScreen(false);
                setIsBillingModalOpen(true);
              }}
              sx={{ mb: 3, textTransform: 'none', fontWeight: 600, color: '#475569', borderColor: '#cbd5e1' }}
            >
              &larr; Previous
            </Button>
            
            <Box sx={{ p: 3, bgcolor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <Typography variant="h6" sx={{ fontWeight: 800, color: '#0f172a', mb: 1 }}>
                Preview Selected Shipments
              </Typography>
              <Typography variant="body2" sx={{ color: '#475569', mb: 3 }}>
                Final verification before bill generation
              </Typography>

              <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <Box>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: '#64748b', mb: 0.5, display: 'block', textTransform: 'uppercase' }}>BILL TYPE</Typography>
                  <Box sx={{ px: 2, py: 1, bgcolor: '#e0e7ff', color: '#4338ca', borderRadius: '6px', fontWeight: 800, display: 'inline-block' }}>
                    {bulkBillInput.billType ? \`\${bulkBillInput.billType} Bill\` : 'Not Selected'}
                  </Box>
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: '#64748b', mb: 0.5, display: 'block', textTransform: 'uppercase' }}>BILL DATE</Typography>
                  <Box sx={{ px: 2, py: 1, bgcolor: '#f1f5f9', color: '#334155', borderRadius: '6px', fontWeight: 700, display: 'inline-block' }}>
                    {bulkBillInput.billDate ? new Date(bulkBillInput.billDate).toLocaleDateString('en-GB') : 'Not Set'}
                  </Box>
                </Box>
              </Box>
            </Box>
          </Box>

          <Box sx={{
            border: '1px solid #e2e8f0',`;

content = content.replace(oldPreviewHeader, newPreviewHeader);

fs.writeFileSync('src/pages/CementRegister.jsx', content);

