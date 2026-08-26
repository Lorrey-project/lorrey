const fs = require('fs');
const path = 'frontend/review-dashboard/UI2/src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

// The goal is to take everything after `if (loading) { ... }` up to the end of `AppContent`
// and put it inside `const renderView = () => { ... }`.
// Then `AppContent` returns `<FloatingSurface isTransitioning={isTransitioning}>{renderView()}</FloatingSurface>`.

const appContentStart = content.indexOf('function AppContent() {');
const appContentEnd = content.indexOf('function App() {', appContentStart);

let appContentBody = content.substring(appContentStart, appContentEnd);

// Find the start of the routing logic (after the `if (!user)` block)
const routingStart = appContentBody.indexOf('if (!user) {');

// The `if (!user)` block returns early for Auth. We should keep Auth OUTSIDE the FloatingSurface, 
// OR we can put it inside. It's better inside so the login screen is also cinematic!
const renderViewStart = routingStart;

// Replace the routing with `const renderView = () => { ... }`
let newAppContentBody = appContentBody.substring(0, renderViewStart) + '\n  const renderView = () => {\n    ' + appContentBody.substring(renderViewStart).trim();

// At the end of `newAppContentBody`, it currently ends with `  return (\n    <InvoiceForm onBack={() => handleViewChange('dashboard')} />\n  );\n}`
// We need to close `renderView` and return the FloatingSurface.
newAppContentBody = newAppContentBody.replace(/  return \([\s\S]*?<InvoiceForm[\s\S]*?\);\n\}/, (match) => {
    return `    ${match.replace(/\n\}/, '\n  };\n\n  return (\n    <FloatingSurface isTransitioning={isTransitioning}>\n      {renderView()}\n    </FloatingSurface>\n  );\n}')}`;
});

content = content.substring(0, appContentStart) + newAppContentBody + content.substring(appContentEnd);

fs.writeFileSync(path, content, 'utf8');
console.log('App refactored successfully.');
