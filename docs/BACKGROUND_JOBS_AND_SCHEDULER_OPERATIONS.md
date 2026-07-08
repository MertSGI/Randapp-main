# LARİ Background Jobs & Scheduled Cron Operations Guide

This document defines the architecture, simulation mechanics, and production migration paths for LARİ's background jobs, periodic billings sweeps, communication outbox retries, and DNS custom domain verification scheduler.

---

## 1. System Overview & Simulation Model

To maintain maximum safety and compatibility during the pre-live phase, LARİ operates a **Local Background Job Simulator** implemented in `backgroundJobService.ts` and managed via the Super Admin Dashboard.

```
+------------------------------------+
|  Super Admin Scheduler Console     | <--- Trigger sweeps & custom jobs
+-----------------+------------------+
                  |
                  v
+-----------------+------------------+
|      backgroundJobService          | <--- Stores run history & states
+--------+------------------+---------+
         |                  |
         v                  v
+--------+--------+  +------+---------+
| Local sweeps on |  | communication  |
| Subscriptions   |  | outbox state   |
+-----------------+  +----------------+
```

### Local Simulation Mode (`local_simulation`)
* **State Store**: Persisted directly in browser `localStorage` under `lari_background_job_runs` so state is retained across views.
* **No External Ingress**: Runs safely on client browser runtime—never opens ports or accesses live remote chronos nodes.
* **Safety Rules**:
  * Emits simulated mail/outbox blocks rather than invoking actual delivery gateways (Resend / Netgsm / Meta).
  * Promotes trial expiration transitions within localStorage without pulling real credit card API calls.
  * Mutates DNS state representation internally without accessing web host control panels or domain registrars.

---

## 2. Canonical Job Inventory (13 Definitive Tasks)

LARİ registers **13 distinct, business-critical background sweeps** crucial for automated subscription billing, user retention, and server state integrity.

| Job Type Identifier | Recommended Schedule (Cron) | Human/Aesthetic Label | Impact / Side Effects | Safely Simulates Locally? |
|---|---|---|---|---|
| `subscription_trial_ending_sweep` | `0 9 * * *` | Deneme Süresi Sonu Taraması | Finds trialing plans ending in <= 3 days. Queues `trial_ending` email outbox event. | ✅ Yes |
| `subscription_trial_expiration_sweep` | `0 0 * * *` | Deneme Süresi Dolum Taraması | Converts expired trials to `expired` status & sends in-app notifications. | ✅ Yes |
| `subscription_past_due_sweep` | `0 2 * * *` | Ödeme Gecikmesi Taraması | Evaluates failing subscription payments, initiates dunning loops. | ✅ Yes (Console logs only) |
| `subscription_cancel_at_period_end_sweep` | `0 1 * * *` | Dönem Sonu İptal Taraması | Terminates plans marked with `cancelAtPeriodEnd === true` at currentPeriodEnd border. | ✅ Yes |
| `subscription_downgrade_at_period_end_sweep` | `0 1 * * *` | Dönem Sonu Paket Düşürme Taraması | Switches user plan to `scheduledPlanId`, updates billing bounds, checks limits. | ✅ Yes |
| `referral_credit_monthly_application` | `0 3 1 * *` | Aylık Referans Kredisi Uygulaması | Approves and deducts scheduled referral credits from monthly subscription totals. | ✅ Yes (Metadata logs) |
| `communication_outbox_retry_sweep` | `*/15 * * * *` | Outbox Hata Yenileme Taraması | Identifies `failed` events and cycles them back to `rendered` state if retryCount < 3. | ✅ Yes |
| `communication_failed_delivery_review` | `0 18 * * *` | Başarısız İleti Operatör İncelemesi | Summarizes permanent sender bounces or delivery failures for system operator audit. | ✅ Yes (Telemetry logs) |
| `custom_domain_verification_poll` | `*/30 * * * *` | Özel Alan Adı DNS Doğrulaması | Performs resolver check on pending custom domain queries (CNAME/A records status). | ✅ Yes |
| `self_service_token_expiry_sweep` | `0 5 * * *` | Kendi Kendine Hizmet Jetonu Temizliği | Sweeps and invalidates expired single-use appointment management link tokens. See [Self-Service Guide](BOOKING_SELF_SERVICE_AND_ABUSE_PREVENTION.md). | ✅ Yes |
| `booking_availability_refresh` | `0 4 * * *` | Randevu Rezervasyon Takvimi Tazeleme | Prunes past empty slots and updates rolling 30-day availability indices. | ✅ Yes (Console logs only) |
| `data_export_reminder` | `0 10 * * 0` | Veri Yedekleme Dışa Aktarım Hatırlatıcı | Triggers admin checklist reminders indicating long intervals since last tenant DB export. | ✅ Yes |
| `migration_snapshot_integrity_check` | `0 3 * * 6` | Gelişmiş Geçiş & Entegrasyon Kontrolü | Verifies schema alignment, client adapters, and RLS policy rules safety under-the-hood. | ✅ Yes (Telemetry verification) |
| `support_review_queue_digest` | `0 8 * * *` | Destek Talepleri Operatör Özeti | Generates notifications for tickets exceeding SLA timelines of 2 hours. | ✅ Yes (Internal log queue) |

---

## 3. Safe Execution Context & Security

To prevent operational accidents or compliance leaks, all background executors adhere to strict safety boundaries.

### Safe Execution Rules:
1. **Never mutate Production States without Active Super Admin Init**: In simulation runs, changes affect targeted local datasets.
2. **Never expose Background Logs to Standard Business Owners**: The scheduling page `/super-admin/scheduler` is explicitly restricted to `super_admin` role credentials. Standard salon merchants never see technical scheduler telemetry.
3. **Idempotency & Double-Run Safeties**:
   * All sweeps utilize strict target markers. For instance, `subscription_trial_ending_sweep` checks communication outbox logs for existing `trial_ending` alerts created in the last 24 hours. This prevents sending duplicate notifications if the scheduler runs multiple times on the same calendar day.
   * Period end sweeping checks `currentPeriodEnd <= DateTime.Now` specifically, and marks the job run ID in metadata to avoid looping duplicate invoice triggers.

---

## 4. Production Migration Paths (Future Cloud Deployment)

When LARİ is ready to go live publicly with real recurring scheduling, the local background job service will be mapped directly to serverless automation infrastructure.

### Option A: Supabase Scheduled Edge Functions (Recommended)
This approach leverages Supabase's native built-in pg_cron scheduler:
1. **Enable pg_cron extension** inside the database:
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_cron;
   ```
2. **Deploy Scheduled Edge Functions** (e.g., `trial-sweeper`, `outbox-retry`):
   ```bash
   supabase functions deploy trial-sweeper
   ```
3. **Map Cron Rules** directly to trigger the Edge HTTP endpoints periodically:
   ```sql
   SELECT cron.schedule('trial-completion-cron', '0 0 * * *', 'SELECT net.http_post(url:=''https://<proj>.supabase.co/functions/v1/trial-sweeper'', headers:=jsonb_build_object(''Authorization'', ''Bearer <service_key>''))');
   ```

### Option B: Traditional Server Cron
For standard node containers or dedicated backend environments:
1. Establish a Node scheduler package (e.g., `node-cron` or `agenda`).
2. Wrap the API boundaries as authenticated server execution handlers inside `server.ts`.
3. Block external triggers using a secure secret key header:
   ```ts
   if (req.headers['x-scheduler-secret'] !== process.env.SCHEDULER_SECRET) {
     return res.status(401).send('Unauthorized');
   }
   ```

---

## 5. Rollback, Troubleshooting, and Disable Strategy

If an automated job causes abnormal state cascades or loops:
* **Manual Emergency Disable**: Super Admins can instantly toggle specific job lines on/off.
* **Storage Wipe**: If a run state gets corrupted during local testing, clicking **"Reset Storage"** inside the Super Admin Diagnostic panel restores the initial system baseline instantly.
* **Logging**: Detailed failure reasons are stored on each `BackgroundJobRun` object, rendering full audit traces directly under the Super Admin history table.

---

## 6. Related Documents
* [Gözlemlenebilirlik, Audit ve Destek Operasyonları Kılavuzu](./OBSERVABILITY_AUDIT_AND_SUPPORT_OPERATIONS.md)
* [Destek Biletleri ve Incident Response Playbook](./SUPPORT_TICKET_AND_INCIDENT_RESPONSE.md)
* [Gözlemlenebilirlik Sağlayıcı Sözleşme Matrisi](./OBSERVABILITY_PROVIDER_CONTRACT_MATRIX.md)

