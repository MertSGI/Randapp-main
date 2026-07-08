/**
 * This file serves as an abstraction layer for payment providers.
 * 
 * IMPORTANT:
 * - Real provider integrations MUST run server-side (e.g., Supabase Edge Functions).
 * - NOT in the client/frontend.
 * - This file only visualizes the future interface for standardizing multi-provider support.
 */

export interface CheckoutSessionResult {
  url?: string;
  sessionId?: string;
  error?: string;
}

export interface BillingPortalResult {
  url?: string;
  error?: string;
}

export interface IPaymentProvider {
  createCheckoutSession(tenantId: string, planId: string): Promise<CheckoutSessionResult>;
  createBillingPortalSession(tenantId: string): Promise<BillingPortalResult>;
  handleWebhook(event: any): Promise<void>; 
}

/**
 * Placeholder for Stripe Provider
 * Real integration must be implemented in a Supabase Edge Function!
 */
export const stripeProvider: IPaymentProvider = {
  async createCheckoutSession(tenantId, planId) {
    console.warn("stripeProvider.createCheckoutSession must be called server-side.");
    return { url: 'https://sandbox.stripe.com/demo/checkout' };
  },
  async createBillingPortalSession(tenantId) {
    console.warn("stripeProvider.createBillingPortalSession must be called server-side.");
    return { url: 'https://sandbox.stripe.com/demo/portal' };
  },
  async handleWebhook(event) {
    console.warn("handleWebhook MUST be processed in backend (Edge Function).");
  }
};

/**
 * Placeholder for iyzico Provider
 * Real integration must be implemented in a Supabase Edge Function!
 */
export const iyzicoProvider: IPaymentProvider = {
  async createCheckoutSession(tenantId, planId) {
    console.warn("iyzicoProvider.createCheckoutSession must be called server-side.");
    return { url: 'https://sandbox-api.iyzipay.com/demo/checkout' };
  },
  async createBillingPortalSession(tenantId) {
    console.warn("iyzicoProvider.createBillingPortalSession is often custom built or not a standard feature.");
    return { error: 'Not implemented in mock' };
  },
  async handleWebhook(event) {
    console.warn("handleWebhook MUST be processed in backend (Edge Function).");
  }
};

/**
 * Placeholder for Param Provider
 * Real integration must be implemented in a Supabase Edge Function!
 */
export const paramProvider: IPaymentProvider = {
  async createCheckoutSession(tenantId, planId) {
    console.warn("paramProvider.createCheckoutSession must be called server-side.");
    return { url: 'https://test-api.param.com.tr/demo/checkout' };
  },
  async createBillingPortalSession(tenantId) {
    console.warn("paramProvider.createBillingPortalSession must be called server-side.");
    return { error: 'Not implemented in mock' };
  },
  async handleWebhook(event) {
    console.warn("handleWebhook MUST be processed in backend (Edge Function).");
  }
};
