const fs = require('fs');
let content = fs.readFileSync('backend-node/routes/financialYearRoutes.js', 'utf8');

// The conflicts in this file are due to erroneous insertions of my commit into /data.
// So for this file, we want to KEEP the HEAD side and DISCARD my commit's side for the conflicted blocks.

const conflictRegex = /<<<<<<< HEAD\n([\s\S]*?)=======\n[\s\S]*?>>>>>>> [^\n]+\n/g;

content = content.replace(conflictRegex, (match, p1) => {
  return p1; // Keep the HEAD part
});

fs.writeFileSync('backend-node/routes/financialYearRoutes.js', content);
console.log('Resolved financialYearRoutes.js');
