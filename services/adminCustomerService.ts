import { CustomerProfile, Appointment, CustomerMemoryNote, CustomerMemoryPhoto } from '../types';
import { getCustomerRepository } from './repositories';

export const normalizeEmail = (email?: string): string => {
  if (!email) return '';
  return email.trim().toLowerCase();
};

export const normalizePhone = (phone?: string): string => {
  if (!phone) return '';
  return phone.replace(/[\s\-\(\)\+]/g, '');
};

// Provide a wrapped adapter to maintain the old synchronous array-returning signatures
// where possible or convert consumers to async. 
// Actually, `adminCustomerService` is used synchronously in many places? Let's check.
// I will change the methods to async and rely on the repository.
export const adminCustomerService = {
  async getCustomers(tenantId: string, appointments?: Appointment[]): Promise<CustomerProfile[]> {
    return getCustomerRepository().listCustomers(tenantId);
  },

  async getCustomer(tenantId: string, customerId: string): Promise<CustomerProfile | null> {
    return getCustomerRepository().getCustomer(tenantId, customerId);
  },

  async updateCustomer(tenantId: string, customerId: string, updates: Partial<CustomerProfile>): Promise<CustomerProfile | null> {
    return getCustomerRepository().updateCustomer(tenantId, customerId, updates);
  },

  async addNote(tenantId: string, customerId: string, text: string, createdBy: string = 'Salon'): Promise<CustomerMemoryNote> {
    await getCustomerRepository().addCustomerNote(customerId, text, createdBy);
    // Fetch again to return the latest node.
    const cust = await getCustomerRepository().getCustomer(tenantId, customerId);
    const notes = cust?.internalNotes || [];
    return notes[notes.length - 1]; 
  },

  async deleteNote(tenantId: string, customerId: string, noteId: string): Promise<void> {
    const cust = await getCustomerRepository().getCustomer(tenantId, customerId);
    if (cust && cust.internalNotes) {
      const filtered = cust.internalNotes.filter((n: any) => n.id !== noteId);
      await getCustomerRepository().updateCustomerMemory(customerId, { internalNotes: filtered });
    }
  },

  async addPhoto(tenantId: string, customerId: string, url: string, caption?: string): Promise<CustomerMemoryPhoto | null> {
    const photo: CustomerMemoryPhoto = {
      id: crypto.randomUUID(),
      url,
      caption,
      createdAt: new Date().toISOString()
    };
    
    const cust = await getCustomerRepository().getCustomer(tenantId, customerId);
    if (cust) {
       const existing = cust.referencePhotos || [];
       await getCustomerRepository().updateCustomerMemory(customerId, { referencePhotos: [...existing, photo] });
       return photo;
    }
    return null;
  },
  
  async deletePhoto(tenantId: string, customerId: string, photoId: string): Promise<void> {
    const cust = await getCustomerRepository().getCustomer(tenantId, customerId);
    if (cust && cust.referencePhotos) {
       const filtered = cust.referencePhotos.filter((p: any) => p.id !== photoId);
       await getCustomerRepository().updateCustomerMemory(customerId, { referencePhotos: filtered });
    }
  }
};
