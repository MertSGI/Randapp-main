# LARİ Program V2 — Phase 1.0 Security Dependency Mapping
**Audit ID:** `LARI-PROGRAM-V2-P1-0-SECURITY-DEPENDENCY-MAPPING-20260908-01`  
**Mode:** READ-ONLY  
**Production:** NO_GO

## Frozen observations
- Accepted subject: `09bb1f8d8ce070c33d09099a6d0ae20c93787d11`
- Staging/default: `3faeced52939c65bbbc49da2ee6c7f375c0f9e59`
- Controller Inbox: `59575f9ef5e6f5d87280e9fec1d2b27867e641d5`
- UI V2: `27956c23704117a6ef478d95eb4c5b7060d39e3c`
- Active acceptance Supabase: `miuecvkkmyvaciticwtm`
- Canonical `lari-staging` Supabase: `rwedeejhjazwjthdjzrt` observed INACTIVE.

## Finding S-01 — HT rate-limit table is directly exposed
`public.ht_rate_limit_buckets`:
- RLS: OFF
- no policies
- `anon`: full table privileges
- `authenticated`: full table privileges
- `service_role`: full table privileges
- `postgres`: full table privileges

Only two observed functions reference this table:
- `ht_check_rate_limit(...)`
- `ht_cleanup_expired_ai_data()`

Both are SECURITY DEFINER with fixed `search_path=pg_catalog, public` and neither `anon` nor `authenticated` currently has EXECUTE.

### Safe correction direction
Prefer a new migration that:
1. revokes all direct table privileges from `PUBLIC`, `anon`, `authenticated`;
2. enables RLS on the table;
3. keeps direct browser policy surface empty unless a proven runtime dependency requires one;
4. preserves internal SECURITY DEFINER access;
5. adds regression tests proving direct REST/table access is denied while the internal rate-limit behavior still works.

Do **not** add permissive RLS policies just to satisfy the advisor.

## Finding S-02 — Identity helper metadata disclosure
Current live functions:
- `get_user_role(user_id uuid)`
- `get_user_tenant_id(user_id uuid)`

Both:
- SECURITY DEFINER
- no fixed `search_path`
- executable by `anon`
- executable by `authenticated`
- accept arbitrary user UUIDs
- contain no caller-ownership guard.

This is a real metadata disclosure surface.

### Dependency
At least the `users_profile` policy `Tenant Admin - SELECT employee/customer profiles` calls:
- `get_user_role(auth.uid())`
- `get_user_tenant_id(auth.uid())`

Therefore deleting the helpers or removing authenticated EXECUTE blindly can break RLS.

### Safe correction direction
Use a new migration to:
1. set fixed `search_path=pg_catalog, public`;
2. revoke EXECUTE from `PUBLIC` and `anon`;
3. preserve authenticated EXECUTE only if required for RLS evaluation;
4. preferably redesign helpers to caller-bound zero-argument helpers in a later compatibility-safe migration;
5. add regression tests:
   - anonymous arbitrary UUID lookup denied;
   - authenticated tenant-owner RLS policy still works;
   - cross-tenant profile access still denied;
   - super-admin policies remain valid.

## Finding S-03 — `is_super_admin(user_id)` also deserves hardening
`is_super_admin(user_id uuid)` is SECURITY DEFINER, has no fixed `search_path`, and is executable by anon/authenticated.
Unlike the two metadata helpers, it is referenced by many RLS policies, so its authenticated execution is structurally important.

Safe first correction:
- fixed search_path;
- revoke PUBLIC/anon EXECUTE;
- preserve authenticated behavior;
- regression-test all super-admin RLS paths.

## Finding S-04 — trigger helpers
`update_updated_at_column()` and `update_tenant_business_profiles_updated_at_column()` have mutable search_path and broad execute grants. They are not SECURITY DEFINER, so severity is lower than S-01/S-02, but fixed search_path is appropriate in the same hardening program after trigger-dependency verification.

## Finding S-05 — broader SECURITY DEFINER surface
Supabase advisor reports many callable SECURITY DEFINER functions. Sampled critical functions (commercial, Clinic, HT) generally contain real `auth.uid()` / role / tenant capability checks, so the raw warning count must not be treated as an exploit count.

However several `super_admin_get_*` functions were observed with anon EXECUTE and should be separately audited for internal authorization guards before GA.

## Finding S-06 — branch lineage must converge before broad Program V2 mutation
Subject and default diverge at merge-base:
`134c8716c2511c909cd400aee0496ebd70f63bf6`

Observed:
- subject is 301 commits ahead;
- subject is 34 commits behind default.

Program V2 must create one independently accepted canonical development base after semantic reconciliation. No broad security/product correction should silently choose one branch and lose changes from the other.

## Recommended sequence
1. Phase 0.1 — canonical lineage semantic reconciliation.
2. Phase 0.2 — establish one Program V2 canonical development base.
3. Phase 1.1 — source-only security hardening migration + regression tests on that base.
4. Phase 1.2 — disposable DB replay and advisor/e2e evidence.
5. Phase 1.3 — separately authorized canonical Supabase staging restoration/alignment.
6. Real paymentless pilot only after those gates.
