const fs = require('fs');
let c = fs.readFileSync('App.tsx', 'utf8');
fs.writeFileSync('App.log', c);
