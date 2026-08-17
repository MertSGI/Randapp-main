# Architectural & Product Decision Register

## DECISION-001: Visible Product Brand & Domain Strategy
- **Status**: ACCEPTED
- **Decision**: LARI is the canonical visible product brand for the multi-tenant SaaS platform.
- **Domain Strategy**: `randevulari.com` is the primary production domain strategy for tenant public links, manage URLs, and customer booking portals.

## DECISION-002: Master Delivery Train Priority
- **Status**: ACCEPTED
- **Decision**: All platform engineering strictly follows the master delivery sequence:
  `LARI CORE -> PACKAGE / CUSTOMER CUSTOMIZATION -> LARI CLINIC -> LARI HEALTH TOURISM -> FINAL DELIVERY`.
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
