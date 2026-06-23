const fs = require('fs');
const path = '/Users/soumodeeproy/Desktop/lorrey-project-code 2/frontend/review-dashboard/UI2/src/pages/CementRegister.jsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add columns to the end of COLUMNS
content = content.replace(
  "  { key: 'Transporting Coast', label: 'TRANSPORTING COAST', width: 160, type: 'manual', group: 'owner' },\n];",
  `  { key: 'Transporting Coast', label: 'TRANSPORTING COAST', width: 160, type: 'manual', group: 'owner' },
  {
    key: 'PAYMENT STATUS',
    label: 'PAYMENT\\nSTATUS',
    width: 110,
    type: 'auto',
    group: 'payment',
    hint: 'Payment status from Account Details'
  },
  {
    key: 'PAYMENT DATE',
    label: 'PAYMENT\\nDATE',
    width: 120,
    type: 'auto',
    group: 'payment',
    hint: 'Transaction date of the mapped payment'
  },
  {
    key: 'PAYMENT REF',
    label: 'PAYMENT\\nREF',
    width: 150,
    type: 'auto',
    group: 'payment',
    hint: 'Reference No / Cheque No from Account Details'
  },
  {
    key: 'DIFFERENCE',
    label: 'DIFFERENCE',
    width: 110,
    type: 'calc',
    group: 'payment',
    hint: 'Payment Received (Bank TF) - Bill Amount',
    formula: r => {
      const bankTf = parseFloat(String(r['Bank TF']).replace(/,/g, '')) || 0;
      const billAmt = (parseFloat(String(r['GROSS AMOUNT']).replace(/,/g, '')) || 0) || (parseFloat(String(r['NET AMOUNT']).replace(/,/g, '')) || 0);
      if (!bankTf && !billAmt) return '';
      return (bankTf - billAmt).toFixed(2);
    }
  },
];`
);

// 2. Add 'payment' group to GROUP_COLORS
content = content.replace(
  "  owner: { bg: '#f0fdf4', border: '#86efac' },\n};",
  "  owner: { bg: '#f0fdf4', border: '#86efac' },\n  payment: { bg: '#f0f9ff', border: '#7dd3fc' },\n};"
);

// 3. Render chips for PAYMENT STATUS and DIFFERENCE
content = content.replace(
  "{value || ''}\n      </td>",
  `{col.key === 'PAYMENT STATUS' && value ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            padding: '2px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: 800,
            background: value === 'Paid' ? '#dcfce7' : value === 'Partial' ? '#fef08a' : '#f1f5f9',
            color: value === 'Paid' ? '#166534' : value === 'Partial' ? '#854d0e' : '#475569',
            border: \`1px solid \${value === 'Paid' ? '#86efac' : value === 'Partial' ? '#fde047' : '#e2e8f0'}\`
          }}>
            {value === 'Paid' ? '✓ Paid'
             : value === 'Partial' ? '⚡ Partial'
             : value}
          </span>
        ) : col.key === 'DIFFERENCE' && value ? (
          <span style={{
            color: parseFloat(value) > 0 ? '#15803d' : parseFloat(value) < 0 ? '#dc2626' : '#64748b',
            fontWeight: parseFloat(value) !== 0 ? 800 : 400
          }}>
            {parseFloat(value) > 0 ? \`+\${value}\` : value}
          </span>
        ) : value || ''}
      </td>`
);

// 4. Update wizard save function
content = content.replace(
  /const handleWizardImportConfirm = \(\) => \{[\s\S]*?setAcceptWarnings\(false\);\n  \};/,
  `const handleWizardImportConfirm = async () => {
    const rows = wizardPreview?.filteredRows;
    if (!rows?.length) return;
    
    setWizardImporting(true);

    try {
      const token = localStorage.getItem('token');
      await axios.post(\`\${API_URL}/cement-register/bulk\`, { entries: rows }, {
        headers: { Authorization: \`Bearer \${token}\` }
      });
      setSnack({ severity: 'success', msg: \`Successfully saved \${rows.length} rows directly to the MongoDB database!\` });
      setSaveCompleted(true);
      fetchData();
      
      setTimeout(() => {
        setSaveCompleted(false);
      }, 5000);
      
      setShowExcelWizard(false);
      setWizardStep(1);
      setWizardPreview(null);
      setValidationResult({ errors: [], warnings: [] });
      setAcceptWarnings(false);
    } catch (err) {
      console.error(err);
      setSnack({ severity: 'error', msg: 'Failed to save to database: ' + err.message });
    } finally {
      setWizardImporting(false);
    }
  };`
);

// 5. Add wizardImporting state if not present
if (!content.includes('const [wizardImporting')) {
  content = content.replace(
    "const [wizardPreview, setWizardPreview] = useState(null); // parsed result",
    "const [wizardPreview, setWizardPreview] = useState(null); // parsed result\n  const [wizardImporting, setWizardImporting] = useState(false);"
  );
}

// 6. Update Wizard modal button
content = content.replace(
  /Import \{wizardPreview\.filteredRows\.length\} Rows to Register/,
  `{wizardImporting ? 'Saving to Database...' : saveCompleted ? 'Saved Successfully' : \`Save \${wizardPreview.filteredRows.length} Rows to Database\`}`
);

content = content.replace(
  /disabled=\{wizardPreview\.filteredRows\.length === 0 \|\| \(validationResult\.errors\.length > 0\) \|\| \(validationResult\.warnings\.length > 0 && !acceptWarnings\)\}/,
  `disabled={wizardImporting || saveCompleted || wizardPreview.filteredRows.length === 0 || validationResult.errors.length > 0 || (validationResult.warnings.length > 0 && !acceptWarnings)}`
);

fs.writeFileSync(path, content);
console.log('Edits applied successfully!');
