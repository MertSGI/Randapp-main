import { Tenant } from '../types';

export const PROHIBITED_CATEGORIES = [
  'adult',
  'escort',
  'sexual',
  'illegal',
  'weapons',
  'drugs'
];

export const SUSPICIOUS_KEYWORDS = [
  'fake',
  'test',
  'demo', // Except for our own pilot demo
  'scam'
];

export interface VerificationResult {
  riskStatus: 'normal' | 'needs_review' | 'prohibited' | 'suspected_impersonation';
  reasons: string[];
}

export const businessVerificationService = {
  analyzeBusiness(
    businessName: string,
    publicDisplayName: string,
    category: string,
    description: string
  ): VerificationResult {
    const reasons: string[] = [];
    let riskStatus: 'normal' | 'needs_review' | 'prohibited' | 'suspected_impersonation' = 'normal';

    const textToAnalyze = `${businessName} ${publicDisplayName} ${category} ${description}`.toLowerCase();

    // Check prohibited
    for (const keyword of PROHIBITED_CATEGORIES) {
      if (textToAnalyze.includes(keyword)) {
        riskStatus = 'prohibited';
        reasons.push(`Contains prohibited keyword: ${keyword}`);
      }
    }

    if (riskStatus === 'prohibited') return { riskStatus, reasons };

    // Check suspicious/test
    for (const keyword of SUSPICIOUS_KEYWORDS) {
      if (textToAnalyze.includes(keyword) && !textToAnalyze.includes('tenant_pilot_demo')) {
         if (riskStatus === 'normal') riskStatus = 'needs_review';
         reasons.push(`Contains suspicious keyword: ${keyword}`);
      }
    }

    // Check impersonation risk (e.g. business name and display name are wildly different, or contain famous brands)
    // Simplified for now: just flag if they are very different in length or structure, or known brands
    const knownBrands = ['starbucks', 'mcdonalds', 'zara', 'nike', 'apple'];
    for (const brand of knownBrands) {
       if (textToAnalyze.includes(brand)) {
          riskStatus = 'suspected_impersonation';
          reasons.push(`Contains known brand name: ${brand}`);
       }
    }

    return { riskStatus, reasons };
  },

  submitForReview(tenantId: string, businessData: any): { success: boolean; result: VerificationResult } {
     const analysis = this.analyzeBusiness(
        businessData.officialBusinessName || businessData.businessName || '',
        businessData.publicDisplayName || '',
        businessData.category || '',
        businessData.description || ''
     );

     const registeredArr = JSON.parse(localStorage.getItem('lari_registered_tenants') || '[]');
     const index = registeredArr.findIndex((t: any) => t.id === tenantId);
     
     if (index !== -1) {
        registeredArr[index].businessRiskStatus = analysis.riskStatus;
        if (analysis.riskStatus === 'prohibited') {
           registeredArr[index].verificationStatus = 'rejected';
        } else {
           registeredArr[index].verificationStatus = 'under_review';
        }
        localStorage.setItem('lari_registered_tenants', JSON.stringify(registeredArr));
     }

     return { success: analysis.riskStatus !== 'prohibited', result: analysis };
  },
  
  publishSite(tenantId: string): boolean {
     const registeredArr = JSON.parse(localStorage.getItem('lari_registered_tenants') || '[]');
     const index = registeredArr.findIndex((t: any) => t.id === tenantId);
     
     if (index !== -1) {
        const tenant = registeredArr[index];
        // Allow if approved, or if they were normal and just auto-approved
        if (tenant.verificationStatus === 'approved' || tenant.verificationStatus === 'not_submitted') {
           registeredArr[index].verificationStatus = 'approved';
           registeredArr[index].publicSiteStatus = 'published';
           localStorage.setItem('lari_registered_tenants', JSON.stringify(registeredArr));
           return true;
        }
     }
     return false;
  }
};
