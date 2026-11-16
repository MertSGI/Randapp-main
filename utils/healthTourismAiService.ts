/**
 * Health Tourism AI Chat Service (Fail-Closed Hardened)
 *
 * Handles public AI chat interactions via server-authoritative Edge Function boundary.
 * NEVER writes directly to ht_ai_conversations or ht_ai_messages tables.
 * Fails closed in local/0-TL mode, when Edge activation is unset, or on invalid inputs.
 */

import { HtAiChatRequest, HtAiChatResponse } from '../types/healthTourismAi';
import { getDataSourceMode, type DataSourceMode } from '../services/dataSourceConfig';
import type { FeatureAvailabilityTier } from '../services/adminFeatureAvailabilityService';
import { isValidIsoCountryCode } from './countryHelper';

const HT_AI_CHAT_FUNCTION = 'ht-ai-chat';
const MAX_HT_MESSAGE_LENGTH = 2_000;

export interface HealthTourismAiServiceOptions {
  mode?: DataSourceMode;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  edgeEnabled?: boolean;
  fetcher?: typeof fetch;
}

function readEnvMap(): Record<string, string | undefined> {
  try {
    const importMetaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    if (importMetaEnv) return importMetaEnv;
  } catch {
    // ignore
  }
  const globalImportEnv = (globalThis as unknown as { import?: { meta?: { env?: Record<string, string | undefined> } } }).import?.meta?.env;
  if (globalImportEnv) return globalImportEnv;
  const nodeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return nodeEnv || {};
}

export function getHealthTourismAiAvailability(options?: {
  mode?: DataSourceMode;
  edgeEnabled?: boolean;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}): {
  availabilityTier: FeatureAvailabilityTier;
  isAvailable: boolean;
  reasonCode: string;
  message: string;
} {
  const env = readEnvMap();
  let mode: DataSourceMode = 'local';
  if (options?.mode) {
    mode = options.mode;
  } else {
    try {
      mode = getDataSourceMode();
    } catch {
      mode = 'local';
    }
  }

  const edgeEnabled = options?.edgeEnabled ?? (env.VITE_HT_AI_CHAT_ENABLED === 'true');
  const supabaseUrl = (options?.supabaseUrl ?? env.VITE_SUPABASE_URL ?? '').trim();
  const supabaseAnonKey = (options?.supabaseAnonKey ?? env.VITE_SUPABASE_ANON_KEY ?? '').trim();

  if (mode === 'supabase' && edgeEnabled && supabaseUrl && supabaseAnonKey) {
    return {
      availabilityTier: 'LIVE_ACTIVE',
      isAvailable: true,
      reasonCode: 'LIVE_ACTIVE',
      message: 'Health Tourism AI chat Edge boundary is enabled.',
    };
  }

  return {
    availabilityTier: 'DISABLED_EXTERNAL_HOLD',
    isAvailable: false,
    reasonCode: mode !== 'supabase' ? 'AI_EXTERNAL_HOLD' : 'AI_PROVIDER_UNAVAILABLE',
    message:
      mode !== 'supabase'
        ? 'Health Tourism AI chat is disabled in local/0-TL mode (DISABLED_EXTERNAL_HOLD).'
        : 'Health Tourism AI chat service is currently unavailable (DISABLED_EXTERNAL_HOLD).',
  };
}

export class HealthTourismAiService {
  private readonly modeOverride?: DataSourceMode;
  private readonly supabaseUrl: string;
  private readonly supabaseAnonKey: string;
  private readonly edgeEnabled?: boolean;
  private readonly fetcher?: typeof fetch;

  constructor(options?: HealthTourismAiServiceOptions) {
    const env = readEnvMap();
    this.modeOverride = options?.mode;
    this.supabaseUrl = (options?.supabaseUrl ?? env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
    this.supabaseAnonKey = (options?.supabaseAnonKey ?? env.VITE_SUPABASE_ANON_KEY ?? '').trim();
    this.edgeEnabled = options?.edgeEnabled;
    this.fetcher = options?.fetcher;
  }

  getAvailability() {
    return getHealthTourismAiAvailability({
      mode: this.modeOverride,
      edgeEnabled: this.edgeEnabled,
      supabaseUrl: this.supabaseUrl,
      supabaseAnonKey: this.supabaseAnonKey,
    });
  }

  /**
   * Send a message to the HT AI Lead Agent via Edge Function.
   * Returns AI response and optionally triggers handoff.
   */
  async sendMessage(request: HtAiChatRequest): Promise<HtAiChatResponse> {
    const availability = this.getAvailability();
    if (!availability.isAvailable) {
      return {
        success: false,
        error: {
          code: availability.reasonCode,
          message: availability.message,
        },
      };
    }

    if (!request || typeof request.tenant_slug !== 'string' || request.tenant_slug.trim() === '') {
      return {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Tenant slug is required.',
        },
      };
    }

    if (typeof request.message !== 'string' || request.message.trim().length === 0) {
      return {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Message is required.',
        },
      };
    }

    if (request.message.length > MAX_HT_MESSAGE_LENGTH) {
      return {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: `Message exceeds maximum length of ${MAX_HT_MESSAGE_LENGTH} characters.`,
        },
      };
    }

    if (request.country_code && !isValidIsoCountryCode(request.country_code)) {
      return {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Unsupported ISO alpha-2 country code.',
        },
      };
    }

    try {
      const fetchImpl = this.fetcher ?? globalThis.fetch;
      if (typeof fetchImpl !== 'function') {
        return {
          success: false,
          error: {
            code: 'AI_PROVIDER_UNAVAILABLE',
            message: 'AI chat service unavailable.',
          },
        };
      }

      const functionUrl = `${this.supabaseUrl}/functions/v1/${HT_AI_CHAT_FUNCTION}`;

      const response = await fetchImpl(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: this.supabaseAnonKey,
          Authorization: `Bearer ${this.supabaseAnonKey}`,
        },
        body: JSON.stringify({
          session_token: request.session_token || null,
          message: request.message.trim(),
          tenant_slug: request.tenant_slug.trim().toLowerCase(),
          preferred_language: request.preferred_language || 'en',
          full_name: request.full_name || null,
          email: request.email || null,
          phone: request.phone || null,
          country_code: request.country_code ? request.country_code.trim().toUpperCase() : null,
          source_channel: request.source_channel || null,
          referring_agency_id: request.referring_agency_id || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        return {
          success: false,
          error: {
            code: errorData?.error?.code || 'AI_CHAT_ERROR',
            message: errorData?.error?.message || 'AI chat service unavailable.',
          },
        };
      }

      const data = await response.json();
      if (!data || typeof data.success !== 'boolean') {
        return {
          success: false,
          error: {
            code: 'AI_CHAT_ERROR',
            message: 'Malformed AI chat response.',
          },
        };
      }
      return data as HtAiChatResponse;
    } catch {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: 'Unable to reach AI chat service.',
        },
      };
    }
  }

  /**
   * Request explicit human handoff via AI chat Edge Function.
   */
  async requestHumanHandoff(
    sessionToken: string,
    tenantSlug: string,
    reason?: string
  ): Promise<HtAiChatResponse> {
    if (!sessionToken || sessionToken.trim() === '') {
      return {
        success: false,
        error: {
          code: 'INVALID_SESSION',
          message: 'Active conversation session token is required for handoff.',
        },
      };
    }

    return this.sendMessage({
      session_token: sessionToken,
      message: `__HANDOFF_REQUEST__:${reason || 'user_requested'}`,
      tenant_slug: tenantSlug,
    });
  }
}
