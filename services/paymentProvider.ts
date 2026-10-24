/**
 * This file serves as an abstraction layer for payment providers.
 * 
 * IMPORTANT:
 * - Real provider integrations MUST run server-side (e.g., Supabase Edge Functions).
 * - NOT in the client/frontend.
 * - Non-connected client-side adapters return typed disabled errors with NO checkout URLs or session IDs.
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

export const PAYMENT_DISABLED_ERROR = 'PAYMENT_PROVIDER_NOT_CONFIGURED';

/**
 * Stripe Provider Adapter
 * Real integration must be implemented in a Supabase Edge Function.
 * Client adapter fails closed with no fake URLs or session IDs.
 */
export const stripeProvider: IPaymentProvider = {
  async createCheckoutSession(_tenantId: string, _planId: string): Promise<CheckoutSessionResult> {
    console.warn("stripeProvider.createCheckoutSession must be called server-side.");
    return { error: PAYMENT_DISABLED_ERROR };
  },
  async createBillingPortalSession(_tenantId: string): Promise<BillingPortalResult> {
    console.warn("stripeProvider.createBillingPortalSession must be called server-side.");
    return { error: PAYMENT_DISABLED_ERROR };
  },
  async handleWebhook(_event: any): Promise<void> {
    console.warn("handleWebhook MUST be processed in backend (Edge Function).");
  }
};

/**
 * iyzico Provider Adapter
 * Real integration must be implemented in a Supabase Edge Function.
 * Client adapter fails closed with no fake URLs or session IDs.
 */
export const iyzicoProvider: IPaymentProvider = {
  async createCheckoutSession(_tenantId: string, _planId: string): Promise<CheckoutSessionResult> {
    console.warn("iyzicoProvider.createCheckoutSession must be called server-side.");
    return { error: PAYMENT_DISABLED_ERROR };
  },
  async createBillingPortalSession(_tenantId: string): Promise<BillingPortalResult> {
    console.warn("iyzicoProvider.createBillingPortalSession must be called server-side.");
    return { error: PAYMENT_DISABLED_ERROR };
  },
  async handleWebhook(_event: any): Promise<void> {
    console.warn("handleWebhook MUST be processed in backend (Edge Function).");
  }
};

/**
 * Param Provider Adapter
 * Real integration must be implemented in a Supabase Edge Function.
 * Client adapter fails closed with no fake URLs or session IDs.
 */
export const paramProvider: IPaymentProvider = {
  async createCheckoutSession(_tenantId: string, _planId: string): Promise<CheckoutSessionResult> {
    console.warn("paramProvider.createCheckoutSession must be called server-side.");
    return { error: PAYMENT_DISABLED_ERROR };
  },
  async createBillingPortalSession(_tenantId: string): Promise<BillingPortalResult> {
    console.warn("paramProvider.createBillingPortalSession must be called server-side.");
    return { error: PAYMENT_DISABLED_ERROR };
  },
  async handleWebhook(_event: any): Promise<void> {
    console.warn("handleWebhook MUST be processed in backend (Edge Function).");
  }
};
