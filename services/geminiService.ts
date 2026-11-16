import { Appointment } from '../types';
import { getDataSourceMode, type DataSourceMode } from './dataSourceConfig';
import type { FeatureAvailabilityTier } from './adminFeatureAvailabilityService';

export interface GeminiFeatureStatus {
  availabilityTier: FeatureAvailabilityTier;
  isAvailable: boolean;
  reasonCode: string;
  message: string;
}

export interface GeminiConsultationResult {
  success: boolean;
  availabilityTier: FeatureAvailabilityTier;
  reasonCode: string;
  data: { text: string; image: string | null } | null;
  message?: string;
}

function readSafeAiMode(): string {
  try {
    const importMetaEnv = (import.meta as any)?.env;
    if (importMetaEnv?.VITE_AI_MODE) {
      return String(importMetaEnv.VITE_AI_MODE).trim().toLowerCase();
    }
  } catch {
    // ignore
  }
  const globalImportEnv = (globalThis as any)?.import?.meta?.env;
  if (globalImportEnv?.VITE_AI_MODE) {
    return String(globalImportEnv.VITE_AI_MODE).trim().toLowerCase();
  }
  const nodeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  if (nodeEnv?.VITE_AI_MODE) {
    return String(nodeEnv.VITE_AI_MODE).trim().toLowerCase();
  }
  return '';
}

function resolveSafeDataMode(modeOverride?: DataSourceMode): DataSourceMode {
  if (modeOverride) return modeOverride;
  try {
    return getDataSourceMode();
  } catch {
    return 'local';
  }
}

export function getGeminiFeatureAvailability(options?: {
  feature?: 'booking_confirmation' | 'schedule_analysis' | 'consultation_preview';
  mode?: DataSourceMode;
  aiMode?: string;
}): GeminiFeatureStatus {
  const mode = resolveSafeDataMode(options?.mode);
  const aiMode = (options?.aiMode ?? readSafeAiMode()).trim().toLowerCase();
  const feature = options?.feature ?? 'schedule_analysis';

  if (feature === 'consultation_preview' && mode === 'local' && (aiMode === '' || aiMode === 'mock')) {
    return {
      availabilityTier: 'LOCAL_OR_SANDBOX_ONLY',
      isAvailable: true,
      reasonCode: 'LOCAL_SANDBOX_PREVIEW_ONLY',
      message: 'Yerel önizleme (mock) modunda deterministik stil önerisi üretilir; canlı Gemini API çağrısı yapılmaz.',
    };
  }

  return {
    availabilityTier: 'DISABLED_EXTERNAL_HOLD',
    isAvailable: false,
    reasonCode: 'AI_EXTERNAL_HOLD',
    message: 'Canlı Gemini AI entegrasyonu 0 TL / EXTERNAL_HOLD sınırı nedeniyle istemcide kapalıdır ve sunucu sırrı gerektirir.',
  };
}

export const generateBookingConfirmation = async (
  _appointment: Appointment,
  _serviceName: string,
  _language: 'en' | 'tr' = 'en'
): Promise<{ subject: string; body: string } | null> => {
  // Fail-closed: client-side LLM confirmation generation is disabled; zero network calls.
  return null;
};

export const analyzeSchedule = async (
  _appointments: Appointment[],
  language: 'en' | 'tr' = 'en'
): Promise<string> => {
  return language === 'tr'
    ? 'Yapay Zeka Takvim Analizi şu anda DISABLED_EXTERNAL_HOLD durumundadır; yalnızca sunucu yetkili Supabase Edge Function üzerinden ve canlı anahtar tanımlandığında çalışır.'
    : 'AI Schedule Analysis is currently DISABLED_EXTERNAL_HOLD; it runs only via server-authoritative Supabase Edge Functions once live keys are provisioned.';
};

export const generateFullConsultationWithStatus = async (
  promptText: string,
  base64Image?: string,
  language: 'en' | 'tr' = 'en',
  options?: { mode?: DataSourceMode; aiMode?: string }
): Promise<GeminiConsultationResult> => {
  const status = getGeminiFeatureAvailability({
    feature: 'consultation_preview',
    mode: options?.mode,
    aiMode: options?.aiMode,
  });

  if (!status.isAvailable || status.availabilityTier !== 'LOCAL_OR_SANDBOX_ONLY') {
    return {
      success: false,
      availabilityTier: 'DISABLED_EXTERNAL_HOLD',
      reasonCode: 'AI_EXTERNAL_HOLD',
      data: null,
      message: status.message,
    };
  }

  const trimmedPrompt = typeof promptText === 'string' ? promptText.trim() : '';
  if (!trimmedPrompt) {
    return {
      success: false,
      availabilityTier: 'LOCAL_OR_SANDBOX_ONLY',
      reasonCode: 'INVALID_PROMPT',
      data: null,
      message: language === 'tr' ? 'Danışma metni boş olamaz.' : 'Consultation prompt cannot be empty.',
    };
  }

  const safeText =
    language === 'tr'
      ? `**Saç Analizi & Tavsiye (Yerel Önizleme):**\nİsteğiniz ("${trimmedPrompt.slice(0, 120)}") için stil önerisi hazırlandı.\n\n**Önerilen Hizmetler:**\n- Saç Kesimi\n- Renklendirme\n- Saç Bakım Kürleri\n\n*Not: Bu bir yerel önizleme (LOCAL_OR_SANDBOX_ONLY) yanıtıdır; canlı yapay zeka API çağrısı yapılmamıştır.*`
      : `**Hair Analysis & Recommendation (Local Preview):**\nPrepared a deterministic style preview for your request ("${trimmedPrompt.slice(0, 120)}").\n\n**Recommended Services:**\n- Haircut\n- Coloring\n- Hair Treatment\n\n*Note: This is a local sandbox preview (LOCAL_OR_SANDBOX_ONLY); no live AI API call was executed.*`;

  return {
    success: true,
    availabilityTier: 'LOCAL_OR_SANDBOX_ONLY',
    reasonCode: 'LOCAL_SANDBOX_PREVIEW_ONLY',
    data: {
      text: safeText,
      image: base64Image || null,
    },
  };
};

export const generateFullConsultation = async (
  promptText: string,
  base64Image?: string,
  language: 'en' | 'tr' = 'en',
  options?: { mode?: DataSourceMode; aiMode?: string }
): Promise<{ text: string; image: string | null } | null> => {
  const result = await generateFullConsultationWithStatus(promptText, base64Image, language, options);
  return result.success ? result.data : null;
};
