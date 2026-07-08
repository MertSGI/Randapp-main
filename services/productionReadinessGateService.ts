import { launchModeService, LaunchMode } from './launchModeService';

export interface ReadinessGateResult {
  mode: LaunchMode;
  canLaunch: boolean;
  hardBlockers: string[];
  warnings: string[];
  requiredInfra: string[];
  mustNotClaim: string[];
}

export const productionReadinessGateService = {
  getEnvState() {
    const env = (import.meta as any).env || {};
    
    // Check if persistent database parameters are present and data mode is not local
    const dataMode = env.VITE_DATA_MODE || 'local';
    const hasPersistentDb = 
      (dataMode === 'supabase_staging' || dataMode === 'supabase_production' || dataMode === 'supabase') &&
      !!env.VITE_SUPABASE_URL && 
      !!env.VITE_SUPABASE_ANON_KEY;

    // Check if domain and SSL are ready (requires https and a valid custom production url in VITE_APP_BASE_URL)
    const baseUrl = env.VITE_APP_BASE_URL || '';
    const hasDnsSsl = baseUrl.startsWith('https://') && baseUrl.includes(env.VITE_PUBLIC_BASE_DOMAIN || 'randevulari.com');

    // Check payment mode and secrets
    const paymentMode = env.VITE_PAYMENT_MODE || 'disabled';
    const hasIyzico = paymentMode !== 'disabled';

    // Check communication mode
    const commMode = env.VITE_COMMUNICATION_MODE || 'local_outbox_only';
    const hasSms = commMode === 'sms_provider_ready' || commMode === 'whatsapp_provider_ready';

    // RLS applied flag
    const rlsVerified = env.VITE_SUPABASE_RLS_VERIFIED === 'true';

    // Auth mode configured flag
    const authConfigured = env.VITE_AUTH_MODE === 'supabase_auth' || !!env.VITE_SUPABASE_URL;

    // Repositories production-ready flags
    const tenantRegReady = env.VITE_TENANT_REG_REPO_READY === 'true';
    const manualProvReady = env.VITE_MANUAL_PROV_REPO_READY === 'true';
    const appRepoReady = env.VITE_APPOINTMENT_REPO_READY === 'true';
    const billingRepoReady = env.VITE_BILLING_REPO_READY === 'true';
    const tokenStorageReady = env.VITE_TOKEN_STORAGE_READY === 'true';
    const businessProfileRepoReady = env.VITE_BUSINESS_PROFILE_REPO_READY === 'true';
    const servicesCatalogRepoReady = env.VITE_SERVICES_CATALOG_REPO_READY === 'true';
    const staffRepoReady = env.VITE_STAFF_REPO_READY === 'true';
    const availabilityRepoReady = env.VITE_AVAILABILITY_REPO_READY === 'true';
    const customerRepoReady = env.VITE_CUSTOMER_REPO_READY === 'true';

    // Operations verified flags
    const backupPlanVerified = env.VITE_BACKUP_PLAN_VERIFIED === 'true';
    const routeSmokeTestPassed = env.VITE_ROUTE_SMOKE_TEST_PASSED === 'true';

    return {
      dataMode,
      hasPersistentDb,
      hasDnsSsl,
      hasIyzico,
      hasSms,
      rlsVerified,
      authConfigured,
      tenantRegReady,
      manualProvReady,
      appRepoReady,
      billingRepoReady,
      tokenStorageReady,
      businessProfileRepoReady,
      servicesCatalogRepoReady,
      staffRepoReady,
      availabilityRepoReady,
      customerRepoReady,
      backupPlanVerified,
      routeSmokeTestPassed,
      mediaStorageConnected: env.VITE_MEDIA_STORAGE_CONNECTED === 'true',
      externalMonitoringEnabled: env.VITE_EXTERNAL_MONITORING_ENABLED === 'true',
      backgroundSchedulerReady: env.VITE_BACKGROUND_SCHEDULER_READY === 'true'
    };
  },

  listHardBlockers(mode: LaunchMode): string[] {
    const envState = this.getEnvState();
    const blockers: string[] = [];

    if (mode === 'paymentless_limited_production' || mode === 'full_live_online_payment') {
      if (envState.dataMode === 'local' || envState.dataMode === 'mock') {
        blockers.push('Kalıcı (persistent) veritabanı aktif değil. VITE_DATA_MODE "supabase_staging" veya "supabase_production" olmalı ve geçerli VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY bulunmalıdır. Üretim ortamında localStorage kullanılamaz.');
      }
      if (!envState.hasPersistentDb) {
        blockers.push('Supabase URL veya anon key eksik. VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY tanımlanmalıdır.');
      }
      if (!envState.rlsVerified) {
        blockers.push('Supabase RLS (Row Level Security) kuralları uygulanıp doğrulanmamış (VITE_SUPABASE_RLS_VERIFIED="true" olmalı).');
      }
      if (!envState.authConfigured) {
        blockers.push('Kimlik doğrulama modu yapılandırılmamış (VITE_AUTH_MODE="supabase_auth" olmalı).');
      }
      if (!envState.tenantRegReady) {
        blockers.push('Tenant kayıt deposu (tenant registration repository) üretim için hazır işaretlenmemiş (VITE_TENANT_REG_REPO_READY="true" olmalı).');
      }
      if (!envState.manualProvReady) {
        blockers.push('Manuel aktivasyon deposu (manual provisioning repository) üretim için hazır işaretlenmemiş (VITE_MANUAL_PROV_REPO_READY="true" olmalı).');
      }
      if (!envState.appRepoReady) {
        blockers.push('Randevu deposu (appointment repository) üretim için hazır işaretlenmemiş (VITE_APPOINTMENT_REPO_READY="true" olmalı).');
      }
      if (!envState.billingRepoReady) {
        blockers.push('Abonelik/fatura deposu (subscription/manual billing repository) üretim için hazır işaretlenmemiş (VITE_BILLING_REPO_READY="true" olmalı).');
      }
      if (!envState.tokenStorageReady) {
        blockers.push('Müşteri self-servis token depolaması (self-service token storage) üretim için hazır işaretlenmemiş (VITE_TOKEN_STORAGE_READY="true" olmalı).');
      }
      if (!envState.businessProfileRepoReady) {
        blockers.push('İşletme profili deposu (business profile repository) üretim için hazır işaretlenmemiş (VITE_BUSINESS_PROFILE_REPO_READY="true" olmalı).');
      }
      if (!envState.servicesCatalogRepoReady) {
        blockers.push('Hizmet kataloğu deposu (services catalog repository) üretim için hazır işaretlenmemiş (VITE_SERVICES_CATALOG_REPO_READY="true" olmalı).');
      }
      if (!envState.staffRepoReady) {
        blockers.push('Personel deposu (staff repository) üretim için hazır işaretlenmemiş (VITE_STAFF_REPO_READY="true" olmalı).');
      }
      if (!envState.availabilityRepoReady) {
        blockers.push('Çalışma saatleri deposu (availability repository) üretim için hazır işaretlenmemiş (VITE_AVAILABILITY_REPO_READY="true" olmalı).');
      }
      if (!envState.customerRepoReady) {
        blockers.push('Müşteri deposu (customer repository) üretim için hazır işaretlenmemiş (VITE_CUSTOMER_REPO_READY="true" olmalı).');
      }
      if (!envState.backupPlanVerified) {
        blockers.push('Yedekleme ve veri kurtarma planı doğrulanmamış (VITE_BACKUP_PLAN_VERIFIED="true" olmalı).');
      }
      if (!envState.routeSmokeTestPassed) {
        blockers.push('Güvenlik ve yönlendirme duman testleri geçmemiş (VITE_ROUTE_SMOKE_TEST_PASSED="true" olmalı).');
      }
      if (!envState.hasDnsSsl) {
        blockers.push('SSL sertifikası veya canlı DNS tanımlanmamış. VITE_APP_BASE_URL, "https://" ile başlamalı ve "randevulari.com" içermelidir.');
      }
    }

    if (mode === 'full_live_online_payment') {
      if (!envState.hasIyzico) {
        blockers.push('iyzico sanal POS canlı API ayarları ve ödeme entegrasyonu aktif değil (VITE_PAYMENT_MODE disabled veya eksik).');
      }
    }

    return blockers;
  },

  listWarnings(mode: LaunchMode): string[] {
    const envState = this.getEnvState();
    const warnings: string[] = [];

    if (mode === 'paymentless_limited_production') {
      // Note: offline_payment mode is used to manage subscription statuses manually outside the app
      warnings.push('Online ödemeler (kredi kartı tahsilatları) bu modda tamamen devre dışıdır. Kiracılar yalnızca manuel olarak aktifleştirilebilir.');
      if (!envState.hasSms) {
        warnings.push('Canlı SMS/WhatsApp entegrasyonu kapalıdır. Bildirim kutusu (outbox-only) yerel olarak simüle edilir.');
      }
      if (!envState.mediaStorageConnected) {
        warnings.push('Medya depolama sağlayıcısı (media storage provider) bağlı değil. Görseller geçici olarak önbellekte tutulabilir.');
      }
      if (!envState.externalMonitoringEnabled) {
        warnings.push('Harici izleme ve loglama (Sentry vb.) devre dışı bırakılmış.');
      }
      warnings.push('Özel alan adı (custom domain) çözme işlemi el ile yönetilmektedir.');
      if (!envState.backgroundSchedulerReady) {
        warnings.push('Arka plan iş zamanlayıcısı (background scheduler) manuel veya simüle edilmektedir.');
      }
    }

    if (mode === 'limited_live_manual_billing' || mode === 'unpaid_manual_pilot') {
      warnings.push('Bu mod bir test veya pilot sürümüdür. Üretim seviyesinde (production-grade) kalıcı canlı veritabanı koruması veya SLA sunmaz.');
    }

    return warnings;
  },

  getRequiredInfraForMode(mode: LaunchMode): string[] {
    switch (mode) {
      case 'local_pre_live':
      case 'internal_demo':
        return ['Web Browser', 'Vite Local Port 3000'];
      case 'unpaid_manual_pilot':
      case 'limited_live_manual_billing':
        return ['Cloud Hosting (Cloud Run / VPS)', 'Temporary Domain / SSL', 'Mock/Local Database or Staging DB'];
      case 'paymentless_limited_production':
        return [
          'Cloud Hosting (Production Container/VPS)',
          'randevulari.com Main Domain & Wildcard DNS SSL Certificate (HTTPS)',
          'Persistent Production Supabase Postgres Database',
          'Row Level Security (RLS) policies enabled',
          'Super Admin Dashboard for Manual Activation',
          'Weekly Backup System'
        ];
      case 'full_live_online_payment':
        return [
          'Production Hosting (Cloud Run)',
          'randevulari.com Domain & Wildcard SSL Certificate (HTTPS)',
          'Persistent Postgres Production DB (Supabase)',
          'iyzico Corporate Seller Account & API Keys',
          'Secure Webhooks Callback (idempotency, security check)',
          'Live SMS Gateway API & Verification Service'
        ];
      default:
        return [];
    }
  },

  getMustNotClaimForMode(mode: LaunchMode): string[] {
    return launchModeService.getMustNotClaimListForLaunchMode(mode);
  },

  getProductionReadinessGate(mode: LaunchMode): ReadinessGateResult {
    const hardBlockers = this.listHardBlockers(mode);
    const warnings = this.listWarnings(mode);
    const requiredInfra = this.getRequiredInfraForMode(mode);
    const mustNotClaim = this.getMustNotClaimForMode(mode);

    return {
      mode,
      canLaunch: hardBlockers.length === 0,
      hardBlockers,
      warnings,
      requiredInfra,
      mustNotClaim
    };
  },

  canStartInternalDemo(): boolean {
    return this.getProductionReadinessGate('internal_demo').canLaunch;
  },

  canStartUnpaidManualPilot(): boolean {
    return this.getProductionReadinessGate('unpaid_manual_pilot').canLaunch;
  },

  canStartPaymentlessLimitedProduction(): boolean {
    return this.getProductionReadinessGate('paymentless_limited_production').canLaunch;
  },

  canStartFullLiveOnlinePayment(): boolean {
    return this.getProductionReadinessGate('full_live_online_payment').canLaunch;
  }
};
