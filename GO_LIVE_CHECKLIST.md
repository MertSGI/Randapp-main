# Go-Live Checklist (Pre-Production)

## 1. Authentication & Security
- [ ] Connect Supabase Auth for Admin/Salon Owners.
- [ ] Implement OTP / Magic Link for Customer Portal Lite. (Remove LocalStorage mock).
- [ ] Enforce Row Level Security (RLS) on all Supabase tables (`appointments`, `customers`, `notes`, `services`, `staff`).
- [ ] Lock down storage buckets so reference photos are 100% private.

## 2. Payments (iyzico)
- [ ] Connect Edge Functions for `create-checkout-session` and `payment-webhook`.
- [ ] Trial/checkout CTAs should automatically replace Demo/Sales CTAs when `VITE_PAYMENT_PROVIDER` is set to sandbox/production.
- [ ] Test real trials, secure card collection, and trial-to-paid auto-continuation in Sandbox.
- [ ] Verify cancellation flows (cancelling trial vs. cancelling active subscription).
- [ ] Complete sandbox webhook idempotency integration.
- [ ] Migrate credentials from sandbox to live environment.
- [ ] Never place iyzico secrets in frontend code.

## 3. Communication Integration
- [ ] Connect transactional SMS provider for appointment confirmations.
- [ ] Connect transactional Email provider for admin alerts.

## 4. Frontend & Reliability
- [ ] Verify `VITE_DATA_MODE=supabase` functions gracefully without UI layout shifts.
- [ ] Enable Service Worker for PWA (Offline edge cases).
- [ ] Clean any console warnings and verify React strict mode behaviors.

## 6. AI & Edge Functions
- [ ] Deploy Edge Functions (`supabase functions deploy ai-recommendation`, `ai-visualization`).
- [ ] Set `GEMINI_API_KEY` securely in Supabase secrets.
- [ ] Verify `aiMonthlyQuota` plan constraints are strictly checked in the Edge Function (not just frontend).
- [ ] Ensure any Customer Memory future AI features have an explicit GDPR/KVKK Boolean opt-in column in `customers` table before enabling.

## 7. Feature Status: Current MVP vs Sandbox vs Roadmap
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
