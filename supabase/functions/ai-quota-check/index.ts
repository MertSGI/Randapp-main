import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { tenantId } = await req.json();

    // TODO: Verify tenant entitlement (plan, aiMonthlyQuota)
    // Decrement or check monthly count from DB
    return new Response(
      JSON.stringify({ allowed: true, quotaRemaining: 42 }),
      { headers: { "Content-Type": "application/json" } },
    )
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 400,
    })
  }
})
