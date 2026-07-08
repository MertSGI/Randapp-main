// Mock iyzico client wrapper for Edge Functions
// In a real environment, you'd use 'iyzipay' Node.js library wrapper or fetch API directly.

export const iyzicoClient = {
  getIyzicoConfig: () => {
    return {
      apiKey: Deno.env.get('IYZICO_API_KEY'),
      secretKey: Deno.env.get('IYZICO_SECRET_KEY'),
      baseUrl: Deno.env.get('IYZICO_BASE_URL') || 'https://sandbox-api.iyzipay.com'
    };
  },

  assertIyzicoSandboxConfig: () => {
    const config = iyzicoClient.getIyzicoConfig();
    if (!config.apiKey || !config.secretKey) {
      throw new Error("iyzico sandbox configuration is missing (API Key or Secret Key)");
    }
    return config;
  },

  hmacSha256Hex: async (message: string, secret: string) => {
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

  safeTimingEqual: (a: string, b: string) => {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  },

  buildSubscriptionWebhookSignaturePayload: (payload: any, secretKey: string) => {
    return [
      secretKey,
      payload.merchantId || '',
      payload.eventType || '',
      payload.subscriptionReferenceCode || '',
      payload.orderReferenceCode || '',
      payload.customerReferenceCode || ''
    ].join('');
  },

  buildHppWebhookSignaturePayload: (payload: any, secretKey: string) => {
    return [
      secretKey,
      payload.iyziEventType || '',
      payload.iyziPaymentId || '',
      payload.token || '',
      payload.paymentConversationId || '',
      payload.status || ''
    ].join('');
  },
  
  // Placeholder for real iyzico subscription checkout form initialization
  createSubscriptionCheckoutSession: async (params: {
    paymentPlanReferenceCode: string;
    customer: any;
    callbackUrl: string;
    conversationId: string;
    locale?: string;
  }) => {
    console.log("[iyzicoClient] Preparing real sandbox request for iyzico with params:", params);
    
    // In a real implementation we would:
    // 1. Generate an authorization header (IYZWS PKI/HMAC token based on api_key, secret_key, random string, and payload)
    // 2. Base64 encode the payload if necessary or just format as JSON
    // 3. fetch(`https://sandbox-api.iyzipay.com/v2/subscription/checkoutform/initialize`)
    
    const config = iyzicoClient.assertIyzicoSandboxConfig();

    const requestBody = {
      locale: params.locale || "tr",
      conversationId: params.conversationId,
      pricingPlanReferenceCode: params.paymentPlanReferenceCode,
      subscriptionInitialStatus: "ACTIVE",
      callbackUrl: params.callbackUrl,
      customer: params.customer
    };

    // We keep the final network call wrapped in this clearly marked try/catch block
    try {
      // Simulate real call. Since we don't have exact payload signing code for Deno here,
      // we return a controlled error instead of silently faking success, as per instructions.
      // E.g.
      // const response = await fetch(`${config.baseUrl}/v2/subscription/checkoutform/initialize`, {
      //   method: 'POST',
      //   headers: {
      //     'Accept': 'application/json',
      //     'Content-Type': 'application/json',
      //     'Authorization': 'IYZWS ... (Requires proper Crypto HMAC signature)'
      //   },
      //   body: JSON.stringify(requestBody)
      // });
      
      throw new Error("IYZICO_CRYPTO_NOT_IMPLEMENTED");
      
    } catch (error: any) {
      console.error("[iyzicoClient] Edge function fetch failed. Reason: ", error.message);
      // Return a controlled error instead of exposing secrets or faking success
      throw new Error("Could not create iyzico sandbox checkout session");
    }
  },

  verifyIyzicoSignatureV3: async (reqHeaders: Headers, payload: any) => {
    const signature = reqHeaders.get('x-iyz-signature-v3');
    const verifyMode = Deno.env.get('IYZICO_WEBHOOK_VERIFY_MODE');
    
    // Explicit internal backdoor for sandbox tests where we can't spoof headers exactly yet
    if (!signature && verifyMode === 'sandbox_bypass') {
      console.warn("[SECURITY] iyzico signature verification BYPASSED due to sandbox_bypass flag. Do not use in production!");
      return true;
    }

    if (!signature) {
      console.error("[SECURITY] Missing x-iyz-signature-v3 header.");
      return false;
    }

    const secretKey = iyzicoClient.getIyzicoConfig().secretKey || '';
    if (!secretKey) {
      console.error("[SECURITY] Cannot verify signature: IYZICO_SECRET_KEY missing from environment.");
      return false;
    }

    // Determine event format
    let message = '';
    if (payload.iyziEventType || payload.token) {
      message = iyzicoClient.buildHppWebhookSignaturePayload(payload, secretKey);
    } else {
      message = iyzicoClient.buildSubscriptionWebhookSignaturePayload(payload, secretKey);
    }

    const expectedSignature = await iyzicoClient.hmacSha256Hex(message, secretKey);
    
    const isValid = iyzicoClient.safeTimingEqual(expectedSignature, signature);
    if (!isValid) {
      console.error(`[SECURITY] Webhook signature verification failed. Computed: ${expectedSignature}, Received: ${signature}`);
    }
    return isValid;
  },

  mapIyzicoWebhookToInternalStatus: (payload: any) => {
    const iyzicoStatus = payload?.status || payload?.eventType; 
    // Usually iyzico events have an eventType, like 'subscription.created', 'subscription.active'
    
    if (iyzicoStatus?.includes('created') || iyzicoStatus?.includes('active') || iyzicoStatus === 'ACTIVE') {
      return 'active';
    }
    if (iyzicoStatus?.includes('failed') || iyzicoStatus === 'PAST_DUE' || iyzicoStatus === 'UNPAID') {
      return 'past_due';
    }
    if (iyzicoStatus?.includes('canceled') || iyzicoStatus === 'CANCELED') {
      return 'canceled';
    }
    
    return 'suspended';
  }
};
