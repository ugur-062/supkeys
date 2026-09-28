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
| 1 | Derleme ve statik kapılar | ⏳ |
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
