# Phase 4 Source-Truth Architectural Audit
**Authority**: `LARI-PROGRAM-V2-PRODUCT-FIRST-PHASE3-COMPLETION-20260911-01`  
**Program ID**: `LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01`  
**Subject Baseline**: `09bb1f8d8ce070c33d09099a6d0ae20c93787d11`  
**Evaluation Target**: Revenue & Retention Suite Domains  
**Mode**: `AUDIT_AND_DESIGN_ONLY` (No premature mutation, no live money/provider activation, `PRODUCTION=NO_GO`)

---

## 1. Domain Coverage & Source-Truth Analysis

### A. Deposits & No-Show Policy Domain (`no_show_protection`, `deposits`)
- **Current Baseline Status**:
  - `BookingPolicy` type contains no-show policies (`noShowThreshold`, `blockRepeatedNoShowPhone`, `cancellationWindowHours`).
  - `ht-ai-chat` Edge Function has strict policies prohibiting automated deposit / financial collection (`Takes payments, deposits, or provides payment plans` blocked).
  - Provider-neutral payment foundation (`EV-058-R2`, `public.payment_intents`, `payment_transactions`, `billing_ledger`) exists in review branch `aos/phase3-provider-neutral-payment-foundation-r2`.
- **Phase 4 Requirements**:
  - `public.appointment_deposits`: deposit requirements linked to services (percentage or fixed amount), deposit status (`required`, `held`, `applied`, `forfeited`, `refunded`).
  - No-show penalty policy configuration per tenant and per service.
  - Server-authoritative deposit enforcement integrated with `evaluate_booking_slot` and public booking confirmation.
  - Strict compliance with `COMPANY_DEPENDENT_FINALIZATION`: deterministic mock/sandbox payment adapter only, zero live payment gateway calls.

### B. Memberships & Service Packages (`memberships`, `packages`)
- **Current Baseline Status**:
  - Commercial infrastructure has tenant-level subscription plans (`baslangic`, `profesyonel`, `premium`).
  - Concept of client-facing customer memberships or multi-session service packages is `PLANNED` and currently absent from Supabase migrations.
- **Phase 4 Requirements**:
  - `public.customer_packages`: multi-use service packages (e.g. 5x Haircut pack), remaining credits, expiry dates.
  - `public.customer_memberships`: recurring subscription tiers for salon customers (monthly credits, priority booking, member discounts).
  - Server RPCs to redeem package credits during appointment booking atomically.

### C. Gift Cards & Client Wallet (`gift_cards`, `client_wallet`)
- **Current Baseline Status**:
  - No database tables exist in baseline migrations.
- **Phase 4 Requirements**:
  - `public.gift_cards`: code, initial balance, current balance, currency, buyer customer, recipient customer, status (`active`, `redeemed`, `expired`, `voided`).
  - `public.client_wallet_ledger`: store credit, refund balances, promotional balance, immutable ledger entries.
  - Anti-tamper balance check and concurrency lock (`SELECT ... FOR UPDATE`) during checkout/booking redemption.

### D. Loyalty, Campaigns & Automated Reactivation (`loyalty`, `reactivation`)
- **Current Baseline Status**:
  - In `types.ts`, `BusinessCustomerCampaign` has types for `refer_friend`, `discount`, `loyalty`.
  - `ReferralTab.tsx` and `customerCampaignService` maintain campaign and referral data largely in memory / client service mock.
- **Phase 4 Requirements**:
  - Migrate client mock structures to authoritative server schema: `public.customer_campaigns`, `public.customer_referrals`, `public.customer_loyalty_points`, `public.customer_rewards`.
  - Server RPCs for earning loyalty points upon completed appointments (`status = 'completed'`).
  - Automated client reactivation criteria (customers with no appointments in 60/90 days) with outbox communication trigger.

---

## 2. Dependency-Safe Implementation Sequencing for Phase 4

| Sequence | Domain Candidate | Proposed Branch | Base Commit | Key Artifacts / Primitives |
|:---|:---|:---|:---|:---|
| **P4-Node-1** | Deposits & No-Show Policy | `aos/phase4-deposits-noshow-foundation` | `09bb1f8d8ce070c33d09099a6d0ae20c93787d11` | `appointment_deposits`, `no_show_policies`, deposit checkout intent integration. |
| **P4-Node-2** | Packages & Memberships | `aos/phase4-packages-memberships-foundation` | `09bb1f8d8ce070c33d09099a6d0ae20c93787d11` | `customer_packages`, `customer_memberships`, credit redemption RPC. |
| **P4-Node-3** | Gift Cards & Client Wallet | `aos/phase4-giftcards-wallet-foundation` | `09bb1f8d8ce070c33d09099a6d0ae20c93787d11` | `gift_cards`, `client_wallets`, immutable ledger transactions. |
| **P4-Node-4** | Loyalty & Automated Reactivation | `aos/phase4-loyalty-reactivation-foundation` | `09bb1f8d8ce070c33d09099a6d0ae20c93787d11` | `loyalty_points`, retention triggers, outbox campaigns. |

---

## 3. Strict Boundary Commitments
1. `LARI_PRODUCT_PRODUCTION=NO_GO`.
2. Zero real money collection, zero live Iyzico/Stripe network mutation (`COMPANY_DEPENDENT_FINALIZATION`).
3. Tenant and branch isolation strictly preserved via RLS and server-authoritative mutations.
4. Concurrency protection via row-level locks on wallet/package/gift card debits.
