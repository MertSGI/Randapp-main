import { getBookingRepository } from './repositories';
import { appointmentSelfServiceService } from './appointmentSelfServiceService';
import { auditLogService } from './auditLogService';
import { supportTicketService } from './supportTicketService';

const ATTEMPTS_STORAGE_KEY = 'lari_booking_attempts';
const NOSHOW_STORAGE_KEY = 'lari_noshow_signals';

export interface BookingAttempt {
  id: string;
  tenantId: string;
  phone: string;
  email: string;
  success: boolean;
  timestamp: string;
}

export interface NoShowSignal {
  tenantId: string;
  phone: string;
  timestamp: string;
}

export const bookingAbuseProtectionService = {
  // Helper to load booking attempts
  getAllAttempts(): BookingAttempt[] {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(ATTEMPTS_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  },

  // Helper to save booking attempts
  saveAllAttempts(attempts: BookingAttempt[]): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(ATTEMPTS_STORAGE_KEY, JSON.stringify(attempts));
    }
  },

  // Helper to load no-show signals
  getAllNoShowSignals(): NoShowSignal[] {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(NOSHOW_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  },

  // Helper to save no-show signals
  saveAllNoShowSignals(signals: NoShowSignal[]): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(NOSHOW_STORAGE_KEY, JSON.stringify(signals));
    }
  },

  // Part 8: evaluateBookingRequest
  async evaluateBookingRequest(input: { tenantId: string; phone: string; email: string; date?: string; serviceId?: string }): Promise<{ allowed: boolean; reason?: string }> {
    const blockCheck = await this.shouldBlockBooking(input);
    if (blockCheck.block) {
      return { allowed: false, reason: blockCheck.reason };
    }
    return { allowed: true };
  },

  // Part 8: recordBookingAttempt
  recordBookingAttempt(input: { tenantId: string; phone: string; email: string; success: boolean }): void {
    const attempts = this.getAllAttempts();
    const id = `att_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const newAttempt: BookingAttempt = {
      id,
      tenantId: input.tenantId,
      phone: input.phone.replace(/\s+/g, ''),
      email: input.email.toLowerCase().trim(),
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
      phoneCalls[a.phone] = (phoneCalls[a.phone] || 0) + 1;
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

  // Part 8: shouldBlockBooking
  async shouldBlockBooking(input: { tenantId: string; phone: string; email: string; date?: string; serviceId?: string }): Promise<{ block: boolean; reason?: string }> {
    const policy = appointmentSelfServiceService.getBookingPolicy(input.tenantId);
    if (!policy.spamProtectionEnabled) {
      return { block: false };
    }

    const cleanPhone = input.phone.replace(/\s+/g, '');
    const cleanEmail = input.email.toLowerCase().trim();

    // 1. Max bookings per phone per day limit
    const attempts = this.getAllAttempts();
    const todayStr = new Date().toISOString().split('T')[0];
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
        reason: 'Günlük maksimum online randevu limitine ulaştınız. Lütfen yarın tekrar deneyin veya işletmeyle iletişime geçin.' 
      };
    }

    // 2. Repeated no-show phone blocking
    if (policy.blockRepeatedNoShowPhone) {
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
          reason: 'Geçmiş randevularınıza defalarca katılmadığınız (no-show) saptandığı için online rezervasyon sistemimiz kullanımınıza kapatılmıştır. Lütfen işletmeyle doğrudan iletişime geçin.'
        };
      }
    }

    // 3. Duplicate appointment warning for same candidate on same date for same service 
    if (input.date && input.serviceId) {
      try {
        const appointments = await getBookingRepository().listAppointments(input.tenantId);
        const duplicate = appointments.find(apt => {
          const aptPhone = apt.phone ? apt.phone.replace(/\s+/g, '') : '';
          return apt.status === 'confirmed' &&
            aptPhone === cleanPhone &&
            apt.date === input.date &&
            apt.serviceId === input.serviceId;
        });

        if (duplicate) {
          return {
            block: true,
            reason: 'Seçilen tarih ve hizmet için zaten aktif bir randevunuz bulunmaktadır.'
          };
        }
      } catch (e) {
        console.error('Error querying duplicate bookings', e);
      }
    }

    return { block: false };
  },

  // Part 8: recordNoShowSignal
  recordNoShowSignal(tenantId: string, customerPhone: string): void {
    const signals = this.getAllNoShowSignals();
    const cleanPhone = customerPhone.replace(/\s+/g, '');
    
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
  getNoShowRiskCountForCustomer(tenantId: string, customerPhone: string): number {
    const cleanPhone = customerPhone.replace(/\s+/g, '');
    const signals = this.getAllNoShowSignals();
    return signals.filter(s => s.tenantId === tenantId && s.phone === cleanPhone).length;
  },

  // Part 8: getNoShowRiskForCustomer
  getNoShowRiskForCustomer(tenantId: string, customerPhone: string): 'high' | 'medium' | 'low' {
    const count = this.getNoShowRiskCountForCustomer(tenantId, customerPhone);
    if (count >= 2) return 'high';
    if (count === 1) return 'medium';
    return 'low';
  }
};
