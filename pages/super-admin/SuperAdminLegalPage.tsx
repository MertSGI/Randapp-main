import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { legalDocumentService } from '../../services/legalDocumentService';
import { policyAcceptanceService } from '../../services/policyAcceptanceService';
import { consentLedgerService, ConsentLedgerRecord } from '../../services/consentLedgerService';
import { dataRightsRequestService } from '../../services/dataRightsRequestService';
import { 
  LegalDocumentVersion, 
  LegalDocumentType, 
  LegalDocumentStatus, 
  PolicyAcceptanceRecord, 
  DataRightsRequest, 
  DataRightsRequestType, 
  DataRightsRequestStatus 
} from '../../types';
import { 
  Scale, 
  ShieldAlert, 
  FileText, 
  History, 
  Lock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Plus, 
  Check, 
  RefreshCw, 
  Download, 
  Search, 
  Trash2, 
  HelpCircle,
  Eye,
  FileCheck
} from 'lucide-react';

const SuperAdminLegalPage: React.FC = () => {
  const { language } = useLanguage();
  
  // Tab State
  const [activeTab, setActiveTab] = useState<'documents' | 'acceptances' | 'ledger' | 'requests'>('documents');

  // Stats / Summaries
  const [legalSummary, setLegalSummary] = useState<any>(null);
  const [acceptanceSummary, setAcceptanceSummary] = useState<any>(null);
  const [ledgerSummary, setLedgerSummary] = useState<any>(null);
  const [rightsSummary, setRightsSummary] = useState<any>(null);

  // Data Lists
  const [documents, setDocuments] = useState<LegalDocumentVersion[]>([]);
  const [acceptances, setAcceptances] = useState<PolicyAcceptanceRecord[]>([]);
  const [ledgerRecords, setLedgerRecords] = useState<ConsentLedgerRecord[]>([]);
  const [rightsRequests, setRightsRequests] = useState<DataRightsRequest[]>([]);

  // Filter States
  const [docTypeFilter, setDocTypeFilter] = useState<string>('');
  const [docStatusFilter, setDocStatusFilter] = useState<string>('');
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<string>('');
  const [rightsTypeFilter, setRightsTypeFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals / Form States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState<any>(null); // { type: 'document' | 'acceptance' | 'ledger' | 'request', item: any }
  
  // Create Form State
  const [newType, setNewType] = useState<LegalDocumentType>('terms_of_service');
  const [newVersion, setNewVersion] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newSummary, setNewSummary] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newRequiresAcceptance, setNewRequiresAcceptance] = useState(true);

  // Toast / Status Message
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadData = () => {
    // Summaries
    setLegalSummary(legalDocumentService.getLegalReadinessSummary());
    setAcceptanceSummary(policyAcceptanceService.getPolicyAcceptanceReadinessSummary());
    setLedgerSummary(consentLedgerService.getConsentLedgerSummary());
    setRightsSummary(dataRightsRequestService.getDataRightsReadinessSummary());

    // Lists
    setDocuments(legalDocumentService.listLegalDocumentVersions({
      type: docTypeFilter ? docTypeFilter as any : undefined,
      status: docStatusFilter ? docStatusFilter as any : undefined
    }));
    setAcceptances(policyAcceptanceService.listPolicyAcceptances());
    setLedgerRecords(consentLedgerService.listConsentLedger({
      consentType: ledgerTypeFilter ? ledgerTypeFilter : undefined
    }));
    setRightsRequests(dataRightsRequestService.listDataRightsRequests({
      type: rightsTypeFilter ? rightsTypeFilter as any : undefined
    }));
  };

  useEffect(() => {
    loadData();
  }, [docTypeFilter, docStatusFilter, ledgerTypeFilter, rightsTypeFilter]);

  // Actions
  const handleCreateDocument = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVersion || !newTitle || !newContent) {
      alert('Lütfen sürüm, başlık ve içerik alanlarını doldurunuz.');
      return;
    }

    legalDocumentService.createLegalDocumentVersion({
      type: newType,
      version: newVersion,
      locale: 'tr',
      title: newTitle,
      summary: newSummary,
      content: newContent,
      requiresAcceptance: newRequiresAcceptance
    });

    triggerToast('Yeni döküman taslağı başarıyla oluşturuldu.');
    setShowCreateModal(false);
    
    // Clear inputs
    setNewVersion('');
    setNewTitle('');
    setNewSummary('');
    setNewContent('');
    
    loadData();
  };

  const handleArchiveDocument = (id: string) => {
    if (confirm('Bu döküman versiyonunu arşivlemek istediğinize emin misiniz?')) {
      legalDocumentService.archiveLegalDocumentVersion(id);
      triggerToast('Döküman başarıyla arşivlendi.');
      loadData();
    }
  };

  const handleMarkReviewRequired = (id: string) => {
    legalDocumentService.markLegalDocumentReviewRequired(id);
    triggerToast('Döküman hukuk danışmanı incelemesi gerektiriyor olarak işaretlendi.');
    loadData();
  };

  const handlePublishDocument = (id: string) => {
    const reviewer = prompt(
      'LARI PRE-LIVE İNCELEME NOTU:\nBu işlem resmi bir avukat dijital imzası değildir ve dökümanın hukuki uyumluluğunu taahhüt etmez. Sadece yerel pre-live hazırlık ve taslak takibi içindir.\n\nLütfen yerel gözden geçirme yapan kişinin adını/unvanını giriniz:',
      'Hukuk Danışmanı İncelemesi Bekliyor'
    );
    if (reviewer !== null) {
      const reviewNote = prompt(
        'Lütfen varsa yerel inceleme notunu ekleyiniz (Canlı kullanım öncesi profesyonel hukuk incelemesi gerekir):',
        'Taslak metin pre-live hazırlık aşamasındadır.'
      );
      legalDocumentService.publishLegalDocumentVersion(id, reviewer, reviewNote || undefined);
      triggerToast('Döküman pre-live hazırlık olarak yayına alındı.');
      loadData();
    }
  };

  const handleRevokeAcceptance = (id: string) => {
    const reason = prompt('Geri çekme / iptal gerekçesini yazınız:', 'Kullanıcı talebi doğrultusunda');
    if (reason !== null) {
      policyAcceptanceService.revokePolicyAcceptance(id, reason);
      triggerToast('Kabul kaydı başarıyla iptal edildi.');
      loadData();
    }
  };

  const handleWithdrawConsent = (actorId: string, type: string) => {
    if (confirm(`Bu kullanıcının '${type}' rızasını geri çekmek istediğinize emin misiniz?`)) {
      consentLedgerService.withdrawConsent(actorId, type, 'Yönetici Panelinden Manuel Geri Çekme');
      triggerToast('Rıza başarıyla geri çekildi.');
      loadData();
    }
  };

  const handleUpdateRequestStatus = (id: string, status: DataRightsRequestStatus) => {
    const notes = prompt('Talep işlem notlarını giriniz (KVKK Defterine işlenecektir):', 'Talep doğrulanarak el ile işlendi.');
    if (notes !== null) {
      dataRightsRequestService.updateDataRightsRequestStatus(id, status, notes);
      triggerToast(`Veri hakkı talebi '${status}' olarak güncellendi.`);
      loadData();
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 bg-slate-900 border border-emerald-500/30 text-emerald-400 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 z-50 animate-bounce">
          <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-sm font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Warning Alert & Header */}
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-8 h-8 text-amber-500 shrink-0 mt-0.5 animate-pulse" />
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Scale className="w-5 h-5" /> Hukuk & Mevzuat Uyumluluk (LARİ Pre-live Hazırlık Paneli)
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-2xl leading-relaxed">
              <strong>ÖNEMLİ PRE-LIVE UYARISI:</strong> Bu panel, pilot salon öncesi hukuk danışmanının dökümanları gözden geçirebilmesi ve rıza loglarını simüle edebilmesi için hazırlanmıştır. Metinler taslaktır ve avukat onayı almadan canlı kullanıma açılmamalıdır. Canlı kullanım öncesi profesyonel hukuk incelemesi gerekir.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button 
            onClick={() => loadData()}
            className="p-2.5 rounded-xl border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-600 dark:text-slate-300 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button 
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-accent hover:bg-accent/90 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-md transition-colors"
          >
            <Plus className="w-4 h-4" /> Yeni Taslak
          </button>
        </div>
      </div>

      {/* Core Stats Bento */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-gray-100 dark:border-slate-700/50 shadow-sm">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">Yasal Dökümanlar</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold text-gray-900 dark:text-white">{legalSummary?.totalCount || 0}</span>
            <span className="text-xs text-amber-500 font-medium">{legalSummary?.byStatus?.draft || 0} Taslak</span>
          </div>
          <span className="text-[10px] text-gray-400 mt-2 block">12 Kritik Şablon Tanımlı</span>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-gray-100 dark:border-slate-700/50 shadow-sm">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">Politika Kabulleri</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold text-gray-900 dark:text-white">{acceptanceSummary?.totalAcceptancesRecorded || 0}</span>
            <span className="text-xs text-blue-500 font-medium">{acceptanceSummary?.tenantOwnersCount || 0} Salon Sahibi</span>
          </div>
          <span className="text-[10px] text-gray-400 mt-2 block">Sürüm Bazlı Onay Takibi</span>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-gray-100 dark:border-slate-700/50 shadow-sm">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">Değiştirilemez Rıza Defteri (Ledger)</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold text-gray-900 dark:text-white">{ledgerSummary?.totalRecords || 0}</span>
            <span className="text-xs text-emerald-500 font-medium">{ledgerSummary?.grantedCount || 0} İzin</span>
          </div>
          <span className="text-[10px] text-gray-400 mt-2 block">Değiştirilemez Log Formatı</span>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-gray-100 dark:border-slate-700/50 shadow-sm">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">Veri Sahibi Talepleri</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold text-red-500 dark:text-red-400">{rightsSummary?.totalRequests || 0}</span>
            <span className="text-xs text-red-500 font-medium">{rightsSummary?.submitted || 0} Açık</span>
          </div>
          <span className="text-[10px] text-gray-400 mt-2 block">Manuel Değerlendirme Aktif</span>
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="border-b border-gray-200 dark:border-slate-700 flex gap-6">
        <button
          onClick={() => setActiveTab('documents')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${activeTab === 'documents' ? 'border-accent text-accent' : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}
        >
          <FileText className="w-4 h-4" /> Versiyonlu Politikalar ({documents.length})
        </button>
        <button
          onClick={() => setActiveTab('acceptances')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${activeTab === 'acceptances' ? 'border-accent text-accent' : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}
        >
          <History className="w-4 h-4" /> Kabul Kayıtları ({acceptances.length})
        </button>
        <button
          onClick={() => setActiveTab('ledger')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${activeTab === 'ledger' ? 'border-accent text-accent' : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}
        >
          <Lock className="w-4 h-4" /> Rıza Log Defteri ({ledgerRecords.length})
        </button>
        <button
          onClick={() => setActiveTab('requests')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${activeTab === 'requests' ? 'border-accent text-accent' : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}
        >
          <ShieldAlert className="w-4 h-4" /> Veri Hakları (KVKK) ({rightsRequests.length})
        </button>
      </div>

      {/* Workspace Area */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700/50 shadow-sm overflow-hidden">
        {/* TAB 1: DOCUMENTS */}
        {activeTab === 'documents' && (
          <div className="p-6 space-y-4">
            <div className="flex flex-wrap gap-3 items-center justify-between">
              <span className="text-sm font-bold text-gray-900 dark:text-white">Hukuki Metin ve Politikalar Sürüm Geçmişi</span>
              <div className="flex gap-2">
                <select 
                  className="rounded-xl border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 text-xs p-2 focus:border-accent focus:ring-accent"
                  value={docTypeFilter}
                  onChange={(e) => setDocTypeFilter(e.target.value)}
                >
                  <option value="">Tüm Tipler</option>
                  <option value="terms_of_service">Kullanım Koşulları (TOS)</option>
                  <option value="privacy_policy">Gizlilik Politikası</option>
                  <option value="kvkk_clarification_text">KVKK Aydınlatma Metni</option>
                  <option value="cookie_policy">Çerez Politikası</option>
                  <option value="booking_terms">Rezervasyon Koşulları</option>
                  <option value="cancellation_policy">İptal Politikası</option>
                  <option value="communication_consent_text">İletişim İzni</option>
                  <option value="marketing_consent_text">Pazarlama İzni</option>
                  <option value="media_consent_text">Medya Paylaşım İzni</option>
                </select>
                <select 
                  className="rounded-xl border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 text-xs p-2 focus:border-accent focus:ring-accent"
                  value={docStatusFilter}
                  onChange={(e) => setDocStatusFilter(e.target.value)}
                >
                  <option value="">Tüm Durumlar</option>
                  <option value="draft">Taslak</option>
                  <option value="review_required">İnceleme Bekliyor</option>
                  <option value="active">Yayında (Aktif)</option>
                  <option value="archived">Arşivlendi</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/40 text-gray-500 uppercase tracking-wider font-semibold">
                    <th className="p-3">Belge Tipi / Başlık</th>
                    <th className="p-3">Sürüm</th>
                    <th className="p-3">Durum</th>
                    <th className="p-3">Zorunlu Onay</th>
                    <th className="p-3">Hukuk Onayı / İnceleyen</th>
                    <th className="p-3">Son Güncelleme</th>
                    <th className="p-3 text-right">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {documents.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-gray-400">Belirtilen kriterlerde döküman bulunamadı.</td>
                    </tr>
                  ) : (
                    documents.map((doc) => (
                      <tr key={doc.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-800/30">
                        <td className="p-3">
                          <div className="font-bold text-gray-900 dark:text-white">{doc.title}</div>
                          <div className="text-gray-400 mt-0.5 text-[10px]">{doc.type}</div>
                        </td>
                        <td className="p-3 font-mono">{doc.version}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full font-semibold text-[10px] uppercase ${
                            doc.status === 'active' ? 'bg-emerald-100 text-emerald-800' :
                            doc.status === 'draft' ? 'bg-gray-100 text-gray-800' :
                            doc.status === 'review_required' ? 'bg-amber-100 text-amber-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {doc.status}
                          </span>
                        </td>
                        <td className="p-3 font-medium">{doc.requiresAcceptance ? 'Evet (Checkbox)' : 'Hayır'}</td>
                        <td className="p-3 text-gray-600 dark:text-gray-300">
                          {doc.reviewedBy ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium text-xs">
                                <FileCheck className="w-3.5 h-3.5 shrink-0 text-emerald-500" /> {doc.reviewedBy}
                              </span>
                              {doc.reviewNote && (
                                <span className="text-[10px] text-gray-400 italic block leading-tight">Gözden Geçirme Notu: {doc.reviewNote}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400 italic text-xs block leading-tight">Hukuki inceleme bekliyor<br/><span className="text-[9px] text-amber-500 font-semibold">(Pre-live hazırlık)</span></span>
                          )}
                        </td>
                        <td className="p-3 text-gray-400">{doc.updatedAt.slice(0, 10)}</td>
                        <td className="p-3 text-right space-x-1 whitespace-nowrap">
                          <button 
                            onClick={() => setShowDetailModal({ type: 'document', item: doc })}
                            className="p-1 text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
                            title="Detay Görüntüle"
                          >
                            <Eye className="w-4 h-4 inline" />
                          </button>
                          {doc.status === 'draft' && (
                            <button 
                              onClick={() => handleMarkReviewRequired(doc.id)}
                              className="p-1 text-amber-600 hover:text-amber-800 font-semibold text-[10px]"
                            >
                              İncelemeye Gönder
                            </button>
                          )}
                          {doc.status === 'review_required' && (
                            <button 
                              onClick={() => handlePublishDocument(doc.id)}
                              className="p-1 text-emerald-600 hover:text-emerald-800 font-semibold text-[10px]"
                            >
                              Onayla & Yayınla
                            </button>
                          )}
                          {doc.status !== 'archived' && (
                            <button 
                              onClick={() => handleArchiveDocument(doc.id)}
                              className="p-1 text-red-500 hover:text-red-700"
                              title="Arşivle"
                            >
                              <Trash2 className="w-4 h-4 inline" />
                            </button>
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

        {/* TAB 2: ACCEPTANCES */}
        {activeTab === 'acceptances' && (
          <div className="p-6 space-y-4">
            <span className="text-sm font-bold text-gray-900 dark:text-white block">Versiyon Bazlı Politika Kabul Arşivi</span>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/40 text-gray-500 uppercase tracking-wider font-semibold">
                    <th className="p-3">Kabul Eden (Aktör)</th>
                    <th className="p-3">Belge Tipi</th>
                    <th className="p-3">Kabul Sürümü</th>
                    <th className="p-3">Kabul Zamanı</th>
                    <th className="p-3">Kaynak</th>
                    <th className="p-3">IP / Tarayıcı</th>
                    <th className="p-3 text-right">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {acceptances.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-gray-400">Henüz kayıtlı bir politika kabul verisi bulunmamaktadır.</td>
                    </tr>
                  ) : (
                    acceptances.map((acpt) => (
                      <tr key={acpt.id} className={`hover:bg-gray-50/50 dark:hover:bg-slate-800/30 ${acpt.revokedAt ? 'opacity-50 line-through bg-red-50/10' : ''}`}>
                        <td className="p-3">
                          <div className="font-bold text-gray-900 dark:text-white">{acpt.actorDisplayName || 'Misafir Kullanıcı'}</div>
                          <div className="text-gray-400 mt-0.5 text-[10px]">{acpt.actorType.toUpperCase()} {acpt.actorContact && `• ${acpt.actorContact}`}</div>
                        </td>
                        <td className="p-3 font-mono">{acpt.documentType}</td>
                        <td className="p-3 font-mono text-gray-600 dark:text-gray-400">{acpt.documentVersion}</td>
                        <td className="p-3 text-gray-400">{acpt.acceptedAt.replace('T', ' ').slice(0, 16)}</td>
                        <td className="p-3 uppercase font-medium">{acpt.acceptanceSource}</td>
                        <td className="p-3 text-gray-400 text-[10px] truncate max-w-[150px]" title={acpt.userAgent}>{acpt.ipAddress}</td>
                        <td className="p-3 text-right">
                          <button 
                            onClick={() => setShowDetailModal({ type: 'acceptance', item: acpt })}
                            className="p-1 text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
                            title="Görüntüle"
                          >
                            <Eye className="w-4 h-4 inline" />
                          </button>
                          {!acpt.revokedAt && (
                            <button 
                              onClick={() => handleRevokeAcceptance(acpt.id)}
                              className="text-xs text-red-500 hover:text-red-700 ml-2 font-semibold"
                            >
                              Geri Çek
                            </button>
                          )}
                          {acpt.revokedAt && (
                            <span className="text-red-500 text-[10px] ml-2 font-bold uppercase">Geri Çekildi</span>
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

        {/* TAB 3: LEDGER */}
        {activeTab === 'ledger' && (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-gray-900 dark:text-white">Değiştirilemez Rıza Günlüğü (Consent Ledger)</span>
              <select 
                className="rounded-xl border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 text-xs p-2 focus:border-accent focus:ring-accent"
                value={ledgerTypeFilter}
                onChange={(e) => setLedgerTypeFilter(e.target.value)}
              >
                <option value="">Tüm Rıza Tipleri</option>
                <option value="booking_transactional">İşlemsel İletişim</option>
                <option value="marketing">Kampanya & Pazarlama</option>
                <option value="referral_campaign">Referans Programı</option>
                <option value="media_staff_photo">Uzman Fotoğraf Paylaşımı</option>
                <option value="cookie_analytics">Çerez/Analitik</option>
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/40 text-gray-500 uppercase tracking-wider font-semibold">
                    <th className="p-3">Rıza Tipi</th>
                    <th className="p-3">Durum</th>
                    <th className="p-3">Aktör / Kimlik</th>
                    <th className="p-3">İletişim Bilgisi</th>
                    <th className="p-3">Kaynak</th>
                    <th className="p-3">Belge / Sürüm</th>
                    <th className="p-3 font-semibold">Tarih</th>
                    <th className="p-3 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {ledgerRecords.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-gray-400">Henüz rıza defterinde kayıt bulunmamaktadır.</td>
                    </tr>
                  ) : (
                    ledgerRecords.map((rec) => (
                      <tr key={rec.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-800/30">
                        <td className="p-3 font-bold text-gray-900 dark:text-white">{rec.consentType}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full font-semibold text-[10px] uppercase ${
                            rec.status === 'granted' ? 'bg-emerald-100 text-emerald-800' :
                            rec.status === 'denied' ? 'bg-red-100 text-red-800' :
                            'bg-amber-100 text-amber-800'
                          }`}>
                            {rec.status}
                          </span>
                        </td>
                        <td className="p-3">{rec.actorId} <span className="text-[10px] text-gray-400">({rec.actorType})</span></td>
                        <td className="p-3 text-gray-500">{rec.contact || <span className="text-gray-400 italic">Redakte Edildi</span>}</td>
                        <td className="p-3 uppercase font-semibold text-gray-400">{rec.source}</td>
                        <td className="p-3 text-gray-400">
                          {rec.legalDocumentType ? `${rec.legalDocumentType} (v${rec.legalDocumentVersion})` : <span className="text-gray-400">Doğrudan Tıklama</span>}
                        </td>
                        <td className="p-3 text-gray-400">{rec.capturedAt.replace('T', ' ').slice(0, 16)}</td>
                        <td className="p-3 text-right">
                          {rec.status === 'granted' ? (
                            <button 
                              onClick={() => handleWithdrawConsent(rec.actorId!, rec.consentType)}
                              className="text-xs text-red-500 hover:text-red-700 font-semibold"
                            >
                              Geri Çek
                            </button>
                          ) : (
                            <span className="text-gray-400 italic">-</span>
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

        {/* TAB 4: REQUESTS */}
        {activeTab === 'requests' && (
          <div className="p-6 space-y-4">
            <span className="text-sm font-bold text-gray-900 dark:text-white block">KVKK Veri Sahibi Başvuruları (Kişisel Veri Sahibi Hak Talepleri)</span>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/40 text-gray-500 uppercase tracking-wider font-semibold">
                    <th className="p-3">Başvuru Sahibi</th>
                    <th className="p-3">Talep Türü</th>
                    <th className="p-3">Açıklama / Detaylar</th>
                    <th className="p-3">Durum</th>
                    <th className="p-3">Kayıt Tarihi</th>
                    <th className="p-3">Bağlantılı Destek Talebi</th>
                    <th className="p-3 text-right">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {rightsRequests.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-gray-400">Henüz kayıtlı KVKK hakkı talebi bulunmamaktadır.</td>
                    </tr>
                  ) : (
                    rightsRequests.map((req) => (
                      <tr key={req.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-800/30">
                        <td className="p-3">
                          <div className="font-bold text-gray-900 dark:text-white">{req.requesterName}</div>
                          <div className="text-gray-400 mt-0.5 text-[10px] uppercase">{req.requesterType} {req.requesterContact && `• ${req.requesterContact}`}</div>
                        </td>
                        <td className="p-3 uppercase font-bold text-blue-600 dark:text-blue-400">{req.type}</td>
                        <td className="p-3 text-gray-600 dark:text-gray-300 max-w-[200px] truncate" title={req.description}>{req.description}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full font-semibold text-[10px] uppercase ${
                            req.status === 'completed' ? 'bg-emerald-100 text-emerald-800' :
                            req.status === 'submitted' ? 'bg-blue-100 text-blue-800' :
                            req.status === 'in_review' ? 'bg-amber-100 text-amber-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {req.status}
                          </span>
                        </td>
                        <td className="p-3 text-gray-400">{req.createdAt.replace('T', ' ').slice(0, 16)}</td>
                        <td className="p-3 text-gray-400">
                          {req.metadata?.linkedSupportTicketId ? (
                            <span className="font-mono text-accent">#{req.metadata.linkedSupportTicketId}</span>
                          ) : (
                            <span className="italic">Destek Yok</span>
                          )}
                        </td>
                        <td className="p-3 text-right space-x-1 whitespace-nowrap">
                          {req.status === 'submitted' && (
                            <button 
                              onClick={() => handleUpdateRequestStatus(req.id, 'in_review')}
                              className="text-xs text-amber-600 hover:text-amber-800 font-semibold"
                            >
                              İncele
                            </button>
                          )}
                          {req.status === 'in_review' && (
                            <button 
                              onClick={() => handleUpdateRequestStatus(req.id, 'completed')}
                              className="text-xs text-emerald-600 hover:text-emerald-800 font-semibold"
                            >
                              Tamamla
                            </button>
                          )}
                          {(req.status === 'submitted' || req.status === 'in_review') && (
                            <button 
                              onClick={() => handleUpdateRequestStatus(req.id, 'rejected')}
                              className="text-xs text-red-500 hover:text-red-700 font-semibold ml-1"
                            >
                              Reddet
                            </button>
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
      </div>

      {/* CREATE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-3xl border border-gray-100 dark:border-slate-700 max-w-lg w-full p-6 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-slate-700">
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-accent" /> Yeni Hukuki Metin / Sürüm Taslağı
              </h3>
              <button 
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDocument} className="space-y-4 py-4 overflow-y-auto pr-1">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Doküman Türü</label>
                <select 
                  className="w-full rounded-xl border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 text-xs p-3 focus:border-accent focus:ring-accent text-gray-900 dark:text-white"
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as any)}
                >
                  <option value="terms_of_service">Kullanım Koşulları (Terms of Service)</option>
                  <option value="privacy_policy">Gizlilik Politikası</option>
                  <option value="kvkk_clarification_text">KVKK Aydınlatma Metni</option>
                  <option value="cookie_policy">Çerez Politikası</option>
                  <option value="booking_terms">Rezervasyon Koşulları</option>
                  <option value="cancellation_policy">İptal Politikası</option>
                  <option value="communication_consent_text">İletişim İzni</option>
                  <option value="marketing_consent_text">Pazarlama İzni</option>
                  <option value="media_consent_text">Medya Paylaşım İzni</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Versiyon Kodu</label>
                  <input 
                    type="text" 
                    required 
                    placeholder="örn: 1.1-TASLAK"
                    className="w-full rounded-xl border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 text-xs p-3 focus:border-accent"
                    value={newVersion}
                    onChange={(e) => setNewVersion(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Zorunlu Checkbox</label>
                  <select 
                    className="w-full rounded-xl border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 text-xs p-3"
                    value={newRequiresAcceptance ? 'true' : 'false'}
                    onChange={(e) => setNewRequiresAcceptance(e.target.value === 'true')}
                  >
                    <option value="true">Evet (Zorunlu)</option>
                    <option value="false">Hayır (Opsiyonel / Bilgilendirme)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Başlık</label>
                <input 
                  type="text" 
                  required 
                  placeholder="örn: LARİ Salon Hizmet Şartları"
                  className="w-full rounded-xl border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 text-xs p-3 focus:border-accent"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Özet / Açıklama</label>
                <input 
                  type="text" 
                  placeholder="örn: Yeni eklenen multi-branch özellikleri ek anlaşması taslağı."
                  className="w-full rounded-xl border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 text-xs p-3 focus:border-accent"
                  value={newSummary}
                  onChange={(e) => setNewSummary(e.target.value)}
                />
              </div>

              <div className="flex-grow">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Döküman İçeriği (Markdown/Text)</label>
                <textarea 
                  required 
                  rows={6}
                  placeholder="İçerik buraya yazılmalıdır..."
                  className="w-full rounded-xl border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 text-xs p-3 focus:border-accent font-mono"
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button 
                  type="button" 
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-100 rounded-xl"
                >
                  Vazgeç
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 text-xs font-semibold bg-accent text-white rounded-xl shadow"
                >
                  Taslak Olarak Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAIL VIEW MODAL */}
      {showDetailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-3xl border border-gray-100 dark:border-slate-700 max-w-2xl w-full p-6 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-slate-700">
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-accent" /> Detaylı Belge Görüntüleyici
              </h3>
              <button 
                onClick={() => setShowDetailModal(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 overflow-y-auto flex-grow space-y-4">
              <div>
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block">Başlık</span>
                <span className="text-sm font-bold text-gray-900 dark:text-white">{showDetailModal.item.title || showDetailModal.item.documentType}</span>
              </div>

              {showDetailModal.item.summary && (
                <div>
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block">Özet</span>
                  <p className="text-xs text-gray-500 leading-relaxed">{showDetailModal.item.summary}</p>
                </div>
              )}

              {showDetailModal.item.content && (
                <div>
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block">Metin İçeriği</span>
                  <div className="bg-gray-50 dark:bg-slate-900 p-4 rounded-xl border border-gray-100 dark:border-slate-700/50 text-xs font-mono whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto">
                    {showDetailModal.item.content}
                  </div>
                </div>
              )}

              {showDetailModal.item.consentSnapshot && (
                <div>
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block">Onay Anındaki Metin Özeti (Snapshot)</span>
                  <div className="bg-gray-50 dark:bg-slate-900 p-4 rounded-xl border border-gray-100 dark:border-slate-700/50 text-xs font-mono whitespace-pre-wrap leading-relaxed">
                    {showDetailModal.item.consentSnapshot}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 border-t border-gray-100 dark:border-slate-700 pt-4 text-xs">
                <div>
                  <span className="text-[10px] text-gray-400 uppercase tracking-wider block">Versiyon</span>
                  <span className="font-mono">{showDetailModal.item.version || showDetailModal.item.documentVersion}</span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 uppercase tracking-wider block">Oluşturma/Kabul Tarihi</span>
                  <span>{(showDetailModal.item.createdAt || showDetailModal.item.acceptedAt || '').replace('T', ' ').slice(0, 19)}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-gray-100 dark:border-slate-700">
              <button 
                onClick={() => setShowDetailModal(null)}
                className="bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-800 dark:text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminLegalPage;
