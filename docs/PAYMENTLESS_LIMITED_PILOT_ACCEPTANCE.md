# Paymentless Limited Pilot Acceptance & Operational Governance

> **STATUS:** CONDITIONAL READY FOR CONTROLLED PILOT (G1B_CONDITIONAL_READY_REQUIRES_OWNER_ACCEPTANCE)  
> **RELEASE CANDIDATE SHA:** `21ed1a2e0505839571f318c7266a4853990b8ce6`  
> **BUILD STATUS:** `LARI QA` Run #134 SUCCESS  
> **PAYMENT MODE:** `disabled` (Paymentless Limited Production)  
> **PRODUCTION TRAFFIC:** NO-GO  

---

## 1. Executive Summary & Baseline

Stage G1B formalizes operational readiness for controlled paymentless pilot execution. All product workflows across Stages D1 through F4 (booking, cancellation, customer reschedule requests, admin approval/rejection) are closed, verified, and hardened.

- **Staging Database Project:** `rwedeejhjazwjthdjzrt` (`rwedeejhjazwjthdjzrt.supabase.co`)
- **Canonical Pilot Tenant:** `aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa` (Slug: `melis-guzellik`)
- **Database Parity:** 34/34 active migrations applied.
- **Direct-Write Database Hardening:** Active (browser `PATCH` / `POST` on appointments and change requests strictly revoked).

---

## 2. Deployment & Target Architecture

| Component | Target Verification Configuration |
|---|---|
| **Architecture Model** | Staging SPA Frontend + Staging Database (`rwedeejhjazwjthdjzrt`) |
| **Frontend Hosting** | SPA static bundle (`dist/` via Vite) |
| **Build Command** | `npm run build` |
| **SPA Fallback Rule** | All non-asset routes rewrite to `index.html` |
| **Routes** | `/book`, `/appointment/manage/:token`, `/admin`, `/admin/reschedule-requests` |
| **Deployment Owner** | Lead System Operator |
| **Rollback Owner** | Lead System Operator |

---

## 3. Manual Outbox Operational Workflow

Because `communication_outbox` operates without an automated dispatcher in Stage G, all notification rows remain in `status = 'queued'`.

### Operational Roles & SLA
- **Outbox Operator:** Support & Operations Lead
- **Queue Review Frequency:** Every 60 minutes during business hours (09:00–18:00 TRT).
- **Maximum Notification SLA:** 120 minutes from event creation.

### Outbox Query & Dispatch Procedure
1. **Query Queued Events:**
   ```sql
   SELECT id, tenant_id, recipient, channel, message, metadata, created_at
   FROM public.communication_outbox
   WHERE status = 'queued'
   ORDER BY created_at ASC;
   ```
2. **Dispatch Channel:** Manual WhatsApp / SMS dispatch to `recipient`.
3. **Record Completion:**
   Update status in outbox to `'sent'` or `'failed'` with timestamp:
   ```sql
   UPDATE public.communication_outbox
   SET status = 'sent', updated_at = now()
   WHERE id = '<OUTBOX_ROW_ID>';
   ```
4. **Deduplication Guard:** Filter by `(recipient, metadata->>'event_type', metadata->>'appointment_id')` to prevent double messaging.

---

## 4. Observability & Operational Schedule

| Monitoring Area | Frequency | Alert Threshold | Action Owner |
|---|---|---|---|
| **Public Booking Health** | Every 2 hours | >0 HTTP 5xx errors | System Operator |
| **Outbox Backlog** | Hourly | >10 queued rows (>2h old) | Support Lead |
| **Auth Failures** | Daily | >5 consecutive auth errors | System Operator |
| **Emergency Disable** | Immediate | Critical P0/P1 report | System Operator |

### Emergency Public Booking Disablement Procedure
If an operational emergency occurs, execute the RPC to disable public booking for the tenant:
```sql
UPDATE public.tenants
SET is_active = false
WHERE id = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';
```

---

## 5. Non-Destructive Backup & Restore Plan

- **Backup Type:** Supabase Automated Daily Database Snapshots & manual `pg_dump` export.
- **Retention:** 7 days.
- **Restore Destination:** Isolated restore database instance (never overwrite live staging project in-place).

---

## 6. Accepted P2 Risks & Mitigations

| Risk ID | Description | Severity | Pilot Mitigation | Owner |
|---|---|---|---|---|
| **P2-01** | Manual Outbox Notification Processing | P2 | Hourly queue review and manual WhatsApp dispatch per runbook. | Support Lead |
| **P2-02** | Absence of Automated Rate Limiting on Booking | P2 | Canonical tenant slug isolation; daily appointment audit; emergency `is_active` toggle. | System Operator |
| **P2-03** | Absence of Token Revocation API | P2 | Hashed tokens stored server-side; 30-day auto expiry; manage link kept client-side. | System Operator |
| **P2-04** | Manual Observability Monitoring | P2 | Scheduled manual check of frontend health and outbox backlog. | System Operator |

---

## 7. Explicit Governance Statements

1. **Payments Disabled:** Payments, checkout, subscriptions, and iyzico integration remain **DISABLED** (`VITE_PAYMENT_MODE=disabled`).
2. **Production Status:** Production remains **NO-GO**.
3. **Pilot Scope:** Paymentless limited pilot deployment for canonical pilot tenant (`melis-guzellik`) only.
