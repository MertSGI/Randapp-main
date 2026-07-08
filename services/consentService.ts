import { CustomerConsentFlags, CustomerDataRequest, BusinessOwnerTermsAcceptance } from '../types';

const LARI_CONSENT_VERSION = '1.0';

export const consentService = {
  getCurrentConsentVersion(): string {
    return LARI_CONSENT_VERSION;
  },

  getDefaultConsentFlags(): CustomerConsentFlags {
    return {
      bookingContactConsent: false,
      appointmentReminderConsent: false,
      marketingConsent: false,
      referralCampaignConsent: false,
      customerMemoryConsent: false,
      referencePhotoConsent: false,
      aiStyleAssistantConsent: false,
      consentVersion: this.getCurrentConsentVersion(),
      consentCapturedAt: new Date().toISOString(),
      consentSource: 'booking'
    };
  },

  captureBookingConsent(tenantId: string, customerInput: { 
    id: string; 
    requiredBookingConsent: boolean; 
    reminderConsent: boolean; 
    marketingConsent: boolean; 
    referralConsent: boolean; 
  }): CustomerConsentFlags {
    
    const flags: CustomerConsentFlags = {
      bookingContactConsent: customerInput.requiredBookingConsent,
      appointmentReminderConsent: customerInput.reminderConsent,
      marketingConsent: customerInput.marketingConsent,
      referralCampaignConsent: customerInput.referralConsent,
      // By default, if they book, they give implicit operational memory consent for notes, unless otherwise designed
      customerMemoryConsent: customerInput.requiredBookingConsent,
      referencePhotoConsent: false,
      aiStyleAssistantConsent: false,
      consentVersion: this.getCurrentConsentVersion(),
      consentCapturedAt: new Date().toISOString(),
      consentSource: 'booking'
    };

    if (typeof window !== 'undefined') {
      const allConsentsStr = localStorage.getItem(`lari_customer_consents_by_tenant_${tenantId}`) || '{}';
      let allConsents;
      try {
        allConsents = JSON.parse(allConsentsStr);
      } catch (e) {
        allConsents = {};
      }
      
      allConsents[customerInput.id] = flags;
      localStorage.setItem(`lari_customer_consents_by_tenant_${tenantId}`, JSON.stringify(allConsents));
    }

    return flags;
  },

  getCustomerConsent(tenantId: string, customerId: string): CustomerConsentFlags | null {
    if (typeof window !== 'undefined') {
      const allConsentsStr = localStorage.getItem(`lari_customer_consents_by_tenant_${tenantId}`);
      if (allConsentsStr) {
        try {
          const allConsents = JSON.parse(allConsentsStr);
          return allConsents[customerId] || null;
        } catch (e) {}
      }
    }
    return null;
  },

  updateCustomerConsent(tenantId: string, customerId: string, patch: Partial<CustomerConsentFlags>): CustomerConsentFlags {
    const current = this.getCustomerConsent(tenantId, customerId) || this.getDefaultConsentFlags();
    const updated = {
      ...current,
      ...patch,
      consentVersion: this.getCurrentConsentVersion(),
      consentCapturedAt: new Date().toISOString()
    };

    if (typeof window !== 'undefined') {
      const allConsentsStr = localStorage.getItem(`lari_customer_consents_by_tenant_${tenantId}`) || '{}';
      let allConsents;
      try {
         allConsents = JSON.parse(allConsentsStr);
      } catch (e) {
         allConsents = {};
      }
      allConsents[customerId] = updated;
      localStorage.setItem(`lari_customer_consents_by_tenant_${tenantId}`, JSON.stringify(allConsents));
    }
    return updated;
  },

  canUseCustomerMemory(tenantId: string, customerId: string): boolean {
    const consent = this.getCustomerConsent(tenantId, customerId);
    return consent ? !!consent.customerMemoryConsent : false;
  },

  canSendMarketing(tenantId: string, customerId: string): boolean {
    const consent = this.getCustomerConsent(tenantId, customerId);
    return consent ? !!consent.marketingConsent : false;
  },

  canUseReferencePhotos(tenantId: string, customerId: string): boolean {
    const consent = this.getCustomerConsent(tenantId, customerId);
    return consent ? !!consent.referencePhotoConsent : false;
  },

  createCustomerDataRequest(tenantId: string, customerId: string, requestType: 'export' | 'delete' | 'correction'): CustomerDataRequest {
    const req: CustomerDataRequest = {
      id: `cdr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      tenantId,
      customerId,
      requestType,
      status: 'pending',
      requestedAt: new Date().toISOString()
    };

    if (typeof window !== 'undefined') {
      const allStr = localStorage.getItem(`lari_customer_data_requests_by_tenant_${tenantId}`) || '[]';
      let allReqs;
      try {
        allReqs = JSON.parse(allStr);
      } catch (e) {
        allReqs = [];
      }
      allReqs.push(req);
      localStorage.setItem(`lari_customer_data_requests_by_tenant_${tenantId}`, JSON.stringify(allReqs));
    }
    return req;
  },

  listCustomerDataRequests(tenantId: string): CustomerDataRequest[] {
    if (typeof window !== 'undefined') {
      const allStr = localStorage.getItem(`lari_customer_data_requests_by_tenant_${tenantId}`);
      if (allStr) {
        try {
          return JSON.parse(allStr);
        } catch (e) {}
      }
    }
    return [];
  },

  markDataRequestCompleted(tenantId: string, requestId: string, notes?: string): void {
     if (typeof window !== 'undefined') {
      const allStr = localStorage.getItem(`lari_customer_data_requests_by_tenant_${tenantId}`) || '[]';
      let allReqs;
      try {
        allReqs = JSON.parse(allStr);
      } catch (e) { return; }
      
      const req = allReqs.find((r: any) => r.id === requestId);
      if (req) {
         req.status = 'completed';
         req.completedAt = new Date().toISOString();
         if (notes) req.notes = notes;
         localStorage.setItem(`lari_customer_data_requests_by_tenant_${tenantId}`, JSON.stringify(allReqs));
      }
    }
  },

  recordBusinessOwnerTermsAcceptance(tenantId: string, ownerUserId: string): BusinessOwnerTermsAcceptance {
    const act: BusinessOwnerTermsAcceptance = {
       tenantId,
       ownerUserId,
       termsVersion: '1.0',
       privacyVersion: '1.0',
       acceptedAt: new Date().toISOString(),
       source: 'registration'
    };
    if (typeof window !== 'undefined') {
        const str = localStorage.getItem(`lari_owner_terms_acceptance`) || '[]';
        let all;
        try {
           all = JSON.parse(str);
        } catch(e) { all = []; }
        all.push(act);
        localStorage.setItem(`lari_owner_terms_acceptance`, JSON.stringify(all));
    }
    return act;
  }
};
