# Sürüm süreci — staging → production (2026-09-11)

## Ortamlar

| Katman | Staging | Production |
|---|---|---|
| Git dalı | `main` | `production` |
| API | Render `api-staging` (Free) → `api.staging.rothern.com` | Render `api` (Starter) → `api.rothern.com` |
| Web / Admin | Vercel Preview (`main`) → `staging.rothern.com`, `admin.staging.rothern.com` | Vercel Production (`production`) → `www.rothern.com`, `admin.rothern.com` |
| Veritabanı + Auth | Supabase `rothern-staging` (Free) | Supabase canlı (Pro) |
| Dosya | R2 `rothern-staging` → `cdn.staging.rothern.com` | R2 canlı → `cdn.rothern.com` |
| E-posta | Resend, `staging@rothern.com` | Resend, canlı gönderen |
| Çerez alanı | `.staging.rothern.com` | `.rothern.com` |

Yerel geliştirme (`.env`) **staging**'e bağlıdır. Canlı değerler `.env.prod.local`'da
(gitignore'lu) yalnız onaylı migration için kullanılır.

## Akış

1. Dal aç → kod → yerel testler.
2. PR → `main`: GitHub Actions (`test.yml`) API + web + admin suite'leri, typecheck,
   lint, şema drift kapısı ve build koşar. Kırmızıysa birleşmez.
3. `main`'e birleşince Render `api-staging` ve Vercel Preview kendiliğinden kurar;
   migration staging'de konteyner açılışında (`docker-entrypoint.sh`) uygulanır.
4. Staging'de doğrulama: rol hesaplarıyla manuel tur (`seed-staging-roles`) ve
   Playwright akışları.
5. Canlıya çıkış: `main` → `production` birleştirme (PR). Migration varsa ÖNCE
   canlıya koşulur:
   `DATABASE_URL=<prod> DIRECT_URL=<prod> ALLOW_REMOTE_MIGRATION=1 pnpm --filter @rothern/db migrate:deploy`
   (`.env.prod.local` değerleriyle; nöbetçi uzak hedefi açıkça onaylatır).
   API'ye parametre ekleyen değişiklikte API önce.
6. Geri alma: Render / Vercel'de önceki dağıtıma dön. Migration'lar yalnız
   EKLEYİCİ (kolon silme sonraki sürüme) — `docs/migration-safety.md`.

## Kurallar

- `production` dalına doğrudan push YOK; yalnız `main`'den PR (GitHub branch
  protection: "Test (api + typecheck)" zorunlu, güncel dal şartı).
- Canlıya çıkmadan önce Supabase yedeğinin son 24 saat içinde alındığını doğrula.
- Riskli özellik anahtarla (`MARKETPLACE_LIVE` kalıbı): kod çıkar, anahtar staging'de
  doğrulanınca açılır.
- Haftada bir toplu sürüm; acil düzeltme aynı akıştan, beklemeden.

## Staging verisi

- Rol hesapları: `pnpm --filter @rothern/db seed-staging-roles`
  (`uguray156+qa-<slug>@gmail.com`; parola `STAGING_QA_PASSWORD` ya da varsayılan).
  Hesaplar: alıcı GOLD/doğrulanmış (kurucu, yönetici, satın almacı, satışçı,
  onaylayıcı, görüntüleyici) · tedarikçi SILVER/doğrulanmış (kurucu, satışçı,
  görüntüleyici) · ücretsiz STANDART/doğrulanmamış (kurucu). Alıcı ↔ tedarikçi bağlı.
- Kategori kataloğu: `seed-categories` → `apply-category-translations` →
  `apply-category-keywords` → `seed-category-attributes` (CLAUDE.md sırası).
- Demo vitrin: `seed-marketplace-demo`.
- Canlıdan veri KOPYALANMAZ (KVKK).

## Render api-staging ortamı

Değişken listesi `render.yaml` ile aynı; staging'e özel değerler gitignore'lu
`render.staging.env` dosyasında (repo kökü, yalnız yerel). Sırlar yenilenince
Render'da elle güncellenir.


## Gecelik e2e için GitHub sırları (2026-09-12)

`.github/workflows/e2e-staging.yml` her gece 04:00'te staging'e karşı koşar ve
gecelik koşumda Safari motorunu da ekler. Depo → Settings → Secrets and
variables → Actions altına şunlar girilmeli (hepsi `.env.staging` ve
`render.staging.env` içinde zaten var):

| Sır | Kaynak |
|---|---|
| `STAGING_VERCEL_BYPASS_WEB` | `.env.staging` |
| `STAGING_VERCEL_BYPASS_ADMIN` | `.env.staging` |
| `STAGING_QA_PASSWORD` | QA hesap parolası (`seed-staging-roles`) |
| `STAGING_ADMIN_PASSWORD` | `render.staging.env` `INITIAL_ADMIN_PASSWORD` |
| `STAGING_DATABASE_URL` | `.env.staging` (kayıt turu kodu okur, temizlik yapar) |
| `STAGING_SUPABASE_URL` | `.env.staging` |
| `STAGING_SUPABASE_SERVICE_ROLE_KEY` | `.env.staging` |

Sır yoksa iş **kırmızı biter** (sessizce yeşil görünmesin diye ilk adım kontrol
eder). Elle tetiklemek için: Actions → E2E (staging) → Run workflow.

## Üretim ortam değişkenleri — doğrulanmış durum (2026-09-12)

Bu bölüm daha önce `COOKIE_SAMESITE=lax`'ı "üretimde tanımlı değil, öneri"
diye anlatıyordu; GÜNCEL DEĞİLDİ. Render `rothern-api` ortamında doğrulandı:

| Değişken | Değer | Durum |
| --- | --- | --- |
| `COOKIE_SAMESITE` | `lax` | tanımlı |
| `COOKIE_DOMAIN` | `.rothern.com` | tanımlı |
| `SENTRY_DSN` | dolu | tanımlı |

Yani CSRF double-submit guard üretimde AÇIK. `staging-csrf.spec.ts:53`
("oturum var ama CSRF başlığı yok → mutasyon reddedilir") bu duruşu her
gecelik koşumda sınar.

Bu ikisi bir ÇİFTTİR, tek başına değiştirilmez: `lax` iken `COOKIE_DOMAIN`
boş kalırsa çerezler `api.rothern.com`'a host-only yazılır, `www` üzerindeki
JS `rk_csrf`'i okuyamaz, `X-CSRF-Token` boş gider ve TÜM mutasyonlar 403
döner — giriş çalışmaya devam ettiği için sessiz kırılmadır.
`apps/api/src/common/config/prod-config-sanity.ts` bu kombinasyonu boot'ta
fail-closed yakalar (`main.ts:89`), yani hatalı ENV ile deploy AYAĞA KALKMAZ.

### Açık bulgular (2026-09-12)

- **Vercel'de Sentry yok.** `supkeys-web` ve `supkeys-admin` projelerinin
  hiçbirinde `SENTRY_DSN` ya da `NEXT_PUBLIC_SENTRY_DSN` tanımlı değil.
  `instrumentation.ts` DSN yoksa `return` ediyor → ön yüz hata izleme KOMPLE
  no-op; istemci hataları yalnız `console.error`'a düşüyor
  (`api/client-error/route.ts`). API tarafı etkilenmiyor, orada DSN dolu.
- **Render planı sapması.** `render.yaml` `plan: starter` diyor ama
  `rothern-api` dashboard'da **Free** ($0, 0.1 CPU, 512 MB). Free örnek
  boşta uyur → ilk istek 30-60 sn. Blueprint ile dashboard ayrışmış.
