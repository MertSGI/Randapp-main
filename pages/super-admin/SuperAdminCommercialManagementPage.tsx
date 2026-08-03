import React, { useState, useEffect } from 'react';
import { superAdminService, TenantFullData } from '../../services/superAdminService';
import { superAdminCommercialAdapter, CommercialPlanCatalogItem, TenantCommercialEnforcementSnapshot } from '../../services/superAdminCommercialAdapter';
import { useDialog } from '../../contexts/DialogContext';

export const SuperAdminCommercialManagementPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [tenants, setTenants] = useState<TenantFullData[]>([]);
  const [catalog, setCatalog] = useState<CommercialPlanCatalogItem[]>([]);
  
  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
  
  // Selected Tenant Commercial Detail State
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<TenantCommercialEnforcementSnapshot | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);

  // Modal / Dialog States
  const [activeModal, setActiveModal] = useState<'assign' | 'status' | 'schedule' | 'override' | 'billing' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Modal Form Inputs
  const [formPlanCode, setFormPlanCode] = useState('baslangic');
  const [formBillingMode, setFormBillingMode] = useState('manual');
  const [formStatus, setFormStatus] = useState('active');
  const [formOperatorReason, setFormOperatorReason] = useState('');
  const [formEffectiveAt, setFormEffectiveAt] = useState('');
  const [formFeatureKey, setFormFeatureKey] = useState('max_staff');
  const [formOverrideAction, setFormOverrideAction] = useState<'set' | 'revoke'>('set');
  const [formOverrideValue, setFormOverrideValue] = useState('1');
  const [formOverrideUnlimited, setFormOverrideUnlimited] = useState(false);
  const [formAmount, setFormAmount] = useState('0');
  const [formTxType, setFormTxType] = useState('subscription_charge');
  const [formTxStatus, setFormTxStatus] = useState('settled');

  const { alert: showAlert, confirm: showConfirm } = useDialog();

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [dashData, catalogData] = await Promise.all([
        superAdminService.getDashboardData(),
        superAdminCommercialAdapter.getPublicPlanCatalog().catch(() => [])
      ]);
      setTenants(dashData.tenants);
      setCatalog(catalogData);
    } catch (err: any) {
      console.error('Error loading commercial management data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadTenantSnapshot = async (tenantId: string) => {
    setSelectedTenantId(tenantId);
    setLoadingSnapshot(true);
    setSnapshotError(null);
    try {
      const snap = await superAdminCommercialAdapter.getTenantSnapshot(tenantId);
      setSnapshot(snap);
      if (!snap.success) {
        setSnapshotError(snap.reason_code || 'Snapshot alınamadı');
      }
    } catch (err: any) {
      setSnapshotError(err.message || 'Sunucu hatası');
    } finally {
      setLoadingSnapshot(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // Filtered Tenant Directory
  const filteredTenants = tenants.filter(t => {
    const nameMatch = (t.tenant.businessName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                      (t.tenant.slug || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                      t.tenant.id.toLowerCase().includes(searchQuery.toLowerCase());
    const statusMatch = statusFilter === 'all' || t.subscriptionStatus === statusFilter;
    const planMatch = planFilter === 'all' || t.planId === planFilter;
    return nameMatch && statusMatch && planMatch;
  });

  const selectedTenantData = tenants.find(t => t.tenant.id === selectedTenantId);

  // Generate Idempotency Key
  const generateIdempotencyKey = () => `idemp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  // Mutation Handlers
  const handleAssignPlan = async () => {
    if (!selectedTenantId) return;
    const confirmed = await showConfirm({
      message: `'${selectedTenantData?.tenant.businessName}' için '${formPlanCode}' planı atamak istediğinize emin misiniz?`
    });
    if (!confirmed) return;

    setSubmitting(true);
    try {
      const res = await superAdminCommercialAdapter.assignPlan({
        idempotencyKey: generateIdempotencyKey(),
        tenantId: selectedTenantId,
        planCode: formPlanCode,
        billingMode: formBillingMode,
        internalNote: formOperatorReason
      });
      if (res.success) {
        await showAlert('Ticari plan başarıyla atandı.', 'Başarılı');
        setActiveModal(null);
        loadTenantSnapshot(selectedTenantId);
      } else {
        await showAlert(`İşlem Başarısız. Neden Kodu: ${res.reason_code}`, 'Hata');
      }
    } catch (err: any) {
      await showAlert(`Sunucu Hatası: ${err.message}`, 'Hata');
    } finally {
      setSubmitting(false);
    }
  };

  const handleChangeStatus = async () => {
    if (!selectedTenantId || !formOperatorReason.trim()) {
      await showAlert('Lütfen operasyonel işlem nedenini giriniz.', 'Uyarı');
      return;
    }
    const confirmed = await showConfirm({
      message: `'${selectedTenantData?.tenant.businessName}' abonelik durumunu '${formStatus}' yapmak istediğinize emin misiniz?`
    });
    if (!confirmed) return;

    setSubmitting(true);
    try {
      const res = await superAdminCommercialAdapter.changeStatus({
        idempotencyKey: generateIdempotencyKey(),
        tenantId: selectedTenantId,
        targetStatus: formStatus,
        operatorReason: formOperatorReason
      });
      if (res.success) {
        await showAlert('Abonelik durumu güncellendi.', 'Başarılı');
        setActiveModal(null);
        loadTenantSnapshot(selectedTenantId);
      } else {
        await showAlert(`İşlem Başarısız. Neden Kodu: ${res.reason_code}`, 'Hata');
      }
    } catch (err: any) {
      await showAlert(`Sunucu Hatası: ${err.message}`, 'Hata');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSchedulePlanChange = async () => {
    if (!selectedTenantId || !formOperatorReason.trim() || !formEffectiveAt) {
      await showAlert('Lütfen hedef tarih ve işlem nedenini doldurunuz.', 'Uyarı');
      return;
    }
    setSubmitting(true);
    try {
      const res = await superAdminCommercialAdapter.schedulePlanChange({
        idempotencyKey: generateIdempotencyKey(),
        tenantId: selectedTenantId,
        targetPlanCode: formPlanCode,
        effectiveAt: new Date(formEffectiveAt).toISOString(),
        operatorReason: formOperatorReason
      });
      if (res.success) {
        await showAlert('İleri tarihli plan değişikliği planlandı.', 'Başarılı');
        setActiveModal(null);
        loadTenantSnapshot(selectedTenantId);
      } else {
        await showAlert(`İşlem Başarısız. Neden Kodu: ${res.reason_code}`, 'Hata');
      }
    } catch (err: any) {
      await showAlert(`Sunucu Hatası: ${err.message}`, 'Hata');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelScheduledChange = async () => {
    if (!selectedTenantId) return;
    const confirmed = await showConfirm({
      message: 'Planlanmış plan değişikliğini iptal etmek istediğinize emin misiniz?'
    });
    if (!confirmed) return;

    setSubmitting(true);
    try {
      const res = await superAdminCommercialAdapter.cancelScheduledPlanChange({
        idempotencyKey: generateIdempotencyKey(),
        tenantId: selectedTenantId,
        operatorReason: 'Super Admin UI cancellation'
      });
      if (res.success) {
        await showAlert('Planlanmış değişiklik iptal edildi.', 'Başarılı');
        loadTenantSnapshot(selectedTenantId);
      } else {
        await showAlert(`İşlem Başarısız. Neden Kodu: ${res.reason_code}`, 'Hata');
      }
    } catch (err: any) {
      await showAlert(`Sunucu Hatası: ${err.message}`, 'Hata');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApplyDueScheduledChange = async () => {
    if (!selectedTenantId) return;
    setSubmitting(true);
    try {
      const res = await superAdminCommercialAdapter.applyDueScheduledPlanChange({
        idempotencyKey: generateIdempotencyKey(),
        tenantId: selectedTenantId
      });
      if (res.success) {
        await showAlert('Vadesi gelmiş plan değişikliği uygulandı.', 'Başarılı');
        loadTenantSnapshot(selectedTenantId);
      } else {
        await showAlert(`İşlem Başarısız. Neden Kodu: ${res.reason_code}`, 'Hata');
      }
    } catch (err: any) {
      await showAlert(`Sunucu Hatası: ${err.message}`, 'Hata');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEntitlementOverride = async () => {
    if (!selectedTenantId || !formOperatorReason.trim()) {
      await showAlert('Lütfen operasyonel işlem nedenini giriniz.', 'Uyarı');
      return;
    }
    setSubmitting(true);
    try {
      const val: any = {};
      if (formOverrideUnlimited) {
        val.is_unlimited = true;
      } else {
        const parsedInt = parseInt(formOverrideValue, 10);
        if (!isNaN(parsedInt)) {
          val.integer_value = parsedInt;
        } else if (formOverrideValue === 'true' || formOverrideValue === 'false') {
          val.boolean_value = formOverrideValue === 'true';
        } else {
          val.text_value = formOverrideValue;
        }
      }

      const res = await superAdminCommercialAdapter.manageEntitlementOverride({
        idempotencyKey: generateIdempotencyKey(),
        tenantId: selectedTenantId,
        featureKey: formFeatureKey,
        action: formOverrideAction,
        overrideValue: formOverrideAction === 'set' ? val : undefined,
        operatorReason: formOperatorReason
      });
      if (res.success) {
        await showAlert('Hakkı ezme (Entitlement Override) işlemi başarıyla kaydedildi.', 'Başarılı');
        setActiveModal(null);
        loadTenantSnapshot(selectedTenantId);
      } else {
        await showAlert(`İşlem Başarısız. Neden Kodu: ${res.reason_code}`, 'Hata');
      }
    } catch (err: any) {
      await showAlert(`Sunucu Hatası: ${err.message}`, 'Hata');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecordBilling = async () => {
    if (!selectedTenantId || !formOperatorReason.trim()) {
      await showAlert('Lütfen operasyonel işlem nedenini giriniz.', 'Uyarı');
      return;
    }
    setSubmitting(true);
    try {
      const res = await superAdminCommercialAdapter.recordBillingTransaction({
        idempotencyKey: generateIdempotencyKey(),
        tenantId: selectedTenantId,
        amount: parseFloat(formAmount) || 0,
        currency: 'TRY',
        transactionType: formTxType,
        transactionStatus: formTxStatus,
        operatorReason: formOperatorReason
      });
      if (res.success) {
        await showAlert('Manuel cari finans kaydı başarıyla eklendi.', 'Başarılı');
        setActiveModal(null);
        loadTenantSnapshot(selectedTenantId);
      } else {
        await showAlert(`İşlem Başarısız. Neden Kodu: ${res.reason_code}`, 'Hata');
      }
    } catch (err: any) {
      await showAlert(`Sunucu Hatası: ${err.message}`, 'Hata');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-500 dark:text-gray-400">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
        Ticari Katalog ve İşletme Verileri Yükleniyor...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Ticari Yönetim & Abonelik Paneli</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Sunucu yetkili Super Admin ticari katalog, lisanslama, hak ezme (override) ve cari finans yönetim araçları.
          </p>
        </div>
        <span className="px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-full text-xs font-semibold border border-purple-200 dark:border-purple-800">
          SECURE RPC BACKED
        </span>
      </div>

      {/* Main Grid: Directory vs Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Tenant Directory (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 space-y-3">
            <h2 className="font-bold text-gray-900 dark:text-white text-base">İşletme Rehberi</h2>
            
            {/* Search Input */}
            <input
              type="text"
              placeholder="İşletme Adı, Slug veya ID ile Ara..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            {/* Filter Controls */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="px-2 py-1.5 border border-gray-200 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-900 text-gray-800 dark:text-gray-200"
              >
                <option value="all">Tüm Durumlar</option>
                <option value="active">Aktif</option>
                <option value="trialing">Deneme (Trial)</option>
                <option value="past_due">Gecikmiş (Past Due)</option>
                <option value="suspended">Askıda</option>
                <option value="cancelled">İptal</option>
              </select>

              <select
                value={planFilter}
                onChange={e => setPlanFilter(e.target.value)}
                className="px-2 py-1.5 border border-gray-200 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-900 text-gray-800 dark:text-gray-200"
              >
                <option value="all">Tüm Planlar</option>
                <option value="baslangic">Başlangıç</option>
                <option value="professional">Profesyonel</option>
                <option value="premium">Premium</option>
                <option value="kurumsal">Kurumsal</option>
              </select>
            </div>
          </div>

          {/* Tenant List Cards */}
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {filteredTenants.map(t => {
              const isSelected = t.tenant.id === selectedTenantId;
              return (
                <div
                  key={t.tenant.id}
                  onClick={() => loadTenantSnapshot(t.tenant.id)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50/50 dark:bg-blue-900/20 border-blue-500 dark:border-blue-500 shadow-sm'
                      : 'bg-white dark:bg-slate-800 border-gray-100 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <div className="font-bold text-sm text-gray-900 dark:text-white truncate">
                      {t.tenant.businessName || 'İsimsiz İşletme'}
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      t.subscriptionStatus === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                      t.subscriptionStatus === 'trialing' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                      t.subscriptionStatus === 'past_due' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                      'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-300'
                    }`}>
                      {t.subscriptionStatus}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400">
                    <span>Slug: {t.tenant.slug || 'N/A'}</span>
                    <span className="font-medium text-gray-700 dark:text-gray-300">Plan: {t.planId}</span>
                  </div>
                </div>
              );
            })}

            {filteredTenants.length === 0 && (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400 bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 text-sm">
                Arama kriterlerine uygun işletme bulunamadı.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Tenant Commercial Detail & Actions (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {!selectedTenantId ? (
            <div className="bg-white dark:bg-slate-800 p-12 rounded-2xl border border-gray-100 dark:border-slate-700 text-center text-gray-500 dark:text-gray-400 text-sm">
              Ticari detaylarını, abonelik durumunu ve kota teşhislerini görüntülemek için sol listeden bir işletme seçiniz.
            </div>
          ) : loadingSnapshot ? (
            <div className="bg-white dark:bg-slate-800 p-12 rounded-2xl border border-gray-100 dark:border-slate-700 text-center text-gray-500 dark:text-gray-400 text-sm">
              <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-2"></div>
              Sunucu Ticari Teşhis Envanteri Yükleniyor...
            </div>
          ) : snapshotError ? (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-6 rounded-2xl text-red-800 dark:text-red-300 text-sm">
              <h3 className="font-bold text-base mb-1">Teşhis Hatası</h3>
              <p>Sunucu snaphot döndüremedi: {snapshotError}</p>
            </div>
          ) : snapshot && (
            <div className="space-y-6">
              
              {/* Tenant Overview Card */}
              <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                      {selectedTenantData?.tenant.businessName}
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-0.5">
                      ID: {selectedTenantId} | Slug: {selectedTenantData?.tenant.slug}
                    </p>
                  </div>

                  {/* Operation Actions Bar */}
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => setActiveModal('assign')}
                      className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                    >
                      Plan Ata
                    </button>
                    <button
                      onClick={() => setActiveModal('status')}
                      className="px-3 py-1.5 text-xs font-semibold bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition"
                    >
                      Durum Değiştir
                    </button>
                    <button
                      onClick={() => setActiveModal('schedule')}
                      className="px-3 py-1.5 text-xs font-semibold bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
                    >
                      Plan Değişikliği Zamanla
                    </button>
                    <button
                      onClick={() => setActiveModal('override')}
                      className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
                    >
                      Hak Ezme (Override)
                    </button>
                    <button
                      onClick={() => setActiveModal('billing')}
                      className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
                    >
                      Manuel Cari Kayıt
                    </button>
                  </div>
                </div>

                {/* Subscription Details Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-gray-50 dark:bg-slate-900 rounded-xl text-xs">
                  <div>
                    <span className="text-gray-500 dark:text-gray-400 block">Abonelik Durumu</span>
                    <span className="font-bold text-gray-900 dark:text-white capitalize">
                      {snapshot.eligibility?.status || 'Yok'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400 block">Aktif Plan / Sürüm</span>
                    <span className="font-bold text-gray-900 dark:text-white">
                      {snapshot.eligibility?.plan_code || 'N/A'} (v{snapshot.eligibility?.version_number || 1})
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400 block">Faturalama Modu</span>
                    <span className="font-bold text-gray-900 dark:text-white capitalize">
                      {snapshot.eligibility?.billing_mode || 'manual'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400 block">Ticari Uygunluk</span>
                    <span className={`font-bold ${snapshot.eligibility?.eligible ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {snapshot.eligibility?.eligible ? 'UYGUN (ELIGIBLE)' : `ENGELLEME (${snapshot.eligibility?.reason_code})`}
                    </span>
                  </div>
                </div>

                {/* Scheduled Plan Change Banner if present */}
                {snapshot.eligibility?.scheduled_plan_id && (
                  <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl flex justify-between items-center text-xs text-purple-900 dark:text-purple-300">
                    <div>
                      <span className="font-bold">Planlanmış Plan Değişikliği Mevcut:</span> Target Plan: {snapshot.eligibility.scheduled_plan_id} | Yürürlük: {snapshot.eligibility.scheduled_change_at}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleApplyDueScheduledChange}
                        disabled={submitting}
                        className="px-2.5 py-1 bg-purple-600 text-white rounded font-semibold hover:bg-purple-700 transition"
                      >
                        Vadesi Gelen Değişikliği Uygula
                      </button>
                      <button
                        onClick={handleCancelScheduledChange}
                        disabled={submitting}
                        className="px-2.5 py-1 bg-red-600 text-white rounded font-semibold hover:bg-red-700 transition"
                      >
                        İptal Et
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Usage & Quota Diagnostic Panel */}
              <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm space-y-4">
                <h3 className="font-bold text-base text-gray-900 dark:text-white">Kota Teşhis ve Kullanım Sayaçları</h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Quota Feature Gates & Usage */}
                  {Object.entries(snapshot.feature_gates || {}).map(([key, gate]) => {
                    const usageVal = snapshot.usage?.[`${key}:${new Date().toISOString().substring(0, 7)}`] ?? 0;
                    const isUnlimited = gate.is_unlimited;
                    const limitVal = isUnlimited ? 'Sınırsız (Unlimited)' : gate.integer_value ?? (gate.boolean_value ? 'Etkin' : 'Devre Dışı');

                    return (
                      <div key={key} className="p-3 bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-800 text-xs space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-gray-900 dark:text-white">{key}</span>
                          <span className="px-1.5 py-0.5 bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded text-[10px]">
                            Kaynak: {gate.source}
                          </span>
                        </div>
                        <div className="text-gray-600 dark:text-gray-400">
                          Limit / Değer: <span className="font-medium text-gray-900 dark:text-white">{String(limitVal)}</span>
                        </div>
                        {key === 'max_monthly_appointments' && (
                          <div className="text-gray-600 dark:text-gray-400">
                            Cari Ay Kullanım (used_count / usage_count): <span className="font-bold text-blue-600 dark:text-blue-400">{usageVal}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          )}
        </div>
      </div>

      {/* MODAL DIALOGS FOR OPERATOR MUTATIONS */}
      {activeModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 border border-gray-100 dark:border-slate-700 shadow-2xl">
            
            {/* Modal Title */}
            <div className="flex justify-between items-center border-b border-gray-100 dark:border-slate-700 pb-3">
              <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                {activeModal === 'assign' && 'Ticari Plan Ata'}
                {activeModal === 'status' && 'Abonelik Durumu Değiştir'}
                {activeModal === 'schedule' && 'İleri Tarihli Plan Değişikliği'}
                {activeModal === 'override' && 'Hak Ezme (Entitlement Override)'}
                {activeModal === 'billing' && 'Manuel Cari Finans Kaydı'}
              </h3>
              <button onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 font-bold">✕</button>
            </div>

            {/* Modal Body Forms */}
            <div className="space-y-4 text-xs">
              {activeModal === 'assign' && (
                <>
                  <div>
                    <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Hedef Plan</label>
                    <select
                      value={formPlanCode}
                      onChange={e => setFormPlanCode(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg bg-gray-50 dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                    >
                      <option value="baslangic">Başlangıç (Baslangic)</option>
                      <option value="professional">Profesyonel (Professional)</option>
                      <option value="premium">Premium</option>
                      <option value="kurumsal">Kurumsal</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Faturalama Modu</label>
                    <select
                      value={formBillingMode}
                      onChange={e => setFormBillingMode(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg bg-gray-50 dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                    >
                      <option value="manual">Manuel (Manual)</option>
                      <option value="automated">Otomatik (Automated)</option>
                    </select>
                  </div>
                </>
              )}

              {activeModal === 'status' && (
                <>
                  <div>
                    <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Hedef Abonelik Durumu</label>
                    <select
                      value={formStatus}
                      onChange={e => setFormStatus(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg bg-gray-50 dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                    >
                      <option value="active">Aktif (active)</option>
                      <option value="trialing">Deneme (trialing)</option>
                      <option value="past_due">Gecikmiş (past_due)</option>
                      <option value="paused">Duraklatıldı (paused)</option>
                      <option value="suspended">Askıda (suspended)</option>
                      <option value="cancelled">İptal Edildi (cancelled)</option>
                    </select>
                  </div>
                </>
              )}

              {activeModal === 'schedule' && (
                <>
                  <div>
                    <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Hedef Plan</label>
                    <select
                      value={formPlanCode}
                      onChange={e => setFormPlanCode(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg bg-gray-50 dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                    >
                      <option value="baslangic">Başlangıç</option>
                      <option value="professional">Profesyonel</option>
                      <option value="premium">Premium</option>
                      <option value="kurumsal">Kurumsal</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Yürürlük Tarihi</label>
                    <input
                      type="datetime-local"
                      value={formEffectiveAt}
                      onChange={e => setFormEffectiveAt(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg bg-gray-50 dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                    />
                  </div>
                </>
              )}

              {activeModal === 'override' && (
                <>
                  <div>
                    <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Özellik Anahtarı (Feature Key)</label>
                    <select
                      value={formFeatureKey}
                      onChange={e => setFormFeatureKey(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg bg-gray-50 dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                    >
                      <option value="max_staff">Maksimum Personel (max_staff)</option>
                      <option value="max_services">Maksimum Hizmet (max_services)</option>
                      <option value="max_branches">Maksimum Şube (max_branches)</option>
                      <option value="max_monthly_appointments">Aylık Randevu (max_monthly_appointments)</option>
                      <option value="core_booking">Online Randevu (core_booking)</option>
                      <option value="customer_cancellation">Müşteri İptali (customer_cancellation)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Eylem</label>
                    <select
                      value={formOverrideAction}
                      onChange={e => setFormOverrideAction(e.target.value as any)}
                      className="w-full px-3 py-2 border rounded-lg bg-gray-50 dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                    >
                      <option value="set">Ezme Değeri Ata (Set)</option>
                      <option value="revoke">Ezmeyi Kaldır (Revoke)</option>
                    </select>
                  </div>
                  {formOverrideAction === 'set' && (
                    <>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="unlimited_chk"
                          checked={formOverrideUnlimited}
                          onChange={e => setFormOverrideUnlimited(e.target.checked)}
                        />
                        <label htmlFor="unlimited_chk" className="font-medium text-gray-700 dark:text-gray-300">Sınırsız (Unlimited) Olarak İşaretle</label>
                      </div>
                      {!formOverrideUnlimited && (
                        <div>
                          <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Ezme Değeri</label>
                          <input
                            type="text"
                            value={formOverrideValue}
                            onChange={e => setFormOverrideValue(e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg bg-gray-50 dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                            placeholder="Örn: 5, true, lite"
                          />
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {activeModal === 'billing' && (
                <>
                  <div>
                    <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Tutar (TRY)</label>
                    <input
                      type="number"
                      value={formAmount}
                      onChange={e => setFormAmount(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg bg-gray-50 dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">İşlem Tipi</label>
                    <select
                      value={formTxType}
                      onChange={e => setFormTxType(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg bg-gray-50 dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                    >
                      <option value="subscription_charge">Abonelik Tahsilatı</option>
                      <option value="setup_fee">Kurulum Ücreti</option>
                      <option value="adjustment">Düzeltme / İade Kaydı</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">İşlem Durumu</label>
                    <select
                      value={formTxStatus}
                      onChange={e => setFormTxStatus(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg bg-gray-50 dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                    >
                      <option value="settled">Tamamlandı (Settled)</option>
                      <option value="pending">Bekliyor (Pending)</option>
                      <option value="failed">Başarısız (Failed)</option>
                    </select>
                  </div>
                </>
              )}

              {/* Common Required Operator Reason Field */}
              <div>
                <label className="block font-semibold text-gray-900 dark:text-white mb-1">Operasyonel İşlem Nedeni (Zorunlu Audit Log)</label>
                <textarea
                  rows={2}
                  value={formOperatorReason}
                  onChange={e => setFormOperatorReason(e.target.value)}
                  placeholder="İşlem gerekçesini giriniz..."
                  className="w-full px-3 py-2 border rounded-lg bg-gray-50 dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-2 border-t border-gray-100 dark:border-slate-700 pt-3">
              <button
                onClick={() => setActiveModal(null)}
                disabled={submitting}
                className="px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition"
              >
                Vazgeç
              </button>
              <button
                onClick={() => {
                  if (activeModal === 'assign') handleAssignPlan();
                  if (activeModal === 'status') handleChangeStatus();
                  if (activeModal === 'schedule') handleSchedulePlanChange();
                  if (activeModal === 'override') handleEntitlementOverride();
                  if (activeModal === 'billing') handleRecordBilling();
                }}
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition disabled:opacity-50"
              >
                {submitting ? 'İşlem Gönderiliyor...' : 'Onayla ve Kaydet'}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminCommercialManagementPage;
