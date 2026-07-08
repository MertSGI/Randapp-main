# Customer Pilot Readiness Checklist

This document is for internal team and Super Admin review only. It outlines the complete readiness criteria to successfully onboard a new pilot merchant.

---

## 1. Product Demo Readiness
- [ ] **Homepage & Core Journey**: Ensure secondary helper links route appropriately to `/pricing`, `/demo`, and `/pilot` respectively.
- [ ] **Seeded Pilot Business (`/pilot`)**: Fully populated visual portfolio (gallery), dynamic booking stream, and custom automated assistant.
- [ ] **Business Previewer (`/demo`)**: Simulates the customizable customer booking site prefix without inserting dummy tenants or persistent db context.
- [ ] **Merchant Registry (`/register`)**: Real self-service signup is isolated from mock trial claims. Starts a 14-day secure trail with card required.
- [ ] **Merchant Onboarding Wizard**: Fully verified that the core catalog, staff, hours, and business location can be updated on initial login.
- [ ] **Billing trial states**: Confirm `trialing` and `pending_checkout` subscription statuses securely lock the public booking endpoint until provisioned.
- [ ] **Publish Gate validation**: Ensure that visiting a salon site when `is_published = false` blocks visitors from scheduling appointments while keeping preview available for the merchant.
- [ ] **Super Admin Controls**: Tested `/super-admin` approve/suspend features to ensure that bad actors are suspended immediately.

---

## 2. Business Operational Readiness
- [ ] **Pilot Customer Directory**: Verify custom parameters are loaded correctly.
- [ ] **Business Category Validation**: Merchant matches valid vertical market settings (such as Barbers, Hair Salons, Spas, and medical centers).
- [ ] **Catalog Configuration**: Verify merchant services, prices, staff working hours, and location coords.
- [ ] **Storefront Verification**: Preview the customer-facing storefront on both desktop and mobile layouts for visual polish.
- [ ] **Publish Gate approval code**: Review the application and toggle `approved = true` in Super Admin directory.
- [ ] **Operation/Support**: A support hotline is prepared structure is ready for onboarding questions.

---

## 3. Communication Readiness
(See `docs/NOTIFICATION_READINESS.md` for template schemas and constraints)
- [ ] **SMTP Email Provider Setup**: Marked as `pending` or configured via real transactional email SMTP providers (e.g., AWS SES or SendGrid).
- [ ] **WhatsApp Business Setup**: Meta Cloud API or partner integration marked as pending/configured.
- [ ] **Trial Start Message**: Merchant receives confirmation template clarifying trial duration.
- [ ] **Appointment Reminder Template**: Pre-cached automatic notifications containing timezone formatting.
- [ ] **Billing End Warning Message**: Notification detailing `14 gün boyunca ücret alınmadı, iptal edilmezse plan başlayacak` copy.

---

## 4. Payment & Checkout Readiness
- [ ] **Trial Rules Compliance**: Ensure 100% of consumer-facing copy explicitly states **14-day free trial with card required to start**. Absolutely no "Card Not Required" messages exist.
- [ ] **Interactive Sandbox Test**: Execution of sandbox checkouts with standard Iyzico test cards.
- [ ] **Payment Run Mode Switch**: Verified `paymentRunModeService` correctly enforces the run mode parameters (`local_dry_run` for dry testing, `sandbox_live` for integration test, and `production_live` for active cash flow).
- [ ] **Zero Secrets in Frontend state**: Guaranteed that no API keys or database tokens (such as `IYZICO_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) are stored in `localStorage`, client components, or source logs.
- [ ] **Edge Function deployment**: Verification of HMAC signature verification headers on the `payment-webhook` endpoint.

---

## 5. Legal & Policies Compliance
- [ ] **Prohibited Business Policy**: Ensured merchants do not sell illegal goods/services.
- [ ] **KVKK / Privacy Statement**: Active in registration wizard.
- [ ] **Terms of Use Acceptance**: Present in the `/register` process.

---

## 6. First 7-Day Pilot Success Metrics
(Monitored via `SuperAdminPilotTrackerPage` and internal Pilot Onboarding Service)
- [ ] **Business Profile Created**: Basic setup completed (services, staff, hours).
- [ ] **Public Link Shared**: Link added to Instagram Bio or WhatsApp.
- [ ] **Owner Log-in Frequency**: Owner logged in at least twice in the first week.
- [ ] **First Booking Received**: At least one appointment dynamically captured.
- [ ] **Customer Memory Usage**: At least one profile updated with personal preferences/notes.
- [ ] **Feedback Collected**: Reached out successfully with 'First Week Follow-Up Script'.
