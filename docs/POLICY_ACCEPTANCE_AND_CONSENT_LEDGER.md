# Değiştirilemez Rıza Defteri (Consent Ledger) ve Politika Onay Altyapısı

> **⚠️ ÖNEMLİ HUKUKİ UYARI / DISCLAIMER:**
> Bu döküman, LARİ platformunun pre-live hazırlık süreci için hazırlanmış bir taslaktır ve kesinlikle **profesyonel hukuki tavsiye (legal advice) niteliği taşımaz**. İçeriklerin tamamı canlı kullanıma geçilmeden önce nitelikli ve yetkili bir **hukuk danışmanı / şirket avukatı** tarafından incelenmeli, yerel mevzuata göre özelleştirilmeli ve onaylanmalıdır. Yasal uyumluluk sorumluluğu tamamen platformu işleten kuruluşa aittir.

LARİ, kişisel veri sahiplerinin (müşteri, personel, salon sahibi) rızalarını ve onayladıkları yasal metinleri ispatlanabilir, değiştirilemez bir yapıda kayıt altında tutar. Bu döküman, sistemin onay ve rıza saklama mimarisini açıklar.

---

## 1. Mimari Prensipler

Güvenli bir rıza yönetimi için LARİ üç katmanlı bir kayıt stratejisi izler:

### 1.1. Sürüm Bazlı Politika Kabulü (Policy Acceptance)
Kullanıcı (Salon Sahibi veya Müşteri) kayıt veya rezervasyon anında yasal bir metni onayladığında, sistem sadece "onayladı" bayrağını tutmaz. Kabul anında yürürlükte olan **aktif belgenin benzersiz kimliği (id)**, **sürüm kodu** ve **metnin o andaki içeriğinin özeti (snapshot)** kabul kaydına gömülür. Böylece ileride politika metni değişse bile, kullanıcının kabul ettiği eski metin versiyonu ispatlanabilir olarak kalır.

### 1.2. Değiştirilemez Rıza Günlüğü (Consent Ledger)
Kullanıcının her türlü rıza beyanı (pazarlama izni verme, rızayı geri çekme, operasyonel bildirim izinleri, referans fotoğraf çekim izni vb.) rıza defterine (ledger) yeni bir satır olarak eklenir. Bu defterdeki geçmiş kayıtlar **asla silinmez veya güncellenmez**; rızanın geri çekilmesi durumunda yeni bir rıza iptal satırı eklenerek durum güncellenir.

### 1.3. Denetim Günlüğü (Audit Log Sync)
Tüm rıza ve politika kabulleri, eşzamanlı olarak merkezi `auditLogService` üzerinden de `security` kategorisinde ve güvenli (redakte edilmiş) detaylarla kayıt altına alınır.

---

## 2. Rıza Veri Yapısı (Consent Ledger Record)

Defterde saklanan her bir rıza kaydı şu şemaya sahiptir:

```typescript
export interface ConsentLedgerRecord {
  id: string;               // cld_ ile başlayan benzersiz kimlik
  tenantId?: string;        // İlgili salon kimliği
  actorType: string;        // 'customer' | 'tenant_owner' | 'staff'
  actorId?: string;         // Benzersiz aktör kimliği (örn: telefon veya e-posta)
  contact?: string;         // Redakte edilmiş iletişim bilgisi
  consentType: string;      // Rıza tipi (marketing, communication vb.)
  status: string;           // 'granted' | 'denied' | 'withdrawn' | 'expired'
  source: string;           // 'booking_page' | 'registration_page' | 'self_service'
  capturedAt: string;       // Rıza zamanı
  withdrawnAt?: string;     // Geri çekilme zamanı (varsa)
  legalDocumentType?: string;
  legalDocumentVersion?: string;
  consentTextSnapshot?: string; // Onaylanan rıza metninin bir kopyası
}
```

---

## 3. Rıza Geri Çekme (Revocation / Withdrawal) Mekanizması

KVKK m.11 ve ETK uyarınca kullanıcılar verdikleri ticari ileti veya işleme rızalarını diledikleri an **koşulsuz ve ücretsiz** olarak geri çekme hakkına sahiptir.

1. **Müşteri Self-Servis Portalı**: Müşteriler kendilerine gelen randevu yönetim linki üzerinden KVKK bölümüne ulaşarak rızalarını tek tıkla geri çekebilirler.
2. **Uygulama İçi Tetikleyici**: Geri çekme işlemi tetiklendiğinde `consentLedgerService.withdrawConsent(actorId, consentType, reason)` metodu çalıştırılır.
3. **Defter Güncellemesi**: Mevcut aktif rızanın durumu `withdrawn` olarak işaretlenir, `withdrawnAt` damgası vurulur ve bir güvenlik ihlali veya usulsüz gönderim incelemesinde kullanılmak üzere gerekçesiyle saklanır.
4. **İletişim Blokajı**: `communicationEventService` yeni bir e-posta veya SMS göndermeden önce güncel rıza durumunu rıza defterinden sorgular; durum `withdrawn` ise gönderimi anında iptal eder ve gönderim loguna `Müşteri pazarlama rızasını geri çekmiştir` yazar.

---

## 4. İYS (İleti Yönetim Sistemi) Entegrasyon Gaps

Canlı kullanım öncesinde rıza defterindeki her pazarlama (`marketing`) onayı veya geri çekme olayının, Türkiye'deki resmi **İleti Yönetim Sistemi (İYS)** API'leri ile 3 iş günü içerisinde senkronize edilmesi yasal bir zorunluluktur. Pre-live sürümde bu entegrasyon bir simülasyon olarak tasarlanmıştır ve canlı geçişte entegre edilmelidir.
