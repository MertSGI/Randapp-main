# iyzico Sandbox Setup Guide

This guide walks you through setting up an iyzico Sandbox merchant account, obtaining credentials, and configuring LARİ.

## Step 1: Create iyzico Sandbox Account
1. Go to the [iyzico sandbox registration page](https://sandbox-merchant.iyzipay.com).
2. Create an account and log in to the test dashboard.

## Step 2: Get API Keys
1. In the sandbox dashboard, locate your **API Key** and **Secret Key**.
2. **Never** put these in your frontend code.
3. Configure them securely in Supabase Edge Functions:
   `npx supabase secrets set IYZICO_API_KEY=your_api_key`
   `npx supabase secrets set IYZICO_SECRET_KEY=your_secret_key`

## Step 3: Create Products and Plans
You need to create the subscription structure in iyzico.
1. Create a **Product** mapping to Randapp (e.g., "Randapp Subscriptions").
2. Get the **Product Reference Code** (e.g., `prd_something`).
3. For each Plan (Starter, Professional, Premium), create two Pricing Plans in iyzico:
   - **Monthly Plan**
   - **Annual Plan**
4. For plans with a trial, ensure you configure `trialPeriodDays` dynamically via the iyzico dashboard or API when creating the pricing plan.
5. Record the **Pricing Plan Reference Codes** (e.g., `pln_monthly_123`, `pln_annual_123`).

## Step 4: Configure Randapp Super Admin
1. Log into your Randapp instance as a Super Admin (`superadmin@randapp.com`).
2. Go to **Plans**.
3. Edit each plan and input the Provider Reference Codes obtained from Step 3:
   - Provider Product Reference
   - Provider Plan Reference (Monthly)
   - Provider Plan Reference (Annual)
4. Save the plans.

## Step 5: Configure Webhooks
1. In the iyzico sandbox dashboard, navigate to Webhook Settings.
2. Set the webhook URL to your deployed Supabase `payment-webhook` Edge Function URL:
   `https://<your-project-ref>.supabase.co/functions/v1/payment-webhook`
3. Ensure the event notifications are enabled.

## Step 6: End-to-End Testing
1. Set `VITE_PAYMENT_PROVIDER=sandbox` in your frontend `.env`.
2. Navigate to `/super-admin/payment-test` and run the health check.
3. Pretend you are a tenant and click a Checkout or Trial button.
4. Verify you are redirected to the secure iyzico mock checkout flow.
5. Monitor `billingTab` status, ensure webhooks hit your endpoint, and verify records are updated in standard DB.

> **Note:** The actual trial card validation and initial charge attempts are handled by iyzico. Mock mode never charges a card and completely bypasses this flow.
