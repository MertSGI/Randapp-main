import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { HealthTourismService } from '../../utils/healthTourismService';
import { HtLead, HtLeadListParams, HtLeadListResult, HtLeadStatus, HtLeadScoreBand, HtSourceChannel } from '../../types/healthTourism';
import { HtLeadListPanel } from '../../components/health-tourism/HtLeadListPanel';
import { HtLeadDetailPanel } from '../../components/health-tourism/HtLeadDetailPanel';
import { ShieldAlert, AlertCircle, RefreshCw, UserX, ServerOff, Globe } from 'lucide-react';
import { supabase, isSupabaseMode } from '../../utils/supabaseClient';

export const HtCoordinatorWorkspacePage: React.FC = () => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [leads, setLeads] = useState<HtLead[]>([]);
  const [totalLeads, setTotalLeads] = useState(0);
  const [selectedLead, setSelectedLead] = useState<HtLead | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<HtLeadStatus | null>(null);
  const [scoreBandFilter, setScoreBandFilter] = useState<HtLeadScoreBand | null>(null);
  const [sourceFilter, setSourceFilter] = useState<HtSourceChannel | null>(null);
  const [offset, setOffset] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const service = isSupabaseMode() ? new HealthTourismService(supabase) : null;

  useEffect(() => {
    checkAuthorization();
  }, [currentUser?.id]);

  useEffect(() => {
    if (authorized) {
      loadLeads();
    }
  }, [authorized, statusFilter, scoreBandFilter, sourceFilter, offset, refreshTrigger]);

  const checkAuthorization = async () => {
    setLoading(true);
    if (!isSupabaseMode() || !service) {
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
    setRefreshTrigger(prev => prev + 1);
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

  if (!isSupabaseMode()) {
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

  if (errorMsg) {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 space-y-4">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-950/50 text-red-600">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Erişim Hatası</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">{errorMsg}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white shadow-lg">
            <Globe className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">Sağlık Turizmi Koordinatör Paneli</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Lead yönetimi ve AI destek</p>
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

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Lead List Panel */}
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

        {/* Lead Detail Panel */}
        <div className="lg:col-span-7">
          {selectedLead ? (
            <HtLeadDetailPanel
              lead={selectedLead}
              canManage={canManage}
              service={service!}
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
