import { iyzicoClient } from "../_shared/iyzicoClient.ts";

// Deno / Node runtime compatibility declarations
declare const Deno: any;
declare const process: any;

// Dynamic imports for runtime independence
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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-iyz-signature-v3',
};

// ==============================================================================
// PII, SENSITIVE DATA, AND CREDENTIAL SANITIZATION FOR SAFE LOGS & RESPONSES
// ==============================================================================

const SENSITIVE_KEY_PATTERNS = [
  /pass(?:word)?/i,
  /secret/i,
  /apikey/i,
  /api[_-]?key/i,
  /auth/i,
  /bearer/i,
  /token/i,
  /signature/i,
  /hash/i,
  /salt/i,
  /card/i,
  /pan/i,
  /cvv\d?/i,
  /cvc\d?/i,
  /security[_-]?code/i,
  /verification[_-]?code/i,
  /cardholder/i,
  /exp(?:iry)?(?:month|year)?/i,
  /email/i,
  /phone/i,
  /gsm/i,
  /mobile/i,
  /identity/i,
  /tckn/i,
  /tc[_-]?kimlik/i,
  /vkn/i,
  /tax[_-]?number/i,
  /tax[_-]?id/i,
  /iban/i,
  /account[_-]?number/i,
  /address/i,
  /buyer/i,
  /customer/i,
  /payer/i,
  /billing/i,
  /shipping/i,
  /user[_-]?key/i,
  /bin[_-]?number/i,
  /last[_-]?four/i,
  /client[_-]?ip/i,
  /ip[_-]?address/i
];

export function isSensitiveKey(key: string): boolean {
  if (!key || typeof key !== 'string') return false;
  const lower = key.toLowerCase();
  // Safe structural property names that should not be redacted
  if (
    lower === 'functionname' ||
    lower === 'eventtype' ||
    lower === 'iyzieventtype' ||
    lower === 'status' ||
    lower === 'subscriptionstatus' ||
    lower === 'provider' ||
    lower === 'reason' ||
    lower === 'code' ||
    lower === 'errorcode' ||
    lower === 'error' ||
    lower === 'unhandled_error' ||
    lower === 'message' ||
    lower === 'received' ||
    lower === 'duplicate' ||
    lower === 'idempotent' ||
    lower === 'paymentrecorded' ||
    lower === 'outofordersuppressed' ||
    lower === 'providereventid' ||
    lower === 'providerpaymentid' ||
    lower === 'orderreferencecode' ||
    lower === 'subscriptionreferencecode' ||
    lower === 'haspaymentproof' ||
    lower === 'action' ||
    lower === 'details' ||
    lower === 'created_at' ||
    lower === 'updated_at' ||
    lower === 'paid_at' ||
    lower === 'last_webhook_event_at' ||
    lower === 'finalized' ||
    lower === 'retryable' ||
    lower === 'verified'
  ) {
    return false;
  }
  if (
    lower === 'name' || lower === 'surname' || lower === 'firstname' || lower === 'lastname' ||
    lower === 'fullname' || lower === 'contactname' || lower === 'payername' || lower === 'buyername' ||
    lower === 'city' || lower === 'country' || lower === 'district' || lower === 'zipcode' || lower === 'postcode'
  ) {
    return true;
  }
  return SENSITIVE_KEY_PATTERNS.some(pat => pat.test(key));
}

// Regex for credit card PAN (13 to 19 digits)
const CARD_REGEX = /\b(?:\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{1,7}|\d{4}[ -]\d{6}[ -]\d{4,5}|\d{13,19})\b/g;
// Regex for CVV / CVC
const CVV_REGEX = /\b(?:cvv|cvc|cvv2|cvc2|security[_-]?code)\s*[:=]\s*\d{3,4}\b/gi;
// Regex for email
const EMAIL_REGEX = /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g;
// Regex for phone numbers (Turkish and international formats)
const PHONE_REGEX = /(?:\+?90|0)?\s*\(?[1-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{2}[-.\s]?\d{2}\b/g;
// Regex for 11-digit Turkish National ID (TCKN)
const TCKN_REGEX = /\b[1-9]\d{10}\b/g;
// Regex for Bearer tokens
const BEARER_REGEX = /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi;
// Regex for IYZWS Authorization
const IYZWS_REGEX = /IYZWS\s+[A-Za-z0-9._~+/-:]+/gi;
// Regex for JWT tokens
const JWT_REGEX = /\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g;
// Regex for Turkish IBAN
const IBAN_REGEX = /\bTR\d{2}[0-9A-Z]{20,24}\b/gi;
// Regex for 64-char Hex signatures / secrets
const HEX_SIG_REGEX = /\b[0-9a-fA-F]{64}\b/g;
// Regex for query string or key-value secrets
const QUERY_SECRET_REGEX = /((?:api[_-]?key|secret|token|signature|password|auth)=)[^&\s]+/gi;
// Regex for secret key-value pairs separated by colon, equals, or whitespace
const SECRET_KV_REGEX = /\b((?:client[_-]?secret|api[_-]?key|secret[_-]?key|secret|token|signature|password|auth)\s*[:=\s]\s*)[^\s,;'"}{]+/gi;
// Regex for Google / Firebase style API keys
const GENERIC_API_KEY_REGEX = /\b(?:AIza[0-9A-Za-z-_]{35}|AIzaSy[0-9A-Za-z-_]+)\b/g;

/**
 * Validates whether an error string is a stable, safe programmatic error code
 */
export function isStableErrorCode(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
  const trimmed = str.trim();
  if (/^[A-Z0-9_-]{2,64}$/.test(trimmed)) return true;
  if (/^Database transaction failed: [A-Z0-9_-]{2,64}$/.test(trimmed)) return true;
  const knownSafeMessages = [
    'Method not allowed',
    'Invalid JSON payload',
    'Internal Server Error',
    'Service Unavailable: Transactional database interface unavailable',
    'Service Unavailable: Backend database service role is not configured',
    'Service Unavailable: Database idempotency reservation failure',
    'Service Unavailable: Subscription lookup failure',
    'Service Unavailable: Subscription record not yet provisioned; retryable for eventual consistency',
    'Service Unavailable: Database transaction failure',
    'Service Unavailable: Database idempotency reservation not found',
    'Service Unavailable: Failed to finalize tenant mismatch security rejection',
    'Service Unavailable: Concurrent leader timed out and event has not committed in DB',
    'Service Unavailable: Concurrent webhook transaction failed in leader',
    'Service Unavailable: Webhook event is currently in processing state by another worker',
    'Service Unavailable: Checkout binding lookup failed',
    'Service Unavailable: Missing verified subscription reference',
    'Service Unavailable: Lease was taken over by another worker which has not yet committed',
    'Service Unavailable: Webhook execution terminated unexpectedly',
    'Forbidden: Tenant mismatch between payload and subscription',
    'Forbidden: Checkout binding failed under subscription row lock',
    'Forbidden: Unbound checkout session',
    'Forbidden: Unbound checkout session; signed token/conversationId has no verified server-side binding',
    'Conflict: In-flight payload fingerprint mismatch for event',
    'Conflict: Event ID collision with mismatched payload',
    'Conflict: Webhook event is not in processing state and cannot be executed',
    'Bad Request: Missing unique provider event identification or timestamp',
    'Bad Request: Missing canonical subscriptionReferenceCode',
    'Bad Request: Unauthenticated customer/tenant reference alias',
    'Bad Request: Conflicting eventType and iyziEventType in HPP webhook',
    'Bad Request: Missing signed orderReferenceCode; un-signed alias rejected',
    'Bad Request: Missing signed checkout binding',
    'Bad Request: Unsupported event type',
    'Unauthorized: Invalid or missing cryptographic signature',
    'Unauthorized: Diagnostic access requires valid service authorization',
    'Unsupported provider webhook event: use authorized provider state reconciliation',
    'ok'
  ];
  return knownSafeMessages.includes(trimmed);
}

/**
 * Sanitizes raw string against customer PII, secrets, API keys, tokens, and card numbers
 */
export function sanitizeString(str: string): string {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(BEARER_REGEX, 'Bearer [REDACTED_TOKEN]')
    .replace(IYZWS_REGEX, 'IYZWS [REDACTED]')
    .replace(JWT_REGEX, '[REDACTED_JWT]')
    .replace(SECRET_KV_REGEX, '$1[REDACTED]')
    .replace(GENERIC_API_KEY_REGEX, '[REDACTED_API_KEY]')
    .replace(QUERY_SECRET_REGEX, '$1[REDACTED]')
    .replace(IBAN_REGEX, '[REDACTED_IBAN]')
    .replace(EMAIL_REGEX, '[REDACTED_EMAIL]')
    .replace(CARD_REGEX, '[REDACTED_CARD]')
    .replace(CVV_REGEX, 'cvv: [REDACTED]')
    .replace(TCKN_REGEX, '[REDACTED_ID]')
    .replace(PHONE_REGEX, '[REDACTED_PHONE]')
    .replace(HEX_SIG_REGEX, '[REDACTED_SIGNATURE]');
}

/**
 * Recursively sanitizes objects, arrays, and primitives for safe logging
 */
export function sanitizeLogValue(val: any, depth = 0): any {
  if (depth > 6) return '[NESTING_LIMIT]';
  if (val === null || val === undefined) return val;
  if (typeof val === 'string') {
    return sanitizeString(val);
  }
  if (typeof val === 'number' || typeof val === 'boolean') {
    return val;
  }
  if (val instanceof Error) {
    const code = (val as any).code || (val as any).errorCode;
    return {
      name: val.name,
      errorCode: typeof code === 'string' && isStableErrorCode(code) ? code : 'UNHANDLED_EXCEPTION',
      message: '[REDACTED_ERROR_MESSAGE]'
    };
  }
  if (Array.isArray(val)) {
    return val.map(item => sanitizeLogValue(item, depth + 1));
  }
  if (typeof val === 'object') {
    const sanitizedObj: Record<string, any> = {};
    for (const [key, value] of Object.entries(val)) {
      const lowerKey = key.toLowerCase();
      if (isSensitiveKey(key)) {
        sanitizedObj[key] = '[REDACTED]';
      } else if (
        lowerKey === 'unhandled_error' ||
        lowerKey === 'message' ||
        lowerKey === 'error' ||
        lowerKey === 'details' ||
        lowerKey === 'hint' ||
        lowerKey === 'description' ||
        lowerKey === 'reason'
      ) {
        if (typeof value === 'string') {
          if (isStableErrorCode(value)) {
            sanitizedObj[key] = value;
          } else {
            sanitizedObj[key] = '[REDACTED_ERROR]';
          }
        } else if (value instanceof Error) {
          sanitizedObj[key] = sanitizeLogValue(value, depth + 1);
        } else if (typeof value === 'object' && value !== null) {
          sanitizedObj[key] = sanitizeLogValue(value, depth + 1);
        } else {
          sanitizedObj[key] = '[REDACTED_ERROR]';
        }
      } else {
        sanitizedObj[key] = sanitizeLogValue(value, depth + 1);
      }
    }
    return sanitizedObj;
  }
  return '[UNSERIALIZABLE]';
}

export const sanitizeObject = sanitizeLogValue;

/**
 * Safe logger that strictly intercepts and sanitizes any sensitive material
 */
export const safeLogger = {
  log: (...args: any[]) => {
    console.log(...args.map(arg => {
      if (typeof arg === 'string') return sanitizeString(arg);
      if (arg instanceof Error) {
        const code = (arg as any).code || (arg as any).errorCode;
        return typeof code === 'string' && isStableErrorCode(code) ? `[Error: ${code}]` : '[Error: UNHANDLED_EXCEPTION]';
      }
      return sanitizeLogValue(arg);
    }));
  },
  warn: (...args: any[]) => {
    console.warn(...args.map(arg => {
      if (typeof arg === 'string') return sanitizeString(arg);
      if (arg instanceof Error) {
        const code = (arg as any).code || (arg as any).errorCode;
        return typeof code === 'string' && isStableErrorCode(code) ? `[Error: ${code}]` : '[Error: UNHANDLED_EXCEPTION]';
      }
      return sanitizeLogValue(arg);
    }));
  },
  error: (...args: any[]) => {
    console.error(...args.map(arg => {
      if (typeof arg === 'string') return sanitizeString(arg);
      if (arg instanceof Error) {
        const code = (arg as any).code || (arg as any).errorCode;
        return typeof code === 'string' && isStableErrorCode(code) ? `[Error: ${code}]` : '[Error: UNHANDLED_EXCEPTION]';
      }
      return sanitizeLogValue(arg);
    }));
  }
};

/**
 * Helper to construct safe, PII-sanitized error responses
 */
export function createSafeErrorResponse(
  status: number,
  error: string,
  errorCode?: string,
  extraFields: Record<string, any> = {}
): Response {
  const sanitizedExtra = sanitizeLogValue(extraFields);
  // Redact reference codes and provider event identifiers from error responses unconditionally
  if (typeof sanitizedExtra === 'object' && sanitizedExtra !== null) {
    delete sanitizedExtra.referenceCode;
    delete sanitizedExtra.subscriptionReferenceCode;
    delete sanitizedExtra.orderReferenceCode;
    delete sanitizedExtra.providerEventId;
  }
  const safeError = isStableErrorCode(error)
    ? error
    : (errorCode && isStableErrorCode(errorCode) ? errorCode : '[REDACTED_ERROR]');
  const payload: Record<string, any> = {
    error: safeError,
    ...(errorCode ? { errorCode } : {}),
    ...(typeof sanitizedExtra === 'object' && sanitizedExtra !== null ? sanitizedExtra : {})
  };
  return new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });
}

// In-flight concurrency lock to prevent duplicate execution within the same runtime container
export interface InFlightExecution {
  fingerprint: string;
  promise: Promise<Response>;
}

export const inFlightWebhookEvents = new Set<string>();
export const inFlightWebhookFingerprints = new Map<string, string>();
export const inFlightWebhookExecutions = new Map<string, InFlightExecution>();

/**
 * Helper to safely finalize idempotency record state
 */
async function finalizeWebhookEvent(
  client: any,
  provider: string,
  providerEventId: string,
  status: 'processed' | 'failed' | 'duplicate_suppressed',
  claimAttemptId?: string | null,
  payload: any = {}
): Promise<boolean> {
  if (!client || !providerEventId) return false;
  try {
    const sanitizedPayload = sanitizeLogValue(payload);
    if (typeof client.rpc === 'function') {
      const { data: finData, error: finErr } = await client.rpc('finalize_payment_webhook_event', {
        p_provider: provider,
        p_provider_event_id: providerEventId,
        p_status: status,
        p_claim_attempt_id: claimAttemptId || null,
        p_response_payload: sanitizedPayload
      });

      if (finErr) {
        safeLogger.error(`[iyzico-webhook] Error finalizing idempotency event via RPC:`, finErr?.code || 'FINALIZE_RPC_ERROR');
        return false;
      }
      return Boolean(finData?.finalized === true);
    }
    return false;
  } catch (err: any) {
    safeLogger.error(`[iyzico-webhook] Exception finalizing idempotency state:`, err?.code || 'FINALIZE_EXCEPTION');
    return false;
  }
}

export interface PaymentWebhookOptions {
  supabaseAdmin?: any;
  inFlightSet?: Set<string>;
  inFlightFingerprints?: Map<string, string>;
  inFlightExecutions?: Map<string, InFlightExecution>;
  getEnv?: (key: string) => string | undefined;
  crossInstanceWaitMs?: number;
  inFlightTimeoutMs?: number;
}

/**
 * Core payment webhook handler function
 * Supports dependency injection for unit testing and direct invocation in both Deno and Node.js
 */
export async function handlePaymentWebhook(
  req: Request | any,
  options: PaymentWebhookOptions = {}
): Promise<Response> {
  const envGetter = options.getEnv || ((k: string) => (typeof Deno !== 'undefined' ? Deno.env.get(k) : (typeof process !== 'undefined' ? process.env?.[k] : undefined)));
  const inFlightExecutions = options.inFlightExecutions || inFlightWebhookExecutions;
  const inFlightEvents = options.inFlightSet || (options.inFlightExecutions ? new Set<string>() : inFlightWebhookEvents);
  const inFlightFingerprints = options.inFlightFingerprints || (options.inFlightExecutions ? new Map<string, string>() : inFlightWebhookFingerprints);

  let completeLeader: ((res: Response) => Response) | null = null;

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let activeProviderEventId: string | null = null;
  let activeClaimAttemptId: string | null = null;
  let lockAcquired = false;
  let supabaseAdmin: any = options.supabaseAdmin || null;

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 405,
      });
    }

    // Read raw payload for signature verification
    const rawBody = typeof req.text === 'function'
      ? await req.text()
      : (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));

    let parsedBody: any;
    try {
      parsedBody = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // Diagnostic endpoint protection: unauthenticated requests must be rejected
    if (parsedBody && parsedBody.diagnostic === true) {
      const authHeader = (typeof req.headers?.get === 'function')
        ? (req.headers.get('authorization') || req.headers.get('Authorization'))
        : (req.headers?.authorization || req.headers?.Authorization);
      const expectedAdminKey = envGetter('SUPABASE_SERVICE_ROLE_KEY');

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

      const requiredEnvs = ['IYZICO_API_KEY', 'IYZICO_SECRET_KEY', 'IYZICO_MERCHANT_ID', 'IYZICO_BASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL'];
      const requiredEnvPresent: Record<string, boolean> = {};
      const missingEnvNames: string[] = [];

      for (const envVar of requiredEnvs) {
        const val = envGetter(envVar);
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
    const verification = await iyzicoClient.verifyIyzicoSignatureV3(
      req.headers, parsedBody, envGetter('IYZICO_SECRET_KEY'), envGetter('IYZICO_MERCHANT_ID')
    );
    if (!verification.isValid) {
      safeLogger.warn(`[SECURITY] Rejected unauthorized webhook call. Reason: ${verification.reason}`);
      if (verification.reason === 'CONFLICTING_EVENT_TYPE') {
        return createSafeErrorResponse(400, 'Bad Request: Conflicting eventType and iyziEventType in HPP webhook', 'CONFLICTING_EVENT_TYPE', {
          reason: 'CONFLICTING_EVENT_TYPE'
        });
      }
      return createSafeErrorResponse(401, 'Unauthorized: Invalid or missing cryptographic signature', 'INVALID_SIGNATURE', {
        reason: verification.reason
      });
    }

    // PUBLIC PROVIDER CONTRACT GATE: before any idempotency claim or SQL RPC.
    // The broad internal lifecycle mapper must NEVER confer public webhook authority.
    // Only the provider's documented subscription order and checkout authorization
    // notifications are accepted. Cancellation and other lifecycle changes belong
    // to separately authenticated subscription API / provider reconciliation flows.
    const format = iyzicoClient.classifyWebhookSignatureFormat(parsedBody);
    const canonicalEventType = format === 'hpp'
      ? String(parsedBody.iyziEventType || '').trim()
      : String(parsedBody.eventType || parsedBody.iyziEventType || '').trim();
    const isPublicProviderEvent = iyzicoClient.isPublicProviderWebhookEvent(format, canonicalEventType);
    if (!isPublicProviderEvent) {
      return new Response(JSON.stringify({
        error: 'Unsupported provider webhook event: use authorized provider state reconciliation',
        errorCode: 'PROVIDER_STATE_RECONCILIATION_REQUIRED',
        retryable: false
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 422
      });
    }
    const mappedStatus = iyzicoClient.mapIyzicoWebhookToInternalStatus(parsedBody);
    if (mappedStatus === 'unknown') {
      return new Response(JSON.stringify({ error: 'Bad Request: Unsupported event type' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
      });
    }

    // Required subscription reference verification BEFORE DB claim
    // For subscription format, ONLY cryptographically signed subscriptionReferenceCode is accepted!

    // Subscription HMAC signs this reference. HPP does NOT: resolve HPP's
    // subscription only from its HMAC-signed checkout token/conversation ID.
    let subscriptionReferenceCode: string | null = format === 'subscription'
      ? parsedBody.subscriptionReferenceCode : null;
    // A subscription HMAC authenticates customerReferenceCode, not nested customer.referenceCode
    // or tenantId. Reject unsigned aliases BEFORE any idempotency claim: otherwise a forged
    // first delivery can poison the event fingerprint and block the legitimate retry.
    if (format === 'subscription' && (
      parsedBody.tenantId !== undefined ||
      (parsedBody.customer && parsedBody.customer.referenceCode !== undefined)
    )) {
      return new Response(JSON.stringify({
        error: 'Bad Request: Unauthenticated customer/tenant reference alias',
        errorCode: 'UNTRUSTED_CUSTOMER_REFERENCE_ALIAS'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // HPP has no signed customerReferenceCode: bind its tenant solely via the
    // trusted subscription fetched from the database below.
    const payloadCustomerRef = format === 'subscription'
      ? (typeof parsedBody.customerReferenceCode === 'string' && parsedBody.customerReferenceCode.trim()
          ? parsedBody.customerReferenceCode.trim() : null)
      : null;

    if (format === 'subscription' && !subscriptionReferenceCode) {
      return new Response(JSON.stringify({
        error: 'Bad Request: Missing canonical subscriptionReferenceCode',
        errorCode: 'MISSING_CANONICAL_SUBSCRIPTION_REFERENCE'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // Conflicting eventType check: HPP HMAC signs iyziEventType. If un-signed eventType is injected and differs, reject with 400!
    if (format === 'hpp' && parsedBody.eventType && parsedBody.iyziEventType && parsedBody.eventType !== parsedBody.iyziEventType) {
      safeLogger.warn('[SECURITY] Rejected HPP webhook with conflicting un-signed eventType vs signed iyziEventType.');
      return createSafeErrorResponse(400, 'Bad Request: Conflicting eventType and iyziEventType in HPP webhook', 'CONFLICTING_EVENT_TYPE');
    }

    // Signature was verified against the RAW provider event value above. Only
    // now map the official HPP name to the internal SQL/RPC vocabulary.
    const eventType = iyzicoClient.toInternalProviderEventType(format, canonicalEventType);

    // For subscription payment events, reject un-signed orderReference alias if signed orderReferenceCode is missing
    if (format === 'subscription' && (eventType === 'subscription.order.success' || eventType === 'payment.success')) {
      if (!parsedBody.orderReferenceCode && parsedBody.orderReference) {
        safeLogger.warn(`[SECURITY] Rejected subscription payment webhook with untrusted orderReference alias.`);
        return createSafeErrorResponse(400, 'Bad Request: Missing signed orderReferenceCode; un-signed alias rejected', 'UNTRUSTED_ORDER_REFERENCE_ALIAS');
      }
    }

    // Deterministic provider event identification
    let providerEventId: string;
    try {
      providerEventId = iyzicoClient.extractProviderEventId(parsedBody);
    } catch (err: any) {
      safeLogger.warn(`[iyzico-webhook] Failed to extract provider event identifier:`, err?.code || 'MISSING_PROVIDER_EVENT_IDENTIFIER');
      return createSafeErrorResponse(400, 'Bad Request: Missing unique provider event identification or timestamp', 'MISSING_PROVIDER_EVENT_IDENTIFIER');
    }
    activeProviderEventId = providerEventId;

    // Fingerprint must not depend on unsigned JSON fields. It is used for
    // in-flight coordination and persisted idempotency collision detection.
    const signedFingerprintMaterial = iyzicoClient.signedWebhookFingerprintMaterial(
      parsedBody, format === 'subscription' ? envGetter('IYZICO_MERCHANT_ID') : undefined
    );
    const payloadFingerprint = await iyzicoClient.hmacSha256Hex(signedFingerprintMaterial, 'payload-fingerprint-salt');

    // In-flight concurrency check:
    const hasInFlight = inFlightExecutions.has(providerEventId) || inFlightEvents.has(providerEventId) || inFlightFingerprints.has(providerEventId);
    if (hasInFlight) {
      const activeExec = inFlightExecutions.get(providerEventId);
      const activeFingerprint = activeExec?.fingerprint || inFlightFingerprints.get(providerEventId);
      if (activeFingerprint && activeFingerprint !== payloadFingerprint) {
        safeLogger.warn('[SECURITY] In-flight payload fingerprint mismatch for event');
        return createSafeErrorResponse(409, 'Conflict: In-flight payload fingerprint mismatch for event', 'PAYLOAD_FINGERPRINT_MISMATCH', {
          conflict: true
        });
      }

      // Check if leader promise is registered
      if (activeExec && activeExec.promise) {
        safeLogger.log('[iyzico-webhook] Concurrent in-flight request detected. Awaiting leader completion with timeout...');
        const inFlightTimeoutMs = options.inFlightTimeoutMs ?? Number(envGetter('IN_FLIGHT_TIMEOUT_MS') || 2500);
        let leaderRes: Response | null = null;
        let leaderTimedOut = false;

        try {
          let timerId: any;
          const timeoutPromise = new Promise<'timeout'>((resolve) => {
            timerId = setTimeout(() => resolve('timeout'), inFlightTimeoutMs);
          });

          const raceResult = await Promise.race([
            activeExec.promise.then((res) => ({ type: 'response' as const, res })),
            timeoutPromise.then(() => ({ type: 'timeout' as const }))
          ]);
          clearTimeout(timerId);

          if (raceResult.type === 'response') {
            leaderRes = raceResult.res;
          } else {
            leaderTimedOut = true;
            safeLogger.warn(`[iyzico-webhook] In-flight leader timed out after ${inFlightTimeoutMs}ms. Falling back to DB observation...`);
          }
        } catch (err: any) {
          safeLogger.error('[iyzico-webhook] In-flight leader execution threw an error:', err?.code || 'LEADER_EXECUTION_ERROR');
          leaderTimedOut = true;
        }

        if (leaderRes && !leaderTimedOut) {
          if (leaderRes.status === 200) {
            safeLogger.log('[iyzico-webhook] Leader completed with 200. Returning idempotent duplicate 200.');
            let leaderData: any = {};
            try {
              leaderData = await leaderRes.clone().json();
            } catch {}

            return new Response(JSON.stringify({
              ...leaderData,
              received: true,
              status: leaderData.status || mappedStatus,
              duplicate: true,
              idempotent: true,
              paymentRecorded: false,
              inFlight: true
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 200,
            });
          }

          safeLogger.warn(`[iyzico-webhook] In-flight leader returned failure (status ${leaderRes.status}). Propagating failure to follower.`);
          let leaderBodyText = '';
          try {
            leaderBodyText = await leaderRes.clone().text();
          } catch {}

          return new Response(leaderBodyText || JSON.stringify({
            error: 'Service Unavailable: Concurrent webhook transaction failed in leader',
            retryable: true
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: leaderRes.status >= 500 ? leaderRes.status : 503,
          });
        }

        // Leader timed out or threw error -> Fall back to persistent DB observation contract!
        safeLogger.log('[iyzico-webhook] Observing persistent DB state for timed out / stuck leader...');
        const maxWaitMs = options.crossInstanceWaitMs ?? Number(envGetter('WEBHOOK_OBSERVATION_TIMEOUT_MS') || 2500);
        const pollIntervalMs = 50;
        const startTime = Date.now();
        let dbRecord: any = null;

        if (supabaseAdmin) {
          while (Date.now() - startTime < maxWaitMs) {
            try {
              const { data: record, error: pollErr } = await supabaseAdmin
                .from('payment_webhook_idempotency')
                .select('status, response_payload')
                .eq('provider', 'iyzico')
                .eq('provider_event_id', providerEventId)
                .maybeSingle();

              if (!pollErr && record) {
                if (record.status === 'processed' || record.status === 'duplicate_suppressed' || record.status === 'failed') {
                  dbRecord = record;
                  break;
                }
              }
            } catch (err: any) {
              safeLogger.warn(`[iyzico-webhook] Error observing DB status during leader timeout recovery:`, err?.code || 'OBSERVATION_ERROR');
            }
            await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
          }
        }

        if (dbRecord && (dbRecord.status === 'processed' || dbRecord.status === 'duplicate_suppressed')) {
          safeLogger.log(`[iyzico-webhook] DB observation confirmed terminal '${dbRecord.status}'. Returning idempotent 200.`);
          const savedPayload = (typeof dbRecord.response_payload === 'object' && dbRecord.response_payload !== null)
            ? dbRecord.response_payload
            : {};
          const isSuppressed = dbRecord.status === 'duplicate_suppressed';
          const fallbackStatus = isSuppressed ? 'suppressed' : mappedStatus;
          const effectiveStatus = savedPayload.status || savedPayload.subscriptionStatus || fallbackStatus;

          return new Response(JSON.stringify({
            ...savedPayload,
            received: true,
            status: effectiveStatus,
            duplicate: true,
            idempotent: true,
            paymentRecorded: false,
            leaderRecoveredViaDb: true,
            ...(savedPayload.rejected ? { rejected: true, rejectionReason: savedPayload.rejectionReason || 'SECURITY_REJECTION' } : {})
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        }

        safeLogger.warn(`[iyzico-webhook] Leader timed out and DB did not reach terminal processed state (status: ${dbRecord?.status || 'unknown'}). Returning retryable 503.`);
        return createSafeErrorResponse(503, 'Service Unavailable: Concurrent leader timed out and event has not committed in DB', 'LEADER_TIMEOUT', {
          status: dbRecord?.status || 'processing',
          retryable: true
        });
      }

      safeLogger.warn('[iyzico-webhook] In-flight detected without promise. Returning retryable 503.');
      return createSafeErrorResponse(503, 'Service Unavailable: Webhook event is currently in processing state by another worker', 'CONCURRENT_PROCESSING', {
        status: 'processing',
        retryable: true
      });
    }

    let resolveLeaderExecution!: (res: Response) => void;
    let leaderFinished = false;
    const leaderPromise = new Promise<Response>((resolve) => {
      resolveLeaderExecution = resolve;
    });

    completeLeader = (res: Response): Response => {
      if (!leaderFinished && resolveLeaderExecution) {
        leaderFinished = true;
        resolveLeaderExecution(res);
      }
      return res;
    };

    inFlightExecutions.set(providerEventId, {
      fingerprint: payloadFingerprint,
      promise: leaderPromise
    });
    inFlightEvents.add(providerEventId);
    inFlightFingerprints.set(providerEventId, payloadFingerprint);
    lockAcquired = true;

    const executeLeader = async (): Promise<Response> => {

    // Check Supabase admin configuration
    if (!supabaseAdmin) {
      const supabaseUrl = envGetter('SUPABASE_URL');
      const supabaseKey = envGetter('SUPABASE_SERVICE_ROLE_KEY');

      if (!supabaseUrl || !supabaseKey) {
        safeLogger.error('[iyzico-webhook] Fail-closed: Supabase database URL or service role key is not configured.');
        return createSafeErrorResponse(503, 'Service Unavailable: Backend database service role is not configured', 'MISSING_DB_CONFIG', {
          retryable: true
        });
      }

      const createClient = await getCreateClient();
      supabaseAdmin = createClient(supabaseUrl, supabaseKey);
    }

    // Fail-closed guard: database client MUST support transactional RPC execution
    if (!supabaseAdmin || typeof supabaseAdmin.rpc !== 'function') {
      safeLogger.error('[iyzico-webhook] Fail-closed: Transactional RPC interface is unavailable on database client.');
      return createSafeErrorResponse(503, 'Service Unavailable: Transactional database interface unavailable', 'RPC_UNAVAILABLE', {
        retryable: true
      });
    }

    // HPP binding MUST be resolved from signed fields before the DB claim.
    // Unsigned subscriptionReferenceCode / referenceCode cannot pick a tenant,
    // poison claim metadata, or redirect a valid signed event to another row.
    if (format === 'hpp') {
      const signedToken = typeof parsedBody.token === 'string' ? parsedBody.token.trim() : '';
      const signedConversationId = typeof parsedBody.paymentConversationId === 'string'
        ? parsedBody.paymentConversationId.trim() : '';
      if (!signedToken && !signedConversationId) {
        return createSafeErrorResponse(400, 'Bad Request: Missing signed checkout binding', 'MISSING_SIGNED_CHECKOUT_BINDING');
      }

      // maybeSingle rejects multiple matches in real PostgREST. The test
      // adapter must enforce the same behavior (never silently LIMIT 1).
      const resolveSignedBinding = async (column: 'provider_token' | 'provider_session_id', value: string) =>
        await supabaseAdmin.from('subscriptions')
          .select('id, provider_subscription_id, tenant_id')
          .eq(column, value).maybeSingle();
      const tokenResult = signedToken ? await resolveSignedBinding('provider_token', signedToken) : null;
      const conversationResult = signedConversationId
        ? await resolveSignedBinding('provider_session_id', signedConversationId) : null;
      if (tokenResult?.error || conversationResult?.error) {
        safeLogger.error('[SECURITY] HPP checkout identity lookup is ambiguous or unavailable.');
        return createSafeErrorResponse(503, 'Service Unavailable: Checkout binding lookup failed', 'CHECKOUT_BINDING_LOOKUP_FAILED', { retryable: true });
      }
      const tokenRow = tokenResult?.data || null;
      const conversationRow = conversationResult?.data || null;
      if ((signedToken && !tokenRow) || (signedConversationId && !conversationRow) ||
          (tokenRow && conversationRow && tokenRow.id !== conversationRow.id)) {
        return createSafeErrorResponse(403, 'Forbidden: Unbound checkout session', 'UNBOUND_CHECKOUT_SESSION', { paymentRecorded: false });
      }
      const resolved = tokenRow || conversationRow;
      if (!resolved?.provider_subscription_id) {
        return createSafeErrorResponse(503, 'Service Unavailable: Missing verified subscription reference', 'MISSING_VERIFIED_SUBSCRIPTION_REFERENCE');
      }
      subscriptionReferenceCode = resolved.provider_subscription_id;
    }

    // Extract event timestamp
    const eventTimestampEpoch = iyzicoClient.extractProviderEventTimestamp(parsedBody);
    const eventTimestampISO = eventTimestampEpoch ? new Date(eventTimestampEpoch).toISOString() : null;

    // Determine payment proof and fail-closed effective status
    const hasPaymentProof = iyzicoClient.hasPaymentProof(parsedBody);
    const isPaymentEvent = eventType === 'payment.success' || eventType === 'checkoutform.auth' || eventType === 'subscription.order.success';
    const effectiveStatus = (isPaymentEvent && !hasPaymentProof) ? 'pending' : mappedStatus;
    const paymentAmount = Number(parsedBody.price || parsedBody.paidPrice || parsedBody.amount || 0);

    // 1. Atomic Reservation with Lease Timeout & claim_attempt_id fencing via RPC
    const { data: claimRes, error: claimErr } = await supabaseAdmin.rpc('claim_payment_webhook_event', {
      p_provider: 'iyzico',
      p_provider_event_id: providerEventId,
      p_event_type: eventType,
      p_subscription_reference_code: subscriptionReferenceCode,
      p_tenant_id: payloadCustomerRef,
      p_payload_fingerprint: payloadFingerprint,
      p_timeout_seconds: 60,
      p_event_timestamp: eventTimestampISO
    });

    if (claimErr) {
      safeLogger.error(`[iyzico-webhook] Database claim RPC error:`, claimErr?.code || 'CLAIM_RPC_ERROR');
      return createSafeErrorResponse(500, 'Service Unavailable: Database idempotency reservation failure', 'IDEMPOTENCY_RESERVATION_FAILURE', {
        retryable: true
      });
    }

    if (claimRes) {
      if (claimRes.status === 'conflict') {
        safeLogger.warn('[SECURITY] Payload fingerprint mismatch detected for event ID.');
        return createSafeErrorResponse(409, 'Conflict: Event ID collision with mismatched payload', 'PAYLOAD_FINGERPRINT_MISMATCH');
      }

      if (claimRes.is_duplicate || claimRes.can_proceed === false) {
        if (claimRes.status === 'processing') {
          safeLogger.log('[iyzico-webhook] Cross-instance processing lock detected. Observing DB for leader completion...');
          const maxWaitMs = options.crossInstanceWaitMs ?? Number(envGetter('WEBHOOK_OBSERVATION_TIMEOUT_MS') || 8000);
          const pollIntervalMs = 100;
          const startTime = Date.now();
          let terminalRecord: any = null;

          while (Date.now() - startTime < maxWaitMs) {
            await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
            try {
              const { data: record, error: pollErr } = await supabaseAdmin
                .from('payment_webhook_idempotency')
                .select('status, response_payload')
                .eq('provider', 'iyzico')
                .eq('provider_event_id', providerEventId)
                .maybeSingle();

              if (!pollErr && record) {
                if (record.status === 'processed' || record.status === 'duplicate_suppressed' || record.status === 'failed') {
                  terminalRecord = record;
                  break;
                }
              }
            } catch (err: any) {
              safeLogger.warn(`[iyzico-webhook] Error during durable status observation:`, err?.code || 'OBSERVATION_ERROR');
            }
          }

          if (terminalRecord && (terminalRecord.status === 'processed' || terminalRecord.status === 'duplicate_suppressed')) {
            safeLogger.log(`[iyzico-webhook] Leader completed with status '${terminalRecord.status}' in DB. Returning idempotent 200.`);
            const savedPayload = (typeof terminalRecord.response_payload === 'object' && terminalRecord.response_payload !== null)
              ? terminalRecord.response_payload
              : {};
            const isSuppressed = terminalRecord.status === 'duplicate_suppressed';
            const fallbackStatus = isSuppressed ? 'suppressed' : mappedStatus;
            const effectiveStatus = savedPayload.status || savedPayload.subscriptionStatus || fallbackStatus;

            return new Response(JSON.stringify({
              ...savedPayload,
              received: true,
              status: effectiveStatus,
              duplicate: true,
              idempotent: true,
              paymentRecorded: false,
              crossInstanceDuplicate: true,
              ...(savedPayload.rejected ? { rejected: true, rejectionReason: savedPayload.rejectionReason || 'SECURITY_REJECTION' } : {})
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 200,
            });
          }

          safeLogger.warn(`[iyzico-webhook] In-flight leader did not commit successfully in DB (status: ${terminalRecord?.status || 'processing'}). Returning retryable 503.`);
          return createSafeErrorResponse(503, 'Service Unavailable: Webhook event is currently in processing state by another worker', 'CONCURRENT_PROCESSING', {
            status: terminalRecord?.status || 'processing',
            retryable: true
          });
        }

        // Only processed or terminal records (processed, duplicate_suppressed) return HTTP 200
        safeLogger.log('[iyzico-webhook] Idempotency record confirmed. Returning idempotent 200.');
        const savedPayload = (typeof claimRes.response_payload === 'object' && claimRes.response_payload !== null)
          ? claimRes.response_payload
          : {};
        const isSuppressed = claimRes.status === 'duplicate_suppressed';
        const fallbackStatus = isSuppressed ? 'suppressed' : mappedStatus;
        const effectiveStatus = savedPayload.status || savedPayload.subscriptionStatus || fallbackStatus;

        return new Response(JSON.stringify({
          ...savedPayload,
          received: true,
          status: effectiveStatus,
          duplicate: true,
          idempotent: true,
          paymentRecorded: false,
          ...(savedPayload.rejected ? { rejected: true, rejectionReason: savedPayload.rejectionReason || 'SECURITY_REJECTION' } : {})
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      activeClaimAttemptId = claimRes.claim_attempt_id || null;
    }

    // 2. Query subscription before transaction for tenant verification & fast validation
    const { data: subscription, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('id, tenant_id, status, last_webhook_event_at, price, currency, provider_token, provider_session_id')
      .eq('provider_subscription_id', subscriptionReferenceCode)
      .maybeSingle();

    if (subError) {
      safeLogger.error(`[iyzico-webhook] Error querying subscription:`, subError?.code || 'SUBSCRIPTION_QUERY_ERROR');
      const finalized = await finalizeWebhookEvent(supabaseAdmin, 'iyzico', providerEventId, 'failed', activeClaimAttemptId, {
        error: 'SUBSCRIPTION_LOOKUP_FAILURE'
      });
      return createSafeErrorResponse(500, 'Service Unavailable: Subscription lookup failure', 'SUBSCRIPTION_LOOKUP_FAILURE', {
        finalized,
        retryable: true
      });
    }

    if (!subscription) {
      safeLogger.warn('[iyzico-webhook] Subscription not yet provisioned. Marking failed and returning retryable 503.');
      const finalized = await finalizeWebhookEvent(supabaseAdmin, 'iyzico', providerEventId, 'failed', activeClaimAttemptId, {
        error: 'SUBSCRIPTION_NOT_YET_PROVISIONED'
      });
      return createSafeErrorResponse(503, 'Service Unavailable: Subscription record not yet provisioned; retryable for eventual consistency', 'SUBSCRIPTION_NOT_YET_PROVISIONED', {
        finalized,
        retryable: true
      });
    }

    // Invariant provider payment transaction ID (distinct from delivery eventId)
    const providerPaymentId = iyzicoClient.extractProviderPaymentId(parsedBody);

    // Cryptographic Contract Binding:
    // HPP format checkout binding verification:
    if (format === 'hpp') {
      const signedCheckoutToken = parsedBody.token ? String(parsedBody.token).trim() : null;
      const signedConversationId = parsedBody.paymentConversationId ? String(parsedBody.paymentConversationId).trim() : null;

      const isBound = Boolean(
        subscription && (signedCheckoutToken || signedConversationId) &&
        (!signedCheckoutToken || subscription.provider_token === signedCheckoutToken) &&
        (!signedConversationId || subscription.provider_session_id === signedConversationId)
      );

      if (!isBound) {
        safeLogger.warn('[SECURITY] Unbound HPP checkout webhook rejected for subscription.');
        const finalized = await finalizeWebhookEvent(supabaseAdmin, 'iyzico', providerEventId, 'failed', activeClaimAttemptId, {
          error: 'UNBOUND_CHECKOUT_SESSION'
        });
        return createSafeErrorResponse(403, 'Forbidden: Unbound checkout session; signed token/conversationId has no verified server-side binding', 'UNBOUND_CHECKOUT_SESSION', {
          finalized,
          paymentRecorded: false
        });
      }
    }

    // Unsigned Financial Field Protection (Controller Directive 1):
    const authorizedAmount = (subscription && subscription.price != null && Number(subscription.price) > 0)
      ? Number(subscription.price) : 0;
    const verifiedDbCurrency = (subscription && typeof subscription.currency === 'string' && subscription.currency.trim())
      ? subscription.currency.trim().toUpperCase() : null;

    // 3. Execute Atomic Webhook Transaction inside PostgreSQL via RPC
    const { data: txRes, error: txErr } = await supabaseAdmin.rpc('execute_payment_webhook_transaction', {
      p_provider: 'iyzico',
      p_provider_event_id: providerEventId,
      p_event_type: eventType,
      p_subscription_reference_code: subscriptionReferenceCode,
      p_tenant_id: format === 'hpp' ? subscription.tenant_id : (payloadCustomerRef || subscription.tenant_id),
      p_target_status: mappedStatus,
      p_has_payment_proof: hasPaymentProof,
      p_amount: authorizedAmount,
      p_currency: verifiedDbCurrency,
      p_event_timestamp: eventTimestampISO,
      p_payment_metadata: {
        raw_event_type: eventType,
        mapped_status: mappedStatus,
        ...(format === 'hpp' && parsedBody?.token
          ? { verifiedCheckoutToken: String(parsedBody.token).trim() } : {}),
        ...(format === 'hpp' && parsedBody?.paymentConversationId
          ? { verifiedCheckoutConversationId: String(parsedBody.paymentConversationId).trim() } : {}),
        providerPaymentId: providerPaymentId,
        ...(format === 'hpp' && parsedBody?.iyziPaymentId != null
          ? { iyziPaymentId: parsedBody.iyziPaymentId } : {}),
        orderReferenceCode: format === 'subscription' ? parsedBody?.orderReferenceCode : (parsedBody?.orderReferenceCode ?? parsedBody?.orderReference),
        raw_event_timestamp: parsedBody?.eventTime || parsedBody?.iyziEventTime || null
      },
      p_audit_details: {
        source: 'payment-webhook-edge-function'
      },
      p_claim_attempt_id: activeClaimAttemptId,
      p_provider_payment_id: providerPaymentId
    });

    if (txErr) {
      safeLogger.error(`[iyzico-webhook] Transaction RPC error:`, txErr?.code || 'DATABASE_TRANSACTION_FAILURE');
      const finalized = await finalizeWebhookEvent(supabaseAdmin, 'iyzico', providerEventId, 'failed', activeClaimAttemptId, {
        error: 'DATABASE_TRANSACTION_FAILURE'
      });
      return createSafeErrorResponse(500, 'Service Unavailable: Database transaction failure', 'DATABASE_TRANSACTION_FAILURE', {
        finalized,
        retryable: true
      });
    }

    // Positive success contract: Only proceed to HTTP 200 when txRes exists and txRes.success === true
    if (!txRes || txRes.success !== true) {
      const txError = typeof txRes?.error === 'string' ? txRes.error : 'DATABASE_TRANSACTION_FAILED';
      if (txError === 'UNBOUND_CHECKOUT_SESSION') {
        const finalized = await finalizeWebhookEvent(supabaseAdmin, 'iyzico', providerEventId, 'failed', activeClaimAttemptId, {
          error: 'UNBOUND_CHECKOUT_SESSION'
        });
        return createSafeErrorResponse(finalized ? 403 : 503, 'Forbidden: Checkout binding failed under subscription row lock', 'UNBOUND_CHECKOUT_SESSION', {
          finalized,
          paymentRecorded: false
        });
      }

      if (txError === 'TENANT_MISMATCH') {
        safeLogger.warn('[SECURITY] Atomic tenant mismatch under row lock.');
        const realSubStatus = txRes?.current_subscription_status || subscription.status;
        const finalized = await finalizeWebhookEvent(supabaseAdmin, 'iyzico', providerEventId, 'duplicate_suppressed', activeClaimAttemptId, {
          error: 'TENANT_MISMATCH',
          status: realSubStatus,
          subscriptionStatus: realSubStatus,
          rejected: true,
          rejectionReason: 'TENANT_MISMATCH'
        });
        if (!finalized) {
          safeLogger.error('[iyzico-webhook] Failed to finalize tenant mismatch security rejection.');
          return createSafeErrorResponse(503, 'Service Unavailable: Failed to finalize tenant mismatch security rejection', 'TENANT_MISMATCH_FINALIZATION_FAILED', {
            finalized: false,
            retryable: true
          });
        }
        return createSafeErrorResponse(403, 'Forbidden: Tenant mismatch between payload and subscription', 'TENANT_MISMATCH', {
          finalized: true
        });
      }

      if (txError === 'RESERVATION_NOT_FOUND') {
        safeLogger.error('[iyzico-webhook] Atomic reservation not found for event.');
        return createSafeErrorResponse(503, 'Service Unavailable: Database idempotency reservation not found', 'RESERVATION_NOT_FOUND', {
          retryable: true
        });
      }

      if (txError === 'SUBSCRIPTION_NOT_FOUND') {
        safeLogger.warn('[iyzico-webhook] Subscription not yet provisioned in transaction. Marking failed and returning retryable 503.');
        const finalized = await finalizeWebhookEvent(supabaseAdmin, 'iyzico', providerEventId, 'failed', activeClaimAttemptId, {
          error: 'SUBSCRIPTION_NOT_YET_PROVISIONED'
        });
        return createSafeErrorResponse(503, 'Service Unavailable: Subscription record not yet provisioned; retryable for eventual consistency', 'SUBSCRIPTION_NOT_YET_PROVISIONED', {
          finalized,
          retryable: true
        });
      }

      if (txError === 'NOT_IN_PROCESSING_STATE') {
        safeLogger.warn('[iyzico-webhook] Webhook event not in processing state.');
        return createSafeErrorResponse(409, 'Conflict: Webhook event is not in processing state and cannot be executed', 'NOT_IN_PROCESSING_STATE', {
          retryable: false
        });
      }

      if (txError === 'LEASE_LOST_TO_ANOTHER_WORKER') {
        safeLogger.warn('[iyzico-webhook] Lease lost to concurrent worker. Observing DB for new worker completion...');
        const maxWaitMs = options.crossInstanceWaitMs ?? Number(envGetter('WEBHOOK_OBSERVATION_TIMEOUT_MS') || 8000);
        const pollIntervalMs = 100;
        const startTime = Date.now();
        let terminalRecord: any = null;

        while (Date.now() - startTime < maxWaitMs) {
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
          try {
            const { data: record, error: pollErr } = await supabaseAdmin
              .from('payment_webhook_idempotency')
              .select('status, response_payload')
              .eq('provider', 'iyzico')
              .eq('provider_event_id', providerEventId)
              .maybeSingle();

            if (!pollErr && record) {
              if (record.status === 'processed' || record.status === 'duplicate_suppressed' || record.status === 'failed') {
                terminalRecord = record;
                break;
              }
            }
          } catch (err: any) {
            safeLogger.warn(`[iyzico-webhook] Error observing new worker status:`, err?.code || 'OBSERVATION_ERROR');
          }
        }

        if (terminalRecord && (terminalRecord.status === 'processed' || terminalRecord.status === 'duplicate_suppressed')) {
          safeLogger.log(`[iyzico-webhook] New lease owner completed with status '${terminalRecord.status}' in DB. Returning idempotent 200.`);
          const savedPayload = (typeof terminalRecord.response_payload === 'object' && terminalRecord.response_payload !== null)
            ? terminalRecord.response_payload
            : {};
          const isSuppressed = terminalRecord.status === 'duplicate_suppressed';
          const fallbackStatus = isSuppressed ? 'suppressed' : mappedStatus;
          const effectiveStatus = savedPayload.status || savedPayload.subscriptionStatus || fallbackStatus;

          return new Response(JSON.stringify({
            ...savedPayload,
            received: true,
            status: effectiveStatus,
            duplicate: true,
            idempotent: true,
            paymentRecorded: false,
            leaseReclaimedByAnotherWorker: true,
            ...(savedPayload.rejected ? { rejected: true, rejectionReason: savedPayload.rejectionReason || 'SECURITY_REJECTION' } : {})
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        }

        safeLogger.warn(`[iyzico-webhook] New lease owner did not commit successfully in DB (status: ${terminalRecord?.status || 'processing'}). Returning retryable 503.`);
        return createSafeErrorResponse(503, 'Service Unavailable: Lease was taken over by another worker which has not yet committed', 'LEASE_RECLAIM_TIMEOUT', {
          status: terminalRecord?.status || 'processing',
          retryable: true
        });
      }

      const errorCode = (
        txError === 'AUDIT_LOG_INSERT_FAILED' ? 'AUDIT_LOG_INSERT_FAILED' :
        txError === 'SUBSCRIPTION_UPDATE_FAILED' ? 'SUBSCRIPTION_UPDATE_FAILED' :
        txError === 'PAYMENT_INSERT_FAILED' ? 'PAYMENT_INSERT_FAILED' :
        txError === 'MISSING_SUBSCRIPTION_PRICE' ? 'MISSING_SUBSCRIPTION_PRICE' :
        txError === 'MISSING_SUBSCRIPTION_CURRENCY' ? 'MISSING_SUBSCRIPTION_CURRENCY' :
        'DATABASE_TRANSACTION_FAILED'
      );

      const finalized = await finalizeWebhookEvent(supabaseAdmin, 'iyzico', providerEventId, 'failed', activeClaimAttemptId, {
        error: errorCode
      });

      return createSafeErrorResponse(500, `Database transaction failed: ${errorCode}`, errorCode, {
        finalized,
        retryable: txRes?.retryable ?? true
      });
    }

    // Success response
    const isDuplicate = txRes?.is_duplicate === true || txRes?.duplicate === true || txRes?.is_duplicate_payment === true;
    const paymentRecorded = txRes?.payment_recorded === true && !isDuplicate;
    const finalSubscriptionStatus = txRes?.status || txRes?.subscription_status || mappedStatus;
    const outOfOrderSuppressed = txRes?.out_of_order_suppressed === true;

    return new Response(JSON.stringify({
      received: true,
      verified: true,
      status: finalSubscriptionStatus,
      subscriptionStatus: finalSubscriptionStatus,
      duplicate: isDuplicate,
      idempotent: true,
      paymentRecorded,
      outOfOrderSuppressed,
      paymentId: txRes?.payment_id || null,
      subscriptionId: txRes?.subscription_id || subscriptionReferenceCode
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  };

  const leaderResponse = await executeLeader();
  return completeLeader(leaderResponse);

} catch (error: any) {
    safeLogger.error(`[iyzico-webhook] Unhandled webhook processing exception:`, error?.code || 'UNHANDLED_EXCEPTION');
    let finalized = false;
    if (activeProviderEventId && supabaseAdmin) {
      finalized = await finalizeWebhookEvent(supabaseAdmin, 'iyzico', activeProviderEventId, 'failed', activeClaimAttemptId, {
        error: 'UNHANDLED_EXCEPTION'
      });
    }
    const errRes = createSafeErrorResponse(500, 'Internal Server Error', 'UNHANDLED_EXCEPTION', {
      finalized,
      retryable: true
    });
    if (completeLeader) {
      completeLeader(errRes);
    }
    return errRes;
  } finally {
    if (lockAcquired && activeProviderEventId) {
      if (completeLeader) {
        completeLeader(new Response(JSON.stringify({
          error: 'Service Unavailable: Webhook execution terminated unexpectedly',
          retryable: true
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        }));
      }

      inFlightWebhookEvents.delete(activeProviderEventId);
      inFlightWebhookFingerprints.delete(activeProviderEventId);
      inFlightWebhookExecutions.delete(activeProviderEventId);
      if (inFlightEvents !== inFlightWebhookEvents) {
        inFlightEvents.delete(activeProviderEventId);
      }
      if (inFlightFingerprints !== inFlightWebhookFingerprints) {
        inFlightFingerprints.delete(activeProviderEventId);
      }
      if (inFlightExecutions !== inFlightWebhookExecutions) {
        inFlightExecutions.delete(activeProviderEventId);
      }
    }
  }
}

// Default export for Deno serve runtime
if (typeof Deno !== 'undefined' && typeof (Deno as any).serve === 'function') {
  (Deno as any).serve(handlePaymentWebhook);
}
