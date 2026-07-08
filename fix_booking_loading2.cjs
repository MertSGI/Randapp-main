const fs = require('fs');
let bp = fs.readFileSync('pages/BookingPage.tsx', 'utf8');
bp = bp.replace(/\{translations\[language\]\.salon\.account_suspended \|\| '\{translations\[language\]\.salon\.account_suspended \|\| 'Hizmet Geçici Olarak Kapalı'\}'\}/g, "{translations[language].salon.account_suspended || 'Hizmet Geçici Olarak Kapalı'}");
bp = bp.replace(/\{translations\[language\]\.salon\.account_suspended 'Hizmet Geçici Olarak Kapalı'\}/g, "{translations[language].salon.account_suspended || 'Hizmet Geçici Olarak Kapalı'}");
fs.writeFileSync('pages/BookingPage.tsx', bp);
