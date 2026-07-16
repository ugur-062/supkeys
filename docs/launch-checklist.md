# Rothern — Launch Checklist

Prod deploy öncesi tamamlanması gereken ödeme/plan, env ve doğrulama adımları.
Servis fail davranışları [dış servis envanteri](#dış-servis-fail-davranışı-özet)
tablosunda özetlendi — **hangi eksik sessizce geçer, hangisi app'i boot ettirmez**
ayrımı kritik.

> **En tehlikeli tek nokta:** `SENTRY_DSN`. Diğer tüm çekirdek servisler (Supabase,
> R2, Resend) env'i eksikse app **boot etmez** (fail-closed, hatayı hemen görürsün).
> Sentry ise eksikse **sessizce no-op** olur — error tracking + kritik-audit/webhook
> alarmları tümüyle pasif kalır ve sistem seni uyarmaz. Deploy'da ilk doğrula.

---

## ✅ Tamamlandı — R2 iki-bucket ayrımı (prod'da canlı doğrulandı)

İki-bucket ayrımı **tamamlandı ve prod'da canlı test edildi** (2026-07-16). KYC ve
kapalı-zarf teklif belgelerinin imzasız public ifşası (INV-STORAGE-1'in kapattığı
açık) prod ortamında fiilen kapalı. Kanıt (gerçek key ile):

| Test | Sonuç | Anlamı |
|---|---|---|
| Gerçek public logo → `cdn.rothern.com/prod/tenant-profile/…` | **200** + image/jpeg | CDN → PUBLIC bucket'a bağlı |
| Aynı gerçek private KYC key → `cdn.rothern.com/company-docs/…` | **404** | Private belge public domain'den servis edilmiyor |
| Aynı gerçek private KYC key → private S3 endpoint, **imzasız** | **400** (nesne yok) | Private bucket public değil; yalnız imzalı (presigned) erişim |

Bu üçü birlikte hem "CDN yanlış bucket'a bağlı" hem "presign baypası" senaryolarını
kesin eler. Meşru presigned URL (imzalı) ile aynı key çekilebilir.

### Kalıcı kurallar (deploy/altyapı — İHLAL = güvenlik açığı)

- **`supkeys-documents` (PRIVATE bucket):** public dev URL (`*.r2.dev`) ve custom
  domain **ASLA** açılmamalı. Yalnız presigned. Açılırsa key'i bilen herkes
  KYC/teklif/ihale/sipariş belgesini imzasız çeker.
- **`rothern-public` (PUBLIC bucket):** yalnız `{env}/tenant-profile/` prefix'i
  bulunur; custom domain (`cdn.rothern.com`) yalnız buna bağlı. Kod tarafında
  **INV-STORAGE-1** kilitliyor (`docs/invariants.md`): başka prefix public URL'e
  çevrilemez, hassas anahtar public bucket'a yazılamaz (`assertKeyBucket`).
- **Bucket adı tutarsızlığı** (`supkeys-documents` (private) vs `rothern-public`
  (public)) **bilinçli olarak bırakıldı** — kozmetik, kullanıcıya görünmüyor,
  yeniden adlandırma riskine değmez.

Ayrıntı: `docs/r2-bucket-split.md` (Cloudflare kurulum + rollback).

---

## Ödeme / plan (launch öncesi)

### Supabase (DB + Auth)

> **TETİKLEYİCİ:** İlk gerçek müşteri verisi girmeden ÖNCE, launch'tan **en az
> birkaç gün önce** yapılacak (tatbikat için marj gerekir).

1. [ ] Supabase **Pro'ya yükselt**
2. [ ] **PITR eklentisini AYRICA aç** — Pro otomatik getirmiyor, **en sık atlanan adım**
3. [ ] **Retention'ı panelde teyit et** (hedef **≥30 gün**)
4. [ ] **Restore tatbikatı:** bir backup'ı **YENİ bir projeye** geri yükle, verinin
       geldiğini gör. **Prod'a DEĞİL.** Bu yapılmadan "backup'ım var" denmez.

> **KIRMIZI ÇİZGİ:** Free planda gerçek müşteri verisiyle çalışılmaz.

### Render (API barındırma)
- [ ] Plan kontrolü — **ücretsiz tier'da servis uyur** (ilk istekte cold start
      gecikmesi); ticari kullanımda yükselt

### Vercel (web + admin barındırma)
- [ ] Plan kontrolü — **Hobby tier ticari kullanımda ToS sorunu** olabilir, Pro'ya bak

### Cloudflare R2 (dosya depolama)
- [ ] Kota / ödeme kontrolü
- [ ] **Object versioning AÇ** — Supabase PITR yalnızca DB'yi kapsar, **R2
      dosyalarını kapsamaz**; versioning yoksa silinen belge geri gelmez

### Resend (e-posta)
- [ ] Plan / limit kontrolü — **davet e-postası gitmezse müşteri sisteme giremez**
      (buyer yalnız davet linkiyle kayıt olabiliyor)

### Sentry + UptimeRobot
- Ücretsiz tier yeterli — yükseltme gereksiz.

---

## Prod env değişkenleri

| Env | Eksikse ne olur | Aksiyon |
|---|---|---|
| `SENTRY_DSN` | ⚠️ **Sessizce no-op** — error tracking + tüm alarmlar pasif, sistem uyarmaz (tek fail-open servis) | **Set et ve doğrula** |
| `R2_PUBLIC_BASE_URL` | Görseller 60 dk sonra kırılıyor (geçici presigned URL'e düşer) | Set et (custom domain veya `pub-XXXX.r2.dev`) |
| `RESEND_WEBHOOK_SECRET` | Delivery/bounce/complaint tracking yok; imzalı webhook doğrulanamaz | Set et (Resend → Webhooks → Signing Secret) |
| `ANTHROPIC_API_KEY` | AI "Hakkımızda" özelliği kapanır (heuristik fallback'e düşer) | Opsiyonel |
| `NEXT_PUBLIC_API_URL` | Frontend API'ye ulaşamaz | **Vercel build-time — şart** |
| `NEXT_PUBLIC_SITE_URL` | SEO canonical/sitemap/robots bozulur | **Vercel build-time — şart** |
| `COOKIE_SAMESITE` | ⚠️ Boşsa prod'da `none` → **CsrfGuard komple bypass, CSRF açık** | **Same-site domain'de `lax`** (aşağıdaki sıralı adım) |
| `CORS_ALLOW_VERCEL` | `true` ise **her `*.vercel.app`** credentials'lı istek atabilir (CSRF/veri sızıntısı) | Prod'da **boş/`false`**; yalnız preview/demo'da `true` |

- [ ] `SENTRY_DSN`
- [ ] `R2_PUBLIC_BASE_URL`
- [ ] `RESEND_WEBHOOK_SECRET`
- [ ] `ANTHROPIC_API_KEY` (opsiyonel)
- [ ] `NEXT_PUBLIC_API_URL` (Vercel build arg)
- [ ] `NEXT_PUBLIC_SITE_URL` (Vercel build arg)
- [ ] `COOKIE_SAMESITE` (aşağıdaki CSRF sırası)
- [ ] `CORS_ALLOW_VERCEL` prod'da kapalı

> **Not:** Supabase / R2 / Resend env'leri eksikse app **BOOT ETMEZ** (fail-closed,
> güvenli) — `onModuleInit`'te throw eder, deploy anında yakalanır.

---

## CSRF / Cookie güvenliği (KRİTİK — sıra önemli)

**Sorun:** CsrfGuard double-submit koruması fail-closed yazılmış AMA `COOKIE_SAMESITE`
boşsa prod'da `none`'a düşüyor; `none` modunda guard KOMPLE bypass oluyor
(`csrf.guard.ts:70`) → CSRF koruması yalnız CORS'a kalıyor. Bu yüzden aşağıdaki
**SIRALI BAĞIMLILIK** izlenmeli — ters sıra girişi kırar:

- [ ] **1) Custom domain'leri bağla:** API → `api.rothern.com` (Render), web →
      `app.rothern.com`, admin → `admin.rothern.com` (Vercel). Hepsi `rothern.com`
      altında = **same-site**.
- [ ] **2) DOĞRULA:** üç domain de HTTPS'te açılıyor + `NEXT_PUBLIC_API_URL=https://api.rothern.com/api`
      + `COOKIE_DOMAIN=.rothern.com` + `CORS_ORIGINS` yalnız gerçek domain'ler.
- [ ] **3) SONRA `COOKIE_SAMESITE=lax` set et** → CsrfGuard double-submit'i (header
      eksik/boş → 403) VE tarayıcı SameSite backstop'u AÇILIR. Doğrula: giriş çalışıyor +
      header'sız mutating istek 403.
- [ ] **4) `CORS_ALLOW_VERCEL` prod'da boş/`false`** (kod default false) — `*.vercel.app`
      joker origin'i kapalı kalsın.

> ⚠️ **GEÇİŞ (şimdi geçerli):** `*.vercel.app` jokeri artık VARSAYILAN KAPALI. Demo
> hâlâ `supkeys-web.vercel.app`'te olduğundan, custom domain bağlanana kadar CORS
> onu REDDEDER → frontend API'ye ulaşamaz. Çözüm (tercih sırası): **(a)** demo'nun
> tam origin'ini `CORS_ORIGINS`'e ekle (`https://supkeys-web.vercel.app` — strict,
> önerilen); **(b)** rotating preview URL'leri varsa `CORS_ALLOW_VERCEL=true`
> (TÜM vercel.app'i açar — yalnız demo/preview, prod'da ASLA).

> ⚠️ **Şu an ham provider domain'lerindeyiz** (`rothern-api.onrender.com` +
> `supkeys-web.vercel.app`) = **CROSS-SITE**. Bu topolojide `COOKIE_SAMESITE=lax`
> cookie'yi cross-site göndermez → **GİRİŞ ÇALIŞMAZ**. Sırayı (1→2→3) tamamlamadan
> `lax` set ETME.
>
> **Cross-site kalınacaksa** (custom domain bağlanmayacaksa): `none` zorunlu →
> double-submit çalışamaz → CSRF'i **strict origin/referer allowlist guard'ıyla**
> sağla (vercel-wildcard OLMADAN). Bu ayrı iş (item 4) — cross-site prod'a geçmeden
> ÖNCE yapılmalı.

---

## Netleştirilecek (deploy öncesi karar)

- [ ] **Hosting gerçekte nerede?** `render.yaml` "Render (API) + Vercel (web/admin)"
      diyor; `.env.production.example` başlığı "Coolify/Hetzner" diyor — **çelişki
      var, doğrula** ve tek doğru konfigürasyonda birleştir.
- [ ] **Ölü env temizliği:** `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
      artık kullanılmıyor (frontend'den `@supabase/supabase-js` kaldırıldı) —
      `.env.example` + `.env.production.example`'dan kaldırılabilir.

---

## Fast-follow (launch sonrası teknik borç)

- [ ] **Profil görseli değişince/kaldırılınca eski R2 nesnesini sil (best-effort).**
      Bugün silinmiyor → public bucket'ta yetim logo/kapak/galeri nesneleri birikir
      ve eski `cdn.rothern.com/{eski-key}` URL'i kalıcı erişilebilir kalır.
      logo/kapak key'i dosya adını içerdiğinden farklı ad = yeni nesne (overwrite
      garantisi yok); galeri her yüklemede `randomUUID`. Çözüm: yeni yükleme/
      `photos[]` çıkarma öncesi `deleteObject("public", eskiKey)` (best-effort) —
      ve/veya logo/kapak key'inden dosya adını çıkarıp gerçekten sabit key.
      (`company-profile.service.ts`, `storage.service.ts:buildTenantProfileKey`.)

---

## Dış servis fail davranışı (özet)

| Servis | Rolü | Eksikse |
|---|---|---|
| Supabase Postgres | Ana DB | **Fail-closed** — health `degraded`, DB istekleri patlar |
| Supabase Auth | Login/register/reset | **Fail-closed (boot)** — env eksikse app boot etmez |
| Cloudflare R2 | Dosya depolama | **Fail-closed (boot)** — env eksik/placeholder → boot etmez |
| Resend | Transactional e-posta | **Fail-closed (boot)** — `RESEND_API_KEY`/`EMAIL_FROM_ADDRESS` yoksa boot etmez |
| Resend Webhook | Delivery tracking | **Fail-closed (imza)** — secret yok+prod → 401 + Sentry error |
| **Sentry** | Error tracking + alarm | ⚠️ **Fail-open** — sessiz no-op, uyarı yok |
| TCMB | Döviz kuru | Graceful — `null` döner, son iyi kur + health `degraded` |
| Anthropic | AI "Hakkımızda" | Graceful — heuristik fallback, özellik kapanmaz |
