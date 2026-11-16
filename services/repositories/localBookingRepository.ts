import { BookingRepository, PublicBookingResult } from './types.ts';
import { Appointment, CustomerProfile, CustomerMemoryNote } from '../../types.ts';
import { dataProvider } from '../dataProvider';
const normalizeEmail = (email?: string): string => email ? email.trim().toLowerCase() : '';
import { LocalCatalogRepository } from './localCatalogRepository.ts';
import { publicBookingOtpService, parsePublicBookingPhone, normalizePublicBookingPhone } from '../publicBookingOtpService';
import { STORAGE_KEYS, DYNAMIC_STORAGE_KEYS, isLariStorageKey } from '../storageKeys';
const normalizePhone = (phone?: string): string => normalizePublicBookingPhone(phone);

const tenantBookingLocks = new Map<string, Promise<void>>();
const LOCAL_BOOKING_POLICY_KEY_PREFIX = `${STORAGE_KEYS.TENANT_BOOKING_POLICIES}_`;

// Explicit default used ONLY when tenant booking policy is genuinely missing (never on corrupt JSON / read / loader failure).
export const DEFAULT_LOCAL_BOOKING_OTP_POLICY = {
  requireOtpForBooking: false,
} as const;

export type StrictStoredPolicyReadResult =
  | { state: 'missing' }
  | { state: 'present'; record: Record<string, unknown> }
  | { state: 'corrupt' };

export function readStrictStoredBookingPolicy(tenantId: string): StrictStoredPolicyReadResult {
  if (typeof localStorage === 'undefined') {
    return { state: 'missing' };
  }
  const storageKey = DYNAMIC_STORAGE_KEYS.tenantBookingPolicy(tenantId);
  let rawStored: string | null = null;
  try {
    rawStored = localStorage.getItem(storageKey);
  } catch {
    return { state: 'corrupt' };
  }

  if (rawStored === null) {
    return { state: 'missing' };
  }
  if (!rawStored.trim()) {
    return { state: 'corrupt' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawStored);
  } catch {
    return { state: 'corrupt' };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { state: 'corrupt' };
  }

  const record = parsed as Record<string, unknown>;
  const booleanKeys = ['requireOtpForBooking', 'spamProtectionEnabled', 'blockRepeatedNoShowPhone'] as const;
  for (const k of booleanKeys) {
    if (k in record && record[k] !== undefined && typeof record[k] !== 'boolean') {
      return { state: 'corrupt' };
    }
  }

  const integerKeys = ['maxBookingsPerPhonePerDay', 'noShowThreshold'] as const;
  for (const k of integerKeys) {
    if (k in record && record[k] !== undefined) {
      const v = record[k];
      if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v) || v < 1) {
        return { state: 'corrupt' };
      }
    }
  }
  return { state: 'present', record };
}

async function withTenantBookingLock<T>(tenantId: string, work: () => Promise<T>): Promise<T> {
  const prev = tenantBookingLocks.get(tenantId) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>(resolve => {
    release = resolve;
  });
  const queued = prev.then(() => next, () => next);
  tenantBookingLocks.set(tenantId, queued);
  await prev;
  try {
    return await work();
  } finally {
    release();
    if (tenantBookingLocks.get(tenantId) === queued) {
      tenantBookingLocks.delete(tenantId);
    }
  }
}

export class LocalBookingRepository implements BookingRepository {
  // Protected loader seam preserves existing dynamic import path without circular static imports while allowing fault injection in tests.
  protected loadBookingPolicyModule = async () => import('../appointmentSelfServiceService');

  private async resolveLocalOtpPolicy(
    slug: string
  ): Promise<{ ok: true; requireOtpForBooking: boolean } | { ok: false; reasonCode: 'temporary_failure' }> {
    const stored = readStrictStoredBookingPolicy(slug);
    if (stored.state === 'corrupt') {
      return { ok: false, reasonCode: 'temporary_failure' };
    }
    if (stored.state === 'present' && 'requireOtpForBooking' in stored.record && stored.record.requireOtpForBooking !== undefined) {
      return { ok: true, requireOtpForBooking: stored.record.requireOtpForBooking as boolean };
    }

    // Storage policy was absent (null) or did not explicitly specify requireOtpForBooking; consult dynamic policy loader fail-closed.
    try {
      const mod = await this.loadBookingPolicyModule();
      const svc = mod?.appointmentSelfServiceService;
      if (!svc || typeof svc.getBookingPolicy !== 'function') {
        return { ok: false, reasonCode: 'temporary_failure' };
      }
      const dynPolicy: unknown = svc.getBookingPolicy(slug);
      if (dynPolicy === null || typeof dynPolicy !== 'object' || Array.isArray(dynPolicy)) {
        return { ok: false, reasonCode: 'temporary_failure' };
      }
      const dynRecord = dynPolicy as Record<string, unknown>;
      const booleanKeys = ['requireOtpForBooking', 'spamProtectionEnabled', 'blockRepeatedNoShowPhone'] as const;
      for (const k of booleanKeys) {
        if (k in dynRecord && dynRecord[k] !== undefined && typeof dynRecord[k] !== 'boolean') {
          return { ok: false, reasonCode: 'temporary_failure' };
        }
      }
      const integerKeys = ['maxBookingsPerPhonePerDay', 'noShowThreshold'] as const;
      for (const k of integerKeys) {
        if (k in dynRecord && dynRecord[k] !== undefined) {
          const v = dynRecord[k];
          if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v) || v < 1) {
            return { ok: false, reasonCode: 'temporary_failure' };
          }
        }
      }
      if ('requireOtpForBooking' in dynRecord && dynRecord.requireOtpForBooking !== undefined) {
        return { ok: true, requireOtpForBooking: dynRecord.requireOtpForBooking as boolean };
      }
      return {
        ok: true,
        requireOtpForBooking: DEFAULT_LOCAL_BOOKING_OTP_POLICY.requireOtpForBooking,
      };
    } catch {
      return { ok: false, reasonCode: 'temporary_failure' };
    }
  }
  private getAppointmentsKey(tenantId: string) { return DYNAMIC_STORAGE_KEYS.tenantAppointments(tenantId); }
  private getCustomersKey(tenantId: string) { return `mock_tenant_customers_${tenantId}`; }

  async listAppointments(tenantId: string, filter?: { date?: string, upcomingOnly?: boolean }): Promise<Appointment[]> {
    const cleanTenantId = tenantId?.trim() || '';
    const key = this.getAppointmentsKey(cleanTenantId);
    let existing = await dataProvider.getList<Appointment>(key) || [];
    
    if (!existing || existing.length === 0) {
      const isSeeded = localStorage.getItem(DYNAMIC_STORAGE_KEYS.tenantAppointmentsSeeded(cleanTenantId)) === 'true';
      if (isSeeded) return [];

      // If tenant has custom services or staff, do not seed foreign demo appointments
      const servicesKey = DYNAMIC_STORAGE_KEYS.tenantServices(cleanTenantId);
      const staffKey = DYNAMIC_STORAGE_KEYS.tenantStaff(cleanTenantId);
      const hasCustomCatalog = localStorage.getItem(servicesKey) || localStorage.getItem(staffKey);

      if (hasCustomCatalog) {
        localStorage.setItem(DYNAMIC_STORAGE_KEYS.tenantAppointmentsSeeded(cleanTenantId), 'true');
        return [];
      }

      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const toISODate = (d: Date) => d.toISOString().split('T')[0];

      const seededAppointments: Appointment[] = [
        {
          id: 'apt_demo_1', tenantId: cleanTenantId, customerId: 'cust_demo_1', user_name: 'Ahmet Yılmaz', user_email: 'ahmet@example.com', phone: '+90 555 123 4567',
          serviceId: 'srv_1', staffId: 'staff_1', date: toISODate(today), time: '10:00', durationMinutes: 45, status: 'confirmed', createdAt: yesterday.toISOString(), syncedToGoogle: false
        },
        {
          id: 'apt_demo_2', tenantId: cleanTenantId, customerId: 'cust_demo_2', user_name: 'Mehmet Demir', user_email: 'mehmet@example.com', phone: '+90 555 987 6543',
          serviceId: 'srv_2', staffId: 'staff_2', date: toISODate(today), time: '14:30', durationMinutes: 60, status: 'confirmed', createdAt: yesterday.toISOString(), syncedToGoogle: false
        },
        {
          id: 'apt_demo_3', tenantId: cleanTenantId, customerId: 'cust_demo_3', user_name: 'Ayşe Kaya', user_email: 'ayse@example.com', phone: '+90 555 333 2211',
          serviceId: 'srv_3', staffId: 'staff_1', date: toISODate(tomorrow), time: '11:00', durationMinutes: 30, status: 'confirmed', createdAt: today.toISOString(), syncedToGoogle: false
        },
        {
          id: 'apt_demo_4', tenantId: cleanTenantId, customerId: 'cust_demo_4', user_name: 'Fatma Çelik', user_email: 'fatma@example.com', phone: '+90 555 444 5566',
          serviceId: 'srv_5', staffId: 'staff_1', date: toISODate(yesterday), time: '15:00', durationMinutes: 30, status: 'completed', createdAt: today.toISOString(), syncedToGoogle: false
        },
         {
          id: 'apt_demo_5', tenantId: cleanTenantId, customerId: 'cust_demo_5', user_name: 'Ali Vefa', user_email: 'ali@example.com', phone: '+90 555 111 2222',
          serviceId: 'srv_4', staffId: 'staff_3', date: toISODate(tomorrow), time: '16:00', durationMinutes: 45, status: 'cancelled_by_customer', cancelReason: 'İşim çıktı', cancelledAt: today.toISOString(), cancelledBy: 'customer', createdAt: yesterday.toISOString(), syncedToGoogle: false
        }
      ];
      await dataProvider.set(key, seededAppointments);
      localStorage.setItem(DYNAMIC_STORAGE_KEYS.tenantAppointmentsSeeded(cleanTenantId), 'true');
      existing = seededAppointments;
    }
    
    if (filter?.date) {
      existing = existing.filter(a => a.date === filter.date);
    }
    if (filter?.upcomingOnly) {
      const now = new Date().toISOString().split('T')[0];
      existing = existing.filter(a => a.date >= now);
    }
    
    return existing.map(a => typeof a.durationMinutes === 'number' ? a : { ...a, durationMinutes: 30 });
  }

  async getAppointmentById(appointmentId: string, tenantId?: string): Promise<Appointment | null> {
    const cleanTenantId = tenantId?.trim();
    if (cleanTenantId) {
      const key = this.getAppointmentsKey(cleanTenantId);
      const raw = localStorage.getItem(key);
      try {
        const list = raw ? JSON.parse(raw) : [];
        if (Array.isArray(list)) {
          const match = list.find((a: Appointment) => a && a.id === appointmentId);
          if (match) return typeof match.durationMinutes === 'number' ? match : { ...match, durationMinutes: 30 };
        }
      } catch {}
      return null;
    }
    for (let i = 0; i < localStorage.length; i++) {
       const key = localStorage.key(i);
       if (key && isLariStorageKey(key) && key.endsWith(':appointments')) {
          const raw = localStorage.getItem(key);
          try {
            const list = raw ? JSON.parse(raw) : [];
            if (Array.isArray(list)) {
              const match = list.find((a: Appointment) => a && a.id === appointmentId);
              if (match) return typeof match.durationMinutes === 'number' ? match : { ...match, durationMinutes: 30 };
            }
          } catch {}
       }
    }
    return null;
  }

  async createAppointment(tenantId: string, input: Omit<Appointment, 'id' | 'createdAt' | 'tenantId'>): Promise<Appointment> {
    const cleanTenantId = tenantId?.trim();
    if (!cleanTenantId) {
      throw new Error('[localBookingRepository] Security error: non-empty tenantId is required for createAppointment');
    }
    const key = this.getAppointmentsKey(cleanTenantId);
    const existing = await dataProvider.getList<Appointment>(key) || [];
    const catalogRepo = new LocalCatalogRepository();

    // 1. Service validation (must exist, belong to this tenant, and be active)
    if (!input.serviceId || typeof input.serviceId !== 'string' || !input.serviceId.trim()) {
      throw new Error('Service required: appointment must specify a valid serviceId.');
    }
    const s = await catalogRepo.getServiceById(input.serviceId, cleanTenantId);
    if (!s || (s.tenantId && s.tenantId !== cleanTenantId) || s.active === false) {
      throw new Error(`Service not found or inactive for tenant: ${input.serviceId}`);
    }

    // 2. Staff validation (must exist, belong to this tenant, and be active)
    if (!input.staffId || typeof input.staffId !== 'string' || !input.staffId.trim()) {
      throw new Error('Staff required: appointment must specify a valid staffId.');
    }
    const st = await catalogRepo.getStaffById(input.staffId, cleanTenantId);
    if (!st || (st.tenantId && st.tenantId !== cleanTenantId) || st.active === false) {
      throw new Error(`Staff not found or inactive for tenant: ${input.staffId}`);
    }

    // 3. Staff eligibility check (strictly enforced for all tenants without any name-based bypass - FINDING-ADIM023-009)
    const eligibleStaff = await catalogRepo.listStaffForService(cleanTenantId, input.serviceId);
    if (!eligibleStaff || !eligibleStaff.some(staff => staff.id === input.staffId)) {
      throw new Error('Staff ineligible: Selected staff cannot perform this service.');
    }

    // Authoritative duration MUST come from tenant-owned catalog service (FINDING-ADIM023-012)
    const serviceDuration = (typeof s.duration === 'number' && Number.isFinite(s.duration) && s.duration > 0)
      ? s.duration
      : 30;
    const aptDurationMinutes = serviceDuration;

    // 4. Conflicting slot check
    if (input.staffId && input.date && input.time) {
      const [nh, nm] = input.time.split(':').map(Number);
      const newStart = nh * 60 + nm;
      const newEnd = newStart + aptDurationMinutes;

      const activeAppointments = existing.filter(a => {
        const stStatus = a.status as string;
        return a.date === input.date &&
               a.staffId === input.staffId &&
               stStatus !== 'cancelled' &&
               stStatus !== 'cancelled_by_customer' &&
               stStatus !== 'cancelled_by_salon' &&
               stStatus !== 'cancelled_by_system' &&
               stStatus !== 'no_show';
      });

      for (const apt of activeAppointments) {
        let aptDuration = 30;
        if (apt.serviceId) {
          const aptService = await catalogRepo.getServiceById(apt.serviceId, cleanTenantId);
          if (aptService?.duration && Number.isFinite(aptService.duration) && aptService.duration > 0) {
            aptDuration = aptService.duration;
          }
        } else if (typeof apt.durationMinutes === 'number' && Number.isFinite(apt.durationMinutes) && apt.durationMinutes > 0) {
          aptDuration = apt.durationMinutes;
        }
        const [ah, am] = apt.time.split(':').map(Number);
        const aptStart = ah * 60 + am;
        const aptEnd = aptStart + aptDuration;

        if (newStart < aptEnd && newEnd > aptStart) {
          throw new Error('Slot conflict: Selected staff is already booked for this time window.');
        }
      }
    }

    const newApt: Appointment = {
      ...input,
      durationMinutes: aptDurationMinutes,
      id: `apt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tenantId: cleanTenantId,
      createdAt: new Date().toISOString(),
    };
    await dataProvider.set(key, [...existing, newApt]);
    
    // Auto-create/derive customer context here.
    await this.deriveCustomerFromAppointment(cleanTenantId, newApt);
    
    return newApt;
  }

  async updateAppointment(appointmentId: string, patch: Partial<Appointment>, tenantId?: string): Promise<Appointment | null> {
    const cleanTenantId = tenantId?.trim();
    if (!cleanTenantId) {
      throw new Error('[localBookingRepository] Security error: non-empty tenantId is required for updateAppointment');
    }
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.endsWith(':appointments') && k !== this.getAppointmentsKey(cleanTenantId)) {
        const raw = localStorage.getItem(k);
        try {
          const list = raw ? JSON.parse(raw) : [];
          if (Array.isArray(list) && list.some((a: any) => a && a.id === appointmentId)) {
            throw new Error('[localBookingRepository] Tenant isolation violation: cannot update appointment of another tenant');
          }
        } catch (e: any) {
          if (e.message && e.message.includes('Tenant isolation violation')) throw e;
        }
      }
    }
    const apt = await this.getAppointmentById(appointmentId, cleanTenantId);
    if (!apt) return null;
    if (patch.tenantId !== undefined && patch.tenantId.trim() !== cleanTenantId) {
      throw new Error('[localBookingRepository] Tenant isolation violation: cannot alter appointment tenantId');
    }

    // Validate effective service and staff ownership and eligibility (FINDING-ADIM023-013)
    const effectiveServiceId = patch.serviceId !== undefined ? patch.serviceId : apt.serviceId;
    const effectiveStaffId = patch.staffId !== undefined ? patch.staffId : apt.staffId;

    if (patch.serviceId !== undefined || patch.staffId !== undefined) {
      const catalogRepo = new LocalCatalogRepository();
      if (effectiveServiceId) {
        const s = await catalogRepo.getServiceById(effectiveServiceId, cleanTenantId);
        if (!s || (s.tenantId && s.tenantId !== cleanTenantId) || s.active === false) {
          throw new Error(`[localBookingRepository] Tenant isolation violation: service does not belong to requested tenant: ${effectiveServiceId}`);
        }
      }
      if (effectiveStaffId) {
        const st = await catalogRepo.getStaffById(effectiveStaffId, cleanTenantId);
        if (!st || (st.tenantId && st.tenantId !== cleanTenantId) || st.active === false) {
          throw new Error(`[localBookingRepository] Tenant isolation violation: staff does not belong to requested tenant: ${effectiveStaffId}`);
        }
      }
      if (effectiveServiceId && effectiveStaffId) {
        const eligibleStaff = await catalogRepo.listStaffForService(cleanTenantId, effectiveServiceId);
        if (!eligibleStaff || !eligibleStaff.some(staff => staff.id === effectiveStaffId)) {
          throw new Error('[localBookingRepository] Staff ineligible: Selected staff cannot perform this service.');
        }
      }
    }

    const { tenantId: _t, id: _id, createdAt: _c, ...safePatch } = patch as any;
    const key = this.getAppointmentsKey(cleanTenantId);
    const existing = await dataProvider.getList<Appointment>(key) || [];
    const updated = existing.map(a => a.id === appointmentId ? { ...a, ...safePatch } : a);
    await dataProvider.set(key, updated);
    return { ...apt, ...safePatch };
  }

  async cancelAppointment(appointmentId: string, reason?: string, cancelledBy?: 'customer' | 'salon' | 'system', tenantId?: string): Promise<boolean> {
    const cleanTenantId = tenantId?.trim();
    if (!cleanTenantId) {
      throw new Error('[localBookingRepository] Security error: non-empty tenantId is required for cancelAppointment');
    }
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.endsWith(':appointments') && k !== this.getAppointmentsKey(cleanTenantId)) {
        const raw = localStorage.getItem(k);
        try {
          const list = raw ? JSON.parse(raw) : [];
          if (Array.isArray(list) && list.some((a: any) => a && a.id === appointmentId)) {
            throw new Error('[localBookingRepository] Tenant isolation violation: cannot cancel appointment of another tenant');
          }
        } catch (e: any) {
          if (e.message && e.message.includes('Tenant isolation violation')) throw e;
        }
      }
    }
    const patch = {
      status: (cancelledBy ? `cancelled_by_${cancelledBy}` : 'cancelled') as any,
      cancelReason: reason,
      cancelledAt: new Date().toISOString(),
      cancelledBy: cancelledBy
    };
    const updated = await this.updateAppointment(appointmentId, patch, cleanTenantId);
    return !!updated;
  }

  async listCustomers(tenantId: string): Promise<CustomerProfile[]> {
    const key = this.getCustomersKey(tenantId);
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : [];
  }

  async getCustomerById(customerId: string, tenantId?: string): Promise<CustomerProfile | null> {
    const cleanTenantId = tenantId?.trim();
    if (cleanTenantId) {
      const customers = await this.listCustomers(cleanTenantId);
      return customers.find(c => c.id === customerId) || null;
    }
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

  async getCustomerMemory(customerId: string, tenantId?: string): Promise<any> {
    return this.getCustomerById(customerId, tenantId);
  }

  async updateCustomerMemory(customerId: string, patch: any, tenantId?: string): Promise<void> {
    const customer = await this.getCustomerById(customerId, tenantId);
    if (!customer) return;
    await this.createOrUpdateCustomer(customer.tenantId, { id: customerId, ...patch });
  }

  async addCustomerNote(customerId: string, text: string, author: string, tenantId?: string): Promise<void> {
    const customer = await this.getCustomerById(customerId, tenantId);
    if (!customer) return;
    const note: CustomerMemoryNote = {
      id: crypto.randomUUID(),
      text,
      createdAt: new Date().toISOString(),
      createdBy: author
    };
    const currentNotes = customer.internalNotes || [];
    await this.updateCustomerMemory(customerId, { internalNotes: [...currentNotes, note] }, tenantId);
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

  async createPublicBooking(params: {
    slug: string;
    branchId?: string;
    serviceId: string;
    staffId: string;
    appointmentDate: string;
    appointmentTime: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    requiredConsent: boolean;
    marketingConsent?: boolean;
    reminderConsent?: boolean;
    idempotencyKey?: string;
    otpVerificationToken?: string;
    clientFingerprint?: string;
  }): Promise<PublicBookingResult> {
    if (!params.requiredConsent) {
      return { success: false, reasonCode: 'consent_required' };
    }
    if (!params.customerName?.trim() || (!params.customerPhone?.trim() && !params.customerEmail?.trim())) {
      return { success: false, reasonCode: 'invalid_customer_data' };
    }

    const phoneParsed = parsePublicBookingPhone(params.customerPhone);
    if (params.customerPhone && params.customerPhone.trim()) {
      if (!phoneParsed.valid) {
        return { success: false, reasonCode: 'invalid_phone' };
      }
    }

    // Check OTP policy for tenant fail-closed (FINDING-ADIM010-010: distinguish genuine missing policy vs corrupt/unreadable policy)
    const policyRes = await this.resolveLocalOtpPolicy(params.slug);
    if (!policyRes.ok) {
      return { success: false, reasonCode: 'temporary_failure' };
    }
    const requireOtpForBooking = policyRes.requireOtpForBooking;

    if (requireOtpForBooking) {
      if (!phoneParsed.valid) {
        return { success: false, reasonCode: 'invalid_phone' };
      }
      if (!params.otpVerificationToken || !params.otpVerificationToken.trim()) {
        return { success: false, reasonCode: 'otp_required' };
      }
    }

    // Reserve OTP token synchronously BEFORE any await / appointment write so concurrent
    // duplicate submissions fail closed immediately.
    let reservedChallengeId: string | null = null;
    if (params.otpVerificationToken) {
      const reservation = publicBookingOtpService.reserveVerificationTokenLocal(
        params.otpVerificationToken,
        params.slug,
        phoneParsed.canonical || params.customerPhone
      );
      if (!('challengeId' in reservation)) {
        return { success: false, reasonCode: reservation.reasonCode };
      }
      reservedChallengeId = reservation.challengeId;
    }

    return withTenantBookingLock(params.slug, async () => {
      let createdAptId: string | null = null;
      try {
        const apt = await this.createAppointment(params.slug, {
          userId: `cust_${Date.now()}`,
          user_name: params.customerName.trim(),
          user_email: params.customerEmail?.trim() || '',
          phone: phoneParsed.valid ? phoneParsed.canonical : (params.customerPhone?.trim() || ''),
          serviceId: params.serviceId,
          staffId: params.staffId,
          branchId: params.branchId,
          date: params.appointmentDate,
          time: params.appointmentTime,
          status: 'confirmed',
          syncedToGoogle: false,
        });

        if (!apt?.id) {
          throw new Error('Failed to create appointment record');
        }
        createdAptId = apt.id;

        if (reservedChallengeId && params.otpVerificationToken) {
          const committed = publicBookingOtpService.commitVerificationTokenConsumptionLocal(
            reservedChallengeId,
            params.otpVerificationToken
          );
          if (!committed) {
            await this.rollbackLocalPublicBookingArtifacts(params.slug, apt.id);
            publicBookingOtpService.releaseVerificationTokenReservationLocal(reservedChallengeId);
            return { success: false, reasonCode: 'otp_token_invalid_or_consumed' };
          }
        }

        return {
          success: true,
          appointmentId: apt.id,
          manageToken: `tok_mock_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          branchId: params.branchId,
          reasonCode: 'ok',
        };
      } catch (err: any) {
        if (createdAptId) {
          try {
            await this.rollbackLocalPublicBookingArtifacts(params.slug, createdAptId);
          } catch {}
        }
        if (reservedChallengeId) {
          publicBookingOtpService.releaseVerificationTokenReservationLocal(reservedChallengeId);
        }
        if (err?.message?.includes('Slot conflict')) {
          return { success: false, reasonCode: 'slot_conflict' };
        }
        return { success: false, reasonCode: 'temporary_failure' };
      }
    });
  }

  private async rollbackLocalPublicBookingArtifacts(tenantId: string, appointmentId: string): Promise<void> {
    const aptKey = this.getAppointmentsKey(tenantId);
    const existing = (await dataProvider.getList<Appointment>(aptKey)) || [];
    const remaining = existing.filter(a => a.id !== appointmentId);
    await dataProvider.set(aptKey, remaining);

    if (typeof localStorage !== 'undefined') {
      const custKey = this.getCustomersKey(tenantId);
      const rawCustomers = localStorage.getItem(custKey);
      if (rawCustomers) {
        const customers: CustomerProfile[] = JSON.parse(rawCustomers);
        const updatedCustomers = customers
          .map(c => {
            if (!Array.isArray(c.appointmentIds) || !c.appointmentIds.includes(appointmentId)) {
              return c;
            }
            const remainingIds = c.appointmentIds.filter(id => id !== appointmentId);
            const nextTotal = Math.max(0, (c.totalAppointments || 1) - 1);
            if (
              remainingIds.length === 0 &&
              nextTotal === 0 &&
              (!c.internalNotes || c.internalNotes.length === 0) &&
              (!c.referencePhotos || c.referencePhotos.length === 0)
            ) {
              return null;
            }
            return { ...c, appointmentIds: remainingIds, totalAppointments: nextTotal };
          })
          .filter(Boolean);
        localStorage.setItem(custKey, JSON.stringify(updatedCustomers));
      }
    }
  }
}

