const fs = require('fs');
let bp = fs.readFileSync('pages/BookingPage.tsx', 'utf8');
bp = bp.replace(/\{translations\[language\]\.booking\.steps\[1\] \|\| '\{translations\[language\]\.booking\.steps\[1\] \|\| 'Hizmet Seçin'\}'\}/g, "{translations[language].booking.steps[1] || 'Hizmet Seçin'}");

bp = bp.replace(/\{language === 'tr' \? '\{language === 'tr' \? 'Geri Dön' : 'Go Back'\}' : 'Go Back'\}/g, "{language === 'tr' ? 'Geri Dön' : 'Go Back'}");

bp = bp.replace(/\{translations\[language\]\.booking\.steps\[0\] \|\| '\{translations\[language\]\.booking\.steps\[0\] \|\| 'Uzman Seçin'\}'\}/g, "{translations[language].booking.steps[0] || 'Uzman Seçin'}");

bp = bp.replace(/<span className="font-medium text-gray-700 dark:text-gray-300">bugün<\/span>/gi, '<span className="font-medium text-gray-700 dark:text-gray-300">{language === \'tr\' ? \'Bugün\' : \'Today\'}</span>');

fs.writeFileSync('pages/BookingPage.tsx', bp);
