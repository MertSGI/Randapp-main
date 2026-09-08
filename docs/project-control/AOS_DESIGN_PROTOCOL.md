# LARİ ↔ AOS Autonomous Design Coordination Protocol V1
**Protocol ID:** `LARI-AOS-AUTONOMOUS-DESIGN-PROTOCOL-20260908-01`  
**Release effect:** NONE  
**Production:** NO_GO

## Goal
Allow AOS to operate continuously as LARİ's read-only/local visual design intelligence system without requiring the user to copy handoffs between AOS and the LARİ Controller.

## Standing AOS authority
AOS may autonomously:
- fetch/read LARİ refs;
- observe the current default, subject, UI candidate and controller-inbox state;
- create disposable local worktrees;
- run local Vite/preview;
- use Playwright;
- capture canonical responsive screenshots;
- hash screenshots;
- inspect overflow/CTA/accessibility/readability;
- use its real visual/multimodal providers;
- generate local design candidates, visual references, assets and MP4s when a real provider is available;
- compare iterations;
- emit design evidence;
- continue to the next roadmap visual epic without waiting for release approval.

AOS must bind every evidence package to the exact observed commit SHA.

## Moving-ref rule
Read-only AOS work is not invalid merely because a release ref advances after a valid preflight. AOS records the exact SHA it evaluated. It must never pretend evidence from one SHA applies to another SHA.

## Forbidden without child authority
- no subject/default mutation;
- no production mutation;
- no Supabase/Vercel control-plane mutation;
- no deploy;
- no hosted Final R9 execution;
- no product-source repair;
- no UI branch push;
- no generated asset commit to LARİ;
- no release-gate change.

## Visual target order
1. Brand/marketing/pricing/features/contact.
2. Public mini-site + booking.
3. Customer self-service.
4. Owner onboarding + admin workspace.
5. CRM/growth/reporting.
6. Clinic.
7. Health Tourism.
8. Super Admin/commercial/ops.
9. Future POS/inventory.
10. Future marketplace/mobile.

## Canonical viewports
- 390x844
- 430x932
- 768x1024
- 1024x768
- 1440x900
- 1920x1080

## Required AOS design-cycle result
- authority/protocol ID;
- exact target branch/SHA;
- exact observed release refs;
- route/journey inspected;
- six-view screenshot manifest + SHA256;
- overflow results;
- CTA integrity;
- accessibility/readability findings;
- visual-provider model and real response status;
- grounded visual findings;
- proposed design direction;
- token/component changes proposed;
- generated local asset/mockup manifest if real generation succeeded;
- `PROVIDER_MISSING` if generation was unavailable;
- `DESIGN_RESULT=PASS|FAIL|INCOMPLETE`;
- `RELEASE_GATE_EFFECT=NONE`;
- zero mutation counters.

## Communication
Preferred mailbox: append-only records under the LARİ Controller coordination surface. AOS messages are `AOS_DOWNSTREAM_EVIDENCE_CLAIM_ONLY`; Controller responses never become implied acceptance.

Current ChatGPT GitHub connection is read-only at the integration layer. Until write scope is available, the Controller can automatically monitor inbound AOS handoffs but cannot publish an outbound GitHub response. This is an infrastructure limitation, not permission for the user to become a permanent message carrier.

## Stop conditions
AOS stops only the affected cycle on:
- target cannot be reproduced;
- provider response invalid/unavailable;
- secret leakage risk;
- browser action would cause state mutation;
- evidence integrity failure.

It may continue other independent read-only design targets.
