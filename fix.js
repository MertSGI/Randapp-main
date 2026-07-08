const fs = require('fs');
let c = fs.readFileSync('pages/DemoLandingPage.tsx', 'utf8');
c = c.split('\n').map(l => l.replace(/^[0-9]+: /, '')).join('\n');
fs.writeFileSync('pages/DemoLandingPage.tsx', c);
