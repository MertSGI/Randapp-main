# Batch 01 Yerel Kaynak ve Kanıt İncelemesi (Local Source Review)

**Document ID:** `LARI-DOC-BATCH-01-LOCAL-SOURCE-REVIEW-20261021`  
**İnceleme Durumu:** `LOCAL_SOURCE_REVIEW_READY` (GitHub hosted CI veya Controller accepted iddia edilmez; yerel repo durumu doğrulanmıştır)  
**Tarih / Saat:** 2026-10-21T22:38:45+03:00  
**Çalışma Alanı (Toplevel):** `C:\Projects\LARI-dev247-batch-20261021`  
**Çalışma Dalı:** `work/lari-dev247-batch-20261021`  
**Ürün Atası (Base SHA):** `72911e4fb68dd4f85f7fafef575089104102064e`  
**Mevcut Yerel HEAD:** `56ef7c6d516141a6f8f7535c5fc3373528ddcc14`  

---

## 1. Git Geçmişi ve Ata Doğrulaması

`git merge-base --is-ancestor 72911e4fb68dd4f85f7fafef575089104102064e HEAD` komutu başarıyla doğrulanmıştır (Exit code: 0).

Mevcut yerel dal üzerindeki son 4 commit:
1. `56ef7c6d516141a6f8f7535c5fc3373528ddcc14` | `9d282dd44b4eea252c76ebc96dce791aae9ef345` | `fix(payment): enforce fail-closed client payment mode and checkout gating (WP-C)`
2. `9d282dd44b4eea252c76ebc96dce791aae9ef345` | `cc608dad842a758b9c3dd547c8cc930040e7df04` | `feat(dev-runner): implement durable offline canary control loop and test suite (WP-B)`
3. `cc608dad842a758b9c3dd547c8cc930040e7df04` | `72911e4fb68dd4f85f7fafef575089104102064e` | `feat(lari-program): anchor development program queue and acceptance matrix (WP-A)`
4. `72911e4fb68dd4f85f7fafef575089104102064e` | `679a7734a6020774abe8a3415499ba0de6f38b87` | `fix: make migration checksum verification portable` (Base)

`git status --porcelain=v1` çıktısı boştur; çalışma ağacı tamamen temizdir.

---

## 2. Base'den (72911e4f...) İtibaren Değişen Dosyaların Dökümü

`git diff --name-status 72911e4fb68dd4f85f7fafef575089104102064e..HEAD` çıktısı:
- `M .gitignore` (WP-B: `.lari-dev-runtime/` eklendi)
- `A docs/lari-program/ACCEPTANCE_MATRIX.md` (WP-A)
- `A docs/lari-program/DEVELOPMENT_QUEUE.json` (WP-A)
- `A docs/lari-program/MASTER_DECISIONS.md` (WP-A)
- `M package.json` (WP-B, WP-C: script eklemeleri)
- `M pages/super-admin/SuperAdminGoLivePage.tsx` (WP-C: UI fail-closed ve aktivasyon bekliyor etiketleri)
- `A scripts/lari-dev-runner/adapters.mjs` (WP-B)
- `A scripts/lari-dev-runner/checkpoint.mjs` (WP-B)
- `A scripts/lari-dev-runner/core.mjs` (WP-B)
- `A scripts/lari-dev-runner/index.mjs` (WP-B)
- `A scripts/test-lari-dev-runner.test.mjs` (WP-B)
- `A scripts/test-payment-client-failclosed.mjs` (WP-C)
- `M services/paymentRunModeService.ts` (WP-C)
- `M services/subscriptionService.ts` (WP-C)

---

## 3. Test Kanıtları ve Değerlendirme

### 3.1. Gerçekleştirilen Doğrulama Koşuları
- **`npm run qa:dev247-runner`:**
  - Komut: `node --test scripts/test-lari-dev-runner.test.mjs`
  - Sonuç: `tests 10 | pass 10 | fail 0 | exit_code 0`
- **`npm run qa:payment-client-failclosed`:**
  - Komut: `node --import tsx scripts/test-payment-client-failclosed.mjs`
  - Sonuç: `tests 9 | pass 9 | fail 0 | exit_code 0`

### 3.2. Davranışsal Test ve Statik Kontrol Ayrımı
- `scripts/test-lari-dev-runner.test.mjs`: OS geçici dizini (`os.tmpdir()`) altında sentetik git fixture depoları kurarak disk kilitleme (`open('wx')`), DAG döngü tespiti, process crash sonrası `NEEDS_RECONCILIATION` uzlaştırması ve yetki denetimlerini **gerçek çalışma zamanı nesneleriyle** dinamik olarak test etmektedir.
- `scripts/test-payment-client-failclosed.mjs`: `PaymentRunModeService` ve `subscriptionService.startCheckout()` public API'lerini çağırarak, `getDataSourceMode() === 'supabase'` olduğunda `PAYMENT_SERVER_ACTIVATION_REQUIRED` hatasının fırlatıldığını, `localStorage` üzerinde sahte `mock_subscription` yazılmadığını ve `supabase.functions.invoke` çağrısının yapılmadığını dinamik olarak doğrulamaktadır.
- Eski statik kontroller (`scripts/verify-payment-run-modes.mjs` gibi) ise yalnızca dosyayı okuyup (`fs.readFileSync`) metin içinde belirli anahtar kelimelerin bulunup bulunmadığını denetlemektedir. İki yaklaşım arasındaki fark açıkça belgelenmiştir; yeni testler yüzeysel string araması değil, gerçek işlevsel negatif/pozitif testlerdir.
- Gerçek dış gateway ağ çağrısı ise güvenlik gereği `UNTESTED` (by design requires server provider activation) olarak etiketlenmiştir.
