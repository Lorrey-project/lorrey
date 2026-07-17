const fs = require('fs');
const path = '/Users/soumodeeproy/Desktop/lorrey-project-code 2/frontend/review-dashboard/UI2/src/pages/FinancialYearDetails.jsx';

let content = fs.readFileSync(path, 'utf8');

const replacement = `
  // --- Dashboard Metrics Calculation ---
  const totalBills = computedRows.length;
  const freightBills = computedRows.filter(r => String(r.billType).toUpperCase() === 'FREIGHT').length;
  const unloadingBills = computedRows.filter(r => String(r.billType).toUpperCase() === 'UNLOADING').length;
  const totalBillAmount = computedRows.reduce((sum, r) => sum + num(r.totalAmount), 0);
  const totalPaidAmount = computedRows.reduce((sum, r) => sum + num(r.paymentAmount), 0);
  const totalDueAmount = totalBillAmount - totalPaidAmount;
  const pendingBills = computedRows.filter(r => num(r.paymentAmount) < num(r.receivable)).length;
  const paidBills = computedRows.filter(r => num(r.paymentAmount) >= num(r.receivable) && num(r.receivable) > 0).length;

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#f4f7f9', fontFamily: 'Inter, sans-serif' }}>
      
      {/* 1. Premium Header */}
      <Box sx={{ 
        p: { xs: 2, md: 3 }, 
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', 
        color: '#fff', 
        display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap',
        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' 
      }}>
        <IconButton onClick={onBack} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.1)', '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' } }}>
          <ArrowBackIcon fontSize="small" sx={{ color: '#fff' }} />
        </IconButton>
        
        <Box flex={1}>
          <Typography variant="h5" fontWeight={800} sx={{ letterSpacing: '-0.02em', mb: 0.5 }}>
            Bill Register
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: 'rgba(255,255,255,0.1)', borderRadius: 1.5, px: 1.5, py: 0.5 }}>
              <Typography variant="caption" sx={{ color: '#94a3b8', mr: 1, fontWeight: 600 }}>FY</Typography>
              <SearchableSelect variant="standard"
                value={selYear}
                onChange={e => setSelYear(e.target.value)}
                style={{
                  border: 'none', outline: 'none', background: 'transparent',
                  fontWeight: 700, color: '#fff', cursor: 'pointer',
                  fontFamily: 'Inter, sans-serif', fontSize: '13px'
                }}
              >
                {FY_OPTIONS.map(y => <option key={y} value={y} style={{ color: '#000' }}>{y.replace('20', '')}</option>)}
              </SearchableSelect>
            </Box>
            <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600 }}>Last Updated: Just now</Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
           <Button variant="contained" size="small" onClick={() => setDashboardOpen(true)}
             sx={{ fontWeight: 800, borderRadius: 2, px: 3, background: 'linear-gradient(135deg, #3b82f6, #2563eb)', textTransform: 'none' }}>
             💳 Payment Status Dashboard
           </Button>
           <Button variant="contained" size="small"
             startIcon={loading ? <CircularProgress size={13} color="inherit" /> : <SaveIcon />}
             onClick={saveAllChanges} disabled={(dirtyRows.size === 0 && dirtyGroups.size === 0) || loading}
             sx={{ fontWeight: 800, borderRadius: 2, px: 3, background: (dirtyRows.size > 0 || dirtyGroups.size > 0) ? 'linear-gradient(135deg, #10b981, #059669)' : 'rgba(255,255,255,0.1)', color: '#fff', '&:disabled': { color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.05)' }, textTransform: 'none' }}>
             {loading ? 'Saving...' : \`Save Details (\${dirtyRows.size + dirtyGroups.size})\`}
           </Button>
        </Box>
      </Box>

      {/* 2. Summary Dashboard Cards */}
      <Box sx={{ px: { xs: 2, md: 3 }, pt: 3, pb: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 2 }}>
        {[
          { label: 'Total Bills', value: totalBills, color: '#475569', bg: '#f8fafc' },
          { label: 'Total Freight', value: freightBills, color: '#475569', bg: '#f8fafc' },
          { label: 'Total Unloading', value: unloadingBills, color: '#475569', bg: '#f8fafc' },
          { label: 'Total Bill Amount', value: \`₹\${totalBillAmount.toLocaleString('en-IN')}\`, color: '#0284c7', bg: '#f0f9ff' },
          { label: 'Total Paid', value: \`₹\${totalPaidAmount.toLocaleString('en-IN')}\`, color: '#16a34a', bg: '#f0fdf4' },
          { label: 'Total Due', value: \`₹\${totalDueAmount.toLocaleString('en-IN')}\`, color: '#ea580c', bg: '#fff7ed' },
          { label: 'Pending Bills', value: pendingBills, color: '#dc2626', bg: '#fef2f2' },
          { label: 'Paid Bills', value: paidBills, color: '#059669', bg: '#ecfdf5' },
        ].map((c, i) => (
          <Box key={i} sx={{ bgcolor: c.bg, p: 2, borderRadius: 3, border: \`1px solid \${c.bg.replace('f', 'e')}\`, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.label}</Typography>
            <Typography variant="h6" sx={{ color: c.color, fontWeight: 900, mt: 0.5, lineHeight: 1 }}>{c.value}</Typography>
          </Box>
        ))}
      </Box>

      {/* 3. Modern Toolbar & Quick Filters */}
      <Box sx={{ px: { xs: 2, md: 3 }, py: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid #e2e8f0', position: 'sticky', zIndex: 10 }}>
        
        {/* Month Filter */}
        <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: '#fff', border: '1px solid #e2e8f0', borderRadius: 2, p: 0.5, boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
          <SearchableSelect variant="standard" value={selectedMonth} onChange={e => { setSelectedMonth(e.target.value); setPage(0); }}
            style={{ border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, padding: '6px 12px', background: 'transparent', color: '#334155', outline: 'none' }}>
            <option value="All">All Months</option>
            {MONTHS_LIST.map(m => <option key={m.value} value={String(m.value)}>{m.label}</option>)}
          </SearchableSelect>
        </Box>

        {/* Site Filter Tabs */}
        <Box sx={{ display: 'flex', bgcolor: '#f1f5f9', borderRadius: 2, p: 0.5 }}>
          {['All', 'NVCL', 'NVL'].map(tab => (
            <Box component="button" key={tab} onClick={() => handleSiteFilter(tab)}
              sx={{ border: 'none', cursor: 'pointer', borderRadius: 1.5, py: 0.75, px: 2, fontWeight: 700, fontSize: 13, background: siteFilter === tab ? '#fff' : 'transparent', color: siteFilter === tab ? '#0f172a' : '#64748b', boxShadow: siteFilter === tab ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s' }}>
              {tab} <Typography component="span" sx={{ fontSize: 10, opacity: 0.6, ml: 0.5 }}>
                ({tab === 'All' ? computedRows.length : tab === 'NVL' ? computedRows.filter(r => isNVL(r.site)).length : computedRows.filter(r => isNVCL(r.site)).length})
              </Typography>
            </Box>
          ))}
        </Box>

        <Box sx={{ flex: 1 }} />

        {/* Action Buttons */}
        <Box sx={{ display: 'flex', gap: 1 }}>
           <Button variant="outlined" size="small" onClick={handleAddRow} sx={{ fontWeight: 700, borderRadius: 2, borderColor: '#cbd5e1', color: '#334155', textTransform: 'none', '&:hover': { bgcolor: '#f8fafc' } }}>
             + Add Row
           </Button>
           <Button variant="outlined" size="small" onClick={() => setDocModalOpen(true)} sx={{ fontWeight: 700, borderRadius: 2, borderColor: '#cbd5e1', color: '#334155', textTransform: 'none' }}>
             Upload PDF {pageDocuments.length > 0 && \`(\${pageDocuments.length})\`}
           </Button>
           <IconButton onClick={fetchData} size="small" sx={{ border: '1px solid #cbd5e1', borderRadius: 2, color: '#334155' }}><RefreshIcon fontSize="small" /></IconButton>
           <Button variant="outlined" size="small" startIcon={<DownloadIcon />} onClick={handleExport} sx={{ fontWeight: 700, borderRadius: 2, borderColor: '#cbd5e1', color: '#334155', textTransform: 'none' }}>Export</Button>
           <Button variant="contained" size="small" startIcon={<EditIcon />} disabled={!selectedIds.length} onClick={openPaymentModal}
             sx={{ fontWeight: 700, borderRadius: 2, bgcolor: '#6366f1', textTransform: 'none', boxShadow: 'none' }}>
             Group Payment ({selectedIds.length})
           </Button>
           <Button variant="contained" color="error" size="small" startIcon={<DeleteIcon />} disabled={!selectedIds.length} onClick={handleDeleteRows}
             sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none', boxShadow: 'none' }}>
             Delete ({selectedIds.length})
           </Button>
        </Box>
      </Box>

      {/* 4. Table UI */}
      <Box sx={{ flex: 1, overflow: 'auto', p: { xs: 1, md: 2 } }}>
        {loading ? (
          <Box height="100%" display="flex" alignItems="center" justifyContent="center"><CircularProgress size={40} thickness={4} sx={{ color: '#3b82f6' }} /></Box>
        ) : (
          <Box sx={{ 
            bgcolor: '#fff', borderRadius: 3, border: '1px solid #e2e8f0', overflow: 'auto', 
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)' 
          }}>
            <table style={{ borderCollapse: 'collapse', whiteSpace: 'normal', fontFamily: 'Inter,sans-serif', fontSize: 13, width: 'max-content', minWidth: '100%' }}>
              <thead>
                <tr>
                  <th style={thStyle({ minWidth: 50, position: 'sticky', left: 0, zIndex: 12, borderRight: '1px solid #334155' })}>Sl No</th>
                  <th style={thStyle({ minWidth: 50, position: 'sticky', left: 50, zIndex: 12, borderRight: '1px solid #334155' })}>Select</th>
                  <th style={thStyle({ minWidth: 170, position: 'sticky', left: 100, zIndex: 12, borderRight: '1px solid #334155' })}>Invoice Number</th>
                  <th style={thStyle({ minWidth: 120 })}>Invoice Date</th>
                  <th style={thStyle({ minWidth: 150 })}>Shipment Number</th>
                  <th style={thStyle({ minWidth: 220 })}>Month</th>
                  <th style={thStyle({ minWidth: 140 })}>SITE</th>
                  <th style={thStyle({ minWidth: 160 })}>BILL</th>
                  <th style={thStyle({ minWidth: 100 })}>Amount</th>
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
                  <th style={thStyle({ minWidth: 240 })}>Debit Reasons(Deduction)</th>
                  <th style={thStyle({ minWidth: 350, background: '#6b21a8', borderRight: 'none' })}>Remarks</th>
                </tr>
              </thead>
              <tbody style={{ '& > tr:hover': { background: '#f8fafc' } }}>
                {visibleRows.map((r, ri) => renderRow(r, ri))}
              </tbody>
            </table>
          </Box>
        )}
      </Box>

      {/* Pagination */}
      {totalPages > 1 && (
        <Box sx={{ p: 2, bgcolor: '#fff', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 2, alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="body2" sx={{ color: '#64748b', fontWeight: 600 }}>
            Showing {page * PAGE_SIZE + 1} – {Math.min((page + 1) * PAGE_SIZE, filteredRows.length)} of {filteredRows.length} records
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button size="small" variant="outlined" disabled={page === 0} onClick={() => setPage(p => p - 1)} sx={{ borderRadius: 1.5, fontWeight: 700, textTransform: 'none' }}>Previous</Button>
            <Button size="small" variant="outlined" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} sx={{ borderRadius: 1.5, fontWeight: 700, textTransform: 'none' }}>Next</Button>
          </Box>
        </Box>
      )}

      {/* Payment Modal */}
`;

const startIndex = content.indexOf("return (\n    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#f4f7f9'");
const endIndex = content.indexOf("{/* Payment Modal */}");

if (startIndex === -1 || endIndex === -1) {
  console.log("Could not find start or end index.");
  process.exit(1);
}

const newContent = content.substring(0, startIndex) + replacement + content.substring(endIndex);
fs.writeFileSync(path, newContent, 'utf8');
console.log("Successfully replaced layout.");
