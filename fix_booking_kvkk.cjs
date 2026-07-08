const fs = require('fs');
let c = fs.readFileSync('pages/BookingPage.tsx', 'utf8');

if (!c.includes('KVKK')) {
  c = c.replace(
      '<span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">\\n                            {t.booking.form.save_details}\\n                          </span>',
      '<span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">\\n                            {t.booking.form.save_details}\\n                          </span>'
  );
  // Actually let's just insert it after the span.
  c = c.replace(
    /(\{t\.booking\.form\.save_details\}\s*<\/span>\s*<\/label>\s*<\/div>)/,
    "$1\n                    <p className=\"text-xs text-gray-500 mt-2 ml-8\">Kişisel verileriniz KVKK kapsamında işlenmektedir. Yalnızca randevu iletişimi için kullanılacaktır.</p>"
  );
  fs.writeFileSync('pages/BookingPage.tsx', c);
}
