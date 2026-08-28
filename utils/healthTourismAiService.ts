/**
 * Health Tourism AI Chat Service
 *
 * Handles public AI chat interactions via server-authoritative Edge Function boundary.
 * NEVER writes directly to ht_ai_conversations or ht_ai_messages tables.
 * All data flows through the ht-ai-chat Edge Function.
 */

import { HtAiChatRequest, HtAiChatResponse } from '../types/healthTourismAi';

/** Default Edge Function URL path */
const HT_AI_CHAT_FUNCTION = 'ht-ai-chat';

export class HealthTourismAiService {
  private supabaseUrl: string;
  private supabaseAnonKey: string;

  constructor() {
    this.supabaseUrl = (import.meta as Record<string, Record<string, string>>).env?.VITE_SUPABASE_URL || '';
    this.supabaseAnonKey = (import.meta as Record<string, Record<string, string>>).env?.VITE_SUPABASE_ANON_KEY || '';
  }

  /**
   * Send a message to the HT AI Lead Agent via Edge Function.
   * Returns AI response and optionally triggers handoff.
   */
  async sendMessage(request: HtAiChatRequest): Promise<HtAiChatResponse> {
    try {
      const functionUrl = `${this.supabaseUrl}/functions/v1/${HT_AI_CHAT_FUNCTION}`;

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.supabaseAnonKey,
          'Authorization': `Bearer ${this.supabaseAnonKey}`,
        },
        body: JSON.stringify({
          session_token: request.session_token || null,
          message: request.message,
          tenant_slug: request.tenant_slug,
          preferred_language: request.preferred_language || 'en',
          full_name: request.full_name || null,
          email: request.email || null,
          phone: request.phone || null,
          country_code: request.country_code || null,
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
  async requestHumanHandoff(sessionToken: string, tenantSlug: string, reason?: string): Promise<HtAiChatResponse> {
    return this.sendMessage({
      session_token: sessionToken,
      message: `__HANDOFF_REQUEST__:${reason || 'user_requested'}`,
      tenant_slug: tenantSlug,
    });
  }
}
