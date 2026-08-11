// services/postBookingSideEffectPolicy.ts

export interface PostBookingSideEffectPolicy {
  allowMockEmail: boolean;
  allowMockSms: boolean;
  allowMockWhatsApp: boolean;
  allowMockBusinessCalendarSync: boolean;
}

export function getPostBookingSideEffectPolicy(isSupabaseMode: boolean): PostBookingSideEffectPolicy {
  if (isSupabaseMode) {
    return {
      allowMockEmail: false,
      allowMockSms: false,
      allowMockWhatsApp: false,
      allowMockBusinessCalendarSync: false,
    };
  }
  return {
    allowMockEmail: true,
    allowMockSms: true,
    allowMockWhatsApp: true,
    allowMockBusinessCalendarSync: true,
  };
}
