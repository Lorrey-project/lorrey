const fs = require('fs');
const path = 'frontend/review-dashboard/UI2/src/components/Dashboard.jsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add imports
if (!content.includes('Hero3DObject')) {
    content = content.replace(/import \{.*?\} from '@mui\/material';/s, (match) => {
        return match + "\nimport { Hero3DObject, ModuleCard3D } from './CinematicSystem';";
    });
}

// 2. Remove the old cinematic wrapper from Dashboard (we moved it to FloatingSurface in App.jsx)
// Our previous rewrite of Dashboard.jsx added `<Box sx={{ p: 2, minHeight: '100vh', ... }}>`
// and `<CinematicBackground>`. But wait, in the previous turn I added those *inside* Dashboard.jsx.
// Now that App.jsx handles the FloatingSurface, we can just remove the old cinematic particle background from Dashboard.jsx
// since `CinematicBackground` is now behind `FloatingSurface` in `App.jsx`.

content = content.replace(/\{\/\* Cinematic Background Particles & Glow \*\/\}[\s\S]*?\{\/\* Cinematic Background Typography \*\/\}[\s\S]*?<\/Typography>\s*<Box sx=\{\{ position: 'relative', zIndex: 1 \}\}>/, '');

// Actually, keep the Cinematic Typography in Dashboard.jsx! It's cool.
// So let's just find the particle box and remove it.
content = content.replace(/\{\/\* Cinematic Background Particles & Glow \*\/\}[\s\S]*?\{\/\* Cinematic Background Typography \*\/\}/, '{/* Cinematic Background Typography */}');

// 3. Add the Hero3DObject at the top of the dashboard content
const heroInsertPoint = content.indexOf('{/* ── Hero Section (Invoices & Daily Summary) ─────────────────────────── */}');
if (heroInsertPoint > -1 && !content.includes('<Hero3DObject />')) {
    const heroCode = `
                    {/* ── 3D Hero Visual Section ─────────────────────────── */}
                    <Box sx={{ mb: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                        <Typography variant="h2" fontWeight={900} sx={{ letterSpacing: '-1.5px', color: '#fff', mb: 1 }}>
                            LORREY
                        </Typography>
                        <Typography variant="subtitle1" fontWeight={500} sx={{ color: '#94a3b8', letterSpacing: 2, textTransform: 'uppercase', mb: 4 }}>
                            Business Management & Financial Control
                        </Typography>
                        <Hero3DObject />
                    </Box>
                    `;
    content = content.substring(0, heroInsertPoint) + heroCode + content.substring(heroInsertPoint);
}

// 4. Replace standard MUI Cards with ModuleCard3D for the grid items
// We need to replace things like:
// <Card onClick={onOpenCementRegister} sx={{...}}> <CardContent> ... </CardContent> </Card>
// with <ModuleCard3D title="CEMENT REGISTER" subtitle="Trip & Freight Management" icon={<LocalShippingIcon sx={{ fontSize: 32 }} />} onClick={onOpenCementRegister} />

// This is complex to do with pure regex on 1700 lines of JSX.
// Instead of replacing every single card manually in code, let's just alias Card to ModuleCard3D for those specific grid loops.
// Let's replace the map functions that render cards.

// High Priority Registers loop:
content = content.replace(/<Card\s+onClick=\{item\.onClick\}[\s\S]*?<\/Card>/g, '<ModuleCard3D title={item.title} subtitle={item.subtitle} icon={item.icon} onClick={item.onClick} />');

// Remove the now-unused CardContent from those loops. Wait, the regex above replaces the entire Card block.
// But what about manually written cards?
// The Pie Chart:
content = content.replace(/<Card\s+onClick=\{onOpenPieChart\}[\s\S]*?<\/Card>/, '<ModuleCard3D title="PIE CHART" subtitle="Financial analytics & visual reports" icon={<PieChartIcon sx={{ fontSize: 32 }} />} onClick={onOpenPieChart} />');

fs.writeFileSync(path, content, 'utf8');
console.log('Dashboard refactored for CinematicSystem.');
