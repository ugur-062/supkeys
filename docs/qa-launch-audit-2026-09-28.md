# Yayın Öncesi Denetim — 2026-09-28

> Kullanıcı: "sistem canlıya çıkacak; kontrol edilmesi gereken her şeyi
> parçalara bölüp sırayla kontrol etmeliyiz, hiçbir nokta açık kalmamalı."
> Bu belge o denetimin TEK kaydıdır: her bölümün kontrol listesi, sonucu,
> kanıtı ve açık kalan maddenin SAHİBİ (Claude · operatör · avukat).
> Önceki tur: `qa-launch-review-2026-09-22.md` (22 Eylül canlı sürümü).
>
> Düzeltme politikası (kullanıcı kararı): açık kusur testiyle doğrudan
> düzeltilir ve buraya yazılır; ürün/hukuk kararı gerektiren sorulur.
> Commit'ler yerelde birikir, push en sonda tek sefer.
>
> Önem: **ENGEL** (yayın yapılamaz) · **YÜKSEK** (yayından önce) ·
> **ORTA** (ilk hafta) · **DÜŞÜK** (backlog).

## Bölüm durumu

| # | Bölüm | Durum |
|---|---|---|
| 0 | Sürüm envanteri | ✅ bitti |
| 1 | Derleme ve statik kapılar | ✅ bitti |
| 2 | Otomatik testler | ✅ bitti |
| 3 | Veritabanı ve migration'lar | ✅ bitti |
| 4 | Yetki ve firma yalıtımı | ✅ bitti |
| 5 | Uygulama güvenliği | ✅ bitti |
| 6 | Çekirdek akışlar uçtan uca | ✅ bitti |
| 7 | Zamanlanmış işler ve e-posta | ⏳ |
| 8 | AI katmanı | ⏳ |
| 9 | Çok dillilik | ⏳ |
| 10 | SEO/GEO | ⏳ |
| 11 | Performans ve kapasite | ⏳ |
| 12 | Arayüz ve erişilebilirlik | ⏳ |
| 13 | Hukuk ve uyum | ⏳ |
| 14 | Altyapı ve operasyon | ⏳ |
| 15 | Yayın günü ve geri dönüş | ⏳ |

---

## Bölüm 0 — Sürüm envanteri (✅ 2026-09-28)

### 0.1 Ortamların anlık durumu

| Ne | Ölçüm |
|---|---|
| Canlı API `api.rothern.com/api/health` | **503** `x-render-routing: suspend` (Render askısı) |
| Staging API `api.staging.supkeys.com/api/health` | **503** aynı |
| Canlı `production` dalı | PR #56, 2026-09-22 14:29 |
| `origin/main` (staging) | 2026-09-26 23:25 — canlıdan 52 commit ileri |
| Yerel `main` | 15 commit push bekliyor (2026-09-26 → 28) |
| Canlı veritabanı | **boş**: 0 firma · 0 kullanıcı · 0 talep · 0 ürün · 2 aktif admin |
| Staging veritabanı | 29 firma · 44 kullanıcı · 302 talep · 345 teklif · 170 sipariş · 110 vitrin ürünü · 1.404 çeviri satırı |

Sonuç: canlıda veri taşıma riski yok denecek kadar düşük (tablolar boş);
migration + veri betiği provası **staging kopyası** üzerinde yapılmalı (Bölüm 3).

### 0.2 Canlıya giden fark

`origin/production..main`: **67 commit · 1.094 dosya · +212.766 / −16.107**
(web 661 · api 295 · i18n 42 · db 32 · shared 25 · admin 17 · email 14).
Konu başlıkları: i18n Faz 0-4 (yönlendirme, panel, API, e-posta, içerik
çevirisi, çok dilli arama) · tüm ülkelere kayıt · dünya şehirleri + ülke
sayfaları · uluslararası tur 2 (21 para birimi, davet dili, VIES) · herkese
açık talepte otomatik bağlantı daveti · e-posta Faz 0-4 (abonelikten çıkış,
davet kuyruğu, AI tedarikçi keşfi, günlük program, büyüme ekranı) · AI'ın
bulduğu üyeye doğrudan davet · Silver/doğrulama teşvikleri.

### 0.3 Migration'lar

| Migration | Canlı | Staging |
|---|---|---|
| `20260923120000_company_user_locale` | ✅ 2026-09-26 | ✅ |
| `20260923180000_content_translations` | ✅ 2026-09-26 | ✅ |
| `20260923230000_category_names_i18n` | ✅ 2026-09-26 | ✅ |
| `20260923235000_category_attribute_names_i18n` | ✅ 2026-09-26 | ✅ |
| `20260924200000_search_text_i18n` | ✅ 2026-09-26 | ✅ |
| `20260927120000_global_registration` | ⏳ | ⏳ |
| `20260927150000_geo_cities` | ⏳ | ⏳ |
| `20260927200000_currency_additions` | ⏳ | ⏳ |
| `20260927200100_international_locale_price_base` | ⏳ | ⏳ |
| `20260927210000_email_opt_outs` | ⏳ | ⏳ |
| `20260927220000_external_listing_invites` | ⏳ | ⏳ |
| `20260927230000_supplier_discovery_runs` | ⏳ | ⏳ |
| `20260927235000_email_digest_items` | ⏳ | ⏳ |
| `20260928090000_ai_member_invites` | ⏳ | ⏳ |
| `20260928170000_referral_invite_cancelled` (Bölüm 5, enum `ADD VALUE`) | ⏳ | ⏳ |

(Kanıt: iki veritabanında `_prisma_migrations` salt-okunur sorgusu.)
Bekleyen 10 migration'ın (9 + Bölüm 5'te eklenen referral iptali) hepsi YEREL commit'lerde → staging de onları push
sonrası ilk açılışta alır.

**Uygulama yolu:** API konteyneri açılışta `migrate deploy` koşar
(`apps/api/docker-entrypoint.sh`). Canlı Render servisi `production` dalını
izler → PR birleşince migration'lar KENDİLİĞİNDEN uygulanır. Yedek
birleştirmeden ÖNCE alınmalı (Bölüm 15). CLAUDE.md'deki "main push → canlı"
uyarısı bayattı, düzeltildi.

**Migration sonrası veri betikleri (sırayla):** `seed-geo-cities` →
`backfill-city-ids` (`--dry` önce) → `backfill-price-base` (`--dry` önce).
Canlı boş olduğu için son ikisi sıfır satır işler; `seed-geo-cities` zorunlu
(yoksa yabancı şehir sayfaları 404, şehir seçici yalnız TR+KKTC).

**Yeni tablolar (7):** `content_translations`, `geo_cities` (küresel) ·
`email_opt_outs` (adres bazlı) · `external_listing_invites`,
`supplier_discovery_runs`, `supplier_discovery_candidates`,
`email_digest_items` (firma verisi). Hiçbirinde RLS yok; `rothern_app`
yetkisi migration'larda var → Bölüm 3'te doğrulanacak.

### 0.4 Yeni API uçları (18) → Bölüm 4/5 kontrol listesi

Herkese açık (kimliksiz):
`GET /public/email/unsubscribe` · `POST /public/email/unsubscribe` ·
`GET /public/geo/cities` · `GET /public/geo/cities/:slug` ·
`GET /public/invite-preview` · `POST /public/referral-visit`

Firma (Gold + `buy:listing:manage`):
`GET /company/ai/supplier-discovery/listings/:listingId` ·
`POST …/:listingId/dismiss` · `POST …/:listingId/invite` ·
`POST …/:listingId/invite-members`

Admin: `GET /admin/growth/invites` · `GET /admin/content-translations/status`
· `…/categories/status` · `…/categories/attributes/status` ·
`POST /admin/content-translations/backfill` · `…/categories/backfill` ·
`…/categories/attributes/backfill` · `…/search-text/rebuild`

Kaldırılan uç yok. (Mevcut uçların DTO/davranış değişiklikleri Bölüm 4'te
değişen controller diff'inden taranır.)

### 0.5 Zamanlanmış işler → Bölüm 7 kontrol listesi

Toplam **19 `@Cron`** (canlıda 15). Yeni 4: `discovery.runs` (dakikalık),
`external-invite` gönderici (dakikalık), içerik çevirisi süpürücü (5 dk),
`emailPrograms.tick` (15 dk). **Bulgu B0-4:** `company-views.scheduler.ts`
içindeki 2 iş (`purge`, `replyTimes`) `trackCronRun` sarmalayıcısından
GEÇMİYOR → kilitsiz ve cron kaydında/uyarılarda görünmez (iki iş de
idempotent; çift koşum zararsız, sorun gözlemlenebilirlik). CLAUDE.md
"15 iş, hepsi sarmalayıcıdan" diyordu → düzeltildi, iş Bölüm 7'de.

### 0.6 Yeni e-posta türleri → Bölüm 7

Yeni şablon `tender-invite-digest`; yeni bağlam tipleri
`listing_invitation_ai`, `listing_ai_match_locked`, `listing_category_digest`,
`listing_invitation_digest`, `listing_zero_bid`, `ai_supplier_suggestions`,
`lifecycle_*` (profil · ilk ürün · doğrulama · pazar · 2. doğrulama · Silver
· haftalık), `tender_external_invite` (kuyruk), `tender_invite_digest`.
Tam liste Bölüm 7'de şablon kataloğundan çıkarılacak.

### 0.7 Yeni herkese açık web sayfaları

`/e-posta-tercihleri` · `/talep-davet` · `/urunler/ulke/[ulke]` (+ i18n ile
tüm sayfalar `[locale]` altına taşındı; EN/RU yolları).

### 0.8 Env değişkenleri → Bölüm 14 matrisi

API — yeni okunanlar (hepsi İSTEĞE BAĞLI, varsayılanlı):
`AI_DISCOVERY_DAILY_USD` (vars. 15) · `COLD_INVITE_BASE_DAILY` (150) ·
`COLD_INVITE_MAX_DAILY` (5000) · `EMAIL_FROM_ADDRESS_{NOTIFICATION,INVITE,
LIFECYCLE}` (boşsa `EMAIL_FROM_ADDRESS`) · `CONTENT_TRANSLATION_MODEL` ·
`VIES_AUTO_CHECK` (vars. açık). Artık okunmayan: `ANTHROPIC_API_KEY`
(Render'dan silinebilir).

`render.yaml`da OLMAYAN ama canlıda doğru değer taşıması gerekenler
(panelden teyit, Bölüm 14): `MARKETPLACE_LIVE=true` · `CORS_ALLOW_VERCEL`
(boş/false) · `ALLOW_INSECURE_WEBHOOK` (YOK olmalı) · `PREMIUM_SELF_UPGRADE_
ENABLED` (boş) · `VIEW_HASH_SALT` (yoksa `JWT_SECRET`e düşer) ·
`INDEXNOW_HOST` · `THROTTLE_*`.

Vercel (ölçüldü, `vercel env ls`): web production `INDEXNOW_KEY ·
NEXT_PUBLIC_{API_URL,CDN_URL,MARKETPLACE_LIVE,SITE_URL} · SENTRY_* ·
SEO_REVALIDATE_SECRET`; `NEXT_PUBLIC_{GOOGLE,BING,YANDEX}_SITE_VERIFICATION`
yok (bilinçli, en son). Admin production `NEXT_PUBLIC_API_URL · SENTRY_*`;
`NEXT_PUBLIC_WEB_URL` yok → kod varsayılanı `https://www.rothern.com` (canlı
için doğru). **B0-6 (DÜŞÜK, staging):** admin preview'da da yok → staging
admin'in "ürünü sitede aç" bağlantısı CANLI siteye gider.

### 0.9 Paketleme

`@rothern/i18n` canlı için YENİ paket: Dockerfile (manifest + build sırası
shared → i18n → email → db → api) ✅ · web `vercel.json` buildCommand ✅ ·
jest `moduleNameMapper` ✅ · admin i18n kullanmıyor ✅.
**B0-5 (DÜŞÜK):** web ve admin `vercel.json` `installCommand` →
`--no-frozen-lockfile`; Docker imajı `--frozen-lockfile`. Vercel derlemesi
lockfile'dan sapabilir → Bölüm 1'de değerlendirilecek.

### 0.10 Bölüm 0 bulguları

| # | Önem | Bulgu | Durum |
|---|---|---|---|
| B0-1 | ENGEL | Canlı + staging API askıda (503) | operatör — Render faturası (1 Ekim) |
| B0-2 | ORTA | CLAUDE.md "main → canlı" ve "15 cron" bayat | ✅ düzeltildi |
| B0-3 | bilgi | Migration'lar API açılışında otomatik → yedek birleştirmeden önce | Bölüm 15 runbook |
| B0-4 | DÜŞÜK | `company-views` 2 cron sarmalayıcısız | Bölüm 7 |
| B0-5 | DÜŞÜK | Vercel kurulumu frozen değil | Bölüm 1 |
| B0-6 | DÜŞÜK | Staging admin `NEXT_PUBLIC_WEB_URL` yok | operatör (Vercel preview env) |

---

## Bölüm 1 — Derleme ve statik kapılar (✅ 2026-09-28)

| Kontrol | Sonuç | Kanıt |
|---|---|---|
| Tip denetimi (turbo, 10 görev: api · web · admin · db · shared · email · i18n) | ✅ | `pnpm typecheck` EXIT 0; `@rothern/i18n typecheck` ayrıca 0 |
| Lint (api · web · admin) | ✅ 0 hata · 28 uyarı (kullanılmayan import/değişken, 1 `<img>`) | `pnpm lint` EXIT 0 |
| i18n kapısı | ✅ 7.578 anahtar; EN %100 · RU %100 (eksik/bayat 0); cırcır 102 dosya / 865 literal = taban | `pnpm i18n:check` |
| Bağımlılık denetimi (üretim, yüksek+) | ✅ 0 kritik · 0 yüksek (6 orta · 3 düşük — 22 Eylül'le aynı, bilinçli ertelenen ana sürüm göçleri) | `pnpm audit --prod --audit-level high` EXIT 0 |
| Sır taraması (tüm geçmiş) | ✅ 1.905 commit, sızıntı yok | `gitleaks git` |
| Depoda sır dosyası | ✅ yalnız `*.example` + `apps/api/.env.test` (yerel test fikstürü); `.env`, `.env.prod.local`, `.env.staging`, `render.staging.env`, `CLAUDE.md.local` gitignore'da | `git ls-files` + `git check-ignore` |
| Admin üretim derlemesi | ✅ | `next build` EXIT 0 |
| Web üretim derlemesi (pazar yeri açık, API ERİŞİLEMEZ) | ✅ EXIT 0 — ama bkz. B1-1 | `next build` |
| API Docker imajı | ✅ tüm derleme adımları (shared → i18n → email → prisma → api `tsc`) + dışa aktarım tamam; ardından Docker Desktop WSL bağlantısı çöktü (SIGBUS, makine tarafı) | `docker build -f apps/api/Dockerfile` |
| CI kapıları | ✅ `test.yml` her PR'da: frozen lockfile, typecheck, lint, audit, şema drift, i18n, web+admin test, build, API test | `.github/workflows/test.yml` |

B0-5 değerlendirmesi: Vercel `--no-frozen-lockfile` ile kurar ama `production`a
giden her PR CI'da `--frozen-lockfile` + derlemeden geçmek zorunda → lockfile
sapması CI'da yakalanır. Değiştirilmedi (Vercel'in pnpm sürümüyle frozen kurulum
denenmeden değiştirmek canlı derlemeyi kırabilir). **DÜŞÜK, kapandı.**

### Bölüm 1 bulguları

| # | Önem | Bulgu | Durum |
|---|---|---|---|
| B1-1 | ORTA | **Veri katmanı API kesintisini "boş veri" sayıyor.** `lib/public/marketplace-api.ts` `getJson` ağ hatası/5xx'te boş yedek döner; `fetchProduct/fetchCompanyProfile/fetchListing` `null` → sayfa `notFound()`. ISR yenilemesi API kesintisine denk gelirse dolu sayfa BOŞ sürümle ya da **404** ile değişir ve `revalidate` süresince (60 sn – sitemap 1 saat) öyle kalır. Next, yenileme sırasında HATA atılırsa son iyi sürümü sunmaya devam eder — doğru davranış bu. Derleme sırasında API kapalıysa (Render askısı!) canlı derleme boş sayfalarla çıkar. | Bölüm 10'da düzeltilecek (yerel yığında API kapatılarak sınanacak) |
| B1-2 | DÜŞÜK | 28 lint uyarısı (ölü importlar; ör. `company-profile.service.ts` artık `public-image-upload.ts` doğrulamasını kullanıyor, eski `assertUploadedObjectValid` importu kalmış — güvenlik açığı DEĞİL) | backlog |

---

## Bölüm 2 — Otomatik testler (✅ 2026-09-28)

| Paket | Sonuç | Not |
|---|---|---|
| Web (vitest) — TZ=UTC | 175 dosya / 1.039 test; ilk koşumda 17 kırmızı → tek başına yeniden koşumda **1 gerçek hata** (aşağıda B2-1, düzeltildi), 16'sı yük kaynaklı 15 sn zaman aşımı | admin testleriyle eşzamanlı koşuldu |
| Web (vitest) — TZ=Europe/Istanbul | 174/175 dosya, 1.038/1.039 — tek kırmızı `signup-client` zaman aşımı; tek başına 3/3 yeşil, test 1,7 sn | makine yükü (WSL 6,7 GB) |
| Admin (vitest) | ✅ 19 dosya / 98 test | |
| i18n | ✅ 8 dosya / 39 test | |
| API birim (`test/unit`, DB'siz) | ✅ 96 dosya / 976 test | `--globalSetup` boş |
| API entegrasyon (`test/integration`, 137 dosya) | ✅ 135 dosya / 1.429 test; 2 dosya atlandı (`ai-assistant-live`, `ai-live-smoke` — gerçek AI anahtarı ister, bilinçli) | yerel Docker PG 17; 10'arlık `--runInBand` parçalar; Bölüm 4 düzeltmeleri (b0fff87f, b9ef1089) ve yeni testleri dahil, sıfır kırmızı |

### Bölüm 2 bulguları

| # | Önem | Bulgu | Durum |
|---|---|---|---|
| B2-1 | YÜKSEK | `lib/tenders/__tests__/request-defaults.test.ts` tarihi ofsetsiz kuruyordu (`new Date("2026-09-09T10:00:00")`); kod İstanbul duvar saatiyle yazdığı için **UTC'de kırmızı** → CI çalıştırıcısı UTC olduğundan `production` PR'ı kırmızı olurdu | ✅ `+03:00` ofset; UTC / İstanbul / New York'ta yeşil (b4079ecb) |
| B2-2 | DÜŞÜK | Web paketi bu makinede tam paralel koşumda 15 sn zaman aşımına düşüyor (formlu testler) | bilinen; CI'da sorun yok |

---

## Bölüm 3 — Veritabanı ve migration'lar (✅ 2026-09-28)

Yöntem: staging `public` şeması **salt-okunur** `pg_dump` ile alındı
(`default_transaction_read_only=on`; 5,9 MB — aynı zamanda migration öncesi
staging yedeği: `~/rothern-backups/staging-before-launch-migrations-20260928.dump`)
→ yerel PG 17 kopyasına yüklendi (staging'deki gibi sahip `postgres`; roller
`anon`/`authenticated`/`service_role`/`supabase_admin`/`rothern_app`;
`pg_trgm` `public`te) → migration'lar Render'ın koşacağı yolla, yani
**`rothern-api:audit` imajının kendi entrypoint'iyle** uygulandı. Canlı DB boş
(0 firma) olduğu için dolu staging kopyası daha sert prova.

| Kontrol | Sonuç | Kanıt |
|---|---|---|
| Kopya | 60 tablo · 34 RLS politikası · 29 firma · 158.018 kategori · son migration `20260924200000_search_text_i18n` | tek hata beklenen "schema public already exists" |
| 9 migration, gerçek entrypoint | ✅ dokuzu da uygulandı, `_prisma_migrations`ta yarım/geri alınmış 0; nöbetçi `ALLOW_REMOTE_MIGRATION=1` ile geçti; entrypoint API açılışına ilerledi (yalnız `JWT_SECRET` eksik → beklenen) | konteyner günlüğü |
| `rothern_app` yetkileri | ✅ 7 yeni tablonun hepsinde SELECT/INSERT/UPDATE/DELETE; staging'de 60/60 tablo + 2 dizi (`anon` ile birebir; fark yalnız `supabase_admin` varsayılan yetkileri) | `has_table_privilege` |
| `seed-geo-cities` | ✅ 33.804 şehir (87 özel), ~10 sn; ikinci koşum idempotent (listeden düşen 0) | |
| `backfill-city-ids` | ✅ `--dry` 27/27 firma · 306/306 adres → uygulandı → ikinci `--dry` 0/0 | |
| `backfill-price-base` | ✅ (B3-2 ile) `--dry` 71 değişen → uygulandı → ikinci `--dry` 0; kur tablosunda 8 birim (2026-09-25) | |
| Şema ≡ veritabanı | ✅ (B3-1 ile) migration'lı staging kopyası ↔ `schema.prisma` fark yok; CI drift kapısı `exit 0` | `prisma migrate diff --exit-code` |

### Bölüm 3 bulguları

| # | Önem | Bulgu | Durum |
|---|---|---|---|
| B3-1 | YÜKSEK | **CI drift kapısı kırmızıydı (`exit 2`):** `geo_cities_searchText_trgm_idx` migration'da ham SQL, `schema.prisma`da beyan yok. Kapı `Test (api + typecheck)` işinde = `production` dal korumasının zorunlu kontrolü → yayın PR'ı birleştirilemezdi (bekleyen commit'ler henüz push edilmediği için CI görmemişti). Ayrıca ilk `migrate dev` indeksi silen migration üretirdi. | ✅ `GeoCity`e `@@index(… gin_trgm_ops, map: "geo_cities_searchText_trgm_idx")` (diğer trigram indeksleriyle aynı kalıp); CI kapısı ve staging kopyası `exit 0` |
| B3-2 | DÜŞÜK | `backfill-price-base` env dosyasını ZORUNLU okuyordu → API konteynerinde/Render kabuğunda `ENOENT` ile çöküyordu (yerelden `ENV_FILE=../../.env.prod.local` yolu çalışıyordu) | ✅ varsayılan dosya yoksa ortam değişkenleriyle çalışır; açıkça verilen `ENV_FILE` yoksa yine düşer (konteynerde iki durum da sınandı) |
| B3-3 | DÜŞÜK | Yeni firma verisi tabloları (`external_listing_invites`, `supplier_discovery_runs/_candidates`, `email_digest_items`) RLS'siz — yalıtım yalnız servis süzgeçlerinde (CLAUDE.md mimari kural 2). | backlog: politika eklemek bu turda düzeltilen hata sınıfını (bağlamsız cron'da 0 satır) yeni tablolarda yeniden üretir; yayından sonra `rls-regression-*` kalıbıyla birlikte ele alınmalı |

---

## Bölüm 4 — Yetki, firma yalıtımı, gizlilik (✅ 2026-09-28)

Yöntem: üç paralel inceleme (4A uç yetkileri · 4B RLS/bypass · 4C veri
sızıntısı) + her bulgu kodda elle doğrulandı. Ayrıntılı raporlar oturum
çalışma alanında (`part4a-authz.md`, `part4b-rls.md`, `part4c-exposure.md`).
`company-permission-drift.spec` 217/217 (yeni `DiscoveryRunsController` dahil).

### Düzeltilenler (b0fff87f)

| # | Önem | Bulgu | Düzeltme |
|---|---|---|---|
| B4-1 | YÜKSEK | `POST company/ai/supplier-discovery` + başka firmanın talep id'si → `alreadyInvited` o talebin davetlilerini sızdırıyordu (kapalı zarf / rekabet istihbaratı). Talep id'leri Açık Talepler'de görünür. | davetli kümesi yalnız sahiplik süzgecinden geçen talepte okunur + entegrasyon testi |
| B4-2 | ORTA | Günlük 60 davet tavanı tek yönlü ortaktı (önce 60 üye, sonra 60 e-posta = 120) | e-posta yolu AI üye davetlerini de sayar + ters yön testi |
| B4-3 | ORTA | Askıya alınan firmanın kuyruktaki davetleri "X (Rothern üzerinden)" adıyla gitmeye devam ediyordu | gönderici `sendableListingWhere`: sahip etkin ∧ askısız; iptal değil bekletme + test |
| B4-4 | ORTA | E-posta regex'i ikinci dereceden (20 bin karakter 0,18 sn; 1 MB ≈ dakikalar; gövde sınırı 5 MB) — dış davet `emails[]` sınırsızdı; aynı kalıp AI keşfi (model çıktısı), admin e-posta değişikliği ve `isValidEmailLike`da | `EMAIL_MAX_LENGTH` ön koşulu (shared) + DTO `@MaxLength(200, each)` + `listingId` 40 + birim testi |
| B4-5 | ORTA | Embargolu (`bidsOpenAt` gelecekte) talebin kalemleri dış davetle açılıştan önce gidiyordu | gönderici ve hatırlatma embargoyu bekler + test |
| B4-6 | ORTA | Davet önizlemesi (`public/invite-preview`): jeton davet eden × adres için ortak → aynı jetonla KUYRUKTAKİ (henüz gitmemiş) davetin talebi, embargolu talep, moderasyonla kapatılmış (CLOSED) / iptal / onay bekleyen talep okunabiliyordu | yalnız `state=SENT` ∧ vitrin durumu (`MARKETPLACE_STATUSES`) ∧ embargo geçmiş + test |
| B4-7 | ORTA | `?ref=` davet jetonu API erişim günlüğüne ve web Sentry olaylarına düz metin | `maskSensitiveUrl` + `scrubUrl` listelerine `ref` + testler |
| B4-8 | ORTA | Tek tık çıkış (RFC 8058) web rotasından Vercel IP'siyle gelir → tüm çıkışlar tek 30/dk kovası; toplu gönderim sonrası/selde meşru çıkış 429 (Gmail/Yahoo kuralı) | çıkış uçları 600/dk (jeton AES-GCM, kaba kuvvet riski yok) |
| B4-9 | DÜŞÜK | Herkese açık sözleşme testinin yasaklı anahtarlarında sahip kimliği/davet ayarları yoktu | `companyId`, `rothernId`, `inviteShowName`, `aiDiscovery`, `company.id` eklendi |

### Değerlendirilip kapatılanlar (değişiklik yok)

- `IN_APPROVAL` talebe davet (4C kapsam dışı notu): yayın onayı akışı
  (`LISTING_PUBLISH`) artık ÜRETİLMİYOR, yalnız eski kayıtlara geriye uyum →
  pratikte oluşmaz. Geçici değişiklik geri alındı.
- İçerik çevirisi `status` uçları SUPPORT'a açık: dekoratörde bilinçli, yalnız sayı döner.
- Unsubscribe jetonu (AES-256-GCM, alan ayrımlı anahtar, rastgele IV), GET
  salt-okur, jetonsuz POST red — doğru. `referral-visit` yalnız jetonun gittiği
  adresin kendi bilgisini döner. Herkese açık talepte alıcı kimliği yok; kilitli
  AI e-postasında kimlik/bağlantı yok; `aiReason` yalnız davetlinin kendi ürün adı.

### Açık kalan DÜŞÜK maddeler (backlog, gerekçeli)

| # | Bulgu | Neden şimdi değil |
|---|---|---|
| B4-10 | Günlük tavan sayımı ile yazma arasında kilit yok (paralel istekle 60 birkaç aşılabilir) | tavan kötüye kullanım freni; platform soğuk davet tavanı ayrıca korur |
| B4-11 | `invite-members` keşif sonucundan gelmeyen firma id'sini de kabul eder | sunucu uygunluğu (Silver+ ∧ doğrulanmış ∧ ülke ∧ engel) yeniden denetliyor; etki = Gold alıcının uygun firmayı bağlantısız davet etmesi |
| B4-12 | Dış davette `source` istemciden; MANUAL işaretlenen AI adresi DE/CA onay kapısını ve 7 gün frenini atlar | web doğru gönderiyor; kötü niyetli istemci senaryosu → Bölüm 13 hukuk notu |
| B4-13 | `recentlyInvited` bayrağı alıcıya adresin son 7 günde başka alıcıdan davet aldığını söyler | kimlik yok, zayıf sinyal |
| B4-14 | Kayıtta talep davetleri e-posta doğrulanmadan hesaba bağlanır (adres işgali) | doğrulanmamış hesap giriş yapamaz |
| B4-15 | Davet jetonları `cuid()` (kriptografik değil, ~41 bit rastgele) | çevrim içi tahmin hız sınırıyla pratik değil |
| B4-16 | AI'ın web'den bulduğu üçüncü kişi e-postaları süresiz saklanıyor | Bölüm 13 (KVKK saklama süresi) |
| B4-17 | Özel talepte otomatik keşif kapalı kuralı sunucuda zorlanmıyor | etki yalnız alıcının kendisine öneri |
| B4-18 | Davet önizlemesinde 30 günlük ömür yok | jeton zaten kayıtta bağlantı verir (daha güçlü yetki) |

### RLS — canlıda var olan hata sınıfı (✅ tarandı, düzeltildi — b9ef1089)

Kök: canlıda RLS 2026-09-17'den beri açık. `PrismaService` kısıtlı
`rothern_app` rolüyle bağlanır; firma bağlamında yalnız çağıranın görebildiği
satırlar döner, bağlamsız işlerde (cron, admin, herkese açık uç) 29 kısıtlı
tablonun HİÇBİR satırı görünmez (politikalar staging `pg_policies`ten okundu:
29 kısıtlı, 5 açık — companies, company_users, company_user_invitations,
listings, notifications). E2e paketi bunları yakalamadı: testler tek aktörlü
ekranlara ya da sahip görünümüne bakıyordu.

Yöntem: tüm API üç parçada tarandı (talep/sipariş · admin/sistem ·
bağlantı/pazar yeri); kısıtlı tabloya giden her kiracı-istemci işlemi bağlamı
ve hükmüyle sınıflandırıldı (yalnız talep/sipariş parçasında 174 işlem).
Admin servislerinin tamamı zaten bypass kullanıyor — admin paneli temiz.

| # | Önem | Belirti (canlıda olacaktı) | Düzeltme |
|---|---|---|---|
| R-1 | YÜKSEK | Pazarlıkta teklifçi yalnız kendi teklifini görüyor: "en iyi fiyat" kendi fiyatı, sırası hep 1 | `computeAuctionView` + açık eksiltme özeti bypass (teklifçiye dönen alanlar görünürlük kapısından geçmeye devam eder) |
| R-2 | YÜKSEK | Panelde başka firmanın profili, firma üçüncü firmadan değerlendirme aldıysa **500** (zorunlu `order` ilişkisi görünmez → Prisma istisnası); ürün ızgarası boş, sayaç 0 | `getProfile` değerlendirme + ürün okumaları bypass; `reviews.listForCompany` de |
| R-3 | YÜKSEK | Teklif verebilen tedarikçi teslim adresini hep boş görüyor | adres okuması bypass (yanıta yalnız `canBid` iken) |
| R-4 | YÜKSEK | Admin onayladığında ürün IndexNow'a ve web tazelemesine hiç girmiyor; çeviri bitince EN/RU sayfaları tazelenmiyor; reddedilen ürün süre dolana dek yayında | `SeoIndexService` bypass istemcisiyle |
| R-5 | ORTA | Onaylayıcı kalmayınca otomatik ret cron'da 0 satır günceller → istek PENDING, talep kazandırma onayında takılı | `rejectForNoApprover` bypass |
| R-6 | ORTA | Cron yollarında engel listesi boş → engellenen firmaya kapanış, hatırlatma, davet, kategori duyurusu, "bir alıcı arıyor" e-postası | `blockedCompanyIds` bypass |
| R-7 | DÜŞÜK | Cron yollarında bağlantı listesi boş (bugün başka süzgeçler örtüyor) | `connectedCompanyIds` bypass |
| R-8 | DÜŞÜK | Bağlantı kartı ürün önizlemesi hep boş (web çizmiyor, asistan görüyor) | bypass |

Birim paketi yeniden: 97 dosya / 979 test yeşil.

**Regresyon testleri (✅):** `test/integration/rls-regression-{listings,profile,system}.spec.ts`
— 33 test, servisler CANLI kablolamayla kurulur (PrismaService yuvasında kısıtlı
`rothern_app` + RLS uzantısı, bypass yuvasında sahip istemci; `@Optional`
bypass'lı servisler ve `SeoIndexService` gerçek `PrismaModule` DI'ıyla). Her
test kanıt çifti: canlı kablolama doğru sonucu, iki yuvada kısıtlı istemci
düzeltme öncesi belirtiyi (kendi fiyatı/sıra 1, boş adres, 500, boş ızgara,
PENDING'de takılı onay, engelliye giden e-posta, hiç gitmeyen IndexNow)
üretir. Görünürlük kapıları (auctionView, canBid, fatura adresi/vergi no,
başka firmanın adres id'si, vitrini kapalı firma) SIZDIRMAZLIK testiyle
kilitli. **Duyarlılık kanıtı:** b9ef1089'un 11 düzeltme noktası TEK TEK geri
alındı → her birinde ilgili testler kırmızı (1–6 test), geri yüklenince 33/33
yeşil. Tek istisna niteliğinde nokta: açık eksiltme özeti okuması (`englishAgg`)
kullanıcıya görünür belirti üretmez (teklifçide `auctionView`dan ezilir, sahip
politikanın sahip koluyla görür) → kablolama testiyle korunur.

Açık kalan DÜŞÜK (backlog):
- R-9: firma bağlamında `this.prisma.$transaction(async tx => …)` içindeki
  model işlemleri RLS uzantısı yüzünden etkileşimli işlemden kaçıp ayrı
  işlemlerde koşuyor (atomiklik yok; ürün yayın tavanındaki advisory lock
  etkisiz — CLAUDE.md'deki "publish tavanı TOCTOU" notunun kökü). Yerler:
  `company-items.service.ts` `publish`, `assistant.service.ts` dizi
  `$transaction`. Kural `docs/rls-plan.md` 1c-2: firma bağlamında `runTenantTx`.
  Bölüm 14: Render `DATABASE_URL` havuzu (`connection_limit`) ≥ 5 olmalı —
  1 olursa bu yollar havuzu kilitler.
- R-10: teklifçi bağlamında `blockedCompanyIds(sahip)` ve `inOwnerContext`
  bugün doğru ama kırılgan (bypass'a geçti; `inOwnerContext` çağıranı
  teklifçi olursa sessizce teklifçi bağlamında okur).

---

## Bölüm 5 — Uygulama güvenliği (✅ 2026-09-28)

Yöntem: canlıya giden fark (`origin/production...HEAD`, 76 commit) yedi
mercekle tarandı (enjeksiyon/toplu atama · SSRF/yönlendirme · XSS/başlık ·
herkese açık uç ve kota kötüye kullanımı · kripto/yapılandırma/günlük · AI
güven sınırı · istemci tarafı); her bulgu iki bağımsız şüpheciyle (kod gerçeği
+ sömürülebilirlik) doğrulandı, tamamlayıcı tur alt ajan sınırına takıldı.
Doğrulayıcısı sınıra takılan 7 bulgu elle doğrulandı. Ham sonuç:
`~/rothern-audit-2026-09-28/part5-appsec.{json,md}`. Her düzeltme testli;
kırmızı/yeşil duyarlılığı eski koda karşı sınandı.

| # | Önem | Bulgu | Düzeltme |
|---|---|---|---|
| B5-1 | YÜKSEK | Davet DTO'larında `ValidateIf` koşulları birbirine `=== undefined` ile bakıyordu: `{ emails: [...], invites: null }` iki alanın TÜM doğrulamasını atlatıyor, tek istek on binlerce adrese Rothern daveti attırabiliyordu; toplu davet gönderimi hazırlıktan SONRA olduğu için günlük 50 tavanı parti içinde sayılmıyordu (49 + 50 = 99) | gönderilen alan (null dahil) her zaman doğrulanır; serviste DTO'dan bağımsız 50 parti tavanı + parti içi rezervasyon (b448f201) |
| B5-2 | YÜKSEK | İçerik çevirisi platformun Pro anahtarıyla, firma bütçesi/günlük tavan/eşzamanlılık sınırı olmadan koşuyordu; ücretsiz hesap ürün yayınla/geri çek döngüsüyle, profil kaydıyla ya da 5 MB'lık nitelik değeriyle sınırsız çağrı yaktırabiliyordu; aynı kaynakta başarısız çeviri her kayıtta sıfırlanıp yeniden deneniyordu | kaynak > 24.000 karakterde model çağrılmaz; firma başına 150 iş/gün + platform 20 USD/gün (env, 0 = durur); aynı kaynakta sayaç sıfırlanmaz; 4 eşzamanlı; nitelik değeri metin ≤200 / liste ≤50 (bb2cdf56) |
| B5-3 | YÜKSEK | Ekip daveti: görüntüleme izinli davet koltuk tüketmez, yeniden gönderim beklemesiz → ücretsiz hesap rastgele adreslere (konuda kendi seçtiği firma adıyla) sınırsız e-posta, üstelik doğrulama kodu/şifre sıfırlama ile AYNI işlem göndereninden | firma başına günde 20 davet e-postası, aynı davete 10 dk'da bir; sayım e-posta kayıtlarından (3220c020) |
| B5-4 | ORTA | Referral davet iptali satırı SİLİYORDU → günlük dış/referral tavanı, 7 günlük fren ve (cascade) gönderilmiş talep davetleri sıfırlanıyordu; sil-yeniden-gönder döngüsü | enum `CANCELLED` (migration `20260928170000`, eklemeli); iptal kuyruğu düşürür, jeton önizleme açmaz, yeniden davet aynı satırla (a6a31dbd) |
| B5-5 | ORTA | Kayıt sonrası açık yönlendirme: `?redirect=/\evil.com` (ve sekme/satır sonlu yollar) `//` denetimini geçiyordu | `safeRedirect` sıkılaştı, kayıt niyetinin kopyası tek kaynağa bağlandı (b448f201) |
| B5-6 | ORTA | Dış site çekimi (profil AI doldurma, marka bilgisi, görsel): zamanlayıcı gövde okunmadan temizleniyor, gövde tamamen belleğe alınıyordu; SSRF kapısı host metnine kalıpla bakıyordu (`[::ffff:127.0.0.1]`, `[::]`, `localhost.`, özel IP'ye çözülen alan adı geçiyordu) | akışlı okuma + bayt tavanı + süre; IP-literal normalizasyonu + her adımda DNS çözümlemesi (66e7628c). DNS rebinding'i tam kapatmak özel HTTP ajanı ister — bilinçli sınır |
| B5-7 | ORTA | B4-7 eksikti: pino serileştiricisi `query`yi de yazıyor, API Sentry'si `query_string`/`url`i maskesiz gönderiyordu → `?ref=`/`?t=` jetonları günlükte/Sentry'de | aynı jeton kuralı sorgu nesnesi ve ham sorgu dizesine (a2b16b18) |
| B5-8 | ORTA | Herkese açık uçlar `s-maxage` taşıyor, yanıt `Accept-Language`a göre değişiyor, `Vary` yalnız geo ucundaydı | `LocaleMiddleware` her yanıta `Vary: Accept-Language` (344bf634). **Operatör (Bölüm 14):** Cloudflare `Vary`'yi anahtara katmaz — `api.rothern.com/api/public/*` için önbellek kuralı OLMADIĞI teyit edilmeli |
| B5-9 | DÜŞÜK | Web: Rusça davet yolu (`/ru/kompaniya/priglashenie/<jeton>`) Sentry'den süzülmüyordu; `/api/client-error` tavanı istemcinin gönderdiği `cf-connecting-ip` ile atlatılabiliyordu; çıkış hızlı talep taslağını / AI'ın bulduğu adresleri / davet ön doldurmayı silmiyordu (ortak bilgisayarda sonraki hesaba) | yerelleştirilmiş yollar süzülür, sunucu da süzer; IP Vercel başlığından + toplam tavan; çıkış ve kullanıcı değişiminde firma verisi silinir (1343f135) |
| B5-10 | DÜŞÜK | Sitemap'te XML'de yasak karakter tüm parçayı bozuyordu; OG kartı dış görsel adresini sunucudan çekiyordu; soğuk davet env'inde `0` yok sayılıyordu | (51d1359b) |

### Açık kalan (backlog, gerekçeli)

| # | Bulgu | Neden şimdi değil / sahibi |
|---|---|---|
| B5-11 (ORTA→Bölüm 8) | AI keşfi üye eşleşmesi üyenin DÜZENLENEBİLİR `website`ına bakıyor: Silver+ doğrulanmış bir üye sitesini rakibin alan adına çevirirse AI'ın bulduğu rakip adayı "Rothern'de kayıtlı: <saldırgan>" olur ve davet saldırgana gider (tek doğrulayıcı onayı) | alıcı adı görüyor; kalıcı çözüm alan adı sahipliği doğrulaması — Bölüm 8'de karar |
| B5-12 (Bölüm 8/13) | DE/CA önceden onay kapısı modelin `country` etiketine dayanıyor (etiket yoksa geçiyor) | hukuk görüşü bekleniyor; e-posta uzantısı yedeği Bölüm 13 ile |
| B5-13 | Çeviri istemi içerik için "veri, talimat değil" çerçevesi taşımıyor; model kaynak dili yanlış bildirirse TR sayfada moderasyondan geçmemiş çeviri görünebilir | moderatör gözden kaçırması gerekir; istem sürümü artırılmadan Bölüm 8'de ele alınacak |
| B5-14 | Keşif günlük USD tavanı başarısız/süren turları saymıyor; soğuk davet ısınması takvim haftasıyla ikiye katlanıyor (gönderilen hacimle değil) | tavan zaten 15 USD; hacim Bölüm 7 ölçümünde |
| B5-15 | E-posta adres normalizasyonu harfi harfine (`+etiket`, Gmail noktası) — çıkış/fren adres bazlı | alıcı kendi eşdeğer adresine yeniden çıkış verebilir; Bölüm 7 |
| B5-16 (Bölüm 14) | `EMAIL_FROM_ADDRESS_INVITE` boşsa soğuk davet işlem göndereninden gider; çıkış jetonu anahtarı `JWT_SECRET`ten türer (döndürülürse gönderilmiş çıkış bağlantıları kırılır) | operatör env matrisi |
| B5-17 (Bölüm 13) | Soğuk davet/bastırma günlük satırları üçüncü kişi adresini yazıyor | KVKK saklama kararıyla birlikte |
| — | `source` istemciden (B4-12), bağlantıyı açan adresin fren muafiyeti | bilinen tasarım kararları (Bölüm 4) |

---

## Bölüm 6 — Çekirdek akışlar uçtan uca (✅ 2026-09-28)

Ortam (staging API Render askısında olduğu için yerel, canlı kablolamasıyla):
API `node dist/main.js` · **RLS açık**, kısıtlı `rothern_app` + sahip bypass ·
DB = migration'lı staging kopyası (Bölüm 3, 5440) · Auth = staging Supabase
(QA hesapları) · web + admin **üretim derlemesi** (`next build && next start`,
pazar yeri açık) · e-posta sahte Resend'e (`RESEND_BASE_URL`, gövdeler JSONL'de
denetlendi) · AI kapalı (maliyet yok) · cron'lar çalışır. Staging e2e paketi
(`e2e/staging-*.spec.ts`) `E2E_API_URL`/`PLAYWRIGHT_BASE_URL` ile bu yığına
yönlendirildi; yerel yığın betikleri `~/rothern-audit-2026-09-28/e2e-local/`
(`start-api.sh`, `run-e2e-local.sh`, `mock-resend.mjs`, `walk-growth.mjs`).

| Kapsam | Sonuç |
|---|---|
| Staging e2e — yönetici gerektirmeyen 21 dosya | ✅ 79 test (ilk koşuda 5 kırmızı: hepsi bayat test/ortam yapıntısı, düzeltildi — 31647de8) |
| Staging e2e — yönetici gerektiren 3 dosya (satış zinciri + ürün onayı, firma doğrulama, Destek rolü, eşzamanlılık) | ✅ 8 test (ilk koşuda 3 kırmızı: 2 ürün kusuru B6-2/B6-3 + 1 bayat test) |
| Herkese açık yollar (TR/EN/RU, ülke sayfası, sitemap, robots, llms, bilinmeyen sayfa 404) | ✅ |
| Dış talep daveti → kuyruk → dakikalık dağıtıcı → e-posta (beyaz liste: kalem var; şartname, hedef fiyat, kimlik YOK; gönderen "Firma (Rothern üzerinden)"; List-Unsubscribe + One-Click) → kayıtsız önizleme (API + tarayıcıda sayfa) → referral ziyareti → tek tık çıkış (GET yazmaz/303, POST yazar) → çıkış yapan adrese yeni davet `OPTED_OUT` | ✅ (B6-1 düzeltmesiyle) |
| Yayın sonrası AI keşif turu model OLMADAN (AI kapalı) → 3 platform üyesi `MEMBER` + gerekçe → tek tık üye daveti → 3 davet + 3 bildirim + 3 e-posta; alıcıya "3 tedarikçi bulundu" | ✅ |
| Kapanış/hatırlatma cron'ları, akşam kategori özeti | ✅ (e-posta akışları ve başlıkları doğru) |
| Dünya şehirleri (Münih önerisi), EN ülke sayfası | ✅ |

### Bölüm 6 bulguları

| # | Önem | Bulgu | Durum |
|---|---|---|---|
| B6-1 | DÜŞÜK | AI kapalıyken (anahtar yok/düşmüş) dış talep daveti hiç gelmeyecek çeviriyi 10 dk bekliyordu — kaynak dildeki (TR→TR) davet dahil (`ensureTranslated` kapalı serviste kaynak dili denetlemeden `false`) | ✅ çeviri servisi kapalıysa ilk turda özgün metin (1f8dcf85) |
| B6-2 | ORTA | **Ürünlerim** ilk 50 satırı KULLANIM sıklığıyla alıp sekmeleri istemcide süzüyordu: 50'den fazla ürünü olan firmada "Onay bekliyor (1)" boş, az önce eklenen ürün ilk sayfada yok (alfabetik ortaya düşüyor), ücretsiz tavan göstergesi kesik listeden | ✅ sekme süzgeci + "en yeni üstte" sunucuda, 50'şer sayfa "Daha fazla yükle"; `publishedInReview` sayacı (126b5042) |
| B6-3 | DÜŞÜK | Yönetici: Destek rolü firma detayında 403'te "Firma yüklenemedi" + işe yaramayan "Tekrar dene" | ✅ yetki mesajı (432495cf) |
| B6-4 (Bölüm 9) | DÜŞÜK | Tedarikçiye giden e-posta konuları "Satın Alma Talebinde teklif alımı kapandı", "sizi bir satın alma talebine davet etti" — CLAUDE.md "satış tarafına talep" kuralıyla çelişiyor; kapanış konusunda talep adı/numarası yok | Bölüm 7/9 |
| B6-5 (Bölüm 14) | bilgi | Yerel `.env` ve `render.staging.env` kopyasında staging göndereni `staging@rothern.com`; CLAUDE.md kararı `staging@supkeys.com` (rothern.com itibarı staging'den etkilenmesin) | operatör — Render panelindeki gerçek değer |

Not: e-posta içerik e2e'si (`staging-email-content`) gerçek Resend teslimatı
ölçtüğü için yerelde koşulmadı; performans e2e'si Bölüm 11'de.
