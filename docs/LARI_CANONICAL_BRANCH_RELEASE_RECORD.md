# LARİ Kanonik Dal & Staging PR Uzlaştırma Kaydı (Canonical Branch Release Record)

**Belge Kimliği:** `LARI-DOC-CANONICAL-BRANCH-RELEASE-20261116`  
**Referans Adım:** `ADIM-040` (`Faz I1: Kanonik Branch & Staging PR Uzlaştırması`)  
**Kanonik Hedef Dal:** `staging/supabase-staging-consistency`  
**Önceki Kanonik Hedef SHA (Birleştirme Öncesi):** `2c6a99b0b92ecea4f324c7195b3222f92688f294` (`2c6a99b0`)  
**Kaynak Aday Dalı & SHA (`ADIM-039` Kabulü):** `ci/lari-independent-acceptance-gate` @ `66371ce230b0136c5e86f3f9f33aeefe6ea49bb8` (`66371ce2`)  
**PR #1 (Kaynak Adayı Birleştirme):** [`https://github.com/MertSGI/Randapp-main/pull/34`](https://github.com/MertSGI/Randapp-main/pull/34)  
**Gerçek Kaynak Merge Commit SHA:** `29c75164313114f306f49fcf05682aeb83eb1532` (`29c75164`)  
**Birleştirme Zamanı & Yöntemi:** `2026-11-16T14:06:22Z` — İnsan incelemesi sonrası manuel `Create a merge commit` (`AUTO_MERGE = DISABLED`)  
**Nihai Kaynak Sınıflandırması:** **`SOURCE_CANDIDATE_COMPLETE`** *(Kesinlikle `PRODUCTION_READY` değildir)*  
**Resmi Canlı Kesim Kararı:** **`PRODUCTION = NO_GO`**  
**Açık Üretim Blokeri:** **GitHub Issue #10 (`OPEN / RED / BLOCKED` — `OPEN_PRODUCTION_BLOCKER`)**  
**Tarih:** 16 Kasım 2026

---

## 1. İki Aşamalı İnsan Denetimli Uzlaştırma Özeti

`ADIM-039` (`66371ce230b0136c5e86f3f9f33aeefe6ea49bb8`) sonrası `SOURCE_CANDIDATE_COMPLETE` seviyesine ulaşan V1-A -> V1-B -> V2 bütünleştirme dalı (`ci/lari-independent-acceptance-gate`), `AUTO_MERGE = DISABLED` ve insan yetkisi kuralı gereğince iki aşamalı PR akışı üzerinden kanonik `staging/supabase-staging-consistency` dalına uzlaştırılmıştır:

1. **Aşama 1 — PR #1 (Kaynak Adayı Birleştirme, Tamamlandı):**
   * **Pull Request:** [`MertSGI/Randapp-main#34`](https://github.com/MertSGI/Randapp-main/pull/34)
   * **Kaynak -> Hedef:** `ci/lari-independent-acceptance-gate@66371ce230b0136c5e86f3f9f33aeefe6ea49bb8` → `staging/supabase-staging-consistency@2c6a99b0b92ecea4f324c7195b3222f92688f294`
   * **Birleştirme Öncesi Kapı Durumu:** `state=OPEN`, `mergeable=MERGEABLE`, `mergeStateStatus=CLEAN`, `auto_merge=null` (`AUTO_MERGE = DISABLED`).
   * **İnsan Onayı ve Birleştirme:** Kullanıcı tarafından manuel incelenip `2026-11-16T14:06:22Z` tarihinde `Create a merge commit` yöntemiyle birleştirildi.
   * **Oluşan Kanonik Kaynak Merge SHA:** **`29c75164313114f306f49fcf05682aeb83eb1532`**

2. **Aşama 2 — PR #2 (Birleştirme Sonrası Salt-Dokümantasyon Mühürleme):**
   * Bu belge (`docs/LARI_CANONICAL_BRANCH_RELEASE_RECORD.md`) ve güncel kabul paketi (`docs/LARI_FINAL_V1_V2_ACCEPTANCE_PACKAGE.md`), yukarıdaki gerçek kaynak merge SHA'sını (`29c75164313114f306f49fcf05682aeb83eb1532`), PR #34 bağlantısını, GitHub Actions CI run kimliklerini ve korunan `NO_GO` / Issue #10 sınırlarını döngüsel SHA referansı oluşturmadan (yalnızca birleştirme sonrası salt-dokümantasyon PR #2 ile) kayıt altına alır.

---

## 2. GitHub Actions CI & Yerel Doğrulama Kanıt Zinciri

### 2.1. GitHub Actions CI Run Kanıtları

| Tetik / İş Akışı | Hedef / Kapsam | Run ID | Durum | Bağlantı & Not |
| :--- | :--- | :---: | :---: | :--- |
| **`push` (`ADIM-039`)** | `ci/lari-independent-acceptance-gate@66371ce2` | `43870002466` | `SUCCESS` | [`actions/runs/43870002466`](https://github.com/MertSGI/Randapp-main/actions/runs/43870002466) — Push tabanlı CI kabul kapısı. |
| **`pull_request` (PR #34) — `LARI Independent Acceptance CI`** | PR #34 (`66371ce2` → `2c6a99b0`) | `43872084503` | `4/4 SUCCESS` | [`actions/runs/43872084503`](https://github.com/MertSGI/Randapp-main/actions/runs/43872084503) — Zorunlu 4/4 bağımsız PR kabul kontrolü. |
| **`pull_request` (PR #34) — `LARI PG17 Role Restore Qualification`** | PR #34 (`66371ce2` → `2c6a99b0`) | `43872084917` | `SUCCESS` | [`actions/runs/43872084917`](https://github.com/MertSGI/Randapp-main/actions/runs/43872084917) — İlk denemede geçici `curl: (56)` ağ kesintisi sonrası kod/workflow değişikliği yapılmadan `gh run rerun 43872084917 --failed` ile terminal `SUCCESS`. |

### 2.2. Exact-SHA Yerel Doğrulama Makbuzları

* **`ADIM-039` (`66371ce2`) 10/10 Tam Kabul Paketi (`loop.py` + Codex `PASS`):**
  `npx tsc --noEmit` (`28.4s`), `npm run build` (`10.1s`), `node scripts/scan-frontend-secrets.mjs` (`0.6s`), `node scripts/verify-supabase-migration-integrity.mjs` (`0.6s`), `node scripts/test-v1a-data-mode-switching-regression.mjs` (`1.4s`), `node scripts/verify-disposable-pg17-pristine-restore.mjs` (`12.2s`), `node scripts/verify-supabase-staging-consistency.mjs` (`0.7s`), `node scripts/verify-supabase-staging-consistency.test.mjs` (`14.7s`), `node scripts/test-ui-v2-booking-e2e.mjs` (`19.5s`), `node scripts/test-phase-f-browser-regression.mjs` (`21.6s`).
* **`ADIM-040` Hazırlık Doğrulaması (`66371ce2`, `2026-11-16T13:10Z`):**
  * `npx tsc --noEmit` → `PASS (exit=0, 27.79s)`
  * `npm run build` → `PASS (exit=0, 9.42s)`
  * `node scripts/scan-frontend-secrets.mjs` → `PASS (exit=0, 0.36s)`
  * `node scripts/verify-supabase-migration-integrity.mjs` → `PASS (exit=0, 0.41s)`
* **`ADIM-040` Salt-Dokümantasyon Mühürleme Kapısı (`loop.py` `TESTING` Evresi):**
  Bu dosya ve `docs/LARI_FINAL_V1_V2_ACCEPTANCE_PACKAGE.md` teslim edildikten sonra `npx tsc --noEmit`, `npm run build`, `node scripts/scan-frontend-secrets.mjs` ve `node scripts/verify-supabase-migration-integrity.mjs` komutları `loop.py` tarafından senkron olarak yeniden doğrulanır ve sonuçları `ADIM-040.md` kaydına işlenir.

---

## 3. Korunan Yönetişim Sınırları & Açık Üretim Blokerleri

Bu uzlaştırma, kaynak dalını `staging/supabase-staging-consistency` (`29c75164313114f306f49fcf05682aeb83eb1532`) üzerinde tekilleştirir; **canlıya çıkış onayı vermez**:

| Yönetişim / Güvenlik Kuralı | Durum | Bağlayıcı Kapsam |
| :--- | :---: | :--- |
| **`PRODUCTION`** | **`NO_GO`** | Canlı üretim dağıtımı kesinlikle yasaktır. |
| **GitHub Issue #10** | **`OPEN / RED / BLOCKED`** | Uzak PostgreSQL 17 bağımsız felaket kurtarma (DR Restore) ve fiziksel bulut staging kanıtı (`ADIM-041` + `ADIM-042`) tamamlanana kadar açık üretim blokeridir (`OPEN_PRODUCTION_BLOCKER`). |
| **`AUTO_MERGE`** | **`DISABLED`** | Tüm birleştirmeler insan incelemesi ve açık manuel onay gerektirir. |
| **`PAID_FALLBACK`** | **`DISABLED`** | Ücretli ödeme, abonelik veya AI sağlayıcı fallback'i kapalıdır. |
| **`NO_REMOTE_DB_WRITE`** | **`TRUE`** | Uzak Supabase veritabanına otonom yazma yapılmamıştır; bulut staging uygulaması `ADIM-041` insan kapısındadır. |
| **`EXTERNAL_HOLD`** | **AKTİF (`0 TL`)** | Canlı iyzico, e-Fatura, SMS/WhatsApp/SMTP, sunucu AI anahtarları, DNS/SSL ve KVKK/klinik ruhsat onayları `ADIM-043` / `ADIM-044` kapılarında tutulur. |

---

## 4. Sonraki Faz I Adımlarına Devir (`ADIM-041..045`)

1. **`ADIM-041` (Faz I2):** Kanonik kaynak SHA (`29c75164313114f306f49fcf05682aeb83eb1532`) + doc-only mühürleme sonrası gerçek `lari-staging` Supabase projesine 98 migrasyonun (`001..20261012`) uygulanması ve `docs/SUPABASE_STAGING_EXECUTION_RESULT_LOG.md` belgesinin gerçek kanıtlarla doldurulması.
2. **`ADIM-042` (Faz I3):** Uzak staging PG17 yedeğinin bağımsız temiz bir PG17 örneğine geri yüklenip P0 + RLS doğrulamalarının kanıtlanması ve **GitHub Issue #10** blokerinin kapatılması.
3. **`ADIM-043` (Faz I4):** `randevulari.com` DNS/SSL, Vercel ortam değişkenleri ve `paymentless` kilidi doğrulaması.
4. **`ADIM-044` (Faz I5):** `EXTERNAL_HOLD` dış sağlayıcı sözleşmeleri ve mevzuat kapılarının çözülmesi.
5. **`ADIM-045` (Faz I6):** Gerçek pilot salon UAT kabulü sonrası operatör tarafından `PRODUCTION = GO` kesimi.
