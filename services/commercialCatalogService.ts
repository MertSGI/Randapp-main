import { supabase } from './supabaseClient';
import {
  CommercialPublicPlan,
  TenantCommercialSubscriptionSnapshot,
  SuperAdminCommercialCatalog
} from '../types/commercial';

/**
 * Commercial Catalog Service (H1A Read-Only Foundation)
 * 
 * Provides read-only access to the canonical Supabase commercial plan catalog,
 * effective tenant subscription snapshots, and Super Admin commercial read contracts.
 * 
 * NOTE: This service is read-only. It contains no mutation methods and does not
 * rely on browser localStorage as commercial authority.
 */
export const commercialCatalogService = {
  /**
   * Fetches published public commercial plan catalog from Supabase via RPC.
   * Safe for anonymous and authenticated callers.
   */
  async getPublicCatalog(): Promise<CommercialPublicPlan[]> {
    const { data, error } = await supabase.rpc('get_public_commercial_plan_catalog');

    if (error) {
      console.error('getPublicCatalog error:', error);
      return [];
    }

    return (data as CommercialPublicPlan[]) || [];
  },

  /**
   * Fetches authenticated tenant's commercial subscription snapshot and effective entitlements.
   * Tenant identity is derived server-side via auth.uid().
   */
  async getMyCommercialSubscriptionSnapshot(): Promise<TenantCommercialSubscriptionSnapshot | null> {
    const { data, error } = await supabase.rpc('get_my_commercial_subscription_snapshot');

    if (error) {
      console.error('getMyCommercialSubscriptionSnapshot error:', error);
      return null;
    }

    return (data as TenantCommercialSubscriptionSnapshot) || null;
  },

  /**
   * Super Admin catalog view returning all plans including private, draft, and legacy plans.
   * Requires super_admin role.
   */
  async superAdminGetCatalog(): Promise<SuperAdminCommercialCatalog | null> {
    const { data, error } = await supabase.rpc('super_admin_get_commercial_catalog');

    if (error) {
      console.error('superAdminGetCatalog error:', error);
      return null;
    }

    return (data as SuperAdminCommercialCatalog) || null;
  },

  /**
   * Super Admin tenant commercial snapshot view for any tenant ID.
   * Requires super_admin role.
   */
  async superAdminGetTenantSnapshot(tenantId: string): Promise<TenantCommercialSubscriptionSnapshot | null> {
    const { data, error } = await supabase.rpc('super_admin_get_tenant_commercial_snapshot', {
      p_tenant_id: tenantId
    });

    if (error) {
      console.error('superAdminGetTenantSnapshot error:', error);
      return null;
    }

    return (data as TenantCommercialSubscriptionSnapshot) || null;
  }
};
