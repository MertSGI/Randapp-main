import { supabase } from './supabaseClient';
import { getDataSourceMode } from './dataSourceConfig';
import type {
  CommercialPublicPlan,
  TenantCommercialSubscriptionSnapshot,
  SuperAdminCommercialCatalog
} from '../types/commercial';

const ELIGIBLE_SUBSCRIPTION_STATUSES = new Set([
  'active',
  'manual_active',
  'comped',
  'trialing'
]);

const LEGACY_PLAN_CODES = new Set(['standart']);

export function isLegacyPlanCode(planCode?: string | null): boolean {
  if (typeof planCode !== 'string') return false;
  return LEGACY_PLAN_CODES.has(planCode.trim().toLowerCase());
}

export function filterPublicAssignableCatalog(plans: unknown): CommercialPublicPlan[] {
  if (!Array.isArray(plans)) {
    return [];
  }
  return plans.filter((item): item is CommercialPublicPlan => {
    if (!item || typeof item !== 'object') {
      return false;
    }
    const plan = item as CommercialPublicPlan & {
      is_public?: boolean;
      is_legacy?: boolean;
      is_assignable?: boolean;
      is_active?: boolean;
      plan_id?: string;
    };
    if (
      plan.is_legacy === true ||
      plan.is_public === false ||
      plan.is_assignable === false ||
      plan.is_active === false
    ) {
      return false;
    }
    if (isLegacyPlanCode(plan.plan_code) || isLegacyPlanCode(plan.plan_id)) {
      return false;
    }
    return true;
  });
}

export interface CommercialEnforcementSnapshot {
  success: boolean;
  tenant_id?: string;
  plan_id?: string;
  subscription_status?: string;
  is_eligible?: boolean;
  reason_code?: string;
  features?: Record<string, boolean>;
  limits?: Record<string, number>;
  [key: string]: unknown;
}

function isFutureOrUnboundedTimestamp(value: string | null | undefined, nowMs: number): boolean {
  if (value === null || value === undefined || value === '') {
    return true;
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    // Malformed timestamp fails closed rather than granting access.
    return false;
  }
  return parsed > nowMs;
}

function isRequiredFutureTimestamp(value: string | null | undefined, nowMs: number): boolean {
  if (typeof value !== 'string' || value.trim() === '') {
    return false;
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return false;
  }
  return parsed > nowMs;
}

/**
 * Validates that a commercial subscription snapshot explicitly authorizes active
 * entitlements for the current point in time (fail-closed on missing/invalid/expired state).
 */
export function isCommercialSubscriptionSnapshotEligible(
  snapshot: TenantCommercialSubscriptionSnapshot | null | undefined,
  now: Date | number = Date.now()
): boolean {
  if (!snapshot || snapshot.success !== true) {
    return false;
  }

  const record = snapshot as unknown as Record<string, unknown>;
  const nestedSub = (
    record.subscription && typeof record.subscription === 'object'
      ? (record.subscription as Record<string, unknown>)
      : null
  );

  const rawStatus =
    (typeof record.status === 'string' ? record.status : undefined) ??
    (nestedSub && typeof nestedSub.status === 'string' ? nestedSub.status : undefined);

  const normalizedStatus = typeof rawStatus === 'string' ? rawStatus.trim().toLowerCase() : '';
  if (!normalizedStatus || !ELIGIBLE_SUBSCRIPTION_STATUSES.has(normalizedStatus)) {
    return false;
  }

  const nowMs = typeof now === 'number' ? now : now.getTime();
  const trialEnd =
    (typeof record.trial_end === 'string' || record.trial_end === null
      ? (record.trial_end as string | null)
      : undefined) ??
    (nestedSub && (typeof nestedSub.trial_end === 'string' || nestedSub.trial_end === null)
      ? (nestedSub.trial_end as string | null)
      : undefined);

  if (normalizedStatus === 'trialing' && !isRequiredFutureTimestamp(trialEnd, nowMs)) {
    return false;
  }

  const currentPeriodEnd =
    (typeof record.current_period_end === 'string' || record.current_period_end === null
      ? (record.current_period_end as string | null)
      : undefined) ??
    (nestedSub && (typeof nestedSub.current_period_end === 'string' || nestedSub.current_period_end === null)
      ? (nestedSub.current_period_end as string | null)
      : undefined);

  if (!isFutureOrUnboundedTimestamp(currentPeriodEnd, nowMs)) {
    return false;
  }

  const paidThroughDate =
    (typeof record.paid_through_date === 'string' || record.paid_through_date === null
      ? (record.paid_through_date as string | null)
      : undefined) ??
    (typeof record.paidThroughDate === 'string' || record.paidThroughDate === null
      ? (record.paidThroughDate as string | null)
      : undefined) ??
    (nestedSub && (typeof nestedSub.paid_through_date === 'string' || nestedSub.paid_through_date === null)
      ? (nestedSub.paid_through_date as string | null)
      : undefined) ??
    (nestedSub && (typeof nestedSub.paidThroughDate === 'string' || nestedSub.paidThroughDate === null)
      ? (nestedSub.paidThroughDate as string | null)
      : undefined);

  if (normalizedStatus === 'manual_active' && !isFutureOrUnboundedTimestamp(paidThroughDate, nowMs)) {
    return false;
  }

  return true;
}

/**
 * Checks whether a `past_due` snapshot explicitly holds a still-valid grace window.
 * Kept separate from `isCommercialSubscriptionSnapshotEligible` so bare `past_due`
 * without explicit grace remains fail-closed.
 */
export function isPastDueWithinGraceWindow(
  snapshot: TenantCommercialSubscriptionSnapshot | null | undefined,
  now: Date | number = Date.now()
): boolean {
  if (!snapshot || snapshot.success !== true) {
    return false;
  }
  const record = snapshot as unknown as Record<string, unknown>;
  const nestedSub =
    record.subscription && typeof record.subscription === 'object'
      ? (record.subscription as Record<string, unknown>)
      : null;

  const rawStatus =
    (typeof record.status === 'string' ? record.status : undefined) ??
    (nestedSub && typeof nestedSub.status === 'string' ? nestedSub.status : undefined);
  const normalizedStatus = typeof rawStatus === 'string' ? rawStatus.trim().toLowerCase() : '';
  if (normalizedStatus !== 'past_due') {
    return false;
  }

  const nowMs = typeof now === 'number' ? now : now.getTime();
  const graceUntil =
    (typeof record.grace_until === 'string' || record.grace_until === null
      ? (record.grace_until as string | null)
      : undefined) ??
    (typeof record.graceUntil === 'string' || record.graceUntil === null
      ? (record.graceUntil as string | null)
      : undefined) ??
    (nestedSub && (typeof nestedSub.grace_until === 'string' || nestedSub.grace_until === null)
      ? (nestedSub.grace_until as string | null)
      : undefined) ??
    (nestedSub && (typeof nestedSub.graceUntil === 'string' || nestedSub.graceUntil === null)
      ? (nestedSub.graceUntil as string | null)
      : undefined);

  return isRequiredFutureTimestamp(graceUntil, nowMs);
}

/**
 * Backward-compatibility helper that accepts standard eligible snapshots as well as
 * `past_due` snapshots within an explicit unexpired grace window.
 */
export function isLegacySubscriptionSnapshotEligible(
  snapshot: TenantCommercialSubscriptionSnapshot | null | undefined,
  now: Date | number = Date.now()
): boolean {
  return (
    isCommercialSubscriptionSnapshotEligible(snapshot, now) ||
    isPastDueWithinGraceWindow(snapshot, now)
  );
}

function isValidTenantSnapshotResponse(
  data: unknown,
  expectedTenantId?: string
): data is TenantCommercialSubscriptionSnapshot {
  if (!data || typeof data !== 'object') {
    return false;
  }
  const snapshot = data as TenantCommercialSubscriptionSnapshot;
  if (snapshot.success !== true) {
    return false;
  }
  if (expectedTenantId) {
    const normalizedExpected = expectedTenantId.trim();
    if (!normalizedExpected || snapshot.tenant_id !== normalizedExpected) {
      return false;
    }
  }
  return true;
}

/**
 * Commercial Catalog Service (H1A Read-Only Foundation + Fail-Closed Guards)
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
   * Safe for anonymous and authenticated callers; fails closed in local mode.
   */
  async getPublicCatalog(): Promise<CommercialPublicPlan[]> {
    if (getDataSourceMode() === 'local') {
      return [];
    }

    const { data, error } = await supabase.rpc('get_public_commercial_plan_catalog');

    if (error || !Array.isArray(data)) {
      if (error) {
        console.error('getPublicCatalog error:', error);
      }
      return [];
    }

    return filterPublicAssignableCatalog(data);
  },

  /**
   * Fetches authenticated tenant's commercial subscription snapshot and effective entitlements.
   * Tenant identity is derived server-side via auth.uid(); optional expectedTenantId enforces match.
   */
  async getMyCommercialSubscriptionSnapshot(
    expectedTenantId?: string
  ): Promise<TenantCommercialSubscriptionSnapshot | null> {
    if (getDataSourceMode() === 'local') {
      return null;
    }

    const { data, error } = await supabase.rpc('get_my_commercial_subscription_snapshot');

    if (error) {
      console.error('getMyCommercialSubscriptionSnapshot error:', error);
      return null;
    }

    if (!isValidTenantSnapshotResponse(data, expectedTenantId)) {
      return null;
    }

    return data;
  },

  /**
   * Fetches authenticated tenant's H1C commercial enforcement snapshot (limits, usage, eligibility).
   * Fails closed on local mode, RPC error, unsuccessful payload, or tenant_id mismatch.
   */
  async getMyCommercialEnforcementSnapshot(
    expectedTenantId?: string
  ): Promise<CommercialEnforcementSnapshot | null> {
    if (getDataSourceMode() === 'local') {
      return null;
    }

    const { data, error } = await supabase.rpc('get_my_commercial_enforcement_snapshot');

    if (error) {
      console.error('getMyCommercialEnforcementSnapshot error:', error);
      return null;
    }

    if (!data || typeof data !== 'object') {
      return null;
    }

    const snapshot = data as CommercialEnforcementSnapshot;
    if (snapshot.success !== true) {
      return null;
    }
    if (expectedTenantId !== undefined) {
      const normalizedExpected = expectedTenantId.trim();
      if (!normalizedExpected || snapshot.tenant_id !== normalizedExpected) {
        return null;
      }
    }

    return snapshot;
  },

  /**
   * Super Admin catalog view returning all plans including private, draft, and legacy plans.
   * Requires super_admin role.
   */
  async superAdminGetCatalog(): Promise<SuperAdminCommercialCatalog | null> {
    if (getDataSourceMode() === 'local') {
      return null;
    }

    const { data, error } = await supabase.rpc('super_admin_get_commercial_catalog');

    if (error || !data || typeof data !== 'object') {
      if (error) {
        console.error('superAdminGetCatalog error:', error);
      }
      return null;
    }

    const catalog = data as SuperAdminCommercialCatalog & { success?: boolean };
    if (catalog.success === false) {
      return null;
    }

    return catalog;
  },

  /**
   * Super Admin tenant commercial snapshot view for any tenant ID.
   * Requires super_admin role; validates target tenant_id and success flag.
   */
  async superAdminGetTenantSnapshot(
    tenantId: string
  ): Promise<TenantCommercialSubscriptionSnapshot | null> {
    const normalizedTenantId = typeof tenantId === 'string' ? tenantId.trim() : '';
    if (!normalizedTenantId || getDataSourceMode() === 'local') {
      return null;
    }

    const { data, error } = await supabase.rpc('super_admin_get_tenant_commercial_snapshot', {
      p_tenant_id: normalizedTenantId
    });

    if (error) {
      console.error('superAdminGetTenantSnapshot error:', error);
      return null;
    }

    if (!isValidTenantSnapshotResponse(data, normalizedTenantId)) {
      return null;
    }

    return data;
  }
};
