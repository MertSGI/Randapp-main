import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { CreateCheckoutSessionRequest, CreateCheckoutSessionResponse } from "../_shared/paymentTypes.ts";
import { getPlanDetails } from "../_shared/subscriptionMapper.ts";
import { iyzicoClient } from "../_shared/iyzicoClient.ts";

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
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 405,
      });
    }

    const body: any = await req.json();

    // Diagnostic endpoint protection: unauthenticated requests must be rejected
    if (body.diagnostic === true) {
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
        functionName: 'create-checkout-session',
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

    const { tenantId, planId, successUrl, cancelUrl, customer, billingCycle } = body;

    // Assert sandbox configuration is present without exposing secrets
    try {
      iyzicoClient.assertIyzicoSandboxConfig();
    } catch (configError: any) {
      return new Response(JSON.stringify({
        mode: 'sandbox_not_configured',
        errorCode: 'SANDBOX_NOT_CONFIGURED',
        message: 'Secure sandbox credentials are not configured in Edge Functions. Cannot start live checkout.',
        provider: 'iyzico',
        environment: 'sandbox',
        providerInteroperability: 'EXTERNAL_PROVIDER_VERIFICATION_PENDING'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200, // Safe diagnostic response
      });
    }

    if (!tenantId || !planId) {
      return new Response(JSON.stringify({
        ok: false,
        errorCode: 'MISSING_REQUIRED_FIELDS',
        message: 'Missing required fields: tenantId and planId'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const plan = getPlanDetails(planId);
    if (!plan) {
      return new Response(JSON.stringify({
        ok: false,
        errorCode: 'INVALID_PLAN',
        message: `Invalid planId: ${planId}`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const conversationId = `lari_${tenantId}_${Date.now()}`;

    // Forward to checkout session creator (will safely fail closed if live network is unconfigured)
    const sessionDetail = await iyzicoClient.createSubscriptionCheckoutSession({
      paymentPlanReferenceCode: plan.iyzicoPricingPlanReferenceCode,
      customer: {
        id: tenantId,
        name: customer?.name || "LARI",
        surname: customer?.surname || "User",
        email: customer?.email || "sandbox@lari.com",
        gsmNumber: customer?.phone || "+905555555555",
        identityNumber: "11111111111",
        billingAddress: {
          contactName: `${customer?.name || 'LARI'} ${customer?.surname || 'User'}`,
          city: customer?.city || "Istanbul",
          country: "Turkey",
          address: "Sandbox Address",
          zipCode: "34000"
        },
        shippingAddress: {
          contactName: `${customer?.name || 'LARI'} ${customer?.surname || 'User'}`,
          city: customer?.city || "Istanbul",
          country: "Turkey",
          address: "Sandbox Address",
          zipCode: "34000"
        }
      },
      callbackUrl: successUrl,
      conversationId: conversationId
    });

    const responseData: CreateCheckoutSessionResponse & { ok: boolean, conversationId: string, environment: string } = {
      ok: true,
      checkoutUrl: (sessionDetail as any).payWithIyzicoPageUrl,
      provider: "iyzico",
      sessionId: (sessionDetail as any).token,
      conversationId: conversationId,
      environment: "sandbox"
    };

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    const isConfigError = error.message.includes('missing') || error.message.includes('not set');

    if (isConfigError) {
      return new Response(JSON.stringify({
        mode: 'sandbox_not_configured',
        errorCode: 'SANDBOX_NOT_CONFIGURED',
        message: 'Secure sandbox credentials are not fully configured in Edge Functions. Cannot start live checkout.',
        provider: 'iyzico',
        environment: 'sandbox'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    return new Response(JSON.stringify({
      ok: false,
      errorCode: 'CHECKOUT_INITIALIZATION_ERROR',
      message: error.message,
      provider: 'iyzico',
      environment: 'sandbox',
      providerInteroperability: 'EXTERNAL_PROVIDER_VERIFICATION_PENDING'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
