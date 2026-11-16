import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { HealthTourismService } from '../../utils/healthTourismService';
import { HtLead, HtLeadListParams, HtLeadListResult, HtLeadStatus, HtLeadScoreBand, HtSourceChannel } from '../../types/healthTourism';
import { HtLeadListPanel } from '../../components/health-tourism/HtLeadListPanel';
import { HtLeadDetailPanel } from '../../components/health-tourism/HtLeadDetailPanel';
import { ShieldAlert, AlertCircle, RefreshCw, UserX, ServerOff, Globe } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { getDataSourceMode, type DataSourceMode } from '../../services/dataSourceConfig';

export interface HtCoordinatorWorkspacePageProps {
  modeOverride?: DataSourceMode;
  initialAuthState?: {
    authorized: boolean;
    canManage: boolean;
    leads?: HtLead[];
    totalLeads?: number;
    errorMsg?: string | null;
  };
}

export const HtCoordinatorWorkspacePage: React.FC<HtCoordinatorWorkspacePageProps> = ({
  modeOverride,
  initialAuthState,
}) => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(!initialAuthState);
  const [authorized, setAuthorized] = useState(initialAuthState?.authorized ?? false);
  const [canManage, setCanManage] = useState(initialAuthState?.canManage ?? false);
  const [errorMsg, setErrorMsg] = useState<string | null>(initialAuthState?.errorMsg ?? null);

  const [leads, setLeads] = useState<HtLead[]>(initialAuthState?.leads ?? []);
  const [totalLeads, setTotalLeads] = useState(initialAuthState?.totalLeads ?? 0);
  const [selectedLead, setSelectedLead] = useState<HtLead | null>(null);

  const [statusFilter, setStatusFilter] = useState<HtLeadStatus | null>(null);
  const [scoreBandFilter, setScoreBandFilter] = useState<HtLeadScoreBand | null>(null);
  const [sourceFilter, setSourceFilter] = useState<HtSourceChannel | null>(null);
  const [offset, setOffset] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const isSupabaseMode = (modeOverride ?? getDataSourceMode()) === 'supabase';
  const service = useMemo(() => (isSupabaseMode ? new HealthTourismService(supabase) : null), [isSupabaseMode]);

  useEffect(() => {
    if (!initialAuthState) {
      checkAuthorization();
    }
  }, [currentUser?.id, isSupabaseMode, initialAuthState]);

  useEffect(() => {
    if (authorized && !initialAuthState) {
      loadLeads();
    }
  }, [authorized, statusFilter, scoreBandFilter, sourceFilter, offset, refreshTrigger, initialAuthState]);

  const checkAuthorization = async () => {
    setLoading(true);
    if (!isSupabaseMode || !service) {
      setErrorMsg('Sağlık turizmi modülü Supabase sunucu yetkisi gerektirir.');
      setLoading(false);
      return;
    }

    if (!currentUser) {
      setErrorMsg('Oturum gereklidir.');
      setLoading(false);
      return;
    }

    try {
      const ctxResult = await service.getMyHtContext();
      if (ctxResult.success && (ctxResult.can_view_ht_leads || ctxResult.can_manage_ht_leads)) {
        setAuthorized(true);
        setCanManage(!!ctxResult.can_manage_ht_leads);
      } else {
        setErrorMsg(ctxResult.message || 'Sağlık turizmi lead erişim yetkiniz bulunmamaktadır.');
      }
    } catch {
      setErrorMsg('Sunucu bağlantı hatası.');
    }
    setLoading(false);
  };

  const loadLeads = async () => {
    if (!service) return;
    const params: HtLeadListParams = {
      status: statusFilter ?? undefined,
      score_band: scoreBandFilter ?? undefined,
      source_channel: sourceFilter ?? undefined,
      limit: 25,
      offset,
    };

    const result: HtLeadListResult = await service.listLeads(params);
    if (result.success) {
      setLeads(result.leads || []);
      setTotalLeads(result.total || 0);
    }
  };

  const handleLeadSelect = async (lead: HtLead) => {
    if (!service) return;
    const detail = await service.getLead(lead.id);
    if (detail.success && detail.lead) {
      setSelectedLead(detail.lead);
    }
  };

  const handleRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
    if (selectedLead) {
      handleLeadSelect(selectedLead);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center space-y-3 text-slate-500">
          <RefreshCw className="h-8 w-8 animate-spin text-teal-600" />
          <span className="text-xs font-semibold">Sağlık turizmi yetkileri kontrol ediliyor...</span>
        </div>
      </div>
    );
  }

  if (!isSupabaseMode) {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 space-y-4">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
            <ServerOff className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Sunucu Modu Gerekli</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Sağlık turizmi koordinatör modülü Supabase sunucu yetkisi gerektirir.</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 space-y-4">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-amber-100 text-amber-600">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Oturum Gerekli</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Koordinatör paneline erişmek için oturum açmalısınız.</p>
        </div>
      </div>
    );
  }

  if (errorMsg || !authorized) {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 space-y-4">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-950/50 text-red-600">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Erişim Hatası</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">{errorMsg || 'Yetkisiz erişim.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        data-testid="ht-regulatory-hold-banner"
        className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-center space-x-2"
      >
        <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" />
        <span>
          EXTERNAL_HOLD: KVKK özel nitelikli sağlık verisi onayı, Sağlık Turizmi Yetki Belgesi ve canlı WhatsApp/AI gönderimi kapalıdır (Sentetik Test / NO_GO).
        </span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white shadow-lg">
            <Globe className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">Sağlık Turizmi Koordinatör Paneli</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Lead yönetimi ve koordinasyon</p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-950/50 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Yenile</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-5">
          <HtLeadListPanel
            leads={leads}
            totalLeads={totalLeads}
            selectedLeadId={selectedLead?.id || null}
            statusFilter={statusFilter}
            scoreBandFilter={scoreBandFilter}
            sourceFilter={sourceFilter}
            offset={offset}
            onSelectLead={handleLeadSelect}
            onStatusFilterChange={setStatusFilter}
            onScoreBandFilterChange={setScoreBandFilter}
            onSourceFilterChange={setSourceFilter}
            onOffsetChange={setOffset}
          />
        </div>

        <div className="lg:col-span-7">
          {selectedLead && service ? (
            <HtLeadDetailPanel
              lead={selectedLead}
              canManage={canManage}
              service={service}
              onRefresh={handleRefresh}
            />
          ) : (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-12 text-center">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-slate-100 dark:bg-slate-700/50 text-slate-400 mb-4">
                <UserX className="h-8 w-8" />
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Detay görmek için listeden bir lead seçin
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
