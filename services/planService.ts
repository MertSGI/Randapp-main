import { createSuccess, createError, MutationResult } from '../utils/mutationResult';
import { TRIAL_CONFIG } from './trialConfigService';

export interface PricingPlan {
  id: string;
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  annualDiscountPercent: number;
  setupFee: number;
  currency: string;
  maxStaff: number;
  maxServices: number;
  maxMonthlyAppointments: number;
  customDomainEnabled: boolean;
  includedSubdomain: boolean;
  customComDomainIncluded: boolean;
  multiBranchEnabled: boolean;
  maxBranches: number;
  aiRecommendationsEnabled: boolean;
  aiVisualizationEnabled: boolean;
  aiMonthlyQuota: number;
  campaignsEnabled: boolean;
  advancedReportsEnabled: boolean;
  whatsappAutomationEnabled: boolean;
  googleCalendarEnabled: boolean;
  supportLevel: 'standard' | 'priority' | 'dedicated';
  referralEligible: boolean;
  isActive: boolean;
  isRecommended: boolean;
  trialDays: number;
  iyzicoProductReferenceCode?: string;
  iyzicoPlanReferenceCodeMonthly?: string;
  iyzicoPlanReferenceCodeAnnual?: string;
}

export type BillingPeriod = 'monthly' | 'annual';

export const DEFAULT_PLANS: Record<string, PricingPlan> = {
  baslangic: {
    id: 'baslangic',
    name: 'Başlangıç',
    monthlyPrice: 1490,
    annualPrice: 1490 * 12 * 0.8, // 20% discount
    annualDiscountPercent: 20,
    setupFee: 0,
    currency: 'TRY',
    maxStaff: 1,
    maxServices: 10,
    maxMonthlyAppointments: 9999, // Essentially unlimited for solo
    customDomainEnabled: false,
    includedSubdomain: true,
    customComDomainIncluded: false,
    multiBranchEnabled: false,
    maxBranches: 1,
    aiRecommendationsEnabled: false,
    aiVisualizationEnabled: false,
    aiMonthlyQuota: 0,
    campaignsEnabled: false,
    advancedReportsEnabled: false,
    whatsappAutomationEnabled: false,
    googleCalendarEnabled: true,
    supportLevel: 'standard',
    referralEligible: false,
    isActive: true,
    isRecommended: false,
    trialDays: TRIAL_CONFIG.trialDayCount,
    iyzicoProductReferenceCode: 'prod_baslangic',
    iyzicoPlanReferenceCodeMonthly: 'plan_baslangic_monthly',
    iyzicoPlanReferenceCodeAnnual: 'plan_baslangic_annual'
  },
  standart: {
    id: 'standart',
    name: 'Standart',
    monthlyPrice: 2490,
    annualPrice: 2490 * 12 * 0.8, // 20% discount
    annualDiscountPercent: 20,
    setupFee: 0,
    currency: 'TRY',
    maxStaff: 3,
    maxServices: 25,
    maxMonthlyAppointments: 9999,
    customDomainEnabled: false,
    includedSubdomain: true,
    customComDomainIncluded: false,
    multiBranchEnabled: false,
    maxBranches: 1,
    aiRecommendationsEnabled: true, // basic
    aiVisualizationEnabled: false,
    aiMonthlyQuota: 100,
    campaignsEnabled: false, // As per doc
    advancedReportsEnabled: false,
    whatsappAutomationEnabled: false,
    googleCalendarEnabled: true,
    supportLevel: 'standard',
    referralEligible: false,
    isActive: true,
    isRecommended: false,
    trialDays: TRIAL_CONFIG.trialDayCount,
    iyzicoProductReferenceCode: 'prod_standart',
    iyzicoPlanReferenceCodeMonthly: 'plan_standart_monthly',
    iyzicoPlanReferenceCodeAnnual: 'plan_standart_annual'
  },
  professional: {
    id: 'professional',
    name: 'Profesyonel',
    monthlyPrice: 3490,
    annualPrice: 3490 * 12 * 0.8,
    annualDiscountPercent: 20,
    setupFee: 0,
    currency: 'TRY',
    maxStaff: 8,
    maxServices: 60,
    maxMonthlyAppointments: 99999,
    customDomainEnabled: false,
    includedSubdomain: true,
    customComDomainIncluded: false,
    multiBranchEnabled: false,
    maxBranches: 1,
    aiRecommendationsEnabled: true, // full
    aiVisualizationEnabled: true,
    aiMonthlyQuota: 500,
    campaignsEnabled: true,
    advancedReportsEnabled: true,
    whatsappAutomationEnabled: false,
    googleCalendarEnabled: true,
    supportLevel: 'priority',
    referralEligible: true,
    isActive: true,
    isRecommended: true,
    trialDays: TRIAL_CONFIG.trialDayCount,
    iyzicoProductReferenceCode: 'prod_professional',
    iyzicoPlanReferenceCodeMonthly: 'plan_professional_monthly',
    iyzicoPlanReferenceCodeAnnual: 'plan_professional_annual'
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    monthlyPrice: 4990,
    annualPrice: 4990 * 12 * 0.8,
    annualDiscountPercent: 20,
    setupFee: 0,
    currency: 'TRY',
    maxStaff: 20, // max 20
    maxServices: 200,
    maxMonthlyAppointments: 99999,
    customDomainEnabled: true, // manual add-on
    includedSubdomain: true,
    customComDomainIncluded: false,
    multiBranchEnabled: false,
    maxBranches: 1,
    aiRecommendationsEnabled: true,
    aiVisualizationEnabled: true,
    aiMonthlyQuota: 2000,
    campaignsEnabled: true,
    advancedReportsEnabled: true,
    whatsappAutomationEnabled: true,
    googleCalendarEnabled: true,
    supportLevel: 'dedicated',
    referralEligible: true,
    isActive: true,
    isRecommended: false,
    trialDays: TRIAL_CONFIG.trialDayCount,
    iyzicoProductReferenceCode: 'prod_premium',
    iyzicoPlanReferenceCodeMonthly: 'plan_premium_monthly',
    iyzicoPlanReferenceCodeAnnual: 'plan_premium_annual'
  },
  kurumsal: {
    id: 'kurumsal',
    name: 'Kurumsal',
    monthlyPrice: 0, // Custom pricing flag
    annualPrice: 0,
    annualDiscountPercent: 0,
    setupFee: 0,
    currency: 'TRY',
    maxStaff: 999,
    maxServices: 999,
    maxMonthlyAppointments: 999999,
    customDomainEnabled: true,
    includedSubdomain: true,
    customComDomainIncluded: true,
    multiBranchEnabled: true,
    maxBranches: 999,
    aiRecommendationsEnabled: true,
    aiVisualizationEnabled: true,
    aiMonthlyQuota: 9999,
    campaignsEnabled: true,
    advancedReportsEnabled: true,
    whatsappAutomationEnabled: true,
    googleCalendarEnabled: true,
    supportLevel: 'dedicated',
    referralEligible: true,
    isActive: true,
    isRecommended: false,
    trialDays: 0,
    iyzicoProductReferenceCode: 'prod_kurumsal',
    iyzicoPlanReferenceCodeMonthly: 'plan_kurumsal_monthly',
    iyzicoPlanReferenceCodeAnnual: 'plan_kurumsal_annual'
  }
};

export const planService = {
  getStoredPlans(): Record<string, PricingPlan> {
    const raw = localStorage.getItem('randapp_plans');
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch(e) {}
    }
    return JSON.parse(JSON.stringify(DEFAULT_PLANS));
  },
  savePlanInfos(plans: Record<string, PricingPlan>) {
    localStorage.setItem('randapp_plans', JSON.stringify(plans));
  },
  getAllPlans(): PricingPlan[] {
    return Object.values(this.getStoredPlans());
  },
  getActivePlans(): PricingPlan[] {
    return this.getAllPlans().filter(p => p.isActive !== false);
  },
  getPlan(planId: string): PricingPlan | undefined {
    return this.getStoredPlans()[planId];
  },
  updatePlan(planId: string, updates: Partial<PricingPlan>): Promise<MutationResult<void>> {
    return new Promise((resolve) => {
      const plans = this.getStoredPlans();
      if(plans[planId]) {
         plans[planId] = { ...plans[planId], ...updates };
         this.savePlanInfos(plans);
         resolve(createSuccess('updated'));
      } else {
         resolve(createError('updated', 'action_failed'));
      }
    });
  },
  addPlan(plan: PricingPlan): Promise<MutationResult<void>> {
    return new Promise((resolve) => {
      const plans = this.getStoredPlans();
      plans[plan.id] = plan;
      this.savePlanInfos(plans);
      resolve(createSuccess('created'));
    });
  },
  deletePlan(planId: string): Promise<MutationResult<void>> {
    return new Promise((resolve) => {
      const plans = this.getStoredPlans();
      
      if (!plans[planId]) {
         return resolve(createError('deleted', 'action_failed'));
      }
      
      // Default plans shouldn't be hard-deleted as they may break mock dependencies
      if (['starter', 'professional', 'premium'].includes(planId)) {
        plans[planId].isActive = false;
        this.savePlanInfos(plans);
        return resolve(createSuccess('deactivated'));
      }

      delete plans[planId];
      this.savePlanInfos(plans);
      resolve(createSuccess('deleted'));
    });
  },
  calculatePlanPrice(planId: string, billingPeriod: BillingPeriod): number {
    const plan = this.getPlan(planId);
    if (!plan) return 0;
    return billingPeriod === 'annual' ? plan.annualPrice : plan.monthlyPrice;
  }
};
