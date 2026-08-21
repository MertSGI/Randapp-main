import React, { useState, useEffect } from 'react';
import { ClinicOperationalAppointment, ClinicOperationalDay, ClinicStaffContext } from '../../types/clinic';
import { clinicService } from '../../services/clinicService';
import { Calendar, RefreshCw, Clock, User, Stethoscope, AlertCircle, CheckCircle2, Play, FileText, ChevronRight } from 'lucide-react';

interface ClinicOperationalDayViewProps {
  context: ClinicStaffContext;
  selectedAppointmentId: string | null;
  onSelectAppointment: (appointment: ClinicOperationalAppointment) => void;
  refreshTrigger?: number;
}

export const ClinicOperationalDayView: React.FC<ClinicOperationalDayViewProps> = ({
  context,
  selectedAppointmentId,
  onSelectAppointment,
  refreshTrigger = 0
}) => {
  const getTodayString = () => new Date().toISOString().split('T')[0];

  const [date, setDate] = useState<string>(getTodayString());
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    context.permitted_branch_ids && context.permitted_branch_ids.length > 0
      ? context.permitted_branch_ids[0]
      : ''
  );
  const [operationalData, setOperationalData] = useState<ClinicOperationalDay | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOperationalDay();
  }, [date, selectedBranchId, refreshTrigger]);

  const fetchOperationalDay = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await clinicService.getClinicOperationalDay(date, selectedBranchId || undefined);
      if (res.success && res.data) {
        setOperationalData(res.data);
      } else {
        setError(res.error?.message || 'Günün akışı yüklenemedi.');
      }
    } catch (err) {
      setError('Ağ hatası veya yetkilendirme problemi oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (apptStatus: string, encStatus: string | null) => {
    if (encStatus === 'open') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
          <Play className="h-3 w-3 mr-1 animate-pulse fill-current" /> Muayene Açık
        </span>
      );
    }
    if (encStatus === 'completed' || apptStatus === 'completed') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
          <CheckCircle2 className="h-3 w-3 mr-1" /> Tamamlandı
        </span>
      );
    }
    if (apptStatus === 'confirmed') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800">
          Onaylı
        </span>
      );
    }
    if (apptStatus === 'cancelled') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
          İptal
        </span>
      );
    }
    if (apptStatus === 'no_show') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
          Gelmedi
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
        {apptStatus}
      </span>
    );
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 flex flex-col h-full">
      {/* Top Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100 dark:border-slate-700">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-xl">
            <Calendar className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-800 dark:text-white focus:outline-none"
            />
          </div>

          {context.permitted_branch_ids && context.permitted_branch_ids.length > 1 && (
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-800 dark:text-white focus:outline-none"
            >
              <option value="">Tüm Şubeler</option>
              {context.permitted_branch_ids.map((bId) => (
                <option key={bId} value={bId}>
                  Şube {bId.substring(0, 8)}
                </option>
              ))}
            </select>
          )}
        </div>

        <button
          onClick={fetchOperationalDay}
          disabled={loading}
          className="p-2 text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          title="Yenile"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Main List */}
      {error && (
        <div className="p-3 mb-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl flex items-center space-x-2 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400">Klinik takvim yükleniyor...</div>
      ) : !operationalData || operationalData.appointments.length === 0 ? (
        <div className="py-12 text-center text-xs text-slate-400">
          Bu tarih için kayıtlı klinik randevusu bulunmamaktadır.
        </div>
      ) : (
        <div className="space-y-2 overflow-y-auto max-h-[600px] pr-1">
          {operationalData.appointments.map((appt) => {
            const isSelected = selectedAppointmentId === appt.appointment_id;
            return (
              <div
                key={appt.appointment_id}
                onClick={() => onSelectAppointment(appt)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                  isSelected
                    ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700 shadow-sm'
                    : 'bg-slate-50/50 dark:bg-slate-900/30 border-slate-200/80 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <div className="flex items-center space-x-3.5">
                  <div className="text-center px-2 py-1 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 min-w-[60px]">
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      {appt.appointment_time ? appt.appointment_time.substring(0, 5) : '--:--'}
                    </div>
                    <div className="text-[10px] text-slate-400">{appt.duration_minutes || 30} dk</div>
                  </div>

                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center space-x-1.5">
                      <span>{appt.customer_name || 'İsimsiz Hasta'}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center space-x-2">
                      <span>{appt.service_name || 'Muayene Servisi'}</span>
                      {appt.staff_name && (
                        <>
                          <span>•</span>
                          <span className="text-indigo-600 dark:text-indigo-400 font-medium">{appt.staff_name}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  {getStatusBadge(appt.appointment_status, appt.encounter_status)}
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
