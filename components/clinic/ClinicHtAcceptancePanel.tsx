import React, { useState, useEffect } from 'react';
import { clinicService } from '../../services/clinicService';
import {
  ClinicStaffContext,
  HtPendingClinicAcceptanceLead,
  HtAcceptanceBranchOption,
  HtAcceptanceServiceOption,
  HtAcceptancePractitionerOption,
  HtAcceptanceSlotOption,
  HtAcceptanceConversionResult
} from '../../types/clinic';
import {
  Sparkles,
  Globe,
  Languages,
  Clock,
  Calendar,
  UserCheck,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Inbox,
  Check
} from 'lucide-react';

interface ClinicHtAcceptancePanelProps {
  context: ClinicStaffContext;
  onAcceptanceSuccess?: () => void;
}

export const ClinicHtAcceptancePanel: React.FC<ClinicHtAcceptancePanelProps> = ({
  context,
  onAcceptanceSuccess
}) => {
  // Queue state
  const [leads, setLeads] = useState<HtPendingClinicAcceptanceLead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState<boolean>(true);
  const [leadError, setLeadError] = useState<string | null>(null);

  // Selected Lead state
  const [selectedLead, setSelectedLead] = useState<HtPendingClinicAcceptanceLead | null>(null);

  // Cascading Selection Options state
  const [branches, setBranches] = useState<HtAcceptanceBranchOption[]>([]);
  const [services, setServices] = useState<HtAcceptanceServiceOption[]>([]);
  const [practitioners, setPractitioners] = useState<HtAcceptancePractitionerOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState<boolean>(false);

  // Selected Option parameters
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [selectedPractitionerId, setSelectedPractitionerId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  // Slots state
  const [slots, setSlots] = useState<HtAcceptanceSlotOption[]>([]);
  const [loadingSlots, setLoadingSlots] = useState<boolean>(false);
  const [selectedTime, setSelectedTime] = useState<string>('');

  // Submit & Result state
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [conversionResult, setConversionResult] = useState<HtAcceptanceConversionResult | null>(null);

  // Initial queue load
  useEffect(() => {
    loadPendingLeads();
  }, []);

  // When selected lead changes, load options
  useEffect(() => {
    if (selectedLead) {
      setSelectedBranchId('');
      setSelectedServiceId('');
      setSelectedPractitionerId('');
      setSelectedTime('');
      setSlots([]);
      setSubmitError(null);
      setConversionResult(null);
      loadOptions(selectedLead.lead_id);
    }
  }, [selectedLead?.lead_id]);

  // When branch or service selection changes, update options
  useEffect(() => {
    if (selectedLead) {
      loadOptions(selectedLead.lead_id, selectedBranchId || undefined, selectedServiceId || undefined);
    }
  }, [selectedBranchId, selectedServiceId]);

  // When date, practitioner, service, branch all selected, fetch slots
  useEffect(() => {
    if (selectedLead && selectedBranchId && selectedServiceId && selectedPractitionerId && selectedDate) {
      loadSlots();
    } else {
      setSlots([]);
      setSelectedTime('');
    }
  }, [selectedLead?.lead_id, selectedBranchId, selectedServiceId, selectedPractitionerId, selectedDate]);

  const loadPendingLeads = async () => {
    setLoadingLeads(true);
    setLeadError(null);
    try {
      const res = await clinicService.getHtPendingLeads();
      if (res.success && res.data) {
        setLeads(res.data);
        if (res.data.length > 0 && !selectedLead) {
          setSelectedLead(res.data[0]);
        } else if (res.data.length === 0) {
          setSelectedLead(null);
        }
      } else {
        setLeadError(res.error?.message || 'Bekleyen talepler yüklenemedi.');
      }
    } catch {
      setLeadError('Ağ hatası: Talepler alınamadı.');
    } finally {
      setLoadingLeads(false);
    }
  };

  const loadOptions = async (leadId: string, branchId?: string, serviceId?: string) => {
    setLoadingOptions(true);
    try {
      const res = await clinicService.getHtAcceptanceOptions({
        lead_id: leadId,
        branch_id: branchId,
        service_id: serviceId
      });
      if (res.success && res.data) {
        setBranches(res.data.branches || []);
        setServices(res.data.services || []);
        setPractitioners(res.data.practitioners || []);

        // Auto-select single options if available
        if (!selectedBranchId && res.data.branches?.length === 1) {
          setSelectedBranchId(res.data.branches[0].id);
        }
        if (!selectedServiceId && res.data.services?.length === 1) {
          setSelectedServiceId(res.data.services[0].id);
        }
        if (!selectedPractitionerId && res.data.practitioners?.length === 1) {
          setSelectedPractitionerId(res.data.practitioners[0].staff_id);
        }
      }
    } catch {
      // options error handled gracefully in UI
    } finally {
      setLoadingOptions(false);
    }
  };

  const loadSlots = async () => {
    if (!selectedLead || !selectedBranchId || !selectedServiceId || !selectedPractitionerId || !selectedDate) return;
    setLoadingSlots(true);
    setSelectedTime('');
    try {
      const res = await clinicService.getHtAcceptanceSlots({
        lead_id: selectedLead.lead_id,
        branch_id: selectedBranchId,
        service_id: selectedServiceId,
        practitioner_staff_id: selectedPractitionerId,
        date: selectedDate
      });
      if (res.success && res.data) {
        setSlots(res.data.available_slots || []);
      } else {
        setSlots([]);
      }
    } catch {
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleConfirmAcceptance = async () => {
    if (!selectedLead || !selectedBranchId || !selectedServiceId || !selectedPractitionerId || !selectedDate || !selectedTime) {
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setConversionResult(null);

    try {
      const res = await clinicService.acceptHtLead({
        lead_id: selectedLead.lead_id,
        branch_id: selectedBranchId,
        service_id: selectedServiceId,
        practitioner_staff_id: selectedPractitionerId,
        appointment_date: selectedDate,
        appointment_time: selectedTime
      });

      if (res.success && res.data) {
        setConversionResult(res.data);
        // Refresh queue & notify parent
        loadPendingLeads();
        if (onAcceptanceSuccess) {
          onAcceptanceSuccess();
        }
      } else {
        setSubmitError(res.error?.message || 'Klinik kabul işlemi gerçekleştirilemedi.');
      }
    } catch {
      setSubmitError('Beklenmeyen bir sunucu hatası oluştu.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingLeads) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-500">
        <RefreshCw className="h-6 w-6 animate-spin text-indigo-600 mr-2" />
        <span className="text-xs font-semibold">Sağlık Turizmi kabul kuyruğu yükleniyor...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-indigo-600" />
            Sağlık Turizmi Klinik Kabul İş Alanı
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Yönlendirilen Sağlık Turizmi taleplerini inceleyin, uygun şube, hizmet ve hekim randevusu atayarak klinik kabulünü onaylayın.
          </p>
        </div>
        <button
          onClick={loadPendingLeads}
          className="p-2 text-slate-500 hover:text-indigo-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          title="Kuyruğu Yenile"
        >
          <RefreshCw className="h-5 w-5" />
        </button>
      </div>

      {leadError && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{leadError}</span>
        </div>
      )}

      {/* Main Grid: Pending Queue Left (4 cols), Acceptance Details Right (8 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Pending Queue */}
        <div className="lg:col-span-4 bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Bekleyen Talepler ({leads.length})
            </span>
          </div>

          {leads.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <Inbox className="h-8 w-8 mx-auto stroke-1" />
              <p className="text-xs">Bekleyen Sağlık Turizmi kabul talebi bulunmamaktadır.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {leads.map((item) => {
                const isSelected = selectedLead?.lead_id === item.lead_id;
                return (
                  <button
                    key={item.lead_id}
                    onClick={() => setSelectedLead(item)}
                    className={`w-full text-left p-3 rounded-xl border transition-all text-xs space-y-1.5 ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 text-indigo-950 dark:text-indigo-200 shadow-sm'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between font-semibold">
                      <span className="truncate">{item.full_name}</span>
                      {item.country_code && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-mono bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                          {item.country_code}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                      {item.preferred_language && (
                        <span className="flex items-center gap-1">
                          <Languages className="h-3 w-3 text-slate-400" />
                          {item.preferred_language.toUpperCase()}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-slate-400" />
                        {new Date(item.handoff_requested_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Detailed Handoff & Acceptance Selection */}
        <div className="lg:col-span-8 space-y-6">
          {!selectedLead ? (
            <div className="bg-white dark:bg-slate-800 p-12 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 text-center text-slate-400">
              <p className="text-xs">Lütfen sol listeden klinik kabulu yapılacak hasta adayını seçin.</p>
            </div>
          ) : (
            <>
              {/* Selected Lead Summary */}
              <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 space-y-4">
                <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-700 pb-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      {selectedLead.full_name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {selectedLead.email && <span>{selectedLead.email}</span>}
                      {selectedLead.phone && <span>{selectedLead.phone}</span>}
                      {selectedLead.country_code && (
                        <span className="flex items-center gap-1">
                          <Globe className="h-3.5 w-3.5 text-slate-400" />
                          {selectedLead.country_code}
                        </span>
                      )}
                      {selectedLead.preferred_language && (
                        <span className="flex items-center gap-1">
                          <Languages className="h-3.5 w-3.5 text-slate-400" />
                          {selectedLead.preferred_language.toUpperCase()}
                        </span>
                      )}
                    </div>
                  </div>

                  <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                    Klinik Kabul Bekliyor
                  </span>
                </div>

                {/* Handoff Reason & AI Assistive Summary */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  {selectedLead.handoff_reason && (
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                      <span className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        Yönlendirme Gerekçesi
                      </span>
                      <p className="text-slate-600 dark:text-slate-400">{selectedLead.handoff_reason}</p>
                    </div>
                  )}

                  {selectedLead.ai_summary && (
                    <div className="bg-indigo-50/60 dark:bg-indigo-950/40 p-3 rounded-xl border border-indigo-100 dark:border-indigo-900/60 space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-indigo-900 dark:text-indigo-200">
                        <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                        <span>Yapay Zekâ Özeti</span>
                        <span className="text-[10px] bg-indigo-200/60 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-300 px-1.5 py-0.2 rounded font-normal">
                          Yardımcı / Doğrulanmamış Bilgi
                        </span>
                      </div>
                      <p className="text-indigo-950 dark:text-indigo-300 text-[11px] leading-relaxed">
                        {selectedLead.ai_summary}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Acceptance Booking Selection Grid */}
              <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 space-y-5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700 pb-2">
                  Klinik Randevu Atama ve Kabul İşlemi
                </h4>

                {conversionResult ? (
                  <div className="p-6 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 space-y-3">
                    <div className="flex items-center gap-2 font-bold text-sm text-emerald-700 dark:text-emerald-300">
                      <CheckCircle className="h-5 w-5" />
                      <span>Klinik Kabul Onaylandı ve Randevu Oluşturuldu!</span>
                    </div>
                    <div className="text-xs space-y-1">
                      <p>Müşteri ID: <code className="font-mono">{conversionResult.customer_id}</code></p>
                      <p>Hasta Profil ID: <code className="font-mono">{conversionResult.patient_profile_id}</code></p>
                      <p>Randevu ID: <code className="font-mono">{conversionResult.appointment_id}</code></p>
                    </div>
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 pt-2 border-t border-emerald-200 dark:border-emerald-800">
                      Hasta kaydı Klinik Operasyon Workspace takvimine eklendi.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                      {/* Branch Selection */}
                      <div className="space-y-1">
                        <label className="font-semibold text-slate-700 dark:text-slate-300">Şube Seçimi *</label>
                        <select
                          value={selectedBranchId}
                          onChange={(e) => setSelectedBranchId(e.target.value)}
                          disabled={loadingOptions || submitting}
                          className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                        >
                          <option value="">-- Şube Seçin --</option>
                          {branches.map((b) => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </select>
                      </div>

                      {/* Service Selection */}
                      <div className="space-y-1">
                        <label className="font-semibold text-slate-700 dark:text-slate-300">Hizmet / İşlem *</label>
                        <select
                          value={selectedServiceId}
                          onChange={(e) => setSelectedServiceId(e.target.value)}
                          disabled={loadingOptions || submitting}
                          className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                        >
                          <option value="">-- Hizmet Seçin --</option>
                          {services.map((s) => (
                            <option key={s.id} value={s.id}>{s.name} ({s.duration_minutes} dk)</option>
                          ))}
                        </select>
                      </div>

                      {/* Practitioner Selection */}
                      <div className="space-y-1">
                        <label className="font-semibold text-slate-700 dark:text-slate-300">Hekim / Uzman *</label>
                        <select
                          value={selectedPractitionerId}
                          onChange={(e) => setSelectedPractitionerId(e.target.value)}
                          disabled={loadingOptions || submitting}
                          className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                        >
                          <option value="">-- Hekim Seçin --</option>
                          {practitioners.map((p) => (
                            <option key={p.staff_id} value={p.staff_id}>
                              {p.staff_name} {p.specialty ? `(${p.specialty})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Date Picker & Slot Grid */}
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                          <Calendar className="h-4 w-4 text-indigo-600" />
                          Tarih Seçimi *
                        </label>
                        <input
                          type="date"
                          value={selectedDate}
                          min={new Date().toISOString().split('T')[0]}
                          onChange={(e) => setSelectedDate(e.target.value)}
                          disabled={submitting}
                          className="p-2 text-xs rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                        />
                      </div>

                      {/* Slots */}
                      {loadingSlots ? (
                        <div className="flex items-center justify-center py-6 text-slate-400 text-xs">
                          <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                          Müsait randevu saatleri kontrol ediliyor...
                        </div>
                      ) : !selectedBranchId || !selectedServiceId || !selectedPractitionerId ? (
                        <p className="text-xs text-slate-400 italic">
                          Randevu saatlerini görmek için lütfen şube, hizmet ve hekim seçimini tamamlayın.
                        </p>
                      ) : slots.length === 0 ? (
                        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-xs">
                          Seçilen tarih ve hekim için uygun randevu saati bulunamadı.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                            Müsait Saat Seçimi (Sunucu Yetkili):
                          </span>
                          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                            {slots.map((s) => {
                              const isSelectedTime = selectedTime === s.time;
                              return (
                                <button
                                  key={s.time}
                                  type="button"
                                  onClick={() => setSelectedTime(s.time)}
                                  disabled={submitting}
                                  className={`p-2 rounded-lg text-xs font-mono font-medium transition-all ${
                                    isSelectedTime
                                      ? 'bg-indigo-600 text-white shadow-sm scale-105'
                                      : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-indigo-100 dark:hover:bg-indigo-900/50'
                                  }`}
                                >
                                  {s.time}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {submitError && (
                      <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span>{submitError}</span>
                      </div>
                    )}

                    {/* Action Button */}
                    <div className="pt-4 border-t border-slate-100 dark:border-slate-700 flex justify-end">
                      <button
                        type="button"
                        onClick={handleConfirmAcceptance}
                        disabled={
                          !selectedBranchId ||
                          !selectedServiceId ||
                          !selectedPractitionerId ||
                          !selectedDate ||
                          !selectedTime ||
                          submitting
                        }
                        className="px-6 py-2.5 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-700 text-white disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed transition-all flex items-center gap-2 shadow-sm"
                      >
                        {submitting ? (
                          <>
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            Klinik Kabul İşleniyor...
                          </>
                        ) : (
                          <>
                            <Check className="h-4 w-4" />
                            Klinik Kabulünü Onayla ve Randevu Oluştur
                          </>
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
