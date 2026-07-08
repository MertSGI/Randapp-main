# Deployment / Environment Variables

## Types of Environment Variables

### 1. Public Variables (`VITE_*`)
These variables are baked into the frontend bundle at build time. They MUST be safe to be exposed to anyone using the browser.
*   `VITE_SUPABASE_URL`: Safely points to your Supabase instance.
*   `VITE_SUPABASE_ANON_KEY`: Supabase anon key used in frontend queries (governed by RLS).
*   `VITE_PAYMENT_PROVIDER`: E.g. `mock` or `sandbox` (dictates UI behavior).

### 2. Secret Variables (Backend / Edge Functions)
These variables are set securely in your hosting environment (Supabase Secrets) and are NEVER shipped in the frontend code.
*   `SUPABASE_SERVICE_ROLE_KEY`: Admin privileges to interact with DB securely from Edge Functions.
*   `IYZICO_API_KEY`: Authentication for Iyzico API.
*   `IYZICO_SECRET_KEY`: Used to verify webhooks/signatures and authenticate to Iyzico.

## Process
You can review the placeholder structure in `.env.example`. Never commit the `.env` file containing the actual production secrets.
