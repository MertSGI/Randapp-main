// Supabase Edge Function: subscription-sync
// Synchronizes subscription status from payment provider to internal database
// Adheres strictly to FAIL-CLOSED security principles:
// 1. Without trusted provider attestation or explicit test/sandbox authorization,
//    no tenant or subscription can be transitioned to active.
// 2. Production environments strictly prohibit mock or simulated statuses.
// 3. Mock sync requires explicit server-side enablement (ALLOW_SUBSCRIPTION_SYNC_MOCK=true)
//    and a verified non-production environment; unknown or conflicting environments fail closed.
// 4. Database mutations are strictly atomic via single transaction-backed RPC.
//    If the RPC is unavailable or fails, execution halts with 503 and zero table mutations.
// 5. Error disclosure prevention: Raw provider error strings and internal exception messages
//    are never leaked into HTTP response payloads or server logs.

declare const Deno: any;
declare const process: any;

let createClientFn: any = null;

async function getCreateClient() {
  if (createClientFn) return createClientFn;
  if (typeof Deno !== 'undefined') {
    const denoSupabaseUrl = "https://esm.sh/@supabase/supabase-js@2.39.0";
    // @ts-ignore
    const mod = await import(/* @vite-ignore */ denoSupabaseUrl);
    createClientFn = mod.createClient;
  } else {
    const mod = await import("@supabase/supabase-js");
    createClientFn = mod.createClient;
  }
  return createClientFn;
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export interface SubscriptionSyncOptions {
  supabaseAdmin?: any;
  getEnv?: (key: string) => string | undefined;
  verifyProviderStatus?: (tenantId: string, subscriptionRef?: string) => Promise<{
    verified: boolean;
    status?: string;
    error?: string;
  }>;
}

export interface SubscriptionSyncResult {
  ok: boolean;
  mode: string;
  tenantId?: string;
  providerStatus?: string;
  subscriptionStatus?: string;
  tenantStatus?: string;
  activated?: boolean;
  errorCode?: string;
  message?: string;
  error?: string;
}

const PROD_MARKERS = new Set(['production', 'prod', 'production_live']);
const NON_PROD_MARKERS = new Set(['development', 'dev', 'test', 'testing', 'staging', 'sandbox', 'local']);
const RELEVANT_ENV_KEYS = [
  'ENVIRONMENT',
  'NODE_ENV',
  'DENO_ENV',
  'PAYMENT_RUN_MODE',
  'VITE_PAYMENT_RUN_MODE'
];

export interface EnvironmentEvaluation {
  isProduction: boolean;
  isKnownNonProduction: boolean;
  hasConflict: boolean;
  reason?: string;
}

/**
 * Evaluates the runtime environment based on all relevant environment variables.
 * Treats any production marker as production.
 * Treats conflicting production/non-production markers or unknown values as fail-closed.
 */
export function evaluateEnvironment(getEnv: (k: string) => string | undefined): EnvironmentEvaluation {
  let foundProdMarker = false;
  let foundNonProdMarker = false;
  let hasAnyEnvVal = false;
  let foundUnknownMarker = false;

  for (const key of RELEVANT_ENV_KEYS) {
    const raw = getEnv(key);
    if (typeof raw === 'string' && raw.trim() !== '') {
      hasAnyEnvVal = true;
      const val = raw.trim().toLowerCase();
      if (PROD_MARKERS.has(val)) {
        foundProdMarker = true;
      } else if (NON_PROD_MARKERS.has(val)) {
        foundNonProdMarker = true;
      } else {
        foundUnknownMarker = true;
      }
    }
  }

  // Any production marker found
  if (foundProdMarker) {
    if (foundNonProdMarker) {
      return {
        isProduction: true,
        isKnownNonProduction: false,
        hasConflict: true,
        reason: 'CONFLICTING_PRODUCTION_AND_NON_PRODUCTION_SIGNALS'
      };
    }
    return {
      isProduction: true,
      isKnownNonProduction: false,
      hasConflict: false,
      reason: 'PRODUCTION_ENVIRONMENT'
    };
  }

  // No production markers
  if (!hasAnyEnvVal) {
    return {
      isProduction: false,
      isKnownNonProduction: false,
      hasConflict: false,
      reason: 'UNKNOWN_OR_UNDEFINED_ENVIRONMENT'
    };
  }

  if (foundUnknownMarker) {
    return {
      isProduction: false,
      isKnownNonProduction: false,
      hasConflict: true,
      reason: 'UNRECOGNIZED_ENVIRONMENT_VALUE'
    };
  }

  if (foundNonProdMarker) {
    return {
      isProduction: false,
      isKnownNonProduction: true,
      hasConflict: false,
      reason: 'NON_PRODUCTION_ENVIRONMENT'
    };
  }

  return {
    isProduction: false,
    isKnownNonProduction: false,
    hasConflict: false,
    reason: 'UNKNOWN_ENVIRONMENT'
  };
}

/**
 * Determines whether the current execution is within a production environment.
 * Any production marker or conflicting production marker returns true (fail-closed for production).
 */
export function isProductionEnvironment(getEnv: (k: string) => string | undefined): boolean {
  const envEval = evaluateEnvironment(getEnv);
  return envEval.isProduction;
}

/**
 * Maps raw provider status to internal subscription status.
 * FAIL-CLOSED: Any unrecognized, missing, or invalid status defaults strictly to 'suspended'.
 */
export function mapProviderStatusToSubscriptionStatus(providerStatus: string | null | undefined): string {
  if (!providerStatus || typeof providerStatus !== 'string') {
    return 'suspended';
  }

  const normalized = providerStatus.trim().toLowerCase();
  switch (normalized) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'pending':
      return 'pending';
    case 'failed':
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
    case 'cancelled':
      return 'cancelled';
    case 'expired':
      return 'expired';
    case 'suspended':
      return 'suspended';
    case 'pending_checkout':
      return 'pending_checkout';
    default:
      // FAIL-CLOSED DEFAULT: never default to active
      return 'suspended';
  }
}

/**
 * Evaluates whether a tenant status should be active based on subscription status.
 * Only 'active' and 'trialing' subscriptions grant active tenant access.
 */
export function evaluateTenantStatusFromSubscriptionStatus(subscriptionStatus: string): 'active' | 'suspended' {
  if (subscriptionStatus === 'active' || subscriptionStatus === 'trialing') {
    return 'active';
  }
  return 'suspended';
}

/**
 * Evaluates whether sandbox mock simulation is permitted.
 * FAIL-CLOSED:
 * 1. Forbidden unconditionally in production or when any production marker exists.
 * 2. In non-production, requires BOTH:
 *    a. Trusted server-side authorization: ALLOW_SUBSCRIPTION_SYNC_MOCK === 'true'
 *    b. Verified explicit non-production environment (no unknown, missing, or conflicting environments)
 *    c. Explicit client-side test flag (sandboxMock, testMode, or allowMock)
 */
export function isMockSyncAllowed(
  isProd: boolean,
  body: any,
  getEnv: (k: string) => string | undefined
): { allowed: boolean; reason?: string } {
  const envEval = evaluateEnvironment(getEnv);

  const hasMockPayload = Boolean(
    body && (
      body.sandboxMock === true ||
      body.allowMock === true ||
      body.testMode === true ||
      (typeof body.simulateProviderStatus === 'string' && body.simulateProviderStatus.trim() !== '') ||
      (typeof body.mockProviderStatus === 'string' && body.mockProviderStatus.trim() !== '')
    )
  );

  const hasExplicitTestFlag = Boolean(
    body && (
      body.sandboxMock === true ||
      body.allowMock === true ||
      body.testMode === true
    )
  );

  // 1. Any production marker strictly forbids mock
  if (isProd || envEval.isProduction) {
    if (hasMockPayload) {
      return { allowed: false, reason: 'MOCK_FORBIDDEN_IN_PRODUCTION' };
    }
    return { allowed: false, reason: 'PRODUCTION_MODE' };
  }

  // 2. Conflicting environment markers
  if (envEval.hasConflict) {
    return { allowed: false, reason: 'CONFLICTING_ENVIRONMENT' };
  }

  // 3. Unknown or unconfigured environment
  if (!envEval.isKnownNonProduction) {
    return { allowed: false, reason: 'UNKNOWN_ENVIRONMENT' };
  }

  // 4. Server-side authorization check
  const serverMockEnabled = getEnv('ALLOW_SUBSCRIPTION_SYNC_MOCK') === 'true';
  if (!serverMockEnabled) {
    return { allowed: false, reason: 'SERVER_MOCK_NOT_ENABLED' };
  }

  // 5. Explicit client-side test flag check
  if (!hasExplicitTestFlag) {
    return { allowed: false, reason: 'EXPLICIT_TEST_FLAG_REQUIRED' };
  }

  return { allowed: true };
}

/**
 * Core subscription sync handler
 */
export async function handleSubscriptionSync(
  req: Request | any,
  options: SubscriptionSyncOptions = {}
): Promise<Response> {
  const envGetter = options.getEnv || ((k: string) => (
    typeof Deno !== 'undefined'
      ? Deno.env.get(k)
      : (typeof process !== 'undefined' ? process.env?.[k] : undefined)
  ));

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({
        ok: false,
        error: 'Method not allowed',
        errorCode: 'METHOD_NOT_ALLOWED'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 405
      });
    }

    let body: any;
    try {
      let rawBody: any;
      try {
        rawBody = typeof req.text === 'function'
          ? await req.text()
          : (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
      } catch (streamErr) {
        throw streamErr;
      }
      body = typeof rawBody === 'string' ? JSON.parse(rawBody) : (rawBody || {});
    } catch (parseErr: any) {
      if (parseErr instanceof SyntaxError) {
        return new Response(JSON.stringify({
          ok: false,
          error: 'Invalid JSON payload',
          errorCode: 'INVALID_JSON'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        });
      }
      throw parseErr;
    }

    // 1. Diagnostic endpoint handler
    if (body.diagnostic === true) {
      const requiredEnvs = ['IYZICO_API_KEY', 'IYZICO_SECRET_KEY', 'IYZICO_BASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL'];
      const requiredEnvPresent: Record<string, boolean> = {};
      const missingEnvNames: string[] = [];

      for (const envVar of requiredEnvs) {
        const val = envGetter(envVar);
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

    // 2. Validate tenantId
    const { tenantId } = body;
    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim() === '') {
      return new Response(JSON.stringify({
        ok: false,
        error: 'Missing tenantId',
        errorCode: 'MISSING_TENANT_ID'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // 3. Supabase configuration validation
    let supabaseAdmin = options.supabaseAdmin;
    if (!supabaseAdmin) {
      const supabaseUrl = envGetter('SUPABASE_URL');
      const supabaseKey = envGetter('SUPABASE_SERVICE_ROLE_KEY');

      if (!supabaseUrl || !supabaseKey) {
        return new Response(JSON.stringify({
          ok: false,
          mode: 'sandbox_not_configured',
          errorCode: 'SUPABASE_CONFIG_MISSING',
          message: 'Supabase service role is missing. Real sync skipped.'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        });
      }

      const createClient = await getCreateClient();
      supabaseAdmin = createClient(supabaseUrl, supabaseKey);
    }

    // 4. Evaluate Environment and Mock Authorization
    const isProd = isProductionEnvironment(envGetter);
    const mockCheck = isMockSyncAllowed(isProd, body, envGetter);

    const requestsMock = Boolean(
      body && (
        body.sandboxMock === true ||
        body.allowMock === true ||
        body.testMode === true ||
        (typeof body.simulateProviderStatus === 'string' && body.simulateProviderStatus.trim() !== '') ||
        (typeof body.mockProviderStatus === 'string' && body.mockProviderStatus.trim() !== '')
      )
    );

    if (requestsMock && !mockCheck.allowed) {
      const errorCode = mockCheck.reason || 'MOCK_NOT_ALLOWED';
      let message = 'Mock subscription sync is not authorized.';
      if (mockCheck.reason === 'MOCK_FORBIDDEN_IN_PRODUCTION') {
        message = 'Simulated or mock provider status is strictly forbidden in production mode.';
      } else if (mockCheck.reason === 'CONFLICTING_ENVIRONMENT') {
        message = 'Conflicting environment configuration detected. Fail-closed: mock simulation aborted.';
      } else if (mockCheck.reason === 'UNKNOWN_ENVIRONMENT') {
        message = 'Unknown or unconfigured environment. Fail-closed: mock requires verified non-production environment.';
      } else if (mockCheck.reason === 'SERVER_MOCK_NOT_ENABLED') {
        message = 'Server-side mock authorization is missing. Fail-closed: mock requires ALLOW_SUBSCRIPTION_SYNC_MOCK=true.';
      } else if (mockCheck.reason === 'EXPLICIT_TEST_FLAG_REQUIRED') {
        message = 'Explicit sandbox/test flag is required in request payload for mock simulation.';
      }

      return new Response(JSON.stringify({
        ok: false,
        mode: 'fail_closed',
        errorCode,
        message,
        tenantId,
        activated: false
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403
      });
    }

    // 5. Determine Provider Status (FAIL-CLOSED)
    let rawProviderStatus: string | null = null;
    let syncMode = 'sync_verified';

    if (requestsMock && mockCheck.allowed) {
      syncMode = 'sandbox_mock';
      const candidateStatus = body.simulateProviderStatus ?? body.mockProviderStatus;
      rawProviderStatus = (typeof candidateStatus === 'string' && candidateStatus.trim() !== '')
        ? candidateStatus.trim()
        : 'unverified';
    } else {
      // Live / Production flow: requires verified external provider attestation
      if (options.verifyProviderStatus) {
        try {
          const verification = await options.verifyProviderStatus(tenantId, body.subscriptionReferenceCode);
          if (!verification || !verification.verified || !verification.status) {
            return new Response(JSON.stringify({
              ok: false,
              mode: 'fail_closed',
              errorCode: 'PROVIDER_VERIFICATION_FAILED',
              message: 'Payment provider verification failed. Fail-closed: activation prevented.',
              tenantId,
              activated: false
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 422
            });
          }
          rawProviderStatus = verification.status;
        } catch {
          return new Response(JSON.stringify({
            ok: false,
            mode: 'fail_closed',
            errorCode: 'PROVIDER_VERIFICATION_ERROR',
            message: 'Exception during payment provider verification. Fail-closed: activation prevented.',
            tenantId,
            activated: false
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 503
          });
        }
      } else {
        // Without external provider attestation or verified provider client:
        // FAIL-CLOSED: Refuse to guess or fake 'active'.
        return new Response(JSON.stringify({
          ok: false,
          mode: 'fail_closed',
          errorCode: 'PROVIDER_VERIFICATION_REQUIRED',
          message: 'Payment provider verification is required but external provider attestation is unavailable. Fail-closed: activation prevented.',
          tenantId,
          activated: false
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 503
        });
      }
    }

    // 6. Map Provider Status and Derive Target Tenant Status
    const dbStatus = mapProviderStatusToSubscriptionStatus(rawProviderStatus);
    const tenantTargetStatus = evaluateTenantStatusFromSubscriptionStatus(dbStatus);

    // 7. Atomic DB Updates via Single Transaction RPC
    // FAIL-CLOSED: Subscriptions and tenants must transition atomically.
    // Sequential multi-table writes are strictly forbidden. If RPC is missing or fails,
    // execution halts immediately with 503 and zero table mutations.
    if (!supabaseAdmin || typeof supabaseAdmin.rpc !== 'function') {
      return new Response(JSON.stringify({
        ok: false,
        mode: 'fail_closed',
        errorCode: 'RPC_UNAVAILABLE',
        message: 'Database transaction RPC interface is unavailable. Fail-closed: mutation aborted.',
        tenantId,
        activated: false
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 503
      });
    }

    const { data: txRes, error: txErr } = await supabaseAdmin.rpc('execute_subscription_sync_transaction', {
      p_tenant_id: tenantId,
      p_subscription_status: dbStatus,
      p_tenant_status: tenantTargetStatus,
      p_mode: syncMode,
      p_provider_status: rawProviderStatus,
      p_audit_details: {
        mode: syncMode,
        providerStatus: rawProviderStatus,
        mappedStatus: dbStatus,
        tenantStatus: tenantTargetStatus,
        failClosedEnforced: dbStatus !== 'active' && dbStatus !== 'trialing'
      }
    });

    if (txErr || !txRes || txRes.success !== true) {
      return new Response(JSON.stringify({
        ok: false,
        mode: 'fail_closed',
        errorCode: 'SUBSCRIPTION_SYNC_TRANSACTION_FAILED',
        message: 'Database transaction failed to commit. Fail-closed: mutation aborted.',
        tenantId,
        activated: false
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 503
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      mode: syncMode,
      tenantId,
      providerStatus: rawProviderStatus,
      subscriptionStatus: dbStatus,
      tenantStatus: tenantTargetStatus,
      activated: tenantTargetStatus === 'active',
      message: 'Subscription state synchronized successfully.'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch {
    // FAIL-CLOSED & SAFE LOGGING: Never disclose internal error messages or provider data
    return new Response(JSON.stringify({
      ok: false,
      error: 'Internal server error',
      errorCode: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
}

// Default export for Deno serve runtime
if (typeof Deno !== 'undefined' && typeof (Deno as any).serve === 'function') {
  (Deno as any).serve(handleSubscriptionSync);
}
