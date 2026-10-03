# EV-096 — Phase 7 Node 2 R1: Discovery Marketplace Server Authority Disposable PostgreSQL Acceptance

## Metadata

| Field | Value |
|---|---|
| **Evidence ID** | EV-096 |
| **Phase** | PHASE_7 |
| **Lane** | PHASE_7_NODE2_DISCOVERY_MARKETPLACE_R1_ACCEPTANCE |
| **Status** | PROVEN |
| **Acceptance Status** | CONTROLLER_ACCEPTED |
| **Authority** | LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01 |
| **Standing Authority** | LARI-AOS-PROGRAM-V2-BOOTSTRAP-20260908-01 |
| **Canonical Decision** | DECISION-022 |
| **Contract ID** | LARI-P7-N2-DISCOVERY-MARKETPLACE-R1 |
| **Timestamp** | 2026-10-03T07:15:00.000Z |

## CI Execution

| Field | Value |
|---|---|
| **GitHub Actions Run ID** | [37103225108](https://github.com/MertSGI/Randapp-main/actions/runs/37103225108) |
| **GitHub Actions Job ID** | 111146686628 |
| **Branch** | `feature/phase7-node2-discovery-marketplace-r1-20261003` |
| **SHA** | `814e3ca0c09c3a484e20869f1a47a3545259f6db` |
| **Product Branch** | `feature/phase7-node2-discovery-marketplace-r1-20261003` |
| **Upstream Execution Base SHA** | `2b5e08d2b8dc674dd1dd21ea93f1b967ec468201` |
| **Workflow Run Conclusion** | SUCCESS |

## Proven Scope

- **Full ordered SQL migration chain**: PASS (all 94 migrations applied sequentially with 0 errors)
- **24 prior domain contract suites**: PASS (24/24 suites passed cleanly)
- **Phase 7 Node 1 static contract verification**: PASS (37/37 assertions passed)
- **Phase 7 Node 2 static contract verification**: PASS (16/16 assertions passed)
- **Phase 7 Node 1 live behavioral matrix**: PASS (79/79 live assertions passed)
- **Phase 7 Node 2 live behavioral matrix**: PASS (60/60 live assertions passed)
- **Application build**: PASS (Vite production build compiled with 0 errors)
- **Typecheck & lint**: PASS (`tsc --noEmit` and linter passed cleanly)
- **Git diff check**: PASS (clean whitespace)

## Schema & Authority Additions

### Architecture
- **Server-Authoritative Public Projection**: Marketplace visibility operates strictly as a read-only projection across existing canonical tenant, profile, branch, service, media/portfolio, and verified review domains.
- **Zero Duplicate Truth**: Forbids and creates NO duplicate `discovery_marketplace_listings` table or duplicate business truth.
- **Canonical Eligibility Reuse**: Both discovery RPCs invoke `public.evaluate_public_booking_eligibility_internal(t.id, t.slug)` and fail closed when canonical booking eligibility is not satisfied.

### Server-Authoritative RPCs
- `public.get_discovery_marketplace_listings`:
  - Public-safe discovery query with bounded inputs (`p_search_query`, `p_city`, `p_district`, `p_category`, `p_min_rating`, `p_limit`, `p_offset`).
  - Strict review filtering: only `is_published = true` reviews contribute to average rating and review count aggregates.
  - Deterministic top-level ranking (`average_rating DESC`, `review_count DESC`, tie-break `t.name ASC`, `t.id ASC`).
  - Zero-result contract: returns `total_count = 0` and `listings = []` without synthetic null objects.
- `public.get_discovery_marketplace_detail`:
  - Public-safe detail lookup by slug with bounded input (`p_slug` max 100 chars).
  - Reuses canonical eligibility: returns `{ success: false, reason_code: 'NOT_ELIGIBLE' }` for draft, suspended, unbookable, or subscription-ineligible businesses.
  - Bounded nested projections: `featured_services` ordered deterministically before LIMIT 5.
  - Strict review exclusion: unpublished reviews excluded from summary and recent reviews list.
  - Zero data leakage: private financial fields, customer notes, customer emails, staff phone/notes, and subscription internals omitted from public response.

## Proven Invariants

- **Condition A (Eligible 1 Visible)**: PASS
- **Condition B (Eligible 2 Visible)**: PASS
- **Condition C (Draft Site Hidden)**: PASS
- **Condition D (Suspended Tenant Hidden)**: PASS
- **Condition E (Profile Disabled Hidden)**: PASS
- **Condition F (Commercial/Subscription Ineligible Hidden)**: PASS
- **Condition G (Canonical Ineligible Slug Returns NOT_ELIGIBLE)**: PASS
- **Zero-Result Contract (Empty Listings Array)**: PASS
- **Public Input Bounds Enforced**: PASS
- **Deterministic Ranking & Tie-breaks**: PASS
- **No Duplicate Listing Truth Created**: PASS
- **Production Status**: `NO_GO`
