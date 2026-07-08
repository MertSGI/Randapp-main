import { marketConfigService, MarketId } from './marketConfigService';

export type PaymentProviderType = 'iyzico' | 'provider_agnostic' | 'stripe_ready_placeholder';

export interface PaymentProviderConfig {
  provider: PaymentProviderType;
  supportsRecurring: boolean;
  supportsSavedCards: boolean;
  requiresKvkkApproval: boolean;
  requiresGdprApproval: boolean;
  supportsInstallments: boolean;
  defaultCurrency: string;
}

const providerConfigs: Record<MarketId, PaymentProviderConfig> = {
  tr: {
    provider: 'iyzico',
    supportsRecurring: true,
    supportsSavedCards: true,
    requiresKvkkApproval: true,
    requiresGdprApproval: false,
    supportsInstallments: true,
    defaultCurrency: 'TRY',
  },
  global: {
    provider: 'provider_agnostic',
    supportsRecurring: true,
    supportsSavedCards: true,
    requiresKvkkApproval: false,
    requiresGdprApproval: true,
    supportsInstallments: false,
    defaultCurrency: 'USD',
  }
};

export const paymentProviderConfigService = {
  getCurrentProviderConfig(): PaymentProviderConfig {
    const market = marketConfigService.getCurrentMarketConfig().marketId;
    return providerConfigs[market];
  },

  getProviderName(): string {
    return this.getCurrentProviderConfig().provider;
  },

  requiresKvkk(): boolean {
    return this.getCurrentProviderConfig().requiresKvkkApproval;
  },

  requiresGdpr(): boolean {
    return this.getCurrentProviderConfig().requiresGdprApproval;
  }
};
