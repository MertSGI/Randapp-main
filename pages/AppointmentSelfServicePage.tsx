import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { 
  appointmentSelfServiceService,
  SelfServiceAppointmentResult
} from '../services/appointmentSelfServiceService';
import { Appointment, AppointmentAccessToken, Service, Staff, BusinessBranch } from '../types';

export function getStatusDisplayLabel(status?: string): string {
  switch (status) {
    case 'confirmed': return 'Onaylandı';
    case 'completed': return 'Tamamlandı';
    case 'no_show': return 'Gelmedi';
    case 'cancelled':
    case 'cancelled_by_customer': return 'İptal Edildi';
    case 'cancelled_by_salon': return 'İşletme Tarafından İptal Edildi';
    case 'cancelled_by_system': return 'Sistem Tarafından İptal Edildi';
    default: return 'Durum Bilinmiyor';
  }
}

export function formatTurkishDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    if (!year || !month || !day) return dateStr;
    const d = new Date(year, month - 1, day);
    return new Intl.DateTimeFormat('tr-TR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    }).format(d);
  } catch (e) {
    return dateStr;
  }
}

const AppointmentSelfServicePage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const effectiveToken = token || searchParams.get('token') || '';

  const [loading, setLoading] = useState(true);
  const [resultKind, setResultKind] = useState<'success' | 'invalid_token' | 'service_error' | 'none'>('none');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tokenObj, setTokenObj] = useState<AppointmentAccessToken | null>(null);
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [businessName, setBusinessName] = useState('Güzellik Salonu');
  const [accentColor, setAccentColor] = useState('#2563eb');
  
  const [joinedService, setJoinedService] = useState<Service | null>(null);
  const [joinedStaff, setJoinedStaff] = useState<Staff | null>(null);
  const [joinedBranch, setJoinedBranch] = useState<BusinessBranch | null>(null);

  // KVKK / Data Rights Form state
  const [showKvkkForm, setShowKvkkForm] = useState(false);
  const [kvkkType, setKvkkType] = useState<'access' | 'export' | 'deletion' | 'consent_withdrawal'>('export');
  const [kvkkDesc, setKvkkDesc] = useState('');
  const [kvkkSuccess, setKvkkSuccess] = useState<string | null>(null);

  // Deduplication ref to prevent duplicate RPC calls on re-renders / StrictMode
  const loadedTokenRef = useRef<string>('');

  useEffect(() => {
    if (effectiveToken) {
      if (loadedTokenRef.current !== effectiveToken) {
        loadedTokenRef.current = effectiveToken;
        loadSelfServiceDetails(effectiveToken);
      }
    } else {
      setLoading(false);
      setResultKind('invalid_token');
    }
  }, [effectiveToken]);

  const loadSelfServiceDetails = async (targetToken?: string) => {
    const tok = targetToken || effectiveToken;
    setLoading(true);
    setResultKind('none');
    setErrorMessage(null);

    try {
      const res: SelfServiceAppointmentResult = await appointmentSelfServiceService.getAppointmentByManageToken(tok);
      
      if (res.kind === 'success') {
        setResultKind('success');
        setTokenObj(res.tokenObj);
        setAppointment(res.appointment);

        if (res.rawData) {
          const raw = res.rawData;
          if (raw.service) {
            setJoinedService({
              id: raw.service.id || '',
              name: raw.service.name_tr || raw.service.name || 'Hizmet',
              name_tr: raw.service.name_tr || raw.service.name || 'Hizmet',
              duration: res.appointment.durationMinutes || 30,
              price: raw.service.price || 0
            });
          }
          if (raw.staff) {
            setJoinedStaff({
              id: raw.staff.id || '',
              name: raw.staff.name || 'Personel',
              title: raw.staff.title || '',
              active: true
            });
          }
          if (raw.branch) {
            setJoinedBranch({
              id: raw.branch.id || '',
              tenantId: res.appointment.tenantId || '',
              name: raw.branch.name || 'Şube',
              slug: '',
              isPrimary: true,
              isActive: true,
              createdAt: '',
              updatedAt: ''
            });
            if (raw.branch.name) {
              setBusinessName(raw.branch.name);
            }
          }
        }
      } else if (res.kind === 'invalid_token') {
        setResultKind('invalid_token');
      } else {
        setResultKind('service_error');
        setErrorMessage(res.message);
      }
    } catch (e: any) {
      console.error('Error loading self-service details', e);
      setResultKind('service_error');
      setErrorMessage(e?.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  // State 1: Loading
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 py-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
        <div className="max-w-xl w-full bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-8 space-y-6 animate-pulse">
          <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-1/3"></div>
          <div className="h-8 bg-gray-200 dark:bg-slate-700 rounded w-2/3"></div>
          <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-slate-700">
            <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-2/5"></div>
          </div>
        </div>
      </div>
    );
  }

  // State 3: Service Error (Retryable)
  if (resultKind === 'service_error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900 px-4 py-12">
        <div role="alert" aria-live="assertive" className="max-w-md w-full bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 text-center">
          <div className="w-16 h-16 bg-amber-50 dark:bg-amber-950/30 rounded-full flex items-center justify-center mx-auto mb-6" aria-hidden="true">
            <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Randevu Bilgilerine Ulaşılamıyor</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Randevu bilgileri şu anda kontrol edilemiyor. Lütfen kısa bir süre sonra tekrar deneyin.
          </p>
          <div className="space-y-3">
            <button 
              onClick={() => {
                loadedTokenRef.current = '';
                loadSelfServiceDetails(effectiveToken);
              }}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition min-h-[44px]"
            >
              Tekrar Dene
            </button>
            <button 
              onClick={() => navigate('/book')}
              className="w-full py-3 bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-gray-800 dark:text-gray-200 rounded-xl font-medium transition min-h-[44px]"
            >
              Randevu Sistemine Dön
            </button>
          </div>
        </div>
      </div>
    );
  }

  // State 4: Invalid Token (Neutral)
  if (resultKind !== 'success' || !appointment || !tokenObj) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900 px-4 py-12">
        <div role="alert" aria-live="polite" className="max-w-md w-full bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 text-center">
          <div className="w-16 h-16 bg-red-50 dark:bg-red-950/30 rounded-full flex items-center justify-center mx-auto mb-6" aria-hidden="true">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Bağlantı Geçersiz</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Bu randevu işlem bağlantısı geçersiz, süresi dolmuş veya iptal edilmiş olabilir. Lütfen size iletilen güncel bağlantıyı kontrol edin.
          </p>
          <button 
            onClick={() => navigate('/book')}
            className="w-full py-3 bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-gray-800 dark:text-gray-200 rounded-xl font-medium transition min-h-[44px]"
          >
            Randevu Sistemine Dön
          </button>
        </div>
      </div>
    );
  }

  // State 2: Success
  const selectedService = joinedService || { id: appointment.serviceId, name: 'Hizmet', name_tr: 'Hizmet', duration: appointment.durationMinutes || 30, price: 0 };
  const selectedStaff = joinedStaff || { id: appointment.staffId, name: 'Personel', title: '', active: true };
  const selectedBranch = joinedBranch || { id: appointment.branchId || '', tenantId: appointment.tenantId || '', name: businessName, slug: '', isPrimary: true, isActive: true, createdAt: '', updatedAt: '' };

  const statusLabel = getStatusDisplayLabel(appointment.status);
  const formattedDate = formatTurkishDate(appointment.date);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
        
        {/* Top Accent Line */}
        <div className="h-2" style={{ backgroundColor: accentColor }}></div>

        {/* Brand & Page Header */}
        <div className="p-6 sm:p-8 border-b border-gray-100 dark:border-slate-700/60">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-1">
                {businessName}
              </p>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Randevu Detayı</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Randevu bilgilerinizi aşağıdan görüntüleyebilirsiniz.
              </p>
            </div>
            
            {/* Status Badge */}
            <div className="self-start sm:self-center">
              <span className={`inline-flex items-center px-3.5 py-1.5 text-xs font-semibold rounded-full border ${
                appointment.status === 'confirmed' ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800' :
                appointment.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' :
                appointment.status === 'no_show' ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800' :
                appointment.status.includes('cancel') ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800' :
                'bg-gray-50 text-gray-700 border-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:border-slate-600'
              }`}>
                <span className={`w-2 h-2 rounded-full mr-2 ${
                  appointment.status === 'confirmed' ? 'bg-blue-500' :
                  appointment.status === 'completed' ? 'bg-emerald-500' :
                  appointment.status === 'no_show' ? 'bg-amber-500' :
                  appointment.status.includes('cancel') ? 'bg-red-500' :
                  'bg-gray-400'
                }`} aria-hidden="true"></span>
                {statusLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Primary Appointment Details */}
        <div className="p-6 sm:p-8 space-y-6">
          <div className="bg-gray-50 dark:bg-slate-900/40 rounded-xl p-5 border border-gray-100 dark:border-slate-800 space-y-4">
            <h2 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Randevu Özeti
            </h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              {appointment.user_name && (
                <div>
                  <span className="text-gray-400 block text-xs mb-0.5">Müşteri</span>
                  <span className="font-semibold text-gray-900 dark:text-white break-words">
                    {appointment.user_name}
                  </span>
                </div>
              )}

              <div>
                <span className="text-gray-400 block text-xs mb-0.5">Hizmet</span>
                <span className="font-semibold text-gray-900 dark:text-white break-words">
                  {selectedService.name_tr || selectedService.name}
                </span>
              </div>

              <div>
                <span className="text-gray-400 block text-xs mb-0.5">Uzman</span>
                <span className="font-semibold text-gray-900 dark:text-white break-words">
                  {selectedStaff.name} {selectedStaff.title ? `(${selectedStaff.title})` : ''}
                </span>
              </div>

              <div>
                <span className="text-gray-400 block text-xs mb-0.5">İşletme / Şube</span>
                <span className="font-semibold text-gray-900 dark:text-white break-words">
                  {selectedBranch.name}
                </span>
              </div>

              <div>
                <span className="text-gray-400 block text-xs mb-0.5">Tarih</span>
                <span className="font-semibold text-gray-900 dark:text-white break-words">
                  {formattedDate}
                </span>
              </div>

              <div>
                <span className="text-gray-400 block text-xs mb-0.5">Saat</span>
                <span className="font-semibold text-gray-900 dark:text-white break-words">
                  {appointment.time}
                </span>
              </div>

              <div>
                <span className="text-gray-400 block text-xs mb-0.5">Süre</span>
                <span className="font-semibold text-gray-900 dark:text-white break-words">
                  {appointment.durationMinutes || 30} dakika
                </span>
              </div>
            </div>
          </div>

          {/* Read-only Information Notice */}
          <div className="p-4 bg-blue-50/60 dark:bg-blue-950/20 rounded-xl border border-blue-100 dark:border-blue-900/40 text-xs text-blue-800 dark:text-blue-300 flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p>
              Bu sayfa şu anda randevu bilgilerinizi görüntülemek içindir. Randevu iptali ve saat değişikliği özellikleri henüz aktif değildir.
            </p>
          </div>

          {/* KVKK / Data Rights Option */}
          <div className="pt-2 border-t border-gray-100 dark:border-slate-700/60">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 dark:text-gray-400">KVKK Veri Hakkı Başvurusu</span>
              <button
                type="button"
                onClick={() => {
                  setShowKvkkForm(!showKvkkForm);
                  setKvkkSuccess(null);
                }}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 transition"
              >
                {showKvkkForm ? 'Kapat' : 'Talep Oluştur'}
              </button>
            </div>

            {showKvkkForm && (
              <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-gray-100 dark:border-slate-800 space-y-3">
                {kvkkSuccess ? (
                  <div className="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 p-3 rounded-lg border border-emerald-100 dark:border-emerald-900/40">
                    {kvkkSuccess}
                  </div>
                ) : (
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    if (!kvkkDesc.trim()) return;
                    import('../services/dataRightsRequestService').then(({ dataRightsRequestService }) => {
                      dataRightsRequestService.createDataRightsRequest({
                        tenantId: tokenObj?.tenantId || '',
                        requesterType: 'customer',
                        requesterName: appointment?.user_name || 'Ziyaretçi Müşteri',
                        requesterContact: appointment?.phone || appointment?.user_email || '',
                        type: kvkkType as any,
                        description: kvkkDesc,
                        relatedCustomerId: appointment?.customerId,
                        relatedAppointmentId: appointment?.id
                      });
                      setKvkkSuccess('KVKK Veri Hakkı Başvurunuz kaydedilmiştir. Kimlik doğrulaması sonrasında yasal süre (30 gün) içerisinde talebiniz sonuçlandırılıp tarafınıza bilgi verilecektir.');
                      setKvkkDesc('');
                    }).catch(err => {
                      console.error('Data rights submit failed:', err);
                    });
                  }} className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Talep Türü</label>
                      <select
                        value={kvkkType}
                        onChange={(e) => setKvkkType(e.target.value as any)}
                        className="w-full text-xs rounded-lg border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 text-gray-800 dark:text-white focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="export">Verilerimin Kopyasını Almak (Erişim/Taşınabilirlik)</option>
                        <option value="deletion">Hesabımı ve Tüm Randevularımı Silmek (Unutulma Hakkı)</option>
                        <option value="correction">Verilerimi Güncellemek/Düzeltmek</option>
                        <option value="consent_withdrawal">İletişim/Pazarlama İznimi İptal Etmek (Rıza Geri Çekme)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Açıklama & Doğrulama Bilgisi</label>
                      <textarea
                        required
                        rows={3}
                        value={kvkkDesc}
                        onChange={(e) => setKvkkDesc(e.target.value)}
                        placeholder="Örn: Bu telefon numarasına ait tüm randevu kayıtlarımın ve kişisel bilgilerimin kalıcı olarak silinmesini istiyorum."
                        className="w-full text-xs rounded-lg border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 text-gray-800 dark:text-white focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowKvkkForm(false)}
                        className="text-xs font-semibold text-gray-500 hover:bg-gray-100 px-3 py-1.5 rounded-lg dark:hover:bg-slate-800 min-h-[36px]"
                      >
                        Vazgeç
                      </button>
                      <button
                        type="submit"
                        className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors min-h-[36px]"
                      >
                        Talebi Gönder
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>

          {/* Action Navigation */}
          <div className="pt-4 border-t border-gray-100 dark:border-slate-700/60">
            <button
              type="button"
              onClick={() => navigate('/book')}
              className="w-full py-3 px-4 bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-gray-800 dark:text-gray-200 rounded-xl font-medium transition min-h-[44px] flex items-center justify-center gap-2"
            >
              <span>Randevu Sistemine Dön</span>
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default AppointmentSelfServicePage;
