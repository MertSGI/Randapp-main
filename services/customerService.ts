import { CustomerProfile } from '../types';

const getLocalStorageKey = (tenantId: string) => `randapp_customer_profile_${tenantId}`;

export const customerService = {
  getSavedCustomerProfile(tenantId: string): CustomerProfile | null {
    try {
      const stored = localStorage.getItem(getLocalStorageKey(tenantId));
      if (stored) {
        return JSON.parse(stored) as CustomerProfile;
      }
    } catch (e) {
      console.warn('Could not parse saved customer profile');
    }
    return null;
  },

  saveCustomerProfile(tenantId: string, profile: Omit<CustomerProfile, 'id' | 'tenantId'>): CustomerProfile {
    const newProfile: CustomerProfile = {
      ...profile,
      id: crypto.randomUUID(),
      tenantId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    try {
      localStorage.setItem(getLocalStorageKey(tenantId), JSON.stringify(newProfile));
    } catch (e) {
      console.warn('Could not save customer profile to localStorage');
    }
    return newProfile;
  },

  clearSavedCustomerProfile(tenantId: string): void {
    try {
      localStorage.removeItem(getLocalStorageKey(tenantId));
    } catch (e) {
      console.warn('Could not clear customer profile from localStorage');
    }
  },

  updateLastAppointmentAt(tenantId: string): void {
    const profile = this.getSavedCustomerProfile(tenantId);
    if (profile) {
      profile.lastAppointmentAt = new Date().toISOString();
      profile.updatedAt = new Date().toISOString();
      try {
        localStorage.setItem(getLocalStorageKey(tenantId), JSON.stringify(profile));
      } catch (e) {}
    }
  }
};
