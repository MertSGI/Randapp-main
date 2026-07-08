export const planMapping = {
  starter: {
    iyzicoPricingPlanReferenceCode: Deno.env.get('IYZICO_PLAN_STARTER_REF') || 'plan_starter_reference',
    name: 'Starter',
    price: 499
  },
  professional: {
    iyzicoPricingPlanReferenceCode: Deno.env.get('IYZICO_PLAN_PROFESSIONAL_REF') || 'plan_professional_reference',
    name: 'Professional',
    price: 999
  },
  premium: {
    iyzicoPricingPlanReferenceCode: Deno.env.get('IYZICO_PLAN_PREMIUM_REF') || 'plan_premium_reference',
    name: 'Premium',
    price: 1999
  }
};

export function getPlanDetails(planId: string) {
  return (planMapping as any)[planId] || planMapping.professional;
}

// Map iyzico status to our internal SubscriptionStatus
export function mapIyzicoStatus(iyzicoStatus: string): 'active' | 'past_due' | 'canceled' | 'suspended' {
  switch (iyzicoStatus) {
    case 'ACTIVE':
      return 'active';
    case 'PAST_DUE':
    case 'UNPAID':
      return 'past_due';
    case 'CANCELED':
      return 'canceled';
    case 'SUSPENDED':
      return 'suspended';
    default:
      return 'suspended';
  }
}
