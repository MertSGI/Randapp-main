import { BookingRepository } from './types';
import { Appointment, CustomerProfile, CustomerMemoryNote } from '../../types';
import { dataProvider } from '../dataProvider';
import { normalizeEmail, normalizePhone } from '../adminCustomerService';

export class LocalBookingRepository implements BookingRepository {
  private getAppointmentsKey(tenantId: string) { return `randapp:${tenantId}:appointments`; }
  private getCustomersKey(tenantId: string) { return `mock_tenant_customers_${tenantId}`; }

  async listAppointments(tenantId: string, filter?: { date?: string, upcomingOnly?: boolean }): Promise<Appointment[]> {
    const key = this.getAppointmentsKey(tenantId);
    let existing = await dataProvider.getList<Appointment>(key) || [];
    
    if (!existing || existing.length === 0) {
      const isSeeded = localStorage.getItem(`randapp:${tenantId}:appointments_seeded`) === 'true';
      if (!isSeeded) {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
  
        const toISODate = (d: Date) => d.toISOString().split('T')[0];
  
        const seededAppointments: Appointment[] = [
          {
            id: 'apt_demo_1', tenantId, customerId: 'cust_demo_1', user_name: 'Ahmet Yılmaz', user_email: 'ahmet@example.com', phone: '+90 555 123 4567',
            serviceId: 'srv_1', staffId: 'staff_1', date: toISODate(today), time: '10:00', status: 'confirmed', createdAt: yesterday.toISOString(), syncedToGoogle: false
          },
          {
            id: 'apt_demo_2', tenantId, customerId: 'cust_demo_2', user_name: 'Mehmet Demir', user_email: 'mehmet@example.com', phone: '+90 555 987 6543',
            serviceId: 'srv_2', staffId: 'staff_2', date: toISODate(today), time: '14:30', status: 'confirmed', createdAt: yesterday.toISOString(), syncedToGoogle: false
          },
          {
            id: 'apt_demo_3', tenantId, customerId: 'cust_demo_3', user_name: 'Ayşe Kaya', user_email: 'ayse@example.com', phone: '+90 555 333 2211',
            serviceId: 'srv_3', staffId: 'staff_1', date: toISODate(tomorrow), time: '11:00', status: 'confirmed', createdAt: today.toISOString(), syncedToGoogle: false
          },
          {
            id: 'apt_demo_4', tenantId, customerId: 'cust_demo_4', user_name: 'Fatma Çelik', user_email: 'fatma@example.com', phone: '+90 555 444 5566',
            serviceId: 'srv_5', staffId: 'staff_1', date: toISODate(yesterday), time: '15:00', status: 'completed', createdAt: today.toISOString(), syncedToGoogle: false
          },
           {
            id: 'apt_demo_5', tenantId, customerId: 'cust_demo_5', user_name: 'Ali Vefa', user_email: 'ali@example.com', phone: '+90 555 111 2222',
            serviceId: 'srv_4', staffId: 'staff_3', date: toISODate(tomorrow), time: '16:00', status: 'cancelled_by_customer', cancelReason: 'İşim çıktı', cancelledAt: today.toISOString(), cancelledBy: 'customer', createdAt: yesterday.toISOString(), syncedToGoogle: false
          }
        ];
        await dataProvider.set(key, seededAppointments);
        localStorage.setItem(`randapp:${tenantId}:appointments_seeded`, 'true');
        existing = seededAppointments;
      }
    }
    
    if (filter?.date) {
      existing = existing.filter(a => a.date === filter.date);
    }
    if (filter?.upcomingOnly) {
      const now = new Date().toISOString().split('T')[0];
      existing = existing.filter(a => a.date >= now);
    }
    
    return existing;
  }

  async getAppointmentById(appointmentId: string): Promise<Appointment | null> {
    for (let i = 0; i < localStorage.length; i++) {
       const key = localStorage.key(i);
       if (key && key.includes(':appointments')) {
          const list = JSON.parse(localStorage.getItem(key) || '[]');
          const match = list.find((a: Appointment) => a.id === appointmentId);
          if (match) return match;
       }
    }
    return null;
  }

  async createAppointment(tenantId: string, input: Omit<Appointment, 'id' | 'createdAt' | 'tenantId'>): Promise<Appointment> {
    const key = this.getAppointmentsKey(tenantId);
    const existing = await dataProvider.getList<Appointment>(key) || [];
    const newApt: Appointment = {
      ...input,
      id: `apt_${Date.now()}`,
      tenantId,
      createdAt: new Date().toISOString(),
    };
    await dataProvider.set(key, [...existing, newApt]);
    
    // Auto-create/derive customer context here.
    await this.deriveCustomerFromAppointment(tenantId, newApt);
    
    return newApt;
  }

  async updateAppointment(appointmentId: string, patch: Partial<Appointment>): Promise<Appointment | null> {
    const apt = await this.getAppointmentById(appointmentId);
    if (!apt) return null;
    const key = this.getAppointmentsKey(apt.tenantId!);
    const existing = await dataProvider.getList<Appointment>(key) || [];
    const updated = existing.map(a => a.id === appointmentId ? { ...a, ...patch } : a);
    await dataProvider.set(key, updated);
    return { ...apt, ...patch };
  }

  async cancelAppointment(appointmentId: string, reason?: string, cancelledBy?: 'customer' | 'salon' | 'system'): Promise<boolean> {
    const patch = {
      status: `cancelled${cancelledBy ? '_by_' + cancelledBy : ''}` as any,
      cancelReason: reason,
      cancelledAt: new Date().toISOString(),
      cancelledBy: cancelledBy
    };
    const updated = await this.updateAppointment(appointmentId, patch);
    return !!updated;
  }

  async listCustomers(tenantId: string): Promise<CustomerProfile[]> {
    const key = this.getCustomersKey(tenantId);
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : [];
  }

  async getCustomerById(customerId: string): Promise<CustomerProfile | null> {
    for (let i = 0; i < localStorage.length; i++) {
       const key = localStorage.key(i);
       if (key && key.includes('mock_tenant_customers_')) {
          const list = JSON.parse(localStorage.getItem(key) || '[]');
          const match = list.find((c: CustomerProfile) => c.id === customerId);
          if (match) return match;
       }
    }
    return null;
  }

  async findCustomerByPhoneOrEmail(tenantId: string, phone?: string, email?: string): Promise<CustomerProfile | null> {
    const customers = await this.listCustomers(tenantId);
    const normUserEmail = normalizeEmail(email);
    const normUserPhone = normalizePhone(phone);
    return customers.find(c => {
      const cEmail = normalizeEmail(c.email);
      const cPhone = normalizePhone(c.phone);
      if (normUserPhone && cPhone) return normUserPhone === cPhone;
      if (normUserEmail && cEmail) return normUserEmail === cEmail;
      return false;
    }) || null;
  }

  async createOrUpdateCustomer(tenantId: string, input: Partial<CustomerProfile>): Promise<CustomerProfile> {
    const key = this.getCustomersKey(tenantId);
    const existing = await this.listCustomers(tenantId);
    
    let target = existing.find(c => c.id === input.id);
    if (!target) {
      if (input.email || input.phone) {
        target = await this.findCustomerByPhoneOrEmail(tenantId, input.phone, input.email) || undefined;
      }
    }
    
    if (target) {
      const updated = { ...target, ...input, updatedAt: new Date().toISOString() };
      const outList = existing.map(c => c.id === target!.id ? updated : c);
      localStorage.setItem(key, JSON.stringify(outList));
      return updated;
    } else {
      const newCustomer: CustomerProfile = {
        ...input,
        tenantId,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      } as CustomerProfile;
      existing.push(newCustomer);
      localStorage.setItem(key, JSON.stringify(existing));
      return newCustomer;
    }
  }

  private async deriveCustomerFromAppointment(tenantId: string, apt: Appointment) {
    const existing = await this.findCustomerByPhoneOrEmail(tenantId, apt.phone, apt.user_email);
    if (!existing) {
      await this.createOrUpdateCustomer(tenantId, {
        fullName: apt.user_name,
        email: apt.user_email || '',
        phone: apt.phone || '',
        firstVisitAt: apt.date,
        lastAppointmentAt: apt.date,
        totalAppointments: 1,
        internalNotes: [],
        referencePhotos: [],
        appointmentIds: [apt.id],
        preferredStaffId: apt.staffId,
        lastServiceId: apt.serviceId
      });
    } else {
      const patch = {
        appointmentIds: [...(existing.appointmentIds || []), apt.id],
        totalAppointments: (existing.totalAppointments || 0) + 1,
      } as Partial<CustomerProfile>;
      
      if (!existing.lastAppointmentAt || apt.date > existing.lastAppointmentAt) {
        patch.lastAppointmentAt = apt.date;
        patch.preferredStaffId = apt.staffId;
        patch.lastServiceId = apt.serviceId;
      }
      await this.createOrUpdateCustomer(tenantId, { id: existing.id, ...patch });
    }
  }

  async getCustomerMemory(customerId: string): Promise<any> {
    return this.getCustomerById(customerId);
  }

  async updateCustomerMemory(customerId: string, patch: any): Promise<void> {
    const customer = await this.getCustomerById(customerId);
    if (!customer) return;
    await this.createOrUpdateCustomer(customer.tenantId, { id: customerId, ...patch });
  }

  async addCustomerNote(customerId: string, text: string, author: string): Promise<void> {
    const customer = await this.getCustomerById(customerId);
    if (!customer) return;
    const note: CustomerMemoryNote = {
      id: crypto.randomUUID(),
      text,
      createdAt: new Date().toISOString(),
      createdBy: author
    };
    const currentNotes = customer.internalNotes || [];
    await this.updateCustomerMemory(customerId, { internalNotes: [...currentNotes, note] });
  }

  async getCustomer(tenantId: string, customerId: string): Promise<any | null> {
    const cust = await this.getCustomerById(customerId);
    if (cust && cust.tenantId === tenantId) return cust;
    return null;
  }

  async updateCustomer(tenantId: string, customerId: string, patch: any): Promise<any | null> {
    return this.createOrUpdateCustomer(tenantId, { id: customerId, ...patch });
  }

  async createOrFindCustomerForBooking(tenantId: string, input: any): Promise<any> {
    const existing = await this.findCustomerByPhoneOrEmail(tenantId, input.phone, input.email);
    if (existing) return existing;
    return this.createOrUpdateCustomer(tenantId, input);
  }
}
