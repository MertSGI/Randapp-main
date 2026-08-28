import React, { useState } from 'react';
import { HtLead, HtLeadStatus } from '../../types/healthTourism';
import { HealthTourismService } from '../../utils/healthTourismService';
import {
  User, Mail, Phone, Globe, MapPin, Building2, Tag, Award,
  MessageSquare, ArrowRightLeft, CheckCircle2, Clock, AlertTriangle,
  BotMessageSquare, ChevronDown, ChevronUp
} from 'lucide-react';

interface Props {
  lead: HtLead;
  canManage: boolean;
  service: HealthTourismService;
  onRefresh: () => void;
}

/** Allowed operational transitions (converted is FORBIDDEN in Slice 3) */
const TRANSITION_MAP: Record<string, { label: string; targets: HtLeadStatus[] }> = {
  new: { label: 'Yeni', targets: ['contacted', 'closed'] },
  contacted: { label: 'İletişimde', targets: ['qualified', 'closed'] },
  qualified: { label: 'Nitelikli', targets: ['handoff_pending', 'closed'] },
  handoff_pending: { label: 'Devir Bekliyor', targets: ['qualified', 'closed'] },
  closed: { label: 'Kapatıldı', targets: [] },
};

const STATUS_LABELS: Record<string, string> = {
  new: 'Yeni', contacted: 'İletişimde', qualified: 'Nitelikli',
  handoff_pending: 'Devir Bekliyor', closed: 'Kapatıldı',
};

const SCORE_BAND_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  hot: { label: 'Sıcak', icon: '🔥', color: 'text-red-600' },
  warm: { label: 'Ilık', icon: '🌡️', color: 'text-amber-600' },
  cold: { label: 'Soğuk', icon: '❄️', color: 'text-blue-500' },
};

export const HtLeadDetailPanel: React.FC<Props> = ({ lead, canManage, service, onRefresh }) => {
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showScoreReasons, setShowScoreReasons] = useState(false);

  const handleStatusTransition = async (newStatus: HtLeadStatus) => {
    setActionLoading(true);
    setActionError(null);
    const result = await service.updateLeadStatus({ lead_id: lead.id, status: newStatus });
    if (!result.success) {
      setActionError(result.message || 'Durum güncellenemedi.');
    }
    setActionLoading(false);
    onRefresh();
  };

  const handleScoreLead = async () => {
    setActionLoading(true);
    setActionError(null);
    const result = await service.scoreLead({ lead_id: lead.id, ai_intent_delta: 0 });
    if (!result.success) {
      setActionError(result.message || 'Skorlama başarısız.');
    }
    setActionLoading(false);
    onRefresh();
  };

  const handleAcknowledgeHandoff = async () => {
    setActionLoading(true);
    setActionError(null);
    const result = await service.acknowledgeHandoff({ lead_id: lead.id });
    if (!result.success) {
      setActionError(result.message || 'Devir onayı başarısız.');
    }
    setActionLoading(false);
    onRefresh();
  };

  const handleWhatsAppHandoff = async () => {
    setActionLoading(true);
    setActionError(null);
    const result = await service.enqueueWhatsAppHandoff({ lead_id: lead.id });
    if (!result.success) {
      setActionError(result.message || 'WhatsApp handoff başarısız.');
    }
    setActionLoading(false);
    onRefresh();
  };

  const availableTransitions = TRANSITION_MAP[lead.status]?.targets || [];
  const scoreBand = lead.lead_score_band ? SCORE_BAND_LABELS[lead.lead_score_band] : null;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-teal-50 to-emerald-50 dark:from-teal-950/20 dark:to-emerald-950/20">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <User className="h-4 w-4 text-teal-600" />
              <span>{lead.full_name}</span>
            </h3>
            <div className="flex items-center space-x-2 mt-1">
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
                {STATUS_LABELS[lead.status] || lead.status}
              </span>
              {lead.handoff_state === 'requested' && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 animate-pulse">
                  ⚡ Devir Talebi
                </span>
              )}
              {lead.handoff_state === 'acknowledged' && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-green-100 text-green-700">
                  ✓ Devir Onaylandı
                </span>
              )}
            </div>
          </div>

          {/* Score Display */}
          {lead.lead_score != null && (
            <div className="text-right">
              <div className={`text-2xl font-black ${scoreBand?.color || 'text-slate-600'}`}>
                {lead.lead_score}
              </div>
              {scoreBand && (
                <div className="text-[10px] text-slate-500 dark:text-slate-400">
                  {scoreBand.icon} {scoreBand.label}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Error */}
        {actionError && (
          <div className="flex items-center space-x-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300 text-xs">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            <span>{actionError}</span>
          </div>
        )}

        {/* Contact Info */}
        <div className="grid grid-cols-2 gap-3">
          {lead.email && (
            <div className="flex items-center space-x-2 text-xs text-slate-600 dark:text-slate-300">
              <Mail className="h-3.5 w-3.5 text-slate-400" />
              <span className="truncate">{lead.email}</span>
            </div>
          )}
          {lead.phone && (
            <div className="flex items-center space-x-2 text-xs text-slate-600 dark:text-slate-300">
              <Phone className="h-3.5 w-3.5 text-slate-400" />
              <span>{lead.phone}</span>
            </div>
          )}
          {lead.preferred_language && (
            <div className="flex items-center space-x-2 text-xs text-slate-600 dark:text-slate-300">
              <Globe className="h-3.5 w-3.5 text-slate-400" />
              <span className="uppercase">{lead.preferred_language}</span>
            </div>
          )}
          {lead.country_code && (
            <div className="flex items-center space-x-2 text-xs text-slate-600 dark:text-slate-300">
              <MapPin className="h-3.5 w-3.5 text-slate-400" />
              <span>{lead.country_code}</span>
            </div>
          )}
          {lead.source_channel && (
            <div className="flex items-center space-x-2 text-xs text-slate-600 dark:text-slate-300">
              <Tag className="h-3.5 w-3.5 text-slate-400" />
              <span>{lead.source_channel}</span>
            </div>
          )}
          {lead.agency_name && (
            <div className="flex items-center space-x-2 text-xs text-slate-600 dark:text-slate-300">
              <Building2 className="h-3.5 w-3.5 text-slate-400" />
              <span>{lead.agency_name}</span>
            </div>
          )}
          {lead.coordinator_name && (
            <div className="flex items-center space-x-2 text-xs text-slate-600 dark:text-slate-300">
              <User className="h-3.5 w-3.5 text-teal-500" />
              <span>Koordinatör: {lead.coordinator_name}</span>
            </div>
          )}
        </div>

        {/* Score Reasons */}
        {lead.lead_score_reasons && lead.lead_score_reasons.length > 0 && (
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
            <button
              onClick={() => setShowScoreReasons(!showScoreReasons)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
            >
              <div className="flex items-center space-x-1.5">
                <Award className="h-3.5 w-3.5 text-teal-500" />
                <span>Skor Nedenleri ({lead.lead_score_reasons.length})</span>
              </div>
              {showScoreReasons ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {showScoreReasons && (
              <div className="px-3 pb-2 flex flex-wrap gap-1">
                {lead.lead_score_reasons.map((reason, i) => (
                  <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                    {reason}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* AI Summary */}
        {lead.ai_summary && (
          <div className="border border-teal-200 dark:border-teal-800 rounded-lg p-3 bg-teal-50/50 dark:bg-teal-950/10">
            <div className="flex items-center space-x-1.5 mb-1.5">
              <BotMessageSquare className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
              <span className="text-[10px] font-semibold text-teal-700 dark:text-teal-300">AI-Oluşturulmuş Yardımcı Özet</span>
              <span className="text-[9px] italic text-slate-400">— doğrulanmış klinik gerçek değildir</span>
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{lead.ai_summary}</p>
            {lead.ai_summary_updated_at && (
              <p className="text-[9px] text-slate-400 mt-1">
                Güncelleme: {new Date(lead.ai_summary_updated_at).toLocaleString('tr-TR')}
              </p>
            )}
          </div>
        )}

        {/* Handoff Details */}
        {lead.handoff_reason && (
          <div className="border border-amber-200 dark:border-amber-800 rounded-lg p-3 bg-amber-50/50 dark:bg-amber-950/10">
            <div className="flex items-center space-x-1.5 mb-1">
              <ArrowRightLeft className="h-3.5 w-3.5 text-amber-600" />
              <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">Devir Nedeni</span>
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-300">{lead.handoff_reason}</p>
            {lead.handoff_requested_at && (
              <p className="text-[9px] text-slate-400 mt-1">
                Talep: {new Date(lead.handoff_requested_at).toLocaleString('tr-TR')}
              </p>
            )}
          </div>
        )}

        {/* Timestamps */}
        <div className="flex items-center space-x-4 text-[9px] text-slate-400">
          <div className="flex items-center space-x-1">
            <Clock className="h-3 w-3" />
            <span>Oluşturulma: {new Date(lead.created_at).toLocaleString('tr-TR')}</span>
          </div>
          {lead.last_activity_at && (
            <div className="flex items-center space-x-1">
              <Clock className="h-3 w-3" />
              <span>Son Aktivite: {new Date(lead.last_activity_at).toLocaleString('tr-TR')}</span>
            </div>
          )}
        </div>

        {/* Actions (manager only) — NO CONVERSION BUTTON */}
        {canManage && (
          <div className="border-t border-slate-200 dark:border-slate-700 pt-3 space-y-2">
            <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">İşlemler</p>

            {/* Status Transitions */}
            {availableTransitions.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {availableTransitions.map(target => (
                  <button
                    key={target}
                    onClick={() => handleStatusTransition(target)}
                    disabled={actionLoading}
                    className="text-[10px] px-2.5 py-1 rounded-lg font-medium border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 text-slate-700 dark:text-slate-300"
                  >
                    → {STATUS_LABELS[target] || target}
                  </button>
                ))}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={handleScoreLead}
                disabled={actionLoading}
                className="text-[10px] px-2.5 py-1 rounded-lg font-medium bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-950/50 transition-colors disabled:opacity-50"
              >
                <Award className="h-3 w-3 inline mr-1" />Skorla
              </button>

              {lead.handoff_state === 'requested' && (
                <button
                  onClick={handleAcknowledgeHandoff}
                  disabled={actionLoading}
                  className="text-[10px] px-2.5 py-1 rounded-lg font-medium bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3 w-3 inline mr-1" />Devri Onayla
                </button>
              )}

              {lead.phone && (
                <button
                  onClick={handleWhatsAppHandoff}
                  disabled={actionLoading}
                  className="text-[10px] px-2.5 py-1 rounded-lg font-medium bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-950/50 transition-colors disabled:opacity-50"
                >
                  <MessageSquare className="h-3 w-3 inline mr-1" />WhatsApp Handoff
                </button>
              )}
            </div>
          </div>
        )}

        {/* Notes */}
        {lead.notes && (
          <div className="border-t border-slate-200 dark:border-slate-700 pt-3">
            <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Notlar</p>
            <p className="text-xs text-slate-600 dark:text-slate-300">{lead.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
};
