/**
 * Provider-Neutral Calendar Integration Contract (Phase 3 Foundation)
 * Strictly NO live Google network access, NO OAuth activation, NO real credentials.
 * Standardizes calendar event generation, sync queues, and deterministic provider adapters.
 */

export type CalendarProviderType = 'google_intent' | 'ics' | 'apple' | 'deterministic_test';

export type CalendarSyncStatus = 'pending' | 'synced' | 'failed' | 'cancelled';

export interface CalendarEventPayload {
  eventId: string;
  tenantId: string;
  appointmentId: string;
  title: string;
  description: string;
  location: string;
  startIso: string;
  endIso: string;
  staffName?: string;
  staffEmail?: string;
  customerName?: string;
}

export interface CalendarSyncResult {
  success: boolean;
  provider: CalendarProviderType;
  externalEventRef?: string;
  webIntentUrl?: string;
  rawIcsContent?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface CalendarProviderAdapter {
  readonly providerId: CalendarProviderType;
  syncEvent(event: CalendarEventPayload): Promise<CalendarSyncResult>;
  cancelEvent(externalEventRef: string): Promise<boolean>;
}
