# LARİ - PAYMENTLESS PRODUCTION HOSTING, DOMAIN, AND SSL PREFLIGHT KILAVUZU

Bu doküman, LARİ platformunun **ödemesiz kısıtlı canlı üretim** (`paymentless_limited_production`) sürümü için hosting, alan adı, wildcard DNS ve SSL kurulum adımlarını detaylandırır.

---

## 1. HEDEF ALAN ADI VE BÖLGE (TARGET DOMAIN & REGION)

*   **Ana Alan Adı (Target Domain):** `randevulari.com` (Türkiye merkezli berber/salon ağ stratejisi).
*   **Hosting Sağlayıcı:** Google Cloud Run (Dockerized Container).
*   **Coğrafi Bölge:** `europe-west3` (Frankfurt) veya `europe-west1` (Belçika) - düşük gecikme süresi ve KVKK uyumluluğu için veri güvenliği yönergeleri.

---

## 2. YÖNLENDİRME VE ALT ALAN ADI DAVRANIŞLARI (ROUTING & WILDCARDS)

### Kök Alan Adı Davranışı (Root Domain Behavior)
`https://randevulari.com` adresini ziyaret eden kullanıcılar, LARİ SaaS tanıtım, fiyatlandırma, yasal sözleşmeler ve self-servis kayıt sayfasına yönlendirilir.

### Wildcard Alt Alan Adı Davranışı (Wildcard Subdomains)
Her yeni kiracı salon, kendi belirlediği bir slug üzerinden alt alan adına sahip olur (örn: `https://lumina.randevulari.com`).
*   **Wildcard DNS Kaydı:** DNS sağlayıcıda (örn: Cloudflare, AWS Route53) `*.randevulari.com` için bir `CNAME` veya `A` kaydı, Cloud Run yük dengeleyicisine yönlendirilir.
*   **Domain Çözümleme:** `domainResolverService.ts` gelen HTTP başlığındaki hostname bilgisini inceler ve `lumina` değerini `tenants` tablosunda `slug` alanından eşleştirerek salon kimliğini tespit eder.

---

## 3. SSL SERTİFİKASI GEREKSİNİMLERİ (SSL REQUIREMENTS)

*   **Wildcard SSL:** Tüm salonların güvenli bağlanması için zorunludur. `randevulari.com` ve `*.randevulari.com` adreslerini kapsayan geçerli bir SSL sertifikası (Let's Encrypt veya Cloudflare Managed SSL) kurulmalıdır.
*   **HTTPS Zorunluluğu:** `HTTP` istekleri sunucu veya yük dengeleyici katmanında otomatik olarak `301 Redirect` ile `HTTPS` protokolüne yönlendirilmelidir.

---

## 4. SPA REWRITE GEREKSİNİMLERİ (SPA REWRITES)

Platform bir React Single Page Application (SPA) olduğu için, istemci taraflı yönlendirmenin (React Router) çalışması amacıyla sunucu tarafında (Nginx veya Express) tüm bilinmeyen istekler `/index.html` dosyasına rewrite edilmelidir:
*   **Nginx Konfigürasyonu:**
    ```nginx
    location / {
        try_files $uri $uri/ /index.html;
    }
    ```
*   **Express Fallback:**
    ```ts
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
    ```

---

## 5. ÇEVRE DEĞİŞKENLERİ (ENVIRONMENT VARIABLES)

Canlı ortamda yüklenen Docker konteynerinde aşağıdaki değişkenler eksiksiz tanımlanmalıdır:
```env
VITE_LAUNCH_MODE=paymentless_limited_production
VITE_DATA_MODE=supabase_production
VITE_PAYMENT_MODE=disabled
VITE_COMMUNICATION_MODE=local_outbox_only
VITE_PUBLIC_BASE_DOMAIN=randevulari.com
VITE_APP_BASE_URL=https://randevulari.com
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_SUPABASE_RLS_VERIFIED=true
VITE_AUTH_MODE=supabase_auth
VITE_TENANT_REG_REPO_READY=true
VITE_MANUAL_PROV_REPO_READY=true
VITE_APPOINTMENT_REPO_READY=true
VITE_BILLING_REPO_READY=true
VITE_TOKEN_STORAGE_READY=true
VITE_BACKUP_PLAN_VERIFIED=true
VITE_ROUTE_SMOKE_TEST_PASSED=true
```

---

## 6. GÜVENLİK VE ROTA KONTROLLERİ (ROUTE PREFLIGHT CHECKS)

### Domain Resolver Testi
*   Farklı alt alan adları (örn: `test.randevulari.com`) ile gelen isteklerin doğru kiracı kaydını çektiği doğrulanmalıdır.

### Kamu Randevu Sayfası (Public Booking Route)
*   `https://[tenant-slug].randevulari.com/` rotasının çalışıp çalışmadığı ve randevu formunun veri yazabildiği doğrulanmalıdır.

### Randevu Yönetim Sayfası (Appointment Manage Route)
*   `https://[tenant-slug].randevulari.com/appointment/manage/[token]` rotası test edilmeli, yetkisiz veya yanlış token girişlerinde hata ekranı gösterilmelidir.

### Süper Admin Rotalarının Korunması (Super Admin Protection)
*   `/super-admin/*` altındaki tüm rotalar strictly koruma altında olmalı, yalnızca yetkili kurucu hesaplarına izin verilmelidir.

---

## 7. DNS GEÇİŞİ ÖNCESİ VE SONRASI TEST ADIMLARI

### DNS Geçişinden Önce Test Edilebilecekler (Before DNS Switch)
1.  **Yerel Host Eşleştirmesi:** `/etc/hosts` dosyasına `127.0.0.1 test.randevulari.com` satırı eklenerek yerel sunucunun wildcard davranışı taklit edilebilir.
2.  **Supabase Bağlantısı:** Localhost üzerinden gerçek Supabase veritabanına veri yazma/okuma testleri gerçekleştirilir.
3.  **Linter ve Derleme Kontrolleri:** `npm run build` komutunun sorunsuz tamamlandığı teyit edilir.

### DNS Geçişinden Sonra Test Edilmesi Gerekenler (After DNS Switch)
1.  **SSL El Sıkışması:** Tarayıcıda güvenli kilit simgesinin göründüğü kontrol edilir.
2.  **Canlı Kayıt Akışı:** Gerçek bir salon kaydı oluşturulup veri tabanına yansıması izlenir.
3.  **Randevu ve Outbox:** Canlı bir randevu alınıp bildirim kuyruğuna (outbox) kaydın düştüğü izlenir.

---

## 8. GERİ DÖNÜŞ PLANI (ROLLBACK PLAN)

DNS veya SSL kurulumunda kritik bir hata oluşması durumunda hizmet kesintisini önlemek için uygulanacak adımlar:
1.  **DNS TTL Ayarı:** Geçiş öncesinde DNS kayıtlarının TTL (Time-To-Live) değeri **5 veya 10 dakikaya** düşürülür. Bu sayede olası bir geri dönüş anında yayılır.
2.  **Eski Sürüme Dönüş (Revert):** DNS kayıtları anında eski stabil sunucu IP'sine/CNAME'ine yönlendirilir.
3.  **Hata Giderme Modu (Maintenance):** Eğer eski stabil sürüm yoksa, Cloud Run üzerinde tüm istekleri `503 Service Unavailable` bakım ekranına yönlendiren geçici bir yönlendirme aktifleştirilir.
