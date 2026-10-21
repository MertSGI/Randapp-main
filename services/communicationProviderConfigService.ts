import { getDataSourceMode } from './dataSourceConfig';

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

function resolveEnv(): Record<string, any> {
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any)?.env) {
      return (import.meta as any).env;
    }
  } catch {
    // ignore
  }
  try {
    if (typeof globalThis !== 'undefined' && (globalThis as any)?.import?.meta?.env) {
      return (globalThis as any).import.meta.env;
    }
  } catch {
    // ignore
  }
  try {
    if (typeof process !== 'undefined' && process?.env) {
      return process.env;
    }
  } catch {
    // ignore
  }
  return {};
}

function isPersistentMode(): boolean {
  try {
    if (getDataSourceMode() === 'supabase') return true;
  } catch {
    // fallback
  }
  const env = resolveEnv();
  const mode = env.VITE_DATA_MODE || env.VITE_LARI_DATA_SOURCE;
  return mode === 'supabase' || mode === 'supabase_staging' || mode === 'supabase_production';
}

const DEFAULT_CONFIG: CommunicationProviderConfig = {
  mode: 'local_outbox_only',
  emailProvider: 'mock',
  whatsappProvider: 'mock',
  smsProvider: 'mock',
  fromEmail: 'bilgi@randevulari.com',
  supportEmail: 'destek@randevulari.com'
};

export const communicationProviderConfigService = {
  getConfig(): CommunicationProviderConfig {
    if (typeof window !== 'undefined' && window.localStorage) {
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
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    }
    return updated;
  },

  isProviderActive(channel: 'email' | 'whatsapp' | 'sms'): boolean {
    // Fail closed: In persistent/Supabase mode or client browser without server attestation,
    // external live provider delivery is strictly false.
    if (isPersistentMode()) {
      return false;
    }

    // Client localStorage or VITE_COMMUNICATION_MODE cannot grant real external provider delivery authority.
    return false;
  }
};
