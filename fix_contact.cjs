const fs = require('fs');

let c = fs.readFileSync('pages/ContactPage.tsx', 'utf8');
c = c.replace(/autocomplete=/g, 'autoComplete=');
fs.writeFileSync('pages/ContactPage.tsx', c);
