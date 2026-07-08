# LARİ Next Phase Roadmap

An operational playbook guiding the commercial and technical scaling of LARİ from its current sandbox build into a fully-deployed SaaS platform on `randevulari.com`.

---

## Part 1 — Staged Operational Rollout

### Phase A — First Manual Pilot Readiness
*   **Goal**: Ensure platform flows (manual registration, onboarding tutorials, and basic schedules) are ready for physical demoing on a tablet inside a friendly local beauty salon.
*   **Prerequisites**: Core QA scripts run green.
*   **Exact Deliverables**:
    *   Completed local system audit.
    *   No-show, staff calendar overrides and customer booking links are fully functional on mobile viewports.
    *   Manual Pilot Operating Pack (`docs/FIRST_MANUAL_PILOT_OPERATING_PACK.md`) implemented.
    *   Pilot Salon Intake Form (`docs/PILOT_SALON_INTAKE_FORM.md`) implemented.
    *   Manual Pilot Setup Checklist (`docs/MANUAL_PILOT_SETUP_CHECKLIST.md`) implemented.
    *   Saha Tanıtım ve Satış Betiği (`docs/FIRST_REAL_SALON_DEMO_SCRIPT.md`) implemented.
    *   Pilot Geri Bildirim Skor Kartı (`docs/FIRST_MANUAL_PILOT_FEEDBACK_SCORECARD.md`) implemented.
*   **Risks**: Minor UI quirks on older tablets or safari webviews.
*   **QA Scripts to Run**: `npm run qa:all-communication-notifications`, `npm run qa:site-provisioning`.
*   **Go/No-Go Criteria**: **Go** if the mock booking sheet renders in <500ms on a standard mobile device.

---

### Phase B — Supabase Staging Cutover
*   **Goal**: Transition database storage from client-side `localStorage` to a reliable remote cloud PostgreSQL instance on Supabase.
*   **Prerequisites**: Active Supabase Developer account created by founder.
*   **Exact Deliverables**:
    *   Configure `process.env.SUPABASE_URL` and `SUPABASE_SERVICE_ROLE`.
    *   Trigger schema tables migration scripts.
    *   Validate multi-tenant Row Level Security (RLS) security bindings.
*   **Risks**: Migrating client datasets from older browser caches might require manual sync.
*   **QA Scripts to Run**: `npm run qa:supabase-schema`, `npm run qa:pilot-admin-preview`.
*   **Go/No-Go Criteria**: **Go** if a new salon registration successfully inserts persistent rows in both `tenants` and `subscriptions` tables on Supabase.

---

### Phase C — Iyzico Sandbox Payment Rehearsal
*   **Goal**: Rigorously test subscriptions, downgrades, and trial grace collections using Iyzico's isolated merchant test environment.
*   **Prerequisites**: Dynamic Express server running on staging container.
*   **Exact Deliverables**:
    *   Add `/api/iyzico/payment-start` and `/api/iyzico/webhook` API ports.
    *   Simulate successful 3D Secure checkout redirect patterns.
    *   Handle card failure declines.
*   **Risks**: Delays in webhooks callback updates when staging backend goes sleep/inactive.
*   **QA Scripts to Run**: `npm run qa:subscription-lifecycle`, `npm run qa:payment-run-modes`.
*   **Go/No-Go Criteria**: **Go** if a simulated monthly anniversary charge triggers automated past_due warnings in under 3 seconds.

---

### Phase D — DNS & Wildcard Subdomain Rehearsal
*   **Goal**: Establish wildcard routing, mapping paths like `sacvemakyaj.randevulari.com` natively to separate salon tenants on the internet.
*   **Prerequisites**: Purchased domain `randevulari.com` on Cloudflare or public Registrar.
*   **Exact Deliverables**:
    *   Configure dynamic CNAME DNS rule: `*.randevulari.com` -> Cloud Run IP.
    *   Issue automated SSL certificates handling dynamically routed paths.
    *   Configure Nginx server-rewrite bindings to handle dynamic routing requests gracefully on port 3000.
*   **Risks**: Wildcard routing misconfigurations can cause circular rewrite loops.
*   **QA Scripts to Run**: `npm run qa:site-provisioning`, `npm run qa:route-links`.
*   **Go/No-Go Criteria**: **Go** if hitting `foobar.randevulari.com/booking` renders foobar's salon calendar page on a clean, valid HTTPS connection.

---

### Phase E — Transactional Email & SMS Provider Rehearsal
*   **Goal**: Transition outbox logging tasks to actual mobile delivery networks (WhatsApp/SMS APIs).
*   **Prerequisites**: Approved business credentials from Turkish SMS gateway provider (e.g., NetbGSM, VATANSMS) or Resend SMTP.
*   **Exact Deliverables**:
    *   Integrate actual email/SMS client libraries inside `services/communicationEventService.ts`.
    *   Establish callback hooks to handle carrier delivery updates.
    *   Securely load API keys to private backend environment.
*   **Risks**: SMS volume locks, carrier transmission filters, or message throttling blocks.
*   **QA Scripts to Run**: `npm run qa:communication-notifications`.
*   **Go/No-Go Criteria**: **Go** if booking a slot triggers an instantaneous, real-time confirmation SMS to a test mobile target.

---

### Phase F — First Real Salon Onboarding
*   **Goal**: Handover a live, cloud-connected LARİ account to a real beauty center or salon for active daily customer booking management.
*   **Prerequisites**: Staging Supabase migrations validated; support pathways fully online.
*   **Exact Deliverables**:
    *   Create owner credential profile manually via Super Admin portal.
    *   Assist salon operator in configuring staff slots and customized service catalogues.
    *   Export high-resolution salon QR booking codes.
*   **Risks**: Salon operators may run into operational misunderstandings or request instant feature changes.
*   **QA Scripts to Run**: `npm run qa:all`.
*   **Go/No-Go Criteria**: **Go** if the salon owner registers their first 5 real consumer bookings on the platform with zero system complaints.

---

### Phase G — Production Launch
*   **Goal**: Enable public registration and payment gateway processing on `randevulari.com`.
*   **Prerequisites**: Dynamic automated billing workers operational; legal KVKK/ToS rules approved.
*   **Exact Deliverables**:
    *   Transition Iyzico gateway API to production.
    *   Turn off administrative debugging hooks in public dashboards.
    *   Setup automated offsite database backups.
*   **Risks**: Peak-load spikes or unexpected card declined exceptions during billing runs.
*   **QA Scripts to Run**: `npm run qa:master-audit`, `npm run qa:pre-live-hardening`.
*   **Go/No-Go Criteria**: **Go** if the production platform runs on standard HTTPS and collects a real subscription fee from a live Credit Card.

---

### Phase H — Global & LARİ Expansion
*   **Goal**: Scale the system to multi-lingual regions (EN) and support other service fields (e.g., medical spas, clinical consults).
*   **Prerequisites**: Market config engines enabled.
*   **Exact Deliverables**:
    *   Support dynamic `?lang=en` parameters.
    *   Include multi-currency (USD, EUR) options.
*   **Risks**: Translation gaps in third-party notification content.
*   **QA Scripts to Run**: `npm run qa:market-global`.
*   **Go/No-Go Criteria**: **Go** if the public booking interface dynamically switches currencies and language structures on a single dynamic state.
