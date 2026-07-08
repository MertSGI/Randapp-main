# Subscription Lifecycle & Data Model

LARİ implements a robust subscription lifecycle state machine designed to scale securely from mock preview pilots to fully synchronized live production environments.

## 1. Canonical State Diagram

The lifecycle transitions through the following statuses programmatically handled via `subscriptionService.ts` and gated at `goLiveService.ts`:

```
               [ Register Tenant ]
                       │
                       ▼
               pending_checkout (Kart doğrulaması bekleniyor) - Cannot publish
                       │
             ┌─────────┴─────────┐
             ▼ (Card Auth)       ▼ (Admin override)
          trialing           manual_active / comped
      (14-day trial)       (Offline billing / pilot)
             │                   │                  
             ├───────────────────┼───────────────────┐
             ▼                   ▼                   ▼
          active             past_due             paused
     (Recurring Success)  (Invoice Failure)   (Owner Frozen)
             │                   │                   │
      ┌──────┴──────┐            ▼                   ▼
      ▼             ▼         expired             resumed
  cancelled    cancelled_at   (Grace end)        (Bookings active)
 (Immediate)   period_end     (Feature lock)
```

## 2. Subscription Status Definitions

* **`pending_checkout`**: Tenant created but credit card verification is pending. **The public page is not allowed to publish.**
* **`trialing`**: 14-day secure trial is active. **The public page can accept bookings.**
* **`active`**: Premium recurring payment is success/verified. **Full booking features live.**
* **`manual_active`**: Upgraded via Super Admin manual/offline payment mechanism. **Full booking features live.**
* **`comped`**: Complimentary/gifted/pilot exception license tier. **Full booking features live.**
* **`past_due`**: Payment failed, grace period warning state.
* **`paused`**: Booking engine frozen temporarily by business owner request. **Public booking page displays dondurulmuş message.**
* **`suspended`**: Admin-locked state due to risk, compliance, or evaluation. **Booking remains unavailable.**
* **`cancelled`**: Immediately deactivated by the user or non-payment. **All premium/gated functions locked.**
* **`expired`**: Subscription period has fully elapsed.

---

## 3. Playbook: Plan Switch Upgrades / Downgrades

* **Upgrades:** Handled immediately in pre-live. If external checkout is required, marked `upgrade_pending` till complete.
* **Downgrades:** Scheduled at period end (`downgrade_scheduled`), retaining high-tier entitlements until current statement boundary expires. Limits are then gracefully throttled rather than raw data removal.
