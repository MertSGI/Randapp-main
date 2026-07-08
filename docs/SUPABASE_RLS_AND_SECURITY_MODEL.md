# Supabase RLS and Security Model

This document outlines the planned Row Level Security (RLS) policies and security model for the LARİ production database.

## Principles
1. **Tenant Isolation**: By default, no tenant can read or write data belonging to another tenant (`tenant_id` scopes).
2. **Edge Function Mediation**: Highly sensitive operations (payments, subscriptions, AI requests) bypass client-side inserts and route through secure Edge Functions.
3. **Internal vs Public**: Customer memory, internal notes, and reference photos are strictly private and not exposed to the public or even the customer portal unless explicitly allowed.

## RLS Policy Details

### 1. Public Readable Tables (Tenant Profiling)
Tables like `tenants`, `tenant_profiles`, `services`, `staff_members`:
- **Read (SELECT)**: Allowed for `anon` and `authenticated` roles IF `public_status = 'live'`.
- **Write (INSERT/UPDATE/DELETE)**: Allowed ONLY for authenticated users matching the `owner_user_id` of the tenant.

### 2. Appointment Booking
`appointments` and `customers`:
- **Read**: Salon admins can read all appointments in their tenant. Customers can read only their own appointments (via secure OTP auth / backend mapping). Public users cannot read any appointments.
- **Insert**: Public (`anon`) can insert an appointment (and customer) if they provide no sensitive overrides. However, pricing and validation rules should ideally be done through an Edge Function.
- **Update**: Customers can cancel only their own appointments. Salon owners can update anything.

### 3. Customer Memory (Strictly Private)
`customer_notes`, `customer_style_preferences`, `customer_reference_photos`:
- **Read**: Authenticated salon owners/staff only. Customers never read this.
- **Write**: Authenticated salon owners/staff only.
- **AI Processing**: Never submitted to AI unless explicitly opted-in via an Edge Function, not the browser. Reference photos are never exposed publicly.

### 4. Edge-Only (Service Role) Tables
`payments`, `subscriptions`, `audit_logs`, `ai_usage`:
- **Read/Write**: Blocked for `anon` and `authenticated` users by default.
- **Access**: Mastered through Supabase Edge Functions using the Service Role Key. Client fetches current subscription state from a secure RPC or limited read policy.

### 5. Super Admin
Super Admin access (e.g. modifying global plans, viewing all tenants) relies on:
- Edge Functions matching the initiator's JWT role/claims to `is_super_admin`.
- Do not expose super admin privileges directly in client-side Supabase keys.

## What is Safe vs Managed via Edge Functions

| Action | Approach |
| --- | --- |
| Fetching Salon Menu | Safe (`anon` SELECT on `services`) |
| Creating an Appointment | Edge Function or restrictive RLS |
| Canceling an Appointment | Edge Function OR Client RLS matching customer session |
| Fetching AI Recommendation| **Edge Function Only** (Protects Gemini API key) |
| Starting Iyzico Payment | **Edge Function Only** (Protects Iyzico API keys) |
| Viewing Billing Usage | Edge Function or Read-Only RLS view |
| Uploading Reference Photo | Supabase Storage (Private Bucket + RLS) |
