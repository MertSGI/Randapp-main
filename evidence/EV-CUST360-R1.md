# EV-CUST360-R1: Customer 360 & Segmentation Foundation R1 Corrections

- **Authority**: `LARI-PROGRAM-V2-PHASE3-FINAL-CORRECTIONS-AND-PHASE4-INTEGRATION-20260911-01`
- **Program**: `LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01`
- **Branch**: `aos/phase3-customer360-segmentation-foundation-r1`
- **Commit**: `391325b68c3640aca253c521479a819953222c5a`
- **Base**: `e8c7b9171ede7df98f77907b9365a9a632c1f292`

## Key Corrections & Verifications
1. **Canonical Roles Enforcement**:
   - Updated `is_tenant_staff` to use canonical application roles: `super_admin`, `tenant_owner`, `staff`.
   - Eliminated non-canonical `admin` and `owner` role strings.
2. **Search Path Hardening**:
   - Replaced permissive/dynamic `SET search_path = public, auth` with hardened `SET search_path = pg_catalog, public` on all functions.
3. **Tenant Composite Integrity**:
   - Added `uq_customers_id_tenant` composite unique constraint on `customers(id, tenant_id)`.
   - Added `uq_customer_segments_id_tenant` on `customer_segments(id, tenant_id)`.
   - Added composite foreign keys:
     - `customer_segment_members(segment_id, tenant_id) REFERENCES customer_segments(id, tenant_id)`
     - `customer_segment_members(customer_id, tenant_id) REFERENCES customers(id, tenant_id)`
4. **Dynamic Rule Classification**:
   - Added `evaluate_dynamic_customer_segments` explicitly classified as `DYNAMIC_RULE_EVALUATION_NOT_IMPLEMENTED`.
5. **Branch Visibility**:
   - Implemented `is_staff_assigned_to_branch` helper for branch-scoped permissions.
