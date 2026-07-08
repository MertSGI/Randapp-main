import { getStaffList } from './staffService';
import { Staff } from '../types';
import { getAppointments } from './appointmentService';
import { getAvailabilityRepository } from './repositories';

export interface TimeSlot {
  time: string; // HH:mm
  available: boolean;
}

export const availabilityService = {
  async getWorkingHours(tenantId: string): Promise<any> {
    const repo = getAvailabilityRepository();
    return repo.getAvailability(tenantId);
  },

  async updateWorkingHours(tenantId: string, input: any): Promise<any> {
    const repo = getAvailabilityRepository();
    return repo.updateAvailability(tenantId, input);
  },

  async getPublicWorkingHoursBySlug(slug: string): Promise<any> {
    const repo = getAvailabilityRepository();
    return repo.getPublicAvailabilityByTenantSlug(slug);
  },

  getAvailableSlotsForStaff(tenantId: string, staffId: string, serviceId: string, dateStr: string): Promise<TimeSlot[]> {
     return new Promise((resolve) => {
        // Mock generation
        // Normally, we query the appointments for this date and staff, 
        // and check business hours.
        const slots: TimeSlot[] = [];
        const hours = ['10:00', '11:00', '13:00', '14:30', '15:00', '16:30'];
        hours.forEach((h, idx) => {
            // Randomly block some slots based on ID and date string for mock variety
            slots.push({
               time: h,
               available: (idx + staffId.length + dateStr.length) % 3 !== 0
            });
        });
        resolve(slots);
     });
  },

  getNextAvailableSlotForStaff(tenantId: string, staffId: string, serviceId: string): Promise<{date: string, time: string} | null> {
    return new Promise((resolve) => {
       // Mock: Return a synthetic early slot for this staff
       // Normally we scan forward from today to find the first open slot.
       const now = new Date();
       resolve({
          date: now.toISOString().split('T')[0],
          time: staffId === 'staff_1' ? '10:00' : '11:00'
       });
    });
  },

  getEarliestAvailableStaff(tenantId: string, serviceId: string): Promise<{staffId: string, date: string, time: string} | null> {
    return new Promise(async (resolve) => {
       // Find all staff who can perform this service
       // Mock approach: just pick the first available staff
       try {
         const staff = await getStaffList(tenantId);
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
