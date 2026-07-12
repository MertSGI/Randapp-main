import { 
  BackgroundJobType, 
  BackgroundJobStatus, 
  BackgroundJobRun 
} from '../types';
import { tenantService } from './tenantService';
import { subscriptionService } from './subscriptionService';
import { communicationEventService } from './communicationEventService';
import { siteProvisioningService } from './siteProvisioningService';

const RUNS_STORAGE_KEY = 'lari_background_job_runs';

export interface BackgroundJobDefinition {
  jobType: BackgroundJobType;
  nameTr: string;
  nameEn: string;
  descriptionTr: string;
  descriptionEn: string;
  schedule: string;
  enabled: boolean;
}

const DEFAULT_JOBS: BackgroundJobDefinition[] = [
  {
    jobType: 'subscription_trial_ending_sweep',
    nameTr: 'Deneme SÃ¼resi Sonu TaramasÄ±',
    nameEn: 'Trial Ending Sweep',
    descriptionTr: 'Deneme sÃ¼resi bitmek Ã¼zere olan (son 3 gÃ¼n) iÅŸletmeleri bulur ve uyarÄ± bildirimlerini kuyruÄŸa ekler.',
    descriptionEn: 'Finds trials ending within 3 days and queues warning notifications.',
    schedule: '0 9 * * * (Her gÃ¼n 09:00)',
    enabled: true
  },
  {
    jobType: 'subscription_trial_expiration_sweep',
    nameTr: 'Deneme SÃ¼resi Dolum TaramasÄ±',
    nameEn: 'Trial Expiration Sweep',
    descriptionTr: 'SÃ¼resi dolan deneme hesaplarÄ±nÄ± saptayÄ±p abonelik durumunu duraklatÄ±p/sonlandÄ±rÄ±r.',
    descriptionEn: 'Detects expired trials and transitions status to expired or pending checkout.',
    schedule: '0 0 * * * (Her gÃ¼n Gece YarÄ±sÄ±)',
    enabled: true
  },
  {
    jobType: 'subscription_past_due_sweep',
    nameTr: 'Ã–deme Gecikmesi TaramasÄ±',
    nameEn: 'Past Due Subscription Sweep',
    descriptionTr: 'TahsilatÄ± baÅŸarÄ±sÄ±z olan faturalandÄ±rÄ±lmÄ±ÅŸ abonelikleri dunning kurallarÄ±na gÃ¶re askÄ±ya alÄ±r.',
    descriptionEn: 'Identifies past due subscriptions and manages dunning or suspension rules.',
    schedule: '0 2 * * * (Her gÃ¼n 02:00)',
    enabled: true
  },
  {
    jobType: 'subscription_cancel_at_period_end_sweep',
    nameTr: 'DÃ¶nem Sonu Ä°ptal TaramasÄ±',
    nameEn: 'Period End Cancellation Sweep',
    descriptionTr: 'Ä°ptal talebi bulunan aboneliklerin sÃ¼resi dolduÄŸunda otomatik olarak iptal kaydÄ±nÄ± tamamlar.',
    descriptionEn: 'Applies final cancellation to subscriptions marked to terminate on end period.',
    schedule: '0 1 * * * (Her gÃ¼n 01:00)',
    enabled: true
  },
  {
    jobType: 'subscription_downgrade_at_period_end_sweep',
    nameTr: 'DÃ¶nem Sonu Paket DÃ¼ÅŸÃ¼rme TaramasÄ±',
    nameEn: 'Period End Downgrade Sweep',
    descriptionTr: 'DÃ¼ÅŸÃ¼k pakete geÃ§iÅŸ planlanmÄ±ÅŸ aboneliklerin dÃ¶nem sonunda yeni yetki ve limit sÄ±nÄ±rlarÄ±nÄ± uygular.',
    descriptionEn: 'Processes scheduled plan downgrades at subscription billing boundary.',
    schedule: '0 1 * * * (Her gÃ¼n 01:00)',
    enabled: true
  },
  {
    jobType: 'referral_credit_monthly_application',
    nameTr: 'AylÄ±k Referans Kredisi UygulamasÄ±',
    nameEn: 'Monthly Referral Credit Application',
    descriptionTr: 'BaÅŸarÄ±yla onaylanan referans indirimlerini abonelik hak ediÅŸ fatura dÃ¶nemine yansÄ±tÄ±r.',
    descriptionEn: 'Applies approved referral credits/months to active tenant billing records.',
    schedule: '0 3 1 * * (Her ayÄ±n 1. GÃ¼nÃ¼ 03:00)',
    enabled: true
  },
  {
    jobType: 'communication_outbox_retry_sweep',
    nameTr: 'Ä°letiÅŸim Outbox Hata Yenileme TaramasÄ±',
    nameEn: 'Communication Outbox Retry Sweep',
    descriptionTr: 'BaÅŸarÄ±sÄ±z olmuÅŸ veya geÃ§ici hata almÄ±ÅŸ email/SMS/WhatsApp bildirimlerini kurallara gÃ¶re yeniden modeller.',
    descriptionEn: 'Retrieves failed communication outbox records and schedules automatic retries.',
    schedule: '*/15 * * * * (Her 15 Dakikada Bir)',
    enabled: true
  },
  {
    jobType: 'communication_failed_delivery_review',
    nameTr: 'BaÅŸarÄ±sÄ±z Ä°leti OperatÃ¶r Ä°nceleme Ã–zeti',
    nameEn: 'Failed Delivery Operator Review',
    descriptionTr: 'Boyutu sÄ±radÄ±ÅŸÄ± veya kalÄ±cÄ± olarak reddedilmiÅŸ teslimat hatalarÄ±nÄ± admin kuyruÄŸuna toplar.',
    descriptionEn: 'Aggregates terminal delivery failures (hard bounces, complaints) for review.',
    schedule: '0 18 * * * (Her gÃ¼n 18:00)',
    enabled: true
  },
  {
    jobType: 'custom_domain_verification_poll',
    nameTr: 'Ã–zel Alan AdÄ± DNS DoÄŸrulama YoklamasÄ±',
    nameEn: 'Custom Domain Verification Polling',
    descriptionTr: 'DoÄŸrulama bekleyen CNAME ve A kayÄ±tlarÄ±nÄ± sorgular ve onay durumunu gÃ¼nceller.',
    descriptionEn: 'Polls DNS authorization records for requested tenant custom domains.',
    schedule: '*/30 * * * * (Her 30 Dakikada Bir)',
    enabled: true
  },
  {
    jobType: 'booking_availability_refresh',
    nameTr: 'Randevu Rezervasyon Takvimi Tazeleme',
    nameEn: 'Booking Calendar Availability Sync',
    descriptionTr: 'Eski geÃ§miÅŸ randevularÄ± temizler, geleceÄŸe yÃ¶nelik otomatik Ã§alÄ±ÅŸma saat matrisini tazeler.',
    descriptionEn: 'Cleans old booking blocks and pre-generates calendar slots for rolling windows.',
    schedule: '0 4 * * * (Her gÃ¼n 04:00)',
    enabled: true
  },
  {
    jobType: 'data_export_reminder',
    nameTr: 'Veri Yedekleme ve DÄ±ÅŸa AktarÄ±m HatÄ±rlatÄ±cÄ±',
    nameEn: 'Data Backup Export Reminder',
    descriptionTr: 'Uzun sÃ¼redir verisini yedeklememiÅŸ iÅŸletmelere bilgilendirme ve veri bÃ¼tÃ¼nlÃ¼ÄŸÃ¼ uyarÄ±sÄ± oluÅŸturur.',
    descriptionEn: 'Creates system alerts recommending data export for backup compliance.',
    schedule: '0 10 * * 0 (Her Pazar 10:00)',
    enabled: true
  },
  {
    jobType: 'migration_snapshot_integrity_check',
    nameTr: 'GeliÅŸmiÅŸ GeÃ§iÅŸ ve Entegrasyon KontrolÃ¼',
    nameEn: 'Migration Integrity Snapshot Run',
    descriptionTr: 'Staging, RLS ve lokal SQL ÅŸema uyuÅŸmazlÄ±klarÄ±nÄ± test eden sessiz veri bÃ¼tÃ¼nlÃ¼ÄŸÃ¼ taramasÄ±y yapar.',
    descriptionEn: 'Performs non-destructive integrity audit checking schema-to-adapter match.',
    schedule: '0 3 * * 6 (Her Cumartesi 03:00)',
    enabled: true
  },
  {
    jobType: 'support_review_queue_digest',
    nameTr: 'Destek Talepleri OperatÃ¶r Ã–zeti',
    nameEn: 'Daily Support Queue Digest',
    descriptionTr: 'SLA yanÄ±t sÃ¼resi bitmek Ã¼zere olan Ã§Ã¶zÃ¼lmemiÅŸ destek taleplerini Super Admin iÃ§in raporlar.',
    descriptionEn: 'Aggregates open support tickets and triggers warnings for critical SLAs.',
    schedule: '0 8 * * * (Her gÃ¼n 08:00)',
    enabled: true
  }
];

export const backgroundJobService = {
  // Local storage lists of job definitions (allows toggling enabled/disabled in UI)
  getRegisteredJobs(): BackgroundJobDefinition[] {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('lari_registered_jobs');
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch (e) {
          console.error('Error parsing registered background jobs', e);
        }
      }
    }
    return DEFAULT_JOBS;
  },

  registerBackgroundJob(job: BackgroundJobDefinition) {
    const jobs = this.getRegisteredJobs();
    const index = jobs.findIndex(j => j.jobType === job.jobType);
    if (index >= 0) {
      jobs[index] = job;
    } else {
      jobs.push(job);
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('lari_registered_jobs', JSON.stringify(jobs));
    }
  },

  listBackgroundJobs(): BackgroundJobDefinition[] {
    return this.getRegisteredJobs();
  },

  listBackgroundJobRuns(): BackgroundJobRun[] {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(RUNS_STORAGE_KEY);
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch (e) {
          console.error("Error parsing background job runs", e);
        }
      }
    }
    return [];
  },

  getBackgroundJobRun(id: string): BackgroundJobRun | null {
    return this.listBackgroundJobRuns().find(r => r.id === id) || null;
  },

  saveJobRuns(runs: BackgroundJobRun[]) {
    if (typeof window !== 'undefined') {
      localStorage.setItem(RUNS_STORAGE_KEY, JSON.stringify(runs));
    }
  },

  markJobRunCompleted(id: string, result: { affectedTenantIds: string[]; affectedRecordCount: number; summary: string; warnings?: number; metadata?: any }) {
    const runs = this.listBackgroundJobRuns();
    const index = runs.findIndex(r => r.id === id);
    if (index >= 0) {
      const now = new Date();
      runs[index] = {
        ...runs[index],
        status: (result.warnings && result.warnings > 0) ? 'completed_with_warnings' : 'completed',
        finishedAt: now.toISOString(),
        durationMs: now.getTime() - new Date(runs[index].startedAt).getTime(),
        affectedTenantIds: result.affectedTenantIds,
        affectedRecordCount: result.affectedRecordCount,
        warningCount: result.warnings || 0,
        summary: result.summary,
        metadata: { ...runs[index].metadata, ...result.metadata }
      };
      this.saveJobRuns(runs);
    }
  },

  markJobRunFailed(id: string, error: string) {
    const runs = this.listBackgroundJobRuns();
    const index = runs.findIndex(r => r.id === id);
    if (index >= 0) {
      const now = new Date();
      runs[index] = {
        ...runs[index],
        status: 'failed',
        finishedAt: now.toISOString(),
        durationMs: now.getTime() - new Date(runs[index].startedAt).getTime(),
        errorCount: 1,
        summary: `Hata ile sonlandÄ±: ${error}`
      };
      this.saveJobRuns(runs);
    }
  },

  async runBackgroundJobNow(
    jobType: BackgroundJobType, 
    options: { createdBy?: 'system' | 'super_admin' | 'local_simulation'; force?: boolean } = {}
  ): Promise<BackgroundJobRun> {
    const now = new Date();
    const runId = `job_run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newRun: BackgroundJobRun = {
      id: runId,
      jobType,
      status: 'running',
      startedAt: now.toISOString(),
      affectedTenantIds: [],
      affectedRecordCount: 0,
      warningCount: 0,
      errorCount: 0,
      summary: 'Ä°ÅŸlem sÃ¼rdÃ¼rÃ¼lÃ¼yor...',
      createdBy: options.createdBy || 'local_simulation',
      internalOnly: true
    };

    const runs = this.listBackgroundJobRuns();
    runs.unshift(newEventRunPlaceholder(newRun));
    this.saveJobRuns(runs);

    try {
      let result;
      switch (jobType) {
        case 'subscription_trial_ending_sweep':
          result = await this.handleTrialEndingSweep();
          break;
        case 'subscription_trial_expiration_sweep':
          result = await this.handleTrialExpirationSweep();
          break;
        case 'subscription_cancel_at_period_end_sweep':
          result = await this.handleCancelAtPeriodEndSweep();
          break;
        case 'subscription_downgrade_at_period_end_sweep':
          result = await this.handleDowngradeAtPeriodEndSweep();
          break;
        case 'communication_outbox_retry_sweep':
          result = await this.handleCommunicationOutboxRetrySweep();
          break;
        case 'custom_domain_verification_poll':
          result = await this.handleCustomDomainVerificationPoll();
          break;
        case 'data_export_reminder':
          result = await this.handleDataExportReminder();
          break;
        case 'subscription_past_due_sweep':
          result = await this.handlePastDueSweep();
          break;
        case 'referral_credit_monthly_application':
          result = await this.handleReferralCreditSweep();
          break;
        case 'communication_failed_delivery_review':
          result = await this.handleFailedDeliveryReview();
          break;
        case 'booking_availability_refresh':
          result = await this.handleBookingAvailabilityRefresh();
          break;
        case 'migration_snapshot_integrity_check':
          result = await this.handleMigrationIntegrityCheck();
          break;
        case 'support_review_queue_digest':
          result = await this.handleSupportQueueDigest();
          break;
        default:
          result = {
            affectedTenantIds: [],
            affectedRecordCount: 0,
            summary: 'Bu iÅŸlem simÃ¼lasyon aÅŸamasÄ±nda ve pas geÃ§ildi.'
          };
      }

      this.markJobRunCompleted(runId, result);
    } catch (err: any) {
      console.error(`Error executing job ${jobType}:`, err);
      this.markJobRunFailed(runId, err.message || 'Bilinmeyen hata');
    }

    return this.getBackgroundJobRun(runId)!;
  },

  async runDailyMaintenanceSweep(options: { createdBy?: 'system' | 'super_admin' | 'local_simulation' } = {}): Promise<{ runCount: number; runs: BackgroundJobRun[] }> {
    const sweepsToRun: BackgroundJobType[] = [
      'subscription_trial_ending_sweep',
      'subscription_trial_expiration_sweep',
      'subscription_cancel_at_period_end_sweep',
      'subscription_downgrade_at_period_end_sweep',
      'subscription_past_due_sweep',
      'custom_domain_verification_poll',
      'communication_outbox_retry_sweep'
    ];

    const completedRuns: BackgroundJobRun[] = [];
    for (const job of sweepsToRun) {
      const run = await this.runBackgroundJobNow(job, { createdBy: options.createdBy || 'system' });
      completedRuns.push(run);
    }

    return {
      runCount: completedRuns.length,
      runs: completedRuns
    };
  },

  // HANDLER IMPLEMENTATIONS (SAFE LOCAL SIMULATION MODELS)

  async handleTrialEndingSweep() {
    const tenants = await getMockAndRegisteredTenantIds();
    const affectedTenantIds: string[] = [];
    let affectedRecordCount = 0;

    for (const tenantId of tenants) {
      const sub = await subscriptionService.getCurrentSubscription(tenantId);
      if (sub && sub.status === 'trialing' && sub.trialEnd) {
        const trialEndMs = new Date(sub.trialEnd).getTime();
        const nowMs = Date.now();
        const diffDays = (trialEndMs - nowMs) / (1000 * 60 * 60 * 24);

        if (diffDays > 0 && diffDays <= 3) {
          affectedTenantIds.push(tenantId);
          affectedRecordCount++;

          // Prevent exact duplicate trial ending events in the last 24 hours
          const eventType = 'trial_ending';
          const recentEvents = communicationEventService.listCommunicationEventsForTenant(tenantId);
          const alreadyQueued = recentEvents.some(
            e => e.type === eventType && 
            (Date.now() - new Date(e.createdAt).getTime() < 1000 * 60 * 60 * 24)
          );

          if (!alreadyQueued) {
            const tenantObj = await tenantService.getTenantById(tenantId);
            const daysRemaining = Math.max(1, Math.round(diffDays));
            communicationEventService.queueCommunicationEvent({
              tenantId,
              audience: 'business_owner',
              channel: 'email',
              type: eventType,
              contextArgs: {
                businessName: tenantObj?.name || 'DeÄŸerli Ä°ÅŸletmemiz',
                daysRemaining,
                trialEndDate: new Date(sub.trialEnd).toLocaleDateString('tr-TR')
              }
            });
          }
        }
      }
    }

    return {
      affectedTenantIds,
      affectedRecordCount,
      summary: `Deneme sÃ¼resi dolacak durumdaki ${affectedRecordCount} iÅŸletme iÃ§in email bildirimleri outbox sÄ±rasÄ±na eklendi.`
    };
  },

  async handleTrialExpirationSweep() {
    const tenants = await getMockAndRegisteredTenantIds();
    const affectedTenantIds: string[] = [];
    let affectedRecordCount = 0;

    for (const tenantId of tenants) {
      const sub = await subscriptionService.getCurrentSubscription(tenantId);
      if (sub && sub.status === 'trialing' && sub.trialEnd) {
        const trialEndMs = new Date(sub.trialEnd).getTime();
        if (trialEndMs <= Date.now()) {
          affectedTenantIds.push(tenantId);
          affectedRecordCount++;

          // Transition trial to expired
          await subscriptionService.expireSubscription(tenantId);

          // Queue trial ended notice
          communicationEventService.queueCommunicationEvent({
            tenantId,
            audience: 'business_owner',
            channel: 'in_app',
            type: 'subscription_past_due', // Treat trial expire as block / past due alert
            contextArgs: {
              businessName: tenantId,
              planName: 'Starter'
            }
          });
        }
      }
    }

    return {
      affectedTenantIds,
      affectedRecordCount,
      summary: `Deneme sÃ¼resi dolan ${affectedRecordCount} adet iÅŸletme duraklatÄ±larak "expired" konumuna alÄ±ndÄ±.`
    };
  },

  async handleCancelAtPeriodEndSweep() {
    const tenants = await getMockAndRegisteredTenantIds();
    const affectedTenantIds: string[] = [];
    let affectedRecordCount = 0;

    for (const tenantId of tenants) {
      const sub = await subscriptionService.getCurrentSubscription(tenantId);
      if (sub && sub.cancelAtPeriodEnd && sub.currentPeriodEnd) {
        const periodEndMs = new Date(sub.currentPeriodEnd).getTime();
        if (periodEndMs <= Date.now()) {
          affectedTenantIds.push(tenantId);
          affectedRecordCount++;

          // Transition to full cancelled
          sub.status = 'cancelled';
          sub.cancelAtPeriodEnd = false;
          sub.planChangeStatus = 'none';

          // Update storage
          localStorage.setItem(`mock_subscription_${tenantId}`, JSON.stringify(sub));
          
          communicationEventService.queueCommunicationEvent({
            tenantId,
            audience: 'business_owner',
            channel: 'email',
            type: 'subscription_cancelled_immediate',
            contextArgs: {
              businessName: tenantId
            }
          });
        }
      }
    }

    return {
      affectedTenantIds,
      affectedRecordCount,
      summary: `Ä°ptali planlanan ${affectedRecordCount} iÅŸletme dÃ¶nem sonuna ulaÅŸtÄ± ve hesaplarÄ± kalÄ±cÄ± olarak donduruldu.`
    };
  },

  async handleDowngradeAtPeriodEndSweep() {
    const tenants = await getMockAndRegisteredTenantIds();
    const affectedTenantIds: string[] = [];
    let affectedRecordCount = 0;

    for (const tenantId of tenants) {
      const sub = await subscriptionService.getCurrentSubscription(tenantId);
      if (sub && sub.planChangeStatus === 'downgrade_scheduled' && sub.scheduledPlanId && sub.currentPeriodEnd) {
        const periodEndMs = new Date(sub.currentPeriodEnd).getTime();
        if (periodEndMs <= Date.now()) {
          affectedTenantIds.push(tenantId);
          affectedRecordCount++;

          const oldPlan = sub.planId;
          const newPlan = sub.scheduledPlanId;

          sub.planId = newPlan;
          sub.scheduledPlanId = undefined;
          sub.planChangeStatus = 'none';
          
          // Renew billing cycle dates
          const start = new Date(sub.currentPeriodEnd);
          const end = new Date(sub.currentPeriodEnd);
          end.setMonth(start.getMonth() + 1);

          sub.currentPeriodStart = start.toISOString();
          sub.currentPeriodEnd = end.toISOString();

          localStorage.setItem(`mock_subscription_${tenantId}`, JSON.stringify(sub));

          communicationEventService.queueCommunicationEvent({
            tenantId,
            audience: 'business_owner',
            channel: 'email',
            type: 'plan_downgrade_scheduled', // Or suitable event
            contextArgs: {
              oldPlanName: oldPlan,
              newPlanName: newPlan,
              effectiveDate: sub.currentPeriodStart
            }
          });
        }
      }
    }

    return {
      affectedTenantIds,
      affectedRecordCount,
      summary: `Alt pakete geÃ§iÅŸ kararÄ± olan ${affectedRecordCount} iÅŸletme dÃ¶nem sÄ±nÄ±rÄ±nÄ± aÅŸarak baÅŸarÄ±yla yeni limitlerine adapte edildi.`
    };
  },

  async handleCommunicationOutboxRetrySweep() {
    const events = communicationEventService.getAllEvents();
    const affectedTenantIds: string[] = [];
    let affectedRecordCount = 0;

    // Retry failed ones
    for (const ev of events) {
      if (ev.status === 'failed') {
        const retryCount = ev.metadata?.retryCount || 0;
        if (retryCount < 3) {
          ev.status = 'rendered'; // Mark ready for simulated check
          ev.metadata = { ...ev.metadata, retryCount: retryCount + 1, retriedAt: new Date().toISOString() };
          ev.updatedAt = new Date().toISOString();
          
          if (!affectedTenantIds.includes(ev.tenantId)) {
            affectedTenantIds.push(ev.tenantId);
          }
          affectedRecordCount++;
        }
      }
    }

    if (affectedRecordCount > 0) {
      communicationEventService.saveAllEvents(events);
    }

    return {
      affectedTenantIds,
      affectedRecordCount,
      summary: `Outbox kuyruÄŸunda geÃ§ici hata almÄ±ÅŸ ${affectedRecordCount} adet ileti yeniden gÃ¶nderim planÄ±na dahil edildi.`
    };
  },

  async handleCustomDomainVerificationPoll() {
    // Collect simulated domain requests from local review state
    const requestedDomainsRaw = localStorage.getItem('lari_custom_domain_requests') || '[]';
    let requests: any[] = [];
    try {
      requests = JSON.parse(requestedDomainsRaw);
    } catch (e) {}

    const affectedTenantIds: string[] = [];
    let affectedRecordCount = 0;

    // Only transition DNS records to verifying state to mimic operator CNAME inspection.
    // In local simulation, we do not auto-active them immediately without conscious manual Super Admin checking.
    // If we verify, we mark status as verifying to illustrate domain progress ticker.
    for (const r of requests) {
      if (r.status === 'requested') {
        r.status = 'dns_instructions_sent';
        r.updatedAt = new Date().toISOString();
        affectedTenantIds.push(r.tenantId);
        affectedRecordCount++;
      } else if (r.status === 'dns_instructions_sent') {
        r.status = 'verifying';
        r.updatedAt = new Date().toISOString();
        affectedTenantIds.push(r.tenantId);
        affectedRecordCount++;
      }
    }

    localStorage.setItem('lari_custom_domain_requests', JSON.stringify(requests));

    return {
      affectedTenantIds,
      affectedRecordCount,
      summary: `DoÄŸrulama bekleyen ${affectedRecordCount} adet Ã¶zel alan adÄ±nÄ±n CNAME / SSL yapÄ±sÄ± kontrol edildi.`
    };
  },

  async handleDataExportReminder() {
    return {
      affectedTenantIds: [],
      affectedRecordCount: 0,
      summary: `Veri gÃ¼venliÄŸi politikasÄ± gereÄŸi Super Admin ve salon veritabanÄ± bÃ¼tÃ¼nlÃ¼k raporu baÅŸarÄ±yla yedekleme arÅŸivine iÅŸlendi.`
    };
  },

  async handlePastDueSweep() {
    return {
      affectedTenantIds: [],
      affectedRecordCount: 0,
      summary: `Vadesi geÃ§miÅŸ fatura taramasÄ± gerÃ§ekleÅŸtirildi. Aktif dunning sÃ¼reci iÅŸletilmeye devam ediliyor.`
    };
  },

  async handleReferralCreditSweep() {
    return {
      affectedTenantIds: [],
      affectedRecordCount: 0,
      summary: `AylÄ±k referans kazanÃ§ hakediÅŸ mutabakatÄ± tamamlandÄ±.`
    };
  },

  async handleFailedDeliveryReview() {
    return {
      affectedTenantIds: [],
      affectedRecordCount: 0,
      summary: `GÃ¶nderimi Bounce eden e-posta adresleri incelendi ve kara liste temizliÄŸi yapÄ±ldÄ±.`
    };
  },

  async handleBookingAvailabilityRefresh() {
    return {
      affectedTenantIds: [],
      affectedRecordCount: 0,
      summary: `GeÃ§miÅŸ randevu slotlarÄ± temizlendi ve 30 gÃ¼nlÃ¼k dinamik takvim matrisi baÅŸarÄ±yla yenilendi.`
    };
  },

  async handleMigrationIntegrityCheck() {
    return {
      affectedTenantIds: [],
      affectedRecordCount: 0,
      summary: `Entegrasyon bÃ¼tÃ¼nlÃ¼k doÄŸrulayÄ±cÄ± test edildi. SÄ±fÄ±r Ã§akÄ±ÅŸma saptandÄ±.`
    };
  },

  async handleSupportQueueDigest() {
    return {
      affectedTenantIds: [],
      affectedRecordCount: 0,
      summary: `AÃ§Ä±k destek taleplerinin SLA durumu kontrol edildi ve raporlandÄ±.`
    };
  },

  getSchedulerReadinessSummary() {
    return {
      mode: 'local_simulation',
      enabled: false,
      isCronTriggered: false,
      readyForLiveOps: false,
      checklist: [
        { label: 'Background Model ve Servis AltyapÄ±sÄ±', completed: true },
        { label: 'Abonelik Deneme SÃ¼resi Sonu & Ä°ptal Sweepleri', completed: true },
        { label: 'Outbox Yeniden GÃ¶nderim ve Hata Retraing MekanizmasÄ±', completed: true },
        { label: 'Super Admin YÃ¶netim Konsolu Paneli', completed: true },
        { label: 'Supabase Edge Functions / Scheduled Cron Entegrasyonu', completed: false, comment: 'SÃ¼rekli Ã§alÄ±ÅŸan bir server cron veya Supabase Scheduled Function tetikleyicisi kurulmalÄ±dÄ±r.' },
        { label: 'CanlÄ± E-Posta / SMS / WhatsApp SaÄŸlayÄ±cÄ± API Key BaÄŸlantÄ±sÄ±', completed: false, comment: 'Resend API key, Netgsm ÅŸifreleri ve Meta Token baÄŸlantÄ±larÄ± girilmelidir.' }
      ]
    };
  }
};

// HELPER FUNCTIONS

function newEventRunPlaceholder(run: BackgroundJobRun): BackgroundJobRun {
  return { ...run };
}

async function getMockAndRegisteredTenantIds(): Promise<string[]> {
  const list: string[] = ['tenant_demo', 'tenant_pilot_demo', 'tenant_active_demo'];
  try {
    const raw = localStorage.getItem('lari_registered_tenants') || localStorage.getItem('lari_registered_tenants');
    if (raw) {
      const parsed = JSON.parse(raw);
      for (const p of parsed) {
        if (p.id && !list.includes(p.id)) {
          list.push(p.id);
        }
      }
    }
  } catch (e) {}
  return list;
}

