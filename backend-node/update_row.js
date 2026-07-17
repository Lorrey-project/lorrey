const fs = require('fs');
const path = '/Users/soumodeeproy/Desktop/lorrey-project-code 2/frontend/review-dashboard/UI2/src/pages/FinancialYearDetails.jsx';

let content = fs.readFileSync(path, 'utf8');

const replacement = `
  // ── Render a single row (native HTML only — no MUI inside cells) ──
  const renderRow = (r, ri) => {
    const gid = r.groupId;
    const isGroupStart = gid && groupSpanMap[gid]?.startIdx === (page * PAGE_SIZE + ri);
    const rowSpan = isGroupStart ? groupSpanMap[gid].count : 1;
    const gd = r.groupData || {};

    const groupTotalRecv = isGroupStart
      ? computedRows.filter(cr => cr.groupId === gid).reduce((s, x) => s + x.receivable, 0)
      : 0;

    const calcDebit = isGroupStart ? num(gd.debitAmount) : 0;
    const groupDiff = isGroupStart ? groupTotalRecv - num(gd.paymentAmount) - calcDebit - num(gd.tdsProvision) : 0;

    // Premium Color Logic
    let baseBg = ri % 2 ? '#f8fafc' : '#fff';
    if (r.isLocked) baseBg = '#f1f5f9'; // Locked records

    let paymentBg = '#fdf2f8'; // Default soft pink
    if (isGroupStart) {
       const paidAmt = num(gd.paymentAmount);
       if (paidAmt >= groupTotalRecv && groupTotalRecv > 0) paymentBg = '#dcfce7'; // Paid -> Soft Green
       else if (paidAmt > 0 && paidAmt < groupTotalRecv) paymentBg = '#fef9c3'; // Partial -> Soft Yellow
       else paymentBg = '#ffedd5'; // Unpaid -> Soft Orange
    }

    const td = (extra = {}) => ({ padding: '8px 10px', borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0', fontSize: 13, verticalAlign: 'middle', background: baseBg, ...extra });
    const autoGenBg = '#e0f2fe'; // Light Sky Blue
    const calcBg = '#dcfce7'; // Light Green

    // Parse month/year for the monthYear column
    const rawMonth = String(r.month || '').toUpperCase();
    let curM = '', curY = '';
    if (rawMonth.includes('-')) { [curM, curY] = rawMonth.split('-'); }
    else if (rawMonth.includes(' ')) {
      [curM, curY] = rawMonth.split(' ');
      if (curY?.startsWith("'")) curY = '20' + curY.substring(1);
    } else { curM = rawMonth; }
    if (!MONTHS.includes(curM)) curM = '';
    if (!YEARS.includes(curY)) curY = '';

    const handleMonthYearChange = (type, val) => {
      let newM = type === 'M' ? val : (curM || 'JANUARY');
      let newY = type === 'Y' ? val : (curY || String(new Date().getFullYear()));

      const mIndex = MONTHS.indexOf(newM);
      const now = new Date();
      const curMonthIndex = now.getMonth(); 
      const curYear = now.getFullYear();

      if (parseInt(newY) > curYear) {
        newY = String(curYear);
      }
      if (parseInt(newY) === curYear && mIndex > curMonthIndex) {
        newY = String(curYear - 1);
      }

      handleRowEdit(r.invoiceNumber, 'month', \`\${newM}-\${newY}\`);
    };

    const curMonthIndex = getMonthIndexFromDate(r.invoiceDate);
    const prevMonthIndex = ri > 0 ? getMonthIndexFromDate(visibleRows[ri - 1].invoiceDate) : null;
    const showHeader = (ri === 0) || (curMonthIndex !== prevMonthIndex);
    const monthName = MONTH_NAMES_FULL[curMonthIndex] || "Other / Date Unspecified";

    return (
      <React.Fragment key={ri}>
        {showHeader && (
          <tr key={\`month-header-\${curMonthIndex}-\${ri}\`}>
            <td colSpan={22} style={{
              background: 'linear-gradient(90deg, #3730a3, #4338ca)',
              color: '#ffffff',
              padding: '10px 16px',
              fontSize: '13px',
              fontWeight: 800,
              fontFamily: 'Inter, sans-serif',
              textAlign: 'left',
              letterSpacing: '0.05em',
              textTransform: 'uppercase'
            }}>
              📅 {monthName}
            </td>
          </tr>
        )}
        <tr>
          {/* Sl No */}
          <td style={td({ textAlign: 'center', color: '#64748b', fontWeight: 600, position: 'sticky', left: 0, zIndex: 4, background: baseBg, borderRight: '1px solid #cbd5e1' })}>{page * PAGE_SIZE + ri + 1}</td>

          {/* Select */}
          <td style={td({ textAlign: 'center', position: 'sticky', left: 50, zIndex: 4, background: baseBg, borderRight: '1px solid #cbd5e1' })}>
            <Tooltip title={r.isLocked ? "Auto-generated bills cannot be deleted here" : ""}>
              <span>
                <input 
                  type="checkbox" 
                  checked={selectedIds.includes(r.invoiceNumber)} 
                  onChange={() => {
                    if (!r.isLocked) toggleSelect(r.invoiceNumber);
                  }} 
                  disabled={r.isLocked}
                  style={{ cursor: r.isLocked ? 'not-allowed' : 'pointer', width: 14, height: 14, opacity: r.isLocked ? 0.5 : 1 }} 
                />
              </span>
            </Tooltip>
          </td>

          {/* Invoice Number */}
          <td style={td({ textAlign: 'left', position: 'sticky', left: 100, zIndex: 4, background: r.isLocked ? autoGenBg : baseBg, borderRight: '1px solid #cbd5e1' })}>
            <Box display="flex" alignItems="center" gap={0.5}>
              {r.isLocked && (
                <Tooltip title="Generated from Cement Register - Read Only">
                  <LockIcon sx={{ fontSize: 14, color: '#0284c7' }} />
                </Tooltip>
              )}
              <input 
                value={r.displayInvoiceNumber || ''} 
                onChange={e => handleRowEdit(r.invoiceNumber, 'displayInvoiceNumber', e.target.value)} 
                disabled={r.isLocked}
                style={{ ...iStyle, fontWeight: 700, width: '100%', color: r.isLocked ? '#0369a1' : 'inherit' }} 
              />
            </Box>
          </td>

          {/* Invoice Date */}
          <td style={td({ textAlign: 'center', background: r.isLocked ? autoGenBg : baseBg })}>
            <input
              type="date"
              value={formatDateForInput(r.invoiceDate)}
              onChange={e => handleRowEdit(r.invoiceNumber, 'invoiceDate', e.target.value)}
              disabled={r.isLocked}
              style={{ ...iStyle, width: 110, textAlign: 'center', fontWeight: 600, color: r.isLocked ? '#0369a1' : 'inherit' }}
            />
          </td>

          {/* Shipment Number */}
          <td style={td({ textAlign: 'left', whiteSpace: 'normal', maxWidth: 120, background: r.isLocked ? autoGenBg : baseBg, color: r.isLocked ? '#0369a1' : 'inherit' })}>
            {r.shipmentNos?.join(', ') || ''}
          </td>

          {/* Month */}
          <td style={td({ textAlign: 'center', background: r.isLocked ? autoGenBg : baseBg })}>
            <div style={{ display: 'flex', gap: 2 }}>
              <SearchableSelect variant="standard" value={curM} onChange={e => handleMonthYearChange('M', e.target.value)} style={{ ...selStyle, color: r.isLocked ? '#0369a1' : 'inherit', minWidth: 110 }} disabled={r.isLocked}>
                <option value="">Month</option>
                {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
              </SearchableSelect>
              <SearchableSelect variant="standard" value={curY} onChange={e => handleMonthYearChange('Y', e.target.value)} style={{ ...selStyle, color: r.isLocked ? '#0369a1' : 'inherit', minWidth: 80 }} disabled={r.isLocked}>
                <option value="">Year</option>
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </SearchableSelect>
            </div>
          </td>

          {/* Site */}
          <td style={td({ textAlign: 'center', background: r.isLocked ? autoGenBg : baseBg })}>
            <SearchableSelect variant="standard"
              value={r.site || 'NVCL'}
              onChange={e => handleRowEdit(r.invoiceNumber, 'site', e.target.value)}
              disabled={r.isLocked}
              style={{ ...selStyle, fontWeight: 600, textAlign: 'center', color: r.isLocked ? '#0369a1' : 'inherit', minWidth: 100 }}
            >
              <option value="NVCL">NVCL</option>
              <option value="NVL">NVL</option>
            </SearchableSelect>
          </td>

          {/* Bill Type */}
          <td style={td({ background: r.isLocked ? autoGenBg : baseBg })}>
            <SearchableSelect variant="standard" value={r.billType || 'FREIGHT'} onChange={e => handleRowEdit(r.invoiceNumber, 'billType', e.target.value)} disabled={r.isLocked} style={{ ...selStyle, color: r.isLocked ? '#0369a1' : 'inherit', minWidth: 130 }}>
              {BILL_TYPES.map(b => <option key={b} value={b}>{b}</option>)}
            </SearchableSelect>
          </td>

          {/* Amount */}
          <td style={td({ textAlign: 'right', background: r.isLocked ? autoGenBg : baseBg })}>
            <input
              type="number"
              value={r.amount || ''}
              onChange={e => handleRowEdit(r.invoiceNumber, 'amount', e.target.value)}
              disabled={r.isLocked}
              style={{ ...iStyle, textAlign: 'right', fontWeight: 600, color: r.isLocked ? '#0369a1' : 'inherit' }}
              placeholder="0"
            />
          </td>

          {/* CGST */}
          <td style={td({ textAlign: 'right', background: calcBg, color: '#166534' })}>₹{r.cgst?.toLocaleString('en-IN')}</td>
          {/* SGST */}
          <td style={td({ textAlign: 'right', background: calcBg, color: '#166534' })}>₹{r.sgst?.toLocaleString('en-IN')}</td>
          {/* Total Amount */}
          <td style={td({ textAlign: 'right', background: calcBg, fontWeight: 700, color: '#166534' })}>₹{r.totalAmount?.toLocaleString('en-IN')}</td>
          {/* TDS */}
          <td style={td({ textAlign: 'right', background: calcBg, fontWeight: 600, color: '#166534' })}>₹{r.tds?.toLocaleString('en-IN')}</td>
          {/* Receivable */}
          <td style={td({ textAlign: 'right', background: calcBg, fontWeight: 800, color: '#166534' })}>₹{r.receivable?.toLocaleString('en-IN')}</td>

          {/* Payment Amount — grouped cell */}
          {(!gid || isGroupStart) && (
            <td style={td({ background: paymentBg })} rowSpan={rowSpan}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <input
                  type="number"
                  value={gd.paymentAmount || ''}
                  onChange={e => handleInlineEdit(gid, 'paymentAmount', e.target.value, gd)}
                  style={{ ...iStyle, textAlign: 'right', fontWeight: 800, color: '#1e293b' }}
                  placeholder="0"
                />
                <label style={{ cursor: 'pointer', textAlign: 'right' }}>
                  <span style={{ fontSize: 10, color: '#4f46e5', fontWeight: 600, border: '1px solid #818cf8', borderRadius: 4, padding: '2px 6px', background: '#fff' }}>
                    {uploadingGroup === gid ? 'Uploading…' : gd.paymentProofUrl ? 'Change Proof' : 'Upload Proof'}
                  </span>
                  <input type="file" hidden accept=".pdf,image/*" onChange={e => { if (e.target.files[0]) handleFileUpload(gid, e.target.files[0], gd); }} />
                </label>
                {gd.paymentProofUrl && <a href={gd.paymentProofUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#3b82f6', textAlign: 'right', fontWeight: 600 }}>View Proof</a>}
              </div>
            </td>
          )}

          {/* TDS Provision */}
          {(!gid || isGroupStart) && (
            <td style={td({ background: paymentBg })} rowSpan={rowSpan}>
              <input type="number" value={gd.tdsProvision || ''} onChange={e => handleInlineEdit(gid, 'tdsProvision', e.target.value, gd)} style={{ ...iStyle, textAlign: 'right', fontWeight: 700, color: '#0f172a' }} placeholder="0" />
            </td>
          )}

          {/* Difference */}
          {(!gid || isGroupStart) && (
            <td style={td({ textAlign: 'right', background: paymentBg, fontWeight: 800, color: groupDiff < 0 ? '#dc2626' : (groupDiff === 0 ? '#166534' : '#b45309') })} rowSpan={rowSpan}>
              {isGroupStart ? \`₹\${groupDiff.toLocaleString('en-IN')}\` : ''}
            </td>
          )}

          {/* Payment Date */}
          {(!gid || isGroupStart) && (
            <td style={td({ textAlign: 'center', background: paymentBg, fontWeight: 600, color: '#334155' })} rowSpan={rowSpan}>
              {gd.paymentDate ? (() => {
                const p = gd.paymentDate.split('-');
                return p.length === 3 ? \`\${p[2]}/\${p[1]}/\${p[0]}\` : gd.paymentDate;
              })() : ''}
            </td>
          )}

          {/* Reference No */}
          {(!gid || isGroupStart) && (
            <td style={td({ background: paymentBg, fontWeight: 600, color: '#334155' })} rowSpan={rowSpan}>
              {gd.referenceNo || ''}
            </td>
          )}

          {/* Debit Amount */}
          {(!gid || isGroupStart) && (
            <td style={td({ background: paymentBg })} rowSpan={rowSpan}>
              <input
                type="number"
                value={gd.debitAmount || ''}
                onChange={e => handleInlineEdit(gid, 'debitAmount', e.target.value, gd)}
                style={{ ...iStyle, textAlign: 'right', fontWeight: 700, color: '#0f172a' }}
                placeholder="0"
              />
            </td>
          )}

          {/* Debit Reasons (per row) */}
          <td style={td({ background: paymentBg })}>
            <SearchableSelect variant="standard" value={r.debitReason || 'None'} onChange={e => handleRowEdit(r.invoiceNumber, 'debitReason', e.target.value)} style={{ ...selStyle, minWidth: 200, fontWeight: 600, color: '#334155' }}>
              {DEBIT_REASONS.map(d => <option key={d} value={d}>{d}</option>)}
            </SearchableSelect>
          </td>

          {/* Remarks */}
          {(!gid || isGroupStart) && (
            <td style={td({ background: paymentBg })} rowSpan={rowSpan}>
              <textarea value={gd.remarks || ''} onChange={e => handleInlineEdit(gid, 'remarks', e.target.value, gd)} style={{ ...iStyle, resize: 'vertical', minHeight: '36px', fontFamily: 'inherit', color: '#334155' }} />
            </td>
          )}
        </tr>
      </React.Fragment>
    );
  };
`;

const startIndex = content.indexOf("  // ── Render a single row (native HTML only — no MUI inside cells) ──");
const endIndex = content.indexOf("  const thStyle = (extra = {}) => ({");

if (startIndex === -1 || endIndex === -1) {
  console.log("Could not find start or end index.");
  process.exit(1);
}

const newContent = content.substring(0, startIndex) + replacement + content.substring(endIndex);
fs.writeFileSync(path, newContent, 'utf8');
console.log("Successfully replaced renderRow.");
