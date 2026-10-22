# LARI — Batch 03 Unresolved Failure Root Cause Analysis

**Instruction ID:** `LARI-AG-BATCH-20261022-04-R2` (WP-N)  
**Execution Timestamp:** 2026-10-22T08:56:30+03:00  
**Target Worktree:** `C:\Projects\LARI-dev247-batch-20261021`  
**Base Commit:** `e04f59fc90cea8753027950a30abcd42042b2692` (Parent: Batch 03 HEAD `3ce524f00b17a5a39dd8b6ee008f852c565a3907`)  

---

## 1. Failure Identification Matrix

| COMMAND | EXIT | FILE:LINE | ROOT_CAUSE | FIX_SCOPE | WHETHER_PREEXISTING_PROVEN |
| :--- | :---: | :--- | :--- | :--- | :---: |
| `npm run qa:legal-consent` (`node scripts/verify-legal-consent-readiness.mjs`) | `1` | `scripts/verify-legal-consent-readiness.mjs:125-126` and `scripts/verify-legal-consent-readiness.mjs:158` | Static verification script expects literal contract strings (`consentLedgerService`, `recordConsent` in `pages/RegistrationPage.tsx` and `Kişisel Verilerin Korunması` in `pages/AppointmentSelfServicePage.tsx`). Neither page was integrated with these services in historical product ancestry. | Target fixes in `pages/RegistrationPage.tsx` and `pages/AppointmentSelfServicePage.tsx` under WP-P to integrate fail-closed legal contracts without fake persistence claims. | **PROVEN_PREEXISTING** (Neither file modified in Batch 01, 02, or 03; last modified in commits `ff4d230` and `618993b` prior to Batch 01). |

---

## 2. Sanitized Execution Output

```text
> lari@0.0.0 qa:legal-consent
> node scripts/verify-legal-consent-readiness.mjs

--- Verifying Legal, KVKK, and Consent Ledger Infrastructure ---
✅ Legal Document Service file exists
✅ Policy Acceptance Service file exists
✅ Consent Ledger Service file exists
✅ Data Rights Request Service file exists
✅ Super Admin Legal & KVKK Workstation file exists
✅ Legal Policy Operations Manual file exists
✅ Consent Ledger Guide file exists
✅ Data Rights Request Operations Guide file exists
✅ Regulatory Review Checklist file exists
❌ Registration Form Page is missing contract element: "consentLedgerService"
❌ Registration Form Page is missing contract element: "recordConsent"
❌ Customer Appointment Self-Service Page is missing contract element: "Kişisel Verilerin Korunması"
❌ QA Validation Failed: Legal and KVKK compliance checkpoints are NOT fully green.
QA_LEGAL_CONSENT_EXIT: 1
```

---

## 3. Root Cause & Target Remediation Scope

1. **`pages/RegistrationPage.tsx` Omission:**
   - Script expects tenant registration form to integrate both `policyAcceptanceService` (which is present) and `consentLedgerService.recordConsent` for transactional and marketing consent.
   - Currently, `RegistrationPage.tsx` only calls `policyAcceptanceService.recordPolicyAcceptance`.
   - In WP-P, `RegistrationPage.tsx` will be updated to:
     - Retain idempotent tenant provisioning.
     - Integrate `consentLedgerService.recordConsent` and `policyAcceptanceService.recordPolicyAcceptance`.
     - In persistent Supabase mode, visibly indicate pending server attestation (`LEGAL_ACCEPTANCE_RECORD_PENDING` / `SERVER_LEGAL_WRITE_NOT_READY`) without fake client persistence claims.
     - Preserve full local demo mode functionality.

2. **`pages/AppointmentSelfServicePage.tsx` Omission:**
   - Script expects `AppointmentSelfServicePage.tsx` to include KVKK data rights panel with literal header `"Kişisel Verilerin Korunması"` and `dataRightsRequestService.createDataRightsRequest`.
   - Currently, `AppointmentSelfServicePage.tsx` contains appointment lookup/rescheduling/cancellation, but the KVKK self-service panel section was incomplete or used differing terminology.
   - In WP-P, the KVKK data rights panel will be aligned with the contract (`Kişisel Verilerin Korunması`, request types `deletion`, `export`, `correction`, `consent_withdrawal`), fail-closed in persistent mode (`LEGAL_PERSISTENCE_REQUIRED`), and preserving local demo feedback.

3. **Super Admin Legal Workstation (`pages/super-admin/SuperAdminLegalPage.tsx`):**
   - In WP-O, the administrative workstation will be hardened against false operational success in persistent Supabase mode when trusted server RPC is not yet configured.
