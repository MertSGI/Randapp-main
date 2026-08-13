import { supabase } from './supabaseClient';
import { dataProvider } from './dataProvider';

export interface BusinessProfileData {
  businessName?: string;
  businessDisplayName?: string;
  businessCategory?: string;
  city?: string;
  address?: string;
  phone?: string;
  shortDescription?: string;
  aboutText?: string;
}

export interface BrandingData {
  primaryColor?: string;
  logoUrl?: string;
  coverImageUrl?: string;
}

export interface BranchData {
  name: string;
  city: string;
  address: string;
  timezone?: string;
}

export interface ServiceData {
  name: string;
  duration: number;
  price: number;
}

export interface StaffData {
  name: string;
  serviceIds?: string[];
  workDays?: number[]; // e.g. [1, 2, 3, 4, 5, 6] (1=Monday .. 7=Sunday)
  startTime?: string; // '09:00'
  endTime?: string;   // '18:00'
}

export interface OnboardingState {
  tenantId: string;
  onboardingStatus: string; // 'onboarding_required' | 'ready_for_review' | 'completed'
  publicSiteStatus: string; // 'draft' | 'pending_review' | 'published'
  salonInfoCompleted: boolean;
  brandingCompleted: boolean;
  servicesCompleted: boolean;
  staffCompleted: boolean;
  calendarCompleted: boolean;
  isOwnerReadyForReview: boolean;
  nextStepId?: string;
}

function isSupabaseMode(): boolean {
  try {
    const env = (import.meta as any).env || (globalThis as any).import?.meta?.env || (globalThis as any).process?.env || {};
    const mode = (env.VITE_DATA_MODE || '').trim();
    return mode === 'supabase_staging' || mode === 'supabase_production';
  } catch (e) {
    return false;
  }
}

export const tenantOnboardingFlowService = {
  /**
   * Resolve owner tenant_id server-authoritatively from auth.uid() -> users_profile
   */
  async resolveOwnerTenantId(): Promise<string | null> {
    if (!isSupabaseMode()) {
      return localStorage.getItem('lari_active_tenant_id') || 'mock-tenant-id';
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) return null;

    const { data: profile, error } = await supabase
      .from('users_profile')
      .select('tenant_id, role')
      .eq('id', userId)
      .single();

    if (error || !profile || !profile.tenant_id) {
      return null;
    }

    return profile.tenant_id;
  },

  /**
   * Load canonical onboarding state from server RPC get_owner_onboarding_state()
   */
  async loadOnboardingState(): Promise<OnboardingState | null> {
    if (!isSupabaseMode()) {
      const tenantId = localStorage.getItem('lari_active_tenant_id') || 'mock-tenant-id';
      return {
        tenantId,
        onboardingStatus: 'onboarding_required',
        publicSiteStatus: 'draft',
        salonInfoCompleted: true,
        brandingCompleted: true,
        servicesCompleted: true,
        staffCompleted: true,
        calendarCompleted: true,
        isOwnerReadyForReview: true,
        nextStepId: undefined
      };
    }

    // Call server-authoritative get_owner_onboarding_state() RPC
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('get_owner_onboarding_state');

    if (rpcErr || !rpcRes) {
      // Fallback query if RPC isn't available
      const tenantId = await this.resolveOwnerTenantId();
      if (!tenantId) return null;

      const { data: progress } = await supabase
        .from('tenant_onboarding_progress')
        .select('*')
        .eq('tenant_id', tenantId)
        .single();

      const { data: tenant } = await supabase
        .from('tenants')
        .select('status, onboarding_status, public_site_status, go_live_status')
        .eq('id', tenantId)
        .single();

      const salonInfoCompleted = Boolean(progress?.salon_info_completed);
      const brandingCompleted = Boolean(progress?.branding_completed);
      const servicesCompleted = Boolean(progress?.services_completed);
      const staffCompleted = Boolean(progress?.staff_completed);
      const calendarCompleted = Boolean(progress?.calendar_completed);
      const isOwnerReadyForReview = salonInfoCompleted && servicesCompleted && staffCompleted && calendarCompleted;

      return {
        tenantId,
        onboardingStatus: tenant?.onboarding_status || 'onboarding_required',
        publicSiteStatus: tenant?.public_site_status || 'draft',
        salonInfoCompleted,
        brandingCompleted,
        servicesCompleted,
        staffCompleted,
        calendarCompleted,
        isOwnerReadyForReview,
        nextStepId: !salonInfoCompleted ? 'business_profile' : (!servicesCompleted ? 'services' : (!staffCompleted ? 'staff' : (!calendarCompleted ? 'availability' : undefined)))
      };
    }

    return {
      tenantId: rpcRes.tenant_id,
      onboardingStatus: rpcRes.onboarding_status || 'onboarding_required',
      publicSiteStatus: rpcRes.public_site_status || 'draft',
      salonInfoCompleted: Boolean(rpcRes.salon_info_completed),
      brandingCompleted: Boolean(rpcRes.branding_completed),
      servicesCompleted: Boolean(rpcRes.services_completed),
      staffCompleted: Boolean(rpcRes.staff_completed),
      calendarCompleted: Boolean(rpcRes.calendar_completed),
      isOwnerReadyForReview: Boolean(rpcRes.is_owner_ready_for_review),
      nextStepId: rpcRes.next_step_id || undefined
    };
  },

  /**
   * Save Business Profile step via server-authoritative RPC
   */
  async saveBusinessProfile(data: BusinessProfileData): Promise<{ success: boolean; error?: string }> {
    if (isSupabaseMode()) {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('save_owner_business_profile', {
        p_business_name: data.businessName || null,
        p_business_display_name: data.businessDisplayName || data.businessName || null,
        p_business_category: data.businessCategory || null,
        p_city: data.city || null,
        p_address: data.address || null,
        p_phone: data.ownerPhone || data.phone || null,
        p_short_description: data.shortDescription || null,
        p_about_text: data.aboutText || null
      } as any);

      if (rpcErr) return { success: false, error: rpcErr.message };
      return { success: Boolean(rpcRes?.success) };
    } else {
      const tenantId = await this.resolveOwnerTenantId();
      await dataProvider.set(`lari:${tenantId}:branding`, {
        business_name: data.businessDisplayName || data.businessName || 'Demak Salon',
        theme_color: '#4f46e5'
      });
      return { success: true };
    }
  },

  /**
   * Save Branding step (Explicit owner confirmation)
   */
  async saveBranding(data: BrandingData): Promise<{ success: boolean; error?: string }> {
    const tenantId = await this.resolveOwnerTenantId();
    if (!tenantId) return { success: false, error: 'Oturum bulunamadı.' };

    if (isSupabaseMode()) {
      const { error: brandErr } = await supabase
        .from('tenant_branding')
        .upsert({
          tenant_id: tenantId,
          primary_color: data.primaryColor || '#4f46e5',
          logo_url: data.logoUrl || null,
          updated_at: new Date().toISOString()
        }, { onConflict: 'tenant_id' });

      if (brandErr) return { success: false, error: brandErr.message };

      await supabase
        .from('tenant_onboarding_progress')
        .update({ branding_completed: true, updated_at: new Date().toISOString() })
        .eq('tenant_id', tenantId);

      return { success: true };
    }
    return { success: true };
  },

  /**
   * FIRST_BRANCH_CONTRACT: Create primary branch via server-authoritative RPC
   */
  async createFirstBranch(data: BranchData): Promise<{ success: boolean; branchId?: string; error?: string }> {
    if (isSupabaseMode()) {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('create_owner_first_branch', {
        p_name: data.name || 'Merkez Şube',
        p_city: data.city || 'İstanbul',
        p_address: data.address || 'Merkez Adres',
        p_timezone: data.timezone || 'Europe/Istanbul'
      });

      if (rpcErr) return { success: false, error: rpcErr.message };
      return { success: true, branchId: rpcRes?.branch_id };
    }

    return { success: true, branchId: 'mock-branch-id' };
  },

  /**
   * FIRST_SERVICE_CONTRACT: Create first service via server-authoritative RPC
   */
  async createFirstService(data: ServiceData): Promise<{ success: boolean; serviceId?: string; error?: string }> {
    if (isSupabaseMode()) {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('create_owner_first_service', {
        p_name: data.name,
        p_duration: data.duration || 30,
        p_price: data.price || 0
      });

      if (rpcErr) return { success: false, error: rpcErr.message };
      return { success: true, serviceId: rpcRes?.service_id };
    }

    return { success: true, serviceId: 'mock-service-id' };
  },

  /**
   * FIRST_STAFF_CONTRACT: Create first staff member via server-authoritative RPC
   */
  async createFirstStaff(data: StaffData): Promise<{ success: boolean; staffId?: string; error?: string }> {
    if (isSupabaseMode()) {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('create_owner_first_staff', {
        p_name: data.name,
        p_service_ids: data.serviceIds || [],
        p_work_days: data.workDays || [1, 2, 3, 4, 5, 6],
        p_start_time: data.startTime || '09:00:00',
        p_end_time: data.endTime || '18:00:00'
      });

      if (rpcErr) return { success: false, error: rpcErr.message };
      return { success: true, staffId: rpcRes?.staff_id };
    }

    return { success: true, staffId: 'mock-staff-id' };
  },

  /**
   * OWNER_ONBOARDING_READY_PREDICATE Evaluation via server-authoritative RPC
   */
  async evaluateAndSetReadiness(): Promise<boolean> {
    if (!isSupabaseMode()) return true;

    const { data: rpcRes, error: rpcErr } = await supabase.rpc('evaluate_owner_onboarding_readiness');
    if (rpcErr || !rpcRes) return false;

    return Boolean(rpcRes.is_owner_ready_for_review);
  }
};
