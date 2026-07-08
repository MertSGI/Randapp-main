const fs = require('fs');
let bp = fs.readFileSync('pages/BookingPage.tsx', 'utf8');
bp = bp.replace(/\{language === 'tr' \? '\{language === 'tr' \? 'Yükleniyor\.\.\.' : 'Loading\.\.\.'\}' : 'Loading\.\.\.'\}/g, "{language === 'tr' ? 'Yükleniyor...' : 'Loading...'}");
fs.writeFileSync('pages/BookingPage.tsx', bp);
