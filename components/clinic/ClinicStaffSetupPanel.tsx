import React, { useState, useEffect } from 'react';
import { Staff } from '../../types';
import { PractitionerType } from '../../types/clinic';
import { getStaffList } from '../../services/staffService';
import { clinicService } from '../../services/clinicService';
import { useTenant } from '../../contexts/TenantContext';
import { UserCheck, Shield, CheckCircle2, AlertCircle, Save, Stethoscope } from 'lucide-react';

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
      loadStaff();
    }
  }, [tenant?.id]);

  const loadStaff = async () => {
    setLoading(true);
    setError(null);
    try {
      if (tenant?.id) {
        const list = await getStaffList(tenant.id, { activeOnly: true });
        setStaffList(list);
        if (list.length > 0 && !selectedStaffId) {
          setSelectedStaffId(list[0].id);
          setForm(prev => ({ ...prev, staff_id: list[0].id }));
        }
      }
    } catch (err) {
      setError('Personel listesi yüklenirken hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const handleStaffSelect = (staffId: string) => {
    setSelectedStaffId(staffId);
    setForm(prev => ({ ...prev, staff_id: staffId }));
    setSuccessMsg(null);
    setError(null);
  };

  const handleWriteNotesToggle = (checked: boolean) => {
    // UI Invariant: can_write_clinical_notes => can_view_clinical_records
    setForm(prev => ({
      ...prev,
      can_write_clinical_notes: checked,
      can_view_clinical_records: checked ? true : prev.can_view_clinical_records
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.staff_id) return;
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
      } else {
        setError(res.error?.message || 'Yetki profili kaydedilemedi.');
      }
    } catch (err) {
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
        <div className="py-8 text-center text-sm text-slate-500">Personel bilgileri yükleniyor...</div>
      ) : staffList.length === 0 ? (
        <div className="py-8 text-center text-sm text-slate-500">
          İşletmenizde henüz kayıtlı personel bulunmuyor. Önce İşletme Yönetimi alanından personel ekleyin.
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
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.isOwner ? '(İşletme Sahibi)' : ''}
                  </option>
                ))}
              </select>
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
              disabled={saving}
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
