import React, { useState, useEffect } from 'react';
import { ClinicStaffContext, ClinicPatientHistory, ClinicOperationalAppointment } from '../../types/clinic';
import { clinicService } from '../../services/clinicService';
import { canLoadClinicPatientHistory, canManageClinicPatientProfile } from '../../services/clinicUiPolicy';
import { User, Phone, Heart, AlertTriangle, Activity, Edit3, Save, X, Clock, FileText, CheckCircle2, ShieldAlert } from 'lucide-react';

interface ClinicPatientPanelProps {
  context: ClinicStaffContext;
  selectedAppointment: ClinicOperationalAppointment | null;
  onRefreshOperationalDay?: () => void;
}

export const ClinicPatientPanel: React.FC<ClinicPatientPanelProps> = ({
  context,
  selectedAppointment,
  onRefreshOperationalDay
}) => {
  const [history, setHistory] = useState<ClinicPatientHistory | null>(null);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // Edit Mode state for bounded profile
  const [isEditingProfile, setIsEditingProfile] = useState<boolean>(false);
  const [savingProfile, setSavingProfile] = useState<boolean>(false);
  const [profileForm, setProfileForm] = useState({
    date_of_birth: '',
    sex_at_birth: 'male',
    blood_type: '',
    allergies: '',
    chronic_conditions: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relationship: ''
  });
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const canViewHistory = canLoadClinicPatientHistory(context);
  const canManageProfile = canManageClinicPatientProfile(context);

  useEffect(() => {
    setIsEditingProfile(false);
    setProfileMsg(null);
    if (selectedAppointment?.customer_id && canViewHistory) {
      loadHistory(selectedAppointment.customer_id);
    } else {
      setHistory(null);
    }
  }, [selectedAppointment?.customer_id, canViewHistory]);

  const loadHistory = async (customerId: string) => {
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const res = await clinicService.getClinicPatientHistory(customerId);
      if (res.success && res.data) {
        setHistory(res.data);
        // Pre-fill profile form from history profile if present
        if (res.data.patient_profile) {
          const p = res.data.patient_profile;
          setProfileForm({
            date_of_birth: p.date_of_birth || '',
            sex_at_birth: p.sex_at_birth || 'male',
            blood_type: p.blood_type || '',
            allergies: p.allergies || '',
            chronic_conditions: p.chronic_conditions || '',
            emergency_contact_name: p.emergency_contact_name || '',
            emergency_contact_phone: p.emergency_contact_phone || '',
            emergency_contact_relationship: p.emergency_contact_relationship || ''
          });
        }
      } else {
        setHistoryError(res.error?.message || 'Hasta klinik geçmişi yüklenemedi.');
      }
    } catch (err) {
      setHistoryError('Sunucu erişim hatası.');
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppointment?.customer_id) return;
    setSavingProfile(true);
    setProfileMsg(null);

    try {
      const res = await clinicService.upsertClinicPatientProfile({
        customer_id: selectedAppointment.customer_id,
        date_of_birth: profileForm.date_of_birth || undefined,
        sex_at_birth: profileForm.sex_at_birth || undefined,
        blood_type: profileForm.blood_type || undefined,
        allergies: profileForm.allergies || undefined,
        chronic_conditions: profileForm.chronic_conditions || undefined,
        emergency_contact_name: profileForm.emergency_contact_name || undefined,
        emergency_contact_phone: profileForm.emergency_contact_phone || undefined,
        emergency_contact_relationship: profileForm.emergency_contact_relationship || undefined
      });

      if (res.success) {
        setProfileMsg({ type: 'success', text: 'Hasta demografik ve sağlık profili güncellendi.' });
        setIsEditingProfile(false);
        if (canViewHistory) {
          loadHistory(selectedAppointment.customer_id);
        }
      } else {
        setProfileMsg({ type: 'error', text: res.error?.message || 'Profil güncellenemedi.' });
      }
    } catch (err) {
      setProfileMsg({ type: 'error', text: 'Sunucu hatası oluştu.' });
    } finally {
      setSavingProfile(false);
    }
  };

  if (!selectedAppointment) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-8 text-center text-xs text-slate-400">
        Detaylarını ve klinik geçmişini görüntülemek için takvimden bir randevu seçin.
      </div>
    );
  }

  const profile = history?.patient_profile;

  return (
    <div className="space-y-4">
      {/* Patient Header Card */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-indigo-50 dark:bg-indigo-950/50 rounded-2xl text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800">
              <User className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {selectedAppointment.customer_name || 'Hasta Kartı'}
              </h3>
              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center space-x-2 mt-0.5">
                {selectedAppointment.customer_phone && (
                  <span className="flex items-center">
                    <Phone className="h-3 w-3 mr-1" /> {selectedAppointment.customer_phone}
                  </span>
                )}
                <span>•</span>
                <span>Randevu: {selectedAppointment.service_name}</span>
              </div>
            </div>
          </div>

          {canManageProfile && !isEditingProfile && (
            <button
              onClick={() => setIsEditingProfile(true)}
              className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-800/60 hover:bg-indigo-100 transition-colors"
            >
              <Edit3 className="h-3.5 w-3.5" />
              <span>Profili Düzenle</span>
            </button>
          )}
        </div>

        {profileMsg && (
          <div className={`mt-3 p-2.5 rounded-xl text-xs flex items-center space-x-2 ${
            profileMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            <span>{profileMsg.text}</span>
          </div>
        )}

        {/* Profile Details or Edit Form */}
        {isEditingProfile ? (
          <form onSubmit={handleSaveProfile} className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 space-y-3">
            <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Sınırlı Hasta Profil Düzenleme
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Doğum Tarihi</label>
                <input
                  type="date"
                  value={profileForm.date_of_birth}
                  onChange={(e) => setProfileForm({ ...profileForm, date_of_birth: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-xs bg-white dark:bg-slate-700"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Kan Grubu</label>
                <input
                  type="text"
                  value={profileForm.blood_type}
                  onChange={(e) => setProfileForm({ ...profileForm, blood_type: e.target.value })}
                  placeholder="Örn: A Rh+"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-xs bg-white dark:bg-slate-700"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Alerjiler</label>
                <input
                  type="text"
                  value={profileForm.allergies}
                  onChange={(e) => setProfileForm({ ...profileForm, allergies: e.target.value })}
                  placeholder="Örn: Penisilin, İlaç alerjisi"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-xs bg-white dark:bg-slate-700"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Kronik Durumlar</label>
                <input
                  type="text"
                  value={profileForm.chronic_conditions}
                  onChange={(e) => setProfileForm({ ...profileForm, chronic_conditions: e.target.value })}
                  placeholder="Örn: Hipertansiyon, Diyabet"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-xs bg-white dark:bg-slate-700"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Acil Kişi Adı</label>
                <input
                  type="text"
                  value={profileForm.emergency_contact_name}
                  onChange={(e) => setProfileForm({ ...profileForm, emergency_contact_name: e.target.value })}
                  placeholder="Acil durumda aranacak kişi"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-xs bg-white dark:bg-slate-700"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Acil Telefon</label>
                <input
                  type="text"
                  value={profileForm.emergency_contact_phone}
                  onChange={(e) => setProfileForm({ ...profileForm, emergency_contact_phone: e.target.value })}
                  placeholder="Telefon"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-xs bg-white dark:bg-slate-700"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setIsEditingProfile(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-100"
              >
                İptal
              </button>
              <button
                type="submit"
                disabled={savingProfile}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
              >
                {savingProfile ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-slate-50 dark:bg-slate-900/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700/50">
              <div className="text-slate-400 text-[10px] font-medium">Kan Grubu</div>
              <div className="font-bold text-slate-800 dark:text-white mt-0.5">{profile?.blood_type || 'Belirtilmedi'}</div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700/50">
              <div className="text-slate-400 text-[10px] font-medium">Alerjiler</div>
              <div className="font-bold text-rose-600 dark:text-rose-400 mt-0.5">{profile?.allergies || 'Yok / Belirtilmedi'}</div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700/50">
              <div className="text-slate-400 text-[10px] font-medium">Kronik Durumlar</div>
              <div className="font-bold text-amber-600 dark:text-amber-400 mt-0.5">{profile?.chronic_conditions || 'Yok / Belirtilmedi'}</div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700/50">
              <div className="text-slate-400 text-[10px] font-medium">Acil İletişim</div>
              <div className="font-semibold text-slate-800 dark:text-white mt-0.5">
                {profile?.emergency_contact_name ? `${profile.emergency_contact_name} (${profile.emergency_contact_phone || ''})` : 'Kayıt Yok'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Clinical History List (Only if can_view_clinical_records = true) */}
      {!canViewHistory ? (
        <div className="bg-slate-50 dark:bg-slate-900/30 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 text-center text-xs text-slate-500">
          <ShieldAlert className="h-5 w-5 mx-auto mb-2 text-amber-500" />
          <span>Klinik muayene geçmişini görme yetkiniz bulunmamaktadır (Resepsiyon / Sınırlı Yetki).</span>
        </div>
      ) : loadingHistory ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 text-center text-xs text-slate-400">
          Hastanın geçmiş muayeneleri yükleniyor...
        </div>
      ) : historyError ? (
        <div className="bg-red-50 dark:bg-red-950/30 rounded-2xl border border-red-200 dark:border-red-800 p-4 text-xs text-red-600 dark:text-red-400">
          {historyError}
        </div>
      ) : !history || history.encounters.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 text-center text-xs text-slate-400">
          Bu hastaya ait tamamlanmış geçmiş muayene kaydı bulunmuyor.
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 space-y-4">
          <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center space-x-2">
            <Clock className="h-4 w-4 text-indigo-600" />
            <span>Klinik Geçmiş & Önceki Muayeneler ({history.encounters.length})</span>
          </h4>

          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
            {history.encounters.map((enc) => (
              <div key={enc.id} className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="font-semibold text-slate-900 dark:text-white">
                    Muayene Tarihi: {new Date(enc.started_at).toLocaleDateString('tr-TR')} {new Date(enc.started_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    enc.status === 'completed' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {enc.status === 'completed' ? 'Tamamlandı' : 'Açık'}
                  </span>
                </div>

                {enc.reason_for_visit && (
                  <div className="text-xs text-slate-600 dark:text-slate-300">
                    <span className="font-semibold">Şikayet / Sebep:</span> {enc.reason_for_visit}
                  </div>
                )}

                {/* Read-Only Notes */}
                {enc.notes && enc.notes.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 space-y-2">
                    <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Tıbbi Notlar (SOAP):</div>
                    {enc.notes.map((note) => (
                      <div key={note.id} className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-xs space-y-1">
                        <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                          <span>Versiyon v{note.version} ({note.note_status === 'final' ? 'Kesin Not' : 'Taslak'})</span>
                          <span>{new Date(note.created_at).toLocaleString('tr-TR')}</span>
                        </div>
                        {note.subjective && <div><span className="font-semibold text-slate-700 dark:text-slate-300">S (Subjective):</span> {note.subjective}</div>}
                        {note.objective && <div><span className="font-semibold text-slate-700 dark:text-slate-300">O (Objective):</span> {note.objective}</div>}
                        {note.assessment && <div><span className="font-semibold text-slate-700 dark:text-slate-300">A (Assessment):</span> {note.assessment}</div>}
                        {note.plan && <div><span className="font-semibold text-slate-700 dark:text-slate-300">P (Plan):</span> {note.plan}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
