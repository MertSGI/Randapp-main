# End-to-End Flow QA

## Playwright Integrations
A script (`scripts/verify-product-flow.mjs`) actively tests the core product workflows end-to-end to ensure that new builds don't break the registration, onboarding, booking, or session architecture. Another script (`scripts/verify-publish-gate.mjs`) asserts publishing access rules.

## Scenarios Covered

**1. Registration Flow (`/#/register`)**
- Fills out registration form entirely.
- Asserts that local mock data logic successfully accepts the registration payload.
- Asserts the transition into the Checkout Handoff modal state or Admin portal.

**2. Publish & Verification Gate (`scripts/verify-publish-gate.mjs`)**
- Intercepts requests to the public `/book` page.
- Verifies that sites with `draft`, `pending_review`, or `suspended` status return a neutral fallback screen ("Hizmet Geçici Olarak Kapalı").
- Validates that checking out or trialing does NOT immediately expose a site unless verified.
- Confirms that unauthorized roles cannot view incomplete profiles.

**3. Routing & Branding Matrix**
- Checks that old branding (`randapp`) and weak wording (`roadmap`, `sandbox`, `demo payment`) DO NOT appear on customer-facing routes:
  - `/#/`
  - `/#/features`
  - `/#/pricing`
  - `/#/register`
  - `/#/book`
- Asserts that all standard text is shown without revealing internal state.

**4. Admin UX & Entitlement Gating**
- Verifies that `adminFeatureAvailabilityService` safely limits accessible tabs and features based on payment state and onboarding completion.
- Evaluates enhanced empty state usability.

**5. Customer Booking & Appointments**
- Validate that customers can easily select "Fark Etmez" (first available staff).
- Ensure the booking flow renders clean appointment summaries upon success and does not expose internal system logs or AI preparation output.
- Validate optional referral input fields are unintrusive.

**6. Appointment Operations & Lifecycle**
- Admins can manage 'confirmed', 'completed', 'cancelled', and 'no_show' states.
- Admin dashboard safely splits these views matching correct mathematical sums.
- Validates the referral reward hook works correctly behind completion status events without double counting.

**7. Admin Continuity**
- Ensures that when a new tenant registers, `TenantService` resolves the hostname fallback logic strictly to the newly generated `lari_active_tenant_id` to provide immediate "preview" consistency.

**8. External Sharing & Attribution (`qa:share-toolkit`)**
- Validates the existence of contextual text macros for major platforms (WhatsApp, Google, Meta).
- Ensures `BookingPage` properly reads inbound `?source=` parameters and attaches tracking to resulting appointments.

## Execution
Run `npx --yes node scripts/verify-product-flow.mjs`.
Run `npx --yes node scripts/verify-publish-gate.mjs`.
Run `npx --yes node scripts/verify-admin-ux-readiness.mjs`.
Run `npx --yes node scripts/verify-public-booking-flow.mjs`.
Run `npx --yes node scripts/verify-pilot-onboarding-readiness.mjs`.
Run `npx --yes node scripts/verify-pilot-admin-preview.mjs`.

## Remaining Gaps
- Currently tests run in browser UI but do not deeply examine Database state when `VITE_DATA_MODE=supabase`. E2E must be combined with unit tests against test DB credentials before production.
