import React, { useState, useEffect } from 'react';
import { Staff } from '../../types';
import { PractitionerType, ClinicStaffSetupProfile } from '../../types/clinic';
import { getStaffList } from '../../services/staffService';
import { clinicService } from '../../services/clinicService';
import { useTenant } from '../../contexts/TenantContext';
import { deriveClinicStaffSetupSelectionState, ClinicStaffSetupSelectionState } from '../../services/clinicUiPolicy';
import { Shield, CheckCircle2, AlertCircle, Save, UserCheck, AlertTriangle, Lock } from 'lucide-react';

interface StaffProfileForm {
  staff_id: string;
  practitioner_type: PractitionerType | '';
  specialty: string;
  medical_license_number: string;
  can_manage_patient_profiles: boolean;
  can_view_clinical_records: boolean;
  can_write_clinical_notes: boolean;
}

export const ClinicStaffSetupPanel: React.FC = () => {
  const { tenant } = useTenant();
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [setupProfilesMap, setSetupProfilesMap] = useState<Record<string, ClinicStaffSetupProfile> | null>(null);
  const [setupReadSuccess, setSetupReadSuccess] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [form, setForm] = useState<StaffProfileForm>({
    staff_id: '',
    practitioner_type: 'physician',
    specialty: '',
    medical_license_number: '',
    can_manage_patient_profiles: true,
    can_view_clinical_records: false,
    can_write_clinical_notes: false
  });
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    if (tenant?.id) {
      loadData();
    }
  }, [tenant?.id]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    setSetupReadSuccess(false);
    setSetupProfilesMap(null);

    try {
      if (tenant?.id) {
        // Fetch active tenant staff directory
        const list = await getStaffList(tenant.id, { activeOnly: true });
        setStaffList(list);

        // Fetch existing Clinic setup profiles for owner tenant
        const res = await clinicService.getClinicStaffSetupProfiles();
        if (res.success && res.data) {
          const profileMap: Record<string, ClinicStaffSetupProfile> = {};
          res.data.profiles.forEach(p => {
            profileMap[p.staff_id] = p;
          });
          setSetupProfilesMap(profileMap);
          setSetupReadSuccess(true);

          // Select initial staff
          const initialStaffId = selectedStaffId || (list.length > 0 ? list[0].id : '');
          if (initialStaffId) {
            setSelectedStaffId(initialStaffId);
            applyServerProfileToForm(initialStaffId, true, profileMap);
          }
        } else {
          setSetupReadSuccess(false);
          setError(res.error?.message || 'Klinik personel yetki profilleri sunucudan okunamadı (Setup read failed).');
        }
      }
    } catch {
      setSetupReadSuccess(false);
      setError('Personel ve yetki bilgileri yüklenirken hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const applyServerProfileToForm = (
    staffId: string,
    isReadSuccess: boolean,
    map: Record<string, ClinicStaffSetupProfile> | null
  ) => {
    const selectionState: ClinicStaffSetupSelectionState = deriveClinicStaffSetupSelectionState(
      staffId,
      isReadSuccess,
      map
    );

    if (selectionState === 'existing_profile' && map && map[staffId]) {
      const existing = map[staffId];
      setForm({
        staff_id: staffId,
        practitioner_type: existing.practitioner_type || 'physician',
        specialty: existing.specialty || '',
        medical_license_number: existing.medical_license_number || '',
        can_manage_patient_profiles: !!existing.can_manage_patient_profiles,
        can_view_clinical_records: !!existing.can_view_clinical_records,
        can_write_clinical_notes: !!existing.can_write_clinical_notes
      });
    } else if (selectionState === 'confirmed_unconfigured') {
      setForm({
        staff_id: staffId,
        practitioner_type: 'physician',
        specialty: '',
        medical_license_number: '',
        can_manage_patient_profiles: true,
        can_view_clinical_records: false,
        can_write_clinical_notes: false
      });
    }
  };

  const handleStaffSelect = (staffId: string) => {
    setSelectedStaffId(staffId);
    setSuccessMsg(null);
    setError(null);
    applyServerProfileToForm(staffId, setupReadSuccess, setupProfilesMap);
  };

  const handleWriteNotesToggle = (checked: boolean) => {
    setForm(prev => ({
      ...prev,
      can_write_clinical_notes: checked,
      can_view_clinical_records: checked ? true : prev.can_view_clinical_records
    }));
  };

  const selectionState: ClinicStaffSetupSelectionState = deriveClinicStaffSetupSelectionState(
    selectedStaffId,
    setupReadSuccess,
    setupProfilesMap
  );

  const canSave = setupReadSuccess && (selectionState === 'existing_profile' || selectionState === 'confirmed_unconfigured');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.staff_id || !canSave) return;
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await clinicService.setClinicStaffProfile({
        staff_id: form.staff_id,
        practitioner_type: form.practitioner_type || undefined,
        specialty: form.specialty.trim() || undefined,
        medical_license_number: form.medical_license_number.trim() || undefined,
        can_manage_patient_profiles: form.can_manage_patient_profiles,
        can_view_clinical_records: form.can_view_clinical_records,
        can_write_clinical_notes: form.can_write_clinical_notes
      });

      if (res.success) {
        setSuccessMsg('Klinik personel yetki profili başarıyla kaydedildi.');
        await loadData();
      } else {
        setError(res.error?.message || 'Yetki profili kaydedilemedi.');
      }
    } catch {
      setError('İşlem sırasında sunucu hatası oluştu.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
      <div className="flex items-center space-x-3 mb-6 pb-4 border-b border-slate-100 dark:border-slate-700">
        <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50">
          <Shield className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Klinik Kurulum & Personel Yetkilendirme (Setup Mode)</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Klinik modülü aktif. Personelinize klinik rol ve yetki tanımlamak için aşağıdaki formu kullanın.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl flex items-center space-x-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center space-x-2 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-sm text-slate-500">Personel ve yetki bilgileri yükleniyor...</div>
      ) : staffList.length === 0 ? (
        <div className="py-8 text-center text-sm text-slate-500">
          İşletmenizde henüz kayıtlı personel bulunmuyor. Önce İşletme Yönetimi alanından personel ekleyin.
        </div>
      ) : !setupReadSuccess ? (
        <div className="p-6 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-2xl text-center space-y-3">
          <Lock className="h-6 w-6 text-red-600 mx-auto" />
          <h3 className="text-sm font-bold text-red-800 dark:text-red-300">Sunucu Yetki Okuma Başarısız (Setup Read Failed)</h3>
          <p className="text-xs text-red-600 dark:text-red-400">
            Mevcut klinik personel profilleri sunucudan okunamadığı için körü körüne ezme yapılmasını önlemek amacıyla form kilitlenmiştir (Fail Closed).
          </p>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Yetkilendirilecek Personel Seçin
              </label>
              <select
                value={selectedStaffId}
                onChange={(e) => handleStaffSelect(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
              >
                {staffList.map((s) => {
                  const st = setupProfilesMap ? deriveClinicStaffSetupSelectionState(s.id, setupReadSuccess, setupProfilesMap) : 'setup_read_failed';
                  const hasProf = st === 'existing_profile';
                  return (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.isOwner ? '(İşletme Sahibi)' : ''} {hasProf ? '✓ [Klinik Tanımlı]' : '[Henüz Tanımlanmadı]'}
                    </option>
                  );
                })}
              </select>

              {/* Server Profile Status Badge */}
              <div className="mt-1.5 flex items-center space-x-2 text-xs">
                {selectionState === 'existing_profile' ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md font-semibold bg-emerald-100 text-emerald-800 text-[11px]">
                    <UserCheck className="h-3 w-3 mr-1" /> Mevcut Sunucu Konfigürasyonu Yüklendi
                  </span>
                ) : selectionState === 'confirmed_unconfigured' ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md font-semibold bg-amber-100 text-amber-800 text-[11px]">
                    <AlertTriangle className="h-3 w-3 mr-1" /> Henüz Klinik Profili Tanımlanmadı (Varsayılanlar Gösteriliyor)
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md font-semibold bg-red-100 text-red-800 text-[11px]">
                    <AlertCircle className="h-3 w-3 mr-1" /> Sunucu Yetki Okuma Hatası (Kayıt Engellendi)
                  </span>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Sağlık Uzmanlık Türü (Practitioner Type)
              </label>
              <select
                value={form.practitioner_type}
                onChange={(e) => setForm({ ...form, practitioner_type: e.target.value as PractitionerType })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
              >
                <option value="physician">Hekim / Doktor (Physician)</option>
                <option value="dentist">Diş Hekimi (Dentist)</option>
                <option value="nurse">Hemşire / Sağlık Personeli (Nurse)</option>
                <option value="physiotherapist">Fizyoterapist (Physiotherapist)</option>
                <option value="psychologist">Psikolog (Psychologist)</option>
                <option value="dietitian">Diyetisyen (Dietitian)</option>
                <option value="other">Diğer Sağlık Uzmanı (Other)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Uzmanlık Alanı / Branş
              </label>
              <input
                type="text"
                value={form.specialty}
                onChange={(e) => setForm({ ...form, specialty: e.target.value })}
                placeholder="Örn: Kardiyoloji, Ağız ve Diş Sağlığı"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Diploma / Tescil No (Opsiyonel)
              </label>
              <input
                type="text"
                value={form.medical_license_number}
                onChange={(e) => setForm({ ...form, medical_license_number: e.target.value })}
                placeholder="Diploma tescil numarası"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Capabilities Checkboxes */}
          <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-2">
              Klinik Yetki Matrisi
            </h3>

            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.can_manage_patient_profiles}
                onChange={(e) => setForm({ ...form, can_manage_patient_profiles: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Hasta Profil Bilgilerini Yönetebilir (Demografik, Kan Grubu, Acil İletişim)
              </span>
            </label>

            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.can_view_clinical_records}
                onChange={(e) => setForm({ ...form, can_view_clinical_records: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Klinik Geçmiş ve Tıbbi Kayıtları Görebilir (Önceki Muayeneler ve Notlar)
              </span>
            </label>

            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.can_write_clinical_notes}
                onChange={(e) => handleWriteNotesToggle(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Klinik Muayene Başlatabilir & Tıbbi Not (SOAP) Yazabilir
              </span>
            </label>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving || !canSave}
              className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl font-semibold text-sm text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              <Save className="h-4 w-4" />
              <span>{saving ? 'Kaydediliyor...' : 'Personel Yetki Profilini Kaydet'}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
