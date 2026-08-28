import React from 'react';
import { HtLead, HtLeadStatus, HtLeadScoreBand, HtSourceChannel } from '../../types/healthTourism';
import { Bell, ChevronLeft, ChevronRight, Filter, Users } from 'lucide-react';

interface Props {
  leads: HtLead[];
  totalLeads: number;
  selectedLeadId: string | null;
  statusFilter: HtLeadStatus | null;
  scoreBandFilter: HtLeadScoreBand | null;
  sourceFilter: HtSourceChannel | null;
  offset: number;
  onSelectLead: (lead: HtLead) => void;
  onStatusFilterChange: (status: HtLeadStatus | null) => void;
  onScoreBandFilterChange: (band: HtLeadScoreBand | null) => void;
  onSourceFilterChange: (source: HtSourceChannel | null) => void;
  onOffsetChange: (offset: number) => void;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  new: { label: 'Yeni', color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' },
  contacted: { label: 'İletişimde', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300' },
  qualified: { label: 'Nitelikli', color: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300' },
  handoff_pending: { label: 'Devir Bekliyor', color: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
  closed: { label: 'Kapatıldı', color: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
};

const SCORE_BAND_COLORS: Record<string, string> = {
  hot: 'bg-red-500',
  warm: 'bg-amber-500',
  cold: 'bg-blue-400',
};

const PAGE_SIZE = 25;

export const HtLeadListPanel: React.FC<Props> = ({
  leads, totalLeads, selectedLeadId, statusFilter, scoreBandFilter, sourceFilter,
  offset, onSelectLead, onStatusFilterChange, onScoreBandFilterChange, onSourceFilterChange, onOffsetChange
}) => {
  const totalPages = Math.max(1, Math.ceil(totalLeads / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-teal-50 to-emerald-50 dark:from-teal-950/20 dark:to-emerald-950/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Users className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Leadler</h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">({totalLeads})</span>
          </div>
          <Filter className="h-3.5 w-3.5 text-slate-400" />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          <select
            className="text-[10px] px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200"
            value={statusFilter || ''}
            onChange={e => { onStatusFilterChange((e.target.value || null) as HtLeadStatus | null); onOffsetChange(0); }}
          >
            <option value="">Tüm Durumlar</option>
            <option value="new">Yeni</option>
            <option value="contacted">İletişimde</option>
            <option value="qualified">Nitelikli</option>
            <option value="handoff_pending">Devir Bekliyor</option>
            <option value="closed">Kapatıldı</option>
          </select>

          <select
            className="text-[10px] px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200"
            value={scoreBandFilter || ''}
            onChange={e => { onScoreBandFilterChange((e.target.value || null) as HtLeadScoreBand | null); onOffsetChange(0); }}
          >
            <option value="">Tüm Skorlar</option>
            <option value="hot">🔥 Sıcak</option>
            <option value="warm">🌡️ Ilık</option>
            <option value="cold">❄️ Soğuk</option>
          </select>

          <select
            className="text-[10px] px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200"
            value={sourceFilter || ''}
            onChange={e => { onSourceFilterChange((e.target.value || null) as HtSourceChannel | null); onOffsetChange(0); }}
          >
            <option value="">Tüm Kaynaklar</option>
            <option value="web">Web</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="agency_referral">Ajans</option>
            <option value="organic">Organik</option>
            <option value="paid_search">Ücretli Arama</option>
            <option value="social">Sosyal</option>
            <option value="direct">Doğrudan</option>
          </select>
        </div>
      </div>

      {/* Lead List */}
      <div className="divide-y divide-slate-100 dark:divide-slate-700/50 max-h-[calc(100vh-280px)] overflow-y-auto">
        {leads.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            Bu filtrelere uygun lead bulunamadı.
          </div>
        ) : (
          leads.map(lead => (
            <button
              key={lead.id}
              onClick={() => onSelectLead(lead)}
              className={`w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors ${
                selectedLeadId === lead.id ? 'bg-teal-50 dark:bg-teal-950/20 border-l-2 border-teal-500' : ''
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">{lead.full_name}</span>
                    {lead.handoff_state === 'requested' && (
                      <Bell className="h-3 w-3 text-amber-500 animate-pulse flex-shrink-0" title="Handoff bekliyor" />
                    )}
                  </div>

                  <div className="flex items-center space-x-1.5 mt-1">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium ${STATUS_LABELS[lead.status]?.color || 'bg-slate-100 text-slate-600'}`}>
                      {STATUS_LABELS[lead.status]?.label || lead.status}
                    </span>
                    {lead.lead_score_band && (
                      <span className={`inline-block h-2 w-2 rounded-full ${SCORE_BAND_COLORS[lead.lead_score_band] || 'bg-slate-300'}`} title={`Skor: ${lead.lead_score}`} />
                    )}
                    {lead.preferred_language && (
                      <span className="text-[9px] text-slate-400 uppercase">{lead.preferred_language}</span>
                    )}
                    {lead.country_code && (
                      <span className="text-[9px] text-slate-400">{lead.country_code}</span>
                    )}
                  </div>

                  <div className="flex items-center space-x-1.5 mt-0.5">
                    {lead.source_channel && (
                      <span className="text-[9px] text-slate-400">{lead.source_channel}</span>
                    )}
                    {lead.agency_name && (
                      <span className="text-[9px] text-teal-600 dark:text-teal-400">• {lead.agency_name}</span>
                    )}
                  </div>
                </div>

                <div className="text-right flex-shrink-0 ml-2">
                  {lead.lead_score != null && (
                    <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">{lead.lead_score}</span>
                  )}
                  <div className="text-[9px] text-slate-400 mt-0.5">
                    {new Date(lead.created_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}
                  </div>
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalLeads > PAGE_SIZE && (
        <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
          <button
            onClick={() => onOffsetChange(Math.max(0, offset - PAGE_SIZE))}
            disabled={offset === 0}
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300" />
          </button>
          <span className="text-[10px] text-slate-500 dark:text-slate-400">{currentPage} / {totalPages}</span>
          <button
            onClick={() => onOffsetChange(offset + PAGE_SIZE)}
            disabled={currentPage >= totalPages}
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300" />
          </button>
        </div>
      )}
    </div>
  );
};
