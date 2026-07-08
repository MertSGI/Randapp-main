# Schema Mismatch Report & Phase 12 Supabase Migration Plan

## Overview
This document serves as the official integration gap analysis between the active frontend TypeScript models (`types.ts`) and the live Supabase SQL schema migrations (`supabase/migrations/001_initial_schema.sql`). 

Because we are in Phase 11 (Execution / Mock Mode), these discrepancies do not block frontend operations, as the app falls back to local and mock services. However, prior to Phase 12 (Supabase Data Sync and Production Go-Live), the SQL schema must be updated to align with the matured frontend data structures.

---

## Identified Discrepancies

### 1. `appointments` Table Mismatch
**Frontend Models (`types.ts` -> `Appointment`):** 
The frontend explicitly models cancellation flows with structured metadata (for customer portals, audit logs, and salon tracking).
```typescript
  status: 'confirmed' | 'cancelled' | 'cancelled_by_customer' | 'cancelled_by_salon' | 'completed' | 'no_show';
  cancelReason?: string;
  cancelledAt?: string;
  cancelledBy?: 'customer' | 'salon' | 'system';
```

**Database Reality (`001_initial_schema.sql`):**
The `appointments` table has a simple `status VARCHAR(50)` and a `notes TEXT` field. It completely lacks explicit fields for tracking cancellation history and reasons.
**Missing Columns:** `cancel_reason`, `cancelled_at`, `cancelled_by`.

### 2. `customers` Table (CRM Lite) Mismatch
**Frontend Models (`types.ts` -> `CustomerProfile`):**
The frontend expects advanced "CRM Lite" tracking for salons (e.g., preferred staff, styling notes, communication consents).
```typescript
  preferredLanguage?: 'tr' | 'en';
  marketingConsent?: boolean;
  appointmentReminderConsent?: boolean;
  stylePreference?: string;
  colorFormula?: string;
  avoidNotes?: string;
  careNotes?: string;
```

**Database Reality (`001_initial_schema.sql`):**
The `customers` table is completely flat and basic:
```sql
CREATE TABLE public.customers (
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    ...
```
**Missing Columns:** Advanced CRM fields are absent. We recommend adding a JSONB `metadata` column rather than altering the table with 10+ specific textual fields, ensuring better extensibility.

### 3. Referral Tracking Missing Structure
**Frontend Models (`types.ts` -> `ReferralCampaign`, `ReferralCode`, `ReferralLead`):**
The frontend `ReferralTab` tracks campaigns with reward properties (`rewardType`, `rewardValue`), assigns unique tracking strings (`ReferralCode`), and links them to sign-ups (`ReferralLead`).

**Database Reality (`001_initial_schema.sql`):**
There is a basic `campaigns` table with merely `name` and `status`. There are absolutely no relational tables for capturing generated referral codes matching tenants, nor lead tracking.
**Missing Tables/Columns:** `referral_codes`, `referral_leads`. `campaigns` is missing reward definition fields.

### 4. Tenant Branding Key Discrepancy
**Frontend Models (`types.ts` -> `TenantBranding`):**
React uses `secondaryColor`. 

**Database Reality (`001_initial_schema.sql`):**
The database uses `accent_color`. An object mapping transformation will be required in the Supabase Service layer to handle this cleanly during loads/saves.

---

## Action Plan for Phase 12 (Supabase Go-Live Preparation)

Before activating real Supabase data-fetching across the application, the following migration (`002_schema_alignment.sql`) needs to be executed on the production cluster.

### Proposed Migration Draft (`002_schema_alignment.sql`)

```sql
-- 1. Align Appointments for Cancellation Data
ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(50);

-- 2. Enhance Customers for CRM Lite
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
-- Expected structure of metadata: 
-- { "preferredLanguage": "tr", "colorFormula": "...", "careNotes": "...", "marketingConsent": true }

-- 3. Enhance Campaigns for Rewards
ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS campaign_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS reward_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS reward_value VARCHAR(100),
ADD COLUMN IF NOT EXISTS start_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS end_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS max_uses INTEGER;

-- 4. Add Missing Referral Tables
CREATE TABLE IF NOT EXISTS public.referral_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
    code VARCHAR(50) UNIQUE NOT NULL,
    referrer_type VARCHAR(50),
    referrer_id UUID,
    usage_count INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.referral_leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
    referral_code VARCHAR(50) NOT NULL,
    lead_name VARCHAR(255),
    lead_phone VARCHAR(50),
    lead_email VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for New Tables
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_leads ENABLE ROW LEVEL SECURITY;

-- Note: RLS Policies for new tables will inherit from tenant access rules.
```

