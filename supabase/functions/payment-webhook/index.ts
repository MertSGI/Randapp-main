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
    const { data: finData, error: finErr } = await client.rpc('finalize_payment_webhook_event', {
      p_provider: provider,
      p_provider_event_id: providerEventId,
      p_status: status,
      p_claim_attempt_id: claimAttemptId || null,
      p_response_payload: payload
    });

    if (finErr) {
      console.error(`[iyzico-webhook] Error finalizing idempotency event via RPC:`, finErr);
      return false;
    }
    return Boolean(finData?.finalized === true);
  } catch (err: any) {
    console.error(`[iyzico-webhook] Exception finalizing idempotency state:`, err?.message);
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
      console.warn(`[SECURITY] Rejected unauthorized webhook call. Reason: ${verification.reason}`);
      if (verification.reason === 'CONFLICTING_EVENT_TYPE') {
        return new Response(JSON.stringify({
          error: 'Bad Request: Conflicting eventType and iyziEventType in HPP webhook',
          errorCode: 'CONFLICTING_EVENT_TYPE',
          reason: 'CONFLICTING_EVENT_TYPE'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }
      return new Response(JSON.stringify({
        error: 'Unauthorized: Invalid or missing cryptographic signature',
        reason: verification.reason
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
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
      console.warn(`[SECURITY] Rejected HPP webhook with conflicting un-signed eventType "${parsedBody.eventType}" vs signed iyziEventType "${parsedBody.iyziEventType}"`);
      return new Response(JSON.stringify({
        error: 'Bad Request: Conflicting eventType and iyziEventType in HPP webhook',
        errorCode: 'CONFLICTING_EVENT_TYPE'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // Signature was verified against the RAW provider event value above. Only
    // now map the official HPP name to the internal SQL/RPC vocabulary.
    const eventType = iyzicoClient.toInternalProviderEventType(format, canonicalEventType);

    // For subscription payment events, reject un-signed orderReference alias if signed orderReferenceCode is missing
    if (format === 'subscription' && (eventType === 'subscription.order.success' || eventType === 'payment.success')) {
      if (!parsedBody.orderReferenceCode && parsedBody.orderReference) {
        console.warn(`[SECURITY] Rejected subscription payment webhook with untrusted orderReference alias.`);
        return new Response(JSON.stringify({
          error: 'Bad Request: Missing signed orderReferenceCode; un-signed alias rejected',
          errorCode: 'UNTRUSTED_ORDER_REFERENCE_ALIAS'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }
    }

    // Deterministic provider event identification
    let providerEventId: string;
    try {
      providerEventId = iyzicoClient.extractProviderEventId(parsedBody);
    } catch (err: any) {
      console.warn(`[iyzico-webhook] Failed to extract provider event identifier:`, err?.message);
      return new Response(JSON.stringify({
        error: 'Bad Request: Missing unique provider event identification or timestamp',
        errorCode: 'MISSING_PROVIDER_EVENT_IDENTIFIER'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }
    activeProviderEventId = providerEventId;

    // Fingerprint must not depend on unsigned JSON fields. It is used for
    // in-flight coordination and persisted idempotency collision detection.
    const signedFingerprintMaterial = iyzicoClient.signedWebhookFingerprintMaterial(
      parsedBody, format === 'subscription' ? envGetter('IYZICO_MERCHANT_ID') : undefined
    );
    const payloadFingerprint = await iyzicoClient.hmacSha256Hex(signedFingerprintMaterial, 'payload-fingerprint-salt');

    // In-flight concurrency check:
    // If a request with identical providerEventId is currently in-flight:
    // - Check payload fingerprint collision: if active fingerprint differs from incoming fingerprint,
    //   it is a conflicting concurrent payload -> MUST fail closed with HTTP 409 conflict!
    // - If fingerprints match: legitimate in-flight concurrent request -> await leader's execution!
    //   Only if the leader successfully commits (HTTP 200) does the follower return HTTP 200 duplicate.
    //   If the leader fails (HTTP 5xx / error), the follower propagates the failure so the payment provider retries.
    const hasInFlight = inFlightExecutions.has(providerEventId) || inFlightEvents.has(providerEventId) || inFlightFingerprints.has(providerEventId);
    if (hasInFlight) {
      const activeExec = inFlightExecutions.get(providerEventId);
      const activeFingerprint = activeExec?.fingerprint || inFlightFingerprints.get(providerEventId);
      if (activeFingerprint && activeFingerprint !== payloadFingerprint) {
        console.warn(`[SECURITY] In-flight payload fingerprint mismatch for event: ${providerEventId}`);
        return new Response(JSON.stringify({
          error: 'Conflict: In-flight payload fingerprint mismatch for event',
          errorCode: 'PAYLOAD_FINGERPRINT_MISMATCH',
          conflict: true
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 409,
        });
      }

      // Check if leader promise is registered
      if (activeExec && activeExec.promise) {
        console.log(`[iyzico-webhook] Concurrent in-flight request detected for: ${providerEventId}. Awaiting leader completion with timeout...`);
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
            console.warn(`[iyzico-webhook] In-flight leader timed out after ${inFlightTimeoutMs}ms for: ${providerEventId}. Falling back to DB observation...`);
          }
        } catch (err: any) {
          console.error(`[iyzico-webhook] In-flight leader execution threw an error for ${providerEventId}:`, err?.message);
          leaderTimedOut = true;
        }

        if (leaderRes && !leaderTimedOut) {
          if (leaderRes.status === 200) {
            console.log(`[iyzico-webhook] Leader completed with 200 for: ${providerEventId}. Returning idempotent duplicate 200.`);
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

          console.warn(`[iyzico-webhook] In-flight leader returned failure (status ${leaderRes.status}) for ${providerEventId}. Propagating failure to follower.`);
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
        // Never return 200 unless leader/new worker's terminal success is strictly verified in DB!
        console.log(`[iyzico-webhook] Observing persistent DB state for timed out / stuck leader on: ${providerEventId}...`);
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
              console.warn(`[iyzico-webhook] Error observing DB status during leader timeout recovery:`, err?.message);
            }
            await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
          }
        }

        if (dbRecord && (dbRecord.status === 'processed' || dbRecord.status === 'duplicate_suppressed')) {
          console.log(`[iyzico-webhook] DB observation confirmed terminal '${dbRecord.status}' for: ${providerEventId}. Returning idempotent 200.`);
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

        console.warn(`[iyzico-webhook] Leader timed out and DB did not reach terminal processed state (status: ${dbRecord?.status || 'unknown'}). Returning retryable 503.`);
        return new Response(JSON.stringify({
          error: 'Service Unavailable: Concurrent leader timed out and event has not committed in DB',
          status: dbRecord?.status || 'processing',
          retryable: true
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 503,
        });
      }

      console.warn(`[iyzico-webhook] In-flight detected without promise for ${providerEventId}. Returning retryable 503.`);
      return new Response(JSON.stringify({
        error: 'Service Unavailable: Webhook event is currently in processing state by another worker',
        status: 'processing',
        retryable: true
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 503,
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
        console.error('[iyzico-webhook] Fail-closed: Supabase database URL or service role key is not configured.');
        return new Response(JSON.stringify({
          error: 'Service Unavailable: Backend database service role is not configured',
          retryable: true
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 503,
        });
      }

      const createClient = await getCreateClient();
      supabaseAdmin = createClient(supabaseUrl, supabaseKey);
    }

    // HPP binding MUST be resolved from signed fields before the DB claim.
    // Unsigned subscriptionReferenceCode / referenceCode cannot pick a tenant,
    // poison claim metadata, or redirect a valid signed event to another row.
    if (format === 'hpp') {
      const signedToken = typeof parsedBody.token === 'string' ? parsedBody.token.trim() : '';
      const signedConversationId = typeof parsedBody.paymentConversationId === 'string'
        ? parsedBody.paymentConversationId.trim() : '';
      if (!signedToken && !signedConversationId) {
        return new Response(JSON.stringify({ errorCode: 'MISSING_SIGNED_CHECKOUT_BINDING' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400
        });
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
        console.error('[SECURITY] HPP checkout identity lookup is ambiguous or unavailable.');
        return new Response(JSON.stringify({ errorCode: 'CHECKOUT_BINDING_LOOKUP_FAILED', retryable: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 503
        });
      }
      const tokenRow = tokenResult?.data || null;
      const conversationRow = conversationResult?.data || null;
      if ((signedToken && !tokenRow) || (signedConversationId && !conversationRow) ||
          (tokenRow && conversationRow && tokenRow.id !== conversationRow.id)) {
        return new Response(JSON.stringify({ errorCode: 'UNBOUND_CHECKOUT_SESSION', paymentRecorded: false }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403
        });
      }
      const resolved = tokenRow || conversationRow;
      if (!resolved?.provider_subscription_id) {
        return new Response(JSON.stringify({ errorCode: 'MISSING_VERIFIED_SUBSCRIPTION_REFERENCE' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 503
        });
      }
      subscriptionReferenceCode = resolved.provider_subscription_id;
    }

    // Extract event timestamp
    const eventTimestampEpoch = iyzicoClient.extractProviderEventTimestamp(parsedBody);
    const eventTimestampISO = eventTimestampEpoch ? new Date(eventTimestampEpoch).toISOString() : null;

    // Determine payment proof
    const hasPaymentProof = iyzicoClient.hasPaymentProof(parsedBody);
    const paymentAmount = Number(parsedBody.price || parsedBody.paidPrice || parsedBody.amount || 0);
    // CRITICAL: Unsigned payload currencyCode / currency is strictly ignored; ledger currency comes exclusively from verified DB contract.

    // 1. Atomic Reservation with Lease Timeout & claim_attempt_id fencing
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
      console.error(`[iyzico-webhook] Database claim RPC error:`, claimErr);
      return new Response(JSON.stringify({
        error: 'Service Unavailable: Database idempotency reservation failure',
        retryable: true
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    if (claimRes) {
      if (claimRes.status === 'conflict') {
        console.warn(`[SECURITY] Payload fingerprint mismatch detected for event ID: ${providerEventId}`);
        return new Response(JSON.stringify({
          error: 'Conflict: Event ID collision with mismatched payload',
          errorCode: 'PAYLOAD_FINGERPRINT_MISMATCH'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 409,
        });
      }

      if (claimRes.is_duplicate || claimRes.can_proceed === false) {
        // FAIL-CLOSED PROCESSING GUARD & DURABLE DB OBSERVATION:
        // If an event is currently locked in 'processing' state by another worker/instance:
        // We observe the durable DB record for a bounded duration.
        // - If the leader successfully commits (status: 'processed' or 'duplicate_suppressed'), return idempotent HTTP 200 duplicate!
        // - If the leader fails (status: 'failed') or observation times out, return retryable HTTP 503 so the provider retries.
        if (claimRes.status === 'processing') {
          console.log(`[iyzico-webhook] Cross-instance processing lock detected for: ${providerEventId}. Observing DB for leader completion...`);
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
              console.warn(`[iyzico-webhook] Error during durable status observation:`, err?.message);
            }
          }

          if (terminalRecord && (terminalRecord.status === 'processed' || terminalRecord.status === 'duplicate_suppressed')) {
            console.log(`[iyzico-webhook] Leader completed with status '${terminalRecord.status}' in DB for: ${providerEventId}. Returning idempotent 200.`);
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

          console.warn(`[iyzico-webhook] In-flight leader did not commit successfully in DB for ${providerEventId} (status: ${terminalRecord?.status || 'processing'}). Returning retryable 503.`);
          return new Response(JSON.stringify({
            error: 'Service Unavailable: Webhook event is currently in processing state by another worker',
            status: terminalRecord?.status || 'processing',
            retryable: true
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 503,
          });
        }

        // Only processed or terminal records (processed, duplicate_suppressed) return HTTP 200
        console.log(`[iyzico-webhook] Idempotency record confirmed for: ${providerEventId}. Returning idempotent 200.`);
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
      console.error(`[iyzico-webhook] Error querying subscription:`, subError);
      const finalized = await finalizeWebhookEvent(supabaseAdmin, 'iyzico', providerEventId, 'failed', activeClaimAttemptId, {
        error: subError.message
      });
      return new Response(JSON.stringify({
        error: 'Service Unavailable: Subscription lookup failure',
        finalized,
        retryable: true
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    if (!subscription) {
      console.warn(`[iyzico-webhook] Subscription not yet provisioned: ${subscriptionReferenceCode}. Marking failed and returning retryable 503.`);
      const finalized = await finalizeWebhookEvent(supabaseAdmin, 'iyzico', providerEventId, 'failed', activeClaimAttemptId, {
        error: 'SUBSCRIPTION_NOT_YET_PROVISIONED'
      });
      return new Response(JSON.stringify({
        error: 'Service Unavailable: Subscription record not yet provisioned; retryable for eventual consistency',
        errorCode: 'SUBSCRIPTION_NOT_YET_PROVISIONED',
        referenceCode: subscriptionReferenceCode,
        finalized,
        retryable: true
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 503,
      });
    }

    // Invariant provider payment transaction ID (distinct from delivery eventId)
    const providerPaymentId = iyzicoClient.extractProviderPaymentId(parsedBody);

    // Cryptographic Contract Binding:
    // HPP format checkout binding verification:
    // A valid HPP signature alone cannot mutate arbitrary subscriptions. The signed checkout token or
    // paymentConversationId MUST match a verified server-side subscription checkout binding!
    if (format === 'hpp') {
      const signedCheckoutToken = parsedBody.token ? String(parsedBody.token).trim() : null;
      const signedConversationId = parsedBody.paymentConversationId ? String(parsedBody.paymentConversationId).trim() : null;

      // Each signed identifier has exactly one DB namespace. A matching
      // provider_subscription_id (or a cross-namespace match) is NOT a checkout binding.
      // If both signed identifiers exist, both must match their respective fields.
      const isBound = Boolean(
        subscription && (signedCheckoutToken || signedConversationId) &&
        (!signedCheckoutToken || subscription.provider_token === signedCheckoutToken) &&
        (!signedConversationId || subscription.provider_session_id === signedConversationId)
      );

      if (!isBound) {
        console.warn(`[SECURITY] Unbound HPP checkout webhook rejected for subscription: ${subscriptionReferenceCode}`);
        const finalized = await finalizeWebhookEvent(supabaseAdmin, 'iyzico', providerEventId, 'failed', activeClaimAttemptId, {
          error: 'UNBOUND_CHECKOUT_SESSION'
        });
        return new Response(JSON.stringify({
          error: 'Forbidden: Unbound checkout session; signed token/conversationId has no verified server-side binding',
          errorCode: 'UNBOUND_CHECKOUT_SESSION',
          finalized,
          paymentRecorded: false
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        });
      }
    }

    // Unsigned Financial Field Protection (Controller Directive 1):
    // Neither subscription nor HPP webhook signatures cover payload.price or payload.currency.
    // Authorized amount and currency MUST come strictly from verified DB subscription contract.
    // Fallback to unauthenticated payload.price or payload.currency is STRICTLY FORBIDDEN.
    // Proof is cryptographic and must never be downgraded by a possibly stale
    // pre-lock subscription read: the locked SQL contract decides whether the
    // event can be finalized, or must stay retryable until price/currency exist.
    const authorizedAmount = (subscription && subscription.price != null && Number(subscription.price) > 0)
      ? Number(subscription.price) : 0;
    const verifiedDbCurrency = (subscription && typeof subscription.currency === 'string' && subscription.currency.trim())
      ? subscription.currency.trim().toUpperCase() : null;

    // 3. Execute Atomic Webhook Transaction inside PostgreSQL
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
        // RPC receives only identities that were authenticated by HPP HMAC.
        // It re-verifies them against the FOR UPDATE locked subscription row.
        ...(format === 'hpp' && parsedBody?.token
          ? { verifiedCheckoutToken: String(parsedBody.token).trim() } : {}),
        ...(format === 'hpp' && parsedBody?.paymentConversationId
          ? { verifiedCheckoutConversationId: String(parsedBody.paymentConversationId).trim() } : {}),
        // This value comes from HMAC-authenticated canonical identity extraction.
        providerPaymentId: providerPaymentId,
        // iyziPaymentId is HMAC-signed only in HPP. Never store a subscription
        // payload's unsigned alias, even as metadata: legacy readers must not
        // be able to mistake it for an authenticated payment identity.
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
      console.error(`[iyzico-webhook] Transaction RPC error:`, txErr);
      const finalized = await finalizeWebhookEvent(supabaseAdmin, 'iyzico', providerEventId, 'failed', activeClaimAttemptId, {
        error: txErr.message
      });
      return new Response(JSON.stringify({
        error: 'Service Unavailable: Database transaction failure',
        finalized,
        retryable: true
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    // Positive success contract: Only proceed to HTTP 200 when txRes exists and txRes.success === true
    if (!txRes || txRes.success !== true) {
      const txError = txRes?.error || 'Database transaction produced non-success outcome';
      if (txError === 'UNBOUND_CHECKOUT_SESSION') {
        // A pre-read checkout binding cannot authorize a mutation after a
        // concurrent reassignment. The locked DB row is authoritative.
        const finalized = await finalizeWebhookEvent(supabaseAdmin, 'iyzico', providerEventId, 'failed', activeClaimAttemptId, {
          error: 'UNBOUND_CHECKOUT_SESSION'
        });
        return new Response(JSON.stringify({
          error: 'Forbidden: Checkout binding failed under subscription row lock',
          errorCode: 'UNBOUND_CHECKOUT_SESSION',
          finalized,
          paymentRecorded: false
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: finalized ? 403 : 503
        });
      }

      if (txError === 'TENANT_MISMATCH') {
        console.warn(`[SECURITY] Atomic tenant mismatch under row lock for event: ${providerEventId}`);
        const realSubStatus = txRes?.current_subscription_status || subscription.status;
        const finalized = await finalizeWebhookEvent(supabaseAdmin, 'iyzico', providerEventId, 'duplicate_suppressed', activeClaimAttemptId, {
          error: 'Forbidden: Tenant mismatch between payload and locked subscription',
          status: realSubStatus,
          subscriptionStatus: realSubStatus,
          rejected: true,
          rejectionReason: 'TENANT_MISMATCH'
        });
        if (!finalized) {
          console.error(`[iyzico-webhook] Failed to finalize tenant mismatch security rejection for event: ${providerEventId}`);
          return new Response(JSON.stringify({
            error: 'Service Unavailable: Failed to finalize tenant mismatch security rejection',
            finalized: false,
            retryable: true
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 503,
          });
        }
        return new Response(JSON.stringify({
          error: 'Forbidden: Tenant mismatch between payload and subscription',
          errorCode: 'TENANT_MISMATCH',
          finalized: true
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        });
      }

      if (txError === 'RESERVATION_NOT_FOUND') {
        console.error(`[iyzico-webhook] Atomic reservation not found for event: ${providerEventId}`);
        return new Response(JSON.stringify({
          error: 'Service Unavailable: Database idempotency reservation not found',
          retryable: true
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 503,
        });
      }

      if (txError === 'SUBSCRIPTION_NOT_FOUND') {
        console.warn(`[iyzico-webhook] Subscription not yet provisioned in transaction: ${subscriptionReferenceCode}. Marking failed and returning retryable 503.`);
        const finalized = await finalizeWebhookEvent(supabaseAdmin, 'iyzico', providerEventId, 'failed', activeClaimAttemptId, {
          error: 'SUBSCRIPTION_NOT_YET_PROVISIONED'
        });
        return new Response(JSON.stringify({
          error: 'Service Unavailable: Subscription record not yet provisioned; retryable for eventual consistency',
          errorCode: 'SUBSCRIPTION_NOT_YET_PROVISIONED',
          referenceCode: subscriptionReferenceCode,
          finalized,
          retryable: true
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 503,
        });
      }

      if (txError === 'NOT_IN_PROCESSING_STATE') {
        console.warn(`[iyzico-webhook] Webhook event not in processing state for event: ${providerEventId}`);
        return new Response(JSON.stringify({
          error: 'Conflict: Webhook event is not in processing state and cannot be executed',
          errorCode: 'NOT_IN_PROCESSING_STATE',
          retryable: false
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 409,
        });
      }

      if (txError === 'LEASE_LOST_TO_ANOTHER_WORKER') {
        console.warn(`[iyzico-webhook] Lease lost to concurrent worker for event: ${providerEventId}. Observing DB for new worker completion...`);
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
            console.warn(`[iyzico-webhook] Error observing new worker status:`, err?.message);
          }
        }

        if (terminalRecord && (terminalRecord.status === 'processed' || terminalRecord.status === 'duplicate_suppressed')) {
          console.log(`[iyzico-webhook] New lease owner completed with status '${terminalRecord.status}' in DB for: ${providerEventId}. Returning idempotent 200.`);
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

        console.warn(`[iyzico-webhook] New lease owner did not commit successfully in DB for ${providerEventId} (status: ${terminalRecord?.status || 'processing'}). Returning retryable 503.`);
        return new Response(JSON.stringify({
          error: 'Service Unavailable: Lease was taken over by another worker which has not yet committed',
          status: terminalRecord?.status || 'processing',
          retryable: true
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 503,
        });
      }

      const finalized = await finalizeWebhookEvent(supabaseAdmin, 'iyzico', providerEventId, 'failed', activeClaimAttemptId, {
        error: txError
      });
      return new Response(JSON.stringify({
        error: `Database transaction failed: ${txError}`,
        finalized,
        retryable: txRes?.retryable ?? true
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
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
    console.error(`[iyzico-webhook] Unhandled webhook processing exception:`, error.message);
    let finalized = false;
    if (activeProviderEventId && supabaseAdmin) {
      finalized = await finalizeWebhookEvent(supabaseAdmin, 'iyzico', activeProviderEventId, 'failed', activeClaimAttemptId, {
        unhandled_error: error.message
      });
    }
    const errRes = new Response(JSON.stringify({
      error: 'Internal Server Error',
      message: error.message,
      finalized,
      retryable: true
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
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
