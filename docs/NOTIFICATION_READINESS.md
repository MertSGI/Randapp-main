# Notification & Communication Readiness

This document outlines the notification template and provider readiness layer for LARİ Pilot Merchants. The goal is to provide a comprehensive, production-ready copy strategy without adding real secrets or unverified third-party implementations directly into the frontend.

## Overview
A new service `NotificationTemplateService` manages all text and logic definitions around communication channels (`email`, `whatsapp`, `in_app`). 

The current implementation provides a scaffold that is *ready* for backend Edge Functions to consume but performs no direct outbound sending (ensuring we don't leak `SENDGRID_API_KEY`, `AWS_SES_CREDENTIALS` or `META_CLOUD_API_KEY` into the client-side).

## Supported Notification Templates

All templates adhere to production copy rules. They DO NOT mention sandbox, testing, or "coming soon". They enforce our actual product promises (like the 14-day card-required trial).

| ID | Audience | Channel | Name/Description |
| ---| --- | --- | --- |
| `onboarding_welcome` | Business Owner | Email | Welcome email sent on successful directory registration. |
| `trial_started` | Business Owner | Email | Notifies 14-day trial has begun successfully. |
| `checkout_pending` | Business Owner | In-App | Reminds that validation/sandbox card validation is pending. |
| `trial_ending_reminder` | Business Owner | Email | Warning about trial ending. |
| `payment_failed` | Business Owner | Email | Failed payment/provision reminder. |
| `appointment_confirmation` | Customer | WhatsApp | Reassures the customer their reservation is set. |
| `appointment_reminder` | Customer | WhatsApp | Reminds the customer 1-day ahead of booking. |
| `booking_cancelled` | Customer | WhatsApp | Tells customer about cancellation logic. |
| `publish_review_submitted` | Business Owner | In-App | Confirms platform review is pending. |
| `publish_approved` | Business Owner | Email | Go-Live notification! |
| `publish_rejected` | Business Owner | Email | Outlines necessary business data modifications. |
| `support_followup` | Customer/Merchant| Email | Support reply acknowledgment. |

## Frontend vs Backend Responsibilities

**Frontend (`AdminSettingsTab`, `SuperAdminGoLivePage`)**:
- Previews the templates
- Allows business owner to toggle global switches (like `appointmentConfirmationEnabled`)
- Allows the super admin to check SMTP/WhatsApp activation readiness blocks
- Renders the exact text, enforcing branding consistency

**Backend (Supabase Edge Functions - Future)**:
- Consumes environment keys via `supabase secrets set SENDGRID_API_KEY=xxx`
- Reacts to Postgres Database triggers (e.g., `on insert to appointments`)
- Dispatches transactional emails via API.

## Notification Template Integration Hooks (Service Hooks)

The templates defined here are already integrated seamlessly into core business flows. We have added safe logging-only hooks inside `appointmentService.ts`:

- **Appointment Creation:** `createAppointment` safely logs the hook for the `appointment_confirmation` template.
- **Appointment Cancellation:** `updateAppointmentStatus` safely logs the hook for the `booking_cancelled` template when an appointment goes into cancellation states.
- **Appointment Completion:** Completing appointments manages states safely representing the completed CRM node, which could be hooked for a `post_visit_review` or `referral_reward_unlocked` notification.

These hook abstractions allow easy migration towards Event Bridge, Supabase DB Triggers, or standard Pub/Sub outboxing without breaking client-side UI threads.

## QA Rules Checked
- No exposed secrets (like `SENDGRID_API_KEY`) in frontend files.
- No "no-card" trial claims.
- Super Admin page displays templates.
- Admin settings page exposes toggle blocks. 
