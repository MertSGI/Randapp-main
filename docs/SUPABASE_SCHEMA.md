# LARİ Supabase Schema Architecture

This document describes the mapping of application entities into Supabase tables, aligning the initial prototype (localStorage/mock) architecture to a real relational and secure database schema.

## Core Hierarchy

- **Auth Session (auth.users)**: Represents a physical identity authenticated via Supabase Auth.
- **Tenants (tenants)**: The root boundary for an establishment (salon, spa). All business data flows down from a Tenant UUID.
- **Business Branches (business_branches)**: (Foundation Phase) Locations belonging to a tenant. Services, Staff, and Appointments will eventually partition through Branch IDs for Enterprise-tier merchants. Primary fallback Branch generates dynamically for single-location usage.
- **Business Profiles (tenant_business_profiles / business_profiles)**: The public representation, containing visual configurations, opening hours, descriptions, and location details.

## Resource Entities

- **Services (services)**: Available treatments or services offered.
- **Staff (staff)**: The employees or practitioners at the establishment.
- **Staff Services (staff_services)**: Junction table matching what staff members can perform what services.
- **Availability Rules (availability_rules)**: Define recurring or specific shifts/availability for staff/tenant.

## Transaction Entities

- **Appointments (appointments)**: Booking records connecting Customer, Tenant, Service, and Staff.
- **Customers (customers)**: Core customer CRM profile for a tenant.
- **Customer Memory (customer_memory)**: Private add-on holding internal notes, preferences, and reference photo metadata (No biometric indexing).

## Billing & Go-Live Pipeline

- **Subscriptions (subscriptions)**: Current trial or active payment plan state.
- **Payments (payments) & Payment Events (payment_events)**: Logs and webhook records processing from sandbox/production (e.g. Iyzico).
- **Business Verification (business_verification_reviews)**: Logs of Super Admin manual review gate for publish approval.
- **Audit Logs (audit_logs)**: Detailed tracking of tenant state changes and risk-related events.

## Referral & Growth
- **Referral Campaigns (referral_campaigns)**: B2C Custom reward models published by salons for their end users.
- **Platform Referral Settings (platform_referral_programs)**: B2B system configurations dictating global free-month reward thresholds.
- **Platform Referrals (platform_referrals)**: The relationship linking referring tenant IDs to the referred, holding current qualification lifecycle state.
- **Referral Reward Ledger (referral_reward_ledgers)**: Auditable trails of free months granted off active subscriptions, consumed and pending.

## Notification & Communication Layer

- **Notification Templates (notification_templates)**: Scaffolding dictating text/email/WhatsApp notifications.
- **Notification Logs (notification_logs)**: Records of message dispatch statuses.

## Media and Assets Layer

- **Media Assets (media_assets)**: Holds references and metadata for uploaded images, logos, covers, staff portraits, service icons, and attachments. Includes:
  - `id` (uuid)
  - `tenant_id` (uuid) REFERENCES tenants(id)
  - `branch_id` (uuid) REFERENCES business_branches(id) (optional)
  - `owner_type` (text) (e.g., 'business_profile', 'staff', 'service')
  - `owner_id` (uuid) (optional)
  - `type` (text) (logo/cover/gallery/staff_photo/service_image/branch_image/campaign_image/document/internal_attachment)
  - `visibility` (text) (public/tenant_private/super_admin_only)
  - `provider` (text) (local_preview/supabase_storage/s3_compatible/external_url)
  - `status` (text) (draft/active/archived/rejected/deleted)
  - `file_name` (text)
  - `original_file_name` (text)
  - `mime_type` (text)
  - `size_bytes` (bigint)
  - `width` (int) (optional)
  - `height` (int) (optional)
  - `alt_text` (text) (optional)
  - `storage_path` (text) (path keys within buckets)
  - `public_url` (text) (optional)
  - `local_preview_url` (text) (optional)
  - `created_at` (timestamp)
  - `updated_at` (timestamp)
  - `uploaded_by` (uuid) REFERENCES auth.users(id) (optional)
  - `metadata` (jsonb) (dimensions, browser, device, backup markers)

## Paymentless Core Operations (Added in 2026-06-20 Migration)

To support complete self-service tracking, approvals, consent, and audit logs:

- **Appointment Access Tokens (`appointment_access_tokens`)**: Tracks tokens for secure customer self-service actions without requiring login credentials.
- **Appointment Change Requests (`appointment_change_requests`)**: Holds customer or salon cancellation/rescheduling proposals awaiting approval.
- **Communication Outbox (`communication_outbox`)**: Stagers queued notifications (SMS, WhatsApp, email) to prevent double-sends and maintain a local log trace.
- **Audit Events (`audit_events`)**: Logs operator state updates, logins, policy overrides, and billing changes for compliance.
- **Support Tickets (`support_tickets`)**: Allows tenant owners to log technical issues or feature requests with LARI engineers directly.
- **Policy Acceptances (`policy_acceptances`)**: Collects user-agent, timestamped consent, and IP mappings for KVKK terms.
- **Consent Ledger (`consent_ledger`)**: Records digital signatures and granular permissions granted/withdrawn by customers.
- **Data Rights Requests (`data_rights_requests`)**: Tracks personal data extraction or deletion requests under KVKK laws.

