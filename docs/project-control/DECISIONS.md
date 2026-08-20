# Architectural & Product Decision Register

## DECISION-001: Visible Product Brand & Domain Strategy
- **Status**: ACCEPTED
- **Decision**: LARİ is the canonical visible product brand for the multi-tenant SaaS platform.
- **Domain Strategy**: `randevulari.com` is the primary production domain strategy for tenant public links, manage URLs, and customer booking portals.
- **Legacy Context**: The repository name `MertSGI/Randapp-main` remains the legacy git path identifier.

## DECISION-002: Master Delivery Train Priority
- **Status**: ACCEPTED
- **Decision**: All platform engineering strictly follows the master delivery sequence:
  `LARİ CORE -> PACKAGE / CUSTOMER CUSTOMIZATION -> LARİ CLINIC -> LARİ HEALTH TOURISM -> FINAL DELIVERY`.
- **Constraint**: Clinic and Health Tourism are downstream package extensions on the same core, NOT separate standalone products. UI V2 is a parallel frontend lane, NOT a separate product roadmap phase.

## DECISION-003: Commercial Payment Isolation & Control State
- **Status**: ACCEPTED
- **Decision**: `paymentless_pilot` and `payment-disabled` mode is a temporary operational control state for pilot onboarding and technical acceptance, NOT a final architectural commitment.
- **Provider Activation**: External payment gateway (Iyzico) activation and subscription charges remain explicitly disabled until production cutover.

## DECISION-004: Real Human Customer UAT Non-Blocking Policy
- **Status**: ACCEPTED
- **Decision**: Real external human participant UAT is a deferred, non-blocking field validation step and is NOT on the critical path for technical acceptance of release candidates.

## DECISION-005: External Infrastructure Launch Dependencies
- **Status**: ACCEPTED
- **Decision**: External provider activation (SMS/Email providers) and wildcard DNS configuration (`*.randevulari.com`) are tracked external launch dependencies required before final production deployment.

## DECISION-006: AI Agent Roadmap Authority Boundary
- **Status**: ACCEPTED
- **Decision**: Coding assistants and AI agents orchestrate execution against the approved project control plane. Agents NEVER synthesize or invent new canonical roadmap phases (e.g., P2B).

## DECISION-007: CORE-RC.4 Closure & Main Delivery Train Advancement
- **Status**: ACCEPTED
- **Decision**: Milestone `CORE-RC.4` is closed as proven (`CLOSED_PROVEN` at level `E2_EXECUTABLE_EXACT_SHA_CI`, exact product SHA `e1bb23dbbc2f1f079ec6bbc93e3cb9b83db1839a`, GitHub Actions Run `32134598853`). Cross-layer `pending_onboarding` subscription status contract alignment is verified and frozen. The main product delivery train is advanced to `Package/Customer Customization`.

## DECISION-008: Package Customization Slice 2 Commercial Source-of-Truth Alignment Closure
- **Status**: ACCEPTED
- **Decision**: Milestone `Package Customization Commercial Source-of-Truth Alignment` (Slice 2) is closed as proven (`CLOSED_PROVEN` at level `E2_EXECUTABLE_EXACT_SHA_CI`, exact product SHA `65a53427f52c21e60aa8f92e02a17d693a201601`, evidence branch `ci/package-commercial-source-of-truth-exact-sha-r1-20260820` at `a337d85276728beffbec4a129aefc703328624d2`, GitHub Actions Run `32363490123`). The two-commit evidence lineage is accepted (intermediate `7c14a998` superseded by final exact-SHA product binding `a337d852`). Package / Customer Customization overall status remains `IN_PROGRESS`.
