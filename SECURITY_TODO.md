# Security & Architecture Checkout

As we migrate from the mock architecture to a real Supabase/PostgreSQL SaaS setup, the following critical steps MUST be taken before production deployment:

1. **Remove Hardcoded Credentials**
   - The mock credentials (`admin@randapp.com` / `admin123`) currently located in `authService.ts` must be destroyed.

2. **Backend / Edge Functions for Secrets**
   - Gemini API calls requiring `VITE_GEMINI_API_KEY` MUST be moved to a secure backend endpoint or edge function. Gemini image/text calls should go through backend/Edge Function in production.
   - WhatsApp provider tokens must be server-side.
   - Never store Google refresh tokens in frontend-accessible flows. `calendar_integrations` tokens must be handled server-side or encrypted.
   - Payment webhooks must be server-side.
   - NEVER expose the `SUPABASE_SERVICE_ROLE_KEY` in the frontend (`.env` or code). The frontend should strictly use the `VITE_SUPABASE_ANON_KEY`, relying on Row Level Security (RLS) for data protection.

3. **Tenant Data Isolation & RLS**
   - RLS (Row Level Security) is partially scaffolded in `001_initial_schema.sql`. It MUST be comprehensively audited. RLS is mandatory for production.
   - Tenants must absolutely not be able to cross-pollinate data, even if manipulated by a malicious actor bypassing the frontend UI.
   - All tenant-owned tables must strictly enforce `tenant_id` boundaries.

4. **Audit Logs**
   - Implement backend-enforced audit logs for:
     - Appointment cancellations.
     - Staff changes (promotions, demotions, addition, removal).
     - Global tenant branding changes.
     - Subscription / Payment changes.
     - Security login events.

5. **Storage of Sensitive Data**
   - The usage of `localStorage` for primary operational data (e.g. storing appointments or mock session flags) must be fully phased out with the Supabase Data Provider in `VITE_DATA_MODE=supabase`. Session management must rely on secure, HttpOnly cookies or the heavily abstracted Supabase Auth session engine.

6. **Customer Data Protection**
   - Implement restrictions on what fields are returned by APIs for Customer and Staff data to prevent data leakage (e.g., never send full password hashes or excessive personal details to the frontend if they aren't explicitly needed for the view).
