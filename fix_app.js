const fs = require('fs');
const path = 'frontend/review-dashboard/UI2/src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

// Add import
const importStatement = "import AnimatedWavesBackground from './components/AnimatedWavesBackground';\n";
content = content.replace("import AiExtraExpense from './pages/AiExtraExpense';", "import AiExtraExpense from './pages/AiExtraExpense';\n" + importStatement);

// Add the background to the return of AppContent
content = content.replace("    <Box sx={{\n        minHeight: '100vh',\n        bgcolor: '#f4f6f8',\n        transition: 'opacity 0.3s ease',\n        opacity: isTransitioning ? 0 : 1\n    }}>\n      {renderView()}\n    </Box>", "    <>\n      <AnimatedWavesBackground />\n      <Box sx={{\n          minHeight: '100vh',\n          bgcolor: 'rgba(244, 246, 248, 0.55)', // Translucent overlay\n          transition: 'opacity 0.3s ease',\n          opacity: isTransitioning ? 0 : 1\n      }}>\n        {renderView()}\n      </Box>\n    </>");

fs.writeFileSync(path, content, 'utf8');
console.log('App patched successfully.');
