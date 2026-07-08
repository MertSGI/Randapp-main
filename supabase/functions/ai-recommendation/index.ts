import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req: Request) => {
  // Edge Function Scaffold for Phase 3
  // Usage: supabase functions deploy ai-recommendation
  // Setup: supabase secrets set GEMINI_API_KEY=your_key
  
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { tenantId, prompt, imageBase64 } = await req.json();

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) {
      // Mock safe response
      return new Response(
        JSON.stringify({
          text: "Mock Edge Function Recommendation: Based on your input, we suggest a layered cut and full color treatment. (Configured in test mode - no AI key)."
        }),
        { headers: { "Content-Type": "application/json" } },
      )
    }

    // TODO: Verify tenant entitlement (plan, aiMonthlyQuota)
    // TODO: Integrate actual @google/genai SDK natively here using Deno
    return new Response(
      JSON.stringify({ text: "Real AI response placeholder" }),
      { headers: { "Content-Type": "application/json" } },
    )
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 400,
    })
  }
})
