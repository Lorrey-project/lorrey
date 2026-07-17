const fs = require('fs');

const path = '/Users/soumodeeproy/Desktop/lorrey-project-code 2/frontend/review-dashboard/UI2/src/pages/FinancialYearDetails.jsx';
let code = fs.readFileSync(path, 'utf8');

// 1. Add Icons
if (!code.includes('import PrintIcon')) {
  code = code.replace(/import SearchIcon from '@mui\/icons-material\/Search';/, `import SearchIcon from '@mui/icons-material/Search';\nimport PrintIcon from '@mui/icons-material/Print';\nimport ViewColumnIcon from '@mui/icons-material/ViewColumn';`);
}

// 2. Update Premium Color Logic inside renderRow
const colorBlockStart = code.indexOf('// Premium Color Logic');
const colorBlockEnd = code.indexOf('const td = (extra = {}) => {');
if (colorBlockStart !== -1 && colorBlockEnd !== -1) {
  const newColorBlock = `// Premium Color Logic
    let baseBg = r.isLocked ? '#f1f5f9' : (ri % 2 === 0 ? '#ffffff' : '#f8fafc');

    let paymentBg = '#fdf2f8'; // Default
    if (isGroupStart) {
       const paidAmt = num(gd.paymentAmount);
       if (paidAmt >= groupTotalRecv && groupTotalRecv > 0) paymentBg = '#dcfce7'; // Paid -> Soft Green
       else if (paidAmt > 0 && paidAmt < groupTotalRecv) paymentBg = '#ffedd5'; // Partial -> Soft Orange
       else paymentBg = '#fef9c3'; // Pending -> Soft Yellow
    }

    const autoGenBg = '#e0f2fe'; // Light Sky Blue for auto-fetched
    const calcBg = '#dcfce7'; // Light Green for calculated fields
    const financeBg = '#e0e7ff'; // Soft Blue for important financial values

    `;
  code = code.substring(0, colorBlockStart) + newColorBlock + code.substring(colorBlockEnd);
}

// 3. Update return statement
const returnStart = code.indexOf('  return (\n    <Box sx={{ height: \'100vh\'');
const tableContainerStart = code.indexOf('{/* 4. Table Container */}', returnStart);
if (returnStart !== -1 && tableContainerStart !== -1) {
  const newReturn = `  return (
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
              <Typography variant="caption" sx={{ color: '#64748b', mr: 1, fontWeight: 700 }}>FY</Typography>
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
      
      `;
  code = code.substring(0, returnStart) + newReturn + code.substring(tableContainerStart);
}

// 4. Update the Table Headings Background colors
// Update the header backgrounds to a professional sleek navy blue (#0f172a, #1e293b) to match ERP style, instead of brown/purple which clash with the clean theme.
code = code.replace(/background: '#9a3412'/g, "background: '#1e293b'");
code = code.replace(/background: '#3730a3'/g, "background: '#1e293b'");
code = code.replace(/background: '#0e7490'/g, "background: '#1e293b'");
code = code.replace(/background: '#166534'/g, "background: '#1e293b'");
code = code.replace(/background: '#6b21a8'/g, "background: '#1e293b'");

// Also modify thStyle
const thStyleStart = code.indexOf('const thStyle = (extra = {}) => ({');
const thStyleEnd = code.indexOf('borderBottom: \'2px solid #e2e8f0\',', thStyleStart);
if (thStyleStart !== -1 && thStyleEnd !== -1) {
    const newThStyle = `const thStyle = (extra = {}) => ({
    position: 'sticky', top: 0, zIndex: 10,
    background: '#0f172a', color: '#f8fafc',
    padding: '12px 10px', whiteSpace: 'pre-line',
    fontSize: 12, fontWeight: 700, textAlign: 'center',
    borderRight: '1px solid #334155',
    `;
    code = code.substring(0, thStyleStart) + newThStyle + code.substring(thStyleEnd);
}

fs.writeFileSync(path, code);
console.log("Updated Colors and Layout!");
