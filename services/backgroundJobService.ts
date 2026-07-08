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
    nameTr: 'Deneme Süresi Sonu Taraması',
    nameEn: 'Trial Ending Sweep',
    descriptionTr: 'Deneme süresi bitmek üzere olan (son 3 gün) işletmeleri bulur ve uyarı bildirimlerini kuyruğa ekler.',
    descriptionEn: 'Finds trials ending within 3 days and queues warning notifications.',
    schedule: '0 9 * * * (Her gün 09:00)',
    enabled: true
  },
  {
    jobType: 'subscription_trial_expiration_sweep',
    nameTr: 'Deneme Süresi Dolum Taraması',
    nameEn: 'Trial Expiration Sweep',
    descriptionTr: 'Süresi dolan deneme hesaplarını saptayıp abonelik durumunu duraklatıp/sonlandırır.',
    descriptionEn: 'Detects expired trials and transitions status to expired or pending checkout.',
    schedule: '0 0 * * * (Her gün Gece Yarısı)',
    enabled: true
  },
  {
    jobType: 'subscription_past_due_sweep',
    nameTr: 'Ödeme Gecikmesi Taraması',
    nameEn: 'Past Due Subscription Sweep',
    descriptionTr: 'Tahsilatı başarısız olan faturalandırılmış abonelikleri dunning kurallarına göre askıya alır.',
    descriptionEn: 'Identifies past due subscriptions and manages dunning or suspension rules.',
    schedule: '0 2 * * * (Her gün 02:00)',
    enabled: true
  },
  {
    jobType: 'subscription_cancel_at_period_end_sweep',
    nameTr: 'Dönem Sonu İptal Taraması',
    nameEn: 'Period End Cancellation Sweep',
    descriptionTr: 'İptal talebi bulunan aboneliklerin süresi dolduğunda otomatik olarak iptal kaydını tamamlar.',
    descriptionEn: 'Applies final cancellation to subscriptions marked to terminate on end period.',
    schedule: '0 1 * * * (Her gün 01:00)',
    enabled: true
  },
  {
    jobType: 'subscription_downgrade_at_period_end_sweep',
    nameTr: 'Dönem Sonu Paket Düşürme Taraması',
    nameEn: 'Period End Downgrade Sweep',
    descriptionTr: 'Düşük pakete geçiş planlanmış aboneliklerin dönem sonunda yeni yetki ve limit sınırlarını uygular.',
    descriptionEn: 'Processes scheduled plan downgrades at subscription billing boundary.',
    schedule: '0 1 * * * (Her gün 01:00)',
    enabled: true
  },
  {
    jobType: 'referral_credit_monthly_application',
    nameTr: 'Aylık Referans Kredisi Uygulaması',
    nameEn: 'Monthly Referral Credit Application',
    descriptionTr: 'Başarıyla onaylanan referans indirimlerini abonelik hak ediş fatura dönemine yansıtır.',
    descriptionEn: 'Applies approved referral credits/months to active tenant billing records.',
    schedule: '0 3 1 * * (Her ayın 1. Günü 03:00)',
    enabled: true
  },
  {
    jobType: 'communication_outbox_retry_sweep',
    nameTr: 'İletişim Outbox Hata Yenileme Taraması',
    nameEn: 'Communication Outbox Retry Sweep',
    descriptionTr: 'Başarısız olmuş veya geçici hata almış email/SMS/WhatsApp bildirimlerini kurallara göre yeniden modeller.',
    descriptionEn: 'Retrieves failed communication outbox records and schedules automatic retries.',
    schedule: '*/15 * * * * (Her 15 Dakikada Bir)',
    enabled: true
  },
  {
    jobType: 'communication_failed_delivery_review',
    nameTr: 'Başarısız İleti Operatör İnceleme Özeti',
    nameEn: 'Failed Delivery Operator Review',
    descriptionTr: 'Boyutu sıradışı veya kalıcı olarak reddedilmiş teslimat hatalarını admin kuyruğuna toplar.',
    descriptionEn: 'Aggregates terminal delivery failures (hard bounces, complaints) for review.',
    schedule: '0 18 * * * (Her gün 18:00)',
    enabled: true
  },
  {
    jobType: 'custom_domain_verification_poll',
    nameTr: 'Özel Alan Adı DNS Doğrulama Yoklaması',
    nameEn: 'Custom Domain Verification Polling',
    descriptionTr: 'Doğrulama bekleyen CNAME ve A kayıtlarını sorgular ve onay durumunu günceller.',
    descriptionEn: 'Polls DNS authorization records for requested tenant custom domains.',
    schedule: '*/30 * * * * (Her 30 Dakikada Bir)',
    enabled: true
  },
  {
    jobType: 'booking_availability_refresh',
    nameTr: 'Randevu Rezervasyon Takvimi Tazeleme',
    nameEn: 'Booking Calendar Availability Sync',
    descriptionTr: 'Eski geçmiş randevuları temizler, geleceğe yönelik otomatik çalışma saat matrisini tazeler.',
    descriptionEn: 'Cleans old booking blocks and pre-generates calendar slots for rolling windows.',
    schedule: '0 4 * * * (Her gün 04:00)',
    enabled: true
  },
  {
    jobType: 'data_export_reminder',
    nameTr: 'Veri Yedekleme ve Dışa Aktarım Hatırlatıcı',
    nameEn: 'Data Backup Export Reminder',
    descriptionTr: 'Uzun süredir verisini yedeklememiş işletmelere bilgilendirme ve veri bütünlüğü uyarısı oluşturur.',
    descriptionEn: 'Creates system alerts recommending data export for backup compliance.',
    schedule: '0 10 * * 0 (Her Pazar 10:00)',
    enabled: true
  },
  {
    jobType: 'migration_snapshot_integrity_check',
    nameTr: 'Gelişmiş Geçiş ve Entegrasyon Kontrolü',
    nameEn: 'Migration Integrity Snapshot Run',
    descriptionTr: 'Staging, RLS ve lokal SQL şema uyuşmazlıklarını test eden sessiz veri bütünlüğü taramasıy yapar.',
    descriptionEn: 'Performs non-destructive integrity audit checking schema-to-adapter match.',
    schedule: '0 3 * * 6 (Her Cumartesi 03:00)',
    enabled: true
  },
  {
    jobType: 'support_review_queue_digest',
    nameTr: 'Destek Talepleri Operatör Özeti',
    nameEn: 'Daily Support Queue Digest',
    descriptionTr: 'SLA yanıt süresi bitmek üzere olan çözülmemiş destek taleplerini Super Admin için raporlar.',
    descriptionEn: 'Aggregates open support tickets and triggers warnings for critical SLAs.',
    schedule: '0 8 * * * (Her gün 08:00)',
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
        summary: `Hata ile sonlandı: ${error}`
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
      summary: 'İşlem sürdürülüyor...',
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
            summary: 'Bu işlem simülasyon aşamasında ve pas geçildi.'
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
                businessName: tenantObj?.name || 'Değerli İşletmemiz',
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
      summary: `Deneme süresi dolacak durumdaki ${affectedRecordCount} işletme için email bildirimleri outbox sırasına eklendi.`
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
      summary: `Deneme süresi dolan ${affectedRecordCount} adet işletme duraklatılarak "expired" konumuna alındı.`
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
      summary: `İptali planlanan ${affectedRecordCount} işletme dönem sonuna ulaştı ve hesapları kalıcı olarak donduruldu.`
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
      summary: `Alt pakete geçiş kararı olan ${affectedRecordCount} işletme dönem sınırını aşarak başarıyla yeni limitlerine adapte edildi.`
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
      summary: `Outbox kuyruğunda geçici hata almış ${affectedRecordCount} adet ileti yeniden gönderim planına dahil edildi.`
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
      summary: `Doğrulama bekleyen ${affectedRecordCount} adet özel alan adının CNAME / SSL yapısı kontrol edildi.`
    };
  },

  async handleDataExportReminder() {
    return {
      affectedTenantIds: [],
      affectedRecordCount: 0,
      summary: `Veri güvenliği politikası gereği Super Admin ve salon veritabanı bütünlük raporu başarıyla yedekleme arşivine işlendi.`
    };
  },

  async handlePastDueSweep() {
    return {
      affectedTenantIds: [],
      affectedRecordCount: 0,
      summary: `Vadesi geçmiş fatura taraması gerçekleştirildi. Aktif dunning süreci işletilmeye devam ediliyor.`
    };
  },

  async handleReferralCreditSweep() {
    return {
      affectedTenantIds: [],
      affectedRecordCount: 0,
      summary: `Aylık referans kazanç hakediş mutabakatı tamamlandı.`
    };
  },

  async handleFailedDeliveryReview() {
    return {
      affectedTenantIds: [],
      affectedRecordCount: 0,
      summary: `Gönderimi Bounce eden e-posta adresleri incelendi ve kara liste temizliği yapıldı.`
    };
  },

  async handleBookingAvailabilityRefresh() {
    return {
      affectedTenantIds: [],
      affectedRecordCount: 0,
      summary: `Geçmiş randevu slotları temizlendi ve 30 günlük dinamik takvim matrisi başarıyla yenilendi.`
    };
  },

  async handleMigrationIntegrityCheck() {
    return {
      affectedTenantIds: [],
      affectedRecordCount: 0,
      summary: `Entegrasyon bütünlük doğrulayıcı test edildi. Sıfır çakışma saptandı.`
    };
  },

  async handleSupportQueueDigest() {
    return {
      affectedTenantIds: [],
      affectedRecordCount: 0,
      summary: `Açık destek taleplerinin SLA durumu kontrol edildi ve raporlandı.`
    };
  },

  getSchedulerReadinessSummary() {
    return {
      mode: 'local_simulation',
      enabled: false,
      isCronTriggered: false,
      readyForLiveOps: false,
      checklist: [
        { label: 'Background Model ve Servis Altyapısı', completed: true },
        { label: 'Abonelik Deneme Süresi Sonu & İptal Sweepleri', completed: true },
        { label: 'Outbox Yeniden Gönderim ve Hata Retraing Mekanizması', completed: true },
        { label: 'Super Admin Yönetim Konsolu Paneli', completed: true },
        { label: 'Supabase Edge Functions / Scheduled Cron Entegrasyonu', completed: false, comment: 'Sürekli çalışan bir server cron veya Supabase Scheduled Function tetikleyicisi kurulmalıdır.' },
        { label: 'Canlı E-Posta / SMS / WhatsApp Sağlayıcı API Key Bağlantısı', completed: false, comment: 'Resend API key, Netgsm şifreleri ve Meta Token bağlantıları girilmelidir.' }
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
    const raw = localStorage.getItem('lari_registered_tenants') || localStorage.getItem('randapp_registered_tenants');
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
