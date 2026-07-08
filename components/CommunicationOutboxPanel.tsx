import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { CommunicationEvent, CommunicationChannel, CommunicationDeliveryStatus, CommunicationEventType } from '../types';
import { communicationEventService } from '../services/communicationEventService';
import { communicationProviderConfigService } from '../services/communicationProviderConfigService';

interface CommunicationOutboxPanelProps {
  tenantId?: string;
  isSuperAdmin?: boolean;
}

export const CommunicationOutboxPanel: React.FC<CommunicationOutboxPanelProps> = ({ 
  tenantId, 
  isSuperAdmin = false 
}) => {
  const { language } = useLanguage();
  const [events, setEvents] = useState<CommunicationEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<CommunicationEvent | null>(null);
  
  // Filters
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTenantFilter, setSelectedTenantFilter] = useState<string>('all');

  const [providerConfig, setProviderConfig] = useState(communicationProviderConfigService.getConfig());

  useEffect(() => {
    loadEvents();
    const interval = setInterval(loadEvents, 5000); // Poll for real-time updates
    return () => clearInterval(interval);
  }, [tenantId, isSuperAdmin]);

  const loadEvents = () => {
    let all = communicationEventService.getAllEvents();
    
    if (!isSuperAdmin) {
      // Owner View: Filter by tenantId and hide internalOnly
      if (tenantId) {
        all = all.filter(e => e.tenantId === tenantId && !e.internalOnly);
      } else {
        all = [];
      }
    }
    setEvents(all);
  };

  const handleMarkSent = (id: string) => {
    communicationEventService.markCommunicationSent(id);
    loadEvents();
    // Update selected view if applicable
    if (selectedEvent && selectedEvent.id === id) {
      const updated = communicationEventService.getAllEvents().find(e => e.id === id);
      if (updated) setSelectedEvent(updated);
    }
  };

  const handleMarkFailed = (id: string) => {
    const reason = prompt(language === 'tr' ? 'Hata nedenini giriniz:' : 'Enter failure reason:');
    if (reason !== null) {
      communicationEventService.markCommunicationFailed(id, reason || 'Manual flag failed');
      loadEvents();
      if (selectedEvent && selectedEvent.id === id) {
        const updated = communicationEventService.getAllEvents().find(e => e.id === id);
        if (updated) setSelectedEvent(updated);
      }
    }
  };

  const handleCancelEvent = (id: string) => {
    if (confirm(language === 'tr' ? 'Bu iletiyi iptal etmek istediğinize emin misiniz?' : 'Are you sure you want to cancel this message?')) {
      communicationEventService.cancelCommunicationEvent(id);
      loadEvents();
      if (selectedEvent && selectedEvent.id === id) {
        const updated = communicationEventService.getAllEvents().find(e => e.id === id);
        if (updated) setSelectedEvent(updated);
      }
    }
  };

  // Extract unique tenantIds for filtering
  const uniqueTenants = Array.from(new Set(communicationEventService.getAllEvents().map(e => e.tenantId)));

  // Filter events
  const filteredEvents = events.filter(e => {
    if (channelFilter !== 'all' && e.channel !== channelFilter) return false;
    if (statusFilter !== 'all' && e.status !== statusFilter) return false;
    if (isSuperAdmin && selectedTenantFilter !== 'all' && e.tenantId !== selectedTenantFilter) return false;
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchSubject = e.subject?.toLowerCase().includes(query) || false;
      const matchBody = e.body.toLowerCase().includes(query);
      const matchType = e.type.toLowerCase().includes(query);
      const matchId = e.id.toLowerCase().includes(query);
      return matchSubject || matchBody || matchType || matchId;
    }
    return true;
  });

  const getStatusBadgeClass = (status: CommunicationDeliveryStatus) => {
    switch (status) {
      case 'queued':
        return 'bg-amber-50 text-amber-700 border border-amber-200';
      case 'rendered':
        return 'bg-blue-50 text-blue-700 border border-blue-200';
      case 'skipped':
        return 'bg-slate-100 text-slate-600 border border-slate-300';
      case 'sent':
        return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
      case 'failed':
        return 'bg-rose-50 text-rose-700 border border-rose-200';
      case 'cancelled':
        return 'bg-slate-50 text-slate-500 border border-slate-200';
      default:
        return 'bg-slate-100 text-slate-800';
    }
  };

  const getChannelBadgeClass = (channel: CommunicationChannel) => {
    switch (channel) {
      case 'email':
        return 'bg-violet-50 text-violet-700 border border-violet-100';
      case 'whatsapp':
        return 'bg-green-50 text-green-700 border border-green-100';
      case 'sms':
        return 'bg-cyan-50 text-cyan-700 border border-cyan-100';
      case 'in_app':
        return 'bg-amber-50 text-amber-700 border border-amber-100';
      case 'internal_note':
        return 'bg-neutral-100 text-neutral-800 border_neutral-200';
      default:
        return 'bg-slate-100 text-slate-800';
    }
  };

  const getChannelLabel = (channel: CommunicationChannel) => {
    switch (channel) {
      case 'email': return 'E-posta (Email)';
      case 'whatsapp': return 'WhatsApp';
      case 'sms': return 'SMS';
      case 'in_app': return 'Panel İçi (In-App)';
      case 'internal_note': return 'Dahili Not (Internal)';
      default: return channel;
    }
  };

  const getStatusLabel = (status: CommunicationDeliveryStatus) => {
    switch (status) {
      case 'queued': return language === 'tr' ? 'Sırada' : 'Queued';
      case 'rendered': return language === 'tr' ? 'Gönderime Hazır Kayıt' : 'Outbox Record (Ready)';
      case 'skipped': return language === 'tr' ? 'İzin Yok (Pas geçildi)' : 'Skipped (No Consent)';
      case 'sent': 
        if (providerConfig.mode === 'local_outbox_only') {
          return language === 'tr' ? 'Gönderim Simüle Edildi' : 'Sent (Simulated)';
        }
        return language === 'tr' ? 'Gönderildi / İletildi' : 'Delivered';
      case 'failed': return language === 'tr' ? 'Hata Oluştu' : 'Failed';
      case 'cancelled': return language === 'tr' ? 'İptal Edildi' : 'Cancelled';
      default: return status;
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden" id="communication-outbox-console">
      {/* Header Banner */}
      <div className="p-6 border-b border-rose-100/40 bg-gradient-to-r from-rose-50/10 via-white to-indigo-50/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 tracking-tight">
            {language === 'tr' ? 'Giden İletişim & Bildirim Kuyruğu' : 'Outbound Communications & Events'}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {isSuperAdmin 
              ? (language === 'tr' ? 'Platform genelindeki tüm e-posta, SMS ve WhatsApp etkinlik loglarını denetleyin.' : 'Audit email, SMS, and WhatsApp event logs across all platform tenants.')
              : (language === 'tr' ? 'Salonunuzun müşteriye ve çalışanlara giden operasyonel iletilerini listeleyin.' : 'Track client and staff notifications generated by your salon operations.')
            }
          </p>
        </div>
        
        {/* Outbox Status Info */}
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="font-semibold text-slate-700">
            {language === 'tr' ? 'Yerel Sunucu Outbox: Aktif' : 'Local Sandbox Outbox: Ready'}
          </span>
          <span className="text-slate-400">|</span>
          <span className="text-slate-500 font-mono text-[10px] bg-slate-100 px-2 py-0.5 rounded">
            {providerConfig.mode === 'local_outbox_only' ? 'Simüle (local_outbox_only)' : 'Provider Connected'}
          </span>
        </div>
      </div>

      {providerConfig.mode === 'local_outbox_only' && (
        <div className="px-6 py-2.5 bg-amber-50/50 border-b border-amber-100 text-[11px] text-amber-800 flex items-center gap-2">
          <span>⚠️</span>
          <span>
            {language === 'tr' 
              ? 'Mevcut mod: local_outbox_only. Gerçek e-posta, SMS veya WhatsApp mesajı gönderilmez. Kayıtlar yalnızca panelde simüle edilir ve sağlayıcı bağlandığında gönderim kuyruğuna alınabilir.' 
              : 'Current run mode: local_outbox_only. Real emails, SMS, or WhatsApp alerts are strictly deactivated. Messages are simulated in the outbox.'}
          </span>
        </div>
      )}

      {/* Control Filters Row */}
      <div className="p-4 bg-slate-50 border-b border-slate-100 grid grid-cols-1 md:grid-cols-4 gap-3">
        {/* Search */}
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">
            {language === 'tr' ? 'Mesaj veya ID Ara' : 'Search Message or ID'}
          </label>
          <input
            type="text"
            className="w-full text-xs border border-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-rose-500 bg-white"
            placeholder={language === 'tr' ? 'Ara...' : 'Filter...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Channel Filter */}
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">
            {language === 'tr' ? 'İletişim Kanalı' : 'Channel'}
          </label>
          <select
            className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 bg-white focus:outline-none"
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
          >
            <option value="all">{language === 'tr' ? 'Tüm Kanallar' : 'All Channels'}</option>
            <option value="in_app">{language === 'tr' ? 'Panel İçi (In-App)' : 'Panel In-App'}</option>
            <option value="email">{language === 'tr' ? 'E-posta (Email)' : 'Email'}</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="sms">SMS</option>
            {isSuperAdmin && <option value="internal_note">{language === 'tr' ? 'Dahili Not' : 'Internal Note'}</option>}
          </select>
        </div>

        {/* Status Filter */}
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">
            {language === 'tr' ? 'Gönderim Durumu' : 'Status'}
          </label>
          <select
            className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 bg-white focus:outline-none"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">{language === 'tr' ? 'Tüm Durumlar' : 'All Statuses'}</option>
            <option value="queued">{language === 'tr' ? 'Sırada' : 'Queued'}</option>
            <option value="rendered">{language === 'tr' ? 'Gönderime Hazır (Outbox)' : 'Outbox (Ready)'}</option>
            <option value="skipped">{language === 'tr' ? 'Pas Geçildi (İzin Yok)' : 'Skipped (No Consent)'}</option>
            <option value="sent">{language === 'tr' ? (providerConfig.mode === 'local_outbox_only' ? 'Simüle Gönderildi' : 'Gönderildi / İletildi') : 'Sent / Delivered'}</option>
            <option value="failed">{language === 'tr' ? 'Hatalı / Başarısız' : 'Failed'}</option>
            <option value="cancelled">{language === 'tr' ? 'İptal Edildi' : 'Cancelled'}</option>
          </select>
        </div>

        {/* Tenant Filter (Super Admin Only) */}
        {isSuperAdmin ? (
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              {language === 'tr' ? 'Salon Seçimi' : 'Salon / Tenant'}
            </label>
            <select
              className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 bg-white focus:outline-none"
              value={selectedTenantFilter}
              onChange={(e) => setSelectedTenantFilter(e.target.value)}
            >
              <option value="all">{language === 'tr' ? 'Tüm Salonlar' : 'All Tenants'}</option>
              {uniqueTenants.map(tid => (
                <option key={tid} value={tid}>{tid}</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="flex items-end">
            <button 
              onClick={loadEvents}
              className="w-full bg-slate-200 hover:bg-slate-300 transition text-[11px] font-medium text-slate-700 rounded py-1.5"
            >
              🔄 {language === 'tr' ? 'Listeyi Yenile' : 'Refresh Outbox'}
            </button>
          </div>
        )}
      </div>

      {/* Main Grid View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
        
        {/* Left Side: Events List */}
        <div className="col-span-1 lg:col-span-6 border-r border-slate-100 max-h-[480px] overflow-y-auto">
          {filteredEvents.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              <span className="block text-2xl mb-1">✉️</span>
              {language === 'tr' ? 'Eşleşen bildirim veya ileti kaydı bulunamadı.' : 'No matching communication logs found.'}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredEvents.map(event => (
                <div
                  key={event.id}
                  onClick={() => setSelectedEvent(event)}
                  className={`p-4 cursor-pointer hover:bg-slate-50 transition text-left ${selectedEvent?.id === event.id ? 'bg-rose-50/20 shadow-inner border-l-2 border-rose-500' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="font-mono text-[10px] text-slate-400 font-medium">
                      #{event.id}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>

                  <div className="text-xs font-semibold text-slate-800 line-clamp-1 mb-1.5">
                    {event.subject || event.type.replace(/_/g, ' ').toUpperCase()}
                  </div>

                  <div className="text-[11px] text-slate-500 line-clamp-2 bg-slate-50 p-1.5 rounded mb-2 border border-slate-100/50">
                    {event.body}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getChannelBadgeClass(event.channel)}`}>
                      {getChannelLabel(event.channel)}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getStatusBadgeClass(event.status)}`}>
                      {getStatusLabel(event.status)}
                    </span>
                    <span className="text-[10px] bg-slate-100 text-slate-500 rounded px-1.5 py-0.5">
                      {event.audience.replace(/_/g, ' ')}
                    </span>
                    {event.internalOnly && (
                      <span className="text-[9px] bg-rose-100 text-rose-800 rounded px-1.5">
                        Dahili Not
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Side: Event Details / Template Inspection */}
        <div className="col-span-1 lg:col-span-6 p-6 bg-slate-50/30 min-h-[350px]">
          {selectedEvent ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    {language === 'tr' ? 'İleti Detayları' : 'Message Inspection'}
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5 font-mono">ID: {selectedEvent.id}</p>
                </div>
                <button 
                  onClick={() => setSelectedEvent(null)}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  ✕ {language === 'tr' ? 'Kapat' : 'Close'}
                </button>
              </div>

              {/* Formatted View simulated like a phone alert or email browser preview */}
              <div className="border border-slate-200 rounded-lg overflow-hidden shadow-sm bg-white">
                <div className="bg-slate-100 border-b border-slate-200 px-4 py-2 flex items-center gap-1.5 text-xs">
                  {/* Visual dots */}
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-400"></span>
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                  <span className="font-medium text-slate-500 ml-2">
                    {selectedEvent.channel === 'email' ? '📨 Browser Preview' : '📱 Device Alert'}
                  </span>
                </div>
                
                <div className="p-4 bg-white text-left space-y-3">
                  {selectedEvent.subject && (
                    <div className="border-b border-slate-100 pb-2">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">
                        {language === 'tr' ? 'KOnu / Başlık' : 'Subject'}
                      </span>
                      <span className="text-xs font-bold text-slate-800">{selectedEvent.subject}</span>
                    </div>
                  )}

                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                      {language === 'tr' ? 'Mesaj Gövdesi' : 'Content Body'}
                    </span>
                    <div className="text-xs text-slate-700 bg-slate-50 p-3 rounded font-sans leading-relaxed whitespace-pre-wrap border border-slate-100">
                      {selectedEvent.body}
                    </div>
                  </div>

                  {selectedEvent.failureReason && (
                    <div className="bg-rose-50/40 border border-rose-100 p-2.5 rounded text-left">
                      <span className="text-[10px] text-rose-500 font-bold block uppercase">
                        {language === 'tr' ? 'Kayıt / Hata Detayı' : 'Diagnostic Info'}
                      </span>
                      <span className="text-xs text-slate-700">{selectedEvent.failureReason}</span>
                    </div>
                  )}

                  {selectedEvent.providerMessageId && (
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold uppercase block">
                        Provider Message ID:
                      </span>
                      <span className="font-mono text-xs text-slate-600 bg-slate-100 px-1 py-0.5 rounded">
                        {selectedEvent.providerMessageId}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Event Metadata */}
              <div className="bg-white p-4 border border-slate-200 rounded-lg text-left text-xs space-y-1">
                <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                  {language === 'tr' ? 'Sistem Parametreleri' : 'System Metadata'}
                </span>
                <div className="grid grid-cols-2 gap-y-1 gap-x-2 font-mono text-[10px] text-slate-500">
                  <div>Tenant ID: <span className="font-semibold text-slate-700">{selectedEvent.tenantId}</span></div>
                  <div>Audience: <span className="font-semibold text-slate-700">{selectedEvent.audience}</span></div>
                  <div>Type: <span className="font-semibold text-slate-700">{selectedEvent.type}</span></div>
                  <div>Channel: <span className="font-semibold text-slate-700">{selectedEvent.channel}</span></div>
                  <div>Status: <span className="font-semibold text-slate-700">{selectedEvent.status}</span></div>
                  <div>Language: <span className="font-semibold text-slate-700">{selectedEvent.language.toUpperCase()}</span></div>
                </div>
              </div>

              {/* Interactive Actions for Super Admin */}
              {isSuperAdmin && (
                <div className="bg-rose-50/10 border border-rose-100/40 p-4 rounded-lg flex flex-wrap gap-2 justify-end" id="super-admin-outbox-actions">
                  <span className="text-[10px] font-bold text-slate-500 mr-auto self-center uppercase">
                    Super Admin Actions:
                  </span>
                  
                  {selectedEvent.status !== 'sent' && (
                    <button
                      onClick={() => handleMarkSent(selectedEvent.id)}
                      className="bg-emerald-600 hover:bg-emerald-700 transition text-white px-2.5 py-1 rounded text-xs"
                    >
                      {language === 'tr' ? 'Gönderildi İşaretle' : 'Mark Sent'}
                    </button>
                  )}

                  {selectedEvent.status !== 'failed' && (
                    <button
                      onClick={() => handleMarkFailed(selectedEvent.id)}
                      className="bg-rose-600 hover:bg-rose-700 transition text-white px-2.5 py-1 rounded text-xs"
                    >
                      {language === 'tr' ? 'Hatalı İşaretle' : 'Mark Failed'}
                    </button>
                  )}

                  {selectedEvent.status !== 'cancelled' && (
                    <button
                      onClick={() => handleCancelEvent(selectedEvent.id)}
                      className="bg-slate-200 hover:bg-slate-300 transition text-slate-700 px-2.5 py-1 rounded text-xs"
                    >
                      {language === 'tr' ? 'İptal Et' : 'Cancel Event'}
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[300px] text-slate-400 text-xs">
              <span>👈</span>
              <p className="mt-2 text-center">
                {language === 'tr' ? 'Detayları görmek veya önizlemek için listeden bir ileti seçin.' : 'Select a message from the queue on the left to inspect its parameters.'}
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
