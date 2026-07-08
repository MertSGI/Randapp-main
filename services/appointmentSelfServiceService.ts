import { 
  Appointment, 
  AppointmentAccessToken, 
  AppointmentChangeRequest, 
  BookingPolicy 
 } from '../types';
import { getBookingRepository, getSelfServiceRepository } from './repositories';
import { communicationEventService } from './communicationEventService';
import { tenantService } from './tenantService';
import { auditLogService } from './auditLogService';

const POLICY_STORAGE_KEY = 'lari_tenant_booking_policies';

// Default booking policy per Part 5
export const DEFAULT_BOOKING_POLICY: BookingPolicy = {
  cancellationWindowHours: 24,
  allowCustomerCancellation: true,
  allowCustomerRescheduleRequest: true,
  requireOwnerApprovalForReschedule: true,
  maxAdvanceBookingDays: 30,
  minNoticeHours: 2,
  spamProtectionEnabled: true,
  maxBookingsPerPhonePerDay: 3,
  maxBookingsPerIpPerDay: 5,
  blockRepeatedNoShowPhone: true,
  noShowThreshold: 2,
  requireContactConsent: true
};

export const appointmentSelfServiceService = {
  // Asynchronous replacement for loaded tokens
  async getAllTokensAsync(tenantId: string): Promise<AppointmentAccessToken[]> {
    const repo = getSelfServiceRepository();
    const list = await repo.listTokens(tenantId);
    return list.map(t => ({
      id: t.id,
      tenantId: t.tenantId,
      appointmentId: t.appointmentId,
      tokenHash: t.tokenHash,
      purpose: 'view', // mapped
      status: t.usedAt ? 'used' : 'active',
      expiresAt: t.expiresAt,
      createdAt: t.createdAt
    }));
  },

  // Asynchronous replacement for loaded change requests
  async getAllChangeRequestsAsync(tenantId: string): Promise<AppointmentChangeRequest[]> {
    const repo = getSelfServiceRepository();
    const list = await repo.listChangeRequests(tenantId);
    return list.map(r => ({
      id: r.id,
      tenantId: r.tenantId,
      appointmentId: r.appointmentId,
      customerId: r.customerId || '',
      type: r.requestType === 'cancellation' ? 'cancellation' : 'reschedule',
      status: r.status === 'applied' ? 'applied' : r.status === 'approved' ? 'approved' : r.status === 'rejected' ? 'rejected' : 'requested',
      reason: r.reason,
      requestedDateTime: r.proposedDate && r.proposedTime ? `${r.proposedDate} ${r.proposedTime}` : r.requestedDateTime,
      customerNote: r.reason,
      createdAt: r.createdAt,
      updatedAt: r.createdAt
    }));
  },

  // Helper to load booking policy for a tenant
  getBookingPolicy(tenantId: string): BookingPolicy {
    if (typeof window === 'undefined') return DEFAULT_BOOKING_POLICY;
    try {
      const stored = localStorage.getItem(`${POLICY_STORAGE_KEY}_${tenantId}`);
      if (stored) {
        return { ...DEFAULT_BOOKING_POLICY, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.error('Failed to parse booking policy for tenant ' + tenantId, e);
    }
    return DEFAULT_BOOKING_POLICY;
  },

  // Helper to save booking policy for a tenant
  saveBookingPolicy(tenantId: string, policy: Partial<BookingPolicy>): BookingPolicy {
    const current = this.getBookingPolicy(tenantId);
    const updated = { ...current, ...policy };
    if (typeof window !== 'undefined') {
      localStorage.setItem(`${POLICY_STORAGE_KEY}_${tenantId}`, JSON.stringify(updated));
    }
    return updated;
  },

  // Part 3: createAppointmentAccessToken
  async createAppointmentAccessToken(
    tenantId: string, 
    appointmentId: string, 
    purpose: AppointmentAccessToken['purpose']
  ): Promise<string> {
    const repo = getSelfServiceRepository();
    
    // Generate secure simulated plain token
    const token = `apt_tok_${Math.random().toString(36).substring(2, 9)}${Math.random().toString(36).substring(2, 9)}`;
    const id = `tok_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // 7 days expiration default
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    
    await repo.createToken(tenantId, {
      id,
      appointmentId,
      tokenHash: token,
      expiresAt,
      purpose,
      createdAt: new Date().toISOString()
    });

    try {
      auditLogService.logAuditEvent({
        tenantId,
        actorType: 'system',
        category: 'customer_self_service',
        severity: 'info',
        action: 'self_service_token_created',
        entityType: 'AppointmentAccessToken',
        entityId: id,
        summary: `Hizmet erişim bağlantı belirteci oluşturuldu: [Amaç: ${purpose}]`,
        safeDetails: {
          tokenId: id,
          appointmentId,
          purpose,
          expiresAt
        }
      });
    } catch (e) {
      console.error('Audit logging for token creation failed:', e);
    }

    return token;
  },

  // Part 3: validateAppointmentAccessToken
  async validateAppointmentAccessToken(token: string): Promise<boolean> {
    const repo = getSelfServiceRepository();
    const tokenObj = await repo.getTokenByHash(token);
    
    if (!tokenObj) return false;
    if (tokenObj.usedAt) return false;
    
    const expired = new Date(tokenObj.expiresAt).getTime() < Date.now();
    if (expired) {
      return false;
    }
    
    return true;
  },

  // Part 3: getAppointmentByAccessToken
  async getAppointmentByAccessToken(token: string): Promise<{ appointment: Appointment; tokenObj: AppointmentAccessToken } | null> {
    const repo = getSelfServiceRepository();
    const tokenObj = await repo.getTokenByHash(token);
    if (!tokenObj) return null;
    
    const isExpired = new Date(tokenObj.expiresAt).getTime() < Date.now();
    if (isExpired || tokenObj.usedAt) return null;

    try {
      const appointment = await getBookingRepository().getAppointmentById(tokenObj.appointmentId);
      if (!appointment || appointment.tenantId !== tokenObj.tenantId) return null;
      
      const mappedTokenObj: AppointmentAccessToken = {
        id: tokenObj.id,
        tenantId: tokenObj.tenantId,
        appointmentId: tokenObj.appointmentId,
        tokenHash: tokenObj.tokenHash,
        purpose: 'view',
        status: 'active',
        expiresAt: tokenObj.expiresAt,
        createdAt: tokenObj.createdAt || new Date().toISOString()
      };

      return { appointment, tokenObj: mappedTokenObj };
    } catch (e) {
      console.error('Error fetching appointment by access token', e);
      return null;
    }
  },

  // Part 3: revokeAppointmentAccessToken
  async revokeAppointmentAccessToken(tokenId: string): Promise<boolean> {
    const repo = getSelfServiceRepository();
    await repo.updateToken(tokenId, { usedAt: new Date().toISOString() });
    return true;
  },

  // Part 3: expireAppointmentAccessTokens (legacy sync bypass)
  expireAppointmentAccessTokens(): void {
    // Left as no-op to prevent sync compile errors since Supabase db handles expiration or we check dynamically in validateAppointmentAccessToken
  },

  // Helpers to calculate timing
  getAppointmentDateDetails(aptDate: string, aptTime: string): Date {
    // aptDate comes as YYYY-MM-DD, aptTime as HH:mm
    return new Date(`${aptDate}T${aptTime}:00`);
  },

  isCancellationLate(appointment: Appointment, policy: BookingPolicy): boolean {
    const aptTime = this.getAppointmentDateDetails(appointment.date, appointment.time).getTime();
    const cancelDeadline = aptTime - (policy.cancellationWindowHours * 60 * 60 * 1000);
    return Date.now() > cancelDeadline;
  },

  // Part 3: requestAppointmentCancellation
  async requestAppointmentCancellation(token: string, reason: string): Promise<{ changeRequest?: AppointmentChangeRequest; success: boolean; autoApplied: boolean; message: string }> {
    const validation = await this.getAppointmentByAccessToken(token);
    if (!validation) {
      return { success: false, autoApplied: false, message: 'Geçersiz veya süresi dolmuş bağlantı.' };
    }

    const { appointment, tokenObj } = validation;
    const policy = this.getBookingPolicy(tokenObj.tenantId);

    if (!policy.allowCustomerCancellation) {
      return { success: false, autoApplied: false, message: 'Bu işletme için müşteri iptali devre dışı bırakılmıştır.' };
    }

    const isLate = this.isCancellationLate(appointment, policy);
    const repo = getSelfServiceRepository();
    const id = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const newRequest: AppointmentChangeRequest = {
      id,
      tenantId: tokenObj.tenantId,
      appointmentId: appointment.id,
      customerId: appointment.customerId,
      type: 'cancellation',
      status: 'requested',
      reason,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    let autoApplied = false;
    let finalMessage = 'İptal talebiniz onay için işletmeye iletilmiştir.';

    // If cancellation is within the free window (not late), we can auto-apply if the tenant settings allow 
    // or auto-apply by default for non-late cancellations.
    if (!isLate) {
      autoApplied = true;
      newRequest.status = 'applied';
      newRequest.reviewedAt = new Date().toISOString();
      newRequest.reviewedBy = 'system';
      
      // Update appointment status in repository
      await getBookingRepository().cancelAppointment(appointment.id, reason, 'customer');
      await getBookingRepository().updateAppointment(appointment.id, { 
        status: 'cancelled_by_customer',
        cancelReason: reason,
        cancelledAt: new Date().toISOString(),
        cancelledBy: 'customer'
      });
      
      // Mark token as used
      await repo.updateToken(tokenObj.id, { usedAt: new Date().toISOString() });
      
      finalMessage = 'Randevunuz iptal edilmiştir.';
    } else {
      // Late cancellation is requested for owner review
      finalMessage = 'Randevunuza 24 saatten az süre kaldığı için iptal talebiniz salon onayına gönderilmiştir.';
    }

    await repo.createChangeRequest(tokenObj.tenantId, {
      id,
      appointmentId: appointment.id,
      requestType: 'cancellation',
      requestedBy: 'customer',
      proposedDate: null,
      proposedTime: null,
      reason,
      status: newRequest.status,
      createdAt: newRequest.createdAt
    });

    try {
      auditLogService.logAuditEvent({
        tenantId: tokenObj.tenantId,
        actorType: 'customer',
        category: 'customer_self_service',
        severity: autoApplied ? 'warning' : 'notice',
        action: autoApplied ? 'appointment_cancelled' : 'appointment_cancellation_requested',
        entityType: 'AppointmentChangeRequest',
        entityId: id,
        summary: autoApplied 
          ? `Müşteri randevuyu kendi iptal etti (${appointment.user_name || 'Müşteri'})`
          : `Müşteri randevu iptal talebi oluşturdu (${appointment.user_name || 'Müşteri'})`,
        safeDetails: {
          requestId: id,
          appointmentId: appointment.id,
          reason,
          autoApplied
        }
      });
    } catch (e) {
      console.error('Audit logging for cancellation request failed:', e);
    }

    // Queue communications outbox events
    try {
      const tenant = await tenantService.getTenantById(tokenObj.tenantId);
      const bizName = tenant?.branding?.businessName || tenant?.name || 'Güzellik Salonu';
      
      communicationEventService.queueCommunicationEvent({
        tenantId: tokenObj.tenantId,
        customerId: appointment.id, // fallback mapping
        appointmentId: appointment.id,
        audience: 'customer',
        channel: 'whatsapp',
        type: autoApplied ? 'booking_cancelled' : 'cancellation_request_created' as any,
        contextArgs: {
          customerName: appointment.user_name || 'Müşteri',
          businessName: bizName,
          serviceName: 'Hizmet',
          date: appointment.date,
          time: appointment.time,
          reason: reason
        }
      });
    } catch (e) {
      console.error('Failed to queue cancellation comms', e);
    }

    return { 
      changeRequest: newRequest, 
      success: true, 
      autoApplied, 
      message: finalMessage 
    };
  },

  // Part 3: requestAppointmentReschedule
  async requestAppointmentReschedule(token: string, requestedDateTime: string, note: string): Promise<{ changeRequest?: AppointmentChangeRequest; success: boolean; message: string }> {
    const validation = await this.getAppointmentByAccessToken(token);
    if (!validation) {
      return { success: false, message: 'Geçersiz veya süresi dolmuş bağlantı.' };
    }

    const { appointment, tokenObj } = validation;
    const policy = this.getBookingPolicy(tokenObj.tenantId);

    if (!policy.allowCustomerRescheduleRequest) {
      return { success: false, message: 'Bu işletme için randevu erteleme/değişiklik talebi devre dışı bırakılmıştır.' };
    }

    const repo = getSelfServiceRepository();
    const id = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const [proposedDate, proposedTime] = requestedDateTime.split(' ');

    const newRequest: AppointmentChangeRequest = {
      id,
      tenantId: tokenObj.tenantId,
      appointmentId: appointment.id,
      customerId: appointment.customerId,
      type: 'reschedule',
      status: 'requested',
      requestedDateTime, // Should be "YYYY-MM-DD HH:mm"
      customerNote: note,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await repo.createChangeRequest(tokenObj.tenantId, {
      id,
      appointmentId: appointment.id,
      requestType: 'reschedule',
      requestedBy: 'customer',
      proposedDate: proposedDate || null,
      proposedTime: proposedTime || null,
      reason: note,
      status: 'requested',
      createdAt: newRequest.createdAt
    });

    try {
      auditLogService.logAuditEvent({
        tenantId: tokenObj.tenantId,
        actorType: 'customer',
        category: 'customer_self_service',
        severity: 'notice',
        action: 'appointment_reschedule_requested',
        entityType: 'AppointmentChangeRequest',
        entityId: id,
        summary: `Müşteri randevu erteleme talebi oluşturdu (${appointment.user_name || 'Müşteri'})`,
        safeDetails: {
          requestId: id,
          appointmentId: appointment.id,
          requestedDateTime,
          note
        }
      });
    } catch (e) {
      console.error('Audit logging for reschedule request failed:', e);
    }

    // Queue communications outbox
    try {
      const tenant = await tenantService.getTenantById(tokenObj.tenantId);
      const bizName = tenant?.branding?.businessName || tenant?.name || 'Güzellik Salonu';
      
      communicationEventService.queueCommunicationEvent({
        tenantId: tokenObj.tenantId,
        customerId: appointment.id,
        appointmentId: appointment.id,
        audience: 'customer',
        channel: 'whatsapp',
        type: 'reschedule_request_created' as any,
        contextArgs: {
          customerName: appointment.user_name || 'Müşteri',
          businessName: bizName,
          date: appointment.date,
          time: appointment.time,
          newDate: proposedDate || '',
          newTime: proposedTime || '',
          notes: note
        }
      });
    } catch (e) {
      console.error('Failed to queue reschedule request comms', e);
    }

    return {
      changeRequest: newRequest,
      success: true,
      message: 'Randevu değişiklik talebiniz salon onayına iletilmiştir.'
    };
  },

  // Part 3: confirmAppointmentByToken
  async confirmAppointmentByToken(token: string): Promise<boolean> {
    const validation = await this.getAppointmentByAccessToken(token);
    if (!validation) return false;

    const { appointment, tokenObj } = validation;
    const repo = getSelfServiceRepository();

    try {
      // Confirm the appointment status
      await getBookingRepository().updateAppointment(appointment.id, { 
        status: 'confirmed' 
      });

      // Mark token as used
      await repo.updateToken(tokenObj.id, { usedAt: new Date().toISOString() });

      try {
        auditLogService.logAuditEvent({
          tenantId: tokenObj.tenantId,
          actorType: 'customer',
          category: 'customer_self_service',
          severity: 'info',
          action: 'appointment_confirmed_by_customer',
          entityType: 'Appointment',
          entityId: appointment.id,
          summary: `Randevu müşteri tarafından bağlantı uyarısıyla onaylandı: (${appointment.user_name || 'Müşteri'})`,
          safeDetails: {
            appointmentId: appointment.id,
            tokenId: tokenObj.id
          }
        });
      } catch (ae) {
        console.error('Audit logging for customer confirm failed:', ae);
      }

      const tenant = await tenantService.getTenantById(tokenObj.tenantId);
      const bizName = tenant?.branding?.businessName || tenant?.name || 'Güzellik Salonu';

      // Queue outbox event
      communicationEventService.queueCommunicationEvent({
        tenantId: tokenObj.tenantId,
        customerId: appointment.id,
        appointmentId: appointment.id,
        audience: 'customer',
        channel: 'whatsapp',
        type: 'appointment_confirmed_by_customer' as any,
        contextArgs: {
          customerName: appointment.user_name || 'Müşteri',
          businessName: bizName,
          date: appointment.date,
          time: appointment.time
        }
      });

      return true;
    } catch (e) {
      console.error('Error confirming appointment by token', e);
      return false;
    }
  },

  // Part 3: getSelfServiceReadinessSummary
  async getSelfServiceReadinessSummary(tenantId: string) {
    const repo = getSelfServiceRepository();
    const tokens = await repo.listTokens(tenantId);
    const requests = await repo.listChangeRequests(tenantId);

    return {
      totalTokensGenerated: tokens.length,
      activeTokensCount: tokens.filter(t => !t.usedAt).length,
      totalRequestsCount: requests.length,
      pendingCancellations: requests.filter(r => r.requestType === 'cancellation' && r.status === 'requested').length,
      pendingReschedules: requests.filter(r => r.requestType === 'reschedule' && r.status === 'requested').length
    };
  },

  // Admin Actions to review change requests
  async reviewChangeRequest(
    tenantId: string, 
    requestId: string, 
    status: 'approved' | 'rejected', 
    ownerNote?: string
  ): Promise<boolean> {
    const repo = getSelfServiceRepository();
    const requests = await repo.listChangeRequests(tenantId);
    const req = requests.find(r => r.id === requestId);
    if (!req) return false;
    if (req.status !== 'requested') return false;

    try {
      const appointment = await getBookingRepository().getAppointmentById(req.appointmentId);
      if (!appointment) return false;

      const updatedStatus = status === 'approved' ? 'approved' : 'rejected';
      const resolvedAt = new Date().toISOString();

      const tenant = await tenantService.getTenantById(tenantId);
      const bizName = tenant?.branding?.businessName || tenant?.name || 'Güzellik Salonu';

      if (status === 'approved') {
        if (req.requestType === 'cancellation') {
          // Cancel appointment
          await getBookingRepository().cancelAppointment(appointment.id, req.reason || 'Müşteri iptal talebi', 'customer');
          await getBookingRepository().updateAppointment(appointment.id, {
            status: 'cancelled_by_customer',
            cancelReason: req.reason || 'Müşteri iptal talebi',
            cancelledAt: new Date().toISOString(),
            cancelledBy: 'customer'
          });
          
          await repo.updateChangeRequest(requestId, {
            status: 'applied',
            resolvedAt,
            resolvedBy: 'tenant_owner'
          });

          // Queue outbox approval event
          communicationEventService.queueCommunicationEvent({
            tenantId,
            customerId: appointment.id,
            appointmentId: appointment.id,
            audience: 'customer',
            channel: 'whatsapp',
            type: 'cancellation_request_approved' as any,
            contextArgs: {
              customerName: appointment.user_name || 'Müşteri',
              businessName: bizName,
              date: appointment.date,
              time: appointment.time,
              notes: ownerNote || ''
            }
          });
        } else if (req.requestType === 'reschedule' && req.proposedDate && req.proposedTime) {
          // Apply reschedule
          await getBookingRepository().updateAppointment(appointment.id, {
            date: req.proposedDate,
            time: req.proposedTime
          });
          
          await repo.updateChangeRequest(requestId, {
            status: 'applied',
            resolvedAt,
            resolvedBy: 'tenant_owner'
          });

          // Queue outbox approval event
          communicationEventService.queueCommunicationEvent({
            tenantId,
            customerId: appointment.id,
            appointmentId: appointment.id,
            audience: 'customer',
            channel: 'whatsapp',
            type: 'reschedule_request_approved' as any,
            contextArgs: {
              customerName: appointment.user_name || 'Müşteri',
              businessName: bizName,
              oldDate: appointment.date,
              oldTime: appointment.time,
              date: req.proposedDate,
              time: req.proposedTime,
              notes: ownerNote || ''
            }
          });
        }
      } else {
        // Rejected
        await repo.updateChangeRequest(requestId, {
          status: 'rejected',
          resolvedAt,
          resolvedBy: 'tenant_owner'
        });

        communicationEventService.queueCommunicationEvent({
          tenantId,
          customerId: appointment.id,
          appointmentId: appointment.id,
          audience: 'customer',
          channel: 'whatsapp',
          type: req.requestType === 'cancellation' ? 'cancellation_request_rejected' as any : 'reschedule_request_rejected' as any,
          contextArgs: {
            customerName: appointment.user_name || 'Müşteri',
            businessName: bizName,
            date: appointment.date,
            time: appointment.time,
            notes: ownerNote || ''
          }
        });
      }

      return true;
    } catch (e) {
      console.error('Error reviewing change request', e);
      return false;
    }
  }
};
