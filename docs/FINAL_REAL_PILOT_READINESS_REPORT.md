# LARİ - Final Real Pilot Readiness Report

## Executive Summary
This report provides a realistic assessment of the LARİ platform's readiness for its very first real pilot customer (a real salon processing real appointments). The system is highly functional, but some critical external dependencies are still being configured.

## 1. What is Ready for Real Pilot
- **Market & Global Readiness**: Abstracted configuration services exist for brand identity, language parsing (`i18nLanguageConfig`), currencies, and payment providers so the same code supports both the local "RandevuLari" brand and the global "LARİ" brand.
- **Public & Booking Infrastructure**: The public facing `/book` routes, Lumina templates, multi-branch logic, and staff/service selections are robust and fully functional.
- **Admin Dashboard**: The entire salon owner experience (calendar, customer memory, service/staff management, reporting) is production-ready.
- **Pilot Customer Onboarding Flow**: Sales scripts, onboarding tasks, and first-week follow-up guidelines are documented and integrated into the Super Admin Pilot Tracker.
- **Data Governance**: Privacy policies, terms of service, and explicit customer consent checkboxes are implemented.
- **Marketing Toolkit**: The Share Toolkit and referral reward system are operational.
- **Pilot Customer Admin Demo**: In pilot contexts, prospective customers can transparently preview the read-only `/pilot/admin` panel without leaking credentials or interacting with the actual admin authentication flow.

## 2. What is Ready Only as Local/Demo Mode
- **Payment Sandbox**: The Iyzico payment integration is fully implemented in code, but unless Edge Functions are deployed with active sandbox keys, it relies on `local_dry_run` bypassing.
- **Data Persistence (Supabase)**: The system currently defaults to `mock` localStorage persistence. Supabase tables, RLS policies, and adapters are mapped out but require explicit cutover to a hosted Supabase instance for data to persist across devices.

## 3. What Still Needs External Setup
- **Supabase Backend Cutover**: The database must be deployed and the frontend `VITE_DATA_MODE` changed to `supabase`.
- **Iyzico Sandbox Transaction**: Webhooks and Edge Functions must be deployed to the Supabase project to process real subscription hooks.
- **Subdomain Routing & Wildcard DNS**: Subdomain routing (e.g., `tenant.randevulari.com`) requires wildcard DNS routing (`*.randevulari.com`) and wildcard SSL certificates configured at the deployment layer.
- **Custom Domain/DNS Status**: The application handles custom domain requests internally via the manual and self-serve workflow, but the external reverse-proxy setups require manual hosting intervention.
- **WhatsApp/Email Automation Status**: No live external CRM/Email/WhatsApp APIs (like Twilio or Resend) are currently hooked up to the frontend API calls.

## 4. Product Capability Reference
* A designated `docs/PRODUCT_CAPABILITY_MATRIX.md` exists as the single source of truth defining what works locally vs what requires external hooks. 
* Manual offline sales are tracked robustly by `manualProvisioningService.ts` directly from Super Admin avoiding frontend checkout flows.

## 5. Legal / Privacy Status
- Basic templates for KVKK/GDPR and Terms of Service exist on `/privacy` and `/terms`.
- Consent capture works inside the app.
- **Risk**: These documents must be reviewed by legal counsel before operating on a `.com.tr` production domain to ensure complete compliance.

## 6. First Customer Pilot Checklist (Top 10 Risks)
1. **Data Loss Risk**: Operating a real pilot on localStorage (`VITE_DATA_MODE=mock`) will cause complete data loss when the user changes devices or clears cache, unless mitigated strictly by routine SuperAdmin `.json` Data Exports. For live deployment, follow `LIVE_CUTOVER_EXECUTION_RUNBOOK.md`.
2. **Notification Reliability**: SMS/WhatsApp reminders will silently fail until external APIs are configured.
3. **Payment Failure**: Subscription trials will fail if Iyzico Edge Functions are not deployed.
4. **Legal Compliance**: Untested KVKK documents.
5. **DNS Propagation**: Delays in custom domain routing.

## 7. Recommended Next 10 Actions
1. **CRITICAL**: Deploy Supabase database schema and RLS policies.
2. **CRITICAL**: Set `VITE_DATA_MODE=supabase` to disable localStorage completely.
3. Deploy Supabase Edge Functions (`create-checkout-session`, `payment-webhook`).
4. Configure standard environment variables in the Cloud Run instance.
5. Have legal counsel approve `/privacy` and `/terms`.
6. Integrate a real transactional email provider (Resend/Sendgrid) for password resets.
7. Conduct a final End-to-End test with a real Credit Card on Iyzico Sandbox.
8. Perform the Onboarding Call with the First Customer.
9. Guide the customer to populate staff, services, and working hours.
10. Advise the customer to share the public link.
