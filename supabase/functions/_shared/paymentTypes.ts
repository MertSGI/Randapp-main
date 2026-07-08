export interface CreateCheckoutSessionRequest {
  tenantId: string;
  planId: 'starter' | 'professional' | 'premium';
  successUrl: string;
  cancelUrl: string;
}

export interface CreateCheckoutSessionResponse {
  checkoutUrl: string;
  provider: string;
  sessionId: string;
}

export interface CreateBillingPortalSessionRequest {
  tenantId: string;
  returnUrl: string;
}

export interface CreateBillingPortalSessionResponse {
  portalUrl: string;
  provider?: string;
  note?: string;
}
