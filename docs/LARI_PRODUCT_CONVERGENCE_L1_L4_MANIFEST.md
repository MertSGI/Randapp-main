# LARI Product Convergence L1-L4 source manifest

Status: SOURCE_SCOPE_COMPLETE

## Non-circular evidence model

This is a source manifest, not a self-attestation by its containing commit. It intentionally does not name the commit that contains it, a future CI run, or a future preview deployment.

The immutable accepted Product source reference is:

- PRODUCT_SHA: b0abd72536d665aaed334c48f69b68e1d8806942
- PRODUCT_BRANCH: staging/ci-lari-product-convergence-l1-l4-20261016
- ACCEPTED_PARENT: 70c6f27adbbeaa906b8fc701f972048fca40f511
- SECURITY_ANCESTOR: e12ada695da17d937b6a32a0a9af01f0e02cbaa1

Acceptance evidence already bound to that immutable Product source:

- GITHUB_CI_RUN_IDS: 38951741143, 38951741181
- PREVIEW_DEPLOYMENT_ID: dpl_GU7az4n1kdrAYBoGLdNhmNAvQCJA
- PREVIEW_TARGET: null
- SUPABASE_PROJECT_REF: rwedeejhjazwjthdjzrt
- MIGRATION_MANIFEST_SHA256: 5482DB2A750507AD1BEFFAE0A458515336144AD48F1CD3EC8D67F766E240EBDD

Any descendant release-gate candidate is identified by GitHub's checked-out SHA and run ID. The convergence workflow emits a versioned release-gate evidence artifact after all required checks pass. The separately versioned evidence contract is documented in LARI_RELEASE_GATE_C1_C4_ACCEPTANCE_EVIDENCE.md. This avoids evidence-only commits and self-referential source fields.

## Preserved source identity

The accepted Product source is a strict descendant of the verified security source and contains the accepted UI-V2, accessibility, PostgreSQL 17 token-security qualification, booking E2E, booking integrity, interval integrity, and Node 20 CI work.

The divergent default lineage 3faeced52939c65bbbc49da2ee6c7f375c0f9e59 was not merged. Draft backup PR 1 at 51b98d7cbd0a46f863b7888f9dd141d0107bd305 remains a separate operational lane.

## Authority decisions

- Supabase booking creation remains bound to create_public_booking.
- Tenant provisioning remains bound to provision_tenant_for_authenticated_owner.
- Supabase plan and entitlement authority remains server-backed and fail closed.
- Manage-token reads and mutations remain RPC-bound.
- Direct public access to appointment_access_tokens is not an authority boundary.
- UI-V2 remains opt-in.

## Migration identity

- Migration: supabase/migrations/20261011155623_appointment_access_tokens_table_access_hardening.sql
- Migration canonical Git LF SHA-256: 260F727516CFF4CF0754295206A10E56505A9CA9E22AEC099BB7F21099BD5E13
- Migration Windows CRLF SHA-256: 5FCE2EEE8D21A29C68D7685A744234EAC779FB7BB4D92B6E59CBCBD109826970
- Both hashes identify the same UTF-8 migration text with only the checkout line-ending representation changed.
- No duplicate migration is permitted.
- Live staging application remains owner-authorized and separate from source qualification.

## Prohibited actions

This manifest authorizes no AOS modification, backup dispatch, default-branch merge, live staging mutation, customer-data access, paid upgrade, production promotion, public-domain reassignment, or canonical acceptance write.
