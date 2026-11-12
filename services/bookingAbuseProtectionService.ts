import { getBookingRepository } from './repositories';
import { appointmentSelfServiceService } from './appointmentSelfServiceService';
import { auditLogService } from './auditLogService';
import { supportTicketService } from './supportTicketService';
import { parsePublicBookingPhone, normalizePublicBookingPhone } from './publicBookingOtpService';
import { readStrictStoredBookingPolicy } from './repositories/localBookingRepository';

const ATTEMPTS_STORAGE_KEY = 'lari_booking_attempts';
const NOSHOW_STORAGE_KEY = 'lari_noshow_signals';

// In-memory fallback for environments without localStorage (Node.js tests, SSR)
let memoryAttempts: BookingAttempt[] = [];
let memoryNoShowSignals: NoShowSignal[] = [];

export interface BookingAttempt {
  id: string;
  tenantId: string;
  phone: string;
  email: string;
  clientFingerprint?: string;
  success: boolean;
  timestamp: string;
}

export interface NoShowSignal {
  tenantId: string;
  phone: string;
  timestamp: string;
}

export interface NoShowRiskBadge {
  hasRisk: boolean;
  count: number;
  level: 'none' | 'medium' | 'high';
  label: string;
  badgeText: string;
  actionText: string;
  actionRecommended: string;
  phone: string;
  severityColor: 'none' | 'amber' | 'red';
}

export const bookingAbuseProtectionService = {
  // Helper to load booking attempts
  getAllAttempts(): BookingAttempt[] {
    if (typeof window === 'undefined') return memoryAttempts;
    try {
      const stored = localStorage.getItem(ATTEMPTS_STORAGE_KEY);
      return stored ? JSON.parse(stored) : memoryAttempts;
    } catch {
      return memoryAttempts;
    }
  },

  // Helper to save booking attempts
  saveAllAttempts(attempts: BookingAttempt[]): void {
    memoryAttempts = attempts;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(ATTEMPTS_STORAGE_KEY, JSON.stringify(attempts));
      } catch {}
    }
  },

  // Helper to load no-show signals
  getAllNoShowSignals(): NoShowSignal[] {
    if (typeof window === 'undefined') return memoryNoShowSignals;
    try {
      const stored = localStorage.getItem(NOSHOW_STORAGE_KEY);
      return stored ? JSON.parse(stored) : memoryNoShowSignals;
    } catch {
      return memoryNoShowSignals;
    }
  },

  // Helper to save no-show signals
  saveAllNoShowSignals(signals: NoShowSignal[]): void {
    memoryNoShowSignals = signals;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(NOSHOW_STORAGE_KEY, JSON.stringify(signals));
      } catch {}
    }
  },

  // Part 8 & V1-WQ-07: evaluateBookingRequest
  async evaluateBookingRequest(input: {
    tenantId: string;
    phone: string;
    email: string;
    date?: string;
    serviceId?: string;
    clientFingerprint?: string;
  }): Promise<{ allowed: boolean; reason?: string; reasonCode?: string }> {
    const blockCheck = await this.shouldBlockBooking(input);
    if (blockCheck.block) {
      return { allowed: false, reason: blockCheck.reason, reasonCode: blockCheck.reasonCode };
    }
    return { allowed: true, reasonCode: 'ok' };
  },

  // Part 8 & V1-WQ-07: recordBookingAttempt
  recordBookingAttempt(input: {
    tenantId: string;
    phone: string;
    email: string;
    clientFingerprint?: string;
    success: boolean;
  }): void {
    const attempts = this.getAllAttempts();
    const id = `att_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const newAttempt: BookingAttempt = {
      id,
      tenantId: input.tenantId,
      phone: normalizePublicBookingPhone(input.phone),
      email: input.email.toLowerCase().trim(),
      clientFingerprint: input.clientFingerprint,
      success: input.success,
      timestamp: new Date().toISOString()
    };
    attempts.push(newAttempt);
    this.saveAllAttempts(attempts);
  },

  // Part 8: getBookingAbuseSignals
  getBookingAbuseSignals(tenantId: string) {
    const attempts = this.getAllAttempts().filter(a => a.tenantId === tenantId);
    const noShowSignals = this.getAllNoShowSignals().filter(n => n.tenantId === tenantId);

    // Group attempts by phone to list high frequency callers
    const phoneCalls: Record<string, number> = {};
    attempts.forEach(a => {
      if (a.phone) {
        phoneCalls[a.phone] = (phoneCalls[a.phone] || 0) + 1;
      }
    });

    const flaggedPhones = Object.entries(phoneCalls)
      .filter(([_, count]) => count > 5)
      .map(([phone, count]) => ({ phone, bookingAttemptsToday: count }));

    return {
      totalAttemptsCount: attempts.length,
      failedAttemptsCount: attempts.filter(a => !a.success).length,
      flaggedPhones,
      noShowSignalsCount: noShowSignals.length
    };
  },

  // Part 8 & V1-WQ-07: shouldBlockBooking
  async shouldBlockBooking(input: {
    tenantId: string;
    phone: string;
    email: string;
    date?: string;
    serviceId?: string;
    clientFingerprint?: string;
  }): Promise<{ block: boolean; reason?: string; reasonCode?: string }> {
    const storedPolicy = readStrictStoredBookingPolicy(input.tenantId);
    if (storedPolicy.state === 'corrupt') {
      return {
        block: true,
        reasonCode: 'temporary_failure',
        reason: 'Güvenlik politikası okunamadı. Lütfen tekrar deneyin.'
      };
    }

    let policy;
    try {
      const basePolicy = appointmentSelfServiceService.getBookingPolicy(input.tenantId);
      if (!basePolicy || typeof basePolicy !== 'object') {
        return {
          block: true,
          reasonCode: 'temporary_failure',
          reason: 'Güvenlik politikası doğrulanamadı. Lütfen tekrar deneyin.'
        };
      }
      policy = storedPolicy.state === 'present' ? { ...basePolicy, ...storedPolicy.record } : basePolicy;
    } catch {
      return {
        block: true,
        reasonCode: 'temporary_failure',
        reason: 'Güvenlik politikası doğrulanırken bir hata oluştu. Lütfen tekrar deneyin.'
      };
    }

    // FINDING-ADIM010-010: Strict schema and type validation for all security policy fields
    if (
      typeof policy.requireOtpForBooking !== 'boolean' ||
      typeof policy.spamProtectionEnabled !== 'boolean' ||
      typeof policy.blockRepeatedNoShowPhone !== 'boolean' ||
      typeof policy.maxBookingsPerPhonePerDay !== 'number' ||
      !Number.isFinite(policy.maxBookingsPerPhonePerDay) ||
      !Number.isInteger(policy.maxBookingsPerPhonePerDay) ||
      policy.maxBookingsPerPhonePerDay < 1 ||
      typeof policy.noShowThreshold !== 'number' ||
      !Number.isFinite(policy.noShowThreshold) ||
      !Number.isInteger(policy.noShowThreshold) ||
      policy.noShowThreshold < 1
    ) {
      return {
        block: true,
        reasonCode: 'temporary_failure',
        reason: 'Güvenlik politikası doğrulanamadı. Lütfen tekrar deneyin.'
      };
    }

    // FINDING-ADIM010-009: Enforce phone validity and OTP phone requirement
    // unconditionally BEFORE any spamProtectionEnabled early return.
    const parsedPhone = parsePublicBookingPhone(input.phone);
    if (parsedPhone.provided && !parsedPhone.valid) {
      return {
        block: true,
        reasonCode: 'invalid_phone',
        reason: 'Geçersiz telefon numarası.'
      };
    }

    if (policy.requireOtpForBooking && !parsedPhone.valid) {
      return {
        block: true,
        reasonCode: 'invalid_phone',
        reason: 'Bu salon için telefon numarası zorunludur.'
      };
    }

    const cleanPhone = parsedPhone.canonical;
    const cleanEmail = (input.email || '').toLowerCase().trim();
    const cleanFp = (input.clientFingerprint || '').trim();

    // FINDING-ADIM010-011: Anonymous boundary check (!cleanPhone && !cleanFp)
    // must fail-closed REGARDLESS of policy.spamProtectionEnabled.
    if (!cleanPhone && !cleanFp) {
      return {
        block: true,
        reasonCode: 'rate_limit_exceeded',
        reason: 'Güvenlik sınırları doğrulanamadı. Lütfen telefon numaranızı girin veya tarayıcınızı güncelleyin.'
      };
    }

    if (!policy.spamProtectionEnabled) {
      return { block: false };
    }

    const attempts = this.getAllAttempts();
    const nowMs = Date.now();
    const tenMinutesAgoMs = nowMs - 10 * 60 * 1000;

    // 0a. Phone Burst Limit (max 5 booking attempts per 10 minutes)
    if (cleanPhone) {
      const recentPhoneAttempts = attempts.filter(a => {
        return a.tenantId === input.tenantId &&
          a.phone === cleanPhone &&
          new Date(a.timestamp).getTime() > tenMinutesAgoMs;
      });

      if (recentPhoneAttempts.length >= 5) {
        return {
          block: true,
          reasonCode: 'rate_limit_exceeded',
          reason: 'Çok fazla rezervasyon denemesi yapıldı. Lütfen biraz bekleyin ve tekrar deneyin.'
        };
      }
    } else if (cleanEmail) {
      // 0a-email. Email Burst Limit when phone is missing (max 5 booking attempts per 10 minutes)
      const recentEmailAttempts = attempts.filter(a => {
        return a.tenantId === input.tenantId &&
          a.email === cleanEmail &&
          new Date(a.timestamp).getTime() > tenMinutesAgoMs;
      });

      if (recentEmailAttempts.length >= 5) {
        return {
          block: true,
          reasonCode: 'rate_limit_exceeded',
          reason: 'Bu e-posta adresi ile çok fazla rezervasyon denemesi yapıldı. Lütfen biraz bekleyin.'
        };
      }
    }

    // 0b. Client Fingerprint Burst Limit (max 10 booking attempts per 10 minutes)
    if (cleanFp) {
      const recentFpAttempts = attempts.filter(a => {
        return a.tenantId === input.tenantId &&
          a.clientFingerprint === cleanFp &&
          new Date(a.timestamp).getTime() > tenMinutesAgoMs;
      });

      if (recentFpAttempts.length >= 10) {
        return {
          block: true,
          reasonCode: 'rate_limit_exceeded',
          reason: 'Cihazınızdan çok fazla istek gönderildi. Lütfen biraz bekleyin.'
        };
      }
    }

    // 1. Max bookings per phone or email per day limit
    const todayStr = new Date().toISOString().split('T')[0];
    if (cleanPhone) {
      const phoneAttemptsToday = attempts.filter(a => {
        return a.tenantId === input.tenantId &&
          a.phone === cleanPhone &&
          a.success &&
          a.timestamp.startsWith(todayStr);
      });

      if (phoneAttemptsToday.length >= policy.maxBookingsPerPhonePerDay) {
        try {
          const ev = auditLogService.logAuditEvent({
            tenantId: input.tenantId,
            actorType: 'customer',
            category: 'anti_abuse',
            severity: 'warning',
            action: 'booking_blocked_rate_limit',
            summary: `Rezervasyon engellendi: Telefon günlük limit aşımı (${cleanPhone})`,
            safeDetails: { phone: cleanPhone }
          });
          
          supportTicketService.createSupportTicket({
            tenantId: input.tenantId,
            source: 'system',
            category: 'abuse_spam',
            priority: 'normal',
            title: `Olası Spam Engel: Telefon Günlük Oda Limiti (#${cleanPhone})`,
            description: `Sistem, ${cleanPhone} telefon numarasını günlük maksimum online randevu limitine (${policy.maxBookingsPerPhonePerDay}) ulaştığı için engelledi.`,
            requesterPhone: cleanPhone,
            relatedAuditEventIds: [ev.id]
          });
        } catch (e) {
          console.error('Anti-abuse logging failed:', e);
        }

        return { 
          block: true, 
          reasonCode: 'rate_limit_exceeded',
          reason: 'Günlük maksimum online randevu limitine ulaştınız. Lütfen yarın tekrar deneyin veya işletmeyle iletişime geçin.' 
        };
      }
    } else if (cleanEmail) {
      const emailAttemptsToday = attempts.filter(a => {
        return a.tenantId === input.tenantId &&
          a.email === cleanEmail &&
          a.success &&
          a.timestamp.startsWith(todayStr);
      });

      if (emailAttemptsToday.length >= policy.maxBookingsPerPhonePerDay) {
        return {
          block: true,
          reasonCode: 'rate_limit_exceeded',
          reason: 'Günlük maksimum online randevu limitine ulaştınız. Lütfen yarın tekrar deneyin veya işletmeyle iletişime geçin.'
        };
      }
    }

    // 2. Repeated no-show phone blocking (only if cleanPhone is provided)
    if (cleanPhone && policy.blockRepeatedNoShowPhone) {
      const riskCount = this.getNoShowRiskCountForCustomer(input.tenantId, cleanPhone);
      if (riskCount >= policy.noShowThreshold) {
        try {
          const ev = auditLogService.logAuditEvent({
            tenantId: input.tenantId,
            actorType: 'customer',
            category: 'anti_abuse',
            severity: 'critical',
            action: 'booking_blocked_no_show',
            summary: `Rezervasyon engellendi: No-Show Kara Liste (${cleanPhone})`,
            safeDetails: { phone: cleanPhone, noShowCount: riskCount }
          });
          
          supportTicketService.createSupportTicket({
            tenantId: input.tenantId,
            source: 'system',
            category: 'abuse_spam',
            priority: 'high',
            title: `Otomatik No-Show Blokajı Escalesi: ${cleanPhone}`,
            description: `Sistem, ${cleanPhone} numarasını geçmiş limit üstü no-show sayısından (${riskCount} >= ${policy.noShowThreshold}) ötürü kara listeye aldı.`,
            requesterPhone: cleanPhone,
            relatedAuditEventIds: [ev.id]
          });
        } catch (e) {
          console.error('No-show logging failed:', e);
        }

        return {
          block: true,
          reasonCode: 'no_show_blocked',
          reason: 'Geçmiş randevularınıza defalarca katılmadığınız (no-show) saptandığı için online rezervasyon sistemimiz kullanımınıza kapatılmıştır. Lütfen işletmeyle doğrudan iletişime geçin.'
        };
      }
    }

    // 3. Duplicate appointment warning for same candidate on same date for same service 
    if (input.date && input.serviceId) {
      try {
        const appointments = await getBookingRepository().listAppointments(input.tenantId);
        const duplicate = appointments.find(apt => {
          if (apt.status !== 'confirmed' || apt.date !== input.date || apt.serviceId !== input.serviceId) {
            return false;
          }
          if (cleanPhone) {
            const aptPhone = normalizePublicBookingPhone(apt.phone);
            return aptPhone === cleanPhone;
          } else if (cleanEmail) {
            const aptEmail = (apt.user_email || '').toLowerCase().trim();
            return aptEmail === cleanEmail;
          }
          return false;
        });

        if (duplicate) {
          return {
            block: true,
            reasonCode: 'duplicate_booking_same_day',
            reason: 'Seçilen tarih ve hizmet için zaten aktif bir randevunuz bulunmaktadır.'
          };
        }
      } catch (e) {
        console.error('Error querying duplicate bookings', e);
        // Fail-closed invariant (FINDING-ADIM010-005): Terminate evaluation on DB/repo error
        return {
          block: true,
          reasonCode: 'temporary_failure',
          reason: 'Randevu uygunluğu kontrol edilirken bir hata oluştu. Lütfen tekrar deneyin.'
        };
      }
    }

    return { block: false };
  },

  // Part 8: recordNoShowSignal
  recordNoShowSignal(tenantId: string, customerPhone: string): void {
    const cleanPhone = normalizePublicBookingPhone(customerPhone);
    if (!cleanPhone) return;
    const signals = this.getAllNoShowSignals();
    
    const newSignal: NoShowSignal = {
      tenantId,
      phone: cleanPhone,
      timestamp: new Date().toISOString()
    };
    
    signals.push(newSignal);
    this.saveAllNoShowSignals(signals);

    try {
      auditLogService.logAuditEvent({
        tenantId,
        actorType: 'staff',
        category: 'anti_abuse',
        severity: 'notice',
        action: 'customer_no_show_recorded',
        summary: `No-Show Sinyali Kaydedildi: ${cleanPhone}`,
        safeDetails: { phone: cleanPhone }
      });
    } catch (e) {
      console.error('No-show audit logging failed:', e);
    }
  },

  // Helper inside risk calculation
  getNoShowRiskCountForCustomer(tenantId?: string | null, customerPhone?: string | null): number {
    const cleanPhone = normalizePublicBookingPhone(customerPhone || '');
    if (!cleanPhone) return 0;
    const signals = this.getAllNoShowSignals();
    return signals.filter(s => (!tenantId || s.tenantId === tenantId) && s.phone === cleanPhone).length;
  },

  // Part 8: getNoShowRiskForCustomer
  getNoShowRiskForCustomer(tenantId?: string | null, customerPhone?: string | null): 'high' | 'medium' | 'low' {
    const count = this.getNoShowRiskCountForCustomer(tenantId, customerPhone);
    if (count >= 2) return 'high';
    if (count === 1) return 'medium';
    return 'low';
  },

  // V1A-FUNC-02: getNoShowRiskBadge
  getNoShowRiskBadge(
    phoneOrInput?: string | { phone?: string; tenantId?: string; appointments?: Array<{ phone?: string; status?: string }> } | null,
    tenantIdParam?: string,
    appointmentsParam?: Array<{ phone?: string; status?: string }>
  ): NoShowRiskBadge {
    let rawPhone = '';
    let tenantId = tenantIdParam;
    let appointments = appointmentsParam;

    if (phoneOrInput && typeof phoneOrInput === 'object') {
      rawPhone = phoneOrInput.phone || '';
      if (phoneOrInput.tenantId) {
        tenantId = phoneOrInput.tenantId;
      }
      if (phoneOrInput.appointments) {
        appointments = phoneOrInput.appointments;
      }
    } else if (typeof phoneOrInput === 'string') {
      rawPhone = phoneOrInput;
    }

    const cleanPhone = normalizePublicBookingPhone(rawPhone);
    if (!cleanPhone) {
      return {
        hasRisk: false,
        count: 0,
        level: 'none',
        label: '',
        badgeText: '',
        actionText: '',
        actionRecommended: '',
        phone: '',
        severityColor: 'none',
      };
    }

    const signalsCount = this.getNoShowRiskCountForCustomer(tenantId, cleanPhone);
    let aptCount = 0;
    if (Array.isArray(appointments)) {
      aptCount = appointments.filter(a => {
        if (a.status !== 'no_show') return false;
        const p = normalizePublicBookingPhone(a.phone || '');
        return p === cleanPhone;
      }).length;
    }
    const count = Math.max(signalsCount, aptCount);

    if (count === 0) {
      return {
        hasRisk: false,
        count: 0,
        level: 'none',
        label: '',
        badgeText: '',
        actionText: '',
        actionRecommended: '',
        phone: cleanPhone,
        severityColor: 'none',
      };
    }

    if (count === 1) {
      return {
        hasRisk: true,
        count: 1,
        level: 'medium',
        label: '⚠️ No-Show Riski',
        badgeText: '⚠️ No-Show Riski (1 kez)',
        actionText: 'Müşteriyi arayarak randevuyu teyit edin',
        actionRecommended: 'Müşteriyi arayarak randevuyu teyit edin',
        phone: cleanPhone,
        severityColor: 'amber',
      };
    }

    return {
      hasRisk: true,
      count,
      level: 'high',
      label: '⚠️ No-Show Riski',
      badgeText: `⚠️ No-Show Riski (${count} kez)`,
      actionText: 'Müşteriyi arayarak randevuyu teyit edin (Yüksek Risk)',
      actionRecommended: 'Müşteriyi arayarak randevuyu teyit edin (Yüksek Risk)',
      phone: cleanPhone,
      severityColor: 'red',
    };
  },

  // Alias for V1A-FUNC-02
  getNoShowBadge(
    phoneOrInput?: string | { phone?: string; tenantId?: string; appointments?: Array<{ phone?: string; status?: string }> } | null,
    tenantIdParam?: string,
    appointmentsParam?: Array<{ phone?: string; status?: string }>
  ): NoShowRiskBadge {
    return this.getNoShowRiskBadge(phoneOrInput, tenantIdParam, appointmentsParam);
  },

  // Helper to clear no-show signals (tests/fixtures)
  clearAllNoShowSignals(): void {
    memoryNoShowSignals = [];
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(NOSHOW_STORAGE_KEY);
      } catch {}
    }
  }
};
