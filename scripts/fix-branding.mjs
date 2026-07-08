import fs from 'fs';

const filesToUpdate = [
  'pages/ContactPage.tsx',
  'pages/customer/CustomerLoginPage.tsx',
  'pages/customer/CustomerPortalPage.tsx',
  'components/layouts/MarketingLayout.tsx',
  'components/layouts/SalonBookingLayout.tsx',
  'contexts/LanguageContext.tsx',
  'components/OnboardingWizard.tsx'
];

for (const file of filesToUpdate) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/Randapp/g, 'LARİ');
    // For translation context, maybe randapp is lowercase
    content = content.replace(/randapp\.com/g, 'lari.com');
    fs.writeFileSync(file, content);
    console.log('Updated ' + file);
  }
}
