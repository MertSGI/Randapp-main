import { BusinessProfileRepository } from './types';
import { SalonBusinessProfile } from '../../types';
import { fetchSupabase } from './supabaseClient';

export class SupabaseBusinessProfileRepository implements BusinessProfileRepository {
  async getProfile(tenantId: string): Promise<SalonBusinessProfile | null> {
    try {
      const res = await fetchSupabase(`/rest/v1/tenant_business_profiles?tenant_id=eq.${tenantId}&select=*`);
      if (!res.ok) {
        console.warn('Supabase fetch failed for getProfile. Fallback mock data structure may be required if tables are unprovisioned.');
        return null;
      }
      const data = await res.json();
      return data[0] || null;
    } catch (err) {
      console.error('Error fetching business profile from Supabase:', err);
      // Fail gracefully so frontend doesn't crash if unprovisioned
      return null;
    }
  }

  async getBusinessProfile(tenantId: string): Promise<SalonBusinessProfile | null> {
    return this.getProfile(tenantId);
  }

  async updateProfile(tenantId: string, patch: Partial<SalonBusinessProfile>): Promise<SalonBusinessProfile | null> {
    try {
      const existing = await this.getProfile(tenantId);
      
      let res;
      if (existing) {
        res = await fetchSupabase(`/rest/v1/tenant_business_profiles?tenant_id=eq.${tenantId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() })
        });
      } else {
        res = await fetchSupabase(`/rest/v1/tenant_business_profiles`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({ ...patch, tenant_id: tenantId })
        });
      }

      if (!res.ok) throw new Error("Failed to save business profile to Supabase");
      const data = await res.json();
      return data[0];
    } catch(err) {
      console.error("Error updating business profile:", err);
      throw err;
    }
  }

  async updateBusinessProfile(tenantId: string, patch: Partial<SalonBusinessProfile>): Promise<SalonBusinessProfile | null> {
    return this.updateProfile(tenantId, patch);
  }

  async getPublicBusinessProfileBySlug(slug: string): Promise<SalonBusinessProfile | null> {
    try {
      // Find the tenant first to obtain its ID
      const tenantRes = await fetchSupabase(`/rest/v1/tenants?slug=eq.${slug}&select=*`);
      if (!tenantRes.ok) return null;
      const tenantData = await tenantRes.json();
      if (!tenantData[0]) return null;
      
      const tenantId = tenantData[0].id;
      const profile = await this.getProfile(tenantId);
      if (!profile || !profile.is_public_profile_enabled) return null;

      // Filter public-safe fields to protect internal states
      return {
        id: profile.id,
        tenant_id: profile.tenant_id,
        public_display_name: profile.public_display_name,
        short_description: profile.short_description,
        about_text: profile.about_text,
        business_category: profile.business_category,
        address: profile.address,
        city: profile.city,
        district: profile.district,
        map_embed_url: profile.map_embed_url,
        google_maps_url: profile.google_maps_url,
        phone: profile.phone,
        whatsapp_number: profile.whatsapp_number,
        instagram_url: profile.instagram_url,
        website_url: profile.website_url,
        email: profile.email,
        opening_hours_summary: profile.opening_hours_summary,
        cover_image_url: profile.cover_image_url,
        cover_images: profile.cover_images,
        logo_url: profile.logo_url,
        gallery_images: profile.gallery_images,
        amenities: profile.amenities,
        parking_info: profile.parking_info,
        payment_methods: profile.payment_methods,
        cancellation_policy: profile.cancellation_policy,
        booking_policy: profile.booking_policy,
        featured_message: profile.featured_message,
        is_public_profile_enabled: true,
        created_at: profile.created_at,
        updated_at: profile.updated_at
      };
    } catch (err) {
      console.error('Error fetching public business profile by slug:', err);
      return null;
    }
  }

  async submitForReview(tenantId: string): Promise<void> {
    console.log(`Supabase submitForReview called for tenant_id: ${tenantId}`);
    // Update profile status as pending review or under_review
    await this.updateProfile(tenantId, { is_public_profile_enabled: false } as any);
  }

  async updatePublicSiteStatus(tenantId: string, status: string): Promise<void> {
    console.log(`Supabase updatePublicSiteStatus called for tenant_id: ${tenantId} to status: ${status}`);
    const isEnabled = status === 'published';
    await this.updateProfile(tenantId, { is_public_profile_enabled: isEnabled } as any);
  }
}
