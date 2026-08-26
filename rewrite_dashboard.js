const fs = require('fs');

const path = 'frontend/review-dashboard/UI2/src/components/Dashboard.jsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add cinematic background wrapper
const cinematicWrapper = `
        <Box sx={{ 
            p: 2, 
            minHeight: '100vh',
            position: 'relative',
            overflowY: 'auto',
            overflowX: 'hidden'
        }}>
            {/* Cinematic Background Particles & Glow */}
            <Box sx={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0, pointerEvents: 'none',
                background: 'radial-gradient(circle at 50% 0%, rgba(26,115,232,0.05) 0%, transparent 60%)',
                opacity: 0.8
            }}>
                <style>
                    {\`
                        @keyframes float1 { 0% { transform: translateY(0px) translateX(0px); opacity: 0; } 50% { opacity: 0.5; } 100% { transform: translateY(-100px) translateX(50px); opacity: 0; } }
                        @keyframes float2 { 0% { transform: translateY(0px) translateX(0px); opacity: 0; } 50% { opacity: 0.3; } 100% { transform: translateY(-150px) translateX(-50px); opacity: 0; } }
                        .particle { position: absolute; background: white; border-radius: 50%; pointer-events: none; }
                    \`}
                </style>
                {[...Array(15)].map((_, i) => (
                    <div key={i} className="particle" style={{
                        left: \`\${Math.random() * 100}%\`,
                        top: \`\${Math.random() * 100}%\`,
                        width: \`\${Math.random() * 3 + 1}px\`,
                        height: \`\${Math.random() * 3 + 1}px\`,
                        animation: \`\${i % 2 === 0 ? 'float1' : 'float2'} \${Math.random() * 10 + 10}s linear infinite\`,
                        animationDelay: \`-\${Math.random() * 10}s\`
                    }} />
                ))}
            </Box>

            {/* Cinematic Background Typography */}
            <Typography variant="h1" sx={{
                position: 'absolute', top: '15%', left: '-5%', fontSize: { xs: '100px', md: '200px' },
                fontWeight: 900, color: '#ffffff', opacity: 0.015, zIndex: 0, pointerEvents: 'none',
                userSelect: 'none', letterSpacing: '-5px', transform: 'rotate(-5deg)'
            }}>
                FINANCE
            </Typography>
            <Typography variant="h1" sx={{
                position: 'absolute', bottom: '10%', right: '-5%', fontSize: { xs: '100px', md: '200px' },
                fontWeight: 900, color: '#ffffff', opacity: 0.015, zIndex: 0, pointerEvents: 'none',
                userSelect: 'none', letterSpacing: '-5px', transform: 'rotate(5deg)'
            }}>
                LOGISTICS
            </Typography>

            <Box sx={{ position: 'relative', zIndex: 1 }}>
`;

// Find `<Box sx={{ p: 2, height: '100vh', overflowY: 'auto' }}>` and replace with wrapper
content = content.replace(/<Box sx=\{\{\s*p:\s*2,\s*height:\s*'100vh',\s*overflowY:\s*'auto'\s*\}\}>/, cinematicWrapper);

// Ensure the closing </Box> is added at the end (before fragments)
content = content.replace(/(<\/Box>\s*)(<Dialog)/, '$1</Box>\n            $2');

// 2. Replace hardcoded light gradients
content = content.replace(/background:\s*'linear-gradient\(135deg, #f8fafc 0%, #e2e8f0 100%\)'/g, "bgcolor: 'background.paper'");

// 3. Update the PIE CHART icon background inside Dashboard.jsx to use deep dark aesthetics instead of #f1f5f9
content = content.replace(/bgcolor:\s*'#f1f5f9'/g, "bgcolor: 'rgba(255,255,255,0.05)'");
content = content.replace(/boxShadow:\s*'inset 0 2px 4px rgba\(0,0,0,0\.05\)'/g, "boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'");
content = content.replace(/color:\s*'#475569'/g, "color: '#cbd5e1'");

// 4. Also fix the Total Payment Reports in Dashboard (they were in a Grid item)
// To prevent layout breakage, let's just make sure color contrasts are handled.
content = content.replace(/color:\s*'#0f172a'/g, "color: '#f8fafc'");
content = content.replace(/color:\s*'#334155'/g, "color: '#f8fafc'");
content = content.replace(/color:\s*'#64748b'/g, "color: '#94a3b8'");
content = content.replace(/color:\s*'#475569'/g, "color: '#cbd5e1'");

// 5. Light gradients to dark cinematic ones
content = content.replace(/background:\s*'linear-gradient\(135deg, #4c1d95 0%, #6d28d9 100%\)'/g, "background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)'");
content = content.replace(/background:\s*'linear-gradient\(135deg, #0c3547 0%, #0f4c6e 80%, #1565c0 100%\)'/g, "background: 'linear-gradient(135deg, #020617 0%, #0f172a 80%, #1e3a8a 100%)'");

fs.writeFileSync(path, content, 'utf8');
console.log('Dashboard rewritten.');
