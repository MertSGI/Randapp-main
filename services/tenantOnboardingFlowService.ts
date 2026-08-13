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
   * Load canonical onboarding state from DB in Supabase mode
   */
  async loadOnboardingState(): Promise<OnboardingState | null> {
    const tenantId = await this.resolveOwnerTenantId();
    if (!tenantId) return null;

    if (!isSupabaseMode()) {
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

    // 1. Fetch tenant_onboarding_progress row
    const { data: progress } = await supabase
      .from('tenant_onboarding_progress')
      .select('*')
      .eq('tenant_id', tenantId)
      .single();

    // 2. Fetch tenant row
    const { data: tenant } = await supabase
      .from('tenants')
      .select('status, onboarding_status, public_site_status, go_live_status')
      .eq('id', tenantId)
      .single();

    // 3. Evaluate canonical step completions from real database rows
    const { count: serviceCount } = await supabase
      .from('services')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('active', true);

    const { count: staffCount } = await supabase
      .from('staff')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('active', true);

    const { count: availCount } = await supabase
      .from('availability_rules')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

    const salonInfoCompleted = Boolean(progress?.salon_info_completed);
    const brandingCompleted = Boolean(progress?.branding_completed);
    const servicesCompleted = (serviceCount || 0) >= 1 || Boolean(progress?.services_completed);
    const staffCompleted = (staffCount || 0) >= 1 || Boolean(progress?.staff_completed);
    const calendarCompleted = (availCount || 0) >= 1 || Boolean(progress?.calendar_completed);

    const isOwnerReadyForReview = salonInfoCompleted && servicesCompleted && staffCompleted && calendarCompleted;

    let nextStepId = undefined;
    if (!salonInfoCompleted) nextStepId = 'business_profile';
    else if (!servicesCompleted) nextStepId = 'services';
    else if (!staffCompleted) nextStepId = 'staff';
    else if (!calendarCompleted) nextStepId = 'availability';

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
      nextStepId
    };
  },

  /**
   * Save Business Profile step
   */
  async saveBusinessProfile(data: BusinessProfileData): Promise<{ success: boolean; error?: string }> {
    const tenantId = await this.resolveOwnerTenantId();
    if (!tenantId) return { success: false, error: 'Oturum bulunamadı veya yetkisiz erişim.' };

    if (isSupabaseMode()) {
      // Update tenant_business_profiles while keeping is_public_profile_enabled = false
      const { error: profileErr } = await supabase
        .from('tenant_business_profiles')
        .upsert({
          tenant_id: tenantId,
          business_category: data.businessCategory || 'Hair Salon',
          city: data.city || 'Istanbul',
          address: data.address || '',
          phone: data.phone || '',
          short_description: data.shortDescription || null,
          about_text: data.aboutText || null,
          is_public_profile_enabled: false, // Draft privacy enforced
          updated_at: new Date().toISOString()
        }, { onConflict: 'tenant_id' });

      if (profileErr) return { success: false, error: profileErr.message };

      // Update tenant official names if provided
      if (data.businessName || data.businessDisplayName) {
        await supabase
          .from('tenants')
          .update({
            official_business_name: data.businessName,
            public_display_name: data.businessDisplayName || data.businessName,
            updated_at: new Date().toISOString()
          })
          .eq('id', tenantId);
      }

      // Mark salon_info_completed = true in tenant_onboarding_progress
      await supabase
        .from('tenant_onboarding_progress')
        .update({ salon_info_completed: true, updated_at: new Date().toISOString() })
        .eq('tenant_id', tenantId);

      await this.evaluateAndSetReadiness(tenantId);
      return { success: true };
    } else {
      // Mock mode fallback
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

      // Explicit owner confirmation marks branding_completed = true
      await supabase
        .from('tenant_onboarding_progress')
        .update({ branding_completed: true, updated_at: new Date().toISOString() })
        .eq('tenant_id', tenantId);

      return { success: true };
    }
    return { success: true };
  },

  /**
   * FIRST_BRANCH_CONTRACT: Create primary branch idempotently
   */
  async createFirstBranch(data: BranchData): Promise<{ success: boolean; branchId?: string; error?: string }> {
    const tenantId = await this.resolveOwnerTenantId();
    if (!tenantId) return { success: false, error: 'Oturum bulunamadı.' };

    if (isSupabaseMode()) {
      // Check existing branch to prevent duplicate primary branch creation
      const { data: existing } = await supabase
        .from('branches')
        .select('id')
        .eq('tenant_id', tenantId)
        .limit(1);

      if (existing && existing.length > 0) {
        return { success: true, branchId: existing[0].id };
      }

      const branchId = crypto.randomUUID();
      const { error } = await supabase
        .from('branches')
        .insert({
          id: branchId,
          tenant_id: tenantId,
          name: data.name || 'Merkez Şube',
          city: data.city || 'Istanbul',
          address: data.address || 'Merkez Adres',
          timezone: data.timezone || 'Europe/Istanbul',
          is_primary: true,
          active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (error) return { success: false, error: error.message };
      return { success: true, branchId };
    }

    return { success: true, branchId: 'mock-branch-id' };
  },

  /**
   * FIRST_SERVICE_CONTRACT: Create first service idempotently
   */
  async createFirstService(data: ServiceData): Promise<{ success: boolean; serviceId?: string; error?: string }> {
    const tenantId = await this.resolveOwnerTenantId();
    if (!tenantId) return { success: false, error: 'Oturum bulunamadı.' };

    if (isSupabaseMode()) {
      const { data: existing } = await supabase
        .from('services')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('name', data.name)
        .eq('active', true)
        .limit(1);

      if (existing && existing.length > 0) {
        return { success: true, serviceId: existing[0].id };
      }

      const serviceId = crypto.randomUUID();
      const { error } = await supabase
        .from('services')
        .insert({
          id: serviceId,
          tenant_id: tenantId,
          name: data.name,
          duration: data.duration || 30,
          price: data.price || 100,
          active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (error) return { success: false, error: error.message };

      await supabase
        .from('tenant_onboarding_progress')
        .update({ services_completed: true, updated_at: new Date().toISOString() })
        .eq('tenant_id', tenantId);

      await this.evaluateAndSetReadiness(tenantId);
      return { success: true, serviceId };
    }

    return { success: true, serviceId: 'mock-service-id' };
  },

  /**
   * FIRST_STAFF_CONTRACT: Create first staff member, link branch & services & availability
   */
  async createFirstStaff(data: StaffData): Promise<{ success: boolean; staffId?: string; error?: string }> {
    const tenantId = await this.resolveOwnerTenantId();
    if (!tenantId) return { success: false, error: 'Oturum bulunamadı.' };

    if (isSupabaseMode()) {
      const { data: existing } = await supabase
        .from('staff')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('name', data.name)
        .eq('active', true)
        .limit(1);

      let staffId = existing && existing.length > 0 ? existing[0].id : null;

      if (!staffId) {
        staffId = crypto.randomUUID();
        const { error: staffErr } = await supabase
          .from('staff')
          .insert({
            id: staffId,
            tenant_id: tenantId,
            name: data.name,
            active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

        if (staffErr) return { success: false, error: staffErr.message };
      }

      // Link staff_services if service IDs provided
      if (data.serviceIds && data.serviceIds.length > 0) {
        for (const sId of data.serviceIds) {
          // Verify service belongs to same tenant to prevent cross-tenant mapping
          const { data: servCheck } = await supabase.from('services').select('tenant_id').eq('id', sId).single();
          if (servCheck && servCheck.tenant_id === tenantId) {
            await supabase
              .from('staff_services')
              .upsert({ staff_id: staffId, service_id: sId }, { onConflict: 'staff_id,service_id' });
          }
        }
      }

      // Create availability_rules
      const workDays = data.workDays || [1, 2, 3, 4, 5, 6];
      const startTime = data.startTime || '09:00:00';
      const endTime = data.endTime || '18:00:00';

      for (const day of workDays) {
        await supabase
          .from('availability_rules')
          .upsert({
            tenant_id: tenantId,
            staff_id: staffId,
            weekday: day,
            start_time: startTime,
            end_time: endTime,
            is_active: true
          }, { onConflict: 'tenant_id,staff_id,weekday' });
      }

      await supabase
        .from('tenant_onboarding_progress')
        .update({
          staff_completed: true,
          calendar_completed: true,
          updated_at: new Date().toISOString()
        })
        .eq('tenant_id', tenantId);

      await this.evaluateAndSetReadiness(tenantId);
      return { success: true, staffId };
    }

    return { success: true, staffId: 'mock-staff-id' };
  },

  /**
   * OWNER_ONBOARDING_READY_PREDICATE Evaluation:
   * Evaluate if all 4 required steps (salon_info, services, staff, calendar) are complete.
   * If complete, update tenant status to 'ready_for_review' without publishing storefront or changing subscription status.
   */
  async evaluateAndSetReadiness(tenantId: string): Promise<boolean> {
    if (!isSupabaseMode()) return true;

    const state = await this.loadOnboardingState();
    if (!state) return false;

    if (state.isOwnerReadyForReview && state.onboardingStatus === 'onboarding_required') {
      // Transition onboarding_status from 'onboarding_required' to 'ready_for_review'
      // Preserves draft site privacy (public_site_status remains 'draft', subscription status remains 'pending_onboarding')
      await supabase
        .from('tenants')
        .update({
          onboarding_status: 'ready_for_review',
          updated_at: new Date().toISOString()
        })
        .eq('id', tenantId);

      await supabase
        .from('tenant_onboarding_progress')
        .update({
          reviewed_by_admin: false,
          updated_at: new Date().toISOString()
        })
        .eq('tenant_id', tenantId);

      return true;
    }

    return state.isOwnerReadyForReview;
  }
};
