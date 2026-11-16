import { onboardingChecklistService } from './onboardingChecklistService';
import { subscriptionService } from './subscriptionService';
import { getDataSourceMode, type DataSourceMode } from './dataSourceConfig';

export type FeatureAvailabilityTier =
  | 'LIVE_ACTIVE'
  | 'LOCAL_OR_SANDBOX_ONLY'
  | 'DISABLED_EXTERNAL_HOLD';

export type PlatformFeatureId =
  | 'admin_dashboard'
  | 'admin_setup_wizard'
  | 'admin_services_catalog'
  | 'admin_staff_management'
  | 'admin_appointments'
  | 'admin_customers_crm'
  | 'admin_reports_analytics'
  | 'admin_referrals_campaigns'
  | 'admin_billing_status'
  | 'admin_business_profile'
  | 'admin_settings'
  | 'admin_reschedule_requests'
  | 'pos_core_checkout'
  | 'pos_card_terminal_psp'
  | 'pos_customer_wallet_settlement'
  | 'waitlist_operations'
  | 'loyalty_packages_wallet'
  | 'clinic_workspace'
  | 'health_tourism_intake'
  | 'discovery_marketplace_reviews'
  | 'multi_market_currency_formatting'
  | 'live_fx_currency_conversion'
  | 'live_online_checkout_iyzico'
  | 'live_sms_whatsapp_notifications'
  | 'live_email_delivery'
  | 'live_custom_domain_dns_ssl'
  | 'gemini_booking_confirmation'
  | 'gemini_schedule_analysis'
  | 'gemini_style_consultation_preview'
  | 'ai_image_visualization'
  | 'clinic_ai_transcription'
  | 'clinic_ai_soap_draft'
  | 'health_tourism_ai_chat';

export interface FeatureClassificationContext {
  dataMode?: DataSourceMode;
  aiSandboxPreviewEnabled?: boolean;
  clinicAiEdgeEnabled?: boolean;
  htAiEdgeEnabled?: boolean;
  geminiEdgeEnabled?: boolean;
  livePaymentsEnabled?: boolean;
  liveCommsEnabled?: boolean;
  liveDnsEnabled?: boolean;
}

export interface FeatureClassification {
  featureId: string;
  label: string;
  category: 'core' | 'operations' | 'commercial' | 'vertical' | 'globalization' | 'ai' | 'infrastructure';
  tier: FeatureAvailabilityTier;
  isAccessible: boolean;
  reasonCode: string;
  externalHoldReason: string | null;
  requiresServerSecret: boolean;
}

export interface AdminFeatureAvailability {
  isAccessible: boolean;
  availabilityTier: FeatureAvailabilityTier;
  lockReason: string | null;
  recommendedAction: string | null;
  reasonCode?: string;
}

interface FeatureDefinition {
  featureId: PlatformFeatureId;
  label: string;
  category: FeatureClassification['category'];
  kind: 'core_data_mode' | 'external_hold' | 'ai_preview_or_hold' | 'ai_edge_hold';
  holdFlag?: keyof Omit<FeatureClassificationContext, 'dataMode' | 'aiSandboxPreviewEnabled'>;
  holdReasonCode: string;
  externalHoldReason: string;
  requiresServerSecret: boolean;
}

const FEATURE_DEFINITIONS: Record<PlatformFeatureId, FeatureDefinition> = {
  admin_dashboard: {
    featureId: 'admin_dashboard',
    label: 'Yönetim Özeti',
    category: 'core',
    kind: 'core_data_mode',
    holdReasonCode: 'OK',
    externalHoldReason: '',
    requiresServerSecret: false,
  },
  admin_setup_wizard: {
    featureId: 'admin_setup_wizard',
    label: 'Kurulum Sihirbazı',
    category: 'core',
    kind: 'core_data_mode',
    holdReasonCode: 'OK',
    externalHoldReason: '',
    requiresServerSecret: false,
  },
  admin_services_catalog: {
    featureId: 'admin_services_catalog',
    label: 'Hizmet Kataloğu',
    category: 'core',
    kind: 'core_data_mode',
    holdReasonCode: 'OK',
    externalHoldReason: '',
    requiresServerSecret: false,
  },
  admin_staff_management: {
    featureId: 'admin_staff_management',
    label: 'Personel ve Çalışma Saatleri',
    category: 'core',
    kind: 'core_data_mode',
    holdReasonCode: 'OK',
    externalHoldReason: '',
    requiresServerSecret: false,
  },
  admin_appointments: {
    featureId: 'admin_appointments',
    label: 'Randevu Operasyonları',
    category: 'operations',
    kind: 'core_data_mode',
    holdReasonCode: 'OK',
    externalHoldReason: '',
    requiresServerSecret: false,
  },
  admin_customers_crm: {
    featureId: 'admin_customers_crm',
    label: 'Müşteri Hafızası (CRM)',
    category: 'operations',
    kind: 'core_data_mode',
    holdReasonCode: 'OK',
    externalHoldReason: '',
    requiresServerSecret: false,
  },
  admin_reports_analytics: {
    featureId: 'admin_reports_analytics',
    label: 'Raporlama ve Analitik',
    category: 'operations',
    kind: 'core_data_mode',
    holdReasonCode: 'OK',
    externalHoldReason: '',
    requiresServerSecret: false,
  },
  admin_referrals_campaigns: {
    featureId: 'admin_referrals_campaigns',
    label: 'Müşteri Kampanyaları ve Ödüller',
    category: 'commercial',
    kind: 'core_data_mode',
    holdReasonCode: 'OK',
    externalHoldReason: '',
    requiresServerSecret: false,
  },
  admin_billing_status: {
    featureId: 'admin_billing_status',
    label: 'Abonelik ve Paket Durumu',
    category: 'commercial',
    kind: 'core_data_mode',
    holdReasonCode: 'OK',
    externalHoldReason: '',
    requiresServerSecret: false,
  },
  admin_business_profile: {
    featureId: 'admin_business_profile',
    label: 'İşletme Profili',
    category: 'core',
    kind: 'core_data_mode',
    holdReasonCode: 'OK',
    externalHoldReason: '',
    requiresServerSecret: false,
  },
  admin_settings: {
    featureId: 'admin_settings',
    label: 'Ayarlar ve Paylaşım',
    category: 'core',
    kind: 'core_data_mode',
    holdReasonCode: 'OK',
    externalHoldReason: '',
    requiresServerSecret: false,
  },
  admin_reschedule_requests: {
    featureId: 'admin_reschedule_requests',
    label: 'Saat Değişikliği Talepleri',
    category: 'operations',
    kind: 'core_data_mode',
    holdReasonCode: 'OK',
    externalHoldReason: '',
    requiresServerSecret: false,
  },
  pos_core_checkout: {
    featureId: 'pos_core_checkout',
    label: 'POS Karma Sepet ve Nakit/Kart Kaydı',
    category: 'operations',
    kind: 'core_data_mode',
    holdReasonCode: 'OK',
    externalHoldReason: '',
    requiresServerSecret: false,
  },
  pos_card_terminal_psp: {
    featureId: 'pos_card_terminal_psp',
    label: 'POS Fiziksel Kart Terminali / PSP',
    category: 'commercial',
    kind: 'external_hold',
    holdFlag: 'livePaymentsEnabled',
    holdReasonCode: 'POS_CARD_TERMINAL_EXTERNAL_HOLD',
    externalHoldReason: 'Canlı POS/PSP terminal entegrasyonu ve üye işyeri sözleşmesi gerektirir (EXTERNAL_HOLD).',
    requiresServerSecret: true,
  },
  pos_customer_wallet_settlement: {
    featureId: 'pos_customer_wallet_settlement',
    label: 'POS Müşteri Cüzdanı Tahsilatı',
    category: 'commercial',
    kind: 'external_hold',
    holdFlag: 'livePaymentsEnabled',
    holdReasonCode: 'POS_WALLET_SETTLEMENT_EXTERNAL_HOLD',
    externalHoldReason: 'POS cüzdan tahsilatı canlı ödeme/mutabakat aktivasyonu gerektirir (EXTERNAL_HOLD).',
    requiresServerSecret: true,
  },
  waitlist_operations: {
    featureId: 'waitlist_operations',
    label: 'Bekleme Listesi ve Kaynak Kapasitesi',
    category: 'operations',
    kind: 'core_data_mode',
    holdReasonCode: 'OK',
    externalHoldReason: '',
    requiresServerSecret: false,
  },
  loyalty_packages_wallet: {
    featureId: 'loyalty_packages_wallet',
    label: 'Sadakat, Paket/Üyelik ve Cüzdan Defteri',
    category: 'commercial',
    kind: 'core_data_mode',
    holdReasonCode: 'OK',
    externalHoldReason: '',
    requiresServerSecret: false,
  },
  clinic_workspace: {
    featureId: 'clinic_workspace',
    label: 'Klinik Çalışma Alanı (Sentetik/Yetkili)',
    category: 'vertical',
    kind: 'core_data_mode',
    holdReasonCode: 'OK',
    externalHoldReason: '',
    requiresServerSecret: false,
  },
  health_tourism_intake: {
    featureId: 'health_tourism_intake',
    label: 'Sağlık Turizmi Koordinatör ve Lead Akışı',
    category: 'vertical',
    kind: 'core_data_mode',
    holdReasonCode: 'OK',
    externalHoldReason: '',
    requiresServerSecret: false,
  },
  discovery_marketplace_reviews: {
    featureId: 'discovery_marketplace_reviews',
    label: 'Keşif Pazar Yeri ve Doğrulanmış Yorumlar',
    category: 'vertical',
    kind: 'core_data_mode',
    holdReasonCode: 'OK',
    externalHoldReason: '',
    requiresServerSecret: false,
  },
  multi_market_currency_formatting: {
    featureId: 'multi_market_currency_formatting',
    label: 'Çoklu Pazar ve Para Birimi Biçimlendirme',
    category: 'globalization',
    kind: 'core_data_mode',
    holdReasonCode: 'OK',
    externalHoldReason: '',
    requiresServerSecret: false,
  },
  live_fx_currency_conversion: {
    featureId: 'live_fx_currency_conversion',
    label: 'Canlı Döviz Kuru Dönüşümü',
    category: 'globalization',
    kind: 'external_hold',
    holdReasonCode: 'FX_ORACLE_EXTERNAL_HOLD',
    externalHoldReason: 'Canlı kur sağlayıcısı (FX Oracle) 0 TL bütçe politikası gereği devre dışıdır (EXTERNAL_HOLD).',
    requiresServerSecret: true,
  },
  live_online_checkout_iyzico: {
    featureId: 'live_online_checkout_iyzico',
    label: 'Canlı Çevrimiçi Ödeme (iyzico / PSP)',
    category: 'commercial',
    kind: 'external_hold',
    holdFlag: 'livePaymentsEnabled',
    holdReasonCode: 'PAYMENT_PROVIDER_EXTERNAL_HOLD',
    externalHoldReason: 'Canlı iyzico/PSP API anahtarları ve üye işyeri onayı bekleniyor (EXTERNAL_HOLD).',
    requiresServerSecret: true,
  },
  live_sms_whatsapp_notifications: {
    featureId: 'live_sms_whatsapp_notifications',
    label: 'Canlı SMS ve WhatsApp Gönderimi',
    category: 'infrastructure',
    kind: 'external_hold',
    holdFlag: 'liveCommsEnabled',
    holdReasonCode: 'SMS_WHATSAPP_EXTERNAL_HOLD',
    externalHoldReason: 'Canlı Netgsm / WhatsApp Business API sözleşmesi ve şablon onayı bekleniyor (EXTERNAL_HOLD).',
    requiresServerSecret: true,
  },
  live_email_delivery: {
    featureId: 'live_email_delivery',
    label: 'Canlı Transactional E-posta Gönderimi',
    category: 'infrastructure',
    kind: 'external_hold',
    holdFlag: 'liveCommsEnabled',
    holdReasonCode: 'EMAIL_PROVIDER_EXTERNAL_HOLD',
    externalHoldReason: 'Canlı e-posta sağlayıcısı (SPF/DKIM/API anahtarı) bekleniyor (EXTERNAL_HOLD).',
    requiresServerSecret: true,
  },
  live_custom_domain_dns_ssl: {
    featureId: 'live_custom_domain_dns_ssl',
    label: 'Özel Alan Adı DNS/SSL Otomasyonu',
    category: 'infrastructure',
    kind: 'external_hold',
    holdFlag: 'liveDnsEnabled',
    holdReasonCode: 'CUSTOM_DOMAIN_DNS_EXTERNAL_HOLD',
    externalHoldReason: 'Canlı NS/CNAME delegasyonu ve Vercel/Cloudflare alan adı doğrulaması bekleniyor (EXTERNAL_HOLD).',
    requiresServerSecret: true,
  },
  gemini_booking_confirmation: {
    featureId: 'gemini_booking_confirmation',
    label: 'Gemini Randevu Onay Metni',
    category: 'ai',
    kind: 'ai_edge_hold',
    holdFlag: 'geminiEdgeEnabled',
    holdReasonCode: 'GEMINI_AI_EXTERNAL_HOLD',
    externalHoldReason: 'Canlı GEMINI_API_KEY sunucu sırrı ve Edge Function aktivasyonu gerektirir (EXTERNAL_HOLD).',
    requiresServerSecret: true,
  },
  gemini_schedule_analysis: {
    featureId: 'gemini_schedule_analysis',
    label: 'Gemini Takvim Analizi',
    category: 'ai',
    kind: 'ai_edge_hold',
    holdFlag: 'geminiEdgeEnabled',
    holdReasonCode: 'GEMINI_AI_EXTERNAL_HOLD',
    externalHoldReason: 'Canlı GEMINI_API_KEY sunucu sırrı ve Edge Function aktivasyonu gerektirir (EXTERNAL_HOLD).',
    requiresServerSecret: true,
  },
  gemini_style_consultation_preview: {
    featureId: 'gemini_style_consultation_preview',
    label: 'Stil Danışmanı Önizlemesi',
    category: 'ai',
    kind: 'ai_preview_or_hold',
    holdFlag: 'geminiEdgeEnabled',
    holdReasonCode: 'GEMINI_PREVIEW_EXTERNAL_HOLD',
    externalHoldReason: 'Yalnız yerel/sandbox modunda simüle edilir; canlı modda Edge AI anahtarı gerektirir (EXTERNAL_HOLD).',
    requiresServerSecret: true,
  },
  ai_image_visualization: {
    featureId: 'ai_image_visualization',
    label: 'AI Görsel Simülasyon',
    category: 'ai',
    kind: 'ai_edge_hold',
    holdFlag: 'geminiEdgeEnabled',
    holdReasonCode: 'AI_VISUALIZATION_EXTERNAL_HOLD',
    externalHoldReason: 'Ücretli görsel üretim API anahtarı ve Edge entitlement doğrulaması bekleniyor (EXTERNAL_HOLD).',
    requiresServerSecret: true,
  },
  clinic_ai_transcription: {
    featureId: 'clinic_ai_transcription',
    label: 'Klinik Ses Transkripsiyonu',
    category: 'ai',
    kind: 'ai_edge_hold',
    holdFlag: 'clinicAiEdgeEnabled',
    holdReasonCode: 'CLINIC_AI_TRANSCRIBE_EXTERNAL_HOLD',
    externalHoldReason: 'Sunucu tarafı GROQ_API_KEY / OPENAI_API_KEY ve KVKK klinik AI onayı gerektirir (EXTERNAL_HOLD).',
    requiresServerSecret: true,
  },
  clinic_ai_soap_draft: {
    featureId: 'clinic_ai_soap_draft',
    label: 'Klinik SOAP Not Taslağı',
    category: 'ai',
    kind: 'ai_edge_hold',
    holdFlag: 'clinicAiEdgeEnabled',
    holdReasonCode: 'CLINIC_AI_DRAFT_EXTERNAL_HOLD',
    externalHoldReason: 'Sunucu tarafı GROQ_API_KEY / OPENAI_API_KEY ve hekim onaylı Edge aktivasyonu gerektirir (EXTERNAL_HOLD).',
    requiresServerSecret: true,
  },
  health_tourism_ai_chat: {
    featureId: 'health_tourism_ai_chat',
    label: 'Sağlık Turizmi AI Lead Asistanı',
    category: 'ai',
    kind: 'ai_edge_hold',
    holdFlag: 'htAiEdgeEnabled',
    holdReasonCode: 'HT_AI_CHAT_EXTERNAL_HOLD',
    externalHoldReason: 'Sunucu tarafı GROQ_API_KEY / OPENAI_API_KEY ve HT_RATE_LIMIT_HASH_KEY gerektirir (EXTERNAL_HOLD).',
    requiresServerSecret: true,
  },
};

const TAB_TO_FEATURE_MAP: Record<string, PlatformFeatureId> = {
  dashboard: 'admin_dashboard',
  setup: 'admin_setup_wizard',
  services: 'admin_services_catalog',
  staff: 'admin_staff_management',
  appointments: 'admin_appointments',
  customers: 'admin_customers_crm',
  reports: 'admin_reports_analytics',
  referrals: 'admin_referrals_campaigns',
  billing: 'admin_billing_status',
  profile: 'admin_business_profile',
  settings: 'admin_settings',
  'reschedule-requests': 'admin_reschedule_requests',
  pos: 'pos_core_checkout',
  'ai-visualizer': 'ai_image_visualization',
  ai_visualization: 'ai_image_visualization',
  'clinic-ai': 'clinic_ai_soap_draft',
  'ht-ai-chat': 'health_tourism_ai_chat',
  'live-payments': 'live_online_checkout_iyzico',
};

function resolveRuntimeDataMode(context?: FeatureClassificationContext): DataSourceMode {
  if (context?.dataMode) return context.dataMode;
  try {
    return getDataSourceMode();
  } catch {
    return 'local';
  }
}

export function classifyFeature(
  featureId: string,
  context?: FeatureClassificationContext
): FeatureClassification {
  const def = (FEATURE_DEFINITIONS as Record<string, FeatureDefinition | undefined>)[featureId];
  if (!def) {
    // Fail-closed for any unknown feature identifier
    return {
      featureId,
      label: featureId,
      category: 'infrastructure',
      tier: 'DISABLED_EXTERNAL_HOLD',
      isAccessible: false,
      reasonCode: 'UNKNOWN_FEATURE_FAIL_CLOSED',
      externalHoldReason: `Tanımsız özellik '${featureId}' fail-closed olarak devre dışıdır.`,
      requiresServerSecret: true,
    };
  }

  const dataMode = resolveRuntimeDataMode(context);

  if (def.kind === 'core_data_mode') {
    const tier: FeatureAvailabilityTier = dataMode === 'supabase' ? 'LIVE_ACTIVE' : 'LOCAL_OR_SANDBOX_ONLY';
    return {
      featureId: def.featureId,
      label: def.label,
      category: def.category,
      tier,
      isAccessible: true,
      reasonCode: tier === 'LIVE_ACTIVE' ? 'LIVE_ACTIVE' : 'LOCAL_SANDBOX_MODE',
      externalHoldReason: null,
      requiresServerSecret: false,
    };
  }

  if (def.kind === 'ai_preview_or_hold') {
    const allowSandboxPreview = dataMode === 'local' && context?.aiSandboxPreviewEnabled !== false;
    if (allowSandboxPreview) {
      return {
        featureId: def.featureId,
        label: def.label,
        category: def.category,
        tier: 'LOCAL_OR_SANDBOX_ONLY',
        isAccessible: true,
        reasonCode: 'LOCAL_SANDBOX_PREVIEW_ONLY',
        externalHoldReason: null,
        requiresServerSecret: false,
      };
    }
    const edgeEnabled = Boolean(def.holdFlag && context?.[def.holdFlag]);
    if (dataMode === 'supabase' && edgeEnabled) {
      return {
        featureId: def.featureId,
        label: def.label,
        category: def.category,
        tier: 'LIVE_ACTIVE',
        isAccessible: true,
        reasonCode: 'LIVE_ACTIVE',
        externalHoldReason: null,
        requiresServerSecret: true,
      };
    }
    return {
      featureId: def.featureId,
      label: def.label,
      category: def.category,
      tier: 'DISABLED_EXTERNAL_HOLD',
      isAccessible: false,
      reasonCode: def.holdReasonCode,
      externalHoldReason: def.externalHoldReason,
      requiresServerSecret: true,
    };
  }

  // external_hold and ai_edge_hold remain fail-closed DISABLED_EXTERNAL_HOLD unless explicitly attested live
  const isExplicitlyEnabled = Boolean(dataMode === 'supabase' && def.holdFlag && context?.[def.holdFlag]);
  if (isExplicitlyEnabled) {
    return {
      featureId: def.featureId,
      label: def.label,
      category: def.category,
      tier: 'LIVE_ACTIVE',
      isAccessible: true,
      reasonCode: 'LIVE_ACTIVE',
      externalHoldReason: null,
      requiresServerSecret: def.requiresServerSecret,
    };
  }

  return {
    featureId: def.featureId,
    label: def.label,
    category: def.category,
    tier: 'DISABLED_EXTERNAL_HOLD',
    isAccessible: false,
    reasonCode: def.holdReasonCode,
    externalHoldReason: def.externalHoldReason,
    requiresServerSecret: def.requiresServerSecret,
  };
}

export function getAllFeatureIds(): PlatformFeatureId[] {
  return Object.keys(FEATURE_DEFINITIONS) as PlatformFeatureId[];
}

export function getFeatureAvailabilityMatrix(
  context?: FeatureClassificationContext
): FeatureClassification[] {
  return getAllFeatureIds().map((id) => classifyFeature(id, context));
}

export function getFeatureAvailabilitySummary(context?: FeatureClassificationContext): {
  total: number;
  liveActiveCount: number;
  localOrSandboxOnlyCount: number;
  disabledExternalHoldCount: number;
} {
  const matrix = getFeatureAvailabilityMatrix(context);
  return {
    total: matrix.length,
    liveActiveCount: matrix.filter((f) => f.tier === 'LIVE_ACTIVE').length,
    localOrSandboxOnlyCount: matrix.filter((f) => f.tier === 'LOCAL_OR_SANDBOX_ONLY').length,
    disabledExternalHoldCount: matrix.filter((f) => f.tier === 'DISABLED_EXTERNAL_HOLD').length,
  };
}

export const adminFeatureAvailabilityService = {
  classifyFeature,
  getAllFeatureIds,
  getFeatureAvailabilityMatrix,
  getFeatureAvailabilitySummary,

  getTabFeatureClassification(
    tabId: string,
    context?: FeatureClassificationContext
  ): FeatureClassification {
    const mappedFeature = TAB_TO_FEATURE_MAP[tabId];
    if (!mappedFeature) {
      return classifyFeature(`unknown_tab_${tabId}`, context);
    }
    return classifyFeature(mappedFeature, context);
  },

  async getAvailability(
    tenantId: string,
    tabId: string,
    context?: FeatureClassificationContext
  ): Promise<AdminFeatureAvailability> {
    const classification = this.getTabFeatureClassification(tabId, context);

    if (classification.tier === 'DISABLED_EXTERNAL_HOLD' && !classification.isAccessible) {
      return {
        isAccessible: false,
        availabilityTier: 'DISABLED_EXTERNAL_HOLD',
        lockReason: classification.externalHoldReason || 'Bu özellik dış sağlayıcı aktivasyonu bekliyor (EXTERNAL_HOLD).',
        recommendedAction: 'external_hold',
        reasonCode: classification.reasonCode,
      };
    }

    await onboardingChecklistService.getOnboardingReport(tenantId);

    if (tabId === 'referrals') {
      const plan = await subscriptionService.getPlanForTenant(tenantId);
      if (plan && plan.id === 'free') {
        return {
          isAccessible: false,
          availabilityTier: classification.tier,
          lockReason: 'Müşteri Kampanyaları özelliği mevcut paketinizde yer almıyor.',
          recommendedAction: 'upgrade',
          reasonCode: 'PLAN_UPGRADE_REQUIRED',
        };
      }
    }

    return {
      isAccessible: true,
      availabilityTier: classification.tier,
      lockReason: null,
      recommendedAction: null,
      reasonCode: classification.reasonCode,
    };
  },

  async getAdminHomeNextActions(tenantId: string): Promise<{
    message: string;
    ctaText: string;
    targetTab: string;
    isBlocked: boolean;
  } | null> {
    const report = await onboardingChecklistService.getOnboardingReport(tenantId);

    if (report.pendingCheckout) {
      return {
        message: 'Deneme süresini başlatmak veya yayına geçmek için ödeme doğrulaması tamamlanmalıdır.',
        ctaText: 'Güvenli Ödeme Doğrulaması',
        targetTab: 'billing',
        isBlocked: true,
      };
    }
    if (report.progressPercent < 100) {
      return {
        message: `Sitenizin eksiksiz olması için ${report.nextStep?.title} eksik.`,
        ctaText: 'Kuruluma Devam Et',
        targetTab: 'setup',
        isBlocked: false,
      };
    }
    if (report.isPublished) {
      return {
        message: 'Randevu bağlantınızı paylaşın.',
        ctaText: 'Paylaşım Araçlarını Aç',
        targetTab: 'settings',
        isBlocked: false,
      };
    }
    if (report.canSubmitForReview && !report.isPendingReview) {
      return {
        message: 'Tüm zorunlu adımlar tamamlandı. Yayın incelemesine gönderebilirsiniz!',
        ctaText: 'Yayına Al',
        targetTab: 'setup',
        isBlocked: false,
      };
    }
    if (report.isPendingReview) {
      return {
        message: 'Siteniz incelemede. Kısa süre içinde yayında olacaktır!',
        ctaText: 'Kurulum Sihirbazı',
        targetTab: 'setup',
        isBlocked: false,
      };
    }
    return null;
  },
};
