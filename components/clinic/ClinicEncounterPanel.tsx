import React, { useState } from 'react';
import { ClinicStaffContext, ClinicOperationalAppointment, NoteStatus } from '../../types/clinic';
import { clinicService } from '../../services/clinicService';
import {
  canStartClinicEncounter,
  canWriteClinicEncounterNote,
  canCompleteClinicEncounter
} from '../../services/clinicUiPolicy';
import { Play, Save, CheckCircle2, AlertCircle, FileText, Lock, ShieldAlert } from 'lucide-react';

interface ClinicEncounterPanelProps {
  context: ClinicStaffContext;
  selectedAppointment: ClinicOperationalAppointment | null;
  onEncounterStateChanged: () => void;
}

export const ClinicEncounterPanel: React.FC<ClinicEncounterPanelProps> = ({
  context,
  selectedAppointment,
  onEncounterStateChanged
}) => {
  const [starting, setStarting] = useState<boolean>(false);
  const [startReason, setStartReason] = useState<string>('');

  const [savingNote, setSavingNote] = useState<boolean>(false);
  const [soapForm, setSoapForm] = useState({
    subjective: '',
    objective: '',
    assessment: '',
    plan: '',
    note_status: 'final' as NoteStatus
  });

  const [completing, setCompleting] = useState<boolean>(false);
  const [showConfirmCompleteModal, setShowConfirmCompleteModal] = useState<boolean>(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!selectedAppointment) return null;

  const apptStatus = selectedAppointment.appointment_status;
  const encStatus = selectedAppointment.encounter_status;
  const openEncId = encStatus === 'open' ? selectedAppointment.encounter_id : null;
  const assignedStaffId = selectedAppointment.staff_id;

  const canStart = canStartClinicEncounter(context, apptStatus, assignedStaffId, openEncId);
  const canWriteNote = canWriteClinicEncounterNote(context, encStatus, assignedStaffId);
  const canComplete = canCompleteClinicEncounter(context, encStatus, assignedStaffId);

  // Start Encounter Handler
  const handleStartEncounter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppointment?.appointment_id || !canStart) return;
    setStarting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await clinicService.startClinicEncounter({
        appointment_id: selectedAppointment.appointment_id,
        reason_for_visit: startReason.trim() || undefined
      });

      if (res.success) {
        setSuccessMsg('Klinik muayene oturumu başlatıldı.');
        setStartReason('');
        onEncounterStateChanged();
      } else {
        setErrorMsg(res.error?.message || 'Muayene oturumu başlatılamadı.');
      }
    } catch (err) {
      setErrorMsg('Sunucu iletişim hatası oluştu.');
    } finally {
      setStarting(false);
    }
  };

  // Save SOAP Note Handler
  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppointment?.encounter_id || !canWriteNote) return;
    setSavingNote(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await clinicService.saveClinicEncounterNote({
        encounter_id: selectedAppointment.encounter_id,
        subjective: soapForm.subjective.trim() || undefined,
        objective: soapForm.objective.trim() || undefined,
        assessment: soapForm.assessment.trim() || undefined,
        plan: soapForm.plan.trim() || undefined,
        note_status: soapForm.note_status
      });

      if (res.success) {
        setSuccessMsg(`Tıbbi not versiyon v${res.data?.version || 1} kaydedildi.`);
        onEncounterStateChanged();
      } else {
        setErrorMsg(res.error?.message || 'Tıbbi not kaydedilemedi.');
      }
    } catch (err) {
      setErrorMsg('Sunucu işlem hatası.');
    } finally {
      setSavingNote(false);
    }
  };

  // Atomic Complete Encounter Handler
  const handleCompleteEncounter = async () => {
    if (!selectedAppointment?.encounter_id || !canComplete) return;
    setCompleting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await clinicService.completeClinicEncounter({
        encounter_id: selectedAppointment.encounter_id
      });

      if (res.success || res.reason_code === 'already_completed') {
        setSuccessMsg('Muayene ve randevu başarıyla tamamlandı (Atomic completion).');
        setShowConfirmCompleteModal(false);
        onEncounterStateChanged();
      } else {
        setErrorMsg(res.error?.message || 'Muayene tamamlanamadı.');
      }
    } catch (err) {
      setErrorMsg('Sunucu hatası oluştu.');
    } finally {
      setCompleting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 space-y-4">
      {errorMsg && (
        <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl flex items-center space-x-2 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center space-x-2 text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* STATE 1: No Encounter Open & Confirmed Appointment => Start Encounter Form */}
      {apptStatus === 'confirmed' && !encStatus && (
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center space-x-2">
            <Play className="h-4 w-4 text-emerald-600" />
            <span>Klinik Muayene Başlatma</span>
          </h4>

          {canStart ? (
            <form onSubmit={handleStartEncounter} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Geliş Sebebi / Şikayet (Opsiyonel)
                </label>
                <input
                  type="text"
                  value={startReason}
                  onChange={(e) => setStartReason(e.target.value)}
                  placeholder="Örn: Rutin kontrol, Göğüs ağrısı, Diş ağrısı"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={starting}
                className="w-full inline-flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl font-bold text-xs text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm"
              >
                <Play className="h-4 w-4 fill-current" />
                <span>{starting ? 'Başlatılıyor...' : 'Muayeneyi Başlat'}</span>
              </button>
            </form>
          ) : (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-700 dark:text-amber-400 flex items-center space-x-2">
              <Lock className="h-4 w-4 shrink-0" />
              <span>
                {context.can_write_clinical_notes
                  ? 'Randevu atanmış hekim eşleşmiyor veya henüz başlama durumunda değil.'
                  : 'Muayene başlatma ve tıbbi not yazma yetkiniz bulunmamaktadır.'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* STATE 2: Open Encounter => SOAP Note Form & Complete Action */}
      {encStatus === 'open' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
            <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center space-x-2">
              <FileText className="h-4 w-4 text-indigo-600" />
              <span>Aktif Muayene Formu (SOAP Notu)</span>
            </h4>

            {canComplete && (
              <button
                type="button"
                onClick={() => setShowConfirmCompleteModal(true)}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl font-bold text-xs text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Muayeneyi Tamamla</span>
              </button>
            )}
          </div>

          {canWriteNote ? (
            <form onSubmit={handleSaveNote} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    S - Subjective (Hasta Şikayeti & Hikayesi)
                  </label>
                  <textarea
                    rows={3}
                    value={soapForm.subjective}
                    onChange={(e) => setSoapForm({ ...soapForm, subjective: e.target.value })}
                    placeholder="Hastanın ifade ettiği şikayetler, semptomlar..."
                    className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    O - Objective (Fizik Muayene & Bulgular)
                  </label>
                  <textarea
                    rows={3}
                    value={soapForm.objective}
                    onChange={(e) => setSoapForm({ ...soapForm, objective: e.target.value })}
                    placeholder="Tansiyon, nabız, muayene bulguları, tetkik sonuçları..."
                    className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    A - Assessment (Değerlendirme & Teşhis)
                  </label>
                  <textarea
                    rows={3}
                    value={soapForm.assessment}
                    onChange={(e) => setSoapForm({ ...soapForm, assessment: e.target.value })}
                    placeholder="Ön tanı, kesin tanı, klinik değerlendirme..."
                    className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    P - Plan (Tedavi & Takip Planı)
                  </label>
                  <textarea
                    rows={3}
                    value={soapForm.plan}
                    onChange={(e) => setSoapForm({ ...soapForm, plan: e.target.value })}
                    placeholder="Reçete, öneriler, kontrol tarihi, sevk durumu..."
                    className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center space-x-3 text-xs">
                  <label className="font-semibold text-slate-600 dark:text-slate-400">Not Durumu:</label>
                  <select
                    value={soapForm.note_status}
                    onChange={(e) => setSoapForm({ ...soapForm, note_status: e.target.value as NoteStatus })}
                    className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-xs"
                  >
                    <option value="final">Final (Kesin Tıbbi Kayıt)</option>
                    <option value="draft">Draft (Taslak Not)</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={savingNote}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl font-bold text-xs text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                  <Save className="h-4 w-4" />
                  <span>{savingNote ? 'Kaydediliyor...' : 'Tıbbi Notu Kaydet (Yeni Versiyon)'}</span>
                </button>
              </div>
            </form>
          ) : (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
              Açık muayene oturumu var ancak tıbbi not yazma yetkiniz bulunmamaktadır.
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal for Complete Encounter */}
      {showConfirmCompleteModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full shadow-xl border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="flex items-center space-x-3 text-blue-600 dark:text-blue-400">
              <CheckCircle2 className="h-6 w-6" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Muayeneyi Tamamla</h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Bu klinik muayeneyi ve bağlı randevuyu sonlandırmak istediğinizden emin misiniz? Tamamlanan muayene oturumu kapatılacak ve Core randevu durumu 'completed' olarak atomik güncellenecektir.
            </p>
            <div className="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmCompleteModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 border border-slate-200 hover:bg-slate-100"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleCompleteEncounter}
                disabled={completing}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 shadow-sm"
              >
                {completing ? 'Tamamlanıyor...' : 'Evet, Muayeneyi Tamamla'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
