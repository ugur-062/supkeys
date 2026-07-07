# Supkeys — Railway Dağıtımı (domain Cloudflare'de)

En az operasyon yolu: sunucu yönetimi yok, Railway Dockerfile'larımızı build+run eder.
DB/Auth/Storage yine managed (Supabase/Resend/R2). Domain **Cloudflare'de kalır**;
Railway'in verdiği adrese CNAME ile bağlanır.

**3 servis, tek Railway projesi**, hepsi aynı repoyu gösterir:

| Servis | Dockerfile | İç port | Custom domain |
|--------|-----------|---------|---------------|
| `api` | `apps/api/Dockerfile` | 4000 (Railway `$PORT` verir) | `api.supkeys.com` |
| `web` | `apps/web/Dockerfile` | `$PORT` | `app.supkeys.com` |
| `admin` | `apps/admin/Dockerfile` | `$PORT` | `admin.supkeys.com` |

---

## 1. Proje + 3 servis

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → `supkeys`.
2. İlk servis oluşur. **Settings → Build**:
   - **Root Directory:** `/` (repo kökü — DEĞİŞTİRME. Dockerfile'lar lockfile'ı
     kökten kopyalar; app klasörünü root yaparsan build KIRILIR.)
   - **Builder:** Dockerfile
   - Variable ekle: `RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile`
3. Servisi yeniden adlandır: `api`.
4. Aynı repodan **+ New → GitHub repo (aynı)** ile 2 servis daha ekle; her birine
   `RAILWAY_DOCKERFILE_PATH` ver: `apps/web/Dockerfile` (→ `web`),
   `apps/admin/Dockerfile` (→ `admin`). Root Directory hepsinde `/`.

---

## 2. Değişkenler (Railway → her servis → Variables)

> Railway değişkenleri **hem build hem runtime**'da görünür. Dockerfile'da `ARG`
> ile tanımlı `NEXT_PUBLIC_*`, build sırasında otomatik gömülür — ayrı "build arg"
> ayarı gerekmez, sadece değişkeni gir.

### `api` servisi
`DIRECT_URL`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `NODE_ENV=production`,
`JWT_SECRET`, `JWT_EXPIRES_IN=1h`,
`CORS_ORIGINS=https://app.supkeys.com,https://admin.supkeys.com`,
`COOKIE_DOMAIN=.supkeys.com`, `EMAIL_*`, `RESEND_API_KEY`, `R2_*`,
`SENTRY_*`, `LOG_LEVEL=info`.
İLK deploy için ayrıca: `RUN_SEED=true` + `INITIAL_ADMIN_*` (başarılı boot sonrası
`RUN_SEED`'i sil/false yap).
> `PORT`'u ELLE VERME — Railway atar; app onu okur (yoksa 4000).

### `web` servisi
`NEXT_PUBLIC_API_URL=https://api.supkeys.com/api`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL=https://app.supkeys.com`.

### `admin` servisi
`NEXT_PUBLIC_API_URL=https://api.supkeys.com/api`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL=https://admin.supkeys.com`.

Değerler için `.env.production.example`'a bak.

---

## 3. Healthcheck (Settings → Deploy → Health Check Path)

- `api`: `/api/health`
- `web` / `admin`: `/`

---

## 4. Custom domain + Cloudflare

Her servis → **Settings → Networking → Custom Domain** → alan adını gir
(`api.supkeys.com` vb.). Railway sana bir **CNAME hedefi** verir (`xxx.up.railway.app`).

Cloudflare → DNS → **CNAME** ekle:
| Type | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME | `api` | `<railway-hedefi>` | **DNS only (gri bulut)** |
| CNAME | `app` | `<railway-hedefi>` | DNS only |
| CNAME | `admin` | `<railway-hedefi>` | DNS only |

> Başta **gri bulut** (DNS only) — Railway kendi SSL'ini otomatik çıkarır. Oturunca
> istersen turuncu buluta (proxy + CDN) çevir; o zaman Cloudflare SSL modunu
> **Full (strict)** yap.

---

## 5. Deploy sırası

1. **`api`'yi deploy et.** Entrypoint önce `prisma migrate deploy` (şemayı Supabase'e
   uygular), `RUN_SEED=true` ise admin'i tohumlar, sonra API'yi başlatır.
   Deploy loglarında `[entrypoint] prisma migrate deploy...` → `starting API` gör.
2. `https://api.supkeys.com/api/health` → `{"status":"ok"}` doğrula.
3. `RUN_SEED`'i sil, `api`'yi redeploy et (seed tek seferlik).
4. **`web` + `admin`'i deploy et.**
5. Uçtan uca: `app.supkeys.com` giriş → cookie `sk_company` (Secure, Domain=.supkeys.com);
   `admin.supkeys.com/admin/login` → `INITIAL_ADMIN_*`.

Sonraki push'larda Railway otomatik build+deploy eder (önce api migration'ı uygular).

---

## 6. Tahmini maliyet

- **Railway:** 3 küçük servis 7/24 → ~**$20–30/ay** (Hobby $5 taban + kaynak kullanımı).
- **Supabase Pro:** $25/ay (canlı için; free tier 7 günde duraklar).
- **Resend:** $0 (3.000 e-posta/ay); **R2:** ~$1–5; **Cloudflare DNS:** $0.
- **Toplam:** ~**$45–60/ay** (Supabase'i free başlatırsan ~$25–35).

---

## 7. Notlar

- **Neden Root Directory `/`:** Dockerfile'lar monorepo kökünden `pnpm-lock.yaml` +
  tüm workspace manifest'lerini kopyalar. Root'u app klasörü yaparsan bağlam bozulur.
- **API imajı büyük (~1–1.3GB):** Railway build'i biraz uzun sürebilir; sorun değil.
  İleride prod-prune'lu çok-aşamayla küçültülebilir (backlog).
- **Migration çoklu replika:** Railway'de `api`'yi tek replika tut (entrypoint her
  boot'ta migrate eder). Ölçeklersen migration'ı ayrı release adımına al.
- Ayrıntılı mimari + Coolify alternatifi: `docs/deploy.md`.
