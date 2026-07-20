import { BookingRepository } from './types';
import { Appointment, CustomerProfile, CustomerMemoryNote } from '../../types';
import { fetchSupabase } from './supabaseClient';

export interface PublicBookingResult {
  success: boolean;
  appointmentId?: string;
  manageToken?: string;
  reasonCode: string;
}


export class SupabaseBookingRepository implements BookingRepository {
  async listAppointments(tenantId: string, filter?: { date?: string, upcomingOnly?: boolean }): Promise<Appointment[]> {
    try {
      let url = `/rest/v1/appointments?tenant_id=eq.${tenantId}&select=*`;
      if (filter?.date) {
        url += `&appointment_date=eq.${filter.date}`;
      }
      if (filter?.upcomingOnly) {
        const now = new Date().toISOString().split('T')[0];
        url += `&appointment_date=gte.${now}`;
      }
      const res = await fetchSupabase(url);
      if (!res.ok) return [];
      const data = await res.json();
      return data.map((a: any) => ({
        id: a.id,
        tenantId: a.tenant_id,
        userId: a.user_id,
        customerId: a.customer_id,
        user_name: a.user_name,
        user_email: a.user_email,
        phone: a.phone,
        serviceId: a.service_id,
        staffId: a.staff_id,
        date: a.appointment_date,
        time: a.appointment_time,
        status: a.status,
        notes: a.notes,
        cancelReason: a.cancel_reason,
        cancelledAt: a.cancelled_at,
        cancelledBy: a.cancelled_by,
        createdAt: a.created_at,
        syncedToGoogle: a.synced_to_google || false
      }));
    } catch { return []; }
  }

  async getAppointmentById(appointmentId: string): Promise<Appointment | null> {
    try {
      const res = await fetchSupabase(`/rest/v1/appointments?id=eq.${appointmentId}&select=*`);
      if (!res.ok) return null;
      const data = await res.json();
      const a = data[0];
      if (!a) return null;
      return {
        id: a.id,
        tenantId: a.tenant_id,
        userId: a.user_id,
        customerId: a.customer_id,
        user_name: a.user_name,
        user_email: a.user_email,
        phone: a.phone,
        serviceId: a.service_id,
        staffId: a.staff_id,
        date: a.appointment_date,
        time: a.appointment_time,
        status: a.status,
        notes: a.notes,
        cancelReason: a.cancel_reason,
        cancelledAt: a.cancelled_at,
        cancelledBy: a.cancelled_by,
        createdAt: a.created_at,
        syncedToGoogle: a.synced_to_google || false
      };
    } catch { return null; }
  }

  async createAppointment(tenantId: string, input: Omit<Appointment, 'id' | 'createdAt' | 'tenantId'>): Promise<Appointment> {
    const res = await fetchSupabase('/rest/v1/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify({
        tenant_id: tenantId,
        customer_id: input.customerId || null,
        user_name: input.user_name,
        user_email: input.user_email,
        phone: input.phone,
        service_id: input.serviceId,
        staff_id: input.staffId,
        appointment_date: input.date,
        appointment_time: input.time,
        status: input.status,
        notes: input.notes,
      })
    });
    if (!res.ok) {
      let errBody = '';
      try { errBody = await res.text(); } catch {}
      console.error('Supabase appointment INSERT failed', res.status, errBody);
      throw new Error(`Supabase insert failed: ${res.status} ${errBody}`);
    }
    const data = await res.json();
    const a = data[0];
    return {
      id: a.id,
      tenantId: a.tenant_id,
      userId: a.user_id,
      customerId: a.customer_id,
      user_name: a.user_name,
      user_email: a.user_email,
      phone: a.phone,
      serviceId: a.service_id,
      staffId: a.staff_id,
      date: a.appointment_date,
      time: a.appointment_time,
      status: a.status,
      notes: a.notes,
      cancelReason: a.cancel_reason,
      cancelledAt: a.cancelled_at,
      cancelledBy: a.cancelled_by,
      createdAt: a.created_at,
      syncedToGoogle: a.synced_to_google || false
    };
  }

  async updateAppointment(appointmentId: string, patch: Partial<Appointment>): Promise<Appointment | null> {
    const res = await fetchSupabase(`/rest/v1/appointments?id=eq.${appointmentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify({
        status: patch.status,
        cancel_reason: patch.cancelReason,
        cancelled_at: patch.cancelledAt,
        cancelled_by: patch.cancelledBy,
        appointment_date: patch.date,
        appointment_time: patch.time,
      }) // simplified
    });
    if (!res.ok) throw new Error('Supabase update failed');
    const data = await res.json();
    return data[0];
  }

  async cancelAppointment(appointmentId: string, reason?: string, cancelledBy?: 'customer' | 'salon' | 'system'): Promise<boolean> {
    const res = await this.updateAppointment(appointmentId, {
      status: `cancelled${cancelledBy ? '_by_' + cancelledBy : ''}` as any,
      cancelReason: reason,
      cancelledAt: new Date().toISOString(),
      cancelledBy
    });
    return !!res;
  }

  /**
   * createPublicBooking — calls the SECURITY DEFINER RPC create_public_booking.
   * The anonymous role cannot INSERT directly into appointments/customers/consent_ledger.
   * This is the only valid path for public (unauthenticated) booking creation.
   */
  async createPublicBooking(params: {
    slug: string;
    serviceId: string;
    staffId: string;
    appointmentDate: string; // YYYY-MM-DD
    appointmentTime: string; // HH:MM or HH:MM:SS
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    requiredConsent: boolean;
    marketingConsent?: boolean;
    reminderConsent?: boolean;
    idempotencyKey?: string;
  }): Promise<PublicBookingResult> {
    const body = {
      p_slug:              params.slug,
      p_service_id:        params.serviceId,
      p_staff_id:          params.staffId,
      p_appointment_date:  params.appointmentDate,
      p_appointment_time:  params.appointmentTime,
      p_customer_name:     params.customerName,
      p_customer_email:    params.customerEmail || '',
      p_customer_phone:    params.customerPhone || '',
      p_required_consent:  params.requiredConsent,
      p_marketing_consent: params.marketingConsent ?? false,
      p_reminder_consent:  params.reminderConsent ?? false,
      p_idempotency_key:   params.idempotencyKey ?? null,
    };

    const res = await fetchSupabase('/rest/v1/rpc/create_public_booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let errBody = '';
      try { errBody = await res.text(); } catch {}
      console.error('create_public_booking RPC failed', res.status, errBody);
      return { success: false, reasonCode: 'temporary_failure' };
    }

    const data = await res.json();
    // Supabase wraps RPC results as the returned value directly
    const result = Array.isArray(data) ? data[0] : data;

    return {
      success:       result?.success === true,
      appointmentId: result?.appointment_id,
      manageToken:   result?.manage_token,
      reasonCode:    result?.reason_code || 'temporary_failure',
    };
  }

  async listCustomers(tenantId: string): Promise<any[]> {
    try {
      const res = await fetchSupabase(`/rest/v1/customers?tenant_id=eq.${tenantId}&select=*`);
      if (!res.ok) return [];
      return res.json();
    } catch { return []; }
  }

  async getCustomerById(customerId: string): Promise<any | null> {
    try {
       const res = await fetchSupabase(`/rest/v1/customers?id=eq.${customerId}&select=*`);
       if (!res.ok) return null;
       const data = await res.json();
       return data[0] || null;
    } catch { return null; }
  }

  async findCustomerByPhoneOrEmail(tenantId: string, phone?: string, email?: string): Promise<any | null> {
    try {
       let url = `/rest/v1/customers?tenant_id=eq.${tenantId}&select=*`;
       if (phone && email) {
           url += `&or=(phone.eq.${phone},email.eq.${email})`;
       } else if (phone) {
           url += `&phone=eq.${phone}`;
       } else if (email) {
           url += `&email=eq.${email}`;
       }
       const res = await fetchSupabase(url);
       const data = await res.json();
       return data[0] || null;
    } catch { return null; }
  }

  async createOrUpdateCustomer(tenantId: string, input: any): Promise<any> {
    const body = {
        tenant_id: tenantId,
        full_name: input.fullName,
        email: input.email,
        phone: input.phone,
        first_visit_at: input.firstVisitAt,
        last_appointment_at: input.lastAppointmentAt,
        total_appointments: input.totalAppointments,
        preferred_staff_id: input.preferredStaffId,
        last_service_id: input.lastServiceId,
        // ignoring raw JSON memory fields for this stub
    };
    if (input.id) {
       await fetchSupabase(`/rest/v1/customers?id=eq.${input.id}`, {
           method: 'PATCH',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify(body)
       });
       return { id: input.id, ...input };
    } else {
       const res = await fetchSupabase('/rest/v1/customers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
            body: JSON.stringify(body)
        });
       const data = await res.json();
       return data[0];
    }
  }

  async getCustomerMemory(customerId: string): Promise<any> {
    return this.getCustomerById(customerId);
  }

  async updateCustomerMemory(customerId: string, patch: any): Promise<void> {
    // Requires JSONB manipulation in Supabase. Simplified to NOOP for stub.
  }

  async addCustomerNote(customerId: string, text: string, author: string): Promise<void> {
    await fetchSupabase('/rest/v1/customer_memory_notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            customer_id: customerId,
            text,
            created_by: author
        })
    });
  }

  async getCustomer(tenantId: string, customerId: string): Promise<any | null> {
    try {
      const res = await fetchSupabase(`/rest/v1/customers?id=eq.${customerId}&tenant_id=eq.${tenantId}&select=*`);
      if (!res.ok) return null;
      const data = await res.json();
      return data[0] || null;
    } catch { return null; }
  }

  async updateCustomer(tenantId: string, customerId: string, patch: any): Promise<any | null> {
    const res = await fetchSupabase(`/rest/v1/customers?id=eq.${customerId}&tenant_id=eq.${tenantId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify(patch)
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data[0];
  }

  async createOrFindCustomerForBooking(tenantId: string, input: any): Promise<any> {
    const existing = await this.findCustomerByPhoneOrEmail(tenantId, input.phone, input.email);
    if (existing) return existing;
    return this.createOrUpdateCustomer(tenantId, input);
  }
}
