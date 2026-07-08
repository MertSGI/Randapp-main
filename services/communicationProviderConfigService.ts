export type ProviderMode = 
  | 'local_outbox_only'
  | 'email_provider_ready'
  | 'whatsapp_provider_ready'
  | 'sms_provider_ready';

export interface CommunicationProviderConfig {
  mode: ProviderMode;
  emailProvider?: 'mock' | 'sendgrid' | 'ses' | 'smtp';
  whatsappProvider?: 'mock' | 'whatsapp_business_api' | 'twilio';
  smsProvider?: 'mock' | 'twilio' | 'netgsm' | 'interakt';
  fromEmail: string;
  supportEmail: string;
}

const STORAGE_KEY = 'lari_communication_provider_config';

const DEFAULT_CONFIG: CommunicationProviderConfig = {
  mode: (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_COMMUNICATION_MODE as any) || 'local_outbox_only',
  emailProvider: 'mock',
  whatsappProvider: 'mock',
  smsProvider: 'mock',
  fromEmail: 'bilgi@randevulari.com',
  supportEmail: 'destek@randevulari.com'
};

export const communicationProviderConfigService = {
  getConfig(): CommunicationProviderConfig {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch (e) {
          console.error("Failed to parse provider config", e);
        }
      }
    }
    return DEFAULT_CONFIG;
  },

  updateConfig(patch: Partial<CommunicationProviderConfig>): CommunicationProviderConfig {
    const current = this.getConfig();
    const updated = { ...current, ...patch };
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    }
    return updated;
  },

  isProviderActive(channel: 'email' | 'whatsapp' | 'sms'): boolean {
    const config = this.getConfig();
    if (config.mode === 'local_outbox_only') {
      return false;
    }
    if (channel === 'email' && config.mode === 'email_provider_ready') return true;
    if (channel === 'whatsapp' && config.mode === 'whatsapp_provider_ready') return true;
    if (channel === 'sms' && config.mode === 'sms_provider_ready') return true;
    return false;
  }
};
