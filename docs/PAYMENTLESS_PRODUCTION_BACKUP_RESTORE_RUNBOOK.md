# LARI - PAYMENTLESS PRODUCTION BACKUP & RESTORE RUNBOOK

Bu doküman, LARİ platformunun **ödemesiz kısıtlı canlı üretim** (`paymentless_limited_production`) sürecindeki veritabanı yedekleme, manuel veri aktarımı ve olası bir felaket senaryosunda kurtarma adımlarını tanımlar.

---

## 1. SUPABASE YEDEKLEME STRATEJİSİ (REQUIRED SUPABASE BACKUP STRATEGY)

*   **Otomatik Günlük Yedeklemeler (Daily Backups):** Supabase Pro/Enterprise planlarında günlük otomatik yedeklemeler aktiftir. Veriler her gece otomatik olarak yedeklenir ve 7 ile 30 gün boyunca saklanır.
*   **Manuel Point-in-Time Recovery (PITR):** Kritik veritabanı şema güncellemeleri veya veri göçleri (migration) öncesinde Supabase Dashboard üzerinden anlık yedek (snapshot) alınmalıdır.

---

## 2. MANUEL VERİ DIŞARI AKTARMA (MANUEL EXPORT FALLBACK)

Veritabanı veya hosting düzeyinde tam bir çöküş yaşanması durumunda, en az veri kaybı ile kurtarma sağlamak amacıyla Süper Admin arayüzündeki manuel dışarı aktarma aracı kullanılabilir.
*   **Süper Admin Dışa Aktarma:** Süper Admin panelindeki "Veri Yönetimi" sekmesi kullanılarak tüm sistem durumu (`tenants`, `appointments`, `customers`, `consent_ledger`) tek bir şifreli JSON dosyası olarak bilgisayara indirilir.
*   **Periyodik İndirme:** Bu JSON dosyası her cuma akşamı Süper Admin tarafından indirilmeli ve güvenli bir çevrimdışı depolama alanında saklanmalıdır.

---

## 3. MANUEL KURTARMA VE GERİ YÜKLEME TESTLERİ (RESTORE TEST)

Yedeklerin gerçekten çalışıp çalışmadığını anlamak için her ay en az bir kez staging ortamına yedek geri yükleme (restore test) testi yapılmalıdır:
1.  **Staging DB Hazırlığı:** Boş bir Supabase projesi oluşturulur.
2.  **Şema Uygulama:** Güncel şema (`supabase/migrations`) boş veritabanına uygulanır.
3.  **JSON Veri Yükleme:** Alınan JSON yedeği veya pg_dump SQL çıktısı yeni veritabanına import edilir.
4.  **Eşleşme Testi:** Staging uygulaması başlatılarak kayıtların eksiksiz yüklendiği ve RLS kurallarının çalıştığı doğrulanır.

---

## 4. ESKİ DEPLOYMENT SÜRÜMÜNE GERİ DÖNÜŞ (ROLLBACK DEPLOYMENT)

Eğer yeni bir kod yayını (deployment) canlıda kritik bir hataya yol açarsa:
1.  **Container Sürümünü Geri Al:** Google Cloud Run panelinden bir önceki stabil revizyon seçilerek trafik %100 o sürüme yönlendirilir.
2.  **Veritabanı Uyumsuzluğu:** Eğer veritabanı şeması geriye dönük uyumsuz ise, veritabanı son stabil yedekten geri yüklenir.

---

## 5. KRİTİK VERİ UNSURLARININ KORUNMASI (PRESERVING CRITICAL DATA)

Kısıtlı üretimden tam iyzico entegrasyonlu SaaS modeline geçerken veri bütünlüğünü korumak için aşağıdaki kurallar uygulanır:

### Manuel Aktif Kiracıların Korunması (Preserving Tenants)
*   Manuel olarak Süper Admin tarafından aktifleştirilen salonların `tenant_id` ve `slug` değerleri asla değiştirilmemelidir. Bu değerler gelecekteki fatura geçmişi ve müşteri bağlantıları için birincil anahtardır.

### Ödenen Son Tarihlerin Korunması (Preserving Paid-Through Dates)
*   Her kiracının `subscriptions` tablosundaki `paid_through_date` alanı manuel ödeme makbuzuna göre set edilir. iyzico geçişinde bu tarihlerin bozulmaması için otomatik fatura kesim tarihi bu tarihe göre ayarlanmalıdır.

### Politika Kabullerinin Korunması (Preserving Policy Acceptances)
*   Kullanıcıların KVKK ve Üyelik Sözleşmesi kabulleri `policy_acceptances` ve `consent_ledger` tablolarında değiştirilemez bir şekilde tutulur. Bu verilerin kaybı yasal sorumluluk doğuracağından, yedekleme sırasında bu tablolar en yüksek öncelikli olarak korunmalıdır.

### Müşteri Randevularının Korunması (Preserving Appointments)
*   Müşterilerin geleceğe yönelik randevuları ve randevu yönetim linkleri (`self_service_tokens`) kesinlikle silinmemeli veya değiştirilmemelidir. Geri yükleme sonrasında randevu linklerinin çalışmaya devam etmesi sağlanmalıdır.

---

## 6. ASGARİ YEDEKLEME KONTROL LİSTESİ (BACKUP CHECKLIST)

### Günlük Rutin Kontroller
- [ ] Supabase otomatik günlük yedekleme durumunun "Success" olduğunu doğrula.
- [ ] Veritabanı CPU ve bağlantı limitlerini izle.

### Haftalık Rutin Kontroller
- [ ] Süper Admin paneli üzerinden manuel `.json` durum yedeğini indir ve arşivle.
- [ ] Manuel yedek boyutunun ve bütünlüğünün normal olduğunu doğrula.

### Aylık Rutin Kontroller
- [ ] İndirilen bir yedeği staging veritabanına yükleyerek "Restore Test" gerçekleştir.
- [ ] Yedekten dönülen veritabanında RLS politikalarının ve kullanıcı girişlerinin stabil olduğunu kontrol et.
