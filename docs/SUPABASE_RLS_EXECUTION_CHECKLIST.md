# LARİ - Supabase RLS Güvenlik ve Tenant İzolasyonu Canlı Geçiş Kontrol Listesi

Bu kılavuz, yerel test modundan gerçek Supabase staging veritabanına geçilirken, satır bazlı güvenlik (RLS - Row Level Security) kurallarının sırayla nasıl devreye alınacağını, sızıntı testlerinin nasıl gerçekleştirileceğini ve olası hata durumlarında nasıl geri dönüleceğini (rollback) adım adım anlatır.

---

## 1. Ön Koşullar (Preconditions)

Geçiş işlemine başlamadan önce aşağıdaki maddelerin tamamlandığından emin olun:

*   [ ] **Yedekleme:** Canlı staging veritabanının güncel bir `pg_dump` yedeği alınmış olmalıdır.
*   [ ] **Schema Eşitliği:** `001_initial_schema.sql` ve `20260601_lari_core_schema_alignment.sql` dahil tüm şema göç adımları hedef veritabanında eksiksiz çalıştırılmış olmalıdır.
*   [ ] **Çevre Değişkenleri:** Yerel test ortamındaki `.env` dosyasında `VITE_LARI_DATA_SOURCE=local` ayarının default olarak korunduğu doğrulanmalıdır (Testler bitene kadar canlıya geçmeyin).
*   [ ] **Servis Rolü Koruması:** `VITE_SUPABASE_SERVICE_ROLE` veya `service_role` yüksek yetkili anahtarlarının hiçbir frontend dosyasında bulunmadığı `npm run check:secrets` (veya ilgili tarayıcı scriptleri) ile teyit edilmelidir.

---

## 2. Migration Uygulama Sırası

RLS politikalarını uygulamak için göç scriptini aşağıdaki sıralamayla hedef veritabanında çalıştırın:

1.  **Dizayn Dosyası:** `/supabase/migrations/20260619_lari_rls_policy_draft.sql` içeriğini gözden geçirin.
2.  **Uygulama:** Supabase Dashboard SQL Editor üzerinden veya yerel terminalden Supabase CLI yardımıyla göç dosyasını uygulayın:
    ```bash
    supabase db push
    ```
3.  **RLS Aktivasyon Kontrolü:** Tüm hedef tablolarda RLS'in açık olduğunu teyit etmek için şu sorguyu çalıştırın:
    ```sql
    SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
    ```
    *Beklenen çıktı:* İlgili tüm tabloların `rowsecurity` değeri `true` olmalıdır.

---

## 3. Test Fixtures ve Kullanıcı Kurulumu

Senaryoları gerçek ortamda test etmek için test kullanıcılarını ve tenant yapılarını oluşturun.

### Adım A: Tenant ve Profil Fixture'larını Seed Edin
```sql
-- Test SQL dosyamızdaki aaaaaaaa-... ve bbbbbbbb-... UUID'lerini kullanarak veritabanına iki farklı test salonu ekleyin.
INSERT INTO public.tenants (id, slug, name, status, public_site_status)
VALUES 
('aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa', 'salon-a', 'Salon A', 'active', 'published'),
('bbbbbbbb-1111-2222-3333-bbbbbbbbbbbb', 'salon-b', 'Salon B (Taslak)', 'suspended', 'draft');
```

### Adım B: Supabase Auth Üzerinden Test Kullanıcıları Oluşturun
1.  **Owner A (Ahmet):** Supabase Auth sekmesinden `owner_a@randevulari.com` e-posta adresiyle bir kullanıcı oluşturun. Oluşan `id` (UUID) değerini kopyalayın ve `public.users_profile` tablosuna `role = 'tenant_owner'` ve `tenant_id = 'aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa'` olarak bağlayın.
2.  **Owner B (Buse):** `owner_b@randevulari.com` adresiyle bir kullanıcı oluşturun. `role = 'tenant_owner'` ve `tenant_id = 'bbbbbbbb-1111-2222-3333-bbbbbbbbbbbb'` olarak kaydedin.
3.  **Super Admin (Cem):** `super_admin@randevulari.com` adresiyle bir kullanıcı oluşturun. `role = 'super_admin'` olarak kaydedin.

---

## 4. İzolasyon Sızıntı Test Matrisi

Farklı rollere bürünerek izolasyon sınırlarını test edin.

| Adım | Kimlik Rolü | Hedef İşlem / Tablo | Beklenen Güvenlik Sonucu | Doğrulama Sorgusu / Komut |
|---|---|---|:---:|---|
| **1** | Public / Anon | `select` * `tenant_business_profiles` | **IZIN VERILDI** (Yalnızca Public aktif olanlar) | `is_public_profile_enabled = true` olan kayıt döner. |
| **2** | Public / Anon | `select` * `customer_memory` | **ENGELLENDI** (Sıfır satır döner veya hata) | `SELECT COUNT(*) FROM public.customer_memory;` -> `0` |
| **3** | Public / Anon | `insert` `appointment` | **IZIN VERILDI** (Yalnızca aktif/published salonlara) | Randevu eklenir ancak ekleyen anon `select` yapamaz. |
| **4** | Owner A | `select` * `appointments` where tenant A | **IZIN VERILDI** (Yalnızca Tenant A kayıtları) | Ahmet kendi salonunun randevularını eksiksiz çeker. |
| **5** | Owner A | `select` * `appointments` where tenant B | **ENGELLENDI** (Sıfır satır döner) | Ahmet, Salon B'ye ait hiçbir randevuyu göremez. |
| **6** | Owner A | `update` `services` of tenant B | **ENGELLENDI** (Hata veya Güncelleme Yapılamaz) | `UPDATE services SET price = ... WHERE tenant_id = 'B-ID'` -> Etkilenen satır `0`. |
| **7** | Super Admin | `select` * `tenants` (Tümü) | **IZIN VERILDI** (Bütün tenant kayıtları listelenir) | Cem tüm tablol can ve hak sahibi detaylarını listeler. |
| **8** | Service Role | `insert` `payment_events` | **IZIN VERILDI** (Tüm RLS kuralları bypass edilir) | Ödeme altyapıları webhook'ları veritabanına doğrudan yazar. |

---

## 5. Başarısız RLS Durumlarında Aksiyon Planı (Troubleshooting)

Eğer bir kullanıcı yetkilendirildiği halde bir veriyi göremiyorsa veya veri sızıntısı gözlemlenirse:

1.  **Sorguyu `EXPLAIN` ile İnceleyin:** Politikaların nasıl çalıştığını görmek için Postgres query anahtarında `EXPLAIN (ANALYZE, BUFFERS)` kullanın.
2.  **JWT Token Context Değerini Teşhis Edin:** `auth.uid()` ve `auth.jwt()` fonksiyonlarının doğru kullanıcısı temsil ettiğini test edin:
    ```sql
    SELECT auth.uid(), auth.role();
    ```
3.  **Kullanıcı Rollerindeki Eksiklik:** Kullanıcının `users_profile` tablosunda doğru role sahip olduğunu ve `tenant_id` değerinin eşleştiğini doğrulamak için `SELECT * FROM public.users_profile WHERE id = auth.uid();` çalıştırın.
4.  **Infinite Recursion Hatası:** Eğer bir politika başka bir sorguya referans verip döngüye giriyorsa (Infinite Loop/Call Recursion), politika içindeki `USING` kısmında aynı tablodan alt sorgular çağırmadığınızı doğrulayın. Gerekirse inline sorgu yerine veritabanı fonksiyonu kullanın.

---

## 6. Geri Dönüş (Rollback) Stratejisi

Güvenlik testleri esnasında kritik bir sızıntı veya servis kesintisi oluşması durumunda uygulanacak acil tahliye planı:

1.  **Yerel Moda Geri Dönüş (Failsafe Fallback):** Uygulamadaki veri modunu derhal yerel konfigürasyona çekin:
    ```env
    VITE_LARI_DATA_SOURCE=local
    ```
2.  **Zararlı Politikaları Kaldırma:** Veritabanında kilitlenen veya hatalı çalışan RLS politikalarını sıfırlamak için politikaları kapatıp varsayılan güvenli moda çekin:
    ```sql
    -- Tablolarda geçici olarak RLS'i pasifleştirmek gerekirse (Sadece acil durum staging analizi için):
    -- ALTER TABLE public.appointments DISABLE ROW LEVEL SECURITY;
    ```
3.  **Restore:** Sorunlu göç adımını geri almak için son yedekten geri yükleme (Restore) yapın:
    ```bash
    pg_restore -d postgresql://postgres:...@your-supabase-db.supabase.co:5432/postgres backup.dump
    ```

---

## 7. Supabase CLI ile Testlerin Otomatikleştirilmesi

Staging ortamındaki izolasyon testlerini otomatikleştirmek için:
1.  `/supabase/tests/rls_tenant_isolation_scenarios.sql` içindeki test senaryolarını yerel makinenizde Supabase CLI yardımıyla çalıştırarak test raporları üretebilirsiniz:
    ```bash
    supabase test db
    ```
2.  Uygulamanın tam güvenli durumda kalmasını sağlamak için her ana kod değişikliğinden sonra `npm run qa:all` komutunu çalıştırarak statik doğrulayıcıların tamamından yeşil aldığınızdan emin olun.

randevulari.com altyapısında veri bütünlüğü ve gizliliği en birincil önceliğimizdir!
