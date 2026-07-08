# Supabase Deployment Guide

This guide outlines the steps to deploy the backend services for LARİ using Supabase CLI. 
This is required before integrating real payment processing using iyzico sandbox.

## Prerequisites
1. Ensure you have the Supabase CLI installed.
2. Ensure you have a Supabase project created.
3. Ensure Docker is running (for local development/deployment via CLI).

## Step-by-Step Deployment

### 1. Login to Supabase CLI
```bash
npx supabase login
```

### 2. Link Local Project
Link your local codebase to the remote Supabase project:
```bash
npx supabase link --project-ref <your-project-ref>
```

### 3. Database Migrations
Apply your local migration files to the remote database to create `subscriptions`, `payments`, `audit_logs`, etc.
```bash
npx supabase db push
```

### 4. Deploy Edge Functions
Deploy the required server-side functions. These handle the secure payment requests and webhooks.
```bash
npx supabase functions deploy create-checkout-session
npx supabase functions deploy payment-webhook
npx supabase functions deploy subscription-sync
npx supabase functions deploy ai-recommendation
npx supabase functions deploy ai-visualization
npx supabase functions deploy ai-quota-check
```

### 5. Set Supabase Secrets
Do NOT put these in frontend `.env`. Set them securely in your Supabase project:
```bash
npx supabase secrets set IYZICO_API_KEY=your_sandbox_api_key
npx supabase secrets set IYZICO_SECRET_KEY=your_sandbox_secret_key
npx supabase secrets set IYZICO_BASE_URL=https://sandbox-api.iyzipay.com
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
npx supabase secrets set SUPABASE_URL=your_project_url
```
*(If AI features are enabled, also set `GEMINI_API_KEY`)*

### 6. Post-Deployment Checks
- [ ] Confirm RLS (Row Level Security) policies are enabled on tables where applicable.
- [ ] Confirm storage buckets (e.g., `feature-images`, `customer-references`) are created in the Supabase Dashboard.
- [ ] Confirm frontend `.env` contains ONLY the `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
- [ ] Ensure `VITE_PAYMENT_PROVIDER=sandbox` is set in the frontend when ready to test.

**Warning: Never expose `SUPABASE_SERVICE_ROLE_KEY` or `IYZICO_SECRET_KEY` in the frontend source code or client `.env`.**
