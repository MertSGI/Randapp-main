import { LegalDocumentVersion, LegalDocumentType, LegalDocumentStatus } from '../types';
import { auditLogService } from './auditLogService';

const LEGAL_STORAGE_KEY = 'lari_legal_documents_v1';

export interface CreateLegalDocumentInput {
  type: LegalDocumentType;
  version: string;
  locale: string;
  title: string;
  summary: string;
  content: string;
  requiresAcceptance: boolean;
  metadata?: any;
}

export const legalDocumentService = {
  /**
   * Lists all legal document versions matching the optional filters.
   */
  listLegalDocumentVersions(filters?: {
    type?: LegalDocumentType;
    status?: LegalDocumentStatus;
    locale?: string;
  }): LegalDocumentVersion[] {
    const docs = this._getDocumentsFromStore();
    let filtered = [...docs];

    if (filters) {
      if (filters.type) {
        filtered = filtered.filter(d => d.type === filters.type);
      }
      if (filters.status) {
        filtered = filtered.filter(d => d.status === filters.status);
      }
      if (filters.locale) {
        filtered = filtered.filter(d => d.locale === filters.locale);
      }
    }

    return filtered;
  },

  /**
   * Retrieves the current active document version for a specific type and locale.
   */
  getActiveLegalDocument(type: LegalDocumentType, locale: string = 'tr'): LegalDocumentVersion | null {
    const versions = this.listLegalDocumentVersions({ type, status: 'active', locale });
    if (versions.length === 0) {
      // Fallback: If no active version exists, find the latest draft/review version as pre-live fallback
      const allLocaleVersions = this.listLegalDocumentVersions({ type, locale });
      if (allLocaleVersions.length > 0) {
        // Sort by version descending or date
        return allLocaleVersions.sort((a, b) => b.version.localeCompare(a.version))[0];
      }
      return null;
    }
    // Return latest active version (by version sorting)
    return versions.sort((a, b) => b.version.localeCompare(a.version))[0];
  },

  /**
   * Creates a new legal document version draft.
   */
  createLegalDocumentVersion(input: CreateLegalDocumentInput): LegalDocumentVersion {
    const docs = this._getDocumentsFromStore();
    const id = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const newDoc: LegalDocumentVersion = {
      id,
      type: input.type,
      version: input.version,
      status: 'draft',
      locale: input.locale,
      title: input.title,
      summary: input.summary,
      content: input.content,
      requiresAcceptance: input.requiresAcceptance,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: input.metadata || {}
    };

    docs.push(newDoc);
    this._saveDocumentsToStore(docs);

    auditLogService.logAuditEvent({
      category: 'security',
      actorType: 'system',
      action: 'legal_document_draft_created',
      severity: 'notice',
      summary: `Hukuki döküman taslağı oluşturuldu: ${newDoc.title} (v${newDoc.version})`,
      safeDetails: { documentId: id, type: input.type, version: input.version }
    });

    return newDoc;
  },

  /**
   * Archives a specific legal document version.
   */
  archiveLegalDocumentVersion(id: string): LegalDocumentVersion | null {
    const docs = this._getDocumentsFromStore();
    const doc = docs.find(d => d.id === id);
    if (doc) {
      doc.status = 'archived';
      doc.archivedAt = new Date().toISOString();
      doc.updatedAt = new Date().toISOString();
      this._saveDocumentsToStore(docs);

      auditLogService.logAuditEvent({
        category: 'security',
        actorType: 'system',
        action: 'legal_document_archived',
        severity: 'warning',
        summary: `Hukuki döküman arşivlendi: ${doc.title} (v${doc.version})`,
        safeDetails: { documentId: id, type: doc.type }
      });
      return doc;
    }
    return null;
  },

  /**
   * Marks a document version as review required (ready for legal counsel review).
   */
  markLegalDocumentReviewRequired(id: string): LegalDocumentVersion | null {
    const docs = this._getDocumentsFromStore();
    const doc = docs.find(d => d.id === id);
    if (doc) {
      doc.status = 'review_required';
      doc.updatedAt = new Date().toISOString();
      this._saveDocumentsToStore(docs);

      auditLogService.logAuditEvent({
        category: 'security',
        actorType: 'system',
        action: 'legal_document_review_required',
        severity: 'info',
        summary: `Hukuki döküman hukuk danışmanı incelemesine gönderildi: ${doc.title} (v${doc.version})`,
        safeDetails: { documentId: id, type: doc.type }
      });
      return doc;
    }
    return null;
  },

  /**
   * Publishes a document version, transitioning it to active. It archives previous active versions of the same type and locale.
   */
  publishLegalDocumentVersion(id: string, reviewedBy?: string, reviewNote?: string): LegalDocumentVersion | null {
    const docs = this._getDocumentsFromStore();
    const docIndex = docs.findIndex(d => d.id === id);
    if (docIndex !== -1) {
      const doc = docs[docIndex];
      
      // Archive other active versions of the same type and locale
      docs.forEach(d => {
        if (d.type === doc.type && d.locale === doc.locale && d.status === 'active' && d.id !== id) {
          d.status = 'archived';
          d.archivedAt = new Date().toISOString();
          d.updatedAt = new Date().toISOString();
        }
      });

      doc.status = 'active';
      doc.effectiveAt = new Date().toISOString();
      doc.updatedAt = new Date().toISOString();
      doc.reviewedAt = new Date().toISOString();
      if (reviewedBy) {
        doc.reviewedBy = reviewedBy;
      }
      if (reviewNote) {
        doc.reviewNote = reviewNote;
      }
      doc.legalReviewStatus = 'reviewed';
      doc.externalLegalReviewRequired = true; // Every pre-live document requires actual external professional review before live
      doc.complianceFinalized = false; // Always false in pre-live simulation
      doc.legalApprovalClaim = "Taslak Gözden Geçirme - Canlı kullanım öncesi profesyonel hukuk incelemesi gerekir.";
      
      this._saveDocumentsToStore(docs);

      auditLogService.logAuditEvent({
        category: 'security',
        actorType: 'system',
        action: 'legal_document_published',
        severity: 'notice',
        summary: `Hukuki döküman yayına alındı (Aktif): ${doc.title} (v${doc.version})`,
        safeDetails: { documentId: id, type: doc.type, version: doc.version, reviewedBy }
      });
      return doc;
    }
    return null;
  },

  /**
   * Returns a legal document audit readiness summary.
   */
  getLegalReadinessSummary() {
    const docs = this._getDocumentsFromStore();
    const totalCount = docs.length;
    const draftCount = docs.filter(d => d.status === 'draft').length;
    const reviewCount = docs.filter(d => d.status === 'review_required').length;
    const activeCount = docs.filter(d => d.status === 'active').length;
    const archivedCount = docs.filter(d => d.status === 'archived').length;

    // Expected required documents
    const expectedTypes: LegalDocumentType[] = [
      'terms_of_service',
      'privacy_policy',
      'kvkk_clarification_text',
      'cookie_policy',
      'data_processing_terms',
      'acceptable_use_policy',
      'subscription_terms',
      'booking_terms',
      'cancellation_policy',
      'communication_consent_text',
      'marketing_consent_text',
      'media_consent_text'
    ];

    const presentTypes = new Set(docs.map(d => d.type));
    const missingTypes = expectedTypes.filter(t => !presentTypes.has(t));

    return {
      totalCount,
      byStatus: {
        draft: draftCount,
        review_required: reviewCount,
        active: activeCount,
        archived: archivedCount
      },
      hasActiveTerms: docs.some(d => d.type === 'terms_of_service' && d.status === 'active'),
      hasActivePrivacy: docs.some(d => d.type === 'privacy_policy' && d.status === 'active'),
      hasActiveKVKK: docs.some(d => d.type === 'kvkk_clarification_text' && d.status === 'active'),
      allRequiredCategoriesDrafted: missingTypes.length === 0,
      missingCategories: missingTypes,
      lawyerReviewApproved: docs.every(d => d.status === 'active' ? !!d.reviewedBy : true) && activeCount > 0,
      legalReviewStatus: docs.every(d => d.status === 'active' ? d.legalReviewStatus === 'reviewed' : true) ? 'reviewed' : 'pending_review',
      externalLegalReviewRequired: true,
      complianceFinalized: false, // Always false in pre-live preview to avoid false compliance claims
      legalApprovalClaim: "Pre-live draft readiness check only - No formal legal compliance is certified",
      localMode: true
    };
  },

  // --- QA Verification Script Contract Aliases ---
  createDraftDocument(input: CreateLegalDocumentInput): LegalDocumentVersion {
    return this.createLegalDocumentVersion(input);
  },

  submitForReview(id: string): LegalDocumentVersion | null {
    return this.markLegalDocumentReviewRequired(id);
  },

  publishDocumentVersion(id: string, reviewedBy?: string, reviewNote?: string): LegalDocumentVersion | null {
    return this.publishLegalDocumentVersion(id, reviewedBy, reviewNote);
  },

  archiveDocumentVersion(id: string): LegalDocumentVersion | null {
    return this.archiveLegalDocumentVersion(id);
  },

  getLatestActiveDocument(type: LegalDocumentType, locale: string = 'tr'): LegalDocumentVersion | null {
    return this.getActiveLegalDocument(type, locale);
  },

  seedInitialDocuments(): LegalDocumentVersion[] {
    return this._seedDefaultDocuments();
  },

  // Helper storage routines
  _getDocumentsFromStore(): LegalDocumentVersion[] {
    try {
      if (typeof window === 'undefined') return [];
      const data = localStorage.getItem(LEGAL_STORAGE_KEY);
      if (!data) {
        return this._seedDefaultDocuments();
      }
      return JSON.parse(data);
    } catch {
      return [];
    }
  },

  _saveDocumentsToStore(docs: LegalDocumentVersion[]): void {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(LEGAL_STORAGE_KEY, JSON.stringify(docs));
      }
    } catch (e) {
      console.error('Failed to write legal documents to storage', e);
    }
  },

  _seedDefaultDocuments(): LegalDocumentVersion[] {
    const defaults: LegalDocumentVersion[] = [
      {
        id: 'seed_terms_of_service',
        type: 'terms_of_service',
        version: '1.0-TASLAK',
        status: 'draft',
        locale: 'tr',
        title: 'LARİ Kullanım Koşulları (Terms of Service)',
        summary: 'Platform kuralları, üyelik şartları ve kullanım sınırları sözleşme taslağı.',
        requiresAcceptance: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        content: `LARİ PLATFORM KULLANIM SÖZLEŞMESİ (TASLAK)

ÖNEMLİ UYARI: Bu sözleşme bir taslaktır ve henüz profesyonel bir hukukçu tarafından onaylanmamıştır. Salonunuzda ve müşteri etkileşimlerinizde canlı kullanıma geçmeden önce mutlaka şirket avukatınız veya hukuki danışmanınız tarafından incelenmeli ve özelleştirilmelidir.

1. TARAFLAR VE KONU
İşbu sözleşme, randevulari.com alan adı üzerinden hizmet veren LARİ bulut tabanlı salon yönetim platformu (bundan böyle "LARİ" veya "Platform" olarak anılacaktır) ile Platform'a kayıt olan salon sahipleri ("Üye İşletme") arasındaki karşılıklı hak ve yükümlülükleri düzenler.

2. HİZMETİN KAPSAMI
LARİ, Üye İşletme'ye randevu takip sistemi, personel ve hizmet yönetimi, kamuya açık müşteri rezervasyon sayfası (Site Provisioning) ve yerel bildirim/iletişim araçları sunar. LARİ, randevu alan müşteriler ile salon arasındaki ticari ilişkinin tarafı değildir; yalnızca bir aracı teknik altyapıdır (Veri İşleyen).

3. TARAFLARIN SORUMLULUKLARI
3.1. Üye İşletme, sisteme girdiği tüm müşteri verilerinin, kişisel veri sahiplerinin (müşteri ve personelin) açık rızaları alınarak girildiğini kabul ve taahhüt eder. Üye İşletme, 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) uyarınca "Veri Sorumlusu" sıfatını haizdir.
3.2. Platform altyapısı, veritabanı güvenliği, RLS (Row Level Security) erişim kontrolleri ve izolasyon standartları LARİ tarafından sağlanır.`
      },
      {
        id: 'seed_privacy_policy',
        type: 'privacy_policy',
        version: '1.0-TASLAK',
        status: 'draft',
        locale: 'tr',
        title: 'LARİ Gizlilik Politikası (Privacy Policy)',
        summary: 'Platform genelinde hangi kişisel verilerin nasıl işlendiğine dair bilgi dökümanı taslağı.',
        requiresAcceptance: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        content: `LARİ PLATFORM GİZLİLİK POLİTİKASI (TASLAK)

ÖNEMLİ UYARI: Bu gizlilik politikası taslak aşamasındadır. Canlı yayına geçmeden önce avukatınız tarafından projenize özel hale getirilmelidir.

1. TOPLANAN VERİLER
LARİ, Platform'un sunulması amacıyla Üye İşletmeler'den ve kamuya açık rezervasyon sayfaları üzerinden müşterilerden aşağıdaki verileri toplar:
- Kimlik ve İletişim Bilgileri: Ad, soyad, telefon numarası, e-posta adresi.
- Rezervasyon Bilgileri: Alınan hizmet, tarih, saat, atanmış uzman.
- Teknik Veriler: IP adresi, tarayıcı bilgisi, işletim sistemi.

2. VERİLERİN İŞLENME AMAÇLARI
Kişisel veriler, randevuların oluşturulması, teyit edilmesi, iptal veya değişiklik taleplerinin yönetilmesi, işletmenin hizmet kalitesinin artırılması amacıyla işlenir.

3. VERİ GÜVENLİĞİ VE SAKLAMA SÜRELERİ
Tüm veriler, RLS ve şifrelenmiş oturum kontrolleri ile korunmakta olup, yasal süreler (örneğin muhasebe ve ETK uyarınca 2 ile 10 yıl arasında değişen süreler) hariç olmak üzere üyelik süresince yerel depolama ve veritabanı sunucularında saklanır.`
      },
      {
        id: 'seed_kvkk_clarification_text',
        type: 'kvkk_clarification_text',
        version: '1.0-TASLAK',
        status: 'draft',
        locale: 'tr',
        title: 'KVKK Aydınlatma Metni (Clarification Text)',
        summary: 'Salon müşterilerine rezervasyon anında sunulacak 6698 sayılı Kanun uyumlu aydınlatma metni.',
        requiresAcceptance: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        content: `6698 SAYILI KVKK KAPSAMINDA MÜŞTERİ AYDINLATMA METNİ (TASLAK)

ÖNEMLİ UYARI: Bu aydınlatma metni kurgusal ve taslak niteliğindedir. İşletmenizin fiziki ortamında topladığı verileri ve güvenlik prosedürlerini içerecek şekilde bir hukuk bürosu denetiminde revize edilmelidir.

Veri Sorumlusu: Randevu Alınan İlgili Salon İşletmesi (Müşteri Bilgilerini Randevu Defterinde Saklayan Tenant)
Veri İşleyen: LARİ Altyapısı (randevulari.com)

1. KİŞİSEL VERİLERİN İŞLENME AMACI
Kişisel verileriniz, randevu sözleşmesinin kurulması ve ifası (KVKK m.5/2-c), veri sorumlusunun meşru menfaati (KVKK m.5/2-f) ve iletişim teyidinin sağlanması hukuki sebeplerine dayanarak otomatik yollarla işlenmektedir.

2. KİŞİSEL VERİLERİN AKTARILMASI
Verileriniz, yalnızca randevu onay, hatırlatma ve destek süreçlerinin yerine getirilebilmesi için ilgili randevu platformu ortakları ve iletişim sağlayıcıları (SMS, E-posta gateway) ile paylaşılabilir. Ticari amaçla üçüncü taraflara aktarılmaz veya satılmaz.

3. KANUNİ HAKLARINIZ (KVKK m.11)
Dilediğiniz zaman veri sorumlusu olan salonumuza başvurarak verilerinizin silinmesini, düzeltilmesini, işlenip işlenmediğini öğrenmeyi ve veri hakları talebinde bulunmayı talep edebilirsiniz.`
      },
      {
        id: 'seed_cookie_policy',
        type: 'cookie_policy',
        version: '1.0-TASLAK',
        status: 'draft',
        locale: 'tr',
        title: 'Çerez Politikası (Cookie Policy)',
        summary: 'Rezervasyon widgetı ve platformda kullanılan çerezlerin açıklaması.',
        requiresAcceptance: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        content: `LARİ PLATFORM ÇEREZ POLİTİKASI (TASLAK)

İşbu Çerez Politikası randevulari.com ve rezervasyon widget'ında kullanılan zorunlu ve analitik çerezleri açıklar.

1. ZORUNLU ÇEREZLER
- Oturum ve Kimlik Doğrulama: Platforma giriş yapan salon sahiplerinin güvenli oturum açması ve yetkisiz erişimlerin engellenmesi için kullanılır.
- Kullanıcı Tercihleri: Dil seçimi ('tr' veya 'en') ve rezervasyon anında girilen bilgilerin bir sonraki rezervasyon için "Bilgilerimi Hatırla" seçeneğiyle lokal depoda (localStorage) saklanması amacıyla kullanılır.

2. ÜÇÜNCÜ TARAF ANALİTİK ÇEREZLER
Pre-live aşamasında hiçbir harici analitik/takip kodu çalışmamaktadır. Canlı sistemlerde ancak müşteri onayından sonra anonimleştirilmiş kullanım istatistikleri toplanabilir.`
      },
      {
        id: 'seed_booking_terms',
        type: 'booking_terms',
        version: '1.0-TASLAK',
        status: 'draft',
        locale: 'tr',
        title: 'Rezervasyon ve Randevu Koşulları (Booking Terms)',
        summary: 'Müşterinin randevu alırken onayladığı operasyonel kurallar taslağı.',
        requiresAcceptance: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        content: `REZERASYON VE RANDEVU KOŞULLARI (TASLAK)

Müşteri, bu rezervasyon ekranı üzerinden randevu oluştururken aşağıdaki kurallara uymayı taahhüt eder:

1. DOĞRU BİLGİ BEYANI
Randevu formunda beyan edilen isim, telefon ve e-posta bilgilerinin güncel ve kendisin ait olması zorunludur. Yanlış iletişim bilgileri sebebiyle ulaşılamayan randevular işletme tarafından iptal edilebilir.

2. SPAM VE KÖTÜYE KULLANIM KORUMASI
Anti-Abuse politikalarımız gereği, bir gün içerisinde aynı telefon veya IP adresinden yapılan olağandışı sayıda deneme sistem tarafından otomatik olarak engellenir. Üst üste gelmeyen randevularda no-show (randevuya gelmeme) durumu tespit edilen müşterilerin rezervasyon yetkileri askıya alınabilir.`
      },
      {
        id: 'seed_cancellation_policy',
        type: 'cancellation_policy',
        version: '1.0-TASLAK',
        status: 'draft',
        locale: 'tr',
        title: 'İptal ve İade Politikası (Cancellation Policy)',
        summary: 'Randevunun kaç saat önce iptal edilebileceği sınırlarını belirten metin.',
        requiresAcceptance: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        content: `RANDEVU İPTAL VE DEĞİŞİKLİK POLİTİKASI (TASLAK)

Salonumuzdaki iş gücü ve rezervasyon verimliliğini korumak adına aşağıdaki iptal kuralları uygulanır:

1. İPTAL SÜRESİ
Oluşturulan randevular, randevu saatine en geç 24 saat (veya salonun panelinde belirtilen iptal süresi kadar) kalana kadar müşteri self-servis portalı üzerinden veya salonu arayarak ücretsiz olarak iptal edilebilir.

2. GEÇ İPTALLER VE GELMEME (NO-SHOW)
Son 24 saat içerisinde yapılan iptaller veya habersiz randevuya gelmeme durumlarında, salonun gelecekteki rezervasyonlarda depozito isteme veya randevu engelleme hakkı saklıdır. Platform üzerinde hiçbir kredi kartı verisi saklanmamaktadır.`
      },
      {
        id: 'seed_communication_consent_text',
        type: 'communication_consent_text',
        version: '1.0-TASLAK',
        status: 'draft',
        locale: 'tr',
        title: 'İşlem Teyit Bildirim İzni (Communication Consent)',
        summary: 'İşlem teyidi, hatırlatma, gecikme ve iptal SMS/WhatsApp gönderim izni.',
        requiresAcceptance: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        content: `İLETİŞİM VE RANDEVU HATIRLATMA İZNİ (TASLAK)

Randevunuzun onaylanması, hatırlatılması ve olası acil durumlarda (uzmanın gecikmesi, şube değişikliği vb.) size anlık bilgi aktarılabilmesi amacıyla e-posta, SMS ve WhatsApp kanallarından bilgilendirme almayı kabul edersiniz. Bu iletişimler tamamen randevu sözleşmesinin ifasına yönelik operasyonel (transactional) bildirimlerdir.`
      },
      {
        id: 'seed_marketing_consent_text',
        type: 'marketing_consent_text',
        version: '1.0-TASLAK',
        status: 'draft',
        locale: 'tr',
        title: 'Pazarlama ve Kampanya İletişim İzni (Marketing Consent)',
        summary: 'İndirim, kampanya, kutlama ve promosyon mesajları ETK açık rıza metni.',
        requiresAcceptance: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        content: `TİCARİ ELEKTRONİK İLETİ ONAY METNİ (KAMPANYA / PAZARLAMA İZNİ)

Salonumuzun sunduğu indirimler, yeni sezon saç trendleri, sadakat puanı ödülleri, arkadaşını öner kampanyaları ve özel gün kutlamaları amacıyla tarafıma e-posta, SMS ve WhatsApp üzerinden ticari elektronik ileti gönderilmesine, 6563 sayılı E-Ticaret Kanunu kapsamında onay veriyorum. Bu izni dilediğim zaman ücretsiz ve koşulsuz olarak geri çekebileceğimi biliyorum.`
      },
      {
        id: 'seed_media_consent_text',
        type: 'media_consent_text',
        version: '1.0-TASLAK',
        status: 'draft',
        locale: 'tr',
        title: 'Görsel ve Medya Paylaşım İzni (Media Consent)',
        summary: 'Personel fotoğrafları ve saç modelleri portfolyo paylaşım izin dökümanı taslağı.',
        requiresAcceptance: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        content: `PERSONEL VE MÜŞTERİ GÖRSEL/MEDYA KULLANIM RIZASI (TASLAK)

1. PERSONEL GÖRSELLERİ
Salonda çalışan uzmanların fotoğraf ve isimleri, kamuya açık rezervasyon sayfalarında, müşterilerin uzman seçebilmesi amacıyla yayımlanır. Uzmanlar diledikleri zaman bu görsellerin değiştirilmesini veya kaldırılmasını talep edebilir.

2. MÜŞTERİ REFERANS FOTOĞRAFLARI
Müşterinin onayı dahilinde çekilen saç modeli veya işlem öncesi/sonrası referans fotoğrafları, sadece salon hafızasında (Customer Memory) saklanır ve müşteri profili silindiğinde otomatik olarak kalıcı olarak imha edilir.`
      },
      {
        id: 'seed_data_processing_terms',
        type: 'data_processing_terms',
        version: '1.0-TASLAK',
        status: 'draft',
        locale: 'tr',
        title: 'Veri İşleme Koşulları (Data Processing Terms)',
        summary: 'LARİ ile salon sahipleri arasındaki Veri İşleme Anlaşması (DPA) taslağı.',
        requiresAcceptance: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        content: `VERİ İŞLEME ANLAŞMASI (DPA - TASLAK)

1. AMACLAR VE KAPRAM
İşbu döküman, LARİ platform sağlayıcısı (Veri İşleyen) ile Üye İşletme (Veri Sorumlusu) arasındaki veri koruma standartlarını ve 6698 sayılı KVKK kapsamındaki veri işleme sınırlarını belirler.

2. VERİ İŞLEYENİN YÜKÜMLÜLÜKLERİ
LARİ, Üye İşletme adına işlediği müşteri ve personel kişisel verilerini yalnızca Üye İşletme'nin talimatları doğrultusunda ve platformun teknik sınırları dahilinde işler. Verilerin güvenliğinin sağlanması için gerekli tüm teknik ve idari tedbirleri (Row Level Security erişim kısıtlamaları, periyodik yedeklemeler vb.) alır.`
      },
      {
        id: 'seed_acceptable_use_policy',
        type: 'acceptable_use_policy',
        version: '1.0-TASLAK',
        status: 'draft',
        locale: 'tr',
        title: 'Kabul Edilebilir Kullanım Politikası',
        summary: 'Platformun kötüye kullanımını, spam gönderimleri ve yasaklı iş kolları sınırlarını çizen kurallar.',
        requiresAcceptance: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        content: `KABUL EDİLEBİLİR KULLANIM POLİTİKASI (TASLAK)

Üye İşletmeler, LARİ platformunu kullanırken aşağıdaki sınırlamalara uymayı taahhüt eder:

1. YASAKLI FAALİYETLER
Platform, spam e-posta/SMS gönderimi, yanıltıcı rezervasyonlar, yasa dışı veya kumar, eskort, sahte sağlık klinikleri vb. yasaklı iş kolları için kullanılamaz.

2. SİSTEME ZARAR VERME
Platformun güvenliğini sarsacak, veri sızıntısına veya aşırı yüklenmeye yol açacak testler ve saldırılar gerçekleştirilemez.`
      },
      {
        id: 'seed_subscription_terms',
        type: 'subscription_terms',
        version: '1.0-TASLAK',
        status: 'draft',
        locale: 'tr',
        title: 'Abonelik ve Ödeme Koşulları (Subscription Terms)',
        summary: 'Üye salonlar için aylık ödemeler, deneme süresi bakiye politikaları taslağı.',
        requiresAcceptance: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        content: `LARİ ABONELİK VE ÖDEME KOŞULLARI (TASLAK)

1. DENEME SÜRESİ (TRIAL)
Sisteme yeni kaydolan işletmeler 14 günlük ücretsiz deneme süresi kazanırlar. Deneme süresinin sonunda aboneliğin devam edebilmesi için bir ödeme planı seçilmesi gereklidir.

2. ÜCRET VE FATURALANDIRMA
Seçilen plana ait aylık ücretler, fatura kesim tarihinde tanımlı karttan tahsil edilir. İptal talebi fatura tarihinden en geç 3 gün önce yapılmalıdır. Ödemesi başarısız olan hesaplar 7 günlük dunning süresinden sonra kısıtlanabilir.`
      }
    ];

    this._saveDocumentsToStore(defaults);
    return defaults;
  }
};
