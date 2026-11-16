/**
 * Provider-Neutral Calendar Integration Contract (Phase 3 / V2 Foundation)
 * Strictly NO live Google network access, NO OAuth activation, NO real credentials.
 * Standardizes calendar event generation, sync queues, deterministic test adapters,
 * and explicit EXTERNAL_HOLD classification for live external calendar providers.
 */

export type CalendarProviderType = 'google_intent' | 'ics' | 'apple' | 'deterministic_test';

export type CalendarSyncStatus = 'pending' | 'synced' | 'failed' | 'cancelled';

export type CalendarProviderReadinessTier =
  | 'LOCAL_DETERMINISTIC_TEST'
  | 'CLIENT_INTENT_OR_ICS'
  | 'EXTERNAL_HOLD';

export interface CalendarExternalIntegrationClassification {
  providerId: 'google_calendar_oauth' | 'apple_caldav' | 'microsoft_graph_calendar';
  readinessTier: 'EXTERNAL_HOLD';
  liveExecutionAllowed: false;
  reasonCode: 'EXTERNAL_CALENDAR_CREDENTIALS_REQUIRED';
  description: string;
}

export const EXTERNAL_CALENDAR_HOLD_CLASSIFICATION: readonly CalendarExternalIntegrationClassification[] = [
  {
    providerId: 'google_calendar_oauth',
    readinessTier: 'EXTERNAL_HOLD',
    liveExecutionAllowed: false,
    reasonCode: 'EXTERNAL_CALENDAR_CREDENTIALS_REQUIRED',
    description: 'Live two-way Google Calendar OAuth sync requires server-side OAuth credentials and external API approval.'
  },
  {
    providerId: 'apple_caldav',
    readinessTier: 'EXTERNAL_HOLD',
    liveExecutionAllowed: false,
    reasonCode: 'EXTERNAL_CALENDAR_CREDENTIALS_REQUIRED',
    description: 'Live Apple CalDAV synchronization requires external CalDAV credentials and app-specific integration setup.'
  },
  {
    providerId: 'microsoft_graph_calendar',
    readinessTier: 'EXTERNAL_HOLD',
    liveExecutionAllowed: false,
    reasonCode: 'EXTERNAL_CALENDAR_CREDENTIALS_REQUIRED',
    description: 'Live Microsoft 365 / Outlook Graph calendar sync requires Azure AD app credentials and tenant OAuth consent.'
  }
] as const;

export function getCalendarProviderReadinessTier(
  provider: CalendarProviderType | CalendarExternalIntegrationClassification['providerId']
): CalendarProviderReadinessTier {
  if (provider === 'deterministic_test') {
    return 'LOCAL_DETERMINISTIC_TEST';
  }
  if (provider === 'google_intent' || provider === 'ics' || provider === 'apple') {
    return 'CLIENT_INTENT_OR_ICS';
  }
  return 'EXTERNAL_HOLD';
}

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
