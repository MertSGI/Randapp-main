import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useDialog } from '../../contexts/DialogContext';
import { auditLogService } from '../../services/auditLogService';
import { supportTicketService } from '../../services/supportTicketService';
import { incidentResponseService } from '../../services/incidentResponseService';
import { AuditEvent, SupportTicket, Incident, AuditEventSeverity, AuditEventCategory, SupportTicketPriority, SupportTicketCategory, IncidentSeverity } from '../../types';
import { 
  ShieldAlert, 
  AlertTriangle, 
  Info, 
  CheckCircle, 
  LifeBuoy, 
  Activity, 
  FileText, 
  Plus, 
  Filter, 
  ArrowRight, 
  Eye, 
  AlertCircle,
  XCircle,
  RefreshCw,
  Search,
  User,
  ExternalLink
} from 'lucide-react';

const SuperAdminObservabilityPage: React.FC = () => {
  const { language } = useLanguage();
  const { alert: showAlert, confirm: showConfirm } = useDialog();

  // State
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);

  // Filters for Audit Logs
  const [severityFilter, setSeverityFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [tenantFilter, setTenantFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Tab State
  const [activeTab, setActiveTab] = useState<'audit' | 'tickets' | 'incidents'>('audit');

  // Modal State for Manual Ticket
  const [showNewTicketModal, setShowNewTicketModal] = useState(false);
  const [newTicketTitle, setNewTicketTitle] = useState('');
  const [newTicketDesc, setNewTicketDesc] = useState('');
  const [newTicketCategory, setNewTicketCategory] = useState<SupportTicketCategory>('other');
  const [newTicketPriority, setNewTicketPriority] = useState<SupportTicketPriority>('normal');
  const [newTicketTenantId, setNewTicketTenantId] = useState('');
  const [newTicketName, setNewTicketName] = useState('');
  const [newTicketPhone, setNewTicketPhone] = useState('');
  const [newTicketEmail, setNewTicketEmail] = useState('');

  // Detail Modal State
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);

  // Escalate Modal State
  const [showEscalateEventModal, setShowEscalateEventModal] = useState(false);
  const [escalatingEvent, setEscalatingEvent] = useState<AuditEvent | null>(null);
  const [escalationReason, setEscalationReason] = useState('');

  const [showEscalateTicketModal, setShowEscalateTicketModal] = useState(false);
  const [escalatingTicket, setEscalatingTicket] = useState<SupportTicket | null>(null);
  const [escalationIncidentSeverity, setEscalationIncidentSeverity] = useState<IncidentSeverity>('sev3_moderate');
  const [escalationIncidentTitle, setEscalationIncidentTitle] = useState('');
  const [escalationIncidentSummary, setEscalationIncidentSummary] = useState('');

  // Mitigation & Postmortem Notes state
  const [showResolveModal, setShowResolveModal] = useState<any>(null); // { type: 'ticket' | 'incident', id: string }
  const [resolutionNotes, setResolutionNotes] = useState('');

  const loadData = () => {
    const rawEvents = auditLogService.listAuditEvents();
    const rawTickets = supportTicketService.listSupportTickets();
    const rawIncidents = incidentResponseService.listIncidents();

    setEvents(rawEvents);
    setTickets(rawTickets);
    setIncidents(rawIncidents);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleMarkEventReviewed = (id: string) => {
    auditLogService.markAuditEventReviewed(id, 'super_admin');
    showAlert('Olay incelenmiş olarak işaretlendi.');
    loadData();
    if (selectedEvent && selectedEvent.id === id) {
      setSelectedEvent(auditLogService.getAuditEvent(id) || null);
    }
  };

  const handleCreateTicketManually = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTicketTitle.trim() || !newTicketDesc.trim()) {
      showAlert('Lütfen başlık ve açıklama alanlarını doldurun.');
      return;
    }

    supportTicketService.createSupportTicket({
      tenantId: newTicketTenantId ? newTicketTenantId : undefined,
      source: 'super_admin',
      category: newTicketCategory,
      priority: newTicketPriority,
      title: newTicketTitle,
      description: newTicketDesc,
      requesterName: newTicketName || 'Sistem Yöneticisi',
      requesterEmail: newTicketEmail || 'admin@randevulari.com',
      requesterPhone: newTicketPhone || '',
    });

    showAlert('Destek talebi manuel olarak oluşturuldu.');
    setShowNewTicketModal(false);
    // Reset form
    setNewTicketTitle('');
    setNewTicketDesc('');
    setNewTicketCategory('other');
    setNewTicketPriority('normal');
    setNewTicketTenantId('');
    setNewTicketName('');
    setNewTicketPhone('');
    setNewTicketEmail('');
    
    loadData();
  };

  // Escalate Audit Event to Support Ticket
  const handleOpenEscalateEvent = (event: AuditEvent) => {
    setEscalatingEvent(event);
    setEscalationReason(`[Olay Esaslı Esas Escalesi] ${event.summary}\nOlay ID: ${event.id}\nKategori: ${event.category}\nCiddiyet: ${event.severity}`);
    setShowEscalateEventModal(true);
  };

  const handleEscalateEventSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!escalatingEvent) return;

    // Create a support ticket
    const ticket = supportTicketService.createSupportTicket({
      tenantId: escalatingEvent.tenantId,
      source: 'system',
      category: 'security',
      priority: escalatingEvent.severity === 'critical' ? 'urgent' : 'high',
      title: `Eskale Edilen Güvenlik/Sistem Olayı: ${escalatingEvent.action}`,
      description: escalationReason,
      relatedAuditEventIds: [escalatingEvent.id]
    });

    // Mark audit event escalated
    auditLogService.escalateAuditEvent(escalatingEvent.id, `Ticket #${ticket.id} olarak eskale edildi.`);

    showAlert(`Olay başarıyla ${ticket.id} numaralı destek biletine eskale edildi.`);
    setShowEscalateEventModal(false);
    setEscalatingEvent(null);
    setEscalationReason('');
    loadData();
    setSelectedEvent(null);
  };

  // Escalate Support Ticket to Incident
  const handleOpenEscalateTicket = (ticket: SupportTicket) => {
    setEscalatingTicket(ticket);
    setEscalationIncidentTitle(`Sistem Kesintisi / Anomali: ${ticket.title}`);
    setEscalationIncidentSummary(`Müşteri destek talebinden tetiklenen sistem olayı. Talep ID: ${ticket.id}. Detaylar: ${ticket.description}`);
    setShowEscalateTicketModal(true);
  };

  const handleEscalateTicketSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!escalatingTicket) return;

    // Create Incident
    const incident = incidentResponseService.createIncident({
      severity: escalationIncidentSeverity,
      title: escalationIncidentTitle,
      summary: escalationIncidentSummary,
      affectedTenantIds: escalatingTicket.tenantId ? [escalatingTicket.tenantId] : [],
      affectedCategories: ['system', 'security'],
      relatedSupportTicketIds: [escalatingTicket.id],
      relatedAuditEventIds: escalatingTicket.relatedAuditEventIds,
      owner: 'Super Admin'
    });

    // Update ticket status
    supportTicketService.updateSupportTicketStatus(escalatingTicket.id, 'escalated');
    supportTicketService.addInternalNote(escalatingTicket.id, `Bu bilet ${incident.id} kodlu Incident'a yükseltildi.`);

    showAlert(`Bilet başarıyla ${incident.id} numaralı Incident olayına yükseltildi.`);
    setShowEscalateTicketModal(false);
    setEscalatingTicket(null);
    loadData();
    setSelectedTicket(null);
  };

  const handleResolveTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!showResolveModal || showResolveModal.type !== 'ticket') return;

    supportTicketService.resolveSupportTicket(showResolveModal.id, resolutionNotes);
    showAlert('Destek talebi çözümlendi.');
    setShowResolveModal(null);
    setResolutionNotes('');
    loadData();
    setSelectedTicket(null);
  };

  const handleResolveIncident = (e: React.FormEvent) => {
    e.preventDefault();
    if (!showResolveModal || showResolveModal.type !== 'incident') return;

    incidentResponseService.resolveIncident(showResolveModal.id, resolutionNotes);
    showAlert('Incident olayı çözümlendi ve kapatıldı.');
    setShowResolveModal(null);
    setResolutionNotes('');
    loadData();
    setSelectedIncident(null);
  };

  // Filtering Logic
  const filteredEvents = events.filter(e => {
    const matchesSeverity = !severityFilter || e.severity === severityFilter;
    const matchesCategory = !categoryFilter || e.category === categoryFilter;
    const matchesTenant = !tenantFilter || (e.tenantId && e.tenantId.toLowerCase().includes(tenantFilter.toLowerCase()));
    const matchesSearch = !searchQuery || 
      e.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.id && e.id.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesSeverity && matchesCategory && matchesTenant && matchesSearch;
  });

  const getSeverityBadge = (severity: AuditEventSeverity) => {
    switch (severity) {
      case 'info':
        return <span className="bg-gray-100 text-gray-800 dark:bg-slate-800 dark:text-slate-300 px-2 py-0.5 rounded text-xs font-semibold">INFO</span>;
      case 'notice':
        return <span className="bg-blue-100 text-blue-800 dark:bg-blue-950/30 dark:text-blue-400 px-2 py-0.5 rounded text-xs font-semibold">NOTICE</span>;
      case 'warning':
        return <span className="bg-yellow-100 text-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-400 px-2 py-0.5 rounded text-xs font-semibold">WARNING</span>;
      case 'error':
        return <span className="bg-orange-100 text-orange-800 dark:bg-orange-950/30 dark:text-orange-400 px-2 py-0.5 rounded text-xs font-semibold">ERROR</span>;
      case 'critical':
        return <span className="bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-400 px-2 py-0.5 rounded text-xs font-semibold animate-pulse">CRITICAL</span>;
    }
  };

  const getTicketPriorityBadge = (priority: SupportTicketPriority) => {
    switch (priority) {
      case 'low':
        return <span className="text-gray-600 bg-gray-100 dark:text-slate-400 dark:bg-slate-800 px-2 py-0.5 rounded text-xs font-semibold">Düşük</span>;
      case 'normal':
        return <span className="text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/20 px-2 py-0.5 rounded text-xs font-semibold">Normal</span>;
      case 'high':
        return <span className="text-orange-600 bg-orange-50 dark:text-orange-400 dark:bg-orange-950/20 px-2 py-0.5 rounded text-xs font-semibold">Yüksek</span>;
      case 'urgent':
        return <span className="text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/20 px-2 py-0.5 rounded text-xs font-semibold animate-pulse">ACİL</span>;
    }
  };

  const getIncidentSeverityBadge = (sev: IncidentSeverity) => {
    switch (sev) {
      case 'sev4_minor':
        return <span className="bg-slate-100 text-slate-800 dark:bg-slate-800 px-2 py-0.5 rounded text-xs font-semibold">Sev4 (Minor)</span>;
      case 'sev3_moderate':
        return <span className="bg-blue-100 text-blue-800 dark:bg-blue-950/20 px-2 py-0.5 rounded text-xs font-semibold">Sev3 (Moderate)</span>;
      case 'sev2_major':
        return <span className="bg-orange-100 text-orange-800 dark:bg-orange-950/20 px-2 py-0.5 rounded text-xs font-semibold">Sev2 (Major)</span>;
      case 'sev1_critical':
        return <span className="bg-red-100 text-red-800 dark:bg-red-950/20 px-2 py-0.5 rounded text-xs font-semibold animate-pulse">Sev1 (CRITICAL)</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Upper Status Warn Area */}
      <div className="p-5 bg-yellow-50 dark:bg-yellow-950/20 border-l-4 border-yellow-400 rounded-lg shadow-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-yellow-600 shrink-0 mt-0.5" />
          <div>
            <h2 className="font-bold text-yellow-900 dark:text-yellow-400 text-base">Yerel Gözlem Kaydı (Local Pre-Live Mode)</h2>
            <p className="text-sm text-yellow-800 dark:text-yellow-500 mt-1">
              Canlı izleme sağlayıcısı bağlı değildir. Bu panel olayları yerel/pre-live ortamda incelemek içindir. 
              Gerçek alarm ve harici izleme (Sentry, Datadog, Slack webhooks) canlı ortamda ayrıca etkinleştirilir. 
              Tüm hassas veriler maskelenerek lokal audit outboxunda tutulmaktadır.
            </p>
          </div>
        </div>
      </div>

      {/* Observability Counters Summary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center gap-4">
          <div className="p-3 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 rounded-lg">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400">Toplam Audit Kaydı</div>
            <div className="text-xl font-bold text-slate-800 dark:text-white">{events.length}</div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center gap-4">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 rounded-lg">
            <LifeBuoy className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400">Açık Destek Talepleri</div>
            <div className="text-xl font-bold text-slate-800 dark:text-white">
              {tickets.filter(t => t.status === 'open' || t.status === 'escalated').length}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center gap-4">
          <div className="p-3 bg-orange-50 dark:bg-orange-950/20 text-orange-600 dark:text-orange-400 rounded-lg">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400">Aktif Incident Olayı</div>
            <div className="text-xl font-bold text-slate-800 dark:text-white">
              {incidents.filter(i => i.status !== 'resolved' && i.status !== 'closed').length}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col justify-center">
          <div className="text-xs text-slate-400 text-center">Sağlayıcı Bağlantıları</div>
          <div className="text-sm font-bold text-red-500 text-center mt-1">Canlı Entegrasyon Yok</div>
        </div>
      </div>

      {/* Tab Select & Actions Area */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-700 pb-2">
        <div className="flex gap-2">
          <button 
            onClick={() => setActiveTab('audit')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition ${activeTab === 'audit' ? 'bg-slate-900 text-white dark:bg-blue-600' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
          >
            Audit Olay Kayıtları
          </button>
          <button 
            onClick={() => setActiveTab('tickets')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition ${activeTab === 'tickets' ? 'bg-slate-900 text-white dark:bg-blue-600' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
          >
            Destek Bilet Kuyruğu
          </button>
          <button 
            onClick={() => setActiveTab('incidents')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition ${activeTab === 'incidents' ? 'bg-slate-900 text-white dark:bg-blue-600' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
          >
            Incident Listesi
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={loadData}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Yenile
          </button>
          <button 
            onClick={() => setShowNewTicketModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
          >
            <Plus className="w-3.5 h-3.5" /> Bilet Oluştur
          </button>
        </div>
      </div>

      {/* Dynamic View Panel */}
      {activeTab === 'audit' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          {/* Filters Bar */}
          <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input 
                type="text" 
                placeholder="Özet, aksiyon veya ID ara..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <select 
                value={severityFilter}
                onChange={e => setSeverityFilter(e.target.value)}
                className="w-full py-2 px-3 text-xs rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus:outline-none"
              >
                <option value="">Ciddiyet Seç (Hepsi)</option>
                <option value="info">INFO</option>
                <option value="notice">NOTICE</option>
                <option value="warning">WARNING</option>
                <option value="error">ERROR</option>
                <option value="critical">CRITICAL</option>
              </select>
            </div>

            <div>
              <select 
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="w-full py-2 px-3 text-xs rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus:outline-none"
              >
                <option value="">Kategori Seç (Hepsi)</option>
                <option value="booking">booking (Rezervasyon)</option>
                <option value="customer_self_service">customer_self_service (Müşteri Servisleri)</option>
                <option value="anti_abuse">anti_abuse (Spam/Blokaj)</option>
                <option value="payment">payment (Ödemeler)</option>
                <option value="subscription">subscription (Abonelik)</option>
                <option value="media">media (Medya/SVG)</option>
                <option value="migration">migration (Taşıma)</option>
                <option value="support">support (Destek)</option>
                <option value="security">security (Güvenlik)</option>
                <option value="system">system (Sistem)</option>
              </select>
            </div>

            <div>
              <input 
                type="text" 
                placeholder="Tenant ID ile filtrele..."
                value={tenantFilter}
                onChange={e => setTenantFilter(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus:outline-none"
              />
            </div>
          </div>

          {/* Events Table List */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-900/30 text-xs text-slate-400 border-b border-slate-200 dark:border-slate-700">
                  <th className="p-4 font-semibold">Tarih</th>
                  <th className="p-4 font-semibold">ID & Ciddiyet</th>
                  <th className="p-4 font-semibold">Aktör & Kategori</th>
                  <th className="p-4 font-semibold">Olay Açıklaması</th>
                  <th className="p-4 font-semibold">Durum</th>
                  <th className="p-4 font-semibold text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {filteredEvents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      Hiç uyumlu audit kaydı bulunamadı.
                    </td>
                  </tr>
                ) : (
                  filteredEvents.map(e => (
                    <tr key={e.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="p-4 whitespace-nowrap text-slate-400">
                        {new Date(e.createdAt).toLocaleString('tr-TR')}
                      </td>
                      <td className="p-4 whitespace-nowrap space-y-1">
                        <div className="font-mono text-[10px] text-slate-400">{e.id}</div>
                        <div>{getSeverityBadge(e.severity)}</div>
                      </td>
                      <td className="p-4 space-y-1">
                        <div className="font-medium text-slate-700 dark:text-slate-300 capitalize">{e.actorType}</div>
                        <div className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded w-max">{e.category}</div>
                      </td>
                      <td className="p-4">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">{e.action}</div>
                        <div className="text-slate-500 line-clamp-1">{e.summary}</div>
                        {e.redactionApplied && (
                          <span className="text-[10px] text-purple-600 bg-purple-50 dark:bg-purple-950/20 px-1 py-0.2 rounded font-medium">Maskeleme Uygulandı</span>
                        )}
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          e.status === 'reviewed' ? 'bg-green-100 text-green-800' :
                          e.status === 'escalated' ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {e.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="p-4 text-right space-x-1 whitespace-nowrap">
                        <button 
                          onClick={() => setSelectedEvent(e)}
                          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-500 hover:text-slate-700"
                          title="Detayları İncele"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {e.status === 'recorded' && (
                          <>
                            <button 
                              onClick={() => handleMarkEventReviewed(e.id)}
                              className="px-2 py-1 bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100 text-[10px] font-bold"
                            >
                              İnceledim
                            </button>
                            <button 
                              onClick={() => handleOpenEscalateEvent(e)}
                              className="px-2 py-1 bg-orange-50 text-orange-700 border border-orange-200 rounded hover:bg-orange-100 text-[10px] font-bold"
                            >
                              Bilete Dönüştür
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Support Tickets Queue Tab */}
      {activeTab === 'tickets' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Tickets Column */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 font-bold text-sm text-slate-700 dark:text-slate-300">
              Mevcut Destek Talepleri ({tickets.length})
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[600px] overflow-y-auto">
              {tickets.length === 0 ? (
                <div className="p-8 text-center text-slate-400">Açık destek talebi bulunmamaktadır.</div>
              ) : (
                tickets.map(t => (
                  <div key={t.id} className="p-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 flex items-start justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-slate-400">{t.id}</span>
                        {getTicketPriorityBadge(t.priority)}
                        <span className="text-[10px] text-slate-500 uppercase font-bold bg-slate-100 dark:bg-slate-700 px-1.5 py-0.2 rounded">{t.category}</span>
                      </div>
                      <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">{t.title}</h4>
                      <p className="text-xs text-slate-500 line-clamp-2">{t.description}</p>
                      <div className="flex items-center gap-3 text-[10px] text-slate-400 pt-1">
                        <span>Kaynak: {t.source}</span>
                        <span>•</span>
                        <span>{new Date(t.createdAt).toLocaleString('tr-TR')}</span>
                        {t.tenantId && (
                          <>
                            <span>•</span>
                            <span className="text-indigo-600 dark:text-indigo-400 font-semibold">Tenant: {t.tenantId}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        t.status === 'open' ? 'bg-blue-100 text-blue-800' :
                        t.status === 'resolved' ? 'bg-green-100 text-green-800' :
                        t.status === 'escalated' ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {t.status.toUpperCase()}
                      </span>
                      <button 
                        onClick={() => setSelectedTicket(t)}
                        className="px-2 py-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded text-xs font-bold transition"
                      >
                        Yönet
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Ticket Detail & Management Card */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
            <h3 className="font-bold text-sm border-b border-slate-100 dark:border-slate-800 pb-2">Seçili Talep Yönetimi</h3>
            {selectedTicket ? (
              <div className="space-y-4 text-xs">
                <div className="space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Başlık & ID</div>
                  <div className="font-bold text-slate-800 dark:text-white text-sm">{selectedTicket.title}</div>
                  <div className="font-mono text-slate-400">{selectedTicket.id}</div>
                </div>

                <div className="space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Açıklama</div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 max-h-36 overflow-y-auto">
                    {selectedTicket.description}
                  </div>
                </div>

                {selectedTicket.requesterName && (
                  <div className="grid grid-cols-2 gap-2 p-2.5 bg-slate-50 dark:bg-slate-900 rounded">
                    <div>
                      <div className="text-[10px] text-slate-400">Talep Eden</div>
                      <div className="font-semibold text-slate-800 dark:text-slate-200">{selectedTicket.requesterName}</div>
                    </div>
                    {selectedTicket.requesterPhone && (
                      <div>
                        <div className="text-[10px] text-slate-400">Telefon</div>
                        <div className="font-mono text-slate-800 dark:text-slate-200">{selectedTicket.requesterPhone}</div>
                      </div>
                    )}
                  </div>
                )}

                {selectedTicket.relatedAuditEventIds.length > 0 && (
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">Bağlantılı Audit Kayıtları</div>
                    <div className="flex flex-wrap gap-1">
                      {selectedTicket.relatedAuditEventIds.map(aeId => (
                        <span key={aeId} className="bg-purple-50 text-purple-700 dark:bg-purple-950/20 dark:text-purple-400 border border-purple-200 dark:border-purple-800 px-2 py-0.5 rounded text-[10px] font-mono">
                          {aeId}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedTicket.internalNotes && (
                  <div className="space-y-1">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Dahili Notlar / Geçmiş</div>
                    <pre className="p-2 bg-yellow-50/50 dark:bg-yellow-950/10 border border-yellow-100 rounded text-[10px] font-mono whitespace-pre-wrap max-h-24 overflow-y-auto text-slate-600 dark:text-slate-300">
                      {selectedTicket.internalNotes}
                    </pre>
                  </div>
                )}

                {/* Operations */}
                {selectedTicket.status !== 'resolved' && selectedTicket.status !== 'closed' ? (
                  <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button 
                      onClick={() => setShowResolveModal({ type: 'ticket', id: selectedTicket.id })}
                      className="w-full py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition"
                    >
                      Bileti Çözümlendi Olarak Kapat
                    </button>
                    {selectedTicket.status !== 'escalated' && (
                      <button 
                        onClick={() => handleOpenEscalateTicket(selectedTicket)}
                        className="w-full py-2 bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 font-bold rounded-lg transition"
                      >
                        Sistem Olayına (Incident) Eskale Et
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="p-3 bg-green-50 text-green-800 rounded border border-green-200 text-center font-bold">
                    Bu talep başarıyla çözümlenmiştir.
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-slate-400 text-xs">
                Yönetmek ve detaylarını incelemek istediğiniz destek biletini soldaki listeden seçin.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Incidents Management Tab */}
      {activeTab === 'incidents' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Incident Stream */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 font-bold text-sm text-slate-700 dark:text-slate-300">
              Sistem Genel Incident Olayları ({incidents.length})
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {incidents.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-xs">Aktif veya kayıtlı bir incident / kesinti vakası bulunmamaktadır.</div>
              ) : (
                incidents.map(inc => (
                  <div key={inc.id} className="p-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 flex items-start justify-between gap-4">
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-slate-400">{inc.id}</span>
                        {getIncidentSeverityBadge(inc.severity)}
                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                          inc.status === 'resolved' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800 animate-pulse'
                        }`}>
                          {inc.status.toUpperCase()}
                        </span>
                      </div>
                      <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100">{inc.title}</h4>
                      <p className="text-xs text-slate-500 line-clamp-2">{inc.summary}</p>
                      <div className="flex items-center gap-3 text-[10px] text-slate-400 pt-1">
                        <span>Tespit: {new Date(inc.detectedAt).toLocaleString('tr-TR')}</span>
                        {inc.resolvedAt && (
                          <>
                            <span>•</span>
                            <span className="text-green-600">Çözüm: {new Date(inc.resolvedAt).toLocaleString('tr-TR')}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <button 
                      onClick={() => setSelectedIncident(inc)}
                      className="px-2 py-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded text-xs font-bold transition shrink-0"
                    >
                      İncele
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Incident Resolution & Ops Panel */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
            <h3 className="font-bold text-sm border-b border-slate-100 dark:border-slate-800 pb-2">Incident Çözümleme ve Koordinasyon</h3>
            {selectedIncident ? (
              <div className="space-y-4 text-xs">
                <div className="space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Olay ID & Başlık</div>
                  <div className="font-bold text-slate-800 dark:text-white text-sm">{selectedIncident.title}</div>
                  <div className="font-mono text-slate-400">{selectedIncident.id}</div>
                </div>

                <div className="space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Özet & Teşhis</div>
                  <div className="p-3 bg-red-50/50 dark:bg-red-950/10 rounded border border-red-100 text-slate-700 dark:text-slate-300 max-h-36 overflow-y-auto">
                    {selectedIncident.summary}
                  </div>
                </div>

                {selectedIncident.relatedSupportTicketIds.length > 0 && (
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">Bağlantılı Destek Biletleri</div>
                    <div className="flex flex-wrap gap-1">
                      {selectedIncident.relatedSupportTicketIds.map(tktId => (
                        <span key={tktId} className="bg-indigo-50 text-indigo-700 dark:bg-indigo-950/20 dark:text-indigo-400 border border-indigo-200 px-2 py-0.5 rounded text-[10px] font-mono">
                          {tktId}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedIncident.postmortemNotes && (
                  <div className="space-y-1">
                    <div className="text-[10px] text-slate-400 uppercase font-bold text-green-700 dark:text-green-400">Postmortem ve Çözüm Raporu</div>
                    <pre className="p-2 bg-green-50/50 dark:bg-green-950/10 border border-green-100 rounded text-[10px] font-mono whitespace-pre-wrap text-slate-600 dark:text-slate-300">
                      {selectedIncident.postmortemNotes}
                    </pre>
                  </div>
                )}

                {selectedIncident.status !== 'resolved' ? (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button 
                      onClick={() => setShowResolveModal({ type: 'incident', id: selectedIncident.id })}
                      className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition"
                    >
                      Vakayı Çözümlendi Olarak Kapat (Resolve)
                    </button>
                  </div>
                ) : (
                  <div className="p-3 bg-green-50 text-green-800 rounded border border-green-200 text-center font-bold">
                    Bu vaka kapatılmıştır. Tüm servisler stabil durumda.
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-slate-400 text-xs">
                Yönetmek ve koordine etmek istediğiniz Incident olayını soldaki listeden seçin.
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- MODALS --- */}

      {/* Detail View Audit Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col">
            <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-500" />
                Audit Olay Detayı: {selectedEvent.id}
              </h3>
              <button onClick={() => setSelectedEvent(null)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="text-slate-400 font-bold uppercase">Aksiyon Tipi</div>
                  <div className="font-semibold text-sm text-slate-800 dark:text-slate-200">{selectedEvent.action}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-slate-400 font-bold uppercase">Kategori & Önem</div>
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <span className="bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300 font-bold">{selectedEvent.category}</span>
                    {getSeverityBadge(selectedEvent.severity)}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-slate-400 font-bold uppercase">Aktör & Tip</div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200 capitalize">{selectedEvent.actorType} (ID: {selectedEvent.actorId || 'Sistem'})</div>
                </div>
                <div className="space-y-1">
                  <div className="text-slate-400 font-bold uppercase">Tarih</div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200">{new Date(selectedEvent.createdAt).toLocaleString('tr-TR')}</div>
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-slate-400 font-bold uppercase">Açıklama / Özet</div>
                <div className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-slate-800 dark:text-slate-200 font-medium">
                  {selectedEvent.summary}
                </div>
              </div>

              {selectedEvent.safeDetails && (
                <div className="space-y-1">
                  <div className="text-slate-400 font-bold uppercase flex items-center gap-1">
                    <span>Güvenli Detaylar (safeDetails)</span>
                    <span className="text-[10px] text-green-600 bg-green-50 dark:bg-green-950/20 px-1 rounded font-normal">PII Redacted</span>
                  </div>
                  <pre className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-[10px] font-mono overflow-x-auto text-slate-700 dark:text-slate-300 max-h-48">
                    {JSON.stringify(selectedEvent.safeDetails, null, 2)}
                  </pre>
                </div>
              )}

              {selectedEvent.metadata && (
                <div className="space-y-1">
                  <div className="text-slate-400 font-bold uppercase">Ek Meta Veriler (metadata)</div>
                  <pre className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-[10px] font-mono overflow-x-auto text-slate-700 dark:text-slate-300 max-h-48">
                    {JSON.stringify(selectedEvent.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2 shrink-0">
              <button 
                onClick={() => setSelectedEvent(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg font-bold"
              >
                Kapat
              </button>
              {selectedEvent.status === 'recorded' && (
                <>
                  <button 
                    onClick={() => {
                      handleMarkEventReviewed(selectedEvent.id);
                      setSelectedEvent(null);
                    }}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg"
                  >
                    İnceledim Olarak İşaretle
                  </button>
                  <button 
                    onClick={() => {
                      handleOpenEscalateEvent(selectedEvent);
                    }}
                    className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-lg"
                  >
                    Bilete Dönüştür
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Escalate Event Modal */}
      {showEscalateEventModal && escalatingEvent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleEscalateEventSubmit} className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-orange-500" />
              Olayı Destek Talebine Eskale Et
            </h3>
            
            <p className="text-xs text-slate-500">
              Bu sistem uyarısını/olayını, teknik destek ekibinin (veya sizin) doğrudan takip etmesi için açık bir destek biletine dönüştürüyorsunuz.
            </p>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400">Bilet Açıklaması & Eskalasyon Gerekçesi</label>
              <textarea 
                value={escalationReason}
                onChange={e => setEscalationReason(e.target.value)}
                rows={5}
                className="w-full p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:outline-none"
                required
              />
            </div>

            <div className="flex justify-end gap-2 text-xs font-bold">
              <button 
                type="button" 
                onClick={() => { setShowEscalateEventModal(false); setEscalatingEvent(null); }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg"
              >
                İptal
              </button>
              <button 
                type="submit" 
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg"
              >
                Esaslı Eskale Et
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Escalate Ticket to Incident Modal */}
      {showEscalateTicketModal && escalatingTicket && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleEscalateTicketSubmit} className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-red-500" />
              Sistem Genel Incident Yükseltmesi
            </h3>
            
            <p className="text-xs text-slate-500">
              Bu destek bileti, birden fazla salonu/müşteriyi etkileyen kritik bir teknik arıza veya güvenlik açığı barındırıyor olabilir. 
              Bunu resmi bir Incident olarak açmak tüm gözlem panellerini uyaracaktır.
            </p>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400">Incident Önem Derecesi</label>
              <select 
                value={escalationIncidentSeverity}
                onChange={e => setEscalationIncidentSeverity(e.target.value as IncidentSeverity)}
                className="w-full p-2 text-xs rounded border dark:bg-slate-900"
              >
                <option value="sev4_minor">Sev4 (Minor Kesinti)</option>
                <option value="sev3_moderate">Sev3 (Moderate / Kısmi Arıza)</option>
                <option value="sev2_major">Sev2 (Major / Geniş Çaplı Etki)</option>
                <option value="sev1_critical">Sev1 (CRITICAL / Tam Hizmet Durması)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400">Incident Başlığı</label>
              <input 
                type="text"
                value={escalationIncidentTitle}
                onChange={e => setEscalationIncidentTitle(e.target.value)}
                className="w-full p-2 text-xs rounded border dark:bg-slate-900"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400">Incident Özet & Kapsam</label>
              <textarea 
                value={escalationIncidentSummary}
                onChange={e => setEscalationIncidentSummary(e.target.value)}
                rows={4}
                className="w-full p-2 text-xs rounded border dark:bg-slate-900"
                required
              />
            </div>

            <div className="flex justify-end gap-2 text-xs font-bold">
              <button 
                type="button" 
                onClick={() => { setShowEscalateTicketModal(false); setEscalatingTicket(null); }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg"
              >
                İptal
              </button>
              <button 
                type="submit" 
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
              >
                Incident Başlat
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Manual Support Ticket Modal */}
      {showNewTicketModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleCreateTicketManually} className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-500" />
                Manuel Destek Talebi Oluştur
              </h3>
              <button type="button" onClick={() => setShowNewTicketModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400">Kategori</label>
                  <select 
                    value={newTicketCategory}
                    onChange={e => setNewTicketCategory(e.target.value as SupportTicketCategory)}
                    className="w-full p-2 rounded border dark:bg-slate-900"
                  >
                    <option value="booking">booking (Rezervasyon)</option>
                    <option value="cancellation_reschedule">cancellation_reschedule (İptal/Erteleme)</option>
                    <option value="payment_billing">payment_billing (Ödeme ve Fatura)</option>
                    <option value="subscription">subscription (SaaS Üyeliği)</option>
                    <option value="domain">domain (Özel Alan Adı)</option>
                    <option value="media">media (Dosya/Medya)</option>
                    <option value="communication">communication (Sms/Eposta İletişim)</option>
                    <option value="bug">bug (Yazılım Hatası)</option>
                    <option value="abuse_spam">abuse_spam (İstismar ve Güvenlik Filtreleri)</option>
                    <option value="other">other (Diğer Talepler)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400">Öncelik Seviyesi</label>
                  <select 
                    value={newTicketPriority}
                    onChange={e => setNewTicketPriority(e.target.value as SupportTicketPriority)}
                    className="w-full p-2 rounded border dark:bg-slate-900"
                  >
                    <option value="low">Düşük</option>
                    <option value="normal">Normal</option>
                    <option value="high">Yüksek</option>
                    <option value="urgent">ACİL (Urgent)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400">Tenant ID (Opsiyonel)</label>
                  <input 
                    type="text" 
                    placeholder="E.g. tenant-123"
                    value={newTicketTenantId}
                    onChange={e => setNewTicketTenantId(e.target.value)}
                    className="w-full p-2 rounded border dark:bg-slate-900"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400">Talep Eden Adı Soyadı</label>
                  <input 
                    type="text" 
                    placeholder="E.g. Ayşe Yılmaz"
                    value={newTicketName}
                    onChange={e => setNewTicketName(e.target.value)}
                    className="w-full p-2 rounded border dark:bg-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400">Telefon</label>
                  <input 
                    type="tel" 
                    placeholder="E.g. 5551234567"
                    value={newTicketPhone}
                    onChange={e => setNewTicketPhone(e.target.value)}
                    className="w-full p-2 rounded border dark:bg-slate-900"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400">Eposta</label>
                  <input 
                    type="email" 
                    placeholder="E.g. user@domain.com"
                    value={newTicketEmail}
                    onChange={e => setNewTicketEmail(e.target.value)}
                    className="w-full p-2 rounded border dark:bg-slate-900"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400">Bilet Başlığı</label>
                <input 
                  type="text" 
                  placeholder="E.g. Webhook uyuşmazlığı hatası"
                  value={newTicketTitle}
                  onChange={e => setNewTicketTitle(e.target.value)}
                  className="w-full p-2 rounded border dark:bg-slate-900"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400">Bilet Açıklaması / Detaylar</label>
                <textarea 
                  placeholder="Müşterinin yaşadığı sorunu tüm teknik detaylarıyla buraya yazın..."
                  value={newTicketDesc}
                  onChange={e => setNewTicketDesc(e.target.value)}
                  rows={4}
                  className="w-full p-2 rounded border dark:bg-slate-900"
                  required
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2 shrink-0 text-xs font-bold">
              <button 
                type="button" 
                onClick={() => setShowNewTicketModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg"
              >
                İptal
              </button>
              <button 
                type="submit" 
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
              >
                Talebi Oluştur
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Resolve / Close Modal */}
      {showResolveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <form 
            onSubmit={showResolveModal.type === 'ticket' ? handleResolveTicket : handleResolveIncident} 
            className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full p-6 space-y-4"
          >
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              {showResolveModal.type === 'ticket' ? 'Destek Talebini Çözümle' : 'Incident Kapat'}
            </h3>
            
            <p className="text-xs text-slate-500">
              Bu vakanın çözüldüğünü onaylıyorsunuz. Lütfen yapılan işlem ve düzeltici eylem hakkında bilgi ekleyin.
            </p>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400">Çözüm Raporu / Postmortem Notu</label>
              <textarea 
                value={resolutionNotes}
                onChange={e => setResolutionNotes(e.target.value)}
                placeholder="Örn: Sorunlu outbox mesajı manuel işlendi, veri uyuşmazlığı giderildi."
                rows={4}
                className="w-full p-2 text-xs rounded border dark:bg-slate-900 text-slate-700 dark:text-slate-300"
                required
              />
            </div>

            <div className="flex justify-end gap-2 text-xs font-bold">
              <button 
                type="button" 
                onClick={() => { setShowResolveModal(null); setResolutionNotes(''); }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg"
              >
                İptal
              </button>
              <button 
                type="submit" 
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg"
              >
                Çözümlendi Olarak Kapat
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default SuperAdminObservabilityPage;
