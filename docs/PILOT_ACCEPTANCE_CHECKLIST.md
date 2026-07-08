# LARİ Pilot Acceptance Checklist

This checklist confirms that the application is ready for the end-to-end Pilot Demo.

## 1. Marketing & Public Pages
- [x] Homepage copy is general appointment SaaS-friendly, not strictly salon-only.
- [x] Pricing/trial messaging is correct and payment boundaries are accurate.
- [x] Mobile App page clearly states it is a future roadmap feature.
- [x] Public business site (e.g., Nexus Studio) looks professional and displays the correct branding.

## 2. Customer Booking Flow
- [x] Booking process works smoothly from start to finish.
- [x] "No Preference" staff selection option displays and behaves correctly.
- [x] Booking success screen has professional messaging.
- [x] Customer portal login works with email/phone.
- [x] Customer portal displays upcoming appointments and allows eligible cancellations.

## 3. Admin Owner Capabilities
- [x] Dashboard (Today view) lists appointments natively.
- [x] CRUD operations for Staff and Services work locally (mock persist).
- [x] Customer Memory tab displays correctly and persists notes without errors.
- [x] Settings (Business Profile) updates reflect on the public page without breaking boundaries.
- [x] Disallowed fields (official identity) are correctly locked.
- [x] Referral creation is available or shown properly.
- [x] Billing page correctly intercepts payment attempts with "Not Yet Configured" professional messaging.

## 4. Super Admin Capabilities
- [x] Overview dashboard KPIs behave nicely across breakpoints.
- [x] Tenants list functions properly (Send Back, Approve, Pause).
- [x] Subscriptions and Plans CRUD operates cleanly.
- [x] Payment Readiness diagnostic is clear and indicates safe separation.
- [x] AI Settings area is marked as backlog/non-blocking but does not crash.

## 5. Security & State Guardrails
- [x] No `IYZICO_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` included in frontend `.env` or files.
- [x] No raw `window.confirm` or `window.alert` breaks the iFrame preview (uses `useDialog` hook).
- [x] Demo data looks realistic (Nexus Studio, Cemil Kaya, professional services, no "fgngnf").
- [x] Local storage updates correctly after CRUD actions without crashing.

## 6. Globalization (Copy)
- [x] EN and TR translations do not mix.
- [x] Empty states are helpful (e.g. "When clients book appointments, their profiles will appear here").
- [x] Turkish naming avoids alienating non-salon businesses where possible.

## 7. Demo Script Accuracy
- [x] Pilot Demo Script matches the current repository state accurately.
- [x] Claims align with what is actually implemented (no premature live payment claims).
