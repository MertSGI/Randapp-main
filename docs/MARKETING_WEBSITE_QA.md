# LARİ Marketing Website QA Guide

## Overview
This document outlines the testing requirements for the public-facing Randapp marketing site.

## Accessing the Marketing Homepage for Testing
To view the marketing homepage depending on your environment:
- **Preview / Local Development (HashRouter):** Open `/#/`. If you are currently viewing something like `/#/super-admin/payment-test`, manually change the URL hash to `/#/` in your browser's address bar.
- **Production (BrowserRouter):** Open `/`.

**Expected Setup:**
- Component: `MarketingHomePage`
- Layout: `MarketingLayout`
- Top Navigation: Ana Sayfa, Özellikler, Fiyatlar, Demo Oluştur, İletişim, Giriş Yap

## Test Cases

1. **Homepage Explains Product Quicky**
   - Verify the main headline and subheadline convey "Mini Website + Online Booking" within seconds.

2. **Primary CTA goes to /demo**
   - Click "Kendi Salonumu Önizle" (or similar) on the homepage. Result should be `/demo`.

3. **Pricing CTAs Work**
   - Verify that "Bu Planı Seç" or "Başla" links on Pricing page correctly route to `/demo` or a WhatsApp contact link (mocking real signup).
   - "Abonelik Talep Et" goes to WhatsApp.

4. **Contact WhatsApp Works**
   - Verify that clicking WhatsApp buttons properly formats the message.

5. **Demo Preview Works**
   - Navigating to `/demo` provides the demo generator, demonstrating the "Mini Website" feel.

6. **Mobile Nav Works**
   - Ensure the standard `MarketingLayout` navigation is accessible on small screens.

7. **No Admin Links in Marketing Nav**
   - Verify the public header does not show internal links (e.g., Dashboard, Reports, Settings).
   - Verify no Super Admin links exist.

8. **No Dead Buttons**
   - Click every button on the Marketing site. If a feature is not ready, it should at least show an alert/toast indicating "Sonraki fazda eklenecektir." or navigate to WhatsApp/Demo.

9. **SEO Title/Meta exists**
   - Check `index.html` for basic SEO tags (Title, Description, Open Graph tags).

10. **Build Passes**
    - Code compiles without Typescript errors or Vite bundle failures.
