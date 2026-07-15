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

## Ödeme / plan (launch öncesi)

### Supabase (DB + Auth)
- [ ] Pro'ya yükselt
- [ ] **PITR eklentisini AYRICA aç** — Pro otomatik getirmiyor, ayrı add-on
- [ ] Retention süresini panelde teyit et
- [ ] Restore tatbikatı yap — **yeni projeye veya dump'a, prod'a DEĞİL** (PITR'ın
      gerçekten çalıştığını felaket anından önce doğrula)

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

- [ ] `SENTRY_DSN`
- [ ] `R2_PUBLIC_BASE_URL`
- [ ] `RESEND_WEBHOOK_SECRET`
- [ ] `ANTHROPIC_API_KEY` (opsiyonel)
- [ ] `NEXT_PUBLIC_API_URL` (Vercel build arg)
- [ ] `NEXT_PUBLIC_SITE_URL` (Vercel build arg)

> **Not:** Supabase / R2 / Resend env'leri eksikse app **BOOT ETMEZ** (fail-closed,
> güvenli) — `onModuleInit`'te throw eder, deploy anında yakalanır.

---

## Netleştirilecek (deploy öncesi karar)

- [ ] **Hosting gerçekte nerede?** `render.yaml` "Render (API) + Vercel (web/admin)"
      diyor; `.env.production.example` başlığı "Coolify/Hetzner" diyor — **çelişki
      var, doğrula** ve tek doğru konfigürasyonda birleştir.
- [ ] **Ölü env temizliği:** `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
      artık kullanılmıyor (frontend'den `@supabase/supabase-js` kaldırıldı) —
      `.env.example` + `.env.production.example`'dan kaldırılabilir.

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
