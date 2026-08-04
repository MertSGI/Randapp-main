import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  superAdminCommercialAdapter,
  CommercialPlanCatalogItem,
  TenantCommercialEnforcementSnapshot,
  CommercialDirectoryTenantItem,
  PlatformRestrictionItem,
  BillingTransactionItem
} from '../../services/superAdminCommercialAdapter';
import { useDialog } from '../../contexts/DialogContext';

export const SuperAdminCommercialManagementPage: React.FC = () => {
  // Directory State
  const [loadingDirectory, setLoadingDirectory] = useState(true);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [tenants, setTenants] = useState<CommercialDirectoryTenantItem[]>([]);
  const [totalTenantsCount, setTotalTenantsCount] = useState(0);
  const [directoryPage, setDirectoryPage] = useState(0);
  const directoryLimit = 10;

  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');

  // Plan Catalog State
  const [catalog, setCatalog] = useState<CommercialPlanCatalogItem[]>([]);

  // Selected Tenant Commercial Detail State
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<TenantCommercialEnforcementSnapshot | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);

  // Platform Restrictions State
  const [loadingRestrictions, setLoadingRestrictions] = useState(true);
  const [restrictionsError, setRestrictionsError] = useState<string | null>(null);
  const [restrictions, setRestrictions] = useState<PlatformRestrictionItem[]>([]);
  const [restrictionsTotalCount, setRestrictionsTotalCount] = useState(0);
  const [restrictionScopeFilter, setRestrictionScopeFilter] = useState<'all' | 'global' | 'tenant'>('all');
  const [restrictionFeatureFilter, setRestrictionFeatureFilter] = useState('all');
  const [restrictionActiveOnly, setRestrictionActiveOnly] = useState(false);

  // Billing Ledger State
  const [loadingBilling, setLoadingBilling] = useState(true);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billingTransactions, setBillingTransactions] = useState<BillingTransactionItem[]>([]);
  const [billingTotalCount, setBillingTotalCount] = useState(0);
  const [billingPage, setBillingPage] = useState(0);
  const billingLimit = 10;

  // Modal / Dialog States
  const [activeModal, setActiveModal] = useState<'assign' | 'status' | 'schedule' | 'override' | 'billing' | 'create_restriction' | 'end_restriction' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const activeSubmissionIdempKeyRef = useRef<string | null>(null);

  // Selected Restriction for Ending
  const [selectedRestriction, setSelectedRestriction] = useState<PlatformRestrictionItem | null>(null);

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

  // Restriction Form Inputs
  const [formRestrictionScope, setFormRestrictionScope] = useState<'global' | 'tenant'>('tenant');
  const [formRestrictionTenantId, setFormRestrictionTenantId] = useState('');
  const [formRestrictionFeatureKey, setFormRestrictionFeatureKey] = useState('core_booking');
  const [formRestrictionReason, setFormRestrictionReason] = useState('');
  const [formRestrictionStartsAt, setFormRestrictionStartsAt] = useState('');
  const [formRestrictionExpiresAt, setFormRestrictionExpiresAt] = useState('');

  const { alert: showAlert, confirm: showConfirm } = useDialog();

  // Helper: Stable Idempotency Key per submission
  const getOrCreateIdempotencyKey = () => {
    if (!activeSubmissionIdempKeyRef.current) {
      activeSubmissionIdempKeyRef.current = `idemp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
    return activeSubmissionIdempKeyRef.current;
  };

  const clearIdempotencyKey = () => {
    activeSubmissionIdempKeyRef.current = null;
  };

  // 1. Fetch Server-Backed Commercial Tenant Directory
  const loadDirectory = useCallback(async () => {
    setLoadingDirectory(true);
    setDirectoryError(null);
    try {
      const res = await superAdminCommercialAdapter.listTenantCommercialDirectory({
        search: searchQuery.trim() || null,
        status: statusFilter,
        planCode: planFilter,
        limit: directoryLimit,
        offset: directoryPage * directoryLimit
      });
      if (res.success) {
        setTenants(res.tenants || []);
        setTotalTenantsCount(res.total_count || 0);
      } else {
        setDirectoryError(`Hata Kodu: ${res.reason_code}`);
      }
    } catch (err: any) {
      setDirectoryError(err.message || 'Sunucu hatası');
    } finally {
      setLoadingDirectory(false);
    }
  }, [searchQuery, statusFilter, planFilter, directoryPage]);

  // 2. Fetch Platform Restrictions
  const loadRestrictions = useCallback(async () => {
    setLoadingRestrictions(true);
    setRestrictionsError(null);
    try {
      let targetTenantId: string | null = null;
      if (restrictionScopeFilter === 'tenant') {
        targetTenantId = selectedTenantId || null;
      }

      const res = await superAdminCommercialAdapter.listPlatformRestrictions({
        tenantId: targetTenantId,
        featureKey: restrictionFeatureFilter === 'all' ? null : restrictionFeatureFilter,
        activeOnly: restrictionActiveOnly || null,
        limit: 50,
        offset: 0
      });

      if (res.success) {
        let items = res.restrictions || [];
        if (restrictionScopeFilter === 'global') {
          items = items.filter(r => r.tenant_id === null);
        }
        setRestrictions(items);
        setRestrictionsTotalCount(items.length);
      } else {
        setRestrictionsError(`Hata Kodu: ${res.reason_code}`);
      }
    } catch (err: any) {
      setRestrictionsError(err.message || 'Sunucu hatası');
    } finally {
      setLoadingRestrictions(false);
    }
  }, [selectedTenantId, restrictionScopeFilter, restrictionFeatureFilter, restrictionActiveOnly]);

  // 3. Fetch Billing Ledger Transactions
  const loadBillingTransactions = useCallback(async () => {
    setLoadingBilling(true);
    setBillingError(null);
    try {
      const res = await superAdminCommercialAdapter.getBillingTransactions({
        tenantId: selectedTenantId || null,
        limit: billingLimit,
        offset: billingPage * billingLimit
      });
      if (res.success) {
        setBillingTransactions(res.transactions || []);
        setBillingTotalCount(res.total_count || 0);
      } else {
        setBillingError(`Hata Kodu: ${res.reason_code}`);
      }
    } catch (err: any) {
      setBillingError(err.message || 'Sunucu hatası');
    } finally {
      setLoadingBilling(false);
    }
  }, [selectedTenantId, billingPage]);

  // 4. Fetch Tenant Snapshot
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

  // Initial Catalog Load
  useEffect(() => {
    superAdminCommercialAdapter.getPublicPlanCatalog()
      .then(data => setCatalog(data))
      .catch(() => setCatalog([]));
  }, []);

  // Directory Effect
  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  // Restrictions & Billing Effect when selected tenant or filters change
  useEffect(() => {
    loadRestrictions();
    loadBillingTransactions();
  }, [loadRestrictions, loadBillingTransactions]);

  const selectedTenantData = tenants.find(t => t.tenant_id === selectedTenantId);

  // Refresh All Affected Views
  const refreshAllViews = async () => {
    await Promise.all([
      loadDirectory(),
      loadRestrictions(),
      loadBillingTransactions(),
      selectedTenantId ? loadTenantSnapshot(selectedTenantId) : Promise.resolve()
    ]);
  };

  // ── Mutation Handlers ──────────────────────────────────────────────────────

  const handleAssignPlan = async () => {
    if (!selectedTenantId || submitting) return;
    const confirmed = await showConfirm({
      message: `'${selectedTenantData?.business_name || selectedTenantId}' için '${formPlanCode}' planı atamak istediğinize emin misiniz?`
    });
    if (!confirmed) return;

    setSubmitting(true);
    const key = getOrCreateIdempotencyKey();
    try {
      const res = await superAdminCommercialAdapter.assignPlan({
        idempotencyKey: key,
        tenantId: selectedTenantId,
        planCode: formPlanCode,
        billingMode: formBillingMode,
        internalNote: formOperatorReason
      });
      if (res.success) {
        await showAlert(res.replayed ? 'İşlem tekrarlandı (Replayed).' : 'Ticari plan başarıyla atandı.', 'Başarılı');
        setActiveModal(null);
        clearIdempotencyKey();
        refreshAllViews();
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
    if (!selectedTenantId || submitting) return;
    if (!formOperatorReason.trim()) {
      await showAlert('Lütfen operasyonel işlem nedenini giriniz.', 'Uyarı');
      return;
    }
    const confirmed = await showConfirm({
      message: `'${selectedTenantData?.business_name || selectedTenantId}' abonelik durumunu '${formStatus}' yapmak istediğinize emin misiniz?`
    });
    if (!confirmed) return;

    setSubmitting(true);
    const key = getOrCreateIdempotencyKey();
    try {
      const res = await superAdminCommercialAdapter.changeStatus({
        idempotencyKey: key,
        tenantId: selectedTenantId,
        targetStatus: formStatus,
        operatorReason: formOperatorReason
      });
      if (res.success) {
        await showAlert(res.replayed ? 'İşlem tekrarlandı (Replayed).' : 'Abonelik durumu güncellendi.', 'Başarılı');
        setActiveModal(null);
        clearIdempotencyKey();
        refreshAllViews();
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
    if (!selectedTenantId || submitting) return;
    if (!formOperatorReason.trim() || !formEffectiveAt) {
      await showAlert('Lütfen hedef tarih ve işlem nedenini doldurunuz.', 'Uyarı');
      return;
    }
    setSubmitting(true);
    const key = getOrCreateIdempotencyKey();
    try {
      const res = await superAdminCommercialAdapter.schedulePlanChange({
        idempotencyKey: key,
        tenantId: selectedTenantId,
        targetPlanCode: formPlanCode,
        effectiveAt: new Date(formEffectiveAt).toISOString(),
        operatorReason: formOperatorReason
      });
      if (res.success) {
        await showAlert(res.replayed ? 'İşlem tekrarlandı (Replayed).' : 'İleri tarihli plan değişikliği planlandı.', 'Başarılı');
        setActiveModal(null);
        clearIdempotencyKey();
        refreshAllViews();
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
    if (!selectedTenantId || submitting) return;
    const confirmed = await showConfirm({
      message: 'Planlanmış plan değişikliğini iptal etmek istediğinize emin misiniz?'
    });
    if (!confirmed) return;

    setSubmitting(true);
    const key = getOrCreateIdempotencyKey();
    try {
      const res = await superAdminCommercialAdapter.cancelScheduledPlanChange({
        idempotencyKey: key,
        tenantId: selectedTenantId,
        operatorReason: 'Super Admin UI cancellation'
      });
      if (res.success) {
        await showAlert(res.replayed ? 'İşlem tekrarlandı (Replayed).' : 'Planlanmış değişiklik iptal edildi.', 'Başarılı');
        clearIdempotencyKey();
        refreshAllViews();
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
    if (!selectedTenantId || submitting) return;
    setSubmitting(true);
    const key = getOrCreateIdempotencyKey();
    try {
      const res = await superAdminCommercialAdapter.applyDueScheduledPlanChange({
        idempotencyKey: key,
        tenantId: selectedTenantId
      });
      if (res.success) {
        await showAlert(res.replayed ? 'İşlem tekrarlandı (Replayed).' : 'Vadesi gelmiş plan değişikliği uygulandı.', 'Başarılı');
        clearIdempotencyKey();
        refreshAllViews();
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
    if (!selectedTenantId || submitting) return;
    if (!formOperatorReason.trim()) {
      await showAlert('Lütfen operasyonel işlem nedenini giriniz.', 'Uyarı');
      return;
    }
    setSubmitting(true);
    const key = getOrCreateIdempotencyKey();
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
        idempotencyKey: key,
        tenantId: selectedTenantId,
        featureKey: formFeatureKey,
        action: formOverrideAction,
        overrideValue: formOverrideAction === 'set' ? val : undefined,
        operatorReason: formOperatorReason
      });
      if (res.success) {
        await showAlert(res.replayed ? 'İşlem tekrarlandı (Replayed).' : 'Hakkı ezme (Entitlement Override) kaydı güncellendi.', 'Başarılı');
        setActiveModal(null);
        clearIdempotencyKey();
        refreshAllViews();
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
    if (!selectedTenantId || submitting) return;
    if (!formOperatorReason.trim()) {
      await showAlert('Lütfen operasyonel işlem nedenini giriniz.', 'Uyarı');
      return;
    }
    setSubmitting(true);
    const key = getOrCreateIdempotencyKey();
    try {
      const res = await superAdminCommercialAdapter.recordBillingTransaction({
        idempotencyKey: key,
        tenantId: selectedTenantId,
        amount: parseFloat(formAmount) || 0,
        currency: 'TRY',
        transactionType: formTxType,
        transactionStatus: formTxStatus,
        operatorReason: formOperatorReason
      });
      if (res.success) {
        await showAlert(res.replayed ? 'İşlem tekrarlandı (Replayed).' : 'Manuel cari finans kaydı başarıyla eklendi.', 'Başarılı');
        setActiveModal(null);
        clearIdempotencyKey();
        refreshAllViews();
      } else {
        await showAlert(`İşlem Başarısız. Neden Kodu: ${res.reason_code}`, 'Hata');
      }
    } catch (err: any) {
      await showAlert(`Sunucu Hatası: ${err.message}`, 'Hata');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateRestriction = async () => {
    if (submitting) return;
    if (!formRestrictionReason.trim()) {
      await showAlert('Lütfen kısıtlama koyma nedenini belirtiniz.', 'Uyarı');
      return;
    }
    const targetTenant = formRestrictionScope === 'tenant' ? (formRestrictionTenantId.trim() || selectedTenantId || null) : null;
    if (formRestrictionScope === 'tenant' && !targetTenant) {
      await showAlert('Lütfen bir İşletme UUID belirtiniz veya listeden işletme seçiniz.', 'Uyarı');
      return;
    }

    const confirmed = await showConfirm({
      message: `${formRestrictionScope === 'global' ? 'Tüm platform genelinde (GLOBAL)' : `'${targetTenant}' işletmesinde`} '${formRestrictionFeatureKey}' özelliğini kısıtlamak istediğinize emin misiniz?`
    });
    if (!confirmed) return;

    setSubmitting(true);
    const key = getOrCreateIdempotencyKey();
    try {
      const res = await superAdminCommercialAdapter.createPlatformRestriction({
        idempotencyKey: key,
        tenantId: targetTenant,
        featureKey: formRestrictionFeatureKey,
        reason: formRestrictionReason,
        startsAt: formRestrictionStartsAt ? new Date(formRestrictionStartsAt).toISOString() : null,
        expiresAt: formRestrictionExpiresAt ? new Date(formRestrictionExpiresAt).toISOString() : null
      });
      if (res.success) {
        await showAlert(res.replayed ? 'İşlem tekrarlandı (Replayed).' : 'Platform kısıtlaması başarıyla oluşturuldu.', 'Başarılı');
        setActiveModal(null);
        clearIdempotencyKey();
        refreshAllViews();
      } else {
        await showAlert(`İşlem Başarısız. Neden Kodu: ${res.reason_code}`, 'Hata');
      }
    } catch (err: any) {
      await showAlert(`Sunucu Hatası: ${err.message}`, 'Hata');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEndRestriction = async () => {
    if (!selectedRestriction || submitting) return;
    if (!formOperatorReason.trim()) {
      await showAlert('Lütfen kısıtlamayı sonlandırma nedenini giriniz.', 'Uyarı');
      return;
    }
    const confirmed = await showConfirm({
      message: `'${selectedRestriction.id}' ID'li platform kısıtlamasını sonlandırmak istediğinize emin misiniz?`
    });
    if (!confirmed) return;

    setSubmitting(true);
    const key = getOrCreateIdempotencyKey();
    try {
      const res = await superAdminCommercialAdapter.endPlatformRestriction({
        idempotencyKey: key,
        restrictionId: selectedRestriction.id,
        reason: formOperatorReason
      });
      if (res.success) {
        await showAlert(res.replayed ? 'İşlem tekrarlandı (Replayed).' : 'Platform kısıtlaması sonlandırıldı.', 'Başarılı');
        setActiveModal(null);
        setSelectedRestriction(null);
        clearIdempotencyKey();
        refreshAllViews();
      } else {
        await showAlert(`İşlem Başarısız. Neden Kodu: ${res.reason_code}`, 'Hata');
      }
    } catch (err: any) {
      await showAlert(`Sunucu Hatası: ${err.message}`, 'Hata');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Ticari Yönetim & Abonelik Paneli</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Sunucu yetkili Super Admin ticari rehber, lisanslama, platform kısıtlamaları ve cari finans yönetim araçları.
          </p>
        </div>
        <span className="px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-full text-xs font-semibold border border-purple-200 dark:border-purple-800">
          SECURE RPC BACKED (H1D CONTRACT)
        </span>
      </div>

      {/* SECTION 1: SERVER-BACKED TENANT DIRECTORY & SNAPSHOT DETAIL */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Server-Backed Tenant Directory (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="font-bold text-gray-900 dark:text-white text-base">İşletme Rehberi (Server-Backed)</h2>
              <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">Toplam: {totalTenantsCount}</span>
            </div>
            
            {/* Search Input */}
            <input
              type="text"
              placeholder="İşletme Adı, Slug veya ID ile Ara..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setDirectoryPage(0); }}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            {/* Filter Controls with explicit 'none' & 'all' support */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <select
                value={statusFilter}
                onChange={e => { setStatusFilter(e.target.value); setDirectoryPage(0); }}
                className="px-2 py-1.5 border border-gray-200 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-900 text-gray-800 dark:text-gray-200"
              >
                <option value="all">Tüm Durumlar (all)</option>
                <option value="none">Aboneliksiz (none)</option>
                <option value="active">Aktif (active)</option>
                <option value="trialing">Deneme (trialing)</option>
                <option value="past_due">Gecikmiş (past_due)</option>
                <option value="suspended">Askıda (suspended)</option>
                <option value="cancelled">İptal (cancelled)</option>
                <option value="expired">Süresi Dolmuş (expired)</option>
              </select>

              <select
                value={planFilter}
                onChange={e => { setPlanFilter(e.target.value); setDirectoryPage(0); }}
                className="px-2 py-1.5 border border-gray-200 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-900 text-gray-800 dark:text-gray-200"
              >
                <option value="all">Tüm Planlar (all)</option>
                <option value="none">Plansız (none)</option>
                <option value="baslangic">Başlangıç</option>
                <option value="professional">Profesyonel</option>
                <option value="premium">Premium</option>
                <option value="kurumsal">Kurumsal</option>
                <option value="standart">Standart</option>
              </select>
            </div>
          </div>

          {/* Directory States & Cards */}
          {loadingDirectory ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400 bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 text-sm">
              <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-2"></div>
              Sunucu İşletme Rehberi Yükleniyor...
            </div>
          ) : directoryError ? (
            <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-800 dark:text-red-300 text-xs space-y-2">
              <p className="font-bold">İşletme Rehberi Yüklenemedi: {directoryError}</p>
              <button onClick={loadDirectory} className="px-3 py-1 bg-red-600 text-white rounded font-semibold hover:bg-red-700 transition">Tekrar Dene</button>
            </div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {tenants.map(t => {
                const isSelected = t.tenant_id === selectedTenantId;
                return (
                  <div
                    key={t.tenant_id}
                    onClick={() => loadTenantSnapshot(t.tenant_id)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50/50 dark:bg-blue-900/20 border-blue-500 dark:border-blue-500 shadow-sm'
                        : 'bg-white dark:bg-slate-800 border-gray-100 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <div className="font-bold text-sm text-gray-900 dark:text-white truncate">
                        {t.business_name || 'İsimsiz İşletme'}
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        t.subscription_status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                        t.subscription_status === 'trialing' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                        t.subscription_status === 'past_due' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                        'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-300'
                      }`}>
                        {t.subscription_status}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400">
                      <span>Slug: {t.slug || 'N/A'}</span>
                      <span className="font-medium text-gray-700 dark:text-gray-300">Plan: {t.plan_code}</span>
                    </div>
                  </div>
                );
              })}

              {tenants.length === 0 && (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400 bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 text-sm">
                  Kriterlere uygun işletme kaydı bulunamadı.
                </div>
              )}

              {/* Directory Pagination Controls */}
              {totalTenantsCount > directoryLimit && (
                <div className="flex justify-between items-center pt-2 px-1 text-xs text-gray-600 dark:text-gray-400">
                  <button
                    onClick={() => setDirectoryPage(p => Math.max(0, p - 1))}
                    disabled={directoryPage === 0}
                    className="px-2.5 py-1 border border-gray-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 disabled:opacity-40"
                  >
                    Önceki
                  </button>
                  <span>Sayfa {directoryPage + 1} / {Math.ceil(totalTenantsCount / directoryLimit)}</span>
                  <button
                    onClick={() => setDirectoryPage(p => p + 1)}
                    disabled={(directoryPage + 1) * directoryLimit >= totalTenantsCount}
                    className="px-2.5 py-1 border border-gray-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 disabled:opacity-40"
                  >
                    Sonraki
                  </button>
                </div>
              )}
            </div>
          )}
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
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-6 rounded-2xl text-red-800 dark:text-red-300 text-sm space-y-2">
              <h3 className="font-bold text-base mb-1">Teşhis Hatası</h3>
              <p>Sunucu snapshot döndüremedi: {snapshotError}</p>
              <button onClick={() => loadTenantSnapshot(selectedTenantId)} className="px-3 py-1 bg-red-600 text-white rounded font-semibold text-xs hover:bg-red-700 transition">Tekrar Dene</button>
            </div>
          ) : snapshot && (
            <div className="space-y-6">
              
              {/* Tenant Overview Card */}
              <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                      {selectedTenantData?.business_name || 'Seçili İşletme'}
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-0.5">
                      ID: {selectedTenantId} | Slug: {selectedTenantData?.slug || 'N/A'}
                    </p>
                  </div>

                  {/* Operation Actions Bar */}
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => { clearIdempotencyKey(); setActiveModal('assign'); }}
                      className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                    >
                      Plan Ata
                    </button>
                    <button
                      onClick={() => { clearIdempotencyKey(); setActiveModal('status'); }}
                      className="px-3 py-1.5 text-xs font-semibold bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition"
                    >
                      Durum Değiştir
                    </button>
                    <button
                      onClick={() => { clearIdempotencyKey(); setActiveModal('schedule'); }}
                      className="px-3 py-1.5 text-xs font-semibold bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
                    >
                      Plan Değişikliği Zamanla
                    </button>
                    <button
                      onClick={() => { clearIdempotencyKey(); setActiveModal('override'); }}
                      className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
                    >
                      Hak Ezme (Override)
                    </button>
                    <button
                      onClick={() => { clearIdempotencyKey(); setActiveModal('billing'); }}
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

      {/* SECTION 2: PLATFORM RESTRICTIONS SECTION (H1D CONTRACT) */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Platform Kısıtlamaları (Platform Restrictions)</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              İşletme veya platform genelindeki aktif/pasif engelleyici kısıtlama kuralları. Total: {restrictionsTotalCount}
            </p>
          </div>
          <button
            onClick={() => {
              clearIdempotencyKey();
              setFormRestrictionScope(selectedTenantId ? 'tenant' : 'global');
              setFormRestrictionTenantId(selectedTenantId || '');
              setActiveModal('create_restriction');
            }}
            className="px-4 py-2 text-xs font-semibold bg-red-600 text-white rounded-xl hover:bg-red-700 transition"
          >
            + Yeni Kısıtlama Ekle
          </button>
        </div>

        {/* Filter Controls for Restrictions */}
        <div className="flex flex-wrap gap-3 text-xs bg-gray-50 dark:bg-slate-900 p-3 rounded-xl border border-gray-100 dark:border-slate-800">
          <div>
            <label className="text-gray-500 dark:text-gray-400 mr-1.5">Kapsam:</label>
            <select
              value={restrictionScopeFilter}
              onChange={e => setRestrictionScopeFilter(e.target.value as any)}
              className="px-2.5 py-1 border border-gray-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-200"
            >
              <option value="all">Tümü (Global + İşletme)</option>
              <option value="global">Sadece Global</option>
              <option value="tenant">Sadece Seçili İşletme</option>
            </select>
          </div>

          <div>
            <label className="text-gray-500 dark:text-gray-400 mr-1.5">Özellik:</label>
            <select
              value={restrictionFeatureFilter}
              onChange={e => setRestrictionFeatureFilter(e.target.value)}
              className="px-2.5 py-1 border border-gray-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-200"
            >
              <option value="all">Tüm Özellikler</option>
              <option value="core_booking">Online Randevu (core_booking)</option>
              <option value="customer_cancellation">Müşteri İptali (customer_cancellation)</option>
              <option value="commercial_analytics">Ticari Analitik (commercial_analytics)</option>
              <option value="staff_management">Personel Yönetimi (staff_management)</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            <input
              type="checkbox"
              id="active_only_chk"
              checked={restrictionActiveOnly}
              onChange={e => setRestrictionActiveOnly(e.target.checked)}
            />
            <label htmlFor="active_only_chk" className="text-gray-700 dark:text-gray-300 font-medium">Sadece Şu An Aktif Olanlar</label>
          </div>
        </div>

        {/* Restrictions List Table */}
        {loadingRestrictions ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400 text-sm">
            <div className="animate-spin w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-2"></div>
            Platform Kısıtlamaları Yükleniyor...
          </div>
        ) : restrictionsError ? (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 text-red-800 text-xs rounded-xl flex justify-between items-center">
            <span>Yükleme Hatası: {restrictionsError}</span>
            <button onClick={loadRestrictions} className="px-2.5 py-1 bg-red-600 text-white rounded font-semibold">Tekrar Dene</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-200 dark:border-slate-700 text-gray-500 dark:text-gray-400 font-semibold">
                  <th className="py-2.5 px-3">Kapsam / Tenant</th>
                  <th className="py-2.5 px-3">Özellik Anahtarı</th>
                  <th className="py-2.5 px-3">Gerekçe (Reason)</th>
                  <th className="py-2.5 px-3">Başlangıç</th>
                  <th className="py-2.5 px-3">Bitiş</th>
                  <th className="py-2.5 px-3">Durum</th>
                  <th className="py-2.5 px-3 text-right">Eylem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700/50 text-gray-800 dark:text-gray-200">
                {restrictions.map(r => {
                  const isActiveNow = r.is_restricted && (!r.expires_at || new Date(r.expires_at) > new Date()) && new Date(r.starts_at) <= new Date();
                  const isFuture = r.is_restricted && new Date(r.starts_at) > new Date();
                  const isEnded = !r.is_restricted || (r.expires_at && new Date(r.expires_at) <= new Date());

                  return (
                    <tr key={r.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-700/30">
                      <td className="py-2.5 px-3 font-mono">
                        {r.tenant_id ? (
                          <span className="text-blue-600 dark:text-blue-400 truncate max-w-[120px] inline-block">{r.tenant_id}</span>
                        ) : (
                          <span className="px-1.5 py-0.5 bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 rounded font-semibold text-[10px]">GLOBAL</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-semibold">{r.feature_key}</td>
                      <td className="py-2.5 px-3 max-w-[200px] truncate">{r.reason}</td>
                      <td className="py-2.5 px-3 font-mono text-[11px]">{new Date(r.starts_at).toLocaleString('tr-TR')}</td>
                      <td className="py-2.5 px-3 font-mono text-[11px]">{r.expires_at ? new Date(r.expires_at).toLocaleString('tr-TR') : 'Sonsuz'}</td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          isActiveNow ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                          isFuture ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                          'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-400'
                        }`}>
                          {isActiveNow ? 'AKTİF KISITLAMA' : isFuture ? 'GELECEK KISITLAMA' : 'SONLANDI'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {!isEnded && (
                          <button
                            onClick={() => {
                              clearIdempotencyKey();
                              setSelectedRestriction(r);
                              setActiveModal('end_restriction');
                            }}
                            className="px-2.5 py-1 bg-slate-700 text-white rounded text-[11px] font-medium hover:bg-slate-800 transition"
                          >
                            Sonlandır
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {restrictions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-gray-500 dark:text-gray-400">
                      Gösterilecek platform kısıtlaması kaydı bulunmamaktadır.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SECTION 3: READ-ONLY BILLING LEDGER SECTION (H1D CONTRACT) */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Cari Hareketler (Billing Ledger)</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Super Admin yetkili finansal hareket geçmişi. Total: {billingTotalCount}
            </p>
          </div>
          <div className="p-2.5 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl text-yellow-900 dark:text-yellow-300 text-xs">
            <span className="font-bold">⚠️ Bilgilendirme:</span> Bu ekran karttan ödeme almaz. Yalnızca manuel cari kayıt oluşturur.
          </div>
        </div>

        {/* Ledger Table */}
        {loadingBilling ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400 text-sm">
            <div className="animate-spin w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-2"></div>
            Cari Kayıtlar Yükleniyor...
          </div>
        ) : billingError ? (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 text-red-800 text-xs rounded-xl flex justify-between items-center">
            <span>Cari Hareket Hatası: {billingError}</span>
            <button onClick={loadBillingTransactions} className="px-2.5 py-1 bg-red-600 text-white rounded font-semibold">Tekrar Dene</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-200 dark:border-slate-700 text-gray-500 dark:text-gray-400 font-semibold">
                  <th className="py-2.5 px-3">Tarih</th>
                  <th className="py-2.5 px-3">İşletme ID</th>
                  <th className="py-2.5 px-3">İşlem Tipi</th>
                  <th className="py-2.5 px-3">Tutar</th>
                  <th className="py-2.5 px-3">Faturalama Modu</th>
                  <th className="py-2.5 px-3">Durum</th>
                  <th className="py-2.5 px-3">Operasyonel Not</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700/50 text-gray-800 dark:text-gray-200">
                {billingTransactions.map(tx => (
                  <tr key={tx.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-700/30">
                    <td className="py-2.5 px-3 font-mono text-[11px]">{new Date(tx.created_at).toLocaleString('tr-TR')}</td>
                    <td className="py-2.5 px-3 font-mono text-blue-600 dark:text-blue-400 truncate max-w-[120px]">{tx.tenant_id}</td>
                    <td className="py-2.5 px-3 font-medium capitalize">{tx.transaction_type}</td>
                    <td className="py-2.5 px-3 font-bold">{tx.amount} {tx.currency}</td>
                    <td className="py-2.5 px-3 capitalize">{tx.billing_mode}</td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        tx.transaction_status === 'settled' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                        tx.transaction_status === 'pending' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                        'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                      }`}>
                        {tx.transaction_status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 max-w-[200px] truncate text-gray-500 dark:text-gray-400">{tx.operator_reason || tx.external_reference || '-'}</td>
                  </tr>
                ))}

                {billingTransactions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-gray-500 dark:text-gray-400">
                      Gösterilecek cari hareket kaydı bulunmamaktadır.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Billing Pagination */}
            {billingTotalCount > billingLimit && (
              <div className="flex justify-between items-center pt-3 text-xs text-gray-600 dark:text-gray-400">
                <button
                  onClick={() => setBillingPage(p => Math.max(0, p - 1))}
                  disabled={billingPage === 0}
                  className="px-2.5 py-1 border border-gray-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 disabled:opacity-40"
                >
                  Önceki
                </button>
                <span>Sayfa {billingPage + 1} / {Math.ceil(billingTotalCount / billingLimit)}</span>
                <button
                  onClick={() => setBillingPage(p => p + 1)}
                  disabled={(billingPage + 1) * billingLimit >= billingTotalCount}
                  className="px-2.5 py-1 border border-gray-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 disabled:opacity-40"
                >
                  Sonraki
                </button>
              </div>
            )}
          </div>
        )}
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
                {activeModal === 'create_restriction' && 'Yeni Platform Kısıtlaması Oluştur'}
                {activeModal === 'end_restriction' && 'Platform Kısıtlamasını Sonlandır'}
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

              {activeModal === 'create_restriction' && (
                <>
                  <div>
                    <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Kapsam (Scope)</label>
                    <select
                      value={formRestrictionScope}
                      onChange={e => setFormRestrictionScope(e.target.value as any)}
                      className="w-full px-3 py-2 border rounded-lg bg-gray-50 dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                    >
                      <option value="tenant font-bold">Seçili / Belirli İşletme (Tenant)</option>
                      <option value="global">Platform Geneli (Global)</option>
                    </select>
                  </div>

                  {formRestrictionScope === 'tenant' && (
                    <div>
                      <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Hedef İşletme UUID</label>
                      <input
                        type="text"
                        value={formRestrictionTenantId}
                        onChange={e => setFormRestrictionTenantId(e.target.value)}
                        placeholder="UUID (Örn: aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa)"
                        className="w-full px-3 py-2 border rounded-lg bg-gray-50 dark:bg-slate-900 dark:border-slate-700 dark:text-white font-mono text-[11px]"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Kısıtlanacak Özellik (Feature Key)</label>
                    <select
                      value={formRestrictionFeatureKey}
                      onChange={e => setFormRestrictionFeatureKey(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg bg-gray-50 dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                    >
                      <option value="core_booking">Online Randevu Alımı (core_booking)</option>
                      <option value="customer_cancellation">Müşteri İptali (customer_cancellation)</option>
                      <option value="commercial_analytics">Ticari Analitik (commercial_analytics)</option>
                      <option value="staff_management">Personel Yönetimi (staff_management)</option>
                      <option value="service_management">Hizmet Yönetimi (service_management)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Başlangıç Zamanı (Opsiyonel / Boşsa Şu An)</label>
                    <input
                      type="datetime-local"
                      value={formRestrictionStartsAt}
                      onChange={e => setFormRestrictionStartsAt(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg bg-gray-50 dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Bitiş Zamanı (Opsiyonel / Boşsa Sonsuz)</label>
                    <input
                      type="datetime-local"
                      value={formRestrictionExpiresAt}
                      onChange={e => setFormRestrictionExpiresAt(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg bg-gray-50 dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-gray-900 dark:text-white mb-1">Kısıtlama Nedeni (Zorunlu Gerekçe)</label>
                    <textarea
                      rows={2}
                      value={formRestrictionReason}
                      onChange={e => setFormRestrictionReason(e.target.value)}
                      placeholder="Örn: Güvenlik ihlali veya fatura ödenmemesi..."
                      className="w-full px-3 py-2 border rounded-lg bg-gray-50 dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                    />
                  </div>
                </>
              )}

              {activeModal === 'end_restriction' && selectedRestriction && (
                <>
                  <div className="p-3 bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700 space-y-1 text-xs">
                    <p><span className="font-bold">Kısıtlama ID:</span> {selectedRestriction.id}</p>
                    <p><span className="font-bold">Özellik:</span> {selectedRestriction.feature_key}</p>
                    <p><span className="font-bold">Mevcut Gerekçe:</span> {selectedRestriction.reason}</p>
                  </div>
                </>
              )}

              {/* Common Required Operator Reason Field for H1B & End Restriction */}
              {activeModal !== 'create_restriction' && (
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
              )}
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
                  if (activeModal === 'create_restriction') handleCreateRestriction();
                  if (activeModal === 'end_restriction') handleEndRestriction();
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
