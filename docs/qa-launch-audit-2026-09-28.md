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
| 2 | Otomatik testler | ⏳ |
| 3 | Veritabanı ve migration'lar | ⏳ |
| 4 | Yetki ve firma yalıtımı | ⏳ |
| 5 | Uygulama güvenliği | ⏳ |
| 6 | Çekirdek akışlar uçtan uca | ⏳ |
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

(Kanıt: iki veritabanında `_prisma_migrations` salt-okunur sorgusu.)
Bekleyen 9 migration'ın hepsi YEREL commit'lerde → staging de onları push
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

## Bölüm 2 — Otomatik testler (⏳ API entegrasyon paketi Docker bekliyor)

| Paket | Sonuç | Not |
|---|---|---|
| Web (vitest) — TZ=UTC | 175 dosya / 1.039 test; ilk koşumda 17 kırmızı → tek başına yeniden koşumda **1 gerçek hata** (aşağıda B2-1, düzeltildi), 16'sı yük kaynaklı 15 sn zaman aşımı | admin testleriyle eşzamanlı koşuldu |
| Web (vitest) — TZ=Europe/Istanbul | 174/175 dosya, 1.038/1.039 — tek kırmızı `signup-client` zaman aşımı; tek başına 3/3 yeşil, test 1,7 sn | makine yükü (WSL 6,7 GB) |
| Admin (vitest) | ✅ 19 dosya / 98 test | |
| i18n | ✅ 8 dosya / 39 test | |
| API birim (`test/unit`, DB'siz) | ✅ 96 dosya / 976 test | `--globalSetup` boş |
| API entegrasyon (`test/integration`, 137 dosya) | ⏳ | yerel test Postgres'i Docker ister — Docker Desktop çöktü |

### Bölüm 2 bulguları

| # | Önem | Bulgu | Durum |
|---|---|---|---|
| B2-1 | YÜKSEK | `lib/tenders/__tests__/request-defaults.test.ts` tarihi ofsetsiz kuruyordu (`new Date("2026-09-09T10:00:00")`); kod İstanbul duvar saatiyle yazdığı için **UTC'de kırmızı** → CI çalıştırıcısı UTC olduğundan `production` PR'ı kırmızı olurdu | ✅ `+03:00` ofset; UTC / İstanbul / New York'ta yeşil (b4079ecb) |
| B2-2 | DÜŞÜK | Web paketi bu makinede tam paralel koşumda 15 sn zaman aşımına düşüyor (formlu testler) | bilinen; CI'da sorun yok |
