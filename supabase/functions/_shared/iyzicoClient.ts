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

export type SupportedEventType =
  | 'subscription.created'
  | 'subscription.active'
  | 'subscription.renewed'
  | 'subscription.cancelled'
  | 'subscription.past_due'
  | 'subscription.failed'
  | 'subscription.expired'
  | 'checkoutform.auth'
  | 'payment.success'
  | 'payment.failure';

export const SUPPORTED_EVENT_TYPES: readonly SupportedEventType[] = [
  'subscription.created',
  'subscription.active',
  'subscription.renewed',
  'subscription.cancelled',
  'subscription.past_due',
  'subscription.failed',
  'subscription.expired',
  'checkoutform.auth',
  'payment.success',
  'payment.failure'
] as const;

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

  buildSubscriptionWebhookSignaturePayload: (payload: any, secretKey: string): string => {
    return [
      secretKey,
      payload.merchantId || '',
      payload.eventType || '',
      payload.subscriptionReferenceCode || '',
      payload.orderReferenceCode || '',
      payload.customerReferenceCode || ''
    ].join('');
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
    secretKeyOverride?: string
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

    // 5. Strict supported event classification
    const eventType = payload.eventType || payload.iyziEventType;
    if (!eventType || !iyzicoClient.isSupportedEventType(eventType)) {
      return { isValid: false, reason: 'UNSUPPORTED_EVENT_TYPE' };
    }

    // 6. Format-specific message assembly
    let message = '';
    if (payload.iyziEventType || payload.token) {
      message = iyzicoClient.buildHppWebhookSignaturePayload(payload, secretKey);
    } else if (payload.eventType) {
      message = iyzicoClient.buildSubscriptionWebhookSignaturePayload(payload, secretKey);
    } else {
      return { isValid: false, reason: 'UNRECOGNIZED_PAYLOAD_STRUCTURE' };
    }

    // 7. Deterministic HMAC-SHA256 calculation
    const expectedSignature = await iyzicoClient.hmacSha256Hex(message, secretKey);
    
    // 8. Constant-time equality comparison
    const isValid = iyzicoClient.safeTimingEqual(expectedSignature, signature.trim());
    if (!isValid) {
      // NOTE: Never log expected or received signatures, or secret keys!
      return { isValid: false, reason: 'SIGNATURE_MISMATCH' };
    }

    return { isValid: true };
  },

  mapIyzicoWebhookToInternalStatus: (payload: any): string => {
    const eventType = payload?.eventType || payload?.iyziEventType;
    const status = payload?.status;

    if (!eventType && !status) return 'unknown';

    if (
      eventType === 'subscription.created' ||
      eventType === 'subscription.active' ||
      eventType === 'subscription.renewed' ||
      eventType === 'payment.success' ||
      eventType === 'checkoutform.auth' ||
      status === 'ACTIVE' ||
      status === 'SUCCESS'
    ) {
      return 'active';
    }

    if (
      eventType === 'subscription.past_due' ||
      status === 'PAST_DUE' ||
      status === 'UNPAID'
    ) {
      return 'past_due';
    }

    if (
      eventType === 'subscription.cancelled' ||
      eventType === 'subscription.expired' ||
      status === 'CANCELED' ||
      status === 'EXPIRED'
    ) {
      return 'cancelled';
    }

    if (
      eventType === 'subscription.failed' ||
      eventType === 'payment.failure' ||
      status === 'FAILURE'
    ) {
      return 'past_due';
    }

    return 'unknown';
  }
};
