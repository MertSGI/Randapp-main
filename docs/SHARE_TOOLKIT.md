# Paylaşım Araçları (Müşteri Kazanım Araçları) / Share Toolkit

This functionality helps business owners effectively share their booking links across WhatsApp, Instagram, Google Business, and physical salon environments (via QR code) without requiring custom code or manual copywriting.

## Overview

The `shareToolkitService` provides ready-to-copy text templates that embed:
1. The tenant booking URL.
2. A branch-specific tracking parameter if branch is provided.
3. A source tracking attribute (`source=whatsapp`, etc.).

This ensures business owners have professional, contextual, and localized descriptions to post immediately after setting up their account.

## Supported Share Contexts

- **WhatsApp (`getWhatsAppShareText`)**: Includes a friendly greeting to previous customers or inquiries.
- **Instagram Bio (`getInstagramBioText`)**: Tailored for the strict link-in-bio pattern.
- **Instagram Story (`getInstagramStoryText`)**: Actionable CTA for story overlay links.
- **Google Business (`getGoogleBusinessText`)**: Formal text suitable for business description listings.
- **Launch Announcement (`getLaunchAnnouncementText`)**: Special "We are now live on LARİ" template for first launch.
- **QR Poster/Sticker (`getQrPosterCopy` & `getQrPayload`)**: Helps print physical labels so walk-ins and in-salon users can scan to book next time.
- **Customer Reminder (`getCustomerReminderText`)**: Copy for sending manual follow-ups to past clients.

## URL Structure & Tracking

Booking links generated for the share toolkit employ basic attribute tracking via `source`. Example:

`https://my-salon.lari.app/#/book?tenant=my-salon&source=instagram_bio`

This attribute (`source`) is parsed by `BookingPage` and attached to the resulting `Appointment` payload to analyze which platforms drive the most bookings (viewable in Reports Tab).

## Admin UX Integration

- **Share Toolkit Section**: Appears in `AdminSettingsTab` replacing/augmenting `PublicLinkSection`.
- **Hızlı Paylaşım Metinleri**: Text areas with distinct 1-click "Kopyala" buttons.
- **Branch Selection**: Multi-branch setups render a branch dropdown. Choosing a branch automatically updates the generated `branchId` for links and QR codes.
- **Share Checklist (`updateShareChecklist`)**: Keeps track of which marketing steps the owner has completed (e.g. "Instagram bio'ya eklendi"). Stored locally per-tenant.

## Restrictions / Out-of-Scope Security

- **NO External Real Messages**: This module does NOT send emails or WhatsApp messages. It only generates clipboard text.
- **NO Automation Secrets**: No API keys, no Twilio configs, no Meta graph keys are introduced.
- **Publish Status Gateway**: The "Next Actions" dashboard CTA prompts sharing *only* if `isPublished = true`. We avoid directing users to share an unapproved site.
