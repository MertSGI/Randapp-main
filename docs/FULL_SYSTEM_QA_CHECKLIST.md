# LARİ Full System QA Checklist

## Feature Status: Current MVP vs Sandbox vs Roadmap
**Current MVP/Mock Demo:**
- Mini Website & Profile Page
- Online Booking Logic (Staff & Service matching)
- Plan Selection GUI
- Super Admin Dashboard (UI)
- Customer Profile & Memory (UI)

**Sandbox/Backend-Ready (Awaiting Supabase Edge Functions):**
- Iyzico Payment & Live Trial Checkout
- Real Auth (Phone/OTP)
- Reference Photo Storage
- AI Interactions

**Future Roadmap:**
- Custom Domain Support
- Mobile App / Customer Discovery Directory
- Ratings and Reviews
- AI Visualizations

---

## Marketing Visitor (Platform Domain / Preview Root)
- [x] **`/#/` (Homepage)**: Loads `MarketingHomePage`, shows "Kendi Salonumu Önizle" CTAs, clear product promise (Website + Booking + AI).
- [x] **`/#/features`**: Loads `FeaturesPage`, explains features logically.
- [x] **`/#/pricing`**: Loads `PricingPage`, correct prices and plans. Checkout and trial CTAs safely show an alert explaining that secure checkout will activate in the next integration phase.
- [x] **`/#/contact`**: Loads `ContactPage`, forms redirect to WhatsApp with proper lead data (Salon Adı, İl/İlçe, Telefon).
- [x] **`/#/demo`**: Loads `DemoLandingPage` (Onboarding/Sales entry point).
- [x] **Mobile Nav**: Hamburger menu works and closes on selection.
- [x] **SEO & Metadata**: `index.html` contains Title, Meta Description, OG Title/Desc, Twitter Card, and clearly frames target market (Kuaför, Güzellik Salonuvb.).

## Salon Customer (Tenant Domain / `/book`)
- [x] **Website First, Booking Second**: Visitors land on a highly polished, mobile-first website view mirroring the interactive Demo preview exactingly. The stepper is completely hidden until a booking CTA is tapped.
- [x] **Upload & Media Rendering**: Multi-cover image carousels and gallery popups are fully functional and respect files natively uploaded from device UI.
- [x] **Booking Lock Before Live**: If the tenant's `setupStatus` is not `live`, visiting `/#/book` without preview permissions shows a locked "Hizmet Geçici Olarak Kapalı" screen.
- [x] **Booking Flow Unlocked After Approval**: Once Super Admin approves, customers can access the full Booking Flow.
- [x] **Security / Preview Lock**: `?preview=true` works ONLY if the user is `super_admin` OR `tenant_owner` of the matching `tenantId`. Anonymous users remain blocked.
- [x] **Maps Redirection**: "Yol Tarifi Al" and "Haritada Aç" generate correct Google Maps search URLs.
- [x] **Contact Actions**: WhatsApp routing is functional for sending appointment confirmations and manual contact.
- [x] **Multilingual Bookings (I18N)**: Booking widget and Customer Website accurately swap labels between Turkish and English globally, saving preferences per browser.
- [x] **Customers View Own Appointments**: Customers can log in using their matching phone/email locally.
- [x] **Customer Portal Cancellation**: Customers can cancel an appointment if within the policy window.
- [x] **Privacy Check**: Salon Notes are NOT visible anywhere in the Customer Portal.
- [x] **Customer Account Lite (Autofill)**: Customers can choose to bind their Name, Email, and Phone locally per tenant. Bypasses forced DB auth, providing pure frictionless autofill.
- [x] **AI Recommendation Gating**: AIVisualizerPage strictly checks if `aiRecommendationsEnabled` is true for the tenant's current plan. Shows upgrade notice if disabled.
- [x] **Privacy AI Governance**: Explicit copy explains that photos are not stored. No Gemini API key exists on the frontend bundle.

## Salon Owner / Tenant Admin (`/admin`)
- [x] **Login Mechanics**: `admin@randapp.com` can log in and is securely routed to their tenant dashboard.
- [x] **Sidebar/Navigation**: Features simple, clean left nav "Yönetim Paneli".
- [x] **Onboarding Wizard**: 
    - Saves properly step-by-step.
    - Quick additions (Service/Staff) function and update lists.
    - Step 8 explicitly checks required rules (`isInfoCompleted && isProfileCompleted && isBrandingCompleted && isServicesCompleted && isStaffCompleted`). 
    - Sets state to `ready_for_review` strictly. Never auto-lives the tenant.
- [x] **Business Website Profile**:
    - Toggle `is_public_profile_enabled` works.
    - Info updating and map link testing acts predictably.
    - "Site Önizlemesini Aç" generates a `/#/book?preview=true` link.
- [x] **Billing Tab**: Views current plan dynamically. Uses `resolvePaymentCta` to route to "Start Mock Trial" vs "WhatsApp Demo" based on modes.
- [x] **Customer Memory**: The "Müşteriler" / "Customers" tab exists. Entering a matching email/phone during booking automatically ties the appointment to the simulated customer record. Owners can store notes and style-preference reference photos. KVKK disclaimers are present.

## Super Admin (`/super-admin`)
- [x] **Login Mechanics**: `superadmin@randapp.com` can log in and see high-level overview.
- [x] **Go-Live Approval**: Modifies status to `live`. Confirmed by window message.
- [x] **Mock Subscription Toggle**: Super Admins can manually force a mock subscription toggle (Trialing / Active / Past Due) for demo purposes, with clear warnings.
- [x] **Send-Back Flow**: "Send Back" correctly prompts for an optional note (using `window.prompt`) and sets state to `needs_changes` or `setup_in_progress` logically via backend mock service.
- [x] **Tenant Management**: Actions are appropriately contained, unbuilt advanced actions trigger a "Sonraki fazda eklenecek" placeholder.
- [x] **Payments & Diagnostics Test**: `SuperAdminPaymentTestPage` runs simulated sandbox responses successfully.

## State/Flow Integrity
- [x] Clean state machine: `setup_in_progress` → `ready_for_review` → (`live` XOR `needs_changes`).
- [x] Reusability of states across `TenantContext`, `goLiveService`, and local components.
- [x] `VITE_DATA_MODE=mock` robustly handles refresh/persistence across the SPA. 
- [x] **Demo Operations**: `demoSeeder.ts` is explicitly gated and ONLY functional in mock data mode to prevent destructive execution in production environments.

---
**Status**: Dynamic Try/Buy UI routing established. The platform is ready for Edge Function integration for genuine iyzico/Supabase endpoints.

## Phase 14C Quality Gate Checklists

### CRUD & Mutation Reliability
- [ ] Add/Edit/Delete/Deactivate flows must rely on a unified `MutationResult`.
- [ ] No action fails silently across Admin/SuperAdmin.
- [ ] UI must refresh explicitly after a mutation using the application's source of truth.
- [ ] Direct constant mutations inside local memory are strictly forbidden (deep cloning must be enforced).
- [ ] Operations successfully persist across page reloads (or `F5` browser refresh).

### Destructive Action UX
- [ ] All delete/cancel/deactivate actions trigger a localized confirmation dialog.
- [ ] Confirmation phrasing explicitly references the entity name (e.g. `'Kampanya X' silinsin mi?`).
- [ ] Hard deletion is gracefully rejected if an entity is referenced (e.g., staff with active appointments). Use deactivation (soft delete) instead and explain the choice.
- [ ] Feedback alerts must explicitly mention whether an action succeeded, failed, or was down-graded to deactivation for safety.

### Admin Mobile Information Architecture (IA)
- [ ] No duplicate top header or duplicate logout CTAs on mobile layouts.
- [ ] No generic "Panel" cards unnecessarily wasting vertical screen space.
- [ ] Setup wizard dominates the screen ONLY in the 'setup' route. Otherwise, it collapses to a compact reminder badge.
- [ ] Mobile navigation prioritizes daily tasks on a fixed bottom bar: Today (Dashboard), Appointments, Customers, Services, and More.
- [ ] Horizontal tab scroll containers are strictly forbidden on small screens inside Admin panels.

### Copy & Misdirection Sweeps
- [ ] Missing translations (`cannot_delete_in_use`, `action_failed`, `deactivated_success`) are correctly registered in `translations.ts`.
- [ ] Unimplemented AI recommendations, Stripe/Iyzico payments, or Native Mobile App integrations are clearly labeled as "Planned" or "Mock" to protect customer transparency.
- [ ] No hardcoded string constants exist inside `window.confirm` dialogs without matching the localized application context.

### Phase 14I Admin Permissions & Role Boundaries
- [x] Official Business Name (`tenant.name`) is logically separated from `public_display_name` via `businessProfile`.
- [x] Display Name (`public_display_name`) configuration is editable by the Admin in `BusinessProfileTab`.
- [x] Platform name, trial limits, and global AI toggles are isolated safely within Super Admin Platform Settings.
- [x] Admin Settings (`AdminSettingsTab.tsx`) strictly persists allowed tenant-level changes (channels, policies) via local persistence.
- [x] `tenant.name` is protected and NOT editable by standard Admins.

### Phase 14I Super Admin Mobile UX
- [x] **Tenants Page**: Replaced wide desktop table with stacked card layout on mobile. Primary status and actions are clearly visible within each card.
- [x] **Subscriptions Page**: Replaced desktop table with stacked cards showing plan details and quick-action buttons on mobile.
- [x] **Onboarding Approvals**: Transitioned to mobile cards focusing on tenant name, profile completeness, and critical review actions.
- [x] **Referrals/Campaigns**: Replicated responsive stacked cards approach to ensure start/stop/delete functions are accessible on narrow viewports without horizontal scrolling.

### Phase 14J Final Verification Complete
- [x] Verified `showConfirm` from `useDialog` is correctly used in place of raw `window.confirm` for primary Super Admin actions.
- [x] Verified `BookingPage` and `SalonWebsiteView` are fully responsive and lack horizontal scrolling issues.
- [x] Verified missing translations are handled.
- [x] Added `public_display_name` to correctly mask `tenant.name` in public views.
- [x] Checked that no production credentials (iyzico/firebase) are loaded on frontend.

### Phase 15 Final Presentation & Product QA
- [x] **Marketing Re-alignment**: Marketing pages explicitly support general appointment-based businesses, not just salons. Rotating phrases correctly positioned.
- [x] **Dialog Context Cleanup**: Removed raw `window.alert` and `window.confirm` across Marketing and Admin contexts; replaced with `useDialog`.
- [x] **Super Admin Dashboard Cleanup**: Removed duplicate desktop-only lists; centralized on clear KPI summary cards and links to specific modules.
- [x] **CRUD Sandbox Checks**: Verified typescript build and CRUD logic boundaries.
- [x] **Copy/Localization**: Improved Turkish phrases and maintained context-safe terminology.

### Phase 17 Automated Screenshot QA System
- [x] Integrated Playwright for automated full-page captures.
- [x] Configured routes across Marketing, Public, Admin, and Super Admin flows.
- [x] Validated mock user auth hooks properly set storage before loading protected routes.
- [x] Established visual QA reporting dashboard (`qa-screenshots/QA_SCREENSHOT_REPORT.html`).
- [x] Prevented explicit test framework artifacts or debug views from impacting the output UI (`?devTools=0`).
