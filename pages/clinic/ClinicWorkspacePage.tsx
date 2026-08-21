import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { clinicService } from '../../services/clinicService';
import { ClinicStaffContext, ClinicOperationalAppointment } from '../../types/clinic';
import { deriveClinicWorkspaceMode, ClinicWorkspaceMode } from '../../services/clinicUiPolicy';
import { ClinicStaffSetupPanel } from '../../components/clinic/ClinicStaffSetupPanel';
import { ClinicOperationalDayView } from '../../components/clinic/ClinicOperationalDayView';
import { ClinicPatientPanel } from '../../components/clinic/ClinicPatientPanel';
import { ClinicEncounterPanel } from '../../components/clinic/ClinicEncounterPanel';
import { ShieldAlert, AlertCircle, RefreshCw, UserX } from 'lucide-react';

export const ClinicWorkspacePage: React.FC = () => {
  const { currentUser } = useAuth();
  const [context, setContext] = useState<ClinicStaffContext | null>(null);
  const [loadingContext, setLoadingContext] = useState<boolean>(true);
  const [contextError, setContextError] = useState<string | null>(null);

  const [selectedAppointment, setSelectedAppointment] = useState<ClinicOperationalAppointment | null>(null);
  const [refreshOperationalTrigger, setRefreshOperationalTrigger] = useState<number>(0);

  useEffect(() => {
    loadContext();
  }, [currentUser?.id]);

  const loadContext = async () => {
    setLoadingContext(true);
    setContextError(null);
    try {
      const res = await clinicService.getMyClinicContext();
      if (res.success && res.data) {
        setContext(res.data);
      } else {
        setContext(null);
        if (res.error?.code === 'UNAVAILABLE') {
          setContextError('Klinik modülü Supabase sunucu yetkisi gerektirmektedir.');
        } else if (res.error?.code === 'UNAUTHENTICATED') {
          setContextError('Klinik modülüne erişmek için oturum açmalısınız.');
        }
      }
    } catch (err) {
      setContextError('Klinik sunucu bağlamı alınırken hata oluştu.');
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

  const mode: ClinicWorkspaceMode = deriveClinicWorkspaceMode(currentUser?.role, context);

  // STATE E: Super Admin or Unauthorized
  if (mode === 'unauthorized') {
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

  // STATE B: Staff without Clinic Staff Context
  if (mode === 'access_not_configured') {
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

  // STATE D: Tenant Owner without Active Staff Profile => SETUP ONLY MODE
  if (mode === 'setup_only') {
    return (
      <div className="max-w-4xl mx-auto py-6">
        <ClinicStaffSetupPanel />
      </div>
    );
  }

  // STATE A & C: Successful Clinic Context => OPERATIONAL WORKSPACE
  return (
    <div className="space-y-6">
      {contextError && (
        <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl flex items-center space-x-2 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{contextError}</span>
        </div>
      )}

      {/* Main Grid: Operational Schedule on Left (5 cols), Details & Encounter on Right (7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5">
          <ClinicOperationalDayView
            context={context!}
            selectedAppointmentId={selectedAppointment?.appointment_id || null}
            onSelectAppointment={(appt) => setSelectedAppointment(appt)}
            refreshTrigger={refreshOperationalTrigger}
          />
        </div>

        <div className="lg:col-span-7 space-y-6">
          {selectedAppointment && (
            <ClinicEncounterPanel
              context={context!}
              selectedAppointment={selectedAppointment}
              onEncounterStateChanged={() => {
                setRefreshOperationalTrigger((prev) => prev + 1);
              }}
            />
          )}

          <ClinicPatientPanel
            context={context!}
            selectedAppointment={selectedAppointment}
            onRefreshOperationalDay={() => setRefreshOperationalTrigger((prev) => prev + 1)}
          />
        </div>
      </div>
    </div>
  );
};
