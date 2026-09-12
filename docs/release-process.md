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

## Üretim ortam değişkeni önerisi

`COOKIE_SAMESITE=lax` — üretimde tanımlı değil, kod varsayılanı `none` ve o
modda CSRF double-submit guard baypas oluyor. `www`/`admin`/`api` aynı kayıtlı
alan adı altında olduğu için `lax` çerezleri göndermeye devam eder ve guard
geri açılır. Staging zaten `lax` koşuyor, tüm e2e paketi orada yeşil.
