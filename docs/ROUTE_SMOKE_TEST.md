# Route Smoke Test Checklist

The application uses multiple distinct layouts depending on the user context and role. Use this manual checklist to verify routing behavior.

## Environment Setup
- Preview/Local: `VITE_ROUTER_MODE=hash` (using `/#/...`)
- Production: `VITE_ROUTER_MODE=browser` (using standard URLs like `/admin`)

## 1. Marketing / Public LARİ Site

**Expected Layout:** `MarketingLayout`
**Expected Nav:** Randapp Logo, Özellikler, Fiyatlar, Demo Oluştur, İletişim, Giriş Yap, Abonelik Talep Et (CTA). NO tenant booking/admin links.
**Expected Role:** Public / Unauthenticated

- [ ] `/#/` -> Renders Marketing Home Page
- [ ] `/#/features` -> Renders Features Page
- [ ] `/#/pricing` -> Renders Pricing Page
- [ ] `/#/demo` -> Renders Demo/Onboarding Form
- [ ] `/#/contact` -> Renders Contact Page
- [ ] `/#/login` -> Renders Login Page

## 2. Salon Public Booking Site

**Expected Layout:** `SalonBookingLayout`
**Expected Nav:** Tenant/Salon Name/Logo, Randevu Al (Book Now), Yapay Zeka ile Tavsiye (if AI enabled in plan), WhatsApp İletişim. NO marketing links or admin access.
**Expected Role:** Public / Tenant Customer

- [ ] `/#/book` -> Renders Booking Flow. Context must successfully pull tenant details.
- [ ] `/#/ai-visualizer` -> Renders AI Visualizer.
  - *Verify:* If tenant plan (`aiRecommendationsEnabled`) is `false`, must display "Bu özellik mevcut paketinizde aktif değildir." nav link should be hidden.
  - *Verify:* Privacy note is displayed.

## 3. Salon Admin Panel

**Expected Layout:** `AdminLayout`
**Expected Nav:** Salon Admin title, Siteyi Görüntüle, Logged in User Email. Inner tabs: Kurulum, Randevular, Hizmetler, Çalışanlar, Raporlar, Abonelik, Ayarlar.
**Expected Role:** `tenant_owner` (also accessible by `super_admin`)

- [ ] `/#/admin` -> Renders Setup/Overview
- [ ] `/#/admin/kurulum` -> Renders OnboardingWizard
- [ ] `/#/admin/randevular` -> Renders Appointments list
- [ ] `/#/admin/hizmetler` -> Renders Services manager
- [ ] `/#/admin/calisanlar` -> Renders Staff manager
- [ ] `/#/admin/raporlar` -> Renders Reports
- [ ] `/#/admin/abonelik` -> Renders BillingTab
- [ ] `/#/admin/ayarlar` -> Renders Settings placeholder

*Verify:* Unauthenticated access must redirect to `/#/login`.

## 4. Super Admin Platform Panel

**Expected Layout:** `SuperAdminLayout`
**Expected Nav:** Sidebar containing: Overview, Tenants, Subscriptions, Payments, Onboarding, Reports, Settings. Logged in User Email, Logout button. Header containing SUPER ADMIN badge and Theme toggle.
**Expected Role:** `super_admin` ONLY

- [ ] `/#/super-admin` -> Renders Platform Overview/Metrics Dashboard
- [ ] `/#/super-admin/tenants` -> Expected future placeholder or Tenants view
- [ ] `/#/super-admin/subscriptions` -> Expected future placeholder or Subscriptions view
- [ ] `/#/super-admin/payments` -> Expected future placeholder
- [ ] `/#/super-admin/onboarding` -> Expected future placeholder
- [ ] `/#/super-admin/reports` -> Expected future placeholder

*Verify:* Must completely block or redirect `tenant_owner` or unauthenticated users.
