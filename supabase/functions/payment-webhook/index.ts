import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { iyzicoClient } from "../_shared/iyzicoClient.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-iyz-signature-v3',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 405,
      });
    }

    // Read raw payload for signature verification
    const rawBody = await req.text();
    let parsedBody: any;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // Diagnostic endpoint protection: unauthenticated requests must be rejected
    if (parsedBody.diagnostic === true) {
      const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
      const expectedAdminKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

      const isAuthorized = Boolean(
        authHeader &&
        expectedAdminKey &&
        (authHeader === `Bearer ${expectedAdminKey}` || authHeader === expectedAdminKey)
      );

      if (!isAuthorized) {
        return new Response(JSON.stringify({
          error: 'Unauthorized: Diagnostic access requires valid service authorization',
          errorCode: 'UNAUTHENTICATED_DIAGNOSTIC_REQUEST'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        });
      }

      const requiredEnvs = ['IYZICO_API_KEY', 'IYZICO_SECRET_KEY', 'IYZICO_BASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL'];
      const requiredEnvPresent: Record<string, boolean> = {};
      const missingEnvNames: string[] = [];

      for (const envVar of requiredEnvs) {
        const val = Deno.env.get(envVar);
        requiredEnvPresent[envVar] = !!val;
        if (!val) missingEnvNames.push(envVar);
      }

      return new Response(JSON.stringify({
        functionName: 'payment-webhook',
        mode: 'diagnostic',
        requiredEnvPresent,
        missingEnvNames,
        timestamp: new Date().toISOString(),
        canProceed: missingEnvNames.length === 0,
        providerInteroperability: 'EXTERNAL_PROVIDER_VERIFICATION_PENDING'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // Cryptographic signature verification - fails closed on missing, malformed or invalid signatures
    const verification = await iyzicoClient.verifyIyzicoSignatureV3(req.headers, parsedBody);
    if (!verification.isValid) {
      // Safe security log: no secrets, signatures or customer PII
      console.warn(`[SECURITY] Rejected unauthorized webhook call. Reason: ${verification.reason}`);
      return new Response(JSON.stringify({
        error: 'Unauthorized: Invalid or missing cryptographic signature',
        reason: verification.reason
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    // Strict event classification check
    const mappedStatus = iyzicoClient.mapIyzicoWebhookToInternalStatus(parsedBody);
    if (mappedStatus === 'unknown') {
      console.warn('[SECURITY] Webhook event type is unsupported or unrecognized.');
      return new Response(JSON.stringify({ error: 'Bad Request: Unsupported event type' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // Log sanitized metadata (no PII, no card data, no secrets)
    const eventType = parsedBody.eventType || parsedBody.iyziEventType || 'unknown';
    const providerEventId = parsedBody.iyziPaymentId
      || parsedBody.token
      || `${eventType}_${parsedBody.subscriptionReferenceCode || parsedBody.orderReferenceCode || parsedBody.conversationId || Date.now()}`;

    console.log('[iyzico-webhook] Processing verified webhook event:', {
      eventType,
      providerEventId,
      mappedStatus
    });

    // Check Supabase admin configuration
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      return new Response(JSON.stringify({
        mode: 'sandbox_not_configured',
        message: 'Webhook cryptographically verified, but backend database service role is not configured.',
        received: true,
        verified: true
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    // Idempotency check: prevent duplicate event processing
    const { data: existingEvent } = await supabaseAdmin
      .from('audit_logs')
      .select('id')
      .eq('action', 'payment_webhook')
      .eq('details->>providerEventId', providerEventId)
      .maybeSingle();

    if (existingEvent) {
      console.log(`[iyzico-webhook] Duplicate webhook event detected: ${providerEventId}. Returning idempotent 200.`);
      return new Response(JSON.stringify({ received: true, status: mappedStatus, duplicate: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const subscriptionReferenceCode = parsedBody.referenceCode || parsedBody.subscriptionReferenceCode;
    const payloadCustomerRef = parsedBody.customerReferenceCode || parsedBody.customer?.referenceCode || parsedBody.tenantId;

    if (!subscriptionReferenceCode) {
      return new Response(JSON.stringify({ error: 'Missing subscriptionReferenceCode' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // Verify subscription existence before mutating
    const { data: subData, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('id, tenant_id, status')
      .eq('provider_subscription_id', subscriptionReferenceCode)
      .maybeSingle();

    if (subError || !subData) {
      console.warn(`[iyzico-webhook] Unknown subscription reference: ${subscriptionReferenceCode}`);
      return new Response(JSON.stringify({ error: 'Subscription not found for provided reference' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      });
    }

    // Enforce customer/tenant mismatch rejection
    if (payloadCustomerRef && subData.tenant_id && subData.tenant_id !== payloadCustomerRef) {
      console.error(`[SECURITY] Customer/tenant mismatch detected! Payload: ${payloadCustomerRef}, DB: ${subData.tenant_id}`);
      return new Response(JSON.stringify({ error: 'Forbidden: Tenant mismatch between payload and subscription' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      });
    }

    // Log sanitized audit entry (never store raw PII or secret material)
    await supabaseAdmin.from('audit_logs').insert({
      tenant_id: subData.tenant_id,
      action: 'payment_webhook',
      details: {
        providerEventId,
        eventType,
        status: mappedStatus,
        subscriptionReferenceCode,
        verifiedAt: new Date().toISOString()
      }
    });

    // Update subscriptions table with verified status
    await supabaseAdmin.from('subscriptions')
      .update({
        status: mappedStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', subData.id);

    // Record payment ledger entry if status is active
    if (mappedStatus === 'active') {
      await supabaseAdmin.from('payments').insert({
        tenant_id: subData.tenant_id,
        subscription_id: subData.id,
        provider: 'iyzico',
        provider_event_id: providerEventId,
        amount: parsedBody.price || 0,
        currency: parsedBody.currencyCode || 'TRY',
        status: 'paid',
        paid_at: new Date().toISOString(),
        metadata: {
          providerEventId,
          eventType,
          subscriptionReferenceCode
        }
      });
    }

    return new Response(JSON.stringify({
      received: true,
      verified: true,
      status: mappedStatus
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error("Webhook processing error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
