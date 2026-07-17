const fs = require('fs');
let code = fs.readFileSync('frontend/review-dashboard/UI2/src/components/Dashboard.jsx', 'utf8');

const searchPDFDate = `slipDate={new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
const replacePDFDate = `slipDate={advanceFuelFormData.date ? advanceFuelFormData.date.split('-').reverse().join('/') : new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;

if (code.includes(searchPDFDate)) {
    code = code.replace(searchPDFDate, replacePDFDate);
    fs.writeFileSync('frontend/review-dashboard/UI2/src/components/Dashboard.jsx', code);
    console.log('PDF Date patched!');
} else {
    console.log('PDF Date string not found!');
}
