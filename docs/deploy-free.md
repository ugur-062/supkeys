# Ücretsiz Yayın — Vercel (web+admin) + Render (API) + Supabase (DB)

> **GÜNCEL DURUM (2026-07-25):** Canlı yayın BU stack'te ve custom domain'lere
> taşındı: web `www.rothern.com` + admin `admin.rothern.com` (Vercel), api
> `api.rothern.com` (Render, Cloudflare proxy). Aşağıdaki ham `*.vercel.app` /
> `onrender.com` adresleri İLK kurulum adımlarıdır; canlı env/CSRF sırası için
> `docs/launch-checklist.md` esastır. (`app.rothern.com` diye bir domain YOK.)

Demo/ilk yayın için ücretsiz stack. Sıra önemli: **Supabase → Render (API) → Vercel (frontend) → CORS geri-bağla**.

## 0. Ön koşul
- GitHub repo push'lu (main).
- Hazır hesaplar: Supabase, Render, Vercel, Cloudflare (R2), Resend.

## 1. Supabase (DB + Auth) — ücretsiz
1. supabase.com → New project (region: **eu-central-1 / Frankfurt**), güçlü DB parolası.
2. Settings → Database → Connection string:
   - **DATABASE_URL** = Transaction pooler (port 6543, `?pgbouncer=true&connection_limit=1`)
   - **DIRECT_URL** = Session pooler (port 5432, `?sslmode=require`)
3. Settings → API: **SUPABASE_URL**, **SUPABASE_ANON_KEY**, **SUPABASE_SERVICE_ROLE_KEY**. (SUPABASE_JWT_SECRET kodda KULLANILMIYOR — girmeye gerek yok.)
4. Authentication → Sign In/Up: **"Allow new users to sign up" KAPAT** (kayıt yalnız API'nin admin createUser'ı ile; anon key + GoTrue `/signup` yetim auth.users üretmesin) + Rate Limits sıkılaştır.

## 2. API → Render (Docker, free)
1. render.com → New → **Blueprint** → bu repo'yu bağla → `render.yaml` okunur, `rothern-api` servisi oluşur.
2. Servis → Environment → `sync:false` işaretli env'leri doldur:
   - DB: DATABASE_URL, DIRECT_URL
   - JWT_SECRET (min 32 rastgele), SUPABASE_* (4 anahtar)
   - R2_*: Cloudflare R2 (bkt oluştur, S3 API token al) — 6 anahtar
   - RESEND_API_KEY (+ EMAIL_FROM_ADDRESS: aşama 5'te doğrulanmış domain)
   - INITIAL_ADMIN_EMAIL + INITIAL_ADMIN_PASSWORD (≥12 karakter)
   - CORS_ORIGINS / WEB_URL / ADMIN_URL: **şimdilik boş bırak** (aşama 4'te doldurulacak)
3. Deploy → entrypoint otomatik `migrate:deploy` + (RUN_SEED=true) admin tohumu çalıştırır.
4. API URL'ini not al: `https://rothern-api-xxxx.onrender.com`. Sağlık: `.../api/health`.
5. Tohumlama bitince **RUN_SEED=false** yapıp yeniden deploy et.

## 3. Web + Admin → Vercel (native Next.js, free)
Her app için AYRI Vercel projesi (aynı repo):
1. Add New → Project → repo → **Root Directory: `apps/web`** (admin için `apps/admin`).
2. Environment Variables (build-time gömülür):
   ```
   NEXT_PUBLIC_API_URL      = https://rothern-api-xxxx.onrender.com/api
   NEXT_PUBLIC_SITE_URL     = https://<bu-vercel-domaini>
   # NEXT_PUBLIC_SUPABASE_* GEREKMEZ: web/admin Supabase'e doğrudan bağlanmaz (2026-07-15'te kaldırıldı);
   # anon key yalnız API env'inde kalır (sır sınıfı).
   ```
3. Deploy → Vercel domain'ini not al (web + admin ayrı).

## 4. CORS geri-bağla (kritik)
Render → rothern-api → Environment:
- **CORS_ORIGINS** = `https://<web>.vercel.app,https://<admin>.vercel.app`
- **WEB_URL** = `https://<web>.vercel.app` **(ŞART — tüm e-posta linkleri
  buna bakar; yoksa şifre sıfırlama/davet/bildirim linkleri `localhost:3000`'e
  işaret eder)**
- **ADMIN_URL** = `https://<admin>.vercel.app`
→ Yeniden deploy. (REST/WS/R2 CORS'u `*.vercel.app`'i otomatik izinli sayar;
CORS_ORIGINS yine de doldurulmalı — custom domain'e geçince tek kaynak o.)

### Env doğrulama checklist'i (cross-domain tuzakları)
- **`NODE_ENV=production`** set mi? (Render otomatik VERMEZ.) Cookie
  `Secure/SameSite=None`, CSRF modu ve R2 `prod/` prefix'i buna bakar —
  yoksa cross-domain'de login çalışmaz.
- **`COOKIE_SAMESITE=lax` + `COOKIE_DOMAIN=.rothern.com` ZORUNLU** (custom-domain
  same-site kurulum). 2026-07-19'dan beri boot guard'lı: `assertProdConfigSanity`
  prod'da `none`/unset'i VE `COOKIE_DOMAIN`'siz `lax`'ı REDDEDER → deploy fail.
  (Eski cross-site fazının "SameSite=None + COOKIE_DOMAIN girme" tavsiyesi artık
  GEÇERSİZ ve boot'u kırar; ham `*.vercel.app` adresleriyle deneme yapılacaksa
  `NODE_ENV=production` kullanma.)
- Doğrulama: login yanıtının `Set-Cookie` header'ında
  `rk_company=...; HttpOnly; Secure; SameSite=Lax; Domain=.rothern.com` görülmeli.

## 5. Resend domain (gerçek e-posta için)
- resend.com → Domains → domain ekle + SPF/DKIM/DMARC doğrula.
- **EMAIL_FROM_ADDRESS** = `noreply@<domainin>` (Render env). Doğrulanana kadar mail yalnız hesap sahibine gider.
- Webhook (opsiyonel): `https://rothern-api-xxxx.onrender.com/api/webhooks/resend` + RESEND_WEBHOOK_SECRET.

## Bilinen sınırlar (demo kabul)
- **Render free uyur** (15 dk hareketsizlik): ilk istek ~30sn cold-start; in-process cron (kur/reminder) uykuda çalışmaz.
- **B-H1:** R2 `r2.dev` public erişimini kapat / hassas belgeler private bucket (denetim notu).
