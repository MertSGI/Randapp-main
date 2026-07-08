# Payment Webhooks Integration Code

## Edge Function: `payment-webhook`
The Iyzico webhooks push state changes asynchronously to LARİ.
Path: `/supabase/functions/payment-webhook/index.ts`

### Security Requirements
- **Signature Verification**: Every incoming webhook must be verified via the `X-IYZ-SIGNATURE-V3` header. The Edge Function calculates an HMAC SHA-256 digest of the payload string using the `IYZICO_SECRET_KEY` and compares it to the incoming header using a timing-safe equals check (`safeTimingEqual`).
  - *Subscription Webhook Format*: `secretKey` + `merchantId` + `eventType` + `subscriptionReferenceCode` + `orderReferenceCode` + `customerReferenceCode`.
  - *HPP/Checkout Form Format*: `secretKey` + `iyziEventType` + `iyziPaymentId` + `token` + `paymentConversationId` + `status`.
- **Sandbox Testing Exception**: Signature validation can be bypassed locally by setting `IYZICO_WEBHOOK_VERIFY_MODE=sandbox_bypass`, but this is strictly blocked in production.
- **Idempotency**: Webhooks might be delivered more than once. The system constructs a `providerEventId` hash. Lookups are executed against the `audit_logs` table (`action = 'payment_webhook'`) to detect and gracefully return `200 OK` for duplicated notifications.
- **Role Isolation**: The function must use `SUPABASE_SERVICE_ROLE_KEY` to securely update the internal database once verification succeeds.

### Integration Steps
1. Ensure both `IYZICO_API_KEY` and `IYZICO_SECRET_KEY` are provisioned in the function container.
2. Deploy the function: `supabase functions deploy payment-webhook`.
3. Inform Iyzico support or configure your Merchant Panel with the `payment-webhook` URL.
