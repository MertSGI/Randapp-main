# LARİ Veritabanı Şema Uzlaştırma Yürütme Planı (Migration Reconciliation Execution)

**Document ID:** `LARI-DOC-MIGRATION-RECONCILIATION-EXECUTION-20261021`  
**Referans Kanıt:** `docs/evidence/migration-reconciliation-20261011.json`  
**Matris Dosyası:** `docs/lari-program/MIGRATION_RECONCILIATION_MATRIX.json`  
**Durum:** `SOURCE_READY_FOR_REVIEW` (Staging SQL uygulanmamıştır; yürütme öncesi hazırlık planıdır)  

---

## 1. Değişmez Güvenlik İlkeleri (Fixed Invariants)

1. **`NO_BLIND_SUPABASE_DB_PUSH`:**
   Supabase CLI veya doğrudan veritabanına körleme `db push` çalıştırılamaz.
2. **`NO_DB_DDL`:**
   Yetkisiz veya canlı oturumda doğrudan DDL/tablo değişikliği yapılamaz.
3. **`NO_MIGRATION_LEDGER_REWRITE`:**
   Uzak `supabase_migrations.schema_migrations` tablosundaki kayıtlar silinemez, yapay repair yapılamaz.
4. **`NO_SIMULATED_EQUIVALENCE`:**
   İsim veya nesne varlığına bakılarak katalog eşdeğerliği varsayılamaz; PG17 klonu üzerinde tam parite kanıtı zorunludur.

---

## 2. 25 Fark ve P0 Güvenlik Düzeltmesinin Sınıflandırması

Toplam 25 fark ve 1 bağımsız P0 güvenlik kaydı tanımlanmıştır:
- **21 `LOCAL_ONLY` Migrations:** Kaynakta mevcut olup uzak ledger'da bulunmayan dosyalar.
  - 9 adet `MISSING_UNAPPLIED_PROVEN`
  - 8 adet `DRIFT_OR_CONFLICT` (çakışma ve mevcut nesne üzerine yazma riski)
  - 4 adet `UNKNOWN` (uzak WP6 adayları ile eşleşme ihtimali olan ancak henüz kanıtlanmamış dosyalar)
- **4 `REMOTE_ONLY` Migrations:** Uzak ledger'da kayıtlı (`20261008063020`, `20261008063027`, `20261008063031`, `20261008063041`) ancak kaynakta birebir aynı dosya adı olmayan WP6 göçleri (`UNKNOWN`).
- **1 `SECURITY_CUTOVER_ONLY` (P0):**
  - Dosya: `20261011155623_appointment_access_tokens_table_access_hardening.sql`
  - LF SHA-256: `260F727516CFF4CF0754295206A10E56505A9CA9E22AEC099BB7F21099BD5E13`
  - Kapı: `SQL_WRITE_STAGING_P0` (Yalnızca doğrulanmış yedek ve offline kurtarma tatbikatı sonrasında uygulanabilir).

---

## 3. Çakışma Grupları ve İleriye Dönük (Forward-Only) Çözüm

Aşağıdaki versiyonlar çakışma grubu olarak etiketlenmiştir ve mevcut dosyalar yeniden adlandırılmadan, ileride sadece yeni benzersiz forward-only göçlerle çözümlenecektir:
1. `COLLISION_20260920`: `20260920_phase3_resource_capacity_foundation.sql` (kayıtlı background_job migration ile aynı versiyon).
2. `COLLISION_20260921`: `customer360` ve `package_limits_multibranch` (aynı 20260921 versiyonu).
3. `COLLISION_20260925`: `loyalty_reactivation` ve `packages_memberships` (aynı 20260925 versiyonu).
4. `COLLISION_20260928`: `clinic_practitioners` ve `ht_treatment_journey` (aynı 20260928 versiyonu).

---

## 4. Mevcut Uzak Nesneler İçin Klon Karşılaştırma Zorunluluğu (`NEEDS_CLONE_DIFF`)

Uzak veritabanında zaten kısmi nesnesi bulunan aşağıdaki 5 öğe için kör `CREATE OR REPLACE` yasaklanmış olup, restore edilmiş PG17 klonu üzerinde tam gövde diff'i (`NEEDS_CLONE_DIFF`) şart koşulmuştur:
- `customer_segments`
- `deactivate_tenant_branch`
- `clinic_set_staff_profile`
- `clinic_get_my_context`
- `evaluate_booking_slot`
