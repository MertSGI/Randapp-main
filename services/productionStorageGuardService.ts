import { launchModeService, LaunchMode } from './launchModeService';
import { getDataSourceMode } from './dataSourceConfig';

export interface StorageGuardReport {
  launchMode: LaunchMode;
  dataSourceMode: string;
  isGuardViolated: boolean;
  hardBlockers: string[];
  warnings: string[];
  localOnlyDomains: string[];
}

export const productionStorageGuardService = {
  assertLiveDataSourceAllowed(): boolean {
    const launchMode = launchModeService.getCurrentLaunchMode();
    const dataMode = getDataSourceMode();

    if (launchMode === 'paymentless_limited_production' || launchMode === 'full_live_online_payment') {
      if (dataMode === 'local') {
        throw new Error(
          `SECURITY BREACH CRITICAL: Launch mode is "${launchMode}", but data mode is set to "local". Live tenant and customer data MUST NEVER be stored in localStorage. Configure Supabase immediately.`
        );
      }
    }
    return true;
  },

  isLocalStorageAllowedForDomain(domain: string): boolean {
    const launchMode = launchModeService.getCurrentLaunchMode();
    
    // In pre-live, demo, or pilot, local storage is fully allowed
    if (launchMode === 'local_pre_live' || launchMode === 'internal_demo' || launchMode === 'unpaid_manual_pilot') {
      return true;
    }

    // Prohibited domains for live modes
    const prohibitedDomains = [
      'tenants',
      'tenant_registration',
      'manual_provisioning',
      'appointments',
      'customers',
      'subscriptions',
      'billing',
      'self_service_tokens',
      'legal_acceptances',
      'consent_ledger',
      'data_rights_requests',
      'business_profile',
      'services_catalog',
      'staff',
      'availability'
    ];

    if (prohibitedDomains.includes(domain)) {
      if (launchMode === 'paymentless_limited_production' || launchMode === 'full_live_online_payment') {
        return false;
      }
    }

    // Demo/pilot fixture data is always allowed locally
    if (domain === 'pilot_fixtures' || domain === 'demo_fixtures') {
      return true;
    }

    return true;
  },

  getLiveStorageHardBlockers(): string[] {
    const launchMode = launchModeService.getCurrentLaunchMode();
    const dataMode = getDataSourceMode();
    const blockers: string[] = [];

    if (launchMode === 'paymentless_limited_production' || launchMode === 'full_live_online_payment') {
      if (dataMode === 'local') {
        blockers.push(`Canlı üretim ortamında ("${launchMode}") veri kaynağı modu "local" (localStorage) olamaz. Supabase kalıcı veritabanı kurulmalı ve bağlanmalıdır.`);
      }
    }
    return blockers;
  },

  getLocalOnlyDomains(): string[] {
    const domains: string[] = [];
    const launchMode = launchModeService.getCurrentLaunchMode();

    if (launchMode === 'paymentless_limited_production' || launchMode === 'limited_live_manual_billing') {
      // Domains that might temporarily fallback to local storage or be simulated in limited production
      domains.push('communication_outbox_logs');
      domains.push('support_tickets_cache');
      domains.push('background_job_runs');
      domains.push('media_asset_metadata_preview');
    }
    return domains;
  },

  getProductionStorageWarnings(): string[] {
    const warnings: string[] = [];
    const launchMode = launchModeService.getCurrentLaunchMode();

    if (launchMode === 'paymentless_limited_production') {
      warnings.push('İletişim giden kutusu, destek biletleri ve arkaplan iş kayıtları yerel tarayıcı hafızasında veya simülatörde çalışmaktadır.');
      warnings.push('Görsel/medya varlık yüklemeleri kalıcı depolama alanı bağlanana kadar geçici yerel önizleme sunar.');
    }
    return warnings;
  },

  createStorageGuardReport(): StorageGuardReport {
    const launchMode = launchModeService.getCurrentLaunchMode();
    const dataMode = getDataSourceMode();
    const hardBlockers = this.getLiveStorageHardBlockers();
    const warnings = this.getProductionStorageWarnings();
    const localOnlyDomains = this.getLocalOnlyDomains();

    return {
      launchMode,
      dataSourceMode: dataMode,
      isGuardViolated: hardBlockers.length > 0,
      hardBlockers,
      warnings,
      localOnlyDomains
    };
  }
};
