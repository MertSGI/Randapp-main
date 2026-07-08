const fs = require('fs');

let c1 = fs.readFileSync('components/SalonWebsiteView.tsx', 'utf8');
c1 = c1.replace(/businessProfile\?\.description/g, "businessProfile?.about_text");
c1 = c1.replace(/\{businessProfile.description\}/g, "{businessProfile.about_text}");
// Remove the inner block rendering about_text so we don't render it twice
c1 = c1.replace(/\{businessProfile\.about_text && \(\s*<div className="text-gray-600 dark:text-gray-400 whitespace-pre-line leading-relaxed text-sm md:text-base pt-4 border-t border-gray-100 dark:border-slate-700">\s*\{businessProfile\.about_text\}\s*<\/div>\s*\)\}/, '');
c1 = c1.replace(/staff\.image \|\| staff\.avatar/g, "staff.image");
c1 = c1.replace(/staff\.roles\?\.join\(\', \'\) \|\| staff\.title/g, "staff.title");
c1 = c1.replace(/businessProfile\?\.facebook_url/g, "businessProfile?.website_url");
c1 = c1.replace(/businessProfile\.facebook_url/g, "businessProfile.website_url");
fs.writeFileSync('components/SalonWebsiteView.tsx', c1);

let c2 = fs.readFileSync('pages/BookingPage.tsx', 'utf8');
c2 = c2.replace(/staff\.avatar \?/g, "staff.image ?");
c2 = c2.replace(/staff\.avatar/g, "staff.image");
c2 = c2.replace(/staff\.roles\?\.join\(\', \'\)/g, "staff.title");
fs.writeFileSync('pages/BookingPage.tsx', c2);
