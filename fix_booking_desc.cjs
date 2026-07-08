const fs = require('fs');
let bp = fs.readFileSync('pages/BookingPage.tsx', 'utf8');
bp = bp.replace(/Bu salonun online randevu sistemi geçici olarak kullanılamıyor\. Lütfen işletme ile iletişime geçin\./g, "{translations[language].salon.account_suspended_desc}");
fs.writeFileSync('pages/BookingPage.tsx', bp);
