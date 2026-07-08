import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { CreateBillingPortalSessionRequest, CreateBillingPortalSessionResponse } from "../_shared/paymentTypes.ts";

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

    const body: CreateBillingPortalSessionRequest = await req.json();
    const { tenantId, returnUrl } = body;

    // Notice: iyzico does NOT have a ready-made hosted billing portal like Stripe.
    // Merchants usually handle card updates via specific API calls on their own UI, or support handles it.

    const responseData: CreateBillingPortalSessionResponse = {
      portalUrl: `${returnUrl}?tab=abonelik`,
      provider: "iyzico",
      note: "Billing self-service portal requires provider-specific implementation or support-assisted flow."
    };

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
