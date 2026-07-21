/**
 * useAdminBootstrap.ts — Stage B.2
 *
 * Single server-scoped admin bootstrap hook.
 *
 * Contract:
 * - Calls get_my_admin_bootstrap() ONCE per (currentUserId, dataMode, retryNonce).
 * - Computes tab-feature availability deterministically from cached subscription summary.
 * - Never re-fetches unchanged data on tab changes.
 * - A Retry (increment retryNonce) produces exactly one new request.
 * - Fail-closed: failed request never retries automatically.
 * - Mounted-component check prevents stale state updates.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { fetchSupabase } from './repositories/supabaseClient';
import { getDataSourceMode } from './dataSourceConfig';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AdminBootstrapTenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  verification_status: string;
  public_site_status: string;
  business_risk_status: string;
  onboarding_status: string;
  official_business_name: string | null;
  public_display_name: string | null;
  category: string | null;
  city: string | null;
  district: string | null;
  created_at: string;
}

export interface AdminBootstrapBusinessProfile {
  business_category: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  phone: string | null;
  whatsapp_number: string | null;
  website: string | null;
  instagram_handle: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  is_public_profile_enabled: boolean;
  public_display_name: string | null;
}

export interface AdminBootstrapService {
  id: string;
  name: string;
  name_tr: string | null;
  duration: number;
  price: number;
  active: boolean;
  category: string | null;
}

export interface AdminBootstrapStaff {
  id: string;
  name: string;
  title: string | null;
  active: boolean;
  is_owner: boolean;
}

export interface AdminBootstrapBranch {
  id: string;
  name: string;
  slug: string;
  is_primary: boolean;
  is_active: boolean;
  timezone: string | null;
}

export interface AdminBootstrapSubscription {
  plan_id: string | null;
  status: string | null;
  billing_source: string | null;
  paid_through_date: string | null;
  trial_end: string | null;
  cancel_at_period_end: boolean;
}

export interface AdminBootstrapData {
  tenant: AdminBootstrapTenant;
  business_profile: AdminBootstrapBusinessProfile | null;
  services: AdminBootstrapService[];
  staff: AdminBootstrapStaff[];
  branches: AdminBootstrapBranch[];
  subscription: AdminBootstrapSubscription | null;
  timezone: string;
  user_role: string;
}

export type AdminTabAvailability = Record<string, { isAccessible: boolean; lockReason: string | null; recommendedAction: string | null }>;

/** Derive all tab availability from a subscription summary without any network request. */
function deriveTabAvailability(
  subscription: AdminBootstrapSubscription | null,
  services: AdminBootstrapService[],
  staff: AdminBootstrapStaff[]
): AdminTabAvailability {
  const planId = subscription?.plan_id || 'free';
  const hasActiveSubscription = subscription?.status === 'manual_active' ||
    subscription?.status === 'active' ||
    subscription?.status === 'trialing' ||
    subscription?.status === 'comped';

  const alwaysAccessible = { isAccessible: true, lockReason: null, recommendedAction: null };

  const tabs: AdminTabAvailability = {};
  const allTabs = ['dashboard', 'setup', 'appointments', 'staff', 'services', 'reports', 'billing', 'profile', 'settings', 'customers', 'referrals'];

  for (const tab of allTabs) {
    if (['dashboard', 'setup', 'billing', 'settings', 'services', 'staff', 'profile', 'appointments', 'customers', 'reports'].includes(tab)) {
      tabs[tab] = alwaysAccessible;
      continue;
    }
    if (tab === 'referrals') {
      if (planId === 'free' && !hasActiveSubscription) {
        tabs[tab] = {
          isAccessible: false,
          lockReason: 'Müşteri Kampanyaları özelliği mevcut paketinizde yer almıyor.',
          recommendedAction: 'upgrade'
        };
      } else {
        tabs[tab] = alwaysAccessible;
      }
      continue;
    }
    tabs[tab] = alwaysAccessible;
  }
  return tabs;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

interface UseAdminBootstrapOptions {
  currentUserId: string | null | undefined;
  retryNonce: number;
}

interface UseAdminBootstrapResult {
  data: AdminBootstrapData | null;
  tabAvailability: AdminTabAvailability;
  loading: boolean;
  error: string | null;
  invalidateAfterMutation: () => void;
}

export function useAdminBootstrap({ currentUserId, retryNonce }: UseAdminBootstrapOptions): UseAdminBootstrapResult {
  const [data, setData] = useState<AdminBootstrapData | null>(null);
  const [tabAvailability, setTabAvailability] = useState<AdminTabAvailability>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inFlightRef = useRef(false);
  const loadedKeyRef = useRef('');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const dataMode = getDataSourceMode();

  const load = useCallback(async (userId: string) => {
    const requestKey = `${userId}:${dataMode}:${retryNonce}`;
    if (loadedKeyRef.current === requestKey) return;
    if (inFlightRef.current) return;

    inFlightRef.current = true;
    if (mountedRef.current) {
      setLoading(true);
      setError(null);
    }

    try {
      if (dataMode === 'supabase') {
        // Call single server-scoped bootstrap RPC
        const res = await fetchSupabase('/rest/v1/rpc/get_my_admin_bootstrap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });

        if (!mountedRef.current) return;

        if (!res.ok) {
          console.error(`[useAdminBootstrap] bootstrap RPC failed: HTTP ${res.status}`);
          setError('Admin verileri şu anda yüklenemiyor. Lütfen tekrar deneyin.');
          return;
        }

        const raw = await res.json();
        const result = Array.isArray(raw) ? raw[0] : raw;

        if (!result?.success) {
          console.error(`[useAdminBootstrap] bootstrap RPC returned: ${result?.reason_code}`);
          setError('Admin verileri şu anda yüklenemiyor. Lütfen tekrar deneyin.');
          return;
        }

        const bootstrapData: AdminBootstrapData = {
          tenant: result.tenant,
          business_profile: result.business_profile || null,
          services: result.services || [],
          staff: result.staff || [],
          branches: result.branches || [],
          subscription: result.subscription || null,
          timezone: result.timezone || 'Europe/Istanbul',
          user_role: result.user_role || 'tenant_owner',
        };

        const tabs = deriveTabAvailability(
          bootstrapData.subscription,
          bootstrapData.services,
          bootstrapData.staff
        );

        if (mountedRef.current) {
          setData(bootstrapData);
          setTabAvailability(tabs);
          setError(null);
          loadedKeyRef.current = requestKey;
        }
      } else {
        // Local/mock mode: skip RPC, return empty bootstrap
        if (mountedRef.current) {
          setData(null);
          setTabAvailability({});
          setError(null);
          loadedKeyRef.current = requestKey;
        }
      }
    } catch (err: any) {
      if (!mountedRef.current) return;
      console.error('[useAdminBootstrap] unexpected error:', err?.message || err);
      setError('Admin verileri şu anda yüklenemiyor. Lütfen tekrar deneyin.');
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }, [dataMode, retryNonce]);

  useEffect(() => {
    if (!currentUserId) return;
    load(currentUserId);
  }, [currentUserId, load]);

  const invalidateAfterMutation = useCallback(() => {
    loadedKeyRef.current = '';
  }, []);

  return { data, tabAvailability, loading, error, invalidateAfterMutation };
}
