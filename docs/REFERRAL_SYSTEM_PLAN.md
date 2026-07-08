# Referral System Plan

## Overview
LARİ includes a simple referral program to encourage existing salon owners (tenants) to invite other businesses. 

## Data Model

**ReferralProgramRule**
- `id`: string
- `active`: boolean
- `rewardType`: 'discount' | 'free_month' | 'cash_credit' | 'setup_fee_discount'
- `rewardValue`: number
- `appliesToPlanIds`: string[]
- `requiresReferredTenantPaidSubscription`: boolean
- `minimumSubscriptionMonths`: number
- `maxRewardsPerTenant`: number
- `validFrom`: date
- `validTo`: date
- `createdBy`: string

**Referral**
- `id`: string
- `referrerTenantId`: string
- `referrerOwnerEmail`: string
- `referredBusinessName`: string
- `referredContactName`: string
- `referredPhone`: string
- `referredEmail`: string
- `referredCity`: string
- `status`: 'submitted' | 'contacted' | 'converted' | 'reward_pending' | 'rewarded' | 'rejected'
- `rewardApplied`: boolean
- `notes`: string
- `createdAt`: date
- `updatedAt`: date

## Admin Workflows
**Super Admin**:
- Create/Edit Referral Rules.
- View list of all referrals.
- Update status (e.g., mark as 'contacted' or 'rewarded').
- Manually apply rewards to tenants' billing terms.

**Salon Owner Admin**:
- Use the "Referans Ver / İşletme Öner" button.
- Fill out a simple form proposing another business.
- Track their own referral history and current rewards rules.

## Marketing
- Optional display block on the marketing site: "Başka bir salon öner, avantaj kazan."

---

## 2. Business Customer Referral Campaigns (B2C)

Separate from the B2B Platform Referral Program, the **Business Customer Referral Campaign** system enables salons to run localized friend-referral incentives to acquire new guests.

### Data Model

**BusinessCustomerCampaign**
- `id`: string
- `tenantId`: string
- `name`: string
- `type`: 'refer_friend' | 'discount' | 'loyalty'
- `isActive`: boolean
- `rewardDescription`: string
- `customerReward`: string
- `referredCustomerReward`: string
- `startDate`: Date string
- `endDate`: Date string
- `maxUses`: number
- `terms`: string

**BusinessCustomerReferral**
- `id`: string
- `tenantId`: string
- `campaignId`: string
- `referrerCustomerId`: string (or `'referred_by_Name'`)
- `referredCustomerName`: string
- `referredCustomerPhone`: string
- `status`: 'pending' | 'booked' | 'completed' | 'rewarded' | 'rejected'
- `appointmentId`: string
- `createdAt` / `updatedAt`: Date strings

### Operational Flow & Entitlements
- **Gating**: Access to customer referral campaigns is restricted to **Professional** and **Kurumsal** plans based on the `campaigns_referrals` entitlement.
- **Attribution**: Guests booking public slots can state their referrer's name and campaign code. The system creates a referral of status `'booked'` linked to the appointment.
- **Completion**: Salons mark referrals as completed. This triggers automated notification hooks and logs email/SMS reward drafts for both parties.

---

## 3. Business Customer Campaign Reward Ledger (B2C)

To make campaign benefits reliably trackable, auditable, and usable, LARİ includes a dedicated **Customer Campaign Reward Ledger**.

### Data Model

**CustomerCampaignReward**
- `id`: string (UUID or secure prefix `rew_`)
- `tenantId`: string (FK to Tenants)
- `campaignId`: string (FK to Campaigns)
- `customerReferralId`?: string (FK to Referrals, optional)
- `customerId`: string (Identifier for the customer receiving the reward)
- `appointmentId`?: string (Optional FK linking booking that led to the reward)
- `rewardOwnerType`: `'referrer_customer'` | `'referred_customer'` (Indicates if recipient is the referrer or referee friend)
- `rewardDescription`: string (e.g., "İlk Saç Kesiminde %20 İndirim" / "Arkadaş Daveti: 150 TL Hediye Çeki")
- `rewardValueType`: `'percent_discount'` | `'fixed_discount'` | `'free_service'` | `'manual_reward'`
- `rewardValue`?: number (Numerical discount value, e.g., `20` or `150`)
- `status`: `'available'` | `'reserved'` | `'used'` | `'cancelled'` | `'expired'` (State of the ledger entry)
- `availableAt`: Date string
- `expiresAt`?: Date string
- `usedAt`?: Date string
- `usedAppointmentId`?: string (Optional booking where the reward was applied)
- `notes`?: string
- `createdAt` / `updatedAt`: Date strings

### Ledger Business Logic API

The `customerCampaignService` implements transactional, double-spend-safe state methods:

1. **`listCustomerRewards(tenantId)`**: List all customer rewards across the business.
2. **`listCustomerRewardsByCustomer(tenantId, customerId)`**: Fetch rewards specifically owned by a customer.
3. **`markRewardUsed(rewardId)`**: Redeem a reward, locking status to `'used'`.
4. **`cancelReward(rewardId, reason)`**: Revoke a reward for abuse or cancellations, marking it `'cancelled'`.
5. **`expireOverdueRewards(tenantId)`**: Auto-expires rewards past their `expiresAt` date limit.

### Automated Integrations

- **Booking Scheduling (Attribution)**: When creating appointments in `/services/appointmentService.ts`, the system automatically screens pending B2C referrals matching the incoming client's phone/name. If found, it links the referral to the appointment, updating status to `'booked'`.
- **Salon Appointment Completion**: Upon marking an appointment status to `'completed'` or `'confirmed'`, the system cross-references the linked referral ID (or matches by details) and triggers `customerCampaignService.markReferralCompleted(referralId)`. This automatically produces the earned ledger rewards for both the referrer and the referee friend!
- **Anti-Abuse Safeguards**: 
  - Prevents creating duplicate rewards from the same completed/rewarded customer referral.
  - Obeys campaign limits (`maxUses`) and prevents ledger grants when campaign caps are exceeded.
- **Dedicated CRM View**: In `/components/CustomerMemoryTab.tsx`, clicking on a customer card displays their earned campaign ledger rewards detailing description, status (Active, Used, Cancelled), and date, enabling rapid physical verification at checkout.
- **Daily Performance Reports**: `/components/SalonReportsTab.tsx` aggregates real-time metrics showing total referral conversions, top campaigns by volume, and ledger-issued rewards vs rewards claimed.
- **Lifecycle Notifications**: Automatic event hooks register out-of-band notifications on `notifyCustomerRewardAvailable`, `notifyCustomerRewardUsed`, and `notifyCustomerRewardExpiring`.

