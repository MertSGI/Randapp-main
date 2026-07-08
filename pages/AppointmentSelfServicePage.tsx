import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  appointmentSelfServiceService 
} from '../services/appointmentSelfServiceService';
import { tenantService } from '../services/tenantService';
import { getServices } from '../services/serviceCatalogService';
import { getStaffList } from '../services/staffService';
import { branchService } from '../services/branchService';
import { Appointment, AppointmentAccessToken, AppointmentChangeRequest, Service, Staff, BusinessBranch } from '../types';

const AppointmentSelfServicePage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [isValid, setIsValid] = useState(false);
  const [tokenObj, setTokenObj] = useState<AppointmentAccessToken | null>(null);
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [businessName, setBusinessName] = useState('Güzellik Salonu');
  const [accentColor, setAccentColor] = useState('#2563eb');
  
  const [services, setServices] = useState<Service[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [branches, setBranches] = useState<BusinessBranch[]>([]);
  const [pendingRequests, setPendingRequests] = useState<AppointmentChangeRequest[]>([]);

  // Action states
  const [submittingAction, setSubmittingAction] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Cancellation form
  const [showCancelMode, setShowCancelMode] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // Reschedule form
  const [showRescheduleMode, setShowRescheduleMode] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [rescheduleNote, setRescheduleNote] = useState('');

  // KVKK / Data Rights Form state
  const [showKvkkForm, setShowKvkkForm] = useState(false);
  const [kvkkType, setKvkkType] = useState<'access' | 'export' | 'deletion' | 'consent_withdrawal'>('export');
  const [kvkkDesc, setKvkkDesc] = useState('');
  const [kvkkSuccess, setKvkkSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      loadSelfServiceDetails();
    }
  }, [token]);

  const loadSelfServiceDetails = async () => {
    setLoading(true);
    setIsValid(false);
    setActionSuccess(null);
    setActionError(null);

    try {
      const data = await appointmentSelfServiceService.getAppointmentByAccessToken(token || '');
      if (data) {
        setIsValid(true);
        setTokenObj(data.tokenObj);
        setAppointment(data.appointment);

        // Fetch companion data
        const [tObj, loadedServices, loadedStaff, loadedBranches] = await Promise.all([
          tenantService.getTenantById(data.tokenObj.tenantId),
          getServices(data.tokenObj.tenantId),
          getStaffList(data.tokenObj.tenantId),
          branchService.listBranches(data.tokenObj.tenantId)
        ]);

        if (tObj) {
          setBusinessName(tObj.branding?.businessName || tObj.name || 'Güzellik Salonu');
          setAccentColor(tObj.branding?.primaryColor || '#2563eb');
        }

        setServices(loadedServices);
        setStaffList(loadedStaff);
        setBranches(loadedBranches);

        // Fetch requests for this appointment
        const allRequests = await appointmentSelfServiceService.getAllChangeRequestsAsync(data.appointment.tenantId);
        const relevant = allRequests.filter(r => r.appointmentId === data.appointment.id);
        setPendingRequests(relevant);
      } else {
        setIsValid(false);
      }
    } catch (e) {
      console.error('Error loading self-service details', e);
      setIsValid(false);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!token) return;
    setSubmittingAction(true);
    setActionSuccess(null);
    setActionError(null);

    try {
      const ok = await appointmentSelfServiceService.confirmAppointmentByToken(token);
      if (ok) {
        setActionSuccess('Randevunuz başarıyla onaylandı.');
        await loadSelfServiceDetails();
      } else {
        setActionError('Randevu onaylama sırasında bir sorun oluştu.');
      }
    } catch (e) {
      setActionError('Sistem hatası meydana geldi.');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleCancelRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !cancelReason.trim()) return;
    setSubmittingAction(true);
    setActionSuccess(null);
    setActionError(null);

    try {
      const result = await appointmentSelfServiceService.requestAppointmentCancellation(token, cancelReason);
      if (result.success) {
        setActionSuccess(result.message);
        setShowCancelMode(false);
        setCancelReason('');
        await loadSelfServiceDetails();
      } else {
        setActionError(result.message);
      }
    } catch (e) {
      setActionError('Talep gönderilemedi.');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleRescheduleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !newDate || !newTime) return;
    setSubmittingAction(true);
    setActionSuccess(null);
    setActionError(null);

    try {
      const requestedDateTime = `${newDate} ${newTime}`;
      const result = await appointmentSelfServiceService.requestAppointmentReschedule(token, requestedDateTime, rescheduleNote);
      if (result.success) {
        setActionSuccess(result.message);
        setShowRescheduleMode(false);
        setNewDate('');
        setNewTime('');
        setRescheduleNote('');
        await loadSelfServiceDetails();
      } else {
        setActionError(result.message);
      }
    } catch (e) {
      setActionError('Erteleme talebi gönderilemedi.');
    } finally {
      setSubmittingAction(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent mx-auto mb-4"></div>
          <p className="text-gray-500 dark:text-gray-400">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (!isValid || !appointment || !tokenObj) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900 px-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 text-center">
          <div className="w-16 h-16 bg-red-50 dark:bg-red-950/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Bağlantı Geçersiz</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Bu randevu işlem bağlantısı geçersiz, süresi dolmuş veya iptal edilmiş olabilir. Lütfen size iletilen güncel bağlantıyı kontrol edin.
          </p>
          <button 
            onClick={() => navigate('/')}
            className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-gray-800 dark:text-gray-200 rounded-lg font-medium transition"
          >
            İşletme Anasayfasına Git
          </button>
        </div>
      </div>
    );
  }

  const selectedService = services.find(s => s.id === appointment.serviceId);
  const selectedStaff = staffList.find(s => s.id === appointment.staffId);
  const selectedBranch = branches.find(b => b.id === appointment.branchId);
  const policy = appointmentSelfServiceService.getBookingPolicy(tokenObj.tenantId);

  const parsedAptDate = appointment.date;
  const parsedAptTime = appointment.time;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
        
        {/* Header decoration */}
        <div className="h-2" style={{ backgroundColor: accentColor }}></div>

        {/* Content banner */}
        <div className="p-8 border-b border-gray-100 dark:border-slate-700/60 pb-6">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">{businessName}</p>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Randevu Yönetim Paneli</h1>
            </div>
            <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
              appointment.status === 'confirmed' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
              appointment.status === 'completed' ? 'bg-green-50 text-green-700 border border-green-100' :
              appointment.status.includes('cancel') ? 'bg-red-50 text-red-700 border border-red-100' :
              'bg-gray-50 text-gray-700 border border-gray-100'
            }`}>
              {appointment.status === 'confirmed' && 'Onaylandı'}
              {appointment.status === 'cancelled' && 'İptal Edildi'}
              {appointment.status === 'cancelled_by_customer' && 'Müşteri Tarafından İptal Edildi'}
              {appointment.status === 'cancelled_by_salon' && 'Salon Tarafından İptal Edildi'}
              {appointment.status === 'completed' && 'Tamamlandı'}
              {appointment.status === 'no_show' && 'No-Show'}
            </span>
          </div>
        </div>

        <div className="p-8 space-y-8">
          {/* Appointment details box */}
          <div className="bg-gray-50 dark:bg-slate-900/40 rounded-xl p-5 border border-gray-100 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-4">Randevu Detayları</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-6 text-sm">
              <div>
                <dt className="text-gray-400 mb-1">Müşteri</dt>
                <dd className="font-medium text-gray-800 dark:text-gray-200">{appointment.user_name}</dd>
              </div>
              <div>
                <dt className="text-gray-400 mb-1">Hizmet</dt>
                <dd className="font-medium text-gray-800 dark:text-gray-200">
                  {selectedService?.name_tr || selectedService?.name || 'Güzellik Hizmeti'}
                </dd>
              </div>
              <div>
                <dt className="text-gray-400 mb-1">Uzman</dt>
                <dd className="font-medium text-gray-800 dark:text-gray-200">
                  {selectedStaff?.name || 'Tüm Ekip'}
                </dd>
              </div>
              {selectedBranch && (
                <div>
                  <dt className="text-gray-400 mb-1">Şube</dt>
                  <dd className="font-medium text-gray-800 dark:text-gray-200">{selectedBranch.name}</dd>
                </div>
              )}
              <div>
                <dt className="text-gray-400 mb-1">Tarih ve Saat</dt>
                <dd className="font-medium text-gray-800 dark:text-gray-200 text-base">
                  {parsedAptDate} • {parsedAptTime}
                </dd>
              </div>
              {appointment.notes && (
                <div className="md:col-span-2">
                  <dt className="text-gray-400 mb-1">Randevu Notu</dt>
                  <dd className="italic text-gray-600 dark:text-gray-300">"{appointment.notes}"</dd>
                </div>
              )}
            </div>
          </div>

          {/* Messaging notices */}
          {actionSuccess && (
            <div className="p-4 bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 rounded-lg text-sm border border-green-100 dark:border-green-900">
              {actionSuccess}
            </div>
          )}

          {actionError && (
            <div className="p-4 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 rounded-lg text-sm border border-red-100 dark:border-red-900">
              {actionError}
            </div>
          )}

          {/* Pending requests log */}
          {pendingRequests.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">İşlem Geçmişi</h4>
              {pendingRequests.map(req => (
                <div key={req.id} className="p-4 rounded-xl border border-gray-100 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-800">
                  <div>
                    <p className="text-sm font-bold text-gray-800 dark:text-gray-200">
                      {req.type === 'cancellation' ? 'İptal Talebi' : 'Tarih Değişikliği Talebi'}
                    </p>
                    {req.type === 'reschedule' && req.requestedDateTime && (
                      <p className="text-xs text-gray-500 mt-1">İstenen Zaman: {req.requestedDateTime}</p>
                    )}
                    {req.reason && <p className="text-xs italic text-gray-400 mt-1">Neden: "{req.reason}"</p>}
                    {req.customerNote && <p className="text-xs italic text-gray-400 mt-1">Açıklama: "{req.customerNote}"</p>}
                    {req.ownerNote && <p className="text-xs font-medium text-accent mt-2">Mesaj: "{req.ownerNote}"</p>}
                  </div>
                  <span className={`px-2 py-1 text-[10px] uppercase tracking-wider font-bold rounded ${
                    req.status === 'requested' ? 'bg-orange-50 text-orange-600' :
                    req.status === 'approved' || req.status === 'applied' ? 'bg-green-50 text-green-600' :
                    'bg-gray-50 text-gray-600'
                  }`}>
                    {req.status === 'requested' ? 'Onay Bekliyor' :
                     req.status === 'approved' || req.status === 'applied' ? 'Uygulandı/Onaylandı' :
                     req.status === 'rejected' ? 'Reddedildi' : req.status}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Standard Actions buttons */}
          {appointment.status === 'confirmed' && !showCancelMode && !showRescheduleMode && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4">
              
              {/* Confirm status check */}
              {tokenObj.purpose === 'confirm' && (
                <button
                  onClick={handleConfirm}
                  disabled={submittingAction}
                  className="py-3 px-4 rounded-lg font-semibold text-white transition shadow-sm text-sm"
                  style={{ backgroundColor: accentColor }}
                >
                  {submittingAction ? 'Lütfen bekleyin...' : 'Randevumu Onaylıyorum'}
                </button>
              )}

              {policy.allowCustomerCancellation && !pendingRequests.some(r => r.type === 'cancellation' && r.status === 'requested') && (
                <button
                  onClick={() => setShowCancelMode(true)}
                  disabled={submittingAction}
                  className="py-3 px-4 rounded-lg font-semibold bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/20 dark:hover:bg-red-950/40 transition text-sm"
                >
                  İptal Etmek İstiyorum
                </button>
              )}

              {policy.allowCustomerRescheduleRequest && !pendingRequests.some(r => r.type === 'reschedule' && r.status === 'requested') && (
                <button
                  onClick={() => setShowRescheduleMode(true)}
                  disabled={submittingAction}
                  className="py-3 px-4 rounded-lg font-semibold bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-950/20 dark:hover:bg-blue-950/40 transition text-sm"
                >
                  Ertelemek İstiyorum
                </button>
              )}
            </div>
          )}

          {/* Cancellation section */}
          {showCancelMode && (
            <form onSubmit={handleCancelRequest} className="space-y-4 p-5 bg-red-50/40 dark:bg-red-950/10 rounded-xl border border-red-100 dark:border-red-950/30">
              <h4 className="text-sm font-bold text-red-700 dark:text-red-400">Randevu İptal Talebi Formu</h4>
              <p className="text-xs text-gray-500">
                Randevunuzu iptal etme nedeninizi yazın. Randevunuza en az <strong className="text-gray-700 dark:text-gray-300">{policy.cancellationWindowHours} saat</strong> kala yapılan iptal işlemleri doğrudan onaylanırken, daha geç iptaller salon onayına tabidir.
              </p>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-1">İptal Nedeni</label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={3}
                  required
                  placeholder="Sebebinizi kısaca belirtin..."
                  className="w-full rounded-md border-gray-200 dark:border-slate-800 shadow-sm focus:border-red-500 focus:ring-red-500 text-sm dark:bg-slate-900 dark:text-white p-2.5"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowCancelMode(false)}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 font-medium hover:underline"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={submittingAction || !cancelReason.trim()}
                  className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-md font-semibold transition"
                >
                  {submittingAction ? 'Gönderiliyor...' : 'İptali Gönder'}
                </button>
              </div>
            </form>
          )}

          {/* Reschedule section */}
          {showRescheduleMode && (
            <form onSubmit={handleRescheduleRequest} className="space-y-4 p-5 bg-blue-50/40 dark:bg-blue-950/10 rounded-xl border border-blue-100 dark:border-blue-950/30">
              <h4 className="text-sm font-bold text-blue-700 dark:text-blue-400">Randevu Erteleme/Değişiklik Talebi</h4>
              <p className="text-xs text-gray-500">
                Lütfen yeni tercih ettiğiniz tarih ve saati seçiniz. Değişiklik salon yöneticilerinin onayına sunulacaktır.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-1">Yeni Tarih</label>
                  <input
                    type="date"
                    required
                    value={newDate}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full rounded-md border-gray-200 dark:border-slate-800 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm dark:bg-slate-900 dark:text-white p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-1">Yeni Saat</label>
                  <input
                    type="time"
                    required
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="w-full rounded-md border-gray-200 dark:border-slate-800 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm dark:bg-slate-900 dark:text-white p-2"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-1">Ek Not (Müşteri Notu)</label>
                <textarea
                  value={rescheduleNote}
                  onChange={(e) => setRescheduleNote(e.target.value)}
                  rows={2}
                  placeholder="Eklemek istediğiniz bir ayrıntı..."
                  className="w-full rounded-md border-gray-200 dark:border-slate-800 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm dark:bg-slate-900 dark:text-white p-2"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowRescheduleMode(false)}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 font-medium hover:underline"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={submittingAction || !newDate || !newTime}
                  className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold transition"
                >
                  {submittingAction ? 'Gönderiliyor...' : 'Erteleme Talebi Gönder'}
                </button>
              </div>
            </form>
          )}

          {/* Cancellation policy card */}
          <div className="border-t border-gray-100 dark:border-slate-700/60 pt-6">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Salon Politikası ve Kurallar</h4>
            <ul className="space-y-1.5 text-xs text-gray-500 dark:text-gray-400">
              <li>• Randevunuzu rezerve tarihinden en az {policy.cancellationWindowHours} saat öncesine kadar ücretsiz iptal edebilirsiniz.</li>
              <li>• Erteleme talepleri salon yöneticisi tarafından kontrol edilerek yer durumuna göre onaylanmaktadır.</li>
              <li>• Katılmayacağınız randevuları iptal etmelisiniz; no-show limitleri aşıldığında online rezervasyon hakkınız engellenir.</li>
            </ul>
          </div>

          {/* KVKK / Data Rights Section */}
          <div className="border-t border-gray-100 dark:border-slate-700/60 pt-6 mt-6">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Kişisel Verilerin Korunması (KVKK)</h4>
                <p className="text-[10px] text-gray-400 mt-1">6698 Sayılı Kanun kapsamındaki haklarınızı buradan talep edebilirsiniz.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowKvkkForm(!showKvkkForm);
                  setKvkkSuccess(null);
                }}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400"
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
                        className="text-xs font-semibold text-gray-500 hover:bg-gray-100 px-3 py-1.5 rounded-lg dark:hover:bg-slate-800"
                      >
                        Vazgeç
                      </button>
                      <button
                        type="submit"
                        className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Talebi Gönder
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AppointmentSelfServicePage;
