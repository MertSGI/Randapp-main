# iyzico Webhook Test Payloads (Mock Simulation)

For local development and sandbox verification, you can simulate Iyzico's subscription webhooks by sending manual POST requests to the local Supabase Edge Function endpoint. Ensure the `payment-webhook` function is running:

```bash
supabase functions serve payment-webhook
```

## 1. Subscription Activated

Simulates a successful subscription activation (e.g., initial checkout completed).

```bash
curl -X POST "http://127.0.0.1:54321/functions/v1/payment-webhook" \
  -H "Content-Type: application/json" \
  -H "x-iyzico-signature: sandbox-test" \
  -d '{
    "iyziEventType": "subscription.order.success",
    "subscriptionReferenceCode": "sub_ref_12345",
    "customerReferenceCode": "tenant-uuid-1234",
    "status": "ACTIVE",
    "conversationId": "mock_conv_id",
    "price": "499.00",
    "currencyCode": "TRY",
    "token": "evt_success_001"
  }'
```

To test against your remote deployed Edge Function in Supabase, replace the URL with your project ID:
```bash
curl -X POST "https://YOUR_PROJECT_REF.functions.supabase.co/payment-webhook" \
  -H "Content-Type: application/json" \
  -H "x-iyzico-signature: sandbox-test" \
  -d '{
    "iyziEventType": "subscription.order.success", ...
  }'
```

## 2. Payment Failed (Past Due)

Simulates a recurring payment failure.

```bash
curl -X POST http://127.0.0.1:54321/functions/v1/payment-webhook \\
  -H "Content-Type: application/json" \\
  -H "x-iyzico-signature: mock_signature" \\
  -d '{
    "iyziEventType": "subscription.order.failure",
    "subscriptionReferenceCode": "sub_ref_12345",
    "customerReferenceCode": "tenant-uuid-1234",
    "status": "PAST_DUE",
    "conversationId": "mock_conv_id",
    "price": "499.00",
    "currencyCode": "TRY",
    "token": "evt_fail_002"
  }'
```

## 3. Subscription Canceled

Simulates a subscription cancellation event.

```bash
curl -X POST http://127.0.0.1:54321/functions/v1/payment-webhook \\
  -H "Content-Type: application/json" \\
  -H "x-iyzico-signature: mock_signature" \\
  -d '{
    "iyziEventType": "subscription.canceled",
    "subscriptionReferenceCode": "sub_ref_12345",
    "customerReferenceCode": "tenant-uuid-1234",
    "status": "CANCELED",
    "conversationId": "mock_conv_id",
    "token": "evt_cancel_003"
  }'
```

> **Note:** These mock payloads represent the expected logic flow. The actual iyzico payload format may vary slightly based on the specific `eventType`. Set `IYZICO_WEBHOOK_VERIFY_MODE=sandbox_bypass` in your Edge function environment to allow these unsigned curls to pass through locally.
