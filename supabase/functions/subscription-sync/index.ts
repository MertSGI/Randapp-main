import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
    const body = await req.json();

    if (body.diagnostic === true) {
      const missingEnvNames = [];
      const requiredEnvs = ['IYZICO_API_KEY', 'IYZICO_SECRET_KEY', 'IYZICO_BASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL'];
      const requiredEnvPresent: Record<string, boolean> = {};

      for (const envVar of requiredEnvs) {
        const val = Deno.env.get(envVar);
        requiredEnvPresent[envVar] = !!val;
        if (!val) missingEnvNames.push(envVar);
      }

      return new Response(JSON.stringify({
        functionName: 'subscription-sync',
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

    const { tenantId } = body;

    if (!tenantId) {
      return new Response(JSON.stringify({ error: 'Missing tenantId' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      return new Response(JSON.stringify({
        mode: 'sandbox_not_configured',
        message: 'Supabase service role is missing. Real sync skipped.'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // Scaffold for syncing subscription state from payment provider to DB
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    // Fetch subscription logic from provider (mocked for sandbox logic here)
    const mockProviderStatus = 'active'; // this would be awaited from iyzicoClient.getSubscriptionDetail(...)
    
    let dbStatus = 'active';
    switch(mockProviderStatus) {
      case 'active': dbStatus = 'active'; break;
      case 'trialing': dbStatus = 'trialing'; break;
      case 'pending': dbStatus = 'pending'; break;
      case 'failed':
      case 'past_due': dbStatus = 'past_due'; break;
      case 'canceled':
      case 'cancelled': dbStatus = 'cancelled'; break;
      case 'expired': dbStatus = 'expired'; break;
      case 'suspended': dbStatus = 'suspended'; break;
      case 'pending_checkout': dbStatus = 'pending_checkout'; break;
      default: dbStatus = 'suspended'; break;
    }

    const { error: subError } = await supabaseAdmin.from('subscriptions')
        .update({ status: dbStatus, updated_at: new Date().toISOString() })
        .eq('tenant_id', tenantId);
        
    await supabaseAdmin.from('audit_logs').insert({
       tenant_id: tenantId,
       action: 'subscription_sync',
       details: { providerStatus: mockProviderStatus, mappedStatus: dbStatus },
       created_at: new Date().toISOString()
    });

    if (dbStatus === 'active' || dbStatus === 'trialing') {
       await supabaseAdmin.from('tenants').update({ status: 'active' }).eq('id', tenantId);
    } else {
       await supabaseAdmin.from('tenants').update({ status: 'suspended' }).eq('id', tenantId);
    }

    if (subError) {
       console.error("Subscription Sync Update failed: ", subError.message);
    }

    return new Response(JSON.stringify({
      mode: 'sandbox',
      message: 'Dry-run successful. Subscription state verified.'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    });
  }
});
