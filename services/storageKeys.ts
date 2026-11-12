/**
 * LARİ — Centralized Client Storage Keys Registry (V1A-TECH-01)
 *
 * Kanonik Görev: docs/V1A_SOURCE_READINESS_GAP_ANALYSIS.md Bölüm 7 Paket 5
 * Kapsam: İstemci tarafında (localStorage / in-memory fallback) kullanılan tüm `lari_*` ve
 * `lari:*` anahtarlarının tek bir tip güvenli registry altında toplanması, testler arası bellek
 * temizliği (purge / reset) ve namespace izolasyonunun sağlanması.
 */

/**
 * Statik lari_* depolama anahtarları registry'si.
 */
export const STORAGE_KEYS = {
  // Booking Abuse & Safety (Part 8 & V1-WQ-07)
  BOOKING_ATTEMPTS: 'lari_booking_attempts',
  NOSHOW_SIGNALS: 'lari_noshow_signals',
  TENANT_BOOKING_POLICIES: 'lari_tenant_booking_policies',
  SELF_SERVICE_TOKEN_FAILURES: 'lari_self_service_token_failures',
  CLIENT_DEVICE_FINGERPRINT: 'lari_client_device_fingerprint',

  // Self-Service & Appointment Tokens (ADIM-012..014 / V1A-SEC-01 / V1A-FUNC-01)
  APPOINTMENT_ACCESS_TOKENS: 'lari_appointment_access_tokens',
  APPOINTMENT_CHANGE_REQUESTS: 'lari_appointment_change_requests',
  ADMIN_RESCHEDULE_DECISION_IDEMPOTENCY: 'lari_admin_reschedule_decision_idempotency',

  // Tenant & Sessions (Phase A/B/F)
  REGISTERED_TENANTS: 'lari_registered_tenants',
  ACTIVE_TENANT_ID: 'lari_active_tenant_id',
  ACTIVE_PLAN_ID: 'lari_active_plan_id',
  ACTIVE_OWNER_SESSION: 'lari_active_owner_session',
  MOCK_USER: 'lari_mock_user',
  SELECTED_PLAN: 'lari_selected_plan',
  REGISTRATION_CONTEXT: 'lari_registration_context',

  // Audit, Governance & Compliance
  AUDIT_EVENTS: 'lari_audit_events_v1',
  POLICY_ACCEPTANCES: 'lari_policy_acceptances_v1',
  CONSENT_LEDGER: 'lari_consent_ledger_v1',
  DATA_RIGHTS_REQUESTS: 'lari_data_rights_requests_v1',
  OWNER_TERMS_ACCEPTANCE: 'lari_owner_terms_acceptance',
  INCIDENTS: 'lari_incidents_v1',
  LEGAL_DOCUMENTS: 'lari_legal_documents_v1',
  SUPPORT_TICKETS: 'lari_support_tickets_v1',

  // Communication & Outbox (ADIM-004..006 / V1A)
  COMMUNICATION_EVENTS: 'lari_communication_events',
  COMMUNICATION_PROVIDER_CONFIG: 'lari_communication_provider_config',

  // Campaigns, Referrals & Loyalty
  CUSTOMER_CAMPAIGNS_BY_TENANT: 'lari_customer_campaigns_by_tenant',
  BUSINESS_CAMPAIGNS: 'lari_business_campaigns',
  CUSTOMER_REFERRALS_BY_TENANT: 'lari_customer_referrals_by_tenant',
  BUSINESS_REFERRALS: 'lari_business_referrals',
  CUSTOMER_CAMPAIGN_REWARDS_BY_TENANT: 'lari_customer_campaign_rewards_by_tenant',
  CUSTOMER_REWARDS: 'lari_customer_rewards',
  PLATFORM_PROGRAMS: 'lari_platform_programs',
  PLATFORM_REFERRALS: 'lari_platform_referrals',
  REFERRAL_LEDGERS: 'lari_referral_ledgers',
  REFERRAL_CAMPAIGNS: 'lari_referral_campaigns',
  REFERRAL_CODES: 'lari_referral_codes',
  REFERRAL_LEADS: 'lari_referral_leads',

  // Media, Background Jobs & Staging
  MEDIA_ASSETS: 'lari_media_assets',
  BACKGROUND_JOB_RUNS: 'lari_background_job_runs',
  REGISTERED_JOBS: 'lari_registered_jobs',
  CUSTOM_DOMAIN_REQUESTS: 'lari_custom_domain_requests',

  // Pilot Demo & Test Context
  PILOT_CUSTOMER_TRACKER: 'lari_pilot_customer_tracker_by_tenant',
  DEMO_CONTEXT: 'lari_demo_context',
  ACTIVE_DEMO_TENANT_ID: 'lari_active_demo_tenant_id',
  SAVED_REAL_TENANT_ID: 'lari_saved_real_tenant_id',
  SAVED_REAL_SESSION: 'lari_saved_real_session',
  IN_PILOT_DEMO: 'lari_in_pilot_demo',
  PLANS: 'lari_plans',
} as const;

export type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS];

/**
 * Dinamik / Parametrik anahtar üreteçleri registry'si.
 */
export const DYNAMIC_STORAGE_KEYS = {
  tenantBookingPolicy: (tenantId: string) => `${STORAGE_KEYS.TENANT_BOOKING_POLICIES}_${tenantId}` as const,
  tenantBranches: (tenantId: string) => `lari_branches_${tenantId}` as const,
  tenantCustomerConsents: (tenantId: string) => `lari_customer_consents_by_tenant_${tenantId}` as const,
  tenantCustomerDataRequests: (tenantId: string) => `lari_customer_data_requests_by_tenant_${tenantId}` as const,
  tenantShareChecklist: (tenantId: string) => `lari_share_checklist_${tenantId}` as const,
  tenantCustomerProfile: (tenantId: string) => `lari_customer_profile_${tenantId}` as const,
  tenantAvailabilityConfigured: (tenantId: string) => `lari_availability_${tenantId}_configured` as const,
  tenantBrandingColon: (tenantId: string) => `lari:${tenantId}:branding` as const,
  tenantAppointments: (tenantId: string) => `lari:${tenantId}:appointments` as const,
  tenantAppointmentsSeeded: (tenantId: string) => `lari:${tenantId}:appointments_seeded` as const,
};

/**
 * Bir depolama anahtarının LARİ namespace'ine ait olup olmadığını doğrular.
 */
export function isLariStorageKey(key: string): boolean {
  if (typeof key !== 'string') return false;
  return key.startsWith('lari_') || key.startsWith('lari:');
}

/**
 * In-memory state reset callback kaydı.
 * Servisler ve depolar in-memory fallback değişkenlerini (map/array vb.)
 * merkezi purge/reset çağrısına bağlamak için bu kancayı kullanır.
 */
type MemoryResetHook = () => void;
const memoryResetHooks = new Set<MemoryResetHook>();

export function registerMemoryResetHook(hook: MemoryResetHook): () => void {
  memoryResetHooks.add(hook);
  return () => {
    memoryResetHooks.delete(hook);
  };
}

export interface StoragePurgeFailure {
  phase: 'enumeration' | 'removal' | 'hook';
  key?: string;
  error: unknown;
}

export class StoragePurgeError extends Error {
  readonly failures: StoragePurgeFailure[];
  readonly removedKeys: string[];
  readonly inMemoryHooksRun: number;

  constructor(failures: StoragePurgeFailure[], removedKeys: string[], inMemoryHooksRun: number) {
    const errorMessages = failures
      .map(f => `[${f.phase}${f.key ? `:${f.key}` : ''}] ${f.error instanceof Error ? f.error.message : String(f.error)}`)
      .join('; ');
    super(`[storageKeys] Failed to purge storage: ${errorMessages}`);
    this.name = 'StoragePurgeError';
    this.failures = failures;
    this.removedKeys = removedKeys;
    this.inMemoryHooksRun = inMemoryHooksRun;
  }
}

export interface PurgeLariStorageOptions {
  throwOnError?: boolean;
}

export interface PurgeLariStorageResult {
  ok: boolean;
  removedKeys: string[];
  inMemoryHooksRun: number;
  failures: StoragePurgeFailure[];
}

/**
 * Projedeki tüm `lari_*` ve `lari:*` depolama anahtarlarını siler ve
 * kayıtlı tüm in-memory state kancalarını çalıştırarak testler ve
 * oturumlar arası tam izolasyon sağlar.
 *
 * @param customStorage İsteğe bağlı mock storage (Node.js testleri için).
 * @param options Temizleme seçenekleri (throwOnError: hata durumunda fırlat, varsayılan true).
 */
export function purgeAllLariStorage(
  customStorage?: {
    length?: number;
    key?: (index: number) => string | null;
    removeItem: (key: string) => void;
  },
  options: PurgeLariStorageOptions = { throwOnError: true }
): PurgeLariStorageResult {
  const removedKeys: string[] = [];
  const failures: StoragePurgeFailure[] = [];

  // 1. Storage temizliği (sağlanan mock veya global localStorage)
  let targetStorage: any = customStorage;
  if (!targetStorage) {
    if (typeof window !== 'undefined' && window.localStorage) {
      targetStorage = window.localStorage;
    } else if (typeof localStorage !== 'undefined') {
      targetStorage = localStorage;
    }
  }

  if (targetStorage && typeof targetStorage.removeItem === 'function') {
    const keysToRemove = new Set<string>();

    if (typeof targetStorage.length === 'number' && typeof targetStorage.key === 'function') {
      const len = targetStorage.length;
      for (let i = 0; i < len; i++) {
        try {
          const k = targetStorage.key(i);
          if (k && isLariStorageKey(k)) {
            keysToRemove.add(k);
          }
        } catch (err) {
          failures.push({ phase: 'enumeration', error: err });
        }
      }
    }

    try {
      const candidates = Object.keys(targetStorage);
      for (const k of candidates) {
        if (isLariStorageKey(k)) {
          keysToRemove.add(k);
        }
      }
    } catch (err) {
      failures.push({ phase: 'enumeration', error: err });
    }

    for (const k of keysToRemove) {
      try {
        targetStorage.removeItem(k);
        removedKeys.push(k);
      } catch (err) {
        failures.push({ phase: 'removal', key: k, error: err });
      }
    }
  }

  // 2. In-memory kancalarını çalıştır
  let inMemoryHooksRun = 0;
  for (const hook of memoryResetHooks) {
    try {
      hook();
      inMemoryHooksRun++;
    } catch (err) {
      failures.push({ phase: 'hook', error: err });
      console.warn('[storageKeys] Memory reset hook failed:', err);
    }
  }

  const result: PurgeLariStorageResult = {
    ok: failures.length === 0,
    removedKeys,
    inMemoryHooksRun,
    failures,
  };

  if (failures.length > 0 && options?.throwOnError !== false) {
    throw new StoragePurgeError(failures, removedKeys, inMemoryHooksRun);
  }

  return result;
}

/**
 * purgeLariStorage ve resetStorage kanonik alias'ları.
 */
export const purgeLariStorage = purgeAllLariStorage;
export const resetStorage = purgeAllLariStorage;
