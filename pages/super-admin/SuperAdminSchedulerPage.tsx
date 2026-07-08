import React, { useState, useEffect } from 'react';
import { backgroundJobService, BackgroundJobDefinition } from '../../services/backgroundJobService';
import { BackgroundJobRun, BackgroundJobType } from '../../types';
import { useLanguage } from '../../contexts/LanguageContext';
import { translations } from '../../utils/translations';
import { useDialog } from '../../contexts/DialogContext';
import { 
  Play, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Info, 
  Settings, 
  Database,
  ArrowRight,
  ShieldCheck,
  Zap
} from 'lucide-react';

const SuperAdminSchedulerPage: React.FC = () => {
  const { language } = useLanguage();
  const trl = translations[language];
  const { alert: showAlert, confirm: showConfirm } = useDialog();

  const [jobs, setJobs] = useState<BackgroundJobDefinition[]>([]);
  const [runs, setRuns] = useState<BackgroundJobRun[]>([]);
  const [readiness, setReadiness] = useState<any>(null);
  const [runningJob, setRunningJob] = useState<string | null>(null);
  const [sweeping, setSweeping] = useState(false);

  const loadData = () => {
    const list = backgroundJobService.listBackgroundJobs();
    const history = backgroundJobService.listBackgroundJobRuns();
    const summary = backgroundJobService.getSchedulerReadinessSummary();
    setJobs(list);
    setRuns(history);
    setReadiness(summary);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRunNow = async (jobType: BackgroundJobType, jobName: string) => {
    const confirmed = await showConfirm({
      title: 'İşlemi Onaylıyor musunuz?',
      message: `"${jobName}" görevini yerel simülasyon modunda hemen tetiklemek istiyor musunuz? Bu işlem gerçek veri tabanında durum geçişleri ve outbox kayıtları üretebilir ancak dış sağlayıcılara istek göndermez.`
    });

    if (!confirmed) return;

    setRunningJob(jobType);
    try {
      const run = await backgroundJobService.runBackgroundJobNow(jobType, { createdBy: 'super_admin' });
      await showAlert(`Görev tamamlandı. Etkilenen kayıt sayısı: ${run.affectedRecordCount}. Durum: ${run.status}`);
      loadData();
    } catch (e: any) {
      await showAlert(`Hata: ${e.message || 'Görev yürütülemedi'}`);
    } finally {
      setRunningJob(null);
    }
  };

  const handleRunDailyMaintenance = async () => {
    const confirmed = await showConfirm({
      title: 'Bakım Sweep Tetiklensin mi?',
      message: 'Günlük periyodik sırayla çalışan tüm abonelik, deneme, dönem sonu iptal ve outbox sweep görevlerini sırayla yürütmek istiyor musunuz?'
    });

    if (!confirmed) return;

    setSweeping(true);
    try {
      const result = await backgroundJobService.runDailyMaintenanceSweep({ createdBy: 'super_admin' });
      await showAlert(`Günlük bakım sweepleri başarıyla tamamlandı. Toplam ${result.runCount} adet alt görev tetiklendi.`);
      loadData();
    } catch (e: any) {
      await showAlert(`Hata: ${e.message || 'Bakım görevleri yürütülemedi'}`);
    } finally {
      setSweeping(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <span className="flex items-center gap-1 text-xs font-bold text-green-700 bg-green-50 dark:bg-green-950/20 dark:text-green-400 px-2.5 py-1 rounded-full border border-green-200 dark:border-green-800">
            <CheckCircle className="w-3.5 h-3.5 text-green-600" /> Bitti
          </span>
        );
      case 'completed_with_warnings':
        return (
          <span className="flex items-center gap-1 text-xs font-bold text-yellow-700 bg-yellow-50 dark:bg-yellow-950/20 dark:text-yellow-400 px-2.5 py-1 rounded-full border border-yellow-200 dark:border-yellow-800">
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-600" /> Uyarı Var
          </span>
        );
      case 'failed':
        return (
          <span className="flex items-center gap-1 text-xs font-bold text-red-700 bg-red-50 dark:bg-red-950/20 dark:text-red-400 px-2.5 py-1 rounded-full border border-red-200 dark:border-red-800">
            <XCircle className="w-3.5 h-3.5 text-red-600" /> Başarısız
          </span>
        );
      case 'running':
        return (
          <span className="flex items-center gap-1 text-xs font-bold text-blue-700 bg-blue-50 dark:bg-blue-950/20 dark:text-blue-400 px-2.5 py-1 rounded-full border border-blue-200 dark:border-blue-800 animate-pulse">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" /> Çalışıyor
          </span>
        );
      default:
        return (
          <span className="text-xs font-bold text-gray-700 bg-gray-50 px-2.5 py-1 rounded-full border border-gray-200">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-slate-900 p-6 rounded-xl border border-slate-800 text-white shadow-xl gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1 flex items-center gap-2">
            <Clock className="w-6 h-6 text-blue-400" /> Cron & Arka Plan Görevleri
          </h1>
          <p className="text-sm text-slate-400">
            Abonelik sweeps, bildirim outbox retry ve döngüsel bakım zamanlayıcısı (Super Admin Operations)
          </p>
        </div>
        <button 
          onClick={handleRunDailyMaintenance}
          disabled={sweeping}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white px-5 py-2.5 rounded-lg text-sm font-bold shadow-md transition-all flex items-center gap-2 justify-center"
        >
          {sweeping ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Zap className="w-4 h-4 text-yellow-300 fill-yellow-300" />
          )}
          <span>Günlük Bakım Sweeplerini Tetikle (Hepsini Çalıştır)</span>
        </button>
      </div>

      {/* Safety Banner */}
      <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-xl p-5 flex items-start gap-4">
        <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-900 dark:text-amber-200 space-y-1">
          <p className="font-bold">Güvenli Yerel Bakım Simülasyon Modu</p>
          <p>
            Şu anda sistem **local_simulation** modunda çalışmaktadır. Yapılan sweeps işlemleri:
          </p>
          <ul className="list-disc pl-5 mt-1 space-y-1 text-xs">
            <li>Dış e-posta sağlayıcılarına (Resend), SMS veya WhatsApp ağlarına gerçek istek göndermez, onun yerine bunları yerel veri outbox kuyruğuna (rendered/queued) alır.</li>
            <li>İşletme aboneliklerini veya planlarını güncel tarihe göre simüle ederek geçersiz/bitmiş denemeleri pasife alır.</li>
            <li>Lokal demo ortamını korur, gerçek para tahsilatı yapmaz.</li>
            <li>Gerçek zamanlanmış bulut görev altyapısı canlı ortamda ayrıca etkinleştirilir.</li>
          </ul>
        </div>
      </div>

      {/* Grid: Live Readiness + Scheduler Config */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Scheduler Status Component */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden md:col-span-1">
          <div className="px-5 py-4 border-b border-gray-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-between items-center">
            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Settings className="w-4 h-4 text-slate-500" /> Zamanlayıcı Durumu
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 uppercase">
              {readiness?.mode || 'local_simulation'}
            </span>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex justify-between items-center text-sm border-b border-gray-100 dark:border-slate-700 pb-3">
              <span className="text-gray-500 dark:text-gray-400">Aktif Zamanlayıcı:</span>
              <span className="font-semibold text-gray-900 dark:text-white">Lokal Simülatör (Tarayıcı Belleği)</span>
            </div>
            <div className="flex justify-between items-center text-sm border-b border-gray-100 dark:border-slate-700 pb-3">
              <span className="text-gray-500 dark:text-gray-400">Toplam Tanımlı Görev:</span>
              <span className="font-semibold text-gray-900 dark:text-white">{jobs.length} Adet</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500 dark:text-gray-400">Son Tetiklenen Görev:</span>
              <span className="font-semibold text-gray-900 dark:text-white text-xs truncate max-w-[140px]">
                {runs.length > 0 ? (runs[0].jobType.replace('subscription_', '').replace('_sweep', '')) : 'Hiçbiri'}
              </span>
            </div>
          </div>
        </div>

        {/* Live Active Scheduler Checklist */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden md:col-span-2">
          <div className="px-5 py-4 border-b border-gray-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-between items-center">
            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-green-500" /> Canlı Sistem Entegrasyon Test Sürümü (Döner Kontrol Listesi)
            </h3>
          </div>
          <div className="p-5 space-y-3">
            {readiness?.checklist?.map((item: any, i: number) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                {item.completed ? (
                  <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{item.label}</p>
                  {item.comment && (
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{item.comment}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Available Background Jobs */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
          <h2 className="font-bold text-base text-gray-900 dark:text-white">Tanımlı Zamanlanmış Cron Görevleri</h2>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-slate-700">
          {jobs.map((job) => (
            <div key={job.jobType} className="p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4 hover:bg-gray-50 dark:hover:bg-slate-900/50 transition-all">
              <div className="space-y-1 max-w-3xl">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-950 dark:text-white">
                    {language === 'tr' ? job.nameTr : job.nameEn}
                  </span>
                  <code className="text-[10px] bg-slate-100 dark:bg-slate-850 px-2 py-0.5 rounded font-mono text-slate-600 dark:text-slate-400">
                    {job.jobType}
                  </code>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {language === 'tr' ? job.descriptionTr : job.descriptionEn}
                </p>
                <div className="flex items-center gap-4 text-xs font-mono text-slate-500 mt-2">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" /> Planlanan Zaman: {job.schedule}
                  </span>
                </div>
              </div>
              <div className="shrink-0">
                <button
                  onClick={() => handleRunNow(job.jobType, language === 'tr' ? job.nameTr : job.nameEn)}
                  disabled={runningJob === job.jobType}
                  className="w-full md:w-auto bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 justify-center border border-gray-200 dark:border-slate-600"
                >
                  {runningJob === job.jobType ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5 text-emerald-500 fill-emerald-500" />
                  )}
                  <span>Şimdi Çalıştır (Simülatör)</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Scheduler History Logs */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-between items-center">
          <h2 className="font-bold text-base text-gray-900 dark:text-white">Çalıştırılma Günlükleri (Historic Runs)</h2>
          <button 
            onClick={loadData}
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" /> Yenile
          </button>
        </div>
        {runs.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400 text-sm">
            Henüz zamanlanmış görev tetikleme kaydı bulunmuyor. Yukarısı üzerinden simülatör sweeps işlemlerini başlatabilirsiniz.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 dark:bg-slate-900/30 text-gray-500 uppercase text-[10px] tracking-wider border-b border-gray-100 dark:border-slate-700">
                <tr>
                  <th className="px-5 py-3 font-semibold">GÖREV / ID</th>
                  <th className="px-5 py-3 font-semibold">DURUM</th>
                  <th className="px-5 py-3 font-semibold">TETİKLEME TÜRÜ</th>
                  <th className="px-5 py-3 font-semibold">BAŞLANGIÇ</th>
                  <th className="px-5 py-3 font-semibold">SÜRE (MS)</th>
                  <th className="px-5 py-3 font-semibold">AFET / KAYIT</th>
                  <th className="px-5 py-3 font-semibold">RAPOR ÖZETİ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {runs.map((run) => (
                  <tr key={run.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-gray-900 dark:text-white text-xs">{run.jobType}</div>
                      <div className="text-[10px] text-gray-400 font-mono mt-0.5">{run.id}</div>
                    </td>
                    <td className="px-5 py-4">
                      {getStatusBadge(run.status)}
                    </td>
                    <td className="px-5 py-4 text-xs font-medium text-slate-600 dark:text-slate-300">
                      {run.createdBy === 'system' ? (
                        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-bold">SYSTEM (CRON)</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-[10px] font-bold">MANUAL ADMIN</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs text-gray-500">
                      {new Date(run.startedAt).toLocaleString('tr-TR')}
                    </td>
                    <td className="px-5 py-4 text-xs font-mono text-gray-500">
                      {run.durationMs !== undefined ? `${run.durationMs} ms` : '—'}
                    </td>
                    <td className="px-5 py-4 text-xs">
                      <div>Kayıt: <span className="font-bold text-slate-800 dark:text-white">{run.affectedRecordCount}</span></div>
                      <div className="text-[10px] text-yellow-600">Uyarı: {run.warningCount} | Hata: {run.errorCount}</div>
                    </td>
                    <td className="px-5 py-4 text-xs font-medium text-gray-600 dark:text-slate-300 max-w-[260px] truncate">
                      {run.summary || 'Kayıt bulunmuyor.'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default SuperAdminSchedulerPage;
