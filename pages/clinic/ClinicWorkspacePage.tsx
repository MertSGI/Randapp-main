import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { clinicService } from '../../services/clinicService';
import { ClinicStaffContext, ClinicOperationalAppointment, ClinicServiceResult } from '../../types/clinic';
import { resolveClinicContextState, ClinicContextResolutionState } from '../../services/clinicUiPolicy';
import { ClinicStaffSetupPanel } from '../../components/clinic/ClinicStaffSetupPanel';
import { ClinicOperationalDayView } from '../../components/clinic/ClinicOperationalDayView';
import { ClinicPatientPanel } from '../../components/clinic/ClinicPatientPanel';
import { ClinicEncounterPanel } from '../../components/clinic/ClinicEncounterPanel';
import { ClinicHtAcceptancePanel } from '../../components/clinic/ClinicHtAcceptancePanel';
import { ShieldAlert, AlertCircle, RefreshCw, UserX, ServerOff } from 'lucide-react';

export interface ClinicWorkspacePageProps {
  initialContextResult?: ClinicServiceResult<ClinicStaffContext>;
}

export const ClinicWorkspacePage: React.FC<ClinicWorkspacePageProps> = ({ initialContextResult }) => {
  const { currentUser } = useAuth();
  const [contextResult, setContextResult] = useState<ClinicServiceResult<ClinicStaffContext> | null>(
    initialContextResult ?? null
  );
  const [loadingContext, setLoadingContext] = useState<boolean>(!initialContextResult);
  const [selectedAppointment, setSelectedAppointment] = useState<ClinicOperationalAppointment | null>(null);
  const [refreshOperationalTrigger, setRefreshOperationalTrigger] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'operations' | 'ht_acceptance'>('operations');

  useEffect(() => {
    if (!initialContextResult) {
      loadContext();
    }
  }, [currentUser?.id, initialContextResult]);

  const loadContext = async () => {
    setLoadingContext(true);
    try {
      const res = await clinicService.getMyClinicContext();
      setContextResult(res);
    } catch {
      setContextResult({
        success: false,
        error: { code: 'UNKNOWN', message: 'Sunucu erişim hatası' },
      });
    } finally {
      setLoadingContext(false);
    }
  };

  if (loadingContext) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center space-y-3 text-slate-500">
          <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
          <span className="text-xs font-semibold">Klinik sunucu bağlamı ve yetkileri kontrol ediliyor...</span>
        </div>
      </div>
    );
  }

  const state: ClinicContextResolutionState = resolveClinicContextState(currentUser?.role, contextResult);

  if (state === 'unavailable') {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 space-y-4">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
            <ServerOff className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Klinik Servisi Kullanılamıyor</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Klinik uygulaması Supabase sunucu yetkisi (Server Authority Mode) gerektirmektedir. Mock veya yetkisiz veri modlarında klinik işlemler yürütülemez.
          </p>
        </div>
      </div>
    );
  }

  if (state === 'unauthenticated') {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 space-y-4">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-amber-100 text-amber-600">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Oturum Gerekli</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Klinik modülüne erişmek için aktif oturum açmalısınız.
          </p>
        </div>
      </div>
    );
  }

  if (state === 'forbidden') {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 space-y-4">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-950/50 text-red-600">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Yetkisiz Erişim</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Sistem yöneticilerinin (Super Admin) klinik hasta verilerine doğrudan erişim yetkisi bulunmamaktadır.
          </p>
        </div>
      </div>
    );
  }

  if (state === 'not_configured') {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 space-y-4">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-600">
            <UserX className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Klinik Erişimi Tanımlanmadı</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Hesabınız için henüz bir klinik personel yetki profili tanımlanmamıştır. Lütfen işletme yöneticinizle iletişime geçin.
          </p>
        </div>
      </div>
    );
  }

  if (state === 'setup_only') {
    return (
      <div className="max-w-4xl mx-auto py-6">
        <ClinicStaffSetupPanel />
      </div>
    );
  }

  if (state === 'error' || !contextResult?.data) {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 space-y-4">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 text-red-600">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Sunucu Hatası</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {contextResult?.error?.message || 'Klinik bağlamı alınırken beklenmeyen bir hata oluştu.'}
          </p>
        </div>
      </div>
    );
  }

  const context = contextResult.data;

  return (
    <div className="space-y-6">
      <div
        data-testid="clinic-regulatory-hold-banner"
        className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-center space-x-2"
      >
        <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" />
        <span>
          EXTERNAL_HOLD: KVKK Özel Nitelikli Sağlık Verisi, Sağlık Bakanlığı mevzuat ruhsat onayı ve canlı bildirim gönderimi beklenmektedir (Sentetik Test / NO_GO).
        </span>
      </div>

      <div className="flex items-center space-x-1 border-b border-slate-200 dark:border-slate-700 pb-2">
        <button
          onClick={() => setActiveTab('operations')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'operations'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Klinik Operasyonlar
        </button>
        <button
          onClick={() => setActiveTab('ht_acceptance')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${
            activeTab === 'ht_acceptance'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Sağlık Turizmi Kabul
        </button>
      </div>

      {activeTab === 'ht_acceptance' ? (
        <ClinicHtAcceptancePanel
          context={context}
          onAcceptanceSuccess={() => setRefreshOperationalTrigger((prev) => prev + 1)}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5">
            <ClinicOperationalDayView
              context={context}
              selectedAppointmentId={selectedAppointment?.appointment_id || null}
              onSelectAppointment={(appt) => setSelectedAppointment(appt)}
              refreshTrigger={refreshOperationalTrigger}
            />
          </div>

          <div className="lg:col-span-7 space-y-6">
            {selectedAppointment && (
              <ClinicEncounterPanel
                context={context}
                selectedAppointment={selectedAppointment}
                onEncounterStateChanged={() => {
                  setRefreshOperationalTrigger((prev) => prev + 1);
                }}
              />
            )}

            <ClinicPatientPanel
              context={context}
              selectedAppointment={selectedAppointment}
              onRefreshOperationalDay={() => setRefreshOperationalTrigger((prev) => prev + 1)}
            />
          </div>
        </div>
      )}
    </div>
  );
};
