import { PricingPlan } from '../services/planService';

export type PaymentMode = 'mock' | 'sandbox' | 'production';

export type CtaActionType = 
  | 'request_demo'
  | 'whatsapp_demo'
  | 'talk_to_sales'
  | 'start_trial'
  | 'choose_plan'
  | 'subscribe'
  | 'continue_checkout'
  | 'manage_subscription'
  | 'current_plan'
  | 'unavailable';

export interface CtaConfig {
  label: string;
  actionType: CtaActionType;
  disabled: boolean;
  safetyMessage?: string;
}

interface PaymentCtaResolverParams {
  paymentMode: PaymentMode;
  plan: PricingPlan;
  currentSubscriptionPlanId?: string;
  subscriptionStatus?: 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired' | 'none';
  language: 'tr' | 'en';
}

export const resolvePaymentCta = ({
  paymentMode,
  plan,
  currentSubscriptionPlanId,
  subscriptionStatus = 'none',
  language
}: PaymentCtaResolverParams): CtaConfig => {
  const isCurrentPlan = currentSubscriptionPlanId === plan.id;
  const isMock = paymentMode === 'mock';

  if (!plan.isActive) {
    return {
      label: language === 'tr' ? 'Seçilemez' : 'Unavailable',
      actionType: 'unavailable',
      disabled: true
    };
  }

  if (isCurrentPlan) {
    return {
      label: language === 'tr' ? 'Mevcut Paketiniz' : 'Current Plan',
      actionType: 'current_plan',
      disabled: true
    };
  }

  // Enterprise/Custom plans usually bypass self-serve checkout
  if (plan.id === 'custom' || plan.id === 'enterprise') {
    return {
      label: language === 'tr' ? 'Satışla Görüş' : 'Talk to Sales',
      actionType: 'talk_to_sales',
      disabled: false
    };
  }

  // Treat plans with trialDays > 0 as trial enabled implicitly.
  if (plan.trialDays !== undefined && plan.trialDays > 0) {
    return {
      label: language === 'tr' ? `${plan.trialDays} Gün Ücretsiz Dene` : `Start ${plan.trialDays}-Day Free Trial`,
      actionType: 'start_trial',
      disabled: false,
      safetyMessage: isMock 
          ? (language === 'tr' ? `${plan.trialDays} günlük ücretsiz deneme sonunda seçtiğiniz planla devam edersiniz.` : `After your ${plan.trialDays}-day free trial, you will continue with your selected plan.`)
          : (language === 'tr' ? 'Kart bilgileriniz güvenli ödeme altyapısı üzerinden işlenir.' : 'Your card information is processed via a secure payment infrastructure.')
    };
  }

  return {
    label: language === 'tr' ? 'Paketi Seç' : 'Choose Plan',
    actionType: 'choose_plan',
    disabled: false,
    safetyMessage: isMock 
        ? (language === 'tr' ? 'Dilediğiniz zaman aboneliğinizi iptal edebilirsiniz.' : 'You can cancel your subscription at any time.')
        : ''
  };
};
