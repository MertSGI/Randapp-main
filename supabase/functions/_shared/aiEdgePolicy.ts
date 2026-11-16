// ============================================================================
// Shared Fail-Closed Policy for Phase 3 AI Edge Function Scaffolds
// (ai-quota-check, ai-recommendation, ai-visualization)
//
// Compatible with both Deno Edge Runtime and Node/tsx behavioral test runners.
// ============================================================================

export const AI_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export type AiEdgeFeatureName = 'ai-quota-check' | 'ai-recommendation' | 'ai-visualization';

export interface AiEdgePolicyOptions {
  featureName: AiEdgeFeatureName;
  requiresPrompt?: boolean;
  getEnv?: (key: string) => string | undefined;
}

declare const Deno:
  | {
      env: {
        get(key: string): string | undefined;
      };
    }
  | undefined;

export function readEdgeEnv(key: string): string | undefined {
  if (typeof Deno !== 'undefined' && Deno?.env?.get) {
    return Deno.env.get(key);
  }
  const nodeProcess = (
    globalThis as {
      process?: {
        env?: Record<string, string | undefined>;
      };
    }
  ).process;
  return nodeProcess?.env?.[key];
}

function jsonEdgeResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...AI_CORS_HEADERS,
      'Content-Type': 'application/json',
    },
  });
}

function failClosedError(code: string, message: string, status: number): Response {
  return jsonEdgeResponse(
    {
      success: false,
      allowed: false,
      availabilityTier: 'DISABLED_EXTERNAL_HOLD',
      error: { code, message },
    },
    status
  );
}

/**
 * Enforces fail-closed auth, payload bounds, and EXTERNAL_HOLD gating
 * across all Phase 3 AI edge scaffolds.
 */
export async function handleAiEdgeScaffoldRequest(
  req: Request,
  options: AiEdgePolicyOptions
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: AI_CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return failClosedError('METHOD_NOT_ALLOWED', 'POST required.', 405);
  }

  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.slice(7).trim().length === 0) {
    return failClosedError('AUTH_REQUIRED', 'Valid authentication token required.', 401);
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return failClosedError('INVALID_INPUT', 'JSON object request body required.', 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return failClosedError('INVALID_INPUT', 'Invalid JSON request body.', 400);
  }

  const tenantId = body.tenantId;
  if (typeof tenantId !== 'string' || tenantId.trim().length === 0) {
    return failClosedError('INVALID_INPUT', 'tenantId is required.', 400);
  }

  if (options.requiresPrompt) {
    const prompt = body.prompt;
    if (typeof prompt !== 'string' || prompt.trim().length === 0) {
      return failClosedError('INVALID_INPUT', 'Non-empty prompt is required.', 400);
    }
    if (prompt.length > 4_000) {
      return failClosedError('PAYLOAD_TOO_LARGE', 'Prompt exceeds maximum length of 4000 characters.', 413);
    }
  }

  const envReader = options.getEnv ?? readEdgeEnv;
  const geminiKey = (envReader('GEMINI_API_KEY') || '').trim();
  const liveEnabled = envReader('AI_FEATURES_LIVE_ENABLED') === 'true';

  if (!geminiKey || geminiKey.startsWith('replace_with_') || !liveEnabled) {
    return failClosedError(
      'AI_PROVIDER_NOT_CONFIGURED',
      `${options.featureName} is disabled in 0-TL / EXTERNAL_HOLD mode until live server keys are provisioned.`,
      503
    );
  }

  // Fail closed until server-side tenant entitlement & quota ledger RPC is wired for Phase 3 Gemini endpoints
  return failClosedError(
    'AI_ENTITLEMENT_UNVERIFIED',
    `${options.featureName} requires server-side tenant entitlement verification before execution.`,
    503
  );
}
