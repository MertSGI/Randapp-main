# EV-083: Phase 5 Security Reopen, Node 2 Branch Scope Hardening & Node 3 Authority Hardening

- **Authority Directives**:
  - Independent Controller Ruling: `NODE3_GATE=REOPEN_SECURITY_TENANT_AUTHORITY`, `NODE2_GATE=REVIEW_BRANCH_SCOPE_SEMANTICS`
  - Program ID: `LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01`
  - Standing Autonomy: `DECISION-020`
- **Reopened Candidates**:
  - Node 3: `920fdd05cf3073d675b34f878a2c5df3211bf9b7` (CRITICAL_CROSS_TENANT_MUTATION_BOUNDARY_DEFECT)
  - Node 2: `278737303be10da0ce9d89efe54d948a7fb46671` (REVIEW_BRANCH_SCOPE_SEMANTICS)
- **Production Status**: `NO_GO`

---

## 1. Controller Reopen Audit & Defect Root Causes Bound to Node 3 (920fdd0)

1. **Missing Caller Tenant / Capability Verification in Quote & Itinerary RPCs**:
   - `public.ht_create_or_update_journey_quote` and `public.ht_add_journey_itinerary_event` validated only non-null `auth.uid()` before mutating target journeys by ID without asserting caller tenant or HT capability.
2. **Missing Entity Tenant Integrity**:
   - Optional references (`lead_id`, `customer_id`, `coordinator_staff_id`, `appointment_id`, `assigned_coordinator_staff_id`) were not validated to belong to the caller/journey tenant before insertion.
3. **Generic Active Staff Identity in Journey Creation**:
   - `public.ht_create_treatment_journey` derived generic active staff without requiring canonical HT staff profile capabilities (`can_manage_ht_leads`).
4. **Race Conditions in Quote Versioning**:
   - `MAX(version) + 1` was unprotected against concurrent mutation.

---

## 2. Superseding Hardened Candidates

### A. Node 2 (R1): Clinic Practitioner Permissions & Branch-Scoped Workspace Hardening
- **Candidate Branch**: `aos/phase5-clinic-practitioners-workspace-r1`
- **Candidate Commit SHA**: `0e6d4a2597517ec81e63e63312e21a7318e21318`
- **Parent / Base**: `278737303be10da0ce9d89efe54d948a7fb46671` (Node 2 R0)
- **Key Corrections**:
  - Scoped `permitted_branch_ids` in `public.clinic_get_my_context()` strictly via canonical `staff_branches` membership:
    ```sql
    SELECT jsonb_agg(b.id) INTO v_branches
    FROM public.branches b
    JOIN public.staff_branches sb ON sb.branch_id = b.id AND sb.tenant_id = v_staff.tenant_id
    WHERE b.tenant_id = v_staff.tenant_id
      AND b.is_active IS NOT FALSE
      AND sb.staff_id = v_staff.id;
    ```
  - Eliminated tenant-wide branch overexposure.
- **Contract Results**: 10/10 contracts PASSED | `tsc --noEmit` clean.
- **Gate Status**: `AOS_STANDING_AUTHORITY_ACCEPTED`

### B. Node 3 (R1): Health Tourism Journeys, Quotes & Itinerary Security Hardening
- **Candidate Branch**: `aos/phase5-ht-journey-domain-r1`
- **Candidate Commit SHA**: `44c9be621c97a8cadecc23081f1b09d6a1c04e97`
- **Parent / Base**: `920fdd05cf3073d675b34f878a2c5df3211bf9b7` (Node 3 R0)
- **Key Corrections**:
  - Implemented server-authoritative helper `ht_assert_caller_ht_authority` checking caller active staff, tenant, and canonical `ht_staff_profiles` (`can_manage_ht_leads`), or active `tenant_owner`.
  - Added row-level locking (`SELECT ... FOR UPDATE`) on target journey in `ht_create_or_update_journey_quote` and `ht_add_journey_itinerary_event` to serialize concurrent operations and version incrementing.
  - Enforced cross-tenant entity validation fail-closed for `lead_id`, `customer_id`, `coordinator_staff_id`, `appointment_id`, and `assigned_coordinator_staff_id`.
  - Added currency ISO regex check (`^[A-Z]{3}$`), amount bounds, and authoritative item total sum validation.
  - Added transactional advisory lock on tenant ID for `max_active_journeys` quota evaluation.
- **Contract Results**: 14/14 contracts PASSED | `tsc --noEmit` clean.
- **Gate Status**: `AOS_STANDING_AUTHORITY_ACCEPTED`

---

## 3. Real PostgreSQL Disposable Runtime Security Proof

- **Disposable Acceptance Harness Branch**: `ci/phase5-disposable-postgres-acceptance`
- **Harness Head SHA**: `d37ab9f2dd7c37efff71d4fcd9219354fd325888`
- **Live Security Matrix Suite**: `supabase/tests/program-v2/p5-live/test-phase5-postgres-security-matrix.mjs`
- **Target Container**: `supabase/postgres:15.1.0.147`
- **Adversarial Multi-Tenant Matrix Results**:
  1. `clinic_get_my_context` returns ONLY mapped branches from `staff_branches` (excludes non-permitted active branches): PASS
  2. Authorized same-tenant journey creation: PASS
  3. Ordinary authenticated staff without HT profile denied journey creation (`FORBIDDEN`): PASS
  4. Tenant A coordinator attempting to bind Tenant B lead denied fail-closed: PASS
  5. Tenant A coordinator attempting to bind Tenant B customer denied fail-closed: PASS
  6. Tenant A coordinator attempting to assign Tenant B coordinator staff denied fail-closed: PASS
  7. Tenant B coordinator mutating Tenant A quote by known journey UUID denied (`FORBIDDEN`): PASS
  8. Tenant B coordinator adding itinerary event to Tenant A journey denied (`FORBIDDEN`): PASS
  9. Tenant A coordinator linking Tenant B appointment in itinerary denied: PASS
  10. Tenant A coordinator assigning Tenant B coordinator in itinerary denied: PASS
  11. Valid same-tenant quote creation (version 1): PASS
  12. Valid same-tenant itinerary event creation: PASS
  13. Concurrent quote mutations under `FOR UPDATE` serialize monotonically (`v1 != v2`, strictly versions 2 and 3): PASS
- **Test Results**: 13/13 Adversarial Security Assertions PASSED (Zero Failures).
- **Runtime Proof Level**: `REAL_POSTGRES_RUNTIME_SECURITY_PROOF`
