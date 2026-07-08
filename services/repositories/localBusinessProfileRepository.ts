import { BusinessProfileRepository } from './types';
import { SalonBusinessProfile } from '../../types';

// We import the mock generation logic from the original service to preserve behavior
// Ideally this would be extracted, but we'll include it here to ensure backward compatibility.

const getMockProfile = (tenantId: string): SalonBusinessProfile => {
  return {
    id: 'mock-prof-1',
    tenant_id: tenantId,
    short_description: 'Şehrin en iyi saç tasarım stüdyosu.',
    about_text: 'Yılların verdiği tecrübe ve alanında uzman kadromuzla, size en iyi hizmeti sunmak için buradayız. LARİ teknolojisi ile güzelliğinize değer katıyoruz.',
    business_category: 'Hair Salon',
    address: 'Örnek Mah. Güzellik Sok. No: 12',
    city: 'İstanbul',
    district: 'Kadıköy',
    whatsapp_number: '+905551234567',
    instagram_url: 'https://instagram.com/sandboxtenant',
    opening_hours_summary: 'Pzt-Cmt: 09:00 - 20:00, Pzr: Kapalı',
    cover_images: [
       'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&q=80&w=1200&h=400'
    ],
    gallery_images: [
       'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?auto=format&fit=crop&w=600&h=400&q=80',
       'https://images.unsplash.com/photo-1595476108010-b4d1f10d5e43?auto=format&fit=crop&w=600&h=400&q=80'
    ],
    is_public_profile_enabled: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
};

export class LocalBusinessProfileRepository implements BusinessProfileRepository {
  async getProfile(tenantId: string): Promise<SalonBusinessProfile | null> {
    const localData = localStorage.getItem(`mock_business_profile_${tenantId}`);
    if (localData) {
      return JSON.parse(localData);
    }
    return getMockProfile(tenantId);
  }

  async getBusinessProfile(tenantId: string): Promise<SalonBusinessProfile | null> {
    return this.getProfile(tenantId);
  }

  async updateProfile(tenantId: string, patch: Partial<SalonBusinessProfile>): Promise<SalonBusinessProfile | null> {
    const existing = await this.getProfile(tenantId);
    if (!existing) return null;
    
    const updated = {
      ...existing,
      ...patch,
      tenant_id: tenantId,
      updated_at: new Date().toISOString()
    } as SalonBusinessProfile;
    
    localStorage.setItem(`mock_business_profile_${tenantId}`, JSON.stringify(updated));
    return updated;
  }

  async updateBusinessProfile(tenantId: string, patch: Partial<SalonBusinessProfile>): Promise<SalonBusinessProfile | null> {
    return this.updateProfile(tenantId, patch);
  }

  async getPublicBusinessProfileBySlug(slug: string): Promise<SalonBusinessProfile | null> {
    // Return sample profile for local testing matching the slug
    const tenantId = `tenant_${slug}`;
    return this.getProfile(tenantId);
  }

  async submitForReview(tenantId: string): Promise<void> {
    // Local flow doesn't do much for this strictly in local mode, mostly tracked in verified services.
    console.log(`[LocalBusinessProfileRepository] submitForReview called for ${tenantId}`);
  }

  async updatePublicSiteStatus(tenantId: string, status: string): Promise<void> {
    console.log(`[LocalBusinessProfileRepository] updatePublicSiteStatus called for ${tenantId} to ${status}`);
  }
}
