import type {
  CalendarProviderAdapter,
  CalendarProviderType,
  CalendarEventPayload,
  CalendarSyncResult
} from './calendarProviderContract.ts';

export interface DeterministicCalendarProviderOptions {
  fixedNow?: () => number;
  idGenerator?: (prefix: string) => string;
}

/**
 * Deterministic Test Calendar Provider Adapter
 * Strictly NO_NETWORK_SEND, NO Google OAuth, NO live credentials.
 * Simulates calendar sync, web intents, ICS generation, and idempotent replays.
 */
export class DeterministicTestCalendarProvider implements CalendarProviderAdapter {
  public readonly providerId: CalendarProviderType = 'deterministic_test';

  private sequenceCounter: number = 0;
  private readonly fixedNow: () => number;
  private readonly idGenerator: (prefix: string) => string;
  private syncedEvents: Map<string, CalendarEventPayload> = new Map(); // externalEventRef -> event

  constructor(options?: DeterministicCalendarProviderOptions) {
    this.fixedNow = options?.fixedNow ?? (() => 1788988800000 + (this.sequenceCounter * 1000));
    this.idGenerator = options?.idGenerator ?? ((prefix: string) => `${prefix}_${++this.sequenceCounter}`);
  }

  public async syncEvent(event: CalendarEventPayload): Promise<CalendarSyncResult> {
    const externalRef = this.idGenerator('cal_ev');
    this.syncedEvents.set(externalRef, event);

    const startClean = event.startIso.replace(/[-:]/g, '').replace(/\..+/, '');
    const endClean = event.endIso.replace(/[-:]/g, '').replace(/\..+/, '');

    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: event.title,
      details: event.description,
      location: event.location,
      dates: `${startClean}/${endClean}`
    });

    const webIntentUrl = `https://calendar.google.com/calendar/render?${params.toString()}`;
    const rawIcsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//LARI//Phase3 Calendar Foundation//EN',
      'BEGIN:VEVENT',
      `UID:${externalRef}@lari.local`,
      `SUMMARY:${event.title}`,
      `DESCRIPTION:${event.description}`,
      `LOCATION:${event.location}`,
      `DTSTART:${startClean}`,
      `DTEND:${endClean}`,
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    return {
      success: true,
      provider: this.providerId,
      externalEventRef: externalRef,
      webIntentUrl,
      rawIcsContent
    };
  }

  public async cancelEvent(externalEventRef: string): Promise<boolean> {
    if (this.syncedEvents.has(externalEventRef)) {
      this.syncedEvents.delete(externalEventRef);
      return true;
    }
    return false;
  }
}
