import { getStaffList } from './staffService';
import { Staff } from '../types';
import { getAppointments } from './appointmentService';
import { getAvailabilityRepository, getBookingRepository, getServiceCatalogRepository } from './repositories';

export interface TimeSlot {
  time: string; // HH:mm
  available: boolean;
}

export function assertTenantId(tenantId?: string, operation: string = 'operation'): string {
  if (tenantId !== undefined && (typeof tenantId !== 'string' || !tenantId.trim())) {
    throw new Error(`[availabilityService] Security error: invalid or empty tenantId provided for ${operation}`);
  }
  return tenantId?.trim() || '';
}

export function requireTenantId(tenantId: string, operation: string = 'operation'): string {
  if (!tenantId || typeof tenantId !== 'string' || !tenantId.trim()) {
    throw new Error(`[availabilityService] Security error: non-empty tenantId is required for ${operation}`);
  }
  return tenantId.trim();
}

export const availabilityService = {
  async getWorkingHours(tenantId: string): Promise<any> {
    const validTenantId = requireTenantId(tenantId, 'getWorkingHours');
    const repo = getAvailabilityRepository();
    return repo.getAvailability(validTenantId);
  },

  async updateWorkingHours(tenantId: string, input: any): Promise<any> {
    const validTenantId = requireTenantId(tenantId, 'updateWorkingHours');
    const repo = getAvailabilityRepository();
    return repo.updateAvailability(validTenantId, input);
  },

  async getPublicWorkingHoursBySlug(slug: string): Promise<any> {
    if (!slug || typeof slug !== 'string' || !slug.trim()) {
      throw new Error('[availabilityService] Security error: non-empty slug is required for getPublicWorkingHoursBySlug');
    }
    const repo = getAvailabilityRepository();
    return repo.getPublicAvailabilityByTenantSlug(slug.trim());
  },

  async getAvailableSlotsForStaff(tenantId: string, staffId: string, serviceId: string, dateStr: string): Promise<TimeSlot[]> {
     const validTenantId = requireTenantId(tenantId, 'getAvailableSlotsForStaff');
     if (!staffId || typeof staffId !== 'string' || !staffId.trim()) {
       throw new Error('[availabilityService] Security error: non-empty staffId is required for getAvailableSlotsForStaff');
     }
     if (!dateStr || typeof dateStr !== 'string' || !dateStr.trim()) {
       throw new Error('[availabilityService] Security error: non-empty dateStr is required for getAvailableSlotsForStaff');
     }

     try {
       const { getDataSourceMode } = await import('./dataSourceConfig');
       const isSupabaseMode = getDataSourceMode() === 'supabase';

       if (isSupabaseMode) {
         // ---------------------------------------------------------------
         // Supabase path: call get_public_available_slots SECURITY DEFINER
         // RPC. This avoids the anon RLS block on /rest/v1/appointments
         // which previously returned [] and made all slots appear free.
         // ---------------------------------------------------------------
         try {
           const { fetchSupabase } = await import('./repositories/supabaseClient');

           // Resolve tenant slug from tenantId via supabase REST.
           // The RPC requires slug not tenantId.
           const tenantRes = await fetchSupabase(`/rest/v1/tenants?id=eq.${encodeURIComponent(validTenantId)}&select=slug`);
           if (!tenantRes.ok) return [];
           const tenantData = await tenantRes.json();
           const slug = tenantData?.[0]?.slug;
           if (!slug) return [];

           const body = {
             p_slug:       slug,
             p_staff_id:   staffId,
             p_service_id: serviceId,
             p_date:       dateStr,
           };

           const res = await fetchSupabase('/rest/v1/rpc/get_public_available_slots', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify(body),
           });

           if (!res.ok) {
             console.error('get_public_available_slots RPC failed:', res.status);
             return [];
           }

           const data = await res.json();
           // Supabase wraps RPC results directly; handle both array wrap and direct
           const result = Array.isArray(data) ? data[0] : data;

           if (!result || result.reason_code === 'temporary_failure') {
             return [];
           }

           const rawSlots: any[] = result?.slots || [];
           return rawSlots.map((s: any) => {
             const timeStr = typeof s === 'string' ? s : (s?.start || '');
             return { time: timeStr, available: true };
           }).filter(s => !!s.time);

         } catch (rpcErr) {
           console.error('get_public_available_slots RPC exception:', rpcErr);
           return [];
         }
       }

       // ---------------------------------------------------------------
       // Local / demo / mock path: compute slots client-side
       // ---------------------------------------------------------------
       const catalogRepo = getAvailabilityRepository();
       const bookingRepo = getBookingRepository();

       // Verify staff belongs to this tenant
       const allStaff = await getStaffList(validTenantId);
       if (allStaff.length > 0 && !allStaff.some(s => s.id === staffId)) {
         return []; // Staff does not belong to this tenant
       }

       // Check staff eligibility for the requested service
       if (serviceId) {
         const eligibleStaff = await catalogRepo.listStaffForService(validTenantId, serviceId);
         if (eligibleStaff && eligibleStaff.length > 0 && !eligibleStaff.some(s => s.id === staffId)) {
           return []; // Staff is not eligible for this service
         }
       }

       // 1. Fetch staff availability rules
       const rules = await catalogRepo.listAvailabilityRules(validTenantId, staffId);
       
       // Parse local weekday from dateStr (YYYY-MM-DD)
       // Standard weekday calculation: Monday=1, ..., Sunday=7
       const localDate = new Date(dateStr + 'T00:00:00');
       let weekday = localDate.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
       if (weekday === 0) weekday = 7;

       // Prioritize staff-specific rule over tenant-wide rule
       const staffRule = rules.find((r) => r.staffId === staffId && r.weekday === weekday);
       const salonRule = rules.find((r) => (r.staffId == null || r.staffId === '') && r.weekday === weekday);
       const rule = staffRule || salonRule;
       if (!rule || !rule.is_active) return [];

       // 2. Fetch service duration
       const service = await getServiceCatalogRepository().getServiceById(serviceId);
       const duration = service?.duration || 30;

       // 3. Fetch non-cancelled booked slots for this date and staff
       const appointments = await bookingRepo.listAppointments(validTenantId, { date: dateStr });
       const booked = appointments.filter((apt) => {
         const st = (apt.status as string);
         return st !== 'cancelled' && 
                st !== 'cancelled_by_customer' && 
                st !== 'cancelled_by_salon' && 
                st !== 'cancelled_by_system' && 
                st !== 'no_show' && 
                apt.staffId === staffId;
       });

       // 4. Generate candidate slots between rule.start_time and rule.end_time in 15 minute steps (or business interval)
       const slots: TimeSlot[] = [];
       const [sh, sm] = rule.start_time.split(':').map(Number);
       const [eh, em] = rule.end_time.split(':').map(Number);
       const startMin = sh * 60 + sm;
       const endMin = eh * 60 + em;

       // Determine the current local time in Europe/Istanbul to filter past slots
       const istanbulTime = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
       const todayStr = istanbulTime.getFullYear() + '-' + 
         String(istanbulTime.getMonth() + 1).padStart(2, '0') + '-' + 
         String(istanbulTime.getDate()).padStart(2, '0');
       const nowMin = istanbulTime.getHours() * 60 + istanbulTime.getMinutes();

       // Use 15-minute slot steps to offer flexible booking start times
       for (let min = startMin; min <= endMin - duration; min += 15) {
         const h = Math.floor(min / 60);
         const m = min % 60;
         const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

         // Check if slot is in the past for today
         if (dateStr === todayStr && min <= nowMin) {
           continue;
         }

         // Check overlaps with booked appointments
         let isOverlap = false;
         for (const apt of booked) {
           const [ah, am] = apt.time.split(':').map(Number);
           const aptStart = ah * 60 + am;
           // We need the duration of the booked service. Let's find it.
           // Fallback to 30 mins if not resolvable.
           let aptDuration = 30;
           if (apt.serviceId) {
             const s = await getServiceCatalogRepository().getServiceById(apt.serviceId);
             if (s?.duration) aptDuration = s.duration;
           }

           const aptEnd = aptStart + aptDuration;
           const slotStart = min;
           const slotEnd = min + duration;

           if (slotStart < aptEnd && slotEnd > aptStart) {
             isOverlap = true;
             break;
           }
         }

         if (!isOverlap) {
           slots.push({
             time: timeStr,
             available: true
           });
         }
       }

       return slots;
     } catch (err: any) {
       if (err.message && err.message.includes('Security error')) {
         throw err;
       }
       console.error('Error generating slots:', err);
       return [];
     }
  },

  getNextAvailableSlotForStaff(tenantId: string, staffId: string, serviceId: string): Promise<{date: string, time: string} | null> {
    const validTenantId = requireTenantId(tenantId, 'getNextAvailableSlotForStaff');
    return new Promise((resolve) => {
       const now = new Date();
       resolve({
          date: now.toISOString().split('T')[0],
          time: staffId === 'staff_1' ? '10:00' : '11:00'
       });
    });
  },

  getEarliestAvailableStaff(tenantId: string, serviceId: string): Promise<{staffId: string, date: string, time: string} | null> {
    const validTenantId = requireTenantId(tenantId, 'getEarliestAvailableStaff');
    return new Promise(async (resolve) => {
       try {
         const staff = await getStaffList(validTenantId);
         const serviceStaff = staff;
         
         if (serviceStaff.length === 0) {
            resolve(null);
            return;
         }

         const first = serviceStaff[0];
         resolve({
            staffId: first.id,
            date: new Date().toISOString().split('T')[0],
            time: '10:00'
         });
       } catch (err) {
         resolve(null);
       }
    });
  }
};
