# LARİ — AUTHORITATIVE AUTONOMOUS-CONTINUATION HANDOFF
**Prepared:** 24 October 2026 · Europe/Istanbul. **Purpose:** exact-context transfer to a new ChatGPT Controller and a future autonomous executor. **Authority:** informational handoff and SOURCE-ONLY work preparation; it grants NO merge, SQL, payment, provider, production, private-key, recovery or spending permission.

## 0. The owner's decisive instruction (do not override)
**STOP cycling on PostgreSQL restore/backup while developing the product.** Keep the unresolved independent real restore as visibly RED **Production release blocker GitHub #10**. Product engineering, source-only stages, mocks, hosted QA, preview and Draft PRs continue. Return to #10 before any authorized Production go-live, not after each safe product work package.

**Controller writes architectural decisions, exact algorithms and acceptance; AG/Codex implements, runs tests and reports evidence.** Avoid generic 'AG investigate and fix' assignments. The agent should complete substantial multi-WP source tasks with durable checkpoints and skip irrelevant blocked external steps. Owner wants a real full SaaS, not endless QA or replacement mock demos.

## 1. What is LARİ?
LARİ / RandevuLari (`randevulari.com`) is a multi-tenant SaaS for beauty salons, barbers, nail/hair studios and eventually other service industries: salon registration, roles/tenants/branches, staff/service catalogue, schedules, appointments and customer self-service; Super Admin, pricing/subscriptions, paymentless/manual pilot, optional iyzico, outbox/SMS/WhatsApp/email, public booking/QR/domain, CRM/no-show, legal KVKK controls, reporting, health-tourism/AI and future V2 experience. Salon operators subscribe to software; do not transfer admin privileges or repo ownership to salon owners.
Existing older V1/UI-V2/product convergence lineage is NOT automatically integrated into default staging. Read `LARI_V1_V2_MASTER_YAYIN_PLANI_2026-10-21.md` from the owner-only portable archive before claiming comprehensive product readiness. Older handoff documents are historical, not the current branch truth.

## 2. VERIFIED GitHub truth at handoff
Repository: https://github.com/MertSGI/Randapp-main (public repo; never push owner secrets or private handoff attachments).

Default staging: `staging/supabase-staging-consistency` at `2c6a99b0b92ecea4f324c7195b3222f92688f294` (no code changes from PR9/12/14/16 merged yet).

Nested OPEN/DRAFT PR chain, each HEAD CI successful:
| PR | Topic / exact HEAD | Base | Hosted proof |
|---|---|---|---|
| [#9](https://github.com/MertSGI/Randapp-main/pull/9) | truthful notification/payment UI and hard migration HOLD; `59985110ab8bad49d0af036ddda90e6e5ea0defc` | staging | [40090227771](https://github.com/MertSGI/Randapp-main/actions/runs/40090227771) |
| [#12](https://github.com/MertSGI/Randapp-main/pull/12) | Phase A source booking + Phase B staging source-readiness; `2930c9d018ff858000fbe4273ca9d549d81d1e87` | PR9 branch | [40094343844](https://github.com/MertSGI/Randapp-main/actions/runs/40094343844) |
| [#14](https://github.com/MertSGI/Randapp-main/pull/14) | Phase C offline payment + Phase D routing; `8c5e0e464dbbe570b978009052d6088075b4e6f5` | PR12 branch | [40099250128](https://github.com/MertSGI/Randapp-main/actions/runs/40099250128) |
| [#16](https://github.com/MertSGI/Randapp-main/pull/16) | Phase E offline provider simulator + Phase F synthetic first salon; `752a478c452650030963b315d19b4ee2c9659e3a` | PR14 branch | [40116627084](https://github.com/MertSGI/Randapp-main/actions/runs/40116627084) and [40116591795](https://github.com/MertSGI/Randapp-main/actions/runs/40116591795) |

PR16 exact-HEAD native CI: PG17 role/pristine synthetic, backup/quarantine static, V1 truthfulness, P0 hold, Phase A/B/C/D/E/F and Vite build all SUCCESS. PR16 Phase E run log confirms 18 deterministic scenarios / 65 passed checks; Phase F 15 synthetic steps / 53 checks passed. **These are SOURCE_OFFLINE proofs only.** Actual end-user salon, real payment, real provider SMS, public wildcard DNS and cross-device browser E2E are NOT proven.

Merged earlier: PR7 standard staging merge SHA `70ff98139421f18b981ff1c29c5ee6b21d27ffdb`; PR8 standard staging merge `2c6a99b0b92ecea4f324c7195b3222f92688f294` (approved source-only quarantine policy). Original backup workflow blob `d0c48d60be9144606551c04e2b89a4dde031f8b6`; quarantine workflow blob `700b9226e1598062e6fd24323ee5d19eb941444a`. Both manual-only. **No new dispatch is authorized.**

## 3. Phase E/F newest acceptance: reviewed boundaries
- New code: `types/communicationContracts.ts`, `services/communicationDeliveryService.ts`, `services/offlineCommunicationProviderSimulator.ts`, `services/syntheticSalonFixtureService.ts` + tenant-safe outbox patches, SuperAdmin demo gate, source tests and CI.
- Local outbox now scopes by tenant; unsupported remote channels no longer silently become SMS; skipped events no longer silently become dispatchable queued events. Browser delivery status remains distinguished from actual provider receipt; no external provider sent.
- CI Phase E success does NOT attest to real production-grade callback trust: **`options.verifiedProviderReceipt` is a browser-callable boolean** and cannot be an authority boundary; a future server-only receipt gate must be implemented/validated before real provider activation. Local outbox tenant mismatch errors and remote request logs may expose identifiers. Supabase outbox still has schema fallback mapping `skipped` to `failed`+metadata; source schema/worker contract must be validated before live dispatch.
- Phase F synthetic fixture is one fake salon / one branch / two staff / six services / five appointments (cancel/reschedule) / QR booking string, no real customer data. SuperAdmin approve-go-live must never be invoked outside controlled demo when real tenants exist.
- This handoff does NOT mark PR16 merge-authorized or real-salon-ready.

## 4. Durable operating gates
- **[Issue #10](https://github.com/MertSGI/Randapp-main/issues/10): OPEN mandatory production-release recovery.** Read details, do not reopen investigation during source-only roadmap.
- **[Issue #11](https://github.com/MertSGI/Randapp-main/issues/11):** Phase A/B source progress ledger.
- **[Issue #13](https://github.com/MertSGI/Randapp-main/issues/13):** Phase C/D source and payment-activation blockers.
- **[Issue #15](https://github.com/MertSGI/Randapp-main/issues/15):** Phase E/F source and simulated onboarding acceptance.
- Supabase staging project reference `rwedeejhjazwjthdjzrt`, PostgreSQL 17.6; prior read-only inspection identified unresolved `public.appointment_access_tokens` anon grants / permissive policy; no SQL owner GO. Recheck read-only metadata before any future privileged change; no row/token values.
- Staging migration workflow has unconditional first-step HOLD; do not silently unlock. Staging SQL/real cutover needs fresh specific owner approval independently of production-only recovery #10.
- Production Vercel quarantine: existing production target last known old source `3faeced52939c65bbbc49da2ee6c7f375c0f9e59`. Preview builds can occur automatically on review/staging Git integration; do NOT equate preview READY with Production acceptance. Revalidate Vercel production tracking before ANY merge or deployment, never assume zero preview builds.
- age-encrypted capture exists: run [39959869290](https://github.com/MertSGI/Randapp-main/actions/runs/39959869290), GitHub artifact #12504131775, class UNVERIFIED_ENCRYPTED_CAPTURE, reported ciphertext SHA256 `38b5dbfd3c87a51160c7f5f4cda6368d5ac941e0e3e0ac47342d3cba47f212ea`, 439089 bytes, owner-local preservation reported. Private age identity file existence owner confirmed; successful owner decryption / independent real PG17 restore NOT proven. One-shot dispatch was consumed. No retry/renewed GO.

## 5. Accepted evidence taxonomy
Distinguish `SOURCE_REVIEWED`, `CI_EXACT_SHA_SUCCESS`, `SIMULATED_BEHAVIOR_VERIFIED`, `REAL_STAGING_READ_ONLY_METADATA`, `LIVE_STAGING_E2E`, `REAL_PROVIDER_SANDBOX`, `BROWSER_DEVICE_E2E`, `OWNER_ACCEPTED`, `PRODUCTION_PROVEN`. A single green workflow is not a substitute for the others.

## 6. Continue the product, not recovery
Next permissible work is **source-only acceptance and integration-readiness of the stacked PRs plus V1/V2 commercial completeness planning**, bounded issues for payment/outbox release boundaries, and subsequent independently safe source backlog. Treat product Phase G as **SOURCE_PREPARATION_ONLY**; public go-live requires owner GO and Issue10 resolution. Do not treat Phase A–F source tests as a real customer pilot or complete SaaS launch.

Further reading: `docs/autonomy/EVIDENCE_SOURCE_INDEX_20261024.md`, `docs/autonomy/AUTONOMOUS_WORK_QUEUE_20261024.md`, `docs/autonomy/AOS_INTERFACE_AND_AUTHORITY_20261024.md`; private owner archive includes all six historical project sources, previously authored code/directive packages, detailed 21-Oct handoff, 21-Oct V1/V2 publication plan, and an updated new-chat prompt.
