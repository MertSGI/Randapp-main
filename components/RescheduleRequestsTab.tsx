import React, { useState, useEffect, useRef } from 'react';
import { adminRescheduleService, PendingRescheduleRequestItem } from '../services/adminRescheduleService';
import { formatTurkishDate, getStatusDisplayLabel } from '../pages/AppointmentSelfServicePage';

interface RescheduleRequestsTabProps {
  userRole?: string;
  onAppointmentUpdated?: () => void;
}

export const RescheduleRequestsTab: React.FC<RescheduleRequestsTabProps> = ({
  userRole = 'tenant_owner',
  onAppointmentUpdated
}) => {
  const isAuthorized = userRole === 'tenant_owner' || userRole === 'super_admin';
  const isSuperAdmin = userRole === 'super_admin';

  const [requests, setRequests] = useState<PendingRescheduleRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Pagination state
  const [cursorCreatedAt, setCursorCreatedAt] = useState<string | null>(null);
  const [cursorId, setCursorId] = useState<string | null>(null);

  // Modal / Decision state
  const [selectedRequest, setSelectedRequest] = useState<PendingRescheduleRequestItem | null>(null);
  const [decisionType, setDecisionType] = useState<'approved' | 'rejected' | null>(null);
  const [adminReason, setAdminReason] = useState('');
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  // Idempotency key per request decision attempt
  const idempotencyKeysRef = useRef<Record<string, string>>({});

  useEffect(() => {
    if (isAuthorized) {
      loadInitialRequests();
    } else {
      setLoading(false);
    }
  }, [isAuthorized]);

  const loadInitialRequests = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await adminRescheduleService.listPendingRescheduleRequests({ limit: 50 });
      if (res.success) {
        setRequests(res.requests);
        if (res.requests.length > 0) {
          const last = res.requests[res.requests.length - 1];
          setCursorCreatedAt(last.created_at);
          setCursorId(last.change_request_id);
          setHasMore(res.requests.length >= 50);
        } else {
          setHasMore(false);
        }
      } else {
        setErrorMsg('Talepler yüklenirken bir hata oluştu. Lütfen tekrar deneyin.');
      }
    } catch (err) {
      console.error('Failed to load pending reschedule requests:', err);
      setErrorMsg('Talepler yüklenirken bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const loadMoreRequests = async () => {
    if (!cursorCreatedAt || !cursorId || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await adminRescheduleService.listPendingRescheduleRequests({
        limit: 50,
        cursorCreatedAt,
        cursorId
      });
      if (res.success && res.requests.length > 0) {
        setRequests(prev => [...prev, ...res.requests]);
        const last = res.requests[res.requests.length - 1];
        setCursorCreatedAt(last.created_at);
        setCursorId(last.change_request_id);
        setHasMore(res.requests.length >= 50);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error('Failed to load more requests:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleOpenDecisionModal = (req: PendingRescheduleRequestItem, decision: 'approved' | 'rejected') => {
    setSelectedRequest(req);
    setDecisionType(decision);
    setAdminReason('');
    setModalError(null);
  };

  const handleCloseModal = () => {
    setSelectedRequest(null);
    setDecisionType(null);
    setAdminReason('');
    setModalError(null);
  };

  const handleExecuteDecision = async () => {
    if (!selectedRequest || !decisionType || submittingId) return;

    const reqId = selectedRequest.change_request_id;
    setSubmittingId(reqId);
    setModalError(null);

    if (!idempotencyKeysRef.current[reqId]) {
      idempotencyKeysRef.current[reqId] = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `admin_dec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    try {
      const res = await adminRescheduleService.decideRescheduleRequest({
        changeRequestId: reqId,
        decision: decisionType,
        reason: decisionType === 'rejected' ? adminReason.trim() || undefined : undefined,
        idempotencyKey: idempotencyKeysRef.current[reqId]
      });

      if (res.success && res.reasonCode === 'ok') {
        // Success: Remove request from pending list
        setRequests(prev => prev.filter(r => r.change_request_id !== reqId));
        setSuccessMsg(res.message || (decisionType === 'approved' ? 'Randevu değişikliği onaylandı.' : 'Randevu değişikliği talebi reddedildi.'));
        handleCloseModal();
        if (onAppointmentUpdated) {
          onAppointmentUpdated();
        }
      } else if (res.reasonCode === 'slot_unavailable') {
        setModalError('Talep edilen saat artık uygun değil. Talep beklemede bırakıldı.');
        delete idempotencyKeysRef.current[reqId];
      } else if (res.reasonCode === 'request_already_resolved') {
        setRequests(prev => prev.filter(r => r.change_request_id !== reqId));
        handleCloseModal();
        setSuccessMsg('Bu talep daha önce sonuçlandırılmış.');
      } else {
        setModalError(res.message || 'İşlem gerçekleştirilemedi. Lütfen tekrar deneyin.');
      }
    } catch (err) {
      console.error('Decision execution failed:', err);
      setModalError('İşlem gerçekleştirilemedi. Lütfen tekrar deneyin.');
    } finally {
      setSubmittingId(null);
    }
  };

  if (!isAuthorized) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Randevu Değişiklik Talepleri</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Müşteriler tarafından iletilen saat değişikliği taleplerini buradan inceleyip onaylayabilir veya reddedebilirsiniz.
          </p>
        </div>
        <button
          type="button"
          onClick={loadInitialRequests}
          disabled={loading}
          className="self-start sm:self-center px-3.5 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 transition"
        >
          Yenile
        </button>
      </div>

      {/* Alert Messages */}
      {successMsg && (
        <div role="alert" className="p-4 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 text-xs rounded-xl border border-emerald-200 dark:border-emerald-800 flex items-center justify-between">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-600 hover:text-emerald-800 font-bold ml-4">✕</button>
        </div>
      )}

      {errorMsg && (
        <div role="alert" className="p-4 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200 text-xs rounded-xl border border-red-200 dark:border-red-800 flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-red-600 hover:text-red-800 font-bold ml-4">✕</button>
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2].map(n => (
            <div key={n} className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-gray-100 dark:border-slate-700 animate-pulse space-y-4">
              <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-1/4"></div>
              <div className="h-6 bg-gray-200 dark:bg-slate-700 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      ) : requests.length === 0 ? (
        /* Empty State */
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 p-12 text-center">
          <div className="w-12 h-12 bg-blue-50 dark:bg-blue-950/40 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-gray-900 dark:text-white">Bekleyen Talep Bulunmuyor</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm mx-auto">
            Bekleyen randevu değişikliği talebi bulunmuyor. Yeni bir talep iletildiğinde burada görüntülenecektir.
          </p>
        </div>
      ) : (
        /* Pending Requests List */
        <div className="space-y-4">
          {requests.map((req) => (
            <div
              key={req.change_request_id}
              className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 p-6 shadow-sm space-y-5"
            >
              {/* Header Info */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100 dark:border-slate-700/60">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 block mb-0.5">
                    {req.service_name} • {req.staff_name}
                  </span>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">
                    {req.customer_name || 'Müşteri'} {req.customer_phone ? `(${req.customer_phone})` : ''}
                  </h3>
                  {isSuperAdmin && (
                    <span className="text-[10px] font-mono text-gray-400 block mt-0.5">
                      İşletme / Tenant ID: {req.tenant_id}
                    </span>
                  )}
                </div>
                <div className="self-start sm:self-center flex items-center gap-2">
                  <span className="text-[11px] text-gray-400">
                    {new Date(req.created_at).toLocaleDateString('tr-TR')} {new Date(req.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="px-2.5 py-1 text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800 rounded-full">
                    Bekliyor
                  </span>
                </div>
              </div>

              {/* Schedule Comparison Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="bg-gray-50 dark:bg-slate-900/50 p-4 rounded-xl border border-gray-100 dark:border-slate-800">
                  <span className="text-gray-400 font-bold uppercase tracking-wider text-[10px] block mb-1">
                    Mevcut Randevu
                  </span>
                  <p className="font-semibold text-gray-800 dark:text-gray-200">
                    {formatTurkishDate(req.current_appointment_date)} - {req.current_appointment_time}
                  </p>
                  <span className="text-[10px] text-gray-400 mt-1 block">
                    Durum: {getStatusDisplayLabel(req.current_appointment_status)}
                  </span>
                </div>

                <div className="bg-blue-50/60 dark:bg-blue-950/20 p-4 rounded-xl border border-blue-100 dark:border-blue-900/40">
                  <span className="text-blue-600 dark:text-blue-400 font-bold uppercase tracking-wider text-[10px] block mb-1">
                    Talep Edilen Tarih ve Saat
                  </span>
                  <p className="font-bold text-blue-900 dark:text-blue-200 text-sm">
                    {formatTurkishDate(req.proposed_date)} - {req.proposed_time}
                  </p>
                  <span className="text-[10px] text-blue-700 dark:text-blue-300 mt-1 block">
                    {req.branch_name}
                  </span>
                </div>
              </div>

              {/* Customer Reason */}
              {req.customer_reason && (
                <div className="text-xs p-3.5 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-gray-100 dark:border-slate-800">
                  <span className="text-gray-400 font-bold uppercase tracking-wider text-[10px] block mb-0.5">
                    Müşteri Notu / Talep Nedeni
                  </span>
                  <p className="text-gray-700 dark:text-gray-300 font-medium italic">
                    "{req.customer_reason}"
                  </p>
                </div>
              )}

              {/* Action Controls */}
              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => handleOpenDecisionModal(req, 'rejected')}
                  disabled={submittingId === req.change_request_id}
                  className="px-4 py-2 text-xs font-semibold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/50 rounded-xl transition min-h-[38px]"
                >
                  Reddet
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenDecisionModal(req, 'approved')}
                  disabled={submittingId === req.change_request_id}
                  className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm transition min-h-[38px]"
                >
                  Onayla
                </button>
              </div>
            </div>
          ))}

          {/* Load More Button */}
          {hasMore && (
            <div className="pt-4 text-center">
              <button
                type="button"
                onClick={loadMoreRequests}
                disabled={loadingMore}
                className="px-5 py-2.5 text-xs font-semibold text-gray-700 dark:text-gray-200 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 transition"
              >
                {loadingMore ? 'Yükleniyor...' : 'Daha Fazla Yükle'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Decision Confirmation Modal */}
      {selectedRequest && decisionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="decision-modal-title"
            className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-gray-100 dark:border-slate-700 overflow-hidden my-8"
          >
            <div className="p-6 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
              <h3 id="decision-modal-title" className="text-lg font-bold text-gray-900 dark:text-white">
                {decisionType === 'approved' ? 'Randevu Değişikliğini Onayla' : 'Randevu Değişikliğini Reddet'}
              </h3>
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={submittingId === selectedRequest.change_request_id}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1.5 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              {modalError && (
                <div role="alert" className="p-3.5 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 rounded-xl border border-red-200 dark:border-red-800">
                  {modalError}
                </div>
              )}

              {/* Comparison Summary */}
              <div className="space-y-2 p-3.5 bg-gray-50 dark:bg-slate-900/50 rounded-xl border border-gray-100 dark:border-slate-800">
                <div>
                  <span className="text-gray-400 block text-[10px]">Müşteri</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">{selectedRequest.customer_name || 'Müşteri'}</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px]">Mevcut Zaman</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">{formatTurkishDate(selectedRequest.current_appointment_date)} {selectedRequest.current_appointment_time}</span>
                </div>
                <div>
                  <span className="text-blue-500 font-bold block text-[10px]">Talep Edilen Zaman</span>
                  <span className="font-bold text-blue-900 dark:text-blue-200">{formatTurkishDate(selectedRequest.proposed_date)} {selectedRequest.proposed_time}</span>
                </div>
              </div>

              {/* Approval Disclaimer */}
              {decisionType === 'approved' && (
                <div className="p-3.5 bg-amber-50/80 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 rounded-xl border border-amber-200 dark:border-amber-800">
                  Onay sırasında talep edilen saat yeniden kontrol edilir. Saat artık uygun değilse randevu değiştirilemez.
                </div>
              )}

              {/* Rejection Admin Reason Field */}
              {decisionType === 'rejected' && (
                <div>
                  <label htmlFor="admin-rejection-reason" className="block font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider text-[10px] mb-1">
                    Ret Gerekçesi (İsteğe Bağlı)
                  </label>
                  <textarea
                    id="admin-rejection-reason"
                    rows={3}
                    value={adminReason}
                    onChange={(e) => setAdminReason(e.target.value)}
                    placeholder="Müşteriye bildirilmek üzere ret gerekçesi girin..."
                    maxLength={300}
                    disabled={submittingId === selectedRequest.change_request_id}
                    className="w-full p-2.5 text-xs rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {/* Footer Buttons */}
              <div className="pt-3 border-t border-gray-100 dark:border-slate-700 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={submittingId === selectedRequest.change_request_id}
                  className="px-4 py-2 font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-xl transition min-h-[38px]"
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  onClick={handleExecuteDecision}
                  disabled={submittingId === selectedRequest.change_request_id}
                  className={`px-5 py-2 font-semibold text-white rounded-xl shadow-sm transition min-h-[38px] flex items-center gap-2 ${
                    decisionType === 'approved' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {submittingId === selectedRequest.change_request_id ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                      <span>İşleniyor...</span>
                    </>
                  ) : (
                    <span>{decisionType === 'approved' ? 'Onayla' : 'Reddet'}</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RescheduleRequestsTab;
