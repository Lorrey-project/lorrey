const fs = require('fs');
const path = '/Users/soumodeeproy/Desktop/lorrey-project-code 2/frontend/review-dashboard/UI2/src/pages/FinancialYearDetails.jsx';
let code = fs.readFileSync(path, 'utf8');

// 1. Update thStyle
const oldThStyle = `const thStyle = (extra = {}) => ({
    position: 'sticky', top: 0, zIndex: 10,
    background: '#1e293b', color: '#fff',
    padding: '8px 6px', whiteSpace: 'pre-line',
    fontSize: 11, fontWeight: 700, textAlign: 'center',
    borderRight: '1px solid #334155',
    ...extra
  });`;

const newThStyle = `const thStyle = (extra = {}) => ({
    position: 'sticky', top: 0, zIndex: 10,
    background: '#f8fafc', color: '#334155',
    padding: '10px 8px', whiteSpace: 'pre-line',
    fontSize: 11, fontWeight: 700, textAlign: 'center',
    borderRight: '1px solid #e2e8f0',
    borderBottom: '2px solid #e2e8f0',
    ...extra
  });`;
code = code.replace(oldThStyle, newThStyle);

// 2. Update renderRow backgrounds for clean white UI
const oldTdStyleRegex = /const td = \(extra = \{\}\) => \(\{[\s\S]*?const calcBg = '#dcfce7'; \/\/ Light Green/;
const newTdStyle = `const td = (extra = {}) => ({
      padding: '8px 10px', borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0',
      fontSize: 12, verticalAlign: 'middle', background: baseBg,
      color: '#1e293b',
      ...extra
    });
    const autoGenBg = '#f0f9ff'; // Very light sky blue
    const calcBg = '#f0fdf4'; // Very light green`;
if (code.match(oldTdStyleRegex)) {
    code = code.replace(oldTdStyleRegex, newTdStyle);
}

// 3. Update baseBg inside renderRow
code = code.replace(
    `let baseBg = ri % 2 ? '#f8fafc' : '#fff';\n      if (r.isLocked) baseBg = '#f1f5f9'; // Locked records`,
    `let baseBg = ri % 2 === 0 ? '#ffffff' : '#f8fafc';\n      if (r.isLocked) baseBg = '#f1f5f9'; // Locked records`
);

// 4. Update the return UI block
const returnStartStr = "  return (\n    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#f4f7f9', fontFamily: 'Inter, sans-serif' }}>";
const returnStartIdx = code.indexOf(returnStartStr);

const tableStartIdx = code.indexOf("<table", returnStartIdx);
if (returnStartIdx === -1 || tableStartIdx === -1) {
    console.error("Could not find return or table start", { returnStartIdx, tableStartIdx });
    process.exit(1);
}

const newReturnUI = `  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#ffffff', fontFamily: 'Inter, sans-serif' }}>
      
      {/* 1. Clean Premium Header */}
      <Box sx={{ 
        px: { xs: 2, md: 4 }, py: 2, 
        bgcolor: '#ffffff', 
        borderBottom: '1px solid #e2e8f0',
        display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <IconButton onClick={onBack} size="small" sx={{ border: '1px solid #e2e8f0', bgcolor: '#f8fafc', '&:hover': { bgcolor: '#f1f5f9' }, p: 1, borderRadius: '10px' }}>
          <ArrowBackIcon fontSize="small" sx={{ color: '#475569' }} />
        </IconButton>
        
        <Box flex={1}>
          <Typography variant="h5" fontWeight={800} sx={{ color: '#0f172a', letterSpacing: '-0.02em', mb: 0.5 }}>
            Bill Register
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', px: 1.5, py: 0.5 }}>
              <Typography variant="caption" sx={{ color: '#64748b', mr: 1, fontWeight: 700 }}>FY</Typography>
              <select
                value={selYear}
                onChange={e => setSelYear(e.target.value)}
                style={{
                  border: 'none', outline: 'none', background: 'transparent',
                  fontWeight: 700, color: '#0f172a', cursor: 'pointer',
                  fontFamily: 'Inter, sans-serif', fontSize: '13px',
                  minWidth: '80px', paddingRight: '12px'
                }}
              >
                {FY_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </Box>
            <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600 }}>Last Updated: Just now</Typography>
          </Box>
        </Box>
      </Box>

      {/* 2. White Summary Cards */}
      <Box sx={{ px: { xs: 2, md: 4 }, pt: 3, pb: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 2 }}>
        {[
          { label: 'Total Bills', value: totalBills, accent: '#64748b' },
          { label: 'Freight Bills', value: freightBills, accent: '#64748b' },
          { label: 'Unloading Bills', value: unloadingBills, accent: '#64748b' },
          { label: 'Total Bill Amount', value: \`₹\${totalBillAmount.toLocaleString('en-IN')}\`, accent: '#0284c7' },
          { label: 'Total Paid', value: \`₹\${totalPaidAmount.toLocaleString('en-IN')}\`, accent: '#16a34a' },
          { label: 'Total Due', value: \`₹\${totalDueAmount.toLocaleString('en-IN')}\`, accent: '#ea580c' },
          { label: 'Paid Bills', value: paidBills, accent: '#16a34a' },
          { label: 'Pending Bills', value: pendingBills, accent: '#dc2626' },
        ].map((c, i) => (
          <Box key={i} sx={{ bgcolor: '#ffffff', p: 2.5, borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', position: 'relative', overflow: 'hidden' }}>
            <Box sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', bgcolor: c.accent }} />
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{c.label}</Typography>
            <Typography variant="h6" sx={{ color: '#0f172a', fontWeight: 900, mt: 0.5, lineHeight: 1.2 }}>{c.value}</Typography>
          </Box>
        ))}
      </Box>

      {/* 3. Modern Toolbar & Quick Filters */}
      <Box sx={{ px: { xs: 2, md: 4 }, py: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid #e2e8f0', bgcolor: '#ffffff' }}>
        
        {/* Site Filter Tabs */}
        <Box sx={{ display: 'flex', bgcolor: '#f1f5f9', borderRadius: '10px', p: 0.5, border: '1px solid #e2e8f0' }}>
          {['All', 'NVCL', 'NVL'].map(tab => (
            <Box component="button" key={tab} onClick={() => handleSiteFilter(tab)}
              sx={{ border: 'none', cursor: 'pointer', borderRadius: '8px', py: 0.75, px: 2, fontWeight: 700, fontSize: 13, background: siteFilter === tab ? '#fff' : 'transparent', color: siteFilter === tab ? '#0f172a' : '#64748b', boxShadow: siteFilter === tab ? '0 1px 3px rgba(0,0,0,0.05)' : 'none', transition: 'all 0.2s' }}>
              {tab} <Typography component="span" sx={{ fontSize: 10, opacity: 0.6, ml: 0.5 }}>
                ({tab === 'All' ? computedRows.length : tab === 'NVL' ? computedRows.filter(r => isNVL(r.site)).length : computedRows.filter(r => isNVCL(r.site)).length})
              </Typography>
            </Box>
          ))}
        </Box>

        {/* Global Search */}
        <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', p: 0.5, boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)', flex: 1, minWidth: '200px', maxWidth: '300px' }}>
          <Box sx={{ color: '#94a3b8', pl: 1 }}><SearchIcon fontSize="small" /></Box>
          <input
            placeholder="Search invoice, vehicle, party..."
            value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
            style={{ border: 'none', outline: 'none', width: '100%', padding: '6px 12px', fontSize: 13, fontWeight: 600, color: '#0f172a' }}
          />
        </Box>

        <Box sx={{ flex: 1 }} />

        {/* Action Buttons */}
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
           <Button variant="outlined" size="small" onClick={handleAddRow} sx={{ fontWeight: 700, borderRadius: '8px', borderColor: '#e2e8f0', color: '#475569', textTransform: 'none', '&:hover': { bgcolor: '#f8fafc', borderColor: '#cbd5e1' } }}>
             + Add Row
           </Button>
           <Button variant="outlined" size="small" onClick={() => setDocModalOpen(true)} sx={{ fontWeight: 700, borderRadius: '8px', borderColor: '#e2e8f0', color: '#475569', textTransform: 'none', '&:hover': { bgcolor: '#f8fafc', borderColor: '#cbd5e1' } }}>
             PDF Docs ({pageDocuments.length})
           </Button>
           {Object.keys(selectedGroups).length > 0 && (
             <Button variant="contained" size="small" onClick={() => setIsGroupPaymentModalOpen(true)}
               sx={{ fontWeight: 700, borderRadius: '8px', bgcolor: '#3b82f6', color: '#fff', textTransform: 'none', boxShadow: 'none', '&:hover': { bgcolor: '#2563eb' } }}>
               Group Payment
             </Button>
           )}
           <IconButton onClick={fetchData} size="small" sx={{ border: '1px solid #e2e8f0', borderRadius: '8px', color: '#475569', '&:hover': { bgcolor: '#f8fafc' } }}><RefreshIcon fontSize="small" /></IconButton>
           <IconButton onClick={handleExportData} size="small" sx={{ border: '1px solid #e2e8f0', borderRadius: '8px', color: '#475569', '&:hover': { bgcolor: '#f8fafc' } }}><DownloadIcon fontSize="small" /></IconButton>
           
           <Button variant="contained" size="small"
             startIcon={loading ? <CircularProgress size={13} color="inherit" /> : <SaveIcon />}
             onClick={saveAllChanges} disabled={(dirtyRows.size === 0 && dirtyGroups.size === 0) || loading}
             sx={{ fontWeight: 800, borderRadius: '8px', px: 3, background: (dirtyRows.size > 0 || dirtyGroups.size > 0) ? '#10b981' : '#f1f5f9', color: (dirtyRows.size > 0 || dirtyGroups.size > 0) ? '#fff' : '#94a3b8', boxShadow: 'none', '&:disabled': { color: '#94a3b8', background: '#f1f5f9' }, textTransform: 'none', '&:hover': { bgcolor: '#059669' } }}>
             {loading ? 'Saving...' : \`Save Changes (\${dirtyRows.size + dirtyGroups.size})\`}
           </Button>
        </Box>
      </Box>

      {/* 4. Table Container */}
      <Box sx={{ flex: 1, overflow: 'auto', p: { xs: 1, md: 2 } }}>
        <Box sx={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', bgcolor: '#fff', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
          <table`;

code = code.substring(0, returnStartIdx) + newReturnUI + code.substring(tableStartIdx + 6);

// Finally write back
fs.writeFileSync(path, code);
console.log("Success");
