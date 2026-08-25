const fs = require('fs');
const path = 'frontend/review-dashboard/UI2/src/components/Dashboard.jsx';
let content = fs.readFileSync(path, 'utf8');

// Replace the stray </Box> and </Container> around line 1318
content = content.replace('                    </Dialog>\n                </Box>\n            </Container>\n\n            {/* ── Delete confirmation dialog ── */}', 
                          '                    </Dialog>\n\n            {/* ── Delete confirmation dialog ── */}');

// Add </Container> after the cards but before the first Dialog
content = content.replace('                        </>\n                    );\n                })()}\n\n                    {/* ── Fuel Rate Update Dialog',
                          '                        </>\n                    );\n                })()}\n            </Container>\n\n                    {/* ── Fuel Rate Update Dialog');

fs.writeFileSync(path, content, 'utf8');
console.log('Fixed syntax errors.');
