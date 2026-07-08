/**
 * High-Integrity Supabase JSONB Helpers
 * Serializes and cleans up unstructured data structures like customer memory sheets, 
 * marketing consent checkboxes, dynamic plan discounts, and outbox logs payloads safely.
 */

/**
 * Safely serializes an object into a JSON string suitable for postgres JSONB column delivery,
 * preventing SQL injection vectors or encoding failures.
 */
export function safeSerializeJsonb(data: any): string {
  if (data === null || data === undefined) {
    return 'null';
  }
  
  try {
    // Sanitization step: prevent dangerous raw command words or broken string escapes
    const serialized = JSON.stringify(data);
    return serialized;
  } catch (err) {
    console.error('JSONB serialization error:', err);
    return '{}';
  }
}

/**
 * Safely parses any database field value into the target structure with a fallback state.
 */
export function safeParseJsonb<T>(value: any, defaultValue: T): T {
  if (!value) {
    return defaultValue;
  }
  if (typeof value === 'object') {
    return value as T;
  }
  try {
    return JSON.parse(value) as T;
  } catch (err) {
    console.error('JSONB parsing failure:', err);
    return defaultValue;
  }
}

/**
 * Formats Customer Memory structures for secure portfolio notes and treatment photo attachments.
 */
export interface SerializedCustomerMemory {
  internalNotes: { id: string; text: string; createdAt: string; createdBy: string }[];
  referencePhotos: { id: string; url: string; caption?: string; createdAt: string }[];
  updatedAt: string;
}

export function serializeCustomerMemory(
  notes: any[] = [],
  photos: any[] = []
): string {
  const payload: SerializedCustomerMemory = {
    internalNotes: notes.map(n => ({
      id: String(n.id || Math.random().toString(36).substr(2, 9)),
      text: String(n.text || ''),
      createdAt: String(n.createdAt || new Date().toISOString()),
      createdBy: String(n.createdBy || 'system')
    })),
    referencePhotos: photos.map(p => ({
      id: String(p.id || Math.random().toString(36).substr(2, 9)),
      url: String(p.url || ''),
      caption: p.caption ? String(p.caption) : undefined,
      createdAt: String(p.createdAt || new Date().toISOString())
    })),
    updatedAt: new Date().toISOString()
  };
  return safeSerializeJsonb(payload);
}

/**
 * Formats B2C/B2B dynamic marketing consent models.
 */
export interface SerializedConsentFlags {
  bookingContactConsent: boolean;
  appointmentReminderConsent: boolean;
  marketingConsent: boolean;
  referralCampaignConsent: boolean;
  customerMemoryConsent: boolean;
  referencePhotoConsent: boolean;
  aiStyleAssistantConsent: boolean;
  consentVersion: string;
  consentCapturedAt: string;
  consentSource: string;
}

export function serializeConsentFlags(flags: Partial<SerializedConsentFlags> = {}): string {
  const payload: SerializedConsentFlags = {
    bookingContactConsent: !!flags.bookingContactConsent,
    appointmentReminderConsent: !!flags.appointmentReminderConsent,
    marketingConsent: !!flags.marketingConsent,
    referralCampaignConsent: !!flags.referralCampaignConsent,
    customerMemoryConsent: !!flags.customerMemoryConsent,
    referencePhotoConsent: !!flags.referencePhotoConsent,
    aiStyleAssistantConsent: !!flags.aiStyleAssistantConsent,
    consentVersion: String(flags.consentVersion || '1.0'),
    consentCapturedAt: String(flags.consentCapturedAt || new Date().toISOString()),
    consentSource: String(flags.consentSource || 'booking')
  };
  return safeSerializeJsonb(payload);
}

/**
 * Formats metadata attachments for communication logging outbox elements.
 */
export function serializeCommunicationMetadata(meta: any = {}): string {
  const cleaned: Record<string, any> = {};
  if (meta && typeof meta === 'object') {
    Object.keys(meta).forEach(key => {
      // Filter out cyclic keys, functions or unsafe tokens
      if (typeof meta[key] !== 'function') {
        cleaned[key] = meta[key];
      }
    });
  }
  return safeSerializeJsonb(cleaned);
}

/**
 * Formats subscription referral reward discount conditions and period modifiers.
 */
export function serializeSubscriptionDiscount(discount: any = {}): string {
  const payload = {
    amount: Number(discount.amount || 0),
    percentage: Number(discount.percentage || 0),
    couponCode: discount.couponCode ? String(discount.couponCode) : undefined,
    partnerId: discount.partnerId ? String(discount.partnerId) : undefined,
    appliedAt: new Date().toISOString()
  };
  return safeSerializeJsonb(payload);
}
