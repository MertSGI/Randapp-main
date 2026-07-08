import { authService } from './authService';
import { dataProvider } from './dataProvider';
import { businessProfileService } from './businessProfileService';
import { tenantService } from './tenantService';
import { planService } from './planService';
import { TRIAL_CONFIG } from './trialConfigService';

export interface RegistrationData {
  ownerName: string;
  ownerSurname: string;
  ownerEmail: string;
  ownerPhone: string;
  password: string;
  confirmPassword?: string;
  businessName: string;
  businessDisplayName: string;
  businessCategory: string;
  city: string;
  instagramHandle?: string;
  planId: string;
  billingPeriod: 'monthly' | 'annual';
  acceptTerms: boolean;
  referralCode?: string;
}

export const tenantRegistrationService = {
  async registerTenant(data: RegistrationData): Promise<{ success: boolean; error?: string; tenantId?: string }> {
    try {
      // 1. Create unique tenantId
      const tenantId = data.businessName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.floor(Math.random() * 1000);
      
      // 2. Initialize a local tenant profile (or via Supabase if active)
      // Since we don't have full database setup guaranteed, store metadata securely in data provider
      await dataProvider.set(`randapp:${tenantId}:is_seeded`, 'false');
      
      if (data.referralCode) {
        const { referralProgramService } = await import('./referralProgramService');
        referralProgramService.markReferralRegistered(data.referralCode, tenantId, data.ownerEmail);
      }
      
      // 3. Save basic business form details for setup phase
      const businessDetails = {
        id: `biz-${tenantId}`,
        tenant_id: tenantId,
        short_description: `Hoşgeldiniz! ${data.businessDisplayName} olarak hazırız.`,
        about_text: 'Tesisimiz online randevu kabul etmeye başlamıştır.',
        business_category: data.businessCategory,
        address: data.city,
        city: data.city,
        phone: data.ownerPhone,
        instagram_url: data.instagramHandle ? `https://instagram.com/${data.instagramHandle.replace('@', '')}` : undefined,
        email: data.ownerEmail,
        website_url: ''
      };
      await dataProvider.set(`randapp:${tenantId}:branding`, {
        theme_color: '#4f46e5',
        business_name: data.businessDisplayName,
        logo_url: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&q=80&w=200&h=200',
        cover_image_url: 'https://images.unsplash.com/photo-1600948836101-f9ff5112fa61?auto=format&fit=crop&q=80&w=1200'
      });
      await businessProfileService.updateBusinessProfile(tenantId, businessDetails);

      // 4. Set their mock subscription / selected plan preserving state
      const plans = planService.getActivePlans();
      const plan = plans.find(p => p.id === data.planId) || plans[0];
      
      await dataProvider.set(`randapp:${tenantId}:subscription`, {
        planId: data.planId,
        billingPeriod: data.billingPeriod,
        status: 'pending_checkout',
        currentPeriodEnd: new Date(Date.now() + (plan.trialDays || TRIAL_CONFIG.trialDayCount) * 24 * 60 * 60 * 1000).toISOString(),
        cancelAtPeriodEnd: false
      });

      // 5. Mock Auth / Provisioning status
      // We store the owner auth securely
      const authPayload = {
        id: `usr-${tenantId}`,
        tenant_id: tenantId,
        email: data.ownerEmail,
        role: 'tenant_owner',
        name: `${data.ownerName} ${data.ownerSurname}`,
        onboarding_completed: false
      };
      
      // Save for login simulation (mock store)
      localStorage.setItem('lari_active_owner_session', JSON.stringify(authPayload));
      localStorage.setItem('lari_active_tenant_id', tenantId);
      localStorage.setItem('lari_selected_plan', data.planId);
      localStorage.setItem('lari_registration_context', JSON.stringify(data));
      // Fallback
      localStorage.setItem('randapp_mock_user', JSON.stringify(authPayload));
      
      const { publicLinkService } = await import('./publicLinkService');
      const initialSlug = publicLinkService.generateTenantSlug(data.businessDisplayName);

      const registered = JSON.parse(localStorage.getItem('lari_registered_tenants') || localStorage.getItem('randapp_registered_tenants') || '[]');
      registered.push({
         id: tenantId,
         slug: initialSlug,
         businessName: data.businessDisplayName,
         ownerEmail: data.ownerEmail,
         created_at: new Date().toISOString(),
         planId: data.planId,
         billingPeriod: data.billingPeriod,
         verificationStatus: 'not_submitted',
         publicSiteStatus: 'draft',
         businessRiskStatus: 'normal'
      });
      localStorage.setItem('lari_registered_tenants', JSON.stringify(registered));
      localStorage.setItem('randapp_registered_tenants', JSON.stringify(registered));
      
      await dataProvider.set(`randapp:${tenantId}:provisioning_status`, 'setup_in_progress');
      await dataProvider.set(`randapp:${tenantId}:go_live_status`, 'paused');

      return { success: true, tenantId };
    } catch (err: any) {
      console.error("Registration error:", err);
      return { success: false, error: err.message || 'Üyelik oluşturulurken bir hata oluştu.' };
    }
  }
};
