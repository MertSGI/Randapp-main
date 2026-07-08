# LIVE CUTOVER EXECUTION RUNBOOK

This runbook outlines the exact sequence of operational steps required to transition the LARİ platform from the local/pre-live state to a full production deployment.

Follow these steps sequentially. Do not skip validation phases.

## Phase 0 — Pre-Cutover Freeze
- [ ] Stop all feature work. Code freeze.
- [ ] Run `npm run qa:all` and verify 100% pass rate.
- [ ] Run `npm run build` and ensure successful compilation.
- [ ] Export local tenant snapshots (Super Admin -> Veri Yedekleme).
- [ ] Save `.json` snapshots securely off-device.
- [ ] Review `PRE_LIVE_HARDENING_AND_CUTOVER_BLOCKERS.md`.
- [ ] Confirm legal/privacy (`/privacy`, `/terms`) texts are approved.
- [ ] Confirm support contact endpoints are ready.

## Phase 1 — Supabase Setup
- [ ] Create or link the Supabase production project.
- [ ] Apply SQL migrations (tables, functions).
- [ ] Verify Row Level Security (RLS) policies are active.
- [ ] Seed required base data if necessary (e.g., initial super admin records).
- [ ] Verify the Service Role Key is NEVER referenced in the frontend codebase.
- [ ] Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` safely in frontend public environment variables.
- [ ] Inject Service Role Key ONLY in Edge Function environments or secure build CI/CD.

## Phase 2 — Data Migration
- [ ] Run local snapshot export mapping.
- [ ] Run migration dry-run and review blockers/warnings.
- [ ] Fix any outstanding blockers in tenant setups.
- [ ] Execute script to import/migrate tenant data into Supabase (tenant profile, services, staff, appointments, customers, consents, branches, campaigns).
- [ ] Validate integrity: Ensure pilot demo data is safely isolated from real tenant operations.

## Phase 3 — Edge Functions
- [ ] Deploy `create-checkout-session` Edge Function.
- [ ] Deploy `payment-webhook` Edge Function.
- [ ] Deploy `subscription-sync` or equivalent triggers.
- [ ] Set Supabase backend secrets strictly via CLI (e.g., `supabase secrets set ...`). NEVER place them in repo/frontend.
- [ ] Verify function logs on Supabase dashboard.

## Phase 4 — Iyzico Sandbox Integration
- [ ] Create Sandbox Products and Plans in the Iyzico Dashboard.
- [ ] Map Iyzico Product/Pricing reference codes to the database.
- [ ] Configure callback URLs to return exactly to the Edge Functions.
- [ ] Set up the Webhook URL in Iyzico pointing to the `payment-webhook` Edge Function.
- [ ] Test successful checkout flow.
- [ ] Test cancelled and failed checkout flows.
- [ ] Test webhook payload invalid signature handling.
- [ ] Test duplicate webhook logic processing.
- [ ] Validate Admin Billing and Super Admin tenant states sync perfectly.

## Phase 5 — Email / Notification Provider
- [ ] Configure transactional email provider (e.g., Resend, Sendgrid) credentials in backend Edge Functions.
- [ ] Ensure existing notification templates are ported correctly.
- [ ] Test Appointment Confirmation emails.
- [ ] Target logic to ensure internal trials send system confirmation without crashing.
- [ ] *(Note: Do not claim automated WhatsApp endpoints are live unless verified with provider).*

## Phase 6 — WhatsApp Provider (Optional/Deferred)
- [ ] Select appropriate WhatsApp Business API (e.g. Twilio, Gupshup).
- [ ] Keep the manual "Share Toolkit" templates as primary until automated endpoint is successfully receiving callbacks.
- [ ] Configure provider only when the Edge logic is completely proven.

## Phase 7 — DNS & Custom Domain
- [ ] Configure the primary production app domain (`*.lari.com.tr` or similar) to route to the main ingress path.
- [ ] Ensure HTTPS auto-generation via Cloud Run or NGINX.
- [ ] Validate accurate routing to multi-branch URLs.
- [ ] Validate public tenant slug links operate correctly.
- *Wait to claim "Custom Domains Active" until wildcard DNS is confirmed working end-to-end.*

## Phase 8 — Production Payment Switch
- [ ] **Only proceed if Phase 4 (Sandbox) is completely verified.**
- [ ] Apply live production Iyzico secrets mapping via Supabase CLI.
- [ ] Change the frontend run mode: `VITE_PAYMENT_RUN_MODE=production_live`.
- [ ] Initiate a low-value real money transaction to verify the live pipeline.
- [ ] Confirm Webhook verification logic passes in live mode.
- [ ] Verify Active Subscription states trigger successfully.
- [ ] Note rollback parameters.

## Phase 9 — Final Smoke Test
Run the `LIVE_SMOKE_TEST_SCRIPT.md` to verify:
- [ ] Homepage, Pricing, Login, Demo, Pilot.
- [ ] Public customer Lumina site routing (`/pilot/customer`).
- [ ] Public booking appointment completion sequence.
- [ ] Admin operations, Onboarding workflow, and Billing checks.
- [ ] Super Admin and Privacy/Terms pathways.
- [ ] Data Export and Publish flow gates.

## Phase 10 — Rollback Plan
If critical issues occur:
- [ ] Revert `VITE_PAYMENT_RUN_MODE` back to `local_dry_run` or `sandbox_live`.
- [ ] Disable dynamic `/register` endpoints if immediate isolation is needed.
- [ ] Pause public `/book` routes (e.g., return temporary offline state).
- [ ] Immediately rotate API Keys if compromised or exposed.
- [ ] Maintain the Data Snapshot if you need point-in-time recovery to local cache logic.
- [ ] Record incident actions.
