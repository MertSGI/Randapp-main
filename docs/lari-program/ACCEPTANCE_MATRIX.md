# LARİ Program Kabul Matrisi (Acceptance Matrix)

**Document ID:** LARI-DOC-ACCEPTANCE-MATRIX-20261021  
**Program:** LARİ Platform Geliştirme & Operasyon Kabul Standardı  
**Kanonik Format:** `SOURCE_SHA | changed_paths | test_names | exit_codes | CI_RUN | blocking_issues | next_task`  

---

## 1. Kabul İlkeleri ve Ortam Ayrımı

1. **Ortam Ayrımı:**
   - **QA Fixture Kabulü (Yerel / Sentetik):** İzole dosya sistemleri, bellek içi veri kaynakları, mock sağlayıcılar ve yerel test koşucuları (`node --test`, `npm run lint`, `tsc --noEmit`).
   - **Canlı / Staging Kabulü:** Gerçek Supabase staging veritabanı, RLS politikaları, çok kiracılı gerçek oturumlar, owner onayları ve uçtan uca kullanıcı akışları.
2. **Kayıt ve Kanıt Zorunluluğu:**
   - Hiçbir iş, test çalıştırılmadan ve somut exit code (0) belgelenmeden kabul edilemez.
   - Owner-gated işler (`HOLD_OWNER`), yetkili kullanıcı açık onayı olmadan otomatik olarak tamamlandı ilan edilemez.

---

## 2. 12 Temel Görev Kabul Matrisi

| TASK_ID | KIND | AUTHORITY | RISK | TEST SÖZLEŞMESİ | KABUL TÜRÜ | ÇIKIŞ KRİTERİ (DEFINITION OF DONE) |
|---|---|---|---|---|---|---|
| `DEV247-A` | documentation | autonomous | low | `node -e "JSON.parse(fs.readFileSync('docs/lari-program/DEVELOPMENT_QUEUE.json'))"` | QA Fixture | 3 dosya eksiksiz, JSON geçerli, döngüsüz DAG, exact SHA tescilli |
| `DEV247-B` | native_qa | autonomous | medium | `node --test scripts/test-lari-dev-runner.test.mjs` | QA Fixture | 8+ test vakası PASS, exclusive lock çalışıyor, no side-effects |
| `V1-PAY-GUARD` | security | autonomous | high | `npm run qa:payment-client-failclosed`, `npm run qa:payment-run-modes` | QA Fixture | İstemci fail-closed, localStorage injection engelli, mock write yok |
| `V1-BACKUP-PR3-OWNER` | owner_gate | owner_approval_required | critical | Owner PR incelemesi ve gpg/ci doğrulaması | Canlı / Staging | PR #3 incelemesi, workflow dispatch yetkilendirmesi, zero autonomous dispatch |
| `V1-RESTORE-OWNER` | owner_gate | owner_approval_required | critical | Staging tatbikatı / dry-run script çıktısı | Canlı / Staging | Veri kaybı sıfır kurtarma tatbikatı, RTO <= 60dk, RPO <= 15dk |
| `V1-STAGING-P0-OWNER` | owner_gate | owner_approval_required | critical | Supabase migration dry-run / checksum | Canlı / Staging | Şema göçünün idempotent olması, RLS sızıntısı olmaması |
| `V1-STAGING-E2E` | native_qa | autonomous | medium | `npm run qa:ui-v2-booking-e2e`, `npm run qa:auth-isolation` | Staging / QA | Uçtan uca randevu akışının gerçek staging verisiyle doğrulanması |
| `V1-SOURCE-CONVERGENCE` | integration | owner_approval_required | critical | Git tree diff verification & build clean | Canlı / Staging | Kod tabanının tek bir kanonik commit altında birleştirilmesi |
| `V1-LEGAL-PERSISTENCE` | compliance | autonomous | medium | Legal consent RLS & persistence suite | Staging / QA | KVKK ve onay metinlerinin değiştirilemez şekilde saklanması |
| `V1-COMM-REAL-STATE` | service | autonomous | low | Communication webhook & state test suite | QA Fixture | İletişim bildirimlerinin durum makinesine uygun işlemesi |
| `V1-PILOT` | deployment | owner_approval_required | critical | Pilot salon kabul kontrol listesi | Canlı Pilot | Gerçek pilot salonda randevu ve self-service kabulü |
| `V2-UI-CONVERGENCE` | feature | owner_approval_required | medium | UI-V2 A11y & responsive test suite | QA / Staging | WCAG AA uyumluluğu, tema geçişi kararlılığı |

---

## 3. Kabul Kayıt Şablonu (Kanıt İletişim Standardı)

Her tamamlanan görev çıktısı aşağıdaki kanonik satır yapısıyla raporlanır:

```text
SOURCE_SHA | changed_paths | test_names | exit_codes | CI_RUN | blocking_issues | next_task
```

### Örnek Kayıt:
```text
72911e4fb68dd4f85f7fafef575089104102064e | docs/lari-program/* | json_parse_test, dag_acyclic_test | 0 | LOCAL_VERIFIED | none | DEV247-B
```
