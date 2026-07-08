# LARİ Billing & Subscription Operations Guide

This document acts as the master operations guide for managing LARİ's fully-aligned subscription lifecycle, plan switches, and manual billing interventions. It outlines how systems, databases, and UI components adapt dynamically to states from trialing through manual overrides.

---

## 1. Canonical Status Architecture

LARİ supports eight distinct, canonical subscription lifecycle states, verified in both codebase structures and visual layouts.

| Status String | Human State Label | Allowed to Go Live / Accept Bookings? | Billing Mode | Notes / Triggers |
|---|---|---|---|---|
| `pending_checkout` | Kart Doğrulaması Bekleniyor | ❌ No | Standard | Waiting for initial card verification. |
| `trialing` | 14 Günlük Deneme Aktif | ✅ Yes | Standalone Free | Free trial started. Will convert automatically. |
| `active` | Aktif Abonelik (Güvende) | ✅ Yes | Paid Service | Card validated, recurring payments healthy. |
| `manual_active` | Manuel Olarak Aktif Edildi | ✅ Yes | Offline/Manual | Active through offline transfer or cash payment. |
| `comped` | Hediye / Pilot İstisnası | ✅ Yes | Complimentary | Granted for pilot testing or exceptional partner deal. |
| `past_due` | Ödeme Bekleniyor (Önemli) | ❌ No | In Arrears | Past invoice unpaid. Booking remains blocked. |
| `paused` | Abonelik Duraklatıldı / Donduruldu | ❌ No | Suspended | Owner requested freeze on bookability. |
| `suspended` | Hesap Askıya Alındı | ❌ No | Locked | Suspended for compliance, risk, or security evaluation. |

---

## 2. Plan Change (Upgrade / Downgrade) Flows

When an owner upgrades or downgrades their plan:

### In Sandbox / Web Preview (Mock Mode)
1. Owner submits selected plan.
2. The `CheckoutPreviewModal` displays the checkout overview.
3. Upon confirming, `subscriptionService.startTrialAfterCheckout` and `subscriptionService.upgradePlanNow` are triggered locally.
4. Business entitlements, limits (Branches, Staff, Services), and capabilities update **immediately**, refetching active parameters on load.

### In Production (Live Mode)
1. **Immediate Upgrades:** Charges are prorated, and the package change takes effect instantly.
2. **Scheduled Downgrades / Upgrades:** Standard monthly billing models transition at the regular statement boundary. This is tracked inside the database in `scheduledPlanId` and reflected neatly in the owner's `BillingTab` console.

---

## 3. Referral Credits & Discounts

The system implements a flexible referral program and modular super admin overrides:

* **Referral Ledger:** When a tenant successfully invites another studio, they are granted credit months. These are registered in `PlatformLedger` and summed up in real time (`referralCredits`).
* **Discount Overrides:** Super admins can apply custom discounts directly in our standard mock state or Supabase adapters (such as percentage off or fiat off) using:
  - `grantFreeDiscountMonths(tenantId, months, code)`
  - `applyReferralCredit(tenantId, ledgerId)`
* These definitions are directly parsed by `BillingTab` to show detailed, motivating incentive boxes in the tenant UI, keeping developers and sales teams aligned.

---

## 4. Super Admin Overrides

The super admin operational dashboard handles offline/manual actions directly, bypassing gateway controls:

1. **Manual Provisioning:** Direct setup of brand, contact name, custom email, slug, plan ID, and billing source.
2. **State Modulation:** Support for direct override states (`offline_payment`, `complimentary`, `pilot_exception`).
3. **No-Secrets Gate:** No private production keys or sensitive details are revealed or processed in user-facing environments.

---

This framework is covered programmatically by `scripts/verify-subscription-lifecycle-readiness.mjs` and forms a foundational core of LARİ's non-disruptive, pre-checkout readiness checklist.
