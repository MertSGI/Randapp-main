import { SalonBusinessProfile } from '../types';
import { getBusinessProfileRepository } from './repositories';

export const businessProfileService = {
  async getBusinessProfile(tenantId: string): Promise<SalonBusinessProfile | null> {
    const repo = getBusinessProfileRepository();
    return repo.getBusinessProfile(tenantId);
  },

  async updateBusinessProfile(tenantId: string, profileData: Partial<SalonBusinessProfile>): Promise<SalonBusinessProfile | null> {
    const repo = getBusinessProfileRepository();
    return repo.updateBusinessProfile(tenantId, profileData);
  },

  async getPublicBusinessProfile(tenantId: string): Promise<SalonBusinessProfile | null> {
      return this.getBusinessProfile(tenantId);
  },

  async getPublicBusinessProfileBySlug(slug: string): Promise<SalonBusinessProfile | null> {
    const repo = getBusinessProfileRepository();
    return repo.getPublicBusinessProfileBySlug(slug);
  },

  getMockProfile(tenantId: string): SalonBusinessProfile {
    // Left for backwards compatibility if needed elsewhere
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
  }
};

