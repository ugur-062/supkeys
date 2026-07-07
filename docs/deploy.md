# Rothern — Üretim Dağıtımı (Coolify + Hetzner)

Bu repo **3 stateless container** olarak dağıtılır. Tüm stateful/yan servisler
managed'dir → sunucuda DB/Redis/S3 YOK.

| Uygulama | Dockerfile | Port | Domain |
|----------|-----------|------|--------|
| API (NestJS) | `apps/api/Dockerfile` | 4000 | `api.rothern.com` |
| Web (Next) | `apps/web/Dockerfile` | 3000 | `app.rothern.com` |
| Admin (Next) | `apps/admin/Dockerfile` | 3001 | `admin.rothern.com` |

Yan servisler (Supabase Postgres/Auth, Resend, Cloudflare R2) dışarıda kalır;
container'lar onlara env ile bağlanır.

---

## 0. Ön koşullar

- **Hetzner** sunucusu (CX22+ önerilir; API build node_modules ağırdır).
- Sunucuda **Coolify** kurulu (`https://coolify.io` tek-satır installer).
- DNS: `api` / `app` / `admin` A kayıtları sunucu IP'sine. Cloudflare kullanıyorsanız
  sertifika sorunlarını önlemek için başta **DNS-only (gri bulut)**, TLS oturunca proxy'e alın.
- Supabase/Resend/R2 hesapları hazır; `.env.production.example`'daki değerler elde.
- Repo Coolify'nin erişebildiği bir Git kaynağında (GitHub App veya deploy key).

---

## 1. Coolify projesi + 3 uygulama

Coolify → **Project** oluştur (ör. `rothern`) → içine **3 ayrı Application**, hepsi
aynı repoyu gösterir, **Build Pack = Dockerfile**:

| Application | Dockerfile yolu | Base directory | Port |
|-------------|-----------------|----------------|------|
| `rothern-api` | `apps/api/Dockerfile` | `/` (repo kökü) | 4000 |
| `rothern-web` | `apps/web/Dockerfile` | `/` | 3000 |
| `rothern-admin` | `apps/admin/Dockerfile` | `/` | 3001 |

> **Build context repo kökü olmalı** (`/`), Dockerfile app altında olsa da —
> imajlar `pnpm-lock.yaml` + tüm workspace manifest'lerine kökten erişir.

Her uygulamaya **Domain** ata (Coolify Traefik + Let's Encrypt TLS'i otomatik yönetir):
- api → `https://api.rothern.com`
- web → `https://app.rothern.com`
- admin → `https://admin.rothern.com`

**Health check path** (Coolify → Health Checks):
- api: `/api/health` (port 4000)
- web/admin: `/` (Next varsayılan 200)

---

## 2. Ortam değişkenleri

`.env.production.example`'ı referans al. Değerleri Coolify'de gir:

### `rothern-api` → **Environment Variables** (runtime)
`DIRECT_URL`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `NODE_ENV=production`,
`API_PORT=4000`, `API_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGINS`,
`COOKIE_DOMAIN=.rothern.com`, `EMAIL_*`, `RESEND_API_KEY`, `R2_*`, `SENTRY_*`,
`LOG_LEVEL`, ve İLK deploy için `RUN_SEED=true` + `INITIAL_ADMIN_*`.

### `rothern-web` / `rothern-admin` → **Build Variables (Build Args)**
> ⚠️ Bunlar **derleme zamanı** gömülür. Coolify'de "Build Variable" olarak
> işaretleyin (normal runtime env DEĞİL) yoksa `undefined` derlenir.

`NEXT_PUBLIC_API_URL=https://api.rothern.com/api`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_SITE_URL` (web→app.rothern.com, admin→admin.rothern.com).
Runtime env olarak yalnız `PORT` (web=3000, admin=3001) yeterli.

---

## 3. İlk deploy sırası

1. **`rothern-api`'yi deploy et.** Container başlarken entrypoint önce
   `prisma migrate deploy` çalıştırır (şemayı Supabase'e uygular), `RUN_SEED=true`
   ise admin'i tohumlar, sonra API'yi başlatır. Logları izle:
   `[entrypoint] prisma migrate deploy...` → `starting API on :4000`.
2. `https://api.rothern.com/api/health` → `{"status":"ok",...}` doğrula.
3. **`RUN_SEED`'i `false` yap** (veya sil) ve api'yi tekrar deploy et — seed tek seferlik.
4. **`rothern-web` + `rothern-admin`'i deploy et.** (Build args set olmalı.)
5. Uçtan uca doğrula:
   - `app.rothern.com/login` → tenant giriş → cookie `rk_company` (HttpOnly, Secure, Domain=.rothern.com)
   - `admin.rothern.com/admin/login` → `INITIAL_ADMIN_*` ile giriş
   - CSRF: mutation'da `X-CSRF-Token` (double-submit) çalışıyor mu (frontend otomatik yollar)

---

## 4. Sonraki deploy'lar / migration

- Kod push → Coolify otomatik build+deploy (webhook). Sıra: **önce api** (migration
  içerir), sonra web/admin.
- Şema değişikliği: migration `packages/db/prisma/migrations`'ta commit'li olmalı;
  api entrypoint her boot'ta `migrate deploy` ile uygular (idempotent).
- **Çoklu API replikası** kullanacaksanız migration'ı boot'tan ayırın (race önlemek
  için tek seferlik release job) — tek replikada gerek yok.

---

## 5. Lokalde imaj doğrulama (Docker olan makinede)

```bash
cp .env.production.example .env    # değerleri doldur (lokal test Supabase'i işaret edebilir)
docker compose -f docker-compose.prod.yml --env-file .env up --build
# api :4000, web :3000, admin :3001
curl -fsS http://localhost:4000/api/health
```

---

## 6. Notlar / bilinen tradeoff'lar

- **API imajı büyük (~1–1.3GB):** tek-aşamalı (build+run) + tüm workspace kurulur;
  migrate/seed için prisma CLI + tsx runtime'da tutulur. Doğrulandıktan sonra
  prod-prune'lu çok-aşamalı bir varyantla küçültülebilir (backlog).
- **Node ≥22.18 zorunlu:** `@rothern/db` ham TS export eder; derlenmiş API runtime'da
  `require` içinde TS tip-soymaya güvenir (node:22-slim karşılar). Tabanı düşürmeyin.
- **PDF/Chromium yok:** sunucu-taraflı PDF üretimi şu an kodda yok (puppeteer kaldırıldı).
  Geri geldiğinde `apps/api/Dockerfile`'a Chromium + sistem lib'leri + `PUPPETEER_EXECUTABLE_PATH`
  eklenip imaj o zaman büyütülür.
- **Cookie/CORS:** cross-subdomain oturum yalnız gerçek `*.rothern.com` + HTTPS'te tam
  çalışır (`COOKIE_DOMAIN=.rothern.com` + `NODE_ENV=production` Secure). `localhost` mekanizmayı doğrular ama domain paylaşımını değil.
- **Resend:** prod'da `EMAIL_FROM_ADDRESS` doğrulanmış domain olmalı; `onboarding@resend.dev` yalnız dev.
