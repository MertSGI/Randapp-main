# Salon Business Website Profile - QA Guide

## Overview
This document outlines the testing requirements for the new Salon Website Profile features that convert standard booking pages into mini-websites.

## Test Matrix

### 1. Database & Persistence Layer
- [ ] Verify `005_salon_business_profile.sql` migration runs without errors
- [ ] Verify Row Level Security (RLS) on `tenant_business_profiles`
  - [ ] Public users can SELECT `is_public=true`
  - [ ] Salon owners can SELECT/INSERT/UPDATE their own tenant_id
  - [ ] Super Admins can do all
- [ ] Verify schema matches `SalonBusinessProfile` interface from `types.ts`

### 2. Administrator Panel (`/admin`)
- [ ] Navigate to "Web Sitesi" tab
- [ ] Verify the form loads existing profile data correctly (Mock or Real)
- [ ] Toggle "Sayfa Yayında" and verify `is_public` state updates
- [ ] Edit "Slogan" and "Açık Adres"
- [ ] Add multiple hero gallery images using standard URLs
- [ ] Verify successful save notification and data persistence

### 3. Onboarding Wizard (`OnboardingWizard.tsx`)
- [ ] Login as a brand new tenant with no profile
- [ ] Navigate through Onboarding Wizard
- [ ] Verify Step 3: "İşletme Profili (Web Sitesi)" appears and requires input
- [ ] Verify completion state tracks the profile input ("Marka ve Profil")
- [ ] Verify readiness blocks go-live if missing profile info

### 4. Public Booking Page (`BookingPage.tsx`)
- [ ] Access public URL for a configured tenant
- [ ] Verify Hero Image is rendered (first image from `hero_gallery`)
- [ ] Verify display of the Slogan (`short_description`)
- [ ] Verify display of Address (`address`)
- [ ] Verify secondary gallery images render
- [ ] Verify empty states (if no gallery/slogan exists, fallback cleanly)

### 5. Demo Generator (`DemoLandingPage.tsx`)
- [ ] Visit main landing page and interact with Demo Generator section
- [ ] Populate Slogan and Verify live preview updates instantly
- [ ] Verify Address population and live preview updates instantly

### 7. Core UX & Booking Flow Re-Architecture
- [ ] Verify Public page starts as a marketing website (cover photos, slogan, staff), not a booking stepper.
- [ ] Verify Cover photos act as the primary gallery (no separate gallery section appears by default).
- [ ] Verify Clicking a cover photo opens a lightbox view for detailed image inspection.
- [ ] Verify Service selection occurs *before* expert selection.
- [ ] Verify Experts show "Nearest Availability" dynamically fetched on the expert selection card.
- [ ] Verify "Bana Fark Etmez" (Any Expert) selects the earliest available staff and time slot automatically.
- [ ] Verify Time slots correctly show only *after* an expert/availability has been chosen.
- [ ] Verify Desktop layout is wide and feels like a full business website (max-width aligned to professional sites).
- [ ] Verify Mobile layout remains stacked, polished, and mobile-first, mimicking a modern web-app experience.
- [ ] Verify Owner upload flow uses computer file upload first by default (URL fields are advanced/optional).
- [ ] Verify `/admin/preview` bypasses the go-live lock so owners can see their complete site before publishing.
- [ ] Verify Public lock still strictly prevents unauthorized access before go-live.
