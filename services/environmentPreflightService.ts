import { LaunchMode } from './launchModeService';

export interface EnvSnapshot {
  launchMode: string;
  dataMode: string;
  paymentMode: string;
  communicationMode: string;
  publicBaseDomain: string;
  supabaseUrl: string;
  hasAnonKey: boolean;
  buildTimeSecretAuditStatus: string;
}

export interface ValidationResult {
  isValid: boolean;
  missingVars: string[];
  errors: string[];
}

export const environmentPreflightService = {
  getEnvironmentSnapshot(): EnvSnapshot {
    const env = (import.meta as any).env || {};

    return {
      launchMode: env.VITE_LAUNCH_MODE || 'local_pre_live',
      dataMode: env.VITE_DATA_MODE || 'local',
      paymentMode: env.VITE_PAYMENT_MODE || 'disabled',
      communicationMode: env.VITE_COMMUNICATION_MODE || 'local_outbox_only',
      publicBaseDomain: env.VITE_PUBLIC_BASE_DOMAIN || 'randevulari.com',
      supabaseUrl: env.VITE_SUPABASE_URL || '',
      hasAnonKey: !!env.VITE_SUPABASE_ANON_KEY,
      buildTimeSecretAuditStatus: 'Enforced by build-time QA (Staging Consistency Scanner)'
    };
  },

  validatePaymentlessProductionEnv(): ValidationResult {
    const snap = this.getEnvironmentSnapshot();
    const missingVars: string[] = [];
    const errors: string[] = [];

    if (snap.launchMode !== 'paymentless_limited_production') {
      errors.push(`VITE_LAUNCH_MODE is "${snap.launchMode}" instead of "paymentless_limited_production"`);
    }

    if (!snap.dataMode.startsWith('supabase')) {
      errors.push(`VITE_DATA_MODE is "${snap.dataMode}" which is not a persistent database mode. Must start with "supabase".`);
    }

    if (snap.paymentMode !== 'disabled') {
      errors.push(`VITE_PAYMENT_MODE is "${snap.paymentMode}" but online payment MUST be disabled in this mode.`);
    }

    if (snap.publicBaseDomain !== 'randevulari.com') {
      errors.push(`VITE_PUBLIC_BASE_DOMAIN is "${snap.publicBaseDomain}". It must be set to "randevulari.com" for Turkey live strategy.`);
    }

    if (!snap.supabaseUrl) {
      missingVars.push('VITE_SUPABASE_URL');
    }

    if (!snap.hasAnonKey) {
      missingVars.push('VITE_SUPABASE_ANON_KEY');
    }

    return {
      isValid: errors.length === 0 && missingVars.length === 0,
      missingVars,
      errors
    };
  },

  validateFullOnlinePaymentEnv(): ValidationResult {
    const snap = this.getEnvironmentSnapshot();
    const missingVars: string[] = [];
    const errors: string[] = [];

    if (snap.launchMode !== 'full_live_online_payment') {
      errors.push(`VITE_LAUNCH_MODE is "${snap.launchMode}" instead of "full_live_online_payment"`);
    }

    if (!snap.dataMode.startsWith('supabase')) {
      errors.push(`VITE_DATA_MODE is "${snap.dataMode}". Persistent database is required.`);
    }

    if (snap.paymentMode === 'disabled') {
      errors.push('VITE_PAYMENT_MODE is disabled but must be active for online payments.');
    }

    if (!snap.supabaseUrl) {
      missingVars.push('VITE_SUPABASE_URL');
    }

    if (!snap.hasAnonKey) {
      missingVars.push('VITE_SUPABASE_ANON_KEY');
    }

    return {
      isValid: errors.length === 0 && missingVars.length === 0,
      missingVars,
      errors
    };
  },

  validateLocalPreLiveEnv(): ValidationResult {
    const snap = this.getEnvironmentSnapshot();
    const missingVars: string[] = [];
    const errors: string[] = [];

    if (snap.launchMode !== 'local_pre_live' && snap.launchMode !== 'internal_demo') {
      errors.push(`VITE_LAUNCH_MODE is "${snap.launchMode}", which is not a local/demo mode.`);
    }

    return {
      isValid: errors.length === 0 && missingVars.length === 0,
      missingVars,
      errors
    };
  },

  listMissingEnvVarsForMode(mode: LaunchMode | string): string[] {
    const env = (import.meta as any).env || {};
    const missing: string[] = [];

    if (mode === 'paymentless_limited_production') {
      if (!env.VITE_LAUNCH_MODE) missing.push('VITE_LAUNCH_MODE');
      if (!env.VITE_DATA_MODE) missing.push('VITE_DATA_MODE');
      if (!env.VITE_SUPABASE_URL) missing.push('VITE_SUPABASE_URL');
      if (!env.VITE_SUPABASE_ANON_KEY) missing.push('VITE_SUPABASE_ANON_KEY');
      if (!env.VITE_PUBLIC_BASE_DOMAIN) missing.push('VITE_PUBLIC_BASE_DOMAIN');
    } else if (mode === 'full_live_online_payment') {
      if (!env.VITE_LAUNCH_MODE) missing.push('VITE_LAUNCH_MODE');
      if (!env.VITE_DATA_MODE) missing.push('VITE_DATA_MODE');
      if (!env.VITE_SUPABASE_URL) missing.push('VITE_SUPABASE_URL');
      if (!env.VITE_SUPABASE_ANON_KEY) missing.push('VITE_SUPABASE_ANON_KEY');
      if (!env.VITE_PAYMENT_MODE) missing.push('VITE_PAYMENT_MODE');
    }

    return missing;
  },

  getEnvPreflightSummary() {
    const snap = this.getEnvironmentSnapshot();
    const paylessRes = this.validatePaymentlessProductionEnv();
    const onlineRes = this.validateFullOnlinePaymentEnv();

    return {
      snapshot: snap,
      paymentlessProductionReady: paylessRes.isValid,
      paymentlessErrors: paylessRes.errors,
      paymentlessMissingVars: paylessRes.missingVars,
      onlinePaymentReady: onlineRes.isValid,
      onlineErrors: onlineRes.errors,
      unsafeVars: []
    };
  }
};
