const fs = require('fs');

// 1. Translations file
let tr = fs.readFileSync('utils/translations.ts', 'utf8');

if (!tr.includes('t_admin_payment_test')) {
  tr = tr.replace(/super_admin_nav: \{/, `super_admin_nav: {
      t_admin_dashboard_title: 'Platform Overview',
      t_admin_ready_for_review: 'Ready for Review',
      t_admin_approve_go_live: 'Approve & Go Live',
      t_admin_send_back: 'Send Back',
      t_admin_manage: 'Manage',
      t_admin_pause: 'Pause Booking',
      t_admin_contact: 'Contact',
      t_admin_payment_test: 'Payment Test',
      t_admin_ai_settings: 'AI Settings',
      t_admin_plans: 'Plans & Pricing',
      t_admin_reports: 'Reports',
      t_admin_settings: 'Settings',
      t_admin_onboarding: 'Onboarding',
      t_admin_payments: 'Payments',
`);
  // And for TR we would also need to inject this, or just replace instances directly in SuperAdminLayout.tsx.
}

fs.writeFileSync('utils/translations.ts', tr);

// 2. BookingPage.tsx
let bp = fs.readFileSync('pages/BookingPage.tsx', 'utf8');
bp = bp.replace(/Hizmet Geçici Olarak Kapalı/g, "{translations[language].salon.account_suspended || 'Hizmet Geçici Olarak Kapalı'}");
bp = bp.replace(/Uzman Seçin/g, "{translations[language].booking.steps[0] || 'Uzman Seçin'}");
bp = bp.replace(/Hizmet Seçin/g, "{translations[language].booking.steps[1] || 'Hizmet Seçin'}");
bp = bp.replace(/<span className="font-medium text-gray-700 dark:text-gray-300">Bugün<\/span>/g, '<span className="font-medium text-gray-700 dark:text-gray-300">{language === \'tr\' ? \'Bugün\' : \'Today\'}</span>');
bp = bp.replace(/Yükleniyor.../g, "{language === 'tr' ? 'Yükleniyor...' : 'Loading...'}");
bp = bp.replace(/Geri Dön/g, "{language === 'tr' ? 'Geri Dön' : 'Go Back'}");
fs.writeFileSync('pages/BookingPage.tsx', bp);

// 3. SuperAdminLayout
let sal = fs.readFileSync('components/layouts/SuperAdminLayout.tsx', 'utf8');
sal = sal.replace(/\{ label: 'Payments', path: '\/super-admin\/payments' \}/g, "{ label: t.super_admin_nav?.payments || 'Payments', path: '/super-admin/payments' }");
sal = sal.replace(/\{ label: 'Onboarding', path: '\/super-admin\/onboarding' \}/g, "{ label: t.super_admin_nav?.onboarding || 'Onboarding', path: '/super-admin/onboarding' }");
sal = sal.replace(/\{ label: 'Reports', path: '\/super-admin\/reports' \}/g, "{ label: t.super_admin_nav?.reports || 'Reports', path: '/super-admin/reports' }");
sal = sal.replace(/\{ label: 'Settings', path: '\/super-admin\/settings' \}/g, "{ label: t.super_admin_nav?.settings || 'Settings', path: '/super-admin/settings' }");
sal = sal.replace(/\{ label: 'Payment Test', path: '\/super-admin\/payment-test' \}/g, "{ label: t.super_admin_nav?.payment_test || 'Payment Test', path: '/super-admin/payment-test' }");
sal = sal.replace(/\{ label: 'AI Settings', path: '\/super-admin\/ai-settings' \}/g, "{ label: t.super_admin_nav?.ai_settings || 'AI Settings', path: '/super-admin/ai-settings' }");
sal = sal.replace(/\{ label: 'Plans & Pricing', path: '\/super-admin\/plans' \}/g, "{ label: t.super_admin_nav?.plans || 'Plans & Pricing', path: '/super-admin/plans' }");
fs.writeFileSync('components/layouts/SuperAdminLayout.tsx', sal);

// 4. BillingTab.tsx
let bt = fs.readFileSync('components/BillingTab.tsx', 'utf8');
bt = bt.replace(/Yıllık planda ücretsiz \.com dahil!/g, "Yıllık planda manuel özel alan adı desteği");
bt = bt.replace(/Free \.com included with annual plan!/g, "Manual custom domain support with annual plan");
bt = bt.replace(/Ücretsiz \.com\/net dahil/gi, "Manuel özel alan adı desteği");
bt = bt.replace(/Free \.com\/\.net included/gi, "Manual custom domain support");
fs.writeFileSync('components/BillingTab.tsx', bt);

// 5. PricingPage.tsx
let pp = fs.readFileSync('pages/PricingPage.tsx', 'utf8');
fs.writeFileSync('pages/PricingPage.tsx', pp); // Note: we already updated translations for PricingPage in previous steps.

// 6. SuperAdminPlansPage.tsx
let sapp = fs.readFileSync('pages/super-admin/SuperAdminPlansPage.tsx', 'utf8');
sapp = sapp.replace(/Yıllık planda ücretsiz \.com dahil/g, "Yıllık planda manuel özel alan adı desteği");
sapp = sapp.replace(/Free \.com included/g, "Manual custom domain support");
fs.writeFileSync('pages/super-admin/SuperAdminPlansPage.tsx', sapp);

// 7. geminiService.ts
let gs = fs.readFileSync('services/geminiService.ts', 'utf8');
gs = gs.replace(/import \{ GoogleGenAI \} from "@google\/genai";\n?/g, "");
gs = gs.replace(/const ai = new GoogleGenAI\(\{ apiKey: 'mock' \}\);\n?/g, "");
fs.writeFileSync('services/geminiService.ts', gs);

// 8. AIVisualizerPage
let avp = fs.readFileSync('pages/AIVisualizerPage.tsx', 'utf8');
avp = avp.replace(/1K\/2K\/4K/g, "");
avp = avp.replace(/<div className="mb-6 flex gap-2">[\s\S]*?<\/div>/g, ""); // strip exact selectors if any. We will check it later.
fs.writeFileSync('pages/AIVisualizerPage.tsx', avp);
