import { marketConfigService, MarketId } from './marketConfigService';
import type { RunModeStatus } from './paymentRunModeService';

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

export interface ProviderServerAuthorityContract {
  provider: PaymentProviderType;
  webhookSignatureHeader: string;
  signatureAlgorithm: 'hmac-sha256-v3' | 'hmac-sha256';
  isServerWebhookVerificationRequired: true;
  clientAuthorizationAllowed: false;
}

export interface ProviderOperationalContract {
  provider: PaymentProviderType;
  providerName: string;
  mode: RunModeStatus['mode'];
  isLiveAuthorized: false;
  canCollectRealPayments: false;
  providerInteroperability: 'EXTERNAL_PROVIDER_VERIFICATION_PENDING';
  serverAttestationRequired: true;
  signatureVerificationRequired: true;
  authority: ProviderServerAuthorityContract;
  blockers: string[];
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
  getServerAuthorityContract(provider?: PaymentProviderType): ProviderServerAuthorityContract {
    const resolvedProvider = provider || this.getCurrentProviderConfig().provider;
    if (resolvedProvider === 'iyzico') {
      return {
        provider: 'iyzico',
        webhookSignatureHeader: 'x-iyz-signature-v3',
        signatureAlgorithm: 'hmac-sha256-v3',
        isServerWebhookVerificationRequired: true,
        clientAuthorizationAllowed: false
      };
    }
    if (resolvedProvider === 'stripe_ready_placeholder') {
      return {
        provider: 'stripe_ready_placeholder',
        webhookSignatureHeader: 'stripe-signature',
        signatureAlgorithm: 'hmac-sha256',
        isServerWebhookVerificationRequired: true,
        clientAuthorizationAllowed: false
      };
    }
    return {
      provider: 'provider_agnostic',
      webhookSignatureHeader: 'x-webhook-signature',
      signatureAlgorithm: 'hmac-sha256',
      isServerWebhookVerificationRequired: true,
      clientAuthorizationAllowed: false
    };
  },

  getProviderOperationalContract(runModeStatus: RunModeStatus): ProviderOperationalContract {
    const config = this.getCurrentProviderConfig();
    const authority = this.getServerAuthorityContract(config.provider);
    const blockers = [...(runModeStatus?.missingBlockers || [])];
    if (!runModeStatus?.isPaymentCollectionAuthorized) {
      blockers.push('Gerçek tahsilat yetkisi istemci üzerinden verilemez; sunucu doğrulaması gereklidir.');
    }

    return {
      provider: config.provider,
      providerName: this.getProviderName(),
      mode: runModeStatus.mode,
      isLiveAuthorized: false,
      canCollectRealPayments: false,
      providerInteroperability: 'EXTERNAL_PROVIDER_VERIFICATION_PENDING',
      serverAttestationRequired: true,
      signatureVerificationRequired: true,
      authority,
      blockers
    };
  },

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
