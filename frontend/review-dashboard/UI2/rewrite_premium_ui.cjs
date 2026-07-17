const fs = require('fs');

const path = '/Users/soumodeeproy/Desktop/lorrey-project-code 2/frontend/review-dashboard/UI2/src/pages/FinancialYearDetails.jsx';
let code = fs.readFileSync(path, 'utf8');

// Ensure PrintIcon and ViewColumnIcon are imported
if (!code.includes('import PrintIcon')) {
  code = code.replace(/import SearchIcon from '@mui\/icons-material\/Search';/, `import SearchIcon from '@mui/icons-material/Search';\nimport PrintIcon from '@mui/icons-material/Print';\nimport ViewColumnIcon from '@mui/icons-material/ViewColumn';`);
}

const renderRowStart = code.indexOf('const renderRow = (r, ri) => {');
const returnStart = code.indexOf('return (', code.indexOf('const paidBills'));

if (renderRowStart === -1 || returnStart === -1) {
  console.log("Could not find start markers");
  process.exit(1);
}

const newRenderRow = `const renderRow = (r, ri) => {
    // Intelligent Color Coding Logic
    const isPaid = num(r.paymentAmount) >= num(r.receivable) && num(r.receivable) > 0;
    const isPartiallyPaid = num(r.paymentAmount) > 0 && num(r.paymentAmount) < num(r.receivable);
    const isPending = num(r.paymentAmount) === 0 && num(r.receivable) > 0;
    
    // Status color block
    let statusBg = 'transparent';
    if (isPaid) statusBg = '#dcfce7'; // Soft Green
    else if (isPartiallyPaid) statusBg = '#ffedd5'; // Soft Orange
    else if (isPending) statusBg = '#fef9c3'; // Soft Yellow
    
    const isLocked = r.isLocked;
    const rowBg = isLocked ? '#f8fafc' : (ri % 2 === 0 ? '#ffffff' : '#fafafa'); // Zebra + Locked
    const opacity = isLocked ? 0.6 : 1;

    // Cell Backgrounds
    const autoFetchedBg = '#e0f2fe'; // Light Sky Blue
    const calculatedBg = '#dcfce7'; // Light Green
    const financialBg = '#e0e7ff'; // Soft Blue highlight for important amounts

    return (
      <React.Fragment key={ri}>
        <tr style={{ background: rowBg, opacity, borderBottom: '1px solid #f1f5f9', transition: 'background-color 0.2s', '&:hover': { background: '#f1f5f9' } }}>
          <td style={{ ...tdStyle({ minWidth: 50, position: 'sticky', left: 0, zIndex: 11, background: rowBg }), borderRight: '1px solid #e2e8f0' }}>{page * PAGE_SIZE + ri + 1}</td>
          <td style={{ ...tdStyle({ minWidth: 50, position: 'sticky', left: 50, zIndex: 11, background: rowBg }), borderRight: '1px solid #e2e8f0', textAlign: 'center' }}>
            <input type="checkbox"
              checked={selectedIds.includes(r.invoiceNumber)} 
              onChange={() => handleSelectRow(r.invoiceNumber)}
              style={{ cursor: 'pointer', width: 14, height: 14, accentColor: '#3b82f6' }}
            />
          </td>
          <td style={{ ...tdStyle({ minWidth: 170, position: 'sticky', left: 100, zIndex: 11, background: rowBg, fontWeight: 700 }), borderRight: '1px solid #e2e8f0' }}>{r.invoiceNumber}</td>
          <td style={{ ...tdStyle({ minWidth: 120, background: autoFetchedBg, fontWeight: 600, color: '#0f172a' }) }}>{r.invoiceDate}</td>
          <td style={{ ...tdStyle({ minWidth: 150, background: autoFetchedBg, color: '#334155' }) }}>{r.shipmentNumber}</td>
          <td style={{ ...tdStyle({ minWidth: 220, color: '#475569' }) }}>{r.partyName}</td>
          <td style={{ ...tdStyle({ minWidth: 140, fontWeight: 600, color: '#0f172a' }) }}>{r.site}</td>
          <td style={{ ...tdStyle({ minWidth: 160 }) }}>
            <select value={r.billType || ''} onChange={(e) => handleRowEdit(r.invoiceNumber, 'billType', e.target.value)} style={selStyle}>
              <option value="">-</option>
              {BILL_TYPES.map(bt => <option key={bt} value={bt}>{bt}</option>)}
            </select>
          </td>
          <td style={{ ...tdStyle({ minWidth: 100 }) }}>
            <input type="number" value={r.amount || ''} onChange={(e) => handleRowEdit(r.invoiceNumber, 'amount', e.target.value)} style={iStyle} />
          </td>
          <td style={{ ...tdStyle({ minWidth: 80 }) }}>
            <input type="number" value={r.cgst || ''} onChange={(e) => handleRowEdit(r.invoiceNumber, 'cgst', e.target.value)} style={iStyle} />
          </td>
          <td style={{ ...tdStyle({ minWidth: 80 }) }}>
            <input type="number" value={r.sgst || ''} onChange={(e) => handleRowEdit(r.invoiceNumber, 'sgst', e.target.value)} style={iStyle} />
          </td>
          <td style={{ ...tdStyle({ minWidth: 110, background: calculatedBg, fontWeight: 700, color: '#166534' }) }}>
            {r.totalAmount || 0}
          </td>
          <td style={{ ...tdStyle({ minWidth: 90 }) }}>
            <input type="number" value={r.tdsRate || ''} onChange={(e) => handleRowEdit(r.invoiceNumber, 'tdsRate', e.target.value)} style={iStyle} />
          </td>
          <td style={{ ...tdStyle({ minWidth: 130, background: financialBg, fontWeight: 800, color: '#1e40af' }) }}>
            {r.receivable || 0}
          </td>
          <td style={{ ...tdStyle({ minWidth: 150, background: statusBg, fontWeight: 700 }) }}>
            {r.paymentAmount || 0}
          </td>
          <td style={{ ...tdStyle({ minWidth: 100 }) }}>
            {r.tdsProvision || 0}
          </td>
          <td style={{ ...tdStyle({ minWidth: 100, background: calculatedBg, color: num(r.difference) > 0 ? '#ea580c' : '#059669', fontWeight: 700 }) }}>
            {r.difference || 0}
          </td>
          <td style={{ ...tdStyle({ minWidth: 130 }) }}>
            {r.paymentDate ? formatDateForInput(r.paymentDate) : ''}
          </td>
          <td style={{ ...tdStyle({ minWidth: 100, color: '#475569' }) }}>
            {r.referenceNo || ''}
          </td>
          <td style={{ ...tdStyle({ minWidth: 110, color: '#dc2626', fontWeight: 600 }) }}>
            {r.debitAmount || 0}
          </td>
          <td style={{ ...tdStyle({ minWidth: 240, color: '#475569', fontSize: 11 }) }}>
            {r.debitReasons || ''}
          </td>
          <td style={{ ...tdStyle({ minWidth: 350, color: '#64748b', fontSize: 11, borderRight: 'none' }) }}>
            {r.remarks || ''}
          </td>
        </tr>
      </React.Fragment>
    );
  };`;

const newReturnUI = `  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#f8fafc', fontFamily: 'Inter, sans-serif', overflow: 'hidden' }}>
      
      {/* 1. Premium Header with Gradient */}
      <Box sx={{ 
        px: { xs: 2, md: 4 }, py: 2, 
        background: 'linear-gradient(135deg, #ffffff 0%, #f1f5f9 100%)', 
        borderBottom: '1px solid #e2e8f0',
        display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap',
        boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
      }}>
        <IconButton onClick={onBack} size="small" sx={{ border: '1px solid #cbd5e1', bgcolor: '#fff', '&:hover': { bgcolor: '#f1f5f9' }, p: 1, borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <ArrowBackIcon fontSize="small" sx={{ color: '#334155' }} />
        </IconButton>
        
        <Box flex={1}>
          <Typography variant="h5" fontWeight={900} sx={{ color: '#0f172a', letterSpacing: '-0.02em', mb: 0.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{ width: 6, height: 26, background: 'linear-gradient(180deg, #3b82f6 0%, #1d4ed8 100%)', borderRadius: 4 }} />
            Bill Register
          </Typography>
          <Box sx={{ display: 'flex', gap: 3, alignItems: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', px: 1.5, py: 0.5, boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)' }}>
              <Typography variant="caption" sx={{ color: '#64748b', mr: 1, fontWeight: 700 }}>FINANCIAL YEAR</Typography>
              <select
                value={selYear}
                onChange={e => setSelYear(e.target.value)}
                style={{
                  border: 'none', outline: 'none', background: 'transparent',
                  fontWeight: 800, color: '#0f172a', cursor: 'pointer',
                  fontFamily: 'Inter, sans-serif', fontSize: '13px',
                }}
              >
                {FY_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </Box>
            <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600 }}>Last Updated: Just now</Typography>
          </Box>
        </Box>
      </Box>

      {/* 2. KPI Dashboard */}
      <Box sx={{ px: { xs: 2, md: 4 }, pt: 3, pb: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 2 }}>
        {[
          { label: 'Total Bills', value: totalBills, accent: '#64748b' },
          { label: 'Freight Bills', value: freightBills, accent: '#8b5cf6' },
          { label: 'Unloading Bills', value: unloadingBills, accent: '#f59e0b' },
          { label: 'Total Amount', value: \`₹\${totalBillAmount.toLocaleString('en-IN')}\`, accent: '#0284c7' },
          { label: 'Paid Amount', value: \`₹\${totalPaidAmount.toLocaleString('en-IN')}\`, accent: '#16a34a' },
          { label: 'Due Amount', value: \`₹\${totalDueAmount.toLocaleString('en-IN')}\`, accent: '#ea580c' },
          { label: 'Pending Bills', value: pendingBills, accent: '#eab308' },
          { label: 'Paid Bills', value: paidBills, accent: '#22c55e' },
        ].map((c, i) => (
          <Box key={i} sx={{ 
            bgcolor: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(10px)',
            p: 2.5, borderRadius: '16px', border: '1px solid rgba(226, 232, 240, 0.8)', 
            boxShadow: '0 4px 15px rgba(0,0,0,0.03)', position: 'relative', overflow: 'hidden',
            transition: 'transform 0.2s', '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 8px 20px rgba(0,0,0,0.05)' }
          }}>
            <Box sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', bgcolor: c.accent }} />
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{c.label}</Typography>
            <Typography variant="h6" sx={{ color: '#0f172a', fontWeight: 900, mt: 0.5, lineHeight: 1.2 }}>{c.value}</Typography>
          </Box>
        ))}
      </Box>

      {/* 3. Professional Toolbar */}
      <Box sx={{ px: { xs: 2, md: 4 }, py: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        
        {/* Site Filter Tabs */}
        <Box sx={{ display: 'flex', bgcolor: '#fff', borderRadius: '12px', p: 0.5, border: '1px solid #e2e8f0', boxShadow: '0 2px 5px rgba(0,0,0,0.02)' }}>
          {['All', 'NVCL', 'NVL'].map(tab => (
            <Box component="button" key={tab} onClick={() => handleSiteFilter(tab)}
              sx={{ border: 'none', cursor: 'pointer', borderRadius: '8px', py: 0.75, px: 2, fontWeight: 700, fontSize: 13, background: siteFilter === tab ? '#0f172a' : 'transparent', color: siteFilter === tab ? '#fff' : '#64748b', transition: 'all 0.2s' }}>
              {tab} <Typography component="span" sx={{ fontSize: 10, opacity: 0.8, ml: 0.5 }}>
                ({tab === 'All' ? computedRows.length : tab === 'NVL' ? computedRows.filter(r => isNVL(r.site)).length : computedRows.filter(r => isNVCL(r.site)).length})
              </Typography>
            </Box>
          ))}
        </Box>

        {/* Global Search */}
        <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', p: 0.5, boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.02)', flex: 1, minWidth: '200px', maxWidth: '350px' }}>
          <Box sx={{ color: '#94a3b8', pl: 1 }}><SearchIcon fontSize="small" /></Box>
          <input
            placeholder="Search invoice, party, vehicle..."
            value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
            style={{ border: 'none', outline: 'none', width: '100%', padding: '8px 12px', fontSize: 13, fontWeight: 600, color: '#0f172a' }}
          />
        </Box>

        <Box sx={{ flex: 1 }} />

        {/* Action Buttons */}
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
           <Button variant="outlined" size="small" onClick={handleAddRow} sx={{ fontWeight: 700, borderRadius: '10px', borderColor: '#cbd5e1', color: '#475569', textTransform: 'none', '&:hover': { bgcolor: '#f1f5f9', borderColor: '#94a3b8' } }}>
             + Add Row
           </Button>
           <Button variant="outlined" size="small" onClick={() => setDocModalOpen(true)} sx={{ fontWeight: 700, borderRadius: '10px', borderColor: '#cbd5e1', color: '#475569', textTransform: 'none', '&:hover': { bgcolor: '#f1f5f9', borderColor: '#94a3b8' } }}>
             PDF Docs ({pageDocuments.length})
           </Button>
           {selectedIds.length > 0 && (
             <Button variant="contained" size="small" onClick={openPaymentModal}
               sx={{ fontWeight: 700, borderRadius: '10px', bgcolor: '#3b82f6', color: '#fff', textTransform: 'none', boxShadow: '0 4px 10px rgba(59,130,246,0.3)', '&:hover': { bgcolor: '#2563eb' } }}>
               Group Payment
             </Button>
           )}
           <Tooltip title="Print Register">
             <IconButton onClick={() => window.print()} size="small" sx={{ border: '1px solid #cbd5e1', borderRadius: '10px', color: '#475569', bgcolor: '#fff', '&:hover': { bgcolor: '#f1f5f9' } }}><PrintIcon fontSize="small" /></IconButton>
           </Tooltip>
           <Tooltip title="Column Visibility (Coming Soon)">
             <IconButton size="small" sx={{ border: '1px solid #cbd5e1', borderRadius: '10px', color: '#475569', bgcolor: '#fff', '&:hover': { bgcolor: '#f1f5f9' } }}><ViewColumnIcon fontSize="small" /></IconButton>
           </Tooltip>
           <Tooltip title="Export to CSV">
             <IconButton onClick={handleExport} size="small" sx={{ border: '1px solid #cbd5e1', borderRadius: '10px', color: '#475569', bgcolor: '#fff', '&:hover': { bgcolor: '#f1f5f9' } }}><DownloadIcon fontSize="small" /></IconButton>
           </Tooltip>
           <Tooltip title="Refresh Data">
             <IconButton onClick={fetchData} size="small" sx={{ border: '1px solid #cbd5e1', borderRadius: '10px', color: '#475569', bgcolor: '#fff', '&:hover': { bgcolor: '#f1f5f9' } }}><RefreshIcon fontSize="small" /></IconButton>
           </Tooltip>
           
           <Button variant="contained" size="small"
             startIcon={loading ? <CircularProgress size={13} color="inherit" /> : <SaveIcon />}
             onClick={saveAllChanges} disabled={(dirtyRows.size === 0 && dirtyGroups.size === 0) || loading}
             sx={{ fontWeight: 800, borderRadius: '10px', px: 3, background: (dirtyRows.size > 0 || dirtyGroups.size > 0) ? '#10b981' : '#f1f5f9', color: (dirtyRows.size > 0 || dirtyGroups.size > 0) ? '#fff' : '#94a3b8', boxShadow: (dirtyRows.size > 0 || dirtyGroups.size > 0) ? '0 4px 10px rgba(16,185,129,0.3)' : 'none', '&:disabled': { color: '#94a3b8', background: '#e2e8f0' }, textTransform: 'none', '&:hover': { bgcolor: '#059669' } }}>
             {loading ? 'Saving...' : \`Save Changes (\${dirtyRows.size + dirtyGroups.size})\`}
           </Button>
        </Box>
      </Box>

      {/* 4. Professional Table */}
      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', px: { xs: 1, md: 4 }, pb: { xs: 1, md: 3 } }}>
        <Box sx={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: '16px', overflow: 'auto', bgcolor: '#fff', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)' }}>
          <table style={{ borderCollapse: 'collapse', whiteSpace: 'nowrap', fontFamily: 'Inter,sans-serif', fontSize: 13, width: 'max-content', minWidth: '100%' }}>
              <thead>
                <tr>
                  <th style={thStyle({ minWidth: 50, position: 'sticky', left: 0, zIndex: 12, borderRight: '1px solid #334155', background: '#0f172a' })}>Sl No</th>
                  <th style={thStyle({ minWidth: 50, position: 'sticky', left: 50, zIndex: 12, borderRight: '1px solid #334155', background: '#0f172a' })}>Select</th>
                  <th style={thStyle({ minWidth: 170, position: 'sticky', left: 100, zIndex: 12, borderRight: '1px solid #334155', background: '#0f172a' })}>Invoice Number</th>
                  <th style={thStyle({ minWidth: 120, background: '#1e293b' })}>Invoice Date</th>
                  <th style={thStyle({ minWidth: 150, background: '#1e293b' })}>Shipment Number</th>
                  <th style={thStyle({ minWidth: 220, background: '#1e293b' })}>Month</th>
                  <th style={thStyle({ minWidth: 140, background: '#1e293b' })}>SITE</th>
                  <th style={thStyle({ minWidth: 160, background: '#1e293b' })}>BILL</th>
                  <th style={thStyle({ minWidth: 100, background: '#1e293b' })}>Amount</th>
                  <th style={thStyle({ minWidth: 80, background: '#9a3412' })}>CGST</th>
                  <th style={thStyle({ minWidth: 80, background: '#9a3412' })}>SGST</th>
                  <th style={thStyle({ minWidth: 110, background: '#3730a3' })}>Total Amount</th>
                  <th style={thStyle({ minWidth: 90, background: '#0e7490' })}>TDS @2%</th>
                  <th style={thStyle({ minWidth: 130, background: '#166534' })}>Receivable</th>
                  <th style={thStyle({ minWidth: 150, background: '#6b21a8' })}>Payment Amount<br/>(Paid)</th>
                  <th style={thStyle({ minWidth: 100, background: '#6b21a8' })}>TDS Provision</th>
                  <th style={thStyle({ minWidth: 100, background: '#6b21a8' })}>Difference</th>
                  <th style={thStyle({ minWidth: 130, background: '#6b21a8' })}>Payment Date</th>
                  <th style={thStyle({ minWidth: 100, background: '#6b21a8' })}>Reference No</th>
                  <th style={thStyle({ minWidth: 110, background: '#6b21a8' })}>Debit Amount</th>
                  <th style={thStyle({ minWidth: 240, background: '#1e293b' })}>Debit Reasons(Deduction)</th>
                  <th style={thStyle({ minWidth: 350, background: '#1e293b', borderRight: 'none' })}>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r, ri) => renderRow(r, ri))}
              </tbody>
            </table>
          </Box>
      </Box>

      {/* Pagination */}
      {totalPages > 1 && (
        <Box sx={{ px: { xs: 2, md: 4 }, py: 1.5, bgcolor: '#ffffff', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 2, alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 -2px 10px rgba(0,0,0,0.02)' }}>
          <Typography variant="body2" sx={{ color: '#64748b', fontWeight: 600 }}>
            Showing {page * PAGE_SIZE + 1} – {Math.min((page + 1) * PAGE_SIZE, filteredRows.length)} of {filteredRows.length} records
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button size="small" variant="outlined" disabled={page === 0} onClick={() => setPage(p => p - 1)} sx={{ borderRadius: '8px', fontWeight: 700, textTransform: 'none', borderColor: '#cbd5e1', color: '#475569' }}>Previous</Button>
            <Button size="small" variant="outlined" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} sx={{ borderRadius: '8px', fontWeight: 700, textTransform: 'none', borderColor: '#cbd5e1', color: '#475569' }}>Next</Button>
          </Box>
        </Box>
      )}`;

// We need to extract the renderRow function and replace it.
const renderRowEnd = code.indexOf('const isNVL = useCallback(', renderRowStart);
if (renderRowEnd === -1) {
  console.log("Could not find end of renderRow");
  process.exit(1);
}

// Extract modals at the end of the file.
const returnEnd = code.indexOf('{/* Payment Modal */}', returnStart);
let beforeRenderRow = code.substring(0, renderRowStart);
let betweenRenderAndReturn = code.substring(renderRowEnd, returnStart);
let afterReturn = code.substring(returnEnd);

fs.writeFileSync(path, beforeRenderRow + newRenderRow + '\n\n  ' + betweenRenderAndReturn + newReturnUI + '\n\n      ' + afterReturn);
console.log("Rewrite complete!");
