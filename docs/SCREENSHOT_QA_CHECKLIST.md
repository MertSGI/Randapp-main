# Automated Responsive & Screenshot QA Checklist (Phase 17)

This checklist defines the required screenshots for final visual and responsive acceptance. A local automated Playwright script is provided to capture these systematically.

## Automated Capture Instructions

### Using GitHub Actions (Recommended)
You can run the screenshot QA workflow securely through GitHub without setting up local tools.
1. Go to the **Actions** tab in your GitHub repository.
2. Select the **QA Screenshots Capture** workflow from the left sidebar.
3. Click **Run workflow**. (This will run the build, start the preview server, and execute Playwright fully automatically in the cloud).
4. Wait for the workflow to complete.
5. Download the `randapp-qa-screenshots` artifact zip file generated at the bottom of the workflow run page.
6. Extract the zip and open `QA_SCREENSHOT_REPORT.html` to review all generated captures.

**Note:** No real payment or production secrets are used during this capture process. The app intentionally runs in a secure mock/presentation mode.

### Running Locally
If you prefer to capture screenshots on your local machine:
1. `npm ci`
2. `npx playwright install --with-deps chromium`
3. `npm run build`
4. `npm run preview` (Starts Vite server on local port)
5. In a separate terminal run: `QA_BASE_URL=http://localhost:4173 npm run qa:screenshots`

**Priority Review Order:**
1. Homepage (`/`)
2. Pricing (`/pricing`)
3. Booking Flow (`/book`)
4. Booking Success (if script generated or manually added)
5. Admin Mobile (`/admin`)
6. Admin Settings
7. Super Admin Mobile (`/super-admin`)
8. Payment Diagnostics (`/super-admin/payment-test`)

---

## 1. Marketing Site (Mobile & Desktop)
**Routes:** `/`, `/features`, `/pricing`, `/demo`, `/contact`, `/mobile-app`
- [ ] **Homepage Hero:** Clean typography, rotating industry phrases working without layout jumps.
- [ ] **Homepage Value Section:** Clear features, no broken grids. 
- [ ] **Features Page:** Showcase appointment & CRM features.
- [ ] **Pricing Page (Monthly/Annual):** Clean cards, no WhatsApp redirect for direct plans.
- [ ] **Mobile App Page:** Must clearly state "planned channel" (not live yet), clean visuals.
- [ ] **Demo Page:** Clean form layout, professional messaging.
- [ ] **Contact Page:** Working layout, translated copy.

## 2. Public / Customer Experience (Mobile-First)
**Routes:** `/:tenantId/book` (or `/book`), `/customer/login`, `/customer/appointments`
- [ ] **Public Landing:** Business profile (simulated or real).
- [ ] **Booking Flow (Mobile):** Service selection, Staff selection, Time selection, Customer Details.
- [ ] **Booking Flow (Desktop):** Step-by-step layout.
- [ ] **Booking - Success Page:** Should prompt the user about the Customer Portal.
- [ ] **Customer Login:** Clean layout asking for Phone or Email.
- [ ] **Customer Portal - Appointments (Mobile):** List of upcoming & past appointments.
- [ ] **Customer Portal - Cancellation:** Clear cancellation warning.

## 3. Admin Owner Panel (Adaptive)
**Route:** `/admin`
- [ ] **Mobile Admin Shell:** Must show bottom navigation bar, NO horizontal cramped tabs on small screens.
- [ ] **Desktop Admin Shell:** Full management panel with horizontal tabs.
- [ ] **Mobile Dashboard/Setup:** Overview cards.
- [ ] **Mobile Appointments List:** Vertical card feed showing Customer, Phone, Service, Staff, Time, Status, and "View Profile" CTA.
- [ ] **Mobile Customer Memory:** Detail view showing latest service, notes, preferences, history.
- [ ] **Mobile Referrals:** Active campaigns layout.
- [ ] **Mobile Billing/Subscription:** Active plan, limits/quotas.

## 4. Super Admin Platform Operations (Adaptive)
**Route:** `/super-admin`
- [ ] **Mobile Super Admin Navigation:** Collapsed drawer or menu layout working on mobile.
- [ ] **Mobile Tenants Page:** Table replaced by stacked cards.
- [ ] **Mobile Onboarding/Review:** Table replaced by responsive cards. 
- [ ] **Mobile Super Admin Plans Page:** Inputs stack cleanly, buttons don't overflow.
- [ ] **Mobile Referrals Page:** Global campaign management.
- [ ] **Mobile Payment Test Page:** Diagnostics clearly visible and stack nicely.
- [ ] **Desktop Super Admin Dashboard:** Operations feel rich and powerful.

## 5. Phase 14J Final Screenshot Readiness Checklist
Ensure these exact screens are captured and reviewed:
1. [ ] Admin Settings mobile (Persistence and fields)
2. [ ] Admin Settings desktop
3. [ ] Super Admin mobile navigation/drawer
4. [ ] Super Admin Tenants mobile
5. [ ] Super Admin Onboarding mobile
6. [ ] Super Admin Plans mobile
7. [ ] Super Admin Referrals mobile
8. [ ] Super Admin Payment Test mobile
9. [ ] Pricing desktop/mobile
10. [ ] Public booking mobile
11. [ ] Booking success mobile
12. [ ] Customer portal mobile

## General Testing Rules
- Both **TR** and **EN** languages must be tested.
- CTAs should trigger intended mock actions or present a professional validation (e.g., "Edge Functions required for payment").
- The product must feel like a cohesive SaaS, not stitched-together generated screens.

