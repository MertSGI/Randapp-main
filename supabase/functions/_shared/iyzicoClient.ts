// iyzico client wrapper for Edge Functions and offline testing
// Implements cryptographic HMAC-SHA256 signature verification and payload builders.
// Zero external network calls or secrets logging permitted.

declare const Deno: any;
declare const process: any;

export interface IyzicoConfig {
  apiKey?: string;
  secretKey?: string;
  baseUrl: string;
}

export interface SubscriptionTransitionEvaluation {
  allowed: boolean;
  effectiveStatus: string;
  reason?: string;
  isOutOfOrder?: boolean;
}

export type SupportedEventType =
  | 'subscription.created'
  | 'subscription.active'
  | 'subscription.renewed'
  | 'subscription.cancelled'
  | 'subscription.past_due'
  | 'subscription.failed'
  | 'subscription.expired'
  | 'subscription.order.success'
  | 'subscription.order.failure'
  | 'checkoutform.auth'
  | 'CHECKOUT_FORM_AUTH'
  | 'payment.success'
  | 'payment.failure';

// Broad internal lifecycle vocabulary. NOT an authorization list for public
// provider webhooks: local subscription reconciliation may have other events.
export const SUPPORTED_EVENT_TYPES: readonly SupportedEventType[] = [
  'subscription.created',
  'subscription.active',
  'subscription.renewed',
  'subscription.cancelled',
  'subscription.past_due',
  'subscription.failed',
  'subscription.expired',
  'subscription.order.success',
  'subscription.order.failure',
  'checkoutform.auth',
  'CHECKOUT_FORM_AUTH',
  'payment.success',
  'payment.failure'
] as const;

// Provider-facing HMAC-verified webhook contract. This is intentionally much
// narrower than the internal subscription state-machine event vocabulary.
export const PUBLIC_IYZICO_WEBHOOK_EVENT_TYPES = {
  subscription: ['subscription.order.success', 'subscription.order.failure'],
  // Accept the documented raw V3 HPP value, while preserving the signed legacy
  // spelling used in existing local fixtures. Normalization is AFTER HMAC.
  hpp: ['CHECKOUT_FORM_AUTH', 'checkoutform.auth']
} as const;

export const iyzicoClient = {
  getIyzicoConfig: (): IyzicoConfig => {
    const apiKey = typeof Deno !== 'undefined'
      ? Deno.env.get('IYZICO_API_KEY')
      : (typeof process !== 'undefined' ? process.env?.IYZICO_API_KEY : undefined);
    const secretKey = typeof Deno !== 'undefined'
      ? Deno.env.get('IYZICO_SECRET_KEY')
      : (typeof process !== 'undefined' ? process.env?.IYZICO_SECRET_KEY : undefined);
    const baseUrl = (typeof Deno !== 'undefined'
      ? Deno.env.get('IYZICO_BASE_URL')
      : (typeof process !== 'undefined' ? process.env?.IYZICO_BASE_URL : undefined)) || 'https://sandbox-api.iyzipay.com';

    return { apiKey, secretKey, baseUrl };
  },

  assertIyzicoSandboxConfig: (): IyzicoConfig => {
    const config = iyzicoClient.getIyzicoConfig();
    if (!config.apiKey || !config.secretKey) {
      throw new Error("iyzico sandbox configuration is missing (API Key or Secret Key)");
    }
    return config;
  },

  isSupportedEventType: (eventType: any): eventType is SupportedEventType => {
    if (!eventType || typeof eventType !== 'string') return false;
    return (SUPPORTED_EVENT_TYPES as readonly string[]).includes(eventType);
  },

  isPublicProviderWebhookEvent: (format: 'subscription' | 'hpp' | 'unknown', eventType: string): boolean => {
    if (format !== 'subscription' && format !== 'hpp') return false;
    return (PUBLIC_IYZICO_WEBHOOK_EVENT_TYPES[format] as readonly string[]).includes(eventType);
  },

  toInternalProviderEventType: (format: 'subscription' | 'hpp' | 'unknown', signedEventType: string): string => {
    if (format === 'hpp' && signedEventType === 'CHECKOUT_FORM_AUTH') return 'checkoutform.auth';
    return signedEventType;
  },

  hmacSha256Hex: async (message: string, secret: string): Promise<string> => {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(message);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
    const hashArray = Array.from(new Uint8Array(signature));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  },

  safeTimingEqual: (a: string, b: string): boolean => {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  },

  buildSubscriptionWebhookSignaturePayload: (payload: any, secretKey: string, trustedMerchantId?: string): string => {
    // Official subscription webhooks can omit merchantId from the JSON body.
    // The caller supplies the merchant account's configured ID when available.
    const merchantId = trustedMerchantId ?? payload.merchantId ?? '';
    const eventType = payload.iyziEventType || payload.eventType || '';
    const subscriptionReferenceCode = payload.subscriptionReferenceCode || '';
    const orderReferenceCode = payload.orderReferenceCode || '';
    const customerReferenceCode = payload.customerReferenceCode || '';

    // Official iyzico Node.js standard concatenation order:
    // merchantId + secretKey + eventType + subscriptionReferenceCode + orderReferenceCode + customerReferenceCode
    return `${merchantId}${secretKey}${eventType}${subscriptionReferenceCode}${orderReferenceCode}${customerReferenceCode}`;
  },

  buildHppWebhookSignaturePayload: (payload: any, secretKey: string): string => {
    return [
      secretKey,
      payload.iyziEventType || '',
      payload.iyziPaymentId || '',
      payload.token || '',
      payload.paymentConversationId || '',
      payload.status || ''
    ].join('');
  },
  
  // Stable idempotency identity: ONLY fields actually covered by the relevant
  // iyzico V3 signature. Unsigned event metadata must not poison a retry.
  // Values intentionally use the same empty-string coercion as the HMAC builders.
  signedWebhookFingerprintMaterial: (payload: any, trustedMerchantId?: string): string => {
    const format = iyzicoClient.classifyWebhookSignatureFormat(payload);
    const signedValue = (value: any): string => String(value || '');
    if (format === 'subscription') {
      return iyzicoClient.canonicalizeJson({
        signatureFormat: 'subscription-v3',
        merchantId: signedValue(trustedMerchantId ?? payload.merchantId),
        eventType: signedValue(payload.iyziEventType || payload.eventType),
        subscriptionReferenceCode: signedValue(payload.subscriptionReferenceCode),
        orderReferenceCode: signedValue(payload.orderReferenceCode),
        customerReferenceCode: signedValue(payload.customerReferenceCode)
      });
    }
    if (format === 'hpp') {
      return iyzicoClient.canonicalizeJson({
        signatureFormat: 'hpp-v3',
        iyziEventType: signedValue(payload.iyziEventType),
        iyziPaymentId: signedValue(payload.iyziPaymentId),
        token: signedValue(payload.token),
        paymentConversationId: signedValue(payload.paymentConversationId),
        status: signedValue(payload.status)
      });
    }
    throw new Error('UNRECOGNIZED_SIGNATURE_FORMAT_FOR_FINGERPRINT');
  },

  createSubscriptionCheckoutSession: async (params: {
    paymentPlanReferenceCode: string;
    customer: any;
    callbackUrl: string;
    conversationId: string;
    locale?: string;
  }) => {
    // Assert credentials present without exposing them
    iyzicoClient.assertIyzicoSandboxConfig();

    // In a real implementation:
    // Requires authorized external merchant credentials and verified provider token.
    // As per LARI security policy, external live/sandbox transactions are disabled without attestation.
    throw new Error("IYZICO_CRYPTO_NOT_IMPLEMENTED: Live or sandbox external network requests are disabled in current qualification phase.");
  },

  verifyIyzicoSignatureV3: async (
    reqHeaders: Headers | Record<string, string | undefined> | Map<string, string>,
    payload: any,
    secretKeyOverride?: string,
    trustedMerchantIdOverride?: string
  ): Promise<{ isValid: boolean; reason?: string }> => {
    // 1. Signature header extraction - Case insensitive check
    let signature: string | null | undefined = null;
    if (reqHeaders && typeof (reqHeaders as any).get === 'function') {
      signature = (reqHeaders as Headers).get('x-iyz-signature-v3')
        || (reqHeaders as Headers).get('X-Iyz-Signature-V3')
        || (reqHeaders as Headers).get('X-IYZ-SIGNATURE-V3');
    } else if (reqHeaders && typeof reqHeaders === 'object') {
      signature = (reqHeaders as Record<string, string | undefined>)['x-iyz-signature-v3']
        || (reqHeaders as Record<string, string | undefined>)['X-Iyz-Signature-V3']
        || (reqHeaders as Record<string, string | undefined>)['X-IYZ-SIGNATURE-V3'];
    }

    // 2. Reject missing, empty, or non-string signature
    // SECURITY: sandbox_bypass backdoor is PERMANENTLY REMOVED.
    if (!signature || typeof signature !== 'string' || signature.trim() === '') {
      return { isValid: false, reason: 'MISSING_SIGNATURE_HEADER' };
    }

    // 3. Secret key check
    const secretKey = secretKeyOverride || iyzicoClient.getIyzicoConfig().secretKey || '';
    if (!secretKey) {
      return { isValid: false, reason: 'SECRET_KEY_MISSING' };
    }

    // 4. Payload validation
    if (!payload || typeof payload !== 'object') {
      return { isValid: false, reason: 'INVALID_PAYLOAD' };
    }

    // 5. Raw, signed provider event classification. An unsigned eventType alias
    // must never override iyziEventType, including CHECKOUT_FORM_AUTH.
    const format = iyzicoClient.classifyWebhookSignatureFormat(payload);
    const eventType = payload.iyziEventType || payload.eventType;
    if (!eventType || !iyzicoClient.isSupportedEventType(eventType)) {
      return { isValid: false, reason: 'UNSUPPORTED_EVENT_TYPE' };
    }
    if (payload.eventType && payload.iyziEventType && payload.eventType !== payload.iyziEventType) {
      return { isValid: false, reason: 'CONFLICTING_EVENT_TYPE' };
    }

    let message = '';
    if (format === 'subscription') {
      // Merchant identity is never inferred from an absent body field. A
      // configured ID authorizes the official bodyless subscription format.
      const configuredMerchantId = trustedMerchantIdOverride ||
        (typeof Deno !== 'undefined' ? Deno.env.get('IYZICO_MERCHANT_ID') :
          (typeof process !== 'undefined' ? process.env?.IYZICO_MERCHANT_ID : undefined)) || '';
      const payloadMerchantId = payload.merchantId === undefined || payload.merchantId === null
        ? '' : String(payload.merchantId);
      if (configuredMerchantId && payloadMerchantId && String(configuredMerchantId) !== payloadMerchantId) {
        return { isValid: false, reason: 'MERCHANT_ID_MISMATCH' };
      }
      const trustedMerchantId = String(configuredMerchantId || payloadMerchantId);
      if (!trustedMerchantId.trim()) {
        return { isValid: false, reason: 'MERCHANT_ID_MISSING' };
      }
      message = iyzicoClient.buildSubscriptionWebhookSignaturePayload(payload, secretKey, trustedMerchantId);
    } else if (format === 'hpp') {
      message = iyzicoClient.buildHppWebhookSignaturePayload(payload, secretKey);
    } else {
      return { isValid: false, reason: 'UNRECOGNIZED_PAYLOAD_STRUCTURE' };
    }

    // 7. Deterministic HMAC-SHA256 calculation
    const expectedSignature = await iyzicoClient.hmacSha256Hex(message, secretKey);
    
    // 8. Constant-time equality comparison
    let isValid = iyzicoClient.safeTimingEqual(expectedSignature, signature.trim());

    if (!isValid) {
      // NOTE: Never log expected or received signatures, or secret keys!
      return { isValid: false, reason: 'SIGNATURE_MISMATCH' };
    }

    return { isValid: true };
  },

  classifyWebhookSignatureFormat: (payload: any): 'hpp' | 'subscription' | 'unknown' => {
    if (!payload || typeof payload !== 'object') return 'unknown';

    const signedEventType = String(payload.iyziEventType || '').trim();
    // A provider-signed HPP event takes precedence over unsigned aliases.
    if (signedEventType === 'CHECKOUT_FORM_AUTH' || signedEventType === 'checkoutform.auth') return 'hpp';
    const eventType = String(payload.eventType || payload.iyziEventType || '').trim();

    // 1. Explicit HPP events or payload containing checkout token
    if (
      (eventType === 'checkoutform.auth' || eventType === 'CHECKOUT_FORM_AUTH') ||
      Boolean(payload.token)
    ) {
      return 'hpp';
    }

    // 2. Subscription format:
    // Event type starts with 'subscription.' or contains subscriptionReferenceCode
    if (
      eventType.startsWith('subscription.') ||
      Boolean(payload.subscriptionReferenceCode)
    ) {
      return 'subscription';
    }

    // 3. Additional HPP format signals (direct checkout without subscription)
    if (
      Boolean(payload.iyziPaymentId) ||
      Boolean(payload.paymentConversationId) ||
      payload.status !== undefined
    ) {
      return 'hpp';
    }

    if (eventType === 'payment.success' || eventType === 'payment.failure') {
      return 'subscription';
    }

    return 'unknown';
  },

  mapIyzicoWebhookToInternalStatus: (payload: any): string => {
    if (!payload || typeof payload !== 'object') return 'unknown';

    const format = iyzicoClient.classifyWebhookSignatureFormat(payload);
    const eventType = format === 'hpp'
      ? String(payload?.iyziEventType || 'checkoutform.auth').trim()
      : String(payload?.eventType || payload?.iyziEventType || '').trim();
    if (!eventType) return 'unknown';

    // For subscription format, the HMAC signature ONLY covers:
    // (secretKey + merchantId + eventType + subscriptionReferenceCode + orderReferenceCode + customerReferenceCode)
    // Payload 'status' is completely unsigned and unverified.
    // Target status MUST be derived strictly and exclusively from the verified eventType!
    if (format === 'subscription') {
      switch (eventType) {
        case 'subscription.created':
          return 'pending';
        case 'subscription.order.success':
        case 'payment.success':
          return iyzicoClient.hasPaymentProof(payload) ? 'active' : 'pending';
        case 'subscription.order.failure':
        case 'subscription.failed':
        case 'payment.failure':
        case 'subscription.past_due':
          return 'past_due';
        case 'subscription.cancelled':
        case 'subscription.expired':
          return 'cancelled';
        case 'subscription.active':
        case 'subscription.renewed':
          return 'active';
        default:
          return 'unknown';
      }
    }

    // For HPP (Hosted Payment Page) format, status IS cryptographically signed:
    // (secretKey + iyziEventType + iyziPaymentId + token + paymentConversationId + status)
    if (format === 'hpp') {
      const status = payload?.status;
      if (status === 'FAILURE' || status === 'FAILED') return 'past_due';
      if (status === 'PENDING') return 'pending';
      if (eventType === 'checkoutform.auth' || eventType === 'CHECKOUT_FORM_AUTH' || status === 'SUCCESS') {
        return iyzicoClient.hasPaymentProof(payload) ? 'active' : 'pending';
      }
      return 'unknown';
    }

    return 'unknown';
  },

  hasPaymentProof: (payload: any): boolean => {
    if (!payload || typeof payload !== 'object') return false;

    const format = iyzicoClient.classifyWebhookSignatureFormat(payload);
    const eventType = payload.eventType || payload.iyziEventType;
    if (!eventType || typeof eventType !== 'string') return false;

    const nonPaymentEvents: readonly string[] = [
      'subscription.created',
      'subscription.failed',
      'subscription.order.failure',
      'subscription.past_due',
      'subscription.cancelled',
      'subscription.expired',
      'payment.failure',
      'subscription.active',
      'subscription.renewed'
    ];
    if (nonPaymentEvents.includes(eventType)) {
      return false;
    }

    if (format === 'subscription') {
      // Subscription payment proof strictly requires verified order collection event
      // and cryptographically signed canonical orderReferenceCode.
      // Unsigned orderReference alias is strictly rejected!
      if (eventType === 'subscription.order.success' || eventType === 'payment.success') {
        const orderRef = payload.orderReferenceCode;
        if (!orderRef || String(orderRef).trim().length === 0) {
          return false;
        }
        return true;
      }
      return false;
    }

    if (format === 'hpp') {
      // Hosted Payment Page (HPP) checkout authorization strictly requires signed status === 'SUCCESS'
      const status = payload.status;
      if (typeof status !== 'string' || status.trim().toUpperCase() !== 'SUCCESS') {
        return false;
      }
      // CRITICAL SECURITY ENFORCEMENT (Codex Rule 13 — Yalniz Imzali Kimlikler):
      // Only HMAC-signed fields are accepted as proof: iyziPaymentId, token, or paymentConversationId.
      // Unsigned paymentId alias is strictly forbidden!
      const rawSignedId = payload.iyziPaymentId ?? payload.token ?? payload.paymentConversationId;
      return rawSignedId !== undefined && rawSignedId !== null && String(rawSignedId).trim().length > 0;
    }

    return false;
  },

  extractProviderEventTimestamp: (_payload: any): number | null => {
    // Neither supported subscription nor HPP HMAC contract authenticates a
    // provider event timestamp. Never pass caller-controlled eventTime,
    // timestamp, createdDate or similar fields to an ordering-sensitive RPC.
    // A verified provider-side reconciliation must establish ordering separately.
    return null;
  },

  encodeTupleKey: (...parts: (string | number | undefined | null)[]): string => {
    return parts.map((p) => {
      const s = p === undefined || p === null ? '' : String(p);
      return `${s.length}:${s}`;
    }).join('/');
  },

  extractProviderEventId: (payload: any): string => {
    if (!payload || typeof payload !== 'object') return 'unknown_event';

    const format = iyzicoClient.classifyWebhookSignatureFormat(payload);

    if (format === 'subscription') {
      const eventType = String(payload.eventType || payload.iyziEventType || '').trim();
      // ONLY signed canonical fields are accepted.
      // Unsigned referenceCode or orderReference aliases are strictly rejected!
      const subRef = String(payload.subscriptionReferenceCode || '').trim();
      const orderRef = String(payload.orderReferenceCode || '').trim();

      if (!subRef) {
        throw new Error(`MISSING_SIGNED_SUBSCRIPTION_REFERENCE: Subscription webhook lacks subscriptionReferenceCode.`);
      }

      // 1. If signed orderReferenceCode exists (orders, payments, renewals)
      if (orderRef) {
        return iyzicoClient.encodeTupleKey('subscription', eventType, subRef, orderRef);
      }

      // 2. Singular lifecycle events verified per subscription
      if (eventType === 'subscription.created') {
        return iyzicoClient.encodeTupleKey('subscription', 'subscription.created', subRef);
      }
      if (eventType === 'subscription.cancelled') {
        return iyzicoClient.encodeTupleKey('subscription', 'subscription.cancelled', subRef);
      }

      // Fail-closed: Subscription webhook without signed orderReferenceCode and not a singular lifecycle event cannot be uniquely signed
      throw new Error(`MISSING_SIGNED_ORDER_REFERENCE: Subscription event '${eventType}' requires a cryptographically signed orderReferenceCode.`);
    }

    if (format === 'hpp') {
      const iyziEventType = String(payload.iyziEventType || 'checkoutform.auth').trim();
      const token = String(payload.token || '').trim();
      const iyziPaymentId = String(payload.iyziPaymentId || '').trim();
      const convId = String(payload.paymentConversationId || '').trim();

      // ONLY HMAC-signed fields are accepted: token, iyziPaymentId, or paymentConversationId.
      // Unsigned paymentId or conversationId aliases are strictly forbidden!
      if (token) {
        return iyzicoClient.encodeTupleKey('hpp', iyziEventType, token);
      }
      if (iyziPaymentId) {
        return iyzicoClient.encodeTupleKey('hpp', iyziEventType, iyziPaymentId);
      }
      if (convId) {
        return iyzicoClient.encodeTupleKey('hpp', iyziEventType, convId);
      }
      throw new Error(`MISSING_SIGNED_HPP_IDENTIFIER: HPP webhook lacks signed token, iyziPaymentId, or paymentConversationId.`);
    }

    throw new Error(`UNRECOGNIZED_WEBHOOK_FORMAT: Payload cannot be classified into a signed iyzico format.`);
  },

  canonicalizeJson: (obj: any): string => {
    if (obj === null || typeof obj !== 'object') {
      return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
      return '[' + obj.map(item => iyzicoClient.canonicalizeJson(item)).join(',') + ']';
    }
    const keys = Object.keys(obj).sort();
    const entries = keys.map(k => `${JSON.stringify(k)}:${iyzicoClient.canonicalizeJson(obj[k])}`);
    return '{' + entries.join(',') + '}';
  },

  extractProviderPaymentId: (payload: any): string | null => {
    if (!payload || typeof payload !== 'object') return null;

    const format = iyzicoClient.classifyWebhookSignatureFormat(payload);

    if (format === 'subscription') {
      const subRef = payload.subscriptionReferenceCode;
      const orderRef = payload.orderReferenceCode;
      // ONLY signed canonical fields are accepted. Unsigned aliases are strictly rejected!
      if (subRef && orderRef && String(orderRef).trim().length > 0) {
        // Physically bound to the cryptographically signed orderReferenceCode
        return `iyzico:order:${String(orderRef).trim()}`;
      }
      // Fail-closed for subscription payment events: unsigned iyziPaymentId must NEVER be used
      return null;
    }

    if (format === 'hpp') {
      // In HPP format, ONLY HMAC-signed fields are accepted: iyziPaymentId, token, or paymentConversationId.
      // Unsigned paymentId alias is strictly forbidden!
      const rawPaymentId = payload.iyziPaymentId ?? payload.token ?? payload.paymentConversationId;
      if (rawPaymentId !== undefined && rawPaymentId !== null && String(rawPaymentId).trim() !== '') {
        return String(rawPaymentId).trim();
      }
      return null;
    }

    return null;
  },

  evaluateSubscriptionTransition: (
    currentStatus: string | null | undefined,
    mappedStatus: string,
    eventType: string,
    hasPaymentProof: boolean,
    currentEventTimestamp?: number | string | Date | null,
    lastEventTimestamp?: number | string | Date | null
  ): SubscriptionTransitionEvaluation => {
    const current = (currentStatus || 'none').toLowerCase();
    const target = mappedStatus.toLowerCase();

    // Monotonic provider timestamp verification to prevent out-of-order stale transitions.
    // E.g. A delayed old cancellation must not cancel a newer activation, and an old
    // payment.success must not resurrect a newly cancelled subscription.
    let currentEpoch: number | null = null;
    let lastEpoch: number | null = null;

    if (currentEventTimestamp !== undefined && currentEventTimestamp !== null) {
      if (typeof currentEventTimestamp === 'number' && Number.isFinite(currentEventTimestamp)) {
        currentEpoch = currentEventTimestamp < 1e11 ? currentEventTimestamp * 1000 : currentEventTimestamp;
      } else if (typeof currentEventTimestamp === 'string') {
        const p = Date.parse(currentEventTimestamp);
        if (!Number.isNaN(p)) currentEpoch = p;
      } else if (currentEventTimestamp instanceof Date && !Number.isNaN(currentEventTimestamp.getTime())) {
        currentEpoch = currentEventTimestamp.getTime();
      }
    }

    if (lastEventTimestamp !== undefined && lastEventTimestamp !== null) {
      if (typeof lastEventTimestamp === 'number' && Number.isFinite(lastEventTimestamp)) {
        lastEpoch = lastEventTimestamp < 1e11 ? lastEventTimestamp * 1000 : lastEventTimestamp;
      } else if (typeof lastEventTimestamp === 'string') {
        const p = Date.parse(lastEventTimestamp);
        if (!Number.isNaN(p)) lastEpoch = p;
      } else if (lastEventTimestamp instanceof Date && !Number.isNaN(lastEventTimestamp.getTime())) {
        lastEpoch = lastEventTimestamp.getTime();
      }
    }

    // Clock-skew guard: protect against forward-jump watermark attacks (events > 5 min in future)
    const maxFutureSkewMs = 5 * 60 * 1000;
    if (currentEpoch !== null && currentEpoch > Date.now() + maxFutureSkewMs) {
      return {
        allowed: false,
        effectiveStatus: current,
        isOutOfOrder: true,
        reason: `REJECTED_FUTURE_TIMESTAMP_CLOCK_SKEW: Incoming event timestamp (${new Date(currentEpoch).toISOString()}) exceeds allowed 5 minute clock skew.`
      };
    }

    // 1. If statuses are already identical, no state mutation required
    if (current === target) {
      return { allowed: true, effectiveStatus: target };
    }

    if (currentEpoch !== null && lastEpoch !== null) {
      if (currentEpoch < lastEpoch) {
        if ((target === 'cancelled' || target === 'past_due') && current === 'active') {
          return {
            allowed: false,
            effectiveStatus: current,
            isOutOfOrder: true,
            reason: `SUPPRESSED_STALE_CANCELLATION: Incoming cancellation timestamp (${new Date(currentEpoch).toISOString()}) is older than current active subscription state (${new Date(lastEpoch).toISOString()}).`
          };
        }

        if (target === 'active' && (current === 'cancelled' || current === 'expired')) {
          return {
            allowed: false,
            effectiveStatus: current,
            isOutOfOrder: true,
            reason: `SUPPRESSED_STALE_PAYMENT: Incoming payment/activation timestamp (${new Date(currentEpoch).toISOString()}) is older than terminal cancellation state (${new Date(lastEpoch).toISOString()}).`
          };
        }

        return {
          allowed: false,
          effectiveStatus: current,
          isOutOfOrder: true,
          reason: `SUPPRESSED_STALE_EVENT_TIMESTAMP: Incoming event timestamp (${new Date(currentEpoch).toISOString()}) is strictly older than last processed event (${new Date(lastEpoch).toISOString()}).`
        };
      }

      if (currentEpoch === lastEpoch) {
        // Equal-timestamp tie-breaker / event priority:
        // A verified payment success (target: 'active', hasPaymentProof: true) takes precedence
        // over an unresolved failure (past_due) or pending state with the same timestamp.
        if ((current === 'past_due' || current === 'pending' || current === 'none') && target === 'active' && hasPaymentProof) {
          // Allow recovery/activation via payment proof tie-breaker
        } else if (current === 'active' && (target === 'past_due' || target === 'pending')) {
          // Active state with payment proof dominates non-payment events at equal timestamp
          return {
            allowed: false,
            effectiveStatus: current,
            isOutOfOrder: true,
            reason: `SUPPRESSED_EQUAL_TIMESTAMP_DOWNGRADE: Active subscription cannot be downgraded to ${target} by an event with equal timestamp (${new Date(currentEpoch).toISOString()}).`
          };
        } else if (current === 'cancelled' || current === 'expired') {
          // Terminal states require strictly newer timestamp to even evaluate
          return {
            allowed: false,
            effectiveStatus: current,
            isOutOfOrder: true,
            reason: `SUPPRESSED_EQUAL_TIMESTAMP_TERMINAL: Terminal subscription state cannot be altered by an event with equal timestamp (${new Date(currentEpoch).toISOString()}).`
          };
        } else if (!hasPaymentProof && target !== current) {
          return {
            allowed: false,
            effectiveStatus: current,
            isOutOfOrder: true,
            reason: `SUPPRESSED_EQUAL_TIMESTAMP_UNVERIFIED: Unverified event cannot alter subscription state at equal timestamp (${new Date(currentEpoch).toISOString()}).`
          };
        }
      }
    }

    // 2. Out-of-order creation suppression:
    // If subscription is already active (or trialing), an incoming subscription.created
    // or pending event must NEVER downgrade the subscription back to pending!
    if ((current === 'active' || current === 'trialing') && target === 'pending') {
      return {
        allowed: false,
        effectiveStatus: current,
        isOutOfOrder: true,
        reason: 'SUPPRESSED_OUT_OF_ORDER_CREATION: Active subscription cannot be regressed to pending by delayed creation event.'
      };
    }

    // 3. Terminal state protection: Cancelled or expired subscriptions cannot be regressed to pending or past_due
    if ((current === 'cancelled' || current === 'expired') && (target === 'pending' || target === 'past_due')) {
      return {
        allowed: false,
        effectiveStatus: current,
        isOutOfOrder: true,
        reason: 'SUPPRESSED_STALE_EVENT: Terminal subscription state cannot transition to pending or past_due.'
      };
    }

    // 4. Terminal state reactivation protection:
    // A cancelled subscription cannot be resurrected by a lifecycle event without verified payment proof
    if ((current === 'cancelled' || current === 'expired') && target === 'active' && !hasPaymentProof) {
      return {
        allowed: false,
        effectiveStatus: current,
        isOutOfOrder: true,
        reason: 'SUPPRESSED_UNVERIFIED_REACTIVATION: Cancelled subscription requires verified payment proof to reactivate.'
      };
    }

    // 5. Past due protection: Past due cannot be overwritten by pending
    if (current === 'past_due' && target === 'pending') {
      return {
        allowed: false,
        effectiveStatus: current,
        isOutOfOrder: true,
        reason: 'SUPPRESSED_OUT_OF_ORDER_EVENT: Past due subscription cannot be regressed to pending.'
      };
    }

    // 6. Past due unverified reactivation protection:
    // Past due subscription cannot be transitioned to active without verified payment proof
    if (current === 'past_due' && target === 'active' && !hasPaymentProof) {
      return {
        allowed: false,
        effectiveStatus: current,
        isOutOfOrder: true,
        reason: 'SUPPRESSED_UNVERIFIED_REACTIVATION: Past due subscription requires verified payment proof to transition to active.'
      };
    }

    return {
      allowed: true,
      effectiveStatus: target
    };
  }
};
