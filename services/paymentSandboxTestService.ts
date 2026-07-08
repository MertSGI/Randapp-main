// Phase 9D — Sandbox Checkout Test Harness
// Documents and provides sandbox testing utility functions. No real UI dependency, 
// just for Super Admin testing.

import { subscriptionService } from "./subscriptionService";
import { planService } from "./planService";

export const paymentSandboxTestService = {
  // Test Case 1 & 2: Checkout session start behavior
  async testCheckoutSession(planId: string, tenantId?: string) {
     const tId = tenantId || 'sandbox-tenant-123';
     if (!tId) return { success: false, message: 'No tenant' };
     
     try {
       const result = await subscriptionService.startCheckout(tId, planId);
       return { success: true, result, message: 'Successfully initiated checkout flow.' };
     } catch (error: any) {
       return { 
           success: false, 
           error: error.message, 
           isConfigError: error.errorCode === 'SANDBOX_NOT_CONFIGURED',
           details: error.raw 
       };
     }
  },

  // Test Case 3 & 4: Validate plan reference codes locally
  validatePlanReferenceCodes(planId: string) {
     const plans = planService.getAllPlans();
     const plan = plans.find(p => p.id === planId);
     
     if (!plan) return { valid: false, message: 'Plan not found' };

     const missing: string[] = [];
     if (!plan.iyzicoProductReferenceCode) missing.push('iyzicoProductReferenceCode');
     if (!plan.iyzicoPlanReferenceCodeMonthly) missing.push('iyzicoPlanReferenceCodeMonthly');
     if (!plan.iyzicoPlanReferenceCodeAnnual) missing.push('iyzicoPlanReferenceCodeAnnual');

     if (missing.length > 0) {
         return { valid: false, message: 'Missing reference codes', missing };
     }

     return { valid: true, message: 'Plan reference codes are fully configured.' };
  }
};
