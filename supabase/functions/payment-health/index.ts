import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const IYZICO_BASE_URL = Deno.env.get('IYZICO_BASE_URL');
    const IYZICO_API_KEY = Deno.env.get('IYZICO_API_KEY');
    const IYZICO_SECRET_KEY = Deno.env.get('IYZICO_SECRET_KEY');
    const IYZICO_PLAN_STARTER_REF = Deno.env.get('IYZICO_PLAN_STARTER_REF');
    const IYZICO_PLAN_PROFESSIONAL_REF = Deno.env.get('IYZICO_PLAN_PROFESSIONAL_REF');
    const IYZICO_PLAN_PREMIUM_REF = Deno.env.get('IYZICO_PLAN_PREMIUM_REF');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    return new Response(
      JSON.stringify({
        ok: true,
        provider: "iyzico",
        baseUrlConfigured: !!IYZICO_BASE_URL,
        baseUrlValue: IYZICO_BASE_URL || null,
        apiKeyConfigured: !!IYZICO_API_KEY,
        secretKeyConfigured: !!IYZICO_SECRET_KEY,
        starterPlanConfigured: !!IYZICO_PLAN_STARTER_REF,
        professionalPlanConfigured: !!IYZICO_PLAN_PROFESSIONAL_REF,
        premiumPlanConfigured: !!IYZICO_PLAN_PREMIUM_REF,
        supabaseConfigured: !!SUPABASE_URL,
        serviceRoleAvailable: !!SUPABASE_SERVICE_ROLE_KEY,
        environment: "sandbox_diagnostics"
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
