import { Appointment, SERVICES } from '../types';
import { getBookingRepository } from './repositories';
import { notificationTemplateService } from './notificationTemplateService';
import { customerCampaignService } from './customerCampaignService';
import { communicationEventService } from './communicationEventService';
import { tenantService } from './tenantService';
import { appointmentSelfServiceService } from './appointmentSelfServiceService';
import { bookingAbuseProtectionService } from './bookingAbuseProtectionService';
import { auditLogService } from './auditLogService';

export const getAppointmentsKey = (tenantId: string) => `randapp:${tenantId}:appointments`;

export const getAppointments = async (tenantId: string): Promise<Appointment[]> => {
  return getBookingRepository().listAppointments(tenantId);
};

export const createAppointment = async (tenantId: string, appointment: Omit<Appointment, 'id' | 'tenantId' | 'createdAt'>): Promise<Appointment> => {
  const newApt = await getBookingRepository().createAppointment(tenantId, appointment);
  
  // Create and queue Communication Events safely
  try {
    const tObj = await tenantService.getTenantById(tenantId);
    const bizName = tObj?.branding?.businessName || tObj?.name || 'Güzellik Salonu';
    const sName = SERVICES.find(s => s.id === newApt.serviceId)?.name_tr || 'Hizmet';
    
    // Generate self service token and path
    const token = await appointmentSelfServiceService.createAppointmentAccessToken(tenantId, newApt.id, 'view');
    const manageUrl = `${window.location.protocol}//${window.location.host}/#/appointment/manage/${token}`;

    // Create customer notification event
    communicationEventService.queueCommunicationEvent({
      tenantId,
      customerId: newApt.id, // using appointment item id as fallback customer mapping
      appointmentId: newApt.id,
      audience: 'customer',
      channel: 'whatsapp',
      type: 'booking_created',
      contextArgs: {
        customerName: newApt.user_name || 'Müşteri',
        businessName: bizName,
        serviceName: sName,
        date: newApt.date || '',
        time: newApt.time || '',
        appointmentManageUrl: manageUrl
      }
    });

    // Create custom management link notification event
    communicationEventService.queueCommunicationEvent({
      tenantId,
      customerId: newApt.id,
      appointmentId: newApt.id,
      audience: 'customer',
      channel: 'whatsapp',
      type: 'appointment_manage_link_created' as any,
      contextArgs: {
        customerName: newApt.user_name || 'Müşteri',
        businessName: bizName,
        appointmentManageUrl: manageUrl
      }
    });

    // Create owner notification event
    communicationEventService.queueCommunicationEvent({
      tenantId,
      appointmentId: newApt.id,
      audience: 'business_owner',
      channel: 'in_app',
      type: 'booking_created',
      contextArgs: {
        customerName: newApt.user_name || 'Müşteri',
        businessName: bizName,
        serviceName: sName,
        date: newApt.date || '',
        time: newApt.time || ''
      }
    });
  } catch (err) {
    console.error('Failed to create appointment communication events:', err);
  }

  // Booking and referral association hook:
  try {
    const referrals = await customerCampaignService.listCustomerReferrals(tenantId);
    if (referrals && referrals.length > 0) {
      const clientPhone = appointment.phone ? appointment.phone.replace(/\s+/g, '') : '';
      const clientName = appointment.user_name ? appointment.user_name.toLowerCase().trim() : '';
      
      const matchedPendingReferral = referrals.find(r => {
        if (r.status !== 'pending') return false;
        
        const refPhone = r.referredCustomerPhone ? r.referredCustomerPhone.replace(/\s+/g, '') : '';
        if (clientPhone && refPhone && (clientPhone.includes(refPhone) || refPhone.includes(clientPhone))) {
          return true;
        }
        
        const refName = r.referredCustomerName ? r.referredCustomerName.toLowerCase().trim() : '';
        if (clientName && refName && (clientName.includes(refName) || refName.includes(clientName))) {
          return true;
        }
        return false;
      });

      if (matchedPendingReferral) {
        await customerCampaignService.attachReferralToAppointment(matchedPendingReferral.id, newApt.id);
        console.log(`Matched pending referral ${matchedPendingReferral.id} for new appointment ${newApt.id}`);
      }
    }
  } catch (err) {
    console.error('Error auto-associated referral with booking:', err);
  }

  try {
    auditLogService.logAuditEvent({
      tenantId,
      actorType: 'customer',
      category: 'booking',
      severity: 'info',
      action: 'appointment_created',
      entityType: 'Appointment',
      entityId: newApt.id,
      summary: `Randevu başarıyla oluşturuldu: ${newApt.user_name} - ${newApt.date} saat ${newApt.time}`,
      safeDetails: {
        appointmentId: newApt.id,
        customerName: newApt.user_name,
        date: newApt.date,
        time: newApt.time
      }
    });
  } catch (auditErr) {
    console.error('Audit logging for create appointment failed', auditErr);
  }

  return newApt;
};

export const updateAppointmentStatus = async (
  tenantId: string, 
  appointmentId: string, 
  status: Appointment['status'],
  cancelReason?: string,
  cancelledBy?: 'customer' | 'salon' | 'system'
): Promise<Appointment | null> => {
  if (status.includes('cancel')) {
    await getBookingRepository().cancelAppointment(appointmentId, cancelReason, cancelledBy);
  }
  
  const updatedApt = await getBookingRepository().updateAppointment(appointmentId, { status });

  // Hook Communication events on successful status transitions
  if (updatedApt) {
    try {
      auditLogService.logAuditEvent({
        tenantId,
        actorType: status === 'cancelled' && cancelledBy === 'customer' ? 'customer' : 'tenant_owner',
        category: 'booking',
        severity: status === 'cancelled' || status === 'no_show' ? 'warning' : 'info',
        action: `appointment_${status}`,
        entityType: 'Appointment',
        entityId: appointmentId,
        summary: `Randevu durumu güncellendi: ${status} (${updatedApt.user_name || 'Müşteri'})`,
        safeDetails: {
          appointmentId,
          status,
          cancelReason,
          cancelledBy
        }
      });
    } catch (e) {
      console.error('Audit log for update status failed:', e);
    }

    try {
      const tObj = await tenantService.getTenantById(tenantId);
      const bizName = tObj?.branding?.businessName || tObj?.name || 'Güzellik Salonu';
      const sName = SERVICES.find(s => s.id === updatedApt.serviceId)?.name_tr || 'Hizmet';
      const contextArgs = {
        customerName: updatedApt.user_name || 'Müşteri',
        businessName: bizName,
        serviceName: sName,
        date: updatedApt.date || '',
        time: updatedApt.time || ''
      };

      if (status === 'confirmed') {
        communicationEventService.queueCommunicationEvent({
          tenantId,
          customerId: updatedApt.id,
          appointmentId: updatedApt.id,
          audience: 'customer',
          channel: 'whatsapp',
          type: 'booking_confirmed',
          contextArgs
        });
      } else if (status === 'cancelled') {
        communicationEventService.queueCommunicationEvent({
          tenantId,
          customerId: updatedApt.id,
          appointmentId: updatedApt.id,
          audience: 'customer',
          channel: 'whatsapp',
          type: 'booking_cancelled',
          contextArgs
        });
      } else if (status === 'completed') {
        communicationEventService.queueCommunicationEvent({
          tenantId,
          customerId: updatedApt.id,
          appointmentId: updatedApt.id,
          audience: 'customer',
          channel: 'whatsapp',
          type: 'booking_completed',
          contextArgs
        });
      } else if (status === 'no_show') {
        // Record abuse protection no show trigger
        if (updatedApt.phone) {
          bookingAbuseProtectionService.recordNoShowSignal(tenantId, updatedApt.phone);
        }
        
        communicationEventService.queueCommunicationEvent({
          tenantId,
          customerId: updatedApt.id,
          appointmentId: updatedApt.id,
          audience: 'customer',
          channel: 'whatsapp',
          type: 'booking_no_show',
          contextArgs
        });
      }
    } catch (err) {
      console.error('Failed to trigger update status communication event:', err);
    }
  }

  // Completion Hook for referrals and reward ledger triggers:
  if (status === 'completed' || status === 'confirmed') {
    try {
      const referrals = await customerCampaignService.listCustomerReferrals(tenantId);
      if (referrals && referrals.length > 0) {
        let matchedReferral = referrals.find(r => r.appointmentId === appointmentId);
        
        if (!matchedReferral) {
          const appointmentDetails = await getBookingRepository().getAppointmentById(appointmentId);
          if (appointmentDetails) {
            const clientPhone = appointmentDetails.phone ? appointmentDetails.phone.replace(/\s+/g, '') : '';
            const clientName = appointmentDetails.user_name ? appointmentDetails.user_name.toLowerCase().trim() : '';
            
            matchedReferral = referrals.find(r => {
              if (r.status !== 'booked') return false;
              
              const refPhone = r.referredCustomerPhone ? r.referredCustomerPhone.replace(/\s+/g, '') : '';
              if (clientPhone && refPhone && (clientPhone.includes(refPhone) || refPhone.includes(clientPhone))) {
                return true;
              }
              const refName = r.referredCustomerName ? r.referredCustomerName.toLowerCase().trim() : '';
              if (clientName && refName && (clientName.includes(refName) || refName.includes(clientName))) {
                return true;
              }
              return false;
            });
          }
        }

        if (matchedReferral && matchedReferral.status !== 'completed' && matchedReferral.status !== 'rewarded') {
          await customerCampaignService.markReferralCompleted(matchedReferral.id);
          console.log(`Automatically completed referral ${matchedReferral.id} on appointment completion ${appointmentId}`);
        }
      }
    } catch (err) {
      console.error('Error auto-completing referral upon appointment status update:', err);
    }
  }

  return updatedApt;
};

export const deleteAppointment = async (tenantId: string, appointmentId: string): Promise<boolean> => {
  // We prefer cancellation in repository patterns since delete can orphan records,
  // but if hard delete is required by some tests:
  // For safety, cancel instead if it's not truly hard-deleted by repos, but we can't delete directly without exposing a delete interface.
  // We'll update the status to "cancelled"
  return await getBookingRepository().cancelAppointment(appointmentId, 'Deleted', 'system');
};

export const getBookedSlots = async (tenantId: string, date: string, staffId?: string): Promise<string[]> => {
  const appointments = await getBookingRepository().listAppointments(tenantId, { date });
  return appointments
    .filter((apt) => apt.status === 'confirmed' && (!staffId || apt.staffId === staffId))
    .map((apt) => apt.time);
};

