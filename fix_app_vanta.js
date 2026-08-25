const fs = require('fs');
const path = 'frontend/review-dashboard/UI2/src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

// Replace imports
content = content.replace("import AnimatedWavesBackground from './components/AnimatedWavesBackground';", "import VantaTrunkBackground from './components/VantaTrunkBackground';");

// Replace JSX and overlay
content = content.replace("<AnimatedWavesBackground />", "<VantaTrunkBackground />");
content = content.replace("bgcolor: 'rgba(244, 246, 248, 0.55)', // Translucent overlay", "bgcolor: 'rgba(15, 20, 25, 0.6)', // Subtle dark overlay for Vanta");

fs.writeFileSync(path, content, 'utf8');
console.log('App patched successfully for Vanta.');
