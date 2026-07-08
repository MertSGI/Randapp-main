# iyzico Sandbox Test Flow

Follow this flow to run a complete end-to-end sandbox test for the iyzico payment integration.

## 1. Environment Setup

Configure your local `.env` file (or preview environment variables) as follows:

```env
VITE_PAYMENT_PROVIDER=iyzico
VITE_DATA_MODE=supabase
VITE_ROUTER_MODE=hash # or browser depending on the environment
```

## 2. Test Execution Steps

1. **Deploy Edge Functions**: Use `supabase functions deploy payment-health`, `create-checkout-session`, etc.
2. **Access Payment Test Diagnostics**: Log in as `superadmin@randapp.com` and navigate to `/#/super-admin/payment-test`.
3. **Verify Configuration**: Click "Run Health Check" and ensure all variables return true (without exposing values).
4. **Test Checkout Session Generation**: Select a plan and click "Test Checkout Session Oluştur". Inspect the JSON response block for `ok: true`.
5. **Mock Webhook Local Test**: Copy the webhook payload from the test page and manually `curl` it to your local or deployed Edge Function.
6. **Login as salon owner:** Log in to the application using a test salon owner account.
2. **Go to Admin > Abonelik:** Navigate to the billing tab.
3. **Select plan:** Review the available plans.
4. **Click "Bu plana geç":** Initiate the upgrade process.
5. **Confirm Edge Function returns checkoutUrl:** Verify in the Network tab that the frontend successfully called the `create-checkout-session` Edge Function and received an iyzico sandbox checkout URL.
6. **Complete sandbox checkout:** Use the mock card details provided by iyzico in the checkout interface to simulate a successful payment.
7. **Confirm iyzico webhook hits `payment-webhook`:** Check the Edge Function logs in your Supabase dashboard to verify the webhook payload was received.
8. **Confirm subscriptions table updates:** Verify in the database that the tenant's entry in the `subscriptions` table is marked as `status: 'active'`.
9. **Confirm payments table insert:** Verify that a log of the transaction is placed in the `payments` tracking table.
10. **Confirm provisioning/onboarding begins:** Refresh the application to confirm the tenant state transitions from lock/billing into the active onboarding setup (`tenant.status` changed to active).
11. **Confirm tenant remains locked until go-live gate passes:** Before step 8 finishes, attempting to access the app or skip billing must keep the user locked in the billing step.
