# Kısıtlı Canlı Sürüm Minimum Altyapı Kontrol Listesi (Limited Live Minimum Infrastructure Checklist)

Bu döküman, LARİ platformunun `limited_live_manual_billing` modunda canlıya (production) alınabilmesi için teknik olarak kurulması ve yapılandırılması gereken **minimum altyapı adımlarını** içerir. Online ödeme olmasa bile sistemin güvenli ve kesintisiz çalışması için bu maddeler eksiksiz tamamlanmalıdır.

---

## 1. Sunucu ve Veritabanı Altyapısı (Hosting & Database)

*   **Sunucu Kurulumu (Production Hosting):**
    *   [ ] Uygulama Node.js ve Vite destekleyen güvenilir bir bulut sunucusuna (Örn: Cloud Run, VPS veya heroku benzeri servisler) dağıtıldı mı?
    *   [ ] Port 3000 veya gerekli üretim port yönlendirmeleri güvenlik duvarı arkasında yapılandırıldı mı?
*   **Veritabanı (Supabase Staging/Production):**
    *   [ ] Yerel/bellek veritabanından, gerçek ve yedekli çalışan bir bulut veritabanına (Supabase veya PostgreSQL) geçiş tamamlandı mı?
    *   [ ] Veritabanı şeması ve tabloları en güncel `/services/supabaseClient.ts` ve şema dökümanlarına göre migrate edildi mi?
    *   [ ] Satır Bazlı Güvenlik (RLS) politikaları tüm tablolarda aktifleştirildi mi?

---

## 2. Alan Adı ve Güvenlik (Domain & SSL)

*   **Ana Alan Adı (Primary Domain):**
    *   [ ] `randevulari.com` alan adı satın alındı ve DNS yönlendirmeleri bulut sunucu IP adresine bağlandı mı?
*   **SSL Sertifikası (HTTPS):**
    *   [ ] Web trafiğinin şifrelenmesi ve tarayıcı güvenliği için geçerli bir SSL sertifikası (Örn: Let's Encrypt) kuruldu mu ve tüm isteklerin HTTPS üzerinden gelmesi zorunlu kılındı mı?
*   **Alt Alan Adları (Subdomains / Tenant Slugs):**
    *   [ ] Wildcard DNS (`*.randevulari.com`) kaydı oluşturuldu mu? Bu sayede oluşturulan salonların `salonadi.randevulari.com` uzantılı adreslerinin sunucuya düşmesi sağlandı mı?

---

## 3. Çevre Değişkenleri (Environment Variables)

Üretim sunucusunda `.env` dosyası içinde şu değişkenlerin tanımlandığı bizzat doğrulandı mı?
```env
# Canlılık modu kısıtlı manuel faturalandırma olarak ayarlanmalı
VITE_LAUNCH_MODE=limited_live_manual_billing

# İletişim modu pre-live aşamasında outbox-only kalmalı
VITE_COMMUNICATION_MODE=local_outbox_only

# Veritabanı bağlantısı (Gerçek canlı Supabase API ve URL)
VITE_SUPABASE_URL=https://your-real-supabase-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-real-anon-key
```

*⚠️ **ÖNEMLİ GÜVENLİK KURALI:** Üretim sunucusundaki `.env` dosyasında asla iyzico canlı API anahtarları veya gerçek SMS sağlayıcı şifreleri yer almamalıdır. Bu entegrasyonlar henüz hazır değildir ve kod içinde de simülatörler devrededir.*

---

## 4. Canlıya Alım Öncesi Teknik Duman Testleri (Technical Smoke Tests)

Canlıya geçiş sabahında, kurucular tarafından şu testlerin production adresi üzerinde manuel olarak yapılması zorunludur:

*   [ ] **Uçtan Uca Rota Testi:** `/register`, `/login`, `/admin`, `/super-admin` sayfalarının hatasız yüklendiğinin doğrulanması (Beyaz ekran/White screen olmaması).
*   [ ] **Müşteri Randevu Akışı:** `/booking/test-salon` sayfasından bir randevu oluşturulması ve veritabanına doğru şekilde yazıldığının görülmesi.
*   [ ] **Self-Servis İptal:** Randevu onay ekranındaki tokenlı iptal linkinin çalıştırılması ve randevunun silinmesi/iptali.
*   [ ] **Süper Admin Manuel Aktivasyon:** Yeni kaydolan bir test kiracısının abonelik durumunun Süper Admin paneli üzerinden `manual_active` statüsüne çekilebilmesi.

---

## 5. Geri Dönüş ve Kurtarma Planı (Rollback Plan)

Eğer canlıya geçişten sonraki ilk 24 saat içinde sistemde büyük bir çökme veya veritabanı bağlantı kopması yaşanırsa uygulanacak adımlar:
1.  Alan adı geçici olarak "Sistem Bakımdadır" sayfasına yönlendirilir.
2.  Supabase üzerindeki son otomatik yedek geri yüklenir.
3.  Hata giderilemezse, salon yöneticilerine bizzat telefon açılarak randevu alımının geçici olarak Instagram DM'den devam etmesi rica edilir.
