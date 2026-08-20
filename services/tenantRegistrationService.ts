import { dataProvider } from './dataProvider';
import { businessProfileService } from './businessProfileService';
import { planService } from './planService';
import { TRIAL_CONFIG } from './trialConfigService';
import { supabase } from './supabaseClient';

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

export type RegistrationStatus =
  | 'AUTH_SIGNUP_PENDING'
  | 'EMAIL_CONFIRMATION_REQUIRED'
  | 'AUTHENTICATED_READY_FOR_PROVISIONING'
  | 'PROVISIONING_IN_PROGRESS'
  | 'PROVISIONED'
  | 'PROVISIONING_FAILED_RETRYABLE'
  | 'PROVISIONING_FAILED_TERMINAL'
  | 'USER_ALREADY_HAS_TENANT';

export interface RegistrationResult {
  success: boolean;
  error?: string;
  reasonCode?: string;
  tenantId?: string;
  slug?: string;
  role?: string;
  subscriptionId?: string;
  planCode?: string;
  onboardingStatus?: string;
  status?: RegistrationStatus;
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

/**
  Cryptographically secure idempotency key generator for Supabase provisioning.
  Fails safely without Math.random fallback in Supabase self-service mode.
 */
function generateSecureIdempotencyKey(): string | null {
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.randomUUID === 'function') {
      return 'idemp-' + crypto.randomUUID();
    }
    if (typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
      return 'idemp-' + hex;
    }
  }
  return null;
}

export const tenantRegistrationService = {
  async registerTenant(data: RegistrationData): Promise<RegistrationResult> {
    if (isSupabaseMode()) {
      // In Supabase mode, server provisioning RPC is the sole AUTHORIZATION authority.
      // Frontend catalog checks are presentation/UX-only and must not reject terminal submission prior to RPC invocation.
      return this.registerTenantSupabase(data);
    } else {
      // Mock mode UX/validation guard
      const isEligible = planService.isPublicSelfServicePlan(data.planId);
      if (!isEligible) {
        return {
          success: false,
          status: 'PROVISIONING_FAILED_TERMINAL',
          reasonCode: 'PLAN_NOT_ASSIGNABLE',
          error: 'Seçilen paket self-servis kayıtlara açık değil.'
        };
      }
      return this.registerTenantMock(data);
    }
  },

  async registerTenantSupabase(data: RegistrationData): Promise<RegistrationResult> {
    try {
      // 1. Check active session or perform sign up
      let session = (await supabase.auth.getSession()).data?.session;
      
      if (!session) {
        const { data: authData, error: signUpError } = await supabase.auth.signUp({
          email: data.ownerEmail,
          password: data.password,
          options: {
            data: {
              name: `${data.ownerName} ${data.ownerSurname}`,
              phone: data.ownerPhone,
            }
          }
        });

        if (signUpError) {
          const msg = (signUpError.message || '').toLowerCase();
          if (msg.includes('already registered') || msg.includes('already exists')) {
            const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
              email: data.ownerEmail,
              password: data.password,
            });

            if (signInError || !signInData.session) {
              return {
                success: false,
                status: 'PROVISIONING_FAILED_TERMINAL',
                reasonCode: 'AUTH_FAILED',
                error: 'Bu e-posta adresi zaten kayıtlı. Lütfen giriş yapın veya şifrenizi kontrol edin.'
              };
            }
            session = signInData.session;
          } else {
            return {
              success: false,
              status: 'PROVISIONING_FAILED_TERMINAL',
              reasonCode: 'AUTH_FAILED',
              error: signUpError.message || 'Kullanıcı kaydı oluşturulamadı.'
            };
          }
        } else {
          session = authData.session;
          if (!session && authData.user) {
            return {
              success: false,
              status: 'EMAIL_CONFIRMATION_REQUIRED',
              reasonCode: 'EMAIL_CONFIRMATION_REQUIRED',
              error: 'Hesabınız oluşturuldu. Lütfen e-posta adresinize gönderilen doğrulama bağlantısına tıklayın.'
            };
          }
        }
      }

      if (!session || !session.user) {
        return {
          success: false,
          status: 'PROVISIONING_FAILED_RETRYABLE',
          reasonCode: 'SESSION_MISSING',
          error: 'Oturum açılamadı. Lütfen tekrar deneyin.'
        };
      }

      // 2. Client-side registration attempt idempotency key persistence
      let idempotencyKey = '';
      try {
        idempotencyKey = sessionStorage.getItem(`lari_idemp_${data.ownerEmail}`) || '';
      } catch (e) {}

      if (!idempotencyKey) {
        const secureKey = generateSecureIdempotencyKey();
        if (!secureKey) {
          return {
            success: false,
            status: 'PROVISIONING_FAILED_RETRYABLE',
            reasonCode: 'SECURE_CRYPTO_UNAVAILABLE',
            error: 'Güvenli tarayıcı ortamı sağlanamadı. Lütfen tarayıcınızı güncelleyin veya tekrar deneyin.'
          };
        }
        idempotencyKey = secureKey;
        try {
          sessionStorage.setItem(`lari_idemp_${data.ownerEmail}`, idempotencyKey);
        } catch (e) {}
      }

      // 3. Call Server-Authoritative Provisioning RPC (Exact parameter contract matching public.provision_tenant_for_authenticated_owner)
      const { data: rpcRes, error: rpcError } = await supabase.rpc('provision_tenant_for_authenticated_owner', {
        p_business_name: data.businessName,
        p_business_display_name: data.businessDisplayName || data.businessName,
        p_business_category: data.businessCategory || 'Hair Salon',
        p_city: data.city || 'Istanbul',
        p_phone: data.ownerPhone || '',
        p_requested_plan_code: data.planId,
        p_idempotency_key: idempotencyKey
      });

      if (rpcError) {
        const errMsg = rpcError.message || '';

        if (errMsg.includes('USER_ALREADY_HAS_TENANT')) {
          const { data: profile } = await supabase.from('users_profile').select('tenant_id, role').eq('id', session.user.id).single();
          const existingTenantId = profile?.tenant_id;
          if (existingTenantId) {
            const { data: tenantRow } = await supabase.from('tenants').select('slug, status, onboarding_status').eq('id', existingTenantId).single();
            localStorage.setItem('lari_active_tenant_id', existingTenantId);
            if (tenantRow?.slug) localStorage.setItem('lari_active_tenant_slug', tenantRow.slug);
            return {
              success: true,
              status: 'USER_ALREADY_HAS_TENANT',
              reasonCode: 'USER_ALREADY_HAS_TENANT',
              tenantId: existingTenantId,
              slug: tenantRow?.slug,
              role: profile?.role || 'tenant_owner',
              onboardingStatus: tenantRow?.onboarding_status || 'onboarding_required'
            };
          }
          return {
            success: false,
            status: 'PROVISIONING_FAILED_TERMINAL',
            reasonCode: 'USER_ALREADY_HAS_TENANT',
            error: 'Bu kullanıcı hesabına ait aktif bir mağaza zaten mevcut.'
          };
        }

        if (errMsg.includes('PROFILE_NOT_PROVISIONABLE')) {
          return {
            success: false,
            status: 'PROVISIONING_FAILED_TERMINAL',
            reasonCode: 'PROFILE_NOT_PROVISIONABLE',
            error: 'Sistem yöneticisi veya personel hesapları mağaza kaydı yapamaz.'
          };
        }

        if (errMsg.includes('PLAN_NOT_ASSIGNABLE')) {
          return {
            success: false,
            status: 'PROVISIONING_FAILED_TERMINAL',
            reasonCode: 'PLAN_NOT_ASSIGNABLE',
            error: 'Seçilen paket self-servis kayıtlara açık değil.'
          };
        }

        if (errMsg.includes('NO_EFFECTIVE_PLAN_VERSION')) {
          return {
            success: false,
            status: 'PROVISIONING_FAILED_TERMINAL',
            reasonCode: 'NO_EFFECTIVE_PLAN_VERSION',
            error: 'Sistem paket konfigürasyon hatası. Lütfen daha sonra tekrar deneyin veya destek ile iletişime geçin.'
          };
        }

        if (errMsg.includes('MULTIPLE_EFFECTIVE_PLAN_VERSIONS')) {
          return {
            success: false,
            status: 'PROVISIONING_FAILED_TERMINAL',
            reasonCode: 'MULTIPLE_EFFECTIVE_PLAN_VERSIONS',
            error: 'Sistem paket konfigürasyon hatası. Lütfen daha sonra tekrar deneyin veya destek ile iletişime geçin.'
          };
        }

        if (errMsg.includes('MISSING_IDEMPOTENCY_KEY')) {
          return {
            success: false,
            status: 'PROVISIONING_FAILED_RETRYABLE',
            reasonCode: 'MISSING_IDEMPOTENCY_KEY',
            error: 'İşlem anahtarı eksik. Lütfen tekrar deneyin.'
          };
        }

        return {
          success: false,
          status: 'PROVISIONING_FAILED_RETRYABLE',
          reasonCode: 'SERVER_ERROR',
          error: 'Mağaza oluşturulurken bir hata meydana geldi. Lütfen tekrar deneyin.'
        };
      }

      // Clear attempt idempotency key on full success
      try {
        sessionStorage.removeItem(`lari_idemp_${data.ownerEmail}`);
      } catch (e) {}

      // Store canonical authenticated state from server RPC truth ONLY
      const tenantId = rpcRes.tenant_id;
      const slug = rpcRes.slug;
      const role = rpcRes.role;

      localStorage.setItem('lari_active_tenant_id', tenantId);
      localStorage.setItem('lari_active_tenant_slug', slug);
      localStorage.setItem('lari_active_owner_session', JSON.stringify({
        id: session.user.id,
        tenant_id: tenantId,
        role: role,
        email: data.ownerEmail,
        name: `${data.ownerName} ${data.ownerSurname}`
      }));

      return {
        success: true,
        status: 'PROVISIONED',
        tenantId,
        slug,
        role,
        subscriptionId: rpcRes.subscription_id,
        planCode: rpcRes.plan_code,
        onboardingStatus: rpcRes.onboarding_status
      };
    } catch (err: any) {
      return {
        success: false,
        status: 'PROVISIONING_FAILED_RETRYABLE',
        reasonCode: 'UNKNOWN_ERROR',
        error: err.message || 'Üyelik oluşturulurken beklenmeyen bir hata oluştu.'
      };
    }
  },

  async registerTenantMock(data: RegistrationData): Promise<RegistrationResult> {
    try {
      const tenantId = data.businessName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.floor(Math.random() * 1000);
      
      try {
        await dataProvider.set(`lari:${tenantId}:is_seeded`, 'false');
      } catch (e) {}
      
      if (data.referralCode) {
        try {
          const { referralProgramService } = await import('./referralProgramService');
          referralProgramService.markReferralRegistered(data.referralCode, tenantId, data.ownerEmail);
        } catch (e) {}
      }

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

      try {
        await dataProvider.set(`lari:${tenantId}:branding`, {
          theme_color: '#4f46e5',
          business_name: data.businessDisplayName,
          logo_url: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&q=80&w=200&h=200',
          cover_image_url: 'https://images.unsplash.com/photo-1600948836101-f9ff5112fa61?auto=format&fit=crop&q=80&w=1200'
        });
        await businessProfileService.updateBusinessProfile(tenantId, businessDetails);
      } catch (e) {}

      const plans = planService.getActivePlans();
      const plan = plans.find(p => p.id === data.planId) || plans[0];
      
      try {
        await dataProvider.set(`lari:${tenantId}:subscription`, {
          planId: data.planId,
          billingPeriod: data.billingPeriod,
          status: 'pending_checkout',
          currentPeriodEnd: new Date(Date.now() + (plan.trialDays || TRIAL_CONFIG.trialDayCount) * 24 * 60 * 60 * 1000).toISOString(),
          cancelAtPeriodEnd: false
        });
      } catch (e) {}

      const authPayload = {
        id: `usr-${tenantId}`,
        tenant_id: tenantId,
        email: data.ownerEmail,
        role: 'tenant_owner',
        name: `${data.ownerName} ${data.ownerSurname}`,
        onboarding_completed: false
      };
      
      try {
        localStorage.setItem('lari_active_owner_session', JSON.stringify(authPayload));
        localStorage.setItem('lari_active_tenant_id', tenantId);
        localStorage.setItem('lari_selected_plan', data.planId);
        localStorage.setItem('lari_registration_context', JSON.stringify(data));
        localStorage.setItem('lari_mock_user', JSON.stringify(authPayload));
      } catch (e) {}
      
      let initialSlug = data.businessDisplayName.toLowerCase().replace(/[^a-z0-9]/g, '-');
      try {
        const { publicLinkService } = await import('./publicLinkService');
        initialSlug = publicLinkService.generateTenantSlug(data.businessDisplayName);
      } catch (e) {}

      try {
        const registered = JSON.parse(localStorage.getItem('lari_registered_tenants') || '[]');
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
      } catch (e) {}
      
      try {
        await dataProvider.set(`lari:${tenantId}:provisioning_status`, 'setup_in_progress');
        await dataProvider.set(`lari:${tenantId}:go_live_status`, 'paused');
      } catch (e) {}

      return {
        success: true,
        status: 'PROVISIONED',
        tenantId,
        slug: initialSlug,
        role: 'tenant_owner',
        planCode: data.planId,
        onboardingStatus: 'onboarding_required'
      };
    } catch (err: any) {
      return { success: false, status: 'PROVISIONING_FAILED_TERMINAL', error: err.message || 'Üyelik oluşturulurken bir hata oluştu.' };
    }
  }
};
