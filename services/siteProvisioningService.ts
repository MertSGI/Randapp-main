import { publicLinkService } from './publicLinkService';
import { marketConfigService } from './marketConfigService';
import { tenantService } from './tenantService';
import { supabase } from './supabaseClient';
import type { Tenant } from '../types';
import { communicationEventService } from './communicationEventService';
import {
  SLUG_VALIDATION_REASONS,
  type SlugValidationResult,
  generateSlugFromName,
  getSlugAlternatives,
  isValidSlug,
  validateSlugFormat,
} from '../utils/slugUtils';

export type ProvisioningStepStatus = 
  | 'not_started'
  | 'slug_reserved'
  | 'profile_ready'
  | 'catalog_ready'
  | 'preview_ready'
  | 'submitted_for_review'
  | 'published';

export type CustomDomainStatus = 'requested' | 'dns_instructions_sent' | 'verifying' | 'active' | 'rejected' | 'paused';

export interface CustomDomainRequest {
  id: string;
  tenantId: string;
  domain: string;
  desiredType: 'root_domain' | 'subdomain';
  status: CustomDomainStatus;
  createdAt: string;
  updatedAt: string;
  notes?: string;
}

export interface AtomicSlugReservationRpcResult {
  reserved: boolean;
  slug: string;
  reason: string;
  collisionResolved: boolean;
}

/**
 * ARCHITECTURAL BOUNDARY NOTE (P0 Correction 6):
 * `slugReservationQueue` is strictly a client-side, single-tab in-memory Promise
 * serialization queue. It serializes concurrent calls within a single JavaScript
 * runtime (e.g. mock mode or same-tab UI actions), but it is NOT a distributed
 * database lock across multiple browser clients, tabs, or server processes, and
 * does NOT prove Supabase multi-client reservation correctness.
 *
 * True multi-client Supabase reservation correctness requires:
 * 1. The PostgreSQL UNIQUE constraint on `public.tenants(slug)` (`tenants_slug_key`), AND
 * 2. The least-privilege `SECURITY DEFINER` atomic RPC `public.reserve_tenant_slug`
 *    (proposed in `supabase/proposals/20261030_proposed_reserve_tenant_slug_atomic_rpc.sql`),
 *    because `20260714_tenants_update_rls_hardening.sql` dropped direct `tenant_owner`
 *    UPDATE privileges on `public.tenants`.
 */
let slugReservationQueue: Promise<void> = Promise.resolve();

function runWithSlugReservationLock<T>(operation: () => Promise<T>): Promise<T> {
  const next = slugReservationQueue.then(operation, operation);
  slugReservationQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

async function hasExclusiveSlugOwnership(tenantId: string, targetSlug: string): Promise<boolean> {
  try {
    const updatedTenant = await tenantService.getTenantById(tenantId);
    const postWriteOwner = await tenantService.getTenantBySlug(targetSlug);
    if (
      !updatedTenant ||
      updatedTenant.id !== tenantId ||
      updatedTenant.slug !== targetSlug ||
      !postWriteOwner ||
      postWriteOwner.id !== tenantId
    ) {
      return false;
    }

    const raw =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('lari_registered_tenants')
        : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const owners = parsed.filter((t: any) => t && t.slug === targetSlug);
        if (owners.length !== 1 || owners[0].id !== tenantId) {
          return false;
        }
      }
    }
  } catch {
    return false;
  }

  return true;
}

export const siteProvisioningService = {
  generateTenantSlugFromBusinessName(name: string): string {
    return generateSlugFromName(name);
  },

  async validateTenantSlug(slug: string, tenantId?: string): Promise<SlugValidationResult> {
    return publicLinkService.validateSlug(slug, tenantId);
  },

  /**
   * Client-side binding for the proposed least-privilege PostgreSQL atomic RPC
   * `public.reserve_tenant_slug(p_tenant_id uuid, p_desired_slug text)`.
   * Performs client-side pre-validation (rejecting reserved/malformed slugs without
   * fallback) before invoking the database-side atomic transaction.
   */
  async reserveTenantSlugAtomicRpc(
    tenantId: string,
    desiredSlug: string,
    rpcClient: { rpc?: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }> } = supabase as any
  ): Promise<AtomicSlugReservationRpcResult> {
    if (typeof tenantId !== 'string' || !tenantId.trim()) {
      return {
        reserved: false,
        slug: '',
        reason: SLUG_VALIDATION_REASONS.EMPTY_OR_SHORT,
        collisionResolved: false,
      };
    }
    if (typeof desiredSlug !== 'string' || !desiredSlug.trim()) {
      return {
        reserved: false,
        slug: '',
        reason: SLUG_VALIDATION_REASONS.EMPTY_OR_SHORT,
        collisionResolved: false,
      };
    }

    const formatCheck = validateSlugFormat(desiredSlug);
    if (!formatCheck.isValid || !isValidSlug(formatCheck.normalizedSlug)) {
      return {
        reserved: false,
        slug: formatCheck.normalizedSlug,
        reason: formatCheck.reason,
        collisionResolved: false,
      };
    }

    if (!rpcClient || typeof rpcClient.rpc !== 'function') {
      return {
        reserved: false,
        slug: formatCheck.normalizedSlug,
        reason: 'RPC_CLIENT_UNAVAILABLE',
        collisionResolved: false,
      };
    }

    try {
      const { data, error } = await rpcClient.rpc('reserve_tenant_slug', {
        p_tenant_id: tenantId.trim(),
        p_desired_slug: formatCheck.normalizedSlug,
      });

      if (error || !data) {
        return {
          reserved: false,
          slug: formatCheck.normalizedSlug,
          reason: error?.code || error?.message || SLUG_VALIDATION_REASONS.UNKNOWN_ERROR,
          collisionResolved: false,
        };
      }

      const reserved = Boolean(data.reserved);
      const assignedSlug = typeof data.slug === 'string' ? data.slug : '';
      const reason = typeof data.reason === 'string' ? data.reason : (reserved ? SLUG_VALIDATION_REASONS.VALID : SLUG_VALIDATION_REASONS.UNKNOWN_ERROR);
      const collisionResolved = Boolean(data.collision_resolved ?? data.collisionResolved);

      if (!reserved || !isValidSlug(assignedSlug)) {
        return {
          reserved: false,
          slug: assignedSlug,
          reason,
          collisionResolved: false,
        };
      }

      return {
        reserved: true,
        slug: assignedSlug,
        reason,
        collisionResolved,
      };
    } catch {
      return {
        reserved: false,
        slug: formatCheck.normalizedSlug,
        reason: SLUG_VALIDATION_REASONS.UNKNOWN_ERROR,
        collisionResolved: false,
      };
    }
  },

  async reserveTenantSlug(tenantId: string, desiredSlug: string): Promise<boolean> {
    return runWithSlugReservationLock(async () => {
      if (typeof tenantId !== 'string' || !tenantId.trim()) {
        return false;
      }
      if (typeof desiredSlug !== 'string' || !desiredSlug.trim()) {
        return false;
      }

      const normalizedTenantId = tenantId.trim();
      let tenant: Tenant | null = null;
      try {
        tenant = await tenantService.getTenantById(normalizedTenantId);
      } catch {
        return false;
      }
      if (!tenant || tenant.id !== normalizedTenantId) {
        return false;
      }

      let val = await this.validateTenantSlug(desiredSlug, normalizedTenantId);
      let targetSlug = val.normalizedSlug;

      if (!val.isValid) {
        // Policy gate: deterministic suffix fallback is permitted ONLY when a
        // valid, non-reserved canonical slug is occupied by another tenant.
        if (val.reason !== SLUG_VALIDATION_REASONS.SLUG_TAKEN || !isValidSlug(targetSlug)) {
          return false;
        }

        const alternatives = getSlugAlternatives(targetSlug);
        for (const alt of alternatives) {
          if (!isValidSlug(alt)) {
            continue;
          }
          const altVal = await this.validateTenantSlug(alt, normalizedTenantId);
          if (
            altVal.isValid &&
            altVal.reason === SLUG_VALIDATION_REASONS.VALID &&
            altVal.normalizedSlug === alt
          ) {
            targetSlug = alt;
            val = altVal;
            break;
          }
        }
      }

      if (
        !val.isValid ||
        val.reason !== SLUG_VALIDATION_REASONS.VALID ||
        !isValidSlug(targetSlug)
      ) {
        return false;
      }

      // Pre-write ownership re-check against cross-tenant collision
      try {
        const preWriteOwner = await tenantService.getTenantBySlug(targetSlug);
        if (preWriteOwner && preWriteOwner.id !== normalizedTenantId) {
          return false;
        }
      } catch {
        return false;
      }

      const previousSlug = tenant.slug;
      try {
        await tenantService.updateTenant(normalizedTenantId, { slug: targetSlug });
      } catch (updateErr) {
        console.error('Slug reservation persistence failed in updateTenant:', updateErr);
        return false;
      }

      // Post-write verification against concurrent duplicate race (including tail duplicates) or unverified write
      const isExclusive = await hasExclusiveSlugOwnership(normalizedTenantId, targetSlug);
      if (!isExclusive) {
        try {
          const currentTenant = await tenantService.getTenantById(normalizedTenantId);
          if (currentTenant && currentTenant.slug !== previousSlug) {
            await tenantService.updateTenant(normalizedTenantId, { slug: previousSlug });
          }
        } catch {
          // Ignore rollback failure on read-only / RLS blocked backend
        }
        return false;
      }

      // Queue preview ready event
      try {
        const previewUrl = `https://${targetSlug}.randevulari.com/preview`;
        communicationEventService.queueCommunicationEvent({
          tenantId: normalizedTenantId,
          audience: 'business_owner',
          channel: 'in_app',
          type: 'public_site_preview_ready',
          contextArgs: {
            businessName: tenant.branding?.businessName || tenant.name,
            previewUrl
          }
        });
      } catch (err) {
        console.error('Slug preview outbox event fail:', err);
      }
      return true;
    });
  },

  getProvisioningStatus(tenantId: string): ProvisioningStepStatus {
    // In a real DB, this would be a field. For now, derive mock status:
    return 'preview_ready'; // Fallback for local
  },

  async provisionTenantPublicSite(tenantId: string): Promise<void> {
    const tenant = await tenantService.getTenantById(tenantId);
    if (tenant) {
       await tenantService.updateTenant(tenantId, { isPublished: true });
       
       const publicUrl = this.getPublicSiteUrl(tenant);
       
       try {
         communicationEventService.queueCommunicationEvent({
           tenantId,
           audience: 'business_owner',
           channel: 'email',
           type: 'public_site_published',
           contextArgs: {
             businessName: tenant.branding?.businessName || tenant.name,
             publicUrl
           }
         });
       } catch (err) {
         console.error('Site published outbox event hook error:', err);
       }
    }
  },

  async updateTenantPublicSiteStatus(tenantId: string, status: boolean): Promise<void> {
    await tenantService.updateTenant(tenantId, { isPublished: status });
  },

  getPublicSiteUrl(tenant: Tenant): string {
    if (tenant.customDomain) {
      return tenant.customDomain.startsWith('http') ? tenant.customDomain : `https://${tenant.customDomain}`;
    }

    // Use subdomain if market config supports it, otherwise fallback to hash routing
    const market = marketConfigService.getCurrentMarketConfig();
    const slug = tenant.slug || tenant.id;
    
    if (slug) {
       return `https://${slug}.${market.localizedDomainLabel}`; 
    }

    const baseUrl = window.location.origin;
    return `${baseUrl}/#/book?tenant=${slug}`;
  },

  getBranchPublicSiteUrl(tenant: Tenant, branchSlugOrId: string): string {
    const baseUrl = this.getPublicSiteUrl(tenant);
    // Standard URL format for branch
    if (baseUrl.includes('#')) {
      return `${baseUrl}&branch=${branchSlugOrId}`;
    }
    return `${baseUrl}/${branchSlugOrId}`;
  },
  
  // Custom domains dummy state just for reference right now
  async requestCustomDomain(tenantId: string, domain: string): Promise<boolean> {
    console.log(`Requested custom domain ${domain} for tenant ${tenantId}`);
    
    try {
      const tenant = await tenantService.getTenantById(tenantId);
      
      communicationEventService.queueCommunicationEvent({
        tenantId,
        audience: 'business_owner',
        channel: 'email',
        type: 'custom_domain_requested',
        contextArgs: {
          ownerName: 'İşletme Yetkilisi',
          businessName: tenant?.branding?.businessName || tenant?.name || tenantId,
          domainName: domain
        }
      });

      // Simulate automated deployment success in local database mode in 1.5 seconds
      setTimeout(async () => {
        communicationEventService.queueCommunicationEvent({
          tenantId,
          audience: 'business_owner',
          channel: 'email',
          type: 'custom_domain_active',
          contextArgs: {
            domainName: domain
          }
        });
      }, 1500);

    } catch (e) {
      console.error('Custom domain outbox hook error:', e);
    }
    return true;
  },

  validateCustomDomainFormat(domain: string): boolean {
    const regex = /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/;
    return regex.test(domain.toLowerCase());
  }
};
