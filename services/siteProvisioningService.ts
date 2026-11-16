import { publicLinkService } from './publicLinkService';
import { getDataSourceMode } from './dataSourceConfig';
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

    if (getDataSourceMode() !== 'supabase') {
      const raw =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem('lari_registered_tenants')
          : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const owners = (parsed as Array<{ id?: string; slug?: string } | null | undefined>).filter(
            (t) => Boolean(t && typeof t === 'object' && t.slug === targetSlug)
          );
          if (owners.length !== 1 || !owners[0] || owners[0].id !== tenantId) {
            return false;
          }
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
    rpcClient: { rpc?: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }> } = supabase
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

    // Fail-closed client validation: reserved or malformed words are rejected without RPC invocation
    const formatCheck = validateSlugFormat(desiredSlug);
    if (!formatCheck.isValid) {
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
        reason: SLUG_VALIDATION_REASONS.UNKNOWN_ERROR,
        collisionResolved: false,
      };
    }

    try {
      const response = await rpcClient.rpc('reserve_tenant_slug', {
        p_tenant_id: tenantId.trim(),
        p_desired_slug: formatCheck.normalizedSlug,
      });

      if (response.error) {
        console.error('reserve_tenant_slug RPC returned error:', response.error);
        return {
          reserved: false,
          slug: formatCheck.normalizedSlug,
          reason: response.error.code === '42501' ? 'FORBIDDEN_NOT_TENANT_OWNER' : SLUG_VALIDATION_REASONS.UNKNOWN_ERROR,
          collisionResolved: false,
        };
      }

      const payload = response.data as {
        reserved?: boolean;
        slug?: string;
        reason?: string;
        collision_resolved?: boolean;
      } | null;

      if (!payload || typeof payload !== 'object') {
        return {
          reserved: false,
          slug: formatCheck.normalizedSlug,
          reason: SLUG_VALIDATION_REASONS.UNKNOWN_ERROR,
          collisionResolved: false,
        };
      }

      return {
        reserved: Boolean(payload.reserved),
        slug: typeof payload.slug === 'string' ? payload.slug : '',
        reason: typeof payload.reason === 'string' ? payload.reason : SLUG_VALIDATION_REASONS.UNKNOWN_ERROR,
        collisionResolved: Boolean(payload.collision_resolved),
      };
    } catch (rpcErr) {
      console.error('reserveTenantSlugAtomicRpc network or runtime invocation failure:', rpcErr);
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
      const normalizedTenantId = typeof tenantId === 'string' ? tenantId.trim() : '';
      if (!normalizedTenantId) return false;

      const formatCheck = validateSlugFormat(desiredSlug);
      // Strictly reject invalid, empty, overlong or reserved base slugs without fallback
      if (!formatCheck.isValid) return false;

      const tenant = await tenantService.getTenantById(normalizedTenantId);
      if (!tenant) return false;

      // Retain previous slug for transactional rollback on post-write exclusivity failure
      const previousSlug = tenant.slug || '';

      // Determine target candidate slug
      let targetSlug = formatCheck.normalizedSlug;
      const initialVal = await this.validateTenantSlug(targetSlug, normalizedTenantId);

      if (!initialVal.isValid) {
        // Deterministic suffix fallback ONLY on collision (not on format/reserved rejection)
        if (initialVal.reason !== SLUG_VALIDATION_REASONS.SLUG_TAKEN) {
          return false;
        }

        const alternatives = getSlugAlternatives(formatCheck.normalizedSlug);
        let resolvedAlternative: string | null = null;

        for (const candidate of alternatives) {
          const candVal = await this.validateTenantSlug(candidate, normalizedTenantId);
          if (candVal.isValid) {
            resolvedAlternative = candidate;
            break;
          }
        }

        if (!resolvedAlternative) {
          return false;
        }

        targetSlug = resolvedAlternative;
      }

      if (!isValidSlug(targetSlug)) {
        return false;
      }

      const isSupabase = getDataSourceMode() === 'supabase';

      // In Supabase mode, route through the atomic RPC
      if (isSupabase) {
        const rpcResult = await this.reserveTenantSlugAtomicRpc(normalizedTenantId, targetSlug);
        if (!rpcResult.reserved || !rpcResult.slug) {
          return false;
        }
        targetSlug = rpcResult.slug;
      } else {
        // In local mode, perform the mock repository update
        await tenantService.updateTenant(normalizedTenantId, { slug: targetSlug });
      }

      // Post-write exclusivity verification (read-after-write integrity check)
      const isExclusive = await hasExclusiveSlugOwnership(normalizedTenantId, targetSlug);
      if (!isExclusive) {
        if (!isSupabase) {
          console.error(`Post-write exclusivity verification failed for tenant ${normalizedTenantId} on slug '${targetSlug}'. Attempting rollback to '${previousSlug}'...`);
          let rollbackSuccess = false;
          let rollbackError: unknown = null;
          try {
            if (previousSlug) {
              await tenantService.updateTenant(normalizedTenantId, { slug: previousSlug });
              const restoredTenant = await tenantService.getTenantById(normalizedTenantId);
              if (restoredTenant && restoredTenant.slug === previousSlug) {
                rollbackSuccess = true;
              }
            }
          } catch (err) {
            rollbackError = err;
            console.error(`CRITICAL: Post-write exclusivity verification failed for tenant ${normalizedTenantId} on slug '${targetSlug}' and automated rollback to '${previousSlug}' failed:`, err);
          }

          if (!rollbackSuccess) {
            const errMsg = rollbackError instanceof Error ? rollbackError.message : String(rollbackError || 'Unverified restored state');
            throw new Error(`SLUG_RESERVATION_STATE_DIVERGENCE: Exclusivity verification failed for slug '${targetSlug}' and rollback to '${previousSlug}' could not be verified (${errMsg}). Persistent manual remediation required.`);
          }
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
