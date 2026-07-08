import { dataProvider } from './dataProvider';
import { supabase } from './supabaseClient';
import { TenantBranding } from '../types';
import { tenantService } from './tenantService';

const getBrandingKey = (tenantId: string) => `randapp:${tenantId}:branding`;

const isSupabaseMode = () => ((import.meta as any).env.VITE_DATA_MODE || 'mock') === 'supabase';

export const getBranding = async (tenantId: string): Promise<TenantBranding | null> => {
  return tenantService.getTenantBranding(tenantId);
};

export const updateBranding = async (tenantId: string, branding: TenantBranding): Promise<void> => {
  if (isSupabaseMode()) {
    const { error } = await supabase
      .from('tenant_branding')
      .upsert({
        tenant_id: tenantId,
        logo_url: branding.logoUrl,
        primary_color: branding.primaryColor,
        accent_color: branding.secondaryColor,
        business_name: branding.businessName,
        tagline: branding.tagline,
        footer_text: branding.footerText,
        instagram_url: branding.instagramUrl,
        whatsapp_number: branding.whatsappNumber,
        address: branding.address,
      }, { onConflict: 'tenant_id' });
      
    if (error) {
      console.error('Error updating branding in supabase:', error);
      throw new Error(error.message);
    }
    return;
  }
  
  await dataProvider.set(getBrandingKey(tenantId), branding);
};
