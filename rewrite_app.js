const fs = require('fs');
const path = 'frontend/review-dashboard/UI2/src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add import for CinematicSystem
if (!content.includes('CinematicSystem')) {
    content = content.replace(/import AiExtraExpense from '\.\/pages\/AiExtraExpense';/, "import AiExtraExpense from './pages/AiExtraExpense';\nimport { FloatingSurface } from './components/CinematicSystem';");
}

// 2. Add isTransitioning state and handleViewChange function
const stateInject = `  const [voucherInvoiceData, setVoucherInvoiceData] = useState(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const handleViewChange = (newView) => {
    setIsTransitioning(true);
    setTimeout(() => {
        setCurrentView(newView);
        setIsTransitioning(false);
    }, 400); // Cinematic transition duration
  };
`;
content = content.replace(/  const \[voucherInvoiceData, setVoucherInvoiceData\] = useState\(null\);/, stateInject);

// 3. Replace all setCurrentView with handleViewChange EXCEPT the one inside handleViewChange
// Since we might match the one we just added, let's be careful.
// First temporarily change the one we just added to __SET_CURRENT_VIEW__
content = content.replace(/setCurrentView\(newView\);/, '__SET_CURRENT_VIEW__');

// Now replace all remaining setCurrentView with handleViewChange
content = content.replace(/setCurrentView\(/g, 'handleViewChange(');

// Now restore the original
content = content.replace(/__SET_CURRENT_VIEW__/, 'setCurrentView(newView);');

// 4. Wrap the entire return structure in FloatingSurface.
// The easiest way is to wrap the returned component block of the `AppContent` function.
// `AppContent` has multiple `if (currentView === ...)` blocks that return JSX.
// This means we have to wrap *every single return statement* in AppContent with `<FloatingSurface isTransitioning={isTransitioning}> ... </FloatingSurface>`.
// Instead of replacing every return, we can just extract the routing logic into an inner component or a function, but that might mess up hooks.
// An easier way is to create a wrapper around the currentView rendering logic.
