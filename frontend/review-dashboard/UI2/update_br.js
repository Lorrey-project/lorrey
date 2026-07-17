const fs = require('fs');
const path = '/Users/soumodeeproy/Desktop/lorrey-project-code 2/frontend/review-dashboard/UI2/src/pages/FinancialYearDetails.jsx';
let code = fs.readFileSync(path, 'utf8');

// 1. Replace getColHeaderStyle implementation (or inject it)
// We need to find `const getColHeaderStyle =` or replace the existing one.
const headerStyleRegex = /const getColHeaderStyle = .*?\n  \}\);/s;
const newHeaderStyle = `const getColHeaderStyle = (width = 100, isSticky = false, type = 'manual') => {
    let background = 'linear-gradient(180deg, #1e3a8a 0%, #172554 100%)';
    let color = '#bfdbfe';
    if (type === 'auto') { background = 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)'; color = '#e2e8f0'; }
    else if (type === 'calc') { background = 'linear-gradient(180deg, #064e3b 0%, #022c22 100%)'; color = '#a7f3d0'; }
    else if (type === 'dropdown') { background = 'linear-gradient(180deg, #7c2d12 0%, #431407 100%)'; color = '#fed7aa'; }
    
    let extra = {};
    if (isSticky) {
      if (width === 40) extra = { position: 'sticky', left: 0, zIndex: 11 };
      else if (width === 41) extra = { position: 'sticky', left: 40, zIndex: 11 };
      else extra = { position: 'sticky', left: 80, zIndex: 11 };
    }
    
    return {
      width, minWidth: width,
      position: 'sticky', top: 0, zIndex: isSticky ? 12 : 10,
      background, color,
      padding: '10px 6px', whiteSpace: 'pre-line',
      fontSize: 10, fontWeight: 700, textAlign: 'center', letterSpacing: '0.5px', lineHeight: 1.2,
      borderRight: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.1)',
      ...extra
    };
  };`;
code = code.replace(headerStyleRegex, newHeaderStyle);

// If getColHeaderStyle wasn't found (it's actually starting at line 1113), let's ensure we use string replacement
const oldHeaderStyleStr = `const getColHeaderStyle = (width = 100, isSticky = false, extra = {}) => ({
    width, minWidth: width,
    position: 'sticky', top: 0, zIndex: 10,
    background: '#1e293b', color: '#fff',
    padding: '8px 6px', whiteSpace: 'pre-line',
    fontSize: 11, fontWeight: 700, textAlign: 'center',
    borderRight: '1px solid #334155',
    ...extra
  });`;
code = code.replace(oldHeaderStyleStr, newHeaderStyle);

// 2. Fix renderRow colors
const renderRowRegex = /const renderRow = \(r, ri\) => \{([\s\S]*?)return \(\n\s*<React\.Fragment/s;
const match = code.match(renderRowRegex);

if (match) {
  let renderBody = match[1];
  
  // Update baseBg and row backgrounds to exactly match Cement Register
  renderBody = renderBody.replace(
    /let baseBg = ri % 2 \? '#f8fafc' : '#fff';\n\s*if \(r\.isLocked\) baseBg = '#f1f5f9'; \/\/ Locked records/,
    `let baseBg = r.isLocked ? '#f8fafc' : (ri % 2 === 0 ? '#ffffff' : '#fafafa');`
  );
  
  const newTdStyles = `const td = (extra = {}) => {
      return { 
        padding: '8px 10px', borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0', 
        fontSize: 11, verticalAlign: 'middle', background: baseBg, 
        color: '#1e293b',
        ...extra 
      };
    };
    const autoGenBg = 'transparent';
    const calcBg = 'transparent';`;
    
  renderBody = renderBody.replace(/const td = \(extra = \{\}\) => \(\{[\s\S]*?const calcBg = '#dcfce7'; \/\/ Light Green/, newTdStyles);

  code = code.replace(match[1], renderBody);
}

// 3. Replace the entire Return section
const returnRegex = /return \(\n\s*<Box sx=\{\{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#f4f7f9', fontFamily: 'Inter, sans-serif' \}\}\>([\s\S]*?)<TablePagination/s;

const newReturn = `return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#f8fafc', overflow: 'hidden' }}>

      {/* ── Premium Header ───────────────────────────────────────────── */}
      <Box sx={{
        px: { xs: 2, md: 4 }, py: 2,
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 2, borderBottom: '1px solid rgba(255,255,255,0.1)',
      }}>
        <Box display="flex" alignItems="center" gap={2}>
          <IconButton onClick={onBack} sx={{ bgcolor: 'rgba(255,255,255,0.05)', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }, p: 1, borderRadius: '12px' }}>
            <ArrowBackIcon fontSize="small" sx={{ color: '#f8fafc' }} />
          </IconButton>
          <Box>
            <Typography variant="h5" fontWeight={800} sx={{ color: '#fff', letterSpacing: '-0.5px' }}>
              Bill Register
            </Typography>
            <Box display="flex" alignItems="center" gap={1.5} mt={0.5}>
              <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600 }}>
                Total Records: <span style={{ color: '#e2e8f0' }}>{finalFilteredRows.length}</span>
              </Typography>
              <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: '#475569' }} />
              <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600 }}>
                Period: <span style={{ color: '#e2e8f0' }}>{selectedMonth === 'All' ? 'All Months' : MONTHS[selectedMonth - 1]} {selYear}</span>
              </Typography>
            </Box>
          </Box>
        </Box>

        <Box display="flex" alignItems="center" gap={1.5}>
          <SearchableSelect
            value={selectedMonth}
            onChange={(e) => { setSelectedMonth(e.target.value); setPage(0); }}
            size="small"
            sx={{
              borderRadius: '10px', fontSize: '12px', fontWeight: 700,
              color: '#fff', bgcolor: 'rgba(255,255,255,0.05)',
              '& .MuiInputBase-input': { color: '#fff' },
              '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#a78bfa' },
              '.MuiSvgIcon-root': { color: '#94a3b8' },
              minWidth: 120,
            }}
          >
            <MenuItem value="All" sx={{ fontSize: '12px', fontWeight: 600 }}>All Months</MenuItem>
            {MONTHS.map((mo, idx) => (
              <MenuItem key={mo} value={idx + 1} sx={{ fontSize: '12px', fontWeight: 600 }}>{mo}</MenuItem>
            ))}
          </SearchableSelect>

          <SearchableSelect
            value={selYear}
            onChange={(e) => setSelYear(e.target.value)}
            size="small"
            sx={{
              borderRadius: '10px', fontSize: '12px', fontWeight: 700,
              color: '#fff', bgcolor: 'rgba(255,255,255,0.05)',
              '& .MuiInputBase-input': { color: '#fff' },
              '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#a78bfa' },
              '.MuiSvgIcon-root': { color: '#94a3b8' },
              minWidth: 140,
            }}
          >
            {FY_OPTIONS.map(yr => (
              <MenuItem key={yr} value={yr} sx={{ fontSize: '12px', fontWeight: 600 }}>{yr}</MenuItem>
            ))}
          </SearchableSelect>
        </Box>
      </Box>

      {/* ── Dashboard Summary Cards ────────────────────────────────────── */}
      <Box sx={{ px: { xs: 2, md: 4 }, pt: 3, pb: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 2 }}>
        {[
          { label: 'Total Bills', value: totalBills, color: '#475569', bg: '#f8fafc' },
          { label: 'Total Freight', value: freightBills, color: '#475569', bg: '#f8fafc' },
          { label: 'Total Unloading', value: unloadingBills, color: '#475569', bg: '#f8fafc' },
          { label: 'Total Amount', value: \`₹\${totalBillAmount.toLocaleString('en-IN')}\`, color: '#0284c7', bg: '#f0f9ff' },
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

      {/* ── Toolbar & Quick Filters ────────────────────────────────────── */}
      <Box sx={{
        px: { xs: 2, md: 4 }, py: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        bgcolor: '#ffffff', borderBottom: '1px solid #e2e8f0',
        gap: 2, flexWrap: 'wrap'
      }}>
        {/* Filters Left Side */}
        <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
          <Box display="flex" alignItems="center" sx={{
            bgcolor: '#f1f5f9', borderRadius: '12px', px: 2, py: 1, border: '1px solid #e2e8f0',
            '&:focus-within': { borderColor: '#7c3aed', boxShadow: '0 0 0 2px rgba(124,58,237,0.1)' }, width: 260
          }}>
            <span style={{ marginRight: 8, opacity: 0.5 }}>🔍</span>
            <input
              type="text"
              placeholder="Search Bill No, Vehicle..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '13px', width: '100%', color: '#0f172a', fontWeight: 500 }}
            />
            {searchQuery && (
              <div onClick={() => setSearchQuery('')} style={{ cursor: 'pointer', color: '#94a3b8', fontSize: '14px', marginLeft: '4px', fontWeight: 'bold' }}>✕</div>
            )}
          </Box>

          <Box display="flex" alignItems="center" gap={1}>
            <SearchableSelect
              value={filterBillType}
              onChange={(e) => { setFilterBillType(e.target.value); setPage(0); }}
              size="small"
              sx={{ borderRadius: '10px', fontSize: '12px', fontWeight: 600, bgcolor: '#f8fafc', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' }, minWidth: 120 }}
            >
              <MenuItem value="All" sx={{ fontSize: '12px' }}>All Bill Types</MenuItem>
              {[...new Set(computedRows.map(r => r.billType).filter(Boolean))].map(b => (
                <MenuItem key={b} value={b} sx={{ fontSize: '12px' }}>{b}</MenuItem>
              ))}
            </SearchableSelect>

            <SearchableSelect
              value={filterPartyName}
              onChange={(e) => { setFilterPartyName(e.target.value); setPage(0); }}
              size="small"
              sx={{ borderRadius: '10px', fontSize: '12px', fontWeight: 600, bgcolor: '#f8fafc', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' }, minWidth: 140 }}
            >
              <MenuItem value="All" sx={{ fontSize: '12px' }}>All Party Names</MenuItem>
              {[...new Set(computedRows.map(r => r.partyName).filter(Boolean))].map(p => (
                <MenuItem key={p} value={p} sx={{ fontSize: '12px' }}>{p}</MenuItem>
              ))}
            </SearchableSelect>

            <SearchableSelect
              value={filterPaymentStatus}
              onChange={(e) => { setFilterPaymentStatus(e.target.value); setPage(0); }}
              size="small"
              sx={{ borderRadius: '10px', fontSize: '12px', fontWeight: 600, bgcolor: '#f8fafc', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' }, minWidth: 140 }}
            >
              <MenuItem value="All" sx={{ fontSize: '12px' }}>All Payment Status</MenuItem>
              <MenuItem value="Paid" sx={{ fontSize: '12px' }}>Paid Only</MenuItem>
              <MenuItem value="Pending" sx={{ fontSize: '12px' }}>Pending Only</MenuItem>
            </SearchableSelect>
          </Box>
        </Box>

        {/* Actions Right Side */}
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button size="small" variant="contained"
            onClick={handleAddRow}
            sx={{
              fontWeight: 700, borderRadius: '10px', px: 2, fontSize: '0.8rem',
              background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', color: '#fff',
              textTransform: 'none', boxShadow: 'none',
              '&:hover': { background: 'linear-gradient(135deg,#6d28d9,#5b21b6)' },
            }}>
            + Add Bill
          </Button>

          {Object.keys(dirtyRows).length > 0 && (
            <Button size="small" variant="contained"
              onClick={handleSaveAll} disabled={saving}
              sx={{
                fontWeight: 700, borderRadius: '10px', px: 2.5, fontSize: '0.85rem', textTransform: 'none',
                background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
                '&:hover': { background: 'linear-gradient(135deg,#059669,#047857)' },
              }}>
              {saving ? 'Saving...' : \`Save Changes (\${Object.keys(dirtyRows).length})\`}
            </Button>
          )}
          
          {Object.keys(selectedGroups).length > 0 && (
            <Button size="small" variant="outlined"
              onClick={() => setIsGroupPaymentModalOpen(true)}
              sx={{
                fontWeight: 700, borderRadius: '10px', px: 2, fontSize: '0.8rem',
                color: '#4f46e5', borderColor: '#c7d2fe', bgcolor: '#eef2ff', textTransform: 'none',
                '&:hover': { bgcolor: '#e0e7ff', borderColor: '#a5b4fc' },
              }}>
              Group Payment
            </Button>
          )}

          <Box sx={{ width: '1px', height: '24px', bgcolor: '#e2e8f0', mx: 0.5, display: { xs: 'none', md: 'block' } }} />

          <Button size="small" variant="outlined" startIcon={<DownloadIcon sx={{ fontSize: '1rem' }} />} onClick={handleExportData}
            sx={{ fontWeight: 700, borderRadius: '10px', fontSize: '0.8rem', color: '#475569', borderColor: '#e2e8f0', textTransform: 'none', '&:hover': { bgcolor: '#f8fafc', borderColor: '#cbd5e1' } }}>
            Export
          </Button>

          <Button size="small" variant="outlined" onClick={handlePrint}
            sx={{ fontWeight: 700, borderRadius: '10px', fontSize: '0.8rem', color: '#475569', borderColor: '#e2e8f0', textTransform: 'none', '&:hover': { bgcolor: '#f8fafc', borderColor: '#cbd5e1' } }}>
            Print
          </Button>
        </Box>
      </Box>

      {/* ── Table Container ─────────────────────────────────────────────── */}
      <Box sx={{ overflow: 'auto', flex: 1, m: { xs: 1, md: 2 }, borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 15px rgba(0,0,0,0.03)', bgcolor: '#fff' }}>
        <table style={{ borderCollapse: 'collapse', minWidth: '100%', tableLayout: 'fixed', fontFamily: 'Inter, system-ui, sans-serif', fontSize: '11px' }}>
          <colgroup>
            <col style={{ width: 40, minWidth: 40 }} />
            <col style={{ width: 40, minWidth: 40 }} />
            <col style={{ width: 120, minWidth: 120 }} />
            <col style={{ width: 100, minWidth: 100 }} />
            <col style={{ width: 120, minWidth: 120 }} />
            <col style={{ width: 150, minWidth: 150 }} />
            <col style={{ width: 120, minWidth: 120 }} />
            <col style={{ width: 120, minWidth: 120 }} />
            <col style={{ width: 100, minWidth: 100 }} />
            <col style={{ width: 100, minWidth: 100 }} />
            <col style={{ width: 100, minWidth: 100 }} />
            <col style={{ width: 100, minWidth: 100 }} />
            <col style={{ width: 100, minWidth: 100 }} />
            <col style={{ width: 100, minWidth: 100 }} />
            <col style={{ width: 100, minWidth: 100 }} />
            <col style={{ width: 150, minWidth: 150 }} />
            <col style={{ width: 150, minWidth: 150 }} />
            <col style={{ width: 100, minWidth: 100 }} />
            <col style={{ width: 110, minWidth: 110 }} />
            <col style={{ width: 130, minWidth: 130 }} />
            <col style={{ width: 150, minWidth: 150 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={getColHeaderStyle(40, true, 'auto')}>Sl No</th>
              <th style={getColHeaderStyle(41, true, 'auto')}>
                 <input type="checkbox" checked={selectedBills.length === finalFilteredRows.length && finalFilteredRows.length > 0}
                        onChange={(e) => e.target.checked ? setSelectedBills(finalFilteredRows.map(r => r._id)) : setSelectedBills([])}
                        style={{ width: 14, height: 14, accentColor: '#7c3aed' }} />
              </th>
              <th style={getColHeaderStyle(120, true, 'auto')}>Invoice Number{<div style={{ fontSize: '7px', opacity: 0.6, marginTop: 4, letterSpacing: '1px' }}>AUTO</div>}</th>
              <th style={getColHeaderStyle(100, false, 'auto')}>Bill Date{<div style={{ fontSize: '7px', opacity: 0.6, marginTop: 4, letterSpacing: '1px' }}>AUTO</div>}</th>
              <th style={getColHeaderStyle(120, false, 'auto')}>Vehicle No{<div style={{ fontSize: '7px', opacity: 0.6, marginTop: 4, letterSpacing: '1px' }}>AUTO</div>}</th>
              <th style={getColHeaderStyle(150, false, 'auto')}>Party Name{<div style={{ fontSize: '7px', opacity: 0.6, marginTop: 4, letterSpacing: '1px' }}>AUTO</div>}</th>
              <th style={getColHeaderStyle(120, false, 'auto')}>Loading Site{<div style={{ fontSize: '7px', opacity: 0.6, marginTop: 4, letterSpacing: '1px' }}>AUTO</div>}</th>
              <th style={getColHeaderStyle(120, false, 'auto')}>Unloading Site{<div style={{ fontSize: '7px', opacity: 0.6, marginTop: 4, letterSpacing: '1px' }}>AUTO</div>}</th>
              <th style={getColHeaderStyle(100, false, 'auto')}>Bill Type{<div style={{ fontSize: '7px', opacity: 0.6, marginTop: 4, letterSpacing: '1px' }}>AUTO</div>}</th>
              <th style={getColHeaderStyle(100, false, 'manual')}>Taxable Amt</th>
              <th style={getColHeaderStyle(100, false, 'calc')}>CGST Amt{<div style={{ fontSize: '7px', opacity: 0.7, marginTop: 4, letterSpacing: '1px' }}>CALC</div>}</th>
              <th style={getColHeaderStyle(100, false, 'calc')}>SGST Amt{<div style={{ fontSize: '7px', opacity: 0.7, marginTop: 4, letterSpacing: '1px' }}>CALC</div>}</th>
              <th style={getColHeaderStyle(100, false, 'calc')}>Total Amt{<div style={{ fontSize: '7px', opacity: 0.7, marginTop: 4, letterSpacing: '1px' }}>CALC</div>}</th>
              <th style={getColHeaderStyle(100, false, 'calc')}>TDS Amt{<div style={{ fontSize: '7px', opacity: 0.7, marginTop: 4, letterSpacing: '1px' }}>CALC</div>}</th>
              <th style={getColHeaderStyle(100, false, 'calc')}>Receivable{<div style={{ fontSize: '7px', opacity: 0.7, marginTop: 4, letterSpacing: '1px' }}>CALC</div>}</th>
              <th style={getColHeaderStyle(150, false, 'dropdown')}>GCN File</th>
              <th style={getColHeaderStyle(150, false, 'dropdown')}>Bill Document</th>
              <th style={getColHeaderStyle(100, false, 'manual')}>Paid Amt</th>
              <th style={getColHeaderStyle(110, false, 'manual')}>Payment Date</th>
              <th style={getColHeaderStyle(130, false, 'manual')}>UTR Details</th>
              <th style={getColHeaderStyle(150, false, 'manual')}>Payment Proof</th>
            </tr>
          </thead>
          <tbody>
            {finalFilteredRows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((r, i) => {
                // Determine styling parameters analogous to Cement Register row styling
                const isLocked = r.isLocked;
                const isSelected = selectedBills.includes(r._id);
                const isMatch = !!searchQuery;
                const baseBg = isLocked ? '#f8fafc' : (isMatch ? '#f1f5f9' : (isSelected ? '#f5f3ff' : ((i % 2 === 0) ? '#ffffff' : '#fafafa')));
                return (
                  <tr key={r._id} style={{
                    background: baseBg,
                    outline: isMatch ? '2px solid #cbd5e1' : (isSelected ? '2px solid rgba(124,58,237,0.4)' : 'none'),
                    transition: 'background 0.2s, opacity 0.2s',
                    opacity: isLocked ? 0.85 : 1,
                    boxShadow: isLocked ? 'inset 0 0 0 9999px rgba(226,232,240,0.3)' : 'none'
                  }} className="table-row-hover">
                    {renderRow(r, page * rowsPerPage + i)}
                  </tr>
                );
            })}
            {finalFilteredRows.length > 0 && (
              <tr style={{ fontWeight: 900, borderTop: '2px double #cbd5e1', borderBottom: '2px solid #cbd5e1' }}>
                <td colSpan={9} style={{
                  border: '1px solid #cbd5e1', padding: '10px 8px', textAlign: 'right',
                  color: '#475569', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px',
                  position: 'sticky', bottom: 0, zIndex: 10, left: 0,
                  background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)', boxShadow: '0 -2px 10px rgba(0,0,0,0.05)'
                }}>
                  Σ TOTAL ({selectedMonth === 'All' ? 'All Months' : MONTHS[selectedMonth - 1]})
                </td>
                {['taxableAmount', 'cgstAmount', 'sgstAmount', 'totalAmount', 'tdsAmount', 'receivable'].map(key => (
                  <td key={key} style={{
                    border: '1px solid #cbd5e1', padding: '10px 8px', fontSize: '11px', color: '#1e293b',
                    textAlign: 'right', fontWeight: 900, position: 'sticky', bottom: 0, zIndex: 10,
                    background: 'linear-gradient(180deg, #f5f3ff 0%, #ede9fe 100%)', boxShadow: '0 -2px 10px rgba(0,0,0,0.05)'
                  }}>
                    {formatTotalValue(key, finalFilteredRows.reduce((acc, curr) => acc + num(curr[key]), 0))}
                  </td>
                ))}
                <td colSpan={2} style={{ position: 'sticky', bottom: 0, zIndex: 10, background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)', border: '1px solid #cbd5e1', boxShadow: '0 -2px 10px rgba(0,0,0,0.05)' }}></td>
                <td style={{
                    border: '1px solid #cbd5e1', padding: '10px 8px', fontSize: '11px', color: '#1e293b',
                    textAlign: 'right', fontWeight: 900, position: 'sticky', bottom: 0, zIndex: 10,
                    background: 'linear-gradient(180deg, #f5f3ff 0%, #ede9fe 100%)', boxShadow: '0 -2px 10px rgba(0,0,0,0.05)'
                }}>
                  {formatTotalValue('paymentAmount', finalFilteredRows.reduce((acc, curr) => acc + num(curr.paymentAmount), 0))}
                </td>
                <td colSpan={3} style={{ position: 'sticky', bottom: 0, zIndex: 10, background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)', border: '1px solid #cbd5e1', boxShadow: '0 -2px 10px rgba(0,0,0,0.05)' }}></td>
              </tr>
            )}
          </tbody>
        </table>
      </Box>

      {/* Pagination */}
      <TablePagination`;

code = code.replace(/return \(\n\s*<Box sx=\{\{ height: '100vh'[\s\S]*?<TablePagination/, newReturn);

// Because we nested renderRow inside a <tr> to handle hover/selected coloring on the row element, we must remove the <tr> from inside renderRow.
// Inside renderRow, there's a React.Fragment containing `<tr> ... </tr>`. We need to just return the inner <td>s, or rather just the inner <tr>'s content, wait.
// Ah, `renderRow` returns `<React.Fragment> <tr> {monthHeader} </tr> <tr> <td...> </tr> </React.Fragment>`. If we nest it, it's invalid HTML (`tr > tr`).
// So we must fix `renderRow` not to output `<tr>` for the main row, or we modify `renderRow` itself to apply the background.

// Let's modify renderRow's tr output instead of doing it in the tbody map.
const renderRowTrRegex = /<tr>\n\s*\{\/\* Sl No \*\/\}/s;
code = code.replace(renderRowTrRegex, `<tr style={{
                  background: baseBg,
                  outline: false ? '2px solid #cbd5e1' : (false ? '2px solid rgba(124,58,237,0.4)' : 'none'),
                  transition: 'background 0.2s, opacity 0.2s',
                  opacity: r.isLocked ? 0.85 : 1,
                  boxShadow: r.isLocked ? 'inset 0 0 0 9999px rgba(226,232,240,0.3)' : 'none'
                }} className="table-row-hover">
          {/* Sl No */}`);

// We also need to fix the tbody map back to just calling renderRow if we did that!
code = code.replace(/\{finalFilteredRows\.slice\(page \* rowsPerPage, page \* rowsPerPage \+ rowsPerPage\)\.map\(\(r, i\) => \{[\s\S]*?return \([\s\S]*?renderRow\(r, page \* rowsPerPage \+ i\)[\s\S]*?\);\n\s*\}\)\}/s, 
  `{finalFilteredRows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((r, i) => renderRow(r, page * rowsPerPage + i))}`);


fs.writeFileSync(path, code);
