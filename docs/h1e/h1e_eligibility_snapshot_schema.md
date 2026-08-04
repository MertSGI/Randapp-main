# H1E Eligibility Snapshot JSON Schema & RPC Contract

This document defines the exact contract specifications for the read-only Super Admin eligibility snapshot RPC `super_admin_get_tenant_pilot_eligibility_snapshot(p_tenant_id uuid)` introduced in **Migration 47 (Stage H1E-A)**.

---

## 1. RPC Function Signature (SQL)

```sql
CREATE OR REPLACE FUNCTION public.super_admin_get_tenant_pilot_eligibility_snapshot(
    p_tenant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
...
$$;
```

- **Permissions**: `REVOKE ALL ON FUNCTION public.super_admin_get_tenant_pilot_eligibility_snapshot(UUID) FROM PUBLIC;`
- **Grants**: `GRANT EXECUTE ON FUNCTION public.super_admin_get_tenant_pilot_eligibility_snapshot(UUID) TO authenticated;`
- **Internal Authorization Guard**:
  ```sql
  v_actor_user_id := auth.uid();
  IF v_actor_user_id IS NULL OR NOT public.is_super_admin(v_actor_user_id) THEN
      RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized');
  END IF;
  ```

---

## 2. JSON Schema Definition

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "TenantPilotEligibilitySnapshotResponse",
  "type": "object",
  "required": [
    "success",
    "timestamp",
    "tenant_id",
    "eligible",
    "authorized",
    "bookable",
    "production_authorized",
    "primary_reason_code",
    "blocking_reason_codes",
    "readiness_facts",
    "global_release_control",
    "pilot_authorization"
  ],
  "properties": {
    "success": { "type": "boolean" },
    "timestamp": { "type": "string", "format": "date-time" },
    "tenant_id": { "type": "string", "format": "uuid" },
    "eligible": { "type": "boolean" },
    "authorized": { "type": "boolean" },
    "bookable": { "type": "boolean" },
    "production_authorized": { "type": "boolean" },
    "primary_reason_code": { 
      "type": "string",
      "enum": [
        "RELEASE_CONTROL_UNAVAILABLE",
        "GLOBAL_RELEASE_PHASE_BLOCKED",
        "TENANT_NOT_FOUND",
        "TENANT_INACTIVE",
        "CORE_BOOKING_RESTRICTED",
        "PUBLIC_SITE_STATUS_BLOCKED",
        "PILOT_AUTHORIZATION_REQUIRED",
        "PILOT_AUTHORIZATION_REVOKED",
        "SUBSCRIPTION_BLOCKED",
        "REQUIRED_ENTITLEMENT_BLOCKED",
        "OPERATIONAL_READINESS_FAILED",
        "BOOKING_ALLOWED"
      ]
    },
    "blocking_reason_codes": {
      "type": "array",
      "items": { "type": "string" }
    },
    "readiness_facts": {
      "type": "object",
      "required": [
        "tenant_exists",
        "tenant_active",
        "primary_branch_count",
        "active_service_count",
        "active_staff_count",
        "relationships_valid",
        "slug_resolved",
        "public_site_status",
        "subscription_status",
        "billing_mode",
        "active_restrictions_count"
      ],
      "properties": {
        "tenant_exists": { "type": "boolean" },
        "tenant_active": { "type": "boolean" },
        "primary_branch_count": { "type": "integer" },
        "active_service_count": { "type": "integer" },
        "active_staff_count": { "type": "integer" },
        "relationships_valid": { "type": "boolean" },
        "slug_resolved": { "type": ["string", "null"] },
        "public_site_status": { 
          "type": "string",
          "enum": ["draft", "pending_review", "published", "paused", "suspended", "unknown"]
        },
        "subscription_status": { "type": "string" },
        "billing_mode": { "type": "string" },
        "active_restrictions_count": { "type": "integer" }
      }
    },
    "global_release_control": {
      "type": "object",
      "required": [
        "release_phase",
        "is_production_authorized",
        "is_pilot_enforcement_required",
        "is_payment_collection_enabled",
        "is_checkout_enabled",
        "is_iyzico_enabled"
      ],
      "properties": {
        "release_phase": { "type": "string", "enum": ["pre_pilot", "paymentless_pilot", "full_production"] },
        "is_production_authorized": { "type": "boolean" },
        "is_pilot_enforcement_required": { "type": "boolean" },
        "is_payment_collection_enabled": { "type": "boolean" },
        "is_checkout_enabled": { "type": "boolean" },
        "is_iyzico_enabled": { "type": "boolean" }
      }
    },
    "pilot_authorization": {
      "type": ["object", "null"],
      "properties": {
        "authorization_id": { "type": "string", "format": "uuid" },
        "is_approved": { "type": "boolean" },
        "approval_reason": { "type": "string" },
        "approved_by": { "type": "string", "format": "uuid" },
        "approved_at": { "type": "string", "format": "date-time" },
        "revocation_reason": { "type": ["string", "null"] },
        "revoked_by": { "type": ["string", "null"], "format": "uuid" },
        "revoked_at": { "type": ["string", "null"], "format": "date-time" },
        "version": { "type": "integer" }
      }
    }
  }
}
```

---

## 3. TypeScript Type Interfaces

```typescript
export type H1EPrimaryReasonCode =
  | 'RELEASE_CONTROL_UNAVAILABLE'
  | 'GLOBAL_RELEASE_PHASE_BLOCKED'
  | 'TENANT_NOT_FOUND'
  | 'TENANT_INACTIVE'
  | 'CORE_BOOKING_RESTRICTED'
  | 'PUBLIC_SITE_STATUS_BLOCKED'
  | 'PILOT_AUTHORIZATION_REQUIRED'
  | 'PILOT_AUTHORIZATION_REVOKED'
  | 'SUBSCRIPTION_BLOCKED'
  | 'REQUIRED_ENTITLEMENT_BLOCKED'
  | 'OPERATIONAL_READINESS_FAILED'
  | 'BOOKING_ALLOWED';

export interface ReadinessFacts {
  tenant_exists: boolean;
  tenant_active: boolean;
  primary_branch_count: number;
  active_service_count: number;
  active_staff_count: number;
  relationships_valid: boolean;
  slug_resolved: string | null;
  public_site_status: 'draft' | 'pending_review' | 'published' | 'paused' | 'suspended' | 'unknown';
  subscription_status: string;
  billing_mode: string;
  active_restrictions_count: number;
}

export interface GlobalReleaseControlFacts {
  release_phase: 'pre_pilot' | 'paymentless_pilot' | 'full_production';
  is_production_authorized: boolean;
  is_pilot_enforcement_required: boolean;
  is_payment_collection_enabled: boolean;
  is_checkout_enabled: boolean;
  is_iyzico_enabled: boolean;
}

export interface PilotAuthorizationFacts {
  authorization_id: string;
  is_approved: boolean;
  approval_reason: string;
  approved_by: string;
  approved_at: string;
  revocation_reason: string | null;
  revoked_by: string | null;
  revoked_at: string | null;
  version: number;
}

export interface TenantPilotEligibilitySnapshotResponse {
  success: boolean;
  reason_code?: 'unauthorized';
  timestamp: string;
  tenant_id: string;
  eligible: boolean;
  authorized: boolean;
  bookable: boolean;
  production_authorized: boolean;
  primary_reason_code: H1EPrimaryReasonCode;
  blocking_reason_codes: H1EPrimaryReasonCode[];
  readiness_facts: ReadinessFacts;
  global_release_control: GlobalReleaseControlFacts;
  pilot_authorization: PilotAuthorizationFacts | null;
}
```

---

## 4. Semantic Distinction Matrix

| Semantic Flag | Conditions Required (`true`) | Meaning |
| :--- | :--- | :--- |
| **`eligible`** | `tenant_exists` AND `tenant_active` AND `primary_branch_count > 0` AND `active_service_count > 0` AND `active_staff_count > 0` AND `subscription_status IN ('active', 'comped', 'manual_active', 'trialing')` | Operational & commercial prerequisites pass. |
| **`authorized`** | `pilot_authorization != null` AND `pilot_authorization.is_approved = true` AND `pilot_authorization.revoked_at IS NULL` | Super Admin operator grant exists in database. |
| **`bookable`** | `eligible = true` AND `authorized = true` AND `active_restrictions_count = 0` AND `public_site_status = 'published'` AND `global_release_phase IN ('paymentless_pilot', 'full_production')` | Public customers can execute bookings. |
| **`production_authorized`** | `global_release_control.is_production_authorized = true` | General public launch authorized by platform operator. |
