# LARİ Health Tourism — Canonical Historical Scope Reconciliation Matrix

This document persists the complete, auditable 37-row historical and current scope reconciliation matrix for **LARİ Health Tourism** under Decision DECISION-016.

Every historical requirement (items 1 through 37) is explicitly classified using **strictly one of four canonical classifications**:
- `COMMITTED`: Core scope to be implemented or integrated as part of Health Tourism.
- `DEFERRED`: Scope explicitly deferred to Final Delivery (e.g., external production provider account activations).
- `EXPLICITLY_OUT_OF_SCOPE`: Functionality explicitly excluded from Health Tourism and platform implementation scope.
- `SUPERSEDED`: Scope superseded by pre-existing platform architecture.

---

## Auditable 37-Row Item-by-Item Matrix

| item_id | requirement | classification | implementation_disposition | upstream_capability_reference | HT_obligation | Final_Delivery_carry_forward | reason |
|---|---|---|---|---|---|---|---|
| **1** | Clinic speech-to-text | `EXPLICITLY_OUT_OF_SCOPE` | `REUSE_EXISTING_PLATFORM_CAPABILITY` | `CLINIC_AI_ASSIST_V1` | None | None | Completed upstream in Clinic AI Assist V1; not new HT implementation |
| **2** | AI SOAP draft + human approval | `EXPLICITLY_OUT_OF_SCOPE` | `REUSE_EXISTING_PLATFORM_CAPABILITY` | `CLINIC_AI_ASSIST_V1` | None | None | Completed upstream in Clinic AI Assist V1; not new HT implementation |
| **3** | Multilingual Health Tourism public surfaces | `COMMITTED` | `NEW_HT_FEATURE` | None | Multilingual public landing UI (TR/EN/DE/RU/AR) | None | Core HT requirement for international patient acquisition |
| **4** | Multilingual intake | `COMMITTED` | `NEW_HT_FEATURE` | None | Multi-step international patient intake form | None | Core HT requirement for lead data collection |
| **5** | Web AI Lead Agent | `COMMITTED` | `NEW_HT_FEATURE` | None | Assistive web chat agent for initial patient Q&A | None | Core HT requirement for automated intake assist |
| **6** | Lead capture | `COMMITTED` | `NEW_HT_FEATURE` | None | Persistence model `ht_leads` with RLS | None | Core HT requirement for storing inbound leads |
| **7** | Lead scoring | `COMMITTED` | `NEW_HT_FEATURE` | None | Rule-based & AI-assisted lead scoring engine | None | Core HT requirement for coordinator prioritization |
| **8** | Conversation summary | `COMMITTED` | `NEW_HT_FEATURE` | None | AI-generated summary of Web AI agent conversation | None | Core HT requirement for coordinator context handoff |
| **9** | `source_channel` attribution | `COMMITTED` | `NEW_HT_FEATURE` | None | Attribution tracking column on lead capture | None | Core HT requirement for marketing analytics |
| **10** | `referring_agency_id` attribution | `COMMITTED` | `NEW_HT_FEATURE` | None | Agency reference link on lead capture | None | Core HT requirement for agency partnership tracking |
| **11** | Coordinator workflow | `COMMITTED` | `NEW_HT_FEATURE` | None | Dedicated coordinator workspace UI & lead status management | None | Core HT requirement for managing international leads |
| **12** | Explicit AI-to-human handoff | `COMMITTED` | `NEW_HT_FEATURE` | None | Handoff trigger from Web AI Agent to human coordinator | None | Core HT requirement for agent boundary enforcement |
| **13** | Conditional WhatsApp AI/human handoff capability | `COMMITTED` | `NEW_HT_FEATURE` | None | Outbox handoff payload & state machine primitive | None | Core HT capability for multi-channel coordinator outreach |
| **14** | Lead -> Booking -> Clinic acceptance flow | `COMMITTED` | `NEW_HT_FEATURE` | `LARİ_CLINIC_DOMAIN` | RPC converting qualified lead to Clinic patient/appointment | None | Core HT integration with Clinic Package |
| **15** | Passport number forward-compatible intake requirement | `COMMITTED` | `NEW_HT_FEATURE` | None | Optional passport_number field in lead/intake schema | None | Core HT forward compatibility requirement |
| **16** | Country code forward-compatible intake requirement | `COMMITTED` | `NEW_HT_FEATURE` | None | Country code selection in lead/intake schema | None | Core HT forward compatibility requirement |
| **17** | Multilingual clinical text/notes forward compatibility | `COMMITTED` | `REUSE_AND_EXTEND_EXISTING_CONTROLS` | `CLINIC_DOMAIN_NOTES` | Forwarding preferred language metadata from lead to Clinic patient profile | None | Integration obligation connecting HT lead intake to Clinic patient notes |
| **18** | SEO | `COMMITTED` | `NEW_HT_FEATURE` | None | Meta tags, OpenGraph, dynamic sitemap for HT landing pages | None | Core HT requirement for organic acquisition |
| **19** | Multi-site / landing surfaces | `COMMITTED` | `REUSE_AND_EXTEND_EXISTING_CONTROLS` | `PACKAGE_CUSTOMIZATION_BASELINE` | Subdomain & path routing for HT specific landing pages | None | Core HT capability for multi-tenant landing page rendering |
| **20** | Separate Health Tourism lead/landing surface | `COMMITTED` | `NEW_HT_FEATURE` | None | Isolated public landing component separate from standard booking storefront | None | Core HT requirement for dedicated patient acquisition surface |
| **21** | Package branding controls integration | `COMMITTED` | `REUSE_EXISTING_PLATFORM_CAPABILITY` | `PACKAGE_CUSTOMIZATION_BASELINE` | HT public pages consume tenant primary_color, logo_url, custom_css | None | HT integration requirement reusing proven Package branding controls |
| **22** | Custom-domain / white-label integration | `COMMITTED` | `REUSE_EXISTING_PLATFORM_CAPABILITY` | `PACKAGE_CUSTOMIZATION_BASELINE` | HT pages resolve tenant identity via custom domain headers | None | HT integration requirement reusing proven Package custom-domain resolvers |
| **23** | Privacy / audit requirements | `COMMITTED` | `REUSE_AND_EXTEND_EXISTING_CONTROLS` | `CORE_AUDIT_LOGS` | Audit log entries for lead creation, AI conversation, coordinator handoffs | None | HT obligation extending platform audit logging to HT domain |
| **24** | AI data-retention requirements | `COMMITTED` | `NEW_HT_FEATURE` | None | Retention & cleanup policies for Web AI Agent transcripts and lead summaries | None | HT obligation specifying data lifecycle for lead AI conversations |
| **25** | Maps support | `COMMITTED` | `REUSE_EXISTING_PLATFORM_CAPABILITY` | `CORE_BASELINE` | Rendering clinic location map on HT public landing pages | None | HT integration requirement reusing Core maps component |
| **26** | Cookie-consent support | `COMMITTED` | `REUSE_EXISTING_PLATFORM_CAPABILITY` | `CORE_BASELINE` | Displaying cookie banner on HT public intake pages | None | HT integration requirement reusing Core cookie-consent component |
| **27** | WhatsApp provider activation | `DEFERRED` | `DEFERRED_TO_FINAL_DELIVERY` | `COMMUNICATION_OUTBOX` | None | `WHATSAPP_PROVIDER_ACTIVATION` | Real WhatsApp API provider credentials owned by Final Delivery |
| **28** | SMS provider activation | `DEFERRED` | `DEFERRED_TO_FINAL_DELIVERY` | `COMMUNICATION_OUTBOX` | None | `SMS_PROVIDER_ACTIVATION` | Real SMS gateway account activation owned by Final Delivery |
| **29** | Agency commission management | `EXPLICITLY_OUT_OF_SCOPE` | `NO_IMPLEMENTATION` | None | None | None | Excluded from SaaS platform scope; manual agency accounting |
| **30** | e-Prescription | `EXPLICITLY_OUT_OF_SCOPE` | `NO_IMPLEMENTATION` | None | None | None | Medical safety exclusion; requires regional regulatory certification |
| **31** | Lab order tracking | `EXPLICITLY_OUT_OF_SCOPE` | `NO_IMPLEMENTATION` | None | None | None | Excluded from HT scope; deferred to future clinical diagnostic module |
| **32** | DICOM / X-ray | `EXPLICITLY_OUT_OF_SCOPE` | `NO_IMPLEMENTATION` | None | None | None | Excluded from HT scope; requires heavy PACS infrastructure |
| **33** | Insurance / TSB | `EXPLICITLY_OUT_OF_SCOPE` | `NO_IMPLEMENTATION` | None | None | None | Excluded from HT scope; local government/insurance integration |
| **34** | Marketplace | `EXPLICITLY_OUT_OF_SCOPE` | `NO_IMPLEMENTATION` | None | None | None | Excluded from HT scope; platform is single-tenant/multi-tenant SaaS, not multi-vendor marketplace |
| **35** | Settlement / split payments | `EXPLICITLY_OUT_OF_SCOPE` | `NO_IMPLEMENTATION` | None | None | None | Financial regulatory exclusion; platform does not handle escrow/split settlements |
| **36** | Inpatient / bed / operating-room ERP scope | `EXPLICITLY_OUT_OF_SCOPE` | `NO_IMPLEMENTATION` | None | None | None | Excluded from HT scope; full hospital ERP out of scope |
| **37** | Iyzico / payment activation | `DEFERRED` | `DEFERRED_TO_FINAL_DELIVERY` | `COMMERCIAL_CORE` | None | `IYZICO_PAYMENT_ACTIVATION` | Production payment gateway activation owned by Final Delivery |

---

## Derived Matrix Statistics

- **NUMBERED_MATRIX_ROW_COUNT**: 37
- **ITEM_ID_MIN**: 1
- **ITEM_ID_MAX**: 37
- **MISSING_ITEM_ID_COUNT**: 0
- **DUPLICATE_ITEM_ID_COUNT**: 0
- **INVALID_CLASSIFICATION_COUNT**: 0
- **COMMITTED_COUNT**: 24 (Items 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26)
- **DEFERRED_COUNT**: 3 (Items 27, 28, 37)
- **EXPLICITLY_OUT_OF_SCOPE_COUNT**: 10 (Items 1, 2, 29, 30, 31, 32, 33, 34, 35, 36)
- **SUPERSEDED_COUNT**: 0 (No numbered items superseded; numbered 37 total = 24 + 3 + 10 + 0 = 37)

---

## Cross-Cutting Dispositions (Not Part of Numbered 37-Row Count)

1. **Clinic `in_consultation` appointment status**: `SUPERSEDED` (Superseded by Core appointment lifecycle status model `confirmed`/`completed`/`cancelled`).
2. **Owner-wide implicit clinical access**: `SUPERSEDED` (Superseded by server-authoritative `clinic_staff_profiles` and `clinic_get_my_context`).
3. **Autonomous Medical AI**: `EXPLICITLY_OUT_OF_SCOPE` / `CROSS_CUTTING_SAFETY_EXCLUSION` (Strict platform safety boundary: Web AI Lead Agent and Clinic AI Assist are strictly assistive. No autonomous medical diagnosis, treatment decision, prescribing, or autonomous clinical note completions).
