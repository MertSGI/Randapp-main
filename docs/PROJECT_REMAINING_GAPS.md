# LARİ Project Gaps & Remaining Work (Phase 16 Checkpoint)

This document categorizes the known missing pieces, pending integrations, and feature gaps that must be addressed before specific milestones.

### 1. Ready for Pilot Demo (Phase 16 Checkpoint)
- [x] End-To-End product flows (Marketing, Admin, Booking, Super Admin) fully vetted.
- [x] Mock CRUD and visual states are consistent with production quality.
- [x] TR/EN translations are complete and natural.
- [x] Demo data persona (Nexus Studio) is realistic, eliminating all random data.
- [x] Pilot Demo Script is finalized and actionable.

### 2. Super Admin Non-Blocking Backlog
- AI Settings: Improve mobile layout for Super Admin AI Config page.
- AI Settings: Connect Gemini/Imagen keys via secure Edge Functions (do not store frontend).
- AI Settings: Make visual AI outputs dynamically render based on customer reference photo pipeline permissions (keep strict KVKK consent checks).

### 3. Must fix before Supabase sandbox
- Validate exact RLS (Row Level Security) policies (`docs/SUPABASE_RLS_AND_SECURITY_MODEL.md`) against actual edge functions.
- Secure private storage buckets for customer formula notes to prevent cross-tenant photo leaks.
- Real authentication flows using Supabase GoTrue (Email OTP or Magic Links) instead of mock login keys.

### 4. Must fix before production payment
- Integrate real iyzico sandbox API endpoints inside secure Supabase Edge Functions.
- Secure webhook signature verification (`x-iyzico-signature`) handling on incoming hooks.
- Handle multi-tenant subscription states dynamically vs static mock objects.
- Ensure service roles (VITE_SUPABASE_SERVICE_KEY) are removed from any potential frontend bundle exposures and moved 100% to backend Edge functions.

### 5. Can wait for later roadmap
- Automated referral rewards/wallet credit assignment (currently mock calculation).
- Deep integration with Gemini AI Edge functions for customer preference summaries (currently simulated logic).
- Mobile Application wrapping (Capacitor/React Native) for marketplace downloads.
- Salon discovery marketplace/rating features for B2C traffic.
- Full two-way Google Calendar calendar sync for staff availability mapping.
