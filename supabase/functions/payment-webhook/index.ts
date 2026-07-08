import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { iyzicoClient } from "../_shared/iyzicoClient.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      throw new Error('Method not allowed');
    }

    // Read raw payload for signature verification
    const rawBody = await req.text();
    
    let isDiagnostic = false;
    try {
      const parsedBody = JSON.parse(rawBody);
      if (parsedBody.diagnostic === true) {
        isDiagnostic = true;
      }
    } catch (e) {
      // Ignore JSON parse errors for diagnostic check
    }

    if (isDiagnostic) {
      const missingEnvNames = [];
      const requiredEnvs = ['IYZICO_API_KEY', 'IYZICO_SECRET_KEY', 'IYZICO_BASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL'];
      const requiredEnvPresent: Record<string, boolean> = {};

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
        canProceed: missingEnvNames.length === 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // Verify signature using shared client
    const payload = JSON.parse(rawBody);
    const isValidSignature = await iyzicoClient.verifyIyzicoSignatureV3(req.headers, payload);
    if (!isValidSignature) {
      console.log(`[SECURITY] Rejecting webhook from IP/Request due to invalid signature.`);
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid signature' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    console.log(`[iyzico-webhook] Received verified webhook payload:`, payload);

    // Map provider event to internal status
    const mappedStatus = iyzicoClient.mapIyzicoWebhookToInternalStatus(payload);
    
    // Init Supabase admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      console.log("[iyzico-webhook] Supabase admin config missing. Aborting DB sync.");
      return new Response(JSON.stringify({
        mode: 'sandbox_not_configured',
        message: 'Webhook received but Supabase service role is missing. Real sync skipped.',
        received: true
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200, 
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    // Idempotency check: construct unique event key
    const providerEventId = payload.iyziPaymentId || payload.token || `${payload.eventType}_${payload.subscriptionReferenceCode || payload.orderReferenceCode || payload.conversationId}`;
    
    const { data: existingEvent } = await supabaseAdmin
        .from('audit_logs')
        .select('id')
        .eq('action', 'payment_webhook')
        .eq('details->>providerEventId', providerEventId)
        .maybeSingle();

    if (existingEvent) {
       console.log(`[iyzico-webhook] Duplicate webhook event detected: ${providerEventId}. Returning 200 early.`);
       return new Response(JSON.stringify({ received: true, status: mappedStatus, duplicate: true }), {
         headers: { ...corsHeaders, 'Content-Type': 'application/json' },
         status: 200,
       });
    }
    
    // Log the raw event for idempotency & auditing
    await supabaseAdmin.from('audit_logs').insert({
       tenant_id: payload.customerReferenceCode || 'unknown',
       action: 'payment_webhook',
       details: { providerEventId, ...payload }
    });

    const subscriptionReferenceCode = payload.referenceCode || payload.subscriptionReferenceCode;
    const conversationId = payload.conversationId; // We used this for linking maybe?
    
    // Let's assume payload returns customerReferenceCode as well, mapping to tenantId
    const customerReferenceCode = payload.customerReferenceCode || payload.customer?.referenceCode;
    
    // Extract what we need. For our mock, we can rely on finding subscription by provider_subscription_id 
    // or by checking the pending conversation ID.
    // If we only have ReferenceCode, we search the subscriptions table:
    let tenantIdStr = customerReferenceCode || payload.tenantId; 

    // Update subscriptions table securely
    if (subscriptionReferenceCode) {
        const { data: subData, error: subError } = await supabaseAdmin.from('subscriptions')
          .update({ 
            status: mappedStatus,
            provider_subscription_id: subscriptionReferenceCode,
            updated_at: new Date().toISOString()
          })
          .eq('provider_subscription_id', subscriptionReferenceCode)
          .select('id, tenant_id')
          .single();

        if (!subError && subData) {
            tenantIdStr = subData.tenant_id;
            
            // Insert payment record
            await supabaseAdmin.from('payments').insert({
              tenant_id: tenantIdStr,
              subscription_id: subData.id,
              provider: 'iyzico',
              provider_event_id: payload.token || 'webhook_event',
              amount: payload.price || 0,
              currency: payload.currencyCode || 'TRY',
              status: mappedStatus === 'active' ? 'paid' : 'pending',
              metadata: payload,
              paid_at: mappedStatus === 'active' ? new Date().toISOString() : null
            });

            // Trigger provisioning workflow after first verified successful subscription
            if (mappedStatus === 'active') {
              console.log(`[iyzico-webhook] Mapping successful active sub for tenant ${tenantIdStr}, unlocking...`);
              await supabaseAdmin.from('tenants')
                .update({ status: 'active' }) // Transition from setup or billing-locked to active
                .eq('id', tenantIdStr)
                .eq('status', 'trial'); // or whatever status locking represents
            }
        } else {
             // Fallback: If we couldn't find an existing sub by ID, maybe it's the very first creation ping
             // Usually, createCheckoutSession already created a pending sub if schema supported it.
             console.log("[iyzico-webhook] Sub not found by ref code, looking at conversationId if present...");
        }
    }

    return new Response(JSON.stringify({ received: true, status: mappedStatus }), {
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
